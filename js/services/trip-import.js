// Import a trip from a Trippy file (format: docs/trip-import-format.md).
// Pure: no DOM, no network, unit-tested in trip-import.test.js.
//
// 1. extractJson finds the trip data inside whatever was pasted: a plain file,
//    an AI chat reply with prose and ```json fences around it, or two replies
//    pasted together after the assistant was told to "continue".
// 2. lenientParse accepts // and /* */ comments, trailing commas and curly
//    quotes, and turns syntax errors into a line and column.
//    Both live in trip-import-json.js.
// 3. validateTripImport checks and sanitises the data into the
//    { wizardState, itinerary } shape that saveTripWithItinerary() persists.
//    Problems are collected rather than thrown: errors block the import,
//    warnings describe small automatic changes shown before saving.
// Unknown keys are dropped, URLs are http(s)-only, strings are length-capped.

import { safeUrl, isoToUtc } from '../lib/trip-extras.js';
import { DESTINATIONS } from '../wizard/destinations.js';
import { currencySymbolFor, currencyForCountry } from '../wizard/currency-map.js';
import { getCurrencyList } from '../data/user-prefs.js';
import { canConvert } from '../data/currencies.js';
import { extractJson, lenientParse, PARSE_MESSAGES } from './trip-import-json.js';

export { extractJson, lenientParse };

export const IMPORT_VERSION = 1;
export const IMPORT_LIMITS = {
  maxBytes: 1_000_000, maxDays: 60, maxDayNumber: 366, maxActivitiesPerDay: 40, maxText: 2000, maxBookingRef: 40,
};

// The largest value the database's integer columns (costs, durations, the
// daily budget, day numbers) can hold.
const MAX_INT = 2_147_483_647;

// Input-level problems. Each stops validation, so it is the only error shown.
export const IMPORT_MESSAGES = {
  empty: 'Paste your trip or choose a file first.',
  tooLarge: 'This is larger than 1 MB. Remove long descriptions or embedded images and try again.',
  ...PARSE_MESSAGES,
  notTrippy: 'This doesn\'t look like a Trippy trip. It needs a "trip" section and a "days" list.',
};

const newerVersion = (v) =>
  `This file was made for a newer version of Trippy (format ${v}). Update the app and try again.`;

const DAY_MS = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Keys each object may carry (aliases included; they are reported separately).
const KNOWN = Object.fromEntries(Object.entries({
  root: ['trippy', 'trip', 'days', 'flights', 'accommodation', 'bookingChecklist', 'savingsTips',
    'itinerary', 'hotels', 'hotel', 'stays', 'flight'],
  trip: ['title', 'subtitle', 'emoji', 'destination', 'startDate', 'endDate', 'travelers', 'dailyBudget'],
  destination: ['name', 'country', 'flag', 'currencyCode', 'currencySymbol', 'timezone', 'lat', 'lng', 'image', 'emoji'],
  day: ['dayNumber', 'date', 'title', 'theme', 'weather', 'activities', 'schedule', 'items', 'plan'],
  activity: ['title', 'name', 'timeSlot', 'startTime', 'description', 'venueName', 'venueAddress', 'category',
    'durationMinutes', 'costAmount', 'costCurrency', 'costNote', 'latitude', 'longitude', 'bookingUrl', 'tips',
    'gettingThere', 'transportMode', 'transportDuration', 'transportCost'],
  flights: ['outbound', 'inbound', 'return'],
  leg: ['route', 'airline', 'flightNumber', 'duration', 'priceRange', 'tips', 'depart', 'arrive', 'booked',
    'bookingRef', 'seats', 'baggage', 'manageUrl'],
  stay: ['name', 'area', 'type', 'city', 'priceRange', 'highlights', 'badge', 'checkIn', 'checkOut', 'booked', 'url',
    'bookingRef', 'address'],
  group: ['group', 'items'],
  item: ['label', 'by', 'day', 'note', 'url'],
  tip: ['icon', 'title', 'description', 'estimatedSaving'],
}).map(([k, v]) => [k, new Set(v)]));

