// The Atlas dashboard (task table rows 1 to 8): the briefing as the h1, Happening now, the atlas
// plate, Trips with the time rail and the passport, short hops, the foot. The sections are in
// dashboard-now.js, dashboard-plate.js and dashboard-rail.js; this file puts them in order, draws the
// states (empty, load error, stale list) and mounts the one behaviour the page has of its own: the
// plates are drawn again for the width they really have. Owner: VC.
import { attr, cls, esc, link } from '../shared/html.js';
import { icon } from '../shared/icons.js';
import { creditsListHtml } from '../shared/credits.js';
import { filterBarHtml } from '../shared/filter-bar.js';
import { tileFrameHtml } from '../shared/photo-frame.js';
import { loadErrorHtml, staleBannerHtml } from '../shared/state-cards.js';
import { landDefsSvg } from '../shared/world-map.js';
import { loadAtlasBody } from './atlas-page.js';
import { MORE_IDEAS } from './dashboard-ahead.js';
import { nowHtml } from './dashboard-now.js';
import { PASSPORT_HREF, bandHtml, emptyPlateHtml, plateBlockHtml } from './dashboard-plate.js';
import { aheadRegionsHtml, pastRegionHtml, planningRegionHtml } from './dashboard-rail.js';
import { enterClass, flagsHtml, planButtonsHtml, statsHtml } from './parts.js';
import { passportLine, stampRows, stampsHtml } from './passport.js';
import { mountPlates } from './plate-mount.js';
import { plateData } from './plates.js';
import { railGroups } from './rail.js';
import { inDaysText, matchText, numberText, savedText } from './words.js';

const MAP_CREDIT = 'Map outline: Natural Earth, public domain.';
const IDLE_MS = 1500;
const list = (value) => (Array.isArray(value) ? value : []);

/** The name a plan goes by in the briefing: its one place, else its title. */
const shortName = (card) => (list(card?.places).length === 1 && card.places[0]?.name ? card.places[0].name : card?.title ?? '');

/**
 * The briefing: two lines, the second one quieter. The live plan first, then what is next.
 * @returns {[string, string]}
 */
export function briefingLines(model) {
  const [lead] = list(model.live);
  const next = model.next ?? null;
  const nextLine = next ? `${shortName(next.trip)} is next, ${inDaysText(next.daysToGo)}.` : '';
  if (lead) {
    const country = list(lead.trip.places)[0]?.country;
    const where = country ? ` in ${country}.` : `, ${lead.trip.title}.`;
    return [`Day ${lead.dayNumber} of ${lead.dayCount}${where}`, nextLine || 'Nothing is planned after it yet.'];
  }
  if (next) {
    const after = list(model.sections?.upcoming).find((card) => card.id !== next.trip.id && Number.isFinite(card.daysToGo));
    return [nextLine, after ? `Then ${shortName(after)}, ${inDaysText(after.daysToGo)}.` : `It starts on ${next.departText}.`];
  }
  return ['Nothing is on the calendar.', 'Plan a trip to put the next pin on your map.'];
}

function topHtml(model, ctx) {
  const [first, second] = briefingLines(model);
  return `<header class="${cls('atl-top', enterClass(ctx))}">
    <h1 class="atl-lede"><span data-region="lead"><span class="atl-lede-1">${esc(first)}</span> <span class="atl-lede-2">${esc(second)}</span></span></h1>
    ${planButtonsHtml({ where: 'top', cls: 'atl-acts--top' })}
  </header>
  <div data-slot="chooser"></div>`;
}

function passportHtml(rows) {
  if (!rows.stamped.length && !rows.coming.length) return '';
  return `<section class="atl-passport" aria-labelledby="atl-pp-h">
    <div class="atl-passport-head"><h2 class="atl-pp-title" id="atl-pp-h">Passport</h2><p class="ui-vh" data-region="passport-line">${esc(passportLine(rows))}</p></div>
    <div class="atl-pp-stamps" data-region="passport">${stampsHtml(rows)}</div>
    ${link(PASSPORT_HREF, 'Open passport', { cls: 'ui-btn atl-pp-open', focusKey: 'open-passport', html: `${icon('passport', 18)}<span>Open passport</span>` })}
  </section>`;
}

/** The chips of the task table: All, Upcoming, Past, Shared with me ("Now" only while it is the active one). */
const filterOf = (filter) => ({ ...filter, options: list(filter?.options).filter((option) => option.key !== 'live' || filter.active === 'live') });

/** What a search or a filter found, in words; '' while neither is on (the rail says "No plan matches" itself). */
function foundText(model, groups) {
  if (!model.filter?.expanded) return '';
  const onRail = [...groups.upcoming, ...groups.past].reduce((sum, group) => sum + group.trips.length, 0);
  const found = onRail + groups.planning.length + list(model.sections?.live).length;
  if (!found) return '';
  // A pill that stands in for the "Trips" label and fades out again. The key changes with what was asked, so a new answer is a new pill.
  const asked = `${found}:${String(model.filter?.query ?? '')}:${String(model.filter?.active ?? model.filter?.kind ?? '')}`;
  return `<span class="atl-found-cover"${attr('data-key', asked)}><span class="atl-found-pill">${esc(matchText(found))}</span></span>`;
}

function tripsHtml(model, ctx, rows) {
  const groups = railGroups(model.sections);
  return `<section class="atl-trips" aria-labelledby="atl-trips-h">
    <div class="atl-trips-head">
      <h2 class="atl-sec-title" id="atl-trips-h">Trips</h2>
      ${filterBarHtml(filterOf(model.filter), { label: 'Search trips, cities or countries' })}
      <p class="atl-found" data-region="count" role="status">${foundText(model, groups)}</p>
    </div>
    <div class="atl-trips-grid">
      <div class="atl-ahead">
        ${planningRegionHtml(groups)}
        ${aheadRegionsHtml(model, groups, ctx)}
      </div>
      ${passportHtml(rows)}
      ${pastRegionHtml(model, groups, ctx)}
    </div>
  </section>`;
}

