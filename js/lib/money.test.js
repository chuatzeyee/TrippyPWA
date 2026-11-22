import { describe, it, expect, beforeAll } from 'vitest';
import { COST_BASIS, COST_BASIS_TEXT, costEstimate, moneyText, costText, costFigures } from './money.js';
import { sumCosts } from './cost-sum.js';
import { convert, canConvert } from '../data/currencies.js';
import { setLocaleFromFlag } from './locale.js';
import { conforms, CostEstimate } from '../views/fixtures/shape.js';

// Thousands are grouped by the locale: pinned here so the expected text does not depend on the machine.
beforeAll(() => setLocaleFromFlag('sg'));

const SGD = { code: 'SGD', symbol: 'S$' };
const NO_RATE = 'XTS';   // the ISO code reserved for testing: it never gets a rate
const hk = (over = {}) => costEstimate({ total: 6347, excluded: 0, tripCode: 'HKD', tripSymbol: 'HK$', home: SGD, homeFirst: true, ...over });

describe('COST_BASIS', () => {
  it('is per person, stated once', () => {
    expect(COST_BASIS).toBe('perPerson');
    expect(COST_BASIS_TEXT).toBe('per person, activities only');
    expect(hk().basis).toBe('perPerson');
  });
});

describe('moneyText', () => {
  it('puts a clear symbol straight before the number', () => {
    expect(moneyText(1090, 'SGD', 'S$')).toBe('S$1,090');
    expect(moneyText(390, 'EUR', '€')).toBe('€390');
    expect(moneyText(96400, 'JPY', '¥')).toBe('¥96,400');
    expect(moneyText(500, 'MYR', 'RM')).toBe('RM500');
  });
  it('prints the ISO code instead of a symbol that is ambiguous: $, kr or none', () => {
    expect(moneyText(6347, 'HKD', '$')).toBe('HKD 6,347');
    expect(moneyText(21846, 'NOK', 'kr')).toBe('NOK 21,846');
    expect(moneyText(3900, 'DKK', 'kr')).toBe('DKK 3,900');
    expect(moneyText(412000, 'ARS', '')).toBe('ARS 412,000');
    expect(moneyText(1320, 'CAD', null)).toBe('CAD 1,320');
    expect(moneyText(1320, 'CAD')).toBe('CAD 1,320');
    expect(moneyText(1320, 'cad', ' $ ')).toBe('CAD 1,320');
    expect(moneyText(21846, 'NOK', 'Kr')).toBe('NOK 21,846');
  });
  it('prints the code once when the symbol is the code itself', () => {
    expect(moneyText(1108, 'CHF', 'CHF')).toBe('CHF 1,108');
  });
  it('prints the code for a symbol written right to left, which would reorder around the digits', () => {
    expect(moneyText(1090, 'AED', 'د.إ')).toBe('AED 1,090');
    expect(moneyText(4200, 'MAD', 'د.م.')).toBe('MAD 4,200');
  });
  it('groups thousands in every locale, also where four digits are not grouped by default', () => {
    try {
      for (const flag of ['pt', 'es', 'pl']) {
        setLocaleFromFlag(flag);
        expect([flag, moneyText(6150, 'EUR', '€')]).toEqual([flag, expect.stringMatching(/^€6[^\d]150$/)]);
        expect([flag, moneyText(4200, 'MAD', '')]).toEqual([flag, expect.stringMatching(/^MAD 4[^\d]200$/)]);
        expect([flag, moneyText(47800, 'SGD', 'S$')]).toEqual([flag, expect.stringMatching(/^S\$47[^\d]800$/)]);
        expect(moneyText(390, 'EUR', '€')).toBe('€390');
      }
    } finally { setLocaleFromFlag('sg'); }
  });
  it('shows whole units', () => {
    expect(moneyText(1089.6, 'SGD', 'S$')).toBe('S$1,090');
    expect(moneyText(0, 'SGD', 'S$')).toBe('S$0');
    expect(moneyText('250', 'SGD', 'S$')).toBe('S$250');
  });
  it('falls back to the symbol when there is no code, and to the bare number when there is neither', () => {
    expect(moneyText(1090, '', '$')).toBe('$1,090');
    expect(moneyText(1090, null, null)).toBe('1,090');
  });
  it('is empty for an amount that is not a number', () => {
    expect(moneyText(NaN, 'SGD', 'S$')).toBe('');
    expect(moneyText(undefined, 'SGD', 'S$')).toBe('');
    expect(moneyText(null, 'SGD', 'S$')).toBe('');
    expect(moneyText('lots', 'SGD', 'S$')).toBe('');
    expect(moneyText(Infinity, 'SGD', 'S$')).toBe('');
  });
});

