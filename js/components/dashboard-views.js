// The dashboard controller for views and the #/atlas route (blueprint 4.1, 5.5, 6.8). Owner: F10.
//
// dashboard.js keeps the landing page, the classic dashboard, the session wait and every delegated
// handler on #app. This file draws a view in the classic page's place: it builds the DashboardModel,
// mounts or patches the view root, brings late data in (briefings, profile, entry checks, planning
// progress), keeps the page true while it stays open, holds the search and filter state and looks
// after the one-time chooser. The decisions are the pure functions at the top, tested in
// dashboard-views.test.js; the DOM half is proven in a browser with the frozen stub view.
import { navigate, onRouteLeave } from '../router.js';
import { logger } from '../lib/logger.js';
import { isSquareMode } from '../lib/square-mode.js';
import { effectiveTheme } from '../lib/theme.js';
import { prefersReducedMotion } from '../lib/motion.js';
import { estimateGenerationMinutes } from '../lib/trip-extras.js';
import { zonedToday } from '../lib/trip-status.js';
import { groundJourney, journeyMode, normaliseTransportExtras } from '../lib/journey.js';
import { buildDashboardModel, applyDashboardFilter, briefingIds } from '../lib/dashboard-model.js';
import { getPrefs, setPref, prefsReady, remotePrefsState, syncPrefs } from '../data/prefs-store.js';
import { fetchTripBriefings, readSavedBriefings, listOfflineTrips } from '../data/trip-repository.js';
import { getProfileSummary, profileSummaryReady } from '../data/profile-cache.js';
import { readTicks } from '../data/tick-store.js';
import { nationalityName } from '../data/nationalities.js';
import { DESTINATIONS } from '../wizard/destinations.js';
import { loadView, activeViewId, setActiveView, VIEW_META } from '../views/registry.js';
import { patchRegions, rememberRegions } from '../views/shared/patch.js';
import { mountPhotoFrames } from '../views/shared/photo-frame.js';
import { mountMenus } from '../views/shared/menu.js';
import { mountFlaps } from '../views/shared/flap.js';
import { viewChooserHtml, mountViewPicker, scrollLeftFor } from '../views/shared/view-picker.js';
import { loadErrorHtml, staleBannerHtml, emptyStateHtml } from '../views/shared/state-cards.js';
import { renderDashboard, bindDashboardHandlers, renderSkeleton, loadTrips } from './dashboard.js';

const POLL_MS = 20_000;                  // planning progress, while a plan is being planned
const TICK_MS = 60_000;                  // a fresh "now", while a live plan is on screen
const BRIEFING_MAX_AGE_MS = 15 * 60_000; // an open dashboard asks for the briefings again after this
const ENTRY_TIMEOUT_MS = 8_000;          // an entry check that takes longer reads "Could not check"
const BOOT_WAIT_MS = 300;                // the longest the first render waits for synced prefs and the profile
const PREFS_SYNC_GAP_MS = 60_000;
const BASE_URL = import.meta.env.BASE_URL || '/';
const START_FILTER = Object.freeze({ q: '', filter: 'all', allPast: false });
const ENTRY_FAILED = Object.freeze({ reason: 'failed' });
const VIEW_LOAD_TRIES = 3;                // a pick that lands while a view loads is read again, this often at most
const ATLAS_JUMP_WAIT_MS = 10_000;       // how long #/atlas?open=<section> waits for a section that arrives late
const ATLAS_SECTIONS = Object.freeze({ passport: 'atl-passport' });
const CARD_CONTROL = 'a[href], button:not([disabled]):not([aria-disabled="true"])';
const VIEW_FAILED_TEXT = 'That view could not load, so this is the standard layout.';
const NOTIFY_TEXT = {
  granted: 'Trippy will tell you when this plan is ready.',
  denied: 'Notifications are blocked for Trippy in this browser, so keep this page open.',
  default: 'Notifications are still off, so keep this page open.',
  unsupported: 'This browser cannot show notifications, so keep this page open.',
};

// --- Decisions (pure) -------------------------------------------------------------------------------

/**
 * Whether the one-time chooser is drawn (blueprint 6.8): not yet dismissed, at least one plan, the
 * ready state, nothing being planned, no square mode, and the prefs of the account no longer awaited.
 * @param {{ prefs?: { viewChooserSeen?: boolean }|null, rowCount?: number, square?: boolean, state?: string,
 *           generating?: boolean, remoteState?: 'unknown'|'available'|'unavailable' }} [facts]
 */
export function chooserVisible({ prefs, rowCount, square, state, generating, remoteState } = {}) {
  return prefs?.viewChooserSeen === false && rowCount > 0 && state === 'ready' && !generating && !square
    && (remoteState === 'available' || remoteState === 'unavailable');
}

/**
 * The list rows after a generation update: a plan being planned becomes 'failed' or 'generated'.
 * @param {Array<object>} rows
 * @param {string} tripId
 * @param {{ status?: string }|null} status   what the generation manager reports
 * @returns {Array<object>} new rows with a new row for that plan; the same rows when nothing changes
 */
export function applyGenerationStatus(rows, tripId, status) {
  const list = Array.isArray(rows) ? rows : [];
  const next = { failed: 'failed', done: 'generated' }[status?.status];
  if (!next || !list.some((row) => row?.id === tripId && row.status === 'generating')) return list;
  return list.map((row) => (row?.id === tripId && row.status === 'generating' ? { ...row, status: next } : row));
}

