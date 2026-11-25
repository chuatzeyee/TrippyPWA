// The app bar (blueprint 4.3): a split-flap wordmark that flips to a city and back, labelled links,
// and on the right either the avatar (its menu holds theme, square layout, admin and sign out) or, when no avatar menu is drawn, the
// bare theme button and square toggle. The avatar and its menu are drawn by js/auth/auth-ui.js.
// Owner: F8.
import { navigate, reloadCurrentRoute } from '../router.js';
import { getSquareOverride, cycleSquareOverride, isSquareMode } from '../lib/square-mode.js';
import { escapeHtml } from '../data/day-builder.js';
import { getUser, hasLocalSession } from '../lib/supabase.js';
import { setPref } from '../data/prefs-store.js';
import { effectiveTheme, THEME_EVENT } from '../lib/theme.js';
import { activeViewId } from '../views/registry.js';
import { prefersReducedMotion } from '../lib/motion.js';

const SQUARE_LABELS = {
  auto: 'Square layout: auto (tap to force on)',
  on: 'Square layout: on (tap to force off)',
  off: 'Square layout: off (tap to reset to auto)',
};
const THEME_LABELS = { dark: 'Switch to light theme', light: 'Switch to dark theme' };
const HOME_TEXT = 'TRIPPY';
// The wordmark flips to one of these and back, like a departures board. Nine letters at most, so the
// widest still fits beside the Trips and Atlas switch on a phone.
const FLAP_CITIES = ['SINGAPORE', 'JAKARTA', 'HELSINKI', 'STOCKHOLM', 'OSLO', 'SEOUL', 'TOKYO', 'MELBOURNE', 'BANGKOK'];
const FLAP_INTERVAL_MS = 4000;
let flapTimer = null;
const LINKS = [
  { label: 'Trips', href: '#/', path: '/' },
  { label: 'Atlas', href: '#/atlas', path: '/atlas' },
];

// --- Pure -------------------------------------------------------------------------------------------

function flapCell(ch) {
  const d = escapeHtml(ch);
  return `<span class="flap-cell"><span class="flap-face">${d}</span><span class="flap-top"><span class="flap-top-text">${d}</span></span><span class="flap-bottom"><span class="flap-bottom-text">${d}</span></span></span>`;
}

/** Flips the cells of `container` from `oldText` to `newText`, one cell after another. */
function flipTo(container, oldText, newText) {
  const width = Math.max(oldText.length, newText.length);
  const oldPad = oldText.padEnd(width);
  container.style.setProperty('--flap-len', String(newText.length)); // phones scale the cells by it
  container.innerHTML = '';
  for (let i = 0; i < newText.length; i += 1) {
    const oldD = oldPad[i] === ' ' ? '&nbsp;' : escapeHtml(oldPad[i]);
    const newD = escapeHtml(newText[i]);
    const cell = document.createElement('span');
    cell.className = 'flap-cell';
    cell.innerHTML = `<span class="flap-face">${oldD}</span><span class="flap-top"><span class="flap-top-text">${oldD}</span></span><span class="flap-bottom"><span class="flap-bottom-text">${newD}</span></span>`;
    container.appendChild(cell);
    setTimeout(() => {
      const top = cell.querySelector('.flap-top');
      const bottom = cell.querySelector('.flap-bottom');
      top.classList.add('flap-flip-out');
      setTimeout(() => {
        cell.querySelector('.flap-face').innerHTML = newD;
        top.querySelector('.flap-top-text').innerHTML = newD;
        top.classList.remove('flap-flip-out');
        bottom.classList.add('flap-flip-in');
        setTimeout(() => bottom.classList.remove('flap-flip-in'), 200);
      }, 150);
    }, i * 40);
  }
}

/** Starts the wordmark's flips between TRIPPY and a city. One timer at most; none with reduced motion. */
function startLogoFlaps(container) {
  clearInterval(flapTimer);
  flapTimer = null;
  if (!container || prefersReducedMotion()) return;
  let current = HOME_TEXT;
  let next = 0;
  flapTimer = setInterval(() => {
    if (!container.isConnected) { clearInterval(flapTimer); return; }
    if (document.hidden) return;
    const target = current === HOME_TEXT ? FLAP_CITIES[next++ % FLAP_CITIES.length] : HOME_TEXT;
    flipTo(container, current, target);
    current = target;
  }, FLAP_INTERVAL_MS);
}

