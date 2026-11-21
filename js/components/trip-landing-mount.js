// The trip landing controller, page half (blueprint 3.4, 3.5, 4.2). Owner: F11.
//
// js/components/trip-landing.js builds the model and the view's parts and holds every rule that
// needs no page. This file is what happens once the parts are in the document:
//   - mountLanding(): menus, photo frames, flaps, the stuck observers, the tab list and the one map
//     node in their slots, the tick writer and listener, the minute tick, the entry timeout, and the
//     view's own mount;
//   - refreshLanding(): a new model from view.trip, patched into the named parts (the callers are
//     listed at landingParts() in trip-landing.js);
//   - swapLandingCover(): a new cover into the hero's frame, nothing else touched;
//   - the day panel of each open day card, for a view that asks for it (parts.dayAside);
//   - holdLanding(): what a silent refresh hands to the next render, so the hero photo is not loaded
//     again and the map keeps its zoom, pan and day;
//   - what only the trip page needs around a view: the "could not load" notice, the More trigger a
//     modal returns focus to, the PDF progress.
// DOM only: nothing here is a rule. A rule belongs in trip-landing.js, with a test.
import { esc } from '../views/shared/html.js';
import { mountMenus } from '../views/shared/menu.js';
import { mountPhotoFrames } from '../views/shared/photo-frame.js';
import { mountFlaps } from '../views/shared/flap.js';
import { observeStuck } from '../views/shared/stuck.js';
import { patchRegions, rememberRegions, carryOver } from '../views/shared/patch.js';
import { tripMapHtml, mountTripMap } from '../views/shared/trip-map.js';
import { dayCardExtrasHtml } from '../views/shared/day-extras.js';
import { TICKS_EVENT, readTicks } from '../data/tick-store.js';
import { logger } from '../lib/logger.js';
import { scrollBehavior } from '../lib/motion.js';
import {
  LANDING_PARTS, REFRESH_PARTS, ENTRY_TIMEOUT_MS, landingParts, entryInputFrom, tabsDocked, mapSlotIndex, mapSlotOptions, sameCover,
  clockKey, redrawLanding, markActiveDay, syncSectionJumps, placeAnchor, patchesEveryRegion,
} from './trip-landing.js';

const MINUTE_MS = 60000;
const PHOTO_SETTLE_MS = 500;
/** The parts of a landing that hold nothing the trip page bound itself, so they can be drawn again whole. */
const PART_BOXES = Object.freeze({ planIntro: '.tv-landing--intro', between: '.tv-between', planOutro: '.tv-landing--outro' });
/** The Trip prep card of the Prep tab: a region of the page, not of the view (prepSlotHtml). */
const PREP_REGION = 'prep-card';

const fromHtml = (html) => {
  const holder = document.createElement('template');
  holder.innerHTML = html;
  return holder.content;
};
const byAttr = (root, name, value) => [...root.querySelectorAll(`[${name}]`)].find((el) => el.getAttribute(name) === String(value)) ?? null;
const warn = (view, what) => (error) => logger.warn('ui', what, { view: view?.viewMod?.id, error: error?.message });

// ===== Around a view: loading it, modals, the PDF export =====

const FALLBACK_KEY = 'trippy-view-fallback';

/**
 * Whether a view import that fails now makes the registry reload the page (js/views/registry.js: online,
 * and the one reload of the session not spent yet). Asked before loading; the "could not load" toast is
 * kept for the case where no reload follows.
 * @returns {boolean}
 */
export function viewLoadHeals() {
  try {
    return navigator.onLine !== false && sessionStorage.getItem('chunk-reload') === null;
  } catch {
    return false;
  }
}

/** @returns {boolean} true once per browser session: when to say that a view could not load */
export function claimFallbackNotice() {
  try {
    if (sessionStorage.getItem(FALLBACK_KEY)) return false;
    sessionStorage.setItem(FALLBACK_KEY, '1');
  } catch { /* no session storage: saying it again is better than never */ }
  return true;
}

