// People: search, filter chips, a sortable table that reads as cards on a phone, and a detail row
// with the person's trips, their recent log lines and the role change.
import { attr, cls, esc } from '../views/shared/html.js';
import { icon } from '../views/shared/icons.js';
import { dateRange, displayName, formatDate, formatDateTime, num, plural, relativeTime } from './admin-format.js';
import { PEOPLE_SORTS, filterPeople, peopleChipFilter, peopleChips, sortRows, tripCountsByUser } from './admin-filters.js';
import { lastActiveByUser } from './admin-stats.js';
import { avatarHtml, chipsHtml, emptyHtml, homeHtml, levelPillHtml, noteHtml, searchHtml, statusPillHtml, tagHtml, td, theadHtml } from './admin-parts.js';

const MAX_DETAIL_TRIPS = 6;
const COLUMNS = Object.freeze([
  { key: 'name', label: 'Person', sortable: true },
  { key: 'home', label: 'Home', sortable: true },
  { key: 'trips', label: 'Trips', sortable: true, cls: 'adm-th--num' },
  { key: 'joined', label: 'Joined', sortable: true },
  { key: 'active', label: 'Last active', sortable: true },
  { label: 'Details', hidden: true },
]);

/**
 * What the role button of a person does, and whether it may. An admin can never remove their own
 * role while they are the last admin.
 * @param {object} person
 * @param {{ meId: string|null, adminCount: number }} ctx
 */
export function roleChange(person, { meId = null, adminCount = 0 } = {}) {
  const name = displayName(person);
  const self = Boolean(meId) && person.id === meId;
  if (person.role !== 'admin') {
    return {
      next: 'admin', label: 'Make admin', allowed: true, reason: '', danger: false,
      title: `Make ${name} an admin?`,
      body: `${name} will be able to see every person, every trip and the logs, change roles and delete trips.`,
      confirmLabel: 'Make admin',
    };
  }
  if (self && adminCount <= 1) {
    return {
      next: 'user', label: 'Remove admin role', allowed: false, danger: true,
      reason: 'You are the only admin. Make someone else an admin before you give up the role.',
      title: '', body: '', confirmLabel: '',
    };
  }
  return {
    next: 'user', label: 'Remove admin role', allowed: true, reason: '', danger: true,
    title: self ? 'Remove your own admin role?' : `Remove the admin role from ${name}?`,
    body: self
      ? 'You will lose this page at once and only another admin can give the role back.'
      : `${name} will no longer be able to open this page. Their trips and their account stay as they are.`,
    confirmLabel: 'Remove admin role',
  };
}

function detailHtml(person, vm, ctx) {
  const trips = vm.data.trips.filter((trip) => trip.user_id === person.id);
  const shown = trips.slice(0, MAX_DETAIL_TRIPS);
  const tripList = shown.length
    ? `<ul class="adm-mini-list">${shown.map((trip) => `<li class="adm-mini">
        <button type="button" class="adm-linkish" data-adm-goto="trips"${attr('data-adm-id', trip.id)}${attr('data-focus-key', `person-trip-${trip.id}`)}>${esc(trip.title?.trim() || 'Untitled trip')}</button>
        <span class="adm-mini-meta">${esc(dateRange(trip.start_date, trip.end_date))}</span>
        ${statusPillHtml(trip.status)}
      </li>`).join('')}</ul>${trips.length > shown.length ? `<p class="adm-quiet">And ${plural(trips.length - shown.length, 'more trip', 'more trips')}. Search Trips for this name to see them all.</p>` : ''}`
    : '<p class="adm-quiet">No trips yet.</p>';

  const detail = vm.people.detail?.id === person.id ? vm.people.detail : null;
  let logs;
  if (!detail || detail.status === 'loading') {
    logs = '<p class="adm-quiet" role="status">Loading recent activity</p>';
  } else if (detail.status === 'error') {
    logs = `<p class="adm-quiet" role="alert">Recent activity could not be loaded.</p><p><button type="button" class="ui-btn ui-btn--small" data-adm-action="person-logs"${attr('data-adm-id', person.id)} data-focus-key="person-logs-retry">Try again</button></p>`;
  } else if (!detail.logs.length) {
    logs = '<p class="adm-quiet">No log lines for this person.</p>';
  } else {
    logs = `<ul class="adm-mini-list">${detail.logs.map((log) => `<li class="adm-mini adm-mini--log">
        ${levelPillHtml(log.level)}
        <span class="adm-mini-text">${esc(log.message)}</span>
        <time class="adm-mini-meta"${attr('datetime', log.created_at)}>${esc(formatDateTime(log.created_at, vm.now, { timeZone: vm.timeZone }))}</time>
      </li>`).join('')}</ul>`;
  }

  const change = roleChange(person, ctx);
  const helpId = `adm-role-help-${person.id}`;
  const role = `<div class="adm-role">
      <p class="adm-role-now">${person.role === 'admin' ? 'This person is an admin.' : 'This person is not an admin.'}</p>
      <button type="button" class="${cls('ui-btn ui-btn--small', { 'ui-btn--danger': change.danger })}" data-adm-action="role"${attr('data-adm-id', person.id)}${attr('data-focus-key', `role-${person.id}`)}${attr('disabled', !change.allowed)}${attr('aria-describedby', change.reason ? helpId : null)}>${esc(change.label)}</button>
      ${change.reason ? `<p class="adm-role-help"${attr('id', helpId)}>${esc(change.reason)}</p>` : ''}
    </div>`;

  return `<tr class="adm-detail-row" role="row"><td role="cell" colspan="${COLUMNS.length}">
      <div class="adm-detail"${attr('id', `adm-person-${person.id}`)}>
        <div class="adm-detail-col"><h3 class="adm-sub-title">Trips</h3>${tripList}</div>
        <div class="adm-detail-col"><h3 class="adm-sub-title">Recent activity</h3>${logs}</div>
        <div class="adm-detail-col"><h3 class="adm-sub-title">Role</h3>${role}</div>
      </div>
    </td></tr>`;
}

