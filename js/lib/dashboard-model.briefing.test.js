// buildDashboardModel with briefings: what a card, the live block and the next departure gain once
// the briefing of a plan has arrived (blueprint 2.3, 7.2). Invented data only: the sample account of
// the model fixtures on 2027-03-10 at 09:10 UTC, which is 10:10 in Seville.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { buildDashboardModel } from './dashboard-model.js';
import { DEFAULT_PREFS } from './prefs.js';
import { setLocaleFromFlag, setDisplayPrefs } from './locale.js';
import { PLACES as P } from '../views/fixtures/parts.js';
import { checkDashboardModel } from '../views/fixtures/shape.js';

beforeAll(() => setLocaleFromFlag('sg'));
afterEach(() => setDisplayPrefs({ timeFormat: '12h', temperatureUnit: 'C' }));

const NOW = new Date('2027-03-10T09:10:00Z');
const DEVICE = 'Europe/Lisbon';
const PROFILE = {
  userId: 'u-sam', display_name: 'Sam Carvalho', home_city: 'Lisbon', home_flag: 'pt', home_country: 'Portugal',
  home_currency: 'EUR', home_currency_symbol: '€', is_nomad: false, nationality: 'PT',
};
const dest = (key) => { const { file, ...place } = P[key]; return { ...place, currencyCode: 'EUR', currencySymbol: '€', image: '' }; };
const DAY_MS = 86400000;
const addDays = (iso, days) => new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
const spanOf = (start, end) => Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;

function row(id, title, key, start, end, over = {}) {
  return {
    id, title, status: 'generated', start_date: start, end_date: end, created_at: '2026-06-01T10:00:00+00:00', budget_daily: 120, budget_currency: 'EUR',
    budget_currency_symbol: '€', travelers: 2, cover_image: '', timezone: P[key].timezone, itinerary_days: Array.from({ length: spanOf(start, end) }, (_, i) => ({ day_number: i + 1, activities: [] })),
    wizard_state: { multiCity: false, destination: dest(key), destinations: [] }, shared: false, collab_role: null, ...over,
  };
}
const stop = (title, start, slot = 'morning', order = 0) => ({ start_time: start, time_slot: slot, sort_order: order, title, venue_name: `${title} hall` });
const TODAY_STOPS = [
  stop('Morning coffee', '08:30', 'morning', 1), stop('Palace gardens', '11:30', 'morning', 2), stop('Market lunch', '13:30', 'afternoon', 3),
  stop('Square by bike', '16:00', 'afternoon', 4), stop('Pastry stop', '', 'afternoon', 5), stop('Guitar night', '20:30', 'evening', 6),
];
const FLIGHTS = (from, to) => ({
  outbound: { route: `${from} > ${to}`, airline: 'Tagus Air', flightNumber: 'TG412', duration: '1h 35m', tips: '' },
  inbound: { route: `${to} > ${from}`, airline: 'Tagus Air', flightNumber: 'TG415', duration: '1h 35m', tips: '' },
});
const STAYS = [{ name: 'Riad Dar Zitoun', area: 'Medina', city: 'Marrakech', badge: 'Recommended' }, { name: 'Hotel Gueliz Garden', area: 'Gueliz', city: 'Marrakech', badge: 'Best Value' }];
const CHECKLIST = [{ group: 'Must Book Ahead', items: [{ label: 'Hammam session', day: 2 }, { label: 'Balloon flight at sunrise', day: 4 }] }];

