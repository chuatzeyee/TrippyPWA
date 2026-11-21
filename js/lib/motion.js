// The only place that answers "should this move" (blueprint 5.3, 8.4). Two triggers, one answer: the
// OS setting and prefs.motion = 'reduce'. CSS gets the pref through html[data-motion="reduce"]
// (css/base.css); JS that animates or scrolls smoothly asks here, because an explicit smooth scroll
// in JS ignores CSS. Owner: F1.

const OS_QUERY = '(prefers-reduced-motion: reduce)';
const ATTRIBUTE = 'data-motion';

/** The pref as last applied. Before that, the attribute the boot script set stands in for it. */
let motionPref = 'system';

const root = () => (typeof document !== 'undefined' ? document.documentElement ?? null : null);

function osAsksForLess() {
  try {
    return typeof window !== 'undefined' && Boolean(window.matchMedia?.(OS_QUERY)?.matches);
  } catch {
    return false;
  }
}

/**
 * Sets html[data-motion] from the motion pref.
 * @param {'system'|'reduce'} motion anything but 'reduce' reads as 'system'
 */
export function applyMotion(motion) {
  motionPref = motion === 'reduce' ? 'reduce' : 'system';
  const html = root();
  if (!html) return;
  if (motionPref === 'reduce') html.setAttribute(ATTRIBUTE, 'reduce');
  else html.removeAttribute(ATTRIBUTE);
}

/** @returns {boolean} true when the OS setting or the pref asks for less motion. Read live, never cached. */
export function prefersReducedMotion() {
  return motionPref === 'reduce' || root()?.getAttribute(ATTRIBUTE) === 'reduce' || osAsksForLess();
}

/** @returns {'auto'|'smooth'} what every scroll call passes as its behavior */
export function scrollBehavior() {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