/**
 * Minutes of planning left, from the days still to plan.
 * @param {number|null} daysTotal  null when the plan has no dates and no length
 * @param {number|null} daysDone
 * @returns {number|null} null when the total is not known
 */
export function etaMinutes(daysTotal, daysDone) {
  const total = Number(daysTotal);
  if (daysTotal === null || daysTotal === undefined || !Number.isFinite(total) || total <= 0) return null;
  return estimateGenerationMinutes(Math.max(1, total - Math.max(0, Number(daysDone) || 0)));
}

/**
 * Live plans, lead first (blueprint 2.3): the plan opened most recently on this device, else the
 * later start, else the later created_at, else the greater id. The model orders its own cards by
 * the same rule; the controller uses this for the order in which it checks entry requirements.
 * @param {Array<object>} liveCards   list rows or cards
 * @param {Array<string|{ id: string }>} offlineIds   listOfflineTrips(), most recently opened first
 * @returns {Array<object>} a new list
 */
export function leadOrder(liveCards, offlineIds) {
  const opened = (Array.isArray(offlineIds) ? offlineIds : []).map((entry) => String((entry && typeof entry === 'object' ? entry.id : entry) ?? ''));
  const rank = (plan) => (opened.includes(String(plan.id)) ? opened.indexOf(String(plan.id)) : opened.length);
  const start = (plan) => plan.dates?.start ?? plan.start_date ?? '';
  const made = (plan) => Date.parse(plan.created_at) || 0;
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return [...(Array.isArray(liveCards) ? liveCards : [])]
    .sort((a, b) => rank(a) - rank(b) || order(start(b), start(a)) || made(b) - made(a) || order(String(b.id), String(a.id)));
}

/**
 * Whether the mounted root can be patched instead of rendered again: the same page, view and state,
 * and the same markup outside the regions (the frame), which a patch cannot change.
 * @param {{ page: string, view: string, state: string, frame: string }|null} prev   what is mounted
 * @param {{ page: string, view: string, state: string, frame: string }|null} next   what would be
 */
export function canReuseRoot(prev, next) {
  return Boolean(prev && next) && prev.page === next.page && prev.view === next.view && prev.state === next.state && prev.frame === next.frame;
}

/**
 * Whether an open dashboard asks for the briefings again (blueprint 4.1 step 8).
 * @param {number|null} lastFetchAt       ms, null when never fetched
 * @param {string|null} lastDeviceDate    YYYY-MM-DD on the device at that fetch
 * @param {Date|number|string} now
 * @param {string} [deviceZone]           tests pass it
 */
export function needsBriefingRefetch(lastFetchAt, lastDeviceDate, now, deviceZone) {
  if (!Number.isFinite(lastFetchAt) || lastFetchAt === null) return true;
  return new Date(now).getTime() - lastFetchAt > BRIEFING_MAX_AGE_MS || zonedToday(now, deviceZone, deviceZone) !== lastDeviceDate;
}

/**
 * The entry input for one plan (ruling R28): the plan of the check, or { reason: 'failed' } when the
 * check fails, answers nothing or takes longer than `ms`. Null is never the answer: null means the
 * check is still running. Never rejects.
 * @param {() => Promise<object>|object} check   starts entryPlan()
 * @param {number} [ms]
 * @returns {Promise<object>}
 */
export function entryInputWithTimeout(check, ms = ENTRY_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(ENTRY_FAILED), ms);
    Promise.resolve().then(() => check())
      .then((plan) => (plan && typeof plan === 'object' ? plan : ENTRY_FAILED), () => ENTRY_FAILED)
      .then((entry) => { clearTimeout(timer); resolve(entry); });
  });
}

/**
 * What entryPlan() is asked for one plan, from its list row and its briefing, as the trip page asks:
 * the passports stored with the plan, else the nationality of the profile.
 * @param {object} row            list row: wizard_state holds the destinations
 * @param {object|null} briefing  briefing row: extras and the passports
 * @param {object|null} profile   profile summary
 */
export function entryRequest(row, briefing, profile) {
  const stored = briefing?.wizard_state?.passports;
  const passports = (Array.isArray(stored) && stored.length ? stored : [profile?.nationality])
    .filter((code) => typeof code === 'string' && code).map((code) => code.toUpperCase());
  const extras = normaliseTransportExtras(briefing?.extras ?? {}, briefing?.wizard_state?.transport?.mode);
  const ground = groundJourney(extras);
  return {
    wizardState: row?.wizard_state ?? null, extras, passports, homeFlag: profile?.home_flag ?? '',
    groundMode: ground ? journeyMode(ground) : '', tripStart: row?.start_date ?? null, tripEnd: row?.end_date ?? null,
  };
}

/**
 * The model a view is given: the unfiltered model narrowed by the search and the filter chip.
 * "Show all past plans" opens every group (filter.expanded) without narrowing anything.
 * @param {import('../views/contract.js').DashboardModel} model   unfiltered
 * @param {{ q: string, filter: string, allPast: boolean }} [filter]
 */
export function shownModel(model, { q = '', filter = 'all', allPast = false } = START_FILTER) {
  const shown = applyDashboardFilter(model, { q, filter });
  return allPast && !shown.filter.expanded ? { ...shown, filter: { ...shown.filter, expanded: true } } : shown;
}

