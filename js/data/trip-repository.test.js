import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny stand-in for the supabase client: every query chain is recorded and
// answered by `respond(call)`, which tests replace per case.
const fake = vi.hoisted(() => {
  const state = { user: { id: 'u1', email: 'Me@Example.com' }, calls: [], respond: () => ({ data: null, error: null }) };
  function builder(table) {
    const call = { table, ops: [] };
    const chain = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          state.calls.push(call);
          const result = Promise.resolve().then(() => state.respond(call));
          return result.then.bind(result);
        }
        return (...args) => { call.ops.push([prop, ...args]); return chain; };
      },
    });
    return chain;
  }
  state.client = { from: (table) => builder(table) };
  return state;
});

vi.mock('../lib/supabase.js', () => ({
  supabase: fake.client,
  getUser: () => fake.user,
}));
vi.mock('../lib/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../lib/locale.js', () => ({ formatCityList: (names) => names.join(', ') }));

const repo = await import('./trip-repository.js');

function memoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
}

const op = (call, name) => call.ops.find(([n]) => n === name);
const isInsert = (table) => (call) => call.table === table && op(call, 'insert');

beforeEach(() => {
  fake.user = { id: 'u1', email: 'Me@Example.com' };
  fake.calls = [];
  fake.respond = () => ({ data: null, error: null });
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('navigator', { onLine: true });
});

describe('sortDayActivities', () => {
  const sortTitles = (acts) => repo.sortDayActivities(acts).map(a => a.title);

  it('orders timed activities by time and keeps untimed ones after the timed one listed before them', () => {
    const acts = [
      { title: 'Breakfast', start_time: '08:00', sort_order: 0 },
      { title: 'Museum', start_time: '', sort_order: 1 },
      { title: 'Lunch', start_time: '12:30', sort_order: 2 },
      { title: 'Walk', start_time: '', sort_order: 3 },
      { title: 'Coffee', start_time: '10:00', sort_order: 4 },
    ];
    expect(sortTitles(acts)).toEqual(['Breakfast', 'Museum', 'Coffee', 'Lunch', 'Walk']);
  });

  it('keeps the listed order for imported activities with a time slot but no time', () => {
    const acts = [
      { title: 'Morning walk', start_time: '', time_slot: 'morning', sort_order: 0 },
      { title: 'Lunch', start_time: '12:30', time_slot: 'afternoon', sort_order: 1 },
      { title: 'Museum', start_time: '', time_slot: 'afternoon', sort_order: 2 },
      { title: 'Dinner', start_time: '19:30', time_slot: 'evening', sort_order: 3 },
    ];
    expect(sortTitles(acts)).toEqual(['Morning walk', 'Lunch', 'Museum', 'Dinner']);
    expect(sortTitles([...acts].reverse())).toEqual(['Morning walk', 'Lunch', 'Museum', 'Dinner']);
  });

  it('starts an untimed activity with nothing timed before it at its time slot', () => {
    const acts = [
      { title: 'Show', start_time: '', time_slot: 'evening', sort_order: 0 },
      { title: 'Gallery', start_time: '', time_slot: 'afternoon', sort_order: 1 },
      { title: 'Breakfast', start_time: '09:00', time_slot: 'morning', sort_order: 2 },
    ];
    expect(sortTitles(acts)).toEqual(['Breakfast', 'Gallery', 'Show']);
  });

  it('returns a new array and copes with a missing list', () => {
    const acts = [{ title: 'B', start_time: '10:00', sort_order: 0 }, { title: 'A', start_time: '09:00', sort_order: 1 }];
    const sorted = repo.sortDayActivities(acts);
    expect(sorted).not.toBe(acts);
    expect(acts.map(a => a.title)).toEqual(['B', 'A']);
    expect(repo.sortDayActivities(undefined)).toEqual([]);
  });

  it('treats H:MM like HH:MM', () => {
    const acts = [
      { title: 'Ten', start_time: '10:00', sort_order: 0 },
      { title: 'Nine', start_time: '9:00', sort_order: 1 },
    ];
    expect(sortTitles(acts)).toEqual(['Nine', 'Ten']);
  });

  it('breaks equal times by sort_order', () => {
    const acts = [
      { title: 'B', start_time: '09:00', sort_order: 5 },
      { title: 'A', start_time: '9:00', sort_order: 1 },
    ];
    expect(sortTitles(acts)).toEqual(['A', 'B']);
  });

  it('gives the same order whatever the input order (transitive)', () => {
    const acts = [
      { title: 'a', start_time: '08:00', sort_order: 0 },
      { title: 'b', start_time: '', sort_order: 1 },
      { title: 'c', start_time: '12:30', sort_order: 2 },
      { title: 'd', start_time: '', sort_order: 3 },
      { title: 'e', start_time: '10:00', sort_order: 4 },
      { title: 'f', start_time: '7:45 pm', sort_order: 999 },
    ];
    const expected = sortTitles(acts);
    for (let i = 0; i < 20; i++) {
      const shuffled = [...acts].sort(() => Math.random() - 0.5);
      expect(sortTitles(shuffled)).toEqual(expected);
    }
    expect(expected).toEqual(['a', 'b', 'e', 'c', 'd', 'f']);
  });
});

