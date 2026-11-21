// The decisions of the dashboard controller for views (TASKS F10, blueprint 4.1, 6.8, 7.2). Written
// before the code. The DOM half (mounting, patching, timers, focus) is proven in a browser with the
// frozen stub view. Every plan, name and date here is invented.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { DASHBOARD_FIXTURES, CTX_FIXTURE } from '../views/fixtures/models.js';
import { estimateGenerationMinutes } from '../lib/trip-extras.js';

vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => null, hasLocalSession: () => false, setCachedUser: () => {} }));

const views = await import('./dashboard-views.js');
const { renderSkeleton, rerenderTarget, followsOwnLink } = await import('./dashboard.js');
const {
  chooserVisible, applyGenerationStatus, etaMinutes, leadOrder, canReuseRoot, needsBriefingRefetch, entryInputWithTimeout,
  entryRequest, shownModel, atlasPageHtml, briefingsUntil, atlasJumpId,
} = views;

// Em dash, en dash, middle dot, bullet, ellipsis, arrow: the copy rules.
const BANNED = /[\u2014\u2013\u00b7\u2022\u2026\u2192]/;
const count = (text, part) => text.split(part).length - 1;

describe('the exports other files import', () => {
  it('keeps the four names of the F0 stub', () => {
    for (const name of ['renderDashboardView', 'switchDashboardView', 'onGenerationUpdateForView', 'renderAtlasRoute']) {
      expect(typeof views[name], name).toBe('function');
    }
  });
});

describe('the exports of the last pass', () => {
  it('has a release for a view root that classic replaced in place', () => {
    expect(typeof views.releaseDashboardView).toBe('function');
    expect(() => views.releaseDashboardView()).not.toThrow(); // nothing mounted: nothing to do
  });
});

describe('briefingsUntil (the last day a briefing fetch asks stops for)', () => {
  const card = (start, end) => ({ dates: { start, end } });
  const model = (live, next) => ({ sections: { live }, next: next ? { trip: next } : null });
  it('is the latest end date among the live plans', () => {
    expect(briefingsUntil(model([card('2031-03-01', '2031-03-09'), card('2031-03-04', '2031-03-06')], null))).toBe('2031-03-09');
  });
  it('also covers the next departure, so a plan about to go live is saved with all its stops', () => {
    expect(briefingsUntil(model([], card('2031-03-12', '2031-03-20')))).toBe('2031-03-20');
    expect(briefingsUntil(model([card('2031-03-01', '2031-03-09')], card('2031-03-12', '2031-03-20')))).toBe('2031-03-20');
  });
  it('keeps the live end when the next departure ends before it', () => {
    expect(briefingsUntil(model([card('2031-03-01', '2031-03-30')], card('2031-03-12', '2031-03-20')))).toBe('2031-03-30');
  });
  it('reads a plan without an end date by its start', () => {
    expect(briefingsUntil(model([card('2031-03-01', null)], card('2031-03-12', null)))).toBe('2031-03-12');
    expect(briefingsUntil(model([card('2031-03-01', undefined)], null))).toBe('2031-03-01');
  });
  it('is undefined (the fetch then asks up to tomorrow) when no date is known', () => {
    expect(briefingsUntil(model([], null))).toBeUndefined();
    expect(briefingsUntil(model([card(null, null)], card(null, null)))).toBeUndefined();
    expect(briefingsUntil(null)).toBeUndefined();
    expect(briefingsUntil({})).toBeUndefined();
  });
  it('leaves the model alone', () => {
    const given = model([card('2031-03-04', '2031-03-06'), card('2031-03-01', '2031-03-09')], card('2031-03-12', '2031-03-20'));
    const before = JSON.stringify(given);
    briefingsUntil(given);
    expect(JSON.stringify(given)).toBe(before);
  });
});

