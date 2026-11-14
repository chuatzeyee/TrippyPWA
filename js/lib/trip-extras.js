// Pure helpers for trip "extras" (flights, stays, booking checklist).
// No DOM, no network: unit-tested in trip-extras.test.js.

const DAY_MS = 86400000;
const SOON_DAYS = 14;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Only http(s) links may reach an href. Normalising through URL also
// percent-encodes quotes, so a value can never break out of an attribute.
export function safeUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
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
  return { nights, label: `${shortDate(a)} → ${shortDate(b)} · ${nights} night${nights === 1 ? '' : 's'}` };
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

// "Photo: creator · licence · source" for a stored photo credit (extras.photoCredits).
export function photoCreditText(credit) {
  if (!credit || typeof credit !== 'object') return '';
  const parts = [credit.creator, credit.license, credit.via].map(v => String(v || '').trim()).filter(Boolean);
  return parts.length ? `Photo: ${parts.join(' · ')}` : '';
}
