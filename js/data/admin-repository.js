// What the admin console reads and writes. Every read names its columns and is bounded: nothing here
// fetches a whole table. An admin sees these rows through row level security (profiles, trips,
// itinerary_days, app_logs, generation_jobs); llm_usage has no policy for anyone and is not read.
import { supabase, getUser } from '../lib/supabase.js';

/** The most rows one request asks for. 1,000 is also the cap of the API. */
export const LIMITS = Object.freeze({ people: 1000, trips: 1000, jobs: 200, facts: 1000, logs: 50, personLogs: 8 });

const DAY_MS = 86400000;
const LOG_COLUMNS = 'id, level, category, message, metadata, user_id, trip_id, source, user_agent, created_at, profiles(display_name), trips(title)';
const LIKE_UNSAFE = /[%_\\,()*]/g;

const message = (error) => error?.message || null;

export async function isAdmin() {
  const user = getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return data?.role === 'admin';
}

/**
 * Whether the signed in account is an admin: 'admin', 'user', or 'unknown' when the answer could not
 * be read (offline, a failed request), so a lost connection never reads as "not an admin".
 * @returns {Promise<'admin'|'user'|'unknown'>}
 */
export async function adminStatus() {
  const user = getUser();
  if (!user) return 'user';
  try {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (error || !data) return 'unknown';
    return data.role === 'admin' ? 'admin' : 'user';
  } catch {
    return 'unknown';
  }
}

/** The newest people, with how many there are in all. */
export async function fetchPeople({ limit = LIMITS.people } = {}) {
  const { data, error, count } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, role, home_city, home_country, home_flag, is_nomad, onboarding_complete, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit);

  const rows = data || [];
  return { data: rows, total: Number.isFinite(count) ? count : rows.length, error: message(error) };
}

/** The newest trips, with how many there are in all. No plan content and no wizard state. */
export async function fetchTrips({ limit = LIMITS.trips } = {}) {
  const { data, error, count } = await supabase
    .from('trips')
    .select('id, title, status, user_id, start_date, end_date, created_at, updated_at, itinerary_days(day_number)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit);

  const rows = data || [];
  return { data: rows, total: Number.isFinite(count) ? count : rows.length, error: message(error) };
}

/** The newest generation jobs of the last `days` days: status and error only, never the wizard state or the result. */
export async function fetchGenerationJobs({ days = 30, limit = LIMITS.jobs, now = Date.now() } = {}) {
  const { data, error } = await supabase
    .from('generation_jobs')
    .select('id, trip_id, user_id, status, error, last_provider, created_at, updated_at')
    .gte('created_at', new Date(now - days * DAY_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  return { data: data || [], error: message(error) };
}

/**
 * A light sample of the last `days` days of logs (no message, no metadata): the chip counts, the
 * error bursts and who was last seen are worked out from it.
 */
export async function fetchLogFacts({ days = 7, limit = LIMITS.facts, now = Date.now() } = {}) {
  const { data, error } = await supabase
    .from('app_logs')
    .select('level, category, source, user_id, trip_id, created_at')
    .gte('created_at', new Date(now - days * DAY_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  const rows = data || [];
  return { data: rows, truncated: rows.length >= limit, error: message(error) };
}

async function countErrors(from, until) {
  const { count, error } = await supabase
    .from('app_logs')
    .select('id', { count: 'exact', head: true })
    .eq('level', 'error')
    .gte('created_at', new Date(from).toISOString())
    .lt('created_at', new Date(until).toISOString());

  return error || !Number.isFinite(count) ? null : count;
}

/**
 * Exact error counts: the last day and week, each with the period before. Counts only, no rows.
 * Null when a count could not be read.
 */
export async function fetchErrorCounts({ now = Date.now() } = {}) {
  const [day, dayBefore, week, weekBefore] = await Promise.all([
    countErrors(now - DAY_MS, now + 1000),
    countErrors(now - 2 * DAY_MS, now - DAY_MS),
    countErrors(now - 7 * DAY_MS, now + 1000),
    countErrors(now - 14 * DAY_MS, now - 7 * DAY_MS),
  ]);
  if ([day, dayBefore, week, weekBefore].some((count) => count === null)) return null;
  return { day, dayBefore, week, weekBefore };
}

/**
 * One page of logs, newest first.
 * @param {{ level?: string, category?: string, source?: string, q?: string, userId?: string, limit?: number, offset?: number }} [opts]
 */
export async function fetchLogs({ level, category, source, q, userId, limit = LIMITS.logs, offset = 0 } = {}) {
  const size = Math.min(Math.max(1, limit), 200);
  let query = supabase
    .from('app_logs')
    // The person and the trip are embedded so a line can say who and what it is about (both can be
    // null: a system line has neither).
    .select(LOG_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + size - 1);

  if (level && level !== 'all') query = query.eq('level', level);
  if (category && category !== 'all') query = query.eq('category', category);
  if (source && source !== 'all') query = query.eq('source', source);
  if (userId) query = query.eq('user_id', userId);
  const term = String(q ?? '').replace(LIKE_UNSAFE, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (term) query = query.ilike('message', `%${term}%`);

  const { data, error, count } = await query;
  const rows = data || [];
  return { data: rows, error: message(error), count: Number.isFinite(count) ? count : offset + rows.length };
}

/** How many admins there are right now, read fresh; null when it could not be read. */
export async function countAdmins() {
  try {
    const { count, error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');
    return error || !Number.isFinite(count) ? null : count;
  } catch {
    return null;
  }
}

export async function updateUserRole(userId, role) {
  if (role !== 'user' && role !== 'admin') return { error: 'Invalid role' };
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  return { error: message(error) };
}

export async function deleteUserTrip(tripId) {
  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', tripId);

  return { error: message(error) };
}

export async function fetchTripWizardState(tripId) {
  const { data, error } = await supabase
    .from('trips')
    .select('id, wizard_state')
    .eq('id', tripId)
    .single();

  return { data, error: message(error) };
}

export async function retryTripGeneration(tripId) {
  const { data: trip, error: fetchErr } = await fetchTripWizardState(tripId);
  if (fetchErr || !trip?.wizard_state) {
    return { error: fetchErr || 'No wizard state found for this trip' };
  }

  const { error: statusErr } = await supabase
    .from('trips')
    .update({ status: 'generating' })
    .eq('id', tripId);

  if (statusErr) return { error: statusErr.message };

  const { startGeneration } = await import('../services/generation-manager.js');
  startGeneration(tripId, trip.wizard_state);
  return { error: null };
}

/** Deletes logs older than `daysToKeep` days. The database already deletes them after one year. */
export async function deleteOldLogs(daysToKeep = 90) {
  const cutoff = new Date(Date.now() - daysToKeep * DAY_MS).toISOString();
  const { error } = await supabase
    .from('app_logs')
    .delete()
    .lt('created_at', cutoff);

  return { error: message(error) };
}
