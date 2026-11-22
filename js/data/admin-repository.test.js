// Every read of the admin console is bounded: it names its columns, has a limit or a range, and
// never asks for a whole table. The Supabase client is replaced by a recorder.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = [];
let answer = { data: [], error: null, count: null };

function builder(table) {
  const call = { table, steps: [] };
  calls.push(call);
  const chain = new Proxy({}, {
    get(_, name) {
      if (name === 'then') return (resolve) => resolve(answer);
      return (...args) => { call.steps.push([name, ...args]); return chain; };
    },
  });
  return chain;
}

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: (table) => builder(table) },
  getUser: () => ({ id: 'me' }),
}));

const { LIMITS, adminStatus, deleteOldLogs, fetchErrorCounts, fetchGenerationJobs, fetchLogFacts, fetchLogs, fetchPeople, fetchTrips, isAdmin, updateUserRole } = await import('./admin-repository.js');

const step = (call, name) => call.steps.find(([n]) => n === name);
const NOW = Date.parse('2027-03-10T08:00:00Z');

beforeEach(() => {
  calls.length = 0;
  answer = { data: [], error: null, count: null };
});

describe('bounded reads', () => {
  it('reads people and trips with named columns, a limit and the total', async () => {
    answer = { data: [{ id: 'a' }], error: null, count: 4210 };
    const people = await fetchPeople();
    const trips = await fetchTrips();
    expect(people).toEqual({ data: [{ id: 'a' }], total: 4210, error: null });
    expect(trips.total).toBe(4210);
    for (const call of calls) {
      const [, columns, options] = step(call, 'select');
      expect(columns).not.toContain('*');
      expect(options).toEqual({ count: 'exact' });
      expect(step(call, 'limit')).toEqual(['limit', 1000]);
    }
    expect(step(calls[1], 'select')[1]).not.toContain('wizard_state');
  });

  it('falls back to the number of rows when the total is not given', async () => {
    answer = { data: [{}, {}], error: null, count: null };
    expect((await fetchPeople()).total).toBe(2);
  });

  it('reads jobs and log facts inside a window of days, light columns only', async () => {
    await fetchGenerationJobs({ now: NOW });
    await fetchLogFacts({ now: NOW });
    expect(step(calls[0], 'select')[1]).not.toMatch(/wizard_state|result_/);
    expect(step(calls[0], 'gte')).toEqual(['gte', 'created_at', '2027-02-08T08:00:00.000Z']);
    expect(step(calls[0], 'limit')).toEqual(['limit', LIMITS.jobs]);
    expect(step(calls[1], 'select')[1]).not.toMatch(/message|metadata/);
    expect(step(calls[1], 'gte')).toEqual(['gte', 'created_at', '2027-03-03T08:00:00.000Z']);
    expect(step(calls[1], 'limit')).toEqual(['limit', LIMITS.facts]);
  });

  it('says when the log sample was cut', async () => {
    answer = { data: Array.from({ length: 3 }, () => ({})), error: null };
    expect((await fetchLogFacts({ limit: 3, now: NOW })).truncated).toBe(true);
    expect((await fetchLogFacts({ limit: 4, now: NOW })).truncated).toBe(false);
  });

  it('counts errors with head requests and gives null when a count is missing', async () => {
    answer = { data: null, error: null, count: 7 };
    expect(await fetchErrorCounts({ now: NOW })).toEqual({ day: 7, dayBefore: 7, week: 7, weekBefore: 7 });
    expect(calls).toHaveLength(4);
    for (const call of calls) expect(step(call, 'select')).toEqual(['select', 'id', { count: 'exact', head: true }]);
    answer = { data: null, error: null, count: null };
    expect(await fetchErrorCounts({ now: NOW })).toBeNull();
  });

  it('pages the logs, filters them and makes the search term safe', async () => {
    answer = { data: [{ id: 'l' }], error: null, count: 90 };
    const page = await fetchLogs({ level: 'error', category: 'all', source: 'edge', q: ' 50%_off,(x) ', offset: 50 });
    expect(page).toEqual({ data: [{ id: 'l' }], error: null, count: 90 });
    const [call] = calls;
    expect(step(call, 'select')[1]).not.toContain('*');
    expect(step(call, 'range')).toEqual(['range', 50, 99]);
    expect(call.steps.filter(([n]) => n === 'eq')).toEqual([['eq', 'level', 'error'], ['eq', 'source', 'edge']]);
    expect(step(call, 'ilike')).toEqual(['ilike', 'message', '%50 off x%']);
  });

  it('never asks for more than 200 log lines at once', async () => {
    await fetchLogs({ limit: 100000 });
    expect(step(calls[0], 'range')).toEqual(['range', 0, 199]);
    expect(step(calls[0], 'ilike')).toBeUndefined();
  });
});

describe('the admin check and the writes', () => {
  it('tells an admin from a user and from an answer that could not be read', async () => {
    answer = { data: { role: 'admin' }, error: null };
    expect(await adminStatus()).toBe('admin');
    expect(await isAdmin()).toBe(true);
    answer = { data: { role: 'user' }, error: null };
    expect(await adminStatus()).toBe('user');
    answer = { data: null, error: { message: 'Failed to fetch' } };
    expect(await adminStatus()).toBe('unknown');
    expect(await isAdmin()).toBe(false);
  });

  it('refuses a role that is not user or admin without a request', async () => {
    expect(await updateUserRole('p', 'owner')).toEqual({ error: 'Invalid role' });
    expect(calls).toHaveLength(0);
    expect(await updateUserRole('p', 'admin')).toEqual({ error: null });
    expect(step(calls[0], 'update')).toEqual(['update', { role: 'admin' }]);
    expect(step(calls[0], 'eq')).toEqual(['eq', 'id', 'p']);
  });

  it('deletes old logs by date only', async () => {
    await deleteOldLogs(90);
    expect(calls[0].table).toBe('app_logs');
    expect(step(calls[0], 'delete')).toBeTruthy();
    expect(step(calls[0], 'lt')[1]).toBe('created_at');
  });
});

describe('countAdmins', () => {
  it('counts the admins with a head request and gives null when the count cannot be read', async () => {
    const { countAdmins } = await import('./admin-repository.js');
    answer = { data: null, error: null, count: 2 };
    expect(await countAdmins()).toBe(2);
    expect(calls[0].table).toBe('profiles');
    expect(step(calls[0], 'select')).toEqual(['select', 'id', { count: 'exact', head: true }]);
    expect(step(calls[0], 'eq')).toEqual(['eq', 'role', 'admin']);
    answer = { data: null, error: { message: 'offline' }, count: null };
    expect(await countAdmins()).toBeNull();
  });
});
