import { addRoute, start, navigate, onNotFound, reloadCurrentRoute } from './router.js';
import { renderNav, updateNavLinks } from './components/nav.js';
import { renderFooter } from './site/footer-mount.js';
import { renderDashboard } from './components/dashboard.js';
import { logger } from './lib/logger.js';
import { supabase, getUser, hasLocalSession } from './lib/supabase.js';
import { setHomeCurrency } from './data/user-prefs.js';
import { setLocaleFromFlag } from './lib/locale.js';
import { initSquareMode, onSquareModeChange, isSquareMode } from './lib/square-mode.js';
import { escapeHtml } from './data/day-builder.js';
import { shouldReloadForRemotePrefs } from './lib/prefs.js';
import { scrollBehavior } from './lib/motion.js';
import { initPrefs, onPrefsChange, syncPrefs, adoptUser } from './data/prefs-store.js';
import { preloadActiveView, activeViewId } from './views/registry.js';
import { saveProfileSummary, clearProfileSummary, trackProfileFetch } from './data/profile-cache.js';

// How long the first screen waits for the stored session to be restored. Online
// that takes well under a second, but offline with an expired access token
// supabase-js keeps retrying the refresh for 30 s or more; the app must not sit
// on a blank screen (or a sign-in prompt) for that long. Known offline, only a
// still-valid token can be restored at all, and that is instant.
const AUTH_BOOT_TIMEOUT_MS = 2500;
const AUTH_BOOT_TIMEOUT_OFFLINE_MS = 300;

