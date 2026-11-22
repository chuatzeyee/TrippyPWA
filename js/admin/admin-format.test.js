import { describe, expect, it } from 'vitest';
import { dateRange, dayCount, displayName, flagCode, formatDate, formatDateTime, formatTime, homeLabel, humanKey, initials, logJson, metadataLines, num, plural, relativeTime, safeAvatar } from './admin-format.js';
import { BANNED } from './admin.test-kit.js';

const NOW = '2027-03-10T08:00:00Z';
const UTC = { timeZone: 'UTC' };

describe('dates and times', () => {
  it('writes a date as day, month, year and never moves a date with no time', () => {
    expect(formatDate('2027-03-09T23:30:00Z', UTC)).toBe('9 Mar 2027');
    expect(formatDate('2027-03-09T23:30:00Z', { timeZone: 'Asia/Singapore' })).toBe('10 Mar 2027');
    expect(formatDate('2027-05-01', { timeZone: 'America/Los_Angeles' })).toBe('1 May 2027');
    expect(formatDate(null)).toBe('');
    expect(formatDate('not a date')).toBe('');
  });

  it('uses the 12 hour clock with AM and PM', () => {
    expect(formatTime('2027-03-10T16:05:00Z', UTC)).toBe('4:05 PM');
    expect(formatTime('2027-03-10T00:00:00Z', UTC)).toBe('12:00 AM');
    expect(formatDateTime('2027-03-10T16:05:00Z', NOW, UTC)).toBe('10 Mar, 4:05 PM');
    expect(formatDateTime('2026-12-31T09:00:00Z', NOW, UTC)).toBe('31 Dec 2026, 9:00 AM');
  });

  it('says how long ago in plain words', () => {
    const ago = (ms) => new Date(Date.parse(NOW) - ms).toISOString();
    expect(relativeTime(ago(20000), NOW)).toBe('just now');
    expect(relativeTime(ago(60000), NOW)).toBe('1 minute ago');
    expect(relativeTime(ago(5 * 3600000), NOW)).toBe('5 hours ago');
    expect(relativeTime(ago(30 * 3600000), NOW)).toBe('yesterday');
    expect(relativeTime(ago(4 * 86400000), NOW)).toBe('4 days ago');
    expect(relativeTime(ago(90 * 86400000), NOW, UTC)).toBe('10 Dec 2026');
    expect(relativeTime('nope', NOW)).toBe('');
  });

  it('writes a range with "to", one date alone, and says when there are none', () => {
    expect(dateRange('2027-05-01', '2027-05-08')).toBe('1 May to 8 May 2027');
    expect(dateRange('2026-12-28', '2027-01-04')).toBe('28 Dec 2026 to 4 Jan 2027');
    expect(dateRange('2027-05-01', '2027-05-01')).toBe('1 May 2027');
    expect(dateRange(null, null)).toBe('No dates');
    expect(BANNED.test(dateRange('2027-05-01', '2027-05-08'))).toBe(false);
  });
});

describe('people', () => {
  it('keeps the name as written and names the nameless', () => {
    expect(displayName({ display_name: '  ana   LIMA ' })).toBe('ana LIMA');
    expect(displayName({ display_name: '  ' })).toBe('No name');
    expect(displayName(null)).toBe('No name');
    expect(initials('Ana Lima Costa')).toBe('AL');
    expect(initials('No name')).toBe('?');
  });

  it('lets only http and https avatars through, as the parsed address', () => {
    expect(safeAvatar('https://example.org/a.png')).toBe('https://example.org/a.png');
    expect(safeAvatar('https://example.org/a".png')).not.toContain('"');
    expect(safeAvatar('javascript:alert(1)')).toBe('');
    expect(safeAvatar('data:image/png;base64,AAAA')).toBe('');
    expect(safeAvatar('//example.org/a.png')).toBe('');
    expect(safeAvatar(null)).toBe('');
  });

  it('reads the home and the flag', () => {
    expect(homeLabel({ home_city: 'Lisbon', home_country: 'Portugal' })).toBe('Lisbon, Portugal');
    expect(homeLabel({ home_city: 'Singapore', home_country: 'Singapore' })).toBe('Singapore');
    expect(homeLabel({})).toBe('');
    expect(flagCode('pt')).toBe('pt');
    expect(flagCode('PT')).toBe('');
    expect(flagCode('"><x')).toBe('');
  });
});

describe('numbers and words', () => {
  it('counts with the right word', () => {
    expect(plural(1, 'trip', 'trips')).toBe('1 trip');
    expect(plural(1204, 'trip', 'trips')).toBe('1,204 trips');
    expect(plural(undefined, 'trip', 'trips')).toBe('0 trips');
    expect(num(NaN)).toBe('0');
  });

  it('counts days from embedded rows or an embedded count', () => {
    expect(dayCount({ itinerary_days: [{ day_number: 1 }, { day_number: 2 }] })).toBe(2);
    expect(dayCount({ itinerary_days: [{ count: 9 }] })).toBe(9);
    expect(dayCount({})).toBe(0);
  });
});

describe('log metadata', () => {
  it('turns keys into sentence case words', () => {
    expect(humanKey('user_agent')).toBe('User agent');
    expect(humanKey('httpStatus')).toBe('Http status');
    expect(humanKey('')).toBe('Value');
  });

  it('flattens metadata into readable lines', () => {
    const lines = metadataLines({ provider: 'gemini', ok: false, request: { attempt: 2, retry_after: null }, tags: ['a', 'b'], rows: [{ a: 1 }], stack: 'Error: boom\n  at run' });
    expect(lines).toEqual([
      { key: 'Provider', value: 'gemini', block: false },
      { key: 'Ok', value: 'No', block: false },
      { key: 'Request attempt', value: '2', block: false },
      { key: 'Request retry after', value: 'None', block: false },
      { key: 'Tags', value: 'a, b', block: false },
      { key: 'Rows', value: '[{"a":1}]', block: false },
      { key: 'Stack', value: 'Error: boom\n  at run', block: true },
    ]);
  });

  it('has no lines for empty or odd metadata and cuts a very long value', () => {
    expect(metadataLines(null)).toEqual([]);
    expect(metadataLines('text')).toEqual([]);
    expect(metadataLines({})).toEqual([]);
    const [line] = metadataLines({ body: 'x'.repeat(5000) });
    expect(line.value.length).toBeLessThan(2100);
    expect(line.value).toContain('cut at 2,000 characters');
  });

  it('copies a log row as JSON without the embedded person and trip', () => {
    const json = JSON.parse(logJson({ id: 'l1', message: 'm', metadata: { a: 1 }, profiles: { display_name: 'Ana' }, trips: null }));
    expect(json).toEqual({ id: 'l1', message: 'm', metadata: { a: 1 } });
  });
});
