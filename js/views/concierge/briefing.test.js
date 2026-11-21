// The sentences of the Concierge view: the dashboard briefing, the trip brief and the readiness line.
// Written before briefing.js. The briefing speaks about plans, never about where the user is.
import { describe, it, expect } from 'vitest';
import { DASHBOARD_FIXTURES, TRIP_FIXTURES } from '../fixtures/models.js';
import { briefingSentence, briefingReserve, tripBrief, readinessSentence } from './briefing.js';

const textOf = (parts) => parts.map((part) => part.text).join('');
const links = (parts) => parts.filter((part) => part.href).map((part) => [part.text, part.href]);
const D = DASHBOARD_FIXTURES;

/** A copy of a fixture with some top-level fields replaced: the fixtures are never changed. */
const withModel = (model, over) => ({ ...model, ...over });
const withNext = (model, over) => ({ ...model, next: { ...model.next, ...over } });
const readiness = (todo, done, pending = 0) => ({
  items: [], done, total: todo + done + pending, todo, pending, headline: '', perDevice: false, collapsed: false,
});

describe('briefingSentence', () => {
  it('returns parts with a text and an href, the greeting first', () => {
    const parts = briefingSentence(D.ready);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(typeof part.text).toBe('string');
      expect(typeof part.href).toBe('string');
    }
    expect(parts[0]).toEqual({ text: 'Good morning, Sam.', href: '', tone: 'greeting' });
  });

  it('nothing running: the next departure and what is left to settle', () => {
    const parts = briefingSentence(D.noLive);
    expect(textOf(parts)).toBe('Good morning, Sam. Marrakech and the Atlas foothills is 9 days away, with three things to settle first.');
    expect(links(parts)).toEqual([['Marrakech and the Atlas foothills is 9 days away', '#/trip/s-marrakech']]);
  });

  it('one plan running: the day of that plan, linked to today', () => {
    const parts = briefingSentence(D.ready);
    expect(textOf(parts)).toBe('Good morning, Sam. It is day 7 of 10 on Seville and the south. Marrakech and the Atlas foothills is 9 days away, with three things to settle first.');
    expect(links(parts)[0]).toEqual(['day 7 of 10 on Seville and the south', '#/trip/s-seville?today=1']);
  });

  it('two plans running: says so and names the lead', () => {
    const parts = briefingSentence(D.twoLive);
    expect(textOf(parts)).toBe('Good morning, Sam. Two plans are running today and Seville and the south is on day 7 of 10. Marrakech and the Atlas foothills is 9 days away, with three things to settle first.');
    expect(links(parts)[0]).toEqual(['Seville and the south is on day 7 of 10', '#/trip/s-seville?today=1']);
  });

  it('leaving tomorrow: the date and the one thing still open', () => {
    const one = { ...D.noLive.next.trip, daysToGo: 1, readiness: { ...readiness(1, 3), items: [{ label: 'Flights', status: 'Not booked yet', state: 'todo' }] } };
    const model = withModel(withNext(D.noLive, { trip: one, daysToGo: 1, departText: 'Thu 11 Mar 2027' }), { now: { ...D.noLive.now, partOfDay: 'evening' } });
    expect(textOf(briefingSentence(model))).toBe('Good evening, Sam. Marrakech and the Atlas foothills starts tomorrow, Thu 11 Mar. One thing is still open: flights, not booked yet.');
    const many = withNext(model, { trip: { ...one, readiness: readiness(3, 1) } });
    expect(textOf(briefingSentence(many))).toMatch(/starts tomorrow, Thu 11 Mar\. Three things are still open\.$/);
    const done = withNext(model, { trip: { ...one, readiness: readiness(0, 4) } });
    expect(textOf(briefingSentence(done))).toMatch(/starts tomorrow, Thu 11 Mar\. Everything is ready\.$/);
  });

  it('everything ready', () => {
    const model = withNext(D.noLive, { trip: { ...D.noLive.next.trip, readiness: readiness(0, 4) } });
    expect(textOf(briefingSentence(model))).toBe('Good morning, Sam. Marrakech and the Atlas foothills is 9 days away and everything is ready.');
  });

  it('one thing to settle is singular, and a running check adds no clause', () => {
    const one = withNext(D.noLive, { trip: { ...D.noLive.next.trip, readiness: readiness(1, 3) } });
    expect(textOf(briefingSentence(one))).toMatch(/is 9 days away, with one thing to settle first\.$/);
    const checking = withNext(D.noLive, { trip: { ...D.noLive.next.trip, readiness: readiness(0, 3, 1) } });
    expect(textOf(briefingSentence(checking))).toMatch(/is 9 days away\.$/);
  });

  it('nothing upcoming: the calendar is empty and the last plan is named, with its month', () => {
    const model = withModel(D.nothingUpcoming, { live: [], sections: { ...D.nothingUpcoming.sections, live: [] }, cardsById: Object.fromEntries(Object.entries(D.nothingUpcoming.cardsById).filter(([, card]) => card.phase !== 'live')) });
    const parts = briefingSentence(model);
    expect(textOf(parts)).toBe('Good morning, Sam. Nothing is on the calendar. Your last plan was Rome in November in November 2026.');
    expect(links(parts)).toEqual([['Rome in November', '#/trip/s-rome']]);
  });

  it('nothing upcoming while a plan runs', () => {
    expect(textOf(briefingSentence(D.nothingUpcoming))).toBe('Good morning, Sam. It is day 7 of 10 on Seville and the south. Nothing else is on the calendar.');
  });

  it('planning in progress: the plan and how far it is, then a short next clause', () => {
    expect(textOf(briefingSentence(D.generating))).toBe('Good morning, Sam. Trippy is still planning Dublin, 4 of 9 days so far. It is day 7 of 10 on Seville and the south. Marrakech and the Atlas foothills is 9 days away.');
    expect(textOf(briefingSentence(D.generatingNoDates))).toMatch(/Trippy is still planning Dublin, 4 days so far\./);
  });

  it('brand-new account', () => {
    expect(textOf(briefingSentence(D.empty))).toBe('Welcome, Sam. Nothing is planned yet. Tell Trippy where you would like to go and it will draft the days.');
    expect(briefingSentence(D.empty)[0].tone).toBe('greeting');
  });

  it('a load error keeps to the greeting', () => {
    expect(textOf(briefingSentence(D.error))).toBe('Good morning, Sam.');
  });

  it('reads the whole account, not the filtered lists', () => {
    expect(textOf(briefingSentence(D.filtered))).toBe(textOf(briefingSentence(D.ready)));
  });

  it('greets without a name, and by the part of the day', () => {
    const model = withModel(D.noLive, { user: { ...D.noLive.user, firstName: '' }, now: { ...D.noLive.now, partOfDay: 'afternoon' } });
    expect(briefingSentence(model)[0].text).toBe('Good afternoon.');
  });

  it('a pending briefing gives the short sentence, and the reserve holds room for the longest clause', () => {
    const model = D.briefingPending;
    expect(textOf(briefingSentence(model))).toBe('Good morning, Sam. It is day 7 of 10 on Seville and the south. Marrakech and the Atlas foothills is 9 days away.');
    expect(briefingReserve(model)).toBe('Good morning, Sam. It is day 7 of 10 on Seville and the south. Marrakech and the Atlas foothills is 9 days away, with three things to settle first.');
    expect(briefingReserve(D.ready)).toBe('');
    expect(briefingReserve(D.empty)).toBe('');
  });

  it('never says where the user is', () => {
    for (const model of Object.values(D)) {
      expect(textOf(briefingSentence(model))).not.toMatch(/you are in|you are at|you went|arrived/i);
    }
  });

  it('does not change its input', () => {
    const before = JSON.stringify(D.twoLive);
    briefingSentence(D.twoLive);
    expect(JSON.stringify(D.twoLive)).toBe(before);
  });
});

