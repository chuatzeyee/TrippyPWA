// day-extras.js: the inert block the trip page adds to each day card header in view mode
// (blueprint 4.2, 7.4). Owner: F6.
import { describe, it, expect } from 'vitest';
import { dayCardExtrasHtml, dayAsideHtml } from './day-extras.js';
import { conditionPhrase } from './day-index.js';
import { costText } from '../../lib/money.js';
import { TRIP_FIXTURES } from '../fixtures/models.js';
import { parseHtml, all, attr, textOf, classesOf, isElement } from '../fixtures/checks/html-tree.js';
import { markupRules, regionRules } from '../fixtures/checks/markup-rules.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const BANNED = /[\u2013\u2014\u00b7\u2022\u2026\u2192]/;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  expect(regionRules(root)).toEqual([]);
  return root;
};
const ROWS = TRIP_FIXTURES.upcoming.days;
const FULL = ROWS[1];          // theme, weather, cost, four photos, times
const NO_THEME = ROWS[4];      // theme ''
const NO_TIMES = ROWS[3];      // firstTime and lastTime null
const NO_WEATHER = ROWS[6];    // weather null
const NO_PHOTOS = TRIP_FIXTURES.photosOff.days[1];
const NO_COST = { ...FULL, cost: { ...FULL.cost, local: null, home: null, homeFirst: false } };
const one = (root, selector) => all(root, selector);

