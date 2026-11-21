// Preferences on this device and in the account (blueprint 5.2): localStorage first, always, and
// profiles.prefs when that column exists. Reads, writes and syncs; applies each change to the document
// and to the display formatters. The rules (schema, merge) are in js/lib/prefs.js. Owner: F1.
import { supabase, getUser, hasLocalSession } from '../lib/supabase.js';
import {
  DEFAULT_PREFS, PREFS_VERSION, changedPrefKeys, envelopeForNewUser, envelopeForServer, mergeEnvelopes,
  migrateLegacy, normaliseEnvelope, normalisePrefs, sameEnvelope, stampPatch, validatePatch,
} from '../lib/prefs.js';
import { applyTheme } from '../lib/theme.js';
import { applyMotion } from '../lib/motion.js';
import { setDisplayPrefs } from '../lib/locale.js';

/** The device copy: `{ v, values, at, userId, dirty }`. */
export const PREFS_KEY = 'trippy_prefs_v1';
/** Plain keys the boot script in index.html reads before any module runs. */
export const MIRROR_KEYS = Object.freeze({ theme: 'trippy-theme', view: 'trippy-view', motion: 'trippy-motion' });

const SYNC_DELAY_MS = 800;
const READY_TIMEOUT_MS = 300;
/** Postgres on the read, PostgREST on the write: profiles.prefs is not there yet (migration 022). */
const MISSING_COLUMN_CODES = ['42703', 'PGRST204'];

const isMissingColumn = (error) => MISSING_COLUMN_CODES.includes(String(error?.code ?? ''));

function browserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // storage withheld (privacy mode, a sandboxed frame)
  }
}

/** Document-level effects of the prefs: theme, motion, the boot attribute for the view, the formatters. */
function applyToDocument(prefs) {
  applyTheme(prefs.theme);
  applyMotion(prefs.motion);
  setDisplayPrefs({ timeFormat: prefs.timeFormat, temperatureUnit: prefs.temperatureUnit });
  if (typeof document !== 'undefined') document.documentElement?.setAttribute('data-view-pref', prefs.view);
}

/** The browser's storage event: fired in every other tab and window of the app when one writes localStorage. */
function browserStorageEvents(listener) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener('storage', (event) => { if (event.key === PREFS_KEY) listener(); });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

/**
 * One prefs store. The app uses the instance exported at the bottom; tests pass their own storage and
 * client.
 * @param {Object} [deps]
 * @param {{ getItem: Function, setItem: Function, removeItem: Function }|null} [deps.storage] default localStorage
 * @param {Object|null} [deps.client] a Supabase client; null means there is no server
 * @param {() => string|null} [deps.getUserId] the signed-in user's id
 * @param {() => boolean} [deps.hasSession] whether a session exists or is being restored
 * @param {(prefs: import('../lib/prefs.js').Prefs, changedKeys: string[]) => void} [deps.apply]
 * @param {(listener: () => void) => void} [deps.onStorageChange] calls the listener when another tab or
 *   window has written the device copy; by default the window's storage event
 */
