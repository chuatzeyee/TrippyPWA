// world-map.js: the inline SVG plates, their labels and the places list (blueprint 1.3, section 10
// rows 13 and 23). Every place and name here is invented. Owner: F7.
import { describe, it, expect } from 'vitest';
import { worldPlateSvg, landDefsSvg, placeLabels, placesListHtml, groupPlaces, placeKey, plateView, LAND_IDS } from './world-map.js';
import { LAND_WORLD } from './world-land.js';
import { mx, my } from '../../lib/geo.js';
import { DASHBOARD_FIXTURES } from '../fixtures/models.js';
import { parseHtml, all, attr, textOf, classesOf, isInside } from '../fixtures/checks/html-tree.js';
import { markupRules } from '../fixtures/checks/markup-rules.js';
import { parseCss } from '../fixtures/checks/css-spec.js';
import { readFileSync } from 'node:fs';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  return root;
};
const pin = (place, at, kind = 'past', tripIds = [`t-${place}`], over = {}) => ({
  at, kind, place, country: 'Testland', label: tripIds.length > 1 ? `${place}, ${tripIds.length} plans` : place,
  tripIds, count: tripIds.length, href: tripIds.length ? `#/trip/${tripIds[0]}` : '', todayHref: null, ...over,
});
const HOME = pin('Lisbon', [38.72, -9.14], 'home', [], { label: 'Lisbon, home' });
const LIVE = pin('Seville', [37.39, -5.98], 'live', ['t-seville'], { todayHref: '#/trip/t-seville?today=1' });
const UP = pin('Vancouver', [49.28, -123.12], 'up');
const PAST = pin('Nairobi', [-1.29, 36.82], 'past', ['t-a', 't-b']);
const WORLD = { id: 'wm-test', label: 'World map of your plans', view: plateView({ north: 79, south: -50, mid: 0, aspect: 16 / 10 }), cssW: 800 };
const plate = (over = {}) => ({ ...WORLD, pins: [HOME, LIVE, UP, PAST], ...over });
const READY = DASHBOARD_FIXTURES.ready.pins;

describe('plateView', () => {
  it('gives the box of a latitude range at an aspect ratio, centred on a longitude', () => {
    const view = plateView({ north: 60, south: 20, mid: 10, aspect: 2 });
    expect(view.north).toBe(60);
    expect(view.south).toBe(20);
    expect((view.west + view.east) / 2).toBeCloseTo(10, 9);
    expect((mx(view.east) - mx(view.west)) / (my(view.south) - my(view.north))).toBeCloseTo(2, 9);
  });
});

