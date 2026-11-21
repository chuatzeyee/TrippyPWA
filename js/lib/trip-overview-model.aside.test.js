// dayAsideModel and dayAsideModels: what the day panel of an open day card says (the panel beside
// the stops on a wide screen). Everything here is invented: a plan in Copenhagen priced in kroner,
// read by an account whose home currency is the euro.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { buildTripOverviewModel, dayAsideModel, dayAsideModels } from './trip-overview-model.js';
import { checklistKey, QUICK_KEYS } from './tick-keys.js';
import { DEFAULT_PREFS } from './prefs.js';
import { setLocaleFromFlag, setDisplayPrefs } from './locale.js';
import { conforms, DayAsideModel } from '../views/fixtures/shape.js';

beforeAll(() => setLocaleFromFlag('sg'));
afterEach(() => setDisplayPrefs({ timeFormat: '12h', temperatureUnit: 'C' }));

const NOW = new Date('2027-03-01T09:00:00Z');
const PROFILE = { home_city: 'Lisbon', home_flag: 'pt', home_currency: 'EUR', home_currency_symbol: '€' };
const CITY = { name: 'Copenhagen', country: 'Denmark', flag: 'dk', lat: 55.6761, lng: 12.5683, timezone: 'Europe/Copenhagen', currencyCode: 'DKK', currencySymbol: 'kr' };
const OLD_TOWN = [55.6790, 12.5720];
const HARBOUR = [55.6920, 12.5990];

const act = (id, title, start, over = {}) => ({
  id, title, start_time: start, time_slot: 'morning', venue_name: `${title} hall`, cost_amount: 200, cost_currency: 'DKK',
  latitude: OLD_TOWN[0], longitude: OLD_TOWN[1], ...over,
});
const DAYS = () => [
  { id: 'd-1', day_number: 1, date: '2027-03-08', title: 'Arrival day', weather: { lowC: 2, highC: 8, condition: 'partly cloudy' }, activities: [
    act('a-3', 'Jazz night', '20:30', { latitude: HARBOUR[0], longitude: HARBOUR[1] }),
    act('a-1', 'Royal palace', '10:00'),
    act('a-2', 'Market lunch', '13:00', { latitude: null, longitude: null }),
  ] },
  { id: 'd-2', day_number: 2, date: '2027-03-09', title: 'One stop', weather: null, activities: [act('a-4', 'Harbour walk', '', { latitude: 0, longitude: 0, cost_amount: 0 })] },
  { id: 'd-3', day_number: 3, date: '2027-03-10', title: 'Home', weather: null, activities: [] },
];
const EXTRAS = () => ({
  bookingChecklist: [
    { group: 'Must Book Ahead', items: [{ label: 'Palace tickets', day: 1 }, { label: 'Harbour walk guide' }, { label: 'Airport train', day: 3 }] },
    { group: 'Good to Book', items: [{ label: 'Table for the jazz night', day: 1 }, { label: 'Travel insurance' }] },
  ],
  towns: [{ city: 'Copenhagen', towns: [
    { name: 'Harbour', cells: [HARBOUR], days: [{ dayNumber: 1 }] },
    { name: 'Old town', cells: [OLD_TOWN], days: [{ dayNumber: 1 }, { dayNumber: 2 }] },
  ] }],
});
const TRIP = (over = {}) => ({
  id: 't-1', user_id: 'u-1', title: 'Copenhagen', status: 'ready', start_date: '2027-03-08', end_date: '2027-03-10', travelers: 2,
  wizard_state: { destination: CITY }, extras: EXTRAS(), itinerary_days: DAYS(), ...over,
});
const build = (trip, ticks = { quick: {}, checklist: {}, entryDone: {} }) => {
  const model = buildTripOverviewModel({ trip, now: NOW, deviceZone: 'Europe/Lisbon', prefs: DEFAULT_PREFS, profile: PROFILE, ticks, userId: 'u-1' });
  return { model, asides: dayAsideModels({ trip, model, ticks }) };
};

