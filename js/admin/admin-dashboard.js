// The Admin route: an operator's console over what an admin can already read. This file loads the
// data, keeps the state of the page and draws it; the markup of each section is its own file
// (admin-overview.js, admin-people.js, admin-trips.js, admin-logs.js), the numbers are pure
// (admin-stats.js, admin-filters.js, admin-format.js), what a click does is admin-events.js and
// admin-actions.js.
import '../views/shared/styles.js';
import { onRouteLeave } from '../router.js';
import { getUser } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { showToast } from '../components/toast.js';
import { adminStatus, fetchErrorCounts, fetchGenerationJobs, fetchLogFacts, fetchLogs, fetchPeople, fetchTrips, LIMITS } from '../data/admin-repository.js';
import { statusLine } from './admin-stats.js';
import { deniedPageHtml, failedPageHtml, headHtml, isSection, loadingPageHtml, tabsHtml } from './admin-parts.js';
import { overviewHtml } from './admin-overview.js';
import { peopleHtml } from './admin-people.js';
import { tripsHtml } from './admin-trips.js';
import { AUTO_REFRESH_MS, activityHtml } from './admin-logs.js';
import { bindEvents } from './admin-events.js';

const SECTION_KEY = 'trippy-admin-section';
const SECTION_HTML = Object.freeze({ overview: overviewHtml, people: peopleHtml, trips: tripsHtml, activity: activityHtml });

/** The one mounted page, or null. */
let mounted = null;

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

function storedSection() {
  try {
    const key = sessionStorage.getItem(SECTION_KEY);
    return isSection(key) ? key : 'overview';
  } catch {
    return 'overview';
  }
}

function storeSection(key) {
  try { sessionStorage.setItem(SECTION_KEY, key); } catch { /* private mode: the section is simply not remembered */ }
}

function emptyData() {
  return { people: [], trips: [], peopleTotal: 0, tripsTotal: 0, jobs: [], facts: [], factsTruncated: false, errors: null, warnings: [], loadedAt: null };
}

function createPage(app) {
  return {
    app,
    root: null,
    alive: true,
    abort: new AbortController(),
    meId: getUser()?.id ?? null,
    online: isOnline(),
    busy: false,
    section: storedSection(),
    data: emptyData(),
    busyTrips: new Set(),
    people: { q: '', chip: 'all', sort: { key: 'joined', dir: 'desc' }, openId: null, detail: null },
    trips: { q: '', status: 'all', sort: { key: 'created', dir: 'desc' }, focusId: null },
    activity: { level: 'all', category: 'all', source: 'all', q: '', logs: [], count: 0, status: 'idle', error: '', openId: null, auto: false, loadingMore: false, copiedId: null },
    logSerial: 0,
    autoTimer: null,
    searchTimer: null,
    copiedTimer: null,
  };
}

function teardown(page) {
  if (!page || !page.alive) return;
  page.alive = false;
  page.abort.abort();
  clearInterval(page.autoTimer);
  clearTimeout(page.searchTimer);
  clearTimeout(page.copiedTimer);
  page.offLeave?.();
  if (mounted === page) mounted = null;
}

/** What the section builders read: the state of the page with the clock of this draw. */
function viewModel(page) {
  return { now: new Date(), meId: page.meId, data: page.data, busyTrips: page.busyTrips, people: page.people, trips: page.trips, activity: page.activity };
}

function pageInner(page) {
  const { data } = page;
  const status = statusLine({ peopleTotal: data.peopleTotal, tripsTotal: data.tripsTotal, jobs: data.jobs, trips: data.trips, now: new Date() });
  const badges = { people: data.peopleTotal, trips: data.tripsTotal };
  const label = `adm-tab-${page.section}`;
  return `${headHtml({ status, loadedAt: data.loadedAt, busy: page.busy, online: page.online })}
    ${tabsHtml(page.section, badges)}
    <div class="adm-panel" id="adm-panel" role="tabpanel" aria-labelledby="${label}" data-adm-section="${page.section}">${SECTION_HTML[page.section](viewModel(page))}</div>`;
}

