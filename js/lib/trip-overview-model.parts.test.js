// The parts of trip-overview-model.js that the dashboard model shares: places, dates, cost, the
// entry input, the stops of today and the route line. Invented data only (the sample account of
// the model fixtures: at home in Lisbon).
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  tripPlaces, placeFlags, tripDates, homeCurrencyOf, planCost, entryInput, zonedMinutes, rowOfToday, todayStops, routeLine,
} from './trip-overview-model.js';
import { normaliseTransportExtras } from './journey.js';
import { setLocaleFromFlag, setDisplayPrefs } from './locale.js';
import { conforms, RouteLine, StopLine, CostEstimate } from '../views/fixtures/shape.js';

beforeAll(() => setLocaleFromFlag('sg'));
afterEach(() => setDisplayPrefs({ timeFormat: '12h', temperatureUnit: 'C' }));

const CPH = { name: 'Copenhagen', country: 'Denmark', flag: 'DK', lat: 55.6761, lng: 12.5683, timezone: 'Europe/Copenhagen', currencyCode: 'DKK', currencySymbol: 'kr' };
const single = (destination = CPH) => ({ wizard_state: { multiCity: false, destination, destinations: [] } });
const multi = (...names) => ({ wizard_state: { multiCity: true, destination: null, destinations: names.map((name) => ({ name, country: 'Austria', flag: 'at' })) } });

describe('tripPlaces and placeFlags', () => {
  it('reads the one destination, or every city of a multi-city plan', () => {
    expect(tripPlaces(single())).toEqual([{ name: 'Copenhagen', country: 'Denmark', flag: 'dk', lat: 55.6761, lng: 12.5683, timezone: 'Europe/Copenhagen' }]);
    expect(tripPlaces(multi('Vienna', 'Graz')).map((place) => place.name)).toEqual(['Vienna', 'Graz']);
    expect(tripPlaces({})).toEqual([]);
    expect(tripPlaces(null)).toEqual([]);
  });
  it('keeps a custom place with no country, flag or coordinates, and drops one with no name', () => {
    const custom = { name: ' Sintra hills ', country: '', flag: '', lat: null, lng: null, timezone: null };
    expect(tripPlaces(single(custom))).toEqual([{ name: 'Sintra hills', country: '', flag: '', lat: null, lng: null, timezone: null }]);
    expect(tripPlaces(single({ name: '', country: 'Denmark' }))).toEqual([]);
    expect(tripPlaces(single({ name: 'Odd', lat: '55.6', lng: Number.NaN }))[0]).toMatchObject({ lat: null, lng: null });
  });
  it('lists each two-letter flag once', () => {
    const places = [{ flag: 'at' }, { flag: 'at' }, { flag: '' }, { flag: 'gb-sct' }, { flag: 'hu' }];
    expect(placeFlags(places)).toEqual(['at', 'hu']);
  });
});

describe('tripDates', () => {
  const daysOf = (count) => Array.from({ length: count }, (_, i) => ({ day_number: i + 1 }));
  it('counts the span of the dates, not the itinerary rows', () => {
    expect(tripDates({ start_date: '2027-03-04', end_date: '2027-03-13', itinerary_days: daysOf(9) }))
      .toEqual({ start: '2027-03-04', end: '2027-03-13', text: '4 to 13 Mar 2027', dayCount: 10, nights: 9, itineraryDays: 9 });
  });
  it('falls back to the itinerary rows without both dates', () => {
    expect(tripDates({ itinerary_days: daysOf(4) })).toEqual({ start: null, end: null, text: 'No dates yet', dayCount: 4, nights: 3, itineraryDays: 4 });
    expect(tripDates({ start_date: '2027-03-04', itinerary_days: daysOf(3) })).toMatchObject({ end: null, text: '4 Mar 2027', dayCount: 3 });
    expect(tripDates({ start_date: '2027-03-04' })).toMatchObject({ dayCount: 1, nights: 0, itineraryDays: 0 });
    expect(tripDates({})).toMatchObject({ dayCount: 0, nights: 0 });
  });
  it('cuts a timestamp to its date and ignores an end before the start or a date that does not exist', () => {
    expect(tripDates({ start_date: '2027-03-04T00:00:00+00:00', end_date: '2027-03-05T00:00:00+00:00' })).toMatchObject({ start: '2027-03-04', end: '2027-03-05', dayCount: 2 });
    expect(tripDates({ start_date: '2027-03-04', end_date: '2027-03-01' })).toMatchObject({ end: null, dayCount: 1 });
    expect(tripDates({ start_date: '2027-02-30', end_date: '2027-03-01' })).toMatchObject({ start: null, end: null });
  });
});

