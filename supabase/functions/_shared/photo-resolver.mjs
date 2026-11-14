// Venue/area photo resolver, used by the resolve-trip-photos edge function
// (Deno). Pure `fetch`, no runtime-specific APIs; pure helpers are unit-tested
// in photo-resolver.test.mjs.
//
// HARD RULE: never a generic stock photo, never a confident WRONG match. We
// return either (a) a real photo of the actual venue/area, verified by a trusted
// id, by coordinates, or by the venue's name in the photo's title, or (b) an
// HONEST street-level view of the exact location (labelled "Street view").
// Otherwise null -> gradient. All sources are free.
//
//   VENUE, phase 1 (exact ids, in parallel):
//     OSM Overpass name(+name:en) within 160m -> image / wikimedia_commons / wikidata tag
//     Wikidata name search geofenced to 300m -> P18
//     Wikipedia exact title (named landmarks)
//   VENUE, phase 2 (verified web photos, in parallel):
//     Official website preview image (og:image), hero-shaped, not a logo
//     Wikimedia Commons search: within 300m, or name in title (and near if geotagged)
//     Openverse (Creative Commons, e.g. Flickr): name in title, open licence only
//   VENUE fallback: Mapillary street-level at the coords, 1024px, source "street"
//   AREA: Wikipedia exact -> search -> Commons geosearch -> street
//
// Every result is { url, source, credit? } where credit = { creator, license, via, link }.

const UA = "TrippyPWA/2.0 (photo resolver; github.com/chuatzeyee/TrippyPWA)";
const TIMEOUT_MS = 6000;
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const COMMONS_FILEPATH = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const MIN_PHOTO_WIDTH = 1000;
const NOT_A_PHOTO = /\b(map|logo|diagram|plan|coat[_ ]of[_ ]arms|flag|icon|seal|emblem|chart|graph)\b/i;
const NON_VENUE_HOSTS = /(^|\.)(booking|agoda|expedia|hotels|trip|klook|kkday|tripadvisor|tabelog|gurunavi|hotpepper|jalan|ikyu|rakuten|airbnb|google|goo\.gl|facebook|instagram|x|twitter|tiktok|youtube|wikipedia|wikimedia|flyscoot|singaporeair|cathaypacific|japan-guide|timeout|retty|omakase|tablecheck|autoreserve|jpneazy)\./i;

// ---------------------------------------------------------------- pure helpers

export function normalizeName(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const CJK = /[぀-ヿ㐀-鿿가-힯]/;

// True when one of the (trustworthy-length) name variants appears in the title.
export function nameMatches(title, names) {
  const t = ` ${normalizeName(title)} `;
  return (names || []).some((n) => {
    const v = normalizeName(n);
    const longEnough = CJK.test(v) ? v.length >= 2 : v.length >= 5;
    if (!longEnough) return false;
    return CJK.test(v) ? t.includes(v) : t.includes(` ${v} `) || t.includes(` ${v}`);
  });
}

// Licences usable in an app with affiliate links: no NC (non-commercial), no ND.
export function isOpenLicense(license) {
  const l = String(license ?? "").toLowerCase().replace(/^cc[\s-]+/, "").trim();
  if (!l) return false;
  if (/\bnc\b|\bnd\b|-nc|-nd/.test(l)) return false;
  return /^(cc0|pdm|public domain|by(-sa)?)(\s|$|\d)/.test(l) || l === "cc0" || l === "pdm";
}

export function extractOgImage(html, baseUrl) {
  const pick = (prop) => {
    const a = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i").exec(html);
    const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i").exec(html);
    return (a || b)?.[1] || null;
  };
  const raw = pick("og:image") || pick("og:image:url") || pick("twitter:image");
  if (!raw) return null;
  try {
    const u = new URL(raw.replace(/&amp;/g, "&"), baseUrl);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch { return null; }
}

// Width/height from the first bytes of a PNG, JPEG or WebP; null if unknown.
export function imageDims(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b.length >= 24) {
    const w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
    const h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
    return { width: w >>> 0, height: h >>> 0 };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 8 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + len;
    }
    return null;
  }
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45 && b[12] === 0x56 && b[13] === 0x50) {
    if (b[15] === 0x58) return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (b[15] === 0x20 && b.length >= 30) return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  return null;
}

