// Opt-in check of the trip overview model against the captured plans in previews/fixtures (ruling
// R9). That folder is never committed and does not exist in CI: without it every test here is
// skipped. The file holds derived values only (phases, counts, sums, status texts of the app's own
// vocabulary), never a name, a place, a date or a stored text from a row.
//
// Fixed inputs: now is 2026-11-19T10:10+08:00 on a device in Singapore, no ticks, the signed-in user
// is the owner of each plan. The entry check runs for real, against the public visa tables in
// public/data/visa, read from disk. Each plan is also read 30 days before it starts, so the
// readiness rule is exercised for the plans that are past on the fixed date.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTripOverviewModel } from './trip-overview-model.js';
import { DEFAULT_PREFS } from './prefs.js';
import { setLocaleFromFlag } from './locale.js';
import { costText } from './money.js';
import { groundJourney, journeyMode, normaliseTransportExtras } from './journey.js';
import { entryPlan } from '../services/entry-advisor.js';
import { checkTripModel } from '../views/fixtures/shape.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = `${ROOT}previews/fixtures/`;
const NOW = new Date('2026-11-19T10:10:00+08:00');
const DEVICE = 'Asia/Singapore';
const DAY_MS = 86400000;
const NO_TICKS = { quick: {}, checklist: {}, entryDone: {} };
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/**
 * file -> what the model says today, and under `before` the status and the readiness list 30 days
 * before the plan starts. `days` is [dayCount, nights, itineraryDays, day rows]; `live.day` is
 * [dayNumber, dayCount, dayIndex]; `areas` is [areas, areas with a photo]; `tips` is [shown, total];
 * `photos` is [days with a thumb, photos in all]. Written down by the builder on 2026-11-20 after reading each
 * model against its row and recounting the numbers from the row by hand; a person has yet to confirm them.
 */