describe('cost and entry inputs', () => {
  const profile = { home_currency: 'eur', home_currency_symbol: '€' };
  it('reads the home currency of the profile', () => {
    expect(homeCurrencyOf(profile)).toEqual({ code: 'EUR', symbol: '€' });
    expect(homeCurrencyOf({ home_currency: null })).toBeNull();
    expect(homeCurrencyOf(null)).toBeNull();
  });
  it('prices activities in the currency of the destination, home first unless the pref says otherwise', () => {
    const activities = [{ cost_amount: 300, cost_currency: 'DKK' }, { cost_amount: 100 }];
    const cost = planCost({ ...single(), budget_daily: 1000 }, activities, { profile, prefs: { homeCurrencyFirst: true }, dayCount: 3 });
    expect(conforms(cost, CostEstimate)).toEqual([]);
    expect(cost).toMatchObject({ local: { amount: 400, code: 'DKK', text: 'DKK 400' }, homeFirst: true, budget: { amount: 3000 } });
    expect(planCost(single(), activities, { profile, prefs: { homeCurrencyFirst: false } })).toMatchObject({ homeFirst: false, budget: null });
    expect(planCost(single(), activities, {})).toMatchObject({ home: null, homeFirst: false });
    expect(planCost({ budget_currency: 'JPY', budget_currency_symbol: '¥' }, [{ cost_amount: 900 }], {}).local.text).toBe('¥900');
  });
  it('reduces an entry plan with the ticks of this device and passes anything else through', () => {
    const plan = { passports: ['PT'], countries: [{ iso2: 'CA', role: 'visit', rows: [{ passport: 'PT', visa: { code: 'eta' }, items: [{ id: 'ca-eta', name: 'eTA', required: true }] }] }], checked: true };
    const open = entryInput(plan, { entryDone: {} }, 't-1', 'pt');
    expect(open.open).toHaveLength(1);
    const ticked = entryInput(plan, { entryDone: { [open.open[0].key]: true } }, 't-1', 'pt');
    expect(ticked.open).toHaveLength(0);
    expect(entryInput(open, {}, 't-1', 'pt')).toBe(open);
    expect(entryInput({ reason: 'failed' }, {}, 't-1', 'pt')).toEqual({ reason: 'failed' });
    expect(entryInput(undefined, {}, 't-1', 'pt')).toBe('checking');
    expect(entryInput(null, {}, 't-1', 'pt')).toBe('checking');
  });
});

describe('zonedMinutes', () => {
  it('reads the clock in a zone and falls back to UTC for a zone that does not exist', () => {
    const now = new Date('2027-03-10T09:10:00Z');
    expect(zonedMinutes(now, 'Europe/Copenhagen')).toBe(10 * 60 + 10);
    expect(zonedMinutes(now, 'Asia/Seoul')).toBe(18 * 60 + 10);
    expect(zonedMinutes(now, 'Not/AZone')).toBe(9 * 60 + 10);
    expect(zonedMinutes('2027-03-10T23:59:00Z', 'UTC')).toBe(23 * 60 + 59);
  });
});

describe('rowOfToday', () => {
  const days = [{ day_number: 1, date: '2027-03-09' }, { day_number: 2, date: '2027-03-11' }, { day_number: 3, date: null }];
  it('is the row tripStatus() points at, unless that row is dated another day', () => {
    expect(rowOfToday(days, { dayIndex: 0 }, '2027-03-09')).toBe(days[0]);
    expect(rowOfToday(days, { dayIndex: 1 }, '2027-03-10')).toBeNull();
    expect(rowOfToday(days, { dayIndex: 2 }, '2027-03-11')).toBe(days[2]);          // no date of its own: the number decides
    expect(rowOfToday(days, { dayIndex: null }, '2027-03-09')).toBeNull();
    expect(rowOfToday(days, null, '2027-03-09')).toBeNull();
    expect(rowOfToday([{ date: '2027-03-09T00:00:00+00:00' }], { dayIndex: 0 }, '2027-03-09')).not.toBeNull();
  });
});

