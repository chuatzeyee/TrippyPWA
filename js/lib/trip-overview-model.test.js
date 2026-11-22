// buildTripOverviewModel: one full trip row in, the TripOverviewModel of the contract out.
// Everything here is invented: the sample account of the model fixtures (Sam, at home in Lisbon)
// with a plan in Copenhagen, read on 2027-03-10 at 09:10 UTC, which is 10:10 in Copenhagen.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { buildTripOverviewModel, displayTitle, todayStops, zonedMinutes } from './trip-overview-model.js';
import { DEFAULT_PREFS } from './prefs.js';
import { setLocaleFromFlag, setDisplayPrefs } from './locale.js';
import { convert } from '../data/currencies.js';
import { TRIP_FIXTURES } from '../views/fixtures/models.js';
import { checkTripModel } from '../views/fixtures/shape.js';

beforeAll(() => setLocaleFromFlag('sg'));
afterEach(() => setDisplayPrefs({ timeFormat: '12h', temperatureUnit: 'C' }));

const NOW = new Date('2027-03-10T09:10:00Z');
const DEVICE = 'Europe/Lisbon';
const PROFILE = {
  userId: 'u-sam', display_name: 'Sam Carvalho', home_city: 'Lisbon', home_flag: 'pt', home_country: 'Portugal',
  home_currency: 'EUR', home_currency_symbol: '€', is_nomad: false, nationality: 'PT',
};
const NO_TICKS = { quick: {}, checklist: {}, entryDone: {} };
const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/2018_-_Christiansborg_from_the_Marble_Bridge.jpg/250px-2018_-_Christiansborg_from_the_Marble_Bridge.jpg';
const CITY = { name: 'Copenhagen', country: 'Denmark', flag: 'dk', lat: 55.6761, lng: 12.5683, timezone: 'Europe/Copenhagen', currencyCode: 'DKK', currencySymbol: 'kr', image: COMMONS };
const PHOTO = 'https://photos.example.test/venues';

let serial = 0;
/** One activity row. Costs are in the trip currency unless `over` says otherwise. */
const act = (title, start, over = {}) => {
  serial += 1;
  return {
    id: `a-${serial}`, title, start_time: start, time_slot: 'morning', sort_order: serial, venue_name: `${title} hall`,
    cost_amount: 200, cost_currency: 'DKK', latitude: 55.68 + serial * 0.0001, longitude: 12.57, photo_url: `${PHOTO}/${serial}.jpg`, ...over,
  };
};
const day = (number, date, title, activities, over = {}) => ({
  id: `d-${number}`, day_number: number, date, title, theme: `About ${title.toLowerCase()}.`,
  weather: { lowC: 10 + number, highC: 20 + number, condition: number % 2 ? 'sunny' : 'partly cloudy' }, activities, ...over,
});
const DAYS = () => [
  day(1, '2027-03-08', 'Arrival day', [act('Check in', '15:00'), act('Harbour dinner', '20:00', { time_slot: 'evening' })]),
  day(2, '2027-03-09', 'The old town', [act('Cathedral', '09:30'), act('Lunch stop', '13:00'), act('River walk', '', { time_slot: 'afternoon', photo_url: '' })]),
  day(3, '2027-03-10', 'Palaces', [
    act('Morning coffee', '08:30'), act('Royal palace', '11:30'), act('Market lunch', '13:30'), act('Canals by bike', '16:00'),
    act('Pastry stop', '', { time_slot: 'afternoon' }), act('Jazz night', '20:30', { time_slot: 'evening' }),
  ]),
  day(4, '2027-03-11', 'Day trip', [act('Train out', '08:00', { cost_amount: 0 })], { weather: null, theme: null }),
  day(5, '2027-03-12', 'Home', []),
];
const FLIGHTS = {
  outbound: { route: 'LIS > CPH', airline: 'Tagus Air', flightNumber: 'TG412', duration: '3h 40m', priceRange: 'EUR 80 to 120', tips: 'Leaves at 9:40 AM from Terminal 1.' },
  inbound: { route: 'CPH > LIS', airline: 'Tagus Air', flightNumber: 'TG415', duration: '3h 40m', priceRange: 'EUR 80 to 120', tips: '' },
};
const EXTRAS = () => ({
  flights: FLIGHTS,
  accommodation: [
    { name: 'Hotel Kanal', area: 'Old town', city: 'Copenhagen', type: 'hotel', badge: 'Recommended' },
    { name: 'Harbour Rooms', area: 'Harbour', city: 'Copenhagen', type: 'hotel', badge: 'Best Value' },
  ],
  bookingChecklist: [{ group: 'Must Book Ahead', items: [{ label: 'Palace tickets', day: 3 }, { label: 'Jazz night', day: 3 }] }],
  towns: [{ city: 'Copenhagen', towns: [
    { name: 'Old town', photo: `${PHOTO}/area-1.jpg`, activityCount: 6, days: [{ dayNumber: 1 }, { dayNumber: 2 }] },
    { name: 'Harbour', photo: '', activityCount: 3, days: [{ dayNumber: 3 }] },
    { name: 'Nowhere', photo: `${PHOTO}/area-3.jpg`, activityCount: 2, days: [{ dayNumber: 99 }] },
  ] }],
  savingsTips: [
    { title: 'Buy the combined ticket', description: 'One ticket covers the palace and the cathedral.', estimatedSaving: 'DKK 90' },
    { title: 'Walk the centre', description: 'Everything in the old town is fifteen minutes apart.' },
    { title: 'Lunch menus', description: 'The set lunch is half the price of dinner.', estimatedSaving: 'DKK 300' },
  ],
  photoCredits: {},
});
const trip = (over = {}) => ({
  id: 't-cph', user_id: 'u-sam', title: 'Copenhagen in spring', status: 'generated', start_date: '2027-03-08', end_date: '2027-03-12',
  budget_daily: 1500, budget_currency: 'DKK', budget_currency_symbol: 'kr', travelers: 2, cover_image: COMMONS, timezone: 'Europe/Copenhagen',
  wizard_state: {
    multiCity: false, destination: CITY, destinations: [], style: { pace: 2, activities: ['Food', 'History', 'Markets', 'Hiking'] },
    accommodation: { type: 'hotel', stars: 4 }, transport: { mode: null }, flights: {},
  },
  extras: EXTRAS(), itinerary_days: DAYS(), ...over,
});
const upcoming = (over = {}) => trip({
  start_date: '2027-03-19', end_date: '2027-03-23',
  itinerary_days: DAYS().map((row, i) => ({ ...row, date: `2027-03-${19 + i}` })), ...over,
});
const input = (row, over = {}) => ({ trip: row, now: NOW, deviceZone: DEVICE, prefs: DEFAULT_PREFS, profile: PROFILE, ticks: NO_TICKS, userId: 'u-sam', ...over });
const build = (row = trip(), over = {}) => buildTripOverviewModel(input(row, over));
// What entryPlan() gives for a passport that needs nothing: one visit country, one visa-free row.
const NOTHING_TO_FILE = { passports: ['PT'], countries: [{ iso2: 'DK', role: 'visit', rows: [{ passport: 'PT', visa: { code: 'vf' }, items: [] }] }], checked: true };
const keysOf = (model) => model.actions.map((action) => action.key);
const fact = (model, key) => model.glance.find((entry) => entry.key === key);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
}

