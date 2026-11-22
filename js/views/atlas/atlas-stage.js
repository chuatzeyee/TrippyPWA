// The stage of the Atlas page, as pure builders: the plate switcher, the interactive plate, the list
// of places and the place card. Which plate, which place and which of its plans are shown is the
// page's own state: it lives on the stage element (data-plate, data-place), never in a module.
// Pins on the plate are pointer targets; the list and the card's Previous and Next are the keyboard
// and touch path to every place (blueprint section 10, row 23). Owner: VC.
import { attr, button, cls, esc, link } from '../shared/html.js';
import { coverFrameHtml } from '../shared/photo-frame.js';
import { groupPlaces, placesListHtml } from '../shared/world-map.js';
import { toneOf } from './parts.js';
import { placeEntries } from './atlas-places.js';
import { labelPins, plateArcs, plateSvg } from './plates.js';
import { atlasPlates, plateFrame, plateLook } from './region-plates.js';

/** The size a plate is drawn for until its frame is measured: the phone frame, 390 by 292. */
export const FIRST_SIZE = Object.freeze({ width: 358, height: 268 });
const list = (value) => (Array.isArray(value) ? value : []);

export { placeEntries };

/** The entry Previous (-1) or Next (1) leads to; the list is a ring. */
export function stepEntry(entries, index, delta) {
  const count = list(entries).length;
  if (!count) return 0;
  return (((index + delta) % count) + count) % count;
}

/** Where a plan stands, for the place card. A past plan is a past plan, never a trip taken. */
export function placeStatus(card) {
  if (card?.phase === 'live') return `Happening now, day ${card.dayNumber} of ${card.dates?.dayCount}`;
  if (card?.phase === 'upcoming') return card.daysToGo === 1 ? 'Tomorrow' : `In ${card.daysToGo} days`;
  return card?.phase === 'past' ? 'Past plan' : 'No dates yet';
}

/**
 * The inside of the place card for one entry: cover, city, title, status, dates, the plain links
 * into the plan, and Previous and Next.
 * @returns {string} '' when the entry does not exist
 */
export function placeCardHtml(model, entries, index, ctx) {
  const entry = list(entries)[index];
  const group = entry ? groupPlaces(model?.pins).find((one) => one.key === entry.key) : null;
  if (!entry || !group) return '';
  const card = entry.tripId ? model.cardsById[entry.tripId] : null;
  const where = group.country && group.country !== group.place ? `${group.place}, ${group.country}` : group.place;
  const frame = { ratio: '3x2', credit: false, sizes: '(min-width: 1024px) 360px, 120px', animate: Boolean(ctx?.animate), name: group.place, cls: 'atl-ap-card-ph', tag: 'span' };
  const cover = card ? coverFrameHtml(card.cover, { ...frame, flag: card.flags?.[0] ?? '', tone: toneOf(card.id) }) : coverFrameHtml(null, frame);
  const status = card
    ? `${placeStatus(card)}${entry.of > 1 ? `. Plan ${entry.plan + 1} of ${entry.of} here` : ''}`
    : 'Every arc on the map starts here.';
  const today = card?.phase === 'live' && card.todayHref ? link(card.todayHref, 'Open today', { cls: 'ui-btn ui-btn--primary', focusKey: 'place-today' }) : '';
  const open = card ? link(card.wholeHref, 'Open trip', { cls: cls('ui-btn', { 'ui-btn--primary': !today }), focusKey: 'place-open' }) : '';
  const steps = entries.length > 1
    ? `<p class="atl-ap-card-steps">${button('Previous', { cls: 'ui-btn atl-ap-step', focusKey: 'place-prev', attrs: { 'data-atl-step': '-1' } })}<span class="atl-ap-card-pos">${index + 1} of ${entries.length}</span>${button('Next', { cls: 'ui-btn atl-ap-step', focusKey: 'place-next', attrs: { 'data-atl-step': '1' } })}</p>` : '';
  return `${cover}
    <div class="atl-ap-card-text">
      <p class="atl-ap-card-city">${esc(where)}</p>
      <h3 class="atl-ap-card-title">${esc(card ? card.title : 'Home')}</h3>
      <p class="atl-ap-card-status">${esc(status)}</p>
      ${card ? `<p class="atl-ap-card-dates">${esc(card.dates?.text)}</p>` : ''}
    </div>
    ${today || open ? `<p class="atl-ap-card-acts">${today}${open}</p>` : ''}
    ${steps}
    <p class="atl-ap-card-hint">Pick a pin, or a place in the list, to see its plan here.</p>`;
}

/**
 * One plate of the stage as SVG, interactive, for a frame of the given size in CSS px.
 * @param {import('../contract.js').DashboardModel} model
 * @param {{ plate?: string, selected?: string, width?: number, height?: number }} [opts]
 */
export function stagePlateSvg(model, { plate = 'world', selected = '', width = FIRST_SIZE.width, height = FIRST_SIZE.height } = {}) {
  const look = plateLook(plate);
  return plateSvg({
    pins: model.pins, arcs: plateArcs(model), labels: labelPins(model), view: plateFrame(plate, width / height, model.pins), cssW: width,
    label: `${look.name} plate. Pick a place here, or in the list under the map.`, land: look.land, grat: look.grat, interactive: true, selected,
  });
}

/** True when the place of a pin key is inside what a plate draws for a frame of this shape. */
export function plateHolds(model, plate, key, aspect) {
  const group = groupPlaces(model?.pins).find((one) => one.key === key);
  if (!group) return false;
  const view = plateFrame(plate, aspect, model.pins);
  const [lat, lon] = group.at;
  return lat <= view.north && lat >= view.south && lon >= view.west && lon <= view.east;
}

/** The plate switcher: a radio group. A regional plate can be picked once its outline has arrived. */
export function plateSwitcherHtml(model) {
  const plates = atlasPlates(model.pins);
  if (plates.length < 2) return '';
  const options = plates.map((plate, i) => `<label class="atl-plate-opt"><input type="radio" name="atl-plate"${attr('value', plate.id)}${attr('data-focus-key', `plate-${plate.id}`)}${attr('checked', i === 0)}${attr('disabled', plate.land !== 'world')}><span>${esc(plate.name)}</span></label>`).join('');
  return `<fieldset class="atl-plates" data-atl-plates><legend class="ui-vh">Map plate</legend>${options}</fieldset>`;
}

/**
 * The stage: the plate, the list of places and the card of the first, most current place.
 * @returns {string} '' when no place can be drawn
 */
export function stageHtml(model, ctx) {
  const entries = placeEntries(model);
  if (!entries.length) return '';
  const [first] = entries;
  const kind = groupPlaces(model.pins).find((one) => one.key === first.key)?.kind ?? 'past';
  return `<section class="atl-ap-stage" aria-labelledby="atl-ap-map-h" data-atl-stage data-plate="world"${attr('data-place', first.key)}>
    <h2 class="ui-vh" id="atl-ap-map-h">Map</h2>
    <div class="atl-ap-map"><span class="atl-plate-frame" data-atl-frame>${stagePlateSvg(model, { selected: first.key })}</span></div>
    <div class="atl-ap-places">${placesListHtml(model.pins, { selected: first.key, label: 'Places' })}</div>
    <aside class="atl-ap-card" data-atl-card aria-live="polite" aria-label="Selected place"${attr('data-kind', kind)}>${placeCardHtml(model, entries, 0, ctx)}</aside>
  </section>`;
}