/**
 * The markup of the #/atlas page: the view's page, plus whatever state it does not draw itself. The
 * route never shows a failed or a saved list without "Try again", nor an empty atlas without a way
 * to start. A throw in the ready state is passed on: the route then goes back to the dashboard.
 * @param {{ renderAtlasPage: Function }} view
 * @param {import('../views/contract.js').DashboardModel} model
 * @param {import('../views/contract.js').ViewCtx} ctx
 */
export function atlasPageHtml(view, model, ctx) {
  let page = '';
  try {
    page = String(view.renderAtlasPage(model, ctx) ?? '');
  } catch (error) {
    if (model.state === 'ready') throw error;
  }
  const has = (action) => page.includes(`data-action="${action}"`);
  const head = /<h1[\s>]/.test(page) ? '' : '<header><h1>Atlas</h1></header>';
  const stale = model.stale && !has('retry-trips') ? staleBannerHtml(model.stale) : '';
  const error = model.state === 'error' && !has('retry-trips') ? loadErrorHtml() : '';
  const empty = model.state === 'empty' && !has('new-trip') ? emptyStateHtml(model, {
    title: model.user?.homeCity ? `Your atlas starts in ${model.user.homeCity}` : 'Your atlas starts here',
    text: 'Plan a trip and it appears on your map.',
  }) : '';
  return `${head}${page}${stale}${error}${empty}`;
}

/**
 * The last day a briefing fetch asks stops for: the latest end among the live plans and the next
 * departure. The next departure is included so that a plan about to go live is saved on the device
 * with all its stops, and still has today's when it starts with no connection.
 * @param {import('../views/contract.js').DashboardModel|null} model
 * @returns {string|undefined} YYYY-MM-DD; undefined when no date is known (the fetch then asks up to tomorrow)
 */
export function briefingsUntil(model) {
  const cards = [...(model?.sections?.live ?? []), model?.next?.trip].filter(Boolean);
  return cards.map((card) => card.dates?.end ?? card.dates?.start).filter(Boolean).sort().pop();
}

/**
 * The element id "#/atlas?open=<section>" asks to be scrolled to ("Open passport" on the dashboard).
 * @param {string} hash   location.hash
 * @returns {string|null} null for the plain page, another route or a section this page does not have
 */
