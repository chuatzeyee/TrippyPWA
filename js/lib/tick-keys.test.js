import { describe, it, expect } from 'vitest';
import { checklistKey, legacyChecklistKey, QUICK_KEYS } from './tick-keys.js';

// Every expected key in this file is a literal, recorded from the functions as
// they stood in js/components/trip-detail.js before they moved to js/lib. Ticks
// are saved on the device under these exact strings (checklist-<tripId> and
// trip-quick-<tripId>), so a key that changes would silently untick a saved
// checklist. The labels are invented.

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('checklistKey', () => {
  it('gives the stored key for a group, label and deadline', () => {
    expect(checklistKey('Restaurants', { label: 'Book dinner at Sushi Saito', by: '2026-05-01' })).toBe('ck-1f8vjdl');
    expect(checklistKey('Attractions', { label: 'teamLab Planets (timed entry)', by: '2026-04-20' })).toBe('ck-1bbuipq');
    expect(checklistKey('Transport', { label: 'JR Pass' })).toBe('ck-1jo3jj1');
  });

  it('gives the same label a different key in another group', () => {
    expect(checklistKey('Attractions', { label: 'Book dinner at Sushi Saito', by: '2026-05-01' })).toBe('ck-wmhhqj');
  });

  it('gives the same label a different key for another deadline', () => {
    expect(checklistKey('Restaurants', { label: 'Book dinner at Sushi Saito', by: '2026-05-02' })).toBe('ck-1eewqao');
  });

  it('treats a missing, empty or null deadline alike', () => {
    expect(checklistKey('Restaurants', { label: 'Book dinner at Sushi Saito' })).toBe('ck-1ngz1rv');
    expect(checklistKey('Restaurants', { label: 'Book dinner at Sushi Saito', by: '' })).toBe('ck-1ngz1rv');
    expect(checklistKey('Restaurants', { label: 'Book dinner at Sushi Saito', by: null })).toBe('ck-1ngz1rv');
  });

  it('reads only the group, the label and the deadline', () => {
    const item = { label: 'teamLab Planets (timed entry)', by: '2026-04-20', day: 3, note: 'Morning slot', url: 'https://example.com/t' };
    expect(checklistKey('Attractions', item)).toBe('ck-1bbuipq');
  });

  it('keeps labels in other scripts apart, where the legacy key cannot', () => {
    expect(checklistKey('予約', { label: '築地で寿司', by: '2026-05-03' })).toBe('ck-1wht6oo');
    expect(checklistKey('予約', { label: '浅草で天ぷら', by: '2026-05-03' })).toBe('ck-1isduz7');
    expect(checklistKey('Restaurants', { label: 'Café 🍣 night', by: '2026-05-01' })).toBe('ck-3aynnv');
  });

  it('treats a missing, empty or null group alike', () => {
    expect(checklistKey('', { label: 'JR Pass' })).toBe('ck-13gfs1c');
    expect(checklistKey(undefined, { label: 'JR Pass' })).toBe('ck-13gfs1c');
    expect(checklistKey(null, { label: 'JR Pass' })).toBe('ck-13gfs1c');
  });

  it('does not throw on a missing item', () => {
    expect(checklistKey('Transport', {})).toBe('ck-y1wk5e');
    expect(checklistKey('Transport', undefined)).toBe('ck-y1wk5e');
    expect(checklistKey('Transport', null)).toBe('ck-y1wk5e');
    expect(checklistKey(undefined, undefined)).toBe('ck-noieh1');
    expect(checklistKey('', {})).toBe('ck-noieh1');
  });

  it('joins the parts with a bar, so a bar inside a part is not told apart', () => {
    expect(checklistKey('a|b', { label: 'c', by: '' })).toBe('ck-1er8gkh');
    expect(checklistKey('a', { label: 'b|c', by: '' })).toBe('ck-1er8gkh');
  });

  it('always has the ck- prefix and a base 36 hash', () => {
    for (const [group, item] of [['Restaurants', { label: 'x' }], ['', {}], ['予約', { label: '築地で寿司' }]]) {
      expect(checklistKey(group, item)).toMatch(/^ck-[0-9a-z]{1,7}$/);
    }
  });

  it('does not change its input', () => {
    const item = deepFreeze({ label: 'Book dinner at Sushi Saito', by: '2026-05-01', day: 2 });
    expect(checklistKey('Restaurants', item)).toBe('ck-1f8vjdl');
    expect(item).toEqual({ label: 'Book dinner at Sushi Saito', by: '2026-05-01', day: 2 });
  });
});

describe('legacyChecklistKey', () => {
  it('gives the label slug that older ticks were saved under', () => {
    expect(legacyChecklistKey({ label: 'Book dinner at Sushi Saito' })).toBe('book-dinner-at-sushi-saito');
    expect(legacyChecklistKey({ label: 'JR Pass' })).toBe('jr-pass');
    expect(legacyChecklistKey({ label: 'UPPER lower 123' })).toBe('upper-lower-123');
  });

  it('turns every other character into one hyphen each, without collapsing or trimming', () => {
    expect(legacyChecklistKey({ label: 'teamLab Planets (timed entry)' })).toBe('teamlab-planets--timed-entry-');
    expect(legacyChecklistKey({ label: 'Day 2: Ghibli Museum, 10:00' })).toBe('day-2--ghibli-museum--10-00');
    expect(legacyChecklistKey({ label: '  Trailing  ' })).toBe('--trailing--');
  });

  it('reduces a label in another script to hyphens only', () => {
    expect(legacyChecklistKey({ label: '築地で寿司' })).toBe('-----');
    expect(legacyChecklistKey({ label: 'Café 🍣 night' })).toBe('caf-----night');
  });

  it('ignores the group and the deadline', () => {
    expect(legacyChecklistKey({ label: 'JR Pass', by: '2026-05-01' })).toBe('jr-pass');
  });

  it('is empty when there is no label, so the caller skips the legacy lookup', () => {
    expect(legacyChecklistKey({ label: '' })).toBe('');
    expect(legacyChecklistKey({})).toBe('');
    expect(legacyChecklistKey(undefined)).toBe('');
    expect(legacyChecklistKey(null)).toBe('');
  });

  it('does not change its input', () => {
    const item = deepFreeze({ label: 'JR Pass', by: '2026-05-01' });
    expect(legacyChecklistKey(item)).toBe('jr-pass');
    expect(item).toEqual({ label: 'JR Pass', by: '2026-05-01' });
  });
});

describe('QUICK_KEYS', () => {
  it('names the four ticks the Trip prep card saves in trip-quick-<tripId>', () => {
    expect(QUICK_KEYS).toEqual({
      flights: 'flights',
      transport: 'transport',
      accommodation: 'accommodation',
      reservations: 'reservations',
    });
  });

  it('cannot be changed by a caller', () => {
    expect(Object.isFrozen(QUICK_KEYS)).toBe(true);
  });
});
