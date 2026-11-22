// Puts the footer (js/site/footer.js) into <footer id="site-footer"> and answers its buttons. The
// footer is outside #app, so it is on every page, signed in or not, and no route draws it. main.js
// calls renderFooter() at the start and whenever the user, the route, the view or the language changes.
import { getLanguage, languageReady, onLanguageChange, t } from '../lib/i18n.js';
import { getUser, hasLocalSession } from '../lib/supabase.js';
import { isSquareMode } from '../lib/square-mode.js';
import { activeViewId } from '../views/registry.js';
import { reloadCurrentRoute } from '../router.js';
import { footerHtml } from './footer.js';
import { bindLanguageSwitches, restoreLanguageSwitchFocus } from './language-switch.js';

export const FOOTER_ID = 'site-footer';

let drawn = '';
let bound = false;

const openPath = () => (location.hash.slice(1) || '/').split('?')[0];

function footerState() {
  const signedIn = Boolean(getUser()) || hasLocalSession();
  return {
    signedIn,
    atlas: signedIn && activeViewId() === 'atlas' && !isSquareMode(),
    year: new Date().getFullYear(),
    path: openPath(),
    language: getLanguage(),
    t,
  };
}

const ACTIONS = {
  async credits(button) {
    const key = button.getAttribute('data-foot-link');
    const { openCreditsDialog } = await import('./credits-dialog.js');
    openCreditsDialog({ opener: button, findOpener: () => document.querySelector(`#${FOOTER_ID} [data-foot-link="${key}"]`) });
  },
  async 'import-trip'(button) {
    const { showImportModal } = await import('../components/trip-import-modal.js');
    showImportModal({ returnFocus: button, onChange: () => reloadCurrentRoute() });
  },
  async 'sign-in'() {
    const { showAuthGate } = await import('../auth/auth-ui.js');
    showAuthGate();
  },
  async 'sign-out'() {
    const { signOut } = await import('../auth/auth.js');
    await signOut();
  },
};

function onClick(event) {
  const button = event.target instanceof Element ? event.target.closest('[data-foot-action]') : null;
  const run = button ? ACTIONS[button.getAttribute('data-foot-action')] : null;
  if (run) run(button); // a chunk that will not load reaches the handler in main.js, which reloads once
}

/** Draws the footer for the visitor and the page as they are now. A no-op while nothing changed. */
export function renderFooter() {
  const footer = document.getElementById(FOOTER_ID);
  if (!footer) return;
  if (!bound) {
    bound = true;
    footer.addEventListener('click', onClick);
    bindLanguageSwitches();
    onLanguageChange(() => { renderFooter(); restoreLanguageSwitchFocus('footer'); });
    window.addEventListener('hashchange', renderFooter);
    languageReady().then(renderFooter); // a first draw made before the strings arrived
  }
  const html = footerHtml(footerState());
  if (html === drawn) return;
  const active = document.activeElement;
  const focused = active instanceof Element && footer.contains(active) ? active.getAttribute('data-foot-link') : null;
  drawn = html;
  footer.innerHTML = html;
  if (focused) footer.querySelector(`[data-foot-link="${focused}"]`)?.focus({ preventScroll: true });
}
