// The time rail of the Atlas dashboard, the pure half: month marks for what is ahead, month groups
// for what is behind. The markup is in dashboard-rail.js. Owner: VC.
import { monthLabel } from '../../lib/travel-stats.js';

const list = (value) => (Array.isArray(value) ? value.filter((card) => card && typeof card === 'object') : []);
const MONTH_KEY = /^\d{4}-\d{2}$/;
const labelOf = (key) => (MONTH_KEY.test(key) ? monthLabel(key, true) : 'No dates yet');

/** Neighbours with the same month key become one group; the order of the plans is kept. */
function byMonth(cards) {
  return cards.reduce((groups, card) => {
    const key = MONTH_KEY.test(card.monthKey ?? '') ? card.monthKey : 'undated';
    const last = groups[groups.length - 1];
    if (last && last.key === key) return [...groups.slice(0, -1), { ...last, trips: [...last.trips, card] }];
    return [...groups, { key, label: labelOf(key), trips: [card] }];
  }, []);
}

/**
 * What a closed month of the rail says it holds: its plans by name, so the row is never flags alone.
 * One or two plans are named in full; a longer month names its first two and counts the rest. No
 * title is cut short.
 * @param {Array<{ title?: string }>} trips
 * @returns {string} "Singapore", "Helsinki & Oulu and Singapore", "Tokyo, Kyoto and 3 more"; '' with no titled plan
 */
export function monthNames(trips) {
  const titles = list(trips).map((card) => (typeof card.title === 'string' ? card.title.trim() : '')).filter(Boolean);
  if (titles.length <= 2) return titles.join(' and ');
  return `${titles[0]}, ${titles[1]} and ${titles.length - 2} more`;
}

const latestEnd = (cards) => cards.map((card) => card.dates?.end || card.dates?.start || '').filter(Boolean).sort().pop() ?? null;

/**
 * @param {import('../contract.js').DashboardModel['sections']} sections  model.sections, whole or narrowed by a filter
 * @returns {{
 *   planning: object[],
 *   upcoming: Array<{ key: string, label: string, trips: object[] }>,
 *   past: Array<{ key: string, label: string, trips: object[], flags: string[] }>,
 *   lastAhead: string|null }}
 *   planning   the plans that are being planned or whose planning stopped
 *   upcoming   one entry per month mark ("Mar 2027"), soonest first as the model orders them, then the
 *              plans without dates under "No dates yet"
 *   past       one entry per month group, in the order of the model, with the flags of its plans
 *   lastAhead  the last day anything is planned for: of the upcoming plans, else of the live ones
 */
export function railGroups(sections) {
  const upcoming = list(sections?.upcoming);
  const undated = list(sections?.undated);
  const marks = byMonth(upcoming).filter((group) => group.key !== 'undated');
  const loose = [...upcoming.filter((card) => !MONTH_KEY.test(card.monthKey ?? '')), ...undated];
  return {
    planning: list(sections?.inProgress),
    upcoming: loose.length ? [...marks, { key: 'undated', label: labelOf('undated'), trips: loose }] : marks,
    past: byMonth(list(sections?.past)).map((group) => ({ ...group, flags: [...new Set(group.trips.flatMap((card) => (Array.isArray(card.flags) ? card.flags : [])))] })),
    lastAhead: latestEnd(upcoming) ?? latestEnd(list(sections?.live)),
  };
}
