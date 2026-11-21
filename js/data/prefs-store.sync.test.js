// The prefs store against the server: read, merge, write (blueprint 5.2).
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// The real client module would connect to the project named in .env.local. No test here may reach it.
vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => null, hasLocalSession: () => false }));

const { createPrefsStore, PREFS_KEY } = await import('./prefs-store.js');
const { MON, T0, USER, clone, env, memoryStorage, setup } = await import('./prefs-store.test-kit.js');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('syncPrefs', () => {
  it('is read, merge, write with the two requests of blueprint 5.2', async () => {
    const { store, api, server, storage } = setup({ server: { prefs: env({ view: 'departures' }, { view: MON }) } });
    store.initPrefs();
    store.setPref('timeFormat', '24h');
    await expect(store.syncPrefs()).resolves.toBe('synced');

    expect(api.calls.map((call) => call.op)).toEqual(['read', 'write']);
    expect(api.calls[0]).toEqual({ op: 'read', table: 'profiles', columns: 'prefs', column: 'id', id: USER });
    expect(api.calls[1]).toMatchObject({ op: 'write', table: 'profiles', column: 'id', id: USER });
    expect(Object.keys(api.calls[1].patch)).toEqual(['prefs']);
    const now = new Date(T0).toISOString();
    expect(server.prefs).toEqual(env({ view: 'departures', timeFormat: '24h' }, { view: MON, timeFormat: now }));
    expect(store.getPrefs()).toMatchObject({ view: 'departures', timeFormat: '24h' });
    expect(storage.json(PREFS_KEY)).toEqual({ v: 1, values: { timeFormat: '24h', view: 'departures' }, at: { timeFormat: now, view: MON }, userId: USER, dirty: [] });
  });
  it('skips the write when nothing differs', async () => {
    const { store, api } = setup({ server: { prefs: env({ view: 'departures' }, { view: MON }) } });
    store.initPrefs();
    await expect(store.syncPrefs()).resolves.toBe('synced');
    await expect(store.syncPrefs()).resolves.toBe('synced');
    expect(api.reads()).toHaveLength(2);
    expect(api.writes()).toEqual([]);
  });
  it('skips the write on a fresh device against the server default {}', async () => {
    const { store, api } = setup({ stored: { 'trippy-theme': 'dark' }, server: { prefs: {} } });
    store.initPrefs();
    await store.syncPrefs();
    expect(api.writes()).toEqual([]);
    expect(store.getPrefs().theme).toBe('dark');
  });
  it('does nothing when signed out', async () => {
    const { store, api } = setup({ userId: null, session: false });
    store.initPrefs();
    store.setPref('theme', 'dark');
    await vi.advanceTimersByTimeAsync(800);
    await expect(store.syncPrefs()).resolves.toBe('signed-out');
    expect(api.calls).toEqual([]);
    expect(store.pendingPrefKeys()).toEqual(['theme']);
  });
  it('a read that fails with the undefined-column code 42703 switches the session to local only', async () => {
    const { store, api, storage } = setup({ server: { readError: { code: '42703', message: 'column profiles.prefs does not exist' } } });
    store.initPrefs();
    expect(store.remotePrefsState()).toBe('unknown');
    await expect(store.syncPrefs()).resolves.toBe('unavailable');
    expect(store.remotePrefsState()).toBe('unavailable');

    store.setPref('view', 'concierge');
    await vi.advanceTimersByTimeAsync(5000);
    await expect(store.syncPrefs()).resolves.toBe('unavailable');
    expect(api.calls.map((call) => call.op)).toEqual(['read']);
    expect(store.getPrefs().view).toBe('concierge');
    expect(storage.json(PREFS_KEY).dirty).toEqual(['view']);
  });
  it('a write that fails with PGRST204 does the same', async () => {
    const { store, api } = setup({ server: { prefs: {}, writeError: { code: 'PGRST204', message: "Could not find the 'prefs' column" } } });
    store.initPrefs();
    store.setPref('view', 'concierge');
    await expect(store.syncPrefs()).resolves.toBe('unavailable');
    expect(store.remotePrefsState()).toBe('unavailable');
    store.setPref('theme', 'dark');
    await vi.advanceTimersByTimeAsync(5000);
    await store.syncPrefs();
    expect(api.calls.map((call) => call.op)).toEqual(['read', 'write']);
    expect(store.pendingPrefKeys()).toEqual(['view', 'theme']);
  });
  it('is local only when no client is configured', async () => {
    const { store } = setup({ client: null });
    store.initPrefs();
    store.setPref('theme', 'dark');
    await expect(store.syncPrefs()).resolves.toBe('unavailable');
    expect(store.remotePrefsState()).toBe('unavailable');
  });
  it('a network error on the read leaves the keys dirty, and a later syncPrefs() retries', async () => {
    const { store, api, server, storage } = setup({ server: { prefs: {}, throws: true } });
    store.initPrefs();
    store.setPref('timeFormat', '24h');
    await expect(store.syncPrefs()).resolves.toBe('error');
    expect(store.remotePrefsState()).toBe('unknown');
    expect(storage.json(PREFS_KEY).dirty).toEqual(['timeFormat']);
    expect(store.pendingPrefKeys()).toEqual(['timeFormat']);
    expect(store.getPrefs().timeFormat).toBe('24h');

    server.throws = false;
    await expect(store.syncPrefs()).resolves.toBe('synced');
    expect(api.calls.map((call) => call.op)).toEqual(['read', 'read', 'write']);
    expect(server.prefs.values).toEqual({ timeFormat: '24h' });
    expect(store.pendingPrefKeys()).toEqual([]);
    expect(store.remotePrefsState()).toBe('available');
  });
  it('an error on the write (not a missing column) leaves the keys dirty for the next sync', async () => {
    const { store, server, storage } = setup({ server: { prefs: {}, writeError: { code: '57014', message: 'timeout' } } });
    store.initPrefs();
    store.setPref('temperatureUnit', 'F');
    await expect(store.syncPrefs()).resolves.toBe('error');
    expect(store.remotePrefsState()).toBe('available');
    expect(storage.json(PREFS_KEY).dirty).toEqual(['temperatureUnit']);
    server.writeError = null;
    await expect(store.syncPrefs()).resolves.toBe('synced');
    expect(server.prefs.values).toEqual({ temperatureUnit: 'F' });
    expect(storage.json(PREFS_KEY).dirty).toEqual([]);
  });
  it('a higher remote version is read by the same rule and never overwritten', async () => {
    const future = env({ view: 'departures', layout: { columns: 3 } }, { view: MON, layout: MON }, 2);
    const { store, api, server } = setup({ server: { prefs: clone(future) } });
    store.initPrefs();
    store.setPref('timeFormat', '24h');
    await expect(store.syncPrefs()).resolves.toBe('read-only');
    await vi.advanceTimersByTimeAsync(5000);
    await store.syncPrefs();
    expect(api.writes()).toEqual([]);
    expect(server.prefs).toEqual(future);
    expect(store.getPrefs()).toMatchObject({ view: 'departures', timeFormat: '24h' });
    expect(store.pendingPrefKeys()).toEqual(['timeFormat']);
  });
  it('writes nothing when the account has no profile row', async () => {
    const { store, api } = setup({ server: { row: false } });
    store.initPrefs();
    store.setPref('theme', 'dark');
    await expect(store.syncPrefs()).resolves.toBe('synced');
    expect(api.writes()).toEqual([]);
    expect(store.remotePrefsState()).toBe('available');
    expect(store.pendingPrefKeys()).toEqual(['theme']);
  });
  it('never sends a legacy theme or another unstamped value', async () => {
    const { store, server } = setup({ stored: { 'trippy-theme': 'light' }, server: { prefs: {} } });
    store.initPrefs();
    store.setPref('view', 'concierge');
    await store.syncPrefs();
    expect(server.prefs.values).toEqual({ view: 'concierge' });
  });
  it('a change made while a sync is in flight is sent by one more pass', async () => {
    let open;
    const server = { prefs: {}, gate: new Promise((resolve) => { open = resolve; }) };
    const { store, api } = setup({ server });
    store.initPrefs();
    store.setPref('timeFormat', '24h');
    const first = store.syncPrefs();
    store.setPref('temperatureUnit', 'F');
    const second = store.syncPrefs();
    server.gate = null;
    open();
    await Promise.all([first, second]);
    await vi.advanceTimersByTimeAsync(800);
    expect(server.prefs.values).toEqual({ timeFormat: '24h', temperatureUnit: 'F' });
    expect(store.pendingPrefKeys()).toEqual([]);
    expect(api.writes().length).toBeLessThanOrEqual(2);
  });
  it('a key changed while the write is out stays dirty and goes with the next sync', async () => {
    let open;
    const server = { prefs: {}, writeGate: new Promise((resolve) => { open = resolve; }) };
    const { store, api, storage } = setup({ server });
    store.initPrefs();
    store.setPref('timeFormat', '24h');
    const first = store.syncPrefs();
    await vi.advanceTimersByTimeAsync(0); // the read is back, the write is out
    expect(api.calls.map((call) => call.op)).toEqual(['read', 'write']);
    vi.setSystemTime(T0 + 50);
    store.setPrefs({ temperatureUnit: 'F', timeFormat: '12h' });
    server.writeGate = null;
    open();
    await expect(first).resolves.toBe('synced');
    expect(server.prefs.values).toEqual({ timeFormat: '24h' });
    expect(storage.json(PREFS_KEY).dirty).toEqual(['timeFormat', 'temperatureUnit']);

    await vi.advanceTimersByTimeAsync(800);
    expect(server.prefs.values).toEqual({ timeFormat: '12h', temperatureUnit: 'F' });
    expect(store.pendingPrefKeys()).toEqual([]);
  });
  it('can be held to one run per interval', async () => {
    const { store, api } = setup();
    store.initPrefs();
    await expect(store.syncPrefs({ minIntervalMs: 60000 })).resolves.toBe('synced');
    await expect(store.syncPrefs({ minIntervalMs: 60000 })).resolves.toBe('skipped');
    expect(api.reads()).toHaveLength(1);
    vi.setSystemTime(T0 + 60001);
    await expect(store.syncPrefs({ minIntervalMs: 60000 })).resolves.toBe('synced');
    expect(api.reads()).toHaveLength(2);
    await expect(store.syncPrefs()).resolves.toBe('synced');
    expect(api.reads()).toHaveLength(3);
  });
  it('never rejects, whatever the client does', async () => {
    const store = createPrefsStore({
      storage: memoryStorage(), getUserId: () => USER, hasSession: () => true, apply: () => {},
      client: { from: () => { throw new Error('client broke'); } },
    });
    store.initPrefs();
    await expect(store.syncPrefs()).resolves.toBe('error');
  });
});
