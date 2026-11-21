// Applies the theme pref to the document (blueprint 5.3): html[data-theme], the theme-color meta, and
// for 'system' the OS setting, followed live. The `trippy-theme` key that the boot script in index.html
// reads is written by js/data/prefs-store.js, not here. Owner: F1.

/** Dispatched on window, with detail { theme: 'dark'|'light' }, when the theme on screen changes. */
export const THEME_EVENT = 'trippy:theme';

const THEMES = ['dark', 'light', 'system'];
/** The browser chrome colour for each theme (the values nav.js used). */
const THEME_COLORS = { light: '#F5F1EA', dark: '#1B1A17' };
const OS_LIGHT_QUERY = '(prefers-color-scheme: light)';
const ATTRIBUTE = 'data-theme';

let themePref = 'system';
let watchingOs = false;

const root = () => (typeof document !== 'undefined' ? document.documentElement ?? null : null);

function osMedia() {
  try {
    return typeof window !== 'undefined' ? window.matchMedia?.(OS_LIGHT_QUERY) ?? null : null;
  } catch {
    return null;
  }
}

/** @returns {'dark'|'light'} the theme on screen */
export function effectiveTheme() {
  return root()?.getAttribute(ATTRIBUTE) === 'light' ? 'light' : 'dark';
}

function show(theme) {
  const html = root();
  if (!html) return theme;
  const before = effectiveTheme();
  html.setAttribute(ATTRIBUTE, theme);
  document.querySelector?.('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  if (before !== theme && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme } }));
  }
  return theme;
}

/** One listener for the life of the page: an OS change is shown only while the pref is 'system'. */
function watchOs() {
  if (watchingOs) return;
  const media = osMedia();
  if (!media) return;
  const onChange = () => {
    if (themePref === 'system') show(osMedia()?.matches ? 'light' : 'dark');
  };
  if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange);
  else if (typeof media.addListener === 'function') media.addListener(onChange);
  else return;
  watchingOs = true;
}

/**
 * Sets html[data-theme] and the theme-color meta, follows the OS for 'system', dispatches trippy:theme.
 * @param {'dark'|'light'|'system'} theme anything else reads as 'system'
 * @returns {'dark'|'light'} the theme now on screen
 */
export function applyTheme(theme) {
  themePref = THEMES.includes(theme) ? theme : 'system';
  watchOs();
  return show(themePref === 'system' ? (osMedia()?.matches ? 'light' : 'dark') : themePref);
}
