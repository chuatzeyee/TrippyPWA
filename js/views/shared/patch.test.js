// patch.js: the pure half of the patching rules (blueprint 3.5). The DOM half (patchRegions,
// carryOver) is proven in a browser on the fixture page. Owner: F5.
import { describe, it, expect } from 'vitest';
import { diffRegions, planKeyedMorph, decideOpen, planPatch } from './patch.js';

/** Applies the steps to a list of keys the way patchRegions applies them to child nodes. */
function apply(oldKeys, steps) {
  let list = [...oldKeys];
  for (const step of steps) {
    if (step.op === 'remove') { list = list.filter((key) => key !== step.key); continue; }
    if (step.op === 'keep') continue;
    list = list.filter((key) => key !== step.key);
    const at = step.before === null ? list.length : list.indexOf(step.before);
    expect(at).toBeGreaterThanOrEqual(0);
    list.splice(at, 0, step.key);
  }
  return list;
}
const ops = (steps, op) => steps.filter((step) => step.op === op).map((step) => step.key);

describe('diffRegions', () => {
  it('names the regions whose markup changed, in the order of the new markup', () => {
    const before = { lead: '<span>, Sam</span>', live: '<ul></ul>', next: '<div>a</div>', trips: '<div>t</div>' };
    const after = { lead: '<span>, Sam</span>', live: '<ul><li>x</li></ul>', next: '<div>a</div>', trips: '<div>t2</div>' };
    expect(diffRegions(before, after)).toEqual(['live', 'trips']);
  });
  it('gives nothing when nothing changed', () => {
    const map = { lead: 'a', live: 'b' };
    expect(diffRegions(map, { ...map })).toEqual([]);
  });
  it('counts a region that is new as changed, and leaves out one that is gone', () => {
    expect(diffRegions({ live: 'a', hops: 'h' }, { live: 'a', stats: 's' })).toEqual(['stats']);
  });
  it('reads Map objects as well as plain objects, and missing maps as empty', () => {
    expect(diffRegions(new Map([['live', 'a']]), new Map([['live', 'b'], ['next', 'n']]))).toEqual(['live', 'next']);
    expect(diffRegions(null, { live: 'a' })).toEqual(['live']);
    expect(diffRegions({ live: 'a' }, null)).toEqual([]);
  });
  it('does not change its arguments', () => {
    const before = Object.freeze({ live: 'a' });
    const after = Object.freeze({ live: 'b' });
    expect(() => diffRegions(before, after)).not.toThrow();
  });
});

