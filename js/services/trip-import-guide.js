// Content and pure helpers for the guided trip import (trip-import-modal.js):
// the AI prompt, the template file, the step copy, the "fix request" sent back
// to the assistant, and the numbers behind the "Check your trip" preview.
// No DOM, no network: unit-tested in trip-import-guide.test.js.

import { isoToUtc, stayInfo, deadlineInfo, isBookedLeg } from '../lib/trip-extras.js';

const DAY_MS = 86400000;

// Also offered as trippy-template.json. Must validate with no errors or warnings.
export const TEMPLATE = {
  trippy: 1,
  trip: {
    title: 'Hokkaido in Winter',
    subtitle: 'Snow, onsen and seafood',
    emoji: '❄️',
    destination: {
      name: 'Sapporo', country: 'Japan', flag: 'jp', currencyCode: 'JPY', currencySymbol: '¥',
      timezone: 'Asia/Tokyo', lat: 43.0618, lng: 141.3545,
    },
    startDate: '2027-01-13',
    endDate: '2027-01-15',
    travelers: 2,
    dailyBudget: 20000,
  },
  flights: {
    outbound: {
      route: 'SIN > CTS', airline: 'Scoot', flightNumber: 'TR892', depart: 'Wed 13 Jan 06:10', arrive: 'Wed 13 Jan 17:00',
      duration: '9h 50m', booked: true, bookingRef: 'ABC123', seats: '31A, 31B', baggage: '30kg each',
      priceRange: 'S$1,700 return for two', manageUrl: '',
    },
    inbound: {
      route: 'CTS > SIN', airline: 'Scoot', flightNumber: 'TR893', depart: 'Fri 15 Jan 18:40', arrive: 'Sat 16 Jan 01:20',
      duration: '8h 40m', booked: true, bookingRef: 'ABC123', seats: '', baggage: '30kg each', priceRange: '', manageUrl: '',
    },
  },
  accommodation: [
    {
      name: 'Example Hotel Susukino', area: 'Susukino', type: 'Hotel', city: 'Sapporo',
      address: 'Minami 4 Nishi 4, Chuo Ward, Sapporo', checkIn: '2027-01-13', checkOut: '2027-01-15',
      booked: true, bookingRef: 'HX55821', priceRange: '¥18,000 per night',
      highlights: 'Next to Susukino station, breakfast included', url: '',
    },
  ],
  bookingChecklist: [
    {
      group: 'Must Book Ahead',
      items: [{ label: 'Jozankei onsen day pass', by: '2026-12-20', day: 2, note: 'Sells out on weekends', url: '' }],
    },
  ],
  days: [
    {
      dayNumber: 1, date: '2027-01-13', title: 'Arrive in Sapporo', theme: 'Arrival', activities: [
        {
          title: 'Check in', timeSlot: 'evening', startTime: '18:00', category: 'check-in',
          venueName: 'Example Hotel Susukino', venueAddress: 'Susukino, Chuo Ward, Sapporo', durationMinutes: 30,
        },
        {
          title: 'Lamb barbecue dinner', timeSlot: 'evening', startTime: '19:30', category: 'food',
          venueName: 'Daruma Honten', venueAddress: 'Minami 5 Nishi 4, Chuo Ward, Sapporo', durationMinutes: 75,
          costAmount: 7000, costCurrency: 'JPY', costNote: 'for two', tips: 'No reservations, queue from 18:30',
        },
      ],
    },
    {
      dayNumber: 2, date: '2027-01-14', title: 'Jozankei day trip', activities: [
        {
          title: 'Onsen afternoon', timeSlot: 'afternoon', startTime: '13:00', category: 'wellness',
          venueName: 'Jozankei Onsen', venueAddress: 'Jozankei, Minami Ward, Sapporo', durationMinutes: 180,
          description: 'Hot spring town in the mountains, about an hour from the city by bus.',
          costAmount: 3000, costCurrency: 'JPY', bookingUrl: '',
        },
      ],
    },
    { dayNumber: 3, date: '2027-01-15', title: 'Fly home', activities: [] },
  ],
};

