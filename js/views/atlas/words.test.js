// The small wordings the Atlas view writes itself.
import { describe, it, expect } from 'vitest';
import { cost, money } from '../fixtures/parts.js';
import { plansText, daysText, shortDate, fullDate, lengthText, toGoText, daysLeftText, costLine, costShort, matchText, weatherLine, sharedLine, numberText } from './words.js';

describe('counts', () => {
  it('says plan and plans, day and days', () => {
    expect([plansText(0), plansText(1), plansText(3)]).toEqual(['0 plans', '1 plan', '3 plans']);
    expect([daysText(1), daysText(12)]).toEqual(['1 day', '12 days']);
    expect(plansText(undefined)).toBe('0 plans');
  });
  it('groups thousands', () => {
    expect([numberText(950), numberText(9600), numberText(1234567)]).toEqual(['950', '9,600', '1,234,567']);
  });
});

describe('dates', () => {
  it('writes a day and a brief month, with the year when asked', () => {
    expect(shortDate('2027-03-19')).toBe('19 Mar');
    expect(fullDate('2026-05-25')).toBe('25 May 2026');
    expect([shortDate(''), shortDate(null), fullDate('soon')]).toEqual(['', '', '']);
  });
  it('writes the length of a plan', () => {
    expect(lengthText({ dayCount: 7, nights: 6 })).toBe('7 days, 6 nights');
    expect(lengthText({ dayCount: 2, nights: 1 })).toBe('2 days, 1 night');
    expect(lengthText({ dayCount: 1, nights: 0 })).toBe('1 day');
    expect(lengthText(null)).toBe('');
  });
});

describe('countdowns', () => {
  it('splits the number from its words, so the number can be set large', () => {
    expect(toGoText(12)).toEqual({ count: '12', words: 'days to go' });
    expect(toGoText(1)).toEqual({ count: '1', words: 'day to go' });
    expect(toGoText(null)).toBeNull();
  });
  it('says how much of a live plan is left', () => {
    expect([daysLeftText(3), daysLeftText(1), daysLeftText(0)]).toEqual(['3 days left', '1 day left', 'Last day']);
  });
});

describe('costLine', () => {
  it('leads with the home figure and always says per person', () => {
    expect(costLine(cost({ local: money(4200, 'MAD'), home: money(390, 'EUR') }))).toBe('about €390 per person');
    expect(costLine(cost({ local: money(640, 'EUR') }))).toBe('€640 per person');
    expect(costLine(cost())).toBe('');
    expect(costLine(null)).toBe('');
  });
  it('costShort is the leading figure alone, for the rail pill', () => {
    expect(costShort(cost({ local: money(4200, 'MAD'), home: money(390, 'EUR') }))).toBe('€390');
    expect(costShort(cost({ local: money(640, 'EUR') }))).toBe('€640');
    expect(costShort(null)).toBe('');
  });
  it('matchText says how many plans a search found', () => {
    expect([matchText(1), matchText(3)]).toEqual(['1 plan matches', '3 plans match']);
  });
});

describe('weatherLine', () => {
  it('always says the weather is typical', () => {
    expect(weatherLine({ range: '10 to 24°C', season: 'typical for late March', condition: 'Clear' })).toBe('10 to 24°C, typical for late March');
    expect(weatherLine({ range: '10 to 24°C', season: '', condition: 'Clear' })).toBe('10 to 24°C typical, clear');
    expect(weatherLine({ range: '', season: '', condition: '' })).toBe('');
    expect(weatherLine(null)).toBe('');
  });
});

describe('sharedLine', () => {
  it('names what the user can do, never who shared it', () => {
    expect(sharedLine({ shared: true, role: 'editor' })).toBe('Shared with you. You can edit it.');
    expect(sharedLine({ shared: true, role: 'viewer' })).toBe('Shared with you. You can view it.');
    expect(sharedLine({ shared: false, role: null })).toBe('');
  });
});

describe('savedText', () => {
  it('names the day and the time a saved list was written', async () => {
    const { savedText } = await import('./words.js');
    expect(savedText('2027-03-09T18:42:00+00:00')).toMatch(/^on (Mon|Tue|Wed) \d{1,2} Mar at \d{1,2}:\d{2} [AP]M$/);
    expect([savedText(null), savedText('soon')]).toEqual(['', '']);
  });
});
