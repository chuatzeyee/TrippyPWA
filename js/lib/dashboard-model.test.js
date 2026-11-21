// buildDashboardModel, applyDashboardFilter and briefingIds: list rows in, the DashboardModel of the
// contract out. Everything here is invented: the sample account of the model fixtures (Sam, at home
// in Lisbon) on 2027-03-10 at 09:10 UTC. Places are the public catalogue's. The cards that carry a
// briefing (next stop, readiness, route) are in dashboard-model.briefing.test.js.
import { describe, it, expect, beforeAll } from 'vitest';
import { buildDashboardModel, applyDashboardFilter, briefingIds } from './dashboard-model.js';
import { DEFAULT_PREFS } from './prefs.js';
import { setLocaleFromFlag } from './locale.js';
import { convert } from '../data/currencies.js';
import { estimateGenerationMinutes } from './trip-extras.js';
import { PLACES as P, CUSTOM_PLACE } from '../views/fixtures/parts.js';
import { DASHBOARD_FIXTURES } from '../views/fixtures/models.js';
import { checkDashboardModel } from '../views/fixtures/shape.js';

beforeAll(() => setLocaleFromFlag('sg'));

const NOW = new Date('2027-03-10T09:10:00Z');
const DEVICE = 'Europe/Lisbon';
const PROFILE = {
  userId: 'u-sam', display_name: 'Sam Carvalho', home_city: 'Lisbon', home_flag: 'pt', home_country: 'Portugal',
  home_currency: 'EUR', home_currency_symbol: '€', is_nomad: false, nationality: 'PT',
};
const MONEY = { copenhagen: ['DKK', 'kr'], lima: ['PEN', 'S/'], marrakech: ['MAD', 'DH'], vancouver: ['CAD', '$'] };
const image = (place) => `https://upload.wikimedia.org/wikipedia/commons/thumb/${place.file}/250px-${place.file.split('/').pop()}`;
/** A place as the wizard stores it, and as the catalogue lists it. */
const dest = (key) => {
  const { file, ...place } = P[key];
  const [currencyCode, currencySymbol] = MONEY[key] ?? ['EUR', '€'];
  return { ...place, currencyCode, currencySymbol, image: image(P[key]) };
};
const CATALOGUE = Object.keys(P).map(dest);
const dayRows = (count, amount = 50, currency = null) => Array.from({ length: count }, (_, i) => ({
  day_number: i + 1, activities: [{ cost_amount: amount, cost_currency: currency }, { cost_amount: amount, cost_currency: currency }],
}));
/** One list row, as fetchAllTrips() gives it. `places` are keys of the catalogue (or whole places). */
function row(id, title, places, start, end, over = {}) {
  const list = places.map((place) => (typeof place === 'string' ? dest(place) : place));
  const multi = list.length > 1;
  const span = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1 : 3;
  return {
    id, title, emoji: '', status: 'generated', start_date: start, end_date: end, created_at: '2026-06-01T10:00:00+00:00',
    budget_daily: 120, budget_currency: list[0]?.currencyCode ?? 'EUR', budget_currency_symbol: list[0]?.currencySymbol ?? '€', travelers: 2,
    cover_image: '', timezone: list[0]?.timezone ?? null, cover_small: null, cover_large: null, cover_focus: null, cover_credit: null, cover_none: null,
    itinerary_days: dayRows(span), wizard_state: { multiCity: multi, destination: multi ? null : list[0] ?? null, destinations: multi ? list : [] },
    shared: false, collab_role: null, ...over,
  };
}
const seville = () => row('t-seville', 'Seville and the south', ['seville'], '2027-03-04', '2027-03-13');
const marrakech = () => row('t-marrakech', 'Marrakech', ['marrakech'], '2027-03-19', '2027-03-25');
const vancouver = () => row('t-vancouver', 'Vancouver and the coast', ['vancouver'], '2027-05-06', '2027-05-17');
const rome = () => row('t-rome', 'Rome in November', ['rome'], '2026-11-12', '2026-11-16');
const copenhagen = () => row('t-copenhagen', 'Copenhagen', ['copenhagen'], '2026-09-03', '2026-09-07');
const lima = () => row('t-lima', 'Lima', ['lima'], '2026-02-05', '2026-02-16');
const florence = () => row('t-florence', 'Florence, some day', ['florence'], null, null, { created_at: '2026-07-01T10:00:00+00:00' });
const dublin = (over = {}) => row('t-dublin', 'Dublin', ['dublin'], '2027-06-10', '2027-06-18', { status: 'generating', itinerary_days: [], created_at: '2027-03-10T08:00:00+00:00', ...over });
const istanbul = (over = {}) => row('t-istanbul', 'Istanbul', ['istanbul'], '2027-07-01', '2027-07-09', { status: 'failed', itinerary_days: [], created_at: '2027-03-09T08:00:00+00:00', ...over });
const ROWS = () => [rome(), dublin(), vancouver(), florence(), seville(), lima(), istanbul(), marrakech(), copenhagen()];

