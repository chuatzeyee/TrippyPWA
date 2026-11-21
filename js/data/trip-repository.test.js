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

// ===== Redesign data layer (task F2) =====
// Everything below is invented: ids, places, people and dates.

const dayOrder = await import('../lib/day-order.js');
const collab = await import('./collab-repository.js');

const offlineKeys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
  .filter(k => k.startsWith('trippy-offline-trip'));
const offlineChars = () => offlineKeys().reduce((n, k) => n + localStorage.getItem(k).length, 0);
const ops = (call, name) => call.ops.filter(([n]) => n === name);
const NETWORK_DOWN = () => ({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 });

describe('the functions moved to js/lib/day-order.js', () => {
  it('are still exported from the repository, as the very same functions', () => {
    expect(repo.sortDayActivities).toBe(dayOrder.sortDayActivities);
    expect(repo.startMinutes).toBe(dayOrder.startMinutes);
    expect(repo.normStartTime).toBe(dayOrder.normStartTime);
  });
});

describe('fetchAllTrips, list additions', () => {
  const base = { id: 'a', title: 'Own', created_at: '2031-01-02T00:00:00Z', ws_multi: false, ws_destination: { name: 'Porto' }, ws_destinations: null, import_pending: null, itinerary_days: [] };
  const listOf = (rows, shared = []) => (call) => (call.table === 'trips'
    ? { data: rows, error: null, status: 200 }
    : { data: shared, error: null, status: 200 });

  it('asks for the small scalars and JSON paths the views need, and still not for extras', async () => {
    fake.respond = listOf([base]);
    await repo.fetchAllTrips();
    const columns = op(fake.calls.find(c => c.table === 'trips'), 'select')[1].split(',');
    for (const column of [
      'timezone', 'ws_imported:wizard_state->imported', 'ws_duration:wizard_state->dates->duration',
      'cover_credit:extras->cover->credit', 'cover_none:extras->cover->none',
    ]) expect(columns, column).toContain(column);
    expect(columns.join(',')).toContain('itinerary_days(day_number,activities(cost_amount,cost_currency))');
    expect(columns).not.toContain('extras');
    expect(columns).not.toContain('wizard_state');
    expect(columns).not.toContain('*');
  });

  it('carries imported, duration, timezone and the cover credit on each row', async () => {
    const credit = { title: 'Ribeira at dusk', creator: 'A. Photographer', license: 'CC BY 4.0', link: 'https://example.org/p/1' };
    fake.respond = listOf([{
      ...base, timezone: 'Europe/Lisbon', ws_imported: true, ws_duration: 6, cover_credit: credit, cover_none: null,
      itinerary_days: [{ day_number: 1, activities: [{ cost_amount: 12, cost_currency: 'EUR' }] }],
    }]);
    const { data } = await repo.fetchAllTrips();
    expect(data[0].wizard_state).toEqual({
      multiCity: false, destination: { name: 'Porto' }, destinations: [], imported: true, dates: { duration: 6 },
    });
    expect(data[0].timezone).toBe('Europe/Lisbon');
    expect(data[0].cover_credit).toEqual(credit);
    expect(data[0].cover_none).toBeNull();
    expect(data[0].itinerary_days[0].activities[0]).toEqual({ cost_amount: 12, cost_currency: 'EUR' });
    expect(Object.keys(data[0]).filter(k => k.startsWith('ws_'))).toEqual([]);
    // The saved list carries the same row.
    expect(JSON.parse(localStorage.getItem('trippy-offline-trip-list')).rows[0].wizard_state.dates).toEqual({ duration: 6 });
  });

  it('leaves imported and duration out of wizard_state when the plan has neither', async () => {
    fake.respond = listOf([
      { ...base, id: 'nulls', ws_imported: null, ws_duration: null, timezone: null },
      { ...base, id: 'odd', created_at: '2030-01-01T00:00:00Z', ws_imported: false, ws_duration: 'soon' },
      { ...base, id: 'zero', created_at: '2029-01-01T00:00:00Z', ws_imported: 'yes', ws_duration: 0 },
    ]);
    const { data } = await repo.fetchAllTrips();
    for (const row of data) {
      expect(row.wizard_state, row.id).toEqual({ multiCity: false, destination: { name: 'Porto' }, destinations: [] });
      expect('imported' in row.wizard_state, row.id).toBe(false);
      expect('dates' in row.wizard_state, row.id).toBe(false);
    }
  });

  it('keeps the same additions on a plan shared with the user', async () => {
    fake.respond = listOf([], [{ role: 'viewer', trip: { ...base, id: 's', timezone: 'Asia/Seoul', ws_imported: true, ws_duration: 3 } }]);
    const { data } = await repo.fetchAllTrips();
    expect(data[0]).toMatchObject({ id: 's', shared: true, collab_role: 'viewer', timezone: 'Asia/Seoul' });
    expect(data[0].wizard_state).toMatchObject({ imported: true, dates: { duration: 3 } });
  });

  describe('cachedAt on a stale result', () => {
    const savedAtOf = () => JSON.parse(localStorage.getItem('trippy-offline-trip-list')).savedAt;

    it('is not there on a fresh result', async () => {
      fake.respond = listOf([base]);
      const out = await repo.fetchAllTrips();
      expect(out.stale).toBeUndefined();
      expect(out.cachedAt).toBeUndefined();
    });

    it('is the time the list was saved, when the network fails', async () => {
      fake.respond = listOf([base]);
      await repo.fetchAllTrips();
      fake.respond = NETWORK_DOWN;
      const out = await repo.fetchAllTrips();
      expect(out).toMatchObject({ stale: true, error: null, cachedAt: savedAtOf() });
      expect(Number.isNaN(Date.parse(out.cachedAt))).toBe(false);
    });

    it('is there when the device is offline', async () => {
      fake.respond = listOf([base]);
      await repo.fetchAllTrips();
      fake.calls = [];
      navigator.onLine = false;
      const out = await repo.fetchAllTrips();
      expect(out).toMatchObject({ stale: true, cachedAt: savedAtOf() });
      expect(fake.calls).toHaveLength(0);
    });

    it('is there when the session is not restored yet and the list of the stored session is served', async () => {
      fake.respond = listOf([base]);
      await repo.fetchAllTrips();
      fake.user = null;
      localStorage.setItem('sb-abcdefgh-auth-token', JSON.stringify({ user: { id: 'u1' } }));
      const out = await repo.fetchAllTrips();
      expect(out).toMatchObject({ stale: true, cachedAt: savedAtOf() });
      expect(out.data.map(t => t.id)).toEqual(['a']);
    });
  });
});