/** One briefing row, as fetchTripBriefings() gives it: every day in `days`, the given days in `stops`. */
function briefing(plan, { stops = {}, extras = {}, wizard = {}, days } = {}) {
  const count = spanOf(plan.start_date, plan.end_date);
  return {
    id: plan.id, timezone: plan.timezone,
    extras: { flights: null, transport: null, accommodation: null, bookingChecklist: null, ...extras },
    wizard_state: { passports: null, transport: { mode: null }, flights: { settled: false }, accommodation: { settled: false }, ...wizard },
    days: days ?? Array.from({ length: count }, (_, i) => ({
      day_number: i + 1, date: addDays(plan.start_date, i), title: `Day ${i + 1} title`, weather: { lowC: 10 + i, highC: 20 + i, condition: 'sunny' },
    })),
    stops: Object.entries(stops).map(([date, activities]) => ({ day_number: spanOf(plan.start_date, date), date, activities })),
  };
}
const seville = row('t-seville', 'Seville and the south', 'seville', '2027-03-04', '2027-03-13');
const marrakech = row('t-marrakech', 'Marrakech', 'marrakech', '2027-03-19', '2027-03-25');
const rome = row('t-rome', 'Rome in November', 'rome', '2026-11-12', '2026-11-16');
const sevilleBriefing = (over) => briefing(seville, { stops: { '2027-03-09': [stop('Yesterday', '10:00')], '2027-03-10': TODAY_STOPS, '2027-03-11': [stop('Day trip', '09:00')] }, ...over });
const marrakechBriefing = (over) => briefing(marrakech, { extras: { flights: FLIGHTS('LIS', 'RAK'), accommodation: STAYS, bookingChecklist: CHECKLIST }, ...over });
const VISA_FREE = { passports: ['PT'], countries: [{ iso2: 'MA', role: 'visit', rows: [{ passport: 'PT', visa: { code: 'vf' }, items: [] }] }], checked: true };

const build = (over = {}) => buildDashboardModel({
  rows: [seville, marrakech, rome], briefings: [sevilleBriefing(), marrakechBriefing()], now: NOW, deviceZone: DEVICE, prefs: DEFAULT_PREFS,
  profile: PROFILE, ticks: {}, entries: {}, catalogue: [], offlineIds: [], ...over,
});
const areas = (readiness) => readiness.items.map((item) => [item.area, item.label, item.state, item.status]);

