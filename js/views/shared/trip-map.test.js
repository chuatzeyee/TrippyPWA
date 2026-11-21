// trip-map.js: the drawn fallback, the map markup and its caption, and the pure rules the mounted map
// follows (blueprint 1.3, 3.4, 8.3, risk 4). The mounted behaviour itself needs a browser and is proved
// with the screenshot tools. Every place and name here is invented. Owner: F7.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  TILE_PROVIDER, MAP_CAPTION_ID, tripMapHtml, mapFallbackSvg, mapCaptionHtml, mapDays, spreadApart, tilesFailing, mountTripMap, takesOverLive,
} from './trip-map.js';
import { kmBetween } from '../../lib/geo.js';
import { TRIP_FIXTURES } from '../fixtures/models.js';
import { parseHtml, all, attr, textOf, classesOf, isInside } from '../fixtures/checks/html-tree.js';
import { markupRules } from '../fixtures/checks/markup-rules.js';
import { parseCss } from '../fixtures/checks/css-spec.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (file) => readFileSync(ROOT + file, 'utf8');
// Other tasks create and move files while this runs: a file that has just gone reads as empty in a scan.
const scan = (file) => { try { return read(file); } catch { return ''; } };
const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  return root;
};
const point = (dayNumber, order, lat, lng, over = {}) => ({ lat, lng, dayNumber, dayIndex: dayNumber - 1, order, title: `Day ${dayNumber} stop ${order}`, colorIndex: ((dayNumber - 1) % 7) + 1, ...over });
const MAP = TRIP_FIXTURES.upcoming.map;
const NO_MAP = TRIP_FIXTURES.noMap.map;
const numbers = (el, names) => names.map((name) => Number(attr(el, name)));
const dots = (root) => all(root, '.tv-map-fdot').map((el) => numbers(el, ['cx', 'cy']));
const badges = (root) => all(root, '.tv-map-fbadge');
const inFrame = ([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 400 && y >= 0 && y <= 250;

describe('TILE_PROVIDER', () => {
  it('holds the tile URL, the attribution and the zoom limits in one frozen constant', () => {
    expect(TILE_PROVIDER.url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(TILE_PROVIDER.attribution).toContain('OpenStreetMap');
    expect(TILE_PROVIDER.attributionHref).toBe('https://www.openstreetmap.org/copyright');
    expect(TILE_PROVIDER.minZoom).toBeLessThan(TILE_PROVIDER.maxZoom);
    expect(TILE_PROVIDER.maxZoom).toBeLessThanOrEqual(19);
    expect(Object.isFrozen(TILE_PROVIDER)).toBe(true);
  });

  const sources = (dir) => readdirSync(ROOT + dir, { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory() ? sources(`${dir}/${entry.name}`) : /\.m?js$/.test(entry.name) && !/\.test\.m?js$/.test(entry.name) ? [`${dir}/${entry.name}`] : []));
  const FILES = sources('js');
  const count = (text, pattern) => [...text.matchAll(pattern)].length;

  it('is the only place that names the tile server', () => {
    const naming = FILES.filter((file) => /tile\.openstreetmap\.org/.test(scan(file)));
    expect(naming).toEqual(['js/views/shared/trip-map.js']);
    expect(count(read('js/views/shared/trip-map.js'), /tile\.openstreetmap\.org/g)).toBe(1);
  });
  it('loads Leaflet and its stylesheet on demand only, and only from trip-map.js', () => {
    const STATIC = /(?:^|[\n;])\s*import\b[^;'"(]*['"]leaflet[^'"]*['"]/;
    expect(FILES.filter((file) => STATIC.test(scan(file)))).toEqual([]);
    expect(STATIC.test("import L from 'leaflet';")).toBe(true);
    expect(STATIC.test("import 'leaflet/dist/leaflet.css';")).toBe(true);
    const dynamic = FILES.filter((file) => /import\(\s*['"]leaflet/.test(scan(file)));
    expect(dynamic).toEqual(['js/views/shared/trip-map.js']);
    const source = read('js/views/shared/trip-map.js');
    expect(count(source, /import\(\s*'leaflet[^']*'\s*\)/g)).toBe(2);
    expect(source).toMatch(/import\('leaflet\/dist\/leaflet\.css'\)/);
    expect(source).toMatch(/\.catch\(/);
  });
  it('keeps markers and the map itself out of the tab order, and wheel zoom off', () => {
    const source = read('js/views/shared/trip-map.js');
    expect(source).toMatch(/scrollWheelZoom: false/);
    expect(count(source, /keyboard: false/g)).toBeGreaterThanOrEqual(2);
    expect(source).not.toMatch(/keyboard: true/);
  });
});

describe('mapDays', () => {
  it('groups the stops by day, in day order and stop order, with the middle of each day', () => {
    const days = mapDays([point(2, 2, 10.2, 20.2), point(1, 1, 10, 20), point(2, 1, 10.4, 20.4), point(1, 2, 10.1, 20.3)]);
    expect(days.map((day) => day.dayNumber)).toEqual([1, 2]);
    expect(days[1].stops.map((stop) => stop.order)).toEqual([1, 2]);
    expect(days[0].center[0]).toBeCloseTo(10.05, 9);
    expect(days[0].center[1]).toBeCloseTo(20.15, 9);
    expect(days[1]).toMatchObject({ dayIndex: 1, colorIndex: 2 });
  });
  it('puts the point of a day where most of its stops are, never between two cities', () => {
    // Three stops in one town, two in another about 1,100 km north: the point is in the first town.
    const [day] = mapDays([point(1, 1, 59.91, 10.75), point(1, 2, 59.92, 10.73), point(1, 3, 59.9, 10.76), point(1, 4, 69.65, 18.96), point(1, 5, 69.66, 18.95)]);
    expect(day.center[0]).toBeCloseTo(59.91, 2);
    expect(day.center[1]).toBeCloseTo(10.7467, 2);
    // One stop each in two towns: the point is on a stop (the first), not in the middle.
    const [split] = mapDays([point(1, 1, 59.91, 10.75), point(1, 2, 69.65, 18.96)]);
    expect(split.center).toEqual([59.91, 10.75]);
  });
  it('drops what cannot be placed and falls back to a colour by day number', () => {
    const days = mapDays([point(1, 1, null, 20), point(1, 2, 0, 0), point(1, 3, 95, 20), point(0, 1, 10, 20), point(9, 1, 10, 20, { colorIndex: 12 }), { lat: 1, lng: 1 }, null]);
    expect(days.map((day) => [day.dayNumber, day.stops.length, day.colorIndex])).toEqual([[9, 1, 2]]);
    expect(mapDays(undefined)).toEqual([]);
  });
  it('keeps a trip that crosses the 180th meridian together', () => {
    const [day] = mapDays([point(1, 1, -17, 179.5), point(1, 2, -17, -179.5)]);
    expect(Math.abs(day.stops[1].lng - day.stops[0].lng)).toBeCloseTo(1, 9);
    expect(Math.abs(day.center[1])).toBeGreaterThan(179);
  });
  it('does not change its input', () => {
    const input = Object.freeze([Object.freeze(point(1, 2, 10, 20)), Object.freeze(point(1, 1, 11, 21))]);
    expect(() => mapDays(input)).not.toThrow();
    expect(input[0].order).toBe(2);
  });
});

describe('spreadApart', () => {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  it('leaves positions alone that are far enough apart', () => {
    const at = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 50 }];
    expect(spreadApart(at, 30)).toEqual(at);
  });
  it('moves positions that are too close until none is closer than the minimum', () => {
    const at = [{ x: 100, y: 100 }, { x: 102, y: 100 }, { x: 101, y: 103 }, { x: 100, y: 100 }, { x: 180, y: 100 }];
    const out = spreadApart(at, 30);
    expect(out).toHaveLength(5);
    for (let i = 0; i < out.length; i += 1) for (let j = i + 1; j < out.length; j += 1) expect(dist(out[i], out[j])).toBeGreaterThanOrEqual(29);
    expect(out[4].x).toBeGreaterThan(150);
  });
  it('gives the same answer every time and does not change its input', () => {
    const at = Object.freeze([Object.freeze({ x: 5, y: 5 }), Object.freeze({ x: 5, y: 5 }), Object.freeze({ x: 5, y: 5 })]);
    expect(spreadApart(at, 20)).toEqual(spreadApart(at, 20));
    expect(at[0]).toEqual({ x: 5, y: 5 });
    expect(spreadApart([], 20)).toEqual([]);
  });
});

describe('tilesFailing', () => {
  it('says when the background should give way to the drawing', () => {
    expect(tilesFailing({ loaded: 0, failed: 0 })).toBe(false);
    expect(tilesFailing({ loaded: 0, failed: 1 })).toBe(false);
    expect(tilesFailing({ loaded: 0, failed: 2 })).toBe(true);
    expect(tilesFailing({ loaded: 6, failed: 2 })).toBe(false);
    expect(tilesFailing({ loaded: 2, failed: 9 })).toBe(true);
    expect(tilesFailing({})).toBe(false);
  });
});

describe('mapFallbackSvg', () => {
  it('draws nothing for no points', () => {
    expect(mapFallbackSvg([])).toBe('');
    expect(mapFallbackSvg(undefined)).toBe('');
    expect(mapFallbackSvg([point(1, 1, null, null), point(1, 2, 0, 0)])).toBe('');
  });

  it('puts one point in the middle with its day badge', () => {
    const root = tree(mapFallbackSvg([point(3, 1, 48.2, 16.37)]));
    const [svg] = all(root, 'svg');
    expect(attr(svg, 'viewbox')).toBe('0 0 400 250');
    expect(attr(svg, 'role')).toBe('img');
    expect(attr(svg, 'aria-label')).not.toBe('');
    expect(dots(root)).toEqual([[200, 125]]);
    expect(badges(root).map(textOf)).toEqual(['3']);
    expect(attr(badges(root)[0], 'style')).toBe('--tone:var(--day-3)');
  });

  it('places many points inside the frame, one dot a stop and one badge a day', () => {
    const root = tree(mapFallbackSvg(MAP.points));
    expect(dots(root)).toHaveLength(MAP.points.length);
    expect(dots(root).every(inFrame)).toBe(true);
    expect(badges(root).map(textOf)).toEqual(Array.from({ length: MAP.dayCount }, (_, i) => String(i + 1)));
    const centres = badges(root).map((el) => numbers(all(el, 'circle')[0], ['cx', 'cy']));
    expect(centres.every(inFrame)).toBe(true);
    for (let i = 0; i < centres.length; i += 1) {
      for (let j = i + 1; j < centres.length; j += 1) expect(Math.hypot(centres[i][0] - centres[j][0], centres[i][1] - centres[j][1])).toBeGreaterThanOrEqual(25);
    }
    const xs = dots(root).map(([x]) => x);
    const ys = dots(root).map(([, y]) => y);
    expect(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeGreaterThan(150);
  });

  it('copes with points on one line, east to west and north to south, and with points in one spot', () => {
    const eastWest = dots(tree(mapFallbackSvg([point(1, 1, 52, 4.8), point(1, 2, 52, 4.9), point(2, 1, 52, 5.1)])));
    expect(eastWest.every(inFrame)).toBe(true);
    expect(new Set(eastWest.map(([, y]) => y))).toEqual(new Set([125]));
    expect(eastWest[0][0]).toBeLessThan(eastWest[1][0]);
    expect(eastWest[1][0]).toBeLessThan(eastWest[2][0]);
    const northSouth = dots(tree(mapFallbackSvg([point(1, 1, 52.0, 4.8), point(1, 2, 52.1, 4.8), point(2, 1, 52.3, 4.8)])));
    expect(northSouth.every(inFrame)).toBe(true);
    expect(new Set(northSouth.map(([x]) => x))).toEqual(new Set([200]));
    expect(northSouth[0][1]).toBeGreaterThan(northSouth[2][1]);
    const oneSpot = dots(tree(mapFallbackSvg([point(1, 1, 52, 4.8), point(2, 1, 52, 4.8), point(3, 1, 52, 4.8)])));
    expect(oneSpot).toEqual([[200, 125], [200, 125], [200, 125]]);
  });

  it('is drawn to scale at any latitude: a kilometre north is as long as a kilometre east', () => {
    const origin = [69.65, 18.95];
    const east = [69.65, 19.2];
    const north = [69.65 + (kmBetween(origin, east) / kmBetween(origin, [70.65, 18.95])), 18.95];
    const at = dots(tree(mapFallbackSvg([point(1, 1, ...origin), point(1, 2, ...east), point(1, 3, ...north)])));
    const eastPx = Math.hypot(at[1][0] - at[0][0], at[1][1] - at[0][1]);
    const northPx = Math.hypot(at[2][0] - at[0][0], at[2][1] - at[0][1]);
    expect(eastPx).toBeGreaterThan(40);
    expect(northPx / eastPx).toBeGreaterThan(0.97);
    expect(northPx / eastPx).toBeLessThan(1.03);
    expect(at[1][1]).toBeCloseTo(at[0][1], 0);
    expect(at[2][0]).toBeCloseTo(at[0][0], 0);
  });

  it('for a selected day draws only that day: its stops numbered in order along a route line', () => {
    const root = tree(mapFallbackSvg(MAP.points, { day: 2 }));
    const stops = MAP.points.filter((p) => p.dayNumber === 2);
    expect(all(root, '.tv-map-fstop').map(textOf)).toEqual(stops.map((_, i) => String(i + 1)));
    expect(all(root, '.tv-map-froute')).toHaveLength(1);
    expect(attr(all(root, '.tv-map-froute')[0], 'd')).toMatch(/^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+)+$/);
    expect(badges(root)).toHaveLength(0);
    expect(dots(root)).toHaveLength(0);
    expect(attr(all(root, 'svg')[0], 'aria-label')).toContain('day 2');
    expect(all(tree(mapFallbackSvg(MAP.points)), '.tv-map-froute')).toHaveLength(0);
  });

  it('falls back to every day when the selected day has no stop', () => {
    expect(badges(tree(mapFallbackSvg(MAP.points, { day: 99 })))).toHaveLength(MAP.dayCount);
  });

  it('escapes stop titles', () => {
    const html = mapFallbackSvg([point(1, 1, 52, 4.8, { title: HOSTILE }), point(1, 2, 52.1, 4.9)], { day: 1 });
    expect(html).not.toContain('<img');
    expect(textOf(all(tree(html), 'title')[0])).toBe(HOSTILE);
  });
});

describe('tripMapHtml', () => {
  const root = tree(tripMapHtml(MAP));
  const [node] = all(root, '[data-trip-map]');

  it('is one map node that names the caption as its description', () => {
    expect(all(root, '[data-trip-map]')).toHaveLength(1);
    expect(root.children.filter((child) => child.tag)).toHaveLength(1);
    expect(classesOf(node)).toContain('tv-map');
    expect(attr(node, 'aria-label')).toBe('Trip map');
    expect(attr(node, 'aria-describedby')).toBe(MAP_CAPTION_ID);
    expect(attr(node, 'data-carry')).toBe('map');
    expect(attr(node, 'data-map-state')).toBe('idle');
    expect(attr(node, 'data-map-full')).toBe('off');
    expect(attr(node, 'data-map-focus')).toBe('0');
    expect(attr(node, 'hidden')).toBeNull();
    expect(attr(all(tree(tripMapHtml(MAP, { captionId: 'cap-2' })), '[data-trip-map]')[0], 'aria-describedby')).toBe('cap-2');
  });

  it('reserves its box: the box holds the stage, and the stylesheet gives the box its height by ratio and its own stacking context', () => {
    const [box] = all(node, '.tv-map-box');
    const [stage] = all(box, '.tv-map-stage');
    expect(attr(stage, 'data-map-stage')).toBe('');
    expect(all(all(stage, '[data-map-fallback]')[0], 'svg')).toHaveLength(1);
    expect(attr(all(stage, '[data-map-canvas]')[0], 'hidden')).toBe('');
    const { rules } = parseCss(read('css/views/shared/maps.css'));
    const declared = (selector, prop) => rules.filter((rule) => rule.selectors.includes(selector)).flatMap((rule) => rule.declarations).filter((d) => d.prop === prop).map((d) => d.value);
    expect(declared('[data-view] :where(.tv-map-box)::before', 'padding-top').join()).toContain('--tv-map-ratio');
    expect(declared('[data-view] :where(.tv-map-box)::before', 'min-height')).toHaveLength(1);
    expect(declared('[data-view] :where(.tv-map-stage)', 'position')).toEqual(['absolute']);
    expect(declared('[data-view] :where(.tv-map-box)', 'isolation')).toEqual(['isolate']);
    expect(declared('[data-view] :where(.tv-map-stage)', 'isolation')).toEqual(['isolate']);
  });

  it('carries the hooks: full screen, close, zoom, and a day row of its own in the dialog', () => {
    const [full] = all(node, '[data-action="map-full"]');
    expect(full.tag).toBe('button');
    expect(textOf(full).trim()).toBe('Open full map');
    expect(isInside(full, 'dialog')).toBe(false);
    const [dialog] = all(node, 'dialog');
    expect(attr(dialog, 'data-map-dialog')).toBe('');
    expect(attr(dialog, 'aria-label')).toBe('Trip map, full screen');
    expect(textOf(all(dialog, '[data-action="map-close"]')[0]).trim()).toBe('Close map');
    expect(all(dialog, '[data-map-dialog-slot]')).toHaveLength(1);
    const row = all(dialog, '[data-map-day]');
    expect(row.map((el) => attr(el, 'data-map-day'))).toEqual(['0', ...Array.from({ length: MAP.dayCount }, (_, i) => String(i + 1))]);
    expect(row.map((el) => attr(el, 'aria-pressed'))).toEqual(['true', ...Array.from({ length: MAP.dayCount }, () => 'false')]);
    expect(textOf(row[0])).toBe('All days');
    expect(textOf(row[3])).toBe('Day 3');
    expect(all(node, '[data-map-day]').filter((el) => !isInside(el, 'dialog'))).toHaveLength(0);
    const zoom = all(all(node, '[data-map-zoom]')[0], 'button');
    expect(zoom.map((el) => attr(el, 'data-action'))).toEqual(['map-zoom-in', 'map-zoom-out']);
    expect(zoom.map((el) => attr(el, 'aria-label'))).toEqual(['Zoom in', 'Zoom out']);
    expect(attr(all(node, '[data-map-zoom]')[0], 'hidden')).toBe('');
  });

  it('prints the OpenStreetMap attribution as a link, and keeps a status line for a failed background', () => {
    const [credit] = all(node, '[data-map-attr]');
    const [link] = all(credit, 'a');
    expect(attr(link, 'href')).toBe(TILE_PROVIDER.attributionHref);
    expect(attr(link, 'rel')).toContain('noopener');
    expect(textOf(link)).toBe(TILE_PROVIDER.attribution);
    const [note] = all(node, '[data-map-note]');
    expect(attr(note, 'role')).toBe('status');
    expect(textOf(note)).toBe('');
  });

  it('gives every control a focus key and a type', () => {
    for (const control of all(node, 'button')) {
      expect(attr(control, 'type')).toBe('button');
      expect(attr(control, 'data-focus-key')).not.toBeNull();
    }
    const keys = all(node, '[data-focus-key]').map((el) => attr(el, 'data-focus-key'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('puts "Open full map" before the stage, so the tab order follows what is seen (ruling R32)', () => {
    const [box] = all(node, '[data-map-box]');
    const inBox = box.children.filter((child) => child.tag);
    expect(inBox.map((el) => attr(el, 'data-action') ?? (attr(el, 'data-map-stage') === '' ? 'stage' : el.tag))).toEqual(['map-full', 'stage']);
    const stops = all(node, 'button, a').filter((el) => !isInside(el, 'dialog'));
    expect(stops.map((el) => attr(el, 'data-action') ?? attr(el, 'data-focus-key'))).toEqual(['map-full', 'map-zoom-in', 'map-zoom-out', 'map-attribution']);
    // The button keeps its corner whatever its place in the markup: positioned, above the stage, which has no z-index of its own.
    const { rules } = parseCss(read('css/views/shared/maps.css'));
    const declared = (selector, prop) => rules.filter((rule) => rule.selectors.includes(selector)).flatMap((rule) => rule.declarations).filter((d) => d.prop === prop).map((d) => d.value);
    expect(declared('[data-view] :where(.tv-map-full)', 'position')).toEqual(['absolute']);
    expect(Number(declared('[data-view] :where(.tv-map-full)', 'z-index')[0])).toBeGreaterThan(0);
    expect(declared('[data-view] :where(.tv-map-stage)', 'z-index')).toEqual([]);
    // Back from full screen the stage goes after the button again (the mounted map is proved in a browser).
    const source = read('js/views/shared/trip-map.js');
    expect(source).not.toMatch(/box\.prepend\(/);
    expect([...source.matchAll(/ui\.box\.append\(ui\.stage\)/g)]).toHaveLength(2);
  });

  it('leaves out the full-screen button when the view draws its own', () => {
    const own = all(tree(tripMapHtml(MAP, { fullButton: false })), '[data-trip-map]')[0];
    expect(all(own, '[data-action="map-full"]')).toHaveLength(0);
    expect(all(own, 'dialog')).toHaveLength(1);
    expect(all(own, '[data-map-box]')[0].children.filter((child) => child.tag).map((el) => attr(el, 'data-map-stage'))).toEqual(['']);
  });

  it('takes what a view wrote on its map slot as it is: data-map-full and data-map-caption (ruling R29)', () => {
    const drawn = (opts) => all(tree(tripMapHtml(MAP, opts)), '[data-trip-map]')[0];
    // <div data-map-slot data-map-full="off" data-map-caption="atlas-map-note">: the view has its own button and caption.
    const own = drawn({ fullButton: 'off', captionId: 'atlas-map-note' });
    expect(all(own, '[data-action="map-full"]')).toHaveLength(0);
    expect(attr(own, 'aria-describedby')).toBe('atlas-map-note');
    expect(attr(own, 'data-map-full')).toBe('off');
    // A slot without the attributes reads as undefined (dataset) or null (getAttribute): both mean the default.
    for (const absent of [undefined, null, '']) {
      const plain = drawn({ fullButton: absent, captionId: absent });
      expect(all(plain, '[data-action="map-full"]')).toHaveLength(1);
      expect(attr(plain, 'aria-describedby')).toBe(MAP_CAPTION_ID);
    }
    for (const on of ['on', true]) expect(all(drawn({ fullButton: on }), '[data-action="map-full"]')).toHaveLength(1);
  });

  it('is hidden and empty while nothing can be placed, so points that arrive later can fill it', () => {
    for (const map of [NO_MAP, { points: [], dayCount: 0 }, undefined]) {
      const [empty] = all(tree(tripMapHtml(map)), '[data-trip-map]');
      expect(attr(empty, 'hidden')).toBe('');
      expect(attr(empty, 'data-map-state')).toBe('empty');
      expect(all(empty, 'svg.tv-map-fsvg')).toHaveLength(0);
      expect(all(empty, '[data-map-stage]')).toHaveLength(1);
    }
  });

  it('skips a day with no stop in the day row', () => {
    const sparse = { points: [point(1, 1, 52, 4.8), point(4, 1, 52.1, 4.9)], dayCount: 5 };
    expect(all(tree(tripMapHtml(sparse)), '[data-map-day]').map((el) => attr(el, 'data-map-day'))).toEqual(['0', '1', '4']);
  });

  it('escapes its options', () => {
    const html = tripMapHtml(MAP, { captionId: HOSTILE, label: HOSTILE });
    expect(html).not.toContain('<img');
    const [hostile] = all(tree(html), '[data-trip-map]');
    expect(attr(hostile, 'aria-label')).toBe(HOSTILE);
    expect(attr(hostile, 'aria-describedby')).toBe(MAP_CAPTION_ID);
  });
});

describe('mapCaptionHtml', () => {
  const region = (html) => all(tree(html), '[data-region="map-caption"]')[0];

  it('is the map-caption region under the id the map names', () => {
    const el = region(mapCaptionHtml(MAP));
    expect(attr(el, 'id')).toBe(MAP_CAPTION_ID);
    expect(classesOf(el)).toContain('tv-map-caption');
    expect(attr(region(mapCaptionHtml(MAP, { id: 'cap-2' })), 'id')).toBe('cap-2');
  });

  it('counts the stops and days and says how to use the map', () => {
    const el = region(mapCaptionHtml(MAP));
    expect(textOf(el)).toBe('21 stops across 7 days. Each number marks a day. Pick a day to see its stops in order.');
    expect(all(el, 'button')).toHaveLength(0);
    expect(textOf(region(mapCaptionHtml({ points: [point(1, 1, 52, 4.8)], dayCount: 1 })))).toBe('1 stop on day 1.');
  });

  it('uses the count of all stops when the rows give it, and says how many of them are on the map', () => {
    // The facts count every stop; the map can place only those with a position. One count everywhere.
    const rows = Array.from({ length: 9 }, (_, i) => ({ dayNumber: i + 1, title: '', dateText: '', stops: 5 }));
    expect(textOf(region(mapCaptionHtml(MAP, { days: rows }))))
      .toBe('45 stops across 9 days, 21 of them on the map. Each number marks a day. Pick a day to see its stops in order.');
    expect(textOf(all(region(mapCaptionHtml(MAP, { day: 3, days: rows })), '.tv-map-caption-text')[0])).toBe('Day 3: 5 stops, 3 of them on the map in order.');
    const same = Array.from({ length: 7 }, (_, i) => ({ dayNumber: i + 1, title: '', dateText: '', stops: 3 }));
    expect(textOf(region(mapCaptionHtml(MAP, { days: same })))).toBe('21 stops across 7 days. Each number marks a day. Pick a day to see its stops in order.');
  });

  it('names the two busiest areas when there are areas', () => {
    const areas = [{ name: 'Old town', stops: 4 }, { name: 'Harbour', stops: 9 }, { name: 'Hills', stops: 6 }];
    expect(textOf(region(mapCaptionHtml(MAP, { areas })))).toContain('Busiest areas: Harbour and Hills.');
    expect(textOf(region(mapCaptionHtml(MAP, { areas: [{ name: 'Harbour', stops: 9 }] })))).toContain('Busiest area: Harbour.');
    expect(textOf(region(mapCaptionHtml(MAP, { areas: [{ name: '', stops: 3 }, null] })))).not.toContain('Busiest');
  });

  it('for a selected day says what is shown and offers "Open day N" and "Show all days"', () => {
    const el = region(mapCaptionHtml(MAP, { day: 3 }));
    const stops = MAP.points.filter((p) => p.dayNumber === 3);
    expect(textOf(all(el, '.tv-map-caption-text')[0])).toBe(`Day 3: ${stops.length} stops in order.`);
    const [open, back] = all(el, 'button');
    expect(textOf(open)).toBe('Open day 3');
    expect(attr(open, 'data-day-jump')).toBe(String(stops[0].dayIndex));
    expect(attr(open, 'data-map-day')).toBeNull();
    expect(textOf(back)).toBe('Show all days');
    expect(attr(back, 'data-map-day')).toBe('0');
    expect(all(el, 'button').map((b) => attr(b, 'data-focus-key'))).toEqual(['map-open-day', 'map-all-days']);
  });

  it('adds the day title when the rows are passed', () => {
    const days = [{ dayNumber: 3, title: 'Souks and gardens', dateText: 'Sun 21 Mar' }];
    expect(textOf(all(region(mapCaptionHtml(MAP, { day: 3, days })), '.tv-map-caption-text')[0])).toBe('Day 3, Sun 21 Mar. Souks and gardens: 3 stops in order.');
    const html = mapCaptionHtml(MAP, { day: 3, days: [{ dayNumber: 3, title: HOSTILE, dateText: '' }] });
    expect(html).not.toContain('<img');
    expect(textOf(region(html))).toContain(HOSTILE);
  });

  it('shows every day again for a day that has no stop, and is empty without points', () => {
    expect(all(region(mapCaptionHtml(MAP, { day: 99 })), 'button')).toHaveLength(0);
    expect(mapCaptionHtml(NO_MAP)).toBe('');
    expect(mapCaptionHtml(undefined)).toBe('');
  });
});

describe('mountTripMap', () => {
  it('without an element returns a handle whose every method is safe to call', () => {
    const handle = mountTripMap(null, { points: MAP.points });
    expect(Object.keys(handle).sort()).toEqual(['closeFull', 'destroy', 'focusDay', 'getState', 'invalidate', 'openFull', 'setPoints', 'setTheme']);
    expect(handle.getState()).toMatchObject({ status: 'empty', day: 0, full: false });
    expect(() => { handle.focusDay(2); handle.setPoints(MAP.points); handle.setTheme('light'); handle.invalidate(); handle.openFull(); handle.closeFull(); handle.destroy(); }).not.toThrow();
  });
});

describe('takesOverLive (a view switch on a scrolled page keeps a live map)', () => {
  const doc = {};
  it('is true for a map mounted on the same page right after a live map was destroyed', () => {
    expect(takesOverLive({ doc, at: 1000 }, doc, 1000)).toBe(true);
    expect(takesOverLive({ doc, at: 1000 }, doc, 2400)).toBe(true);
  });

  it('is false later, on another document, before the destroy, and with nothing to go by', () => {
    expect(takesOverLive({ doc, at: 1000 }, doc, 2600)).toBe(false);
    expect(takesOverLive({ doc, at: 1000 }, {}, 1100)).toBe(false);
    expect(takesOverLive({ doc, at: 1000 }, doc, 900)).toBe(false);
    expect(takesOverLive(null, doc, 1000)).toBe(false);
    expect(takesOverLive({ doc, at: NaN }, doc, 1000)).toBe(false);
    expect(takesOverLive({ doc, at: 1000 }, null, 1000)).toBe(false);
  });

  it('is wired in: a destroyed live map is remembered, and an eager map loads without the viewport observer', () => {
    const source = read('js/views/shared/trip-map.js');
    expect(source).toMatch(/if \(map && status === 'live'\) lastLive = \{ doc, at: Date\.now\(\) \};/);
    expect(source).toMatch(/const eager = opts\.eager === true \|\| takesOverLive\(lastLive, doc, Date\.now\(\)\);/);
    expect(source).toMatch(/if \(eager \|\| typeof win\.IntersectionObserver !== 'function'\) \{ loadMap\(\); return; \}/);
  });
});
