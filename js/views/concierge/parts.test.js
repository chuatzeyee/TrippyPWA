// The markup pieces the Concierge renderers share.
import { describe, it, expect } from 'vitest';
import { DASHBOARD_FIXTURES, CTX_FIXTURE } from '../fixtures/models.js';
import { all, attr, classesOf, parseHtml, textOf } from '../fixtures/checks/html-tree.js';
import { cardLink, costHtml, creditSlot, enter, flagOf, ghost, planButtons, secHead, sharedLine, stopHtml, tripAttrs, weatherWords } from './parts.js';

const tree = (html) => parseHtml(html).root;
const card = DASHBOARD_FIXTURES.ready.cardsById['s-marrakech'];

describe('enter', () => {
  it('gives the entry classes on a first render only, and never with reduced motion', () => {
    expect(enter(CTX_FIXTURE, 2)).toBe('con-enter con-enter--2');
    expect(enter({ ...CTX_FIXTURE, animate: false }, 2)).toBe('');
    expect(enter({ ...CTX_FIXTURE, reducedMotion: true }, 2)).toBe('');
    expect(enter(null)).toBe('');
  });
  it('keeps the step inside the delays the skin has', () => {
    expect(enter(CTX_FIXTURE, 40)).toBe('con-enter con-enter--6');
    expect(enter(CTX_FIXTURE, -3)).toBe('con-enter con-enter--0');
  });
});

describe('ghost', () => {
  it('is hidden from assistive technology and escapes its text', () => {
    const el = tree(ghost('<b>10 to 20</b>')).children[0];
    expect(attr(el, 'aria-hidden')).toBe('true');
    expect(textOf(el)).toBe('<b>10 to 20</b>');
    expect(all(el, 'b')).toHaveLength(0);
  });
});

describe('secHead', () => {
  it('draws the title, an optional count and one sentence', () => {
    const head = tree(secHead({ id: 'x-h', title: 'Upcoming', count: 3, line: 'Soonest first.', key: 'head' })).children[0];
    expect(attr(head, 'data-key')).toBe('head');
    expect(attr(all(head, 'h2')[0], 'id')).toBe('x-h');
    expect(textOf(all(head, '.con-n')[0])).toBe('3');
    expect(textOf(all(head, 'p')[0])).toBe('Soonest first.');
  });
  it('keeps the count out of the name of the heading: a space before it, and unspoken', () => {
    const html = secHead({ id: 'x-h', title: 'Past plans', count: 7 });
    const h2 = all(tree(html), 'h2')[0];
    expect(attr(all(h2, '.con-n')[0], 'aria-hidden')).toBe('true');
    expect(textOf(h2)).toBe('Past plans 7');
    expect(html).toContain('Past plans <span');
  });
  it('says the count in words for a screen reader, ahead of the sentence, when it is given the words', () => {
    const head = tree(secHead({ id: 'x-h', title: 'Past plans', count: 7, countText: '7 plans', line: 'Newest first.' })).children[0];
    const line = all(head, 'p.con-sec-line')[0];
    expect(textOf(line).replace(/\s+/g, ' ')).toBe('7 plans. Newest first.');
    expect(classesOf(all(line, 'span')[0])).toContain('ui-vh');
    const alone = tree(secHead({ id: 'x-h', title: 'Upcoming', count: 1, countText: '1 plan' })).children[0];
    expect(textOf(all(alone, 'p.con-sec-line')[0]).trim()).toBe('1 plan.');
    expect(all(tree(secHead({ id: 'x-h', title: 'Upcoming', countText: '1 plan' })), 'p')).toHaveLength(0);
  });
  it('leaves out what it is not given', () => {
    const head = tree(secHead({ id: 'x-h', title: 'Day by day' })).children[0];
    expect(attr(head, 'data-key')).toBeNull();
    expect(all(head, '.con-n')).toHaveLength(0);
    expect(all(head, 'p')).toHaveLength(0);
  });
});

