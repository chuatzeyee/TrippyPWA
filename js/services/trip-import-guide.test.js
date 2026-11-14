import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as guide from './trip-import-guide.js';
import { validateTripImport, IMPORT_MESSAGES } from './trip-import.js';

const { AI_PROMPT, TEMPLATE, TEMPLATE_JSON, buildFixRequest, buildImportSummary, routeText } = guide;

// The user's copy rule: no em dash, en dash, middle dot or bullet in UI text.
const BANNED = /[\u2014\u2013\u00B7\u2022]|&(mdash|ndash|middot|bull);/;

function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('TEMPLATE', () => {
  it('validates with no errors and no warnings', () => {
    const r = validateTripImport(TEMPLATE_JSON);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.summary).toMatchObject({ days: 3, activities: 3 });
    expect(JSON.parse(TEMPLATE_JSON)).toEqual(TEMPLATE);
  });

  it('shows the optional stay booking fields to the assistant', () => {
    expect(TEMPLATE.accommodation[0]).toMatchObject({ bookingRef: expect.any(String), address: expect.any(String) });
    expect(AI_PROMPT).toContain('Include "bookingRef" and "address" when the confirmation shows them.');
  });
});

describe('AI_PROMPT', () => {
  it('embeds the template and asks for whole-number money', () => {
    expect(AI_PROMPT).toContain(TEMPLATE_JSON);
    expect(AI_PROMPT).toMatch(/Write money as a whole number without currency symbols or commas/);
    expect(AI_PROMPT.trimEnd().endsWith('My trip information:')).toBe(true);
  });

  it('tells the assistant to write no em dashes, en dashes or middle dots', () => {
    expect(AI_PROMPT).toContain('Do not use em dashes, en dashes or middle dots anywhere in the text');
    expect(AI_PROMPT).toMatch(/Use a comma, "and" or "to" instead/);
    expect(BANNED.test(AI_PROMPT)).toBe(false);
  });

  it('keeps the rules numbered in order', () => {
    const numbers = [...AI_PROMPT.matchAll(/^(\d+)\. /gm)].map(m => Number(m[1]));
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1));
    expect(numbers.length).toBeGreaterThanOrEqual(16);
  });

  it('a reply that is only the template in a json fence imports', () => {
    expect(validateTripImport(`\`\`\`json\n${TEMPLATE_JSON}\n\`\`\``).ok).toBe(true);
  });
});

describe('UI copy', () => {
  it('has no em dash, en dash, middle dot or bullet in any exported string', () => {
    const all = [...strings(guide), ...strings(IMPORT_MESSAGES)];
    expect(all.length).toBeGreaterThan(20);
    expect(all.filter(s => BANNED.test(s))).toEqual([]);
  });

  it('has none in the import and dashboard sources or the docs either', () => {
    const files = [
      '../components/trip-import-modal.js', './trip-import.js', './trip-import-json.js', './trip-import-guide.js',
      '../components/dashboard.js', '../../docs/trip-import-format.md',
    ];
    for (const file of files) {
      const lines = readFileSync(new URL(file, import.meta.url), 'utf8').split('\n');
      expect(lines.filter(l => BANNED.test(l)), file).toEqual([]);
    }
  });
});

describe('buildFixRequest', () => {
  it('numbers each problem and names its location', () => {
    const text = buildFixRequest([
      { where: 'Trip', message: 'Add a title, for example "Hokkaido in Winter".' },
      { where: 'Day 3', message: 'Day 3, activity 2: add a title.' },
    ]);
    expect(text.split('\n')).toEqual([
      guide.FIX_REQUEST_INTRO,
      '',
      '1. Trip: Add a title, for example "Hokkaido in Winter".',
      '2. Day 3, activity 2: add a title.',
    ]);
  });
});

describe('buildImportSummary', () => {
  it('summarises the template for the preview', () => {
    const { data } = validateTripImport(TEMPLATE_JSON);
    const s = buildImportSummary(data, new Date(2026, 11, 1));
    expect(s).toMatchObject({
      title: 'Hokkaido in Winter', emoji: '❄️', destination: 'Sapporo', country: 'Japan',
      start: '2027-01-13', end: '2027-01-15', tripDays: 3, travelers: 2, dayCount: 3, activityCount: 3,
      flights: { booked: 2 },
      stays: { booked: 1 },
      deadlines: { count: 1, earliest: '2026-12-20', overdue: 0 },
      costs: [{ currency: 'JPY', amount: 10000 }],
      moreDays: 0,
    });
    expect(s.flights.legs[0]).toMatchObject({ label: 'Outbound', route: 'SIN to CTS', flightNumber: 'TR892', bookingRef: 'ABC123' });
    expect(s.stays.list[0]).toMatchObject({ name: 'Example Hotel Susukino', nights: 2, booked: true });
    expect(s.firstDays[0]).toEqual({ dayNumber: 1, date: '2027-01-13', title: 'Arrive in Sapporo', activities: 2 });
  });

  it('groups costs by currency (trip currency first) and counts passed deadlines', () => {
    const t = JSON.parse(TEMPLATE_JSON);
    t.days[1].activities.push({ title: 'Souvenirs', costAmount: 50, costCurrency: 'SGD' });
    const { data } = validateTripImport(JSON.stringify(t));
    const s = buildImportSummary(data, new Date(2027, 0, 1));
    expect(s.costs).toEqual([{ currency: 'JPY', amount: 10000 }, { currency: 'SGD', amount: 50 }]);
    expect(s.deadlines.overdue).toBe(1);
  });

  it('shows at most five days', () => {
    const t = JSON.parse(TEMPLATE_JSON);
    t.trip.endDate = '2027-01-20';
    for (let n = 4; n <= 8; n++) t.days.push({ dayNumber: n, date: `2027-01-${String(12 + n).padStart(2, '0')}`, activities: [] });
    const s = buildImportSummary(validateTripImport(JSON.stringify(t)).data);
    expect(s.firstDays).toHaveLength(5);
    expect(s.moreDays).toBe(3);
  });

  it('writes routes with "to"', () => {
    expect(routeText('SIN > TPE > CTS')).toBe('SIN to TPE to CTS');
    expect(routeText('SIN → CTS')).toBe('SIN to CTS');
  });
});
