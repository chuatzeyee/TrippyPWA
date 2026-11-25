// The Concierge dashboard on every model fixture: the sections of its task table are there for the
// states that have them and absent for the others. Written before the renderer.
import { describe, it, expect } from 'vitest';
import { DASHBOARD_FIXTURES, CTX_FIXTURE } from '../fixtures/models.js';
import { checkDashboardHtml } from '../fixtures/checks/dashboard-contract.js';
import { all, attr, classesOf, isInside, parseHtml, textOf } from '../fixtures/checks/html-tree.js';
import { briefingSentence } from './briefing.js';
import { renderDashboard, mountDashboard } from './dashboard.js';

const D = DASHBOARD_FIXTURES;
const KEYS = Object.keys(D);
const QUIET = Object.freeze({ ...CTX_FIXTURE, animate: false });
const STILL = Object.freeze({ ...CTX_FIXTURE, reducedMotion: true });
const tree = (key, ctx = CTX_FIXTURE) => parseHtml(renderDashboard(D[key], ctx)).root;
const squeeze = (text) => text.replace(/\s+/g, '');
const one = (root, selector) => { const found = all(root, selector); expect(found, selector).toHaveLength(1); return found[0]; };
const shown = (root, selector) => all(root, selector).filter((el) => attr(el, 'hidden') === null);
const tripIds = (root, selector) => all(root, selector).map((el) => attr(el, 'data-trip-id'));

