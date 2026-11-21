// Preferences: the schema, the defaults, validation and the key-by-key merge between a device and the
// server (blueprint 2.5, 5.1, 5.2). Pure: no DOM, no storage, no network. js/data/prefs-store.js is the
// only caller that reads or writes anything. Owner: F1.

/**
 * @typedef {'departures'|'concierge'|'atlas'} ViewId
 *
 * @typedef {Object} Prefs                    the values the app reads
 * @property {ViewId} view                    default 'atlas'
 * @property {boolean} viewChooserSeen        default false
 * @property {'dark'|'light'|'system'} theme  default 'system'
 * @property {'system'|'reduce'} motion       default 'system'
 * @property {'12h'|'24h'} timeFormat         default '12h'
 * @property {'C'|'F'} temperatureUnit        default 'C'
 * @property {boolean} homeCurrencyFirst      default true
 * @property {boolean} openTodayFirst         default true
 * @property {boolean} autoOpenNextDay        default true
 * @property {boolean} showVenuePhotos        default true
 *
 * @typedef {Object} PrefsEnvelope            what is stored, on the device and in profiles.prefs
 * @property {number} v                       1 for this build
 * @property {Object<string, *>} values       values as they came; keys and values this build does not know are
 *                                            carried through untouched (normalisePrefs decides what is applied)
 * @property {Object<string, string>} at      ISO time of the last explicit choice, per key. A key with no entry
 *                                            was never chosen on purpose (a default, or a migrated legacy theme).
 */

export const PREFS_VERSION = 1;

export const VIEW_IDS = Object.freeze(['departures', 'concierge', 'atlas']);

export const DEFAULT_PREFS = Object.freeze({
  view: 'atlas', viewChooserSeen: false, theme: 'system', motion: 'system', timeFormat: '12h', temperatureUnit: 'C',
  homeCurrencyFirst: true, openTodayFirst: true, autoOpenNextDay: true, showVenuePhotos: true,
});

/** Keys whose change needs the open route to render again when it arrives from another device. */
export const RERENDER_KEYS = Object.freeze(['view', 'timeFormat', 'temperatureUnit', 'homeCurrencyFirst', 'showVenuePhotos']);

/** The allowed values of each key: a list, or 'boolean'. */
const SCHEMA = Object.freeze({
  view: VIEW_IDS,
  viewChooserSeen: 'boolean',
  theme: Object.freeze(['dark', 'light', 'system']),
  motion: Object.freeze(['system', 'reduce']),
  timeFormat: Object.freeze(['12h', '24h']),
  temperatureUnit: Object.freeze(['C', 'F']),
  homeCurrencyFirst: 'boolean',
  openTodayFirst: 'boolean',
  autoOpenNextDay: 'boolean',
  showVenuePhotos: 'boolean',
});
const PREF_KEYS = Object.freeze(Object.keys(DEFAULT_PREFS));
/** The one key that merges with OR: once any device has dismissed the chooser it stays dismissed. */
const STICKY_TRUE_KEY = 'viewChooserSeen';
/** What a device keeps when another account signs in on it, so the screen does not flash. */
const KEPT_ACROSS_USERS = Object.freeze(['theme', 'motion']);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isKnown = (key) => own(SCHEMA, key);
const isValid = (key, value) => (SCHEMA[key] === 'boolean' ? typeof value === 'boolean' : SCHEMA[key].includes(value));
const safeKeys = (object) => Object.keys(object).filter((key) => !UNSAFE_KEYS.has(key));
const timeOf = (iso) => (typeof iso === 'string' ? Date.parse(iso) : NaN);

/** @returns {PrefsEnvelope} */
export function emptyEnvelope() {
  return { v: PREFS_VERSION, values: {}, at: {} };
}

/**
 * A complete, valid Prefs from anything: a known key whose value is not allowed becomes its default.
 * Run on what comes out of localStorage and on what comes back from the server. Never throws.
 * @param {*} raw the `values` of an envelope
 * @returns {Prefs}
 */
