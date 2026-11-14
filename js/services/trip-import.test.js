import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  validateTripImport, extractJson, symbolForCurrency, IMPORT_LIMITS,
} from './trip-import.js';

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

const json = (obj) => JSON.stringify(obj, null, 2);
const check = (obj) => validateTripImport(typeof obj === 'string' ? obj : json(obj));
const messages = (list) => list.map(i => i.message);
const firstError = (obj) => check(obj).errors[0]?.message;
const parse = (obj) => {
  const r = check(obj);
  expect(r.errors).toEqual([]);
  return r.data;
};

describe('validateTripImport', () => {
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
    expect(check('{nope').ok).toBe(false);
    expect(firstError('{"trip": {"title" "x"}}')).toMatch(/formatting problem/);
    expect(firstError({ hello: 1 })).toMatch(/doesn't look like a Trippy trip/);
    expect(firstError('just some notes, no data')).toMatch(/couldn't find any trip data/);
    expect(firstError('   ')).toMatch(/Paste your trip/);
  });

  it('rejects oversize input, counting bytes rather than characters', () => {
    const huge = ' '.repeat(IMPORT_LIMITS.maxBytes + 1);
    expect(firstError(huge)).toMatch(/larger than 1 MB/);
    const b = base();
    b.trip.subtitle = 'é'.repeat(Math.ceil(IMPORT_LIMITS.maxBytes / 2)); // under 1M characters, over 1 MB
    expect(json(b).length).toBeLessThan(IMPORT_LIMITS.maxBytes);
    expect(firstError(b)).toMatch(/larger than 1 MB/);
  });

  it('requires a destination name and valid, ordered dates', () => {
    const noDest = base(); noDest.trip.destination = {};
    expect(firstError(noDest)).toMatch(/destination/);
    const badDate = base(); badDate.trip.startDate = '2027-02-30';
    expect(firstError(badDate)).toMatch(/start date "2027-02-30" needs to look like 2027-01-13/);
    const reversed = base(); reversed.trip.endDate = '2027-01-01';
    expect(firstError(reversed)).toMatch(/end date 1 Jan 2027 is before the start date 13 Jan 2027/);
  });

  it('accepts a destination given as a plain string', () => {
    const b = base(); b.trip.destination = 'Sapporo';
    expect(parse(b).wizardState.destination.name).toBe('Sapporo');
  });

  it('requires days with unique day numbers and titled activities', () => {
    const noDays = base(); noDays.days = [];
    expect(firstError(noDays)).toMatch(/at least one day/);
    const dup = base(); dup.days[1].dayNumber = 1;
    expect(firstError(dup)).toMatch(/Day 1 appears more than once/);
    const untitled = base(); untitled.days[0].activities[0].title = '  ';
    expect(firstError(untitled)).toMatch(/Day 1, activity 1: add a title/);
  });

  it('rejects day dates outside the trip', () => {
    const b = base(); b.days[0].date = '2027-03-01';
    expect(firstError(b)).toMatch(/Day 1: 1 Mar 2027 is outside the trip \(13 Jan to 14 Jan 2027\)/);
  });

  it('enforces day and activity limits', () => {
    const many = base();
    many.days[0].activities = Array.from({ length: IMPORT_LIMITS.maxActivitiesPerDay + 1 }, (_, i) => ({ title: `a${i}` }));
    expect(firstError(many)).toMatch(/Day 1 has 41 activities. The limit is 40 per day/);
    const long = base();
    long.days = Array.from({ length: IMPORT_LIMITS.maxDays + 1 }, (_, i) => ({ dayNumber: i + 1 }));
    expect(firstError(long)).toMatch(/up to 60 days. This one has 61/);
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
    expect(messages(check(b).warnings).join('\n')).toMatch(/Ignored fields we don't use: secrets, evil\./);
  });
});

describe('finding the trip data in pasted text', () => {
  it('reads a fenced reply with text around it', () => {
    const reply = `Here is your Trippy import file:\n\n\`\`\`json\n${json(base())}\n\`\`\`\n\nLet me know if you want changes to {anything}!`;
    const r = check(reply);
    expect(r.ok).toBe(true);
    expect(r.summary).toMatchObject({ days: 2, activities: 1 });
  });

  it('reads JSON with prose around it and no fences, and strips a BOM', () => {
    expect(check(`Sure! ${json(base())}\nEnjoy the trip.`).ok).toBe(true);
    expect(check(`\uFEFF${json(base())}`).ok).toBe(true);
  });

  it('imports the docs example (jsonc with // comments) unchanged', () => {
    const doc = readFileSync(new URL('../../docs/trip-import-format.md', import.meta.url), 'utf8');
    const block = /```jsonc\n([\s\S]*?)\n```/.exec(doc)[1];
    expect(block).toContain('//');
    const r = check(block);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.data.itinerary.accommodation[0]).toMatchObject({ bookingRef: 'HX55821', address: 'Minami 4 Nishi 4, Chuo Ward, Sapporo' });
    expect(check(doc).ok).toBe(true); // the whole markdown file pasted
  });

  it('accepts trailing commas, block comments and curly quotes', () => {
    const text = json(base())
      .replace('"trippy": 1,', '"trippy": 1, /* format */')
      .replace('"title": "Maruyama",', '“title”: “Maruyama”,')
      .replace('"activities": []\n    }\n  ]', '"activities": [],\n    },\n  ],');
    const r = check(text);
    expect(r.ok).toBe(true);
    expect(r.data.itinerary.days[1].title).toBe('Maruyama');
  });

  it('keeps curly quotes inside a normal string', () => {
    const b = base();
    b.days[0].activities[0].tips = 'Ask for the “house” sauce';
    expect(check(b).data.itinerary.days[0].activities[0].tips).toBe('Ask for the “house” sauce');
  });

  it('accepts a missing trippy key and "1", and refuses newer versions', () => {
    const noKey = base(); delete noKey.trippy;
    expect(check(noKey).ok).toBe(true);
    const asString = base(); asString.trippy = '1';
    expect(check(asString).ok).toBe(true);
    const newer = base(); newer.trippy = 2;
    expect(messages(check(newer).errors)).toEqual(['This file was made for a newer version of Trippy (format 2). Update the app and try again.']);
    const noDays = base(); delete noDays.trippy; delete noDays.days;
    expect(check(noDays).errors[0].code).toBe('notTrippy');
  });

  it('reports a truncated reply as cut off, not as a syntax error', () => {
    const cut = `\`\`\`json\n${json(base()).slice(0, 250)}`;
    const r = check(cut);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([{ where: '', code: 'cutOff', message: expect.stringMatching(/cut off at the end/) }]);
    expect(check(json(base()).slice(0, 120)).errors[0].code).toBe('cutOff');
  });

  it('reports an odd quote in complete data as a syntax error with its line, not as cut off', () => {
    const typo = json(base()).replace('"title": "Arrive",', '"title": "Arrive" day",');
    const line = typo.split('\n').findIndex(l => l.includes('"Arrive" day"')) + 1;
    const fenced = check(`\`\`\`json\n${typo}\n\`\`\``);
    expect(fenced.errors[0].code).toBe('syntax');
    expect(fenced.errors[0].message).toMatch(new RegExp(`^There is a formatting problem on line ${line + 1}, column \\d+\\.`));
    const unfenced = check(`${typo}\nEnjoy the trip.`);
    expect(unfenced.errors[0].code).toBe('syntax');
    expect(unfenced.errors[0].message).toMatch(new RegExp(`on line ${line},`));
  });

  it('reports a missing last brace inside a closed fence as a syntax error', () => {
    const missing = json(base()).replace(/\n\}$/, '');
    expect(missing.endsWith(']')).toBe(true);
    expect(check(`\`\`\`json\n${missing}\n\`\`\``).errors[0].code).toBe('syntax');
    expect(check(missing).errors[0].code).toBe('cutOff'); // no closing fence: it may really be cut off
  });

  it('joins a cut-off reply and its continuation, even with an unclosed fence', () => {
    const full = json(base());
    const at = full.indexOf('Jingisukan') + 4; // mid-string, as a real cut-off would be
    const pasted = `Here is your file:\n\`\`\`json\n${full.slice(0, at)}\n\nHere is the rest:\n\`\`\`json\n${full.slice(at)}\n\`\`\``;
    const r = check(pasted);
    expect(r.ok).toBe(true);
    expect(r.data.itinerary.days[0].activities[0].title).toBe('Jingisukan at Daruma');
  });

  it('reports a syntax error with the line and column the user sees', () => {
    const text = `Here you go:\n\`\`\`json\n${json(base()).replace('"title": "Arrive",', '"title": "Arrive"')}\n\`\`\``;
    const r = check(text);
    const line = text.split('\n').findIndex(l => l.includes('"title": "Arrive"')) + 2; // the next line, 1-based
    expect(r.errors[0].code).toBe('syntax');
    expect(r.errors[0].message).toBe(`There is a formatting problem on line ${line}, column 7. A comma, quote or bracket is missing near: "activities": [`);
  });

  it('exposes extractJson for the raw value', () => {
    expect(extractJson('```json\n{"a": 1,}\n```').value).toEqual({ a: 1 });
    expect(extractJson('nothing here').code).toBe('noData');
  });
});

