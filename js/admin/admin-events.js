// What a click, a key or a typed letter does on the admin console. One set of listeners on the page
// root, removed with the page.
import { showToast } from '../components/toast.js';
import { scrollBehavior } from '../lib/motion.js';
import { toggleSort } from './admin-filters.js';
import { SECTIONS } from './admin-parts.js';
import { changeRole, copyLog, deleteTrip, purgeLogs, retryTrip } from './admin-actions.js';

const SEARCH_WAIT_MS = 350;
const MARK_MS = 2400;
const LOG_CHIPS = Object.freeze({ 'log-level': 'level', 'log-category': 'category', 'log-source': 'source' });
const FIRST_DIR = Object.freeze({ trips: 'desc', joined: 'desc', active: 'desc', created: 'desc', dates: 'desc', days: 'desc' });

function rowOf(page, id) {
  return id ? page.root.querySelector(`[data-adm-row="${CSS.escape(id)}"]`) : null;
}

function reveal(page, id, focusSelector) {
  const row = rowOf(page, id);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
  row.querySelector(focusSelector)?.focus({ preventScroll: true });
}

/** Opens a section at a row or with a chip set: where an Overview line, an owner or a log line leads. */
function goTo(page, section, id, value) {
  if (section === 'people') {
    const known = id ? page.data.people.some((person) => person.id === id) : true;
    if (!known) { showToast('That person is not in the loaded list. They may have left.', 'info'); return; }
    page.people = { ...page.people, q: '', chip: value || 'all', openId: id || null, detail: null };
    page.setSection('people');
    if (id) { page.loadPersonLogs(id); reveal(page, id, '.adm-toggle'); }
    return;
  }
  if (section === 'trips') {
    const known = id ? page.data.trips.some((trip) => trip.id === id) : true;
    if (!known) { showToast('That trip is not in the loaded list. It may have been deleted.', 'info'); return; }
    page.trips = { ...page.trips, q: '', status: value || 'all', focusId: id || null };
    page.setSection('trips');
    if (id) {
      reveal(page, id, 'a.ui-btn');
      setTimeout(() => {
        if (!page.alive || page.trips.focusId !== id) return;
        page.trips = { ...page.trips, focusId: null };
        rowOf(page, id)?.classList.remove('is-marked');
      }, MARK_MS);
    }
    return;
  }
  if (section === 'activity') {
    page.activity = { ...page.activity, level: value || 'all', category: 'all', source: 'all', q: '', openId: null, status: 'loading', logs: [] };
    page.setSection('activity');
    page.reloadLogs();
  }
}

function onChip(page, name, value) {
  if (name === 'people') {
    page.people = { ...page.people, chip: value };
    page.patch(['people-chips', 'people-results']);
  } else if (name === 'trips') {
    page.trips = { ...page.trips, status: value };
    page.patch(['trips-chips', 'trips-results']);
  } else if (Object.hasOwn(LOG_CHIPS, name)) {
    page.activity = { ...page.activity, [LOG_CHIPS[name]]: value, openId: null };
    page.patch(['logs-chips']);
    page.reloadLogs();
  }
}

function onSort(page, table, key) {
  if (table !== 'people' && table !== 'trips') return;
  page[table] = { ...page[table], sort: toggleSort(page[table].sort, key, FIRST_DIR[key] ?? 'asc') };
  page.patch([`${table}-results`]);
}

function clearFilters(page) {
  const field = page.root.querySelector('[data-adm-search]');
  if (field) field.value = '';
  if (page.section === 'people') {
    page.people = { ...page.people, q: '', chip: 'all' };
    page.patch(['people-chips', 'people-results']);
  } else if (page.section === 'trips') {
    page.trips = { ...page.trips, q: '', status: 'all' };
    page.patch(['trips-chips', 'trips-results']);
  } else if (page.section === 'activity') {
    page.activity = { ...page.activity, q: '', level: 'all', category: 'all', source: 'all' };
    page.patch(['logs-chips']);
    page.reloadLogs();
  }
  field?.focus({ preventScroll: true });
}

