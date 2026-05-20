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
    .select('id, display_name, avatar_url, role, home_city, home_country, home_flag, created_at')
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

  return {
    totalUsers: userList.length,
    totalAdmins: userList.filter(u => u.role === 'admin').length,
    totalTrips: tripList.length,
    generatedTrips: tripList.filter(t => t.status === 'generated').length,
    activeTrips: tripList.filter(t => t.status === 'active').length,
    failedTrips: tripList.filter(t => t.status === 'failed').length,
    recentUsers: userList.filter(u => new Date(u.created_at) > thirtyDaysAgo).length,
    recentTrips: tripList.filter(t => new Date(t.created_at) > thirtyDaysAgo).length,
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