/**
 * The control focus returns to after a modal: the More trigger when `el` is an item of a menu (a
 * closed menu item is still in the page, but hidden), else `el` itself.
 */
export function menuTriggerFor(wrap, el) {
  const menu = el.closest('dialog[data-menu]');
  return (menu && byAttr(wrap, 'data-menu-open', menu.id)) || el;
}

const PDF_STAGES = Object.freeze({ photos: 'Photos', render: 'Building' });

/**
 * Shows the staged progress of a PDF export while `run` works. Every [data-action="pdf"] control is
 * disabled meanwhile. A landing shows the stage ("Photos 40%", "Building 85%", "Saving") in its
 * [data-pdf-label] spans and in the [data-pdf-status] line of the bar, which is what the user sees
 * when the More sheet started it; the classic icon button has no label, so it shows the stage itself.
 * The controls are looked up at every step: a patch of the bar may have drawn them again.
 * @param {{ wrap: Element, landing: object|null, pdfBusy?: boolean }} view
 * @param {(onProgress: (stage: string, pct: number) => void) => Promise<void>} run must not throw
 */
export async function pdfProgress(view, run) {
  const { wrap } = view;
  if (view.pdfBusy) return;
  view.pdfBusy = true;
  const buttons = () => [...wrap.querySelectorAll('[data-action="pdf"]')];
  const resting = new Map();
  const labels = () => [...wrap.querySelectorAll('[data-pdf-label]')].map((el) => {
    if (!resting.has(el)) resting.set(el, el.textContent);
    return el;
  });
  const classic = view.landing ? null : buttons()[0];
  const before = classic?.innerHTML;
  const show = (label, pct) => {
    if (classic) classic.innerHTML = `<span class="td-pdf-progress"><span class="td-pdf-spinner"></span>${label}...${pct === undefined ? '' : ` ${esc(pct)}%`}</span>`;
    const text = pct === undefined || label === 'Saving' ? label : `${label} ${pct}%`;
    labels().forEach((el) => { el.textContent = text; });
    const status = wrap.querySelector('[data-pdf-status]');
    if (status) status.textContent = text;
    buttons().forEach((button) => { button.disabled = true; });
  };
  classic?.classList.add('td-action-btn--exporting');
  show('Photos');
  try {
    await run((stage, pct) => show(Object.hasOwn(PDF_STAGES, stage) ? PDF_STAGES[stage] : 'Saving', pct));
  } finally {
    view.pdfBusy = false;
    classic?.classList.remove('td-action-btn--exporting');
    if (classic) classic.innerHTML = before;
    resting.forEach((text, el) => { el.textContent = text; });
    const status = wrap.querySelector('[data-pdf-status]');
    if (status) status.textContent = '';
    buttons().forEach((button) => { button.disabled = false; });
  }
}

// ===== The user's place across a rebuild in place (a view switch, a square flip) =====

const PLACE_BLOCKS = '.td-day-card[data-day-index], .td-day-card[data-section], .td-tab-panel[data-panel]';
const placeKey = (el) => (el.dataset.dayIndex !== undefined ? `day:${el.dataset.dayIndex}` : el.dataset.section ? `section:${el.dataset.section}` : `panel:${el.dataset.panel}`);
/** Where a block rests when the page jumps to it: under whatever its layout keeps pinned (its scroll margin). */
const restLine = (el) => parseFloat(getComputedStyle(el).scrollMarginTop) || 0;

/**
 * The block the user is reading (a day card, a section card, else the open tab panel) and how far it
 * sits from its resting line, so the same block can be put back there in a layout whose heights are
 * all different. null at the top of the page or with no block in sight: the page then starts at the top.
 * @param {Element} wrap the trip root on the page
 * @returns {{ key: string, offset: number }|null}
 */
