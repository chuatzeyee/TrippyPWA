// The fine-tune model: days in order, stops by time, paid and free counted, the filter applied.
import { describe, it, expect } from 'vitest';
import { tuneModel, tripCurrency } from './trip-tune.js';

const trip = {
  id: 't1', title: 'Kyoto, 2 days',
  wizard_state: { destination: { name: 'Kyoto', currencyCode: 'JPY' } },
  itinerary_days: [
    { id: 'd2', day_number: 2, title: 'Fushimi', activities: [
      { id: 'a4', start_time: '14:30', title: 'Nijo Castle', cost_amount: 1300 },
      { id: 'a3', start_time: '08:00', title: 'Fushimi Inari Taisha', cost_amount: 0 },
    ] },
    { id: 'd1', day_number: 1, title: 'Higashiyama', weather: { lowC: 9, highC: 19, condition: 'sunny' }, activities: [
      { id: 'a2', start_time: '10:45', title: 'Sannenzaka lanes', venue_name: 'Sannenzaka' },
      { id: 'a1', start_time: '09:00', title: 'Kiyomizu-dera', cost_amount: 500, cost_currency: 'jpy' },
    ] },
  ],
};

describe('tuneModel', () => {
  it('puts the days in order and the stops by time, with the sums', () => {
    const model = tuneModel(trip);
    expect(model.days.map((day) => day.n)).toEqual([1, 2]);
    expect(model.days[0].stops.map((stop) => stop.id)).toEqual(['a1', 'a2']);
    expect(model.days[0].cost).toBe(500);
    expect(model.cost).toBe(1800);
    expect(model.counts).toEqual({ all: 4, paid: 2, free: 2 });
    expect(model.currency).toBe('JPY');
    expect(model.days[0].weather).not.toBe('');
  });

  it('shows only paid or only free stops, and says how many are hidden', () => {
    const paid = tuneModel(trip, { filter: 'paid' });
    expect(paid.days.flatMap((day) => day.stops.map((stop) => stop.id))).toEqual(['a1', 'a4']);
    expect(paid.days.map((day) => day.hidden)).toEqual([1, 1]);
    expect(paid.days[0].cost).toBe(500); // the sums count every stop, whatever the filter
    const free = tuneModel(trip, { filter: 'free' });
    expect(free.days.flatMap((day) => day.stops.map((stop) => stop.id))).toEqual(['a2', 'a3']);
  });

  it('takes an unknown filter as all, and survives a bare trip', () => {
    expect(tuneModel(trip, { filter: 'nope' }).filter).toBe('all');
    expect(tuneModel({})).toMatchObject({ title: 'Your trip', days: [], counts: { all: 0, paid: 0, free: 0 }, cost: 0 });
  });

  it('keeps the venue only when it says more than the title', () => {
    const stops = tuneModel(trip).days[0].stops;
    expect(stops[0].venue).toBe('');
    expect(stops[1].venue).toBe('Sannenzaka');
  });

  it('prices in the destination currency, else the budget currency', () => {
    expect(tripCurrency(trip)).toBe('JPY');
    expect(tripCurrency({ budget_currency: 'sgd' })).toBe('SGD');
    expect(tripCurrency({})).toBe('USD');
  });
});
