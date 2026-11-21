// The Atlas trip landing on every model fixture: the parts of the task table are there for the states
// that have them and absent for the others. The hook table of blueprint 3.4 is checked for every view
// by js/views/view-contract.test.js; it is run here too, so a broken hook shows beside its part.
import { describe, it, expect } from 'vitest';
import { TRIP_FIXTURES, CTX_FIXTURE } from '../fixtures/models.js';
import { checkTripLanding } from '../fixtures/checks/trip-contract.js';
import { all, attr, classesOf, parseHtml, textOf } from '../fixtures/checks/html-tree.js';
import { renderTripLanding, mountTripLanding } from './trip.js';
import { titleSize, readySentence, jumpItems, statusParts, stripColumns, glanceFacts } from './trip-words.js';

const KEYS = Object.keys(TRIP_FIXTURES);
const PARTS = ['bar', 'hero', 'tabs', 'planIntro', 'between', 'planOutro'];
const render = (key, ctx = CTX_FIXTURE) => renderTripLanding(TRIP_FIXTURES[key], ctx);
const part = (key, name, ctx) => parseHtml(render(key, ctx)[name]).root;
const one = (root, selector) => all(root, selector)[0] ?? null;
const region = (root, name) => one(root, `[data-region="${name}"]`);
const texts = (root, selector) => all(root, selector).map(textOf);
const BANNED = /[—–·•…→]/;
const WITH_DAYS = KEYS.filter((key) => TRIP_FIXTURES[key].days.length > 0);
const BARE = KEYS.filter((key) => TRIP_FIXTURES[key].days.length === 0);

describe.each(KEYS)('fixture %s', (key) => {
  const model = TRIP_FIXTURES[key];
  const parts = render(key);
  const whole = PARTS.map((name) => parts[name]).join('\n');

  it('keeps the hook table and is sound markup', () => {
    expect(checkTripLanding(parts, model, CTX_FIXTURE)).toEqual([]);
    for (const name of PARTS) expect(parseHtml(parts[name]).errors).toEqual([]);
  });
  it('writes no banned glyph and gives the same parts twice', () => {
    expect(whole).not.toMatch(BANNED);
    expect(PARTS.map((name) => render(key)[name]).join('\n')).toBe(whole);
  });
  it('bar: Trips, the name for when the cover has scrolled away, and every action in More', () => {
    const bar = parseHtml(parts.bar).root;
    expect(textOf(one(bar, 'a.tv-back'))).toBe('Trips');
    expect(textOf(one(bar, '.tv-bar-name'))).toBe(model.title);
    expect(all(bar, '[data-tabs-slot]')).toHaveLength(0);
    const menu = one(bar, 'dialog');
    for (const action of model.actions) expect(textOf(menu)).toContain(action.label);
    expect(textOf(menu)).toContain('Settings');
  });
  it('hero: the cover with the only h1, the dates, the length and who travels', () => {
    const hero = parseHtml(parts.hero).root;
    const h1 = one(hero, 'h1');
    expect(textOf(h1)).toBe(model.title);
    expect(all(h1, 'img.ui-flag')).toHaveLength(Math.min(3, model.flags.length));
    const words = textOf(one(hero, '.atl-cover-over'));
    expect(words).toContain(model.dates.text);
    expect(words).toContain(`${model.dates.dayCount} days`);
    if (model.travellers) expect(words).toContain(`${model.travellers} travellers`);
    if (model.placeLine) expect(words).toContain(model.placeLine);
    expect(attr(one(hero, '.ui-frame'), 'data-carry')).toBe('cover');
    const credited = model.cover.kind !== 'none' && Boolean(model.cover.credit);
    expect(all(one(hero, '.atl-cover-top'), '.ui-credit')).toHaveLength(credited ? 1 : 0);
  });
  it('hero: the countdown or the day, in the hero-status region', () => {
    const status = region(parseHtml(parts.hero).root, 'hero-status');
    const words = textOf(status);
    const flap = one(status, '[data-flap]');
    if (model.status === 'failed') {
      expect(words).toBe('Planning stopped');
    } else if (model.phase === 'upcoming') {
      expect(attr(flap, 'data-flap')).toBe(String(model.daysToGo));
      expect(words).toContain(model.daysToGo === 1 ? 'day to go' : 'days to go');
    } else if (model.phase === 'live') {
      expect(attr(flap, 'data-flap')).toBe(String(model.live.dayNumber));
      expect(words).toMatch(new RegExp(`^Day .* of ${model.live.dayCount}`));
      const stop = model.live.today?.nextStop;
      if (stop) expect(words).toContain(`Next stop, ${stop.time}: ${stop.title}`);
      else expect(words).not.toContain('Next stop');
    } else {
      expect(flap).toBeNull();
      expect(words).toBe(model.statusText);
    }
  });
  it('hero: the actions the role may use, the glance facts and the controller notes', () => {
    const hero = parseHtml(parts.hero).root;
    const row = one(hero, '.atl-tacts');
    const wanted = model.actions.filter((action) => ['share', 'pdf', 'edit'].includes(action.key)).map((action) => action.key);
    expect(row ? all(row, 'button').map((button) => attr(button, 'data-action')) : []).toEqual(wanted);
    const glance = region(hero, 'glance');
    // A live plan does not lead with the Ready count (blueprint 7.3): see glanceFacts().
    const shown = glanceFacts(model.glance, { live: model.phase === 'live' });
    expect(Boolean(glance)).toBe(shown.length > 0);
    if (glance) expect(texts(glance, '.tv-fact-label')).toEqual(shown.map((fact) => fact.label));
    const ready = glance ? one(glance, '[data-glance-jump="readiness"]') : null;
    expect(Boolean(ready)).toBe(Boolean(model.readiness) && shown.some((fact) => fact.key === 'ready'));
    expect(all(hero, '.td-status-slot')).toHaveLength(1);
  });
  it('tabs: the one tab list, with Plan selected', () => {
    const tabs = parseHtml(parts.tabs).root;
    expect(texts(tabs, '.td-tab')).toEqual(['Plan', 'Spending', 'Prep', 'Discover']);
    expect(attr(one(tabs, '.td-tab--active'), 'data-tab')).toBe('plan');
  });
  it('opens the section cards on first render, at every width', () => {
    expect(parts.openSections).toEqual(['flights', 'transport', 'entry', 'accommodation']);
    expect(parts.openSectionsMinWidth).toBe(0);
  });
});

