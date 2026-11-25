// The Atlas dashboard on every model fixture: the sections of the task table are there for the states
// that have them and absent for the others. The hook table of blueprint 3.3 is checked for every view
// by js/views/view-contract.test.js; it is run here too, so a broken hook shows beside its section.
import { describe, it, expect } from 'vitest';
import { DASHBOARD_FIXTURES, CTX_FIXTURE } from '../fixtures/models.js';
import { checkDashboardHtml } from '../fixtures/checks/dashboard-contract.js';
import { all, attr, parseHtml, textOf } from '../fixtures/checks/html-tree.js';
import { renderDashboard, mountDashboard } from './dashboard.js';

const KEYS = Object.keys(DASHBOARD_FIXTURES);
const READY = KEYS.filter((key) => DASHBOARD_FIXTURES[key].state === 'ready');
const render = (key, ctx = CTX_FIXTURE) => renderDashboard(DASHBOARD_FIXTURES[key], ctx);
const tree = (key, ctx) => parseHtml(render(key, ctx)).root;
const one = (root, selector) => all(root, selector)[0] ?? null;
const region = (root, name) => one(root, `[data-region="${name}"]`);
const texts = (root, selector) => all(root, selector).map(textOf);
const BANNED = /[—–·•…→]/;

describe.each(KEYS)('fixture %s', (key) => {
  const model = DASHBOARD_FIXTURES[key];
  const html = render(key);
  const root = parseHtml(html).root;

  it('keeps the hook table and is sound markup', () => {
    expect(parseHtml(html).errors).toEqual([]);
    expect(checkDashboardHtml(html, model)).toEqual([]);
  });
  it('has one h1 and both ways to start a plan', () => {
    expect(all(root, 'h1')).toHaveLength(1);
    expect(all(root, '[data-action="new-trip"]').length).toBeGreaterThanOrEqual(1);
    expect(all(root, '[data-action="import-trip"]').length).toBeGreaterThanOrEqual(1);
  });
  it('writes no banned glyph and gives every control a focus key', () => {
    expect(html).not.toMatch(BANNED);
    for (const el of all(root, 'button')) expect(attr(el, 'data-focus-key'), textOf(el)).toBeTruthy();
    const keys = all(root, '[data-focus-key]').map((el) => attr(el, 'data-focus-key'));
    expect(keys.filter((focusKey, i) => keys.indexOf(focusKey) !== i)).toEqual([]);
  });
  it('gives the same markup twice', () => {
    expect(render(key)).toBe(html);
  });
  it('draws the foot with the outline credit wherever a plate is drawn', () => {
    if (model.state === 'error') { expect(one(root, 'footer')).toBeNull(); return; }
    expect(textOf(one(root, 'footer'))).toContain('Map outline: Natural Earth, public domain.');
    expect(all(root, 'details.ui-credits').length).toBe(model.credits.length ? 1 : 0);
  });
});

