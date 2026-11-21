// The profile summary kept on the device, so a start (also an offline one) has
// the name, home, passport and home currency before the profile row arrives.
// Stored under the key js/lib/locale.js already reads for the home flag.
// Only ever returned to the user it was saved for.
import { getUser } from '../lib/supabase.js';

const PROFILE_CACHE_KEY = 'trippy_profile_cache';

// The stored shape, in this order (pinned by profile-cache.test.js):
// { userId, home_flag, home_city, home_country, home_currency,
//   home_currency_symbol, display_name, is_nomad, nationality }
// `home_flag` is at the top level because getLocale() reads it there.
const TEXT_FIELDS = ['home_flag', 'home_city', 'home_country', 'home_currency', 'home_currency_symbol', 'display_name'];
const ROW_FIELDS = [...TEXT_FIELDS, 'is_nomad', 'nationality'];

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/**
 * User id of the session supabase-js persisted, readable before (or without)
 * a token refresh. Only used to pick this user's saved copies; it proves
 * nothing to the server.
 * @returns {string|null}
 */
export function storedSessionUserId() {
  const s = storage();
  if (!s) return null;
  try {
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const id = JSON.parse(s.getItem(key))?.user?.id;
      if (id) return id;
    }
  } catch { /* malformed session: treat as signed out */ }
  return null;
}

const currentUserId = () => getUser()?.id || storedSessionUserId();

const isRow = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  && ROW_FIELDS.some(field => Object.prototype.hasOwnProperty.call(value, field));

const textOrNull = (value) => (typeof value === 'string' && value.trim() ? value : null);

// A summary is only ever built from a profile row. Anything else (no row, the
// `{ onboarded, profile: null }` of a memoised check) gives null, never a
// summary full of nulls.
function toSummary(userId, row) {
  if (!userId || !isRow(row)) return null;
  const text = Object.fromEntries(TEXT_FIELDS.map(field => [field, textOrNull(row[field])]));
  return { userId, ...text, is_nomad: Boolean(row.is_nomad), nationality: textOrNull(row.nationality) };
}

/**
 * The saved summary of the signed-in user (before the session is restored:
 * of the user of the stored session), or null. A new object on every call.
 * @returns {{ userId: string, home_flag: string|null, home_city: string|null, home_country: string|null,
 *   home_currency: string|null, home_currency_symbol: string|null, display_name: string|null,
 *   is_nomad: boolean, nationality: string|null } | null}
 */
export function getProfileSummary() {
  const userId = currentUserId();
  if (!userId) return null;
  try {
    const saved = JSON.parse(storage()?.getItem(PROFILE_CACHE_KEY) || 'null');
    return saved && saved.userId === userId ? toSummary(userId, saved) : null;
  } catch {
    return null;
  }
}

/**
 * Saves the summary of a profile row for one user and returns it. Never saves
 * a null: without a user id or a profile row nothing is written and the
 * result is null. The row is not changed.
 * @param {string} userId
 * @param {object} profile a row of `profiles` (any selection of its columns)
 */
export function saveProfileSummary(userId, profile) {
  const summary = toSummary(userId, profile);
  if (!summary) return null;
  try { storage()?.setItem(PROFILE_CACHE_KEY, JSON.stringify(summary)); } catch { /* full or closed: the next start fetches */ }
  return summary;
}

/**
 * Writes a change of some profile columns into the saved summary of the
 * signed-in user and returns the summary. Call it after the profile row took
 * the same change, so the summary does not lag behind until the next start.
 * Without a saved summary nothing is written and the result is null (a patch
 * is not a profile row: the next fetch saves the whole one). A patch with no
 * summary column leaves the summary as it is.
 * @param {object} patch some columns of `profiles`, for example `{ nationality }`
 */
export function mergeProfileSummary(patch) {
  const saved = getProfileSummary();
  if (!saved || !isRow(patch)) return saved;
  const columns = Object.fromEntries(ROW_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(patch, field)).map(field => [field, patch[field]]));
  return saveProfileSummary(saved.userId, { ...saved, ...columns });
}

// The profile fetch in flight (or the last one), with the user it was started for.
let tracked = null;

/** Removes the saved summary and forgets the tracked fetch (sign-out). */
export function clearProfileSummary() {
  tracked = null;
  try { storage()?.removeItem(PROFILE_CACHE_KEY); } catch { /* nothing saved */ }
}

/**
 * Hands over the promise of the profile fetch, so profileSummaryReady() can
 * wait for it. The fetch is expected to call saveProfileSummary() before it
 * resolves; it may also resolve with the profile row, or with
 * `{ profile: row }`, which is used when the summary could not be stored.
 * @param {Promise<unknown>} promise
 * @returns {Promise<unknown>} the same promise
 */
export function trackProfileFetch(promise) {
  tracked = {
    userId: currentUserId(),
    settled: Promise.resolve(promise).then(value => value, () => null),
  };
  return promise;
}

/**
 * Resolves with the summary from the cache, else waits for the tracked fetch
 * and resolves with what it saved (or fetched), else with null. Never rejects.
 */
export async function profileSummaryReady() {
  for (;;) {
    const cached = getProfileSummary();
    if (cached) return cached;
    const fetch = tracked;
    if (!fetch) return null;
    const value = await fetch.settled;
    if (tracked !== fetch) continue; // a newer fetch, or a sign-out, took its place
    const userId = currentUserId();
    if (!userId || userId !== fetch.userId) return getProfileSummary();
    return getProfileSummary() || toSummary(userId, isRow(value) ? value : value?.profile);
  }
}
