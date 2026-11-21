// The pure plate helpers of the Atlas view: which plates to offer, the box each one draws, the arcs
// from home, the pins that get a label, and the compact form the page keeps for a rebuild.
import { describe, it, expect } from 'vitest';
import { mx, my } from '../../lib/geo.js';
import { DASHBOARD_FIXTURES } from '../fixtures/models.js';
import { placeLabels } from '../shared/world-map.js';
import { worldWindow, plateArcs, labelPins, packPlate, unpackPlate, plateSvg, placePlateLabels } from './plates.js';
import { PLATE_IDS, atlasPlates, plateFrame } from './region-plates.js';

const pin = (place, at, kind = 'past', extra = {}) => ({ at, kind, place, country: '', label: place, tripIds: kind === 'home' ? [] : ['t1'], count: kind === 'home' ? 0 : 1, href: '', todayHref: null, ...extra });
const LISBON = pin('Lisbon', [38.72, -9.14]);
const TOKYO = pin('Tokyo', [35.68, 139.69]);
const SINGAPORE = pin('Singapore', [1.35, 103.82]);
const SYDNEY = pin('Sydney', [-33.87, 151.21]);
const HOME = pin('Lisbon', [38.72, -9.14], 'home');
const ids = (plates) => plates.map((plate) => plate.id);
const ratio = (view) => (mx(view.east) - mx(view.west)) / (my(view.south) - my(view.north));

describe('atlasPlates', () => {
  it('offers the world alone when there is no pin', () => {
    expect(ids(atlasPlates([]))).toEqual(['world']);
    expect(ids(atlasPlates(null))).toEqual(['world']);
  });
  it('offers a regional plate only when it holds a plan pin', () => {
    expect(ids(atlasPlates([LISBON]))).toEqual(['world', 'europe']);
    expect(ids(atlasPlates([TOKYO]))).toEqual(['world', 'east-asia']);
    expect(ids(atlasPlates([SINGAPORE]))).toEqual(['world', 'southeast-asia']);
    expect(ids(atlasPlates([SYDNEY]))).toEqual(['world', 'australia']);
  });
  it('keeps the fixed order whatever the order of the pins', () => {
    expect(ids(atlasPlates([SYDNEY, SINGAPORE, TOKYO, LISBON]))).toEqual(PLATE_IDS);
  });
  it('does not count the bare home pin, or a pin that cannot be placed', () => {
    expect(ids(atlasPlates([HOME]))).toEqual(['world']);
    expect(ids(atlasPlates([pin('Nowhere', [null, null]), pin('Null island', [0, 0])]))).toEqual(['world']);
  });
  it('draws Europe from its own outline and the other three from the Asia-Pacific one', () => {
    const lands = Object.fromEntries(atlasPlates([SYDNEY, SINGAPORE, TOKYO, LISBON]).map((plate) => [plate.id, plate.land]));
    expect(lands).toEqual({ world: 'world', europe: 'europe', 'east-asia': 'apac', 'southeast-asia': 'apac', australia: 'apac' });
  });
  it('names every plate in sentence case', () => {
    expect(atlasPlates([SYDNEY, SINGAPORE, TOKYO, LISBON]).map((plate) => plate.name)).toEqual(['World', 'Europe', 'East Asia', 'Southeast Asia', 'Australia']);
  });
});

