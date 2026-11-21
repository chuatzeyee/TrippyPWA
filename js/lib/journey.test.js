import { describe, it, expect } from 'vitest';
import {
  modeFrom, looksLikeGroundLeg, normalizeLeg, groundJourney, journeyMode, routeCodes,
  TRANSPORT_MODES, routeEnds, normaliseTransportExtras,
} from './journey.js';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// From the "Singapore, Johor Bahru & Kuala Lumpur" trip: ground legs stored as flights.
const MISFILED_TRAIN = { airline: 'KTM Shuttle Tebrau (or similar)', flightNumber: 'N/A (Train)', route: 'Singapore (Woodlands) to Johor Bahru (JB Sentral)', duration: '1-2 hours', priceRange: 'S$5-15', tips: 'Book train tickets well in advance.' };
const MISFILED_BUS = { airline: 'Plusliner (or similar bus company)', flightNumber: 'N/A (Bus)', route: 'Kuala Lumpur (TBS) to Singapore (Lavender/Woodlands)', duration: '5-6 hours', priceRange: 'MYR60-100', tips: 'Book online.' };
const FLIGHT = { airline: 'Scoot', flightNumber: 'TR892', route: 'SIN > TPE > CTS' };
const FERRY = {
  mode: 'ferry', operator: 'Batam Fast', service: 'ferry', from: 'HarbourFront Centre, Singapore', to: 'Batam Centre Ferry Terminal, Batam',
  duration: '1h 15m', frequency: 'Hourly', priceRange: 'S$50-60',
  border: 'Clear Singapore immigration at HarbourFront, then Indonesian immigration at Batam Centre.',
  steps: [{ mode: 'mrt', text: 'MRT to HarbourFront', duration: '20 min' }, { mode: 'ferry', text: 'Batam Fast ferry to Batam Centre', duration: '50 min' }],
  tips: 'Arrive 45 minutes early.',
};
const OLD_BUS = { mode: 'Bus', operator: 'Causeway Link', route: 'JB Sentral to Singapore (various drop-off points)', terminal: 'Sultan Iskandar CIQ (Malaysia), Woodlands Checkpoint (Singapore)', duration: '60-90 minutes', priceRange: 'MYR 7-17' };
const EMPTY_LEG = { mode: 'bus', operator: '', service: '', from: '', to: '', duration: '', frequency: '', price: '', border: '', terminal: '', steps: [], tips: '' };

describe('modeFrom', () => {
  it('reads the vehicle from the strongest hint first, whole words only', () => {
    const cases = [
      [['Causeway Link CW2'], 'bus'],
      [['Majestic Fast Ferry'], 'ferry'],
      [['KTMB ETS'], 'train'],
      [['Plusliner (or similar bus company)'], 'bus'],
      [['', 'Book tickets online in advance. Choose an express bus.'], 'bus'],
      [['Coach', 'Faster than the train'], 'bus'],
      [['tickets'], ''],
      [['Grab'], 'taxi'],
      [['self-drive'], 'car'],
      [[null, 7, 'boat'], 'ferry'],
      [[], ''],
      [['Shuttle Tebrau'], 'train'],
      [['metro then taxi'], 'train'],
      [['Rental car'], 'car'],
      [['aeroplane'], ''],
    ];
    for (const [hints, mode] of cases) expect(modeFrom(...hints), JSON.stringify(hints)).toBe(mode);
  });
});

