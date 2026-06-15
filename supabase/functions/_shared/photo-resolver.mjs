// Multi-source photo resolver, shared by the resolve-trip-photos edge function
// (Deno) and the backfill script (Node). Pure `fetch`, no runtime-specific APIs.
//
// Given a place (name + optional coords + category + kind), it tries several
// FREE sources, scores the candidates, and returns the best image URL — or null
// to fall back to a gradient. Sources, by trust:
//
//   VENUE (a specific place — café, museum, restaurant):
//     1. Wikipedia exact-title summary  — real photo of a NAMED landmark
//     2. Pexels category stock           — clean on-theme photo (needs key)
//   AREA (city / neighbourhood):
//     1. Wikipedia exact-title -> search
//     2. Wikimedia Commons geosearch     — CC image near the area's coords
//     3. Pexels stock
//
// Why so conservative for venues: coordinate/name-fuzzy sources (Wikimedia
// geosearch, Openverse, Mapillary) return whatever is tagged NEAR or LIKE the
// query, which yields confident WRONG matches — a passing highway for a
// Starbucks, a synthesiser photo for a café. For an unnamed venue an honest
// "coffee shop" stock photo is better than a wrong real one. Areas are safe for
// geosearch because a nearby photo genuinely represents the neighbourhood.

const UA = "TrippyPWA/2.0 (photo resolver; github.com/chuatzeyee/TrippyPWA)";
const TIMEOUT_MS = 8000;

function timeoutFetch(url, opts = {}) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

// Concrete, photogenic stock phrase per category so Pexels returns a clear photo
// of that KIND of place rather than an ambiguous literal noun.
const STOCK_PHRASE = {
  cafe: "cozy coffee shop interior", coffee: "cappuccino coffee shop",
  restaurant: "restaurant dining table", food: "gourmet food plate",
  dining: "restaurant dining table", dessert: "dessert plate",
  bar: "cocktail bar interior", nightlife: "nightclub bar lights",
  museum: "museum gallery interior", gallery: "art gallery interior",
  art: "art gallery", culture: "cultural landmark",
  shopping: "shopping street boutique", market: "street market stalls",
  nature: "scenic nature landscape", park: "city park greenery",
  beach: "tropical beach", sights: "famous landmark", landmark: "famous landmark",
  temple: "ancient temple architecture", spa: "luxury spa wellness",
  wellness: "luxury spa wellness", hotel: "boutique hotel room",
};
function stockPhrase(category) {
  if (!category) return null;
  return STOCK_PHRASE[String(category).toLowerCase()] || `${category} place`;
}

// --- Sources ---------------------------------------------------------------

// Pick a small, valid MediaWiki thumbnail. The REST summary's thumbnail.source
// is a sized ".../NNNpx-Name" URL (~330px) that loads directly and is small
// (~30-80KB) — ideal for our cards and the Storage quota. We only DOWNSCALE
// when the native thumb is larger than maxWidth; we never UPSCALE (Wikipedia's
// thumbnailer 400s on widths above the source's allowed range), and we never
// use originalimage (often multi-MB).
function sizedWikiThumb(d, maxWidth) {
  const thumb = d.thumbnail?.source;
  if (!thumb) return null;
  const m = thumb.match(/\/(\d+)px-[^/]+$/);
  if (m) {
    const native = Number(m[1]);
    if (native > maxWidth) return thumb.replace(/\/\d+px-/, `/${maxWidth}px-`);
  }
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
    const d = await res.json();
    const title = d.query?.search?.[0]?.title;
    return title ? wikipediaExact(title, maxWidth) : null;
  } catch { return null; }
}

// Images on Wikimedia Commons whose own coordinates fall within `radiusM` of the
// point — genuinely near the venue, unlike a random street capture.
async function wikimediaGeo(lat, lng, radiusM, maxWidth) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json`
      + `&generator=geosearch&ggsnamespace=6&ggscoord=${lat}|${lng}&ggsradius=${radiusM}&ggslimit=5`
      + `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${Math.max(maxWidth, 400)}`;
    const res = await timeoutFetch(url, { headers: { "User-Agent": UA, accept: "application/json" } });
    if (!res.ok) return null;
    const d = await res.json();
    const pages = d.query?.pages ? Object.values(d.query.pages) : [];
    // Prefer real photographs: skip maps/diagrams/logos by filename hint.
    const ranked = pages
      .map((p) => p.imageinfo?.[0])
      .filter((ii) => ii?.thumburl && !/\.(svg|png)$/i.test(ii.url || "")
        && !/\b(map|logo|diagram|plan|coat[_ ]of[_ ]arms|flag)\b/i.test(ii.url || ""));
    return ranked[0]?.thumburl || null;
  } catch { return null; }
}

async function pexels(query, maxWidth, apiKey) {
  if (!apiKey) return null;
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const res = await timeoutFetch(url, { headers: { Authorization: apiKey } });
    if (!res.ok) return null;
    const d = await res.json();
    const p = d.photos?.[0];
    if (!p) return null;
    return maxWidth >= 600 ? (p.src?.large || p.src?.medium) : (p.src?.medium || p.src?.small);
  } catch { return null; }
}

/**
 * Resolve the best photo URL for a place.
 * @param {object} place
 * @param {string} place.query   - venue or area name (already includes city when useful)
 * @param {'venue'|'area'} [place.kind]
 * @param {string} [place.category]
 * @param {number} [place.lat]
 * @param {number} [place.lng]
 * @param {number} [place.maxWidth=600]
 * @param {object} [opts] - { pexelsKey }
 * @returns {Promise<{ url: string, source: string } | null>}
 */
export async function resolvePhoto(place, opts = {}) {
  const { query, kind = "venue", category, lat, lng, maxWidth = 600 } = place;
  if (!query) return null;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const pexelsKey = opts.pexelsKey || "";

  let url = null;

  // 1. Exact Wikipedia title (named landmarks, both kinds).
  url = await wikipediaExact(query, maxWidth);
  if (url) return { url, source: "wikipedia" };

  if (kind === "area") {
    url = await wikipediaSearch(query, maxWidth);
    if (url) return { url, source: "wikipedia" };
    if (hasCoords) {
      url = await wikimediaGeo(lat, lng, 1000, maxWidth);
      if (url) return { url, source: "wikimedia" };
    }
    url = await pexels(query, maxWidth, pexelsKey);
    if (url) return { url, source: "pexels" };
    return null;
  }

  // VENUE: after exact Wikipedia (handled above for named landmarks), go
  // straight to clean on-theme category stock. We deliberately DON'T use
  // coordinate/name-fuzzy sources (Wikimedia geosearch, Openverse, Mapillary)
  // for venues: they return whatever is tagged NEAR or LIKE the query, which
  // produces embarrassing wrong matches (a synthesiser for a café, a highway
  // for a Starbucks). An honest "coffee shop" photo beats a confident wrong one.
  url = await pexels(stockPhrase(category) || query, maxWidth, pexelsKey);
  if (url) return { url, source: "pexels" };
  return null;
}
