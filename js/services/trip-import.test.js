import { describe, it, expect } from 'vitest';
import { parseTripImport, TripImportError, IMPORT_LIMITS } from './trip-import.js';

const base = () => ({
  trippy: 1,
  trip: {
    title: 'Hokkaido in Winter',
    emoji: '❄️',
    destination: { name: 'Sapporo', country: 'Japan', currencyCode: 'JPY', currencySymbol: '¥', timezone: 'Asia/Tokyo' },
    startDate: '2027-01-13',
    endDate: '2027-01-14',
    travelers: 2,
    dailyBudget: 40000,
  },
  days: [
    {
      dayNumber: 1,
      date: '2027-01-13',
      title: 'Arrive',
      activities: [
        { timeSlot: 'evening', startTime: '19:30', title: 'Jingisukan at Daruma', category: 'food', costAmount: 6000.6, costCurrency: 'JPY', bookingUrl: 'javascript:alert(1)' },
      ],
    },
    { dayNumber: 2, title: 'Maruyama', activities: [] },
  ],
});

const parse = (obj) => parseTripImport(JSON.stringify(obj));

describe('parseTripImport', () => {
  it('builds wizardState and itinerary from a valid file', () => {
    const { wizardState, itinerary } = parse(base());
    expect(wizardState.destination).toMatchObject({ name: 'Sapporo', currencyCode: 'JPY', currencySymbol: '¥', timezone: 'Asia/Tokyo', emoji: '❄️' });
    expect(wizardState.dates).toEqual({ mode: 'fixed', start: '2027-01-13', end: '2027-01-14' });
    expect(wizardState.travelers).toBe(2);
    expect(wizardState.budget.dailyAmount).toBe(40000);
    expect(wizardState.imported).toBe(true);
    expect(itinerary.tripTitle).toBe('Hokkaido in Winter');
    expect(itinerary.days).toHaveLength(2);
  });

  it('sanitises activities: rounds costs, strips unsafe URLs, normalises slots', () => {
    const { itinerary } = parse(base());
    const act = itinerary.days[0].activities[0];
    expect(act.costAmount).toBe(6001);
    expect(act.bookingUrl).toBe('');
    expect(act.timeSlot).toBe('evening');
    const b = base();
    b.days[0].activities[0].timeSlot = 'late night';
    expect(parse(b).itinerary.days[0].activities[0].timeSlot).toBe('evening');
  });

  it('rejects invalid JSON and non-Trippy files with friendly messages', () => {
    expect(() => parseTripImport('{nope')).toThrow(TripImportError);
    expect(() => parseTripImport('{nope')).toThrow(/valid JSON/);
    expect(() => parse({ hello: 1 })).toThrow(/Trippy import file/);
  });

  it('rejects oversize files', () => {
    const huge = ' '.repeat(IMPORT_LIMITS.maxBytes + 1);
    expect(() => parseTripImport(huge)).toThrow(/too large/);
  });

  it('requires a destination name and valid, ordered dates', () => {
    const noDest = base(); noDest.trip.destination = {};
    expect(() => parse(noDest)).toThrow(/destination/);
    const badDate = base(); badDate.trip.startDate = '2027-02-30';
    expect(() => parse(badDate)).toThrow(/start date/);
    const reversed = base(); reversed.trip.endDate = '2027-01-01';
    expect(() => parse(reversed)).toThrow(/end date/);
  });

  it('accepts a destination given as a plain string', () => {
    const b = base(); b.trip.destination = 'Sapporo';
    expect(parse(b).wizardState.destination.name).toBe('Sapporo');
  });

  it('requires days with unique day numbers and titled activities', () => {
    const noDays = base(); noDays.days = [];
    expect(() => parse(noDays)).toThrow(/at least one day/);
    const dup = base(); dup.days[1].dayNumber = 1;
    expect(() => parse(dup)).toThrow(/Day 1 appears twice/);
    const untitled = base(); untitled.days[0].activities[0].title = '  ';
    expect(() => parse(untitled)).toThrow(/Day 1, activity 1 needs a title/);
  });

  it('rejects day dates outside the trip', () => {
    const b = base(); b.days[0].date = '2027-03-01';
    expect(() => parse(b)).toThrow(/outside the trip dates/);
  });

  it('enforces day and activity limits', () => {
    const many = base();
    many.days[0].activities = Array.from({ length: IMPORT_LIMITS.maxActivitiesPerDay + 1 }, (_, i) => ({ title: `a${i}` }));
    expect(() => parse(many)).toThrow(/too many activities/);
  });

  it('whitelists extras and sanitises their URLs and dates', () => {
    const b = base();
    b.flights = {
      outbound: { route: 'SIN → TPE → CTS', airline: 'Scoot', flightNumber: 'TR892', booked: true, bookingRef: 'E68JGI', seats: '1H, 1K', manageUrl: 'javascript:x' },
      inbound: { route: 'CTS → TPE → SIN', airline: 'Scoot', flightNumber: 'TR893', evil: '<script>' },
    };
    b.accommodation = [{ name: 'Randor', checkIn: '2027-01-13', checkOut: 'bad', url: 'https://randor.jp' }, { area: 'no name' }];
    b.bookingChecklist = [{ group: 'Must Book Ahead', items: [{ label: 'Ryokan', by: '2026-11-30', url: 'https://ok.example' }, { label: 'x', by: 'whenever' }, { note: 'no label' }] }];
    b.savingsTips = [{ title: 'Sunday nights', description: 'cheaper' }, { description: 'untitled' }];
    b.secrets = { token: 'abc' };

    const { itinerary } = parse(b);
    expect(itinerary.flights.outbound).toMatchObject({ booked: true, bookingRef: 'E68JGI', seats: '1H, 1K', manageUrl: '' });
    expect(itinerary.flights.inbound.evil).toBeUndefined();
    expect(itinerary.accommodation).toHaveLength(1);
    expect(itinerary.accommodation[0]).toMatchObject({ name: 'Randor', checkIn: '2027-01-13', checkOut: '', url: 'https://randor.jp/' });
    expect(itinerary.bookingChecklist[0].items).toHaveLength(2);
    expect(itinerary.bookingChecklist[0].items[1].by).toBe('');
    expect(itinerary.savingsTips).toHaveLength(1);
    expect(itinerary.secrets).toBeUndefined();
  });
});