describe.each(READY)('ready fixture %s', (key) => {
  const model = DASHBOARD_FIXTURES[key];
  const root = tree(key);

  it('1. the briefing is the h1: the live plan, then what is next', () => {
    const h1 = textOf(one(root, 'h1'));
    const [lead] = model.live;
    if (lead) expect(h1).toContain(`Day ${lead.dayNumber} of ${lead.dayCount}`);
    if (model.next) expect(h1).toMatch(/is next, (in \d+ days|tomorrow)\./);
    expect(region(one(root, 'h1'), 'lead')).not.toBeNull();
    expect(h1.length).toBeGreaterThan(10);
  });
  it('2. Happening now is there exactly when a plan is live', () => {
    const now = one(root, 'section.atl-now');
    expect(Boolean(now)).toBe(model.live.length > 0 || Boolean(model.next) || Boolean(model.suggestion));
    expect(region(root, 'live')).not.toBeNull();
    if (!model.live.length) { expect(textOf(region(root, 'live'))).toBe(''); return; }
    expect(textOf(one(now, 'h2'))).toBe('Happening now');
    expect(textOf(one(now, '.atl-count'))).toBe(String(model.live.length));
    expect(textOf(now)).toContain(`Today, ${model.now.dateText}`);
    const cards = all(region(root, 'live'), '[data-trip-id]');
    expect(cards.map((card) => attr(card, 'data-trip-id'))).toEqual(model.live.map((briefing) => briefing.trip.id));
    const [lead] = cards;
    expect(textOf(lead)).toContain(`Day ${model.live[0].dayNumber} of ${model.live[0].dayCount}`);
    expect(all(lead, '.ui-segs')).toHaveLength(1);
    expect(texts(lead, 'a').filter((label) => label !== '')).toEqual(expect.arrayContaining(['Open today', 'Open whole trip']));
    expect(one(lead, 'img.ui-frame-img') ? attr(one(lead, 'img.ui-frame-img'), 'fetchpriority') : 'high').toBe('high');
    for (const also of cards.slice(1)) {
      expect(textOf(also)).toMatch(/Also happening now, day \d+ of \d+/);
      expect(texts(also, 'a')).toContain('Open today');
    }
  });
  it('2. the lead card shows the next stop, or keeps its place while the briefing is awaited', () => {
    const [lead] = model.live;
    if (!lead) return;
    const card = one(region(root, 'live'), '[data-trip-id]');
    const stop = one(card, '.atl-stop');
    expect(stop).not.toBeNull();
    if (lead.trip.briefingPending) {
      expect(attr(card, 'data-briefing')).toBe('pending');
      expect(textOf(stop)).toBe('');
    } else if (lead.nextStop) {
      expect(textOf(stop)).toContain('Next stop today');
      expect(textOf(stop)).toContain(lead.nextStop.title);
      if (lead.nextStop.time) expect(textOf(stop)).toContain(lead.nextStop.time);
    }
  });
  it('3. the plate: a desktop plate and a phone band, each one link to the atlas, with the three stats', () => {
    const plate = region(root, 'plate');
    const band = region(root, 'band');
    expect(plate).not.toBeNull();
    expect(band).not.toBeNull();
    for (const box of [plate, band]) {
      const links = all(box, 'a').filter((a) => attr(a, 'href') === '#/atlas');
      expect(links.length).toBeGreaterThanOrEqual(1);
      expect(all(box, 'svg.wm-plate')).toHaveLength(1);
      expect(all(box, '[data-place]')).toHaveLength(0);
    }
    const stats = region(root, 'stats');
    expect(textOf(stats)).toBe(`${model.stats.trips} plans ${model.stats.countries} countries ${model.stats.daysPlanned} days planned`);
    expect(textOf(band)).toContain(`${model.stats.daysPlanned} days planned`);
    expect(all(root, 'svg.wm-defs')).toHaveLength(1);
    expect(all(root, '[data-action="open-atlas"]')).toHaveLength(1);
    expect(textOf(one(root, '.atl-legend'))).toBe('Happening now Upcoming Past Home');
    expect(textOf(band)).toContain('Open atlas');
    if (model.stats.byCountry.length) expect(textOf(band)).toContain('Open passport');
  });
  it('3. the plate labels the live plans and the next departures, and draws arcs from home', () => {
    const plate = region(root, 'plate');
    const tags = texts(plate, 'text');
    for (const briefing of model.live) expect(tags.join('|')).toContain(`day ${briefing.dayNumber} of ${briefing.dayCount}`);
    expect(all(plate, 'path.wm-arc').length).toBeGreaterThan(0);
    expect(attr(one(plate, '[data-atl-plate]'), 'data-atl-pins')).toContain('"p":');
  });
  it('4. Trips, with the search field and the filter chips, and no count badge', () => {
    const trips = one(root, 'section.atl-trips');
    expect(textOf(one(trips, 'h2'))).toBe('Trips');
    expect(all(trips, '.atl-count')).toHaveLength(0);
    expect(textOf(trips)).not.toMatch(/Most recent first|Soonest first/);
    expect(textOf(region(root, 'count'))).toMatch(model.filter.expanded ? /^(\d+ plans? match(es)?)?$/ : /^$/);
    expect(all(trips, 'input[data-trip-search]')).toHaveLength(1);
    expect(attr(one(trips, 'input[data-trip-search]'), 'placeholder')).toBe('Search trips, cities or countries');
    const chips = texts(region(root, 'filters'), '.ui-chip-label');
    expect(chips).toEqual(model.filter.active === 'live' ? ['All', 'Now', 'Upcoming', 'Past', 'Shared with me'] : ['All', 'Upcoming', 'Past', 'Shared with me']);
  });
  it('5. the rail ahead: the next departure in full, the others as rows under month marks', () => {
    const next = region(root, 'next');
    const rest = region(root, 'trips');
    const shown = model.next && model.sections.upcoming.some((card) => card.id === model.next.trip.id);
    expect(all(next, '[data-trip-id]').map((el) => attr(el, 'data-trip-id'))).toEqual(shown ? [model.next.trip.id] : []);
    const others = model.sections.upcoming.filter((card) => !shown || card.id !== model.next.trip.id);
    expect(all(rest, '[data-trip-id]').map((el) => attr(el, 'data-trip-id'))).toEqual([...others, ...model.sections.undated].map((card) => card.id));
    if (shown) {
      const card = one(next, '[data-trip-id]');
      const words = textOf(card);
      expect(words).toContain('Next departure');
      expect(words).toMatch(model.next.daysToGo === 1 ? /in 1 day\b/ : new RegExp(`in ${model.next.daysToGo} days`));
      expect(words).toContain(model.next.trip.dates.text);
      expect(textOf(one(card, '.atl-pill'))).toContain(`${model.next.trip.dates.dayCount} day`);
      expect(words).not.toMatch(/per person|about [^\d\s]/);
      if (model.next.trip.weather) expect(words).toContain('typical');
      for (const item of model.next.todo) expect(words).toContain(`${item.label}: ${item.status}`);
      if (model.next.settled.length) expect(words).toContain(`Settled: ${model.next.settled.map((item) => item.label).join(', ')}`);
      const checklist = all(card, 'a').filter((a) => textOf(a) === 'Open checklist');
      expect(checklist).toHaveLength(model.next.trip.readiness ? 1 : 0);
      for (const a of checklist) expect(attr(a, 'href')).toBe(`${model.next.trip.href}?open=checklist`);
    }
    for (const card of others) {
      const row = one(rest, `[data-trip-id="${card.id}"]`);
      expect(textOf(row)).toMatch(/in \d+ days?\b/);
    }
    // The rail carries no readiness chip: what is open is the checklist of the next departure alone.
    for (const part of [next, rest]) {
      expect(all(part, '.ui-ready-chip')).toHaveLength(0);
      expect(all(part, '.atl-chip-wait')).toHaveLength(0);
      expect(textOf(part)).not.toMatch(/\d+ to do/);
    }
    const marks = texts(root, '.atl-rm-k');
    for (const card of model.sections.upcoming) expect(marks.join('|')).toContain(card.monthKey.slice(0, 4));
  });
  it('5. the rail ahead ends with what is not planned yet, and a way to plan it', () => {
    const end = one(root, '.atl-rail-end');
    if (model.filter.expanded) { expect(end).toBeNull(); return; }
    expect(textOf(end)).toMatch(/^(Nothing planned after \d{1,2} \w{3} \d{4}\.|Nothing is planned ahead\.) Plan a trip$/);
    expect(all(end, '[data-action="new-trip"]')).toHaveLength(1);
  });
  it('5. the passport panel has a stamp per country', () => {
    const passport = one(root, 'section.atl-passport');
    expect(Boolean(passport)).toBe(model.stats.byCountry.length > 0);
    if (!passport) return;
    expect(textOf(one(passport, 'h2'))).toBe('Passport');
    expect(all(passport, '.atl-stamp')).toHaveLength(model.stats.byCountry.length);
    expect(texts(passport, 'a')).toContain('Open passport');
    expect(textOf(passport)).not.toMatch(/\btrips?\b/);
  });
  it('6. the past plans by month, the two latest open, with their end mark', () => {
    const past = region(root, 'past');
    expect(past).not.toBeNull();
    const groups = all(past, 'details');
    expect(groups.map((group) => attr(group, 'data-key'))).toEqual(model.pastByMonth.map((group) => `past-${group.key}`));
    expect(groups.map((group) => attr(group, 'open') !== null)).toEqual(model.pastByMonth.map((_, i) => model.filter.expanded || i < 2));
    expect(all(past, '[data-trip-id]').map((el) => attr(el, 'data-trip-id'))).toEqual(model.sections.past.map((card) => card.id));
    for (const group of groups) { expect(textOf(one(group, 'summary'))).toMatch(/^\w{3} \d{4} \S/); expect(textOf(one(group, 'summary'))).not.toMatch(/^\w{3} \d{4} \d+ plans?\b/); }
    const term = one(past, '.atl-rail-term');
    if (model.sections.past.length && !model.filter.expanded) expect(textOf(term)).toMatch(/^First plan, \d{1,2} \w{3} \d{4}$/);
    else expect(term).toBeNull();
    if (model.sections.past.length) expect(textOf(past)).toContain('Past');
  });
  it('7. short hops from home, nearest first, each with its distance', () => {
    const hops = region(root, 'hops');
    expect(Boolean(hops)).toBe(model.hops.length > 0);
    if (!hops) return;
    expect(attr(hops, 'data-keep-scroll')).not.toBeNull();
    const buttons = all(hops, 'button[data-action="plan-city"]');
    expect(buttons.map((button) => attr(button, 'data-city'))).toEqual(model.hops.map((hop) => hop.name));
    model.hops.forEach((hop, i) => {
      expect(textOf(buttons[i])).toContain(`~${hop.km} km`);
      expect(textOf(buttons[i])).toContain(hop.note);
    });
    const section = one(root, 'section.atl-hops');
    expect(textOf(one(section, 'h2'))).toBe('Nearby getaway ideas');
    expect(textOf(section)).not.toContain('Nearest first');
  });
  it('says plans, never trips taken, and the rail pill holds the figure and the length alone', () => {
    const words = textOf(root);
    expect(words).not.toMatch(/you went|visited|trips? (logged|taken)/i);
    for (const card of [...model.sections.upcoming, ...model.sections.past]) {
      // The rail rows carry the figure alone in their pill: no "about", no "per person" (the owner's ruling).
      const row = one(one(root, '.atl-trips'), `[data-trip-id="${card.id}"]`);
      expect(textOf(row)).not.toMatch(/per person|\babout\b/);
      if (card.cost.local) expect(textOf(one(row, '.atl-pill-cost'))).toBe(card.cost.homeFirst && card.cost.home ? card.cost.home.text : card.cost.local.text);
      if (card.dates?.dayCount) expect(textOf(one(row, '.atl-pill-days'))).toMatch(/^\d+ days?$/);
    }
  });
});

