// The trip top bar, its labelled actions and the More menu (blueprint 3.4, 4.2). Owner: F6.
//
// One <header class="tv-bar"> for all three views: the way back, the trip name, an optional slot the
// tab list docks in, the actions region and the PDF status line. Every action of the model is
// reachable inside the bar-actions region, whatever split a view asks for:
//   in the bar and in More   the bar button shows from 1024 px, the menu item below it
//   in the bar only          the bar button shows at every width
//   in More only             the menu item shows at every width
// A bar that holds more than fits wraps onto another row instead of running off the screen, and
// stuck.js publishes its real height as --tv-bar-h, so nothing pinned under it is covered (ruling
// R31). A second row on a phone breaks the 112 px cap on pinned chrome all the same: keep the phone
// bar to one row (the default split does: Trips, the name, More), and hide .tv-bar-title in the skin
// where the view shows no name in the phone bar.
// The width rules are in css/views/shared/trip.css and read the marks written here: data-in-menu on a
// bar button, data-narrow-items (the menu items meant for narrow screens) and data-more="narrow" on
// the region. The menu itself is menu.js markup (ruling R3) and is driven by mountMenus().
import { attr, cls, esc, flagChip, safeHref } from './html.js';
import { ICON_NAMES, icon } from './icons.js';
import { menuHtml } from './menu.js';

/** The actions the bar shows as labelled buttons unless a view asks for another split. */
export const BAR_KEYS = Object.freeze(['share', 'pdf', 'edit']);
/** The id of the More menu's dialog. One per page; a second trigger may name it (moreTriggerHtml). */
export const MORE_MENU_ID = 'tv-more';

const ID = /^[A-Za-z][\w-]*$/;
const pick = (wanted, fallback) => (ICON_NAMES.includes(wanted) ? wanted : fallback);
const ICONS = Object.freeze({
  share: 'share', pdf: 'file', edit: 'edit', tune: 'settings', 'read-view': pick('book', 'file'), regenerate: 'refresh', delete: 'trash',
});
const SETTINGS = Object.freeze({ key: 'settings', label: 'Settings', hint: 'Look, units and your account', href: '#/settings', icon: 'settings' });

