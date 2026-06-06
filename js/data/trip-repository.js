import { supabase, getUser } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { formatCityList } from '../lib/locale.js';

function normDay(d, index) {
  return {
    dayNumber: d.dayNumber ?? d.day_number ?? d.dayNum ?? d.day ?? d.number ?? (index + 1),
    date: d.date,
    title: d.title,
    theme: d.theme,
    weather: d.weather,
    activities: (d.activities || []).map(normActivity)
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

function normActivity(a) {
  return {
    timeSlot: normTimeSlot(a.timeSlot ?? a.time_slot),
    sortOrder: a.sortOrder ?? a.sort_order ?? 0,
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

export async function fetchAllTrips() {
  const user = getUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('trips')
    .select('*, itinerary_days(day_number, activities(cost_amount))')
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

// For multi-city trips wizardState.destination is null, so currency/symbol/tz
// must come from the first destination — otherwise they silently default to USD
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

  if (tripError) { logger.error('data', 'Trip insert failed', { error: tripError.message }); return { data: null, error: tripError.message }; }

  const dayErrors = [];
  for (let i = 0; i < itinerary.days.length; i++) {
    const day = normDay(itinerary.days[i], i);
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
      logger.error('data', 'Itinerary day insert failed', { tripId: trip.id, dayNumber: day.dayNumber, error: dayError.message });
      dayErrors.push(`Day ${day.dayNumber}: ${dayError.message}`);
      continue;
    }

    if (day.activities?.length > 0) {
      const activityRows = day.activities.map(a => ({
        day_id: dayRow.id,
        time_slot: a.timeSlot,
        sort_order: a.sortOrder,
        start_time: a.startTime,
        title: a.title,
        description: a.description,
        venue_name: a.venueName,
        venue_address: a.venueAddress,
        place_id: a.placeId,
        category: a.category,
        duration_minutes: a.durationMinutes,
        cost_amount: Math.round(a.costAmount || 0),
        cost_currency: a.costCurrency || wizardState.destination?.currencyCode || 'USD',
        cost_note: a.costNote,
        latitude: a.latitude,
        longitude: a.longitude,
        booking_url: a.bookingUrl,
        tips: a.tips,
        getting_there: a.gettingThere,
        transport_mode: a.transportMode,
        transport_duration: a.transportDuration,
        transport_cost: a.transportCost,
        transport_options: a.transportOptions
      }));

      const { error: actError } = await supabase
        .from('activities')
        .insert(activityRows);

      if (actError) dayErrors.push(`Day ${day.dayNumber} activities: ${actError.message}`);
    }
  }

  if (itinerary.flights || itinerary.transport || itinerary.accommodation || itinerary.bookingChecklist || itinerary.savingsTips) {
    const extras = {};
    if (itinerary.flights) extras.flights = itinerary.flights;
    if (itinerary.transport) extras.transport = itinerary.transport;
    if (itinerary.accommodation) extras.accommodation = itinerary.accommodation;
    if (itinerary.bookingChecklist) extras.bookingChecklist = itinerary.bookingChecklist;
    if (itinerary.savingsTips) extras.savingsTips = itinerary.savingsTips;
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

export async function saveItineraryToTrip(tripId, wizardState, itinerary, provider = 'unknown') {
  const updates = { status: 'generated' };
  if (itinerary.tripTitle) updates.title = itinerary.tripTitle;
  const { error: statusErr } = await supabase.from('trips').update(updates).eq('id', tripId);
  if (statusErr) logger.error('data', 'Trip status update failed', { tripId, error: statusErr.message });

  const { data: oldDays } = await supabase
    .from('itinerary_days')
    .select('id')
    .eq('trip_id', tripId);
  if (oldDays?.length) {
    for (const d of oldDays) {
      await supabase.from('activities').delete().eq('day_id', d.id);
    }
    await supabase.from('itinerary_days').delete().eq('trip_id', tripId);
  }

  const dayErrors = [];
  for (let i = 0; i < itinerary.days.length; i++) {
    const day = normDay(itinerary.days[i], i);
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
        time_slot: a.timeSlot,
        sort_order: a.sortOrder,
        start_time: a.startTime,
        title: a.title,
        description: a.description,
        venue_name: a.venueName,
        venue_address: a.venueAddress,
        place_id: a.placeId,
        category: a.category,
        duration_minutes: a.durationMinutes,
        cost_amount: Math.round(a.costAmount || 0),
        cost_currency: a.costCurrency || wizardState.destination?.currencyCode || 'USD',
        cost_note: a.costNote,
        latitude: a.latitude,
        longitude: a.longitude,
        booking_url: a.bookingUrl,
        tips: a.tips,
        getting_there: a.gettingThere,
        transport_mode: a.transportMode,
        transport_duration: a.transportDuration,
        transport_cost: a.transportCost,
        transport_options: a.transportOptions
      }));

      const { error: actError } = await supabase
        .from('activities')
        .insert(activityRows);

      if (actError) dayErrors.push(`Day ${day.dayNumber} activities: ${actError.message}`);
    }
  }

  const extras = {};
  if (itinerary.flights) extras.flights = itinerary.flights;
  if (itinerary.transport) extras.transport = itinerary.transport;
  if (itinerary.accommodation) extras.accommodation = itinerary.accommodation;
  if (itinerary.bookingChecklist) extras.bookingChecklist = itinerary.bookingChecklist;
  if (itinerary.savingsTips) extras.savingsTips = itinerary.savingsTips;
  extras.provider = provider;
  extras.generatedAt = new Date().toISOString();
  await supabase.from('trips').update({ extras }).eq('id', tripId);

  if (dayErrors.length === 0 && statusErr) {
    await supabase.from('trips').update({ status: 'generated' }).eq('id', tripId);
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
    start_time: activity.startTime || '',
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

export async function updateActivityById(activityId, updates) {
  const payload = {};
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.venueName !== undefined) payload.venue_name = updates.venueName;
  if (updates.venueAddress !== undefined) payload.venue_address = updates.venueAddress;
  if (updates.placeId !== undefined) payload.place_id = updates.placeId;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.startTime !== undefined) payload.start_time = updates.startTime;
  if (updates.durationMinutes !== undefined) payload.duration_minutes = updates.durationMinutes;
  if (updates.costAmount !== undefined) payload.cost_amount = Math.round(updates.costAmount || 0);
  if (updates.costCurrency !== undefined) payload.cost_currency = updates.costCurrency;
  if (updates.costNote !== undefined) payload.cost_note = updates.costNote;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.latitude !== undefined) payload.latitude = updates.latitude;
  if (updates.longitude !== undefined) payload.longitude = updates.longitude;
  if (updates.tips !== undefined) payload.tips = updates.tips;
  if (updates.gettingThere !== undefined) payload.getting_there = updates.gettingThere;
  if (updates.transportMode !== undefined) payload.transport_mode = updates.transportMode;
  if (updates.transportDuration !== undefined) payload.transport_duration = updates.transportDuration;
  if (updates.transportCost !== undefined) payload.transport_cost = updates.transportCost;
  if (updates.transportOptions !== undefined) payload.transport_options = updates.transportOptions;

  if (Object.keys(payload).length === 0) return { error: null };

  const { error } = await supabase
    .from('activities')
    .update(payload)
    .eq('id', activityId);

  return { error: error?.message || null };
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