describe.each(KEYS)('fixture %s', (key) => {
  const model = D[key];
  const root = tree(key);

  it('keeps the dashboard contract', () => {
    expect(checkDashboardHtml(renderDashboard(model, CTX_FIXTURE), model)).toEqual([]);
  });

  it('leads with the dateline and the briefing sentence as the h1', () => {
    expect(textOf(one(root, 'p.con-dateline'))).toBe('Wednesday 10 March 2027');
    const h1 = one(root, 'h1.con-say');
    expect(squeeze(textOf(h1))).toBe(squeeze(briefingSentence(model).map((part) => part.text).join('')));
    const hrefs = all(h1, 'a').map((a) => attr(a, 'href'));
    expect(hrefs).toEqual(briefingSentence(model).filter((part) => part.href).map((part) => part.href));
    expect(all(h1, '[data-region="lead"]')).toHaveLength(model.state === 'ready' ? 1 : 0);
  });

  it('offers Plan a trip and Import a trip at the top and in the phone position', () => {
    const top = one(root, '.con-actions--top');
    expect(all(top, '[data-action="new-trip"]')).toHaveLength(1);
    expect(all(top, '[data-action="import-trip"]')).toHaveLength(1);
    const below = one(root, '.con-actions--below');
    expect(all(below, '[data-action="new-trip"]')).toHaveLength(1);
    expect(all(below, '[data-action="import-trip"]')).toHaveLength(1);
  });

  it('draws Happening now only while a plan runs', () => {
    const live = shown(root, 'section.con-now');
    if (model.state !== 'ready' || !model.live.length) {
      expect(live).toHaveLength(0);
      expect(all(root, '.con-lead')).toHaveLength(0);
      return;
    }
    expect(live).toHaveLength(1);
    expect(textOf(one(live[0], 'h2'))).toContain('Happening now');
    expect(tripIds(root, 'article.con-lead')).toEqual([model.live[0].trip.id]);
    expect(tripIds(root, 'article.con-also')).toEqual(model.live.slice(1).map((briefing) => briefing.trip.id));
    const lead = one(root, 'article.con-lead');
    const { trip, dayNumber, dayCount } = model.live[0];
    expect(squeeze(textOf(one(lead, '.con-lead-day')))).toBe(`Day${dayNumber}of${dayCount}`);
    expect(all(lead, '.ui-segs')).toHaveLength(1);
    expect(all(lead, '.ui-seg')).toHaveLength(dayCount);
    expect(attr(one(lead, 'a[data-now-trip]'), 'href')).toBe(trip.todayHref);
    const whole = all(lead, 'a').filter((a) => /See the whole trip/.test(textOf(a)));
    expect(whole.map((a) => attr(a, 'href'))).toEqual([trip.wholeHref]);
    expect(all(lead, 'dt').map(textOf)).toEqual(['Today', 'Next stop', 'Tonight', 'Typical weather']);
    // The count and the explaining line are for two or more.
    expect(all(live[0], '.con-n')).toHaveLength(model.live.length > 1 ? 1 : 0);
    expect(all(one(live[0], '.con-sec-head'), 'p')).toHaveLength(model.live.length > 1 ? 1 : 0);
  });

  it('draws the finder in the ready state only', () => {
    expect(all(root, '.dv-filter')).toHaveLength(model.state === 'ready' ? 1 : 0);
    expect(all(root, '[data-trip-search]')).toHaveLength(model.state === 'ready' ? 1 : 0);
    expect(all(root, '[data-filter]')).toHaveLength(model.state === 'ready' ? 5 : 0);
  });

  it('draws Upcoming with the next departure first, then the other plans', () => {
    const lead = model.state === 'ready' && model.next && model.sections.upcoming.some((card) => card.id === model.next.trip.id) ? model.next : null;
    expect(shown(root, 'section.con-up')).toHaveLength(lead ? 1 : 0);
    expect(tripIds(root, 'article.con-next')).toEqual(lead ? [lead.trip.id] : []);
    const others = model.state === 'ready' ? [...model.sections.upcoming.filter((card) => card.id !== lead?.trip.id), ...model.sections.undated] : [];
    expect(tripIds(root, 'article.con-up-card')).toEqual(others.map((card) => card.id));
    if (!lead) return;
    const next = one(root, 'article.con-next');
    expect(textOf(one(next, '.con-kicker'))).toBe('Next departure');
    expect(squeeze(textOf(one(next, '.con-count')))).toBe(`${lead.daysToGo}${lead.daysToGo === 1 ? 'daytogo' : 'daystogo'}`);
    expect(all(next, '.con-todo')).toHaveLength(lead.trip.readiness || lead.trip.briefingPending ? 1 : 0);
    if (lead.trip.readiness) {
      expect(textOf(one(next, 'h4.con-todo-title'))).toBe('Before you leave');
      expect(all(next, '.ui-ready-row')).toHaveLength(lead.todo.length);
      expect(all(next, '.con-settled')).toHaveLength(lead.settled.length ? 1 : 0);
    }
  });

  it('draws the plans still being planned as cards with no link', () => {
    const planning = model.state === 'ready' ? model.sections.inProgress : [];
    expect(tripIds(root, 'article.con-plan-card')).toEqual(planning.map((card) => card.id));
  });

  it('draws the stats sentence, the past plans by month, the short hops and the foot when there is something to say', () => {
    const ready = model.state === 'ready';
    expect(all(root, '[data-region="stats"]')).toHaveLength(ready && model.stats.trips > 0 ? 1 : 0);
    const months = all(root, '.con-month');
    expect(months.map((el) => attr(el, 'data-key'))).toEqual(ready ? model.pastByMonth.map((group) => `past-${group.key}`) : []);
    expect(tripIds(root, 'article.con-prow')).toEqual(ready ? model.sections.past.map((card) => card.id) : []);
    expect(shown(root, 'section.con-past')).toHaveLength(ready && model.sections.past.length ? 1 : 0);
    expect(all(root, '[data-region="hops"]')).toHaveLength(model.hops.length ? 1 : 0);
    expect(all(root, 'li.con-hop')).toHaveLength(model.hops.length);
    expect(all(root, 'footer.con-foot')).toHaveLength(model.state === 'error' ? 0 : 1);
  });

  it('keeps the two latest months open and folds the older ones that hold several plans, unless a filter is on', () => {
    const months = all(root, '.con-month');
    months.forEach((el, i) => {
      // A month with one plan is its row: a fold with its summary and its button would be longer than the row.
      const plain = !model.filter.expanded && (i < 2 || model.pastByMonth[i].trips.length === 1);
      expect(el.tag, attr(el, 'data-key')).toBe(plain ? 'div' : 'details');
      if (el.tag === 'details') expect(attr(el, 'open') !== null).toBe(Boolean(model.filter.expanded));
    });
  });

  it('offers "Show all past plans" only while a month is folded', () => {
    const ready = model.state === 'ready';
    const folded = ready && !model.filter.expanded && model.pastByMonth.some((group, i) => i >= 2 && group.trips.length > 1);
    expect(all(root, '.con-past-more')).toHaveLength(folded ? 1 : 0);
  });

  it('has no entry motion when the context says so, and is the same string twice', () => {
    expect(all(tree(key, QUIET), '.con-enter')).toHaveLength(0);
    expect(all(tree(key, STILL), '.con-enter')).toHaveLength(0);
    expect(all(root, '.con-enter').length).toBeGreaterThan(0);
    expect(renderDashboard(model, CTX_FIXTURE)).toBe(renderDashboard(model, CTX_FIXTURE));
  });
});

