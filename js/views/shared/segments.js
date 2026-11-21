// The day segments bar (blueprint 1.3): one segment per day, done, now or still to come. Used for
// the progress of a live plan and for the progress of planning. Owner: F5.
import { attr, cls } from './html.js';

const MAX_SEGMENTS = 60;

/**
 * @param {number} done      how many are done
 * @param {number} total     how many there are; nothing is drawn without a total
 * @param {number|null} [current]  the one in progress, counted from 1 (day 10 of 12), or null
 * @param {{ label?: string, cls?: any }} [opts] label replaces the spoken text
 * @returns {string} an image for assistive technology: "Day 10 of 12" or "4 of 9 done"
 */
export function segmentsHtml(done, total, current = null, { label, cls: extra } = {}) {
  if (!Number.isFinite(total) || total < 1) return '';
  const count = Math.round(total);
  const finished = Math.min(count, Math.max(0, Math.round(Number.isFinite(done) ? done : 0)));
  const now = Number.isFinite(current) ? Math.min(count, Math.max(1, Math.round(current))) : null;
  const drawn = Math.min(count, MAX_SEGMENTS);
  const segments = Array.from({ length: drawn }, (_, i) => {
    const first = Math.floor((i * count) / drawn) + 1;
    const last = Math.floor(((i + 1) * count) / drawn);
    const state = now !== null && now >= first && now <= last ? 'now' : last <= finished ? 'done' : 'todo';
    return `<i class="ui-seg" data-seg="${state}"></i>`;
  }).join('');
  const spoken = label ?? (now !== null ? `Day ${now} of ${count}` : `${finished} of ${count} done`);
  return `<span class="${cls('ui-segs', { 'is-complete': finished === count }, extra)}" role="img"${attr('aria-label', spoken)} style="--segs:${drawn}">${segments}</span>`;
}
