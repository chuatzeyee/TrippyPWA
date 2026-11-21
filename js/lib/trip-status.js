// Phase, countdown and day of trip, with one timezone order for every screen (blueprint 2.3).
// Pure: `now` is always passed in, and nothing here reads the clock, storage or the network.
//
// Two calendars are in play. The phase and the day number are decided in the zone of the trip, so
// a plan goes live at its own midnight. The countdown before departure is counted from the date
// on the device, because the traveller is still at home. The device zone is an optional last
// argument everywhere (tests pass it); left out, it is the zone of the machine.
import { isoToUtc } from './trip-extras.js';

const DAY_MS = 86400000;

const formatters = new Map();   // zone -> Intl.DateTimeFormat, or null for a zone Intl rejects

function formatterFor(zone) {
  if (typeof zone !== 'string' || !zone) return null;
  if (!formatters.has(zone)) {
    let formatter = null;
    try {
      formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      // A custom destination can carry any text as its zone: treated as no zone.
    }
    formatters.set(zone, formatter);
  }
  return formatters.get(zone);
}

/** The zone of the machine: the last step of the order, and the calendar the countdown uses. */
function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function toDate(now) {
  const date = now instanceof Date ? now : new Date(now ?? NaN);
  if (Number.isNaN(date.getTime())) throw new TypeError('trip-status: `now` must be a valid date (it is never read from the clock)');
  return date;
}

/** 'YYYY-MM-DD' when the value starts with a real calendar date, else null. */
function dateOnly(value) {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  return isoToUtc(day) === null ? null : day;
}

const daysFromTo = (from, to) => Math.round((isoToUtc(to) - isoToUtc(from)) / DAY_MS);

const firstDestination = (trip) => {
  const ws = trip?.wizard_state;
  return ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
};

/** The start and the end of a plan as dates; a plan with no usable end date ends on its start date. */
function span(trip) {
  const start = dateOnly(trip?.start_date);
  if (!start) return null;
  const end = dateOnly(trip?.end_date);
  return { start, end: end && end >= start ? end : start };
}

/**
 * The zone a plan lives in: `trips.timezone`, else the first destination's, else the device zone.
 * A zone that Intl rejects is skipped, so the result can always be handed to Intl.
 * @param {object} trip          a trips row (list row or full row)
 * @param {string} [deviceZone]
 * @returns {string} an IANA zone name
 */
export function tripZone(trip, deviceZone = deviceTimeZone()) {
  return [trip?.timezone, firstDestination(trip)?.timezone].find((zone) => formatterFor(zone)) || deviceZone;
}

/**
 * The calendar date in a zone.
 * @param {Date|string|number} now
 * @param {string} tz              an IANA zone; when Intl rejects it, the device zone is used
 * @param {string} [deviceZone]
 * @returns {string} 'YYYY-MM-DD'
 */
export function zonedToday(now, tz, deviceZone = deviceTimeZone()) {
  const date = toDate(now);
  const formatter = formatterFor(tz) || formatterFor(deviceZone) || formatterFor('UTC');
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Where a plan stands today, in its own zone. A start date with no end date is a one-day plan.
 * @returns {'live'|'upcoming'|'past'|'undated'}
 */
export function tripPhase(trip, now, deviceZone = deviceTimeZone()) {
  const dates = span(trip);
  if (!dates) return 'undated';
  const today = zonedToday(now, tripZone(trip, deviceZone), deviceZone);
  if (today < dates.start) return 'upcoming';
  return today > dates.end ? 'past' : 'live';
}

/**
 * Whole days from the date on the device to the start date. It can be 0 or negative while the plan
 * is still upcoming at a destination that is a day behind: show such a plan as starting today.
 * @returns {number|null} null without a real start date
 */
export function daysUntilStart(startDate, now, deviceZone = deviceTimeZone()) {
  const start = dateOnly(startDate);
  return start ? daysFromTo(zonedToday(now, deviceZone, deviceZone), start) : null;
}

/**
 * The day a live plan is on. `dayCount` is the span of its dates, never the number of itinerary
 * rows, and `dayNumber` stays within 1..dayCount. `dayIndex` is the position in `days` of the row
 * dated today (in the zone of the trip), else of the row whose day_number is `dayNumber`, else null.
 * @param {object} trip
 * @param {Array<{ day_number?: number, date?: string|null }>} [days]  itinerary rows in display order
 * @returns {{ dayNumber: number, dayCount: number, dayIndex: number|null, daysLeft: number }|null}
 *   null unless the plan is live
 */
export function dayOfTrip(trip, days, now, deviceZone = deviceTimeZone()) {
  const dates = span(trip);
  if (!dates) return null;
  const today = zonedToday(now, tripZone(trip, deviceZone), deviceZone);
  if (today < dates.start || today > dates.end) return null;
  const dayCount = daysFromTo(dates.start, dates.end) + 1;
  const dayNumber = Math.min(dayCount, Math.max(1, daysFromTo(dates.start, today) + 1));
  const rows = Array.isArray(days) ? days : [];
  const byDate = rows.findIndex((row) => dateOnly(row?.date) === today);
  const byNumber = byDate >= 0 ? byDate : rows.findIndex((row) => Number(row?.day_number) === dayNumber);
  return { dayNumber, dayCount, dayIndex: byNumber >= 0 ? byNumber : null, daysLeft: dayCount - dayNumber };
}

const isCount = (n) => Number.isInteger(n) && n >= 1;

/**
 * The one line that says where a plan stands: "In 100 days", "Tomorrow", "Starts today",
 * "Day 3 of 10", "Past plan", "No dates yet", and "Planning stopped" for a failed plan.
 * @param {{ phase?: string, daysToGo?: number|null, dayNumber?: number, dayCount?: number, status?: string }} [state]
 * @returns {string} '' when the phase is not one of upcoming, live, past, undated
 */
export function statusText({ phase, daysToGo, dayNumber, dayCount, status } = {}) {
  if (status === 'failed') return 'Planning stopped';
  if (phase === 'undated') return 'No dates yet';
  if (phase === 'past') return 'Past plan';
  if (phase === 'live') return isCount(dayNumber) && isCount(dayCount) ? `Day ${dayNumber} of ${dayCount}` : 'Happening now';
  if (phase !== 'upcoming') return '';
  if (!Number.isFinite(daysToGo)) return 'Upcoming';
  if (daysToGo <= 0) return 'Starts today';
  return daysToGo === 1 ? 'Tomorrow' : `In ${daysToGo} days`;
}

/**
 * Everything above for one plan, so two screens cannot combine the parts differently.
 * @param {object} trip   a trips row; `status` 'failed' gives the text "Planning stopped"
 * @param {Array<object>} [days]
 * @returns {{ zone: string, phase: 'live'|'upcoming'|'past'|'undated', daysToGo: number|null,
 *   live: { dayNumber: number, dayCount: number, dayIndex: number|null, daysLeft: number }|null, text: string }}
 *   daysToGo is set for an upcoming plan only and is never negative
 */
export function tripStatus(trip, days, now, deviceZone = deviceTimeZone()) {
  const phase = tripPhase(trip, now, deviceZone);
  const daysToGo = phase === 'upcoming' ? Math.max(0, daysUntilStart(trip.start_date, now, deviceZone)) : null;
  const live = phase === 'live' ? dayOfTrip(trip, days, now, deviceZone) : null;
  return {
    zone: tripZone(trip, deviceZone), phase, daysToGo, live,
    text: statusText({ phase, daysToGo, dayNumber: live?.dayNumber, dayCount: live?.dayCount, status: trip?.status }),
  };
}
