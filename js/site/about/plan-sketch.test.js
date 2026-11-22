// The plan sketch of the About page: the choice, the sums and the markup.
import { describe, it, expect } from 'vitest';
import { DEFAULT_DAYS, MAX_DAYS, MIN_DAYS, SKETCH_PLACES, clampDays, clockText, moneyText, sketchHtml, sketchPlan } from './plan-sketch.js';

describe('clampDays', () => {
  it('keeps a number of days inside the range', () => {
    expect(clampDays(3)).toBe(3);
    expect(clampDays('4')).toBe(4);
    expect(clampDays(1)).toBe(MIN_DAYS);
    expect(clampDays(99)).toBe(MAX_DAYS);
  });
  it('gives the default for anything that is not a number', () => {
    expect(clampDays(undefined)).toBe(DEFAULT_DAYS);
    expect(clampDays('many')).toBe(DEFAULT_DAYS);
  });
});

describe('clockText and moneyText', () => {
  it('prints a time the way the app does by default', () => {
    expect(clockText('09:00')).toBe('9:00 AM');
    expect(clockText('12:30')).toBe('12:30 PM');
    expect(clockText('00:05')).toBe('12:05 AM');
    expect(clockText('18:30')).toBe('6:30 PM');
  });
  it('prints an amount with its currency', () => {
    expect(moneyText(14100, 'JPY')).toBe('JPY 14,100');
    expect(moneyText(15, 'EUR')).toBe('EUR 15');
  });
});

describe('sketchPlan', () => {
  it('gives the first days of the place, numbered, with sums that add up', () => {
    for (const place of SKETCH_PLACES) {
      for (let days = MIN_DAYS; days <= MAX_DAYS; days += 1) {
        const plan = sketchPlan({ place: place.id, days });
        expect(plan.days.map((day) => day.n)).toEqual(Array.from({ length: days }, (_, i) => i + 1));
        expect(plan.stops).toBe(plan.days.reduce((sum, day) => sum + day.stops.length, 0));
        expect(plan.cost).toBe(plan.days.flatMap((day) => day.stops).reduce((sum, stop) => sum + stop.cost, 0));
        for (const day of plan.days) expect(day.cost).toBe(day.stops.reduce((sum, stop) => sum + stop.cost, 0));
      }
    }
  });
  it('gives the first place and the default length when nothing usable is chosen', () => {
    const plan = sketchPlan({ place: 'atlantis', days: 'x' });
    expect(plan.id).toBe(SKETCH_PLACES[0].id);
    expect(plan.days).toHaveLength(DEFAULT_DAYS);
    expect(sketchPlan().id).toBe(SKETCH_PLACES[0].id);
  });
  it('does not hand out the stored data', () => {
    const plan = sketchPlan({ place: 'kyoto', days: 2 });
    plan.days[0].stops[0].name = 'changed';
    expect(sketchPlan({ place: 'kyoto', days: 2 }).days[0].stops[0].name).not.toBe('changed');
  });
});

describe('the sample places', () => {
  it('each have enough days, times in order and whole costs', () => {
    expect(new Set(SKETCH_PLACES.map((place) => place.id)).size).toBe(SKETCH_PLACES.length);
    for (const place of SKETCH_PLACES) {
      expect(place.days.length).toBeGreaterThanOrEqual(MAX_DAYS);
      expect(place.lowC).toBeLessThan(place.highC);
      for (const day of place.days) {
        const times = day.stops.map((stop) => stop.time);
        expect(times.every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))).toBe(true);
        expect([...times].sort()).toEqual(times);
        expect(day.stops.every((stop) => Number.isInteger(stop.cost) && stop.cost >= 0)).toBe(true);
      }
    }
  });
});

describe('sketchHtml', () => {
  it('draws one day and one leg of the route per day, and every stop', () => {
    const plan = sketchPlan({ place: 'lisbon', days: 4 });
    const html = sketchHtml(plan);
    expect(html.match(/class="about-day"/g)).toHaveLength(4);
    expect(html.match(/class="about-route-leg"/g)).toHaveLength(4);
    expect(html.match(/class="about-stop"/g)).toHaveLength(plan.stops);
    expect(html).toContain('Lisbon, 4 days in May');
    expect(html).toContain('Typical weather');
    expect(html).toContain('Activities estimated');
  });
  it('escapes the words it is given', () => {
    const places = [{ id: 'x', name: '<b>X</b>', month: 'June', currency: 'EUR', lowC: 1, highC: 2, days: [
      { title: 'A & B', condition: 'Sunny', stops: [{ time: '09:00', name: '<script>', cost: 0 }] },
      { title: 'C', condition: 'Sunny', stops: [{ time: '10:00', name: 'D', cost: 5 }] },
    ] }];
    const html = sketchHtml(sketchPlan({ place: 'x', days: 2 }, places));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('Free');
  });
});
