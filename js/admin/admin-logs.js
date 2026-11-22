// Activity: the logs. Chips with counts for level, category and source, a search in the message,
// rows that open into readable key and value lines, auto refresh, paging, and housekeeping.
import { attr, cls, esc } from '../views/shared/html.js';
import { icon } from '../views/shared/icons.js';
import { formatDate, formatDateTime, formatTime, humanKey, metadataLines, num, plural, relativeTime } from './admin-format.js';
import { LOG_CATEGORIES, LOG_LEVELS, LOG_SOURCES, logChipCounts } from './admin-filters.js';
import { errorLine } from './admin-stats.js';
import { chipsHtml, emptyHtml, errorHtml, levelPillHtml, searchHtml, tagHtml, td, theadHtml } from './admin-parts.js';

export const PURGE_DAYS = 90;
export const AUTO_REFRESH_MS = 30000;

const COLUMNS = Object.freeze([
  { label: 'Level' },
  { label: 'Time' },
  { label: 'Message' },
  { label: 'Category' },
  { label: 'Person' },
  { label: 'Trip' },
  { label: 'Details', hidden: true },
]);
const ROW_MESSAGE_CHARS = 240;
const SOURCE_WORDS = { client: 'App', edge: 'Server' };

/** The purge dialog. The database already deletes logs after one year; this only does it sooner. */
export function purgePrompt() {
  return {
    title: `Delete logs older than ${PURGE_DAYS} days?`,
    body: `Logs are already deleted automatically after one year. This deletes everything older than ${PURGE_DAYS} days now.\nThis cannot be undone.`,
    confirmLabel: 'Delete old logs',
    danger: true,
  };
}

/** The lines of an opened log row: where it came from first, then its metadata. */
export function logDetailLines(log, { now, timeZone } = {}) {
  const lines = [
    { key: 'When', value: `${formatDate(log.created_at, { timeZone })}, ${formatTime(log.created_at, { timeZone })} (${relativeTime(log.created_at, now, { timeZone })})`, block: false },
    { key: 'Source', value: Object.hasOwn(SOURCE_WORDS, log.source) ? SOURCE_WORDS[log.source] : 'Not known', block: false },
  ];
  lines.push({ key: 'Category', value: humanKey(log.category), block: false });
  const trip = typeof log.trips?.title === 'string' ? log.trips.title.trim() : '';
  if (trip) lines.push({ key: 'Trip', value: trip, block: false });
  if (log.user_id) lines.push({ key: 'Person ID', value: String(log.user_id), block: false });
  if (log.trip_id) lines.push({ key: 'Trip ID', value: String(log.trip_id), block: false });
  if (log.user_agent) lines.push({ key: 'Device', value: String(log.user_agent), block: false });
  return [...lines, ...metadataLines(log.metadata)];
}

function detailHtml(log, vm) {
  const lines = logDetailLines(log, vm).map((line) => `<div class="adm-kv">
      <dt>${esc(line.key)}</dt>
      <dd>${line.block ? `<pre class="adm-pre" tabindex="0">${esc(line.value)}</pre>` : esc(line.value)}</dd>
    </div>`).join('');
  const copied = vm.activity.copiedId === log.id;
  return `<tr class="adm-detail-row" role="row"><td role="cell" colspan="${COLUMNS.length}">
      <div class="adm-detail adm-detail--log"${attr('id', `adm-log-${log.id}`)}>
        ${errorLine(log.message, ROW_MESSAGE_CHARS) === String(log.message ?? '').trim() ? '' : `<pre class="adm-pre adm-log-full" tabindex="0">${esc(log.message)}</pre>`}
        <dl class="adm-kvs">${lines}</dl>
        <p class="adm-detail-actions"><button type="button" class="ui-btn ui-btn--small" data-adm-action="copy-log"${attr('data-adm-id', log.id)}${attr('data-focus-key', `copy-${log.id}`)}>${icon(copied ? 'check' : 'file', 16)}<span>${copied ? 'Copied' : 'Copy as JSON'}</span></button></p>
      </div>
    </td></tr>`;
}

function rowHtml(log, vm) {
  const open = vm.activity.openId === log.id;
  const person = typeof log.profiles?.display_name === 'string' ? log.profiles.display_name.trim() : '';
  const trip = typeof log.trips?.title === 'string' ? log.trips.title.trim() : '';
  const who = log.user_id
    ? `<button type="button" class="adm-linkish" data-adm-goto="people"${attr('data-adm-id', log.user_id)}${attr('data-focus-key', `log-person-${log.id}`)}>${esc(person || 'No name')}</button>`
    : '<span class="adm-quiet">Nobody</span>';
  const what = log.trip_id
    ? `<button type="button" class="adm-linkish" data-adm-goto="trips"${attr('data-adm-id', log.trip_id)}${attr('data-focus-key', `log-trip-${log.id}`)}>${esc(trip || 'Untitled trip')}</button>`
    : '<span class="adm-quiet">None</span>';
  const time = `<time class="adm-log-time"${attr('datetime', log.created_at)}><span class="adm-mono">${esc(formatDateTime(log.created_at, vm.now, { timeZone: vm.timeZone }))}</span><span class="adm-log-ago">${esc(relativeTime(log.created_at, vm.now, { timeZone: vm.timeZone }))}</span></time>`;
  const toggle = `<button type="button" class="adm-icon-btn adm-toggle" data-adm-action="toggle-log"${attr('data-adm-id', log.id)}${attr('data-focus-key', `log-${log.id}`)} aria-expanded="${open}"${attr('aria-controls', open ? `adm-log-${log.id}` : null)}${attr('aria-label', `${open ? 'Hide' : 'Show'} details of this ${log.level === 'error' ? 'error' : 'line'}`)}>${icon('chevron-down', 20)}</button>`;
  return `<tr class="${cls('adm-row', { 'is-open': open })}" role="row"${attr('data-adm-row', log.id)}${attr('data-level', log.level)}>
      ${td('', levelPillHtml(log.level), { cls: 'adm-td--level' })}
      ${td('Time', time, { cls: 'adm-td--time' })}
      ${td('', `<span class="adm-log-message">${esc(errorLine(log.message, ROW_MESSAGE_CHARS))}</span>`, { cls: 'adm-td--message' })}
      ${td('Category', tagHtml(humanKey(log.category)))}
      ${td('Person', who)}
      ${td('Trip', what, { cls: 'adm-td--trip' })}
      ${td('', toggle, { cls: 'adm-td--end' })}
    </tr>${open ? detailHtml(log, vm) : ''}`;
}

