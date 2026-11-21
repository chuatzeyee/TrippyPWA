// Opt-in check of the readiness rule and the trip phase against the captured plans in
// previews/fixtures (ruling R9). That folder is never committed and does not exist in CI: without
// it every test here is skipped. The file holds derived values only (a phase, counts, status
// texts), written down after a human look: never a name, a place or a date from a row.
//
// Fixed inputs: now is 2026-11-20T04:00:00Z on a device in Singapore, no ticks. The entry check
// runs for real, against the public visa tables in public/data/visa, read from disk.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readiness, summariseEntry, tripReadinessInput } from './readiness.js';
import { tripPhase } from './trip-status.js';
import { groundJourney, journeyMode } from './journey.js';
import { entryPlan } from '../services/entry-advisor.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = `${ROOT}previews/fixtures/`;
const NOW = new Date('2026-11-20T04:00:00Z');
const DEVICE = 'Asia/Singapore';
const NO_TICKS = { quick: {}, checklist: {}, entryDone: {} };
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/**
 * file -> the phase today, then what the rule says about the plan before it starts (the phase
 * taken as upcoming): the counts and each area as [area, state, status]. Four of the plans are
 * past on the fixed date, so today nothing is drawn for them; the rule is still read for all seven.
 */
const counts = (headline, done, total, todo) => ({ headline, done, total, todo, pending: 0, perDevice: true, collapsed: false });
const NOTHING_TO_FILE = ['entry', 'done', 'Nothing to file'];
const EXPECTED = {
  'trip-hk.json': {
    phase: 'upcoming', ...counts('1 of 4 ready', 1, 4, 3),
    areas: [['travel', 'todo', 'Not booked yet'], ['stay', 'todo', 'None booked'], NOTHING_TO_FILE, ['reservations', 'todo', '2 to book']],
  },
  'trip-live-oslo.json': {
    phase: 'live', ...counts('1 of 4 ready', 1, 4, 3),
    areas: [['travel', 'todo', 'Not booked yet'], ['stay', 'todo', 'None booked'], NOTHING_TO_FILE, ['reservations', 'todo', '7 to book']],
  },
  // Three cities, nothing booked in any of them.
  'trip-multicity-helsinki.json': {
    phase: 'past', ...counts('1 of 4 ready', 1, 4, 3),
    areas: [['travel', 'todo', 'Not booked yet'], ['stay', 'todo', 'None booked'], NOTHING_TO_FILE, ['reservations', 'todo', '8 to book']],
  },
  // A coach journey: the area is Transport and nothing says it is arranged.
  'trip-ground-genting.json': {
    phase: 'past', ...counts('1 of 4 ready', 1, 4, 3),
    areas: [['travel', 'todo', 'Not arranged yet'], ['stay', 'todo', 'None booked'], NOTHING_TO_FILE, ['reservations', 'todo', '7 to book']],
  },
  // A plan in the home city: no travel, no stay and no entry to arrange.
  'trip-homecity-singapore.json': {
    phase: 'past', ...counts('0 of 1 ready', 0, 1, 1),
    areas: [['reservations', 'todo', '10 to book']],
  },
  // Imported with both flights booked; six stays in a row, none booked.
  'trip-imported-hokkaido.json': {
    phase: 'upcoming', ...counts('2 of 4 ready', 2, 4, 2),
    areas: [['travel', 'done', 'Booked'], ['stay', 'todo', 'None booked'], NOTHING_TO_FILE, ['reservations', 'todo', '10 to book']],
  },
  // Flights and stay marked as settled in the wizard; the travel authorisation and the arrival card are both required.
  'trip-settled-melbourne.json': {
    phase: 'past', ...counts('2 of 4 ready', 2, 4, 2),
    areas: [['travel', 'done', 'Sorted'], ['stay', 'done', 'Sorted'], ['entry', 'todo', '2 things to do'], ['reservations', 'todo', '8 to book']],
  },
};

const summary = (result) => {
  if (!result) return null;
  const { items, done, total, todo, pending, headline, perDevice, collapsed } = result;
  return { headline, done, total, todo, pending, perDevice, collapsed, areas: items.map((item) => [item.area, item.state, item.status]) };
};

async function derive(file, profile) {
  const trip = [readJson(FIXTURES + file)].flat()[0];
  const phase = tripPhase(trip, NOW, DEVICE);
  const base = tripReadinessInput(trip, { now: NOW, deviceZone: DEVICE, homeCity: profile.home_city, ticks: NO_TICKS });
  const ground = groundJourney(base.extras);
  const own = profile.nationality ? [profile.nationality] : [];
  const passports = Array.isArray(trip.wizard_state?.passports) && trip.wizard_state.passports.length ? trip.wizard_state.passports : own;
  const plan = await entryPlan({
    wizardState: trip.wizard_state, extras: base.extras, passports, homeFlag: profile.home_flag,
    groundMode: ground ? journeyMode(ground) : '', tripStart: trip.start_date || null, tripEnd: trip.end_date || null,
  });
  const entry = summariseEntry(plan, NO_TICKS.entryDone, trip.id, profile.home_flag);
  return {
    phase,
    today: summary(readiness({ ...base, phase, entry })),
    beforeDeparture: summary(readiness({ ...base, phase: 'upcoming', entry })),
  };
}

describe.skipIf(!existsSync(`${FIXTURES}profile.json`))('readiness and phase for the captured plans', () => {
  let profile;
  beforeAll(() => {
    profile = [readJson(`${FIXTURES}profile.json`)].flat()[0];
    // The entry check fetches the public visa tables: served here from public/, nothing leaves the machine.
    vi.stubGlobal('fetch', async (url) => {
      const path = `${ROOT}public${String(url)}`;
      if (!String(url).startsWith('/data/visa/') || !existsSync(path)) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => readJson(path) };
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it.each(Object.keys(EXPECTED))('%s', async (file) => {
    if (!existsSync(FIXTURES + file)) return;
    const { phase, today, beforeDeparture } = await derive(file, profile);
    expect({ phase, ...beforeDeparture }).toEqual(EXPECTED[file]);
    // What is drawn today: nothing for a past plan, the same list otherwise, as one line while live.
    expect(today).toEqual(phase === 'past' ? null : { ...beforeDeparture, collapsed: phase === 'live' });
  });
});
