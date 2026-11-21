import { afterEach, describe, it, expect } from 'vitest';
import { formatClock, formatTemp, formatTempRange, isTemperature, setDisplayPrefs, to12h } from './locale.js';

// Every test starts from the defaults: 12-hour clock, Celsius.
afterEach(() => setDisplayPrefs({ timeFormat: '12h', temperatureUnit: 'C' }));

describe('to12h', () => {
  it('converts bare clock times', () => {
    expect(to12h('06:10')).toBe('6:10 AM');
    expect(to12h('19:30')).toBe('7:30 PM');
    expect(to12h('00:05')).toBe('12:05 AM');
    expect(to12h('12:00')).toBe('12:00 PM');
    expect(to12h('09:00:00')).toBe('9:00 AM');
  });

  it('converts times inside text', () => {
    expect(to12h('Wed 13 Jan 06:10, SIN T1')).toBe('Wed 13 Jan 6:10 AM, SIN T1');
    expect(to12h('Arrive by 18:30, gates shut 18:45')).toBe('Arrive by 6:30 PM, gates shut 6:45 PM');
  });

  it('leaves non-times and 12h times alone', () => {
    expect(to12h('7:30 pm')).toBe('7:30 pm');
    expect(to12h('7:30PM')).toBe('7:30PM');
    expect(to12h('25:00')).toBe('25:00');
    expect(to12h('ratio 1:2')).toBe('ratio 1:2');
    expect(to12h('')).toBe('');
    expect(to12h(null)).toBe('');
  });
});

describe('formatClock in 12-hour mode (the default)', () => {
  it('is the same function as to12h', () => {
    expect(to12h).toBe(formatClock);
  });
  it('converts every 24-hour time in mixed text and leaves marked times alone', () => {
    expect(formatClock('Depart 06:10, land 7:30 pm, hotel by 21:05:00')).toBe('Depart 6:10 AM, land 7:30 pm, hotel by 9:05 PM');
    expect(formatClock('00:00 to 23:59')).toBe('12:00 AM to 11:59 PM');
    expect(formatClock('Lunch at 1 PM, dinner 7pm')).toBe('Lunch at 1 PM, dinner 7pm');
  });
  it('gives the same text as before for every case to12h already handled', () => {
    const cases = [
      ['06:10', '6:10 AM'], ['19:30', '7:30 PM'], ['00:05', '12:05 AM'], ['12:00', '12:00 PM'], ['09:00:00', '9:00 AM'],
      ['Wed 13 Jan 06:10, SIN T1', 'Wed 13 Jan 6:10 AM, SIN T1'],
      ['Arrive by 18:30, gates shut 18:45', 'Arrive by 6:30 PM, gates shut 6:45 PM'],
      ['7:30 pm', '7:30 pm'], ['7:30PM', '7:30PM'], ['25:00', '25:00'], ['ratio 1:2', 'ratio 1:2'], ['', ''], [null, ''],
    ];
    for (const [input, expected] of cases) expect(formatClock(input)).toBe(expected);
    expect(formatClock(undefined)).toBe('');
  });
  it('goes back to 12-hour text when the pref is set back', () => {
    setDisplayPrefs({ timeFormat: '24h' });
    setDisplayPrefs({ timeFormat: '12h' });
    expect(formatClock('19:30')).toBe('7:30 PM');
  });
});

