// The wizard state of a comparison trip (js/lib/trip-compare.js): what the wizard would hand to
// generation for an imported trip's place, dates and travellers. Pure: no DOM, no network.
import { defaultState, fixedDayCount, MAX_TRIP_DAYS } from './wizard-state.js';
import { DEFAULT_PACE } from '../lib/trip-compare.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Why a comparison cannot start with these inputs: a sentence, or '' when it can. */
export function compareInputError(inputs) {
  if (!text(inputs?.destination)) return 'This plan has no destination, so Trippy cannot plan the same trip.';
  if (!ISO_DATE.test(text(inputs.start)) || !ISO_DATE.test(text(inputs.end))) return 'Add the start and end dates first.';
  const days = fixedDayCount(inputs);
  if (days < 1) return 'The end date is before the start date.';
  if (days > MAX_TRIP_DAYS) return `Trippy plans trips of up to ${MAX_TRIP_DAYS} days.`;
  if (!(Number(inputs.dailyAmount) > 0)) return 'Add a daily budget.';
  return '';
}

/**
 * The wizard state of the comparison trip: what the wizard would hand to generation for the same
 * place, dates and travellers, plus `compareOf`. Nothing of the imported plan itself is passed on,
 * so the two plans are written independently.
 * @param {object} trip    the imported trip row
 * @param {object} inputs  compareInputs(trip), as edited
 * @returns {object}
 */
export function buildCompareWizardState(trip, inputs) {
  const base = defaultState();
  const ws = trip?.wizard_state ?? {};
  const pace = Math.min(5, Math.max(1, Math.trunc(Number(inputs.pace)) || DEFAULT_PACE));
  const dates = { start: inputs.start, end: inputs.end };
  return {
    ...base,
    currentStep: 7,
    furthestStep: 7,
    destination: ws.destination ?? null,
    destinations: [],
    multiCity: false,
    dates: { ...base.dates, mode: 'fixed', ...dates, duration: fixedDayCount(dates) },
    budget: { preset: null, dailyAmount: Math.round(Number(inputs.dailyAmount)) },
    accommodation: { ...base.accommodation, type: 'hotel' },
    style: { ...base.style, pace },
    travelers: Math.min(20, Math.max(1, Math.trunc(Number(inputs.travelers)) || 1)),
    ...(Array.isArray(ws.passports) ? { passports: ws.passports } : {}),
    compareOf: trip.id,
  };
}