describe('dayCardExtrasHtml', () => {
  it('is one root element that names its day, so the controller can find and replace it', () => {
    const root = tree(dayCardExtrasHtml(FULL));
    const top = root.children.filter(isElement);
    expect(top).toHaveLength(1);
    expect(classesOf(top[0])).toContain('tv-day-extras');
    expect(attr(top[0], 'data-day-extras')).toBe(String(FULL.index));
    expect(root.children.every((child) => isElement(child) || child.text.trim() === '')).toBe(true);
  });
  it('is inert: no link, no button, no input, no tab stop, no region, no id', () => {
    for (const row of [...ROWS, ...TRIP_FIXTURES.live.days, NO_PHOTOS, NO_COST]) {
      const root = tree(dayCardExtrasHtml(row));
      expect(all(root, 'a, button, input, select, textarea, summary, details, label')).toHaveLength(0);
      expect(all(root, '[tabindex], [data-action], [data-day-jump], [data-map-day], [data-section-jump], [data-region], [id], [role]')).toHaveLength(0);
    }
  });
  it('a day with everything shows theme, typical weather, times, stops, cost and its photos', () => {
    const root = tree(dayCardExtrasHtml(FULL));
    expect(textOf(one(root, '.tv-day-theme')[0])).toBe(FULL.theme);
    expect(textOf(one(root, '.tv-day-weather')[0])).toBe(`${FULL.weather.range} typical, ${conditionPhrase(FULL.weather.condition)}`);
    expect(textOf(one(root, '.tv-day-times')[0])).toBe(`${FULL.firstTime} to ${FULL.lastTime}`);
    expect(textOf(one(root, '.tv-day-stops')[0])).toBe(`${FULL.stops} stops`);
    expect(one(root, '.tv-day-photos')).toHaveLength(1);
    expect(all(one(root, '.tv-day-photos')[0], 'img').map((img) => attr(img, 'src'))).toEqual(FULL.photos.map((photo) => photo.src));
  });
  it('the cost is the one cost sentence: the lead figure, "per person, activities only", then the other currency', () => {
    const root = tree(dayCardExtrasHtml(FULL));
    const [cost] = one(root, '.tv-day-cost');
    expect(textOf(cost).replace(/\s+\./g, '.')).toBe(costText(FULL.cost));
    expect(textOf(cost)).toContain('per person');
    expect(textOf(one(cost, '.tv-cost-lead')[0])).toBe(`about ${FULL.cost.home.text}`);
    expect(textOf(one(cost, '.tv-cost-other')[0])).toContain(FULL.cost.local.text);
    const localOnly = { ...FULL, cost: { ...FULL.cost, home: null, homeFirst: false } };
    const [plain] = one(tree(dayCardExtrasHtml(localOnly)), '.tv-day-cost');
    expect(textOf(plain)).toBe(costText(localOnly.cost));
    expect(textOf(plain)).not.toMatch(/about/);
    expect(one(plain, '.tv-cost-other')).toHaveLength(0);
  });
  it('a day without a theme has no theme line', () => {
    const root = tree(dayCardExtrasHtml(NO_THEME));
    expect(one(root, '.tv-day-theme')).toHaveLength(0);
    expect(one(root, '.tv-day-weather')).toHaveLength(1);
  });
  it('spells a short weather label out inside the sentence (ruling R30)', () => {
    const root = tree(dayCardExtrasHtml({ ...FULL, weather: { range: '5 to 14°C', condition: 'Pt. Cloudy' } }));
    expect(textOf(one(root, '.tv-day-weather')[0])).toBe('5 to 14°C typical, partly cloudy');
  });
  it('a day without weather has no weather, and never an empty placeholder', () => {
    const root = tree(dayCardExtrasHtml(NO_WEATHER));
    expect(one(root, '.tv-day-weather')).toHaveLength(0);
    expect(textOf(root)).not.toMatch(/typical/i);
    expect(one(root, '.tv-day-cost')).toHaveLength(1);
  });
  it('a day without a cost has no cost', () => {
    const root = tree(dayCardExtrasHtml(NO_COST));
    expect(one(root, '.tv-day-cost')).toHaveLength(0);
    expect(textOf(root)).not.toContain('per person');
    expect(one(root, '.tv-day-theme')).toHaveLength(1);
  });
  it('a day without photos has no photo row and no image', () => {
    const root = tree(dayCardExtrasHtml(NO_PHOTOS));
    expect(one(root, '.tv-day-photos')).toHaveLength(0);
    expect(all(root, 'img')).toHaveLength(0);
    expect(one(root, '.tv-day-theme')).toHaveLength(1);
  });
  it('shows at most four photos, decorative, with no referrer', () => {
    const many = { ...FULL, photos: [...FULL.photos, ...FULL.photos].map((photo, i) => ({ ...photo, src: `${photo.src}?n=${i}` })) };
    const imgs = all(tree(dayCardExtrasHtml(many)), 'img');
    expect(imgs).toHaveLength(4);
    for (const img of imgs) {
      expect(attr(img, 'alt')).toBe('');
      expect(attr(img, 'referrerpolicy')).toBe('no-referrer');
      expect(attr(img, 'loading')).toBe('lazy');
    }
  });
  it('a day without times has no time range; with one time it shows that one', () => {
    expect(one(tree(dayCardExtrasHtml(NO_TIMES)), '.tv-day-times')).toHaveLength(0);
    expect(textOf(one(tree(dayCardExtrasHtml({ ...FULL, lastTime: null })), '.tv-day-times')[0])).toBe(FULL.firstTime);
    expect(textOf(one(tree(dayCardExtrasHtml({ ...FULL, lastTime: FULL.firstTime })), '.tv-day-times')[0])).toBe(FULL.firstTime);
  });
  it('says how many stops opening the card shows, and what closing it does', () => {
    const root = tree(dayCardExtrasHtml(FULL));
    expect(textOf(one(root, '.tv-day-more-show')[0])).toBe(`Show ${FULL.stops} stops`);
    expect(textOf(one(root, '.tv-day-more-hide')[0])).toBe('Hide stops');
    expect(textOf(one(tree(dayCardExtrasHtml({ ...FULL, stops: 1 })), '.tv-day-more-show')[0])).toBe('Show 1 stop');
    const empty = tree(dayCardExtrasHtml({ ...FULL, stops: 0 }));
    expect(one(empty, '.tv-day-more')).toHaveLength(0);
    expect(textOf(one(empty, '.tv-day-stops')[0])).toBe('No stops yet');
  });
  it('a day with nothing at all is still the root, so later data has a place to land', () => {
    const bare = { index: 2, dayNumber: 3, date: '', dateText: '', title: 'Free day', theme: '', stops: 0, cost: NO_COST.cost, weather: null, colorIndex: 3, thumb: null, photos: [], firstTime: null, lastTime: null, isToday: false };
    const root = tree(dayCardExtrasHtml(bare));
    const [top] = root.children.filter(isElement);
    expect(attr(top, 'data-day-extras')).toBe('2');
    expect(textOf(top)).toBe('No stops yet');
  });
  it('returns nothing without a row', () => {
    expect(dayCardExtrasHtml(null)).toBe('');
    expect(dayCardExtrasHtml(undefined)).toBe('');
    expect(dayCardExtrasHtml('day')).toBe('');
  });
  it('escapes hostile text and refuses an unsafe photo address', () => {
    const hostile = { ...FULL, index: HOSTILE, theme: HOSTILE, weather: { range: HOSTILE, condition: HOSTILE }, firstTime: HOSTILE, lastTime: HOSTILE, photos: [{ src: 'javascript:alert(1)', alt: HOSTILE }] };
    const root = tree(dayCardExtrasHtml(hostile));
    expect(all(root, 'img')).toHaveLength(0);
    expect(textOf(one(root, '.tv-day-theme')[0])).toBe(HOSTILE);
  });
  it('does not change the row it is given, and prints no banned glyph', () => {
    const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    expect(() => dayCardExtrasHtml(freeze(structuredClone(FULL)))).not.toThrow();
    for (const model of Object.values(TRIP_FIXTURES)) for (const row of model.days) expect(dayCardExtrasHtml(row)).not.toMatch(BANNED);
  });
});

