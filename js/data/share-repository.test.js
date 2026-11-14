import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => null }));
vi.mock('../lib/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../data/user-prefs.js', () => ({ getHomeCurrency: () => null }));

const { toSharedView } = await import('./share-repository.js');
const { weatherBadge } = await import('../components/shared-trip.js');

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
