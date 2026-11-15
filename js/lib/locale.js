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

// Every 24h clock time in a string ("06:10", "19:30:00") as 12h with AM/PM
// ("6:10 AM", "7:30 PM"). Times already marked am/pm, and anything that is
// not a valid clock time, are left alone. Stored values stay 24h; this is
// display only.
const CLOCK_24H = /(?<![\d:])(\d{1,2}):([0-5]\d)(?::[0-5]\d)?(?![\d:])(?!\s?[ap]\.?m\b)/gi;

export function to12h(text) {
  if (text == null) return '';
  return String(text).replace(CLOCK_24H, (match, h, m) => {
    const hour = Number(h);
    if (hour > 23) return match;
    return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`;
  });
}
