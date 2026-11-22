import { describe, it, expect } from 'vitest';
import {
  buildChatRequest, planForChat, validateEdits, applyExtrasEdit, editWrite, proposalText, choiceText, tripCurrency, CHAT_LIMITS,
} from './itinerary-chat-plan.js';

const AI_GLYPHS = /[–—·•…]|\.{3}/;

const trip = () => ({
  id: 't1', title: 'Kyoto', user_id: 'me', start_date: '2027-03-01', end_date: '2027-03-04', travelers: 2, budget_currency: 'JPY',
  wizard_state: { destination: { name: 'Kyoto', currencyCode: 'JPY' } },
  itinerary_days: [
    { id: 'd1', day_number: 1, date: '2027-03-01', title: 'Arrival', activities: [
      { id: 'a1', start_time: '10:00:00', title: 'Market walk', venue_name: 'Nishiki Market', category: 'food', cost_amount: 1500, cost_currency: 'JPY', notes: 'buy tea', photo_url: 'https://x/y.jpg' },
      { id: 'a2', start_time: '19:00', title: 'Dinner', venue_name: 'Gion Karyo', category: 'food', cost_amount: 9000, cost_currency: 'JPY' },
    ] },
    { id: 'd2', day_number: 2, date: '2027-03-02', title: 'Temples', activities: [{ id: 'a3', start_time: '09:00', title: 'Kinkaku-ji', venue_name: '', cost_amount: 500 }] },
  ],
  extras: {
    photoCredits: { a1: { creator: 'c' } },
    accommodation: [
      { name: 'Hotel Granvia', area: 'Kyoto Station', type: 'Hotel', city: 'Kyoto', priceRange: 'JPY 30,000', highlights: 'By the station', badge: 'Recommended', checkIn: '', checkOut: '', booked: false, url: 'https://granvia.example', bookingRef: '', address: '' },
      { name: 'Ryokan Yoshida', city: 'Kyoto', checkIn: '2027-03-01', checkOut: '2027-03-04', booked: true, bookingRef: 'RY-1' },
    ],
    flights: {
      outbound: { route: 'SIN > KIX', airline: 'Singapore Airlines', flightNumber: 'SQ 622', duration: '6h 30m', priceRange: 'S$700', tips: 'Night flight', depart: '', arrive: '' },
      inbound: null,
    },
    bookingChecklist: [{ group: 'Must Book Ahead', items: [{ label: 'Gion Karyo dinner', day: 1, by: '2027-02-01' }] }],
  },
});
const valid = (edit, t = trip()) => validateEdits([edit], planForChat(t)).edits[0];

describe('buildChatRequest', () => {
  it('drops descriptions when a very long trip would pass the body limit', () => {
    const stop = (i) => ({ id: `s${i}`, title: 't'.repeat(120), venue_name: 'v'.repeat(120), description: 'd'.repeat(140), notes: 'n'.repeat(300) });
    const long = { itinerary_days: Array.from({ length: 60 }, (_, d) => ({ day_number: d + 1, activities: Array.from({ length: 10 }, (_, i) => stop(d * 10 + i)) })) };
    const stops = buildChatRequest(long, 'hi').days.flatMap(d => d.activities);
    expect(stops).toHaveLength(600);
    expect(stops.every(a => a.description === '' && a.notes.length === 300)).toBe(true);
    expect(buildChatRequest(trip(), 'hi').days[0].activities[0]).toHaveProperty('description');
  });
  it('carries the message, short history and a bounded plan', () => {
    const body = buildChatRequest(trip(), '  when is my flight?  ', [{ role: 'user', text: 'hi' }, { role: 'bot', text: 'hello' }]);
    expect(body.message).toBe('when is my flight?');
    expect(body.history).toEqual([{ role: 'user', text: 'hi' }, { role: 'bot', text: 'hello' }]);
    expect(body).toMatchObject({ destination: 'Kyoto', currency: 'JPY', startDate: '2027-03-01', endDate: '2027-03-04', travelers: 2 });
    expect(body.days[0].activities[0]).toEqual({
      id: 'a1', start_time: '10:00:00', title: 'Market walk', venue_name: 'Nishiki Market', category: 'food', cost_amount: 1500, description: '', notes: 'buy tea',
    });
    expect(body.stays.map(s => [s.name, s.booked, s.bookingRef])).toEqual([['Hotel Granvia', false, ''], ['Ryokan Yoshida', true, 'RY-1']]);
    expect(body.legs).toEqual([expect.objectContaining({ leg: 'outbound', kind: 'flight', carrier: 'Singapore Airlines', number: 'SQ 622', route: 'SIN > KIX', booked: false })]);
    expect(body.toBook).toEqual([{ label: 'Gion Karyo dinner', day: 1, by: '2027-02-01', note: '' }]);
    expect(JSON.stringify(body)).not.toContain('photo');
  });

  it('caps the message and the history, and describes ground transport', () => {
    const t = { ...trip(), extras: { transport: { outbound: { mode: 'train', operator: 'JR', service: 'Haruka', from: 'KIX', to: 'Kyoto', bookingRef: 'J1' } } } };
    const body = buildChatRequest(t, 'm'.repeat(900), Array.from({ length: 20 }, () => ({ role: 'user', text: 'x' })));
    expect(body.message).toHaveLength(CHAT_LIMITS.message);
    expect(body.history).toHaveLength(CHAT_LIMITS.historyTurns);
    expect(body.legs[0]).toMatchObject({ kind: 'transport', carrier: 'train JR', number: 'Haruka', route: 'KIX to Kyoto', booked: true });
    expect(body.stays).toEqual([]);
  });

  it('prices every stop in the trip currency', () => {
    const t = trip();
    t.itinerary_days[0].activities[1].cost_currency = 'USD';
    t.itinerary_days[0].activities[1].cost_amount = 10;
    expect(tripCurrency(t)).toBe('JPY');
    expect(planForChat(t).days[0].activities[1].cost_amount).toBeGreaterThan(100);
  });
});

