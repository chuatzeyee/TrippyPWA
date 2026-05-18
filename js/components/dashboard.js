import { navigate } from '../router.js';
import { escapeHtml } from '../data/day-builder.js';
import { getAllTrips } from '../data/registry.js';
import { DESTINATIONS } from '../wizard/destinations.js';
import { isAuthenticated } from '../auth/auth.js';
import { showAuthGate } from '../auth/auth-ui.js';
import { formatNumber, formatWeekdayDate } from '../lib/locale.js';

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
  const status = isGenerating ? 'generating' : getTripStatus(trip);
  const heroStyle = trip.coverImage
    ? `background-image: url('${escapeHtml(trip.coverImage)}')`
    : 'background: linear-gradient(135deg, var(--terracotta-light), var(--teal-light))';

  return `
    <article class="trip-card ${isGenerating ? 'trip-card--generating' : ''} animate-in" style="animation-delay: ${index * 60}ms" data-trip-id="${escapeHtml(trip.id)}">
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
            Planning your itinerary
          </div>
        ` : trip.budget?.total ? `
          <div class="trip-card-budget">
            ${escapeHtml(trip.budget.currencySymbol || '$')}${formatNumber(trip.budget.total)}
            <div class="trip-card-budget-bar">
              <div class="trip-card-budget-fill" style="width: ${Math.min(100, (trip.budget.spent || 0) / trip.budget.total * 100)}%"></div>
            </div>
          </div>
        ` : '<div class="trip-card-budget">Planning...</div>'}
      </div>
    </article>
  `;
}

function renderEmpty() {
  const thumbs = [
    { city: 'Tokyo', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Skyscrapers_of_Shinjuku_2009_January.jpg/500px-Skyscrapers_of_Shinjuku_2009_January.jpg' },
    { city: 'Guangzhou', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Canton_Tower_20241027.jpg/500px-Canton_Tower_20241027.jpg' },
    { city: 'Bali', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/TanahLot_2014.JPG/500px-TanahLot_2014.JPG' },
    { city: 'Zurich', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Altstadt_Z%C3%BCrich_2015.jpg/500px-Altstadt_Z%C3%BCrich_2015.jpg' },
    { city: 'Melbourne', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Melbourne_skyline_sor.jpg/500px-Melbourne_skyline_sor.jpg' },
  ];

  return `
    <div class="dashboard-empty">
      <div class="landing-bg">
        <div class="landing-orb landing-orb--1"></div>
        <div class="landing-orb landing-orb--2"></div>
        <div class="landing-orb landing-orb--3"></div>
        <div class="landing-icons">
          <span class="landing-icon">&#9992;&#65039;</span>
          <span class="landing-icon">&#127759;</span>
          <span class="landing-icon">&#128247;</span>
          <span class="landing-icon">&#9968;&#65039;</span>
          <span class="landing-icon">&#127965;</span>
          <span class="landing-icon">&#128717;&#65039;</span>
          <span class="landing-icon">&#127758;</span>
          <span class="landing-icon">&#128204;</span>
        </div>
      </div>
      <div class="landing-content">
        <div class="landing-logo">
          <svg class="landing-logo-plane" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
          <span class="landing-logo-flaps">${'TRIPPY'.split('').map(ch => `<span class="flap-cell"><span class="flap-face">${ch}</span><span class="flap-top"><span class="flap-top-text">${ch}</span></span><span class="flap-bottom"><span class="flap-bottom-text">${ch}</span></span></span>`).join('')}</span>
        </div>
        <h2 class="landing-title"><span class="landing-title-your">Your</span><span class="landing-title-city">next</span><span class="landing-title-accent">adventure</span></h2>
        <p class="landing-desc">
          Tell us where you want to go. We'll plan the rest.
        </p>
        <div class="landing-cta">
          <button class="btn btn--primary btn--lg btn--pill" data-action="new-trip">
            Plan a Trip
          </button>
        </div>
        <div class="landing-destinations">
          ${thumbs.map(t => `<div class="landing-dest-thumb" style="background-image: url('${t.img}')" data-city="${escapeHtml(t.city)}"></div>`).join('')}
        </div>
        <p class="landing-hint">124 destinations worldwide</p>
      </div>
    </div>
  `;
}

export async function renderDashboard() {
  const app = document.getElementById('app');

  let trips = [];
  if (isAuthenticated()) {
    app.innerHTML = `<div class="dashboard container"><div class="trip-detail-loading">Loading your trips...</div></div>`;
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
        return {
          id: t.id,
          title: t.title,
          emoji: t.emoji || flagImg(dest?.flag, 20) || '🌍',
          status: t.status,
          dates: { start: t.start_date, end: t.end_date },
          dayCount,
          budget: {
            currencySymbol: dest?.currencySymbol || t.budget_currency_symbol || '$',
            total: (t.budget_daily || 0) * (t.travelers || 1) * (dayCount || 7),
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

  const content = trips.length === 0
    ? renderEmpty()
    : `
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

  app.innerHTML = `<div class="dashboard container">${content}</div>`;

  app.addEventListener('click', (e) => {
    const thumb = e.target.closest('.landing-dest-thumb[data-city]');
    if (thumb) {
      if (!isAuthenticated()) { showAuthGate(); return; }
      const dest = DESTINATIONS.find(d => d.name === thumb.dataset.city);
      if (dest) {
        import('../wizard/wizard.js').then(m => m.clearAndStart(dest));
        history.replaceState(null, '', '#/wizard/2');
        return;
      }
    }
    const newTrip = e.target.closest('[data-action="new-trip"]');
    if (newTrip) {
      if (!isAuthenticated()) { showAuthGate(); return; }
      navigate('/wizard');
      return;
    }
    const card = e.target.closest('[data-trip-id]');
    if (card) {
      if (card.classList.contains('trip-card--generating')) return;
      navigate(`/trip/${card.dataset.tripId}`);
    }
  });

  if (trips.some(t => t.status === 'generating')) {
    import('../services/generation-manager.js').then(({ onGenerationUpdate, resumeStaleGenerations }) => {
      resumeStaleGenerations(trips);
      onGenerationUpdate((tripId, genStatus) => {
        const el = app.querySelector(`[data-trip-id="${tripId}"]`);
        if (!el) return;
        if (genStatus.status === 'done') {
          el.classList.remove('trip-card--generating');
          el.classList.add('trip-card--just-generated');
          const shimmer = el.querySelector('.trip-card-gen-shimmer');
          if (shimmer) shimmer.remove();
          const statusEl = el.querySelector('.trip-card-gen-status');
          if (statusEl) {
            statusEl.innerHTML = '<span class="trip-card-gen-ready">Your trip is ready!</span>';
          }
          const dot = el.querySelector('.status-dot');
          if (dot) { dot.className = 'status-dot status-dot--upcoming'; }
        } else if (genStatus.status === 'failed') {
          el.classList.remove('trip-card--generating');
          const shimmer = el.querySelector('.trip-card-gen-shimmer');
          if (shimmer) shimmer.remove();
          const statusEl = el.querySelector('.trip-card-gen-status');
          if (statusEl) {
            statusEl.innerHTML = `<span style="color: var(--error); font-size: 0.85rem;">Generation failed: ${genStatus.error || 'Unknown error'}. Click to retry.</span>`;
          }
          const dot = el.querySelector('.status-dot');
          if (dot) { dot.className = 'status-dot status-dot--past'; }
        }
      });
    });
  }

  const citySpan = app.querySelector('.landing-title-city');
  if (citySpan) {
    let currentText = '';

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

    app.querySelectorAll('.landing-dest-thumb[data-city]').forEach(thumb => {
      thumb.addEventListener('mouseenter', () => flipTo(thumb.dataset.city));
      thumb.addEventListener('mouseleave', () => flipTo('next'));
    });
  }
}
