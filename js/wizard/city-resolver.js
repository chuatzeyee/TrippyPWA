import { logger } from '../lib/logger.js';
import { currencyForCountry } from './currency-map.js';

// Resolves a free-typed (often misspelled) city name into a fully-populated
// destination: corrected name, country + ISO flag code, currency, coordinates,
// timezone, and a header photo. Everything here runs CLIENT-SIDE with keyless,
// CORS-enabled public APIs because the wizard's city step happens BEFORE sign-in
// (the Supabase edge functions require auth, so they cannot be used here):
//   - Photon (Komoot)        fuzzy geocoding -> correct name, country, coords
//   - Wikipedia REST summary  city header photo (same Wikimedia CDN as the
//                             curated list, so the trip hero renders identically)
//   - Open-Meteo geocoding    IANA timezone for the corrected city
//   - currency-map + Intl     currency code + display symbol from the country

const PHOTON_URL = 'https://photon.komoot.io/api/';
const WIKI_SEARCH_URL = 'https://en.wikipedia.org/w/api.php';
const OPEN_METEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const FETCH_TIMEOUT_MS = 4500;

// place osm_value -> rough notability rank (lower = more likely the city the
// traveler meant). Used to pick the best Photon candidate. Note: OSM tags some
// major cities as administrative areas rather than "city" — Tokyo is a province,
// Singapore/Hong Kong a country/city — so those rank near the top too.
const PLACE_RANK = {
  city: 0, country: 0, municipality: 1, province: 1, state: 1, region: 2,
  town: 2, borough: 3, county: 3, island: 3, village: 4, suburb: 5,
  hamlet: 6, locality: 7,
};

function fetchJson(url, { timeout = FETCH_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    .then(res => (res.ok ? res.json() : null))
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}

// Trim and collapse whitespace on a typed city name. Geocoded names override
// this; it is only the display fallback when geocoding returns nothing.
export function cleanCityName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

// Score a Photon feature for "is this the city the traveler meant?". Lower wins.
// Prefers real settlements (city > town > village), and features with a bounding
// box (extent) — major places have one, tiny hamlets usually do not.
export function scorePhotonFeature(feature, index) {
  const p = feature?.properties || {};
  const placeScore = PLACE_RANK[p.osm_value] ?? 8;
  const extentBonus = Array.isArray(p.extent) ? -2 : 0;
  // index keeps Photon's own relevance ordering as the tie-breaker.
  return placeScore * 10 + extentBonus + index;
}

// Pick the best settlement from a Photon FeatureCollection, or null.
export function pickBestCity(features) {
  if (!Array.isArray(features) || features.length === 0) return null;
  const named = features.filter(f => f?.properties?.name);
  if (named.length === 0) return null;
  return named
    .map((f, i) => ({ f, score: scorePhotonFeature(f, i) }))
    .sort((a, b) => a.score - b.score)[0].f;
}

// Map a Photon feature into the partial destination fields it can supply.
export function destFromPhotonFeature(feature) {
  const p = feature.properties || {};
  const coords = feature.geometry?.coordinates || [];
  const { code, symbol } = currencyForCountry(p.countrycode);
  return {
    name: cleanCityName(p.name),
    country: p.country || '',
    flag: p.countrycode ? p.countrycode.toLowerCase() : '',
    lat: typeof coords[1] === 'number' ? coords[1] : null,
    lng: typeof coords[0] === 'number' ? coords[0] : null,
    currencyCode: code,
    currencySymbol: symbol,
  };
}

// Normalize a Wikimedia thumbnail URL to the wider render the trip hero expects.
// The curated list uses .../<n>px-Name.jpg; we request 500px to match. The
// trip-detail hero further upsizes to 1280px.
export function wikiThumbToWide(url) {
  if (!url) return '';
  return url.replace(/\/\d+px-/, '/500px-');
}

async function geocodeCity(query) {
  // osm_tag=place keeps all populated-place types (city/town/province/country)
  // while excluding POIs, streets, and businesses; ranking then picks the real
  // settlement. A narrower city/town/village filter wrongly drops major cities
  // OSM models as provinces (Tokyo) or countries (Singapore).
  const params = new URLSearchParams({ q: query, limit: '8', lang: 'en' });
  params.append('osm_tag', 'place');
  const data = await fetchJson(`${PHOTON_URL}?${params.toString()}`);
  const best = pickBestCity(data?.features);
  return best ? destFromPhotonFeature(best) : null;
}

// Fetch a representative photo for a city via the MediaWiki search + pageimages
// API. This is robust to disambiguation titles (e.g. "New York" the page is a
// disambiguation, but a search surfaces "New York City" with its skyline photo)
// and returns the same Wikimedia CDN URL the curated destinations use.
async function fetchCityPhoto(cityName, country) {
  const query = country ? `${cityName} ${country}` : cityName;
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'search', gsrsearch: query, gsrlimit: '1',
    prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '500',
  });
  const data = await fetchJson(`${WIKI_SEARCH_URL}?${params.toString()}`);
  const pages = data?.query?.pages;
  if (!pages) return '';
  const first = Object.values(pages)[0];
  return wikiThumbToWide(first?.thumbnail?.source || '');
}

async function fetchTimezone(cityName) {
  const params = new URLSearchParams({ name: cityName, count: '1', language: 'en', format: 'json' });
  const data = await fetchJson(`${OPEN_METEO_URL}?${params.toString()}`);
  return data?.results?.[0]?.timezone || null;
}

// Resolve a typed city name into a complete destination. Returns null only when
// geocoding finds nothing at all (caller can keep the raw custom destination).
// Photo + timezone are best-effort: a missing one never fails the resolve.
export async function resolveCity(rawName) {
  const query = cleanCityName(rawName);
  if (query.length < 2) return null;

  let geo;
  try {
    geo = await geocodeCity(query);
  } catch (e) {
    logger.warn('data', 'City geocode failed', { query, error: e?.message });
    return null;
  }
  if (!geo) return null;

  // Fetch photo + timezone in parallel; neither is allowed to fail the resolve.
  const [image, timezone] = await Promise.all([
    fetchCityPhoto(geo.name, geo.country).catch(() => ''),
    fetchTimezone(geo.name).catch(() => null),
  ]);

  return {
    name: geo.name,
    country: geo.country,
    flag: geo.flag,
    lat: geo.lat,
    lng: geo.lng,
    currencyCode: geo.currencyCode,
    currencySymbol: geo.currencySymbol,
    timezone,
    budgetRange: { backpacker: 60, comfortable: 140, luxury: 320 },
    image,
    custom: true,
    resolved: true,
  };
}
