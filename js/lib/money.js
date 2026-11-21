// Money text on one stated basis (blueprint 2.1 and 7.4). Pure: no DOM, no network, no storage.
//
// The summing rule is sumCosts() in cost-sum.js and nothing else: an activity priced in another
// currency is converted when both rates are known, and left out and counted when they are not.
// This module turns that sum into the figures a view prints, and decides which one leads.
import { sumCosts } from './cost-sum.js';
import { convert, canConvert } from '../data/currencies.js';
import { getLocale } from './locale.js';

/**
 * Whose money every figure is. The planning prompt states the daily budget per person and asks for
 * activities within it, so activity amounts are read as per person and the budget they are set
 * against is the daily budget times the days, per person. The number of travellers never enters.
 */
export const COST_BASIS = 'perPerson';

/** The label that goes with every total. */
export const COST_BASIS_TEXT = 'per person, activities only';

// Symbols that do not say which currency they mean: the ISO code is printed instead.
const AMBIGUOUS_SYMBOLS = new Set(['$', 'kr']);
// Arabic and Hebrew letters: a symbol written right to left reorders around the digits beside it.
const RIGHT_TO_LEFT = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;

const codeOf = (code) => String(code ?? '').trim().toUpperCase();

/**
 * A whole number with its thousands grouped in the user's locale. Grouping is always on: several
 * locales (Portuguese, Spanish, Polish) leave a four-digit number in one piece by default, which
 * printed "€6150" beside "€12,400". An engine that does not know the option groups by its default.
 */
function grouped(whole) {
  try {
    return new Intl.NumberFormat(getLocale(), { useGrouping: 'always', maximumFractionDigits: 0 }).format(whole);
  } catch {
    return Number(whole).toLocaleString(getLocale());
  }
}

function clearSymbol(symbol, code) {
  const text = String(symbol ?? '').trim();
  if (!text || AMBIGUOUS_SYMBOLS.has(text.toLowerCase()) || text.toUpperCase() === code || RIGHT_TO_LEFT.test(text)) return '';
  return text;
}

/**
 * An amount as text, in whole units: "S$1,090", or "HKD 6,347" when the symbol is `$`, `kr`,
 * missing, the code itself or written right to left. A symbol two currencies share (`¥`) is kept
 * here; costEstimate() drops it where both currencies are printed side by side.
 * @param {number} amount
 * @param {string} code      ISO 4217
 * @param {string} [symbol]
 * @returns {string} '' when the amount is not a number
 */
export function moneyText(amount, code, symbol) {
  const value = amount === null || amount === '' ? NaN : Number(amount);
  if (!Number.isFinite(value)) return '';
  const number = grouped(Math.round(value));
  const iso = codeOf(code);
  const clear = clearSymbol(symbol, iso);
  if (clear) return `${clear}${number}`;
  return iso ? `${iso} ${number}` : `${String(symbol ?? '').trim()}${number}`;
}

/** @returns {{ amount: number, code: string, text: string }|null} null unless the amount rounds to more than 0 */
function money(amount, code, symbol) {
  const whole = Math.round(Number(amount));
  return Number.isFinite(whole) && whole > 0 ? { amount: whole, code, text: moneyText(whole, code, symbol) } : null;
}

/**
 * The cost of a plan or of a day, activities only, per person.
 *
 * Give it `activities` (rows with cost_amount and cost_currency) and it sums them with sumCosts();
 * or give it the `total` and `excluded` that sumCosts() returned.
 * @param {object} input
 * @param {Array<object>} [input.activities]
 * @param {number} [input.total]
 * @param {number} [input.excluded]
 * @param {string} input.tripCode                 the trip currency (tripCurrencyCode in cost-sum.js)
 * @param {string} [input.tripSymbol]
 * @param {{ code: string, symbol?: string }|null} [input.home]   the home currency, null when none is set
 * @param {boolean} [input.homeFirst]             prefs.homeCurrencyFirst
 * @param {number} [input.budgetDaily]            trips.budget_daily, per person, in the trip currency
 * @param {number} [input.dayCount]
 * @returns {import('../views/contract.js').CostEstimate}
 */
export function costEstimate({ activities, total, excluded, tripCode, tripSymbol, home, homeFirst, budgetDaily, dayCount } = {}) {
  const code = codeOf(tripCode);
  const sum = Array.isArray(activities) ? sumCosts(activities, code) : { total: Number(total) || 0, excluded: Number(excluded) || 0 };
  const homeCode = codeOf(home?.code);
  const converts = homeCode !== '' && homeCode !== code && canConvert(code) && canConvert(homeCode);
  // Two currencies side by side under one symbol (yen and yuan are both "¥") cannot be told apart:
  // both are then printed with their ISO codes. One currency on its own keeps its symbol.
  const tripMark = clearSymbol(tripSymbol, code);
  const shared = converts && tripMark !== '' && tripMark === clearSymbol(home.symbol, homeCode);
  const [localSymbol, homeSymbol] = shared ? ['', ''] : [tripSymbol, home?.symbol];
  const inHome = (figure) => (figure && converts ? money(convert(figure.amount, code, homeCode), homeCode, homeSymbol) : null);

  const local = money(sum.total, code, localSymbol);
  const homeFigure = inHome(local);
  const budget = money((Number(budgetDaily) || 0) * (Number(dayCount) || 0), code, localSymbol);
  return {
    basis: COST_BASIS,
    local,
    home: homeFigure,
    homeFirst: Boolean(homeFirst) && homeFigure !== null,
    excluded: sum.excluded,
    budget,
    budgetHome: inHome(budget),
  };
}

const about = (figure) => `about ${figure.text}`;
const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The figures of a cost in the order they are shown.
 *
 * The rule for "about": a figure carries it exactly when it was converted from the trip currency
 * into the home currency, wherever it stands. So a plan priced in the home currency never says
 * "about" (there is nothing to convert: `home` is null), and neither does a plan whose currency
 * has no rate or an account with no home currency. A row of such a plan beside converted ones is
 * right as it is.
 * `lead` is the home figure when the cost is home first, else the local one; `other` is the one
 * that follows ('' when there is no home figure); `budget` is the budget in the currency of `lead`.
 * @param {import('../views/contract.js').CostEstimate|null} cost
 * @returns {{ lead: string, other: string, budget: string }} all '' when there is no cost
 */
export function costFigures(cost) {
  const local = cost?.local ?? null;
  const home = cost?.home ?? null;
  const homeLeads = Boolean(cost?.homeFirst) && home !== null;
  const budget = homeLeads && cost?.budgetHome ? about(cost.budgetHome) : cost?.budget?.text ?? '';
  if (!local) return { lead: '', other: '', budget };
  if (homeLeads) return { lead: about(home), other: local.text, budget };
  return { lead: local.text, other: home ? about(home) : '', budget };
}

/**
 * The one sentence for a cost: "about S$1,090 per person, activities only. HKD 6,347", or the
 * local figure first when the cost is not home first, or the local figure alone.
 * @param {import('../views/contract.js').CostEstimate|null} cost
 * @returns {string} '' when there is no cost
 */
export function costText(cost) {
  const { lead, other } = costFigures(cost);
  if (!lead) return '';
  return `${lead} ${COST_BASIS_TEXT}${other ? `. ${capitalise(other)}` : ''}`;
}