describe('displayTitle', () => {
  it('is the stored title of a single-city plan, else the name of the place', () => {
    expect(displayTitle(trip())).toBe('Copenhagen in spring');
    expect(displayTitle(trip({ title: '  ' }))).toBe('Copenhagen');
    expect(displayTitle({})).toBe('My trip');
    expect(displayTitle(null)).toBe('My trip');
  });
  it('lists the cities of a multi-city plan, whatever the stored title says', () => {
    const cities = [{ name: 'Vienna' }, { name: 'Bratislava' }, { name: 'Budapest' }];
    expect(displayTitle({ title: 'Vienna to Budapest', wizard_state: { multiCity: true, destination: null, destinations: cities } })).toBe('Vienna, Bratislava & Budapest');
    expect(displayTitle({ title: 'Kept', wizard_state: { multiCity: true, destinations: [] } })).toBe('Kept');
  });
});

describe('the shape of the model', () => {
  const cases = {
    live: () => build(),
    upcoming: () => build(upcoming(), { entry: NOTHING_TO_FILE }),
    past: () => build(trip({ start_date: '2026-10-08', end_date: '2026-10-12' })),
    undated: () => build(trip({ start_date: null, end_date: null })),
    generating: () => build(upcoming({ status: 'generating', itinerary_days: [] })),
    failed: () => build(upcoming({ status: 'failed', itinerary_days: [] })),
    empty: () => build(upcoming({ itinerary_days: [] })),
    viewer: () => build(upcoming({ user_id: 'u-other' })),
    bare: () => build({ id: 't-bare' }),
  };
  it.each(Object.keys(cases))('%s conforms to the typedef and its rules', (name) => {
    expect(checkTripModel(cases[name]())).toEqual([]);
  });
  it('has the same fields as the F0 fixture', () => {
    const model = cases.live();
    expect(Object.keys(model).sort()).toEqual(Object.keys(TRIP_FIXTURES.live).sort());
    expect(Object.keys(model.days[0]).sort()).toEqual(Object.keys(TRIP_FIXTURES.live.days[0]).sort());
    expect(Object.keys(model.live).sort()).toEqual(Object.keys(TRIP_FIXTURES.live.live).sort());
    expect(Object.keys(model.map.points[0]).sort()).toEqual(Object.keys(TRIP_FIXTURES.live.map.points[0]).sort());
  });
  it('returns new objects every time and never changes what it was given', () => {
    const given = deepFreeze(input(trip(), { entry: NOTHING_TO_FILE }));
    const first = buildTripOverviewModel(given);
    const second = buildTripOverviewModel(given);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.days).not.toBe(first.days);
    expect(second.cost).not.toBe(first.cost);
  });
  it('needs a real `now`', () => {
    expect(() => build(trip(), { now: undefined })).toThrow(TypeError);
  });
});

