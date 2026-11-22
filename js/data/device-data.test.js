// What stays on a device after an account is deleted: nothing of Trippy, and everything of anyone else.
import { describe, it, expect } from 'vitest';
import { clearDeviceData, isTrippyKey } from './device-data.js';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    removeItem: (key) => { map.delete(key); },
    keys: () => [...map.keys()].sort(),
  };
}

const OURS = [
  'trippy-offline-trips', 'trippy-offline-trip:t1', 'trippy-offline-trip:t2', 'trippy-offline-trip-list', 'trippy-offline-trip-briefings',
  'trippy_prefs_v1', 'trippy-theme', 'trippy-view', 'trippy-motion', 'trippy-square-mode',
  'trippy_profile_cache', 'trippy_user_prefs', 'trippy_import_draft', 'trippy_trips',
  'trip-quick-t1', 'checklist-t1', 'entry-done-t1', 'towns-v1-t1',
];
const THEIRS = ['sb-abc-auth-token', 'other-app-setting', 'chunk-reload', 'trip', 'mytrippy-x'];

describe('clearDeviceData', () => {
  it('removes offline copies, briefings, prefs, the profile cache, ticks and town groups, and keeps other keys', () => {
    const local = memoryStorage(Object.fromEntries([...OURS, ...THEIRS].map((key) => [key, '1'])));
    expect(clearDeviceData({ stores: [local] })).toBe(OURS.length);
    expect(local.keys()).toEqual([...THEIRS].sort());
  });
  it('clears the tab storage too (the wizard draft and the per-tab markers)', () => {
    const local = memoryStorage({ 'trippy-theme': 'dark' });
    const session = memoryStorage({ trippy_wizard_state: '{}', 'trippy-cover-requested': '[]', 'trippy-concierge-hello': '1', 'chunk-reload': '1' });
    clearDeviceData({ stores: [local, session] });
    expect(local.keys()).toEqual([]);
    expect(session.keys()).toEqual(['chunk-reload']);
  });
  it('does not throw when a storage is missing, closed or refuses', () => {
    const closed = { get length() { throw new Error('denied'); }, key: () => null, removeItem: () => {} };
    const refusing = { length: 1, key: () => 'trippy-theme', removeItem: () => { throw new Error('denied'); } };
    expect(clearDeviceData({ stores: [null, closed, refusing] })).toBe(0);
    expect(() => clearDeviceData()).not.toThrow();
  });
});

describe('isTrippyKey', () => {
  it('matches by prefix only', () => {
    expect(isTrippyKey('trippy-theme')).toBe(true);
    expect(isTrippyKey('checklist-abc')).toBe(true);
    expect(isTrippyKey('my-checklist-abc')).toBe(false);
    expect(isTrippyKey(null)).toBe(false);
  });
});
