// The sentences of the Concierge view (blueprint section 10, rows 9 and 11). Pure. Owner: VB.
//
// briefingSentence() is the h1 of the dashboard: one short paragraph that names the plan that is
// running, the next one and what is left to settle. It speaks about plans and their dates, never
// about where the user is. tripBrief() is the trip page's "brief": a fixed template over stored
// facts, with a short form for imported trips, which have no style fields.
import { MONTH_NAMES, capital, countOf, lowerFirst, numberWord, wordList } from './words.js';

const GREETINGS = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' };
const PACE_WORDS = { relaxed: 'unhurried', easy: 'easy', balanced: 'balanced', active: 'active', packed: 'full' };
const MAX_INTERESTS = 3;
/** Days in hand from which nothing on the list is called urgent. */
const UNHURRIED_DAYS = 30;
/** The longest clause a late briefing can add to the sentence; briefingReserve() holds room for it. */
const LONGEST_CLAUSE = ', with three things to settle first.';

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const plain = (value) => ({ text: value, href: '' });
const linked = (value, href) => ({ text: value, href: text(href) });
const things = (n) => `${numberWord(n)} ${n === 1 ? 'thing' : 'things'}`;
const shortDate = (value) => text(value).replace(/ \d{4}$/, '');

function greeting(model, word) {
  const name = text(model?.user?.firstName);
  return { text: `${word}${name ? `, ${name}` : ''}.`, href: '', tone: 'greeting' };
}

function planningParts(cards) {
  const planning = cards.filter((card) => card.phase === 'generating');
  if (!planning.length) return [];
  const [first] = planning;
  const done = Number.isFinite(first.generation?.daysDone) ? first.generation.daysDone : 0;
  const total = Number.isFinite(first.generation?.daysTotal) ? first.generation.daysTotal : 0;
  const more = planning.length > 1 ? ` and ${numberWord(planning.length - 1)} more` : '';
  const progress = more || !done ? '' : total ? `, ${done} of ${countOf(total, 'day', 'days')} so far` : `, ${countOf(done, 'day', 'days')} so far`;
  return [plain(` Trippy is still planning ${text(first.title)}${more}${progress}.`)];
}

function liveParts(live) {
  if (!live.length) return [];
  const [lead] = live;
  const day = `day ${lead.dayNumber} of ${lead.dayCount}`;
  const title = text(lead.trip.title);
  if (live.length === 1) return [plain(' It is '), linked(`${day} on ${title}`, lead.trip.todayHref), plain('.')];
  return [plain(` ${capital(numberWord(live.length))} plans are running today and `), linked(`${title} is on ${day}`, lead.trip.todayHref), plain('.')];
}

/** What the readiness of the next plan adds: `soon` is the wording for a plan that starts tomorrow. */
function readinessTail(readiness, soon) {
  if (!readiness) return '.';
  const { todo, done, total } = readiness;
  if (todo > 0) {
    if (!soon) return `, with ${things(todo)} to settle first.`;
    const open = (readiness.items ?? []).find((item) => item.state === 'todo');
    if (todo === 1 && open) return `. One thing is still open: ${lowerFirst(open.label)}, ${lowerFirst(open.status)}.`;
    return `. ${capital(things(todo))} ${todo === 1 ? 'is' : 'are'} still open.`;
  }
  if (total > 0 && done >= total) return soon ? '. Everything is ready.' : ' and everything is ready.';
  return '.';
}

function nextParts(next, { brief }) {
  const { trip } = next;
  const title = text(trip.title);
  const soon = next.daysToGo === 1;
  const lead = soon
    ? [plain(' '), linked(`${title} starts tomorrow`, trip.href), plain(`, ${shortDate(next.departText)}`)]
    : [plain(' '), linked(`${title} is ${countOf(next.daysToGo, 'day', 'days')} away`, trip.href)];
  return [...lead, plain(brief ? '.' : readinessTail(trip.readiness, soon))];
}

function monthOf(card, nowIso) {
  const match = /^(\d{4})-(\d{2})/.exec(text(card.monthKey));
  if (!match) return '';
  const month = MONTH_NAMES[Number(match[2]) - 1];
  if (!month) return '';
  return match[1] === text(nowIso).slice(0, 4) ? month : `${month} ${match[1]}`;
}

function quietParts(cards, { running, nowIso }) {
  if (running) return [plain(' Nothing else is on the calendar.')];
  const out = [plain(' Nothing is on the calendar.')];
  const past = cards.filter((card) => card.phase === 'past' && card.dates?.end)
    .sort((a, b) => b.dates.end.localeCompare(a.dates.end));
  if (past.length) {
    const month = monthOf(past[0], nowIso);
    return [...out, plain(' Your last plan was '), linked(text(past[0].title), past[0].href), plain(`${month ? ` in ${month}` : ''}.`)];
  }
  const undated = cards.filter((card) => card.phase === 'undated').length;
  return undated ? [...out, plain(` ${capital(numberWord(undated))} ${undated === 1 ? 'plan has' : 'plans have'} no dates yet.`)] : out;
}