describe('title, place and dates', () => {
  it('names the place under a title that is not the place name', () => {
    expect(build()).toMatchObject({ id: 't-cph', title: 'Copenhagen in spring', placeLine: 'Copenhagen, Denmark', flags: ['dk'], travellers: 2 });
    expect(build(trip({ title: 'copenhagen ' })).placeLine).toBe('');
    const cityState = { ...CITY, name: 'Monaco', country: 'Monaco', flag: 'mc' };
    expect(build(trip({ wizard_state: { multiCity: false, destination: cityState } })).placeLine).toBe('Monaco');
  });
  it('gives the span of the dates as the day count and keeps the itinerary count beside it', () => {
    expect(build().dates).toEqual({ start: '2027-03-08', end: '2027-03-12', text: '8 to 12 Mar 2027', dayCount: 5, nights: 4, itineraryDays: 5 });
    // Ten calendar days, nine itinerary rows: the plan is ten days long.
    const short = trip({ end_date: '2027-03-17', itinerary_days: DAYS().slice(0, 4) });
    expect(build(short).dates).toMatchObject({ dayCount: 10, nights: 9, itineraryDays: 4 });
    expect(build(trip({ start_date: null, end_date: null })).dates).toEqual({ start: null, end: null, text: 'No dates yet', dayCount: 5, nights: 4, itineraryDays: 5 });
  });
  it('says where the plan stands', () => {
    expect(build()).toMatchObject({ status: 'ok', phase: 'live', statusText: 'Day 3 of 5', daysToGo: null });
    expect(build(upcoming())).toMatchObject({ phase: 'upcoming', statusText: 'In 9 days', daysToGo: 9, live: null });
    expect(build(trip({ start_date: '2027-03-11', end_date: '2027-03-12' }))).toMatchObject({ statusText: 'Tomorrow', daysToGo: 1 });
    expect(build(trip({ start_date: '2026-10-08', end_date: '2026-10-12' }))).toMatchObject({ phase: 'past', statusText: 'Past plan' });
    expect(build(trip({ start_date: null, end_date: null }))).toMatchObject({ phase: 'undated', statusText: 'No dates yet' });
    expect(build(upcoming({ status: 'failed' }))).toMatchObject({ status: 'failed', statusText: 'Planning stopped' });
    expect(build(upcoming({ status: 'generating' })).status).toBe('generating');
    expect(build(upcoming({ itinerary_days: [] })).status).toBe('empty');
  });
});

