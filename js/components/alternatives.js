// Tap-for-alternatives: an "Alternatives" button on each activity card asks
// Gemini for 2-3 real nearby swaps; tapping a chip replaces the activity in
// place (DB write + in-memory update + card re-render by the caller).
import { supabase } from '../lib/supabase.js';
import { updateActivityById } from '../data/trip-repository.js';
import { showToast } from './toast.js';
import { logger } from '../lib/logger.js';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// All venue names already on the trip, so suggestions never repeat them.
function usedVenues(trip) {
  const out = [];
  for (const day of trip.itinerary_days || []) {
    for (const a of day.activities || []) if (a.venue_name) out.push(a.venue_name);
  }
  return out;
}

async function fetchAlternatives(trip, activity) {
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
      currency: dest?.currencyCode || trip.budget_currency || 'USD',
      usedVenues: usedVenues(trip),
    },
  });
  if (error || !data?.alternatives) return null;
  return data.alternatives;
}

// Applies a chosen alternative onto the activity (DB + in-memory).
async function applyAlternative(activity, alt) {
  const updates = {
    title: alt.title, venueName: alt.venueName, description: alt.description || '',
    category: alt.category || activity.category, costAmount: alt.costAmount ?? activity.cost_amount,
    durationMinutes: alt.durationMinutes ?? activity.duration_minutes,
    latitude: alt.latitude, longitude: alt.longitude, tips: alt.tips || '',
  };
  const { error } = await updateActivityById(activity.id, updates);
  if (error) return false;
  Object.assign(activity, {
    title: alt.title, venue_name: alt.venueName, description: alt.description || '',
    category: alt.category || activity.category, cost_amount: alt.costAmount ?? activity.cost_amount,
    duration_minutes: alt.durationMinutes ?? activity.duration_minutes,
    latitude: alt.latitude, longitude: alt.longitude, tips: alt.tips || '',
    photo_url: '', photo_source: '', // stale photo of the old venue
  });
  return true;
}

/**
 * Wire the alternatives flow on a rendered trip view.
 * @param {HTMLElement} container - the trip view root
 * @param {object} trip - loaded trip (in-memory model, mutated on apply)
 * @param {(activity: object, cardEl: HTMLElement) => void} onReplaced - re-render hook
 */
export function bindAlternatives(container, trip, onReplaced) {
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
      if (panel) { panel.remove(); return; } // toggle off

      panel = document.createElement('div');
      panel.className = 'td-alt-panel';
      panel.innerHTML = '<div class="td-alt-loading">Finding alternatives…</div>';
      card.appendChild(panel);

      const alts = await fetchAlternatives(trip, activity);
      if (!panel.isConnected) return;
      if (!alts?.length) {
        panel.innerHTML = '<div class="td-alt-loading">No alternatives found — try again.</div>';
        setTimeout(() => panel.remove(), 2500);
        return;
      }
      panel.innerHTML = `
        <div class="td-alt-label">Swap with:</div>
        ${alts.map((a, i) => `
          <button class="td-alt-chip" data-alt-idx="${i}">
            <span class="td-alt-chip-name">${esc(a.venueName)}</span>
            <span class="td-alt-chip-desc">${esc(a.description || a.title)}</span>
          </button>`).join('')}
      `;
      panel._alts = alts;
      panel._activity = activity;
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
      const ok = await applyAlternative(activity, alt);
      if (!ok) { showToast('Could not swap activity', 'error'); logger.error('data', 'Alternative swap failed', { activityId: activity.id }); return; }
      const card = panel.closest('.td-activity-card');
      panel.remove();
      showToast(`Swapped to ${alt.venueName}`);
      onReplaced?.(activity, card);
    }
  });
}