export function pagePlace(wrap) {
  const boxes = [...wrap.querySelectorAll(PLACE_BLOCKS)].map((el) => {
    const box = el.getBoundingClientRect();
    return { key: placeKey(el), top: box.top - restLine(el), bottom: box.bottom - restLine(el) };
  });
  return placeAnchor(boxes, { scrollY: window.scrollY, height: window.innerHeight });
}

/** @returns {number|null} the scroll position that puts the block of pagePlace() back where it was */
export function placeScrollY(wrap, place) {
  const el = place ? [...wrap.querySelectorAll(PLACE_BLOCKS)].find((block) => placeKey(block) === place.key) : null;
  const box = el?.getBoundingClientRect();
  if (!box || (!box.width && !box.height)) return null;
  return Math.max(0, window.scrollY + box.top - restLine(el) - place.offset);
}

// ===== The two nodes that move with the width (blueprint 8.3) =====

/** The tab list sits in the bar's tabs slot while the viewport is wide enough, else right after the hero. */
function dockTabs(wrap) {
  const tabs = wrap.querySelector('.td-tabs');
  const hero = wrap.querySelector(':scope > .tv-landing--hero');
  if (!tabs) return;
  const slot = wrap.querySelector(':scope > .tv-bar [data-tabs-slot]');
  const docked = tabsDocked(slot ? slot.getAttribute('data-slot-from') ?? '' : null, window.innerWidth);
  const home = docked ? slot : wrap;
  if (tabs.parentElement === home || (!docked && !hero)) return;
  const focused = tabs.contains(document.activeElement) ? document.activeElement : null;
  if (docked) slot.append(tabs);
  else hero.after(tabs);
  focused?.focus({ preventScroll: true }); // moving a node drops its focus
}

/** Keeps the one map node in the slot whose width range fits, and out of the page when none does. */
function placeMap(view) {
  const map = view.landing?.map;
  if (!map || !view.wrap?.isConnected || map.handle?.getState().full) return; // a full-screen map is placed when it closes
  const slots = [...view.wrap.querySelectorAll('[data-map-slot]')];
  const ranges = slots.map((slot) => ({ from: slot.getAttribute('data-map-from'), below: slot.getAttribute('data-map-below') }));
  const slot = slots[mapSlotIndex(ranges, window.innerWidth)] ?? null;
  if (slot === map.node.parentElement) return;
  if (slot) slot.append(map.node);
  else map.node.remove();
  map.handle?.invalidate();
}

/**
 * The map: one node from tripMapHtml(), or the node the page before this render handed over, which
 * keeps its Leaflet map, zoom, pan and selected day. Always mounted, also with nothing to place:
 * it is hidden then, and setPoints() shows it when coordinates arrive.
 */
function mountMap(view, carried) {
  const { wrap, landing } = view;
  const slots = [...wrap.querySelectorAll('[data-map-slot]')];
  if (!slots.length) {
    carried?.handle?.destroy();
    return;
  }
  const asked = (name) => slots.map((slot) => slot.getAttribute(name)).find(Boolean) ?? null;
  const { model } = landing;
  // The handle outlives a silent refresh, so it reaches the page through `owner`, not through a view.
  const owner = carried?.owner ?? { view };
  owner.view = view;
  const node = carried?.node
    ?? fromHtml(tripMapHtml(model.map, mapSlotOptions({ full: asked('data-map-full'), caption: asked('data-map-caption') }))).firstElementChild;
  landing.map = { node, owner, handle: null };
  placeMap(view);
  landing.map.handle = mountTripMap(node, {
    points: model.map.points, days: model.days, theme: landing.ctx.theme,
    onChange: (state) => { if (!state.full) placeMap(owner.view); },
  });
  landing.map.handle.invalidate();
}

// ===== Refreshing (blueprint 4.2, "Keeping the landing true") =====