// A website preview image worth showing: big, landscape, not a logo/icon.
export function isHeroShaped(dims, url) {
  if (!dims || dims.width < 800) return false;
  const ratio = dims.width / Math.max(1, dims.height);
  if (ratio < 1.2 || ratio > 2.4) return false;
  return !/logo|icon|favicon|banner_?text|noimage|no_image|placeholder/i.test(String(url));
}

export function isOfficialSite(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return !NON_VENUE_HOSTS.test(`.${u.hostname}`);
  } catch { return false; }
}

// Wikimedia only renders standard thumbnail widths (others return HTTP 400).
const WIKI_WIDTHS = [330, 500, 960, 1280, 1920];
export function snapWidth(w) {
  const n = Number(w) || 960;
  return [...WIKI_WIDTHS].reverse().find((s) => s <= n) || WIKI_WIDTHS[0];
}

// "Nemuro Hanamaru, Stellar Place" / "Suage+ or Garaku" / "X · Y" / "X (note)":
// search by the first place name, but keep the full string as a match variant.
export function splitVenueName(name) {
  const full = String(name ?? "").trim();
  const primary = full.split(/\s*(?:,|·|\||\/|\(|\s-\s|\sor\s|\s&\s)\s*/i)[0].trim() || full;
  return { primary, variants: primary === full ? [full] : [full, primary] };
}

// A real photograph rather than a logo/banner/flag/tiny thumbnail. Calibrated
// on resolver output: photos run 0.15-0.45 bytes/pixel as JPEG; flat graphics
// compress far smaller (a festival banner PNG was 0.10, a flag 0.006).
export function looksLikePhoto(dims, byteLength, contentType = "") {
  if (!dims || dims.width < 800 || byteLength < 40 * 1024) return false;
  const bpp = byteLength / (dims.width * dims.height);
  return /png/i.test(contentType) ? bpp >= 0.35 : bpp >= 0.12;
}

// Safe to match on name alone (no coordinates): multi-word or 3+ CJK chars.
// Single common words ("Daruma", "Bossa", "Jamaica") need location proof.
export function isDistinctiveName(name) {
  const v = normalizeName(name);
  if (CJK.test(v)) return v.replace(/\s/g, "").length >= 3;
  return v.split(" ").filter((w) => w.length >= 2).length >= 2;
}

const stripHtml = (s) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

// ---------------------------------------------------------------- SSRF guard
// Venue websites, og:image URLs and OSM image tags are user/third-party
// controlled. Before fetching any of them: http(s) on default ports only, no
// internal/private/link-local/metadata targets, redirects re-checked per hop,
// and bodies read with a hard byte cap.

function ipv4Blocked(a, b) {
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function ipBlocked(ip) {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) return ipv4Blocked(Number(v4[1]), Number(v4[2]));
  return ip.includes(":"); // any IPv6 address: not needed for venue sites, simplest to refuse
}

/** Why `url` must not be fetched server-side, or null if it is a plain public http(s) URL. */
export function blockedUrlReason(url) {
  let u;
  try { u = new URL(String(url)); } catch { return "invalid url"; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "scheme";
  if (u.username || u.password) return "credentials";
  if (u.port && u.port !== "80" && u.port !== "443") return "port";
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host.includes(":")) return "ipv6 literal";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return ipBlocked(host) ? "private ip" : null; // WHATWG URL normalises 2130706433 / 0x7f000001
  if (!host.includes(".")) return "single-label host";
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|svc|cluster\.local)$/.test(host)) return "internal host";
  return null;
}