describe('cachedListRole', () => {
  const own = { id: 'own', title: 'Own', created_at: '2031-01-02T00:00:00Z', itinerary_days: [] };
  const shared = (id, role) => ({ role, trip: { ...own, id, created_at: '2031-02-01T00:00:00Z' } });

  beforeEach(async () => {
    fake.respond = (call) => (call.table === 'trips'
      ? { data: [own], error: null, status: 200 }
      : { data: [shared('v', 'viewer'), shared('e', 'editor'), shared('odd', 'owner')], error: null, status: 200 });
    await repo.fetchAllTrips();
    fake.calls = [];
  });

  it('gives the role saved with the list row of a shared plan, without a request', () => {
    expect(repo.cachedListRole('v')).toBe('viewer');
    expect(repo.cachedListRole('e')).toBe('editor');
    expect(fake.calls).toHaveLength(0);
  });

  it("is null for the user's own plan, an unknown plan, an unknown role and a missing id", () => {
    expect(repo.cachedListRole('own')).toBeNull();
    expect(repo.cachedListRole('nope')).toBeNull();
    expect(repo.cachedListRole('odd')).toBeNull();
    expect(repo.cachedListRole(undefined)).toBeNull();
  });

  it("never reads another user's saved list, and is null with no list saved", () => {
    fake.user = { id: 'u2', email: 'other@example.com' };
    expect(repo.cachedListRole('e')).toBeNull();
    fake.user = { id: 'u1', email: 'me@example.com' };
    repo.clearOfflineTripCache();
    expect(repo.cachedListRole('e')).toBeNull();
  });
});