describe('formatClock in 24-hour mode', () => {
  const in24h = (text) => {
    setDisplayPrefs({ timeFormat: '24h' });
    return formatClock(text);
  };

  it('turns marked times into 24-hour times', () => {
    expect(in24h('6:10 PM')).toBe('18:10');
    expect(in24h('6:10 AM')).toBe('06:10');
    expect(in24h('7:30 pm')).toBe('19:30');
    expect(in24h('7:30PM')).toBe('19:30');
    expect(in24h('12:05 AM')).toBe('00:05');
    expect(in24h('12:00 PM')).toBe('12:00');
    expect(in24h('11:59 p.m.')).toBe('23:59');
    expect(in24h('9:15:30 am')).toBe('09:15');
  });
  it('turns an hour with a marker into a full time', () => {
    expect(in24h('Lunch at 1 PM, dinner 7pm')).toBe('Lunch at 13:00, dinner 19:00');
    expect(in24h('12 am')).toBe('00:00');
    expect(in24h('12 PM')).toBe('12:00');
  });
  it('converts both ends of a range that marks both', () => {
    expect(in24h('Open 9 AM to 5 PM')).toBe('Open 09:00 to 17:00');
    expect(in24h('5:00 PM-6:10 PM')).toBe('17:00-18:10');
    expect(in24h('8am, 1pm or 6pm')).toBe('08:00, 13:00 or 18:00');
  });
  it('leaves a range that marks only its end as it is, rather than convert half of it', () => {
    for (const text of ['7-9 PM', '7 - 9 PM', '7 to 9 PM', 'between 6 and 8 pm', '6 or 7 pm', '7\u20139 PM']) {
      expect(in24h(text)).toBe(text);
    }
  });
  it('keeps stored 24-hour times, with two-digit hours and no seconds', () => {
    expect(in24h('06:10')).toBe('06:10');
    expect(in24h('19:30')).toBe('19:30');
    expect(in24h('9:05')).toBe('09:05');
    expect(in24h('09:00:00')).toBe('09:00');
    expect(in24h('00:05')).toBe('00:05');
  });
  it('handles several times of both kinds in one text', () => {
    expect(in24h('Depart 06:10, land 7:30 pm, hotel by 21:05:00')).toBe('Depart 06:10, land 19:30, hotel by 21:05');
    expect(in24h('Wed 13 Jan 6:10 AM, SIN T1')).toBe('Wed 13 Jan 06:10, SIN T1');
    expect(in24h('Arrive by 6:30 PM, gates shut 6:45 PM.')).toBe('Arrive by 18:30, gates shut 18:45.');
  });
  it('leaves alone what is not a clock time', () => {
    expect(in24h('25:00')).toBe('25:00');
    expect(in24h('13:00 PM')).toBe('13:00 PM');
    expect(in24h('0:30 AM')).toBe('0:30 AM');
    expect(in24h('ratio 1:2')).toBe('ratio 1:2');
    expect(in24h('Room 204 pm rate')).toBe('Room 204 pm rate');
    expect(in24h('I am here, 3 amps, 5 pmol')).toBe('I am here, 3 amps, 5 pmol');
    expect(in24h('1.5 pm')).toBe('1.5 pm');
    expect(in24h('')).toBe('');
    expect(in24h(null)).toBe('');
  });
  it('to12h follows the pref too, since it is the same function', () => {
    setDisplayPrefs({ timeFormat: '24h' });
    expect(to12h('6:10 PM')).toBe('18:10');
  });
});

describe('setDisplayPrefs', () => {
  it('changes only the keys it is given', () => {
    setDisplayPrefs({ temperatureUnit: 'F' });
    expect(formatClock('19:30')).toBe('7:30 PM');
    expect(formatTemp(23)).toBe('73°F');
    setDisplayPrefs({ timeFormat: '24h' });
    expect(formatTemp(23)).toBe('73°F');
    expect(formatClock('7:30 PM')).toBe('19:30');
  });
  it('ignores a value it does not know and anything that is not an object', () => {
    setDisplayPrefs({ timeFormat: 'swatch', temperatureUnit: 'K' });
    setDisplayPrefs(null);
    setDisplayPrefs('24h');
    expect(formatClock('19:30')).toBe('7:30 PM');
    expect(formatTemp(23)).toBe('23°C');
  });
  it('does not change what it is given', () => {
    expect(() => setDisplayPrefs(Object.freeze({ timeFormat: '24h', temperatureUnit: 'F' }))).not.toThrow();
  });
});

describe('isTemperature', () => {
  it('takes numbers and numeric text, and nothing else', () => {
    for (const value of [0, -3, 18, 9.6, '18', '9.6', ' 7 ', '-2']) expect(isTemperature(value)).toBe(true);
    for (const value of [null, undefined, '', ' ', 'warm', NaN, Infinity, -Infinity, true, false, {}, [], [18], new Date(0)]) expect(isTemperature(value)).toBe(false);
  });
});

