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

async function runResolution(tripId, { invoke, onProgress, maxCalls }, state) {
  const call = invoke || (async (...args) => (await import('../lib/supabase.js')).supabase.functions.invoke(...args));
  let photos = 0;
  let cover = false;
  try {
    for (let i = 0; i < maxCalls; i++) {
      const { data, error } = await call('resolve-trip-photos', { body: { tripId, inline: true } });
      if (error || !data) return { ok: false, photos, cover, error: error?.message || 'No response' };
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
 * @param {string} tripId
 * @param {{ invoke?: Function, onProgress?: Function, maxCalls?: number, title?: string }} [opts]
 */
export function resolveTripPhotos(tripId, { invoke, onProgress, maxCalls = DEFAULT_MAX_CALLS, title = '' } = {}) {
  const running = active.get(tripId);
  if (running) return running.promise;

  const state = { done: 0, total: 0, added: 0, promise: null };
  active.set(tripId, state);
  emit({ tripId, done: 0, total: 0, finished: false, ok: true, added: 0 });

  state.promise = runResolution(tripId, { invoke, onProgress, maxCalls }, state).then((result) => {
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
