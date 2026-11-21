// The logbook of the Atlas page: calendar bars by month and the facts list. Pure.
import { describe, it, expect } from 'vitest';
import { DASHBOARD_FIXTURES } from '../fixtures/models.js';
import { monthRows, factRows, spanText } from './logbook.js';

const month = (key, days, phase = 'past') => ({ key, label: key, days, phase });

describe('monthRows', () => {
  it('keeps a year or less in one row, each bar scaled to a 31 day month', () => {
    const rows = monthRows([month('2026-05', 7), month('2026-06', 31), month('2026-07', 0), month('2026-11', 12, 'now'), month('2026-12', 22, 'future')]);
    expect(rows).toHaveLength(1);
    expect(rows[0].map((bar) => [bar.name, bar.days, bar.phase])).toEqual([['May', 7, 'past'], ['Jun', 31, 'past'], ['Jul', 0, 'past'], ['Nov', 12, 'now'], ['Dec', 22, 'future']]);
    expect(rows[0][1].height).toBe(56);
    expect(rows[0][2].height).toBe(1);
    expect(rows[0][0].height).toBeGreaterThanOrEqual(3);
  });
  it('breaks a longer span into rows of twelve months and marks where a year starts', () => {
    const keys = Array.from({ length: 29 }, (_, i) => `${2025 + Math.floor((4 + i) / 12)}-${String(((4 + i) % 12) + 1).padStart(2, '0')}`);
    const rows = monthRows(keys.map((key) => month(key, 3)));
    expect(rows.map((row) => row.length)).toEqual([12, 12, 5]);
    expect(rows[0][0]).toMatchObject({ key: '2025-05', name: 'May', year: '2025' });
    expect(rows[0][8]).toMatchObject({ key: '2026-01', name: 'Jan', year: '2026' });
    expect(rows[0][1].year).toBe('');
    expect(rows[1][0].year).toBe('2026');
  });
  it('prints the year wherever it changes, also when months are missing in between', () => {
    const [row] = monthRows([month('2025-05', 8), month('2025-08', 5), month('2026-02', 12), month('2026-06', 12), month('2027-03', 17)]);
    expect(row.map((bar) => bar.year)).toEqual(['2025', '', '2026', '', '2027']);
  });
  it('never draws a bar taller than the scale and reads anything else as no rows', () => {
    expect(monthRows([month('2026-05', 40)])[0][0].height).toBe(56);
    expect(monthRows(null)).toEqual([]);
    expect(monthRows([{ key: 'x', days: 2 }])).toEqual([]);
  });
});

describe('factRows', () => {
  const model = DASHBOARD_FIXTURES.ready;
  const rows = factRows(model.stats, model.pins);
  const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
  it('lists the four facts in order', () => {
    expect(rows.map((row) => row.label)).toEqual(['Furthest north', 'Furthest south', 'Furthest from home', 'Most planned']);
  });
  it('writes latitudes in degrees and distances in whole kilometres with "about"', () => {
    expect(byLabel['Furthest north'].value).toBe('Edinburgh');
    expect(byLabel['Furthest north'].note).toBe('55.95° N');
    expect(byLabel['Furthest south'].note).toMatch(/^\d+\.\d{2}° S$/);
    expect(byLabel['Furthest from home'].value).toMatch(/^[A-Z].+, about [\d,]+ km$/);
    expect(byLabel['Furthest from home'].note).toBe('A straight line from home');
  });
  it('counts plans for the country named most often', () => {
    expect(byLabel['Most planned'].value).toBe(model.stats.mostPlanned.country);
    expect(byLabel['Most planned'].note).toMatch(/^\d+ plans?$/);
  });
  it('says when a place is in a plan that is running now or coming up, never that anyone was there', () => {
    const pins = [{ kind: 'live', place: 'Edinburgh', at: [55.95, -3.19] }];
    expect(factRows(model.stats, pins)[0].value).toBe('Edinburgh, in a plan running now');
    expect(factRows(model.stats, [{ kind: 'up', place: 'Edinburgh', at: [55.95, -3.19] }])[0].value).toBe('Edinburgh, in a plan coming up');
  });
  it('leaves out what the statistics do not hold', () => {
    const empty = DASHBOARD_FIXTURES.empty;
    expect(factRows(empty.stats, empty.pins)).toEqual([]);
    expect(factRows(null, null)).toEqual([]);
  });
});

describe('spanText', () => {
  it('names the first and the last day of all plans', () => {
    expect(spanText({ firstDate: '2025-05-01', lastDate: '2027-09-15' })).toBe('from 1 May 2025 to 15 Sep 2027');
    expect(spanText({ firstDate: '2025-05-01', lastDate: null })).toBe('from 1 May 2025');
    expect(spanText({ firstDate: null, lastDate: null })).toBe('');
  });
});
