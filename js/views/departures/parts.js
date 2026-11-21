// Small parts every renderer of the departures view shares: figures in mono type, status lamps,
// the photo of a boarding pass, and the pure text rules (the summary sentence, the clock, the status
// pill). Nothing here reads the page: every function returns a string or plain data. Owner: VA.
import { attr, cls, esc, flagChip } from '../shared/html.js';
import { coverFrameHtml } from '../shared/photo-frame.js';
import { formatClock } from '../../lib/locale.js';

// --- Figures: dates, times, counts and money are set in mono type -------------------------------------

/** A whole value in mono type: a date, a time, a count, a money figure. '' for an empty value. */
export function mono(value) {
  const text = String(value ?? '').trim();
  return text ? `<span class="dep-mono">${esc(text)}</span>` : '';
}

// A temperature range, a clock time (with its marker when it has one), or a plain number.
const FIGURE = /((?<![\w-])-?\d+ to -?\d+°[CF]|\d{1,2}:\d{2}(?: [AP]M)?|\d(?:[\d,.]*\d)?)/g;

/** A sentence with each figure in mono type and the words left in the body face. Escapes everything. */
export function figures(text) {
  return String(text ?? '').split(FIGURE).map((part, i) => (i % 2 ? mono(part) : esc(part))).join('');
}

/** A money figure in mono type; the word "about" in front of a converted amount stays in the body face. */
export function moneyHtml(text) {
  const value = String(text ?? '').trim();
  const converted = /^about\s+(.+)$/.exec(value);
  return converted ? `about ${mono(converted[1])}` : mono(value);
}

const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** "one" to "ten", digits for anything else. */
export const numberWord = (n) => (Number.isInteger(n) && n >= 1 && n <= 10 ? WORDS[n - 1] : String(n));
export const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
/** "1 day", "12 days". */
export const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// --- Text rules -------------------------------------------------------------------------------------------

/** The sentence under the greeting: what is happening now and what departs next. '' when neither. */
export function summarySentence(model) {
  const live = model?.live?.length ?? 0;
  const next = model?.next ?? null;
  const now = live ? `${capital(numberWord(live))} ${live === 1 ? 'trip is' : 'trips are'} happening now` : '';
  const then = next ? `${next.trip.title} departs ${next.daysToGo === 1 ? 'tomorrow' : `in ${next.daysToGo} days`}` : '';
  if (now && then) return `${now}, and ${then}.`;
  return now || then ? `${now || then}.` : '';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const partsIn = (date, timeZone, options) => Object.fromEntries(
  new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).formatToParts(date).map((part) => [part.type, part.value]),
);
/** "Fri 19 Mar" and the year of an instant in a time zone. The month names are this app's own three letters. */
function dayParts(date, timeZone) {
  const { weekday, day, month, year } = partsIn(date, timeZone, { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' });
  return { text: `${weekday} ${Number(day)} ${MONTHS[Number(month) - 1]}`, year };
}

/** "HH:MM" on the 24-hour clock in a time zone, or '' when the instant or the zone cannot be read. */
function wallClock(iso, timeZone) {
  const date = new Date(typeof iso === 'string' && iso ? iso : NaN);
  if (typeof timeZone !== 'string' || !timeZone || Number.isNaN(date.getTime())) return '';
  try {
    const { hour, minute } = partsIn(date, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return `${hour}:${minute}`;
  } catch {
    return '';
  }
}

/**
 * An instant as a clock in a time zone, in the format the user chose (the one clock formatter writes
 * the marker). Split so the hours and minutes can be drawn as flap digits.
 * @returns {{ hours: string, minutes: string, marker: string, text: string }|null}
 */
export function clockParts(iso, timeZone) {
  const text = formatClock(wallClock(iso, timeZone));
  const found = /^(\d{1,2}):(\d{2})\s?(\D*)$/.exec(text);
  return found ? { hours: found[1], minutes: found[2], marker: found[3].trim(), text } : null;
}

/** When a saved list was saved, for the stale banner: "on Tue 9 Mar at 6:42 PM". '' without a time. */
export function savedText(iso, timeZone) {
  const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const time = formatClock(wallClock(iso, zone));
  if (!time) return '';
  return `on ${dayParts(new Date(iso), zone).text} at ${time}`;
}

/** A calendar date in words, read as written (no time zone shift): "Fri 19 Mar", or with the year. '' when it cannot be read. */
export function dayText(isoDate, { year = false } = {}) {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate ?? '')) ? `${isoDate}T00:00:00Z` : NaN);
  if (Number.isNaN(date.getTime())) return '';
  const parts = dayParts(date, 'UTC');
  return year ? `${parts.text} ${parts.year}` : parts.text;
}

/** The icon for a typical-weather label: a sun for sunny and clear days, a cloud for the rest. */
export const weatherIcon = (condition) => (/sun|clear/i.test(String(condition ?? '')) ? 'sun' : 'cloud');

/** A day colour, 1 to 7, that is always the same for one plan: the tint of its photo placeholder. */
export function toneOf(id) {
  const sum = [...String(id ?? '')].reduce((total, ch) => total + ch.codePointAt(0), 0);
  return (sum % 7) + 1;
}

/**
 * The line under the next stop of a live plan.
 * @param {{ nextStop: import('../contract.js').StopLine|null, after: number, lastTime: string|null }} today
 *   after is how many stops follow the next one today, null when that is not known (the sentence then
 *   states no figure); lastTime is when the last of them starts
 */