/** What may have changed since the render: the time, the role, this device's ticks, the entry check. */
function liveFacts(view) {
  const { landing } = view;
  return {
    now: new Date(), role: landing.role, ticks: readTicks(view.tripId),
    entry: entryInputFrom(view.entry ?? null, performance.now() - landing.since),
  };
}

/** The part of the landing a region belongs to, when that part can be drawn again whole; else null. */
function partOf(wrap, next, region) {
  const live = byAttr(wrap, 'data-region', region);
  return Object.keys(PART_BOXES).find((key) => byAttr(fromHtml(next.parts[key]), 'data-region', region) || live?.closest(PART_BOXES[key])) ?? null;
}

/** The element a part is drawn in. `between` has none while the view returned nothing for it. */
function partBox(wrap, key) {
  const box = wrap.querySelector(`.td-tab-panel[data-panel="plan"] ${PART_BOXES[key]}`);
  const grid = wrap.querySelector('.td-day-grid');
  if (box || key !== 'between' || !grid) return box;
  const made = document.createElement('div');
  made.className = 'tv-between';
  grid.insertBefore(made, grid.querySelector(':scope > .td-day-card[data-day-index]'));
  return made;
}

/**
 * Draws one part of the landing again: for a region that came or went (a map caption once stops can
 * be placed, "Before you go" once nothing applies), which a patch of regions cannot do.
 */
function redrawPart(view, next, key) {
  const box = partBox(view.wrap, key);
  if (!box || box.querySelector('dialog[open]')) return;
  const focusKey = box.contains(document.activeElement) ? document.activeElement.getAttribute('data-focus-key') : null;
  const fresh = fromHtml(next.parts[key]);
  carryOver(box, fresh);
  box.replaceChildren(fresh);
  if (focusKey) byAttr(box, 'data-focus-key', focusKey)?.focus({ preventScroll: true });
  box.querySelectorAll('[data-region]').forEach((el) => view.landing.patched(el.getAttribute('data-region'), el));
  placeMap(view); // its slot was in the part
}

/** Patches the named regions, or with `every` each region the view drew (late data, ruling R41). */
function patchNamed(view, next, regions, every = false) {
  const { wrap, landing } = view;
  const drawn = fromHtml(LANDING_PARTS.map((key) => next.parts[key]).join('') + next.prepHtml);
  const all = [...drawn.querySelectorAll('[data-region]')];
  // The map caption is left to the map's own refresh: the map writes the caption of a selected day there.
  const names = every ? [...new Set([...regions, ...all.map((el) => el.getAttribute('data-region')).filter((name) => name !== 'map-caption')])] : regions;
  const wanted = all.filter((el) => names.includes(el.getAttribute('data-region')));
  const { unmatched } = patchRegions(wrap, wanted.map((el) => el.outerHTML).join(''), { onPatched: landing.patched });
  const parts = names.filter((region) => unmatched.includes(region)).map((region) => partOf(wrap, next, region)).filter(Boolean);
  for (const key of new Set(parts)) redrawPart(view, next, key);
}

/**
 * The block in each day card header whose row changed (stops, cost, times, photos).
 * @param {Element} wrap
 * @param {object[]} shown the rows the blocks on the page were drawn from
 * @param {object[]} rows the rows of the new model
 */
function redrawDayBlocks(wrap, shown, rows) {
  const still = (row) => (row ? dayCardExtrasHtml(row, { animate: false }) : '');
  rows.forEach((row, index) => {
    const html = still(row);
    const block = html === still(shown[index]) ? null : byAttr(wrap, 'data-day-extras', row.index);
    if (block) block.outerHTML = html;
  });
}

// ===== The day panel (TripLandingParts.dayAside) =====

const OPEN_DAYS = '.td-day-card.td-day-card--open[data-day-index]';

/**
 * Puts the day panel of an open day card at the end of its body, or brings the one there in line
 * with landing.dayAsides. A closed card is left alone: it is brought in line when it opens. The
 * panel is drawn again only when its markup differs, and keeps its scroll position and focus.
 */
