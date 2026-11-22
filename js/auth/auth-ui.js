// The sign-in gate, and what the app bar shows on its right: a Sign in button, or the avatar with the
// account menu (blueprint 4.3). The menu is the shared menu component's markup (ruling R3), so it
// opens in the top layer, as a sheet on phones. Owner: F8.
import { getCurrentUser, signInWithGoogle, signOut, onAuthChange } from './auth.js';
import { reloadCurrentRoute } from '../router.js';
import { getSquareOverride, setSquareOverride } from '../lib/square-mode.js';
import { getPrefs, setPref } from '../data/prefs-store.js';
import { getProfileSummary } from '../data/profile-cache.js';
import { esc, attr, safeSrc } from '../views/shared/html.js';
import { mountMenus, nextMenuIndex } from '../views/shared/menu.js';
import { signInConsentHtml } from './signin-consent.js';

export function showAuthGate() {
  const existing = document.querySelector('.modal-backdrop[data-auth-gate]');
  if (existing) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.dataset.authGate = '';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Sign in to continue</span>
      <button type="button" class="modal-close" data-dismiss aria-label="Close">&times;</button>
    </div>
    <div class="modal-body" style="text-align: center; padding: var(--sp-6) var(--sp-4);">
      <div style="font-size: 2.5rem; margin-bottom: var(--sp-3);">&#9992;&#65039;</div>
      <p style="color: var(--ink-secondary); margin-bottom: var(--sp-6); font-size: 0.9rem;">
        Sign in to plan trips, save itineraries, and track your adventures.
      </p>
      <button class="btn btn--primary btn--lg btn--pill w-full" id="gate-signin" style="gap: 8px; justify-content: center;">
        <svg viewBox="0 0 48 48" width="18" height="18"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 019.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 000 24c0 3.77.9 7.34 2.44 10.5l8.09-5.91z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Sign in with Google
      </button>
      ${signInConsentHtml()}
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);

  const dismiss = () => {
    // Mirror the entry animation on the way out, then remove. A timeout
    // backstop guarantees removal if animationend never fires (reduced motion).
    backdrop.classList.add('modal-backdrop--closing');
    modal.classList.add('modal--closing');
    const remove = () => { clearTimeout(timer); backdrop.remove(); modal.remove(); };
    const timer = setTimeout(remove, 250);
    modal.addEventListener('animationend', remove, { once: true });
  };

  backdrop.addEventListener('click', dismiss);
  modal.querySelector('[data-dismiss]').addEventListener('click', dismiss);
  // A link to the Terms of use or the Privacy policy opens that page: the gate must not stay over it.
  for (const link of modal.querySelectorAll('[data-signin-consent] a')) link.addEventListener('click', dismiss);
  modal.querySelector('#gate-signin').addEventListener('click', async () => {
    const { error } = await signInWithGoogle();
    if (!error) dismiss();
  });
}

// --- The account menu: pure -------------------------------------------------------------------------

/** The id of the menu panel; the trigger names it in data-menu-open and aria-controls. */
export const ACCOUNT_MENU_ID = 'auth-menu';

