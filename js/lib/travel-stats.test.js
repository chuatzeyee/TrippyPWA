// travel-stats.js: the numbers of the stats strip and the passport, the map pins and the short hops.
// Everything here is the invented sample account of the model fixtures (at home in Lisbon, today
// 2027-03-10); the places are the public catalogue's.
import { describe, it, expect, beforeAll } from 'vitest';
import { travelStats, mapPins, shortHops, addDays, dayText, monthLabel, dateRangeText } from './travel-stats.js';
import { setLocaleFromFlag } from './locale.js';
import { NOW_ISO, PLACES as P, CUSTOM_PLACE, card, cost, money } from '../views/fixtures/parts.js';
import { conforms, TravelStats, MapPin, CoverModel } from '../views/fixtures/shape.js';

beforeAll(() => setLocaleFromFlag('sg'));

const EUR = { code: 'EUR', symbol: '€' };
const HOME = { name: 'Lisbon', country: 'Portugal', lat: P.lisbon.lat, lng: P.lisbon.lng };
const OPTS = { homeFlag: 'pt', homePoint: HOME, homeCurrency: EUR, now: NOW_ISO, deviceZone: 'Europe/Lisbon' };
const image = (place) => `https://upload.wikimedia.org/wikipedia/commons/thumb/${place.file}/250px-${place.file.split('/').pop()}`;
const CATALOGUE = Object.values(P).map((place) => ({ ...place, image: image(place) }));

const rome = card('t-rome', 'Rome in November', [P.rome], '2026-11-12', '2026-11-16', { cost: cost({ local: money(410, 'EUR') }) });
const florence = card('t-florence', 'Florence and Rome', [P.florence, P.rome], '2026-11-15', '2026-11-20', { cost: cost({ local: money(300, 'EUR') }) });
const seville = card('t-seville', 'Seville', [P.seville], '2027-03-04', '2027-03-13');
const marrakech = card('t-marrakech', 'Marrakech', [P.marrakech], '2027-03-19', '2027-03-25', {
  cost: cost({ local: money(4200, 'MAD'), home: money(390, 'EUR') }),
});
const lima = card('t-lima', 'Lima', [P.lima], '2026-02-05', '2026-02-16', { cost: cost({ local: money(2100, 'PEN') }), itineraryDays: 10 });
const hills = card('t-hills', 'Sintra hills on foot', [CUSTOM_PLACE], '2026-12-05', '2026-12-06');
const someday = card('t-someday', 'Copenhagen, some day', [P.copenhagen], null, null, { itineraryDays: 4 });
const dublin = card('t-dublin', 'Dublin', [P.dublin], '2027-06-10', '2027-06-18', {
  phase: 'generating', generation: { daysDone: 4, daysTotal: 9, etaMinutes: 3, slow: false, error: '' },
});
const ALL = [rome, florence, seville, marrakech, lima, hills, someday, dublin];

describe('date text', () => {
  it('writes a day, a month and a range without a dash', () => {
    expect(dayText('2027-03-10')).toBe('Wed 10 Mar');
    expect(dayText('2027-03-10', true)).toBe('Wed 10 Mar 2027');
    expect(dayText('2027-02-30')).toBe('');
    expect(monthLabel('2027-03')).toBe('March 2027');
    expect(monthLabel('2027-03', true)).toBe('Mar 2027');
    expect(dateRangeText('2027-03-04', '2027-03-13')).toBe('4 to 13 Mar 2027');
    expect(dateRangeText('2027-04-27', '2027-05-08')).toBe('27 Apr to 8 May 2027');
    expect(dateRangeText('2026-12-28', '2027-01-03')).toBe('28 Dec 2026 to 3 Jan 2027');
    expect(dateRangeText('2027-03-08', null)).toBe('8 Mar 2027');
    expect(dateRangeText('2027-03-08', '2027-03-08')).toBe('8 Mar 2027');
    expect(dateRangeText(null, null)).toBe('No dates yet');
    expect(addDays('2027-04-29', 3)).toBe('2027-05-02');
  });
});

