// The Atlas plates as inline SVG: no map library, no tiles, works offline (blueprint 1.3, D6, section
// 10 rows 13, 23 and 27). Ported from previews/c-atlas/build/world.mjs. Pure builders: a plate is a
// string, and the Atlas page binds [data-place] itself. Distances and the projection are those of
// js/lib/geo.js; the land outline is generated (world-land.js) and shared by every plate on a page
// through landDefsSvg(). Owner: F7.
//
// A plate: { id?, label, view: { north, south, west, east } in degrees, cssW, land?: 'world' | 'europe'
// | 'apac', pins?: MapPin[], arcs?: [{ from, to, kind }], labels?: what placeLabels() returned,
// grat?: degrees between grid lines, scale?: pin size factor, selected?: a place key }.
//
// cssW is the width in CSS px the plate is REALLY shown at (ruling R32). The drawing is in world units
// and the browser scales it to its box, so cssW is the only thing that sizes the pins, the label type
// and the hit circles: a plate built for 720 px and shown 360 px wide has targets half the size. So:
// - measure the frame (clientWidth) and build the plate for that width, with placeLabels() given the
//   same plate, and build it again when the width changes (another layout, a resized window);
// - give the frame the shape of the view (plateView() takes the aspect), since the plate is fitted
//   inside its box ("meet"): in a frame of another shape it is drawn smaller than the frame is wide.
//   The hit circles allow for 4% (a border, a rounded height), not for more;
// - a missing or unusable cssW (not a number above 0) is read as 360.
// The plate cuts off what lies beyond its own box (maps.css), so a pin on the very edge shows in part.
import { esc, attr, cls, visuallyHidden } from './html.js';
import { mx, my, project, arcPath, cleanPoints } from '../../lib/geo.js';
import { LAND_WORLD } from './world-land.js';

/** The ids of the shared land outlines: a plate points at one with <use>. */
export const LAND_IDS = Object.freeze({ world: 'wm-land-world', europe: 'wm-land-europe', apac: 'wm-land-apac' });

const WHOLE_WORLD = Object.freeze({ north: 84, south: -58, west: -180, east: 180 });
const DEFAULT_WIDTH = 360;
const KINDS = ['past', 'home', 'up', 'live']; // paint order: past underneath, live on top
const CURRENCY = ['home', 'past', 'up', 'live']; // how current a place is: a live plan outranks everything
const ARC_KINDS = ['past', 'up', 'live'];
/** Radii in CSS px (previews/c-atlas/build/world.mjs). */
const DOT = { live: 5, up: 4.5, past: 3, home: 3.5 };
const RING_GAP = 3;
const PING_GAP = 5;
// A 44 px pointer target with one px to spare all round: the plate is fitted inside its frame, so a frame
// that is not quite the shape of the view (a border, a rounded height) draws it up to 4% smaller than cssW says.
const HIT_RADIUS = 23;
/** How far outside the view a pin is still drawn, in degrees: it can sit half on the edge. */
const EDGE = { lon: 6, lat: 4 };
const LABEL = { charW: 7.2, padX: 14, h: 22, gap: 10, font: 12, textX: 7, textY: 15.5, radius: 4, margin: 2, upcoming: 3, clear: 3, slideSteps: 4 };
const RINGS = /^[Mlz\d\s-]+$/;
const STATUS_WORDS = { live: 'in a plan running now', up: 'coming up', past: 'in past plans', home: '' };

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const kindOf = (pin) => (KINDS.includes(pin?.kind) ? pin.kind : 'past');
const paintRank = (pin) => KINDS.indexOf(kindOf(pin));
const currency = (pin) => CURRENCY.indexOf(kindOf(pin));
const usable = (pin) => Boolean(pin) && cleanPoints([pin.at]).length === 1;
const round1 = (value) => +value.toFixed(1);
const scaleOf = (plate) => (isNumber(plate?.scale) ? Math.min(2, Math.max(0.5, plate.scale)) : 1);