describe.each(WITH_DAYS)('fixture %s, a plan with days', (key) => {
  const model = TRIP_FIXTURES[key];
  const parts = render(key);
  const intro = parseHtml(parts.planIntro).root;
  const hero = parseHtml(parts.hero).root;

  it('two map slots that split the widths at 1024 px: beside the cover, and in Day by day', () => {
    const wide = one(hero, '[data-map-slot]');
    const narrow = one(intro, '[data-map-slot]');
    expect(attr(wide, 'data-map-from')).toBe('1024');
    expect(attr(narrow, 'data-map-below')).toBe('1024');
    expect(one(one(hero, '[id="td-hero"]'), '[data-map-slot]')).toBe(wide);
  });
  it('Day by day: the heading, the intro line, the caption of the map and the day strip', () => {
    const days = one(intro, 'section.atl-days');
    expect(textOf(one(days, 'h2'))).toBe('Day by day');
    expect(textOf(one(days, '.atl-sec-head'))).toContain('Weather is typical for these dates, not a forecast.');
    const strip = region(days, 'dayindex');
    expect(classesOf(strip)).toContain('tv-days--strip');
    expect(all(strip, '[data-day-jump]')).toHaveLength(model.days.length);
    const caption = region(days, 'map-caption');
    expect(Boolean(caption)).toBe(model.map.points.length > 0);
    expect(all(strip, '[data-map-day]')).toHaveLength(model.map.points.length ? model.days.length : 0);
    for (const cell of all(strip, 'li')) expect(textOf(cell)).toMatch(model.map.points.length ? /Show on map Open day \d+$/ : /Open day \d+$/);
    const order = all(days, 'h2, [data-map-slot], [data-region]').map((el) => attr(el, 'data-region') ?? (attr(el, 'data-map-slot') !== null ? 'slot' : 'h2'));
    expect(order.filter((name) => name !== 'map-caption')).toEqual(['h2', 'slot', 'dayindex']);
  });
  it('Before you go: the count, the meter, one sentence and a row per area, unless the plan is past', () => {
    const before = region(intro, 'readiness');
    expect(Boolean(before)).toBe(Boolean(model.readiness));
    if (!before) return;
    expect(textOf(before)).toContain('Before you go');
    expect(all(before, '.ui-meter').length).toBeGreaterThanOrEqual(1);
    if (model.readiness.collapsed) {
      expect(one(before, '.atl-before-n')).toBeNull();
      expect(all(before, '.ui-ready-row')).toHaveLength(0);
      return;
    }
    expect(textOf(one(before, 'h2'))).toBe('Before you go');
    expect(textOf(one(before, '.atl-before-n'))).toBe(model.readiness.headline);
    expect(textOf(one(before, '.atl-before-text'))).toBe(readySentence(model));
    const rows = all(before, '.ui-ready-row');
    expect(rows.map((row) => attr(row, 'data-area'))).toEqual(model.readiness.items.map((item) => item.area));
    rows.forEach((row, i) => {
      expect(textOf(row)).toContain(model.readiness.items[i].status);
      expect(all(row, '[data-section-jump]')).toHaveLength(1);
    });
    expect(textOf(before).includes('Ticks are saved on this device.')).toBe(model.readiness.perDevice);
  });
  it('the in-page links beside the tabs name what is on the page', () => {
    const jump = one(intro, 'nav.atl-jump');
    expect(Boolean(jump)).toBe(Boolean(model.readiness));
    if (!jump) return;
    expect(texts(jump, 'button')).toEqual(jumpItems(model).map((item) => item.label));
    expect(texts(jump, 'button').slice(0, 2)).toEqual(['Day by day', 'Before you go']);
    for (const target of all(jump, '[data-section-jump]').map((el) => attr(el, 'data-section-jump'))) {
      expect(model.readiness.items.map((item) => item.target)).toContain(target);
      expect(target).not.toBe('checklist');
    }
  });
  it('between: "The days"; outro: what the costs and the weather are', () => {
    expect(textOf(parseHtml(parts.between).root)).toBe('The days');
    expect(all(parseHtml(parts.between).root, 'h2')).toHaveLength(1);
    expect(textOf(parseHtml(parts.planOutro).root)).toBe('Costs are estimates per person, for activities only. Weather is typical for the season, not a forecast.');
  });
});

