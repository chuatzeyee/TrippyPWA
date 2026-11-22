// The comparison page of an imported trip as HTML strings: no DOM, no network. The controller is
// trip-compare.js, the model comes from buildComparison() in js/lib/trip-compare.js.
import { attr, cls, esc } from '../views/shared/html.js';
import { icon } from '../views/shared/icons.js';
import { formatWeekdayDate } from '../lib/locale.js';
import { PACE_WORDS } from '../lib/trip-compare.js';

export const SIDE_LABELS = Object.freeze({ mine: 'Your plan', theirs: "Trippy's plan" });
const OFFLINE_TEXT = 'You are offline. This is the copy saved on this device, and the actions are off until you are back online.';
const WAITING_TEXT = 'Trippy is writing its plan. This takes a few minutes, and you can leave this page while it works.';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function headHtml(state) {
  return `<header class="cmp-head">
    <a class="cmp-back" href="#/trip/${esc(encodeURIComponent(state.tripId ?? ''))}">${icon('back', 18)}<span>Back to the trip</span></a>
    <h1 class="cmp-title">${esc(state.title || 'Your trip')}</h1>
    <p class="cmp-sub">${state.status === 'start' ? 'Imported plan' : `${SIDE_LABELS.mine} and ${SIDE_LABELS.theirs}, side by side`}</p>
  </header>`;
}

const noteHtml = (text, kind = 'info') => (text ? `<p class="cmp-note" role="${kind === 'warning' ? 'alert' : 'status'}">${icon(kind === 'offline' ? 'offline' : kind, 18)}<span>${esc(text)}</span></p>` : '');

/** The confirm step: what will happen, and the inputs taken from the import. */
export function compareStartHtml(state) {
  const input = state.inputs ?? {};
  const off = attr('disabled', Boolean(state.offline || state.busy));
  const field = (label, control) => `<label class="cmp-field"><span class="cmp-field-label">${esc(label)}</span>${control}</label>`;
  const paces = PACE_WORDS.map((word, i) => `<option value="${i + 1}"${attr('selected', Number(input.pace) === i + 1)}>${esc(word)}</option>`).join('');
  return `<form class="cmp-card cmp-start" data-compare-form novalidate>
    <h2 class="cmp-card-title">Compare with a Trippy plan</h2>
    <p class="cmp-card-text">Trippy writes its own plan for the same place, dates and travellers. Your imported plan is not changed, and it takes a few minutes.</p>
    <div class="cmp-fields">
      <div class="cmp-field cmp-field--wide"><span class="cmp-field-label">Destination</span><span class="cmp-field-value">${esc(input.destination || 'Not set')}</span></div>
      ${field('Start date', `<input class="input" type="date" name="start" value="${esc(input.start ?? '')}" required${off}>`)}
      ${field('End date', `<input class="input" type="date" name="end" value="${esc(input.end ?? '')}" required${off}>`)}
      ${field('Travellers', `<input class="input" type="number" name="travelers" min="1" max="20" step="1" inputmode="numeric" value="${esc(input.travelers ?? 1)}"${off}>`)}
      ${field('Pace', `<select class="input" name="pace"${off}>${paces}</select>`)}
      ${field(`Daily budget per person${input.currencyCode ? ` (${input.currencyCode})` : ''}`, `<input class="input" type="number" name="dailyAmount" min="1" step="1" inputmode="numeric" value="${esc(input.dailyAmount ?? '')}"${off}>`)}
    </div>
    <p class="cmp-error" data-compare-error role="alert"${attr('hidden', !state.inputError)}>${esc(state.inputError ?? '')}</p>
    <div class="cmp-actions">
      <button type="submit" class="btn btn--primary btn--pill cmp-btn"${off}>${state.busy ? 'Starting' : "Write Trippy's plan"}</button>
      <a class="btn btn--ghost btn--pill cmp-btn" href="#/trip/${esc(encodeURIComponent(state.tripId ?? ''))}">Not now</a>
    </div>
  </form>`;
}

