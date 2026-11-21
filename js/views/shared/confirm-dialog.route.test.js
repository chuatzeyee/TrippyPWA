// confirm-dialog.js: the dialog closes when the route changes under it (final pass, minor). Owner: SH.
// The page is a small stand-in: only what confirmDialog() touches.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { confirmDialog } from './confirm-dialog.js';

function standIn() {
  const node = () => {
    const heard = {};
    return {
      heard, removed: false, disabled: false, value: '',
      classList: { add() {} },
      addEventListener: (type, fn) => { heard[type] = fn; },
      removeEventListener: () => {},
      querySelectorAll: () => [],
      contains: () => false,
      focus() {},
      remove() { this.removed = true; },
    };
  };
  const parts = { '[data-confirm-backdrop]': node(), '[data-confirm]': node(), '[data-confirm-ok]': node(), '[data-confirm-cancel]': node() };
  parts['[data-confirm]'].querySelector = (selector) => parts[selector] ?? null;
  const holder = { innerHTML: '', querySelector: (selector) => parts[selector] ?? null };
  const windowHeard = new Map();
  const win = {
    addEventListener: (type, fn) => windowHeard.set(type, fn),
    removeEventListener: (type, fn) => { if (windowHeard.get(type) === fn) windowHeard.delete(type); },
  };
  const doc = { createElement: () => holder, body: { append() {} }, activeElement: null, addEventListener() {}, removeEventListener() {} };
  return { parts, win, doc, windowHeard };
}

describe('confirmDialog and the route', () => {
  let page;
  beforeEach(() => {
    page = standIn();
    vi.stubGlobal('document', page.doc);
    vi.stubGlobal('window', page.win);
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('answers no and goes away when the route changes under it (Back while it is open)', async () => {
    const answer = confirmDialog({ title: 'Delete this trip?', danger: true });
    expect(page.windowHeard.has('hashchange')).toBe(true);
    page.windowHeard.get('hashchange')();
    await expect(answer).resolves.toBe(false);
    vi.runAllTimers();
    expect(page.parts['[data-confirm]'].removed).toBe(true);
    expect(page.parts['[data-confirm-backdrop]'].removed).toBe(true);
    expect(page.windowHeard.has('hashchange')).toBe(false);
  });

  it('stops listening for the route once it is answered', async () => {
    const answer = confirmDialog({ title: 'Delete this trip?' });
    page.parts['[data-confirm-ok]'].heard.click();
    await expect(answer).resolves.toBe(true);
    expect(page.windowHeard.has('hashchange')).toBe(false);
  });
});