/** Short hops from the home city, nearest first (section 10, row 2: a straight-line distance, no travel time). */
function hopsHtml(model, ctx) {
  const hops = list(model.hops);
  if (!hops.length) return '';
  const items = hops.map((hop) => `<li class="atl-hop-item"${attr('data-key', hop.name)}>
      <button type="button" class="atl-hop" data-action="plan-city"${attr('data-city', hop.name)}${attr('data-focus-key', `hop-${hop.name}`)}>
        ${tileFrameHtml(hop.cover, { credit: false, tag: 'span', animate: Boolean(ctx?.animate), name: hop.name, flag: hop.flag, cls: 'atl-hop-ph' })}
        <span class="atl-hop-body"><span class="atl-hop-km">about ${esc(numberText(hop.km))} km</span><span class="atl-hop-name">${esc(hop.name)} ${flagsHtml([hop.flag], { size: 18 })}</span><span class="atl-hop-country">${esc(hop.country)}</span><span class="${cls('atl-hop-note', { 'is-planned': /^planned/i.test(hop.note ?? '') })}">${esc(hop.note)}</span></span>
      </button>
    </li>`).join('');
  return `<section class="atl-hops" data-atl-hops aria-labelledby="atl-hops-h">
    <div class="atl-sec-head"><h2 class="atl-sec-title" id="atl-hops-h">Short hops from ${esc(model.user?.homeCity || 'home')}</h2><p>Nearest first. Distances are straight lines from home. Pick one to start planning it.</p></div>
    <ul class="atl-hops-list" data-region="hops" data-keep-scroll="hops">${items}</ul>
  </section>`;
}

// The credits follow the covers on the page, so they are a region: a plan that finishes, or an import, patches them.
const footHtml = (model) => `<footer class="atl-foot"><div class="atl-foot-credits" data-region="credits">${creditsListHtml(model.credits)}</div><p class="ui-foot-line">${MAP_CREDIT}</p></footer>`;

function readyHtml(model, ctx) {
  const rows = stampRows(model.stats?.byCountry);
  const data = plateData(model);
  const stale = model.stale ? staleBannerHtml(model.stale, { savedText: savedText(model.stale.savedAt), cls: 'atl-stale' }) : '';
  return `${topHtml(model, ctx)}
  ${stale}
  <div class="atl-first">
    ${plateBlockHtml(model, ctx, data)}
    ${nowHtml(model, ctx)}
  </div>
  ${planButtonsHtml({ cls: 'atl-acts--phone', solid: false })}
  ${bandHtml(model, ctx, data, rows)}
  ${tripsHtml(model, ctx, rows)}
  ${hopsHtml(model, ctx)}
  ${footHtml(model)}
  ${landDefsSvg()}`;
}

/** The empty dashboard: the plate with the home pin, zeroed stats, and both ways to start. */
function emptyHtml(model, ctx) {
  const city = model.user?.homeCity;
  return `<div class="${cls('atl-empty', enterClass(ctx))}">
    ${emptyPlateHtml(model)}
    <div class="atl-empty-body">
      ${statsHtml(model.stats, { cls: 'atl-stats--empty' })}
      <h1 class="atl-empty-title">${city ? `Your atlas starts in ${esc(city)}` : 'Your atlas starts here'}</h1>
      <p class="atl-empty-text">Plan a first trip, or bring in one you have already booked. It lands on this map and on your rail.</p>
      ${planButtonsHtml({ cls: 'atl-acts--empty' })}
    </div>
  </div>
  ${hopsHtml(model, ctx)}
  ${footHtml(model)}
  ${landDefsSvg()}`;
}

const errorHtml = () => `<header class="atl-top">
    <h1 class="atl-lede">Trips</h1>
    ${planButtonsHtml({ cls: 'atl-acts--always' })}
  </header>
  ${loadErrorHtml({ cls: 'atl-error' })}`;

/** @returns {string} inner HTML of the dashboard root */
export function renderDashboard(model, ctx) {
  if (model.state === 'error') return errorHtml();
  if (model.state === 'empty') return emptyHtml(model, ctx);
  return readyHtml(model, ctx);
}

/**
 * Called once per mounted root. Everything the page does is a hook the controller handles, except
 * a plate: it is a drawing sized for one width, so it is drawn again for the width its frame
 * really has, now, when the page changes width and after a patch of its region.
 */
export function mountDashboard(root, model, ctx) {
  mountPlates(root, ctx);
  // "See more ideas" on the suggested trip leads to the short hops of the same page.
  root.addEventListener('click', (event) => {
    if (!event.target?.closest?.(`[data-action="${MORE_IDEAS}"]`)) return;
    const hops = root.querySelector('[data-atl-hops]');
    hops?.scrollIntoView({ behavior: ctx?.reducedMotion ? 'auto' : 'smooth', block: 'start' });
    hops?.querySelector('[data-action="plan-city"]')?.focus({ preventScroll: true });
  });
  // The plate leads to the Atlas page: its drawn half is fetched while the browser is idle, so the
  // page opens in one go. A fetch that fails here is tried again by the page itself.
  if (model?.state !== 'ready') return;
  const fetchBody = () => { loadAtlasBody().catch(() => {}); };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fetchBody, { timeout: IDLE_MS });
  else setTimeout(fetchBody, IDLE_MS);
}
