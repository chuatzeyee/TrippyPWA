// The trip landing controller, pure half (blueprint 3.1, 4.2). Owner: F11.
//
// js/components/trip-detail.js stays the trip page: it loads the trip and the view, draws the classic
// cards and binds everything. This file holds what a landing adds that needs no page, in this order:
//   - pure HTML: the notes, the status card, the assembly of the page around the classic cards
//     (classic output byte for byte when there is no landing), the two skeletons, the budget ring;
//   - pure rules: when the page opens on today, open=<section>, tab keys, which parts each change
//     refreshes, what the entry check reads as, where the tab list and the map go at a width;
//   - the helpers the fixture page shares with the trip page (the nav flag, tabs, the active day,
//     section jumps);
//   - the model and the view's parts for it: buildLanding() for a render, redrawLanding() for a refresh.
// What needs the page (mounting, patching, the map, the timers) is js/components/trip-landing-mount.js.
//
// No import here reaches js/data, js/services or js/lib/supabase.js, so the tests load this file in
// plain Node. The caller passes what comes from those layers (prefs, the profile, the user, the role,
// the ticks).
import { esc } from '../views/shared/html.js';
import { dayCardExtrasHtml, dayAsideHtml } from '../views/shared/day-extras.js';
import { prepCardHtml } from '../views/shared/readiness-list.js';
import { tripFootHtml } from '../views/shared/credits.js';
import { formatClock, getLocale } from '../lib/locale.js';
import { buildTripOverviewModel, dayAsideModels } from '../lib/trip-overview-model.js';
import { costFigures, COST_BASIS_TEXT } from '../lib/money.js';

/** The six strings a view returns, in page order. */
export const LANDING_PARTS = Object.freeze(['bar', 'hero', 'tabs', 'planIntro', 'between', 'planOutro']);
/** Sections a jump can open: the four section cards of the Plan tab and the booking checklist in Prep. */
export const SECTION_TARGETS = Object.freeze(['flights', 'transport', 'entry', 'accommodation', 'checklist']);

const localeOr = (locale) => {
  if (locale) return locale;
  try { return getLocale(); } catch { return 'en-GB'; }
};
const paramOf = (query, name) => {
  try {
    return (query instanceof URLSearchParams ? query : new URLSearchParams(String(query ?? ''))).get(name);
  } catch {
    return null;
  }
};

// ===== Notes: the stale note, the status slot and the photo status =====