describe('costEstimate', () => {
  it('local is the activity sum in the trip currency', () => {
    expect(hk().local).toEqual({ amount: 6347, code: 'HKD', text: 'HK$6,347' });
    expect(hk({ tripSymbol: '$' }).local).toEqual({ amount: 6347, code: 'HKD', text: 'HKD 6,347' });
  });
  it('local is null when the sum is 0', () => {
    const cost = hk({ total: 0 });
    expect(cost.local).toBeNull();
    expect(cost.home).toBeNull();
    expect(cost.homeFirst).toBe(false);
    expect(hk({ total: 0.3 }).local).toBeNull();
    expect(hk({ total: undefined }).local).toBeNull();
  });
  it('home is the local figure in the home currency', () => {
    const amount = convert(6347, 'HKD', 'SGD');
    expect(amount).toBeGreaterThan(900);
    expect(hk().home).toEqual({ amount, code: 'SGD', text: `S$${amount.toLocaleString('en-SG')}` });
  });
  it('mixed currencies: sums through sumCosts, converting what has a rate', () => {
    const activities = [
      { cost_amount: 100 }, { cost_amount: 50, cost_currency: 'USD' }, { cost_amount: 30, cost_currency: 'hkd' }, { cost_amount: 0, cost_currency: 'EUR' },
    ];
    const cost = costEstimate({ activities, tripCode: 'HKD', tripSymbol: 'HK$', home: SGD, homeFirst: true });
    const total = 100 + convert(50, 'USD', 'HKD') + 30;
    expect(cost.local.amount).toBe(total);
    expect(cost.excluded).toBe(0);
    expect(cost.home.amount).toBe(convert(total, 'HKD', 'SGD'));
  });
  it('the excluded count: an activity priced in a currency with no rate is left out and counted', () => {
    const activities = [{ cost_amount: 100 }, { cost_amount: 70, cost_currency: NO_RATE }, { cost_amount: 9, cost_currency: NO_RATE }];
    expect(canConvert(NO_RATE)).toBe(false);
    const cost = costEstimate({ activities, tripCode: 'HKD', tripSymbol: 'HK$', home: SGD });
    expect(cost.local.amount).toBe(100);
    expect(cost.excluded).toBe(2);
  });
  it('is the same whether it is given the activities or what sumCosts made of them: one summing rule', () => {
    const activities = [{ cost_amount: 120.4 }, { cost_amount: 80, cost_currency: 'JPY' }, { cost_amount: 5, cost_currency: NO_RATE }, { cost_amount: null }, {}];
    const rest = { tripCode: 'SGD', tripSymbol: 'S$', home: { code: 'USD', symbol: '$' }, homeFirst: true, budgetDaily: 200, dayCount: 3 };
    expect(costEstimate({ activities, ...rest })).toEqual(costEstimate({ ...sumCosts(activities, 'SGD'), ...rest }));
    expect(costEstimate({ activities, ...rest }).local.amount).toBe(Math.round(sumCosts(activities, 'SGD').total));
  });
  it('no home currency: only the local figure', () => {
    for (const home of [null, undefined, {}, { code: '' }, { code: null, symbol: 'S$' }]) {
      const cost = hk({ home });
      expect(cost.local.amount).toBe(6347);
      expect(cost.home).toBeNull();
      expect(cost.homeFirst).toBe(false);
    }
  });
  it('same currency: no home line, and home-first has nothing to lead with', () => {
    const cost = costEstimate({ total: 640, tripCode: 'SGD', tripSymbol: 'S$', home: SGD, homeFirst: true, budgetDaily: 150, dayCount: 4 });
    expect(cost.local.text).toBe('S$640');
    expect(cost.home).toBeNull();
    expect(cost.budgetHome).toBeNull();
    expect(cost.homeFirst).toBe(false);
    expect(costEstimate({ total: 640, tripCode: 'sgd', tripSymbol: 'S$', home: { code: 'SGD ', symbol: 'S$' }, homeFirst: true }).home).toBeNull();
  });
  it('no rate for the trip currency or for the home currency: no home line', () => {
    expect(costEstimate({ total: 500, tripCode: NO_RATE, tripSymbol: 'X', home: SGD, homeFirst: true })).toMatchObject({
      local: { amount: 500, code: NO_RATE, text: 'X500' }, home: null, homeFirst: false,
    });
    expect(hk({ home: { code: NO_RATE, symbol: 'X' } })).toMatchObject({ home: null, homeFirst: false });
  });
  it('home-first is on only with the pref and a home figure', () => {
    expect(hk({ homeFirst: true }).homeFirst).toBe(true);
    expect(hk({ homeFirst: false }).homeFirst).toBe(false);
    expect(hk({ homeFirst: undefined }).homeFirst).toBe(false);
    expect(hk({ homeFirst: false }).home).not.toBeNull();
  });
  it('the budget is per person: 1,790 a day for 10 days gives 17,900, whatever the traveller count', () => {
    const one = hk({ budgetDaily: 1790, dayCount: 10, travelers: 1 });
    const four = hk({ budgetDaily: 1790, dayCount: 10, travelers: 4, travellers: 4 });
    expect(one.budget).toEqual({ amount: 17900, code: 'HKD', text: 'HK$17,900' });
    expect(four.budget).toEqual(one.budget);
    expect(one.budgetHome).toEqual({ amount: convert(17900, 'HKD', 'SGD'), code: 'SGD', text: `S$${convert(17900, 'HKD', 'SGD').toLocaleString('en-SG')}` });
    expect(four.budgetHome).toEqual(one.budgetHome);
  });
  it('no budget without a daily amount and a day count', () => {
    expect(hk({ budgetDaily: 0, dayCount: 10 }).budget).toBeNull();
    expect(hk({ budgetDaily: 1790, dayCount: 0 }).budget).toBeNull();
    expect(hk({ budgetDaily: null, dayCount: null }).budget).toBeNull();
    expect(hk().budget).toBeNull();
    expect(hk().budgetHome).toBeNull();
  });
  it('a budget stands on its own when no activity has a cost', () => {
    const cost = hk({ total: 0, budgetDaily: 1790, dayCount: 10 });
    expect(cost.local).toBeNull();
    expect(cost.budget.amount).toBe(17900);
    expect(cost.budgetHome.code).toBe('SGD');
  });
  it('with nothing given it is the empty estimate', () => {
    expect(costEstimate()).toEqual({ basis: 'perPerson', local: null, home: null, homeFirst: false, excluded: 0, budget: null, budgetHome: null });
  });
  it('has exactly the fields of the contract', () => {
    for (const cost of [costEstimate(), hk(), hk({ home: null }), hk({ total: 0, budgetDaily: 1790, dayCount: 10 })]) expect(conforms(cost, CostEstimate)).toEqual([]);
  });
  it('does not change what it is given', () => {
    const activities = Object.freeze([Object.freeze({ cost_amount: 10 }), Object.freeze({ cost_amount: 5, cost_currency: 'USD' })]);
    const input = Object.freeze({ activities, tripCode: 'HKD', tripSymbol: 'HK$', home: Object.freeze({ ...SGD }), homeFirst: true });
    expect(() => costEstimate(input)).not.toThrow();
  });
});

