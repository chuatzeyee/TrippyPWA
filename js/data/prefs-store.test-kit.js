// Shared by the prefs-store test files: a recording localStorage, a stand-in for the two requests the
// store makes, and a store built on both. Nothing here touches a network. Each test file mocks
// ../lib/supabase.js itself, before it imports this file.
import { createPrefsStore, PREFS_KEY } from './prefs-store.js';

export const USER = 'user-a';
export const OTHER = 'user-b';
export const T0 = Date.parse('2026-11-20T08:00:00.000Z');
export const SUN = '2026-11-15T09:00:00.000Z';
export const MON = '2026-11-16T09:00:00.000Z';
export const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
export const env = (values = {}, at = {}, v = 1) => ({ v, values, at });

/** localStorage with a record of what happened to it. `log` is shared with the client. */
export function memoryStorage(initial = {}, log = []) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { log.push(`local:set:${key}`); map.set(key, String(value)); },
    removeItem: (key) => { log.push(`local:remove:${key}`); map.delete(key); },
    json: (key) => JSON.parse(map.get(key) ?? 'null'),
  };
}

/** The two requests the store makes, answered from `server`. Nothing here touches a network. */
export function fakeClient(server, log = []) {
  const calls = [];
  const answer = async (kind, make) => {
    if (server.gate) await server.gate;
    if (server.throws) throw new TypeError('Failed to fetch');
    return make();
  };
  return {
    calls,
    reads: () => calls.filter((call) => call.op === 'read'),
    writes: () => calls.filter((call) => call.op === 'write'),
    from: (table) => ({
      select: (columns) => ({
        eq: (column, id) => ({
          maybeSingle: () => {
            calls.push({ op: 'read', table, columns, column, id });
            log.push('remote:read');
            return answer('read', () => {
              if (server.readError) return { data: null, error: server.readError };
              return { data: server.row === false ? null : { prefs: clone(server.prefs) }, error: null };
            });
          },
        }),
      }),
      update: (patch) => ({
        eq: (column, id) => {
          calls.push({ op: 'write', table, patch: clone(patch), column, id });
          log.push('remote:write');
          return answer('write', async () => {
            if (server.writeGate) await server.writeGate;
            if (server.writeError) return { error: server.writeError };
            server.prefs = clone(patch.prefs);
            return { error: null };
          });
        },
      }),
    }),
  };
}

export function setup({ stored = {}, server = { prefs: {} }, userId = USER, session = true, client } = {}) {
  const log = [];
  const storage = memoryStorage(stored, log);
  const api = client === null ? null : fakeClient(server, log);
  const applied = [];
  const who = { id: userId, session };
  const store = createPrefsStore({
    storage,
    client: api,
    getUserId: () => who.id,
    hasSession: () => who.session,
    apply: (prefs, changedKeys) => applied.push({ prefs, changedKeys }),
  });
  return { store, storage, server, api, applied, log, who };
}

export const storedCopy = (copy) => ({ [PREFS_KEY]: JSON.stringify({ v: 1, values: {}, at: {}, userId: null, dirty: [], ...copy }) });
