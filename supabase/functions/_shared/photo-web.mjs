// Web venue photos, used only after the licensed sources (photo-resolver.mjs)
// found nothing:
//   1. Serper /maps: the Google Maps place at the venue's coordinates and its
//      photo. Anchored by location, so the right place is very likely.
//   2. Tavily web search with images: pages that name the venue (its own
//      site, Tabelog, blogs, guides), each image confirmed by a Gemini vision
//      check before use.
// These photos belong to their owners and are NOT copied into Storage: the
// app links them with a credit and a link to the source page. A broken link
// falls back to the placeholder in the app.
import { nameMatches, safeFetch, readCapped, imageDims, looksLikePhoto, MAX_IMAGE_BYTES } from "./photo-resolver.mjs";

const SERPER_MAPS = "https://google.serper.dev/maps";
const TAVILY_SEARCH = "https://api.tavily.com/search";
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 10_000;
const VISION_TIMEOUT_MS = 25_000;
const PREVIEW_BYTES = 900_000;

function haversineKm(lat1, lng1, lat2, lng2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Words that name a kind of place, not a particular one: sharing "records" or
// "coffee" does not make "Beat Records" the same shop as "Beatnik Records".
const GENERIC = new Set(["records", "record", "coffee", "cafe", "café", "restaurant", "store", "shop", "main", "branch",
  "bar", "bakery", "hotel", "market", "museum", "park", "garden", "shrine", "temple", "station", "house", "kitchen",
  "ramen", "sushi", "curry", "izakaya", "the", "and", "street", "center", "centre", "city", "tower", "building"]);
const tokens = (s) => String(s || "").normalize("NFKC").toLowerCase().split(/[^\p{L}\p{N}]+/u)
  .filter((t) => t.length >= 3 && !GENERIC.has(t));

// Latin letters and digits only, no spaces: "FreshAir（フレッシュエアー）" -> "freshair".
const compact = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Loose name match: a shared distinctive word, one name inside the other, or
 * the same letters once spaces go ("Fresh Air Records" / "FreshAir", "Robata
 * Oosuke" / "Osuke").
 */
export function looseNameMatch(a, b) {
  if (nameMatches(String(a || ""), [String(b || "")]) || nameMatches(String(b || ""), [String(a || "")])) return true;
  const tb = new Set(tokens(b));
  if (tokens(a).some((t) => t.length >= 4 && tb.has(t))) return true;
  const ca = compact(a), cb = compact(b);
  const shorter = ca.length <= cb.length ? ca : cb;
  const longer = ca.length <= cb.length ? cb : ca;
  return shorter.length >= 5 && longer.includes(shorter.slice(0, Math.min(shorter.length, 8)));
}

/** A Google user-content thumbnail at a usable size (960 x 720). */
export function upsizeGoogleThumb(url) {
  const u = String(url || "");
  if (!/googleusercontent\.com\//.test(u)) return u;
  return /=([wsh]\d|[wh]\d+-)/.test(u) ? u.replace(/=[^=/]*$/, "=w960-h720-k-no") : `${u}=w960-h720-k-no`;
}

/**
 * The Serper /maps place that is the venue: within 80 m of its coordinates,
 * or within 2 km with a matching name. Exported for tests.
 */
export function pickSerperPlace(places, { names, lat, lng }) {
  const scored = (places || [])
    .filter((p) => p && p.thumbnailUrl && Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    .map((p, rank) => ({ p, rank, km: haversineKm(lat, lng, p.latitude, p.longitude), named: names.some((n) => looseNameMatch(p.title, n)) }))
    // Google's best match for the name, right at the venue, is the venue even
    // when it is written differently (Japanese-only titles, other spellings).
    .filter(({ km, named, rank }) => km <= 0.08 || (rank === 0 && km <= 0.15) || (named && km <= 2))
    .sort((a, b) => (b.named - a.named) || (a.km - b.km));
  return scored[0]?.p || null;
}

/** Google Maps place photo via Serper, or null. */
export async function serperMapsPhoto({ query, names, lat, lng }, key, fetchImpl = fetch) {
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const res = await fetchImpl(SERPER_MAPS, {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, ll: `@${lat},${lng},17z` }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) { res.body?.cancel(); return null; }
    const place = pickSerperPlace((await res.json()).places, { names: names?.length ? names : [query], lat, lng });
    if (!place) return null;
    const link = place.cid ? `https://maps.google.com/?cid=${place.cid}` : place.placeId ? `https://www.google.com/maps/place/?q=place_id:${place.placeId}` : "";
    return { url: upsizeGoogleThumb(place.thumbnailUrl), source: "maps", hotlink: true, credit: { via: "Google Maps", link } };
  } catch { return null; }
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const NOT_A_PHOTO_URL = /\.svg(\?|$)|logo|icon|sprite|avatar|favicon|placeholder|banner|badge|qr[-_]?code|map[-_]/i;

/**
 * Image candidates from a Tavily response: only images from result pages whose
 * title or URL names the venue, at most 2 per page. Exported for tests.
 */
export function tavilyCandidates(json, { names }) {
  const out = [];
  for (const r of json?.results || []) {
    const page = `${r.title || ""} ${decodeURIComponent(String(r.url || "")).replace(/[-_/]+/g, " ")}`;
    if (!names.some((n) => looseNameMatch(page, n))) continue;
    for (const img of (r.images || []).slice(0, 2)) {
      const url = typeof img === "string" ? img : img?.url;
      if (!/^https:\/\//.test(url || "") || NOT_A_PHOTO_URL.test(url)) continue;
      out.push({ url, source: "web", hotlink: true, description: typeof img === "object" ? img.description || "" : "", credit: { via: hostOf(r.url), link: r.url } });
    }
  }
  const seen = new Set();
  return out.filter((c) => !seen.has(c.url) && seen.add(c.url)).slice(0, 4);
}

export async function tavilyPhotos({ query, names, city }, key, fetchImpl = fetch) {
  if (!key) return [];
  try {
    const res = await fetchImpl(TAVILY_SEARCH, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `${query} ${city || ""}`.trim(), include_images: true, include_image_descriptions: true, max_results: 6, search_depth: "basic" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) { res.body?.cancel(); return []; }
    return tavilyCandidates(await res.json(), { names: names?.length ? names : [query] });
  } catch { return []; }
}

/** Downloaded preview for the vision check, only if it is a real photo. */
async function preview(url) {
  try {
    const res = await safeFetch(url, {}, TIMEOUT_MS);
    if (!res?.ok) { res?.body?.cancel(); return null; }
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^image\/(jpeg|png|webp)$/.test(type)) { res.body?.cancel(); return null; }
    const bytes = await readCapped(res, Math.min(PREVIEW_BYTES, MAX_IMAGE_BYTES));
    if (!bytes || !looksLikePhoto(imageDims(bytes), bytes.byteLength, type)) return null;
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { mimeType: type, data: btoa(bin) };
  } catch { return null; }
}

const VISION_SCHEMA = {
  type: "object",
  properties: { images: { type: "array", items: { type: "object", properties: { index: { type: "integer" }, ok: { type: "boolean" } }, required: ["index", "ok"] } } },
  required: ["images"],
};

/**
 * First candidate a Gemini vision check confirms shows this venue (outside,
 * inside or its own food and drinks) as a real photo. Any failure rejects:
 * never a confident wrong picture.
 */
export async function visionPick(cands, { query, category, city }, { geminiKey, model }) {
  if (!cands.length || !geminiKey) return null;
  const previews = await Promise.all(cands.map((c) => preview(c.url)));
  const sent = cands.filter((_, i) => previews[i]);
  if (!sent.length) return null;
  const parts = [{ text: `These images were found on web pages about "${query}", a ${category || "place"} in ${city || "the destination"}. For each image, ok = true only if it is a real photo of this venue: its outside, its inside, or its own food, drinks or products. ok = false for a logo, menu, map, screenshot, text graphic, a portrait of a person, a generic stock photo, or a different place.` }];
  previews.filter(Boolean).forEach((inlineData, i) => parts.push({ text: `Image ${i}:` }, { inlineData }));
  try {
    const res = await fetch(`${GEMINI_API}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", responseJsonSchema: VISION_SCHEMA, maxOutputTokens: 512 } }),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    });
    if (!res.ok) { res.body?.cancel(); return null; }
    const text = ((await res.json()).candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
    const verdicts = JSON.parse(text).images || [];
    const okIndex = verdicts.filter((v) => v.ok).map((v) => v.index).sort((a, b) => a - b)[0];
    return Number.isInteger(okIndex) && sent[okIndex] ? sent[okIndex] : null;
  } catch { return null; }
}

/**
 * Best web photo for a venue, or null: Serper first (exact place), then Tavily
 * with the vision check. Each source runs only if its key is set.
 */
export async function resolveWebPhoto(place, { serperKey = "", tavilyKey = "", geminiKey = "", model = "" } = {}) {
  const names = [...new Set([place.query, ...(place.names || [])].filter(Boolean))];
  const maps = await serperMapsPhoto({ ...place, names }, serperKey);
  if (maps) return maps;
  const web = await tavilyPhotos({ ...place, names }, tavilyKey);
  return web.length ? visionPick(web, place, { geminiKey, model }) : null;
}