export function createPrefsStore({
  storage,
  client = supabase,
  getUserId = () => getUser()?.id ?? null,
  hasSession = () => hasLocalSession() || Boolean(getUser()),
  apply = applyToDocument,
  onStorageChange = browserStorageEvents,
} = {}) {
  let copy = { ...normaliseEnvelope(null), userId: null, dirty: [] };
  let prefs = Object.freeze({ ...DEFAULT_PREFS });
  let loaded = false;
  let remote = 'unknown';
  let firstRead = deferred();
  let timer = null;
  let inFlight = null;
  let queued = false;
  let lastSyncAt = null;
  let listening = false;
  const subscribers = new Set();

  // --- storage: every call may throw (blocked, full), and a preference is never worth an error ---
  const store = () => (storage === undefined ? browserStorage() : storage);
  const readKey = (key) => { try { return store()?.getItem(key) ?? null; } catch { return null; } };
  const writeKey = (key, value) => { try { store()?.setItem(key, value); } catch { /* kept in memory only */ } };
  const removeKey = (key) => { try { store()?.removeItem(key); } catch { /* nothing to remove */ } };

  function readCopy() {
    let raw = null;
    try { raw = JSON.parse(readKey(PREFS_KEY) ?? 'null'); } catch { raw = null; }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ...migrateLegacy({ theme: readKey(MIRROR_KEYS.theme) }), userId: null, dirty: [] };
    }
    return {
      ...normaliseEnvelope(raw),
      v: PREFS_VERSION,
      userId: typeof raw.userId === 'string' && raw.userId ? raw.userId : null,
      dirty: Array.isArray(raw.dirty) ? raw.dirty.filter((key) => typeof key === 'string') : [],
    };
  }
  function ensureLoaded() {
    if (loaded) return;
    copy = readCopy();
    prefs = Object.freeze(normalisePrefs(copy.values));
    loaded = true;
  }
  const persist = () => writeKey(PREFS_KEY, JSON.stringify({ v: copy.v, values: copy.values, at: copy.at, userId: copy.userId, dirty: copy.dirty }));
  function writeMirrors() {
    if (prefs.theme === 'system') removeKey(MIRROR_KEYS.theme);
    else writeKey(MIRROR_KEYS.theme, prefs.theme);
    writeKey(MIRROR_KEYS.view, prefs.view);
    if (prefs.motion === 'reduce') writeKey(MIRROR_KEYS.motion, 'reduce');
    else removeKey(MIRROR_KEYS.motion);
  }
  function applyNow(changedKeys) {
    try { apply(prefs, changedKeys); } catch { /* no document, or a broken one: the values still hold */ }
  }
  function notify(changedKeys, origin) {
    for (const callback of [...subscribers]) {
      try { callback(prefs, [...changedKeys], { origin }); } catch { /* one listener must not stop the rest */ }
    }
  }

  /** The one place the device copy changes: store it, then mirror, apply and tell, in that order. */
  function commit(envelope, { userId = copy.userId, dirty = copy.dirty, origin }) {
    const before = prefs;
    copy = { v: PREFS_VERSION, values: envelope.values, at: envelope.at, userId, dirty };
    prefs = Object.freeze(normalisePrefs(copy.values));
    persist();
    const changedKeys = changedPrefKeys(before, prefs);
    if (!changedKeys.length) return;
    writeMirrors();
    applyNow(changedKeys);
    notify(changedKeys, origin);
  }
  /**
   * Another tab or window of the app may have written the device copy since it was read here. Take
   * what it holds that is newer, key by key, so that a write from this tab never puts an older value
   * back. A copy of another account, or no copy at all, is left alone. What is taken is applied and
   * told with origin 'remote': it was not chosen on this page.
   */
  function absorbDeviceCopy() {
    if (!loaded || readKey(PREFS_KEY) === null) return;
    const stored = readCopy();
    if (stored.userId !== copy.userId) return;
    const merged = mergeEnvelopes(copy, stored);
    // A key both hold with the same timestamp is pending only while the stored copy says so (the
    // other tab may have synced it); a key this tab holds something else for stays as it is here.
    const dirty = [...new Set([
      ...stored.dirty.filter((key) => merged.at[key] === stored.at[key]),
      ...copy.dirty.filter((key) => merged.at[key] !== stored.at[key]),
    ])];
    const sameDirty = dirty.length === copy.dirty.length && dirty.every((key) => copy.dirty.includes(key));
    if (sameDirty && sameEnvelope(merged, copy)) return;
    commit(merged, { dirty, origin: 'remote' });
  }
  function setDirty(dirty) {
    copy = { ...copy, dirty };
    persist();
  }
  function stopTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  function markUnavailable() {
    remote = 'unavailable';
    stopTimer();
    firstRead.resolve();
  }

  /** Synchronous: reads the device copy, validates it and applies theme, motion and display prefs. Never throws. */
  function initPrefs() {
    loaded = false;
    ensureLoaded();
    if (readKey(PREFS_KEY) === null && Object.keys(copy.values).length) persist(); // a migrated legacy theme
    writeMirrors();
    applyNow(Object.keys(DEFAULT_PREFS));
    if (!listening) {
      listening = true;
      try { onStorageChange(absorbDeviceCopy); } catch { /* no events: setPrefs and the sync still read the copy first */ }
    }
    return prefs;
  }

  /** @returns {Readonly<import('../lib/prefs.js').Prefs>} the current prefs, frozen */
  function getPrefs() {
    ensureLoaded();
    return prefs;
  }

  /**
   * Validates, stamps, writes localStorage, applies, notifies with origin 'local', then schedules a sync.
   * @returns {{ ok: boolean, errors: string[] }} a refused patch changes nothing
   */
  function setPrefs(patch) {
    const check = validatePatch(patch);
    if (!check.ok) return check;
    const keys = Object.keys(patch);
    if (!keys.length) return check;
    ensureLoaded();
    absorbDeviceCopy(); // the whole copy is written below: first take what another tab stored since
    commit(stampPatch(copy, patch, new Date().toISOString()), { dirty: [...new Set([...copy.dirty, ...keys])], origin: 'local' });
    if (remote !== 'unavailable') {
      stopTimer();
      timer = setTimeout(() => { timer = null; syncPrefs(); }, SYNC_DELAY_MS);
    }
    return check;
  }
  const setPref = (key, value) => setPrefs({ [key]: value });

  /** The callback gets (prefs, changedKeys, { origin: 'local' or 'remote' }). @returns a function that unsubscribes */
  function onPrefsChange(callback) {
    subscribers.add(callback);
    return () => { subscribers.delete(callback); };
  }

  /**
   * The device copy now belongs to this account. An untagged copy (made before sign-in) is tagged and
   * kept. Another account's copy is reset: values to the defaults, no timestamps, no dirty keys; theme
   * and motion stay, unstamped, so the screen does not flash. Subscribers hear origin 'local'.
   */
  function adoptUser(userId) {
    if (typeof userId !== 'string' || !userId) return;
    ensureLoaded();
    if (copy.userId === userId) return;
    if (copy.userId === null) {
      copy = { ...copy, userId };
      persist();
      return;
    }
    stopTimer();
    if (remote !== 'unavailable') remote = 'unknown'; // what this account's row holds has not been read
    firstRead.resolve();
    firstRead = deferred();
    commit(envelopeForNewUser(copy), { userId, dirty: [], origin: 'local' });
  }

  async function request(make) {
    try {
      return (await make()) ?? { data: null, error: new Error('No response') };
    } catch (error) {
      return { data: null, error };
    }
  }

  /** Read, merge, write. @returns {Promise<'signed-out'|'unavailable'|'error'|'read-only'|'synced'>} */
  async function syncOnce() {
    ensureLoaded();
    const userId = getUserId();
    if (!userId) return 'signed-out';
    if (remote === 'unavailable') return 'unavailable';
    if (!client) {
      markUnavailable();
      return 'unavailable';
    }
    adoptUser(userId);

    const read = await request(() => client.from('profiles').select('prefs').eq('id', userId).maybeSingle());
    if (read.error) {
      if (isMissingColumn(read.error)) markUnavailable();
      firstRead.resolve();
      return remote === 'unavailable' ? 'unavailable' : 'error';
    }
    if (copy.userId !== userId) return 'error'; // another account was adopted while the read was out
    remote = 'available';
    absorbDeviceCopy();
    const theirs = normaliseEnvelope(read.data?.prefs);
    const merged = mergeEnvelopes(copy, theirs);
    commit(merged, { origin: 'remote' });
    firstRead.resolve();
    if (!read.data) return 'synced'; // no profile row: nothing to write to
    if (theirs.v > PREFS_VERSION) return 'read-only'; // a newer build's envelope is never overwritten
    const outbound = envelopeForServer(merged, theirs);
    if (sameEnvelope(outbound, theirs)) {
      if (copy.dirty.length) setDirty([]);
      return 'synced';
    }

    const write = await request(() => client.from('profiles').update({ prefs: outbound }).eq('id', userId));
    if (write.error) {
      if (isMissingColumn(write.error)) markUnavailable();
      return remote === 'unavailable' ? 'unavailable' : 'error'; // the keys stay dirty for the next sync
    }
    if (copy.userId === userId) setDirty(copy.dirty.filter((key) => copy.at[key] !== outbound.at[key])); // changed again meanwhile
    return 'synced';
  }

  /**
   * Read the server envelope, merge key by key, apply and notify (origin 'remote') what changed here,
   * and write back only when the server lacks something. Never rejects.
   * @param {{ minIntervalMs?: number }} [options] skip when the last run started less than this long ago
   * @returns {Promise<'signed-out'|'unavailable'|'error'|'read-only'|'synced'|'skipped'>}
   */
  function syncPrefs({ minIntervalMs = 0 } = {}) {
    if (inFlight) {
      if (!minIntervalMs) queued = true; // a change made meanwhile gets its own pass
      return inFlight;
    }
    if (minIntervalMs > 0 && lastSyncAt !== null && Date.now() - lastSyncAt < minIntervalMs) return Promise.resolve('skipped');
    lastSyncAt = Date.now();
    stopTimer();
    inFlight = (async () => {
      try {
        let result;
        do {
          queued = false;
          result = await syncOnce();
        } while (queued && result === 'synced');
        return result;
      } catch {
        return 'error';
      } finally {
        inFlight = null;
        queued = false;
      }
    })();
    return inFlight;
  }

  /**
   * Resolves when the view can be chosen: at once when the device copy has any timestamp, when there
   * is no session, or when the server state is known; otherwise when the first server read settles
   * or after 300 ms, whichever comes first.
   * @returns {Promise<void>}
   */
  async function prefsReady() {
    ensureLoaded();
    if (Object.keys(copy.at).length > 0 || !hasSession() || remote !== 'unknown') return;
    let timeout = null;
    await Promise.race([firstRead.promise, new Promise((done) => { timeout = setTimeout(done, READY_TIMEOUT_MS); })]);
    clearTimeout(timeout);
  }

  /** @returns {'unknown'|'available'|'unavailable'} what is known about profiles.prefs this session */
  const remotePrefsState = () => remote;
  /** @returns {string[]} the keys changed here and not yet stored in the account */
  const pendingPrefKeys = () => { ensureLoaded(); return [...copy.dirty]; };

  return { initPrefs, getPrefs, setPref, setPrefs, onPrefsChange, syncPrefs, prefsReady, adoptUser, remotePrefsState, pendingPrefKeys };
}

const appStore = createPrefsStore();

export const {
  initPrefs, getPrefs, setPref, setPrefs, onPrefsChange, syncPrefs, prefsReady, adoptUser, remotePrefsState, pendingPrefKeys,
} = appStore;
