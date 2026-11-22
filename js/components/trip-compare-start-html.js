// The first screen of the comparison: the imported plan as it stands on the left, and on the right
// what Trippy is about to write, with the few things it needs. HTML strings only; the controller
// (trip-compare.js) binds the controls through their data attributes.
import { formatNumber } from '../lib/locale.js';
import { PACE_WORDS, homeAmountText } from '../lib/trip-compare.js';
import { attr, cls, esc, icon, plural, sideTagHtml, planCoverHtml, datesText, motifHtml } from './trip-compare-parts.js';

const OUTLINE_MAX = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days from the first to the last date, both counted; 0 when either is missing or they are the wrong way round. */
export function dayCount(start, end) {
  const [from, to] = [start, end].map((value) => Date.parse(`${value}T00:00:00Z`));
  return Number.isFinite(from) && Number.isFinite(to) && to >= from ? Math.round((to - from) / DAY_MS) + 1 : 0;
}

/** What the date control says: the range as the app prints it, and how long that is. */
export function datesLabel(start, end) {
  if (!start || !end) return { text: 'Choose dates', days: '' };
  const days = dayCount(start, end);
  return { text: datesText({ start, end }), days: days ? plural(days, 'day', 'days') : '' };
}

/** "~S$180 a day each", or '' when there is nothing to convert. */
export const budgetHint = (amount, code, home) => {
  const figure = homeAmountText(amount, code, home);
  return figure ? `${figure} a day each` : '';
};

function figuresHtml(model) {
  const cell = (row) => {
    const none = row.mine === '' || row.mine === 'No costs listed';
    return `<div class="cmp-fig"><dt class="cmp-fig-label">${esc(row.label)}</dt><dd class="${cls('cmp-fig-value', { 'cmp-fig-value--none': none })}">${esc(row.mine === '' ? 'Not known' : row.mine)}</dd></div>`;
  };
  return `<dl class="cmp-figs">${model.summary.map(cell).join('')}</dl>`;
}

function outlineHtml(model) {
  const days = model.days.filter((day) => day.mine.exists);
  if (days.length === 0) return '<p class="cmp-empty">This plan has no days yet.</p>';
  const rows = days.slice(0, OUTLINE_MAX).map((day) => `<li class="cmp-outline-row">
      <span class="cmp-outline-num">${day.number}</span>
      <span class="cmp-outline-title">${esc(day.mine.title || `Day ${day.number}`)}</span>
      <span class="cmp-outline-count">${day.mine.stops.length === 0 ? 'Nothing planned' : plural(day.mine.stops.length, 'stop', 'stops')}</span>
    </li>`).join('');
  const rest = days.length - OUTLINE_MAX;
  return `<ol class="cmp-outline" aria-label="The first days">${rows}</ol>${rest > 0 ? `<p class="cmp-outline-more">and ${plural(rest, 'more day', 'more days')}</p>` : ''}`;
}

/** The imported plan at a glance: cover, name, dates, travellers and its shape. */
export function planPreviewHtml(state) {
  const { model } = state;
  const plan = model?.plans?.mine ?? {};
  const over = `${sideTagHtml('mine')}<h2 class="cmp-plan-name" id="cmp-mine-name">${esc(plan.title || state.title || 'Your trip')}</h2>`;
  const facts = [
    ['calendar', datesText(plan), true],
    plan.travelers > 0 ? ['people', plural(plan.travelers, 'traveller', 'travellers')] : null,
    plan.destination ? ['pin', plan.destination] : null,
  ].filter(Boolean).map(([name, text, mono]) => `<li class="cmp-fact">${icon(name, 16)}<span${mono ? ' class="cmp-mono"' : ''}>${esc(text)}</span></li>`).join('');
  return `<section class="cmp-card cmp-plan" aria-labelledby="cmp-mine-name">
    ${planCoverHtml(plan, { over, priority: true })}
    <div class="cmp-plan-body">
      <ul class="cmp-facts">${facts}</ul>
      ${model ? figuresHtml(model) : ''}
      <h3 class="cmp-eyebrow">Day by day</h3>
      ${model ? outlineHtml(model) : ''}
    </div>
  </section>`;
}

const rowHtml = (label, control, { hint = '', id = '', wide = false } = {}) => `<div class="${cls('cmp-row', { 'cmp-row--wide': wide })}">
      <div class="cmp-row-label"${attr('id', id || null)}>${esc(label)}${hint ? `<span class="cmp-row-hint">${esc(hint)}</span>` : ''}</div>
      <div class="cmp-row-control">${control}</div>
    </div>`;