/** "9 Mar at 6:05 PM" in the clock format of the user; '' when the time cannot be read. */
function savedWhen(cachedAt, locale) {
  const date = new Date(cachedAt);
  if (!cachedAt || Number.isNaN(date.getTime())) return '';
  const day = new Intl.DateTimeFormat(localeOr(locale), { day: 'numeric', month: 'short' }).format(date);
  return `${day} at ${formatClock(`${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`)}`;
}

/**
 * The three lines under the hero. With no saved time this is what the classic template printed, byte
 * for byte (the line breaks are part of it); a view gets the same string as ctx.slots.notes.
 * @param {{ stale?: boolean, cachedAt?: string|null, statusHtml?: string, locale?: string }} [input]
 *   statusHtml is trusted markup (the status card); cachedAt is when the copy on this device was saved
 * @returns {string}
 */
export function notesHtml({ stale = false, cachedAt = null, statusHtml = '', locale } = {}) {
  const when = stale ? savedWhen(cachedAt, locale) : '';
  const text = when ? `Offline, showing your copy saved ${when}` : 'Offline, showing your last saved copy';
  const note = stale ? `<div class="td-stale-note" role="status">${esc(text)}</div>` : '';
  return `${note}\n      <div class="td-status-slot">${statusHtml}</div>\n      <div class="td-photo-status" role="status" hidden></div>`;
}

/**
 * The card in the status slot: a plan being built, a plan that failed, a plan with no days; '' for a
 * settled plan with days. Moved from trip-detail.js with the same bytes; it holds no trip value.
 * @param {object} trip
 * @param {{ canRetry?: boolean }} [opts] canRetry: the user owns the plan, so may restart planning
 * @returns {string}
 */
export function statusCardHtml(trip, { canRetry = false } = {}) {
  const hasDays = (trip.itinerary_days || []).length > 0;
  if (trip.status === 'generating') {
    return `
      <div class="td-status-card" role="status" data-trip-status="generating">
        <span class="td-status-spinner" aria-hidden="true"></span>
        <div class="td-status-text">
          <strong>${hasDays ? 'Building a new itinerary' : 'Building your itinerary'}</strong>
          <p>${hasDays ? "You're seeing your current plan until the new one is ready." : 'This usually takes 1 to 2 minutes. You can leave this page and come back.'}</p>
        </div>
      </div>`;
  }
  if (trip.status === 'failed') {
    return `
      <div class="td-status-card td-status-card--failed" role="alert" data-trip-status="failed">
        <div class="td-status-text">
          <strong>${hasDays ? "We couldn't build a new itinerary" : "We couldn't build this itinerary"}</strong>
          <p>${hasDays ? 'Your current plan is unchanged.' : 'Something went wrong while planning this trip.'}</p>
        </div>
        ${canRetry ? '<button type="button" class="btn btn--primary btn--pill btn--sm" data-action="retry-generation">Try again</button>' : ''}
      </div>`;
  }
  if (!hasDays) {
    return `
      <div class="td-status-card" data-trip-status="empty">
        <div class="td-status-text">
          <strong>No days planned yet</strong>
          <p>${trip.wizard_state?.imported ? 'This trip was imported without any days.' : 'Regenerate the itinerary to fill in your days.'}</p>
        </div>
        ${trip.wizard_state?.imported ? '' : '<button type="button" class="btn btn--primary btn--pill btn--sm" data-action="regenerate-empty">Edit and regenerate</button>'}
      </div>`;
  }
  return '';
}

// ===== Assembly (blueprint 3.1) =====

const panelAttrs = (key) => ` role="tabpanel" id="td-panel-${key}" aria-labelledby="td-tab-${key}"`;

/**
 * The Plan panel around the classic section cards and day cards.
 * With `landing` null the result is the classic panel byte for byte (sidebar, square host, plan
 * footer). With a landing it is the nesting of blueprint 3.1, in this order:
 *   .tv-landing.tv-landing--intro (landing.planIntro)
 *   .td-body > .td-main > .td-day-grid: sectionCardsHtml, .tv-between (landing.between), dayCardsHtml
 *   .tv-landing.tv-landing--outro (landing.planOutro)
 * and the panel carries role, id td-panel-plan and aria-labelledby. The .tv-between wrapper is left
 * out when the view returned nothing for it. Every *Html argument is trusted markup.
 * @param {{ landing?: object|null, sectionCardsHtml?: string, dayCardsHtml?: string, tz?: string,
 *   sidebarHtml?: string, backButtonHtml?: string, deleteButtonHtml?: string }} [input]
 *   tz is the trip timezone for data-tz; the last three are classic only
 * @returns {string}
 */
export function assemblePlanPanel({
  landing = null, sectionCardsHtml = '', dayCardsHtml = '', tz = '', sidebarHtml = '', backButtonHtml = '', deleteButtonHtml = '',
} = {}) {
  if (!landing) {
    return `<div class="td-tab-panel td-tab-panel--active" data-panel="plan">
        <div class="td-square-itinerary square-only" id="td-square-itinerary"></div>
        <div class="td-body scroll-only">
          ${sidebarHtml}
          <div class="td-main">
            <div class="td-day-grid" data-tz="${esc(tz)}">
          ${sectionCardsHtml}${dayCardsHtml}
            </div>
          </div>
        </div>
        <div class="td-plan-footer">
          ${backButtonHtml}
          ${deleteButtonHtml}
        </div>
      </div>`;
  }
  const between = String(landing.between ?? '').trim() ? `<div class="tv-between">${landing.between}</div>` : '';
  return `<div class="td-tab-panel td-tab-panel--active" data-panel="plan"${panelAttrs('plan')}>
  <div class="tv-landing tv-landing--intro">${landing.planIntro ?? ''}</div>
  <div class="td-body"><div class="td-main"><div class="td-day-grid" data-tz="${esc(tz)}">
    ${sectionCardsHtml}
    ${between}
    ${dayCardsHtml}
  </div></div></div>
  <div class="tv-landing tv-landing--outro">${landing.planOutro ?? ''}</div>
</div>`;
}

/**
 * The Spending, Prep and Discover panels. Classic byte for byte without a landing; with one, each
 * panel is named for its tab (role, id td-panel-<key>, aria-labelledby td-tab-<key>) and starts hidden.
 * @param {{ landing?: object|null, spendingHtml?: string, quickChecklistHtml?: string, bookingChecklistHtml?: string }} [input]
 * @returns {string}
 */
export function assembleSidePanels({ landing = null, spendingHtml = '', quickChecklistHtml = '', bookingChecklistHtml = '' } = {}) {
  const extra = (key) => (landing ? `${panelAttrs(key)} hidden` : '');
  return `<div class="td-tab-panel" data-panel="spending"${extra('spending')}>
        <div class="td-spending-grid">
          ${spendingHtml}
        </div>
      </div>

      <div class="td-tab-panel" data-panel="prep"${extra('prep')}>
        <div class="td-prep-grid">
          <div id="td-visa-slot"></div>
          ${quickChecklistHtml}
          ${bookingChecklistHtml}
        </div>
      </div>

      <div class="td-tab-panel" data-panel="towns"${extra('towns')}>
        <div class="td-towns" id="td-towns"></div>
      </div>`;
}

/**
 * The children of .td-wrap in view mode, in the order of blueprint 3.1: the bar, the hero in its
 * wrapper, the tab list, the Plan panel, the other panels, the foot. The bar and the tab list stay
 * direct children of the wrap, which is what lets them pin for the whole page.
 * @param {{ landing: object, planPanelHtml?: string, sidePanelsHtml?: string, footHtml?: string }} input
 * @returns {string}
 */
export function assembleLandingWrap({ landing, planPanelHtml = '', sidePanelsHtml = '', footHtml = '' }) {
  return `${landing.bar}
<div class="tv-landing tv-landing--hero">${landing.hero}</div>
${landing.tabs}
${planPanelHtml}
${sidePanelsHtml}
${footHtml}`;
}

// ===== Opening the page =====

/**
 * Whether the page opens on today's day card (blueprint 4.2). today=1 jumps, today=0 never does,
 * and with neither the pref decides for a live plan. A reload of the route never jumps again.
 * @param {string|URLSearchParams|null} query the part of the address after "?"
 * @param {{ openTodayFirst?: boolean }|null} prefs
 * @param {'live'|'upcoming'|'past'|'undated'} phase
 * @param {{ reload?: boolean }} [opts]
 * @returns {boolean}
 */
export function shouldJumpToToday(query, prefs, phase, { reload = false } = {}) {
  if (reload) return false;
  const today = paramOf(query, 'today');
  if (today === '1') return true;
  if (today === '0') return false;
  return Boolean(prefs?.openTodayFirst) && phase === 'live';
}

/**
 * Whether a redraw of the route rebuilds a page the user has seen. A redraw that overtakes the first
 * draw of a trip (prefs from another device, a session restored late) is the first draw: it makes the
 * today and open= jumps, which a rebuild leaves alone.
 * @param {boolean} reload the router is drawing the route again
 * @param {string|null} openedTripId the trip whose draw was finished since the last navigation
 * @param {string} tripId the trip being drawn
 * @returns {boolean}
 */
export function isRebuild(reload, openedTripId, tripId) {
  return Boolean(reload) && Boolean(tripId) && openedTripId === tripId;
}

/**
 * The block that marks the user's place on the page. Of the blocks in sight (reaching below their
 * resting line, starting above the bottom of the viewport), the first that starts at or after its
 * resting line when that is in the upper half of the viewport: a card the user has jumped to, whatever
 * is left of the card before it. Else the first in sight: the long card the user is reading inside. A
 * tab panel is the mark only while no card is in sight (the Plan panel holds every card).
 * @param {{ key: string, top: number, bottom: number }[]} boxes in page order, px from each block's resting line
 * @param {{ scrollY?: number, height?: number }} [port] how far the page has scrolled, the viewport's height
 * @returns {{ key: string, offset: number }|null} null at the top of the page or with no block in sight
 */
export function placeAnchor(boxes, { scrollY = 0, height = 0 } = {}) {
  if (!(scrollY > 0) || !Array.isArray(boxes)) return null;
  const inSight = boxes.filter((box) => box && Number.isFinite(box.top) && Number.isFinite(box.bottom) && box.bottom > box.top && box.bottom > 0 && box.top < height);
  const cards = inSight.filter((box) => !String(box.key).startsWith('panel:'));
  const pool = cards.length ? cards : inSight;
  const starting = pool.find((box) => box.top >= -1);
  const mark = starting && starting.top < height / 2 ? starting : pool[0];
  return mark ? { key: String(mark.key), offset: Math.round(mark.top) } : null;
}

/** @returns {string} the section named by open=<section>, '' when it is not one the page can open */
export function openSectionFrom(query) {
  const name = paramOf(query, 'open');
  return SECTION_TARGETS.includes(name) ? name : '';
}

/**
 * Where an arrow, Home or End key moves in the tab list. The ends wrap.
 * @returns {number} the next index, or -1 when the key does not move
 */
export function nextTabIndex(key, index, count) {
  if (!(count > 0)) return -1;
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return -1;
}

const SKELETON_DAY = `
    <div class="td-skel-day">
      <div class="td-skel-num skel-shimmer"></div>
      <div class="td-skel-lines">
        <div class="td-skel-line skel-shimmer"></div>
        <div class="td-skel-line td-skel-line--short skel-shimmer"></div>
      </div>
    </div>`;

/** The loading screen of the classic page (moved from trip-detail.js, same bytes). */
export function classicSkeletonHtml() {
  const day = SKELETON_DAY;
  return `
    <div class="td-wrap td-skel" role="status" aria-busy="true">
      <span class="td-skel-label">Loading trip</span>
      <div class="td-skel-topbar">
        <div class="td-skel-tabs skel-shimmer"></div>
        <div class="td-skel-actions skel-shimmer"></div>
      </div>
      <div class="td-skel-hero skel-shimmer"></div>
      <div class="td-skel-days">${day}${day}${day}</div>
    </div>`;
}

/**
 * The loading screen while a view is preferred: a bar with a working link back, a hero block and
 * three rows. Built from the classic .td-skel-* classes plus two rules in trip-detail.css, so it
 * needs no view CSS.
 * @returns {string}
 */
export function landingSkeletonHtml() {
  const day = SKELETON_DAY;
  return `
    <div class="td-wrap td-skel td-skel--landing" role="status" aria-busy="true">
      <span class="td-skel-label">Loading trip</span>
      <div class="td-skel-bar">
        <a href="#/" class="td-skel-back">Trips</a>
        <div class="td-skel-actions skel-shimmer"></div>
      </div>
      <div class="td-skel-hero skel-shimmer"></div>
      <div class="td-skel-days">${day}${day}${day}</div>
    </div>`;
}

// ===== Page behaviour (DOM), shared with the fixture page =====

/**
 * html[data-trip-view] moves the app nav out of the way while a trip page shows a view (nav.css). It
 * is set before the skeleton paints and removed whenever the page is, or becomes, classic.
 * @param {string|null} viewId null removes it
 */
export function setTripViewFlag(viewId) {
  const root = document.documentElement;
  if (viewId) root.dataset.tripView = viewId;
  else delete root.dataset.tripView;
}

/** The bottom edge of what a landing keeps pinned (the bar, the tab row), in viewport px; 0 when nothing pins. */
function pinnedBottom(wrap) {
  const pinned = [wrap.querySelector(':scope > .tv-bar'), wrap.querySelector('.td-tabs')]
    .filter((el) => el && getComputedStyle(el).position === 'sticky');
  return Math.max(0, ...pinned.map((el) => el.getBoundingClientRect().bottom));
}

/** Keeps aria-expanded on every [data-section-jump] control in step with the card or tab it opens. */
export function syncSectionJumps(wrap) {
  wrap?.querySelectorAll('[data-section-jump]').forEach((el) => {
    const target = el.dataset.sectionJump;
    const open = target === 'checklist'
      ? wrap.dataset.activeTab === 'prep'
      : [...wrap.querySelectorAll('.td-day-card--section.td-day-card--open')].some((card) => card.dataset.section === target);
    el.setAttribute('aria-expanded', String(open));
  });
}

/**
 * Shows one tab: the classes, aria-selected and the roving tabindex. The tabindex moves only on a row
 * that has one (a view's tab list, or a row bindTabKeys bound): the square page binds no keys, so its
 * row keeps the classic markup. With a landing the panels also carry `hidden`, the wrap says which
 * tab is active (data-active-tab), and a page scrolled past the top of the new panel is brought back
 * to just under what is pinned.
 * @returns {boolean} false when there is no such tab
 */
export function showTab(container, key) {
  const tabs = [...container.querySelectorAll('.td-tab')];
  const tab = tabs.find((el) => el.dataset.tab === key);
  if (!tab) return false;
  const wrap = tab.closest('.td-wrap');
  const inView = Boolean(wrap?.dataset.view);
  const roving = tabs.some((el) => el.hasAttribute('tabindex'));
  for (const el of tabs) {
    el.classList.toggle('td-tab--active', el === tab);
    el.setAttribute('aria-selected', String(el === tab));
    if (roving) el.setAttribute('tabindex', el === tab ? '0' : '-1');
  }
  let shown = null;
  container.querySelectorAll('.td-tab-panel').forEach((panel) => {
    const on = panel.dataset.panel === key;
    panel.classList.toggle('td-tab-panel--active', on);
    if (inView) panel.hidden = !on;
    if (on) shown = panel;
  });
  if (!inView) return true;
  wrap.dataset.activeTab = key;
  syncSectionJumps(wrap);
  const limit = pinnedBottom(wrap);
  const top = shown ? shown.getBoundingClientRect().top : limit;
  if (top < limit) window.scrollBy(0, top - limit);
  return true;
}

/**
 * Roving tabindex for the tab list, and Left, Right, Home and End to move among the tabs. The keys
 * move focus only; Enter, Space or a click shows a tab, as before.
 */
export function bindTabKeys(container, { signal } = {}) {
  const tabs = [...container.querySelectorAll('.td-tab')];
  tabs.forEach((tab, index) => {
    tab.setAttribute('tabindex', tab.classList.contains('td-tab--active') ? '0' : '-1');
    tab.addEventListener('keydown', (event) => {
      const next = tabs[nextTabIndex(event.key, index, tabs.length)];
      if (!next) return;
      event.preventDefault();
      next.focus();
    }, { signal });
  });
}

/**
 * The day the reader is on, in a landing: marks its [data-day-jump] controls (class is-active) and
 * keeps a sideways strip ([data-keep-scroll]) on it. Never scrolls the page. The map's own "Open day N"
 * controls are left alone: the map compares its caption with what it wrote, and a class added there
 * would read as the view's new words.
 * @returns {boolean} false when the page has no landing (the classic sidebar handles it then)
 */
export function markActiveDay(container, dayIndex) {
  const wrap = container.matches?.('.td-wrap[data-view]') ? container : container.querySelector('.td-wrap[data-view]');
  if (!wrap) return false;
  wrap.querySelectorAll('[data-day-jump]').forEach((el) => {
    if (el.closest('[data-trip-map], [data-region="map-caption"]')) return;
    const on = el.dataset.dayJump === String(dayIndex);
    el.classList.toggle('is-active', on);
    const strip = on ? el.closest('[data-keep-scroll]') : null;
    if (strip) strip.scrollLeft += el.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - el.offsetWidth) / 2;
  });
  return true;
}