describe('the live block', () => {
  it('says which day it is, what is next and what comes after', () => {
    const [live] = build().live;
    expect(live).toMatchObject({ isLead: true, timezone: 'Europe/Madrid', dayNumber: 7, dayCount: 10, daysLeft: 3, endText: 'Sat 13 Mar' });
    expect(live.today).toEqual({ dateText: 'Wed 10 Mar', title: 'Day 7 title', weather: { lowC: 16, highC: 26, range: '16 to 26°C', condition: 'Sunny', season: 'typical for early March' } });
    expect(live.nextStop).toEqual({ time: '11:30 AM', title: 'Palace gardens', venue: 'Palace gardens hall' });
    expect(live.laterToday.map((line) => [line.time, line.title])).toEqual([['1:30 PM', 'Market lunch'], ['4:00 PM', 'Square by bike'], [null, 'Pastry stop']]);
    expect(live.tonight).toEqual({ time: '8:30 PM', title: 'Guitar night', venue: 'Guitar night hall' });
    expect(live.remainingToday).toBe(5);
    expect(live.tomorrow).toEqual({ dayNumber: 8, dateText: 'Thu 11 Mar', title: 'Day 8 title', weather: expect.objectContaining({ range: '17 to 27°C' }) });
    expect(live.trip.briefingPending).toBe(false);
  });
  it('moves on when it is built with a later `now`, and never shows a time that has passed', () => {
    const at = (iso) => build({ now: new Date(iso) }).live[0];
    expect(at('2027-03-10T12:45:00Z')).toMatchObject({ nextStop: { time: '4:00 PM', title: 'Square by bike' }, remainingToday: 3, tonight: { title: 'Guitar night' } });
    expect(at('2027-03-10T19:00:00Z')).toMatchObject({ nextStop: { title: 'Guitar night' }, laterToday: [], tonight: null, remainingToday: 1 });
    expect(at('2027-03-10T20:00:00Z')).toMatchObject({ nextStop: null, laterToday: [], tonight: null, remainingToday: 0, today: { title: 'Day 7 title' } });
  });
  it('writes the clock in the chosen format', () => {
    setDisplayPrefs({ timeFormat: '24h' });
    expect(build().live[0]).toMatchObject({ nextStop: { time: '11:30' }, tonight: { time: '20:30' } });
  });
  it('shows the day and nothing more while the briefing is awaited', () => {
    const model = build({ briefings: [] });
    expect(model.live[0]).toEqual({
      trip: model.cardsById['t-seville'], isLead: true, timezone: 'Europe/Madrid', dayNumber: 7, dayCount: 10, daysLeft: 3, endText: 'Sat 13 Mar',
      today: null, nextStop: null, laterToday: [], tonight: null, remainingToday: 0, tomorrow: null,
    });
    expect(model.live[0].trip.briefingPending).toBe(true);
    expect(checkDashboardModel(model)).toEqual([]);
  });
  it('has no today without a day row for it, and a today with no stops when the stored day is empty', () => {
    const noRow = sevilleBriefing({ days: [] });
    expect(build({ briefings: [noRow] }).live[0]).toMatchObject({ today: null, tomorrow: null, nextStop: null, trip: { briefingPending: false } });
    // The stops embed answers with a row for every dated day in its range, also for a day with no activities.
    const emptyDay = briefing(seville, { stops: { '2027-03-10': [] } });
    expect(build({ briefings: [emptyDay] }).live[0]).toMatchObject({
      today: { title: 'Day 7 title' }, nextStop: null, laterToday: [], remainingToday: 0, trip: { briefingPending: false },
    });
  });
  it('reads a missing stops row for today as not fetched, never as an empty day: the card stays pending', () => {
    // Saved the day before departure, or the day before: the days are all there, today's stops were outside the fetch range.
    const early = [briefing(seville), briefing(seville, { stops: { '2027-03-08': [stop('Two days back', '10:00')], '2027-03-09': [stop('Yesterday', '10:00')] } })];
    for (const saved of early) {
      const model = build({ briefings: [saved] });
      const [live] = model.live;
      expect(live).toMatchObject({ today: { title: 'Day 7 title' }, nextStop: null, laterToday: [], tonight: null, remainingToday: 0 });
      expect(live.trip.briefingPending).toBe(true);
      expect(live.trip).toBe(model.cardsById['t-seville']);
      // What the briefing does hold is still used.
      expect(live.trip.readiness).not.toBeNull();
      expect(live.tomorrow).toMatchObject({ dayNumber: 8, title: 'Day 8 title' });
      expect(checkDashboardModel(model)).toEqual([]);
    }
  });
  it('does not wait for stops that cannot come: day rows without dates have no stops row', () => {
    const undated = briefing(seville, { days: Array.from({ length: 10 }, (_, i) => ({ day_number: i + 1, date: null, title: `Day ${i + 1} title`, weather: null })) });
    expect(build({ briefings: [undated] }).live[0]).toMatchObject({ today: { title: 'Day 7 title' }, nextStop: null, trip: { briefingPending: false } });
  });
  it('finds the day by its number when the rows carry no dates', () => {
    const undated = sevilleBriefing({ days: Array.from({ length: 10 }, (_, i) => ({ day_number: i + 1, date: null, title: `Day ${i + 1} title`, weather: null })) });
    expect(build({ briefings: [undated] }).live[0]).toMatchObject({ today: { dateText: 'Wed 10 Mar', title: 'Day 7 title', weather: null }, tomorrow: { dayNumber: 8, title: 'Day 8 title' } });
  });
  it('never passes off the row of another day as today', () => {
    // Ten calendar days, nine rows: none is dated the 10th, and the row numbered 7 is dated the 11th.
    const rows = Array.from({ length: 9 }, (_, i) => ({ day_number: i + 1, date: addDays('2027-03-04', i < 6 ? i : i + 1), title: `Day ${i + 1} title`, weather: null }));
    const [live] = build({ briefings: [sevilleBriefing({ days: rows })] }).live;
    expect(live).toMatchObject({ dayNumber: 7, dayCount: 10, today: null, nextStop: null, remainingToday: 0 });
    expect(live.tomorrow).toMatchObject({ dayNumber: 8, dateText: 'Thu 11 Mar', title: 'Day 7 title' });
  });
  it('has no tomorrow on the last day', () => {
    const last = new Date('2027-03-13T09:10:00Z');
    expect(build({ now: last }).live[0]).toMatchObject({ dayNumber: 10, daysLeft: 0, tomorrow: null, today: { dateText: 'Sat 13 Mar' } });
  });
  it('reads today in the zone of the plan, not of the device', () => {
    // 22:30 UTC on the 10th is half past midnight on the 11th in Athens: day 4 there, still the 10th at home.
    const athens = row('t-athens', 'Athens', 'athens', '2027-03-08', '2027-03-16');
    const model = build({ rows: [athens], briefings: [briefing(athens, { stops: { '2027-03-11': [stop('Agora walk', '09:00')], '2027-03-10': [stop('Yesterday supper', '19:00')] } })], now: new Date('2027-03-10T22:30:00Z') });
    expect(model.now.dateText).toBe('Wed 10 Mar');
    expect(model.live[0]).toMatchObject({ timezone: 'Europe/Athens', dayNumber: 4, today: { dateText: 'Thu 11 Mar', title: 'Day 4 title' }, nextStop: { time: '9:00 AM', title: 'Agora walk' } });
  });
});

