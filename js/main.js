import { addRoute, start, navigate, onNotFound } from './router.js';
import { renderNav } from './components/nav.js';
import { renderDashboard } from './components/dashboard.js';

renderNav();

addRoute('/', () => renderDashboard());

addRoute('/profile', async () => {
  const { isAuthenticated } = await import('./auth/auth.js');
  if (!isAuthenticated()) {
    const { showAuthGate } = await import('./auth/auth-ui.js');
    showAuthGate();
    navigate('/');
    return;
  }
  const { renderProfileWizard } = await import('./profile/profile-wizard.js');
  renderProfileWizard();
});

addRoute('/wizard', async () => {
  const { isAuthenticated } = await import('./auth/auth.js');
  if (!isAuthenticated()) {
    const { showAuthGate } = await import('./auth/auth-ui.js');
    showAuthGate();
    navigate('/');
    return;
  }
  const { needsProfileSetup } = await import('./data/profile-repository.js');
  if (await needsProfileSetup()) { navigate('/profile'); return; }
  const m = await import('./wizard/wizard.js');
  m.clearAndStart();
});

addRoute('/wizard/:step', async (params) => {
  const { isAuthenticated } = await import('./auth/auth.js');
  if (!isAuthenticated()) {
    const { showAuthGate } = await import('./auth/auth-ui.js');
    showAuthGate();
    navigate('/');
    return;
  }
  const { needsProfileSetup } = await import('./data/profile-repository.js');
  if (await needsProfileSetup()) { navigate('/profile'); return; }
  const m = await import('./wizard/wizard.js');
  m.renderWizard(parseInt(params.step, 10));
});

addRoute('/trip/:id', async (params) => {
  const { renderTripDetail } = await import('./components/trip-detail.js');
  renderTripDetail(params.id);
});

addRoute('/admin', async () => {
  const { isAuthenticated } = await import('./auth/auth.js');
  if (!isAuthenticated()) {
    const { showAuthGate } = await import('./auth/auth-ui.js');
    showAuthGate();
    navigate('/');
    return;
  }
  const { renderAdminDashboard } = await import('./admin/admin-dashboard.js');
  renderAdminDashboard();
});

addRoute('/shared/:token', async (params) => {
  const { renderSharedTrip } = await import('./components/shared-trip.js');
  renderSharedTrip(params.token);
});

onNotFound((path) => {
  const safePath = path.split('?')[0].split('&')[0].replace(/[<>"']/g, '');
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

start();

if (import.meta.env.DEV) {
  import('./data/trip-repository.js').then(m => {
    window.__clearAllUserData = m.clearAllUserData;
  });
}

import('./auth/auth.js').then(async ({ initAuth, isAuthenticated, onAuthChange }) => {
  await initAuth();
  renderNav();
  const hash = location.hash.slice(1) || '/';
  const hasOAuthTokens = /(?:^|[&?])(?:access_token|refresh_token)=/.test(hash);
  if (hasOAuthTokens) {
    history.replaceState(null, '', location.pathname + location.search + '#/');
    renderDashboard();
  } else if (hash === '/' && isAuthenticated()) {
    renderDashboard();
  }

  onAuthChange(async (event) => {
    if (event === 'SIGNED_IN') {
      if (/(?:^|[&?])access_token=/.test(location.hash)) {
        history.replaceState(null, '', location.pathname + location.search + '#/');
      }
      renderNav();
      const { needsProfileSetup, fetchProfile } = await import('./data/profile-repository.js');
      if (await needsProfileSetup()) {
        navigate('/profile');
      } else {
        const { setHomeCurrency } = await import('./data/user-prefs.js');
        const { setLocaleFromFlag } = await import('./lib/locale.js');
        const { data: profile } = await fetchProfile();
        if (profile?.home_currency) {
          setHomeCurrency(profile.home_currency, profile.home_currency_symbol || '$');
        }
        if (profile?.home_flag) {
          setLocaleFromFlag(profile.home_flag);
        }
      }
    }
  });
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
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