export function normalisePrefs(raw) {
  const source = isPlainObject(raw) ? raw : {};
  return Object.fromEntries(PREF_KEYS.map((key) => [
    key,
    own(source, key) && isValid(key, source[key]) ? source[key] : DEFAULT_PREFS[key],
  ]));
}

/**
 * The shape of an envelope from anything. Values are kept as they came, known or not, so that an older
 * build never erases what a newer build stored; a timestamp is kept only when it is a time and its key
 * has a value. Never throws.
 * @param {*} raw
 * @returns {PrefsEnvelope} a new object
 */
export function normaliseEnvelope(raw) {
  if (!isPlainObject(raw)) return emptyEnvelope();
  const values = isPlainObject(raw.values)
    ? Object.fromEntries(safeKeys(raw.values).filter((key) => raw.values[key] !== undefined).map((key) => [key, raw.values[key]]))
    : {};
  const at = isPlainObject(raw.at)
    ? Object.fromEntries(safeKeys(raw.at).filter((key) => own(values, key) && Number.isFinite(timeOf(raw.at[key]))).map((key) => [key, raw.at[key]]))
    : {};
  return { v: Number.isInteger(raw.v) && raw.v >= 1 ? raw.v : PREFS_VERSION, values, at };
}

/**
 * What setPref uses to refuse a bad write from code.
 * @param {*} patch
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePatch(patch) {
  if (!isPlainObject(patch)) return { ok: false, errors: ['A preference patch must be an object'] };
  const errors = Object.keys(patch).flatMap((key) => {
    if (!isKnown(key)) return [`Unknown preference "${key}"`];
    return isValid(key, patch[key]) ? [] : [`Invalid value for "${key}"`];
  });
  return { ok: errors.length === 0, errors };
}

/**
 * The only way a timestamp is written. A choice of the value that is already there is stamped too:
 * it is still a choice.
 * @param {PrefsEnvelope} envelope
 * @param {Object<string, *>} patch already checked with validatePatch
 * @param {string} nowIso
 * @returns {PrefsEnvelope} a new envelope with the patched values and at[key] = nowIso for each patched key
 */
export function stampPatch(envelope, patch, nowIso) {
  const base = normaliseEnvelope(envelope);
  const keys = isPlainObject(patch) ? safeKeys(patch) : [];
  return {
    v: base.v,
    values: { ...base.values, ...Object.fromEntries(keys.map((key) => [key, patch[key]])) },
    at: { ...base.at, ...Object.fromEntries(keys.map((key) => [key, nowIso])) },
  };
}

/**
 * A theme stored by the app before prefs existed becomes a value with no timestamp: it never beats an
 * explicit choice made on another device, and another device's default never replaces it.
 * @param {{ theme?: * }} [legacy] the old `trippy-theme` value
 * @returns {PrefsEnvelope}
 */
export function migrateLegacy({ theme } = {}) {
  return theme === 'light' || theme === 'dark' ? { ...emptyEnvelope(), values: { theme } } : emptyEnvelope();
}

/** @returns {{ value: *, at: string|undefined }|null} what one side holds for a key, null when nothing */
const held = (envelope, key) => (own(envelope.values, key) ? { value: envelope.values[key], at: envelope.at[key] } : null);

/** One row of the merge table (blueprint 5.2). Null means the device keeps no value for the key. */
function mergeKey(key, local, remote) {
  if (key === STICKY_TRUE_KEY) {
    // Either side true wins. The server's entry is taken when it is true, so two devices that have both
    // dismissed the chooser settle on one timestamp and stop writing.
    if (remote?.value === true) return remote;
    if (local?.value === true) return local;
  }
  const localTime = timeOf(local?.at);
  const remoteTime = timeOf(remote?.at);
  if (Number.isFinite(remoteTime) && (!Number.isFinite(localTime) || remoteTime > localTime)) return remote;
  return local; // stamped beats unstamped, a tie keeps local, and an unstamped server value is never taken
}

/**
 * The device's new envelope after a read of the server's: key by key, by the table in blueprint 5.2.
 * @param {PrefsEnvelope} local
 * @param {PrefsEnvelope} remote
 * @returns {PrefsEnvelope} a new envelope; neither input is changed
 */