async function resolvesToBlockedIp(host) {
  const resolveDns = globalThis.Deno?.resolveDns;
  if (!resolveDns || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  try {
    const recs = [
      ...(await resolveDns(host, "A").catch(() => [])),
      ...(await resolveDns(host, "AAAA").catch(() => [])),
    ];
    return recs.some((ip) => ipBlocked(String(ip)));
  } catch { return false; }
}

/** Read a response body, giving up (null) once it exceeds maxBytes. */
export async function readCapped(res, maxBytes) {
  const len = Number(res.headers.get("content-length"));
  if (Number.isFinite(len) && len > maxBytes) { res.body?.cancel(); return null; }
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

/**
 * fetch() for untrusted URLs: SSRF-checked on every redirect hop.
 * @returns {Promise<Response | null>} the final response, or null if blocked / failed
 */
export async function safeFetch(url, opts = {}, ms = TIMEOUT_MS) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    if (blockedUrlReason(current)) return null;
    if (await resolvesToBlockedIp(new URL(current).hostname)) return null;
    const res = await fetch(current, {
      ...opts, redirect: "manual",
      headers: { "User-Agent": UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(ms),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      res.body?.cancel();
      current = new URL(res.headers.get("location"), current).href;
      continue;
    }
    return res;
  }
  return null;
}

const MAX_HTML_BYTES = 512 * 1024;
export const MAX_IMAGE_BYTES = 1_500_000;

// ---------------------------------------------------------------- network

// Wikimedia (Wikipedia/Commons/Wikidata) and Openverse rate-limit anonymous
// clients hard (HTTP 429). All their requests go through a small gate: a few in
// flight, spaced out, and a 429 is retried after the server's Retry-After.
function makeGate(maxInFlight, minGapMs) {
  let active = 0, lastStart = 0;
  const queue = [];
  const pump = () => {
    if (active >= maxInFlight || !queue.length) return;
    const wait = Math.max(0, lastStart + minGapMs - Date.now());
    if (wait > 0) { setTimeout(pump, wait); return; }
    active++; lastStart = Date.now();
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; pump(); });
    pump();
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); pump(); });
}
const GATES = [
  { test: /(^|\.)(wikipedia|wikimedia|wikidata)\.org$/, run: makeGate(1, 300) },
  { test: /(^|\.)openverse\.org$/, run: makeGate(1, 400) },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function timeoutFetch(url, opts = {}, ms = TIMEOUT_MS) {
  const doFetch = () => fetch(url, { ...opts, headers: { "User-Agent": UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(ms) });
  let host = "";
  try { host = new URL(url).hostname; } catch { /* not a URL: fetch will throw */ }
  const gate = GATES.find((g) => g.test.test(host));
  if (!gate) return doFetch();
  for (let attempt = 0; ; attempt++) {
    const res = await gate.run(doFetch);
    if (res.status !== 429 || attempt >= 3) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1), 6000));
  }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function commonsFileUrl(file, width) {
  const name = String(file).replace(/^File:/i, "").trim();
  if (!name) return null;
  return `${COMMONS_FILEPATH}${encodeURIComponent(name.replace(/ /g, "_"))}?width=${snapWidth(width)}`;
}

// --- Wikipedia (named landmarks) ---

function sizedWikiThumb(d, maxWidth) {
  const thumb = d.thumbnail?.source;
  if (!thumb) return null;
  const orig = d.originalimage?.width || 0;
  const target = snapWidth(orig ? Math.min(orig, maxWidth) : maxWidth);
  return /\/\d+px-/.test(thumb) ? thumb.replace(/\/\d+px-/, `/${target}px-`) : thumb;
}

