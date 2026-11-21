// The trip map (blueprint 1.3, D6, 3.4, 8.3, 8.4, risk 4). The only file that knows Leaflet and the
// tile provider. Owner: F7.
//
//   tripMapHtml(map, opts)     the one [data-trip-map] node the controller keeps in a map slot: a box that
//                              reserves its height and holds "Open full map" and then the stage (the drawn
//                              fallback, the Leaflet canvas, zoom buttons, attribution), and the full-screen
//                              <dialog> with its own day row. A view's wishes come from its map slot:
//                              data-map-full="off" and data-map-caption="<id>" (ruling R29, see the JSDoc)
//   mapCaptionHtml(map, opts)  the map-caption region a view places near the slot; the map names it as
//                              its description and swaps in "Open day N" and "Show all days" for a day
//   mapFallbackSvg(points)     the drawing that stands in until Leaflet has loaded and whenever the
//                              library or the tiles fail: every stop to scale, without a base map
//   mountTripMap(el, opts)     behaviour. Leaflet and its stylesheet are imported on demand when the node
//                              nears the viewport. Returns { focusDay, getState, setPoints, setTheme,
//                              invalidate, destroy, openFull, closeFull }
//
// Hooks: [data-map-day="<n or 0>"] selects a day, [data-action="map-full"] opens full screen. The map
// listens for both inside its page root (the nearest [data-view] ancestor), so the day index and a
// view's own button work without more wiring. Markers are pointer targets only (keyboard: false, data-day="<n>");
// the day controls are the keyboard path. State on the node: data-map-state (empty, idle, loading,
// live, fallback), data-map-full (on, off), data-map-focus (the selected day, 0 for all).
import { esc, attr, cls, button, link } from './html.js';
import { icon } from './icons.js';
import { kmBetween, cleanPoints } from '../../lib/geo.js';
import { prefersReducedMotion } from '../../lib/motion.js';
import { THEME_EVENT, effectiveTheme } from '../../lib/theme.js';

/**
 * The tile provider, in one place (risk 4): OpenStreetMap's public raster tiles. Their usage policy asks
 * for visible attribution and light use, and promises no uptime, which is what the drawn fallback is for.
 */
export const TILE_PROVIDER = Object.freeze({
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
  attributionHref: 'https://www.openstreetmap.org/copyright',
  minZoom: 2,
  maxZoom: 19,
});
/** The id of the caption region unless a view asks for another. */
export const MAP_CAPTION_ID = 'tv-map-caption';

const FRAME = { w: 400, h: 250, pad: 36, edge: 16 }; // the fallback drawing, 16 by 10
const SAME_PLACE_KM = 50; // stops this close to each other are one place when a day is given its point
const MIN_SPAN_KM = 0.2; // stops closer than this are not blown up to fill the frame
const BADGE_GAP = { drawn: 28, live: 34 }; // least distance between two day badges, in px
const STOP_GAP = { drawn: 22, live: 30 };
// Whole zoom levels only: at a half step Leaflet scales the tiles, their edges show as thin lines
// across the map and the labels of the base map blur.
const ZOOM_SNAP = 1;
const NEAR_VIEWPORT = '600px 0px';
const NOTE_FAILED = 'The map background could not load. Stops are still drawn in their places.';
const ID = /^[A-Za-z][\w:-]*$/;
const MINUS_ICON = '<svg class="ui-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/></svg>';

const fmt = (value) => +value.toFixed(1) || 0;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const toneOf = (colorIndex, dayNumber) => (Number.isInteger(colorIndex) && colorIndex >= 1 && colorIndex <= 7 ? colorIndex : ((dayNumber - 1) % 7) + 1);
const wrapLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;
const usablePoints = (points) => cleanPoints(points).filter((p) => Number.isInteger(p.dayNumber) && p.dayNumber >= 1);

/**
 * Where a day is on the map: the middle of the largest group of its stops, never the mean of stops in
 * two cities (a day that flies from one town to another would land in the country between them). A
 * group is the stops within SAME_PLACE_KM of one stop; the stop with the most neighbours leads, the
 * earlier one when two are level. A day inside one town is the middle of all its stops, as before.
 * @param {Array<{ lat: number, lng: number }>} stops  one day's stops, longitudes already continuous
 * @returns {[number, number]}
 */
function dayCenter(stops) {
  const groups = stops.map((lead) => stops.filter((stop) => kmBetween([lead.lat, wrapLng(lead.lng)], [stop.lat, wrapLng(stop.lng)]) <= SAME_PLACE_KM));
  const group = groups.reduce((best, next) => (next.length > best.length ? next : best), groups[0]);
  const mean = (key) => group.reduce((sum, stop) => sum + stop[key], 0) / group.length;
  return [mean('lat'), mean('lng')];
}

/**
 * The days that have a stop on the map, in day order: { dayNumber, dayIndex, colorIndex, stops (in
 * stop order), center: [lat, lng] (where most of the day's stops are, see dayCenter) }. Longitudes are made continuous
 * with the first stop, so a trip across the 180th meridian stays in one piece. The input is not changed.
 * @param {Array<import('../contract.js').MapPoint>} points
 */
