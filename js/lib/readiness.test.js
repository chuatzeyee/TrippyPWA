// The readiness rule, blueprint 7.3: one named test per row of the four decision tables, with the
// exact status text, then the named cases of blueprint 9.1. Everything here is invented: the sample
// account of the model fixtures (at home in Lisbon, a plan in Marrakech) and, for the entry tables,
// the named case of the blueprint, a Singapore passport going to Australia. No name, place or date
// in this file comes from a captured plan (ruling R9).
import { describe, it, expect } from 'vitest';
import { readiness, summariseEntry, stayGroups, reservationItems, tripReadinessInput } from './readiness.js';
import { entryDoneKey, entryHaveKey } from './entry-rules.js';
import { checklistKey, legacyChecklistKey } from './tick-keys.js';
import { conforms, Readiness as ReadinessShape } from '../views/fixtures/shape.js';

const TRIP = 't1';
const NOW = new Date('2027-04-11T11:00:00Z');   // Sunday 11 Apr 2027, noon on the device
const DEVICE = 'Europe/Lisbon';
const NAMES = { SG: 'Singapore', IN: 'India', PH: 'Philippines' };

const input = (over = {}) => ({
  phase: 'upcoming', status: 'ok', extras: {}, settled: {}, destinations: [], homeCity: 'Lisbon',
  ticks: { quick: {}, checklist: {}, entryDone: {} }, entry: 'checking', now: NOW, deviceZone: DEVICE,
  countryName: (code) => NAMES[code] || '', ...over,
});
const area = (name, over) => readiness(input(over))?.items.find((item) => item.area === name) ?? null;
const quick = (key) => ({ quick: { [key]: true }, checklist: {}, entryDone: {} });

// --- Travel -----------------------------------------------------------------------------------------

const leg = (flightNumber, over = {}) => ({ route: 'LIS > RAK', airline: 'Tagus Air', flightNumber, duration: '1h 35m', priceRange: 'EUR 90 to EUR 140', tips: '', ...over });
const flights = (out = {}, back = {}) => ({ flights: { outbound: leg('TG412', out), inbound: leg('TG415', back) } });
const coach = (over = {}) => ({ mode: 'bus', route: 'Lisbon to Seville', operator: 'Sul Express', duration: '6h 30m', ...over });
const ground = (over = {}) => ({ transport: { outbound: coach(over), inbound: coach({ route: 'Seville to Lisbon', ...over }) } });
const STAY_ONLY = { accommodation: [{ name: 'Kasbah Palm Lodge', city: 'Marrakech' }] };

describe('Travel', () => {
  it('row 1: no flight legs, no ground journey and travel not marked as settled: the area is left out', () => {
    expect(area('travel', { extras: STAY_ONLY })).toBeNull();
    expect(area('travel', { extras: { ...STAY_ONLY, flights: {} } })).toBeNull();
    expect(area('travel', { extras: { ...STAY_ONLY, flights: { outbound: null, inbound: null }, transport: {} } })).toBeNull();
    expect(readiness(input({ extras: STAY_ONLY })).total).toBe(1);
  });
  it('row 2: a ground journey whose legs are all by car or taxi: the area is left out', () => {
    expect(area('travel', { extras: { ...STAY_ONLY, ...ground({ mode: 'car', operator: '' }) } })).toBeNull();
    expect(area('travel', { extras: { ...STAY_ONLY, ...ground({ mode: 'taxi', operator: 'City Cabs' }) } })).toBeNull();
    const mixed = { transport: { outbound: coach({ mode: 'car', operator: '' }), inbound: coach({ mode: 'taxi', operator: '' }) } };
    expect(area('travel', { extras: { ...STAY_ONLY, ...mixed } })).toBeNull();
    expect(area('travel', { extras: { ...STAY_ONLY, ...mixed }, settled: { flights: true }, ticks: quick('transport') })).toBeNull();
  });
  it('row 3: every stored leg is booked: done, "Booked", from data', () => {
    expect(area('travel', { extras: flights({ booked: true }, { bookingRef: 'ABC123' }) })).toEqual({
      area: 'travel', target: 'flights', label: 'Flights', state: 'done', status: 'Booked', detail: 'TG412 out and TG415 back.',
      actionLabel: 'See flights', source: 'data', tickKey: 'flights', due: null,
    });
    const oneWay = { flights: { outbound: leg('TG412', { booked: true }) } };
    expect(area('travel', { extras: oneWay })).toMatchObject({ state: 'done', status: 'Booked', detail: 'TG412 out.' });
    // A tick or the settled flag adds nothing to a booking that is in the data.
    expect(area('travel', { extras: flights({ booked: true }, { booked: true }), settled: { flights: true }, ticks: quick('flights') }))
      .toMatchObject({ status: 'Booked', source: 'data' });
  });
  it('row 4: one stored leg is booked and another is not: to do, "1 of 2 legs booked", from data', () => {
    expect(area('travel', { extras: flights({ booked: true }) })).toEqual({
      area: 'travel', target: 'flights', label: 'Flights', state: 'todo', status: '1 of 2 legs booked',
      detail: 'Return flight still to book, suggested TG415.', actionLabel: 'See flights', source: 'data', tickKey: null, due: null,
    });
    expect(area('travel', { extras: flights({}, { bookingRef: 'XYZ789' }) })).toMatchObject({
      state: 'todo', status: '1 of 2 legs booked', detail: 'Outbound flight still to book, suggested TG412.',
    });
  });
  it('row 5: the wizard marked flights as settled: done, "Sorted", from data', () => {
    expect(area('travel', { extras: flights(), settled: { flights: true } })).toMatchObject({
      label: 'Flights', state: 'done', status: 'Sorted', source: 'data', tickKey: 'flights', detail: 'Already arranged, as you said when planning.',
    });
    // Settled with no leg stored at all still counts: the area applies and reads as sorted.
    expect(area('travel', { extras: {}, settled: { flights: true } })).toMatchObject({ label: 'Flights', target: 'flights', state: 'done', status: 'Sorted' });
  });
  it('row 6: ticked on this device: done, "Marked as booked on this device", from the device', () => {
    expect(area('travel', { extras: flights(), ticks: quick('flights') })).toMatchObject({
      label: 'Flights', state: 'done', status: 'Marked as booked on this device', source: 'device', tickKey: 'flights',
      detail: 'Suggested TG412 out and TG415 back, about 1h 35m each way.',
    });
    expect(area('travel', { extras: ground(), ticks: quick('transport') })).toMatchObject({
      label: 'Transport', state: 'done', status: 'Marked as booked on this device', source: 'device', tickKey: 'transport',
    });
    // Each kind of journey reads its own tick, the one its Prep row writes.
    expect(area('travel', { extras: flights(), ticks: quick('transport') }).state).toBe('todo');
    expect(area('travel', { extras: ground(), ticks: quick('flights') }).state).toBe('todo');
    expect(area('travel', { extras: flights(), ticks: { quick: { flights: false } } }).state).toBe('todo');
  });
  it('row 7: otherwise: to do, "Not booked yet" for flights', () => {
    expect(area('travel', { extras: flights() })).toEqual({
      area: 'travel', target: 'flights', label: 'Flights', state: 'todo', status: 'Not booked yet',
      detail: 'Suggested TG412 out and TG415 back, about 1h 35m each way.', actionLabel: 'See flights', source: 'data', tickKey: 'flights', due: null,
    });
  });
  it('row 7: otherwise: to do, "Not arranged yet" for a ground journey', () => {
    expect(area('travel', { extras: ground() })).toEqual({
      area: 'travel', target: 'transport', label: 'Transport', state: 'todo', status: 'Not arranged yet',
      detail: 'Sul Express bus, about 6h 30m.', actionLabel: 'See transport', source: 'data', tickKey: 'transport', due: null,
    });
    // An older plan kept its coach under extras.flights: still a ground journey.
    const misfiled = { flights: { outbound: { route: 'Lisbon to Seville', airline: 'Sul Express Coach', flightNumber: 'N/A (Bus)', duration: '6h 30m' } } };
    expect(area('travel', { extras: misfiled })).toMatchObject({ label: 'Transport', status: 'Not arranged yet', detail: 'Sul Express Coach, about 6h 30m.' });
  });

  it('a ground journey follows the same rows when its legs carry a booking', () => {
    const outBooked = { transport: { outbound: coach({ booked: true }), inbound: coach() } };
    expect(area('travel', { extras: outBooked })).toMatchObject({
      label: 'Transport', state: 'todo', status: '1 of 2 legs booked', detail: 'Return journey still to arrange.', tickKey: null,
    });
    expect(area('travel', { extras: ground({ bookingRef: 'COACH-1' }) })).toMatchObject({ state: 'done', status: 'Booked', detail: 'Sul Express bus, about 6h 30m.', source: 'data' });
    expect(area('travel', { extras: ground(), settled: { flights: true } })).toMatchObject({ label: 'Transport', state: 'done', status: 'Sorted' });
  });
  it('booked flights without a flight number still say what is booked', () => {
    expect(area('travel', { extras: flights({ booked: true, flightNumber: '' }, { booked: true, flightNumber: '' }) }).detail).toBe('Both flights are booked.');
    expect(area('travel', { extras: { flights: { outbound: leg('', { booked: true }) } } }).detail).toBe('Your flight is booked.');
    expect(area('travel', { extras: flights({ booked: true, flightNumber: '' }, {}) }).detail).toBe('Return flight still to book, suggested TG415.');
    expect(area('travel', { extras: flights({ booked: true }, { flightNumber: '' }) }).detail).toBe('Return flight still to book.');
  });
  it('the detail of a suggestion says only what is stored', () => {
    expect(area('travel', { extras: flights({ duration: '1h 40m' }, { duration: '1h 25m' }) }).detail).toBe('Suggested TG412 out and TG415 back, about 1h 40m out and 1h 25m back.');
    expect(area('travel', { extras: flights({ duration: 'About 4 hours' }, { duration: 'about 4 hours' }) }).detail).toBe('Suggested TG412 out and TG415 back, about 4 hours each way.');
    expect(area('travel', { extras: flights({ flightNumber: '', duration: '' }, { flightNumber: null, duration: null }) }).detail).toBe('Suggested flights.');
    expect(area('travel', { extras: { flights: { inbound: leg('TG415') } } }).detail).toBe('Suggested TG415 back, about 1h 35m.');
    expect(area('travel', { extras: flights({ duration: '1h 50m' }, { duration: '' }) }).detail).toBe('Suggested TG412 out and TG415 back, about 1h 50m out.');
    expect(area('travel', { extras: flights({ duration: null }, { duration: '1h 25m.' }) }).detail).toBe('Suggested TG412 out and TG415 back, about 1h 25m back.');
    expect(area('travel', { extras: { transport: { outbound: { mode: 'train', route: 'Lisbon to Porto', operator: '', duration: '' } } } }).detail).toBe('Train.');
    expect(area('travel', { extras: { transport: { outbound: { mode: 'ferry', route: 'A to B', operator: 'Blue Line Ferry', duration: '1h' } } } }).detail).toBe('Blue Line Ferry, about 1h.');
  });
});