describe('looksLikeGroundLeg', () => {
  it('spots ground legs that older trips stored as flights', () => {
    expect(looksLikeGroundLeg(MISFILED_TRAIN)).toBe(true);
    expect(looksLikeGroundLeg(MISFILED_BUS)).toBe(true);
    expect(looksLikeGroundLeg({ airline: 'KTM', flightNumber: 'Shuttle Tebrau (or Bus)' })).toBe(true);
    expect(looksLikeGroundLeg({ flightNumber: 'n/a coach', airline: 'Transtar' })).toBe(true);
    expect(looksLikeGroundLeg({ airline: 'Jetstar', flightNumber: 'bus 12' })).toBe(true);
  });
  it('leaves real flights and anything else alone', () => {
    expect(looksLikeGroundLeg(FLIGHT)).toBe(false);
    expect(looksLikeGroundLeg({ airline: 'Singapore Airlines', flightNumber: 'SQ 12', route: 'SIN > NRT' })).toBe(false);
    expect(looksLikeGroundLeg(FERRY)).toBe(false);
    expect(looksLikeGroundLeg({})).toBe(false);
    expect(looksLikeGroundLeg(null)).toBe(false);
    expect(looksLikeGroundLeg('bus')).toBe(false);
  });
});

describe('normalizeLeg', () => {
  it('gives null for anything that is not a leg', () => {
    expect(normalizeLeg(null)).toBeNull();
    expect(normalizeLeg(undefined)).toBeNull();
    expect(normalizeLeg('bus')).toBeNull();
  });
  it('fills every field of an empty leg and calls it a bus', () => {
    expect(normalizeLeg({})).toEqual(EMPTY_LEG);
  });
  it('keeps the current transport shape, with step modes read from their text', () => {
    expect(normalizeLeg(FERRY)).toEqual({
      mode: 'ferry', operator: 'Batam Fast', service: 'ferry', from: 'HarbourFront Centre, Singapore', to: 'Batam Centre Ferry Terminal, Batam',
      duration: '1h 15m', frequency: 'Hourly', price: 'S$50-60',
      border: 'Clear Singapore immigration at HarbourFront, then Indonesian immigration at Batam Centre.', terminal: '',
      steps: [{ mode: 'train', text: 'MRT to HarbourFront', duration: '20 min' }, { mode: 'ferry', text: 'Batam Fast ferry to Batam Centre', duration: '50 min' }],
      tips: 'Arrive 45 minutes early.',
    });
  });
  it('reads the older transport shape (route and terminal)', () => {
    expect(normalizeLeg(OLD_BUS)).toEqual({
      ...EMPTY_LEG, operator: 'Causeway Link', from: 'JB Sentral', to: 'Singapore (various drop-off points)',
      duration: '60-90 minutes', price: 'MYR 7-17', terminal: 'Sultan Iskandar CIQ (Malaysia), Woodlands Checkpoint (Singapore)',
    });
  });
  it('reads a ground leg stored as a flight', () => {
    expect(normalizeLeg(MISFILED_TRAIN)).toEqual({
      ...EMPTY_LEG, mode: 'train', operator: 'KTM Shuttle Tebrau', from: 'Singapore (Woodlands)', to: 'Johor Bahru (JB Sentral)',
      duration: '1-2 hours', price: 'S$5-15', tips: 'Book train tickets well in advance.',
    });
    expect(normalizeLeg(MISFILED_BUS)).toMatchObject({ mode: 'bus', operator: 'Plusliner', service: '', from: 'Kuala Lumpur (TBS)', to: 'Singapore (Lavender/Woodlands)' });
    expect(normalizeLeg({ airline: 'KTM', flightNumber: 'Shuttle Tebrau (or Bus)', route: 'Singapore (Woodlands) to Johor Bahru (JB Sentral)' }))
      .toMatchObject({ mode: 'train', operator: 'KTM', service: 'Shuttle Tebrau' });
    expect(normalizeLeg({ flightNumber: 'n/a coach', airline: 'Transtar' })).toMatchObject({ mode: 'bus', operator: 'Transtar', service: 'coach' });
  });
  it('maps driving to car, drops empty steps and turns numbers into text', () => {
    expect(normalizeLeg({ mode: 'drive', from: 'Singapore', to: 'Malacca', steps: [{ text: 'Second Link' }, { mode: 'self-drive', text: 'North-South Expressway', duration: 90 }, { text: '' }, null] })).toEqual({
      ...EMPTY_LEG, mode: 'car', from: 'Singapore', to: 'Malacca',
      steps: [{ mode: '', text: 'Second Link', duration: '' }, { mode: 'car', text: 'North-South Expressway', duration: '90' }],
    });
    expect(normalizeLeg({ mode: 'TAXI', route: 'Changi \u2192 City \u2192 Sentosa', operator: 42 })).toMatchObject({ mode: 'taxi', operator: '42', from: 'Changi', to: 'Sentosa' });
  });
  it('splits a route on a spaced separator only', () => {
    expect(normalizeLeg({ mode: 'self-drive', route: 'Singapore - Kuala-Lumpur' })).toMatchObject({ mode: 'car', from: 'Singapore', to: 'Kuala-Lumpur' });
    expect(normalizeLeg({ route: 'Bangkok \u2013 Chiang Mai', operator: 'State Railway', steps: 'none' })).toMatchObject({ mode: 'train', from: 'Bangkok', to: 'Chiang Mai', steps: [] });
    expect(normalizeLeg({ mode: 'rocket', operator: 'Grab', route: 'Home' })).toMatchObject({ mode: 'taxi', from: 'Home', to: '' });
    expect(normalizeLeg({ route: 'A \u2794 B \u2794 C' })).toMatchObject({ from: 'A', to: 'C' });
    expect(normalizeLeg({ route: 'A > B' })).toMatchObject({ from: 'A', to: 'B' });
    expect(normalizeLeg({ route: 'A>B' })).toMatchObject({ from: 'A>B', to: '' });
    expect(normalizeLeg({ route: 'A \u2014 B' })).toMatchObject({ from: 'A \u2014 B', to: '' });
  });
  it('falls back to the tips for the vehicle, then to bus', () => {
    expect(normalizeLeg({ mode: 'mrt', tips: 'Take the train' }).mode).toBe('train');
    expect(normalizeLeg({ airline: 'Jetstar', flightNumber: 'bus 12' }).mode).toBe('bus');
    expect(normalizeLeg(FLIGHT)).toMatchObject({ mode: 'bus', operator: 'Scoot', service: 'TR892', from: 'SIN', to: 'CTS' });
  });
  it('does not change the leg it is given', () => {
    expect(() => normalizeLeg(deepFreeze(structuredClone(FERRY)))).not.toThrow();
  });
});