export function mapDays(points) {
  const usable = usablePoints(points);
  if (!usable.length) return [];
  const origin = usable[0].lng;
  const near = (lng) => lng + Math.round((origin - lng) / 360) * 360;
  const byDay = new Map();
  for (const p of usable) byDay.set(p.dayNumber, [...(byDay.get(p.dayNumber) ?? []), { ...p, lng: near(p.lng) }]);
  return [...byDay.entries()].sort(([a], [b]) => a - b).map(([dayNumber, list]) => {
    const stops = [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return {
      dayNumber, dayIndex: Number.isInteger(stops[0].dayIndex) ? stops[0].dayIndex : dayNumber - 1,
      colorIndex: toneOf(stops[0].colorIndex, dayNumber), stops, center: dayCenter(stops),
    };
  });
}

/**
 * Positions nudged apart until no two are closer than `min` (badges that would sit on top of each
 * other). Positions that already have room do not move. Returns new objects; the same input gives the
 * same output.
 * @param {Array<{ x: number, y: number }>} positions
 * @param {number} min
 */
export function spreadApart(positions, min) {
  const out = positions.map(({ x, y }) => ({ x, y }));
  for (let round = 0; round < 80; round += 1) {
    let moved = false;
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const [dx, dy] = [out[j].x - out[i].x, out[j].y - out[i].y];
        const gap = Math.hypot(dx, dy);
        if (gap >= min) continue;
        // Two positions on one spot have no direction between them: fan them out by index.
        const angle = gap < 0.01 ? j * 2.4 : Math.atan2(dy, dx);
        const push = (min - gap) / 2 + 0.01;
        out[i] = { x: out[i].x - Math.cos(angle) * push, y: out[i].y - Math.sin(angle) * push };
        out[j] = { x: out[j].x + Math.cos(angle) * push, y: out[j].y + Math.sin(angle) * push };
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/** True when a batch of tiles has failed: at least two errors, and more errors than arrivals. */
export function tilesFailing({ loaded = 0, failed = 0 } = {}) {
  return failed >= 2 && failed > loaded;
}

// --- The drawn fallback -------------------------------------------------------------------------------

// Frame positions of stops, to scale: kilometres east and north of the middle (distances from geo.js).
function frameSpots(stops) {
  const lats = stops.map((stop) => stop.lat);
  const lngs = stops.map((stop) => stop.lng);
  const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const middle = [(Math.min(...lats) + Math.max(...lats)) / 2, wrapLng(midLng)];
  const km = stops.map((stop) => [
    Math.sign(stop.lng - midLng) * kmBetween(middle, [middle[0], wrapLng(stop.lng)]),
    Math.sign(stop.lat - middle[0]) * kmBetween(middle, [stop.lat, middle[1]]),
  ]);
  const span = (axis) => Math.max(...km.map((at) => at[axis])) - Math.min(...km.map((at) => at[axis]));
  const mid = (axis) => (Math.max(...km.map((at) => at[axis])) + Math.min(...km.map((at) => at[axis]))) / 2;
  const scale = Math.min((FRAME.w - 2 * FRAME.pad) / Math.max(span(0), MIN_SPAN_KM), (FRAME.h - 2 * FRAME.pad) / Math.max(span(1), MIN_SPAN_KM));
  return km.map(([east, north]) => ({ x: FRAME.w / 2 + (east - mid(0)) * scale, y: FRAME.h / 2 - (north - mid(1)) * scale }));
}

const insideFrame = ({ x, y }) => ({ x: Math.min(FRAME.w - FRAME.edge, Math.max(FRAME.edge, x)), y: Math.min(FRAME.h - FRAME.edge, Math.max(FRAME.edge, y)) });
const settle = (spots, gap) => spreadApart(spreadApart(spots, gap).map(insideFrame), gap).map(insideFrame);
const toneStyle = (colorIndex) => ` style="--tone:var(--day-${colorIndex})"`;
const FRAME_GRID = [...Array.from({ length: 7 }, (_, i) => `M${(i + 1) * 50} 0V${FRAME.h}`), ...Array.from({ length: 4 }, (_, i) => `M0 ${(i + 1) * 50}H${FRAME.w}`)].join('');

/**
 * The stops drawn to scale without a base map: one dot a stop and one numbered badge a day, or, for a
 * selected day, that day's stops numbered in order along its route.
 * @param {Array<import('../contract.js').MapPoint>} points
 * @param {{ day?: number, byOrder?: boolean }} [opts] day: a day number; 0 or a day without stops shows every
 *   day. byOrder: number the stops of the selected day by MapPoint.order, their place in the day, and not
 *   by their place among the stops drawn, so the numbers match a list that also holds the stops with no
 *   coordinates (the day panel)
 * @returns {string} '' when nothing can be placed
 */
export function mapFallbackSvg(points, { day = 0, byOrder = false } = {}) {
  const days = mapDays(points);
  if (!days.length) return '';
  const selected = days.find((entry) => entry.dayNumber === day) ?? null;
  const shown = selected ? [selected] : days;
  const stops = shown.flatMap((entry) => entry.stops.map((stop) => ({ ...stop, tone: entry.colorIndex })));
  const spots = frameSpots(stops);
  const label = selected ? `The stops of day ${selected.dayNumber} in order, drawn without a base map` : 'Where each day happens, drawn without a base map';
  let marks = '';
  if (selected) {
    const route = spots.length > 1 ? `<path class="tv-map-froute" d="M${spots.map(({ x, y }) => `${fmt(x)} ${fmt(y)}`).join('L')}"/>` : '';
    marks = route + settle(spots, STOP_GAP.drawn).map(({ x, y }, i) => `<g class="tv-map-fmark"><title>${esc(stops[i].title)}</title>`
      + `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="10"/><text class="tv-map-fstop" x="${fmt(x)}" y="${fmt(y)}">${byOrder && Number.isInteger(stops[i].order) && stops[i].order > 0 ? stops[i].order : i + 1}</text></g>`).join('');
  } else {
    const dots = spots.map(({ x, y }, i) => `<circle class="tv-map-fdot" cx="${fmt(x)}" cy="${fmt(y)}" r="3"${toneStyle(stops[i].tone)}/>`).join('');
    let from = 0;
    const middles = days.map((entry) => {
      const own = spots.slice(from, from + entry.stops.length);
      from += entry.stops.length;
      return { x: own.reduce((sum, at) => sum + at.x, 0) / own.length, y: own.reduce((sum, at) => sum + at.y, 0) / own.length };
    });
    marks = dots + settle(middles, BADGE_GAP.drawn).map(({ x, y }, i) => `<g class="tv-map-fbadge"${toneStyle(days[i].colorIndex)}>`
      + `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="12"/><text x="${fmt(x)}" y="${fmt(y)}">${days[i].dayNumber}</text></g>`).join('');
  }
  return `<svg class="tv-map-fsvg" viewBox="0 0 ${FRAME.w} ${FRAME.h}" preserveAspectRatio="xMidYMid meet" role="img"${attr('aria-label', label)}`
    + `${selected ? toneStyle(selected.colorIndex) : ''}><path class="tv-map-fgrid" d="${FRAME_GRID}"/>${marks}</svg>`;
}

// --- Markup -------------------------------------------------------------------------------------------

const dayRowHtml = (days, day) => `<button type="button" class="tv-map-day" data-map-day="0" data-focus-key="map-day-0" aria-pressed="${day === 0}">All days</button>`
  + days.map((entry) => `<button type="button" class="tv-map-day tv-map-day--tone" data-map-day="${entry.dayNumber}" data-focus-key="map-day-${entry.dayNumber}"`
    + ` aria-pressed="${day === entry.dayNumber}"${toneStyle(entry.colorIndex)}><span class="ui-vh">Day </span>${entry.dayNumber}</button>`).join('');

// What the caption says. `within` is 'page' or 'dialog': the dialog has its own day row, so no "Show all days" there.
function captionInner(days, { day = 0, rows = [], areas = [], within = 'page' } = {}) {
  const selected = days.find((entry) => entry.dayNumber === day) ?? null;
  // The one count of stops is the facts' count: every stop of the plan, on the map or not. The rows of
  // model.days carry it; without them the placed stops are all that is known. Where fewer are placed,
  // the caption says so, so "103 stops" in the facts is never "46 stops" here.
  const listed = (Array.isArray(rows) ? rows : []).filter((entry) => Number.isFinite(entry?.stops));
  if (!selected) {
    const placed = days.reduce((sum, entry) => sum + entry.stops.length, 0);
    const count = Math.max(placed, listed.reduce((sum, entry) => sum + entry.stops, 0));
    const span = Math.max(days.length, listed.length);
    const onMap = count > placed ? `, ${placed} of them on the map` : '';
    const busiest = (Array.isArray(areas) ? areas : []).filter((area) => area && String(area.name ?? '').trim())
      .sort((a, b) => (b.stops ?? 0) - (a.stops ?? 0)).slice(0, 2).map((area) => String(area.name).trim());
    const where = busiest.length === 2 ? ` Busiest areas: ${busiest[0]} and ${busiest[1]}.` : busiest.length === 1 ? ` Busiest area: ${busiest[0]}.` : '';
    const text = span === 1 ? `${plural(count, 'stop')} on day ${days[0].dayNumber}${onMap}.`
      : `${plural(count, 'stop')} across ${span} days${onMap}. Each number marks a day. Pick a day to see its stops in order.`;
    return `<span class="tv-map-caption-text">${esc(text + where)}</span>`;
  }
  const row = (Array.isArray(rows) ? rows : []).find((entry) => entry?.dayNumber === selected.dayNumber);
  const name = `Day ${selected.dayNumber}${row?.dateText ? `, ${row.dateText}` : ''}${row?.title ? `. ${row.title}` : ''}`;
  const open = button(`Open day ${selected.dayNumber}`, { cls: 'ui-btn ui-btn--small', focusKey: within === 'dialog' ? 'map-open-day-full' : 'map-open-day', attrs: { 'data-day-jump': selected.dayIndex } });
  const back = within === 'dialog' ? '' : button('Show all days', { cls: 'ui-btn ui-btn--small', focusKey: 'map-all-days', attrs: { 'data-map-day': 0 } });
  const all = Number.isFinite(row?.stops) ? Math.max(row.stops, selected.stops.length) : selected.stops.length;
  const said = all > selected.stops.length ? `${plural(all, 'stop')}, ${selected.stops.length} of them on the map in order.` : `${plural(all, 'stop')} in order.`;
  return `<span class="tv-map-caption-text">${esc(`${name}: ${said}`)}</span>${open}${back}`;
}

/**
 * The caption of the map: the region `map-caption` (section 3.4). A view places it near its map slot,
 * outside the slot. While a day is selected the mounted map shows that day's caption in it, with
 * "Open day N" (data-day-jump) and "Show all days" (data-map-day="0"), and puts the view's words back after.
 * @param {{ points: Array<import('../contract.js').MapPoint> }} map
 * @param {{ day?: number, id?: string, areas?: Array<{ name: string, stops: number }>, days?: Array<{ dayNumber: number, title: string, dateText: string }>, cls?: any }} [opts]
 *   areas: model.areas, to name the two busiest; days: model.days, to name the selected day
 * @returns {string} '' when nothing can be placed
 */
export function mapCaptionHtml(map, { day = 0, id, areas, days: rows, cls: extra } = {}) {
  const days = mapDays(map?.points);
  if (!days.length) return '';
  return `<div class="${cls('tv-map-caption', extra)}" id="${ID.test(id ?? '') ? id : MAP_CAPTION_ID}" data-region="map-caption">${captionInner(days, { day, rows, areas })}</div>`;
}

/**
 * The map node. It is drawn even when nothing can be placed (hidden, data-map-state="empty"), so that
 * points which arrive later can fill it through setPoints().
 *
 * A view asks for fullButton and captionId with attributes on its map slot (ruling R29), and the
 * controller passes them on as it reads them:
 *   tripMapHtml(model.map, { fullButton: slot.dataset.mapFull, captionId: slot.dataset.mapCaption })
 * - data-map-full="off" on the slot: fullButton 'off' (false does the same). The node has no "Open full
 *   map"; the view draws its own button with data-action="map-full" anywhere in the page root, and the
 *   mounted map answers it. (The node's own data-map-full is something else: its full-screen state.)
 * - data-map-caption="<id>" on the slot: captionId, the id of the view's own caption element. The node
 *   names it as its description, and the mounted map writes a selected day's caption into it and puts
 *   the view's words back after.
 * A slot without an attribute (undefined, null or '') gets the default: the button, and MAP_CAPTION_ID.
 *
 * "Open full map" comes before the stage in the markup, so the tab order is the order seen: Open full
 * map, Zoom in, Zoom out, the attribution (ruling R32). maps.css keeps the button in its corner.
 * @param {{ points: Array<import('../contract.js').MapPoint>, dayCount?: number }} map
 * @param {{ captionId?: string|null, label?: string, fullButton?: boolean|'on'|'off'|null, day?: number }} [opts]
 *   captionId: the id of the element that describes the map; anything that is not an id means MAP_CAPTION_ID.
 *   fullButton: only false and 'off' leave the button out.
 *   label: the accessible name of the map. day: a day number to draw selected from the start.
 *   byOrder: number the stops of the selected day by MapPoint.order (the map of one day, whose list has every stop).
 * @returns {string}
 */
export function tripMapHtml(map, { captionId, label = 'Trip map', fullButton = true, day = 0, byOrder = false } = {}) {
  const days = mapDays(map?.points);
  const points = days.flatMap((entry) => entry.stops);
  const shown = days.some((entry) => entry.dayNumber === day) ? day : 0;
  const zoomButton = (action, name, html) => button(name, { cls: 'tv-map-zoom-btn', action, html, attrs: { 'aria-label': name } });
  const full = fullButton === false || fullButton === 'off' ? '' : button('Open full map', { cls: 'tv-map-btn tv-map-full', action: 'map-full', html: `${icon('expand', 18)}<span>Open full map</span>` });
  return `<section class="tv-map" data-trip-map data-carry="map" data-map-state="${points.length ? 'idle' : 'empty'}" data-map-full="off" data-map-focus="${shown}"`
    + `${attr('aria-label', label || 'Trip map')}${attr('aria-describedby', ID.test(captionId ?? '') ? captionId : MAP_CAPTION_ID)}${attr('hidden', !points.length)}>`
    + `<div class="tv-map-box" data-map-box>${full}<div class="tv-map-stage" data-map-stage>`
    + `<div class="tv-map-fallback" data-map-fallback>${mapFallbackSvg(points, { day: shown, byOrder })}</div>`
    + '<div class="tv-map-canvas" data-map-canvas hidden></div>'
    + `<div class="tv-map-zoom" data-map-zoom hidden>${zoomButton('map-zoom-in', 'Zoom in', icon('plus', 20))}${zoomButton('map-zoom-out', 'Zoom out', MINUS_ICON)}</div>`
    + `<p class="tv-map-attr" data-map-attr hidden>${link(TILE_PROVIDER.attributionHref, TILE_PROVIDER.attribution, { cls: 'tv-map-attr-link', focusKey: 'map-attribution', html: `<span>${esc(TILE_PROVIDER.attribution)}</span>` })}</p>`
    + '<p class="tv-map-note" data-map-note role="status"></p></div></div>'
    + '<dialog class="tv-map-dialog" data-map-dialog aria-label="Trip map, full screen"><div class="tv-map-dialog-bar">'
    + `${button('Close map', { cls: 'tv-map-btn tv-map-close', action: 'map-close', html: `${icon('close', 18)}<span>Close map</span>` })}`
    + `<div class="tv-map-days" data-map-days data-keep-scroll role="group" aria-label="Days on the map">${dayRowHtml(days, shown)}</div></div>`
    + '<div class="tv-map-dialog-stage" data-map-dialog-slot></div><div class="tv-map-dialog-caption" data-map-dialog-caption></div></dialog></section>';
}

// --- Behaviour ----------------------------------------------------------------------------------------

// Leaflet's main build also sets window.L; noConflict() takes that back, so nothing global is left behind.
const importLeaflet = () => Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([module]) => {
  const library = module.default ?? module;
  return typeof library.noConflict === 'function' ? library.noConflict() : library;
});

/** One live handle per node: mounting a node again (after it was carried into new markup) returns it. */
const MOUNTED = new WeakMap();
/** How long after a live map was let go a map mounted on the same page counts as taking its place. */
const TAKEOVER_MS = 1500;
/** The last live map that was destroyed: { doc, at }. A view switch destroys one map and mounts the next. */
let lastLive = null;

/**
 * True when a map mounted now takes the place of a live one: the page was drawn again (a view switch)
 * and the reader already had a live map, so the new one goes live without waiting to be near the
 * viewport. The library is here by then, so nothing new is downloaded but the tiles.
 * @param {{ doc: object, at: number }|null} last  the live map that was destroyed last
 * @param {object} doc  the document of the map being mounted
 * @param {number} now  ms
 * @returns {boolean}
 */
export function takesOverLive(last, doc, now) {
  if (!last || !doc || last.doc !== doc || !Number.isFinite(last.at) || !Number.isFinite(now)) return false;
  return now >= last.at && now - last.at <= TAKEOVER_MS;
}
const INERT_STATE = Object.freeze({ status: 'empty', day: 0, full: false, theme: 'dark', points: 0, days: [], failure: '', zoom: null, center: null, tileFilter: '' });
const inertHandle = () => ({ focusDay() {}, getState: () => INERT_STATE, setPoints() {}, setTheme() {}, invalidate() {}, destroy() {}, openFull() {}, closeFull() {} });

/**
 * Brings a tripMapHtml() node to life. The drawing shows first; Leaflet replaces it once the node is
 * near the viewport and the library has arrived, and the drawing returns whenever the library or the
 * tiles fail (and the map is tried again when the browser is back online).
 * @param {Element} el the [data-trip-map] node
 * @param {{ points?: Array<import('../contract.js').MapPoint>, days?: Array<{ dayNumber: number, title: string, dateText: string }>,
 *   root?: Element|string, theme?: 'dark'|'light', day?: number, eager?: boolean, onChange?: (state: object) => void, signal?: AbortSignal }} [opts]
 *   points: the points tripMapHtml() drew. Pass them on every first mount. An empty list means no map:
 *   the node hides itself (state empty) until setPoints() gives it some. With the option left out, a node
 *   that was drawn with points stays as it was drawn (in sight, a picture, no live map) until setPoints().
 *   root: where day controls, a view's own "Open full map" button and the caption live: an element, or a selector
 *   for el.closest(). By default the nearest [data-view] ancestor, which is the trip page root.
 *   eager: true makes the map go live at once, without waiting to be near the viewport (for a controller
 *   that knows the map it replaces was live). A map mounted right after a live one on the same page was
 *   destroyed does this by itself (takesOverLive), so a view switch on a scrolled page keeps a live map.
 * @returns {{ focusDay: (dayNumber: number, opts?: { instant?: boolean }) => void, getState: () => object,
 *   setPoints: (points: Array<object>, more?: { days?: Array<object> }) => void, setTheme: (theme: string) => void,
 *   invalidate: () => void, destroy: () => void, openFull: (from?: Element) => void, closeFull: () => void }}
 */
export function mountTripMap(el, opts = {}) {
  const part = (name) => el?.querySelector?.(`[data-map-${name}]`) ?? null;
  const ui = { box: part('box'), stage: part('stage'), fallback: part('fallback'), canvas: part('canvas'), zoom: part('zoom'), credit: part('attr'),
    note: part('note'), dialog: part('dialog'), slot: part('dialog-slot'), dayRow: part('days'), dialogCaption: part('dialog-caption') };
  if (!ui.box || !ui.stage || !ui.fallback || !ui.canvas) return inertHandle();
  const mounted = MOUNTED.get(el);
  if (mounted) {
    if (Array.isArray(opts.points)) mounted.setPoints(opts.points, { days: opts.days });
    return mounted;
  }
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  // Where the day controls and the caption live. Looked up on every use, so it follows the node when a
  // full re-render carries it into a new page root.
  const rootOf = () => (typeof opts.root === 'string' ? el.closest(opts.root) : opts.root?.isConnected ? opts.root : el.closest('[data-view]')) ?? el;
  const captionId = el.getAttribute('aria-describedby') || MAP_CAPTION_ID;
  const canvasClass = ui.canvas.className;
  const stop = new AbortController();
  const listen = { signal: stop.signal };

  let points = usablePoints(opts.points);
  let days = mapDays(points);
  let rows = Array.isArray(opts.days) ? opts.days : [];
  // Mounted without the points option: what tripMapHtml() drew is not emptied. The node stays a picture
  // until setPoints() brings the points, and only then can it become a live map.
  let asDrawn = !Array.isArray(opts.points) && el.getAttribute('data-map-state') === 'idle';
  let status = points.length || asDrawn ? 'idle' : 'empty';
  let failure = ''; // 'library' or 'tiles' while the status is 'fallback'
  let day = 0;
  let full = false;
  let theme = effectiveTheme();
  let tileFilter = '';
  let L = null;
  let map = null;
  let tiles = null;
  let layer = null;
  let batch = { loaded: 0, failed: 0 };
  let viewSet = false;
  let fittedSize = '';
  let viewport = null;
  let resizer = null;
  let opener = null;
  let caption = { el: null, base: '', written: null, watch: null };
  let dialogCaption = null;
  const eager = opts.eager === true || takesOverLive(lastLive, doc, Date.now());

  const selectedDay = () => days.find((entry) => entry.dayNumber === day) ?? null;
  const places = (list) => list.map((p) => `${p.dayNumber}:${p.order}:${p.lat}:${p.lng}`).join('|');
  const titles = (list) => list.map((p) => p.title).join('|');
  const coarsePointer = () => Boolean(win.matchMedia?.('(pointer: coarse)').matches);
  const getState = () => ({
    status, day, full, theme, points: points.length, days: days.map((entry) => entry.dayNumber), failure, tileFilter,
    zoom: map && viewSet ? map.getZoom() : null, center: map && viewSet ? [map.getCenter().lat, map.getCenter().lng] : null,
  });
  const changed = () => { try { opts.onChange?.(getState()); } catch (error) { console.warn('Trip map: onChange failed', error); } };

  // The caption belongs to the view. A selected day's caption is shown in its place and the view's words
  // come back after; whatever a patch writes in between is taken as the view's new words.
  function findCaption() {
    const root = rootOf();
    return root.querySelector(`#${win.CSS.escape(captionId)}`) ?? root.querySelector('[data-region="map-caption"]') ?? doc.getElementById(captionId);
  }
  function syncCaption() {
    const found = findCaption();
    if (found !== caption.el) {
      caption.watch?.disconnect();
      const watch = found && typeof win.MutationObserver === 'function' ? new win.MutationObserver(() => { if (caption.el && caption.el.innerHTML !== (caption.written ?? caption.base)) syncCaption(); }) : null;
      watch?.observe(found, { childList: true, characterData: true, subtree: true });
      caption = { el: found, base: '', written: null, watch };
    }
    const inDialog = asDrawn ? '' : captionInner(days, { day, rows, within: 'dialog' });
    if (ui.dialogCaption && inDialog !== dialogCaption) {
      ui.dialogCaption.innerHTML = inDialog;
      dialogCaption = inDialog;
    }
    const target = caption.el;
    if (!target) return;
    if (!target.id) target.id = captionId;
    const base = caption.written === null || target.innerHTML !== caption.written ? target.innerHTML : caption.base;
    const selected = selectedDay();
    if (!selected) {
      if (caption.written !== null && target.innerHTML === caption.written) writeCaption(target, base);
      caption = { ...caption, base, written: null };
      return;
    }
    writeCaption(target, captionInner(days, { day, rows }));
    caption = { ...caption, base, written: target.innerHTML };
  }
  function writeCaption(target, html) {
    const held = target.contains(doc.activeElement);
    target.innerHTML = html;
    if (!held) return;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }

  function syncControls() {
    const controls = new Set([...el.querySelectorAll('[data-map-day]'), ...rootOf().querySelectorAll('[data-map-day]')]);
    for (const control of controls) {
      if (control.closest('[data-region="map-caption"], [data-map-dialog-caption]')) continue;
      const on = Number(control.getAttribute('data-map-day')) === day;
      control.classList.toggle('is-map-day', on);
      if (control.matches('button, [role="button"]')) control.setAttribute('aria-pressed', String(on));
      // The dialog's day row scrolls sideways: keep the day that is on in sight.
      if (on && ui.dayRow?.contains(control) && ui.dayRow.clientWidth) ui.dayRow.scrollLeft = control.offsetLeft - (ui.dayRow.clientWidth - control.offsetWidth) / 2;
    }
    if (!map || !ui.zoom) return;
    const [zoomIn, zoomOut] = [ui.zoom.querySelector('[data-action="map-zoom-in"]'), ui.zoom.querySelector('[data-action="map-zoom-out"]')];
    if (zoomIn) zoomIn.disabled = viewSet && map.getZoom() >= map.getMaxZoom();
    if (zoomOut) zoomOut.disabled = viewSet && map.getZoom() <= map.getMinZoom();
  }

  function render() {
    const live = status === 'live';
    const selected = selectedDay();
    el.hidden = status === 'empty';
    el.dataset.mapState = status;
    el.dataset.mapFull = full ? 'on' : 'off';
    el.dataset.mapFocus = String(day);
    el.dataset.mapTheme = theme;
    ui.canvas.hidden = !live;
    ui.fallback.hidden = live;
    if (ui.zoom) ui.zoom.hidden = !live;
    if (ui.credit) ui.credit.hidden = !live;
    if (!live && !asDrawn) ui.fallback.innerHTML = mapFallbackSvg(points, { day, byOrder: opts.byOrder === true });
    if (ui.note) ui.note.textContent = status === 'fallback' ? NOTE_FAILED : '';
    if (selected) ui.stage.style.setProperty('--tv-map-tone', `var(--day-${selected.colorIndex})`);
    else ui.stage.style.removeProperty('--tv-map-tone');
    syncControls();
    syncCaption();
  }

  // --- Leaflet ---
  function setRoaming() {
    if (!map) return;
    // On a touch screen the inline map leaves swipes to the page; in full screen it takes them.
    const free = full || !coarsePointer();
    for (const handler of [map.dragging, map.touchZoom]) { if (free) handler.enable(); else handler.disable(); }
  }

  function drawLayers() {
    if (!map || !layer || !viewSet) return;
    layer.clearLayers();
    const at = (stop) => [stop.lat, stop.lng];
    const pin = (latlng, kind, { text = '', tone, title = '', dayNumber, onClick = null }) => {
      const size = kind === 'dot' ? 12 : 44;
      const face = `<span class="tv-map-pin-face" style="--tone:var(--day-${tone})">${esc(text)}</span>`;
      const marker = L.marker(latlng, { icon: L.divIcon({ className: `tv-map-pin tv-map-pin--${kind}`, html: face, iconSize: [size, size] }),
        keyboard: false, interactive: kind !== 'dot', title, zIndexOffset: kind === 'dot' ? 0 : 500 }).addTo(layer);
      marker.getElement()?.setAttribute('data-day', String(dayNumber));
      if (onClick) marker.on('click', onClick);
    };
    const selected = selectedDay();
    if (selected) {
      if (selected.stops.length > 1) L.polyline(selected.stops.map(at), { className: 'tv-map-route', interactive: false }).addTo(layer);
      const spots = spreadApart(selected.stops.map((stop) => map.latLngToLayerPoint(at(stop))), STOP_GAP.live);
      selected.stops.forEach((stop, i) => pin(map.layerPointToLatLng([spots[i].x, spots[i].y]), 'stop', { text: opts.byOrder === true && Number.isInteger(stop.order) && stop.order > 0 ? stop.order : i + 1, tone: selected.colorIndex, title: stop.title, dayNumber: selected.dayNumber }));
      return;
    }
    for (const entry of days) for (const stop of entry.stops) pin(at(stop), 'dot', { tone: entry.colorIndex, dayNumber: entry.dayNumber });
    const spots = spreadApart(days.map((entry) => map.latLngToLayerPoint(entry.center)), BADGE_GAP.live);
    days.forEach((entry, i) => pin(map.layerPointToLatLng([spots[i].x, spots[i].y]), 'day', {
      text: entry.dayNumber, tone: entry.colorIndex, title: `Day ${entry.dayNumber}`, dayNumber: entry.dayNumber, onClick: () => focusDay(entry.dayNumber),
    }));
  }

  function fit({ animate = false } = {}) {
    const stops = selectedDay()?.stops ?? days.flatMap((entry) => entry.stops);
    if (!map || !stops.length) return;
    const bounds = L.latLngBounds(stops.map((stop) => [stop.lat, stop.lng]));
    const [w, h] = [ui.canvas.clientWidth, ui.canvas.clientHeight];
    if (!w || !h) {
      // No size yet (a hidden tab panel): any view will do until the size is known.
      if (!viewSet) { map.setView(bounds.getCenter(), 11, { animate: false }); viewSet = true; }
      return;
    }
    // Room for "Open full map" (top left; a corner icon in a narrow box), the zoom buttons (right) and the attribution (bottom).
    const wide = w >= 420;
    const options = { paddingTopLeft: [wide ? 36 : 28, wide && !full ? 72 : 36], paddingBottomRight: [72, 48], maxZoom: day ? 16 : 15 };
    if (animate && viewSet && !prefersReducedMotion()) map.flyToBounds(bounds, { ...options, duration: 0.6 });
    else map.fitBounds(bounds, { ...options, animate: false });
    viewSet = true;
    fittedSize = `${w}x${h}`;
  }

  function startMap(library) {
    L = library;
    if (status !== 'loading') return;
    status = 'live';
    failure = '';
    render();
    if (!map) {
      const calm = prefersReducedMotion();
      map = L.map(ui.canvas, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, keyboard: false, boxZoom: false, zoomSnap: ZOOM_SNAP,
        minZoom: TILE_PROVIDER.minZoom, maxZoom: TILE_PROVIDER.maxZoom, fadeAnimation: !calm, zoomAnimation: !calm, markerZoomAnimation: !calm });
      tiles = L.tileLayer(TILE_PROVIDER.url, { minZoom: TILE_PROVIDER.minZoom, maxZoom: TILE_PROVIDER.maxZoom, referrerPolicy: 'strict-origin-when-cross-origin' })
        .on('loading', () => { batch = { loaded: 0, failed: 0 }; })
        .on('tileload', () => { batch = { ...batch, loaded: batch.loaded + 1 }; })
        .on('tileerror', () => { batch = { ...batch, failed: batch.failed + 1 }; if (status === 'live' && tilesFailing(batch)) failMap('tiles'); });
      layer = L.layerGroup().addTo(map);
      map.on('zoomend', () => { drawLayers(); syncControls(); });
      if (typeof win.ResizeObserver === 'function') {
        resizer = new win.ResizeObserver(() => invalidate());
        resizer.observe(ui.canvas);
      }
    }
    setRoaming();
    fit();
    tiles.addTo(map);
    drawLayers();
    setTheme(theme);
    syncControls();
    changed();
  }

  function failMap(reason) {
    failure = reason;
    status = 'fallback';
    render();
    changed();
  }

  function loadMap() {
    viewport?.disconnect();
    viewport = null;
    if (status !== 'idle' && !(status === 'fallback' && failure === 'library')) return;
    status = 'loading';
    render();
    if (L) { startMap(L); return; }
    importLeaflet().then((library) => { if (!stop.signal.aborted) startMap(library); }).catch((error) => {
      console.warn('Trip map: the map could not load, the drawing stays', error);
      if (!stop.signal.aborted && status === 'loading') failMap('library');
    });
  }

  function watchViewport() {
    if (viewport || status !== 'idle' || asDrawn) return;
    if (eager || typeof win.IntersectionObserver !== 'function') { loadMap(); return; }
    viewport = new win.IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) loadMap(); }, { rootMargin: NEAR_VIEWPORT });
    viewport.observe(el);
  }

  function retry() {
    if (status !== 'fallback') return;
    if (failure === 'library') { loadMap(); return; }
    status = 'live';
    failure = '';
    batch = { loaded: 0, failed: 0 };
    render();
    map.invalidateSize({ animate: false, pan: false });
    fit();
    tiles.redraw();
    drawLayers();
    changed();
  }

  // --- The handle ---
  function invalidate() {
    // The page around the node may be new (a re-render): its day controls and caption are brought in step.
    syncControls();
    syncCaption();
    if (!map || status !== 'live') return;
    map.invalidateSize({ animate: false, pan: false });
    if (`${ui.canvas.clientWidth}x${ui.canvas.clientHeight}` === fittedSize) return;
    fit();
    drawLayers();
  }

  function focusDay(dayNumber, { instant = false } = {}) {
    const next = days.some((entry) => entry.dayNumber === Number(dayNumber)) ? Number(dayNumber) : 0;
    const moved = next !== day;
    day = next;
    render();
    if (map && status === 'live') {
      drawLayers();
      fit({ animate: !instant });
    }
    if (moved) changed();
  }

  function setPoints(next, { days: nextRows } = {}) {
    if (Array.isArray(nextRows)) rows = nextRows;
    const cleaned = usablePoints(next);
    const moved = asDrawn || places(cleaned) !== places(points);
    if (!moved && titles(cleaned) === titles(points)) { syncControls(); syncCaption(); return; }
    asDrawn = false;
    points = cleaned;
    days = mapDays(points);
    if (!selectedDay()) day = 0;
    if (ui.dayRow) ui.dayRow.innerHTML = dayRowHtml(days, day);
    if (!points.length) {
      if (full) leaveFull({ restoreFocus: false });
      status = 'empty';
    } else if (status === 'empty') {
      status = 'idle';
    }
    render();
    if (status === 'idle') watchViewport();
    if (map && status === 'live') {
      drawLayers();
      if (moved) fit(); // a renamed stop keeps the zoom and pan the user chose
    }
    changed();
  }

  function setTheme(next) {
    theme = next === 'light' || next === 'dark' ? next : effectiveTheme();
    el.dataset.mapTheme = theme;
    // The tile filter is a theme-qualified variable in maps.css; this reads what now applies.
    tileFilter = win.getComputedStyle(ui.stage).getPropertyValue('--tv-map-tile-filter').trim();
  }

  function openFull(from) {
    if (full || status === 'empty' || !ui.dialog || !ui.slot) return;
    opener = typeof from?.focus === 'function' ? from : doc.activeElement;
    ui.slot.appendChild(ui.stage);
    try {
      if (!ui.dialog.open) ui.dialog.showModal();
    } catch (error) {
      ui.box.append(ui.stage);
      console.warn('Trip map: full screen is not available', error);
      return;
    }
    full = true;
    setRoaming();
    render();
    invalidate();
    changed();
  }

  function leaveFull({ restoreFocus = true } = {}) {
    if (!full) return;
    full = false;
    ui.box.append(ui.stage);
    if (ui.dialog.open) ui.dialog.close();
    setRoaming();
    render();
    invalidate();
    const back = opener?.isConnected ? opener : el.querySelector('[data-action="map-full"]');
    opener = null;
    if (restoreFocus) back?.focus?.({ preventScroll: true });
    changed();
  }

  function destroy() {
    if (stop.signal.aborted) return;
    MOUNTED.delete(el);
    if (full) leaveFull({ restoreFocus: false });
    stop.abort();
    viewport?.disconnect();
    resizer?.disconnect();
    caption.watch?.disconnect();
    if (caption.el && caption.written !== null && caption.el.innerHTML === caption.written) caption.el.innerHTML = caption.base;
    if (map && status === 'live') lastLive = { doc, at: Date.now() };
    map?.remove();
    map = null;
    layer = null;
    tiles = null;
    // What is left is the drawing, as before the map was mounted: no day selected, so the view's caption
    // stays back and no day control reads as pressed.
    ui.canvas.className = canvasClass;
    status = points.length || asDrawn ? 'idle' : 'empty';
    day = 0;
    render();
  }

  // One listener on the document, so the wiring survives a re-render of the page root.
  function onClick(event) {
    const target = typeof event.target?.closest === 'function' ? event.target : null;
    if (!target || !(el.contains(target) || rootOf().contains(target))) return;
    // A page can hold more than one map (the trip map and the map of an open day): a click inside another map is not ours.
    const inMap = target.closest('[data-trip-map]');
    if (inMap && inMap !== el) return;
    const dayControl = target.closest('[data-map-day]');
    if (dayControl) { focusDay(dayControl.getAttribute('data-map-day')); return; }
    const control = target.closest('[data-action]');
    const action = control?.getAttribute('data-action');
    if (action === 'map-full') openFull(control);
    else if (action === 'map-close') leaveFull();
    else if (action === 'map-zoom-in') map?.zoomIn();
    else if (action === 'map-zoom-out') map?.zoomOut();
  }

  doc.addEventListener('click', onClick, listen);
  if (ui.dialog) {
    // Escape closes the dialog: the stage moves back first, so the inline box is never seen empty.
    ui.dialog.addEventListener('cancel', (event) => { event.preventDefault(); leaveFull(); }, listen);
    ui.dialog.addEventListener('close', () => leaveFull(), listen);
    // "Open day N" inside the dialog leaves full screen before the page jumps to the day.
    ui.dialog.addEventListener('click', (event) => { if (event.target?.closest?.('[data-day-jump]')) leaveFull({ restoreFocus: false }); }, { ...listen, capture: true });
  }
  win.addEventListener(THEME_EVENT, (event) => setTheme(event.detail?.theme), listen);
  win.addEventListener('online', retry, listen);
  opts.signal?.addEventListener('abort', destroy, { once: true });

  setTheme(opts.theme);
  render();
  watchViewport();
  if (opts.day) focusDay(opts.day, { instant: true });

  const handle = { focusDay, getState, setPoints, setTheme, invalidate, destroy, openFull, closeFull: () => leaveFull() };
  MOUNTED.set(el, handle);
  return handle;
}
