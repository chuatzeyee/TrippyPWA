import { navigate } from '../router.js';
import { escapeHtml } from '../data/day-builder.js';
import { getAllTrips } from '../data/registry.js';
import { DESTINATIONS } from '../wizard/destinations.js';
import { formatNumber, formatWeekdayDate, formatCityList } from '../lib/locale.js';

function hasLocalSession() {
  try {
    return Object.keys(localStorage).some(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
  } catch { return false; }
}

let _authModule = null;
async function getAuth() {
  if (!_authModule) _authModule = await import('../auth/auth.js');
  return _authModule;
}

function flagImg(code, size = 20) {
  if (!code) return '';
  const w = size <= 20 ? 40 : 80;
  return `<img src="https://flagcdn.com/w${w}/${code}.png" width="${size}" height="${Math.round(size * 0.75)}" alt="" style="border-radius:2px; object-fit:cover;">`;
}

function getTripStatus(trip) {
  if (!trip.dates?.start) return 'planning';
  const now = new Date();
  const start = new Date(trip.dates.start + 'T00:00:00');
  const end = new Date(trip.dates.end + 'T23:59:59');
  if (now < start) return 'upcoming';
  if (now <= end) return 'active';
  return 'past';
}

function formatDates(trip) {
  if (!trip.dates?.start) return 'Dates TBD';
  const dateStr = formatWeekdayDate(trip.dates.start);
  const dayCount = trip.dayCount || 0;
  return `${dateStr}${dayCount > 0 ? ` · ${dayCount} days` : ''}`;
}

function renderTripCard(trip, index) {
  const isGenerating = trip.status === 'generating';
  const isFailed = trip.status === 'failed';
  const status = isGenerating ? 'generating' : isFailed ? 'failed' : getTripStatus(trip);
  const heroStyle = trip.coverImage
    ? `background-image: url('${escapeHtml(trip.coverImage)}')`
    : 'background: linear-gradient(135deg, var(--terracotta-light), var(--teal-light))';

  return `
    <article class="trip-card ${isGenerating ? 'trip-card--generating' : ''} ${isFailed ? 'trip-card--failed' : ''} animate-in" style="animation-delay: ${index * 60}ms" data-trip-id="${escapeHtml(trip.id)}">
      <div class="trip-card-hero" style="${heroStyle}">
        <span class="trip-card-emoji">${trip.emoji || '🌍'}</span>
        ${isGenerating ? '<div class="trip-card-gen-shimmer"></div>' : ''}
        <span class="trip-card-status">
          <span class="status-dot status-dot--${status}"></span>
        </span>
      </div>
      <div class="trip-card-body">
        <h3 class="trip-card-title">${escapeHtml(trip.title)}</h3>
        <div class="trip-card-meta">
          <span>${formatDates(trip)}</span>
        </div>
        ${isGenerating ? `
          <div class="trip-card-gen-status">
            <span class="trip-card-gen-dots"><span></span><span></span><span></span></span>
            <span class="trip-card-gen-label">Planning your itinerary</span>
            <span class="trip-card-gen-eta">Usually takes 1&ndash;2 minutes <span class="trip-card-gen-elapsed" data-gen-elapsed></span></span>
          </div>
        ` : isFailed ? `
          <div class="trip-card-gen-status">
            <span style="color: var(--terracotta); font-size: 0.85rem;">Generation failed. Try again?</span>
            <div class="trip-card-fail-actions">
              <button class="btn btn--secondary btn--sm btn--pill" data-retry-trip="${escapeHtml(trip.id)}">Retry</button>
              <button class="btn btn--ghost btn--sm btn--pill" data-delete-trip="${escapeHtml(trip.id)}">Delete</button>
            </div>
          </div>
        ` : trip.budget?.total ? `
          <div class="trip-card-budget">
            ${escapeHtml(trip.budget.currencySymbol || '$')}${formatNumber(trip.budget.total)}
            <div class="trip-card-budget-bar">
              <div class="trip-card-budget-fill" style="width: ${Math.min(100, (trip.budget.spent || 0) / trip.budget.total * 100)}%"></div>
            </div>
          </div>
        ` : '<div class="trip-card-budget">Planning...</div>'}
        ${status === 'active' ? `<button class="trip-card-now-btn" data-now-trip="${escapeHtml(trip.id)}">Current Activity &rarr;</button>` : ''}
      </div>
    </article>
  `;
}

function renderAuthDashboard(trips) {
  const featured = ['Tokyo', 'Paris', 'Bali', 'Bangkok', 'Barcelona', 'Melbourne', 'Seoul', 'Istanbul', 'New York', 'Kyoto', 'Taipei'];
  const dests = featured.map(n => DESTINATIONS.find(d => d.name === n)).filter(Boolean);

  return `
    <div class="dashboard-merged">
      <div class="dashboard-merged-body">
        <div class="dashboard-header">
          <h1 class="dashboard-greeting">Where to next?</h1>
          <button class="btn btn--primary btn--pill" data-action="new-trip">+ Plan a Trip</button>
        </div>
        ${trips.length > 0 ? `
          <div class="trip-grid">
            ${trips.map((t, i) => renderTripCard(t, i)).join('')}
          </div>
        ` : `
          <div class="dashboard-no-trips">
            <p class="dashboard-no-trips-text">Plan your first trip and we'll take it from there.</p>
          </div>
        `}
        <section class="dashboard-dest-picks">
          <h3 class="landing-section-title">Popular destinations</h3>
          <div class="dest-circle-grid">
            ${dests.map(d => `
              <div class="dest-circle" data-city="${escapeHtml(d.name)}">
                <img class="dest-circle-img" src="${escapeHtml(d.image)}" alt="${escapeHtml(d.name)}" loading="lazy" decoding="async">
                <span class="dest-circle-label">
                  ${d.flag ? `<img src="https://flagcdn.com/w40/${d.flag}.png" width="14" height="10" alt="" style="border-radius:2px; object-fit:cover;">` : ''}
                  ${escapeHtml(d.name)}
                </span>
              </div>
            `).join('')}
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderEmpty() {
  const featured = ['Tokyo', 'Paris', 'Bali', 'Bangkok', 'Barcelona', 'Melbourne', 'Seoul', 'Istanbul', 'New York', 'Kyoto', 'Taipei'];
  const dests = featured.map(n => DESTINATIONS.find(d => d.name === n)).filter(Boolean);
  const flap = ch => `<span class="flap-cell"><span class="flap-face">${ch}</span><span class="flap-top"><span class="flap-top-text">${ch}</span></span><span class="flap-bottom"><span class="flap-bottom-text">${ch}</span></span></span>`;

  return `
    <div class="dashboard-empty">
      <div class="landing-scanlines"></div>
      <div class="landing-bg">
        <div class="landing-grid-dots"></div>
      </div>
      <section class="landing-hero">
        <div class="landing-coords">1.3521&deg;N 103.8198&deg;E &mdash; SIN &rarr; anywhere</div>
        <div class="landing-logo">
          <svg class="landing-logo-plane" width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
          <span class="landing-logo-flaps landing-glitch" data-text="TRIPPY">${'TRIPPY'.split('').map(flap).join('')}</span>
        </div>
        <h1 class="landing-headline">
          <span class="landing-hl-your">Your</span>
          <span class="landing-hl-city">${'next'.split('').map(flap).join('')}</span>
          <span class="landing-hl-accent">adventure<span class="landing-cursor"></span></span>
        </h1>
        <p class="landing-tagline">Trip planning in minutes, not hours.<br>Pick a destination, set your style and we'll craft your plans.</p>
        <div class="landing-cta">
          <button class="btn btn--primary btn--lg btn--pill landing-cta-btn" data-action="new-trip"><svg class="landing-cta-google" width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09a6.97 6.97 0 010-4.17V7.07H2.18a11.01 11.01 0 000 9.86l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Sign in to Start Planning</button>
        </div>
        <div class="landing-proof">
          <span class="landing-proof-item"><strong>${DESTINATIONS.length}+</strong> destinations</span>
          <span class="landing-proof-dot"></span>
          <span class="landing-proof-item"><strong>7</strong> continents</span>
          <span class="landing-proof-dot"></span>
          <span class="landing-proof-item"><span class="landing-ai-badge"><span class="landing-ai-dot"></span> AI-Powered</span></span>
        </div>
        <button class="landing-scroll-hint" onclick="this.closest('.landing-hero').nextElementSibling.scrollIntoView({behavior:'smooth'})">
          <span class="landing-scroll-hint-label">Scroll for more</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
        </button>
      </section>

      <section class="landing-features landing-reveal">
        <div class="landing-feature">
          <div class="landing-feature-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a1 1 0 00-1.41 0L1.29 18.96a1 1 0 000 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05a1 1 0 000-1.41l-2.33-2.35z"/></svg></div>
          <h3 class="landing-feature-title">AI Itineraries</h3>
          <p class="landing-feature-desc">Day-by-day plans with activities, timings, dining spots, and insider tips</p>
        </div>
        <div class="landing-feature">
          <div class="landing-feature-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg></div>
          <h3 class="landing-feature-title">Smart Budgets</h3>
          <p class="landing-feature-desc">Real cost estimates in local currency for flights, stays, food, and activities</p>
        </div>
        <div class="landing-feature">
          <div class="landing-feature-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1c.61 0 1.1-.49 1.1-1.1s-.49-1.1-1.1-1.1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z"/></svg></div>
          <h3 class="landing-feature-title">Your Style</h3>
          <p class="landing-feature-desc">Pace, cuisine, nightlife, exploration. Every trip adapts to how you travel</p>
        </div>
        <div class="landing-feature">
          <div class="landing-feature-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/></svg></div>
          <h3 class="landing-feature-title">${DESTINATIONS.length}+ Destinations</h3>
          <p class="landing-feature-desc">From Tokyo to Reykjavik, with cultural tips, visa info, and local insights</p>
        </div>
      </section>

      <section class="landing-steps landing-reveal">
        <h3 class="landing-section-title">How it works</h3>
        <div class="landing-steps-row">
          <div class="landing-step">
            <span class="landing-step-num">1</span>
            <h4 class="landing-step-title">Choose</h4>
            <p class="landing-step-desc">Pick a destination and your travel dates</p>
          </div>
          <div class="landing-step-arrow"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg></div>
          <div class="landing-step">
            <span class="landing-step-num">2</span>
            <h4 class="landing-step-title">Customize</h4>
            <p class="landing-step-desc">Set budget, pace, and travel style</p>
          </div>
          <div class="landing-step-arrow"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg></div>
          <div class="landing-step">
            <span class="landing-step-num">3</span>
            <h4 class="landing-step-title">Go</h4>
            <p class="landing-step-desc">Get a full itinerary in seconds</p>
          </div>
        </div>
      </section>

      <section class="landing-explore landing-reveal">
        <h3 class="landing-section-title">Popular destinations</h3>
        <div class="dest-circle-grid">
          ${dests.map(d => `
            <div class="dest-circle" data-city="${escapeHtml(d.name)}">
              <img class="dest-circle-img" src="${escapeHtml(d.image)}" alt="${escapeHtml(d.name)}" loading="lazy" decoding="async">
              <span class="dest-circle-label">
                ${d.flag ? `<img src="https://flagcdn.com/w40/${d.flag}.png" width="14" height="10" alt="" style="border-radius:2px; object-fit:cover;">` : ''}
                ${escapeHtml(d.name)}
              </span>
            </div>
          `).join('')}
        </div>
      </section>
    </div>
  `;
}

function renderSkeleton() {
  const card = `
    <div class="skel-card">
      <div class="skel-card-hero skel-shimmer"></div>
      <div class="skel-card-body">
        <div class="skel-line skel-line--title skel-shimmer"></div>
        <div class="skel-line skel-line--meta skel-shimmer"></div>
        <div class="skel-line skel-line--budget skel-shimmer"></div>
      </div>
    </div>`;
  return `
    <div class="dashboard container">
      <div class="dashboard-merged">
        <div class="dashboard-merged-body">
          <div class="dashboard-header">
            <div class="skel-line skel-line--heading skel-shimmer"></div>
            <div class="skel-btn skel-shimmer"></div>
          </div>
          <div class="trip-grid">
            ${card}${card}${card}
          </div>
        </div>
      </div>
    </div>`;
}

let _dashboardTrips = [];
let _clickHandlerBound = false;
let _genListenerBound = false;
let _elapsedTimer = null;
const _genStartTimes = new Map();

function startElapsedTicker(app, trips) {
  const generating = trips.filter(t => t.status === 'generating');
  for (const t of generating) {
    if (!_genStartTimes.has(t.id)) _genStartTimes.set(t.id, Date.now());
  }
  if (_elapsedTimer) { clearInterval(_elapsedTimer); _elapsedTimer = null; }
  if (generating.length === 0) return;

  const tick = () => {
    const root = document.getElementById('app');
    if (!root) return;
    let anyVisible = false;
    for (const t of generating) {
      const card = root.querySelector(`[data-trip-id="${t.id}"]`);
      const span = card?.querySelector('[data-gen-elapsed]');
      if (!span) continue;
      if (!card.classList.contains('trip-card--generating')) continue;
      anyVisible = true;
      const start = _genStartTimes.get(t.id) || Date.now();
      const secs = Math.floor((Date.now() - start) / 1000);
      const mm = Math.floor(secs / 60);
      const ss = String(secs % 60).padStart(2, '0');
      span.textContent = `· ${mm}:${ss}`;
    }
    if (!anyVisible) { clearInterval(_elapsedTimer); _elapsedTimer = null; }
  };
  tick();
  _elapsedTimer = setInterval(tick, 1000);
}

export async function renderDashboard() {
  const app = document.getElementById('app');
  let trips = [];
  let skipRender = false;

  const preRendered = app.querySelector('[data-prerendered]');
  if (preRendered && !hasLocalSession()) {
    preRendered.removeAttribute('data-prerendered');
    const skel = app.querySelector('.app-skel');
    if (skel) skel.remove();
    skipRender = true;
  }

  if (!skipRender) {
  let loggedIn = false;
  const hasSession = hasLocalSession();
  if (hasSession) {
    try { loggedIn = (await getAuth()).isAuthenticated(); } catch {}
  }
  const probablyLoggedIn = !loggedIn && hasSession;
  if (loggedIn || probablyLoggedIn) {
    app.innerHTML = renderSkeleton();
    if (probablyLoggedIn) return;
    try {
      const { fetchAllTrips } = await import('../data/trip-repository.js');
      const { data } = await fetchAllTrips();
      trips = (data || []).map(t => {
        const ws = t.wizard_state;
        const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
        const itineraryCount = Array.isArray(t.itinerary_days) ? t.itinerary_days.length : 0;
        const dateDayCount = t.start_date && t.end_date
          ? Math.round((new Date(t.end_date) - new Date(t.start_date)) / 86400000) + 1
          : 0;
        const dayCount = itineraryCount || dateDayCount;
        let activityTotal = 0;
        if (Array.isArray(t.itinerary_days)) {
          for (const day of t.itinerary_days) {
            if (Array.isArray(day.activities)) {
              for (const a of day.activities) activityTotal += (a.cost_amount || 0);
            }
          }
        }
        const budgetEstimate = (t.budget_daily || 0) * (t.travelers || 1) * (dayCount || 7);
        // For multi-city, show "A, B & C" from the wizard state rather than the
        // stored title (which the AI may have set to "A to B").
        const displayTitle = ws?.multiCity && ws?.destinations?.length > 0
          ? formatCityList(ws.destinations.map(d => d.name))
          : t.title;
        return {
          id: t.id,
          title: displayTitle,
          emoji: t.emoji || flagImg(dest?.flag, 20) || '🌍',
          status: t.status,
          dates: { start: t.start_date, end: t.end_date },
          dayCount,
          budget: {
            currencySymbol: dest?.currencySymbol || t.budget_currency_symbol || '$',
            total: activityTotal > 0 ? activityTotal : budgetEstimate,
            spent: 0
          },
          coverImage: t.cover_image || dest?.image || ''
        };
      });
    } catch {
      trips = [];
    }
  } else {
    trips = getAllTrips();
  }

  let content;
  if (loggedIn || probablyLoggedIn) {
    content = renderAuthDashboard(trips);
  } else if (trips.length === 0) {
    content = renderEmpty();
  } else {
    content = `
      <div class="dashboard-header">
        <h1 class="dashboard-greeting">Where to next?</h1>
        <button class="btn btn--primary btn--pill" data-action="new-trip">
          + Plan a Trip
        </button>
      </div>
      <div class="trip-grid">
        ${trips.map((t, i) => renderTripCard(t, i)).join('')}
      </div>
    `;
  }

  app.innerHTML = `<div class="dashboard container">${content}</div>`;
  }

  _dashboardTrips = trips;

  if (!_clickHandlerBound) {
  _clickHandlerBound = true;
  app.addEventListener('click', async (e) => {
    const destCard = e.target.closest('.dest-circle[data-city]');
    if (destCard) {
      const auth = await getAuth();
      if (!auth.isAuthenticated()) { const { showAuthGate } = await import('../auth/auth-ui.js'); showAuthGate(); return; }
      const dest = DESTINATIONS.find(d => d.name === destCard.dataset.city);
      if (dest) {
        import('../wizard/wizard.js').then(m => m.clearAndStart(dest));
        history.replaceState(null, '', '#/wizard/2');
        return;
      }
    }
    const newTrip = e.target.closest('[data-action="new-trip"]');
    if (newTrip) {
      const auth = await getAuth();
      if (!auth.isAuthenticated()) {
        if (newTrip.classList.contains('landing-cta-btn')) {
          const { signInWithGoogle } = await import('../auth/auth.js');
          signInWithGoogle();
        } else {
          const { showAuthGate } = await import('../auth/auth-ui.js');
          showAuthGate();
        }
        return;
      }
      navigate('/wizard');
      return;
    }
    const retryBtn = e.target.closest('[data-retry-trip]');
    if (retryBtn) {
      e.stopPropagation();
      const tripId = retryBtn.dataset.retryTrip;
      const trip = _dashboardTrips.find(t => t.id === tripId);
      if (trip) {
        const { updateTripStatus } = await import('../data/trip-repository.js');
        await updateTripStatus(tripId, 'generating');
        const { startGeneration } = await import('../services/generation-manager.js');
        const { fetchTripById } = await import('../data/trip-repository.js');
        const { data: fullTrip } = await fetchTripById(tripId);
        if (fullTrip?.wizard_state) {
          startGeneration(tripId, fullTrip.wizard_state);
        }
        renderDashboard();
      }
      return;
    }
    const deleteBtn = e.target.closest('[data-delete-trip]');
    if (deleteBtn) {
      e.stopPropagation();
      const tripId = deleteBtn.dataset.deleteTrip;
      const { deleteTrip } = await import('../data/trip-repository.js');
      await deleteTrip(tripId);
      renderDashboard();
      return;
    }
    const nowBtn = e.target.closest('[data-now-trip]');
    if (nowBtn) {
      e.stopPropagation();
      navigate(`/trip/${nowBtn.dataset.nowTrip}?today=1`);
      return;
    }
    const card = e.target.closest('[data-trip-id]');
    if (card) {
      if (card.classList.contains('trip-card--generating') || card.classList.contains('trip-card--failed')) return;
      navigate(`/trip/${card.dataset.tripId}`);
    }
  });
  }

  if (trips.some(t => t.status === 'generating')) {
    import('../services/generation-manager.js').then(({ onGenerationUpdate, resumeStaleGenerations }) => {
      resumeStaleGenerations(trips);
      if (_genListenerBound) return;
      _genListenerBound = true;
      onGenerationUpdate((tripId, genStatus) => {
        const el = document.getElementById('app')?.querySelector(`[data-trip-id="${tripId}"]`);
        if (!el || !genStatus) return;
        if (genStatus.status === 'done') {
          el.classList.remove('trip-card--generating');
          el.classList.add('trip-card--just-generated');
          el.querySelector('.trip-card-gen-shimmer')?.remove();
          const statusEl = el.querySelector('.trip-card-gen-status');
          if (statusEl) statusEl.innerHTML = '<span class="trip-card-gen-ready">Your trip is ready!</span>';
          const dot = el.querySelector('.status-dot');
          if (dot) dot.className = 'status-dot status-dot--upcoming';
        } else if (genStatus.status === 'failed') {
          el.classList.remove('trip-card--generating');
          el.querySelector('.trip-card-gen-shimmer')?.remove();
          const statusEl = el.querySelector('.trip-card-gen-status');
          if (statusEl) {
            statusEl.innerHTML = `
              <span style="color: var(--terracotta); font-size: 0.85rem;">${escapeHtml(genStatus.error || 'Generation failed. Try again?')}</span>
              <div class="trip-card-fail-actions">
                <button class="btn btn--secondary btn--sm btn--pill" data-retry-trip="${escapeHtml(tripId)}">Retry</button>
                <button class="btn btn--ghost btn--sm btn--pill" data-delete-trip="${escapeHtml(tripId)}">Delete</button>
              </div>`;
          }
          el.classList.add('trip-card--failed');
          const dot = el.querySelector('.status-dot');
          if (dot) dot.className = 'status-dot status-dot--failed';
        } else if (genStatus.status === 'generating' && genStatus.slow) {
          const label = el.querySelector('.trip-card-gen-label');
          if (label) label.textContent = 'Still working on it';
          const eta = el.querySelector('.trip-card-gen-eta');
          if (eta) eta.innerHTML = 'Taking longer than usual &mdash; hang tight <span class="trip-card-gen-elapsed" data-gen-elapsed></span>';
        }
      });
    });
  }

  startElapsedTicker(app, trips);

  const deferWork = (fn) => (typeof requestIdleCallback === 'function') ? requestIdleCallback(fn) : setTimeout(fn, 1);

  deferWork(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('landing-reveal--visible');
      });
    }, { threshold: 0.15 });
    app.querySelectorAll('.landing-reveal').forEach(el => observer.observe(el));
  });

  const citySpan = app.querySelector('.landing-hl-city');
  if (citySpan) {
    let currentText = '';
    let hovered = false;
    let cycleTimer = null;

    const buildCell = (ch) => {
      if (ch === ' ') return '<span class="flap-cell flap-cell--space"></span>';
      const display = escapeHtml(ch);
      return `<span class="flap-cell">
        <span class="flap-face">${display}</span>
        <span class="flap-top"><span class="flap-top-text">${display}</span></span>
        <span class="flap-bottom"><span class="flap-bottom-text">${display}</span></span>
      </span>`;
    };

    const setImmediate = (text) => {
      currentText = text;
      citySpan.innerHTML = text.split('').map(buildCell).join('');
    };

    const flipTo = (text) => {
      if (text === currentText) return;
      const maxLen = Math.max(currentText.length, text.length);
      const padded = text.padEnd(maxLen);
      const oldPadded = currentText.padEnd(maxLen);
      currentText = text;

      citySpan.innerHTML = '';
      for (let i = 0; i < maxLen; i++) {
        const oldCh = oldPadded[i] || ' ';
        const newCh = padded[i];
        if (newCh === ' ' && i >= text.length) continue;

        const cell = document.createElement('span');
        cell.className = newCh === ' ' ? 'flap-cell flap-cell--space' : 'flap-cell';
        if (newCh === ' ') { citySpan.appendChild(cell); continue; }

        const oldDisplay = oldCh === ' ' ? '&nbsp;' : escapeHtml(oldCh);
        const newDisplay = escapeHtml(newCh);

        cell.innerHTML = `
          <span class="flap-face">${oldDisplay}</span>
          <span class="flap-top"><span class="flap-top-text">${oldDisplay}</span></span>
          <span class="flap-bottom"><span class="flap-bottom-text">${newDisplay}</span></span>
        `;
        citySpan.appendChild(cell);

        const delay = i * 50;
        setTimeout(() => {
          const top = cell.querySelector('.flap-top');
          const bottom = cell.querySelector('.flap-bottom');
          const face = cell.querySelector('.flap-face');
          top.classList.add('flap-flip-out');
          setTimeout(() => {
            face.innerHTML = newDisplay;
            top.querySelector('.flap-top-text').innerHTML = newDisplay;
            top.classList.remove('flap-flip-out');
            bottom.classList.add('flap-flip-in');
            setTimeout(() => bottom.classList.remove('flap-flip-in'), 200);
          }, 150);
        }, delay);
      }
    };

    setImmediate('next');

    deferWork(() => {
      const cycleNames = ['Tokyo', 'Paris', 'Bali', 'Barcelona', 'Seoul', 'New York', 'Bangkok', 'Kyoto', 'next'];
      let cycleIdx = 0;
      const startCycle = () => {
        clearInterval(cycleTimer);
        cycleTimer = setInterval(() => {
          if (hovered) return;
          flipTo(cycleNames[cycleIdx]);
          cycleIdx = (cycleIdx + 1) % cycleNames.length;
        }, 2800);
      };
      startCycle();

      app.querySelectorAll('.dest-circle[data-city]').forEach(card => {
        card.addEventListener('mouseenter', () => { hovered = true; flipTo(card.dataset.city); });
        card.addEventListener('mouseleave', () => { hovered = false; flipTo('next'); startCycle(); });
      });
    });
  }
}
