// What the plans add up to (blueprint 2.3): the numbers of the stats strip and the passport, the
// pins of the world map and the short hops from home. Also the date wording both model builders
// share. Pure: `now` is passed in, and nothing here reads the clock, storage or the network.
//
// Everything is counted from plans, so every word a view puts next to these numbers is "planned".
// A plan that is still being planned, or whose planning stopped, is never counted.
import { isoToUtc } from './trip-extras.js';
import { zonedToday } from './trip-status.js';
import { kmBetween } from './geo.js';
import { alpha3 } from './country-codes.js';
import { moneyText } from './money.js';
import { listCover } from './cover-model.js';

const DAY_MS = 86400000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FLAG = /^[a-z]{2}$/;
const HOP_MAX_KM = 1000;
const HOP_MAX = 7;
/** Most current first. A plan without dates is still ahead, so its pin reads as upcoming. */
const RANK = { live: 0, upcoming: 1, past: 2, undated: 3 };

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isPlan = (card) => card.phase !== 'generating' && card.phase !== 'failed';
const sameName = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const best = (list, score) => list.reduce((top, entry) => (top === null || score(entry) > score(top) ? entry : top), null);

// --- Date wording -----------------------------------------------------------------------------------

/** The date `days` after a 'YYYY-MM-DD' date. */
export const addDays = (iso, days) => new Date(isoToUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);

/** "March 2027" from "2027-03" (or from a whole date); "Mar 2027" when `brief`. */
export function monthLabel(key, brief = false) {
  const name = MONTHS[Number(String(key).slice(5, 7)) - 1] ?? '';
  return `${brief ? name.slice(0, 3) : name} ${String(key).slice(0, 4)}`.trim();
}

/** "Sat 21 Nov", or "Sat 21 Nov 2026" with the year; '' for anything that is not a real date. */
export function dayText(iso, withYear = false) {
  const time = isoToUtc(iso);
  if (time === null) return '';
  const date = new Date(time);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)}${withYear ? ` ${date.getUTCFullYear()}` : ''}`;
}

/** "4 to 13 Mar 2027", "27 Feb to 8 Mar 2027", "28 Dec 2026 to 3 Jan 2027", "8 Mar 2027", "No dates yet". */
export function dateRangeText(start, end) {
  if (isoToUtc(start) === null) return 'No dates yet';
  const part = (iso, month, year) => [Number(iso.slice(8, 10)), month ? monthLabel(iso, true).slice(0, 3) : '', year ? iso.slice(0, 4) : ''].filter(Boolean).join(' ');
  if (isoToUtc(end) === null || end === start) return part(start, true, true);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${part(start, start.slice(0, 7) !== end.slice(0, 7), !sameYear)} to ${part(end, true, true)}`;
}

// --- Statistics -------------------------------------------------------------------------------------

const monthAfter = (key) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1)).toISOString().slice(0, 7);

/** Every calendar day a dated plan covers, each day once however many plans share it. */
function calendarDays(plans) {
  return new Set(plans.filter((card) => card.dates.start).flatMap((card) => (
    Array.from({ length: card.dates.dayCount }, (_, i) => addDays(card.dates.start, i)))));
}

/** Every month from the first day to the last, also the ones with no plan in them. */
function monthsOf(days, thisMonth) {
  const keys = [...new Set([...days].map((day) => day.slice(0, 7)))].sort();
  const out = [];
  for (let key = keys[0]; key && key <= keys[keys.length - 1]; key = monthAfter(key)) {
    out.push({
      key, label: monthLabel(key), days: [...days].filter((day) => day.startsWith(key)).length,
      phase: key < thisMonth ? 'past' : key > thisMonth ? 'future' : 'now',
    });
  }
  return out;
}

