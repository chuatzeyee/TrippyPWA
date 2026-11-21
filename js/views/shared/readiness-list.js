// "Before you go" (blueprint 2.2, 4.2, 7.3): the readiness list, the chip, the meter and the Prep
// tab's card. All four are drawn from one Readiness object, so the page shows one count. The landing
// rows never write a tick; the Prep card's checkboxes do, through data-tick-key. Owner: F5.
import { attr, cls, esc, safeHref, visuallyHidden } from './html.js';
import { icon } from './icons.js';

const TITLE = 'Before you go';
const DEVICE_NOTE = 'Ticks are saved on this device.';
const STATE_WORDS = { done: 'Done:', todo: 'To do:', checking: 'Checking:' };
const STATE_ICONS = { done: 'check', todo: '', checking: 'clock' };
const DUE_STATES = ['overdue', 'soon', 'later'];
const HEADINGS = ['h2', 'h3', 'h4'];

const stateOf = (item) => (Object.hasOwn(STATE_WORDS, item.state) ? item.state : 'todo');
const slug = (value) => String(value ?? '').replace(/[^\w-]+/g, '-');
const countAttrs = (readiness) => `${attr('data-ready-done', readiness.done)}${attr('data-ready-total', readiness.total)}`;
const deviceNote = (readiness, name, key = '') => (readiness.perDevice ? `<p class="${name}"${attr('data-key', key || null)}>${icon('device', 16)}<span>${DEVICE_NOTE}</span></p>` : '');

/** The control that opens a row's section card or the Prep tab; the controller keeps aria-expanded in step. */
function jumpButton(item, focusKey, label = item.actionLabel, key = '') {
  return `<button type="button" class="ui-ready-action"${attr('data-key', key || null)}${attr('data-section-jump', item.target)}${attr('aria-controls', `td-section-${item.target}`)} aria-expanded="false"${attr('data-focus-key', focusKey)}><span>${esc(label)}</span>${icon('chevron-right', 16)}</button>`;
}

/**
 * The meter: one cell per applicable area, the done ones filled.
 * @param {import('../contract.js').Readiness|null} readiness
 * @param {{ silent?: boolean }} [opts] silent: a picture only (aria-hidden), where the count is said next to it
 */
export function readinessMeterHtml(readiness, { silent = false } = {}) {
  if (!readiness) return '';
  const total = Math.max(0, Math.min(8, Math.round(readiness.total) || 0));
  const cells = Array.from({ length: total }, (_, i) => `<i class="ui-meter-cell"${i < readiness.done ? ' data-on' : ''}></i>`).join('');
  const said = silent ? ' aria-hidden="true"' : ` role="img"${attr('aria-label', `${readiness.done} of ${readiness.total} ready`)}`;
  return `<span class="ui-meter"${said}>${cells}</span>`;
}

/**
 * The chip on a trip card: "2 to do", "Ready", or "Checking" while only a check is open. A pending
 * area is never part of the number.
 * @param {import('../contract.js').Readiness|null} readiness
 */
export function readinessChipHtml(readiness) {
  if (!readiness) return '';
  const state = readiness.todo > 0 ? 'todo' : readiness.done >= readiness.total ? 'ready' : 'checking';
  const text = state === 'todo' ? `${readiness.todo} to do` : state === 'ready' ? 'Ready' : 'Checking';
  return `<span class="ui-ready-chip" data-ready="${state}">${readinessMeterHtml(readiness)}<span class="ui-ready-chip-text">${esc(text)}</span></span>`;
}

function rowHtml(item, { href, id }) {
  const state = stateOf(item);
  const focusKey = `ready-${id ? `${id}-` : ''}${item.area}`;
  const due = item.due ? `<span class="ui-ready-due" data-due="${DUE_STATES.includes(item.due.state) ? item.due.state : 'later'}">Due ${esc(item.due.text)}</span>` : '';
  const detail = item.detail ? `<span class="ui-ready-detail">${esc(item.detail)}</span>` : '';
  const action = href
    ? `<a class="ui-ready-action" href="${esc(href)}"${attr('data-focus-key', focusKey)}><span>${esc(item.actionLabel)}</span>${icon('chevron-right', 16)}</a>`
    : jumpButton(item, focusKey);
  return `<li class="ui-ready-row"${attr('data-key', item.area)}${attr('data-area', item.area)} data-state="${state}"${attr('data-source', item.source === 'device' ? 'device' : null)}>
      <span class="ui-ready-mark" aria-hidden="true">${icon(STATE_ICONS[state], 16)}</span>
      <span class="ui-ready-main">
        <span class="ui-ready-label">${esc(item.label)}</span>
        <span class="ui-ready-status">${visuallyHidden(STATE_WORDS[state])} ${esc(item.status)}</span>
        ${detail}${due}
      </span>
      ${action}
    </li>`;
}

/**
 * The list. While the trip is live (`readiness.collapsed`) it is one line with the count.
 * @param {import('../contract.js').Readiness|null} readiness
 * @param {{ region?: boolean, heading?: 'h2'|'h3'|'h4', id?: string, href?: string, only?: 'todo', max?: number,
 *           title?: string, intro?: string, head?: boolean, cls?: any }} [opts]
 *   region   adds data-region="readiness" (the trip landing; a page may hold one). The region's
 *            children are then keyed and it ends with a visually hidden <p role="status"> that says
 *            the count, so a change is announced when patchRegions() brings it. That line is then
 *            the one place the count is read: the visible count and the meter are aria-hidden
 *   heading  h2 by default, and the root is then a labelled section; h3 or h4 inside a card
 *   id       makes the heading id and the focus keys unique when a page draws several lists
 *   href     the dashboard: each row links to the plan instead of opening a section on this page
 *   only, max  show the rows still to do, or the first few; the count stays the whole plan's
 *   title    the words of the heading, "Before you go" by default
 *   intro    one sentence of plain text under the head: <p class="ui-ready-intro">
 *   head     false leaves the head out (heading, count and meter), for a view that draws its own: the
 *            root is then named by aria-label, so no hidden second heading is left in the page
 */
