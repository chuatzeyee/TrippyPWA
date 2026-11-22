// The Settings route (blueprint 6): load, render, bind, save. Every control saves on change; there is
// no Save button and no draft. Device preferences work offline; what is backed by the profile row
// says it needs a connection. The markup is js/settings/sections.js, the redraw in place is
// js/settings/part-patch.js, and what a click or a change does is js/settings/actions.js. Owner: F12.
import '../views/shared/styles.js';
import '../../css/components/settings.css';
import { getUser } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { THEME_EVENT, effectiveTheme } from '../lib/theme.js';
import { getLanguage } from '../lib/i18n.js';
import { getSquareOverride, isSquareMode } from '../lib/square-mode.js';
import { getPrefs, onPrefsChange, pendingPrefKeys, remotePrefsState } from '../data/prefs-store.js';
import { getHomeCurrency } from '../data/user-prefs.js';
import { getProfileSummary, saveProfileSummary } from '../data/profile-cache.js';
import { fetchProfile } from '../data/profile-repository.js';
import { listOfflineTrips } from '../data/trip-repository.js';
import { VIEW_IDS, VIEW_META, setActiveView } from '../views/registry.js';
import { mountViewPicker } from '../views/shared/view-picker.js';
import { onRouteLeave } from '../router.js';
import { entryBuildId, settingsPageHtml, syncStatusText } from './sections.js';
import { notificationState, readNotificationEnv } from './notify.js';
import { cityLabel, homeCurrencyOf } from './profile-fields.js';
import { mountCityCombobox } from './city-combobox.js';
import { patchParts, readParts } from './part-patch.js';
import { bindActions, saveProfileField } from './actions.js';
import { mountToc } from './toc.js';

/**
 * Whether the six preview images of the picker exist (public/img/views/<id>-<dark|light>.webp). They
 * were written at gate G3 by `shoot-app.mjs --task picker`, always from the sample account. With
 * false the picker draws its placeholder and asks for no image.
 */
const PICKER_IMAGES = true;
const SYNC_POLL_MS = 700;
const SYNC_POLL_TRIES = 20;
const VERSION_TIMEOUT_MS = 1500;
const VIEWS = VIEW_IDS.map((id) => VIEW_META[id]);

/** The one mounted page, or null. Everything that outlives a redraw hangs on it. */
let page = null;

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** The state the markup is built from, read fresh from where each value lives. */
function readState(current) {
  const profile = current.profile;
  return {
    online: isOnline(),
    prefs: getPrefs(),
    language: getLanguage(),
    picker: { theme: effectiveTheme(), baseUrl: import.meta.env.BASE_URL, images: PICKER_IMAGES, views: VIEWS },
    square: { override: getSquareOverride(), active: isSquareMode() },
    profile,
    home: (profile.status === 'ready' ? homeCurrencyOf(profile.data) : null) ?? getHomeCurrency(),
    saves: current.saves,
    sync: { remote: remotePrefsState(), pending: pendingPrefKeys() },
    notify: { state: notificationState(readNotificationEnv()), message: current.notifyMessage },
    offlineTrips: listOfflineTrips(),
    dataMessage: current.dataMessage,
    account: { email: getUser()?.email ?? null, admin: current.admin },
    buildId: current.buildId,
  };
}

// ---- Drawing ----

/** Binds what lives inside a part and dies with it: the picker and the city field. */
function mountParts(current, names) {
  const { root } = current;
  if (names.includes('picker')) {
    current.unmountPicker?.();
    const el = root.querySelector('[data-st-part="picker"]');
    current.unmountPicker = el ? mountViewPicker(el, { views: VIEWS, onPick: (id) => pickView(current, id) }) : null;
  }
  if (names.includes('home')) {
    current.cityBinding?.abort();
    current.cityBinding = null;
    const input = root.querySelector('#st-city');
    if (!input) return;
    current.cityBinding = new AbortController();
    mountCityCombobox({
      input,
      list: root.querySelector('#st-city-list'),
      note: root.querySelector('[data-st-city-note]'),
      search: async (query) => (await import('../profile/city-search.js')).searchCities(query),
      saved: () => cityLabel(current.profile.data),
      canClear: () => current.profile.data?.is_nomad === true,
      onChoose: (city) => { input.value = cityLabel({ home_city: city.name, home_country: city.country }); saveProfileField(current, 'city', city); },
      onClear: () => saveProfileField(current, 'city', null),
      signal: current.cityBinding.signal,
    });
  }
}