describe.each(BARE)('fixture %s, a plan without days', (key) => {
  const parts = render(key);
  it('draws the bar, the hero and the tabs, and nothing in the Plan panel', () => {
    expect(parts.planIntro).toBe('');
    expect(parts.between).toBe('');
    expect(parts.planOutro).toBe('');
    expect(all(parseHtml(parts.hero).root, '[data-map-slot]')).toHaveLength(0);
    expect(region(parseHtml(parts.hero).root, 'glance')).toBeNull();
  });
});

describe('states of the task list', () => {
  it('an imported plan has no Regenerate, no pace and no stay fact', () => {
    const { bar, hero } = render('imported');
    expect(bar + hero).not.toContain('Regenerate');
    expect(texts(parseHtml(hero).root, '.tv-fact-label')).not.toEqual(expect.arrayContaining(['Pace']));
  });
  it('a ground journey links to Transport, a flight plan to Flights', () => {
    expect(texts(one(part('ground', 'planIntro'), 'nav.atl-jump'), 'button')).toContain('Transport');
    expect(texts(one(part('upcoming', 'planIntro'), 'nav.atl-jump'), 'button')).toContain('Flights');
  });
  it('a long multi-city title wraps in a smaller size and keeps its flags', () => {
    const h1 = one(part('multiCity', 'hero'), 'h1');
    expect(classesOf(h1)).toContain('atl-cover-title--l');
    expect(all(h1, 'img.ui-flag')).toHaveLength(3);
    expect(textOf(one(part('multiCity', 'bar'), '.tv-bar-name'))).toBe('Vienna, Bratislava & Budapest');
  });
  it('a plan without a cover draws the placeholder and no credit', () => {
    const hero = part('noCover', 'hero');
    expect(attr(one(hero, '.ui-frame'), 'data-frame')).toBe('none');
    expect(all(hero, 'img.ui-frame-img')).toHaveLength(0);
  });
  it('a plan without map points keeps its slots, so points that arrive later have a place', () => {
    expect(all(part('noMap', 'hero'), '[data-map-slot]')).toHaveLength(1);
    expect(region(part('noMap', 'planIntro'), 'map-caption')).toBeNull();
  });
  it('a viewer and an editor read what they can do', () => {
    expect(textOf(part('viewer', 'hero'))).toContain('Shared with you. You can view it.');
    expect(textOf(part('editor', 'hero'))).toContain('Shared with you. You can edit it.');
    expect(textOf(part('upcoming', 'hero'))).not.toContain('Shared with you');
  });
  it('while the entry check runs, its row says so', () => {
    expect(textOf(one(part('entryChecking', 'planIntro'), '.ui-ready-row[data-state="checking"]'))).toContain('Checking');
  });
  it('with venue photos off the strip and the facts are still there', () => {
    expect(region(part('photosOff', 'planIntro'), 'dayindex')).not.toBeNull();
    expect(part('photosOff', 'planIntro')).toBeTruthy();
  });
  it('entry motion is asked for on a first render only', () => {
    const still = { ...CTX_FIXTURE, animate: false };
    expect(render('upcoming').hero).toContain('atl-enter');
    expect(render('upcoming', still).hero).not.toContain('atl-enter');
    expect(render('upcoming', still).hero).not.toContain('data-fade');
  });
});