export function readinessListHtml(readiness, { region = false, heading = 'h2', id = '', href = '', only, max, title, intro, head = true, cls: extra } = {}) {
  if (!readiness) return '';
  const name = typeof title === 'string' && title.trim() ? title.trim() : TITLE;
  const lead = typeof intro === 'string' && intro.trim() ? `<p class="ui-ready-intro"${region ? ' data-key="intro"' : ''}>${esc(intro.trim())}</p>` : '';
  const key = slug(id);
  const shared = `${countAttrs(readiness)}${region ? ' data-region="readiness"' : ''}`;
  const classes = cls('ui-ready', { 'is-ready': readiness.done >= readiness.total, 'is-collapsed': readiness.collapsed }, extra);
  // With a status line (region) the count would be read twice in browse mode: the visible one is hidden.
  const count = `<span class="ui-ready-count"${region ? ' aria-hidden="true"' : ''}>${esc(readiness.headline)}</span>`;
  const meter = readinessMeterHtml(readiness, { silent: region });
  const link = safeHref(href);
  // The landing's region: every child is keyed, so patchRegions() keeps the nodes, and the count is
  // also said in a polite status that stays in the page: a tick elsewhere is announced when it lands.
  const keyed = (part) => (region ? ` data-key="${part}"` : '');
  const said = region ? `<p class="ui-vh" data-key="said" role="status">${esc(`${name}: ${readiness.headline}`)}</p>` : '';
  if (readiness.collapsed) {
    const open = readiness.items.find((item) => stateOf(item) === 'todo');
    const action = open && !link ? jumpButton(open, `ready-${key ? `${key}-` : ''}${open.area}`, open.actionLabel, region ? 'open' : '') : '';
    return `<div class="${classes}"${shared}>
    <p class="ui-ready-line"${keyed('line')}><span class="ui-ready-title">${esc(name)}</span> ${count} ${meter}</p>
    ${action}${said}
  </div>`;
  }
  const level = HEADINGS.includes(heading) ? heading : 'h2';
  const titleId = `ui-ready-${key ? `${key}-` : ''}title`;
  const tag = level === 'h2' ? 'section' : 'div';
  const wanted = only === 'todo' ? readiness.items.filter((item) => stateOf(item) === 'todo') : readiness.items;
  const rows = (Number.isInteger(max) && max >= 0 ? wanted.slice(0, max) : wanted).map((item) => rowHtml(item, { href: link, id: key })).join('');
  const named = tag !== 'section' ? '' : head === false ? attr('aria-label', name) : ` aria-labelledby="${titleId}"`;
  const top = head === false ? '' : `<div class="ui-ready-head"${keyed('head')}><${level} class="ui-ready-title" id="${titleId}">${esc(name)}</${level}>${count}${meter}</div>`;
  return `<${tag} class="${classes}"${shared}${named}>
    ${top}${lead}
    <ul class="ui-ready-list"${keyed('list')}>${rows}</ul>
    ${deviceNote(readiness, 'ui-ready-note', region ? 'note' : '')}${said}
  </${tag}>`;
}

function prepRowHtml(item) {
  const state = stateOf(item);
  const status = `<span class="ui-prep-status">${esc(item.status)}</span>`;
  const open = `<li class="ui-prep-row"${attr('data-key', item.area)}${attr('data-area', item.area)} data-state="${state}">`;
  if (!item.tickKey) {
    return `${open}<span class="ui-prep-label">${esc(item.label)}</span>${status}${jumpButton(item, `prep-${item.area}`)}</li>`;
  }
  const done = state === 'done';
  const settled = done && item.source !== 'device';
  return `${open}<label class="ui-prep-check"><input type="checkbox"${attr('data-tick-key', item.tickKey)}${attr('data-focus-key', `prep-${item.area}`)}${attr('checked', done)}${attr('disabled', settled)}><span class="ui-prep-label">${esc(item.label)}</span></label>${status}</li>`;
}

/**
 * The Prep tab's "Trip prep" card in view mode: the same areas, states and headline as the list. A
 * row with a tick key is a checkbox (data-tick-key is the trip-quick key it writes); a row that data
 * already settled is checked and disabled; a row with no tick key (the entry row, and a part-booked
 * travel or stay row, which a tick could not settle) has no box and a button that opens its card.
 * @param {import('../contract.js').Readiness|null} readiness
 * @param {{ cls?: any }} [opts]
 */
export function prepCardHtml(readiness, { cls: extra } = {}) {
  if (!readiness) return '';
  return `<div class="${cls('ui-prep', { 'is-ready': readiness.done >= readiness.total }, extra)}"${countAttrs(readiness)}>
    <div class="ui-prep-head"><h3 class="ui-prep-title">Trip prep</h3><span class="ui-prep-count">${esc(readiness.headline)}</span>${readinessMeterHtml(readiness)}</div>
    <ul class="ui-prep-list">${readiness.items.map(prepRowHtml).join('')}</ul>
    ${deviceNote(readiness, 'ui-prep-note')}
  </div>`;
}