describe('fetchMyRole (collab-repository)', () => {
  it('asks for the one role row of the trip that row security lets the user see', async () => {
    fake.respond = () => ({ data: { role: 'viewer' }, error: null });
    expect(await collab.fetchMyRole('t1')).toEqual({ data: 'viewer', error: null });
    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call.table).toBe('trip_collaborators');
    expect(call.ops).toEqual([['select', 'role'], ['eq', 'trip_id', 't1'], ['limit', 1], ['maybeSingle']]);
  });

  it('is null when there is no row or the role is not one the app knows', async () => {
    fake.respond = () => ({ data: null, error: null });
    expect(await collab.fetchMyRole('t1')).toEqual({ data: null, error: null });
    fake.respond = () => ({ data: { role: 'owner' }, error: null });
    expect(await collab.fetchMyRole('t1')).toEqual({ data: null, error: null });
  });

  it('reports a failed request, and makes none without a trip id', async () => {
    fake.respond = () => ({ data: null, error: { message: 'Failed to fetch' } });
    expect(await collab.fetchMyRole('t1')).toEqual({ data: null, error: 'Failed to fetch' });
    fake.calls = [];
    expect(await collab.fetchMyRole('')).toEqual({ data: null, error: null });
    expect(fake.calls).toHaveLength(0);
  });
});

