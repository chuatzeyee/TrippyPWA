// The departures trip landing on every model fixture: each part of the task list is there for the
// states that have it and absent for the others. The hook table and escaping are the rule tests'
// business (js/views/view-contract.test.js); this file is about what the view itself draws.
import { describe, expect, it } from 'vitest';
import { TRIP_FIXTURES, CTX_FIXTURE } from '../fixtures/models.js';
import { all, attr, classesOf, parseHtml, textOf } from '../fixtures/checks/html-tree.js';
import { renderTripLanding, mountTripLanding } from './trip.js';

const KEYS = Object.keys(TRIP_FIXTURES);
const PARTS = ['bar', 'hero', 'tabs', 'planIntro', 'between', 'planOutro'];
const STILL = Object.freeze({ ...CTX_FIXTURE, animate: false });

/** Every element under `from` that matches a descendant selector ("#id", ".a .b", ".a > .b" read as descendants). */
function find(from, selector) {
  const steps = selector.trim().split(/\s+(?![^[]*\])/).filter((step) => step !== '>').map((step) => step.replace(/#([\w-]+)/g, '[id="$1"]'));
  return steps.reduce((nodes, step) => [...new Set(nodes.flatMap((node) => all(node, step)))], [from]);
}

function draw(key, ctx = CTX_FIXTURE) {
  const model = TRIP_FIXTURES[key];
  const parts = renderTripLanding(model, ctx);
  const trees = Object.fromEntries(PARTS.map((name) => [name, parseHtml(parts[name])]));
  const q = (part, selector) => find(trees[part].root, selector);
  return {
    model, parts, q, errors: PARTS.flatMap((name) => trees[name].errors),
    one: (part, selector) => q(part, selector)[0] ?? null,
    text: (part, selector) => q(part, selector).map(textOf),
    whole: (selector) => PARTS.flatMap((name) => q(name, selector)),
  };
}
const offers = (model, key) => model.actions.some((action) => action.key === key);

describe.each(KEYS)('departures trip landing, fixture %s', (key) => {
  const page = draw(key);
  const { model, q, one } = page;

  it('returns sound markup, opens no section by itself and has one h1', () => {
    expect(page.errors).toEqual([]);
    expect(page.parts.openSections).toEqual([]);
    expect(page.parts.openSectionsMinWidth).toBe(0);
    expect(page.whole('h1').map(textOf)).toEqual([expect.stringContaining(model.title)]);
  });

  it('bar: Trips, the title with its dates, More, and a slot for the tabs from 1024 px', () => {
    expect(page.text('bar', 'a.tv-back')).toEqual(['Trips']);
    expect(page.text('bar', '.tv-bar-name')).toEqual([model.title]);
    expect(page.text('bar', '.tv-bar-dates')).toEqual(model.dates.text ? [model.dates.text] : []);
    expect(q('bar', '[data-tabs-slot]').map((el) => attr(el, 'data-slot-from'))).toEqual(['1024']);
    expect(q('bar', '[data-menu-open]')).toHaveLength(1);
    expect(q('bar', '.tv-bar-actions button.tv-action').map((el) => attr(el, 'data-action'))).toEqual(['share', 'pdf', 'edit'].filter((name) => offers(model, name)));
  });

  it('hero: the pass with the cover, the title and the status pill', () => {
    const hero = one('hero', '#td-hero');
    expect(classesOf(one('hero', '#td-hero .dep-pass')).includes('dep-pass--trip')).toBe(true);
    expect(find(hero, '[data-carry="cover"]')).toHaveLength(1);
    expect(attr(find(hero, '.ui-frame')[0], 'data-frame')).toBe(model.cover.kind);
    const status = one('hero', '[data-region="hero-status"]');
    expect(find(status, '.dep-hero-pill')).toHaveLength(1);
    expect(find(status, 'h1')).toHaveLength(0);
    const frame = find(hero, '[data-carry="cover"]')[0];
    expect(find(frame, 'h1')).toHaveLength(0); // a carried or swapped frame takes no words with it
    expect(find(frame, '[data-region]')).toHaveLength(0);
  });

  it('hero: a countdown before departure, the day number while live, the day count otherwise', () => {
    const status = one('hero', '[data-region="hero-status"]');
    const flaps = find(status, '[data-flap]').map((el) => attr(el, 'data-flap'));
    const words = textOf(status);
    if (model.phase === 'live') {
      expect(flaps).toEqual([String(model.live.dayNumber)]);
      expect(find(status, '.dep-countline .dep-lbl').map(textOf)).toEqual(['Day']);
      expect(find(status, '.dep-of').map(textOf)).toEqual([`of ${model.live.dayCount}`]);
      expect(find(status, 'button[data-day-jump]').map((el) => [attr(el, 'data-day-jump'), textOf(el)])).toEqual([[String(model.live.dayIndex), 'Open today']]);
    } else if (model.phase === 'upcoming') {
      expect(flaps).toEqual([String(model.daysToGo)]);
      expect(words).toContain(model.daysToGo === 1 ? 'day to departure' : 'days to departure');
      expect(find(status, 'button')).toHaveLength(0);
    } else {
      expect(flaps).toEqual([String(model.dates.dayCount)]);
      expect(words).toContain('days planned');
      expect(words).not.toContain('to departure');
    }
  });

  it('hero: the route line and the facts of the journey', () => {
    // Ruling R41: the route follows the profile (a plan at home has one only once the home city is known),
    // so it sits in the region the controller patches when the profile arrives, never beside it.
    expect(q('hero', '[data-region="hero-status"] .dep-hero-route .ui-route')).toHaveLength(1);
    expect(q('hero', '.dep-pass-stub .ui-route')).toHaveLength(0);
    const labels = page.text('hero', '.dep-facts dt');
    const ends = model.phase === 'past' ? ['Planned start', 'Planned end'] : ['Departs', 'Returns']; // a past plan was planned, not taken
    expect(labels).toEqual(model.dates.start ? [...ends, 'Length', 'Travellers'] : ['Length', 'Travellers']);
  });

  it('hero: the slot of the route is in the region also while the model has no route', () => {
    const bare = renderTripLanding({ ...model, route: null }, CTX_FIXTURE);
    const slot = find(parseHtml(bare.hero).root, '[data-region="hero-status"] .dep-hero-route');
    expect(slot).toHaveLength(1);
    expect(slot[0].children ?? []).toHaveLength(0);
    expect(textOf(slot[0])).toBe('');
  });

  it('hero: the action row holds what the model offers, then More', () => {
    const strip = one('hero', '.dep-strip');
    const inline = ['share', 'pdf', 'edit'].filter((name) => offers(model, name));
    expect(find(strip, 'button[data-action]').map((el) => attr(el, 'data-action'))).toEqual(inline);
    expect(find(strip, '[data-menu-open]').map((el) => attr(el, 'aria-controls'))).toEqual([attr(one('bar', 'dialog'), 'id')]);
    for (const name of ['share', 'pdf', 'edit', 'regenerate', 'delete']) {
      if (!offers(model, name)) expect(page.whole(`[data-action="${name}"]`)).toHaveLength(0);
    }
  });

  it('hero: the facts card leads with the cost and leaves the ready count to the board below', () => {
    const facts = q('hero', '[data-region="glance"] .tv-fact').map((el) => attr(el, 'data-fact'));
    const wanted = ['cost', 'stops', 'weather', 'pace', 'stay'].filter((name) => model.glance.some((fact) => fact.key === name));
    expect(facts).toEqual(wanted);
    if (wanted.includes('cost')) expect(textOf(one('hero', '[data-fact="cost"]'))).toMatch(/per person, activities only/);
    expect(q('hero', '.td-status-slot')).toHaveLength(1);
  });

  it('tabs: the one tab list, with the compact way back', () => {
    expect(q('tabs', '.td-tab').map((el) => attr(el, 'data-tab'))).toEqual(['plan', 'spending', 'prep', 'towns']);
    expect(q('tabs', 'a.tv-tabs-back').map((el) => attr(el, 'href'))).toEqual(['#/']);
  });

  it('planIntro: Before you go as a table while the plan is ahead, one line while it is live', () => {
    const board = q('planIntro', '[data-region="readiness"]');
    expect(board).toHaveLength(model.readiness ? 1 : 0);
    if (!model.readiness) { expect(page.parts.planIntro.trim()).toBe(''); return; }
    expect(textOf(board[0])).toContain('Before you go');
    expect(textOf(board[0])).toContain(model.readiness.headline);
    const tables = find(board[0], '[role="table"]');
    if (model.readiness.collapsed) {
      expect(tables).toHaveLength(0);
      expect(find(board[0], '.dep-gate')).toHaveLength(0);
      return;
    }
    expect(tables).toHaveLength(1);
    expect(find(tables[0], '[role="columnheader"]').map(textOf)).toEqual(['Item', 'Status', 'Next step']);
    const rows = find(tables[0], '.dep-gate');
    expect(rows.map((row) => attr(row, 'data-area'))).toEqual(model.readiness.items.map((item) => item.area));
    const factKeys = q('hero', '.tv-fact').map((el) => attr(el, 'data-key'));
    rows.forEach((row, i) => {
      const item = model.readiness.items[i];
      expect(attr(row, 'data-key')).toBe(`gate-${item.area}`);
      expect(factKeys).not.toContain(attr(row, 'data-key')); // a key names one thing on the page
      expect(attr(row, 'role')).toBe('row');
      expect(find(row, '[role="cell"]')).toHaveLength(3);
      expect(attr(row, 'data-state')).toBe(item.state);
      expect(textOf(row)).toContain(item.label);
      expect(textOf(row)).toContain(item.status);
      const jump = find(row, 'button[data-section-jump]');
      expect(jump.map((el) => [attr(el, 'data-section-jump'), attr(el, 'aria-controls'), attr(el, 'aria-expanded'), textOf(el)]))
        .toEqual([[item.target, `td-section-${item.target}`, 'false', item.actionLabel]]);
      if (item.due) expect(textOf(row)).toContain(`Due ${item.due.text}`);
    });
    expect(textOf(board[0]).includes('Ticks are saved on this device.')).toBe(model.readiness.perDevice);
    // A tick is announced: the count is said in a polite status, and every child of the region is keyed so a patch keeps it.
    expect(find(board[0], 'p.ui-vh[role="status"][data-key="said"]').map(textOf)).toEqual([`Before you go: ${model.readiness.headline}`]);
    expect(board[0].children.filter((child) => child.tag).every((child) => attr(child, 'data-key'))).toBe(true);
  });

  it('between: the trip map board when stops can be placed', () => {
    const placed = model.map.points.length > 0;
    expect(q('between', '.dep-mapboard')).toHaveLength(placed ? 1 : 0);
    expect(q('between', '[data-map-slot]')).toHaveLength(placed ? 1 : 0);
    expect(q('between', '[data-region="map-caption"]')).toHaveLength(placed ? 1 : 0);
    expect(q('between', '[data-map-day="0"]')).toHaveLength(placed ? 1 : 0);
    if (placed) {
      expect(page.text('between', '#dep-map-h')).toEqual(['Trip map']);
      expect(q('between', '.dep-mapboard [data-region="dayindex"] .tv-day-chip')).toHaveLength(model.days.length + 1);
    }
  });

  it('between: the day chips and the Day by day heading whenever the plan has days', () => {
    const days = model.days.length;
    expect(q('between', '[data-region="dayindex"]')).toHaveLength(days ? 1 : 0);
    expect(q('between', '[data-day-jump]').map((el) => attr(el, 'data-day-jump'))).toEqual(model.days.map((row) => String(row.index)));
    expect(page.text('between', '#dep-days-h')).toEqual(days ? ['Day by day'] : []);
    if (!days) { expect(page.parts.between.trim()).toBe(''); return; }
    const top = textOf(one('between', '.dep-dayboard-top'));
    expect(top).toContain(`${days} days`);
    expect(top).toMatch(/typical for the dates, not a forecast/);
    expect(top).toMatch(/per person, activities only/); // the rows print the figure alone, so the heading says what it is
    expect(page.text('between', '.dep-day-head > span')).toEqual(['Day', 'Date', 'Plan', 'Typical weather', 'Stops', 'Activities estimated']);
  });

  it('planOutro: the estimate and typical-weather note, and no credits (the page foot prints them)', () => {
    expect(textOf(one('planOutro', '.dep-foot-note'))).toMatch(/per person[\s\S]*not a forecast/);
    expect(q('planOutro', '.ui-credits')).toHaveLength(0);
    expect(q('planOutro', '.ui-probe')).toHaveLength(1);
  });
});

describe('departures trip landing, the states', () => {
  const pill = (key) => draw(key).text('hero', '.dep-hero-pill')[0];
  it('the pill says where the plan stands', () => {
    expect(pill('upcoming')).toBe('Upcoming, 3 to do');
    expect(pill('tomorrow')).toBe('Tomorrow, 3 to do');
    expect(pill('live')).toBe('Live now, 3 to do');
    expect(pill('past')).toBe('Past plan');
    expect(pill('undated')).toBe('No dates yet, 3 to do');
    expect(pill('generating')).toBe('Still being planned');
    expect(pill('failed')).toBe('Planning stopped');
  });

  it('a live plan shows the next stop, or says that nothing more is planned today', () => {
    const live = draw('live');
    const status = live.one('hero', '[data-region="hero-status"]');
    expect(find(status, '.dep-nextstop time').map(textOf)).toEqual(['11:30 AM']);
    expect(textOf(status)).toContain('Jardin Majorelle');
    expect(textOf(status)).toContain('Next stop at Rue Yves Saint Laurent. 2 more after it.');
    const quiet = draw('liveNoNextStop');
    expect(quiet.q('hero', '.dep-nextstop')).toHaveLength(0);
    expect(textOf(quiet.one('hero', '[data-region="hero-status"]'))).toContain('Nothing more is planned today.');
  });

  it('a viewer gets Export PDF and Reader view, and nothing that changes the plan', () => {
    const page = draw('viewer');
    expect(page.q('hero', '.dep-strip button[data-action]').map((el) => attr(el, 'data-action'))).toEqual(['pdf']);
    expect(page.whole('a').filter((a) => /\/read$/.test(attr(a, 'href') ?? ''))).toHaveLength(1);
    expect(page.whole('[data-action="edit"]')).toHaveLength(0);
  });

  it('an imported plan has no Regenerate and no pace or stay facts', () => {
    const page = draw('imported');
    expect(page.whole('[data-action="regenerate"]')).toHaveLength(0);
    expect(page.q('hero', '[data-fact="pace"]')).toHaveLength(0);
    expect(page.q('hero', '[data-fact="stay"]')).toHaveLength(0);
    expect(page.q('planIntro', '.dep-gate[data-area="reservations"] .dep-due').map((el) => attr(el, 'data-due'))).toEqual(['soon']);
  });

  it('a ground journey and a multi-city plan draw their own route line', () => {
    expect(attr(draw('ground').one('hero', '.ui-route'), 'data-mode')).toBe('train');
    const multi = draw('multiCity');
    expect(attr(multi.one('hero', '.ui-route'), 'data-kind')).toBe('multi');
    expect(textOf(multi.one('hero', 'h1'))).toContain('Vienna, Bratislava & Budapest');
    expect(multi.q('hero', 'h1 img.ui-flag')).toHaveLength(3);
  });

  it('no cover: the placeholder keeps the place of the photo', () => {
    const page = draw('noCover');
    expect(attr(page.one('hero', '.ui-frame'), 'data-frame')).toBe('none');
    expect(page.q('hero', 'img.ui-frame-img')).toHaveLength(0);
    expect(page.q('hero', '[data-carry="cover"]')).toHaveLength(1);
  });

  it('no map points: no board and no slot, and the chips only jump to days', () => {
    const page = draw('noMap');
    expect(page.q('between', '[data-map-day]')).toHaveLength(0);
    expect(page.q('between', '.dep-daychips--jump .tv-day-chip')).toHaveLength(page.model.days.length);
  });

  it('a plan with nothing to show yet keeps the hero and the notes, and draws nothing below', () => {
    for (const key of ['failed', 'empty']) {
      const page = draw(key);
      expect(page.q('hero', '[data-region="glance"]')).toHaveLength(0);
      expect(page.q('hero', '.td-status-slot')).toHaveLength(1);
      expect(page.parts.planIntro.trim()).toBe('');
      expect(page.parts.between.trim()).toBe('');
    }
  });

  it('the entry check still running is a row of its own state', () => {
    const page = draw('entryChecking');
    const row = page.one('planIntro', '.dep-gate[data-area="entry"]');
    expect(attr(row, 'data-state')).toBe('checking');
    expect(textOf(row)).toContain('Checking');
  });

  it('venue photos off changes nothing the landing draws itself', () => {
    const off = draw('photosOff');
    expect(off.q('between', 'img')).toHaveLength(0);
    expect(off.q('hero', 'img.ui-frame-img')).toHaveLength(1);
  });
});

describe('departures trip landing, motion and mounting', () => {
  it('marks entry motion only on a first render, and never inside a region', () => {
    const first = draw('upcoming');
    expect(first.whole('.dep-enter').length).toBeGreaterThan(0);
    for (const region of first.whole('[data-region]')) expect(find(region, '.dep-enter')).toHaveLength(0);
    const again = draw('upcoming', STILL);
    expect(again.whole('.dep-enter')).toHaveLength(0);
    expect(again.whole('[data-fade]')).toHaveLength(0);
    const calm = draw('upcoming', Object.freeze({ ...CTX_FIXTURE, reducedMotion: true }));
    expect(calm.whole('.dep-enter')).toHaveLength(0);
    expect(calm.whole('[data-fade]')).toHaveLength(0);
  });
  it('the hero cover is eager and first in line', () => {
    const img = draw('upcoming').one('hero', 'img.ui-frame-img');
    expect(attr(img, 'fetchpriority')).toBe('high');
    expect(attr(img, 'loading')).toBeNull();
  });
  it('mounts without touching anything: the controller binds every hook', () => {
    expect(() => mountTripLanding({}, TRIP_FIXTURES.upcoming, CTX_FIXTURE)).not.toThrow();
  });
});

describe('departures trip landing, how many stops are left today', () => {
  // The model lists at most three of the later stops (contract: laterToday). The line under the next
  // stop must give the same figure as the dashboard card of the same plan, or no figure at all.
  const base = TRIP_FIXTURES.live;
  const stop = (time, title) => ({ time, title, venue: null });
  const later = [stop('1:30 PM', 'Lunch'), stop('4:00 PM', 'Gardens'), stop('5:15 PM', 'Museum')];
  // The model now always gives the count; `bare` is a today row from before it did (no count, no tonight).
  const bare = { title: base.live.today.title, nextStop: base.live.today.nextStop };
  const lineOf = (today) => {
    const model = { ...base, live: { ...base.live, today: { ...bare, ...today } } };
    return textOf(parseHtml(renderTripLanding(model, STILL).hero).root).replace(/\s+/g, ' ');
  };
  it('counts every stop left when the model says how many there are, and names the time of the last', () => {
    const line = lineOf({ laterToday: later, remainingToday: 8, tonight: stop('6:45 PM', 'Dinner') });
    expect(line).toContain('7 more after it, the last at 6:45 PM');
    expect(line).not.toContain('3 more after it');
  });
  it('states no figure when the list of later stops is full and the model gives no count', () => {
    const line = lineOf({ laterToday: later });
    expect(line).toContain('Next stop at Rue Yves Saint Laurent.');
    expect(line).not.toMatch(/more after it|the last one today|the last at/);
  });
  it('a short list is the whole of it: its length is the count', () => {
    expect(lineOf({ laterToday: later.slice(0, 2) })).toContain('2 more after it, the last at 4:00 PM');
    expect(lineOf({ laterToday: [] })).toContain('Next stop at Rue Yves Saint Laurent, the last one today.');
  });
});

describe('departures trip landing, the estimate on the facts card', () => {
  it('sets "about" apart from the figure of a converted estimate, through the hook of the shared glance', () => {
    const key = KEYS.find((name) => /^~/.test(TRIP_FIXTURES[name].glance.find((fact) => fact.key === 'cost')?.value ?? ''));
    expect(key).toBeTruthy();
    const page = draw(key);
    const value = '[data-region="glance"] .tv-fact[data-fact="cost"] .tv-fact-value';
    expect(page.q('hero', `${value} .tv-fact-about`).map(textOf)).toEqual(['~']);
    expect(page.q('hero', `${value} .tv-fact-figure`)).toHaveLength(1);
    expect(page.q('hero', '.dep-about')).toHaveLength(0);
    expect(textOf(page.one('hero', value)).replace(/\s+/g, '')).toBe(TRIP_FIXTURES[key].glance.find((fact) => fact.key === 'cost').value.replace(/\s+/g, ''));
  });
  it('an exact figure has no such mark', () => {
    for (const key of KEYS) {
      const cost = TRIP_FIXTURES[key].glance.find((fact) => fact.key === 'cost')?.value ?? '';
      if (/^~/.test(cost)) continue;
      expect(draw(key).q('hero', '.tv-fact-about'), key).toHaveLength(0);
    }
  });
});
