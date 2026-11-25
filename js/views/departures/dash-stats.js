// The lower part of the departures dashboard: travel stats, short hops from the home city and the
// foot. Plans are not journeys, so every statistic says "planned". Owner: VA.
import { attr, esc, flagChip } from '../shared/html.js';
import { icon } from '../shared/icons.js';
import { tileFrameHtml } from '../shared/photo-frame.js';
import { creditsListHtml } from '../shared/credits.js';
import { count, countRegion, figures, mono, sectionHead, toneOf } from './parts.js';

const FOOT_NOTE = 'Costs are estimates per person, for activities only. Weather is typical for the season, not a forecast.';

const figure = (value, label) => `<div class="dep-fig"><span class="dep-fig-n dep-mono">${esc(value)}</span><span class="dep-fig-l">${esc(label)}</span></div>`;
const split = (label, html) => (html ? `<div><dt>${esc(label)}</dt><dd>${html}</dd></div>` : '');

/** The home-currency sum of the activity estimates, with what it leaves out. */
function spendHtml(stats) {
  if (!stats.spendHome) return '';
  const missing = stats.spendUnconverted > 0 ? `<small>${figures(`${count(stats.spendUnconverted, 'plan', 'plans')} left out, no rate`)}</small>` : '';
  return `~${mono(stats.spendHome.text)} <span class="dep-tie">per person</span>${missing}`;
}

function stampsHtml(stats) {
  const countries = [...stats.byCountry].sort((a, b) => b.trips - a.trips || a.country.localeCompare(b.country));
  if (!countries.length) return '';
  const stamps = countries.map((entry) => `<li class="dep-stamp"${attr('data-key', entry.flag)}${attr('aria-label', `${entry.country}, ${count(entry.trips, 'plan', 'plans')}`)}>${flagChip(entry.flag, { size: 24 })}<span class="dep-stamp-n">${esc(entry.country)}</span>${mono(entry.trips)}</li>`).join('');
  return `<div class="dep-stamps-wrap">
      <p class="dep-lbl">${figures(`${count(countries.length, 'country', 'countries')}, by number of plans`)}</p>
      <ul class="dep-stamps">${stamps}</ul>
    </div>`;
}

/**
 * Travel stats: four large numbers, four rows, then the countries by number of plans. '' when the
 * account has no finished plan to count.
 * @param {import('../contract.js').DashboardModel} model
 * @param {{ animate?: boolean }} ctx
 */
export function statsHtml(model, ctx) {
  const { stats } = model;
  if (!stats || stats.trips < 1) return '';
  const most = stats.mostPlanned ? figures(`${stats.mostPlanned.country}, ${count(stats.mostPlanned.trips, 'plan', 'plans')}`) : '';
  const longest = stats.longest ? `${esc(stats.longest.title)}, ${figures(count(stats.longest.days, 'day', 'days'))}` : '';
  return `<section class="dep-travel${ctx.animate ? ' dep-enter' : ''}" aria-labelledby="dep-stats-h">
    ${sectionHead('dep-stats-h', 'Travel stats', '<span class="dep-note">From every plan made in Trippy. Some plans share dates.</span>')}
    <div class="dep-logbook" data-region="stats">
      <div class="dep-figs">${figure(stats.trips, 'plans')}${figure(stats.countries, 'countries')}${figure(stats.cities, 'cities')}${figure(stats.daysPlanned, 'days planned')}</div>
      <dl class="dep-splits">
        ${split('Calendar days covered', mono(stats.calendarDays))}${split('Activities planned', spendHtml(stats))}
        ${split('Most planned', most)}${split('Longest', longest)}
      </dl>
      ${stampsHtml(stats)}
    </div>
  </section>`;
}

/** One short hop: the tile, then a real button stretched over it that starts a plan for the city. */
function hopTile(hop, ctx) {
  return `<li class="dep-hop"${attr('data-key', hop.name)}>
      ${tileFrameHtml(hop.cover, { animate: ctx.animate, name: hop.name, flag: hop.flag, tone: toneOf(hop.name), alt: '', cls: 'dep-hop-ph' })}
      <button type="button" class="dep-hop-link" data-action="plan-city"${attr('data-city', hop.name)}${attr('data-focus-key', `hop-${hop.name}`)}${attr('aria-label', `Plan a trip to ${hop.name}`)}><span class="dep-hop-name">${esc(hop.name)}</span></button>
      <span class="dep-hop-sub">${flagChip(hop.flag, { size: 20 })}<span>${esc(hop.country)}</span></span>
      <span class="dep-hop-mode">${icon('pin', 16)}<span>~${mono(hop.km)} km</span></span>
      <span class="dep-hop-note">${esc(hop.note)}</span>
    </li>`;
}

/**
 * Short hops as a rail of 4:5 tiles (a row of seven on desktop). Distances are straight lines from
 * the home city: the catalogue holds no journey times (blueprint section 10, row 2).
 */
export function hopsHtml(model, ctx) {
  if (!model.hops.length) return '';
  return `<section class="dep-ideas${ctx.animate ? ' dep-enter' : ''}" aria-labelledby="dep-hops-h">
    ${sectionHead('dep-hops-h', `Short hops from ${model.user.homeCity}`, `${countRegion('hops-count', model.hops.length)}<span class="dep-note">Nearest first. Distances are straight lines from home.</span>`)}
    <ul class="dep-hops" data-region="hops" data-keep-scroll="hops">${model.hops.map((hop) => hopTile(hop, ctx)).join('')}</ul>
  </section>`;
}

/** The first few hops as plain rows, for an account that has no plan yet. */
export function hopListHtml(model, max = 3) {
  const hops = model.hops.slice(0, max);
  if (!hops.length) return '';
  const rows = hops.map((hop) => `<li${attr('data-key', hop.name)}><button type="button" class="dep-hoprow" data-action="plan-city"${attr('data-city', hop.name)}${attr('data-focus-key', `hop-${hop.name}`)}${attr('aria-label', `Plan a trip to ${hop.name}`)}><span class="dep-hop-name">${esc(hop.name)}</span><span class="dep-hop-mode">${icon('pin', 16)}<span>~${mono(hop.km)} km</span></span></button></li>`).join('');
  return `<section class="dep-starts" aria-labelledby="dep-hops-h">
    <h2 class="dep-lbl" id="dep-hops-h">Or start with a short hop from ${esc(model.user.homeCity)}</h2>
    <ul class="dep-hoplist" data-region="hops">${rows}</ul>
  </section>`;
}

/**
 * The foot: what the money and the weather on this page are, and every photo credit in full. The
 * credits are a region (ruling R41): the list follows the covers, so a plan that finishes changes it.
 * @param {import('../contract.js').DashboardModel} model
 * @param {{ credits?: boolean }} [opts] credits: false on a page that draws no photo
 */
export function footHtml(model, { credits = true } = {}) {
  return `<footer class="dep-foot">
    <p class="dep-foot-note">${FOOT_NOTE}</p>
    ${credits ? `<div class="dep-foot-credits" data-region="credits">${creditsListHtml(model.credits)}</div>` : ''}
  </footer>`;
}