describe('two currencies that share a symbol', () => {
  const CNY = { code: 'CNY', symbol: '¥' };
  it('prints both figures of a cost with their ISO codes, so yen and yuan can be told apart', () => {
    const cost = costEstimate({ total: 100000, tripCode: 'JPY', tripSymbol: '¥', home: CNY, homeFirst: true, budgetDaily: 20000, dayCount: 5 });
    const yuan = Math.round(convert(100000, 'JPY', 'CNY'));
    expect(cost.local).toEqual({ amount: 100000, code: 'JPY', text: 'JPY 100,000' });
    expect(cost.home).toEqual({ amount: yuan, code: 'CNY', text: `CNY ${yuan.toLocaleString('en-SG')}` });
    expect(cost.budget.text).toBe('JPY 100,000');
    expect(cost.budgetHome.text).toMatch(/^CNY /);
    expect(costText(cost)).toBe(`~CNY ${yuan.toLocaleString('en-SG')} per person, activities only. JPY 100,000`);
    expect(conforms(cost, CostEstimate)).toEqual([]);
  });
  it('the other way round too, and whichever figure leads', () => {
    const cost = costEstimate({ total: 4645, tripCode: 'CNY', tripSymbol: '¥', home: { code: 'JPY', symbol: '¥' }, homeFirst: false });
    expect(cost.local.text).toBe('CNY 4,645');
    expect(cost.home.text).toMatch(/^JPY /);
    expect(costText(cost)).not.toContain('¥');
  });
  it('keeps the symbol where only one currency is printed, or where the two symbols differ', () => {
    expect(costEstimate({ total: 100000, tripCode: 'JPY', tripSymbol: '¥', home: { code: 'JPY', symbol: '¥' }, homeFirst: true }).local.text).toBe('¥100,000');
    expect(costEstimate({ total: 100000, tripCode: 'JPY', tripSymbol: '¥', home: null }).local.text).toBe('¥100,000');
    expect(costEstimate({ total: 100000, tripCode: 'JPY', tripSymbol: '¥', home: { code: NO_RATE, symbol: '¥' }, homeFirst: true })).toMatchObject({ local: { text: '¥100,000' }, home: null });
    const mixed = costEstimate({ total: 100000, tripCode: 'JPY', tripSymbol: '¥', home: SGD, homeFirst: true });
    expect(mixed.local.text).toBe('¥100,000');
    expect(mixed.home.text).toMatch(/^S\$/);
  });
});