describe('worldPlateSvg', () => {
  it('draws one svg in world units that points at the shared land outline', () => {
    const root = tree(worldPlateSvg(plate()));
    const [svg] = all(root, 'svg');
    expect(classesOf(svg)).toContain('wm-plate');
    expect(attr(svg, 'id')).toBe('wm-test');
    const [x, y, w, h] = attr(svg, 'viewbox').split(' ').map(Number);
    expect(x).toBeCloseTo(mx(WORLD.view.west), 0);
    expect(y).toBeCloseTo(my(79), 0);
    expect(w).toBeCloseTo(mx(WORLD.view.east) - mx(WORLD.view.west), 0);
    expect(h).toBeCloseTo(my(-50) - my(79), 0);
    expect(attr(svg, 'style')).toMatch(/^--u:\d+(\.\d+)?$/);
    expect(attr(all(svg, 'use')[0], 'href')).toBe(`#${LAND_IDS.world}`);
    expect(all(svg, '.wm-grat')).toHaveLength(1);
  });

  it('is a labelled picture with decorative pins by default', () => {
    const [svg] = all(tree(worldPlateSvg(plate())), 'svg');
    expect(attr(svg, 'role')).toBe('img');
    expect(attr(svg, 'aria-label')).toBe('World map of your plans');
    const [pins] = all(svg, '.wm-pins');
    expect(attr(pins, 'aria-hidden')).toBe('true');
    expect(all(pins, '.wm-mark')).toHaveLength(4);
    expect(all(svg, '[tabindex]')).toHaveLength(0);
    expect(all(svg, '[role="button"]')).toHaveLength(0);
    expect(all(svg, 'a')).toHaveLength(0);
    expect(all(svg, 'title')).toHaveLength(0);
    expect(all(svg, '.wm-hit')).toHaveLength(0);
  });

  it('orders the layers: past under home under upcoming under live', () => {
    const kinds = (html) => all(tree(html), '.wm-mark').map((el) => classesOf(el).find((name) => name.startsWith('wm-mark--')));
    expect(kinds(worldPlateSvg(plate({ pins: [LIVE, UP, HOME, PAST] })))).toEqual(['wm-mark--past', 'wm-mark--home', 'wm-mark--up', 'wm-mark--live']);
    expect(kinds(worldPlateSvg(plate({ pins: [LIVE, UP, HOME, PAST] }), { interactive: true }))).toEqual(['wm-mark--past', 'wm-mark--home', 'wm-mark--up', 'wm-mark--live']);
  });

  it('gives a live pin its ping and ring, and a past pin a dot alone', () => {
    const marks = all(tree(worldPlateSvg(plate())), '.wm-mark');
    const live = marks.find((el) => classesOf(el).includes('wm-mark--live'));
    const past = marks.find((el) => classesOf(el).includes('wm-mark--past'));
    expect(all(live, 'circle').map((el) => attr(el, 'class'))).toEqual(['wm-ping', 'wm-ring', 'wm-dot']);
    expect(all(past, 'circle').map((el) => attr(el, 'class'))).toEqual(['wm-dot']);
    expect(Number(attr(all(live, '.wm-dot')[0], 'cx'))).toBeCloseTo(mx(-5.98), 0);
    expect(Number(attr(all(live, '.wm-dot')[0], 'cy'))).toBeCloseTo(my(37.39), 0);
  });

  it('skips pins that have no coordinates', () => {
    const broken = [pin('Nowhere', null), pin('Null island', [0, 0]), pin('Text', ['12', '4']), pin('Far', [95, 10]), { kind: 'past' }, null];
    const root = tree(worldPlateSvg(plate({ pins: [...broken, PAST] })));
    expect(all(root, '.wm-mark')).toHaveLength(1);
    expect(all(tree(worldPlateSvg(plate({ pins: [...broken, PAST] }), { interactive: true })), '.wm-pin')).toHaveLength(1);
    expect(all(tree(worldPlateSvg(plate({ pins: undefined }))), '.wm-mark')).toHaveLength(0);
  });

  it('with interactive: true is a labelled group whose pins are pointer targets, not tab stops', () => {
    const [svg] = all(tree(worldPlateSvg(plate(), { interactive: true })), 'svg');
    expect(attr(svg, 'role')).toBe('group');
    expect(attr(svg, 'aria-label')).toBe('World map of your plans');
    const pins = all(svg, '.wm-pin');
    expect(pins).toHaveLength(4);
    for (const el of pins) {
      expect(attr(el, 'tabindex')).toBe('-1');
      expect(attr(el, 'role')).toBe('button');
      expect(attr(el, 'data-place')).toMatch(/^-?\d+\.\d\d,-?\d+\.\d\d$/);
      expect(attr(el, 'aria-label')).not.toBe('');
      expect(all(el, 'title')).toHaveLength(1);
    }
    expect(pins.filter((el) => isInside(el, '[aria-hidden="true"]'))).toHaveLength(0);
    expect(all(svg, 'a')).toHaveLength(0);
  });

  it('gives every interactive pin a hit circle 44 px across at the width the plate is drawn for', () => {
    const [svg] = all(tree(worldPlateSvg(plate(), { interactive: true })), 'svg');
    const unitsPerPx = Number(attr(svg, 'style').split(':')[1]);
    expect(unitsPerPx).toBeCloseTo((mx(WORLD.view.east) - mx(WORLD.view.west)) / 800, 2);
    const hits = all(svg, '.wm-hit');
    expect(hits).toHaveLength(4);
    for (const hit of hits) expect((2 * Number(attr(hit, 'r'))) / unitsPerPx).toBeGreaterThanOrEqual(43.9);
  });

  it('holds the 44 px at every width, measured as the browser draws it: the viewBox across cssW px (ruling R32)', () => {
    const VIEWS = {
      world: undefined,
      wide: plateView({ north: 79, south: -50, mid: 10, aspect: 16 / 10 }),
      europe: plateView({ north: 71, south: 35, mid: 12, aspect: 4 / 3 }),
      apac: plateView({ north: 50, south: -48, mid: 125, aspect: 390 / 292 }),
    };
    const sizes = [];
    for (const [name, view] of Object.entries(VIEWS)) {
      for (let cssW = 240; cssW <= 1600; cssW += 1) {
        const [svg] = all(tree(worldPlateSvg({ label: 'Places', view, cssW, pins: [HOME, LIVE, PAST] }, { interactive: true })), 'svg');
        const pxPerUnit = cssW / Number(attr(svg, 'viewbox').split(' ')[2]);
        for (const hit of all(svg, '.wm-hit')) sizes.push({ name, cssW, px: 2 * Number(attr(hit, 'r')) * pxPerUnit });
      }
    }
    expect(sizes.length).toBeGreaterThan(4000);
    // One px to spare all round: the plate is fitted inside its frame, and a frame that is not quite the
    // shape of the view (a border, a rounded height) draws it a little smaller than cssW says.
    expect(sizes.filter(({ px }) => px < 46)).toEqual([]);
    expect(sizes.filter(({ px }) => px > 46.6)).toEqual([]);
    expect(sizes.filter(({ px }) => px * 0.957 < 44)).toEqual([]);
  });

  it('draws for 360 px when it is not told a width', () => {
    const u = (cssW) => Number(attr(all(tree(worldPlateSvg({ ...WORLD, cssW })), 'svg')[0], 'style').split(':')[1]);
    for (const none of [undefined, null, 0, -20, NaN, '720']) expect(u(none)).toBe(u(360));
    expect(u(720)).toBeCloseTo(u(360) / 2, 2);
  });

  it('keeps inside its own box: what lies beyond the view is cut off by the stylesheet', () => {
    const { rules } = parseCss(readFileSync(new URL('../../../css/views/shared/maps.css', import.meta.url), 'utf8'));
    const declared = (selector, prop) => rules.filter((rule) => rule.selectors.includes(selector)).flatMap((rule) => rule.declarations).filter((d) => d.prop === prop).map((d) => d.value);
    expect(declared('[data-view] :where(.wm-plate)', 'overflow')).toEqual(['hidden']);
    expect(declared('[data-view] :where(.wm-plate)', 'width')).toEqual(['100%']);
  });

  it('draws coincident pins as one target and names it once', () => {
    const second = pin('Nairobi', [-1.29, 36.82], 'up', ['t-c'], { country: '' });
    const [svg] = all(tree(worldPlateSvg(plate({ pins: [PAST, second] }), { interactive: true })), 'svg');
    const [only, ...rest] = all(svg, '.wm-pin');
    expect(rest).toHaveLength(0);
    expect(attr(only, 'aria-label')).toBe('Nairobi, 3 plans');
    expect(classesOf(only)).toContain('wm-pin--up');
    expect(all(only, '.wm-mark')).toHaveLength(2);
    expect(all(only, '.wm-hit')).toHaveLength(1);
  });

  it('marks the selected place', () => {
    const key = placeKey(UP);
    const pins = all(tree(worldPlateSvg(plate({ selected: key }), { interactive: true })), '.wm-pin');
    expect(pins.filter((el) => classesOf(el).includes('is-sel')).map((el) => attr(el, 'data-place'))).toEqual([key]);
    expect(pins.filter((el) => attr(el, 'aria-pressed') === 'true')).toHaveLength(1);
  });

  it('escapes titles, labels and the plate name', () => {
    const hostile = pin(HOSTILE, [10, 10], 'live', ['t-x'], { label: HOSTILE });
    for (const interactive of [false, true]) {
      const html = worldPlateSvg(plate({ label: HOSTILE, id: HOSTILE, pins: [hostile], labels: placeLabels([hostile], WORLD) }), { interactive });
      expect(html).not.toContain('<img');
      const root = tree(html);
      expect(all(root, 'img')).toHaveLength(0);
      expect(attr(all(root, 'svg')[0], 'aria-label')).toBe(HOSTILE);
      expect(all(root, '.wm-tag')).toHaveLength(1);
      expect(textOf(all(root, 'text')[0])).toBe(HOSTILE);
      if (interactive) expect(textOf(all(root, 'title')[0])).toBe(`${HOSTILE}, 1 plan`);
    }
  });

  it('draws arcs by kind and leaves out one that cannot be drawn', () => {
    const arcs = [{ from: HOME.at, to: UP.at, kind: 'up' }, { from: HOME.at, to: LIVE.at, kind: 'live' }, { from: HOME.at, to: HOME.at, kind: 'past' }, { from: null, to: UP.at, kind: 'past' },
      { from: HOME.at, to: PAST.at, kind: HOSTILE }];
    const paths = all(tree(worldPlateSvg(plate({ arcs }))), '.wm-arc');
    expect(paths.map((el) => attr(el, 'class'))).toEqual(['wm-arc wm-arc--up', 'wm-arc wm-arc--live', 'wm-arc wm-arc--past']);
    for (const el of paths) expect(attr(el, 'd')).toMatch(/^M-?\d+ -?\d+L/);
  });

  it('draws the labels it is given, hidden from assistive technology', () => {
    const labels = placeLabels([HOME, LIVE, UP, PAST], WORLD);
    const root = tree(worldPlateSvg(plate({ labels })));
    const [tags] = all(root, '.wm-tags');
    expect(attr(tags, 'aria-hidden')).toBe('true');
    expect(all(tags, '.wm-tag').map((el) => textOf(el))).toEqual(labels.map((label) => label.text));
    expect(all(tags, 'rect')).toHaveLength(labels.length);
  });

  it('falls back to the whole world and the world outline for a bare plate', () => {
    const [svg] = all(tree(worldPlateSvg({})), 'svg');
    expect(attr(svg, 'id')).toBeNull();
    expect(attr(svg, 'aria-label')).toBe('Map');
    expect(attr(all(svg, 'use')[0], 'href')).toBe('#wm-land-world');
    expect(attr(all(tree(worldPlateSvg({ land: 'europe' })), 'use')[0], 'href')).toBe('#wm-land-europe');
    expect(attr(all(tree(worldPlateSvg({ land: HOSTILE })), 'use')[0], 'href')).toBe('#wm-land-world');
  });

  it('renders every pin of the fixture account', () => {
    expect(all(tree(worldPlateSvg(plate({ pins: READY, view: undefined }))), '.wm-mark')).toHaveLength(READY.length);
  });
});

