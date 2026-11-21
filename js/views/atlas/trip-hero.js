// The hero of the Atlas trip landing: the cover (status chip in flaps, credit, flags and title, dates,
// length, travellers), a map slot beside it from 1024 px, the action row for phones, the glance
// ledger and the controller's notes. Owner: VC.
import { cls, esc } from '../shared/html.js';
import { icon } from '../shared/icons.js';
import { flapDigitsHtml } from '../shared/flap.js';
import { glanceHtml } from '../shared/glance.js';
import { actionButtonsHtml } from '../shared/trip-topbar.js';
import { coverBlockHtml, enterClass, flagsHtml, toneOf } from './parts.js';
import { lengthText, sharedLine } from './words.js';
import { glanceFacts, statusParts, titleSize } from './trip-words.js';

const HERO_ACTIONS = Object.freeze(['share', 'pdf', 'edit']);
/** The viewport width from which the map sits beside the cover; below it, it sits in Day by day. */
export const MAP_SPLIT = 1024;

/** The status chip: the hero-status region. Small, and never around the h1 or the image. */
function statusHtml(model) {
  const status = statusParts(model);
  const words = (value) => `<span class="atl-count-words">${esc(value)}</span>`;
  let inner = words(status.words);
  if (status.kind === 'countdown') inner = `${flapDigitsHtml(status.value, { cls: 'atl-flaps' })}${words(status.words)}`;
  if (status.kind === 'day') {
    inner = `<span class="atl-count-row">${words('Day')}${flapDigitsHtml(status.value, { cls: 'atl-flaps' })}${words(`of ${status.total}`)}</span>`
      + `${status.next ? `<span class="atl-count-next">${esc(status.next)}</span>` : ''}`;
  }
  return `<div class="${cls('atl-cover-count', `atl-cover-count--${status.kind}`)}" data-region="hero-status">${inner}</div>`;
}

function overHtml(model) {
  const size = titleSize(model.title);
  const travellers = Number.isFinite(model.travellers) && model.travellers > 0
    ? `<span>${icon('people', 16)}${esc(model.travellers)} ${model.travellers === 1 ? 'traveller' : 'travellers'}</span>` : '';
  const shared = model.role === 'viewer' || model.role === 'editor' ? `<span>${esc(sharedLine({ shared: true, role: model.role }))}</span>` : '';
  const length = lengthText(model.dates);
  return `<h1 class="${cls('atl-cover-title', { [`atl-cover-title--${size}`]: size })}">${flagsHtml(model.flags, { size: 32 })}${esc(model.title)}</h1>
    ${model.placeLine ? `<p class="atl-cover-place">${esc(model.placeLine)}</p>` : ''}
    <p class="atl-cover-dates">${esc(model.dates?.text)}</p>
    <p class="atl-cover-meta">${length ? `<span>${icon('calendar', 16)}${esc(length)}</span>` : ''}${travellers}${shared}</p>`;
}

/**
 * @param {import('../contract.js').TripOverviewModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 * @returns {string} the `hero` part: the only h1, the hero-status and glance regions, ctx.slots.notes once
 */
export function heroHtml(model, ctx) {
  const hasDays = Array.isArray(model.days) && model.days.length > 0;
  const frame = {
    priority: true, animate: Boolean(ctx?.animate), carry: 'cover', sizes: '(min-width: 1024px) 520px, 100vw',
    name: model.title, flag: model.flags?.[0] ?? '', tone: toneOf(model.id),
  };
  const cover = coverBlockHtml(model.cover, { cls: 'atl-hero-cover', top: statusHtml(model), over: overHtml(model), frame });
  const slot = hasDays ? `<div class="atl-hero-map" data-map-slot data-map-from="${MAP_SPLIT}"></div>` : '';
  const actions = actionButtonsHtml(model.actions, { keys: HERO_ACTIONS, where: 'hero' });
  return `<div class="${cls('atl-hero', enterClass(ctx))}" id="td-hero">
    ${cover}
    ${slot}
  </div>
  ${actions ? `<p class="atl-tacts">${actions}</p>` : ''}
  ${glanceHtml(glanceFacts(model.glance, { live: model.phase === 'live' }), { jumps: model.readiness ? ['readiness'] : [], splitAbout: true, cls: 'atl-glance' })}
  <div class="atl-notes">${ctx?.slots?.notes ?? ''}</div>`;
}
