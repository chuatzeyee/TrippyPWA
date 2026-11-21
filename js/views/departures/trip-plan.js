// The Plan panel parts of the departures trip page: "Before you go" above the day grid, the trip
// map and the "Day by day" heading inside it, and the foot note after it. Owner: VA.
import { attr, cls, esc } from '../shared/html.js';
import { icon } from '../shared/icons.js';
import { readinessListHtml, readinessMeterHtml } from '../shared/readiness-list.js';
import { dayIndexHtml } from '../shared/day-index.js';
import { mapCaptionHtml } from '../shared/trip-map.js';
import { count, figures, statusHtml } from './parts.js';

const FOOT_NOTE = 'Costs are estimates per person, for activities only. Weather is typical for the season, not a forecast.';
const AREA_ICONS = { travel: 'plane', stay: 'bed', entry: 'passport', reservations: 'ticket' };
const TARGET_ICONS = { transport: 'train' };
const STATE_KINDS = { done: 'ready', todo: 'todo', checking: 'idle' };
const DUE_STATES = ['overdue', 'soon', 'later'];
const DAY_COLUMNS = ['Day', 'Date', 'Plan', 'Typical weather', 'Stops', 'Activities estimated'];

const boardTop = (id, glyph, title, after, extra, key) => `<div class="${cls('dep-board-top', extra)}"${attr('data-key', key)}><span class="dep-board-ic">${icon(glyph, 20)}</span><h2 class="dep-board-title"${attr('id', id)}>${esc(title)}</h2>${after}</div>`;

/**
 * One row of "Before you go": the item, where it stands, and the one step that opens its section
 * card (or the Prep tab). The first row still to do gets the filled button.
 */
function gateRow(item, lead) {
  const state = Object.hasOwn(STATE_KINDS, item.state) ? item.state : 'todo';
  const glyph = TARGET_ICONS[item.target] ?? AREA_ICONS[item.area] ?? 'check';
  const due = item.due ? `<span class="dep-due" data-due="${DUE_STATES.includes(item.due.state) ? item.due.state : 'later'}">Due ${esc(item.due.text)}</span>` : '';
  const detail = item.detail ? `<span class="dep-gate-detail">${esc(item.detail)}</span>` : '';
  // The key is not the bare area: the facts card keys its facts the same way ("stay"), and a key names one thing on the page.
  return `<div class="dep-gate" role="row"${attr('data-key', `gate-${item.area}`)}${attr('data-area', item.area)} data-state="${state}">
        <span class="dep-gate-item" role="cell"><span class="dep-gate-ic" aria-hidden="true">${icon(glyph, 20)}</span><span class="dep-gate-name">${esc(item.label)}</span></span>
        <span class="dep-gate-st" role="cell">${statusHtml(STATE_KINDS[state], esc(item.status))}${due}${detail}</span>
        <span class="dep-gate-act" role="cell"><button type="button" class="${cls('ui-btn', { 'ui-btn--primary': lead })}"${attr('data-section-jump', item.target)}${attr('aria-controls', `td-section-${item.target}`)} aria-expanded="false"${attr('data-focus-key', `ready-${item.area}`)}>${esc(item.actionLabel)}</button></span>
      </div>`;
}

/**
 * "Before you go" (the `readiness` region). Ahead of the trip it is a board that is a table from
 * desktop width: Item, Status, Next step, with explicit table roles, because CSS turns the rows
 * into stacked blocks on phones. While the trip is live it is the shared one-line form.
 * @param {import('../contract.js').TripOverviewModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 */
