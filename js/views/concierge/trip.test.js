// The Concierge trip landing on every model fixture: each part of its task table is there for the
// states that have it and absent for the others. Written before the renderer.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TRIP_FIXTURES, CTX_FIXTURE } from '../fixtures/models.js';
import { checkTripLanding } from '../fixtures/checks/trip-contract.js';
import { parseCss, parseSelector } from '../fixtures/checks/css-spec.js';
import { all, attr, isInside, parseHtml, textOf } from '../fixtures/checks/html-tree.js';
import { costFigures } from '../../lib/money.js';
import { tripBrief } from './briefing.js';
import { daysHeading, titleStep } from './words.js';
import { renderTripLanding, mountTripLanding } from './trip.js';

const T = TRIP_FIXTURES;
const KEYS = Object.keys(T);
const QUIET = Object.freeze({ ...CTX_FIXTURE, animate: false });
const STILL = Object.freeze({ ...CTX_FIXTURE, reducedMotion: true });
const PARTS = ['bar', 'hero', 'tabs', 'planIntro', 'between', 'planOutro'];
const render = (key, ctx = CTX_FIXTURE) => renderTripLanding(T[key], ctx);
const trees = (key, ctx) => { const parts = render(key, ctx); return Object.fromEntries(PARTS.map((name) => [name, parseHtml(parts[name]).root])); };
const squeeze = (text) => text.replace(/\s+/g, '');
const one = (root, selector) => { const found = all(root, selector); expect(found, selector).toHaveLength(1); return found[0]; };
const hasPlan = (model) => model.days.length > 0;

