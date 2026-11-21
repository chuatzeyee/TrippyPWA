import { describe, it, expect } from 'vitest';
import { tripCurrencyCode, sumCosts, foreignCurrency, costInTripCurrency } from './cost-sum.js';
import { convert, canConvert } from '../data/currencies.js';

// Pinned to the functions as they stood in js/components/trip-detail.js before
// they moved to js/lib. Converted amounts are stated through convert(), so the
// tests follow the rate table instead of repeating it. QQQ and XYZ stand for
// currencies the table has no rate for. The trips and activities are invented.

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('the rate table these tests rely on', () => {
  it('has rates for JPY, USD, SGD, EUR and GBP and none for QQQ or XYZ', () => {
    for (const code of ['JPY', 'USD', 'SGD', 'EUR', 'GBP']) expect(canConvert(code), code).toBe(true);
    for (const code of ['QQQ', 'XYZ']) expect(canConvert(code), code).toBe(false);
  });
});

describe('tripCurrencyCode', () => {
  it('uses the destination currency of a single-destination trip, in capitals', () => {
    expect(tripCurrencyCode({ wizard_state: { destination: { currencyCode: 'JPY' } } })).toBe('JPY');
    expect(tripCurrencyCode({ wizard_state: { destination: { currencyCode: 'jpy' } }, budget_currency: 'SGD' })).toBe('JPY');
  });

  it('uses the first destination of a multi-city trip', () => {
    const trip = {
      wizard_state: {
        multiCity: true,
        destinations: [{ currencyCode: 'eur' }, { currencyCode: 'GBP' }],
        destination: { currencyCode: 'JPY' },
      },
    };
    expect(tripCurrencyCode(trip)).toBe('EUR');
  });

  it('falls back to the budget currency when the destination has none', () => {
    expect(tripCurrencyCode({ wizard_state: { destination: {} }, budget_currency: 'aud' })).toBe('AUD');
    expect(tripCurrencyCode({ wizard_state: { destination: { currencyCode: '' } }, budget_currency: 'aud' })).toBe('AUD');
    expect(tripCurrencyCode({ budget_currency: 'krw' })).toBe('KRW');
    expect(tripCurrencyCode({ wizard_state: null, budget_currency: 'KRW' })).toBe('KRW');
  });

  it('does not read the single destination of a multi-city trip, or the list of a single one', () => {
    expect(tripCurrencyCode({ wizard_state: { multiCity: true, destinations: [], destination: { currencyCode: 'JPY' } }, budget_currency: 'sgd' })).toBe('SGD');
    expect(tripCurrencyCode({ wizard_state: { multiCity: true, destination: { currencyCode: 'JPY' } } })).toBe('USD');
    expect(tripCurrencyCode({ wizard_state: { multiCity: false, destinations: [{ currencyCode: 'EUR' }] }, budget_currency: 'thb' })).toBe('THB');
  });

  it('is USD when nothing is known', () => {
    expect(tripCurrencyCode({})).toBe('USD');
    expect(tripCurrencyCode(null)).toBe('USD');
    expect(tripCurrencyCode(undefined)).toBe('USD');
  });

  it('does not change its input', () => {
    const trip = deepFreeze({ wizard_state: { destination: { currencyCode: 'jpy' } }, budget_currency: 'sgd' });
    expect(tripCurrencyCode(trip)).toBe('JPY');
    expect(trip).toEqual({ wizard_state: { destination: { currencyCode: 'jpy' } }, budget_currency: 'sgd' });
  });
});

