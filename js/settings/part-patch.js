// Redrawing the Settings page in place (blueprint 6): the page is made of parts (data-st-part); a
// refresh replaces only the parts whose markup changed and puts the focus back on the control with
// the same id. So a change of Square layout, which rebuilds the route, never throws the focus to the
// title, and a status line that arrives late never eats what someone is typing. Owner: F12.

const PART = '[data-st-part]';
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])';
const TEXT_FIELD = 'input[type="text"], input:not([type]), textarea';

/**
 * Pure. What a refresh does with each part of the new markup.
 * @param {Object<string, string>|null} known  part name to the markup the page last drew
 * @param {Object<string, string>|null} next   part name to the markup of the state now
 * @param {{ adopt?: string[], hold?: string[] }} [opts]
 *   adopt  parts the page has already brought up to date itself (the view picker after a pick): the new
 *          markup is recorded and the elements are left alone
 *   hold   parts that must not be replaced now (a text field in it has the focus): the old record
 *          stays, so the next refresh tries again
 * @returns {{ replace: string[], adopt: string[], held: string[] }} changed parts only, in page order
 */
export function partsToReplace(known, next, { adopt = [], hold = [] } = {}) {
  const out = { replace: [], adopt: [], held: [] };
  for (const [name, html] of Object.entries(next ?? {})) {
    if ((known ?? {})[name] === html) continue;
    if (adopt.includes(name)) out.adopt.push(name);
    else if (hold.includes(name)) out.held.push(name);
    else out.replace.push(name);
  }
  return out;
}

/** Part name to markup, for every part under `container` (the page root, or a parsed template). */
export function readParts(container) {
  return Object.fromEntries([...container.querySelectorAll(PART)].map((el) => [el.getAttribute('data-st-part'), el.innerHTML]));
}

/** The name of the part that holds a focused text field, or null: that part is not replaced now. */
export function partBeingTyped(root) {
  const active = document.activeElement;
  if (!active || !root.contains(active) || !active.matches(TEXT_FIELD)) return null;
  return active.closest(PART)?.getAttribute('data-st-part') ?? null;
}

/** Replaces the children of one part and keeps the focus: same id first, else the part's first control, else the section heading. */
function replacePart(el, html) {
  const active = document.activeElement;
  const had = Boolean(active) && el.contains(active);
  const id = had ? active.id : '';
  el.innerHTML = html;
  if (!had) return;
  const again = id ? document.getElementById(id) : null;
  const usable = again && el.contains(again) && !again.disabled ? again : null;
  const target = usable ?? el.querySelector(FOCUSABLE) ?? el.closest('section')?.querySelector('h2[tabindex]');
  target?.focus({ preventScroll: true });
}

/**
 * Brings the page up to date with new markup of the whole page.
 * @param {Element} root   the page root
 * @param {string} html    settingsPageHtml() of the state now
 * @param {Object<string, string>} known  what readParts() gave after the last draw
 * @param {{ adopt?: string[] }} [opts]
 * @returns {{ known: Object<string, string>, replaced: string[], held: string[] }} the record to keep, the
 *   parts that were replaced (their listeners are gone) and the ones held back
 */
export function patchParts(root, html, known, { adopt = [] } = {}) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const next = readParts(template.content);
  const typing = partBeingTyped(root);
  const plan = partsToReplace(known, next, { adopt, hold: typing ? [typing] : [] });
  const record = { ...known };
  for (const name of plan.adopt) record[name] = next[name];
  for (const name of plan.replace) {
    const el = root.querySelector(`[data-st-part="${name}"]`);
    if (!el) continue;
    replacePart(el, next[name]);
    record[name] = next[name];
  }
  return { known: record, replaced: plan.replace, held: plan.held };
}
