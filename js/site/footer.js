// The site footer as markup: columns of link groups, a hairline, then the logo, the copyright, the
// legal links and the language switch. Pure: a state in, a string out. js/site/footer-mount.js puts
// it in the document and answers its buttons. The look is in css/components/site.css.
//
// Strings: footer.group.<group> is a column heading, footer.link.<link> a link, footer.copyright the
// notice (with {year}); all in js/lib/i18n/<language>.js.
import { languageSwitchHtml } from './language-switch.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const PLANE = '<svg class="nav-logo-plane" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>';
const WORDMARK = 'TRIPPY';
const flapCell = (ch) => `<span class="flap-cell"><span class="flap-face">${ch}</span><span class="flap-top"><span class="flap-top-text">${ch}</span></span><span class="flap-bottom"><span class="flap-bottom-text">${ch}</span></span></span>`;

/** A link is { key, href } or { key, action }: an action is a button js/site/footer-mount.js answers. */
const LINKS = Object.freeze({
  newTrip: { href: '#/wizard' },
  importTrip: { action: 'import-trip' },
  trips: { href: '#/' },
  atlas: { href: '#/atlas' },
  settings: { href: '#/settings' },
  signOut: { action: 'sign-out' },
  signIn: { action: 'sign-in' },
  about: { href: '#/about' },
  privacy: { href: '#/privacy' },
  terms: { href: '#/terms' },
  credits: { action: 'credits' },
});

/**
 * The columns for a visitor. Someone signed out is shown no link they cannot use: no Plan column,
 * no Settings, and Sign in where Sign out would be.
 * @param {{ signedIn?: boolean, atlas?: boolean }} [state]
 *   signedIn  a session is confirmed or stored on this device
 *   atlas     the Atlas page exists for this visitor (the atlas view, not in square layout)
 * @returns {Array<{ key: string, links: string[] }>}
 */
export function footerGroups({ signedIn = false, atlas = false } = {}) {
  const trippy = { key: 'trippy', links: ['about', 'privacy', 'terms', 'credits'] };
  if (!signedIn) return [{ key: 'account', links: ['signIn'] }, trippy];
  return [
    { key: 'plan', links: ['newTrip', 'importTrip', 'trips', ...(atlas ? ['atlas'] : [])] },
    { key: 'account', links: ['settings', 'signOut'] },
    trippy,
  ];
}

/** The links of the bottom row, in order. */
export const LEGAL_LINKS = Object.freeze(['privacy', 'terms', 'credits']);

function linkHtml(key, t, { path, where }) {
  const link = LINKS[key];
  if (!link) return '';
  const label = esc(t(`footer.link.${key}`));
  if (link.action) return `<button type="button" class="site-foot-link" data-foot-action="${link.action}" data-foot-link="${where}-${key}">${label}</button>`;
  const current = link.href.slice(1) === path ? ' aria-current="page"' : '';
  return `<a class="site-foot-link" href="${link.href}" data-foot-link="${where}-${key}"${current}>${label}</a>`;
}

/**
 * @param {Object} state
 * @param {boolean} [state.signedIn]
 * @param {boolean} [state.atlas]
 * @param {number} state.year      the year of the copyright notice
 * @param {string} [state.path]    the open route ('/about'), for aria-current
 * @param {string} state.language  the language on screen
 * @param {(key: string, vars?: object) => string} state.t
 * @returns {string} the inside of the <footer>
 */
export function footerHtml({ signedIn = false, atlas = false, year, path = '', language, t }) {
  const groups = footerGroups({ signedIn, atlas }).map((group) => `<div class="site-foot-group">
        <h2 class="site-foot-heading" id="site-foot-${group.key}">${esc(t(`footer.group.${group.key}`))}</h2>
        <ul class="site-foot-list" aria-labelledby="site-foot-${group.key}">${group.links.map((key) => `<li>${linkHtml(key, t, { path, where: 'group' })}</li>`).join('')}</ul>
      </div>`).join('\n      ');
  const legal = LEGAL_LINKS.map((key) => `<li>${linkHtml(key, t, { path, where: 'legal' })}</li>`).join('');
  return `<div class="site-foot-inner">
    <nav class="site-foot-groups" aria-label="${esc(t('footer.label'))}">
      ${groups}
    </nav>
    <div class="site-foot-bottom">
      <a class="site-foot-logo" href="#/" aria-label="${esc(t('footer.home'))}">${PLANE}<span class="nav-logo-flaps" aria-hidden="true">${WORDMARK.split('').map(flapCell).join('')}</span></a>
      <p class="site-foot-copy">${esc(t('footer.copyright', { year }))}</p>
      <ul class="site-foot-legal" aria-label="${esc(t('footer.legal'))}">${legal}</ul>
      <div class="site-foot-language">${languageSwitchHtml({ current: language, where: 'footer', t })}</div>
    </div>
  </div>`;
}
