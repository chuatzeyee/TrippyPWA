// The plates of the Atlas view, as pure functions: the box the world plate draws, the arcs from
// home, the pins that carry a label, and the compact form a page keeps so a plate can be drawn
// again for the width it is really shown at (ruling R32). The regional plates of the Atlas page
// are in region-plates.js, which only that page loads (ruling R40). The drawing itself is F7's
// world-map.js; nothing here touches the DOM. Owner: VC.
import { my } from '../../lib/geo.js';
import { plateView, worldPlateSvg, placeLabels } from '../shared/world-map.js';

/** How far the generated world outline runs past the 180th meridian on each side, in degrees. */
const LAND_EDGE = 192;
const DEFAULT_MID = 10;
const DEFAULT_ASPECT = 16 / 10;
export const WORLD = Object.freeze({ id: 'world', name: 'World', land: 'world', north: 79, south: -50, grat: 30 });
const KIND_OF_PHASE = { live: 'live', upcoming: 'up', undated: 'up', past: 'past' };
const RANK = { past: 0, up: 1, live: 2 };
const WEIGHT = { live: 8, home: 5, up: 4, past: 1 };
const LETTER = { live: 'l', up: 'u', past: 'p', home: 'h' };
const KIND_OF_LETTER = { l: 'live', u: 'up', p: 'past', h: 'home' };