const listOf = (actions) => (Array.isArray(actions) ? actions.filter((action) => action && typeof action.key === 'string') : []);
const slug = (value) => String(value ?? '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'bar';
const idOf = (id) => (typeof id === 'string' && ID.test(id) ? id : MORE_MENU_ID);
/** The offered actions named by `keys`, in the order of `keys`, each once. */
function chosen(actions, keys) {
  if (!Array.isArray(keys)) return actions;
  const seen = new Set();
  return keys.flatMap((key) => {
    const action = seen.has(key) ? null : actions.find((one) => one.key === key);
    seen.add(key);
    return action ? [action] : [];
  });
}

function actionHtml(action, { where, extra, inMenu }) {
  const focusKey = `${where}-${action.key}`;
  const glyph = icon(ICONS[action.key], 18);
  const mark = attr('data-in-menu', inMenu);
  if (action.key === 'read-view' || action.key === 'tune') {
    const href = safeHref(action.href);
    if (!href) return '';
    return `<a class="${cls('ui-btn', 'tv-action', extra)}" href="${esc(href)}"${attr('data-focus-key', focusKey)}${mark}>${glyph}<span>${esc(action.label)}</span></a>`;
  }
  const classes = cls('ui-btn', 'tv-action', { 'ui-btn--danger': action.danger }, extra);
  const label = action.key === 'pdf' ? `<span data-pdf-label>${esc(action.label)}</span>` : `<span>${esc(action.label)}</span>`;
  const pressed = action.key === 'edit' ? ' aria-pressed="false"' : '';
  return `<button type="button" class="${classes}"${attr('data-action', action.key)}${attr('data-focus-key', focusKey)}${pressed}${mark}>${glyph}${label}</button>`;
}

/**
 * Labelled action controls, with no wrapper: buttons with data-action, and Reader view as a link.
 * The Export PDF button holds a [data-pdf-label] span and Edit trip starts with aria-pressed="false";
 * the controller writes both.
 * @param {import('../contract.js').TripAction[]} actions  model.actions
 * @param {{ keys?: string[], where?: string, cls?: any, inMenu?: string[] }} [opts]
 *   keys    draw these actions only, in this order; every action when left out
 *   where   prefix of the focus keys ('bar' by default): give 'hero' to a row drawn in the hero
 *   inMenu  keys that the More menu of the same bar holds too (topbarHtml passes it)
 */
export function actionButtonsHtml(actions, { keys, where = 'bar', cls: extra, inMenu = [] } = {}) {
  const place = slug(where);
  return chosen(listOf(actions), keys).map((action) => actionHtml(action, { where: place, extra, inMenu: inMenu.includes(action.key) })).join('');
}

/**
 * The More trigger and its menu: one item per action, then the Settings link, which the bar shows
 * below 1024 px only (there the app nav is not on a trip page).
 * @param {import('../contract.js').TripAction[]} actions
 * @param {{ keys?: string[], id?: string, label?: string, settings?: boolean, cls?: any }} [opts]
 *   keys      list these actions only, in this order
 *   id        the dialog id, MORE_MENU_ID by default
 *   settings  false leaves the Settings link out
 */
export function moreMenuHtml(actions, { keys, id, label = 'More', settings = true, cls: extra } = {}) {
  const items = chosen(listOf(actions), keys).map((action) => ({
    key: action.key, label: action.label, hint: action.hint, href: action.key === 'read-view' || action.key === 'tune' ? action.href : '', danger: Boolean(action.danger), icon: ICONS[action.key],
  }));
  return menuHtml({ id: idOf(id), label, items: settings ? [...items, SETTINGS] : items, cls: extra });
}

/**
 * One more trigger for a More menu that the bar already holds (an action row in the hero).
 * mountMenus() opens the same dialog from it and places the panel under whichever trigger was used.
 * @param {{ menuId?: string, where?: string, label?: string, cls?: any }} [opts]
 */
export function moreTriggerHtml({ menuId, where = 'hero', label = 'More', cls: extra } = {}) {
  const id = idOf(menuId);
  return `<button type="button" class="${cls('ui-menu-btn', extra)}" data-menu-open="${id}" data-focus-key="${slug(where)}-more" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}">${icon('more', 20)}<span>${esc(label)}</span></button>`;
}

/** Which actions the bar draws and which the menu lists. Whatever is in neither list joins the menu. */
function split(actions, barKeys, menuKeys) {
  const bar = chosen(actions, Array.isArray(barKeys) ? barKeys : BAR_KEYS);
  if (!Array.isArray(menuKeys)) return { bar, menu: actions };
  const named = chosen(actions, menuKeys);
  const rest = actions.filter((action) => !bar.includes(action) && !named.includes(action));
  return { bar, menu: [...named, ...rest] };
}

/**
 * The top bar: exactly one <header class="tv-bar">.
 * @param {import('../contract.js').TripOverviewModel} model
 * @param {{ barKeys?: string[], menuKeys?: string[], tabsSlotFrom?: number, menuId?: string }} [opts]
 *   barKeys       actions drawn as labelled buttons, in this order (BAR_KEYS by default)
 *   menuKeys      actions listed in More, in this order; every action when left out. An action named
 *                 in neither list is added to More, so no split can lose one. Leave it out for the
 *                 bar of the previews (the buttons from 1024 px, More alone below it): a bar key that
 *                 is not also listed here keeps its button at every width, and three such buttons do
 *                 not fit one row on a phone (the bar wraps to three rows there, 149 px at 390 px).
 *   tabsSlotFrom  viewport width in px from which the controller docks the tab list in the bar; the
 *                 bar then holds the empty slot. Left out: no slot.
 */
export function topbarHtml(model, { barKeys, menuKeys, tabsSlotFrom, menuId } = {}) {
  const actions = listOf(model?.actions);
  const { bar, menu } = split(actions, barKeys, menuKeys);
  const menuHas = menu.map((action) => action.key);
  const both = bar.map((action) => action.key).filter((key) => menuHas.includes(key));
  const narrowOnly = menu.every((action) => both.includes(action.key));
  const buttons = actionButtonsHtml(bar, { where: 'bar', inMenu: both });
  const more = moreMenuHtml(menu, { id: menuId });
  const flags = (Array.isArray(model?.flags) ? model.flags : []).slice(0, 3).map((code) => flagChip(code, { size: 20 })).join('');
  const dates = model?.dates?.text ? `<span class="tv-bar-dates">${esc(model.dates.text)}</span>` : '';
  const from = typeof tabsSlotFrom === 'number' || (typeof tabsSlotFrom === 'string' && /^\d+$/.test(tabsSlotFrom)) ? Number(tabsSlotFrom) : NaN;
  const slot = Number.isInteger(from) && from >= 0 ? `<div class="tv-tabs-slot" data-tabs-slot data-slot-from="${from}"></div>` : '';
  return `<header class="tv-bar">
    <a href="#/" class="tv-back" data-focus-key="back">${icon('back', 18)}<span>Trips</span></a>
    <p class="tv-bar-title">${flags ? `<span class="tv-bar-flags">${flags}</span>` : ''}<span class="tv-bar-name">${esc(model?.title)}</span>${dates}</p>
    ${slot}
    <div class="tv-bar-actions" data-region="bar-actions"${attr('data-narrow-items', [...both, SETTINGS.key].join(' '))}${attr('data-more', narrowOnly ? 'narrow' : null)}>
      ${buttons}${more}
    </div>
    <p class="tv-pdf-status" data-pdf-status role="status"></p>
  </header>`;
}
