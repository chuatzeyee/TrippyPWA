// The numbers of the admin console: figures, the weekly chart, generation health and the list of
// things that need a look. Pure: rows in, plain objects out, `now` always passed in.
import { DAY_MS, HOUR_MS, displayName, formatDate, formatTime, num, plural, toDate } from './admin-format.js';

export const WEEKS_SHOWN = 12;
export const STUCK_AFTER_MS = 30 * 60000;
export const ONBOARDING_GRACE_MS = 3 * DAY_MS;
export const BURST_SIZE = 5;
const HEALTH_WINDOW_MS = 30 * DAY_MS;
const PLANNED = ['generated', 'active', 'completed'];

const time = (value) => toDate(value)?.getTime() ?? null;

/** How many rows have `field` in [from, until). */
export function countBetween(rows, from, until, field = 'created_at') {
  let count = 0;
  for (const row of rows ?? []) {
    const at = time(row?.[field]);
    if (at !== null && at >= from && at < until) count += 1;
  }
  return count;
}

/** Monday 00:00 UTC of the week `value` is in, as a timestamp. */
export function weekStart(value) {
  const date = toDate(value);
  if (!date) return null;
  const day = (date.getUTCDay() + 6) % 7; // Monday is 0
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day);
}

/**
 * Sign-ups and trips per week, oldest first, ending with the week of `now`.
 * @returns {Array<{ start: string, label: string, people: number, trips: number }>}
 */
export function weeklySeries(people, trips, now, weeks = WEEKS_SHOWN) {
  const last = weekStart(now);
  if (last === null) return [];
  const out = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const from = last - i * 7 * DAY_MS;
    const until = from + 7 * DAY_MS;
    const start = new Date(from).toISOString();
    out.push({
      start,
      label: formatDate(start, { timeZone: 'UTC' }).replace(/ \d{4}$/, ''),
      people: countBetween(people, from, until),
      trips: countBetween(trips, from, until),
    });
  }
  return out;
}

/** The largest value of the chart and a round top for its scale (at least 2). */
export function chartScale(series) {
  const max = Math.max(0, ...series.flatMap((week) => [week.people, week.trips]));
  const steps = [2, 4, 8, 12, 20, 40, 80, 120, 200, 400, 800, 1200, 2000, 4000, 8000];
  const top = steps.find((step) => step >= max) ?? Math.ceil(max / 4000) * 4000;
  return { max, top, ticks: [top, top / 2, 0] };
}

/**
 * Errors in the last day and week with the period before each, from the sampled log rows. Used when
 * the exact counts could not be read.
 */
export function errorCountsFromFacts(facts, now) {
  const ref = time(now) ?? 0;
  const errors = (facts ?? []).filter((row) => row.level === 'error');
  return {
    day: countBetween(errors, ref - DAY_MS, ref + 1),
    dayBefore: countBetween(errors, ref - 2 * DAY_MS, ref - DAY_MS),
    week: countBetween(errors, ref - 7 * DAY_MS, ref + 1),
    weekBefore: null,
  };
}

/**
 * The figures of Overview.
 * @returns {Array<{ key: string, label: string, value: string, change: string, alert: boolean }>}
 */
export function overviewFigures({ people = [], trips = [], peopleTotal, tripsTotal, errors = {}, now }) {
  const ref = time(now) ?? 0;
  const weekAgo = ref - 7 * DAY_MS;
  const planned = trips.filter((trip) => PLANNED.includes(trip.status));
  const failed = trips.filter((trip) => trip.status === 'failed');
  const thisWeek = (rows) => countBetween(rows, weekAgo, ref + 1);
  const before = (count, words) => (Number.isFinite(count) ? `${num(count)} ${words}` : 'No earlier figure');
  const joined = thisWeek(people);
  const created = thisWeek(trips);
  const plannedWeek = thisWeek(planned);
  const failedWeek = thisWeek(failed);
  return [
    { key: 'people', label: 'People', value: num(peopleTotal ?? people.length), change: joined ? `${num(joined)} joined this week` : 'Nobody joined this week', alert: false },
    { key: 'trips', label: 'Trips', value: num(tripsTotal ?? trips.length), change: created ? `${num(created)} created this week` : 'None created this week', alert: false },
    { key: 'planned', label: 'Plans generated', value: num(planned.length), change: plannedWeek ? `${num(plannedWeek)} this week` : 'None this week', alert: false },
    { key: 'failed', label: 'Failed plans', value: num(failed.length), change: failedWeek ? `${num(failedWeek)} this week` : 'None this week', alert: failed.length > 0 },
    { key: 'errors-day', label: 'Errors, last 24 hours', value: num(errors.day ?? 0), change: before(errors.dayBefore, 'the day before'), alert: (errors.day ?? 0) > 0 },
    { key: 'errors-week', label: 'Errors, last 7 days', value: num(errors.week ?? 0), change: before(errors.weekBefore, 'the week before'), alert: (errors.week ?? 0) > 0 },
  ];
}

