import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeadersFor, getCallerUserId, fetchWithTimeout, json } from "../_shared/http.ts";

// Photo proxy — FREE sources only (no Google Places billing).
//
// Strategy, in order, first hit wins:
//   1. Wikipedia REST summary  (keyless) — real photos of cities, neighbourhoods,
//      landmarks, and any named venue with an article.
//   2. Pexels stock            (free key, optional) — a representative photo keyed
//      off the query when Wikipedia has nothing. Skipped if PEXELS_API_KEY unset.
// If both miss we 404 and the caller keeps its gradient placeholder.
//
// The legacy `place_id` (Google) path is gone; callers that send only a place_id
// get a 404 and fall back to their venue-name query (see pdf/photos.js).

const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY") || "";
const MAPILLARY_TOKEN = Deno.env.get("MAPILLARY_TOKEN") || "";
const WIKI_REST = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const WIKI_SEARCH = "https://en.wikipedia.org/w/api.php";
const PEXELS_SEARCH = "https://api.pexels.com/v1/search";
const MAPILLARY_IMAGES = "https://graph.mapillary.com/images";
const UA = "TrippyPWA/1.0 (https://chuatzeyee.github.io; contact via repo)";

// One Mapillary query over a box of `radiusM` half-width around a point.
async function mapillaryQuery(lat: number, lng: number, radiusM: number, field: string): Promise<string | null> {
  // Box must stay < 0.01deg per the API; 400m half-width (~0.0036deg) is safe.
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
  const bbox = `${lng - dLon},${lat - dLat},${lng + dLon},${lat + dLat}`;
  const url = `${MAPILLARY_IMAGES}?access_token=${encodeURIComponent(MAPILLARY_TOKEN)}&fields=${field}&bbox=${bbox}&limit=1`;
  const res = await fetchWithTimeout(url, { headers: { accept: "application/json" } }, 8000);
  if (!res.ok) return null;
  const data = await res.json();
  return data.data?.[0]?.[field] || null;
}

// Real street-level photo near a coordinate (free, CC-BY-SA). Returns a ready
// HTTPS thumbnail URL or null. Coverage is dense in cities, sparse rurally, so a
// null result is expected and must fall through. Token optional: skipped if unset.
// Tries a tight box first (most relevant to the venue), then widens once — a 60m
// box often misses the nearest captured image that sits ~100-250m away.
async function mapillaryPhoto(lat: number, lng: number, maxWidth: number): Promise<string | null> {
  if (!MAPILLARY_TOKEN) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const field = maxWidth >= 1024 ? "thumb_1024_url" : "thumb_256_url";
  try {
    return (await mapillaryQuery(lat, lng, 150, field))
        || (await mapillaryQuery(lat, lng, 400, field));
  } catch {
    return null;
  }
}

// Wikipedia REST summary for an exact title. Returns a thumbnail URL or null.
async function wikiSummaryPhoto(title: string, maxWidth: number): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `${WIKI_REST}${encodeURIComponent(title.replace(/ /g, "_"))}`,
      { headers: { "User-Agent": UA, accept: "application/json" } },
      8000,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.type === "disambiguation") return null;
    const src = data.originalimage?.source || data.thumbnail?.source;
    if (!src) return null;
    // Upscale the ~320px REST thumb toward the requested width when the URL is a
    // sized MediaWiki thumb (…/NNNpx-…); otherwise return as-is.
    return src.replace(/\/\d+px-/, `/${Math.max(maxWidth, 320)}px-`);
  } catch {
    return null;
  }
}

// Resolve a free-text query to the best-matching Wikipedia article title, then
// fetch its summary photo. Lets "Industry Beans Melbourne" find a real page even
// when the exact string is not an article title.
async function wikiSearchPhoto(query: string, maxWidth: number): Promise<string | null> {
  try {
    const url = `${WIKI_SEARCH}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA, accept: "application/json" } }, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    const title = data.query?.search?.[0]?.title;
    if (!title) return null;
    return await wikiSummaryPhoto(title, maxWidth);
  } catch {
    return null;
  }
}

// Pexels stock fallback — representative (not venue-exact) photo. Optional.
async function pexelsPhoto(query: string, maxWidth: number): Promise<string | null> {
  if (!PEXELS_API_KEY) return null;
  try {
    const url = `${PEXELS_SEARCH}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const res = await fetchWithTimeout(url, { headers: { Authorization: PEXELS_API_KEY } }, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data.photos?.[0];
    if (!photo) return null;
    // Pexels gives sized variants; pick the closest sensible one.
    return maxWidth >= 600 ? (photo.src?.large || photo.src?.medium) : (photo.src?.medium || photo.src?.small);
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Reject anonymous callers — keep this from being an open relay.
  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  try {
    const { query, max_width = 400, kind = "venue", category, location } = await req.json();
    if (!query) {
      // place_id-only requests have no free equivalent; let the caller fall back.
      return json({ error: "query is required" }, 400, corsHeaders);
    }

    const maxWidth = Math.min(Math.max(Number(max_width) || 400, 200), 1200);
    let url: string | null = null;
    let source = "";

    // Resolution order:
    //  - VENUE: exact Wikipedia title (named landmarks) -> Mapillary street photo
    //    at the venue's coordinates (real, venue-exact) -> category stock.
    //    We never broad-search Wikipedia for a venue: a fuzzy café-name search
    //    pulls unrelated articles (e.g. a radio-station list), worse than none.
    //  - AREA: exact Wikipedia title -> Wikipedia search (reliable for places).
    url = await wikiSummaryPhoto(query, maxWidth);
    if (url) source = "wikipedia";

    if (!url && kind === "area") {
      url = await wikiSearchPhoto(query, maxWidth);
      if (url) source = "wikipedia";
    }

    if (!url && kind === "venue" && location?.lat && location?.lng) {
      url = await mapillaryPhoto(Number(location.lat), Number(location.lng), maxWidth);
      if (url) source = "mapillary";
    }

    if (!url) {
      // Stock fallback: for a venue, search by its category ("cafe", "museum") so
      // the photo is at least on-theme rather than a random name match.
      const stockQuery = kind === "venue" && category ? String(category) : query;
      url = await pexelsPhoto(stockQuery, maxWidth);
      if (url) source = "pexels";
    }

    if (!url) return json({ error: "No photo available" }, 404, corsHeaders);

    return new Response(JSON.stringify({ url, source }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=604800" },
    });
  } catch (err) {
    console.error("Places photo error");
    return json({ error: "Internal server error" }, 500, corsHeaders);
  }
});