// `near` (venues only): the article must be a geotagged place within 1km of the
// venue (or, with no venue coords, a distinctive name with a geotag) - so a bar
// called "Jamaica" never gets the country's flag.
async function wikipediaExact(title, maxWidth, near) {
  try {
    const res = await timeoutFetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(title).replace(/ /g, "_"))}`,
      { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const d = await res.json();
    if (d.type === "disambiguation") return null;
    if (near) {
      const c = d.coordinates;
      if (!c) return null;
      if (Number.isFinite(near.lat) && Number.isFinite(near.lng)) {
        if (haversineKm(near.lat, near.lng, c.lat, c.lon) > 1) return null;
      } else if (!isDistinctiveName(title)) return null;
    }
    return sizedWikiThumb(d, maxWidth);
  } catch { return null; }
}

async function wikipediaSearch(query, maxWidth) {
  try {
    const res = await timeoutFetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`,
      { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const title = (await res.json()).query?.search?.[0]?.title;
    return title ? wikipediaExact(title, maxWidth) : null;
  } catch { return null; }
}

// --- Wikidata image (P18), geofenced ---

async function wikidataItemImage(id, lat, lng, maxKm, width) {
  try {
    const res = await timeoutFetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${id}&props=claims&format=json`,
      { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const claims = (await res.json()).entities?.[id]?.claims || {};
    const file = claims.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!file) return null;
    const coord = claims.P625?.[0]?.mainsnak?.datavalue?.value;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (!coord) return null;
      if (haversineKm(lat, lng, coord.latitude, coord.longitude) > maxKm) return null;
    }
    return commonsFileUrl(file, width);
  } catch { return null; }
}

async function wikidataByName(query, lat, lng, width) {
  try {
    const res = await timeoutFetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=3`,
      { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const ids = ((await res.json()).search || []).slice(0, 3).map((c) => c.id);
    if (!ids.length) return null;
    // One call for all candidates (keeps us well inside Wikimedia's rate limit).
    const er = await timeoutFetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join("|")}&props=claims&format=json`,
      { headers: { accept: "application/json" } });
    if (!er.ok) return null;
    const entities = (await er.json()).entities || {};
    for (const id of ids) {
      const claims = entities[id]?.claims || {};
      const file = claims.P18?.[0]?.mainsnak?.datavalue?.value;
      const coord = claims.P625?.[0]?.mainsnak?.datavalue?.value;
      if (!file || !coord) continue; // require a coordinate to trust a name match
      if (haversineKm(lat, lng, coord.latitude, coord.longitude) <= 0.3) return commonsFileUrl(file, width);
    }
    return null;
  } catch { return null; }
}

// --- OSM Overpass: name (any language) within 160m; also yields website + local name ---

async function osmVenue(name, lat, lng, width) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !name) return null;
  // Allow-list: letters, digits, spaces only (no quotes/regex syntax can reach Overpass QL).
  const namePart = String(name).slice(0, 24).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
  if (!namePart) return null;
  const q = `[out:json][timeout:8];nwr(around:160,${lat},${lng})[~"^name(:en|:ja-Latn|:ja_rm)?$"~"${namePart}",i];out tags center 5;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: "data=" + encodeURIComponent(q),
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const els = (await res.json()).elements || [];
    if (!els.length) return null;
    const t = (els.find((e) => e.tags && (e.tags.image || e.tags.wikimedia_commons || e.tags.wikidata)) || els[0]).tags || {};
    const out = { website: t.website || t["contact:website"] || t.url || "", localName: t.name || "" };
    if (t.image && !blockedUrlReason(t.image) && !/\.(svg)$/i.test(t.image)) return { ...out, photo: { url: t.image, source: "osm", credit: { via: "OpenStreetMap contributor" } } };
    if (t.wikimedia_commons && /^File:/i.test(t.wikimedia_commons)) {
      const url = commonsFileUrl(t.wikimedia_commons, width);
      if (url) return { ...out, photo: { url, source: "wikimedia", credit: { via: "Wikimedia Commons" } } };
    }
    if (t.wikidata) {
      const url = await wikidataItemImage(t.wikidata, lat, lng, 0.5, width);
      if (url) return { ...out, photo: { url, source: "wikidata", credit: { via: "Wikimedia Commons" } } };
    }
    return out;
  } catch { return null; }
}

