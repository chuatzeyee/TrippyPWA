// The Atlas trip landing (blueprint 3.1 and 3.4): the bar, the hero, the tab list, what stands in the
// Plan panel before, between and after the classic cards. The bar pins at every width and the tab
// list is a row of its own that does not pin; from 1024 px the map sits beside the cover, below that
// on the trip map board over "Day by day". The parts are in trip-hero.js and trip-plan.js. Owner: VC.
import { scrollBehavior } from '../../lib/motion.js';
import { tabsHtml } from '../shared/tabs.js';
import { topbarHtml } from '../shared/trip-topbar.js';
import { heroHtml } from './trip-hero.js';
import { betweenHtml, planIntroHtml, planOutroHtml } from './trip-plan.js';

/** The section cards that open on first render: shown as titled sections of the page, at every width. */
const OPEN_SECTIONS = Object.freeze(['flights', 'transport', 'entry', 'accommodation']);

/** @returns the six landing parts, the sections to open (blueprint 3.1) and the day panel switch */
export function renderTripLanding(model, ctx) {
  return {
    bar: topbarHtml(model),
    hero: heroHtml(model, ctx),
    tabs: tabsHtml('plan'),
    planIntro: planIntroHtml(model),
    between: betweenHtml(model, ctx),
    planOutro: planOutroHtml(model),
    openSections: [...OPEN_SECTIONS],
    openSectionsMinWidth: 0,
    // The open day card gets the shared day panel beside its stops on wide screens.
    dayAside: true,
  };
}

/**
 * Called once per trip render with the .td-wrap element. Two things on this page have no controller
 * hook: the Ready fact of the glance ledger and the first two in-page links lead to a part of the
 * landing itself. They scroll there and move the focus with them.
 */
export function mountTripLanding(root, model, ctx) {
  void model;
  const onClick = (event) => {
    const el = event.target instanceof Element ? event.target.closest('[data-glance-jump="readiness"], [data-atl-jump]') : null;
    if (!el || !root.contains(el)) return;
    const name = el.hasAttribute('data-atl-jump') ? el.getAttribute('data-atl-jump') : 'ready';
    const target = root.querySelector(`[data-atl-target="${name === 'days' ? 'days' : 'ready'}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    target.focus({ preventScroll: true });
  };
  root.addEventListener('click', onClick);
  ctx?.onCleanup?.(() => root.removeEventListener('click', onClick));
}
