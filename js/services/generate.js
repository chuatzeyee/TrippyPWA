import { supabase } from '../lib/supabase.js';
import { saveTripWithItinerary } from '../data/trip-repository.js';
import { fetchProfile } from '../data/profile-repository.js';
import { DESTINATIONS } from '../wizard/destinations.js';
import { logger } from '../lib/logger.js';

const photoCache = new Map();

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function generateItinerary(wizardState) {
  if (!supabase) return { data: null, error: 'Supabase not configured' };

  const { data: profile } = await fetchProfile();

  let nearbyFlag = !!wizardState.transport?.mode;
  if (!nearbyFlag && profile?.home_city) {
    const home = DESTINATIONS.find(d => d.name.toLowerCase() === profile.home_city.toLowerCase());
    const dest = wizardState.multiCity ? wizardState.destinations?.[0] : wizardState.destination;
    if (home && dest?.lat && dest?.lng) {
      const km = haversineKm(home.lat, home.lng, dest.lat, dest.lng);
      nearbyFlag = km < 500 && km > 10;
    }
  }

  const payload = {
    ...wizardState,
    isNearbyTrip: nearbyFlag,
    profile: profile ? {
      homeCity: profile.home_city || '',
      homeCountry: profile.home_country || '',
      isNomad: profile.is_nomad || false,
    } : undefined,
  };

  let data, error;
  try {
    ({ data, error } = await supabase.functions.invoke('generate-itinerary', {
      body: payload
    }));
  } catch (e) {
    logger.error('generation', 'Edge Function network error', { error: e.message });
    return { data: null, error: `Network error: ${e.message}` };
  }

  if (error) {
    let msg = error.message || JSON.stringify(error);
    let retryable = false;
    try {
      const resp = error.context;
      if (resp && typeof resp.json === 'function') {
        const body = await resp.json();
        if (body?.error) msg = body.error;
        if (body?.retryable) retryable = true;
      }
    } catch {}
    if (!retryable && /503|429|502|high demand|overloaded|non-2xx/i.test(msg)) {
      retryable = true;
    }
    logger.error('generation', 'Edge Function error', { error: msg, retryable });
    return { data: null, error: msg, retryable };
  }

  if (!data?.days || !Array.isArray(data.days)) {
    logger.warn('generation', 'Invalid itinerary format from Edge Function');
    return { data: null, error: 'Invalid itinerary format received' };
  }

  return { data, error: null };
}

export async function saveGeneratedTrip(wizardState, itinerary) {
  return saveTripWithItinerary(wizardState, itinerary);
}

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