const input = (rows, over = {}) => ({
  rows, briefings: [], now: NOW, deviceZone: DEVICE, prefs: DEFAULT_PREFS, profile: PROFILE, ticks: {}, entries: {}, catalogue: CATALOGUE, offlineIds: [], ...over,
});
const build = (rows = ROWS(), over = {}) => buildDashboardModel(input(rows, over));
const ids = (cards) => cards.map((card) => card.id);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
}

describe('the shape of the model', () => {
  const cases = {
    ready: () => build(),
    empty: () => build([]),
    error: () => build(ROWS(), { loadError: true }),
    stale: () => build(ROWS(), { stale: true, cachedAt: '2027-03-09T18:42:00+00:00' }),
    noProfile: () => build(ROWS(), { profile: null, catalogue: null }),
    bare: () => buildDashboardModel({ rows: [{ id: 't-bare' }], now: NOW }),
    filtered: () => applyDashboardFilter(build(), { q: 'ro', filter: 'past' }),
  };
  it.each(Object.keys(cases))('%s conforms to the typedef and its rules', (name) => {
    expect(checkDashboardModel(cases[name]())).toEqual([]);
  });
  it('has the same fields as the F0 fixture, card for card', () => {
    const model = build();
    const fixture = DASHBOARD_FIXTURES.ready;
    const sameKeys = (mine, theirs) => expect(Object.keys(mine).sort()).toEqual(Object.keys(theirs).sort());
    sameKeys(model, fixture);
    sameKeys(model.sections.live[0], fixture.sections.live[0]);
    sameKeys(model.live[0], fixture.live[0]);
    sameKeys(model.next, fixture.next);
    sameKeys(model.stats, fixture.stats);
    sameKeys(model.pins[0], fixture.pins[0]);
    sameKeys(model.hops[0], fixture.hops[0]);
    sameKeys(model.filter, fixture.filter);
    sameKeys(model.user, fixture.user);
  });
  it('returns new objects every time and never changes what it was given', () => {
    const given = deepFreeze(input(ROWS(), { offlineIds: ['t-seville'] }));
    const first = buildDashboardModel(given);
    const second = buildDashboardModel(given);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.sections.past[0]).not.toBe(first.sections.past[0]);
    expect(second.stats).not.toBe(first.stats);
  });
  it('needs a real `now`', () => {
    expect(() => build(ROWS(), { now: undefined })).toThrow(TypeError);
  });
});