function rowHtml(person, vm, ctx) {
  const name = displayName(person);
  const open = vm.people.openId === person.id;
  const count = ctx.tripCounts.get(person.id) ?? 0;
  const seen = ctx.lastActive.get(person.id) ?? null;
  const tags = [
    person.role === 'admin' ? tagHtml('Admin') : '',
    ctx.meId && person.id === ctx.meId ? tagHtml('You') : '',
    person.is_nomad ? tagHtml('Nomad') : '',
    person.onboarding_complete ? '' : tagHtml('Not onboarded'),
  ].join('');
  const who = `<div class="adm-who">
      ${avatarHtml(person)}
      <div class="adm-who-text"><span class="adm-who-name">${esc(name)}</span>${tags ? `<span class="adm-tags">${tags}</span>` : ''}</div>
    </div>`;
  const toggle = `<button type="button" class="adm-icon-btn adm-toggle" data-adm-action="toggle-person"${attr('data-adm-id', person.id)}${attr('data-focus-key', `person-${person.id}`)} aria-expanded="${open}"${attr('aria-controls', open ? `adm-person-${person.id}` : null)}${attr('aria-label', `${open ? 'Hide' : 'Show'} details for ${name}`)}>${icon('chevron-down', 20)}</button>`;
  return `<tr class="${cls('adm-row', { 'is-open': open })}" role="row"${attr('data-adm-row', person.id)}>
      ${td('', who, { cls: 'adm-td--main' })}
      ${td('Home', homeHtml(person))}
      ${td('Trips', `<span class="adm-numeral">${num(count)}</span>`, { cls: 'adm-td--num' })}
      ${td('Joined', `<span class="adm-mono">${esc(formatDate(person.created_at, { timeZone: vm.timeZone }))}</span>`)}
      ${td('Last active', seen ? `<span class="adm-mono">${esc(relativeTime(seen, vm.now, { timeZone: vm.timeZone }))}</span>` : '<span class="adm-quiet">Not known</span>')}
      ${td('', toggle, { cls: 'adm-td--end' })}
    </tr>${open ? detailHtml(person, vm, ctx) : ''}`;
}

/**
 * The People section.
 * @param {{ now: Date|string, timeZone?: string, meId?: string|null, data: object,
 *   people: { q: string, chip: string, sort: { key: string, dir: string }, openId: string|null, detail: object|null } }} vm
 */
export function peopleHtml(vm) {
  const { data } = vm;
  const state = vm.people;
  const ctx = {
    meId: vm.meId ?? null,
    adminCount: data.people.filter((person) => person.role === 'admin').length,
    tripCounts: tripCountsByUser(data.trips),
    lastActive: lastActiveByUser(data.people, data.facts),
  };
  const filtered = filterPeople(data.people, { q: state.q, ...peopleChipFilter(state.chip) });
  const rows = sortRows(filtered, state.sort, PEOPLE_SORTS, ctx);
  const filtering = Boolean(state.q.trim()) || state.chip !== 'all';
  const count = filtering ? `${num(rows.length)} of ${plural(data.people.length, 'person', 'people')}` : plural(data.people.length, 'person', 'people');
  let results;
  if (!data.people.length) {
    results = emptyHtml('Nobody has signed up yet', 'People appear here as soon as they sign in for the first time.');
  } else if (!rows.length) {
    results = emptyHtml('Nobody matches', 'No person fits this search and these filters.', { clear: true });
  } else {
    results = `<div class="adm-table-card">
        <table class="adm-table adm-table--people" role="table" aria-label="People">
          ${theadHtml('people', COLUMNS, state.sort)}
          <tbody role="rowgroup">${rows.map((person) => rowHtml(person, vm, ctx)).join('')}</tbody>
        </table>
      </div>`;
  }
  const cut = data.peopleTotal > data.people.length ? noteHtml(`Showing the newest ${num(data.people.length)} of ${num(data.peopleTotal)} people. Counts and searches cover these only.`) : '';
  return `<div class="adm-section">
    <div class="adm-toolbar">
      ${searchHtml({ name: 'people', label: 'Search people by name or home', value: state.q })}
      <div class="adm-toolbar-chips" data-adm-region="people-chips">${chipsHtml({ name: 'people', label: 'Filter people', active: state.chip, options: peopleChips(data.people) })}</div>
    </div>
    <div data-adm-region="people-results">
      <p class="adm-count" role="status">${esc(count)}</p>
      ${results}
      ${cut}
    </div>
  </div>`;
}
