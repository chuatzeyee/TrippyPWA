// The ticks a device keeps for a trip. Three stores in localStorage, each a
// JSON object, written by the trip page and the entry card and only read here:
//   trip-quick-<tripId>   the "Trip prep" card (names in QUICK_KEYS, js/lib/tick-keys.js)
//   checklist-<tripId>    the booking checklist (checklistKey, and label keys saved
//                         before it existed: legacyChecklistKey)
//   entry-done-<tripId>   the entry card (entryDoneKey and entryHaveKey, js/lib/entry-rules.js)
// The formats are already on devices: a change here must keep them readable.

/** The bubbling event every writer of a tick dispatches after it has saved. */
export const TICKS_EVENT = 'trippy:ticks';

const STORE_PREFIXES = Object.freeze({
  quick: 'trip-quick-',
  checklist: 'checklist-',
  entryDone: 'entry-done-',
});

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

// A corrupt or foreign value must never stop a screen from drawing: it reads as no ticks.
function readStore(key) {
  try {
    const value = JSON.parse(storage()?.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/**
 * The saved ticks of one trip, as they are stored (key to true or false).
 * Always three objects, new on every call; empty when nothing is saved, when a
 * store cannot be read, and when there is no trip id.
 * @param {string} tripId
 * @returns {{ quick: Object<string, boolean>, checklist: Object<string, boolean>, entryDone: Object<string, boolean> }}
 */
export function readTicks(tripId) {
  const read = (prefix) => (tripId ? readStore(prefix + tripId) : {});
  return {
    quick: read(STORE_PREFIXES.quick),
    checklist: read(STORE_PREFIXES.checklist),
    entryDone: read(STORE_PREFIXES.entryDone),
  };
}

/**
 * Removes the three tick stores of each given trip. Keys are matched whole,
 * so every other trip's ticks stay (also a trip whose id starts the same).
 * @param {string[]|string} tripIds
 */
export function clearTicksFor(tripIds) {
  const store = storage();
  if (!store) return;
  const ids = [].concat(tripIds ?? []).filter(Boolean);
  for (const id of ids) {
    for (const prefix of Object.values(STORE_PREFIXES)) {
      try { store.removeItem(prefix + id); } catch { /* nothing to remove, or storage is closed */ }
    }
  }
}