describe('sections', () => {
  it('sorts every plan into one section, each in its own order', () => {
    const { sections } = build();
    expect(ids(sections.inProgress)).toEqual(['t-dublin', 't-istanbul']);            // newest first
    expect(ids(sections.live)).toEqual(['t-seville']);
    expect(ids(sections.upcoming)).toEqual(['t-marrakech', 't-vancouver']);          // soonest first
    expect(ids(sections.past)).toEqual(['t-rome', 't-copenhagen', 't-lima']);        // latest first
    expect(ids(sections.undated)).toEqual(['t-florence']);
  });
  it('orders undated plans newest first', () => {
    const older = row('t-someday', 'Athens, some day', ['athens'], null, null, { created_at: '2026-02-01T10:00:00+00:00' });
    expect(ids(build([older, florence()]).sections.undated)).toEqual(['t-florence', 't-someday']);
  });
  it('groups the past plans by the month they started in, newest first, in the order of the section', () => {
    const second = row('t-rome-2', 'Rome again', ['rome'], '2026-11-02', '2026-11-05');
    const model = build([lima(), second, rome(), copenhagen()]);
    expect(model.pastByMonth.map((group) => [group.key, group.label, ids(group.trips)])).toEqual([
      ['2026-11', 'November 2026', ['t-rome', 't-rome-2']], ['2026-09', 'September 2026', ['t-copenhagen']], ['2026-02', 'February 2026', ['t-lima']],
    ]);
    expect(model.pastByMonth[0].trips[0]).toBe(model.sections.past[0]);
  });
  it('keeps a month together when a plan that started in the month before ends later', () => {
    // Started in October and ended after a short plan of November: the November group still comes first.
    const long = row('t-long', 'Athens', ['athens'], '2026-10-28', '2026-11-08');
    const short = row('t-short', 'Porto', ['porto'], '2026-11-01', '2026-11-03');
    const early = row('t-early', 'Vienna', ['vienna'], '2026-10-02', '2026-10-05');
    const model = build([early, long, short]);
    expect(ids(model.sections.past)).toEqual(['t-short', 't-long', 't-early']);
    expect(model.pastByMonth.map((group) => group.key)).toEqual(['2026-11', '2026-10']);
    expect(checkDashboardModel(model)).toEqual([]);
  });
  it('counts what each filter shows and labels the chips', () => {
    const model = build([...ROWS(), row('t-porto', 'Porto weekend', ['porto'], '2027-04-02', '2027-04-05', { shared: true, collab_role: 'editor' })]);
    expect(model.counts).toEqual({ all: 10, live: 1, upcoming: 3, past: 3, shared: 1 });
    expect(model.filter).toEqual({
      q: '', active: 'all', expanded: false,
      options: [
        { key: 'all', label: 'All', count: 10 }, { key: 'live', label: 'Now', count: 1 }, { key: 'upcoming', label: 'Upcoming', count: 3 },
        { key: 'past', label: 'Past', count: 3 }, { key: 'shared', label: 'Shared with me', count: 1 },
      ],
    });
  });
});

describe('states', () => {
  it('is empty with no rows, with nothing featured and no pins of plans', () => {
    const model = build([]);
    expect(model).toMatchObject({ state: 'empty', stale: null, live: [], next: null, pastByMonth: [], cardsById: {}, credits: expect.any(Array) });
    expect(model.counts).toEqual({ all: 0, live: 0, upcoming: 0, past: 0, shared: 0 });
    expect(model.pins.map((pin) => pin.kind)).toEqual(['home']);
    expect(model.stats.trips).toBe(0);
  });
  it('is an error, never empty, when the list could not be loaded, and carries no plan', () => {
    const model = build(ROWS(), { loadError: true });
    expect(model.state).toBe('error');
    expect(Object.keys(model.cardsById)).toEqual([]);
    expect(model.user.firstName).toBe('Sam');
    expect(build([], { loadError: true }).state).toBe('error');
  });
  it('says when the list is the copy saved on this device', () => {
    expect(build().stale).toBeNull();
    expect(build(ROWS(), { stale: true, cachedAt: '2027-03-09T18:42:00+00:00' }).stale).toEqual({ savedAt: '2027-03-09T18:42:00+00:00' });
    expect(build(ROWS(), { stale: true }).stale).toEqual({ savedAt: null });
  });
  it('describes the moment and the user', () => {
    const model = build();
    expect(model.now).toEqual({ iso: '2027-03-10T09:10:00.000Z', dateText: 'Wed 10 Mar', partOfDay: 'morning' });
    expect(build(ROWS(), { now: '2027-03-10T13:00:00Z' }).now.partOfDay).toBe('afternoon');
    expect(build(ROWS(), { now: '2027-03-10T17:00:00Z' }).now.partOfDay).toBe('evening');
    // 19:30 UTC is already the next morning on a device in Auckland.
    expect(build(ROWS(), { now: '2027-03-10T19:30:00Z', deviceZone: 'Pacific/Auckland' }).now).toMatchObject({ dateText: 'Thu 11 Mar', partOfDay: 'morning' });
    expect(model.user).toEqual({ firstName: 'Sam', homeCity: 'Lisbon', homeFlag: 'pt', homeTimezone: 'Europe/Lisbon', homeCurrency: { code: 'EUR', symbol: '€' } });
    expect(build(ROWS(), { profile: { ...PROFILE, home_city: 'Sintra', home_currency: null } }).user).toMatchObject({ homeCity: 'Sintra', homeTimezone: null, homeCurrency: null });
    expect(build(ROWS(), { profile: null }).user).toEqual({ firstName: '', homeCity: '', homeFlag: '', homeTimezone: null, homeCurrency: null });
  });
});