describe('the live day', () => {
  it('finds today in the zone of the trip and names the next stop', () => {
    const { live } = build();
    expect(live).toMatchObject({ dayNumber: 3, dayCount: 5, dayIndex: 2 });
    expect(live.today.title).toBe('Palaces');
    expect(live.today.nextStop).toEqual({ time: '11:30 AM', title: 'Royal palace', venue: 'Royal palace hall' });
    expect(live.today.laterToday).toEqual([
      { time: '1:30 PM', title: 'Market lunch', venue: 'Market lunch hall' },
      { time: '4:00 PM', title: 'Canals by bike', venue: 'Canals by bike hall' },
      { time: null, title: 'Pastry stop', venue: 'Pastry stop hall' },
      { time: '8:30 PM', title: 'Jazz night', venue: 'Jazz night hall' },
    ]);
  });
  it('lists every stop after the next one, never the first three only: "N more after it" is this count', () => {
    const busy = trip({ itinerary_days: DAYS().map((row) => (row.day_number === 3 ? {
      ...row, activities: ['09:00', '10:00', '11:00', '12:00', '13:15', '15:00', '17:30', '18:45'].map((start, i) => act(`Stop ${i + 1}`, start)),
    } : row)) });
    const early = build(busy, { now: new Date('2027-03-10T02:10:00Z') }).live.today;   // 3:10 AM in Copenhagen
    expect(early.nextStop.title).toBe('Stop 1');
    expect(early.laterToday).toHaveLength(7);
    expect(early.laterToday[6]).toMatchObject({ time: '6:45 PM', title: 'Stop 8' });
    expect(build(busy, { now: new Date('2027-03-10T11:30:00Z') }).live.today.laterToday.map((stop) => stop.title)).toEqual(['Stop 6', 'Stop 7', 'Stop 8']);
  });
  it('agrees with the dashboard card for the same moment: its remainingToday is the next stop and these', () => {
    const row = trip();
    const [dayRow] = row.itinerary_days.filter((entry) => entry.day_number === 3);
    for (const iso of ['2027-03-10T02:10:00Z', '2027-03-10T09:10:00Z', '2027-03-10T13:00:00Z', '2027-03-10T19:00:00Z', '2027-03-10T21:00:00Z']) {
      const { today } = build(row, { now: new Date(iso) }).live;
      const card = todayStops(dayRow.activities, zonedMinutes(new Date(iso), 'Europe/Copenhagen'));
      expect([iso, today.laterToday.length + (today.nextStop ? 1 : 0)]).toEqual([iso, card.remainingToday]);
      expect(today.laterToday.slice(0, 3)).toEqual(card.laterToday);
      expect([iso, today.remainingToday, today.tonight]).toEqual([iso, card.remainingToday, card.tonight]);
    }
  });
  it('moves on when `now` moves, and has no next stop once the last timed one has passed', () => {
    const at = (iso) => build(trip(), { now: new Date(iso) }).live.today;
    expect(at('2027-03-10T10:31:00Z').nextStop.title).toBe('Market lunch');      // 11:31 in Copenhagen
    expect(at('2027-03-10T10:30:00Z').nextStop.title).toBe('Royal palace');      // starts this minute
    expect(at('2027-03-10T19:00:00Z')).toMatchObject({ nextStop: { time: '8:30 PM' }, laterToday: [] });
    expect(at('2027-03-10T20:00:00Z')).toEqual({ title: 'Palaces', nextStop: null, laterToday: [], tonight: null, remainingToday: 0 });
  });
  it('prints the time in the format the user chose', () => {
    setDisplayPrefs({ timeFormat: '24h' });
    expect(build().live.today.nextStop.time).toBe('11:30');
    expect(build().days[2]).toMatchObject({ firstTime: '08:30', lastTime: '20:30' });
  });
  it('still knows the day when the rows carry no dates, and says nothing about a day it cannot find', () => {
    const undatedRows = trip({ itinerary_days: DAYS().map((row) => ({ ...row, date: null })) });
    expect(build(undatedRows).live).toMatchObject({ dayNumber: 3, dayIndex: 2, today: { title: 'Palaces' } });
    const noRow = trip({ itinerary_days: DAYS().filter((row) => row.day_number !== 3) });
    expect(build(noRow).live).toEqual({ dayNumber: 3, dayCount: 5, dayIndex: null, today: null });
  });
  it('never passes off the row of another day as today', () => {
    // Five calendar days, four rows: there is none for the 10th, and the row numbered 3 is dated the 11th.
    const gap = DAYS().filter((row) => row.day_number !== 3).map((row, i) => ({ ...row, day_number: i + 1 }));
    const model = build(trip({ itinerary_days: gap }));
    expect(model.live).toEqual({ dayNumber: 3, dayCount: 5, dayIndex: 2, today: null });
    expect(model.days[2]).toMatchObject({ date: '2027-03-11', isToday: false });
    expect(model.days.some((row) => row.isToday)).toBe(false);
  });
  it('lists untimed stops that are still ahead when no timed stop is left', () => {
    const untimed = trip({ itinerary_days: DAYS().map((row) => (row.day_number === 3
      ? { ...row, activities: [act('Gallery visit', '', { time_slot: 'morning' }), act('Gardens', '', { time_slot: 'afternoon' }), act('Late supper', '', { time_slot: 'evening' })] } : row)) });
    expect(build(untimed).live.today).toMatchObject({ nextStop: null, laterToday: [{ title: 'Gallery visit' }, { title: 'Gardens' }, { title: 'Late supper' }] });
    const afternoon = build(untimed, { now: new Date('2027-03-10T13:00:00Z') }).live.today;
    expect(afternoon.laterToday.map((stop) => stop.title)).toEqual(['Gardens', 'Late supper']);
  });
});

