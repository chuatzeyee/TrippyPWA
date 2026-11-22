// Everything Trippy keeps on a device, and the one call that removes all of it. Used when an account
// is deleted: nothing of the person stays behind in this browser. Signing out and "Clear offline
// copies" remove less on purpose (the theme and the ticks stay for the next sign-in).
//
// Keys are matched by their prefix and not with storage.clear(): the site can share its origin with
// other pages, and their keys are not ours to remove.
//   trippy-...  trippy_...   offline trips, the trip list and briefings, prefs and their mirrors (theme,
//                            view, motion), the profile summary, the home currency, the import draft,
//                            square layout, the wizard draft and the per-tab markers
//   trip-quick-<trip id>     the "Trip prep" ticks          (js/data/tick-store.js)
//   checklist-<trip id>      the booking checklist ticks    (js/data/tick-store.js)
//   entry-done-<trip id>     the entry card ticks           (js/data/tick-store.js)
//   towns-v1-<trip id>       the town groups of the Discover tab (js/services/town-mapper.js)
// The sign-in token (sb-<project>-auth-token) is removed by the local sign-out, not here.

export const DEVICE_KEY_PREFIXES = Object.freeze(['trippy-', 'trippy_', 'trip-quick-', 'checklist-', 'entry-done-', 'towns-v1-']);

/** True for a key Trippy wrote. */
export const isTrippyKey = (key) => typeof key === 'string' && DEVICE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));

function open(name) {
  try { return globalThis[name] || null; } catch { return null; }
}

function keysOf(store) {
  const keys = [];
  try {
    for (let i = 0; i < store.length; i += 1) keys.push(store.key(i));
  } catch { /* storage is closed: there is nothing to list */ }
  return keys;
}

/**
 * Removes every Trippy key from the device's storage. Never throws: a storage that is closed or
 * missing holds nothing to remove.
 * @param {{ stores?: Array<Storage|null> }} [deps] default: localStorage and sessionStorage
 * @returns {number} how many keys were removed
 */
export function clearDeviceData({ stores = [open('localStorage'), open('sessionStorage')] } = {}) {
  let removed = 0;
  for (const store of stores) {
    if (!store) continue;
    // The keys are listed first: removing while walking by index would skip some.
    for (const key of keysOf(store).filter(isTrippyKey)) {
      try { store.removeItem(key); removed += 1; } catch { /* storage is closed */ }
    }
  }
  return removed;
}
