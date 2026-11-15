// Trip cover photo: the network half of the picker, used by resolve-trip-photos.
// Pure `fetch` (Deno and Node). The scoring, gates and parsing live in
// cover-rank.mjs and cover-judge.mjs.
//
//   1. The city's Wikidata item (1 call), accepted only within 50 km of the
//      destination: labels, aliases, population, banner (P948), image (P18)
//      and Wikivoyage/Wikipedia sitelinks.
//   2. In parallel:
//      A. Pexels (if PEXELS_API_KEY): "<name>" and "<name> <season>", kept only
//         when the caption or slug names the city.
//      B. Commons Featured/Quality/Valued images naming the city (1 call).
//      C. Files linked to the item: banner, P18 and page lead images (up to 3
//         lead calls, 1 file-details call).
//   3. Fewer than 3 candidates passed: Commons scenic and landmark searches,
//      while the Wikimedia call budget lasts (7 per cover in total).
//   4. Optional vision check (GEMINI_API_KEY): one generateContent call.
//
// Every Wikimedia call goes through the shared rate gate in photo-resolver.mjs.
// Pexels is skipped while its rate headers say fewer than 10 requests remain.
import { gatedFetch, readCapped } from "./photo-resolver.mjs";
import {
  coverContext, commonsQueries, pexelsQueries, parsePexelsSearch, pexelsRelevant, parseCommonsSearch,
  parseWikidataCity, parseLeadImage, wikidataCandidates, rankCoverCandidates, coverGateReason, fileTitle,
  isCoverHost, readPexelsQuota, pexelsAllowed,
} from "./cover-rank.mjs";
import { judgeSet, judgeThumbUrl, judgePrompt, JUDGE_SCHEMA, parseJudgeReply, applyJudge } from "./cover-judge.mjs";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const PEXELS_SEARCH = "https://api.pexels.com/v1/search";
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const WIKIMEDIA_CALLS_PER_COVER = 7;
const API_TIMEOUT_MS = 8000;
const JUDGE_TIMEOUT_MS = 10_000;
const THUMB_TIMEOUT_MS = 5000;
const THUMB_MAX_BYTES = 400_000;
const MIN_PASSING = 3;
const ASSESSED_CATEGORIES = "Category:Featured pictures on Wikimedia Commons|Category:Quality images|Category:Valued images sorted by promotion date";
const IMAGE_INFO = {
  iiprop: "url|size|mime|extmetadata",
  iiurlwidth: "1920",
  iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Attribution|DateTimeOriginal|ImageDescription|Categories",
};

// Pexels quota as last reported by its rate headers (per isolate).
let pexelsQuota = null;

function callBudget(n) {
  let left = n;
  return { take: () => (left > 0 ? (left--, true) : false), get left() { return left; } };
}

// `answered` collects which sources replied, so a network failure is never
// mistaken for "this city has no usable photo".
async function wikimediaJson(api, params, budget, answered, label) {
  if (!budget.take()) return null;
  try {
    const qs = new URLSearchParams({ format: "json", ...params });
    const res = await gatedFetch(`${api}?${qs}`, { headers: { accept: "application/json" } }, API_TIMEOUT_MS);
    if (!res.ok) { res.body?.cancel(); return null; }
    const json = await res.json();
    if (json?.error) return null;
    answered.add(label);
    return json;
  } catch { return null; }
}

async function fetchCityItem(seed, budget, answered) {
  const lang = seed.localLang;
  const json = await wikimediaJson(WIKIDATA_API, {
    action: "wbgetentities", sites: "enwikivoyage|enwiki", titles: seed.name,
    props: "claims|sitelinks|labels|aliases", languages: lang ? `en|${lang}` : "en",
    sitefilter: ["enwiki", "enwikivoyage", lang && `${lang}wikivoyage`].filter(Boolean).join("|"),
  }, budget, answered, "item");
  return json ? parseWikidataCity(json, { lat: seed.lat, lng: seed.lng, localLang: lang }) : null;
}