/**
 * The box of a plate from a latitude range, the longitude at its middle and its aspect ratio (width
 * over height), so the plate fills its frame exactly.
 * @returns {{ north: number, south: number, west: number, east: number }}
 */
export function plateView({ north, south, mid = 0, aspect = 16 / 10 }) {
  const half = ((my(south) - my(north)) * aspect) / 20;
  return { north, south, west: mid - half, east: mid + half };
}

// The plate's frame in world units, and how many of them make one CSS px.
function frameOf(plate) {
  const view = plate?.view;
  const ok = view && ['north', 'south', 'west', 'east'].every((side) => isNumber(view[side])) && view.east > view.west && view.north > view.south;
  const { north, south, west, east } = ok ? view : WHOLE_WORLD;
  const cssW = isNumber(plate?.cssW) && plate.cssW > 0 ? plate.cssW : DEFAULT_WIDTH;
  const [x0, x1, y0, y1] = [mx(west), mx(east), my(north), my(south)];
  return { north, south, west, east, x0, x1, y0, y1, cssW, u: (x1 - x0) / cssW };
}

const onPlate = (pin, frame, edge = EDGE) => {
  const [lat, lon] = pin.at;
  return lon >= frame.west - edge.lon && lon <= frame.east + edge.lon && lat <= frame.north + edge.lat && lat >= frame.south - edge.lat;
};

/** @returns {string} what pairs a pin with its button in the places list: the coordinates to about a kilometre; '' when it has none */
export function placeKey(pin) {
  if (!usable(pin)) return '';
  return pin.at.map((value) => value.toFixed(2).replace(/^-(0\.00)$/, '$1')).join(',');
}

const plansText = (count) => (count === 1 ? '1 plan' : `${count} plans`);

/**
 * One entry per place: pins that share coordinates become one, each plan counted once. Most current
 * first (live, upcoming, past, home), in the given order within a kind. The input is not changed.
 * @param {Array<import('../contract.js').MapPin>} pins
 * @returns {Array<{ key: string, at: [number, number], place: string, country: string, kind: string, home: boolean,
 *   tripIds: string[], count: number, label: string, href: string, todayHref: string|null, pins: object[] }>}
 */
export function groupPlaces(pins) {
  const byKey = new Map();
  for (const pin of Array.isArray(pins) ? pins.filter(usable) : []) {
    const key = placeKey(pin);
    byKey.set(key, [...(byKey.get(key) ?? []), pin]);
  }
  const groups = [...byKey.entries()].map(([key, members]) => {
    const lead = members.reduce((best, pin) => (currency(pin) > currency(best) ? pin : best));
    const ids = [lead, ...members.filter((pin) => pin !== lead)].flatMap((pin) => (Array.isArray(pin.tripIds) ? pin.tripIds : []));
    const tripIds = [...new Set(ids)];
    const home = members.some((pin) => kindOf(pin) === 'home');
    const place = String(lead.place ?? '');
    const count = tripIds.length;
    const label = count === 0 ? `${place}, home` : home ? `${place}, home and ${plansText(count)}` : `${place}, ${plansText(count)}`;
    return {
      key, at: [...lead.at], place, country: String(lead.country ?? ''), kind: kindOf(lead), home, tripIds, count, label,
      href: lead.href ?? '', todayHref: lead.todayHref ?? null, pins: members,
    };
  });
  return CURRENCY.slice().reverse().flatMap((kind) => groups.filter((group) => group.kind === kind));
}

// --- Labels -------------------------------------------------------------------------------------------

const overlaps = (a, b, pad) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

// `slide` moves the box along the side it is on, in world units: 0 is centred on the pin.
function labelBox([x, y], text, dir, u, gapPx = LABEL.gap, slide = 0) {
  const w = (text.length * LABEL.charW + LABEL.padX) * u;
  const h = LABEL.h * u;
  const gap = gapPx * u;
  const sideways = dir === 'r' || dir === 'l';
  const left = dir === 'r' ? x + gap : dir === 'l' ? x - gap - w : x - w / 2 + slide;
  const top = dir === 't' ? y - gap - h : dir === 'b' ? y + gap : sideways ? y - h / 2 + slide : y - h / 2;
  return { x: round1(left), y: round1(top), w: round1(w), h: round1(h) };
}

