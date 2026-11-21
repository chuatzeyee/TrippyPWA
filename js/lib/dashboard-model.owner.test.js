// Opt-in check of the dashboard model against the captured list in previews/fixtures (rulings R9
// and R19). That folder is never committed and does not exist in CI: without it every test here is
// skipped. The file holds derived values only (counts, phases, status numbers), never a name, a
// place or a date from a row.
//
// Fixed inputs: now is 2026-11-19T10:10+08:00 on a device in Singapore, no ticks, nothing saved on
// the device. The first block reads trips-list.json with no briefings (the numbers the previews
// show); the second reads the list taken with the new select together with briefings.json.
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDashboardModel, applyDashboardFilter, briefingIds } from './dashboard-model.js';
import { buildTripOverviewModel } from './trip-overview-model.js';
import { DEFAULT_PREFS } from './prefs.js';
import { setLocaleFromFlag } from './locale.js';
import { costFigures } from './money.js';
import { canConvert } from '../data/currencies.js';
import { DESTINATIONS } from '../wizard/destinations.js';
import { checkDashboardModel } from '../views/fixtures/shape.js';

const FIXTURES = fileURLToPath(new URL('../../previews/fixtures/', import.meta.url));
const NOW = new Date('2026-11-19T10:10:00+08:00');
const DEVICE = 'Asia/Singapore';
const has = (...files) => files.every((file) => existsSync(FIXTURES + file));
const read = (file) => JSON.parse(readFileSync(FIXTURES + file, 'utf8'));

// The fixtures are raw answers of the two selects. These two functions give them the shape the
// repository hands on (toListRow and toBriefingRow in js/data/trip-repository.js, which are private).
function toListRow(raw) {
  const { ws_multi, ws_destination, ws_destinations, ws_imported, ws_duration, import_pending, ...rest } = raw;
  const duration = Number(ws_duration);
  return {
    ...rest, shared: false, collab_role: null,
    wizard_state: {
      multiCity: Boolean(ws_multi), destination: ws_destination ?? null, destinations: ws_destinations ?? [],
      ...(ws_imported === true ? { imported: true } : {}), ...(duration > 0 ? { dates: { duration } } : {}),
    },
  };
}
const byDay = (a, b) => a.day_number - b.day_number;
const toBriefingRow = (raw) => ({
  id: raw.id, timezone: raw.timezone ?? null,
  extras: { flights: raw.flights ?? null, transport: raw.transport ?? null, accommodation: raw.accommodation ?? null, bookingChecklist: raw.checklist ?? null },
  wizard_state: {
    passports: raw.ws_passports ?? null, transport: { mode: raw.ws_transport_mode ?? null },
    flights: { settled: raw.ws_flights_settled === true }, accommodation: { settled: raw.ws_stay_settled === true },
  },
  days: [...(raw.days ?? [])].sort(byDay), stops: [...(raw.stops ?? [])].sort(byDay),
});
const build = (rows, briefings = []) => buildDashboardModel({
  rows, briefings, now: NOW, deviceZone: DEVICE, prefs: DEFAULT_PREFS, profile: [read('profile.json')].flat()[0], ticks: {}, entries: {},
  catalogue: DESTINATIONS, offlineIds: [],
});
const cardsOf = (model) => Object.values(model.cardsById);

beforeAll(() => setLocaleFromFlag('sg'));