// Captured before supabase-js strips the OAuth callback from the URL.
const isOAuthReturn = /(?:^|[#&?])(?:access_token|code)=/.test(location.hash + location.search);

// The route in the address bar, without its query.
function currentPath() {
  return (location.hash.slice(1) || '/').split('?')[0];
}

// A trip deep link (#/trip/<id>, not /read): start downloading the trip view and
// its data right away, in parallel with restoring the session.
const deepLinkTripId = (/^#\/trip\/([^/?&]+)(?:[?&]|$)/.exec(location.hash) || [])[1];
if (deepLinkTripId && hasLocalSession()) {
  import('./components/trip-detail.js').catch(() => {});
  import('./data/trip-repository.js')
    .then(m => m.prefetchTripById(decodeURIComponent(deepLinkTripId)))
    .catch(() => {});
}

// A signed-in start: fetch the active view (its code and both of its
// stylesheets) while the session is restored. It never rejects: a view that
// cannot load resolves to null and the page is drawn in the standard layout.
// Square mode never draws a view, so a square phone does not download one.
if (hasLocalSession() && !isSquareMode()) preloadActiveView();
// On the dashboard route the controller that draws a view is fetched as well,
// so it is on its way before the list of trips returns.
if (hasLocalSession() && currentPath() === '/' && !isSquareMode()) {
  import('./components/dashboard-views.js').catch(() => {});
}

initSquareMode();
// Synchronous: reads the prefs kept on this device and applies the theme, the
// motion setting and the time and temperature formats before anything renders.
initPrefs();
onPrefsChange(handlePrefsChange);
// When the viewport crosses the square threshold (rotate/resize), the effective
// mode flips, so rebuild the nav (its links and its square control follow the
// mode) and the active view, so its card decks mount (or unmount).
onSquareModeChange(() => {
  const focused = document.activeElement;
  const focusedId = focused?.closest?.('#app-nav') ? focused.id : '';
  renderNav();
  renderFooter(); // Atlas is not a page in square layout
  // The square control itself may have caused the flip: keep the focus on it.
  if (focusedId) document.getElementById(focusedId)?.focus();
  reloadCurrentRoute();
});

window.addEventListener('error', (event) => {
  logger.error('system', 'Unhandled error', {
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    col: event.colno,
    stack: event.error?.stack,
  });
});

// A chunk that will not load usually means a new release replaced the files
// this page was built from, so the page reloads once to pick it up. Once per
// burst of failures: imports can fail in pairs, and treating the second one as
// a new case made the page reload in a loop. Never without a connection, where
// a reload cannot bring a file the device does not already have.
const CHUNK_RELOAD_KEY = 'chunk-reload'; // js/views/registry.js marks its own reload under the same key
const CHUNK_BURST_MS = 10_000;
let lastChunkFailureAt = -Infinity;

window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || String(event.reason);
  if (/Failed to fetch dynamically imported module|Loading chunk .* failed|Importing a module script failed/i.test(msg)) {
    const sameBurst = performance.now() - lastChunkFailureAt < CHUNK_BURST_MS;
    lastChunkFailureAt = performance.now();
    if (!sameBurst) {
      if (navigator.onLine && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        window.location.reload();
        return;
      }
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    }
  }
  logger.error('system', 'Unhandled promise rejection', {
    message: msg,
    stack: event.reason?.stack,
  });
});

renderNav();
renderFooter();

// ===== Auth state =====

let authSettled = false;
let routesStarted = false;
// The user the visible screen was rendered for; auth events for the same user
// (every tab refocus re-emits SIGNED_IN) are ignored.
let renderedUserId = null;

const authReady = import('./auth/auth.js').then(async (auth) => {
  auth.onAuthChange(handleAuthEvent);
  try { await auth.initAuth(); } catch (e) { logger.error('auth', 'initAuth failed', { error: e?.message }); }
  return auth;
});
authReady.then(() => { authSettled = true; }, () => { authSettled = true; });

function currentUserId(auth) {
  return auth.getCurrentUser()?.id || null;
}

// True when signed in. A stored session that isn't confirmed (the restore is
// still running, or the token refresh failed for lack of a connection; a token
// the server rejects is removed) still counts when requireOnline is false: the
// trip view can show the copy saved on this device. Other screens get a
// no-connection notice, and visitors without a session the sign-in gate.
async function ensureSignedIn({ requireOnline = true } = {}) {
  const auth = await import('./auth/auth.js');
  if (auth.isAuthenticated()) return true;
  if (hasLocalSession()) {
    if (!requireOnline) return true;
    if (!authSettled && navigator.onLine) {
      await authReady;
      if (auth.isAuthenticated()) return true;
    }
    if (hasLocalSession()) {
      renderOfflineNotice();
      return false;
    }
  }
  const { showAuthGate } = await import('./auth/auth-ui.js');
  showAuthGate();
  navigate('/');
  return false;
}

// Back online with a session that couldn't be refreshed while offline: refresh
// now (the resulting auth event rebuilds the screen) instead of waiting for the
// next background refresh tick.
window.addEventListener('online', async () => {
  if (!authSettled || !hasLocalSession()) return;
  const auth = await import('./auth/auth.js');
  if (auth.isAuthenticated()) return;
  supabase?.auth.getSession().catch(() => {});
});

// Onboarding check for the signed-in user. Returns null when it can't be
// checked (offline, transient error): callers must not redirect on null, so a
// network blip never bounces someone out of their trip into the profile screen.
let onboardedUserId = null;
async function checkProfile() {
  const user = getUser();
  if (!user || !supabase) return null;
  if (onboardedUserId === user.id) return { onboarded: true, profile: null };
  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_complete, home_currency, home_currency_symbol, home_flag')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    logger.warn('profile', 'Profile check failed', { error: error.message });
    return null;
  }
  if (data?.onboarding_complete) onboardedUserId = user.id;
  return { onboarded: !!data?.onboarding_complete, profile: data };
}

async function redirectIfNotOnboarded() {
  const state = await checkProfile();
  if (state && !state.onboarded) {
    navigate('/profile');
    return true;
  }
  return false;
}

function applyProfilePrefs(profile) {
  if (profile?.home_currency) setHomeCurrency(profile.home_currency, profile.home_currency_symbol || '$');
  if (profile?.home_flag) setLocaleFromFlag(profile.home_flag);
}

// What the device keeps of the profile. Every column exists since migrations
// 001, 005 and 015. `prefs` is never named here or in checkProfile(): until
// migration 022 is applied that column does not exist and asking for it would
// fail the whole read. The prefs store asks for it by itself.
const PROFILE_COLUMNS = 'onboarding_complete, home_currency, home_currency_symbol, home_flag, home_city, home_country, display_name, is_nomad, nationality';

