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

const STATUS_BADGES = {
  planning: 'adm-badge--muted',
  generating: 'adm-badge--amber',
  generated: 'adm-badge--teal',
  active: 'adm-badge--sage',
  completed: 'adm-badge--sage',
  failed: 'adm-badge--error',
};

export async function renderAdminDashboard() {
  const app = document.getElementById('app');

  if (!await isAdmin()) {
    app.innerHTML = `
      <div class="container adm-denied">
        <h1 class="text-h1">Access Denied</h1>
        <p class="text-body" style="color:var(--ink-secondary)">You do not have admin privileges.</p>
        <button class="btn btn--primary btn--pill" style="margin-top:var(--sp-6)" data-nav="home">Back to Dashboard</button>
      </div>`;
    app.querySelector('[data-nav="home"]')?.addEventListener('click', () => navigate('/'));
    return;
  }

  app.innerHTML = '<div class="container adm"><div class="adm-loading">Loading admin panel...</div></div>';

  const [stats, usersResult, tripsResult] = await Promise.all([
    fetchAdminStats(),
    fetchAllUsers(),
    fetchAllTrips(),
  ]);

  const users = usersResult.data;
  const trips = tripsResult.data;
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  app.innerHTML = `
    <div class="container adm">
      <div class="adm-header">
        <button class="btn btn--ghost adm-back" data-nav="home">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          Back
        </button>
        <h1 class="text-h1">Admin Portal</h1>
      </div>

      <div class="adm-stats">
        <div class="adm-stat-card">
          <span class="adm-stat-value">${stats.totalUsers}</span>
          <span class="adm-stat-label">Total Users</span>
          <span class="adm-stat-sub">+${stats.recentUsers} last 30d</span>
        </div>
        <div class="adm-stat-card">
          <span class="adm-stat-value">${stats.totalTrips}</span>
          <span class="adm-stat-label">Total Trips</span>
          <span class="adm-stat-sub">+${stats.recentTrips} last 30d</span>
        </div>
        <div class="adm-stat-card">
          <span class="adm-stat-value">${stats.generatedTrips}</span>
          <span class="adm-stat-label">Generated</span>
          <span class="adm-stat-sub">${stats.activeTrips} active</span>
        </div>
        <div class="adm-stat-card">
          <span class="adm-stat-value">${stats.totalAdmins}</span>
          <span class="adm-stat-label">Admins</span>
          <span class="adm-stat-sub">${stats.failedTrips} failed trips</span>
        </div>
      </div>

      <div class="adm-tabs">
        <button class="adm-tab adm-tab--active" data-tab="users">Users (${users.length})</button>
        <button class="adm-tab" data-tab="trips">Trips (${trips.length})</button>
      </div>

      <div class="adm-panel" id="adm-panel-users">
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Location</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr data-user-id="${u.id}">
                  <td class="adm-user-cell">
                    ${u.avatar_url ? `<img src="${esc(u.avatar_url)}" class="adm-avatar" alt="">` : '<div class="adm-avatar adm-avatar--placeholder"></div>'}
                    <span>${esc(u.display_name) || 'Anonymous'}</span>
                  </td>
                  <td>${u.home_flag ? `<img src="https://flagcdn.com/w40/${esc(u.home_flag)}.png" width="20" height="15" alt="" style="vertical-align:middle;margin-right:4px">` : ''}${esc(u.home_city || '-')}</td>
                  <td><span class="adm-badge ${u.role === 'admin' ? 'adm-badge--terracotta' : 'adm-badge--muted'}">${u.role}</span></td>
                  <td class="adm-mono">${formatDate(u.created_at)}</td>
                  <td>
                    <select class="adm-role-select" data-user-id="${u.id}" data-current="${u.role}">
                      <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                      <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="adm-panel adm-panel--hidden" id="adm-panel-trips">
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th>Trip</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${trips.map(t => {
                const owner = userMap[t.user_id];
                return `
                <tr>
                  <td>${esc(t.emoji)} ${esc(t.title)}</td>
                  <td class="adm-user-cell">
                    ${owner?.avatar_url ? `<img src="${esc(owner.avatar_url)}" class="adm-avatar adm-avatar--sm" alt="">` : ''}
                    <span>${esc(owner?.display_name || 'Unknown')}</span>
                  </td>
                  <td><span class="adm-badge ${STATUS_BADGES[t.status] || ''}">${t.status}</span></td>
                  <td class="adm-mono">${t.start_date ? formatDate(t.start_date) : '-'}</td>
                  <td class="adm-mono">${t.itinerary_days?.length || 0}</td>
                  <td class="adm-mono">${formatDate(t.created_at)}</td>
                  <td>
                    <button class="btn btn--ghost btn--sm adm-view-trip" data-trip-id="${t.id}">View</button>
                    <button class="btn btn--ghost btn--sm adm-delete-trip" data-trip-id="${t.id}" style="color:var(--error)">Delete</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  const container = app.querySelector('.adm');
  container.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-nav="home"]');
    if (navBtn) { e.preventDefault(); navigate('/'); return; }

    const tab = e.target.closest('.adm-tab');
    if (tab) {
      container.querySelectorAll('.adm-tab').forEach(t => t.classList.remove('adm-tab--active'));
      tab.classList.add('adm-tab--active');
      const target = tab.dataset.tab;
      container.querySelectorAll('.adm-panel').forEach(p => p.classList.add('adm-panel--hidden'));
      document.getElementById(`adm-panel-${target}`)?.classList.remove('adm-panel--hidden');
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
