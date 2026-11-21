const FLAG_TO_LOCALE = {
  sg: 'en-SG', my: 'en-MY', au: 'en-AU', gb: 'en-GB', us: 'en-US',
  nz: 'en-NZ', ca: 'en-CA', ie: 'en-IE', in: 'en-IN', hk: 'en-HK',
  ph: 'en-PH', za: 'en-ZA', jp: 'ja-JP', kr: 'ko-KR', th: 'th-TH',
  id: 'id-ID', tw: 'zh-TW', cn: 'zh-CN', fr: 'fr-FR', de: 'de-DE',
  es: 'es-ES', it: 'it-IT', pt: 'pt-PT', br: 'pt-BR', nl: 'nl-NL',
  se: 'sv-SE', dk: 'da-DK', no: 'nb-NO', fi: 'fi-FI', pl: 'pl-PL',
  cz: 'cs-CZ', at: 'de-AT', ch: 'de-CH', be: 'fr-BE', mx: 'es-MX',
  ar: 'es-AR', cl: 'es-CL', co: 'es-CO', pe: 'es-PE', ae: 'ar-AE',
  sa: 'ar-SA', tr: 'tr-TR', ru: 'ru-RU', vn: 'vi-VN', il: 'he-IL',
};

let _locale = null;

export function getLocale() {
  if (_locale) return _locale;
  try {
    const prefs = JSON.parse(localStorage.getItem('trippy_user_prefs') || '{}');
    if (prefs.locale) { _locale = prefs.locale; return _locale; }
  } catch { /* ignore */ }
  try {
    const profile = JSON.parse(localStorage.getItem('trippy_profile_cache') || '{}');
    if (profile.home_flag) {
      _locale = FLAG_TO_LOCALE[profile.home_flag] || navigator.language || 'en-SG';
      return _locale;
    }
  } catch { /* ignore */ }
  _locale = navigator.language || 'en-SG';
  return _locale;
}

export function setLocaleFromFlag(flag) {
  _locale = FLAG_TO_LOCALE[flag] || navigator.language || 'en-SG';
}

export function formatNumber(n) {
  return Number(n).toLocaleString(getLocale());
}

// Joins city names for display: "Tokyo" | "Tokyo & Osaka" | "Tokyo, Osaka & Kyoto".
// Nicer than the old "Tokyo to Osaka to Kyoto" for multi-city trips.
export function formatCityList(names) {
  const list = (names || []).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}`;
}

export function formatDateRange(startStr, endStr) {
  if (!startStr) return '';
  const s = new Date(startStr + 'T00:00:00');
  const fmt = (d, opts) => new Intl.DateTimeFormat(getLocale(), opts).format(d);

  if (!endStr) return fmt(s, { day: 'numeric', month: 'short', year: 'numeric' });

  const e = new Date(endStr + 'T00:00:00');
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const sameYear = s.getFullYear() === e.getFullYear();

  // "3 to 10 Jan 2026": plain "to" instead of an en dash (UI copy rule).
  if (sameMonth) {
    const month = fmt(s, { month: 'short' });
    return `${s.getDate()} to ${e.getDate()} ${month} ${e.getFullYear()}`;
  }
  if (sameYear) {
    const sF = fmt(s, { day: 'numeric', month: 'short' });
    const eF = fmt(e, { day: 'numeric', month: 'short' });
    return `${sF} to ${eF} ${e.getFullYear()}`;
  }
  const sF = fmt(s, { day: 'numeric', month: 'short', year: 'numeric' });
  const eF = fmt(e, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${sF} to ${eF}`;
}

