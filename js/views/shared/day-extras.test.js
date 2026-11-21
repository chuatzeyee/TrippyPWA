// day-extras.js: the inert block the trip page adds to each day card header in view mode
// (blueprint 4.2, 7.4). Owner: F6.
import { describe, it, expect } from 'vitest';
import { dayCardExtrasHtml } from './day-extras.js';
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
