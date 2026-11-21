import { supabase, getUser } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { formatCityList } from '../lib/locale.js';
import { startMinutes, normStartTime, sortDayActivities } from '../lib/day-order.js';
import { storedSessionUserId } from './profile-cache.js';

function normDay(raw, index) {
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    dayNumber: d.dayNumber ?? d.day_number ?? d.dayNum ?? d.day ?? d.number ?? (index + 1),
    date: d.date,
    title: d.title,
    theme: d.theme,
    weather: d.weather,
    activities: (Array.isArray(d.activities) ? d.activities : []).filter(a => a && typeof a === 'object').map(normActivity)
  };
}

const VALID_SLOTS = new Set(['morning', 'afternoon', 'evening']);

function normTimeSlot(raw) {
  if (!raw) return 'morning';
  const s = String(raw).toLowerCase().trim();
  if (VALID_SLOTS.has(s)) return s;
  if (s.includes('morning') || s.includes('breakfast')) return 'morning';
  if (s.includes('afternoon') || s.includes('lunch')) return 'afternoon';
  if (s.includes('evening') || s.includes('night') || s.includes('dinner')) return 'evening';
  return 'morning';
}

// Without an explicit order, keep the order the activities were listed in.
function normActivity(a, index) {
  return {
    timeSlot: normTimeSlot(a.timeSlot ?? a.time_slot),
    sortOrder: a.sortOrder ?? a.sort_order ?? index,
    startTime: a.startTime ?? a.start_time ?? '',
    title: a.title ?? '',
    description: a.description ?? '',
    venueName: a.venueName ?? a.venue_name ?? '',
    venueAddress: a.venueAddress ?? a.venue_address ?? '',
    placeId: a.placeId ?? a.place_id ?? '',
    category: a.category ?? 'culture',
    durationMinutes: a.durationMinutes ?? a.duration_minutes ?? 60,
    costAmount: a.costAmount ?? a.cost_amount ?? 0,
    costCurrency: a.costCurrency ?? a.cost_currency ?? '',
    costNote: a.costNote ?? a.cost_note ?? '',
    latitude: a.latitude ?? null,
    longitude: a.longitude ?? null,
    bookingUrl: a.bookingUrl ?? a.booking_url ?? '',
    tips: a.tips ?? '',
    gettingThere: a.gettingThere ?? a.getting_there ?? '',
    transportMode: a.transportMode ?? a.transport_mode ?? '',
    transportDuration: a.transportDuration ?? a.transport_duration ?? '',
    transportCost: a.transportCost ?? a.transport_cost ?? '',
    transportOptions: a.transportOptions ?? a.transport_options ?? []
  };
}

// ===== Activity start times and day order =====
// These live in js/lib/day-order.js (pure, so the model builders can use them
// too) and are still exported from here for the callers that import them here.
export { startMinutes, normStartTime, sortDayActivities };

function sortTrip(trip) {
  if (!Array.isArray(trip.itinerary_days)) return trip;
  const days = [...trip.itinerary_days]
    .sort((a, b) => a.day_number - b.day_number)
    .map(day => (Array.isArray(day.activities)
      ? { ...day, activities: sortDayActivities(day.activities) }
      : day));
  return { ...trip, itinerary_days: days };
}

// ===== Offline copies =====
// The last successful fetch of a handful of recently opened trips (and the trip
// list, and the briefings of live and upcoming trips) is kept in localStorage
// so an installed app still shows them without a connection. Entries are
// tagged with the user id and only served to that user.