describe('groundJourney', () => {
  it('is null for a trip by air or with nothing stored', () => {
    for (const extras of [null, undefined, {}, { transport: {} }, { flights: {} }, { flights: { outbound: FLIGHT } }, { flights: { outbound: FLIGHT, inbound: MISFILED_BUS } }]) {
      expect(groundJourney(extras), JSON.stringify(extras)).toBeNull();
    }
  });
  it('reads extras.transport, one leg or two', () => {
    expect(groundJourney({ transport: { outbound: FERRY } })).toEqual({ outbound: normalizeLeg(FERRY), inbound: null });
    expect(groundJourney({ transport: { inbound: OLD_BUS } })).toEqual({ outbound: null, inbound: normalizeLeg(OLD_BUS) });
  });
  it('prefers extras.transport over flights', () => {
    const journey = groundJourney({ transport: { outbound: FERRY, inbound: OLD_BUS }, flights: { outbound: FLIGHT } });
    expect([journey.outbound.mode, journey.inbound.mode]).toEqual(['ferry', 'bus']);
  });
  it('reads older trips whose ground legs were stored as flights', () => {
    const journey = groundJourney({ flights: { outbound: MISFILED_TRAIN, inbound: MISFILED_BUS } });
    expect(journey.outbound).toMatchObject({ mode: 'train', operator: 'KTM Shuttle Tebrau', from: 'Singapore (Woodlands)', to: 'Johor Bahru (JB Sentral)' });
    expect(journey.inbound).toMatchObject({ mode: 'bus', service: '' });
    expect(groundJourney({ flights: { outbound: MISFILED_TRAIN } })).toEqual({ outbound: normalizeLeg(MISFILED_TRAIN), inbound: null });
    expect(groundJourney({ flights: { inbound: MISFILED_BUS } })).toEqual({ outbound: null, inbound: normalizeLeg(MISFILED_BUS) });
  });
  it('does not change the extras it is given', () => {
    const extras = deepFreeze({ transport: { outbound: structuredClone(FERRY) }, flights: { outbound: { ...MISFILED_TRAIN } } });
    expect(() => groundJourney(extras)).not.toThrow();
  });
});