describe('in-progress plans sit on the rail', () => {
  it('a plan being planned: its progress, segments when the total is known, and the notify button', () => {
    const planning = region(tree('generating'), 'planning');
    const card = one(planning, '[data-trip-state="generating"]');
    expect(textOf(card)).toContain('4 of 9 days planned');
    expect(all(card, '.ui-segs')).toHaveLength(1);
    expect(all(card, '[data-action="notify-ready"]')).toHaveLength(1);
    const loose = one(region(tree('generatingNoDates'), 'planning'), '[data-trip-state="generating"]');
    expect(textOf(loose)).toContain('4 days planned so far');
    expect(all(loose, '.ui-segs')).toHaveLength(0);
  });
  it('a stopped plan: try again, and delete unless it is shared', () => {
    const own = one(region(tree('failed'), 'planning'), '[data-trip-state="failed"]');
    expect(textOf(own)).toContain('Planning stopped');
    expect(all(own, '[data-retry-trip]')).toHaveLength(1);
    expect(all(own, '[data-delete-trip]')).toHaveLength(1);
    const shared = one(region(tree('failedShared'), 'planning'), '[data-trip-state="failed"]');
    expect(all(shared, '[data-retry-trip]')).toHaveLength(1);
    expect(all(shared, '[data-delete-trip]')).toHaveLength(0);
  });
  it('is not drawn at all when nothing is being planned', () => {
    expect(textOf(region(tree('ready'), 'planning'))).toBe('');
  });
});