// --- Stay -------------------------------------------------------------------------------------------

const option = (name, over = {}) => ({ name, area: 'Medina', city: 'Marrakech', type: 'Riad', priceRange: 'MAD 900 a night', highlights: 'Quiet rooms.', badge: 'Best Value', ...over });
const THREE = [option('Riad Dar Zitoun', { badge: 'Recommended' }), option('Hotel Gueliz Garden', { area: 'Gueliz' }), option('Kasbah Palm Lodge', { area: 'Palmeraie', badge: 'Best Location' })];
const inCity = (city, booked = false) => [option(`${city} Park Hotel`, { city, area: 'Centre', badge: 'Recommended', booked }), option(`${city} Loft`, { city, area: 'Old town' })];
const THREE_CITIES = (bookedCity) => ['Vienna', 'Bratislava', 'Budapest'].flatMap((city) => inCity(city, city === bookedCity));
const night = (name, checkIn, checkOut, over = {}) => ({ name, city: 'Marrakech', area: '', checkIn, checkOut, booked: false, bookingRef: '', ...over });
const IMPORTED = (over = {}) => [
  night('Riad Laksour', '2027-05-03', '2027-05-06', over.first), night('Ourika Lodge', '2027-05-06', '2027-05-08', over.second),
  night('Airport Inn', '2027-05-08', '2027-05-09', over.third),
];
const stay = (accommodation, over = {}) => area('stay', { extras: { accommodation }, ...over });