export function atlasJumpId(hash) {
  const [path, query = ''] = String(hash ?? '').replace(/^#/, '').split('?');
  if (path !== '/atlas') return null;
  const name = new URLSearchParams(query).get('open') ?? '';
  return Object.hasOwn(ATLAS_SECTIONS, name) ? ATLAS_SECTIONS[name] : null;
}

// --- State ------------------------------------------------------------------------------------------

/** The page this controller has on screen, or null. One object per mounted page; `run` counts its renders. */
let mounted = null;
let pollTimer = 0;
let tickTimer = 0;
let offLeave = null;
let booted = false;
let watching = false;
let toastShown = false;
let chooser = null;
let switchSeq = 0;
let switching = Promise.resolve();
let atlasToken = 0;
/** { id, at }: the section a link on the dashboard asked the atlas page to open at, until that page is drawn. */
let askedJump = null;
/** `<page>:<view id>` of a renderer that threw: classic for the rest of this page load. */
const broken = new Set();
/** trip id -> { key, entry }: the entry check of a plan, kept while what it was asked for stays the same. */
const entryCache = new Map();

const isAtlasRoute = () => location.hash.replace(/^#/, '').split('?')[0] === '/atlas';
const alive = (m, run) => mounted === m && m.run === run && m.isCurrent() && Boolean(m.root?.isConnected);
const toast = (message, level) => import('./toast.js').then(({ showToast }) => showToast(message, level)).catch(() => {});

function stopTimers() {
  clearTimeout(pollTimer);
  clearTimeout(tickTimer);
  pollTimer = 0;
  tickTimer = 0;
}

function runCleanups(m) {
  for (const stop of m.cleanups.splice(0)) {
    try { stop(); } catch (error) { logger.warn('ui', 'A view cleanup failed', { error: error?.message }); }
  }
}

function destroy(m) {
  stopTimers();
  runCleanups(m);
  m.stopJump?.();
  dropChooser();
  if (mounted === m) mounted = null;
}

// The router runs this on every route change and on a rebuild of the same route. The hash is the
// new one by then, so a rebuild keeps the page (the next render reuses its root) and a real leave
// drops it. The timers stop either way; the next render starts them again.
function onLeave() {
  offLeave = null;
  stopTimers();
  if (!mounted) return;
  if (!mounted.isCurrent()) { destroy(mounted); return; }
  // The router forgets its leave handlers once they ran. A kept page listens again, so that it is
  // still dropped on the next leave when the rebuild drew something else in its place (classic in
  // square mode, the session wait) and never reached begin().
  const kept = mounted;
  queueMicrotask(() => { if (mounted === kept && !offLeave) offLeave = onRouteLeave(onLeave); });
}

function onVisible() {
  if (document.visibilityState === 'visible' && mounted) refresh(mounted, mounted.run);
}

/** Classic takes over. Said once per page load, logged every time. */
function viewFailed(id, why) {
  logger.warn('ui', 'A view could not be drawn, so the standard layout is shown', { view: id, why });
  if (!toastShown) toast(VIEW_FAILED_TEXT, 'warn');
  toastShown = true;
}

/** A renderer threw after the page was up: classic from now on (the atlas page goes back to the dashboard). */
function giveUp(m) {
  broken.add(`${m.page}:${m.viewId}`);
  destroy(m);
  if (m.page === 'atlas') { navigate('/'); return; }
  viewFailed(m.viewId, 'a renderer threw');
  renderDashboard();
}

/** Starts a render of `page`: the mounted page when it is still on screen, else a new one. */
function begin(page, { app, viewId, view, loaded, isCurrent }) {
  const prev = mounted?.page === page && mounted.app === app && mounted.root?.isConnected ? mounted : null;
  if (mounted && !prev) destroy(mounted);
  const m = prev ?? {
    page, app, root: null, shape: null, shown: null, model: null, cleanups: [], patched: [], filter: START_FILTER, progress: {},
    briefings: readSavedBriefings(), run: 0, fetchedAt: null, fetchedOn: null,
  };
  Object.assign(m, {
    viewId, view, isCurrent, fresh: !prev, run: m.run + 1,
    rows: Array.isArray(loaded?.rows) ? loaded.rows : [], loadError: Boolean(loaded?.loadError),
    stale: Boolean(loaded?.stale), cachedAt: loaded?.cachedAt ?? null,
  });
  mounted = m;
  offLeave?.();
  offLeave = onRouteLeave(onLeave);
  if (!watching) document.addEventListener('visibilitychange', onVisible);
  watching = true;
  return m;
}

// --- Model ------------------------------------------------------------------------------------------

/** The entry input of one plan: its cached check, or null ("Checking") until it has one. */
function cachedEntry(row, briefing, profile) {
  const hit = entryCache.get(row.id);
  return hit && hit.key === JSON.stringify(entryRequest(row, briefing, profile)) ? hit.entry : null;
}

/** The unfiltered model from what is in memory and on the device, at a fresh now. */
function buildModel(m) {
  const profile = getProfileSummary();
  const rowById = new Map(m.rows.map((row) => [row.id, row]));
  const briefings = m.loadError ? [] : m.briefings.filter((briefing) => rowById.has(briefing.id));
  return buildDashboardModel({
    rows: m.rows, briefings, now: new Date(), prefs: getPrefs(), profile,
    ticks: Object.fromEntries(briefings.map(({ id }) => [id, readTicks(id)])),
    entries: Object.fromEntries(briefings.map((briefing) => [briefing.id, cachedEntry(rowById.get(briefing.id), briefing, profile)])),
    catalogue: DESTINATIONS, offlineIds: listOfflineTrips(), generation: m.progress,
    loadError: m.loadError, stale: m.stale, cachedAt: m.cachedAt, countryName: nationalityName,
  });
}

function ctxFor(m, animate) {
  return {
    prefs: getPrefs(), theme: effectiveTheme(), reducedMotion: prefersReducedMotion(), animate,
    baseUrl: BASE_URL, slots: { notes: '' },
    onCleanup: (fn) => { if (typeof fn === 'function') m.cleanups.push(fn); },
    onPatched: (fn) => { if (typeof fn === 'function') m.patched.push(fn); },
  };
}

const render = (m, model, ctx) => (m.page === 'atlas' ? atlasPageHtml(m.view, model, ctx) : m.view.renderDashboard(model, ctx));

/** The markup outside the regions: each region is cut down to its name, the typed search text is left out. */
function frameOf(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const region of template.content.querySelectorAll('[data-region]')) region.replaceWith(`{${region.getAttribute('data-region')}}`);
  for (const field of template.content.querySelectorAll('[data-trip-search]')) field.removeAttribute('value');
  return template.innerHTML;
}

// --- Painting ---------------------------------------------------------------------------------------

/**
 * Draws the model in memory: a patch of the regions when the root can be reused, else a full render
 * into a new root. `patchOnly` (the minute tick) never renders in full, so a tick cannot take the
 * focus or close a group. False when a renderer threw.
 */
function paint(m, { animate = false, patchOnly = false } = {}) {
  try {
    const held = m.root?.contains(document.activeElement) ? document.activeElement : null;
    const heldAt = { region: held?.closest('[data-region]')?.getAttribute('data-region') ?? null, trip: held?.closest('[data-trip-id]')?.getAttribute('data-trip-id') ?? null };
    const model = shownModel(m.model, m.filter);
    const html = render(m, model, ctxFor(m, false));
    const shape = { page: m.page, view: m.viewId, state: model.state, frame: patchOnly && m.shape ? m.shape.frame : frameOf(html) };
    const reuse = Boolean(m.root?.isConnected) && canReuseRoot(m.shape, shape);
    if (!reuse && patchOnly) return true;
    m.shown = model;
    if (reuse) {
      const { unmatched } = patchRegions(m.root, html, {
        onPatched: (region, el) => m.patched.forEach((fn) => fn(region, el)), openFromMarkup: model.filter.expanded,
      });
      if (!unmatched.length || patchOnly) {
        placeChooser(m);
        if (held) keepFocus(m.root, heldAt);
        return true;
      }
    }
    mountRoot(m, model, animate ? render(m, model, ctxFor(m, true)) : html, shape, animate);
    if (held) keepFocus(m.root, heldAt);
    return true;
  } catch (error) {
    logger.error('ui', 'A view could not draw this page', { view: m.viewId, page: m.page, error: error?.message });
    return false;
  }
}

/**
 * A paint took the focused control away (a deleted plan, "Show all past plans", "Try again"): focus
 * goes to the card of the same plan (its first control, else the card), else to the region that held
 * it, else to the heading, so the keyboard does not start from the top.
 */
function keepFocus(root, { region: regionName, trip }) {
  if (root.contains(document.activeElement)) return;
  const named = (attr, value) => (value ? [...root.querySelectorAll(`[${attr}]`)].filter((el) => el.getAttribute(attr) === value) : []);
  const [region] = named('data-region', regionName);
  const cards = named('data-trip-id', trip);
  const card = cards.find((el) => region?.contains(el)) ?? cards[0];
  const target = card?.querySelector(CARD_CONTROL) ?? card ?? region ?? root.querySelector('h1');
  if (target && !target.matches(CARD_CONTROL) && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target?.focus({ preventScroll: true });
}

/** A full render: a new root element, so everything bound to the old one goes with it. */
function mountRoot(m, model, html, shape, animate) {
  runCleanups(m);
  const active = document.activeElement;
  const inChooser = chooser?.node.contains(active) ? active : null;
  const focusKey = !inChooser && m.root?.contains(active) ? active.getAttribute('data-focus-key') : null;
  // The chooser is detached first, so it is not lost with the old content. Its picker must not
  // hear the focus leave and come back: for Undo, a walk through the radios is one run of changes.
  if (chooser) chooser.moving = true;
  const rowLeft = chooser?.node.querySelector('[data-keep-scroll]')?.scrollLeft; // a detached row forgets it
  chooser?.node.remove();
  const root = document.createElement('div');
  root.className = 'dashboard container dv-root';
  root.dataset.view = m.viewId;
  if (m.page !== 'dashboard') root.dataset.page = m.page;
  root.innerHTML = html;
  rememberRegions(root);
  if (m.root?.isConnected) m.root.replaceWith(root);
  else m.app.replaceChildren(root);
  Object.assign(m, { root, shape, patched: [] });
  const ctx = ctxFor(m, animate);
  const control = new AbortController();
  m.cleanups.push(() => control.abort());
  (m.page === 'atlas' ? m.view.mountAtlasPage : m.view.mountDashboard)?.(root, model, ctx);
  mountPhotoFrames(root, { signal: control.signal });
  mountMenus(root, { signal: control.signal });
  m.cleanups.push(mountFlaps(root, { animate: animate && !ctx.reducedMotion }));
  bindRoot(root, control.signal);
  placeChooser(m);
  // A chooser drawn again on a view that arrived from another device takes the focus on its current radio.
  const kept = inChooser && !inChooser.isConnected ? chooser?.node.querySelector('input:checked') : inChooser;
  const again = kept ?? (focusKey ? [...root.querySelectorAll('[data-focus-key]')].find((el) => el.getAttribute('data-focus-key') === focusKey) : null);
  again?.focus({ preventScroll: true });
  if (again?.matches('[data-trip-search]')) again.setSelectionRange(again.value.length, again.value.length);
  settleChooserRow(rowLeft, kept);
  if (chooser) chooser.moving = false;
}

/**
 * The chooser's card row after the node was moved to a new root: scrolled sideways as it was, and
 * then far enough that the card with the focus (else the selected one) is in view. Only the row
 * moves, never the page.
 */
function settleChooserRow(left, focused) {
  const row = chooser?.node.isConnected ? chooser.node.querySelector('[data-keep-scroll]') : null;
  if (!row) return;
  if (Number.isFinite(left)) row.scrollLeft = left;
  const card = (focused?.isConnected && row.contains(focused) ? focused : row.querySelector('input:checked'))?.closest('.ui-picker-card');
  const to = scrollLeftFor(
    { width: row.clientWidth, scrollWidth: row.scrollWidth, scrollLeft: row.scrollLeft, left: row.getBoundingClientRect().left },
    card?.getBoundingClientRect() ?? null,
  );
  if (to !== null) row.scrollLeft = to;
}

/** The hooks this file owns (blueprint 3.3): search, filter chips, show all past, notify, open atlas. */
function bindRoot(root, signal) {
  root.addEventListener('click', (event) => {
    const el = event.target instanceof Element ? event.target : null;
    const chip = el?.closest('[data-filter]');
    const action = el?.closest('[data-action]')?.getAttribute('data-action');
    // "Open passport": the router matches '/atlas' without a query, so the section travels here and
    // the link opens the plain page. A new tab (a modified click) is left to the browser.
    const section = atlasJumpId(el?.closest('a[href]')?.getAttribute('href'));
    if (section && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      askedJump = { id: section, at: Date.now() };
      navigate('/atlas');
      return;
    }
    if (chip) setFilter(root, { filter: chip.getAttribute('data-filter') });
    else if (action === 'show-all-past') setFilter(root, { allPast: true });
    else if (action === 'open-atlas') navigate('/atlas');
    else if (action === 'notify-ready') notifyWhenReady();
  }, { signal });
  root.addEventListener('input', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.matches('[data-trip-search]')) setFilter(root, { q: event.target.value });
  }, { signal });
}