describe('plateFrame', () => {
  const LIMITS = { europe: [36, 78, -48, 60], 'east-asia': [-56, 62, 60, 180], 'southeast-asia': [-56, 62, 60, 180], australia: [-56, 62, 60, 180] };
  it.each(Object.keys(LIMITS))('keeps the %s plate inside its outline at phone and desktop shapes', (id) => {
    const [south, north, west, east] = LIMITS[id];
    for (const aspect of [390 / 292, 16 / 10, 2]) {
      const view = plateFrame(id, aspect, [LISBON, TOKYO, SINGAPORE, SYDNEY]);
      expect(view.south).toBeGreaterThanOrEqual(south);
      expect(view.north).toBeLessThanOrEqual(north);
      expect(view.west).toBeGreaterThanOrEqual(west - 1e-6);
      expect(view.east).toBeLessThanOrEqual(east + 1e-6);
      if (aspect < 2) expect(ratio(view)).toBeCloseTo(aspect, 3);
    }
  });
  it('centres a regional plate on its pins when they are off to one side', () => {
    const west = plateFrame('europe', 390 / 292, [pin('Reykjavik', [64.15, -21.94])]);
    const east = plateFrame('europe', 390 / 292, [pin('Istanbul', [41.01, 28.98])]);
    expect((west.west + west.east) / 2).toBeLessThan((east.west + east.east) / 2);
    expect(west.west).toBeLessThan(-21.94);
    expect(east.east).toBeGreaterThan(28.98);
  });
  it('reads an unknown id as the world', () => {
    expect(plateFrame('mars', 16 / 10, [LISBON])).toEqual(plateFrame('world', 16 / 10, [LISBON]));
  });
});

describe('worldWindow', () => {
  it('fills the frame exactly and never leaves the outline', () => {
    for (const aspect of [390 / 172, 746 / 470, 390 / 292, 16 / 10]) {
      const view = worldWindow([LISBON, TOKYO, SYDNEY], aspect);
      expect(ratio(view)).toBeCloseTo(aspect, 3);
      expect(view.west).toBeGreaterThanOrEqual(-192);
      expect(view.east).toBeLessThanOrEqual(192);
    }
  });
  it('shows every pin when they fit', () => {
    const pins = [pin('Vancouver', [49.28, -123.12], 'up'), pin('Athens', [37.98, 23.73]), pin('Lima', [-12.05, -77.04])];
    const view = worldWindow(pins, 746 / 470);
    for (const { at } of pins) {
      expect(at[1]).toBeGreaterThan(view.west);
      expect(at[1]).toBeLessThan(view.east);
    }
  });
  it('keeps the live and upcoming pins when not everything fits', () => {
    const pins = [pin('Vancouver', [49.28, -123.12]), pin('Auckland', [-36.85, 174.76], 'live'), pin('Tokyo', [35.68, 139.69], 'up')];
    const view = worldWindow(pins, 390 / 292);
    expect(view.east).toBeGreaterThan(174.76);
    expect(view.west).toBeLessThan(139.69);
  });
  it('has a calm default with no pin, and gives the same answer twice', () => {
    const view = worldWindow([], 16 / 10);
    expect((view.west + view.east) / 2).toBeCloseTo(10, 0);
    expect(worldWindow([LISBON, TOKYO], 16 / 10)).toEqual(worldWindow([LISBON, TOKYO], 16 / 10));
  });
  it('can keep the left of the frame clear for what is laid over it', () => {
    const pins = [pin('Lisbon', [38.72, -9.14], 'live'), pin('Rome', [41.9, 12.5])];
    const plain = worldWindow(pins, 746 / 470);
    const inset = worldWindow(pins, 746 / 470, { clearLeft: 0.3 });
    const share = (view, lon) => (lon - view.west) / (view.east - view.west);
    expect(share(inset, -9.14)).toBeGreaterThanOrEqual(0.3);
    expect(share(inset, -9.14)).toBeGreaterThanOrEqual(share(plain, -9.14));
  });
});