// How far the mark of a pin reaches from its middle, in CSS px: the ping of a live pin, the ring of an
// upcoming or home pin, the dot of a past one.
const markReach = (kind) => DOT[kind] + (kind === 'live' ? PING_GAP : kind === 'past' ? 0 : RING_GAP);

/**
 * What a label has to keep clear of: the mark of every pin of the plate, and the selection ring (the hit
 * circle) of the selected place. One disk per place, in world units.
 * @returns {Array<{ key: string, x: number, y: number, r: number }>}
 */
function markDisks(plate, frame) {
  const scale = scaleOf(plate);
  const byKey = new Map();
  for (const pin of (Array.isArray(plate?.pins) ? plate.pins : []).filter((entry) => usable(entry) && onPlate(entry, frame))) {
    const key = placeKey(pin);
    const [x, y] = project(pin.at);
    const r = (key === plate.selected ? HIT_RADIUS : markReach(kindOf(pin)) * scale) * frame.u;
    if (!byKey.has(key) || byKey.get(key).r < r) byKey.set(key, { key, x, y, r });
  }
  return [...byKey.values()];
}

/** True when a disk comes within `pad` of a box. */
function diskTouches(box, disk, pad) {
  const dx = disk.x - Math.min(Math.max(disk.x, box.x), box.x + box.w);
  const dy = disk.y - Math.min(Math.max(disk.y, box.y), box.y + box.h);
  return Math.hypot(dx, dy) < disk.r + pad;
}

/**
 * Where the labels of a plate go (section 10 row 13). Labelled: every live plan, the first three
 * upcoming pins in the order given, then home. A pin may carry `text` ("Norway, day 10 of 12");
 * otherwise its place name is used, and "Home" for the home pin. The side is picked by quadrant
 * (away from the nearer edge, sideways first), and a label that would leave the plate or overlap one
 * already placed is tried on the other sides and then dropped, so a higher priority label always wins.
 * When the plate carries its pins (plate.pins, as worldPlateSvg() takes them), a label also keeps clear
 * of the mark of every other place, and of the selection ring of plate.selected: a side that only a mark
 * or the ring is in the way of is tried once more further out, just beyond the ring, and then every side
 * is tried with the box slid along it (little further than where a corner of the box corners the pin, so
 * the label still reads as that pin's), before the label is dropped. A label is never laid over the mark of
 * another place, whatever its kind, at any width. The label of the selected place itself starts beyond its own ring. With plate.keepLive true
 * the label of a live plan is never dropped for a mark: with no clear side it lies over a lesser mark
 * (it still keeps to the plate and off the labels placed before it). Off by default, so a caller that
 * handles a dropped live label itself sees no change.
 * @returns {Array<{ key: string, text: string, kind: 'live'|'up'|'home', dir: 'l'|'r'|'t'|'b', priority: number,
 *   at: [number, number], box: { x: number, y: number, w: number, h: number } }>} boxes in world units, never overlapping
 */
