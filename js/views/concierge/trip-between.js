// The `between` and `planOutro` parts of the Concierge trip landing: where you will be (the areas,
// each opening the Discover tab), ways to save (two tips and the way to the rest), the "Day by day"
// heading that leads into the day cards, and the foot note after them. Owner: VB.
import { attr, button, esc } from '../shared/html.js';
import { tileFrameHtml } from '../shared/photo-frame.js';
import { capital, numberWord } from './words.js';
import { secHead } from './parts.js';

const TONES = 7;

function townsSection(areas, ctx) {
  if (!areas.length) return '';
  const n = areas.length;
  const tiles = areas.map((area, i) => {
    const tile = tileFrameHtml(area.photo || null, { tag: 'span', animate: ctx.animate, credit: false, tone: (i % TONES) + 1, sizes: '(min-width: 900px) 120px, 124px' });
    return `<li class="con-town-item"><button type="button" class="con-town" data-con-tab="towns"${attr('data-focus-key', `town-${i}`)}>${tile}<span class="con-town-name">${esc(area.name)}</span></button></li>`;
  }).join('');
  return `<section class="con-sec con-towns-sec" aria-labelledby="con-towns-h">
    ${secHead({ id: 'con-towns-h', title: 'Where you will be', count: n, line: `${capital(numberWord(n))} ${n === 1 ? 'area' : 'areas'}. Each opens in Discover.` })}
    <ul class="con-towns" data-keep-scroll="towns">${tiles}</ul>
  </section>`;
}

function savesSection(tips) {
  const shown = Array.isArray(tips?.shown) ? tips.shown : [];
  if (!shown.length) return '';
  const total = Number.isFinite(tips.total) ? Math.max(tips.total, shown.length) : shown.length;
  const count = capital(numberWord(shown.length));
  const line = total > shown.length ? `${count} of the ${total} tips Trippy found for this trip.` : `${count} ${shown.length === 1 ? 'tip' : 'tips'} Trippy found for this trip.`;
  const items = shown.map((tip) => `<article class="con-save">
      ${tip.saving ? `<p class="con-save-amt">${esc(tip.saving)}</p>` : ''}
      <div class="con-save-body"><h3 class="con-save-title">${esc(tip.title)}</h3><p class="con-save-text">${esc(tip.text)}</p></div>
    </article>`).join('');
  const all = total > shown.length
    ? `<p class="con-saves-more">${button(`See all ${total} in Spending`, { cls: 'con-link', focusKey: 'saves-all', attrs: { 'data-con-tab': 'spending' } })}</p>` : '';
  return `<section class="con-sec con-saves-sec" aria-labelledby="con-saves-h">
    ${secHead({ id: 'con-saves-h', title: 'Ways to save', line })}
    <div class="con-saves">${items}</div>${all}
  </section>`;
}

/**
 * @param {import('../contract.js').TripOverviewModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 * @returns {string} '' for a plan with no days: there are no day cards to lead into
 */
export function betweenHtml(model, ctx) {
  if (!model.days.length) return '';
  const head = `<div class="con-sec con-daybyday">${secHead({ id: 'con-dbd-h', title: 'Day by day', line: 'Each day opens to its stops, times and costs.' })}</div>`;
  return `<div class="con-between">${townsSection(model.areas, ctx)}${savesSection(model.tips)}${head}</div>`;
}

/** The foot note of the Plan panel. The credits are printed by the page foot, once. */
export function outroHtml(model) {
  if (!model.days.length) return '';
  return '<p class="con-foot-note">Weather is the typical range for the season, not a forecast. Costs are estimates per person, for activities only.</p>';
}