describe('tripBrief', () => {
  const T = TRIP_FIXTURES;
  it('builds one sentence from stored facts', () => {
    expect(tripBrief(T.upcoming)).toBe('Seven balanced days for two: food, history and markets, from Medina out to Ourika valley.');
  });
  it('takes three interests at most and maps the pace word', () => {
    const model = { ...T.upcoming, brief: { ...T.upcoming.brief, pace: 'Relaxed', interests: ['Museums', 'Nature', 'Photography', 'Food'] } };
    expect(tripBrief(model)).toBe('Seven unhurried days for two: museums, nature and photography, from Medina out to Ourika valley.');
  });
  it('gives an imported trip the short form with the place', () => {
    expect(tripBrief(T.imported)).toBe('Seven days in Marrakech for two.');
    expect(tripBrief({ ...T.imported, placeLine: '', title: 'Hong Kong', dates: { ...T.imported.dates, dayCount: 10 } })).toBe('Ten days in Hong Kong for two.');
  });
  it('leaves out what is not stored', () => {
    const base = { ...T.upcoming, travellers: null };
    expect(tripBrief({ ...base, brief: { pace: '', interests: ['Food'], areaCount: 0, firstArea: '', lastArea: '' } })).toBe('Seven days: food.');
    expect(tripBrief({ ...base, brief: { pace: 'Packed', interests: [], areaCount: 1, firstArea: 'Medina', lastArea: 'Medina' } })).toBe('Seven full days, around Medina.');
    expect(tripBrief({ ...T.upcoming, travellers: 1, brief: { pace: 'Active', interests: [], areaCount: 0, firstArea: '', lastArea: '' } })).toBe('Seven active days for one.');
  });
  it('names the cities of a plan across several cities, not the districts its stops fall in', () => {
    expect(tripBrief(T.multiCity)).toMatch(/, from Vienna to Budapest\.$/);
    expect(tripBrief(T.multiCity)).not.toContain('Medina');
    const oneCity = { ...T.multiCity, route: { ...T.multiCity.route, to: { ...T.multiCity.route.to, label: 'Vienna' } } };
    expect(tripBrief(oneCity)).toMatch(/, from Medina out to Ourika valley\.$/);
    const unnamed = { ...T.multiCity, route: { ...T.multiCity.route, from: { ...T.multiCity.route.from, label: '' } } };
    expect(tripBrief(unnamed)).toMatch(/, from Medina out to Ourika valley\.$/);
  });
  it('drops the word District from the end of an area name', () => {
    const brief = { ...T.upcoming.brief, firstArea: 'Central and Western District', lastArea: 'Yau Tsim Mong district' };
    expect(tripBrief({ ...T.upcoming, brief })).toMatch(/, from Central and Western out to Yau Tsim Mong\.$/);
    expect(tripBrief({ ...T.upcoming, brief: { ...brief, firstArea: 'District', lastArea: 'District' } })).toMatch(/, around District\.$/);
  });
  it('handles one day and long plans', () => {
    expect(tripBrief({ ...T.imported, dates: { ...T.imported.dates, dayCount: 1 } })).toBe('One day in Marrakech for two.');
    expect(tripBrief({ ...T.imported, dates: { ...T.imported.dates, dayCount: 14 } })).toBe('14 days in Marrakech for two.');
  });
});

describe('readinessSentence', () => {
  it('counts what is left and judges the time in hand', () => {
    expect(readinessSentence(readiness(3, 1), 100)).toBe('Three things to settle. With 100 days in hand, none of them is urgent.');
    expect(readinessSentence(readiness(1, 3), 9)).toBe('One thing to settle, with 9 days to go.');
    expect(readinessSentence(readiness(2, 2), 1)).toBe('Two things to settle before tomorrow.');
    expect(readinessSentence(readiness(2, 2), null)).toBe('Two things to settle.');
  });
  it('says when all is done or a check is still running', () => {
    expect(readinessSentence(readiness(0, 4), 30)).toBe('Everything is settled.');
    expect(readinessSentence(readiness(0, 3, 1), 30)).toBe('Nothing to settle so far. One check is still running.');
    expect(readinessSentence(null, 30)).toBe('');
  });
});