describe('planKeyedMorph', () => {
  it('keeps every node when the keys are the same', () => {
    const steps = planKeyedMorph(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(ops(steps, 'keep')).toEqual(['c', 'b', 'a']);
    expect(steps.every((step) => step.op === 'keep')).toBe(true);
  });
  it('inserts added keys before the node that follows them', () => {
    const steps = planKeyedMorph(['a', 'c'], ['a', 'b', 'c', 'd']);
    expect(ops(steps, 'insert').sort()).toEqual(['b', 'd']);
    expect(steps.find((step) => step.key === 'b').before).toBe('c');
    expect(steps.find((step) => step.key === 'd').before).toBeNull();
    expect(ops(steps, 'keep').sort()).toEqual(['a', 'c']);
    expect(apply(['a', 'c'], steps)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('removes missing keys first', () => {
    const steps = planKeyedMorph(['a', 'b', 'c'], ['a', 'c']);
    expect(steps[0]).toEqual({ op: 'remove', key: 'b' });
    expect(ops(steps, 'keep').sort()).toEqual(['a', 'c']);
    expect(apply(['a', 'b', 'c'], steps)).toEqual(['a', 'c']);
  });
  it('moves as few nodes as it can when the order changes', () => {
    const steps = planKeyedMorph(['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c']);
    expect(ops(steps, 'move')).toEqual(['d']);
    expect(ops(steps, 'keep').sort()).toEqual(['a', 'b', 'c']);
    expect(apply(['a', 'b', 'c', 'd'], steps)).toEqual(['d', 'a', 'b', 'c']);
  });
  it('handles kept, added, removed and reordered keys together', () => {
    const before = ['seville', 'dublin', 'marrakech', 'vancouver'];
    const after = ['vancouver', 'seville', 'porto', 'marrakech'];
    const steps = planKeyedMorph(before, after);
    expect(ops(steps, 'remove')).toEqual(['dublin']);
    expect(ops(steps, 'insert')).toEqual(['porto']);
    expect(ops(steps, 'move')).toEqual(['vancouver']);
    expect(ops(steps, 'keep').sort()).toEqual(['marrakech', 'seville']);
    expect(apply(before, steps)).toEqual(after);
  });
  it('fills an empty list and empties a full one', () => {
    expect(apply([], planKeyedMorph([], ['a', 'b']))).toEqual(['a', 'b']);
    expect(planKeyedMorph(['a', 'b'], [])).toEqual([{ op: 'remove', key: 'a' }, { op: 'remove', key: 'b' }]);
    expect(planKeyedMorph([], [])).toEqual([]);
  });
  it('reaches the new order for every arrangement of a small list', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    let seed = 7;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const pick = () => pool.filter(() => random() < 0.7).sort(() => random() - 0.5);
    for (let i = 0; i < 300; i += 1) {
      const before = pick();
      const after = pick();
      const steps = planKeyedMorph(before, after);
      expect(apply(before, steps)).toEqual(after);
      const moved = ops(steps, 'move').length;
      const kept = ops(steps, 'keep').length;
      expect(moved + kept).toBe(after.filter((key) => before.includes(key)).length);
    }
  });
  it('gives null when a key repeats or is missing, so the caller replaces the content', () => {
    expect(planKeyedMorph(['a', 'a'], ['a'])).toBeNull();
    expect(planKeyedMorph(['a'], ['b', 'b'])).toBeNull();
    expect(planKeyedMorph(['a', ''], ['a'])).toBeNull();
    expect(planKeyedMorph(['a'], [null])).toBeNull();
  });
  it('does not change its arguments', () => {
    const before = Object.freeze(['a', 'b']);
    const after = Object.freeze(['b', 'a']);
    expect(() => planKeyedMorph(before, after)).not.toThrow();
  });
});

describe('decideOpen', () => {
  it('keeps what the user did while the markup says the same as before', () => {
    expect(decideOpen({ live: true, was: false, wants: false })).toBe(true);
    expect(decideOpen({ live: false, was: true, wants: true })).toBe(false);
  });
  it('follows the markup when the markup changed its mind', () => {
    expect(decideOpen({ live: false, was: false, wants: true })).toBe(true);
    expect(decideOpen({ live: true, was: true, wants: false })).toBe(false);
  });
  it('follows the markup outright when the caller says the markup decides', () => {
    expect(decideOpen({ live: false, was: true, wants: true, fromMarkup: true })).toBe(true);
    expect(decideOpen({ live: true, was: false, wants: false, fromMarkup: true })).toBe(false);
    expect(decideOpen({ live: false, was: null, wants: true, fromMarkup: true })).toBe(true);
  });
  it('never closes an open group when the earlier markup is not known', () => {
    expect(decideOpen({ live: true, was: null, wants: false })).toBe(true);
    expect(decideOpen({ live: false, was: null, wants: true })).toBe(true);
    expect(decideOpen({ live: false, was: null, wants: false })).toBe(false);
  });
});

describe('planPatch', () => {
  const region = (over) => ({ name: 'next', applied: null, live: '<div data-region="next">a</div>', fresh: '<div data-region="next">a</div>', busy: false, waiting: false, ...over });
  const A = '<div data-region="next">Checking</div>';
  const B = '<div data-region="next">Nothing to file</div>';

  it('skips a region whose new markup is the markup last applied to it', () => {
    expect(planPatch([region({ applied: B, live: B, fresh: B })])).toEqual([{ name: 'next', action: 'skip', drop: false }]);
  });
  it('patches a region whose new markup differs from what was applied', () => {
    expect(planPatch([region({ applied: A, live: A, fresh: B })])).toEqual([{ name: 'next', action: 'patch', drop: false }]);
  });
  it('trusts what was applied over the page, which the user may have changed since', () => {
    const opened = '<div data-region="next"><details open></details></div>';
    const closed = '<div data-region="next"><details></details></div>';
    expect(planPatch([region({ applied: closed, live: opened, fresh: closed })])[0].action).toBe('skip');
  });
  it('compares with the page itself when nothing was applied to the element', () => {
    // A full render into the same root makes new region elements. Whatever was applied to the old
    // element of the same name says nothing about the new one: the page shows A, the model wants B.
    expect(planPatch([region({ applied: null, live: A, fresh: B })])[0].action).toBe('patch');
    expect(planPatch([region({ applied: undefined, live: A, fresh: B })])[0].action).toBe('patch');
    expect(planPatch([region({ applied: null, live: A, fresh: A })])[0].action).toBe('skip');
  });
  it('defers a changed region that holds an open dialog', () => {
    expect(planPatch([region({ applied: A, fresh: B, busy: true })])).toEqual([{ name: 'next', action: 'defer', drop: false }]);
    expect(planPatch([region({ applied: A, fresh: B, busy: true, waiting: true })])).toEqual([{ name: 'next', action: 'defer', drop: false }]);
  });
  it('drops the waiting patch when the markup is back to what is applied', () => {
    // Patch B waits for the dialog to close; then the model goes back to A, which is on the page.
    expect(planPatch([region({ applied: A, fresh: A, busy: true, waiting: true })])).toEqual([{ name: 'next', action: 'skip', drop: true }]);
  });
  it('drops the waiting patch when a newer one is applied at once', () => {
    expect(planPatch([region({ applied: A, fresh: B, busy: false, waiting: true })])).toEqual([{ name: 'next', action: 'patch', drop: true }]);
  });
  it('has nothing to drop when nothing waits', () => {
    expect(planPatch([region({ applied: A, fresh: A }), region({ applied: A, fresh: B })]).map((step) => step.drop)).toEqual([false, false]);
  });
  it('decides each region on its own, in the order given', () => {
    const plan = planPatch([
      region({ name: 'lead', applied: A, fresh: A }),
      region({ name: 'next', applied: A, fresh: B }),
      region({ name: 'bar-actions', applied: A, fresh: B, busy: true }),
    ]);
    expect(plan.map((step) => [step.name, step.action])).toEqual([['lead', 'skip'], ['next', 'patch'], ['bar-actions', 'defer']]);
    expect(planPatch([])).toEqual([]);
  });
  it('does not change its arguments', () => {
    const regions = Object.freeze([Object.freeze(region({ applied: A, fresh: B, waiting: true }))]);
    expect(() => planPatch(regions)).not.toThrow();
  });
});
