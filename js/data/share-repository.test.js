import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => null }));
vi.mock('../lib/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../data/user-prefs.js', () => ({ getHomeCurrency: () => null }));

const { toSharedView, isShareExpired, shareLinkStatus, SHARE_GONE_TEXT, SHARE_LINK_DAYS } = await import('./share-repository.js');
const { weatherBadge } = await import('../components/shared-trip.js');
const { setLocaleFromFlag } = await import('../lib/locale.js');

function viewWithWeather(weather) {
  return toSharedView({ title: 'T', itinerary_days: [{ day_number: 1, weather, activities: [] }] });
}

describe('toSharedView weather', () => {
  it('keeps missing temperatures as null, not 0', () => {
    const { weather } = viewWithWeather({ condition: 'Sunny', highC: null, lowC: null }).itinerary_days[0];
    expect(weather).toEqual({ condition: 'Sunny', highC: null, lowC: null });
    expect(weatherBadge(weather)).not.toMatch(/°C/);
  });

  it('treats absent, empty and boolean values as missing', () => {
    const { weather } = viewWithWeather({ condition: 'Rain', highC: '', lowC: false }).itinerary_days[0];
    expect(weather.highC).toBeNull();
    expect(weather.lowC).toBeNull();
    expect(viewWithWeather({ condition: 'Rain' }).itinerary_days[0].weather.highC).toBeNull();
  });

  it('shows only the temperature that is present', () => {
    const { weather } = viewWithWeather({ condition: 'Sunny', highC: 25, lowC: null }).itinerary_days[0];
    expect(weatherBadge(weather)).toContain(' 25°C');
    expect(weatherBadge(weather)).not.toContain('25/');
  });

  it('still renders a real 0 and negative temperatures', () => {
    const { weather } = viewWithWeather({ condition: 'Snow', highC: 0, lowC: -3 }).itinerary_days[0];
    expect(weather).toEqual({ condition: 'Snow', highC: 0, lowC: -3 });
    expect(weatherBadge(weather)).toContain(' 0/-3°C');
  });

  it('accepts numeric strings', () => {
    const { weather } = viewWithWeather({ condition: 'Cloudy', highC: '18', lowC: '9.6' }).itinerary_days[0];
    expect(weatherBadge(weather)).toContain(' 18/10°C');
  });
});

describe('toSharedView activities', () => {
  it('leaves a missing duration and cost empty and defaults sort order', () => {
    const view = toSharedView({
      itinerary_days: [{ day_number: 1, activities: [{ title: 'Walk', duration_minutes: null, cost_amount: '', sort_order: null }] }],
    });
    const [a] = view.itinerary_days[0].activities;
    expect(a.duration_minutes).toBeNull();
    expect(a.cost_amount).toBeNull();
    expect(a.sort_order).toBe(0);
  });

  it('orders activities the same way as the owner trip view', () => {
    // Timed at 10:00, untimed, timed at 09:00: a pairwise "compare times only
    // when both have one" comparator has no consistent answer here.
    const activities = [
      { title: 'A', start_time: '10:00', sort_order: 1 },
      { title: 'B', start_time: '', sort_order: 2 },
      { title: 'C', start_time: '9:00', sort_order: 3 },
    ];
    const titles = (list) => list.map(a => a.title);
    for (const input of [activities, [...activities].reverse()]) {
      const view = toSharedView({ itinerary_days: [{ day_number: 1, activities: input }] });
      expect(titles(view.itinerary_days[0].activities)).toEqual(['C', 'A', 'B']);
    }
  });
});

describe('share link expiry', () => {
  const NOW = Date.parse('2026-11-22T10:00:00Z');
  const share = (expires_at) => ({ id: 's1', share_token: 'a'.repeat(32), expires_at });
  // The date is written the way the user's home country writes it.
  beforeEach(() => setLocaleFromFlag('sg'));

  it('writes the date as the locale does', () => {
    setLocaleFromFlag('us');
    expect(shareLinkStatus(share('2026-11-29T10:00:00Z'), NOW).text).toBe('This link works until Nov 29, 2026');
  });

  it('a link lasts 7 days', () => {
    expect(SHARE_LINK_DAYS).toBe(7);
  });
  it('says until when a working link works, with no full stop for the dialog to end', () => {
    expect(shareLinkStatus(share('2026-11-29T10:00:00Z'), NOW)).toEqual({ expired: false, text: 'This link works until 29 Nov 2026' });
  });
  it('says when an expired link expired, so the dialog offers a new one', () => {
    expect(shareLinkStatus(share('2026-11-20T10:00:00Z'), NOW)).toEqual({ expired: true, text: 'This link expired on 20 Nov 2026.' });
    expect(isShareExpired(share('2026-11-20T10:00:00Z'), NOW)).toBe(true);
  });
  it('expires at the moment itself, not after it', () => {
    expect(isShareExpired(share('2026-11-22T10:00:00Z'), NOW)).toBe(true);
    expect(isShareExpired(share('2026-11-22T10:00:01Z'), NOW)).toBe(false);
  });
  it('a row without a usable date (before migration 023) is a working link with no date line', () => {
    for (const row of [share(undefined), share(null), share('soon'), null]) {
      expect(shareLinkStatus(row, NOW)).toEqual({ expired: false, text: '' });
      expect(isShareExpired(row, NOW)).toBe(false);
    }
  });
  it('the text a visitor reads for an expired or unknown link', () => {
    expect(SHARE_GONE_TEXT).toBe('This link has expired. Ask the person who shared it for a new one.');
  });
});

describe('fetchSharedTrip without a usable token', () => {
  it('reads as an expired link and asks nothing of the server', async () => {
    const { fetchSharedTrip } = await import('./share-repository.js');
    for (const token of ['', 'short', null, 'has spaces in it and is long enough']) {
      expect(await fetchSharedTrip(token)).toEqual({ data: null, error: SHARE_GONE_TEXT, reason: 'gone' });
    }
  });
});