// Fetches the signed-in user's profile, applies the home currency and locale
// and saves the summary the views read (js/data/profile-cache.js). checkProfile()
// answers from its memo after the first call, so it cannot feed that copy: this
// one always fetches. Resolves with the row, or with null when there is no row
// or it could not be read; a null is never saved. Never rejects.
function hydrateProfile() {
  const userId = getUser()?.id;
  if (!userId || !supabase) return Promise.resolve(null);
  const fetched = (async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', userId)
        .maybeSingle();
      if (error) {
        logger.warn('profile', 'Profile hydration failed', { error: error.message });
        return null;
      }
      // Signed out, or another account signed in, while the request was out.
      if (!data || getUser()?.id !== userId) return null;
      applyProfilePrefs(data);
      saveProfileSummary(userId, data);
      return data;
    } catch (e) {
      logger.warn('profile', 'Profile hydration failed', { error: e?.message });
      return null;
    }
  })();
  // Tracked while the user is known: profileSummaryReady() waits for this fetch.
  return trackProfileFetch(fetched);
}

// Every signed-in start (the normal boot, a session restored after the boot
// wait, a sign-in): refresh the saved profile summary, make the prefs on this
// device this account's, and merge them with the account's copy.
function startUserSession(userId) {
  hydrateProfile();
  adoptUser(userId);
  syncPrefs(); // never rejects
}

// Runs when the signed-in user differs from the one the screen was built for:
// a fresh sign-in, a session restored late (slow or offline start), or a
// sign-in/out in another tab.
async function onUserChanged(userId, { fromSignIn }) {
  renderNav();
  renderFooter(); // its links follow who is signed in
  if (!userId) {
    clearProfileSummary();
    const { clearOfflineTripCache } = await import('./data/trip-repository.js');
    clearOfflineTripCache();
    reloadCurrentRoute();
    return;
  }
  // Before the route is rebuilt: adopting the account can reset another
  // account's prefs, and the view is chosen from them.
  startUserSession(userId);
  if (fromSignIn) {
    const state = await checkProfile();
    if (state && !state.onboarded) { navigate('/profile'); return; }
    applyProfilePrefs(state?.profile);
  }
  reloadCurrentRoute();
  prefetchTripView();
}

function handleAuthEvent(event, session) {
  if (!routesStarted) return; // the boot sequence reads the session itself
  const userId = session?.user?.id || null;
  if (event === 'SIGNED_OUT' || userId !== renderedUserId) {
    if (event !== 'SIGNED_OUT' && !userId) return;
    if (/(?:^|[&?])access_token=/.test(location.hash)) {
      history.replaceState(null, '', location.pathname + location.search + '#/');
    }
    const fromSignIn = event === 'SIGNED_IN';
    renderedUserId = userId;
    onUserChanged(userId, { fromSignIn }).catch(e => logger.error('auth', 'Auth change handling failed', { error: e?.message }));
  }
}

// Offline trip copies belong to a signed-in user. A session that ended while the
// app was closed (refresh token revoked or expired) signs out inside initAuth,
// before handleAuthEvent listens, and signing out reloads the page, maybe before
// onUserChanged has cleared them. So check again once auth has settled.
const OFFLINE_COPY_KEY_PREFIX = 'trippy-offline-trip'; // the keys trip-repository.js writes
function clearOfflineCopiesIfSignedOut(auth) {
  if (currentUserId(auth) || hasLocalSession()) return;
  clearProfileSummary(); // the name, home and passport of whoever was signed in
  let saved = false;
  try { saved = Object.keys(localStorage).some(k => k.startsWith(OFFLINE_COPY_KEY_PREFIX)); } catch { /* no storage */ }
  if (!saved) return;
  import('./data/trip-repository.js').then(m => m.clearOfflineTripCache()).catch(() => {});
}

