const STORAGE_KEY = 'trippy_trips';

function loadTrips() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTrips(trips) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}

export function getAllTrips() {
  return loadTrips();
}

export function getTripById(id) {
  return loadTrips().find(t => t.id === id) || null;
}

export function saveTrip(trip) {
  const trips = loadTrips();
  const index = trips.findIndex(t => t.id === trip.id);
  if (index >= 0) {
    trips[index] = trip;
  } else {
    trips.push(trip);
  }
  saveTrips(trips);
  return trip;
}

export function deleteTrip(id) {
  const trips = loadTrips().filter(t => t.id !== id);
  saveTrips(trips);
}

export function createTripShell(wizardState) {
  const id = wizardState.destination?.name
    ? wizardState.destination.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36)
    : 'trip-' + Date.now().toString(36);

  return {
    id,
    title: wizardState.destination?.name || 'New Trip',
    subtitle: wizardState.destination?.country || '',
    emoji: wizardState.destination?.emoji || '🌍',
    status: 'planning',
    generatedBy: 'manual',
    travelers: wizardState.travelers || 1,
    dates: {
      start: wizardState.dates?.start || '',
      end: wizardState.dates?.end || ''
    },
    budget: {
      homeCurrency: wizardState.budget?.homeCurrency || 'USD',
      homeSymbol: wizardState.budget?.homeSymbol || '$',
      destCurrency: wizardState.destination?.currencyCode || 'USD',
      destSymbol: wizardState.destination?.currencySymbol || '$',
      dailyBudget: wizardState.budget?.dailyMaxHome || 0,
      total: 0,
      spent: 0
    },
    coverImage: wizardState.destination?.heroImage || '',
    days: [],
    flights: [],
    accommodation: [],
    essentials: [],
    checklist: [],
    wizardState
  };
}
