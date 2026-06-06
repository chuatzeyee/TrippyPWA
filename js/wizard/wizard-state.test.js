import { describe, it, expect, beforeAll, vi } from 'vitest';

// wizard-state.js touches sessionStorage + crypto at module load; stub them so it
// imports cleanly under node. canAdvance itself is pure (reads state only).
beforeAll(() => {
  const store = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  });
  vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-0000-0000-000000000000' });
});

async function load() {
  return await import('./wizard-state.js');
}

function baseState(overrides = {}) {
  return {
    currentStep: 1,
    multiCity: false,
    destination: null,
    destinations: [],
    dates: { mode: null, start: '', end: '', duration: 7, season: null, freeDays: [] },
    budget: { dailyAmount: 0 },
    accommodation: { type: null, settled: false },
    style: { activities: [] },
    ...overrides,
  };
}

describe('canAdvance', () => {
  it('step 1 single-city requires a destination', async () => {
    const { canAdvance } = await load();
    expect(canAdvance(baseState({ currentStep: 1 }))).toBe(false);
    expect(canAdvance(baseState({ currentStep: 1, destination: { name: 'Tokyo' } }))).toBe(true);
  });

  it('step 1 multi-city requires at least two destinations', async () => {
    const { canAdvance } = await load();
    expect(canAdvance(baseState({ currentStep: 1, multiCity: true, destinations: [{ name: 'A' }] }))).toBe(false);
    expect(canAdvance(baseState({ currentStep: 1, multiCity: true, destinations: [{ name: 'A' }, { name: 'B' }] }))).toBe(true);
  });

  it('step 2 accepts either fixed dates or duration+season', async () => {
    const { canAdvance } = await load();
    // canAdvance uses && / || so it returns truthy operands, not strict booleans.
    expect(canAdvance(baseState({ currentStep: 2, dates: { start: '2026-01-01', end: '2026-01-05' } }))).toBeTruthy();
    expect(canAdvance(baseState({ currentStep: 2, dates: { duration: 7, season: 'peak' } }))).toBeTruthy();
    expect(canAdvance(baseState({ currentStep: 2, dates: { duration: 7, season: null } }))).toBeFalsy();
  });

  it('step 3 requires a positive daily budget', async () => {
    const { canAdvance } = await load();
    expect(canAdvance(baseState({ currentStep: 3, budget: { dailyAmount: 0 } }))).toBe(false);
    expect(canAdvance(baseState({ currentStep: 3, budget: { dailyAmount: 120 } }))).toBe(true);
  });

  it('step 4 requires an accommodation type or settled flag', async () => {
    const { canAdvance } = await load();
    expect(canAdvance(baseState({ currentStep: 4, accommodation: { type: null, settled: false } }))).toBe(false);
    expect(canAdvance(baseState({ currentStep: 4, accommodation: { type: 'hotel' } }))).toBe(true);
    expect(canAdvance(baseState({ currentStep: 4, accommodation: { settled: true } }))).toBe(true);
  });

  it('step 6 requires at least one interest', async () => {
    const { canAdvance } = await load();
    expect(canAdvance(baseState({ currentStep: 6, style: { activities: [] } }))).toBe(false);
    expect(canAdvance(baseState({ currentStep: 6, style: { activities: ['Museums'] } }))).toBe(true);
  });
});