describe.each(KEYS)('fixture %s', (key) => {
  const model = T[key];
  const parts = render(key);
  const { bar, hero, tabs, planIntro, between, planOutro } = trees(key);

  it('keeps the trip landing contract', () => {
    expect(checkTripLanding(parts, model, CTX_FIXTURE)).toEqual([]);
  });

  it('bar: Trips, the name, a tabs slot from 1024 px, the actions and More', () => {
    const header = one(bar, 'header.tv-bar');
    expect(attr(one(header, '[data-tabs-slot]'), 'data-slot-from')).toBe('1024');
    for (const action of model.actions.filter((a) => a.key !== 'read-view')) {
      expect(all(header, `[data-action="${action.key}"]`).length, action.key).toBeGreaterThan(0);
    }
    expect(all(header, '[data-menu-open]')).toHaveLength(1);
  });

  it('tabs: the one tab list, Plan first', () => {
    expect(all(tabs, '.td-tab').map((el) => attr(el, 'data-tab'))).toEqual(['plan', 'spending', 'prep', 'towns']);
  });

  it('hero: the title sized by its length, the dates, the length and who travels', () => {
    const root = one(hero, 'header.con-hero');
    expect(attr(root, 'id')).toBe('td-hero');
    expect(attr(root, 'data-title-step')).toBe(titleStep(model.title));
    expect(textOf(one(root, 'h1.con-hero-title'))).toBe(model.title);
    const frame = one(root, '[data-carry="cover"]');
    expect(attr(frame, 'data-frame')).toBe(model.cover.kind === 'none' ? 'none' : model.cover.kind);
    expect(all(frame, 'img[fetchpriority="high"]')).toHaveLength(model.cover.kind === 'none' ? 0 : 1);
    // A plan with no dates says so once, in the status: the dates line then holds the flags alone.
    expect(textOf(one(root, '.con-hero-dates'))).toBe(model.dates.start ? model.dates.text : '');
    expect(all(root, 'img.ui-flag')).toHaveLength(Math.min(3, model.flags.length));
    const meta = textOf(one(root, '.con-hero-meta'));
    expect(meta).toContain(model.dates.start ? `${model.dates.dayCount} days, ${model.dates.nights} nights.` : `${model.dates.dayCount} days.`);
    expect(meta).toContain('2 travellers.');
    if (model.placeLine) expect(meta).toContain(`${model.placeLine}.`);
    expect(all(root, '.ui-credit')).toHaveLength(model.cover.credit ? 1 : 0);
  });

  it('hero status: the countdown, the day of the plan, or the plain state', () => {
    const status = one(hero, '[data-region="hero-status"]');
    const text = squeeze(textOf(status));
    if (model.status === 'failed') return expect(textOf(status)).toBe('Planning stopped');
    if (model.phase === 'upcoming') return expect(text).toBe(`${model.daysToGo}${model.daysToGo === 1 ? 'daytogo' : 'daystogo'}`);
    if (model.phase === 'past') return expect(textOf(status)).toBe('Past plan');
    if (model.phase === 'undated') return expect(textOf(status)).toBe('No dates yet');
    expect(squeeze(textOf(one(status, '.con-live-day')))).toBe(`Day${model.live.dayNumber}of${model.live.dayCount}`);
    expect(all(status, '.ui-seg')).toHaveLength(model.live.dayCount);
    const rows = all(status, 'dt').map(textOf);
    expect(rows).toEqual(model.live.today.nextStop ? ['Today', 'Next stop'] : ['Today']);
    expect(attr(one(status, 'button[data-day-jump]'), 'data-day-jump')).toBe(String(model.days.findIndex((row) => row.isToday)));
    return undefined;
  });

  it('hero: an actions row with the first three actions on offer, then the notes', () => {
    const wanted = ['share', 'pdf', 'edit', 'read-view'].filter((k) => model.actions.some((action) => action.key === k)).slice(0, 3);
    const row = all(hero, '.con-toolrow');
    expect(row).toHaveLength(wanted.length ? 1 : 0);
    if (wanted.length) {
      const drawn = all(row[0], '.tv-action').map((el) => attr(el, 'data-action') ?? 'read-view');
      expect(drawn).toEqual(wanted);
    }
    expect(all(hero, '[data-fixture="notes"]')).toHaveLength(1);
  });

  it('plan intro: the brief with its sentence, facts and planned spend', () => {
    const brief = all(planIntro, 'section.con-brief-sec');
    expect(brief).toHaveLength(hasPlan(model) ? 1 : 0);
    if (!hasPlan(model)) return expect(parts.planIntro).toBe('');
    expect(textOf(one(brief[0], 'h2'))).toBe('The brief');
    expect(textOf(one(brief[0], 'p.con-lede'))).toBe(tripBrief(model));
    const facts = all(brief[0], '.tv-fact').map((el) => attr(el, 'data-fact'));
    expect(facts).toEqual(['stops', 'weather', 'pace', 'stay'].filter((k) => model.glance.some((fact) => fact.key === k)));
    const spend = all(brief[0], '.con-spend');
    expect(spend).toHaveLength(costFigures(model.cost).lead ? 1 : 0);
    expect(textOf(spend[0])).toContain('about €390 per person, activities only, of a budget of about €650 per person');
    expect(textOf(spend[0])).toContain('MAD 4,200 of MAD 7,000');
    expect(attr(one(spend[0], '.con-spend-bar'), 'aria-label')).toBe('60 percent of the budget is planned');
    return undefined;
  });

  it('plan intro: the days, with the map slot, the caption and the list', () => {
    const days = all(planIntro, 'section.con-days-sec');
    expect(days).toHaveLength(hasPlan(model) ? 1 : 0);
    if (!hasPlan(model)) return;
    expect(textOf(one(days[0], 'h2'))).toContain(daysHeading(model.days.length));
    expect(textOf(one(days[0], '.con-n'))).toBe(String(model.days.reduce((sum, row) => sum + row.stops, 0)));
    expect(all(days[0], '[data-map-slot]')).toHaveLength(1);
    expect(all(days[0], '[data-region="map-caption"]')).toHaveLength(model.map.points.length ? 1 : 0);
    const list = one(days[0], '.tv-days--list');
    expect(all(list, '[data-day-jump]')).toHaveLength(model.days.length);
    expect(all(list, '[data-map-day]')).toHaveLength(model.map.points.length ? model.days.length : 0);
    expect(all(list, '.ui-thumb')).toHaveLength(model.days.some((row) => row.thumb) ? model.days.length : 0);
  });

  it('plan intro: Before you go, in full or as one line while the plan runs', () => {
    const region = all(planIntro, '[data-region="readiness"]');
    expect(region).toHaveLength(model.readiness ? 1 : 0);
    const link = all(planIntro, 'button.con-brief-ready');
    expect(link).toHaveLength(model.readiness && !model.readiness.collapsed ? 1 : 0);
    if (!model.readiness) return;
    if (model.readiness.collapsed) {
      expect(all(region[0], '.is-collapsed')).toHaveLength(1);
      expect(all(region[0], 'h2')).toHaveLength(0);
      return;
    }
    expect(textOf(one(region[0], 'h2'))).toBe('Before you go');
    expect(textOf(one(region[0], '.con-byg-count'))).toBe(model.readiness.headline);
    expect(all(region[0], '.con-byg-say')).toHaveLength(1);
    expect(all(region[0], '.ui-ready-row')).toHaveLength(model.readiness.items.length);
    expect(textOf(link[0])).toContain(model.readiness.headline);
  });

  it('between: where you will be, ways to save and the Day by day heading', () => {
    if (!hasPlan(model)) return expect(parts.between).toBe('');
    const towns = all(between, 'section.con-towns-sec');
    expect(towns).toHaveLength(model.areas.length ? 1 : 0);
    if (towns.length) expect(all(towns[0], 'button.con-town')).toHaveLength(model.areas.length);
    const saves = all(between, 'section.con-saves-sec');
    expect(saves).toHaveLength(model.tips.shown.length ? 1 : 0);
    if (saves.length) {
      expect(all(saves[0], '.con-save')).toHaveLength(model.tips.shown.length);
      expect(textOf(one(saves[0], 'button[data-con-tab="spending"]'))).toBe(`See all ${model.tips.total} in Spending`);
    }
    expect(textOf(one(one(between, '.con-daybyday'), 'h2'))).toBe('Day by day');
    return undefined;
  });

  it('plan outro: the foot note, and no credits', () => {
    expect(all(planOutro, '.ui-credits')).toHaveLength(0);
    if (!hasPlan(model)) return expect(parts.planOutro).toBe('');
    expect(textOf(one(planOutro, 'p.con-foot-note'))).toContain('not a forecast');
    return undefined;
  });

  it('opens the section cards from 768 px, when the plan has them', () => {
    expect(parts.openSectionsMinWidth).toBe(768);
    if (!hasPlan(model)) return expect(parts.openSections).toEqual([]);
    const travel = model.route.kind === 'ground' ? 'transport' : 'flights';
    expect(parts.openSections).toEqual([travel, 'entry', 'accommodation']);
    return undefined;
  });

  it('has no entry motion when the context says so, and is the same twice', () => {
    for (const root of Object.values(trees(key, QUIET))) expect(all(root, '.con-enter')).toHaveLength(0);
    for (const root of Object.values(trees(key, STILL))) expect(all(root, '.con-enter')).toHaveLength(0);
    if (hasPlan(model)) expect(all(planIntro, '.con-enter').length).toBeGreaterThan(0);
    expect(JSON.stringify(render(key))).toBe(JSON.stringify(parts));
  });
});

