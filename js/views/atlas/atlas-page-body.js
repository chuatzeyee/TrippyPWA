// The drawn half of the Atlas page (#/atlas): the plate switcher, the interactive plate with its list
// of places and the place card, the passport, the calendar bars and the facts, and the code that
// runs the stage. Only this page needs it, so it is a chunk of its own that atlas-page.js imports
// when the page is asked for (ruling R40). The regional outlines arrive by a dynamic import; the
// world plate is what is shown until they do, and if they do not. Owner: VC.
import { esc } from '../shared/html.js';
import { groupPlaces, landDefsSvg } from '../shared/world-map.js';
import { placeCardHtml, placeEntries, plateHolds, plateSwitcherHtml, stageHtml, stagePlateSvg, stepEntry } from './atlas-stage.js';
import { factsHtml, monthsHtml } from './logbook.js';
import { legendHtml } from './parts.js';
import { passportLine, stampRows, stampsHtml } from './passport.js';

function passportHtml(model) {
  const rows = stampRows(model.stats?.byCountry);
  if (!rows.stamped.length && !rows.coming.length) return '';
  return `<section class="atl-ap-pass" id="atl-passport" aria-labelledby="atl-pass-h">
    <div class="atl-ap-pass-head"><h2 class="atl-ap-h2" id="atl-pass-h">Passport</h2><p>${esc(passportLine(rows))}</p></div>
    <div class="atl-ap-pass-grid">
      <div class="atl-ap-stamps">${stampsHtml(rows)}</div>
      <div class="atl-ap-side">${monthsHtml(model.stats)}${factsHtml(model.stats, model.pins)}</div>
    </div>
  </section>`;
}

/**
 * Everything between the head and the foot of a drawn Atlas page.
 * @param {import('../contract.js').DashboardModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 * @returns {string}
 */
export function bodyHtml(model, ctx) {
  return `<div class="atl-ap-bar">${plateSwitcherHtml(model)}${legendHtml()}</div>
  ${stageHtml(model, ctx)}
  ${passportHtml(model)}`;
}

const sizeOf = (frame) => ({ width: Math.round(frame.clientWidth), height: Math.round(frame.clientHeight) });

/**
 * Called once per mounted root. The stage is the page's own: which plate, which place and which
 * plan are shown is kept on the stage element and in this closure, and everything is delegated
 * from `root`. The plate is drawn for the width its frame really has, and again when that changes.
 */
export function mountStage(root, model, ctx) {
  const stage = root.querySelector('[data-atl-stage]');
  const frame = stage?.querySelector('[data-atl-frame]');
  const card = stage?.querySelector('[data-atl-card]');
  if (!stage || !frame || !card) return;
  const entries = placeEntries(model);
  const groups = groupPlaces(model.pins);
  const state = { plate: 'world', index: 0, alive: true, drawn: '' };
  const still = { ...ctx, animate: false };

  const draw = (force = false) => {
    const { width, height } = sizeOf(frame);
    if (width < 40 || height < 40) return;
    const key = `${state.plate}|${entries[state.index]?.key}|${width}x${height}`;
    if (!force && key === state.drawn) return;
    frame.innerHTML = stagePlateSvg(model, { plate: state.plate, selected: entries[state.index]?.key ?? '', width, height });
    state.drawn = key;
  };
  const setPlate = (id) => {
    state.plate = id;
    stage.setAttribute('data-plate', id);
    for (const radio of root.querySelectorAll('input[name="atl-plate"]')) radio.checked = radio.value === id;
    draw();
  };
  const show = (index, focusStep = '') => {
    const entry = entries[index];
    if (!entry) return;
    state.index = index;
    stage.setAttribute('data-place', entry.key);
    for (const item of stage.querySelectorAll('button[data-place]')) item.setAttribute('aria-pressed', String(item.getAttribute('data-place') === entry.key));
    card.innerHTML = placeCardHtml(model, entries, index, still);
    card.setAttribute('data-kind', groups.find((group) => group.key === entry.key)?.kind ?? 'past');
    if (focusStep) card.querySelector(`[data-atl-step="${focusStep}"]`)?.focus({ preventScroll: true });
    const { width, height } = sizeOf(frame);
    if (state.plate !== 'world' && width > 0 && height > 0 && !plateHolds(model, state.plate, entry.key, width / height)) setPlate('world');
    else draw();
  };
  const pick = (el) => {
    const key = el.getAttribute('data-place');
    const index = entries.findIndex((entry) => entry.key === key);
    if (index >= 0) show(index);
  };
  const onClick = (event) => {
    const el = event.target instanceof Element ? event.target : null;
    const step = el?.closest('[data-atl-step]');
    const place = el?.closest('[data-place]');
    if (step && card.contains(step)) show(stepEntry(entries, state.index, Number(step.getAttribute('data-atl-step')) < 0 ? -1 : 1), step.getAttribute('data-atl-step'));
    else if (place && stage.contains(place)) pick(place);
  };
  const onKey = (event) => {
    const pin = event.target instanceof Element && (event.key === 'Enter' || event.key === ' ') ? event.target.closest('[data-place][role="button"]') : null;
    if (!pin || !stage.contains(pin)) return;
    event.preventDefault();
    pick(pin);
  };
  const onChange = (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === 'atl-plate' && event.target.checked) setPlate(event.target.value);
  };
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  root.addEventListener('change', onChange);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  observer?.observe(frame);
  draw(true);

  // The regional outlines: fetched once the page is up. Until they are here only the world can be
  // picked; if they never come, the regional plates are taken off the switcher.
  const switcher = root.querySelector('[data-atl-plates]');
  if (switcher) {
    import('../shared/world-land-regions.js').then(({ LAND_EUROPE, LAND_APAC }) => {
      if (!state.alive) return;
      const holder = root.querySelector('[data-atl-defs]');
      if (holder) holder.innerHTML = landDefsSvg({ europe: LAND_EUROPE, apac: LAND_APAC });
      for (const radio of switcher.querySelectorAll('input[disabled]')) radio.disabled = false;
      switcher.setAttribute('data-atl-outlines', 'ready');
    }).catch(() => {
      if (state.alive) switcher.setAttribute('data-atl-outlines', 'failed');
    });
  }
  ctx?.onCleanup?.(() => {
    state.alive = false;
    observer?.disconnect();
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKey);
    root.removeEventListener('change', onChange);
  });
}
