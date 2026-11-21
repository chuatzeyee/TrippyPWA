// The model fixtures conform to the typedefs of js/views/contract.js, cover every state the plan
// names, and hold invented data only. The last part proves the shape check can fail. Steward: F0.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DASHBOARD_FIXTURES, TRIP_FIXTURES, CTX_FIXTURE } from './models.js';
import { checkDashboardModel, checkTripModel, conforms, DashboardModel, Money, Prefs, TripCardModel } from './shape.js';

const D = DASHBOARD_FIXTURES;
const T = TRIP_FIXTURES;
const cardsOf = (model) => Object.values(model.cardsById);

describe('the dashboard fixtures', () => {
  it('cover every state named in TASKS F0 and blueprint 9.4 item 3', () => {
    expect(Object.keys(D)).toEqual(expect.arrayContaining([
      'ready', 'twoLive', 'noLive', 'nothingUpcoming', 'empty', 'error', 'stale', 'generating', 'generatingNoDates',
      'failed', 'failedShared', 'sharedViewer', 'sharedEditor', 'noCover', 'noDates', 'homeCity', 'noHomeCurrency',
      'briefingPending',
    ]));
  });
  it.each(Object.keys(D))('%s conforms to DashboardModel', (key) => {
    expect(checkDashboardModel(D[key])).toEqual([]);
  });
  it('each fixture is the state its name says', () => {
    expect(D.ready.live).toHaveLength(1);
    expect(D.ready.next).not.toBeNull();
    expect(D.ready.sections.past.length).toBeGreaterThan(6);
    expect(D.twoLive.live.map((b) => b.isLead)).toEqual([true, false]);
    expect(D.noLive.live).toEqual([]);
    expect(D.noLive.next).not.toBeNull();
    expect(D.nothingUpcoming.next).toBeNull();
    expect(D.nothingUpcoming.sections.upcoming).toEqual([]);
    expect([D.empty.state, D.error.state]).toEqual(['empty', 'error']);
    expect(D.stale.stale).toEqual({ savedAt: expect.any(String) });
    expect(D.generating.sections.inProgress[0]).toMatchObject({ phase: 'generating', generation: { daysDone: 4, daysTotal: 9 } });
    expect(D.generatingNoDates.sections.inProgress[0]).toMatchObject({ phase: 'generating', dates: { start: null }, generation: { daysTotal: null } });
    expect(D.failed.sections.inProgress[0]).toMatchObject({ phase: 'failed', shared: false });
    expect(D.failedShared.sections.inProgress[0]).toMatchObject({ phase: 'failed', shared: true });
    expect(cardsOf(D.sharedViewer).filter((c) => c.shared).map((c) => c.role)).toEqual(['viewer']);
    expect(cardsOf(D.sharedEditor).filter((c) => c.shared).map((c) => c.role)).toEqual(['editor']);
    expect(D.noCover.next.trip.cover.kind).toBe('none');
    expect(D.noDates.sections.undated).toHaveLength(1);
    expect(D.homeCity.next.route.kind).toBe('home');
    expect(D.homeCity.next.trip.places[0].name).toBe(D.homeCity.user.homeCity);
    expect(D.noHomeCurrency.user.homeCurrency).toBeNull();
    expect(cardsOf(D.noHomeCurrency).every((c) => c.cost.home === null && !c.cost.homeFirst)).toBe(true);
    expect(D.noHomeCurrency.stats.spendHome).toBeNull();
    expect(cardsOf(D.briefingPending).filter((c) => c.briefingPending).length).toBeGreaterThan(1);
    expect(D.briefingPending.live[0]).toMatchObject({ today: null, nextStop: null });
    expect(D.filtered.filter).toMatchObject({ active: 'past', expanded: true });
  });
  it('the ready account also holds the edge data a view must survive', () => {
    const cards = cardsOf(D.ready);
    expect(cards.some((c) => c.cost.local && !c.cost.home && c.cost.local.code !== 'EUR')).toBe(true);   // a currency with no rate
    expect(cards.some((c) => c.dates.itineraryDays !== c.dates.dayCount)).toBe(true);                    // fewer itinerary days than calendar days
    expect(cards.some((c) => c.places.length > 1)).toBe(true);                                           // more than one city
    expect(cards.some((c) => c.readiness?.pending > 0)).toBe(true);                                      // an entry check still running
    expect(cards.some((c) => c.readiness?.items.some((item) => item.due))).toBe(true);                   // a dated to-do
    expect(cardsOf(D.noCover).some((c) => c.places[0].lat === null && c.flags.length === 0)).toBe(true); // a custom place
    expect(cardsOf(D.twoLive).some((c) => c.cover.kind === 'v2' && c.cover.credit.chip !== c.cover.credit.full)).toBe(true);
  });
});