const CURRENCY_WORDS = { YEN: 'JPY', RMB: 'CNY', YUAN: 'CNY', EURO: 'EUR', EUROS: 'EUR', NTD: 'TWD', BAHT: 'THB', WON: 'KRW' };

// ---- Small value helpers ---------------------------------------------------

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const has = (v) => v !== undefined && v !== null && v !== '';
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function str(v, max = IMPORT_LIMITS.maxText) {
  if (v === null || v === undefined || typeof v === 'object') return '';
  return String(v).trim().slice(0, max);
}

function int(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function bool(v) {
  return v === true || /^(true|yes|y|1)$/i.test(String(v ?? '').trim());
}

function coord(v, limit) {
  const n = Number(v);
  return has(v) && typeof v !== 'boolean' && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

function dayMonth(t, withYear = false) {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ''}`;
}

const weekdayDate = (t) => `${WEEKDAYS[new Date(t).getUTCDay()]} ${dayMonth(t)}`;
const utcToIso = (t) => new Date(t).toISOString().slice(0, 10);

// '2027-1-3', '2027/01/03' and '2027-01-03T10:00' all read as '2027-01-03'.
function normalizeDate(v) {
  if (typeof v !== 'string') return '';
  const m = /^\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(v);
  if (!m) return '';
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isoToUtc(iso) === null ? '' : iso;
}

// First number in a price string: "¥7,000" 7000, "S$1,700 for two" 1700,
// "€12.50" 12.5, "7.000" 7000, "1.234,50" 1234.5. Returns 0 when there is none.
function firstNumber(s) {
  const m = /\d[\d.,]*\d|\d/.exec(String(s));
  if (!m) return 0;
  let t = m[0];
  const dot = t.lastIndexOf('.');
  const comma = t.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) {
    const decimal = dot > comma ? '.' : ',';
    t = t.split(decimal === '.' ? ',' : '.').join('').replace(decimal, '.');
  } else if (dot >= 0 || comma >= 0) {
    const groups = t.split(dot >= 0 ? '.' : ',');
    const thousands = groups.slice(1).every(g => g.length === 3);
    t = thousands ? groups.join('') : `${groups.slice(0, -1).join('')}.${groups[groups.length - 1]}`;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function isTooLarge(s) {
  if (s.length > IMPORT_LIMITS.maxBytes) return true;
  if (s.length * 3 <= IMPORT_LIMITS.maxBytes) return false;
  return new TextEncoder().encode(s).length > IMPORT_LIMITS.maxBytes;
}

// ---- Currency --------------------------------------------------------------

let _intlCurrencies = null;

function isCurrencyCode(code) {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  if (canConvert(code) || getCurrencyList().some(c => c.code === code)) return true;
  if (_intlCurrencies === null) {
    try { _intlCurrencies = new Set(Intl.supportedValuesOf('currency')); } catch { _intlCurrencies = false; }
  }
  return _intlCurrencies ? _intlCurrencies.has(code) : true;
}

// The app's own symbols first (S$, A$, NZ$ rather than Intl's bare "$"), then Intl.
export function symbolForCurrency(code) {
  if (!code) return '$';
  const common = getCurrencyList().find(c => c.code === code);
  if (common) return common.symbol;
  const dest = DESTINATIONS.find(d => d.currencyCode === code && d.currencySymbol);
  return dest ? dest.currencySymbol : currencySymbolFor(code);
}

// A valid ISO 4217 code from user input ('jpy', 'yen'), or ''.
function currencyCode(v, ctx) {
  const raw = str(v, 12);
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, '');
  const code = CURRENCY_WORDS[letters] || letters;
  if (!isCurrencyCode(code)) return '';
  if (code !== letters) ctx.alias(raw, code);
  return code;
}

// ---- Validation --------------------------------------------------------------

function createContext() {
  const errors = [];
  const warnings = [];
  const ignored = new Set();
  const aliases = new Set();
  return {
    errors,
    warnings,
    ignored,
    error: (where, message) => { errors.push({ where, message }); },
    warn: (where, message) => { warnings.push({ where, message }); },
    alias: (from, to) => {
      const key = `${from}>${to}`;
      if (aliases.has(key)) return;
      aliases.add(key);
      warnings.push({ where: 'Trip', message: `We read "${from}" as "${to}".` });
    },
    unknown: (obj, known) => {
      for (const k of Object.keys(obj)) if (!known.has(k)) ignored.add(k.slice(0, 40));
    },
  };
}

// obj[key], or the first alias that is present (reported as a rename).
function pick(obj, key, aliases, ctx) {
  if (obj[key] !== undefined) return obj[key];
  const alias = aliases.find(a => obj[a] !== undefined);
  if (!alias) return undefined;
  ctx.alias(alias, key);
  return obj[alias];
}

function validFlag(v) {
  const f = str(v, 8).toLowerCase();
  return /^[a-z]{2}(-[a-z]{2,3})?$/.test(f) ? f : '';
}

function validTimezone(v) {
  const tz = str(v, 64);
  if (!tz) return '';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return '';
  }
}

// A curated destination (or a catalogue record the caller looked up) with the
// same name fills in whatever the file left out.
function findKnownDestination(name, flag, lookup) {
  const n = name.toLowerCase();
  const sameFlag = (d) => !flag || !d.flag || d.flag === flag;
  const curated = DESTINATIONS.find(d => d.name.toLowerCase() === n && sameFlag(d));
  if (curated) return curated;
  return lookup && String(lookup.name || '').toLowerCase() === n && sameFlag(lookup) ? lookup : null;
}

function resolveCurrency(d, known, flag, name, ctx) {
  const given = currencyCode(d.currencyCode, ctx);
  if (given) return { code: given, symbol: str(d.currencySymbol, 4) || symbolForCurrency(given) };
  if (has(d.currencyCode)) ctx.warn('Trip', `The currency "${str(d.currencyCode, 12)}" isn't a 3 letter currency code.`);
  if (known?.currencyCode) {
    ctx.warn('Trip', `No currency was given, so costs use ${known.currencyCode} from ${known.name}.`);
    return { code: known.currencyCode, symbol: known.currencySymbol || symbolForCurrency(known.currencyCode) };
  }
  const byFlag = flag ? currencyForCountry(flag.slice(0, 2)).code : '';
  if (byFlag && (byFlag !== 'USD' || ['us', 'ec'].includes(flag))) {
    ctx.warn('Trip', `No currency was given, so costs use ${byFlag} from ${name}.`);
    return { code: byFlag, symbol: symbolForCurrency(byFlag) };
  }
  ctx.warn('Trip', 'No currency was given, so costs are shown in USD.');
  return { code: 'USD', symbol: '$' };
}

function parseDestination(raw, emoji, lookup, ctx) {
  const d = typeof raw === 'string' ? { name: raw } : isObj(raw) ? raw : {};
  if (isObj(raw)) ctx.unknown(raw, KNOWN.destination);
  const name = str(d.name, 120);
  if (!name) {
    ctx.error('Trip', 'Add the main city as the destination, for example "Sapporo".');
    return { destination: null, known: false };
  }
  const givenFlag = validFlag(d.flag);
  const known = findKnownDestination(name, givenFlag, lookup);
  const flag = givenFlag || known?.flag || '';
  const currency = resolveCurrency(d, known, flag, name, ctx);
  const lat = coord(d.lat, 90);
  const lng = coord(d.lng, 180);
  const hasCoords = lat !== null && lng !== null;
  return {
    known: Boolean(known),
    destination: {
      name,
      country: str(d.country, 80) || known?.country || '',
      emoji: str(emoji || d.emoji, 16),
      flag,
      currencyCode: currency.code,
      currencySymbol: currency.symbol,
      timezone: validTimezone(d.timezone) || known?.timezone || null,
      lat: hasCoords ? lat : known?.lat ?? null,
      lng: hasCoords ? lng : known?.lng ?? null,
      image: safeUrl(d.image) || safeUrl(known?.image),
    },
  };
}

function parseTripDate(v, which, ctx) {
  const iso = normalizeDate(v);
  if (iso) return iso;
  const example = which === 'start' ? '2027-01-13' : '2027-01-26';
  ctx.error('Trip', has(v)
    ? `The ${which} date "${str(v, 40)}" needs to look like ${example}.`
    : `Add the ${which} date, for example ${example}.`);
  return '';
}

function clock(h, m) {
  return h < 24 && m < 60 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : '';
}

// 19:30 and 7:30 as given; 19:30:00, 19.30, 7:30 PM and 7pm with a warning.
function parseStartTime(raw, label, where, ctx) {
  if (!has(raw)) return '';
  const s = str(raw, 40);
  const exact = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (exact && clock(+exact[1], +exact[2])) return clock(+exact[1], +exact[2]);
  let read = '';
  const loose = /^(\d{1,2})[:.h](\d{2})(?::\d{2})?$/.exec(s);
  const ampm = /^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s*m\.?$/i.exec(s);
  if (loose) read = clock(+loose[1], +loose[2]);
  else if (ampm && +ampm[1] >= 1 && +ampm[1] <= 12) {
    read = clock((+ampm[1] % 12) + (ampm[3].toLowerCase() === 'p' ? 12 : 0), +(ampm[2] || 0));
  }
  if (read) ctx.warn(where, `${label}: read the start time "${s}" as ${read}.`);
  else ctx.warn(where, `${label}: "${s}" is not a clock time, so the start time was left blank.`);
  return read;
}

function parseCost(raw, currency, label, where, ctx) {
  if (!has(raw)) return 0;
  const s = str(raw, 60);
  const whole = typeof raw === 'number' ? Number.isInteger(raw) && raw >= 0 : /^\d+$/.test(s);
  const amount = whole ? Number(s) : Math.round(typeof raw === 'number' ? Math.max(raw, 0) : firstNumber(s));
  if (amount > MAX_INT) {
    ctx.error(where, `${label}: the cost "${s}" is too large.`);
    return 0;
  }
  if (!whole) ctx.warn(where, `${label}: read the cost "${s}" as ${amount} ${currency}.`);
  return amount;
}

function durationMinutes(raw, label, where, ctx) {
  const minutes = int(raw, 60);
  if (minutes <= MAX_INT) return minutes;
  ctx.error(where, `${label}: the duration "${str(raw, 40)}" is too long.`);
  return 60;
}

function timeSlot(raw, startTime) {
  const s = str(raw, 40).toLowerCase();
  if (s === 'morning' || s === 'afternoon' || s === 'evening') return s;
  if (/night|evening|dinner/.test(s)) return 'evening';
  if (/afternoon|lunch/.test(s)) return 'afternoon';
  if (/morning|breakfast/.test(s)) return 'morning';
  if (startTime) {
    const h = Number(startTime.slice(0, 2));
    return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  }
  return 'morning';
}

function parseActivity(a, dayNumber, idx, currency, ctx) {
  const where = `Day ${dayNumber}`;
  const label = `Day ${dayNumber}, activity ${idx + 1}`;
  ctx.unknown(a, KNOWN.activity);
  const venueName = str(a.venueName, 200);
  let title = str(a.title, 200);
  if (!title && has(a.name)) {
    ctx.alias('name', 'title');
    title = str(a.name, 200);
  }
  if (!title && venueName) {
    title = venueName;
    ctx.warn(where, `${label}: no title, so we used the venue name "${venueName}".`);
  }
  if (!title) ctx.error(where, `${label}: add a title.`);
  const startTime = parseStartTime(a.startTime, label, where, ctx);
  const costCurrency = currencyCode(a.costCurrency, ctx) || currency;
  return {
    timeSlot: timeSlot(a.timeSlot, startTime),
    sortOrder: idx,
    startTime,
    title,
    description: str(a.description),
    venueName,
    venueAddress: str(a.venueAddress, 300),
    placeId: '',
    category: str(a.category, 40).toLowerCase() || 'culture',
    durationMinutes: durationMinutes(a.durationMinutes, label, where, ctx),
    costAmount: parseCost(a.costAmount, costCurrency, label, where, ctx),
    costCurrency,
    costNote: str(a.costNote, 300),
    latitude: coord(a.latitude, 90),
    longitude: coord(a.longitude, 180),
    bookingUrl: safeUrl(a.bookingUrl),
    tips: str(a.tips),
    gettingThere: str(a.gettingThere, 500),
    transportMode: str(a.transportMode, 40),
    transportDuration: str(a.transportDuration, 40),
    transportCost: str(a.transportCost, 40),
    transportOptions: [],
  };
}

// Day numbers as given. A list numbered from 0 is shifted up by one; a day with
// no usable number takes the first free number from its position on, so it
// never collides with a number the file did give.
function numberDays(rawDays, ctx) {
  const given = rawDays.map(d => {
    const v = isObj(d) ? d.dayNumber : undefined;
    const n = has(v) ? Number(v) : NaN;
    return Number.isInteger(n) ? n : null;
  });
  const zeroBased = given.includes(0) && given.every(n => n === null || n >= 0);
  if (zeroBased) ctx.warn('Trip', 'Day numbers started at 0, so we counted from 1.');
  const explicit = given.map(n => (n === null ? null : zeroBased ? n + 1 : n)).map(n => (n !== null && n >= 1 ? n : null));
  const taken = new Set(explicit.filter(n => n !== null));
  return explicit.map((n, i) => {
    if (n !== null) return n;
    let k = i + 1;
    while (taken.has(k)) k++;
    taken.add(k);
    return k;
  });
}

function dayDate(raw, n, range, where, ctx) {
  if (has(raw)) {
    const iso = normalizeDate(raw);
    if (!iso) {
      ctx.error(where, `Day ${n}: the date "${str(raw, 40)}" needs to look like 2027-01-13.`);
      return '';
    }
    const t = isoToUtc(iso);
    if (range && (t < range.start || t > range.end)) {
      ctx.error(where, `Day ${n}: ${dayMonth(t, true)} is outside the trip (${dayMonth(range.start)} to ${dayMonth(range.end, true)}).`);
    }
    return iso;
  }
  if (!range) return '';
  const t = range.start + (n - 1) * DAY_MS;
  if (t > range.end) {
    const total = Math.round((range.end - range.start) / DAY_MS) + 1;
    ctx.error(where, `Day ${n} is after the trip ends. The trip has ${plural(total, 'day')} (${dayMonth(range.start)} to ${dayMonth(range.end)}).`);
    return '';
  }
  ctx.warn(where, `Day ${n} had no date, so we set it to ${weekdayDate(t)}.`);
  return utcToIso(t);
}

function parseDay(d, dayNumber, range, currency, ctx, seen) {
  const where = `Day ${dayNumber}`;
  ctx.unknown(d, KNOWN.day);
  if (seen.has(dayNumber) && !seen.get(dayNumber)) {
    ctx.error(where, `Day ${dayNumber} appears more than once. Give each day its own number.`);
    seen.set(dayNumber, true);
  }
  if (!seen.has(dayNumber)) seen.set(dayNumber, false);
  const date = dayDate(d.date, dayNumber, range, where, ctx);
  const list = pick(d, 'activities', ['schedule', 'items', 'plan'], ctx);
  if (!Array.isArray(list)) ctx.warn(where, `Day ${dayNumber} has no activities yet.`);
  const acts = Array.isArray(list) ? list : [];
  if (acts.length > IMPORT_LIMITS.maxActivitiesPerDay) {
    ctx.error(where, `Day ${dayNumber} has ${acts.length} activities. The limit is ${IMPORT_LIMITS.maxActivitiesPerDay} per day.`);
  }
  return {
    dayNumber,
    date,
    title: str(d.title, 200) || `Day ${dayNumber}`,
    theme: str(d.theme, 200),
    weather: isObj(d.weather)
      ? { condition: str(d.weather.condition, 40), highC: coord(d.weather.highC, 90), lowC: coord(d.weather.lowC, 90) }
      : null,
    activities: acts
      .slice(0, IMPORT_LIMITS.maxActivitiesPerDay)
      .map((a, i) => parseActivity(isObj(a) ? a : {}, dayNumber, i, currency, ctx)),
  };
}

function listText(nums, max = 10) {
  const shown = nums.slice(0, max);
  if (nums.length > max) return `${shown.join(', ')} and ${nums.length - max} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : String(shown[0]);
}

function parseDays(rawDays, range, currency, ctx) {
  if (!Array.isArray(rawDays) || rawDays.length === 0) {
    ctx.error('Trip', 'Add at least one day to the days list.');
    return [];
  }
  if (rawDays.length > IMPORT_LIMITS.maxDays) {
    ctx.error('Trip', `Trips can have up to ${IMPORT_LIMITS.maxDays} days. This one has ${rawDays.length}.`);
    return [];
  }
  const numbers = numberDays(rawDays, ctx);
  const tooHigh = numbers.find(n => n > IMPORT_LIMITS.maxDayNumber);
  if (tooHigh) {
    ctx.error('Trip', `Day ${tooHigh} is too high. Number the days from 1, up to ${IMPORT_LIMITS.maxDayNumber}.`);
    return [];
  }
  const seen = new Map();
  const days = rawDays
    .map((d, i) => parseDay(isObj(d) ? d : {}, numbers[i], range, currency, ctx, seen))
    .sort((a, b) => a.dayNumber - b.dayNumber);
  const last = days[days.length - 1].dayNumber;
  const missing = [];
  for (let k = 1; k < last; k++) if (!seen.has(k)) missing.push(k);
  if (missing.length === 1) ctx.warn('Trip', `Day ${missing[0]} is missing between day 1 and day ${last}.`);
  else if (missing.length > 1) ctx.warn('Trip', `Days ${listText(missing)} are missing between day 1 and day ${last}.`);
  return days;
}

function bookingRef(v, where, ctx) {
  const s = str(v, 200);
  if (s.length <= IMPORT_LIMITS.maxBookingRef) return s;
  ctx.warn(where, `Booking reference "${s}" was shortened to ${IMPORT_LIMITS.maxBookingRef} characters.`);
  return s.slice(0, IMPORT_LIMITS.maxBookingRef);
}

function parseLeg(l, which, ctx) {
  if (!isObj(l)) return null;
  ctx.unknown(l, KNOWN.leg);
  const route = str(l.route, 120);
  const flightNumber = str(l.flightNumber, 40);
  if (!route && !flightNumber) {
    ctx.warn('Flights', `Flights: the ${which} flight has no route, so it was left out.`);
    return null;
  }
  return {
    route,
    airline: str(l.airline, 80),
    flightNumber,
    duration: str(l.duration, 80),
    priceRange: str(l.priceRange, 80),
    tips: str(l.tips, 500),
    depart: str(l.depart, 80),
    arrive: str(l.arrive, 80),
    booked: bool(l.booked),
    bookingRef: bookingRef(l.bookingRef, 'Flights', ctx),
    seats: str(l.seats, 60),
    baggage: str(l.baggage, 80),
    manageUrl: safeUrl(l.manageUrl),
  };
}

function parseFlights(raw, ctx) {
  if (!raw || typeof raw !== 'object') return null;
  const src = Array.isArray(raw) ? { outbound: raw[0], inbound: raw[1] } : raw;
  if (!Array.isArray(raw)) ctx.unknown(raw, KNOWN.flights);
  const outbound = parseLeg(src.outbound, 'outbound', ctx);
  const inbound = parseLeg(pick(src, 'inbound', ['return'], ctx), 'return', ctx);
  return outbound || inbound ? { outbound, inbound } : null;
}

function parseStays(raw, range, ctx) {
  const list = Array.isArray(raw) ? raw : isObj(raw) ? [raw] : null;
  if (!list) return null;
  const stays = [];
  list.forEach((a, i) => {
    const where = `Hotel ${i + 1}`;
    if (!isObj(a) || !str(a.name)) {
      ctx.warn(where, `Hotel ${i + 1} has no name, so it was left out.`);
      return;
    }
    ctx.unknown(a, KNOWN.stay);
    let checkIn = normalizeDate(a.checkIn);
    let checkOut = normalizeDate(a.checkOut);
    if (checkIn && checkOut && checkOut < checkIn) {
      ctx.warn(where, `Hotel ${i + 1}: check-out is before check-in, so its dates were left out.`);
      checkIn = '';
      checkOut = '';
    } else if (range && checkIn && checkOut
      && (isoToUtc(checkIn) < range.start || isoToUtc(checkOut) > range.end + DAY_MS)) {
      ctx.warn(where, `Hotel ${i + 1}: the stay ${dayMonth(isoToUtc(checkIn))} to ${dayMonth(isoToUtc(checkOut))} is outside the trip dates.`);
    }
    stays.push({
      name: str(a.name, 120), area: str(a.area, 120), type: str(a.type, 60), city: str(a.city, 80),
      priceRange: str(a.priceRange, 80), highlights: str(a.highlights, 600), badge: str(a.badge, 30),
      checkIn, checkOut, booked: bool(a.booked), url: safeUrl(a.url),
      bookingRef: bookingRef(a.bookingRef, where, ctx), address: str(a.address, 300),
    });
  });
  return stays.length ? stays : null;
}

function parseChecklistItems(items, ctx) {
  return items.filter(it => isObj(it) && str(it.label)).map(it => {
    ctx.unknown(it, KNOWN.item);
    return { label: str(it.label, 200), day: int(it.day, 0) || null, note: str(it.note, 300), by: normalizeDate(it.by), url: safeUrl(it.url) };
  });
}

// Groups of { group, items }. Loose items with a label go into one default group.
function parseChecklist(raw, ctx) {
  if (!Array.isArray(raw)) return null;
  const groups = raw.filter(g => isObj(g) && Array.isArray(g.items)).map(g => {
    ctx.unknown(g, KNOWN.group);
    return { group: str(g.group, 80) || 'Must Book Ahead', items: parseChecklistItems(g.items, ctx) };
  });
  const loose = parseChecklistItems(raw.filter(g => isObj(g) && !Array.isArray(g.items)), ctx);
  const all = loose.length ? [...groups, { group: 'Must Book Ahead', items: loose }] : groups;
  return all.length ? all : null;
}

function parseSavingsTips(raw, ctx) {
  if (!Array.isArray(raw)) return null;
  const tips = raw.filter(t => isObj(t) && str(t.title)).map(t => {
    ctx.unknown(t, KNOWN.tip);
    return { icon: str(t.icon, 8), title: str(t.title, 120), description: str(t.description, 600), estimatedSaving: str(t.estimatedSaving, 60) };
  });
  return tips.length ? tips : null;
}

function parseExtras(root, range, ctx) {
  const entries = [
    ['flights', parseFlights(pick(root, 'flights', ['flight'], ctx), ctx)],
    ['accommodation', parseStays(pick(root, 'accommodation', ['hotels', 'hotel', 'stays'], ctx), range, ctx)],
    ['bookingChecklist', parseChecklist(root.bookingChecklist, ctx)],
    ['savingsTips', parseSavingsTips(root.savingsTips, ctx)],
  ];
  return Object.fromEntries(entries.filter(([, v]) => v));
}

const amountOf = (v) => (typeof v === 'number' ? int(v) : Math.round(firstNumber(str(v, 60))));

function failed(message, code) {
  return { ok: false, errors: [{ where: '', message, code }], warnings: [], data: null, summary: null };
}

/**
 * Validate pasted text or file content.
 * @param {string} raw
 * @param {{ destination?: object }} [opts] a DESTINATIONS-shaped record for the
 *   trip's city, looked up by the caller (e.g. from the city catalogue), used
 *   to fill in currency, timezone and coordinates the file left out.
 * @returns {{ ok: boolean, errors: {where: string, message: string, code?: string}[],
 *   warnings: {where: string, message: string}[], data: { wizardState: object, itinerary: object } | null,
 *   summary: { days: number, activities: number, destinationKnown: boolean } | null }}
 */
export function validateTripImport(raw, opts = {}) {
  if (typeof raw !== 'string') return failed(IMPORT_MESSAGES.empty, 'empty');
  if (isTooLarge(raw)) return failed(IMPORT_MESSAGES.tooLarge, 'tooLarge');
  if (!raw.trim()) return failed(IMPORT_MESSAGES.empty, 'empty');
  const parsed = extractJson(raw);
  if (parsed.error) return failed(parsed.error, parsed.code);

  const root = parsed.value;
  if (!isObj(root)) return failed(IMPORT_MESSAGES.notTrippy, 'notTrippy');
  if (root.trippy !== undefined) {
    const version = Number(root.trippy);
    if (Number.isFinite(version) && version > IMPORT_VERSION) return failed(newerVersion(str(root.trippy, 10)), 'newer');
    if (version !== IMPORT_VERSION) return failed(IMPORT_MESSAGES.notTrippy, 'notTrippy');
  }
  const trip = root.trip;
  const hasDays = Array.isArray(root.days) || Array.isArray(root.itinerary);
  if (!isObj(trip) || (root.trippy === undefined && !hasDays)) return failed(IMPORT_MESSAGES.notTrippy, 'notTrippy');

  const ctx = createContext();
  ctx.unknown(root, KNOWN.root);
  ctx.unknown(trip, KNOWN.trip);
  const title = str(trip.title, 120);
  if (!title) ctx.error('Trip', 'Add a title, for example "Hokkaido in Winter".');
  const { destination, known } = parseDestination(trip.destination, trip.emoji, opts.destination, ctx);
  const startDate = parseTripDate(trip.startDate, 'start', ctx);
  const endDate = parseTripDate(trip.endDate, 'end', ctx);
  let range = null;
  if (startDate && endDate) {
    const start = isoToUtc(startDate);
    const end = isoToUtc(endDate);
    if (end < start) ctx.error('Trip', `The end date ${dayMonth(end, true)} is before the start date ${dayMonth(start, true)}.`);
    else range = { start, end };
  }
  const dailyBudget = amountOf(trip.dailyBudget);
  if (dailyBudget > MAX_INT) ctx.error('Trip', `The daily budget "${str(trip.dailyBudget, 60)}" is too large.`);
  const days = parseDays(pick(root, 'days', ['itinerary'], ctx), range, destination?.currencyCode || 'USD', ctx);
  const extras = parseExtras(root, range, ctx);

  if (ctx.ignored.size) {
    const names = [...ctx.ignored];
    const more = names.length > 5 ? ` and ${names.length - 5} more` : '';
    ctx.warn('Trip', `Ignored fields we don't use: ${names.slice(0, 5).join(', ')}${more}.`);
  }
  if (ctx.errors.length) return { ok: false, errors: ctx.errors, warnings: ctx.warnings, data: null, summary: null };

  const wizardState = {
    imported: true,
    destination,
    destinations: [],
    multiCity: false,
    dates: { mode: 'fixed', start: startDate, end: endDate },
    budget: { preset: null, dailyAmount: dailyBudget },
    travelers: Math.min(amountOf(trip.travelers) || 1, 20),
    summary: { freeText: str(trip.subtitle, 300) },
  };
  const activities = days.reduce((n, d) => n + d.activities.length, 0);
  return {
    ok: true,
    errors: [],
    warnings: ctx.warnings,
    data: { wizardState, itinerary: { tripTitle: title, days, ...extras } },
    summary: { days: days.length, activities, destinationKnown: known },
  };
}
