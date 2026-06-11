import { logger } from '../lib/logger.js';

// Maps a trip's activities to the towns/districts/villages they take place in,
// via Photon reverse geocoding (keyless, CORS-open — already used by the city
// resolver). Coordinates are deduped into ~1km cells first so a 100-activity
// trip needs only a handful of requests, results are cached per trip in
// localStorage, and requests run sequentially to stay polite.

const CACHE_PREFIX = 'towns-v1-';
const CELL_DEG = 0.012; // ~1.3km N-S; coarse enough to merge venue clusters

export function cellKey(lat, lng) {
  return `${Math.round(lat / CELL_DEG)}:${Math.round(lng / CELL_DEG)}`;
}

// Generic area labels that aren't real localities — skip to the next fallback.
const NOISE_LOCALITIES = /^(airport|station|port|harbou?r|terminal \d*|industrial (area|estate|park)|business park)$/i;

// Pick the most specific human locality from a Photon reverse-geocode result.
// Falls through: district (Shibuya, Downtown Core) → suburb → locality →
// city/town/village name → county. Returns null when nothing usable.
export function localityFromProps(p) {
  if (!p) return null;
  const candidates = [
    p.district, p.suburb, p.locality,
    ['city', 'town', 'village', 'hamlet'].includes(p.osm_value) ? p.name : null,
    p.city, p.county,
  ];
  for (const cand of candidates) {
    if (!cand) continue;
    const name = String(cand).trim();
    if (name.length > 1 && !NOISE_LOCALITIES.test(name)) return name;
  }
  return null;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Collect geocodable activities: one representative per ~1km cell, remembering
// every (day, activity) that falls in the cell.
export function collectCells(days) {
  const cells = new Map();
  for (const day of days || []) {
    for (const a of day.activities || []) {
      const lat = Number(a.latitude);
      const lng = Number(a.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
      const key = cellKey(lat, lng);
      if (!cells.has(key)) {
        cells.set(key, { lat, lng, hits: [] });
      }
      cells.get(key).hits.push({
        dayNumber: day.day_number,
        dayIndex: day._index,
        venue: a.venue_name || a.title || '',
      });
    }
  }
  return cells;
}

// Group towns under the nearest trip city (multi-city trips); single-city trips
// get one unnamed group. cities: [{ name, lat, lng }].
export function nearestCity(lat, lng, cities) {
  if (!cities || cities.length < 2) return cities?.[0]?.name || '';
  let best = null;
  let bestKm = Infinity;
  for (const c of cities) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    const km = haversineKm(lat, lng, c.lat, c.lng);
    if (km < bestKm) { bestKm = km; best = c; }
  }
  // All cities coordinate-less (legacy custom destinations): grouping by
  // distance is impossible — fall back to the first city's name.
  return best ? best.name : (cities[0]?.name || '');
}

async function reverseGeocode(lat, lng) {
  const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`,
    { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.features?.[0]?.properties || null;
}

function cacheGet(tripId, fingerprint) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + tripId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.fingerprint === fingerprint ? parsed.groups : null;
  } catch { return null; }
}

function cacheSet(tripId, fingerprint, groups) {
  try {
    localStorage.setItem(CACHE_PREFIX + tripId, JSON.stringify({ fingerprint, groups }));
  } catch { /* storage full — towns just re-geocode next time */ }
}

/**
 * Build the towns model for a trip.
 *
 * @param trip - trip row with itinerary_days[].activities[] and wizard_state
 * @param onProgress - optional (done, total) callback while geocoding
 * @returns [{ city, towns: [{ name, days: [{ dayNumber, dayIndex }], venues, activityCount }] }]
 */
export async function buildTownGroups(trip, onProgress) {
  const days = (trip.itinerary_days || []).map((d, i) => ({ ...d, _index: i }));
  // Fingerprint covers day structure AND a coordinate checksum, so editing an
  // activity's venue/location (same count) still invalidates the cache.
  let coordSum = 0;
  for (const d of days) {
    for (const a of d.activities || []) {
      coordSum += (Number(a.latitude) || 0) + (Number(a.longitude) || 0);
    }
  }
  const fingerprint = days.map(d => `${d.day_number}:${(d.activities || []).length}`).join('|')
    + `#${coordSum.toFixed(4)}`;

  const cached = cacheGet(trip.id, fingerprint);
  if (cached) return cached;

  const cells = collectCells(days);
  if (cells.size === 0) return [];

  const ws = trip.wizard_state || {};
  const cities = (ws.multiCity ? ws.destinations : [ws.destination])
    .filter(Boolean)
    .map(d => ({ name: d.name, lat: Number(d.lat), lng: Number(d.lng) }));

  // town key -> aggregate
  const towns = new Map();
  let done = 0;
  for (const cell of cells.values()) {
    let props = null;
    try {
      props = await reverseGeocode(cell.lat, cell.lng);
    } catch (e) {
      logger.warn('data', 'Town reverse geocode failed', { error: e?.message });
    }
    done++;
    onProgress?.(done, cells.size);

    const locality = localityFromProps(props);
    if (!locality) continue;
    const city = nearestCity(cell.lat, cell.lng, cities);
    const key = `${city}|${locality}`;

    if (!towns.has(key)) {
      towns.set(key, { name: locality, city, days: new Map(), venues: [], activityCount: 0, cells: [] });
    }
    const t = towns.get(key);
    // Cell coords let the Plan tab label activities by locality via a
    // nearest-cell lookup, with zero additional geocoding.
    t.cells.push([Number(cell.lat.toFixed(4)), Number(cell.lng.toFixed(4))]);
    for (const hit of cell.hits) {
      if (!t.days.has(hit.dayNumber)) t.days.set(hit.dayNumber, hit.dayIndex);
      if (hit.venue && t.venues.length < 3 && !t.venues.includes(hit.venue)) t.venues.push(hit.venue);
      t.activityCount++;
    }
    // Photon is unauthenticated shared infrastructure; pace the loop.
    await new Promise(r => setTimeout(r, 120));
  }

  // Shape for rendering: group by city, sort towns by first visit day.
  const byCity = new Map();
  for (const t of towns.values()) {
    if (!byCity.has(t.city)) byCity.set(t.city, []);
    byCity.get(t.city).push({
      name: t.name,
      days: [...t.days.entries()]
        .map(([dayNumber, dayIndex]) => ({ dayNumber, dayIndex }))
        .sort((a, b) => a.dayNumber - b.dayNumber),
      venues: t.venues,
      activityCount: t.activityCount,
      cells: t.cells,
    });
  }
  const groups = [...byCity.entries()].map(([city, list]) => ({
    city,
    towns: list.sort((a, b) => (a.days[0]?.dayNumber || 99) - (b.days[0]?.dayNumber || 99)),
  }));
  // Keep multi-city group order aligned with the itinerary (first-visited first).
  groups.sort((a, b) =>
    (a.towns[0]?.days[0]?.dayNumber || 99) - (b.towns[0]?.days[0]?.dayNumber || 99));

  cacheSet(trip.id, fingerprint, groups);
  return groups;
}
