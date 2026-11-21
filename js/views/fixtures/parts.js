// Building blocks for the model fixtures. Everything here is invented: a sample account ("Sam", at home
// in Lisbon) on a fixed day. Place names, coordinates and outline photos are the public catalogue's.
// Steward: F0.

export const NOW_ISO = '2027-03-10T09:10:00+00:00';
export const TODAY = '2027-03-10';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MS = 86400000;
const utc = (iso) => new Date(`${iso}T00:00:00Z`);

export const addDays = (iso, days) => new Date(utc(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / DAY_MS);
/** "Wed 10 Mar" */
export const dayText = (iso) => `${WEEKDAYS[utc(iso).getUTCDay()]} ${utc(iso).getUTCDate()} ${MONTHS[utc(iso).getUTCMonth()]}`;
/** "Wed 10 Mar 2027" */
export const dayYearText = (iso) => `${dayText(iso)} ${iso.slice(0, 4)}`;
/** "March 2027" from "2027-03" */
export const monthLabel = (key) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
/** "4 to 13 Mar 2027", "27 Feb to 8 Mar 2027" */
export function rangeText(start, end) {
  if (!start) return 'No dates yet';
  const a = utc(start);
  const b = utc(end || start);
  const tail = `${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  if (!end || start === end) return tail;
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  return sameMonth ? `${a.getUTCDate()} to ${tail}` : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} to ${tail}`;
}
export const grouped = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// --- Money ----------------------------------------------------------------------------------------

const SYMBOLS = { EUR: '€', JPY: '¥', GBP: '£', ZAR: 'R' };
export const money = (amount, code) => ({ amount, code, text: SYMBOLS[code] ? `${SYMBOLS[code]}${grouped(amount)}` : `${code} ${grouped(amount)}` });
export const cost = ({ local = null, home = null, homeFirst = home !== null, excluded = 0, budget = null, budgetHome = null } = {}) => (
  { basis: 'perPerson', local, home, homeFirst, excluded, budget, budgetHome }
);
export const NO_COST = cost();

// --- Places and covers --------------------------------------------------------------------------

const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/thumb';
const place = (name, country, flag, lat, lng, timezone, file) => ({ name, country, flag, lat, lng, timezone, file });

export const PLACES = {
  lisbon: place('Lisbon', 'Portugal', 'pt', 38.7223, -9.1393, 'Europe/Lisbon', 'f/f2/Lisboa_-_Portugal_%2852597836992%29.jpg'),
  porto: place('Porto', 'Portugal', 'pt', 41.1579, -8.6291, 'Europe/Lisbon', 'e/e5/Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG'),
  kyoto: place('Kyoto', 'Japan', 'jp', 35.0116, 135.7681, 'Asia/Tokyo', '3/3c/Kiyomizu.jpg'),
  seville: place('Seville', 'Spain', 'es', 37.3891, -5.9845, 'Europe/Madrid', '2/2b/Sevilla_Cathedral_-_Southeast.jpg'),
  marrakech: place('Marrakech', 'Morocco', 'ma', 31.6295, -7.9811, 'Africa/Casablanca', '9/9c/Pavillon_Menarag%C3%A4rten.jpg'),
  vancouver: place('Vancouver', 'Canada', 'ca', 49.2827, -123.1207, 'America/Vancouver', '5/57/Concord_Pacific_Master_Plan_Area.jpg'),
  buenosAires: place('Buenos Aires', 'Argentina', 'ar', -34.6037, -58.3816, 'America/Argentina/Buenos_Aires', '1/1e/Puerto_Madero%2C_Buenos_Aires_%2840689219792%29_%28cropped%29.jpg'),
  rome: place('Rome', 'Italy', 'it', 41.9028, 12.4964, 'Europe/Rome', '7/7e/Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg'),
  florence: place('Florence', 'Italy', 'it', 43.7696, 11.2558, 'Europe/Rome', 'd/d2/FirenzeDec092023_01.jpg'),
  copenhagen: place('Copenhagen', 'Denmark', 'dk', 55.6761, 12.5683, 'Europe/Copenhagen', '1/15/2018_-_Christiansborg_from_the_Marble_Bridge.jpg'),
  capeTown: place('Cape Town', 'South Africa', 'za', -33.9249, 18.4241, 'Africa/Johannesburg', '8/8d/Camps_bay_%2853460319478%29_%28cropped%29.jpg'),
  lima: place('Lima', 'Peru', 'pe', -12.0464, -77.0428, 'America/Lima', 'b/bf/Lima_City_Hall.jpg'),
  athens: place('Athens', 'Greece', 'gr', 37.9838, 23.7275, 'Europe/Athens', '7/74/Monastiraki_Square_and_Acropolis_in_Athens_%2844149181684%29.jpg'),
  edinburgh: place('Edinburgh', 'UK', 'gb', 55.9533, -3.1883, 'Europe/London', '1/1a/Skyline_of_Edinburgh.jpg'),
  vienna: place('Vienna', 'Austria', 'at', 48.2082, 16.3738, 'Europe/Vienna', '5/5b/Schoenbrunn_philharmoniker_2012.jpg'),
  budapest: place('Budapest', 'Hungary', 'hu', 47.4979, 19.0402, 'Europe/Budapest', '5/53/View_from_Gell%C3%A9rt_Hill_to_the_Danube%2C_Hungary_-_Budapest_%2828493220635%29.jpg'),
  dublin: place('Dublin', 'Ireland', 'ie', 53.3498, -6.2603, 'Europe/Dublin', '9/92/Dublin_-_aerial_-_2025-07-07_01.jpg'),
  istanbul: place('Istanbul', 'Turkey', 'tr', 41.0082, 28.9784, 'Europe/Istanbul', 'c/cb/Historical_peninsula_and_modern_skyline_of_Istanbul.jpg'),
};
/** A place the catalogue does not know: no country, no flag, no coordinates. */
export const CUSTOM_PLACE = { name: 'Sintra hills', country: '', flag: '', lat: null, lng: null, timezone: null };

/** What a model carries for a place (the photo file stays in the fixture helpers). */
export const placeOf = ({ name, country, flag, lat, lng, timezone }) => ({ name, country, flag, lat, lng, timezone });

const thumb = (file, width) => `${COMMONS}/${file}/${width}px-${file.split('/').pop()}`;
/** A catalogue photo as a legacy cover: wider renders offered, the 250 px original as the fallback. */
export const legacyCover = (from) => ({
  kind: 'legacy',
  src: thumb(from.file, 500),
  srcset: [500, 960, 1280].map((w) => `${thumb(from.file, w)} ${w}w`).join(', '),
  fallbackSrc: thumb(from.file, 250),
  focusY: 50,
  credit: { chip: 'Wikimedia Commons', full: 'Photo: Wikimedia Commons', link: `https://commons.wikimedia.org/wiki/File:${from.file.split('/').pop()}` },
});
/** A picked cover with two stored copies and a full credit. The host is a placeholder: nothing loads. */
export const v2Cover = (slug, creator) => ({
  kind: 'v2',
  src: `https://photos.example.test/covers/${slug}-1280.jpg`,
  srcset: `https://photos.example.test/covers/${slug}-1280.jpg 1280w, https://photos.example.test/covers/${slug}-2400.jpg 2400w`,
  fallbackSrc: '',
  focusY: 38,
  credit: { chip: 'Pexels', full: `Photo: ${creator}, Pexels`, link: `https://photos.example.test/credit/${slug}` },
});
export const NO_COVER = { kind: 'none', src: '', srcset: '', fallbackSrc: '', focusY: 50, credit: null };
export const creditOf = (cover) => (cover.credit ? { label: cover.credit.chip, full: cover.credit.full, link: cover.credit.link } : null);
export const uniqueCredits = (covers) => {
  const seen = new Map();
  for (const credit of covers.map(creditOf)) if (credit && !seen.has(credit.link)) seen.set(credit.link, credit);
  return [...seen.values()];
};

// --- Weather, stops, routes ---------------------------------------------------------------------

export const weather = (lowC, highC, condition, season) => ({ lowC, highC, range: `${lowC} to ${highC}°C`, condition, season });
export const stop = (time, title, venue = null) => ({ time, title, venue });
const end = (code, label, note = '') => ({ code, label, note });
export const route = (kind, mode, from, to, detail, over = {}) => ({
  kind, mode, from: end(...from), to: end(...to), detail, booked: false, times: null, ...over,
});

// --- Readiness ------------------------------------------------------------------------------------

// The rows of js/lib/readiness.js (blueprint 7.3). Two things vary by row there, so a fixture row says
// them itself: an open stay with several options to choose from offers COMPARE, and a part-booked travel
// or stay row ("1 of 3 stays booked") is PART_BOOKED: no tick key, because a tick cannot settle it.
const AREAS = {
  flights: { area: 'travel', target: 'flights', label: 'Flights', actionLabel: 'See flights', tickKey: 'flights' },
  transport: { area: 'travel', target: 'transport', label: 'Transport', actionLabel: 'See transport', tickKey: 'transport' },
  stay: { area: 'stay', target: 'accommodation', label: 'Stay', actionLabel: 'See stays', tickKey: 'accommodation' },
  entry: { area: 'entry', target: 'entry', label: 'Entry requirements', actionLabel: 'See the details', tickKey: null },
  reservations: { area: 'reservations', target: 'checklist', label: 'Reservations', actionLabel: 'Open the checklist', tickKey: 'reservations' },
};
export const COMPARE = { actionLabel: 'Compare stays' };
export const PART_BOOKED = { tickKey: null };
/** One readiness row. `kind` is flights, transport, stay, entry or reservations. */
export const ready = (kind, state, status, detail, over = {}) => ({ ...AREAS[kind], state, status, detail, source: 'data', due: null, ...over });
export function readinessOf(items, { collapsed = false, perDevice = true } = {}) {
  const count = (state) => items.filter((item) => item.state === state).length;
  const done = count('done');
  return {
    items, done, total: items.length, todo: count('todo'), pending: count('checking'),
    headline: done === items.length ? 'Ready' : `${done} of ${items.length} ready`, perDevice, collapsed,
  };
}

// --- Trip cards -----------------------------------------------------------------------------------

const phaseFor = (start, finish) => {
  if (!start) return 'undated';
  if (TODAY < start) return 'upcoming';
  return TODAY > (finish || start) ? 'past' : 'live';
};

/** A TripCardModel. Dates decide the phase against TODAY unless `over.phase` says otherwise. */
export function card(id, title, places, start, finish, over = {}) {
  const { itineraryDays: planned, ...rest } = over;
  const span = start ? daysBetween(start, finish || start) + 1 : 0;
  const itineraryDays = planned ?? span;
  const dayCount = span || itineraryDays;
  const phase = rest.phase ?? phaseFor(start, finish);
  const href = `#/trip/${encodeURIComponent(id)}`;
  const live = phase === 'live';
  const flags = [...new Set(places.map((p) => p.flag).filter((flag) => /^[a-z]{2}$/.test(flag)))];
  return {
    id, title, href, wholeHref: `${href}?today=0`, todayHref: live ? `${href}?today=1` : null, phase,
    dates: { start, end: finish, text: rangeText(start, finish), dayCount, nights: Math.max(0, dayCount - 1), itineraryDays },
    daysToGo: phase === 'upcoming' ? daysBetween(TODAY, start) : null,
    dayNumber: live ? daysBetween(start, TODAY) + 1 : null,
    daysLeft: live ? daysBetween(TODAY, finish || start) : null,
    places: places.map(placeOf), flags, travellers: 2,
    cover: places[0]?.file ? legacyCover(places[0]) : NO_COVER, cost: NO_COST,
    shared: false, role: null, imported: false, savedOffline: false,
    readiness: null, weather: null, briefingPending: false, generation: null,
    monthKey: start ? start.slice(0, 7) : '',
    ...rest,
  };
}
