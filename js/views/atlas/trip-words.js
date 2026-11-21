// The wordings of the Atlas trip landing that are decided from the model: the size step of the title,
// what the status chip shows, the one sentence of "Before you go" and the in-page links. Pure. Owner: VC.

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
const JUMP_LABELS = { stay: 'Stay', entry: 'Entry' };
// The section cards on the page run flights (or transport), entry requirements, where to stay.
const JUMP_ORDER = { entry: 1, stay: 2 };
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** '' for a short title, 'm' for a middling one, 'l' for a long one: the title never shrinks to fit, it steps down and wraps. */
export function titleSize(title) {
  const length = text(title).length;
  if (length > 26) return 'l';
  return length > 14 ? 'm' : '';
}

/**
 * What the status chip on the cover shows.
 * @param {import('../contract.js').TripOverviewModel} model
 * @returns {{ kind: 'countdown', value: number, words: string }
 *   | { kind: 'day', value: number, total: number, next: string }
 *   | { kind: 'text', words: string }}
 *   countdown: an upcoming plan, the number goes on the flaps. day: a live plan, with its next stop
 *   in words ('' when there is none). text: everything else, in the words of the model.
 */
export function statusParts(model) {
  const plain = { kind: 'text', words: text(model?.statusText) };
  if (model?.status === 'failed') return plain;
  if (model?.phase === 'live' && model.live) {
    const stop = model.live.today?.nextStop ?? null;
    const next = stop && text(stop.title) ? `Next stop${stop.time ? `, ${stop.time}` : ''}: ${stop.title}` : '';
    return { kind: 'day', value: model.live.dayNumber, total: model.live.dayCount, next };
  }
  if (model?.phase === 'upcoming' && Number.isFinite(model.daysToGo) && model.daysToGo >= 1) {
    return { kind: 'countdown', value: model.daysToGo, words: model.daysToGo === 1 ? 'day to go' : 'days to go' };
  }
  return plain;
}

/**
 * The one sentence under the count of "Before you go": how long is left, what still needs the user
 * and where to start. '' when the plan has no readiness (a past plan, a plan that is being planned).
 * @param {import('../contract.js').TripOverviewModel} model
 */
export function readySentence(model) {
  const readiness = model?.readiness;
  if (!readiness) return '';
  const items = Array.isArray(readiness.items) ? readiness.items : [];
  const open = items.filter((item) => item.state === 'todo');
  const waiting = items.some((item) => item.state === 'checking');
  const parts = [];
  if (model.phase === 'upcoming' && Number.isFinite(model.daysToGo) && model.daysToGo >= 1) {
    parts.push(model.daysToGo === 1 ? 'It starts tomorrow.' : `${model.daysToGo} days to go.`);
  }
  const first = text(open[0]?.label).toLowerCase();
  if (open.length === 1) parts.push(`One thing still needs you${first ? `: ${first}` : ''}.`);
  else if (open.length > 1) parts.push(`${NUMBER_WORDS[open.length] ?? open.length} things still need you.${first ? ` Next up: ${first}.` : ''}`);
  else if (!waiting) parts.push('Everything is settled.');
  if (waiting) parts.push('The entry check is still running.');
  return parts.join(' ');
}

/**
 * The in-page links beside the tabs, in the order of the page: Before you go, the section card of each
 * area that has one (the checklist is a tab, not a section), then Day by day. [] when the plan has no days or no readiness.
 * @param {import('../contract.js').TripOverviewModel} model
 * @returns {Array<{ label: string, to?: 'days'|'ready', section?: string }>}
 */
export function jumpItems(model) {
  const items = Array.isArray(model?.readiness?.items) ? model.readiness.items : [];
  if (!model?.readiness || !Array.isArray(model.days) || !model.days.length) return [];
  const seen = new Set();
  const sections = items.filter((item) => item.target && item.target !== 'checklist').flatMap((item) => {
    if (seen.has(item.target)) return [];
    seen.add(item.target);
    return [{ label: JUMP_LABELS[item.area] ?? item.label, section: item.target, at: JUMP_ORDER[item.area] ?? 0 }];
  }).sort((a, b) => a.at - b.at).map(({ label, section }) => ({ label, section }));
  return [{ label: 'Before you go', to: 'ready' }, ...sections, { label: 'Day by day', to: 'days' }];
}

const SHORT_CONDITION = /\bPt\.? ?(cloudy|sunny)\b/gi;

/**
 * The glance facts as this landing prints them. The note of the weather fact is a sentence, so a short
 * weather label in it is spelled out (ruling R30): "Pt. Cloudy, typical for early March" reads
 * "Partly cloudy, typical for early March". Nothing else changes, and the facts given are not touched.
 * For a live plan the Ready count is left out: readiness is then the one line under the days
 * (blueprint 7.3), not the first fact.
 * @param {import('../contract.js').GlanceFact[]} facts  model.glance
 * @param {{ live?: boolean }} [opts]  live: the plan is under way
 */
export function glanceFacts(facts, { live = false } = {}) {
  if (!Array.isArray(facts)) return [];
  return facts.filter((fact) => !(live && fact?.key === 'ready')).map((fact) => {
    if (fact?.key !== 'weather' || typeof fact.note !== 'string') return fact;
    const note = fact.note.replace(SHORT_CONDITION, (whole, word, at) => `${at === 0 ? 'Partly' : 'partly'} ${word.toLowerCase()}`);
    return note === fact.note ? fact : { ...fact, note };
  });
}
