import { addRoute, start, navigate, onNotFound, reloadCurrentRoute } from './router.js';
import { renderNav } from './components/nav.js';
import { renderDashboard } from './components/dashboard.js';
import { logger } from './lib/logger.js';
import { supabase, getUser, hasLocalSession } from './lib/supabase.js';
import { setHomeCurrency } from './data/user-prefs.js';
import { setLocaleFromFlag } from './lib/locale.js';
import { initSquareMode, onSquareModeChange } from './lib/square-mode.js';
import { escapeHtml } from './data/day-builder.js';

// How long the first screen waits for the stored session to be restored. Online
// that takes well under a second, but offline with an expired access token
// supabase-js keeps retrying the refresh for 30 s or more; the app must not sit
// on a blank screen (or a sign-in prompt) for that long. Known offline, only a
// still-valid token can be restored at all, and that is instant.
const AUTH_BOOT_TIMEOUT_MS = 2500;
const AUTH_BOOT_TIMEOUT_OFFLINE_MS = 300;

// Captured before supabase-js strips the OAuth callback from the URL.
const isOAuthReturn = /(?:^|[#&?])(?:access_token|code)=/.test(location.hash + location.search);

// A trip deep link (#/trip/<id>, not /read): start downloading the trip view and
// its data right away, in parallel with restoring the session.
const deepLinkTripId = (/^#\/trip\/([^/?&]+)(?:[?&]|$)/.exec(location.hash) || [])[1];
if (deepLinkTripId && hasLocalSession()) {
  import('./components/trip-detail.js').catch(() => {});
  import('./data/trip-repository.js')
    .then(m => m.prefetchTripById(decodeURIComponent(deepLinkTripId)))
    .catch(() => {});
}

initSquareMode();
// When the viewport crosses the square threshold (rotate/resize), the effective
// mode flips, so rebuild the active view so its card decks mount (or unmount).
onSquareModeChange(() => reloadCurrentRoute());

window.addEventListener('error', (event) => {
  logger.error('system', 'Unhandled error', {
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    col: event.colno,
    stack: event.error?.stack,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || String(event.reason);
  if (/Failed to fetch dynamically imported module|Loading chunk .* failed|Importing a module script failed/i.test(msg)) {
    if (!sessionStorage.getItem('chunk-reload')) {
      sessionStorage.setItem('chunk-reload', '1');
      window.location.reload();
      return;
    }
    sessionStorage.removeItem('chunk-reload');
  }
  logger.error('system', 'Unhandled promise rejection', {
    message: msg,
    stack: event.reason?.stack,
  });
});

renderNav();

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

// Runs when the signed-in user differs from the one the screen was built for:
// a fresh sign-in, a session restored late (slow or offline start), or a
// sign-in/out in another tab.
async function onUserChanged(userId, { fromSignIn }) {
  renderNav();
  if (!userId) {
    const { clearOfflineTripCache } = await import('./data/trip-repository.js');
    clearOfflineTripCache();
    reloadCurrentRoute();
    return;
  }
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

addRoute('/trip/:id', async (params) => {
  // Offline (or while a slow session restore runs) the trip view can still show
  // the copy saved on this device, so it doesn't need a confirmed session.
  if (!(await ensureSignedIn({ requireOnline: false }))) return;
  const tripId = params.id.split('?')[0];
  // Fetch the data while the view's code downloads; renderTripDetail picks it up.
  import('./data/trip-repository.js').then(m => m.prefetchTripById(tripId)).catch(() => {});
  const { renderTripDetail } = await import('./components/trip-detail.js');
  await renderTripDetail(params.id);
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

addRoute('/trip/:id/read', async (params) => {
  if (!(await ensureSignedIn())) return;
  const { renderOwnerReadView } = await import('./components/shared-trip.js');
  await renderOwnerReadView(params.id);
}, { title: 'Trip', titleFromHeading: true });

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
  routesStarted = true;
  renderNav();
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
btt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
window.addEventListener('scroll', () => {
  btt.classList.toggle('back-to-top--visible', window.scrollY > 400);
}, { passive: true });

const footerYear = document.getElementById('footer-year');
if (footerYear) footerYear.textContent = String(new Date().getFullYear());
