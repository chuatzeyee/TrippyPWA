import { describe, it, expect } from 'vitest';
import { to12h } from './locale.js';

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
