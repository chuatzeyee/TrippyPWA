// "Compare with a Trippy plan" for imported trips: the pure parts. No DOM, no network, no storage.
//
// An imported trip (wizard_state.imported) can have one comparison trip: a second trip row of the
// same owner that Trippy plans for the same place, dates and travellers. The two rows point at each
// other inside wizard_state: `compareTrip` on the imported trip, `compareOf` on the comparison. A
// comparison is left out of the trip list by the list query itself (fetchAllTrips in trip-repository.js).
import { sumCosts, tripCurrencyCode } from './cost-sum.js';
import { costEstimate, costFigures, moneyText } from './money.js';
import { formatClock } from './locale.js';
import { convert, canConvert } from '../data/currencies.js';

export const PACE_WORDS = Object.freeze(['Relaxed', 'Easy', 'Balanced', 'Active', 'Packed']);
export const DEFAULT_PACE = 3;
const DEFAULT_BUDGET_USD = 120; // the wizard's "comfortable" level when the place has no range
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const list = (value) => (Array.isArray(value) ? value : []);

/** The filter of the list query that leaves comparison trips out: supabase-js .is(column, value). */
export const NOT_A_COMPARISON = Object.freeze(['wizard_state->>compareOf', null]);

/** The id of the imported trip this row is the comparison of, or ''. */
export const comparisonOf = (wizardState) => text(wizardState?.compareOf);

/**
 * What the confirm step shows, taken from the imported trip.
 * @param {object} trip  the imported trip row
 * @returns {{ destination: string, start: string, end: string, travelers: number, pace: number,
 *   dailyAmount: number, currencyCode: string, currencySymbol: string }}
 */
