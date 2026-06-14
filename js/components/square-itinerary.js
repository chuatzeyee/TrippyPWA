// Square-mode itinerary: a no-scroll, one-activity-per-card view for square
// screens. A horizontal color-coded day rail picks the day; the day's stops
// become a swipeable card deck, and each card after the first shows how you get
// there from the previous stop (the inline transit connector).
//
// This is a self-contained widget: it renders into a host element and rebuilds
// the deck when the day changes. It reuses the trip's existing data shape
// (itinerary_days -> activities with start_time, cost_amount, category,
// venue_name, transport_options / getting_there).

import { buildDeckHtml, mountCardDeck } from '../lib/card-deck.js';

// Trippy's 7-day accent sequence (matches tokens.css --day-N).
const DAY_VARS = ['--day-1', '--day-2', '--day-3', '--day-4', '--day-5', '--day-6', '--day-7'];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dayColorVar(dayNumber) {
  return `var(${DAY_VARS[(dayNumber - 1) % DAY_VARS.length]})`;
}

// One-line transit summary from an activity's transport data, used as the
// inline connector at the top of a card (travel TO this stop).
function transitSummary(activity) {
  const opts = activity.transport_options;
  if (Array.isArray(opts) && opts.length > 0) {
    const o = opts[0];
    const bits = [o.mode, o.duration].filter(Boolean).map(esc);
    return bits.join(' · ') || esc(o.label || 'Getting there');
  }
  if (activity.getting_there) {
    const meta = [activity.transport_mode, activity.transport_duration].filter(Boolean).map(esc);
    return meta.length ? meta.join(' · ') : esc(activity.getting_there);
  }
  return '';
}

function activityCard(activity, opts) {
  const { sym, dayColor, isFirst, index, total, dayLabel, formatCost, catIcon, formatDuration } = opts;
  const time = activity.start_time || '';
  const cost = activity.cost_amount ? formatCost(activity.cost_amount, sym) : '';
  const duration = formatDuration(activity.duration_minutes);
  const lat = Number(activity.latitude);
  const lng = Number(activity.longitude);
  const mapsUrl = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0
    ? `https://maps.google.com/?q=${lat},${lng}` : '';
  const transit = !isFirst ? transitSummary(activity) : '';

  return `
    <div class="sq-itin-card">
      ${transit ? `
        <div class="sq-itin-transit">
          <span class="sq-itin-transit-line"></span>
          <span class="sq-itin-transit-label">${esc(transit)}</span>
        </div>` : ''}
      <div class="sq-itin-card-inner" style="--day-color: ${dayColor}">
        <div class="sq-itin-card-top">
          <span class="sq-itin-time">${time ? esc(time) : ''}</span>
          <span class="sq-itin-step">${dayLabel} · stop ${index + 1}/${total}</span>
        </div>
        <div class="sq-itin-icon">${catIcon(activity.category)}</div>
        <h3 class="sq-itin-title">${esc(activity.title)}</h3>
        ${activity.venue_name ? `<div class="sq-itin-venue">${esc(activity.venue_name)}${mapsUrl ? ` <a href="${mapsUrl}" target="_blank" rel="noopener" class="sq-itin-map">Map</a>` : ''}</div>` : ''}
        ${activity.description ? `<p class="sq-itin-desc">${esc(activity.description)}</p>` : ''}
        ${activity.tips ? `<p class="sq-itin-tip">${esc(activity.tips)}</p>` : ''}
        <div class="sq-itin-meta">
          ${cost ? `<span class="sq-itin-cost">${cost}</span>` : ''}
          ${duration ? `<span class="sq-itin-dur">${duration}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the square itinerary into `host`.
 * @param {HTMLElement} host
 * @param {object} trip
 * @param {Array} days - trip.itinerary_days
 * @param {string} sym - currency symbol
 * @param {{ formatCost: Function, catIcon: Function, formatDuration: Function }} helpers
 * @returns {() => void} cleanup
 */
export function renderSquareItinerary(host, trip, days, sym, helpers) {
  if (!host) return () => {};
  const validDays = (days || []).filter(d => Array.isArray(d.activities) && d.activities.length > 0);
  if (validDays.length === 0) {
    host.innerHTML = '<div class="sq-itin-empty">No activities planned yet.</div>';
    return () => {};
  }

  const rail = validDays.map((d, i) => {
    const color = dayColorVar(d.day_number);
    return `<button class="sq-itin-day" data-day="${i}" style="--day-color: ${color}" aria-label="Day ${d.day_number}">
      <span class="sq-itin-day-dot"></span>Day ${d.day_number}
    </button>`;
  }).join('');

  host.innerHTML = `
    <div class="sq-itin">
      <div class="sq-itin-rail" role="tablist" aria-label="Days">${rail}</div>
      <div class="sq-itin-deck-host"></div>
    </div>
  `;

  const railEl = host.querySelector('.sq-itin-rail');
  const deckHost = host.querySelector('.sq-itin-deck-host');
  let deck = null;

  function showDay(i) {
    const d = validDays[i];
    const acts = d.activities;
    const dayColor = dayColorVar(d.day_number);
    const dayLabel = `Day ${d.day_number}`;
    if (deck) { deck.destroy(); deck = null; }
    const slides = acts.map((a, ai) => activityCard(a, {
      sym, dayColor, isFirst: ai === 0, index: ai, total: acts.length, dayLabel,
      formatCost: helpers.formatCost, catIcon: helpers.catIcon, formatDuration: helpers.formatDuration,
    }));
    deckHost.innerHTML = buildDeckHtml(slides, { deckClass: 'sq-itin-deck', label: dayLabel });
    deck = mountCardDeck(deckHost.querySelector('[data-deck]'), { label: dayLabel });
    railEl.querySelectorAll('.sq-itin-day').forEach((b, bi) => {
      b.classList.toggle('sq-itin-day--active', bi === i);
    });
    const activeBtn = railEl.querySelector(`.sq-itin-day[data-day="${i}"]`);
    activeBtn?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  const onRailClick = (e) => {
    const btn = e.target.closest('.sq-itin-day');
    if (btn) showDay(Number(btn.dataset.day));
  };
  railEl.addEventListener('click', onRailClick);

  showDay(0);

  return () => {
    railEl.removeEventListener('click', onRailClick);
    if (deck) deck.destroy();
  };
}
