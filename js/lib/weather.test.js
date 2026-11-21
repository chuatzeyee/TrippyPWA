import { afterEach, describe, it, expect } from 'vitest';
import { setDisplayPrefs } from './locale.js';
import { typicalWeather, weatherLabel, weatherText } from './weather.js';

afterEach(() => setDisplayPrefs({ timeFormat: '12h', temperatureUnit: 'C' }));

describe('weatherLabel', () => {
  // The table the trip page prints from today (js/components/trip-detail.js, WEATHER_LABELS).
  it.each([
    ['sunny', 'Sunny'], ['clear', 'Clear'], ['partly cloudy', 'Pt. Cloudy'], ['partly sunny', 'Pt. Sunny'],
    ['cloudy', 'Cloudy'], ['overcast', 'Overcast'], ['rainy', 'Rain'], ['rain', 'Rain'], ['showers', 'Showers'],
    ['stormy', 'Storm'], ['thunderstorm', 'Storm'], ['snowy', 'Snow'], ['snow', 'Snow'],
    ['foggy', 'Fog'], ['fog', 'Fog'], ['windy', 'Windy'],
  ])('%s reads %s', (condition, label) => {
    expect(weatherLabel(condition)).toBe(label);
  });
  it('ignores case and outer spaces', () => {
    expect(weatherLabel('Partly Cloudy')).toBe('Pt. Cloudy');
    expect(weatherLabel('  SUNNY ')).toBe('Sunny');
    expect(weatherLabel('Snowy')).toBe('Snow');
  });
  it('is empty for a condition it does not know', () => {
    for (const condition of ['Bright intervals', 'flurries', 'mist', 'partly  cloudy', 'default', 'constructor', 'toString']) {
      expect(weatherLabel(condition)).toBe('');
    }
  });
  it('is empty for nothing and for anything that is not text', () => {
    for (const condition of ['', null, undefined, 0, 7, true, {}, ['sunny']]) expect(weatherLabel(condition)).toBe('');
  });
});

describe('weatherText in Celsius prints what the trip page prints today', () => {
  it.each([
    [{ lowC: 12, highC: 18, condition: 'sunny' }, '12 to 18° Sunny'],
    [{ lowC: 12, highC: 18, condition: 'Partly Cloudy' }, '12 to 18° Pt. Cloudy'],
    [{ lowC: 12, highC: 18 }, '12 to 18°'],
    [{ lowC: 12, highC: 18, condition: 'Bright intervals' }, '12 to 18°'],
    [{ lowC: 12, highC: 18, condition: 42 }, '12 to 18°'],
    [{ lowC: 18, highC: 18, condition: 'rain' }, '18° Rain'],
    [{ lowC: 17.6, highC: 18.4, condition: 'cloudy' }, '18° Cloudy'],
    [{ highC: 25, condition: 'clear' }, '25° Clear'],
    [{ lowC: null, highC: 25, condition: 'clear' }, '25° Clear'],
    [{ lowC: 9, highC: '', condition: 'fog' }, '9° Fog'],
    [{ lowC: 9, condition: 'snowy' }, '9° Snow'],
    [{ lowC: '9.6', highC: '18', condition: 'windy' }, '10 to 18° Windy'],
    [{ lowC: -3, highC: 0, condition: 'snow' }, '-3 to 0° Snow'],
    [{ lowC: 0, highC: 0 }, '0°'],
    [{ lowC: 11.5, highC: 22.4, condition: 'overcast' }, '12 to 22° Overcast'],
  ])('%j reads %j', (weather, text) => {
    expect(weatherText(weather)).toBe(text);
  });
  it.each([
    [{ condition: 'sunny' }], [{ lowC: null, highC: null, condition: 'sunny' }], [{ lowC: '', highC: undefined }],
    [{ lowC: 'mild', highC: 'warm', condition: 'sunny' }], [{}], [null], [undefined], ['sunny'], [18], [false],
    [{ lowC: false, highC: true, condition: 'sunny' }], [{ lowC: ' ', highC: [], condition: 'sunny' }],
  ])('%j reads nothing', (weather) => {
    expect(weatherText(weather)).toBe('');
  });
  it('does not change what it is given', () => {
    expect(() => weatherText(Object.freeze({ lowC: 12, highC: 18, condition: 'sunny' }))).not.toThrow();
  });
});