describe('collecting problems', () => {
  it('collects several errors in one pass, each with its location', () => {
    const b = base();
    b.trip.title = '';
    b.days[0].activities[0].title = '';
    b.days[1].date = '2027-13-01';
    const r = check(b);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([
      { where: 'Trip', message: 'Add a title, for example "Hokkaido in Winter".' },
      { where: 'Day 1', message: 'Day 1, activity 1: add a title.' },
      { where: 'Day 2', message: 'Day 2: the date "2027-13-01" needs to look like 2027-01-13.' },
    ]);
  });

  it('reads 7:30 PM as 19:30 with a warning, and blanks non-times', () => {
    const b = base();
    b.days[0].activities = [
      { title: 'Dinner', startTime: '7:30 PM' },
      { title: 'Show', startTime: '7pm' },
      { title: 'Bar', startTime: '21:15:00' },
      { title: 'Walk', startTime: 'after lunch' },
      { title: 'Breakfast', startTime: '7:05' },
    ];
    const r = check(b);
    expect(r.data.itinerary.days[0].activities.map(a => a.startTime)).toEqual(['19:30', '19:00', '21:15', '', '07:05']);
    expect(r.data.itinerary.days[0].activities[0].timeSlot).toBe('evening');
    expect(messages(r.warnings)).toEqual(expect.arrayContaining([
      'Day 1, activity 1: read the start time "7:30 PM" as 19:30.',
      'Day 1, activity 4: "after lunch" is not a clock time, so the start time was left blank.',
    ]));
    expect(messages(r.warnings).some(m => m.includes('activity 5'))).toBe(false);
  });

  it('reads "¥7,000" as 7000 with a warning', () => {
    const b = base();
    b.days[0].activities = [
      { title: 'Dinner', costAmount: '¥7,000' },
      { title: 'Taxi', costAmount: 'S$1,700 for two', costCurrency: 'sgd' },
      { title: 'Museum', costAmount: '3000' },
    ];
    const r = check(b);
    const acts = r.data.itinerary.days[0].activities;
    expect(acts.map(a => a.costAmount)).toEqual([7000, 1700, 3000]);
    expect(acts[1].costCurrency).toBe('SGD');
    expect(messages(r.warnings)).toContain('Day 1, activity 1: read the cost "¥7,000" as 7000 JPY.');
    expect(messages(r.warnings).some(m => m.includes('activity 3'))).toBe(false);
  });

  it('refuses numbers too large for the database, so they can go in a fix request', () => {
    const b = base();
    b.trip.dailyBudget = 1e13;
    b.days[0].activities = [
      { title: 'Ride', costAmount: 1e12, durationMinutes: 1e15 },
      { title: 'Taxi', costAmount: '¥7,000,000,000,000' },
      { title: 'Museum', costAmount: 2_147_483_647, durationMinutes: '90' },
    ];
    const r = check(b);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([
      { where: 'Trip', message: 'The daily budget "10000000000000" is too large.' },
      { where: 'Day 1', message: 'Day 1, activity 1: the duration "1000000000000000" is too long.' },
      { where: 'Day 1', message: 'Day 1, activity 1: the cost "1000000000000" is too large.' },
      { where: 'Day 1', message: 'Day 1, activity 2: the cost "¥7,000,000,000,000" is too large.' },
    ]);
    expect(r.errors.every(e => !e.code)).toBe(true);
  });

  it('refuses a day number far beyond any trip without counting up to it', () => {
    const b = base();
    b.days[1].dayNumber = 3e9;
    expect(check(b).errors).toEqual([{ where: 'Trip', message: 'Day 3000000000 is too high. Number the days from 1, up to 366.' }]);
  });

  it('gives a dateless day a date from the trip start, with a warning', () => {
    const r = check(base());
    expect(r.data.itinerary.days[1].date).toBe('2027-01-14');
    expect(messages(r.warnings)).toContain('Day 2 had no date, so we set it to Thu 14 Jan.');
  });

  it('reports a dateless day past the end of the trip as an error', () => {
    const b = base();
    b.days.push({ dayNumber: 3, title: 'Extra' });
    expect(check(b).errors).toEqual([{ where: 'Day 3', message: 'Day 3 is after the trip ends. The trip has 2 days (13 Jan to 14 Jan).' }]);
  });

  it('shifts zero-based day numbers and never invents a duplicate', () => {
    const zero = base();
    zero.days[0].dayNumber = 0;
    zero.days[1].dayNumber = 1;
    const r = check(zero);
    expect(r.ok).toBe(true);
    expect(r.data.itinerary.days.map(d => d.dayNumber)).toEqual([1, 2]);
    const missing = base();
    missing.days = [{ title: 'No number' }, { dayNumber: 1, title: 'One' }];
    const m = check(missing);
    expect(m.ok).toBe(true);
    expect(m.data.itinerary.days.map(d => [d.dayNumber, d.title])).toEqual([[1, 'One'], [2, 'No number']]);
  });

  it('drops empty flight legs with a warning', () => {
    const b = base();
    b.flights = { outbound: { route: 'SIN > CTS', flightNumber: 'TR892' }, inbound: {} };
    const r = check(b);
    expect(r.data.itinerary.flights).toEqual({ outbound: expect.objectContaining({ route: 'SIN > CTS' }), inbound: null });
    expect(messages(r.warnings)).toContain('Flights: the return flight has no route, so it was left out.');
    const none = base();
    none.flights = { outbound: {}, inbound: { airline: 'Scoot' } };
    expect(check(none).data.itinerary.flights).toBeUndefined();
    const empty = base();
    empty.flights = [];
    expect(check(empty).data.itinerary.flights).toBeUndefined();
  });

  it('keeps stay booking references and addresses, shortening long references', () => {
    const b = base();
    b.hotels = [{ name: 'Randor', bookingRef: 'R'.repeat(45), address: '1 Main St', checkIn: '2027-01-14', checkOut: '2027-01-13' }];
    const r = check(b);
    expect(r.data.itinerary.accommodation[0]).toMatchObject({ bookingRef: 'R'.repeat(40), address: '1 Main St', checkIn: '', checkOut: '' });
    expect(messages(r.warnings)).toEqual(expect.arrayContaining([
      'We read "hotels" as "accommodation".',
      'Hotel 1: check-out is before check-in, so its dates were left out.',
      `Booking reference "${'R'.repeat(45)}" was shortened to 40 characters.`,
    ]));
  });

  it('maps common aliases for lists and titles', () => {
    const b = base();
    b.itinerary = b.days;
    delete b.days;
    b.itinerary[0].items = [{ name: 'Lunch' }];
    delete b.itinerary[0].activities;
    const r = check(b);
    expect(r.ok).toBe(true);
    expect(r.data.itinerary.days[0].activities[0].title).toBe('Lunch');
    expect(messages(r.warnings)).toEqual(expect.arrayContaining([
      'We read "itinerary" as "days".', 'We read "items" as "activities".', 'We read "name" as "title".',
    ]));
  });

  it('accepts the template rule of an explicit empty day without a warning', () => {
    const r = check(base());
    expect(messages(r.warnings).some(m => m.includes('no activities'))).toBe(false);
    const b = base();
    delete b.days[1].activities;
    expect(messages(check(b).warnings)).toContain('Day 2 has no activities yet.');
  });
});

