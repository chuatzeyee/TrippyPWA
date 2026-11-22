// Every value an admin page shows comes from the database and may be hostile: a name, a title, a log
// message, a metadata key, an error text or an avatar address that tries to break out of the markup.
// Invented data only.
import { describe, expect, it } from 'vitest';
import { overviewHtml } from './admin-overview.js';
import { peopleHtml } from './admin-people.js';
import { deletePrompt, retryPrompt, tripsHtml } from './admin-trips.js';
import { activityHtml } from './admin-logs.js';
import { NOW, data, vm } from './admin.test-kit.js';

const EVIL = '"><img src=x onerror="alert(1)">\'<script>alert(2)</script>';
const H = 3600000;
const ago = (ms) => new Date(Date.parse(NOW) - ms).toISOString();

const people = [
  { id: 'me', display_name: 'Op', avatar_url: '', role: 'admin', home_city: '', home_country: '', home_flag: '', is_nomad: false, onboarding_complete: true, created_at: ago(90 * 24 * H), updated_at: ago(H) },
  { id: `p"${EVIL}`, display_name: EVIL, avatar_url: `https://example.org/a.png"onerror="alert(3)`, role: 'user', home_city: EVIL, home_country: EVIL, home_flag: EVIL, is_nomad: true, onboarding_complete: false, created_at: ago(9 * 24 * H), updated_at: ago(H) },
  { id: 'p-js', display_name: 'Js', avatar_url: 'javascript:alert(4)', role: EVIL, home_city: 'x', home_country: 'y', home_flag: 'sg', is_nomad: false, onboarding_complete: true, created_at: ago(8 * 24 * H), updated_at: ago(H) },
  { id: 'p-data', display_name: 'Data', avatar_url: 'data:text/html,<script>alert(5)</script>', role: 'user', home_city: '', home_country: '', home_flag: '', is_nomad: false, onboarding_complete: true, created_at: ago(7 * 24 * H), updated_at: ago(H) },
];
const evilId = people[1].id;
const trips = [
  { id: `t"${EVIL}`, title: EVIL, status: 'failed', user_id: evilId, start_date: EVIL, end_date: EVIL, created_at: ago(3 * H), updated_at: ago(2 * H), itinerary_days: [] },
  { id: 't2', title: EVIL, status: EVIL, user_id: evilId, start_date: '2027-05-01', end_date: '2027-05-02', created_at: ago(5 * H), updated_at: ago(5 * H), itinerary_days: [] },
  { id: 't3', title: EVIL, status: 'generating', user_id: 'gone', start_date: null, end_date: null, created_at: ago(40 * H), updated_at: ago(40 * H), itinerary_days: [] },
];
const jobs = [{ id: EVIL, trip_id: trips[0].id, user_id: evilId, status: 'failed', error: EVIL, last_provider: EVIL, created_at: ago(3 * H), updated_at: ago(2 * H) }];
const logs = [{
  id: `l"${EVIL}`, level: EVIL, category: EVIL, message: `${EVIL}\nsecond line ${EVIL}`, source: EVIL, user_agent: EVIL,
  metadata: { [EVIL]: EVIL, nested: { [EVIL]: [EVIL, { [EVIL]: EVIL }] }, stack: `${EVIL}\n${EVIL}` },
  user_id: evilId, trip_id: trips[0].id, created_at: ago(H), profiles: { display_name: EVIL }, trips: { title: EVIL },
}];
const facts = Array.from({ length: 6 }, (_, i) => ({ level: 'error', category: EVIL, source: EVIL, user_id: evilId, trip_id: null, created_at: ago(H + i * 1000) }));

const world = data({ people, trips, jobs, facts, peopleTotal: 4, tripsTotal: 3, warnings: [EVIL] });
const base = vm({ meId: 'me', data: world });

/** No tag, handler or script of the hostile value survives: every "<" and quote of it is an entity. */
function expectInert(html) {
  expect(html).not.toContain('<img src=x');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('javascript:');
  expect(html).not.toContain('data:text/html');
  // Outside quoted attribute values no tag carries a handler, and no quoted value holds a raw quote
  // followed by a handler (which is how a breakout would read).
  expect(html.replace(/"[^"]*"/g, '""')).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
  expect(html).not.toMatch(/"\s*on[a-z]+="/i);
  expect(html).not.toContain(EVIL);
}

describe('hostile values stay text', () => {
  it('in the overview', () => {
    expectInert(overviewHtml(base));
  });

  it('in people, with the hostile person open and their log lines shown', () => {
    const html = peopleHtml({ ...base, people: { ...base.people, openId: evilId, detail: { id: evilId, status: 'ready', logs } } });
    expectInert(html);
    expect(html).toContain('&lt;img src=x');
    // The quoted avatar address is kept only as its parsed form: the quote is percent encoded.
    expect(html).toMatch(/src="https:\/\/example\.org\/a\.png%22onerror=%22alert\(3\)"/);
  });

  it('in trips and in the words of the confirm dialogs', () => {
    expectInert(tripsHtml(base));
    // The dialog escapes its own title and body; the prompts are plain text, never markup.
    for (const prompt of [deletePrompt(trips[0], people[1]), retryPrompt(trips[1], people[1])]) {
      expect(typeof prompt.title).toBe('string');
      expect(typeof prompt.body).toBe('string');
    }
  });

  it('in activity, with the hostile line open (message, metadata keys and values, device)', () => {
    const html = activityHtml({ ...base, activity: { ...base.activity, logs, count: 1, openId: logs[0].id } });
    expectInert(html);
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
  });
});
