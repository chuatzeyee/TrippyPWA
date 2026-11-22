import { afterEach, describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => null }));
vi.mock('../lib/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../data/user-prefs.js', () => ({ getHomeCurrency: () => null }));

const { weatherBadge, sharedTripMissingHtml } = await import('./shared-trip.js');
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

describe('the shared-trip page without a trip', () => {
  const textOf = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  it('says the link has expired and who to ask, for an expired or unknown token', () => {
    for (const html of [sharedTripMissingHtml(), sharedTripMissingHtml({ reason: 'gone', error: 'anything' })]) {
      expect(textOf(html)).toBe('This link has expired Ask the person who shared it for a new one. Go to Trippy');
      expect(html).toContain('<h1 class="text-h1">This link has expired</h1>');
      expect(html).toContain('data-go="/"');
      expect(html).not.toContain('data-shared-retry');
    }
  });
  it('says so when the request itself failed, and offers another try', () => {
    const html = sharedTripMissingHtml({ reason: 'failed', error: 'We could not load this shared trip. Please try again.' });
    expect(textOf(html)).toBe('This trip could not be loaded We could not load this shared trip. Please try again. Try again');
    expect(html).toContain('data-shared-retry');
    expect(textOf(html)).not.toContain('expired');
  });
  it('escapes what it is given and uses none of the banned glyphs', () => {
    const html = sharedTripMissingHtml({ reason: 'failed', error: '<b>x</b>' });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(sharedTripMissingHtml()).not.toMatch(/[\u2014\u2013\u00b7\u2022\u2026]/);
  });
});
