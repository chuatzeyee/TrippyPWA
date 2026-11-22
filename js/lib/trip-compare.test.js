import { describe, it, expect } from 'vitest';
import { comparisonOf, compareInputs, buildComparison, nameKey, activityCopy, orphanComparisons } from './trip-compare.js';
import { compareInputError, buildCompareWizardState } from '../wizard/compare-state.js';
import { comparePageHtml, compareEntryHtml } from '../components/trip-compare-html.js';

// An invented pair of plans for a weekend in Porto.
const stop = (id, start_time, title, extra = {}) => ({ id, start_time, title, venue_name: title, category: 'culture', cost_amount: 0, cost_currency: 'EUR', ...extra });
const mine = {
  id: 'imp-1', user_id: 'u1', title: 'Porto weekend', start_date: '2027-03-06', end_date: '2027-03-07', travelers: 2, budget_daily: 0,
  budget_currency: 'EUR', budget_currency_symbol: '€',
  wizard_state: { imported: true, destination: { name: 'Porto', currencyCode: 'EUR', currencySymbol: '€', budgetRange: { comfortable: 130 } }, passports: ['sg'], dates: {}, budget: { dailyAmount: 0 } },
  itinerary_days: [
    { id: 'd1', day_number: 1, date: '2027-03-06', title: 'Old town', activities: [stop('a1', '09:30:00', 'Livraria Lello', { cost_amount: 8 }), stop('a2', '13:00:00', 'Lunch at Café Santiago', { venue_name: 'Café Santiago', category: 'food', cost_amount: 15 })] },
    { id: 'd2', day_number: 2, date: '2027-03-07', title: 'River', activities: [] },
  ],
};
const theirs = {
  id: 'cmp-1', user_id: 'u1', title: 'Porto', budget_currency: 'EUR', budget_currency_symbol: '€',
  wizard_state: { compareOf: 'imp-1', destination: { name: 'Porto', currencyCode: 'EUR' } },
  itinerary_days: [
    { id: 'e1', day_number: 1, date: '2027-03-06', title: 'Ribeira', activities: [stop('b1', '10:00:00', 'The Livraria Lello', { cost_amount: 8 }), stop('b2', '15:00:00', 'Palácio da Bolsa', { cost_amount: 14 }), stop('b3', '19:30:00', 'Cafe Santiago', { category: 'food', cost_amount: 18 })] },
    { id: 'e2', day_number: 2, date: '2027-03-07', title: 'Gaia', activities: [stop('b4', '11:00:00', 'Port cellar tour', { venue_name: 'Graham’s Lodge', cost_amount: 25 })] },
    { id: 'e3', day_number: 3, date: null, title: 'Extra', activities: [stop('b5', null, 'Foz walk')] },
  ],
};
const BANNED = /[—–·•…]|\.\.\./;

describe('comparisonOf', () => {
  it('reads the pointer of a wizard state', () => {
    expect(comparisonOf({ compareOf: 'x' })).toBe('x');
    expect(comparisonOf({ compareOf: 7 })).toBe('');
    expect(comparisonOf(null)).toBe('');
  });
});

describe('orphanComparisons', () => {
  it('names the comparison trips whose imported trip is gone or stopped pointing at them a day ago', () => {
    const now = Date.parse('2027-03-10T12:00:00Z');
    const hidden = [
      { id: 'c1', of: 'imp-1', created_at: '2027-03-01T00:00:00Z' }, // the one its trip points at
      { id: 'c2', of: 'imp-1', created_at: '2027-03-01T00:00:00Z' }, // an old second start
      { id: 'c3', of: 'imp-1', created_at: '2027-03-10T11:59:00Z' }, // being started right now
      { id: 'c4', of: 'imp-gone', created_at: '2027-03-10T11:59:00Z' },
      { id: 'c5', of: '' },
    ];
    expect(orphanComparisons(hidden, [{ id: 'imp-1', compare: 'c1' }], now)).toEqual(['c2', 'c4']);
    expect(orphanComparisons([], [], now)).toEqual([]);
  });
});