export const TEMPLATE_JSON = JSON.stringify(TEMPLATE, null, 2);

export const AI_PROMPT = `I want to import my trip into a travel app called Trippy. Read everything I give you after this message (booking confirmation emails, notes, documents, screenshots) and turn it into one Trippy import file.

Follow these rules exactly:
1. Reply with only the JSON, inside one \`\`\`json code block. No other text, and no comments inside the JSON.
2. Use only the keys shown in the template below, with the same spelling and nesting. Leave out a key when you don't know its value. Never invent bookings, booking references, prices, times, addresses or links.
3. Write dates as YYYY-MM-DD and times as 24 hour HH:MM, for example 19:30.
4. Write money as a whole number without currency symbols or commas, for example 7000, and put the 3 letter currency code (for example JPY, SGD, EUR) in the matching currency field.
5. Set "booked" to true only when I gave you a confirmation for it, and copy booking references exactly as written.
6. Add one entry to "days" for every date from startDate to endDate, numbered from 1, each with its "date". If nothing is planned for a day, give it an empty "activities" list.
7. List activities in the order they happen. Every activity needs a short "title". Add "venueName" and "venueAddress" whenever you can, so the app can find photos and maps. Keep "description" and "tips" under 200 characters.
8. "timeSlot" is "morning" (before 12:00), "afternoon" (12:00 to 17:59) or "evening" (18:00 or later).
9. "category" is one of: food, cafe, culture, museum, art, nature, park, shopping, market, sightseeing, entertainment, nightlife, wellness, beach, adventure, walking tour, transport, flight, check-in, check-out.
10. Put flights in "flights": "outbound" is the first flight of the trip and "inbound" is the flight home. Write "route" as airport codes joined by " > ", for example "SIN > TPE > CTS".
11. Put every place I sleep in "accommodation" with its "checkIn" and "checkOut" dates, and its "city" if the trip has more than one city. Include "bookingRef" and "address" when the confirmation shows them.
12. Put deadlines (book by, pay by, free cancellation until) in "bookingChecklist", with the date in "by".
13. "destination" is the main city of the trip. Give "lat" and "lng" only if you are sure. "dailyBudget" is my spending budget per person per day in the destination currency; leave it out if I didn't give one.
14. Do not include passport numbers, card numbers or phone numbers.
15. If your reply gets cut off, I will type continue. Then carry on from the exact character where you stopped, in a new \`\`\`json code block, without repeating anything.

Template:
${TEMPLATE_JSON}

My trip information:
`;

// Step 1 "What to collect": [lead-in, detail].
export const GATHER_ITEMS = [
  ['Flight confirmation emails.', 'Flight numbers, route, departure and arrival times, booking reference, seats and baggage.'],
  ['Hotel or rental confirmations.', 'Name, area or address, check-in and check-out dates, confirmation number and free cancellation date.'],
  ['Tours, tickets and restaurant bookings.', 'Date, start time, venue, price and booking link.'],
  ['Your plan.', 'A doc, note, spreadsheet or chat with your day by day ideas.'],
  ['Things you still need to book.', 'Anything with a book by date, like a ryokan or a popular restaurant.'],
];

// Step 1 "Make sure it includes".
export const INCLUDE_CHIPS = [
  'Trip dates', 'Main city and country', 'Number of travelers', 'Flights both ways', 'Every hotel night',
  'Daily activities with times', 'Venue names and addresses', 'Costs and currency', 'Booking deadlines',
];

// Step 2 "Good to know": [lead-in, detail].
export const GOOD_TO_KNOW = [
  ['Long trip?', 'If the reply stops partway, type continue. Then paste both parts into Trippy together.'],
  ['PDFs and screenshots work too.', 'Attach them in the same chat.'],
  ['Prefer to write it yourself?', 'Start from the template.'],
];

