// Trips: search, status chips with counts, a sortable table that reads as cards on a phone, and the
// three things an admin does to a trip: open it, plan it again, delete it.
import { attr, cls, esc } from '../views/shared/html.js';
import { icon } from '../views/shared/icons.js';
import { dateRange, dayCount, displayName, formatDate, num, plural } from './admin-format.js';
import { TRIP_SORTS, filterTrips, sortRows, statusLabel, tripStatusChips } from './admin-filters.js';
import { avatarHtml, chipsHtml, emptyHtml, noteHtml, searchHtml, statusPillHtml, td, theadHtml } from './admin-parts.js';

const COLUMNS = Object.freeze([
  { key: 'title', label: 'Trip', sortable: true },
  { key: 'owner', label: 'Owner', sortable: true },
  { key: 'dates', label: 'Dates', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'created', label: 'Created', sortable: true },
  { label: 'Actions', hidden: true },
]);

export const tripTitle = (trip) => (typeof trip?.title === 'string' && trip.title.trim()) || 'Untitled trip';

/**
 * What planning a trip again asks first. A failed plan is retried without a question (there is
 * nothing to lose); any other plan is replaced, so the dialog names the trip and its owner.
 */
export function retryPrompt(trip, owner) {
  if (trip.status === 'failed') return null;
  const who = owner ? displayName(owner) : 'its owner';
  return {
    title: `Plan ${tripTitle(trip)} again?`,
    body: `The plan ${who} has now is replaced by a new one. Edits made to it are lost.`,
    confirmLabel: 'Plan again',
    danger: true,
  };
}

/** The delete dialog: it names the trip and the owner. */
export function deletePrompt(trip, owner) {
  const who = owner ? displayName(owner) : 'its owner';
  return {
    title: `Delete ${tripTitle(trip)}?`,
    body: `This deletes the trip of ${who} for good, with its plan, its photos and its share links.\nThis cannot be undone.`,
    confirmLabel: 'Delete trip',
    danger: true,
  };
}

function rowHtml(trip, vm, peopleById) {
  const title = tripTitle(trip);
  const owner = peopleById.get(trip.user_id) ?? null;
  const days = dayCount(trip);
  const busy = vm.busyTrips?.has(trip.id) === true;
  const main = `<div class="adm-trip">
      <span class="adm-trip-title">${esc(title)}</span>
      <span class="adm-trip-meta">${days ? esc(plural(days, 'day', 'days')) : 'No days yet'}</span>
    </div>`;
  const who = owner
    ? `<button type="button" class="adm-owner" data-adm-goto="people"${attr('data-adm-id', owner.id)}${attr('data-focus-key', `owner-${trip.id}`)}${attr('aria-label', `Show ${displayName(owner)} in People`)}>${avatarHtml(owner, { small: true })}<span>${esc(displayName(owner))}</span></button>`
    : '<span class="adm-quiet">Not in the list</span>';
  const retry = trip.status === 'generating' ? '<span class="adm-icon-gap" aria-hidden="true"></span>' : `<button type="button" class="adm-icon-btn" data-adm-action="retry-trip"${attr('data-adm-id', trip.id)}${attr('data-focus-key', `retry-${trip.id}`)}${attr('disabled', busy)}${attr('aria-label', `${trip.status === 'failed' ? 'Try planning' : 'Plan'} ${title} again`)}${attr('title', trip.status === 'failed' ? 'Try again' : 'Plan again')}>${icon('refresh', 20)}</button>`;
  const actions = `<div class="adm-actions">
      <a class="ui-btn ui-btn--small" href="#/trip/${encodeURIComponent(trip.id)}"${attr('data-focus-key', `open-${trip.id}`)}${attr('aria-label', `Open ${title}`)}>Open</a>
      ${retry}
      <button type="button" class="adm-icon-btn adm-icon-btn--danger" data-adm-action="delete-trip"${attr('data-adm-id', trip.id)}${attr('data-focus-key', `delete-${trip.id}`)}${attr('disabled', busy)}${attr('aria-label', `Delete ${title}`)} title="Delete">${icon('trash', 20)}</button>
    </div>`;
  return `<tr class="${cls('adm-row', { 'is-marked': vm.trips.focusId === trip.id })}" role="row"${attr('data-adm-row', trip.id)}>
      ${td('', main, { cls: 'adm-td--main' })}
      ${td('Owner', who)}
      ${td('Dates', `<span class="adm-mono">${esc(dateRange(trip.start_date, trip.end_date))}</span>`)}
      ${td('Status', statusPillHtml(trip.status))}
      ${td('Created', `<span class="adm-mono">${esc(formatDate(trip.created_at, { timeZone: vm.timeZone }))}</span>`)}
      ${td('', actions, { cls: 'adm-td--end' })}
    </tr>`;
}

/**
 * The Trips section.
 * @param {{ timeZone?: string, data: object, busyTrips?: Set<string>,
 *   trips: { q: string, status: string, sort: { key: string, dir: string }, focusId: string|null } }} vm
 */
export function tripsHtml(vm) {
  const { data } = vm;
  const state = vm.trips;
  const peopleById = new Map(data.people.map((person) => [person.id, person]));
  const chips = tripStatusChips(data.trips);
  const status = chips.some((chip) => chip.key === state.status) ? state.status : 'all';
  const filtered = filterTrips(data.trips, { q: state.q, status: status === 'unknown' ? 'all' : status }, peopleById)
    .filter((trip) => status !== 'unknown' || statusLabel(trip.status) === 'Unknown');
  const rows = sortRows(filtered, state.sort, TRIP_SORTS, { peopleById });
  const filtering = Boolean(state.q.trim()) || status !== 'all';
  const count = filtering ? `${num(rows.length)} of ${plural(data.trips.length, 'trip', 'trips')}` : plural(data.trips.length, 'trip', 'trips');
  let results;
  if (!data.trips.length) {
    results = emptyHtml('No trips yet', 'Trips appear here as soon as someone plans or imports one.');
  } else if (!rows.length) {
    results = emptyHtml('No trip matches', 'No trip fits this search and this status.', { clear: true });
  } else {
    results = `<div class="adm-table-card">
        <table class="adm-table adm-table--trips" role="table" aria-label="Trips">
          ${theadHtml('trips', COLUMNS, state.sort)}
          <tbody role="rowgroup">${rows.map((trip) => rowHtml(trip, vm, peopleById)).join('')}</tbody>
        </table>
      </div>`;
  }
  const cut = data.tripsTotal > data.trips.length ? noteHtml(`Showing the newest ${num(data.trips.length)} of ${num(data.tripsTotal)} trips. Counts and searches cover these only.`) : '';
  return `<div class="adm-section">
    <div class="adm-toolbar">
      ${searchHtml({ name: 'trips', label: 'Search trips by title or owner', value: state.q })}
      <div class="adm-toolbar-chips" data-adm-region="trips-chips">${chipsHtml({ name: 'trips', label: 'Filter trips by status', active: status, options: chips })}</div>
    </div>
    <div data-adm-region="trips-results">
      <p class="adm-count" role="status">${esc(count)}</p>
      ${results}
      ${cut}
    </div>
  </div>`;
}
