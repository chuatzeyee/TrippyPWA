// The Concierge trip landing (blueprint 3.4): the parts a trip page is built around. The bar and the
// tab list are the shared ones; the hero, the brief and the sections between the cards are in
// trip-hero.js, trip-brief.js and trip-between.js. The controller decides the nesting, draws the
// section and day cards and the page foot, and handles every hook. Owner: VB.
import { scrollBehavior } from '../../lib/motion.js';
import { tabsHtml } from '../shared/tabs.js';
import { topbarHtml } from '../shared/trip-topbar.js';
import { heroHtml } from './trip-hero.js';
import { planIntroHtml } from './trip-brief.js';
import { betweenHtml, outroHtml } from './trip-between.js';

/** Viewport width from which the tab list docks in the bar (one row: Trips, the name, tabs, actions). */
const TABS_DOCK_FROM = 1024;
/** Width from which Flights, Entry requirements and Where to stay are sections of their own, open. */
const SECTIONS_OPEN_FROM = 768;
const TAB_KEYS = ['plan', 'spending', 'prep', 'towns'];

/** The section cards to open on a wide first render: the travel card this plan has, entry and the stay. */
function openSections(model) {
  if (!model.days.length) return [];
  const travel = model.readiness?.items.find((item) => item.area === 'travel')?.target
    ?? (model.route?.kind === 'ground' ? 'transport' : 'flights');
  return [travel === 'transport' ? 'transport' : 'flights', 'entry', 'accommodation'];
}

/**
 * @param {import('../contract.js').TripOverviewModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 * @returns {import('../contract.js').TripLandingParts}
 */
export function renderTripLanding(model, ctx) {
  return {
    bar: topbarHtml(model, { tabsSlotFrom: TABS_DOCK_FROM }),
    hero: heroHtml(model, ctx),
    tabs: tabsHtml('plan'),
    planIntro: planIntroHtml(model, ctx),
    between: betweenHtml(model, ctx),
    planOutro: outroHtml(model),
    openSections: openSections(model),
    openSectionsMinWidth: SECTIONS_OPEN_FROM,
  };
}

/**
 * Two controls of the landing have no controller hook: a tile or link that opens another tab
 * (data-con-tab) and the line that jumps to Before you go (data-con-scroll). Both hand over to what
 * is already on the page: the tab's own button, and a scroll. One delegated listener on the root.
 * @param {Element} root  the .td-wrap element
 * @param {import('../contract.js').TripOverviewModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 */
export function mountTripLanding(root, model, ctx) {
  void model;
  const control = new AbortController();
  root.addEventListener('click', (event) => {
    const el = event.target?.closest?.('[data-con-tab], [data-con-scroll]');
    if (!el || !root.contains(el)) return;
    const key = el.getAttribute('data-con-tab');
    if (key) {
      if (!TAB_KEYS.includes(key)) return;
      const tab = root.querySelector(`.td-tab[data-tab="${key}"]`);
      if (!tab) return;
      tab.click();
      tab.focus({ preventScroll: true });
      root.querySelector(`#td-panel-${key}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      return;
    }
    if (el.getAttribute('data-con-scroll') === 'readiness') root.querySelector('[data-region="readiness"]')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }, { signal: control.signal });
  ctx.onCleanup?.(() => control.abort());
}