describe('dayAsideModels', () => {
  it('gives one entry a day, in the order of model.days, and null for a day with nothing to say', () => {
    const { model, asides } = build(TRIP());
    expect(asides).toHaveLength(model.days.length);
    expect(asides.map((aside) => aside?.index ?? null)).toEqual([0, 1, null]);
    expect(asides[0]).toMatchObject({ dayNumber: 1, colorIndex: 1 });
  });

  it('keeps the shape of the contract (DayAsideModel)', () => {
    const { asides } = build(TRIP());
    for (const aside of asides.filter(Boolean)) expect(conforms(aside, DayAsideModel)).toEqual([]);
    expect(conforms({ ...asides[0], extra: 1 }, DayAsideModel)).toEqual(['$.extra: not in the typedef']);
  });

  it('lists the stops in the order of the day, with the clock time of the user', () => {
    const { asides } = build(TRIP());
    expect(asides[0].list).toEqual([
      { id: 'a-1', at: 0, number: 1, time: '10:00 AM', title: 'Royal palace' },
      { id: 'a-2', at: 1, number: 2, time: '1:00 PM', title: 'Market lunch' },
      { id: 'a-3', at: 2, number: 3, time: '8:30 PM', title: 'Jazz night' },
    ]);
    expect(asides[1].list).toEqual([{ id: 'a-4', at: 0, number: 1, time: '', title: 'Harbour walk' }]);
    setDisplayPrefs({ timeFormat: '24h' });
    expect(build(TRIP()).asides[0].list.map((stop) => stop.time)).toEqual(['10:00', '13:00', '20:30']);
  });

  it('carries the facts of the day row unchanged: stops, times, cost and weather', () => {
    const { model, asides } = build(TRIP());
    const row = model.days[0];
    expect(asides[0]).toMatchObject({ stops: 3, firstTime: row.firstTime, lastTime: row.lastTime, weather: row.weather });
    expect(asides[0].cost).toBe(row.cost);
    expect(asides[1]).toMatchObject({ stops: 1, firstTime: null, lastTime: null, weather: null });
  });

  it('places the stops that have coordinates, numbered by their place in the day', () => {
    const { asides } = build(TRIP());
    expect(asides[0].map).toMatchObject({ placed: 2, total: 3 });
    expect(asides[0].map.points.map((point) => [point.order, point.title, point.dayNumber])).toEqual([[1, 'Royal palace', 1], [3, 'Jazz night', 1]]);
    expect(asides[1].map).toBeNull(); // (0, 0) is a failed lookup, not a place
  });

  it('names the areas of the day in the order the day reaches them, each once', () => {
    const { asides } = build(TRIP());
    expect(asides[0].areas).toEqual(['Old town', 'Harbour']);
    expect(asides[1].areas).toEqual(['Old town']); // no stop can be placed: the areas the plan lists for the day
    const bare = TRIP();
    bare.extras.towns = null;
    expect(build(bare).asides[0].areas).toEqual([]);
  });

  it('takes what to book from the checklist: by day number, or by a stop named in the label', () => {
    const { asides } = build(TRIP());
    expect(asides[0].book).toEqual([{ label: 'Palace tickets', booked: false }, { label: 'Table for the jazz night', booked: false }]);
    expect(asides[1].book).toEqual([{ label: 'Harbour walk guide', booked: false }]);
  });

  it('reads the ticks of this device: an item ticked, and the one tick for every reservation', () => {
    const ticked = { quick: {}, checklist: { [checklistKey('Must Book Ahead', { label: 'Palace tickets' })]: true }, entryDone: {} };
    expect(build(TRIP(), ticked).asides[0].book).toEqual([{ label: 'Palace tickets', booked: true }, { label: 'Table for the jazz night', booked: false }]);
    const legacy = { quick: {}, checklist: { 'palace-tickets': true }, entryDone: {} };
    expect(build(TRIP(), legacy).asides[0].book[0]).toEqual({ label: 'Palace tickets', booked: true });
    const unticked = { quick: {}, checklist: { 'palace-tickets': true, [checklistKey('Must Book Ahead', { label: 'Palace tickets' })]: false }, entryDone: {} };
    expect(build(TRIP(), unticked).asides[0].book[0].booked).toBe(false);
    // The Trip prep tick says the reservations (the "must" group) are booked; a "good to book" item keeps its own tick.
    const all = { quick: { [QUICK_KEYS.reservations]: true }, checklist: {}, entryDone: {} };
    expect(build(TRIP(), all).asides[0].book).toEqual([{ label: 'Palace tickets', booked: true }, { label: 'Table for the jazz night', booked: false }]);
  });

  it('leaves out a day without stops, and survives a plan with no extras and no ticks', () => {
    const { asides } = build(TRIP());
    expect(asides[2]).toBeNull(); // "Airport train" is for day 3, which has no stops: the panel is for stops
    const none = TRIP({ extras: null });
    const model = buildTripOverviewModel({ trip: none, now: NOW, prefs: DEFAULT_PREFS, profile: PROFILE });
    const asides2 = dayAsideModels({ trip: none, model });
    expect(asides2[0]).toMatchObject({ book: [], areas: [] });
    expect(dayAsideModels({})).toEqual([]);
    expect(dayAsideModels({ trip: null, model: null })).toEqual([]);
  });

  it('changes no input', () => {
    const trip = TRIP();
    const before = JSON.stringify(trip);
    const { model } = build(trip);
    const frozen = JSON.stringify(model);
    dayAsideModels({ trip, model, ticks: { quick: {}, checklist: {} } });
    expect(JSON.stringify(trip)).toBe(before);
    expect(JSON.stringify(model)).toBe(frozen);
  });
});

describe('dayAsideModel', () => {
  it('is null without a day or its row', () => {
    expect(dayAsideModel()).toBeNull();
    expect(dayAsideModel({ day: { activities: [] }, row: null })).toBeNull();
  });

  it('does not match a label to a stop on a word of two letters', () => {
    const day = { day_number: 4, activities: [{ id: 'x', title: 'Go', start_time: '09:00' }] };
    const row = { index: 3, dayNumber: 4, colorIndex: 4, stops: 1, cost: null, weather: null, firstTime: '9:00 AM', lastTime: '9:00 AM' };
    const extras = { bookingChecklist: [{ group: 'Good to Book', items: [{ label: 'Gondola tickets' }] }] };
    expect(dayAsideModel({ day, row, points: [], extras }).book).toEqual([]);
  });
});