// The trip view is the next screen for almost every signed-in visit: fetch its
// code while the dashboard is idle so opening a trip doesn't wait for it.
function prefetchTripView() {
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  idle(() => { import('./components/trip-detail.js').catch(() => {}); });
}

// ===== Preferences =====

// Whether the user has pressed, typed or scrolled since the route was drawn. A
// navigation starts a fresh page; a rebuild in place keeps the mark.
let pageTouched = false;
for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  window.addEventListener(type, () => { pageTouched = true; }, { capture: true, passive: true });
}
window.addEventListener('hashchange', () => { pageTouched = false; });

// What a rebuild would close or throw away: a dialog, menu or sheet, the sign-in
// prompt, edit mode, the chat panel or a draft in it, the full-screen map, a
// text field with the caret in it. The trip page keeps the same list for its
// own refresh (isEditorOpen() in js/components/trip-detail.js).
const OPEN_UI = 'dialog[open], [aria-modal="true"], .modal-backdrop, .td-edit-mode, .td-activity-card--editing, .td-chat-drawer--open, .td-alt-panel, [data-map-full="on"]';
const TEXT_FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="range"]), textarea, select, [contenteditable]:not([contenteditable="false"])';

function pageIsBusy() {
  if (document.querySelector(OPEN_UI)) return true;
  if (document.querySelector('.td-chat-input')?.value.trim()) return true;
  return Boolean(document.activeElement?.matches?.(TEXT_FIELD));
}

// A change made on this device has already been drawn by the code that made it
// (the chooser swaps the view, Settings patches itself, the menu applies the
// theme), so the route is never rebuilt for it. A change that arrives from
// another device is already applied to the document by the store; the dashboard
// or a trip page is rebuilt for it only when what it prints changed, the user
// has not touched the page and nothing is open. Otherwise the next navigation
// shows the new values.
function handlePrefsChange(prefs, changedKeys, { origin } = {}) {
  // Only the links are replaced, so the avatar does not blink.
  if (changedKeys.includes('view')) { updateNavLinks(); renderFooter(); }
  if (origin !== 'remote') return;
  const rebuild = shouldReloadForRemotePrefs({
    path: location.hash,
    changedKeys,
    touched: pageTouched,
    busy: pageIsBusy(),
  });
  if (rebuild) reloadCurrentRoute();
}

// Prefs changed on another device arrive at a signed-in start (startUserSession),
// when the connection returns and when the app is brought back: installed apps
// stay open for days, so that last one runs at most once a minute. Signed out,
// syncPrefs() does nothing.
const PREFS_VISIBLE_SYNC_MIN_MS = 60_000;
window.addEventListener('online', () => { syncPrefs(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncPrefs({ minIntervalMs: PREFS_VISIBLE_SYNC_MIN_MS });
});

// ===== Offline screens =====

function renderOfflineNotice() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="container offline-view">
      <h1 class="text-h1">No connection</h1>
      <p class="offline-view-text">This needs a connection. Trips saved on this device still open without one.</p>
      <a class="btn btn--primary btn--pill" href="#/">See saved trips</a>
    </div>
  `;
}

function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

async function renderOfflineHome() {
  const { listOfflineTrips } = await import('./data/trip-repository.js');
  const trips = listOfflineTrips();
  const items = trips.map(t => {
    const dates = [formatShortDate(t.start_date), formatShortDate(t.end_date)].filter(Boolean).join(' to ');
    return `
      <li>
        <a class="offline-trip" href="#/trip/${encodeURIComponent(t.id)}">
          <span class="offline-trip-title">${escapeHtml(t.title || 'Untitled trip')}</span>
          ${dates ? `<span class="offline-trip-dates">${escapeHtml(dates)}</span>` : ''}
        </a>
      </li>`;
  }).join('');
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="container offline-view">
      <h1 class="text-h1">Saved trips</h1>
      <p class="offline-view-text">${trips.length
        ? 'No connection right now. These trips are saved on this device and open without one.'
        : 'No connection right now, and no trips are saved on this device yet. Open a trip while online to keep a copy for offline use.'}</p>
      ${trips.length ? `<ul class="offline-trips">${items}</ul>` : ''}
    </div>
  `;
}

