import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveTripPhotos, isResolvingPhotos, getPhotoProgress, isPhotoOnlyChange, fetchTripPhotos,
  wantsActivityPhoto, isPendingPhoto, NO_PHOTO_CATEGORIES, RETRY_DELAYS_MS,
} from './trip-photos.js';

const reply = (data, error = null) => Promise.resolve({ data, error });
// What supabase-js reports for a non-2xx answer: the Response rides on context.
const httpError = (status, message = 'Edge Function returned a non-2xx status code') => ({ message, context: { status } });
// Backoff waits resolve at once in tests; the calls record the delays asked for.
const noWait = () => vi.fn(() => Promise.resolve());

function captureEvents() {
  const events = [];
  const listener = (e) => events.push(e.detail);
  window.addEventListener('trippy:photos', listener);
  return { events, stop: () => window.removeEventListener('trippy:photos', listener) };
}

// Node has EventTarget + CustomEvent but no window; give the module one.
globalThis.window = globalThis.window || new EventTarget();

describe('resolveTripPhotos', () => {
  afterEach(() => vi.restoreAllMocks());

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

  it('stops at once on an answer a retry cannot change (4xx) and reports it', async () => {
    const invoke = vi.fn().mockReturnValue(reply(null, httpError(401, 'Unauthorized')));
    const sleep = noWait();
    expect(await resolveTripPhotos('t1', { invoke, sleep })).toEqual({ ok: false, photos: 0, cover: false, error: 'Unauthorized' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('turns a thrown invoke into a failed result instead of rejecting', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('offline'));
    const out = await resolveTripPhotos('t-throw', { invoke, sleep: noWait() });
    expect(out).toEqual({ ok: false, photos: 0, cover: false, error: 'offline' });
    expect(isResolvingPhotos('t-throw')).toBe(false);
  });

  it('retries a failed batch after a short wait and carries on', async () => {
    const invoke = vi.fn()
      .mockReturnValueOnce(reply({ activities: 6, attempted: 8, remaining: 9 }))
      .mockReturnValueOnce(reply(null, httpError(546)))
      .mockReturnValueOnce(reply({ activities: 7, attempted: 9, remaining: 0 }));
    const sleep = noWait();
    const out = await resolveTripPhotos('t-retry', { invoke, sleep });
    expect(out).toEqual({ ok: true, photos: 13, cover: false });
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[2000]]);
  });

  it('backs off 2s, 5s, 10s and gives up when the call after the last wait fails too', async () => {
    const invoke = vi.fn().mockReturnValue(reply(null, httpError(546)));
    const sleep = noWait();
    const out = await resolveTripPhotos('t-giveup', { invoke, sleep });
    expect(RETRY_DELAYS_MS).toEqual([2000, 5000, 10000]);
    expect(sleep.mock.calls).toEqual([[2000], [5000], [10000]]);
    expect(invoke).toHaveBeenCalledTimes(4);
    expect(out).toEqual({ ok: false, photos: 0, cover: false, error: 'Edge Function returned a non-2xx status code' });
    expect(isResolvingPhotos('t-giveup')).toBe(false);
  });

  it('retries network errors and empty replies the same way', async () => {
    const invoke = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockReturnValueOnce(reply(null))
      .mockReturnValueOnce(reply({ activities: 2, attempted: 2, remaining: 0 }));
    const sleep = noWait();
    const out = await resolveTripPhotos('t-net', { invoke, sleep });
    expect(out).toEqual({ ok: true, photos: 2, cover: false });
    expect(sleep.mock.calls).toEqual([[2000], [5000]]);
  });

  it('resets the failure count after a successful call', async () => {
    const invoke = vi.fn()
      .mockReturnValueOnce(reply(null, httpError(503)))
      .mockReturnValueOnce(reply({ activities: 3, attempted: 8, remaining: 8 }))
      .mockReturnValueOnce(reply(null, httpError(546)))
      .mockReturnValueOnce(reply(null, httpError(546)))
      .mockReturnValueOnce(reply(null, httpError(546)))
      .mockReturnValueOnce(reply({ activities: 4, attempted: 8, remaining: 0 }));
    const sleep = noWait();
    const out = await resolveTripPhotos('t-reset', { invoke, sleep });
    expect(out).toEqual({ ok: true, photos: 7, cover: false });
    expect(sleep.mock.calls).toEqual([[2000], [2000], [5000], [10000]]);
    expect(invoke).toHaveBeenCalledTimes(6);
  });

  it('counts retries toward maxCalls and does not wait after the last allowed call', async () => {
    const invoke = vi.fn()
      .mockReturnValueOnce(reply({ activities: 1, attempted: 8, remaining: 20 }))
      .mockReturnValue(reply(null, httpError(500)));
    const sleep = noWait();
    const out = await resolveTripPhotos('t-cap', { invoke, sleep, maxCalls: 3 });
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[2000]]);
    expect(out).toMatchObject({ ok: false, photos: 1 });
  });

  it('keeps the trip marked as resolving while it waits to retry', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const sleep = vi.fn(() => gate);
    const invoke = vi.fn()
      .mockReturnValueOnce(reply(null, httpError(546)))
      .mockReturnValueOnce(reply({ activities: 1, attempted: 1, remaining: 0 }));
    const run = resolveTripPhotos('t-wait', { invoke, sleep });
    await vi.waitFor(() => expect(sleep).toHaveBeenCalledTimes(1));
    expect(isResolvingPhotos('t-wait')).toBe(true);
    release();
    expect(await run).toEqual({ ok: true, photos: 1, cover: false });
    expect(isResolvingPhotos('t-wait')).toBe(false);
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

  it('reports done/total progress and marks the trip as resolving while it runs', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const invoke = vi.fn()
      .mockReturnValueOnce(reply({ activities: 7, attempted: 8, remaining: 8 }))
      .mockImplementationOnce(() => gate.then(() => ({ data: { activities: 6, attempted: 8, remaining: 0 }, error: null })));
    const { events, stop } = captureEvents();

    const run = resolveTripPhotos('t2', { invoke });
    expect(isResolvingPhotos('t2')).toBe(true);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(getPhotoProgress('t2')).toEqual({ done: 8, total: 16, added: 7 });

    release();
    const out = await run;
    stop();
    expect(out).toEqual({ ok: true, photos: 13, cover: false });
    expect(isResolvingPhotos('t2')).toBe(false);
    expect(getPhotoProgress('t2')).toBeNull();
    expect(events).toEqual([
      { tripId: 't2', done: 0, total: 0, finished: false, ok: true, added: 0 },
      { tripId: 't2', done: 8, total: 16, finished: false, ok: true, added: 7 },
      { tripId: 't2', done: 16, total: 16, finished: true, ok: true, added: 13 },
    ]);
  });

  it('shares one run between concurrent calls for the same trip', async () => {
    const invoke = vi.fn().mockReturnValue(reply({ activities: 2, attempted: 2, remaining: 0 }));
    const a = resolveTripPhotos('t3', { invoke });
    const b = resolveTripPhotos('t3', { invoke });
    expect(b).toBe(a);
    await a;
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('announces a failed finish with ok: false', async () => {
    const invoke = vi.fn().mockReturnValue(reply(null, httpError(429, 'Daily photo limit reached for this trip')));
    const { events, stop } = captureEvents();
    await resolveTripPhotos('t4', { invoke, sleep: noWait() });
    expect(invoke).toHaveBeenCalledTimes(1);
    stop();
    expect(events.at(-1)).toEqual({ tripId: 't4', done: 0, total: 0, finished: true, ok: false, added: 0 });
  });
});

