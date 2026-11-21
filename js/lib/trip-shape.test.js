import { describe, it, expect } from 'vitest';
import { hasEntryCard, countSectionCards, findActivity } from './trip-shape.js';

// Pinned to the function as it stood in js/components/trip-detail.js before it
// moved to js/lib. The trips are invented.

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('hasEntryCard', () => {
  it('is true for a single-destination trip that has a destination', () => {
    expect(hasEntryCard({ wizard_state: { destination: { name: 'Tokyo' } } })).toBe(true);
    expect(hasEntryCard({ wizard_state: { destination: {} } })).toBe(true);
    expect(hasEntryCard({ wizard_state: { destination: 'Tokyo' } })).toBe(true);
  });

  it('is false for a single-destination trip without one', () => {
    expect(hasEntryCard({ wizard_state: { destination: null } })).toBe(false);
    expect(hasEntryCard({ wizard_state: { destination: '' } })).toBe(false);
    expect(hasEntryCard({ wizard_state: {} })).toBe(false);
  });

  it('is true for a multi-city trip with at least one destination', () => {
    expect(hasEntryCard({ wizard_state: { multiCity: true, destinations: [{ name: 'Rome' }, { name: 'Paris' }] } })).toBe(true);
    expect(hasEntryCard({ wizard_state: { multiCity: true, destinations: [{ name: 'Rome' }] } })).toBe(true);
  });

  it('is false for a multi-city trip with no destinations', () => {
    expect(hasEntryCard({ wizard_state: { multiCity: true, destinations: [] } })).toBe(false);
    expect(hasEntryCard({ wizard_state: { multiCity: true } })).toBe(false);
  });

  it('reads only the list on a multi-city trip, and only the single field otherwise', () => {
    expect(hasEntryCard({ wizard_state: { multiCity: true, destination: { name: 'Tokyo' } } })).toBe(false);
    expect(hasEntryCard({ wizard_state: { multiCity: true, destinations: [], destination: { name: 'Tokyo' } } })).toBe(false);
    expect(hasEntryCard({ wizard_state: { multiCity: false, destinations: [{ name: 'Rome' }] } })).toBe(false);
    expect(hasEntryCard({ wizard_state: { multiCity: false, destinations: [{ name: 'Rome' }], destination: { name: 'Tokyo' } } })).toBe(true);
  });

  it('is false when the trip or its wizard state is missing', () => {
    expect(hasEntryCard({ wizard_state: null })).toBe(false);
    expect(hasEntryCard({})).toBe(false);
    expect(hasEntryCard(null)).toBe(false);
    expect(hasEntryCard(undefined)).toBe(false);
  });

  it('does not look at the trip status', () => {
    expect(hasEntryCard({ status: 'generating', wizard_state: { destination: { name: 'Tokyo' } } })).toBe(true);
  });

  it('always answers with a boolean', () => {
    expect(hasEntryCard({ wizard_state: { multiCity: true, destinations: [{}, {}, {}] } })).toBe(true);
    expect(hasEntryCard({ wizard_state: { multiCity: true, destinations: [] } })).toBe(false);
  });

  it('does not change its input', () => {
    const trip = deepFreeze({ wizard_state: { multiCity: true, destinations: [{ name: 'Rome' }] } });
    expect(hasEntryCard(trip)).toBe(true);
    expect(trip).toEqual({ wizard_state: { multiCity: true, destinations: [{ name: 'Rome' }] } });
  });
});

// Moved from js/components/trip-detail.js in task F11a, pinned to the functions as they stood there.
describe('countSectionCards', () => {
  const dest = { wizard_state: { destination: { name: 'Lisbon' } } };
  it('counts one card for flights or transport, one for entry and one for stays', () => {
    expect(countSectionCards({ flights: {}, accommodation: [{}] }, dest)).toBe(3);
    expect(countSectionCards({ transport: {} }, dest)).toBe(2);
    expect(countSectionCards({ flights: {}, transport: {} }, { wizard_state: {} })).toBe(1);
  });
  it('counts nothing for missing extras, an empty stay list and a trip with no destination', () => {
    expect(countSectionCards(undefined, { wizard_state: {} })).toBe(0);
    expect(countSectionCards(null, null)).toBe(0);
    expect(countSectionCards({ accommodation: [] }, { wizard_state: {} })).toBe(0);
    expect(countSectionCards({ accommodation: 'hotel' }, { wizard_state: {} })).toBe(0);
  });
  it('leaves its arguments alone', () => {
    expect(() => countSectionCards(deepFreeze({ flights: {}, accommodation: [{}] }), deepFreeze({ wizard_state: { destination: {} } }))).not.toThrow();
  });
});

describe('findActivity', () => {
  const trip = deepFreeze({
    itinerary_days: [
      { id: 'd1', activities: [{ id: 'a1' }, { id: 'a2' }] },
      { id: 'd2' },
      { id: 'd3', activities: [{ id: 'a3' }] },
    ],
  });
  it('finds an activity with its day, its list and its place in it', () => {
    const found = findActivity(trip, 'a2');
    expect(found.day).toBe(trip.itinerary_days[0]);
    expect(found.acts).toBe(trip.itinerary_days[0].activities);
    expect(found.idx).toBe(1);
    expect(found.activity).toBe(trip.itinerary_days[0].activities[1]);
    expect(findActivity(trip, 'a3').idx).toBe(0);
  });
  it('answers null when it is not there, and for a trip with no days', () => {
    expect(findActivity(trip, 'zz')).toBeNull();
    expect(findActivity({}, 'a1')).toBeNull();
    expect(findActivity({ itinerary_days: [] }, undefined)).toBeNull();
  });
});