describe('normStartTime', () => {
  it('zero-pads times and converts am/pm', () => {
    expect(repo.normStartTime('9:05')).toBe('09:05');
    expect(repo.normStartTime(' 14:30 ')).toBe('14:30');
    expect(repo.normStartTime('7:15 PM')).toBe('19:15');
    expect(repo.normStartTime('12:00 am')).toBe('00:00');
  });
  it('keeps anything that is not just a time', () => {
    expect(repo.normStartTime('')).toBe('');
    expect(repo.normStartTime(undefined)).toBe('');
    expect(repo.normStartTime('Sunset')).toBe('Sunset');
    expect(repo.normStartTime('09:00-10:00')).toBe('09:00-10:00');
    expect(repo.normStartTime('25:00')).toBe('25:00');
  });
});

describe('import row builders', () => {
  it('keeps ISO dates as written and formats other dates without a timezone shift', () => {
    expect(repo.toDbDate('2026-05-25')).toBe('2026-05-25');
    expect(repo.toDbDate('2026-05-25T23:30:00+08:00')).toBe('2026-05-25');
    expect(repo.toDbDate('25 May 2026')).toBe('2026-05-25');
    expect(repo.toDbDate('not a date')).toBeNull();
    expect(repo.toDbDate('')).toBeNull();
  });

  it('renumbers days when day numbers are missing, duplicated or invalid', () => {
    expect(repo.normalizeDays([{ dayNumber: 1 }, { dayNumber: 2 }]).map(d => d.dayNumber)).toEqual([1, 2]);
    expect(repo.normalizeDays([{ dayNumber: 1 }, { dayNumber: 1 }]).map(d => d.dayNumber)).toEqual([1, 2]);
    expect(repo.normalizeDays([{ day: 'x' }, {}]).map(d => d.dayNumber)).toEqual([1, 2]);
    expect(repo.normalizeDays(undefined)).toEqual([]);
  });

  it('links activities to their day ids and keeps the listed order', () => {
    const days = repo.normalizeDays([
      { dayNumber: 1, activities: [{ title: 'A', startTime: '9:00' }, { title: 'B' }] },
      { dayNumber: 2, activities: [{ title: 'C', costAmount: 12.6, costCurrency: 'JPY' }] },
    ]);
    const rows = repo.buildActivityRows(days, new Map([[1, 'd1'], [2, 'd2']]), 'AUD');
    expect(rows.map(r => [r.day_id, r.title, r.sort_order])).toEqual([['d1', 'A', 0], ['d1', 'B', 1], ['d2', 'C', 0]]);
    expect(rows[0].start_time).toBe('09:00');
    expect(rows[0].cost_currency).toBe('AUD');
    expect(rows[2]).toMatchObject({ cost_amount: 13, cost_currency: 'JPY' });
  });

  it('returns null when a day id is missing', () => {
    const days = repo.normalizeDays([{ dayNumber: 1, activities: [{ title: 'A' }] }]);
    expect(repo.buildActivityRows(days, new Map(), 'USD')).toBeNull();
  });

  it('takes currency from the first destination of a multi-city trip and marks the import pending', () => {
    const ws = {
      multiCity: true,
      destinations: [{ name: 'Tokyo', currencyCode: 'JPY', currencySymbol: '¥', emoji: 'x' }, { name: 'Kyoto' }],
      dates: { start: '2026-05-01', end: '2026-05-05' },
      budget: { dailyAmount: 100 },
    };
    const row = repo.buildImportTripRow('u1', ws, { flights: [{ from: 'SIN' }] });
    expect(row).toMatchObject({ title: 'Tokyo to Kyoto', budget_currency: 'JPY', status: 'planning' });
    expect(row.extras).toEqual({ flights: [{ from: 'SIN' }], importPending: true });
  });
});

