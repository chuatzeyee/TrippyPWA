// The plates the Atlas page offers beside the world: which regions, and the box each one draws.
// Only the Atlas page needs this, so it ships with the page's own chunk (ruling R40). Pure
// functions; the drawing itself is F7's world-map.js. Owner: VC.
import { plateView } from '../shared/world-map.js';
import { WORLD, halfWidth, shapeOf, usable, worldWindow } from './plates.js';

const list = (value) => (Array.isArray(value) ? value : []);
const inBox = (box) => (pin) => pin.at[0] <= box.north && pin.at[0] >= box.south && pin.at[1] >= box.west && pin.at[1] <= box.east;
// north, south: what the plate draws. limit: the longitudes its outline covers. box: where a pin
// must be for the plate to be offered (the boxes do not overlap, so one place offers one region).
const REGIONS = Object.freeze([
  { id: 'europe', name: 'Europe', land: 'europe', north: 72, south: 36, mid: 8, limit: [-48, 60], grat: 10, box: { north: 71.5, south: 36, west: -25, east: 42 } },
  { id: 'east-asia', name: 'East Asia', land: 'apac', north: 54, south: 15, mid: 124, limit: [60, 180], grat: 10, box: { north: 54, south: 18, west: 95, east: 150 } },
  { id: 'southeast-asia', name: 'Southeast Asia', land: 'apac', north: 24, south: -12, mid: 112, limit: [60, 180], grat: 10, box: { north: 18, south: -11, west: 92, east: 141 } },
  { id: 'australia', name: 'Australia', land: 'apac', north: -8, south: -48, mid: 142, limit: [60, 180], grat: 10, box: { north: -10, south: -48, west: 112, east: 180 } },
]);
const DEFS = Object.freeze([WORLD, ...REGIONS]);

/** Every plate id, in the order the switcher shows them. */
export const PLATE_IDS = Object.freeze(DEFS.map((def) => def.id));
const defOf = (id) => DEFS.find((def) => def.id === id) ?? WORLD;

/**
 * The plates to offer: the world always, a region only when it holds a pin of a plan (the bare home
 * pin does not count, and neither does a pin that cannot be placed).
 * @param {Array<import('../contract.js').MapPin>} pins
 * @returns {Array<{ id: string, name: string, land: 'world'|'europe'|'apac', grat: number }>}
 */
export function atlasPlates(pins) {
  const plans = list(pins).filter((pin) => usable(pin) && pin.kind !== 'home');
  return DEFS.filter((def) => def === WORLD || plans.some(inBox(def.box)))
    .map(({ id, name, land, grat }) => ({ id, name, land, grat }));
}

/** A regional plate zooms in on its pins: this much room around them, and never less than this share of the region. */
const REGION_ZOOM = Object.freeze({ padLat: 5, padLon: 4, minShare: 0.6, steps: 8 });

/**
 * The box a plate draws in a frame of the given shape. A regional plate zooms in on the latitudes
 * its pins are at (with room around them, and never to a sliver), is centred on them and never
 * leaves its outline; it zooms back out when the pins are spread wider than the frame. With no pin
 * in the region it shows the whole region. An unknown id reads as the world.
 * @param {string} id one of PLATE_IDS
 * @param {number} aspect width over height of the frame
 * @param {Array<import('../contract.js').MapPin>} pins
 * @param {{ clearLeft?: number, fit?: boolean }} [opts] for the world plate, see worldWindow()
 */
export function plateFrame(id, aspect, pins, opts = {}) {
  const def = defOf(id);
  if (def === WORLD) return worldWindow(pins, aspect, opts);
  const shape = shapeOf(aspect);
  const inside = list(pins).filter((pin) => usable(pin) && inBox(def.box)(pin));
  const frameOf = ({ north, south }, wanted) => {
    const half = halfWidth({ north, south }, shape);
    const [lo, hi] = [def.limit[0] + half, def.limit[1] - half];
    const mid = lo > hi ? (def.limit[0] + def.limit[1]) / 2 : Math.min(hi, Math.max(lo, wanted));
    return { north, south, mid, half };
  };
  if (!inside.length) {
    const whole = frameOf(def, def.mid);
    return plateView({ north: whole.north, south: whole.south, mid: whole.mid, aspect: shape });
  }
  const lats = inside.map((pin) => pin.at[0]);
  const lons = inside.map((pin) => pin.at[1]);
  const centre = (Math.min(...lons) + Math.max(...lons)) / 2;
  const least = (def.north - def.south) * REGION_ZOOM.minShare;
  let north = Math.min(def.north, Math.max(...lats) + REGION_ZOOM.padLat);
  let south = Math.max(def.south, Math.min(...lats) - REGION_ZOOM.padLat);
  const short = Math.max(0, least - (north - south));
  north = Math.min(def.north, north + short / 2);
  south = Math.max(def.south, Math.min(south - short / 2, north - least));
  north = Math.min(def.north, Math.max(north, south + least));
  let pick = null;
  for (let step = 0; step <= REGION_ZOOM.steps; step += 1) {
    const t = step / REGION_ZOOM.steps;
    pick = frameOf({ north: north + (def.north - north) * t, south: south - (south - def.south) * t }, centre);
    const fits = Math.min(...lons) >= pick.mid - pick.half + REGION_ZOOM.padLon && Math.max(...lons) <= pick.mid + pick.half - REGION_ZOOM.padLon;
    if (fits) break;
  }
  return plateView({ north: pick.north, south: pick.south, mid: pick.mid, aspect: shape });
}

/** What a plate needs beside its box: the outline it points at and the spacing of its grid. */
export function plateLook(id) {
  const { land, grat, name } = defOf(id);
  return { land, grat, name };
}
