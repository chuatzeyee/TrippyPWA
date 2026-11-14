import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestTripCover, coverRequested, resetCoverRequests } from './trip-cover.js';

// Node has EventTarget + CustomEvent but no window; give the module one.
globalThis.window = globalThis.window || new EventTarget();

const reply = (data, error = null) => Promise.resolve({ data, error });
const record = { v: 2, large: { url: 'https://s/cover-v2-2400w.jpg', w: 2400, h: 1600 }, small: null, focusY: 38 };

function captureEvents() {
  const events = [];
  const listener = (e) => events.push(e.detail);
  window.addEventListener('trippy:cover', listener);
  return { events, stop: () => window.removeEventListener('trippy:cover', listener) };
}

describe('requestTripCover', () => {
  beforeEach(() => resetCoverRequests());

  it('asks for the cover only and broadcasts the result', async () => {
    const invoke = vi.fn(() => reply({ ok: true, cover: true, coverImage: record.large.url, coverRecord: record }));
    const { events, stop } = captureEvents();
    const out = await requestTripCover('t1', { invoke });
    stop();
    expect(invoke).toHaveBeenCalledWith('resolve-trip-photos', { body: { tripId: 't1', coverOnly: true } });
    expect(out).toEqual({ ok: true, picked: true, coverImage: record.large.url, cover: record });
    expect(events).toEqual([{ tripId: 't1', ok: true, picked: true, coverImage: record.large.url, cover: record }]);
  });

  it('runs at most once per trip per session, even after a failure', async () => {
    const invoke = vi.fn(() => reply(null, { message: 'Daily photo limit reached for this trip' }));
    const first = requestTripCover('t2', { invoke });
    expect(requestTripCover('t2', { invoke })).toBe(first); // shares the call in flight
    expect(await first).toMatchObject({ ok: false, error: 'Daily photo limit reached for this trip' });
    expect(await requestTripCover('t2', { invoke })).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(coverRequested('t2')).toBe(true);
  });

  it('reports a thrown error instead of rejecting', async () => {
    const invoke = vi.fn(() => Promise.reject(new Error('offline')));
    expect(await requestTripCover('t3', { invoke })).toMatchObject({ ok: false, error: 'offline' });
  });

  it('ignores a missing trip id', async () => {
    expect(await requestTripCover('', { invoke: vi.fn() })).toBeNull();
  });
});