/** The first line of an error, cut to a readable length. */
export function errorLine(text, max = 160) {
  const line = String(text ?? '').split('\n').map((part) => part.trim()).find(Boolean) ?? '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()} (cut)` : line;
}

/**
 * Generation health over the last 30 days of jobs.
 * @param {Array<object>} jobs    generation_jobs rows, any order
 * @param {Array<object>} trips
 * @param {Map<string, object>} peopleById
 * @returns {{ succeeded: number, failed: number, running: number, rate: number|null,
 *   failures: Array<{ key: string, tripId: string|null, title: string, owner: string, error: string, at: string|null, canRetry: boolean }> }}
 */
export function generationHealth(jobs, trips, peopleById, now) {
  const ref = time(now) ?? 0;
  const tripsById = new Map((trips ?? []).map((trip) => [trip.id, trip]));
  const recent = (jobs ?? []).filter((job) => { const at = time(job.created_at); return at !== null && at >= ref - HEALTH_WINDOW_MS; });
  const succeeded = recent.filter((job) => job.status === 'succeeded').length;
  const failed = recent.filter((job) => job.status === 'failed').length;
  const running = recent.filter((job) => job.status === 'queued' || job.status === 'processing').length;
  const finished = succeeded + failed;

  // The newest job of each trip decides whether that trip still counts as a failure.
  const newest = new Map();
  for (const job of recent) {
    const held = newest.get(job.trip_id);
    if (!held || (time(job.created_at) ?? 0) > (time(held.created_at) ?? 0)) newest.set(job.trip_id, job);
  }
  const owner = (userId) => { const person = peopleById?.get(userId); return person ? displayName(person) : 'Someone who has left'; };
  const fromJobs = [...newest.values()]
    .filter((job) => job.status === 'failed')
    .sort((a, b) => (time(b.updated_at ?? b.created_at) ?? 0) - (time(a.updated_at ?? a.created_at) ?? 0))
    .map((job) => {
      const trip = tripsById.get(job.trip_id);
      return {
        key: `job-${job.id}`,
        tripId: trip ? trip.id : null,
        title: trip?.title?.trim() || 'A trip that is gone',
        owner: owner(job.user_id),
        error: errorLine(job.error) || 'No error was recorded.',
        at: job.updated_at ?? job.created_at ?? null,
        canRetry: trip?.status === 'failed',
      };
    });
  const listed = new Set(fromJobs.map((failure) => failure.tripId));
  const fromTrips = (trips ?? [])
    .filter((trip) => trip.status === 'failed' && !listed.has(trip.id))
    .map((trip) => ({
      key: `trip-${trip.id}`,
      tripId: trip.id,
      title: trip.title?.trim() || 'Untitled trip',
      owner: owner(trip.user_id),
      error: 'No error was recorded.',
      at: trip.updated_at ?? trip.created_at ?? null,
      canRetry: true,
    }));
  return { succeeded, failed, running, rate: finished ? Math.round((succeeded / finished) * 100) : null, failures: [...fromJobs, ...fromTrips] };
}

/** Hours of the last day that hold at least BURST_SIZE errors, newest first. */
export function errorBursts(facts, now, { timeZone } = {}) {
  const ref = time(now) ?? 0;
  const hours = new Map();
  for (const row of facts ?? []) {
    if (row.level !== 'error') continue;
    const at = time(row.created_at);
    if (at === null || at < ref - DAY_MS || at > ref) continue;
    const hour = Math.floor(at / HOUR_MS) * HOUR_MS;
    hours.set(hour, (hours.get(hour) ?? 0) + 1);
  }
  return [...hours.entries()]
    .filter(([, count]) => count >= BURST_SIZE)
    .sort((a, b) => b[0] - a[0])
    .map(([hour, count]) => ({ hour: new Date(hour).toISOString(), count, label: `${formatTime(hour, { timeZone })} to ${formatTime(hour + HOUR_MS, { timeZone })}` }));
}