export function placeLabels(pins, plate) {
  const frame = frameOf(plate);
  const shown = (Array.isArray(pins) ? pins : []).filter((pin) => usable(pin) && onPlate(pin, frame, { lon: 0, lat: 0 }));
  const of = (kind) => shown.filter((pin) => pin.kind === kind);
  const wanted = [
    ...of('live').map((pin) => ({ pin, priority: 0 })),
    ...of('up').slice(0, LABEL.upcoming).map((pin) => ({ pin, priority: 1 })),
    ...of('home').slice(0, 1).map((pin) => ({ pin, priority: 2 })),
  ];
  const margin = LABEL.margin * frame.u;
  const fits = (box) => box.x >= frame.x0 + margin && box.x + box.w <= frame.x1 - margin && box.y >= frame.y0 + margin && box.y + box.h <= frame.y1 - margin;
  const disks = markDisks(plate, frame);
  const selected = typeof plate?.selected === 'string' ? plate.selected : '';
  const farGap = HIT_RADIUS + LABEL.clear;
  // Live plans rank alike: when the given order cannot name them all, the other order is tried, and kept
  // only when it names more of them.
  const liveKeys = new Set(wanted.filter((one) => one.priority === 0).map((one) => placeKey(one.pin)));
  const first = placeIn(wanted);
  const named = (labels) => labels.filter((label) => label.priority === 0).length;
  if (liveKeys.size < 2 || named(first) >= liveKeys.size) return first;
  const turned = placeIn([...wanted.filter((one) => one.priority === 0).reverse(), ...wanted.filter((one) => one.priority !== 0)]);
  if (named(turned) <= named(first)) return first;
  const order = wanted.map((one) => placeKey(one.pin));
  return [...turned].sort((a, b) => a.priority - b.priority || order.indexOf(a.key) - order.indexOf(b.key));

  function placeIn(list) {
  const placed = [];
  const seen = new Set();
  for (const { pin, priority } of list) {
    const key = placeKey(pin);
    if (seen.has(key)) continue;
    seen.add(key);
    const text = String(pin.text ?? (pin.kind === 'home' ? 'Home' : pin.place) ?? '').trim();
    if (!text) continue;
    const at = project(pin.at);
    const sideways = at[0] > (frame.x0 + frame.x1) / 2 ? ['l', 'r'] : ['r', 'l'];
    const upDown = at[1] < (frame.y0 + frame.y1) / 2 ? ['b', 't'] : ['t', 'b'];
    const others = disks.filter((disk) => disk.key !== key);
    const free = (box) => fits(box) && !placed.some((label) => overlaps(box, label.box, margin));
    const clear = (box) => !others.some((disk) => diskTouches(box, disk, margin));
    const nearGap = key === selected ? farGap : LABEL.gap;
    const sides = [sideways[0], upDown[0], sideways[1], upDown[1]];
    const tryAt = (gap, list) => {
      const side = list.find((dir) => { const box = labelBox(at, text, dir, frame.u, gap); return free(box) && clear(box); });
      return side ? { dir: side, box: labelBox(at, text, side, frame.u, gap) } : null;
    };
    // Further out only where a mark or the ring was the one thing in the way.
    const blocked = sides.filter((dir) => { const box = labelBox(at, text, dir, frame.u, nearGap); return free(box) && !clear(box); });
    // plate.keepLive: a live plan is always named. When every side is taken by a lesser mark, its label
    // lies over the mark on the first side that is on the plate and free of the labels already placed.
    const over = () => {
      if (priority !== 0 || plate?.keepLive !== true) return null;
      const side = sides.find((dir) => free(labelBox(at, text, dir, frame.u, nearGap)));
      return side ? { dir: side, box: labelBox(at, text, side, frame.u, nearGap) } : null;
    };
    // Then along each side, a quarter of a label's height at a time, as far as a corner of the box
    // cornering the pin (and one label gap past it above and below): a pin close by takes the middle of a
    // side and seldom all of it. The least slide wins, towards the middle of the plate first, the near gap
    // before the far one.
    const slid = () => {
      const [w, h] = [(text.length * LABEL.charW + LABEL.padX) * frame.u, LABEL.h * frame.u];
      const step = h / LABEL.slideSteps;
      const reach = (dir, gap) => (dir === 'l' || dir === 'r' ? h : w / 2 + (gap + LABEL.gap) * frame.u);
      const towards = (dir) => (dir === 'l' || dir === 'r' ? (upDown[0] === 'b' ? 1 : -1) : (sideways[0] === 'r' ? 1 : -1));
      for (const gap of nearGap < farGap ? [nearGap, farGap] : [nearGap]) {
        const most = Math.max(...sides.map((dir) => reach(dir, gap)));
        for (let move = step; move <= most + 1e-6; move += step) {
          for (const dir of sides.filter((side) => move <= reach(side, gap) + 1e-6)) {
            for (const slide of [move * towards(dir), -move * towards(dir)]) {
              const box = labelBox(at, text, dir, frame.u, gap, slide);
              if (free(box) && clear(box)) return { dir, box };
            }
          }
        }
      }
      return null;
    };
    const spot = tryAt(nearGap, sides) ?? (nearGap < farGap ? tryAt(farGap, blocked) : null) ?? slid() ?? over();
    if (spot) placed.push({ key, text, kind: pin.kind, dir: spot.dir, priority, at: [...pin.at], box: spot.box });
  }
  return placed;
  }
}

