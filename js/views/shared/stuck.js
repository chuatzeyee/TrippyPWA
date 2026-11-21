// Says when a sticky element is pinned (blueprint 4.2, 8.3), and publishes the real height of the
// trip bar (ruling R31). It toggles data-stuck and writes one custom property; every offset is CSS.
// Owner: F6.
//
// A pinned element sits on its line (its computed `top`) while the page has scrolled. With `past`
// (the hero) it counts as pinned only once that element has gone up behind it: a bar that sits at the
// top of the page from the first pixel then reads as stuck when the title has scrolled away, which is
// when a view shows the trip name in the bar.
//
// The bar may grow: a long trip name wraps in it. Whatever is pinned under the bar (the tab row, the
// open day header, the jump targets) hangs from --tv-bar-h, so the bar's real height is written on
// the trip root as that variable while the bar is observed. trip.css holds the value used before the
// first measure, and the bar's own min-height reads --tv-bar-min-h, never the measured value, or a
// bar that grew once could not shrink again.

const SLACK = 0.5;
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** The custom property the bar's height is published as, on the trip root (.td-wrap). */
export const BAR_HEIGHT_VAR = '--tv-bar-h';

/**
 * The rule, on plain numbers (all in px, viewport coordinates).
 * @param {{ sticky?: boolean, top?: number, bottom?: number, line?: number, scrollY?: number, pastBottom?: number|null }} [box]
 *   sticky      the element's computed position is sticky
 *   top, bottom the element's box
 *   line        where it pins: its computed `top`
 *   scrollY     how far the page has scrolled
 *   pastBottom  the bottom edge of the `past` element, null when there is none
 * @returns {boolean}
 */
export function isStuck({ sticky = false, top, bottom, line, scrollY, pastBottom = null } = {}) {
  if (!sticky || !isNumber(top) || !isNumber(line) || !isNumber(scrollY)) return false;
  if (scrollY <= 0 || top > line + SLACK) return false;
  if (pastBottom === null || pastBottom === undefined) return true;
  return isNumber(pastBottom) && isNumber(bottom) && pastBottom <= bottom + SLACK;
}

/**
 * A measured height as a CSS length, to a hundredth of a pixel.
 * @param {*} height  px
 * @returns {string} "71.4px"; '' for a box that is not laid out or not measured
 */
export function heightValue(height) {
  if (!isNumber(height) || height <= 0) return '';
  return `${Math.round(height * 100) / 100}px`;
}

/** How many live observers publish on an element, so one cleanup does not take another's value away. */
const publishers = new WeakMap();

/**
 * Keeps --tv-bar-h on the trip root equal to the real height of the bar (ruling R31). observeStuck()
 * calls this for the trip bar by itself; call it directly only for a bar that is not observed there.
 * @param {Element|null} bar  the bar, a .tv-bar inside the trip root
 * @param {{ on?: HTMLElement|null }} [opts]
 *   on  the element that carries the variable; the bar's nearest .td-wrap when left out
 * @returns {() => void} cleanup: stops watching and removes the variable, unless another bar of the
 *   same root is still observed (a re-render that mounts the new bar before the old one is let go)
 */
export function observeBarHeight(bar, { on } = {}) {
  if (!bar || typeof bar.getBoundingClientRect !== 'function' || typeof window === 'undefined') return () => {};
  const target = on ?? (typeof bar.closest === 'function' ? bar.closest('.td-wrap') : null);
  if (!target?.style || typeof target.style.setProperty !== 'function') return () => {};
  const measure = () => {
    // A bar that has left the page reports no height: that is not news about the page.
    if (bar.isConnected === false) return;
    const value = heightValue(bar.getBoundingClientRect().height);
    if (target.style.getPropertyValue(BAR_HEIGHT_VAR) === value) return;
    if (value) target.style.setProperty(BAR_HEIGHT_VAR, value);
    else target.style.removeProperty(BAR_HEIGHT_VAR);
  };
  const control = new AbortController();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
  if (observer) observer.observe(bar, { box: 'border-box' });
  else window.addEventListener('resize', measure, { passive: true, signal: control.signal });
  publishers.set(target, (publishers.get(target) ?? 0) + 1);
  measure();
  let live = true;
  return () => {
    if (!live) return;
    live = false;
    observer?.disconnect();
    control.abort();
    const left = (publishers.get(target) ?? 1) - 1;
    if (left > 0) {
      publishers.set(target, left);
      return;
    }
    publishers.delete(target);
    target.style.removeProperty(BAR_HEIGHT_VAR);
  };
}

/**
 * Keeps data-stuck on `el` true to isStuck() while the page scrolls or resizes. For the trip bar it
 * also keeps --tv-bar-h on the trip root equal to the bar's real height (observeBarHeight).
 * @param {Element|null} el  the sticky element (the bar, the tab list)
 * @param {{ top?: number, past?: Element|null, height?: boolean }} [opts]
 *   top     the pin line in px, when it should not be read from the element's computed `top`
 *   past    an element above `el` in the page (the hero): data-stuck waits until it has scrolled away
 *   height  publish the height of `el` as --tv-bar-h. Left out: yes for a .tv-bar, no for anything else
 * @returns {() => void} cleanup: stops listening and removes the attribute and the variable
 */
export function observeStuck(el, { top, past = null, height } = {}) {
  if (!el || typeof el.getBoundingClientRect !== 'function' || typeof window === 'undefined') return () => {};
  let frame = 0;
  const measure = () => {
    frame = 0;
    if (!el.isConnected) return;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const computedTop = parseFloat(style.top);
    const stuck = isStuck({
      sticky: style.position === 'sticky',
      top: box.top,
      bottom: box.bottom,
      line: isNumber(top) ? top : (isNumber(computedTop) ? computedTop : 0),
      scrollY: window.scrollY,
      pastBottom: past?.isConnected ? past.getBoundingClientRect().bottom : null,
    });
    if (el.hasAttribute('data-stuck') !== stuck) el.toggleAttribute('data-stuck', stuck);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
  const control = new AbortController();
  window.addEventListener('scroll', schedule, { passive: true, signal: control.signal });
  window.addEventListener('resize', schedule, { passive: true, signal: control.signal });
  const isBar = typeof el.matches === 'function' && el.matches('.tv-bar');
  const stopHeight = (typeof height === 'boolean' ? height : isBar) ? observeBarHeight(el) : () => {};
  measure();
  return () => {
    control.abort();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    stopHeight();
    el.removeAttribute('data-stuck');
  };
}
