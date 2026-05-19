const activeGenerations = new Map();
const listeners = new Set();

export function startGeneration(tripId, wizardState) {
  localStorage.setItem(`gen-state-${tripId}`, JSON.stringify(wizardState));
  activeGenerations.set(tripId, { status: 'generating' });
  notifyListeners(tripId);
  runGeneration(tripId, wizardState);
}

async function runGeneration(tripId, wizardState) {
  try {
    const { generateItinerary } = await import('./generate.js');
    const { saveItineraryToTrip, updateTripStatus } = await import('../data/trip-repository.js');

    const { data: itinerary, error: genError } = await generateItinerary(wizardState);
    if (genError) {
      activeGenerations.set(tripId, { status: 'failed', error: genError });
      await updateTripStatus(tripId, 'failed').catch(() => {});
      localStorage.removeItem(`gen-state-${tripId}`);
      notifyListeners(tripId);
      return;
    }

    const { error: saveError } = await saveItineraryToTrip(tripId, wizardState, itinerary);
    if (saveError) {
      activeGenerations.set(tripId, { status: 'failed', error: saveError });
      await updateTripStatus(tripId, 'failed').catch(() => {});
    } else {
      activeGenerations.set(tripId, { status: 'done' });
    }
    localStorage.removeItem(`gen-state-${tripId}`);
    notifyListeners(tripId);
  } catch (err) {
    activeGenerations.set(tripId, { status: 'failed', error: err.message || 'Unexpected error' });
    const { updateTripStatus } = await import('../data/trip-repository.js').catch(() => ({}));
    if (updateTripStatus) await updateTripStatus(tripId, 'failed').catch(() => {});
    localStorage.removeItem(`gen-state-${tripId}`);
    notifyListeners(tripId);
  }
}

export function getGenerationStatus(tripId) {
  return activeGenerations.get(tripId) || null;
}

export function onGenerationUpdate(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners(tripId) {
  const status = activeGenerations.get(tripId);
  for (const fn of listeners) fn(tripId, status);
}

export function clearGeneration(tripId) {
  activeGenerations.delete(tripId);
  localStorage.removeItem(`gen-state-${tripId}`);
}

export async function resumeStaleGenerations(trips) {
  for (const trip of trips) {
    if (trip.status === 'generating' && !activeGenerations.has(trip.id)) {
      const saved = localStorage.getItem(`gen-state-${trip.id}`);
      if (saved) {
        try {
          const wizardState = JSON.parse(saved);
          activeGenerations.set(trip.id, { status: 'generating' });
          runGeneration(trip.id, wizardState);
        } catch {
          activeGenerations.set(trip.id, { status: 'failed', error: 'Corrupt saved state' });
          const { updateTripStatus } = await import('../data/trip-repository.js').catch(() => ({}));
          if (updateTripStatus) await updateTripStatus(trip.id, 'failed').catch(() => {});
          notifyListeners(trip.id);
        }
      } else {
        activeGenerations.set(trip.id, { status: 'failed', error: 'Generation was interrupted' });
        const { updateTripStatus } = await import('../data/trip-repository.js').catch(() => ({}));
        if (updateTripStatus) await updateTripStatus(trip.id, 'failed').catch(() => {});
        notifyListeners(trip.id);
      }
    }
  }
}
