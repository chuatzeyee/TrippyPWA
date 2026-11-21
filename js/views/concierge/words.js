// Small wording helpers of the Concierge view. Pure: no DOM, no clock, no locale of the machine.
// Owner: VB.
import { costFigures } from '../../lib/money.js';

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const WEEKDAYS = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
const MONTHS = {
  Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June',
  Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
};
export const MONTH_NAMES = Object.freeze(Object.values(MONTHS));
const SHORT_DATE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/;
/**
 * Up to which length the hero title takes its largest and its middle size: the whole title in
 * characters, and its longest word, which has to fit one line of a phone at that size.
 */
const TITLE_SHORT = Object.freeze({ total: 12, word: 9 });
const TITLE_MID = Object.freeze({ total: 24, word: 13 });

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** "two", "twelve"; digits above twelve; '' for anything that is not a number. */
export function numberWord(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}

/** "1 day", "12 days". */
export const countOf = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "food, history and markets". */
export function wordList(items) {
  const words = (Array.isArray(items) ? items : []).map(text).filter(Boolean);
  if (words.length < 2) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export const capital = (value) => { const s = text(value); return s.charAt(0).toUpperCase() + s.slice(1); };

/** Lower case for the first letter, unless the word is written in capitals (an acronym). */
export function lowerFirst(value) {
  const s = text(value);
  return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * The dateline: "Wed 10 Mar" spelled out as "Wednesday 10 March 2027". The year is added only when
 * the instant is written on that same calendar day; a text in another form is returned as it came.
 * @param {{ iso: string, dateText: string }|null} now  DashboardModel.now
 */
export function longDate(now) {
  const short = text(now?.dateText);
  const match = SHORT_DATE.exec(short);
  if (!match) return short;
  const [, weekday, day, month] = match;
  const long = `${WEEKDAYS[weekday]} ${day} ${MONTHS[month]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(now?.iso));
  const agrees = iso && Number(iso[3]) === Number(day) && MONTH_NAMES[Number(iso[2]) - 1] === MONTHS[month];
  return agrees ? `${long} ${iso[1]}` : long;
}

/** The size step of the hero title, from its character count: 'short', 'mid' or 'long'. */
export function titleStep(title) {
  const value = text(title);
  const total = [...value].length;
  const word = Math.max(0, ...value.split(/\s+/).map((part) => [...part].length));
  const fits = (limit) => total <= limit.total && word <= limit.word;
  return fits(TITLE_SHORT) ? 'short' : fits(TITLE_MID) ? 'mid' : 'long';
}

/** "The seven days": the real day count, in words up to twelve. */
export function daysHeading(count) {
  const n = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  if (n === 0) return 'The days';
  return n === 1 ? 'The day' : `The ${numberWord(n)} days`;
}

/**
 * One cost on a card: "about €390 per person (MAD 4,200)". '' without a cost.
 * @param {import('../contract.js').CostEstimate|null} cost
 * @param {{ short?: boolean }} [opts] short leaves the second figure out, for a compact row
 */
export function costLine(cost, { short = false } = {}) {
  const { lead, other } = costFigures(cost);
  if (!lead) return '';
  return `${lead} per person${other && !short ? ` (${other})` : ''}`;
}

/**
 * How much of the budget is planned, from the pair of figures costFigures() leads with.
 * @returns {{ percent: number, over: boolean }|null} percent is 0 to 100 for the bar; null without both figures
 */
export function spendShare(cost) {
  const homeLeads = Boolean(cost?.homeFirst) && Boolean(cost?.home) && Boolean(cost?.budgetHome);
  const spent = homeLeads ? cost.home : cost?.local;
  const budget = homeLeads ? cost.budgetHome : cost?.budget;
  if (!spent || !budget || spent.code !== budget.code || !(budget.amount > 0) || !(spent.amount >= 0)) return null;
  const share = (spent.amount / budget.amount) * 100;
  return { percent: Math.min(100, Math.round(share)), over: share > 100 };
}

/** "Settled: flights (booked) and stay (booked)." from the readiness rows that are done. */
export function settledLine(items) {
  const done = (Array.isArray(items) ? items : []).filter((item) => item && text(item.label))
    .map((item) => `${lowerFirst(item.label)}${text(item.status) ? ` (${lowerFirst(item.status)})` : ''}`);
  return done.length ? `Settled: ${wordList(done)}.` : '';
}