function setFilter(root, change) {
  const m = mounted;
  if (!m || m.root !== root || !m.model) return;
  m.filter = { ...m.filter, ...change };
  if (!paint(m)) giveUp(m);
}

async function notifyWhenReady() {
  const manager = await import('../services/generation-manager.js').catch(() => null);
  const answer = manager ? await manager.requestCompletionNotifications() : 'unsupported';
  toast(NOTIFY_TEXT[answer] ?? NOTIFY_TEXT.unsupported, answer === 'granted' ? 'success' : 'info');
}

// --- The one-time chooser (blueprint 6.8) -----------------------------------------------------------

function dropChooser() {
  chooser?.stop();
  chooser?.node.remove();
  chooser = null;
}

/** The button: the chooser is seen (and nothing else is stored), and it never comes back. */
function chooserDone() {
  setPref('viewChooserSeen', true);
  const heading = mounted?.root?.querySelector('h1');
  dropChooser();
  if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
}

/** Keeps the one chooser node in the chooser slot of the root while it is due, and removes it when not. */
function placeChooser(m) {
  const slot = m.page === 'dashboard' ? m.root?.querySelector('[data-slot="chooser"]') : null;
  const due = Boolean(slot) && chooserVisible({
    prefs: getPrefs(), rowCount: m.rows.length, square: isSquareMode(), state: m.shown?.state,
    generating: m.rows.some((row) => row.status === 'generating'), remoteState: remotePrefsState(),
  });
  if (!due) { dropChooser(); return; }
  // A dev view (the stub) is not a choice: the stored pref under it is what the radios show.
  const active = activeViewId();
  const current = Object.hasOwn(VIEW_META, active) ? active : getPrefs().view;
  // The view changed without a pick here (prefs from another device): the chooser is drawn again on it.
  const refocus = Boolean(chooser) && !chooser.picking && chooser.shown !== current && chooser.node.contains(document.activeElement);
  if (chooser && !chooser.picking && chooser.shown !== current) dropChooser();
  if (!chooser) {
    const views = Object.values(VIEW_META);
    const holder = document.createElement('div');
    holder.innerHTML = viewChooserHtml({ current, theme: effectiveTheme(), views, baseUrl: BASE_URL });
    const node = holder.firstElementChild;
    const hush = (event) => { if (chooser?.moving) event.stopPropagation(); };
    node.addEventListener('focusout', hush, true);
    node.addEventListener('focusin', hush, true);
    const self = { node, moving: false, shown: current, picking: 0, stop: null };
    // A pick: `shown` follows the radios (the picker puts them back itself when the view cannot load).
    const onPick = async (id) => {
      const before = self.shown;
      Object.assign(self, { shown: id, picking: self.picking + 1 });
      try { await switchDashboardView(id); } catch (error) { if (self.shown === id) self.shown = before; throw error; } finally { self.picking -= 1; }
    };
    self.stop = mountViewPicker(node, { views, onPick, onDone: chooserDone });
    chooser = self;
  }
  if (chooser.node.parentNode !== slot) slot.replaceChildren(chooser.node);
  if (refocus) chooser.node.querySelector('input:checked')?.focus({ preventScroll: true });
}

