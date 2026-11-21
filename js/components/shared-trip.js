import { fetchSharedTrip, toSharedView } from '../data/share-repository.js';
import { formatNumber, formatTempRange, formatWeekdayDate, to12h } from '../lib/locale.js';
import { canConvert, convert } from '../data/currencies.js';
import { getHomeCurrency } from '../data/user-prefs.js';
import { escapeHtml as esc } from '../data/day-builder.js';

const CATEGORY_MAP = {
  food: '🍽', restaurant: '🍽', dining: '🍽', 'food & drink': '🍽',
  breakfast: '☕', lunch: '🍽', dinner: '🍷', coffee: '☕', cafe: '☕',
  culture: '🏛', museum: '🏛', art: '🎨', history: '🏛',
  nature: '🌿', park: '🌳', garden: '🌺', beach: '🏖',
  shopping: '🛍', market: '🛍', nightlife: '🍸', bar: '🍸',
  wellness: '💆', spa: '💆', sightseeing: '📸', adventure: '🏔',
  transport: '🚗', flight: '✈️', hotel: '🏨', accommodation: '🏨',
};

const CURRENCY_CODE = /^[A-Z]{3}$/;

// Each activity is labelled with its OWN currency (falling back to the trip's),
// and the viewer's home-currency equivalent is added only when both currencies
// can really be converted. Never shows an unconverted amount as home currency.
function costStr(amount, currency, tripCurrency) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  const code = [currency, tripCurrency].map(c => String(c || '').toUpperCase()).find(c => CURRENCY_CODE.test(c)) || '';
  const own = `${formatNumber(Math.round(n))}${code ? ` ${code}` : ''}`;
  const home = getHomeCurrency();
  if (code && home?.code && home.code !== code && canConvert(code) && canConvert(home.code)) {
    return `${own} (about ${formatNumber(convert(n, code, home.code))} ${home.code})`;
  }
  return own;
}

export function weatherBadge(w) {
  if (!w?.condition) return '';
  const cond = w.condition.toLowerCase();
  let icon = '☀️';
  if (cond.includes('rain') || cond.includes('shower')) icon = '🌧';
  else if (cond.includes('cloud') || cond.includes('overcast')) icon = '☁️';
  else if (cond.includes('storm') || cond.includes('thunder')) icon = '⛈';
  else if (cond.includes('snow')) icon = '❄️';
  else if (cond.includes('fog') || cond.includes('mist')) icon = '🌫';
  else if (cond.includes('partly') || cond.includes('partial')) icon = '⛅';
  const range = formatTempRange(w.lowC, w.highC, { style: 'slash' });
  return `<span class="td-weather">${icon}${range ? ` ${esc(range)}` : ''}</span>`;
}

export async function renderSharedTrip(token) {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="container" style="padding:var(--sp-16) 0;text-align:center"><div class="adm-loading">Loading shared trip...</div></div>';

  const { data: trip, error } = await fetchSharedTrip(token);

  if (error || !trip) {
    app.innerHTML = `
      <div class="container" style="padding:var(--sp-16) 0;text-align:center">
        <div style="font-size:4rem;margin-bottom:var(--sp-4)">🔗</div>
        <h1 class="text-h1">Share link not found</h1>
        <p class="text-body" style="color:var(--ink-secondary);margin-top:var(--sp-2)">${esc(error || 'This itinerary may have been unshared or deleted.')}</p>
        <button class="btn btn--primary btn--pill" style="margin-top:var(--sp-6)" data-go="/">Go to Trippy</button>
      </div>`;
    bindNav(app);
    return;
  }

  renderReadView(app, trip, { mode: 'shared' });
}

// The same clean reader layout, for the OWNER (feedback: "loved the share view,
// offer it in the creator page too"). Fetches the trip normally, no token.
export async function renderOwnerReadView(tripId) {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="container" style="padding:var(--sp-16) 0;text-align:center"><div class="adm-loading">Loading...</div></div>';
  const { fetchTripById } = await import('../data/trip-repository.js');
  const { data: trip } = await fetchTripById(tripId);
  if (!trip) { location.hash = `/trip/${tripId}`; return; }
  renderReadView(app, toSharedView(trip), { mode: 'owner', tripId });
}

// Buttons navigate through data attributes instead of inline onclick handlers.
function bindNav(root) {
  root.querySelectorAll('[data-go]').forEach(btn => {
    btn.addEventListener('click', () => { location.hash = btn.dataset.go; });
  });
}