describe('saveTripWithItinerary', () => {
  const wizardState = { destination: { name: 'Melbourne', currencyCode: 'AUD', currencySymbol: '$' }, dates: { start: '2026-05-25', end: '2026-05-27' }, budget: { dailyAmount: 200 } };
  const itinerary = (dayCount) => ({
    tripTitle: 'Melbourne',
    accommodation: [{ name: 'Hotel' }],
    days: Array.from({ length: dayCount }, (_, i) => ({ dayNumber: i + 1, activities: [{ title: `A${i}` }, { title: `B${i}` }] })),
  });

  function happyPath(call) {
    if (isInsert('trips')(call)) return { data: { id: 't1', title: 'Melbourne', extras: { importPending: true } }, error: null };
    if (isInsert('itinerary_days')(call)) return { data: op(call, 'insert')[1].map((d, i) => ({ id: `d${i + 1}`, day_number: d.day_number })), error: null };
    return { data: null, error: null };
  }

  it('saves any number of days in 4 requests and reports progress', async () => {
    fake.respond = happyPath;
    const progress = [];
    const { data, error } = await repo.saveTripWithItinerary(wizardState, itinerary(14), { onProgress: p => progress.push(p) });
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: 't1', title: 'Melbourne', status: 'generated' });
    expect(data.extras).toEqual({ accommodation: [{ name: 'Hotel' }] });
    expect(fake.calls.map(c => c.table)).toEqual(['trips', 'itinerary_days', 'activities', 'trips']);
    expect(op(fake.calls[1], 'insert')[1]).toHaveLength(14);
    expect(op(fake.calls[2], 'insert')[1]).toHaveLength(28);
    expect(op(fake.calls[3], 'update')[1]).toEqual({ status: 'generated', extras: { accommodation: [{ name: 'Hotel' }] } });
    expect(progress.map(p => [p.step, p.total])).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
    expect(progress.map(p => p.label).join(' ')).not.toMatch(/[\u2014\u2013\u00B7\u2022]/);
  });

  it('deletes the trip and returns a user-safe error when the activities insert fails', async () => {
    fake.respond = (call) => {
      if (isInsert('activities')(call)) return { data: null, error: { message: 'violates check constraint "activities_time_slot_check"', code: '23514' } };
      return happyPath(call);
    };
    const { data, error } = await repo.saveTripWithItinerary(wizardState, itinerary(3));
    expect(data).toBeNull();
    expect(error).not.toMatch(/constraint|activities_|23514/);
    const last = fake.calls[fake.calls.length - 1];
    expect(last.table).toBe('trips');
    expect(op(last, 'delete')).toBeTruthy();
    expect(op(last, 'eq')).toEqual(['eq', 'id', 't1']);
  });

  it('rolls back when the day insert fails, without trying the activities', async () => {
    fake.respond = (call) => (isInsert('itinerary_days')(call)
      ? { data: null, error: { message: 'duplicate key value violates unique constraint' } }
      : happyPath(call));
    const { error } = await repo.saveTripWithItinerary(wizardState, itinerary(2));
    expect(error).toBeTruthy();
    expect(fake.calls.map(c => c.table)).toEqual(['trips', 'itinerary_days', 'trips']);
    expect(op(fake.calls[2], 'delete')).toBeTruthy();
  });

  it('rolls back when marking the trip as saved fails', async () => {
    fake.respond = (call) => (call.table === 'trips' && op(call, 'update')
      ? { data: null, error: { message: 'network' } }
      : happyPath(call));
    const { data } = await repo.saveTripWithItinerary(wizardState, itinerary(1));
    expect(data).toBeNull();
    expect(op(fake.calls[fake.calls.length - 1], 'delete')).toBeTruthy();
  });

  it('does not touch the database when nobody is signed in', async () => {
    fake.user = null;
    const { error } = await repo.saveTripWithItinerary(wizardState, itinerary(1));
    expect(error).toMatch(/sign in/i);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('fetchTripById', () => {
  const trip = {
    id: 't1', title: 'Tokyo',
    itinerary_days: [
      { day_number: 2, activities: [] },
      { day_number: 1, activities: [{ title: 'late', start_time: '18:00', sort_order: 0 }, { title: 'early', start_time: '9:00', sort_order: 1 }] },
    ],
  };

  it('sorts days and activities and saves an offline copy', async () => {
    fake.respond = () => ({ data: trip, error: null, status: 200 });
    const { data, error, stale } = await repo.fetchTripById('t1');
    expect(error).toBeNull();
    expect(stale).toBeUndefined();
    expect(data.itinerary_days.map(d => d.day_number)).toEqual([1, 2]);
    expect(data.itinerary_days[0].activities.map(a => a.title)).toEqual(['early', 'late']);
    expect(repo.listOfflineTrips().map(t => t.id)).toEqual(['t1']);
  });

  it("returns 'not_found' for zero rows (PGRST116) and for an invalid id", async () => {
    fake.respond = () => ({ data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, status: 406 });
    expect(await repo.fetchTripById('gone')).toEqual({ data: null, error: 'not_found' });
    fake.respond = () => ({ data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' }, status: 400 });
    expect((await repo.fetchTripById('nope')).error).toBe('not_found');
    fake.respond = () => ({ data: null, error: null, status: 200 });
    expect((await repo.fetchTripById('t9')).error).toBe('not_found');
  });

  it('serves the last saved copy, marked stale, when the network fails', async () => {
    fake.respond = () => ({ data: trip, error: null, status: 200 });
    await repo.fetchTripById('t1');
    fake.respond = () => ({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 });
    const out = await repo.fetchTripById('t1');
    expect(out.stale).toBe(true);
    expect(out.error).toBeNull();
    expect(out.data.title).toBe('Tokyo');
  });

  it('serves the saved copy straight away when the device is offline', async () => {
    fake.respond = () => ({ data: trip, error: null, status: 200 });
    await repo.fetchTripById('t1');
    fake.calls = [];
    navigator.onLine = false;
    const out = await repo.fetchTripById('t1');
    expect(out.stale).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });

  it("fails at once with 'offline' when offline with no saved copy, without building a query", async () => {
    navigator.onLine = false;
    expect(await repo.fetchTripById('never-opened')).toEqual({ data: null, error: 'offline' });
    expect(fake.calls).toHaveLength(0);
  });

  it('keeps all saved copies within the size budget, dropping the oldest first', async () => {
    const bigTrip = (i) => ({ id: `b${i}`, title: `Big ${i}`, notes: 'x'.repeat(450_000), itinerary_days: [] });
    for (let i = 0; i < 5; i++) {
      fake.respond = () => ({ data: bigTrip(i), error: null, status: 200 });
      await repo.fetchTripById(`b${i}`);
    }
    const kept = repo.listOfflineTrips().map(t => t.id);
    expect(kept).toEqual(['b4', 'b3', 'b2']);
    const total = kept.reduce((n, id) => n + localStorage.getItem(`trippy-offline-trip:${id}`).length, 0);
    expect(total).toBeLessThanOrEqual(2_000_000);
    expect(localStorage.getItem('trippy-offline-trip:b0')).toBeNull();
    expect(localStorage.getItem('trippy-offline-trip:b1')).toBeNull();
  });

  it('measures copies saved before sizes were recorded', async () => {
    localStorage.setItem('trippy-offline-trips', JSON.stringify([{ id: 'old', userId: 'u1', savedAt: '2026-01-01T00:00:00Z' }]));
    localStorage.setItem('trippy-offline-trip:old', JSON.stringify({ userId: 'u1', data: { id: 'old', notes: 'x'.repeat(1_400_000) } }));
    fake.respond = () => ({ data: { id: 'new', title: 'New', notes: 'x'.repeat(400_000), itinerary_days: [] }, error: null, status: 200 });
    await repo.fetchTripById('new');
    expect(repo.listOfflineTrips().map(t => t.id)).toEqual(['new']);
    expect(localStorage.getItem('trippy-offline-trip:old')).toBeNull();
  });

  it('does not keep a copy of a trip over the per-trip limit', async () => {
    fake.respond = () => ({ data: { id: 'huge', title: 'Huge', notes: 'x'.repeat(600_000), itinerary_days: [] }, error: null, status: 200 });
    const out = await repo.fetchTripById('huge');
    expect(out.data.id).toBe('huge');
    expect(repo.listOfflineTrips()).toEqual([]);
  });

  it("never serves another user's saved copy", async () => {
    fake.respond = () => ({ data: trip, error: null, status: 200 });
    await repo.fetchTripById('t1');
    fake.user = { id: 'u2', email: 'other@example.com' };
    fake.respond = () => ({ data: null, error: { message: 'FetchError' }, status: 0 });
    const out = await repo.fetchTripById('t1');
    expect(out.data).toBeNull();
    expect(out.stale).toBeUndefined();
  });

  it('keeps only the most recent few trips', async () => {
    for (let i = 0; i < 8; i++) {
      fake.respond = () => ({ data: { id: `t${i}`, title: `Trip ${i}`, itinerary_days: [] }, error: null, status: 200 });
      await repo.fetchTripById(`t${i}`);
    }
    expect(repo.listOfflineTrips().map(t => t.id)).toEqual(['t7', 't6', 't5', 't4', 't3']);
    expect(localStorage.getItem('trippy-offline-trip:t0')).toBeNull();
    repo.clearOfflineTripCache();
    expect(repo.listOfflineTrips()).toEqual([]);
  });

  it('hands a prefetched request to the next fetch instead of querying twice', async () => {
    fake.respond = () => ({ data: trip, error: null, status: 200 });
    repo.prefetchTripById('t1');
    const out = await repo.fetchTripById('t1');
    expect(out.data.id).toBe('t1');
    expect(fake.calls).toHaveLength(1);
  });
});

describe('fetchAllTrips', () => {
  const ownRow = { id: 'a', title: 'Own', created_at: '2026-01-02T00:00:00Z', ws_multi: false, ws_destination: { name: 'Seoul' }, ws_destinations: null, import_pending: null, itinerary_days: [] };

  it('selects only dashboard columns and merges trips shared with the user', async () => {
    fake.respond = (call) => (call.table === 'trips'
      ? { data: [ownRow], error: null, status: 200 }
      : { data: [{ role: 'editor', trip: { ...ownRow, id: 'b', title: 'Shared', created_at: '2026-03-01T00:00:00Z' } }], error: null, status: 200 });
    const { data, error } = await repo.fetchAllTrips();
    expect(error).toBeNull();
    expect(data.map(t => [t.id, t.shared, t.collab_role])).toEqual([['b', true, 'editor'], ['a', false, null]]);
    expect(data[1].wizard_state).toEqual({ multiCity: false, destination: { name: 'Seoul' }, destinations: [] });
    const tripsCall = fake.calls.find(c => c.table === 'trips');
    const columns = op(tripsCall, 'select')[1];
    expect(columns).not.toMatch(/\*/);
    expect(columns).not.toMatch(/(^|,)extras(,|$)/);
    // Only the v2 cover's copies, not the whole extras.cover record.
    expect(columns).toContain('cover_small:extras->cover->small');
    expect(columns).toContain('cover_large:extras->cover->large');
    expect(columns).toContain('cover_focus:extras->cover->focusY');
    const collabCall = fake.calls.find(c => c.table === 'trip_collaborators');
    expect(op(collabCall, 'eq')).toEqual(['eq', 'invited_email', 'me@example.com']);
  });

  it('hides trips whose import never finished', async () => {
    fake.respond = (call) => (call.table === 'trips' && op(call, 'select')
      ? { data: [ownRow, { ...ownRow, id: 'half', import_pending: true, created_at: new Date().toISOString() }], error: null, status: 200 }
      : { data: [], error: null, status: 200 });
    const { data } = await repo.fetchAllTrips();
    expect(data.map(t => t.id)).toEqual(['a']);
  });

  it('falls back to the saved list when the network fails', async () => {
    fake.respond = (call) => (call.table === 'trips' ? { data: [ownRow], error: null, status: 200 } : { data: [], error: null, status: 200 });
    await repo.fetchAllTrips();
    fake.respond = () => ({ data: null, error: { message: 'FetchError: Failed to fetch' }, status: 0 });
    const out = await repo.fetchAllTrips();
    expect(out.stale).toBe(true);
    expect(out.data.map(t => t.id)).toEqual(['a']);
  });

  it('keeps only the newest trips that fit when the saved list would be too large', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      ...ownRow, id: `r${i}`, title: 'x'.repeat(10_000),
      created_at: new Date(Date.UTC(2026, 0, 1) + (50 - i) * 60_000).toISOString(),
    }));
    fake.respond = (call) => (call.table === 'trips' ? { data: rows, error: null, status: 200 } : { data: [], error: null, status: 200 });
    const { data } = await repo.fetchAllTrips();
    expect(data).toHaveLength(50);
    const saved = localStorage.getItem('trippy-offline-trip-list');
    expect(saved.length).toBeLessThanOrEqual(300_000);
    const savedIds = JSON.parse(saved).rows.map(r => r.id);
    expect(savedIds.length).toBeGreaterThan(20);
    expect(savedIds).toEqual(data.slice(0, savedIds.length).map(r => r.id));
  });
});

