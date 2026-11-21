// The one tab list of the trip page, with the classic tab hooks (blueprint 3.4, 4.2). Owner: F6.
//
// The classes and data-tab are what bindTabs, activateTab and captureViewState of trip-detail.js look
// for. Ruling R3 pins the ids: a tab is id="td-tab-<key>" with aria-controls="td-panel-<key>". The
// controller keeps td-tab--active, aria-selected and tabindex in step and moves this one node into the
// bar's tabs slot on wide screens, so nothing in the markup says where the list stands.
import { attr, cls, esc } from './html.js';
import { ICON_NAMES, icon } from './icons.js';

const pick = (wanted, fallback) => (ICON_NAMES.includes(wanted) ? wanted : fallback);

/** The tabs in page order. `key` is the classic data-tab value ('towns' is the Discover tab). */
export const TRIP_TABS = Object.freeze([
  Object.freeze({ key: 'plan', label: 'Plan', icon: 'calendar' }),
  Object.freeze({ key: 'spending', label: 'Spending', icon: 'wallet' }),
  Object.freeze({ key: 'prep', label: 'Prep', icon: pick('checklist', 'check') }),
  Object.freeze({ key: 'towns', label: 'Discover', icon: pick('compass', 'map') }),
]);

function tabHtml(tab, active) {
  const classes = cls('td-tab', { 'td-tab--active': active });
  return `<button type="button" class="${classes}" data-tab="${tab.key}" role="tab" id="td-tab-${tab.key}" aria-selected="${active}" aria-controls="td-panel-${tab.key}" tabindex="${active ? 0 : -1}" data-focus-key="tab-${tab.key}">${icon(tab.icon, 18)}<span class="tv-tab-label">${esc(tab.label)}</span></button>`;
}

/**
 * The tab list: exactly one element, `nav.td-tabs[role=tablist]`.
 * @param {'plan'|'spending'|'prep'|'towns'} [activeKey] any other value reads as 'plan'
 * @param {{ withBack?: boolean, label?: string }} [opts]
 *   withBack  leads the row with a compact link to the trip list (class tv-tabs-back). The shared
 *             styles show it only while the row is pinned on its own (data-stuck from observeStuck),
 *             for a view whose bar scrolls away on phones.
 *   label     the accessible name of the list, "Trip sections" by default
 */
export function tabsHtml(activeKey, { withBack = false, label = 'Trip sections' } = {}) {
  const active = TRIP_TABS.some((tab) => tab.key === activeKey) ? activeKey : 'plan';
  const back = withBack ? `<a href="#/" class="tv-tabs-back" data-focus-key="tabs-back" aria-label="Trips">${icon('back', 18)}</a>` : '';
  return `<nav class="td-tabs" role="tablist"${attr('aria-label', label)}>${back}${TRIP_TABS.map((tab) => tabHtml(tab, tab.key === active)).join('')}</nav>`;
}
