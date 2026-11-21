// Keys of the ticks a device saves for a trip. The two functions were moved
// here unchanged from js/components/trip-detail.js (task F11x) so that the trip
// page and the pure model builders build the same keys. No DOM, no network, no
// storage: reading and writing the saved ticks stays with the callers.

// Stable per-item key: group, label and deadline hashed together, so items with
// the same (or non-Latin) labels in different groups don't share a tick.
export function checklistKey(group, item) {
  const text = `${group || ''}|${item?.label || ''}|${item?.by || ''}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `ck-${(h >>> 0).toString(36)}`;
}

// Keys saved before checklistKey existed (label slug only). Still honoured
// until the item is ticked or unticked again.
export function legacyChecklistKey(item) {
  return (item?.label || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
}

// The four ticks of the "Trip prep" card, saved together in
// trip-quick-<tripId>. The names are the ones the card has always written
// (renderTripQuickChecklist in trip-detail.js), so saved ticks stay readable.
export const QUICK_KEYS = /* @__PURE__ */ Object.freeze({
  flights: 'flights',
  transport: 'transport',
  accommodation: 'accommodation',
  reservations: 'reservations',
});
