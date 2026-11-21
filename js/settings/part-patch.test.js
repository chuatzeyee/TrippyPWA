// Which parts of the Settings page a refresh redraws (blueprint 6: "patches the page in place and
// restores focus"). The DOM half is checked in the browser. Owner: F12.
import { describe, it, expect } from 'vitest';
import { partsToReplace } from './part-patch.js';

const KNOWN = Object.freeze({ theme: '<a>', square: '<b>', picker: '<p1>', name: '<n1>' });

describe('partsToReplace', () => {
  it('replaces nothing when nothing changed', () => {
    expect(partsToReplace(KNOWN, { ...KNOWN })).toEqual({ replace: [], adopt: [], held: [] });
  });
  it('replaces exactly the parts whose markup changed, in page order', () => {
    expect(partsToReplace(KNOWN, { ...KNOWN, square: '<b2>', theme: '<a2>' })).toEqual({ replace: ['theme', 'square'], adopt: [], held: [] });
  });
  it('a part that is new to the page is replaced', () => {
    expect(partsToReplace(KNOWN, { ...KNOWN, extra: '<x>' }).replace).toEqual(['extra']);
  });
  it('adopts a changed part the page has already drawn itself, without touching it', () => {
    expect(partsToReplace(KNOWN, { ...KNOWN, picker: '<p2>', theme: '<a2>' }, { adopt: ['picker'] })).toEqual({ replace: ['theme'], adopt: ['picker'], held: [] });
  });
  it('holds back a changed part someone is typing in, so it is tried again later', () => {
    expect(partsToReplace(KNOWN, { ...KNOWN, name: '<n2>', theme: '<a2>' }, { hold: ['name'] })).toEqual({ replace: ['theme'], adopt: [], held: ['name'] });
  });
  it('adopt and hold only matter for parts that changed, and adopt wins', () => {
    expect(partsToReplace(KNOWN, { ...KNOWN }, { adopt: ['picker'], hold: ['name'] })).toEqual({ replace: [], adopt: [], held: [] });
    expect(partsToReplace(KNOWN, { ...KNOWN, name: '<n2>' }, { adopt: ['name'], hold: ['name'] })).toEqual({ replace: [], adopt: ['name'], held: [] });
  });
  it('reads missing arguments as empty and changes none of them', () => {
    expect(partsToReplace(null, null)).toEqual({ replace: [], adopt: [], held: [] });
    const next = Object.freeze({ ...KNOWN, theme: '<a2>' });
    const adopt = Object.freeze(['picker']);
    partsToReplace(KNOWN, next, { adopt });
    expect(KNOWN.theme).toBe('<a>');
  });
});