describe('Stay', () => {
  it('row 1: no accommodation in the plan and the stay not marked as settled: the area is left out', () => {
    expect(area('stay', { extras: flights() })).toBeNull();
    expect(area('stay', { extras: { ...flights(), accommodation: [] } })).toBeNull();
    expect(area('stay', { extras: { ...flights(), accommodation: null } })).toBeNull();
  });
  it('row 2: a single-city plan in the home city, nothing booked, not settled, not ticked: the area is left out', () => {
    const home = { destinations: [{ name: 'Lisbon' }], homeCity: 'Lisbon', entry: { reason: 'failed' } };
    expect(stay(THREE, home)).toBeNull();
    expect(stay(THREE, { ...home, homeCity: '  lisbon ' })).toBeNull();
    // A booking, the settled flag or a tick each bring the area back.
    expect(stay([option('Riad Dar Zitoun', { booked: true }), ...THREE.slice(1)], home)).toMatchObject({ status: 'Booked' });
    expect(stay(THREE, { ...home, settled: { accommodation: true } })).toMatchObject({ status: 'Sorted' });
    expect(stay(THREE, { ...home, ticks: quick('accommodation') })).toMatchObject({ status: 'Marked as booked on this device' });
    // Not the home city, no home city on the profile, or more than one city: the area applies.
    expect(stay(THREE, { ...home, homeCity: 'Porto' })).toMatchObject({ status: 'None booked' });
    expect(stay(THREE, { ...home, homeCity: '' })).toMatchObject({ status: 'None booked' });
    expect(stay(THREE, { ...home, destinations: [{ name: 'Lisbon' }, { name: 'Sintra' }] })).toMatchObject({ status: 'None booked' });
  });
  it('row 3: every group is booked: done, "Booked", from data', () => {
    expect(stay([option('Riad Dar Zitoun', { bookingRef: 'RAK-7781' }), ...THREE.slice(1)])).toEqual({
      area: 'stay', target: 'accommodation', label: 'Stay', state: 'done', status: 'Booked', detail: 'Riad Dar Zitoun.',
      actionLabel: 'See stays', source: 'data', tickKey: 'accommodation', due: null,
    });
    expect(stay([night('Casa da Ribeira', '2027-05-03', '2027-05-09', { booked: true })])).toMatchObject({ status: 'Booked', detail: 'Casa da Ribeira, 6 nights.' });
    expect(stay([night('Casa da Ribeira', '2027-05-03', '2027-05-04', { booked: true })])).toMatchObject({ detail: 'Casa da Ribeira, 1 night.' });
  });
  it('row 3: every group is booked: done, "All 3 stays booked" when there are several', () => {
    const booked = { booked: true };
    expect(stay(IMPORTED({ first: booked, second: booked, third: booked }))).toMatchObject({
      state: 'done', status: 'All 3 stays booked', detail: 'Riad Laksour, Ourika Lodge and Airport Inn.', source: 'data',
    });
    expect(stay(IMPORTED({ first: booked, second: booked }).slice(0, 2))).toMatchObject({ status: 'Both stays booked' });
    expect(stay(THREE_CITIES('none').map((entry) => (entry.badge === 'Recommended' ? { ...entry, booked: true } : entry)))).toMatchObject({ status: 'All 3 stays booked' });
  });
  it('row 4: some groups are booked: to do, "1 of 3 stays booked", from data', () => {
    expect(stay(THREE_CITIES('Vienna'))).toEqual({
      area: 'stay', target: 'accommodation', label: 'Stay', state: 'todo', status: '1 of 3 stays booked', detail: 'Still open: Bratislava and Budapest.',
      actionLabel: 'Compare stays', source: 'data', tickKey: null, due: null,
    });
    // The settled flag and a tick come later in the table: neither turns a part-booked plan into a done one.
    expect(stay(THREE_CITIES('Vienna'), { settled: { accommodation: true }, ticks: quick('accommodation') })).toMatchObject({ state: 'todo', status: '1 of 3 stays booked' });
  });
  it('row 5: the wizard marked the stay as settled: done, "Sorted", from data', () => {
    expect(stay([option('Garden Flat', { badge: 'Pre-booked' })], { settled: { accommodation: true } })).toMatchObject({
      state: 'done', status: 'Sorted', source: 'data', tickKey: 'accommodation', detail: 'Garden Flat, already arranged.',
    });
    expect(stay(THREE, { settled: { accommodation: true } })).toMatchObject({ status: 'Sorted', detail: 'Already arranged, as you said when planning.' });
    expect(area('stay', { extras: {}, settled: { accommodation: true } })).toMatchObject({ state: 'done', status: 'Sorted' });
  });
  it('row 6: ticked on this device: done, "Marked as booked on this device", from the device', () => {
    expect(stay(THREE, { ticks: quick('accommodation') })).toMatchObject({
      state: 'done', status: 'Marked as booked on this device', source: 'device', tickKey: 'accommodation',
    });
  });
  it('row 7: otherwise: to do, "None booked", from data', () => {
    expect(stay(THREE)).toEqual({
      area: 'stay', target: 'accommodation', label: 'Stay', state: 'todo', status: 'None booked',
      detail: '3 options to compare. Riad Dar Zitoun in Medina is the recommended pick.',
      actionLabel: 'Compare stays', source: 'data', tickKey: 'accommodation', due: null,
    });
    expect(stay(THREE_CITIES('none'))).toMatchObject({ status: 'None booked', detail: 'Options to compare in Vienna, Bratislava and Budapest.' });
    expect(stay(IMPORTED())).toMatchObject({ status: 'None booked', detail: '3 stays to book, starting with Riad Laksour.', actionLabel: 'See stays' });
    expect(stay([option('Kasbah Palm Lodge', { area: '' })])).toMatchObject({ status: 'None booked', detail: 'Kasbah Palm Lodge is the suggested stay.' });
    expect(stay(THREE.map((entry) => ({ ...entry, badge: 'Best Value' })))).toMatchObject({ detail: '3 options to compare.' });
  });
});

describe('Stay: the detail says only what is stored', () => {
  it('names what is still open by city, by stay, or not at all', () => {
    const noNames = [night('', '2027-05-03', '2027-05-06', { booked: true }), night('', '2027-05-06', '2027-05-08')];
    expect(stay(noNames)).toMatchObject({ status: '1 of 2 stays booked', detail: 'Still open: one more stay.', actionLabel: 'See stays' });
    const mixed = [option('A', { city: 'Porto', booked: true }), option('B', { city: 'Braga' }), option('C', { city: '' })];
    expect(stay(mixed)).toMatchObject({ status: '1 of 3 stays booked', detail: 'Still open: Braga and C.' });
    const four = ['Porto', 'Braga', 'Coimbra', 'Faro', 'Evora'].map((city, i) => option(`${city} Hotel`, { city, booked: i === 0 }));
    expect(stay(four)).toMatchObject({ status: '1 of 5 stays booked', detail: 'Still open: Braga, Coimbra, Faro and 1 more.' });
  });
  it('copes with entries that have no name', () => {
    expect(stay([option('', { area: '' })])).toMatchObject({ status: 'None booked', detail: '1 option to look at.' });
    expect(stay([night('', '2027-05-03', '2027-05-06'), night('', '2027-05-06', '2027-05-08')])).toMatchObject({ detail: '2 stays to book.' });
    expect(stay([option('Unnamed area stay', { area: null, booked: true })])).toMatchObject({ status: 'Booked', detail: 'Unnamed area stay.' });
  });
});

