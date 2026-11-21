// Facts about the shape of a trip record. Moved here unchanged from
// js/components/trip-detail.js (task F11x) so that the trip page and the pure
// model builders ask the same question. No DOM, no network, no storage.

// Shown for every trip with a destination; mountEntryCards hides it when no
// passport in the group needs anything.
export function hasEntryCard(trip) {
  const ws = trip?.wizard_state;
  return !!(ws?.multiCity ? ws?.destinations?.length : ws?.destination);
}

// How many section cards (flights or transport, entry, stays) the Plan tab draws
// before the day cards. Moved here unchanged from the trip page in task F11a.
export function countSectionCards(extras, trip) {
  let n = 0;
  if (extras?.flights || extras?.transport) n++;
  if (hasEntryCard(trip)) n++;
  if (Array.isArray(extras?.accommodation) && extras.accommodation.length > 0) n++;
  return n;
}

// An activity of a trip with its day, that day's list and its place in it; null
// when the trip has no such activity. Moved here unchanged in task F11a.
export function findActivity(trip, id) {
  for (const day of trip.itinerary_days || []) {
    const acts = day.activities || [];
    const idx = acts.findIndex(a => a.id === id);
    if (idx >= 0) return { day, acts, idx, activity: acts[idx] };
  }
  return null;
}
