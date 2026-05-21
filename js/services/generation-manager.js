const activeGenerations = new Map();
const listeners = new Set();

const CLIENT_MAX_RETRIES = 4;
const CLIENT_RETRY_DELAYS = [15000, 30000, 45000, 60000];

export function startGeneration(tripId, wizardState) {
  localStorage.setItem(`gen-state-${tripId}`, JSON.stringify(wizardState));
  activeGenerations.set(tripId, { status: 'generating', busy: false, attempt: 0 });
  notifyListeners(tripId);
  requestNotificationPermission();
  runGeneration(tripId, wizardState, 0);
}

async function runGeneration(tripId, wizardState, attempt) {
  try {
    const { generateItinerary } = await import('./generate.js');
    const { saveItineraryToTrip, updateTripStatus } = await import('../data/trip-repository.js');

    const { data: itinerary, error: genError, retryable } = await generateItinerary(wizardState);

    if (genError) {
      if (retryable && attempt < CLIENT_MAX_RETRIES) {
        activeGenerations.set(tripId, { status: 'generating', busy: true, attempt: attempt + 1 });
        notifyListeners(tripId);
        await new Promise(r => setTimeout(r, CLIENT_RETRY_DELAYS[attempt]));
        return runGeneration(tripId, wizardState, attempt + 1);
      }

      activeGenerations.set(tripId, { status: 'failed', error: genError });
      await updateTripStatus(tripId, 'failed').catch(() => {});
      localStorage.removeItem(`gen-state-${tripId}`);
      notifyListeners(tripId);
      return;
    }

    const { error: saveError } = await saveItineraryToTrip(tripId, wizardState, itinerary);
    activeGenerations.set(tripId, { status: 'done', partialError: saveError || null });
    showCompletionNotification(wizardState);
    localStorage.removeItem(`gen-state-${tripId}`);
    notifyListeners(tripId);
  } catch (err) {
    const msg = err.message || 'Unexpected error';
    const isRetryable = msg.includes('503') || msg.includes('Failed to fetch') || msg.includes('network');
    if (isRetryable && attempt < CLIENT_MAX_RETRIES) {
      activeGenerations.set(tripId, { status: 'generating', busy: true, attempt: attempt + 1 });
      notifyListeners(tripId);
      await new Promise(r => setTimeout(r, CLIENT_RETRY_DELAYS[attempt]));
      return runGeneration(tripId, wizardState, attempt + 1);
    }

    activeGenerations.set(tripId, { status: 'failed', error: msg });
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
          activeGenerations.set(trip.id, { status: 'generating', busy: false, attempt: 0 });
          runGeneration(trip.id, wizardState, 0);
        } catch {
          activeGenerations.set(trip.id, { status: 'failed', error: 'Corrupt saved state' });
          const { updateTripStatus } = await import('../data/trip-repository.js').catch(() => ({}));
          if (updateTripStatus) await updateTripStatus(trip.id, 'failed').catch(() => {});
          notifyListeners(trip.id);
        }
      } else {
        try {
          const { fetchTripById } = await import('../data/trip-repository.js');
          const { data: fullTrip } = await fetchTripById(trip.id);
          if (fullTrip?.wizard_state) {
            activeGenerations.set(trip.id, { status: 'generating', busy: false, attempt: 0 });
            runGeneration(trip.id, fullTrip.wizard_state, 0);
          } else {
            activeGenerations.set(trip.id, { status: 'failed', error: 'Generation was interrupted' });
            const { updateTripStatus } = await import('../data/trip-repository.js').catch(() => ({}));
            if (updateTripStatus) await updateTripStatus(trip.id, 'failed').catch(() => {});
            notifyListeners(trip.id);
          }
        } catch {
          activeGenerations.set(trip.id, { status: 'failed', error: 'Generation was interrupted' });
          const { updateTripStatus } = await import('../data/trip-repository.js').catch(() => ({}));
          if (updateTripStatus) await updateTripStatus(trip.id, 'failed').catch(() => {});
          notifyListeners(trip.id);
        }
      }
    }
  }
}

function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showCompletionNotification(wizardState) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;

  const destName = wizardState?.multiCity
    ? wizardState.destinations?.map(d => d.name).join(', ')
    : wizardState?.destination?.name || 'your trip';

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification('Trippy', {
          body: `Your ${destName} itinerary is ready!`,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: 'gen-complete',
          renotify: true,
          data: { url: '/' }
        });
      });
    } else {
      new Notification('Trippy', {
        body: `Your ${destName} itinerary is ready!`,
        icon: '/icons/icon-192.png',
        tag: 'gen-complete'
      });
    }
  } catch {}
}
