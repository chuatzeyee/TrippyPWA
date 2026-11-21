// view-picker.js: the view picker, the one-time chooser and Undo (blueprint 6.8). Owner: F5.
import { describe, it, expect } from 'vitest';
import { viewPickerHtml, viewChooserHtml, undoBaseline, startUndo, pickFailedText, scrollLeftFor, VIEW_CHOICES, UNDO_QUIET_MS } from './view-picker.js';
import { parseHtml, all, attr, textOf, classesOf } from '../fixtures/checks/html-tree.js';
import { markupRules } from '../fixtures/checks/markup-rules.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  return root;
};
const IDS = ['departures', 'concierge', 'atlas'];

describe('VIEW_CHOICES', () => {
  it('holds the three views with the names and sentences of the blueprint', () => {
    expect(VIEW_CHOICES.map((view) => view.id)).toEqual(IDS);
    expect(VIEW_CHOICES.map((view) => view.name)).toEqual(['Departures', 'Concierge', 'Atlas']);
    expect(VIEW_CHOICES.map((view) => view.sentence)).toEqual([
      'Your own departures board. Precise and data-forward.', 'A morning briefing. Calm and editorial.', 'A map and a logbook.',
    ]);
  });
  it('says the same as the registry', async (ctx) => {
    let meta;
    try { ({ VIEW_META: meta } = await import('../registry.js')); } catch { ctx.skip(); }
    if (!meta) ctx.skip();
    for (const view of VIEW_CHOICES) expect({ ...meta[view.id] }).toMatchObject({ id: view.id, name: view.name, sentence: view.sentence });
  });
});

describe('viewPickerHtml', () => {
  it.each(IDS)('is a fieldset of three native radios with %s selected', (current) => {
    const root = tree(viewPickerHtml({ current, theme: 'dark', size: 'full' }));
    const [fieldset] = all(root, 'fieldset');
    expect(textOf(all(fieldset, 'legend')[0])).toBe('View');
    const radios = all(fieldset, 'input');
    expect(radios.map((radio) => attr(radio, 'value'))).toEqual(IDS);
    expect(radios.every((radio) => attr(radio, 'type') === 'radio' && attr(radio, 'name') === 'view')).toBe(true);
    expect(radios.filter((radio) => attr(radio, 'checked') !== null).map((radio) => attr(radio, 'value'))).toEqual([current]);
    expect(radios.map((radio) => attr(radio, 'data-focus-key'))).toEqual(IDS.map((id) => `view-${id}`));
    const cards = all(fieldset, 'label');
    expect(cards).toHaveLength(3);
    for (const [i, card] of cards.entries()) {
      expect(all(card, 'input')).toHaveLength(1);
      expect(textOf(all(card, '.ui-picker-name')[0])).toBe(VIEW_CHOICES[i].name);
      expect(textOf(all(card, '.ui-picker-sentence')[0])).toBe(VIEW_CHOICES[i].sentence);
    }
    const marked = cards.filter((card) => classesOf(card).includes('is-current'));
    expect(marked).toHaveLength(1);
    expect(attr(all(marked[0], 'input')[0], 'value')).toBe(current);
    expect(all(fieldset, '.ui-picker-current').map(textOf)).toEqual(['Current']);
  });
  it.each(['dark', 'light'])('shows the preview set for the %s theme, as plain lazy images', (theme) => {
    const images = all(tree(viewPickerHtml({ current: 'atlas', theme, size: 'full' })), 'img');
    expect(images.map((img) => attr(img, 'src'))).toEqual(IDS.map((id) => `/img/views/${id}-${theme}.webp`));
    for (const img of images) {
      expect(attr(img, 'loading')).toBe('lazy');
      expect(attr(img, 'decoding')).toBe('async');
      expect(attr(img, 'alt')).toBe('');
      expect(attr(img, 'width')).toBe('240');
      expect(attr(img, 'height')).toBe('300');
    }
  });
  it('is smaller in the compact size', () => {
    const root = tree(viewPickerHtml({ current: 'atlas', theme: 'dark', size: 'compact' }));
    expect(classesOf(all(root, 'fieldset')[0])).toContain('ui-picker--compact');
    expect(attr(all(root, 'img')[0], 'width')).toBe('96');
    expect(attr(all(root, 'img')[0], 'height')).toBe('120');
    expect(classesOf(all(tree(viewPickerHtml({ current: 'atlas', theme: 'dark', size: 'full' })), 'fieldset')[0])).toContain('ui-picker--full');
  });
  it('keeps a designed placeholder in the reserved box behind each image', () => {
    const root = tree(viewPickerHtml({ current: 'atlas', theme: 'dark' }));
    expect(all(root, '.ui-picker-none')).toHaveLength(3);
    expect(all(tree(viewPickerHtml({ current: 'atlas', images: false })), 'img')).toHaveLength(0);
    expect(all(tree(viewPickerHtml({ current: 'atlas', images: false })), '.ui-picker-none')).toHaveLength(3);
  });
  it('has a polite status line and a hidden Undo button outside the radio group', () => {
    const root = tree(viewPickerHtml({ current: 'atlas', theme: 'dark' }));
    const [status] = all(root, '[data-picker-status]');
    expect(attr(status, 'role')).toBe('status');
    expect(textOf(status)).toBe('');
    const [undo] = all(root, 'button[data-picker-undo]');
    expect(attr(undo, 'hidden')).toBe('');
    expect(textOf(undo)).toBe('Undo');
    expect(attr(undo, 'data-focus-key')).toBe('view-undo');
    expect(all(all(root, 'fieldset')[0], 'button')).toHaveLength(0);
  });
  it('falls back to safe values for a theme, a size, a view or a base it does not know', () => {
    const root = tree(viewPickerHtml({ current: HOSTILE, theme: HOSTILE, size: HOSTILE, baseUrl: 'javascript:alert(1)//' }));
    expect(all(root, 'input').filter((radio) => attr(radio, 'checked') !== null)).toHaveLength(0);
    expect(attr(all(root, 'img')[0], 'src')).toBe('/img/views/departures-dark.webp');
    expect(classesOf(all(root, 'fieldset')[0])).toContain('ui-picker--full');
    expect(viewPickerHtml()).toContain('fieldset');
  });
  it('serves the images from the app base', () => {
    expect(attr(all(tree(viewPickerHtml({ current: 'atlas', theme: 'light', baseUrl: '/trippy/' })), 'img')[0], 'src')).toBe('/trippy/img/views/departures-light.webp');
  });
  it('escapes the names of the views it is given', () => {
    const root = tree(viewPickerHtml({ current: 'x', views: [{ id: 'x', name: HOSTILE, sentence: HOSTILE }] }));
    expect(all(root, 'img')).toHaveLength(1);
    expect(textOf(all(root, '.ui-picker-name')[0])).toBe(HOSTILE);
    expect(textOf(all(root, '.ui-picker-sentence')[0])).toBe(HOSTILE);
    expect(all(tree(viewPickerHtml({ current: 'x', views: [{ id: HOSTILE, name: 'X', sentence: '' }] })), 'img')).toHaveLength(0);
  });
});

