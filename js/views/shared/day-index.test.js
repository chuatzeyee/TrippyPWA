// day-index.js: the day index as a list, a strip or chips (blueprint 2.4, 3.4). Owner: F6.
import { describe, it, expect } from 'vitest';
import { dayIndexHtml, typicalText, stopsText, conditionPhrase } from './day-index.js';
import { weatherLabel } from '../../lib/weather.js';
import { TRIP_FIXTURES } from '../fixtures/models.js';
import { parseHtml, all, attr, textOf, classesOf, isElement } from '../fixtures/checks/html-tree.js';
import { markupRules, regionRules } from '../fixtures/checks/markup-rules.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const BANNED = /[\u2013\u2014\u00b7\u2022\u2026\u2192]/;
const VARIANTS = ['list', 'strip', 'chips'];
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  expect(regionRules(root)).toEqual([]);
  return root;
};
const ROWS = TRIP_FIXTURES.upcoming.days;
const LIVE = TRIP_FIXTURES.live.days;
const jumpsOf = (root) => all(root, '[data-day-jump]');
const mapDaysOf = (root) => all(root, '[data-map-day]');

describe.each(VARIANTS)('dayIndexHtml, variant %s', (variant) => {
  it('is one element, the dayindex region, marked with its variant', () => {
    const root = tree(dayIndexHtml(ROWS, { variant }));
    const top = root.children.filter(isElement);
    expect(top).toHaveLength(1);
    expect(attr(top[0], 'data-region')).toBe('dayindex');
    expect(classesOf(top[0])).toEqual(expect.arrayContaining(['tv-days', `tv-days--${variant}`]));
    expect(attr(top[0], 'aria-label')).toBe('Days');
  });
  it('emits one data-day-jump per day, a real button that carries the row index', () => {
    const jumps = jumpsOf(tree(dayIndexHtml(ROWS, { variant })));
    expect(jumps.map((el) => attr(el, 'data-day-jump'))).toEqual(ROWS.map((row) => String(row.index)));
    for (const el of jumps) {
      expect(el.tag).toBe('button');
      expect(attr(el, 'type')).toBe('button');
      expect(attr(el, 'data-focus-key')).toBe(`day-${attr(el, 'data-day-jump')}`);
    }
  });
  it('emits no data-map-day unless it is asked for', () => {
    expect(mapDaysOf(tree(dayIndexHtml(ROWS, { variant })))).toHaveLength(0);
    expect(mapDaysOf(tree(dayIndexHtml(ROWS, { variant, mapDays: false })))).toHaveLength(0);
  });
  it('where asked, emits data-map-day with the day number for every day, as buttons', () => {
    const root = tree(dayIndexHtml(ROWS, { variant, mapDays: true }));
    const days = mapDaysOf(root).filter((el) => attr(el, 'data-map-day') !== '0');
    expect(days.map((el) => attr(el, 'data-map-day'))).toEqual(ROWS.map((row) => String(row.dayNumber)));
    for (const el of mapDaysOf(root)) {
      expect(el.tag).toBe('button');
      expect(attr(el, 'data-map-day')).toMatch(/^\d+$/);
    }
    expect(jumpsOf(root)).toHaveLength(ROWS.length);
  });
  it('keys every child of the region, so a patch keeps the rows it can', () => {
    const [region] = tree(dayIndexHtml(ROWS, { variant, mapDays: true })).children.filter(isElement);
    const keys = region.children.filter(isElement).map((child) => attr(child, 'data-key'));
    expect(keys.every((key) => typeof key === 'string' && key !== '')).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((key) => key.startsWith('day-'))).toEqual(ROWS.map((row) => `day-${row.index}`));
  });
  it('gives every control its own focus key', () => {
    const keys = all(tree(dayIndexHtml(ROWS, { variant, mapDays: true })), 'button').map((el) => attr(el, 'data-focus-key'));
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('sets the day colour as a token on each day, never as a colour value', () => {
    const root = tree(dayIndexHtml(ROWS, { variant }));
    const styled = all(root, '[style]').filter((el) => /--day-color/.test(attr(el, 'style')));
    expect(styled.map((el) => attr(el, 'style'))).toEqual(ROWS.map((row) => `--day-color:var(--day-${row.colorIndex})`));
  });
  it('marks today', () => {
    const root = tree(dayIndexHtml(LIVE, { variant }));
    const today = LIVE.find((row) => row.isToday);
    const current = all(root, '[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(attr(current[0], 'data-day-jump')).toBe(String(today.index));
    expect(all(tree(dayIndexHtml(ROWS, { variant })), '[aria-current]')).toHaveLength(0);
  });
  it('returns nothing for no days', () => {
    expect(dayIndexHtml([], { variant })).toBe('');
    expect(dayIndexHtml(null, { variant })).toBe('');
    expect(dayIndexHtml(undefined, { variant })).toBe('');
  });
  it('can be drawn without the region attribute', () => {
    expect(all(tree(dayIndexHtml(ROWS, { variant, region: false })), '[data-region]')).toHaveLength(0);
  });
  it('escapes hostile text, and prints no banned glyph', () => {
    const hostile = [{ ...ROWS[0], title: HOSTILE, dateText: HOSTILE, weather: { range: HOSTILE, condition: HOSTILE }, thumb: { src: 'javascript:alert(1)', alt: HOSTILE } }];
    const root = tree(dayIndexHtml(hostile, { variant, mapDays: true }));
    expect(all(root, 'img')).toHaveLength(0);
    for (const model of Object.values(TRIP_FIXTURES)) expect(dayIndexHtml(model.days, { variant, mapDays: true })).not.toMatch(BANNED);
  });
  it('does not change the rows it is given', () => {
    const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    expect(() => dayIndexHtml(freeze(structuredClone(ROWS)), { variant, mapDays: true })).not.toThrow();
  });
});

describe('dayIndexHtml: what each variant shows', () => {
  it('falls back to the list for a variant it does not know', () => {
    expect(dayIndexHtml(ROWS, { variant: 'grid' })).toBe(dayIndexHtml(ROWS, { variant: 'list' }));
    expect(dayIndexHtml(ROWS)).toBe(dayIndexHtml(ROWS, { variant: 'list' }));
    expect(dayIndexHtml(ROWS, {})).toBe(dayIndexHtml(ROWS, { variant: 'list' }));
  });
  it('list: an ordered list, each row one button with number, title, date, stops, typical weather and cost', () => {
    const root = tree(dayIndexHtml(ROWS, { variant: 'list' }));
    expect(root.children.filter(isElement)[0].tag).toBe('ol');
    const rows = jumpsOf(root);
    for (const [i, el] of rows.entries()) {
      const row = ROWS[i];
      expect(el.parent.tag).toBe('li');
      expect(textOf(all(el, '.tv-day-num')[0])).toBe(`Day ${row.dayNumber}`);
      expect(textOf(all(el, '.tv-day-title')[0])).toBe(row.title);
      expect(textOf(all(el, '.tv-day-date')[0])).toBe(row.dateText);
      expect(textOf(all(el, '.tv-day-stops')[0])).toBe(`${row.stops} stops`);
      expect(textOf(all(el, '.tv-day-cost')[0])).toBe(`about ${row.cost.home.text}`);
      if (row.weather) expect(textOf(all(el, '.tv-day-weather')[0])).toContain(`${row.weather.range} typical`);
      else expect(all(el, '.tv-day-weather')).toHaveLength(0);
    }
  });
  it('list: a thumbnail per row when the days have photos, and none at all when venue photos are off', () => {
    const withPhotos = tree(dayIndexHtml(ROWS, { variant: 'list' }));
    expect(all(withPhotos, '.ui-thumb')).toHaveLength(ROWS.length);
    expect(all(withPhotos, 'img.ui-frame-img').map((img) => attr(img, 'src'))).toEqual(ROWS.map((row) => row.thumb.src));
    for (const img of all(withPhotos, 'img')) expect(attr(img, 'referrerpolicy')).toBe('no-referrer');
    const off = tree(dayIndexHtml(TRIP_FIXTURES.photosOff.days, { variant: 'list' }));
    expect(all(off, '.ui-thumb')).toHaveLength(0);
    expect(all(off, 'img')).toHaveLength(0);
    expect(all(tree(dayIndexHtml(ROWS, { variant: 'list', thumbs: false })), '.ui-thumb')).toHaveLength(0);
  });
  it('list: with map days, the same button also names its day for the map', () => {
    for (const el of jumpsOf(tree(dayIndexHtml(ROWS, { variant: 'list', mapDays: true })))) {
      expect(attr(el, 'data-map-day')).toBe(String(Number(attr(el, 'data-day-jump')) + 1));
    }
  });
  it('strip: sideways cells that keep their scroll position through a patch', () => {
    const root = tree(dayIndexHtml(ROWS, { variant: 'strip' }));
    const [strip] = root.children.filter(isElement);
    expect(strip.tag).toBe('ol');
    expect(attr(strip, 'data-keep-scroll')).toBe('dayindex');
    for (const [i, el] of jumpsOf(root).entries()) {
      expect(textOf(el)).toContain(ROWS[i].title);
      expect(textOf(el)).toContain(ROWS[i].dateText);
      expect(textOf(el)).toContain(`${ROWS[i].stops} stops`);
    }
  });
  it('strip: with map days, a cell has one control that shows the day on the map and one that opens it', () => {
    const root = tree(dayIndexHtml(ROWS, { variant: 'strip', mapDays: true }));
    const cells = all(root, 'li');
    expect(cells).toHaveLength(ROWS.length);
    for (const [i, cell] of cells.entries()) {
      const [pick] = all(cell, '[data-map-day]');
      const [open] = all(cell, '[data-day-jump]');
      expect(pick).not.toBe(open);
      expect(attr(pick, 'aria-pressed')).toBe('false');
      expect(attr(pick, 'data-day-jump')).toBe(null);
      expect(textOf(pick)).toContain(ROWS[i].title);
      expect(textOf(pick)).toContain('Show on map');
      expect(textOf(open)).toBe(`Open day ${ROWS[i].dayNumber}`);
      expect(attr(open, 'data-map-day')).toBe(null);
    }
  });
  it('chips: a labelled group of numbered buttons, each naming its day', () => {
    const root = tree(dayIndexHtml(ROWS, { variant: 'chips' }));
    const [group] = root.children.filter(isElement);
    expect(attr(group, 'role')).toBe('group');
    const chips = jumpsOf(root);
    expect(chips.map((el) => textOf(el))).toEqual(ROWS.map((row) => String(row.dayNumber)));
    expect(chips.map((el) => attr(el, 'aria-label'))).toEqual(ROWS.map((row) => `Day ${row.dayNumber}, ${row.title}`));
    expect(all(root, '[data-map-day="0"]')).toHaveLength(0);
  });
  it('chips: with map days, an All chip leads and starts pressed', () => {
    const root = tree(dayIndexHtml(ROWS, { variant: 'chips', mapDays: true }));
    const [group] = root.children.filter(isElement);
    const first = group.children.filter(isElement)[0];
    expect(attr(first, 'data-map-day')).toBe('0');
    expect(attr(first, 'data-day-jump')).toBe(null);
    expect(attr(first, 'aria-pressed')).toBe('true');
    expect(textOf(first)).toBe('All');
    for (const chip of jumpsOf(root)) {
      expect(attr(chip, 'aria-pressed')).toBe('false');
      expect(attr(chip, 'data-map-day')).toBe(String(Number(attr(chip, 'data-day-jump')) + 1));
    }
  });
  it('takes another label for the list', () => {
    expect(attr(tree(dayIndexHtml(ROWS, { variant: 'chips', mapDays: true, label: 'Show on the map' })).children.filter(isElement)[0], 'aria-label')).toBe('Show on the map');
  });
  it('a day without a date, weather, cost or stops shows what it has', () => {
    const bare = [{ ...ROWS[0], date: '', dateText: '', weather: null, cost: { ...ROWS[0].cost, local: null, home: null, homeFirst: false }, stops: 0, thumb: null, photos: [] }];
    for (const variant of ['list', 'strip']) {
      const root = tree(dayIndexHtml(bare, { variant }));
      expect(all(root, '.tv-day-date')).toHaveLength(0);
      expect(all(root, '.tv-day-weather')).toHaveLength(0);
      expect(all(root, '.tv-day-cost')).toHaveLength(0);
      expect(textOf(all(root, '.tv-day-stops')[0])).toBe('No stops yet');
      expect(textOf(root)).toContain(ROWS[0].title);
    }
  });
});

// Every label weatherLabel() can return, made by the function itself, so no invented wording is pinned here.
const STORED = ['sunny', 'clear', 'partly cloudy', 'partly sunny', 'cloudy', 'overcast', 'rainy', 'rain', 'showers', 'stormy', 'thunderstorm', 'snowy', 'snow', 'foggy', 'fog', 'windy'];
const LABELS = [...new Set(STORED.map((condition) => weatherLabel(condition)))];

describe('conditionPhrase (ruling R30)', () => {
  it('spells out the two short labels, which are for chips and table cells only', () => {
    expect(weatherLabel('partly cloudy')).toBe('Pt. Cloudy');
    expect(weatherLabel('partly sunny')).toBe('Pt. Sunny');
    expect(conditionPhrase(weatherLabel('partly cloudy'))).toBe('partly cloudy');
    expect(conditionPhrase(weatherLabel('partly sunny'))).toBe('partly sunny');
    expect(conditionPhrase('Pt. Cloudy')).toBe('partly cloudy');
    expect(conditionPhrase('Pt. Sunny')).toBe('partly sunny');
  });
  it('puts every other label in lower case', () => {
    expect(conditionPhrase(weatherLabel('sunny'))).toBe('sunny');
    expect(conditionPhrase(weatherLabel('clear'))).toBe('clear');
    expect(conditionPhrase(weatherLabel('rainy'))).toBe('rain');
    expect(conditionPhrase(weatherLabel('thunderstorm'))).toBe('storm');
    expect(conditionPhrase('Overcast')).toBe('overcast');
  });
  it('gives a phrase with no capital, no full stop and no short form for every label there is', () => {
    expect(LABELS.length).toBeGreaterThanOrEqual(12);
    expect(LABELS.every(Boolean)).toBe(true);
    for (const label of LABELS) {
      const phrase = conditionPhrase(label);
      expect(phrase, label).toMatch(/^[a-z]+( [a-z]+)*$/);
      expect(phrase, label).not.toMatch(/\bpt\b/);
    }
  });
  it('reads a stored condition that was never made a label the same way', () => {
    expect(conditionPhrase('Partly Cloudy')).toBe('partly cloudy');
    expect(conditionPhrase('  Pt.  Cloudy ')).toBe('partly cloudy');
    expect(conditionPhrase('pt cloudy')).toBe('partly cloudy');
  });
  it('gives nothing for an empty or missing label', () => {
    expect(conditionPhrase('')).toBe('');
    expect(conditionPhrase('   ')).toBe('');
    expect(conditionPhrase(null)).toBe('');
    expect(conditionPhrase(undefined)).toBe('');
    expect(conditionPhrase(7)).toBe('');
    expect(conditionPhrase({})).toBe('');
  });
});

describe('typicalText and stopsText', () => {
  it('always says the weather is typical', () => {
    expect(typicalText({ range: '10 to 23°C', condition: weatherLabel('clear') })).toBe('10 to 23°C typical, clear');
    expect(typicalText({ range: '10 to 23°C', condition: '' })).toBe('10 to 23°C typical');
    expect(typicalText({ range: '', condition: weatherLabel('sunny') })).toBe('Typically sunny');
    expect(typicalText({ range: '', condition: '' })).toBe('');
    expect(typicalText(null)).toBe('');
    expect(typicalText(undefined)).toBe('');
  });
  it('spells the condition out inside the sentence (ruling R30)', () => {
    expect(typicalText({ range: '5 to 14°C', condition: weatherLabel('partly cloudy') })).toBe('5 to 14°C typical, partly cloudy');
    expect(typicalText({ range: '5 to 14°C', condition: weatherLabel('partly sunny') })).toBe('5 to 14°C typical, partly sunny');
    expect(typicalText({ range: '', condition: weatherLabel('partly cloudy') })).toBe('Typically partly cloudy');
    for (const label of LABELS) {
      expect(typicalText({ range: '5 to 14°C', condition: label })).toBe(`5 to 14°C typical, ${conditionPhrase(label)}`);
      expect(typicalText({ range: '5 to 14°C', condition: label })).not.toMatch(/[Pp]t\./);
    }
  });
  it('draws the spelled-out condition in every variant that shows the weather', () => {
    const rows = [{ ...ROWS[0], weather: { range: '5 to 14°C', condition: weatherLabel('partly cloudy') } }];
    for (const variant of ['list', 'strip']) {
      const root = tree(dayIndexHtml(rows, { variant }));
      expect(textOf(all(root, '.tv-day-weather')[0])).toBe('5 to 14°C typical, partly cloudy');
    }
  });
  it('counts stops in words a person would say', () => {
    expect(stopsText(5)).toBe('5 stops');
    expect(stopsText(1)).toBe('1 stop');
    expect(stopsText(0)).toBe('No stops yet');
    expect(stopsText(undefined)).toBe('No stops yet');
  });
});

describe('dayIndexHtml: basis (whose money a day cost is)', () => {
  it('prints nothing more by default', () => {
    for (const variant of VARIANTS) expect(dayIndexHtml(ROWS, { variant })).not.toContain('tv-day-basis');
    expect(dayIndexHtml(ROWS, { basis: 'yes' })).toBe(dayIndexHtml(ROWS));
  });

  it('adds "per person" inside every day cost of a list and a strip when asked', () => {
    for (const variant of ['list', 'strip']) {
      const root = tree(dayIndexHtml(ROWS, { variant, basis: true }));
      const costs = all(root, '.tv-day-cost');
      expect(costs.length).toBeGreaterThan(0);
      for (const cost of costs) {
        expect(textOf(all(cost, '.tv-day-basis')[0])).toBe('per person');
        expect(textOf(cost)).toMatch(/\S per person$/);
      }
    }
    expect(dayIndexHtml(ROWS, { variant: 'chips', basis: true })).toBe(dayIndexHtml(ROWS, { variant: 'chips' }));
  });
});