function syncDayAside(view, card) {
  const { landing } = view;
  const body = card.querySelector(':scope > .td-day-card-body');
  if (!landing?.asides || !body || !card.matches(OPEN_DAYS)) return;
  const html = landing.dayAsides?.[Number(card.dataset.dayIndex)] ?? '';
  const old = body.querySelector(':scope > .tv-day-aside');
  if ((old ? landing.asides.shown.get(old) : '') === html) return;
  if (!html) {
    old.remove();
    return;
  }
  const fresh = fromHtml(html).firstElementChild;
  landing.asides.shown.set(fresh, html);
  const focusKey = old?.contains(document.activeElement) ? document.activeElement.getAttribute('data-focus-key') : null;
  const scrolled = old?.scrollTop ?? 0;
  if (old) old.replaceWith(fresh);
  else body.append(fresh);
  fresh.scrollTop = scrolled;
  if (focusKey) byAttr(fresh, 'data-focus-key', focusKey)?.focus({ preventScroll: true });
  // The panel rests under the open day header, whose height follows its title and the width.
  const header = card.querySelector(':scope > .td-day-card-header');
  if (header) landing.asides.heads.observe(header);
}

const syncDayAsides = (view) => view.wrap.querySelectorAll(OPEN_DAYS).forEach((card) => syncDayAside(view, card));

/** A stop of the panel's list: that stop of the open day comes to rest under the day header and takes focus. */
function jumpToStop(event) {
  const from = event.target?.closest?.('[data-stop-jump]');
  const card = from?.closest('.td-day-card');
  if (!card) return;
  const stops = [...card.querySelectorAll('.td-timeline .td-activity-card')];
  const id = from.getAttribute('data-stop-jump');
  const stop = (id && stops.find((el) => el.dataset.activityId === id)) || stops[Number(from.getAttribute('data-stop-at'))];
  if (!stop) return;
  stop.setAttribute('tabindex', '-1');
  stop.focus({ preventScroll: true });
  stop.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
}

/** Starts the day panels: one is placed whenever a day card opens (by hand, by a jump, by the scroll spy, on a restore). */
function mountDayAsides(view, signal) {
  const { wrap, landing } = view;
  const grid = wrap.querySelector('.td-day-grid');
  if (!grid || landing.parts.dayAside !== true) return;
  const heads = new ResizeObserver((entries) => entries.forEach(({ target }) => {
    target.closest('.td-day-card')?.style.setProperty('--tv-day-head-h', `${Math.round(target.getBoundingClientRect().height)}px`);
  }));
  const opened = new MutationObserver((changes) => new Set(changes.map((change) => change.target)).forEach((el) => syncDayAside(view, el)));
  landing.asides = { shown: new WeakMap(), heads };
  opened.observe(grid, { attributes: true, attributeFilter: ['class'], subtree: true });
  syncDayAsides(view);
  wrap.addEventListener('click', jumpToStop, { signal });
  view.cleanups.push(() => { heads.disconnect(); opened.disconnect(); });
}

/** The foot names the map's source only while a map is drawn, and credits the photos now shown. */
function redrawFoot(view, footHtml) {
  const foot = view.wrap.querySelector(':scope > footer.tv-foot');
  if (!foot || footHtml === view.landing.footHtml) return;
  const open = Boolean(foot.querySelector('details[open]'));
  foot.outerHTML = footHtml;
  view.landing.footHtml = footHtml;
  const credits = view.wrap.querySelector(':scope > footer.tv-foot details');
  if (credits && open) credits.open = true;
}

