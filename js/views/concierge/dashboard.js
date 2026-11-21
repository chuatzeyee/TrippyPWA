// The Concierge dashboard (blueprint 3.3): a calm morning briefing. One sentence leads, as the h1,
// with links to the plans it names; then what is happening now, what is coming up, the stats as a
// sentence, the past plans by month and the short hops. Sections live in dashboard-now.js,
// dashboard-upcoming.js and dashboard-past.js; the sentence itself is briefing.js. Owner: VB.
import { attr, cls, esc, link } from '../shared/html.js';
import { filterBarHtml } from '../shared/filter-bar.js';
import { loadErrorHtml, staleBannerHtml } from '../shared/state-cards.js';
import { formatClock } from '../../lib/locale.js';
import { dayText } from '../../lib/travel-stats.js';
import { briefingReserve, briefingSentence } from './briefing.js';
import { longDate } from './words.js';
import { enter, planButtons } from './parts.js';
import { nowSection } from './dashboard-now.js';
import { planningRegion, tripsRegion, upcomingSection } from './dashboard-upcoming.js';
import { footHtml, hopsSection, pastSection, statsSection } from './dashboard-past.js';

const two = (n) => String(n).padStart(2, '0');

/** "on Tue 9 Mar at 6:42 PM", on the device's clock and in the user's time format; '' without a time. */
function savedText(savedAt) {
  const at = new Date(savedAt ?? NaN);
  if (Number.isNaN(at.getTime())) return '';
  const day = dayText(`${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`);
  return `on ${day} at ${formatClock(`${two(at.getHours())}:${two(at.getMinutes())}`)}`;
}

/** The sentence as markup: the greeting in the quiet ink, plain text, and a link for every plan named. */
function sentenceHtml(parts) {
  return parts.map((part, i) => {
    // The greeting is the quiet lead-in of a sentence; when it is all there is, it is the headline.
    if (part.tone === 'greeting' && parts.length > 1) return `<span class="con-hi">${esc(part.text)}</span>`;
    return part.href ? link(part.href, part.text, { cls: 'con-say-link', focusKey: `say-${i}` }) : esc(part.text);
  }).join('');
}

/**
 * The block that holds the h1: the dateline, the two ways to start (their wide-screen position) and
 * the sentence. In the ready state the sentence is the `lead` region, a span inside the h1, so a late
 * briefing changes the words and never the heading element. While that briefing is awaited, the
 * longest form of the sentence lies unseen behind the h1 and holds its height.
 */
function briefHtml(model, ctx) {
  const words = sentenceHtml(briefingSentence(model));
  const reserve = briefingReserve(model);
  const say = model.state === 'ready' ? `<span data-region="lead">${words}</span>` : words;
  return `<header class="${cls('con-brief', enter(ctx, 0))}">
    <div class="con-brief-top">
      <p class="con-dateline">${esc(longDate(model.now))}</p>
      ${planButtons(model, 'top')}
    </div>
    <div class="con-say-box">
      <h1 class="con-say">${say}</h1>
      ${reserve ? `<p class="con-say con-say-reserve" aria-hidden="true">${esc(reserve)}</p>` : ''}
    </div>
  </header>`;
}

function readyHtml(model, ctx) {
  const stale = staleBannerHtml(model.stale, { savedText: savedText(model.stale?.savedAt), cls: 'con-stale' });
  return [
    '<div data-slot="chooser"></div>',
    stale,
    nowSection(model, ctx),
    planButtons(model, 'below'),
    `<div class="${cls('con-finder', enter(ctx, 2))}">${filterBarHtml(model.filter, { label: 'Search by place or country' })}</div>`,
    planningRegion(model),
    upcomingSection(model, ctx),
    tripsRegion(model, ctx),
    statsSection(model),
    pastSection(model, ctx),
    hopsSection(model, ctx),
    footHtml(model),
  ].join('\n');
}

/**
 * @param {import('../contract.js').DashboardModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 * @returns {string} inner HTML of the dashboard root
 */
export function renderDashboard(model, ctx) {
  const head = briefHtml(model, ctx);
  if (model.state === 'error') {
    return `${head}\n${planButtons(model, 'below')}\n${loadErrorHtml({ message: 'You may be offline. Nothing has been lost.', cls: 'con-error' })}`;
  }
  if (model.state === 'empty') {
    return `${head}\n${planButtons(model, 'below')}\n${hopsSection(model, ctx, { compact: true })}\n${footHtml(model)}`;
  }
  return `${head}\n${readyHtml(model, ctx)}`;
}

/**
 * Optional in the contract. The dashboard binds nothing of its own: every control is a link or carries
 * a hook the dashboard controller handles, and the shared mounts (photo frames, menus) are the
 * controller's.
 */
export function mountDashboard(root, model, ctx) {
  void root; void model; void ctx;
}
