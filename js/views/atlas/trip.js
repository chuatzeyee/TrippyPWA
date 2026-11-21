// The Atlas trip landing (blueprint 3.1 and 3.4): the bar, the hero, the tab list, what stands in the
// Plan panel before, between and after the classic cards. The bar pins at every width and the tab
// list is a row of its own that does not pin; from 1024 px the map sits beside the cover, below that
// on the trip map board over "Day by day". The parts are in trip-hero.js and trip-plan.js. Owner: VC.
import { scrollBehavior } from '../../lib/motion.js';
import { tabsHtml } from '../shared/tabs.js';
import { topbarHtml } from '../shared/trip-topbar.js';
import { heroHtml } from './trip-hero.js';
import { betweenHtml, planIntroHtml, planOutroHtml } from './trip-plan.js';

/** @returns the six landing parts, the sections to open (blueprint 3.1) and the day panel switch */
export function renderTripLanding(model, ctx) {
  return {
    bar: topbarHtml(model),
    hero: heroHtml(model, ctx),
    tabs: tabsHtml('plan'),
    planIntro: planIntroHtml(model),
    between: betweenHtml(model, ctx),
    planOutro: planOutroHtml(model),
    // Every section starts closed: on a wide screen its card in the essentials row says where it stands.
    openSections: [],
    openSectionsMinWidth: 0,
    // The open day card gets the shared day panel beside its stops on wide screens.
    dayAside: true,
  };
}

const SECTION_CARD = '.td-day-card--section[data-section]';
const isOpen = (card) => Boolean(card?.classList.contains('td-day-card--open'));

/** Each card of the essentials row follows its section card: hidden when the plan has none, pressed while it is open. */
function syncEssentials(root) {
  for (const tab of root.querySelectorAll('[data-atl-ess]')) {
    const card = root.querySelector(`${SECTION_CARD}[data-section="${tab.getAttribute('data-atl-ess')}"]`);
    if (tab.hidden !== !card) tab.hidden = !card;
    const open = String(isOpen(card));
    if (tab.getAttribute('aria-expanded') !== open) tab.setAttribute('aria-expanded', open);
  }
}

/** A card of the row opens its section as the one panel under the row, or closes it. The classic header does the work. */
function toggleSection(root, name) {
  const cards = [...root.querySelectorAll(SECTION_CARD)];
  const card = cards.find((entry) => entry.dataset.section === name);
  if (!card) return;
  if (!isOpen(card)) for (const other of cards) if (other !== card && isOpen(other)) other.querySelector('.td-day-card-header')?.click();
  card.querySelector('.td-day-card-header')?.click();
  syncEssentials(root);
}

/**
 * Called once per trip render with the .td-wrap element. The Ready fact of the glance ledger and the
 * first in-page links lead to a part of the landing itself: they scroll there and move the focus
 * with them. The essentials row opens and closes the section cards, and follows them when something
 * else does (a jump link, a patch of the row).
 */
export function mountTripLanding(root, model, ctx) {
  void model;
  const onClick = (event) => {
    const from = event.target instanceof Element ? event.target : null;
    const tab = from?.closest('[data-atl-ess]');
    if (tab && root.contains(tab)) { toggleSection(root, tab.getAttribute('data-atl-ess')); return; }
    const el = from?.closest('[data-glance-jump="readiness"], [data-atl-jump]');
    if (!el || !root.contains(el)) return;
    const name = el.hasAttribute('data-atl-jump') ? el.getAttribute('data-atl-jump') : 'ready';
    const target = root.querySelector(`[data-atl-target="${name === 'days' ? 'days' : 'ready'}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    target.focus({ preventScroll: true });
  };
  root.addEventListener('click', onClick);
  syncEssentials(root);
  const watch = typeof MutationObserver === 'function' ? new MutationObserver(() => syncEssentials(root)) : null;
  watch?.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  ctx?.onCleanup?.(() => { root.removeEventListener('click', onClick); watch?.disconnect(); });
}