describe('states', () => {
  it('ready: the chooser slot follows the brief, and one plan runs without a count', () => {
    const root = tree('ready');
    one(root, '[data-slot="chooser"]');
    const up = one(root, 'section.con-up');
    expect(textOf(one(up, 'h2'))).toContain('Upcoming');
    expect(textOf(one(up, '.con-n'))).toBe('3');
    expect(textOf(one(up, '.con-sec-head'))).toContain('Soonest first.');
    expect(all(one(root, 'section.con-now'), '.con-n')).toHaveLength(0);
  });

  it('two live plans: a count, one explaining line and a row for the second plan', () => {
    const root = tree('twoLive');
    const now = one(root, 'section.con-now');
    expect(textOf(one(now, '.con-n'))).toBe('2');
    expect(textOf(one(now, '.con-sec-head'))).toContain('Two plans cover today. The one you opened last leads.');
    const also = one(root, 'article.con-also');
    expect(textOf(also)).toContain('Day 3 of 9 on this plan too, to Tue 16 Mar.');
    expect(textOf(also)).toContain('Shared with you. You can view it.');
    expect(attr(one(also, 'a[data-now-trip]'), 'href')).toBe('#/trip/s-kyoto?today=1');
  });

  it('the live rows read from the briefing: today, the next stop, tonight and typical weather', () => {
    const lead = one(tree('ready'), 'article.con-lead');
    const rows = all(lead, 'dd').map(textOf);
    expect(rows[0]).toBe('The Alcázar and Triana');
    expect(squeeze(rows[1])).toBe(squeeze('11:30 AM Royal Alcázar gardens'));
    expect(squeeze(rows[2])).toBe(squeeze('8:30 PM Flamenco night'));
    expect(rows[3]).toBe('12 to 23°C, sunny');
  });

  it('a pending briefing reserves its rows, its chips and the last clause of the sentence', () => {
    const root = tree('briefingPending');
    expect(attr(one(root, 'article.con-lead'), 'data-briefing')).toBe('pending');
    expect(all(one(root, 'article.con-lead'), 'dt')).toHaveLength(4);
    expect(all(one(root, 'article.con-lead'), '.con-ghost').length).toBeGreaterThanOrEqual(4);
    expect(attr(one(root, 'article.con-next'), 'data-briefing')).toBe('pending');
    expect(all(root, 'article.con-up-card').every((el) => attr(el, 'data-briefing') === 'pending')).toBe(true);
    const reserve = one(root, 'p.con-say-reserve');
    expect(attr(reserve, 'aria-hidden')).toBe('true');
    expect(textOf(reserve)).toMatch(/with three things to settle first\.$/);
    expect(all(tree('ready'), 'p.con-say-reserve')).toHaveLength(0);
    expect(all(tree('ready'), '[data-briefing]')).toHaveLength(0);
  });

  it('nothing upcoming: no Upcoming section, the rest stands', () => {
    const root = tree('nothingUpcoming');
    expect(shown(root, 'section.con-up')).toHaveLength(0);
    expect(shown(root, 'section.con-now')).toHaveLength(1);
    expect(shown(root, 'section.con-past')).toHaveLength(1);
  });

  it('no live plan: Plan a trip takes the lead colour', () => {
    const lead = (key) => classesOf(all(one(tree(key), '.con-actions--top'), '[data-action="new-trip"]')[0]).includes('con-btn--cta');
    expect(lead('noLive')).toBe(true);
    expect(lead('ready')).toBe(false);
    expect(lead('empty')).toBe(true);
  });

  it('empty: the welcome, both ways to start and the hop tiles, and nothing else', () => {
    const root = tree('empty');
    expect(textOf(one(root, 'h1'))).toContain('Welcome, Sam.');
    expect(all(root, 'section')).toHaveLength(1);
    expect(classesOf(one(root, 'ul.con-hops'))).toContain('con-hops--compact');
    expect(textOf(root)).toContain('Or start with a short hop from Lisbon.');
    expect(all(root, '[data-trip-id]')).toHaveLength(0);
  });

  it('load error: an alert with Try again, and no list', () => {
    const root = tree('error');
    const alert = one(root, '[role="alert"]');
    expect(all(alert, '[data-action="retry-trips"]')).toHaveLength(1);
    expect(all(root, 'section')).toHaveLength(0);
    expect(all(root, '[data-slot="chooser"]')).toHaveLength(0);
  });

  it('stale list: one status line with Try again, after the chooser slot', () => {
    const root = tree('stale');
    const banner = one(root, '.dv-stale');
    expect(attr(banner, 'role')).toBe('status');
    expect(textOf(banner)).toContain('This list was saved on this device');
    expect(all(banner, '[data-action="retry-trips"]')).toHaveLength(1);
    expect(all(tree('ready'), '.dv-stale')).toHaveLength(0);
  });

  it('generating: progress in numerals, segments and the line that planning carries on', () => {
    const card = one(tree('generating'), 'article.con-plan-card');
    expect(attr(card, 'data-trip-state')).toBe('generating');
    expect(attr(card, 'role')).toBe('status');
    expect(textOf(card)).toContain('Still being planned');
    expect(squeeze(textOf(one(card, '.con-plan-big')))).toBe('4of9daysplanned');
    expect(all(card, '.ui-seg')).toHaveLength(9);
    expect(textOf(card)).toContain('About 3 minutes left. You can leave this page and the planning carries on.');
    expect(all(card, '[data-action="notify-ready"]')).toHaveLength(1);
    expect(all(card, 'a')).toHaveLength(0);
  });

  it('generating without a day total: the days so far, no segments', () => {
    const card = one(tree('generatingNoDates'), 'article.con-plan-card');
    expect(squeeze(textOf(one(card, '.con-plan-big')))).toBe('4daysplannedsofar');
    expect(all(card, '.ui-seg')).toHaveLength(0);
    expect(textOf(card)).toContain('This is taking longer than usual. You can leave this page and the planning carries on.');
  });

  it('failed: Planning stopped, Try again and Delete this trip; no delete on a shared plan', () => {
    const own = one(tree('failed'), 'article.con-plan-card');
    expect(textOf(own)).toContain('Planning stopped');
    expect(textOf(own)).toContain('Planning stopped after 6 of 9 days.');
    expect(textOf(one(own, '[data-retry-trip="s-istanbul"]'))).toBe('Try again');
    expect(textOf(one(own, '[data-delete-trip="s-istanbul"]'))).toBe('Delete this trip');
    const shared = one(tree('failedShared'), 'article.con-plan-card');
    expect(all(shared, '[data-delete-trip]')).toHaveLength(0);
    expect(textOf(shared)).toContain('Shared with you. You can edit it.');
  });

  it('shared plans say what the user may do', () => {
    const card = (key) => all(tree(key), 'article.con-up-card').find((el) => attr(el, 'data-trip-id') === 's-porto');
    expect(textOf(card('sharedViewer'))).toContain('Shared with you. You can view it.');
    expect(textOf(card('sharedEditor'))).toContain('Shared with you. You can edit it.');
  });

  it('nothing shared yet, under the Shared filter', () => {
    const none = { ...D.ready.sections, inProgress: [], live: [], upcoming: [], past: [], undated: [] };
    const model = { ...D.ready, sections: none, pastByMonth: [], filter: { ...D.ready.filter, active: 'shared', expanded: true } };
    const root = parseHtml(renderDashboard(model, CTX_FIXTURE)).root;
    expect(textOf(one(root, '.con-none'))).toContain('Nothing has been shared with you yet.');
    expect(checkDashboardHtml(renderDashboard(model, CTX_FIXTURE), model)).toEqual([]);
    expect(all(tree('ready'), '.con-none')).toHaveLength(0);
  });

  it('a search with no match says so', () => {
    const none = { ...D.ready.sections, inProgress: [], upcoming: [], past: [], undated: [] };
    const model = { ...D.ready, sections: none, pastByMonth: [], filter: { ...D.ready.filter, q: 'zzz', expanded: true } };
    expect(textOf(one(parseHtml(renderDashboard(model, CTX_FIXTURE)).root, '.con-none'))).toContain('No plan matches that search.');
  });

  it('no cover: the designed placeholder with the plan name', () => {
    const root = tree('noCover');
    const next = one(root, 'article.con-next');
    expect(attr(one(next, '.ui-frame'), 'data-frame')).toBe('none');
    expect(all(next, 'img.ui-frame-img')).toHaveLength(0);
  });

  it('no dates: the plan sits with the upcoming ones and says so', () => {
    const card = all(tree('noDates'), 'article.con-up-card').find((el) => attr(el, 'data-trip-id') === 's-florence');
    expect(textOf(card)).toContain('No dates yet');
    expect(textOf(card)).toContain('5 days planned');
    expect(all(card, '.con-count')).toHaveLength(0);
  });

  it('costs: about before a converted figure, per person always, local alone without a home currency', () => {
    const costs = (key) => all(tree(key), '.con-cost').map(textOf);
    expect(costs('ready')).toContain('~€390 per person (MAD 4,200)');
    expect(costs('ready').every((line) => line.includes('per person'))).toBe(true);
    expect(costs('noHomeCurrency').some((line) => line.includes('about'))).toBe(false);
    expect(costs('noHomeCurrency')).toContain('MAD 4,200 per person');
    expect(textOf(one(tree('noHomeCurrency'), 'footer.con-foot'))).not.toContain('EUR');
    expect(textOf(one(tree('ready'), 'footer.con-foot'))).toContain('Amounts in EUR are estimates.');
  });

  it('the stats are one sentence about plans, with the countries by name', () => {
    const stats = one(tree('ready'), '[data-region="stats"]');
    const { trips, countries, daysPlanned, byCountry } = D.ready.stats;
    expect(squeeze(textOf(one(stats, 'h2')))).toBe(squeeze(`${trips} plans, ${countries} countries, ${daysPlanned} days planned.`));
    expect(textOf(stats)).not.toMatch(/\btrips?\b/);
    expect(all(stats, 'img.ui-flag')).toHaveLength(byCountry.length);
    expect(textOf(one(stats, '.con-stats-names'))).toMatch(/^Spain, Morocco, .* and Hungary\.$/);
  });

  it('the photo credits are a region of their own, there with or without a credit, so a new plan is a patch', () => {
    for (const key of KEYS.filter((k) => all(tree(k), 'footer.con-foot').length)) {
      const foot = one(tree(key), 'footer.con-foot');
      const region = one(foot, '[data-region="credits"]');
      expect(all(foot, '.ui-credits').every((el) => isInside(el, '[data-region="credits"]')), key).toBe(true);
      expect(attr(region, 'data-region')).toBe('credits');
    }
    expect(all(one(tree('ready'), '[data-region="credits"]'), '.ui-credits')).toHaveLength(1);
    const bare = parseHtml(renderDashboard({ ...D.ready, credits: [] }, CTX_FIXTURE)).root;
    expect(all(one(bare, '[data-region="credits"]'), '.ui-credits')).toHaveLength(0);
  });

  it('short hops: distance, country and whether the place is new, never a travel time', () => {
    const hops = one(tree('ready'), 'ul.con-hops');
    expect(attr(hops, 'data-keep-scroll')).not.toBeNull();
    const first = all(hops, 'li.con-hop')[0];
    const hop = D.ready.hops[0];
    expect(textOf(first)).toContain(hop.name);
    expect(textOf(first)).toContain(`${hop.country}, ~${hop.km} km`);
    expect(textOf(first)).toContain(hop.note);
    expect(attr(one(first, 'button[data-action="plan-city"]'), 'data-city')).toBe(hop.name);
    expect(textOf(one(tree('ready'), 'section.con-hops-sec'))).toContain('Nearest first. Distances are straight lines from home.');
  });

  it('weather is always called typical', () => {
    for (const key of KEYS) {
      const html = renderDashboard(D[key], CTX_FIXTURE);
      for (const match of html.matchAll(/\d+ to \d+°C[^<]{0,24}/g)) {
        const near = html.slice(Math.max(0, match.index - 220), match.index + match[0].length + 12);
        expect(near, `${key}: ${match[0]}`).toMatch(/typical/i);
      }
    }
  });

  it('mountDashboard binds nothing and returns nothing', () => {
    expect(mountDashboard({}, D.ready, CTX_FIXTURE)).toBeUndefined();
  });
});
