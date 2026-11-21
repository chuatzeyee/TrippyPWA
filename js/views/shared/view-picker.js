// The view picker, the one-time chooser and Undo (blueprint 6.8). Three native radios in label cards;
// picking one applies it at once through onPick. The Undo rule is the pure undoBaseline(). Owner: F5.
import { attr, button, cls, esc, safeSrc } from './html.js';
import { icon } from './icons.js';

/**
 * The three views in picker order. The registry holds the same names (VIEW_META); a caller that has
 * it passes `views` so there is one source at run time. A test keeps the two from drifting.
 */
export const VIEW_CHOICES = Object.freeze([
  Object.freeze({ id: 'departures', name: 'Departures', sentence: 'Your own departures board. Precise and data-forward.' }),
  Object.freeze({ id: 'concierge', name: 'Concierge', sentence: 'A morning briefing. Calm and editorial.' }),
  Object.freeze({ id: 'atlas', name: 'Atlas', sentence: 'A map and a logbook.' }),
]);

/** A change this long after the last one starts a new Undo step. */
export const UNDO_QUIET_MS = 1500;

const SIZES = { full: [240, 300], compact: [96, 120] };
const VIEW_ID = /^[a-z][a-z0-9-]*$/;
const nameOf = (views, id) => views.find((view) => view.id === id)?.name ?? '';
const onLine = (name) => (name ? `${name} is on.` : '');

/**
 * What the status line says when a pick could not be applied (blueprint 5.5).
 * @param {string} name  the name of the view that is still on
 */
export function pickFailedText(name) {
  const still = String(name ?? '').trim();
  return still ? `That view could not load. You are still on ${still}.` : 'That view could not load.';
}

function cardHtml(view, { current, theme, base, width, height, images, name }) {
  const on = view.id === current;
  const src = images && VIEW_ID.test(view.id) ? safeSrc(`${base}img/views/${view.id}-${theme}.webp`) : '';
  const img = src ? `<img class="ui-picker-img" src="${esc(src)}" alt="" width="${width}" height="${height}" loading="lazy" decoding="async">` : '';
  return `<label class="${cls('ui-picker-card', { 'is-current': on })}"${attr('data-key', view.id)}>
      <input class="ui-picker-radio" type="radio"${attr('name', name)}${attr('value', view.id)}${attr('data-focus-key', `view-${view.id}`)}${attr('checked', on)}>
      <span class="ui-picker-shot"><span class="ui-picker-none" aria-hidden="true">${icon('image', 24)}</span>${img}</span>
      <span class="ui-picker-text"><span class="ui-picker-name">${esc(view.name)}</span> <span class="ui-picker-sentence">${esc(view.sentence)}</span></span>
      ${on ? '<span class="ui-picker-current">Current</span>' : ''}
    </label>`;
}

/**
 * The picker: a fieldset with the legend "View" and three radio cards, then a polite status line and
 * a hidden Undo button (outside the radio group, so Tab leaves the group to it).
 * @param {{ current?: string, theme?: 'dark'|'light', size?: 'full'|'compact', views?: Array<{ id: string, name: string, sentence: string }>,
 *           baseUrl?: string, images?: boolean, status?: string }} [opts]
 *   theme    which preview set to show (public/img/views/<id>-<theme>.webp)
 *   size     full for Settings (240 by 300), compact for the dashboard chooser (96 by 120)
 *   baseUrl  ViewCtx.baseUrl
 *   images   false draws the designed placeholder alone (before the first preview set exists)
 *   status   the first words of the status line
 *   name     the radio group name, "view" by default; only a page that holds two pickers needs another
 */