export function formatWeekdayDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat(getLocale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

// Display prefs for clock and temperature text (blueprint 5.4). The prefs store sets them once at
// start and again whenever they change, so no caller has to pass the choice along. Stored values stay
// 24-hour and Celsius; these functions are display only.
const TIME_FORMATS = ['12h', '24h'];
const TEMPERATURE_UNITS = ['C', 'F'];
let display = { timeFormat: '12h', temperatureUnit: 'C' };

/** @param {{ timeFormat?: '12h'|'24h', temperatureUnit?: 'C'|'F' }} next a value that is not known is ignored */
export function setDisplayPrefs(next) {
  const wanted = next !== null && typeof next === 'object' ? next : {};
  display = {
    timeFormat: TIME_FORMATS.includes(wanted.timeFormat) ? wanted.timeFormat : display.timeFormat,
    temperatureUnit: TEMPERATURE_UNITS.includes(wanted.temperatureUnit) ? wanted.temperatureUnit : display.temperatureUnit,
  };
}

// Every 24h clock time in a string ("06:10", "19:30:00") as 12h with AM/PM
// ("6:10 AM", "7:30 PM"). Times already marked am/pm, and anything that is
// not a valid clock time, are left alone. Stored values stay 24h; this is
// display only.
const CLOCK_24H = /(?<![\d:])(\d{1,2}):([0-5]\d)(?::[0-5]\d)?(?![\d:])(?!\s?[ap]\.?m\b)/gi;
// A time that carries its own marker: "6:10 PM", "7:30pm", "11:59 p.m.".
const CLOCK_MARKED = /(?<![\d:.])(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s?([ap])(?:m\b|\.m\.)/gi;
// An hour with a marker: "7 PM", "9am". Not the end of a range that marks only its end ("7 to 9 PM",
// "7-9 PM"): converting half of that would read worse than leaving it.
const HOUR_MARKED = /(?<![\d:.])(?<!\d\s?(?:-|\u2013|\u2014|to|and|or)\s?)(\d{1,2})\s?([ap])(?:m\b|\.m\.)/gi;
const twoDigits = (n) => String(n).padStart(2, '0');

function clockTo12h(text) {
  return text.replace(CLOCK_24H, (match, h, m) => {
    const hour = Number(h);
    if (hour > 23) return match;
    return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`;
  });
}

/** "6", "10", "p" gives "18:10"; an hour that is not on a 12-hour clock gives null. */
function from12h(h, minutes, marker) {
  const hour = Number(h);
  if (hour < 1 || hour > 12) return null;
  return `${twoDigits((hour % 12) + (marker.toLowerCase() === 'p' ? 12 : 0))}:${minutes}`;
}

function clockTo24h(text) {
  return text
    .replace(CLOCK_MARKED, (match, h, m, marker) => from12h(h, m, marker) ?? match)
    .replace(HOUR_MARKED, (match, h, marker) => from12h(h, '00', marker) ?? match)
    .replace(CLOCK_24H, (match, h, m) => (Number(h) > 23 ? match : `${twoDigits(Number(h))}:${m}`));
}

/**
 * Clock times inside any text, in the format the user chose.
 * 12h (the default): "06:10" becomes "6:10 AM"; a time that is already marked is left alone.
 * 24h: "6:10 PM" becomes "18:10", "7 PM" becomes "19:00", and "9:05:00" becomes "09:05".
 * @param {*} text
 * @returns {string} '' for null or undefined
 */
export function formatClock(text) {
  if (text == null) return '';
  return display.timeFormat === '24h' ? clockTo24h(String(text)) : clockTo12h(String(text));
}

/** The old name of formatClock: the same function, so no call site changes. */
export const to12h = formatClock;

/**
 * Whether a stored temperature can be printed: a finite number, or text that holds one ("18", "9.6").
 * Null, '', blank text, words and booleans are missing values, not zero.
 * @param {*} value
 * @returns {boolean}
 */
export function isTemperature(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}
/** @returns {number} a Celsius value as a whole number in the unit the user chose */
const shownDegrees = (celsius) => Math.round(display.temperatureUnit === 'F' ? (Number(celsius) * 9) / 5 + 32 : Number(celsius));

/**
 * @param {*} celsius
 * @returns {string} "23°C" or "73°F" from a Celsius value; '' when it is not a number
 */
export function formatTemp(celsius) {
  return isTemperature(celsius) ? `${shownDegrees(celsius)}°${display.temperatureUnit}` : '';
}

/**
 * "16 to 23°C" or "61 to 73°F" from two Celsius values; one value when both ends match or only one is
 * a number; '' when neither is.
 * @param {*} lowC
 * @param {*} highC
 * @param {{ celsiusLetter?: boolean, style?: 'range'|'slash' }} [options]
 *   celsiusLetter false leaves the C out ("12 to 18°"), as the classic day card and the PDF print it;
 *   Fahrenheit always carries its letter. style 'slash' is the shared page's badge as it prints
 *   today: high first and both values even when they match ("18/10°C").
 * @returns {string}
 */
export function formatTempRange(lowC, highC, { celsiusLetter = true, style = 'range' } = {}) {
  const [low, high] = [lowC, highC].map((value) => (isTemperature(value) ? shownDegrees(value) : null));
  if (low === null && high === null) return '';
  const unit = display.temperatureUnit === 'F' || celsiusLetter ? `°${display.temperatureUnit}` : '°';
  if (low === null || high === null) return `${low ?? high}${unit}`;
  if (style === 'slash') return `${high}/${low}${unit}`;
  return low === high ? `${high}${unit}` : `${low} to ${high}${unit}`;
}