describe('dayCardExtrasHtml: the stop before the second figure is a span of its own', () => {
  const both = TRIP_FIXTURES.upcoming.days.find((row) => row.cost?.local && row.cost?.home);
  it('keeps the sentence as costText() writes it, with .tv-cost-sep around the stop alone', () => {
    expect(both).toBeTruthy();
    const root = tree(dayCardExtrasHtml(both));
    expect(textOf(one(root, '.tv-day-cost')[0]).replace(/\s+/g, ' ').replace(/ \./g, '.')).toBe(costText(both.cost));
    const other = one(root, '.tv-cost-other')[0];
    expect(textOf(one(other, '.tv-cost-sep')[0]).trim()).toBe('.');
    expect(textOf(other).replace(/^\.\s*/, '')).not.toMatch(/^\./);
  });
});

// --- The day panel (TripLandingParts.dayAside) ----------------------------------------------------
// Invented days: a full one in two areas, and the edges (no coordinates, one stop, nothing to book).

const pt = (order, lat, lng, title) => ({ lat, lng, dayNumber: 2, dayIndex: 1, order, title, colorIndex: 2 });
const ASIDE = {
  index: 1, dayNumber: 2, colorIndex: 2,
  map: { points: [pt(1, 55.679, 12.572, 'Royal palace'), pt(3, 55.692, 12.599, 'Jazz night')], placed: 2, total: 3 },
  stops: 3, firstTime: '10:00 AM', lastTime: '8:30 PM', cost: FULL.cost, weather: { range: '2 to 8°C', condition: 'Pt. Cloudy' },
  areas: ['Old town', 'Harbour'],
  book: [{ label: 'Palace tickets', booked: true }, { label: 'Table for the jazz night', booked: false }],
  list: [
    { id: 'a-1', at: 0, number: 1, time: '10:00 AM', title: 'Royal palace' },
    { id: 'a-2', at: 1, number: 2, time: '1:00 PM', title: 'Market lunch' },
    { id: '', at: 2, number: 3, time: '', title: 'Jazz night' },
  ],
};
const BARE = { ...ASIDE, map: null, firstTime: null, lastTime: null, cost: null, weather: null, areas: [], book: [] };
const ONE_STOP = { ...BARE, stops: 1, firstTime: '9:00 AM', lastTime: '9:00 AM', map: { points: [pt(1, 55.679, 12.572, 'Harbour walk')], placed: 1, total: 1 }, list: [ASIDE.list[0]] };
/** Descendants of the first match of each selector in turn (the test tree reads one compound at a time). */
const within = (root, ...path) => path.reduce((found, selector) => found.flatMap((el) => all(el, selector)), [root]);
const partsOf = (root) => all(root, 'aside')[0].children.filter(isElement).map((el) => classesOf(el)[0]);
const facts = (root) => Object.fromEntries(within(root, '.tv-day-aside-facts', 'dt').map((dt, i) => [textOf(dt), textOf(within(root, '.tv-day-aside-facts', 'dd')[i])]));

