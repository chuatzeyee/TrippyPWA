import { navigate } from '../router.js';
import { isAdmin, fetchAdminStats, fetchAllUsers, fetchAllTrips, updateUserRole, deleteUserTrip } from '../data/admin-repository.js';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function formatName(displayName) {
  if (!displayName || !displayName.trim()) return 'Anonymous';
  return displayName.trim().split(/\s+/).map(w =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(' ');
}

function isValidCountryCode(code) {
  return typeof code === 'string' && /^[a-z]{2}$/.test(code);
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const STATUS_BADGES = {
  planning: 'adm-badge--muted',
  generating: 'adm-badge--amber',
  generated: 'adm-badge--teal',
  active: 'adm-badge--sage',
  completed: 'adm-badge--sage',
  failed: 'adm-badge--error',
};

const STAT_ICONS = {
  users: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  trips: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
  generated: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  admin: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
};

function buildStatCards(stats) {
  return `
    <div class="adm-stats">
      <div class="adm-stat-card">
        <div class="adm-stat-icon adm-stat-icon--terracotta">${STAT_ICONS.users}</div>
        <div class="adm-stat-body">
          <span class="adm-stat-value">${stats.totalUsers}</span>
          <span class="adm-stat-label">Users</span>
        </div>
        <span class="adm-stat-sub">+${stats.recentUsers} this month &middot; +${stats.weeklyUsers} this week</span>
      </div>
      <div class="adm-stat-card">
        <div class="adm-stat-icon adm-stat-icon--teal">${STAT_ICONS.trips}</div>
        <div class="adm-stat-body">
          <span class="adm-stat-value">${stats.totalTrips}</span>
          <span class="adm-stat-label">Trips</span>
        </div>
        <span class="adm-stat-sub">+${stats.recentTrips} this month &middot; +${stats.weeklyTrips} this week</span>
      </div>
      <div class="adm-stat-card">
        <div class="adm-stat-icon adm-stat-icon--sage">${STAT_ICONS.generated}</div>
        <div class="adm-stat-body">
          <span class="adm-stat-value">${stats.generatedTrips}</span>
          <span class="adm-stat-label">Generated</span>
        </div>
        <span class="adm-stat-sub">${stats.activeTrips} active &middot; ${stats.generatingTrips} in progress</span>
      </div>
      <div class="adm-stat-card">
        <div class="adm-stat-icon adm-stat-icon--amber">${STAT_ICONS.admin}</div>
        <div class="adm-stat-body">
          <span class="adm-stat-value">${stats.totalAdmins}</span>
          <span class="adm-stat-label">Admins</span>
        </div>
        <span class="adm-stat-sub">${stats.failedTrips} failed &middot; ${stats.planningTrips} planning</span>
      </div>
    </div>`;
}

function buildUserRow(u, tripCount) {
  const name = formatName(u.display_name);
  const initials = name === 'Anonymous' ? '?' : name.split(' ').map(w => w[0]).join('').slice(0, 2);
  const locationParts = [];
  if (isValidCountryCode(u.home_flag)) locationParts.push(`<img src="https://flagcdn.com/w40/${u.home_flag}.png" width="18" height="13" alt="" class="adm-flag">`);
  if (u.home_city) locationParts.push(esc(u.home_city));
  if (u.home_country && u.home_country !== u.home_city) locationParts.push(esc(u.home_country));
  const location = locationParts.length ? locationParts.join(' ') : '<span class="adm-muted">Not set</span>';
  const isNomad = u.is_nomad ? '<span class="adm-badge adm-badge--plum" title="Digital Nomad">Nomad</span>' : '';
  const onboarded = u.onboarding_complete ? '' : '<span class="adm-badge adm-badge--amber" title="Has not completed onboarding">Pending</span>';

  return `
    <tr data-user-id="${u.id}">
      <td>
        <div class="adm-user-cell">
          ${u.avatar_url && isValidUrl(u.avatar_url)
            ? `<img src="${esc(u.avatar_url)}" class="adm-avatar" alt="" loading="lazy">`
            : `<div class="adm-avatar adm-avatar--initials">${esc(initials)}</div>`}
          <div class="adm-user-info">
            <span class="adm-user-name">${esc(name)}</span>
            <span class="adm-user-meta">${relativeTime(u.updated_at || u.created_at)}</span>
          </div>
        </div>
      </td>
      <td>${location}</td>
      <td>
        <div class="adm-badge-group">
          <span class="adm-badge ${u.role === 'admin' ? 'adm-badge--terracotta' : 'adm-badge--muted'}">${u.role}</span>
          ${isNomad}${onboarded}
        </div>
      </td>
      <td class="adm-center">${tripCount}</td>
      <td class="adm-mono">${formatDate(u.created_at)}</td>
      <td>
        <select class="adm-role-select" data-user-id="${u.id}" data-current="${u.role}">
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td>
    </tr>`;
}

function buildTripRow(t, owner) {
  const days = t.itinerary_days?.length || 0;
  const dateRange = t.start_date
    ? `${formatDate(t.start_date)}${t.end_date ? ' → ' + formatDate(t.end_date) : ''}`
    : '-';
  const budget = t.budget_daily
    ? `${t.budget_currency || '$'}${t.budget_daily}/day`
    : '-';
  const ownerName = formatName(owner?.display_name);

  return `
    <tr>
      <td>
        <div class="adm-trip-cell">
          <span class="adm-trip-emoji">${esc(t.emoji || '✈️')}</span>
          <div class="adm-trip-info">
            <span class="adm-trip-title">${esc(t.title || 'Untitled Trip')}</span>
            <span class="adm-trip-meta">${days} day${days !== 1 ? 's' : ''} &middot; ${esc(budget)} &middot; ${t.travelers || 1} traveler${(t.travelers || 1) !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </td>
      <td>
        <div class="adm-user-cell adm-user-cell--compact">
          ${owner?.avatar_url && isValidUrl(owner.avatar_url) ? `<img src="${esc(owner.avatar_url)}" class="adm-avatar adm-avatar--sm" alt="" loading="lazy">` : ''}
          <span>${esc(ownerName)}</span>
        </div>
      </td>
      <td><span class="adm-badge ${STATUS_BADGES[t.status] || 'adm-badge--muted'}">${t.status || 'unknown'}</span></td>
      <td class="adm-mono adm-nowrap">${dateRange}</td>
      <td class="adm-mono">${formatDate(t.created_at)}</td>
      <td>
        <div class="adm-actions">
          <button class="adm-btn adm-btn--ghost adm-view-trip" data-trip-id="${t.id}" title="View trip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="adm-btn adm-btn--danger adm-delete-trip" data-trip-id="${t.id}" title="Delete trip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
}

function sortData(data, key, dir) {
  return [...data].sort((a, b) => {
    let va = a[key], vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

export async function renderAdminDashboard() {
  const app = document.getElementById('app');

  if (!await isAdmin()) {
    app.innerHTML = `
      <div class="container adm-denied">
        <div class="adm-denied-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        </div>
        <h1 class="text-h1">Access Denied</h1>
        <p class="text-body" style="color:var(--ink-secondary);margin-top:var(--sp-2)">You do not have admin privileges.</p>
        <button class="btn btn--primary btn--pill" style="margin-top:var(--sp-6)" data-nav="home">Back to Dashboard</button>
      </div>`;
    app.querySelector('[data-nav="home"]')?.addEventListener('click', () => navigate('/'));
    return;
  }

  app.innerHTML = `
    <div class="container adm">
      <div class="adm-loading">
        <div class="adm-spinner"></div>
        <span>Loading admin portal&hellip;</span>
      </div>
    </div>`;

  const [stats, usersResult, tripsResult] = await Promise.all([
    fetchAdminStats(),
    fetchAllUsers(),
    fetchAllTrips(),
  ]);

  const users = usersResult.data;
  const trips = tripsResult.data;
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const tripCountByUser = {};
  for (const t of trips) {
    tripCountByUser[t.user_id] = (tripCountByUser[t.user_id] || 0) + 1;
  }

  let activeTab = 'users';
  let userSearch = '';
  let tripSearch = '';
  let tripStatusFilter = 'all';
  let userSort = { key: 'created_at', dir: 'desc' };
  let tripSort = { key: 'created_at', dir: 'desc' };

  function getFilteredUsers() {
    let filtered = users;
    if (userSearch) {
      const q = userSearch.toLowerCase();
      filtered = filtered.filter(u =>
        (u.display_name || '').toLowerCase().includes(q) ||
        (u.home_city || '').toLowerCase().includes(q) ||
        (u.home_country || '').toLowerCase().includes(q) ||
        u.role.includes(q)
      );
    }
    return sortData(filtered, userSort.key, userSort.dir);
  }

  function getFilteredTrips() {
    let filtered = trips;
    if (tripStatusFilter !== 'all') {
      filtered = filtered.filter(t => t.status === tripStatusFilter);
    }
    if (tripSearch) {
      const q = tripSearch.toLowerCase();
      filtered = filtered.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (userMap[t.user_id]?.display_name || '').toLowerCase().includes(q)
      );
    }
    return sortData(filtered, tripSort.key, tripSort.dir);
  }

  function sortIcon(currentKey, columnKey, dir) {
    if (currentKey !== columnKey) return '<span class="adm-sort-icon">↕</span>';
    return `<span class="adm-sort-icon adm-sort-icon--active">${dir === 'asc' ? '↑' : '↓'}</span>`;
  }

  function renderUsersPanel() {
    const filtered = getFilteredUsers();
    return `
      <div class="adm-toolbar">
        <div class="adm-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="adm-search-input" placeholder="Search users by name, city, country…" value="${esc(userSearch)}" data-search="users">
        </div>
        <span class="adm-result-count">${filtered.length} of ${users.length} users</span>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr>
              <th class="adm-sortable" data-sort-table="users" data-sort-key="display_name">User ${sortIcon(userSort.key, 'display_name', userSort.dir)}</th>
              <th>Location</th>
              <th class="adm-sortable" data-sort-table="users" data-sort-key="role">Role ${sortIcon(userSort.key, 'role', userSort.dir)}</th>
              <th class="adm-center">Trips</th>
              <th class="adm-sortable" data-sort-table="users" data-sort-key="created_at">Joined ${sortIcon(userSort.key, 'created_at', userSort.dir)}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length
              ? filtered.map(u => buildUserRow(u, tripCountByUser[u.id] || 0)).join('')
              : '<tr><td colspan="6" class="adm-empty">No users match your search</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  function renderTripsPanel() {
    const filtered = getFilteredTrips();
    const statuses = [...new Set(trips.map(t => t.status))].sort();
    return `
      <div class="adm-toolbar">
        <div class="adm-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="adm-search-input" placeholder="Search trips by title or owner…" value="${esc(tripSearch)}" data-search="trips">
        </div>
        <div class="adm-filter-group">
          <select class="adm-filter-select" data-filter="trip-status">
            <option value="all" ${tripStatusFilter === 'all' ? 'selected' : ''}>All Status</option>
            ${statuses.map(s => `<option value="${s}" ${tripStatusFilter === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <span class="adm-result-count">${filtered.length} of ${trips.length} trips</span>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr>
              <th class="adm-sortable" data-sort-table="trips" data-sort-key="title">Trip ${sortIcon(tripSort.key, 'title', tripSort.dir)}</th>
              <th>Owner</th>
              <th class="adm-sortable" data-sort-table="trips" data-sort-key="status">Status ${sortIcon(tripSort.key, 'status', tripSort.dir)}</th>
              <th class="adm-sortable" data-sort-table="trips" data-sort-key="start_date">Dates ${sortIcon(tripSort.key, 'start_date', tripSort.dir)}</th>
              <th class="adm-sortable" data-sort-table="trips" data-sort-key="created_at">Created ${sortIcon(tripSort.key, 'created_at', tripSort.dir)}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length
              ? filtered.map(t => buildTripRow(t, userMap[t.user_id])).join('')
              : '<tr><td colspan="6" class="adm-empty">No trips match your search</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  function render() {
    app.innerHTML = `
      <div class="container adm">
        <div class="adm-header">
          <button class="adm-btn adm-btn--ghost adm-back" data-nav="home">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <div class="adm-header-text">
            <h1 class="adm-title">Admin Portal</h1>
            <span class="adm-subtitle">Manage users, trips, and platform activity</span>
          </div>
          <button class="adm-btn adm-btn--outline adm-refresh" title="Refresh data">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
        </div>

        ${buildStatCards(stats)}

        <div class="adm-tabs">
          <button class="adm-tab ${activeTab === 'users' ? 'adm-tab--active' : ''}" data-tab="users">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/></svg>
            Users <span class="adm-tab-count">${users.length}</span>
          </button>
          <button class="adm-tab ${activeTab === 'trips' ? 'adm-tab--active' : ''}" data-tab="trips">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg>
            Trips <span class="adm-tab-count">${trips.length}</span>
          </button>
        </div>

        <div class="adm-panel" id="adm-panel-users" ${activeTab !== 'users' ? 'style="display:none"' : ''}>
          ${renderUsersPanel()}
        </div>

        <div class="adm-panel" id="adm-panel-trips" ${activeTab !== 'trips' ? 'style="display:none"' : ''}>
          ${renderTripsPanel()}
        </div>
      </div>`;
    bindEvents();
  }

  function reRenderPanel() {
    const usersPanel = document.getElementById('adm-panel-users');
    const tripsPanel = document.getElementById('adm-panel-trips');
    if (usersPanel) usersPanel.innerHTML = renderUsersPanel();
    if (tripsPanel) tripsPanel.innerHTML = renderTripsPanel();
    bindPanelEvents();
  }

  function bindPanelEvents() {
    const container = app.querySelector('.adm');
    if (!container) return;

    container.querySelectorAll('.adm-search-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const table = e.target.dataset.search;
        const cursorPos = e.target.selectionStart;
        if (table === 'users') userSearch = e.target.value;
        if (table === 'trips') tripSearch = e.target.value;
        reRenderPanel();
        const newInput = container.querySelector(`[data-search="${table}"]`);
        if (newInput) { newInput.focus(); newInput.setSelectionRange(cursorPos, cursorPos); }
      });
    });

    const statusFilter = container.querySelector('[data-filter="trip-status"]');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        tripStatusFilter = e.target.value;
        reRenderPanel();
      });
    }
  }

  function bindEvents() {
    const container = app.querySelector('.adm');
    if (!container) return;

    bindPanelEvents();

    container.addEventListener('click', (e) => {
      const navBtn = e.target.closest('[data-nav="home"]');
      if (navBtn) { e.preventDefault(); navigate('/'); return; }

      const tab = e.target.closest('.adm-tab');
      if (tab) {
        activeTab = tab.dataset.tab;
        container.querySelectorAll('.adm-tab').forEach(t => t.classList.remove('adm-tab--active'));
        tab.classList.add('adm-tab--active');
        container.querySelectorAll('.adm-panel').forEach(p => p.style.display = 'none');
        const panel = document.getElementById(`adm-panel-${activeTab}`);
        if (panel) panel.style.display = '';
        return;
      }

      const sortHeader = e.target.closest('.adm-sortable');
      if (sortHeader) {
        const table = sortHeader.dataset.sortTable;
        const key = sortHeader.dataset.sortKey;
        const sortState = table === 'users' ? userSort : tripSort;
        if (sortState.key === key) {
          sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
        } else {
          sortState.key = key;
          sortState.dir = 'asc';
        }
        reRenderPanel();
        return;
      }

      const refreshBtn = e.target.closest('.adm-refresh');
      if (refreshBtn) {
        e.preventDefault();
        renderAdminDashboard();
        return;
      }

      const viewBtn = e.target.closest('.adm-view-trip');
      if (viewBtn) { e.preventDefault(); navigate(`/trip/${viewBtn.dataset.tripId}`); return; }

      const deleteBtn = e.target.closest('.adm-delete-trip');
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('Delete this trip? This cannot be undone.')) return;
        deleteBtn.disabled = true;
        deleteUserTrip(deleteBtn.dataset.tripId).then(({ error }) => {
          if (error) { alert(`Failed: ${error}`); deleteBtn.disabled = false; return; }
          deleteBtn.closest('tr')?.remove();
        });
      }
    });

    container.addEventListener('change', (e) => {
      const select = e.target.closest('.adm-role-select');
      if (!select) return;
      const userId = select.dataset.userId;
      const newRole = select.value;
      const prev = select.dataset.current;
      if (newRole === prev) return;

      if (!confirm(`Change this user's role to "${newRole}"?`)) {
        select.value = prev;
        return;
      }

      updateUserRole(userId, newRole).then(({ error }) => {
        if (error) {
          alert(`Failed: ${error}`);
          select.value = prev;
          return;
        }
        select.dataset.current = newRole;
        const badge = select.closest('tr')?.querySelector('.adm-badge');
        if (badge) {
          badge.textContent = newRole;
          badge.className = `adm-badge ${newRole === 'admin' ? 'adm-badge--terracotta' : 'adm-badge--muted'}`;
        }
      });
    });
  }

  render();
}