describe('landDefsSvg', () => {
  it('holds the world outline once, hidden, under the id the plates use', () => {
    const root = tree(landDefsSvg());
    const [svg] = all(root, 'svg');
    expect(attr(svg, 'aria-hidden')).toBe('true');
    expect(attr(svg, 'width')).toBe('0');
    const paths = all(svg, 'path');
    expect(paths.map((el) => attr(el, 'id'))).toEqual([LAND_IDS.world]);
    expect(attr(paths[0], 'd')).toBe(LAND_WORLD);
    expect(classesOf(paths[0])).toContain('wm-land');
  });
  it('adds the regional outlines when the page has loaded them', () => {
    const paths = all(tree(landDefsSvg({ europe: 'M0 0l1 1 1 0z', apac: 'M5 5l1 1 1 0z' })), 'path');
    expect(paths.map((el) => attr(el, 'id'))).toEqual([LAND_IDS.world, LAND_IDS.europe, LAND_IDS.apac]);
    expect(attr(paths[1], 'd')).toBe('M0 0l1 1 1 0z');
  });
  it('refuses anything that is not a path of rings', () => {
    const paths = all(tree(landDefsSvg({ europe: HOSTILE, apac: 42, moon: 'M0 0l1 1z' })), 'path');
    expect(paths.map((el) => attr(el, 'id'))).toEqual([LAND_IDS.world]);
  });
});