// The same choices, with the same words, as Settings (blueprint 6.1).
const THEME_OPTIONS = [['dark', 'Dark'], ['light', 'Light'], ['system', 'Match device']];
const SQUARE_OPTIONS = [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']];
const ADMIN_ITEM = '<li role="none" data-account-item="admin"><a class="auth-menu-item" role="menuitem" href="#/admin">Admin</a></li>';

const textOf = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * "Home is Singapore, prices in SGD", from the profile summary (js/data/profile-cache.js). Says only
 * what is known, and names no home for someone who has none.
 * @param {{ home_city?: string|null, home_country?: string|null, home_currency?: string|null, is_nomad?: boolean }|null} summary
 * @returns {string} '' when there is nothing to say
 */
export function accountContextLine(summary) {
  if (!summary || typeof summary !== 'object') return '';
  const home = summary.is_nomad ? '' : textOf(summary.home_city) || textOf(summary.home_country);
  const currency = textOf(summary.home_currency);
  if (home && currency) return `Home is ${home}, prices in ${currency}`;
  if (home) return `Home is ${home}`;
  return currency ? `Prices in ${currency}` : '';
}

function whoHtml({ name, contextLine }) {
  const context = textOf(contextLine);
  return `<div class="auth-menu-who"><span class="auth-menu-name">${esc(name)}</span>${context ? `<span class="auth-menu-context">${esc(context)}</span>` : ''}</div>`;
}

// A labelled group of menuitemradio buttons: plain buttons or native radios inside role="menu" are
// skipped by a screen reader in menu mode. The value is in data-value, never in data-theme, which
// would switch the colour tokens inside the button (css/tokens.css).
function radioGroupHtml(kind, label, options, current) {
  const checked = options.some(([value]) => value === current) ? current : options.find(([value]) => value === 'system' || value === 'auto')[0];
  const radios = options.map(([value, text]) => (
    `<button type="button" class="auth-menu-radio" role="menuitemradio" aria-checked="${value === checked}" data-account-radio="${kind}" data-value="${value}">${esc(text)}</button>`
  )).join('');
  return `<li class="auth-menu-group" role="group"${attr('aria-label', label)}><span class="auth-menu-group-label" aria-hidden="true">${esc(label)}</span><span class="auth-menu-options">${radios}</span></li>`;
}

/**
 * The account menu panel, in the markup mountMenus() drives.
 * @param {{ name?: string, contextLine?: string|null, theme?: string, square?: string, isAdmin?: boolean }} [opts]
 *   name         shown above the items
 *   contextLine  accountContextLine(); left out when empty
 *   theme        the stored pref: 'dark' | 'light' | 'system' (anything else reads as 'system')
 *   square       the stored override: 'auto' | 'on' | 'off' (anything else reads as 'auto')
 *   isAdmin      only `true` draws the Admin link
 * @returns {string} Settings, Theme, Square layout, Admin for admins, Sign out
 */
export function accountMenuHtml({ name = '', contextLine = '', theme = 'system', square = 'auto', isAdmin = false } = {}) {
  return `<dialog class="ui-menu auth-menu" id="${ACCOUNT_MENU_ID}" data-menu aria-label="Account">
      ${whoHtml({ name, contextLine })}
      <ul class="auth-menu-list" role="menu" aria-label="Account">
        <li role="none"><a class="auth-menu-item" role="menuitem" href="#/settings">Settings</a></li>
        ${radioGroupHtml('theme', 'Theme', THEME_OPTIONS, theme)}
        ${radioGroupHtml('square', 'Square layout', SQUARE_OPTIONS, square)}
        ${isAdmin === true ? ADMIN_ITEM : ''}
        <li class="auth-menu-sep" role="separator"></li>
        <li role="none"><button type="button" class="auth-menu-item" role="menuitem" data-account-action="sign-out">Sign out</button></li>
      </ul>
    </dialog>`;
}

/**
 * The avatar button that opens the account menu.
 * @param {{ name?: string, avatarUrl?: string|null }} [opts] an address that is not http(s) gives the initial
 * @returns {string}
 */
export function accountButtonHtml({ name = '', avatarUrl = '' } = {}) {
  const src = safeSrc(avatarUrl);
  const face = src
    ? `<img class="auth-avatar" src="${esc(src)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="auth-avatar auth-avatar--initials" aria-hidden="true">${esc(textOf(name).charAt(0).toUpperCase())}</span>`;
  return `<button type="button" class="auth-user-toggle" id="auth-user-toggle" data-menu-open="${ACCOUNT_MENU_ID}" aria-haspopup="menu" aria-expanded="false" aria-controls="${ACCOUNT_MENU_ID}" aria-label="Account menu">${face}</button>`;
}

// --- The account menu: DOM --------------------------------------------------------------------------

let mounted = null; // { container, userKey, onUserChange, control } of the button on screen
let authSubscribed = false;
let adminKnown = null; // the user id isAdmin() answered true for
let adminCheck = null; // { userId, promise } of the check in flight

const userKeyOf = (user) => (user ? [user.id, user.email ?? '', user.user_metadata?.full_name ?? '', user.user_metadata?.avatar_url ?? ''].join('|') : '');

function whoOf(user) {
  const summary = getProfileSummary();
  return {
    name: textOf(summary?.display_name) || user.user_metadata?.full_name || user.email || '',
    avatarUrl: user.user_metadata?.avatar_url || '',
    contextLine: accountContextLine(summary),
  };
}

/** Closes an open menu and drops every listener of the button on screen. */
export function unmountAuthButton() {
  mounted?.control.abort();
  mounted = null;
}

/**
 * Draws the Sign in button, or for a confirmed user the avatar and its menu, into `container`.
 * Later auth events redraw only when the user is another one (or left): a token refresh leaves the
 * avatar alone.
 * @param {Element} container
 * @param {{ onUserChange?: () => void }} [opts] called instead of the redraw, for a caller whose own
 *   markup depends on who is signed in (the app bar)
 */
export function renderAuthButton(container, { onUserChange } = {}) {
  if (!container) return;
  unmountAuthButton();
  const user = getCurrentUser();
  const control = new AbortController();
  mounted = { container, userKey: userKeyOf(user), onUserChange, control };
  if (user) drawAccount(container, user, control.signal);
  else drawSignIn(container, control.signal);
  if (authSubscribed) return;
  authSubscribed = true;
  onAuthChange(() => {
    const now = mounted;
    if (!now || !now.container.isConnected || userKeyOf(getCurrentUser()) === now.userKey) return;
    if (now.onUserChange) now.onUserChange();
    else renderAuthButton(now.container);
  });
}

function drawSignIn(container, signal) {
  container.innerHTML = `
    <button type="button" class="auth-btn" id="auth-sign-in">
      <svg class="auth-google-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Sign in
    </button>
  `;
  // The gate, not Google straight away: the gate carries the line about the Terms of use and the
  // Privacy policy (js/auth/signin-consent.js), which this small button has no room for.
  container.querySelector('#auth-sign-in').addEventListener('click', () => showAuthGate(), { signal });
}

function drawAccount(container, user, signal) {
  const who = whoOf(user);
  container.innerHTML = `<div class="auth-user" id="auth-user">
      ${accountButtonHtml(who)}
      ${accountMenuHtml({ ...who, theme: getPrefs().theme, square: getSquareOverride(), isAdmin: adminKnown === user.id })}
    </div>`;
  // Opening, placing, Escape, a tap outside and the return of focus are the shared component's.
  mountMenus(container, { signal });
  const trigger = container.querySelector('[data-menu-open]');
  const dialog = container.querySelector('dialog[data-menu]');
  // On the trigger itself, so it runs before the delegated handler opens the menu: theme, square
  // layout and the profile can all have changed elsewhere (Settings, another device) since the draw.
  const refresh = () => refreshMenu(container, user);
  trigger.addEventListener('click', refresh, { signal });
  trigger.addEventListener('keydown', refresh, { signal });
  dialog.addEventListener('keydown', onMenuKeydown, { signal });
  container.addEventListener('click', (event) => onAccountClick(event, container), { signal });
  if (adminKnown !== user.id) checkAdmin(user.id, container);
}

function syncChecks(container) {
  const current = { theme: getPrefs().theme, square: getSquareOverride() };
  for (const radio of container.querySelectorAll('[data-account-radio]')) {
    radio.setAttribute('aria-checked', String(radio.getAttribute('data-value') === current[radio.getAttribute('data-account-radio')]));
  }
}

function refreshMenu(container, user) {
  const head = container.querySelector('.auth-menu-who');
  if (head) head.outerHTML = whoHtml(whoOf(user));
  syncChecks(container);
}

// The Admin link arrives once the role is known. Only a yes is remembered: a check that failed for
// lack of a connection is asked again at the next draw.
function checkAdmin(userId, container) {
  if (adminCheck?.userId !== userId) {
    const promise = import('../data/admin-repository.js').then((mod) => mod.isAdmin()).then((yes) => yes === true, () => false);
    adminCheck = { userId, promise };
    promise.then((yes) => {
      if (yes) adminKnown = userId;
      if (adminCheck?.promise === promise) adminCheck = null;
    });
  }
  adminCheck.promise.then((yes) => {
    if (!yes || mounted?.container !== container || !container.isConnected) return;
    const list = container.querySelector('[role="menu"]');
    if (!list || list.querySelector('[data-account-item="admin"]')) return;
    list.querySelector('[role="separator"]')?.insertAdjacentHTML('beforebegin', ADMIN_ITEM);
  });
}

// Arrow keys per the menu pattern, over every item. The shared component moves among role="menuitem"
// only, so this handler, which sits closer to the item, also takes the radios in and stops the key
// there. Left and Right move inside a group. Escape, Tab and letters go on to the shared component.
function onMenuKeydown(event) {
  const dialog = event.currentTarget;
  const active = document.activeElement;
  const move = (to) => {
    event.preventDefault();
    event.stopPropagation();
    to?.focus({ preventScroll: true });
  };
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const radios = [...(active?.closest?.('[role="group"]')?.querySelectorAll('[role="menuitemradio"]') ?? [])];
    const at = radios.indexOf(active);
    if (at >= 0) move(radios[(at + (event.key === 'ArrowRight' ? 1 : radios.length - 1)) % radios.length]);
    return;
  }
  const items = [...dialog.querySelectorAll('[role^="menuitem"]')].filter((el) => !el.disabled && el.getClientRects().length > 0);
  const next = nextMenuIndex(event.key, items.indexOf(active), items.length);
  if (next !== null) move(items[next]);
}

function closeMenu(container) {
  const dialog = container.querySelector('dialog[data-menu]');
  const trigger = container.querySelector('[data-menu-open]');
  if (dialog?.open) dialog.close();
  trigger?.setAttribute('aria-expanded', 'false');
  trigger?.focus({ preventScroll: true });
}

function onAccountClick(event, container) {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('[data-account-action="sign-out"]')) {
    signOut();
    return;
  }
  const radio = target?.closest('[data-account-radio]');
  if (!radio || !container.contains(radio)) return;
  const value = radio.getAttribute('data-value');
  if (radio.getAttribute('data-account-radio') === 'theme') {
    // The store applies the theme at once and keeps it, on the device and in the account. The menu
    // stays open, so the change is seen where it was made.
    setPref('theme', value);
    syncChecks(container);
    return;
  }
  // Square layout rebuilds the page, and on a flip the bar too: close first, with the focus on the
  // avatar, which main.js finds again by its id after the redraw.
  closeMenu(container);
  setSquareOverride(value);
  // The override may change without flipping the effective mode (auto to on, on a square screen),
  // and then nobody else rebuilds the open page.
  reloadCurrentRoute();
  if (container.isConnected) syncChecks(container);
}