describe('stayGroups', () => {
  it('each entry is its own stay as soon as one carries a check-in or a check-out date', () => {
    expect(stayGroups(IMPORTED()).map((group) => group.map((entry) => entry.name))).toEqual([['Riad Laksour'], ['Ourika Lodge'], ['Airport Inn']]);
    expect(stayGroups([option('A'), option('B', { checkOut: '2027-05-05' })])).toHaveLength(2);
  });
  it('otherwise the alternatives of one city are one stay, in the order the cities first appear', () => {
    expect(stayGroups(THREE_CITIES('none')).map((group) => group[0].city)).toEqual(['Vienna', 'Bratislava', 'Budapest']);
    expect(stayGroups(THREE_CITIES('none')).map((group) => group.length)).toEqual([2, 2, 2]);
    expect(stayGroups(THREE)).toHaveLength(1);
    expect(stayGroups([option('A', { city: ' Marrakech ' }), option('B', { city: 'Marrakech' })])).toHaveLength(1);
  });
  it('with at most one city named, every entry is an alternative for the same stay, as the card shows them', () => {
    expect(stayGroups([option('A', { city: '' }), option('B', { city: undefined })])).toHaveLength(1);
    expect(stayGroups([option('A', { city: 'Marrakech' }), option('B', { city: '' })])).toHaveLength(1);
  });
  it('with several cities, entries without a city form one more group', () => {
    const groups = stayGroups([option('A', { city: 'Porto' }), option('B', { city: '' }), option('C', { city: 'Braga' }), option('D', { city: null })]);
    expect(groups.map((group) => group.map((entry) => entry.name))).toEqual([['A'], ['C'], ['B', 'D']]);
  });
  it('is empty for no list, and never changes the list', () => {
    expect(stayGroups(null)).toEqual([]);
    expect(stayGroups(undefined)).toEqual([]);
    expect(stayGroups('hotel')).toEqual([]);
    expect(stayGroups([null, 'x', option('A')])).toHaveLength(1);
    const frozen = Object.freeze(THREE.map((entry) => Object.freeze({ ...entry })));
    expect(stayGroups(frozen)[0][0]).toBe(frozen[0]);
  });
});

// --- Entry requirements -----------------------------------------------------------------------------

// The named case of blueprint 9.1: a Singapore passport (home country sg) going to Australia.
const TO_PERTH = { destinations: [{ name: 'Perth', flag: 'au' }] };
const ETA = { id: 'au-eta', kind: 'eta', name: 'Australian Electronic Travel Authority (ETA)', required: true, dates: { from: null, by: '2027-05-16' } };
const CARD = { id: 'au-card', kind: 'arrival-card', name: 'Incoming Passenger Card', required: false, dates: { from: null, by: null } };
const LEVY = { id: 'au-levy', kind: 'levy', name: 'Visitor levy', required: true, dates: { from: '2027-05-23', by: '2027-05-27' } };
const visit = (iso2, ...rows) => ({ iso2, role: 'visit', transit: '', landSea: '', rows });
const row = (passport, code, items = [], visa = {}) => ({ passport, visa: code ? { code, ...visa } : null, items });
const plan = (passports, ...countries) => ({ passports, countries, checked: true });
const SG_TO_AU = plan(['SG'], visit('AU', row('SG', 'eta', [ETA, CARD])));
const entry = (thePlan, done = {}, over = {}) => area('entry', { ...TO_PERTH, entry: summariseEntry(thePlan, done, TRIP, 'sg'), ticks: { quick: {}, checklist: {}, entryDone: done }, ...over });

describe('Entry requirements', () => {
  it('row 1: the plan has no destination: the area is left out', () => {
    expect(area('entry', { extras: flights(), destinations: [], entry: summariseEntry(SG_TO_AU, {}, TRIP, 'sg') })).toBeNull();
    expect(area('entry', { extras: flights(), destinations: undefined, entry: 'checking' })).toBeNull();
  });
  it('row 2: the passports or the entry plan are not there yet: checking, "Checking"', () => {
    expect(area('entry', { ...TO_PERTH, entry: 'checking' })).toEqual({
      area: 'entry', target: 'entry', label: 'Entry requirements', state: 'checking', status: 'Checking', detail: '',
      actionLabel: 'See the details', source: 'data', tickKey: null, due: null,
    });
    expect(area('entry', { ...TO_PERTH, entry: undefined })).toMatchObject({ state: 'checking', status: 'Checking' });
    expect(area('entry', { ...TO_PERTH, entry: null })).toMatchObject({ state: 'checking', status: 'Checking' });
  });
  it('row 3: no passport is known: to do, "Add your passport", with the action "Add passport"', () => {
    expect(area('entry', { ...TO_PERTH, entry: { reason: 'no-passport' } })).toEqual({
      area: 'entry', target: 'entry', label: 'Entry requirements', state: 'todo', status: 'Add your passport',
      detail: 'Trippy needs your passport to check visas and arrival cards.', actionLabel: 'Add passport', source: 'data', tickKey: null, due: null,
    });
    // Row 3 comes before row 5: an empty group must ask for the passport, not drop the area.
    expect(entry(plan([]))).toMatchObject({ state: 'todo', status: 'Add your passport' });
  });
  it('row 4: the check did not complete: to do, "Could not check", with the action "See the details"', () => {
    expect(area('entry', { ...TO_PERTH, entry: { reason: 'failed' } })).toEqual({
      area: 'entry', target: 'entry', label: 'Entry requirements', state: 'todo', status: 'Could not check',
      detail: 'The entry rules could not be loaded. Check the official immigration sites.', actionLabel: 'See the details', source: 'data', tickKey: null, due: null,
    });
    expect(entry({ ...SG_TO_AU, checked: false })).toMatchObject({ state: 'todo', status: 'Could not check' });
    expect(entry(null)).toMatchObject({ status: 'Could not check' });
    // Anything that is not one of the four entry inputs reads as a check that did not complete.
    expect(area('entry', { ...TO_PERTH, entry: 'failed' })).toMatchObject({ status: 'Could not check' });
    expect(area('entry', { ...TO_PERTH, entry: { passports: ['SG'], rows: [] } })).toMatchObject({ status: 'Could not check' });
    expect(entry(undefined)).toMatchObject({ status: 'Could not check' });
  });
  it('row 5: the plan lists no country and every passport is the home one: the area is left out', () => {
    expect(entry(plan(['SG']))).toBeNull();
    // Another passport in the group, or no home country on the profile: the card stays, so the area does.
    expect(entry(plan(['SG', 'IN']))).toMatchObject({ state: 'done', status: 'Nothing to file' });
    expect(area('entry', { ...TO_PERTH, entry: summariseEntry(plan(['SG']), {}, TRIP, '') })).toMatchObject({ status: 'Nothing to file' });
  });
  it('row 6: a row whose visa code is na: to do, "Entry is restricted for this passport"', () => {
    expect(entry(plan(['SG', 'IN'], visit('AU', row('SG', 'eta', [ETA]), row('IN', 'na'))))).toMatchObject({
      state: 'todo', status: 'Entry is restricted for this passport', source: 'data', due: null,
      detail: 'India passport: check the official immigration site before you book anything.',
    });
  });
  it('row 7: a required item is not ticked: to do, the name of the item when there is one', () => {
    expect(entry(SG_TO_AU)).toEqual({
      area: 'entry', target: 'entry', label: 'Entry requirements', state: 'todo', status: 'Australian Electronic Travel Authority (ETA)',
      detail: 'Do it by 16 May.', actionLabel: 'See the details', source: 'data', tickKey: null,
      due: { by: '2027-05-16', text: 'by Sun 16 May', state: 'later' },
    });
  });
  it('row 7: several required items are not ticked: to do, "2 things to do"', () => {
    const two = plan(['SG'], visit('AU', row('SG', 'eta', [ETA, CARD, LEVY])));
    expect(entry(two)).toMatchObject({
      state: 'todo', status: '2 things to do', detail: 'Australian Electronic Travel Authority (ETA) and Visitor levy.',
      due: { by: '2027-05-16', text: 'by Sun 16 May', state: 'later' },
    });
    // With one of the two ticked, the other is named.
    expect(entry(two, { [entryDoneKey(TRIP, 'AU', ['SG'], 'au-eta')]: true })).toMatchObject({
      status: 'Visitor levy', detail: 'Do it between 23 May and 27 May.', due: { by: '2027-05-27', text: 'by Thu 27 May', state: 'later' },
    });
  });
  it('row 7: an item with no name or no dates still reads as something to do', () => {
    const bare = { id: 'au-x', kind: 'registration', name: '', required: true, dates: { from: null, by: null } };
    expect(entry(plan(['SG'], visit('AU', row('SG', 'vf', [bare]))))).toMatchObject({ state: 'todo', status: '1 thing to do', detail: 'Required before you travel.', due: null });
    const named = { ...bare, name: 'Online registration', dates: undefined };
    expect(entry(plan(['SG'], visit('AU', row('SG', 'vf', [named]))))).toMatchObject({ status: 'Online registration', detail: 'Required before you travel.', due: null });
  });
  it('row 8: a row that needs "I have this" and has no tick: to do, the visa line', () => {
    expect(entry(plan(['IN'], visit('AU', row('IN', 'vr'))))).toMatchObject({
      state: 'todo', status: 'Visa needed. Apply at an embassy or consulate well ahead', source: 'data', due: null,
      detail: 'Tick "I have this" on the entry card once you have it.',
    });
    expect(entry(plan(['SG'], visit('AU', row('SG', 'eta', [CARD]))))).toMatchObject({ state: 'todo', status: 'Travel authorisation needed before you fly' });
    expect(entry(plan(['SG'], visit('AU', row('SG', 'ev'))))).toMatchObject({ state: 'todo', status: 'eVisa needed before you travel' });
  });
  it('row 9: otherwise: done, "Nothing to file" when no row needed anything', () => {
    expect(entry(plan(['SG'], visit('MA', row('SG', 'vf', [CARD], { stayDays: 90 }))))).toEqual({
      area: 'entry', target: 'entry', label: 'Entry requirements', state: 'done', status: 'Nothing to file',
      detail: 'Singapore passport: visa-free, up to 90 days.', actionLabel: 'See the details', source: 'data', tickKey: null, due: null,
    });
    expect(entry(plan(['SG'], visit('EG', row('SG', 'voa'))))).toMatchObject({ status: 'Nothing to file', detail: 'Singapore passport: visa on arrival.' });
    expect(entry(plan(['SG', 'PH'], visit('MA', row('SG', 'vf', [], { stayDays: 90 }), row('PH', 'vf', [], { stayDays: 90 }))))).toMatchObject({
      status: 'Nothing to file', detail: 'Singapore and Philippines passports: visa-free, up to 90 days.',
    });
    expect(entry(plan(['SG'], visit('MA', row('SG', null))))).toMatchObject({ status: 'Nothing to file', detail: 'Nothing to prepare for entry with these passports.' });
  });
  it('row 9: otherwise: done, "All done" when ticks settled what was needed, from the device', () => {
    expect(entry(SG_TO_AU, { [entryDoneKey(TRIP, 'AU', ['SG'], 'au-eta')]: true })).toMatchObject({
      state: 'done', status: 'All done', source: 'device', detail: 'Everything required for entry is ticked off.', due: null,
    });
  });
});