// ===== Routes =====

let dashboardTitle = '';

addRoute('/', async () => {
  const auth = await import('./auth/auth.js');
  // A stored session that can't be confirmed (offline, or the refresh failed for
  // lack of a connection): the dashboard would wait on a skeleton forever, so
  // list the trips saved on this device instead.
  if (!auth.isAuthenticated() && hasLocalSession() && (!navigator.onLine || authSettled)) {
    dashboardTitle = 'Saved trips';
    await renderOfflineHome();
    return;
  }
  dashboardTitle = auth.isAuthenticated() ? 'Your trips' : '';
  await renderDashboard();
}, { title: () => dashboardTitle });

addRoute('/profile', async () => {
  if (!(await ensureSignedIn())) return;
  const { renderProfileWizard } = await import('./profile/profile-wizard.js');
  await renderProfileWizard();
}, { title: 'Your profile' });

// The Settings code could not be fetched, or its page threw: say so instead of
// leaving the skeleton up. Online, a fresh page load also picks up a new
// release; offline, only the import can be tried again.
function renderSettingsLoadError() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <div class="container offline-view">
      <h1 class="text-h1">Settings</h1>
      <p class="offline-view-text" role="alert">Settings could not load. Check your connection and try again.</p>
      <button type="button" class="btn btn--primary btn--pill" data-action="retry-settings">Try again</button>
    </div>
  `;
  app.querySelector('[data-action="retry-settings"]').addEventListener('click', () => {
    if (navigator.onLine) window.location.reload();
    else reloadCurrentRoute();
  });
}

addRoute('/settings', async (params, { reload }) => {
  // Settings opens offline too: the prefs it shows are kept on this device.
  if (!(await ensureSignedIn({ requireOnline: false }))) return;
  try {
    const mod = await import('./settings/settings-page.js');
    if (currentPath() !== '/settings') return; // left while the code was loading
    await mod.renderSettings({ reload });
  } catch (e) {
    logger.error('ui', 'Settings could not open', { error: e?.message });
    if (currentPath() === '/settings') renderSettingsLoadError();
  }
}, { title: 'Settings' });

addRoute('/atlas', async () => {
  if (!(await ensureSignedIn())) return;
  // The page belongs to the atlas view, and square mode never draws a view.
  if (isSquareMode() || activeViewId() !== 'atlas') { navigate('/'); return; }
  try {
    const mod = await import('./components/dashboard-views.js');
    if (currentPath() !== '/atlas') return; // left while the code was loading
    await mod.renderAtlasRoute();
  } catch (e) {
    logger.error('ui', 'The atlas page could not open', { error: e?.message });
    if (currentPath() === '/atlas') navigate('/');
  }
}, { title: 'Atlas' });

addRoute('/wizard', async (params, { reload }) => {
  if (!(await ensureSignedIn())) return;
  if (await redirectIfNotOnboarded()) return;
  const m = await import('./wizard/wizard.js');
  // A rebuild in place (square mode switched) must keep the plan in progress.
  if (reload) await m.renderWizard();
  else await m.clearAndStart();
}, { title: 'Plan a trip' });

addRoute('/wizard/:step', async (params) => {
  if (!(await ensureSignedIn())) return;
  if (await redirectIfNotOnboarded()) return;
  const m = await import('./wizard/wizard.js');
  await m.renderWizard(parseInt(params.step, 10));
}, { title: 'Plan a trip' });

addRoute('/trip/:id', async (params, { reload }) => {
  // Offline (or while a slow session restore runs) the trip view can still show
  // the copy saved on this device, so it doesn't need a confirmed session.
  if (!(await ensureSignedIn({ requireOnline: false }))) return;
  const tripId = params.id.split('?')[0];
  // Fetch the data while the view's code downloads; renderTripDetail picks it up.
  import('./data/trip-repository.js').then(m => m.prefetchTripById(tripId)).catch(() => {});
  const { renderTripDetail } = await import('./components/trip-detail.js');
  // reload: a rebuild in place (square mode switched, prefs arrived from another
  // device), which must not jump to today or to a section again.
  await renderTripDetail(params.id, { reload });
}, { title: 'Trip', titleFromHeading: true });

addRoute('/admin', async () => {
  if (!(await ensureSignedIn())) return;
  const { renderAdminDashboard } = await import('./admin/admin-dashboard.js');
  await renderAdminDashboard();
}, { title: 'Admin' });

addRoute('/shared/:token', async (params) => {
  const { renderSharedTrip } = await import('./components/shared-trip.js');
  await renderSharedTrip(params.token);
}, { title: 'Shared trip', titleFromHeading: true });

// The site pages: public, signed in or out. #/privacy/<section> opens the page at a section.
for (const pageId of ['about', 'privacy', 'terms']) {
  const open = async (params) => {
    const { renderSitePage } = await import('./site/site-page.js');
    if (currentPath().split('/')[1] !== pageId) return; // left while the code was loading
    await renderSitePage(pageId, { section: params.section ?? null });
  };
  addRoute(`/${pageId}`, open, { title: 'Trippy', titleFromHeading: true });
  addRoute(`/${pageId}/:section`, open, { title: 'Trippy', titleFromHeading: true });
}

addRoute('/trip/:id/read', async (params) => {
  if (!(await ensureSignedIn())) return;
  const { renderOwnerReadView } = await import('./components/shared-trip.js');
  await renderOwnerReadView(params.id);
}, { title: 'Trip', titleFromHeading: true });

// Fine-tune: the plan as a list, with a filter for paid and free stops, Swap and Remove on each.
addRoute('/trip/:id/tune', async (params) => {
  if (!(await ensureSignedIn())) return;
  const { renderTripTune } = await import('./components/trip-tune.js');
  await renderTripTune(params.id);
}, { title: 'Fine-tune', titleFromHeading: true });

// An imported trip next to the plan Trippy wrote for the same trip. Opens offline from saved copies.
addRoute('/trip/:id/compare', async (params) => {
  if (!(await ensureSignedIn({ requireOnline: false }))) return;
  const { renderTripCompare } = await import('./components/trip-compare.js');
  await renderTripCompare(params.id);
}, { title: 'Compare plans', titleFromHeading: true });

onNotFound(() => {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="container" style="padding: var(--sp-16) 0; text-align: center;">
      <div style="font-size: 4rem; margin-bottom: var(--sp-4);">&#x1F9ED;</div>
      <h1 class="text-h1">Lost in transit</h1>
      <p class="text-body" style="color: var(--ink-secondary); margin-top: var(--sp-2);">
        We couldn't find that page. Let's get you back on track.
      </p>
      <button class="btn btn--primary btn--pill" style="margin-top: var(--sp-6);" onclick="location.hash='/'">
        Back to Dashboard
      </button>
    </div>
  `;
});