/** "40 minutes", "5 hours", "3 days": how long something has been waiting. */
export function waitedWords(ms) {
  if (ms >= 2 * DAY_MS) return plural(Math.floor(ms / DAY_MS), 'day', 'days');
  if (ms >= HOUR_MS) return plural(Math.floor(ms / HOUR_MS), 'hour', 'hours');
  return plural(Math.max(1, Math.floor(ms / 60000)), 'minute', 'minutes');
}

/**
 * What needs a look, most urgent first. Each item says where it leads.
 * @returns {Array<{ key: string, kind: 'failed'|'stuck'|'onboarding'|'burst', title: string, detail: string,
 *   section: 'people'|'trips'|'activity', id?: string, chip?: string }>}
 */
export function needsAttention({ people = [], trips = [], facts = [], now, timeZone }) {
  const ref = time(now) ?? 0;
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const owner = (trip) => { const person = peopleById.get(trip.user_id); return person ? displayName(person) : 'someone who has left'; };
  const items = [];
  for (const trip of trips) {
    if (trip.status === 'failed') {
      items.push({ key: `failed-${trip.id}`, kind: 'failed', title: `Planning failed for ${trip.title?.trim() || 'an untitled trip'}`, detail: `Owned by ${owner(trip)}`, section: 'trips', id: trip.id });
    }
  }
  for (const trip of trips) {
    const since = time(trip.updated_at ?? trip.created_at);
    if (trip.status === 'generating' && since !== null && ref - since > STUCK_AFTER_MS) {
      const waited = waitedWords(ref - since);
      items.push({ key: `stuck-${trip.id}`, kind: 'stuck', title: `${trip.title?.trim() || 'An untitled trip'} has been planning for ${waited}`, detail: `Owned by ${owner(trip)}`, section: 'trips', id: trip.id });
    }
  }
  for (const burst of errorBursts(facts, now, { timeZone })) {
    items.push({ key: `burst-${burst.hour}`, kind: 'burst', title: `${num(burst.count)} errors in one hour`, detail: `${burst.label}, ${formatDate(burst.hour, { timeZone })}`, section: 'activity', chip: 'error' });
  }
  const waiting = people.filter((person) => {
    const joined = time(person.created_at);
    return !person.onboarding_complete && joined !== null && ref - joined > ONBOARDING_GRACE_MS;
  });
  if (waiting.length === 1) {
    items.push({ key: `onboarding-${waiting[0].id}`, kind: 'onboarding', title: `${displayName(waiting[0])} never finished setting up`, detail: `Joined ${formatDate(waiting[0].created_at, { timeZone })}`, section: 'people', id: waiting[0].id });
  } else if (waiting.length > 1) {
    items.push({ key: 'onboarding', kind: 'onboarding', title: `${num(waiting.length)} people never finished setting up`, detail: 'They joined more than 3 days ago', section: 'people', chip: 'pending' });
  }
  return items;
}

/**
 * When each person was last seen: the newest of their profile change and their sampled log rows.
 * @returns {Map<string, string>}
 */
export function lastActiveByUser(people, facts) {
  const seen = new Map();
  const note = (id, value) => {
    const at = time(value);
    if (!id || at === null) return;
    if (!seen.has(id) || at > seen.get(id)) seen.set(id, at);
  };
  for (const person of people ?? []) note(person.id, person.updated_at ?? person.created_at);
  for (const row of facts ?? []) note(row.user_id, row.created_at);
  return new Map([...seen.entries()].map(([id, at]) => [id, new Date(at).toISOString()]));
}

/** The one line under the title: "19 people, 42 trips, 3 failed plans in the last 24 hours". */
export function statusLine({ peopleTotal = 0, tripsTotal = 0, jobs = [], trips = [], now }) {
  const ref = time(now) ?? 0;
  const failedJobs = (jobs ?? []).filter((job) => job.status === 'failed' && (time(job.updated_at ?? job.created_at) ?? 0) >= ref - DAY_MS).length;
  const failedTrips = (trips ?? []).filter((trip) => trip.status === 'failed' && (time(trip.updated_at ?? trip.created_at) ?? 0) >= ref - DAY_MS).length;
  const failed = Math.max(failedJobs, failedTrips);
  const tail = failed ? `${plural(failed, 'failed plan', 'failed plans')} in the last 24 hours` : 'no failed plans in the last 24 hours';
  return `${plural(peopleTotal, 'person', 'people')}, ${plural(tripsTotal, 'trip', 'trips')}, ${tail}`;
}
