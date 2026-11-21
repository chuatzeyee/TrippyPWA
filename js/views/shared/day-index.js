// The day index as a list, a strip or chips (blueprint 2.4, 3.4). Owner: F6.
//
// Hooks: every day has one button with data-day-jump="<row index>" (the controller opens and scrolls
// to that day card, and marks the button is-active). Where a view asks for it (mapDays), the days
// also carry data-map-day="<day number>" with aria-pressed, the keyboard path to the map; 0 is "all
// days". The root is the dayindex region and every child is keyed, so a patch keeps what it can.
import { attr, cls, esc, visuallyHidden } from './html.js';
import { icon } from './icons.js';
import { thumbHtml } from './photo-frame.js';
import { costFigures } from '../../lib/money.js';

const VARIANTS = Object.freeze(['list', 'strip', 'chips']);
const toneOf = (row) => (Number.isInteger(row.colorIndex) && row.colorIndex >= 1 && row.colorIndex <= 7 ? row.colorIndex : 1);
const colorStyle = (row) => ` style="--day-color:var(--day-${toneOf(row)})"`;
const listOf = (rows) => (Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : []);

/**
 * A weather condition as it reads inside a sentence (ruling R30): spelled out and in lower case. The
 * short labels of weatherLabel() in js/lib/weather.js ("Pt. Cloudy", "Pt. Sunny") are for chips and
 * table cells; in running text they are "partly cloudy" and "partly sunny".
 * @param {*} label  a weatherLabel() value ("Pt. Cloudy", "Sunny") or a stored condition ("Partly Cloudy")
 * @returns {string} "partly cloudy", "sunny"; '' for an empty or missing label
 */
export function conditionPhrase(label) {
  if (typeof label !== 'string') return '';
  return label.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^pt\.? /, 'partly ');
}

/**
 * The weather of a day in words. It is the seasonal guess stored with the plan, so it always says so.
 * @param {{ range: string, condition: string }|null} weather
 * @returns {string} "10 to 23°C typical, partly cloudy", or '' when nothing is known
 */
export function typicalText(weather) {
  const range = String(weather?.range ?? '').trim();
  const condition = conditionPhrase(String(weather?.condition ?? ''));
  if (range) return condition ? `${range} typical, ${condition}` : `${range} typical`;
  return condition ? `Typically ${condition}` : '';
}

/** "5 stops", "1 stop", "No stops yet". */
export function stopsText(count) {
  const n = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  if (n === 0) return 'No stops yet';
  return `${n} ${n === 1 ? 'stop' : 'stops'}`;
}

/** The pieces every variant picks from. Each is '' when the row does not have it. */
function partsOf(row, basis) {
  const weather = typicalText(row.weather);
  const { lead } = costFigures(row.cost);
  const whose = basis ? ' <span class="tv-day-basis">per person</span>' : '';
  return {
    num: `<span class="tv-day-num">${visuallyHidden('Day')} ${esc(row.dayNumber)}</span>`,
    title: `<span class="tv-day-title">${esc(row.title)}</span>`,
    date: row.dateText ? `<span class="tv-day-date">${esc(row.dateText)}</span>` : '',
    stops: `<span class="tv-day-stops">${esc(stopsText(row.stops))}</span>`,
    weather: weather ? `<span class="tv-day-weather">${esc(weather)}</span>` : '',
    cost: lead ? `<span class="tv-day-cost">${esc(lead)}${whose}</span>` : '',
  };
}

const jumpAttrs = (row) => `${attr('data-day-jump', row.index)}${attr('data-focus-key', `day-${row.index}`)}${row.isToday ? ' aria-current="date"' : ''}`;
const mapAttrs = (row) => `${attr('data-map-day', row.dayNumber)} aria-pressed="false"`;
const itemOpen = (row) => `<li class="${cls('tv-day', { 'is-today': row.isToday })}"${attr('data-key', `day-${row.index}`)}${colorStyle(row)}>`;