const EXPECTED = {
  // An upcoming plan with suggested flights: nothing booked, nothing to file for entry.
  'trip-hk.json': {
    status: 'ok', phase: 'upcoming', statusText: 'In 100 days', daysToGo: 100, days: [10, 9, 10, 10], stops: 61, perDay: 'about 6 a day',
    placeLine: false, flags: 1, live: null,
    readiness: ['1 of 4 ready', 'Flights: Not booked yet', 'Stay: None booked', 'Entry requirements: Nothing to file', 'Reservations: 2 to book'],
    cost: '~S$1,099 per person, activities only. HKD 6,347', budget: 'HKD 17,900', budgetHome: 'S$3,098',
    route: { kind: 'flight', mode: 'plane', codes: true, booked: false, times: false, suggested: true },
    glance: 'ready stops cost weather pace stay', weather: '16 to 23°C', pace: 'Relaxed', stay: true, interests: 3, areas: [9, 9], tips: [2, 4],
    map: 61, photos: [10, 39], credits: 30, cover: 'v2', actions: 'share pdf edit tune read-view regenerate delete', role: 'owner', imported: false,
    before: ['In 30 days', '1 of 4 ready', 'Flights: Not booked yet', 'Stay: None booked', 'Entry requirements: Nothing to file', 'Reservations: 2 to book'],
  },
  // Live on the fixed date: day 10 of 12, at ten past three in the morning there, so the whole day is still ahead.
  'trip-live-oslo.json': {
    status: 'ok', phase: 'live', statusText: 'Day 10 of 12', daysToGo: null, days: [12, 11, 12, 12], stops: 103, perDay: 'about 9 a day',
    // later: every stop after the next one (8 stops that day, so 7), the figure the dashboard card states.
    placeLine: false, flags: 1, live: { day: [10, 12, 9], nextStop: true, later: 7, todayRows: 1 },
    readiness: ['1 of 4 ready', 'Flights: Not booked yet', 'Stay: None booked', 'Entry requirements: Nothing to file', 'Reservations: 7 to book'],
    cost: '~S$3,040 per person, activities only. NOK 21,846', budget: 'NOK 5,760', budgetHome: 'S$802',
    route: { kind: 'multi', mode: 'plane', codes: false, booked: false, times: false, suggested: false },
    glance: 'stops cost weather pace stay', weather: '-7 to 5°C', pace: 'Active', stay: true, interests: 7, areas: [8, 8], tips: [2, 5],
    map: 46, photos: [11, 36], credits: 1, cover: 'v2', actions: 'share pdf edit tune read-view regenerate delete', role: 'owner', imported: false,
    before: ['In 30 days', '1 of 4 ready', 'Flights: Not booked yet', 'Stay: None booked', 'Entry requirements: Nothing to file', 'Reservations: 7 to book'],
  },
  // Three cities, past: no readiness today, the route runs from the first city to the last.
  'trip-multicity-helsinki.json': {
    status: 'ok', phase: 'past', statusText: 'Past plan', daysToGo: null, days: [12, 11, 12, 12], stops: 103, perDay: 'about 9 a day',
    placeLine: false, flags: 1, live: null,
    readiness: null,
    cost: '~S$2,907 per person, activities only. €1,981', budget: '€4,416', budgetHome: 'S$6,480',
    route: { kind: 'multi', mode: 'plane', codes: false, booked: false, times: false, suggested: false },
    glance: 'stops cost weather pace stay', weather: '9 to 23°C', pace: 'Packed', stay: true, interests: 7, areas: [23, 19], tips: [2, 6],
    map: 103, photos: [12, 48], credits: 1, cover: 'legacy', actions: 'share pdf edit tune read-view regenerate delete', role: 'owner', imported: false,
    before: ['In 30 days', '1 of 4 ready', 'Flights: Not booked yet', 'Stay: None booked', 'Entry requirements: Nothing to file', 'Reservations: 8 to book'],
  },
  // A coach journey: a ground route, and Transport instead of Flights before departure.
  'trip-ground-genting.json': {
    status: 'ok', phase: 'past', statusText: 'Past plan', daysToGo: null, days: [5, 4, 5, 5], stops: 44, perDay: 'about 9 a day',
    placeLine: false, flags: 1, live: null,
    readiness: null,
    cost: '~S$593 per person, activities only. RM2,065', budget: 'RM5,170', budgetHome: 'S$1,485',
    route: { kind: 'ground', mode: 'bus', codes: false, booked: false, times: false, suggested: false },
    glance: 'stops cost weather pace stay', weather: '16 to 24°C', pace: 'Balanced', stay: true, interests: 2, areas: [3, 3], tips: [2, 6],
    map: 39, photos: [5, 19], credits: 1, cover: 'v2', actions: 'share pdf edit tune read-view regenerate delete', role: 'owner', imported: false,
    before: ['In 30 days', '1 of 4 ready', 'Transport: Not arranged yet', 'Stay: None booked', 'Entry requirements: Nothing to file', 'Reservations: 7 to book'],
  },
  // A plan in the home city: at home, priced in the home currency, only reservations to arrange.
  'trip-homecity-singapore.json': {
    status: 'ok', phase: 'past', statusText: 'Past plan', daysToGo: null, days: [12, 11, 12, 12], stops: 88, perDay: 'about 7 a day',
    placeLine: false, flags: 1, live: null,
    readiness: null,
    cost: 'S$4,628 per person, activities only', budget: 'S$6,480', budgetHome: null,
    route: { kind: 'home', mode: 'car', codes: false, booked: false, times: false, suggested: false },
    glance: 'stops cost weather pace stay', weather: '24 to 32°C', pace: 'Packed', stay: true, interests: 6, areas: [14, 12], tips: [2, 5],
    map: 88, photos: [12, 48], credits: 1, cover: 'v2', actions: 'share pdf edit tune read-view regenerate delete', role: 'owner', imported: false,
    before: ['In 30 days', '0 of 1 ready', 'Reservations: 10 to book'],
  },
  // Imported with booked flights that carry their times: no pace, no stay fact, no regenerate, spend above the budget.
  'trip-imported-hokkaido.json': {
    status: 'ok', phase: 'upcoming', statusText: 'In 55 days', daysToGo: 55, days: [14, 13, 14, 14], stops: 76, perDay: 'about 5 a day',
    placeLine: true, flags: 1, live: null,
    readiness: ['2 of 4 ready', 'Flights: Booked', 'Stay: None booked', 'Entry requirements: Nothing to file', 'Reservations: 10 to book'],
    cost: '~S$4,228 per person, activities only. ¥485,400', budget: '¥294,000', budgetHome: 'S$2,561',
    route: { kind: 'flight', mode: 'plane', codes: true, booked: true, times: true, suggested: false },
    glance: 'ready stops cost weather', weather: '-18 to 0°C', pace: '', stay: false, interests: 0, areas: [0, 0], tips: [2, 6],
    map: 43, photos: [13, 42], credits: 33, cover: 'v2', actions: 'share pdf edit tune read-view delete', role: 'owner', imported: true,
    before: ['In 30 days', '2 of 4 ready', 'Flights: Booked', 'Stay: None booked', 'Entry requirements: Nothing to file', 'Reservations: 10 to book'],
  },
  // Nine itinerary rows over ten calendar days; flights and stay arranged before planning, so the flight is not called suggested.
  'trip-settled-melbourne.json': {
    status: 'ok', phase: 'past', statusText: 'Past plan', daysToGo: null, days: [10, 9, 9, 9], stops: 85, perDay: 'about 9 a day',
    placeLine: false, flags: 1, live: null,
    readiness: null,
    cost: '~S$2,316 per person, activities only. A$2,659', budget: 'A$50', budgetHome: 'S$44',
    route: { kind: 'flight', mode: 'plane', codes: true, booked: false, times: false, suggested: false },
    glance: 'stops cost weather pace stay', weather: '10 to 19°C', pace: 'Active', stay: true, interests: 6, areas: [20, 17], tips: [2, 6],
    map: 84, photos: [9, 36], credits: 1, cover: 'v2', actions: 'share pdf edit tune read-view regenerate delete', role: 'owner', imported: false,
    before: ['In 30 days', '2 of 4 ready', 'Flights: Sorted', 'Stay: Sorted', 'Entry requirements: 2 things to do', 'Reservations: 8 to book'],
  },
};

