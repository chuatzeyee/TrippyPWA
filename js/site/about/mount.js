// What the About page's blocks do once the page is in the document (the blocks are built in
// js/site/about/blocks.js). Everything here is an addition: the page reads in full without it.
import { SKETCH_PLACES, SKETCH_WORDS, sketchHtml, sketchPlan } from './plan-sketch.js';

/** The plan sketch: draws the plan again when a place or a number of days is picked. */
function mountDemo(root, { places, sketchWords }, signal) {
  const demo = root.querySelector('[data-about-demo]');
  const controls = demo?.querySelector('[data-about-controls]');
  const out = demo?.querySelector('[data-about-sketch]');
  if (!controls || !out) return;
  controls.hidden = false;
  controls.addEventListener('submit', (event) => event.preventDefault(), { signal });
  controls.addEventListener('change', () => {
    const picked = (name) => controls.querySelector(`input[name="${name}"]:checked`)?.value;
    out.innerHTML = sketchHtml(sketchPlan({ place: picked('about-place'), days: picked('about-days') }, places), sketchWords);
    // The days come in one after the other; the stylesheet leaves that out for reduced motion.
    out.classList.remove('about-sketch--drawn');
    void out.offsetWidth;
    out.classList.add('about-sketch--drawn');
  }, { signal });
}

/** The steps: a button from each step to the next one, and one that opens or closes them all. */
function mountSteps(root, signal) {
  const wrap = root.querySelector('[data-about-steps]');
  if (!wrap) return;
  const steps = [...wrap.querySelectorAll('[data-about-step]')];
  const all = wrap.querySelector('[data-about-all]');
  const sync = () => {
    if (!all) return;
    const open = steps.every((step) => step.open);
    all.textContent = open ? all.dataset.closeText : all.dataset.openText;
    all.setAttribute('aria-expanded', String(open));
  };
  for (const button of wrap.querySelectorAll('[data-about-next]')) button.hidden = false;
  if (all) all.hidden = false;
  for (const step of steps) step.addEventListener('toggle', sync, { signal });
  wrap.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-about-all]')) {
      const open = !steps.every((step) => step.open);
      for (const step of steps) step.open = open;
      sync();
      return;
    }
    const current = target?.closest('[data-about-next]')?.closest('[data-about-step]');
    const next = current ? steps[steps.indexOf(current) + 1] : null;
    if (!next) return;
    current.open = false;
    next.open = true;
    next.querySelector('summary')?.focus();
    sync();
  }, { signal });
  sync();
}

/**
 * @param {Element} root the page's <article>
 * @param {{ places?: typeof SKETCH_PLACES, sketchWords?: typeof SKETCH_WORDS }} [data] what the page's demo was built with
 * @returns {() => void} undoes it
 */
export function mountAbout(root, { places = SKETCH_PLACES, sketchWords = SKETCH_WORDS } = {}) {
  const stop = new AbortController();
  mountDemo(root, { places, sketchWords }, stop.signal);
  mountSteps(root, stop.signal);
  return () => stop.abort();
}
