// The glance facts as a <dl> (blueprint 2.4, 3.4). Owner: F6.
//
// One <div> per fact, keyed, so a patch of the glance region keeps the facts that did not change. A
// fact that is missing (no value, no label) is skipped, never drawn empty. The cost always says whose
// it is: "per person, activities only".
import { attr, cls, esc } from './html.js';
import { COST_BASIS_TEXT } from '../../lib/money.js';
import { conditionPhrase } from './day-index.js';

/** The section cards and the Prep checklist: what data-section-jump can open (blueprint 3.4). */
const SECTION_TARGETS = Object.freeze(['flights', 'transport', 'accommodation', 'entry', 'checklist']);

const text = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');
const isFact = (fact) => Boolean(fact) && typeof fact === 'object' && text(fact.label) !== '' && text(fact.value) !== '';

/**
 * The weather note with its condition spelled out (ruling R30): "Pt. Cloudy, typical for early March"
 * reads "Partly cloudy, typical for early March". Only the part before the first comma is the
 * condition; a note that starts with the season line is left as it is.
 */
function weatherNote(note) {
  const cut = note.indexOf(',');
  const head = cut < 0 ? '' : note.slice(0, cut);
  if (!head || /^typical/i.test(head.trim())) return note;
  const phrase = conditionPhrase(head);
  return phrase ? `${phrase[0].toUpperCase()}${phrase.slice(1)}${note.slice(cut)}` : note;
}

/** The note of a fact; a cost that does not say "per person" yet is given the words. */
function noteOf(fact) {
  const note = fact.key === 'weather' ? weatherNote(text(fact.note)) : text(fact.note);
  if (fact.key !== 'cost' || /per person/i.test(`${fact.value} ${note}`)) return note;
  return note ? `${COST_BASIS_TEXT}. ${note}` : COST_BASIS_TEXT;
}

/** "about €390" as two spans, so a view can set the word small beside the large figure. */
function aboutHtml(value) {
  const match = /^about\s+(\S.*)$/.exec(value);
  return match ? `<span class="tv-fact-about">about</span> <span class="tv-fact-figure">${esc(match[1])}</span>` : esc(value);
}

function valueHtml(fact, jumps, splitAbout) {
  const value = `<span class="tv-fact-value">${splitAbout ? aboutHtml(text(fact.value)) : esc(text(fact.value))}</span>`;
  const shared = `${attr('data-focus-key', `glance-${fact.key}`)}${attr('aria-label', `${text(fact.label)}: ${text(fact.value)}`)}`;
  if (SECTION_TARGETS.includes(fact.jump)) {
    return `<button type="button" class="tv-fact-jump"${attr('data-section-jump', fact.jump)}${attr('aria-controls', `td-section-${fact.jump}`)} aria-expanded="false"${shared}>${value}</button>`;
  }
  if (jumps.includes(fact.jump)) return `<button type="button" class="tv-fact-jump"${attr('data-glance-jump', fact.jump)}${shared}>${value}</button>`;
  return value;
}

function factHtml(fact, jumps, splitAbout) {
  const note = noteOf(fact);
  return `<div class="tv-fact"${attr('data-key', fact.key)}${attr('data-fact', fact.key)}>
      <dt class="tv-fact-label">${esc(text(fact.label))}</dt>
      <dd class="tv-fact-body">${valueHtml(fact, jumps, splitAbout)}${note ? `<span class="tv-fact-note">${esc(note)}</span>` : ''}</dd>
    </div>`;
}

/**
 * @param {import('../contract.js').GlanceFact[]} facts  model.glance
 * @param {{ keys?: string[], jumps?: string[], region?: boolean, label?: string, splitAbout?: boolean, cls?: any }} [opts]
 *   keys    show these facts only, in this order (a view that leads with the cost, or leaves Ready out)
 *   jumps   targets other than a section card that the caller handles itself ('readiness', 'spending'):
 *           such a fact becomes a button with data-glance-jump="<target>". A section target always
 *           becomes a data-section-jump button; any other target is plain text.
 *   region  false leaves data-region="glance" off, for a second list on the same page
 *   label   the accessible name of the list, "At a glance" by default
 *   splitAbout  true marks up a converted figure in two spans inside .tv-fact-value:
 *           <span class="tv-fact-about">about</span> <span class="tv-fact-figure">€390</span>, so a skin can
 *           set the word apart from the figure. The text of the value, and its aria-label, stay the same.
 * @returns {string} '' when no fact is left
 */
export function glanceHtml(facts, { keys, jumps = [], region = true, label = 'At a glance', splitAbout = false, cls: extra } = {}) {
  const present = (Array.isArray(facts) ? facts : []).filter(isFact);
  const shown = Array.isArray(keys) ? keys.flatMap((key) => present.filter((fact) => fact.key === key).slice(0, 1)) : present;
  if (!shown.length) return '';
  const handled = Array.isArray(jumps) ? jumps.filter((target) => typeof target === 'string' && target !== '') : [];
  return `<dl class="${cls('tv-glance', extra)}"${region ? ' data-region="glance"' : ''}${attr('aria-label', label)}>
    ${shown.map((fact) => factHtml(fact, handled, splitAbout === true)).join('')}
  </dl>`;
}