/**
 * Rebuilds the model from view.trip and brings the named parts of the page in line with it.
 * @param {{ wrap: Element, trip: object, tripId: string, viewMod: object, landing: object|null, entry?: object|null }} view
 * @param {readonly string[]} names from REFRESH_PARTS: six regions of the view, 'map' (the node, its
 *   caption and the foot's attribution) and 'days' (the block in each day card header). 'readiness'
 *   also redraws the Trip prep card of the Prep tab.
 * @param {{ when?: (next: object, last: object) => boolean, every?: boolean }} [opts] when: refresh only
 *   if it answers true for the new model and the last one built. every: also patch each other region
 *   the view drew, whatever its name (late data, ruling R41)
 * @returns {boolean} whether the page was brought in line
 */
export function refreshLanding(view, names, { when, every = false } = {}) {
  const landing = view?.landing;
  const wrap = view?.wrap;
  const wanted = (names || []).filter((name) => REFRESH_PARTS.includes(name));
  if (!landing || !wrap?.isConnected || !wanted.length) return false;
  const next = redrawLanding(view, liveFacts(view), warn(view, 'Trip landing refresh failed'));
  if (!next || (when && !when(next.model, landing.model))) return false;
  // The model is the plan as it is now (the actions offered are read from it); the page follows part by part.
  landing.model = next.model;
  landing.parts = next.parts;
  // The day panels follow every change (a tick books a reservation, an edit moves a stop).
  landing.dayAsides = next.dayAsides;
  if (landing.asides) syncDayAsides(view);

  const activeDay = wrap.querySelector('[data-day-jump].is-active')?.getAttribute('data-day-jump');
  const regions = wanted.filter((name) => name !== 'map' && name !== 'days');
  if (wanted.includes('map') && !regions.includes('map-caption')) regions.push('map-caption');
  if (wanted.includes('readiness')) {
    regions.push(PREP_REGION);
    landing.prepHtml = next.prepHtml;
  }
  patchNamed(view, next, regions, every);
  if (wanted.includes('days')) {
    redrawDayBlocks(wrap, landing.dayRows ?? [], next.model.days);
    landing.dayRows = next.model.days;
    landing.dayExtras = next.dayExtras;
  }
  if (wanted.includes('map')) landing.map?.handle?.setPoints(next.model.map.points, { days: next.model.days });
  if (wanted.includes('map') || wanted.includes('days')) redrawFoot(view, next.footHtml);

  // What the page itself keeps on the controls a patch has just drawn again.
  if (activeDay !== undefined && activeDay !== null) markActiveDay(wrap, activeDay);
  syncSectionJumps(wrap);
  const editing = String(wrap.classList.contains('td-edit-mode'));
  wrap.querySelectorAll('[data-action="edit"][aria-pressed]').forEach((button) => button.setAttribute('aria-pressed', editing));
  landing.map?.handle?.invalidate();
  return true;
}

/**
 * One of the changes landingParts() knows happened to the open plan: refresh what it names.
 * @param {object} view
 * @param {'totals'|'photos'|'failed'|'ticks'|'entry'|'role'|'clock'|'profile'} change
 * @param {{ settle?: boolean }} [opts] settle: wait until no such change has come for half a second
 *   (photos and coordinates arrive one row at a time)
 */
export function landingChanged(view, change, { settle = false } = {}) {
  const landing = view?.landing;
  if (!landing) return;
  if (!settle) {
    refreshLanding(view, landingParts(change), { every: patchesEveryRegion(change) });
    return;
  }
  clearTimeout(landing.settling);
  landing.settling = setTimeout(() => refreshLanding(view, landingParts(change)), PHOTO_SETTLE_MS);
}

/**
 * The role query answered: the actions follow when the role is not the one the page was drawn with.
 * The answer is kept for the silent refreshes of this opening (holdLanding), so it is asked once.
 */
export function setLandingRole(view, role) {
  const landing = view?.landing;
  if (!landing) return;
  const next = role === 'editor' || role === 'viewer' ? role : null;
  const changed = next !== landing.role;
  landing.role = next;
  landing.roleKnown = true;
  if (changed) landingChanged(view, 'role');
}