// --- Late data, and staying true while open ---------------------------------------------------------

/** Rebuilds the model and draws it. False when the page is gone or had to be given up. */
function repaint(m, run, options) {
  if (!alive(m, run)) return false;
  try {
    m.model = buildModel(m);
  } catch (error) {
    logger.error('ui', 'The dashboard model could not be built', { view: m.viewId, page: m.page, error: error?.message });
    giveUp(m);
    return false;
  }
  if (paint(m, options)) return true;
  giveUp(m);
  return false;
}

function scheduleTick(m, run) {
  clearTimeout(tickTimer);
  tickTimer = m.page === 'dashboard' && m.model?.live.length ? setTimeout(() => refresh(m, run), TICK_MS) : 0;
}

/** The minute tick, and the page shown again: a fresh now, and the briefings again when they are old. */
function refresh(m, run) {
  if (!alive(m, run)) return;
  if (document.visibilityState === 'visible' && !m.loadError && m.page === 'dashboard') {
    if (!repaint(m, run, { patchOnly: true })) return;
    if (needsBriefingRefetch(m.fetchedAt, m.fetchedOn, Date.now())) lateData(m, run, { patchOnly: true });
  }
  scheduleTick(m, run);
}

/** Planning progress: now, then every 20 seconds while a plan is being planned and the tab is visible. */
async function pollProgress(m, run) {
  clearTimeout(pollTimer);
  pollTimer = 0;
  const ids = m.rows.filter((row) => row.status === 'generating').map((row) => row.id);
  if (!ids.length || m.page !== 'dashboard') return;
  if (document.visibilityState === 'visible') {
    const manager = await import('../services/generation-manager.js').catch(() => null);
    const days = manager ? await Promise.all(ids.map((id) => manager.fetchGenerationProgress(id).catch(() => null))) : [];
    if (!alive(m, run)) return;
    const known = ids.map((id, at) => [id, days[at]]).filter(([, daysDone]) => Number.isFinite(daysDone));
    if (known.length) {
      m.progress = { ...m.progress, ...Object.fromEntries(known.map(([id, daysDone]) => [id, {
        ...m.progress[id], daysDone, etaMinutes: etaMinutes(m.model?.cardsById[id]?.generation?.daysTotal, daysDone),
      }])) };
      if (!repaint(m, run)) return;
    }
  }
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => pollProgress(m, run), POLL_MS);
}

