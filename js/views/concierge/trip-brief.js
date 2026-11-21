// The `planIntro` part of the Concierge trip landing: the brief (one sentence, the facts, the planned
// spend against the budget), the days (the map slot and the day index as a list) and Before you go.
// Regions: `glance` (the brief's facts and figures), `dayindex`, `map-caption`, `readiness`. Owner: VB.
import { cls, esc } from '../shared/html.js';
import { icon } from '../shared/icons.js';
import { glanceHtml } from '../shared/glance.js';
import { conditionPhrase, dayIndexHtml } from '../shared/day-index.js';
import { mapCaptionHtml } from '../shared/trip-map.js';
import { readinessChipHtml, readinessListHtml, readinessMeterHtml } from '../shared/readiness-list.js';
import { COST_BASIS_TEXT, costFigures } from '../../lib/money.js';
import { readinessSentence, tripBrief } from './briefing.js';
import { capital, countOf, daysHeading, spendShare } from './words.js';
import { enter, secHead } from './parts.js';

/** The facts the brief shows, in this order. Ready has its own section and the cost its own block. */
const FACT_KEYS = ['stops', 'weather', 'pace', 'stay'];
const mono = (text) => `<span class="con-mono">${esc(text)}</span>`;
const stopsOf = (model) => model.days.reduce((sum, row) => sum + (Number.isFinite(row.stops) ? row.stops : 0), 0);

/** "Clear, typical for late March": the condition a weather note opens with. */
const NOTE_CONDITION = /^([^,]+),\s*typical\b/i;

/**
 * The glance facts as the brief words them: the stops with the number of areas they spread over, and
 * the typical weather with its condition spelled out beside the range (ruling R30). The label already
 * says the weather is typical. The model's facts are not changed: these are copies.
 */
function briefFacts(model) {
  const areas = model.brief?.areaCount;
  return model.glance.map((fact) => {
    if (fact.key === 'stops') {
      const across = Number.isFinite(areas) && areas > 0 ? ` across ${countOf(areas, 'area', 'areas')}` : '';
      return { ...fact, value: `${fact.value}${across}`, note: '' };
    }
    const condition = fact.key === 'weather' ? NOTE_CONDITION.exec(String(fact.note ?? '')) : null;
    return condition ? { ...fact, value: `${fact.value}, ${conditionPhrase(condition[1])}`, note: '' } : fact;
  });
}

/** Planned spend against the budget: both per person, a bar, and the figures in the trip's own currency. */
function spendHtml(model) {
  const { cost } = model;
  const { lead, other, budget } = costFigures(cost);
  if (!lead) return '';
  const share = spendShare(cost);
  const bar = share
    ? `<span class="con-spend-bar" role="img" aria-label="${share.over ? 'The planned spend is above the budget' : `${share.percent} percent of the budget is planned`}"${share.over ? ' data-over' : ''} style="--con-pct:${share.percent}%"><i></i></span>` : '';
  // Above the budget the line says so in words: a full bar alone reads as "all of it is planned".
  const budgetWords = !budget ? ''
    : share?.over ? `. <strong class="con-spend-over">Over the budget</strong> of ${mono(budget)} per person`
      : `, of a budget of ${mono(budget)} per person`;
  const homeLeads = Boolean(cost.homeFirst) && Boolean(cost.home);
  const local = homeLeads && cost.budget ? `${cost.local.text} of ${cost.budget.text}. ` : other ? `${capital(other)}. ` : '';
  const stops = stopsOf(model);
  const covers = stops ? `Covers the ${countOf(stops, 'stop', 'stops')}, not flights or the stay.` : 'Flights and the stay are not part of it.';
  return `<div class="con-spend">
    <p class="con-spend-label">Planned spend</p>
    <p class="con-spend-value">${mono(lead)} ${COST_BASIS_TEXT}${budgetWords}</p>
    ${bar}
    <p class="con-spend-note">${esc(local)}${covers}</p>
  </div>`;
}

/** One line on narrow screens that jumps to Before you go, which stands after the days there. */
function readyLink(readiness) {
  if (!readiness || readiness.collapsed) return '';
  return `<button type="button" class="con-brief-ready" data-con-scroll="readiness" data-focus-key="brief-ready">
    <span class="con-brief-ready-text">Before you go<small>${esc(readiness.headline)}</small></span>${readinessChipHtml(readiness)}${icon('chevron-right', 20)}
  </button>`;
}

function briefSection(model, ctx) {
  const lede = `<p class="con-lede">${esc(tripBrief(model))}</p>`;
  const facts = glanceHtml(briefFacts(model), { keys: FACT_KEYS, region: false, label: 'The plan in facts' });
  const spend = spendHtml(model);
  // A past plan leads with what it was planned to cost; before that the sentence leads.
  const body = model.phase === 'past' ? `${spend}${lede}${facts}` : `${lede}${facts}${spend}${readyLink(model.readiness)}`;
  return `<section class="${cls('con-brief-sec', enter(ctx, 1))}" aria-labelledby="con-brief-h">
    <h2 class="con-h2" id="con-brief-h">The brief</h2>
    <div class="con-brief-body" data-region="glance">${body}</div>
  </section>`;
}

function daysSection(model, ctx) {
  const stops = stopsOf(model);
  const placed = model.map.points.length > 0;
  const line = `${countOf(stops, 'stop', 'stops')} in all. Pick a day ${placed ? 'on the map or in the list' : 'in the list'}.`;
  return `<section class="${cls('con-days-sec', enter(ctx, 3))}" aria-labelledby="con-days-h">
    ${secHead({ id: 'con-days-h', title: daysHeading(model.days.length), count: stops, line })}
    <div class="con-days">
      <div class="con-days-map"><div class="con-map-slot" data-map-slot></div>${mapCaptionHtml(model.map, { areas: model.areas, days: model.days })}</div>
      ${dayIndexHtml(model.days, { variant: 'list', mapDays: placed, animate: ctx.animate })}
    </div>
  </section>`;
}

/** Before you go: the count, the meter, one sentence and the rows; one line while the plan runs. */
function readinessBlock(model) {
  const { readiness } = model;
  if (!readiness) return '';
  if (readiness.collapsed) return `<div class="con-byg con-byg--line" data-region="readiness">${readinessListHtml(readiness, { heading: 'h3' })}</div>`;
  return `<div class="con-byg" data-region="readiness">
    <div class="con-byg-head"><h2 class="con-h2" id="con-byg-h">Before you go</h2><p class="con-byg-count">${esc(readiness.headline)}</p></div>
    <div class="con-byg-bar">${readinessMeterHtml(readiness)}</div>
    <p class="con-byg-say">${esc(readinessSentence(readiness, model.daysToGo))}</p>
    ${readinessListHtml(readiness, { heading: 'h3' })}
  </div>`;
}

/**
 * @param {import('../contract.js').TripOverviewModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 * @returns {string} '' for a plan with nothing to brief on (no days, no facts, no readiness)
 */
export function planIntroHtml(model, ctx) {
  const hasDays = model.days.length > 0;
  if (!hasDays && !model.glance.length && !model.readiness) return '';
  const brief = hasDays || model.glance.length ? briefSection(model, ctx) : '';
  const days = hasDays ? daysSection(model, ctx) : '';
  const ready = readinessBlock(model);
  return `<div class="${cls('con-plan', { 'con-plan--solo': !ready || model.readiness.collapsed, 'con-plan--past': model.phase === 'past' })}">${brief}${days}${ready}</div>`;
}