export function stopLine({ nextStop, after = 0, lastTime = null }) {
  if (!nextStop) return 'Nothing more is planned today.';
  const where = nextStop.venue ? ` at ${nextStop.venue}` : '';
  if (after === null) return `Next stop${where}.`;
  if (after < 1) return `Next stop${where}, the last one today.`;
  return `Next stop${where}. ${after} more after it${lastTime ? `, the last at ${lastTime}` : ''}.`;
}

/** What is still to do, in a few words: "Flights, stay, reservations". '' without readiness. */
export function readinessNote(readiness) {
  if (!readiness) return '';
  const open = readiness.items.filter((item) => item.state === 'todo').map((item) => String(item.label).toLowerCase());
  if (open.length) return capital(open.join(', '));
  return readiness.done >= readiness.total ? 'Everything is settled' : '';
}

/**
 * The status pill of the trip hero: the phase, then what is left to do.
 * @param {import('../contract.js').TripOverviewModel} model
 * @returns {{ kind: 'live'|'todo'|'ready'|'plan'|'stop'|'idle', text: string }}
 */
export function pillFor(model) {
  if (model.status === 'failed') return { kind: 'stop', text: 'Planning stopped' };
  if (model.status === 'generating') return { kind: 'plan', text: 'Still being planned' };
  if (model.phase === 'past') return { kind: 'idle', text: 'Past plan' };
  const live = model.phase === 'live';
  const base = live ? 'Live now' : model.phase === 'undated' ? 'No dates yet' : model.daysToGo === 1 ? 'Tomorrow' : 'Upcoming';
  const ready = model.readiness;
  if (!ready) return { kind: live ? 'live' : 'idle', text: base };
  if (ready.todo > 0) return { kind: live ? 'live' : 'todo', text: `${base}, ${ready.todo} to do` };
  if (ready.done >= ready.total) return { kind: live ? 'live' : 'ready', text: `${base}, ready` };
  return { kind: live ? 'live' : 'idle', text: `${base}, checking` };
}

/**
 * The ctx a renderer draws with: entry motion (the rise, the image fade) is for a first render and
 * for people who have not asked for less motion. Returns a new object; the ctx it was given is not changed.
 * @param {import('../contract.js').ViewCtx} ctx
 */
export const drawCtx = (ctx) => (ctx.animate && ctx.reducedMotion ? { ...ctx, animate: false } : ctx);

// --- Markup -----------------------------------------------------------------------------------------------

/** A status: a lamp in the status colour and its words. `html` is trusted markup. */
export function statusHtml(kind, html, { glass = false, pulse = false, extra } = {}) {
  return `<span class="${cls('dep-st', `dep-st--${kind}`, { 'dep-chip-glass': glass }, extra)}"><i class="${cls('dep-lamp', { 'dep-lamp--pulse': pulse })}"></i><span>${html}</span></span>`;
}

/** Up to three flags, after a title. */
export function flagsHtml(flags, size = 20) {
  const chips = (Array.isArray(flags) ? flags : []).slice(0, 3).map((code) => flagChip(code, { size })).join('');
  return chips ? `<span class="dep-flags">${chips}</span>` : '';
}

/** How many characters the last word and its flags (three each) may come to and still be kept together. */
const TIE_MAX = 14;
/**
 * A title with its flags after it. The last word and the flags are one run that does not break, so a
 * flag is never left on a line of its own after a title that just fills its column. A long last word
 * is not tied: with its flags it could be wider than a narrow column.
 */
export function titleHtml(title, flags, size = 20) {
  const text = String(title ?? '').trim();
  const chips = flagsHtml(flags, size);
  if (!chips) return esc(text);
  const cut = text.lastIndexOf(' ');
  const last = text.slice(cut + 1);
  const shown = Math.min(3, Array.isArray(flags) ? flags.length : 0);
  if (!last || last.length + shown * 3 > TIE_MAX) return `${esc(text)}${chips}`;
  return `${esc(text.slice(0, cut + 1))}<span class="dep-tie">${esc(last)}${chips}</span>`;
}

/**
 * A figure beside a section heading, as a region of its own (ruling R41): it changes when a plan
 * finishes, is imported or goes live, and the controller patches regions, never what is around them.
 * The element is there also when it has nothing to say.
 */
export const countRegion = (name, value) => `<span class="dep-mono"${attr('data-region', name)}>${esc(String(value ?? ''))}</span>`;

/** A section heading row: the h2, then a count or a note. `after` is trusted markup. */
export function sectionHead(id, title, after = '') {
  return `<div class="dep-sec-h"><h2${attr('id', id)}>${esc(title)}</h2>${after}</div>`;
}

/**
 * The photo of a boarding pass: the frame, and over it (as a sibling, so a carried or swapped frame
 * never takes the words with it) what sits at the top and at the bottom of the photo.
 * @param {import('../contract.js').CoverModel} cover
 * @param {{ frame?: object, top?: string, bottom?: string }} opts top and bottom are trusted markup
 */
export function passPhotoHtml(cover, { frame = {}, top = '', bottom = '' } = {}) {
  return `<div class="dep-pass-photo">
    ${coverFrameHtml(cover, { ratio: 'free', alt: '', ...frame })}
    <div class="dep-photo-over">${top ? `<div class="dep-over-top">${top}</div>` : ''}${bottom ? `<div class="dep-over-bot">${bottom}</div>` : ''}</div>
  </div>`;
}
