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

export function formatDateRange(startStr, endStr) {
  if (!startStr) return '';
  const s = new Date(startStr + 'T00:00:00');
  const fmt = (d, opts) => new Intl.DateTimeFormat(getLocale(), opts).format(d);

  if (!endStr) return fmt(s, { day: 'numeric', month: 'short', year: 'numeric' });

  const e = new Date(endStr + 'T00:00:00');
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const sameYear = s.getFullYear() === e.getFullYear();

  if (sameMonth) {
    const month = fmt(s, { month: 'short' });
    return `${s.getDate()}–${e.getDate()} ${month} ${e.getFullYear()}`;
  }
  if (sameYear) {
    const sF = fmt(s, { day: 'numeric', month: 'short' });
    const eF = fmt(e, { day: 'numeric', month: 'short' });
    return `${sF} – ${eF} ${e.getFullYear()}`;
  }
  const sF = fmt(s, { day: 'numeric', month: 'short', year: 'numeric' });
  const eF = fmt(e, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${sF} – ${eF}`;
}

export function formatWeekdayDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat(getLocale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}
