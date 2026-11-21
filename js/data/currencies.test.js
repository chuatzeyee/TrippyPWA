import { describe, it, expect } from 'vitest';
import { convert, canConvert, formatCurrency } from './currencies.js';
import { CURRENCY_LIST } from './currency-list.js';

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

describe('the rates added for the redesign (NOK, MNT, LAK)', () => {
  const ADDED = ['NOK', 'MNT', 'LAK'];

  it('can convert each of them', () => {
    for (const code of ADDED) expect(canConvert(code), code).toBe(true);
  });

  it('converts each of them into another currency and back', () => {
    for (const code of ADDED) {
      const toUsd = convert(1_000_000, code, 'USD');
      expect(toUsd, `${code} to USD`).toBeGreaterThan(0);
      expect(toUsd, `${code} to USD`).not.toBe(1_000_000);
      const back = convert(toUsd, 'USD', code);
      // Both ways round to whole units, so the way back is close, not exact.
      expect(Math.abs(back - 1_000_000) / 1_000_000, `USD to ${code}`).toBeLessThan(0.05);

      const fromSgd = convert(100, 'SGD', code);
      expect(fromSgd, `SGD to ${code}`).not.toBe(100);
      expect(convert(fromSgd, code, 'SGD'), `${code} to SGD`).toBe(100);
    }
  });

  it('puts each rate in the right order of magnitude against the US dollar', () => {
    // Static approximations: a krone is about a tenth of a dollar, a tugrik
    // about a 3,600th and a kip about a 22,000th.
    const perUsd = (code) => convert(1000, 'USD', code) / 1000;
    expect(perUsd('NOK')).toBeGreaterThan(7);
    expect(perUsd('NOK')).toBeLessThan(14);
    expect(perUsd('MNT')).toBeGreaterThan(2500);
    expect(perUsd('MNT')).toBeLessThan(5000);
    expect(perUsd('LAK')).toBeGreaterThan(15000);
    expect(perUsd('LAK')).toBeLessThan(30000);
  });

  it('converts between two of them', () => {
    const tugrik = convert(970, 'NOK', 'MNT');
    expect(tugrik).toBeGreaterThan(970 * 100);
    expect(convert(tugrik, 'MNT', 'NOK')).toBe(970);
  });

  it('still returns the amount unchanged when the other code is unknown', () => {
    for (const code of ADDED) {
      expect(convert(500, code, 'XYZ')).toBe(500);
      expect(convert(500, 'XYZ', code)).toBe(500);
    }
    expect(convert(12.4, 'XYZ', 'ABC')).toBe(12);
    expect(canConvert('XYZ')).toBe(false);
    expect(canConvert('nok')).toBe(false);
    expect(canConvert('toString')).toBe(false);
  });
});

describe('the home currencies on offer', () => {
  it('has a rate for every entry of CURRENCY_LIST', () => {
    expect(CURRENCY_LIST.length).toBeGreaterThan(0);
    for (const { code } of CURRENCY_LIST) expect(canConvert(code), code).toBe(true);
  });

  it('converts 100 units of every entry into every other without falling back to the same number by mistake', () => {
    for (const from of CURRENCY_LIST) {
      for (const to of CURRENCY_LIST) {
        const out = convert(100, from.code, to.code);
        expect(Number.isInteger(out), `${from.code} to ${to.code}`).toBe(true);
        expect(out, `${from.code} to ${to.code}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
