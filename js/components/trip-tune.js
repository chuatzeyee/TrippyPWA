// The fine-tune page of a trip, #/trip/<id>/tune: the controller. Model: js/lib/trip-tune.js, markup:
// trip-tune-html.js. Every change is written straight away, as the Alternatives button of the trip
// page does. Remove writes nothing until the user picks a swap or leaves the gap, so Undo is free.
import '../views/shared/styles.js';
import '../../css/components/trip-tune.css';
import { onRouteLeave } from '../router.js';
import { fetchTripById, deleteActivityById } from '../data/trip-repository.js';
import { withLocalWrite } from '../data/collab-repository.js';
import { tuneModel } from '../lib/trip-tune.js';
import { tunePageHtml, swapPanelHtml } from './trip-tune-html.js';
import { activityCurrency, fetchAlternatives, applyAlternative } from './alternatives.js';
import { escapeHtml } from '../data/day-builder.js';
import { showToast } from './toast.js';
import { logger } from '../lib/logger.js';

let renderToken = 0;

const findActivity = (trip, id) => {
  for (const day of trip.itinerary_days || []) {
    const hit = (day.activities || []).find((a) => a.id === id);
    if (hit) return hit;
  }
  return null;
};
const withoutActivity = (trip, id) => ({
  ...trip,
  itinerary_days: (trip.itinerary_days || []).map((day) => ({ ...day, activities: (day.activities || []).filter((a) => a.id !== id) })),
});

/** @param {string} rawTripId */
export async function renderTripTune(rawTripId) {
  const tripId = String(rawTripId || '').split('?')[0];
  const app = document.getElementById('app');
  if (!app || !tripId) return;
  const token = ++renderToken;
  const controller = new AbortController();
  onRouteLeave(() => { controller.abort(); if (token === renderToken) renderToken += 1; });
  const alive = () => token === renderToken;

  app.innerHTML = '<div class="tune-page"><p class="tune-loading">Opening your plan</p></div>';
  const { data, error } = await fetchTripById(tripId);
  if (!alive()) return;
  if (error || !data) {
    app.innerHTML = `<div class="tune-page"><p class="tune-loading">${escapeHtml(error === 'not_found' ? 'This trip is not there any more.' : 'Could not open this trip. Check your connection and try again.')}</p><a class="tune-back" href="#/">Back to your trips</a></div>`;
    return;
  }

  let trip = data;
  let filter = 'all';
  const panels = new Map(); // stop id -> { mode, state, options, currency, notice }

  const draw = () => {
    if (!alive()) return;
    app.innerHTML = tunePageHtml(tuneModel(trip, { filter }), tripId);
    for (const [id, panel] of panels) placePanel(id, panel);
  };
  const placePanel = (id, panel) => {
    const row = app.querySelector(`.tune-stop[data-stop="${CSS.escape(id)}"]`);
    if (!row) return;
    row.classList.toggle('is-removing', panel.mode === 'remove');
    row.nextElementSibling?.classList.contains('tune-panel-row') && row.nextElementSibling.remove();
    row.insertAdjacentHTML('afterend', `<li class="tune-panel-row" data-panel-for="${escapeHtml(id)}">${swapPanelHtml(panel)}</li>`);
  };
  const closePanel = (id) => { panels.delete(id); draw(); };

  const openPanel = async (id, mode) => {
    const activity = findActivity(trip, id);
    if (!activity) return;
    if (navigator.onLine === false) { showToast('You are offline. Changes need a connection.', 'error'); return; }
    const currency = activityCurrency(trip, activity);
    panels.set(id, { mode, state: 'loading', currency });
    draw();
    const { alternatives, notice } = await fetchAlternatives(trip, activity, currency);
    if (!alive() || !panels.has(id)) return;
    panels.set(id, { mode, state: alternatives?.length ? 'ready' : 'empty', options: alternatives || [], currency, notice });
    draw();
  };

  const pick = async (id, index, button) => {
    const panel = panels.get(id);
    const activity = findActivity(trip, id);
    const choice = panel?.options?.[index];
    if (!choice || !activity) return;
    button.disabled = true;
    const ok = await applyAlternative(activity, choice, panel.currency); // updates the stop in place
    if (!alive()) return;
    if (!ok) {
      button.disabled = false;
      showToast('Could not swap that stop. Try again.', 'error');
      logger.error('data', 'Fine-tune swap failed', { activityId: id });
      return;
    }
    showToast(`Swapped to ${choice.venueName || choice.title}`);
    closePanel(id);
  };

  const leaveGap = async (id, button) => {
    button.disabled = true;
    const { error: failed } = await withLocalWrite([id], () => deleteActivityById(id));
    if (!alive()) return;
    if (failed) {
      button.disabled = false;
      showToast('Could not remove that stop. Try again.', 'error');
      logger.error('data', 'Fine-tune remove failed', { activityId: id, error: failed });
      return;
    }
    trip = withoutActivity(trip, id);
    showToast('Stop removed');
    closePanel(id);
  };

  app.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-tune-filter]');
    if (chip) { filter = chip.dataset.tuneFilter; draw(); return; }
    const control = event.target.closest('[data-tune], [data-tune-pick]');
    if (!control) return;
    const id = control.closest('[data-stop]')?.dataset.stop || control.closest('[data-panel-for]')?.dataset.panelFor;
    if (!id) return;
    const action = control.dataset.tune;
    if (control.dataset.tunePick !== undefined) pick(id, Number(control.dataset.tunePick), control);
    else if (action === 'swap' || action === 'remove') {
      if (panels.get(id)?.mode === action) closePanel(id);
      else openPanel(id, action);
    } else if (action === 'undo' || action === 'cancel') closePanel(id);
    else if (action === 'leave') leaveGap(id, control);
  }, { signal: controller.signal });

  draw();
}
