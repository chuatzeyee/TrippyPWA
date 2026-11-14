// Trip cover photo ("hero") helpers for the trip page and the dashboard.
//
// The server's cover picker (supabase/functions/_shared/cover-rank.mjs) stores
// trips.cover_image = a large copy (up to 2400px) and trips.extras.cover =
// { v: 2, large: {url, w, h}, small: {url, w, h} | null, focusY, credit, ... },
// or { v: 2, none: true } when nothing good enough exists. Older trips have a
// v1 automatic pick (`.../trip-photos/<tripId>/cover.jpg`, 1280px at best) or
// only the wizard's 250px destination thumbnail.

import { safeUrl } from './trip-extras.js';

/** sizes for the trip page hero: the page is 80% wide from 1024px. */
export const HERO_SIZES = '(min-width:1024px) 80vw, 100vw';

const LEGACY_WIDTH = 1280;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * The old resolver's automatic cover for this trip. Mirrors isAutoCoverV1 in
 * supabase/functions/_shared/cover-rank.mjs; keep the two in sync.
 * @param {string} url
 * @param {string} tripId
 */
export function isAutoCoverV1(url, tripId) {
  return Boolean(url) && Boolean(tripId) && String(url).includes(`/trip-photos/${tripId}/cover.`);
}

/**
 * cover_image is one of the picker's v2 copies (`.../trip-photos/<tripId>/cover-v2-...`)
 * but extras.cover does not describe it: the record was lost (Regenerate
 * Itinerary replaces the whole of extras). Mirrors isOrphanCoverV2 in
 * cover-rank.mjs.
 * @param {{ id?: string, cover_image?: string, extras?: object }} trip
 */
export function isOrphanCoverV2(trip) {
  const url = trip?.cover_image || '';
  const id = trip?.id;
  return Boolean(url) && Boolean(id) && String(url).includes(`/trip-photos/${id}/cover-v2-`)
    && trip?.extras?.cover?.large?.url !== url;
}

const validSized = (s) => Boolean(s && typeof s.url === 'string' && safeUrl(s.url) && isNum(s.w) && s.w > 0 && isNum(s.h) && s.h > 0);

/** extras.cover when it is a v2 pick that still matches cover_image, else null. */
function v2Cover(trip) {
  const cover = trip?.extras?.cover;
  if (!cover || Number(cover.v) < 2 || cover.none || !validSized(cover.large)) return null;
  return cover.large.url === trip?.cover_image ? cover : null;
}

/**
 * Whether the owner's app should ask the server for a (better) cover: no v2
 * record yet and the cover is empty or the old automatic pick, or a v2 copy
 * whose record was lost. A cover the user chose is never touched. (The server
 * also retries a 30-day-old "none"; the app does not.)
 * @param {{ id?: string, cover_image?: string, extras?: object }} trip
 */
export function coverNeedsPick(trip) {
  if (isOrphanCoverV2(trip)) return true;
  const cover = trip?.extras?.cover;
  if (cover && Number(cover.v) >= 2) return false;
  const url = trip?.cover_image || '';
  return !url || isAutoCoverV1(url, trip?.id);
}

// Copy rule: no em/en dashes, middle dots or bullets in visible text.
const plain = (s) => String(s ?? '').replace(/\s*[\u2013\u2014\u00b7\u2022\u2027\u2219]\s*/g, ', ')
  .replace(/\s+/g, ' ').replace(/(,\s*){2,}/g, ', ').replace(/^[,\s]+|[,\s]+$/g, '');

/**
 * "Photo: hujason, Pexels" or "Photo: Christopher Crouzet, CC BY-SA 4.0,
 * Wikimedia Commons". Pexels covers leave the licence out.
 * @param {{ creator?: string, license?: string, via?: string }} credit
 */
export function coverCreditText(credit) {
  if (!credit || typeof credit !== 'object') return '';
  const pexels = /^pexels$/i.test(String(credit.via || '').trim());
  const parts = (pexels ? [credit.creator, credit.via] : [credit.creator, credit.license, credit.via])
    .map(plain).filter(Boolean);
  return parts.length ? `Photo: ${parts.join(', ')}` : '';
}

function defaultFocusY(sized) {
  return sized && sized.w / sized.h >= 2.2 ? 50 : 38;
}

const focusOf = (value, large) => (isNum(value) ? Math.min(100, Math.max(0, value)) : defaultFocusY(large));

/**
 * What the trip page hero shows, or null for the plain (flag and title) header.
 * @param {object} trip trips row with wizard_state and extras
 * @returns {{ src: string, srcset: string, sizes: string, focusY: number,
 *   credit: { text: string, link: string } | null, v2: boolean } | null}
 */
export function heroCover(trip) {
  const v2 = v2Cover(trip);
  if (v2) {
    const { large } = v2;
    const small = validSized(v2.small) && v2.small.w < large.w ? v2.small : null;
    const text = coverCreditText(v2.credit);
    return {
      src: small ? small.url : large.url,
      srcset: small ? `${small.url} ${small.w}w, ${large.url} ${large.w}w` : '',
      sizes: HERO_SIZES,
      focusY: focusOf(v2.focusY, large),
      credit: text ? { text, link: safeUrl(v2.credit?.link) } : null,
      v2: true,
    };
  }
  const cover = trip?.extras?.cover;
  const url = trip?.cover_image || '';
  // The picker found nothing good: no 250px destination thumbnail either.
  if (!url && cover && Number(cover.v) >= 2 && cover.none) return null;
  const ws = trip?.wizard_state;
  const raw = url || (ws?.multiCity ? ws?.destinations?.[0]?.image : ws?.destination?.image) || '';
  if (!raw) return null;
  // Destination images are 250px Wikipedia thumbnails; ask for a larger render.
  return { src: raw.replace(/\/\d+px-/, `/${LEGACY_WIDTH}px-`), srcset: '', sizes: '', focusY: 50, credit: null, v2: false };
}

/**
 * Dashboard rows: the v2 copies to offer as a srcset and the crop height, when
 * the row's cover is a v2 pick (selected as the cover_small / cover_large /
 * cover_focus JSON paths).
 * @param {{ cover_image?: string, cover_small?: object, cover_large?: object, cover_focus?: number }} row
 * @returns {{ small: { url: string, w: number }, large: { url: string, w: number }, focusY: number } | null}
 */
export function listCoverCopies(row) {
  const large = row?.cover_large;
  const small = row?.cover_small;
  if (!validSized(large) || large.url !== row?.cover_image || !validSized(small) || small.w >= large.w) return null;
  return {
    small: { url: small.url, w: small.w },
    large: { url: large.url, w: large.w },
    focusY: focusOf(row?.cover_focus, large),
  };
}