describe('summariseEntry', () => {
  it('reduces a plan and the ticks to what the rule needs', () => {
    const summary = summariseEntry(plan(['SG', 'IN'], visit('AU', row('SG', 'eta', [ETA, CARD]), row('IN', 'vr'))), {}, TRIP, 'sg');
    expect(summary).toMatchObject({ checked: true, passports: ['SG', 'IN'], hidden: false, restricted: false, required: 1, haveNeeded: 1 });
    expect(summary.rows.map((r) => [r.iso2, r.passports, r.visa.code])).toEqual([['AU', ['SG'], 'eta'], ['AU', ['IN'], 'vr']]);
    expect(summary.open.map((o) => [o.key, o.name, o.by])).toEqual([[`${TRIP}:AU:SG:au-eta`, ETA.name, '2027-05-16']]);
    expect(summary.haveOpen.map((h) => [h.key, h.line])).toEqual([[`${TRIP}:AU:IN:have`, 'Visa needed. Apply at an embassy or consulate well ahead']]);
  });
  it('merges passports with the same answer into one row, and reads the tick under the merged key', () => {
    const both = plan(['SG', 'PH'], visit('AU', row('SG', 'eta', [ETA]), row('PH', 'eta', [ETA])));
    expect(summariseEntry(both, {}, TRIP, 'sg').open).toHaveLength(1);
    expect(summariseEntry(both, { [`${TRIP}:AU:SG+PH:au-eta`]: true }, TRIP, 'sg').open).toEqual([]);
    expect(summariseEntry(both, { [`${TRIP}:AU:SG:au-eta`]: true }, TRIP, 'sg').open).toHaveLength(1);
    expect(entry(both, { [entryDoneKey(TRIP, 'AU', ['SG', 'PH'], 'au-eta')]: true })).toMatchObject({ state: 'done', status: 'All done' });
  });
  it('leaves out countries that are only passed through', () => {
    const viaDoha = plan(['SG'], visit('GB', row('SG', 'vf', [], { stayDays: 180 })), { iso2: 'QA', role: 'transit', transit: 'No visa to change planes.', landSea: '', rows: [row('SG', null)] });
    expect(summariseEntry(viaDoha, {}, TRIP, 'sg').rows.map((r) => r.iso2)).toEqual(['GB']);
  });
  it('keeps the home country when a companion on another passport needs something there', () => {
    const home = plan(['SG', 'IN'], { iso2: 'SG', role: 'home', transit: '', landSea: '', rows: [row('IN', 'vr')] });
    expect(summariseEntry(home, {}, TRIP, 'sg')).toMatchObject({ haveNeeded: 1, hidden: false });
  });
  it('a tick that was taken back counts as open', () => {
    expect(summariseEntry(SG_TO_AU, { [`${TRIP}:AU:SG:au-eta`]: false }, TRIP, 'sg').open).toHaveLength(1);
  });
  it('skips rows and items that are not objects', () => {
    const untidy = plan(['SG'], null, { iso2: 'AU', role: 'visit', rows: [null, { passport: 'SG', visa: { code: 'eta' }, items: [null, ETA] }, { passport: 'PH', visa: null }] });
    const summary = summariseEntry(untidy, {}, TRIP, 'sg');
    expect(summary.rows.map((r) => r.passports)).toEqual([['SG'], ['PH']]);
    expect(summary.open.map((o) => o.name)).toEqual([ETA.name]);
  });
  it('says the check failed when there is no plan, or the plan is not one', () => {
    expect(summariseEntry(null, {}, TRIP, 'sg')).toEqual({ reason: 'failed' });
    expect(summariseEntry(undefined, undefined, TRIP)).toEqual({ reason: 'failed' });
    expect(summariseEntry({ passports: 'SG' }, {}, TRIP, 'sg')).toEqual({ reason: 'failed' });
  });
  it('does not change the plan or the ticks', () => {
    const frozenPlan = Object.freeze({ passports: Object.freeze(['SG']), checked: true, countries: Object.freeze([Object.freeze({ ...visit('AU'), rows: Object.freeze([Object.freeze(row('SG', 'eta', Object.freeze([Object.freeze({ ...ETA })])))]) })]) });
    expect(() => summariseEntry(frozenPlan, Object.freeze({}), TRIP, 'sg')).not.toThrow();
  });
});