describe('dayAsideHtml', () => {
  it('is nothing without a model, and one <aside> that names its day with one', () => {
    expect(dayAsideHtml(null)).toBe('');
    expect(dayAsideHtml(undefined)).toBe('');
    expect(dayAsideHtml('x')).toBe('');
    const root = tree(dayAsideHtml(ASIDE));
    const top = root.children.filter(isElement);
    expect(top).toHaveLength(1);
    expect(top[0].tag).toBe('aside');
    expect(classesOf(top[0])).toContain('tv-day-aside');
    expect(attr(top[0], 'data-day-aside')).toBe('1');
    expect(attr(top[0], 'aria-label')).toBe('Day 2 at a glance');
    expect(attr(top[0], 'style')).toBe('--tone:var(--day-2)');
  });

  it('holds the four parts in order: the map, the facts, what to book, the stops', () => {
    const root = tree(dayAsideHtml(ASIDE));
    expect(partsOf(root)).toEqual(['tv-day-aside-map', 'tv-day-aside-facts', 'tv-day-aside-book', 'tv-day-aside-stops']);
    expect(all(root, 'h4').map(textOf)).toEqual(['This day at a glance', 'To book for this day', 'Stops']);
    expect(all(root, 'h1, h2, h3')).toHaveLength(0);
  });

  it('draws the stops of the day on a map without tiles, numbered as in the list, with the route between them', () => {
    const root = tree(dayAsideHtml(ASIDE));
    const [map] = all(root, '.tv-day-aside-map');
    expect(all(map, 'svg')).toHaveLength(1);
    expect(all(map, 'img, iframe, [data-trip-map], [data-map-slot]')).toHaveLength(0);
    expect(all(map, '.tv-map-fstop').map(textOf)).toEqual(['1', '3']);
    expect(all(map, '.tv-map-froute')).toHaveLength(1);
    expect(textOf(all(map, '.tv-day-aside-note')[0])).toBe('2 of 3 stops on the map');
  });

  it('says how many stops are on the map only when some are not', () => {
    const all3 = { ...ASIDE, map: { ...ASIDE.map, placed: 3, total: 3 } };
    expect(all(tree(dayAsideHtml(all3)), '.tv-day-aside-note')).toHaveLength(0);
  });

  it('states the facts of the day: stops, hours, cost per person, typical weather, areas', () => {
    const root = tree(dayAsideHtml(ASIDE));
    expect(facts(root)).toEqual({
      Stops: '3', Hours: '10:00 AM to 8:30 PM', Cost: `about ${FULL.cost.home.text} per person, activities only`,
      Weather: '2 to 8°C typical, partly cloudy', Areas: 'Old town, Harbour',
    });
    expect(textOf(all(root, '.tv-day-aside-facts')[0])).toContain('per person');
  });

  it('leaves out each fact and each part that has nothing to say', () => {
    const root = tree(dayAsideHtml(BARE));
    expect(partsOf(root)).toEqual(['tv-day-aside-facts', 'tv-day-aside-stops']);
    expect(facts(root)).toEqual({ Stops: '3' });
    expect(all(root, 'svg.tv-map-fsvg')).toHaveLength(0);
    expect(facts(tree(dayAsideHtml({ ...BARE, areas: ['Old town'] })))).toEqual({ Stops: '3', Area: 'Old town' });
  });

  it('a day with one stop: one time, one mark, no route line', () => {
    const root = tree(dayAsideHtml(ONE_STOP));
    expect(facts(root)).toEqual({ Stops: '1', Hours: '9:00 AM' });
    expect(all(root, '.tv-map-fstop').map(textOf)).toEqual(['1']);
    expect(all(root, '.tv-map-froute')).toHaveLength(0);
    expect(within(root, '.tv-day-aside-stops', 'button')).toHaveLength(1);
  });

  it('lists what to book with its state in words, and one way to the checklist', () => {
    const root = tree(dayAsideHtml(ASIDE));
    const rows = within(root, '.tv-day-aside-book', 'li');
    expect(rows.map((li) => [textOf(all(li, '.tv-day-aside-label')[0]), textOf(all(li, '.tv-day-aside-state')[0]), attr(all(li, '.tv-day-aside-state')[0], 'data-state')]))
      .toEqual([['Palace tickets', 'Booked', 'done'], ['Table for the jazz night', 'To book', 'todo']]);
    const jumps = within(root, '.tv-day-aside-book', 'button[data-section-jump]');
    expect(jumps).toHaveLength(1);
    expect(attr(jumps[0], 'data-section-jump')).toBe('checklist');
    expect(attr(jumps[0], 'type')).toBe('button');
    expect(textOf(jumps[0])).toBe('Open the checklist');
  });

  it('lists every stop as a button that names the stop to scroll to', () => {
    const root = tree(dayAsideHtml(ASIDE));
    const buttons = within(root, '.tv-day-aside-stops', 'ol', 'li', 'button');
    expect(buttons).toHaveLength(3);
    expect(buttons.every((el) => attr(el, 'type') === 'button' && classesOf(el).join(' ') === 'tv-day-aside-stop')).toBe(true);
    expect(buttons.map((el) => [attr(el, 'data-stop-jump'), attr(el, 'data-stop-at')])).toEqual([['a-1', '0'], ['a-2', '1'], ['', '2']]);
    expect(buttons.map((el) => attr(el, 'data-focus-key'))).toEqual(['day-1-stop-0', 'day-1-stop-1', 'day-1-stop-2']);
    expect(buttons.map((el) => textOf(el).replace(/\s+/g, ' ').trim())).toEqual(['1 10:00 AM Royal palace', '2 1:00 PM Market lunch', '3 Jazz night']);
    expect(within(root, '.tv-day-aside-stops', '.tv-day-aside-time').map(textOf)).toEqual(['10:00 AM', '1:00 PM']);
  });

  it('escapes every string of the plan', () => {
    const hostile = {
      ...ASIDE, areas: [HOSTILE], firstTime: HOSTILE, lastTime: `${HOSTILE}2`, weather: { range: HOSTILE, condition: HOSTILE },
      book: [{ label: HOSTILE, booked: false }], list: [{ id: HOSTILE, at: 0, number: 1, time: HOSTILE, title: HOSTILE }],
      map: { points: [pt(1, 55.679, 12.572, HOSTILE)], placed: 1, total: 1 },
    };
    const html = dayAsideHtml(hostile);
    expect(html).not.toContain('<img');
    const root = tree(html);
    expect(all(root, 'img, script')).toHaveLength(0);
    expect(all(root, '[onerror]')).toHaveLength(0);
    expect(textOf(within(root, '.tv-day-aside-book', '.tv-day-aside-label')[0])).toBe(HOSTILE);
    expect(attr(within(root, '.tv-day-aside-stops', 'button')[0], 'data-stop-jump')).toBe(HOSTILE);
    expect(textOf(within(root, '.tv-day-aside-stops', '.tv-day-aside-title')[0])).toBe(HOSTILE);
  });

  it('uses none of the glyphs the copy rules ban, and no coordinates or ids as text', () => {
    for (const model of [ASIDE, BARE, ONE_STOP]) {
      const root = tree(dayAsideHtml(model));
      expect(textOf(root)).not.toMatch(BANNED);
      expect(textOf(root)).not.toContain('a-1');
    }
  });

  it('copes with a model whose lists are missing', () => {
    const root = tree(dayAsideHtml({ index: 0, dayNumber: 1, colorIndex: 99, stops: 2 }));
    expect(facts(root)).toEqual({ Stops: '2' });
    expect(partsOf(root)).toEqual(['tv-day-aside-facts']);
    expect(attr(all(root, 'aside')[0], 'style')).toBe('--tone:var(--day-1)');
  });
});