/**
 * The profile summary arrived after the page was drawn without one (a first start on this device):
 * the home currency, the home city and the home country reach the cost, the route and readiness.
 */
export function setLandingProfile(view, profile) {
  const landing = view?.landing;
  if (!landing || !profile || landing.facts.profile) return;
  landing.facts = Object.freeze({ ...landing.facts, profile });
  landingChanged(view, 'profile');
}

/** A day jump also shows that day on the map (blueprint 4.2). */
export function focusLandingDay(view, dayIndex) {
  const row = view?.landing?.model.days[Number(dayIndex)];
  if (row) view.landing.map?.handle?.focusDay(row.dayNumber);
}

// ===== The cover =====

/** Resolves once `img` can be painted; with its fallback address when the first one is refused. */
async function decoded(img) {
  try {
    await img.decode();
    return true;
  } catch {
    const fallback = img.getAttribute('data-fallback');
    if (!fallback || img.getAttribute('src') === fallback) return false;
    img.removeAttribute('data-fallback');
    img.removeAttribute('srcset');
    img.src = fallback;
    return img.decode().then(() => true, () => false);
  }
}

/**
 * A new cover for the open plan (view.trip already holds it): the photo frame of the hero is
 * replaced by the view's frame for the new cover, once the image is ready to paint. A placeholder
 * frame becomes a photo frame the same way. The title, the status and the actions are not touched,
 * and focus stays where it is.
 * @param {object} view
 * @returns {Promise<boolean>} whether the frame was swapped
 */
export async function swapLandingCover(view) {
  const landing = view?.landing;
  if (!landing || !view.wrap?.isConnected) return false;
  const next = redrawLanding(view, liveFacts(view), warn(view, 'Trip cover redraw failed'));
  if (!next || sameCover(next.model.cover, landing.model.cover)) return false;
  const fresh = fromHtml(next.parts.hero).querySelector('[data-carry="cover"]');
  if (!fresh) return false;
  const frame = document.adoptNode(fresh); // out of the inert template document, so its image loads
  const img = frame.querySelector('img');
  if (img) {
    img.removeAttribute('data-fade');
    img.loading = 'eager';
    if (!(await decoded(img))) return false;
  }
  const old = view.wrap.querySelector('#td-hero [data-carry="cover"]');
  if (view.landing !== landing || !old?.isConnected) return false;
  const focusKey = old.contains(document.activeElement) ? document.activeElement.getAttribute('data-focus-key') : null;
  old.replaceWith(frame);
  if (focusKey) byAttr(frame, 'data-focus-key', focusKey)?.focus({ preventScroll: true });
  landing.model = { ...landing.model, cover: next.model.cover, credits: next.model.credits };
  redrawFoot(view, next.footHtml);
  return true;
}

// ===== A silent refresh, and mounting =====

/**
 * Before a silent refresh renders the plan again: marks this landing as handed over, so its cleanup
 * leaves the map alive, and returns what the next render takes: the page it replaces (for the hero
 * photo), the map, the role (and whether the role query has answered) and the entry answer already
 * known. The next render is synchronous; if it mounts no landing (it threw, or fell back to classic)
 * the map is let go right after.
 * @param {object} view
 * @returns {{ wrap: Element, map: object|null, cover: object, role: string|null, roleKnown: boolean, entry: object|null, taken: boolean }|null}
 */
export function holdLanding(view) {
  const landing = view?.landing;
  if (!landing || !view.wrap) return null;
  landing.held = true;
  const carry = {
    wrap: view.wrap, map: landing.map ?? null, cover: landing.model.cover, role: landing.role, roleKnown: Boolean(landing.roleKnown),
    entry: view.entry ?? null, taken: false,
  };
  queueMicrotask(() => { if (!carry.taken) carry.map?.handle?.destroy(); });
  return carry;
}

