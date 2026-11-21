// stuck.js: when a sticky element counts as pinned (blueprint 4.2, 8.3), and the bar's real height
// published as --tv-bar-h on the trip root (ruling R31). The rules are pure; the observers run here on
// stand-ins for the element, the window and ResizeObserver, and in a browser on the fixture page.
// Owner: F6.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isStuck, observeStuck, heightValue, observeBarHeight, BAR_HEIGHT_VAR } from './stuck.js';

const at = (over = {}) => ({ sticky: true, top: 0, bottom: 56, line: 0, scrollY: 400, ...over });

describe('isStuck', () => {
  it('is pinned when a sticky element sits on its line and the page has scrolled', () => {
    expect(isStuck(at())).toBe(true);
    expect(isStuck(at({ top: 0.4 }))).toBe(true);
  });
  it('is not pinned while the element is still below its line', () => {
    expect(isStuck(at({ top: 26, bottom: 82, scrollY: 30 }))).toBe(false);
    expect(isStuck(at({ top: 300, bottom: 354, line: 56 }))).toBe(false);
  });
  it('is pinned under another pinned row: the line is that row\'s height', () => {
    expect(isStuck(at({ top: 56, bottom: 110, line: 56 }))).toBe(true);
  });
  it('is not pinned at the top of an unscrolled page, even when it already sits on its line', () => {
    expect(isStuck(at({ scrollY: 0 }))).toBe(false);
  });
  it('is never pinned when the element is not sticky (a docked tab row, a bar a view lets scroll away)', () => {
    expect(isStuck(at({ sticky: false }))).toBe(false);
  });
  it('with a `past` element, waits until that element has gone up behind it', () => {
    expect(isStuck(at({ pastBottom: 320 }))).toBe(false);
    expect(isStuck(at({ pastBottom: 56 }))).toBe(true);
    expect(isStuck(at({ pastBottom: -40 }))).toBe(true);
    expect(isStuck(at({ pastBottom: null }))).toBe(true);
  });
  it('reads missing or broken numbers as not pinned', () => {
    expect(isStuck(at({ top: NaN }))).toBe(false);
    expect(isStuck(at({ line: undefined }))).toBe(false);
    expect(isStuck({})).toBe(false);
    expect(isStuck()).toBe(false);
  });
});

describe('observeStuck', () => {
  it('returns a cleanup function and does nothing without an element or a window', () => {
    const stop = observeStuck(null);
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
    expect(() => observeStuck({ nodeType: 1 })()).not.toThrow();
  });
});

// ---- Stand-ins: only what stuck.js reads and writes ----
function fakeStyle() {
  const values = new Map();
  return {
    values,
    setProperty: (name, value) => { values.set(name, value); },
    removeProperty: (name) => { values.delete(name); },
    getPropertyValue: (name) => values.get(name) ?? '',
  };
}
const fakeRoot = () => ({ style: fakeStyle() });
function fakeEl(root, height, { classes = ['tv-bar'], connected = true } = {}) {
  const attrs = new Set();
  const el = {
    height,
    isConnected: connected,
    getBoundingClientRect: () => ({ top: 0, bottom: el.height, height: el.height }),
    closest: (selector) => (selector === '.td-wrap' ? root : null),
    matches: (selector) => classes.some((name) => selector === `.${name}`),
    hasAttribute: (name) => attrs.has(name),
    toggleAttribute: (name, on) => { if (on) attrs.add(name); else attrs.delete(name); },
    removeAttribute: (name) => { attrs.delete(name); },
  };
  return el;
}
class FakeResizeObserver {
  static made = [];
  constructor(callback) { this.callback = callback; this.targets = []; this.options = []; FakeResizeObserver.made.push(this); }
  observe(target, options) { this.targets.push(target); this.options.push(options); }
  disconnect() { this.targets = []; }
  /** The browser reports a size change of what is observed. */
  fire() { if (this.targets.length) this.callback(this.targets.map((target) => ({ target })), this); }
}
function fakeWindow() {
  const listeners = [];
  return {
    scrollY: 0,
    listeners,
    addEventListener: (type, fn, opts) => {
      const entry = { type, fn };
      listeners.push(entry);
      opts?.signal?.addEventListener('abort', () => listeners.splice(listeners.indexOf(entry), 1));
    },
    fire: (type) => listeners.filter((entry) => entry.type === type).forEach((entry) => entry.fn()),
  };
}
function browser({ resizeObserver = true } = {}) {
  FakeResizeObserver.made = [];
  const win = fakeWindow();
  vi.stubGlobal('window', win);
  vi.stubGlobal('ResizeObserver', resizeObserver ? FakeResizeObserver : undefined);
  vi.stubGlobal('getComputedStyle', () => ({ position: 'sticky', top: '0px' }));
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  return win;
}
const published = (root) => root.style.getPropertyValue(BAR_HEIGHT_VAR);
afterEach(() => { vi.unstubAllGlobals(); });

describe('heightValue', () => {
  it('writes a measured height as a CSS length, to a hundredth of a pixel', () => {
    expect(heightValue(56)).toBe('56px');
    expect(heightValue(71.4)).toBe('71.4px');
    expect(heightValue(71.40625)).toBe('71.41px');
    expect(heightValue(133.796875)).toBe('133.8px');
  });
  it('gives nothing for a box that is not laid out or not measured, so the sheet keeps its fallback', () => {
    expect(heightValue(0)).toBe('');
    expect(heightValue(-4)).toBe('');
    expect(heightValue(NaN)).toBe('');
    expect(heightValue(Infinity)).toBe('');
    expect(heightValue(undefined)).toBe('');
    expect(heightValue('56')).toBe('');
  });
});