// --- Reservations -----------------------------------------------------------------------------------

const MUST = 'Must Book Ahead';
const HAMMAM = { label: 'Hammam session', day: 2, note: 'Sells out at weekends' };
const VALLEY = { label: 'Ourika valley day trip', day: 4 };
const BALLOON = { label: 'Balloon flight at sunrise', day: 6 };
const CHECKLIST = [{ group: MUST, items: [HAMMAM, VALLEY] }, { group: 'Good to Book', items: [BALLOON] }];
const DAYS = [{ day_number: 2, date: '2027-06-01' }, { day_number: 4, date: '2027-06-03' }, { day_number: 6, date: '2027-06-05' }];
const reservations = (bookingChecklist, over = {}) => area('reservations', { extras: { bookingChecklist }, days: DAYS, ...over });
const ticked = (...pairs) => ({ quick: {}, entryDone: {}, checklist: Object.fromEntries(pairs.map(([group, item, value = true]) => [checklistKey(group, item), value])) });

describe('Reservations', () => {
  it('row 1: no items to reserve: the area is left out', () => {
    expect(area('reservations', { extras: flights() })).toBeNull();
    expect(area('reservations', { extras: { ...flights(), bookingChecklist: [] } })).toBeNull();
    expect(area('reservations', { extras: { ...flights(), bookingChecklist: [{ group: MUST, items: [] }, { group: 'Good to Book' }] } })).toBeNull();
  });
  it('row 2: the reservations tick is on, or every item is ticked: done, "All booked", from the device', () => {
    expect(reservations(CHECKLIST, { ticks: quick('reservations') })).toEqual({
      area: 'reservations', target: 'checklist', label: 'Reservations', state: 'done', status: 'All booked', detail: 'Marked as booked on this device.',
      actionLabel: 'Open the checklist', source: 'device', tickKey: 'reservations', due: null,
    });
    expect(reservations(CHECKLIST, { ticks: ticked([MUST, HAMMAM], [MUST, VALLEY]) })).toMatchObject({
      state: 'done', status: 'All booked', source: 'device', detail: 'Both reservations are ticked off.',
    });
  });
  it('row 2: the detail counts what was ticked', () => {
    expect(reservations([{ group: MUST, items: [HAMMAM] }], { ticks: ticked([MUST, HAMMAM]) }).detail).toBe('The one reservation is ticked off.');
    const all = [{ group: MUST, items: [HAMMAM, VALLEY, BALLOON] }];
    expect(reservations(all, { ticks: ticked([MUST, HAMMAM], [MUST, VALLEY], [MUST, BALLOON]) }).detail).toBe('All 3 reservations are ticked off.');
  });
  it('a label that is also the name of something every object has is not read as ticked', () => {
    const odd = [{ group: MUST, items: [{ label: 'constructor' }, { label: 'toString' }] }];
    expect(reservations(odd)).toMatchObject({ state: 'todo', status: '2 to book' });
  });
  it('row 2: an item ticked under its old label key still counts, until it is ticked or unticked again', () => {
    const legacy = { quick: {}, entryDone: {}, checklist: { [legacyChecklistKey(HAMMAM)]: true, [legacyChecklistKey(VALLEY)]: true } };
    expect(reservations(CHECKLIST, { ticks: legacy })).toMatchObject({ state: 'done', status: 'All booked' });
    const takenBack = { ...legacy, checklist: { ...legacy.checklist, [checklistKey(MUST, VALLEY)]: false } };
    expect(reservations(CHECKLIST, { ticks: takenBack })).toMatchObject({ state: 'todo', status: '1 to book' });
  });
  it('row 3: otherwise: to do, "2 to book", from the device', () => {
    expect(reservations(CHECKLIST)).toEqual({
      area: 'reservations', target: 'checklist', label: 'Reservations', state: 'todo', status: '2 to book',
      detail: 'Hammam session (for day 2, Tue 1 Jun) and Ourika valley day trip (for day 4, Thu 3 Jun).',
      actionLabel: 'Open the checklist', source: 'device', tickKey: 'reservations', due: null,
    });
    expect(reservations(CHECKLIST, { ticks: ticked([MUST, HAMMAM]) })).toMatchObject({ status: '1 to book', detail: 'Ourika valley day trip (for day 4, Thu 3 Jun).' });
    expect(reservations(CHECKLIST, { days: [] })).toMatchObject({ detail: 'Hammam session (for day 2) and Ourika valley day trip (for day 4).' });
  });
  it('counts the items of every group whose name contains "must", and of all groups when none does', () => {
    expect(reservations(CHECKLIST).status).toBe('2 to book');
    expect(reservations([{ group: 'MUST book', items: [HAMMAM] }, { group: 'These you must not miss', items: [VALLEY] }, { group: 'Nice to have', items: [BALLOON] }]).status).toBe('2 to book');
    expect(reservations([{ group: 'Book ahead', items: [HAMMAM, VALLEY] }, { group: 'Good to Book', items: [BALLOON] }])).toMatchObject({
      status: '3 to book', detail: 'Hammam session (for day 2, Tue 1 Jun), Ourika valley day trip (for day 4, Thu 3 Jun) and 1 more.',
    });
    // Ticking the items of another group does not finish the ones that count.
    expect(reservations(CHECKLIST, { ticks: ticked(['Good to Book', BALLOON]) }).status).toBe('2 to book');
  });
  it('an imported checklist carries real dates: the earliest open one is the due date', () => {
    const dated = [{ group: MUST, items: [{ label: 'Cooking class', by: '2027-05-22' }, { label: 'Desert camp', by: '2027-04-19' }, { label: 'Airport bus' }] }];
    expect(reservations(dated)).toMatchObject({
      status: '3 to book', detail: 'Desert camp, Cooking class and 1 more.', due: { by: '2027-04-19', text: 'by Mon 19 Apr', state: 'soon' },
    });
    const campDone = ticked([MUST, dated[0].items[1]]);
    expect(reservations(dated, { ticks: campDone }).due).toEqual({ by: '2027-05-22', text: 'by Sat 22 May', state: 'later' });
    expect(reservations([{ group: MUST, items: [{ label: 'Cooking class', by: '2027-04-06' }] }]).due).toEqual({ by: '2027-04-06', text: 'by Tue 6 Apr', state: 'overdue' });
    expect(reservations([{ group: MUST, items: [{ label: 'Cooking class', by: 'soon' }] }]).due).toBeNull();
  });
});