describe('journeyMode', () => {
  it('is the outbound mode, else the return mode, else bus', () => {
    expect(journeyMode(groundJourney({ transport: { outbound: FERRY, inbound: OLD_BUS } }))).toBe('ferry');
    expect(journeyMode(groundJourney({ transport: { inbound: { mode: 'taxi' } } }))).toBe('taxi');
    expect(journeyMode({ outbound: null, inbound: null })).toBe('bus');
    expect(journeyMode(null)).toBe('bus');
  });
});

describe('routeCodes', () => {
  it('lists every three-letter code of a leg route, in order', () => {
    expect(routeCodes({ route: 'SIN > TPE > CTS' })).toEqual(['SIN', 'TPE', 'CTS']);
    expect(routeCodes({ route: 'sin to hkg to cts' })).toEqual(['SIN', 'HKG', 'CTS']);
    expect(routeCodes({ route: 'Sapporo (CTS) via Seoul (ICN) and Bangkok (BKK) to Singapore (SIN)' })).toEqual(['CTS', 'VIA', 'ICN', 'AND', 'BKK', 'SIN']);
    expect(routeCodes({ route: 'SIN>NRT' })).toEqual(['SIN', 'NRT']);
  });
  it('is empty when there is no route', () => {
    expect(routeCodes({ route: 'Singapore to Johor Bahru' })).toEqual([]);
    expect(routeCodes({})).toEqual([]);
    expect(routeCodes(null)).toEqual([]);
    expect(routeCodes(undefined)).toEqual([]);
  });
});

describe('TRANSPORT_MODES', () => {
  it('lists the five vehicles a stored leg can name, as the planner does', () => {
    expect([...TRANSPORT_MODES]).toEqual(['bus', 'train', 'ferry', 'car', 'taxi']);
    expect(Object.isFrozen(TRANSPORT_MODES)).toBe(true);
  });
  it('is exactly what normalizeLeg keeps as a stored mode', () => {
    for (const mode of TRANSPORT_MODES) expect(normalizeLeg({ mode }).mode).toBe(mode);
    expect(normalizeLeg({ mode: 'Ferry' }).mode).toBe('ferry');
  });
  it('treats any other stored word as unknown, whatever it is', () => {
    expect(normalizeLeg({ mode: 'constructor' }).mode).toBe('bus');
    expect(normalizeLeg({ mode: '__proto__' }).mode).toBe('bus');
    expect(normalizeLeg({ mode: 'toString', steps: [{ mode: 'constructor', text: 'Walk to the gate' }] }).steps[0].mode).toBe('');
  });
});