function chipGroups(vm) {
  const state = vm.activity;
  const counts = logChipCounts(vm.data.facts);
  const group = (name, label, active, options) => `<div class="adm-chip-group"><span class="adm-chip-label" aria-hidden="true">${esc(label)}</span>${chipsHtml({ name, label: `Filter by ${label.toLowerCase()}`, active, options })}</div>`;
  const levels = [{ key: 'all', label: 'All', count: counts.total }, ...LOG_LEVELS.map((level) => ({ ...level, count: counts.level[level.key] ?? 0 }))];
  const categories = [{ key: 'all', label: 'All' }, ...LOG_CATEGORIES.map((key) => ({ key, label: humanKey(key), count: counts.category[key] ?? 0 }))];
  const sources = [{ key: 'all', label: 'All' }, ...LOG_SOURCES.map((source) => ({ ...source, count: counts.source[source.key] ?? 0 }))];
  const scope = vm.data.factsTruncated
    ? `The counts on the chips are from the newest ${num(vm.data.facts.length)} lines of the last 7 days.`
    : 'The counts on the chips are for the last 7 days.';
  return `${group('log-level', 'Level', state.level, levels)}
      ${group('log-category', 'Category', state.category, categories)}
      ${group('log-source', 'Source', state.source, sources)}
      <p class="adm-quiet adm-chip-scope">${esc(scope)}</p>`;
}

function resultsHtml(vm) {
  const state = vm.activity;
  if (state.status === 'loading' && !state.logs.length) {
    const lines = Array.from({ length: 6 }, () => '<span class="adm-skel adm-skel--row"></span>').join('');
    return `<div class="adm-table-card adm-skel-card" role="status" aria-busy="true"><span class="ui-vh">Loading the logs</span>${lines}</div>`;
  }
  if (state.status === 'error') return errorHtml('The logs could not be loaded', state.error || 'Check your connection, then try again.', { action: 'reload-logs' });
  const filtering = Boolean(state.q.trim()) || state.level !== 'all' || state.category !== 'all' || state.source !== 'all';
  if (!state.logs.length) {
    return filtering
      ? emptyHtml('No line matches', 'No log line fits this search and these filters.', { clear: true })
      : emptyHtml('The log is empty', 'Errors, warnings and notes from the app and the server appear here.');
  }
  const left = Math.max(0, state.count - state.logs.length);
  const more = left
    ? `<p class="adm-more"><button type="button" class="ui-btn" data-adm-action="more-logs" data-focus-key="more-logs"${attr('disabled', state.loadingMore === true)}>${state.loadingMore ? 'Loading' : `Load more (${num(left)} left)`}</button></p>`
    : '';
  return `<div class="adm-table-card">
      <table class="adm-table adm-table--logs" role="table" aria-label="Log lines">
        ${theadHtml('logs', COLUMNS, null)}
        <tbody role="rowgroup">${state.logs.map((log) => rowHtml(log, vm)).join('')}</tbody>
      </table>
    </div>${more}`;
}

/**
 * The Activity section.
 * @param {{ now: Date|string, timeZone?: string, data: object,
 *   activity: { level: string, category: string, source: string, q: string, logs: Array<object>, count: number,
 *     status: 'loading'|'ready'|'error', error?: string, openId: string|null, auto: boolean, loadingMore?: boolean, copiedId?: string|null } }} vm
 */
export function activityHtml(vm) {
  const state = vm.activity;
  const count = state.status === 'ready' && state.count > 0 ? `${plural(state.count, 'line', 'lines')}, newest first` : '';
  return `<div class="adm-section">
    <div class="adm-toolbar adm-toolbar--logs">
      ${searchHtml({ name: 'logs', label: 'Search in messages', value: state.q })}
      <label class="adm-switch">
        <input type="checkbox" class="adm-switch-input" data-adm-auto data-focus-key="auto-refresh"${attr('checked', state.auto === true)}>
        <span class="adm-switch-track" aria-hidden="true"></span>
        <span class="adm-switch-label">Refresh every 30 seconds</span>
      </label>
    </div>
    <div class="adm-chip-groups" data-adm-region="logs-chips">${chipGroups(vm)}</div>
    <div data-adm-region="logs-results">
      <p class="adm-count" role="status">${esc(count)}</p>
      ${resultsHtml(vm)}
    </div>
    <section class="adm-card adm-housekeeping" aria-labelledby="adm-purge-title">
      <div class="adm-housekeeping-text">
        <h2 class="adm-card-title" id="adm-purge-title">Housekeeping</h2>
        <p class="adm-card-sub">Logs are deleted automatically after one year. You can delete everything older than ${PURGE_DAYS} days now.</p>
      </div>
      <button type="button" class="ui-btn ui-btn--danger" data-adm-action="purge-logs" data-focus-key="purge-logs">${icon('trash', 18)}<span>Delete logs older than ${PURGE_DAYS} days</span></button>
    </section>
  </div>`;
}