describe('what a briefing adds to a card', () => {
  it('reads the readiness rule from the briefing, with the entry check still running', () => {
    const { cardsById } = build();
    expect(cardsById['t-marrakech'].readiness).toMatchObject({ headline: '0 of 4 ready', done: 0, total: 4, todo: 3, pending: 1, collapsed: false });
    expect(areas(cardsById['t-marrakech'].readiness)).toEqual([
      ['travel', 'Flights', 'todo', 'Not booked yet'], ['stay', 'Stay', 'todo', 'None booked'], ['entry', 'Entry requirements', 'checking', 'Checking'], ['reservations', 'Reservations', 'todo', '2 to book'],
    ]);
  });
  it('takes the entry check and the ticks of each plan', () => {
    const ticks = { 't-marrakech': { quick: { flights: true }, checklist: {}, entryDone: {} } };
    const named = build({ entries: { 't-marrakech': VISA_FREE }, ticks, countryName: (code) => ({ PT: 'Portuguese' })[code] }).cardsById['t-marrakech'].readiness;
    expect(named).toMatchObject({ headline: '2 of 4 ready', pending: 0, perDevice: true });
    expect(named.items[0]).toMatchObject({ state: 'done', status: 'Marked as booked on this device', source: 'device' });
    expect(named.items[2]).toMatchObject({ state: 'done', status: 'Nothing to file', detail: 'Portuguese passport: visa-free.' });
    expect(build({ entries: { 't-marrakech': { reason: 'failed' } } }).cardsById['t-marrakech'].readiness.items[2].status).toBe('Could not check');
  });
  it('collapses the list of a live plan and has none for a past one', () => {
    const { cardsById } = build({ briefings: [sevilleBriefing({ extras: { bookingChecklist: CHECKLIST } }), briefing(rome, { extras: { bookingChecklist: CHECKLIST } })] });
    expect(cardsById['t-seville'].readiness).toMatchObject({ collapsed: true, total: 2 });
    expect(cardsById['t-rome'].readiness).toBeNull();
  });
  it('reads an older plan whose coach legs were stored as flights as transport', () => {
    const coach = { outbound: { route: 'Lisbon to Marrakech', airline: 'Sul Express', duration: '9h' } };
    const model = build({ briefings: [marrakechBriefing({ extras: { flights: coach }, wizard: { transport: { mode: 'bus' } } })] });
    expect(areas(model.cardsById['t-marrakech'].readiness)[0]).toEqual(['travel', 'Transport', 'todo', 'Not arranged yet']);
    expect(model.next.route).toMatchObject({ kind: 'ground', mode: 'bus', detail: 'Sul Express, about 9h' });
  });
  it('honours the settled flags of the wizard and leaves out what a plan at home does not need', () => {
    const settled = marrakechBriefing({ wizard: { flights: { settled: true }, accommodation: { settled: true } } });
    expect(areas(build({ briefings: [settled] }).cardsById['t-marrakech'].readiness).slice(0, 2)).toEqual([['travel', 'Flights', 'done', 'Sorted'], ['stay', 'Stay', 'done', 'Sorted']]);
    expect(build({ briefings: [settled] }).next.route).toMatchObject({ kind: 'flight', detail: '1h 35m', booked: false });
    const atHome = row('t-home', 'A long weekend at home', 'lisbon', '2027-03-19', '2027-03-21');
    const model = build({ rows: [atHome], briefings: [briefing(atHome, { extras: { accommodation: STAYS, bookingChecklist: CHECKLIST } })], entries: { 't-home': { passports: ['PT'], countries: [], checked: true } } });
    expect(areas(model.cardsById['t-home'].readiness)).toEqual([['reservations', 'Reservations', 'todo', '2 to book']]);
    expect(model.next.route).toMatchObject({ kind: 'home', detail: 'At home' });
  });
  it('gives the typical weather of the whole plan', () => {
    const { cardsById } = build();
    expect(cardsById['t-marrakech'].weather).toEqual({ lowC: 10, highC: 26, range: '10 to 26°C', condition: 'Sunny', season: 'typical for late March' });
    expect(cardsById['t-rome'].weather).toBeNull();
    setDisplayPrefs({ temperatureUnit: 'F' });
    expect(build().cardsById['t-marrakech'].weather.range).toBe('50 to 79°F');
  });
  it('stays whole when a briefing is malformed', () => {
    const model = build({ briefings: [{ id: 't-marrakech' }, null, 'nonsense', { id: 't-seville', days: 'x', stops: null }] });
    expect(checkDashboardModel(model)).toEqual([]);
    expect(model.cardsById['t-marrakech']).toMatchObject({ briefingPending: false, weather: null });
  });
});