describe('cards', () => {
  it('links a plan three ways: neutral, whole trip and, while live, today', () => {
    const { cardsById } = build([seville(), marrakech(), row('t a/b', 'Odd id', ['rome'], '2026-11-12', '2026-11-16')]);
    expect(cardsById['t-seville']).toMatchObject({ href: '#/trip/t-seville', wholeHref: '#/trip/t-seville?today=0', todayHref: '#/trip/t-seville?today=1' });
    expect(cardsById['t-marrakech']).toMatchObject({ href: '#/trip/t-marrakech', wholeHref: '#/trip/t-marrakech?today=0', todayHref: null });
    expect(cardsById['t a/b'].href).toBe('#/trip/t%20a%2Fb');
  });
  it('says where each plan stands', () => {
    const { cardsById } = build();
    expect(cardsById['t-seville']).toMatchObject({ phase: 'live', dayNumber: 7, daysLeft: 3, daysToGo: null, monthKey: '2027-03' });
    expect(cardsById['t-marrakech']).toMatchObject({ phase: 'upcoming', daysToGo: 9, dayNumber: null, daysLeft: null });
    expect(cardsById['t-rome']).toMatchObject({ phase: 'past', daysToGo: null, monthKey: '2026-11' });
    expect(cardsById['t-florence']).toMatchObject({ phase: 'undated', monthKey: '', dates: { start: null, end: null, text: 'No dates yet', dayCount: 3, itineraryDays: 3 } });
  });
  it('uses the span of the dates for the day count and keeps the itinerary count for the statistics', () => {
    // Ten calendar days and nine itinerary rows, on its last day: day 10 of 10, never day 10 of 9.
    const short = row('t-short', 'Seville', ['seville'], '2027-03-01', '2027-03-10', { itinerary_days: dayRows(9) });
    const model = build([short]);
    expect(model.cardsById['t-short'].dates).toEqual({ start: '2027-03-01', end: '2027-03-10', text: '1 to 10 Mar 2027', dayCount: 10, nights: 9, itineraryDays: 9 });
    expect(model.cardsById['t-short']).toMatchObject({ dayNumber: 10, daysLeft: 0 });
    expect(model.live[0]).toMatchObject({ dayNumber: 10, dayCount: 10 });
    expect(model.stats.daysPlanned).toBe(9);
  });
  it('titles a multi-city plan by its cities and lists its places and flags', () => {
    const custom = { ...CUSTOM_PLACE };
    const tour = row('t-tour', 'Vienna to Budapest', ['vienna', 'budapest', custom], '2027-05-01', '2027-05-08');
    const card = build([tour]).cardsById['t-tour'];
    expect(card.title).toBe('Vienna, Budapest & Sintra hills');
    expect(card.places.map((place) => place.name)).toEqual(['Vienna', 'Budapest', 'Sintra hills']);
    expect(card.places[0]).toEqual({ name: 'Vienna', country: 'Austria', flag: 'at', lat: P.vienna.lat, lng: P.vienna.lng, timezone: 'Europe/Vienna' });
    expect(card.places[2]).toEqual({ name: 'Sintra hills', country: '', flag: '', lat: null, lng: null, timezone: null });
    expect(card.flags).toEqual(['at', 'hu']);
  });
  it('prices the activities per person in the trip currency, with the home figure and the budget', () => {
    const card = build([row('t-cph', 'Copenhagen', ['copenhagen'], '2027-05-01', '2027-05-05', { itinerary_days: dayRows(5, 200, 'DKK'), budget_daily: 1500, travelers: 4 })]).cardsById['t-cph'];
    expect(card.travellers).toBe(4);
    expect(card.cost).toEqual({
      basis: 'perPerson', local: { amount: 2000, code: 'DKK', text: 'DKK 2,000' },
      home: { amount: convert(2000, 'DKK', 'EUR'), code: 'EUR', text: `€${convert(2000, 'DKK', 'EUR')}` }, homeFirst: true, excluded: 0,
      budget: { amount: 7500, code: 'DKK', text: 'DKK 7,500' }, budgetHome: { amount: convert(7500, 'DKK', 'EUR'), code: 'EUR', text: `€${convert(7500, 'DKK', 'EUR').toLocaleString('en-SG')}` },
    });
    const localFirst = build([marrakech()], { prefs: { ...DEFAULT_PREFS, homeCurrencyFirst: false } }).cardsById['t-marrakech'];
    expect(localFirst.cost).toMatchObject({ homeFirst: false, home: { code: 'EUR' } });
    expect(build([rome()]).cardsById['t-rome'].cost).toMatchObject({ local: { amount: 500, code: 'EUR', text: '€500' }, home: null, homeFirst: false });
  });
  it('takes the cover from the row: the picked one, else the photo of the place, else none', () => {
    const picked = { cover_image: 'https://photos.example.test/c-2400.jpg', cover_large: { url: 'https://photos.example.test/c-2400.jpg', w: 2400, h: 1350 }, cover_small: { url: 'https://photos.example.test/c-1280.jpg', w: 1280, h: 720 }, cover_focus: 30,
      cover_credit: { via: 'Pexels', creator: 'Jo Marlo', link: 'https://photos.example.test/credit' } };
    const model = build([{ ...rome(), ...picked }, copenhagen(), row('t-hills', 'Sintra hills on foot', [{ ...CUSTOM_PLACE }], '2026-12-05', '2026-12-06')]);
    expect(model.cardsById['t-rome'].cover).toMatchObject({ kind: 'v2', src: 'https://photos.example.test/c-1280.jpg', focusY: 30, credit: { chip: 'Pexels', full: 'Photo: Jo Marlo, Pexels' } });
    expect(model.cardsById['t-copenhagen'].cover).toMatchObject({ kind: 'legacy', credit: { chip: 'Wikimedia Commons' } });
    expect(model.cardsById['t-hills'].cover).toMatchObject({ kind: 'none', src: '', credit: null });
  });
  it('marks imported, shared and saved plans', () => {
    const imported = { ...marrakech(), wizard_state: { ...marrakech().wizard_state, imported: true } };
    const shared = { ...vancouver(), shared: true, collab_role: 'editor' };
    const unknownRole = { ...rome(), shared: true, collab_role: null };
    const { cardsById } = build([imported, shared, unknownRole, seville()], { offlineIds: ['t-seville', 't-gone'] });
    expect(cardsById['t-marrakech']).toMatchObject({ imported: true, shared: false, role: null, savedOffline: false });
    expect(cardsById['t-vancouver']).toMatchObject({ imported: false, shared: true, role: 'editor' });
    expect(cardsById['t-rome']).toMatchObject({ shared: true, role: 'viewer' });
    expect(cardsById['t-seville'].savedOffline).toBe(true);
  });
  it('holds no venue photo with or without the pref, and keeps every cover', () => {
    const on = build();
    const off = build(ROWS(), { prefs: { ...DEFAULT_PREFS, showVenuePhotos: false } });
    expect(off).toEqual(on);
    expect(off.cardsById['t-rome'].cover.kind).toBe('legacy');
    expect(off.hops.every((hop) => hop.cover.kind === 'legacy')).toBe(true);
  });
});

