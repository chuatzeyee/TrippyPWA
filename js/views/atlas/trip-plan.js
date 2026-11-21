// The Plan panel parts of the Atlas trip landing: the in-page links, "Day by day" (the caption of the
// map, the map slot for narrow screens, the day strip), "Before you go", the heading over the day
// cards and the closing note. Owner: VC.
import { attr, esc } from '../shared/html.js';
import { dayIndexHtml } from '../shared/day-index.js';
import { readinessListHtml, readinessMeterHtml } from '../shared/readiness-list.js';
import { mapCaptionHtml } from '../shared/trip-map.js';
import { MAP_SPLIT } from './trip-hero.js';
import { jumpItems, readySentence, stripColumns } from './trip-words.js';

const OUTRO = 'Costs are estimates per person, for activities only. Weather is typical for the season, not a forecast.';

function jumpHtml(model) {
  const items = jumpItems(model);
  if (!items.length) return '';
  const links = items.map((item) => (item.section
    ? `<button type="button" class="atl-jump-link"${attr('data-section-jump', item.section)}${attr('aria-controls', `td-section-${item.section}`)} aria-expanded="false"${attr('data-focus-key', `jump-${item.section}`)}>${esc(item.label)}</button>`
    : `<button type="button" class="atl-jump-link"${attr('data-atl-jump', item.to)}${attr('data-focus-key', `jump-${item.to}`)}>${esc(item.label)}</button>`)).join('');
  return `<nav class="atl-jump" aria-label="On this page">${links}</nav>`;
}

function daysHtml(model, ctx) {
  const mapped = model.map.points.length > 0;
  // With a map, its caption (the region under this line) says how to pick a day.
  const intro = mapped
    ? 'Weather is typical for these dates, not a forecast.'
    : 'Open a day to see its stops. Weather is typical for these dates, not a forecast.';
  // From 960 px the strip is a grid: these are its columns (two integers, never text from the plan).
  const cols = stripColumns(model.days.length);
  return `<section class="atl-days" aria-labelledby="atl-days-h" data-atl-target="days" tabindex="-1">
    <div class="atl-sec-head"><h2 class="atl-sec-title" id="atl-days-h">Day by day</h2><p>${intro}</p></div>
    ${mapCaptionHtml(model.map, { areas: model.areas, days: model.days })}
    <div class="atl-days-map" data-map-slot data-map-below="${MAP_SPLIT}"></div>
    <div class="atl-strip" style="--atl-cols:${cols.wide};--atl-cols-mid:${cols.mid}">${dayIndexHtml(model.days, { variant: 'strip', mapDays: mapped, animate: Boolean(ctx?.animate) })}</div>
  </section>`;
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
export function planIntroHtml(model, ctx) {
  if (!model.days.length) return '';
  return `${jumpHtml(model)}${daysHtml(model, ctx)}${beforeHtml(model)}`;
}

/** The `between` part: the heading over the day cards. */
export const betweenHtml = (model) => (model.days.length ? '<h2 class="atl-sec-title atl-between-title">The days</h2>' : '');

/** The `planOutro` part: what the figures are. The credits and the map attribution are in the page foot. */
export const planOutroHtml = (model) => (model.days.length ? `<p class="atl-outro">${OUTRO}</p>` : '');
