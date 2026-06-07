import { describe, it, expect } from 'vitest';
import { currencyForCountry, currencySymbolFor } from './currency-map.js';

describe('currencyForCountry', () => {
  it('maps known countries to their currency', () => {
    expect(currencyForCountry('MN').code).toBe('MNT');
    expect(currencyForCountry('JP').code).toBe('JPY');
    expect(currencyForCountry('KH').code).toBe('KHR');
    expect(currencyForCountry('VN').code).toBe('VND');
  });

  it('is case-insensitive on the country code', () => {
    expect(currencyForCountry('mn').code).toBe('MNT');
    expect(currencyForCountry('Jp').code).toBe('JPY');
  });

  it('maps all Eurozone members to EUR', () => {
    for (const cc of ['FR', 'DE', 'IT', 'ES', 'PT', 'NL', 'AT', 'HR']) {
      expect(currencyForCountry(cc).code).toBe('EUR');
    }
  });

  it('falls back to USD for unknown or missing codes', () => {
    expect(currencyForCountry('ZZ').code).toBe('USD');
    expect(currencyForCountry('').code).toBe('USD');
    expect(currencyForCountry(undefined).code).toBe('USD');
  });

  it('always returns a non-empty symbol', () => {
    expect(currencyForCountry('MN').symbol).toBeTruthy();
    expect(currencyForCountry('ZZ').symbol).toBeTruthy();
  });
});

describe('currencySymbolFor', () => {
  it('derives compact symbols for common currencies', () => {
    expect(currencySymbolFor('JPY')).toBe('¥');
    expect(currencySymbolFor('EUR')).toBe('€');
    expect(currencySymbolFor('GBP')).toBe('£');
    expect(currencySymbolFor('VND')).toBe('₫');
    expect(currencySymbolFor('KRW')).toBe('₩');
  });

  it('returns the code itself for unknown currencies', () => {
    expect(currencySymbolFor('ZZZ')).toBe('ZZZ');
  });

  it('defaults to $ when given no code', () => {
    expect(currencySymbolFor('')).toBe('$');
    expect(currencySymbolFor(undefined)).toBe('$');
  });
});