describe('travelStats', () => {
  const stats = travelStats(ALL, OPTS);

  it('has exactly the fields of the typedef', () => {
    expect(conforms(stats, TravelStats)).toEqual([]);
    expect(conforms(travelStats([], OPTS), TravelStats)).toEqual([]);
  });

  it('counts plans, never the ones still being planned or stopped', () => {
    expect(stats.trips).toBe(7);
    expect(travelStats([dublin, { ...dublin, id: 't-x', phase: 'failed' }], OPTS).trips).toBe(0);
  });

  it('sums the itinerary days as days planned and counts overlapping calendar days once', () => {
    // Rome 12 to 16 Nov and Florence 15 to 20 Nov share two days: 5 + 6 - 2.
    const two = travelStats([rome, florence], OPTS);
    expect(two.daysPlanned).toBe(11);
    expect(two.calendarDays).toBe(9);
    // An undated plan has days planned and no calendar days.
    const withUndated = travelStats([rome, someday], OPTS);
    expect(withUndated.daysPlanned).toBe(9);
    expect(withUndated.calendarDays).toBe(5);
    // The itinerary count is used, not the date span.
    expect(travelStats([lima], OPTS).daysPlanned).toBe(10);
    expect(travelStats([lima], OPTS).calendarDays).toBe(12);
  });

  it('counts each country and each city once', () => {
    const two = travelStats([rome, florence], OPTS);
    expect(two.countries).toBe(1);
    expect(two.cities).toBe(2);
    expect(two.byCountry).toEqual([
      { flag: 'it', code3: 'ITA', country: 'Italy', trips: 2, phase: 'past', firstDate: '2026-11-12', isHome: false },
    ]);
  });

  it('counts a place with no country or flag as a city and as no country', () => {
    const withCustom = travelStats([rome, hills], OPTS);
    expect(withCustom.cities).toBe(2);
    expect(withCustom.countries).toBe(1);
    expect(withCustom.byCountry.map((entry) => entry.flag)).toEqual(['it']);
    const badFlag = card('t-bad', 'Somewhere', [{ ...P.rome, name: 'Elsewhere', flag: 'ita' }], '2026-10-01', '2026-10-02');
    expect(travelStats([badFlag], OPTS)).toMatchObject({ cities: 1, countries: 0, byCountry: [] });
  });

  it('marks the home country and orders the countries by their first plan', () => {
    const atHome = card('t-home', 'A weekend at home', [P.lisbon], '2025-05-01', '2025-05-02');
    const list = travelStats([seville, marrakech, rome, atHome], OPTS).byCountry;
    expect(list.map((entry) => [entry.flag, entry.isHome, entry.phase, entry.firstDate])).toEqual([
      ['pt', true, 'past', '2025-05-01'],
      ['it', false, 'past', '2026-11-12'],
      ['es', false, 'live', '2027-03-04'],
      ['ma', false, 'upcoming', '2027-03-19'],
    ]);
  });

  it('reads a country as past once a past plan names it, whatever is still to come', () => {
    const again = card('t-rome-2', 'Rome again', [P.rome], '2027-06-01', '2027-06-05');
    expect(travelStats([rome, again], OPTS).byCountry[0]).toMatchObject({ trips: 2, phase: 'past', firstDate: '2026-11-12' });
    expect(travelStats([again], OPTS).byCountry[0]).toMatchObject({ phase: 'upcoming', firstDate: '2027-06-01' });
    expect(travelStats([someday], OPTS).byCountry[0]).toMatchObject({ flag: 'dk', phase: 'upcoming', firstDate: '', code3: 'DNK' });
  });

  it('names the country with the most plans and the longest plan', () => {
    expect(stats.mostPlanned).toEqual({ country: 'Italy', flag: 'it', trips: 2 });
    expect(stats.longest).toEqual({ title: 'Lima', days: 12 });
    expect(travelStats([], OPTS)).toMatchObject({ mostPlanned: null, longest: null, firstDate: null, lastDate: null });
  });

  it('adds up the spend in the home currency and counts the plans it could not convert', () => {
    // Rome 410 and Florence 300 are in euros already, Marrakech converts to 390, Lima has no home figure.
    expect(stats.spendHome).toEqual({ amount: 1100, code: 'EUR', text: '€1,100' });
    expect(stats.spendUnconverted).toBe(1);
    const noHome = travelStats(ALL, { ...OPTS, homeCurrency: null });
    expect(noHome.spendHome).toBeNull();
    expect(noHome.spendUnconverted).toBe(0);
  });

  it('shows no total when no plan has a cost it can count: nothing was planned for free', () => {
    // No plan is priced at all: no activity costs, or an import without prices.
    const unpriced = travelStats([seville, hills, someday], OPTS);
    expect(unpriced.spendHome).toBeNull();
    expect(unpriced.spendUnconverted).toBe(0);
    // Every priced plan is in a currency without a rate: still no total, and the count of what was left out stays.
    const noRate = travelStats([seville, lima, { ...lima, id: 't-cusco' }], OPTS);
    expect(noRate.spendHome).toBeNull();
    expect(noRate.spendUnconverted).toBe(2);
    expect(conforms(noRate, TravelStats)).toEqual([]);
    // One countable plan is enough for a total.
    expect(travelStats([seville, lima, rome], OPTS)).toMatchObject({ spendHome: { amount: 410, code: 'EUR', text: '€410' }, spendUnconverted: 1 });
  });

  it('finds the extremes, and the farthest place only when the home point is known', () => {
    expect(stats.extremes.north).toEqual({ name: 'Copenhagen', lat: P.copenhagen.lat });
    expect(stats.extremes.south).toEqual({ name: 'Lima', lat: P.lima.lat });
    expect(stats.extremes.farthest.name).toBe('Lima');
    expect(stats.extremes.farthest.km).toBeGreaterThan(8900);
    expect(stats.extremes.farthest.km).toBeLessThan(9100);
    expect(travelStats(ALL, { ...OPTS, homePoint: null }).extremes.farthest).toBeNull();
    expect(travelStats([hills], OPTS).extremes).toEqual({ north: null, south: null, farthest: null });
  });

  it('lists every month from the first plan to the last, with the days in it', () => {
    const months = travelStats([rome, seville, marrakech], OPTS).byMonth;
    expect(months.map((month) => month.key)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(months[0]).toEqual({ key: '2026-11', label: 'November 2026', days: 5, phase: 'past' });
    expect(months[1]).toMatchObject({ days: 0, phase: 'past' });
    expect(months[4]).toEqual({ key: '2027-03', label: 'March 2027', days: 17, phase: 'now' });
    const later = card('t-later', 'Later', [P.athens], '2027-04-30', '2027-05-02');
    expect(travelStats([later], OPTS).byMonth).toEqual([
      { key: '2027-04', label: 'April 2027', days: 1, phase: 'future' },
      { key: '2027-05', label: 'May 2027', days: 2, phase: 'future' },
    ]);
  });

  it('gives the first start and the last end', () => {
    expect(stats.firstDate).toBe('2026-02-05');
    expect(stats.lastDate).toBe('2027-03-25');
  });

  it('refuses to guess the date', () => {
    expect(() => travelStats(ALL, { ...OPTS, now: undefined })).toThrow(TypeError);
  });
});

describe('mapPins', () => {
  const again = card('t-rome-2', 'Rome again', [P.rome], '2027-06-01', '2027-06-05');
  const pins = mapPins([rome, florence, again, seville, hills, dublin], HOME);

  it('conforms to the typedef', () => {
    expect(pins.flatMap((pin, i) => conforms(pin, MapPin, `pins[${i}]`))).toEqual([]);
  });

  it('puts the home pin first, with no plans', () => {
    expect(pins[0]).toEqual({ at: [HOME.lat, HOME.lng], kind: 'home', place: 'Lisbon', country: 'Portugal', label: 'Lisbon, home', tripIds: [], count: 0, href: '', todayHref: null });
    expect(mapPins([rome], null).map((pin) => pin.kind)).toEqual(['past']);
  });

  it('shares one pin between the plans that name a place, most current first', () => {
    const pin = pins.find((entry) => entry.place === 'Rome');
    expect(pin).toEqual({
      at: [P.rome.lat, P.rome.lng], kind: 'up', place: 'Rome', country: 'Italy', label: 'Rome, 3 plans',
      tripIds: ['t-rome-2', 't-florence', 't-rome'], count: 3, href: '#/trip/t-rome-2', todayHref: null,
    });
    expect(pins.find((entry) => entry.place === 'Florence')).toMatchObject({ kind: 'past', label: 'Florence', count: 1 });
  });

  it('links a live pin to today', () => {
    expect(pins.find((entry) => entry.place === 'Seville')).toMatchObject({ kind: 'live', href: '#/trip/t-seville', todayHref: '#/trip/t-seville?today=1' });
  });

  it('skips a place with no coordinates and a plan that is still being planned', () => {
    expect(pins.map((pin) => pin.place)).toEqual(['Lisbon', 'Seville', 'Rome', 'Florence']);
  });

  it('keeps a plan in the home city on a pin of its own', () => {
    const atHome = card('t-home', 'A weekend at home', [P.lisbon], '2025-05-01', '2025-05-02');
    expect(mapPins([atHome], HOME).map((pin) => [pin.kind, pin.count])).toEqual([['home', 0], ['past', 1]]);
  });
});

describe('shortHops', () => {
  const home = CATALOGUE.find((place) => place.name === 'Lisbon');
  const hops = shortHops([seville, rome], { home, catalogue: CATALOGUE });

  it('lists the nearest catalogue places within 1,000 km, nearest first, never the home city', () => {
    expect(hops.map((hop) => hop.name)).toEqual(['Porto', 'Seville', 'Marrakech']);
    expect(hops.map((hop) => hop.km)).toEqual([...hops.map((hop) => hop.km)].sort((a, b) => a - b));
    expect(hops.every((hop) => Number.isInteger(hop.km) && hop.km <= 1000)).toBe(true);
    expect(hops[0]).toMatchObject({ name: 'Porto', country: 'Portugal', flag: 'pt', note: 'New for you' });
  });

  it('says when a plan names the place, with the month of the latest one', () => {
    expect(hops[1].note).toBe('Planned Mar 2027');
    const earlier = card('t-seville-0', 'Seville, earlier', [P.seville], '2025-04-02', '2025-04-05');
    expect(shortHops([earlier, seville], { home, catalogue: CATALOGUE })[1].note).toBe('Planned Mar 2027');
    expect(shortHops([dublin, someday], { home, catalogue: CATALOGUE }).every((hop) => hop.note === 'New for you')).toBe(true);
  });

  it('carries the catalogue photo as a cover with its credit', () => {
    expect(hops.flatMap((hop) => conforms(hop.cover, CoverModel))).toEqual([]);
    expect(hops[0].cover).toMatchObject({ kind: 'legacy', credit: { chip: 'Wikimedia Commons' } });
    expect(hops[0].cover.src).toContain('/500px-');
  });

  it('keeps at most seven', () => {
    const ring = Array.from({ length: 12 }, (_, i) => ({ name: `Near ${i}`, country: 'Portugal', flag: 'pt', lat: home.lat + 0.1 * (i + 1), lng: home.lng, image: '' }));
    const near = shortHops([], { home, catalogue: [home, ...ring] });
    expect(near).toHaveLength(7);
    expect(near[0].name).toBe('Near 0');
    expect(near[0].cover.kind).toBe('none');
  });

  it('is empty without a home in the catalogue and for a full-time traveller', () => {
    expect(shortHops([seville], { home: null, catalogue: CATALOGUE })).toEqual([]);
    expect(shortHops([seville], { home, catalogue: CATALOGUE, nomad: true })).toEqual([]);
    expect(shortHops([seville], { home, catalogue: null })).toEqual([]);
  });
});
