const SESSION_KEY = 'trippy_wizard_state';

export function defaultState() {
  return {
    currentStep: 1,
    furthestStep: 1,
    sessionId: crypto.randomUUID(),
    destination: null,
    destinations: [],
    multiCity: false,
    dates: { mode: null, start: '', end: '', duration: 7, season: null, vibes: [], freeDays: [] },
    budget: { preset: null, dailyAmount: 0 },
    accommodation: { type: null, stars: 0, priorities: [] },
    flights: { fareClass: 'economy', departureAirport: '', airlines: [], connectionPref: 'any', departureTimePref: [] },
    transport: { mode: null, preferences: [] },
    style: { nightlife: 3, pace: 3, food: 3, exploration: 3, activities: [] },
    summary: { freeText: '', mustDo: '', dietary: '', prebooked: '', avoid: '' },
    travelers: 2
  };
}

export function loadWizardState() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : defaultState();
  } catch {
    return defaultState();
  }
}

export function saveWizardState(state) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
}

export function updateWizardState(state, updates) {
  const next = { ...state, ...updates };
  saveWizardState(next);
  return next;
}

export function updateWizardField(state, field, value) {
  const next = { ...state, [field]: value };
  saveWizardState(next);
  return next;
}

export function clearWizardState() {
  sessionStorage.removeItem(SESSION_KEY);
}

// Same ceiling as process-generation and trip import: longer trips are refused.
export const MAX_TRIP_DAYS = 60;

// Days in a fixed date range, counting both ends (0 when a date is missing).
export function fixedDayCount(dates) {
  if (!dates?.start || !dates?.end) return 0;
  return Math.round((new Date(dates.end) - new Date(dates.start)) / 86400000) + 1;
}

export function canAdvance(state) {
  switch (state.currentStep) {
    case 1: return state.multiCity ? state.destinations.length >= 2 : !!state.destination?.name;
    case 2:
      // Fixed dates win over a duration when both are set (as on the server).
      if (state.dates.start && state.dates.end) return fixedDayCount(state.dates) <= MAX_TRIP_DAYS;
      return state.dates.duration && state.dates.season;
    case 3: return (state.budget.dailyAmount || 0) > 0;
    case 4: return !!state.accommodation.type || !!state.accommodation.settled;
    case 5: return true;
    case 6: return state.style.activities.length >= 1;
    case 7: return true;
    default: return false;
  }
}