describe('plans still being planned', () => {
  it('are never featured, counted in the statistics or pinned on the map, whatever their dates', () => {
    const today = dublin({ id: 't-now', start_date: '2027-03-08', end_date: '2027-03-12' });
    const soon = istanbul({ id: 't-soon', start_date: '2027-03-11', end_date: '2027-03-12' });
    const model = build([today, soon, vancouver()]);
    expect(ids(model.sections.inProgress)).toEqual(['t-now', 't-soon']);
    expect(model.live).toEqual([]);
    expect(model.next.trip.id).toBe('t-vancouver');
    expect(model.stats.trips).toBe(1);
    expect(model.pins.map((pin) => pin.place)).toEqual(['Lisbon', 'Vancouver']);
    expect(model.cardsById['t-now']).toMatchObject({ phase: 'generating', daysToGo: null, dayNumber: null, todayHref: null, readiness: null, briefingPending: false });
  });
  it('take the day total from the dates, else from the wizard, else leave it unknown', () => {
    const progress = { 't-dublin': { daysDone: 4 }, 't-flex': { daysDone: 4, slow: true }, 't-open': {} };
    const flexible = dublin({ id: 't-flex', start_date: null, end_date: null, wizard_state: { ...dublin().wizard_state, dates: { duration: 13 } } });
    const open = dublin({ id: 't-open', start_date: null, end_date: null });
    const { cardsById } = build([dublin(), flexible, open], { generation: progress });
    expect(cardsById['t-dublin'].generation).toEqual({ daysDone: 4, daysTotal: 9, etaMinutes: estimateGenerationMinutes(5), slow: false, error: '' });
    expect(cardsById['t-flex'].generation).toEqual({ daysDone: 4, daysTotal: 13, etaMinutes: estimateGenerationMinutes(9), slow: true, error: '' });
    expect(cardsById['t-open'].generation).toEqual({ daysDone: null, daysTotal: null, etaMinutes: null, slow: false, error: '' });
    expect(build([dublin()]).cardsById['t-dublin'].generation).toMatchObject({ daysDone: null, daysTotal: 9, etaMinutes: estimateGenerationMinutes(9) });
    expect(build([dublin()], { generation: { 't-dublin': { daysDone: 4, etaMinutes: 7 } } }).cardsById['t-dublin'].generation.etaMinutes).toBe(7);
  });
  it('say how far a stopped plan got, and nothing about a cause nobody knows', () => {
    const { cardsById } = build([istanbul(), istanbul({ id: 't-unknown' })], { generation: { 't-istanbul': { daysDone: 6, error: 'worker lease expired' } } });
    expect(cardsById['t-istanbul'].generation).toEqual({ daysDone: 6, daysTotal: 9, etaMinutes: null, slow: false, error: 'Planning stopped after 6 of 9 days.' });
    expect(cardsById['t-unknown'].generation.error).toBe('Planning stopped.');
    expect(cardsById['t-istanbul']).toMatchObject({ phase: 'failed', shared: false });
  });
});