describe('observeBarHeight (ruling R31)', () => {
  it('names the variable trip.css reads', () => {
    expect(BAR_HEIGHT_VAR).toBe('--tv-bar-h');
  });
  it('publishes the real height of the bar on the trip root at once', () => {
    browser();
    const root = fakeRoot();
    observeBarHeight(fakeEl(root, 71.4));
    expect(published(root)).toBe('71.4px');
  });
  it('watches the border box of the bar and follows it when the title wraps or unwraps', () => {
    browser();
    const root = fakeRoot();
    const bar = fakeEl(root, 56);
    observeBarHeight(bar);
    const [observer] = FakeResizeObserver.made;
    expect(observer.targets).toEqual([bar]);
    expect(observer.options).toEqual([{ box: 'border-box' }]);
    bar.height = 133.8;
    observer.fire();
    expect(published(root)).toBe('133.8px');
    bar.height = 56;
    observer.fire();
    expect(published(root)).toBe('56px');
  });
  it('takes the value away while the bar is not laid out, and keeps it when the bar has left the page', () => {
    browser();
    const root = fakeRoot();
    const bar = fakeEl(root, 88);
    observeBarHeight(bar);
    const [observer] = FakeResizeObserver.made;
    bar.height = 0;
    observer.fire();
    expect(published(root)).toBe('');
    bar.height = 88;
    observer.fire();
    expect(published(root)).toBe('88px');
    bar.isConnected = false;
    bar.height = 0;
    observer.fire();
    expect(published(root)).toBe('88px');
  });
  it('cleans up: stops watching and removes the variable, and a second call does nothing', () => {
    browser();
    const root = fakeRoot();
    const bar = fakeEl(root, 71.4);
    const stop = observeBarHeight(bar);
    const [observer] = FakeResizeObserver.made;
    stop();
    expect(published(root)).toBe('');
    expect(observer.targets).toEqual([]);
    root.style.setProperty(BAR_HEIGHT_VAR, '60px');
    expect(() => stop()).not.toThrow();
    expect(published(root)).toBe('60px');
  });
  it('after a re-render, cleaning up the old bar leaves the value of the new bar in place', () => {
    browser();
    const root = fakeRoot();
    const stopOld = observeBarHeight(fakeEl(root, 56));
    const stopNew = observeBarHeight(fakeEl(root, 71.4));
    expect(published(root)).toBe('71.4px');
    stopOld();
    expect(published(root)).toBe('71.4px');
    stopNew();
    expect(published(root)).toBe('');
  });
  it('can publish on another element', () => {
    browser();
    const root = fakeRoot();
    const other = fakeRoot();
    const stop = observeBarHeight(fakeEl(root, 64), { on: other });
    expect(published(other)).toBe('64px');
    expect(published(root)).toBe('');
    stop();
    expect(published(other)).toBe('');
  });
  it('without ResizeObserver, measures once and again when the window is resized', () => {
    const win = browser({ resizeObserver: false });
    const root = fakeRoot();
    const bar = fakeEl(root, 56);
    const stop = observeBarHeight(bar);
    expect(published(root)).toBe('56px');
    bar.height = 71.4;
    win.fire('resize');
    expect(published(root)).toBe('71.4px');
    stop();
    expect(win.listeners).toEqual([]);
    expect(published(root)).toBe('');
  });
  it('does nothing without a bar, a trip root or a window', () => {
    expect(() => observeBarHeight(fakeEl(fakeRoot(), 56))()).not.toThrow();
    browser();
    expect(() => observeBarHeight(null)()).not.toThrow();
    expect(() => observeBarHeight(fakeEl(null, 56))()).not.toThrow();
    expect(() => observeBarHeight({ nodeType: 1 })()).not.toThrow();
    expect(FakeResizeObserver.made).toEqual([]);
  });
});

describe('observeStuck and the bar height', () => {
  it('publishes the height of the trip bar by itself, and stops when it is cleaned up', () => {
    const win = browser();
    const root = fakeRoot();
    const bar = fakeEl(root, 71.4);
    const stop = observeStuck(bar);
    expect(published(root)).toBe('71.4px');
    stop();
    expect(published(root)).toBe('');
    expect(win.listeners).toEqual([]);
    expect(FakeResizeObserver.made[0].targets).toEqual([]);
  });
  it('does not publish for the tab row or any other element', () => {
    browser();
    const root = fakeRoot();
    observeStuck(fakeEl(root, 54, { classes: ['td-tabs'] }));
    expect(published(root)).toBe('');
    expect(FakeResizeObserver.made).toEqual([]);
  });
  it('takes the choice as an option: height false for a bar, height true for another element', () => {
    browser();
    const root = fakeRoot();
    observeStuck(fakeEl(root, 71.4), { height: false });
    expect(published(root)).toBe('');
    observeStuck(fakeEl(root, 48, { classes: ['stub-bar'] }), { height: true });
    expect(published(root)).toBe('48px');
  });
  it('still marks a pinned bar with data-stuck', () => {
    const win = browser();
    win.scrollY = 300;
    const bar = fakeEl(fakeRoot(), 56);
    const stop = observeStuck(bar);
    expect(bar.hasAttribute('data-stuck')).toBe(true);
    stop();
    expect(bar.hasAttribute('data-stuck')).toBe(false);
  });
});