describe('sumCosts, same currency', () => {
  it('adds activities priced in the trip currency as they are', () => {
    const activities = [
      { cost_amount: 1000 },
      { cost_amount: 2500, cost_currency: 'JPY' },
      { cost_amount: 300, cost_currency: 'jpy' },
      { cost_amount: 200, cost_currency: ' jpy ' },
    ];
    expect(sumCosts(activities, 'JPY')).toEqual({ total: 4000, excluded: 0 });
  });

  it('reads numeric strings and counts a missing or unreadable amount as nothing', () => {
    const activities = [
      { cost_amount: '1200' },
      { cost_amount: 0 },
      { cost_amount: null },
      { cost_amount: 'abc' },
      {},
      null,
      undefined,
      { cost_amount: 12.5 },
    ];
    expect(sumCosts(activities, 'JPY')).toEqual({ total: 1212.5, excluded: 0 });
  });

  it('treats a code that is not three letters as the trip currency', () => {
    const activities = [
      { cost_amount: 100, cost_currency: 'US' },
      { cost_amount: 100, cost_currency: 'dollars' },
      { cost_amount: 100, cost_currency: '$' },
      { cost_amount: 100, cost_currency: '' },
      { cost_amount: 100, cost_currency: 840 },
    ];
    expect(sumCosts(activities, 'JPY')).toEqual({ total: 500, excluded: 0 });
  });

  it('adds same-currency amounts even when the trip currency has no rate', () => {
    expect(sumCosts([{ cost_amount: 1000 }, { cost_amount: 9, cost_currency: 'LAK' }], 'LAK')).toEqual({ total: 1009, excluded: 0 });
  });

  it('is zero for an empty or missing list', () => {
    expect(sumCosts([], 'JPY')).toEqual({ total: 0, excluded: 0 });
    expect(sumCosts(null, 'JPY')).toEqual({ total: 0, excluded: 0 });
    expect(sumCosts(undefined, 'JPY')).toEqual({ total: 0, excluded: 0 });
    expect(sumCosts(undefined, undefined)).toEqual({ total: 0, excluded: 0 });
  });
});

describe('sumCosts, convertible', () => {
  it('converts another currency into the trip currency before adding', () => {
    const result = sumCosts([{ cost_amount: 1000 }, { cost_amount: 50, cost_currency: 'USD' }], 'JPY');
    expect(result).toEqual({ total: 1000 + convert(50, 'USD', 'JPY'), excluded: 0 });
    expect(result.total).not.toBe(1050);
  });

  it('converts in either direction and from several currencies', () => {
    expect(sumCosts([{ cost_amount: 10000, cost_currency: 'JPY' }], 'SGD'))
      .toEqual({ total: convert(10000, 'JPY', 'SGD'), excluded: 0 });
    expect(sumCosts([{ cost_amount: 20, cost_currency: 'EUR' }, { cost_amount: 30, cost_currency: 'gbp' }, { cost_amount: 15 }], 'SGD'))
      .toEqual({ total: convert(20, 'EUR', 'SGD') + convert(30, 'GBP', 'SGD') + 15, excluded: 0 });
  });

  it('converts each activity on its own, so rounding happens per activity', () => {
    const activities = [
      { cost_amount: 0.4, cost_currency: 'USD' },
      { cost_amount: 0.4, cost_currency: 'USD' },
      { cost_amount: 0.4, cost_currency: 'USD' },
    ];
    const each = convert(0.4, 'USD', 'SGD');
    expect(Number.isInteger(each)).toBe(true);
    expect(sumCosts(activities, 'SGD')).toEqual({ total: each * 3, excluded: 0 });
  });
});