/** The tick boxes of the Trip prep card write the trip-quick store, as the classic card does, and say so. */
function writeTick(view, event) {
  const box = event.target?.closest?.('input[data-tick-key]');
  if (!box) return;
  const key = box.getAttribute('data-tick-key');
  const quick = readTicks(view.tripId).quick;
  const next = box.checked ? { ...quick, [key]: true } : Object.fromEntries(Object.entries(quick).filter(([name]) => name !== key));
  try {
    localStorage.setItem(`trip-quick-${view.tripId}`, JSON.stringify(next));
  } catch (error) {
    warn(view, 'Tick not saved')(error);
  }
  box.dispatchEvent(new CustomEvent(TICKS_EVENT, { bubbles: true, detail: { tripId: view.tripId, store: 'trip-quick', key, checked: box.checked } }));
}

/**
 * Starts what the landing needs once the page is in the document.
 * @param {{ wrap: Element, tripId: string, viewMod: object, landing: object|null, cleanups: Function[], controller: AbortController, entry?: object|null }} view
 * @param {ReturnType<typeof holdLanding>} [carry] from the page this render replaces (a silent refresh)
 */
export function mountLanding(view, carry = null) {
  const landing = view?.landing;
  if (!landing || !view.wrap) return; // an unused carry lets its map go by itself
  const { wrap } = view;
  const { signal } = view.controller;
  // dayRows: the rows the day card blocks on the page were drawn from, so a refresh redraws only what differs.
  Object.assign(landing, { since: performance.now(), map: null, held: false, settling: 0, roleKnown: Boolean(carry?.roleKnown), dayRows: landing.model.days });
  if (carry) {
    carry.taken = true;
    // The hero photo travels while it is the same photo. A frame with no data-carry-id cannot say so itself.
    if (!sameCover(carry.cover, landing.model.cover)) carry.wrap.querySelectorAll('[data-carry="cover"]').forEach((el) => el.removeAttribute('data-carry'));
    carryOver(carry.wrap, wrap);
  }
  rememberRegions(wrap);

  view.cleanups.push(mountMenus(wrap, { signal }), mountPhotoFrames(wrap, { signal }), mountFlaps(wrap, { animate: landing.ctx.animate }));
  view.cleanups.push(observeStuck(wrap.querySelector(':scope > .tv-bar'), { past: wrap.querySelector('#td-hero') }));
  dockTabs(wrap);
  view.cleanups.push(observeStuck(wrap.querySelector('.td-tabs')));
  mountMap(view, carry?.map ?? null);
  mountDayAsides(view, signal);
  window.addEventListener('resize', () => { dockTabs(wrap); placeMap(view); }, { signal });

  wrap.addEventListener('change', (event) => writeTick(view, event), { signal });
  wrap.addEventListener(TICKS_EVENT, () => landingChanged(view, 'ticks'), { signal });

  // The countdown, the day of the plan and the next stop move on while the page stays open. What the
  // page shows is remembered apart from the model, which every other refresh brings up to date too.
  let clockShown = clockKey(landing.model);
  const clock = () => {
    if (document.visibilityState === 'hidden') return;
    if (refreshLanding(view, landingParts('clock'), { when: (next) => clockKey(next) !== clockShown })) clockShown = clockKey(landing.model);
  };
  const minute = setInterval(clock, MINUTE_MS);
  document.addEventListener('visibilitychange', clock, { signal });
  // Ruling R28: an entry check that has not answered by now reads "Could not check".
  const entryWait = setTimeout(() => { if (!view.entry) landingChanged(view, 'entry'); }, ENTRY_TIMEOUT_MS);

  view.cleanups.push(() => {
    clearInterval(minute);
    clearTimeout(entryWait);
    clearTimeout(landing.settling);
    if (!landing.held) landing.map?.handle?.destroy();
  });
  view.viewMod.mountTripLanding?.(wrap, landing.model, landing.ctx);
}