describe('editWrite: activities', () => {
  it('turns each activity edit into its write', () => {
    expect(editWrite(trip(), valid({ kind: 'activity-remove', activityId: 'a2' }))).toEqual({ type: 'delete', id: 'a2' });
    expect(editWrite(trip(), valid({ kind: 'activity-note', activityId: 'a2', note: 'buy knives at Aritsugu' })))
      .toEqual({ type: 'note', id: 'a2', note: 'buy knives at Aritsugu' });
    expect(editWrite(trip(), valid({ kind: 'activity-add', dayNumber: 2, activity: { title: 'Tea', startTime: '15:30', costAmount: 800 } })))
      .toEqual({ type: 'add', dayId: 'd2', activity: { title: 'Tea', startTime: '15:30', costAmount: 800, costCurrency: 'JPY', timeSlot: 'afternoon' } });
  });

  it('writes a changed cost in the trip currency and leaves an untouched cost alone', () => {
    const same = valid({ kind: 'activity-modify', activityId: 'a2', activity: { startTime: '20:00', costAmount: 9000 } });
    expect(editWrite(trip(), same)).toEqual({ type: 'update', id: 'a2', updates: { startTime: '20:00' } });
    const changed = valid({ kind: 'activity-modify', activityId: 'a2', activity: { title: 'Ramen', costAmount: 1200 } });
    expect(editWrite(trip(), changed).updates).toEqual({ title: 'Ramen', costAmount: 1200, costCurrency: 'JPY' });
  });

  it('is null when the trip no longer has the stop or the day', () => {
    const edit = valid({ kind: 'activity-note', activityId: 'a2', note: 'x' });
    const gone = trip();
    gone.itinerary_days[0].activities.pop();
    expect(editWrite(gone, edit)).toBeNull();
    expect(editWrite(trip(), { kind: 'activity-add', dayNumber: 9, activity: { title: 'x' } })).toBeNull();
    expect(editWrite(trip(), { kind: 'nonsense' })).toBeNull();
  });
});

