import { afterEach, describe, it, expect } from 'vitest';
import { setDisplayPrefs } from '../locale.js';
import { dayWeatherSuffix } from './day-page.js';

afterEach(() => setDisplayPrefs({ timeFormat: '12h', temperatureUnit: 'C' }));

describe('dayWeatherSuffix, the weather part of a PDF day header', () => {
  it('in Celsius prints what the PDF printed before prefs existed', () => {
    expect(dayWeatherSuffix({ lowC: 12, highC: 18, condition: 'sunny' })).toBe(', 12 to 18° sunny');
    expect(dayWeatherSuffix({ highC: 18, condition: 'Partly Cloudy' })).toBe(', 18° Partly Cloudy');
    expect(dayWeatherSuffix({ lowC: null, highC: 18, condition: 'rain' })).toBe(', 18° rain');
    expect(dayWeatherSuffix({ lowC: 12, highC: 18 })).toBe(', 12 to 18°');
    expect(dayWeatherSuffix({ lowC: -3, highC: 0, condition: 'snow' })).toBe(', -3 to 0° snow');
    expect(dayWeatherSuffix({ condition: 'cloudy' })).toBe(', cloudy');
    expect(dayWeatherSuffix({ lowC: 9, condition: 'fog' })).toBe(', fog'); // no high: the condition alone, as before
    expect(dayWeatherSuffix('sunny')).toBe(', sunny');
  });
  it('in Fahrenheit converts the temperatures and names the unit', () => {
    setDisplayPrefs({ temperatureUnit: 'F' });
    expect(dayWeatherSuffix({ lowC: 12, highC: 18, condition: 'sunny' })).toBe(', 54 to 64°F sunny');
    expect(dayWeatherSuffix({ highC: 25 })).toBe(', 77°F');
    expect(dayWeatherSuffix({ condition: 'cloudy' })).toBe(', cloudy');
    expect(dayWeatherSuffix('sunny')).toBe(', sunny');
  });
  it('prints one value when low and high match', () => {
    expect(dayWeatherSuffix({ lowC: 18, highC: 18, condition: 'sunny' })).toBe(', 18° sunny');
  });
  it('is empty when there is nothing to say, and never prints a stray comma', () => {
    for (const weather of [null, undefined, '', {}, { lowC: null, highC: null }, { highC: 'warm' }, { lowC: 4 }]) {
      expect(dayWeatherSuffix(weather)).toBe('');
    }
    expect(dayWeatherSuffix({ highC: 'warm', condition: 'sunny' })).toBe(', sunny');
  });
});
