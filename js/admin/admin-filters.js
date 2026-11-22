// Searching, filtering and sorting for the admin console. Pure.
import { dayCount, displayName, homeLabel, toDate } from './admin-format.js';

export const TRIP_STATUSES = Object.freeze(['failed', 'generating', 'planning', 'generated', 'active', 'completed']);

/** What each trip status is called on the page. */
export const STATUS_LABELS = Object.freeze({
  planning: 'Not planned yet',
  generating: 'Planning now',
  generated: 'Planned',
  active: 'Active',
  completed: 'Completed',
  failed: 'Failed',
});

export const LOG_LEVELS = Object.freeze([
  Object.freeze({ key: 'error', label: 'Errors' }),
  Object.freeze({ key: 'warn', label: 'Warnings' }),
  Object.freeze({ key: 'info', label: 'Info' }),
]);
export const LOG_CATEGORIES = Object.freeze(['auth', 'generation', 'data', 'share', 'profile', 'edge', 'system']);
export const LOG_SOURCES = Object.freeze([
  Object.freeze({ key: 'client', label: 'App' }),
  Object.freeze({ key: 'edge', label: 'Server' }),
]);

export function statusLabel(status) {
  return Object.hasOwn(STATUS_LABELS, status) ? STATUS_LABELS[status] : 'Unknown';
}

const fold = (value) => String(value ?? '').toLowerCase().trim();

/** How many trips each person owns, by person id. */
export function tripCountsByUser(trips) {
  const counts = new Map();
  for (const trip of trips ?? []) counts.set(trip.user_id, (counts.get(trip.user_id) ?? 0) + 1);
  return counts;
}

/**
 * @param {Array<object>} people
 * @param {{ q?: string, role?: 'all'|'admin'|'user', onboarded?: 'all'|'yes'|'no', nomad?: 'all'|'yes' }} filter
 */
export function filterPeople(people, { q = '', role = 'all', onboarded = 'all', nomad = 'all' } = {}) {
  const needle = fold(q);
  return (people ?? []).filter((person) => {
    if (role !== 'all' && person.role !== role) return false;
    if (onboarded === 'yes' && !person.onboarding_complete) return false;
    if (onboarded === 'no' && person.onboarding_complete) return false;
    if (nomad === 'yes' && !person.is_nomad) return false;
    if (!needle) return true;
    return fold(displayName(person)).includes(needle) || fold(homeLabel(person)).includes(needle);
  });
}

/** The filter chips of People, each with how many people it would show. */
export function peopleChips(people) {
  const list = people ?? [];
  return [
    { key: 'all', label: 'Everyone', count: list.length },
    { key: 'admin', label: 'Admins', count: list.filter((p) => p.role === 'admin').length },
    { key: 'pending', label: 'Not onboarded', count: list.filter((p) => !p.onboarding_complete).length },
    { key: 'nomad', label: 'Nomads', count: list.filter((p) => p.is_nomad).length },
  ];
}

/** The filter a People chip stands for. */
export function peopleChipFilter(key) {
  if (key === 'admin') return { role: 'admin', onboarded: 'all', nomad: 'all' };
  if (key === 'pending') return { role: 'all', onboarded: 'no', nomad: 'all' };
  if (key === 'nomad') return { role: 'all', onboarded: 'all', nomad: 'yes' };
  return { role: 'all', onboarded: 'all', nomad: 'all' };
}

/**
 * @param {Array<object>} trips
 * @param {{ q?: string, status?: string }} filter
 * @param {Map<string, object>} [peopleById] so a search also finds the owner's name
 */
export function filterTrips(trips, { q = '', status = 'all' } = {}, peopleById = new Map()) {
  const needle = fold(q);
  return (trips ?? []).filter((trip) => {
    if (status !== 'all' && trip.status !== status) return false;
    if (!needle) return true;
    const owner = peopleById.get(trip.user_id);
    return fold(trip.title).includes(needle) || (owner ? fold(displayName(owner)).includes(needle) : false);
  });
}

/** "All" and then every status that has a trip, in a fixed order, with counts. */
export function tripStatusChips(trips) {
  const list = trips ?? [];
  const chips = [{ key: 'all', label: 'All', count: list.length }];
  for (const status of TRIP_STATUSES) {
    const count = list.filter((trip) => trip.status === status).length;
    if (count) chips.push({ key: status, label: statusLabel(status), count });
  }
  const other = list.filter((trip) => !TRIP_STATUSES.includes(trip.status)).length;
  if (other) chips.push({ key: 'unknown', label: 'Unknown', count: other });
  return chips;
}

const time = (value) => toDate(value)?.getTime() ?? null;

/** What each People column sorts by. `ctx` carries the trip counts and the last active times. */
export const PEOPLE_SORTS = Object.freeze({
  name: (person) => fold(displayName(person)),
  home: (person) => fold(homeLabel(person)) || null,
  trips: (person, ctx) => ctx?.tripCounts?.get(person.id) ?? 0,
  joined: (person) => time(person.created_at),
  active: (person, ctx) => time(ctx?.lastActive?.get(person.id) ?? null),
});

/** What each Trips column sorts by. `ctx` carries the people by id. */
export const TRIP_SORTS = Object.freeze({
  title: (trip) => fold(trip.title) || null,
  owner: (trip, ctx) => { const owner = ctx?.peopleById?.get(trip.user_id); return owner ? fold(displayName(owner)) : null; },
  dates: (trip) => time(trip.start_date),
  days: (trip) => dayCount(trip),
  status: (trip) => { const i = TRIP_STATUSES.indexOf(trip.status); return i < 0 ? TRIP_STATUSES.length : i; },
  created: (trip) => time(trip.created_at),
});

/**
 * A sorted copy. Rows with no value for the column go last in either direction; equal rows keep
 * their order.
 * @param {Array<object>} rows
 * @param {{ key: string, dir: 'asc'|'desc' }} sort
 * @param {Record<string, (row: object, ctx: object) => any>} accessors
 * @param {object} [ctx]
 */
export function sortRows(rows, sort, accessors, ctx = {}) {
  const read = Object.hasOwn(accessors, sort?.key) ? accessors[sort.key] : null;
  if (!read) return [...(rows ?? [])];
  const sign = sort.dir === 'desc' ? -1 : 1;
  return (rows ?? [])
    .map((row, index) => ({ row, index, value: read(row, ctx) }))
    .sort((a, b) => {
      const noA = a.value === null || a.value === undefined;
      const noB = b.value === null || b.value === undefined;
      if (noA || noB) return noA && noB ? a.index - b.index : noA ? 1 : -1;
      if (a.value < b.value) return -sign;
      if (a.value > b.value) return sign;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** The next sort after a click on a column: the same column flips, a new one starts with `firstDir`. */
export function toggleSort(sort, key, firstDir = 'asc') {
  if (sort?.key === key) return { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: firstDir };
}

/**
 * How many of the sampled log rows each chip of Activity would show.
 * @param {Array<{ level: string, category: string, source: string }>} facts
 */
export function logChipCounts(facts) {
  const counts = { level: {}, category: {}, source: {}, total: 0 };
  for (const row of facts ?? []) {
    counts.total += 1;
    counts.level[row.level] = (counts.level[row.level] ?? 0) + 1;
    counts.category[row.category] = (counts.category[row.category] ?? 0) + 1;
    counts.source[row.source] = (counts.source[row.source] ?? 0) + 1;
  }
  return counts;
}

/** A search term that is safe inside a PostgREST ilike pattern: wildcards and separators are dropped. */
export function likeTerm(q) {
  return String(q ?? '').replace(/[%_\\,()*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}
