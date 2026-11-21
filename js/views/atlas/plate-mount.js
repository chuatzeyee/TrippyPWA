// The DOM half of the dashboard plates (ruling R32): a plate is drawn in world units and its pins,
// labels and type are sized for one width, so each frame is measured and its plate drawn again for
// the width it really has. What a plate is drawn from travels in the markup (data-atl-pins), so this
// works after a patch too, when the model the page was mounted with is long gone. Owner: VC.
import { dashboardPlateSvg } from './dashboard-plate.js';
import { unpackPlate } from './plates.js';

const MIN_WIDTH = 40;

/**
 * Draws every dashboard plate inside `root` for its measured frame. A frame that is not shown (the
 * band on a wide screen, the wide plate on a phone) has no width and is left alone; a frame that
 * already holds the plate for its size is left alone too, so this can be called as often as needed.
 * @param {Element} root
 * @returns {number} how many plates were drawn again
 */
export function fitPlates(root) {
  const source = root.querySelector('[data-atl-pins]');
  if (!source) return 0;
  const unpacked = new Map();
  let drawn = 0;
  for (const frame of root.querySelectorAll('[data-atl-plate]')) {
    const width = Math.round(frame.clientWidth);
    const height = Math.round(frame.clientHeight);
    if (width < MIN_WIDTH || height < MIN_WIDTH) continue;
    const clear = parseFloat(getComputedStyle(frame).getPropertyValue('--atl-clear-left'));
    const size = `${width}x${height}x${Number.isFinite(clear) ? clear : ''}`;
    if (frame.getAttribute('data-atl-fit') === size) continue;
    const holder = frame.hasAttribute('data-atl-pins') ? frame : source;
    if (!unpacked.has(holder)) unpacked.set(holder, unpackPlate(holder.getAttribute('data-atl-pins')));
    frame.innerHTML = dashboardPlateSvg(frame.getAttribute('data-atl-plate'), unpacked.get(holder), { width, height, clearLeft: Number.isFinite(clear) ? clear : undefined });
    frame.setAttribute('data-atl-fit', size);
    drawn += 1;
  }
  return drawn;
}

/**
 * Keeps the plates of a mounted dashboard at the width they are shown at: now, whenever the root
 * changes size, and after a patch of a plate region.
 * @param {Element} root
 * @param {import('../contract.js').ViewCtx} ctx
 */
export function mountPlates(root, ctx) {
  const fit = () => { try { fitPlates(root); } catch { /* the plate of the first paint stays */ } };
  fit();
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    ctx?.onCleanup?.(() => observer.disconnect());
  }
  ctx?.onPatched?.((region) => { if (region === 'plate' || region === 'band') fit(); });
}