function renderReadView(app, trip, { mode, tripId }) {
  const days = trip.itinerary_days || [];
  const ownerName = trip.owner?.display_name || 'A Trippy traveler';
  const dateRange = trip.start_date && trip.end_date
    ? `${formatWeekdayDate(trip.start_date)} to ${formatWeekdayDate(trip.end_date)}`
    : `${days.length} day${days.length === 1 ? '' : 's'}`;
  const travelers = trip.travelers || 1;

  let daysHtml = '';
  for (const day of days) {
    let activitiesHtml = '';
    for (const a of day.activities || []) {
      const catEmoji = CATEGORY_MAP[a.category?.toLowerCase()] || CATEGORY_MAP[a.title?.toLowerCase()] || '📍';
      const cost = costStr(a.cost_amount, a.cost_currency, trip.currency);
      const minutes = Number.isFinite(a.duration_minutes) && a.duration_minutes > 0 ? Math.round(a.duration_minutes) : 0;

      activitiesHtml += `
        <div class="shared-activity">
          <div class="shared-activity-time">${esc(to12h(a.start_time))}</div>
          <div class="shared-activity-body">
            <div class="shared-activity-title">${catEmoji} ${esc(a.title)}</div>
            ${a.venue_name ? `<div class="shared-activity-venue">${esc(a.venue_name)}</div>` : ''}
            ${a.description ? `<div class="shared-activity-desc">${esc(a.description)}</div>` : ''}
            <div class="shared-activity-meta">
              ${minutes ? `<span>${minutes} min</span>` : ''}
              ${cost ? `<span>${esc(cost)}</span>` : ''}
              ${a.transport_label ? `<span>${esc(a.transport_label)}</span>` : ''}
            </div>
            ${a.tips ? `<div class="shared-activity-tips">${esc(a.tips)}</div>` : ''}
          </div>
        </div>`;
    }

    daysHtml += `
      <div class="shared-day">
        <div class="shared-day-header">
          <h2 class="text-h2">${esc(day.title || `Day ${day.day_number}`)}</h2>
          <div class="shared-day-meta">
            ${day.date ? `<span>${esc(formatWeekdayDate(day.date))}</span>` : ''}
            ${weatherBadge(day.weather)}
          </div>
          ${day.theme ? `<p class="shared-day-theme">${esc(day.theme)}</p>` : ''}
        </div>
        <div class="shared-activities">${activitiesHtml}</div>
      </div>`;
  }

  // Stays: name, area, price band, highlights and badge only. Booking refs,
  // addresses and links are never part of the shared view.
  const stays = trip.extras?.accommodation || [];
  const extrasHtml = stays.length ? `
      <div class="shared-section">
        <h2 class="text-h2">Where to Stay</h2>
        <div class="shared-accom-grid">
          ${stays.map(a => `
            <div class="shared-accom-card">
              ${a.badge ? `<span class="shared-accom-badge">${esc(a.badge)}</span>` : ''}
              <h3 class="text-h3">${esc(a.name)}</h3>
              <p class="text-small" style="color:var(--ink-secondary)">${esc(a.area)}</p>
              <p class="text-small" style="color:var(--amber)">${esc(a.priceRange)}</p>
              ${a.highlights ? `<p class="text-caption" style="color:var(--ink-ghost)">${esc(a.highlights)}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </div>` : '';

  const isOwner = mode === 'owner';
  app.innerHTML = `
    <div class="container shared-trip">
      <div class="shared-banner">
        <div class="shared-banner-badge">${isOwner ? 'Reader View' : 'Shared Itinerary'}</div>
        <h1 class="text-hero">${esc(trip.emoji)} ${esc(trip.title)}</h1>
        <p class="shared-banner-meta">${esc(dateRange)}, ${travelers} traveler${travelers > 1 ? 's' : ''}</p>
        ${isOwner ? '' : `<p class="shared-banner-by">Planned by ${esc(ownerName)}</p>`}
      </div>

      <div class="shared-days">${daysHtml}</div>
      ${extrasHtml}

      <div class="shared-cta">
        ${isOwner
          ? `<button class="btn btn--primary btn--pill btn--lg" data-go="${esc(`/trip/${tripId}?today=0`)}">Back to full view</button>`
          : `<p class="text-body" style="color:var(--ink-secondary)">Want to plan your own trip?</p>
             <button class="btn btn--primary btn--pill btn--lg" data-go="/">Try Trippy</button>`}
      </div>
    </div>`;
  bindNav(app);
}
