import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readTicks, clearTicksFor, TICKS_EVENT } from './tick-store.js';
import { checklistKey, legacyChecklistKey, QUICK_KEYS } from '../lib/tick-keys.js';
import { entryDoneKey, entryHaveKey } from '../lib/entry-rules.js';

// The three stores are written by the trip page (checklist-<id>, trip-quick-<id>)
// and the entry card (entry-done-<id>). The formats are already on devices.
// Trip ids, labels and passports here are invented.

function memoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

const put = (key, value) => localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
const keys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).sort();

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('TICKS_EVENT', () => {
  it('is the event name every tick writer dispatches', () => {
    expect(TICKS_EVENT).toBe('trippy:ticks');
  });
});

describe('readTicks', () => {
  it('gives three empty stores for a trip with nothing saved', () => {
    expect(readTicks('t1')).toEqual({ quick: {}, checklist: {}, entryDone: {} });
  });

  it('reads the three stores of one trip from their three keys', () => {
    put('trip-quick-t1', { [QUICK_KEYS.flights]: true, [QUICK_KEYS.accommodation]: false });
    put('checklist-t1', { 'ck-abc': true });
    put('entry-done-t1', { [entryDoneKey('t1', 'au', ['SG', 'MY'], 'au-eta')]: true });
    expect(readTicks('t1')).toEqual({
      quick: { flights: true, accommodation: false },
      checklist: { 'ck-abc': true },
      entryDone: { 't1:au:SG+MY:au-eta': true },
    });
  });

  it("never reads another trip's ticks, also when one id is the start of another", () => {
    put('trip-quick-t1', { flights: true });
    put('trip-quick-t10', { transport: true });
    put('checklist-t10', { 'ck-x': true });
    put('entry-done-t10', { 't10:jp:SG:have': true });
    expect(readTicks('t1')).toEqual({ quick: { flights: true }, checklist: {}, entryDone: {} });
    expect(readTicks('t10').quick).toEqual({ transport: true });
  });

  it('gives empty ticks for corrupt JSON, one store at a time', () => {
    put('trip-quick-t1', '{"flights":tru');
    put('checklist-t1', 'not json at all');
    put('entry-done-t1', { 't1:au:SG:au-eta': true });
    expect(readTicks('t1')).toEqual({ quick: {}, checklist: {}, entryDone: { 't1:au:SG:au-eta': true } });
  });

  it('gives empty ticks for stored values that are not an object', () => {
    for (const bad of ['null', '[]', '["flights"]', '"flights"', '7', 'true', '']) {
      put('trip-quick-t1', bad);
      put('checklist-t1', bad);
      put('entry-done-t1', bad);
      expect(readTicks('t1'), bad).toEqual({ quick: {}, checklist: {}, entryDone: {} });
    }
  });

  it('keeps legacy checklist keys readable next to the new ones', () => {
    const item = { label: 'Book dinner at the harbour', by: '2031-03-01' };
    const other = { label: 'Museum pass' };
    put('checklist-t1', {
      [legacyChecklistKey(item)]: true,
      [checklistKey('Must book', other)]: false,
      [legacyChecklistKey(other)]: true,
    });
    const { checklist } = readTicks('t1');
    expect(checklist['book-dinner-at-the-harbour']).toBe(true);
    // The rule the trip page applies: the new key decides when it is there,
    // else the legacy label key.
    const ticked = (group, it) => {
      const key = checklistKey(group, it);
      const legacy = legacyChecklistKey(it);
      return key in checklist ? Boolean(checklist[key]) : Boolean(legacy && checklist[legacy]);
    };
    expect(ticked('Must book', item)).toBe(true);
    expect(ticked('Must book', other)).toBe(false);
  });

  it('reads the "I have this" tick from the entry store', () => {
    put('entry-done-t1', { [entryHaveKey('t1', 'cn', ['SG'])]: true });
    expect(readTicks('t1').entryDone['t1:cn:SG:have']).toBe(true);
  });

  it('gives a new object every time, so a caller cannot change what the next one reads', () => {
    put('trip-quick-t1', { flights: true });
    const first = readTicks('t1');
    first.quick.flights = false;
    first.checklist.added = true;
    expect(readTicks('t1')).toEqual({ quick: { flights: true }, checklist: {}, entryDone: {} });
  });

  it('gives empty ticks without an id, and when storage is missing or throws', () => {
    put('trip-quick-undefined', { flights: true });
    put('trip-quick-', { flights: true });
    for (const none of [undefined, null, '']) expect(readTicks(none)).toEqual({ quick: {}, checklist: {}, entryDone: {} });

    vi.stubGlobal('localStorage', { getItem() { throw new Error('denied'); } });
    expect(readTicks('t1')).toEqual({ quick: {}, checklist: {}, entryDone: {} });
    vi.stubGlobal('localStorage', undefined);
    expect(readTicks('t1')).toEqual({ quick: {}, checklist: {}, entryDone: {} });
  });
});

describe('clearTicksFor', () => {
  beforeEach(() => {
    for (const id of ['t1', 't2', 't10', 'shared']) {
      put(`trip-quick-${id}`, { flights: true });
      put(`checklist-${id}`, { 'ck-a': true });
      put(`entry-done-${id}`, { [`${id}:au:SG:au-eta`]: true });
    }
    put('trippy_user_prefs', { theme: 'dark' });
  });

  it("removes the three keys of each given trip and leaves every other trip's ticks", () => {
    clearTicksFor(['t1', 't2']);
    expect(keys()).toEqual([
      'checklist-shared', 'checklist-t10', 'entry-done-shared', 'entry-done-t10',
      'trip-quick-shared', 'trip-quick-t10', 'trippy_user_prefs',
    ]);
    expect(readTicks('t1')).toEqual({ quick: {}, checklist: {}, entryDone: {} });
    expect(readTicks('t10').quick).toEqual({ flights: true });
    expect(readTicks('shared').entryDone).toEqual({ 'shared:au:SG:au-eta': true });
  });

  it('removes nothing for an empty list, a missing list or empty ids', () => {
    const before = keys();
    clearTicksFor([]);
    clearTicksFor(undefined);
    clearTicksFor(null);
    clearTicksFor(['', null, undefined]);
    expect(keys()).toEqual(before);
  });

  it('takes a single id as well as a list, and copes with ids that have no ticks', () => {
    clearTicksFor('t2');
    clearTicksFor(['never-opened']);
    expect(keys().filter(k => k.endsWith('-t2'))).toEqual([]);
    expect(keys().filter(k => k.endsWith('-t1'))).toHaveLength(3);
  });

  it('does not change the list it was given, and does not throw when storage does', () => {
    const ids = Object.freeze(['t1']);
    clearTicksFor(ids);
    expect(ids).toEqual(['t1']);
    vi.stubGlobal('localStorage', { removeItem() { throw new Error('denied'); } });
    expect(() => clearTicksFor(['t2'])).not.toThrow();
    vi.stubGlobal('localStorage', undefined);
    expect(() => clearTicksFor(['t2'])).not.toThrow();
  });
});