function summaryHtml(model, state) {
  const ready = state.status === 'ready';
  const rows = model.summary.map((row) => `<tr><th scope="row">${esc(row.label)}</th><td>${esc(row.mine)}</td><td>${ready ? esc(row.theirs) : ''}</td></tr>`).join('');
  const shared = !ready ? '' : `<p class="cmp-shared">${model.shared === 0 ? 'No place appears in both plans.' : `${plural(model.shared, 'place appears', 'places appear')} in both plans.`}</p>`;
  return `<section class="cmp-card cmp-summary" aria-label="Summary">
    <table class="cmp-table">
      <thead><tr><td></td><th scope="col">${SIDE_LABELS.mine}</th><th scope="col">${SIDE_LABELS.theirs}${ready ? '' : `<span class="cmp-th-note">${state.status === 'failed' ? 'Not written' : 'Being written'}</span>`}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${shared}
  </section>`;
}

function stopHtml(stop, { addable, added, off }) {
  const meta = [stop.category, stop.cost].filter(Boolean).map((part) => `<span>${esc(part)}</span>`).join('');
  const action = added ? `<span class="cmp-added">${icon('check', 16)}Added</span>`
    : addable && !stop.inBoth ? `<button type="button" class="btn btn--secondary btn--pill cmp-add" data-compare-add="${esc(stop.id)}"${attr('disabled', off)}>${icon('plus', 16)}Add to my plan</button>` : '';
  return `<li class="${cls('cmp-stop', { 'cmp-stop--both': stop.inBoth })}">
    <span class="cmp-stop-time">${esc(stop.time)}</span>
    <div class="cmp-stop-main">
      <span class="cmp-stop-name">${esc(stop.name)}</span>
      ${meta ? `<span class="cmp-stop-meta">${meta}</span>` : ''}
    </div>
    ${stop.inBoth && !added ? '<span class="cmp-both">In both</span>' : ''}${action}
  </li>`;
}

function sideHtml(key, side, day, state) {
  const pending = key === 'theirs' && state.status !== 'ready';
  const added = state.added ?? new Set();
  const body = pending ? `<p class="cmp-empty">${state.status === 'failed' ? 'Not written yet.' : 'Being written.'}</p>`
    : !side.exists ? `<p class="cmp-empty">This plan has no day ${day.number}.</p>`
      : side.stops.length === 0 ? '<p class="cmp-empty">Nothing planned for this day.</p>'
        : `<ul class="cmp-stops">${side.stops.map((stop) => stopHtml(stop, {
          addable: key === 'theirs' && Boolean(day.mine.dayId), added: key === 'theirs' && added.has(stop.id), off: Boolean(state.offline),
        })).join('')}</ul>`;
  return `<section class="cmp-side cmp-side--${key}" data-side-panel="${key}">
    <h3 class="cmp-side-label">${SIDE_LABELS[key]}${side.title && !pending ? `<span class="cmp-side-title">${esc(side.title)}</span>` : ''}</h3>
    ${body}
  </section>`;
}

function dayHtml(day, state) {
  const date = day.date ? formatWeekdayDate(day.date) : '';
  return `<li class="cmp-day" data-compare-day="${day.number}">
    <h2 class="cmp-day-title">Day ${day.number}${date ? `<span class="cmp-day-date">${esc(date)}</span>` : ''}</h2>
    <div class="cmp-day-cols">${sideHtml('mine', day.mine, day, state)}${sideHtml('theirs', day.theirs, day, state)}</div>
  </li>`;
}

function statusHtml(state) {
  if (state.status === 'waiting') return `<section class="cmp-card cmp-status" role="status"><span class="cmp-spinner" aria-hidden="true"></span><p class="cmp-card-text">${WAITING_TEXT}</p></section>`;
  if (state.status !== 'failed') return '';
  return `<section class="cmp-card cmp-status" role="alert">
    <p class="cmp-card-text">${esc(state.error || "Trippy couldn't finish its plan this time.")}</p>
    <button type="button" class="btn btn--primary btn--pill cmp-btn" data-compare-action="retry"${attr('disabled', Boolean(state.offline))}>Try again</button>
  </section>`;
}