describe('actions', () => {
  const owner = ['share', 'pdf', 'edit', 'read-view', 'regenerate', 'delete'];
  it('gives the owner all six, in the order of the bar', () => {
    const model = build(upcoming());
    expect(model.role).toBe('owner');
    expect(keysOf(model)).toEqual(owner);
    expect(model.actions.find((action) => action.key === 'read-view').href).toBe('#/trip/t-cph/read');
    expect(model.actions.find((action) => action.key === 'delete')).toEqual({ key: 'delete', label: 'Delete trip', hint: 'Remove this plan for good', href: '', danger: true });
    expect(model.actions.every((action) => action.label && action.hint)).toBe(true);
  });
  it('gives a viewer the reader view and the PDF, and an editor sharing and editing on top', () => {
    const shared = upcoming({ user_id: 'u-other' });
    expect(build(shared)).toMatchObject({ role: 'viewer' });
    expect(keysOf(build(shared))).toEqual(['pdf', 'read-view']);
    expect(keysOf(build(shared, { role: 'viewer' }))).toEqual(['pdf', 'read-view']);
    expect(build(shared, { role: 'editor' }).role).toBe('editor');
    expect(keysOf(build(shared, { role: 'editor' }))).toEqual(['share', 'pdf', 'edit', 'read-view']);
    expect(keysOf(build(upcoming(), { userId: null }))).toEqual(['pdf', 'read-view']);
  });
  it('never offers to regenerate an imported plan', () => {
    const imported = upcoming({ wizard_state: { multiCity: false, destination: CITY, imported: true } });
    expect(build(imported).imported).toBe(true);
    expect(keysOf(build(imported))).toEqual(['share', 'pdf', 'edit', 'read-view', 'delete']);
  });
  it('leaves a stopped plan its delete, and a plan with no days nothing to share, print, edit or read', () => {
    expect(keysOf(build(upcoming({ status: 'failed', itinerary_days: [] })))).toEqual(['delete']);
    expect(keysOf(build(upcoming({ status: 'failed' })))).toEqual(['read-view', 'delete']);
    expect(keysOf(build(upcoming({ status: 'failed', user_id: 'u-other' }), { role: 'editor' }))).toEqual(['read-view']);
    expect(keysOf(build(upcoming({ itinerary_days: [] })))).toEqual(['regenerate', 'delete']);
    expect(keysOf(build(upcoming({ status: 'generating' })))).toEqual(['share', 'pdf', 'read-view', 'delete']);
    expect(keysOf(build(upcoming({ status: 'generating', itinerary_days: [] })))).toEqual(['delete']);
  });
});

describe('glance facts', () => {
  it('lists the six facts of a full plan', () => {
    const model = build(upcoming(), { entry: NOTHING_TO_FILE });
    expect(model.glance).toEqual([
      { key: 'ready', label: 'Ready', value: '1 of 4', note: '3 things left', jump: 'readiness' },
      { key: 'stops', label: 'Stops', value: '12', note: 'about 2 a day', jump: '' },
      { key: 'cost', label: 'Estimated cost', value: `~€${convert(2200, 'DKK', 'EUR')}`, note: 'per person, activities only. DKK 2,200', jump: 'spending' },
      { key: 'weather', label: 'Typical weather', value: '11 to 25°C', note: 'Sunny, typical for late March', jump: '' },
      { key: 'pace', label: 'Pace', value: 'Easy', note: '', jump: '' },
      { key: 'stay', label: 'Stay', value: '4-star hotel', note: '', jump: 'accommodation' },
    ]);
  });
  it('does not lead with "Ready" while the plan is live: readiness is one collapsed line below (blueprint 7.3)', () => {
    const model = build(trip(), { entry: NOTHING_TO_FILE });
    expect(model.phase).toBe('live');
    expect(model.glance.map((entry) => entry.key)).toEqual(['stops', 'cost', 'weather', 'pace', 'stay']);
    expect(model.readiness).toMatchObject({ collapsed: true, headline: '1 of 4 ready' });
  });
  it('drops each fact whose data is missing', () => {
    const imported = upcoming({
      wizard_state: { multiCity: false, destination: CITY, imported: true },
      itinerary_days: DAYS().map((row) => ({ ...row, weather: null, activities: row.activities.map((entry) => ({ ...entry, cost_amount: 0 })) })),
    });
    expect(build(imported, { entry: NOTHING_TO_FILE }).glance.map((entry) => entry.key)).toEqual(['ready', 'stops']);
    expect(build(trip({ start_date: '2026-10-08', end_date: '2026-10-12' })).glance.map((entry) => entry.key)).toEqual(['stops', 'cost', 'weather', 'pace', 'stay']);
    expect(build(upcoming({ itinerary_days: [] })).glance.map((entry) => entry.key)).toEqual(['pace', 'stay']);
  });
  it('words the readiness note by what is left', () => {
    const one = { quick: { flights: true, accommodation: true }, checklist: {}, entryDone: {} };
    expect(fact(build(upcoming(), { entry: NOTHING_TO_FILE, ticks: one }), 'ready')).toMatchObject({ value: '3 of 4', note: '1 thing left' });
    const all = { quick: { flights: true, accommodation: true, reservations: true }, checklist: {}, entryDone: {} };
    expect(fact(build(upcoming(), { entry: NOTHING_TO_FILE, ticks: all }), 'ready')).toMatchObject({ value: '4 of 4', note: 'Nothing left to do' });
    expect(fact(build(upcoming(), { ticks: all }), 'ready')).toMatchObject({ value: '3 of 4', note: 'Checking entry requirements' });
  });
  it('names the booked stay, shows the local figure first when asked, and follows the temperature unit', () => {
    const booked = upcoming({ extras: { ...EXTRAS(), accommodation: [{ name: 'Hotel Kanal', city: 'Copenhagen', booked: true }, { name: 'Harbour Rooms', city: 'Copenhagen' }] } });
    expect(fact(build(booked), 'stay')).toMatchObject({ value: 'Hotel Kanal', note: '' });
    // A stay the traveller arranged before planning: the one stored entry is that stay.
    const arranged = (stays) => upcoming({ wizard_state: { multiCity: false, destination: CITY, accommodation: { type: null, settled: true } }, extras: { ...EXTRAS(), accommodation: stays } });
    expect(fact(build(arranged([{ name: 'Hotel Kanal' }])), 'stay')).toMatchObject({ value: 'Hotel Kanal', note: '' });
    expect(fact(build(arranged([{ name: 'Hotel Kanal' }, { name: 'Harbour Rooms' }])), 'stay')).toBeUndefined();
    const twoBooked = upcoming({ extras: { ...EXTRAS(), accommodation: [{ name: 'Hotel Kanal', bookingRef: 'K1' }, { name: 'Harbour Rooms', booked: true }] } });
    expect(fact(build(twoBooked), 'stay')).toMatchObject({ value: 'Hotel Kanal', note: 'and 1 more' });
    const localFirst = build(upcoming(), { prefs: { ...DEFAULT_PREFS, homeCurrencyFirst: false } });
    expect(fact(localFirst, 'cost')).toMatchObject({ value: 'DKK 2,200', note: `per person, activities only. ~€${convert(2200, 'DKK', 'EUR')}` });
    const noHome = build(upcoming(), { profile: { ...PROFILE, home_currency: null } });
    expect(fact(noHome, 'cost')).toMatchObject({ value: 'DKK 2,200', note: 'per person, activities only' });
    expect(fact(build(upcoming({ wizard_state: { multiCity: false, destination: CITY, style: { pace: 5 }, accommodation: { type: 'ryokan', stars: 5 } } })), 'stay').value).toBe('Traditional stay');
    setDisplayPrefs({ temperatureUnit: 'F' });
    expect(fact(build(upcoming()), 'weather').value).toBe('52 to 77°F');
  });
});