describe('sumCosts, not convertible', () => {
  it('leaves out and counts an activity whose currency has no rate', () => {
    expect(sumCosts([{ cost_amount: 1000 }, { cost_amount: 50, cost_currency: 'XYZ' }], 'JPY')).toEqual({ total: 1000, excluded: 1 });
  });

  it('counts every activity it leaves out and still converts the ones it can', () => {
    const activities = [
      { cost_amount: 1000 },
      { cost_amount: 50, cost_currency: 'XYZ' },
      { cost_amount: 70, cost_currency: 'QQQ' },
      { cost_amount: 20, cost_currency: 'USD' },
    ];
    expect(sumCosts(activities, 'JPY')).toEqual({ total: 1000 + convert(20, 'USD', 'JPY'), excluded: 2 });
  });

  it('leaves out a foreign amount when the trip currency itself has no rate', () => {
    const activities = [{ cost_amount: 1000 }, { cost_amount: 50, cost_currency: 'USD' }];
    expect(sumCosts(activities, 'QQQ')).toEqual({ total: 1000, excluded: 1 });
  });

  it('does not count an activity with no amount, whatever its currency', () => {
    const activities = [{ cost_amount: 0, cost_currency: 'XYZ' }, { cost_currency: 'XYZ' }, { cost_amount: 5, cost_currency: 'XYZ' }];
    expect(sumCosts(activities, 'JPY')).toEqual({ total: 0, excluded: 1 });
  });

  it('expects the trip code in capitals, as tripCurrencyCode gives it', () => {
    expect(sumCosts([{ cost_amount: 50, cost_currency: 'USD' }], 'jpy')).toEqual({ total: 0, excluded: 1 });
  });
});

describe('sumCosts, inputs', () => {
  it('does not change the activities it is given', () => {
    const activities = deepFreeze([
      { cost_amount: 1000 },
      { cost_amount: 50, cost_currency: 'usd' },
      { cost_amount: 50, cost_currency: 'XYZ' },
    ]);
    expect(sumCosts(activities, 'JPY')).toEqual({ total: 1000 + convert(50, 'USD', 'JPY'), excluded: 1 });
    expect(activities).toEqual([
      { cost_amount: 1000 },
      { cost_amount: 50, cost_currency: 'usd' },
      { cost_amount: 50, cost_currency: 'XYZ' },
    ]);
  });

  it('returns a new result each time', () => {
    const first = sumCosts([{ cost_amount: 10 }], 'JPY');
    const second = sumCosts([{ cost_amount: 10 }], 'JPY');
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});

describe('foreignCurrency', () => {
  it('gives the activity currency in capitals when it differs from the trip currency', () => {
    expect(foreignCurrency({ cost_currency: 'usd' }, 'JPY')).toBe('USD');
    expect(foreignCurrency({ cost_currency: ' eur ' }, 'JPY')).toBe('EUR');
    expect(foreignCurrency({ cost_currency: 'XYZ' }, 'JPY')).toBe('XYZ');
  });

  it('is empty for the trip currency, an unusable code or a missing activity', () => {
    expect(foreignCurrency({ cost_currency: 'JPY' }, 'JPY')).toBe('');
    expect(foreignCurrency({ cost_currency: 'US' }, 'JPY')).toBe('');
    expect(foreignCurrency({}, 'JPY')).toBe('');
    expect(foreignCurrency(null, 'JPY')).toBe('');
  });
});

describe('costInTripCurrency', () => {
  it('gives the amount as it is when the activity is in the trip currency', () => {
    expect(costInTripCurrency({ cost_amount: 50 }, 'JPY')).toBe(50);
    expect(costInTripCurrency({ cost_amount: '75', cost_currency: 'SGD' }, 'SGD')).toBe(75);
  });

  it('gives the converted amount when both currencies have a rate', () => {
    expect(costInTripCurrency({ cost_amount: 50, cost_currency: 'usd' }, 'JPY')).toBe(convert(50, 'USD', 'JPY'));
  });

  it('gives null when it cannot convert', () => {
    expect(costInTripCurrency({ cost_amount: 50, cost_currency: 'XYZ' }, 'JPY')).toBeNull();
    expect(costInTripCurrency({ cost_amount: 50, cost_currency: 'USD' }, 'XYZ')).toBeNull();
  });

  it('gives zero when there is no amount, before looking at the currency', () => {
    expect(costInTripCurrency({ cost_amount: 0, cost_currency: 'XYZ' }, 'JPY')).toBe(0);
    expect(costInTripCurrency(null, 'JPY')).toBe(0);
  });
});
