import { describe, it, expect } from 'vitest';
import { visaLine, timingLine, mergeRows, itemDates, entryDoneKey, entryHaveKey, needsHaveTick, addDays } from './entry-rules.js';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe('visaLine', () => {
  it('says the visa status plainly for every code', () => {
    expect(visaLine({ code: 'vf', stayDays: 90 })).toBe('Visa-free, up to 90 days');
    expect(visaLine({ code: 'vf' })).toBe('Visa-free');
    expect(visaLine({ code: 'vf', stayDays: null })).toBe('Visa-free');
    expect(visaLine({ code: 'voa', stayDays: 30 })).toBe('Visa on arrival');
    expect(visaLine({ code: 'eta' })).toBe('Travel authorisation needed before you fly');
    expect(visaLine({ code: 'ev' })).toBe('eVisa needed before you travel');
    expect(visaLine({ code: 'vr' })).toBe('Visa needed. Apply at an embassy or consulate well ahead');
    expect(visaLine({ code: 'na' })).toBe('Entry is restricted for this passport');
  });
  it('falls back to the stored label, then to nothing', () => {
    expect(visaLine({ code: 'xx', label: 'Special permit' })).toBe('Special permit');
    expect(visaLine({ code: 'xx' })).toBe('');
    expect(visaLine({})).toBe('');
    expect(visaLine(null)).toBe('');
    expect(visaLine(undefined)).toBe('');
  });
});

describe('timingLine', () => {
  it('words the filing window', () => {
    expect(timingLine({ dates: { from: '2027-01-10', by: '2027-01-12' } })).toBe('Do it between 10 Jan and 12 Jan');
    expect(timingLine({ dates: { from: '2027-01-10', by: '2027-01-10' } })).toBe("Do it on 10 Jan, it can't be done earlier");
    expect(timingLine({ dates: { from: '2027-12-03', by: null } })).toBe('Opens 3 Dec, do it before you arrive');
    expect(timingLine({ dates: { from: null, by: '2027-01-06' } })).toBe('Do it by 6 Jan');
  });
  it('is empty without dates', () => {
    expect(timingLine({ dates: { from: null, by: null } })).toBe('');
    expect(timingLine({ dates: {} })).toBe('');
    expect(timingLine({})).toBe('');
  });
});

describe('mergeRows', () => {
  const vf30 = { code: 'vf', stayDays: 30 };
  it('makes one row for passports with the same status and paperwork', () => {
    const rows = [
      { passport: 'SG', visa: vf30, items: [] },
      { passport: 'MY', visa: vf30, items: [] },
      { passport: 'IN', visa: { code: 'voa' }, items: [{ id: 'id-evoa' }] },
    ];
    const merged = mergeRows(rows);
    expect(merged.map(r => r.passports)).toEqual([['SG', 'MY'], ['IN']]);
    expect(merged[0]).toEqual({ sig: 'vf|30|', passport: 'SG', visa: vf30, items: [], passports: ['SG', 'MY'] });
    expect(merged[1].sig).toBe('voa||id-evoa');
  });
  it('keeps rows apart when the stay, the status or the items differ', () => {
    const item = { id: 'my-mdac' };
    const rows = [
      { passport: 'SG', visa: vf30, items: [] },
      { passport: 'US', visa: { code: 'vf', stayDays: 90 }, items: [] },
      { passport: 'IN', visa: vf30, items: [item] },
      { passport: 'PH', visa: vf30, items: [item] },
      { passport: 'CN', visa: null, items: [] },
      { passport: 'JP', visa: null, items: [] },
    ];
    expect(mergeRows(rows).map(r => [r.sig, r.passports])).toEqual([
      ['vf|30|', ['SG']], ['vf|90|', ['US']], ['vf|30|my-mdac', ['IN', 'PH']], ['||', ['CN', 'JP']],
    ]);
  });
  it('is empty for no rows and does not change the rows it is given', () => {
    expect(mergeRows([])).toEqual([]);
    const rows = deepFreeze([{ passport: 'SG', visa: vf30, items: [] }, { passport: 'MY', visa: vf30, items: [] }]);
    expect(mergeRows(rows).map(r => r.passports)).toEqual([['SG', 'MY']]);
  });
});

describe('itemDates', () => {
  it('computes the filing window before arrival', () => {
    expect(itemDates({ windowDays: 3, leadDays: 1 }, '2027-01-13')).toEqual({ from: '2027-01-10', by: '2027-01-12' });
    expect(itemDates({ windowDays: null, leadDays: 7 }, '2027-01-13')).toEqual({ from: null, by: '2027-01-06' });
    expect(itemDates({ windowDays: 3 }, '2027-01-13')).toEqual({ from: '2027-01-10', by: null });
    expect(itemDates({ windowDays: 0, leadDays: 0 }, '2028-03-01')).toEqual({ from: '2028-03-01', by: '2028-03-01' });
  });
  it('never asks for it before the window opens', () => {
    expect(itemDates({ windowDays: 3, leadDays: 5 }, '2027-03-01')).toEqual({ from: '2027-02-26', by: '2027-02-26' });
  });
  it('crosses month and leap-year ends', () => {
    expect(itemDates({ windowDays: 90, leadDays: 60 }, '2028-03-01')).toEqual({ from: '2027-12-02', by: '2028-01-01' });
    expect(itemDates({ leadDays: 1 }, '2028-03-01')).toEqual({ from: null, by: '2028-02-29' });
  });
  it('gives no dates without an arrival date or whole numbers of days', () => {
    expect(itemDates({ windowDays: 3, leadDays: 1 }, null)).toEqual({ from: null, by: null });
    expect(itemDates({ windowDays: 3, leadDays: 1 }, '')).toEqual({ from: null, by: null });
    expect(itemDates({ windowDays: '3', leadDays: 1.5 }, '2027-01-13')).toEqual({ from: null, by: null });
    expect(itemDates({}, '2027-01-01')).toEqual({ from: null, by: null });
  });
});