// --- Official website preview image ---

async function officialSitePhoto(site) {
  if (!isOfficialSite(site) || blockedUrlReason(site)) return null;
  try {
    const res = await safeFetch(site, { headers: { accept: "text/html" } });
    if (!res?.ok || !(res.headers.get("content-type") || "").includes("html")) return null;
    const htmlBytes = await readCapped(res, MAX_HTML_BYTES);
    if (!htmlBytes) return null;
    const html = new TextDecoder().decode(htmlBytes);
    const img = extractOgImage(html, res.url || site);
    if (!img || blockedUrlReason(img)) return null;
    const ir = await safeFetch(img);
    if (!ir?.ok) return null;
    const bytes = await readCapped(ir, MAX_IMAGE_BYTES);
    if (!bytes) return null;
    const dims = imageDims(bytes);
    if (!isHeroShaped(dims, img) || !looksLikePhoto(dims, bytes.byteLength, ir.headers.get("content-type") || "")) return null;
    const host = new URL(res.url || site).hostname.replace(/^www\./, "");
    return { url: img, source: "official", credit: { via: host, link: res.url || site } };
  } catch { return null; }
}

// --- Wikimedia Commons search (real, freely licensed photos) ---

async function commonsSearch(query, names, lat, lng, width) {
  try {
    const url = `${COMMONS_API}?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=10`
      + `&gsrsearch=${encodeURIComponent(query)}`
      + `&prop=imageinfo|coordinates&iiprop=url|size|mime|extmetadata&iiurlwidth=${snapWidth(width)}`
      + `&iiextmetadatafilter=Artist|LicenseShortName`;
    const res = await timeoutFetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const pages = Object.values((await res.json()).query?.pages || {});
    const hasVenue = Number.isFinite(lat) && Number.isFinite(lng);
    const cands = pages.map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime || "") || (ii.width || 0) < MIN_PHOTO_WIDTH) return null;
      if (NOT_A_PHOTO.test(p.title)) return null;
      const meta = ii.extmetadata || {};
      const license = meta.LicenseShortName?.value || "";
      if (!isOpenLicense(license)) return null;
      const c = p.coordinates?.[0];
      const distKm = hasVenue && c ? haversineKm(lat, lng, c.lat, c.lon) : null;
      const named = nameMatches(p.title.replace(/^File:/, ""), names.filter(isDistinctiveName));
      const near = distKm !== null && distKm <= 0.3;
      if (!near && !(named && (distKm === null || distKm <= 3))) return null;
      return {
        url: ii.thumburl || ii.url, near, landscape: ii.width >= ii.height, width: ii.width,
        credit: { creator: stripHtml(meta.Artist?.value), license, via: "Wikimedia Commons", link: ii.descriptionurl },
      };
    }).filter(Boolean);
    cands.sort((a, b) => (b.near - a.near) || (b.landscape - a.landscape) || (b.width - a.width));
    const best = cands[0];
    return best ? { url: best.url, source: "commons", credit: best.credit } : null;
  } catch { return null; }
}

// --- Openverse (Creative Commons search across Flickr and others) ---

