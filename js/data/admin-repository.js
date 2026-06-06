import { supabase, getUser } from '../lib/supabase.js';

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

export async function fetchAllUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, role, home_city, home_country, home_flag, is_nomad, onboarding_complete, created_at, updated_at')
    .order('created_at', { ascending: false });

  return { data: data || [], error: error?.message || null };
}

export async function fetchAllTrips() {
  const { data, error } = await supabase
    .from('trips')
    .select('id, title, emoji, status, user_id, travelers, start_date, end_date, budget_daily, budget_currency, created_at, itinerary_days(day_number)')
    .order('created_at', { ascending: false });

  return { data: data || [], error: error?.message || null };
}

export async function fetchAdminStats() {
  const [users, trips] = await Promise.all([
    supabase.from('profiles').select('id, role, created_at'),
    supabase.from('trips').select('id, status, created_at'),
  ]);

  const userList = users.data || [];
  const tripList = trips.data || [];

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

  return {
    totalUsers: userList.length,
    totalAdmins: userList.filter(u => u.role === 'admin').length,
    totalTrips: tripList.length,
    generatedTrips: tripList.filter(t => t.status === 'generated').length,
    activeTrips: tripList.filter(t => t.status === 'active').length,
    failedTrips: tripList.filter(t => t.status === 'failed').length,
    planningTrips: tripList.filter(t => t.status === 'planning').length,
    generatingTrips: tripList.filter(t => t.status === 'generating').length,
    recentUsers: userList.filter(u => new Date(u.created_at) > thirtyDaysAgo).length,
    recentTrips: tripList.filter(t => new Date(t.created_at) > thirtyDaysAgo).length,
    weeklyUsers: userList.filter(u => new Date(u.created_at) > sevenDaysAgo).length,
    weeklyTrips: tripList.filter(t => new Date(t.created_at) > sevenDaysAgo).length,
  };
}

export async function updateUserRole(userId, role) {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  return { error: error?.message || null };
}

export async function deleteUserTrip(tripId) {
  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', tripId);

  return { error: error?.message || null };
}

export async function fetchLogs({ level, category, source, limit = 100, offset = 0 } = {}) {
  let query = supabase
    .from('app_logs')
    // Embed the related user name + trip title so the logs view can show who/what
    // each log refers to (nullable: system logs have no user/trip).
    .select('*, profiles(display_name), trips(title)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (level && level !== 'all') query = query.eq('level', level);
  if (category && category !== 'all') query = query.eq('category', category);
  if (source && source !== 'all') query = query.eq('source', source);

  const { data, error, count } = await query;
  return { data: data || [], error: error?.message || null, count: count || 0 };
}

export async function fetchLogStats() {
  const { data, error } = await supabase
    .from('app_logs')
    .select('level');

  if (error || !data) return { errors: 0, warnings: 0, infos: 0, total: 0 };

  return {
    errors: data.filter(l => l.level === 'error').length,
    warnings: data.filter(l => l.level === 'warn').length,
    infos: data.filter(l => l.level === 'info').length,
    total: data.length,
  };
}

export async function fetchTripWizardState(tripId) {
  const { data, error } = await supabase
    .from('trips')
    .select('id, wizard_state')
    .eq('id', tripId)
    .single();

  return { data, error: error?.message || null };
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

export async function deleteOldLogs(daysToKeep = 90) {
  const cutoff = new Date(Date.now() - daysToKeep * 86400000).toISOString();
  const { error } = await supabase
    .from('app_logs')
    .delete()
    .lt('created_at', cutoff);

  return { error: error?.message || null };
}