/**
 * Redraws what changed, part by part, and keeps the focus (js/settings/part-patch.js).
 * @param {object} current the mounted page
 * @param {{ adopt?: string[] }} [opts] parts the page has already updated itself
 */
function refresh(current, { adopt = [] } = {}) {
  if (page !== current || !current.root.isConnected) return;
  const state = readState(current);
  const taken = current.picking > 0 ? [...adopt, 'picker'] : adopt;
  const result = patchParts(current.root, settingsPageHtml(state), current.known, { adopt: taken });
  current.known = result.known;
  current.held = result.held.length > 0;
  current.syncText = syncStatusText({ ...state.sync, online: state.online });
  mountParts(current, result.replaced);
  if (state.sync.pending.length > 0 && state.sync.remote !== 'unavailable') watchSync(current);
}

/** The same, one tick later: for a change made while the focus is moving, so the control it lands on is not replaced under it. */
function refreshSoon(current) {
  if (current.soon) return;
  current.soon = setTimeout(() => { current.soon = 0; refresh(current); }, 0);
}

/** The picker applies a view at once: load it, store it, and leave the picker's own markup alone. */
async function pickView(current, id) {
  current.picking += 1;
  try {
    await setActiveView(id); // rejects when the view cannot load: the picker then says so and goes back
  } finally {
    current.picking -= 1;
  }
  refresh(current, { adopt: ['picker'] });
}

/** While a change waits to reach the account, look again until the status line can say it has. */
function watchSync(current) {
  if (current.syncPoll) return;
  let tries = 0;
  current.syncPoll = setInterval(() => {
    tries += 1;
    const gone = page !== current || !current.root.isConnected;
    const text = gone ? '' : syncStatusText({ remote: remotePrefsState(), pending: pendingPrefKeys(), online: isOnline() });
    const settled = gone || pendingPrefKeys().length === 0 || tries >= SYNC_POLL_TRIES;
    if (settled) { clearInterval(current.syncPoll); current.syncPoll = null; }
    if (!gone && text !== current.syncText) refresh(current);
  }, SYNC_POLL_MS);
}

// ---- What arrives later: the profile row, the admin role, the build id ----

/** Reads the profile row. Offline, or before the session is confirmed, the profile parts say they need a connection. */
async function loadProfile(current) {
  const user = getUser();
  if (!isOnline() || !user) {
    current.profile = { status: 'offline', data: current.profile.data };
    refresh(current);
    return;
  }
  if (current.profile.status !== 'ready') {
    current.profile = { status: 'loading', data: current.profile.data };
    refresh(current);
  }
  const edits = current.edits;
  const { data, error } = await fetchProfile().catch((e) => ({ data: null, error: e?.message || 'failed' }));
  if (page !== current) return;
  if (error || !data) {
    logger.warn('ui', 'Settings could not read the profile', { error });
    current.profile = { status: isOnline() ? 'error' : 'offline', data: current.profile.data };
  } else if (current.edits === edits) { // a save made meanwhile is newer than this read
    current.profile = { status: 'ready', data };
    saveProfileSummary(user.id, data);
  }
  refresh(current);
}

async function loadAdmin(current) {
  if (!isOnline() || !getUser()) return;
  try {
    const { isAdmin } = await import('../data/admin-repository.js');
    const admin = (await isAdmin()) === true;
    if (page !== current || admin === current.admin) return;
    current.admin = admin;
    refresh(current);
  } catch { /* no Admin link: the nav menu is the other way there */ }
}