describe('reservationItems', () => {
  it('pairs each item that counts with the name of its group, in the order the checklist shows them', () => {
    expect(reservationItems(CHECKLIST)).toEqual([{ group: MUST, item: HAMMAM }, { group: MUST, item: VALLEY }]);
    const dated = [{ group: MUST, items: [{ label: 'Later', by: '2027-05-22' }, { label: 'Sooner', by: '2027-04-19' }] }];
    expect(reservationItems(dated).map(({ item }) => item.label)).toEqual(['Sooner', 'Later']);
  });
  it('is empty for no checklist and skips what is not an item', () => {
    expect(reservationItems(null)).toEqual([]);
    expect(reservationItems(undefined)).toEqual([]);
    expect(reservationItems({})).toEqual([]);
    expect(reservationItems([null, { group: MUST, items: [null, 'x', HAMMAM] }, { group: MUST, items: 'none' }])).toEqual([{ group: MUST, item: HAMMAM }]);
  });
});

// --- The named cases of blueprint 9.1 ---------------------------------------------------------------

describe('named cases', () => {
  it('Singapore to Australia: unticked, the ETA is the thing to do; ticked, entry is done', () => {
    expect(entry(SG_TO_AU)).toMatchObject({ state: 'todo', status: ETA.name });
    expect(entry(SG_TO_AU, { [entryDoneKey(TRIP, 'AU', ['SG'], 'au-eta')]: true })).toMatchObject({ state: 'done', status: 'All done' });
  });
  it('a visa from an embassy: to do without "I have this", done with it', () => {
    const needsVisa = plan(['IN'], visit('MA', row('IN', 'vr')));
    expect(entry(needsVisa)).toMatchObject({ state: 'todo', status: 'Visa needed. Apply at an embassy or consulate well ahead' });
    expect(entry(needsVisa, { [entryHaveKey(TRIP, 'MA', ['IN'])]: true })).toMatchObject({ state: 'done', status: 'All done', source: 'device' });
  });
  it('offline: a check that did not complete reads "Could not check", never "Nothing to file"', () => {
    const offline = { passports: ['SG'], checked: false, countries: [visit('AU', row('SG', null))] };
    expect(entry(offline)).toMatchObject({ state: 'todo', status: 'Could not check' });
    expect(entry({ passports: ['SG'], checked: false, countries: [] })).toMatchObject({ status: 'Could not check' });
  });
  it('no passport reads "Add your passport"', () => {
    expect(area('entry', { ...TO_PERTH, entry: { reason: 'no-passport' } })).toMatchObject({ state: 'todo', status: 'Add your passport', actionLabel: 'Add passport' });
  });
  it('three cities with one booked: "1 of 3 stays booked", not done', () => {
    expect(stay(THREE_CITIES('Vienna'))).toMatchObject({ state: 'todo', status: '1 of 3 stays booked' });
  });
  it('three imported stays with one booked: "1 of 3 stays booked"', () => {
    expect(stay(IMPORTED({ second: { booked: true, bookingRef: 'OURIKA-22' } }))).toMatchObject({
      state: 'todo', status: '1 of 3 stays booked', detail: 'Still open: Riad Laksour and Airport Inn.', actionLabel: 'See stays',
    });
  });
  it('a plan in the home city: no travel, no stay and no entry to arrange', () => {
    const result = readiness(input({
      extras: { accommodation: THREE.map((entry) => ({ ...entry, city: 'Lisbon' })), bookingChecklist: CHECKLIST },
      destinations: [{ name: 'Lisbon', flag: 'pt' }], homeCity: 'Lisbon', entry: summariseEntry(plan(['PT']), {}, TRIP, 'pt'),
    }));
    expect(result.items.map((item) => item.area)).toEqual(['reservations']);
    expect(result).toMatchObject({ total: 1, done: 0, todo: 1, headline: '0 of 1 ready' });
  });
  it('a car journey: nothing is booked ahead, so travel is left out', () => {
    const result = readiness(input({ extras: { ...ground({ mode: 'car', operator: '' }), accommodation: THREE } }));
    expect(result.items.map((item) => item.area)).toEqual(['stay']);
  });
  it('one booked leg beside an unbooked one, with the settled flag set: still to do', () => {
    expect(area('travel', { extras: flights({ booked: true, bookingRef: 'ABC123' }), settled: { flights: true } })).toMatchObject({ state: 'todo', status: '1 of 2 legs booked' });
  });
});

// --- When it applies, and the totals ----------------------------------------------------------------

const TO_MARRAKECH = { destinations: [{ name: 'Marrakech', flag: 'ma' }] };
const FULL = (over = {}) => input({
  extras: { ...flights(), accommodation: THREE, bookingChecklist: CHECKLIST }, ...TO_MARRAKECH, days: DAYS,
  entry: summariseEntry(plan(['SG'], visit('MA', row('SG', 'vf', [], { stayDays: 90 }))), {}, TRIP, 'sg'), ...over,
});

describe('readiness: when it applies', () => {
  it('is null for a past plan', () => {
    expect(readiness(FULL({ phase: 'past' }))).toBeNull();
  });
  it('is null for a plan that is generating, failed or empty', () => {
    expect(readiness(FULL({ status: 'generating' }))).toBeNull();
    expect(readiness(FULL({ status: 'failed' }))).toBeNull();
    expect(readiness(FULL({ status: 'empty' }))).toBeNull();
  });
  it('is null when no area applies: a plan with days only must not read "Ready"', () => {
    expect(readiness(input({ extras: {} }))).toBeNull();
    expect(readiness(input({ extras: null }))).toBeNull();
    expect(readiness(input({ extras: undefined, ticks: undefined, settled: undefined }))).toBeNull();
  });
  it('gives the full list for an upcoming and for an undated plan', () => {
    expect(readiness(FULL()).items.map((item) => item.area)).toEqual(['travel', 'stay', 'entry', 'reservations']);
    expect(readiness(FULL({ phase: 'undated' }))).toMatchObject({ total: 4, collapsed: false });
    expect(readiness(FULL({ status: 'generated' })).total).toBe(4);
    expect(readiness(FULL({ status: undefined })).total).toBe(4);
  });
  it('gives the same list for a live plan, collapsed', () => {
    const live = readiness(FULL({ phase: 'live' }));
    expect(live.collapsed).toBe(true);
    expect({ ...live, collapsed: false }).toEqual(readiness(FULL()));
  });
  it('never reads the clock: a missing or invalid now is an error', () => {
    expect(() => readiness(FULL({ now: undefined }))).toThrow(TypeError);
    expect(() => readiness(FULL({ now: 'later' }))).toThrow(TypeError);
    expect(() => readiness()).toThrow(TypeError);
  });
});