async function openverseSearch(query, names) {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&license=by,by-sa,cc0,pdm&page_size=20&mature=false`;
    const res = await timeoutFetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const results = (await res.json()).results || [];
    const cands = results.filter((r) =>
      r.source !== "wikimedia" // covered by commonsSearch, and its originals are huge
      && isOpenLicense(r.license)
      && nameMatches(r.title || "", names.filter(isDistinctiveName))
      && (r.width || 0) >= MIN_PHOTO_WIDTH * 0.9
      && !NOT_A_PHOTO.test(r.title || "")
      // Flickr: only <=1024px renditions (b/c/z) so Storage's size cap isn't hit.
      && (r.source !== "flickr" || /_[bcz]\.jpg$/i.test(r.url || "")));
    cands.sort((a, b) => ((b.width >= b.height) - (a.width >= a.height)) || ((b.width || 0) - (a.width || 0)));
    const best = cands[0];
    if (!best) return null;
    const lic = `CC ${String(best.license).toUpperCase()}${best.license_version ? ` ${best.license_version}` : ""}`.replace("CC CC0", "CC0").replace("CC PDM", "Public domain");
    return { url: best.url, source: "openverse", credit: { creator: stripHtml(best.creator), license: lic, via: best.source === "flickr" ? "Flickr" : best.source, link: best.foreign_landing_url } };
  } catch { return null; }
}

// --- Wikimedia Commons geosearch (areas) ---

async function wikimediaGeo(lat, lng, radiusM, maxWidth) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const url = `${COMMONS_API}?action=query&format=json&generator=geosearch&ggsnamespace=6&ggscoord=${lat}|${lng}`
      + `&ggsradius=${radiusM}&ggslimit=10&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=${snapWidth(maxWidth)}`;
    const res = await timeoutFetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const pages = Object.values((await res.json()).query?.pages || {}); // read the body ONCE
    const hit = pages
      .map((p) => ({ title: p.title, ...(p.imageinfo?.[0] || {}) }))
      .filter((ii) => ii.thumburl && /^image\/(jpeg|webp)$/.test(ii.mime || "") && (ii.width || 0) >= MIN_PHOTO_WIDTH && ii.width >= ii.height && !NOT_A_PHOTO.test(ii.title))
      .sort((a, b) => b.width - a.width)[0];
    return hit?.thumburl || null;
  } catch { return null; }
}

// --- Mapillary street-level (honest location view), always the sharp 1024px rendition ---

async function mapillaryQuery(lat, lng, radiusM, token) {
  const dLat = radiusM / 111320, dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
  const bbox = `${lng - dLon},${lat - dLat},${lng + dLon},${lat + dLat}`;
  const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}&fields=thumb_1024_url&bbox=${bbox}&limit=1`;
  const res = await timeoutFetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  return (await res.json()).data?.[0]?.thumb_1024_url || null;
}

async function mapillaryStreet(lat, lng, token) {
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    return (await mapillaryQuery(lat, lng, 150, token)) || (await mapillaryQuery(lat, lng, 400, token));
  } catch { return null; }
}

/**
 * Geocode a venue to lat/lng via Photon (keyless). `address` (e.g. "Hakodate")
 * disambiguates common names; `bias` is the trip's destination. A match more
 * than `maxKm` from the bias is rejected as the wrong place.
 * @param {string} name
 * @param {{ address?: string, bias?: { lat: number, lng: number }, maxKm?: number }} [options]
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
export async function geocodeVenue(name, { address = "", bias, maxKm } = {}) {
  if (!name) return null;
  const q = address ? `${name}, ${address}` : name;
  try {
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`;
    if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
      url += `&lat=${bias.lat}&lon=${bias.lng}&zoom=10&location_bias_scale=0.3`;
    }
    const res = await timeoutFetch(url, { headers: { accept: "application/json" } }, 7000);
    if (!res.ok) return null;
    const c = (await res.json())?.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) return null;
    const lng = Number(c[0]), lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // With a town in the query the match is anchored, so allow a whole region
    // (Sapporo -> Hakodate is ~250km); a bare name must stay near the bias.
    const limit = maxKm ?? (address ? 400 : 150);
    if (bias && Number.isFinite(bias.lat) && haversineKm(lat, lng, bias.lat, bias.lng) > limit) return null;
    return { lat, lng };
  } catch { return null; }
}

/**
 * All trustworthy photo candidates for a place, best first. The caller stores
 * the first one that downloads cleanly and passes looksLikePhoto().
 * @param {object} place { query, names?, city?, website?, kind?, category?, lat?, lng?, maxWidth? }
 * @param {object} [opts] { mapillaryToken }
 * @returns {Promise<Array<{ url: string, source: string, credit?: { creator?: string, license?: string, via?: string, link?: string } }>>}
 *   source: osm | wikidata | wikimedia | wikipedia | official | commons | openverse | street
 */
