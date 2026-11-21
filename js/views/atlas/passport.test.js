// The passport: a stamp per country, pure.
import { describe, it, expect } from 'vitest';
import { DASHBOARD_FIXTURES } from '../fixtures/models.js';
import { stampRows, passportLine, STAMP_INKS } from './passport.js';

const COUNTRIES = [
  { flag: 'es', code3: 'ESP', country: 'Spain', trips: 1, phase: 'live', firstDate: '2027-03-04', isHome: false },
  { flag: 'it', code3: 'ITA', country: 'Italy', trips: 2, phase: 'past', firstDate: '2026-11-12', isHome: false },
  { flag: 'ma', code3: 'MAR', country: 'Morocco', trips: 1, phase: 'upcoming', firstDate: '2027-03-19', isHome: false },
  { flag: '', code3: null, country: 'Atlantis', trips: 1, phase: 'past', firstDate: '', isHome: false },
  { flag: 'ca', code3: 'CAN', country: 'Canada', trips: 1, phase: 'upcoming', firstDate: '', isHome: false },
  { flag: 'xx', code3: 'XXX', country: '', trips: 1, phase: 'past', firstDate: '2025-01-01', isHome: false },
];

describe('stampRows', () => {
  const { stamped, coming } = stampRows(COUNTRIES);
  it('stamps past and current plans, and keeps what is coming up apart', () => {
    expect(stamped.map((stamp) => stamp.country)).toEqual(['Spain', 'Italy', 'Atlantis']);
    expect(coming.map((stamp) => stamp.country)).toEqual(['Morocco', 'Canada']);
  });
  it('writes "now" for a live plan, the number of plans otherwise, never trips', () => {
    expect(stamped.map((stamp) => stamp.note)).toEqual(['now', '2 plans', '1 plan']);
  });
  it('writes the date of a country that is coming up', () => {
    expect(coming.map((stamp) => stamp.note)).toEqual(['19 Mar', 'No dates yet']);
  });
  it('carries the code, or an empty one when the country has none', () => {
    expect(stamped.map((stamp) => stamp.code3)).toEqual(['ESP', 'ITA', '']);
  });
  it('gives each stamp a token colour, a shape and a small tilt, the same every time', () => {
    for (const stamp of stamped) {
      expect(STAMP_INKS).toContain(stamp.ink);
      expect(typeof stamp.round).toBe('boolean');
      expect(Math.abs(stamp.tilt)).toBeLessThanOrEqual(3);
      expect(Number.isInteger(stamp.tilt)).toBe(true);
    }
    expect(stamped.map((stamp) => stamp.round)).toEqual([false, true, false]);
    expect(stampRows(COUNTRIES)).toEqual({ stamped, coming });
  });
  it('keys each stamp, so a patch can keep it', () => {
    const keys = [...stamped, ...coming].map((stamp) => stamp.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => typeof key === 'string' && key !== '')).toBe(true);
  });
  it('reads anything else as no stamps and leaves its input alone', () => {
    expect(stampRows(null)).toEqual({ stamped: [], coming: [] });
    const before = JSON.stringify(COUNTRIES);
    stampRows(COUNTRIES);
    expect(JSON.stringify(COUNTRIES)).toBe(before);
  });
  it('stamps every country of the sample account', () => {
    const { byCountry } = DASHBOARD_FIXTURES.ready.stats;
    const rows = stampRows(byCountry);
    expect(rows.stamped.length + rows.coming.length).toBe(byCountry.length);
  });
});

describe('passportLine', () => {
  it('counts plans, never journeys', () => {
    expect(passportLine(stampRows(COUNTRIES))).toBe('5 countries: 3 in plans so far, 2 coming up');
    expect(passportLine(stampRows(COUNTRIES.slice(0, 2)))).toBe('2 countries in plans so far');
    expect(passportLine(stampRows(COUNTRIES.slice(2, 3)))).toBe('1 country coming up');
    expect(passportLine(stampRows([]))).toBe('No countries yet');
  });
});
