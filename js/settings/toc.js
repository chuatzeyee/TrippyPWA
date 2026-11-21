// "On this page" on the Settings page: which entry is marked as the section the page is on, and which
// edge of the chip row is cut on a narrow screen. The rules are pure (currentSection, heldJump,
// cutEdges); mountToc() reads the boxes on scroll and writes aria-current on the entry and
// data-st-cut on the row, which css/components/settings.css draws. The fade is written here and not
// left to a scroll timeline, so it is the same in every browser and with motion reduced. Owner: ST.

/** How far under a section's scroll margin its top still counts as having arrived (a jump lands on the margin). */
const LINE_SLACK = 8;
/** The scroll margin to assume when the style cannot be read: the nav and a little air. */
const LINE_FALLBACK = 80;
/** The page counts as at its end this close to the bottom (zoom leaves fractions). */
const END_SLACK = 2;
/** A sideways row counts as cut when more than this is out of sight (zoom leaves fractions). */
const CUT_SLACK = 1;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

const onScreen = (box, line, height) => box.top < height && box.bottom > line;

/**
 * Pure. Which edges of a sideways row are cut by its scroll position.
 * @param {{ scrollLeft?: number, scrollWidth?: number, clientWidth?: number }} [row]
 * @returns {'none'|'end'|'start'|'both'}
 */
export function cutEdges({ scrollLeft, scrollWidth, clientWidth } = {}) {
  if (![scrollLeft, scrollWidth, clientWidth].every(Number.isFinite)) return 'none';
  const hidden = scrollWidth - clientWidth;
  if (hidden <= CUT_SLACK) return 'none';
  const start = Math.abs(scrollLeft) > CUT_SLACK;
  const end = hidden - Math.abs(scrollLeft) > CUT_SLACK;
  if (start && end) return 'both';
  return start ? 'start' : end ? 'end' : 'none';
}

/**
 * Pure. What becomes of a jump once the page has moved: it is held while the page travels to its
 * section and while any of that section is on screen below the line, and let go when the section
 * has arrived and then left.
 * @param {{ picked: string|null, arrived: boolean }} jump
 * @param {{ sections: Array<{ key: string, top: number, bottom: number }>, line: number, height: number }} facts
 * @returns {{ picked: string|null, arrived: boolean }}
 */
export function heldJump({ picked = null, arrived = false } = {}, { sections = [], line = 0, height = 0 } = {}) {
  const box = picked ? sections.find((entry) => entry.key === picked) : null;
  if (!box) return { picked: null, arrived: false };
  if (onScreen(box, line, height)) return { picked, arrived: true };
  return arrived ? { picked: null, arrived: false } : { picked, arrived: false };
}

/**
 * Pure. The key of the section the page is on.
 * @param {object} [facts]
 * @param {Array<{ key: string, top: number, bottom: number }>} [facts.sections] the sections in page order, with
 *   their boxes on the screen
 * @param {number} [facts.line]    how far down the screen a section's top has to be to count as reached
 * @param {number} [facts.height]  the height of the screen
 * @param {boolean} [facts.atEnd]  the page is scrolled to its end, where the last headings cannot reach the line
 * @param {string|null} [facts.picked] the section someone last jumped to: it stays the answer while any of it
 *   is on screen below the line, so a jump to a short section near the end marks what was asked for
 * @returns {string|null} null when there are no sections or a box is not a number
 */
export function currentSection({ sections = [], line = 0, height = 0, atEnd = false, picked = null } = {}) {
  if (!Array.isArray(sections) || sections.length === 0) return null;
  if (!sections.every((box) => Number.isFinite(box?.top) && Number.isFinite(box?.bottom))) return null;
  const jumped = picked ? sections.find((box) => box.key === picked) : null;
  if (jumped && onScreen(jumped, line, height)) return jumped.key;
  if (atEnd) return sections.at(-1).key;
  const reached = sections.filter((box) => box.top <= line);
  return (reached.at(-1) ?? sections[0]).key;
}

function lineOf(section) {
  const margin = parseFloat(getComputedStyle(section).scrollMarginTop);
  return (Number.isFinite(margin) && margin > 0 ? margin : LINE_FALLBACK) + LINE_SLACK;
}

/**
 * Keeps the mark on the entry of the section in view until `signal` aborts.
 * @param {Element} root the page root (.st-page)
 * @param {{ signal: AbortSignal }} opts
 */
export function mountToc(root, { signal }) {
  const sections = [...root.querySelectorAll('[data-st-section]')];
  const entries = [...root.querySelectorAll('[data-st-jump]')];
  const row = root.querySelector('[data-st-cut]');
  if (sections.length === 0 || entries.length === 0 || signal.aborted) return;
  let jump = { picked: null, arrived: false };
  let frame = 0;

  const update = () => {
    frame = 0;
    if (!root.isConnected) return;
    const page = document.documentElement;
    const facts = {
      sections: sections.map((el) => {
        const { top, bottom } = el.getBoundingClientRect();
        return { key: el.getAttribute('data-st-section'), top, bottom };
      }),
      line: lineOf(sections[0]),
      height: window.innerHeight,
    };
    jump = heldJump(jump, facts);
    const key = currentSection({ ...facts, atEnd: window.scrollY + window.innerHeight >= page.scrollHeight - END_SLACK, picked: jump.picked });
    for (const entry of entries) {
      const on = entry.getAttribute('data-st-jump') === key;
      if (on !== (entry.getAttribute('aria-current') === 'true')) {
        if (on) entry.setAttribute('aria-current', 'true');
        else entry.removeAttribute('aria-current');
      }
    }
    if (row) {
      const cut = cutEdges(row);
      if (row.getAttribute('data-st-cut') !== cut) row.setAttribute('data-st-cut', cut);
    }
  };
  const later = () => { if (!frame) frame = requestAnimationFrame(update); };
  /** Someone scrolls by hand: the page is where they put it, not where the last jump went. */
  const byHand = () => { jump = { picked: null, arrived: false }; };

  window.addEventListener('scroll', later, { passive: true, signal });
  window.addEventListener('resize', later, { passive: true, signal });
  window.addEventListener('wheel', byHand, { passive: true, signal });
  window.addEventListener('touchmove', byHand, { passive: true, signal });
  window.addEventListener('keydown', (event) => { if (SCROLL_KEYS.has(event.key)) byHand(); }, { signal });
  root.addEventListener('click', (event) => {
    const entry = event.target instanceof Element ? event.target.closest('[data-st-jump]') : null;
    if (!entry) return;
    jump = { picked: entry.getAttribute('data-st-jump'), arrived: false };
    later();
  }, { signal });
  row?.addEventListener('scroll', later, { passive: true, signal });
  signal.addEventListener('abort', () => { if (frame) cancelAnimationFrame(frame); }, { once: true });
  update();
}