describe('edge states', () => {
  it('a shared plan says what the user can do with it', () => {
    expect(textOf(one(tree('sharedViewer'), '[data-trip-id="s-porto"]'))).toContain('Shared with you. You can view it.');
    expect(textOf(one(tree('sharedEditor'), '[data-trip-id="s-porto"]'))).toContain('Shared with you. You can edit it.');
  });
  it('a plan without a photo uses the placeholder with its flag', () => {
    const card = one(tree('noCover'), '[data-trip-id="s-marrakech"]');
    const frame = one(card, '.ui-frame');
    expect(attr(frame, 'data-frame')).toBe('none');
    expect(all(frame, 'img.ui-flag')).toHaveLength(1);
    expect(all(card, 'img.ui-frame-img')).toHaveLength(0);
  });
  it('a plan without dates sits under its own mark', () => {
    const root = tree('noDates');
    expect(texts(root, '.atl-rm-k')).toContain('No dates yet');
    expect(textOf(one(root, '[data-trip-id="s-florence"]'))).toContain('No dates yet');
  });
  it('without a home currency no amount is converted', () => {
    expect(textOf(tree('noHomeCurrency'))).not.toMatch(/about [€$£¥A-Z]/);
  });
  it('a briefing that is still awaited keeps the place of what it will bring', () => {
    const root = tree('briefingPending');
    const pending = all(root, '[data-briefing="pending"]');
    expect(pending.length).toBeGreaterThanOrEqual(4);
    // A live plan waits for its next stop and the next departure for its checklist; the other rows
    // of the rail take nothing from the briefing, so they hold no place for it.
    const rows = all(region(root, 'trips'), '[data-briefing="pending"]');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const card of rows) expect(all(card, '.atl-wait')).toHaveLength(0);
    const waiting = pending.filter((card) => !rows.includes(card));
    expect(waiting.length).toBeGreaterThanOrEqual(2);
    for (const card of waiting) expect(all(card, '.atl-wait').length).toBeGreaterThanOrEqual(1);
    expect(all(tree('ready'), '.atl-wait')).toHaveLength(0);
  });
  it('a stale list has a status banner with the retry and says when it was saved', () => {
    const banner = one(tree('stale'), '[role="status"]');
    expect(textOf(banner)).toMatch(/saved on this device on \w{3} \d{1,2} Mar at/);
    expect(all(banner, '[data-action="retry-trips"]')).toHaveLength(1);
    expect(all(tree('ready'), '.dv-stale')).toHaveLength(0);
  });
  it('a filter opens every month, drops the end marks and keeps Happening now', () => {
    const root = tree('filtered');
    expect(one(root, 'section.atl-now')).not.toBeNull();
    expect(textOf(region(root, 'next'))).toBe('');
    expect(one(root, '.atl-rail-term')).toBeNull();
  });
  it('says so when a search matches nothing', () => {
    const model = DASHBOARD_FIXTURES.ready;
    const none = { ...model, sections: { inProgress: [], live: [], upcoming: [], past: [], undated: [] }, pastByMonth: [], filter: { ...model.filter, q: 'zzz', expanded: true } };
    expect(textOf(parseHtml(renderDashboard(none, CTX_FIXTURE)).root)).toContain('No plan matches.');
  });
});

