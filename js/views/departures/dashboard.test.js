// The departures dashboard on every model fixture: each section of the task list is there for the
// states that have it and absent for the others. Hooks and escaping are the rule tests' business
// (js/views/view-contract.test.js); this file is about what the view itself draws.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DASHBOARD_FIXTURES, CTX_FIXTURE } from '../fixtures/models.js';
import { all, attr, classesOf, parseHtml, textOf } from '../fixtures/checks/html-tree.js';
import { renderDashboard, mountDashboard } from './dashboard.js';
import { tickClocks } from './dash-head.js';

const KEYS = Object.keys(DASHBOARD_FIXTURES);
const READY = KEYS.filter((key) => DASHBOARD_FIXTURES[key].state === 'ready');
const STILL = Object.freeze({ ...CTX_FIXTURE, animate: false });

/** Every element under `from` that matches a descendant selector ("#id", ".a .b", ".a > .b" read as descendants). */
function find(from, selector) {
  const steps = selector.trim().split(/\s+(?![^[]*\])/).filter((step) => step !== '>').map((step) => step.replace(/#([\w-]+)/g, '[id="$1"]'));
  return steps.reduce((nodes, step) => [...new Set(nodes.flatMap((node) => all(node, step)))], [from]);
}

function draw(key, ctx = CTX_FIXTURE) {
  const model = DASHBOARD_FIXTURES[key];
  const html = renderDashboard(model, ctx);
  const { root, errors } = parseHtml(html);
  const q = (selector, from = root) => find(from, selector);
  return { model, html, root, errors, q, one: (selector, from) => q(selector, from)[0] ?? null, text: (selector, from) => q(selector, from).map(textOf) };
}
const idsOf = (list) => list.map((el) => attr(el, 'data-trip-id'));

describe.each(KEYS)('departures dashboard, fixture %s', (key) => {
  const page = draw(key);
  const { model, q, one } = page;
  const ready = model.state === 'ready';

  it('is sound markup with one h1 and both ways to start a plan', () => {
    expect(page.errors).toEqual([]);
    expect(q('h1')).toHaveLength(1);
    expect(q('[data-action="new-trip"]').length).toBeGreaterThanOrEqual(1);
    expect(q('[data-action="import-trip"]').length).toBeGreaterThanOrEqual(1);
  });

  it('1. greets by name, with the date, and welcomes a new account', () => {
    const greeting = textOf(one('h1'));
    expect(greeting).toContain(model.state === 'empty' ? 'Welcome' : 'Good morning');
    expect(greeting).toContain('Sam');
    if (model.state === 'empty') expect(page.text('.dep-hello-date')).toEqual([]);
    else expect(page.text('.dep-hello-date')).toEqual([model.now.dateText]);
  });

  it('1. draws the clocks only where there is something to tell the time of', () => {
    const clocks = q('[data-dep-clock]');
    const want = ready ? [model.live[0]?.timezone, model.user.homeTimezone].filter(Boolean) : [];
    expect(clocks.map((el) => attr(el, 'data-dep-clock'))).toEqual(want);
    expect(q('[data-region="clocks"]')).toHaveLength(want.length ? 1 : 0);
  });

  it('2. happening now: a pass for the lead plan, a row for each other live plan', () => {
    expect(q('#dep-now-h')).toHaveLength(ready ? 1 : 0);
    const passes = q('.dep-pass--live');
    expect(idsOf(passes)).toEqual(model.live.slice(0, 1).map((b) => b.trip.id));
    expect(idsOf(q('.dep-liverow'))).toEqual(model.live.slice(1).map((b) => b.trip.id));
    for (const pass of passes) {
      const [lead] = model.live;
      expect(q('[data-flap]', pass).map((el) => attr(el, 'data-flap'))).toContain(String(lead.dayNumber));
      expect(q('.ui-segs', pass)).toHaveLength(1);
      const weather = lead.today?.weather ?? lead.trip.weather;
      expect(q('.dep-wx--line', pass)).toHaveLength(1); // always there: it keeps its line while the briefing is awaited
      if (weather) expect(textOf(one('.dep-wx--line', pass))).toContain(`${weather.range} typical`);
      expect(q('a', pass).filter((a) => attr(a, 'href') === lead.trip.todayHref && attr(a, 'data-now-trip') === lead.trip.id)).toHaveLength(1);
      expect(q('a', pass).filter((a) => attr(a, 'href') === lead.trip.wholeHref && /Whole trip/.test(textOf(a)))).toHaveLength(1);
      expect(q('.dep-stops > li', pass)).toHaveLength(lead.laterToday.length);
      expect(q('.dep-nextstop', pass)).toHaveLength(lead.nextStop ? 1 : 0);
      expect(textOf(pass)).toContain(lead.endText);
    }
  });

  it('3. next departure: the pass with its countdown, route and facts', () => {
    expect(q('#dep-next-h')).toHaveLength(ready ? 1 : 0);
    const passes = q('.dep-pass--next');
    expect(idsOf(passes)).toEqual(model.next ? [model.next.trip.id] : []);
    for (const pass of passes) {
      const { next } = model;
      expect(q('[data-flap]', pass).map((el) => attr(el, 'data-flap'))).toEqual([String(next.daysToGo)]);
      expect(textOf(one('.dep-countline', pass))).toContain('to departure');
      expect(q('.ui-route', pass)).toHaveLength(1);
      expect(page.text('.dep-facts dt', pass).slice(0, 4)).toEqual(['Departs', 'Returns', 'Length', 'Travellers']);
      expect(textOf(one('.dep-facts', pass))).toContain(next.departText);
      expect(q('.ui-ready-row', pass)).toHaveLength(next.todo.length);
      const open = q('a.trip-card-link', pass);
      expect(open.map(textOf)).toEqual([`Open ${next.trip.title}`]);
    }
  });

  it('4. your trips: search, filters, then a board for each group that has plans', () => {
    expect(q('#dep-trips-h')).toHaveLength(ready ? 1 : 0);
    expect(q('[data-trip-search]')).toHaveLength(ready ? 1 : 0);
    expect(q('[data-filter]').map((el) => attr(el, 'data-filter'))).toEqual(ready ? ['all', 'live', 'upcoming', 'past', 'shared'] : []);
    const { sections } = model;
    const board = (name) => one(`[data-key="board-${name}"]`);
    const rows = (name, selector) => (board(name) ? idsOf(q(selector, board(name))) : null);
    expect(rows('live', '.dep-drow')).toEqual(ready && sections.live.length ? sections.live.map((c) => c.id) : null);
    expect(rows('upcoming', '.dep-drow')).toEqual(ready && sections.upcoming.length ? sections.upcoming.map((c) => c.id) : null);
    expect(rows('undated', '.dep-lrow')).toEqual(ready && sections.undated.length ? sections.undated.map((c) => c.id) : null);
    expect(rows('past', '.dep-lrow')).toEqual(ready && sections.past.length ? sections.past.map((c) => c.id) : null);
    expect(rows('progress', '[data-trip-state]')).toEqual(ready && sections.inProgress.length ? sections.inProgress.map((c) => c.id) : null);
  });

  it('4. the live and upcoming boards are tables with named columns', () => {
    const tables = q('[role="table"]');
    const wanted = ready ? ['live', 'upcoming'].filter((name) => model.sections[name].length) : [];
    expect(tables).toHaveLength(wanted.length);
    for (const table of tables) {
      const heads = page.text('[role="columnheader"]', table);
      expect(heads).toHaveLength(7);
      expect(heads.slice(2)).toEqual(expect.arrayContaining(['Destination', 'Length', 'Activities estimated']));
      for (const row of q('.dep-drow', table)) {
        expect(attr(row, 'role')).toBe('row');
        expect(q('[role="cell"]', row)).toHaveLength(7);
        expect(row.children.filter((child) => child.tag).every((child) => attr(child, 'role') === 'cell')).toBe(true);
      }
    }
    if (wanted.includes('upcoming')) {
      const heads = page.text('[role="columnheader"]', one('[data-key="board-upcoming"]'));
      expect(heads).toEqual(['Departs', 'Photo', 'Destination', 'Departs in', 'Length', 'Activities estimated', 'Readiness']);
      expect(textOf(one('[data-key="board-upcoming"]'))).toContain('Soonest first. Costs are per person, activities only.');
    }
  });

  it('4. every board that prints a cost says the cost is per person', () => {
    for (const board of q('.dep-board')) {
      if (find(board, '.dep-d-cost, .dep-l-cost').length) expect(textOf(find(board, '.dep-board-top')[0])).toMatch(/per person, activities only/);
    }
  });

  it('5. past plans: every row is in the markup, with the toggle while nothing is filtered', () => {
    const total = model.sections.past.length;
    const toggle = q('[data-action="show-all-past"]');
    expect(toggle).toHaveLength(ready && !model.filter.expanded && total > 6 ? 1 : 0);
    if (toggle.length) expect(textOf(toggle[0])).toBe(`Show all ${total} past plans`);
    const log = one('[data-key="board-past"] .dep-log');
    if (log) expect(classesOf(log).includes('dep-log--all')).toBe(model.filter.expanded || total <= 6);
  });

  it('6. travel stats: four numbers, the rows, the countries', () => {
    const stats = q('[data-region="stats"]');
    expect(stats).toHaveLength(ready && model.stats.trips > 0 ? 1 : 0);
    if (!stats.length) return;
    const { trips, countries, cities, daysPlanned, byCountry } = model.stats;
    expect(page.text('.dep-fig-n', stats[0])).toEqual([trips, countries, cities, daysPlanned].map(String));
    expect(page.text('.dep-fig-l', stats[0])).toEqual(['plans', 'countries', 'cities', 'days planned']);
    expect(page.text('.dep-splits dt', stats[0])).toEqual(expect.arrayContaining(['Calendar days covered', 'Most planned', 'Longest']));
    expect(page.text('.dep-splits dt', stats[0]).includes('Activities planned')).toBe(model.stats.spendHome !== null);
    expect(q('.dep-stamp', stats[0])).toHaveLength(byCountry.length);
  });

  it('7. short hops from the home city', () => {
    const region = q('[data-region="hops"]');
    expect(region).toHaveLength(model.hops.length ? 1 : 0);
    if (!region.length) return;
    expect(attr(region[0], 'data-keep-scroll') !== null).toBe(ready); // the rail scrolls sideways, the short list does not
    const cities = q('[data-action="plan-city"]', region[0]).map((el) => attr(el, 'data-city'));
    expect(cities).toEqual((ready ? model.hops : model.hops.slice(0, 3)).map((hop) => hop.name));
    expect(textOf(one('#dep-hops-h'))).toContain(`from ${model.user.homeCity}`);
  });

  it('8. the foot: the estimate and typical-weather note, and the credits', () => {
    const foot = q('.dep-foot');
    expect(foot).toHaveLength(model.state === 'error' ? 0 : 1);
    if (!foot.length) return;
    expect(textOf(foot[0])).toMatch(/per person[\s\S]*not a forecast/);
    expect(q('.ui-credits', foot[0])).toHaveLength(ready && model.credits.length ? 1 : 0); // the empty page draws no photo
  });
});

describe('departures dashboard, the states', () => {
  it('a plan still being planned: progress with a day total, and without one', () => {
    const known = draw('generating');
    const card = known.one('[data-trip-id="s-dublin"]');
    expect(attr(card, 'data-trip-state')).toBe('generating');
    expect(textOf(card)).toContain('4 of 9 days planned');
    expect(textOf(card)).toContain('about 3 minutes to go');
    expect(known.q('[data-action="notify-ready"]', card)).toHaveLength(1);
    expect(known.q('.ui-segs', card)).toHaveLength(1);
    expect(known.q('.dep-card-meta', card).map(textOf)).toEqual(['10 to 18 Jun 2027']);
    const open = draw('generatingNoDates');
    const loose = open.one('[data-trip-id="s-dublin"]');
    expect(textOf(loose)).toContain('4 days planned so far');
    expect(open.q('.ui-segs', loose)).toHaveLength(0);
    expect(open.q('.dep-card-meta', loose)).toHaveLength(0);
  });

  it('a plan in progress reads in the order it is drawn: title, status, dates, then the rest', () => {
    for (const [key, id] of [['generating', 's-dublin'], ['failed', 's-istanbul'], ['failedShared', 's-istanbul']]) {
      const page = draw(key);
      const card = page.one(`[data-trip-id="${id}"]`);
      const order = page.q('.dv-card-title,.dv-card-status,.dep-card-meta', card).map((el) => classesOf(el)[0]);
      expect(order, key).toEqual(['dv-card-title', 'dv-card-status', 'dep-card-meta']);
      expect(page.q('.dep-srow > .dv-card')).toHaveLength(1);
    }
  });

  it('planning stopped: try again, and delete only on a plan of your own', () => {
    const own = draw('failed');
    const card = own.one('[data-trip-id="s-istanbul"]');
    expect(textOf(card)).toContain('Planning stopped after 6 of 9 days.');
    expect(own.q('[data-retry-trip="s-istanbul"]', card)).toHaveLength(1);
    expect(own.q('[data-delete-trip="s-istanbul"]', card)).toHaveLength(1);
    const shared = draw('failedShared');
    expect(shared.q('[data-retry-trip="s-istanbul"]')).toHaveLength(1);
    expect(shared.q('[data-delete-trip]')).toHaveLength(0);
  });

  it('a shared plan says what you can do, never who shared it', () => {
    const viewer = draw('sharedViewer');
    expect(viewer.text('[data-trip-id="s-porto"] .dep-shared')).toEqual(['Shared with you. You can view it.']);
    expect(draw('sharedEditor').text('[data-trip-id="s-porto"] .dep-shared')).toEqual(['Shared with you. You can edit.']);
    expect(draw('ready').q('.dep-shared')).toHaveLength(0);
  });

  it('the load error is an alert and draws no plan; the stale list is a status above the plans', () => {
    const error = draw('error');
    expect(error.q('[role="alert"] [data-action="retry-trips"]')).toHaveLength(1);
    expect(error.q('[data-trip-id]')).toHaveLength(0);
    const stale = draw('stale');
    expect(stale.q('[role="status"] [data-action="retry-trips"]')).toHaveLength(1);
    expect(textOf(stale.one('.dv-stale'))).toMatch(/saved on this device on \w{3} \d{1,2} Mar at \d{1,2}:\d{2} [AP]M/);
    expect(draw('ready').q('.dv-stale')).toHaveLength(0);
  });

  it('the empty dashboard: plan your first trip, import, the hint, a short list of hops', () => {
    const empty = draw('empty');
    expect(empty.text('[data-action="new-trip"]')).toEqual(['Plan your first trip']);
    expect(empty.text('[data-action="import-trip"]')).toEqual(['Import a trip']);
    expect(textOf(empty.one('.dep-empty'))).toContain('Import reads an itinerary you already have');
    expect(empty.q('[data-trip-id]')).toHaveLength(0);
    expect(empty.q('[data-slot="chooser"]')).toHaveLength(0);
  });

  it('a plan without a cover keeps its place with the placeholder', () => {
    const page = draw('noCover');
    const pass = page.one('.dep-pass--next');
    expect(attr(page.one('.ui-frame', pass), 'data-frame')).toBe('none');
    expect(page.q('img.ui-frame-img', pass)).toHaveLength(0);
    const row = page.one('.dep-lrow[data-trip-id="s-sintra"]'); // a past plan at a place the catalogue does not know
    expect(attr(page.one('.ui-thumb', row), 'data-frame')).toBe('none');
  });

  it('a plan without dates sits on its own board and has no countdown', () => {
    const page = draw('noDates');
    const row = page.one('[data-key="board-undated"] [data-trip-id="s-florence"]');
    expect(textOf(row)).toContain('No dates yet');
    expect(page.q('[data-flap]', row)).toHaveLength(0);
  });

  it('a plan in the home city draws the home route', () => {
    const page = draw('homeCity');
    expect(attr(page.one('.dep-pass--next .ui-route'), 'data-kind')).toBe('home');
  });

  it('no home currency, or no rate: the local figure alone, never "about"', () => {
    const page = draw('noHomeCurrency');
    expect(page.text('.dep-d-cost').join(' ')).not.toMatch(/about/);
    expect(page.text('.dep-d-cost').join(' ')).toContain('MAD 4,200');
    expect(draw('ready').text('.dep-drow[data-trip-id="s-marrakech"] .dep-d-cost').join(' ')).toMatch(/about €390[\s\S]*MAD 4,200/);
  });

  it('a briefing still pending: every card of the plan is marked and holds its space', () => {
    const page = draw('briefingPending');
    const marked = page.q('[data-briefing="pending"]');
    expect(new Set(idsOf(marked))).toEqual(new Set(['s-seville', 's-marrakech', 's-vancouver', 's-buenos-aires']));
    const pass = page.one('.dep-pass--live');
    expect(page.q('.dep-reserve', pass).length).toBeGreaterThanOrEqual(1);
    expect(page.q('.dep-nextstop', pass)).toHaveLength(0);
    expect(page.q('a[data-now-trip="s-seville"]', pass)).toHaveLength(1);
    expect(page.q('.dep-drow[data-trip-id="s-marrakech"] .dep-reserve')).toHaveLength(1);
    expect(draw('ready').q('.dep-reserve')).toHaveLength(0);
  });

  it('the next departure is tagged on its board row', () => {
    const page = draw('ready');
    expect(page.text('.dep-drow[data-trip-id="s-marrakech"] .dep-tag')).toEqual(['Next']);
    expect(page.q('.dep-drow[data-trip-id="s-vancouver"] .dep-tag')).toHaveLength(0);
  });

  it('the lead cover is eager and first in line; the rest wait', () => {
    const page = draw('ready');
    const lead = page.one('.dep-pass--live img.ui-frame-img');
    expect(attr(lead, 'fetchpriority')).toBe('high');
    expect(attr(lead, 'loading')).toBeNull();
    expect(attr(page.one('.dep-pass--next img.ui-frame-img'), 'loading')).toBe('lazy');
  });
});

describe('departures dashboard, what a patch can reach (ruling R41)', () => {
  // The controller patches regions and replaces the whole root when anything outside them changes.
  // The facts that change when a plan finishes, is imported or goes live must all sit in a region.
  /** The markup outside the regions, as the controller compares it: each region is cut down to its name. */
  function frameOf(html) {
    const open = /<(\w+)[^>]* data-region="([\w-]+)"[^>]*>/g;
    let out = '';
    let at = 0;
    for (let found = open.exec(html); found; found = open.exec(html)) {
      const [, tag, name] = found;
      const step = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
      step.lastIndex = open.lastIndex;
      let depth = 1;
      let end = html.length;
      for (let part = step.exec(html); part; part = step.exec(html)) {
        depth += part[0].startsWith('</') ? -1 : 1;
        if (depth === 0) { end = step.lastIndex; break; }
      }
      out += `${html.slice(at, found.index)}{${name}}`;
      at = end;
      open.lastIndex = end;
    }
    return out + html.slice(at);
  }
  it.each(READY)('fixture %s: the summary, the section counts and the next departure date are regions', (key) => {
    const page = draw(key);
    for (const name of ['greeting', 'today', 'summary', 'now-count', 'next-date', 'trips-count']) expect(page.q(`[data-region="${name}"]`), name).toHaveLength(1);
    expect(page.q('[data-region="hops-count"]')).toHaveLength(page.model.hops.length ? 1 : 0);
    expect(textOf(page.one('[data-region="trips-count"]'))).toBe(String(page.model.counts.all));
    expect(textOf(page.one('[data-region="now-count"]'))).toBe(page.model.live.length ? String(page.model.live.length) : '');
    expect(textOf(page.one('[data-region="next-date"]'))).toBe(page.model.next?.departText ?? '');
    expect(textOf(page.one('[data-region="today"]'))).toBe(page.model.now.dateText);
    const names = page.q('[data-region]').map((el) => attr(el, 'data-region'));
    expect(names.length).toBe(new Set(names).size);
  });
  it('a plan that goes live, finishes or is added changes nothing outside the regions', () => {
    const { ready, noLive, twoLive } = DASHBOARD_FIXTURES;
    const frame = (model) => frameOf(renderDashboard(model, STILL));
    expect(frame(ready)).toContain('{summary}');
    expect(frame(ready)).not.toMatch(/data-region|Marrakech|Seville/);
    expect(frame(twoLive)).toBe(frame(ready));
    expect(frame(noLive)).toBe(frame(ready));
    expect(frame({ ...ready, counts: { ...ready.counts, all: ready.counts.all + 1 }, next: { ...ready.next, departText: 'Mon 1 Jan 2029', daysToGo: 400 } })).toBe(frame(ready));
  });
  it('the summary is a sentence of its own after the date: no full stop is glued to the date', () => {
    const page = draw('twoLive');
    expect(textOf(page.one('.dep-hello-sum'))).toBe('Two trips are happening now, and Marrakech and the Atlas foothills departs in 9 days.');
    expect(textOf(page.one('.dep-hello-sub'))).not.toMatch(/\d{4}\.|[a-z]\.[A-Z]/);
  });
  it('a ready page with nothing to say keeps the summary region, empty', () => {
    const { ready } = DASHBOARD_FIXTURES;
    const page = parseHtml(renderDashboard({ ...ready, live: [], next: null }, STILL)).root;
    expect(all(page, '[data-region="summary"]').map(textOf)).toEqual(['']);
    expect(all(page, '[data-region="next-date"]').map(textOf)).toEqual(['']);
  });
});

describe('departures dashboard, motion and mounting', () => {
  it('marks entry motion only on a first render', () => {
    expect(draw('ready').q('.dep-enter').length).toBeGreaterThan(0);
    expect(draw('ready', STILL).q('.dep-enter')).toHaveLength(0);
    expect(draw('ready', STILL).q('[data-fade]')).toHaveLength(0);
  });
  it('leaves entry motion out for people who asked for less motion', () => {
    const calm = draw('ready', Object.freeze({ ...CTX_FIXTURE, reducedMotion: true }));
    expect(calm.q('.dep-enter')).toHaveLength(0);
    expect(calm.q('[data-fade]')).toHaveLength(0);
  });
  it('keeps entry motion out of the regions, so a patch has nothing to undo', () => {
    const first = draw('ready');
    for (const region of first.q('[data-region]')) expect(first.q('.dep-enter', region)).toHaveLength(0);
  });
  it('mounts without a document when there is no clock to tick', () => {
    const cleanups = [];
    const root = { querySelectorAll: () => [] };
    expect(() => mountDashboard(root, DASHBOARD_FIXTURES.empty, { ...CTX_FIXTURE, onCleanup: (fn) => cleanups.push(fn) })).not.toThrow();
    expect(cleanups).toEqual([]);
  });
});

// --- The clocks: a stand-in for the two elements a clock is made of (Vitest has no DOM here) --------

/** A clock element as the renderer draws it, holding the face a tick rewrites. */
function fakeClock(timeZone, label) {
  const face = { attrs: { 'aria-label': label }, innerHTML: '', getAttribute(name) { return this.attrs[name] ?? null; }, setAttribute(name, value) { this.attrs[name] = value; } };
  return { face, getAttribute: (name) => (name === 'data-dep-clock' ? timeZone : null), querySelector: () => face };
}
const rootOf = (...clocks) => ({ querySelectorAll: () => clocks });

describe('the clocks of the greeting row', () => {
  afterEach(() => vi.useRealTimers());

  it('are drawn from the model instant, in the trip zone and the home zone', () => {
    const page = draw('ready');
    const faces = page.q('[data-dep-clock] [data-dep-clock-face]').map((el) => attr(el, 'aria-label'));
    expect(faces).toEqual(['10:10 AM', '9:10 AM']); // Seville (Europe/Madrid) and Lisbon at 09:10 UTC
    expect(page.text('[data-dep-clock] .dep-lbl')).toEqual(['Seville, on this trip', 'Lisbon, home']);
  });

  it('a tick rewrites a face only when its minute has changed', () => {
    const madrid = fakeClock('Europe/Madrid', '10:10 AM');
    const lisbon = fakeClock('Europe/Lisbon', '9:10 AM');
    tickClocks(rootOf(madrid, lisbon), '2027-03-10T09:10:40+00:00');
    expect([madrid.face.innerHTML, lisbon.face.innerHTML]).toEqual(['', '']);
    tickClocks(rootOf(madrid, lisbon), '2027-03-10T09:11:00+00:00');
    expect(madrid.face.attrs['aria-label']).toBe('10:11 AM');
    expect(lisbon.face.attrs['aria-label']).toBe('9:11 AM');
    expect(madrid.face.innerHTML).toContain('data-flap="11"');
  });

  it('a clock whose zone cannot be read is left as it is', () => {
    const broken = fakeClock('Mars/Olympus', '1:00 PM');
    tickClocks(rootOf(broken), '2027-03-10T09:11:00+00:00');
    expect(broken.face.attrs['aria-label']).toBe('1:00 PM');
  });

  it('mounting ticks from the model instant plus the time that has passed, and stops on cleanup', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z')); // the device clock is not what the clocks show
    const clock = fakeClock('Europe/Lisbon', '9:10 AM');
    const cleanups = [];
    mountDashboard(rootOf(clock), DASHBOARD_FIXTURES.ready, { ...CTX_FIXTURE, onCleanup: (fn) => cleanups.push(fn) });
    expect(cleanups).toHaveLength(1);
    vi.advanceTimersByTime(60_000);
    expect(clock.face.attrs['aria-label']).toBe('9:11 AM');
    cleanups[0]();
    vi.advanceTimersByTime(120_000);
    expect(clock.face.attrs['aria-label']).toBe('9:11 AM');
  });
});
