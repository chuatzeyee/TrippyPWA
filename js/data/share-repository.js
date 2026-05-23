import { supabase, getUser } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

export async function createShareLink(tripId) {
  const user = getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const existing = await getShareForTrip(tripId);
  if (existing.data) return existing;

  const { data, error } = await supabase
    .from('trip_shares')
    .insert({ trip_id: tripId, created_by: user.id })
    .select()
    .single();

  if (error) logger.error('share', 'Share link creation failed', { tripId, error: error.message });
  return { data, error: error?.message || null };
}

export async function getShareForTrip(tripId) {
  const user = getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('trip_shares')
    .select('*')
    .eq('trip_id', tripId)
    .eq('created_by', user.id)
    .maybeSingle();

  return { data, error: error?.message || null };
}

export async function deleteShareLink(shareId) {
  const { error } = await supabase
    .from('trip_shares')
    .delete()
    .eq('id', shareId);

  if (error) logger.error('share', 'Share link deletion failed', { shareId, error: error.message });
  return { error: error?.message || null };
}

export async function fetchSharedTrip(shareToken) {
  const { data: share, error: shareError } = await supabase
    .from('trip_shares')
    .select('trip_id')
    .eq('share_token', shareToken)
    .single();

  if (shareError || !share) {
    logger.warn('share', 'Share link not found', { shareToken });
    return { data: null, error: 'Share link not found or expired' };
  }

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select(`
      *,
      itinerary_days (
        *,
        activities (*)
      )
    `)
    .eq('id', share.trip_id)
    .single();

  if (tripError) {
    logger.error('share', 'Shared trip fetch failed', { shareToken, error: tripError.message });
    return { data: null, error: tripError.message };
  }

  if (trip?.itinerary_days) {
    trip.itinerary_days.sort((a, b) => a.day_number - b.day_number);
    for (const day of trip.itinerary_days) {
      if (day.activities) {
        day.activities.sort((a, b) => {
          if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
          return a.sort_order - b.sort_order;
        });
      }
    }
  }

  const { data: owner } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', trip.user_id)
    .single();

  return { data: { ...trip, owner }, error: null };
}