/** What a person would check on the page, as values that say nothing about where the plan goes. */
function summary(model) {
  const { route, readiness, live, cost } = model;
  const fact = (key) => model.glance.find((entry) => entry.key === key);
  return {
    status: model.status, phase: model.phase, statusText: model.statusText, daysToGo: model.daysToGo,
    days: [model.dates.dayCount, model.dates.nights, model.dates.itineraryDays, model.days.length],
    stops: model.days.reduce((sum, row) => sum + row.stops, 0), perDay: fact('stops')?.note ?? null,
    placeLine: model.placeLine !== '', flags: model.flags.length,
    live: live && { day: [live.dayNumber, live.dayCount, live.dayIndex], nextStop: Boolean(live.today?.nextStop), later: live.today?.laterToday.length ?? 0, todayRows: model.days.filter((row) => row.isToday).length },
    readiness: readiness && [readiness.headline, ...readiness.items.map((item) => `${item.label}: ${item.status}`)],
    cost: costText(cost), budget: cost.budget?.text ?? null, budgetHome: cost.budgetHome?.text ?? null,
    route: { kind: route.kind, mode: route.mode, codes: Boolean(route.from.code && route.to.code), booked: route.booked, times: Boolean(route.times), suggested: route.detail.endsWith('suggested') },
    glance: model.glance.map((entry) => entry.key).join(' '), weather: fact('weather')?.value ?? null, pace: model.brief.pace, stay: Boolean(fact('stay')),
    interests: model.brief.interests.length, areas: [model.areas.length, model.areas.filter((area) => area.photo).length], tips: [model.tips.shown.length, model.tips.total],
    map: model.map.points.length, photos: [model.days.filter((row) => row.thumb).length, model.days.reduce((sum, row) => sum + row.photos.length, 0)],
    credits: model.credits.length, cover: model.cover.kind, actions: model.actions.map((action) => action.key).join(' '), role: model.role, imported: model.imported,
  };
}

async function derive(file, profile) {
  const trip = [readJson(FIXTURES + file)].flat()[0];
  const extras = normaliseTransportExtras(trip.extras ?? null, trip.wizard_state?.transport?.mode);
  const ground = groundJourney(extras);
  const own = profile.nationality ? [profile.nationality] : [];
  const passports = Array.isArray(trip.wizard_state?.passports) && trip.wizard_state.passports.length ? trip.wizard_state.passports : own;
  const entry = await entryPlan({
    wizardState: trip.wizard_state, extras, passports, homeFlag: profile.home_flag,
    groundMode: ground ? journeyMode(ground) : '', tripStart: trip.start_date || null, tripEnd: trip.end_date || null,
  });
  const at = (now, prefs = DEFAULT_PREFS) => buildTripOverviewModel({ trip, now, deviceZone: DEVICE, prefs, profile, ticks: NO_TICKS, entry, userId: trip.user_id });
  const before = at(new Date(Date.parse(`${trip.start_date}T04:00:00Z`) - 30 * DAY_MS));
  return { today: at(NOW), before, noPhotos: at(NOW, { ...DEFAULT_PREFS, showVenuePhotos: false }) };
}

describe.skipIf(!existsSync(`${FIXTURES}profile.json`))('the trip overview model for the captured plans', () => {
  let profile;
  beforeAll(() => {
    setLocaleFromFlag('sg');
    profile = [readJson(`${FIXTURES}profile.json`)].flat()[0];
    // The entry check fetches the public visa tables: served here from public/, nothing leaves the machine.
    vi.stubGlobal('fetch', async (url) => {
      const path = `${ROOT}public${String(url)}`;
      if (!String(url).startsWith('/data/visa/') || !existsSync(path)) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => readJson(path) };
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it.each(Object.keys(EXPECTED))('%s', async (file) => {
    if (!existsSync(FIXTURES + file)) return;
    const { today, before, noPhotos } = await derive(file, profile);
    expect(checkTripModel(today)).toEqual([]);
    expect(checkTripModel(before)).toEqual([]);
    const got = { ...summary(today), before: [before.statusText, ...(summary(before).readiness ?? [])] };
    expect(got).toEqual(EXPECTED[file]);
    expect(noPhotos.days.every((row) => row.thumb === null && row.photos.length === 0)).toBe(true);
    expect(noPhotos.areas.every((area) => area.photo === '')).toBe(true);
    expect(noPhotos.credits.length).toBeLessThanOrEqual(1);
    expect(noPhotos.cover).toEqual(today.cover);
  });
});