describe('readiness: totals', () => {
  it('counts the areas: "1 of 4 ready"', () => {
    expect(readiness(FULL())).toMatchObject({ done: 1, total: 4, todo: 3, pending: 0, headline: '1 of 4 ready' });
  });
  it('reads "Ready" when every area is done', () => {
    const all = FULL({ extras: { ...flights({ booked: true }, { booked: true }), accommodation: [option('Riad Dar Zitoun', { booked: true })], bookingChecklist: CHECKLIST }, ticks: quick('reservations') });
    expect(readiness(all)).toMatchObject({ done: 4, total: 4, todo: 0, pending: 0, headline: 'Ready' });
  });
  it('pending is not counted in todo: while entry is checking a card shows "2 to do", not three', () => {
    const waiting = readiness(FULL({ entry: 'checking', extras: { ...flights(), accommodation: THREE } }));
    expect(waiting).toMatchObject({ total: 3, done: 0, todo: 2, pending: 1, headline: '0 of 3 ready' });
    expect(waiting.items.find((item) => item.area === 'entry').state).toBe('checking');
  });
  it('perDevice is true when a tick decided a state or could change one', () => {
    expect(readiness(FULL()).perDevice).toBe(true);
    expect(readiness(input({ extras: flights() })).perDevice).toBe(true);
    expect(readiness(input({ extras: flights(), ticks: quick('flights') })).perDevice).toBe(true);
    expect(readiness(input({ extras: { bookingChecklist: CHECKLIST } })).perDevice).toBe(true);
    expect(readiness(input({ ...TO_PERTH, entry: summariseEntry(SG_TO_AU, {}, TRIP, 'sg') })).perDevice).toBe(true);
    expect(readiness(input({ ...TO_PERTH, entry: summariseEntry(SG_TO_AU, { [`${TRIP}:AU:SG:au-eta`]: true }, TRIP, 'sg') })).perDevice).toBe(true);
  });
  it('perDevice is false when data alone settled everything shown', () => {
    const settled = input({
      extras: { ...flights({ booked: true }, { booked: true }), accommodation: THREE_CITIES('Vienna') }, ...TO_MARRAKECH,
      entry: summariseEntry(plan(['SG'], visit('MA', row('SG', 'vf'))), {}, TRIP, 'sg'),
    });
    expect(readiness(settled)).toMatchObject({ perDevice: false, done: 2, todo: 1 });
    expect(readiness(input({ extras: flights(), settled: { flights: true } })).perDevice).toBe(false);
    expect(readiness(input({ ...TO_PERTH, entry: { reason: 'no-passport' } })).perDevice).toBe(false);
    expect(readiness(input({ ...TO_PERTH, entry: 'checking' })).perDevice).toBe(false);
  });
  it('every result has exactly the fields of the contract', () => {
    const results = [
      readiness(FULL()), readiness(FULL({ phase: 'live' })), readiness(FULL({ entry: 'checking' })), readiness(FULL({ entry: { reason: 'failed' } })),
      readiness(FULL({ entry: summariseEntry(SG_TO_AU, {}, TRIP, 'sg') })), readiness(input({ extras: ground() })),
      readiness(input({ extras: { accommodation: IMPORTED({ first: { booked: true } }) } })),
      readiness(input({ extras: { bookingChecklist: [{ group: MUST, items: [{ label: 'Cooking class', by: '2027-05-22' }] }] } })),
    ];
    for (const result of results) expect(conforms(result, ReadinessShape)).toEqual([]);
  });
  it('does not change what it is given', () => {
    const freeze = (value) => {
      if (value && typeof value === 'object' && !(value instanceof Date)) { Object.values(value).forEach(freeze); Object.freeze(value); }
      return value;
    };
    const frozen = freeze(FULL({ entry: summariseEntry(SG_TO_AU, {}, TRIP, 'sg'), countryName: undefined }));
    expect(() => readiness(frozen)).not.toThrow();
  });
  it('prints the passport code when no name lookup is given', () => {
    const noNames = FULL({ countryName: undefined });
    expect(readiness(noNames).items.find((item) => item.area === 'entry').detail).toBe('SG passport: visa-free, up to 90 days.');
  });
});

describe('tripReadinessInput', () => {
  const trip = {
    id: TRIP, status: 'generated',
    wizard_state: { multiCity: false, destination: { name: 'Marrakech', flag: 'ma' }, destinations: [], flights: { settled: true }, accommodation: { settled: false }, transport: { mode: null } },
    extras: { ...flights(), accommodation: THREE },
    itinerary_days: DAYS,
  };
  it('reads the parts of a full trip that the rule needs', () => {
    expect(tripReadinessInput(trip, { phase: 'upcoming', now: NOW })).toEqual({
      status: 'generated', extras: trip.extras, settled: { flights: true, accommodation: false }, destinations: [{ name: 'Marrakech', flag: 'ma' }],
      days: DAYS, phase: 'upcoming', now: NOW,
    });
  });
  it('lists the cities of a multi-city plan, and none for a plan with no destination', () => {
    const cities = [{ name: 'Porto' }, { name: 'Braga' }];
    expect(tripReadinessInput({ ...trip, wizard_state: { multiCity: true, destination: null, destinations: cities } }).destinations).toEqual(cities);
    expect(tripReadinessInput({ ...trip, wizard_state: { multiCity: true, destinations: [] } }).destinations).toEqual([]);
    expect(tripReadinessInput({ id: TRIP }).destinations).toEqual([]);
    expect(tripReadinessInput({ id: TRIP })).toMatchObject({ extras: null, settled: { flights: false, accommodation: false }, days: [] });
  });
  it('moves a ground journey kept under flights to transport, as the trip page does, without changing the trip', () => {
    const older = Object.freeze({
      ...trip, wizard_state: { ...trip.wizard_state, flights: {}, transport: { mode: 'bus' } },
      extras: Object.freeze({ flights: Object.freeze({ outbound: Object.freeze({ route: 'Lisbon to Seville', airline: 'Sul Express', duration: '6h 30m' }) }) }),
    });
    const made = tripReadinessInput(older, { phase: 'upcoming', now: NOW, deviceZone: DEVICE });
    expect(made.extras.flights).toBeUndefined();
    expect(made.extras.transport.outbound).toMatchObject({ mode: 'bus', operator: 'Sul Express' });
    expect(readiness(made).items[0]).toMatchObject({ label: 'Transport', status: 'Not arranged yet' });
  });
  it('feeds readiness()', () => {
    const result = readiness(tripReadinessInput(trip, { phase: 'upcoming', now: NOW, deviceZone: DEVICE, entry: 'checking', ticks: { quick: {}, checklist: {}, entryDone: {} } }));
    expect(result.items.map((item) => [item.area, item.status])).toEqual([['travel', 'Sorted'], ['stay', 'None booked'], ['entry', 'Checking']]);
  });
});