async function commonsSearch(query, ctx, opts, budget, answered) {
  const json = await wikimediaJson(COMMONS_API, {
    action: "query", formatversion: "2", generator: "search", gsrnamespace: "6", gsrlimit: "30", gsrsearch: query,
    // Featured pictures are linked from the FP galleries, so this order brings
    // them to the top of the assessed tier (relevance order buries them).
    ...(opts.sort ? { gsrsort: opts.sort } : {}),
    prop: "imageinfo|categories|coordinates", clcategories: ASSESSED_CATEGORIES, cllimit: "max",
    // prop=coordinates returns 10 geotags per batch by default. A file that
    // loses its geotag skips the 30 km check (or fails requireGeotag), so ask
    // for all of them (30 files, up to 500 coordinates).
    colimit: "max", ...IMAGE_INFO,
  }, budget, answered, opts.scenic ? "scenic" : "assessed");
  return json ? parseCommonsSearch(json, ctx, opts) : [];
}

// Banner, P18 and page lead images of the verified item, as candidates.
async function linkedCandidates(item, ctx, budget, answered) {
  const pages = [
    item.sitelinks.enwikivoyage && { host: "en.wikivoyage.org", title: item.sitelinks.enwikivoyage, role: "voyageLead" },
    item.sitelinks.localwikivoyage && { host: `${ctx.localLang}.wikivoyage.org`, title: item.sitelinks.localwikivoyage, role: "voyageLead" },
    item.sitelinks.enwiki && { host: "en.wikipedia.org", title: item.sitelinks.enwiki, role: "wikiLead" },
  ].filter(Boolean);
  const leads = await Promise.all(pages.map(async (p) => {
    const json = await wikimediaJson(`https://${p.host}/w/api.php`, {
      action: "query", formatversion: "2", titles: p.title, prop: "pageprops", ppprop: "page_image_free", redirects: "1",
    }, budget, answered, "lead");
    const file = json ? parseLeadImage(json) : null;
    return file ? { file, role: p.role } : null;
  }));
  const roles = [
    item.banner && { file: fileTitle(item.banner), role: "banner" },
    item.image && { file: fileTitle(item.image), role: "image" },
    ...leads,
  ].filter(Boolean);
  const titles = [...new Set(roles.map((r) => r.file))];
  if (!titles.length) return [];
  const json = await wikimediaJson(COMMONS_API, {
    action: "query", formatversion: "2", redirects: "1", titles: titles.join("|"), prop: "imageinfo", ...IMAGE_INFO,
  }, budget, answered, "files");
  return json ? wikidataCandidates(json, roles) : [];
}

async function pexelsSearch(query, key) {
  if (!pexelsAllowed(pexelsQuota)) return null;
  const qs = new URLSearchParams({ query, orientation: "landscape", size: "small", per_page: "40" });
  const res = await gatedFetch(`${PEXELS_SEARCH}?${qs}`, { headers: { Authorization: key, accept: "application/json" } }, API_TIMEOUT_MS);
  pexelsQuota = readPexelsQuota(res.headers) || pexelsQuota;
  if (!res.ok) { res.body?.cancel(); return null; }
  return res.json();
}

async function pexelsCandidates(ctx, key, answered) {
  const out = [];
  for (const query of pexelsQueries(ctx)) {
    let json = null;
    try { json = await pexelsSearch(query, key); } catch { json = null; }
    if (!json) break;
    answered.add("pexels");
    out.push(...parsePexelsSearch(json, { query }).filter((c) => pexelsRelevant(c, ctx)));
  }
  return out;
}

function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function fetchPreview(url) {
  if (!isCoverHost(url)) return null;
  try {
    const res = await gatedFetch(url, {}, THUMB_TIMEOUT_MS);
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!res.ok || !/^image\/(jpeg|webp|png)$/.test(type)) { res.body?.cancel(); return null; }
    const bytes = await readCapped(res, THUMB_MAX_BYTES);
    return bytes ? { mimeType: type, data: toBase64(bytes) } : null;
  } catch { return null; }
}

