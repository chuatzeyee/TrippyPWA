// One description of a plan's cover for cards and heroes (blueprint 2.1 and 8.5): which image,
// at which widths, cropped where, credited to whom. Pure: no DOM, no network, no storage.
//
// Which image a plan shows is decided by heroCover() in trip-cover.js, for a full trip and for a
// dashboard row alike. This module adds what a photo frame needs on top: the widths to offer, the
// address to fall back to, a short credit for the chip, and addresses that are safe to print.
import { heroCover, coverCreditText } from './trip-cover.js';
import { safeUrl } from './trip-extras.js';

/** Wikimedia's standard thumbnail widths; other widths may be refused. */
const CARD_WIDTHS = [500, 960, 1280];
const HERO_WIDTHS = [1280];
const SIZED = /\/\d+px-/;
const DEFAULT_FOCUS = 50;
const COMMONS_CHIP = 'Wikimedia Commons';
const WIKIPEDIA_CHIP = 'Wikipedia';
const FALLBACK_CHIP = 'Photo credit';
// Copy rule: no dash, middle dot, bullet, ellipsis or arrow in visible text (written as escapes).
const BANNED_GLYPHS = /\s*[\u2013\u2014\u00b7\u2022\u2026\u2027\u2192\u2219]\s*/g;

const none = () => ({ kind: 'none', src: '', srcset: '', fallbackSrc: '', focusY: DEFAULT_FOCUS, credit: null });
const tidy = (value) => String(value ?? '').replace(BANNED_GLYPHS, ', ').replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '');
const atWidth = (url, width) => url.replace(SIZED, `/${width}px-`);

function firstDestination(trip) {
  const ws = trip?.wizard_state;
  return ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}
const isOn = (host, domain) => host === domain || host.endsWith(`.${domain}`);

/**
 * The page of the file behind a Wikimedia image address, thumbnail or full size. A file kept on
 * Commons links to Commons; a file kept on one Wikipedia links to that Wikipedia.
 * @param {string} url
 * @returns {string} '' when the address is not a Wikimedia upload
 */
export function commonsFilePage(url) {
  const safe = safeUrl(url);
  if (!safe || hostOf(safe) !== 'upload.wikimedia.org') return '';
  const [root, project, ...rest] = new URL(safe).pathname.split('/').filter(Boolean);
  // .../thumb/3/3c/<file>/250px-<file>, or .../3/3c/<file>
  const isThumb = rest[0] === 'thumb';
  const file = (isThumb ? rest.length === 5 && rest[3] : rest.length === 3 && rest[2]) || '';
  if (root !== 'wikipedia' || !file || !/^[a-z][a-z-]{1,11}$/.test(project || '')) return '';
  return `https://${project === 'commons' ? 'commons.wikimedia.org' : `${project}.wikipedia.org`}/wiki/File:${file}`;
}

/**
 * The short source for the credit chip: "Pexels", "Wikimedia Commons". One line on a 150 px tile.
 * @param {{ via?: string, link?: string, creator?: string, license?: string }|null} credit
 * @returns {string} '' when there is no credit
 */
export function coverChipText(credit) {
  if (!credit || typeof credit !== 'object') return '';
  const via = tidy(credit.via);
  if (via) return via;
  const host = hostOf(safeUrl(credit.link));
  if (isOn(host, 'wikimedia.org')) return COMMONS_CHIP;
  if (isOn(host, 'wikipedia.org')) return WIKIPEDIA_CHIP;
  if (isOn(host, 'pexels.com')) return 'Pexels';
  return tidy(credit.creator) || tidy(credit.license) ? FALLBACK_CHIP : '';
}

// A cover the server picked: one or two stored copies, the picked crop and the stored credit.
function pickedCover(record, hero) {
  const large = safeUrl(record.large.url);
  const small = hero.srcset ? safeUrl(record.small.url) : '';
  return {
    kind: 'v2',
    src: small || large,
    srcset: small ? `${small} ${record.small.w}w, ${large} ${record.large.w}w` : '',
    fallbackSrc: '',
    focusY: hero.focusY,
    credit: hero.credit ? { chip: coverChipText(record.credit), full: hero.credit.text, link: hero.credit.link } : null,
  };
}

// Any other image. A Wikimedia thumbnail is asked for at wider sizes, which can be refused, so the
// original goes along as the fallback; it has no stored credit and is credited to its file page.
function legacyCover(original, widths) {
  const sized = SIZED.test(original);
  const src = sized ? atWidth(original, widths[0]) : original;
  const srcset = sized && widths.length > 1 ? widths.map((width) => `${atWidth(original, width)} ${width}w`).join(', ') : '';
  const page = commonsFilePage(original);
  const chip = page.startsWith('https://commons.wikimedia.org/') ? COMMONS_CHIP : WIKIPEDIA_CHIP;
  return {
    kind: 'legacy',
    src,
    srcset,
    fallbackSrc: sized && (srcset !== '' || src !== original) ? original : '',
    focusY: DEFAULT_FOCUS,
    credit: page ? { chip, full: coverCreditText({ via: chip }), link: page } : null,
  };
}

function describe(trip, widths) {
  // An address that is not plain http(s) counts as no cover at all.
  const image = safeUrl(trip?.cover_image) ? trip.cover_image : '';
  const hero = heroCover({ ...trip, cover_image: image });
  if (!hero) return none();
  if (hero.v2) return pickedCover(trip.extras.cover, hero);
  const original = safeUrl(image || firstDestination(trip)?.image);
  return original ? legacyCover(original, widths) : none();
}

/**
 * The cover of a dashboard row. The row carries the picked cover as the list select's JSON paths
 * (cover_small, cover_large, cover_focus, cover_credit, cover_none) next to cover_image and the
 * destination parts of wizard_state.
 * @param {object} row
 * @returns {import('../views/contract.js').CoverModel}
 */
export function listCover(row) {
  const picked = row?.cover_large || row?.cover_none === true
    ? { v: 2, large: row.cover_large, small: row.cover_small, focusY: row.cover_focus, credit: row.cover_credit, none: row.cover_none === true }
    : null;
  return describe({ id: row?.id, cover_image: row?.cover_image, wizard_state: row?.wizard_state, extras: { cover: picked } }, CARD_WIDTHS);
}

/**
 * The cover of a full trip, for its hero.
 * @param {object} trip   a trips row with wizard_state and extras
 * @returns {import('../views/contract.js').CoverModel}
 */
export function heroCoverModel(trip) {
  return describe(trip, HERO_WIDTHS);
}
