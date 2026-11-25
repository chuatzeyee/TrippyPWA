// The fine-tune page of a trip (#/trip/<id>/tune): the model. Pure: a trip row in, an object out.
// The markup is js/components/trip-tune-html.js, the controller js/components/trip-tune.js.
//
// The look follows the plan sketch of the About page: each day on the left (title, typical weather,
// what its stops cost), its stops on the right (time, name, price), with Swap and Remove on each.
import { weatherText } from './weather.js';

/** The filters of the stop list. */
export const TUNE_FILTERS = Object.freeze([
  Object.freeze({ key: 'all', label: 'All stops' }),
  Object.freeze({ key: 'paid', label: 'Paid' }),
  Object.freeze({ key: 'free', label: 'Free' }),
]);

const list = (value) => (Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : []);
const text = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');
const amountOf = (activity) => {
  const value = Number(activity?.cost_amount);
  return Number.isFinite(value) && value > 0 ? value : 0;
};
const minutes = (time) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(text(time));
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.POSITIVE_INFINITY;
};

/** The currency a trip is priced in: the first destination's, else the trip's budget currency. */
export function tripCurrency(trip) {
  const ws = trip?.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  return text(dest?.currencyCode || trip?.budget_currency || 'USD').toUpperCase();
}

/**
 * @param {object} trip  a trip row with itinerary_days and their activities
 * @param {{ filter?: string }} [opts]  'all' (default), 'paid' (a price above zero) or 'free'
 * @returns {{ title: string, currency: string, filter: string,
 *   counts: { all: number, paid: number, free: number }, cost: number,
 *   days: Array<{ id: string, n: number, title: string, weather: string, cost: number,
 *     stops: Array<{ id: string, time: string, name: string, venue: string, cost: number, paid: boolean, currency: string }>,
 *     hidden: number }> }}
 */
export function tuneModel(trip, { filter = 'all' } = {}) {
  const wanted = TUNE_FILTERS.some((one) => one.key === filter) ? filter : 'all';
  const currency = tripCurrency(trip);
  const counts = { all: 0, paid: 0, free: 0 };
  const days = list(trip?.itinerary_days)
    .slice()
    .sort((a, b) => (Number(a.day_number) || 0) - (Number(b.day_number) || 0))
    .map((day, index) => {
      const stops = list(day.activities)
        .slice()
        .sort((a, b) => minutes(a.start_time) - minutes(b.start_time))
        .map((activity) => {
          const cost = amountOf(activity);
          const title = text(activity.title);
          const venue = text(activity.venue_name);
          return {
            id: text(activity.id),
            time: text(activity.start_time),
            name: title || venue || 'Stop',
            venue: venue && venue !== title ? venue : '',
            cost,
            paid: cost > 0,
            currency: text(activity.cost_currency).toUpperCase() || currency,
          };
        });
      stops.forEach((stop) => { counts.all += 1; counts[stop.paid ? 'paid' : 'free'] += 1; });
      const shown = stops.filter((stop) => wanted === 'all' || (wanted === 'paid') === stop.paid);
      return {
        id: text(day.id),
        n: Number(day.day_number) || index + 1,
        title: text(day.title),
        weather: weatherText(day.weather),
        cost: stops.reduce((sum, stop) => sum + stop.cost, 0),
        stops: shown,
        hidden: stops.length - shown.length,
      };
    });
  return {
    title: text(trip?.title) || 'Your trip',
    currency,
    filter: wanted,
    counts,
    cost: days.reduce((sum, day) => sum + day.cost, 0),
    days,
  };
}