export async function resolvePhotoCandidates(place, opts = {}) {
  const { kind = "venue", lat, lng, maxWidth = 960, city = "" } = place;
  if (!place.query) return null;
  const { primary: query, variants } = kind === "venue" ? splitVenueName(place.query) : { primary: place.query, variants: [place.query] };
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const token = opts.mapillaryToken || "";

  if (kind === "area") {
    const [exact, search, geo] = await Promise.all([
      wikipediaExact(query, maxWidth).catch(() => null),
      wikipediaSearch(query, maxWidth).catch(() => null),
      hasCoords ? wikimediaGeo(lat, lng, 1000, maxWidth).catch(() => null) : Promise.resolve(null),
    ]);
    const out = [];
    if (exact) out.push({ url: exact, source: "wikipedia", credit: { via: "Wikipedia" } });
    if (search && search !== exact) out.push({ url: search, source: "wikipedia", credit: { via: "Wikipedia" } });
    if (geo) out.push({ url: geo, source: "wikimedia", credit: { via: "Wikimedia Commons" } });
    if (!out.length && hasCoords) {
      const street = await mapillaryStreet(lat, lng, token);
      if (street) out.push({ url: street, source: "street", credit: { via: "Mapillary" } });
    }
    return out;
  }

  // Phase 1: exact-id sources + the street fallback, all in parallel.
  const [osm, wd, wiki, street] = await Promise.all([
    hasCoords ? osmVenue(query, lat, lng, maxWidth).catch(() => null) : Promise.resolve(null),
    hasCoords ? wikidataByName(query, lat, lng, maxWidth).catch(() => null) : Promise.resolve(null),
    wikipediaExact(query, maxWidth, { lat, lng }).catch(() => null),
    hasCoords ? mapillaryStreet(lat, lng, token).catch(() => null) : Promise.resolve(null),
  ]);

  // Phase 2: verified web photos. Name variants include OSM's local-language name.
  const names = [...new Set([...variants, ...(place.names || []), osm?.localName].filter(Boolean))];
  const site = place.website && isOfficialSite(place.website) ? place.website : osm?.website || "";
  const searchQ = `${query} ${city}`.trim();
  const localQ = osm?.localName && osm.localName !== query ? osm.localName : "";
  const [official, commons, commonsLocal, openverse] = await Promise.all([
    site ? officialSitePhoto(site).catch(() => null) : Promise.resolve(null),
    commonsSearch(searchQ, names, lat, lng, maxWidth).catch(() => null),
    localQ ? commonsSearch(localQ, names, lat, lng, maxWidth).catch(() => null) : Promise.resolve(null),
    openverseSearch(searchQ, names).catch(() => null),
  ]);
  const ordered = [
    osm?.photo,
    wd && { url: wd, source: "wikidata", credit: { via: "Wikimedia Commons" } },
    wiki && { url: wiki, source: "wikipedia", credit: { via: "Wikipedia" } },
    official, commons, commonsLocal, openverse,
    street && { url: street, source: "street", credit: { via: "Mapillary" } },
  ].filter(Boolean);
  const seen = new Set();
  return ordered.filter((c) => !seen.has(c.url) && seen.add(c.url));
}

/**
 * Best single candidate (first of resolvePhotoCandidates), or null.
 * @param {object} place
 * @param {object} [opts]
 * @returns {Promise<{ url: string, source: string, credit?: object } | null>}
 */
export async function resolvePhoto(place, opts = {}) {
  return (await resolvePhotoCandidates(place, opts))[0] || null;
}