/**
 * One generateContent call over the top candidates' 500px previews. Returns
 * the reordered list (bad ones removed), or the heuristic order on any failure.
 */
async function judgeCovers(ranked, ctx, { geminiKey, geminiModel }) {
  try {
    const picks = judgeSet(ranked);
    const previews = await Promise.all(picks.map((c) => fetchPreview(judgeThumbUrl(c))));
    const sent = picks.filter((_, i) => previews[i]);
    if (!sent.length) return ranked;
    const parts = [{ text: judgePrompt(ctx, sent.length) }];
    previews.filter(Boolean).forEach((inlineData, i) => parts.push({ text: `Image ${i}:` }, { inlineData }));
    const res = await fetch(`${GEMINI_API}/${encodeURIComponent(geminiModel)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          // Gemini 3.x: no temperature (ignored, later rejected) and no
          // thinkingBudget; the Flash-Lite judge thinks minimally by default.
          responseMimeType: "application/json", responseSchema: JUDGE_SCHEMA, maxOutputTokens: 2048,
        },
      }),
      signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
    });
    if (!res.ok) { res.body?.cancel(); return ranked; }
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).find((p) => typeof p?.text === "string" && !p.thought)?.text;
    return applyJudge(ranked, sent, parseJudgeReply(text, sent.length));
  } catch {
    return ranked;
  }
}

/**
 * Ranked cover candidates for a trip, best first.
 * @param {{ dest: object, startDate?: string, endDate?: string, landmarks?: string[] }} trip
 * @param {{ pexelsKey?: string, geminiKey?: string, geminiModel?: string }} [opts]
 * @returns {Promise<{ ranked: object[], ctx: object, complete: boolean }>} complete: the main
 *   sources answered (Wikidata, the Commons search and Pexels when a key is set), so an
 *   empty result really means "nothing usable" rather than "a source was down"
 */
export async function findCoverCandidates(trip, opts = {}) {
  const seed = coverContext(trip);
  if (!seed.name) return { ranked: [], ctx: seed, complete: false };
  const budget = callBudget(WIKIMEDIA_CALLS_PER_COVER);
  const answered = new Set();
  const item = await fetchCityItem(seed, budget, answered);
  const ctx = coverContext({ ...trip, item });
  // No item confirmed the city: Commons hits need a geotag near it.
  const requireGeotag = !item;
  const queries = commonsQueries(ctx);
  const [pexels, assessed, linked] = await Promise.all([
    opts.pexelsKey ? pexelsCandidates(ctx, opts.pexelsKey, answered) : [],
    commonsSearch(queries.assessed, ctx, { sort: "incoming_links_desc", requireGeotag }, budget, answered),
    item ? linkedCandidates(item, ctx, budget, answered) : [],
  ]);
  const pool = [...pexels, ...assessed, ...linked];
  let ranked = rankCoverCandidates(pool, ctx);
  if (ranked.filter((c) => !coverGateReason(c)).length < MIN_PASSING) {
    const extra = [];
    const searches = [[queries.scenic, []], ...queries.landmarks.map((q, i) => [q, [ctx.landmarks[i]]])];
    for (const [query, extraNames] of searches) {
      if (budget.left <= 0) break;
      extra.push(...await commonsSearch(query, ctx, { scenic: true, extraNames, requireGeotag }, budget, answered));
    }
    if (extra.length) ranked = rankCoverCandidates([...pool, ...extra], ctx);
  }
  if (opts.geminiKey && ranked.length) {
    ranked = await judgeCovers(ranked, ctx, { geminiKey: opts.geminiKey, geminiModel: opts.geminiModel || "gemini-3.5-flash-lite" });
  }
  const complete = answered.has("item") && answered.has("assessed") && (!opts.pexelsKey || answered.has("pexels"));
  return { ranked, ctx, complete };
}