describe('the confirm inputs and the wizard state', () => {
  it('takes place, dates and travellers from the import and fills pace and budget', () => {
    const inputs = compareInputs(mine);
    expect(inputs).toMatchObject({ destination: 'Porto', start: '2027-03-06', end: '2027-03-07', travelers: 2, pace: 3, currencyCode: 'EUR' });
    expect(inputs.dailyAmount).toBeGreaterThan(0);
    expect(compareInputs({ ...mine, budget_daily: 90 }).dailyAmount).toBe(90);
  });
  it('asks for missing or impossible dates before anything starts', () => {
    const inputs = compareInputs(mine);
    expect(compareInputError(inputs)).toBe('');
    expect(compareInputError({ ...inputs, start: '' })).toMatch(/dates first/);
    expect(compareInputError({ ...inputs, end: '2027-03-01' })).toMatch(/before the start/);
    expect(compareInputError({ ...inputs, end: '2027-09-01' })).toMatch(/up to 60 days/);
    expect(compareInputError({ ...inputs, dailyAmount: 0 })).toMatch(/budget/);
    expect(compareInputError({ ...inputs, destination: '' })).toMatch(/no destination/);
  });
  it('builds what the wizard would, pointing at the imported trip and carrying none of its plan', () => {
    const ws = buildCompareWizardState(mine, { ...compareInputs(mine), pace: 4, dailyAmount: 120, travelers: 3 });
    expect(ws).toMatchObject({
      compareOf: 'imp-1', destination: mine.wizard_state.destination, multiCity: false, destinations: [], travelers: 3, passports: ['sg'],
      dates: { mode: 'fixed', start: '2027-03-06', end: '2027-03-07', duration: 2, freeDays: [] },
      budget: { preset: null, dailyAmount: 120 }, style: { pace: 4, food: 3, activities: [] }, accommodation: { type: 'hotel' },
      flights: { fareClass: 'economy' }, summary: { freeText: '', mustDo: '' },
    });
    expect(ws.imported).toBeUndefined();
    expect(ws.summary.research).toBeUndefined();
  });
});

describe('buildComparison', () => {
  const model = buildComparison(mine, theirs, { home: null });
  it('matches place names loosely', () => {
    expect(nameKey('  The Café  Santiago! ')).toBe('cafe santiago');
    const [d1] = model.days;
    expect(d1.mine.stops.map((s) => s.inBoth)).toEqual([true, true]);
    expect(d1.theirs.stops.map((s) => [s.name, s.inBoth])).toEqual([['The Livraria Lello', true], ['Palácio da Bolsa', false], ['Cafe Santiago', true]]);
    expect(model.shared).toBe(2);
  });
  it('does not match on words that only say what kind of stop it is', () => {
    const plan = (...names) => ({ itinerary_days: [{ id: 'x', day_number: 1, activities: names.map(([title, venue_name], i) => ({ id: `s${i}`, title, venue_name })) }] });
    const both = (a, b) => buildComparison(plan(a), plan(b), {}).days[0].theirs.stops[0].inBoth;
    expect(both(['Cafe'], ['Cafe Luna'])).toBe(false);
    expect(both(['Lunch', 'Taberna Folias'], ['Lunch', 'Casa Guedes'])).toBe(false);
    expect(both(['Dinner'], ['Dinner at the hotel restaurant'])).toBe(false);
    expect(both(['Museum'], ['Museum of Port Wine'])).toBe(false);
    expect(both(['Serralves'], ['Morning visit', 'Serralves Museum'])).toBe(true);
    expect(both(['Lunch at Casa Guedes'], ['Roast pork sandwich', 'Casa Guedes'])).toBe(true);
    // The same shown name is the same stop, whatever the name: a copied stop stays "in both".
    expect(both(['Lunch'], ['Lunch'])).toBe(true);
  });
  it('aligns the days by number and says which side has none', () => {
    expect(model.days.map((d) => d.number)).toEqual([1, 2, 3]);
    expect(model.days[1].mine).toMatchObject({ exists: true, dayId: 'd2', stops: [] });
    expect(model.days[2].mine).toMatchObject({ exists: false, dayId: '' });
    expect(model.days[2].theirs.stops[0]).toMatchObject({ name: 'Foz walk', time: '' });
    expect(model.days[0].date).toBe('2027-03-06');
  });
  it('totals each side and formats time and cost through the app formatters', () => {
    const cell = (label) => model.summary.find((row) => row.label === label);
    expect(cell('Days')).toMatchObject({ mine: '2', theirs: '3' });
    expect(cell('Stops')).toMatchObject({ mine: '2', theirs: '5' });
    expect(cell('Stops per day')).toMatchObject({ mine: '1', theirs: '1.7' });
    expect(cell('Estimated cost')).toMatchObject({ mine: '€23', theirs: '€65' });
    expect(model.days[0].mine.stops[0]).toMatchObject({ time: '9:30 AM', cost: '€8', category: 'Culture' });
    expect(model.days[0].mine.stops[1]).toMatchObject({ name: 'Café Santiago', time: '1:00 PM' });
  });
  it('marks a converted total with a tilde when the home currency differs', () => {
    const converted = buildComparison(mine, theirs, { home: { code: 'SGD', symbol: 'S$' }, homeFirst: true });
    expect(converted.summary.find((row) => row.label === 'Estimated cost').mine).toMatch(/^~S\$\d/);
  });
  it('shows only the imported side while the other plan is not there', () => {
    const alone = buildComparison(mine, null, {});
    expect(alone.days).toHaveLength(2);
    expect(alone.shared).toBe(0);
    expect(alone.summary.every((row) => row.theirs === '')).toBe(true);
  });
  it('copies a stop into the fields of the activity create path', () => {
    expect(activityCopy(theirs.itinerary_days[0].activities[1], theirs)).toMatchObject({ title: 'Palácio da Bolsa', venueName: 'Palácio da Bolsa', startTime: '15:00:00', costAmount: 14, costCurrency: 'EUR' });
  });
});