export function beforeYouGoHtml(model, ctx) {
  const ready = model.readiness;
  if (!ready) return '';
  if (ready.collapsed) return `<div class="dep-board dep-byg dep-byg--line">${readinessListHtml(ready, { region: true })}</div>`;
  const lead = ready.items.find((item) => item.state === 'todo');
  const progress = `<span class="dep-byg-prog"><span>${figures(ready.headline)}</span>${readinessMeterHtml(ready)}</span>`;
  const note = ready.perDevice ? `<p class="dep-byg-note" data-key="note">${icon('device', 16)}<span>Ticks are saved on this device.</span></p>` : '';
  // Every child of the region is keyed, so a patch keeps the nodes, and the count is also said in a
  // polite status that stays in the page: a tick is announced when it lands (as readinessListHtml does).
  const said = `<p class="ui-vh" data-key="said" role="status">${esc(`Before you go: ${ready.headline}`)}</p>`;
  return `<section class="dep-board dep-byg${ctx.animate ? ' dep-enter' : ''}" aria-labelledby="dep-byg-h">
    <div class="dep-byg-in" data-region="readiness"${attr('data-ready-done', ready.done)}${attr('data-ready-total', ready.total)}>
      ${boardTop('dep-byg-h', 'check', 'Before you go', progress, '', 'top')}
      <div class="dep-table dep-gates" data-key="table" role="table" aria-labelledby="dep-byg-h">
        <div class="dep-board-head" role="row"><span role="columnheader">Item</span><span role="columnheader">Status</span><span role="columnheader">Next step</span></div>
        ${ready.items.map((item) => gateRow(item, item === lead)).join('')}
      </div>
      ${note}
      ${said}
    </div>
  </section>`;
}

/** The trip map: day chips that pick a day on the map, the slot the controller fills, the caption. */
function mapBoardHtml(model) {
  const stops = model.map.points.length;
  return `<section class="dep-board dep-mapboard" aria-labelledby="dep-map-h">
    ${boardTop('dep-map-h', 'map', 'Trip map', `<span class="dep-count">${figures(`${count(stops, 'stop', 'stops')} on the map`)}</span>`)}
    <div class="dep-daychips"><span class="dep-lbl" aria-hidden="true">Show</span>${dayIndexHtml(model.days, { variant: 'chips', mapDays: true, label: 'Show a day on the map' })}</div>
    <div class="dep-map" data-map-slot></div>
    <div class="dep-map-foot">${mapCaptionHtml(model.map, { areas: model.areas, days: model.days })}</div>
  </section>`;
}

/** The heading of the day cards, which follow it as the rows of one board. */
function dayBoardTopHtml(model, chips) {
  const days = model.days.length;
  return `<div class="dep-dayboard">
    ${boardTop('dep-days-h', 'calendar', 'Day by day', `<span class="dep-count">${figures(count(days, 'day', 'days'))}</span><span class="dep-note">Costs are per person, activities only. Weather is typical for the dates, not a forecast.</span>`, 'dep-dayboard-top')}
    ${chips}
    <div class="dep-board-head dep-day-head" aria-hidden="true">${DAY_COLUMNS.map((label) => `<span>${label}</span>`).join('')}</div>
  </div>`;
}

/**
 * The `between` part: inside the day grid, after the section cards and before the day cards.
 * With stops that can be placed, the day chips sit on the map board and also pick the day on the
 * map; without, they sit under the "Day by day" heading and only jump to the day.
 * @param {import('../contract.js').TripOverviewModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 */
export function betweenHtml(model, ctx) {
  if (!model.days.length) return '';
  const placed = model.map.points.length > 0;
  const jump = placed ? '' : `<div class="dep-daychips dep-daychips--jump"><span class="dep-lbl" aria-hidden="true">Go to day</span>${dayIndexHtml(model.days, { variant: 'chips', label: 'Go to a day' })}</div>`;
  return `<div class="dep-between${ctx.animate ? ' dep-enter' : ''}">
    ${placed ? mapBoardHtml(model) : ''}
    ${dayBoardTopHtml(model, jump)}
  </div>`;
}

/** The `planOutro` part: what the money and the weather on this page are. The page foot prints the credits. */
export function outroHtml() {
  return `<p class="dep-foot-note">${FOOT_NOTE}</p><span class="ui-probe" hidden></span>`;
}
