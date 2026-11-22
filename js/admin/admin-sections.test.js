// The markup of each section for the small invented world of admin.test-kit.js: what is on the page,
// that nothing from the database reaches it unescaped, and that the copy keeps the house rules.
import { describe, expect, it } from 'vitest';
import { overviewHtml } from './admin-overview.js';
import { peopleHtml, roleChange } from './admin-people.js';
import { deletePrompt, retryPrompt, tripsHtml } from './admin-trips.js';
import { activityHtml, logDetailLines, purgePrompt } from './admin-logs.js';
import { deniedPageHtml, failedPageHtml, headHtml, loadingPageHtml, tabsHtml } from './admin-parts.js';
import { BANNED, LOGS, NOW, PEOPLE, TRIPS, TZ, data, textOf, vm } from './admin.test-kit.js';

const count = (html, part) => html.split(part).length - 1;

function expectHouseRules(html) {
  expect(BANNED.test(textOf(html)), 'a banned glyph or three dots').toBe(false);
  expect(html).not.toMatch(/\sstyle=/);
  expect(html.replace(/"[^"]*"/g, '""')).not.toMatch(/<[^>]*\son[a-z]+=/i); // no handler attribute; quoted values are escaped text
  expect(html).not.toContain('<script');
  expect(html).not.toContain('<img src=x');
  expect(html).not.toContain('javascript:');
  expect(html).not.toMatch(/\b(1[3-9]|2[0-3]):[0-5]\d\b/); // no 24 hour clock
}

describe('page frame', () => {
  it('has one h1, the status line, the refresh time and Refresh', () => {
    const html = headHtml({ status: '4 people, 6 trips, 1 failed plan in the last 24 hours', loadedAt: '2027-03-10T16:05:00Z', timeZone: TZ });
    expect(count(html, '<h1')).toBe(1);
    expect(html).toContain('>Admin</h1>');
    expect(html).toContain('4 people, 6 trips, 1 failed plan in the last 24 hours');
    expect(html).toContain('Updated 4:05 PM');
    expect(html).toContain('data-adm-action="reload"');
    expectHouseRules(html);
  });

  it('says so when offline and turns Refresh off', () => {
    const html = headHtml({ status: 's', online: false });
    expect(html).toContain('You are offline');
    expect(html).toMatch(/data-adm-action="reload"[^>]* disabled/);
  });

  it('draws four tabs with one selected and reachable', () => {
    const html = tabsHtml('trips', { people: 4, trips: 6 });
    expect(count(html, 'role="tab"')).toBe(4);
    expect(html).toMatch(/id="adm-tab-trips" aria-selected="true" aria-controls="adm-panel" tabindex="0"/);
    expect(count(html, 'tabindex="-1"')).toBe(3);
    expect(tabsHtml('nope')).not.toContain('aria-selected="true"');
  });

  it('has a loading, a not an admin and a failed page in the house voice', () => {
    for (const html of [loadingPageHtml(), deniedPageHtml(), failedPageHtml(), failedPageHtml({ online: false })]) {
      expect(count(html, '<h1')).toBe(1);
      expect(html).toContain('data-view="admin"');
      expectHouseRules(html);
    }
    expect(loadingPageHtml()).toContain('aria-busy="true"');
    expect(deniedPageHtml()).toContain('href="#/"');
    expect(deniedPageHtml()).toContain('Back to your trips');
    expect(failedPageHtml()).toContain('Try again');
    expect(failedPageHtml({ online: false })).toContain('You are offline');
  });
});

describe('overview', () => {
  const html = overviewHtml(vm());

  it('shows the six figures, the chart, what needs attention and generation health', () => {
    expect(count(html, 'class="adm-figure"')).toBe(6);
    expect(html).toContain('Errors, last 24 hours');
    expect(html).toContain('Sign-ups and trips per week');
    expect(count(html, '<rect class="adm-bar"')).toBeGreaterThan(0);
    expect(html).toContain('<caption>Sign-ups and trips per week</caption>');
    expect(html).toContain('Needs attention');
    expect(html).toContain('50%');
    expect(html).toContain('2 of 4 plans succeeded in the last 30 days.');
    expectHouseRules(html);
  });

  it('links every attention line to its row or filter and offers a retry where it applies', () => {
    expect(html).toContain('data-adm-goto="trips" data-adm-id="t-kyoto"');
    expect(html).toContain('data-adm-goto="activity" data-adm-value="error"');
    expect(html).toContain('data-adm-goto="people" data-adm-id="p-cy"');
    expect(count(html, 'data-adm-action="retry-trip"')).toBe(1);
    expect(html).toContain('Gemini 503: model overloaded');
    expect(html).not.toContain('at callProvider');
  });

  it('escapes names that come from the database', () => {
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; never finished setting up');
  });

  it('is calm when nothing is wrong and shows what could not be read', () => {
    const calm = overviewHtml(vm({ data: data({ trips: [TRIPS[0]], people: [PEOPLE[0]], jobs: [], facts: [], errors: null, warnings: ['Logs could not be read, so error counts and last active times are missing.'] }) }));
    expect(calm).toContain('Nothing needs you right now');
    expect(calm).toContain('No failed plans');
    expect(calm).toContain('No plans yet');
    expect(calm).toContain('Logs could not be read');
    expect(calm).not.toContain('data-adm-action="retry-trip"');
    expectHouseRules(calm);
  });

  it('turns a retry off while it is starting', () => {
    const busy = overviewHtml(vm({ busyTrips: new Set(['t-kyoto']) }));
    expect(busy).toMatch(/data-adm-action="retry-trip"[^>]* disabled/);
  });
});

describe('people', () => {
  it('is a table with headers, sort buttons and one row a person', () => {
    const html = peopleHtml(vm());
    expect(html).toContain('<table class="adm-table adm-table--people" role="table" aria-label="People">');
    expect(count(html, '<th scope="col"')).toBe(6);
    expect(html).toContain('aria-sort="descending"');
    expect(count(html, 'class="adm-row"')).toBe(4);
    expect(html).toContain('4 people');
    expect(html).toContain('Not onboarded');
    expect(html).toContain('>You</span>');
    expectHouseRules(html);
  });

  it('never renders an unsafe avatar address or an unescaped name', () => {
    const html = peopleHtml(vm());
    expect(count(html, '<img class="adm-avatar"')).toBe(1);
    expect(html).toContain('src="https://example.org/ana.png"');
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('flagcdn.com/w40/NO'); // a flag code is lower case letters or nothing
  });

  it('filters, searches and says how many are left', () => {
    const state = vm().people;
    const html = peopleHtml(vm({ people: { ...state, q: 'bo', chip: 'nomad' } }));
    expect(count(html, 'class="adm-row"')).toBe(1);
    expect(html).toContain('1 of 4 people');
    expect(html).toMatch(/data-adm-value="nomad"[^>]*aria-pressed="true"/);
    const none = peopleHtml(vm({ people: { ...state, q: 'zzz' } }));
    expect(none).toContain('Nobody matches');
    expect(none).toContain('data-adm-action="clear-filters"');
    expect(peopleHtml(vm({ data: data({ people: [], peopleTotal: 0 }) }))).toContain('Nobody has signed up yet');
  });

  it('opens a row into the trips, the recent lines and the role of that person', () => {
    const state = vm().people;
    const loading = peopleHtml(vm({ people: { ...state, openId: 'p-bo', detail: { id: 'p-bo', status: 'loading', logs: [] } } }));
    expect(loading).toContain('aria-expanded="true" aria-controls="adm-person-p-bo"');
    expect(loading).toContain('Loading recent activity');
    expect(loading).toContain('data-adm-goto="trips" data-adm-id="t-kyoto"');
    expect(loading).toContain('>Make admin</button>');
    const ready = peopleHtml(vm({ people: { ...state, openId: 'p-bo', detail: { id: 'p-bo', status: 'ready', logs: [LOGS[0]] } } }));
    expect(ready).toContain('Provider failed &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(ready).toContain('10 Mar, 6:00 AM');
    expectHouseRules(ready);
    const failed = peopleHtml(vm({ people: { ...state, openId: 'p-bo', detail: { id: 'p-bo', status: 'error', logs: [] } } }));
    expect(failed).toContain('Recent activity could not be loaded.');
  });

  it('says when the list is cut', () => {
    expect(peopleHtml(vm({ data: data({ peopleTotal: 4210 }) }))).toContain('Showing the newest 4 of 4,210 people.');
  });
});

describe('role change', () => {
  const [ana, bo] = PEOPLE;

  it('asks with a clear sentence before making someone an admin', () => {
    expect(roleChange(bo, { meId: 'p-ana', adminCount: 1 })).toMatchObject({ next: 'admin', allowed: true, danger: false, title: 'Make Bo Chen an admin?', confirmLabel: 'Make admin' });
  });

  it('never lets the last admin remove their own role', () => {
    const change = roleChange(ana, { meId: 'p-ana', adminCount: 1 });
    expect(change.allowed).toBe(false);
    expect(change.reason).toContain('only admin');
    const html = peopleHtml(vm({ people: { ...vm().people, openId: 'p-ana', detail: { id: 'p-ana', status: 'ready', logs: [] } } }));
    expect(html).toMatch(/data-adm-action="role"[^>]* disabled[^>]*aria-describedby="adm-role-help-p-ana"/);
    expect(html).toContain('You are the only admin.');
  });

  it('lets an admin remove their own role when another admin stays, and says what it costs', () => {
    expect(roleChange(ana, { meId: 'p-ana', adminCount: 2 })).toMatchObject({ next: 'user', allowed: true, danger: true, title: 'Remove your own admin role?' });
    expect(roleChange(ana, { meId: 'p-bo', adminCount: 2 })).toMatchObject({ allowed: true, title: 'Remove the admin role from Ana Lima?' });
  });
});

describe('trips', () => {
  const html = tripsHtml(vm());

  it('is a table with the owner, the dates, a status pill and the actions', () => {
    expect(html).toContain('<table class="adm-table adm-table--trips" role="table" aria-label="Trips">');
    expect(count(html, 'class="adm-row"')).toBe(6);
    expect(html).toContain('1 May to 8 May 2027');
    expect(html).toContain('Untitled trip');
    expect(html).toContain('Not in the list');
    expect(html).toContain('href="#/trip/t-porto"');
    expect(html).toContain('aria-label="Delete Porto and the Douro"');
    expect(html).toContain('Seville &lt;b&gt;bold&lt;/b&gt;');
    expectHouseRules(html);
  });

  it('offers a retry for every trip but one that is being planned', () => {
    expect(count(html, 'data-adm-action="retry-trip"')).toBe(5);
    expect(html).not.toContain('data-adm-action="retry-trip" data-adm-id="t-stuck"');
    expect(html).toContain('aria-label="Try planning Kyoto in autumn again"');
  });

  it('has status chips with counts and filters by them', () => {
    expect(html).toMatch(/data-adm-value="failed"[^>]*>.*?Failed<\/span> <span class="ui-chip-count">1<\/span>/);
    const failed = tripsHtml(vm({ trips: { ...vm().trips, status: 'failed' } }));
    expect(count(failed, 'class="adm-row"')).toBe(1);
    expect(failed).toContain('1 of 6 trips');
    const none = tripsHtml(vm({ trips: { ...vm().trips, q: 'zzz' } }));
    expect(none).toContain('No trip matches');
    expect(tripsHtml(vm({ data: data({ trips: [], tripsTotal: 0 }) }))).toContain('No trips yet');
  });

  it('marks the row an overview line led to and turns a busy row off', () => {
    expect(tripsHtml(vm({ trips: { ...vm().trips, focusId: 't-kyoto' } }))).toContain('class="adm-row is-marked" role="row" data-adm-row="t-kyoto"');
    expect(tripsHtml(vm({ busyTrips: new Set(['t-kyoto']) }))).toMatch(/data-adm-action="delete-trip" data-adm-id="t-kyoto"[^>]* disabled/);
  });

  it('names the trip and the owner in the dialogs', () => {
    expect(deletePrompt(TRIPS[0], PEOPLE[0])).toMatchObject({ title: 'Delete Porto and the Douro?', confirmLabel: 'Delete trip', danger: true });
    expect(deletePrompt(TRIPS[0], PEOPLE[0]).body).toContain('the trip of Ana Lima');
    expect(deletePrompt(TRIPS[5], null).body).toContain('its owner');
    expect(retryPrompt(TRIPS[1], PEOPLE[1])).toBeNull(); // a failed plan has nothing to lose
    expect(retryPrompt(TRIPS[0], PEOPLE[0])).toMatchObject({ title: 'Plan Porto and the Douro again?', danger: true });
  });
});

describe('activity', () => {
  const html = activityHtml(vm());

  it('has chips with counts for level, category and source, a search and the switch', () => {
    expect(html).toMatch(/data-adm-chip="log-level" data-adm-value="error"[^>]*>.*?Errors<\/span> <span class="ui-chip-count">7<\/span>/);
    expect(count(html, 'data-adm-chip="log-category"')).toBe(8);
    expect(count(html, 'data-adm-chip="log-source"')).toBe(3);
    expect(html).toContain('data-adm-search="logs"');
    expect(html).toContain('type="checkbox" class="adm-switch-input" data-adm-auto');
    expect(html).toContain('The counts on the chips are for the last 7 days.');
  });

  it('lists the lines with a 12 hour time, a relative time and links to the person and the trip', () => {
    expect(count(html, 'class="adm-row"')).toBe(3);
    expect(html).toContain('10 Mar, 6:00 AM');
    expect(html).toContain('2 hours ago');
    expect(html).toContain('data-adm-goto="people" data-adm-id="p-bo"');
    expect(html).toContain('data-adm-goto="trips" data-adm-id="t-kyoto"');
    expect(html).toContain('Provider failed &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('12 lines, newest first');
    expect(html).toContain('Load more (9 left)');
    expectHouseRules(html);
  });

  it('opens a line into readable key and value lines with a copy button, not a JSON blob', () => {
    const open = activityHtml(vm({ activity: { ...vm().activity, openId: 'l1' } }));
    expect(open).toContain('<dt>Provider</dt>');
    expect(open).toContain('<dt>Request attempt</dt>');
    expect(open).toContain('<dt>Device</dt>');
    expect(open).toContain('<pre class="adm-pre" tabindex="0">Error: boom');
    expect(open).toContain('Copy as JSON');
    expect(open).not.toContain('{&quot;provider&quot;');
    expect(activityHtml(vm({ activity: { ...vm().activity, openId: 'l1', copiedId: 'l1' } }))).toContain('Copied');
    expect(logDetailLines(LOGS[0], { now: NOW, timeZone: TZ })[0]).toEqual({ key: 'When', value: '10 Mar 2027, 6:00 AM (2 hours ago)', block: false });
  });

  it('has a loading, an empty, a no match and an error state', () => {
    const state = vm().activity;
    expect(activityHtml(vm({ activity: { ...state, logs: [], status: 'loading' } }))).toContain('aria-busy="true"');
    expect(activityHtml(vm({ activity: { ...state, logs: [], count: 0 } }))).toContain('The log is empty');
    const none = activityHtml(vm({ activity: { ...state, logs: [], count: 0, level: 'error' } }));
    expect(none).toContain('No line matches');
    expect(none).toContain('data-adm-action="clear-filters"');
    const failed = activityHtml(vm({ activity: { ...state, logs: [], status: 'error' } }));
    expect(failed).toContain('The logs could not be loaded');
    expect(failed).toContain('data-adm-action="reload-logs"');
  });

  it('tells the truth about log retention and keeps the manual delete behind a dialog', () => {
    expect(html).toContain('Logs are deleted automatically after one year.');
    expect(html).toContain('Delete logs older than 90 days');
    expect(purgePrompt()).toMatchObject({ title: 'Delete logs older than 90 days?', danger: true, confirmLabel: 'Delete old logs' });
    expect(purgePrompt().body).toContain('already deleted automatically after one year');
  });

  it('says when the chip counts are from a cut sample', () => {
    expect(activityHtml(vm({ data: data({ factsTruncated: true }) }))).toContain('from the newest 10 lines of the last 7 days');
  });
});
