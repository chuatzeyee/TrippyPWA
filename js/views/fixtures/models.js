// Hand-written model fixtures with invented data, one per state, that conform to the typedefs in
// js/views/contract.js. Views and the contract tests render these. Steward: F0.
export { DASHBOARD_FIXTURES } from './dashboard-models.js';
export { TRIP_FIXTURES } from './trip-models.js';

const PREFS = Object.freeze({
  view: 'atlas', viewChooserSeen: false, theme: 'system', motion: 'system', timeFormat: '12h', temperatureUnit: 'C',
  homeCurrencyFirst: true, openTodayFirst: true, autoOpenNextDay: true, showVenuePhotos: true,
});

// The notes block a controller hands to a trip landing. A view must place it exactly once, in `hero`.
const NOTES = '<div class="td-status-slot" data-fixture="notes"></div><div class="td-photo-status" hidden></div>';

/**
 * A ViewCtx for string rendering: first render, dark theme, motion allowed. `onCleanup` and `onPatched`
 * accept a function and do nothing, since no DOM exists here.
 */
export const CTX_FIXTURE = Object.freeze({
  prefs: PREFS, theme: 'dark', reducedMotion: false, animate: true, baseUrl: '/',
  slots: Object.freeze({ notes: NOTES }),
  onCleanup() {}, onPatched() {},
});