// --- Drawing ------------------------------------------------------------------------------------------

function graticule(step) {
  const lines = [];
  const [top, bottom] = [Math.round(my(84)), Math.round(my(-70))];
  for (let lon = -180; lon <= 190; lon += step) lines.push(`M${mx(lon)} ${top}V${bottom}`);
  for (let lat = -60; lat <= 80; lat += step) lines.push(`M-1920 ${Math.round(my(lat))}H1920`);
  return lines.join('');
}

// The visible part of one pin: ping (live), ring (all but past), dot.
function markSvg(pin, px, scale) {
  const kind = kindOf(pin);
  const [x, y] = project(pin.at).map(round1);
  const circle = (name, radius) => `<circle class="${name}" cx="${x}" cy="${y}" r="${px(radius)}"/>`;
  const ping = kind === 'live' ? circle('wm-ping', (DOT.live + PING_GAP) * scale) : '';
  const ring = kind === 'past' ? '' : circle('wm-ring', (DOT[kind] + RING_GAP) * scale);
  return `<g class="wm-mark wm-mark--${kind}">${ping}${ring}${circle('wm-dot', DOT[kind] * scale)}</g>`;
}

function targetSvg(group, px, scale, selected, hitRadius) {
  const [x, y] = project(group.at).map(round1);
  const on = group.key === selected;
  const marks = [...group.pins].sort((a, b) => paintRank(a) - paintRank(b)).map((pin) => markSvg(pin, px, scale)).join('');
  return `<g class="${cls('wm-pin', `wm-pin--${group.kind}`, { 'is-sel': on })}" role="button" tabindex="-1"${attr('data-place', group.key)}${attr('aria-label', group.label)} aria-pressed="${on}">`
    + `<title>${esc(group.label)}</title><circle class="wm-hit" cx="${x}" cy="${y}" r="${hitRadius}"/>${marks}</g>`;
}

function tagSvg(label, px) {
  const { x, y, w, h } = label.box ?? {};
  if (![x, y, w, h].every(isNumber)) return '';
  const kind = ['live', 'up'].includes(label.kind) ? label.kind : 'quiet';
  return `<g class="wm-tag wm-tag--${kind}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${px(LABEL.radius)}"/>`
    + `<text x="${round1(x + px(LABEL.textX))}" y="${round1(y + px(LABEL.textY))}" font-size="${px(LABEL.font)}">${esc(label.text)}</text></g>`;
}

/**
 * One plate. By default it is a picture: role="img" with its label, and the pins are decoration. With
 * `interactive: true` it is a labelled group whose places are pointer targets (role="button",
 * tabindex="-1", data-place, a 44 px hit circle); they are not tab stops, so the page also draws
 * placesListHtml() as the keyboard and touch path.
 * @param {object} plate see the head of this file. plate.cssW must be the width in CSS px the plate is
 *   really shown at (the measured width of its frame, whose shape is the view's): the hit circles are 46 px
 *   across at that width, which keeps them at 44 px in a frame up to 4% off, and they shrink with the plate
 *   at any smaller width. Build the plate again when the width changes. Without a usable cssW the plate is
 *   drawn for 360 px.
 * @param {{ interactive?: boolean }} [opts]
 * @returns {string}
 */