describe('weatherText in Fahrenheit', () => {
  it.each([
    [{ lowC: 12, highC: 18, condition: 'sunny' }, '54 to 64°F Sunny'],
    [{ lowC: 16, highC: 23 }, '61 to 73°F'],
    [{ highC: 25, condition: 'clear' }, '77°F Clear'],
    [{ lowC: 18, highC: 18, condition: 'rain' }, '64°F Rain'],
    [{ lowC: -3, highC: 0, condition: 'snow' }, '27 to 32°F Snow'],
    [{ condition: 'sunny' }, ''],
  ])('%j reads %j', (weather, text) => {
    setDisplayPrefs({ temperatureUnit: 'F' });
    expect(weatherText(weather)).toBe(text);
  });
});

describe('typicalWeather', () => {
  const day = (day_number, date, weather) => ({ day_number, date, weather });

  it('takes the lowest low, the highest high and the most common condition over the days', () => {
    const typical = typicalWeather([
      day(1, '2027-02-20', { lowC: 16, highC: 21, condition: 'sunny' }),
      day(2, '2027-02-21', { lowC: 17, highC: 23, condition: 'Partly Cloudy' }),
      day(3, '2027-02-22', { lowC: 18, highC: 22, condition: 'partly cloudy' }),
    ], '2027-02-20');
    expect(typical).toEqual({ lowC: 16, highC: 23, range: '16 to 23°C', condition: 'Pt. Cloudy', season: 'typical for late February' });
  });
  it('prints the range in Fahrenheit and keeps the stored Celsius numbers', () => {
    setDisplayPrefs({ temperatureUnit: 'F' });
    const typical = typicalWeather([day(1, '2027-02-20', { lowC: 16, highC: 23, condition: 'clear' })], '2027-02-20');
    expect(typical).toMatchObject({ lowC: 16, highC: 23, range: '61 to 73°F', condition: 'Clear' });
  });
  it('a tie between conditions goes to the one seen first', () => {
    const days = [
      day(1, '2027-03-01', { lowC: 5, highC: 9, condition: 'rain' }),
      day(2, '2027-03-02', { lowC: 5, highC: 9, condition: 'cloudy' }),
      day(3, '2027-03-03', { lowC: 5, highC: 9, condition: 'cloudy' }),
      day(4, '2027-03-04', { lowC: 5, highC: 9, condition: 'rainy' }),
    ];
    expect(typicalWeather(days, '2027-03-01').condition).toBe('Rain');
  });
  it('has no condition when no day names one it knows', () => {
    const typical = typicalWeather([day(1, '2027-03-05', { lowC: 5, highC: 9, condition: 'Muggy with a passing shower' }), day(2, '2027-03-06', { lowC: 6, highC: 11 })], '2027-03-05');
    expect(typical).toMatchObject({ lowC: 5, highC: 11, condition: '' });
  });
  it('skips days with no weather or no temperature, and reads numeric text', () => {
    const typical = typicalWeather([
      day(1, '2027-05-11', null),
      day(2, '2027-05-12', { condition: 'sunny' }),
      day(3, '2027-05-13', { lowC: '9', highC: '17.4', condition: 'showers' }),
      day(4, '2027-05-14', 'sunny'),
      day(5, '2027-05-15', { lowC: 11, highC: null, condition: 'showers' }),
    ], '2027-05-11');
    expect(typical).toEqual({ lowC: 9, highC: 17.4, range: '9 to 17°C', condition: 'Showers', season: 'typical for mid May' });
  });
  it('uses what there is when the days carry only highs or only lows', () => {
    expect(typicalWeather([day(1, '2027-07-01', { highC: 30 }), day(2, '2027-07-02', { highC: 33 })], '2027-07-01'))
      .toMatchObject({ lowC: 30, highC: 33, range: '30 to 33°C' });
    expect(typicalWeather([day(1, '2027-07-01', { lowC: 21 })], '2027-07-01')).toMatchObject({ lowC: 21, highC: 21, range: '21°C' });
  });
  it('is null when no day carries a temperature', () => {
    expect(typicalWeather([day(1, '2027-05-11', null), day(2, '2027-05-12', { condition: 'sunny' })], '2027-05-11')).toBeNull();
    expect(typicalWeather([], '2027-05-11')).toBeNull();
    expect(typicalWeather(null, '2027-05-11')).toBeNull();
    expect(typicalWeather(undefined)).toBeNull();
    expect(typicalWeather('days')).toBeNull();
  });

  describe('the season wording', () => {
    const one = (date) => typicalWeather([day(1, date, { lowC: 10, highC: 20 })], date).season;

    it('names the part of the month: early to the 10th, mid to the 20th, late after', () => {
      expect(one('2027-03-01')).toBe('typical for early March');
      expect(one('2027-03-10')).toBe('typical for early March');
      expect(one('2027-03-11')).toBe('typical for mid March');
      expect(one('2027-03-20')).toBe('typical for mid March');
      expect(one('2027-03-21')).toBe('typical for late March');
      expect(one('2027-03-31')).toBe('typical for late March');
      expect(one('2026-12-25')).toBe('typical for late December');
      expect(one('2027-01-05T00:00:00')).toBe('typical for early January');
    });
    it('takes the middle of the days that carry weather', () => {
      const days = [
        day(1, '2027-02-24', { lowC: 10, highC: 20 }),
        day(2, '2027-02-25', { lowC: 10, highC: 20 }),
        day(8, '2027-03-03', { lowC: 10, highC: 20 }),
        day(9, '2027-03-04', null),
      ];
      expect(typicalWeather(days, '2027-02-24').season).toBe('typical for late February'); // middle: 27 or 28 February
      expect(typicalWeather(days.slice(2), '2027-02-24').season).toBe('typical for early March');
    });
    it('works the date out from the start date and the day number when a day has no date', () => {
      const days = [{ day_number: 1, weather: { lowC: 10, highC: 20 } }, { day_number: 2, weather: { lowC: 10, highC: 20 } }];
      expect(typicalWeather(days, '2027-09-29').season).toBe('typical for late September');
      expect(typicalWeather([{ day_number: 12, weather: { lowC: 10, highC: 20 } }], '2027-09-29').season).toBe('typical for early October');
      expect(typicalWeather([{ weather: { lowC: 10, highC: 20 } }, { weather: { lowC: 10, highC: 20 } }], '2027-09-11').season).toBe('typical for mid September');
    });
    it('says "typical for the season" when no date is known', () => {
      expect(typicalWeather([{ day_number: 1, weather: { lowC: 10, highC: 20 } }]).season).toBe('typical for the season');
      expect(typicalWeather([day(1, 'soon', { lowC: 10, highC: 20 })], 'next year').season).toBe('typical for the season');
      expect(typicalWeather([day(1, '2027-02-31', { lowC: 10, highC: 20 })], null).season).toBe('typical for the season');
    });
    it('always carries the word typical', () => {
      expect(one('2027-06-15')).toMatch(/^typical for /);
    });
  });

  it('does not change the days it is given', () => {
    const days = Object.freeze([Object.freeze(day(1, '2027-02-20', Object.freeze({ lowC: 16, highC: 21, condition: 'sunny' })))]);
    expect(() => typicalWeather(days, '2027-02-20')).not.toThrow();
  });
});
