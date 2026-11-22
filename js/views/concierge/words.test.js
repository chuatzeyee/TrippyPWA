// The small wording helpers of the Concierge view. Written before words.js.
import { describe, it, expect } from 'vitest';
import {
  numberWord, countOf, wordList, capital, lowerFirst, longDate, titleStep, daysHeading, costLine, settledLine, spendShare,
} from './words.js';

describe('numberWord', () => {
  it('spells whole numbers up to twelve', () => {
    expect([0, 1, 2, 3, 10, 12].map((n) => numberWord(n))).toEqual(['no', 'one', 'two', 'three', 'ten', 'twelve']);
  });
  it('keeps digits above twelve and for anything that is not a whole number', () => {
    expect(numberWord(13)).toBe('13');
    expect(numberWord(100)).toBe('100');
    expect(numberWord(2.5)).toBe('2.5');
    expect(numberWord(null)).toBe('');
  });
});

describe('countOf', () => {
  it('picks the singular for one', () => {
    expect(countOf(1, 'day', 'days')).toBe('1 day');
    expect(countOf(12, 'day', 'days')).toBe('12 days');
    expect(countOf(0, 'plan', 'plans')).toBe('0 plans');
  });
});

describe('wordList', () => {
  it('joins with commas and one "and"', () => {
    expect(wordList([])).toBe('');
    expect(wordList(['food'])).toBe('food');
    expect(wordList(['food', 'history'])).toBe('food and history');
    expect(wordList(['food', 'history', 'markets'])).toBe('food, history and markets');
  });
  it('drops empty entries', () => {
    expect(wordList(['food', '', null, 'markets'])).toBe('food and markets');
  });
});

describe('capital and lowerFirst', () => {
  it('change the first letter only', () => {
    expect(capital('seven days')).toBe('Seven days');
    expect(lowerFirst('Not booked yet')).toBe('not booked yet');
    expect(lowerFirst('')).toBe('');
  });
  it('leave an acronym alone', () => {
    expect(lowerFirst('ETA needed')).toBe('ETA needed');
  });
});

describe('longDate', () => {
  it('spells out the short date and adds the year when the clock agrees', () => {
    expect(longDate({ iso: '2027-03-10T09:10:00+00:00', dateText: 'Wed 10 Mar' })).toBe('Wednesday 10 March 2027');
  });
  it('leaves the year out when the instant is written on another calendar day', () => {
    expect(longDate({ iso: '2027-03-09T23:10:00+00:00', dateText: 'Wed 10 Mar' })).toBe('Wednesday 10 March');
  });
  it('returns a text it cannot read as it came', () => {
    expect(longDate({ iso: '2027-03-10T09:10:00+00:00', dateText: 'Mittwoch, 10. März' })).toBe('Mittwoch, 10. März');
    expect(longDate(null)).toBe('');
  });
});

describe('titleStep', () => {
  it('has three steps by character count', () => {
    expect(titleStep('Hong Kong')).toBe('short');
    expect(titleStep('Porto weekend')).toBe('mid');
    expect(titleStep('Hokkaido in Winter')).toBe('mid');
    expect(titleStep('Vienna, Bratislava & Budapest')).toBe('long');
    expect(titleStep('')).toBe('short');
  });
  it('steps down for a word too long for one line at that size', () => {
    expect(titleStep('Reykjavik')).toBe('short');
    expect(titleStep('Copenhagen')).toBe('mid');
    expect(titleStep('Johannesburg')).toBe('mid');
    expect(titleStep('Thiruvananthapuram')).toBe('long');
    expect(titleStep('Kyoto in autumn')).toBe('mid');
  });
});

describe('daysHeading', () => {
  it('uses the day count in words up to twelve', () => {
    expect(daysHeading(7)).toBe('The seven days');
    expect(daysHeading(12)).toBe('The twelve days');
    expect(daysHeading(14)).toBe('The 14 days');
    expect(daysHeading(1)).toBe('The day');
    expect(daysHeading(0)).toBe('The days');
  });
});

const money = (amount, code, text) => ({ amount, code, text });
const cost = (over) => ({ basis: 'perPerson', local: null, home: null, homeFirst: false, excluded: 0, budget: null, budgetHome: null, ...over });

describe('costLine', () => {
  it('leads with the home figure, says about and per person, and keeps the local figure', () => {
    expect(costLine(cost({ local: money(4200, 'MAD', 'MAD 4,200'), home: money(390, 'EUR', '€390'), homeFirst: true }))).toBe('~€390 per person (MAD 4,200)');
  });
  it('has a short form with the leading figure only', () => {
    expect(costLine(cost({ local: money(4200, 'MAD', 'MAD 4,200'), home: money(390, 'EUR', '€390'), homeFirst: true }), { short: true })).toBe('~€390 per person');
  });
  it('prints a local figure alone without about', () => {
    expect(costLine(cost({ local: money(640, 'EUR', '€640') }))).toBe('€640 per person');
  });
  it('is empty without a cost', () => {
    expect(costLine(cost())).toBe('');
    expect(costLine(null)).toBe('');
  });
});

describe('spendShare', () => {
  it('compares the leading figure with its budget in the same currency', () => {
    const c = cost({ local: money(4200, 'MAD', 'MAD 4,200'), home: money(390, 'EUR', '€390'), homeFirst: true, budget: money(7000, 'MAD', 'MAD 7,000'), budgetHome: money(650, 'EUR', '€650') });
    expect(spendShare(c)).toEqual({ percent: 60, over: false });
  });
  it('falls back to the local pair, and caps the bar at 100', () => {
    expect(spendShare(cost({ local: money(640, 'EUR', '€640'), budget: money(1500, 'EUR', '€1,500') }))).toEqual({ percent: 43, over: false });
    expect(spendShare(cost({ local: money(900, 'EUR', '€900'), budget: money(600, 'EUR', '€600') }))).toEqual({ percent: 100, over: true });
  });
  it('is null without a budget or a cost', () => {
    expect(spendShare(cost({ local: money(640, 'EUR', '€640') }))).toBeNull();
    expect(spendShare(cost({ budget: money(600, 'EUR', '€600') }))).toBeNull();
    expect(spendShare(null)).toBeNull();
  });
});

describe('settledLine', () => {
  const item = (label, status) => ({ label, status, state: 'done' });
  it('names what is done, in lower case', () => {
    expect(settledLine([item('Entry requirements', 'Nothing to file')])).toBe('Settled: entry requirements (nothing to file).');
    expect(settledLine([item('Flights', 'Booked'), item('Stay', 'Booked')])).toBe('Settled: flights (booked) and stay (booked).');
  });
  it('is empty when nothing is settled', () => {
    expect(settledLine([])).toBe('');
    expect(settledLine(null)).toBe('');
  });
});