describe('todayStops', () => {
  const stop = (title, start, slot = 'morning', order = 0) => ({ title, start_time: start, time_slot: slot, sort_order: order, venue_name: '' });
  const DAY = [
    stop('Morning coffee', '08:30', 'morning', 1), stop('Palace', '11:30', 'morning', 2), stop('Lunch stop', '13:30', 'afternoon', 3),
    stop('Bike ride', '16:00', 'afternoon', 4), stop('Pastry stop', '', 'afternoon', 5), stop('Jazz night', '20:30', 'evening', 6),
  ];
  const at = (hours, minutes = 0) => hours * 60 + minutes;

  it('names the next stop, up to three after it, tonight and how many are left', () => {
    const left = todayStops(DAY, at(9, 10));
    expect(left.nextStop).toEqual({ time: '11:30 AM', title: 'Palace', venue: null });
    expect(left.laterToday.map((line) => [line.time, line.title])).toEqual([['1:30 PM', 'Lunch stop'], ['4:00 PM', 'Bike ride'], [null, 'Pastry stop']]);
    expect(left.tonight).toEqual({ time: '8:30 PM', title: 'Jazz night', venue: null });
    expect(left.remainingToday).toBe(5);
    expect([left.nextStop, ...left.laterToday, left.tonight].flatMap((line) => conforms(line, StopLine))).toEqual([]);
  });
  it('does not depend on the order the rows arrive in', () => {
    expect(todayStops([...DAY].reverse(), at(9, 10))).toEqual(todayStops(DAY, at(9, 10)));
  });
  it('keeps tonight out when it is the next stop, and ends the day after the last stop', () => {
    expect(todayStops(DAY, at(17))).toEqual({ nextStop: { time: '8:30 PM', title: 'Jazz night', venue: null }, laterToday: [], tonight: null, remainingToday: 1 });
    expect(todayStops(DAY, at(21))).toEqual({ nextStop: null, laterToday: [], tonight: null, remainingToday: 0 });
    expect(todayStops([], at(9))).toEqual({ nextStop: null, laterToday: [], tonight: null, remainingToday: 0 });
    expect(todayStops(null, at(9)).remainingToday).toBe(0);
  });
  it('drops an untimed stop once its part of the day is over or a later timed stop has passed', () => {
    // 4:30 PM: the bike ride has passed, the untimed afternoon stop listed after it is still ahead.
    expect(todayStops(DAY, at(16, 30)).laterToday).toEqual([]);
    expect(todayStops(DAY, at(16, 30)).remainingToday).toBe(1);
    const untimed = [stop('Gallery visit', '', 'morning', 1), stop('Gardens', '', 'afternoon', 2), stop('Late supper', '', 'evening', 3), stop('Any time', '', null, 4)];
    // The display order puts a stop with no time and no part of the day at the start of the day.
    expect(todayStops(untimed, at(9)).laterToday.map((line) => line.title)).toEqual(['Gallery visit', 'Any time', 'Gardens']);
    expect(todayStops(untimed, at(9)).remainingToday).toBe(4);
    expect(todayStops(untimed, at(13)).laterToday.map((line) => line.title)).toEqual(['Any time', 'Gardens', 'Late supper']);
    expect(todayStops(untimed, at(18)).laterToday.map((line) => line.title)).toEqual(['Any time', 'Late supper']);
    expect(todayStops(untimed, at(18))).toMatchObject({ nextStop: null, tonight: null, remainingToday: 2 });
  });
  it('writes the time in the 24-hour format when that is chosen', () => {
    setDisplayPrefs({ timeFormat: '24h' });
    expect(todayStops(DAY, at(9, 10)).nextStop.time).toBe('11:30');
    expect(todayStops(DAY, at(9, 10)).tonight.time).toBe('20:30');
  });
});

