// Tap-for-alternatives: an "Alternatives" button on each activity card asks
// Gemini for 2-3 real nearby swaps; tapping a chip replaces the activity in
// place (DB write + in-memory update + card re-render by the caller).
import { supabase } from '../lib/supabase.js';
import { updateActivityById } from '../data/trip-repository.js';
import { withLocalWrite } from '../data/collab-repository.js';
import { escapeHtml } from '../data/day-builder.js';
import { showToast } from './toast.js';
import { logger } from '../lib/logger.js';

// All venue names already on the trip, so suggestions never repeat them.
function usedVenues(trip) {
  const out = [];
  for (const day of trip.itinerary_days || []) {
    for (const a of day.activities || []) if (a.venue_name) out.push(a.venue_name);
  }
  return out;
}

// Alternatives are priced in the activity's own currency (the trip's when it
// has none), so the cost sent, the cost returned and the stored cost_currency
// always agree, whatever currency the activity was imported or planned in.
function activityCurrency(trip, activity) {
  const own = String(activity?.cost_currency || '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(own)) return own;
  const ws = trip.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  return String(dest?.currencyCode || trip.budget_currency || 'USD').toUpperCase();
}

async function fetchAlternatives(trip, activity, currency) {
  const ws = trip.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  const { data, error } = await supabase.functions.invoke('suggest-alternatives', {
    body: {
      activity: {
        title: activity.title, venue_name: activity.venue_name, category: activity.category,
        start_time: activity.start_time, cost_amount: activity.cost_amount,
        latitude: activity.latitude, longitude: activity.longitude,
      },
      destination: dest?.name || trip.title || '',
      currency,
      usedVenues: usedVenues(trip),
    },
  });
  if (error) return { alternatives: null, notice: await dailyLimitText(error) };
  return { alternatives: data?.alternatives || null, notice: '' };
}

// Past the daily limit the edge function answers 429 with a readable message.
async function dailyLimitText(error) {
  if (error?.context?.status !== 429) return '';
  try {
    const body = await error.context.json();
    return typeof body?.error === 'string' ? body.error : '';
  } catch {
    return '';
  }
}

// Applies a chosen alternative onto the activity (DB + in-memory). `currency`
// is the one the alternatives were priced in.
async function applyAlternative(activity, alt, currency) {
  const updates = {
    title: alt.title, venueName: alt.venueName, description: alt.description || '',
    category: alt.category || activity.category, costAmount: alt.costAmount ?? activity.cost_amount,
    costCurrency: currency,
    durationMinutes: alt.durationMinutes ?? activity.duration_minutes,
    latitude: alt.latitude, longitude: alt.longitude, tips: alt.tips || '',
  };
  // Marked as our own write so the realtime echo doesn't reload the trip.
  const { error } = await withLocalWrite([activity.id], () => updateActivityById(activity.id, updates));
  if (error) return false;
  Object.assign(activity, {
    title: alt.title, venue_name: alt.venueName, description: alt.description || '',
    category: alt.category || activity.category, cost_amount: alt.costAmount ?? activity.cost_amount,
    cost_currency: currency, duration_minutes: alt.durationMinutes ?? activity.duration_minutes,
    latitude: alt.latitude, longitude: alt.longitude, tips: alt.tips || '',
    photo_url: '', photo_source: '', // stale photo of the old venue
  });
  return true;
}

/**
 * Wire the alternatives flow on a rendered trip view. Bind it to the per-render
 * view root (replaced on every render) and pass the view's abort signal, so a
 * re-render or route change never leaves a second listener behind: two
 * listeners would toggle the panel open and shut on one tap.
 * @param {HTMLElement} container - the trip view root (.td-wrap)
 * @param {object} trip - loaded trip (in-memory model, mutated on apply)
 * @param {(activity: object, cardEl: HTMLElement) => void} onReplaced - re-render hook
 * @param {{ signal?: AbortSignal }} [options]
 */
export function bindAlternatives(container, trip, onReplaced, { signal } = {}) {
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-alt-for]');
    if (btn) {
      e.stopPropagation();
      const card = btn.closest('.td-activity-card');
      const actId = card?.dataset.activityId;
      let activity = null;
      for (const d of trip.itinerary_days || []) {
        activity = (d.activities || []).find(a => a.id === actId);
        if (activity) break;
      }
      if (!activity) return;

      let panel = card.querySelector('.td-alt-panel');
      if (panel) { panel.remove(); btn.setAttribute('aria-expanded', 'false'); return; } // toggle off

      panel = document.createElement('div');
      panel.className = 'td-alt-panel';
      panel.setAttribute('role', 'status');
      panel.innerHTML = '<div class="td-alt-loading">Finding alternatives…</div>';
      card.appendChild(panel);
      btn.setAttribute('aria-expanded', 'true');

      const currency = activityCurrency(trip, activity);
      const { alternatives: alts, notice } = await fetchAlternatives(trip, activity, currency);
      if (!panel.isConnected) return;
      if (!alts?.length) {
        panel.innerHTML = `<div class="td-alt-loading">${escapeHtml(notice || 'No alternatives found. Try again.')}</div>`;
        setTimeout(() => { panel.remove(); btn.setAttribute('aria-expanded', 'false'); }, 2500);
        return;
      }
      panel.innerHTML = `
        <div class="td-alt-label">Swap with:</div>
        ${alts.map((a, i) => `
          <button class="td-alt-chip" data-alt-idx="${i}">
            <span class="td-alt-chip-name">${escapeHtml(a.venueName)}</span>
            <span class="td-alt-chip-desc">${escapeHtml(a.description || a.title)}</span>
          </button>`).join('')}
      `;
      panel._alts = alts;
      panel._activity = activity;
      panel._currency = currency;
      return;
    }

    const chip = e.target.closest('[data-alt-idx]');
    if (chip) {
      e.stopPropagation();
      const panel = chip.closest('.td-alt-panel');
      const alt = panel?._alts?.[Number(chip.dataset.altIdx)];
      const activity = panel?._activity;
      if (!alt || !activity) return;
      chip.disabled = true;
      chip.querySelector('.td-alt-chip-name').textContent = 'Swapping…';
      const ok = await applyAlternative(activity, alt, panel._currency);
      if (!ok) {
        chip.disabled = false;
        chip.querySelector('.td-alt-chip-name').textContent = alt.venueName || 'Try again';
        showToast('Could not swap activity', 'error');
        logger.error('data', 'Alternative swap failed', { activityId: activity.id });
        return;
      }
      const card = panel.closest('.td-activity-card');
      panel.remove();
      showToast(`Swapped to ${alt.venueName}`);
      onReplaced?.(activity, card);
    }
  }, { signal });
}
