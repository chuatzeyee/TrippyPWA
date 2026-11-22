// Words, dates and safe values for the admin console. Pure: the clock is always passed in, and
// nothing here reads storage, the network or the page.

export const HOUR_MS = 3600000;
export const DAY_MS = 86400000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_VALUE_CHARS = 2000;
const MAX_DEPTH = 3;

/** A valid Date for a timestamp, a date or a Date; null for anything else. */
export function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "1 trip", "1,204 trips". */
export function plural(n, one, many) {
  const count = Number.isFinite(n) ? n : 0;
  return `${num(count)} ${count === 1 ? one : many}`;
}

/** A whole number with thousands separators. */
export function num(n) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '0';
}

function parts(date, timeZone) {
  const options = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', timeZone ? { ...options, timeZone } : options);
  } catch {
    formatter = new Intl.DateTimeFormat('en-US', options);
  }
  const out = {};
  for (const part of formatter.formatToParts(date)) out[part.type] = part.value;
  return out;
}

/** "22 Nov 2026". A date with no time ("2026-11-22") is never moved by a time zone. */
export function formatDate(value, { timeZone } = {}) {
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [, y, m, d] = DATE_ONLY.exec(value);
    const month = MONTHS[Number(m) - 1];
    return month ? `${Number(d)} ${month} ${y}` : '';
  }
  const date = toDate(value);
  if (!date) return '';
  const p = parts(date, timeZone);
  return `${p.day} ${MONTHS[Number(p.month) - 1]} ${p.year}`;
}

/** "4:05 PM": always the 12 hour clock. */
export function formatTime(value, { timeZone } = {}) {
  const date = toDate(value);
  if (!date) return '';
  const p = parts(date, timeZone);
  return `${p.hour}:${p.minute} ${String(p.dayPeriod ?? '').toUpperCase()}`;
}

/** "22 Nov, 4:05 PM", with the year when it is not the year of `now`. */
export function formatDateTime(value, now, { timeZone } = {}) {
  const date = toDate(value);
  if (!date) return '';
  const p = parts(date, timeZone);
  const sameYear = toDate(now) ? parts(toDate(now), timeZone).year === p.year : true;
  const day = `${p.day} ${MONTHS[Number(p.month) - 1]}${sameYear ? '' : ` ${p.year}`}`;
  return `${day}, ${formatTime(date, { timeZone })}`;
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago", then the date. */
export function relativeTime(value, now, { timeZone } = {}) {
  const date = toDate(value);
  const ref = toDate(now);
  if (!date || !ref) return '';
  const diff = ref.getTime() - date.getTime();
  if (diff < 60000) return 'just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${plural(minutes, 'minute', 'minutes')} ago`;
  const hours = Math.floor(diff / HOUR_MS);
  if (hours < 24) return `${plural(hours, 'hour', 'hours')} ago`;
  const days = Math.floor(diff / DAY_MS);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return formatDate(date, { timeZone });
}

/** "12 Mar to 20 Mar 2027" (the first year is written only when it differs), one date, or "No dates". */
export function dateRange(start, end) {
  const from = formatDate(start);
  const to = formatDate(end);
  if (!from) return 'No dates';
  if (!to || to === from) return from;
  const sameYear = from.slice(-4) === to.slice(-4);
  return `${sameYear ? from.slice(0, -5) : from} to ${to}`;
}

/** The name as the person wrote it, or "No name". */
export function displayName(profile) {
  const name = typeof profile?.display_name === 'string' ? profile.display_name.replace(/\s+/g, ' ').trim() : '';
  return name || 'No name';
}

/** Up to two initials for an avatar with no picture. */
export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length || name === 'No name') return '?';
  return words.slice(0, 2).map((word) => [...word][0].toUpperCase()).join('');
}

/**
 * The avatar address when it is an http(s) URL, as the parsed href (a value can parse as a URL and
 * still hold quotes), else ''.
 */
export function safeAvatar(url) {
  if (typeof url !== 'string' || !url.trim()) return '';
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch {
    return '';
  }
}

/** A two letter flag code in lower case, or ''. */
export function flagCode(code) {
  return typeof code === 'string' && /^[a-z]{2}$/.test(code) ? code : '';
}

/** "Singapore" or "Lisbon, Portugal"; '' when the person gave no home. */
export function homeLabel(profile) {
  const city = typeof profile?.home_city === 'string' ? profile.home_city.trim() : '';
  const country = typeof profile?.home_country === 'string' ? profile.home_country.trim() : '';
  if (city && country && city.toLowerCase() !== country.toLowerCase()) return `${city}, ${country}`;
  return city || country;
}

/** How many days a trip row holds: an embedded count or the embedded rows. */
export function dayCount(trip) {
  const days = trip?.itinerary_days;
  if (!Array.isArray(days)) return 0;
  if (days.length === 1 && Number.isFinite(days[0]?.count)) return days[0].count;
  return days.length;
}

/** "user_agent" and "userAgent" both read "User agent". */
export function humanKey(key) {
  const words = String(key ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase();
  if (!words) return 'Value';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function clip(text) {
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)} (cut at ${num(MAX_VALUE_CHARS)} characters)` : text;
}

function valueText(value) {
  if (value === null || value === undefined || value === '') return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None';
  if (typeof value === 'string') return clip(value);
  try { return clip(JSON.stringify(value)); } catch { return 'Could not be read'; }
}

const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isSimple = (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value);

/**
 * Log metadata as readable lines. Nested objects are flattened ("Request status"), a list of plain
 * values is joined with commas, and a value with line breaks (a stack trace) is marked as a block.
 * @returns {Array<{ key: string, value: string, block: boolean }>}
 */
export function metadataLines(metadata) {
  const lines = [];
  const walk = (value, path, depth) => {
    if (isPlain(value) && depth < MAX_DEPTH) {
      const entries = Object.entries(value);
      if (!entries.length && path.length) lines.push({ key: humanKey(path.join(' ')), value: 'None', block: false });
      for (const [key, inner] of entries) walk(inner, [...path, key], depth + 1);
      return;
    }
    let text;
    if (Array.isArray(value)) {
      text = !value.length ? 'None' : value.every(isSimple) ? clip(value.map(valueText).join(', ')) : valueText(value);
    } else {
      text = valueText(value);
    }
    lines.push({ key: humanKey(path.join(' ')), value: text, block: text.includes('\n') });
  };
  if (isPlain(metadata)) walk(metadata, [], 0);
  return lines;
}

/** The whole log row as indented JSON, for the clipboard. */
export function logJson(log) {
  const { profiles, trips, ...row } = log ?? {};
  void profiles; void trips;
  try { return JSON.stringify(row, null, 2); } catch { return '{}'; }
}