describe('plateArcs', () => {
  const model = DASHBOARD_FIXTURES.twoLive;
  it('draws one arc from home to the first place of every plan, most current on top', () => {
    const arcs = plateArcs(model);
    const home = model.pins.find((one) => one.kind === 'home').at;
    const first = arcs.filter((arc) => arc.from[0] === home[0] && arc.from[1] === home[1]);
    expect(first.length).toBeGreaterThanOrEqual(8);
    expect(arcs.map((arc) => arc.kind)).toEqual([...arcs.map((arc) => arc.kind)].sort((a, b) => ['past', 'up', 'live'].indexOf(a) - ['past', 'up', 'live'].indexOf(b)));
    expect(arcs.some((arc) => arc.kind === 'live')).toBe(true);
    expect(arcs.some((arc) => arc.kind === 'up')).toBe(true);
  });
  it('draws no arc without a home pin', () => {
    expect(plateArcs({ ...model, pins: model.pins.filter((one) => one.kind !== 'home') })).toEqual([]);
  });
  it('links the cities of a plan that is not past, and leaves a past one as a single arc', () => {
    const past = plateArcs(DASHBOARD_FIXTURES.ready).filter((arc) => arc.kind === 'past');
    const budapest = DASHBOARD_FIXTURES.ready.cardsById['s-vienna-budapest'].places[1];
    expect(past.some((arc) => arc.to[0] === budapest.lat && arc.to[1] === budapest.lng)).toBe(false);
  });
  it('leaves plans that are still being planned off the map', () => {
    const dublin = DASHBOARD_FIXTURES.generating.cardsById['s-dublin'].places[0];
    expect(plateArcs(DASHBOARD_FIXTURES.generating).some((arc) => arc.to[0] === dublin.lat)).toBe(false);
  });
  it('does not change the model', () => {
    const before = JSON.stringify(model);
    plateArcs(model);
    expect(JSON.stringify(model)).toBe(before);
  });
});

describe('labelPins', () => {
  it('labels each live plan with its country and day, then the next departures, then home', () => {
    const pins = labelPins(DASHBOARD_FIXTURES.ready);
    expect(pins.map((one) => [one.kind, one.text])).toEqual([
      ['live', 'Spain, day 7 of 10'],
      ['up', 'Marrakech in 9 days'],
      ['up', 'Vancouver in 57 days'],
      ['up', 'Buenos Aires in 176 days'],
      ['home', 'Home'],
    ]);
  });
  it('labels two live plans, lead first', () => {
    const texts = labelPins(DASHBOARD_FIXTURES.twoLive).filter((one) => one.kind === 'live').map((one) => one.text);
    expect(texts).toEqual(['Spain, day 7 of 10', 'Japan, day 3 of 9']);
  });
  it('can be told how many departures to label', () => {
    expect(labelPins(DASHBOARD_FIXTURES.ready, { upcoming: 1 }).filter((one) => one.kind === 'up')).toHaveLength(1);
  });
  it('falls back to the place name when the first place has no country, and says tomorrow', () => {
    const model = DASHBOARD_FIXTURES.ready;
    const seville = model.cardsById['s-seville'];
    const marrakech = model.cardsById['s-marrakech'];
    const changed = {
      ...model,
      live: [{ ...model.live[0], trip: { ...seville, places: [{ ...seville.places[0], country: '' }] } }],
      cardsById: { ...model.cardsById, 's-marrakech': { ...marrakech, daysToGo: 1 } },
    };
    const texts = labelPins(changed).map((one) => one.text);
    expect(texts[0]).toBe('Seville, day 7 of 10');
    expect(texts).toContain('Marrakech tomorrow');
  });
  it('gives the home label alone on an empty account, and nothing without a home', () => {
    expect(labelPins(DASHBOARD_FIXTURES.empty).map((one) => one.text)).toEqual(['Home']);
    expect(labelPins({ ...DASHBOARD_FIXTURES.empty, pins: [] })).toEqual([]);
  });
});