// ===== Keeping the landing true (blueprint 4.2) =====

/** Everything refreshLanding() can refresh: six regions of the view, the map, the day card blocks. */
export const REFRESH_PARTS = Object.freeze(['hero-status', 'glance', 'dayindex', 'readiness', 'bar-actions', 'map-caption', 'map', 'days']);

// 'map' is the map node and its caption; 'days' is the block in each day card header; 'readiness'
// also redraws the Trip prep card of the Prep tab, which is counted from the same object.
const CHANGES = Object.freeze({
  totals: Object.freeze(['glance', 'dayindex', 'map', 'days']),             // an editor save, an alternative swap, a delete
  photos: Object.freeze(['map', 'dayindex', 'days']),                       // coordinates or photos that arrived
  failed: Object.freeze(['hero-status', 'bar-actions', 'readiness', 'glance']), // planning stopped while the page was open
  status: Object.freeze(['hero-status', 'bar-actions', 'readiness', 'glance']), // planning started again (Try again)
  ticks: Object.freeze(['readiness', 'glance', 'hero-status']),             // a tick in Prep, the checklist or the entry card
  entry: Object.freeze(['readiness', 'glance', 'hero-status']),             // the entry check answered, or ran out of time
  role: Object.freeze(['bar-actions']),                                     // the role query answered
  clock: Object.freeze(['hero-status', 'dayindex']),                        // the date or the next stop moved on
  profile: Object.freeze(['hero-status', 'glance', 'readiness', 'dayindex', 'days']), // the profile summary arrived late
});
// Ruling R41: data that arrives after the first draw (the profile summary, the entry check) may show
// anywhere a view chose, so these changes patch every region the view drew, whatever its name. A view
// can rely on that for any [data-region] of its parts; in the hero and the bar the region must be in
// the markup from the first render (the contract), because those two are never drawn again whole.
const LATE = Object.freeze(['profile', 'entry']);
const NO_PARTS = Object.freeze([]);