/** One briefing query for the live and upcoming plans (blueprint 7.2). The page stays on list data when it fails. */
async function fetchBriefings(m, run) {
  const now = new Date();
  const ids = briefingIds(m.rows, now);
  Object.assign(m, { fetchedAt: now.getTime(), fetchedOn: zonedToday(now) });
  if (!ids.length) return;
  const { data, error } = await fetchTripBriefings(ids, { liveUntil: briefingsUntil(m.model), now });
  if (!alive(m, run)) return;
  if (error || !Array.isArray(data)) m.fetchedAt = null; // nothing came and nothing was saved: the next refresh asks again
  else m.briefings = data;
}

/**
 * The entry check of every live and upcoming plan that has a briefing and no check yet, the lead
 * plan first. The checks run one after the other (they share the visa data files), each against
 * the same 8 second limit. Resolves true when a check was made.
 */
async function checkEntries(m) {
  const profile = getProfileSummary();
  const briefingOf = new Map(m.briefings.map((briefing) => [briefing.id, briefing]));
  const phaseOf = (row) => m.model?.cardsById[row.id]?.phase;
  const plans = [...leadOrder(m.rows.filter((row) => phaseOf(row) === 'live'), listOfflineTrips()), ...m.rows.filter((row) => phaseOf(row) === 'upcoming')];
  const todo = plans.filter((row) => briefingOf.has(row.id)).map((row) => {
    const request = entryRequest(row, briefingOf.get(row.id), profile);
    return { id: row.id, request, key: JSON.stringify(request) };
  }).filter(({ id, key }) => {
    const hit = entryCache.get(id);
    return !hit || hit.key !== key || hit.entry.reason === 'failed';
  });
  if (!todo.length) return false;
  const advisor = todo.some(({ request }) => request.passports.length) ? await import('../services/entry-advisor.js').catch(() => null) : null;
  let queue = Promise.resolve();
  await Promise.all(todo.map(async ({ id, request, key }) => {
    const entry = request.passports.length
      ? await entryInputWithTimeout(() => { queue = queue.catch(() => {}).then(() => advisor.entryPlan(request)); return queue; })
      : { reason: 'no-passport' };
    entryCache.set(id, { key, entry });
  }));
  return true;
}

/**
 * Blueprint 4.1 steps 5 and 6: what the first paint did not have. Every step checks the page is
 * still this one. `options` are those of paint(): a refresh of an open page only ever patches.
 */
async function lateData(m, run, options) {
  try {
    await Promise.all([profileSummaryReady(), m.page === 'dashboard' && !m.loadError ? fetchBriefings(m, run) : null]);
    if (!repaint(m, run, options)) return;
    scheduleTick(m, run);
    if (m.page !== 'dashboard' || m.loadError) return;
    if (await checkEntries(m)) repaint(m, run, options);
  } catch (error) {
    logger.warn('ui', 'The dashboard could not bring its late data in', { error: error?.message });
  }
}

/** The first render of this page load waits a moment for the synced prefs and for the profile. */
async function bootWait() {
  const waits = [prefsReady()];
  if (!getProfileSummary()) waits.push(profileSummaryReady());
  if (getPrefs().viewChooserSeen === false && remotePrefsState() === 'unknown') waits.push(syncPrefs({ minIntervalMs: PREFS_SYNC_GAP_MS }));
  await Promise.race([Promise.all(waits), new Promise((done) => { setTimeout(done, BOOT_WAIT_MS); })]);
}

// --- What dashboard.js and main.js call -------------------------------------------------------------

/**
 * Draws the signed-in dashboard in a view (the render cycle of blueprint 4.1). Resolves when the
 * first paint is on the page; the late data follows by itself.
 * @param {Element} app
 * @param {string} viewId   activeViewId() (ruling R17)
 * @param {{ rows: object[], loadError: boolean, stale: boolean, cachedAt: string|null }} loaded   from loadTrips()
 * @param {{ isCurrent: () => boolean }} guards   false once a newer render started or the route was left
 * @returns {Promise<boolean>} false when no view was drawn: the caller then renders the classic dashboard
 */
export async function renderDashboardView(app, viewId, loaded, { isCurrent = () => true } = {}) {
  stopTimers(); // direct calls of renderDashboard() do not pass the router, so nothing may stack
  let id = viewId;
  let m = null;
  try {
    if (!booted) {
      booted = true;
      await bootWait();
      if (!isCurrent()) return false;
    }
    // The view is read after every wait, not taken from the caller: the choice of the account may
    // have arrived, and a pick in the chooser may have landed while the list or the view loaded.
    let view = null;
    for (let tries = 0; tries < VIEW_LOAD_TRIES; tries += 1) {
      id = activeViewId() || viewId;
      view = broken.has(`dashboard:${id}`) ? null : await loadView(id);
      if (!isCurrent()) return false;
      if ((activeViewId() || viewId) === id) break;
    }
    if (typeof view?.renderDashboard !== 'function') {
      viewFailed(id, 'the view did not load');
      return false;
    }
    m = begin('dashboard', { app, viewId: id, view, loaded, isCurrent });
    m.model = buildModel(m);
    if (!paint(m, { animate: m.fresh })) throw new Error('its renderer threw');
  } catch (error) {
    // Nothing here may be lost in silence: the caller draws the standard layout, and the log says why.
    logger.error('ui', 'The dashboard view could not be drawn', { view: id, error: error?.message });
    if (m) { broken.add(`dashboard:${id}`); destroy(m); } // the model or the renderer: classic for this page load
    viewFailed(id, error?.message || 'it threw');
    return false;
  }
  const { run } = m;
  scheduleTick(m, run);
  pollProgress(m, run);
  lateData(m, run);
  // The chooser waits for the prefs of the account: it appears when they are known.
  if (getPrefs().viewChooserSeen === false && remotePrefsState() === 'unknown') {
    syncPrefs({ minIntervalMs: PREFS_SYNC_GAP_MS }).then(() => { if (alive(m, run)) placeChooser(m); });
  }
  return true;
}

