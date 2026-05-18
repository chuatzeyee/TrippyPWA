import { addRoute, start, navigate, onNotFound } from './router.js';
import { renderNav } from './components/nav.js';
import { renderDashboard } from './components/dashboard.js';
import { initAuth, isAuthenticated, onAuthChange } from './auth/auth.js';
import { showAuthGate } from './auth/auth-ui.js';
import { needsProfileSetup } from './data/profile-repository.js';

await initAuth();
renderNav();

let _profileChecked = false;
let _needsSetup = false;

async function guardProfileSetup() {
  if (!isAuthenticated()) return false;
  if (!_profileChecked) {
    _needsSetup = await needsProfileSetup();
    _profileChecked = true;
  }
  if (_needsSetup) {
    navigate('/profile');
    return true;
  }
  return false;
}

onAuthChange(async (event) => {
  _profileChecked = false;
  _needsSetup = false;
  if (event === 'SIGNED_IN') {
    renderNav();
    if (await needsProfileSetup()) {
      navigate('/profile');
    } else {
      const { fetchProfile } = await import('./data/profile-repository.js');
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

addRoute('/', () => {
  renderDashboard();
});

addRoute('/profile', async () => {
  if (!isAuthenticated()) { showAuthGate(); navigate('/'); return; }
  const { renderProfileWizard } = await import('./profile/profile-wizard.js');
  renderProfileWizard();
});

addRoute('/wizard', async () => {
  if (!isAuthenticated()) { showAuthGate(); navigate('/'); return; }
  if (await guardProfileSetup()) return;
  import('./wizard/wizard.js').then(m => {
    m.clearAndStart();
  });
});

addRoute('/wizard/:step', async (params) => {
  if (!isAuthenticated()) { showAuthGate(); navigate('/'); return; }
  if (await guardProfileSetup()) return;
  import('./wizard/wizard.js').then(m => m.renderWizard(parseInt(params.step, 10)));
});

addRoute('/trip/:id', async (params) => {
  const { renderTripDetail } = await import('./components/trip-detail.js');
  renderTripDetail(params.id);
});

onNotFound((path) => {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="container" style="padding: var(--sp-16) 0; text-align: center;">
      <div style="font-size: 4rem; margin-bottom: var(--sp-4);">🧭</div>
      <h1 class="text-h1">Lost in transit</h1>
      <p class="text-body" style="color: var(--ink-secondary); margin-top: var(--sp-2);">
        We couldn't find "${path}". Let's get you back on track.
      </p>
      <button class="btn btn--primary btn--pill" style="margin-top: var(--sp-6);" onclick="location.hash='/'">
        Back to Dashboard
      </button>
    </div>
  `;
});

start();

const btt = document.createElement('button');
btt.className = 'back-to-top';
btt.setAttribute('aria-label', 'Back to top');
btt.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>';
document.body.appendChild(btt);
btt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
window.addEventListener('scroll', () => {
  btt.classList.toggle('back-to-top--visible', window.scrollY > 400);
}, { passive: true });
