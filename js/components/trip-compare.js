// The comparison page of an imported trip, #/trip/<imported id>/compare: the controller. Markup is
// trip-compare-html.js, the model and the rules are js/lib/trip-compare.js.
//
// Trippy's plan is a second trip row of the same owner, planned by the usual generation path. The
// rows point at each other in wizard_state (compareTrip on the imported trip, compareOf on the
// comparison). Nothing here keeps a run alive: generation-manager.js does, so leaving is safe.
import '../../css/components/trip-compare.css';
import { navigate, onRouteLeave } from '../router.js';
import { getUser } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { getPrefs } from '../data/prefs-store.js';
import { getHomeCurrency } from '../data/user-prefs.js';
import { storedSessionUserId } from '../data/profile-cache.js';
import {
  fetchTripById, createTrip, deleteTrip, updateTripFields, updateTripStatus, addActivityToDay, sortDayActivities,
} from '../data/trip-repository.js';
import { buildComparison, compareInputs, comparisonOf, activityCopy } from '../lib/trip-compare.js';
import { buildCompareWizardState, compareInputError } from '../wizard/compare-state.js';
import { comparePageHtml } from './trip-compare-html.js';
import { confirmDialog } from '../views/shared/confirm-dialog.js';
import { showToast } from './toast.js';

let renderToken = 0;

const pathOf = (tripId) => `/trip/${encodeURIComponent(tripId)}/compare`;
const onRoute = (tripId) => { const path = location.hash.slice(1).split('?')[0]; return path === pathOf(tripId) || path === `/trip/${tripId}/compare`; };
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const without = (object, key) => Object.fromEntries(Object.entries(object ?? {}).filter(([name]) => name !== key));
const money = () => ({ home: getHomeCurrency(), homeFirst: getPrefs()?.homeCurrencyFirst });

/** @param {string} rawTripId the imported trip */
export async function renderTripCompare(rawTripId) {
  const tripId = String(rawTripId || '').split('?')[0];
  const app = document.getElementById('app');
  if (!app || !tripId) return;
  const token = ++renderToken;
  const page = { tripId, token, mine: null, theirs: null, stopWatching: null, state: { tripId, title: '', status: 'loading', side: 'mine', added: new Set() } };
  const alive = () => page.token === renderToken && onRoute(tripId);
  onRouteLeave(() => { page.stopWatching?.(); if (page.token === renderToken) renderToken += 1; });

  const draw = (patch = {}) => {
    if (!alive()) return;
    page.state = { ...page.state, ...patch };
    if (page.mine && ['waiting', 'failed', 'ready'].includes(page.state.status)) {
      page.state.model = buildComparison(page.mine, page.state.status === 'ready' ? page.theirs : null, money());
    }
    app.innerHTML = comparePageHtml(page.state);
    bind(app.querySelector('[data-compare-page]'), page, { draw, load, alive });
  };

  async function load(notice = '') {
    draw({ status: 'loading', notice: '' });
    const first = await fetchTripById(tripId);
    if (!alive()) return;
    if (first.error || !first.data) {
      const text = first.error === 'not_found' ? "We couldn't find this trip. It may have been deleted." : '';
      return draw({ status: 'error', error: text });
    }
    const mine = first.data;
    const owner = mine.user_id && mine.user_id === (getUser()?.id || storedSessionUserId());
    if (comparisonOf(mine.wizard_state)) return navigate(`/trip/${encodeURIComponent(comparisonOf(mine.wizard_state))}/compare`);
    if (!owner || mine.wizard_state?.imported !== true) return navigate(`/trip/${encodeURIComponent(tripId)}`);
    page.mine = mine;
    const base = { title: mine.title || '', notice, offline: Boolean(first.stale) || isOffline() };
    const start = (extra = {}) => draw({ ...base, status: 'start', inputs: compareInputs(mine), inputError: '', busy: false, ...extra });

    const compareId = typeof mine.wizard_state.compareTrip === 'string' ? mine.wizard_state.compareTrip : '';
    if (!compareId) return start();
    const second = await fetchTripById(compareId);
    if (!alive()) return;
    const gone = second.error === 'not_found' || (second.data && comparisonOf(second.data.wizard_state) !== mine.id);
    if (gone) {
      // Deleted on another device, or kept as a plan of its own: drop the pointer and offer to compare again.
      const wizard_state = without(mine.wizard_state, 'compareTrip');
      const { error } = await updateTripFields(mine.id, { wizard_state });
      if (error) logger.warn('data', 'Stale comparison pointer could not be cleared', { tripId, error });
      else page.mine = { ...mine, wizard_state };
      if (!alive()) return;
      return start({ notice: second.error === 'not_found' ? "Trippy's plan for this trip is no longer there. You can compare again." : '' });
    }
    if (second.error || !second.data) {
      return draw({ ...base, status: 'error', error: second.error === 'offline' ? "You are offline, and Trippy's plan is not saved on this device." : '' });
    }
    page.theirs = second.data;
    const offline = base.offline || Boolean(second.stale);
    if (second.data.status === 'generating') {
      draw({ ...base, offline, status: 'waiting' });
      if (!offline) watch(page, { draw, load, alive });
    } else if (second.data.status === 'failed') draw({ ...base, offline, status: 'failed', error: '' });
    else draw({ ...base, offline, status: 'ready' });
  }

  await load();
}

