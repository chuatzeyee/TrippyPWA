// The order of a day's activities, and the start-time reading it rests on.
// Moved here unchanged from js/data/trip-repository.js (task F2), which
// re-exports the three functions, so that the pure model builders can order
// stops without importing a data module. No DOM, no network, no storage.

// A leading 'H:MM' or 'HH:MM' (optionally with seconds and am/pm). Anything
// after it (for example the end of a '09:00-10:00' range) is ignored for sorting.
const TIME_PREFIX_RE = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([ap])\.?\s*m\b\.?)?/i;

function parseTime(value) {
  const m = TIME_PREFIX_RE.exec(String(value ?? ''));
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem && (hours < 1 || hours > 12)) return null;
  if (meridiem === 'p' && hours < 12) hours += 12;
  if (meridiem === 'a' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { minutes: hours * 60 + minutes, length: m[0].length };
}

/** Minutes after midnight of an activity's start time, or null when it has none. */
export function startMinutes(value) {
  return parseTime(value)?.minutes ?? null;
}

/** Zero-padded 'HH:MM' when the whole value is a time; any other text is kept as typed. */
export function normStartTime(value) {
  const text = value == null ? '' : String(value).trim();
  const parsed = parseTime(text);
  if (!parsed || text.slice(parsed.length).trim()) return text;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(Math.floor(parsed.minutes / 60))}:${pad(parsed.minutes % 60)}`;
}

// Where an untimed activity with no timed one listed before it starts its day.
const SLOT_START_MINUTES = { morning: 0, afternoon: 720, evening: 1020 };

const bySortOrder = (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);

/**
 * A day's activities in display order (a new array). Timed activities go by
 * start time. An untimed one stays right after the timed activity listed before
 * it (by sort_order), or at the start of its time slot when there is none, so a
 * list without times keeps the order it was written in. Every activity gets one
 * sort key, which makes this a total order whatever the input order.
 * @param {object[]} list activity rows (start_time, time_slot, sort_order)
 * @returns {object[]}
 */
export function sortDayActivities(list) {
  let previousTimed = null;
  return (Array.isArray(list) ? [...list] : [])
    .sort(bySortOrder)
    .map((activity, position) => {
      const own = startMinutes(activity.start_time);
      if (own !== null) previousTimed = own;
      const key = own ?? previousTimed ?? SLOT_START_MINUTES[activity.time_slot] ?? 0;
      return { activity, key, position };
    })
    .sort((a, b) => a.key - b.key || a.position - b.position)
    .map(({ activity }) => activity);
}