/** The build id as the service worker knows it; without a worker, the hash in the entry file name; "dev" on the dev server. */
function readBuildId() {
  if (import.meta.env.DEV) return Promise.resolve('dev');
  const fromEntry = () => entryBuildId(document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src'));
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return Promise.resolve(fromEntry());
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(fromEntry()), VERSION_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      const id = event.data?.buildId;
      resolve(typeof id === 'string' && id && id !== 'dev' ? id : fromEntry());
    };
    try { worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]); } catch { clearTimeout(timer); resolve(fromEntry()); }
  });
}

async function loadBuildId(current) {
  const id = await readBuildId().catch(() => '');
  if (page !== current || id === current.buildId) return;
  current.buildId = id;
  refresh(current);
}

// ---- Listeners outside the page: they end when the route is left and start again on a rebuild ----

function listen(current) {
  current.outside?.abort();
  const outside = new AbortController();
  current.outside = outside;
  const { signal } = outside;
  const offPrefs = onPrefsChange(() => refresh(current));
  signal.addEventListener('abort', offPrefs, { once: true });
  window.addEventListener('online', () => loadProfile(current), { signal });
  window.addEventListener('offline', () => loadProfile(current), { signal });
  window.addEventListener(THEME_EVENT, () => refresh(current), { signal });
  // Back from the browser's settings, or from another tab: the permission and the saved copies may differ.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(current); }, { signal });
  mountToc(current.root, { signal });
  onRouteLeave(() => outside.abort());
}

function mount(app) {
  page?.unmountPicker?.();
  page?.cityBinding?.abort();
  page?.outside?.abort();
  if (page?.syncPoll) clearInterval(page.syncPoll);
  const summary = getProfileSummary();
  const ready = Boolean(summary) && isOnline() && Boolean(getUser());
  const current = {
    root: null, known: {}, held: false, soon: 0, picking: 0, edits: 0, syncPoll: null, syncText: '', outside: null, unmountPicker: null, cityBinding: null,
    profile: { status: ready ? 'ready' : isOnline() && getUser() ? 'loading' : 'offline', data: summary },
    saves: {}, notifyMessage: '', dataMessage: '', admin: false, buildId: import.meta.env.DEV ? 'dev' : '',
    refresh: (opts) => refresh(current, opts),
    refreshSoon: () => refreshSoon(current),
    reloadProfile: () => loadProfile(current),
  };
  page = current;
  app.innerHTML = settingsPageHtml(readState(current));
  current.root = app.querySelector('.st-page');
  current.known = readParts(current.root);
  bindActions(current);
  // A part held back while someone typed in it is drawn as soon as they leave the field.
  current.root.addEventListener('focusout', () => { if (current.held) refreshSoon(current); });
  mountParts(current, ['picker', 'home']);
  refresh(current); // records the status line and starts the sync watch when a change is waiting
  listen(current);
  loadProfile(current);
  loadAdmin(current);
  loadBuildId(current);
}

/**
 * Draws the Settings page into #app. main.js calls it after its own sign-in check, which also passes
 * offline. With `reload` (a rebuild of the open route: a square-layout flip, a late session) the page
 * that is already there is patched in place, so the focus stays on the control it is on.
 * @param {{ reload?: boolean }} [opts]
 */
export async function renderSettings({ reload = false } = {}) {
  const app = typeof document === 'undefined' ? null : document.getElementById('app');
  if (!app) return;
  if (reload && page && page.root.isConnected && app.contains(page.root)) {
    const current = page;
    listen(current); // the route's leave handlers ran before this rebuild
    refresh(current);
    if (current.profile.status !== 'ready') loadProfile(current);
    if (!current.admin) loadAdmin(current);
    return;
  }
  mount(app);
}
