import { describe, expect, it } from 'vitest';
import { PEOPLE_SORTS, TRIP_SORTS, filterPeople, filterTrips, likeTerm, logChipCounts, peopleChipFilter, peopleChips, sortRows, statusLabel, toggleSort, tripCountsByUser, tripStatusChips } from './admin-filters.js';
import { lastActiveByUser } from './admin-stats.js';
import { FACTS, PEOPLE, TRIPS } from './admin.test-kit.js';

const ids = (rows) => rows.map((row) => row.id);
const peopleById = new Map(PEOPLE.map((person) => [person.id, person]));

describe('people', () => {
  it('searches the name and the home, whatever the case', () => {
    expect(ids(filterPeople(PEOPLE, { q: ' LIMA ' }))).toEqual(['p-ana']);
    expect(ids(filterPeople(PEOPLE, { q: 'norway' }))).toEqual(['p-di']);
    expect(ids(filterPeople(PEOPLE, { q: 'no name' }))).toEqual(['p-di']);
    expect(filterPeople(PEOPLE, { q: 'zzz' })).toEqual([]);
  });

  it('filters by role, onboarding and nomad, alone or together', () => {
    expect(ids(filterPeople(PEOPLE, { role: 'admin' }))).toEqual(['p-ana']);
    expect(ids(filterPeople(PEOPLE, { onboarded: 'no' }))).toEqual(['p-cy', 'p-di']);
    expect(ids(filterPeople(PEOPLE, { onboarded: 'yes', nomad: 'yes' }))).toEqual(['p-bo']);
    expect(ids(filterPeople(PEOPLE, { role: 'user', onboarded: 'no', q: 'oslo' }))).toEqual(['p-di']);
  });

  it('counts each chip and maps a chip to its filter', () => {
    expect(peopleChips(PEOPLE).map((chip) => [chip.key, chip.count])).toEqual([['all', 4], ['admin', 1], ['pending', 2], ['nomad', 1]]);
    for (const chip of peopleChips(PEOPLE)) {
      expect(filterPeople(PEOPLE, peopleChipFilter(chip.key))).toHaveLength(chip.count);
    }
  });

  it('sorts by every column, both ways, with empty values last', () => {
    const ctx = { tripCounts: tripCountsByUser(TRIPS), lastActive: lastActiveByUser(PEOPLE, FACTS) };
    const by = (key, dir) => ids(sortRows(PEOPLE, { key, dir }, PEOPLE_SORTS, ctx));
    expect(by('name', 'asc')).toEqual(['p-cy', 'p-ana', 'p-bo', 'p-di']);
    expect(by('home', 'asc')).toEqual(['p-ana', 'p-di', 'p-bo', 'p-cy']);
    expect(by('home', 'desc')).toEqual(['p-bo', 'p-di', 'p-ana', 'p-cy']); // no home stays last
    expect(by('trips', 'desc')).toEqual(['p-ana', 'p-bo', 'p-cy', 'p-di']);
    expect(by('joined', 'desc')).toEqual(['p-di', 'p-cy', 'p-bo', 'p-ana']);
    expect(by('active', 'desc')).toEqual(['p-bo', 'p-di', 'p-ana', 'p-cy']);
  });

  it('never changes the list it was given', () => {
    const before = ids(PEOPLE);
    sortRows(PEOPLE, { key: 'name', dir: 'desc' }, PEOPLE_SORTS, {});
    expect(ids(PEOPLE)).toEqual(before);
    expect(ids(sortRows(PEOPLE, { key: 'nope', dir: 'asc' }, PEOPLE_SORTS, {}))).toEqual(before);
  });
});

describe('trips', () => {
  it('searches the title and the name of the owner', () => {
    expect(ids(filterTrips(TRIPS, { q: 'kyoto' }, peopleById))).toEqual(['t-kyoto']);
    expect(ids(filterTrips(TRIPS, { q: 'ana' }, peopleById))).toEqual(['t-porto', 't-done']);
    expect(ids(filterTrips(TRIPS, { q: 'bo', status: 'failed' }, peopleById))).toEqual(['t-kyoto']);
  });

  it('gives a chip for every status that has a trip, failed first, with counts', () => {
    expect(tripStatusChips(TRIPS).map((chip) => [chip.key, chip.label, chip.count])).toEqual([
      ['all', 'All', 6], ['failed', 'Failed', 1], ['generating', 'Planning now', 1], ['planning', 'Not planned yet', 1],
      ['generated', 'Planned', 1], ['active', 'Active', 1], ['completed', 'Completed', 1],
    ]);
    expect(tripStatusChips([{ status: 'weird' }]).at(-1)).toEqual({ key: 'unknown', label: 'Unknown', count: 1 });
    expect(statusLabel('constructor')).toBe('Unknown');
  });

  it('sorts by title, owner, dates, days, status and created', () => {
    const by = (key, dir) => ids(sortRows(TRIPS, { key, dir }, TRIP_SORTS, { peopleById }));
    expect(by('title', 'asc')).toEqual(['t-kyoto', 't-stuck', 't-gone', 't-porto', 't-done', 't-draft']);
    expect(by('owner', 'asc').slice(0, 2)).toEqual(['t-draft', 't-porto']);
    expect(by('owner', 'asc').at(-1)).toBe('t-gone'); // an owner who is not in the list goes last
    expect(by('dates', 'asc')).toEqual(['t-done', 't-gone', 't-porto', 't-stuck', 't-kyoto', 't-draft']);
    expect(by('days', 'desc')[0]).toBe('t-porto');
    expect(by('status', 'asc').slice(0, 2)).toEqual(['t-kyoto', 't-stuck']);
    expect(by('created', 'desc')[0]).toBe('t-kyoto');
  });
});

describe('sort clicks, log chips, search terms', () => {
  it('flips the same column and starts a new one in its first direction', () => {
    expect(toggleSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' });
    expect(toggleSort({ key: 'name', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
    expect(toggleSort({ key: 'name', dir: 'asc' }, 'joined', 'desc')).toEqual({ key: 'joined', dir: 'desc' });
  });

  it('counts the sampled log rows by level, category and source', () => {
    expect(logChipCounts(FACTS)).toEqual({
      total: 10,
      level: { error: 7, warn: 1, info: 2 },
      category: { generation: 6, data: 1, auth: 1, share: 1, system: 1 },
      source: { edge: 7, client: 3 },
    });
    expect(logChipCounts(null).total).toBe(0);
  });

  it('takes wildcards and separators out of a search term', () => {
    expect(likeTerm('  50%_off, (now)*  ')).toBe('50 off now');
    expect(likeTerm('a'.repeat(200))).toHaveLength(80);
    expect(likeTerm(null)).toBe('');
  });
});
