import { afterEach, describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => null }));
vi.mock('../lib/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../data/user-prefs.js', () => ({ getHomeCurrency: () => null }));

const { weatherBadge } = await import('./shared-trip.js');
const { setDisplayPrefs } = await import('../lib/locale.js');

afterEach(() => setDisplayPrefs({ timeFormat: '12h', temperatureUnit: 'C' }));

describe('weatherBadge on the shared and reader pages', () => {
  it('in Celsius prints high over low as before', () => {
    expect(weatherBadge({ condition: 'Sunny', highC: 18, lowC: 10 })).toContain(' 18/10°C</span>');
    expect(weatherBadge({ condition: 'Snow', highC: 0, lowC: -3 })).toContain(' 0/-3°C</span>');
    expect(weatherBadge({ condition: 'Sunny', highC: 25, lowC: null })).toContain(' 25°C</span>');
  });
  it('in Fahrenheit converts both values and names the unit', () => {
    setDisplayPrefs({ temperatureUnit: 'F' });
    expect(weatherBadge({ condition: 'Sunny', highC: 18, lowC: 10 })).toContain(' 64/50°F</span>');
    expect(weatherBadge({ condition: 'Sunny', highC: 25, lowC: null })).toContain(' 77°F</span>');
    expect(weatherBadge({ condition: 'Sunny', highC: 18, lowC: 10 })).not.toContain('°C');
  });
  it('prints no temperature when there is none, in either unit', () => {
    for (const unit of ['C', 'F']) {
      setDisplayPrefs({ temperatureUnit: unit });
      expect(weatherBadge({ condition: 'Sunny', highC: null, lowC: null })).not.toMatch(/°/);
    }
    expect(weatherBadge({ highC: 18, lowC: 10 })).toBe('');
    expect(weatherBadge(null)).toBe('');
  });
});
