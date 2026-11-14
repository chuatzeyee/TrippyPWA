// Ask the resolve-trip-photos edge function to find + store real photos for a
// trip the user owns (used after a trip import). The function works in small
// batches and reports `remaining`, so we re-invoke until it's done.

const DEFAULT_MAX_CALLS = 15; // 15 x 8 venues: plenty for a 2-week trip

export async function resolveTripPhotos(tripId, { invoke, onProgress, maxCalls = DEFAULT_MAX_CALLS } = {}) {
  const call = invoke || (async (...args) => (await import('../lib/supabase.js')).supabase.functions.invoke(...args));
  let photos = 0;
  let cover = false;
  for (let i = 0; i < maxCalls; i++) {
    const { data, error } = await call('resolve-trip-photos', { body: { tripId, inline: true } });
    if (error || !data) return { ok: false, photos, cover, error: error?.message || 'No response' };
    photos += data.activities || 0;
    cover = cover || Boolean(data.cover);
    onProgress?.({ photos, remaining: data.remaining ?? 0 });
    if (!data.remaining || !data.attempted) break;
  }
  return { ok: true, photos, cover };
}