describe('deleteTrip', () => {
  const lookup = (row) => (call) => (op(call, 'delete') ? { data: [], error: null } : { data: row, error: null });

  it('forgets the offline copy after deleting', async () => {
    fake.respond = () => ({ data: { id: 't1', title: 'Tokyo', itinerary_days: [] }, error: null, status: 200 });
    await repo.fetchTripById('t1');
    fake.respond = () => ({ data: [{ id: 't1' }], error: null });
    expect(await repo.deleteTrip('t1')).toEqual({ error: null });
    expect(repo.listOfflineTrips()).toEqual([]);
  });

  it('treats a trip that is already gone as deleted', async () => {
    fake.respond = lookup(null);
    expect(await repo.deleteTrip('gone')).toEqual({ error: null });
    const check = fake.calls[1];
    expect(op(check, 'select')).toEqual(['select', 'user_id']);
    expect(op(check, 'eq')).toEqual(['eq', 'id', 'gone']);
  });

  it("only blames ownership when the trip exists and is someone else's", async () => {
    fake.respond = lookup({ user_id: 'someone-else' });
    expect((await repo.deleteTrip('t2')).error).toMatch(/only the trip owner/i);
    fake.respond = lookup({ user_id: 'u1' });
    const own = await repo.deleteTrip('t3');
    expect(own.error).toBeTruthy();
    expect(own.error).not.toMatch(/owner/i);
  });
});

