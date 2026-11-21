// The essentials row of the Atlas trip page on a wide screen: one card for each section card of the
// plan (Flights or Transport, Entry requirements, Where to stay) and, before the trip, one for the
// reservations. A card says where that part of the plan stands and opens its section as a panel
// directly under the row; the row itself never moves (trip.js does the opening). Owner: VC.
import { attr, esc } from '../shared/html.js';
import { icon } from '../shared/icons.js';

/** Every section card a plan can have, in page order. The cards of sections a plan lacks are hidden on mount. */
export const ESSENTIALS = Object.freeze([
  Object.freeze({ target: 'flights', label: 'Flights', open: 'See flights' }),
  Object.freeze({ target: 'transport', label: 'Transport', open: 'See transport' }),
  Object.freeze({ target: 'entry', label: 'Entry requirements', open: 'See the details' }),
  Object.freeze({ target: 'accommodation', label: 'Where to stay', open: 'See stays' }),
]);

const STATES = Object.freeze(['done', 'todo', 'checking']);
const stateOf = (item) => (STATES.includes(item?.state) ? item.state : 'todo');
const line = (className, text) => (text ? `<span class="${className}">${esc(text)}</span>` : '');

function card({ key, label, item, told, action, attrs, chevron }) {
  return `<button type="button" class="atl-ess-card"${attr('data-key', key)}${attrs}${attr('data-focus-key', `ess-${key}`)}${attr('data-state', told && item ? stateOf(item) : null)}>
    <span class="atl-ess-name">${esc(label)}</span>
    ${told ? line('atl-ess-status', item?.status) : ''}
    ${line('atl-ess-detail', item?.detail)}
    <span class="atl-ess-go">${action}${icon(chevron, 16)}</span>
  </button>`;
}

/**
 * The row. Before the trip a card carries the status and the sentence of its readiness area; while
 * the plan is live it keeps the sentence only; a past plan has the names alone.
 * @param {import('../contract.js').TripOverviewModel} model
 */
export function essentialsHtml(model) {
  const readiness = model?.readiness ?? null;
  const items = Array.isArray(readiness?.items) ? readiness.items : [];
  const told = Boolean(readiness) && !readiness.collapsed;
  const cards = ESSENTIALS.map((section) => {
    const item = items.find((entry) => entry.target === section.target);
    return card({
      key: section.target, label: section.label, item, told, chevron: 'chevron-down',
      action: `<span class="atl-ess-show">${esc(told && item?.actionLabel ? item.actionLabel : section.open)}</span><span class="atl-ess-hide">Hide</span>`,
      attrs: `${attr('data-atl-ess', section.target)}${attr('aria-controls', `td-section-${section.target}`)} aria-expanded="false"`,
    });
  });
  const checklist = told ? items.find((entry) => entry.target === 'checklist') : null;
  if (checklist) {
    cards.push(card({
      key: 'checklist', label: checklist.label || 'Reservations', item: checklist, told, chevron: 'chevron-right',
      action: `<span>${esc(checklist.actionLabel || 'Open the checklist')}</span>`,
      attrs: `${attr('data-section-jump', 'checklist')}${attr('aria-controls', 'td-section-checklist')} aria-expanded="false"`,
    }));
  }
  return `<div class="atl-ess" role="group" aria-label="Flights, entry and stay" data-region="essentials">${cards.join('')}</div>`;
}