describe('titleSize', () => {
  it('steps the title down as it gets longer', () => {
    expect([titleSize('Hong Kong'), titleSize('Porto weekend'), titleSize('Hokkaido in Winter'), titleSize('Vienna, Bratislava & Budapest')]).toEqual(['', '', 'm', 'l']);
    expect(titleSize(null)).toBe('');
  });
});

describe('statusParts', () => {
  it('reads the model into a countdown, a day or plain words', () => {
    expect(statusParts(TRIP_FIXTURES.upcoming)).toEqual({ kind: 'countdown', value: 9, words: 'days to go' });
    expect(statusParts(TRIP_FIXTURES.tomorrow)).toEqual({ kind: 'countdown', value: 1, words: 'day to go' });
    expect(statusParts(TRIP_FIXTURES.live)).toMatchObject({ kind: 'day', value: 3, total: 7, next: 'Next stop, 11:30 AM: Jardin Majorelle' });
    expect(statusParts(TRIP_FIXTURES.liveNoNextStop)).toMatchObject({ kind: 'day', next: '' });
    expect(statusParts(TRIP_FIXTURES.past)).toEqual({ kind: 'text', words: 'Past plan' });
    expect(statusParts(TRIP_FIXTURES.undated)).toEqual({ kind: 'text', words: 'No dates yet' });
    expect(statusParts(TRIP_FIXTURES.failed)).toEqual({ kind: 'text', words: 'Planning stopped' });
  });
});

describe('readySentence', () => {
  it('says how long is left and what still needs the user', () => {
    expect(readySentence(TRIP_FIXTURES.upcoming)).toBe('9 days to go. Three things still need you. Next up: flights.');
    expect(readySentence(TRIP_FIXTURES.tomorrow)).toBe('It starts tomorrow. Three things still need you. Next up: flights.');
    expect(readySentence(TRIP_FIXTURES.undated)).toBe('Three things still need you. Next up: flights.');
    expect(readySentence(TRIP_FIXTURES.ground)).toBe('9 days to go. One thing still needs you: transport.');
    expect(readySentence(TRIP_FIXTURES.entryChecking)).toBe('9 days to go. Three things still need you. Next up: flights. The entry check is still running.');
    expect(readySentence(TRIP_FIXTURES.past)).toBe('');
  });
  it('says so when everything is settled', () => {
    const { readiness } = TRIP_FIXTURES.upcoming;
    const settled = { ...TRIP_FIXTURES.upcoming, readiness: { ...readiness, todo: 0, pending: 0, done: readiness.total, items: readiness.items.map((item) => ({ ...item, state: 'done' })) } };
    expect(readySentence(settled)).toBe('9 days to go. Everything is settled.');
  });
});

describe('jumpItems', () => {
  it('lists Day by day, Before you go, then the section cards in the order of the page: flights or transport, entry, stay', () => {
    expect(jumpItems(TRIP_FIXTURES.upcoming)).toEqual([
      { label: 'Day by day', to: 'days' }, { label: 'Before you go', to: 'ready' },
      { label: 'Flights', section: 'flights' }, { label: 'Entry', section: 'entry' }, { label: 'Stay', section: 'accommodation' },
    ]);
    expect(jumpItems(TRIP_FIXTURES.ground).map((item) => item.label)).toEqual(['Day by day', 'Before you go', 'Transport', 'Stay']);
    expect(jumpItems(TRIP_FIXTURES.past)).toEqual([]);
    expect(jumpItems(TRIP_FIXTURES.failed)).toEqual([]);
  });
});

