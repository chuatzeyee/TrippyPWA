import { describe, expect, it } from 'vitest';
import { chartScale, countBetween, errorBursts, errorCountsFromFacts, errorLine, generationHealth, lastActiveByUser, needsAttention, overviewFigures, statusLine, weekStart, weeklySeries } from './admin-stats.js';
import { BANNED, FACTS, JOBS, NOW, PEOPLE, TRIPS, TZ } from './admin.test-kit.js';

const peopleById = new Map(PEOPLE.map((person) => [person.id, person]));

describe('weekly series', () => {
  it('starts a week on Monday, in UTC', () => {
    expect(new Date(weekStart('2027-03-10T08:00:00Z')).toISOString()).toBe('2027-03-08T00:00:00.000Z'); // a Wednesday
    expect(new Date(weekStart('2027-03-14T23:59:00Z')).toISOString()).toBe('2027-03-08T00:00:00.000Z'); // the Sunday
    expect(new Date(weekStart('2027-03-15T00:00:00Z')).toISOString()).toBe('2027-03-15T00:00:00.000Z');
    expect(weekStart('nope')).toBeNull();
  });

  it('gives 12 weeks, oldest first, ending with this week', () => {
    const series = weeklySeries(PEOPLE, TRIPS, NOW);
    expect(series).toHaveLength(12);
    expect(series.at(-1)).toMatchObject({ start: '2027-03-08T00:00:00.000Z', label: '8 Mar', people: 1, trips: 2 });
    expect(series[0].start).toBe('2026-12-21T00:00:00.000Z');
    // Ana joined 200 days ago and Seville was made 150 days ago: both are before the chart.
    expect(series.reduce((sum, week) => sum + week.people, 0)).toBe(3);
    expect(series.reduce((sum, week) => sum + week.trips, 0)).toBe(5);
  });

  it('picks a round top for the scale', () => {
    expect(chartScale([{ people: 0, trips: 0 }])).toMatchObject({ max: 0, top: 2, ticks: [2, 1, 0] });
    expect(chartScale([{ people: 3, trips: 9 }]).top).toBe(12);
    expect(chartScale([{ people: 130, trips: 9 }]).top).toBe(200);
  });

  it('counts rows inside a window', () => {
    const ref = Date.parse(NOW);
    expect(countBetween(TRIPS, ref - 7 * 86400000, ref + 1)).toBe(2);
    expect(countBetween([{ created_at: 'nope' }, {}], 0, ref)).toBe(0);
  });
});

describe('figures', () => {
  it('gives the six figures with their change this week', () => {
    const figures = overviewFigures({ people: PEOPLE, trips: TRIPS, peopleTotal: 4, tripsTotal: 6, errors: { day: 6, dayBefore: 1, week: 7, weekBefore: 2 }, now: NOW });
    expect(figures.map((figure) => [figure.key, figure.value, figure.change, figure.alert])).toEqual([
      ['people', '4', '1 joined this week', false],
      ['trips', '6', '2 created this week', false],
      ['planned', '3', 'None this week', false],
      ['failed', '1', '1 this week', true],
      ['errors-day', '6', '1 the day before', true],
      ['errors-week', '7', '2 the week before', true],
    ]);
  });

  it('uses the totals of the whole table, not of the loaded rows', () => {
    const figures = overviewFigures({ people: PEOPLE, trips: TRIPS, peopleTotal: 4210, tripsTotal: 9000, now: NOW });
    expect(figures[0].value).toBe('4,210');
    expect(figures[1].value).toBe('9,000');
    expect(figures[4]).toMatchObject({ value: '0', change: 'No earlier figure', alert: false });
  });

  it('works the error counts out of the sampled rows when the exact counts are missing', () => {
    expect(errorCountsFromFacts(FACTS, NOW)).toEqual({ day: 6, dayBefore: 1, week: 7, weekBefore: null });
  });

  it('writes the status line', () => {
    expect(statusLine({ peopleTotal: 19, tripsTotal: 42, jobs: JOBS, trips: TRIPS, now: NOW })).toBe('19 people, 42 trips, 1 failed plan in the last 24 hours');
    expect(statusLine({ peopleTotal: 1, tripsTotal: 1, jobs: [], trips: [], now: NOW })).toBe('1 person, 1 trip, no failed plans in the last 24 hours');
  });
});