describe('the trip fixtures', () => {
  it('cover every state named in TASKS F0 and blueprint 9.4 item 3', () => {
    expect(Object.keys(T)).toEqual(expect.arrayContaining([
      'upcoming', 'tomorrow', 'live', 'liveNoNextStop', 'past', 'undated', 'generating', 'failed', 'empty', 'viewer',
      'editor', 'imported', 'ground', 'multiCity', 'noCover', 'noMap', 'offline', 'entryChecking', 'photosOff',
    ]));
  });
  it.each(Object.keys(T))('%s conforms to TripOverviewModel', (key) => {
    expect(checkTripModel(T[key])).toEqual([]);
  });
  it('each fixture is the state its name says', () => {
    const keys = (model) => model.actions.map((action) => action.key);
    expect(T.upcoming).toMatchObject({ phase: 'upcoming', status: 'ok', role: 'owner' });
    expect(keys(T.upcoming)).toEqual(['share', 'pdf', 'edit', 'read-view', 'regenerate', 'delete']);
    expect(T.tomorrow).toMatchObject({ daysToGo: 1, statusText: 'Tomorrow' });
    expect(T.live.live.today.nextStop).not.toBeNull();
    expect(T.live.readiness.collapsed).toBe(true);
    expect(T.live.days.filter((row) => row.isToday)).toHaveLength(1);
    expect(T.liveNoNextStop.live.today).toMatchObject({ nextStop: null, laterToday: [] });
    expect(T.past).toMatchObject({ phase: 'past', readiness: null, statusText: 'Past plan' });
    expect(T.undated).toMatchObject({ phase: 'undated', dates: { start: null, end: null } });
    expect(T.generating).toMatchObject({ status: 'generating', readiness: null });
    expect(T.generating.days.length).toBeGreaterThan(0);
    expect(T.failed).toMatchObject({ status: 'failed', statusText: 'Planning stopped', days: [] });
    expect(keys(T.failed)).toEqual(['delete']);
    expect(T.empty).toMatchObject({ status: 'empty', days: [] });
    expect(keys(T.viewer)).toEqual(['pdf', 'read-view']);
    expect(keys(T.editor)).toEqual(['share', 'pdf', 'edit', 'read-view']);
    expect(T.imported.imported).toBe(true);
    expect(T.imported.glance.map((fact) => fact.key)).not.toEqual(expect.arrayContaining(['pace', 'stay']));
    expect(T.ground.route).toMatchObject({ kind: 'ground', mode: 'train' });
    expect(T.ground.readiness.items[0]).toMatchObject({ target: 'transport', status: 'Not arranged yet' });
    expect(T.multiCity.route.kind).toBe('multi');
    expect(T.multiCity.flags.length).toBeGreaterThan(1);
    expect(T.noCover.cover.kind).toBe('none');
    expect(T.noMap.map.points).toEqual([]);
    expect(T.noMap.days.length).toBeGreaterThan(0);
    expect(T.offline.offline).toEqual({ savedAt: expect.any(String) });
    expect(T.entryChecking.readiness).toMatchObject({ pending: 1, todo: 3 });
    expect(T.photosOff.days.every((row) => row.thumb === null && row.photos.length === 0)).toBe(true);
    expect(T.photosOff.areas.every((area) => area.photo === '')).toBe(true);
    expect(T.photosOff.cover.kind).not.toBe('none');
  });
});

