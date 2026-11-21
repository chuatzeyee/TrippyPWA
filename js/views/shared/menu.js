// Menus (blueprint 1.3, ruling R3): one mechanism at every width, a <dialog> opened with showModal(),
// so the menu is in the top layer wherever its trigger sits (a glass bar with backdrop-filter is safe).
// Below 640 px it is a bottom sheet, from 640 px a panel under its trigger. Owner: F5.
//
// The markup this drives, also emitted by the frozen stub view:
//   trigger  <button data-menu-open="<id>" aria-haspopup="menu" aria-expanded="false" aria-controls="<id>">
//   panel    <dialog id="<id>" data-menu> holding one [role="menu"] with [role="menuitem"] items
import { attr, cls, esc, safeHref } from './html.js';
import { icon } from './icons.js';

/** Viewport width in px below which a menu is a bottom sheet. */
export const SHEET_BELOW = 640;
const GAP = 6;
const MARGIN = 8;
const ID = /^[A-Za-z][\w-]*$/;

// --- Pure -------------------------------------------------------------------------------------------

function itemHtml(item) {
  const inner = `${icon(item.icon, 18)}<span class="ui-menu-label">${esc(item.label)}</span>${item.hint ? ` <span class="ui-menu-hint">${esc(item.hint)}</span>` : ''}`;
  const classes = cls('ui-menu-item', { 'is-danger': item.danger });
  const focusKey = `menu-${item.key}`;
  if (item.href) {
    const href = safeHref(item.href);
    return href ? `<li role="none"><a class="${classes}" role="menuitem" href="${esc(href)}"${attr('data-focus-key', focusKey)}>${inner}</a></li>` : '';
  }
  return `<li role="none"><button type="button" class="${classes}" role="menuitem"${attr('data-action', item.key)}${attr('data-focus-key', focusKey)}>${inner}</button></li>`;
}

/**
 * A trigger and its menu, in the markup mountMenus() drives.
 * @param {{ id: string, label: string, items: Array<{ key: string, label: string, hint?: string, href?: string, danger?: boolean, icon?: string }>,
 *           icon?: string, showLabel?: boolean, cls?: any }} opts
 *   id     the dialog id, unique on the page
 *   items  an item with `href` is a link; any other is a button with data-action="<key>"
 *   showLabel  false keeps the label for assistive technology only (an icon button)
 */
export function menuHtml({ id, label, items = [], icon: glyph = 'more', showLabel = true, cls: extra } = {}) {
  if (typeof id !== 'string' || !ID.test(id)) return '';
  const rows = items.map(itemHtml).join('');
  if (!rows) return '';
  const text = showLabel ? `<span>${esc(label)}</span>` : `<span class="ui-vh">${esc(label)}</span>`;
  return `<button type="button" class="${cls('ui-menu-btn', extra)}" data-menu-open="${id}" data-focus-key="menu-open-${id}" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}">${icon(glyph, 20)}${text}</button>
    <dialog class="ui-menu" id="${id}" data-menu${attr('aria-label', label)}><ul class="ui-menu-list" role="menu">${rows}</ul></dialog>`;
}

/**
 * Where an open menu goes.
 * @param {{ left: number, top: number, right: number, bottom: number }} trigger  the trigger's box in the viewport
 * @param {{ width: number, height: number }} menu      the menu's natural size
 * @param {{ width: number, height: number }} viewport
 * @returns {{ mode: 'sheet' }|{ mode: 'panel', left: number, top: number, maxHeight: number }}
 */
export function menuPlacement(trigger, menu, viewport) {
  if (viewport.width < SHEET_BELOW) return { mode: 'sheet' };
  const middle = (trigger.left + trigger.right) / 2;
  const wanted = middle > viewport.width / 2 ? trigger.right - menu.width : trigger.left;
  const left = Math.round(Math.max(MARGIN, Math.min(wanted, viewport.width - MARGIN - menu.width)));
  const below = viewport.height - trigger.bottom - GAP - MARGIN;
  const above = trigger.top - GAP - MARGIN;
  if (menu.height > below && above > below) {
    const height = Math.min(menu.height, above);
    return { mode: 'panel', left, top: Math.round(trigger.top - GAP - height), maxHeight: Math.round(above) };
  }
  return { mode: 'panel', left, top: Math.round(trigger.bottom + GAP), maxHeight: Math.round(below) };
}

/**
 * Which item a key moves to. `index` is the focused item, -1 when focus is not on an item.
 * @returns {number|null} the new index, or null when the key does not move focus
 */
