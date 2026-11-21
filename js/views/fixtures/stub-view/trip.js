// The frozen stub view, trip landing half: plain markup, no shared components, every hook of blueprint
// 3.4. Steward: F0. Nobody else edits it; after gate G0 it changes only with the contract.

const P = 'stub';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const TABS = [['plan', 'Plan'], ['spending', 'Spending'], ['prep', 'Prep'], ['towns', 'Discover']];
const INLINE = ['share', 'pdf', 'edit'];
const SECTIONS = ['flights', 'transport', 'accommodation', 'entry', 'checklist'];

function actionControl(action, where, role = '') {
  const key = esc(action.key);
  const roleAttr = role ? ` role="${role}"` : '';
  if (action.key === 'read-view') return `<a href="${esc(action.href)}" data-focus-key="${where}-${key}"${roleAttr}>${esc(action.label)}</a>`;
  return `<button type="button" data-action="${key}" data-focus-key="${where}-${key}"${roleAttr}>${action.key === 'pdf' ? `<span data-pdf-label>${esc(action.label)}</span>` : esc(action.label)}</button>`;
}

// The More menu: a trigger and a <dialog> panel that holds every action, so each one is reachable at
// every width. The shared menu component drives this markup (see js/views/shared/menu.js).
function moreMenu(model) {
  if (!model.actions.length) return '';
  const items = model.actions.map((action) => `<li role="none">${actionControl(action, 'menu', 'menuitem')}</li>`).join('');
  return `<button type="button" class="${P}-more" data-menu-open="${P}-more-menu" data-focus-key="more" aria-haspopup="menu" aria-expanded="false" aria-controls="${P}-more-menu">More</button>
      <dialog class="${P}-menu" id="${P}-more-menu" data-menu aria-label="More actions">
        <ul role="menu">${items}<li role="none"><a href="#/settings" role="menuitem" data-focus-key="menu-settings">Settings</a></li></ul>
      </dialog>`;
}

function bar(model) {
  const inline = model.actions.filter((action) => INLINE.includes(action.key)).map((action) => actionControl(action, 'bar')).join('');
  return `<header class="tv-bar">
    <a href="#/" class="tv-back" data-focus-key="back">Trips</a>
    <p class="${P}-bar-title">${esc(model.title)}</p>
    <div data-tabs-slot data-slot-from="1024"></div>
    <div class="${P}-bar-actions" data-region="bar-actions">
      ${inline}${moreMenu(model)}
    </div>
    <p class="${P}-pdf-status" data-pdf-status role="status"></p>
  </header>`;
}

function coverFrame(cover) {
  if (cover.kind === 'none') return `<div class="${P}-frame ${P}-frame--none" data-carry="cover"></div>`;
  const srcset = cover.srcset ? ` srcset="${esc(cover.srcset)}" sizes="100vw"` : '';
  const fallback = cover.fallbackSrc ? ` data-fallback="${esc(cover.fallbackSrc)}"` : '';
  const title = cover.credit ? ` title="${esc(cover.credit.full)}"` : '';
  const chip = cover.credit ? `<a class="${P}-credit" href="${esc(cover.credit.link)}" rel="noopener">${esc(cover.credit.chip)}</a>` : '';
  return `<div class="${P}-frame" data-carry="cover">
      <img src="${esc(cover.src)}"${srcset}${fallback}${title} alt="" width="1280" height="720" decoding="async" fetchpriority="high">${chip}
    </div>`;
}

function heroStatus(model) {
  const today = model.live?.today;
  const stop = today?.nextStop;
  const next = stop ? ` Next stop${stop.time ? ` ${esc(stop.time)}` : ''}, ${esc(stop.title)}.` : '';
  return `<p class="${P}-status" data-region="hero-status">${esc(model.statusText)}.${today ? ` ${esc(today.title)}.` : ''}${next}</p>`;
}