describe('destination details', () => {
  it('fills a known city: "Tokyo" resolves to JPY, ¥ and Asia/Tokyo', () => {
    const b = base();
    b.trip.destination = 'Tokyo';
    delete b.days[0].activities[0].costCurrency;
    const r = check(b);
    expect(r.data.wizardState.destination).toMatchObject({
      name: 'Tokyo', country: 'Japan', flag: 'jp', currencyCode: 'JPY', currencySymbol: '¥', timezone: 'Asia/Tokyo',
    });
    expect(r.data.wizardState.destination.lat).toBeCloseTo(35.68, 1);
    expect(r.data.wizardState.destination.image).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
    expect(r.data.itinerary.days[0].activities[0].costCurrency).toBe('JPY');
    expect(r.summary.destinationKnown).toBe(true);
    expect(messages(r.warnings)).toContain('No currency was given, so costs use JPY from Tokyo.');
  });

  it("uses the app's own symbols, and reads currency words", () => {
    expect(symbolForCurrency('SGD')).toBe('S$');
    expect(symbolForCurrency('AUD')).toBe('A$');
    const b = base();
    b.trip.destination = { name: 'Somewhere Small', currencyCode: 'yen' };
    const r = check(b);
    expect(r.data.wizardState.destination).toMatchObject({ currencyCode: 'JPY', currencySymbol: '¥' });
    expect(r.summary.destinationKnown).toBe(false);
  });

  it('falls back to USD with a warning when nothing is known', () => {
    const b = base();
    b.trip.destination = 'Somewhere Small';
    const r = check(b);
    expect(r.data.wizardState.destination).toMatchObject({ currencyCode: 'USD', currencySymbol: '$', timezone: null });
    expect(messages(r.warnings)).toContain('No currency was given, so costs are shown in USD.');
  });

  it('uses a destination record looked up by the caller', () => {
    const b = base();
    b.trip.destination = 'Hakodate';
    const record = { name: 'Hakodate', country: 'Japan', flag: 'jp', currencyCode: 'JPY', currencySymbol: '¥', timezone: 'Asia/Tokyo', lat: 41.77, lng: 140.73 };
    const r = validateTripImport(json(b), { destination: record });
    expect(r.data.wizardState.destination).toMatchObject({ currencyCode: 'JPY', timezone: 'Asia/Tokyo', lat: 41.77 });
    expect(r.summary.destinationKnown).toBe(true);
  });
});
