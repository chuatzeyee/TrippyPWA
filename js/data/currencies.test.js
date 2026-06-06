import { describe, it, expect } from 'vitest';
import { convert, canConvert, formatCurrency } from './currencies.js';

describe('canConvert', () => {
  it('returns true for known currencies', () => {
    expect(canConvert('USD')).toBe(true);
    expect(canConvert('SGD')).toBe(true);
    expect(canConvert('JPY')).toBe(true);
  });
  it('returns false for unknown currencies', () => {
    expect(canConvert('XYZ')).toBe(false);
    expect(canConvert('')).toBe(false);
    expect(canConvert(undefined)).toBe(false);
  });
});

describe('convert', () => {
  it('is identity for same currency', () => {
    expect(convert(100, 'USD', 'USD')).toBe(100);
    expect(convert(2500, 'JPY', 'JPY')).toBe(2500);
  });

  it('converts via USD cross-rate', () => {
    // 135 SGD -> USD (rate 1.35) = 100 USD
    expect(convert(135, 'SGD', 'USD')).toBe(100);
    // 100 USD -> SGD = 135
    expect(convert(100, 'USD', 'SGD')).toBe(135);
  });

  it('does NOT silently scale an unknown currency by USD', () => {
    // Regression: previously an unknown code fell back to rate 1 and showed a
    // wrong USD-equivalent. Now it returns the amount unchanged.
    expect(convert(500, 'XYZ', 'USD')).toBe(500);
    expect(convert(500, 'USD', 'XYZ')).toBe(500);
  });

  it('rounds to an integer', () => {
    expect(Number.isInteger(convert(99, 'EUR', 'JPY'))).toBe(true);
  });
});

describe('formatCurrency', () => {
  it('prefixes the symbol', () => {
    expect(formatCurrency(1000, '$')).toContain('$');
  });
});
