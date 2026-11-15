import { describe, it, expect } from 'vitest';
import { tripDays, dateSpan, popupCopy, progressText } from './generation-popup.js';
import { estimateGenerationMinutes } from '../lib/trip-extras.js';

const sapporo = { id: 't1', title: 'Sapporo', start_date: '2027-01-13', end_date: '2027-01-25' };

describe('generation popup copy', () => {
  it('counts trip days from fixed dates, else the wizard duration', () => {
    expect(tripDays(sapporo)).toBe(13);
    expect(tripDays({ wizard_state: { dates: { duration: 5 } } })).toBe(5);
    expect(tripDays({})).toBe(7);
  });

  it('writes the date span without repeating the month', () => {
    expect(dateSpan(sapporo)).toBe('13 to 25 Jan');
    expect(dateSpan({ start_date: '2027-01-30', end_date: '2027-02-03' })).toBe('30 Jan to 3 Feb');
    expect(dateSpan({})).toBe('');
  });

  it('congratulates, sets the time expectation and says closing is fine', () => {
    const c = popupCopy('generating', { title: 'Sapporo', days: 13, span: '13 to 25 Jan', minutes: 5 });
    expect(c.heading).toBe('Sapporo, here you come');
    expect(c.lede).toBe('Your trip request is in. Trippy is planning all 13 days, 13 to 25 Jan.');
    expect(c.eta).toBe('This usually takes about 5 minutes. You can close this, planning carries on.');
    expect(popupCopy('done', { title: 'Sapporo', days: 13 }).heading).toBe('Your Sapporo trip is ready');
  });

  it('reports progress in days', () => {
    expect(progressText('generating', 0, 13)).toBe('Planning day 1');
    expect(progressText('generating', 8, 13)).toBe('8 of 13 days planned');
    expect(progressText('generating', 16, 13)).toBe('13 of 13 days planned');
    expect(progressText('done', 12, 13)).toBe('All 13 days planned');
  });

  it('has no em dash, en dash, middle dot or bullet in its copy', () => {
    const ctx = { title: 'Tokyo, Osaka & Kyoto', days: 9, span: '1 to 9 Mar', minutes: 3 };
    const all = ['generating', 'done', 'failed'].flatMap(s => Object.values(popupCopy(s, ctx)));
    for (const text of all) expect(text).not.toMatch(/[—–·•]/);
  });
});

describe('estimateGenerationMinutes', () => {
  it('matches measured runs and never promises under 2 minutes', () => {
    expect(estimateGenerationMinutes(13)).toBe(5); // measured 4m47s
    expect(estimateGenerationMinutes(3)).toBe(2);
    expect(estimateGenerationMinutes(7)).toBe(3);
    expect(estimateGenerationMinutes(undefined)).toBe(3);
  });
});
