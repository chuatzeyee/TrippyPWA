// Pure helpers for trip "extras" (flights, stays, booking checklist).
// No DOM, no network: unit-tested in trip-extras.test.js.

const DAY_MS = 86400000;
const SOON_DAYS = 14;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// URL.href keeps ' ( ) and backslashes in the path (and backslashes in the
// query), which can end a CSS url('...') string or escape its closing quote.
const CSS_UNSAFE = /['"()\\\s]/g;

// Only http(s) links may reach an href or a CSS url(). The result never
// contains quotes, parentheses, backslashes or whitespace (they are
// percent-encoded), so it cannot break out of a quoted HTML attribute or a
// url('...') value. Still HTML-escape it at the call site (for &).
export function safeUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href.replace(CSS_UNSAFE, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  } catch {
    return '';
  }
}

// 'YYYY-MM-DD' -> UTC epoch ms, or null if not a real calendar date.
export function isoToUtc(iso) {
  const m = typeof iso === 'string' ? ISO_DATE.exec(iso) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? t : null;
}

function shortDate(utcMs, withYear) {
  return new Date(utcMs).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC',
  });
}

export function deadlineInfo(by, today = new Date()) {
  const t = isoToUtc(by);
  if (t === null) return null;
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const daysLeft = Math.round((t - todayUtc) / DAY_MS);
  const state = daysLeft < 0 ? 'overdue' : daysLeft <= SOON_DAYS ? 'soon' : 'later';
  const withYear = new Date(t).getUTCFullYear() !== today.getFullYear();
  return { state, daysLeft, label: `Book by ${shortDate(t, withYear)}` };
}

export function stayInfo(checkIn, checkOut) {
  const a = isoToUtc(checkIn);
  const b = isoToUtc(checkOut);
  if (a === null || b === null || b <= a) return null;
  const nights = Math.round((b - a) / DAY_MS);
  return { nights, label: `${shortDate(a)} to ${shortDate(b)} (${nights} night${nights === 1 ? '' : 's'})` };
}

// Earliest deadline first; undated items keep their order at the end.
export function sortChecklistItems(items) {
  return (items || [])
    .map((item, i) => ({ item, i, t: isoToUtc(item?.by) }))
    .sort((x, y) => {
      if (x.t !== null && y.t !== null) return x.t - y.t || x.i - y.i;
      if (x.t !== null) return -1;
      if (y.t !== null) return 1;
      return x.i - y.i;
    })
    .map(({ item }) => item);
}

export function isBookedLeg(leg) {
  return Boolean(leg && (leg.booked || leg.bookingRef));
}

// The one time line under a flight's route. A stored layover note folds in
// after a comma ("9h 50m incl. 1h 15m in Taipei" reads "9h 50m, 1h 15m in
// Taipei"); a connecting leg with no stored time says where it stops instead.
export function flightTimeLine(duration, viaStops = []) {
  const text = typeof duration === 'string' || typeof duration === 'number'
    ? String(duration).replace(/\s+/g, ' ').trim()
    : '';
  if (text) {
    return text
      .replace(/\s*\(\s*(?:including|incl\.?)\s+([^)]*?)\s*\)/gi, ', $1')
      .replace(/\s*,?\s*\b(?:including|incl\.?)\s+/gi, ', ');
  }
  const stops = (Array.isArray(viaStops) ? viaStops : []).filter(Boolean);
  if (!stops.length) return '';
  return `${stops.length === 1 ? '1 stop' : `${stops.length} stops`} via ${stops.join(', ')}`;
}

// "Photo: creator, licence, source" for a stored photo credit (extras.photoCredits).
export function photoCreditText(credit) {
  if (!credit || typeof credit !== 'object') return '';
  const parts = [credit.creator, credit.license, credit.via].map(v => String(v || '').trim()).filter(Boolean);
  return parts.length ? `Photo: ${parts.join(', ')}` : '';
}

// Minutes AI planning usually takes: one model call per 4 days at about 70
// seconds, plus the save (a 13-day packed trip measured 4m47s on 2026-11-15).
export function estimateGenerationMinutes(days) {
  const n = Math.max(1, Number(days) || 7);
  return Math.max(2, Math.round((Math.ceil(n / 4) * 70 + 20) / 60));
}
