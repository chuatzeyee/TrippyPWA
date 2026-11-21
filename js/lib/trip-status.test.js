import { describe, it, expect } from 'vitest';
import { tripZone, zonedToday, tripPhase, daysUntilStart, dayOfTrip, statusText, tripStatus } from './trip-status.js';

// The device is in Singapore (UTC+8) in every test: the zone is passed in, never read from the machine.
const DEVICE = 'Asia/Singapore';
const AHEAD = 'Pacific/Kiritimati';   // UTC+14, no daylight saving: a day ahead of the device for 18 hours a day
const BEHIND = 'Pacific/Honolulu';    // UTC-10, no daylight saving: a day behind the device for 18 hours a day
const at = (iso) => new Date(iso);
const plan = (timezone, start = '2026-12-01', end = '2026-12-10', rest = {}) => ({ timezone, start_date: start, end_date: end, ...rest });

describe('tripZone: one order everywhere', () => {
  it('takes trips.timezone first', () => {
    expect(tripZone({ timezone: 'Asia/Tokyo', wizard_state: { destination: { timezone: 'Europe/Oslo' } } }, DEVICE)).toBe('Asia/Tokyo');
  });
  it('then the first destination of a single-city plan', () => {
    expect(tripZone({ timezone: null, wizard_state: { destination: { timezone: 'Europe/Oslo' } } }, DEVICE)).toBe('Europe/Oslo');
    expect(tripZone({ wizard_state: { multiCity: false, destination: { timezone: 'Europe/Oslo' }, destinations: [{ timezone: 'Asia/Tokyo' }] } }, DEVICE)).toBe('Europe/Oslo');
  });
  it('then the first destination of a multi-city plan', () => {
    const trip = { timezone: '', wizard_state: { multiCity: true, destination: null, destinations: [{ timezone: 'Europe/Helsinki' }, { timezone: 'Europe/Oslo' }] } };
    expect(tripZone(trip, DEVICE)).toBe('Europe/Helsinki');
  });
  it('then the device zone', () => {
    expect(tripZone({ wizard_state: { destination: { name: 'Somewhere', timezone: null } } }, DEVICE)).toBe(DEVICE);
    expect(tripZone({}, DEVICE)).toBe(DEVICE);
    expect(tripZone(null, DEVICE)).toBe(DEVICE);
  });
  it('skips a zone Intl rejects (a custom destination can carry anything)', () => {
    expect(tripZone({ timezone: 'Mars/Olympus_Mons', wizard_state: { destination: { timezone: 'Europe/Oslo' } } }, DEVICE)).toBe('Europe/Oslo');
    expect(tripZone({ timezone: 'not a zone', wizard_state: { destination: { timezone: 42 } } }, DEVICE)).toBe(DEVICE);
  });
  it('uses the zone of the machine when no device zone is passed', () => {
    expect(tripZone({})).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('zonedToday', () => {
  const now = at('2026-11-20T04:00:00Z');
  it('gives the calendar date in the zone', () => {
    expect(zonedToday(now, 'UTC')).toBe('2026-11-20');
    expect(zonedToday(now, DEVICE)).toBe('2026-11-20');
    expect(zonedToday(now, BEHIND)).toBe('2026-11-19');
    expect(zonedToday(at('2026-11-20T12:00:00Z'), AHEAD)).toBe('2026-11-21');
  });
  it('pads months and days and crosses a year end', () => {
    expect(zonedToday(at('2026-12-31T20:00:00Z'), DEVICE)).toBe('2027-01-01');
    expect(zonedToday(at('2027-03-04T00:30:00Z'), 'UTC')).toBe('2027-03-04');
  });
  it('falls back to the device zone when Intl rejects the zone', () => {
    expect(zonedToday(now, 'Mars/Olympus_Mons', BEHIND)).toBe('2026-11-19');
    expect(zonedToday(now, '', DEVICE)).toBe('2026-11-20');
    expect(zonedToday(now, undefined, AHEAD)).toBe('2026-11-20');
    expect(zonedToday(at('2026-11-20T12:00:00Z'), null, AHEAD)).toBe('2026-11-21');
  });
  it('uses UTC when the device zone is no zone either', () => {
    expect(zonedToday(at('2026-11-20T23:30:00Z'), 'Mars/Olympus_Mons', 'Not/AZone')).toBe('2026-11-20');
  });
  it('takes a Date, an ISO string or a number of milliseconds', () => {
    expect(zonedToday('2026-11-20T04:00:00Z', BEHIND)).toBe('2026-11-19');
    expect(zonedToday(now.getTime(), BEHIND)).toBe('2026-11-19');
  });
  it('never reads the clock: a missing or invalid now is an error', () => {
    expect(() => zonedToday(undefined, 'UTC')).toThrow(TypeError);
    expect(() => zonedToday(null, 'UTC')).toThrow(TypeError);
    expect(() => zonedToday('soon', 'UTC')).toThrow(TypeError);
    expect(() => zonedToday(new Date(NaN), 'UTC')).toThrow(TypeError);
  });
});

describe('tripPhase: decided in the zone of the trip', () => {
  it('a trip a day behind the device starts and ends at its own midnight', () => {
    const trip = plan(BEHIND);
    // 1 Dec 00:00 in Honolulu is 1 Dec 10:00 UTC, which is already 1 Dec 18:00 on the device.
    expect(tripPhase(trip, at('2026-12-01T09:59:00Z'), DEVICE)).toBe('upcoming');
    expect(tripPhase(trip, at('2026-12-01T10:00:00Z'), DEVICE)).toBe('live');
    // 10 Dec 23:59 in Honolulu is 11 Dec 09:59 UTC: the device already shows 11 Dec.
    expect(tripPhase(trip, at('2026-12-11T09:59:00Z'), DEVICE)).toBe('live');
    expect(tripPhase(trip, at('2026-12-11T10:00:00Z'), DEVICE)).toBe('past');
  });
  it('a trip a day ahead of the device starts and ends at its own midnight', () => {
    const trip = plan(AHEAD);
    // 1 Dec 00:00 on Kiritimati is 30 Nov 10:00 UTC, when the device still shows 30 Nov.
    expect(tripPhase(trip, at('2026-11-30T09:59:00Z'), DEVICE)).toBe('upcoming');
    expect(tripPhase(trip, at('2026-11-30T10:00:00Z'), DEVICE)).toBe('live');
    expect(tripPhase(trip, at('2026-12-10T09:59:00Z'), DEVICE)).toBe('live');
    expect(tripPhase(trip, at('2026-12-10T10:00:00Z'), DEVICE)).toBe('past');
  });
  it('uses the first destination when the row has no zone, and the device zone when nothing has one', () => {
    const viaDestination = { start_date: '2026-12-01', end_date: '2026-12-10', wizard_state: { destination: { timezone: BEHIND } } };
    expect(tripPhase(viaDestination, at('2026-12-01T09:59:00Z'), DEVICE)).toBe('upcoming');
    const noZone = { start_date: '2026-12-01', end_date: '2026-12-10', wizard_state: { destination: { timezone: null } } };
    expect(tripPhase(noZone, at('2026-11-30T15:59:00Z'), DEVICE)).toBe('upcoming');
    expect(tripPhase(noZone, at('2026-11-30T16:00:00Z'), DEVICE)).toBe('live');
  });
  it('an invalid zone falls back instead of throwing', () => {
    expect(tripPhase(plan('Mars/Olympus_Mons'), at('2026-11-30T16:00:00Z'), DEVICE)).toBe('live');
  });
  it('a start date with no end date is a one-day plan, not a past one', () => {
    const trip = plan('UTC', '2026-12-01', null);
    expect(tripPhase(trip, at('2026-11-30T23:59:00Z'), DEVICE)).toBe('upcoming');
    expect(tripPhase(trip, at('2026-12-01T00:00:00Z'), DEVICE)).toBe('live');
    expect(tripPhase(trip, at('2026-12-01T23:59:00Z'), DEVICE)).toBe('live');
    expect(tripPhase(trip, at('2026-12-02T00:00:00Z'), DEVICE)).toBe('past');
  });
  it('an end date before the start date is read as a one-day plan', () => {
    expect(tripPhase(plan('UTC', '2026-12-01', '2026-11-01'), at('2026-12-01T12:00:00Z'), DEVICE)).toBe('live');
    expect(tripPhase(plan('UTC', '2026-12-01', '2026-11-01'), at('2026-12-02T12:00:00Z'), DEVICE)).toBe('past');
  });
  it('no start date gives undated, whatever else the row holds', () => {
    expect(tripPhase(plan('UTC', null, null), at('2026-12-01T12:00:00Z'), DEVICE)).toBe('undated');
    expect(tripPhase(plan('UTC', '', '2026-12-10'), at('2026-12-01T12:00:00Z'), DEVICE)).toBe('undated');
    expect(tripPhase(plan('UTC', '2026-02-30', '2026-03-05'), at('2026-12-01T12:00:00Z'), DEVICE)).toBe('undated');
    expect(tripPhase({}, at('2026-12-01T12:00:00Z'), DEVICE)).toBe('undated');
    expect(tripPhase(null, at('2026-12-01T12:00:00Z'), DEVICE)).toBe('undated');
  });
  it('reads a timestamp as its date part', () => {
    expect(tripPhase(plan('UTC', '2026-12-01T00:00:00+00:00', '2026-12-10T00:00:00+00:00'), at('2026-12-05T12:00:00Z'), DEVICE)).toBe('live');
  });
  it('does not change the trip', () => {
    const trip = Object.freeze(plan(BEHIND, '2026-12-01', '2026-12-10', { wizard_state: Object.freeze({}) }));
    expect(() => tripPhase(trip, at('2026-12-05T12:00:00Z'), DEVICE)).not.toThrow();
  });
});

describe('daysUntilStart: counted from the date on the device', () => {
  it('counts whole days from the device date, not from the date at the destination', () => {
    // 30 Nov 02:00 UTC: 30 Nov on the device, still 29 Nov in Honolulu. The home calendar says tomorrow.
    expect(daysUntilStart('2026-12-01', at('2026-11-30T02:00:00Z'), DEVICE)).toBe(1);
    expect(daysUntilStart('2026-12-01', at('2026-11-30T02:00:00Z'), BEHIND)).toBe(2);
  });
  it('changes at midnight on the device', () => {
    expect(daysUntilStart('2026-12-01', at('2026-11-20T15:59:00Z'), DEVICE)).toBe(11);
    expect(daysUntilStart('2026-12-01', at('2026-11-20T16:00:00Z'), DEVICE)).toBe(10);
  });
  it('is 0 on the day and negative after it', () => {
    expect(daysUntilStart('2026-12-01', at('2026-12-01T03:00:00Z'), DEVICE)).toBe(0);
    expect(daysUntilStart('2026-12-01', at('2026-12-03T03:00:00Z'), DEVICE)).toBe(-2);
  });
  it('counts calendar days across a month and a year end', () => {
    expect(daysUntilStart('2027-02-28', at('2026-11-20T04:00:00Z'), DEVICE)).toBe(100);
    expect(daysUntilStart('2027-01-01', at('2026-12-31T04:00:00Z'), DEVICE)).toBe(1);
  });
  it('is null without a real start date', () => {
    expect(daysUntilStart(null, at('2026-11-20T04:00:00Z'), DEVICE)).toBeNull();
    expect(daysUntilStart('', at('2026-11-20T04:00:00Z'), DEVICE)).toBeNull();
    expect(daysUntilStart('next spring', at('2026-11-20T04:00:00Z'), DEVICE)).toBeNull();
    expect(daysUntilStart('2026-13-01', at('2026-11-20T04:00:00Z'), DEVICE)).toBeNull();
  });
});

describe('dayOfTrip', () => {
  const rows = (n, start = '2026-12-01') => Array.from({ length: n }, (_, i) => {
    const date = new Date(`${start}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    return { day_number: i + 1, date: date.toISOString().slice(0, 10) };
  });

  it('is null unless the plan is live', () => {
    expect(dayOfTrip(plan('UTC'), rows(10), at('2026-11-20T04:00:00Z'), DEVICE)).toBeNull();
    expect(dayOfTrip(plan('UTC'), rows(10), at('2026-12-20T04:00:00Z'), DEVICE)).toBeNull();
    expect(dayOfTrip(plan('UTC', null, null), rows(10), at('2026-12-05T04:00:00Z'), DEVICE)).toBeNull();
  });
  it('counts the day in the zone of the trip', () => {
    // 3 Dec 02:00 UTC is still 2 Dec in Honolulu and already 3 Dec on the device.
    expect(dayOfTrip(plan(BEHIND), rows(10), at('2026-12-03T02:00:00Z'), DEVICE)).toEqual({ dayNumber: 2, dayCount: 10, dayIndex: 1, daysLeft: 8 });
    expect(dayOfTrip(plan(AHEAD), rows(10), at('2026-12-03T12:00:00Z'), DEVICE)).toEqual({ dayNumber: 4, dayCount: 10, dayIndex: 3, daysLeft: 6 });
  });
  it('the first and the last day', () => {
    expect(dayOfTrip(plan('UTC'), rows(10), at('2026-12-01T00:00:00Z'), DEVICE)).toMatchObject({ dayNumber: 1, dayCount: 10, daysLeft: 9 });
    expect(dayOfTrip(plan('UTC'), rows(10), at('2026-12-10T23:59:00Z'), DEVICE)).toMatchObject({ dayNumber: 10, dayCount: 10, daysLeft: 0 });
  });
  it('dayCount is the date span, so 10 calendar days with 9 itinerary days never reads "Day 10 of 9"', () => {
    const day = dayOfTrip(plan('UTC'), rows(9), at('2026-12-10T12:00:00Z'), DEVICE);
    expect(day).toEqual({ dayNumber: 10, dayCount: 10, dayIndex: null, daysLeft: 0 });
    expect(statusText({ phase: 'live', ...day })).toBe('Day 10 of 10');
    for (let d = 1; d <= 10; d++) {
      const each = dayOfTrip(plan('UTC'), rows(9), at(`2026-12-${String(d).padStart(2, '0')}T12:00:00Z`), DEVICE);
      expect(each.dayNumber).toBeLessThanOrEqual(each.dayCount);
      expect(each.dayNumber).toBe(d);
    }
  });
  it('a plan with no end date is day 1 of 1', () => {
    expect(dayOfTrip(plan('UTC', '2026-12-01', null), rows(3), at('2026-12-01T12:00:00Z'), DEVICE)).toEqual({ dayNumber: 1, dayCount: 1, dayIndex: 0, daysLeft: 0 });
  });
  it('dayIndex is the row whose date is today in the zone of the trip', () => {
    // Rows out of order and with a gap: the date decides, not the position or the number.
    const days = [{ day_number: 1, date: '2026-12-01' }, { day_number: 2, date: '2026-12-02' }, { day_number: 3, date: '2026-12-05' }, { day_number: 4, date: '2026-12-04' }];
    expect(dayOfTrip(plan('UTC'), days, at('2026-12-04T12:00:00Z'), DEVICE).dayIndex).toBe(3);
    expect(dayOfTrip(plan('UTC'), days, at('2026-12-05T12:00:00Z'), DEVICE).dayIndex).toBe(2);
  });
  it('dayIndex falls back to the row with that day number when the rows carry no dates', () => {
    const days = [{ day_number: 1, date: null }, { day_number: 2, date: null }, { day_number: 3 }];
    expect(dayOfTrip(plan('UTC'), days, at('2026-12-03T12:00:00Z'), DEVICE)).toEqual({ dayNumber: 3, dayCount: 10, dayIndex: 2, daysLeft: 7 });
  });
  it('dayIndex is null when no row matches, and when there are no rows', () => {
    expect(dayOfTrip(plan('UTC'), [{ day_number: 1, date: null }], at('2026-12-03T12:00:00Z'), DEVICE).dayIndex).toBeNull();
    expect(dayOfTrip(plan('UTC'), [], at('2026-12-03T12:00:00Z'), DEVICE).dayIndex).toBeNull();
    expect(dayOfTrip(plan('UTC'), undefined, at('2026-12-03T12:00:00Z'), DEVICE).dayIndex).toBeNull();
    expect(dayOfTrip(plan('UTC'), null, at('2026-12-03T12:00:00Z'), DEVICE)).toMatchObject({ dayNumber: 3, dayCount: 10 });
  });
  it('reads a day row whose date is a timestamp', () => {
    expect(dayOfTrip(plan('UTC'), [{ day_number: 9, date: '2026-12-03T00:00:00+00:00' }], at('2026-12-03T12:00:00Z'), DEVICE).dayIndex).toBe(0);
  });
});

describe('statusText', () => {
  it('counts down to departure', () => {
    expect(statusText({ phase: 'upcoming', daysToGo: 100 })).toBe('In 100 days');
    expect(statusText({ phase: 'upcoming', daysToGo: 2 })).toBe('In 2 days');
    expect(statusText({ phase: 'upcoming', daysToGo: 1 })).toBe('Tomorrow');
  });
  it('says "Starts today" when the device date is the start date and the destination is still a day behind', () => {
    expect(statusText({ phase: 'upcoming', daysToGo: 0 })).toBe('Starts today');
    expect(statusText({ phase: 'upcoming', daysToGo: -1 })).toBe('Starts today');
  });
  it('names the day of a live plan', () => {
    expect(statusText({ phase: 'live', dayNumber: 3, dayCount: 10 })).toBe('Day 3 of 10');
    expect(statusText({ phase: 'live', dayNumber: 1, dayCount: 1 })).toBe('Day 1 of 1');
  });
  it('past and undated plans', () => {
    expect(statusText({ phase: 'past' })).toBe('Past plan');
    expect(statusText({ phase: 'undated' })).toBe('No dates yet');
  });
  it('a failed plan reads "Planning stopped" whatever its dates', () => {
    expect(statusText({ phase: 'upcoming', daysToGo: 12, status: 'failed' })).toBe('Planning stopped');
    expect(statusText({ phase: 'undated', status: 'failed' })).toBe('Planning stopped');
  });
  it('still says something true when a number is missing', () => {
    expect(statusText({ phase: 'upcoming' })).toBe('Upcoming');
    expect(statusText({ phase: 'upcoming', daysToGo: null })).toBe('Upcoming');
    expect(statusText({ phase: 'live' })).toBe('Happening now');
    expect(statusText({ phase: 'live', dayNumber: 3 })).toBe('Happening now');
  });
  it('is empty for no phase', () => {
    expect(statusText({})).toBe('');
    expect(statusText()).toBe('');
    expect(statusText({ phase: 'generating' })).toBe('');
  });
});

describe('tripStatus: the phase, the countdown, the day and the text in one call', () => {
  it('an upcoming plan', () => {
    expect(tripStatus(plan(BEHIND, '2027-02-28', '2027-03-09'), [], at('2026-11-20T04:00:00Z'), DEVICE)).toEqual({
      zone: BEHIND, phase: 'upcoming', daysToGo: 100, live: null, text: 'In 100 days',
    });
  });
  it('an upcoming plan never has a negative countdown', () => {
    // 1 Dec 05:00 on the device, 30 Nov 11:00 in Honolulu.
    const status = tripStatus(plan(BEHIND), [], at('2026-11-30T21:00:00Z'), DEVICE);
    expect(status).toMatchObject({ phase: 'upcoming', daysToGo: 0, text: 'Starts today' });
  });
  it('a live plan', () => {
    const days = [{ day_number: 1, date: '2026-12-01' }, { day_number: 2, date: '2026-12-02' }];
    expect(tripStatus(plan('UTC'), days, at('2026-12-02T12:00:00Z'), DEVICE)).toEqual({
      zone: 'UTC', phase: 'live', daysToGo: null, live: { dayNumber: 2, dayCount: 10, dayIndex: 1, daysLeft: 8 }, text: 'Day 2 of 10',
    });
  });
  it('a past plan, an undated plan and a failed one', () => {
    expect(tripStatus(plan('UTC'), [], at('2027-01-02T12:00:00Z'), DEVICE)).toMatchObject({ phase: 'past', daysToGo: null, live: null, text: 'Past plan' });
    expect(tripStatus(plan('UTC', null, null), [], at('2027-01-02T12:00:00Z'), DEVICE)).toMatchObject({ phase: 'undated', daysToGo: null, live: null, text: 'No dates yet' });
    expect(tripStatus(plan('UTC', '2027-02-28', '2027-03-09', { status: 'failed' }), [], at('2026-11-20T04:00:00Z'), DEVICE)).toMatchObject({ phase: 'upcoming', text: 'Planning stopped' });
  });
});