/**
 * Which parts of the landing a change to the open plan refreshes.
 * @param {'totals'|'photos'|'failed'|'status'|'ticks'|'entry'|'role'|'clock'|'profile'} change
 * @returns {readonly string[]} names from REFRESH_PARTS; none for a change this page does not know
 */
export function landingParts(change) {
  return typeof change === 'string' && Object.hasOwn(CHANGES, change) ? CHANGES[change] : NO_PARTS;
}

/** @returns {boolean} whether a change is late data, which patches every region of the view (ruling R41) */
export function patchesEveryRegion(change) {
  return LATE.includes(change);
}

/** How long the Entry row may read "Checking" before it reads "Could not check". */
export const ENTRY_TIMEOUT_MS = 8000;

/**
 * What the model takes as `entry` (ruling R28): null only while the check is running.
 * @param {{ plan: object|null, reason: string|null }|[object|null, string|null]|null} answer
 *   the arguments of the entry card's last onPlan(plan, reason); null while none has arrived
 * @param {number} elapsedMs since the landing was mounted
 * @returns {object|{ reason: 'no-passport'|'failed' }|null} the plan as the card computed it; a reason
 *   when it had none; { reason: 'failed' } when nothing arrived within ENTRY_TIMEOUT_MS
 */
export function entryInputFrom(answer, elapsedMs) {
  if (answer) {
    const [plan, reason] = Array.isArray(answer) ? answer : [answer.plan, answer.reason];
    return plan || { reason: reason === 'no-passport' ? 'no-passport' : 'failed' };
  }
  return Number.isFinite(elapsedMs) && elapsedMs >= ENTRY_TIMEOUT_MS ? { reason: 'failed' } : null;
}