describe('wantsActivityPhoto / isPendingPhoto', () => {
  const venue = { venue_name: 'Daruma Honten', category: 'food', photo_url: '', photo_source: null };

  it('gives getting-there categories no photo block, like the server', () => {
    expect([...NO_PHOTO_CATEGORIES].sort()).toEqual(['arrival', 'departure', 'flight', 'transport']);
    for (const category of ['transport', 'Transport', 'flight', 'arrival', 'departure']) {
      const taxi = { ...venue, title: 'Taxi to Changi T1', venue_name: 'Changi Airport T1', category };
      expect(wantsActivityPhoto(taxi), category).toBe(false);
      expect(isPendingPhoto(taxi), category).toBe(false);
    }
  });

  it('wants a photo for any other activity with a venue', () => {
    expect(wantsActivityPhoto(venue)).toBe(true);
    expect(wantsActivityPhoto({ ...venue, category: 'check-in' })).toBe(true);
    expect(wantsActivityPhoto({ ...venue, category: undefined })).toBe(true);
    expect(wantsActivityPhoto({ ...venue, venue_name: '' })).toBe(false);
    expect(wantsActivityPhoto(null)).toBe(false);
  });

  it('is pending only until the worker stores a photo or a verdict', () => {
    expect(isPendingPhoto(venue)).toBe(true);
    expect(isPendingPhoto({ ...venue, photo_url: 'https://x/p.jpg', photo_source: 'wikimedia' })).toBe(false);
    expect(isPendingPhoto({ ...venue, photo_source: 'none' })).toBe(false);
  });
});