describe('route', () => {
  it('draws the stored journey, by name when the route has only codes', () => {
    expect(build(upcoming()).route).toEqual({
      kind: 'flight', mode: 'plane', from: { code: 'LIS', label: 'Lisbon', note: '' }, to: { code: 'CPH', label: 'Copenhagen', note: '' },
      detail: '3h 40m, suggested', booked: false, times: null,
    });
  });
  it('drops "suggested" once the wizard marked the travel as arranged, and normalises an older coach plan', () => {
    const settled = upcoming({ wizard_state: { multiCity: false, destination: CITY, flights: { settled: true } } });
    expect(build(settled).route).toMatchObject({ kind: 'flight', detail: '3h 40m', booked: false });
    const coach = upcoming({ wizard_state: { multiCity: false, destination: CITY, transport: { mode: 'bus' } }, extras: { flights: { outbound: { route: 'Lisbon to Copenhagen', airline: 'Nord Lines', duration: '2 days' } } } });
    expect(build(coach).route).toMatchObject({ kind: 'ground', mode: 'bus', from: { label: 'Lisbon' }, to: { label: 'Copenhagen' }, detail: 'Nord Lines, about 2 days' });
  });
  it('is at home for a plan in the home city', () => {
    const atHome = upcoming({ extras: {}, wizard_state: { multiCity: false, destination: { ...CITY, name: 'Lisbon', country: 'Portugal', flag: 'pt' } } });
    expect(build(atHome).route).toMatchObject({ kind: 'home', detail: 'At home' });
  });
});

describe('cost', () => {
  it('sets the activity estimate against a budget for one person, whatever the number of travellers', () => {
    const { cost } = build(upcoming({ travelers: 4 }));
    expect(cost).toMatchObject({ basis: 'perPerson', homeFirst: true, excluded: 0 });
    expect(cost.local).toEqual({ amount: 2200, code: 'DKK', text: 'DKK 2,200' });
    expect(cost.budget).toEqual({ amount: 7500, code: 'DKK', text: 'DKK 7,500' });   // 1,500 a day for 5 days
    expect(cost.home).toEqual({ amount: convert(2200, 'DKK', 'EUR'), code: 'EUR', text: `€${convert(2200, 'DKK', 'EUR')}` });
    expect(cost.home.code).toBe('EUR');
    expect(cost.budgetHome.code).toBe('EUR');
  });
  it('counts an activity it cannot convert instead of adding it up', () => {
    const rows = DAYS().map((row, i) => (i === 0 ? { ...row, activities: [...row.activities, act('Odd fee', '21:00', { cost_amount: 5000, cost_currency: 'XTS' })] } : row));
    expect(build(upcoming({ itinerary_days: rows })).cost).toMatchObject({ local: { amount: 2200 }, excluded: 1 });
  });
});