const widthOf = (value) => {
  const width = Number.parseFloat(value);
  return Number.isFinite(width) ? width : null;
};

/**
 * Whether the tab list sits in the bar's tabs slot at a viewport width (blueprint 3.4).
 * @param {string|number|null|undefined} slotFrom the slot's data-slot-from; null: the bar has no slot
 * @param {number} width viewport width in px
 * @returns {boolean} a slot that names no width takes the tab list at every width
 */
export function tabsDocked(slotFrom, width) {
  if (slotFrom === null || slotFrom === undefined) return false;
  const from = widthOf(slotFrom);
  return from === null || width >= from;
}

/**
 * Which map slot holds the one map node at a viewport width: the first whose range fits, from
 * data-map-from (inclusive) to data-map-below (exclusive). A bound that is missing does not limit.
 * @param {Array<{ from?: string|null, below?: string|null }>|null} slots in page order
 * @param {number} width viewport width in px
 * @returns {number} -1 when no slot fits: the map is then not on the page
 */
export function mapSlotIndex(slots, width) {
  return (Array.isArray(slots) ? slots : []).findIndex((slot) => {
    const from = widthOf(slot?.from);
    const below = widthOf(slot?.below);
    return (from === null || width >= from) && (below === null || width < below);
  });
}

/**
 * What a view asks of the map through its slot (ruling R29), as the options of tripMapHtml().
 * @param {{ full?: string|null, caption?: string|null }|null} asked data-map-full and data-map-caption
 * @returns {{ fullButton: boolean, captionId?: string }} fullButton false: the view draws its own
 *   "Open full map" control; captionId: the view's own caption element
 */
