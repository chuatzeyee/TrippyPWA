import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

// Itinerary generation moved to the async job queue (see generation-manager.js +
// the process-generation edge function). This module now only proxies place
// photos, which trip-detail, activity-editor, and the PDF exporter rely on.

const photoCache = new Map();

// Legacy Google place_id lookup. Photos now come from free sources (Wikipedia /
// stock) which key off a text query, not a Google place id — so there is no
// equivalent here. Kept as a no-op so callers (the PDF exporter) cleanly fall
// through to their venue-name query path.
export async function fetchPlacePhoto(_placeId, _maxWidth = 400) {
  return null;
}

// opts: { kind: 'venue' | 'area', category?: string }
// `kind` controls how the photo service resolves the query: 'area' (cities,
// neighbourhoods, landmarks) may use a broad Wikipedia search; 'venue' (default)
// uses exact-title only then category stock, since fuzzy venue-name search
// returns unrelated images.
export async function fetchPlacePhotoByQuery(query, location, maxWidth = 400, opts = {}) {
  if (!query) return null;
  const cacheKey = `q:${opts.kind || 'venue'}:${query}`;
  if (photoCache.has(cacheKey)) return photoCache.get(cacheKey);

  try {
    const body = { query, max_width: maxWidth, kind: opts.kind || 'venue' };
    if (opts.category) body.category = opts.category;
    if (location?.lat && location?.lng) body.location = location;

    const { data, error } = await supabase.functions.invoke('places-photo', { body });

    if (error || !data?.url) {
      photoCache.set(cacheKey, null);
      return null;
    }

    photoCache.set(cacheKey, data.url);
    return data.url;
  } catch (e) {
    logger.warn('data', 'Place photo query failed', { query, error: e?.message });
    photoCache.set(cacheKey, null);
    return null;
  }
}