if (import.meta.env.DEV) {
  import('./data/trip-repository.js').then(m => {
    window.__clearAllUserData = m.clearAllUserData;
  });
}

// ===== Boot =====
// Restore the persisted session BEFORE resolving the first route, so views that
// fetch user data don't fire before the token is back. A signed-out visitor's
// restore resolves at once; with a stored session the wait is capped, and if the
// restore finishes later the screen is rebuilt for the real auth state.
function bootWaitMs() {
  if (!hasLocalSession()) return 30_000; // nothing to refresh: resolves at once
  return navigator.onLine ? AUTH_BOOT_TIMEOUT_MS : AUTH_BOOT_TIMEOUT_OFFLINE_MS;
}

async function boot() {
  const timedOut = await Promise.race([
    authReady.then(() => false, () => false),
    new Promise(resolve => setTimeout(() => resolve(true), bootWaitMs())),
  ]);

  let auth = null;
  try { auth = await import('./auth/auth.js'); } catch (e) {
    logger.error('auth', 'Auth bootstrap failed; starting routes anyway', { error: e?.message });
  }
  renderedUserId = auth ? currentUserId(auth) : null;
  // Before the first route renders, for the reason given in onUserChanged().
  if (renderedUserId) startUserSession(renderedUserId);
  routesStarted = true;
  renderNav();
  renderFooter();
  start();

  const hash = location.hash.slice(1) || '/';
  if (/(?:^|[&?])(?:access_token|refresh_token)=/.test(hash)) {
    history.replaceState(null, '', location.pathname + location.search + '#/');
    renderDashboard();
  }

  // Covers the boot wait having timed out too: this runs when auth settles.
  authReady.then(clearOfflineCopiesIfSignedOut).catch(() => {});

  if (timedOut) {
    authReady.then((late) => {
      const userId = currentUserId(late);
      if (userId === renderedUserId) {
        // Still no confirmed session (no connection): the dashboard is showing
        // a waiting skeleton, so rebuild it as the saved-trips view.
        if (!userId && (location.hash.slice(1) || '/') === '/') reloadCurrentRoute();
        return;
      }
      renderedUserId = userId;
      onUserChanged(userId, { fromSignIn: false });
    }).catch(() => {});
  }

  if (renderedUserId) {
    if (isOAuthReturn) {
      // First screen after signing in with Google: new users go to onboarding.
      const state = await checkProfile();
      if (state && !state.onboarded) navigate('/profile');
      else applyProfilePrefs(state?.profile);
    }
    prefetchTripView();
  }
}