describe('applyExtrasEdit: stays and flights', () => {
  it('marks a stay as booked with what was given, keeping the rest', () => {
    const before = trip().extras;
    const edit = valid({ kind: 'stay-book', stayIndex: 0, stay: { bookingRef: '12345', checkIn: '2027-03-03', checkOut: '2027-03-06', address: '1 Station Rd' } });
    const after = applyExtrasEdit(before, edit);
    expect(after.accommodation[0]).toEqual({ ...before.accommodation[0], booked: true, bookingRef: '12345', checkIn: '2027-03-03', checkOut: '2027-03-06', address: '1 Station Rd' });
    expect(after.accommodation[1]).toBe(before.accommodation[1]);
    expect(after.photoCredits).toBe(before.photoCredits);
    expect(before.accommodation[0].booked).toBe(false);
  });

  it('adds and removes a note on a stay', () => {
    const noted = applyExtrasEdit(trip().extras, valid({ kind: 'stay-note', stayIndex: 1, note: 'check-in is after 3 PM' }));
    expect(noted.accommodation[1].note).toBe('check-in is after 3 PM');
    const cleared = applyExtrasEdit(noted, { kind: 'stay-note', stayIndex: 1, stayName: 'Ryokan Yoshida', note: '' });
    expect(cleared.accommodation[1]).not.toHaveProperty('note');
    expect(cleared.accommodation[1].bookingRef).toBe('RY-1');
  });

  it('replaces an unbooked stay in the stored stay shape, keeping its city and dates', () => {
    const edit = valid({ kind: 'stay-replace', stayIndex: 0, stay: { name: 'Park Hyatt Kyoto', area: 'Higashiyama', type: 'Hotel', priceRange: 'JPY 90,000 per night', highlights: 'Quiet and close to Gion' } });
    expect(applyExtrasEdit(trip().extras, edit).accommodation[0]).toEqual({
      name: 'Park Hyatt Kyoto', area: 'Higashiyama', type: 'Hotel', city: 'Kyoto', priceRange: 'JPY 90,000 per night',
      highlights: 'Quiet and close to Gion', badge: '', checkIn: '', checkOut: '', booked: false, url: '', bookingRef: '', address: '',
    });
  });

  it('leaves a booked stay alone unless the traveller said to replace it', () => {
    const replace = { kind: 'stay-replace', stayIndex: 1, stayName: 'Ryokan Yoshida', stay: { name: 'Park Hyatt Kyoto' } };
    expect(applyExtrasEdit(trip().extras, replace)).toBeNull();
    const forced = applyExtrasEdit(trip().extras, { ...replace, overrideBooked: true });
    expect(forced.accommodation[1]).toMatchObject({ name: 'Park Hyatt Kyoto', booked: false, bookingRef: '', checkIn: '2027-03-01' });
    const byRef = { accommodation: [{ name: 'Ryokan Yoshida', booked: false, bookingRef: 'RY-1' }] };
    expect(applyExtrasEdit(byRef, { ...replace, stayIndex: 0 })).toBeNull();
  });

  it('declines when the stay has moved or gone', () => {
    const edit = valid({ kind: 'stay-book', stayIndex: 0, stay: { bookingRef: '1' } });
    const moved = { accommodation: trip().extras.accommodation.slice(1) };
    expect(applyExtrasEdit(moved, edit)).toBeNull();
    expect(applyExtrasEdit(null, edit)).toBeNull();
    expect(editWrite({ ...trip(), extras: moved }, edit)).toBeNull();
  });

  it('adds a booked stay, also to a trip without stays', () => {
    const edit = valid({ kind: 'stay-add', stay: { name: 'Ace Hotel Kyoto', bookingRef: 'ACE9', checkIn: '2027-03-03', checkOut: '2027-03-04', booked: true } });
    const after = applyExtrasEdit({}, edit);
    expect(after.accommodation).toEqual([{
      name: 'Ace Hotel Kyoto', area: '', type: '', city: '', priceRange: '', highlights: '', badge: 'Pre-booked',
      checkIn: '2027-03-03', checkOut: '2027-03-04', booked: true, url: '', bookingRef: 'ACE9', address: '',
    }]);
    expect(applyExtrasEdit(trip().extras, edit).accommodation).toHaveLength(3);
  });

  it('marks the suggested flight as booked, and clears the suggestion when another flight was booked', () => {
    const same = applyExtrasEdit(trip().extras, valid({ kind: 'flight-book', flight: { leg: 'outbound', flightNumber: 'sq 622', bookingRef: 'ABC123', depart: '1 Mar 2027, 01:25' } }));
    expect(same.flights.outbound).toMatchObject({ booked: true, bookingRef: 'ABC123', route: 'SIN > KIX', duration: '6h 30m', depart: '1 Mar 2027, 01:25' });
    const other = applyExtrasEdit(trip().extras, valid({ kind: 'flight-book', flight: { leg: 'outbound', airline: 'ANA', flightNumber: 'NH 842', bookingRef: 'Z9' } }));
    expect(other.flights.outbound).toMatchObject({ airline: 'ANA', flightNumber: 'NH 842', route: 'SIN > KIX', duration: '', priceRange: '', tips: '', booked: true });
    const fresh = applyExtrasEdit(trip().extras, valid({ kind: 'flight-book', flight: { leg: 'inbound', flightNumber: 'SQ 623', route: 'KIX > SIN' } }));
    expect(fresh.flights.inbound).toMatchObject({ route: 'KIX > SIN', flightNumber: 'SQ 623', booked: true, manageUrl: '' });
    expect(fresh.flights.outbound.flightNumber).toBe('SQ 622');
  });

  it('runs through editWrite as a change on fresh extras', () => {
    const w = editWrite(trip(), valid({ kind: 'stay-note', stayIndex: 0, note: 'ask for a high floor' }));
    expect(w.type).toBe('extras');
    expect(w.change(trip().extras).accommodation[0].note).toBe('ask for a high floor');
    expect(w.change({ accommodation: [] })).toBeNull();
  });
});

