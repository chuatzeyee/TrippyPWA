// Which entry of "On this page" is marked: the rule is pure, so it is tested without a browser. Owner: ST.
import { describe, it, expect } from 'vitest';
import { currentSection, cutEdges, heldJump } from './toc.js';

const LINE = 80;
const HEIGHT = 800;
/** Sections one under the other, each 600 px tall, with the page scrolled by `scrolled` px. */
const boxes = (scrolled, keys = ['look', 'you', 'money', 'data', 'about']) => keys.map((key, i) => ({ key, top: 100 + i * 600 - scrolled, bottom: 100 + (i + 1) * 600 - scrolled }));

describe('the section the page is on', () => {
  it('is the first one at the top of the page, before any heading has reached the line', () => {
    expect(currentSection({ sections: boxes(0), line: LINE, height: HEIGHT })).toBe('look');
  });
  it('is the last one whose top has reached the line under the nav', () => {
    expect(currentSection({ sections: boxes(620), line: LINE, height: HEIGHT })).toBe('you');
    expect(currentSection({ sections: boxes(619), line: LINE, height: HEIGHT })).toBe('look');
    expect(currentSection({ sections: boxes(1500), line: LINE, height: HEIGHT })).toBe('money');
  });
  it('is the last section at the end of the page, though its heading can never reach the line', () => {
    const short = [{ key: 'data', top: -200, bottom: 400 }, { key: 'account', top: 400, bottom: 600 }, { key: 'about', top: 600, bottom: 760 }];
    expect(currentSection({ sections: short, line: LINE, height: HEIGHT })).toBe('data');
    expect(currentSection({ sections: short, line: LINE, height: HEIGHT, atEnd: true })).toBe('about');
  });
  it('stays on the section someone jumped to while any of it is on screen below the line', () => {
    const short = [{ key: 'data', top: -200, bottom: 400 }, { key: 'account', top: 400, bottom: 600 }, { key: 'about', top: 600, bottom: 760 }];
    expect(currentSection({ sections: short, line: LINE, height: HEIGHT, atEnd: true, picked: 'account' })).toBe('account');
    expect(currentSection({ sections: boxes(0), line: LINE, height: HEIGHT, picked: 'you' })).toBe('you');
  });
  it('lets go of a jump whose section is off the screen or is not a section', () => {
    expect(currentSection({ sections: boxes(0), line: LINE, height: HEIGHT, picked: 'about' })).toBe('look');
    expect(currentSection({ sections: boxes(1500), line: LINE, height: HEIGHT, picked: 'look' })).toBe('money');
    expect(currentSection({ sections: boxes(0), line: LINE, height: HEIGHT, picked: 'nope' })).toBe('look');
  });
  it('has no answer for a page with no sections or with boxes that are not numbers', () => {
    expect(currentSection({ sections: [], line: LINE, height: HEIGHT })).toBe(null);
    expect(currentSection()).toBe(null);
    expect(currentSection({ sections: [{ key: 'look', top: NaN, bottom: 10 }], line: LINE, height: HEIGHT })).toBe(null);
  });
});

describe('a jump that is held until its section has come and gone', () => {
  const box = (top, bottom) => [{ key: 'look', top: -900, bottom: top }, { key: 'account', top, bottom }];
  it('is kept while the page is still on its way there', () => {
    expect(heldJump({ picked: 'account', arrived: false }, { sections: box(2400, 2600), line: LINE, height: HEIGHT })).toEqual({ picked: 'account', arrived: false });
  });
  it('is marked as arrived once any of the section is on screen below the line', () => {
    expect(heldJump({ picked: 'account', arrived: false }, { sections: box(500, 700), line: LINE, height: HEIGHT })).toEqual({ picked: 'account', arrived: true });
  });
  it('is let go when the section has arrived and then left the screen', () => {
    expect(heldJump({ picked: 'account', arrived: true }, { sections: box(900, 1100), line: LINE, height: HEIGHT })).toEqual({ picked: null, arrived: false });
    expect(heldJump({ picked: 'account', arrived: true }, { sections: box(-300, 60), line: LINE, height: HEIGHT })).toEqual({ picked: null, arrived: false });
  });
  it('is nothing without a jump, and lets go of a key that is not a section', () => {
    expect(heldJump({ picked: null, arrived: false }, { sections: box(500, 700), line: LINE, height: HEIGHT })).toEqual({ picked: null, arrived: false });
    expect(heldJump({ picked: 'nope', arrived: false }, { sections: box(500, 700), line: LINE, height: HEIGHT })).toEqual({ picked: null, arrived: false });
  });
});

describe('which edges of the chip row are cut', () => {
  it('is none when every chip fits', () => {
    expect(cutEdges({ scrollLeft: 0, scrollWidth: 390, clientWidth: 390 })).toBe('none');
    expect(cutEdges({ scrollLeft: 0, scrollWidth: 390.6, clientWidth: 390 })).toBe('none');
  });
  it('is the end at the start of the row, both in between, the start at its end', () => {
    expect(cutEdges({ scrollLeft: 0, scrollWidth: 760, clientWidth: 390 })).toBe('end');
    expect(cutEdges({ scrollLeft: 120, scrollWidth: 760, clientWidth: 390 })).toBe('both');
    expect(cutEdges({ scrollLeft: 370, scrollWidth: 760, clientWidth: 390 })).toBe('start');
    expect(cutEdges({ scrollLeft: 369.4, scrollWidth: 760, clientWidth: 390 })).toBe('start');
  });
  it('is none for sizes that are not numbers', () => {
    expect(cutEdges({ scrollLeft: NaN, scrollWidth: 760, clientWidth: 390 })).toBe('none');
    expect(cutEdges()).toBe('none');
  });
});