/**
 * Drops a page of this controller whose root is no longer in the document. dashboard.js calls it
 * after every write into #app that is not a view (classic, the landing, the skeleton, the reconnect
 * card), so the cleanups of a view that was replaced in place run and its chooser goes with it.
 */
export function releaseDashboardView() {
  if (mounted && !mounted.root?.isConnected) destroy(mounted);
}

/**
 * What a pick in the chooser calls: loads the view, stores the pref, then draws the dashboard again
 * from what is in memory. No request, no skeleton, no router; the chooser node and its focus stay.
 * Picks are applied in order, and a pick that a newer one overtook is skipped.
 * @param {string} id
 * @returns {Promise<void>} rejects when the view cannot load: the picker then puts the selection back
 */
export function switchDashboardView(id) {
  const seq = ++switchSeq;
  const pick = switching.catch(() => {}).then(async () => {
    if (seq !== switchSeq) return;
    const view = await setActiveView(id);
    const m = mounted;
    // Not alive(): a list reload in flight has taken the turn, and the page on screen is still this one.
    // That reload reads the view again when it draws, so the pick is drawn now and kept then.
    if (seq !== switchSeq || !m || m.page !== 'dashboard' || !m.model || !m.root?.isConnected) return;
    Object.assign(m, { viewId: id, view });
    if (!paint(m)) giveUp(m);
  });
  switching = pick;
  return pick;
}

/**
 * A generation update while a view root is on the page (dashboard.js holds the one subscription).
 * Done: the list is loaded again and the cycle reuses the root, so the card turns into a linked
 * card in place. Failed and slow: the row or its progress changes in memory and the page is patched.
 * @param {string} tripId
 * @param {{ status: string, slow?: boolean }|null} status
 */
export function onGenerationUpdateForView(tripId, status) {
  const m = mounted;
  if (!m || !status || !alive(m, m.run)) return;
  if (status.status === 'done') {
    if (m.page === 'atlas') renderAtlasRoute();
    else renderDashboard();
    return;
  }
  if (status.status === 'failed') m.rows = applyGenerationStatus(m.rows, tripId, status);
  else m.progress = { ...m.progress, [tripId]: { ...m.progress[tripId], slow: Boolean(status.slow) } };
  if (repaint(m, m.run)) placeChooser(m);
}

/**
 * The #/atlas page: its own token and route check, the #app handlers bound on a direct load, the
 * shared skeleton while the list loads, then renderAtlasPage from the same model as the dashboard.
 * It goes back to the dashboard unless the atlas view is on and square mode is off.
 */
export async function renderAtlasRoute() {
  const app = document.getElementById('app');
  if (!app || !isAtlasRoute()) return;
  const token = ++atlasToken;
  const isCurrent = () => token === atlasToken && isAtlasRoute();
  bindDashboardHandlers(app);
  stopTimers();
  if (isSquareMode() || activeViewId() !== 'atlas' || broken.has('atlas:atlas')) { navigate('/'); return; }
  if (!app.querySelector('.dv-root[data-page="atlas"]')) app.innerHTML = renderSkeleton();
  const [loaded, view] = await Promise.all([loadTrips(), loadView('atlas')]);
  if (!isCurrent()) return;
  if (typeof view?.renderAtlasPage !== 'function') { navigate('/'); return; }
  const m = begin('atlas', { app, viewId: 'atlas', view, loaded, isCurrent });
  m.model = buildModel(m);
  if (!paint(m, { animate: m.fresh })) { giveUp(m); return; }
  jumpOnAtlas(m);
  if (!getProfileSummary()) lateData(m, m.run); // the home pin needs the profile
}

/**
 * "#/atlas?open=passport": the section is scrolled to once per arrival at that address (a rebuild of
 * the same address leaves the page where the reader put it). On a direct load the view draws the
 * section after its first paint, so the jump waits for it, at most ATLAS_JUMP_WAIT_MS.
 */
function jumpOnAtlas(m) {
  const { hash } = location;
  const asked = askedJump && Date.now() - askedJump.at < ATLAS_JUMP_WAIT_MS ? askedJump.id : null;
  askedJump = null;
  if (!asked && m.jumpedFor === hash) return;
  m.jumpedFor = hash;
  m.stopJump?.();
  m.stopJump = null;
  const id = asked ?? atlasJumpId(hash);
  if (!id) return;
  const jump = () => {
    const section = document.getElementById(id);
    if (!section || !m.root?.contains(section)) return false;
    section.scrollIntoView({ block: 'start' });
    return true;
  };
  if (jump()) return;
  // Watched on #app, not on the root: a full render replaces the root while the section is awaited.
  const watcher = new MutationObserver(() => { if (mounted !== m || jump()) stop(); });
  const timer = setTimeout(() => stop(), ATLAS_JUMP_WAIT_MS);
  const stop = () => { watcher.disconnect(); clearTimeout(timer); if (m.stopJump === stop) m.stopJump = null; };
  m.stopJump = stop;
  watcher.observe(m.app, { childList: true, subtree: true });
}
