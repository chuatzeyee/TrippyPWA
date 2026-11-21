// The inert block the trip page adds to each day card header in view mode (blueprint 4.2). Owner: F6.
//
// The classic header keeps its number, title, date and chevron. This block adds what a view's day
// card shows beside them: the theme sentence, typical weather, first to last time, the stop count,
// the cost and up to four photos. It is inert: no control and no tab stop, because the whole header
// is the classic toggle. trip-detail.css hides .tv-day-extras by default and trip-reset.css shows it
// in view mode, where the classic day-footer cost is hidden in its favour.
import { attr, esc } from './html.js';
import { icon } from './icons.js';
import { thumbHtml } from './photo-frame.js';
import { COST_BASIS_TEXT, costFigures } from '../../lib/money.js';
import { stopsText, typicalText } from './day-index.js';

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