describe('atlasJumpId (#/atlas?open=<section>)', () => {
  it('names the passport section for "Open passport"', () => {
    expect(atlasJumpId('#/atlas?open=passport')).toBe('atl-passport');
    expect(atlasJumpId('#/atlas?from=nav&open=passport')).toBe('atl-passport');
  });
  it('is null for the plain page, another route and a section it does not know', () => {
    expect(atlasJumpId('#/atlas')).toBeNull();
    expect(atlasJumpId('#/atlas?open=')).toBeNull();
    expect(atlasJumpId('#/atlas?open=%22%3E%3Cimg')).toBeNull();
    expect(atlasJumpId('#/atlas?open=constructor')).toBeNull();
    expect(atlasJumpId('#/?open=passport')).toBeNull();
    expect(atlasJumpId('#/trip/abc?open=passport')).toBeNull();
    expect(atlasJumpId('')).toBeNull();
    expect(atlasJumpId(undefined)).toBeNull();
  });
});

describe('rerenderTarget (dashboard.js: what a handler draws again when its request returns)', () => {
  it('is the dashboard on the dashboard route', () => {
    expect(rerenderTarget('')).toBe('dashboard');
    expect(rerenderTarget('#/')).toBe('dashboard');
    expect(rerenderTarget('#/?welcome=1')).toBe('dashboard');
  });
  it('is the atlas page on #/atlas, which shares the handlers', () => {
    expect(rerenderTarget('#/atlas')).toBe('atlas');
    expect(rerenderTarget('#/atlas?open=passport')).toBe('atlas');
  });
  it('is nothing on any other route: a page opened while the request ran is never rebuilt', () => {
    for (const hash of ['#/trip/abc', '#/trip/abc?today=1', '#/wizard', '#/wizard/2', '#/settings', '#/atlas/more', '#/profile']) {
      expect(rerenderTarget(hash), hash).toBeNull();
    }
  });
});

describe('followsOwnLink (dashboard.js: "Open today" as a real link)', () => {
  const el = (...matching) => ({ matches: (selector) => matching.includes(selector) });
  it('leaves a real link to the browser, so a new tab does not also move this one', () => {
    expect(followsOwnLink(el('a[href]'))).toBe(true);
  });
  it('still navigates for the button of the classic card', () => {
    expect(followsOwnLink(el())).toBe(false);
    expect(followsOwnLink(null)).toBe(false);
  });
});

describe('renderSkeleton (dashboard.js, blueprint 4.1 edit 8)', () => {
  const classes = (html) => [...html.matchAll(/class="([^"]+)"/g)].map((match) => match[1]);
  it('repeats the two blocks of the static skeleton in index.html, class for class, without the wrapper', () => {
    const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const shell = index.slice(index.indexOf('<div class="app-skel" id="app-shell">'), index.indexOf('</main>'));
    expect(classes(shell)[0]).toBe('app-skel');
    expect(classes(renderSkeleton())).toEqual(classes(shell).slice(1));
  });
  it('keeps what the session wait and the re-render guard look for', () => {
    const html = renderSkeleton();
    expect(html).toContain('skel-card');
    expect(html).toContain('dashboard-merged');
    expect(html).not.toContain('dv-root');
  });
});

describe('chooserVisible', () => {
  const due = { prefs: { viewChooserSeen: false }, rowCount: 3, square: false, state: 'ready', generating: false, remoteState: 'available' };
  it('shows the one-time chooser when every condition of blueprint 6.8 holds', () => {
    expect(chooserVisible(due)).toBe(true);
    expect(chooserVisible({ ...due, rowCount: 1 })).toBe(true);
    expect(chooserVisible({ ...due, remoteState: 'unavailable' })).toBe(true); // the column does not exist: nothing to wait for
  });
  it.each([
    ['it was dismissed', { prefs: { viewChooserSeen: true } }],
    ['there is no plan', { rowCount: 0 }],
    ['the list could not load', { state: 'error' }],
    ['the dashboard is empty', { state: 'empty' }],
    ['a plan is being planned', { generating: true }],
    ['square mode is on', { square: true }],
    ['the server prefs are still awaited', { remoteState: 'unknown' }],
    ['the prefs are missing', { prefs: null }],
  ])('stays away when %s', (_, change) => {
    expect(chooserVisible({ ...due, ...change })).toBe(false);
  });
  it('answers false for no input at all', () => {
    expect(chooserVisible()).toBe(false);
  });
});