describe('the page', () => {
  const state = (extra) => ({ tripId: 'imp-1', title: 'Porto weekend', side: 'mine', added: new Set(), model: buildComparison(mine, theirs, {}), status: 'ready', ...extra });
  it('draws both labelled sides, the summary, every day and the two endings', () => {
    const html = comparePageHtml(state());
    expect(html).toContain('<h1 class="cmp-title">Porto weekend</h1>');
    for (const text of ['Your plan', "Trippy's plan", 'Estimated cost', '2 places appear in both plans.', 'Day 3', 'This plan has no day 3.',
      'Nothing planned for this day.', 'In both', 'Keep only my plan', 'Keep both']) expect(html).toContain(text);
    expect(html.match(/data-compare-day=/g)).toHaveLength(3);
    expect(html).not.toMatch(BANNED);
  });
  it('offers Add to my plan only for Trippy stops that are new and have a day to go to', () => {
    const html = comparePageHtml(state());
    expect(html.match(/data-compare-add="([^"]+)"/g)).toEqual(['data-compare-add="b2"', 'data-compare-add="b4"']);
    const added = comparePageHtml(state({ added: new Set(['b2']) }));
    expect(added).not.toContain('data-compare-add="b2"');
    expect(added).toContain('Added');
  });
  it('waits for the other side, offers Try again after a failure, and turns actions off offline', () => {
    const waiting = comparePageHtml(state({ status: 'waiting', model: buildComparison(mine, null, {}) }));
    expect(waiting).toContain('Trippy is writing its plan.');
    expect(waiting).toContain('Being written.');
    expect(waiting).not.toContain('Keep both');
    const failed = comparePageHtml(state({ status: 'failed', model: buildComparison(mine, null, {}), error: '' }));
    expect(failed).toContain('data-compare-action="retry"');
    const offline = comparePageHtml(state({ offline: true }));
    expect(offline).toContain('You are offline.');
    expect(offline.match(/data-compare-(?:add|action)="[^"]+" disabled/g)).toHaveLength(4);
  });
  it('starts with a confirm step that shows the inputs and any problem with them', () => {
    const html = comparePageHtml(state({ status: 'start', model: null, inputs: { ...compareInputs(mine), start: '' }, inputError: 'Add the start and end dates first.' }));
    for (const text of ['Compare with a Trippy plan', 'Your imported plan is not changed', 'Porto', 'name="start" value=""', 'name="end" value="2027-03-07"', 'Balanced', 'Add the start and end dates first.']) expect(html).toContain(text);
    expect(html).not.toMatch(BANNED);
  });
  it('names the entry by whether a comparison exists, and escapes what it is given', () => {
    expect(compareEntryHtml(mine)).toContain('Compare with a Trippy plan');
    expect(compareEntryHtml(mine)).toContain('href="#/trip/imp-1/compare"');
    expect(compareEntryHtml({ ...mine, wizard_state: { ...mine.wizard_state, compareTrip: 'cmp-1' } })).toContain('Open comparison');
    expect(comparePageHtml(state({ title: '<img src=x>' }))).not.toContain('<img');
  });
});