describe.skipIf(!has('trips-list.json', 'profile.json'))('the captured list, with no briefings', () => {
  let rows;
  let model;
  beforeAll(() => { rows = read('trips-list.json').map(toListRow); model = build(rows); });

  it('conforms to the contract', () => {
    expect(checkDashboardModel(model)).toEqual([]);
    expect(checkDashboardModel(applyDashboardFilter(model, { filter: 'past', q: 'a' }))).toEqual([]);
  });
  it('sorts 22 plans into 2 live, 4 upcoming and 16 past', () => {
    const { sections } = model;
    expect(model.state).toBe('ready');
    expect([sections.inProgress, sections.live, sections.upcoming, sections.past, sections.undated].map((list) => list.length)).toEqual([0, 2, 4, 16, 0]);
    expect(model.counts).toEqual({ all: 22, live: 2, upcoming: 4, past: 16, shared: 0 });
    expect(model.pastByMonth.map((group) => group.trips.length)).toEqual([2, 2, 10, 2]);
  });
  it('has the next departure in 12 days, for 12 days', () => {
    expect(model.next.trip).toBe(model.sections.upcoming[0]);
    expect(model.next).toMatchObject({ daysToGo: 12, lengthText: '12 days, 11 nights', todo: [], settled: [] });
    expect(model.next.route.kind).toBe('none');             // no briefing yet: the two names only
    expect(model.sections.upcoming.map((card) => card.daysToGo)).toEqual([12, 33, 55, 100]);
  });
  it('adds up to 240 days planned in 13 countries and 28 cities', () => {
    expect(model.stats).toMatchObject({ trips: 22, daysPlanned: 240, countries: 13, cities: 28, calendarDays: 123, spendUnconverted: 0 });
    expect(model.stats.byCountry).toHaveLength(13);
    // The passport line: 11 countries in past or running plans (2 of them running now), 2 still ahead.
    const phases = model.stats.byCountry.map((entry) => entry.phase);
    expect(['past', 'live', 'upcoming'].map((phase) => phases.filter((entry) => entry === phase).length)).toEqual([9, 2, 2]);
    expect(model.stats.byCountry.filter((entry) => entry.isHome)).toHaveLength(1);
    expect(model.stats.byCountry.every((entry) => entry.code3 !== null)).toBe(true);
    expect(model.stats.byMonth.map((month) => month.days)).toEqual([7, 22, 0, 0, 19, 17, 12, 22, 14, 2, 8]);
    expect(model.stats.byMonth.map((month) => month.phase[0]).join('')).toBe('ppppppnffff');
  });
  it('carries no empty flag anywhere, although one place has no country', () => {
    const cards = cardsOf(model);
    expect(cards.flatMap((card) => card.flags).every((flag) => /^[a-z]{2}$/.test(flag))).toBe(true);
    expect(model.stats.byCountry.every((entry) => /^[a-z]{2}$/.test(entry.flag) && entry.country !== '')).toBe(true);
    expect(cards.flatMap((card) => card.places).filter((place) => place.flag === '' || place.country === '')).toHaveLength(1);
    expect(model.pins).toHaveLength(28);                    // 27 places with coordinates and the home pin
    expect(model.pins.filter((pin) => pin.kind === 'home')).toHaveLength(1);
  });
  it('gives the two live plans, which start on the same day, a lead by the tie-break', () => {
    const [lead, other] = model.live;
    expect(model.live.map((briefing) => briefing.isLead)).toEqual([true, false]);
    expect(lead.trip.dates.start).toBe(other.trip.dates.start);
    const madeAt = (briefing) => Date.parse(rows.find((row) => row.id === briefing.trip.id).created_at);
    expect(madeAt(lead)).toBeGreaterThan(madeAt(other));    // nothing is saved on the device: the plan made later leads
    expect(model.live.map((briefing) => [briefing.dayNumber, briefing.dayCount, briefing.daysLeft])).toEqual([[10, 12, 2], [10, 12, 2]]);
    expect(model.live.every((briefing) => briefing.today === null && briefing.nextStop === null && briefing.trip.briefingPending)).toBe(true);
  });
  it('reads the one plan with nine itinerary days over ten calendar days as ten days long', () => {
    const uneven = cardsOf(model).filter((card) => card.dates.dayCount !== card.dates.itineraryDays);
    expect(uneven.map((card) => [card.dates.dayCount, card.dates.itineraryDays, card.dates.nights, card.phase])).toEqual([[10, 9, 9, 'past']]);
  });
  it('asks for six briefings and marks those six cards as waiting', () => {
    expect(briefingIds(rows, NOW, 8, DEVICE)).toHaveLength(6);
    expect(cardsOf(model).filter((card) => card.briefingPending).map((card) => card.phase)).toEqual(['live', 'live', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });
  it('offers seven short hops from home, nearest first, four of them already in a plan', () => {
    expect(model.hops).toHaveLength(7);
    expect(model.hops.filter((hop) => hop.note !== 'New for you')).toHaveLength(4);
    expect(model.hops.every((hop) => /^(New for you|Planned [A-Z][a-z]{2} \d{4})$/.test(hop.note))).toBe(true);
    expect(model.user.homeTimezone).not.toBeNull();
  });
});

describe.skipIf(!has('trips-list-new-select.json', 'briefings.json', 'profile.json'))('the captured list with its briefings', () => {
  let model;
  beforeAll(() => { model = build(read('trips-list-new-select.json').map(toListRow), read('briefings.json').map(toBriefingRow)); });

  it('conforms to the contract and keeps the same sections', () => {
    expect(checkDashboardModel(model)).toEqual([]);
    expect(model.counts).toEqual({ all: 22, live: 2, upcoming: 4, past: 16, shared: 0 });
    expect(model.stats).toMatchObject({ trips: 22, daysPlanned: 240, countries: 13, cities: 28 });
    expect(cardsOf(model).some((card) => card.briefingPending)).toBe(false);
  });
  it('knows today, the next stop and tomorrow of both live plans at ten past three in the morning there', () => {
    expect(model.live.map((briefing) => [briefing.dayNumber, briefing.remainingToday, briefing.laterToday.length, briefing.tomorrow?.dayNumber])).toEqual([[10, 8, 3, 11], [10, 6, 3, 11]]);
    expect(model.live.every((briefing) => briefing.today && briefing.nextStop?.time && briefing.tonight?.time && briefing.today.weather)).toBe(true);
  });
  it('reads the readiness of the six live and upcoming plans while the entry check is still running', () => {
    const briefed = [...model.sections.live, ...model.sections.upcoming];
    expect(briefed.map((card) => [card.readiness.headline, card.readiness.pending, card.readiness.collapsed])).toEqual([
      ['0 of 4 ready', 1, true], ['0 of 4 ready', 1, true], ['0 of 4 ready', 1, false], ['0 of 4 ready', 1, false], ['1 of 4 ready', 1, false], ['0 of 4 ready', 1, false],
    ]);
    expect(briefed.every((card) => card.weather?.season.startsWith('typical for'))).toBe(true);
    expect(model.sections.past.every((card) => card.readiness === null)).toBe(true);
  });
  it('draws the next departure as a suggested flight between two airports, with three things to do', () => {
    const { route, todo, settled } = model.next;
    expect(route).toMatchObject({ kind: 'flight', mode: 'plane', booked: false, times: null });
    expect([route.from.code, route.to.code].every((code) => /^[A-Z]{3}$/.test(code))).toBe(true);
    expect(route.from.label).toBe(model.user.homeCity);
    expect(route.detail.endsWith(', suggested')).toBe(true);
    expect(todo.map((item) => item.area)).toEqual(['travel', 'stay', 'reservations']);
    expect(settled).toEqual([]);
  });
});

// The same live day read by both models at the same moment (final pass: the trip page said "3 more
// after it" where the dashboard card said "7 more after it"). Derived values only: counts, and that
// the two models name the same last time; no time, title or place of the row is written here.
describe.skipIf(!has('trip-live-oslo.json', 'trips-list-new-select.json', 'briefings.json', 'profile.json'))('a live plan on the trip page and on its dashboard card', () => {
  let briefing;
  let today;
  let page;
  beforeAll(() => {
    const trip = [read('trip-live-oslo.json')].flat()[0];
    const dashboard = build(read('trips-list-new-select.json').map(toListRow), read('briefings.json').map(toBriefingRow));
    briefing = dashboard.live.find((entry) => entry.trip.id === trip.id);
    page = buildTripOverviewModel({ trip, now: NOW, deviceZone: DEVICE, prefs: DEFAULT_PREFS, profile: [read('profile.json')].flat()[0], ticks: { quick: {}, checklist: {}, entryDone: {} }, userId: trip.user_id });
    today = page.live.today;
  });

  it('counts the same stops still ahead today: the next one and seven more', () => {
    expect(briefing.remainingToday).toBe(8);
    expect(today.laterToday).toHaveLength(7);
    expect(today.laterToday.length + (today.nextStop ? 1 : 0)).toBe(briefing.remainingToday);
  });
  it('names the same next stop and the same last stop of the day', () => {
    expect(today.nextStop).toEqual(briefing.nextStop);
    expect(today.laterToday.slice(0, 3)).toEqual(briefing.laterToday);
    expect(today.laterToday[today.laterToday.length - 1]).toEqual(briefing.tonight);
  });
  it('counts every stop of the plan once: the facts, the day rows and the card agree, placed on the map or not', () => {
    const inRows = page.days.reduce((sum, row) => sum + row.stops, 0);
    expect(inRows).toBe(103);
    expect(page.glance.find((fact) => fact.key === 'stops').value).toBe(String(inRows));
    expect(page.map.points.length).toBeLessThan(inRows);   // some stops have no coordinates: the map is not a count of stops
  });
  it('does not lead the facts with "Ready" while live', () => {
    expect(page.glance.map((fact) => fact.key)).not.toContain('ready');
    expect(page.readiness.collapsed).toBe(true);
  });
});

// The rule for "about" on the rows of the list (final pass: two past rows printed a cost without it
// beside rows that all had it). A figure says "about" exactly when it was converted, so the rows
// without it are the plans priced in the home currency, and no others.
describe.skipIf(!has('trips-list.json', 'profile.json'))('"about" on the costs of the captured list', () => {
  it('is on every plan priced in another currency and on no plan priced in the home currency', () => {
    const model = build(read('trips-list.json').map(toListRow));
    const home = model.user.homeCurrency.code;
    const priced = cardsOf(model).filter((card) => card.cost.local);
    expect(priced.length).toBeGreaterThan(0);
    const plain = priced.filter((card) => !costFigures(card.cost).lead.startsWith('about '));
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((card) => card.cost.local.code === home && card.cost.home === null)).toBe(true);
    const converted = priced.filter((card) => card.cost.local.code !== home);
    expect(converted.every((card) => !canConvert(card.cost.local.code) || costFigures(card.cost).lead.startsWith('about '))).toBe(true);
  });
});
