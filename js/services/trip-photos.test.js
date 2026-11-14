import { describe, it, expect, vi } from 'vitest';
import { resolveTripPhotos } from './trip-photos.js';

const reply = (data, error = null) => Promise.resolve({ data, error });

describe('resolveTripPhotos', () => {
  it('re-invokes until nothing remains and totals the work', async () => {
    const invoke = vi.fn()
      .mockReturnValueOnce(reply({ activities: 6, attempted: 8, remaining: 9 }))
      .mockReturnValueOnce(reply({ activities: 5, attempted: 8, remaining: 1 }))
      .mockReturnValueOnce(reply({ activities: 1, attempted: 1, remaining: 0, cover: true }));
    const progress = [];
    const out = await resolveTripPhotos('t1', { invoke, onProgress: p => progress.push(p.remaining) });
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke).toHaveBeenCalledWith('resolve-trip-photos', { body: { tripId: 't1', inline: true } });
    expect(out).toEqual({ ok: true, photos: 12, cover: true });
    expect(progress).toEqual([9, 1, 0]);
  });

  it('stops on an error and reports it', async () => {
    const invoke = vi.fn().mockReturnValueOnce(reply(null, { message: 'Unauthorized' }));
    expect(await resolveTripPhotos('t1', { invoke })).toEqual({ ok: false, photos: 0, cover: false, error: 'Unauthorized' });
  });

  it('stops when a call makes no progress (no infinite loop)', async () => {
    const invoke = vi.fn().mockReturnValue(reply({ activities: 0, attempted: 0, remaining: 5 }));
    const out = await resolveTripPhotos('t1', { invoke });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(true);
  });

  it('caps the number of calls', async () => {
    const invoke = vi.fn().mockReturnValue(reply({ activities: 1, attempted: 8, remaining: 99 }));
    await resolveTripPhotos('t1', { invoke, maxCalls: 3 });
    expect(invoke).toHaveBeenCalledTimes(3);
  });
});
