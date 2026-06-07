// Maps an ISO 3166-1 alpha-2 country code (as returned by the Photon geocoder)
// to its ISO 4217 currency code, then derives a display symbol at runtime via
// Intl. This lets the wizard populate a sensible currency for ANY resolved city
// without shipping a hand-maintained symbol table.

// Country (alpha-2, UPPERCASE) -> currency code (alpha-3). Covers the common
// travel destinations; anything missing falls back to USD so budgets still work.
const COUNTRY_TO_CURRENCY = {
  // Asia
  JP: 'JPY', CN: 'CNY', HK: 'HKD', MO: 'MOP', TW: 'TWD', KR: 'KRW', MN: 'MNT',
  TH: 'THB', VN: 'VND', KH: 'KHR', LA: 'LAK', MM: 'MMK', MY: 'MYR', SG: 'SGD',
  ID: 'IDR', PH: 'PHP', BN: 'BND', IN: 'INR', NP: 'NPR', LK: 'LKR', BD: 'BDT',
  PK: 'PKR', BT: 'BTN', MV: 'MVR', KZ: 'KZT', UZ: 'UZS',
  // Middle East
  AE: 'AED', QA: 'QAR', OM: 'OMR', BH: 'BHD', KW: 'KWD', SA: 'SAR', JO: 'JOD',
  IL: 'ILS', LB: 'LBP', TR: 'TRY', IR: 'IRR', IQ: 'IQD',
  // Europe (Eurozone)
  AT: 'EUR', BE: 'EUR', HR: 'EUR', CY: 'EUR', EE: 'EUR', FI: 'EUR', FR: 'EUR',
  DE: 'EUR', GR: 'EUR', IE: 'EUR', IT: 'EUR', LV: 'EUR', LT: 'EUR', LU: 'EUR',
  MT: 'EUR', NL: 'EUR', PT: 'EUR', SK: 'EUR', SI: 'EUR', ES: 'EUR', MC: 'EUR',
  ME: 'EUR', XK: 'EUR', AD: 'EUR', SM: 'EUR', VA: 'EUR',
  // Europe (non-Euro)
  GB: 'GBP', CH: 'CHF', LI: 'CHF', NO: 'NOK', SE: 'SEK', DK: 'DKK', IS: 'ISK',
  PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', RS: 'RSD', UA: 'UAH',
  RU: 'RUB', BY: 'BYN', MD: 'MDL', MK: 'MKD', BA: 'BAM', AL: 'ALL', GE: 'GEL',
  AM: 'AMD', AZ: 'AZN',
  // Americas
  US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP',
  PE: 'PEN', UY: 'UYU', BO: 'BOB', PY: 'PYG', EC: 'USD', VE: 'VES', CR: 'CRC',
  PA: 'PAB', GT: 'GTQ', CU: 'CUP', DO: 'DOP', JM: 'JMD', BS: 'BSD', BZ: 'BZD',
  // Oceania
  AU: 'AUD', NZ: 'NZD', FJ: 'FJD', PG: 'PGK',
  // Africa
  ZA: 'ZAR', MA: 'MAD', EG: 'EGP', KE: 'KES', TZ: 'TZS', NG: 'NGN', GH: 'GHS',
  ET: 'ETB', UG: 'UGX', RW: 'RWF', SN: 'XOF', CI: 'XOF', TN: 'TND', DZ: 'DZD',
  MU: 'MUR', SC: 'SCR', NA: 'NAD', BW: 'BWP', ZW: 'ZWL', ZM: 'ZMW', MZ: 'MZN',
};

const DEFAULT_CURRENCY = 'USD';

// Derive a compact display symbol for a currency code. narrowSymbol gives "$"
// rather than "US$", "₫" rather than "VND". Falls back to the code itself when
// the runtime has no symbol (e.g. some less-common currencies).
export function currencySymbolFor(currencyCode) {
  if (!currencyCode) return '$';
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    const sym = parts.find(p => p.type === 'currency')?.value;
    return sym || currencyCode;
  } catch {
    return currencyCode;
  }
}

// Resolve a country code to { code, symbol }. Unknown / missing codes fall back
// to USD so downstream budget math always has a usable currency.
export function currencyForCountry(countryCode) {
  const cc = String(countryCode || '').toUpperCase();
  const code = COUNTRY_TO_CURRENCY[cc] || DEFAULT_CURRENCY;
  return { code, symbol: currencySymbolFor(code) };
}