function endHtml(state) {
  const off = attr('disabled', Boolean(state.offline));
  const both = state.status === 'ready' ? `<button type="button" class="btn btn--primary btn--pill cmp-btn" data-compare-action="keep-both"${off}>Keep both</button>` : '';
  return `<section class="cmp-card cmp-end" aria-label="When you are done">
    <div class="cmp-end-text">
      <h2 class="cmp-card-title">When you are done</h2>
      <p class="cmp-card-text">${state.status === 'ready' ? "Keep only my plan deletes Trippy's plan. Keep both adds Trippy's plan to your trips as a plan of its own." : "Keep only my plan stops the comparison and deletes Trippy's plan."}</p>
    </div>
    <div class="cmp-actions">
      <button type="button" class="btn btn--ghost btn--pill cmp-btn cmp-btn--line" data-compare-action="keep-mine"${off}>Keep only my plan</button>${both}
    </div>
  </section>`;
}

const switchHtml = (side) => `<div class="cmp-switch" role="group" aria-label="Plan shown">
    ${['mine', 'theirs'].map((key) => `<button type="button" class="cmp-switch-btn" data-compare-side="${key}" aria-pressed="${key === side}">${SIDE_LABELS[key]}</button>`).join('')}
  </div>`;

/**
 * The whole page.
 * @param {object} state
 *   tripId, title; status 'loading' | 'error' | 'start' | 'waiting' | 'failed' | 'ready';
 *   model (buildComparison) for waiting, failed and ready; inputs, inputError, busy for start;
 *   side 'mine' | 'theirs' (the one a phone shows); offline; notice; error; added (Set of stop ids)
 * @returns {string}
 */
export function comparePageHtml(state) {
  const side = state.side === 'theirs' ? 'theirs' : 'mine';
  const notes = `${state.offline ? noteHtml(OFFLINE_TEXT, 'offline') : ''}${noteHtml(state.notice)}`;
  let body;
  if (state.status === 'loading') body = '<p class="cmp-loading" role="status"><span class="cmp-spinner" aria-hidden="true"></span>Loading the comparison</p>';
  else if (state.status === 'error') {
    body = `<section class="cmp-card cmp-status" role="alert"><p class="cmp-card-text">${esc(state.error || 'The comparison could not load. Check your connection and try again.')}</p>
      <button type="button" class="btn btn--primary btn--pill cmp-btn" data-compare-action="reload">Try again</button></section>`;
  } else if (state.status === 'start') body = compareStartHtml(state);
  else {
    body = `${statusHtml(state)}${summaryHtml(state.model, state)}${switchHtml(side)}
    <ol class="cmp-days">${state.model.days.map((day) => dayHtml(day, state)).join('')}</ol>
    ${state.model.days.length === 0 ? '<p class="cmp-empty">Neither plan has any days yet.</p>' : ''}
    ${endHtml(state)}`;
  }
  return `<div class="cmp-page" data-compare-page data-side="${side}" data-status="${esc(state.status)}">
    ${headHtml(state)}${notes}${body}
  </div>`;
}

/** The one action on an imported trip's page (owner only). */
export function compareEntryHtml(trip) {
  const has = typeof trip?.wizard_state?.compareTrip === 'string' && trip.wizard_state.compareTrip !== '';
  return `<div class="cmp-entry" data-compare-entry>
    <p class="cmp-entry-text">${has ? "Trippy's plan for this trip is next to yours." : 'This plan was imported. See what Trippy would plan for the same trip.'}</p>
    <a class="btn btn--secondary btn--pill cmp-btn" href="#/trip/${esc(encodeURIComponent(trip?.id ?? ''))}/compare">${has ? 'Open comparison' : 'Compare with a Trippy plan'}</a>
  </div>`;
}