// Follows the run of the comparison trip: re-attaches after a reload, fills the page in when it ends.
async function watch(page, { draw, load, alive }) {
  page.stopWatching?.();
  try {
    const gen = await import('../services/generation-manager.js');
    if (!alive()) return;
    const tripId = page.theirs.id;
    page.stopWatching = gen.onGenerationUpdate((id, status) => {
      if (id !== tripId || !status || !alive()) return;
      if (status.status === 'done') { page.stopWatching?.(); load(); }
      else if (status.status === 'failed') { page.stopWatching?.(); draw({ status: 'failed', error: status.error || '' }); }
    });
    await gen.resumeStaleGenerations([{ id: tripId, status: 'generating' }]);
  } catch (e) {
    logger.warn('generation', 'Comparison watch unavailable', { tripId: page.tripId, error: e?.message });
  }
}

function readInputs(form, inputs) {
  const value = (name) => String(new FormData(form).get(name) ?? '').trim();
  return {
    ...inputs, start: value('start'), end: value('end'), travelers: Number(value('travelers')) || 1,
    pace: Number(value('pace')) || inputs.pace, dailyAmount: Number(value('dailyAmount')) || 0,
  };
}

async function startComparison(page, inputs, { draw, load, alive }) {
  const inputError = compareInputError(inputs);
  if (inputError) return draw({ inputs, inputError });
  draw({ inputs, inputError: '', busy: true });
  const failed = (error) => {
    logger.error('generation', 'Comparison could not start', { tripId: page.tripId, error });
    draw({ busy: false, inputError: "Trippy's plan could not be started. Check your connection and try again." });
  };
  try {
    const wizardState = buildCompareWizardState(page.mine, inputs);
    const { data: trip, error } = await createTrip(wizardState, 'generating');
    if (error || !trip) return failed(error);
    const wizard_state = { ...page.mine.wizard_state, compareTrip: trip.id };
    const saved = await updateTripFields(page.mine.id, { wizard_state });
    if (saved.error) {
      await deleteTrip(trip.id);
      return failed(saved.error);
    }
    const gen = await import('../services/generation-manager.js');
    gen.startGeneration(trip.id, wizardState);
    import('./generation-popup.js').then(({ showGenerationPopup }) => { if (alive()) showGenerationPopup(trip); })
      .catch((e) => logger.warn('generation', 'Generation popup unavailable', { error: e?.message }));
    if (alive()) await load();
  } catch (e) {
    failed(e?.message);
  }
}

async function retry(page, tools) {
  const { draw } = tools;
  try {
    const { error } = await updateTripStatus(page.theirs.id, 'generating');
    if (error) throw new Error(error);
    const gen = await import('../services/generation-manager.js');
    gen.clearGeneration(page.theirs.id);
    page.theirs = { ...page.theirs, status: 'generating' };
    draw({ status: 'waiting', error: '' });
    gen.startGeneration(page.theirs.id, page.theirs.wizard_state);
    watch(page, tools);
  } catch (e) {
    logger.error('generation', 'Comparison retry failed', { tripId: page.tripId, error: e?.message });
    showToast("Couldn't restart planning. Try again.", 'error');
  }
}