describe('states', () => {
  it('upcoming: 9 days to go in numerals', () => {
    const status = one(trees('upcoming').hero, '[data-region="hero-status"]');
    expect(textOf(one(status, '.con-num'))).toBe('9');
  });

  it('live: today and the next stop from the model, and Open today', () => {
    const status = one(trees('live').hero, '[data-region="hero-status"]');
    const rows = all(status, 'dd').map(textOf);
    expect(rows[0]).toBe('Majorelle garden and Gueliz');
    expect(squeeze(rows[1])).toBe(squeeze('11:30 AM Jardin Majorelle'));
    expect(textOf(one(status, 'button[data-day-jump]'))).toBe('Open today');
  });

  it('past: the planned spend leads the brief and readiness is gone', () => {
    const html = render('past').planIntro;
    expect(html.indexOf('con-spend')).toBeGreaterThan(-1);
    expect(html.indexOf('con-spend')).toBeLessThan(html.indexOf('con-lede'));
    expect(render('upcoming').planIntro.indexOf('con-spend')).toBeGreaterThan(render('upcoming').planIntro.indexOf('con-lede'));
    expect(html).not.toContain('Before you go');
  });

  it('planned spend: no bar without a budget, a full bar and plain words above it, nothing without a cost', () => {
    const spendOf = (cost) => all(parseHtml(renderTripLanding({ ...T.upcoming, cost }, CTX_FIXTURE).planIntro).root, '.con-spend');
    const noBudget = spendOf({ ...T.upcoming.cost, budget: null, budgetHome: null });
    expect(all(noBudget[0], '.con-spend-bar')).toHaveLength(0);
    expect(textOf(noBudget[0])).toContain('about €390 per person, activities only');
    expect(textOf(noBudget[0])).not.toContain('budget');
    const over = spendOf({ ...T.upcoming.cost, budgetHome: { amount: 300, code: 'EUR', text: '€300' } });
    const bar = one(over[0], '.con-spend-bar');
    expect(attr(bar, 'aria-label')).toBe('The planned spend is above the budget');
    expect(attr(bar, 'data-over')).not.toBeNull();
    expect(attr(bar, 'style')).toBe('--con-pct:100%');
    expect(textOf(over[0])).toContain('activities only. Over the budget of about €300 per person');
    expect(textOf(one(over[0], '.con-spend-over'))).toBe('Over the budget');
    expect(all(spendOf(T.upcoming.cost)[0], '.con-spend-over')).toHaveLength(0);
    const local = spendOf({ ...T.upcoming.cost, home: null, homeFirst: false, budgetHome: null });
    expect(textOf(local[0])).toContain('MAD 4,200 per person, activities only, of a budget of MAD 7,000 per person');
    expect(textOf(local[0])).not.toContain('about');
    expect(spendOf({ ...T.upcoming.cost, local: null, home: null })).toHaveLength(0);
  });

  it('viewer and editor: the hero says what the user may do', () => {
    expect(textOf(one(trees('viewer').hero, '.con-hero-meta'))).toContain('Shared with you. You can view it.');
    expect(textOf(one(trees('editor').hero, '.con-hero-meta'))).toContain('Shared with you. You can edit it.');
    expect(textOf(one(trees('upcoming').hero, '.con-hero-meta'))).not.toContain('Shared with you');
  });

  it('the brief words its facts: the stops across the areas, the weather with its condition spelled out', () => {
    const facts = Object.fromEntries(all(trees('upcoming').planIntro, '.tv-fact').map((el) => [attr(el, 'data-fact'), textOf(el)]));
    expect(facts.stops).toBe('Stops 31 across 3 areas');
    expect(facts.weather).toBe('Typical weather 10 to 24°C, clear');
    expect(facts.pace).toBe('Pace Balanced');
    const odd = { ...T.upcoming, glance: T.upcoming.glance.map((fact) => (fact.key === 'weather' ? { ...fact, note: 'A note in another form' } : fact)) };
    const kept = all(parseHtml(renderTripLanding(odd, CTX_FIXTURE).planIntro).root, '.tv-fact').find((el) => attr(el, 'data-fact') === 'weather');
    expect(textOf(kept)).toBe('Typical weather 10 to 24°C A note in another form');
    expect(T.upcoming.glance.find((fact) => fact.key === 'stops').value).toBe('31');
  });

  it('imported: the short brief, and no pace or stay facts', () => {
    const { planIntro } = trees('imported');
    expect(textOf(one(planIntro, 'p.con-lede'))).toBe('Seven days in Marrakech for two.');
    expect(all(planIntro, '[data-fact="pace"]')).toHaveLength(0);
    expect(all(planIntro, '[data-fact="stay"]')).toHaveLength(0);
  });

  it('multi-city with a long title: the smallest title step and three flags', () => {
    const root = one(trees('multiCity').hero, 'header.con-hero');
    expect(attr(root, 'data-title-step')).toBe('long');
    expect(all(root, 'img.ui-flag')).toHaveLength(3);
  });

  it('no cover: the placeholder carries the hero, with the same text block', () => {
    const root = one(trees('noCover').hero, 'header.con-hero');
    expect(all(root, 'img.ui-frame-img')).toHaveLength(0);
    expect(textOf(one(root, 'h1'))).toBe(T.noCover.title);
    expect(all(root, '[data-region="hero-status"]')).toHaveLength(1);
  });

  it('no map points: the slot stays for later points, the caption and the map days do not', () => {
    const { planIntro } = trees('noMap');
    expect(all(planIntro, '[data-map-slot]')).toHaveLength(1);
    expect(all(planIntro, '[data-region="map-caption"]')).toHaveLength(0);
    expect(all(planIntro, '[data-map-day]')).toHaveLength(0);
  });

  it('venue photos off: no thumbnails in the day list, placeholders on the area tiles', () => {
    const { planIntro, between } = trees('photosOff');
    expect(all(planIntro, '.ui-thumb')).toHaveLength(0);
    expect(all(between, 'button.con-town')).toHaveLength(T.photosOff.areas.length);
    expect(all(between, 'img')).toHaveLength(0);
  });

  it('entry check still running: the row is there and says so', () => {
    const { planIntro } = trees('entryChecking');
    const row = all(planIntro, '.ui-ready-row').find((el) => attr(el, 'data-area') === 'entry');
    expect(attr(row, 'data-state')).toBe('checking');
  });

  it('ground journey: the transport card opens, not flights', () => {
    expect(render('ground').openSections).toEqual(['transport', 'entry', 'accommodation']);
  });

  it('the area tiles and the spending link name the tab they open', () => {
    const { between } = trees('upcoming');
    expect(all(between, 'button[data-con-tab="towns"]')).toHaveLength(T.upcoming.areas.length);
    expect(all(between, 'button[data-con-tab="spending"]')).toHaveLength(1);
  });

  it('weather is always called typical', () => {
    for (const key of KEYS) {
      const html = PARTS.map((name) => render(key)[name]).join('');
      for (const match of html.matchAll(/\d+ to \d+°C[^<]{0,24}/g)) {
        const near = html.slice(Math.max(0, match.index - 220), match.index + match[0].length + 60);
        expect(near, `${key}: ${match[0]}`).toMatch(/typical/i);
      }
    }
  });

  it('mountTripLanding needs a root with listeners and registers its cleanup', () => {
    const calls = [];
    const root = { addEventListener: (type, fn, opts) => calls.push([type, typeof fn, Boolean(opts?.signal)]) };
    const cleanups = [];
    mountTripLanding(root, T.upcoming, { ...CTX_FIXTURE, onCleanup: (fn) => cleanups.push(fn) });
    expect(calls).toEqual([['click', 'function', true]]);
    expect(cleanups).toHaveLength(1);
    expect(() => cleanups[0]()).not.toThrow();
  });
});