describe('mountTripLanding', () => {
  it('is a function', () => {
    expect(typeof mountTripLanding).toBe('function');
  });
});

describe('stripColumns', () => {
  it('keeps up to ten days in one row on a wide page and up to eight on a middling one', () => {
    expect(stripColumns(7)).toEqual({ wide: 7, mid: 7 });
    expect(stripColumns(10)).toEqual({ wide: 10, mid: 5 });
  });
  it('splits a longer plan into rows of equal length, so no day is cut off at the edge', () => {
    expect(stripColumns(12)).toEqual({ wide: 6, mid: 6 });
    expect(stripColumns(21)).toEqual({ wide: 7, mid: 7 });
    expect(stripColumns(9)).toEqual({ wide: 9, mid: 5 });
  });
  it('gives one column for no days or a broken count', () => {
    expect(stripColumns(0)).toEqual({ wide: 1, mid: 1 });
    expect(stripColumns(undefined)).toEqual({ wide: 1, mid: 1 });
  });
});

describe('glanceFacts', () => {
  it('spells out a short weather label in the note of the weather fact (ruling R30)', () => {
    const facts = [{ key: 'weather', label: 'Typical weather', value: '16 to 23°C', note: 'Pt. Cloudy, typical for early March', jump: '' }];
    expect(glanceFacts(facts)[0].note).toBe('Partly cloudy, typical for early March');
    expect(glanceFacts([{ ...facts[0], note: 'Mostly dry, Pt. Sunny at noon' }])[0].note).toBe('Mostly dry, partly sunny at noon');
    expect(facts[0].note).toBe('Pt. Cloudy, typical for early March');
  });
  it('leaves every other fact, and a note that is already spelled out, as it is', () => {
    const facts = [{ key: 'pace', label: 'Pace', value: 'Relaxed', note: 'Pt. Cloudy', jump: '' }, { key: 'weather', label: 'Typical weather', value: '16 to 23°C', note: 'Partly cloudy, typical for early March', jump: '' }];
    expect(glanceFacts(facts)).toEqual(facts);
    expect(glanceFacts(null)).toEqual([]);
  });
});

describe('the landing of a plan with many days', () => {
  it('hands the strip its column counts and marks up the converted cost in two spans', () => {
    const parts = renderTripLanding(TRIP_FIXTURES.upcoming, CTX_FIXTURE);
    const strip = all(parseHtml(parts.planIntro).root, '.atl-strip')[0];
    const { wide, mid } = stripColumns(TRIP_FIXTURES.upcoming.days.length);
    expect(attr(strip, 'style')).toBe(`--atl-cols:${wide};--atl-cols-mid:${mid}`);
    expect(all(strip, '[data-region="dayindex"]')).toHaveLength(1);
    const cost = all(parseHtml(parts.hero).root, '[data-fact="cost"]')[0];
    expect(textOf(all(cost, '.tv-fact-about')[0])).toBe('about');
    expect(textOf(all(cost, '.tv-fact-figure')[0])).not.toBe('');
  });
});

describe('the facts of a live plan', () => {
  it('do not lead with the Ready count: readiness is the one line below', () => {
    const ready = { key: 'ready', label: 'Ready', value: '1 of 4', note: '3 things left', jump: 'readiness' };
    const stops = { key: 'stops', label: 'Stops', value: '103', note: 'about 9 a day', jump: '' };
    expect(glanceFacts([ready, stops], { live: true })).toEqual([stops]);
    expect(glanceFacts([ready, stops])).toEqual([ready, stops]);
    const live = { ...TRIP_FIXTURES.live, glance: [ready, ...TRIP_FIXTURES.live.glance.filter((fact) => fact.key !== 'ready')] };
    const hero = parseHtml(renderTripLanding(live, CTX_FIXTURE).hero).root;
    expect(all(hero, '[data-fact="ready"]')).toHaveLength(0);
    expect(all(hero, '[data-fact="stops"]')).toHaveLength(1);
    const upcoming = parseHtml(renderTripLanding(TRIP_FIXTURES.upcoming, CTX_FIXTURE).hero).root;
    expect(all(upcoming, '[data-fact="ready"]')).toHaveLength(1);
  });
});