describe('applyGenerationStatus', () => {
  const rows = Object.freeze([
    Object.freeze({ id: 'a', status: 'generating', title: 'A' }),
    Object.freeze({ id: 'b', status: 'generating', title: 'B' }),
    Object.freeze({ id: 'c', status: 'generated', title: 'C' }),
  ]);
  it('marks the plan as failed in new rows and leaves the input alone', () => {
    const next = applyGenerationStatus(rows, 'a', { status: 'failed', error: 'Gemini 503' });
    expect(next).not.toBe(rows);
    expect(next.map((row) => row.status)).toEqual(['failed', 'generating', 'generated']);
    expect(next[0]).toEqual({ id: 'a', status: 'failed', title: 'A' });
    expect(next[1]).toBe(rows[1]);
    expect(rows[0].status).toBe('generating');
  });
  it('marks a finished plan as generated', () => {
    expect(applyGenerationStatus(rows, 'b', { status: 'done' })[1]).toEqual({ id: 'b', status: 'generated', title: 'B' });
  });
  it('gives the same rows back when nothing changes', () => {
    expect(applyGenerationStatus(rows, 'a', { status: 'generating', slow: true })).toBe(rows);
    expect(applyGenerationStatus(rows, 'zzz', { status: 'failed' })).toBe(rows);
    expect(applyGenerationStatus(rows, 'a', null)).toBe(rows);
    expect(applyGenerationStatus(rows, 'a', undefined)).toBe(rows);
  });
  it('never turns a plan that is not being planned into a failed one', () => {
    expect(applyGenerationStatus(rows, 'c', { status: 'failed' })).toBe(rows);
  });
  it('reads a missing list as an empty one', () => {
    expect(applyGenerationStatus(null, 'a', { status: 'failed' })).toEqual([]);
  });
});

describe('etaMinutes', () => {
  it('is unknown when the total is unknown', () => {
    expect(etaMinutes(null, 4)).toBeNull();
    expect(etaMinutes(undefined, 0)).toBeNull();
    expect(etaMinutes(0, 0)).toBeNull();
    expect(etaMinutes('many', 2)).toBeNull();
  });
  it('estimates from the days that are left', () => {
    expect(etaMinutes(9, 4)).toBe(estimateGenerationMinutes(5));
    expect(etaMinutes(13, 0)).toBe(estimateGenerationMinutes(13));
    expect(etaMinutes(13, null)).toBe(estimateGenerationMinutes(13));
  });
  it('never estimates for less than one day, also when the counter ran past the total', () => {
    expect(etaMinutes(8, 8)).toBe(estimateGenerationMinutes(1));
    expect(etaMinutes(8, 12)).toBe(estimateGenerationMinutes(1));
    expect(etaMinutes(8, -3)).toBe(estimateGenerationMinutes(8));
  });
});

