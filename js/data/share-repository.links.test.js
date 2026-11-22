// Making a share link: a working link is reused, an expired one is deleted and replaced.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ calls: [], answers: [] }));

/** A query that records every step and resolves with the next queued answer. */
function query(table) {
  const steps = [table];
  const chain = new Proxy({}, {
    get: (_t, name) => {
      if (name === 'then') return (resolve) => { h.calls.push(steps); resolve(h.answers.shift() ?? { data: null, error: null }); };
      return (...args) => { steps.push([name, ...args]); return chain; };
    },
  });
  return chain;
}

vi.mock('../lib/supabase.js', () => ({ supabase: { from: (table) => query(table) }, getUser: () => ({ id: 'user-1' }) }));
vi.mock('../lib/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { createShareLink, getShareForTrip } = await import('./share-repository.js');
const verbs = () => h.calls.map((steps) => steps.find((step) => Array.isArray(step) && ['select', 'insert', 'delete'].includes(step[0]))[0]);
const live = { id: 's1', share_token: 'a'.repeat(32), expires_at: new Date(Date.now() + 86400000).toISOString() };
const dead = { id: 's0', share_token: 'b'.repeat(32), expires_at: new Date(Date.now() - 1000).toISOString() };

beforeEach(() => { h.calls = []; h.answers = []; });

describe('createShareLink', () => {
  it('hands back the link that still works', async () => {
    h.answers = [{ data: live, error: null }];
    expect(await createShareLink('t1')).toEqual({ data: live, error: null });
    expect(verbs()).toEqual(['select']);
  });
  it('deletes an expired link, then makes a new one with only the trip and the user (the server sets the dates)', async () => {
    h.answers = [{ data: dead, error: null }, { error: null }, { data: live, error: null }];
    expect(await createShareLink('t1')).toEqual({ data: live, error: null });
    expect(verbs()).toEqual(['select', 'delete', 'insert']);
    const removal = h.calls[1];
    expect(removal).toContainEqual(['eq', 'trip_id', 't1']);
    expect(removal).toContainEqual(['eq', 'created_by', 'user-1']);
    expect(removal.some((step) => step[0] === 'lt' && step[1] === 'expires_at')).toBe(true);
    expect(h.calls[2]).toContainEqual(['insert', { trip_id: 't1', created_by: 'user-1' }]);
  });
  it('makes no new link when the expired one cannot be deleted', async () => {
    h.answers = [{ data: dead, error: null }, { error: { message: 'denied' } }];
    expect(await createShareLink('t1')).toEqual({ data: null, error: 'denied' });
    expect(verbs()).toEqual(['select', 'delete']);
  });
});

describe('before migration 023 (no expires_at column)', () => {
  const old = { id: 's1', share_token: 'a'.repeat(32) };
  it('reads the link without the date', async () => {
    h.answers = [{ data: null, error: { code: '42703', message: 'column trip_shares.expires_at does not exist' } }, { data: old, error: null }];
    expect(await getShareForTrip('t1')).toEqual({ data: old, error: null });
    expect(h.calls[1].find((step) => step[0] === 'select')[1]).not.toContain('expires_at');
  });
});