/**
 * The route of a hash or a path, without the '#' and the query. A hash that is not a route (empty,
 * or the sign-in callback, under which the app draws the dashboard) is home. Anything but text is
 * no route.
 */
function routeOf(path) {
  if (typeof path !== 'string') return null;
  const route = path.replace(/^#/, '').split('?')[0];
  return route.startsWith('/') ? route : '/';
}

/**
 * The labelled links after the wordmark.
 * @param {{ viewId?: string, path?: string, signedIn?: boolean, square?: boolean }} [state]
 *   viewId    the active view (js/views/registry.js activeViewId)
 *   path      the open route, as location.hash or as a path, with or without a query
 *   signedIn  a session is confirmed or stored on this device
 *   square    square layout is on
 * @returns {string} Trips always. Atlas only for the atlas view of someone signed in, and never in
 *   square layout, where #/atlas goes home. aria-current="page" on the link of the open route.
 */
export function navLinksHtml({ viewId, path, signedIn, square } = {}) {
  const route = routeOf(path);
  const atlas = viewId === 'atlas' && signedIn === true && !square;
  return LINKS.filter((link) => link.path !== '/atlas' || atlas)
    .map((link) => `<a class="nav-link" href="${link.href}"${link.path === route ? ' aria-current="page"' : ''}>${escapeHtml(link.label)}</a>`)
    .join('');
}

function squareToggleHtml(override) {
  const state = Object.prototype.hasOwnProperty.call(SQUARE_LABELS, override) ? override : 'auto';
  const label = escapeHtml(SQUARE_LABELS[state]);
  return `<button type="button" class="nav-square-toggle" id="square-toggle" data-square-state="${state}" aria-label="${label}" title="${label}">
        <svg class="nav-square-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="3"></rect><line x1="9.5" y1="4" x2="9.5" y2="20"></line></svg>
        <span class="nav-square-dot" aria-hidden="true"></span>
      </button>`;
}

function themeToggleHtml(theme) {
  return `<button type="button" class="nav-theme-toggle" id="theme-toggle" aria-label="${THEME_LABELS[theme === 'light' ? 'light' : 'dark']}">
        <svg class="nav-theme-icon nav-theme-icon--sun" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
        <svg class="nav-theme-icon nav-theme-icon--moon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>
      </button>`;
}

/**
 * The controls on the right of the bar, ending with the slot auth-ui.js draws into.
 * @param {{ account?: boolean, pending?: boolean, square?: boolean, squareOverride?: string, theme?: string }} [state]
 *   account         an avatar menu is drawn (a confirmed user): theme and admin live in the menu, and
 *                   the square toggle stays in the bar only while square layout is on
 *   pending         the stored session is still being restored: only what both outcomes share is
 *                   drawn, so no control appears and goes again on a signed-in start
 *   square          square layout is on
 *   squareOverride  'auto' | 'on' | 'off', the stored choice
 *   theme           'dark' | 'light', the theme on screen
 * @returns {string} Without an avatar menu (signed out, a shared link, an unconfirmed session) the
 *   square toggle and the theme button are both in the bar.
 */
export function navActionsHtml({ account = false, pending = false, square = false, squareOverride = 'auto', theme = 'dark' } = {}) {
  const bare = !account && !pending;
  return `${bare || square ? squareToggleHtml(squareOverride) : ''}
      ${bare ? themeToggleHtml(theme) : ''}
      <div id="auth-slot"></div>`;
}

// --- DOM --------------------------------------------------------------------------------------------

let authUi = null; // js/auth/auth-ui.js once it has loaded
let authUiLoading = null;
let firstRender = true;
let drawnLinks = '';

function loadAuthUi() {
  if (!authUiLoading) {
    authUiLoading = import('../auth/auth-ui.js').then((mod) => { authUi = mod; return mod; });
    authUiLoading.catch(() => { authUiLoading = null; }); // the next render asks again
  }
  return authUiLoading;
}

function linkState() {
  return { viewId: activeViewId(), path: location.hash, signedIn: Boolean(getUser()) || hasLocalSession(), square: isSquareMode() };
}

/**
 * Replaces only the links (a view change, a route change), so the avatar does not blink.
 * A no-op while the links on screen are already right.
 */
export function updateNavLinks() {
  const box = document.getElementById('nav-links');
  if (!box) return;
  const html = navLinksHtml(linkState());
  if (html === drawnLinks) return;
  const active = document.activeElement;
  const focusedHref = active instanceof Element && box.contains(active) ? active.getAttribute('href') : null;
  drawnLinks = html;
  box.innerHTML = html;
  if (focusedHref) [...box.querySelectorAll('a')].find((a) => a.getAttribute('href') === focusedHref)?.focus({ preventScroll: true });
}

function syncThemeToggle() {
  document.getElementById('theme-toggle')?.setAttribute('aria-label', THEME_LABELS[effectiveTheme()]);
}

function onNavClick(event) {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('[data-nav="home"]')) {
    navigate('/');
    return;
  }
  if (event.target.closest('#theme-toggle')) {
    // The store applies it (html[data-theme], the theme-color meta) and keeps it (blueprint 5.3).
    setPref('theme', effectiveTheme() === 'light' ? 'dark' : 'light');
    syncThemeToggle();
    return;
  }
  if (event.target.closest('#square-toggle')) {
    const next = cycleSquareOverride();
    // A flip of the effective mode has already redrawn the bar (main.js), so look the toggle up again.
    const toggle = document.getElementById('square-toggle');
    if (toggle) {
      toggle.dataset.squareState = next;
      toggle.setAttribute('aria-label', SQUARE_LABELS[next]);
      toggle.setAttribute('title', SQUARE_LABELS[next]);
    } else if (!document.activeElement || document.activeElement === document.body) {
      // Signed in and square layout now off: the toggle left the bar, its setting is in the avatar menu.
      document.getElementById('auth-user-toggle')?.focus({ preventScroll: true });
    }
    // The override may change the stored value without flipping the effective mode (auto to on, on
    // a screen that is already square), and then nobody else rebuilds the open page.
    reloadCurrentRoute();
  }
}