describe('leadOrder', () => {
  const plan = (id, start, created) => ({ id, start_date: start, created_at: created });
  const ids = (list) => list.map((item) => item.id);
  it('puts the plan opened most recently on this device first', () => {
    const live = [plan('a', '2027-03-08', '2027-01-01T00:00:00Z'), plan('b', '2027-03-01', '2027-01-02T00:00:00Z'), plan('c', '2027-03-09', '2027-01-03T00:00:00Z')];
    expect(ids(leadOrder(live, ['b', 'a']))).toEqual(['b', 'a', 'c']);
    expect(ids(leadOrder(live, [{ id: 'c' }, { id: 'b' }]))).toEqual(['c', 'b', 'a']); // listOfflineTrips() gives objects
  });
  it('then the later start date', () => {
    const live = [plan('a', '2027-03-01', '2027-01-09T00:00:00Z'), plan('b', '2027-03-08', '2027-01-01T00:00:00Z')];
    expect(ids(leadOrder(live, []))).toEqual(['b', 'a']);
    expect(ids(leadOrder(live, ['zzz']))).toEqual(['b', 'a']);
  });
  it('then the later created_at', () => {
    const live = [plan('a', '2027-03-08', '2027-01-01T00:00:00Z'), plan('b', '2027-03-08', '2027-02-01T00:00:00Z')];
    expect(ids(leadOrder(live, undefined))).toEqual(['b', 'a']);
  });
  it('then the greater id, so the rule always decides', () => {
    const live = [plan('a1', '2027-03-08', '2027-01-01T00:00:00Z'), plan('a2', '2027-03-08', '2027-01-01T00:00:00Z')];
    expect(ids(leadOrder(live, []))).toEqual(['a2', 'a1']);
    expect(ids(leadOrder([...live].reverse(), []))).toEqual(['a2', 'a1']);
  });
  it('reads the start of a card as well as of a list row', () => {
    const cards = [{ id: 'a', dates: { start: '2027-03-01' } }, { id: 'b', dates: { start: '2027-03-05' } }];
    expect(ids(leadOrder(cards, []))).toEqual(['b', 'a']);
  });
  it('gives a new list and leaves the input in its order', () => {
    const live = [plan('a', '2027-03-01', ''), plan('b', '2027-03-08', '')];
    const before = ids(live);
    expect(leadOrder(live, [])).not.toBe(live);
    expect(ids(live)).toEqual(before);
    expect(leadOrder(null, [])).toEqual([]);
  });
});

describe('canReuseRoot', () => {
  const shape = { page: 'dashboard', view: 'stub', state: 'ready', frame: '<h1>Hello</h1>{trips}' };
  it('patches when the same view shows the same state around the same frame', () => {
    expect(canReuseRoot(shape, { ...shape })).toBe(true);
  });
  it.each([
    ['another view', { view: 'atlas' }],
    ['another state', { state: 'error' }],
    ['another page', { page: 'atlas' }],
    ['markup outside the regions that changed (a stale banner, a new section)', { frame: '<h1>Hello</h1><p role="status">Saved</p>{trips}' }],
  ])('renders again for %s', (_, change) => {
    expect(canReuseRoot(shape, { ...shape, ...change })).toBe(false);
  });
  it('renders when nothing is mounted', () => {
    expect(canReuseRoot(null, shape)).toBe(false);
    expect(canReuseRoot(shape, null)).toBe(false);
    expect(canReuseRoot(undefined, undefined)).toBe(false);
  });
});

describe('needsBriefingRefetch', () => {
  const at = (iso) => Date.parse(iso);
  it('asks when the briefings were never fetched', () => {
    expect(needsBriefingRefetch(null, null, at('2027-03-10T09:00:00Z'), 'UTC')).toBe(true);
  });
  it('keeps a fetch of the same device day that is at most 15 minutes old', () => {
    expect(needsBriefingRefetch(at('2027-03-10T09:00:00Z'), '2027-03-10', at('2027-03-10T09:14:59Z'), 'UTC')).toBe(false);
    expect(needsBriefingRefetch(at('2027-03-10T09:00:00Z'), '2027-03-10', at('2027-03-10T09:15:00Z'), 'UTC')).toBe(false);
  });
  it('asks again once the fetch is older than 15 minutes', () => {
    expect(needsBriefingRefetch(at('2027-03-10T09:00:00Z'), '2027-03-10', at('2027-03-10T09:15:01Z'), 'UTC')).toBe(true);
  });
  it('asks again when the device date has changed, however fresh the fetch is', () => {
    expect(needsBriefingRefetch(at('2027-03-10T23:58:00Z'), '2027-03-10', at('2027-03-11T00:01:00Z'), 'UTC')).toBe(true);
  });
  it('reads the date in the zone of the device', () => {
    // 16:30 UTC is already the next day in Tokyo and still the same day in Lisbon.
    expect(needsBriefingRefetch(at('2027-03-10T14:55:00Z'), '2027-03-10', at('2027-03-10T15:05:00Z'), 'Asia/Tokyo')).toBe(true);
    expect(needsBriefingRefetch(at('2027-03-10T14:55:00Z'), '2027-03-10', at('2027-03-10T15:05:00Z'), 'Europe/Lisbon')).toBe(false);
  });
  it('accepts a Date as now', () => {
    expect(needsBriefingRefetch(at('2027-03-10T09:00:00Z'), '2027-03-10', new Date('2027-03-10T09:05:00Z'), 'UTC')).toBe(false);
  });
});