export const FIX_REQUEST_INTRO = 'Your Trippy file has these problems. Please fix them and send the complete file again as JSON only, in one code block:';

/**
 * A numbered list of problems to paste back into the AI chat.
 * @param {{ where: string, message: string }[]} errors
 * @returns {string}
 */
export function buildFixRequest(errors) {
  const lines = (errors || []).map(({ where, message }, i) => {
    const text = !where || message.startsWith(where) ? message : `${where}: ${message}`;
    return `${i + 1}. ${text}`;
  });
  return [FIX_REQUEST_INTRO, '', ...lines].join('\n');
}

// "SIN > TPE > CTS" (or arrows) as "SIN to TPE to CTS".
export function routeText(route) {
  return String(route || '').split(/\s*(?:->|>|→|➔)\s*/).filter(Boolean).join(' to ');
}

/**
 * The numbers behind the "Check your trip" preview. Formatting (dates,
 * currency symbols) is left to the caller.
 * @param {{ wizardState: object, itinerary: object }} data validateTripImport(...).data
 * @param {Date} [today]
 */
export function buildImportSummary({ wizardState, itinerary }, today = new Date()) {
  const dest = wizardState.destination || {};
  const days = itinerary.days || [];
  const start = wizardState.dates?.start || '';
  const end = wizardState.dates?.end || '';
  const startUtc = isoToUtc(start);
  const endUtc = isoToUtc(end);

  const legs = [['Outbound', itinerary.flights?.outbound], ['Return', itinerary.flights?.inbound]]
    .filter(([, leg]) => leg)
    .map(([label, leg]) => ({
      label,
      route: routeText(leg.route),
      airline: leg.airline,
      flightNumber: leg.flightNumber,
      booked: isBookedLeg(leg),
      bookingRef: leg.bookingRef,
    }));

  const stays = (itinerary.accommodation || []).map(a => ({
    name: a.name,
    checkIn: a.checkIn,
    checkOut: a.checkOut,
    nights: stayInfo(a.checkIn, a.checkOut)?.nights || 0,
    booked: Boolean(a.booked || a.bookingRef),
  }));

  const deadlines = (itinerary.bookingChecklist || [])
    .flatMap(g => g.items || [])
    .map(it => ({ by: it.by, info: deadlineInfo(it.by, today) }))
    .filter(d => d.info)
    .sort((a, b) => a.by.localeCompare(b.by));

  const totals = new Map();
  for (const day of days) {
    for (const a of day.activities) {
      if (a.costAmount > 0) totals.set(a.costCurrency, (totals.get(a.costCurrency) || 0) + a.costAmount);
    }
  }
  const costs = [...totals]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => (b.currency === dest.currencyCode) - (a.currency === dest.currencyCode));

  return {
    title: itinerary.tripTitle,
    emoji: dest.emoji || '',
    destination: dest.name || '',
    country: dest.country || '',
    start,
    end,
    tripDays: startUtc !== null && endUtc !== null ? Math.round((endUtc - startUtc) / DAY_MS) + 1 : days.length,
    travelers: wizardState.travelers || 1,
    dayCount: days.length,
    activityCount: days.reduce((n, d) => n + d.activities.length, 0),
    flights: { legs, booked: legs.filter(l => l.booked).length },
    stays: { list: stays, booked: stays.filter(s => s.booked).length },
    deadlines: {
      count: deadlines.length,
      earliest: deadlines[0]?.by || '',
      overdue: deadlines.filter(d => d.info.state === 'overdue').length,
    },
    costs,
    firstDays: days.slice(0, 5).map(d => ({
      dayNumber: d.dayNumber, date: d.date, title: d.title, activities: d.activities.length,
    })),
    moreDays: Math.max(0, days.length - 5),
  };
}
