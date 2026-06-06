import { fetchLogs, fetchLogStats, deleteOldLogs } from '../data/admin-repository.js';
import { showToast } from '../components/toast.js';

let logs = [];
let logCount = 0;
let logOffset = 0;
let logLevel = 'all';
let logCategory = 'all';
let logSource = 'all';
let autoRefreshId = null;
let expandedLogId = null;
let logEventsController = null;

const LEVEL_BADGES = {
  error: 'adm-badge--error',
  warn: 'adm-badge--amber',
  info: 'adm-badge--teal',
};

const CATEGORY_BADGES = {
  auth: 'adm-badge--terracotta',
  generation: 'adm-badge--teal',
  data: 'adm-badge--sage',
  share: 'adm-badge--plum',
  profile: 'adm-badge--amber',
  edge: 'adm-badge--muted',
  system: 'adm-badge--muted',
};

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  });
}

export async function loadLogStats() {
  return fetchLogStats();
}

export async function loadLogs(reset = false) {
  if (reset) { logOffset = 0; logs = []; }
  const { data, count } = await fetchLogs({
    level: logLevel, category: logCategory, source: logSource,
    limit: 100, offset: logOffset,
  });
  if (reset) { logs = data; } else { logs = [...logs, ...data]; }
  logCount = count;
}

export function renderLogsPanel() {
  return `
    <div class="adm-log-toolbar">
      <div class="adm-log-filters">
        <select class="adm-log-select" id="log-level-filter">
          <option value="all"${logLevel === 'all' ? ' selected' : ''}>All Levels</option>
          <option value="error"${logLevel === 'error' ? ' selected' : ''}>Errors</option>
          <option value="warn"${logLevel === 'warn' ? ' selected' : ''}>Warnings</option>
          <option value="info"${logLevel === 'info' ? ' selected' : ''}>Info</option>
        </select>
        <select class="adm-log-select" id="log-category-filter">
          <option value="all"${logCategory === 'all' ? ' selected' : ''}>All Categories</option>
          <option value="auth"${logCategory === 'auth' ? ' selected' : ''}>Auth</option>
          <option value="generation"${logCategory === 'generation' ? ' selected' : ''}>Generation</option>
          <option value="data"${logCategory === 'data' ? ' selected' : ''}>Data</option>
          <option value="share"${logCategory === 'share' ? ' selected' : ''}>Share</option>
          <option value="profile"${logCategory === 'profile' ? ' selected' : ''}>Profile</option>
          <option value="edge"${logCategory === 'edge' ? ' selected' : ''}>Edge</option>
          <option value="system"${logCategory === 'system' ? ' selected' : ''}>System</option>
        </select>
        <select class="adm-log-select" id="log-source-filter">
          <option value="all"${logSource === 'all' ? ' selected' : ''}>All Sources</option>
          <option value="client"${logSource === 'client' ? ' selected' : ''}>Client</option>
          <option value="edge"${logSource === 'edge' ? ' selected' : ''}>Edge</option>
        </select>
      </div>
      <div class="adm-log-actions">
        <label class="adm-log-auto-refresh">
          <input type="checkbox" id="log-auto-refresh" ${autoRefreshId ? 'checked' : ''}>
          <span>Auto-refresh</span>
        </label>
        <button class="btn btn--ghost btn--sm" id="log-refresh-btn">Refresh</button>
        <button class="btn btn--ghost btn--sm adm-log-purge" id="log-purge-btn">Purge 90d+</button>
      </div>
    </div>
    <div class="adm-log-count">${logCount} log${logCount !== 1 ? 's' : ''}</div>
    <div class="adm-table-wrap">
      <table class="adm-table adm-log-table">
        <thead>
          <tr>
            <th style="width:70px">Level</th>
            <th style="width:120px">Time</th>
            <th style="width:90px">Category</th>
            <th style="width:110px">User</th>
            <th style="width:120px">Destination</th>
            <th style="width:60px">Model</th>
            <th>Message</th>
            <th style="width:40px"></th>
          </tr>
        </thead>
        <tbody>
          ${logs.length === 0 ? '<tr><td colspan="8" class="adm-empty">No logs found</td></tr>' : logs.map(renderLogRow).join('')}
        </tbody>
      </table>
    </div>
    ${logs.length < logCount ? `<button class="btn btn--ghost btn--sm adm-log-load-more" id="log-load-more">Load more (${logCount - logs.length} remaining)</button>` : ''}
  `;
}

