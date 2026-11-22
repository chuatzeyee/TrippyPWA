// Photo credits, in one dialog (opened from "Photo credits" in the footer). The views and the trip
// page still build their credits where they always did: the dashboards' `credits` region and the trip
// foot (js/views/shared/credits.js), kept in the page because they are patched as photos arrive, and
// no longer displayed there (their stylesheets hide them). On open, the dialog reads them from the
// page being viewed: every photo credit with its link, and the map credits that apply to that page.
import { t as translate } from '../lib/i18n.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const outside = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;

export const CREDITS_DIALOG_ID = 'site-credits';
const SOURCES = Object.freeze({
  commons: outside('https://commons.wikimedia.org', 'Wikimedia Commons'),
  openverse: outside('https://openverse.org', 'Openverse'),
  pexels: outside('https://www.pexels.com', 'Pexels'),
});
const OSM = outside('https://www.openstreetmap.org/copyright', 'OpenStreetMap');

/**
 * @typedef {Object} PageCredits
 * @property {Array<{ text: string, href: string }>} photos   each photo on the page, in full
 * @property {boolean} sources        the page shows photos, so the providers are named
 * @property {boolean} naturalEarth   the page draws the world outline
 * @property {boolean} osm            the page shows an OpenStreetMap map
 */

/**
 * What the page being viewed credits. Reads only what the app itself put in the page.
 * @param {ParentNode|null} root the #app element
 * @returns {PageCredits}
 */
export function collectPageCredits(root) {
  if (!root) return { photos: [], sources: false, naturalEarth: false, osm: false };
  const seen = new Set();
  const photos = [...root.querySelectorAll('.ui-credits-list li')].flatMap((item) => {
    const link = item.querySelector('a[href]');
    const text = (item.textContent ?? '').replace(/\s+/g, ' ').trim();
    const href = link?.getAttribute('href') ?? '';
    const id = `${text}|${href}`;
    if (!text || seen.has(id)) return [];
    seen.add(id);
    return [{ text, href: /^https?:\/\//i.test(href) ? href : '' }];
  });
  const lines = [...root.querySelectorAll('.ui-foot-line')].map((line) => line.textContent ?? '').join(' ');
  return {
    photos,
    sources: photos.length > 0 || Boolean(root.querySelector('.tv-foot, .td-footer-credit')),
    naturalEarth: lines.includes('Natural Earth') || Boolean(root.querySelector('svg.wm-plate')),
    // The trip foot names OpenStreetMap while a map is drawn; a classic trip page shows the map itself.
    // (Settings prints the same line in its About section, for no map on the page: not counted.)
    osm: Boolean(root.querySelector('.tv-foot [data-focus-key="source-osm"], .leaflet-container')),
  };
}

/**
 * The inside of the dialog.
 * @param {PageCredits} credits
 * @param {(key: string, vars?: object) => string} [t]
 * @returns {string}
 */
export function creditsDialogHtml(credits, t = translate) {
  const { photos = [], sources = false, naturalEarth = false, osm = false } = credits ?? {};
  // A translated sentence is escaped whole, then its {places} are filled with our own links.
  const sentence = (key, places) => esc(t(key)).replace(/\{(\w+)\}/g, (whole, name) => places[name] ?? whole);
  const rows = photos.map((photo) => `<li class="site-dialog-photo">${photo.href ? outside(photo.href, photo.text) : esc(photo.text)}</li>`).join('');
  const maps = [naturalEarth ? `<li>${esc(t('credits.naturalEarth'))}</li>` : '', osm ? `<li>${sentence('credits.osm', { osm: OSM })}</li>` : ''].join('');
  const nothing = !rows && !sources && !maps;
  return `<div class="site-dialog-head">
      <h2 class="site-dialog-title" id="${CREDITS_DIALOG_ID}-title">${esc(t('credits.title'))}</h2>
      <button type="button" class="site-dialog-close" data-credits-close aria-label="${esc(t('credits.close'))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div class="site-dialog-body">
      ${nothing ? `<p class="site-dialog-empty">${esc(t('credits.none'))}</p>` : ''}
      ${rows ? `<section class="site-dialog-part" aria-labelledby="${CREDITS_DIALOG_ID}-photos"><h3 class="site-dialog-subtitle" id="${CREDITS_DIALOG_ID}-photos">${esc(t('credits.photos'))}</h3><ul class="site-dialog-list">${rows}</ul></section>` : ''}
      ${sources ? `<p class="site-dialog-line">${sentence('credits.sources', SOURCES)}</p>` : ''}
      ${maps ? `<section class="site-dialog-part" aria-labelledby="${CREDITS_DIALOG_ID}-maps"><h3 class="site-dialog-subtitle" id="${CREDITS_DIALOG_ID}-maps">${esc(t('credits.maps'))}</h3><ul class="site-dialog-list">${maps}</ul></section>` : ''}
    </div>`;
}

/**
 * Opens the dialog with the credits of the page on screen. A native <dialog> shown with showModal:
 * the browser keeps the focus inside, closes it on Escape and gives the focus back; `opener` is
 * focused again for a browser that does not, or when the opener was drawn again meanwhile.
 * @param {{ opener?: Element|null, findOpener?: () => Element|null }} [opts]
 */
export function openCreditsDialog({ opener = document.activeElement, findOpener = null } = {}) {
  document.getElementById(CREDITS_DIALOG_ID)?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = CREDITS_DIALOG_ID;
  dialog.className = 'site-dialog';
  dialog.setAttribute('aria-labelledby', `${CREDITS_DIALOG_ID}-title`);
  dialog.innerHTML = creditsDialogHtml(collectPageCredits(document.getElementById('app')));
  dialog.addEventListener('click', (event) => {
    // A press on the backdrop lands on the dialog element itself; one inside lands on a child.
    if (event.target === dialog || (event.target instanceof Element && event.target.closest('[data-credits-close]'))) dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    const back = opener?.isConnected ? opener : findOpener?.();
    back?.focus?.({ preventScroll: true });
  });
  document.body.appendChild(dialog);
  dialog.showModal();
  return dialog;
}