const OFFLINE_INDEX_KEY = 'trippy-offline-trips';
const OFFLINE_TRIP_PREFIX = 'trippy-offline-trip:';
const OFFLINE_LIST_KEY = 'trippy-offline-trip-list';
const OFFLINE_BRIEFINGS_KEY = 'trippy-offline-trip-briefings';
const OFFLINE_MAX_TRIPS = 5;
// localStorage holds about 5M characters per origin, shared with the session,
// prefs and drafts, whose writes don't expect a full store. All offline copies
// together (trips, the list and the briefings) stay within this budget: the
// list and the briefings have a fixed share each, the trips get the rest.
const OFFLINE_BUDGET_CHARS = 2_000_000;
const OFFLINE_MAX_LIST_CHARS = 300_000;
const OFFLINE_MAX_BRIEFING_CHARS = 120_000;
const OFFLINE_TRIPS_BUDGET_CHARS = OFFLINE_BUDGET_CHARS - OFFLINE_MAX_LIST_CHARS - OFFLINE_MAX_BRIEFING_CHARS;
const OFFLINE_MAX_TRIP_CHARS = 500_000;
const OFFLINE_MAX_LIST_ROWS = 100;
// With an offline copy to fall back on, stop waiting for a slow network after this.
const NETWORK_TIMEOUT_MS = 8000;

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function readJson(key) {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readOfflineIndex() {
  const index = readJson(OFFLINE_INDEX_KEY);
  return Array.isArray(index) ? index : [];
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// Whose copies to read: the signed-in user, else (before or without a token
// refresh) the user of the session supabase-js persisted.
const deviceUserId = () => getUser()?.id || storedSessionUserId();

// Size of a saved copy; index entries written before sizes were recorded are measured.
function storedTripChars(s, entry) {
  if (Number.isFinite(entry.chars)) return entry.chars;
  try { return s.getItem(OFFLINE_TRIP_PREFIX + entry.id)?.length || 0; } catch { return 0; }
}

function saveTripOffline(userId, trip) {
  const s = storage();
  if (!s || !userId || !trip?.id) return;
  const savedAt = new Date().toISOString();
  let raw;
  try { raw = JSON.stringify({ userId, savedAt, data: trip }); } catch { return; }
  if (raw.length > OFFLINE_MAX_TRIP_CHARS) return;

  const entry = { id: trip.id, userId, savedAt, title: trip.title || '', start_date: trip.start_date || null, end_date: trip.end_date || null, chars: raw.length };
  const ranked = [entry, ...readOfflineIndex().filter(e => e.id !== trip.id)];
  // Keep the newest copies that fit the count and the size budget, and drop the
  // older ones before writing rather than only when the store is already full.
  let kept = [];
  let used = 0;
  for (const e of ranked) {
    used += e === entry ? raw.length : storedTripChars(s, e);
    if (kept.length === OFFLINE_MAX_TRIPS || used > OFFLINE_TRIPS_BUDGET_CHARS) break;
    kept = [...kept, e];
  }
  for (const old of ranked.slice(kept.length)) s.removeItem(OFFLINE_TRIP_PREFIX + old.id);

  // Still out of space (other data fills the store): drop the oldest other
  // copies until this one fits.
  for (;;) {
    try {
      s.setItem(OFFLINE_TRIP_PREFIX + trip.id, raw);
      break;
    } catch {
      const victim = kept.length > 1 ? kept[kept.length - 1] : null;
      if (!victim) {
        s.removeItem(OFFLINE_TRIP_PREFIX + trip.id); // never leave an older, unlisted copy
        kept = [];
        break;
      }
      s.removeItem(OFFLINE_TRIP_PREFIX + victim.id);
      kept = kept.slice(0, -1);
    }
  }
  try { s.setItem(OFFLINE_INDEX_KEY, JSON.stringify(kept)); } catch { /* index is rebuilt next save */ }
}

function readOfflineTrip(userId, id) {
  const entry = readJson(OFFLINE_TRIP_PREFIX + id);
  return entry && entry.userId === userId && entry.data ? entry : null;
}

function forgetOfflineTrip(id) {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(OFFLINE_TRIP_PREFIX + id);
    s.setItem(OFFLINE_INDEX_KEY, JSON.stringify(readOfflineIndex().filter(e => e.id !== id)));
    const briefings = readJson(OFFLINE_BRIEFINGS_KEY);
    if (Array.isArray(briefings?.rows) && briefings.rows.some(row => row?.id === id)) {
      s.setItem(OFFLINE_BRIEFINGS_KEY, JSON.stringify({ ...briefings, rows: briefings.rows.filter(row => row?.id !== id) }));
    }
  } catch { /* nothing cached */ }
}

function saveTripListOffline(userId, rows) {
  const s = storage();
  if (!s) return;
  const savedAt = new Date().toISOString();
  const serialize = list => JSON.stringify({ userId, savedAt, rows: list });
  try {
    let kept = rows.slice(0, OFFLINE_MAX_LIST_ROWS);
    let raw = serialize(kept);
    // Over its share of the budget: keep the newest trips that fit.
    while (raw.length > OFFLINE_MAX_LIST_CHARS && kept.length > 0) {
      kept = kept.slice(0, Math.floor(kept.length * OFFLINE_MAX_LIST_CHARS / raw.length));
      raw = serialize(kept);
    }
    s.setItem(OFFLINE_LIST_KEY, raw);
  } catch { /* quota: the list is a convenience only */ }
}

function readTripListOffline(userId) {
  const entry = readJson(OFFLINE_LIST_KEY);
  return entry && userId && entry.userId === userId && Array.isArray(entry.rows) ? entry : null;
}

/** Trips saved on this device for the signed-in (or last signed-in) user, most recent first. */
export function listOfflineTrips() {
  const userId = deviceUserId();
  if (!userId) return [];
  return readOfflineIndex()
    .filter(e => e.userId === userId)
    .map(({ id, title, start_date, end_date, savedAt }) => ({ id, title, start_date, end_date, savedAt }));
}

/** Remove every offline copy (sign-out, account reset). */
export function clearOfflineTripCache() {
  const s = storage();
  if (!s) return;
  const keys = [];
  for (let i = 0; i < s.length; i++) keys.push(s.key(i));
  for (const key of keys) {
    const ours = key && (key.startsWith(OFFLINE_TRIP_PREFIX) || key === OFFLINE_INDEX_KEY
      || key === OFFLINE_LIST_KEY || key === OFFLINE_BRIEFINGS_KEY);
    if (ours) s.removeItem(key);
  }
}

// ===== Network helpers =====

// Race a PostgREST query against a timer (when ms > 0). The timer also aborts
// the request so a hanging connection doesn't linger in the background.
function withTimeout(builder, ms) {
  if (!ms) return builder;
  const controller = new AbortController();
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ data: null, error: { message: 'Request timed out', code: 'TIMEOUT' }, status: 0 });
    }, ms);
  });
  return Promise.race([builder.abortSignal(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

function isNotFound(error) {
  // PGRST116: zero rows for a single-row request; 22P02: not a valid uuid.
  return error?.code === 'PGRST116' || error?.code === '22P02';
}

function isNetworkFailure(error, status) {
  return !status || status >= 500 || error?.code === 'TIMEOUT';
}

// ===== Trip list (dashboard) =====

// Only what the dashboard cards read: no `extras`, and just the destination
// parts of wizard_state plus two small values from it. Activity costs, each
// with its currency, feed the card's total.
const TRIP_LIST_SELECT = [
  'id', 'title', 'emoji', 'status', 'start_date', 'end_date', 'created_at',
  'budget_daily', 'budget_currency', 'budget_currency_symbol', 'travelers', 'cover_image',
  'timezone',
  'ws_multi:wizard_state->multiCity',
  'ws_destination:wizard_state->destination',
  'ws_destinations:wizard_state->destinations',
  'ws_imported:wizard_state->imported',
  // The day total of a plan with flexible dates (it has no start and end date).
  'ws_duration:wizard_state->dates->duration',
  'import_pending:extras->importPending',
  // The v2 cover's copies ({ url, w, h }); cards use the 1280px one, cropped
  // at the picked height (focusY, %).
  'cover_small:extras->cover->small',
  'cover_large:extras->cover->large',
  'cover_focus:extras->cover->focusY',
  'cover_credit:extras->cover->credit',
  'cover_none:extras->cover->none',
  'itinerary_days(day_number,activities(cost_amount,cost_currency))',
].join(',');

// A trip still marked as importing after this long was abandoned mid-import
// (tab closed, phone slept) and is removed.
const STALE_IMPORT_MS = 10 * 60 * 1000;

// `wizard_state.imported` (true) and `wizard_state.dates.duration` (a day
// count) are there only when the plan has them; `timezone` and the `cover_*`
// values stay on the row as selected.
function toListRow(row, shared, role) {
  const { ws_multi, ws_destination, ws_destinations, ws_imported, ws_duration, import_pending, ...rest } = row;
  const duration = Number(ws_duration);
  return {
    ...rest,
    wizard_state: {
      multiCity: !!ws_multi, destination: ws_destination ?? null, destinations: ws_destinations ?? [],
      ...(ws_imported === true ? { imported: true } : {}),
      ...(Number.isFinite(duration) && duration > 0 ? { dates: { duration } } : {}),
    },
    shared,
    collab_role: role || null,
  };
}

function dropAbandonedImports(userId, rows) {
  const abandoned = rows.filter(r => r.import_pending && Date.now() - Date.parse(r.created_at) > STALE_IMPORT_MS);
  if (abandoned.length === 0) return;
  const ids = abandoned.map(r => r.id);
  supabase.from('trips').delete().in('id', ids).eq('user_id', userId)
    .then(({ error }) => {
      if (error) logger.warn('data', 'Abandoned import cleanup failed', { error: error.message, count: ids.length });
    });
}

/**
 * Trips for the dashboard: the user's own plus trips they were invited to
 * collaborate on (RLS lets an invitee read those, matched by login email).
 * Shared trips carry `shared: true` and `collab_role`.
 * @returns {Promise<{ data: object[], error: string|null, stale?: boolean, cachedAt?: string }>}
 *   stale: true with cachedAt (when the list was saved) when the copy saved on this device was returned.
 */
export async function fetchAllTrips() {
  const user = getUser();
  const stale = entry => ({ data: entry.rows, error: null, stale: true, cachedAt: entry.savedAt });
  if (!user) {
    const cached = readTripListOffline(storedSessionUserId());
    return cached ? stale(cached) : { data: [], error: 'Not authenticated' };
  }

  const cached = readTripListOffline(user.id);
  if (cached && isOffline()) return stale(cached);

  const ownQuery = supabase
    .from('trips')
    .select(TRIP_LIST_SELECT)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  const sharedQuery = user.email
    ? supabase
      .from('trip_collaborators')
      .select(`role, trip:trips(${TRIP_LIST_SELECT})`)
      .eq('invited_email', user.email.toLowerCase())
    : null;

  const timeoutMs = cached ? NETWORK_TIMEOUT_MS : 0;
  const [own, shared] = await Promise.all([
    withTimeout(ownQuery, timeoutMs),
    sharedQuery ? withTimeout(sharedQuery, timeoutMs) : { data: [], error: null },
  ]);

  if (own.error) {
    if (cached && isNetworkFailure(own.error, own.status)) return stale(cached);
    return { data: [], error: own.error.message || 'Could not load your trips' };
  }
  if (shared.error) logger.warn('data', 'Shared trips fetch failed', { error: shared.error.message });

  const ownRows = own.data || [];
  dropAbandonedImports(user.id, ownRows);
  const ownIds = new Set(ownRows.map(r => r.id));
  const rows = [
    ...ownRows.filter(r => !r.import_pending).map(r => toListRow(r, false)),
    ...(shared.data || [])
      .filter(c => c.trip && !ownIds.has(c.trip.id) && !c.trip.import_pending)
      .map(c => toListRow(c.trip, true, c.role)),
  ].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  saveTripListOffline(user.id, rows);
  return { data: rows, error: null };
}

/**
 * The role saved with the list row of a trip shared with this user: the first
 * guess on the trip page, until fetchMyRole() (collab-repository.js) answers.
 * @param {string} tripId
 * @returns {'viewer'|'editor'|null} null for the user's own trip, a trip not in the saved list, or no saved list
 */
export function cachedListRole(tripId) {
  const cached = readTripListOffline(deviceUserId());
  const role = cached?.rows.find(row => row?.id === tripId)?.collab_role;
  return role === 'viewer' || role === 'editor' ? role : null;
}

// ===== Briefings (live and upcoming trips) =====
// What the dashboard needs beyond the list, for the few plans that are live or
// coming up: journey, stay, checklist and passports for readiness, the days for
// typical weather, and the stops of the days that are left.
//
// ONE QUERY, TWO ALIASES. `itinerary_days` is embedded twice: `days` whole, and
// `stops` (with its activities) kept to a date range by filters on that alias
// only. This form was run once, read-only, against this project's PostgREST on
// 2026-11-20 (blueprint 7.2, risk 2): HTTP 200, the filters apply to `stops`
// alone and `days` stays whole, 3.6 to 10 KB per plan. It is the form in use
// because the range keeps the answer small while a live plan still gets every
// remaining day. Should a PostgREST version refuse it, the fallback is a single
// embed without a date filter: drop the `stops` line and the two filters in
// fetchTripBriefings(), and add `,activities(...)` inside `days`. toBriefingRow()
// reads both forms and applies the range itself, so nothing else changes.
const TRIP_BRIEFING_SELECT = [
  'id', 'timezone',
  'flights:extras->flights',
  'transport:extras->transport',
  'accommodation:extras->accommodation',
  'checklist:extras->bookingChecklist',
  'ws_passports:wizard_state->passports',
  'ws_transport_mode:wizard_state->transport->mode',
  'ws_flights_settled:wizard_state->flights->settled',
  'ws_stay_settled:wizard_state->accommodation->settled',
  'days:itinerary_days(day_number,date,title,weather)',
  'stops:itinerary_days(day_number,date,activities(start_time,time_slot,sort_order,title,venue_name))',
].join(',');

// The first briefing of a device has no copy to fall back on, so it may take longer.
const BRIEFING_FIRST_TIMEOUT_MS = 20_000;

const isRecord = value => Boolean(value) && typeof value === 'object';
const isIsoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const byDayNumber = (a, b) => (Number(a.day_number) || 0) - (Number(b.day_number) || 0);

// 'YYYY-MM-DD' on this device's calendar, `offsetDays` away from `now`.
function deviceDate(now, offsetDays = 0) {
  const given = now == null ? new Date() : new Date(now);
  const base = Number.isNaN(given.getTime()) ? new Date() : given;
  const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays);
  const pad = n => String(n).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

const toStop = a => ({
  start_time: a.start_time ?? '', time_slot: a.time_slot ?? null, sort_order: a.sort_order ?? 0,
  title: a.title ?? '', venue_name: a.venue_name ?? '',
});

// One shape whichever form of the select answered. `extras` and `wizard_state`
// hold their parts under the names the full trip row uses; `days` are in day
// order without activities; `stops` are the days from `from` to `to` (both
// included) with their activities in display order.
function toBriefingRow(raw, from, to) {
  const days = (Array.isArray(raw.days) ? raw.days : []).filter(isRecord);
  // Two aliases: `stops` is its own embed. Single embed: the days carry the activities.
  const stopDays = Array.isArray(raw.stops) ? raw.stops.filter(isRecord) : days;
  return {
    id: raw.id,
    timezone: raw.timezone ?? null,
    extras: {
      flights: raw.flights ?? null,
      transport: raw.transport ?? null,
      accommodation: raw.accommodation ?? null,
      bookingChecklist: raw.checklist ?? null,
    },
    wizard_state: {
      passports: Array.isArray(raw.ws_passports) ? raw.ws_passports : null,
      transport: { mode: raw.ws_transport_mode ?? null },
      flights: { settled: raw.ws_flights_settled === true },
      accommodation: { settled: raw.ws_stay_settled === true },
    },
    days: days
      .map(d => ({ day_number: d.day_number, date: d.date ?? null, title: d.title ?? '', weather: d.weather ?? null }))
      .sort(byDayNumber),
    stops: stopDays
      .filter(d => isIsoDate(d.date) && d.date >= from && d.date <= to)
      .map(d => ({
        day_number: d.day_number,
        date: d.date,
        activities: sortDayActivities((Array.isArray(d.activities) ? d.activities : []).filter(isRecord)).map(toStop),
      }))
      .sort(byDayNumber),
  };
}

// For trimming the saved copy only: a plan counts as live when its days reach
// from tomorrow or earlier to yesterday or later on this device's calendar (a
// day of slack each way, because the plan's own zone can be a day ahead or behind).
function isLiveBriefing(row, yesterday, tomorrow) {
  const dates = row.days.map(d => d.date).filter(isIsoDate).sort();
  return dates.length > 0 && dates[0] <= tomorrow && dates[dates.length - 1] >= yesterday;
}

function saveBriefingsOffline(userId, rows, yesterday, tomorrow) {
  const s = storage();
  if (!s) return;
  const savedAt = new Date().toISOString();
  const serialize = list => JSON.stringify({ userId, savedAt, rows: list });
  try {
    let kept = rows;
    let raw = serialize(kept);
    // Over its share of the budget: first drop the stops of plans that are not
    // live, last plan first; then whole rows from the end (live plans are first).
    for (let i = kept.length - 1; i >= 0 && raw.length > OFFLINE_MAX_BRIEFING_CHARS; i--) {
      if (kept[i].stops.length === 0 || isLiveBriefing(kept[i], yesterday, tomorrow)) continue;
      kept = kept.map((row, at) => (at === i ? { ...row, stops: [] } : row));
      raw = serialize(kept);
    }
    while (raw.length > OFFLINE_MAX_BRIEFING_CHARS && kept.length > 0) {
      kept = kept.slice(0, -1);
      raw = serialize(kept);
    }
    s.setItem(OFFLINE_BRIEFINGS_KEY, raw);
  } catch { /* quota: the copy is a convenience only */ }
}

function readBriefingsOffline(userId) {
  const entry = readJson(OFFLINE_BRIEFINGS_KEY);
  if (!entry || !userId || entry.userId !== userId || !Array.isArray(entry.rows)) return null;
  return { savedAt: entry.savedAt, rows: entry.rows.filter(row => isRecord(row) && row.id) };
}

/**
 * The briefings saved on this device for the signed-in (or last signed-in)
 * user, for the first paint. Synchronous; empty when nothing is saved.
 * @returns {object[]} rows in the shape fetchTripBriefings() gives
 */
export function readSavedBriefings() {
  return readBriefingsOffline(deviceUserId())?.rows ?? [];
}

/**
 * Briefings for a few live and upcoming trips, in one request. Rows come back
 * in the order of `ids`, each as
 * `{ id, timezone, extras: { flights, transport, accommodation, bookingChecklist },
 *    wizard_state: { passports, transport: { mode }, flights: { settled }, accommodation: { settled } },
 *    days: [{ day_number, date, title, weather }],
 *    stops: [{ day_number, date, activities: [{ start_time, time_slot, sort_order, title, venue_name }] }] }`.
 * `stops` covers the device's yesterday up to `liveUntil`, so it holds every
 * remaining day of a live plan and is empty for a plan that starts later.
 * The answer is saved on the device; offline or on a network failure the saved
 * rows are returned with `stale: true`.
 * @param {string[]} ids trip ids, live plans first
 * @param {{ liveUntil?: string, now?: Date|number|string }} [options]
 *   liveUntil: 'YYYY-MM-DD', the latest end date among the live plans (default: tomorrow);
 *   now: the moment the device date is read from (default: the clock).
 * @returns {Promise<{ data: object[], error: string|null, stale?: boolean, cachedAt?: string }>}
 *   error 'offline' when the device is offline and nothing is saved.
 */
export async function fetchTripBriefings(ids, { liveUntil, now } = {}) {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).filter(id => typeof id === 'string' && id))];
  const user = getUser();
  const saved = readBriefingsOffline(user?.id || storedSessionUserId());
  const stale = () => ({ data: saved.rows, error: null, stale: true, cachedAt: saved.savedAt });
  if (!user) return saved ? stale() : { data: [], error: 'Not authenticated' };
  if (isOffline()) return saved ? stale() : { data: [], error: 'offline' };
  if (wanted.length === 0) return { data: [], error: null };

  // Device dates: which of these days is "today" for a plan is decided by the reader, in the plan's zone.
  const yesterday = deviceDate(now, -1);
  const tomorrow = deviceDate(now, 1);
  const until = isIsoDate(liveUntil) ? liveUntil : tomorrow;
  const query = supabase
    .from('trips')
    .select(TRIP_BRIEFING_SELECT)
    .in('id', wanted)
    .gte('stops.date', yesterday)
    .lte('stops.date', until);
  const { data, error, status } = await withTimeout(query, saved ? NETWORK_TIMEOUT_MS : BRIEFING_FIRST_TIMEOUT_MS);

  if (error) {
    if (saved && isNetworkFailure(error, status)) return stale();
    return { data: [], error: error.message || 'Could not load the trip briefings' };
  }

  const byId = new Map((Array.isArray(data) ? data : []).filter(row => isRecord(row) && row.id)
    .map(row => [row.id, toBriefingRow(row, yesterday, until)]));
  const rows = wanted.filter(id => byId.has(id)).map(id => byId.get(id));
  saveBriefingsOffline(user.id, rows, yesterday, tomorrow);
  return { data: rows, error: null };
}