describe('two plans live at once', () => {
  const second = (over = {}) => row('t-athens', 'Athens', ['athens'], '2027-03-08', '2027-03-16', over);
  const lead = (rows, over) => build(rows, over).live.map((briefing) => [briefing.trip.id, briefing.isLead]);

  it('leads with the plan opened most recently on this device', () => {
    expect(lead([seville(), second()], { offlineIds: ['t-rome', 't-seville', 't-athens'] })).toEqual([['t-seville', true], ['t-athens', false]]);
    expect(lead([seville(), second()], { offlineIds: ['t-athens', 't-seville'] })).toEqual([['t-athens', true], ['t-seville', false]]);
    expect(lead([seville(), second()], { offlineIds: [{ id: 't-seville' }] })).toEqual([['t-seville', true], ['t-athens', false]]);
  });
  it('else with the later start date', () => {
    expect(lead([seville(), second()])).toEqual([['t-athens', true], ['t-seville', false]]);
  });
  it('else with the plan made later', () => {
    const sameStart = second({ start_date: '2027-03-04', created_at: '2026-05-01T10:00:00+00:00' });
    expect(lead([sameStart, seville()])).toEqual([['t-seville', true], ['t-athens', false]]);
  });
  it('else with the greater id, so the rule always decides', () => {
    const twin = second({ start_date: '2027-03-04' });
    expect(lead([twin, seville()])).toEqual([['t-seville', true], ['t-athens', false]]);
    expect(lead([seville(), twin])).toEqual([['t-seville', true], ['t-athens', false]]);
  });
  it('keeps the section in the same order, lead first', () => {
    const model = build([seville(), second()]);
    expect(ids(model.sections.live)).toEqual(['t-athens', 't-seville']);
    expect(model.live[0].trip).toBe(model.sections.live[0]);
    expect(checkDashboardModel(model)).toEqual([]);
  });
});

