// What the trip page adds to a day card in view mode: the inert block in its header (blueprint 4.2,
// owner F6) and, for a view that asks for it (TripLandingParts.dayAside), the day panel beside the
// stops of an open day (dayAsideHtml, at the end of this file).
//
// The classic header keeps its number, title, date and chevron. This block adds what a view's day
// card shows beside them: the theme sentence, typical weather, first to last time, the stop count,
// the cost and up to four photos. It is inert: no control and no tab stop, because the whole header
// is the classic toggle. trip-detail.css hides .tv-day-extras by default and trip-reset.css shows it
// in view mode, where the classic day-footer cost is hidden in its favour.
import { attr, button, esc } from './html.js';
import { icon } from './icons.js';
import { thumbHtml } from './photo-frame.js';
import { COST_BASIS_TEXT, costFigures } from '../../lib/money.js';
import { stopsText, typicalText } from './day-index.js';
import { mapFallbackSvg } from './trip-map.js';

const MAX_PHOTOS = 4;
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const toneOf = (row) => (Number.isInteger(row.colorIndex) && row.colorIndex >= 1 && row.colorIndex <= 7 ? row.colorIndex : 1);

/**
 * The cost as costText() writes it, in three spans so a view can set them apart or drop one. The full
 * stop before the second figure is a span of its own (.tv-cost-sep), so a view that stacks the second
 * figure under the first hides the stop alone.
 */
function costHtml(cost) {
  const { lead, other } = costFigures(cost);
  if (!lead) return '';
  const second = other ? `<span class="tv-cost-other"><span class="tv-cost-sep">. </span>${esc(other.charAt(0).toUpperCase() + other.slice(1))}</span>` : '';
  return `<span class="tv-day-cost"><span class="tv-cost-lead">${esc(lead)}</span> <span class="tv-cost-basis">${COST_BASIS_TEXT}</span>${second}</span>`;
}

function timesHtml(row) {
  const first = text(row.firstTime);
  const last = text(row.lastTime);
  const range = first && last && first !== last ? `${first} to ${last}` : first || last;
  return range ? `<span class="tv-day-times">${icon('clock', 16)}<span>${esc(range)}</span></span>` : '';
}

function photosHtml(row, animate) {
  const photos = (Array.isArray(row.photos) ? row.photos : []).filter((photo) => photo && typeof photo.src === 'string').slice(0, MAX_PHOTOS);
  // Decorative here: the header is one button, and four alt texts would become its name.
  const thumbs = photos.map((photo) => thumbHtml({ src: photo.src, alt: '' }, { size: 72, tone: toneOf(row), animate })).join('');
  return thumbs ? `<span class="tv-day-photos" aria-hidden="true">${thumbs}</span>` : '';
}

/**
 * @param {import('../contract.js').DayIndexRow} row  the model row of this day card
 * @param {{ animate?: boolean }} [opts]  animate is ViewCtx.animate, for the photos
 * @returns {string} one <div class="tv-day-extras" data-day-extras="<row index>">, also for a day with
 *   nothing to show, so the controller can replace it when data arrives; '' without a row
 */
export function dayCardExtrasHtml(row, { animate = false } = {}) {
  if (!row || typeof row !== 'object') return '';
  const theme = text(row.theme);
  const weather = typicalText(row.weather);
  const stops = Number.isFinite(row.stops) ? Math.max(0, Math.round(row.stops)) : 0;
  const facts = [
    weather ? `<span class="tv-day-weather">${esc(weather)}</span>` : '',
    timesHtml(row),
    `<span class="tv-day-stops">${esc(stopsText(stops))}</span>`,
    costHtml(row.cost),
  ].join('');
  const more = stops > 0
    ? `<span class="tv-day-more"><span class="tv-day-more-show">Show ${esc(stopsText(stops))}</span><span class="tv-day-more-hide">Hide stops</span>${icon('chevron-down', 16)}</span>`
    : '';
  return `<div class="tv-day-extras"${attr('data-day-extras', row.index)}>
    ${theme ? `<span class="tv-day-theme">${esc(theme)}</span>` : ''}
    <span class="tv-day-facts">${facts}</span>
    ${photosHtml(row, Boolean(animate))}
    ${more}
  </div>`;
}

// --- The day panel ------------------------------------------------------------------------------------