// ===== Single trip =====

const TRIP_DETAIL_SELECT = `
  *,
  itinerary_days (
    *,
    activities (*)
  )
`;

const notFound = () => ({ data: null, error: 'not_found' });
const PREFETCH_TTL_MS = 10_000;
let prefetched = null;

async function loadTripById(id) {
  const userId = deviceUserId();
  if (!userId) return { data: null, error: 'Not authenticated' };

  const cached = readOfflineTrip(userId, id);
  const stale = entry => ({ data: entry.data, error: null, stale: true, cachedAt: entry.savedAt });
  // Known offline: the saved copy or nothing. Even a query that can't reach the
  // server first waits on supabase-js's token refresh retries (25 s or more
  // with an expired token), so don't build one.
  if (isOffline()) return cached ? stale(cached) : { data: null, error: 'offline' };

  const query = supabase.from('trips').select(TRIP_DETAIL_SELECT).eq('id', id).maybeSingle();
  const { data, error, status } = await withTimeout(query, cached ? NETWORK_TIMEOUT_MS : 0);

  if (error) {
    if (isNotFound(error)) {
      forgetOfflineTrip(id);
      return notFound();
    }
    if (cached && isNetworkFailure(error, status)) return stale(cached);
    return { data: null, error: error.message || 'Could not load the trip' };
  }
  if (!data) {
    forgetOfflineTrip(id);
    return notFound();
  }

  const trip = sortTrip(data);
  saveTripOffline(userId, trip);
  return { data: trip, error: null };
}

