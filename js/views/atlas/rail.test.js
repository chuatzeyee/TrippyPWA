// The time rail: month marks for what is ahead, month groups for what is behind. Pure.
import { describe, it, expect } from 'vitest';
import { DASHBOARD_FIXTURES } from '../fixtures/models.js';
import { monthNames, railGroups } from './rail.js';

const plan = (id, monthKey, { end = null, flags = ['pt'] } = {}) => ({ id, monthKey, flags, dates: { start: monthKey ? `${monthKey}-02` : null, end } });

describe('railGroups', () => {
  it('marks each month of the upcoming plans once, in the order given', () => {
    const { upcoming } = railGroups(DASHBOARD_FIXTURES.ready.sections);
    expect(upcoming.map((group) => [group.key, group.label, group.trips.map((card) => card.id)])).toEqual([
      ['2027-03', 'Mar 2027', ['s-marrakech']],
      ['2027-05', 'May 2027', ['s-vancouver']],
      ['2027-09', 'Sep 2027', ['s-buenos-aires']],
    ]);
  });
  it('keeps plans of one month under one mark', () => {
    const { upcoming } = railGroups({ upcoming: [plan('a', '2027-03'), plan('b', '2027-03'), plan('c', '2027-04')] });
    expect(upcoming.map((group) => group.trips.length)).toEqual([2, 1]);
  });
  it('puts plans without dates last, under their own mark', () => {
    const { upcoming } = railGroups(DASHBOARD_FIXTURES.noDates.sections);
    const last = upcoming[upcoming.length - 1];
    expect([last.key, last.label, last.trips.map((card) => card.id)]).toEqual(['undated', 'No dates yet', ['s-florence']]);
  });
  it('groups the past plans by month with brief labels and the flags of the month', () => {
    const { past } = railGroups({ past: [plan('a', '2026-10', { flags: ['fi'] }), plan('b', '2026-10', { flags: ['sg', 'fi'] }), plan('c', '2026-06', { flags: [] })] });
    expect(past).toEqual([
      { key: '2026-10', label: 'Oct 2026', trips: [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })], flags: ['fi', 'sg'] },
      { key: '2026-06', label: 'Jun 2026', trips: [expect.objectContaining({ id: 'c' })], flags: [] },
    ]);
  });
  it('matches the month groups of the model', () => {
    for (const model of Object.values(DASHBOARD_FIXTURES)) {
      const { past } = railGroups(model.sections);
      expect(past.map((group) => [group.key, group.trips.map((card) => card.id)])).toEqual(model.pastByMonth.map((group) => [group.key, group.trips.map((card) => card.id)]));
    }
  });
  it('hands the plans that are still being planned through', () => {
    expect(railGroups(DASHBOARD_FIXTURES.generating.sections).planning.map((card) => card.id)).toEqual(['s-dublin']);
    expect(railGroups(DASHBOARD_FIXTURES.ready.sections).planning).toEqual([]);
  });
  it('knows the last day anything is planned for: the upcoming plans, else the live ones', () => {
    expect(railGroups(DASHBOARD_FIXTURES.ready.sections).lastAhead).toBe('2027-09-15');
    expect(railGroups(DASHBOARD_FIXTURES.nothingUpcoming.sections).lastAhead).toBe('2027-03-13');
    expect(railGroups({ upcoming: [plan('a', '2027-03')] }).lastAhead).toBe('2027-03-02');
    expect(railGroups({}).lastAhead).toBeNull();
  });
  it('reads missing lists as empty and leaves its input alone', () => {
    expect(railGroups(null)).toEqual({ planning: [], upcoming: [], past: [], lastAhead: null });
    const { sections } = DASHBOARD_FIXTURES.ready;
    const before = JSON.stringify(sections);
    railGroups(sections);
    expect(JSON.stringify(sections)).toBe(before);
  });
});

describe('monthNames', () => {
  const titled = (...titles) => titles.map((title, i) => ({ id: `p${i}`, title }));
  it('names one plan, or two, in full', () => {
    expect(monthNames(titled('Singapore'))).toBe('Singapore');
    expect(monthNames(titled('Helsinki & Oulu', 'Singapore'))).toBe('Helsinki & Oulu and Singapore');
  });
  it('names the first two plans of a longer month and counts the rest', () => {
    expect(monthNames(titled('Tokyo', 'Kyoto', 'Osaka'))).toBe('Tokyo, Kyoto and 1 more');
    expect(monthNames(titled('Tokyo', 'Kyoto', 'Osaka', 'Nara', 'Kobe'))).toBe('Tokyo, Kyoto and 3 more');
  });
  it('leaves out a plan without a title and never cuts a title short', () => {
    expect(monthNames([{ id: 'a', title: '  ' }, { id: 'b' }, { id: 'c', title: 'A long weekend in Geneva, Zurich & Basel' }])).toBe('A long weekend in Geneva, Zurich & Basel');
    expect(monthNames([])).toBe('');
    expect(monthNames(null)).toBe('');
  });
});