const listOf = (value) => (Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') : []);
const heading = (words) => `<h4 class="tv-day-aside-h">${esc(words)}</h4>`;

/** The stops of the day drawn to scale, numbered as in the list below; a line under it when some have no place. */
function asideMapHtml(model) {
  const points = listOf(model.map?.points);
  const svg = points.length ? mapFallbackSvg(points, { day: points[0].dayNumber, byOrder: true }) : '';
  if (!svg) return '';
  const { placed, total } = model.map;
  const note = Number.isFinite(placed) && Number.isFinite(total) && placed < total
    ? `<p class="tv-day-aside-note">${esc(placed)} of ${esc(stopsText(total))} on the map</p>` : '';
  return `<div class="tv-day-aside-map"><div class="tv-day-aside-plate">${svg}</div>${note}</div>`;
}

function asideFactsHtml(model) {
  const first = text(model.firstTime);
  const last = text(model.lastTime);
  const { lead } = costFigures(model.cost);
  const areas = (Array.isArray(model.areas) ? model.areas : []).map(text).filter(Boolean);
  const stops = Number.isFinite(model.stops) ? Math.max(0, Math.round(model.stops)) : 0;
  const rows = [
    ['Stops', stops ? String(stops) : ''],
    ['Hours', first && last && first !== last ? `${first} to ${last}` : first || last],
    ['Cost', lead ? `${lead} ${COST_BASIS_TEXT}` : ''],
    ['Weather', typicalText(model.weather)],
    [areas.length === 1 ? 'Area' : 'Areas', areas.join(', ')],
  ].filter(([, value]) => value);
  if (!rows.length) return '';
  return `<section class="tv-day-aside-facts">${heading('This day at a glance')}<dl>${
    rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>`;
}

function asideBookHtml(model) {
  const items = listOf(model.book).filter((item) => text(item.label));
  if (!items.length) return '';
  const rows = items.map((item) => `<li><span class="tv-day-aside-label">${esc(text(item.label))}</span>`
    + `<span class="tv-day-aside-state" data-state="${item.booked ? 'done' : 'todo'}">${item.booked ? 'Booked' : 'To book'}</span></li>`).join('');
  const open = button('Open the checklist', { cls: 'ui-btn tv-day-aside-open', focusKey: `day-${model.index}-checklist`, attrs: { 'data-section-jump': 'checklist' } });
  return `<section class="tv-day-aside-book">${heading('To book for this day')}<ul>${rows}</ul>${open}</section>`;
}

function asideStopsHtml(model) {
  const stops = listOf(model.list).filter((stop) => text(stop.title));
  if (!stops.length) return '';
  const rows = stops.map((stop) => {
    const time = text(stop.time);
    const inner = `<span class="tv-day-aside-n">${esc(stop.number)}</span> ${time ? `<span class="tv-day-aside-time">${esc(time)}</span> ` : ''}`
      + `<span class="tv-day-aside-title">${esc(text(stop.title))}</span>`;
    return `<li>${button('', { cls: 'tv-day-aside-stop', html: inner, focusKey: `day-${model.index}-stop-${stop.at}`, attrs: { 'data-stop-jump': text(stop.id), 'data-stop-at': stop.at } })}</li>`;
  }).join('');
  return `<nav class="tv-day-aside-stops"${attr('aria-label', `Stops of day ${model.dayNumber}`)}>${heading('Stops')}<ol>${rows}</ol></nav>`;
}

/**
 * The day panel: what stands beside the stops of an open day on a wide day card. Top to bottom, each
 * part left out when it has nothing to say: the stops on a small drawn map (no tiles, so it works
 * offline), the facts of the day, what to book for it, and the stops as a list of buttons. A stop
 * button carries data-stop-jump="<activity id>" and data-stop-at="<position in the day>": the
 * controller scrolls to that stop inside the open day and moves focus to it. "Open the checklist"
 * is a section jump (data-section-jump="checklist"), which the trip page already handles.
 * @param {import('../contract.js').DayAsideModel|null} model  dayAsideModel() of js/lib/trip-overview-model.js
 * @returns {string} one <aside class="tv-day-aside" data-day-aside="<day index>">; '' without a model
 */
export function dayAsideHtml(model) {
  if (!model || typeof model !== 'object') return '';
  const parts = [asideMapHtml(model), asideFactsHtml(model), asideBookHtml(model), asideStopsHtml(model)].join('');
  return `<aside class="tv-day-aside"${attr('data-day-aside', model.index)}${attr('aria-label', `Day ${model.dayNumber} at a glance`)} style="--tone:var(--day-${toneOf(model)})">${parts}</aside>`;
}
