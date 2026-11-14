import { describe, it, expect } from 'vitest';
import { updateRowVersioned, ROW_WRITE_TRIES } from './trip-row.mjs';
import { coverNeedsPick, mergeCoverExtras } from './cover-rank.mjs';

const TRIP = '4c11d050-abb4-43a5-8024-468bc14dd380';

// A one-row PostgREST stand-in: updated_at is bumped on every write (like the
// trips trigger), and `interleave` runs another writer between our read and
// our write, once per call it is given.
function fakeDb(row, { interleave = [] } = {}) {
  let version = 0;
  const state = { row: { ...row, updated_at: `2026-11-14T09:00:00.00000${version}+00:00` }, writes: 0, reads: 0 };
  const bump = (patch) => {
    version += 1;
    state.row = { ...state.row, ...patch, updated_at: `2026-11-14T09:00:00.00000${version}+00:00` };
    state.writes += 1;
  };
  const queue = [...interleave];
  const db = {
    from(table) {
      expect(table).toBe('trips');
      return {
        select(cols) {
          expect(cols).toMatch(/, updated_at$/);
          return { eq: (col, id) => ({ single: async () => {
            state.reads += 1;
            return id === state.row.id ? { data: structuredClone(state.row), error: null } : { data: null, error: { message: 'not found' } };
          } }) };
        },
        update(patch) {
          const filters = [];
          const chain = {
            eq(col, v) { filters.push([col, v]); return chain; },
            is(col, v) { filters.push([col, v]); return chain; },
            async select() {
              const other = queue.shift();
              if (other) bump(other(state.row));
              const match = filters.every(([col, v]) => (state.row[col] ?? null) === v);
              if (!match) return { data: [], error: null };
              bump(patch);
              return { data: [{ id: state.row.id }], error: null };
            },
          };
          return chain;
        },
      };
    },
  };
  return { db, state };
}

describe('updateRowVersioned', () => {
  it('writes the change computed from a fresh read', async () => {
    const { db, state } = fakeDb({ id: TRIP, extras: { towns: [1] } });
    const out = await updateRowVersioned(db, {
      table: 'trips', id: TRIP, columns: 'extras', change: (f) => ({ extras: { ...f.extras, photoCredits: { a: 1 } } }),
    });
    expect(out).toMatchObject({ written: true, raced: 0 });
    expect(state.row.extras).toEqual({ towns: [1], photoCredits: { a: 1 } });
  });

  it('keeps a cover saved by another run between our read and our write', async () => {
    const cover = { v: 2, large: { url: `https://s/trip-photos/${TRIP}/cover-v2-2400w-a1b2c3d4.jpg`, w: 2400, h: 1600 } };
    // The other run saves its cover after our read of extras.
    const otherRun = (row) => ({ cover_image: cover.large.url, extras: mergeCoverExtras(row.extras, cover) });
    const { db, state } = fakeDb({ id: TRIP, cover_image: '', extras: { photoCredits: { a: 1 } } }, { interleave: [otherRun] });
    const out = await updateRowVersioned(db, {
      table: 'trips', id: TRIP, columns: 'extras',
      change: (f) => ({ extras: { ...f.extras, photoCredits: { ...f.extras.photoCredits, b: 2 } } }),
    });
    expect(out).toMatchObject({ written: true, raced: 1 });
    expect(state.row.extras).toEqual({ photoCredits: { a: 1, b: 2 }, cover });
    expect(state.row.cover_image).toBe(cover.large.url);
  });

  it('declines when the fresh read says the cover was picked meanwhile', async () => {
    const cover = { v: 2, large: { url: `https://s/trip-photos/${TRIP}/cover-v2-2400w-a1b2c3d4.jpg`, w: 2400, h: 1600 } };
    const otherRun = (row) => ({ cover_image: cover.large.url, extras: mergeCoverExtras(row.extras, cover) });
    const { db, state } = fakeDb({ id: TRIP, cover_image: '', extras: {} }, { interleave: [otherRun] });
    const mine = { v: 2, large: { url: `https://s/trip-photos/${TRIP}/cover-v2-2400w-ffff0000.jpg`, w: 2400, h: 1600 } };
    const out = await updateRowVersioned(db, {
      table: 'trips', id: TRIP, columns: 'cover_image, extras',
      change: (f) => (coverNeedsPick(f, TRIP) ? { cover_image: mine.large.url, extras: mergeCoverExtras(f.extras, mine) } : null),
    });
    expect(out.written).toBe(false);
    expect(state.row.extras.cover).toEqual(cover); // the first saved pick stays, record and image together
    expect(state.row.cover_image).toBe(cover.large.url);
  });

  it('gives up after a few lost races, and reports a missing row', async () => {
    const noisy = Array.from({ length: ROW_WRITE_TRIES }, () => () => ({ extras: { noise: Math.random() } }));
    const logs = [];
    const { db } = fakeDb({ id: TRIP, extras: {} }, { interleave: noisy });
    const out = await updateRowVersioned(db, {
      table: 'trips', id: TRIP, columns: 'extras', change: () => ({ extras: { mine: true } }), log: (m) => logs.push(m),
    });
    expect(out).toEqual({ written: false, row: null, raced: ROW_WRITE_TRIES });
    expect(logs[0]).toMatch(/kept losing/);
    const missing = await updateRowVersioned(fakeDb({ id: 'other', extras: {} }).db, {
      table: 'trips', id: TRIP, columns: 'extras', change: () => ({ extras: {} }),
    });
    expect(missing).toMatchObject({ written: false, row: null });
  });
});
