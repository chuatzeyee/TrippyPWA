import { describe, it, expect } from 'vitest';
import { safeUrl, deadlineInfo, stayInfo, sortChecklistItems, isBookedLeg } from './trip-extras.js';

describe('safeUrl', () => {
  it('keeps http(s) URLs', () => {
    expect(safeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeUrl('http://example.com')).toBe('http://example.com/');
  });
  it('rejects non-http schemes', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('data:text/html,hi')).toBe('');
    expect(safeUrl('ftp://x.com')).toBe('');
  });
  it('percent-encodes quotes so the URL cannot break out of an attribute', () => {
    expect(safeUrl('https://x.com/"onmouseover="a')).not.toContain('"');
  });
  it('returns empty for junk', () => {
    expect(safeUrl('')).toBe('');
    expect(safeUrl(null)).toBe('');
    expect(safeUrl('not a url')).toBe('');
  });
});

describe('deadlineInfo', () => {
  const today = new Date(2026, 10, 14); // 14 Nov 2026, local

  it('returns null for missing or invalid dates', () => {
    expect(deadlineInfo(undefined, today)).toBeNull();
    expect(deadlineInfo('2026-13-40', today)).toBeNull();
    expect(deadlineInfo('soon', today)).toBeNull();
  });
  it('flags overdue deadlines', () => {
    expect(deadlineInfo('2026-11-10', today)).toMatchObject({ state: 'overdue', daysLeft: -4 });
  });
  it('flags deadlines within 14 days as soon (today counts)', () => {
    expect(deadlineInfo('2026-11-14', today)).toMatchObject({ state: 'soon', daysLeft: 0 });
    expect(deadlineInfo('2026-11-28', today)).toMatchObject({ state: 'soon', daysLeft: 14 });
  });
  it('marks later deadlines and labels them', () => {
    const d = deadlineInfo('2026-12-01', today);
    expect(d).toMatchObject({ state: 'later', daysLeft: 17 });
    expect(d.label).toBe('Book by 1 Dec');
  });
  it('includes the year when it differs from this year', () => {
    expect(deadlineInfo('2027-01-08', today).label).toBe('Book by 8 Jan 2027');
  });
});

describe('stayInfo', () => {
  it('computes nights and a label', () => {
    expect(stayInfo('2027-01-13', '2027-01-17')).toEqual({ nights: 4, label: '13 Jan → 17 Jan · 4 nights' });
    expect(stayInfo('2027-01-17', '2027-01-18').label).toBe('17 Jan → 18 Jan · 1 night');
  });
  it('returns null when dates are missing, invalid or reversed', () => {
    expect(stayInfo(null, '2027-01-17')).toBeNull();
    expect(stayInfo('2027-01-17', '2027-01-17')).toBeNull();
    expect(stayInfo('2027-01-18', '2027-01-17')).toBeNull();
  });
});

describe('sortChecklistItems', () => {
  it('orders by deadline, undated items last, stable otherwise, without mutating', () => {
    const items = [
      { label: 'a' },
      { label: 'b', by: '2026-12-22' },
      { label: 'c', by: '2026-12-01' },
      { label: 'd' },
    ];
    const sorted = sortChecklistItems(items);
    expect(sorted.map(i => i.label)).toEqual(['c', 'b', 'a', 'd']);
    expect(items.map(i => i.label)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('isBookedLeg', () => {
  it('is true when booked or a booking reference exists', () => {
    expect(isBookedLeg({ booked: true })).toBe(true);
    expect(isBookedLeg({ bookingRef: 'E68JGI' })).toBe(true);
    expect(isBookedLeg({ airline: 'Scoot' })).toBe(false);
    expect(isBookedLeg(null)).toBe(false);
  });
});