describe('entryInputWithTimeout', () => {
  afterEach(() => { vi.useRealTimers(); });
  const plan = { passports: ['SG'], countries: [], checked: true };
  it('hands on the entry plan when the check answers in time', async () => {
    await expect(entryInputWithTimeout(() => Promise.resolve(plan))).resolves.toBe(plan);
    await expect(entryInputWithTimeout(() => plan)).resolves.toBe(plan);
  });
  it('answers { reason: "failed" } when the check fails, never null (ruling R28)', async () => {
    await expect(entryInputWithTimeout(() => Promise.reject(new Error('offline')))).resolves.toEqual({ reason: 'failed' });
    await expect(entryInputWithTimeout(() => { throw new Error('no module'); })).resolves.toEqual({ reason: 'failed' });
    await expect(entryInputWithTimeout(() => Promise.resolve(null))).resolves.toEqual({ reason: 'failed' });
    await expect(entryInputWithTimeout(null)).resolves.toEqual({ reason: 'failed' });
  });
  it('answers { reason: "failed" } after 8 seconds without an answer', async () => {
    vi.useFakeTimers();
    let settled = null;
    entryInputWithTimeout(() => new Promise(() => {})).then((value) => { settled = value; });
    await vi.advanceTimersByTimeAsync(7999);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toEqual({ reason: 'failed' });
  });
  it('takes another wait, and a late answer changes nothing', async () => {
    vi.useFakeTimers();
    let release = () => {};
    const slow = new Promise((resolve) => { release = resolve; });
    const result = entryInputWithTimeout(() => slow, 50);
    await vi.advanceTimersByTimeAsync(50);
    release(plan);
    await expect(result).resolves.toEqual({ reason: 'failed' });
  });
  it('leaves no timer behind once the check has answered', async () => {
    vi.useFakeTimers();
    await entryInputWithTimeout(() => Promise.resolve(plan));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('entryRequest', () => {
  const row = Object.freeze({
    id: 't1', start_date: '2027-04-02', end_date: '2027-04-09',
    wizard_state: Object.freeze({ multiCity: false, destination: { name: 'Porto', flag: 'pt' } }),
  });
  const flights = { outbound: { route: 'LIS > OPO', airline: 'TAP' }, inbound: { route: 'OPO > LIS', airline: 'TAP' } };
  const briefing = (passports, transportMode = null, extras = { flights }) => ({
    id: 't1', extras: { flights: null, transport: null, accommodation: null, bookingChecklist: null, ...extras },
    wizard_state: { passports, transport: { mode: transportMode }, flights: { settled: false }, accommodation: { settled: false } },
  });
  const profile = { nationality: 'sg', home_flag: 'sg' };
  it('uses the passports stored with the plan', () => {
    const request = entryRequest(row, briefing(['my', 'gb']), profile);
    expect(request.passports).toEqual(['MY', 'GB']);
    expect(request).toMatchObject({ wizardState: row.wizard_state, homeFlag: 'sg', groundMode: '', tripStart: '2027-04-02', tripEnd: '2027-04-09' });
    expect(request.extras.flights).toEqual(flights);
  });
  it('falls back to the nationality of the profile, as the trip page does', () => {
    expect(entryRequest(row, briefing(null), profile).passports).toEqual(['SG']);
    expect(entryRequest(row, briefing([]), profile).passports).toEqual(['SG']);
  });
  it('has no passport when neither is known', () => {
    expect(entryRequest(row, briefing(null), null).passports).toEqual([]);
    expect(entryRequest(row, briefing(null), { nationality: null }).passports).toEqual([]);
    expect(entryRequest(row, briefing([null, 7, '']), {}).passports).toEqual([]);
  });
  it('names the mode of a ground journey, also one stored as flights by an older plan', () => {
    const train = { outbound: { mode: 'train', from: 'Lisbon', to: 'Porto' }, inbound: null };
    expect(entryRequest(row, briefing(['sg'], null, { transport: train }), profile).groundMode).toBe('train');
    const older = entryRequest(row, briefing(['sg'], 'bus'), profile);
    expect(older.groundMode).toBe('bus');
    expect(older.extras.flights).toBeUndefined();
  });
  it('copes with a row or a briefing that is missing parts, and changes neither', () => {
    const bare = { id: 't1' };
    const frozen = Object.freeze(briefing(['sg']));
    expect(entryRequest(bare, { id: 't1' }, profile)).toEqual({
      wizardState: null, extras: {}, passports: ['SG'], homeFlag: 'sg', groundMode: '', tripStart: null, tripEnd: null,
    });
    expect(() => entryRequest(row, frozen, profile)).not.toThrow();
    expect(bare).toEqual({ id: 't1' });
  });
});

describe('shownModel', () => {
  const base = DASHBOARD_FIXTURES.ready;
  it('is the model itself, unfiltered, for the starting filter', () => {
    const shown = shownModel(base, { q: '', filter: 'all', allPast: false });
    expect(shown.filter).toMatchObject({ q: '', active: 'all', expanded: false });
    expect(shown.sections).toEqual(base.sections);
  });
  it('narrows the sections for a query and a filter chip and opens every group', () => {
    const past = shownModel(base, { q: '', filter: 'past', allPast: false });
    expect(past.filter).toMatchObject({ active: 'past', expanded: true });
    expect(past.sections.upcoming).toEqual([]);
    expect(past.sections.past).toEqual(base.sections.past);
    const word = base.sections.past[0].title.split(' ')[0];
    const typed = shownModel(base, { q: word, filter: 'all', allPast: false });
    expect(typed.filter).toMatchObject({ q: word, expanded: true });
    expect(typed.sections.past.length).toBeGreaterThan(0);
    expect(typed.sections.past.length).toBeLessThanOrEqual(base.sections.past.length);
  });
  it('"show all past plans" opens every group without narrowing anything', () => {
    const shown = shownModel(base, { q: '', filter: 'all', allPast: true });
    expect(shown.filter).toMatchObject({ q: '', active: 'all', expanded: true });
    expect(shown.sections).toEqual(base.sections);
    expect(shown.pastByMonth).toEqual(base.pastByMonth);
  });
  it('keeps the featured plans and the counts whole, and leaves the model alone', () => {
    const shown = shownModel(base, { q: 'zzzz no such place', filter: 'all', allPast: false });
    expect(shown.live).toBe(base.live);
    expect(shown.next).toBe(base.next);
    expect(shown.counts).toBe(base.counts);
    expect(base.filter.expanded).toBe(false);
  });
  it('reads a missing filter as the starting one', () => {
    expect(shownModel(base).filter).toMatchObject({ q: '', active: 'all', expanded: false });
  });
});

describe('atlasPageHtml', () => {
  const bare = { renderAtlasPage: () => '<header><h1>Atlas</h1></header><p>Plates</p>' };
  const own = {
    renderAtlasPage: (model) => `<header><h1 class="atl-title">Atlas</h1></header>
      ${model.stale ? '<p role="status">Saved <button type="button" data-action="retry-trips">Try again</button></p>' : ''}
      ${model.state === 'error' ? '<div role="alert"><button type="button" data-action="retry-trips">Try again</button></div>' : ''}
      ${model.state === 'empty' ? '<button type="button" data-action="new-trip">Plan a trip</button>' : ''}`,
  };
  const page = (view, name) => atlasPageHtml(view, DASHBOARD_FIXTURES[name], CTX_FIXTURE);

  it('is the page of the view, untouched, in the ready state', () => {
    expect(page(bare, 'ready')).toBe('<header><h1>Atlas</h1></header><p>Plates</p>');
  });
  it('hands the model and the context to the view', () => {
    const renderAtlasPage = vi.fn(() => '<h1>Atlas</h1>');
    atlasPageHtml({ renderAtlasPage }, DASHBOARD_FIXTURES.ready, CTX_FIXTURE);
    expect(renderAtlasPage).toHaveBeenCalledWith(DASHBOARD_FIXTURES.ready, CTX_FIXTURE);
  });
  it('adds the load error with its retry when the page draws none', () => {
    const html = page(bare, 'error');
    expect(html).toContain('role="alert"');
    expect(count(html, 'data-action="retry-trips"')).toBe(1);
    expect(html).not.toContain('data-action="new-trip"'); // never the empty state
  });
  it('adds the stale banner with its retry when the page draws none', () => {
    const html = page(bare, 'stale');
    expect(html).toContain('role="status"');
    expect(count(html, 'data-action="retry-trips"')).toBe(1);
  });
  it('adds the empty atlas with both ways to start when the page draws none', () => {
    const html = page(bare, 'empty');
    const home = DASHBOARD_FIXTURES.empty.user.homeCity;
    expect(html).toContain(`Your atlas starts in ${home}`);
    expect(count(html, 'data-action="new-trip"')).toBe(1);
    expect(count(html, 'data-action="import-trip"')).toBe(1);
  });
  it('escapes the home city, and has a line for a profile without one', () => {
    const model = { ...DASHBOARD_FIXTURES.empty, user: { ...DASHBOARD_FIXTURES.empty.user, homeCity: '<b>"Lisbon"</b>' } };
    const html = atlasPageHtml(bare, model, CTX_FIXTURE);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
    const nowhere = { ...model, user: { ...model.user, homeCity: '' } };
    expect(atlasPageHtml(bare, nowhere, CTX_FIXTURE)).toContain('Your atlas starts here');
  });
  it.each(['error', 'stale', 'empty', 'ready'])('adds nothing when the page draws the %s state itself', (name) => {
    expect(page(own, name)).toBe(own.renderAtlasPage(DASHBOARD_FIXTURES[name]));
  });
  it('still has one h1 and the load error when the view cannot draw the error state', () => {
    const view = { renderAtlasPage: (model) => { if (model.state !== 'ready') throw new Error('no data'); return '<h1>Atlas</h1>'; } };
    const html = page(view, 'error');
    expect(count(html, '<h1')).toBe(1);
    expect(html).toContain('Atlas');
    expect(count(html, 'data-action="retry-trips"')).toBe(1);
  });
  it('lets a throw in the ready state through, so the route can go back to the dashboard', () => {
    const view = { renderAtlasPage: () => { throw new Error('broken'); } };
    expect(() => page(view, 'ready')).toThrow('broken');
  });
  it('gives a heading to a page that has none', () => {
    const html = atlasPageHtml({ renderAtlasPage: () => '<p>Plates</p>' }, DASHBOARD_FIXTURES.ready, CTX_FIXTURE);
    expect(count(html, '<h1')).toBe(1);
  });
  it('holds no banned glyph in what it adds', () => {
    for (const name of ['error', 'stale', 'empty']) expect(page(bare, name)).not.toMatch(BANNED);
  });
});