describe('updateActivityById', () => {
  it('clears the stored photo when the venue changes', async () => {
    fake.respond = (call) => (op(call, 'select') ? { data: { title: 'Ramen Bar A', venue_name: 'Ramen Bar A' }, error: null } : { data: null, error: null });
    const out = await repo.updateActivityById('x1', { title: 'Sushi B', venueName: 'Sushi B' });
    expect(out).toEqual({ error: null, photoReset: true });
    const update = fake.calls.find(c => op(c, 'update'));
    expect(op(update, 'update')[1]).toMatchObject({ venue_name: 'Sushi B', photo_url: '', photo_source: '' });
  });

  it('keeps the photo when only other fields change, using the previous row when given', async () => {
    const previous = { title: 'Museum', venue_name: 'Museum', venue_address: '', place_id: '' };
    const out = await repo.updateActivityById('x1', { title: 'Museum', venueName: 'Museum', startTime: '9:30' }, { previous });
    expect(out.photoReset).toBe(false);
    expect(fake.calls).toHaveLength(1);
    const payload = op(fake.calls[0], 'update')[1];
    expect(payload).not.toHaveProperty('photo_url');
    expect(payload.start_time).toBe('09:30');
  });

  it('does nothing for an empty update', async () => {
    expect(await repo.updateActivityById('x1', {})).toEqual({ error: null, photoReset: false });
    expect(fake.calls).toHaveLength(0);
  });
});