function keepFocus(page, work) {
  const active = document.activeElement;
  const key = active && page.root.contains(active) ? active.dataset.focusKey : null;
  const caret = key && active.matches('input[type="search"]') ? [active.selectionStart, active.selectionEnd] : null;
  work();
  if (!key) return;
  const next = page.root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
  if (!next || next === document.activeElement) return;
  next.focus({ preventScroll: true });
  if (caret) { try { next.setSelectionRange(caret[0], caret[1]); } catch { /* not a text field any more */ } }
}

/** Draws the whole page again and keeps the focus where it was. */
function redraw(page) {
  if (!page.alive || !page.root) return;
  keepFocus(page, () => { page.root.innerHTML = pageInner(page); });
}

/** Draws only the named regions of the open section again: a search field is never touched. */
function patch(page, names) {
  if (!page.alive || !page.root) return;
  const fresh = document.createElement('template');
  fresh.innerHTML = SECTION_HTML[page.section](viewModel(page));
  keepFocus(page, () => {
    for (const name of names) {
      const from = fresh.content.querySelector(`[data-adm-region="${name}"]`);
      const to = page.root.querySelector(`[data-adm-region="${name}"]`);
      if (from && to) to.innerHTML = from.innerHTML;
    }
  });
}

/** Loads one page of logs. `reset` starts from the newest line; without it the next page is added. */
async function loadLogs(page, { reset = true, quiet = false } = {}) {
  if (!page.alive) return;
  const serial = ++page.logSerial;
  const state = page.activity;
  const offset = reset ? 0 : state.logs.length;
  page.activity = reset
    ? { ...state, status: quiet && state.logs.length ? state.status : 'loading', logs: quiet ? state.logs : [], error: '' }
    : { ...state, loadingMore: true };
  if (page.section === 'activity' && !quiet) patch(page, ['logs-results']);
  let result;
  try {
    result = await fetchLogs({ level: state.level, category: state.category, source: state.source, q: state.q, limit: LIMITS.logs, offset });
  } catch (err) {
    result = { data: [], count: 0, error: err?.message || 'The request failed.' };
  }
  if (!page.alive || serial !== page.logSerial) return;
  const held = page.activity;
  if (result.error) {
    logger.warn('data', 'Admin logs could not be loaded', { error: result.error });
    page.activity = quiet || !reset
      ? { ...held, loadingMore: false }
      : { ...held, status: 'error', error: 'Check your connection, then try again.', logs: [], count: 0, loadingMore: false };
  } else {
    const logs = reset ? result.data : [...held.logs, ...result.data];
    page.activity = { ...held, status: 'ready', error: '', logs, count: Math.max(result.count, logs.length), loadingMore: false };
  }
  if (page.section === 'activity') patch(page, ['logs-results']);
}

/** The recent log lines of the person whose row is open. */
async function loadPersonLogs(page, personId) {
  page.people = { ...page.people, detail: { id: personId, status: 'loading', logs: [] } };
  if (page.section === 'people') patch(page, ['people-results']);
  let result;
  try {
    result = await fetchLogs({ userId: personId, limit: LIMITS.personLogs });
  } catch (err) {
    result = { data: [], error: err?.message || 'The request failed.' };
  }
  if (!page.alive || page.people.detail?.id !== personId) return;
  page.people = { ...page.people, detail: { id: personId, status: result.error ? 'error' : 'ready', logs: result.data } };
  if (page.section === 'people') patch(page, ['people-results']);
}

function setAuto(page, on) {
  clearInterval(page.autoTimer);
  page.autoTimer = null;
  page.activity = { ...page.activity, auto: on };
  if (!on) return;
  page.autoTimer = setInterval(() => {
    if (page.section !== 'activity' || document.hidden || !isOnline()) return;
    loadLogs(page, { reset: true, quiet: true });
  }, AUTO_REFRESH_MS);
}