describe('briefingIds', () => {
  it('lists live plans first, then upcoming by start date, and nothing else', () => {
    expect(briefingIds(ROWS(), NOW, 8, DEVICE)).toEqual(['t-seville', 't-marrakech', 't-vancouver']);
  });
  it('stops at the cap, which is eight unless said otherwise', () => {
    const many = Array.from({ length: 12 }, (_, i) => row(`t-up-${String(i).padStart(2, '0')}`, `Plan ${i}`, ['rome'], `2027-04-${String(20 - i).padStart(2, '0')}`, `2027-04-${String(21 - i).padStart(2, '0')}`));
    const rows = [...many, seville()];
    expect(briefingIds(rows, NOW, 3, DEVICE)).toEqual(['t-seville', 't-up-11', 't-up-10']);
    expect(briefingIds(rows, NOW, undefined, DEVICE)).toHaveLength(8);
    expect(briefingIds(rows, NOW, 0, DEVICE)).toEqual([]);
    expect(briefingIds(null, NOW)).toEqual([]);
  });
  it('marks the cards whose briefing is still awaited', () => {
    const { cardsById } = build();
    expect(ids(Object.values(cardsById).filter((card) => card.briefingPending))).toEqual(['t-seville', 't-marrakech', 't-vancouver']);
    expect(cardsById['t-seville']).toMatchObject({ readiness: null, weather: null });
    const capped = build(ROWS(), { briefingMax: 1 }).cardsById;
    expect(ids(Object.values(capped).filter((card) => card.briefingPending))).toEqual(['t-seville']);
  });
});

describe('applyDashboardFilter', () => {
  const model = build([...ROWS(), row('t-porto', 'Porto weekend', ['porto'], '2027-04-02', '2027-04-05', { shared: true, collab_role: 'viewer' })]);

  it('narrows the sections and the month groups, and leaves the rest of the model whole', () => {
    const past = applyDashboardFilter(model, { filter: 'past' });
    expect(past).not.toBe(model);
    expect(ids(past.sections.past)).toEqual(['t-rome', 't-copenhagen', 't-lima']);
    expect([past.sections.inProgress, past.sections.live, past.sections.upcoming, past.sections.undated]).toEqual([[], [], [], []]);
    expect(past.pastByMonth).toEqual(model.pastByMonth);
    expect(past.filter).toEqual({ ...model.filter, active: 'past', expanded: true });
    for (const key of ['cardsById', 'live', 'next', 'counts', 'stats', 'pins', 'hops', 'credits', 'user', 'now']) expect(past[key]).toBe(model[key]);
    expect(checkDashboardModel(past)).toEqual([]);
  });
  it('shows a section per filter', () => {
    const shown = (filter) => Object.values(applyDashboardFilter(model, { filter }).sections).flatMap(ids);
    expect(shown('live')).toEqual(['t-seville']);
    expect(shown('upcoming')).toEqual(['t-marrakech', 't-porto', 't-vancouver']);
    expect(shown('shared')).toEqual(['t-porto']);
    expect(shown('all')).toHaveLength(10);
    expect(shown('nonsense')).toHaveLength(10);
    expect(applyDashboardFilter(model, { filter: 'nonsense' }).filter).toMatchObject({ active: 'all', expanded: false });
  });
  it('searches titles, places and countries, whatever the case, every word', () => {
    const found = (q, filter) => Object.values(applyDashboardFilter(model, { q, filter }).sections).flatMap(ids);
    expect(found('ROME')).toEqual(['t-rome']);
    expect(found('  italy ')).toEqual(['t-rome', 't-florence']);
    expect(found('coast canada')).toEqual(['t-vancouver']);
    expect(found('o', 'shared')).toEqual(['t-porto']);
    expect(found('zzz')).toEqual([]);
    expect(found('dublin')).toEqual(['t-dublin']);
  });
  it('drops a month group with no match and keeps the groups in order', () => {
    const groups = applyDashboardFilter(model, { q: 'n' }).pastByMonth.map((group) => [group.key, ids(group.trips)]);
    expect(groups).toEqual([['2026-11', ['t-rome']], ['2026-09', ['t-copenhagen']]]);
  });
  it('is expanded exactly while a query or a filter is on, and keeps the query as typed', () => {
    expect(applyDashboardFilter(model, { q: ' Rome ' }).filter).toMatchObject({ q: ' Rome ', active: 'all', expanded: true });
    expect(applyDashboardFilter(model, { q: '', filter: 'all' }).filter).toMatchObject({ q: '', active: 'all', expanded: false });
    expect(applyDashboardFilter(model).sections).toEqual(model.sections);
    expect(applyDashboardFilter(model, { q: '   ' }).filter.expanded).toBe(true);
  });
  it('filters again from the whole model, not from what an earlier filter left', () => {
    const past = applyDashboardFilter(model, { filter: 'past' });
    const upcoming = applyDashboardFilter(past, { filter: 'upcoming' });
    expect(ids(upcoming.sections.upcoming)).toEqual(['t-marrakech', 't-porto', 't-vancouver']);
    expect(applyDashboardFilter(past, { filter: 'all' }).sections).toEqual(model.sections);
  });
  it('keeps the order of the sections even for ids an object would reorder', () => {
    const numbered = build([row('9', 'Later plan', ['rome'], '2027-06-01', '2027-06-05'), row('10', 'Sooner plan', ['porto'], '2027-04-02', '2027-04-05')]);
    expect(ids(numbered.sections.upcoming)).toEqual(['10', '9']);
    expect(ids(applyDashboardFilter(numbered, { q: 'plan' }).sections.upcoming)).toEqual(['10', '9']);
    expect(checkDashboardModel(applyDashboardFilter(numbered, { q: 'plan' }))).toEqual([]);
  });
  it('never changes the model it was given', () => {
    const frozen = deepFreeze(build());
    expect(() => applyDashboardFilter(frozen, { q: 'rome', filter: 'past' })).not.toThrow();
  });
});