describe('day rows', () => {
  it('describes each day in day order', () => {
    const shuffled = trip({ itinerary_days: [...DAYS()].reverse() });
    const { days } = build(shuffled);
    expect(days.map((row) => [row.index, row.dayNumber, row.date, row.dateText, row.stops, row.colorIndex, row.isToday])).toEqual([
      [0, 1, '2027-03-08', 'Mon 8 Mar', 2, 1, false], [1, 2, '2027-03-09', 'Tue 9 Mar', 3, 2, false], [2, 3, '2027-03-10', 'Wed 10 Mar', 6, 3, true],
      [3, 4, '2027-03-11', 'Thu 11 Mar', 1, 4, false], [4, 5, '2027-03-12', 'Fri 12 Mar', 0, 5, false],
    ]);
    expect(days[0]).toMatchObject({ title: 'Arrival day', theme: 'About arrival day.', weather: { range: '11 to 21°C', condition: 'Sunny' }, firstTime: '3:00 PM', lastTime: '8:00 PM' });
    expect(days[0].cost.local).toEqual({ amount: 400, code: 'DKK', text: 'DKK 400' });
    expect(days[0].cost.budget).toBeNull();
    expect(days[3]).toMatchObject({ theme: '', weather: null, firstTime: '8:00 AM', lastTime: '8:00 AM' });
    expect(days[3].cost.local).toBeNull();
    expect(days[4]).toMatchObject({ stops: 0, thumb: null, photos: [], firstTime: null, lastTime: null });
  });
  it('carries up to four stored photos of the day, the first one as the thumb', () => {
    const { days } = build();
    expect(days[2].photos).toHaveLength(4);
    expect(days[2].thumb).toEqual(days[2].photos[0]);
    expect(days[2].thumb).toEqual({ src: expect.stringMatching(/^https:\/\/photos\.example\.test\/venues\/\d+\.jpg$/), alt: 'Morning coffee' });
    expect(days[1].photos.map((photo) => photo.alt)).toEqual(['Cathedral', 'Lunch stop']);
    const unsafe = trip({ itinerary_days: [day(1, '2027-03-08', 'Arrival day', [act('Check in', '15:00', { photo_url: 'javascript:alert(1)' })])] });
    expect(build(unsafe).days[0]).toMatchObject({ thumb: null, photos: [] });
  });
  it('wraps the day colour after seven and leaves a missing date empty', () => {
    const many = trip({ itinerary_days: Array.from({ length: 9 }, (_, i) => day(i + 1, null, `Day ${i + 1}`, [])), start_date: null, end_date: null });
    expect(build(many).days.map((row) => row.colorIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2]);
    expect(build(many).days[0]).toMatchObject({ date: '', dateText: '', isToday: false });
  });
});

describe('map, areas, tips and the brief', () => {
  it('places the stops that have believable coordinates, numbered by their place in the day', () => {
    const rows = [day(1, '2027-03-08', 'Arrival day', [
      act('Check in', '15:00'), act('No pin', '16:00', { latitude: null, longitude: null }), act('Null island', '17:00', { latitude: 0, longitude: 0 }),
      act('Far away', '18:00', { latitude: 48.85, longitude: 2.35 }), act('Harbour dinner', '20:00'),
    ])];
    const { map } = build(trip({ itinerary_days: rows }));
    expect(map.dayCount).toBe(1);
    expect(map.points.map((point) => [point.title, point.order, point.dayNumber, point.dayIndex, point.colorIndex])).toEqual([['Check in', 1, 1, 0, 1], ['Harbour dinner', 5, 1, 0, 1]]);
    expect(map.points[0]).toMatchObject({ lat: expect.any(Number), lng: 12.57 });
    expect(build(trip({ itinerary_days: [day(1, null, 'Arrival day', [act('No pin', '16:00', { latitude: null, longitude: null })])] })).map).toEqual({ points: [], dayCount: 1 });
  });
  it('lists the areas that belong to a day of the plan, and the first two tips', () => {
    const model = build();
    expect(model.areas).toEqual([{ name: 'Old town', photo: `${PHOTO}/area-1.jpg`, stops: 6 }, { name: 'Harbour', photo: '', stops: 3 }]);
    expect(model.tips).toEqual({
      shown: [
        { title: 'Buy the combined ticket', text: 'One ticket covers the palace and the cathedral.', saving: 'DKK 90' },
        { title: 'Walk the centre', text: 'Everything in the old town is fifteen minutes apart.', saving: '' },
      ],
      total: 3,
    });
    expect(build(trip({ extras: {} }))).toMatchObject({ areas: [], tips: { shown: [], total: 0 } });
  });
  it('gathers the facts of the brief, and leaves out what an imported plan does not have', () => {
    expect(build().brief).toEqual({ pace: 'Easy', interests: ['Food', 'History', 'Markets', 'Hiking'], areaCount: 2, firstArea: 'Old town', lastArea: 'Harbour' });
    const imported = trip({ wizard_state: { multiCity: false, destination: CITY, imported: true }, extras: {} });
    expect(build(imported).brief).toEqual({ pace: '', interests: [], areaCount: 0, firstArea: '', lastArea: '' });
  });
});

