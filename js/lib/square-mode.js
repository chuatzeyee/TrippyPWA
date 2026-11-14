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
// Auto-detect genuinely square PHONE screens (e.g. Unihertz Titan 2 ~416x416).
// Require a near-1:1 aspect ratio AND a phone-sized width, so short desktop
// windows and landscape phones (wide, or short-but-wide) do NOT get card mode.
// A user can still force it on/off via the nav toggle.
// 768px cap covers the Titan 2's 1440x1440 panel at DPR 2 (720px CSS viewport).
const QUERY = '(min-aspect-ratio: 0.72/1) and (max-aspect-ratio: 1.12/1) and (max-width: 768px)';

const listeners = new Set();
let mql = null;
// Last accepted auto-detect result and the viewport width it was taken at.
// Renderers read this rather than the live query so markup always matches the
// <html> attribute, even while a viewport change is being ignored.
let autoOn = null;
let autoWidth = 0;
let recheckPending = false;
// Wait for the soft keyboard to finish closing before re-checking.
const KEYBOARD_SETTLE_MS = 400;
const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

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

function detectAuto() {
  autoOn = autoMatches();
  autoWidth = window.innerWidth;
}

// A focused text field means the on-screen keyboard is (or is about to be) up.
function isEditing() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !NON_TEXT_INPUTS.has((el.type || 'text').toLowerCase());
}

// Viewport changed. With interactive-widget=resizes-content, opening the Android
// keyboard shrinks the viewport height and can make a tall phone look square;
// flipping then would rebuild the view and destroy the field being typed in.
// So: ignore height-only changes while editing (the keyboard), and defer a real
// change (rotation) until editing ends.
function onViewportChange() {
  if (isEditing()) {
    if (window.innerWidth !== autoWidth) recheckPending = true;
    return;
  }
  recheckPending = false;
  detectAuto();
  apply();
}

function onFocusOut() {
  if (!recheckPending) return;
  setTimeout(() => {
    if (!recheckPending || isEditing()) return;
    recheckPending = false;
    detectAuto();
    apply();
  }, KEYBOARD_SETTLE_MS);
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
  if (autoOn === null) detectAuto();
  return autoOn;
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
      mql.addEventListener('change', onViewportChange);
      document.addEventListener('focusout', onFocusOut);
    } catch {
      mql = null;
    }
  }
  detectAuto();
  apply();
}