/**
 * Start loading a trip ahead of the view that will render it (for example in
 * parallel with downloading the trip view's code). The next fetchTripById(id)
 * within a few seconds takes over this request instead of starting another.
 */
export function prefetchTripById(id) {
  if (!id) return;
  if (prefetched && prefetched.id === id && Date.now() - prefetched.at < PREFETCH_TTL_MS) return;
  const promise = loadTripById(id);
  promise.catch(() => {});
  prefetched = { id, at: Date.now(), promise };
}

/**
 * @returns {Promise<{ data: object|null, error: string|null, stale?: boolean, cachedAt?: string }>}
 *   error 'not_found' when the trip doesn't exist or isn't visible to this user;
 *   error 'offline' when the device is offline and no copy is saved on it;
 *   stale: true when the network failed and the last saved copy was returned.
 */
export async function fetchTripById(id) {
  const hit = prefetched;
  if (hit && hit.id === id) {
    prefetched = null;
    if (Date.now() - hit.at < PREFETCH_TTL_MS) return hit.promise;
  }
  return loadTripById(id);
}

// For multi-city trips wizardState.destination is null, so currency/symbol/tz
// must come from the first destination, otherwise they silently default to USD
// and the whole trip's budget shows the wrong currency.
export function primaryDestination(wizardState) {
  if (wizardState.multiCity && wizardState.destinations?.length > 0) {
    return wizardState.destinations[0];
  }
  return wizardState.destination || null;
}