describe('costText and costFigures', () => {
  const homeAmount = () => `S$${convert(6347, 'HKD', 'SGD').toLocaleString('en-SG')}`;

  it('home first: the converted figure leads with "about", the local one follows', () => {
    const cost = hk({ tripSymbol: '$' });
    expect(costFigures(cost)).toEqual({ lead: `~${homeAmount()}`, other: 'HKD 6,347', budget: '' });
    expect(costText(cost)).toBe(`~${homeAmount()} per person, activities only. HKD 6,347`);
  });
  it('home first off: the local figure leads and the converted one follows, still with "about"', () => {
    const cost = hk({ tripSymbol: '$', homeFirst: false });
    expect(costFigures(cost)).toEqual({ lead: 'HKD 6,347', other: `~${homeAmount()}`, budget: '' });
    expect(costText(cost)).toBe(`HKD 6,347 per person, activities only. ~${homeAmount()}`);
  });
  it('no home figure: the local figure alone, with no "about" and no apology', () => {
    const cost = hk({ home: null });
    expect(costFigures(cost)).toEqual({ lead: 'HK$6,347', other: '', budget: '' });
    expect(costText(cost)).toBe('HK$6,347 per person, activities only');
  });
  it('every sentence says "per person"; every converted figure says "about"', () => {
    for (const cost of [hk(), hk({ homeFirst: false }), hk({ home: null })]) expect(costText(cost)).toContain('per person, activities only');
    expect(costText(hk({ home: null }))).not.toMatch(/about/i);
    expect(costText(hk())).toMatch(/^~S\$/);
  });
  it('"about" marks a converted figure and nothing else: a plan priced in the home currency has none', () => {
    for (const homeFirst of [true, false]) {
      const atHome = costEstimate({ total: 4628, excluded: 0, tripCode: 'SGD', tripSymbol: 'S$', home: { code: 'sgd', symbol: 'S$' }, homeFirst, budgetDaily: 500, dayCount: 10 });
      expect(costFigures(atHome)).toEqual({ lead: 'S$4,628', other: '', budget: 'S$5,000' });
      expect(costText(atHome)).toBe('S$4,628 per person, activities only');
    }
    // Another currency with a rate: the home figure is converted and says so, wherever it stands.
    expect(costFigures(hk()).lead).toMatch(/^~S\$/);
    expect(costFigures(hk({ homeFirst: false }))).toMatchObject({ lead: 'HK$6,347', other: expect.stringMatching(/^~S\$/) });
    // No rate, or no home currency: nothing was converted, so nothing says "about".
    expect(costText(hk({ tripCode: NO_RATE, tripSymbol: '' }))).not.toContain('about');
    expect(costText(hk({ home: null }))).not.toContain('about');
  });
  it('the budget is given in the currency that leads', () => {
    const budgetHome = `S$${convert(17900, 'HKD', 'SGD').toLocaleString('en-SG')}`;
    expect(costFigures(hk({ budgetDaily: 1790, dayCount: 10 })).budget).toBe(`~${budgetHome}`);
    expect(costFigures(hk({ budgetDaily: 1790, dayCount: 10, homeFirst: false })).budget).toBe('HK$17,900');
    expect(costFigures(hk({ budgetDaily: 1790, dayCount: 10, home: null })).budget).toBe('HK$17,900');
  });
  it('a budget with no activity cost is still given, in the trip currency', () => {
    expect(costFigures(hk({ total: 0, budgetDaily: 1790, dayCount: 10 }))).toEqual({ lead: '', other: '', budget: 'HK$17,900' });
    expect(costText(hk({ total: 0, budgetDaily: 1790, dayCount: 10 }))).toBe('');
  });
  it('is empty when there is no cost', () => {
    expect(costText(hk({ total: 0 }))).toBe('');
    expect(costFigures(hk({ total: 0 }))).toEqual({ lead: '', other: '', budget: '' });
    expect(costText(null)).toBe('');
    expect(costText(undefined)).toBe('');
    expect(costText({})).toBe('');
    expect(costFigures(null)).toEqual({ lead: '', other: '', budget: '' });
  });
  it('holds no dash, dot or bullet glyph', () => {
    const text = [costText(hk()), costText(hk({ homeFirst: false })), costFigures(hk({ budgetDaily: 9, dayCount: 9 })).budget].join(' ');
    expect(text).not.toMatch(/[\u2013\u2014\u00b7\u2022\u2026\u2192]/);
  });
});