describe('a search that matches only a live plan', () => {
  it('points up to Happening now instead of leaving the rail blank', () => {
    const model = DASHBOARD_FIXTURES.ready;
    const onlyLive = { ...model, sections: { inProgress: [], live: model.sections.live, upcoming: [], past: [], undated: [] }, pastByMonth: [], filter: { ...model.filter, q: 'sev', expanded: true } };
    const root = parseHtml(renderDashboard(onlyLive, CTX_FIXTURE)).root;
    expect(textOf(region(root, 'trips'))).toBe('1 match is under Happening now.');
    expect(checkDashboardHtml(renderDashboard(onlyLive, CTX_FIXTURE), onlyLive)).toEqual([]);
  });
});

describe('short hops without a home city name', () => {
  it('still has a heading', () => {
    const model = { ...DASHBOARD_FIXTURES.ready, user: { ...DASHBOARD_FIXTURES.ready.user, homeCity: '' } };
    expect(textOf(one(one(parseHtml(renderDashboard(model, CTX_FIXTURE)).root, 'section.atl-hops'), 'h2'))).toBe('Nearby getaway ideas');
  });
});

describe('the empty dashboard', () => {
  const root = tree('empty');
  it('starts the atlas at home: a plate with the home pin, zeroed stats and both ways to start', () => {
    expect(textOf(one(root, 'h1'))).toBe('Your atlas starts in Lisbon');
    expect(textOf(one(root, '.atl-empty'))).toContain('0 plans 0 countries 0 days planned');
    expect(all(one(root, '.atl-empty'), 'svg.wm-plate')).toHaveLength(1);
    expect(texts(one(root, '.atl-empty'), 'text')).toEqual(['Home, Lisbon']);
    expect(all(one(root, '.atl-empty'), '[data-action="new-trip"]')).toHaveLength(1);
    expect(all(one(root, '.atl-empty'), '[data-action="import-trip"]')).toHaveLength(1);
  });
  it('draws no trip, no rail and no passport, and still offers the short hops', () => {
    expect(all(root, '[data-trip-id]')).toHaveLength(0);
    expect(one(root, 'section.atl-trips')).toBeNull();
    expect(one(root, 'section.atl-passport')).toBeNull();
    expect(region(root, 'hops')).not.toBeNull();
  });
  it('has a heading without a home city too', () => {
    const model = { ...DASHBOARD_FIXTURES.empty, user: { ...DASHBOARD_FIXTURES.empty.user, homeCity: '' }, pins: [], hops: [] };
    const bare = parseHtml(renderDashboard(model, CTX_FIXTURE)).root;
    expect(textOf(one(bare, 'h1'))).toBe('Your atlas starts here');
    expect(all(bare, 'path.wm-arc')).toHaveLength(0);
  });
});

