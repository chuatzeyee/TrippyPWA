// The logbook of the Atlas page: calendar days with a plan as bars by month, and the facts list.
// Wording follows blueprint section 10, rows 3 and 24: plans, not journeys; kilometres only. Owner: VC.
import { attr, esc } from '../shared/html.js';
import { numberText, plansText } from './words.js';

export { spanText } from './words.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_KEY = /^(\d{4})-(\d{2})$/;
const PHASES = ['past', 'now', 'future'];
const ROW = 12;
const BAR_PX = 56;
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * The bars of the calendar chart, in rows of at most twelve months. A bar is scaled to a 31 day
 * month; the year is printed under the first bar of a row and wherever it changes.
 * @param {import('../contract.js').TravelStats['byMonth']} byMonth
 * @returns {Array<Array<{ key: string, name: string, year: string, days: number, phase: string, height: number }>>}
 */
export function monthRows(byMonth) {
  const bars = (Array.isArray(byMonth) ? byMonth : []).flatMap((entry) => {
    const found = MONTH_KEY.exec(entry?.key ?? '');
    const name = found ? MONTHS[Number(found[2]) - 1] : null;
    if (!name) return [];
    const days = Number.isFinite(entry.days) ? Math.max(0, Math.round(entry.days)) : 0;
    return [{
      key: entry.key, name, january: found[2] === '01', yearOf: found[1], days, phase: PHASES.includes(entry.phase) ? entry.phase : 'past',
      height: days ? Math.max(3, Math.round((Math.min(days, 31) / 31) * BAR_PX)) : 1,
    }];
  });
  const rows = [];
  for (let at = 0; at < bars.length; at += ROW) rows.push(bars.slice(at, at + ROW));
  return rows.map((row) => row.map(({ january, yearOf, ...bar }, i) => ({ ...bar, year: i === 0 || january || row[i - 1].yearOf !== yearOf ? yearOf : '' })));
}

const degrees = (lat) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
const roundKm = (km) => (km >= 200 ? Math.round(km / 10) * 10 : Math.round(km));

/**
 * The facts of the atlas: furthest north, furthest south, furthest from home, most planned. A place
 * is where a plan goes, so it is never called a place someone has been (section 10, row 3).
 * @param {import('../contract.js').TravelStats|null} stats
 * @param {Array<import('../contract.js').MapPin>|null} pins  to say when a place is in a plan that is running or coming up
 * @returns {Array<{ label: string, value: string, note: string }>} only the facts the statistics hold
 */
export function factRows(stats, pins) {
  const kindOf = (name) => (Array.isArray(pins) ? pins : []).find((pin) => pin && pin.kind !== 'home' && pin.place === name)?.kind ?? '';
  const placed = (name) => {
    const kind = kindOf(name);
    return `${name}${kind === 'live' ? ', in a plan running now' : kind === 'up' ? ', in a plan coming up' : ''}`;
  };
  const { north, south, farthest } = stats?.extremes ?? {};
  const most = stats?.mostPlanned;
  const hasLat = (spot) => Boolean(spot) && text(spot.name) !== '' && Number.isFinite(spot.lat);
  return [
    hasLat(north) ? { label: 'Furthest north', value: placed(north.name), note: degrees(north.lat) } : null,
    hasLat(south) ? { label: 'Furthest south', value: placed(south.name), note: degrees(south.lat) } : null,
    farthest && text(farthest.name) !== '' && Number.isFinite(farthest.km)
      ? { label: 'Furthest from home', value: `${farthest.name}, about ${numberText(roundKm(farthest.km))} km`, note: 'A straight line from home' } : null,
    most && text(most.country) !== '' ? { label: 'Most planned', value: most.country, note: plansText(most.trips) } : null,
  ].filter(Boolean);
}

/** The calendar chart: one image for a reader, with the total beside its heading. '' without a month. */
export function monthsHtml(stats) {
  const rows = monthRows(stats?.byMonth);
  if (!rows.length) return '';
  const bars = rows.flat();
  const total = Number.isFinite(stats?.calendarDays) ? stats.calendarDays : bars.reduce((sum, bar) => sum + bar.days, 0);
  const ends = `${bars[0].name} ${bars[0].key.slice(0, 4)} to ${bars[bars.length - 1].name} ${bars[bars.length - 1].key.slice(0, 4)}`;
  const cols = Math.max(...rows.map((row) => row.length));
  const barHtml = (bar) => `<span class="atl-mo atl-mo--${bar.phase}"><em>${bar.days ? esc(bar.days) : ''}</em><i style="--atl-h:${bar.height}"></i><b>${esc(bar.name)}</b><small>${esc(bar.year)}</small></span>`;
  return `<div class="atl-months-wrap">
    <p class="atl-months-h">Calendar days with a plan <span>${esc(numberText(total))} ${total === 1 ? 'day' : 'days'}, overlaps counted once</span></p>
    <div class="atl-months" role="img"${attr('aria-label', `Calendar days with a plan, by month, ${ends}`)} style="--atl-cols:${cols}">
      ${rows.map((row) => `<div class="atl-months-row">${row.map(barHtml).join('')}</div>`).join('')}
    </div>
  </div>`;
}

/** The facts as a description list. '' when there is none. */
export function factsHtml(stats, pins) {
  const rows = factRows(stats, pins);
  if (!rows.length) return '';
  return `<dl class="atl-facts">${rows.map((row) => `<div><dt>${esc(row.label)}</dt><dd>${esc(row.value)}<span>${esc(row.note)}</span></dd></div>`).join('')}</dl>`;
}