describe('packPlate and unpackPlate', () => {
  it('carry the pins, the arcs and the labels through a string', () => {
    const model = DASHBOARD_FIXTURES.ready;
    const packed = packPlate(model);
    expect(typeof packed).toBe('string');
    const { pins, arcs, labels } = unpackPlate(packed);
    expect(pins).toHaveLength(model.pins.length);
    expect(pins.map((one) => one.kind).sort()).toEqual(model.pins.map((one) => one.kind).sort());
    expect(arcs).toHaveLength(plateArcs(model).length);
    expect(labels.map((one) => one.text)).toEqual(labelPins(model).map((one) => one.text));
    expect(pins[0].at[0]).toBeCloseTo(model.pins[0].at[0], 2);
  });
  it('reads anything else as an empty plate', () => {
    for (const bad of ['', 'nonsense', '{"p":3}', null, undefined]) expect(unpackPlate(bad)).toEqual({ pins: [], arcs: [], labels: [] });
  });
  it('drops entries that are not points', () => {
    expect(unpackPlate(JSON.stringify({ p: [['x', 2, 'l'], [1, 2, 'q'], [3, 4, 'u']], a: [[1, 2, 3, 'x', 'u']], l: [[1, 2, 'u', 7]] })))
      .toEqual({ pins: [{ at: [1, 2], kind: 'past', place: '' }, { at: [3, 4], kind: 'up', place: '' }], arcs: [], labels: [] });
  });
});