describe('entryDoneKey', () => {
  // The stored format: tripId:iso2:PASSPORT+PASSPORT:itemId (entry-done-<tripId> in localStorage).
  it('matches the keys already stored on devices', () => {
    expect(entryDoneKey('trip-1', 'MY', ['IN'], 'my-mdac')).toBe('trip-1:MY:IN:my-mdac');
    expect(entryDoneKey('3f2b8c1e-0d4a-4b7e-9c61-5a2e8f7d1b90', 'AU', ['SG'], 'au-eta')).toBe('3f2b8c1e-0d4a-4b7e-9c61-5a2e8f7d1b90:AU:SG:au-eta');
  });
  it('joins a group of passports with a plus sign, in the order of the row', () => {
    expect(entryDoneKey('trip-1', 'MY', ['IN', 'US'], 'my-mdac')).toBe('trip-1:MY:IN+US:my-mdac');
    expect(entryDoneKey('trip-1', 'FR', ['SG', 'US', 'JP'], 'eu-etias')).toBe('trip-1:FR:SG+US+JP:eu-etias');
  });
});

describe('entryHaveKey', () => {
  it('is the key of the "I have this" tick for one country and passport group', () => {
    expect(entryHaveKey('trip-1', 'US', ['IN'])).toBe('trip-1:US:IN:have');
    expect(entryHaveKey('trip-1', 'AU', ['IN', 'PH'])).toBe('trip-1:AU:IN+PH:have');
  });
  it('sits in the same store as the item ticks without ever being one of them', () => {
    // Item ids always start with a country prefix ("au-eta"), so "have" is free.
    expect(entryHaveKey('trip-1', 'AU', ['SG'])).toBe(entryDoneKey('trip-1', 'AU', ['SG'], 'have'));
    expect(entryHaveKey('trip-1', 'AU', ['SG'])).not.toBe(entryDoneKey('trip-1', 'AU', ['SG'], 'au-eta'));
  });
});

describe('needsHaveTick', () => {
  const required = (kind) => ({ id: `xx-${kind}`, kind, required: true });
  it('asks for it when a visa must come from an embassy', () => {
    expect(needsHaveTick({ passport: 'IN', visa: { code: 'vr' }, items: [] })).toBe(true);
    expect(needsHaveTick({ passport: 'IN', visa: { code: 'vr' }, items: [required('arrival-card')] })).toBe(true);
  });
  it('asks for it when an authorisation or eVisa has no required item to tick', () => {
    expect(needsHaveTick({ visa: { code: 'eta' }, items: [] })).toBe(true);
    expect(needsHaveTick({ visa: { code: 'ev' }, items: [] })).toBe(true);
    expect(needsHaveTick({ visa: { code: 'eta' }, items: [required('arrival-card')] })).toBe(true);
    expect(needsHaveTick({ visa: { code: 'eta' }, items: [{ id: 'xx-eta', kind: 'eta', required: false }] })).toBe(true);
    expect(needsHaveTick({ visa: { code: 'ev' }, items: [required('eta')] })).toBe(true);
  });
  it('does not when the matching required item is there to tick', () => {
    expect(needsHaveTick({ visa: { code: 'eta' }, items: [required('eta')] })).toBe(false);
    expect(needsHaveTick({ visa: { code: 'ev' }, items: [required('arrival-card'), required('evisa')] })).toBe(false);
  });
  it('does not for a status that needs nothing filed, or that no tick can settle', () => {
    expect(needsHaveTick({ visa: { code: 'vf', stayDays: 30 }, items: [] })).toBe(false);
    expect(needsHaveTick({ visa: { code: 'voa' }, items: [] })).toBe(false);
    expect(needsHaveTick({ visa: { code: 'na' }, items: [] })).toBe(false);
    expect(needsHaveTick({ visa: null, items: [] })).toBe(false);
    expect(needsHaveTick({ visa: { code: 'constructor' }, items: [] })).toBe(false);
    expect(needsHaveTick({ visa: { code: 'eta' } })).toBe(true);
    expect(needsHaveTick(null)).toBe(false);
    expect(needsHaveTick(undefined)).toBe(false);
  });
  it('gives the same answer for a merged row', () => {
    const rows = [{ passport: 'IN', visa: { code: 'vr' }, items: [] }, { passport: 'PH', visa: { code: 'vr' }, items: [] }];
    expect(mergeRows(rows).map(needsHaveTick)).toEqual([true]);
  });
});

describe('addDays', () => {
  it('moves a date by whole days across months and years', () => {
    expect(addDays('2027-01-13', -3)).toBe('2027-01-10');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(addDays('2027-06-15', 0)).toBe('2027-06-15');
  });
});