async function addStop(page, stopId, button, { draw }) {
  const day = page.theirs.itinerary_days?.find((d) => d.activities?.some((a) => a.id === stopId));
  const activity = day?.activities.find((a) => a.id === stopId);
  const target = page.mine.itinerary_days?.find((d) => d.day_number === day?.day_number);
  if (!activity || !target) return;
  button.disabled = true;
  const { data, error } = await addActivityToDay(target.id, activityCopy(activity, page.theirs));
  if (error || !data) {
    logger.error('data', 'Stop could not be copied from the comparison', { tripId: page.tripId, error });
    showToast("That stop couldn't be added. Try again.", 'error');
    button.disabled = false;
    return;
  }
  page.mine = {
    ...page.mine,
    itinerary_days: page.mine.itinerary_days.map((d) => (d.id === target.id ? { ...d, activities: sortDayActivities([...(d.activities || []), data]) } : d)),
  };
  draw({ added: new Set([...page.state.added, stopId]) });
}

async function keepMine(page) {
  const sure = await confirmDialog({
    title: "Delete Trippy's plan?", body: 'Your imported plan stays as it is. This cannot be undone.', confirmLabel: "Delete Trippy's plan", danger: true,
  });
  if (!sure) return;
  page.stopWatching?.();
  import('../services/generation-manager.js').then((gen) => gen.clearGeneration(page.theirs.id)).catch(() => {});
  const { error } = await deleteTrip(page.theirs.id);
  if (error) {
    logger.error('data', 'Comparison trip delete failed', { tripId: page.tripId, error });
    return showToast("Trippy's plan couldn't be deleted. Try again.", 'error');
  }
  const cleared = await updateTripFields(page.mine.id, { wizard_state: without(page.mine.wizard_state, 'compareTrip') });
  if (cleared.error) logger.warn('data', 'Comparison pointer could not be cleared', { tripId: page.tripId, error: cleared.error });
  navigate(`/trip/${encodeURIComponent(page.tripId)}`);
}

async function keepBoth(page) {
  // The comparison first: once it stands on its own, a pointer left behind is dropped on the next visit.
  const title = `${page.mine.title || 'Trip'}, Trippy's plan`;
  const { error } = await updateTripFields(page.theirs.id, { title, wizard_state: without(page.theirs.wizard_state, 'compareOf') });
  if (error) {
    logger.error('data', 'Comparison trip could not be kept', { tripId: page.tripId, error });
    return showToast("Trippy's plan couldn't be kept. Try again.", 'error');
  }
  const cleared = await updateTripFields(page.mine.id, { wizard_state: without(page.mine.wizard_state, 'compareTrip') });
  if (cleared.error) logger.warn('data', 'Comparison pointer could not be cleared', { tripId: page.tripId, error: cleared.error });
  showToast("Trippy's plan is now in your trips.", 'success');
  navigate('/');
}

// A phone shows one side at a time: keep the day the user is reading where it is on screen.
function switchSide(root, page, side) {
  const days = [...root.querySelectorAll('[data-compare-day]')];
  const edge = (root.querySelector('.cmp-switch')?.getBoundingClientRect().bottom ?? 0) + 1;
  const anchor = days.find((day) => day.getBoundingClientRect().bottom > edge);
  const before = anchor?.getBoundingClientRect().top;
  page.state = { ...page.state, side };
  root.dataset.side = side;
  root.querySelectorAll('[data-compare-side]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.compareSide === side)));
  if (anchor && before < edge) window.scrollBy(0, anchor.getBoundingClientRect().top - before);
}

function bind(root, page, tools) {
  if (!root) return;
  root.querySelector('[data-compare-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (page.state.busy || page.state.offline) return;
    startComparison(page, readInputs(event.currentTarget, page.state.inputs), tools);
  });
  root.addEventListener('click', (event) => {
    const side = event.target.closest('[data-compare-side]');
    if (side) return switchSide(root, page, side.dataset.compareSide);
    if (page.state.offline) return undefined;
    const add = event.target.closest('[data-compare-add]');
    if (add) return addStop(page, add.dataset.compareAdd, add, tools);
    const action = event.target.closest('[data-compare-action]')?.dataset.compareAction;
    if (action === 'reload') return tools.load();
    if (action === 'retry') return retry(page, tools);
    if (action === 'keep-mine') return keepMine(page);
    if (action === 'keep-both') return keepBoth(page);
    return undefined;
  });
}