const list = (value) => (Array.isArray(value) ? value : []);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isPoint = (at) => Array.isArray(at) && isNumber(at[0]) && isNumber(at[1]) && !(at[0] === 0 && at[1] === 0) && Math.abs(at[0]) <= 90 && Math.abs(at[1]) <= 180;
export const usable = (pin) => Boolean(pin) && isPoint(pin.at);
const round2 = (value) => Math.round(value * 100) / 100;
export const shapeOf = (aspect) => (isNumber(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT);
export const halfWidth = (def, aspect) => ((my(def.south) - my(def.north)) * aspect) / 20;

/** How far north and south the world plate may zoom out to, in degrees, and in how many steps. */
const ZOOM_OUT = Object.freeze({ north: 86, south: -75, steps: 10 });

/**
 * The best middle longitude for a world plate of the given latitudes, and how much of what matters
 * it shows. A live plan counts most, then home, then what is coming up, then past plans; a pin
 * under what is laid over the left of the frame counts half.
 */
function bestMiddle(placed, { north, south, shape, clear }) {
  const half = halfWidth({ north, south }, shape);
  const [lo, hi] = [half - LAND_EDGE, LAND_EDGE - half];
  if (lo >= hi) return { mid: 0, shown: placed.length };
  const clamp = (mid) => Math.min(hi, Math.max(lo, mid));
  if (!placed.length) return { mid: clamp(DEFAULT_MID), shown: 0 };
  const width = 2 * half;
  const pad = Math.min(8, width * 0.03);
  const inView = (mid) => (pin) => pin.at[1] >= mid - half + pad && pin.at[1] <= mid + half - pad;
  const score = (mid) => placed.filter(inView(mid)).reduce((sum, pin) => (
    sum + (WEIGHT[pin.kind] ?? 1) * ((pin.at[1] - (mid - half)) / width >= clear ? 1 : 0.5)
  ), 0);
  const lons = placed.map((pin) => pin.at[1]);
  const target = clamp((Math.min(...lons) + Math.max(...lons)) / 2 - (clear * width) / 2);
  const steps = Math.max(1, Math.ceil(hi - lo));
  const candidates = [target, ...Array.from({ length: steps + 1 }, (_, i) => lo + ((hi - lo) * i) / steps)];
  const best = candidates.reduce((top, mid) => {
    const value = score(mid);
    if (top === null || value > top.value + 1e-9) return { mid, value };
    return Math.abs(value - top.value) <= 1e-9 && Math.abs(mid - target) < Math.abs(top.mid - target) ? { mid, value } : top;
  }, null);
  return { mid: best.mid, shown: placed.filter(inView(best.mid)).length };
}

/**
 * The box of the world plate for a frame of the given shape (width over height). It fills the frame
 * exactly, stays on the outline, and is moved sideways to show as much of what matters as it can.
 * When the pins are wider than the frame it zooms out, north and south alike, only as far as it has
 * to: a narrow frame would otherwise drop a pin off its edge.
 * @param {Array<{ at: [number, number], kind: string }>} pins
 * @param {number} aspect
 * @param {{ north?: number, south?: number, clearLeft?: number, fit?: boolean }} [opts] clearLeft is the
 *   share of the width (0 to 0.5) that something is laid over on the left: pins are kept out of it
 *   when they fit. fit: false keeps the latitudes as given.
 * @returns {{ north: number, south: number, west: number, east: number }}
 */
export function worldWindow(pins, aspect, { north = WORLD.north, south = WORLD.south, clearLeft = 0, fit = true } = {}) {
  const shape = shapeOf(aspect);
  const clear = isNumber(clearLeft) ? Math.min(0.5, Math.max(0, clearLeft)) : 0;
  const placed = list(pins).filter(usable);
  const tries = fit && north < ZOOM_OUT.north && south > ZOOM_OUT.south ? ZOOM_OUT.steps : 0;
  let pick = null;
  for (let step = 0; step <= tries; step += 1) {
    const t = tries ? step / tries : 0;
    const range = { north: north + (ZOOM_OUT.north - north) * t, south: south - (south - ZOOM_OUT.south) * t };
    const found = bestMiddle(placed, { ...range, shape, clear });
    pick = { ...range, mid: found.mid };
    if (found.shown >= placed.length) break;
  }
  return plateView({ north: pick.north, south: pick.south, mid: pick.mid, aspect: shape });
}

const placedPlaces = (card) => list(card?.places).filter((place) => place && isPoint([place.lat, place.lng]));
const sameSpot = (a, b) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;

/**
 * The arcs of the plate: one from home to the first place of every plan, and for a plan that is not
 * past one more between each pair of its cities. Past underneath, live on top. Without a home pin
 * there is none. Plans that are still being planned are not on the map.
 * @param {import('../contract.js').DashboardModel} model
 * @returns {Array<{ from: [number, number], to: [number, number], kind: 'past'|'up'|'live' }>}
 */
export function plateArcs(model) {
  const home = list(model?.pins).find((pin) => pin?.kind === 'home' && usable(pin));
  if (!home) return [];
  const from = [home.at[0], home.at[1]];
  const firstLegs = new Map();
  const inner = [];
  for (const card of Object.values(model?.cardsById ?? {})) {
    const kind = card && !card.generation ? KIND_OF_PHASE[card.phase] : null;
    const places = kind ? placedPlaces(card).map((place) => [place.lat, place.lng]) : [];
    if (!places.length) continue;
    const key = places[0].map((value) => value.toFixed(2)).join(',');
    const known = firstLegs.get(key);
    if (!sameSpot(from, places[0]) && (!known || RANK[kind] > RANK[known.kind])) firstLegs.set(key, { from, to: places[0], kind });
    if (kind !== 'past') places.slice(1).forEach((to, i) => { if (!sameSpot(places[i], to)) inner.push({ from: places[i], to, kind }); });
  }
  return [...firstLegs.values(), ...inner].sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

/**
 * The pins that get a label, in the order placeLabels() gives way: each live plan ("Spain, day 7 of
 * 10": the country of its first destination, section 10 row 9), the next departures by days to go
 * ("Marrakech in 9 days"), then home.
 * @param {import('../contract.js').DashboardModel} model
 * @param {{ upcoming?: number }} [opts] how many departures to label, 3 by default
 * @returns {Array<{ at: [number, number], kind: 'live'|'up'|'home', place: string, text: string }>}
 */
export function labelPins(model, { upcoming = 3 } = {}) {
  const pinOf = (card, kind, text) => {
    const [place] = placedPlaces(card);
    return place ? [{ at: [place.lat, place.lng], kind, place: String(place.name ?? ''), text: text(place) }] : [];
  };
  const live = list(model?.live).flatMap((briefing) => pinOf(briefing?.trip, 'live', (place) => (
    `${briefing.trip.places?.[0]?.country || place.name}, day ${briefing.dayNumber} of ${briefing.dayCount}`
  )));
  const next = Object.values(model?.cardsById ?? {})
    .filter((card) => card?.phase === 'upcoming' && isNumber(card.daysToGo))
    .sort((a, b) => a.daysToGo - b.daysToGo)
    .slice(0, Math.max(0, upcoming))
    .flatMap((card) => pinOf(card, 'up', (place) => (card.daysToGo === 1 ? `${place.name} tomorrow` : `${place.name} in ${card.daysToGo} days`)));
  const home = list(model?.pins).filter((pin) => pin?.kind === 'home' && usable(pin)).slice(0, 1)
    .map((pin) => ({ at: [pin.at[0], pin.at[1]], kind: 'home', place: String(pin.place ?? ''), text: 'Home' }));
  return [...live, ...next, ...home];
}

/**
 * What a dashboard plate is drawn from: every pin, the arcs from home and the pins that carry a label.
 * @param {import('../contract.js').DashboardModel} model
 * @param {{ upcoming?: number }} [opts] passed to labelPins()
 */
export function plateData(model, opts) {
  return { pins: list(model?.pins).filter(usable), arcs: plateArcs(model), labels: labelPins(model, opts) };
}

/**
 * The same as one short string for an attribute: the page reads it back when the plate has to be
 * drawn again for another width, long after the model is gone.
 * @param {{ pins?: object[], arcs?: object[], labels?: object[] }} data  what plateData() returned
 */
export function packData(data) {
  const point = (at) => [round2(at[0]), round2(at[1])];
  return JSON.stringify({
    p: list(data?.pins).filter(usable).map((pin) => [...point(pin.at), LETTER[pin.kind] ?? 'p']),
    a: list(data?.arcs).filter((arc) => isPoint(arc?.from) && isPoint(arc?.to)).map((arc) => [...point(arc.from), ...point(arc.to), LETTER[arc.kind] ?? 'p']),
    l: list(data?.labels).filter((pin) => usable(pin) && typeof pin.text === 'string').map((pin) => [...point(pin.at), LETTER[pin.kind] ?? 'p', pin.text]),
  });
}

/** packData() of plateData(): the dashboard plate of a model as one string. */
export function packPlate(model, opts) {
  return packData(plateData(model, opts));
}

/** What packPlate() wrote, as pins, arcs and label pins. Anything unreadable is an empty plate. */
export function unpackPlate(text) {
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  const rows = (key) => (data && typeof data === 'object' ? list(data[key]).filter(Array.isArray) : []);
  const kindOf = (letter) => KIND_OF_LETTER[letter] ?? 'past';
  return {
    pins: rows('p').filter((row) => isPoint(row)).map((row) => ({ at: [row[0], row[1]], kind: kindOf(row[2]), place: '' })),
    arcs: rows('a').filter((row) => isPoint(row) && isPoint(row.slice(2))).map((row) => ({ from: [row[0], row[1]], to: [row[2], row[3]], kind: kindOf(row[4]) })),
    labels: rows('l').filter((row) => isPoint(row) && typeof row[3] === 'string').map((row) => ({ at: [row[0], row[1]], kind: kindOf(row[2]), place: '', text: row[3] })),
  };
}

/** How much larger than drawn the marks count on the first try, so a label keeps some air from the pins beside it. */
const ROOMY = 1.8;
const liveCount = (labels) => labels.filter((one) => one?.kind === 'live').length;
/** True when two label boxes come within a tenth of a label's height of each other. */
const boxesTouch = (a, b) => {
  const pad = a.h / 10;
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
};

/** placeLabels() with every mark counted larger than it is drawn, when that loses no label; else as it is. */
function placeWithAir(pins, plate) {
  const strict = placeLabels(pins, plate);
  const roomy = placeLabels(pins, { ...plate, scale: Math.min(2, (isNumber(plate?.scale) ? plate.scale : 1) * ROOMY) });
  return roomy.length >= strict.length && liveCount(roomy) >= liveCount(strict) ? roomy : strict;
}

/**
 * Where the labels of a plate go. placeLabels() keeps a label clear of the mark of every other pin
 * and drops it when it cannot. Here a label first gets some air from the pins beside it, so it does
 * not butt against one. The label of a live plan is what the page is about: when one is lost to that
 * rule, the live labels alone are placed without it, and every other label gives way to the live
 * ones and still keeps clear of the pins (of all of them, or, when that loses a label, of all but the
 * dots of past plans).
 * @param {object[]} wanted  the label pins, in the order they give way
 * @param {object} plate     what placeLabels() takes: view, cssW, pins, scale, selected
 * @returns {ReturnType<typeof placeLabels>}
 */
export function placePlateLabels(wanted, plate) {
  const pins = list(wanted);
  const isLive = (pin) => pin?.kind === 'live' && usable(pin);
  const placed = placeWithAir(pins, plate);
  if (liveCount(placed) >= pins.filter(isLive).length) return placed;
  const live = placeLabels(pins.filter(isLive), { ...plate, pins: [] });
  const others = pins.filter((pin) => !isLive(pin));
  const free = (labels) => labels.filter((one) => !live.some((label) => boxesTouch(one.box, label.box)));
  const clear = free(placeWithAir(others, plate));
  // A label may lie over the small dot of a past plan rather than be lost; never over a live or upcoming mark.
  const loose = free(placeLabels(others, { ...plate, pins: list(plate?.pins).filter((pin) => pin?.kind !== 'past') }));
  return [...live, ...(loose.length > clear.length ? loose : clear)];
}

/**
 * One plate as SVG: F7's worldPlateSvg() with the labels placed for this box and this width.
 * @param {{ pins: object[], arcs?: object[], labels?: object[], view: object, cssW: number, label: string,
 *   land?: string, grat?: number, scale?: number, maxLabels?: number, interactive?: boolean, selected?: string }} plate
 *   cssW is the width in CSS px the plate is really shown at; maxLabels keeps the first few label pins;
 *   clearLeft is the share of the width, from the left, that no label may enter
 */
export function plateSvg({ pins, arcs = [], labels = [], view, cssW, label, land = 'world', grat, scale, maxLabels, interactive = false, selected, clearLeft = 0 }) {
  const plate = { label, view, cssW, land, pins: list(pins), arcs: list(arcs), grat, scale, selected };
  const wanted = Number.isInteger(maxLabels) && maxLabels >= 0 ? list(labels).slice(0, maxLabels) : list(labels);
  // Labels are placed on the part of the plate nothing is laid over: the same plate, cut on the left.
  const share = isNumber(clearLeft) && view ? Math.min(0.5, Math.max(0, clearLeft)) : 0;
  const open = share ? { ...plate, view: { ...view, west: view.west + (view.east - view.west) * share }, cssW: cssW * (1 - share) } : plate;
  return worldPlateSvg({ ...plate, labels: placePlateLabels(wanted, open) }, { interactive });
}
