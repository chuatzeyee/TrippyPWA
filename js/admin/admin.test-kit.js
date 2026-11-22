// An invented little world for the admin tests: four people, six trips, a few jobs and log lines.
// Nothing here comes from a real account.
export const NOW = '2027-03-10T08:00:00Z';
export const TZ = 'UTC';

const ago = (ms) => new Date(Date.parse(NOW) - ms).toISOString();
const H = 3600000;
const D = 86400000;

export const PEOPLE = Object.freeze([
  { id: 'p-ana', display_name: 'Ana Lima', avatar_url: 'https://example.org/ana.png', role: 'admin', home_city: 'Lisbon', home_country: 'Portugal', home_flag: 'pt', is_nomad: false, onboarding_complete: true, created_at: ago(200 * D), updated_at: ago(2 * D) },
  { id: 'p-bo', display_name: 'Bo Chen', avatar_url: 'javascript:alert(1)', role: 'user', home_city: 'Singapore', home_country: 'Singapore', home_flag: 'sg', is_nomad: true, onboarding_complete: true, created_at: ago(20 * D), updated_at: ago(20 * D) },
  { id: 'p-cy', display_name: '<img src=x onerror=alert(1)>', avatar_url: '', role: 'user', home_city: '', home_country: '', home_flag: '', is_nomad: false, onboarding_complete: false, created_at: ago(10 * D), updated_at: ago(10 * D) },
  { id: 'p-di', display_name: '  ', avatar_url: null, role: 'user', home_city: 'Oslo', home_country: 'Norway', home_flag: 'NO', is_nomad: false, onboarding_complete: false, created_at: ago(1 * D), updated_at: ago(1 * D) },
]);

const days = (n) => Array.from({ length: n }, (_, i) => ({ day_number: i + 1 }));

export const TRIPS = Object.freeze([
  { id: 't-porto', title: 'Porto and the Douro', status: 'generated', user_id: 'p-ana', start_date: '2027-05-01', end_date: '2027-05-08', created_at: ago(30 * D), updated_at: ago(30 * D), itinerary_days: days(8) },
  { id: 't-kyoto', title: 'Kyoto in autumn', status: 'failed', user_id: 'p-bo', start_date: '2027-10-10', end_date: '2027-10-17', created_at: ago(3 * H), updated_at: ago(2 * H), itinerary_days: [] },
  { id: 't-stuck', title: 'Lofoten by ferry', status: 'generating', user_id: 'p-bo', start_date: '2027-07-01', end_date: '2027-07-05', created_at: ago(5 * H), updated_at: ago(5 * H), itinerary_days: [] },
  { id: 't-draft', title: '', status: 'planning', user_id: 'p-cy', start_date: null, end_date: null, created_at: ago(9 * D), updated_at: ago(9 * D), itinerary_days: [] },
  { id: 't-done', title: 'Seville <b>bold</b>', status: 'completed', user_id: 'p-ana', start_date: '2026-11-02', end_date: '2026-11-06', created_at: ago(150 * D), updated_at: ago(120 * D), itinerary_days: days(5) },
  { id: 't-gone', title: 'Orphan trip', status: 'active', user_id: 'p-left', start_date: '2027-03-08', end_date: '2027-03-12', created_at: ago(15 * D), updated_at: ago(15 * D), itinerary_days: days(5) },
]);

export const JOBS = Object.freeze([
  { id: 'j1', trip_id: 't-porto', user_id: 'p-ana', status: 'succeeded', error: '', created_at: ago(29 * D), updated_at: ago(29 * D) },
  { id: 'j2', trip_id: 't-kyoto', user_id: 'p-bo', status: 'failed', error: 'Gemini 503: model overloaded\n    at callProvider', created_at: ago(3 * H), updated_at: ago(2 * H) },
  { id: 'j3', trip_id: 't-gone', user_id: 'p-left', status: 'succeeded', error: '', created_at: ago(15 * D), updated_at: ago(15 * D) },
  { id: 'j4', trip_id: 't-gone', user_id: 'p-left', status: 'failed', error: 'timeout', created_at: ago(16 * D), updated_at: ago(16 * D) },
  { id: 'j5', trip_id: 't-stuck', user_id: 'p-bo', status: 'processing', error: '', created_at: ago(5 * H), updated_at: ago(5 * H) },
  { id: 'j6', trip_id: 't-old', user_id: 'p-ana', status: 'failed', error: 'too old to count', created_at: ago(60 * D), updated_at: ago(60 * D) },
]);

const fact = (level, category, source, userId, at) => ({ level, category, source, user_id: userId, trip_id: null, created_at: at });

/** Six errors inside one hour (a burst), one older error, a warning and two info lines. */
export const FACTS = Object.freeze([
  ...Array.from({ length: 6 }, (_, i) => fact('error', 'generation', 'edge', 'p-bo', ago(2 * H + i * 60000 + 1000))),
  fact('error', 'data', 'client', 'p-ana', ago(30 * H)),
  fact('warn', 'auth', 'client', 'p-ana', ago(4 * D)),
  fact('info', 'share', 'client', 'p-bo', ago(5 * D)),
  fact('info', 'system', 'edge', null, ago(6 * D)),
]);

export const LOGS = Object.freeze([
  { id: 'l1', level: 'error', category: 'generation', message: 'Provider failed <script>alert(1)</script>', metadata: { provider: 'gemini', httpStatus: 503, request: { attempt: 2, retry_after: null }, tags: ['a', 'b'], stack: 'Error: boom\n    at run (edge.ts:1)' }, user_id: 'p-bo', trip_id: 't-kyoto', source: 'edge', user_agent: 'Deno/2', created_at: ago(2 * H), profiles: { display_name: 'Bo Chen' }, trips: { title: 'Kyoto in autumn' } },
  { id: 'l2', level: 'warn', category: 'auth', message: 'Session refresh was slow', metadata: {}, user_id: 'p-ana', trip_id: null, source: 'client', user_agent: '', created_at: ago(4 * D), profiles: { display_name: 'Ana Lima' }, trips: null },
  { id: 'l3', level: 'info', category: 'system', message: 'Sweeper ran', metadata: null, user_id: null, trip_id: null, source: 'edge', user_agent: '', created_at: ago(6 * D), profiles: null, trips: null },
]);

export function data(overrides = {}) {
  return {
    people: PEOPLE, trips: TRIPS, peopleTotal: PEOPLE.length, tripsTotal: TRIPS.length, jobs: JOBS, facts: FACTS,
    factsTruncated: false, errors: { day: 6, dayBefore: 1, week: 7, weekBefore: 2 }, warnings: [], loadedAt: NOW, ...overrides,
  };
}

export function vm(overrides = {}) {
  return {
    now: NOW, timeZone: TZ, meId: 'p-ana', data: data(), busyTrips: new Set(),
    people: { q: '', chip: 'all', sort: { key: 'joined', dir: 'desc' }, openId: null, detail: null },
    trips: { q: '', status: 'all', sort: { key: 'created', dir: 'desc' }, focusId: null },
    activity: { level: 'all', category: 'all', source: 'all', q: '', logs: LOGS, count: 12, status: 'ready', error: '', openId: null, auto: false, loadingMore: false, copiedId: null },
    ...overrides,
  };
}

/** Glyphs no user-visible string may hold: em and en dash, middle dot, bullet, ellipsis, three dots. */
export const BANNED = /[—–·•…]|\.\.\./;

/** The text of a piece of markup: tags out, entities left as they are. */
export const textOf = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