export async function createTrip(wizardState, status = 'planning') {
  const user = getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const title = wizardState.multiCity && wizardState.destinations.length > 0
    ? formatCityList(wizardState.destinations.map(d => d.name))
    : wizardState.destination?.name || 'My Trip';

  const primary = primaryDestination(wizardState);

  const { data, error } = await supabase
    .from('trips')
    .insert({
      user_id: user.id,
      title,
      emoji: primary?.emoji || '',
      status,
      wizard_state: wizardState,
      travelers: wizardState.travelers || 1,
      start_date: wizardState.dates.start || null,
      end_date: wizardState.dates.end || null,
      budget_daily: wizardState.budget.dailyAmount || 0,
      budget_currency: primary?.currencyCode || 'USD',
      budget_currency_symbol: primary?.currencySymbol || '$',
      timezone: primary?.timezone || null
    })
    .select()
    .single();

  return { data, error: error?.message || null };
}

// ===== Import (trip + whole itinerary in one go) =====

const EXTRA_KEYS = ['flights', 'transport', 'accommodation', 'bookingChecklist', 'savingsTips'];
const SAVE_FAILED = "We couldn't save this trip. Check your connection and try again.";

function pickExtras(itinerary) {
  const extras = Object.fromEntries(EXTRA_KEYS.filter(k => itinerary[k]).map(k => [k, itinerary[k]]));
  return Object.keys(extras).length > 0 ? extras : null;
}

