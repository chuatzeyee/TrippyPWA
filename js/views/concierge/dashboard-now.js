// "Happening now" on the Concierge dashboard: the lead plan as a cover with its day in numerals and
// today's lines, and a compact row for every other plan that covers today. The section is the `live`
// region; its head and every plan are keyed, so a patch keeps what did not change. Owner: VB.
import { cls, esc, flagChip, link } from '../shared/html.js';
import { coverFrameHtml } from '../shared/photo-frame.js';
import { segmentsHtml } from '../shared/segments.js';
import { capital, numberWord } from './words.js';
import { cardLink, creditSlot, enter, factRow, flagOf, ghost, secHead, sharedLine, stopHtml, tripAttrs, weatherWords } from './parts.js';

const HEAD_ID = 'con-now-h';
const MAX_FLAGS = 3;
/** What a row holds while its briefing is awaited: unseen text of a usual length, so the row keeps its height. */
const RESERVE = { today: 'The title of the day', stop: '10:00 AM The next stop', weather: '10 to 20°C, sunny' };

const openToday = (trip, style) => link(trip.todayHref, 'Open today', {
  cls: `ui-btn con-btn ${style}`, focusKey: `today-${trip.id}`, attrs: { 'data-now-trip': trip.id },
});

/** The four lines of the lead plan. Always four, so the block is the same height before and after a briefing. */
function leadRows(briefing) {
  const { trip, today, nextStop, tonight, tomorrow } = briefing;
  const pending = trip.briefingPending;
  const weather = weatherWords(today?.weather ?? trip.weather);
  const third = tonight || !tomorrow
    ? factRow('Tonight', tonight ? stopHtml(tonight) : pending ? ghost(RESERVE.stop) : 'Nothing else is planned')
    : factRow('Tomorrow', esc(tomorrow.title));
  return {
    main: [
      factRow('Today', today ? esc(today.title) : pending ? ghost(RESERVE.today) : 'No day is planned for today'),
      factRow('Next stop', nextStop ? stopHtml(nextStop) : pending ? ghost(RESERVE.stop) : 'Nothing more today'),
    ].join(''),
    more: [third, factRow('Typical weather', weather ? esc(weather) : pending ? ghost(RESERVE.weather) : 'Not known')].join(''),
  };
}

function leadHtml(briefing, ctx) {
  const { trip, dayNumber, dayCount } = briefing;
  const flags = trip.flags.slice(0, MAX_FLAGS).map((code) => flagChip(code, { size: 22 })).join('');
  const over = `<div class="con-lead-over"><h3 class="con-lead-title">${esc(trip.title)}</h3><p class="con-lead-dates">${flags}<span>${esc(trip.dates.text)}</span></p></div>${creditSlot(trip.cover)}`;
  const photo = coverFrameHtml(trip.cover, {
    ratio: '16x9', priority: true, animate: ctx.animate, scrim: true, over, credit: false, tone: 2,
    sizes: '(min-width: 900px) 640px, 100vw', cls: 'con-lead-frame',
  });
  const rows = leadRows(briefing);
  return `<article class="con-lead"${tripAttrs(trip)}>
    <div class="con-lead-photo">${photo}${cardLink(trip)}</div>
    <div class="con-lead-brief">
      <p class="con-lead-day">Day <span class="con-num">${esc(dayNumber)}</span> of ${esc(dayCount)}</p>
      ${segmentsHtml(dayNumber - 1, dayCount, dayNumber)}
      <dl class="con-bl con-bl--main">${rows.main}</dl>
      <p class="con-lead-actions">${openToday(trip, 'con-btn--cta')}${link(trip.wholeHref, 'See the whole trip', { cls: 'con-link', focusKey: `whole-${trip.id}` })}</p>
      <dl class="con-bl con-bl--more">${rows.more}</dl>
    </div>
  </article>`;
}

function alsoHtml(briefing, ctx) {
  const { trip, dayNumber, dayCount, endText } = briefing;
  const thumb = coverFrameHtml(trip.cover, { ratio: '1x1', animate: ctx.animate, credit: false, tone: 3, sizes: '88px', cls: 'con-also-thumb' });
  return `<article class="con-also"${tripAttrs(trip)}>
    ${thumb}
    <div class="con-also-text">
      <h3 class="con-also-title">${esc(trip.title)}</h3>
      <p class="con-also-line">${flagOf(trip.flags)}<span>Day ${esc(dayNumber)} of ${esc(dayCount)} on this plan too, to ${esc(endText)}.</span></p>
      ${sharedLine(trip)}
    </div>
    ${openToday(trip, 'con-btn--line')}
    ${cardLink(trip)}
  </article>`;
}

/**
 * The section, also when no plan runs: the `live` region exists in every ready state, hidden while empty.
 * @param {import('../contract.js').DashboardModel} model
 * @param {import('../contract.js').ViewCtx} ctx
 */
export function nowSection(model, ctx) {
  const live = model.live;
  const many = live.length > 1;
  const head = secHead({
    id: HEAD_ID, title: 'Happening now', key: 'head', count: many ? live.length : null,
    line: many ? `${capital(numberWord(live.length))} plans cover today. The one you opened last leads.` : '',
  });
  const plans = live.map((briefing, i) => (i === 0 ? leadHtml(briefing, ctx) : alsoHtml(briefing, ctx))).join('');
  return `<section class="${cls('con-sec con-now', enter(ctx, 1))}" aria-labelledby="${HEAD_ID}" data-region="live"${live.length ? '' : ' hidden'}>${head}${plans}</section>`;
}