describe('the load error', () => {
  const root = tree('error');
  it('is an alert with the retry, under a plain heading', () => {
    expect(textOf(one(root, 'h1'))).toBe('Trips');
    expect(all(one(root, '[role="alert"]'), '[data-action="retry-trips"]')).toHaveLength(1);
    expect(all(root, '[data-trip-id]')).toHaveLength(0);
    expect(one(root, 'section.atl-trips')).toBeNull();
  });
});

describe('without a home city', () => {
  it('the plate draws pins and no arcs', () => {
    const model = DASHBOARD_FIXTURES.ready;
    const homeless = { ...model, user: { ...model.user, homeCity: '', homeFlag: '' }, pins: model.pins.filter((pin) => pin.kind !== 'home'), hops: [] };
    const root = parseHtml(renderDashboard(homeless, CTX_FIXTURE)).root;
    expect(all(region(root, 'plate'), 'path.wm-arc')).toHaveLength(0);
    expect(all(region(root, 'plate'), 'circle.wm-dot').length).toBeGreaterThan(5);
    expect(checkDashboardHtml(renderDashboard(homeless, CTX_FIXTURE), homeless)).toEqual([]);
  });
});

describe('entry motion', () => {
  it('is asked for on a first render only', () => {
    expect(render('ready')).toContain('data-fade');
    expect(render('ready', { ...CTX_FIXTURE, animate: false })).not.toContain('data-fade');
    expect(render('ready')).toContain('atl-enter');
    expect(render('ready', { ...CTX_FIXTURE, animate: false })).not.toContain('atl-enter');
  });
});