export function worldPlateSvg(plate, { interactive = false } = {}) {
  const frame = frameOf(plate);
  const px = (value) => round1(value * frame.u);
  const box = [Math.round(frame.x0), Math.round(frame.y0), Math.round(frame.x1 - frame.x0), Math.round(frame.y1 - frame.y0)];
  // The hit circle is sized by the viewBox as it is printed (whole units) and rounded up, never down.
  const hitRadius = Math.ceil((HIT_RADIUS * box[2] * 10) / frame.cssW + 1e-6) / 10;
  const scale = scaleOf(plate);
  const step = isNumber(plate?.grat) && plate.grat >= 5 ? plate.grat : 30;
  const land = Object.hasOwn(LAND_IDS, plate?.land) ? LAND_IDS[plate.land] : LAND_IDS.world;
  const pins = (Array.isArray(plate?.pins) ? plate.pins : []).filter((pin) => usable(pin) && onPlate(pin, frame));
  const arcs = (Array.isArray(plate?.arcs) ? plate.arcs : []).map((arc) => ({ d: arcPath(arc?.from, arc?.to), kind: ARC_KINDS.includes(arc?.kind) ? arc.kind : 'past' }))
    .filter((arc) => arc.d).map((arc) => `<path class="wm-arc wm-arc--${arc.kind}" d="${arc.d}"/>`).join('');
  const marks = interactive
    ? groupPlaces(pins).sort((a, b) => paintRank(a) - paintRank(b)).map((group) => targetSvg(group, px, scale, plate?.selected, hitRadius)).join('')
    : `<g class="wm-pins" aria-hidden="true">${[...pins].sort((a, b) => paintRank(a) - paintRank(b)).map((pin) => markSvg(pin, px, scale)).join('')}</g>`;
  const tags = (Array.isArray(plate?.labels) ? plate.labels : []).map((label) => tagSvg(label, px)).join('');
  return `<svg class="wm-plate"${attr('id', plate?.id || null)} viewBox="${box.join(' ')}" preserveAspectRatio="xMidYMid meet" role="${interactive ? 'group' : 'img'}"`
    + `${attr('aria-label', plate?.label || 'Map')} focusable="false" style="--u:${frame.u.toFixed(3)}">`
    + `<path class="wm-grat" d="${graticule(step)}"/><use class="wm-land-use" href="#${land}"/>`
    + `${arcs ? `<g class="wm-arcs" aria-hidden="true">${arcs}</g>` : ''}${marks}`
    + `${tags ? `<g class="wm-tags" aria-hidden="true">${tags}</g>` : ''}</svg>`;
}

/**
 * The land outlines, once per page and out of sight, so several plates share one path. The world is
 * always there; pass the regional paths once the page has loaded world-land-regions.js on demand.
 * @param {{ europe?: string, apac?: string }} [regions]
 * @returns {string}
 */
export function landDefsSvg(regions = {}) {
  const paths = [['world', LAND_WORLD], ['europe', regions?.europe], ['apac', regions?.apac]]
    .filter(([, d]) => typeof d === 'string' && RINGS.test(d))
    .map(([name, d]) => `<path id="${LAND_IDS[name]}" class="wm-land" d="${d}"/>`).join('');
  return `<svg class="wm-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${paths}</defs></svg>`;
}

/**
 * The places as a list of buttons: the keyboard and touch path to every pin of an interactive plate.
 * Coincident places are one button ("Singapore, 3 plans"). data-place equals the pin's on the plate.
 * @param {Array<import('../contract.js').MapPin>} pins
 * @param {{ selected?: string, label?: string, cls?: any }} [opts]
 * @returns {string} '' when no pin can be placed
 */
export function placesListHtml(pins, { selected = '', label = 'Places', cls: extra } = {}) {
  const groups = groupPlaces(pins);
  if (!groups.length) return '';
  const items = groups.map((group) => `<li><button type="button" class="wm-place"${attr('data-place', group.key)} data-kind="${group.kind}"`
    + `${attr('data-focus-key', `place-${group.key}`)} aria-pressed="${group.key === selected}"><span class="wm-place-dot" aria-hidden="true"></span>`
    + `<span class="wm-place-label">${esc(group.label)}</span>${visuallyHidden(STATUS_WORDS[group.kind] ? `, ${STATUS_WORDS[group.kind]}` : '')}</button></li>`).join('');
  return `<ul class="${cls('wm-places', extra)}"${attr('aria-label', label)}>${items}</ul>`;
}
