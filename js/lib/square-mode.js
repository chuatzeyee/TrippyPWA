// Square-screen mode: a no-scroll, card-paging interface for square-aspect
// phones like the Unihertz Titan 2 (~1:1, ~416 CSS px tall).
//
// Effective state is the resolved combination of:
//   - auto detection (the same square aspect-ratio / short-height query the CSS
//     uses), and
//   - a persisted user override ('on' | 'off' | 'auto').
//
// When active, `<html>` gets `data-square-mode="on"`; CSS in square-display.css
// reacts, and screen renderers call `isSquareMode()` to emit card-deck markup
// instead of long scrolling pages.

const STORAGE_KEY = 'trippy-square-mode'; // 'auto' | 'on' | 'off'
const QUERY = '(min-aspect-ratio: 0.72/1) and (max-aspect-ratio: 1.12/1), (max-height: 600px)';

const listeners = new Set();
let mql = null;

function readOverride() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'on' || v === 'off' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function autoMatches() {
  try {
    return window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/** @returns {'auto'|'on'|'off'} the persisted user preference. */
export function getSquareOverride() {
  return readOverride();
}

/** @returns {boolean} whether the card-paging interface is currently active. */
export function isSquareMode() {
  const override = readOverride();
  if (override === 'on') return true;
  if (override === 'off') return false;
  return autoMatches();
}

function apply() {
  const on = isSquareMode();
  const root = document.documentElement;
  const was = root.getAttribute('data-square-mode') === 'on';
  if (on) root.setAttribute('data-square-mode', 'on');
  else root.removeAttribute('data-square-mode');
  if (on !== was) {
    for (const cb of listeners) {
      try { cb(on); } catch {}
    }
  }
}

/**
 * Cycle the override: auto -> on -> off -> auto. Persists and re-applies.
 * @returns {'auto'|'on'|'off'} the new override value.
 */
export function cycleSquareOverride() {
  const order = ['auto', 'on', 'off'];
  const next = order[(order.indexOf(readOverride()) + 1) % order.length];
  try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  apply();
  return next;
}

/**
 * Set the override explicitly.
 * @param {'auto'|'on'|'off'} value
 */
export function setSquareOverride(value) {
  const v = value === 'on' || value === 'off' ? value : 'auto';
  try { localStorage.setItem(STORAGE_KEY, v); } catch {}
  apply();
}

/**
 * Subscribe to effective-state changes (auto resize or override change).
 * @param {(on: boolean) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onSquareModeChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Initialise: set the attribute now and track viewport changes. Idempotent. */
export function initSquareMode() {
  if (!mql) {
    try {
      mql = window.matchMedia(QUERY);
      mql.addEventListener('change', apply);
    } catch {
      mql = null;
    }
  }
  apply();
}