describe('creditSlot', () => {
  it('holds the shared credit chip for a cover that has a credit', () => {
    const slot = tree(creditSlot(card.cover));
    expect(all(slot, '.con-credit')).toHaveLength(1);
    expect(textOf(all(slot, '.ui-credit')[0])).toBe('Wikimedia Commons');
  });
  it('is empty without a photo or without a credit', () => {
    expect(creditSlot({ ...card.cover, kind: 'none', src: '' })).toBe('');
    expect(creditSlot({ ...card.cover, credit: null })).toBe('');
    expect(creditSlot(null)).toBe('');
  });
});

describe('sharedLine', () => {
  it('says what the user may do with a plan someone else owns', () => {
    expect(textOf(tree(sharedLine({ shared: true, role: 'viewer' })))).toBe('Shared with you. You can view it.');
    expect(textOf(tree(sharedLine({ shared: true, role: 'editor' })))).toBe('Shared with you. You can edit it.');
    expect(sharedLine({ shared: false, role: null })).toBe('');
  });
});

describe('costHtml and weatherWords', () => {
  it('prints one cost line, or nothing', () => {
    expect(textOf(tree(costHtml(card.cost)))).toBe('~€390 per person (MAD 4,200)');
    expect(textOf(tree(costHtml(card.cost, 'x', { short: true })))).toBe('~€390 per person');
    expect(costHtml(null)).toBe('');
  });
  it('spells the condition out beside the range', () => {
    expect(weatherWords({ range: '5 to 14°C', condition: 'Pt. Cloudy' })).toBe('5 to 14°C, partly cloudy');
    expect(weatherWords({ range: '5 to 14°C', condition: '' })).toBe('5 to 14°C');
    expect(weatherWords(null)).toBe('');
  });
});

describe('stopHtml and flagOf', () => {
  it('puts the time before the title, when there is one', () => {
    expect(textOf(tree(stopHtml({ time: '11:30 AM', title: 'Gardens & <tea>' })))).toBe('11:30 AM Gardens & <tea>');
    expect(stopHtml({ time: null, title: 'Churros' })).toBe('Churros');
  });
  it('draws the first flag only, and nothing for a code that is not one', () => {
    expect(all(tree(flagOf(['ma', 'es'])), 'img')).toHaveLength(1);
    expect(flagOf([])).toBe('');
    expect(flagOf(['not a flag'])).toBe('');
  });
});

describe('planButtons', () => {
  it('carries both hooks with focus keys of their place', () => {
    const row = tree(planButtons(DASHBOARD_FIXTURES.ready, 'top')).children[0];
    expect(classesOf(row)).toContain('con-actions--top');
    expect(all(row, 'button').map((el) => [attr(el, 'data-action'), attr(el, 'data-focus-key')])).toEqual([['new-trip', 'top-new-trip'], ['import-trip', 'top-import-trip']]);
  });
  it('gives Plan a trip the lead colour only when no plan runs', () => {
    const lead = (model) => classesOf(all(tree(planButtons(model, 'below')), '[data-action="new-trip"]')[0]).includes('con-btn--cta');
    expect(lead(DASHBOARD_FIXTURES.ready)).toBe(false);
    expect(lead(DASHBOARD_FIXTURES.noLive)).toBe(true);
    expect(lead(DASHBOARD_FIXTURES.empty)).toBe(true);
    expect(lead(DASHBOARD_FIXTURES.error)).toBe(false);
  });
});

describe('cardLink and tripAttrs', () => {
  it('the stretched link uses the neutral href and names the plan', () => {
    const a = tree(cardLink(card)).children[0];
    expect(classesOf(a)).toContain('trip-card-link');
    expect(attr(a, 'href')).toBe(card.href);
    expect(attr(a, 'aria-label')).toBe(`Open ${card.title}`);
  });
  it('a trip element carries its id twice, its state, and the pending mark while a briefing is awaited', () => {
    const el = (html) => tree(`<i${html}></i>`).children[0];
    expect(el(tripAttrs(card)).attrs).toEqual({ 'data-trip-id': 's-marrakech', 'data-key': 's-marrakech' });
    expect(attr(el(tripAttrs({ ...card, briefingPending: true })), 'data-briefing')).toBe('pending');
    const failed = el(tripAttrs({ ...card, briefingPending: true }, 'failed'));
    expect(attr(failed, 'data-trip-state')).toBe('failed');
    expect(attr(failed, 'data-briefing')).toBeNull();
  });
});