describe('beside the plate while no plan is live', () => {
  const D = DASHBOARD_FIXTURES;
  const draw = (model) => parseHtml(renderDashboard(model, CTX_FIXTURE)).root;
  const labels = (el) => [...texts(one(el, '.atl-now-actions'), 'a'), ...texts(one(el, '.atl-now-actions'), 'button')];

  it('draws the next departure in the language of the lead card: days to go, dates, weather, what is still to do', () => {
    const model = D.noLive;
    const root = draw(model);
    const section = one(root, 'section.atl-now');
    expect(textOf(one(section, 'h2'))).toBe('Next departure');
    const card = one(region(root, 'ahead'), '.atl-lead');
    const { trip, daysToGo, todo, lengthText } = model.next;
    expect(attr(card, 'data-trip-id')).toBe(trip.id);
    expect(textOf(one(card, 'h3'))).toBe(trip.title);
    // The days to go are flap digits (the cells plus the real number as hidden text), then the words.
    const toGo = one(one(card, '.atl-togo'), 'strong');
    expect(one(toGo, '.ui-flap')).toBeTruthy();
    expect(textOf(toGo)).toMatch(new RegExp(`in ${daysToGo} days$`));
    expect(textOf(card)).toContain(trip.dates.text);
    // The length is two figures with a sign each and no cost; the words are the label.
    void lengthText;
    expect(attr(one(card, '.atl-span'), 'aria-label')).toBe(`${trip.dates.dayCount} days, ${trip.dates.nights} nights`);
    expect(textOf(one(card, '.atl-togo'))).not.toMatch(/per person|about/);
    expect(textOf(one(card, '.atl-next-wx'))).toContain('typical');
    expect(todo.length).toBeGreaterThan(0);
    expect(all(one(card, '.atl-todo'), 'li')).toHaveLength(Math.min(3, todo.length));
    expect(all(card, '.ui-chip')).toHaveLength(0);
    expect(labels(card)).toEqual(['Open trip', 'Open checklist']);
    expect(attr(all(card, 'a').find((a) => textOf(a) === 'Open trip'), 'href')).toBe(trip.href);
    expect(attr(all(card, 'a').find((a) => textOf(a) === 'Open checklist'), 'href')).toBe(`${trip.href}?open=checklist`);
    // The rail keeps its own entry.
    expect(all(region(root, 'next'), `[data-trip-id="${trip.id}"]`)).toHaveLength(1);
  });
  it('lists the plan after it as a row, and no row when there is none', () => {
    const model = D.noLive;
    const [, second] = model.sections.upcoming;
    const row = one(region(draw(model), 'ahead'), '.atl-also');
    expect(attr(row, 'data-trip-id')).toBe(second.id);
    expect(textOf(one(row, 'h3'))).toBe(`${second.title}`);
    expect(textOf(row)).toContain(`In ${second.daysToGo} days`);
    const [first] = model.sections.upcoming;
    const alone = { ...model, sections: { ...model.sections, upcoming: [first] }, cardsById: Object.fromEntries(Object.entries(model.cardsById).filter(([, card]) => card.phase !== 'upcoming' || card === first)) };
    expect(one(region(draw(alone), 'ahead'), '.atl-also')).toBeNull();
  });
  it('keeps the row while a filter empties the sections', () => {
    const model = { ...D.noLive, sections: { ...D.noLive.sections, upcoming: [] }, filter: { ...D.noLive.filter, active: 'past', expanded: true } };
    expect(one(region(draw(model), 'ahead'), '.atl-also')).not.toBeNull();
  });
  it('reserves the place of the late lines while the briefing is awaited', () => {
    const { next } = D.noLive;
    const trip = { ...next.trip, readiness: null, weather: null, briefingPending: true };
    const model = { ...D.noLive, next: { ...next, trip, todo: [], settled: [] }, cardsById: { ...D.noLive.cardsById, [trip.id]: trip }, sections: { ...D.noLive.sections, upcoming: [trip, ...D.noLive.sections.upcoming.slice(1)] } };
    const card = one(region(draw(model), 'ahead'), '.atl-lead');
    expect(attr(card, 'data-briefing')).toBe('pending');
    expect(one(card, '.atl-ahead-late.atl-wait')).not.toBeNull();
    expect(labels(card)).toEqual(['Open trip']);
  });
  it('suggests one place when nothing is live or upcoming: the hook of a short hop tile, and a way to the others', () => {
    const model = D.pastOnly;
    const root = draw(model);
    const section = one(root, 'section.atl-now');
    expect(textOf(one(section, 'h2'))).toBe('Suggested trip');
    const card = one(region(root, 'ahead'), '.atl-lead');
    const { hop, reason } = model.suggestion;
    expect(textOf(one(card, 'h3'))).toBe(hop.name);
    expect(textOf(card)).toContain(hop.country);
    expect(textOf(one(card, '.atl-idea-why'))).toBe(reason);
    const [plan, more] = all(card, 'button');
    expect([textOf(plan), attr(plan, 'data-action'), attr(plan, 'data-city')]).toEqual(['Plan this trip', 'plan-city', hop.name]);
    expect([textOf(more), attr(more, 'data-action')]).toEqual(['See more ideas', 'atl-more-ideas']);
    expect(one(root, '[data-atl-hops]')).not.toBeNull();
    expect(all(section, '[data-trip-id]')).toHaveLength(0);
  });
  it('leaves the row to the plate when there is nothing to put beside it', () => {
    const root = draw({ ...D.pastOnly, hops: [], suggestion: null });
    expect(one(root, 'section.atl-now')).toBeNull();
    expect(textOf(region(root, 'live'))).toBe('');
  });
  it('never replaces a live plan', () => {
    for (const key of ['ready', 'nothingUpcoming', 'twoLive']) expect(region(draw(D[key]), 'ahead')).toBeNull();
  });
});

describe('mountDashboard', () => {
  it('is a function that can be handed a root with nothing to measure', () => {
    expect(typeof mountDashboard).toBe('function');
  });
});