describe('routeEnds', () => {
  const end = (code, label = code) => ({ code, label });

  it('reads the airport codes at both ends of a flight route, and the stops between', () => {
    expect(routeEnds({ route: 'SIN > TPE > CTS' })).toEqual({ from: end('SIN'), to: end('CTS'), via: ['TPE'] });
    expect(routeEnds({ route: 'SIN > NRT' })).toEqual({ from: end('SIN'), to: end('NRT'), via: [] });
    expect(routeEnds({ airline: 'Scoot', flightNumber: 'TR892', route: 'SIN>TPE>CTS' })).toEqual({ from: end('SIN'), to: end('CTS'), via: ['TPE'] });
    expect(routeEnds({ route: 'SIN \u2192 HKG \u2192 ICN \u2192 CTS' })).toEqual({ from: end('SIN'), to: end('CTS'), via: ['HKG', 'ICN'] });
    expect(routeEnds({ route: 'SIN - CTS' })).toEqual({ from: end('SIN'), to: end('CTS'), via: [] });
    expect(routeEnds({ route: 'SIN TPE CTS' })).toEqual({ from: end('SIN'), to: end('CTS'), via: ['TPE'] });
    expect(routeEnds({ route: 'SIN-CTS' })).toEqual({ from: end('SIN'), to: end('CTS'), via: [] });
  });

  it('keeps the city name beside a code in brackets', () => {
    expect(routeEnds({ route: 'Singapore (SIN) to Sapporo (CTS)' })).toEqual({ from: end('SIN', 'Singapore'), to: end('CTS', 'Sapporo'), via: [] });
    expect(routeEnds({ route: 'Singapore (SIN) \u2192 Taipei (TPE) \u2192 Sapporo (CTS)' })).toEqual({ from: end('SIN', 'Singapore'), to: end('CTS', 'Sapporo'), via: ['TPE'] });
    expect(routeEnds({ route: 'Singapore (SIN) to Sapporo (CTS) via Taipei (TPE)' })).toEqual({ from: end('SIN', 'Singapore'), to: end('CTS', 'Sapporo'), via: ['TPE'] });
    expect(routeEnds({ route: '(SIN) to (CTS)' })).toEqual({ from: end('SIN'), to: end('CTS'), via: [] });
  });

  it('splits a route written with the two-character arrow "->"', () => {
    expect(routeEnds({ route: 'Lisbon (LIS) -> Madrid (MAD) -> Vienna (VIE)' })).toEqual({ from: end('LIS', 'Lisbon'), to: end('VIE', 'Vienna'), via: ['MAD'] });
    expect(routeEnds({ route: 'LIS -> VIE' })).toEqual({ from: end('LIS'), to: end('VIE'), via: [] });
    expect(routeEnds({ route: 'Lisbon->Vienna' })).toEqual({ from: end(null, 'Lisbon'), to: end(null, 'Vienna'), via: [] });
  });

  it('has no code when the route names cities', () => {
    expect(routeEnds({ route: 'Singapore to Tokyo' })).toEqual({ from: end(null, 'Singapore'), to: end(null, 'Tokyo'), via: [] });
    expect(routeEnds({ route: 'Hue to Pai' })).toEqual({ from: end(null, 'Hue'), to: end(null, 'Pai'), via: [] });
    expect(routeEnds({ route: 'Singapore to Oslo via Doha and Copenhagen' })).toEqual({ from: end(null, 'Singapore'), to: end(null, 'Oslo'), via: ['Doha', 'Copenhagen'] });
    expect(routeEnds({ route: 'Singapore to Sapporo (CTS)' })).toEqual({ from: end(null, 'Singapore'), to: end('CTS', 'Sapporo'), via: [] });
  });

  it('names the two places of a ground or sea leg and never calls them airports', () => {
    expect(routeEnds(FERRY)).toEqual({ from: end(null, 'HarbourFront Centre, Singapore'), to: end(null, 'Batam Centre Ferry Terminal, Batam'), via: [] });
    expect(routeEnds(OLD_BUS)).toEqual({ from: end(null, 'JB Sentral'), to: end(null, 'Singapore (various drop-off points)'), via: [] });
    expect(routeEnds(normalizeLeg(OLD_BUS))).toEqual(routeEnds(OLD_BUS));
    // "TBS" is a bus terminal: a ground leg stored as a flight has no airport.
    expect(routeEnds(MISFILED_BUS)).toEqual({ from: end(null, 'Kuala Lumpur (TBS)'), to: end(null, 'Singapore (Lavender/Woodlands)'), via: [] });
    expect(routeEnds({ mode: 'train', route: 'KUL to SIN' })).toEqual({ from: end(null, 'KUL'), to: end(null, 'SIN'), via: [] });
  });

  it('gives one end when only one is known', () => {
    expect(routeEnds({ route: 'SIN' })).toEqual({ from: end('SIN'), to: end(null, ''), via: [] });
    expect(routeEnds({ mode: 'taxi', route: 'Home' })).toEqual({ from: end(null, 'Home'), to: end(null, ''), via: [] });
    // A stop named after "via" is never taken for the destination.
    expect(routeEnds({ route: 'Singapore via Doha' })).toEqual({ from: end(null, 'Singapore'), to: end(null, ''), via: ['Doha'] });
    expect(routeEnds({ mode: 'bus', to: 'Malacca Sentral' })).toEqual({ from: end(null, ''), to: end(null, 'Malacca Sentral'), via: [] });
  });

  it('is null when the leg names no place', () => {
    for (const leg of [null, undefined, 'SIN > CTS', 42, {}, { route: '' }, { route: '   ' }, { route: 7 }, { flightNumber: 'SQ12', airline: 'Singapore Airlines' }, { mode: 'bus' }]) {
      expect(routeEnds(leg), JSON.stringify(leg)).toBeNull();
    }
  });

  it('does not change the leg it is given', () => {
    expect(() => routeEnds(deepFreeze({ ...FLIGHT }))).not.toThrow();
    expect(() => routeEnds(deepFreeze(structuredClone(FERRY)))).not.toThrow();
  });
});

