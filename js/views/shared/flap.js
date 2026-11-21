// Split-flap digits (blueprint 1.3). The cells reuse the classic .flap-* markup and its CSS
// (css/components/dashboard.css); they are hidden from assistive technology, and a visually hidden
// copy of the real number sits beside them. Owner: F5.
import { cls, esc, visuallyHidden } from './html.js';
import { prefersReducedMotion } from '../../lib/motion.js';

const STEP_MS = 90;
const FLIP_OUT_MS = 150;
const FLIP_IN_MS = 200;

const cellHtml = (ch) => `<span class="flap-cell"><span class="flap-face">${ch}</span><span class="flap-top"><span class="flap-top-text">${ch}</span></span><span class="flap-bottom"><span class="flap-bottom-text">${ch}</span></span></span>`;

function digitsOf(value, minDigits) {
  const number = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  const width = Number.isInteger(minDigits) && minDigits >= 1 && minDigits <= 6 ? minDigits : 1;
  return { number, digits: String(number).padStart(width, '0') };
}

/**
 * @param {number} value  a whole number, zero or more (anything else shows 0)
 * @param {{ minDigits?: number, cls?: any }} [opts] minDigits pads with zeros, 1 to 6
 * @returns {string} cells that are aria-hidden, plus the real number as hidden text
 */
export function flapDigitsHtml(value, { minDigits, cls: extra } = {}) {
  const { number, digits } = digitsOf(value, minDigits);
  const cells = [...digits].map(cellHtml).join('');
  return `<span class="${cls('ui-flap', extra)}" data-flap="${esc(number)}"><span class="ui-flap-cells" aria-hidden="true">${cells}</span>${visuallyHidden(number)}</span>`;
}

/**
 * Pure. The frames of the run-up: every cell counts from 0 to its digit in the same number of steps.
 * @param {string} digits  what the cells end on, for example "12"
 * @param {{ maxSteps?: number }} [opts]
 * @returns {string[][]} one list of cell characters per frame; the last frame is `digits`
 */
export function flapFrames(digits, { maxSteps = 6 } = {}) {
  const targets = [...String(digits)].map((ch) => (/\d/.test(ch) ? Number(ch) : 0));
  const steps = Math.min(Math.max(0, ...targets), Math.max(1, maxSteps));
  if (steps === 0) return [targets.map(String)];
  return Array.from({ length: steps + 1 }, (_, k) => targets.map((digit) => String(Math.round((digit * k) / steps))));
}

function setCell(cell, ch, flip) {
  const face = cell.querySelector('.flap-face');
  if (!face || face.textContent === ch) return [];
  const top = cell.querySelector('.flap-top');
  const bottom = cell.querySelector('.flap-bottom');
  const write = () => {
    face.textContent = ch;
    cell.querySelectorAll('.flap-top-text, .flap-bottom-text').forEach((el) => { el.textContent = ch; });
  };
  if (!flip || !top || !bottom) { write(); return []; }
  top.classList.add('flap-flip-out');
  const out = setTimeout(() => {
    write();
    top.classList.remove('flap-flip-out');
    bottom.classList.add('flap-flip-in');
  }, FLIP_OUT_MS);
  const settle = setTimeout(() => bottom.classList.remove('flap-flip-in'), FLIP_OUT_MS + FLIP_IN_MS);
  return [out, settle];
}

/**
 * Runs the digits up from zero, once, in every .ui-flap inside `root`. Does nothing when `animate`
 * is false (a silent refresh, a view switch, a region patch) or when motion is reduced: the markup
 * already shows the final digits.
 * @param {Element} root
 * @param {{ animate?: boolean }} [opts]
 * @returns {() => void} cleanup: stops the run and leaves the final digits
 */
export function mountFlaps(root, { animate = false } = {}) {
  if (!animate || prefersReducedMotion()) return () => {};
  const timers = [];
  const flaps = [...root.querySelectorAll('.ui-flap[data-flap]')].map((el) => {
    const cells = [...el.querySelectorAll('.flap-cell')];
    const digits = cells.map((cell) => cell.querySelector('.flap-face')?.textContent ?? '0').join('');
    return { cells, digits, frames: flapFrames(digits) };
  }).filter((flap) => flap.frames.length > 1);
  for (const { cells, frames } of flaps) {
    cells.forEach((cell, i) => setCell(cell, frames[0][i], false));
    frames.slice(1).forEach((frame, k) => {
      timers.push(setTimeout(() => {
        cells.forEach((cell, i) => timers.push(...setCell(cell, frame[i], true)));
      }, STEP_MS + k * (FLIP_OUT_MS + STEP_MS)));
    });
  }
  return () => {
    timers.forEach(clearTimeout);
    for (const { cells, digits } of flaps) {
      cells.forEach((cell, i) => {
        setCell(cell, digits[i], false);
        cell.querySelector('.flap-top')?.classList.remove('flap-flip-out');
        cell.querySelector('.flap-bottom')?.classList.remove('flap-flip-in');
      });
    }
  };
}