function onAction(page, action, id) {
  switch (action) {
    case 'reload': page.refresh(); break;
    case 'clear-filters': clearFilters(page); break;
    case 'toggle-person': {
      const open = page.people.openId === id ? null : id;
      page.people = { ...page.people, openId: open, detail: null };
      page.patch(['people-results']);
      if (open) page.loadPersonLogs(open);
      break;
    }
    case 'person-logs': page.loadPersonLogs(id); break;
    case 'role': changeRole(page, id); break;
    case 'retry-trip': retryTrip(page, id); break;
    case 'delete-trip': deleteTrip(page, id); break;
    case 'toggle-log':
      page.activity = { ...page.activity, openId: page.activity.openId === id ? null : id, copiedId: null };
      page.patch(['logs-results']);
      break;
    case 'copy-log': copyLog(page, id); break;
    case 'more-logs': page.loadLogs({ reset: false }); break;
    case 'reload-logs': page.reloadLogs(); break;
    case 'purge-logs': purgeLogs(page); break;
    default: break;
  }
}

function onSearch(page, name, value) {
  if (name === 'people') {
    page.people = { ...page.people, q: value };
    page.patch(['people-results']);
  } else if (name === 'trips') {
    page.trips = { ...page.trips, q: value };
    page.patch(['trips-results']);
  } else if (name === 'logs') {
    page.activity = { ...page.activity, q: value, openId: null };
    clearTimeout(page.searchTimer);
    page.searchTimer = setTimeout(() => page.reloadLogs(), SEARCH_WAIT_MS);
  }
}

/** Arrow keys, Home and End move along the tabs, as a tab list should. */
function onTabKey(page, event) {
  const tab = event.target.closest?.('[data-adm-tab]');
  if (!tab) return;
  const keys = SECTIONS.map((section) => section.key);
  const at = keys.indexOf(tab.dataset.admTab);
  const to = { ArrowRight: (at + 1) % keys.length, ArrowLeft: (at - 1 + keys.length) % keys.length, Home: 0, End: keys.length - 1 }[event.key];
  if (to === undefined) return;
  event.preventDefault();
  page.setSection(keys[to]);
  page.root.querySelector(`[data-adm-tab="${keys[to]}"]`)?.focus();
}

/** A picture that does not load gives way to the initials it carries. */
function onImageError(event) {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('adm-avatar')) return;
  const span = document.createElement('span');
  span.className = img.className;
  span.setAttribute('aria-hidden', 'true');
  span.textContent = img.dataset.admInitials || '?';
  img.replaceWith(span);
}

export function bindEvents(page) {
  const { root } = page;
  const sig = { signal: page.abort.signal };

  root.addEventListener('click', (event) => {
    const el = event.target.closest('[data-adm-tab], [data-adm-chip], [data-adm-sort], [data-adm-goto], [data-adm-action]');
    if (!el || !root.contains(el) || el.disabled) return;
    const data = el.dataset;
    if (data.admTab) page.setSection(data.admTab);
    else if (data.admChip) onChip(page, data.admChip, data.admValue);
    else if (data.admSort) onSort(page, data.admTable, data.admSort);
    else if (data.admGoto) goTo(page, data.admGoto, data.admId, data.admValue);
    else if (data.admAction) onAction(page, data.admAction, data.admId);
  }, sig);

  root.addEventListener('input', (event) => {
    const field = event.target.closest?.('[data-adm-search]');
    if (field) onSearch(page, field.dataset.admSearch, field.value);
  }, sig);

  root.addEventListener('change', (event) => {
    if (event.target.matches?.('[data-adm-auto]')) page.setAuto(event.target.checked);
  }, sig);

  root.addEventListener('keydown', (event) => onTabKey(page, event), sig);
  root.addEventListener('error', onImageError, { capture: true, signal: page.abort.signal });

  const onNetwork = () => {
    page.online = typeof navigator === 'undefined' || navigator.onLine !== false;
    page.redraw();
  };
  window.addEventListener('online', onNetwork, sig);
  window.addEventListener('offline', onNetwork, sig);
}