describe('plateSvg', () => {
  const model = DASHBOARD_FIXTURES.ready;
  const data = unpackPlate(packPlate(model));
  it('is a picture by default, with its label and the shared land outline', () => {
    const svg = plateSvg({ ...data, view: worldWindow(data.pins, 390 / 172), cssW: 390, label: 'World map of your plans' });
    expect(svg).toMatch(/^<svg class="wm-plate"/);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="World map of your plans"');
    expect(svg).toContain('href="#wm-land-world"');
    expect(svg).not.toContain('data-place');
  });
  it('places labels for the plate it is given', () => {
    const svg = plateSvg({ ...data, view: worldWindow(data.pins, 746 / 470), cssW: 760, label: 'Map' });
    expect(svg).toContain('Spain, day 7 of 10');
    expect(svg).toContain('wm-tag--live');
  });
  it('limits the labels when asked', () => {
    const svg = plateSvg({ ...data, view: worldWindow(data.pins, 746 / 470), cssW: 760, label: 'Map', maxLabels: 1 });
    expect(svg.match(/class="wm-tag /g)).toHaveLength(1);
  });
  it('gives every place a pointer target when it is interactive', () => {
    const svg = plateSvg({ ...data, view: worldWindow(data.pins, 16 / 10), cssW: 840, label: 'Map', interactive: true });
    expect(svg).toContain('role="group"');
    expect(svg.match(/data-place="/g).length).toBeGreaterThanOrEqual(10);
  });
  it('keeps every label out of the part of the frame that something is laid over', () => {
    const view = worldWindow([], 746 / 470);
    const lon = view.west + (view.east - view.west) * 0.52;
    const text = 'A place with a very long name, in 120 days';
    const plate = { pins: [{ at: [20, lon], kind: 'up', place: 'X' }], arcs: [], labels: [{ at: [20, lon], kind: 'up', place: 'X', text }], view, cssW: 746, label: 'Map' };
    const leftOf = (svg) => (Number(/<g class="wm-tag [^>]*><rect x="(-?[\d.]+)"/.exec(svg)?.[1]) - mx(view.west)) / (mx(view.east) - mx(view.west));
    expect(leftOf(plateSvg(plate))).toBeLessThan(0.2);
    const kept = plateSvg({ ...plate, clearLeft: 0.2 });
    expect(kept).toContain(text);
    expect(leftOf(kept)).toBeGreaterThanOrEqual(0.2);
  });
  it('never drops the label of a live plan because other pins crowd it', () => {
    const view = worldWindow([], 746 / 470);
    const at = [50, (view.west + view.east) / 2];
    const steps = (reach, step) => Array.from({ length: (2 * reach) / step + 1 }, (_, i) => i * step - reach);
    const crowd = steps(8, 2).flatMap((lat) => steps(24, 3).map((lon) => [lat, lon])).filter(([lat, lon]) => lat || lon)
      .map(([lat, lon], i) => ({ at: [at[0] + lat, at[1] + lon], kind: 'past', place: `P${i}` }));
    const svg = plateSvg({ pins: [{ at, kind: 'live', place: 'X' }, ...crowd], arcs: [], labels: [{ at, kind: 'live', place: 'X', text: 'Norway, day 10 of 12' }], view, cssW: 746, label: 'Map' });
    expect(svg).toContain('Norway, day 10 of 12');
  });
  it('escapes a label', () => {
    const svg = plateSvg({ pins: [{ at: [10, 10], kind: 'live', place: 'X' }], arcs: [], labels: [{ at: [10, 10], kind: 'live', place: 'X', text: '<b>"x"' }], view: worldWindow([], 16 / 10), cssW: 800, label: 'Map' });
    expect(svg).not.toContain('<b>');
  });
});

describe('plateData and packData', () => {
  it('pack any plate, not only a model', async () => {
    const { plateData, packData } = await import('./plates.js');
    const data = plateData(DASHBOARD_FIXTURES.ready);
    expect(unpackPlate(packData(data)).labels.map((one) => one.text)).toEqual(data.labels.map((one) => one.text));
    const home = { pins: [{ at: [38.72, -9.14], kind: 'live', place: 'Lisbon' }], arcs: [], labels: [{ at: [38.72, -9.14], kind: 'live', place: 'Lisbon', text: 'Home, Lisbon' }] };
    expect(unpackPlate(packData(home))).toEqual({ pins: [{ at: [38.72, -9.14], kind: 'live', place: '' }], arcs: [], labels: [{ at: [38.72, -9.14], kind: 'live', place: '', text: 'Home, Lisbon' }] });
    expect(packData(null)).toBe('{"p":[],"a":[],"l":[]}');
  });
});

describe('worldWindow, when the pins are wider than the frame', () => {
  const far = [pin('Vancouver', [49.28, -123.12], 'up'), pin('Kyoto', [35.01, 135.77], 'live'), pin('Lisbon', [38.72, -9.14], 'home')];
  it('zooms out, north and south, until every pin is on the plate', () => {
    const base = worldWindow([LISBON], 390 / 292);
    const view = worldWindow(far, 390 / 292);
    expect(view.north).toBeGreaterThan(base.north);
    expect(view.south).toBeLessThan(base.south);
    for (const { at } of far) {
      expect(at[1]).toBeGreaterThan(view.west);
      expect(at[1]).toBeLessThan(view.east);
    }
    expect(ratio(view)).toBeCloseTo(390 / 292, 3);
    expect(view.north).toBeLessThanOrEqual(86);
    expect(view.south).toBeGreaterThanOrEqual(-75);
  });
  it('zooms out no further than it has to', () => {
    const wide = worldWindow(far, 16 / 10);
    const narrow = worldWindow(far, 390 / 292);
    expect(wide.north).toBeLessThan(narrow.north);
  });
  it('keeps its latitudes when told not to fit', () => {
    const view = worldWindow(far, 390 / 292, { fit: false });
    expect([view.north, view.south]).toEqual([79, -50]);
  });
});

describe('plateFrame, a regional plate and its pins', () => {
  const south = [pin('Lisbon', [38.72, -9.14]), pin('Seville', [37.39, -5.98], 'live'), pin('Rome', [41.9, 12.5]), pin('Athens', [37.98, 23.73])];
  it('zooms in on the latitudes its pins are at, with room around them', () => {
    const view = plateFrame('europe', 16 / 10, south);
    expect(view.north).toBeLessThan(72);
    expect(view.north).toBeGreaterThan(41.9 + 3);
    expect(view.south).toBe(36);
    for (const { at } of south) {
      expect(at[1]).toBeGreaterThan(view.west + 2);
      expect(at[1]).toBeLessThan(view.east - 2);
    }
    expect(ratio(view)).toBeCloseTo(16 / 10, 3);
  });
  it('never zooms in so far that the plate shows a sliver', () => {
    const view = plateFrame('europe', 16 / 10, [pin('Rome', [41.9, 12.5])]);
    expect(view.north - view.south).toBeGreaterThanOrEqual(0.55 * 36);
  });
  it('zooms back out when the pins are spread wide', () => {
    const wide = plateFrame('europe', 390 / 292, [pin('Reykjavik', [64.15, -21.94]), pin('Istanbul', [41.01, 28.98]), pin('Seville', [37.39, -5.98])]);
    expect(wide.west).toBeLessThan(-21.94);
    expect(wide.east).toBeGreaterThan(28.98);
    expect(wide.north).toBeGreaterThan(64.15);
    expect(wide.west).toBeGreaterThanOrEqual(-48);
    expect(wide.east).toBeLessThanOrEqual(60);
  });
  it('keeps the whole region when no pin is in it', () => {
    const view = plateFrame('australia', 16 / 10, [LISBON]);
    expect([view.north, view.south]).toEqual([-8, -48]);
  });
});

describe('placePlateLabels', () => {
  const view = worldWindow([], 746 / 470);
  const mid = (view.west + view.east) / 2;
  const at = [50, mid];
  const steps = (reach, step) => Array.from({ length: (2 * reach) / step + 1 }, (_, i) => i * step - reach);
  const crowd = steps(8, 2).flatMap((lat) => steps(24, 3).map((lon) => [lat, lon])).filter(([lat, lon]) => lat || lon)
    .map(([lat, lon], i) => ({ at: [at[0] + lat, at[1] + lon], kind: 'past', place: `P${i}` }));
  const up = [-20, mid + 60];
  const beside = { at: [-20, mid + 57], kind: 'live', place: 'N' };
  const live = { at, kind: 'live', place: 'X', text: 'Norway, day 10 of 12' };
  const next = { at: up, kind: 'up', place: 'U', text: 'Uptown in 12 days' };

  it('keeps the other labels clear of the pins when a crowded live label had to be placed without that rule', () => {
    const plate = { view, cssW: 746, pins: [live, ...crowd, next, beside] };
    // Without the rule the label of U lies to the left, over the mark of N.
    expect(placeLabels([live, next], { ...plate, pins: [] }).map((one) => one.dir)).toEqual([expect.any(String), 'l']);
    expect(placeLabels([live, next], plate).map((one) => one.text)).toEqual([next.text]);
    const placed = placePlateLabels([live, next], plate);
    expect(placed.map((one) => one.text)).toEqual([live.text, next.text]);
    expect(placed[1].dir).not.toBe('l');
  });
  it('gives a label some air from the pin beside it, and loses no label for it', () => {
    const plate = { view, cssW: 746, pins: [next, beside] };
    const placed = placePlateLabels([next], plate);
    expect(placed.map((one) => one.text)).toEqual([next.text]);
    expect(placed[0].dir).not.toBe('l');
    expect(placePlateLabels([next], { view, cssW: 746, pins: [next] })).toEqual(placeLabels([next], { view, cssW: 746, pins: [next] }));
  });
  it('in that case lets a label lie over the small dot of a past plan rather than lose it', () => {
    const ring = steps(8, 2).flatMap((lat) => steps(24, 3).map((lon) => [lat, lon])).filter(([lat, lon]) => lat || lon)
      .map(([lat, lon], i) => ({ at: [up[0] + lat, up[1] + lon], kind: 'past', place: `R${i}` }));
    const plate = { view, cssW: 746, pins: [live, ...crowd, next, ...ring] };
    expect(placeLabels([next], plate)).toEqual([]);
    expect(placePlateLabels([live, next], plate).map((one) => one.text)).toEqual([live.text, next.text]);
  });
  it('takes an empty or broken list', () => {
    expect(placePlateLabels(null, { view, cssW: 746, pins: [] })).toEqual([]);
  });
});
