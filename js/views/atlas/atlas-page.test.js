// The Atlas page (#/atlas) on every dashboard model fixture: its parts, its states, and the pure half
// of the place card (which plan of which place is shown, and where Previous and Next lead).
import { describe, it, expect } from 'vitest';
import { DASHBOARD_FIXTURES, CTX_FIXTURE } from '../fixtures/models.js';
import { all, attr, classesOf, parseHtml, textOf } from '../fixtures/checks/html-tree.js';
import { groupPlaces } from '../shared/world-map.js';
import { atlasPageHtml, loadAtlasBody, renderAtlasPage, mountAtlasPage } from './atlas-page.js';
import { placeEntries, stepEntry, placeStatus, placeCardHtml } from './atlas-stage.js';
import { atlasPlates } from './region-plates.js';

// The drawn half of the page is a chunk of its own; with it here, renderAtlasPage draws the page in full.
await loadAtlasBody();

const KEYS = Object.keys(DASHBOARD_FIXTURES);
const READY = KEYS.filter((key) => DASHBOARD_FIXTURES[key].state === 'ready');
const render = (key, ctx = CTX_FIXTURE) => renderAtlasPage(DASHBOARD_FIXTURES[key], ctx);
const tree = (key) => parseHtml(render(key)).root;
const one = (root, selector) => all(root, selector)[0] ?? null;
const texts = (root, selector) => all(root, selector).map(textOf);
const BANNED = /[—–·•…→]/;