boot().catch((e) => {
  logger.error('auth', 'Boot failed', { error: e?.message });
  if (!routesStarted) {
    routesStarted = true;
    renderNav();
    start();
  }
});

// ===== Service worker and updates =====
// Skip SW registration inside a native wrapper: service workers don't register
// on Capacitor's capacitor:// iOS scheme, and the native shell does its own
// caching. window.Capacitor is injected by the wrapper at runtime.
const isNativeWrapper = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
if ('serviceWorker' in navigator && !isNativeWrapper) {
  registerServiceWorker();
}

function registerServiceWorker() {
  let reloadOnTakeover = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadOnTakeover) {
      reloadOnTakeover = false;
      window.location.reload();
    }
  });
  // The notification for a finished itinerary asks an open window to show it.
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'trippy:navigate' && typeof event.data.hash === 'string' && event.data.hash.startsWith('#/')) {
      location.hash = event.data.hash;
    }
  });

  const offerUpdate = async (worker) => {
    // A worker built from the same release as this page (the page itself came
    // from the network) can take over quietly; otherwise ask before reloading.
    if (await workerMatchesPage(worker)) {
      worker.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    showUpdateBanner(() => {
      reloadOnTakeover = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  };

  // BASE_URL keeps this working under the GH Pages /TrippyPWA/ base ('/sw.js' 404s there).
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    // Installed apps stay open for days: look for a new release when brought back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
}

function workerMatchesPage(worker) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), 1500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      const assets = Array.isArray(event.data?.assets) ? event.data.assets : [];
      const entry = new URL(import.meta.url).pathname.split('/').pop();
      resolve(assets.some(a => a.endsWith(`/${entry}`)));
    };
    worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  });
}

function showUpdateBanner(onReload) {
  if (document.querySelector('.app-update')) return;
  const bar = document.createElement('div');
  bar.className = 'app-update';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `
    <span class="app-update-text">A new version of Trippy is ready.</span>
    <button type="button" class="btn btn--primary btn--sm btn--pill" data-update="reload">Reload</button>
    <button type="button" class="app-update-close" data-update="later" aria-label="Not now">&times;</button>
  `;
  bar.addEventListener('click', (e) => {
    const action = e.target.closest('[data-update]')?.dataset.update;
    if (action === 'reload') onReload();
    if (action) bar.remove();
  });
  document.body.appendChild(bar);
}

const btt = document.createElement('button');
btt.className = 'back-to-top';
btt.setAttribute('aria-label', 'Back to top');
btt.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>';
document.body.appendChild(btt);
btt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: scrollBehavior() }));
window.addEventListener('scroll', () => {
  btt.classList.toggle('back-to-top--visible', window.scrollY > 400);
}, { passive: true });
