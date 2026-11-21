// Per-activity currency sums. Moved here unchanged from
// js/components/trip-detail.js (task F11x) so that the trip page and the pure
// model builders share one rule. No DOM, no network, no storage.
//
// Activities carry their own cost_currency. Totals are shown in the trip's
// currency, so other currencies are converted when both rates are known and
// otherwise left out (and counted) rather than added up as if they matched.
import { convert, canConvert } from '../data/currencies.js';

export function tripCurrencyCode(trip) {
  const ws = trip?.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  return String(dest?.currencyCode || trip?.budget_currency || 'USD').toUpperCase();
}

// The activity's own currency when it is a real code that differs from the
// trip's; '' when it is priced in the trip currency (or the code is unusable).
export function foreignCurrency(activity, tripCode) {
  const code = String(activity?.cost_currency || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) && code !== tripCode ? code : '';
}

export function costInTripCurrency(activity, tripCode) {
  const amount = Number(activity?.cost_amount) || 0;
  if (!amount) return 0;
  const from = foreignCurrency(activity, tripCode);
  if (!from) return amount;
  if (canConvert(from) && canConvert(tripCode)) return convert(amount, from, tripCode);
  return null;
}

export function sumCosts(activities, tripCode) {
  let total = 0;
  let excluded = 0;
  for (const a of activities || []) {
    const c = costInTripCurrency(a, tripCode);
    if (c === null) excluded++;
    else total += c;
  }
  return { total, excluded };
}
