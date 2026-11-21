// The view registry (blueprint 3.1, 5.5): view ids, the default, on-demand loading with a cache, what
// happens when a view cannot load, and the one way the active view changes. Owner: F1.
//
// Every loader is a literal import('./<id>/view.js'): that is what makes the bundler emit one chunk and
// one stylesheet per view (js/views/fixtures/checks/view-css-build.mjs builds through VIEW_IDS and
// loadView and checks it). The frozen stub view sits behind import.meta.env.DEV and is not in a
// production build.
import { DEFAULT_PREFS, VIEW_IDS as PREF_VIEW_IDS } from '../lib/prefs.js';
import { getPrefs, setPref } from '../data/prefs-store.js';

export const VIEW_IDS = PREF_VIEW_IDS;
export const DEFAULT_VIEW = DEFAULT_PREFS.view;

/** Names and sentences for the picker (blueprint 6.8). */
export const VIEW_META = {
  departures: { id: 'departures', name: 'Departures', sentence: 'Your own departures board. Precise and data-forward.' },
  concierge: { id: 'concierge', name: 'Concierge', sentence: 'A morning briefing. Calm and editorial.' },
  atlas: { id: 'atlas', name: 'Atlas', sentence: 'A map and a logbook.' },
};

// The frozen stub view is offered on the dev server and in the test run only.
const DEV_LOADERS = import.meta.env.DEV ? { stub: () => import('./fixtures/stub-view/view.js') } : {};
const LOADERS = {
  departures: () => import('./departures/view.js'),
  concierge: () => import('./concierge/view.js'),
  atlas: () => import('./atlas/view.js'),
  ...DEV_LOADERS,
};

/**
 * Dev server only: localStorage key that makes activeViewId() answer with a dev view ('stub'). It is
 * not a pref: it never reaches the account, and a production build never reads it.
 */
export const DEV_VIEW_KEY = 'trippy-dev-view';
/** The session mark main.js uses for its one self-healing reload after a failed chunk import. */
const RELOAD_FLAG = 'chunk-reload';
/** What this file writes into it, so that it clears only a mark of its own. */
const RELOAD_MARK = 'view';

const own = (object, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(object, key);
const browserStore = (name) => () => {
  try {
    return typeof globalThis[name] !== 'undefined' ? globalThis[name] : null;
  } catch {
    return null;
  }
};
const readKey = (store, key) => { try { return store()?.getItem(key) ?? null; } catch { return null; } };
const removeKey = (store, key) => { try { store()?.removeItem(key); } catch { /* nothing to remove */ } };
/** @returns {boolean} false when the value could not be stored */
const writeKey = (store, key, value) => {
  try {
    const target = store();
    if (!target) return false;
    target.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

/**
 * One registry. The app uses the instance exported below; tests pass their own loaders.
 * @param {Object} [deps]
 * @param {Object<string, () => Promise<Object>>} [deps.loaders] one import per view id
 * @param {string[]} [deps.devViews] ids that are not prefs and exist on the dev server only
 * @param {() => string} [deps.readView] the stored pref
 * @param {(id: string) => { ok: boolean }} [deps.storeView] stores the pref
 * @param {() => boolean} [deps.isOnline]
 * @param {() => Storage|null} [deps.session] sessionStorage
 * @param {() => Storage|null} [deps.local] localStorage
 * @param {() => void} [deps.reload] reloads the page
 */
export function createRegistry({
  loaders = LOADERS,
  devViews = Object.keys(DEV_LOADERS),
  readView = () => getPrefs().view,
  storeView = (id) => setPref('view', id),
  isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false,
  session = browserStore('sessionStorage'),
  local = browserStore('localStorage'),
  reload = () => { if (typeof window !== 'undefined') window.location.reload(); },
} = {}) {
  const loaded = new Map();
  const loading = new Map();
  const isDevView = (id) => devViews.includes(id) && own(loaders, id);

  /** After a failed import: online and not yet tried this session, mark the session and reload once. */
  function healByReload() {
    if (!isOnline() || readKey(session, RELOAD_FLAG) !== null) return;
    if (!writeKey(session, RELOAD_FLAG, RELOAD_MARK)) return; // no mark, no reload: it could loop
    try { reload(); } catch { /* the caller falls back to the standard layout */ }
  }

  async function importView(id) {
    try {
      const mod = await loaders[id]();
      loaded.set(id, mod);
      if (readKey(session, RELOAD_FLAG) === RELOAD_MARK) removeKey(session, RELOAD_FLAG);
      return mod;
    } catch {
      healByReload();
      return null; // not cached: the next call imports again
    } finally {
      loading.delete(id);
    }
  }

  /**
   * Resolves to the view module, or null when it cannot load. Never throws. Caches successes. When the
   * import fails while online, the page is reloaded once per session (the reload every other chunk
   * gets after a release, main.js); offline, or when that did not help, the caller renders classic.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  function loadView(id) {
    if (!own(loaders, id)) return Promise.resolve(null);
    if (loaded.has(id)) return Promise.resolve(loaded.get(id));
    if (!loading.has(id)) loading.set(id, importView(id));
    return loading.get(id);
  }

  /** @returns {string} the view to render: the stored pref, or the default when it is not a view */
  function activeViewId() {
    if (devViews.length) {
      const dev = readKey(local, DEV_VIEW_KEY);
      if (isDevView(dev)) return dev;
    }
    const id = readView();
    return VIEW_IDS.includes(id) ? id : DEFAULT_VIEW;
  }

  /** Starts loading the active view. Resolves like loadView: never throws. */
  function preloadActiveView() {
    return loadView(activeViewId());
  }

  /**
   * Loads the view and its CSS first, then stores prefs.view. Rejects, and stores nothing, when the
   * view cannot load. Re-rendering is the caller's job (blueprint 5.5).
   * @param {string} id
   * @returns {Promise<Object>} the view module
   */
  async function setActiveView(id) {
    const mod = await loadView(id);
    if (!mod) throw new Error(`The ${id} view could not load`);
    if (isDevView(id)) {
      writeKey(local, DEV_VIEW_KEY, id);
      return mod;
    }
    if (storeView(id)?.ok === false) throw new Error(`The ${id} view could not be saved as the active view`);
    if (devViews.length) removeKey(local, DEV_VIEW_KEY);
    return mod;
  }

  return { loadView, activeViewId, preloadActiveView, setActiveView };
}

const appRegistry = createRegistry();

export const { loadView, activeViewId, preloadActiveView, setActiveView } = appRegistry;