describe('viewChooserHtml', () => {
  it.each(IDS)('is a labelled section with an h2, the compact picker, the note and one button, with %s on', (current) => {
    const root = tree(viewChooserHtml({ current, theme: 'dark' }));
    const [section] = all(root, 'section');
    const [h2] = all(section, 'h2');
    expect(textOf(h2)).toBe('Pick how Trippy looks');
    expect(attr(section, 'aria-labelledby')).toBe(attr(h2, 'id'));
    expect(attr(section, 'data-view-chooser')).toBe('');
    expect(classesOf(all(section, 'fieldset')[0])).toContain('ui-picker--compact');
    expect(textOf(section)).toContain('You can change this any time in Settings.');
    const buttons = all(section, 'button[data-action="chooser-done"]');
    expect(buttons).toHaveLength(1);
    const name = VIEW_CHOICES.find((view) => view.id === current).name;
    expect(textOf(buttons[0])).toBe(`Keep ${name}`);
    expect(attr(buttons[0], 'data-focus-key')).toBe('chooser-done');
    expect(textOf(all(section, '[data-picker-status]')[0])).toBe(`You can pick how Trippy looks. ${name} is on.`);
    expect(all(root, 'h1')).toHaveLength(0);
    expect(all(root, '[data-region]')).toHaveLength(0);
  });
  it('reads Done once the selection has changed', () => {
    expect(textOf(all(tree(viewChooserHtml({ current: 'atlas', changed: true })), 'button[data-action="chooser-done"]')[0])).toBe('Done');
  });
});

