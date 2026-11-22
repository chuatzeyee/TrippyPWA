// The small plan on the About page: pick a place and a number of days, see the shape of a plan.
// The data is written by hand for the page and ships with it: nothing is asked of the planner or of
// any server. Pure: data in, an object or a string out. The behaviour is in js/site/about/mount.js.

import { formatClock } from '../../lib/locale.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

export const MIN_DAYS = 2;
export const MAX_DAYS = 4;
export const DEFAULT_DAYS = 3;

const stop = (time, name, cost = 0) => Object.freeze({ time, name, cost });
const day = (title, condition, stops) => Object.freeze({ title, condition, stops: Object.freeze(stops) });

/**
 * The sample places, in English. A translation passes its own list of the same shape to the builders.
 * cost is per person, in the place's currency; lowC and highC are typical for the month named.
 */
export const SKETCH_PLACES = Object.freeze([
  Object.freeze({
    id: 'kyoto', name: 'Kyoto', month: 'April', currency: 'JPY', lowC: 9, highC: 19,
    days: Object.freeze([
      day('Higashiyama on foot', 'Partly cloudy', [
        stop('09:00', 'Kiyomizu-dera', 500),
        stop('10:45', 'Sannenzaka and Ninenzaka lanes'),
        stop('12:30', 'Lunch near Yasaka Shrine', 1500),
        stop('14:30', 'Kennin-ji', 800),
        stop('18:30', 'Dinner in Pontocho', 4000),
      ]),
      day('Fushimi and the market', 'Sunny', [
        stop('08:00', 'Fushimi Inari Taisha'),
        stop('12:00', 'Lunch at Nishiki Market', 2000),
        stop('14:30', 'Nijo Castle', 1300),
        stop('18:30', 'Dinner near Karasuma', 3000),
      ]),
      day('Arashiyama', 'Showers', [
        stop('08:30', 'Bamboo grove'),
        stop('09:30', 'Tenryu-ji garden', 500),
        stop('12:00', 'Tofu lunch by the river', 2500),
        stop('14:00', 'Okochi Sanso villa', 1000),
      ]),
      day('The north of the city', 'Partly cloudy', [
        stop('09:00', 'Kinkaku-ji', 500),
        stop('10:30', 'Ryoan-ji rock garden', 600),
        stop('12:30', 'Soba lunch near Kitano', 1200),
        stop('14:30', 'Daitoku-ji temple gardens', 800),
        stop('18:00', 'Dinner back in Gion', 3500),
      ]),
    ]),
  }),
  Object.freeze({
    id: 'lisbon', name: 'Lisbon', month: 'May', currency: 'EUR', lowC: 14, highC: 23,
    days: Object.freeze([
      day('Alfama and the castle', 'Sunny', [
        stop('09:30', 'Castelo de São Jorge', 15),
        stop('11:30', 'Miradouro de Santa Luzia'),
        stop('13:00', 'Lunch in Alfama', 15),
        stop('15:00', 'Lisbon Cathedral', 5),
        stop('20:00', 'Dinner with fado', 35),
      ]),
      day('Belém', 'Sunny', [
        stop('09:30', 'Jerónimos Monastery', 12),
        stop('11:30', 'Custard tarts at Pastéis de Belém', 5),
        stop('13:00', 'Lunch by the river', 18),
        stop('15:00', 'MAAT', 11),
      ]),
      day('Baixa and Chiado', 'Partly cloudy', [
        stop('10:00', 'Praça do Comércio'),
        stop('11:00', 'Carmo Convent', 7),
        stop('13:00', 'Lunch at Time Out Market', 18),
        stop('15:30', 'LX Factory'),
        stop('19:30', 'Dinner in Bairro Alto', 25),
      ]),
      day('Day trip to Sintra', 'Cloudy', [
        stop('09:00', 'Train from Rossio', 5),
        stop('10:30', 'Pena Palace', 20),
        stop('13:00', 'Lunch in the old town', 15),
        stop('14:30', 'Quinta da Regaleira', 15),
      ]),
    ]),
  }),
  Object.freeze({
    id: 'penang', name: 'Penang', month: 'February', currency: 'MYR', lowC: 24, highC: 32,
    days: Object.freeze([
      day('George Town on foot', 'Sunny', [
        stop('09:00', 'Khoo Kongsi clan house', 15),
        stop('10:30', 'Street art around Armenian Street'),
        stop('12:30', 'Char kway teow on Kimberley Street', 12),
        stop('14:30', 'Cheong Fatt Tze, the Blue Mansion', 25),
        stop('19:00', 'Hawker dinner at Gurney Drive', 25),
      ]),
      day('Penang Hill and Kek Lok Si', 'Partly cloudy', [
        stop('08:30', 'Penang Hill funicular', 30),
        stop('12:00', 'Assam laksa in Air Itam', 10),
        stop('14:00', 'Kek Lok Si temple', 16),
        stop('19:00', 'Dinner at New Lane hawker street', 25),
      ]),
      day('Jetties and old houses', 'Showers', [
        stop('09:00', 'Chew Jetty'),
        stop('10:30', 'Pinang Peranakan Mansion', 25),
        stop('12:30', 'Nasi kandar lunch', 15),
        stop('15:00', 'Fort Cornwallis', 20),
      ]),
      day('The north coast', 'Sunny', [
        stop('09:00', 'Penang National Park trail'),
        stop('12:30', 'Lunch in Teluk Bahang', 20),
        stop('14:30', 'Tropical Spice Garden', 30),
        stop('19:00', 'Batu Ferringhi night market', 30),
      ]),
    ]),
  }),
]);