describe('groupPlaces and placeKey', () => {
  it('keys a place by its coordinates, to about a kilometre', () => {
    expect(placeKey(pin('A', [1.3521, 103.8198]))).toBe('1.35,103.82');
    expect(placeKey(pin('B', [1.3549, 103.8151]))).toBe('1.35,103.82');
    expect(placeKey(pin('C', [-0.004, -0.004]))).toBe('0.00,0.00');
    expect(placeKey(pin('D', null))).toBe('');
    expect(placeKey(null)).toBe('');
  });
  it('makes one place of pins that coincide and counts each plan once', () => {
    const groups = groupPlaces([pin('Porto', [41.15, -8.61], 'past', ['a', 'b']), pin('Porto', [41.15, -8.61], 'up', ['b', 'c'], { country: '' }), PAST]);
    expect(groups).toHaveLength(2);
    const porto = groups.find((group) => group.place === 'Porto');
    expect(porto.kind).toBe('up');
    expect(porto.tripIds).toEqual(['b', 'c', 'a']);
    expect(porto.count).toBe(3);
    expect(porto.label).toBe('Porto, 3 plans');
    expect(porto.href).toBe('#/trip/b');
    expect(porto.pins).toHaveLength(2);
  });
  it('words one plan, the home place alone and the home place with plans', () => {
    const label = (pins) => groupPlaces(pins)[0].label;
    expect(label([pin('Faro', [37.02, -7.93])])).toBe('Faro, 1 plan');
    expect(label([HOME])).toBe('Lisbon, home');
    expect(label([HOME, pin('Lisbon', [38.72, -9.14], 'past', ['a', 'b', 'c'])])).toBe('Lisbon, home and 3 plans');
    expect(groupPlaces([HOME, pin('Lisbon', [38.72, -9.14], 'past', ['a'])])[0]).toMatchObject({ kind: 'past', home: true, count: 1 });
  });
  it('puts the most current places first and keeps the given order within a kind', () => {
    const groups = groupPlaces([HOME, PAST, pin('Oslo', [59.9, 10.7], 'past'), UP, LIVE]);
    expect(groups.map((group) => group.place)).toEqual(['Seville', 'Vancouver', 'Nairobi', 'Oslo', 'Lisbon']);
  });
  it('does not change its input', () => {
    const pins = [Object.freeze({ ...PAST, tripIds: Object.freeze([...PAST.tripIds]) }), Object.freeze({ ...HOME })];
    expect(() => groupPlaces(Object.freeze(pins))).not.toThrow();
    expect(groupPlaces(null)).toEqual([]);
  });
});

