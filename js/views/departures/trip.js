// The departures trip landing (blueprint 3.1, 3.4): the six parts the controller places around the
// classic section and day cards. The bar and the tab list are the shared ones; the hero and the Plan
// panel parts are built in their own files of this folder. Owner: VA.
import { topbarHtml } from '../shared/trip-topbar.js';
import { tabsHtml } from '../shared/tabs.js';
import { drawCtx } from './parts.js';
import { heroHtml } from './trip-hero.js';
import { beforeYouGoHtml, betweenHtml, outroHtml } from './trip-plan.js';

/** Viewport width in px from which the tab list docks in the bar. */
const TABS_DOCK_FROM = 1024;

/**
 * @param {import('../contract.js').TripOverviewModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 * @returns {import('../contract.js').TripLandingParts}
 */
export function renderTripLanding(model, given) {
  const ctx = drawCtx(given);
  return {
    // Trips, the name with its dates, More. From 1024 px also Share, Export PDF and Edit trip, and the docked tabs.
    bar: topbarHtml(model, { tabsSlotFrom: TABS_DOCK_FROM }),
    hero: heroHtml(model, ctx),
    // The back arrow shows only while the row is pinned on its own: on phones the bar scrolls away.
    tabs: tabsHtml('plan', { withBack: true }),
    planIntro: beforeYouGoHtml(model, ctx),
    between: betweenHtml(model, ctx),
    planOutro: outroHtml(),
    // A section card opens when its row of "Before you go" is used, never by itself.
    openSections: [],
    openSectionsMinWidth: 0,
  };
}

/**
 * Optional in the contract. The controller mounts the menus, the photo frames, the flap digits, the
 * map and the pinned-row watchers, and binds every hook; this view adds no behaviour of its own.
 */
export function mountTripLanding(root, model, ctx) {
  void root; void model; void ctx;
}