describe('a closed month of the past rail', () => {
  const card = (id, title, flags) => ({ ...DASHBOARD_FIXTURES.ready.sections.past[0], id, title, flags, monthKey: '2026-06', href: `#/trip/${id}` });
  const month = (key, cards) => cards.map((c) => ({ ...c, monthKey: key }));
  const past = [
    ...month('2026-10', [card('p1', 'Helsinki & Oulu', ['fi'])]),
    ...month('2026-09', [card('p2', 'Ulaanbaatar', ['mn'])]),
    ...month('2026-06', [card('p3', 'Tokyo', ['jp']), card('p4', 'Geneva, Zurich & Basel', ['ch']), card('p5', 'Berlin', ['de'])]),
  ];
  const model = { ...DASHBOARD_FIXTURES.ready, sections: { ...DASHBOARD_FIXTURES.ready.sections, past } };
  const html = renderDashboard(model, CTX_FIXTURE);
  const root = parseHtml(html).root;
  const closed = all(root, 'details').filter((el) => attr(el, 'data-key') === 'past-2026-06')[0];

  it('names its plans beside the flags, so the row is never flags alone', () => {
    expect(parseHtml(html).errors).toEqual([]);
    expect(attr(closed, 'open')).toBeNull();
    const what = all(closed, '.atl-rm-what')[0];
    expect(textOf(all(what, '.atl-rm-names')[0])).toBe('Tokyo, Geneva, Zurich & Basel and 1 more');
    expect(all(all(what, '.atl-rm-flags')[0], 'img')).toHaveLength(3);
  });
  it('has a month control of the month and the arrow, with no count of plans', () => {
    for (const summary of all(root, 'summary.atl-rm')) {
      expect(textOf(summary)).not.toMatch(/\d+ plans?\b/);
      const control = one(summary, '.atl-rm-btn');
      expect(all(control, '.atl-rm-k')).toHaveLength(1);
      expect(all(control, 'svg')).toHaveLength(1);
    }
  });
  it('puts every flag of a past plan together before its name, and never cuts the row in two', () => {
    const two = { ...model, sections: { ...model.sections, past: [card('p8', 'Singapore, Johor Bahru & Kuala Lumpur', ['sg', 'my']), card('p9', 'Tokyo', ['jp'])] } };
    const rows = all(parseHtml(renderDashboard(two, CTX_FIXTURE)).root, '.atl-tp');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(attr(row, 'class')).toContain('atl-fr-2');
      const kids = row.children.filter((kid) => kid.tag).map((kid) => String(kid.attrs.class).split(' ')[0]);
      expect(kids.slice(1, 4)).toEqual(['atl-tp-flags', 'atl-tp-main', 'atl-tp-meta']);
      expect(one(row, '.atl-tp-meta').children.filter((kid) => kid.tag).map((kid) => String(kid.attrs.class).split(' ')[0])).toEqual(['atl-tp-dates', 'atl-pill']);
      expect(all(one(row, '.atl-tp-title'), 'img')).toHaveLength(0);
    }
    expect(all(one(rows[0], '.atl-tp-flags'), 'img')).toHaveLength(2);
    expect(textOf(one(rows[0], '.atl-tp-title'))).toBe('Singapore, Johor Bahru & Kuala Lumpur');
  });
});

describe('what a finished plan or an import changes sits in a region', () => {
  // The controller's rule (dashboard-views.js frameOf): a patch is possible only while the markup outside the regions is the same.
  const frame = (node) => {
    if (typeof node.text === 'string') return node.text;
    if (node.attrs && node.attrs['data-region'] !== undefined) return `{${node.attrs['data-region']}}`;
    const attrs = Object.entries(node.attrs ?? {}).map(([name, value]) => ` ${name}="${value}"`).join('');
    return `<${node.tag ?? ''}${attrs}>${(node.children ?? []).map(frame).join('')}</${node.tag ?? ''}>`;
  };
  const before = DASHBOARD_FIXTURES.ready;
  const [country] = before.stats.byCountry;
  const after = {
    ...before,
    counts: { ...before.counts, all: before.counts.all + 1 },
    stats: {
      ...before.stats, trips: before.stats.trips + 1, countries: before.stats.countries + 1,
      byCountry: [...before.stats.byCountry, { ...country, code: 'zz', code3: 'ZZZ', flag: 'zz', country: 'Newland', phase: 'upcoming', trips: 1 }],
    },
    credits: [...before.credits, { label: 'A new credit', full: 'Photo: A new credit', link: 'https://example.com/new-credit' }],
  };
  it('the passport line, the stamps, the count of plans and the photo credits', () => {
    const [a, b] = [before, after].map((model) => renderDashboard(model, CTX_FIXTURE));
    expect(b).toContain('Newland');
    expect(b).not.toBe(a);
    expect(frame(parseHtml(b).root)).toBe(frame(parseHtml(a).root));
  });
  it('keeps its hooks and sound markup with the new regions', () => {
    expect(checkDashboardHtml(renderDashboard(after, CTX_FIXTURE), after)).toEqual([]);
  });
});
