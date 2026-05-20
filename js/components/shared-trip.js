import { fetchSharedTrip } from '../data/share-repository.js';
import { formatNumber, formatWeekdayDate } from '../lib/locale.js';
import { convert } from '../data/currencies.js';
import { getHomeCurrency } from '../data/user-prefs.js';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

const CATEGORY_MAP = {
  food: '🍽', restaurant: '🍽', dining: '🍽', 'food & drink': '🍽',
  breakfast: '☕', lunch: '🍽', dinner: '🍷', coffee: '☕', cafe: '☕',
  culture: '🏛', museum: '🏛', art: '🎨', history: '🏛',
  nature: '🌿', park: '🌳', garden: '🌺', beach: '🏖',
  shopping: '🛍', market: '🛍', nightlife: '🍸', bar: '🍸',
  wellness: '💆', spa: '💆', sightseeing: '📸', adventure: '🏔',
  transport: '🚗', flight: '✈️', hotel: '🏨', accommodation: '🏨',
};

function costStr(amount, currency) {
  if (!amount) return '';
  const home = getHomeCurrency();
  if (home?.code && home.code !== currency) {
    const converted = convert(amount, currency, home.code);
    if (converted !== null) return `~${formatNumber(Math.round(converted))} ${home.code}`;
  }
  return `${formatNumber(amount)} ${currency || ''}`;
}

function weatherBadge(w) {
  if (!w?.condition) return '';
  const cond = (w.condition || '').toLowerCase();
  let icon = '☀️';
  if (cond.includes('rain') || cond.includes('shower')) icon = '🌧';
  else if (cond.includes('cloud') || cond.includes('overcast')) icon = '☁️';
  else if (cond.includes('storm') || cond.includes('thunder')) icon = '⛈';
  else if (cond.includes('snow')) icon = '❄️';
  else if (cond.includes('fog') || cond.includes('mist')) icon = '🌫';
  else if (cond.includes('partly') || cond.includes('partial')) icon = '⛅';
  return `<span class="td-weather">${icon} ${w.highC || ''}/${w.lowC || ''}°C</span>`;
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
        <button class="btn btn--primary btn--pill" style="margin-top:var(--sp-6)" onclick="location.hash='/'">Go to Trippy</button>
      </div>`;
    return;
  }

  const days = trip.itinerary_days || [];
  const ownerName = trip.owner?.display_name || 'A Trippy traveler';
  const dateRange = trip.start_date && trip.end_date
    ? `${formatWeekdayDate(trip.start_date)} - ${formatWeekdayDate(trip.end_date)}`
    : `${days.length} days`;

  let daysHtml = '';
  for (const day of days) {
    const activities = day.activities || [];
    let activitiesHtml = '';
    for (const a of activities) {
      const catEmoji = CATEGORY_MAP[a.category?.toLowerCase()] || CATEGORY_MAP[a.title?.toLowerCase()] || '📍';
      const cost = costStr(a.cost_amount, a.cost_currency);

      activitiesHtml += `
        <div class="shared-activity">
          <div class="shared-activity-time">${esc(a.start_time || '')}</div>
          <div class="shared-activity-body">
            <div class="shared-activity-title">${catEmoji} ${esc(a.title)}</div>
            ${a.venue_name ? `<div class="shared-activity-venue">${esc(a.venue_name)}</div>` : ''}
            ${a.description ? `<div class="shared-activity-desc">${esc(a.description)}</div>` : ''}
            <div class="shared-activity-meta">
              ${a.duration_minutes ? `<span>${a.duration_minutes} min</span>` : ''}
              ${cost ? `<span>${cost}</span>` : ''}
              ${a.transport_options?.length ? `<span>${esc(a.transport_options[0].label || a.transport_options[0].mode)}</span>` : ''}
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
            ${day.date ? `<span>${formatWeekdayDate(day.date)}</span>` : ''}
            ${weatherBadge(day.weather)}
          </div>
          ${day.theme ? `<p class="shared-day-theme">${esc(day.theme)}</p>` : ''}
        </div>
        <div class="shared-activities">${activitiesHtml}</div>
      </div>`;
  }

  const extras = trip.extras || {};
  let extrasHtml = '';

  if (extras.accommodation?.length) {
    extrasHtml += `
      <div class="shared-section">
        <h2 class="text-h2">Where to Stay</h2>
        <div class="shared-accom-grid">
          ${extras.accommodation.map(a => `
            <div class="shared-accom-card">
              ${a.badge ? `<span class="shared-accom-badge">${esc(a.badge)}</span>` : ''}
              <h3 class="text-h3">${esc(a.name)}</h3>
              <p class="text-small" style="color:var(--ink-secondary)">${esc(a.area || '')}</p>
              <p class="text-small" style="color:var(--amber)">${esc(a.priceRange || '')}</p>
              ${a.highlights ? `<p class="text-caption" style="color:var(--ink-ghost)">${esc(typeof a.highlights === 'string' ? a.highlights : a.highlights.join(', '))}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  app.innerHTML = `
    <div class="container shared-trip">
      <div class="shared-banner">
        <div class="shared-banner-badge">Shared Itinerary</div>
        <h1 class="text-hero">${esc(trip.emoji)} ${esc(trip.title)}</h1>
        <p class="shared-banner-meta">${dateRange} · ${trip.travelers || 1} traveler${(trip.travelers || 1) > 1 ? 's' : ''}</p>
        <p class="shared-banner-by">Planned by ${esc(ownerName)}</p>
      </div>

      <div class="shared-days">${daysHtml}</div>
      ${extrasHtml}

      <div class="shared-cta">
        <p class="text-body" style="color:var(--ink-secondary)">Want to plan your own trip?</p>
        <button class="btn btn--primary btn--pill btn--lg" onclick="location.hash='/'">Try Trippy</button>
      </div>
    </div>`;
}
