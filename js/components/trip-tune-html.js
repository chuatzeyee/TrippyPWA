// The fine-tune page of a trip: the markup. Pure: the model of js/lib/trip-tune.js in, a string out.
// The look follows the plan sketch of the About page (js/site/about/plan-sketch.js).
import { esc, attr, cls } from '../views/shared/html.js';
import { icon } from '../views/shared/icons.js';
import { formatClock } from '../lib/locale.js';
import { moneyText } from '../lib/money.js';
import { TUNE_FILTERS } from '../lib/trip-tune.js';

const priceText = (cost, currency) => (cost > 0 ? moneyText(cost, currency) : 'Free');

function stopHtml(stop) {
  return `<li class="tune-stop" data-stop="${esc(stop.id)}">
      <span class="tune-stop-time">${esc(stop.time ? formatClock(stop.time) : '')}</span>
      <span class="tune-stop-name">${esc(stop.name)}${stop.venue ? `<small>${esc(stop.venue)}</small>` : ''}</span>
      <span class="${cls('tune-stop-cost', { 'is-free': !stop.paid })}">${esc(priceText(stop.cost, stop.currency))}</span>
      <span class="tune-stop-acts">
        <button type="button" class="tune-act" data-tune="swap" aria-label="${esc(`Swap ${stop.name}`)}" title="Swap">${icon('refresh', 16)}<span>Swap</span></button>
        <button type="button" class="tune-act tune-act--remove" data-tune="remove" aria-label="${esc(`Remove ${stop.name}`)}" title="Remove">${icon('trash', 16)}</button>
      </span>
    </li>`;
}

function dayHtml(day, model) {
  const hidden = day.hidden > 0 ? `<li class="tune-hidden">${day.hidden} ${model.filter === 'paid' ? 'free' : 'paid'} ${day.hidden === 1 ? 'stop' : 'stops'} hidden</li>` : '';
  const empty = !day.stops.length && !day.hidden ? '<li class="tune-hidden">No stops on this day.</li>' : '';
  return `<li class="tune-day" data-day="${esc(day.id)}">
      <div class="tune-day-head">
        <p class="tune-day-n">Day ${day.n}</p>
        <h2 class="tune-day-title">${esc(day.title || `Day ${day.n}`)}</h2>
        ${day.weather ? `<p class="tune-day-meta">Typical weather: ${esc(day.weather)}</p>` : ''}
        <p class="tune-day-meta">Activities estimated: <span class="tune-figure">${esc(moneyText(day.cost, model.currency))}</span></p>
      </div>
      <ol class="tune-stops">${day.stops.map(stopHtml).join('')}${hidden}${empty}</ol>
    </li>`;
}

/** The filter switch. */
export function filterHtml(model) {
  const chips = TUNE_FILTERS.map((one) => `<button type="button" class="tune-chip"${attr('data-tune-filter', one.key)} aria-pressed="${one.key === model.filter}">${esc(one.label)} <span class="tune-chip-n">${model.counts[one.key]}</span></button>`).join('');
  return `<div class="tune-filters" role="group" aria-label="Show stops">${chips}</div>`;
}

/**
 * The whole page.
 * @param {ReturnType<typeof tuneModel>} model
 * @param {string} tripId
 */
export function tunePageHtml(model, tripId) {
  const back = `#/trip/${encodeURIComponent(tripId)}`;
  const legs = model.days.map(() => '<span class="tune-route-leg"></span>').join('');
  return `<div class="tune-page">
    <a class="tune-back" href="${esc(back)}">${icon('back', 18)}<span>Back to the trip</span></a>
    <div class="tune-card">
      <div class="tune-head">
        <p class="tune-kicker">Fine-tune</p>
        <h1 class="tune-title">${esc(model.title)}</h1>
        <dl class="tune-facts">
          <div><dt>Stops</dt><dd>${model.counts.all}</dd></div>
          <div><dt>Activities estimated</dt><dd>${esc(moneyText(model.cost, model.currency))} <small>per person</small></dd></div>
          <div><dt>Paid and free</dt><dd>${model.counts.paid} paid, ${model.counts.free} free</dd></div>
        </dl>
        ${filterHtml(model)}
      </div>
      <div class="tune-route" aria-hidden="true"><span class="tune-route-end"></span>${legs}</div>
      <ol class="tune-days">${model.days.map((day) => dayHtml(day, model)).join('')}</ol>
      <p class="tune-note">Changes save as you make them. Remove a stop and Trippy offers three nearby swaps in the same price range, or you can leave the gap.</p>
    </div>
  </div>`;
}

/**
 * The panel under a stop while it is being swapped or removed.
 * @param {{ mode: 'swap'|'remove', state: 'loading'|'ready'|'empty', options?: Array<{ venueName: string, description?: string, title?: string, costAmount?: number }>, currency?: string, notice?: string }} panel
 */
export function swapPanelHtml({ mode, state, options = [], currency = '', notice = '' }) {
  const lead = mode === 'remove' ? 'Removed. Want something else in its place?' : 'Swap with:';
  const tail = mode === 'remove'
    ? `<div class="tune-panel-foot"><button type="button" class="tune-act" data-tune="leave">Leave the gap</button><button type="button" class="tune-act" data-tune="undo">${icon('undo', 16)}<span>Undo</span></button></div>`
    : '<div class="tune-panel-foot"><button type="button" class="tune-act" data-tune="cancel">Keep this stop</button></div>';
  if (state === 'loading') {
    return `<div class="tune-panel" role="status"><p class="tune-panel-lead">${esc(lead)}</p><p class="tune-panel-wait">Finding three nearby options</p>${tail}</div>`;
  }
  const body = state === 'empty' || !options.length
    ? `<p class="tune-panel-wait">${esc(notice || 'No alternatives found this time.')}</p>`
    : `<div class="tune-options">${options.map((one, i) => `<button type="button" class="tune-option" data-tune-pick="${i}">
        <span class="tune-option-name">${esc(one.venueName || one.title || 'Option')}</span>
        <span class="tune-option-desc">${esc(one.description || one.title || '')}</span>
        <span class="tune-option-cost">${esc(priceText(Number(one.costAmount) || 0, currency))}</span>
      </button>`).join('')}</div>`;
  return `<div class="tune-panel" role="status"><p class="tune-panel-lead">${esc(lead)}</p>${body}${tail}</div>`;
}