/** 'YYYY-MM-DD' for a day's date, or null. ISO dates are kept as written (no timezone shift). */
export function toDbDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (iso) return iso[1];
  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return null;
  const pad = n => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/** Normalised days with unique day numbers (itinerary_days has unique (trip_id, day_number)). */
export function normalizeDays(rawDays) {
  const days = (Array.isArray(rawDays) ? rawDays : []).map(normDay);
  const numbers = days.map(d => Number(d.dayNumber));
  const usable = numbers.every(n => Number.isInteger(n) && n > 0) && new Set(numbers).size === numbers.length;
  return usable
    ? days.map((d, i) => ({ ...d, dayNumber: numbers[i] }))
    : days.map((d, i) => ({ ...d, dayNumber: i + 1 }));
}

/** Trip row for an import. `importPending` hides it from the dashboard until the save completes. */
export function buildImportTripRow(userId, wizardState, itinerary) {
  const primary = primaryDestination(wizardState);
  const dest = wizardState.multiCity && wizardState.destinations?.length > 0
    ? wizardState.destinations.map(d => d.name).join(' to ')
    : wizardState.destination?.name || 'My Trip';
  return {
    user_id: userId,
    title: itinerary.tripTitle || dest,
    emoji: primary?.emoji || '',
    status: 'planning',
    wizard_state: wizardState,
    travelers: wizardState.travelers || 1,
    start_date: wizardState.dates?.start || null,
    end_date: wizardState.dates?.end || null,
    budget_daily: wizardState.budget?.dailyAmount || 0,
    budget_currency: primary?.currencyCode || 'USD',
    budget_currency_symbol: primary?.currencySymbol || '$',
    timezone: primary?.timezone || null,
    extras: { ...(pickExtras(itinerary) || {}), importPending: true }
  };
}

export function buildDayRows(tripId, days) {
  return days.map(day => ({
    trip_id: tripId,
    day_number: day.dayNumber,
    date: toDbDate(day.date),
    title: day.title || `Day ${day.dayNumber}`,
    theme: day.theme || '',
    weather: day.weather || null
  }));
}

/**
 * Activity rows for every day, linked through the inserted day ids.
 * @param {Map<number, string>} dayIdByNumber day_number -> itinerary_days.id
 * @returns {object[] | null} null when a day id is missing
 */
