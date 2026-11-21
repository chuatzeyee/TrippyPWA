import { describe, it, expect } from 'vitest';
import { startMinutes, normStartTime, sortDayActivities } from './day-order.js';

// Pinned to the functions as they stood in js/data/trip-repository.js before
// they moved to js/lib (the cases under the old path stay in
// js/data/trip-repository.test.js). The activities are invented.

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('startMinutes', () => {
  it('reads H:MM and HH:MM as minutes after midnight', () => {
    expect(startMinutes('00:00')).toBe(0);
    expect(startMinutes('9:05')).toBe(545);
    expect(startMinutes('09:05')).toBe(545);
    expect(startMinutes(' 14:30 ')).toBe(870);
    expect(startMinutes('23:59')).toBe(1439);
  });

  it('reads a meridiem, with or without dots and spaces', () => {
    expect(startMinutes('7:15 PM')).toBe(1155);
    expect(startMinutes('7:15pm')).toBe(1155);
    expect(startMinutes('7:15 p.m.')).toBe(1155);
    expect(startMinutes('12:00 am')).toBe(0);
    expect(startMinutes('12:30 PM')).toBe(750);
  });

  it('uses the start of a range and ignores seconds', () => {
    expect(startMinutes('09:00-10:00')).toBe(540);
    expect(startMinutes('09:00:30')).toBe(540);
  });

  it('is null for anything that does not start with a time', () => {
    for (const value of ['', undefined, null, 'Sunset', '25:00', '10:75', '13:00 pm', '0:30 am', 900]) {
      expect(startMinutes(value), String(value)).toBeNull();
    }
  });
});

describe('normStartTime', () => {
  it('zero-pads times and converts am/pm', () => {
    expect(normStartTime('9:05')).toBe('09:05');
    expect(normStartTime(' 14:30 ')).toBe('14:30');
    expect(normStartTime('7:15 PM')).toBe('19:15');
    expect(normStartTime('12:00 am')).toBe('00:00');
  });

  it('keeps anything that is not just a time', () => {
    expect(normStartTime('')).toBe('');
    expect(normStartTime(undefined)).toBe('');
    expect(normStartTime(null)).toBe('');
    expect(normStartTime('Sunset')).toBe('Sunset');
    expect(normStartTime('09:00-10:00')).toBe('09:00-10:00');
    expect(normStartTime('25:00')).toBe('25:00');
  });
});

describe('sortDayActivities', () => {
  const sortTitles = (acts) => sortDayActivities(acts).map(a => a.title);

  it('orders timed activities by time and keeps untimed ones after the timed one listed before them', () => {
    const acts = [
      { title: 'Breakfast', start_time: '08:00', sort_order: 0 },
      { title: 'Museum', start_time: '', sort_order: 1 },
      { title: 'Lunch', start_time: '12:30', sort_order: 2 },
      { title: 'Walk', start_time: '', sort_order: 3 },
      { title: 'Coffee', start_time: '10:00', sort_order: 4 },
    ];
    expect(sortTitles(acts)).toEqual(['Breakfast', 'Museum', 'Coffee', 'Lunch', 'Walk']);
  });

  it('keeps the listed order for imported activities with a time slot but no time', () => {
    const acts = [
      { title: 'Morning walk', start_time: '', time_slot: 'morning', sort_order: 0 },
      { title: 'Lunch', start_time: '12:30', time_slot: 'afternoon', sort_order: 1 },
      { title: 'Museum', start_time: '', time_slot: 'afternoon', sort_order: 2 },
      { title: 'Dinner', start_time: '19:30', time_slot: 'evening', sort_order: 3 },
    ];
    expect(sortTitles(acts)).toEqual(['Morning walk', 'Lunch', 'Museum', 'Dinner']);
    expect(sortTitles([...acts].reverse())).toEqual(['Morning walk', 'Lunch', 'Museum', 'Dinner']);
  });

  it('starts an untimed activity with nothing timed before it at its time slot', () => {
    const acts = [
      { title: 'Show', start_time: '', time_slot: 'evening', sort_order: 0 },
      { title: 'Gallery', start_time: '', time_slot: 'afternoon', sort_order: 1 },
      { title: 'Breakfast', start_time: '09:00', time_slot: 'morning', sort_order: 2 },
    ];
    expect(sortTitles(acts)).toEqual(['Breakfast', 'Gallery', 'Show']);
  });

  it('treats H:MM like HH:MM and breaks equal times by sort_order', () => {
    expect(sortTitles([
      { title: 'Ten', start_time: '10:00', sort_order: 0 },
      { title: 'Nine', start_time: '9:00', sort_order: 1 },
    ])).toEqual(['Nine', 'Ten']);
    expect(sortTitles([
      { title: 'B', start_time: '09:00', sort_order: 5 },
      { title: 'A', start_time: '9:00', sort_order: 1 },
    ])).toEqual(['A', 'B']);
  });

  it('gives the same order whatever the input order', () => {
    const acts = [
      { title: 'a', start_time: '08:00', sort_order: 0 },
      { title: 'b', start_time: '', sort_order: 1 },
      { title: 'c', start_time: '12:30', sort_order: 2 },
      { title: 'd', start_time: '', sort_order: 3 },
      { title: 'e', start_time: '10:00', sort_order: 4 },
      { title: 'f', start_time: '7:45 pm', sort_order: 999 },
    ];
    for (let turn = 0; turn < acts.length; turn++) {
      const rotated = [...acts.slice(turn), ...acts.slice(0, turn)];
      expect(sortTitles(rotated)).toEqual(['a', 'b', 'e', 'c', 'd', 'f']);
      expect(sortTitles([...rotated].reverse())).toEqual(['a', 'b', 'e', 'c', 'd', 'f']);
    }
  });

  it('returns a new array of the same activity objects and never changes its input', () => {
    const acts = deepFreeze([
      { title: 'B', start_time: '10:00', sort_order: 0 },
      { title: 'A', start_time: '09:00', sort_order: 1 },
    ]);
    const sorted = sortDayActivities(acts);
    expect(sorted).not.toBe(acts);
    expect(sorted[0]).toBe(acts[1]);
    expect(acts.map(a => a.title)).toEqual(['B', 'A']);
  });

  it('copes with a missing list', () => {
    expect(sortDayActivities(undefined)).toEqual([]);
    expect(sortDayActivities(null)).toEqual([]);
    expect(sortDayActivities('nope')).toEqual([]);
  });
});
