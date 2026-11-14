// Ask the resolve-trip-photos edge function for a sharp v2 cover for a trip the
// user owns ({ tripId, coverOnly: true }). Called lazily when the owner opens a
// trip whose cover is empty or the old automatic pick; at most once per trip
// per session (the server also counts it toward the trip's daily photo budget).
//
// The outcome is broadcast as a window 'trippy:cover' event with
// { tripId, ok, picked, coverImage, cover } so an open trip page can swap its
// header photo in place (the same pattern as 'trippy:photos').

const SESSION_KEY = 'trippy-cover-requested';

// tripId -> promise for requests in flight; plus every trip asked this session.
const running = new Map();
const requested = new Set();

function sessionSet() {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null;
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function remember(tripId) {
  requested.add(tripId);
  try {
    if (typeof sessionStorage === 'undefined') return;
    const all = sessionSet();
    all.add(tripId);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...all].slice(-200)));
  } catch { /* private mode or quota: the in-memory set still applies */ }
}

/** True when this trip's cover was already requested in this session. */
export function coverRequested(tripId) {
  return requested.has(tripId) || sessionSet().has(tripId);
}

function emit(detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('trippy:cover', { detail }));
}

/**
 * Request a cover once per trip per session. Resolves to
 * { ok, picked, coverImage, cover, error? }, or null when already requested.
 * @param {string} tripId
 * @param {{ invoke?: Function }} [opts] invoke: supabase.functions.invoke (injectable for tests)
 */
export function requestTripCover(tripId, { invoke } = {}) {
  if (!tripId) return Promise.resolve(null);
  if (running.has(tripId)) return running.get(tripId);
  if (coverRequested(tripId)) return Promise.resolve(null);
  remember(tripId);
  const call = invoke || (async (...args) => (await import('../lib/supabase.js')).supabase.functions.invoke(...args));
  const promise = (async () => {
    try {
      const { data, error } = await call('resolve-trip-photos', { body: { tripId, coverOnly: true } });
      if (error || !data) return { ok: false, picked: false, coverImage: null, cover: null, error: error?.message || 'No response' };
      return {
        ok: true,
        picked: Boolean(data.cover),
        coverImage: typeof data.coverImage === 'string' ? data.coverImage : null,
        cover: data.coverRecord && typeof data.coverRecord === 'object' ? data.coverRecord : null,
      };
    } catch (err) {
      return { ok: false, picked: false, coverImage: null, cover: null, error: err?.message || 'Cover lookup failed' };
    }
  })().then((result) => {
    running.delete(tripId);
    emit({ tripId, ...result });
    return result;
  });
  running.set(tripId, promise);
  return promise;
}

/** Test helper: forget every request. */
export function resetCoverRequests() {
  running.clear();
  requested.clear();
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