describe('formatTemp', () => {
  it('prints a Celsius value in Celsius', () => {
    expect(formatTemp(23)).toBe('23°C');
    expect(formatTemp(22.6)).toBe('23°C');
    expect(formatTemp(0)).toBe('0°C');
    expect(formatTemp(-3)).toBe('-3°C');
    expect(formatTemp('18')).toBe('18°C');
    expect(formatTemp(-0.2)).toBe('0°C');
  });
  it('prints a Celsius value in Fahrenheit', () => {
    setDisplayPrefs({ temperatureUnit: 'F' });
    expect(formatTemp(23)).toBe('73°F');
    expect(formatTemp(0)).toBe('32°F');
    expect(formatTemp(-40)).toBe('-40°F');
    expect(formatTemp(100)).toBe('212°F');
    expect(formatTemp('16')).toBe('61°F');
  });
  it('is empty for a missing value', () => {
    for (const unit of ['C', 'F']) {
      setDisplayPrefs({ temperatureUnit: unit });
      for (const missing of [null, undefined, '', '  ', 'warm', NaN, Infinity, {}, [18], true, false]) expect(formatTemp(missing)).toBe('');
    }
  });
});

describe('formatTempRange', () => {
  it('prints low to high with the unit', () => {
    expect(formatTempRange(16, 23)).toBe('16 to 23°C');
    expect(formatTempRange(-3, 0)).toBe('-3 to 0°C');
    expect(formatTempRange('9.6', '18')).toBe('10 to 18°C');
  });
  it('prints the range in Fahrenheit, each end converted and then rounded', () => {
    setDisplayPrefs({ temperatureUnit: 'F' });
    expect(formatTempRange(16, 23)).toBe('61 to 73°F');
    expect(formatTempRange(-3, 0)).toBe('27 to 32°F');
  });
  it('prints one value when both ends match after rounding', () => {
    expect(formatTempRange(18, 18)).toBe('18°C');
    expect(formatTempRange(17.6, 18.2)).toBe('18°C');
    setDisplayPrefs({ temperatureUnit: 'F' });
    expect(formatTempRange(18, 18)).toBe('64°F');
  });
  it('prints the one value that is there', () => {
    expect(formatTempRange(null, 25)).toBe('25°C');
    expect(formatTempRange(12, undefined)).toBe('12°C');
    expect(formatTempRange('', 0)).toBe('0°C');
  });
  it('is empty when neither end is a number', () => {
    for (const unit of ['C', 'F']) {
      setDisplayPrefs({ temperatureUnit: unit });
      expect(formatTempRange(null, null)).toBe('');
      expect(formatTempRange(undefined, '')).toBe('');
      expect(formatTempRange('warm', 'hot')).toBe('');
      expect(formatTempRange(false, true)).toBe('');
      expect(formatTempRange()).toBe('');
    }
  });
  it('can leave the C out, as the classic day card and the PDF print it, but never the F', () => {
    expect(formatTempRange(12, 18, { celsiusLetter: false })).toBe('12 to 18°');
    expect(formatTempRange(null, 18, { celsiusLetter: false })).toBe('18°');
    expect(formatTempRange(null, null, { celsiusLetter: false })).toBe('');
    setDisplayPrefs({ temperatureUnit: 'F' });
    expect(formatTempRange(12, 18, { celsiusLetter: false })).toBe('54 to 64°F');
  });
  it('can print high then low with a slash, as the shared page badge prints it', () => {
    expect(formatTempRange(10, 18, { style: 'slash' })).toBe('18/10°C');
    expect(formatTempRange(-3, 0, { style: 'slash' })).toBe('0/-3°C');
    expect(formatTempRange(null, 25, { style: 'slash' })).toBe('25°C');
    expect(formatTempRange(18, 18, { style: 'slash' })).toBe('18/18°C');
    expect(formatTempRange(null, null, { style: 'slash' })).toBe('');
    setDisplayPrefs({ temperatureUnit: 'F' });
    expect(formatTempRange(10, 18, { style: 'slash' })).toBe('64/50°F');
  });
});
