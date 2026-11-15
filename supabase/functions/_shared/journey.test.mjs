import { describe, it, expect } from 'vitest';
import { normalizeRoute, formatLocalDateTime, bookedFlightLegs, bookedFlightPrompt, mergeBookedFlights } from './journey.ts';
import { buildExtras, buildPromptAndSchema } from './generation.ts';

const sapporo = {
  destination: { name: 'Sapporo', currencyCode: 'JPY', currencySymbol: '¥' },
  dates: { start: '2027-01-13', end: '2027-01-25' },
  flights: {
    settled: true, flightNumber: 'TR892',
    booked: {
      outbound: { flightNumber: 'TR892', route: 'sin>tpe - CTS', depart: '2027-01-13T06:10', arrive: '2027-01-13T17:00' },
      inbound: { flightNumber: 'TR893', route: 'CTS TPE SIN', depart: '2027-01-25T18:15', arrive: '2027-01-26T04:00' },
    },
  },
  departureCity: 'Singapore',
};

describe('booked flights', () => {
  it('normalizes routes and local times', () => {
    expect(normalizeRoute('sin>tpe - CTS')).toBe('SIN > TPE > CTS');
    expect(normalizeRoute('Singapore')).toBe('');
    expect(formatLocalDateTime('2027-01-13T06:10')).toBe('Wed 13 Jan 06:10');
    expect(formatLocalDateTime('soon')).toBe('');
  });

  it('builds card legs from exactly what the traveller entered', () => {
    const { outbound, inbound } = bookedFlightLegs(sapporo);
    expect(outbound).toMatchObject({ airline: 'Scoot', flightNumber: 'TR892', route: 'SIN > TPE > CTS', depart: 'Wed 13 Jan 06:10, SIN', arrive: 'Wed 13 Jan 17:00, CTS', booked: true });
    expect(inbound).toMatchObject({ route: 'CTS > TPE > SIN', arrive: 'Tue 26 Jan 04:00, SIN' });
  });

  it('replaces the model version of a booked direction only', () => {
    const suggested = { outbound: { flightNumber: 'TR892', route: 'SIN - CTS', arrive: '08:30' }, inbound: { flightNumber: 'XX1' } };
    const onlyOut = { ...sapporo, flights: { settled: true, booked: { outbound: sapporo.flights.booked.outbound } } };
    const merged = mergeBookedFlights(suggested, onlyOut);
    expect(merged.outbound.route).toBe('SIN > TPE > CTS');
    expect(merged.inbound).toEqual({ flightNumber: 'XX1' });
    expect(buildExtras({ flights: suggested }, 'gemini', sapporo).flights.outbound.arrive).toBe('Wed 13 Jan 17:00, CTS');
  });

  it('tells the model when the traveller lands and leaves', () => {
    const text = bookedFlightPrompt(sapporo);
    expect(text).toMatch(/lands at 2027-01-13 17:00 local time/);
    expect(text).toMatch(/Never schedule anything before the landing time/);
    expect(text).toMatch(/departs at 2027-01-25 18:15 local time/);
    const { prompt } = buildPromptAndSchema(sapporo, { dayFrom: 1, dayTo: 4, includeExtras: true });
    expect(prompt).toContain('ARRIVAL FLIGHT (BOOKED, use exactly): TR892 SIN > TPE > CTS lands at 2027-01-13 17:00');
    expect(prompt).toContain('including EVERY stop');
  });

  it('keeps older wizard states that only had a flight number', () => {
    const old = { flights: { settled: true, flightNumber: 'SQ 321', arrivalDate: '2027-01-13' } };
    expect(bookedFlightLegs(old).outbound).toMatchObject({ flightNumber: 'SQ 321', airline: 'Singapore Airlines', booked: true });
    expect(bookedFlightLegs({ flights: { settled: false } })).toBeNull();
    expect(bookedFlightPrompt(old)).toContain('ARRIVAL FLIGHT (BOOKED, use exactly): SQ 321 arrives on 2027-01-13');
    expect(buildPromptAndSchema({ ...old, destination: { name: 'Tokyo' } }, { includeExtras: true }).prompt).toContain('SQ 321 arrives on 2027-01-13');
  });
});

describe('transport prompt', () => {
  it('asks for boarding and alighting points, connections and the border', () => {
    const ws = { destination: { name: 'Batam' }, isNearbyTrip: true, transport: { mode: 'ferry' }, departureCity: 'Singapore' };
    const { prompt, geminiSchema } = buildPromptAndSchema(ws, { includeExtras: true });
    expect(prompt).toMatch(/terminal where they EMBARK/);
    expect(prompt).toMatch(/terminal where they DISEMBARK/);
    expect(geminiSchema.properties.transport.properties.outbound.required).toEqual(expect.arrayContaining(['from', 'to', 'border', 'steps']));
    expect(geminiSchema.properties.flights).toBeUndefined();
  });

  it('treats a multi-city route that starts at home as travel, not a local trip', () => {
    const ws = { multiCity: true, destinations: [{ name: 'Singapore' }, { name: 'Johor Bahru' }, { name: 'Kuala Lumpur' }], isNearbyTrip: true, departureCity: 'Singapore' };
    const { prompt } = buildPromptAndSchema(ws, { includeExtras: true });
    expect(prompt).not.toMatch(/LOCAL exploration trip/);
    expect(prompt).toMatch(/starts in the traveller's home city \(Singapore\)/);
  });
});
