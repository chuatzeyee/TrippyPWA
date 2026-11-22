// glance.js: the glance facts as a <dl> (blueprint 2.4, 3.4). Owner: F6.
import { describe, it, expect } from 'vitest';
import { glanceHtml } from './glance.js';
import { TRIP_FIXTURES } from '../fixtures/models.js';
import { parseHtml, all, attr, textOf, isElement } from '../fixtures/checks/html-tree.js';
import { markupRules, regionRules } from '../fixtures/checks/markup-rules.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const BANNED = /[\u2013\u2014\u00b7\u2022\u2026\u2192]/;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  expect(regionRules(root)).toEqual([]);
  return root;
};
const FACTS = TRIP_FIXTURES.upcoming.glance;
const factsOf = (root) => all(root, '.tv-fact');
const keysOf = (root) => factsOf(root).map((el) => attr(el, 'data-key'));
const fact = (root, key) => factsOf(root).find((el) => attr(el, 'data-key') === key);

describe('glanceHtml', () => {
  it('spells out the weather condition in the note (ruling R30): no "Pt. Cloudy"', () => {
    const weather = (note) => [{ key: 'weather', label: 'Typical weather', value: '17 to 22°C', note }];
    const noteOf = (note) => textOf(all(tree(glanceHtml(weather(note))), '.tv-fact-note')[0]);
    expect(noteOf('Pt. Cloudy, typical for early March')).toBe('Partly cloudy, typical for early March');
    expect(noteOf('Pt. Sunny, typical for late July')).toBe('Partly sunny, typical for late July');
    expect(noteOf('partly cloudy, typical for early March')).toBe('Partly cloudy, typical for early March');
    expect(noteOf('Rain, typical for mid May')).toBe('Rain, typical for mid May');
    expect(noteOf('typical for the season')).toBe('typical for the season');
    // Only the weather fact is read this way.
    const other = tree(glanceHtml([{ key: 'stay', label: 'Stay', value: 'Booked', note: 'Pt. Cloudy Inn, 2 nights' }]));
    expect(textOf(all(other, '.tv-fact-note')[0])).toBe('Pt. Cloudy Inn, 2 nights');
  });
  it('is one description list, the glance region, with a term and a description for every fact', () => {
    const root = tree(glanceHtml(FACTS));
    const top = root.children.filter(isElement);
    expect(top).toHaveLength(1);
    expect(top[0].tag).toBe('dl');
    expect(attr(top[0], 'data-region')).toBe('glance');
    expect(keysOf(root)).toEqual(FACTS.map((one) => one.key));
    for (const [i, el] of factsOf(root).entries()) {
      expect(el.tag).toBe('div');
      expect(el.parent).toBe(top[0]);
      expect(all(el, 'dt').map((dt) => textOf(dt))).toEqual([FACTS[i].label]);
      expect(all(el, 'dd')).toHaveLength(1);
      expect(textOf(all(el, '.tv-fact-value')[0])).toBe(FACTS[i].value);
      expect(attr(el, 'data-fact')).toBe(FACTS[i].key);
    }
  });
  it('prints the note of a fact, and no note element when there is none', () => {
    const root = tree(glanceHtml(FACTS));
    expect(textOf(all(fact(root, 'stops'), '.tv-fact-note')[0])).toBe('about 4 a day');
    expect(all(fact(root, 'pace'), '.tv-fact-note')).toHaveLength(0);
  });
  it('prints "per person" on the cost', () => {
    const root = tree(glanceHtml(FACTS));
    expect(textOf(fact(root, 'cost'))).toContain('per person');
    expect(textOf(fact(root, 'cost'))).toContain('~€390');
    expect(textOf(fact(root, 'cost'))).toContain('MAD 4,200');
  });
  it('adds "per person" to a cost whose note does not say it', () => {
    const plain = [{ key: 'cost', label: 'Estimated cost', value: 'MAD 4,200', note: '', jump: '' }];
    expect(textOf(all(tree(glanceHtml(plain)), '.tv-fact-note')[0])).toBe('per person, activities only');
    const other = [{ key: 'cost', label: 'Estimated cost', value: '~€390', note: 'MAD 4,200', jump: '' }];
    expect(textOf(all(tree(glanceHtml(other)), '.tv-fact-note')[0])).toBe('per person, activities only. MAD 4,200');
    const said = [{ key: 'cost', label: 'Estimated cost', value: '~€390 per person', note: 'MAD 4,200', jump: '' }];
    expect(textOf(all(tree(glanceHtml(said)), '.tv-fact-note')[0])).toBe('MAD 4,200');
    // Only the cost: another fact is never given the words.
    expect(textOf(tree(glanceHtml([{ key: 'stops', label: 'Stops', value: '31', note: '', jump: '' }])))).not.toContain('per person');
  });
  it('skips a missing fact: no entry, an empty value or an empty label', () => {
    const holes = [null, undefined, 'text', { key: 'pace', label: 'Pace', value: '', note: 'unused', jump: '' }, { key: 'stay', label: '', value: '4-star riad', note: '', jump: '' },
      { key: 'stops', label: 'Stops', value: '  ', note: '', jump: '' }, FACTS[3]];
    expect(keysOf(tree(glanceHtml(holes)))).toEqual(['weather']);
  });
  it('an imported plan has no Pace and no Stay, and the list is shorter', () => {
    expect(keysOf(tree(glanceHtml(TRIP_FIXTURES.imported.glance)))).toEqual(['ready', 'stops', 'cost', 'weather']);
  });
  it('returns nothing when no fact is left', () => {
    expect(glanceHtml([])).toBe('');
    expect(glanceHtml(null)).toBe('');
    expect(glanceHtml(undefined)).toBe('');
    expect(glanceHtml(TRIP_FIXTURES.failed.glance)).toBe('');
    expect(glanceHtml([{ key: 'pace', label: 'Pace', value: '', note: '', jump: '' }])).toBe('');
  });
  it('a fact that links to a section card is a section jump the controller understands', () => {
    const root = tree(glanceHtml(FACTS));
    const jumps = all(root, '[data-section-jump]');
    expect(jumps.map((el) => attr(el, 'data-section-jump'))).toEqual(['accommodation']);
    const [jump] = jumps;
    expect(jump.tag).toBe('button');
    expect(attr(jump, 'type')).toBe('button');
    expect(attr(jump, 'aria-controls')).toBe('td-section-accommodation');
    expect(attr(jump, 'aria-expanded')).toBe('false');
    expect(attr(jump, 'data-focus-key')).toBe('glance-stay');
    expect(textOf(jump)).toBe('4-star riad');
    expect(attr(jump, 'aria-label')).toBe('Stay: 4-star riad');
  });
  it('every section target becomes a jump; any other target is plain text unless the caller handles it', () => {
    const targets = ['flights', 'transport', 'accommodation', 'entry', 'checklist', 'readiness', 'spending', '', HOSTILE];
    const facts = targets.map((jump, i) => ({ key: FACTS[i % FACTS.length].key, label: `Fact ${i}`, value: `Value ${i}`, note: '', jump }));
    const root = tree(glanceHtml(facts));
    expect(all(root, '[data-section-jump]').map((el) => attr(el, 'data-section-jump'))).toEqual(['flights', 'transport', 'accommodation', 'entry', 'checklist']);
    expect(all(root, 'button')).toHaveLength(5);
    expect(all(root, '[data-glance-jump]')).toHaveLength(0);
  });
  it('with `jumps`, the other targets the caller names become buttons with data-glance-jump', () => {
    const root = tree(glanceHtml(FACTS, { jumps: ['readiness', 'spending'] }));
    const extra = all(root, 'button[data-glance-jump]');
    expect(extra.map((el) => attr(el, 'data-glance-jump'))).toEqual(['readiness', 'spending']);
    expect(extra.map((el) => attr(el, 'data-focus-key'))).toEqual(['glance-ready', 'glance-cost']);
    for (const el of extra) {
      expect(attr(el, 'data-section-jump')).toBe(null);
      expect(attr(el, 'aria-controls')).toBe(null);
    }
    expect(all(root, '[data-section-jump]')).toHaveLength(1);
  });
  it('with `keys`, shows those facts in that order and nothing else', () => {
    expect(keysOf(tree(glanceHtml(FACTS, { keys: ['cost', 'stops', 'weather', 'length'] })))).toEqual(['cost', 'stops', 'weather']);
    expect(glanceHtml(FACTS, { keys: [] })).toBe('');
  });
  it('can be drawn without the region, or under another name, for a second list on the page', () => {
    const none = tree(glanceHtml(FACTS, { region: false }));
    expect(all(none, '[data-region]')).toHaveLength(0);
    expect(tree(`${glanceHtml(FACTS, { keys: ['cost'] })}${glanceHtml(FACTS, { keys: ['stops'], region: false })}`)).toBeTruthy();
    expect(attr(all(tree(glanceHtml(FACTS, { label: 'The brief' })), 'dl')[0], 'aria-label')).toBe('The brief');
    expect(attr(all(tree(glanceHtml(FACTS)), 'dl')[0], 'aria-label')).toBe('At a glance');
  });
  it('escapes hostile text everywhere', () => {
    const root = tree(glanceHtml([{ key: HOSTILE, label: HOSTILE, value: HOSTILE, note: HOSTILE, jump: 'entry' }], { label: HOSTILE }));
    expect(all(root, 'img')).toHaveLength(0);
    expect(textOf(all(root, 'dt')[0])).toBe(HOSTILE);
    expect(textOf(all(root, '.tv-fact-note')[0])).toBe(HOSTILE);
  });
  it('does not change the facts it is given, and prints no banned glyph', () => {
    const frozen = Object.freeze(FACTS.map((one) => Object.freeze({ ...one })));
    expect(() => glanceHtml(frozen, { keys: Object.freeze(['cost']), jumps: Object.freeze(['spending']) })).not.toThrow();
    for (const model of Object.values(TRIP_FIXTURES)) expect(glanceHtml(model.glance)).not.toMatch(BANNED);
  });
});

