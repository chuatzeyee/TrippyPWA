import { describe, it, expect } from 'vitest';
import { alpha3 } from './country-codes.js';
import { DESTINATIONS } from '../wizard/destinations.js';

describe('alpha3', () => {
  it('has a code for every country in the destination catalogue', () => {
    const flags = [...new Set(DESTINATIONS.map((d) => d.flag))];
    expect(flags.length).toBeGreaterThanOrEqual(40);
    const missing = flags.filter((flag) => !/^[A-Z]{3}$/.test(alpha3(flag) || ''));
    expect(missing).toEqual([]);
  });

  it('gives the ISO 3166 code, not a guess from the two letters', () => {
    expect(alpha3('sg')).toBe('SGP');
    expect(alpha3('jp')).toBe('JPN');
    expect(alpha3('au')).toBe('AUS');
    expect(alpha3('gb')).toBe('GBR');
    expect(alpha3('ch')).toBe('CHE');
    expect(alpha3('de')).toBe('DEU');
    expect(alpha3('es')).toBe('ESP');
    expect(alpha3('za')).toBe('ZAF');
    expect(alpha3('kr')).toBe('KOR');
    expect(alpha3('ae')).toBe('ARE');
    expect(alpha3('hr')).toBe('HRV');
    expect(alpha3('kh')).toBe('KHM');
    expect(alpha3('la')).toBe('LAO');
    expect(alpha3('ma')).toBe('MAR');
    expect(alpha3('is')).toBe('ISL');
    expect(alpha3('om')).toBe('OMN');
  });

  it('covers places outside the catalogue that plans name (custom cities, the wider city list)', () => {
    expect(alpha3('hk')).toBe('HKG');
    expect(alpha3('mn')).toBe('MNG');
    expect(alpha3('in')).toBe('IND');
    expect(alpha3('br')).toBe('BRA');
  });

  it('reads the flag in either case and with spaces around it', () => {
    expect(alpha3('SG')).toBe('SGP');
    expect(alpha3(' nz ')).toBe('NZL');
  });

  it('gives null for an unknown, empty or malformed flag', () => {
    expect(alpha3('')).toBeNull();
    expect(alpha3(null)).toBeNull();
    expect(alpha3(undefined)).toBeNull();
    expect(alpha3('zz')).toBeNull();
    expect(alpha3('xx')).toBeNull();
    expect(alpha3('s')).toBeNull();
    expect(alpha3('sgp')).toBeNull();
    expect(alpha3('gb-sct')).toBeNull();
    expect(alpha3(65)).toBeNull();
    expect(alpha3({})).toBeNull();
    expect(alpha3('constructor')).toBeNull();
    expect(alpha3('__')).toBeNull();
  });

  it('every code in the table is three capital letters and no two countries share one', () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const codes = [];
    for (const a of letters) for (const b of letters) { const code = alpha3(a + b); if (code !== null) codes.push(code); }
    expect(codes.length).toBeGreaterThanOrEqual(240);
    expect(codes.every((code) => /^[A-Z]{3}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
