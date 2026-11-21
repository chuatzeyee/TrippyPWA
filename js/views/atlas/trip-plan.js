// The Plan panel parts of the Atlas trip landing: the in-page links and "Before you go" above the day
// grid; inside it, the trip map board (day chips, the map slot for narrow screens, the caption) and the
// "Day by day" heading the day cards follow as the rows of one board; the closing note. Owner: VC.
import { attr, cls, esc } from '../shared/html.js';
import { dayIndexHtml } from '../shared/day-index.js';
import { readinessListHtml, readinessMeterHtml } from '../shared/readiness-list.js';
import { mapCaptionHtml } from '../shared/trip-map.js';
import { MAP_SPLIT } from './trip-hero.js';
import { essentialsHtml } from './trip-essentials.js';
import { jumpItems, readySentence } from './trip-words.js';

const DAY_NOTE = 'Costs are per person, activities only. Weather is typical for the dates, not a forecast.';
const DAY_COLUMNS = Object.freeze(['Day', 'Date', 'Plan', 'Typical weather', 'Stops', 'Activities estimated']);
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const OUTRO = 'Costs are estimates per person, for activities only. Weather is typical for the season, not a forecast.';

function jumpHtml(model) {
  const items = jumpItems(model);
  if (!items.length) return '';
  const links = items.map((item) => (item.section
    ? `<button type="button" class="atl-jump-link"${attr('data-section-jump', item.section)}${attr('aria-controls', `td-section-${item.section}`)} aria-expanded="false"${attr('data-focus-key', `jump-${item.section}`)}>${esc(item.label)}</button>`
    : `<button type="button" class="atl-jump-link"${attr('data-atl-jump', item.to)}${attr('data-focus-key', `jump-${item.to}`)}>${esc(item.label)}</button>`)).join('');
  return `<nav class="atl-jump" aria-label="On this page">${links}</nav>`;
}

/** "Before you go": one line while the plan is live, the count, the meter, a sentence and the rows otherwise. */
function beforeHtml(model) {
  const { readiness } = model;
  if (!readiness) return '';
  if (readiness.collapsed) {
    return `<div class="atl-before atl-before--live" data-region="readiness" data-atl-target="ready" tabindex="-1">${readinessListHtml(readiness, { cls: 'atl-checks' })}</div>`;
  }
  const headline = String(readiness.headline ?? '');
  const tail = / ready$/.test(headline) ? ' ready' : '';
  const count = tail ? headline.slice(0, -tail.length) : headline;
  return `<section class="atl-before" aria-labelledby="atl-before-h" data-region="readiness" data-atl-target="ready" tabindex="-1">
    <div class="atl-before-sum">
      <h2 class="atl-sec-title" id="atl-before-h">Before you go</h2>
      <p class="atl-before-n"><b>${esc(count)}</b>${tail}</p>
      ${readinessMeterHtml(readiness)}
      <p class="atl-before-text">${esc(readySentence(model))}</p>
    </div>
    ${readinessListHtml(readiness, { heading: 'h3', cls: 'atl-checks' })}
  </section>`;
}

/** The `planIntro` part: '' for a plan without days. */
export function planIntroHtml(model) {
  if (!model.days.length) return '';
  return `${jumpHtml(model)}${beforeHtml(model)}${essentialsHtml(model)}`;
}

const boardTop = (id, title, after, extra) => `<div class="${cls('atl-board-top', extra)}"><h2 class="atl-board-title"${attr('id', id)}>${title}</h2>${after}</div>`;

/**
 * The `between` part: the day bar (All, then a chip for each day; with a map they also pick the day
 * on it), which stays under the top bar while the days scroll; the slot the controller fills with
 * the map below 1024 px (from there the map sits beside the cover); the words that describe the map,
 * which are not shown (the chips say it, and the map is described by them); then the heading of the day
 * cards, which follow it as the rows of one board (the column heads show where a row is wide enough
 * to be a table row).
 */
export function betweenHtml(model, ctx) {
  void ctx;
  const days = model.days.length;
  if (!days) return '';
  const mapped = model.map.points.length > 0;
  return `<div class="atl-between">
    <div class="atl-daybar" data-keep-scroll="daybar">${dayIndexHtml(model.days, { variant: 'chips', mapDays: mapped, region: true, label: mapped ? 'Go to a day and show it on the map' : 'Go to a day' })}</div>
    <div class="atl-map" data-map-slot data-map-below="${MAP_SPLIT}"></div>
    ${mapped ? `<div class="atl-map-words">${mapCaptionHtml(model.map, { areas: model.areas, days: model.days })}</div>` : ''}
    <div class="atl-board atl-dayboard" data-atl-target="days" tabindex="-1">
      ${boardTop('atl-days-h', 'Day by day', `<span class="atl-board-n">${esc(count(days, 'day', 'days'))}</span><span class="atl-board-note">${DAY_NOTE}</span>`, 'atl-dayboard-top')}
      <div class="atl-day-head" aria-hidden="true">${DAY_COLUMNS.map((label) => `<span>${label}</span>`).join('')}</div>
    </div>
  </div>`;
}

/** The `planOutro` part: what the figures are. The credits and the map attribution are in the page foot. */
export const planOutroHtml = (model) => (model.days.length ? `<p class="atl-outro">${OUTRO}</p>` : '');