describe('undoBaseline', () => {
  const start = startUndo('departures');
  const change = (view, at) => ({ type: 'change', view, at });
  it('starts with nothing to undo', () => {
    expect(start).toEqual({ baseline: 'departures', current: 'departures', open: false, lastAt: null });
  });
  it('keeps the baseline while the arrow keys walk through the views', () => {
    const state = [change('concierge', 1000), change('atlas', 1300)].reduce(undoBaseline, start);
    expect(state.current).toBe('atlas');
    expect(state.baseline).toBe('departures');
  });
  it('moves the baseline after 1.5 seconds without a change', () => {
    const state = [change('concierge', 1000), change('atlas', 1000 + UNDO_QUIET_MS)].reduce(undoBaseline, start);
    expect(state.baseline).toBe('concierge');
    expect(state.current).toBe('atlas');
    expect(UNDO_QUIET_MS).toBe(1500);
  });
  it('moves the baseline when the timer says the picker has settled', () => {
    const state = [change('concierge', 1000), { type: 'settle' }, change('atlas', 1200)].reduce(undoBaseline, start);
    expect(state.baseline).toBe('concierge');
  });
  it('moves the baseline when focus leaves the group and when it comes back', () => {
    const left = [change('concierge', 1000), { type: 'blur' }, change('atlas', 1100)].reduce(undoBaseline, start);
    expect(left.baseline).toBe('concierge');
    const back = [change('concierge', 1000), { type: 'focus' }, change('atlas', 1100)].reduce(undoBaseline, start);
    expect(back.baseline).toBe('concierge');
  });
  it('does not lose the baseline to a wait: Undo works at any pace', () => {
    const state = [change('atlas', 1000), { type: 'settle' }, { type: 'blur' }].reduce(undoBaseline, start);
    expect(state.baseline).toBe('departures');
    expect(state.current).toBe('atlas');
  });
  it('undoes to the baseline, once', () => {
    const picked = [change('concierge', 1000), change('atlas', 1200)].reduce(undoBaseline, start);
    const undone = undoBaseline(picked, { type: 'undo' });
    expect(undone.current).toBe('departures');
    expect(undone.baseline).toBe('departures');
    expect(undoBaseline(undone, { type: 'undo' })).toEqual(undone);
  });
  it('ignores a change to the view that is already on, and an event it does not know', () => {
    expect(undoBaseline(start, change('departures', 500))).toEqual(start);
    expect(undoBaseline(start, { type: 'nope' })).toEqual(start);
    expect(undoBaseline(start, null)).toEqual(start);
  });
  it('picks the baseline up again when a pick fails and is taken back', () => {
    const picked = undoBaseline(start, change('atlas', 1000));
    const reverted = undoBaseline(picked, { type: 'revert', view: 'departures' });
    expect(reverted.current).toBe('departures');
    expect(reverted.baseline).toBe('departures');
  });
  it('never changes the state it was given', () => {
    const frozen = Object.freeze({ ...start });
    expect(() => [change('concierge', 1), { type: 'blur' }, { type: 'undo' }, { type: 'settle' }, { type: 'focus' }].reduce(undoBaseline, frozen)).not.toThrow();
    expect(frozen).toEqual(start);
  });
});

describe('two pickers on one page', () => {
  it('can use another radio group name, so they do not uncheck each other', () => {
    const root = tree(viewPickerHtml({ current: 'atlas', name: 'view-b' }));
    expect(all(root, 'input').every((radio) => attr(radio, 'name') === 'view-b')).toBe(true);
    expect(all(tree(viewChooserHtml({ current: 'atlas', name: 'view-c' })), 'input').every((radio) => attr(radio, 'name') === 'view-c')).toBe(true);
    expect(attr(all(tree(viewPickerHtml({ current: 'atlas', name: HOSTILE })), 'input')[0], 'name')).toBe('view');
  });
});

describe('pickFailedText', () => {
  it('says the view could not load and names the view that is still on (blueprint 5.5)', () => {
    expect(pickFailedText('Atlas')).toBe('That view could not load. You are still on Atlas.');
    expect(VIEW_CHOICES.map((view) => pickFailedText(view.name))).toEqual([
      'That view could not load. You are still on Departures.',
      'That view could not load. You are still on Concierge.',
      'That view could not load. You are still on Atlas.',
    ]);
  });
  it('says only that the view could not load when no view is known to be on', () => {
    for (const name of ['', '   ', null, undefined]) expect(pickFailedText(name)).toBe('That view could not load.');
  });
  it('keeps the copy rules', () => {
    expect(pickFailedText('Atlas')).not.toMatch(/[\u2013\u2014\u00B7\u2022\u2026]/);
  });
});

describe('scrollLeftFor (the current card of the compact row is brought into view)', () => {
  const row = { width: 358, scrollWidth: 790, scrollLeft: 0, left: 16 };
  it('scrolls to a card that is off screen, centred, and never past either end', () => {
    expect(scrollLeftFor(row, { left: 16 + 532, width: 250 })).toBe(432);       // the third card: the end of the row
    expect(scrollLeftFor(row, { left: 16 + 266, width: 250 })).toBe(212);       // the second card, cut off: centred
    expect(scrollLeftFor({ ...row, scrollLeft: 432 }, { left: 16 - 432, width: 250 })).toBe(0);
  });
  it('leaves a card that is in view alone, and a row that does not scroll', () => {
    expect(scrollLeftFor(row, { left: 16, width: 250 })).toBeNull();
    expect(scrollLeftFor({ ...row, scrollLeft: 432 }, { left: 16 + 100, width: 250 })).toBeNull();
    expect(scrollLeftFor({ ...row, scrollWidth: 358 }, { left: 600, width: 250 })).toBeNull();
  });
  it('is safe without a row, a card or numbers', () => {
    expect(scrollLeftFor(null, { left: 0, width: 1 })).toBeNull();
    expect(scrollLeftFor(row, null)).toBeNull();
    expect(scrollLeftFor({ ...row, width: NaN }, { left: 0, width: 1 })).toBeNull();
  });
});