// A country counts as past once any plan there is past, and as live while one is running: only a
// country that every plan still lies ahead of is upcoming (the passport's "coming up").
function countriesOf(plans, homeFlag) {
  const named = plans.flatMap((card) => card.places.filter((place) => place.country && FLAG.test(place.flag)).map((place) => ({ place, card })));
  return [...new Set(named.map(({ place }) => place.flag))].map((flag) => {
    const here = [...new Set(named.filter(({ place }) => place.flag === flag).map(({ card }) => card))];
    const has = (phase) => here.some((card) => card.phase === phase);
    return {
      flag, code3: alpha3(flag), country: named.find(({ place }) => place.flag === flag).place.country, trips: here.length,
      phase: has('live') ? 'live' : has('past') ? 'past' : 'upcoming',
      firstDate: here.map((card) => card.dates.start).filter(Boolean).sort()[0] ?? '',
      isHome: flag === String(homeFlag ?? '').toLowerCase(),
    };
  }).sort((a, b) => (a.firstDate || '9').localeCompare(b.firstDate || '9') || a.country.localeCompare(b.country));
}

// What a plan costs in the home currency: its converted figure, or its own when it is priced at home.
// There is a total only when a plan was counted into it: with no priced plan, or with none that
// converts, the total is not zero but unknown (null), and the plans left out are still counted.
function spendOf(plans, homeCurrency) {
  const code = String(homeCurrency?.code ?? '').toUpperCase();
  if (!code) return { spendHome: null, spendUnconverted: 0 };
  const figures = plans.filter((card) => card.cost.local)
    .map((card) => card.cost.home?.amount ?? (card.cost.local.code === code ? card.cost.local.amount : null));
  const amount = figures.reduce((sum, figure) => sum + (figure ?? 0), 0);
  const counted = figures.some((figure) => figure !== null) && Math.round(amount) > 0;
  return {
    spendHome: counted ? { amount, code, text: moneyText(amount, code, homeCurrency.symbol) } : null,
    spendUnconverted: figures.filter((figure) => figure === null).length,
  };
}

/**
 * @param {Array<import('../views/contract.js').TripCardModel>} cards
 * @param {{ homeFlag?: string, homePoint?: { lat: number, lng: number }|null, homeCurrency?: { code: string, symbol?: string }|null,
 *   now: Date|string|number, deviceZone?: string }} options   `now` decides which month is the current one
 * @returns {import('../views/contract.js').TravelStats} byCountry is in the order of each country's first
 *   plan (a country with no dated plan last); byMonth runs from the first month to the last without gaps
 */
export function travelStats(cards, { homeFlag, homePoint, homeCurrency, now, deviceZone } = {}) {
  const thisMonth = zonedToday(now, deviceZone, deviceZone).slice(0, 7);
  const plans = (Array.isArray(cards) ? cards : []).filter(isPlan);
  const dated = plans.filter((card) => card.dates.start);
  const places = plans.flatMap((card) => card.places);
  const placed = places.filter((place) => isNumber(place.lat) && isNumber(place.lng));
  const days = calendarDays(plans);
  const byCountry = countriesOf(plans, homeFlag);
  const most = best(byCountry, (entry) => entry.trips);
  const longest = best(dated, (card) => card.dates.dayCount);
  const north = best(placed, (place) => place.lat);
  const south = best(placed, (place) => -place.lat);
  const far = homePoint ? best(placed.filter((place) => Number.isFinite(kmBetween(homePoint, place))), (place) => kmBetween(homePoint, place)) : null;
  return {
    trips: plans.length,
    countries: byCountry.length,
    cities: new Set(places.map((place) => place.name.trim().toLowerCase())).size,
    daysPlanned: plans.reduce((sum, card) => sum + card.dates.itineraryDays, 0),
    calendarDays: days.size,
    ...spendOf(plans, homeCurrency),
    mostPlanned: most ? { country: most.country, flag: most.flag, trips: most.trips } : null,
    longest: longest ? { title: longest.title, days: longest.dates.dayCount } : null,
    byCountry,
    byMonth: monthsOf(days, thisMonth),
    extremes: {
      north: north ? { name: north.name, lat: north.lat } : null,
      south: south ? { name: south.name, lat: south.lat } : null,
      farthest: far ? { name: far.name, km: Math.round(kmBetween(homePoint, far)) } : null,
    },
    firstDate: dated.map((card) => card.dates.start).sort()[0] ?? null,
    lastDate: dated.map((card) => card.dates.end ?? card.dates.start).sort().pop() ?? null,
  };
}