/**
 * The briefing as parts: plain text and links to the plans it names. The first part is the greeting
 * (tone 'greeting'). Joined, the texts read as one paragraph.
 * @param {import('../contract.js').DashboardModel} model  the whole account: a filter does not change the sentence
 * @returns {Array<{ text: string, href: string, tone?: 'greeting' }>}
 */
export function briefingSentence(model) {
  if (model?.state === 'empty') {
    return [greeting(model, 'Welcome'), plain(' Nothing is planned yet. Tell Trippy where you would like to go and it will draft the days.')];
  }
  const hello = greeting(model, GREETINGS[model?.now?.partOfDay] ?? 'Hello');
  if (model?.state !== 'ready') return [hello];
  const cards = Object.values(model.cardsById ?? {});
  const planning = planningParts(cards);
  const live = Array.isArray(model.live) ? model.live : [];
  const upcoming = model.next
    ? nextParts(model.next, { brief: planning.length > 0 })
    : quietParts(cards, { running: live.length > 0, nowIso: model.now?.iso });
  return [hello, ...planning, ...liveParts(live), ...upcoming];
}

/**
 * While the briefing of the next plan is still awaited, the sentence it could grow into: the same
 * words with the longest readiness clause. A view draws it unseen behind the h1, so the lines below
 * do not move when the briefing arrives. '' when nothing is awaited.
 * @param {import('../contract.js').DashboardModel} model
 */
export function briefingReserve(model) {
  const next = model?.state === 'ready' ? model.next : null;
  if (!next?.trip?.briefingPending) return '';
  const now = briefingSentence(model).map((part) => part.text).join('');
  return now.endsWith('.') ? `${now.slice(0, -1)}${LONGEST_CLAUSE}` : now;
}

/** "Marrakech" from "Marrakech, Morocco"; the title when there is no place line. */
const placeOf = (model) => text(model?.placeLine).split(',')[0].trim() || text(model?.title);

/** An area as the sentence names it: "Central and Western" for "Central and Western District". */
const areaName = (value) => text(value).replace(/\s+district$/i, '') || text(value);

/**
 * The first and the last city of a plan across several cities, from its stored route. Such a plan is
 * told by its cities: the areas its stops fall in are districts of them that few readers know.
 * @param {import('../contract.js').TripOverviewModel} model
 * @returns {{ from: string, to: string }|null} null for a plan in one city, or with a city unnamed
 */
function citySpan(model) {
  const route = model?.route;
  const from = text(route?.from?.label);
  const to = text(route?.to?.label);
  return route?.kind === 'multi' && from && to && from !== to ? { from, to } : null;
}

/**
 * The trip's brief, one sentence: "Seven balanced days for two: food, history and markets, from
 * Medina out to Ourika valley." A plan across several cities ends "from Vienna to Budapest". An
 * imported trip, or one with no style fields, gets the short form: "Seven days in Marrakech for two."
 * @param {import('../contract.js').TripOverviewModel} model
 */
export function tripBrief(model) {
  const count = model?.dates?.dayCount || model?.days?.length || 0;
  const brief = model?.brief ?? {};
  const pace = PACE_WORDS[text(brief.pace).toLowerCase()] ?? '';
  const interests = (Array.isArray(brief.interests) ? brief.interests : []).map(text).filter(Boolean).slice(0, MAX_INTERESTS).map((word) => word.toLowerCase());
  const first = areaName(brief.firstArea);
  const last = areaName(brief.lastArea);
  const who = Number.isFinite(model?.travellers) && model.travellers > 0 ? ` for ${numberWord(model.travellers)}` : '';
  const days = (adjective) => (count ? `${capital(numberWord(count))} ${adjective ? `${adjective} ` : ''}${count === 1 ? 'day' : 'days'}` : 'A plan');
  if (model?.imported || (!pace && !interests.length && !first && !last)) {
    const place = placeOf(model);
    return `${days('')}${place ? ` in ${place}` : ''}${who}.`;
  }
  const what = interests.length ? `: ${wordList(interests)}` : '';
  const cities = citySpan(model);
  const where = cities ? `, from ${cities.from} to ${cities.to}`
    : first && last && first !== last ? `, from ${first} out to ${last}` : first || last ? `, around ${first || last}` : '';
  return `${days(pace)}${who}${what}${where}.`;
}

/**
 * The sentence under "Before you go": what is left, and how much time there is for it.
 * @param {import('../contract.js').Readiness|null} readiness
 * @param {number|null} daysToGo  null when the plan has no dates or has started
 */
export function readinessSentence(readiness, daysToGo) {
  if (!readiness) return '';
  const { todo, pending } = readiness;
  if (todo > 0) {
    const left = `${capital(things(todo))} to settle`;
    if (!Number.isFinite(daysToGo) || daysToGo < 1) return `${left}.`;
    if (daysToGo === 1) return `${left} before tomorrow.`;
    if (daysToGo >= UNHURRIED_DAYS) return `${left}. With ${daysToGo} days in hand, ${todo === 1 ? 'it is not urgent' : 'none of them is urgent'}.`;
    return `${left}, with ${daysToGo} days to go.`;
  }
  if (pending > 0) return `Nothing to settle so far. ${capital(numberWord(pending))} ${pending === 1 ? 'check is' : 'checks are'} still running.`;
  return 'Everything is settled.';
}
