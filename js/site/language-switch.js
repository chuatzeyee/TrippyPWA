// The language switch: a native select that shows the language on screen under its own name. Drawn
// in the footer and at the top of each site page; both use this markup and this one listener.
import { LANGUAGES, getLanguage, isLanguage, setLanguage } from '../lib/i18n.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const GLOBE = '<svg class="lang-switch-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9S9.4 5.8 12 3z"/></svg>';
const CHEVRON = '<svg class="lang-switch-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>';

/**
 * @param {{ current?: string, where: string, t: (key: string) => string }} opts
 *   where names the switch ('footer', 'page'): it is its id, and how the focus finds it again after
 *   the choice has redrawn the part of the page it sits in
 * @returns {string}
 */
export function languageSwitchHtml({ current = getLanguage(), where, t }) {
  const options = LANGUAGES.map((language) => `<option value="${esc(language.code)}" lang="${esc(language.tag)}"${language.code === current ? ' selected' : ''}>${esc(language.name)}</option>`).join('');
  return `<label class="lang-switch">${GLOBE}<span class="site-vh">${esc(t('language.label'))}</span><select class="lang-switch-select" id="lang-switch-${esc(where)}" data-language-switch="${esc(where)}">${options}</select>${CHEVRON}</label>`;
}

let refocus = null;
let bound = false;

/** One listener on the document for every switch, bound once. */
export function bindLanguageSwitches() {
  if (bound || typeof document === 'undefined') return;
  bound = true;
  document.addEventListener('change', (event) => {
    const select = event.target instanceof Element ? event.target.closest('[data-language-switch]') : null;
    if (!select || !isLanguage(select.value)) return;
    refocus = select.getAttribute('data-language-switch');
    setLanguage(select.value);
  });
}

/**
 * After a part of the page that holds a switch is drawn again: when the choice was made on that
 * switch, the focus goes back to it.
 * @param {string} where
 */
export function restoreLanguageSwitchFocus(where) {
  if (refocus !== where) return;
  refocus = null;
  document.getElementById(`lang-switch-${where}`)?.focus({ preventScroll: true });
}
