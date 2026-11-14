// Small text and geo primitives shared by the venue/area photo resolver
// (photo-resolver.mjs) and the trip cover picker (cover-rank.mjs). Plain JS,
// no runtime APIs, so it runs in Deno (edge functions) and Node (vitest).

/** Lower-case, accent-folded, punctuation-free text for name matching. */
export function normalizeName(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Hiragana, katakana, CJK ideographs and Hangul. */
export const CJK = /[぀-ヿ㐀-鿿가-힯]/;

// Licences usable in an app with affiliate links: no NC (non-commercial), no ND.
export function isOpenLicense(license) {
  const l = String(license ?? "").toLowerCase().replace(/^cc[\s-]+/, "").trim();
  if (!l) return false;
  if (/\bnc\b|\bnd\b|-nc|-nd/.test(l)) return false;
  return /^(cc0|pdm|public domain|by(-sa)?)(\s|$|\d)/.test(l) || l === "cc0" || l === "pdm";
}

/** Great-circle distance in km. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** File titles that are graphics rather than photographs. */
export const NOT_A_PHOTO = /\b(map|logo|diagram|plan|coat[_ ]of[_ ]arms|flag|icon|seal|emblem|chart|graph)\b/i;