// #app-nav itself persists across renders, so its delegated handler and the two window listeners
// are bound once.
function bindOnce(nav) {
  if (nav.dataset.bound) return;
  nav.dataset.bound = '1';
  nav.addEventListener('click', onNavClick);
  window.addEventListener('hashchange', updateNavLinks);
  window.addEventListener(THEME_EVENT, syncThemeToggle);
}

function drawAuthSlot() {
  const slot = document.getElementById('auth-slot');
  if (!slot) return;
  const draw = (mod) => mod.renderAuthButton(slot, { onUserChange: renderNav });
  if (authUi) {
    draw(authUi);
    return;
  }
  // No catch here, as before: a chunk that will not load after a release reaches the handler in
  // main.js, which reloads the page once.
  loadAuthUi().then((mod) => { if (slot.isConnected) draw(mod); });
}

/** Draws the whole bar. Runs at the start, on every change of user and on a square-mode flip. */
export function renderNav() {
  const nav = document.getElementById('app-nav');
  if (!nav) return;
  const account = Boolean(getUser());
  // The first render comes before the session is restored. main.js renders again once it is, or
  // once the wait is over, and that render shows the bare controls if nobody is confirmed.
  const pending = firstRender && !account && hasLocalSession();
  firstRender = false;
  authUi?.unmountAuthButton(); // an open menu closes before its markup goes
  drawnLinks = navLinksHtml(linkState());
  // app-nav--bare: the bare controls and Sign in are in the bar, which a narrow screen has to fit.
  nav.className = account || pending ? 'app-nav' : 'app-nav app-nav--bare';
  nav.setAttribute('aria-label', 'Main');
  nav.innerHTML = `
    <a class="nav-logo" href="#/" data-nav="home" aria-label="Trippy home">
      <svg class="nav-logo-plane" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
      <span class="nav-logo-flaps" aria-hidden="true">${HOME_TEXT.split('').map(flapCell).join('')}</span>
    </a>
    <div class="nav-links" id="nav-links">${drawnLinks}</div>
    <div class="nav-actions">
      ${navActionsHtml({ account, pending, square: isSquareMode(), squareOverride: getSquareOverride(), theme: effectiveTheme() })}
    </div>
  `;
  bindOnce(nav);
  startLogoFlaps(nav.querySelector('.nav-logo-flaps'));
  if (pending) loadAuthUi(); // on its way, so the next render draws the avatar in the same frame
  else drawAuthSlot();
}