export function mergeEnvelopes(local, remote) {
  const mine = normaliseEnvelope(local);
  const theirs = normaliseEnvelope(remote);
  const keys = [...new Set([...Object.keys(mine.values), ...Object.keys(theirs.values)])];
  const kept = keys.map((key) => [key, mergeKey(key, held(mine, key), held(theirs, key))]).filter(([, entry]) => entry !== null);
  return {
    v: Math.max(mine.v, theirs.v),
    values: Object.fromEntries(kept.map(([key, entry]) => [key, entry.value])),
    at: Object.fromEntries(kept.filter(([, entry]) => entry.at !== undefined).map(([key, entry]) => [key, entry.at])),
  };
}

/**
 * What a device writes back after a merge: everything the server already holds, plus every key the
 * merged envelope carries a timestamp for. An unstamped value (a default, a legacy theme) never leaves
 * its device, and nothing the server holds is removed. The store writes only when this differs from
 * what it read (sameEnvelope).
 * @param {PrefsEnvelope} merged the result of mergeEnvelopes(local, remote)
 * @param {PrefsEnvelope} remote what was read
 * @returns {PrefsEnvelope}
 */
export function envelopeForServer(merged, remote) {
  const mine = normaliseEnvelope(merged);
  const theirs = normaliseEnvelope(remote);
  const stamped = Object.keys(mine.at);
  const seen = mine.values[STICKY_TRUE_KEY] === true ? { [STICKY_TRUE_KEY]: true } : {};
  return {
    v: PREFS_VERSION,
    values: { ...theirs.values, ...seen, ...Object.fromEntries(stamped.map((key) => [key, mine.values[key]])) },
    at: { ...theirs.at, ...mine.at },
  };
}

/** JSON with sorted keys, so two objects with the same content give the same text. */
function stableText(value) {
  if (Array.isArray(value)) return `[${value.map(stableText).join(',')}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableText(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** @returns {boolean} true when two envelopes hold the same version, values and timestamps */
export function sameEnvelope(a, b) {
  return stableText(normaliseEnvelope(a)) === stableText(normaliseEnvelope(b));
}

/**
 * The device copy for an account other than the one it was made for: values return to the defaults,
 * timestamps go, theme and motion stay (unstamped). One account's choices never reach the next one.
 * @param {PrefsEnvelope} envelope
 * @returns {PrefsEnvelope}
 */
export function envelopeForNewUser(envelope) {
  const { values } = normaliseEnvelope(envelope);
  return {
    ...emptyEnvelope(),
    values: Object.fromEntries(KEPT_ACROSS_USERS.filter((key) => own(values, key)).map((key) => [key, values[key]])),
  };
}

/** @returns {string[]} the known keys whose value differs between two Prefs */
export function changedPrefKeys(before, after) {
  return PREF_KEYS.filter((key) => before?.[key] !== after?.[key]);
}

const RELOADABLE_ROUTES = [/^\/$/, /^\/trip\/[^/]+$/];

/**
 * Whether main.js renders the route again for prefs that arrived from another device (blueprint 4.4):
 * only the dashboard and a trip page, only for a key that changes what they print, and never under a
 * user who has touched the page or has something open.
 * @param {{ path?: string, changedKeys?: string[], touched?: boolean, busy?: boolean }} [input]
 *   path: the route, with or without the leading '#' and a query; touched: a pointer or key event since
 *   the page rendered; busy: a dialog, edit mode, a chat draft or a focused text field
 * @returns {boolean}
 */
export function shouldReloadForRemotePrefs({ path, changedKeys, touched, busy } = {}) {
  if (typeof path !== 'string' || touched || busy) return false;
  if (!Array.isArray(changedKeys) || !changedKeys.some((key) => RERENDER_KEYS.includes(key))) return false;
  const route = path.replace(/^#/, '').split('?')[0] || '/';
  return RELOADABLE_ROUTES.some((pattern) => pattern.test(route));
}
