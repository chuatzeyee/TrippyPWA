// The photo frame (blueprint 8.5, presentation rules of previews/research/audit-photos.json): a box
// that exists before its image, the designed placeholder behind every photo, one credit chip with the
// short source (the full credit where the frame has room). Ratios and looks are CSS; a skin sets the hero ratio. Owner: F5.
import { attr, cls, esc, flagChip, safeHref, safeSrc } from './html.js';
import { icon } from './icons.js';

/** Ratio name to the width and height hints of the image. 'free' leaves the ratio to the skin. */
const RATIOS = { '16x9': [1280, 720], '3x2': [960, 640], '4x5': [640, 800], '1x1': [250, 250], free: [1280, 720] };
const DEFAULT_SIZES = { '16x9': '(min-width: 1024px) 560px, 100vw', '3x2': '(min-width: 1024px) 480px, 100vw', '4x5': '(min-width: 640px) 240px, 45vw', free: '100vw' };

const isRemote = (url) => /^https?:/i.test(url);
const clampFocus = (value) => (Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 50);
const toneOf = (tone) => (Number.isInteger(tone) && tone >= 1 && tone <= 7 ? tone : 0);

/** The srcset when every candidate is a safe address, else ''. */
function safeSrcset(srcset) {
  if (typeof srcset !== 'string' || !srcset.trim()) return '';
  const parts = srcset.split(/,\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.every((part) => safeSrc(part.split(/\s+/)[0])) ? parts.join(', ') : '';
}

/** A CoverModel from whatever the caller holds: a cover, a bare photo address, or nothing. */
function normalise(cover) {
  const from = typeof cover === 'string' ? { kind: 'photo', src: cover } : (cover ?? {});
  const src = from.kind === 'none' ? '' : safeSrc(from.src);
  return {
    kind: src ? (from.kind || 'photo') : 'none',
    src,
    srcset: src ? safeSrcset(from.srcset) : '',
    fallbackSrc: src ? safeSrc(from.fallbackSrc) : '',
    focusY: clampFocus(from.focusY),
    credit: src && from.credit ? from.credit : null,
  };
}

/**
 * The longest full credit a chip may show: one line of small text about 170 px wide, which is the
 * room the skins keep beside a title at the foot of a photo ("Photo: Barnabas Davoti, Pexels" is 30).
 */
const FULL_CREDIT_MAX = 32;
/** A full credit this short also has its line on a phone hero, beside a countdown (about 150 px of text). */
const FULL_CREDIT_SHORT = 26;

/**
 * The credit chip: the short source, linking to the source page (a span when the link is unsafe).
 * When the full credit is short enough for one line ("Photo: Nextvoyage, Pexels") the chip carries
 * it in data-full, and common.css shows it in place of the short source in a frame with room for it
 * (320 px and wider), as the classic hero does. A longer licence line stays in the credits list.
 * data-full-size="s" marks a full credit short enough for a chip a view hangs on a phone hero itself.
 * @param {{ chip: string, full: string, link: string }|null} credit
 */
export function creditChipHtml(credit) {
  const chip = String(credit?.chip ?? '').trim();
  if (!chip) return '';
  const full = String(credit?.full ?? '').replace(/\s+/g, ' ').trim();
  const roomy = full && full !== chip && full.length <= FULL_CREDIT_MAX ? `${attr('data-full', full)}${full.length <= FULL_CREDIT_SHORT ? ' data-full-size="s"' : ''}` : '';
  const words = `<span class="ui-credit-short">${esc(chip)}</span>`;
  const href = safeHref(credit.link);
  if (!href) return `<span class="ui-credit"${roomy}>${words}</span>`;
  return `<a class="ui-credit" href="${esc(href)}" target="_blank" rel="noopener noreferrer"${attr('aria-label', `Photo source: ${chip}`)}${attr('data-focus-key', `credit-${href}`)}${roomy}>${words}</a>`;
}

/**
 * The fade of one image, tied to the image and not to the page root: an image that has loaded is
 * shown at once (also one that a re-created root left marked as loading), one that is still loading is
 * hidden until it arrives. The image carries its own listeners, so it is shown wherever it has been
 * moved to by then (a view switch, carryOver, a patch) and whichever root is listening.
 * @param {HTMLImageElement} img
 */
export function settleFade(img) {
  const show = () => {
    img.classList.remove('is-loading');
    img.removeEventListener('load', show);
    img.removeEventListener('error', failed);
  };
  // An error with a fallback address is followed by a new load (complete is false again): keep waiting.
  const failed = () => { if (img.complete) show(); };
  if (img.complete) { img.classList.remove('is-loading'); return; }
  img.classList.add('is-loading');
  img.addEventListener('load', show);
  img.addEventListener('error', failed);
}

function placeholderHtml({ name, flag, iconSize }) {
  const label = name ? `<span class="ui-frame-name">${esc(name)}</span>${flagChip(flag)}` : icon('image', iconSize);
  return `<span class="ui-frame-none" aria-hidden="true">${label}</span>`;
}

function frameHtml(cover, opts, defaults) {
  const {
    ratio = defaults.ratio, eager = false, priority = false, animate = false, sizes, alt = '', name = '', flag = '', tone,
    carry, scrim = false, over = '', credit = true, creditAt, cls: extra, tag = 'div',
  } = opts ?? {};
  const photo = normalise(cover);
  const shape = Object.hasOwn(RATIOS, ratio) ? ratio : defaults.ratio;
  // Only a size the builder itself checked (thumbHtml) replaces the hints of the ratio: a caller's
  // `size` never reaches the width and height attributes.
  const [width, height] = defaults.size ? [defaults.size, defaults.size] : RATIOS[shape];
  const day = toneOf(tone);
  const style = `--focus-y:${photo.focusY}%${day ? `;--tone:var(--day-${day})` : ''}`;
  const chip = credit && photo.credit ? creditChipHtml(photo.credit) : '';
  const classes = cls('ui-frame', `ui-frame--${shape}`, { 'ui-frame--scrim': scrim, 'ui-frame--credited': chip, 'ui-frame--credit-top': chip && creditAt === 'top' }, defaults.cls, extra);
  const carried = carry ? `${attr('data-carry', carry)}${attr('data-carry-id', photo.src || 'none')}` : '';
  const el = tag === 'span' ? 'span' : 'div';
  let img = '';
  if (photo.src) {
    const loading = eager || priority ? '' : ' loading="lazy"';
    const set = photo.srcset ? `${attr('srcset', photo.srcset)}${attr('sizes', sizes || DEFAULT_SIZES[shape] || '100vw')}` : '';
    img = `<img class="ui-frame-img" src="${esc(photo.src)}"${set}${attr('data-fallback', photo.fallbackSrc || null)}${attr('alt', alt)}${attr('title', photo.credit?.full || null)} width="${width}" height="${height}"${loading} decoding="async"${priority ? ' fetchpriority="high"' : ''}${isRemote(photo.src) ? ' referrerpolicy="no-referrer"' : ''}${attr('data-carry-key', photo.src)}${animate ? ' data-fade' : ''}>`;
  }
  const overlay = over ? `<${el} class="ui-frame-over">${over}</${el}>` : '';
  return `<${el} class="${classes}" data-frame="${esc(photo.kind)}" style="${style}"${carried}>${placeholderHtml({ name, flag, iconSize: defaults.iconSize })}${img}${overlay}${chip}</${el}>`;
}

/**
 * A cover: 16:9 unless `ratio` says otherwise. The image carries data-carry-key (its first address), so
 * patchRegions() keeps a loaded photo across a patch even after it fell back to its original URL.
 * @param {import('../contract.js').CoverModel|string|null} cover
 * @param {{ ratio?: '16x9'|'3x2'|'4x5'|'1x1'|'free', eager?: boolean, priority?: boolean, animate?: boolean, sizes?: string,
 *           alt?: string, name?: string, flag?: string, tone?: number, carry?: string, scrim?: boolean, over?: string,
 *           credit?: boolean, creditAt?: 'top'|'bottom', cls?: any }} [opts]
 *   creditAt  'top' puts the credit chip in the top right corner (class ui-frame--credit-top on the
 *             frame); bottom right by default. mountPhotoFrames() removes the chip either way when the
 *             image fails.
 *   priority  the lead cover or the first hero: eager with fetchpriority="high"
 *   animate   true on a first render only (ViewCtx.animate): the image fades in once mountPhotoFrames runs
 *   name, flag, tone  what the placeholder shows: the destination, its flag, the day colour 1 to 7
 *   carry     the data-carry key, for carryOver(); the frame is then carried only while its photo is the same
 *   over      trusted markup laid over the photo (a title, chips); scrim adds the one gradient under it
 */
export function coverFrameHtml(cover, opts) {
  return frameHtml(cover, opts, { ratio: '16x9', iconSize: 28 });
}

/** A short hop tile or an area tile: the same frame at 4:5. Takes a CoverModel or a bare photo address. */
export function tileFrameHtml(cover, opts) {
  return frameHtml(cover, opts, { ratio: '4x5', iconSize: 28 });
}

/**
 * A square thumbnail of a venue photo. Always sends no referrer; the placeholder stands in at the same
 * size when there is no photo or it fails.
 * @param {{ src: string, alt: string }|null} photo
 * @param {{ size?: number, animate?: boolean, eager?: boolean, tone?: number, cls?: any }} [opts] size in px, 96 by default
 */
export function thumbHtml(photo, { size = 96, ...opts } = {}) {
  const px = Number.isFinite(size) && size >= 16 && size <= 512 ? Math.round(size) : 96;
  return frameHtml(photo ? { kind: 'photo', src: photo.src } : null, { ...opts, alt: photo?.alt ?? '', tag: 'span', credit: false }, { ratio: '1x1', cls: 'ui-thumb', iconSize: 20, size: px });
}

/**
 * Behaviour for every frame inside `root`: a refused wider render falls back to the original URL, an
 * image that fails for good is removed so the placeholder shows, and an image marked data-fade fades
 * in when it loads. Image events do not bubble, so this listens in the capture phase.
 * @param {Element} root
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {() => void} cleanup
 */
export function mountPhotoFrames(root, { signal } = {}) {
  const control = new AbortController();
  const stop = () => control.abort();
  signal?.addEventListener('abort', stop, { once: true });
  const frameImage = (event) => (event.target instanceof HTMLImageElement && event.target.classList.contains('ui-frame-img') ? event.target : null);
  // Also an image that arrives marked as loading without data-fade (carried from a root that is gone).
  root.querySelectorAll('img.ui-frame-img[data-fade], img.ui-frame-img.is-loading').forEach(settleFade);
  root.addEventListener('load', (event) => frameImage(event)?.classList.remove('is-loading'), { capture: true, signal: control.signal });
  root.addEventListener('error', (event) => {
    const img = frameImage(event);
    if (!img) return;
    const fallback = img.dataset.fallback;
    if (fallback && img.getAttribute('src') !== fallback) {
      delete img.dataset.fallback;
      img.removeAttribute('srcset');
      img.src = fallback;
      return;
    }
    // The classic dashboard listener handles data-fallback too, and runs first: when it has already
    // started the fallback load, this image is not broken yet.
    if (!img.complete || img.naturalWidth > 0) return;
    const frame = img.closest('.ui-frame');
    if (frame) {
      frame.dataset.frame = 'none';
      frame.classList.remove('ui-frame--credited', 'ui-frame--credit-top');
      frame.querySelector(':scope > .ui-credit')?.remove();
    }
    img.remove();
  }, { capture: true, signal: control.signal });
  return stop;
}