describe('placesListHtml', () => {
  it('draws one button per place, with the hooks the Atlas page binds', () => {
    const root = tree(placesListHtml([HOME, LIVE, UP, PAST]));
    const [list] = all(root, 'ul');
    expect(classesOf(list)).toContain('wm-places');
    const buttons = all(list, 'button');
    expect(buttons).toHaveLength(4);
    expect(buttons.map((el) => textOf(all(el, '.wm-place-label')[0]))).toEqual(['Seville, 1 plan', 'Vancouver, 1 plan', 'Nairobi, 2 plans', 'Lisbon, home']);
    for (const el of buttons) {
      expect(attr(el, 'type')).toBe('button');
      expect(attr(el, 'data-place')).toBe(placeKey({ at: groupPlaces([HOME, LIVE, UP, PAST]).find((group) => group.key === attr(el, 'data-place')).at }));
      expect(attr(el, 'data-focus-key')).toBe(`place-${attr(el, 'data-place')}`);
      expect(attr(el, 'aria-pressed')).toBe('false');
    }
    expect(buttons.map((el) => attr(el, 'data-kind'))).toEqual(['live', 'up', 'past', 'home']);
  });
  it('groups coincident places: "Singapore, 3 plans"', () => {
    const pins = [pin('Singapore', [1.3521, 103.8198], 'past', ['a', 'b']), pin('Singapore', [1.3521, 103.8198], 'up', ['c'], { country: '' })];
    const buttons = all(tree(placesListHtml(pins)), 'button');
    expect(buttons).toHaveLength(1);
    expect(textOf(all(buttons[0], '.wm-place-label')[0])).toBe('Singapore, 3 plans');
  });
  it('uses the same key as the plate, so a button and its pin can be paired', () => {
    const pins = [HOME, LIVE, UP, PAST];
    const fromList = all(tree(placesListHtml(pins)), 'button').map((el) => attr(el, 'data-place')).sort();
    const fromPlate = all(tree(worldPlateSvg(plate({ pins }), { interactive: true })), '.wm-pin').map((el) => attr(el, 'data-place')).sort();
    expect(fromList).toEqual(fromPlate);
  });
  it('says in words what the colour says, and marks the selected place', () => {
    const root = tree(placesListHtml([LIVE, UP, PAST, HOME], { selected: placeKey(UP) }));
    const texts = all(root, 'button').map(textOf);
    expect(texts[0]).toContain('in a plan running now');
    expect(texts[1]).toContain('coming up');
    expect(texts[2]).toContain('in past plans');
    expect(all(root, 'button').map((el) => attr(el, 'aria-pressed'))).toEqual(['false', 'true', 'false', 'false']);
  });
  it('escapes hostile names and is empty without a place', () => {
    const html = placesListHtml([pin(HOSTILE, [5, 5])]);
    expect(html).not.toContain('<img');
    expect(textOf(all(tree(html), '.wm-place-label')[0])).toBe(`${HOSTILE}, 1 plan`);
    expect(placesListHtml([])).toBe('');
    expect(placesListHtml([pin('Nowhere', null)])).toBe('');
    expect(placesListHtml(undefined)).toBe('');
  });
});

