import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

// Itinerary generation moved to the async job queue (see generation-manager.js +
// the process-generation edge function). This module now only proxies place
// photos, which trip-detail, activity-editor, and the PDF exporter rely on.

const photoCache = new Map();

export async function fetchPlacePhoto(placeId, maxWidth = 400) {
  if (!placeId) return null;
  if (photoCache.has(placeId)) return photoCache.get(placeId);

  try {
    const { data, error } = await supabase.functions.invoke('places-photo', {
      body: { place_id: placeId, max_width: maxWidth }
    });

    if (error || !data?.url) {
      photoCache.set(placeId, null);
      return null;
    }

    photoCache.set(placeId, data.url);
    return data.url;
  } catch (e) {
    logger.warn('data', 'Place photo fetch failed', { placeId, error: e?.message });
    photoCache.set(placeId, null);
    return null;
  }
}

export async function fetchPlacePhotoByQuery(query, location, maxWidth = 400) {
  if (!query) return null;
  const cacheKey = `q:${query}`;
  if (photoCache.has(cacheKey)) return photoCache.get(cacheKey);

  try {
    const body = { query, max_width: maxWidth };
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