describe.each(KEYS)('fixture %s', (key) => {
  const model = DASHBOARD_FIXTURES[key];
  const html = render(key);
  const root = parseHtml(html).root;
  it('is sound markup with one h1, "Atlas", and no banned glyph', () => {
    expect(parseHtml(html).errors).toEqual([]);
    expect(texts(root, 'h1')).toEqual(['Atlas']);
    expect(html).not.toMatch(BANNED);
    expect(render(key)).toBe(html);
  });
  it('labels every section with an h2 of its own and uses each id once', () => {
    for (const section of all(root, 'section')) {
      const id = attr(section, 'aria-labelledby');
      expect(all(section, 'h2').some((h2) => attr(h2, 'id') === id)).toBe(true);
    }
    const ids = all(root, '[id]').map((el) => attr(el, 'id'));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('never claims a journey', () => {
    expect(textOf(root)).not.toMatch(/you went|visited|stamped|trips? (logged|taken)|where you are/i);
  });
  it('draws no dashboard hook it has no use for', () => {
    expect(all(root, '[data-trip-search]')).toHaveLength(0);
    expect(all(root, '[data-filter]')).toHaveLength(0);
    expect(all(root, 'a.trip-card-link')).toHaveLength(0);
  });
  if (model.stale) {
    it('carries the stale banner with the retry', () => {
      expect(all(one(root, '[role="status"]'), '[data-action="retry-trips"]')).toHaveLength(1);
    });
  }
});

describe.each(READY)('ready fixture %s', (key) => {
  const model = DASHBOARD_FIXTURES[key];
  const root = tree(key);
  const groups = groupPlaces(model.pins);

  it('heads the page with the span of all plans and the three stats', () => {
    const head = one(root, 'header');
    expect(textOf(head)).toMatch(/Every place in your plans, from \d{1,2} \w{3} \d{4} to \d{1,2} \w{3} \d{4}\./);
    expect(textOf(one(head, '[data-region="stats"]'))).toBe(`${model.stats.trips} plans ${model.stats.countries} countries ${model.stats.daysPlanned} days planned`);
  });
  it('offers the plates as a radio group: the world, and each region that holds a pin', () => {
    const group = one(root, 'fieldset');
    const radios = all(group, 'input[type="radio"]');
    expect(radios.map((radio) => attr(radio, 'value'))).toEqual(atlasPlates(model.pins).map((plate) => plate.id));
    expect(radios.filter((radio) => attr(radio, 'checked') !== null).map((radio) => attr(radio, 'value'))).toEqual(['world']);
    expect(new Set(radios.map((radio) => attr(radio, 'name'))).size).toBe(1);
    expect(texts(group, 'label')).toEqual(atlasPlates(model.pins).map((plate) => plate.name));
    expect(textOf(one(group, 'legend'))).toBe('Map plate');
    // The regional outlines arrive later: until then only the world can be picked.
    expect(radios.slice(1).every((radio) => attr(radio, 'disabled') !== null)).toBe(true);
    expect(textOf(one(root, '.atl-legend'))).toBe('Happening now Upcoming Past Home');
  });
  it('draws the world plate as a group whose places are pointer targets, not tab stops', () => {
    const plate = one(one(root, '.atl-ap-map'), 'svg.wm-plate');
    expect(attr(plate, 'role')).toBe('group');
    const pins = all(plate, '[data-place]');
    expect(pins).toHaveLength(groups.length);
    for (const pin of pins) {
      expect(attr(pin, 'role')).toBe('button');
      expect(attr(pin, 'tabindex')).toBe('-1');
      expect(all(pin, 'circle.wm-hit')).toHaveLength(1);
    }
    expect(all(root, 'svg.wm-defs')).toHaveLength(1);
  });
  it('lists every place as a button: the keyboard and touch path, with places that coincide grouped', () => {
    const list = one(root, 'ul.wm-places');
    const buttons = all(list, 'button.wm-place');
    expect(buttons.map((button) => attr(button, 'data-place'))).toEqual(groups.map((group) => group.key));
    expect(buttons.filter((button) => attr(button, 'aria-pressed') === 'true')).toHaveLength(1);
    expect(textOf(list)).toContain(groups[0].label);
  });
  it('shows the card of the most current place: cover, city, title, status, dates and a plain link', () => {
    const card = one(root, '.atl-ap-card');
    const [first] = placeEntries(model);
    const plan = model.cardsById[first.tripId];
    expect(attr(one(root, '[data-atl-stage]'), 'data-place')).toBe(first.key);
    expect(attr(card, 'aria-live')).toBe('polite');
    expect(textOf(one(card, 'h3'))).toBe(plan.title);
    expect(textOf(card)).toContain(groups[0].place);
    expect(textOf(card)).toContain(plan.dates.text);
    expect(textOf(card)).toContain(placeStatus(plan));
    const links = all(card, 'a').filter((a) => (attr(a, 'href') ?? '').startsWith('#/trip/'));
    if (plan.phase === 'live') expect(links.map((a) => [textOf(a), attr(a, 'href')])).toContainEqual(['Open today', plan.todayHref]);
    expect(links.map((a) => [textOf(a), attr(a, 'href')])).toContainEqual(['Open trip', plan.wholeHref]);
    expect(texts(card, 'button')).toEqual(['Previous', 'Next']);
    expect(all(card, '.ui-frame')).toHaveLength(1);
  });
  it('has the passport: a stamp per country, the calendar bars and the facts', () => {
    const passport = one(root, 'section.atl-ap-pass');
    expect(attr(passport, 'id')).toBe('atl-passport');
    expect(textOf(one(passport, 'h2'))).toBe('Passport');
    expect(all(passport, '.atl-stamp')).toHaveLength(model.stats.byCountry.length);
    const months = one(passport, '.atl-months');
    expect(attr(months, 'role')).toBe('img');
    expect(all(months, '.atl-mo')).toHaveLength(model.stats.byMonth.length);
    expect(textOf(passport)).toContain(`${model.stats.calendarDays} days, overlaps counted once`);
    expect(textOf(passport)).toContain('Calendar days with a plan');
    expect(texts(passport, 'dt')).toEqual(['Furthest north', 'Furthest south', 'Furthest from home', 'Most planned']);
    expect(textOf(passport)).toMatch(/~[\d,]+ km/);
  });
  it('ends with the outline credit', () => {
    expect(textOf(one(root, 'footer'))).toContain('Map outline: Natural Earth, public domain.');
  });
});

describe('the empty atlas', () => {
  const root = tree('empty');
  it('starts at home, with zeroed stats and both ways to plan', () => {
    expect(textOf(root)).toContain('Your atlas starts in Lisbon');
    expect(textOf(one(root, '[data-region="stats"]'))).toBe('0 plans 0 countries 0 days planned');
    expect(all(root, '[data-action="new-trip"]')).toHaveLength(1);
    expect(all(root, '[data-action="import-trip"]')).toHaveLength(1);
    expect(texts(root, 'text')).toEqual(['Home, Lisbon']);
  });
  it('draws no switcher, no list of places and no passport', () => {
    expect(one(root, 'fieldset')).toBeNull();
    expect(one(root, 'ul.wm-places')).toBeNull();
    expect(one(root, 'section.atl-ap-pass')).toBeNull();
  });
});

describe('the load error', () => {
  it('is an alert that holds the retry, and nothing of the map', () => {
    const root = tree('error');
    expect(all(one(root, '[role="alert"]'), '[data-action="retry-trips"]')).toHaveLength(1);
    expect(all(root, 'svg.wm-plate')).toHaveLength(0);
  });
});

describe('placeEntries', () => {
  const model = DASHBOARD_FIXTURES.twoLive;
  const entries = placeEntries(model);
  it('is one entry per plan of every place, most current place first, then home', () => {
    const groups = groupPlaces(model.pins);
    expect(entries).toHaveLength(groups.reduce((sum, group) => sum + Math.max(1, group.tripIds.length), 0));
    expect(entries[0]).toMatchObject({ key: groups[0].key, tripId: groups[0].tripIds[0], plan: 0, of: groups[0].tripIds.length });
    expect(entries[entries.length - 1]).toMatchObject({ tripId: null, of: 0 });
    for (const entry of entries.filter((one) => one.tripId)) expect(model.cardsById[entry.tripId]).toBeTruthy();
  });
  it('leaves out a plan the model does not hold', () => {
    const pins = model.pins.map((pin) => (pin.kind === 'home' ? pin : { ...pin, tripIds: [...pin.tripIds, 'gone'] }));
    expect(placeEntries({ ...model, pins }).some((entry) => entry.tripId === 'gone')).toBe(false);
  });
  it('is empty without a pin', () => {
    expect(placeEntries({ ...model, pins: [] })).toEqual([]);
  });
});

describe('stepEntry', () => {
  const entries = placeEntries(DASHBOARD_FIXTURES.ready);
  it('moves to the next and the previous entry and wraps at both ends', () => {
    expect(stepEntry(entries, 0, 1)).toBe(1);
    expect(stepEntry(entries, 0, -1)).toBe(entries.length - 1);
    expect(stepEntry(entries, entries.length - 1, 1)).toBe(0);
    expect(stepEntry([], 0, 1)).toBe(0);
  });
});

describe('placeStatus', () => {
  it('says where a plan stands, never that anyone went', () => {
    const { cardsById } = DASHBOARD_FIXTURES.ready;
    expect(placeStatus(cardsById['s-seville'])).toBe('Happening now, day 7 of 10');
    expect(placeStatus(cardsById['s-marrakech'])).toBe('In 9 days');
    expect(placeStatus({ ...cardsById['s-marrakech'], daysToGo: 1 })).toBe('Tomorrow');
    expect(placeStatus(cardsById['s-rome'])).toBe('Past plan');
    expect(placeStatus(DASHBOARD_FIXTURES.noDates.cardsById['s-florence'])).toBe('No dates yet');
  });
});

describe('placeCardHtml', () => {
  const model = DASHBOARD_FIXTURES.ready;
  const entries = placeEntries(model);
  it('says which plan of several is shown', () => {
    const lisbonPlans = { ...model, pins: model.pins.map((pin) => (pin.place === 'Rome' ? { ...pin, tripIds: ['s-rome', 's-athens'], count: 2 } : pin)) };
    const list = placeEntries(lisbonPlans);
    const at = list.findIndex((entry) => entry.tripId === 's-athens');
    const card = parseHtml(placeCardHtml(lisbonPlans, list, at, CTX_FIXTURE)).root;
    expect(textOf(card)).toContain('Plan 2 of 2 here');
    expect(textOf(one(card, 'h3'))).toBe('Athens long weekend');
  });
  it('shows home as the place the arcs start from, with no link', () => {
    const at = entries.findIndex((entry) => entry.tripId === null);
    const card = parseHtml(placeCardHtml(model, entries, at, CTX_FIXTURE)).root;
    expect(textOf(one(card, 'h3'))).toBe('Home');
    expect(all(card, 'a')).toHaveLength(0);
    expect(classesOf(one(card, '.ui-frame'))).toContain('ui-frame--3x2');
  });
  it('is empty text for an index that does not exist', () => {
    expect(placeCardHtml(model, entries, 999, CTX_FIXTURE)).toBe('');
  });
});

describe('a ready page before its drawn half has arrived', () => {
  const waiting = (key) => parseHtml(atlasPageHtml(DASHBOARD_FIXTURES[key], CTX_FIXTURE, null));
  it.each(READY)('fixture %s: the head, the stats, an empty plate box that says it is busy, and the foot', (key) => {
    const { root, errors } = waiting(key);
    expect(errors).toEqual([]);
    expect(texts(root, 'h1')).toEqual(['Atlas']);
    expect(all(root, '[data-region="stats"]')).toHaveLength(1);
    expect(all(one(root, '[data-atl-wait][aria-busy="true"]'), '.atl-ap-map')).toHaveLength(1);
    expect([...all(root, '[data-atl-stage]'), ...all(root, '[data-atl-plates]'), ...all(root, 'section')]).toHaveLength(0);
    expect(textOf(one(root, 'footer'))).toContain('Natural Earth');
  });
  it('names what it will be drawn from, so a model that gains a pin is a new frame', () => {
    const model = DASHBOARD_FIXTURES.ready;
    const mark = (m) => attr(one(parseHtml(atlasPageHtml(m, CTX_FIXTURE, null)).root, '[data-atl-wait]'), 'data-atl-wait');
    expect(mark({ ...model, pins: model.pins.slice(1) })).not.toBe(mark(model));
  });
  it('is the full page once the drawn half is given, and the same states either way', () => {
    expect(all(parseHtml(render('ready')).root, '[data-atl-wait]')).toHaveLength(0);
    expect(all(parseHtml(render('ready')).root, '[data-atl-stage]')).toHaveLength(1);
    for (const key of KEYS.filter((one) => !READY.includes(one) || !placeEntries(DASHBOARD_FIXTURES[one]).length)) {
      expect(atlasPageHtml(DASHBOARD_FIXTURES[key], CTX_FIXTURE, null)).toBe(render(key));
    }
  });
});

describe('mountAtlasPage', () => {
  it('is a function', () => {
    expect(typeof mountAtlasPage).toBe('function');
  });
});