export function mapSlotOptions(asked) {
  const caption = String(asked?.caption ?? '').trim();
  return { fullButton: asked?.full !== 'off', ...(caption ? { captionId: caption } : {}) };
}

/** Whether two CoverModels show the same thing: the same photo address, or no photo. */
export function sameCover(a, b) {
  const shown = (cover) => (cover && cover.kind !== 'none' ? cover.src || '' : '');
  return shown(a) === shown(b);
}

/**
 * What a clock can change on the landing: the countdown or the day of the plan, and for a live
 * plan the next stop and the rest of today. The minute tick refreshes only when this differs.
 * @param {import('../views/contract.js').TripOverviewModel|null} model
 * @returns {string}
 */
export function clockKey(model) {
  return JSON.stringify([model?.phase ?? '', model?.statusText ?? '', model?.daysToGo ?? null, model?.live ?? null]);
}

// ===== The Spending tab and the Prep tab in view mode =====

/**
 * The Spending tab's total and ring from the cost of the model (js/lib/money.js): the home figure
 * leads when the user chose so, a converted amount says "about", and the basis is stated.
 * @param {import('../views/contract.js').CostEstimate|null} cost
 * @returns {{ lead: string, other: string, basis: string,
 *   ring: { spent: number, budget: number, spentHtml: string, budgetHtml: string, homeHtml: string } }}
 *   lead and other are plain text; ring is the input of budgetRingHtml(), per person like the cost
 */