describe('readiness', () => {
  it('reads the rule for an upcoming plan, with the entry check reduced through the ticks', () => {
    const { readiness } = build(upcoming(), { entry: NOTHING_TO_FILE });
    expect(readiness).toMatchObject({ headline: '1 of 4 ready', done: 1, total: 4, todo: 3, pending: 0, collapsed: false });
    expect(readiness.items.map((item) => [item.area, item.state, item.status])).toEqual([
      ['travel', 'todo', 'Not booked yet'], ['stay', 'todo', 'None booked'], ['entry', 'done', 'Nothing to file'], ['reservations', 'todo', '2 to book'],
    ]);
  });
  it('is checking until the entry check arrives, and says so when it could not run', () => {
    expect(build(upcoming()).readiness.items[2]).toMatchObject({ area: 'entry', state: 'checking' });
    expect(build(upcoming(), { entry: { reason: 'failed' } }).readiness.items[2].status).toBe('Could not check');
    expect(build(upcoming(), { entry: { reason: 'no-passport' } }).readiness.items[2].status).toBe('Add your passport');
  });
  it('names the passport when the controller passes the lookup', () => {
    const named = build(upcoming(), { entry: NOTHING_TO_FILE, countryName: (code) => ({ PT: 'Portuguese' })[code] });
    expect(named.readiness.items[2].detail).toContain('Portuguese passport');
  });
  it('collapses while live and is absent for a past plan and a plan that is not planned', () => {
    expect(build(trip(), { entry: NOTHING_TO_FILE }).readiness.collapsed).toBe(true);
    expect(build(trip({ start_date: '2026-10-08', end_date: '2026-10-12' })).readiness).toBeNull();
    expect(build(upcoming({ status: 'generating' })).readiness).toBeNull();
    expect(build(upcoming({ itinerary_days: [] })).readiness).toBeNull();
  });
});

describe('photos, credits and the saved copy', () => {
  const credited = () => {
    const rows = DAYS();
    const [first, second] = rows[0].activities;
    const credits = { [first.id]: { via: 'Wikimedia Commons', link: 'https://commons.wikimedia.org/wiki/File:Patio.jpg', creator: 'Jo Marlo', license: 'CC BY-SA 4.0' }, [second.id]: { via: 'Flickr' } };
    return trip({ itinerary_days: rows, extras: { ...EXTRAS(), photoCredits: credits } });
  };
  it('credits the cover and every photo it hands out, once each', () => {
    expect(build(credited()).credits).toEqual([
      { label: 'Wikimedia Commons', full: 'Photo: Wikimedia Commons', link: 'https://commons.wikimedia.org/wiki/File:2018_-_Christiansborg_from_the_Marble_Bridge.jpg' },
      { label: 'Wikimedia Commons', full: 'Photo: Jo Marlo, CC BY-SA 4.0, Wikimedia Commons', link: 'https://commons.wikimedia.org/wiki/File:Patio.jpg' },
      { label: 'Flickr', full: 'Photo: Flickr', link: '' },
    ]);
  });
  it('hands out no venue photo when the pref is off, and keeps the cover', () => {
    const model = build(credited(), { prefs: { ...DEFAULT_PREFS, showVenuePhotos: false } });
    expect(model.days.every((row) => row.thumb === null && row.photos.length === 0)).toBe(true);
    expect(model.areas.every((area) => area.photo === '')).toBe(true);
    expect(model.cover.kind).toBe('legacy');
    expect(model.credits).toHaveLength(1);
    expect(JSON.stringify(model)).not.toContain('photos.example.test');
  });
  it('says when the page shows the copy saved on the device', () => {
    expect(build().offline).toBeNull();
    expect(build(trip(), { stale: true, cachedAt: '2027-03-09T18:42:00+00:00' }).offline).toEqual({ savedAt: '2027-03-09T18:42:00+00:00' });
    expect(build(trip(), { stale: true }).offline).toEqual({ savedAt: null });
  });
});