function setSection(page, key) {
  if (!isSection(key) || !page.alive) return;
  page.section = key;
  storeSection(key);
  redraw(page);
  if (key === 'activity' && page.activity.status === 'idle') loadLogs(page);
}

/** Reads everything the page shows. False when nothing at all could be read. */
async function loadData(page) {
  const now = Date.now();
  const [people, trips, jobs, facts, errors] = await Promise.all([
    fetchPeople(), fetchTrips(), fetchGenerationJobs({ now }), fetchLogFacts({ now }), fetchErrorCounts({ now }),
  ]);
  if (people.error && trips.error) return false;
  const warnings = [];
  if (people.error) warnings.push('People could not be read, so names and counts of people are missing.');
  if (trips.error) warnings.push('Trips could not be read, so the trip numbers are missing.');
  if (jobs.error) warnings.push('Generation jobs could not be read, so health is worked out from the trips alone.');
  if (facts.error) warnings.push('Logs could not be read, so error counts and last active times are missing.');
  for (const failure of [people, trips, jobs, facts]) {
    if (failure.error) logger.warn('data', 'Admin data could not be read', { error: failure.error });
  }
  page.data = {
    people: people.data, trips: trips.data, peopleTotal: people.total, tripsTotal: trips.total,
    jobs: jobs.data, facts: facts.data, factsTruncated: facts.truncated, errors, warnings,
    loadedAt: new Date().toISOString(),
  };
  return true;
}

/** Reads everything again in place: the section, the filters and the open rows stay. */
async function refresh(page) {
  if (!page.alive || page.busy || !isOnline()) return;
  page.busy = true;
  redraw(page);
  let ok = false;
  try { ok = await loadData(page); } catch (err) { logger.warn('data', 'Admin refresh failed', { error: err?.message }); }
  if (!page.alive) return;
  page.busy = false;
  redraw(page);
  if (!ok) {
    showToast('The numbers could not be refreshed. Try again.', 'error');
    return;
  }
  if (page.activity.status !== 'idle') loadLogs(page, { reset: true, quiet: page.activity.logs.length > 0 });
  if (page.people.openId) loadPersonLogs(page, page.people.openId);
}

function showStatic(page, html) {
  page.app.innerHTML = html;
  page.root = null;
  const again = () => { if (page.alive) renderAdminDashboard(); };
  page.app.querySelector('[data-adm-action="reload"]')?.addEventListener('click', again, { signal: page.abort.signal });
  window.addEventListener('online', again, { signal: page.abort.signal });
}

export async function renderAdminDashboard() {
  teardown(mounted);
  const app = document.getElementById('app');
  const page = createPage(app);
  mounted = page;
  page.offLeave = onRouteLeave(() => teardown(page));
  app.innerHTML = loadingPageHtml();

  if (!page.online) { showStatic(page, failedPageHtml({ online: false })); return; }
  const role = await adminStatus();
  if (!page.alive) return;
  if (role === 'user') { app.innerHTML = deniedPageHtml(); return; }
  if (role === 'unknown') { showStatic(page, failedPageHtml({ online: isOnline(), message: 'Your account could not be checked. Check your connection, then try again.' })); return; }

  let ok = false;
  try { ok = await loadData(page); } catch (err) { logger.warn('data', 'Admin load failed', { error: err?.message }); }
  if (!page.alive) return;
  if (!ok) { showStatic(page, failedPageHtml({ online: isOnline() })); return; }

  app.innerHTML = '<div class="container adm" data-view="admin"></div>';
  page.root = app.firstElementChild;
  page.redraw = () => redraw(page);
  page.patch = (names) => patch(page, names);
  page.reloadLogs = () => loadLogs(page);
  page.loadLogs = (opts) => loadLogs(page, opts);
  page.loadPersonLogs = (id) => loadPersonLogs(page, id);
  page.setSection = (key) => setSection(page, key);
  page.setAuto = (on) => setAuto(page, on);
  page.refresh = () => refresh(page);
  redraw(page);
  bindEvents(page);
  if (page.section === 'activity') loadLogs(page);
}