function controlsHtml(state) {
  const input = state.inputs ?? {};
  const locked = Boolean(state.offline || state.busy);
  const off = attr('disabled', locked);
  const dates = datesLabel(input.start, input.end);
  const travelers = Math.max(1, Number(input.travelers) || 1);
  const pace = Number(input.pace) || 3;
  const code = input.currencyCode || '';
  const hint = budgetHint(input.dailyAmount, code, state.home);

  const dateControl = `<input type="hidden" name="start" value="${esc(input.start ?? '')}"><input type="hidden" name="end" value="${esc(input.end ?? '')}">
        <button type="button" class="cmp-pick" data-compare-dates aria-expanded="false" aria-controls="cmp-cal" aria-describedby="cmp-dates-label"${off}>
          ${icon('calendar', 18)}<span class="cmp-pick-text cmp-mono" data-compare-dates-text>${esc(dates.text)}</span>
          <span class="cmp-pick-note" data-compare-dates-days>${esc(dates.days)}</span>${icon('chevron-down', 16)}
        </button>
        <div class="cmp-cal" id="cmp-cal" data-compare-cal hidden></div>`;

  const stepper = `<input type="hidden" name="travelers" value="${travelers}">
        <div class="cmp-stepper" role="group" aria-labelledby="cmp-travellers-label">
          <button type="button" class="cmp-step" data-compare-step="-1" aria-label="One traveller fewer"${attr('disabled', locked || travelers <= 1)}><svg class="ui-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/></svg></button>
          <output class="cmp-step-value cmp-mono" data-compare-travelers aria-live="polite">${travelers}</output>
          <button type="button" class="cmp-step" data-compare-step="1" aria-label="One traveller more"${attr('disabled', locked || travelers >= 20)}>${icon('plus', 18)}</button>
        </div>`;

  const paces = `<div class="cmp-chips" role="radiogroup" aria-labelledby="cmp-pace-label">${PACE_WORDS.map((word, i) => `<label class="cmp-chip"><input class="cmp-chip-input" type="radio" name="pace" value="${i + 1}"${attr('checked', pace === i + 1)}${off}><span class="cmp-chip-face">${esc(word)}</span></label>`).join('')}</div>`;

  const presets = (input.presets ?? []).map((level) => `<button type="button" class="cmp-preset" data-compare-preset="${esc(level.amount)}" aria-pressed="${Number(input.dailyAmount) === level.amount}"${off}><span>${esc(level.label)}</span><span class="cmp-mono">${esc(formatNumber(level.amount))}</span></button>`).join('');
  const budget = `<div class="cmp-money">
          <label class="cmp-money-field"><span class="cmp-money-code cmp-mono">${esc(code || 'Amount')}</span>
            <input class="cmp-money-input cmp-mono" type="text" name="dailyAmount" inputmode="numeric" autocomplete="off" pattern="[0-9]*" maxlength="9" value="${esc(input.dailyAmount ?? '')}" aria-labelledby="cmp-budget-label" data-compare-budget${off}></label>
          <span class="cmp-money-home" data-compare-home${attr('hidden', !hint)}>${esc(hint)}</span>
        </div>
        ${presets ? `<div class="cmp-presets" role="group" aria-label="Budget levels">${presets}</div>` : ''}`;

  return `<div class="cmp-rows">
    ${rowHtml('Where', `<span class="cmp-row-value">${icon('pin', 18)}<span>${esc(input.destination || 'Not set')}</span></span>`)}
    ${rowHtml('Dates', dateControl, { id: 'cmp-dates-label', wide: true })}
    ${rowHtml('Travellers', stepper, { id: 'cmp-travellers-label' })}
    ${rowHtml('Pace', paces, { id: 'cmp-pace-label', wide: true })}
    ${rowHtml('Daily budget', budget, { id: 'cmp-budget-label', hint: 'per person', wide: true })}
  </div>`;
}

/** The confirm step: the imported plan beside what Trippy will write, and the inputs taken from the import. */
export function compareStartHtml(state) {
  const off = attr('disabled', Boolean(state.offline || state.busy));
  return `<div class="cmp-duo cmp-duo--start">
    ${planPreviewHtml(state)}
    <form class="cmp-card cmp-form" data-compare-form novalidate aria-labelledby="cmp-form-title">
      <div class="cmp-form-head">
        <div class="cmp-form-intro">
          ${sideTagHtml('theirs')}
          <h2 class="cmp-card-title" id="cmp-form-title">A second plan for the same trip</h2>
        </div>
        ${motifHtml()}
      </div>
      <p class="cmp-card-text">Trippy writes its own plan for the same place, dates and travellers, then sets it next to yours day by day. Your imported plan is not changed.</p>
      ${controlsHtml(state)}
      <p class="cmp-error" data-compare-error role="alert"${attr('hidden', !state.inputError)}>${icon('warning', 16)}<span>${esc(state.inputError ?? '')}</span></p>
      <div class="cmp-form-end">
        <div class="cmp-actions">
          <button type="submit" class="btn btn--primary btn--pill cmp-btn cmp-btn--go"${off}>${icon('plane', 18)}<span>${state.busy ? 'Starting' : "Write Trippy's plan"}</span></button>
          <a class="btn btn--ghost btn--pill cmp-btn" href="#/trip/${esc(encodeURIComponent(state.tripId ?? ''))}">Not now</a>
        </div>
        <p class="cmp-form-note">${icon('clock', 16)}<span>Takes a few minutes. You can leave this page while Trippy writes.</span></p>
      </div>
    </form>
  </div>`;
}
