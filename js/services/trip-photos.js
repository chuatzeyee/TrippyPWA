// Ask the resolve-trip-photos edge function to find + store real photos for a
// trip the user owns (after a trip import, or resumed when an imported trip
// with pending photos is opened). The function works in small batches and
// reports `remaining`, so we re-invoke until it's done.
//
// Progress is broadcast as window 'trippy:photos' events with
// { tripId, done, total, finished, ok, added } so an open trip page can show a
// status line and patch photos in place. If no trip page for that trip is open
// when resolution finishes, a single toast reports the result instead.

const DEFAULT_MAX_CALLS = 15; // 15 x 8 venues: plenty for a 2-week trip

// A failed call (a non-2xx answer such as a 546 compute limit on one batch, or a
// network error) is retried after these waits, one per consecutive failure. A
// call that still fails after the last wait ends the run (4 failures in a row);
// a successful call resets the count. Retries count toward maxCalls.
export const RETRY_DELAYS_MS = [2000, 5000, 10000];

// Activity categories that never get a photo (getting from A to B is not a
// place to look at). Mirrors NO_PHOTO_CATEGORIES in
// supabase/functions/resolve-trip-photos/index.ts, which never resolves these,
// so a photo box for them would stay empty for good. Keep the two in sync.
export const NO_PHOTO_CATEGORIES = new Set(['transport', 'flight', 'arrival', 'departure']);

/**
 * True when an activity gets a photo block at all: it names a venue and is not
 * a getting-there category.
 * @param {{ venue_name?: string, category?: string }} activity
 * @returns {boolean}
 */
export function wantsActivityPhoto(activity) {
  return Boolean(activity?.venue_name) && !NO_PHOTO_CATEGORIES.has(String(activity.category || '').toLowerCase());
}

/**
 * An activity the photo worker has not handled yet: it wants a photo and has
 * neither a stored photo nor a verdict (photo_source).
 * @param {{ venue_name?: string, category?: string, photo_url?: string, photo_source?: string }} activity
 * @returns {boolean}
 */
export function isPendingPhoto(activity) {
  return wantsActivityPhoto(activity) && !activity.photo_url && !activity.photo_source;
}

// tripId -> { promise, done, total, added } for resolutions in flight.
const active = new Map();

export function isResolvingPhotos(tripId) {
  return active.has(tripId);
}

// Latest progress for a trip being resolved (null when idle), so a trip page
// rendered mid-resolution can show the status line straight away.
export function getPhotoProgress(tripId) {
  const s = active.get(tripId);
  return s ? { done: s.done, total: s.total, added: s.added } : null;
}

function emit(detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('trippy:photos', { detail }));
}

function tripPageOpen(tripId) {
  if (typeof document === 'undefined') return false;
  return [...document.querySelectorAll('.td-wrap[data-trip-id]')].some(el => el.dataset.tripId === tripId);
}

async function tripTitle(tripId) {
  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data } = await supabase.from('trips').select('title').eq('id', tripId).single();
    return data?.title || '';
  } catch {
    return '';
  }
}

