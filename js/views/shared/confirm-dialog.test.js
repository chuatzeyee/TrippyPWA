// confirm-dialog.js: the markup and the typed-confirmation rule (blueprint 6.6). Focus, Escape and the
// promise are proven in a browser. Owner: F5.
import { describe, it, expect } from 'vitest';
import { confirmDialogHtml, typedMatches } from './confirm-dialog.js';
import { parseHtml, all, attr, textOf, classesOf } from '../fixtures/checks/html-tree.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  return root;
};

describe('confirmDialogHtml', () => {
  it('is a labelled modal dialog on the modal.css classes, with Cancel and the confirm button', () => {
    const root = tree(confirmDialogHtml({ title: 'Clear offline copies?', body: 'Saved trips will be removed from this device.', confirmLabel: 'Clear copies' }));
    const [modal] = all(root, '.modal');
    expect(attr(modal, 'role')).toBe('dialog');
    expect(attr(modal, 'aria-modal')).toBe('true');
    const [title] = all(modal, '.modal-title');
    expect(attr(modal, 'aria-labelledby')).toBe(attr(title, 'id'));
    expect(textOf(title)).toBe('Clear offline copies?');
    const [body] = all(modal, '.modal-text');
    expect(attr(modal, 'aria-describedby')).toBe(attr(body, 'id'));
    expect(textOf(body)).toBe('Saved trips will be removed from this device.');
    const buttons = all(modal, 'button');
    expect(buttons.map(textOf)).toEqual(['Cancel', 'Clear copies']);
    expect(buttons.every((button) => attr(button, 'type') === 'button')).toBe(true);
    expect(attr(buttons[0], 'data-confirm-cancel')).toBe('');
    expect(attr(buttons[1], 'data-confirm-ok')).toBe('');
    expect(attr(buttons[1], 'disabled')).toBeNull();
    expect(all(modal, 'input')).toHaveLength(0);
    expect(all(root, '.modal-backdrop')).toHaveLength(1);
  });
  it('marks a destructive confirmation', () => {
    const root = tree(confirmDialogHtml({ title: 'Delete this trip?', danger: true, confirmLabel: 'Delete trip' }));
    expect(attr(all(root, '.modal')[0], 'role')).toBe('alertdialog');
    expect(classesOf(all(root, 'button[data-confirm-ok]')[0])).toContain('modal-btn--danger');
  });
  it('asks for the word, with the input attributes that keep iOS out of the way', () => {
    const root = tree(confirmDialogHtml({ title: 'Delete all my trips?', danger: true, typed: 'DELETE', confirmLabel: 'Delete all' }));
    const [input] = all(root, 'input[data-confirm-typed]');
    expect(attr(input, 'type')).toBe('text');
    expect(attr(input, 'autocapitalize')).toBe('characters');
    expect(attr(input, 'autocomplete')).toBe('off');
    expect(attr(input, 'spellcheck')).toBe('false');
    expect(textOf(all(root, 'label')[0])).toContain('Type DELETE to confirm');
    expect(all(all(root, 'label')[0], 'input')).toHaveLength(1);
    expect(attr(all(root, 'button[data-confirm-ok]')[0], 'disabled')).toBe('');
  });
  it('has default labels and no body when none is given', () => {
    const root = tree(confirmDialogHtml({ title: 'Sure?' }));
    expect(all(root, 'button').map(textOf)).toEqual(['Cancel', 'Confirm']);
    expect(all(root, '.modal-text')).toHaveLength(0);
    expect(attr(all(root, '.modal')[0], 'aria-describedby')).toBeNull();
  });
  it('escapes hostile text', () => {
    const root = tree(confirmDialogHtml({ title: HOSTILE, body: HOSTILE, confirmLabel: HOSTILE, cancelLabel: HOSTILE, typed: HOSTILE }));
    expect(all(root, 'img')).toHaveLength(0);
    expect(textOf(all(root, '.modal-title')[0])).toBe(HOSTILE);
  });
  it('draws one paragraph per line of the body', () => {
    expect(all(tree(confirmDialogHtml({ title: 'T', body: 'One.\nTwo.' })), 'p')).toHaveLength(2);
    expect(textOf(all(tree(confirmDialogHtml({ title: 'T', body: 'One.\nTwo.' })), '.modal-text')[0])).toBe('One. Two.');
  });
});

describe('typedMatches', () => {
  it('compares without regard to case or outer spaces', () => {
    expect(typedMatches('DELETE', 'DELETE')).toBe(true);
    expect(typedMatches('delete', 'DELETE')).toBe(true);
    expect(typedMatches('  Delete ', 'DELETE')).toBe(true);
  });
  it('refuses anything else', () => {
    expect(typedMatches('DELET', 'DELETE')).toBe(false);
    expect(typedMatches('', 'DELETE')).toBe(false);
    expect(typedMatches(null, 'DELETE')).toBe(false);
    expect(typedMatches('DELETE NOW', 'DELETE')).toBe(false);
  });
  it('is true when no word is asked for', () => {
    expect(typedMatches('', null)).toBe(true);
    expect(typedMatches('anything', '')).toBe(true);
  });
});