function renderLogRow(log) {
  const isExpanded = expandedLogId === log.id;
  const levelClass = LEVEL_BADGES[log.level] || 'adm-badge--muted';
  const catClass = CATEGORY_BADGES[log.category] || 'adm-badge--muted';
  const rowClass = log.level === 'error' ? 'adm-log-row--error' : log.level === 'warn' ? 'adm-log-row--warn' : '';

  const meta = log.metadata || {};
  const provider = meta.provider || '';
  const userName = log.profiles?.display_name?.trim();
  const tripTitle = log.trips?.title?.trim();

  let detail = '';
  if (isExpanded) {
    const metaStr = JSON.stringify(meta, null, 2);
    const stack = meta.stack || '';
    detail = `
      <tr class="adm-log-detail-row">
        <td colspan="8">
          <div class="adm-log-detail">
            ${log.user_id ? `<div class="adm-log-detail-field"><strong>User ID:</strong> ${esc(log.user_id)}</div>` : ''}
            ${log.trip_id ? `<div class="adm-log-detail-field"><strong>Trip ID:</strong> ${esc(log.trip_id)}</div>` : ''}
            ${provider ? `<div class="adm-log-detail-field"><strong>Model:</strong> ${esc(provider)}</div>` : ''}
            ${log.user_agent ? `<div class="adm-log-detail-field"><strong>User Agent:</strong> ${esc(log.user_agent)}</div>` : ''}
            <div class="adm-log-detail-field"><strong>Full timestamp:</strong> ${new Date(log.created_at).toLocaleString()}</div>
            ${stack ? `<div class="adm-log-detail-field"><strong>Stack Trace:</strong><pre class="adm-log-detail-json">${esc(stack)}</pre></div>` : ''}
            <div class="adm-log-detail-field"><strong>Metadata:</strong><pre class="adm-log-detail-json">${esc(metaStr)}</pre></div>
          </div>
        </td>
      </tr>`;
  }

  const providerBadge = provider
    ? `<span class="adm-badge ${provider === 'Mistral' ? 'adm-badge--plum' : 'adm-badge--amber'}">${esc(provider)}</span>`
    : '<span class="adm-log-no-model">-</span>';

  return `
    <tr class="${rowClass}" data-log-id="${log.id}">
      <td><span class="adm-badge ${levelClass}">${log.level}</span></td>
      <td class="adm-log-time" title="${new Date(log.created_at).toLocaleString()}">
        <span class="adm-log-time-abs">${formatTime(log.created_at)}</span>
        <span class="adm-log-time-rel">${relativeTime(log.created_at)}</span>
      </td>
      <td><span class="adm-badge ${catClass}">${log.category}</span></td>
      <td class="adm-log-user" title="${esc(userName || (log.user_id ? log.user_id : ''))}">${userName ? esc(userName) : '<span class="adm-log-no-model">-</span>'}</td>
      <td class="adm-log-dest" title="${esc(tripTitle || '')}">${tripTitle ? esc(tripTitle) : '<span class="adm-log-no-model">-</span>'}</td>
      <td>${providerBadge}</td>
      <td class="adm-log-message" title="${esc(log.message)}">${esc(log.message)}</td>
      <td><button class="adm-log-expand-btn" data-log-id="${log.id}">${isExpanded ? '&#9650;' : '&#9660;'}</button></td>
    </tr>${detail}`;
}

export function bindLogEvents(panel, refreshCallback) {
  if (logEventsController) logEventsController.abort();
  logEventsController = new AbortController();
  const sig = { signal: logEventsController.signal };

  panel.querySelector('#log-level-filter')?.addEventListener('change', async (e) => {
    logLevel = e.target.value;
    await loadLogs(true);
    refreshCallback();
  }, sig);

  panel.querySelector('#log-category-filter')?.addEventListener('change', async (e) => {
    logCategory = e.target.value;
    await loadLogs(true);
    refreshCallback();
  }, sig);

  panel.querySelector('#log-source-filter')?.addEventListener('change', async (e) => {
    logSource = e.target.value;
    await loadLogs(true);
    refreshCallback();
  }, sig);

  panel.querySelector('#log-refresh-btn')?.addEventListener('click', async () => {
    await loadLogs(true);
    refreshCallback();
  }, sig);

  panel.querySelector('#log-purge-btn')?.addEventListener('click', async () => {
    if (!confirm('Delete all logs older than 90 days?')) return;
    const { error } = await deleteOldLogs(90);
    if (error) { showToast('Failed to purge logs', 'error'); return; }
    showToast('Old logs purged', 'success');
    await loadLogs(true);
    refreshCallback();
  }, sig);

  panel.querySelector('#log-auto-refresh')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      autoRefreshId = setInterval(async () => {
        await loadLogs(true);
        refreshCallback();
      }, 30000);
    } else {
      clearInterval(autoRefreshId);
      autoRefreshId = null;
    }
  }, sig);

  panel.querySelector('#log-load-more')?.addEventListener('click', async () => {
    logOffset += 100;
    await loadLogs(false);
    refreshCallback();
  }, sig);

  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('.adm-log-expand-btn');
    if (!btn) return;
    const id = btn.dataset.logId;
    expandedLogId = expandedLogId === id ? null : id;
    refreshCallback();
  }, sig);
}

export function stopAutoRefresh() {
  if (autoRefreshId) {
    clearInterval(autoRefreshId);
    autoRefreshId = null;
  }
}
