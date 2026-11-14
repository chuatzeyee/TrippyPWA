// Trip cover photo: the pure half of the picker (no network). It turns API
// responses (Pexels search, Commons search and file details, Wikidata, page
// lead images) into candidates, applies the hard gates, scores what is left,
// and decides which sizes to store. cover-resolver.mjs does the fetching and
// photo-resolver.mjs re-exports everything here.
//
// The cover shows as a wide strip: about 10:1 on desktop and 2.5:1 on phones,
// under a dark gradient. Keyword weights were tuned on six sample cities
// (Sapporo, Hanoi, Melbourne, Otaru, Biei, Ninh Binh), so treat them as a
// starting point. The optional vision check (Gemini) can only remove or
// reorder candidates; relevance is always guaranteed by the gates here.
import { normalizeName, CJK, isOpenLicense, haversineKm, NOT_A_PHOTO } from "./photo-common.mjs";

// ---------------------------------------------------------------- constants

export const COVER_MIN_WIDTH = 1920;
/** Width floor for the Wikidata-linked sources when nothing else passes. */
export const COVER_RELAXED_MIN_WIDTH = 1280;
export const COVER_MIN_HEIGHT = 360;
export const COVER_MAX_BYTES = 3_000_000;
/** JPEG bytes-per-pixel floor for covers (dusk and night photos sit near 0.12). */
export const COVER_MIN_BPP = 0.08;
export const COVER_LARGE_MAX_WIDTH = 2400;
export const COVER_SMALL_WIDTH = 1280;
/** A "nothing found" verdict is retried (by the backfill) after this long. */
export const COVER_RETRY_DAYS = 30;
export const PEXELS_LICENSE = "Pexels License";

const MIN_ASPECT = 1.3;
const MAX_ASPECT = 12;
/** At or above this aspect a 1280px copy is under 450px tall: too soft for 3x phones. */
const WIDE_SMALL_ASPECT = 2.85;
const ITEM_MAX_KM = 50;
const COMMONS_MAX_KM = 30;
const NOT_A_COVER = new RegExp(`${NOT_A_PHOTO.source}|\\b(montage|collage|locator)\\b`, "i");

/** Base scores per source (decision table). */
export const COVER_BASE = Object.freeze({
  pexels: 40, featured: 45, quality: 25, valued: 20, scenic: 0,
  banner: 15, voyageLead: 10, wikiLead: 8, image: 5,
});

const ASSESSED_CATEGORIES = [
  ["featured", "Category:Featured pictures on Wikimedia Commons"],
  ["quality", "Category:Quality images"],
  ["valued", "Category:Valued images sorted by promotion date"],
];

// ---------------------------------------------------------------- text helpers

const fold = normalizeName;
const clean = (s) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();
// Copy rule: no em/en dashes, middle dots or bullets in visible text.
const plainSeparators = (s) => String(s ?? "").replace(/\s*[\u2013\u2014\u00b7\u2022\u2027\u2219]\s*/g, ", ")
  .replace(/(,\s*){2,}/g, ", ").replace(/^[,\s]+|[,\s]+$/g, "");
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const isNum = (n) => typeof n === "number" && Number.isFinite(n);
const stripQuery = (url) => String(url ?? "").split("?")[0];
const fileKey = (title) => `commons:${fold(String(title).replace(/^File:/i, ""))}`;

