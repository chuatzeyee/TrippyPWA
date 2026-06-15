// Venue/area photo resolver, shared by the resolve-trip-photos edge function
// (Deno) and the backfill script (Node). Pure `fetch`, no runtime-specific APIs.
//
// HARD RULE: never a stock photo, never a confident WRONG match. We only return
// an image that is either (a) the actual venue/area, corroborated by a trusted
// id or by name+coordinate agreement, or (b) an HONEST street-level view of the
// exact location (clearly labelled as such in the UI). Otherwise null → gradient.
//
//   VENUE (a specific place):
//     1. OSM Overpass — node/way matching the NAME within ~150m, read its
//        image / wikimedia_commons / wikidata tag (highest precision: name+geo)
//     2. Wikidata — name search, GEOFENCED to within 300m via P625, then P18
//     3. Wikipedia exact-title summary (named landmarks)
//     4. Mapillary — real street-level photo AT the coords (source:"street",
//        the UI labels it "Street view" so it never masquerades as the venue)
//     5. null → gradient
//   AREA (city / neighbourhood):
//     1. Wikipedia exact-title -> search
//     2. Wikimedia Commons geosearch (a nearby photo represents a neighbourhood)
//     3. Mapillary streetscape -> null

const UA = "TrippyPWA/2.0 (photo resolver; github.com/chuatzeyee/TrippyPWA)";
const TIMEOUT_MS = 6000;
const COMMONS_FILEPATH = "https://commons.wikimedia.org/wiki/Special:FilePath/";

function timeoutFetch(url, opts = {}) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// commons "File:Foo.jpg" (or bare "Foo.jpg") -> a sized, stable image URL.
function commonsFileUrl(file, width) {
  const name = String(file).replace(/^File:/i, "").trim();
  if (!name) return null;
  return `${COMMONS_FILEPATH}${encodeURIComponent(name.replace(/ /g, "_"))}?width=${width}`;
}

// --- Wikipedia (named landmarks) -------------------------------------------

function sizedWikiThumb(d, maxWidth) {
  const thumb = d.thumbnail?.source;
  if (!thumb) return null;
  const m = thumb.match(/\/(\d+)px-[^/]+$/);
  if (m && Number(m[1]) > maxWidth) return thumb.replace(/\/\d+px-/, `/${maxWidth}px-`);
  return thumb;
}

async function wikipediaExact(title, maxWidth) {
  try {
    const res = await timeoutFetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(title).replace(/ /g, "_"))}`,
      { headers: { "User-Agent": UA, accept: "application/json" } });
    if (!res.ok) return null;
    const d = await res.json();
    if (d.type === "disambiguation") return null;
    return sizedWikiThumb(d, maxWidth);
  } catch { return null; }
}

async function wikipediaSearch(query, maxWidth) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`;
    const res = await timeoutFetch(url, { headers: { "User-Agent": UA, accept: "application/json" } });
    if (!res.ok) return null;
    const title = (await res.json()).query?.search?.[0]?.title;
    return title ? wikipediaExact(title, maxWidth) : null;
  } catch { return null; }
}

// --- Wikidata image (P18), geofenced ---------------------------------------

// Fetch a Wikidata item's P18 filename (if any), only when its P625 coordinate
// is within `maxKm` of the target — guards against a same-named different thing.
async function wikidataItemImage(id, lat, lng, maxKm, width) {
  try {
    const res = await timeoutFetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${id}&props=claims&format=json`,
      { headers: { "User-Agent": UA, accept: "application/json" } });
    if (!res.ok) return null;
    const claims = (await res.json()).entities?.[id]?.claims || {};
    const file = claims.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!file) return null;
    const coord = claims.P625?.[0]?.mainsnak?.datavalue?.value;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (!coord) return null; // require a coordinate to trust the match
      if (haversineKm(lat, lng, coord.latitude, coord.longitude) > maxKm) return null;
    }
    return commonsFileUrl(file, width);
  } catch { return null; }
}

async function wikidataByName(query, lat, lng, width) {
  try {
    const res = await timeoutFetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=3`,
      { headers: { "User-Agent": UA, accept: "application/json" } });
    if (!res.ok) return null;
    const cands = ((await res.json()).search || []).slice(0, 3);
    // Check candidates in parallel (each is geofenced, so only a true match
    // returns) and take the first non-null — bounds this at one round-trip.
    const results = await Promise.all(
      cands.map((c) => wikidataItemImage(c.id, lat, lng, 0.3, width).catch(() => null)));
    return results.find(Boolean) || null;
  } catch { return null; }
}

// --- OSM Overpass (name + geo, highest precision) --------------------------