export function spendingFigures(cost) {
  const { lead, other, budget } = costFigures(cost);
  return {
    lead, other, basis: COST_BASIS_TEXT.charAt(0).toUpperCase() + COST_BASIS_TEXT.slice(1),
    ring: { spent: cost?.local?.amount ?? 0, budget: cost?.budget?.amount ?? 0, spentHtml: esc(lead), budgetHtml: esc(budget), homeHtml: esc(other) },
  };
}

const RING_RADIUS = 52;

/**
 * The budget ring of the Spending tab. Moved from trip-detail.js with the same bytes; the caller
 * gives the figures as markup, so classic prints its own and a landing prints those of money.js.
 * @param {{ spent: number, budget: number, spentHtml: string, budgetHtml?: string, homeHtml?: string }} ring
 *   spent and budget draw the arc (in one currency); budget 0 leaves the "of" line out
 * @returns {string}
 */
export function budgetRingHtml({ spent, budget, spentHtml, budgetHtml = '', homeHtml = '' }) {
  const around = 2 * Math.PI * RING_RADIUS;
  const share = budget > 0 ? Math.min(spent / budget, 1) : 0;
  const colour = budget > 0 && spent > budget ? 'var(--error)' : 'var(--terracotta)';
  return `
    <div class="td-budget-ring">
      <svg class="td-budget-ring-svg" viewBox="0 0 120 120" width="132" height="132" aria-hidden="true">
        <circle cx="60" cy="60" r="${RING_RADIUS}" fill="none" stroke="var(--surface-inset)" stroke-width="10"></circle>
        <circle cx="60" cy="60" r="${RING_RADIUS}" fill="none" stroke="${colour}" stroke-width="10"
          stroke-linecap="round" stroke-dasharray="${(around * share).toFixed(1)} ${around.toFixed(1)}"
          transform="rotate(-90 60 60)"></circle>
      </svg>
      <div class="td-budget-ring-center">
        <span class="td-budget-ring-spent">${spentHtml}</span>
        ${budget > 0 ? `<span class="td-budget-ring-of">of ${budgetHtml}</span>` : ''}
        ${homeHtml ? `<span class="td-budget-ring-home">${homeHtml}</span>` : ''}
      </div>
    </div>`;
}

/**
 * The "Trip prep" card of the Prep tab in view mode, in a region of its own so a tick patches it in
 * place: the same areas, states and headline as "Before you go", from the same Readiness object.
 * @param {import('../views/contract.js').Readiness|null} readiness
 * @returns {string} the region is there even with nothing to prepare, so a later answer has a place
 */
export function prepSlotHtml(readiness) {
  return `<div class="td-prep-slot" data-region="prep-card">${prepCardHtml(readiness)}</div>`;
}

// ===== The model, and the view's parts for it =====

const isLandingParts = (parts) => Boolean(parts) && typeof parts === 'object'
  && LANDING_PARTS.every((key) => typeof parts[key] === 'string') && Array.isArray(parts.openSections);

/** One drawing of the landing: the model, the view's parts, and the markup the page itself adds. */
function drawLanding(viewMod, trip, input, ctx) {
  const model = buildTripOverviewModel({ ...input, trip });
  const parts = viewMod.renderTripLanding(model, ctx);
  if (!isLandingParts(parts)) throw new Error('the view did not return the landing parts');
  return {
    model, parts,
    dayExtras: model.days.map((row) => dayCardExtrasHtml(row, { animate: ctx.animate })),
    // The day panel of each day card ('' for a day without stops), only for a view that asks for it.
    dayAsides: parts.dayAside === true ? dayAsideModels({ trip, model, ticks: input.ticks }).map(dayAsideHtml) : model.days.map(() => ''),
    prepHtml: prepSlotHtml(model.readiness),
    footHtml: tripFootHtml(model.credits, { map: model.map.points.length > 0 }),
  };
}

