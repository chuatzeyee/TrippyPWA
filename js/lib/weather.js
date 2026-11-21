// Weather text and typical ranges (blueprint 2.1, 5.4). The values are the seasonal guess stored with
// each day when a plan was made, in Celsius: typical weather, and every label says so. Pure.
// weatherLabel and weatherText print exactly what the trip page's private helpers print today when the
// unit is Celsius; js/lib/weather.test.js pins the strings. Owner: F1.
import { formatTempRange, isTemperature } from './locale.js';

const WEATHER_LABELS = new Map([
  ['sunny', 'Sunny'], ['clear', 'Clear'], ['partly cloudy', 'Pt. Cloudy'], ['partly sunny', 'Pt. Sunny'],
  ['cloudy', 'Cloudy'], ['overcast', 'Overcast'], ['rainy', 'Rain'], ['rain', 'Rain'], ['showers', 'Showers'],
  ['stormy', 'Storm'], ['thunderstorm', 'Storm'], ['snowy', 'Snow'], ['snow', 'Snow'],
  ['foggy', 'Fog'], ['fog', 'Fog'], ['windy', 'Windy'],
]);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MS = 86400000;
const NO_DATE_SEASON = 'typical for the season';

/**
 * @param {*} condition the stored condition ("sunny", "Partly Cloudy")
 * @returns {string} the normalised label ("Sunny", "Pt. Cloudy"), '' when unknown
 */
export function weatherLabel(condition) {
  if (typeof condition !== 'string') return '';
  return WEATHER_LABELS.get(condition.toLowerCase().trim()) ?? '';
}

/**
 * One line for a day: "12 to 18° Sunny" in Celsius, "54 to 64°F Sunny" in Fahrenheit, using only the
 * values that are there. No temperature gives no text, with or without a condition.
 * @param {*} w a day's stored weather: { lowC, highC, condition }
 * @returns {string}
 */
export function weatherText(w) {
  if (!w || typeof w !== 'object') return '';
  const range = formatTempRange(w.lowC, w.highC, { celsiusLetter: false });
  if (!range) return '';
  const label = weatherLabel(w.condition);
  return label ? `${range} ${label}` : range;
}

/** @returns {number|null} midnight UTC of an ISO date ("2027-02-20", with or without a time), else null */
function dayStamp(iso) {
  const match = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(iso) : null;
  if (!match) return null;
  const [year, month, date] = match.slice(1).map(Number);
  const stamp = Date.UTC(year, month - 1, date);
  const back = new Date(stamp);
  return back.getUTCMonth() === month - 1 && back.getUTCDate() === date ? stamp : null;
}

/** The date of one day: its own, else counted from the start date by its number (or its place in the list). */
function dateOfDay(day, index, startStamp) {
  const stored = dayStamp(day.date);
  if (stored !== null) return stored;
  if (startStamp === null) return null;
  const number = Number.isInteger(day.day_number) && day.day_number >= 1 ? day.day_number : index + 1;
  return startStamp + (number - 1) * DAY_MS;
}

/** "typical for late February" from the middle of the dates given. */
function seasonText(stamps) {
  if (!stamps.length) return NO_DATE_SEASON;
  const middle = new Date(Math.floor((Math.min(...stamps) + Math.max(...stamps)) / 2));
  const date = middle.getUTCDate();
  const part = date <= 10 ? 'early' : date <= 20 ? 'mid' : 'late';
  return `typical for ${part} ${MONTHS[middle.getUTCMonth()]}`;
}

/** The label that most days carry; the one seen first when two are level; '' when there is none. */
function commonLabel(labels) {
  const counts = labels.reduce((map, label) => new Map(map).set(label, (map.get(label) ?? 0) + 1), new Map());
  return [...counts].reduce((best, [label, count]) => (count > best.count ? { label, count } : best), { label: '', count: 0 }).label;
}

/**
 * The typical weather over a set of days: the lowest low, the highest high, the most common known
 * condition and a season line. Only days that carry a temperature count.
 * @param {Array<{ day_number?: number, date?: string, weather?: * }>} days itinerary days
 * @param {string} [startDate] the plan's first day, used when a day has no date of its own
 * @returns {{ lowC: number, highC: number, range: string, condition: string, season: string }|null}
 *   null when no day carries a temperature. `range` follows the temperature pref; lowC and highC stay Celsius.
 */
export function typicalWeather(days, startDate) {
  if (!Array.isArray(days)) return null;
  const startStamp = dayStamp(startDate);
  const withWeather = days
    .map((day, index) => ({ day, index, w: day?.weather }))
    .filter(({ w }) => w && typeof w === 'object' && (isTemperature(w.lowC) || isTemperature(w.highC)));
  if (!withWeather.length) return null;
  const lows = withWeather.filter(({ w }) => isTemperature(w.lowC)).map(({ w }) => Number(w.lowC));
  const highs = withWeather.filter(({ w }) => isTemperature(w.highC)).map(({ w }) => Number(w.highC));
  const lowC = Math.min(...(lows.length ? lows : highs));
  const highC = Math.max(...(highs.length ? highs : lows));
  const stamps = withWeather.map(({ day, index }) => dateOfDay(day, index, startStamp)).filter((stamp) => stamp !== null);
  return {
    lowC,
    highC,
    range: formatTempRange(lowC, highC),
    condition: commonLabel(withWeather.map(({ w }) => weatherLabel(w.condition)).filter(Boolean)),
    season: seasonText(stamps),
  };
}
