// The Atlas page (#/atlas): where the plate of the dashboard leads. This file is the light half that
// ships with the view: the h1 with the span of all plans and the three stats, the stale banner, the
// empty atlas, the load error and the foot. The drawn half (the plates, the places, the passport)
// is atlas-page-body.js, a chunk of its own (ruling R40): the dashboard fetches it when the browser
// is idle, so the page is usually drawn in one go; on a direct load the head and an empty plate box
// are drawn first and the rest lands in that box. Owner: VC.
import { attr, cls, esc } from '../shared/html.js';
import { creditsListHtml } from '../shared/credits.js';
import { loadErrorHtml, staleBannerHtml } from '../shared/state-cards.js';
import { landDefsSvg } from '../shared/world-map.js';
import { placeEntries } from './atlas-places.js';
import { emptyPlateHtml } from './dashboard-plate.js';
import { enterClass, planButtonsHtml, statsHtml } from './parts.js';
import { mountPlates } from './plate-mount.js';
import { savedText, spanText } from './words.js';

const MAP_CREDIT = 'Map outline: Natural Earth, public domain.';
const defsHtml = (regions) => `<span data-atl-defs>${landDefsSvg(regions)}</span>`;
// The photos of this page are the covers in the place card; an empty atlas draws none, so it lists none.
const footHtml = (model, photos = true) => `<footer class="atl-foot">${photos ? creditsListHtml(model.credits) : ''}<p class="ui-foot-line">${MAP_CREDIT}</p></footer>`;
const staleHtml = (model) => (model.stale ? staleBannerHtml(model.stale, { savedText: savedText(model.stale.savedAt), cls: 'atl-stale' }) : '');

// The drawn half, once it is here. A module is code, not page state: every page still keeps its own
// plate, place and plan on its stage element.
let drawn = null;
let loading = null;

/**
 * Fetches the drawn half of the page, once. A fetch that failed is tried again on the next call.
 * @returns {Promise<{ bodyHtml: Function, mountStage: Function }>}
 */
export function loadAtlasBody() {
  loading ??= import('./atlas-page-body.js').then((mod) => {
    drawn = mod;
    return mod;
  }, (error) => {
    loading = null;
    throw error;
  });
  return loading;
}

function headHtml(model, ctx, sub) {
  return `<header class="${cls('atl-ap-head', enterClass(ctx))}">
    <div><h1 class="atl-ap-title">Atlas</h1>${sub ? `<p class="atl-ap-sub">${esc(sub)}</p>` : ''}</div>
    ${statsHtml(model.stats, { region: true, cls: 'atl-stats--ap' })}
  </header>`;
}

// The box the drawn half lands in: the plate's own box, empty. What it will be drawn from is named
// on it, so a model that changes while it waits (the home pin arrives with the profile) is a new
// frame to the controller, which then mounts the page again with that model.
const waitHtml = (model) => `<div class="atl-ap-stage" aria-busy="true"${attr('data-atl-wait', `${model.pins?.length ?? 0}-${Object.keys(model.cardsById ?? {}).length}`)}><div class="atl-ap-map"></div></div>`;

function readyHtml(model, ctx, body) {
  const span = spanText(model.stats);
  return `${headHtml(model, ctx, span ? `Every place in your plans, ${span}.` : 'Every place in your plans.')}
  ${staleHtml(model)}
  ${body ? body.bodyHtml(model, ctx) : waitHtml(model)}
  ${footHtml(model)}
  ${defsHtml()}`;
}

function emptyHtml(model, ctx) {
  const city = model.user?.homeCity;
  const title = city ? `Your atlas starts in ${esc(city)}` : 'Your atlas starts here';
  return `${headHtml(model, ctx, '')}
  ${staleHtml(model)}
  <div class="${cls('atl-empty', enterClass(ctx))}">
    ${emptyPlateHtml(model)}
    <div class="atl-empty-body">
      <h2 class="atl-empty-title">${title}</h2>
      <p class="atl-empty-text">Plan a first trip, or bring in one you have already booked. Every place it names lands on this map.</p>
      ${planButtonsHtml({ cls: 'atl-acts--empty' })}
    </div>
  </div>
  ${footHtml(model, false)}
  ${defsHtml()}`;
}

/**
 * The page for a model, with the drawn half given or not: without it a ready page is the head, the
 * waiting plate box and the foot.
 * @param {import('../contract.js').DashboardModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 * @param {{ bodyHtml: Function }|null} body  the module of atlas-page-body.js, or null
 * @returns {string}
 */
export function atlasPageHtml(model, ctx, body) {
  if (model.state === 'error') return `<header class="atl-ap-head"><div><h1 class="atl-ap-title">Atlas</h1></div></header>${loadErrorHtml({ cls: 'atl-error' })}`;
  if (model.state === 'empty' || !placeEntries(model).length) return emptyHtml(model, ctx);
  return readyHtml(model, ctx, body);
}

/** @returns {string} inner HTML of the Atlas page root */
export function renderAtlasPage(model, ctx) {
  return atlasPageHtml(model, ctx, drawn);
}

/**
 * Called once per mounted root. A page drawn in full gets its stage run at once. A page that waits
 * for the drawn half gets it put in the waiting box when it arrives, unless the root is gone by
 * then; if it cannot be fetched, the box becomes the load error with its "Try again".
 */
export function mountAtlasPage(root, model, ctx) {
  mountPlates(root, ctx);
  const wait = root.querySelector('[data-atl-wait]');
  if (!wait) {
    drawn?.mountStage(root, model, ctx);
    return;
  }
  let alive = true;
  ctx?.onCleanup?.(() => { alive = false; });
  loadAtlasBody().then((body) => {
    if (!alive || !wait.isConnected) return;
    wait.insertAdjacentHTML('afterend', body.bodyHtml(model, { ...ctx, animate: false }));
    wait.remove();
    body.mountStage(root, model, ctx);
  }).catch(() => {
    if (alive && wait.isConnected) wait.outerHTML = loadErrorHtml({ cls: 'atl-error' });
  });
}