/**
 * Renders the landing of view.viewMod for a trip, on the model of js/lib/trip-overview-model.js.
 * On success the parts are returned and view.landing is set to
 *   { model, parts, dayExtras, dayAsides, prepHtml, footHtml, ctx, facts, role, patched }:
 * dayExtras[i] is the inert block for the header of day card i, dayAsides[i] the day panel for its
 * body ('' unless the view's parts carry dayAside: true and the day has stops), prepHtml the Trip prep card of the
 * Prep tab, footHtml the foot of the page; facts is what stays the same for every refresh of this
 * render, role the role the model was built with, and patched(region, el) calls what the view
 * registered through ctx.onPatched. The entry check is read from view.entry (the last onPlan).
 * Null, with view.landing left alone, when there is no view, when a renderer throws or when the view
 * returns something that is not the six parts: the caller then renders the classic page.
 * @param {{ viewMod: object|null, cleanups: Function[], entry?: object|null }} view the live view object of trip-detail.js
 * @param {object} trip
 * @param {{ prefs?: object, theme?: 'dark'|'light', reducedMotion?: boolean, animate?: boolean, baseUrl?: string,
 *   notes?: string, userId?: string|null, role?: 'editor'|'viewer'|null, now?: Date, stale?: boolean, cachedAt?: string|null,
 *   profile?: object|null, ticks?: object, countryName?: (iso2: string) => string, onError?: (error: unknown) => void }} [opts]
 *   profile: the profile summary (home city, flag and currency); ticks: readTicks(trip.id)
 * @returns {import('../views/contract.js').TripLandingParts|null}
 */
export function buildLanding(view, trip, opts = {}) {
  const viewMod = view?.viewMod;
  if (typeof viewMod?.renderTripLanding !== 'function') return null;
  const listeners = [];
  const ctx = {
    prefs: Object.freeze({ ...opts.prefs }),
    theme: opts.theme === 'light' ? 'light' : 'dark',
    reducedMotion: Boolean(opts.reducedMotion),
    animate: Boolean(opts.animate),
    baseUrl: opts.baseUrl || '/',
    slots: Object.freeze({ notes: opts.notes || '' }),
    onCleanup: (fn) => { if (typeof fn === 'function') view.cleanups.push(fn); },
    onPatched: (fn) => { if (typeof fn === 'function') listeners.push(fn); },
  };
  const facts = Object.freeze({
    prefs: ctx.prefs, profile: opts.profile ?? null, userId: opts.userId ?? null,
    stale: Boolean(opts.stale), cachedAt: opts.cachedAt ?? null, countryName: opts.countryName,
  });
  const role = opts.role === 'editor' || opts.role === 'viewer' ? opts.role : null;
  try {
    const input = { ...facts, now: opts.now ?? new Date(), role, ticks: opts.ticks, entry: entryInputFrom(view.entry ?? null, 0) };
    const drawn = drawLanding(viewMod, trip, input, ctx);
    view.landing = { ...drawn, ctx, facts, role, patched: (region, el) => listeners.forEach((fn) => fn(region, el)) };
    return drawn.parts;
  } catch (error) {
    opts.onError?.(error);
    return null;
  }
}

/**
 * The landing of the open plan as it stands now: a new model from view.trip and the view's parts
 * for it, drawn with no motion (ctx.animate false). Nothing on the view object changes; the mount
 * step decides what reaches the page.
 * @param {{ viewMod: object|null, trip: object, landing: object|null }} view
 * @param {{ now: Date, role?: 'editor'|'viewer'|null, entry?: object|null, ticks?: object }} [live]
 *   what may have changed since the render: the time, the role, the entry check, this device's ticks
 * @param {(error: unknown) => void} [onError] told when the renderer throws
 * @returns {{ model: object, parts: object, dayExtras: string[], dayAsides: string[], prepHtml: string, footHtml: string }|null}
 */
export function redrawLanding(view, { now, role = null, entry = null, ticks } = {}, onError) {
  const landing = view?.landing;
  if (!landing || typeof view.viewMod?.renderTripLanding !== 'function') return null;
  try {
    return drawLanding(view.viewMod, view.trip, { ...landing.facts, now: now ?? new Date(), role, entry, ticks }, { ...landing.ctx, animate: false });
  } catch (error) {
    onError?.(error);
    return null;
  }
}
