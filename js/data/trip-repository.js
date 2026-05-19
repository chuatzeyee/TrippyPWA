import { supabase, getUser } from '../lib/supabase.js';

export async function fetchAllTrips() {
  const user = getUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('trips')
    .select('*, itinerary_days(day_number)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return { data: data || [], error: error?.message || null };
}

export async function fetchTripById(id) {
  const user = getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('trips')
    .select(`
      *,
      itinerary_days (
        *,
        activities (*)
      )
    `)
    .eq('id', id)
    .single();

  if (data?.itinerary_days) {
    data.itinerary_days.sort((a, b) => a.day_number - b.day_number);
    for (const day of data.itinerary_days) {
      if (day.activities) {
        day.activities.sort((a, b) => {
          if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
          return a.sort_order - b.sort_order;
        });
      }
    }
  }

  return { data, error: error?.message || null };
}

export async function createTrip(wizardState, status = 'planning') {
  const user = getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const dest = wizardState.multiCity && wizardState.destinations.length > 0
    ? wizardState.destinations.map(d => d.name).join(' to ')
    : wizardState.destination?.name || 'My Trip';

  const { data, error } = await supabase
    .from('trips')
    .insert({
      user_id: user.id,
      title: dest,
      emoji: wizardState.destination?.emoji || '',
      status,
      wizard_state: wizardState,
      travelers: wizardState.travelers || 1,
      start_date: wizardState.dates.start || null,
      end_date: wizardState.dates.end || null,
      budget_daily: wizardState.budget.dailyAmount || 0,
      budget_currency: wizardState.destination?.currencyCode || 'USD',
      budget_currency_symbol: wizardState.destination?.currencySymbol || '$',
      timezone: wizardState.destination?.timezone || null
    })
    .select()
    .single();

  return { data, error: error?.message || null };
}

export async function saveTripWithItinerary(wizardState, itinerary) {
  const user = getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const dest = wizardState.multiCity && wizardState.destinations.length > 0
    ? wizardState.destinations.map(d => d.name).join(' to ')
    : wizardState.destination?.name || 'My Trip';

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .insert({
      user_id: user.id,
      title: itinerary.tripTitle || dest,
      emoji: wizardState.destination?.emoji || '',
      status: 'generated',
      wizard_state: wizardState,
      travelers: wizardState.travelers || 1,
      start_date: wizardState.dates.start || null,
      end_date: wizardState.dates.end || null,
      budget_daily: wizardState.budget.dailyAmount || 0,
      budget_currency: wizardState.destination?.currencyCode || 'USD',
      budget_currency_symbol: wizardState.destination?.currencySymbol || '$',
      timezone: wizardState.destination?.timezone || null
    })
    .select()
    .single();

  if (tripError) return { data: null, error: tripError.message };

  const dayErrors = [];
  for (const day of itinerary.days) {
    let safeDate = null;
    if (day.date) {
      const parsed = new Date(day.date);
      if (!isNaN(parsed.getTime())) {
        safeDate = parsed.toISOString().slice(0, 10);
      }
    }

    const dayPayload = {
      trip_id: trip.id,
      day_number: day.dayNumber,
      date: safeDate,
      title: day.title || `Day ${day.dayNumber}`,
      theme: day.theme || '',
      weather: day.weather || null
    };

    const { data: dayRow, error: dayError } = await supabase
      .from('itinerary_days')
      .insert(dayPayload)
      .select()
      .single();

    if (dayError) {
      console.error(`itinerary_days insert failed for day ${day.dayNumber}:`, dayError, dayPayload);
      dayErrors.push(`Day ${day.dayNumber}: ${dayError.message}`);
      continue;
    }

    if (day.activities?.length > 0) {
      const activityRows = day.activities.map(a => ({
        day_id: dayRow.id,
        time_slot: a.timeSlot || 'morning',
        sort_order: a.sortOrder || 0,
        start_time: a.startTime || '',
        title: a.title || '',
        description: a.description || '',
        venue_name: a.venueName || '',
        venue_address: a.venueAddress || '',
        place_id: a.placeId || '',
        category: a.category || 'culture',
        duration_minutes: a.durationMinutes || 60,
        cost_amount: Math.round(a.costAmount || 0),
        cost_currency: a.costCurrency || wizardState.destination?.currencyCode || 'USD',
        cost_note: a.costNote || '',
        latitude: a.latitude || null,
        longitude: a.longitude || null,
        booking_url: a.bookingUrl || '',
        tips: a.tips || '',
        getting_there: a.gettingThere || '',
        transport_mode: a.transportMode || '',
        transport_duration: a.transportDuration || '',
        transport_cost: a.transportCost || '',
        transport_options: a.transportOptions || []
      }));

      const { error: actError } = await supabase
        .from('activities')
        .insert(activityRows);

      if (actError) dayErrors.push(`Day ${day.dayNumber} activities: ${actError.message}`);
    }
  }

  if (itinerary.flights || itinerary.accommodation || itinerary.bookingChecklist) {
    const extras = {};
    if (itinerary.flights) extras.flights = itinerary.flights;
    if (itinerary.accommodation) extras.accommodation = itinerary.accommodation;
    if (itinerary.bookingChecklist) extras.bookingChecklist = itinerary.bookingChecklist;
    await supabase
      .from('trips')
      .update({ extras })
      .eq('id', trip.id);
  }

  if (dayErrors.length > 0) {
    return { data: trip, error: `Trip saved but some days failed: ${dayErrors[0]}` };
  }

  return { data: trip, error: null };
}

export async function saveItineraryToTrip(tripId, wizardState, itinerary) {
  const updates = { status: 'generated' };
  if (itinerary.tripTitle) updates.title = itinerary.tripTitle;
  await supabase.from('trips').update(updates).eq('id', tripId);

  const dayErrors = [];
  for (const day of itinerary.days) {
    let safeDate = null;
    if (day.date) {
      const parsed = new Date(day.date);
      if (!isNaN(parsed.getTime())) {
        safeDate = parsed.toISOString().slice(0, 10);
      }
    }

    const dayPayload = {
      trip_id: tripId,
      day_number: day.dayNumber,
      date: safeDate,
      title: day.title || `Day ${day.dayNumber}`,
      theme: day.theme || '',
      weather: day.weather || null
    };

    const { data: dayRow, error: dayError } = await supabase
      .from('itinerary_days')
      .insert(dayPayload)
      .select()
      .single();

    if (dayError) {
      dayErrors.push(`Day ${day.dayNumber}: ${dayError.message}`);
      continue;
    }

    if (day.activities?.length > 0) {
      const activityRows = day.activities.map(a => ({
        day_id: dayRow.id,
        time_slot: a.timeSlot || 'morning',
        sort_order: a.sortOrder || 0,
        start_time: a.startTime || '',
        title: a.title || '',
        description: a.description || '',
        venue_name: a.venueName || '',
        venue_address: a.venueAddress || '',
        place_id: a.placeId || '',
        category: a.category || 'culture',
        duration_minutes: a.durationMinutes || 60,
        cost_amount: Math.round(a.costAmount || 0),
        cost_currency: a.costCurrency || wizardState.destination?.currencyCode || 'USD',
        cost_note: a.costNote || '',
        latitude: a.latitude || null,
        longitude: a.longitude || null,
        booking_url: a.bookingUrl || '',
        tips: a.tips || '',
        getting_there: a.gettingThere || '',
        transport_mode: a.transportMode || '',
        transport_duration: a.transportDuration || '',
        transport_cost: a.transportCost || '',
        transport_options: a.transportOptions || []
      }));

      const { error: actError } = await supabase
        .from('activities')
        .insert(activityRows);

      if (actError) dayErrors.push(`Day ${day.dayNumber} activities: ${actError.message}`);
    }
  }

  if (itinerary.flights || itinerary.accommodation || itinerary.bookingChecklist) {
    const extras = {};
    if (itinerary.flights) extras.flights = itinerary.flights;
    if (itinerary.accommodation) extras.accommodation = itinerary.accommodation;
    if (itinerary.bookingChecklist) extras.bookingChecklist = itinerary.bookingChecklist;
    await supabase.from('trips').update({ extras }).eq('id', tripId);
  }

  return { error: dayErrors.length > 0 ? `Some days failed: ${dayErrors[0]}` : null };
}

export async function deleteTrip(id) {
  const user = getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  return { error: error?.message || null };
}

export async function updateTripStatus(id, status) {
  const { error } = await supabase
    .from('trips')
    .update({ status })
    .eq('id', id);

  return { error: error?.message || null };
}

export async function clearAllUserData() {
  const user = getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error: tripsErr } = await supabase
    .from('trips')
    .delete()
    .eq('user_id', user.id);

  if (tripsErr) return { error: `Failed to delete trips: ${tripsErr.message}` };

  const { error: profileErr } = await supabase
    .from('profiles')
    .delete()
    .eq('id', user.id);

  if (profileErr) return { error: `Trips cleared, but profile delete failed: ${profileErr.message}` };

  return { error: null };
}