// What the real modules give, as far as a builder has reported it (wave 1: js/lib/readiness.js and
// js/lib/cover-model.js). A fixture row the rule can never produce would send a view down a wrong path.
describe('the fixtures say what the real modules say', () => {
  const rows = [...Object.values(D).flatMap(cardsOf), ...Object.values(T)]
    .flatMap((item) => item.readiness?.items ?? []);
  const partBooked = (row) => /^\d+ of \d+ (?:stays|legs) booked$/.test(row.status);
  it('a readiness row has a tick key exactly when a tick on the Prep card can settle it', () => {
    // Blueprint 7.3: entry has no checkbox, and a part-booked row (row 4) is decided before the tick (row 6).
    expect(T.imported.readiness.items.filter(partBooked)).toHaveLength(1);
    expect(rows.filter((row) => (row.area === 'entry' || partBooked(row)) !== (row.tickKey === null))).toEqual([]);
  });
  it('a stay row offers "Compare stays" only while options are open, and "See stays" otherwise', () => {
    const stays = rows.filter((row) => row.area === 'stay');
    expect([...new Set(stays.map((row) => row.actionLabel))].sort()).toEqual(['Compare stays', 'See stays']);
    expect(stays.filter((row) => row.state === 'done' && row.actionLabel !== 'See stays')).toEqual([]);
  });
  it('a legacy cover is credited to its source the way coverCreditText() writes it', () => {
    const legacy = [...cardsOf(D.ready), T.upcoming, ...D.ready.hops].map((item) => item.cover).filter((cover) => cover.kind === 'legacy');
    expect(legacy.length).toBeGreaterThan(8);
    expect(legacy.filter((cover) => cover.credit.chip !== 'Wikimedia Commons' || cover.credit.full !== 'Photo: Wikimedia Commons')).toEqual([]);
    expect(D.ready.credits.filter((credit) => credit.label === 'Wikimedia Commons' && credit.full !== 'Photo: Wikimedia Commons')).toEqual([]);
  });
  it('a weather condition is a label weatherLabel() can return (ruling R13)', () => {
    // The values of the label table in js/lib/weather.js; '' stands for an unknown condition.
    const LABELS = ['', 'Sunny', 'Clear', 'Pt. Cloudy', 'Pt. Sunny', 'Cloudy', 'Overcast', 'Rain', 'Showers', 'Storm', 'Snow', 'Fog', 'Windy'];
    const conditions = (value) => {
      if (!value || typeof value !== 'object') return [];
      const own = typeof value.condition === 'string' && typeof value.range === 'string' ? [value.condition] : [];
      return [...own, ...Object.values(value).flatMap(conditions)];
    };
    const unknown = (value) => [...new Set(conditions(value))].filter((condition) => !LABELS.includes(condition));
    expect(unknown({ weather: { range: '10 to 23°C', condition: 'Mostly sunny' } })).toEqual(['Mostly sunny']);
    expect(conditions({ ...D, ...T }).length).toBeGreaterThan(20);
    expect(unknown({ ...D, ...T })).toEqual([]);
    const notes = Object.values(T).flatMap((model) => model.glance ?? []).filter((fact) => fact.key === 'weather').map((fact) => fact.note.split(', ')[0]);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.filter((note) => !LABELS.includes(note))).toEqual([]);
  });
});

describe('the view context fixture', () => {
  it('is a frozen ViewCtx for a first render', () => {
    expect(conforms(CTX_FIXTURE.prefs, Prefs)).toEqual([]);
    expect(Object.isFrozen(CTX_FIXTURE) && Object.isFrozen(CTX_FIXTURE.prefs)).toBe(true);
    expect(CTX_FIXTURE).toMatchObject({ theme: 'dark', reducedMotion: false, animate: true, baseUrl: '/' });
    expect(CTX_FIXTURE.slots.notes).toMatch(/^<div /);
    expect(typeof CTX_FIXTURE.onCleanup).toBe('function');
    expect(typeof CTX_FIXTURE.onPatched).toBe('function');
  });
});

// The owner's captured trips live in previews/fixtures and must never reach this folder. When that
// folder is on the machine, no id and no title from it may appear in a fixture.
const OWNER_LIST = fileURLToPath(new URL('../../../previews/fixtures/trips-list.json', import.meta.url));
describe('the fixtures hold invented data', () => {
  it.runIf(existsSync(OWNER_LIST))('no trip id or title of the captured account appears in a fixture', () => {
    const rows = JSON.parse(readFileSync(OWNER_LIST, 'utf8'));
    const taken = new Set((Array.isArray(rows) ? rows : []).flatMap((row) => [row.id, row.title]).filter(Boolean));
    const mine = [...Object.values(D).flatMap(cardsOf), ...Object.values(T)].flatMap((item) => [item.id, item.title]);
    expect(mine.filter((value) => taken.has(value))).toEqual([]);
  });
  it('every sample id is plainly a sample', () => {
    const ids = [...Object.values(D).flatMap(cardsOf), ...Object.values(T)].map((item) => item.id);
    expect(ids.every((id) => /^s-[a-z-]+$/.test(id))).toBe(true);
  });
});