/** "File:Name.jpg" with spaces and a capital first letter, as the Commons API returns it. */
export function fileTitle(name) {
  const bare = String(name ?? "").replace(/^File:/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return bare ? `File:${bare.charAt(0).toUpperCase()}${bare.slice(1)}` : "";
}

const bareTitle = (title) => String(title ?? "").replace(/^File:/i, "").replace(/\.[a-z0-9]{2,5}$/i, "");

/**
 * True when a folded name appears in the text as a whole phrase (CJK: as a
 * substring). Latin names under 4 letters only count with the country beside them.
 */
export function namedIn(text, names, country = "") {
  const t = ` ${fold(text)} `;
  return (names || []).some((n) => {
    const v = fold(n);
    if (!v) return false;
    if (CJK.test(v)) return v.length >= 2 && t.includes(v);
    if (!t.includes(` ${v} `)) return false;
    return v.length >= 4 || (!!country && t.includes(` ${fold(country)} `));
  });
}

// ---------------------------------------------------------------- season

/** Month (1-12) of the middle of the trip, or null. */
export function tripMonth(startDate, endDate) {
  const s = Date.parse(`${startDate}T00:00:00Z`);
  const e = Date.parse(`${endDate || startDate}T00:00:00Z`);
  if (!Number.isFinite(s)) return null;
  const mid = new Date(Number.isFinite(e) && e >= s ? s + (e - s) / 2 : s);
  return mid.getUTCMonth() + 1;
}

const NORTH_SEASONS = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"];
const OPPOSITE = { winter: "summer", summer: "winter", spring: "autumn", autumn: "spring" };

/** "winter" | "spring" | "summer" | "autumn", or "none" in the tropics (|lat| < 23.5) or when unknown. */
export function tripSeason(month, lat) {
  if (!month || month < 1 || month > 12 || !isNum(lat) || Math.abs(lat) < 23.5) return "none";
  const north = NORTH_SEASONS[month - 1];
  return lat >= 0 ? north : OPPOSITE[north];
}

const SEASON_WORDS = {
  winter: /\b(snow|snowy|snowfall|snowing|snow covered|winter|wintry|frozen|icy|ice|frost|frosty|blizzard|ski|skiing)\b/,
  summer: /\b(summer|beach|sunflowers?|lavender|swimming|poppy|poppies)\b/,
  spring: /\b(spring|cherry blossoms?|sakura|blossoms?|tulips?|plum blossoms?)\b/,
  autumn: /\b(autumn|fall foliage|fall colou?rs|foliage|autumn leaves|maple|momiji|ginkgo)\b/,
};

/** Month (1-12) from a Commons DateTimeOriginal ("2009-01-12", "Taken on 12 June 2012"), or null. */
export function photoMonth(value) {
  const s = clean(value);
  const iso = /(?:^|\D)(\d{4})[-:](\d{2})(?:[-:]\d{2})?/.exec(s);
  if (iso) { const m = Number(iso[2]); return m >= 1 && m <= 12 ? m : null; }
  const names = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const word = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(s);
  return word ? names.indexOf(word[1].toLowerCase()) + 1 : null;
}

// ---------------------------------------------------------------- relevance

// Countries (and a few regions that share city names, e.g. Melbourne, Florida).
// A Pexels caption naming one of these, other than the trip's own country, is
// a different place. Each row is one country with its aliases.
const COUNTRY_GROUPS = [
  "afghanistan", "albania", "algeria", "andorra", "angola", "argentina", "armenia", "australia|tasmania|queensland|new south wales",
  "austria", "azerbaijan", "bahamas", "bahrain", "bangladesh", "barbados", "belarus", "belgium", "belize", "bhutan", "bolivia",
  "bosnia|bosnia and herzegovina", "botswana", "brazil|brasil", "brunei", "bulgaria", "cambodia", "cameroon",
  "canada|ontario|quebec|british columbia|alberta|nova scotia|manitoba", "chile", "china", "colombia", "costa rica", "croatia",
  "cuba", "cyprus", "czechia|czech republic", "denmark", "dominican republic", "ecuador", "egypt", "el salvador", "estonia",
  "ethiopia", "fiji", "finland", "france", "germany|deutschland", "ghana", "greece", "guatemala", "honduras",
  "hong kong", "hungary", "iceland", "india", "indonesia|bali", "iran", "iraq", "ireland", "israel", "italy|italia", "jamaica",
  "japan", "jordan", "kazakhstan", "kenya", "kuwait", "kyrgyzstan", "laos", "latvia", "lebanon", "lithuania", "luxembourg",
  "macau|macao", "madagascar", "malaysia", "maldives", "malta", "mauritius", "mexico", "moldova", "monaco", "mongolia",
  "montenegro", "morocco", "mozambique", "myanmar|burma", "namibia", "nepal", "netherlands|holland", "new zealand", "nicaragua",
  "nigeria", "north korea", "north macedonia|macedonia", "norway", "oman", "pakistan", "panama", "paraguay", "peru",
  "philippines", "poland", "portugal", "puerto rico", "qatar", "romania", "russia", "rwanda", "saudi arabia",
  "senegal", "serbia", "seychelles", "singapore", "slovakia", "slovenia", "south africa", "south korea|korea", "spain|espana",
  "sri lanka", "sweden", "switzerland", "syria", "taiwan", "tajikistan", "tanzania|zanzibar", "thailand", "tunisia",
  "turkey|turkiye", "turkmenistan", "uganda", "ukraine", "united arab emirates|uae|dubai", "united kingdom|uk|england|scotland|britain|wales|great britain",
  "united states|usa|u s a|florida|california|texas|hawaii|alaska|arizona|colorado|oregon|nevada|utah|new york|new jersey|massachusetts|louisiana|tennessee|michigan|illinois|ohio|pennsylvania|carolina|kentucky|oklahoma|missouri|minnesota|wisconsin|iowa|kansas|nebraska|montana|wyoming|idaho|vermont|connecticut|maryland|alabama|mississippi|arkansas",
  "uruguay", "uzbekistan", "venezuela", "vietnam|viet nam", "yemen", "zambia", "zimbabwe",
].map((row) => row.split("|"));

/**
 * Other-country names a caption must not contain for this trip. Empty when the
 * trip's country is unknown (every country would look foreign).
 */
export function foreignPlaceNames(country, names = []) {
  const own = fold(country);
  if (!own) return [];
  const mine = new Set((names || []).map(fold));
  const ownGroup = COUNTRY_GROUPS.find((g) => g.includes(own));
  return COUNTRY_GROUPS.filter((g) => g !== ownGroup).flat().filter((n) => !mine.has(n));
}

const NEAR_WORDS = "near|from|outside|day trip from|trip from";

/**
 * A Pexels photo is about the destination only when its caption (alt) or page
 * slug names it, not as "near/from <name>", and names no other country.
 * @param {{ alt?: string, slug?: string }} photo
 * @param {{ names: string[], country?: string }} ctx
 */
export function pexelsRelevant(photo, { names = [], country = "" } = {}) {
  const text = ` ${fold(photo?.alt)} ${fold(String(photo?.slug ?? "").replace(/-/g, " "))} `;
  const hit = (names || []).some((n) => {
    const v = fold(n);
    if (!v || !namedIn(text, [n], country)) return false;
    return !new RegExp(`\\b(${NEAR_WORDS})\\s+${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
  });
  if (!hit) return false;
  return !foreignPlaceNames(country, names).some((n) => text.includes(` ${n} `));
}

/**
 * Commons file relevance: a geotag must be within 30 km and the name must be in
 * the title or its categories; with no usable geotag the name must be in the
 * title. `requireGeotag` is set when no Wikidata item confirmed the city.
 */
export function commonsRelevant(file, { names = [], lat, lng, country = "", requireGeotag = false } = {}) {
  const named = namedIn(bareTitle(file?.title), names, country);
  const inCats = namedIn(String(file?.categories ?? "").replace(/\|/g, " "), names, country);
  const coord = file?.coord;
  const hasCenter = isNum(lat) && isNum(lng);
  if (coord && hasCenter) {
    if (haversineKm(lat, lng, coord.lat, coord.lon) > COMMONS_MAX_KM) return false;
    return named || inCats;
  }
  if (requireGeotag) return false;
  return named;
}

// ---------------------------------------------------------------- context

const LOCAL_LANG = {
  jp: "ja", cn: "zh", tw: "zh", hk: "zh", mo: "zh", kr: "ko", vn: "vi", th: "th", id: "id", fr: "fr", be: "fr", de: "de",
  at: "de", ch: "de", it: "it", es: "es", mx: "es", ar: "es", cl: "es", co: "es", pe: "es", pt: "pt", br: "pt", nl: "nl",
  ru: "ru", pl: "pl", se: "sv", fi: "fi", gr: "el", tr: "tr", ro: "ro", ua: "uk", il: "he", ir: "fa", in: "hi", bd: "bn",
};

/** Wikipedia/Wikivoyage language code for the destination's country, or "". */
export function localLanguage(dest) {
  const iso = String(dest?.countryCode || dest?.flag || "").toLowerCase().slice(0, 2);
  return LOCAL_LANG[iso] || "";
}

// "札幌市" -> also "札幌": Japanese/Chinese place labels often carry an admin suffix.
function cjkStems(label) {
  const v = String(label ?? "").trim();
  return CJK.test(v) && v.length >= 3 && /[市町村区県府都省]$/.test(v) ? [v, v.slice(0, -1)] : (v ? [v] : []);
}

// Wikidata aliases include history and regions ("Tonkin" and "Thang Long" for
// Hanoi): only spellings of the name itself ("Ha Noi", "Melbourne, Victoria")
// may prove a photo is of the city.
function nameAliases(aliases, name) {
  const key = fold(name).replace(/\s/g, "");
  if (!key) return [];
  return (aliases || []).filter((a) => {
    const v = fold(a);
    return v.replace(/\s/g, "") === key || ` ${v} `.includes(` ${fold(name)} `);
  });
}

/**
 * Everything the scorer and the fetchers need about the trip.
 * @param {{ dest: object, startDate?: string, endDate?: string, item?: object|null, landmarks?: string[] }} input
 */
export function coverContext({ dest, startDate, endDate, item = null, landmarks = [] }) {
  const name = String(dest?.name ?? "").trim();
  const lat = Number(dest?.lat), lng = Number(dest?.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const month = tripMonth(startDate, endDate);
  const names = [...new Set([name, item?.labelEn, ...cjkStems(item?.localLabel), ...nameAliases(item?.aliases, name).slice(0, 6)]
    .map((n) => String(n ?? "").trim()).filter(Boolean))];
  return {
    name, names, country: String(dest?.country ?? "").trim(), localLang: localLanguage(dest),
    lat: hasCoords ? lat : null, lng: hasCoords ? lng : null,
    month, season: tripSeason(month, hasCoords ? lat : NaN),
    population: isNum(item?.population) ? item.population : null,
    landmarks: (landmarks || []).slice(0, 2), qid: item?.qid || null,
  };
}

const LANDMARK_CATEGORIES = /^(sightseeing|nature|park|garden|beach|viewpoint|landmark|scenic|walk|walking tour|adventure|hiking)$/i;

/** The first two sightseeing/nature venues of the trip that are in the destination. */
export function coverLandmarks(activities, dest, max = 2) {
  const lat = Number(dest?.lat), lng = Number(dest?.lng);
  const hasCenter = Number.isFinite(lat) && Number.isFinite(lng);
  const city = fold(dest?.name);
  const out = [];
  for (const a of activities || []) {
    const venue = String(a?.venue_name ?? "").trim();
    if (!venue || !LANDMARK_CATEGORIES.test(String(a?.category ?? "").trim())) continue;
    const aLat = Number(a.latitude), aLng = Number(a.longitude);
    const inDest = hasCenter && Number.isFinite(aLat) && Number.isFinite(aLng) && !(aLat === 0 && aLng === 0)
      ? haversineKm(lat, lng, aLat, aLng) <= COMMONS_MAX_KM
      : !!city && ` ${fold(a.venue_address)} ${fold(venue)} `.includes(` ${city} `);
    if (inDest && !out.some((v) => fold(v) === fold(venue))) out.push(venue);
    if (out.length >= max) break;
  }
  return out;
}

/** Pexels queries: the name, then the name with the season (or skyline/landscape in the tropics). */
export function pexelsQueries(ctx) {
  if (!ctx?.name) return [];
  const second = ctx.season && ctx.season !== "none" ? ctx.season
    : (ctx.population ?? 0) >= 300_000 ? "skyline" : "landscape";
  return [ctx.name, `${ctx.name} ${second}`];
}

const quoteSafe = (s) => String(s ?? "").replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
const ASSESSED_FILTER = "incategory:Featured_pictures_on_Wikimedia_Commons|Quality_images|Valued_images_sorted_by_promotion_date";

/** Commons search strings for the curated (B) and scenic/landmark (D) tiers. */
export function commonsQueries(ctx) {
  const name = quoteSafe(ctx?.name);
  return {
    assessed: `"${name}" filew:>1919 filemime:image/jpeg ${ASSESSED_FILTER}`,
    scenic: `"${name}" panorama OR skyline OR cityscape OR view filew:>1919 filemime:image/jpeg`,
    landmarks: (ctx?.landmarks || []).map((l) => `"${quoteSafe(l)}" filew:>1919 filemime:image/jpeg`),
  };
}

// ---------------------------------------------------------------- parsing: Pexels

const hexRgb = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex ?? ""));
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};
const mimeFromUrl = (url) => {
  const ext = /\.([a-z0-9]+)(?:$|\?)/i.exec(stripQuery(url))?.[1]?.toLowerCase();
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : "";
};

/** "aerial-view-of-sapporo-s-winter-cityscape-at-dusk" from a Pexels photo page URL. */
export function pexelsSlug(url) {
  const m = /\/photo\/([^/?#]+?)-(\d+)\/?(?:[?#].*)?$/.exec(String(url ?? ""));
  return m ? m[1] : "";
}

/**
 * Pexels /v1/search JSON -> candidates (relevance is checked separately).
 * @param {object} json
 * @param {{ query?: string }} [opts]
 */
export function parsePexelsSearch(json, { query = "" } = {}) {
  const photos = Array.isArray(json?.photos) ? json.photos : [];
  return photos.map((p, i) => {
    const original = stripQuery(p?.src?.original);
    if (!p?.id || !original || !isNum(p.width) || !isNum(p.height)) return null;
    const slug = pexelsSlug(p.url);
    const alt = clean(p.alt);
    return {
      key: `pexels:${p.id}`, source: "pexels", sourceId: String(p.id), base: COVER_BASE.pexels, rank: i, query,
      title: alt || slug.replace(/-/g, " "), alt, slug, text: `${alt} ${slug.replace(/-/g, " ")}`,
      w: p.width, h: p.height, mime: mimeFromUrl(original), license: PEXELS_LICENSE, rgb: hexRgb(p.avg_color),
      original, month: null, categories: "",
      credit: {
        creator: plainSeparators(clean(p.photographer)).slice(0, 80), creatorUrl: String(p.photographer_url ?? ""),
        license: PEXELS_LICENSE, licenseUrl: "https://www.pexels.com/license/", via: "Pexels",
        link: String(p.url ?? ""), title: alt.slice(0, 160),
      },
    };
  }).filter(Boolean);
}

// ---------------------------------------------------------------- parsing: Wikimedia

const pagesOf = (json) => {
  const pages = json?.query?.pages;
  return Array.isArray(pages) ? pages : pages && typeof pages === "object" ? Object.values(pages) : [];
};
const meta = (ext, key) => clean(ext?.[key]?.value);

/**
 * Commons imageinfo pages (search results or a titles batch) -> file records.
 * Original size, URLs without tracking params, licence, credit fields, the
 * categories metadata, the assessment tier and the primary geotag.
 */
export function parseCommonsFiles(json) {
  return pagesOf(json).map((p) => {
    const ii = p?.imageinfo?.[0];
    if (!p?.title || !ii || !isNum(ii.width) || !isNum(ii.height)) return null;
    const ext = ii.extmetadata || {};
    const cats = (p.categories || []).map((c) => c?.title);
    const tier = ASSESSED_CATEGORIES.find(([, cat]) => cats.includes(cat))?.[0] || null;
    const tiers = ASSESSED_CATEGORIES.filter(([, cat]) => cats.includes(cat)).map(([t]) => t);
    const c = (p.coordinates || []).find((x) => x?.primary !== false) || p.coordinates?.[0];
    const artistHtml = String(ext.Artist?.value ?? "");
    return {
      title: p.title, index: isNum(p.index) ? p.index : null, w: ii.width, h: ii.height, mime: String(ii.mime ?? ""),
      url: stripQuery(ii.url), thumburl: stripQuery(ii.thumburl), descriptionurl: String(ii.descriptionurl ?? ""),
      license: meta(ext, "LicenseShortName"), licenseUrl: meta(ext, "LicenseUrl"),
      artist: meta(ext, "Artist"), artistUrl: /href="([^"]+)"/.exec(artistHtml)?.[1]?.replace(/^\/\//, "https://") || "",
      attribution: meta(ext, "Attribution"), month: photoMonth(meta(ext, "DateTimeOriginal")),
      description: meta(ext, "ImageDescription").slice(0, 300), categories: meta(ext, "Categories"),
      tier, tiers, coord: c && isNum(c.lat) && isNum(c.lon) ? { lat: c.lat, lon: c.lon } : null,
    };
  }).filter(Boolean);
}

/** A Commons file record -> scoring candidate. */
export function commonsCandidate(file, { source = "commons", role = null, base = 0 } = {}) {
  const creator = plainSeparators(file.attribution || file.artist).slice(0, 80);
  return {
    key: fileKey(file.title), source, role, sourceId: file.title, base,
    title: bareTitle(file.title), text: `${bareTitle(file.title)} ${file.description || ""}`,
    w: file.w, h: file.h, mime: file.mime, license: file.license, rgb: null, rank: null,
    original: file.url, thumburl: file.thumburl, month: file.month, categories: file.categories || "",
    credit: {
      creator, creatorUrl: file.artistUrl || "", license: plainSeparators(file.license), licenseUrl: file.licenseUrl || "",
      via: "Wikimedia Commons", link: file.descriptionurl || "", title: bareTitle(file.title).slice(0, 160),
    },
  };
}

/**
 * Commons search JSON -> relevant candidates. Assessed search: base from the
 * Featured/Quality/Valued tier. Scenic/landmark search: base 0.
 */
export function parseCommonsSearch(json, ctx, { scenic = false, extraNames = [], requireGeotag = false } = {}) {
  const names = [...(ctx?.names || []), ...extraNames];
  return parseCommonsFiles(json)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .filter((f) => commonsRelevant(f, { names, lat: ctx?.lat, lng: ctx?.lng, country: ctx?.country, requireGeotag }))
    .map((f) => {
      const base = scenic ? COVER_BASE.scenic : Math.max(...f.tiers.map((t) => COVER_BASE[t]), COVER_BASE.scenic);
      return commonsCandidate(f, { source: scenic ? "commons-scenic" : "commons", role: scenic ? "scenic" : f.tier, base });
    });
}

const claimsOf = (entity, prop) => (entity?.claims?.[prop] || []).filter((c) => c?.rank !== "deprecated" && c?.mainsnak?.datavalue);
const bestClaim = (entity, prop) => {
  const list = claimsOf(entity, prop);
  return list.find((c) => c.rank === "preferred") || list[0] || null;
};

function population(entity) {
  const list = claimsOf(entity, "P1082");
  if (!list.length) return null;
  const when = (c) => Date.parse(String(c.qualifiers?.P585?.[0]?.datavalue?.value?.time ?? "").replace(/^\+/, "").replace(/-00/g, "-01")) || 0;
  const pick = list.find((c) => c.rank === "preferred") || [...list].sort((a, b) => when(b) - when(a))[0];
  const n = Number(String(pick.mainsnak.datavalue.value?.amount ?? "").replace(/^\+/, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * wbgetentities JSON -> the city item nearest the destination (within 50 km),
 * or null. With no destination coordinates nothing can be confirmed: null.
 */
export function parseWikidataCity(json, { lat, lng, localLang = "" } = {}) {
  if (!isNum(lat) || !isNum(lng)) return null;
  let best = null;
  for (const e of Object.values(json?.entities || {})) {
    if (!e?.id || "missing" in e) continue;
    const coord = bestClaim(e, "P625")?.mainsnak?.datavalue?.value;
    if (!coord || !isNum(coord.latitude) || !isNum(coord.longitude)) continue;
    const km = haversineKm(lat, lng, coord.latitude, coord.longitude);
    if (km > ITEM_MAX_KM || (best && best.distanceKm <= km)) continue;
    const site = (key) => e.sitelinks?.[key]?.title || null;
    best = {
      qid: e.id, distanceKm: km,
      banner: bestClaim(e, "P948")?.mainsnak?.datavalue?.value || null,
      image: bestClaim(e, "P18")?.mainsnak?.datavalue?.value || null,
      population: population(e),
      labelEn: e.labels?.en?.value || null,
      localLabel: localLang ? e.labels?.[localLang]?.value || null : null,
      aliases: (e.aliases?.en || []).map((a) => a?.value).filter(Boolean),
      sitelinks: { enwiki: site("enwiki"), enwikivoyage: site("enwikivoyage"), localwikivoyage: localLang ? site(`${localLang}wikivoyage`) : null },
    };
  }
  return best;
}

/** pageprops JSON -> the page's free lead image as a "File:" title, or null. */
export function parseLeadImage(json) {
  const page = pagesOf(json).find((p) => p?.pageprops?.page_image_free);
  return page ? fileTitle(page.pageprops.page_image_free) : null;
}

/**
 * Commons titles-batch JSON + the role of each requested file -> candidates.
 * A file with several roles (say P18 and a Wikipedia lead) keeps the best base.
 * @param {object} json
 * @param {Array<{ file: string, role: "banner"|"voyageLead"|"wikiLead"|"image" }>} roles
 */
export function wikidataCandidates(json, roles) {
  const alias = new Map();
  for (const n of [...(json?.query?.normalized || []), ...(json?.query?.redirects || [])]) alias.set(fileTitle(n.from), fileTitle(n.to));
  const resolve = (t) => { let x = fileTitle(t); for (let i = 0; i < 3 && alias.has(x); i++) x = alias.get(x); return x; };
  const roleOf = new Map();
  for (const r of roles || []) {
    const t = resolve(r.file);
    const base = COVER_BASE[r.role] ?? 0;
    if (t && (!roleOf.has(t) || roleOf.get(t).base < base)) roleOf.set(t, { role: r.role, base });
  }
  return parseCommonsFiles(json)
    .filter((f) => roleOf.has(fileTitle(f.title)))
    .map((f) => commonsCandidate(f, { source: "wikidata", ...roleOf.get(fileTitle(f.title)) }));
}

// ---------------------------------------------------------------- gates

/**
 * Why a candidate can never be a cover, or null when it passes the hard gates.
 * (Byte size and bytes-per-pixel are checked on download.)
 */
export function coverGateReason(c, { minWidth = COVER_MIN_WIDTH } = {}) {
  if (!c) return "missing";
  if (c.license !== PEXELS_LICENSE && !isOpenLicense(c.license)) return "license";
  if (!/^image\/(jpeg|webp)$/.test(c.mime || "")) return "type";
  if (!isNum(c.w) || !isNum(c.h) || c.w < minWidth || c.h < COVER_MIN_HEIGHT) return "size";
  const aspect = c.w / c.h;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return "shape";
  if (NOT_A_COVER.test(String(c.title ?? "").replace(/_/g, " "))) return "not-a-photo";
  return null;
}

// ---------------------------------------------------------------- scoring

const SCENIC_STRONG = /\b(skyline|panorama|panoramic|sunset|sunrise|aerial|cityscape|canal|flower fields?|karst|limestone)\b/g;
const SCENIC = /\b(view|landscape|river|lake|pond|bay|harbou?r|coast|mountains?|hills?|valley|fields?|reflections?|dusk|twilight|golden hour|blue hour|waterfront|bridge|rooftops|rice|terraces?|old town)\b/g;
const UNSCENIC = /\b(street food|vendors?|market|crowd|people|man|woman|girl|boy|couple|portrait|selfie|interiors?|inside|lobby|foyer|auditorium|concert hall|room|menu|food|dish|ramen|noodles?|beer|sign|signboard|plaque|neon|vending|train|bus|taxi|car|cars|traffic|motorbikes?|scooters?|statue|museum|exhibit|close up|closeup|detail|festival|parade|construction|shop|store|restaurant|cafe|bar)\b/g;
const uniqueHits = (text, re) => new Set(text.match(re) || []).size;

function colourPenalty(rgb) {
  if (!Array.isArray(rgb) || rgb.length < 3) return [0, null];
  const [r, g, b] = rgb;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2;
  const sat = mx === mn ? 0 : l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
  if (y > 160 && sat < 0.15) return [-10, "washed-out -10"];
  if (y < 70) return [-6, "dark -6"];
  return [0, null];
}

function seasonPoints(text, month, ctx) {
  const season = ctx?.season || "none";
  if (season === "none") return SEASON_WORDS.winter.test(text) ? [[-25, "snow in a no-season trip -25"]] : [];
  const out = [];
  if (SEASON_WORDS[season].test(text) || (month && tripSeason(month, ctx.lat) === season)) out.push([6, "season +6"]);
  for (const other of Object.keys(SEASON_WORDS)) {
    if (other === season || !SEASON_WORDS[other].test(text)) continue;
    out.push(OPPOSITE[season] === other ? [-25, `${other} -25`] : [-10, `${other} -10`]);
  }
  return out;
}

/**
 * Keyword and shape score for a candidate that passed the gates.
 * @returns {{ score: number, why: string }}
 */
export function scoreCover(c, ctx) {
  const text = ` ${fold(c.text)} `;
  const parts = [[c.base || 0, `base ${c.base || 0}`]];
  const scenic = Math.min(25, 10 * uniqueHits(text, SCENIC_STRONG) + 5 * uniqueHits(text, SCENIC));
  if (scenic) parts.push([scenic, `scenic +${scenic}`]);
  // Commons categories flag what titles hide: "Featured pictures of building
  // interiors", "Personality rights warning" (identifiable people).
  const unscenic = uniqueHits(text, UNSCENIC) + (/\b(interiors|personality rights)\b/i.test(c.categories || "") ? 1 : 0);
  if (unscenic) parts.push([-15 * unscenic, `unscenic -${15 * unscenic}`]);
  if (/\b(black and white|monochrome|b w|grayscale|greyscale)\b/.test(text)) parts.push([-20, "black and white -20"]);
  if (/\b(night|nightscape|nighttime)\b/.test(text)) parts.push([-6, "night -6"]);
  const aspect = c.w / c.h;
  if (aspect >= 2.5) parts.push([10, "panorama +10"]); else if (aspect >= 1.7) parts.push([5, "wide +5"]);
  if (c.w >= 3800) parts.push([6, "width +6"]); else if (c.w >= 2400) parts.push([3, "width +3"]); else parts.push([-8, "narrow -8"]);
  parts.push(...seasonPoints(text, c.month, ctx));
  const [colour, colourWhy] = colourPenalty(c.rgb);
  if (colour) parts.push([colour, colourWhy]);
  if (isNum(c.rank) && c.rank > 0) parts.push([-Math.min(12, c.rank * 0.5), `position -${Math.min(12, c.rank * 0.5)}`]);
  const score = Math.round(parts.reduce((s, [n]) => s + n, 0) * 10) / 10;
  return { score, why: parts.map(([, w]) => w).join(", ") };
}

/** Same photo from two sources or queries: keep the better base and the best Pexels position. */
function dedupe(cands) {
  const byKey = new Map();
  for (const c of cands || []) {
    if (!c?.key) continue;
    const prev = byKey.get(c.key);
    if (!prev) { byKey.set(c.key, c); continue; }
    const better = (c.base ?? 0) > (prev.base ?? 0) ? c : prev;
    const rank = isNum(prev.rank) && isNum(c.rank) ? Math.min(prev.rank, c.rank) : better.rank;
    byKey.set(c.key, { ...better, rank });
  }
  return [...byKey.values()];
}

/**
 * Gate, score and sort candidates, best first. When nothing passes, the
 * Wikidata-linked files get a second chance with a 1280px width floor.
 * @returns {Array<object>} candidates with score and why
 */
export function rankCoverCandidates(cands, ctx) {
  const pool = dedupe(cands);
  const rank = (list, minWidth) => list
    .filter((c) => !coverGateReason(c, { minWidth }))
    .map((c) => ({ ...c, ...scoreCover(c, ctx) }))
    .sort((a, b) => (b.score - a.score) || ((b.base ?? 0) - (a.base ?? 0)));
  const ranked = rank(pool, COVER_MIN_WIDTH);
  if (ranked.length) return ranked;
  return rank(pool.filter((c) => c.source === "wikidata"), COVER_RELAXED_MIN_WIDTH);
}

// ---------------------------------------------------------------- sizes, crop, credit

/** Wikimedia thumbnail URL at a standard width (never wider than the original). */
export function wikiThumbUrl(c, width) {
  if (!c?.original || width >= c.w) return stripQuery(c?.original) || null;
  if (/\/\d+px-/.test(c.thumburl || "")) return stripQuery(c.thumburl).replace(/\/\d+px-/, `/${width}px-`);
  const m = /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f]\/[0-9a-f]{2}\/([^/]+))$/.exec(stripQuery(c.original));
  return m ? `${m[1]}/thumb/${m[2]}/${width}px-${m[3]}` : null;
}

const sized = (c, w) => ({ w, h: Math.round(c.h * w / c.w) });

/**
 * Which files to download and store. `large` lists options in order (the next
 * one is tried when a copy is over COVER_MAX_BYTES or fails); `small` is the
 * 1280px copy, or null for very wide images where it would be too soft.
 * @returns {{ large: Array<{ url: string, w: number, h: number }>, small: { url: string, w: number, h: number } | null }}
 */
export function coverSizes(c) {
  const aspect = c.w / c.h;
  if (c.source === "pexels") {
    const at = (w) => ({ url: `${c.original}?auto=compress&cs=tinysrgb&w=${w}`, ...sized(c, w) });
    const lw = Math.min(COVER_LARGE_MAX_WIDTH, c.w);
    const small = aspect < WIDE_SMALL_ASPECT && lw > COVER_SMALL_WIDTH ? at(COVER_SMALL_WIDTH) : null;
    return { large: [at(lw)], small };
  }
  const thumb = (w) => {
    const url = wikiThumbUrl(c, w);
    return url ? { url, ...sized(c, Math.min(w, c.w)) } : null;
  };
  const original = { url: stripQuery(c.original), w: c.w, h: c.h };
  let large;
  if (c.w >= 3840) large = [thumb(3840), thumb(1920)];
  else if (c.w >= COVER_LARGE_MAX_WIDTH) large = [original, thumb(1920)];
  else if (c.w > 1920) large = [thumb(1920)];
  else large = [original, c.w > COVER_SMALL_WIDTH ? thumb(COVER_SMALL_WIDTH) : null];
  let small = null;
  if (aspect < WIDE_SMALL_ASPECT) small = c.w > COVER_SMALL_WIDTH ? thumb(COVER_SMALL_WIDTH) : null;
  else if (c.w >= 3840) small = thumb(1920);
  return { large: large.filter((x) => x && x.url), small };
}

/** Vertical crop position (%) for the strip: the vision check's pick, else 38% (50% for wide images). */
export function coverFocusY(c) {
  if (isNum(c?.judgeFocusY)) return clamp(Math.round(c.judgeFocusY), 15, 65);
  const aspect = c?.w / c?.h;
  return aspect >= 2.2 || c?.role === "banner" ? 50 : 38;
}

/** The credit stored in extras.cover.credit (separators already plain). */
export function coverCredit(c) {
  const cr = c?.credit || {};
  return {
    creator: plainSeparators(cr.creator), creatorUrl: cr.creatorUrl || "", license: plainSeparators(cr.license),
    licenseUrl: cr.licenseUrl || "", via: cr.via || "", link: cr.link || "", title: plainSeparators(cr.title),
  };
}

/**
 * extras.cover for a stored pick.
 * @param {object} c ranked candidate
 * @param {{ large: object, small: object|null, ctx: object, now?: number }} stored
 */
export function coverRecord(c, { large, small, ctx, now = Date.now() }) {
  return {
    v: 2, source: c.source, role: c.role || null, sourceId: c.sourceId, qid: ctx?.qid || null,
    large, small: small || null, focusY: coverFocusY(c), season: ctx?.season || "none", month: ctx?.month || null,
    score: c.score ?? null, judge: c.judge || null, credit: coverCredit(c), pickedAt: new Date(now).toISOString(),
  };
}

/** extras.cover when nothing passed: the client shows the plain header. */
export function noCoverRecord(now = Date.now()) {
  return { v: 2, none: true, triedAt: new Date(now).toISOString() };
}

// ---------------------------------------------------------------- replace rules

/** A cover the old resolver stored automatically (`.../trip-photos/<tripId>/cover.<ext>`). */
export function isAutoCoverV1(url, tripId) {
  return !!url && !!tripId && String(url).includes(`/trip-photos/${tripId}/cover.`);
}

/** A copy this picker stored for the trip (`.../trip-photos/<tripId>/cover-v2-...`). */
export function isAutoCoverV2(url, tripId) {
  return !!url && !!tripId && String(url).includes(`/trip-photos/${tripId}/cover-v2-`);
}

/**
 * cover_image is one of our v2 copies but extras.cover does not describe it:
 * the record was lost (replace_itinerary on "Regenerate Itinerary" replaces
 * the whole of extras) or overwritten. Without the record the header has no
 * credit, no srcset and no crop, so such a cover is picked again.
 * @param {{ cover_image?: string, extras?: object }} row
 */
export function isOrphanCoverV2(row, tripId) {
  const url = row?.cover_image || "";
  return isAutoCoverV2(url, tripId) && row?.extras?.cover?.large?.url !== url;
}

/**
 * Whether the picker may (re)pick this trip's cover: the cover is empty, a v1
 * automatic pick, a v2 copy whose record was lost, or a v2 "nothing found"
 * that is 30+ days old. A cover the user chose or a curated one is never
 * replaced.
 * @param {{ cover_image?: string, extras?: object }} row
 */
export function coverNeedsPick(row, tripId, now = Date.now()) {
  const cover = row?.extras?.cover;
  const url = row?.cover_image || "";
  if (isOrphanCoverV2(row, tripId)) return true;
  if (cover && Number(cover.v) >= 2) {
    if (!cover.none || url) return false;
    const tried = Date.parse(cover.triedAt);
    return !Number.isFinite(tried) || now - tried >= COVER_RETRY_DAYS * 86_400_000;
  }
  return !url || isAutoCoverV1(url, tripId);
}

const COPY_TAG = /^[0-9a-z]{6,16}$/;

/**
 * Storage path of one cover copy: `<tripId>/cover-v2-<width>w-<tag>.<ext>`.
 * `tag` is new for every pick, so two pickers running on the same trip never
 * overwrite each other's files (the saved record always matches its image),
 * and a re-pick never hides behind a cached copy of the old photo. Never
 * "/<width>px-": the client rewrites that Wikimedia thumbnail pattern.
 * @param {string} tripId
 * @param {{ width: number, contentType?: string }} copy
 * @param {string} tag 6 to 16 lowercase letters or digits
 * @returns {string | null} null for a bad width or tag
 */
export function coverCopyPath(tripId, { width, contentType = "image/jpeg" } = {}, tag) {
  if (!tripId || !isNum(width) || width <= 0 || !COPY_TAG.test(String(tag ?? ""))) return null;
  const ext = contentType === "image/webp" ? "webp" : "jpg";
  return `${tripId}/cover-v2-${Math.round(width)}w-${tag}.${ext}`;
}

/** Fresh extras with the new cover record (other keys untouched). */
export function mergeCoverExtras(freshExtras, cover) {
  const base = freshExtras && typeof freshExtras === "object" && !Array.isArray(freshExtras) ? freshExtras : {};
  return { ...base, cover };
}

// ---------------------------------------------------------------- hosts and quotas

const COVER_HOSTS = new Set(["images.pexels.com", "upload.wikimedia.org", "thumb.wikimedia.org"]);

/** Cover copies and previews are only ever downloaded from the Pexels and Wikimedia image CDNs. */
export function isCoverHost(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" && !u.port && COVER_HOSTS.has(u.hostname);
  } catch { return false; }
}

/** Pexels rate headers -> { remaining, resetAt (ms) }, or null when absent. */
export function readPexelsQuota(headers) {
  const raw = headers?.get?.("x-ratelimit-remaining");
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const remaining = Number(raw);
  const reset = Number(headers.get("x-ratelimit-reset"));
  if (!Number.isFinite(remaining)) return null;
  return { remaining, resetAt: Number.isFinite(reset) ? reset * 1000 : 0 };
}

/** Skip Pexels while fewer than 10 requests are left in the current window. */
export function pexelsAllowed(quota, now = Date.now()) {
  return !quota || quota.remaining >= 10 || (quota.resetAt > 0 && now >= quota.resetAt);
}
