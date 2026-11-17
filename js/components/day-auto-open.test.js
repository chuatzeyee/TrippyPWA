import { describe, it, expect } from 'vitest';
import { nextDayToAutoOpen } from './trip-detail.js';

// Minimal stand-ins for day cards: open state, position, and the hand-closed flag.
const card = (open, bottom, userClosed) => ({
  classList: { contains: (c) => c === 'td-day-card--open' && open },
  getBoundingClientRect: () => ({ bottom }),
  dataset: userClosed ? { userClosed: '1' } : {},
});

describe('nextDayToAutoOpen', () => {
  const vh = 800;
  it('opens the next day once the end of the open day is on screen', () => {
    const days = [card(true, 700), card(false, 900)];
    expect(nextDayToAutoOpen(days, vh)).toBe(days[1]);
  });
  it('waits while the open day still runs past the bottom of the screen', () => {
    expect(nextDayToAutoOpen([card(true, 1200), card(false, 1400)], vh)).toBeNull();
  });
  it('never reopens a day closed by hand, and stops at the last day', () => {
    expect(nextDayToAutoOpen([card(true, 700), card(false, 900, true)], vh)).toBeNull();
    expect(nextDayToAutoOpen([card(false, 100), card(true, 700)], vh)).toBeNull();
  });
  it('uses the last open day when several are open', () => {
    const days = [card(true, -300), card(true, 600), card(false, 800)];
    expect(nextDayToAutoOpen(days, vh)).toBe(days[2]);
  });
});