function listRow(row, { mapDays, thumbs, animate, basis }) {
  const p = partsOf(row, basis);
  const thumb = thumbs ? thumbHtml(row.thumb ? { src: row.thumb.src, alt: '' } : null, { size: 64, tone: toneOf(row), animate }) : '';
  return `${itemOpen(row)}<button type="button" class="tv-day-row"${jumpAttrs(row)}${mapDays ? mapAttrs(row) : ''}>
      ${thumb}${p.num}
      <span class="tv-day-main">${p.title}<span class="tv-day-meta">${p.date}${p.stops}${p.weather}</span></span>
      ${p.cost}${icon('chevron-right', 16)}
    </button></li>`;
}

function stripCell(row, { mapDays, basis }) {
  const p = partsOf(row, basis);
  const body = `<span class="tv-day-top">${p.num}${p.date}</span>${p.title}${p.weather}<span class="tv-day-foot">${p.stops}${p.cost}</span>`;
  const open = `Open day ${esc(row.dayNumber)}`;
  if (!mapDays) {
    return `${itemOpen(row)}<button type="button" class="tv-day-pick"${jumpAttrs(row)}>${body}<span class="tv-day-hint">${open}</span></button></li>`;
  }
  return `${itemOpen(row)}<button type="button" class="tv-day-pick"${mapAttrs(row)}${attr('data-focus-key', `daymap-${row.index}`)}>${body}<span class="tv-day-hint">Show on map</span></button>
      <button type="button" class="tv-day-open"${jumpAttrs(row)}>${open}</button></li>`;
}

function chip(row, { mapDays }) {
  return `<button type="button" class="${cls('tv-day-chip', { 'is-today': row.isToday })}"${attr('data-key', `day-${row.index}`)}${jumpAttrs(row)}${mapDays ? mapAttrs(row) : ''}${attr('aria-label', `Day ${row.dayNumber}, ${row.title}`)}${colorStyle(row)}>${esc(row.dayNumber)}</button>`;
}

/**
 * @param {import('../contract.js').DayIndexRow[]} rows  model.days
 * @param {{ variant?: 'list'|'strip'|'chips', mapDays?: boolean, region?: boolean, label?: string, thumbs?: boolean,
 *           animate?: boolean, basis?: boolean, cls?: any }} [opts]
 *   variant  list: a row per day with thumbnail, number, title, date, stops, typical weather and cost.
 *            strip: sideways cells with the same facts (the root keeps its scrollLeft through a patch).
 *            chips: numbered buttons. Anything else reads as list.
 *   mapDays  true when the page has a map: the days then carry data-map-day. In a list row and a chip
 *            it sits on the day-jump button; a strip cell gets one button that shows the day on the
 *            map and one that opens it; the chips gain a leading "All" (data-map-day="0").
 *   region   false leaves data-region="dayindex" off
 *   label    the accessible name, "Days" by default
 *   thumbs   list only: false leaves the thumbnails out. They are left out anyway when no day has a
 *            photo (venue photos switched off).
 *   animate  ViewCtx.animate, for the thumbnails
 *   basis    list and strip: true prints whose money a day's cost is, inside .tv-day-cost:
 *            <span class="tv-day-basis">per person</span>. Off by default, for a view that says it once
 *            for the whole index (a column head, a line above the list).
 * @returns {string} '' when there is no day
 */
export function dayIndexHtml(rows, { variant, mapDays = false, region = true, label = 'Days', thumbs = true, animate = false, basis = false, cls: extra } = {}) {
  const days = listOf(rows);
  if (!days.length) return '';
  const kind = VARIANTS.includes(variant) ? variant : 'list';
  const opts = { mapDays: Boolean(mapDays), animate: Boolean(animate), basis: basis === true, thumbs: thumbs !== false && days.some((row) => row.thumb) };
  const shared = `class="${cls('tv-days', `tv-days--${kind}`, extra)}"${region ? ' data-region="dayindex"' : ''}${attr('aria-label', label)}`;
  if (kind === 'chips') {
    const all = opts.mapDays ? '<button type="button" class="tv-day-chip tv-day-chip--all" data-key="all" data-map-day="0" aria-pressed="true" data-focus-key="daymap-all">All</button>' : '';
    return `<div ${shared} role="group">${all}${days.map((row) => chip(row, opts)).join('')}</div>`;
  }
  if (kind === 'strip') return `<ol ${shared} data-keep-scroll="dayindex">${days.map((row) => stripCell(row, opts)).join('')}</ol>`;
  return `<ol ${shared}>${days.map((row) => listRow(row, opts)).join('')}</ol>`;
}