describe('routeLine', () => {
  const places = tripPlaces(single());
  const flight = (over = {}) => ({ route: 'LIS > CPH', airline: 'Tagus Air', flightNumber: 'TG412', duration: '3h 40m', tips: 'Leaves at 9:40 AM from Terminal 1.', ...over });
  const flights = (outbound, inbound) => ({ flights: { outbound, inbound } });
  const line = (extras, over = {}) => routeLine({ extras, places, homeCity: 'Lisbon', ...over });

  it('always has the fields of the typedef', () => {
    const lines = [line(null), line(flights(flight())), line(flights(null, flight())), line({ transport: { outbound: { mode: 'bus', route: 'Lisbon to Copenhagen' } } }),
      routeLine({ places: tripPlaces(multi('Vienna', 'Graz')) }), routeLine({}), routeLine()];
    expect(lines.flatMap((route) => conforms(route, RouteLine))).toEqual([]);
  });
  it('draws a suggested flight with its codes, and the cities by name beside them', () => {
    expect(line(flights(flight(), flight({ route: 'CPH > LIS' })))).toEqual({
      kind: 'flight', mode: 'plane', from: { code: 'LIS', label: 'Lisbon', note: '' }, to: { code: 'CPH', label: 'Copenhagen', note: '' },
      detail: '3h 40m, suggested', booked: false, times: null,
    });
  });
  it('never takes a clock time from the tips, and says so when a suggested flight has no duration', () => {
    const route = line(flights(flight({ duration: '' })));
    expect(route.times).toBeNull();
    expect(route.detail).toBe('Suggested, not booked');
  });
  it('does not call a flight suggested when the traveller said the journey is already arranged', () => {
    expect(line(flights(flight()), { sorted: true })).toMatchObject({ kind: 'flight', detail: '3h 40m', booked: false });
    expect(line(flights(flight({ duration: '' })), { sorted: true }).detail).toBe('');
  });
  it('reads the names a route stores beside its codes, the stops between, and tidies a stray arrow', () => {
    const route = line(flights(flight({ route: 'Lisbon (LIS) -> Madrid (MAD) -> Copenhagen (CPH)', duration: '' })), { homeCity: 'Porto' });
    expect(route.from).toEqual({ code: 'LIS', label: 'Lisbon', note: '' });
    expect(route.to).toEqual({ code: 'CPH', label: 'Copenhagen', note: '' });
    expect(route.detail).toBe('1 stop via MAD, suggested');
    expect(line(flights(flight({ duration: 'Approx. 13-14 hours (including layover)' }))).detail).toBe('13-14 hours, layover, suggested');
  });
  it('shows the times a booked leg stores, in the chosen clock format', () => {
    const booked = flight({ booked: true, bookingRef: 'ABC123', depart: 'Fri 19 Mar 08:05, T1', arrive: '12:45, Terminal 2' });
    expect(line(flights(booked))).toMatchObject({ booked: true, detail: '3h 40m', times: { depart: '8:05 AM', arrive: '12:45 PM' } });
    expect(line(flights(flight({ bookingRef: 'ABC123', depart: 'in the morning', arrive: '12:45' }))).times).toBeNull();
    setDisplayPrefs({ timeFormat: '24h' });
    expect(line(flights(booked)).times).toEqual({ depart: '08:05', arrive: '12:45' });
  });
  it('turns the leg back round when it is the only one stored, without its times', () => {
    const route = line(flights(null, flight({ route: 'Copenhagen (CPH) to Lisbon (LIS)', booked: true, depart: '18:00', arrive: '20:40' })));
    expect(route).toMatchObject({ from: { code: 'LIS', label: 'Lisbon' }, to: { code: 'CPH', label: 'Copenhagen' }, booked: true, times: null });
  });
  it('keeps the code as the name when there is no city to put beside it', () => {
    const route = routeLine({ extras: flights(flight({ route: 'QQA > QQB' })), places: [], homeCity: '' });
    expect(route.from).toEqual({ code: 'QQA', label: 'QQA', note: '' });
    expect(route.to).toEqual({ code: 'QQB', label: 'QQB', note: '' });
  });
  it('names the city of a well-known airport when a route stored as codes has neither a home city nor a destination beside it', () => {
    // The profile summary can arrive after the first draw: the pass then read "SIN" under "SIN".
    const route = routeLine({ extras: flights(flight({ route: 'SIN > HKG' })), places: [], homeCity: '' });
    expect(route.from).toEqual({ code: 'SIN', label: 'Singapore', note: '' });
    expect(route.to).toEqual({ code: 'HKG', label: 'Hong Kong', note: '' });
    expect(routeLine({ extras: flights(null, flight({ route: 'CPH > LIS' })), places: [], homeCity: '' })).toMatchObject({ from: { code: 'LIS', label: 'Lisbon' }, to: { code: 'CPH', label: 'Copenhagen' } });
  });
  it('prefers the home city and the destination to the airport table, and a stored city to both', () => {
    expect(routeLine({ extras: flights(flight({ route: 'SIN > NRT' })), places: [{ name: 'Hakone' }], homeCity: 'Johor Bahru' }))
      .toMatchObject({ from: { code: 'SIN', label: 'Johor Bahru' }, to: { code: 'NRT', label: 'Hakone' } });
    expect(routeLine({ extras: flights(flight({ route: 'Changi (SIN) to Lantau (HKG)' })), places: [], homeCity: '' }))
      .toMatchObject({ from: { code: 'SIN', label: 'Changi' }, to: { code: 'HKG', label: 'Lantau' } });
  });
  it('draws a ground journey with its vehicle, operator, duration and departure point', () => {
    const coach = { mode: 'bus', route: 'Lisbon to Seville', operator: 'Sul Express', duration: 'Approx. 6h 30m', terminal: 'Sete Rios coach station' };
    const seville = [{ name: 'Seville' }];
    expect(routeLine({ extras: { transport: { outbound: coach, inbound: { ...coach, route: 'Seville to Lisbon', terminal: 'Plaza de Armas' } } }, places: seville, homeCity: 'Lisbon' })).toEqual({
      kind: 'ground', mode: 'bus', from: { code: null, label: 'Lisbon', note: 'Sete Rios coach station' }, to: { code: null, label: 'Seville', note: '' },
      detail: 'Sul Express, about 6h 30m', booked: false, times: null,
    });
    const train = routeLine({ extras: { transport: { outbound: { mode: 'train', route: 'Lisbon to Porto', duration: '2h 50m' } } }, places: [{ name: 'Porto' }], homeCity: 'Lisbon' });
    expect(train).toMatchObject({ kind: 'ground', mode: 'train', detail: 'Train, about 2h 50m', from: { note: '' } });
    const ferry = routeLine({ extras: { transport: { inbound: { mode: 'ferry', route: 'Tangier to Tarifa', terminal: 'Tangier port' } } }, places: [{ name: 'Tangier' }], homeCity: 'Tarifa' });
    expect(ferry).toMatchObject({ mode: 'ferry', from: { label: 'Tarifa', note: '' }, to: { label: 'Tangier' }, detail: 'Ferry' });
  });
  it('reads an older plan whose coach legs were stored as flights, once the caller has normalised them', () => {
    const old = { flights: { outbound: { route: 'Lisbon to Seville', airline: 'Sul Express', duration: '6h 30m' } } };
    expect(routeLine({ extras: normaliseTransportExtras(old, 'bus'), places: [{ name: 'Seville' }], homeCity: 'Lisbon' }))
      .toMatchObject({ kind: 'ground', mode: 'bus', from: { label: 'Lisbon' }, to: { label: 'Seville' }, detail: 'Sul Express, about 6h 30m' });
  });
  it('runs a multi-city plan from its first city to its last', () => {
    const cities = (...names) => tripPlaces(multi(...names));
    expect(routeLine({ extras: flights(flight()), places: cities('Vienna', 'Bratislava', 'Budapest'), homeCity: 'Lisbon' })).toEqual({
      kind: 'multi', mode: 'plane', from: { code: null, label: 'Vienna', note: '' }, to: { code: null, label: 'Budapest', note: '' },
      detail: '3 cities, via Bratislava', booked: false, times: null,
    });
    expect(routeLine({ places: cities('Vienna', 'Graz') }).detail).toBe('2 cities');
    expect(routeLine({ places: cities('Vienna', 'Graz', 'Linz', 'Salzburg') }).detail).toBe('4 cities, via Graz and Linz');
    const byTrain = { transport: { outbound: { mode: 'train', route: 'Lisbon to Vienna' } } };
    expect(routeLine({ extras: byTrain, places: cities('Vienna', 'Graz') }).mode).toBe('train');
  });
  it('is at home for a plan in the home city with no journey, whatever the case of the name', () => {
    const atHome = routeLine({ extras: { accommodation: [] }, places: [{ name: 'Lisbon' }], homeCity: ' lisbon ' });
    expect(atHome).toEqual({ kind: 'home', mode: 'car', from: { code: null, label: 'Lisbon', note: '' }, to: { code: null, label: 'Lisbon', note: '' }, detail: 'At home', booked: false, times: null });
    expect(routeLine({ extras: flights(flight()), places: [{ name: 'Lisbon' }], homeCity: 'Lisbon' }).kind).toBe('flight');
  });
  it('falls back to the home city and the destination by name without briefing data', () => {
    expect(line(null)).toEqual({ kind: 'none', mode: 'plane', from: { code: null, label: 'Lisbon', note: '' }, to: { code: null, label: 'Copenhagen', note: '' }, detail: '', booked: false, times: null });
    expect(routeLine({ places: [], homeCity: '' })).toMatchObject({ kind: 'none', from: { label: '' }, to: { label: '' } });
  });
});