describe('the next departure', () => {
  it('is the soonest upcoming plan, with its route, dates and what is left to do', () => {
    const model = build({ entries: { 't-marrakech': VISA_FREE } });
    const { next } = model;
    expect(next.trip).toBe(model.cardsById['t-marrakech']);
    expect(next).toMatchObject({ daysToGo: 9, departText: 'Fri 19 Mar 2027', returnText: 'Thu 25 Mar 2027', lengthText: '7 days, 6 nights' });
    expect(next.route).toEqual({ kind: 'flight', mode: 'plane', from: { code: 'LIS', label: 'Lisbon', note: '' }, to: { code: 'RAK', label: 'Marrakech', note: '' }, detail: '1h 35m, suggested', booked: false, times: null });
    expect(next.todo.map((item) => item.area)).toEqual(['travel', 'stay', 'reservations']);
    expect(next.settled.map((item) => item.area)).toEqual(['entry']);
    expect(checkDashboardModel(model)).toEqual([]);
  });
  it('lists at most three things to do', () => {
    const noPassport = build({ entries: { 't-marrakech': { reason: 'no-passport' } } }).next;
    expect(noPassport.trip.readiness.todo).toBe(4);
    expect(noPassport.todo).toHaveLength(3);
    expect(noPassport.settled).toEqual([]);
  });
  it('falls back to the two names while the briefing is awaited', () => {
    const { next } = build({ briefings: [] });
    expect(next.route).toEqual({ kind: 'none', mode: 'plane', from: { code: null, label: 'Lisbon', note: '' }, to: { code: null, label: 'Marrakech', note: '' }, detail: '', booked: false, times: null });
    expect(next).toMatchObject({ todo: [], settled: [], trip: { briefingPending: true, readiness: null } });
  });
  it('words a one-day plan and a plan with no end date', () => {
    const dayTrip = row('t-day', 'Sintra day trip', 'porto', '2027-03-12', '2027-03-12');
    expect(build({ rows: [dayTrip], briefings: [] }).next).toMatchObject({ daysToGo: 2, lengthText: '1 day', departText: 'Fri 12 Mar 2027', returnText: 'Fri 12 Mar 2027' });
    const open = { ...dayTrip, end_date: null, itinerary_days: [] };
    expect(build({ rows: [open], briefings: [] }).next).toMatchObject({ lengthText: '1 day', returnText: 'Fri 12 Mar 2027' });
  });
  it('is absent when nothing is upcoming', () => {
    expect(build({ rows: [seville, rome] }).next).toBeNull();
  });
});