describe('glanceHtml: splitAbout (a hook for the word "about")', () => {
  const COST = [{ key: 'cost', label: 'Estimated cost', value: '~€1,390', note: 'per person, activities only. MAD 14,200', jump: 'spending' }];
  const plain = [{ key: 'cost', label: 'Estimated cost', value: 'MAD 14,200', note: 'per person, activities only' }];

  it('leaves the markup alone unless asked', () => {
    const html = glanceHtml(COST);
    expect(html).toContain('<span class="tv-fact-value">~€1,390</span>');
    expect(html).not.toContain('tv-fact-about');
  });

  it('marks up the word and the figure, and the text, the note and the label of the value stay the same', () => {
    const root = tree(glanceHtml(COST, { splitAbout: true, jumps: ['spending'] }));
    const value = all(root, '.tv-fact-value')[0];
    expect(textOf(all(value, '.tv-fact-about')[0])).toBe('~');
    expect(textOf(all(value, '.tv-fact-figure')[0])).toBe('€1,390');
    expect(textOf(value).replace(/\s+/g, '')).toBe(textOf(all(tree(glanceHtml(COST, { jumps: ['spending'] })), '.tv-fact-value')[0]).replace(/\s+/g, ''));
    expect(attr(all(root, 'button[data-glance-jump="spending"]')[0], 'aria-label')).toBe('Estimated cost: ~€1,390');
    expect(textOf(all(root, '.tv-fact-note')[0])).toBe('per person, activities only. MAD 14,200');
  });

  it('touches nothing that is not a converted figure, and escapes the figure', () => {
    expect(glanceHtml(plain, { splitAbout: true })).toBe(glanceHtml(plain));
    expect(glanceHtml([{ key: 'cost', label: 'Cost', value: 'about' }], { splitAbout: true })).not.toContain('tv-fact-about');
    const hostile = glanceHtml([{ key: 'cost', label: 'Cost', value: `~${HOSTILE}` }], { splitAbout: true });
    expect(hostile).not.toContain('<img');
    expect(textOf(all(tree(hostile), '.tv-fact-figure')[0])).toBe(HOSTILE);
  });
});
