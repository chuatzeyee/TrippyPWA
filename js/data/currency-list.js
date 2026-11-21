// The one list of home currencies, for the profile wizard and the Settings
// page. A static table, moved here from js/profile/profile-wizard.js.

/** The currencies offered as a home currency, in the order they are shown. */
export const CURRENCY_LIST = Object.freeze([
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
].map(entry => Object.freeze(entry)));

/**
 * The options for a home-currency control: the list, plus the stored currency
 * when the list does not have it (appended, shown by its code), so the saved
 * value can always be the selected option. `storedCode` is compared exactly as
 * it is stored. Returns a new array each time.
 */
export function currencyOptions(storedCode, storedSymbol = '') {
  const options = [...CURRENCY_LIST];
  if (typeof storedCode !== 'string' || !storedCode.trim()) return options;
  if (options.some(entry => entry.code === storedCode)) return options;
  const symbol = typeof storedSymbol === 'string' && storedSymbol.trim() ? storedSymbol : storedCode;
  return [...options, Object.freeze({ code: storedCode, symbol, name: storedCode })];
}
