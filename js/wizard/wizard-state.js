const SESSION_KEY = 'trippy_wizard_state';

function defaultState() {
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

export function canAdvance(state) {
  switch (state.currentStep) {
    case 1: return state.multiCity ? state.destinations.length >= 2 : !!state.destination?.name;
    case 2: return (state.dates.start && state.dates.end) || (state.dates.duration && state.dates.season);
    case 3: return (state.budget.dailyAmount || 0) > 0;
    case 4: return !!state.accommodation.type || !!state.accommodation.settled;
    case 5: return true;
    case 6: return state.style.activities.length >= 1;
    case 7: return true;
    default: return false;
  }
}