// A phone hides a closed Flights, Transport, Entry requirements or Where to stay card only while a
// row of Before you go opens it. Where no row does (a past plan, a plan that is running, a plan
// being planned again) the card stays on the page, closed, as the classic page shows it: no stored
// content is out of reach. The rule is in the skin, so the skin is read here.
describe('section cards on a phone', () => {
  const CARDS = ['flights', 'transport', 'entry', 'accommodation'];
  const sheet = parseCss(readFileSync(new URL('../../../css/views/concierge.css', import.meta.url), 'utf8'));
  /** Every selector that takes a section card off the page, with the card it names and the row it needs. */
  const hides = sheet.rules
    .filter((rule) => rule.declarations.some((d) => d.prop === 'display' && d.value === 'none'))
    .flatMap((rule) => rule.selectors.map((text) => ({ text, at: rule.at.join(' '), parsed: parseSelector(text) })))
    .map((one) => {
      const subject = one.parsed.compounds.at(-1).parts;
      const card = subject.find((part) => part.type === 'attr' && part.name === 'data-section')?.value ?? null;
      const isCard = card !== null || subject.some((part) => part.type === 'class' && part.name === 'td-day-card--section');
      const needs = one.parsed.compounds.flatMap((c) => c.parts).filter((part) => part.name === 'has').map((part) => part.raw);
      return { ...one, card, isCard, needs, closedOnly: subject.some((part) => part.name === 'not' && part.raw === '.td-day-card--open') };
    })
    .filter((one) => one.isCard);
  const rowTargets = (key) => all(parseHtml(render(key).planIntro).root, '[data-section-jump]')
    .filter((el) => isInside(el, '.ui-ready-row')).map((el) => attr(el, 'data-section-jump'));

  it('each card has its own rule, for a closed card on a narrow page only', () => {
    expect(sheet.errors).toEqual([]);
    expect(hides.map((one) => one.card).sort()).toEqual([...CARDS].sort());
    for (const one of hides) {
      expect(one.closedOnly, one.text).toBe(true);
      expect(one.at, one.text).toMatch(/@container con-body \(max-width: 687px\)/);
    }
  });

  it('a card is hidden only while a readiness row that opens it is on the page', () => {
    for (const one of hides) expect(one.needs, one.text).toEqual([`:where(.ui-ready-row) [data-section-jump="${one.card}"]`]);
  });

  it('the rows are there before departure, and not while the plan runs, after it or without readiness', () => {
    expect(rowTargets('upcoming')).toEqual(T.upcoming.readiness.items.map((item) => item.target));
    expect(rowTargets('ground')).toContain('transport');
    for (const key of KEYS.filter((name) => !T[name].readiness || T[name].readiness.collapsed)) expect(rowTargets(key), key).toEqual([]);
    expect(T.live.readiness.collapsed).toBe(true);
    expect(T.past.readiness).toBeNull();
  });
});