describe('the shape check fails on a model that does not conform', () => {
  const ready = D.ready;
  const card = ready.sections.upcoming[0];
  const withCard = (change) => {
    const next = { ...card, ...change };
    return { ...ready, sections: { ...ready.sections, upcoming: [next, ...ready.sections.upcoming.slice(1)] }, cardsById: { ...ready.cardsById, [card.id]: next }, next: { ...ready.next, trip: next } };
  };
  it.each([
    ['a missing key', { ...ready, pins: undefined }, /\$\.pins: expected an array, got undefined/],
    ['a key the typedef does not have', { ...ready, extra: 1 }, /\$\.extra: not in the typedef/],
    ['a wrong type', { ...ready, counts: { ...ready.counts, all: '11' } }, /\$\.counts\.all: expected a finite number/],
    ['a value outside the enum', { ...ready, state: 'loading' }, /\$\.state: expected one of ready, empty, error/],
    ['a null where the typedef has none', { ...ready, stats: null }, /\$\.stats: expected an object, got null/],
    ['a card without wholeHref', withCard({ wholeHref: undefined }), /wholeHref: expected string, got undefined/],
    ['a whole-trip link that is the neutral link', withCard({ wholeHref: card.href }), /wholeHref: expected #\/trip\/s-marrakech\?today=0/],
    ['a today link on a plan that is not live', withCard({ todayHref: `${card.href}?today=1` }), /todayHref: set only when live/],
    ['an empty flag', withCard({ flags: [''] }), /flags: unique two-letter codes only/],
    ['a readiness whose counts do not match its items', withCard({ readiness: { ...card.readiness, todo: 1 } }), /readiness\.todo: does not match the items/],
    ['a readiness headline that does not match', withCard({ readiness: { ...card.readiness, headline: 'Ready' } }), /headline: expected "1 of 4 ready"/],
    ['a month key that does not follow the start date', withCard({ monthKey: '2027-04' }), /monthKey: must follow the start date/],
    ['a filter marked expanded with nothing active', { ...ready, filter: { ...ready.filter, expanded: true } }, /filter\.expanded: true exactly while/],
    ['a pin with a wrong count', { ...ready, pins: ready.pins.map((pin, i) => (i === 1 ? { ...pin, count: 5 } : pin)) }, /pins\[1\]\.count: must equal tripIds\.length/],
    ['more than seven hops', { ...ready, hops: Array.from({ length: 8 }, () => ready.hops[0]) }, /\$\.hops: at most 7 entries/],
  ])('%s', (_name, model, message) => {
    expect(checkDashboardModel(model).join('\n')).toMatch(message);
  });
  it.each([
    ['a viewer who may edit', { ...T.viewer, actions: T.editor.actions }, /a viewer cannot edit or share/],
    ['regenerate on an imported trip', { ...T.imported, actions: T.upcoming.actions }, /no regenerate on an imported trip/],
    ['readiness on a past plan', { ...T.past, readiness: T.upcoming.readiness }, /readiness: null for a past plan/],
    ['a live block on a plan that is not live', { ...T.upcoming, live: T.live.live }, /live: set exactly while the plan is live/],
    ['a day row out of place', { ...T.upcoming, days: [...T.upcoming.days].reverse() }, /days\[0\]\.index: must equal its position/],
    ['a third tip shown', { ...T.upcoming, tips: { shown: [...T.upcoming.tips.shown, T.upcoming.tips.shown[0]], total: 4 } }, /\$\.tips\.shown: at most 2 entries/],
    ['a Reader view link to another trip', { ...T.upcoming, actions: T.upcoming.actions.map((a) => (a.key === 'read-view' ? { ...a, href: '#/trip/other/read' } : a)) }, /actions\.read-view\.href/],
  ])('%s', (_name, model, message) => {
    expect(checkTripModel(model).join('\n')).toMatch(message);
  });
  it('reads nested shapes and nullable parts', () => {
    expect(conforms({ amount: 1, code: 'EUR', text: '€1' }, Money)).toEqual([]);
    expect(conforms({ amount: Number.NaN, code: 'EUR', text: '€1' }, Money)).toEqual(['$.amount: expected a finite number, got number']);
    expect(conforms(card, TripCardModel)).toEqual([]);
    expect(conforms({ ...card, cover: { ...card.cover, credit: { chip: 'Pexels' } } }, TripCardModel)).toEqual(['$.cover.credit.full: missing', '$.cover.credit.link: missing']);
    expect(conforms(ready, DashboardModel)).toEqual([]);
  });
});