async function osmVenuePhoto(name, lat, lng, width) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !name) return null;
  // Match the first ~24 chars of the name (case-insensitive) within 160m.
  const namePart = String(name).slice(0, 24).replace(/[\\"\[\]]/g, " ").trim();
  if (!namePart) return null;
  const q = `[out:json][timeout:8];nwr(around:160,${lat},${lng})["name"~"${namePart}",i];out tags center 5;`;
  try {
    // Overpass is the slowest, lowest-hit source; cap it tight so a slow shared
    // instance can't dominate the per-trip wall-clock.
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: "data=" + encodeURIComponent(q),
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const els = (await res.json()).elements || [];
    const el = els.find((e) => e.tags && (e.tags.image || e.tags.wikimedia_commons || e.tags.wikidata));
    if (!el) return null;
    const t = el.tags;
    if (t.image && /^https?:\/\//.test(t.image)) return { url: t.image, source: "osm" };
    if (t.wikimedia_commons) {
      const url = commonsFileUrl(t.wikimedia_commons, width);
      if (url) return { url, source: "wikimedia" };
    }
    if (t.wikidata) {
      const url = await wikidataItemImage(t.wikidata, lat, lng, 0.5, width);
      if (url) return { url, source: "wikidata" };
    }
    return null;
  } catch { return null; }
}

// --- Wikimedia Commons geosearch (areas only) ------------------------------

async function wikimediaGeo(lat, lng, radiusM, maxWidth) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json`
      + `&generator=geosearch&ggsnamespace=6&ggscoord=${lat}|${lng}&ggsradius=${radiusM}&ggslimit=5`
      + `&prop=imageinfo&iiprop=url&iiurlwidth=${Math.max(maxWidth, 400)}`;
    const res = await timeoutFetch(url, { headers: { "User-Agent": UA, accept: "application/json" } });
    if (!res.ok) return null;
    const pages = (await res.json()).query?.pages ? Object.values((await res.json()).query.pages) : [];
    const hit = pages
      .map((p) => p.imageinfo?.[0])
      .find((ii) => ii?.thumburl && !/\.(svg)$/i.test(ii.url || "")
        && !/\b(map|logo|diagram|plan|coat[_ ]of[_ ]arms|flag)\b/i.test(ii.url || ""));
    return hit?.thumburl || null;
  } catch { return null; }
}

// --- Mapillary street-level (honest location view) -------------------------

async function mapillaryQuery(lat, lng, radiusM, field, token) {
  const dLat = radiusM / 111320, dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
  const bbox = `${lng - dLon},${lat - dLat},${lng + dLon},${lat + dLat}`;
  const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}&fields=${field}&bbox=${bbox}&limit=1`;
  const res = await timeoutFetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  return (await res.json()).data?.[0]?.[field] || null;
}

async function mapillaryStreet(lat, lng, maxWidth, token) {
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const field = maxWidth >= 1024 ? "thumb_1024_url" : "thumb_256_url";
  try {
    return (await mapillaryQuery(lat, lng, 150, field, token)) || (await mapillaryQuery(lat, lng, 400, field, token));
  } catch { return null; }
}

/**
 * Resolve the best photo for a place.
 * @param {object} place - { query, kind?, category?, lat?, lng?, maxWidth? }
 * @param {object} [opts] - { mapillaryToken }
 * @returns {Promise<{ url, source } | null>}  source: osm|wikidata|wikimedia|wikipedia|street
 */
export async function resolvePhoto(place, opts = {}) {
  const { query, kind = "venue", lat, lng, maxWidth = 600 } = place;
  if (!query) return null;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const mapillaryToken = opts.mapillaryToken || "";

  if (kind === "area") {
    let url = await wikipediaExact(query, maxWidth);
    if (url) return { url, source: "wikipedia" };
    url = await wikipediaSearch(query, maxWidth);
    if (url) return { url, source: "wikipedia" };
    if (hasCoords) {
      url = await wikimediaGeo(lat, lng, 1000, maxWidth);
      if (url) return { url, source: "wikimedia" };
      url = await mapillaryStreet(lat, lng, maxWidth, mapillaryToken);
      if (url) return { url, source: "street" };
    }
    return null;
  }

  // VENUE — race all sources in parallel, then pick the best by trust priority
  // (real venue photo > honest street view). 88% of venues end at the street
  // fallback, so awaiting each source in series wastes ~10-15s per venue waiting
  // on slow OSM/Wikidata lookups that miss; in parallel the whole resolve is
  // bounded by the single slowest call. Never stock, never a fuzzy wrong match.
  const [osm, wd, wiki, street] = await Promise.all([
    hasCoords ? osmVenuePhoto(query, lat, lng, maxWidth).catch(() => null) : Promise.resolve(null),
    hasCoords ? wikidataByName(query, lat, lng, maxWidth).catch(() => null) : Promise.resolve(null),
    wikipediaExact(query, maxWidth).catch(() => null),
    hasCoords ? mapillaryStreet(lat, lng, maxWidth, mapillaryToken).catch(() => null) : Promise.resolve(null),
  ]);
  if (osm) return osm; // { url, source } already
  if (wd) return { url: wd, source: "wikidata" };
  if (wiki) return { url: wiki, source: "wikipedia" };
  if (street) return { url: street, source: "street" };
  return null;
}