function glance(model) {
  if (!model.glance.length) return '';
  const facts = model.glance.map((fact) => {
    const jump = SECTIONS.includes(fact.jump)
      ? ` <button type="button" data-section-jump="${esc(fact.jump)}" aria-controls="td-section-${esc(fact.jump)}" aria-expanded="false" data-focus-key="glance-${esc(fact.key)}">Open</button>` : '';
    return `<div data-key="${esc(fact.key)}"><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}${fact.note ? ` <span>${esc(fact.note)}</span>` : ''}${jump}</dd></div>`;
  }).join('');
  return `<dl class="${P}-glance" data-region="glance">${facts}</dl>`;
}

function hero(model, ctx) {
  const { dates, travellers } = model;
  const people = travellers ? `, ${esc(travellers)} ${travellers === 1 ? 'traveller' : 'travellers'}` : '';
  return `<div class="${P}-hero" id="td-hero">
    ${coverFrame(model.cover)}
    <h1 class="${P}-trip-title">${esc(model.title)}</h1>
    <p class="${P}-dates">${esc(dates.text)}, ${esc(dates.dayCount)} days${people}</p>
    ${heroStatus(model)}
  </div>
  ${glance(model)}
  ${ctx.slots.notes}`;
}

function tabs() {
  const items = TABS.map(([key, label], i) => `<button type="button" class="td-tab${i === 0 ? ' td-tab--active' : ''}" data-tab="${key}" role="tab" id="td-tab-${key}" aria-selected="${i === 0}" aria-controls="td-panel-${key}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join('');
  return `<nav class="td-tabs" role="tablist" aria-label="Trip sections">${items}</nav>`;
}

function readiness(model) {
  const state = model.readiness;
  if (!state) return '';
  if (state.collapsed) return `<p class="${P}-ready" data-region="readiness">Before you go: ${esc(state.headline)}.</p>`;
  const rows = state.items.map((item) => `<li data-key="${esc(item.area)}">${esc(item.label)}: ${esc(item.status)}. ${esc(item.detail)}${item.due ? ` Due ${esc(item.due.text)}.` : ''}
      <button type="button" data-section-jump="${esc(item.target)}" aria-controls="td-section-${esc(item.target)}" aria-expanded="false" data-focus-key="ready-${esc(item.area)}">${esc(item.actionLabel)}</button></li>`).join('');
  return `<section class="${P}-ready" aria-labelledby="${P}-ready-h" data-region="readiness">
    <h2 id="${P}-ready-h">Before you go</h2>
    <p>${esc(state.headline)}</p>
    <ul>${rows}</ul>
    ${state.perDevice ? '<p>Ticks are saved on this device.</p>' : ''}
  </section>`;
}

function dayIndex(model) {
  if (!model.days.length) return '';
  const rows = model.days.map((row) => `<li data-key="day-${esc(row.index)}"><button type="button" data-day-jump="${esc(row.index)}" data-map-day="${esc(row.dayNumber)}" data-focus-key="day-${esc(row.index)}"${row.isToday ? ' aria-current="date"' : ''}>Day ${esc(row.dayNumber)}${row.dateText ? `, ${esc(row.dateText)}` : ''}: ${esc(row.title)}</button></li>`).join('');
  return `<section class="${P}-days" aria-labelledby="${P}-days-h">
    <h2 id="${P}-days-h">Day by day</h2>
    <ol data-region="dayindex">${rows}</ol>
  </section>`;
}

function mapBlock(model) {
  const count = model.map.points.length;
  const caption = count ? `<p data-region="map-caption">${esc(count)} stops on the map across ${esc(model.map.dayCount)} days.</p>` : '';
  return `<div class="${P}-map"><div data-map-slot></div>${caption}</div>`;
}

/** @returns the six landing parts plus the sections to open (blueprint 3.1) */
export function renderTripLanding(model, ctx) {
  return {
    bar: bar(model),
    hero: hero(model, ctx),
    tabs: tabs(),
    planIntro: `${readiness(model)}${dayIndex(model)}`,
    between: mapBlock(model),
    planOutro: `<p class="${P}-note">Costs are estimates per person, for activities only. Weather is typical for the season, not a forecast.</p><span class="ui-probe" hidden></span>`,
    openSections: [],
    openSectionsMinWidth: 0,
  };
}

/** Optional in the contract. The stub binds nothing: every hook is handled by the controllers. */
export function mountTripLanding(root, model, ctx) {
  void root; void model; void ctx;
}