export function nextMenuIndex(key, index, count) {
  if (count < 1) return null;
  if (key === 'ArrowDown') return index < 0 ? 0 : (index + 1) % count;
  if (key === 'ArrowUp') return index < 0 ? count - 1 : (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

// --- DOM --------------------------------------------------------------------------------------------

const PLACED = ['margin', 'left', 'top', 'right', 'bottom', 'width', 'max-width', 'max-height', 'box-sizing'];

/**
 * Binds every menu inside `root`, now and after a patch: listeners are delegated from `root`.
 * Arrow keys, Home, End and letters move among the items; Escape, Tab, a click on the backdrop or on
 * an item close the menu and focus returns to the trigger; aria-expanded follows.
 * @param {Element} root
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {() => void} cleanup
 */
export function mountMenus(root, { signal } = {}) {
  const control = new AbortController();
  const listen = (target, type, handler, capture = false) => target.addEventListener(type, handler, { capture, signal: control.signal });
  let open = null;

  const dialogFor = (trigger) => {
    const id = trigger.getAttribute('data-menu-open');
    const dialog = id ? document.getElementById(id) : null;
    return dialog instanceof HTMLDialogElement && dialog.hasAttribute('data-menu') && root.contains(dialog) ? dialog : null;
  };
  const triggerFor = (dialog) => [...root.querySelectorAll('[data-menu-open]')].find((el) => el.getAttribute('data-menu-open') === dialog.id) ?? null;
  const itemsOf = (dialog) => [...dialog.querySelectorAll('[role="menuitem"]')].filter((el) => !el.disabled && el.getClientRects().length > 0);
  const unplace = (dialog) => { PLACED.forEach((name) => dialog.style.removeProperty(name)); dialog.removeAttribute('data-menu-mode'); };

  function place() {
    if (!open) return;
    const { dialog, trigger } = open;
    const { style } = dialog;
    unplace(dialog);
    style.setProperty('box-sizing', 'border-box');
    style.setProperty('margin', '0');
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const spot = menuPlacement(trigger.getBoundingClientRect(), { width: dialog.offsetWidth, height: dialog.offsetHeight }, viewport);
    dialog.setAttribute('data-menu-mode', spot.mode);
    if (spot.mode === 'sheet') {
      // UA styles pin a modal dialog to all four edges; the auto top margin drops it to the bottom one.
      style.setProperty('margin', 'auto 0 0 0');
      style.setProperty('width', '100%');
      style.setProperty('max-width', '100%');
      return;
    }
    style.setProperty('left', `${spot.left}px`);
    style.setProperty('top', `${spot.top}px`);
    style.setProperty('right', 'auto');
    style.setProperty('bottom', 'auto');
    style.setProperty('max-height', `${Math.max(120, spot.maxHeight)}px`);
  }

  function settle(dialog, trigger, refocus) {
    trigger?.setAttribute('aria-expanded', 'false');
    unplace(dialog);
    if (open?.dialog === dialog) open = null;
    if (refocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  }
  function closeMenu({ refocus = true } = {}) {
    if (!open) return;
    const { dialog, trigger } = open;
    if (dialog.open) dialog.close();
    settle(dialog, trigger, refocus);
  }
  function openMenu(trigger, focus = 'first') {
    const dialog = dialogFor(trigger);
    if (!dialog || dialog.open) return;
    closeMenu({ refocus: false });
    dialog.classList.add('ui-menu');
    dialog.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    open = { dialog, trigger };
    place();
    const items = itemsOf(dialog);
    (focus === 'last' ? items[items.length - 1] : items[0])?.focus({ preventScroll: true });
  }

  listen(root, 'click', (event) => {
    if (!open || !(event.target instanceof Element)) return;
    const { dialog } = open;
    if (event.target === dialog) {
      // A click on ::backdrop lands on the dialog itself, outside its box.
      const box = dialog.getBoundingClientRect();
      const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      if (!inside) closeMenu();
      return;
    }
    // Close before the item's own handlers run, so whatever they open sees focus on the trigger.
    if (dialog.contains(event.target) && event.target.closest('[role="menuitem"]')) closeMenu();
  }, true);

  listen(root, 'click', (event) => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-menu-open]') : null;
    if (!trigger || !root.contains(trigger)) return;
    if (dialogFor(trigger)?.open) closeMenu();
    else openMenu(trigger);
  });

  listen(root, 'keydown', (event) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest('[data-menu-open]');
    if (!open && trigger && root.contains(trigger) && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      openMenu(trigger, event.key === 'ArrowUp' ? 'last' : 'first');
      return;
    }
    if (!open || !open.dialog.contains(event.target)) return;
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      closeMenu();
      return;
    }
    const items = itemsOf(open.dialog);
    const at = items.indexOf(document.activeElement);
    let next = nextMenuIndex(event.key, at, items.length);
    if (next === null && event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const letter = event.key.toLowerCase();
      const order = items.map((_, i) => (at + 1 + i) % items.length);
      const found = order.find((i) => items[i].textContent.trim().toLowerCase().startsWith(letter));
      next = found ?? null;
    }
    if (next === null) return;
    event.preventDefault();
    items[next].focus({ preventScroll: true });
  });

  // A close this component did not start (the browser's own Escape handling, a patch, other code).
  listen(root, 'close', (event) => {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.hasAttribute('data-menu')) return;
    const lost = document.activeElement === document.body || dialog.contains(document.activeElement);
    settle(dialog, triggerFor(dialog), lost);
  }, true);

  listen(window, 'resize', place);
  listen(window, 'scroll', place, true);

  const stop = () => { closeMenu({ refocus: false }); control.abort(); };
  signal?.addEventListener('abort', stop, { once: true });
  return stop;
}