export function viewPickerHtml({ current = '', theme = 'dark', size = 'full', views = VIEW_CHOICES, baseUrl = '/', images = true, status = '', name = 'view' } = {}) {
  const shape = Object.hasOwn(SIZES, size) ? size : 'full';
  const [width, height] = SIZES[shape];
  const base = typeof baseUrl === 'string' && /^\/(?!\/)/.test(baseUrl) ? (baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`) : '/';
  const set = theme === 'light' ? 'light' : 'dark';
  const cards = views.map((view) => cardHtml(view, { current, theme: set, base, width, height, images, name: /^[A-Za-z][\w-]*$/.test(name) ? name : 'view' })).join('');
  return `<div class="ui-picker-wrap" data-view-picker>
    <fieldset class="ui-picker ui-picker--${shape}">
      <legend class="ui-picker-legend">View</legend>
      <div class="ui-picker-cards" data-keep-scroll="view-picker">${cards}</div>
    </fieldset>
    <div class="ui-picker-after">
      <p class="ui-picker-status" role="status" data-picker-status>${esc(status)}</p>
      ${button('Undo', { focusKey: 'view-undo', cls: 'ui-btn ui-btn--small', attrs: { 'data-picker-undo': true, hidden: true }, html: `${icon('undo', 16)}<span>Undo</span>` })}
    </div>
  </div>`;
}

/**
 * The one-time chooser for the dashboard: a compact section the controller keeps in the view's
 * chooser slot. Not a modal. The button reads "Keep <view>" until the selection changes, then "Done".
 * @param {{ current?: string, theme?: 'dark'|'light', views?: Array<object>, baseUrl?: string, images?: boolean, changed?: boolean }} [opts]
 */
export function viewChooserHtml({ current = '', theme = 'dark', views = VIEW_CHOICES, baseUrl = '/', images = true, changed = false, name = 'view' } = {}) {
  const active = nameOf(views, current);
  const status = `You can pick how Trippy looks.${active ? ` ${onLine(active)}` : ''}`;
  const done = changed || !active ? 'Done' : `Keep ${active}`;
  return `<section class="ui-chooser" aria-labelledby="ui-chooser-title" data-view-chooser>
    <h2 class="ui-chooser-title" id="ui-chooser-title">Pick how Trippy looks</h2>
    ${viewPickerHtml({ current, theme, size: 'compact', views, baseUrl, images, status, name })}
    <div class="ui-chooser-foot">
      <p class="ui-chooser-note">You can change this any time in Settings.</p>
      ${button(done, { action: 'chooser-done', cls: 'ui-btn ui-btn--primary', attrs: { 'data-chooser-done': true } })}
    </div>
  </section>`;
}

/** The Undo state for a picker that shows `current`. */
export function startUndo(current) {
  return { baseline: current, current, open: false, lastAt: null };
}

/**
 * Pure. The next Undo state. Undo returns to `baseline`: the view that was on before the latest run of
 * changes. A run ends when focus leaves the group (or enters it again), when the picker has been quiet
 * for UNDO_QUIET_MS, or with Undo itself; walking through the views with the arrow keys is one run.
 * @param {{ baseline: string, current: string, open: boolean, lastAt: number|null }} state
 * @param {{ type: 'change', view: string, at: number }|{ type: 'focus'|'blur'|'settle'|'undo' }|{ type: 'revert', view: string }} event
 *   change  a radio was picked at time `at` (ms)
 *   revert  a pick could not be applied: `view` is on again and there is nothing to undo
 * @returns the next state (a new object when anything changed); Undo is on offer while current differs from baseline
 */
export function undoBaseline(state, event) {
  switch (event?.type) {
    case 'change': {
      if (event.view === state.current) return state;
      const quiet = state.lastAt !== null && event.at - state.lastAt >= UNDO_QUIET_MS;
      const baseline = state.open && !quiet ? state.baseline : state.current;
      return { baseline, current: event.view, open: true, lastAt: event.at };
    }
    case 'focus':
    case 'blur':
    case 'settle':
      return state.open ? { ...state, open: false } : state;
    case 'undo':
      return state.current === state.baseline ? state : { baseline: state.baseline, current: state.baseline, open: false, lastAt: null };
    case 'revert':
      return { baseline: event.view, current: event.view, open: false, lastAt: null };
    default:
      return state;
  }
}

/**
 * Where a sideways row has to scroll to so that a card inside it is in view, centred when there is room.
 * @param {{ width: number, scrollWidth: number, scrollLeft: number, left: number }|null} row  the visible width,
 *   the full width, how far it is scrolled, and its left edge on the screen
 * @param {{ left: number, width: number }|null} card  the card's box on the screen
 * @returns {number|null} the scrollLeft to set; null when the row does not scroll or the card is in view already
 */
export function scrollLeftFor(row, card) {
  if (!row || !card || ![row.width, row.scrollWidth, row.scrollLeft, row.left, card.left, card.width].every(Number.isFinite)) return null;
  if (row.scrollWidth <= row.width + 1) return null;
  const start = card.left - row.left + row.scrollLeft;
  if (start >= row.scrollLeft - 1 && start + card.width <= row.scrollLeft + row.width + 1) return null;
  const wanted = Math.round(start - (row.width - card.width) / 2);
  return Math.max(0, Math.min(row.scrollWidth - row.width, wanted));
}

/**
 * Binds one picker (or chooser) inside `root`. A pick calls `onPick(id, { via })` at once; when it
 * throws or rejects, the selection goes back and the status line says so, naming the view that is
 * still on (pickFailedText). Undo picks the baseline and moves focus to the radio that is then selected.
 * @param {Element} root
 * @param {{ onPick?: (id: string, info: { via: 'pick'|'undo' }) => any, onDone?: () => void,
 *           views?: Array<{ id: string, name: string }>, now?: () => number }} [opts]
 * @returns {() => void} cleanup
 */
export function mountViewPicker(root, { onPick, onDone, views = VIEW_CHOICES, now = () => Date.now() } = {}) {
  const control = new AbortController();
  const { signal } = control;
  const group = root.querySelector('.ui-picker');
  if (!group) return () => {};
  const radios = () => [...group.querySelectorAll('input.ui-picker-radio')];
  const status = root.querySelector('[data-picker-status]');
  const undo = root.querySelector('[data-picker-undo]');
  const done = root.querySelector('[data-chooser-done]');
  let state = startUndo(radios().find((radio) => radio.checked)?.value ?? '');
  let timer = 0;

  const show = (message) => {
    for (const radio of radios()) {
      const on = radio.value === state.current;
      const card = radio.closest('.ui-picker-card');
      radio.checked = on;
      card?.classList.toggle('is-current', on);
      const mark = card?.querySelector('.ui-picker-current');
      if (on && card && !mark) card.insertAdjacentHTML('beforeend', '<span class="ui-picker-current">Current</span>');
      if (!on) mark?.remove();
    }
    if (status) status.textContent = message ?? onLine(nameOf(views, state.current));
    if (undo) undo.hidden = state.current === state.baseline;
  };
  const apply = async (next, via) => {
    const before = state;
    state = next;
    clearTimeout(timer);
    timer = setTimeout(() => { state = undoBaseline(state, { type: 'settle' }); }, UNDO_QUIET_MS);
    show();
    if (done && via === 'pick') done.textContent = 'Done';
    try {
      await onPick?.(state.current, { via });
    } catch {
      if (state !== next) return;
      state = undoBaseline(state, { type: 'revert', view: before.current });
      show(pickFailedText(nameOf(views, state.current)));
    }
  };

  group.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.classList.contains('ui-picker-radio')) return;
    const next = undoBaseline(state, { type: 'change', view: event.target.value, at: now() });
    if (next !== state) apply(next, 'pick');
  }, { signal });
  group.addEventListener('focusin', (event) => {
    if (!group.contains(event.relatedTarget)) state = undoBaseline(state, { type: 'focus' });
  }, { signal });
  group.addEventListener('focusout', (event) => {
    if (!group.contains(event.relatedTarget)) state = undoBaseline(state, { type: 'blur' });
  }, { signal });
  undo?.addEventListener('click', () => {
    const next = undoBaseline(state, { type: 'undo' });
    if (next === state) return;
    apply(next, 'undo');
    radios().find((radio) => radio.checked)?.focus();
  }, { signal });
  if (done && onDone) done.addEventListener('click', () => onDone(), { signal });
  // The compact row scrolls sideways on a phone: the current card is brought into view, the page is not moved.
  const row = group.querySelector('.ui-picker-cards');
  const current = radios().find((radio) => radio.checked)?.closest('.ui-picker-card');
  const left = scrollLeftFor(row ? { width: row.clientWidth, scrollWidth: row.scrollWidth, scrollLeft: row.scrollLeft, left: row.getBoundingClientRect().left } : null, current?.getBoundingClientRect() ?? null);
  if (row && left !== null) row.scrollLeft = left;
  // A preview image that cannot load leaves the designed placeholder in its box.
  root.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement && event.target.classList.contains('ui-picker-img')) event.target.remove();
  }, { capture: true, signal });
  return () => { clearTimeout(timer); control.abort(); };
}