async function notifyIfAway(tripId, result, title) {
  if (typeof document === 'undefined' || tripPageOpen(tripId)) return;
  const name = title || (await tripTitle(tripId)) || 'your trip';
  try {
    const { showToast } = await import('../components/toast.js');
    if (result.ok && result.photos > 0) showToast(`Photos added to ${name}`, 'success');
    else if (!result.ok) showToast(`We couldn't add photos to ${name} right now. Your trip is saved.`, 'info');
  } catch { /* toast is best effort */ }
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// HTTP status of a failed functions.invoke call, when the error carries the
// response (FunctionsHttpError.context is the Response). 0 when unknown.
function errorStatus(error) {
  const status = Number(error?.context?.status ?? error?.status);
  return Number.isFinite(status) ? status : 0;
}

// A 4xx answer (bad request, not the owner, daily limit reached) says the same
// thing on a retry; everything else (5xx, 546, network) may be transient.
function isRetryable(error) {
  const status = errorStatus(error);
  return !(status >= 400 && status < 500 && status !== 408);
}

async function runResolution(tripId, { invoke, onProgress, maxCalls, sleep }, state) {
  const call = invoke || (async (...args) => (await import('../lib/supabase.js')).supabase.functions.invoke(...args));
  let photos = 0;
  let cover = false;
  let failures = 0;
  try {
    for (let i = 0; i < maxCalls; i++) {
      let reply;
      let thrown = null;
      try {
        reply = await call('resolve-trip-photos', { body: { tripId, inline: true } });
      } catch (err) {
        thrown = err || new Error('Photo lookup failed');
      }
      const error = thrown || reply?.error || null;
      const data = thrown ? null : reply?.data;
      if (error || !data) {
        failures++;
        const message = error?.message || (thrown ? 'Photo lookup failed' : 'No response');
        const lastCall = i + 1 >= maxCalls;
        if (!isRetryable(error) || failures > RETRY_DELAYS_MS.length || lastCall) {
          return { ok: false, photos, cover, error: message };
        }
        await sleep(RETRY_DELAYS_MS[failures - 1]);
        continue;
      }
      failures = 0;
      const attempted = data.attempted || 0;
      const remaining = data.remaining ?? 0;
      photos += data.activities || 0;
      cover = cover || Boolean(data.cover);
      // total = venues attempted so far + what the server still has queued.
      state.done += attempted;
      state.total = Math.max(state.total, state.done + remaining);
      state.added = photos;
      onProgress?.({ photos, remaining, done: state.done, total: state.total });
      if (!remaining || !attempted) break;
      emit({ tripId, done: state.done, total: state.total, finished: false, ok: true, added: photos });
    }
    return { ok: true, photos, cover };
  } catch (err) {
    return { ok: false, photos, cover, error: err?.message || 'Photo lookup failed' };
  }
}

/**
 * Resolve and store photos for a trip. Concurrent calls for the same trip share
 * one run. Resolves to { ok, photos, cover, error? }.
 * A failed call is retried with backoff (RETRY_DELAYS_MS) before the run gives up.
 * @param {string} tripId
 * @param {{ invoke?: Function, onProgress?: Function, maxCalls?: number, title?: string,
 *   sleep?: (ms: number) => Promise<void> }} [opts] sleep: the backoff wait (injectable for tests)
 */
export function resolveTripPhotos(tripId, { invoke, onProgress, maxCalls = DEFAULT_MAX_CALLS, title = '', sleep = wait } = {}) {
  const running = active.get(tripId);
  if (running) return running.promise;

  const state = { done: 0, total: 0, added: 0, promise: null };
  active.set(tripId, state);
  emit({ tripId, done: 0, total: 0, finished: false, ok: true, added: 0 });

  state.promise = runResolution(tripId, { invoke, onProgress, maxCalls, sleep }, state).then((result) => {
    // Clear the flag before announcing the end, so listeners that re-check
    // isResolvingPhotos() see the finished state.
    active.delete(tripId);
    emit({ tripId, done: state.done, total: state.total, finished: true, ok: result.ok, added: result.photos });
    notifyIfAway(tripId, result, title);
    return result;
  });
  return state.promise;
}

// Columns the photo worker writes on activities. A realtime UPDATE that only
// touches these can be patched onto the existing card instead of reloading.
export const PHOTO_FIELDS = ['photo_url', 'photo_source', 'latitude', 'longitude'];

// Columns a person edits (or the itinerary layout depends on). If a realtime
// row differs from the in-memory activity in any of these, it is a real edit.
const CONTENT_FIELDS = [
  'title', 'description', 'venue_name', 'venue_address', 'place_id', 'category',
  'start_time', 'time_slot', 'sort_order', 'day_id', 'duration_minutes',
  'cost_amount', 'cost_currency', 'cost_note', 'tips', 'booking_url',
  'getting_there', 'transport_mode', 'transport_duration', 'transport_cost', 'transport_options',
];

// JSON with object keys sorted: Postgres jsonb reorders keys, so a value the
// app wrote and the same value read back can differ only in key order.
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function sameValue(a, b) {
  const x = a ?? null;
  const y = b ?? null;
  if (x === y) return true;
  if (x === null || y === null) return String(x ?? '') === String(y ?? '');
  if (typeof x === 'object' || typeof y === 'object') return stableJson(x) === stableJson(y);
  const nx = Number(x);
  const ny = Number(y);
  if (Number.isFinite(nx) && Number.isFinite(ny) && String(x).trim() !== '' && String(y).trim() !== '') return nx === ny;
  return String(x) === String(y);
}

/**
 * True when a realtime row only changes photo/coordinate columns compared with
 * the activity already on screen (e.g. the photo worker filling in a photo).
 * Only keys present in both are compared, since realtime may omit unchanged
 * large values.
 * @param {object} activity - in-memory activity
 * @param {object} row - payload.new from the realtime event
 */
export function isPhotoOnlyChange(activity, row) {
  if (!activity || !row) return false;
  // Keys the in-memory model doesn't carry can't be compared, so they don't count.
  return CONTENT_FIELDS.every(key => !(key in row) || !(key in activity) || sameValue(activity[key], row[key]));
}

/**
 * One read of a trip's stored photos: every activity's photo columns plus the
 * photo credits in trips.extras.photoCredits. Used once when resolution ends.
 * @returns {Promise<{ data: { credits: object, activities: object[] } | null, error: string | null }>}
 */
export async function fetchTripPhotos(tripId, { client } = {}) {
  try {
    const sb = client || (await import('../lib/supabase.js')).supabase;
    const { data, error } = await sb
      .from('trips')
      .select('photoCredits:extras->photoCredits, itinerary_days(activities(id, photo_url, photo_source, latitude, longitude))')
      .eq('id', tripId)
      .single();
    if (error || !data) return { data: null, error: error?.message || 'No data' };
    const activities = (data.itinerary_days || []).flatMap(d => d.activities || []);
    const credits = data.photoCredits && typeof data.photoCredits === 'object' ? data.photoCredits : {};
    return { data: { credits, activities }, error: null };
  } catch (err) {
    return { data: null, error: err?.message || 'Photo refresh failed' };
  }
}
