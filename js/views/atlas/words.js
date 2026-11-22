// The small wordings the Atlas view writes itself: counts, dates, countdowns, the cost line. Pure,
// fixed English (not Intl), so the same model reads the same on every machine. Owner: VC.
import { costFigures } from '../../lib/money.js';
import { formatClock } from '../../lib/locale.js';
import { conditionPhrase } from '../shared/day-index.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const whole = (n) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
const one = (n, single, many) => `${numberText(n)} ${whole(n) === 1 ? single : many}`;

/** A whole number with its thousands grouped: "9,600". */
export function numberText(n) {
  return String(whole(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "1 plan", "3 plans". Plans, never trips taken. */
export const plansText = (n) => one(n, 'plan', 'plans');
/** "1 day", "12 days". */
export const daysText = (n) => one(n, 'day', 'days');
/** "1 country", "9 countries". */
export const countriesText = (n) => one(n, 'country', 'countries');

function dateParts(iso) {
  const found = ISO_DATE.exec(typeof iso === 'string' ? iso : '');
  const month = found ? MONTHS[Number(found[2]) - 1] : null;
  return month ? { day: Number(found[3]), month, year: found[1] } : null;
}

/** "19 Mar" from "2027-03-19"; '' for anything else. */
export function shortDate(iso) {
  const parts = dateParts(iso);
  return parts ? `${parts.day} ${parts.month}` : '';
}

/** "19 Mar 2027" from "2027-03-19"; '' for anything else. */
export function fullDate(iso) {
  const parts = dateParts(iso);
  return parts ? `${parts.day} ${parts.month} ${parts.year}` : '';
}

/** "7 days, 6 nights", "1 day". */
export function lengthText(dates) {
  const days = whole(dates?.dayCount);
  if (!days) return '';
  const nights = whole(dates?.nights);
  return nights ? `${daysText(days)}, ${one(nights, 'night', 'nights')}` : daysText(days);
}

/** The countdown of an upcoming plan in two parts, so a skin can set the number large. */
export function toGoText(daysToGo) {
  if (!Number.isFinite(daysToGo) || daysToGo < 0) return null;
  const n = whole(daysToGo);
  return { count: numberText(n), words: n === 1 ? 'day to go' : 'days to go' };
}

/** "tomorrow", "in 30 days": when an upcoming plan starts, inside a sentence. */
export const inDaysText = (n) => (whole(n) === 1 ? 'tomorrow' : `in ${numberText(n)} days`);

/** "3 days left", "1 day left", "Last day". */
export function daysLeftText(daysLeft) {
  const n = whole(daysLeft);
  return n === 0 ? 'Last day' : `${daysText(n)} left`;
}

/** The cost of a plan on one line: the leading figure ("about" when converted) and "per person". */
export function costLine(cost) {
  const { lead } = costFigures(cost);
  return lead ? `${lead} per person` : '';
}

/** The cost of a plan as the rail pill shows it: the leading figure alone, "S$3,040". '' with no cost. */
export function costShort(cost) {
  return costFigures(cost).lead.replace(/^about\s+/, '');
}

/** "3 plans match", "1 plan matches": what a search or a filter found. */
export const matchText = (n) => `${plansText(n)} ${whole(n) === 1 ? 'matches' : 'match'}`;

/** "10 to 24°C, typical for late March". The stored weather is a seasonal guess, and says so. */
export function weatherLine(weather) {
  const range = String(weather?.range ?? '').trim();
  if (!range) return '';
  const season = String(weather?.season ?? '').trim();
  if (/typical/i.test(season)) return `${range}, ${season}`;
  const condition = conditionPhrase(String(weather?.condition ?? ''));
  return condition ? `${range} typical, ${condition}` : `${range} typical`;
}

/** What someone can do with a plan that was shared with them. The owner's name is never known. */
export function sharedLine(card) {
  if (!card?.shared) return '';
  return card.role === 'editor' ? 'Shared with you. You can edit it.' : 'Shared with you. You can view it.';
}

/**
 * When a saved list was written, on the clock of this device: "on Tue 9 Mar at 6:42 PM" (or the
 * 24-hour form the user chose). '' when the time is not known.
 */
export function savedText(iso) {
  const at = typeof iso === 'string' ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return `on ${WEEKDAYS[at.getDay()]} ${at.getDate()} ${MONTHS[at.getMonth()]} at ${formatClock(clock)}`;
}

/** "from 1 May 2025 to 15 Sep 2027": the first and the last day of all plans. '' without dates. */
export function spanText(stats) {
  const first = fullDate(stats?.firstDate);
  const last = fullDate(stats?.lastDate);
  if (!first) return '';
  return last && last !== first ? `from ${first} to ${last}` : `from ${first}`;
}