describe('isPhotoOnlyChange', () => {
  const activity = {
    id: 'a1', title: 'Senso-ji', venue_name: 'Senso-ji Temple', cost_amount: 0, start_time: '09:00',
    transport_options: [{ mode: 'walk', label: 'Walk 5 min' }], photo_url: '', photo_source: null,
    latitude: null, longitude: null,
  };

  it('accepts photo and coordinate updates from the photo worker', () => {
    expect(isPhotoOnlyChange(activity, { ...activity, photo_url: 'https://x/p.jpg', photo_source: 'wikimedia' })).toBe(true);
    expect(isPhotoOnlyChange(activity, { id: 'a1', latitude: 35.71, longitude: 139.79 })).toBe(true);
    expect(isPhotoOnlyChange(activity, { id: 'a1', photo_source: 'none' })).toBe(true);
  });

  it('flags real content edits', () => {
    expect(isPhotoOnlyChange(activity, { ...activity, title: 'Asakusa walk' })).toBe(false);
    expect(isPhotoOnlyChange(activity, { ...activity, cost_amount: 500 })).toBe(false);
    expect(isPhotoOnlyChange(activity, { ...activity, transport_options: [] })).toBe(false);
  });

  it('ignores jsonb key order', () => {
    const local = { ...activity, transport_options: [{ mode: 'walk', label: 'Walk 5 min', duration: '5 min' }] };
    expect(isPhotoOnlyChange(local, { id: 'a1', transport_options: [{ duration: '5 min', label: 'Walk 5 min', mode: 'walk' }], photo_url: 'u' })).toBe(true);
  });

  it('ignores representation-only differences', () => {
    expect(isPhotoOnlyChange({ ...activity, cost_amount: 1200 }, { id: 'a1', cost_amount: '1200' })).toBe(true);
    expect(isPhotoOnlyChange({ ...activity, tips: null }, { id: 'a1', tips: '' })).toBe(true);
  });

  it('returns false without a model or a row', () => {
    expect(isPhotoOnlyChange(null, { id: 'a1' })).toBe(false);
    expect(isPhotoOnlyChange(activity, null)).toBe(false);
  });
});

describe('fetchTripPhotos', () => {
  function fakeClient(result) {
    const chain = {
      from: vi.fn(() => chain), select: vi.fn(() => chain), eq: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve(result)),
    };
    return chain;
  }

  it('flattens activities and returns the credits', async () => {
    const client = fakeClient({
      data: {
        photoCredits: { a1: { creator: 'Jane', license: 'CC BY 4.0' } },
        itinerary_days: [{ activities: [{ id: 'a1', photo_url: 'u1' }] }, { activities: [{ id: 'a2', photo_url: '' }] }],
      },
      error: null,
    });
    const out = await fetchTripPhotos('t1', { client });
    expect(client.eq).toHaveBeenCalledWith('id', 't1');
    expect(out).toEqual({
      data: {
        credits: { a1: { creator: 'Jane', license: 'CC BY 4.0' } }, activities: [{ id: 'a1', photo_url: 'u1' }, { id: 'a2', photo_url: '' }],
        coverImage: null, cover: null,
      },
      error: null,
    });
  });

  it('returns the cover so a finished run can update the header', async () => {
    const cover = { v: 2, large: { url: 'https://s/cover-v2-2400w.jpg', w: 2400, h: 1600 } };
    const client = fakeClient({ data: { photoCredits: null, cover_image: cover.large.url, cover, itinerary_days: [] }, error: null });
    const out = await fetchTripPhotos('t1', { client });
    expect(client.select.mock.calls[0][0]).toContain('cover:extras->cover');
    expect(out.data).toMatchObject({ coverImage: cover.large.url, cover });
  });

  it('reports a failed read', async () => {
    const out = await fetchTripPhotos('t1', { client: fakeClient({ data: null, error: { message: 'boom' } }) });
    expect(out).toEqual({ data: null, error: 'boom' });
  });
});