export function compareInputs(trip) {
  const ws = trip?.wizard_state ?? {};
  const place = ws.destination ?? null;
  const code = tripCurrencyCode(trip);
  const fromRange = Number(place?.budgetRange?.comfortable) || DEFAULT_BUDGET_USD;
  const fallback = canConvert(code) ? Math.round(convert(fromRange, 'USD', code)) : fromRange;
  const date = (value) => (ISO_DATE.test(text(value)) ? text(value) : '');
  return {
    destination: text(place?.name),
    start: date(trip?.start_date) || date(ws.dates?.start),
    end: date(trip?.end_date) || date(ws.dates?.end),
    travelers: Math.min(20, Math.max(1, Math.trunc(Number(trip?.travelers ?? ws.travelers)) || 1)),
    pace: DEFAULT_PACE,
    dailyAmount: Math.round(Number(trip?.budget_daily) || Number(ws.budget?.dailyAmount) || 0) || fallback,
    currencyCode: code,
    currencySymbol: text(place?.currencySymbol) || text(trip?.budget_currency_symbol),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Comparison trips nobody can reach any more. They are hidden from the list, so they would stay
 * for good: one whose imported trip is gone, and one its imported trip has not pointed at for a
 * day (a start cut short, or a second start from another tab).
 * @param {Array<{ id: string, of: string, created_at?: string }>} hidden  the user's comparison trips
 * @param {Array<{ id: string, compare?: string|null }>} parents           the imported trips they name, as found
 * @param {number} [now]
 * @returns {string[]} ids to delete
 */
export function orphanComparisons(hidden, parents, now = Date.now()) {
  const pointer = new Map(list(parents).map((row) => [row.id, text(row.compare)]));
  return list(hidden).filter((row) => text(row?.id) && text(row.of)).filter((row) => {
    if (!pointer.has(row.of)) return true;
    const age = now - Date.parse(row.created_at);
    return pointer.get(row.of) !== row.id && age > DAY_MS;
  }).map((row) => row.id);
}

// ----- The comparison model -----

const LEADING = /^(?:the|a|an|le|la|el)\s+/;

/** A place name reduced for matching: lower case, no accents, no punctuation, no leading article. */
export function nameKey(name) {
  return text(String(name ?? '')).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(LEADING, '');
}

// Words that say what kind of stop it is, not which place: a name made only of these ("Lunch",
// "Cafe", "Hotel check in") never matches a longer or a different name.
const GENERIC = new Set(('breakfast brunch lunch dinner supper snack coffee tea drinks cafe restaurant bar pub bakery hotel hostel '
  + 'check in out arrival departure airport flight transfer station free time rest break walk stroll tour visit shopping market museum '
  + 'park beach temple church gallery garden square bridge and the at to of on by for with near from into around').split(' '));
const distinct = (key) => key.split(' ').some((word) => word.length > 2 && !GENERIC.has(word));

/** Loose match of two keys: the same, or one holds the other as whole words. A key must name a place. */
function sameKey(a, b) {
  if (!a || !b || !distinct(a) || !distinct(b)) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 5 && ` ${long} `.includes(` ${short} `);
}

const placeName = (activity) => text(activity?.venue_name) || text(activity?.title);
// `name` is the name shown; `keys` are every name the stop goes by (venue and title).
const namesOf = (activity) => ({ name: nameKey(placeName(activity)), keys: [...new Set([nameKey(activity?.venue_name), nameKey(activity?.title)].filter(Boolean))] });
// The same shown name always matches (a stop copied across stays "in both"); otherwise loosely.
const matches = (stop, others) => others.some((other) => (stop.name !== '' && stop.name === other.name)
  || stop.keys.some((key) => other.keys.some((otherKey) => sameKey(key, otherKey))));
const dayRows = (trip) => [...list(trip?.itinerary_days)].sort((a, b) => (Number(a.day_number) || 0) - (Number(b.day_number) || 0));
const categoryWord = (value) => {
  const word = text(value).replace(/[-_]+/g, ' ');
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : '';
};
const perDay = (stops, days) => (days > 0 ? (Math.round((stops / days) * 10) / 10).toString() : '0');

function costOf(trip, activities, money) {
  const figures = costFigures(costEstimate({
    activities, tripCode: tripCurrencyCode(trip), tripSymbol: trip?.budget_currency_symbol, home: money?.home ?? null, homeFirst: money?.homeFirst,
  }));
  return figures.lead;
}

function stopOf(activity, trip, inBoth) {
  const code = text(activity.cost_currency).toUpperCase() || tripCurrencyCode(trip);
  const amount = Number(activity.cost_amount) || 0;
  return {
    id: text(activity.id),
    time: activity.start_time ? formatClock(String(activity.start_time).slice(0, 5)) : '',
    name: placeName(activity) || 'Unnamed stop',
    category: categoryWord(activity.category),
    cost: amount > 0 ? moneyText(amount, code, code === tripCurrencyCode(trip) ? trip?.budget_currency_symbol : '') : '',
    inBoth,
  };
}

/**
 * Two plans side by side: totals, then the days aligned by day number.
 * @param {object} mine     the imported trip, with itinerary_days and their activities in day order
 * @param {object|null} theirs  the comparison trip, or null while it is not there yet
 * @param {{ home?: { code: string, symbol?: string }|null, homeFirst?: boolean }} [money]
 * @returns {{ summary: Array<{ label: string, mine: string, theirs: string }>, shared: number,
 *   days: Array<{ number: number, date: string, mine: object, theirs: object }> }}
 *   each side of a day: { exists, dayId, title, stops: [{ id, time, name, category, cost, inBoth }] }
 */
export function buildComparison(mine, theirs, money = {}) {
  const sides = [mine, theirs].map((trip) => {
    const days = dayRows(trip);
    const activities = days.flatMap((day) => list(day.activities));
    return { trip, days, activities, names: activities.map(namesOf) };
  });
  const [a, b] = sides;
  const numbers = [...new Set(sides.flatMap((side) => side.days.map((day) => Number(day.day_number) || 0)))].sort((x, y) => x - y);
  const side = (own, other, number) => {
    const day = own.days.find((row) => (Number(row.day_number) || 0) === number) ?? null;
    return {
      exists: day !== null, dayId: text(day?.id), title: text(day?.title),
      stops: list(day?.activities).map((activity) => stopOf(activity, own.trip, matches(namesOf(activity), other.names))),
    };
  };
  const days = numbers.map((number) => ({
    number,
    date: text(sides.map((s) => s.days.find((row) => (Number(row.day_number) || 0) === number)?.date).find(Boolean)),
    mine: side(a, b, number),
    theirs: side(b, a, number),
  }));
  const shared = b.activities.filter((activity) => matches(namesOf(activity), a.names)).length;
  const row = (label, value) => ({ label, mine: value(a), theirs: theirs ? value(b) : '' });
  return {
    summary: [
      row('Days', (s) => String(s.days.length)),
      row('Stops', (s) => String(s.activities.length)),
      row('Stops per day', (s) => perDay(s.activities.length, s.days.length)),
      row('Estimated cost', (s) => costOf(s.trip, s.activities, money) || (sumCosts(s.activities, tripCurrencyCode(s.trip)).total ? '' : 'No costs listed')),
    ],
    shared,
    days,
  };
}

/** The fields addActivityToDay() takes, copied from a stop of the Trippy plan. */
export function activityCopy(activity, trip) {
  return {
    timeSlot: activity.time_slot, startTime: activity.start_time, title: activity.title, description: activity.description,
    venueName: activity.venue_name, venueAddress: activity.venue_address, placeId: activity.place_id, category: activity.category,
    durationMinutes: activity.duration_minutes, costAmount: activity.cost_amount,
    costCurrency: text(activity.cost_currency) || tripCurrencyCode(trip),
    latitude: activity.latitude, longitude: activity.longitude, tips: activity.tips,
  };
}