describe('fetchTripBriefings', () => {
  // The device date is 10 Mar 2031 whatever the zone of the machine running the tests.
  const NOW = new Date(2031, 2, 10, 12, 0);
  const YESTERDAY = '2031-03-09';
  const TOMORROW = '2031-03-11';
  const LIVE_UNTIL = '2031-03-13';

  const stop = (title, start_time, sort_order, time_slot = 'morning') => ({ start_time, time_slot, sort_order, title, venue_name: `${title} hall` });
  const dayOf = (n, date, activities) => ({ day_number: n, date, title: `Day ${n}`, weather: { high: 18, low: 11, condition: 'Sunny' }, activities });
  const marchDays = (first, count, perDay = (n) => [stop(`Late ${n}`, '18:00', 0), stop(`Early ${n}`, '9:00', 1)]) => (
    Array.from({ length: count }, (_, i) => dayOf(i + 1, `2031-03-${String(first + i).padStart(2, '0')}`, perDay(i + 1)))
  );
  const plan = (id, days, more = {}) => ({
    id, timezone: 'Europe/Lisbon',
    flights: { outbound: { flightNumber: 'ZZ101' } }, transport: null,
    accommodation: [{ name: 'Casa Exemplo', city: 'Porto' }], checklist: [{ group: 'Must book', items: [{ label: 'Tower visit' }] }],
    ws_passports: ['pt'], ws_transport_mode: null, ws_flights_settled: true, ws_stay_settled: null,
    days, ...more,
  });
  const LIVE = plan('live1', marchDays(7, 7));                 // 7 to 13 Mar: live on the 10th
  const UPCOMING = plan('up1', marchDays(20, 3), { ws_passports: null, flights: null, ws_flights_settled: null, timezone: null });

  // What PostgREST answers for each form of the select.
  const twoAlias = ({ days, ...rest }, from = YESTERDAY, to = LIVE_UNTIL) => ({
    ...rest,
    days: days.map(({ activities, ...day }) => day),
    stops: days.filter(d => d.date >= from && d.date <= to).map(({ day_number, date, activities }) => ({ day_number, date, activities })),
  });
  const singleEmbed = ({ days, ...rest }) => ({ ...rest, days: days.map(d => ({ ...d })) });
  const answer = (...rows) => () => ({ data: rows, error: null, status: 200 });
  const briefings = (ids, opts = {}) => repo.fetchTripBriefings(ids, { liveUntil: LIVE_UNTIL, now: NOW, ...opts });

  it('makes one request for the given plans: two aliases of the days, the second kept to the date range', async () => {
    fake.respond = answer(twoAlias(LIVE));
    const { error } = await briefings(['live1', 'up1']);
    expect(error).toBeNull();
    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call.table).toBe('trips');
    const select = op(call, 'select')[1];
    for (const part of [
      'id', 'timezone', 'flights:extras->flights', 'transport:extras->transport', 'accommodation:extras->accommodation',
      'checklist:extras->bookingChecklist', 'ws_passports:wizard_state->passports',
      'ws_transport_mode:wizard_state->transport->mode', 'ws_flights_settled:wizard_state->flights->settled',
      'ws_stay_settled:wizard_state->accommodation->settled',
      'days:itinerary_days(day_number,date,title,weather)',
      'stops:itinerary_days(day_number,date,activities(start_time,time_slot,sort_order,title,venue_name))',
    ]) expect(select, part).toContain(part);
    expect(select).not.toMatch(/\*/);
    expect(op(call, 'in')).toEqual(['in', 'id', ['live1', 'up1']]);
    expect(op(call, 'gte')).toEqual(['gte', 'stops.date', YESTERDAY]);
    expect(op(call, 'lte')).toEqual(['lte', 'stops.date', LIVE_UNTIL]);
    expect(ops(call, 'gte')).toHaveLength(1);
  });

  it('looks until tomorrow when no plan is live, and drops ids that are empty or repeated', async () => {
    fake.respond = answer();
    await repo.fetchTripBriefings(['up1', '', null, 'up1', 7, 'up2'], { now: NOW });
    expect(op(fake.calls[0], 'lte')).toEqual(['lte', 'stops.date', TOMORROW]);
    expect(op(fake.calls[0], 'in')).toEqual(['in', 'id', ['up1', 'up2']]);
    fake.calls = [];
    await repo.fetchTripBriefings(['up1'], { now: NOW, liveUntil: 'next week' });
    expect(op(fake.calls[0], 'lte')).toEqual(['lte', 'stops.date', TOMORROW]);
  });

  it('makes no request for an empty list of plans', async () => {
    expect(await briefings([])).toEqual({ data: [], error: null });
    expect(await briefings(undefined)).toEqual({ data: [], error: null });
    expect(fake.calls).toHaveLength(0);
  });

  it('gives each row one shape', async () => {
    fake.respond = answer(twoAlias(LIVE));
    const { data } = await briefings(['live1']);
    expect(data).toHaveLength(1);
    const [row] = data;
    expect(Object.keys(row)).toEqual(['id', 'timezone', 'extras', 'wizard_state', 'days', 'stops']);
    expect(row).toMatchObject({ id: 'live1', timezone: 'Europe/Lisbon' });
    expect(row.extras).toEqual({
      flights: { outbound: { flightNumber: 'ZZ101' } }, transport: null,
      accommodation: [{ name: 'Casa Exemplo', city: 'Porto' }],
      bookingChecklist: [{ group: 'Must book', items: [{ label: 'Tower visit' }] }],
    });
    expect(row.wizard_state).toEqual({
      passports: ['pt'], transport: { mode: null }, flights: { settled: true }, accommodation: { settled: false },
    });
    expect(row.days).toHaveLength(7);
    expect(row.days[0]).toEqual({ day_number: 1, date: '2031-03-07', title: 'Day 1', weather: { high: 18, low: 11, condition: 'Sunny' } });
    expect(row.stops[0]).toEqual({
      day_number: 3, date: '2031-03-09',
      activities: [
        { start_time: '9:00', time_slot: 'morning', sort_order: 1, title: 'Early 3', venue_name: 'Early 3 hall' },
        { start_time: '18:00', time_slot: 'morning', sort_order: 0, title: 'Late 3', venue_name: 'Late 3 hall' },
      ],
    });
  });

  it('normalises both select forms to the same rows: two aliases with the date range, or the single-embed fallback', async () => {
    fake.respond = answer(twoAlias(LIVE), twoAlias(UPCOMING));
    const viaAliases = await briefings(['live1', 'up1']);
    fake.respond = answer(singleEmbed(LIVE), singleEmbed(UPCOMING));
    const viaFallback = await briefings(['live1', 'up1']);
    expect(viaFallback).toEqual(viaAliases);
    expect(viaAliases.data.map(r => r.id)).toEqual(['live1', 'up1']);
    // Neither form leaves activities on `days`.
    for (const row of viaFallback.data) for (const day of row.days) expect(Object.keys(day)).toEqual(['day_number', 'date', 'title', 'weather']);
  });

  it('holds every remaining day of a live plan in stops, and nothing for a plan that starts after liveUntil', async () => {
    for (const form of [twoAlias, singleEmbed]) {
      fake.respond = answer(form(LIVE), form(UPCOMING));
      const { data } = await briefings(['live1', 'up1']);
      const [live, upcoming] = data;
      // Yesterday (for a plan in a zone behind the device), today and every day to the end of the plan.
      expect(live.stops.map(s => s.date), form.name).toEqual(['2031-03-09', '2031-03-10', '2031-03-11', '2031-03-12', '2031-03-13']);
      expect(live.stops.every(s => s.activities.length === 2), form.name).toBe(true);
      expect(live.days.map(d => d.date)).toHaveLength(7);
      expect(upcoming.stops, form.name).toEqual([]);
      expect(upcoming.days.map(d => d.date), form.name).toEqual(['2031-03-20', '2031-03-21', '2031-03-22']);
    }
  });

  it('fills what a plan does not have with null, false and empty lists', async () => {
    fake.respond = answer({ id: 'bare' }, twoAlias(UPCOMING));
    const { data } = await briefings(['bare', 'up1']);
    expect(data[0]).toEqual({
      id: 'bare', timezone: null,
      extras: { flights: null, transport: null, accommodation: null, bookingChecklist: null },
      wizard_state: { passports: null, transport: { mode: null }, flights: { settled: false }, accommodation: { settled: false } },
      days: [], stops: [],
    });
    expect(data[1].wizard_state.passports).toBeNull();
    expect(data[1].timezone).toBeNull();
  });

  it('orders rows as the ids were given, days by number and stops for display, whatever order the server used', async () => {
    const shuffled = plan('live1', [...marchDays(7, 7)].reverse());
    fake.respond = answer(twoAlias(UPCOMING), twoAlias(shuffled), twoAlias(plan('extra', marchDays(9, 2))));
    const { data } = await briefings(['live1', 'up1']);
    expect(data.map(r => r.id)).toEqual(['live1', 'up1']);
    expect(data[0].days.map(d => d.day_number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(data[0].stops.map(s => s.day_number)).toEqual([3, 4, 5, 6, 7]);
    expect(data[0].stops[0].activities.map(a => a.title)).toEqual(['Early 3', 'Late 3']);
  });

  it('does not change the rows it was answered with', async () => {
    const raw = singleEmbed(LIVE);
    const copy = JSON.parse(JSON.stringify(raw));
    fake.respond = answer(raw);
    await briefings(['live1']);
    expect(raw).toEqual(copy);
  });

  describe('the saved copy', () => {
    const saved = () => JSON.parse(localStorage.getItem('trippy-offline-trip-briefings'));

    it('is written after a fetch and read back synchronously by readSavedBriefings', async () => {
      expect(repo.readSavedBriefings()).toEqual([]);
      fake.respond = answer(twoAlias(LIVE), twoAlias(UPCOMING));
      const { data } = await briefings(['live1', 'up1']);
      expect(Object.keys(saved())).toEqual(['userId', 'savedAt', 'rows']);
      expect(saved().userId).toBe('u1');
      expect(repo.readSavedBriefings()).toEqual(data);
    });

    it("is never read for another user, and is read for the stored session's user before the session is restored", async () => {
      fake.respond = answer(twoAlias(LIVE));
      await briefings(['live1']);
      fake.user = { id: 'u2', email: 'other@example.com' };
      expect(repo.readSavedBriefings()).toEqual([]);
      fake.user = null;
      expect(repo.readSavedBriefings()).toEqual([]);
      localStorage.setItem('sb-abcdefgh-auth-token', JSON.stringify({ user: { id: 'u1' } }));
      expect(repo.readSavedBriefings().map(r => r.id)).toEqual(['live1']);
    });

    it('reads as empty when it is corrupt', () => {
      for (const bad of ['{"userId":"u1","rows":', 'null', '[]', '{"userId":"u1","rows":"none"}']) {
        localStorage.setItem('trippy-offline-trip-briefings', bad);
        expect(repo.readSavedBriefings(), bad).toEqual([]);
      }
    });

    it('is served, marked stale, when the device is offline, without a request', async () => {
      fake.respond = answer(twoAlias(LIVE));
      const fresh = await briefings(['live1']);
      fake.calls = [];
      navigator.onLine = false;
      const out = await briefings(['live1']);
      expect(out).toEqual({ data: fresh.data, error: null, stale: true, cachedAt: saved().savedAt });
      expect(fake.calls).toHaveLength(0);
    });

    it('is served, marked stale, when the network fails, and is left as it was', async () => {
      fake.respond = answer(twoAlias(LIVE));
      const fresh = await briefings(['live1']);
      const before = localStorage.getItem('trippy-offline-trip-briefings');
      fake.respond = NETWORK_DOWN;
      const out = await briefings(['live1']);
      expect(out).toMatchObject({ data: fresh.data, error: null, stale: true });
      expect(localStorage.getItem('trippy-offline-trip-briefings')).toBe(before);
    });

    it('leaves the dashboard on list data when nothing is saved: no rows and an error, never a throw', async () => {
      fake.respond = NETWORK_DOWN;
      expect(await briefings(['live1'])).toEqual({ data: [], error: 'TypeError: Failed to fetch' });
      navigator.onLine = false;
      expect(await briefings(['live1'])).toEqual({ data: [], error: 'offline' });
      navigator.onLine = true;
      fake.user = null;
      expect(await briefings(['live1'])).toEqual({ data: [], error: 'Not authenticated' });
    });

    it('is not served for an error that is not a network failure', async () => {
      fake.respond = answer(twoAlias(LIVE));
      await briefings(['live1']);
      fake.respond = () => ({ data: null, error: { message: 'bad request', code: 'PGRST100' }, status: 400 });
      expect(await briefings(['live1'])).toEqual({ data: [], error: 'bad request' });
      expect(repo.readSavedBriefings().map(r => r.id)).toEqual(['live1']);
    });

    it('is removed by clearOfflineTripCache', async () => {
      fake.respond = answer(twoAlias(LIVE));
      await briefings(['live1']);
      localStorage.setItem('trippy_user_prefs', '{}');
      repo.clearOfflineTripCache();
      expect(localStorage.getItem('trippy-offline-trip-briefings')).toBeNull();
      expect(repo.readSavedBriefings()).toEqual([]);
      expect(localStorage.getItem('trippy_user_prefs')).toBe('{}');
    });

    it('loses the row of a plan that is deleted', async () => {
      fake.respond = answer(twoAlias(LIVE), twoAlias(UPCOMING));
      await briefings(['live1', 'up1']);
      fake.respond = () => ({ data: [{ id: 'up1' }], error: null });
      await repo.deleteTrip('up1');
      expect(repo.readSavedBriefings().map(r => r.id)).toEqual(['live1']);
    });

    // Plans with long stop titles (the venue name repeats the title: about 8,000
    // characters a day), so a handful of them is over the 120,000 character cap.
    const heavyStops = (n) => [stop(`${'x'.repeat(4000)} ${n}`, '10:00', 0)];
    const HEAVY_LIVE = (id) => plan(id, marchDays(7, 7, heavyStops));                                    // about 40,000 characters of stops in range
    const HEAVY_SOON = (id) => plan(id, marchDays(15, 5, heavyStops), { ws_passports: null });           // starts 15 Mar: not live, inside the range
    const untilTwentieth = { liveUntil: '2031-03-20' };

    it('stays within 120,000 characters by first dropping the stops of plans that are not live, last plan first', async () => {
      fake.respond = answer(twoAlias(HEAVY_LIVE('live1'), YESTERDAY, '2031-03-20'), twoAlias(HEAVY_SOON('soon1'), YESTERDAY, '2031-03-20'), twoAlias(HEAVY_SOON('soon2'), YESTERDAY, '2031-03-20'));
      const { data } = await briefings(['live1', 'soon1', 'soon2'], untilTwentieth);
      // What the caller gets is whole.
      expect(data.map(r => r.stops.length)).toEqual([5, 5, 5]);
      expect(JSON.stringify(data).length).toBeGreaterThan(120_000);

      expect(localStorage.getItem('trippy-offline-trip-briefings').length).toBeLessThanOrEqual(120_000);
      const rows = repo.readSavedBriefings();
      expect(rows.map(r => r.id)).toEqual(['live1', 'soon1', 'soon2']);
      expect(rows.map(r => r.stops.length)).toEqual([5, 5, 0]);
      expect(rows[2].days).toHaveLength(5);
      expect(rows[2].extras.accommodation).toEqual([{ name: 'Casa Exemplo', city: 'Porto' }]);
    });

    it('then drops whole rows from the end, and never the stops of a live plan before that', async () => {
      const liveToTwentieth = (id) => plan(id, marchDays(7, 14, heavyStops));      // 7 to 20 Mar: 12 days of stops in range
      fake.respond = answer(twoAlias(liveToTwentieth('live1'), YESTERDAY, '2031-03-20'), twoAlias(liveToTwentieth('live2'), YESTERDAY, '2031-03-20'), twoAlias(HEAVY_SOON('soon1'), YESTERDAY, '2031-03-20'));
      await briefings(['live1', 'live2', 'soon1'], untilTwentieth);
      expect(localStorage.getItem('trippy-offline-trip-briefings').length).toBeLessThanOrEqual(120_000);
      const rows = repo.readSavedBriefings();
      expect(rows.map(r => r.id)).toEqual(['live1']);
      expect(rows[0].stops).toHaveLength(12);
    });

    it('saves an empty list rather than a copy over the cap when not even one row fits', async () => {
      const huge = plan('live1', marchDays(7, 7, (n) => [stop(`${'x'.repeat(40_000)} ${n}`, '10:00', 0)]));
      fake.respond = answer(twoAlias(huge));
      const { data } = await briefings(['live1']);
      expect(data).toHaveLength(1);
      expect(saved().rows).toEqual([]);
    });

    it('never pushes all offline copies together over the 2,000,000 character budget', async () => {
      // Trip copies up to their share: 420,000 characters each.
      for (let i = 0; i < 5; i++) {
        fake.respond = () => ({ data: { id: `b${i}`, title: `Big ${i}`, notes: 'x'.repeat(420_000), itinerary_days: [] }, error: null, status: 200 });
        await repo.fetchTripById(`b${i}`);
      }
      // A list over its share.
      const listRows = Array.from({ length: 60 }, (_, i) => ({
        id: `r${i}`, title: 'x'.repeat(10_000), itinerary_days: [],
        created_at: new Date(Date.UTC(2031, 0, 1) + (60 - i) * 60_000).toISOString(),
      }));
      fake.respond = (call) => (call.table === 'trips' ? { data: listRows, error: null, status: 200 } : { data: [], error: null, status: 200 });
      await repo.fetchAllTrips();
      // Briefings over their share.
      fake.respond = answer(...['l1', 'l2', 'l3', 'l4'].map(id => twoAlias(HEAVY_LIVE(id))));
      await briefings(['l1', 'l2', 'l3', 'l4']);

      const sizes = Object.fromEntries(offlineKeys().map(k => [k, localStorage.getItem(k).length]));
      expect(sizes['trippy-offline-trip-list']).toBeGreaterThan(250_000);
      expect(sizes['trippy-offline-trip-list']).toBeLessThanOrEqual(300_000);
      expect(sizes['trippy-offline-trip-briefings']).toBeGreaterThan(80_000);
      expect(sizes['trippy-offline-trip-briefings']).toBeLessThanOrEqual(120_000);
      // The briefings' share came out of the trip copies' share: three of 420,000 fit, a fourth no longer does.
      expect(repo.listOfflineTrips().map(t => t.id)).toEqual(['b4', 'b3', 'b2']);
      expect(offlineChars()).toBeLessThanOrEqual(2_000_000);
    });
  });
});

describe('clearAllUserData', () => {
  const deletes = () => fake.calls.filter(c => op(c, 'delete')).map(c => [c.table, op(c, 'eq')]);

  it("by default deletes the user's trips and then the profile row, as it always has", async () => {
    expect(await repo.clearAllUserData()).toEqual({ error: null });
    expect(deletes()).toEqual([['trips', ['eq', 'user_id', 'u1']], ['profiles', ['eq', 'id', 'u1']]]);
    fake.calls = [];
    expect(await repo.clearAllUserData({})).toEqual({ error: null });
    expect(await repo.clearAllUserData({ keepProfile: false })).toEqual({ error: null });
    expect(deletes().map(([table]) => table)).toEqual(['trips', 'profiles', 'trips', 'profiles']);
  });

  it('issues no profile delete with keepProfile, and no request on the profiles table at all', async () => {
    expect(await repo.clearAllUserData({ keepProfile: true })).toEqual({ error: null });
    expect(deletes()).toEqual([['trips', ['eq', 'user_id', 'u1']]]);
    expect(fake.calls.map(c => c.table)).toEqual(['trips']);
  });

  it('removes every offline copy either way, the saved briefings included', async () => {
    for (const options of [undefined, { keepProfile: true }]) {
      localStorage.setItem('trippy-offline-trip-briefings', JSON.stringify({ userId: 'u1', savedAt: 'x', rows: [] }));
      localStorage.setItem('trippy-offline-trip-list', JSON.stringify({ userId: 'u1', savedAt: 'x', rows: [] }));
      localStorage.setItem('trippy-offline-trip:t1', JSON.stringify({ userId: 'u1', data: { id: 't1' } }));
      await repo.clearAllUserData(options);
      expect(offlineKeys()).toEqual([]);
    }
  });

  it('stops, keeping the profile and the offline copies, when the trips cannot be deleted', async () => {
    localStorage.setItem('trippy-offline-trip-list', JSON.stringify({ userId: 'u1', savedAt: 'x', rows: [] }));
    fake.respond = () => ({ data: null, error: { message: 'permission denied' } });
    expect((await repo.clearAllUserData()).error).toMatch(/permission denied/);
    expect(fake.calls.map(c => c.table)).toEqual(['trips']);
    expect(offlineKeys()).toEqual(['trippy-offline-trip-list']);
  });

  it('does nothing when nobody is signed in', async () => {
    fake.user = null;
    expect(await repo.clearAllUserData({ keepProfile: true })).toEqual({ error: 'Not authenticated' });
    expect(fake.calls).toHaveLength(0);
  });
});