export function buildActivityRows(days, dayIdByNumber, defaultCurrency = 'USD') {
  const rows = [];
  for (const day of days) {
    if (day.activities.length === 0) continue;
    const dayId = dayIdByNumber.get(day.dayNumber);
    if (!dayId) return null;
    for (const a of day.activities) {
      rows.push({
        day_id: dayId, time_slot: a.timeSlot, sort_order: a.sortOrder, start_time: normStartTime(a.startTime),
        title: a.title, description: a.description, venue_name: a.venueName, venue_address: a.venueAddress,
        place_id: a.placeId, category: a.category, duration_minutes: a.durationMinutes,
        cost_amount: Math.round(a.costAmount || 0), cost_currency: a.costCurrency || defaultCurrency,
        cost_note: a.costNote, latitude: a.latitude, longitude: a.longitude, booking_url: a.bookingUrl,
        tips: a.tips, getting_there: a.gettingThere, transport_mode: a.transportMode,
        transport_duration: a.transportDuration, transport_cost: a.transportCost, transport_options: a.transportOptions
      });
    }
  }
  return rows;
}

/**
 * Persist a complete itinerary (used by trip import) in at most 4 requests:
 * insert the trip, insert all days, insert all activities, then mark it saved.
 * All-or-nothing: on any failure the trip is deleted (cascading to days and
 * activities). Until the last step the trip carries extras.importPending, so a
 * save cut short (tab closed, phone asleep) never shows up as a complete trip;
 * fetchAllTrips hides it and later removes it.
 * @param {object} wizardState
 * @param {object} itinerary
 * @param {{ onProgress?: (p: { step: number, total: number, label: string }) => void }} [opts]
 * @returns {Promise<{ data: object|null, error: string|null }>} data is the saved trip row
 */
export async function saveTripWithItinerary(wizardState, itinerary, { onProgress } = {}) {
  const user = getUser();
  if (!user) return { data: null, error: 'Please sign in to save this trip.' };
  if (!wizardState || !itinerary) return { data: null, error: SAVE_FAILED };

  const days = normalizeDays(itinerary.days);
  const activityCount = days.reduce((n, d) => n + d.activities.length, 0);
  const total = 2 + (days.length > 0 ? 1 : 0) + (activityCount > 0 ? 1 : 0);
  let step = 0;
  const progress = (label) => {
    step += 1;
    try { onProgress?.({ step, total, label }); } catch { /* a UI callback must not break the save */ }
  };

  progress('Creating your trip');
  const tripRow = buildImportTripRow(user.id, wizardState, itinerary);
  const { data: trip, error: tripError } = await supabase.from('trips').insert(tripRow).select().single();
  if (tripError || !trip) {
    logger.error('data', 'Trip insert failed', { error: tripError?.message, code: tripError?.code });
    return { data: null, error: SAVE_FAILED };
  }

  const fail = async (stage, err) => {
    logger.error('data', `Trip import failed at ${stage}`, { tripId: trip.id, error: err?.message, code: err?.code });
    const { error: rollbackError } = await supabase.from('trips').delete().eq('id', trip.id);
    if (rollbackError) logger.error('data', 'Rollback of partial trip failed', { tripId: trip.id, error: rollbackError.message });
    return { data: null, error: SAVE_FAILED };
  };

  const dayIdByNumber = new Map();
  if (days.length > 0) {
    progress(days.length === 1 ? 'Saving 1 day' : `Saving ${days.length} days`);
    const { data: dayRows, error: dayError } = await supabase
      .from('itinerary_days')
      .insert(buildDayRows(trip.id, days))
      .select('id, day_number');
    if (dayError || !Array.isArray(dayRows)) return fail('days', dayError);
    for (const row of dayRows) dayIdByNumber.set(row.day_number, row.id);
  }

  if (activityCount > 0) {
    const primary = primaryDestination(wizardState);
    const activityRows = buildActivityRows(days, dayIdByNumber, primary?.currencyCode || 'USD');
    if (!activityRows) return fail('activities', { message: 'Missing day id for activities' });
    progress(activityCount === 1 ? 'Saving 1 activity' : `Saving ${activityCount} activities`);
    const { error: actError } = await supabase.from('activities').insert(activityRows);
    if (actError) return fail('activities', actError);
  }

  progress('Finishing up');
  const extras = pickExtras(itinerary);
  const { error: doneError } = await supabase
    .from('trips')
    .update({ status: 'generated', extras })
    .eq('id', trip.id);
  if (doneError) return fail('finish', doneError);

  return { data: { ...trip, status: 'generated', extras }, error: null };
}

export async function deleteTrip(id) {
  const user = getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('trips')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id');

  if (error) return { error: error.message };
  if (!data?.length) {
    // Nothing deleted: either it is already gone (deleted on another device, a
    // repeated delete), which counts as done, or it is someone else's trip.
    const { data: row, error: lookupError } = await supabase
      .from('trips')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();
    if (lookupError) return { error: lookupError.message };
    if (row) return { error: row.user_id === user.id ? 'Could not delete the trip' : 'Only the trip owner can delete this trip.' };
  }
  forgetOfflineTrip(id);
  return { error: null };
}

// Delete a single activity (used by edit mode so users can curate the itinerary
// without a destructive full regenerate). Ownership is enforced by RLS via the
// activities -> itinerary_days -> trips chain.
export async function deleteActivityById(activityId) {
  const { error } = await supabase
    .from('activities')
    .delete()
    .eq('id', activityId);

  return { error: error?.message || null };
}

