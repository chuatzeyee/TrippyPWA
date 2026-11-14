import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveTripPhotos, isResolvingPhotos, getPhotoProgress, isPhotoOnlyChange, fetchTripPhotos } from './trip-photos.js';

const reply = (data, error = null) => Promise.resolve({ data, error });

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

  it('stops on an error and reports it', async () => {
    const invoke = vi.fn().mockReturnValueOnce(reply(null, { message: 'Unauthorized' }));
    expect(await resolveTripPhotos('t1', { invoke })).toEqual({ ok: false, photos: 0, cover: false, error: 'Unauthorized' });
  });

  it('turns a thrown invoke into a failed result instead of rejecting', async () => {
    const invoke = vi.fn().mockRejectedValueOnce(new Error('offline'));
    const out = await resolveTripPhotos('t-throw', { invoke });
    expect(out).toEqual({ ok: false, photos: 0, cover: false, error: 'offline' });
    expect(isResolvingPhotos('t-throw')).toBe(false);
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
    const invoke = vi.fn().mockReturnValueOnce(reply(null, { message: 'Daily photo limit reached for this trip' }));
    const { events, stop } = captureEvents();
    await resolveTripPhotos('t4', { invoke });
    stop();
    expect(events.at(-1)).toEqual({ tripId: 't4', done: 0, total: 0, finished: true, ok: false, added: 0 });
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
      data: { credits: { a1: { creator: 'Jane', license: 'CC BY 4.0' } }, activities: [{ id: 'a1', photo_url: 'u1' }, { id: 'a2', photo_url: '' }] },
      error: null,
    });
  });

  it('reports a failed read', async () => {
    const out = await fetchTripPhotos('t1', { client: fakeClient({ data: null, error: { message: 'boom' } }) });
    expect(out).toEqual({ data: null, error: 'boom' });
  });
});
