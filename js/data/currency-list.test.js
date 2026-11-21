import { describe, it, expect } from 'vitest';
import { CURRENCY_LIST, currencyOptions } from './currency-list.js';
import { canConvert } from './currencies.js';

describe('CURRENCY_LIST', () => {
  it('holds the 27 home currencies the profile wizard has always offered, in its order', () => {
    expect(CURRENCY_LIST).toHaveLength(27);
    expect(CURRENCY_LIST.map(c => c.code)).toEqual([
      'SGD', 'USD', 'EUR', 'GBP', 'AUD', 'MYR', 'JPY', 'KRW', 'THB', 'IDR', 'PHP', 'TWD', 'HKD', 'NZD',
      'CAD', 'CHF', 'AED', 'INR', 'CNY', 'VND', 'CZK', 'SEK', 'NOK', 'TRY', 'ZAR', 'MXN', 'BRL',
    ]);
  });
  it('keeps every symbol and name', () => {
    expect(CURRENCY_LIST.map(c => `${c.code} ${c.symbol} ${c.name}`)).toEqual([
      'SGD S$ Singapore Dollar', 'USD $ US Dollar', 'EUR € Euro', 'GBP £ British Pound', 'AUD A$ Australian Dollar',
      'MYR RM Malaysian Ringgit', 'JPY ¥ Japanese Yen', 'KRW ₩ South Korean Won', 'THB ฿ Thai Baht',
      'IDR Rp Indonesian Rupiah', 'PHP ₱ Philippine Peso', 'TWD NT$ Taiwan Dollar', 'HKD HK$ Hong Kong Dollar',
      'NZD NZ$ New Zealand Dollar', 'CAD C$ Canadian Dollar', 'CHF CHF Swiss Franc', 'AED د.إ UAE Dirham',
      'INR ₹ Indian Rupee', 'CNY ¥ Chinese Yuan', 'VND ₫ Vietnamese Dong', 'CZK Kč Czech Koruna',
      'SEK kr Swedish Krona', 'NOK kr Norwegian Krone', 'TRY ₺ Turkish Lira', 'ZAR R South African Rand',
      'MXN MX$ Mexican Peso', 'BRL R$ Brazilian Real',
    ]);
  });
  it('has exactly the three fields code, symbol and name on each entry, and no code twice', () => {
    for (const entry of CURRENCY_LIST) expect(Object.keys(entry)).toEqual(['code', 'symbol', 'name']);
    expect(new Set(CURRENCY_LIST.map(c => c.code)).size).toBe(27);
  });
  it('cannot be changed by a caller', () => {
    expect(Object.isFrozen(CURRENCY_LIST)).toBe(true);
    expect(CURRENCY_LIST.every(Object.isFrozen)).toBe(true);
  });
  it('has an exchange rate for every entry', () => {
    // A home currency without a rate would make "show my currency first" do
    // nothing.
    const awaitingRate = [];
    const missing = CURRENCY_LIST.map(c => c.code).filter(code => !canConvert(code));
    expect(missing.filter(code => !awaitingRate.includes(code))).toEqual([]);
  });
});

describe('currencyOptions', () => {
  const codes = (list) => list.map(c => c.code);

  it('offers the 27 entries when the stored currency is one of them, or when none is stored', () => {
    expect(currencyOptions('SGD')).toEqual([...CURRENCY_LIST]);
    expect(currencyOptions('BRL')).toEqual([...CURRENCY_LIST]);
    for (const none of [undefined, null, '', '   ', 0, 42, {}]) expect(currencyOptions(none), String(none)).toEqual([...CURRENCY_LIST]);
  });
  it('always offers the stored currency, also when the list does not have it', () => {
    const options = currencyOptions('DKK');
    expect(options).toHaveLength(28);
    expect(codes(options).slice(0, 27)).toEqual(codes(CURRENCY_LIST));
    expect(options[27]).toEqual({ code: 'DKK', symbol: 'DKK', name: 'DKK' });
  });
  it('keeps the stored symbol for a currency the list does not have', () => {
    expect(currencyOptions('DKK', 'kr').at(-1)).toEqual({ code: 'DKK', symbol: 'kr', name: 'DKK' });
    expect(currencyOptions('ISK', '  ').at(-1)).toEqual({ code: 'ISK', symbol: 'ISK', name: 'ISK' });
    expect(currencyOptions('SGD', 'kr')).toEqual([...CURRENCY_LIST]);
  });
  it('matches the stored value exactly as it is stored, so it can be the selected option', () => {
    expect(currencyOptions('sgd').at(-1)).toEqual({ code: 'sgd', symbol: 'sgd', name: 'sgd' });
    expect(currencyOptions('sgd').filter(c => c.code === 'sgd')).toHaveLength(1);
  });
  it('gives a new array each time and leaves the list alone', () => {
    const first = currencyOptions('DKK');
    expect(first).not.toBe(CURRENCY_LIST);
    expect(currencyOptions('SGD')).not.toBe(CURRENCY_LIST);
    first.push({ code: 'XXX' });
    expect(CURRENCY_LIST).toHaveLength(27);
    expect(currencyOptions('DKK')).toHaveLength(28);
  });
});