describe('placeLabels', () => {
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const pairs = (labels) => labels.flatMap((a, i) => labels.slice(i + 1).map((b) => [a, b]));
  const inside = (box, view) => box.x >= mx(view.west) && box.x + box.w <= mx(view.east) && box.y >= my(view.north) && box.y + box.h <= my(view.south);

  it('labels live plans, the next three departures and home, in that order of priority', () => {
    const ups = ['Bergen', 'Cairo', 'Lima', 'Perth'].map((name, i) => pin(name, [[60.39, 5.32], [30.04, 31.24], [-12.05, -77.04], [-31.95, 115.86]][i], 'up'));
    const labels = placeLabels([HOME, PAST, ...ups, LIVE], WORLD);
    expect(labels.map((label) => label.text)).toEqual(['Seville', 'Bergen', 'Cairo', 'Lima', 'Home']);
    expect(labels.map((label) => label.kind)).toEqual(['live', 'up', 'up', 'up', 'home']);
    expect(labels.map((label) => label.priority)).toEqual([0, 1, 1, 1, 2]);
    for (const label of labels) expect(['l', 'r', 't', 'b']).toContain(label.dir);
  });

  it('uses the text a pin carries', () => {
    const [label] = placeLabels([{ ...LIVE, text: 'Spain, day 3 of 9' }], WORLD);
    expect(label.text).toBe('Spain, day 3 of 9');
    expect(label.key).toBe(placeKey(LIVE));
  });

  it('picks the side by quadrant: away from the nearer edge', () => {
    const east = pin('East', [10, 100], 'live');
    const west = pin('West', [10, -100], 'live');
    const [a, b] = placeLabels([east, west], WORLD);
    expect(a.dir).toBe('l');
    expect(b.dir).toBe('r');
    expect(a.box.x + a.box.w).toBeLessThan(mx(100));
    expect(b.box.x).toBeGreaterThan(mx(-100));
  });

  it('never returns overlapping boxes, and keeps every box on the plate', () => {
    // Forty pins on a tight grid: far more labels than fit.
    const crowd = Array.from({ length: 40 }, (_, i) => pin(`Place number ${i}`, [30 + (i % 5) * 1.5, -10 + Math.floor(i / 5) * 2], i % 3 === 0 ? 'live' : 'up'));
    for (const cssW of [320, 800, 1400]) {
      const labels = placeLabels(crowd, { ...WORLD, cssW });
      expect(labels.length).toBeGreaterThan(0);
      expect(labels.length).toBeLessThan(crowd.length);
      for (const [a, b] of pairs(labels)) expect(overlap(a.box, b.box), `${a.text} over ${b.text} at ${cssW}`).toBe(false);
      for (const label of labels) expect(inside(label.box, WORLD.view)).toBe(true);
    }
  });

  describe('with the pins of the plate (plate.pins): marks and the selection ring are kept clear', () => {
    // Home and a live plan three degrees apart: on a world plate 360 px wide that is ~3 px.
    const SMALL = { ...WORLD, cssW: 360 };
    const u = (mx(SMALL.view.east) - mx(SMALL.view.west)) / SMALL.cssW;
    const centre = (p) => [mx(p.at[1]), my(p.at[0])];
    const gapTo = (box, [x, y]) => Math.hypot(x - Math.min(Math.max(x, box.x), box.x + box.w), y - Math.min(Math.max(y, box.y), box.y + box.h));
    const liveText = { ...LIVE, text: 'Spain, day 7 of 10' };

    it('without plate.pins the Home label sits under the live pin beside it (the defect)', () => {
      const [home] = placeLabels([HOME], SMALL);
      expect(home.dir).toBe('r');
      expect(gapTo(home.box, centre(LIVE))).toBeLessThan(10 * u);
      const [moved] = placeLabels([HOME], { ...SMALL, pins: [HOME, LIVE] });
      expect(moved.dir).not.toBe('r');
      expect(gapTo(moved.box, centre(LIVE))).toBeGreaterThanOrEqual(12 * u - 0.1);
    });

    it('puts the Home label on the side away from a live pin close by', () => {
      const labels = placeLabels([liveText, HOME], { ...SMALL, pins: [HOME, LIVE, UP, PAST] });
      const home = labels.find((label) => label.kind === 'home');
      expect(home).toBeDefined();
      expect(gapTo(home.box, centre(LIVE))).toBeGreaterThanOrEqual(12 * u - 0.1); // the 10 px ping and 2 px of air
      for (const [a, b] of pairs(labels)) expect(overlap(a.box, b.box)).toBe(false);
      for (const label of labels) expect(inside(label.box, SMALL.view)).toBe(true);
    });

    it('keeps every label clear of the selection ring: of a place close by, and of its own place', () => {
      for (const selected of [placeKey(LIVE), placeKey(HOME)]) {
        const labels = placeLabels([liveText, HOME], { ...SMALL, pins: [HOME, LIVE, UP, PAST], selected });
        expect(labels.map((label) => label.kind), selected).toEqual(['live', 'home']);
        const ring = centre(selected === placeKey(LIVE) ? LIVE : HOME);
        for (const label of labels) expect(gapTo(label.box, ring), `${label.text} with ${selected}`).toBeGreaterThanOrEqual(25 * u - 0.1); // the 23 px ring and 2 px of air
        for (const [a, b] of pairs(labels)) expect(overlap(a.box, b.box)).toBe(false);
      }
    });

    it('leaves a label where it was when no other mark is near, and does not change the plate', () => {
      const far = { ...SMALL, pins: [HOME, UP, PAST] };
      const frozen = JSON.stringify(far);
      expect(placeLabels([HOME, UP], far)).toEqual(placeLabels([HOME, UP], SMALL));
      expect(JSON.stringify(far)).toBe(frozen);
    });

    it('with keepLive, never drops the label of a live plan for a lesser mark: it may lie over the mark instead', () => {
      // Two rings of upcoming places around the live pin: no side is clear of a mark, near or far.
      const ring = (radius, n) => Array.from({ length: n }, (_, i) => pin(`Ring ${radius} ${i}`, [LIVE.at[0] + radius * 0.75 * Math.sin(i * 2 * Math.PI / n), LIVE.at[1] + radius * Math.cos(i * 2 * Math.PI / n)], 'past'));
      const crowd = [...ring(11, 10), ...ring(26, 16), ...ring(40, 20)];
      // Off by default: the live label is dropped, as before.
      expect(placeLabels([liveText, HOME], { ...SMALL, pins: [HOME, LIVE, ...crowd] }).some((label) => label.kind === 'live')).toBe(false);
      const labels = placeLabels([liveText, HOME], { ...SMALL, keepLive: true, pins: [HOME, LIVE, ...crowd] });
      const live = labels.find((label) => label.kind === 'live');
      expect(live).toBeDefined();
      expect(live.text).toBe('Spain, day 7 of 10');
      expect(inside(live.box, SMALL.view)).toBe(true);
      for (const [a, b] of pairs(labels)) expect(overlap(a.box, b.box)).toBe(false);
      // A lesser label is still dropped rather than laid over a mark.
      const home = placeLabels([HOME], { ...SMALL, pins: [HOME, ...ring(11, 10).map((p) => ({ ...p, at: [p.at[0] + HOME.at[0] - LIVE.at[0], p.at[1] + HOME.at[1] - LIVE.at[1]] })), ...ring(26, 16).map((p) => ({ ...p, at: [p.at[0] + HOME.at[0] - LIVE.at[0], p.at[1] + HOME.at[1] - LIVE.at[1]] })), ...ring(40, 20).map((p) => ({ ...p, at: [p.at[0] + HOME.at[0] - LIVE.at[0], p.at[1] + HOME.at[1] - LIVE.at[1]] }))] });
      expect(home).toEqual([]);
    });

    it('drops a label that no side can take, and never the one with the higher priority', () => {
      const ringed = Array.from({ length: 8 }, (_, i) => pin(`Near ${i}`, [38.72 + 6 * Math.sin(i * Math.PI / 4), -9.14 + 8 * Math.cos(i * Math.PI / 4)], 'up'));
      const labels = placeLabels([liveText, HOME], { ...SMALL, pins: [HOME, LIVE, ...ringed] });
      expect(labels[0].kind).toBe('live');
      for (const label of labels) {
        for (const other of [HOME, LIVE, ...ringed].filter((p) => placeKey(p) !== label.key)) expect(gapTo(label.box, centre(other))).toBeGreaterThan(3 * u);
      }
    });
  });

  describe('a pin right beside a labelled place', () => {
    // Offsets in CSS px from a pin, turned back into degrees (my() is not linear, so the latitude is searched for).
    const latAt = (y) => { let [lo, hi] = [-80, 84]; for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (my(mid) > y) lo = mid; else hi = mid; } return (lo + hi) / 2; };
    const beside = (from, dx, dy, u, kind, name) => pin(name, [latAt(my(from.at[0]) + dy * u), from.at[1] + (dx * u) / (mx(1) - mx(0))], kind);
    const REACH = { live: 10, up: 7.5, home: 6.5, past: 3 };
    const gapPx = (box, p, u) => {
      const [x, y] = [mx(p.at[1]), my(p.at[0])];
      return Math.hypot(x - Math.min(Math.max(x, box.x), box.x + box.w), y - Math.min(Math.max(y, box.y), box.y + box.h)) / u - REACH[p.kind];
    };
    const live = { ...LIVE, text: 'Spain, day 10 of 12' };
    const WIDTHS = [360, 390, 800, 1280];

    it('never lays a label over the pin of another place, upcoming, past or live, at any width', () => {
      for (const cssW of WIDTHS) {
        const sized = { ...WORLD, cssW };
        const u = (mx(sized.view.east) - mx(sized.view.west)) / cssW;
        // One pin on each side, just where the label of the selected place would start.
        const near = [beside(LIVE, 32, 0, u, 'up', 'East'), beside(LIVE, -32, 0, u, 'past', 'West'), beside(LIVE, 0, -37, u, 'live', 'North'), beside(LIVE, 0, 37, u, 'up', 'South')];
        for (const selected of [placeKey(LIVE), '']) {
          const labels = placeLabels([live], { ...sized, pins: [LIVE, ...near], selected });
          expect(labels.map((label) => label.text), `${cssW} ${selected}`).toEqual(['Spain, day 10 of 12']);
          for (const other of near) expect(gapPx(labels[0].box, other, u), `${other.place} at ${cssW} ${selected}`).toBeGreaterThanOrEqual(1.9);
          expect(inside(labels[0].box, sized.view)).toBe(true);
          // The label still belongs to its pin: beside it or cornering it, never adrift.
          expect(gapPx(labels[0].box, { ...LIVE, kind: 'past' }, u) + REACH.past).toBeLessThanOrEqual(30);
        }
      }
    });

    it('drops the label when no position is free of pins, and the lower priority one first', () => {
      for (const cssW of WIDTHS) {
        const sized = { ...WORLD, cssW };
        const u = (mx(sized.view.east) - mx(sized.view.west)) / cssW;
        // A lattice of past dots 14 px apart around the home pin: no box 22 px tall fits between them.
        const lattice = [];
        for (let dx = -280; dx <= 280; dx += 14) for (let dy = -84; dy <= 84; dy += 14) if (dx || dy) lattice.push(beside(HOME, dx, dy, u, 'past', `Dot ${dx} ${dy}`));
        expect(placeLabels([HOME], { ...sized, pins: [HOME, ...lattice] }), `${cssW}`).toEqual([]);
        const far = pin('Lima', [-12.05, -77.04], 'live');
        const labels = placeLabels([HOME, far], { ...sized, pins: [HOME, far, ...lattice] });
        expect(labels.map((label) => label.text), `${cssW}`).toEqual(['Lima']);
        for (const other of lattice) expect(gapPx(labels[0].box, other, u)).toBeGreaterThanOrEqual(1.9);
      }
    });
  });

  it('keeps the label with the higher priority when two cannot both fit', () => {
    // A strip one label tall, with both pins at its left edge: only the right side is free, once.
    const narrow = { view: { north: 38.15, south: 36.95, west: -6.5, east: -0.5 }, cssW: 200 };
    const live = pin('Seville', [37.39, -5.98], 'live');
    const up = pin('Cordoba', [37.89, -5.9], 'up');
    for (const order of [[live, up], [up, live]]) {
      const labels = placeLabels(order, narrow);
      expect(labels.map((label) => label.text)).toEqual(['Seville']);
    }
    expect(placeLabels([up], narrow).map((label) => label.text)).toEqual(['Cordoba']);
  });

  it('leaves out a pin that is off the plate or has no coordinates', () => {
    const europe = { view: { north: 72, south: 36, west: -25, east: 45 }, cssW: 800 };
    expect(placeLabels([UP, pin('Nowhere', null, 'live'), LIVE], europe).map((label) => label.text)).toEqual(['Seville']);
    expect(placeLabels([], WORLD)).toEqual([]);
    expect(placeLabels(undefined, undefined)).toEqual([]);
  });

  it('labels coincident live pins once', () => {
    const twin = pin('Seville', [37.39, -5.98], 'live', ['t-other']);
    expect(placeLabels([LIVE, twin], WORLD)).toHaveLength(1);
  });
});