// --- Map pins ---------------------------------------------------------------------------------------

// Most current first: a live plan, then the next departure, then the latest past plan.
const byCurrency = (a, b) => RANK[a.phase] - RANK[b.phase]
  || (a.phase === 'past' ? -1 : 1) * String(a.dates.start ?? '').localeCompare(String(b.dates.start ?? ''));

/**
 * One pin per place that has coordinates; plans that name the same place share it. The home pin
 * comes first and never holds a plan: a plan in the home city gets a pin of its own at the same spot.
 * The other pins follow with the most current place first (live, then upcoming, then past).
 * @param {Array<import('../views/contract.js').TripCardModel>} cards
 * @param {{ name: string, country?: string, lat: number, lng: number }|null} home   the home city, when it has coordinates
 * @returns {Array<import('../views/contract.js').MapPin>}
 */
export function mapPins(cards, home) {
  const spots = new Map();
  for (const card of (Array.isArray(cards) ? cards : []).filter(isPlan)) {
    for (const place of card.places.filter((entry) => isNumber(entry.lat) && isNumber(entry.lng))) {
      const key = `${place.name.trim().toLowerCase()}|${place.country.trim().toLowerCase()}`;
      const spot = spots.get(key) ?? { place, plans: [] };
      spots.set(key, { place: spot.place, plans: spot.plans.includes(card) ? spot.plans : [...spot.plans, card] });
    }
  }
  const ordered = [...spots.values()].map(({ place, plans }) => ({ place, sorted: [...plans].sort(byCurrency) }))
    .sort((a, b) => byCurrency(a.sorted[0], b.sorted[0]));
  const pins = ordered.map(({ place, sorted }) => {
    const [first] = sorted;
    return {
      at: [place.lat, place.lng], kind: first.phase === 'live' ? 'live' : first.phase === 'past' ? 'past' : 'up',
      place: place.name, country: place.country, label: sorted.length > 1 ? `${place.name}, ${sorted.length} plans` : place.name,
      tripIds: sorted.map((card) => card.id), count: sorted.length, href: first.href, todayHref: first.todayHref,
    };
  });
  if (!home || !isNumber(home.lat) || !isNumber(home.lng)) return pins;
  const homePin = {
    at: [home.lat, home.lng], kind: 'home', place: home.name, country: home.country ?? '', label: `${home.name}, home`,
    tripIds: [], count: 0, href: '', todayHref: null,
  };
  return [homePin, ...pins];
}

// --- Short hops -------------------------------------------------------------------------------------

/**
 * The catalogue places nearest to home: within 1,000 km in a straight line, at most seven, nearest
 * first, never home itself. The note says whether a plan already names the place. Travel mode and
 * door-to-door time are not in the data, so nothing here speaks of them.
 * @param {Array<import('../views/contract.js').TripCardModel>} cards
 * @param {{ home?: object|null, catalogue?: Array<object>|null, nomad?: boolean }} options
 *   home is the catalogue entry of the home city; with none, or for a full-time traveller, the list is empty
 * @returns {import('../views/contract.js').DashboardModel['hops']}
 */
export function shortHops(cards, { home, catalogue, nomad = false } = {}) {
  if (!home || nomad || !Array.isArray(catalogue)) return [];
  const plans = (Array.isArray(cards) ? cards : []).filter((card) => isPlan(card) && card.dates.start);
  return catalogue
    .filter((place) => place && place !== home && !sameName(place.name, home.name))
    .map((place) => ({ place, km: kmBetween(home, place) }))
    .filter((hop) => hop.km <= HOP_MAX_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, HOP_MAX)
    .map(({ place, km }) => {
      const latest = plans.filter((card) => card.places.some((entry) => sameName(entry.name, place.name))).map((card) => card.dates.start).sort().pop();
      return {
        name: place.name, country: place.country ?? '', flag: String(place.flag ?? '').toLowerCase(), km: Math.round(km),
        cover: listCover({ wizard_state: { destination: { image: place.image } } }),
        note: latest ? `Planned ${monthLabel(latest, true)}` : 'New for you',
      };
    });
}