describe('generation health', () => {
  const health = generationHealth(JOBS, TRIPS, peopleById, NOW);

  it('counts the last 30 days only', () => {
    expect(health).toMatchObject({ succeeded: 2, failed: 2, running: 1, rate: 50 });
  });

  it('lists a trip as failed only while its newest job is failed, with the first line of the error', () => {
    expect(health.failures).toEqual([
      { key: 'job-j2', tripId: 't-kyoto', title: 'Kyoto in autumn', owner: 'Bo Chen', error: 'Gemini 503: model overloaded', at: expect.any(String), canRetry: true },
    ]);
  });

  it('falls back to the failed trips when there are no jobs', () => {
    const fromTrips = generationHealth([], TRIPS, peopleById, NOW);
    expect(fromTrips.rate).toBeNull();
    expect(fromTrips.failures.map((failure) => failure.tripId)).toEqual(['t-kyoto']);
    expect(fromTrips.failures[0]).toMatchObject({ canRetry: true, error: 'No error was recorded.' });
  });

  it('does not offer a retry for a trip that is gone or no longer failed', () => {
    const jobs = [{ id: 'x', trip_id: 't-none', user_id: 'p-left', status: 'failed', error: '', created_at: NOW, updated_at: NOW }];
    const [failure] = generationHealth(jobs, [], peopleById, NOW).failures;
    expect(failure).toMatchObject({ tripId: null, title: 'A trip that is gone', owner: 'Someone who has left', canRetry: false });
  });

  it('cuts an error to one readable line', () => {
    expect(errorLine('\n  first\nsecond')).toBe('first');
    expect(errorLine('x'.repeat(400)).length).toBeLessThanOrEqual(166);
    expect(BANNED.test(errorLine('x'.repeat(400)))).toBe(false);
    expect(errorLine(null)).toBe('');
  });
});

describe('needs attention', () => {
  const items = needsAttention({ people: PEOPLE, trips: TRIPS, facts: FACTS, now: NOW, timeZone: TZ });

  it('lists failed plans, stuck plans, error bursts and unfinished setups, each with where it leads', () => {
    expect(items.map((item) => [item.kind, item.section, item.id ?? item.chip])).toEqual([
      ['failed', 'trips', 't-kyoto'],
      ['stuck', 'trips', 't-stuck'],
      ['burst', 'activity', 'error'],
      ['onboarding', 'people', 'p-cy'],
    ]);
    expect(items[0]).toMatchObject({ title: 'Planning failed for Kyoto in autumn', detail: 'Owned by Bo Chen' });
    expect(items[1].title).toBe('Lofoten by ferry has been planning for 5 hours');
    expect(items[2]).toMatchObject({ title: '6 errors in one hour', detail: '5:00 AM to 6:00 AM, 10 Mar 2027' });
    // Di joined yesterday: still inside the three days of grace.
    expect(items[3].title).toContain('never finished setting up');
  });

  it('groups several unfinished setups into one line that leads to the filter', () => {
    const late = PEOPLE.map((person) => ({ ...person, onboarding_complete: false, created_at: '2027-01-01T00:00:00Z' }));
    const item = needsAttention({ people: late, trips: [], facts: [], now: NOW }).at(-1);
    expect(item).toMatchObject({ kind: 'onboarding', title: '4 people never finished setting up', section: 'people', chip: 'pending' });
  });

  it('is empty when all is well', () => {
    expect(needsAttention({ people: [PEOPLE[0]], trips: [TRIPS[0]], facts: [], now: NOW })).toEqual([]);
  });

  it('finds the hours with five errors or more in the last day', () => {
    expect(errorBursts(FACTS, NOW, { timeZone: TZ })).toEqual([{ hour: '2027-03-10T05:00:00.000Z', count: 6, label: '5:00 AM to 6:00 AM' }]);
    expect(errorBursts(FACTS.slice(0, 4), NOW)).toEqual([]);
  });
});

describe('last active', () => {
  it('is the newest of the profile change and the sampled log lines', () => {
    const seen = lastActiveByUser(PEOPLE, FACTS);
    expect(seen.get('p-bo')).toBe(new Date(Date.parse(NOW) - 2 * 3600000 - 1000).toISOString());
    expect(seen.get('p-ana')).toBe(new Date(Date.parse(NOW) - 30 * 3600000).toISOString());
    expect(seen.get('p-di')).toBe(PEOPLE[3].updated_at);
    expect(seen.has(null)).toBe(false);
  });
});