describe('proposalText and choiceText', () => {
  const say = (edit) => proposalText(valid(edit), trip());

  it('says each kind in plain words', () => {
    expect(say({ kind: 'activity-note', activityId: 'a1', note: 'buy knives at Aritsugu' })).toBe('Add note to Nishiki Market: buy knives at Aritsugu');
    expect(say({ kind: 'activity-note', activityId: 'a1', note: '' })).toBe('Remove the note on Nishiki Market');
    expect(say({ kind: 'activity-note', activityId: 'a3', note: 'go at 15:00' })).toBe('Add note to Kinkaku-ji: go at 3:00 PM');
    expect(say({ kind: 'activity-add', dayNumber: 2, activity: { title: 'Tea at Ippodo', startTime: '15:30' } })).toBe('Add to day 2: Tea at Ippodo at 3:30 PM');
    expect(say({ kind: 'activity-remove', activityId: 'a2' })).toBe('Remove Dinner from day 1');
    expect(say({ kind: 'activity-modify', activityId: 'a2', activity: { title: 'Dinner', startTime: '20:00' } })).toBe('Move Dinner on day 1 to 8:00 PM');
    expect(say({ kind: 'activity-modify', activityId: 'a2', activity: { title: 'Ramen at Ichiran', startTime: '19:00' } })).toBe('Change Dinner on day 1 to Ramen at Ichiran at 7:00 PM');
    expect(say({ kind: 'activity-modify', activityId: 'a2', activity: { description: 'x' } })).toBe('Update Dinner on day 1');
    expect(say({ kind: 'stay-book', stayIndex: 0, stay: { bookingRef: '12345', checkIn: '2027-03-03', checkOut: '2027-03-06' } }))
      .toBe('Mark Hotel Granvia as booked, confirmation 12345, 3 Mar to 6 Mar');
    expect(say({ kind: 'stay-book', stayIndex: 0 })).toBe('Mark Hotel Granvia as booked');
    expect(say({ kind: 'stay-add', stay: { name: 'Ace Hotel', booked: true, bookingRef: 'ACE9' } })).toBe('Add Ace Hotel as a booked stay, confirmation ACE9');
    expect(say({ kind: 'stay-add', stay: { name: 'Ace Hotel', area: 'Nakagyo', priceRange: 'JPY 40,000 per night' } })).toBe('Add Ace Hotel as a stay option, Nakagyo, JPY 40,000 per night');
    expect(say({ kind: 'stay-replace', stayIndex: 0, stay: { name: 'Park Hyatt', area: 'Higashiyama', priceRange: 'JPY 90,000 per night' } }))
      .toBe('Replace Hotel Granvia with Park Hyatt, Higashiyama, JPY 90,000 per night');
    expect(say({ kind: 'stay-replace', stayIndex: 1, overrideBooked: true, stay: { name: 'Park Hyatt' } })).toBe('Replace your booked stay Ryokan Yoshida with Park Hyatt');
    expect(say({ kind: 'stay-note', stayIndex: 1, note: 'check-in is after 3 PM' })).toBe('Add note to Ryokan Yoshida: check-in is after 3 PM');
    expect(say({ kind: 'flight-book', flight: { leg: 'outbound', flightNumber: 'SQ 622', bookingRef: 'ABC123', depart: '1 Mar 2027, 01:25' } }))
      .toBe('Mark the outbound flight SQ 622 as booked, reference ABC123, departs 1 Mar 2027, 1:25 AM');
  });

  it('keeps every sentence free of dashes, middle dots, bullets and ellipses', () => {
    for (const edit of [
      { kind: 'activity-note', activityId: 'a1', note: 'tea – two tins … maybe' },
      { kind: 'stay-replace', stayIndex: 0, stay: { name: 'Park Hyatt', priceRange: 'JPY 90,000 – 120,000' } },
      { kind: 'stay-book', stayIndex: 0, stay: { checkIn: '2027-03-03', checkOut: '2027-03-06' } },
    ]) expect(say(edit)).not.toMatch(AI_GLYPHS);
  });

  it('names a choice by venue, day and time, or by stay and area', () => {
    expect(choiceText({ activityId: 'a1' }, trip())).toBe('Nishiki Market on day 1 at 10:00 AM');
    expect(choiceText({ activityId: 'a3' }, trip())).toBe('Kinkaku-ji on day 2 at 9:00 AM');
    expect(choiceText({ stayIndex: 0 }, trip())).toBe('Hotel Granvia, Kyoto Station');
    expect(choiceText({ activityId: 'zz' }, trip())).toBe('');
  });
});