// Add a new activity to a day. Returns the inserted row (incl. id) so the UI can
// render it without a full refetch.
export async function addActivityToDay(dayId, activity = {}) {
  const payload = {
    day_id: dayId,
    time_slot: activity.timeSlot || 'morning',
    sort_order: activity.sortOrder ?? 999,
    start_time: normStartTime(activity.startTime),
    title: activity.title || 'New activity',
    description: activity.description || '',
    venue_name: activity.venueName || '',
    venue_address: activity.venueAddress || '',
    place_id: activity.placeId || '',
    category: activity.category || 'culture',
    duration_minutes: activity.durationMinutes ?? 60,
    cost_amount: Math.round(activity.costAmount || 0),
    cost_currency: activity.costCurrency || '',
    latitude: activity.latitude ?? null,
    longitude: activity.longitude ?? null,
    tips: activity.tips || '',
  };

  const { data, error } = await supabase
    .from('activities')
    .insert(payload)
    .select()
    .single();

  return { data, error: error?.message || null };
}

const ACTIVITY_FIELDS = [
  ['title', 'title'], ['venueName', 'venue_name'], ['venueAddress', 'venue_address'],
  ['placeId', 'place_id'], ['description', 'description'], ['startTime', 'start_time'],
  ['durationMinutes', 'duration_minutes'], ['costAmount', 'cost_amount'],
  ['costCurrency', 'cost_currency'], ['costNote', 'cost_note'], ['category', 'category'],
  ['latitude', 'latitude'], ['longitude', 'longitude'], ['tips', 'tips'],
  ['gettingThere', 'getting_there'], ['transportMode', 'transport_mode'],
  ['transportDuration', 'transport_duration'], ['transportCost', 'transport_cost'],
  ['transportOptions', 'transport_options'],
];

// Columns that identify the place an activity's stored photo shows.
const VENUE_COLUMNS = ['title', 'venue_name', 'venue_address', 'place_id'];

export function buildActivityUpdate(updates) {
  const payload = {};
  for (const [key, column] of ACTIVITY_FIELDS) {
    if (updates[key] !== undefined) payload[column] = updates[key];
  }
  if ('cost_amount' in payload) payload.cost_amount = Math.round(payload.cost_amount || 0);
  if ('start_time' in payload) payload.start_time = normStartTime(payload.start_time);
  return payload;
}

const sameText = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

// True when the update changes which place the activity is about, so the stored
// photo (and a 'none' marker meaning "no photo found") belongs to the old venue.
async function venueChanged(activityId, payload, previous) {
  const columns = VENUE_COLUMNS.filter(c => c in payload);
  if (columns.length === 0) return false;
  let before = previous;
  if (!before) {
    const { data, error } = await supabase.from('activities').select(columns.join(',')).eq('id', activityId).maybeSingle();
    // Can't compare: reset, since a wrong photo is worse than looking it up again.
    if (error || !data) return true;
    before = data;
  }
  return columns.some(c => !sameText(before[c], payload[c]));
}

/**
 * Update an activity. When its title, venue name, address or place id
 * changes, photo_url and photo_source are cleared so a photo of the new venue
 * gets resolved. Pass the activity row as it was before the edit in
 * `opts.previous` to skip the lookup used for that comparison.
 * @returns {Promise<{ error: string|null, photoReset: boolean }>}
 */
export async function updateActivityById(activityId, updates, { previous } = {}) {
  const payload = buildActivityUpdate(updates || {});
  if (Object.keys(payload).length === 0) return { error: null, photoReset: false };

  const resetPhoto = await venueChanged(activityId, payload, previous);
  const { error } = await supabase
    .from('activities')
    .update(resetPhoto ? { ...payload, photo_url: '', photo_source: '' } : payload)
    .eq('id', activityId);

  return { error: error?.message || null, photoReset: !error && resetPhoto };
}

/**
 * Passports the trip's group travels on (lowercase ISO2 codes), kept in the
 * trip's wizard_state. Used by the entry requirements card.
 */
export async function updateTripPassports(tripId, wizardState, passports) {
  const clean = [...new Set((passports || []).map(p => String(p).toLowerCase()).filter(p => /^[a-z]{2}$/.test(p)))];
  const { error } = await supabase.from('trips')
    .update({ wizard_state: { ...(wizardState || {}), passports: clean } })
    .eq('id', tripId);
  return { data: error ? null : clean, error: error ? 'Could not save passports' : null };
}

export async function updateTripStatus(id, status) {
  // Defense in depth: RLS already restricts updates to the owner, but filtering
  // by user_id makes the intent explicit and consistent with the other mutations.
  const user = getUser();
  let q = supabase.from('trips').update({ status }).eq('id', id);
  if (user) q = q.eq('user_id', user.id);
  const { error } = await q;
  return { error: error?.message || null };
}

/**
 * Deletes every trip the signed-in user owns (trips shared with the user stay)
 * and every offline copy on this device, and then, unless `keepProfile` is
 * set, the profile row as well.
 * @param {{ keepProfile?: boolean }} [options] keepProfile: leave the profile row (name, home, passport, prefs, role) alone
 * @returns {Promise<{ error: string|null }>}
 */
export async function clearAllUserData(options) {
  const keepProfile = Boolean(options?.keepProfile);
  const user = getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error: tripsErr } = await supabase
    .from('trips')
    .delete()
    .eq('user_id', user.id);

  if (tripsErr) return { error: `Failed to delete trips: ${tripsErr.message}` };
  clearOfflineTripCache();
  if (keepProfile) return { error: null };

  const { error: profileErr } = await supabase
    .from('profiles')
    .delete()
    .eq('id', user.id);

  if (profileErr) return { error: `Trips cleared, but profile delete failed: ${profileErr.message}` };

  return { error: null };
}