describe('normaliseTransportExtras', () => {
  const flights = {
    outbound: { airline: 'Causeway Link', flightNumber: 'CW2', route: 'Singapore to Johor Bahru', duration: '1h' },
    inbound: { route: 'Johor Bahru to Singapore', priceRange: 'MYR 5' },
  };

  it('moves legs stored as flights under transport for a trip planned by ground or sea', () => {
    const extras = deepFreeze({ accommodation: [{ name: 'Hotel' }], flights: structuredClone(flights), checklist: [] });
    const out = normaliseTransportExtras(extras, 'bus');
    expect(out).toEqual({
      accommodation: [{ name: 'Hotel' }],
      checklist: [],
      transport: {
        outbound: { airline: 'Causeway Link', flightNumber: 'CW2', route: 'Singapore to Johor Bahru', duration: '1h', mode: 'bus', operator: 'Causeway Link' },
        inbound: { route: 'Johor Bahru to Singapore', priceRange: 'MYR 5', mode: 'bus', operator: '' },
      },
    });
    expect(Object.keys(out)).toEqual(['accommodation', 'checklist', 'transport']);
    expect(groundJourney(out).outbound).toMatchObject({ mode: 'bus', operator: 'Causeway Link', service: 'CW2', from: 'Singapore', to: 'Johor Bahru' });
  });

  it('leaves the extras it was given untouched', () => {
    const extras = deepFreeze({ flights: structuredClone(flights) });
    const out = normaliseTransportExtras(extras, 'ferry');
    expect(out).not.toBe(extras);
    expect(extras).toEqual({ flights });
    expect(out.transport.outbound).not.toBe(extras.flights.outbound);
    expect(out.transport.outbound.mode).toBe('ferry');
  });

  it('keeps a missing leg missing', () => {
    const out = normaliseTransportExtras({ flights: { outbound: flights.outbound } }, 'train');
    expect(Object.keys(out.transport)).toEqual(['outbound', 'inbound']);
    expect(out.transport.inbound).toBeUndefined();
    expect(out.transport.outbound).toMatchObject({ mode: 'train', operator: 'Causeway Link' });
    expect(normaliseTransportExtras({ flights: {} }, 'train')).toEqual({ transport: { outbound: undefined, inbound: undefined } });
  });

  it('returns the very same object when there is nothing to move', () => {
    const byAir = { flights };
    expect(normaliseTransportExtras(byAir, '')).toBe(byAir);
    expect(normaliseTransportExtras(byAir, undefined)).toBe(byAir);
    const already = { flights, transport: { outbound: { mode: 'bus' } } };
    expect(normaliseTransportExtras(already, 'bus')).toBe(already);
    const none = { accommodation: [] };
    expect(normaliseTransportExtras(none, 'bus')).toBe(none);
    expect(normaliseTransportExtras(null, 'bus')).toBeNull();
    expect(normaliseTransportExtras(undefined, 'bus')).toBeUndefined();
  });
});