/** The words the sketch prints, in English. A translation passes its own. */
export const SKETCH_WORDS = Object.freeze({
  title: '{place}, {days} days in {month}',
  day: 'Day {n}',
  stops: 'Stops',
  cost: 'Activities estimated',
  costBasis: 'per person',
  weather: 'Typical weather',
  /** The temperature range; holds {low} and {high}. A translation without it gets this one. */
  range: '{low} to {high}°C',
  free: 'Free',
});

const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));

/** @returns {number} a whole number of days inside the range, the default for anything else */
export function clampDays(value) {
  const days = Number.parseInt(value, 10);
  if (!Number.isFinite(days)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, days));
}

/** "09:00" in the clock the reader chose in Settings: "9:00 AM" by default, "09:00" for 24-hour. */
export const clockText = (time) => formatClock(time);

/** "JPY 14,100". */
export function moneyText(amount, currency) {
  return `${currency} ${Math.round(Number(amount) || 0).toLocaleString('en-US')}`;
}

/**
 * The plan for a choice: the first `days` days of a place, with the sums a plan page shows.
 * @param {{ place?: string, days?: number|string }} [choice] an unknown place gives the first one
 * @param {typeof SKETCH_PLACES} [places]
 * @returns {{ id: string, name: string, month: string, currency: string, lowC: number, highC: number,
 *   days: Array<{ n: number, title: string, condition: string, stops: Array<{ time: string, name: string, cost: number }>, cost: number }>,
 *   stops: number, cost: number }}
 */
export function sketchPlan({ place, days } = {}, places = SKETCH_PLACES) {
  const source = places.find((entry) => entry.id === place) ?? places[0];
  const count = Math.min(clampDays(days), source.days.length);
  const planned = source.days.slice(0, count).map((entry, index) => ({
    n: index + 1,
    title: entry.title,
    condition: entry.condition,
    stops: entry.stops.map((item) => ({ ...item })),
    cost: entry.stops.reduce((sum, item) => sum + item.cost, 0),
  }));
  return {
    id: source.id, name: source.name, month: source.month, currency: source.currency, lowC: source.lowC, highC: source.highC,
    days: planned,
    stops: planned.reduce((sum, entry) => sum + entry.stops.length, 0),
    cost: planned.reduce((sum, entry) => sum + entry.cost, 0),
  };
}

/**
 * The plan as markup: a heading with the sums, a route line with one segment per day, then the days.
 * @param {ReturnType<typeof sketchPlan>} plan
 * @param {typeof SKETCH_WORDS} [words]
 * @returns {string}
 */
export function sketchHtml(plan, words = SKETCH_WORDS) {
  const range = fill(words.range ?? SKETCH_WORDS.range, { low: plan.lowC, high: plan.highC });
  const stopHtml = (item) => `<li class="about-stop"><span class="about-stop-time">${esc(clockText(item.time))}</span><span class="about-stop-name">${esc(item.name)}</span><span class="about-stop-cost">${esc(item.cost > 0 ? moneyText(item.cost, plan.currency) : words.free)}</span></li>`;
  const dayHtml = (entry, index) => `<li class="about-day" style="--about-i:${index}">
      <div class="about-day-head">
        <p class="about-day-n">${esc(fill(words.day, { n: entry.n }))}</p>
        <h4 class="about-day-title">${esc(entry.title)}</h4>
        <p class="about-day-meta">${esc(words.weather)}: ${esc(range)}, ${esc(entry.condition.toLowerCase())}</p>
        <p class="about-day-meta">${esc(words.cost)}: <span class="about-figure">${esc(moneyText(entry.cost, plan.currency))}</span></p>
      </div>
      <ol class="about-stops">${entry.stops.map(stopHtml).join('')}</ol>
    </li>`;
  const route = plan.days.map((entry, index) => `<span class="about-route-leg" style="--about-i:${index}"></span>`).join('');
  return `<div class="about-sketch-head">
      <h3 class="about-sketch-title">${esc(fill(words.title, { place: plan.name, days: plan.days.length, month: plan.month }))}</h3>
      <dl class="about-sketch-facts">
        <div><dt>${esc(words.stops)}</dt><dd>${plan.stops}</dd></div>
        <div><dt>${esc(words.cost)}</dt><dd>${esc(moneyText(plan.cost, plan.currency))} <small>${esc(words.costBasis)}</small></dd></div>
        <div><dt>${esc(words.weather)}</dt><dd>${esc(range)}</dd></div>
      </dl>
    </div>
    <div class="about-route" aria-hidden="true"><span class="about-route-end"></span>${route}</div>
    <ol class="about-days">${plan.days.map(dayHtml).join('')}</ol>`;
}
