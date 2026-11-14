import { describe, it, expect } from 'vitest';
import { safeUrl, deadlineInfo, stayInfo, sortChecklistItems, isBookedLeg, photoCreditText } from './trip-extras.js';
import { formatDateRange, setLocaleFromFlag } from './locale.js';

const FORBIDDEN_GLYPHS = /[\u2014\u2013\u00B7\u2022\u2192]/;

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
  it('is safe inside a CSS url(\'...\') value', () => {
    const breakout = safeUrl("https://e.com/a');position:fixed;inset:0;background:url(https://evil.example/x.png");
    expect(breakout).toBe('https://e.com/a%27%29;position:fixed;inset:0;background:url%28https://evil.example/x.png');
    for (const raw of [
      "https://e.com/it's (1).jpg",
      'https://e.com/q?a=1\\&b=(2)',
      'https://e.com/p#frag\\x"y',
      'https://e.com/a b\tc',
    ]) {
      expect(safeUrl(raw), raw).toMatch(/^https:\/\/e\.com\//);
      expect(safeUrl(raw), raw).not.toMatch(/['"()\\\s]/);
    }
  });
  it('keeps already-safe URLs unchanged', () => {
    expect(safeUrl('https://upload.wikimedia.org/a/b/Foo_bar.jpg?w=960')).toBe('https://upload.wikimedia.org/a/b/Foo_bar.jpg?w=960');
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
    expect(stayInfo('2027-01-13', '2027-01-17')).toEqual({ nights: 4, label: '13 Jan to 17 Jan (4 nights)' });
    expect(stayInfo('2027-01-17', '2027-01-18').label).toBe('17 Jan to 18 Jan (1 night)');
  });
  it('uses no dashes, middle dots or arrows in the label', () => {
    expect(stayInfo('2027-01-13', '2027-01-17').label).not.toMatch(FORBIDDEN_GLYPHS);
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

describe('photoCreditText', () => {
  it('formats creator, licence and source', () => {
    expect(photoCreditText({ creator: 'Higa4', license: 'CC0', via: 'Wikimedia Commons' })).toBe('Photo: Higa4, CC0, Wikimedia Commons');
    expect(photoCreditText({ creator: 'A', license: 'B', via: 'C' })).not.toMatch(FORBIDDEN_GLYPHS);
    expect(photoCreditText({ via: 'morino-uta.com' })).toBe('Photo: morino-uta.com');
    expect(photoCreditText(null)).toBe('');
  });
});

// locale.js has no test file of its own; formatDateRange feeds the trip hero and
// cards, so its copy-rule check lives here with the other display helpers.
describe('formatDateRange', () => {
  setLocaleFromFlag('gb');

  it('joins ranges with "to" instead of an en dash', () => {
    expect(formatDateRange('2026-01-03', '2026-01-10')).toBe('3 to 10 Jan 2026');
    expect(formatDateRange('2026-01-28', '2026-02-03')).toBe('28 Jan to 3 Feb 2026');
    expect(formatDateRange('2025-12-28', '2026-01-03')).toBe('28 Dec 2025 to 3 Jan 2026');
  });
  it('formats a single date and handles a missing start', () => {
    expect(formatDateRange('2026-01-03')).toBe('3 Jan 2026');
    expect(formatDateRange('')).toBe('');
  });
  it('never emits dashes, middle dots or arrows', () => {
    for (const [a, b] of [['2026-01-03', '2026-01-10'], ['2026-01-28', '2026-02-03'], ['2025-12-28', '2026-01-03']]) {
      expect(formatDateRange(a, b)).not.toMatch(FORBIDDEN_GLYPHS);
    }
  });
});