describe('short hops, pins, statistics and credits', () => {
  it('lists the nearest catalogue places from home with what is planned there', () => {
    const { hops } = build();
    expect(hops.map((hop) => hop.name)).toEqual(['Porto', 'Seville', 'Marrakech']);
    expect(hops.map((hop) => hop.note)).toEqual(['New for you', 'Planned Mar 2027', 'Planned Mar 2027']);
  });
  it('has no hops without a home city in the catalogue, and none for a full-time traveller', () => {
    expect(build(ROWS(), { profile: { ...PROFILE, home_city: null } }).hops).toEqual([]);
    expect(build(ROWS(), { profile: { ...PROFILE, home_city: 'Sintra' } }).hops).toEqual([]);
    expect(build(ROWS(), { profile: { ...PROFILE, is_nomad: true } }).hops).toEqual([]);
    expect(build(ROWS(), { catalogue: null }).hops).toEqual([]);
  });
  it('pins every place once with the plans that name it, and home first', () => {
    const again = row('t-rome-2', 'Rome again', ['rome', 'florence'], '2027-06-01', '2027-06-05');
    const model = build([rome(), again, seville(), row('t-hills', 'Sintra hills on foot', [{ ...CUSTOM_PLACE }], '2026-12-05', '2026-12-06')]);
    expect(model.pins.map((pin) => [pin.place, pin.kind, pin.tripIds])).toEqual([
      ['Lisbon', 'home', []], ['Seville', 'live', ['t-seville']], ['Rome', 'up', ['t-rome-2', 't-rome']], ['Florence', 'up', ['t-rome-2']],
    ]);
    expect(model.pins[2]).toMatchObject({ label: 'Rome, 2 plans', count: 2, href: '#/trip/t-rome-2', todayHref: null, at: [P.rome.lat, P.rome.lng] });
    expect(build(ROWS(), { profile: { ...PROFILE, home_city: 'Sintra' } }).pins.some((pin) => pin.kind === 'home')).toBe(false);
  });
  it('adds the plans up', () => {
    const { stats } = build();
    expect(stats).toMatchObject({ trips: 7, countries: 6, cities: 7, daysPlanned: 54, firstDate: '2026-02-05', lastDate: '2027-05-17' });
    expect(stats.byCountry.find((entry) => entry.flag === 'es')).toMatchObject({ phase: 'live', isHome: false });
    expect(stats.extremes.farthest.name).toBe('Lima');
    expect(stats.spendHome.code).toBe('EUR');
    expect(build(ROWS(), { profile: { ...PROFILE, home_city: 'Sintra' } }).stats.extremes.farthest).toBeNull();
  });
  it('credits every photo once: the covers of the plans and of the hops', () => {
    const { credits } = build([rome(), row('t-rome-2', 'Rome again', ['rome'], '2027-06-01', '2027-06-05'), row('t-porto', 'Porto weekend', ['porto'], '2027-04-02', '2027-04-05')]);
    const links = credits.map((credit) => credit.link);
    expect(new Set(links).size).toBe(links.length);
    expect(credits).toContainEqual({ label: 'Wikimedia Commons', full: 'Photo: Wikimedia Commons', link: 'https://commons.wikimedia.org/wiki/File:Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg' });
    expect(links.filter((link) => link.includes('Oporto'))).toHaveLength(1);        // a plan and a hop share the photo
    expect(links.some((link) => link.includes('Sevilla'))).toBe(true);              // a hop nobody planned yet
  });
});
