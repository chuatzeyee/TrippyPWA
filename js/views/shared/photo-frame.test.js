// photo-frame.js: the one photo frame (blueprint 8.5). Owner: F5.
import { describe, it, expect } from 'vitest';
import { coverFrameHtml, tileFrameHtml, thumbHtml, creditChipHtml, settleFade } from './photo-frame.js';
import { DASHBOARD_FIXTURES, TRIP_FIXTURES } from '../fixtures/models.js';
import { readFileSync } from 'node:fs';
import { parseHtml, all, attr, classesOf, textOf } from '../fixtures/checks/html-tree.js';
import { parseCss } from '../fixtures/checks/css-spec.js';
import { markupRules } from '../fixtures/checks/markup-rules.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  return root;
};
const cards = DASHBOARD_FIXTURES.twoLive.cardsById;
const V2 = cards['s-kyoto'].cover;
const LEGACY = cards['s-seville'].cover;
const NONE = DASHBOARD_FIXTURES.noCover.cardsById['s-sintra'].cover;

describe('coverFrameHtml', () => {
  it('draws a v2 cover: both copies, the focus line, the full credit as the title', () => {
    const root = tree(coverFrameHtml(V2));
    const [frame] = all(root, '.ui-frame');
    expect(classesOf(frame)).toContain('ui-frame--16x9');
    expect(attr(frame, 'data-frame')).toBe('v2');
    expect(attr(frame, 'style')).toBe('--focus-y:38%');
    const [img] = all(frame, 'img.ui-frame-img');
    expect(attr(img, 'src')).toBe(V2.src);
    expect(attr(img, 'srcset')).toBe(V2.srcset);
    expect(attr(img, 'sizes')).toBeTruthy();
    expect(attr(img, 'data-fallback')).toBeNull();
    expect(attr(img, 'title')).toBe(V2.credit.full);
    expect(attr(img, 'alt')).toBe('');
    expect(attr(img, 'decoding')).toBe('async');
    expect(Number(attr(img, 'width')) / Number(attr(img, 'height'))).toBeCloseTo(16 / 9, 2);
  });
  it('draws a legacy cover with the original URL as the fallback', () => {
    const [img] = all(tree(coverFrameHtml(LEGACY)), 'img.ui-frame-img');
    expect(attr(img, 'src')).toBe(LEGACY.src);
    expect(attr(img, 'srcset')).toBe(LEGACY.srcset);
    expect(attr(img, 'data-fallback')).toBe(LEGACY.fallbackSrc);
  });
  it('draws the designed placeholder, and no image, when there is no cover', () => {
    const root = tree(coverFrameHtml(NONE, { name: 'Sintra hills', flag: 'pt', tone: 3 }));
    const [frame] = all(root, '.ui-frame');
    expect(attr(frame, 'data-frame')).toBe('none');
    expect(all(frame, 'img.ui-frame-img')).toHaveLength(0);
    expect(textOf(all(frame, '.ui-frame-name')[0])).toBe('Sintra hills');
    expect(all(frame, 'img.ui-flag')).toHaveLength(1);
    expect(attr(frame, 'style')).toContain('--tone:var(--day-3)');
    expect(all(frame, '.ui-credit')).toHaveLength(0);
  });
  it('keeps the placeholder behind every photo, hidden from assistive technology', () => {
    const [none] = all(tree(coverFrameHtml(V2, { name: 'Kyoto' })), '.ui-frame-none');
    expect(attr(none, 'aria-hidden')).toBe('true');
    expect(textOf(none)).toBe('Kyoto');
  });
  it('shows one credit chip with the short source only, linking to the source page', () => {
    const chips = all(tree(coverFrameHtml(V2)), '.ui-credit');
    expect(chips).toHaveLength(1);
    expect(chips[0].tag).toBe('a');
    expect(textOf(chips[0])).toBe('Pexels');
    expect(attr(chips[0], 'href')).toBe(V2.credit.link);
    expect(attr(chips[0], 'rel')).toBe('noopener noreferrer');
    expect(textOf(chips[0])).not.toContain('Mika');
  });
  it('draws no chip without a credit, or when the caller turns it off', () => {
    expect(all(tree(coverFrameHtml({ ...V2, credit: null })), '.ui-credit')).toHaveLength(0);
    expect(all(tree(coverFrameHtml(V2, { credit: false })), '.ui-credit')).toHaveLength(0);
    expect(attr(all(tree(coverFrameHtml({ ...V2, credit: null })), 'img')[0], 'title')).toBeNull();
  });
  it('is lazy by default, eager on request, and high priority for the lead cover', () => {
    const lazy = all(tree(coverFrameHtml(V2)), 'img')[0];
    expect(attr(lazy, 'loading')).toBe('lazy');
    expect(attr(lazy, 'fetchpriority')).toBeNull();
    const eager = all(tree(coverFrameHtml(V2, { eager: true })), 'img')[0];
    expect(attr(eager, 'loading')).toBeNull();
    expect(attr(eager, 'fetchpriority')).toBeNull();
    const lead = all(tree(coverFrameHtml(V2, { priority: true })), 'img')[0];
    expect(attr(lead, 'loading')).toBeNull();
    expect(attr(lead, 'fetchpriority')).toBe('high');
  });
  it('fades in only when animate is true', () => {
    expect(attr(all(tree(coverFrameHtml(V2, { animate: true })), 'img')[0], 'data-fade')).toBe('');
    expect(attr(all(tree(coverFrameHtml(V2, { animate: false })), 'img')[0], 'data-fade')).toBeNull();
    expect(attr(all(tree(coverFrameHtml(V2)), 'img')[0], 'data-fade')).toBeNull();
  });
  it('asks for no referrer on a linked image', () => {
    expect(attr(all(tree(coverFrameHtml(LEGACY)), 'img')[0], 'referrerpolicy')).toBe('no-referrer');
    expect(attr(all(tree(coverFrameHtml({ ...V2, src: '/img/sample.webp', srcset: '' })), 'img')[0], 'referrerpolicy')).toBeNull();
  });
  it('carries the hero frame by key and by photo', () => {
    const [frame] = all(tree(coverFrameHtml(V2, { carry: 'cover' })), '.ui-frame');
    expect(attr(frame, 'data-carry')).toBe('cover');
    expect(attr(frame, 'data-carry-id')).toBe(V2.src);
    const [none] = all(tree(coverFrameHtml(NONE, { carry: 'cover' })), '.ui-frame');
    expect(attr(none, 'data-carry')).toBe('cover');
    expect(attr(none, 'data-carry-id')).toBe('none');
  });
  it('takes a ratio, a scrim, extra classes and trusted markup to lay over the photo', () => {
    const root = tree(coverFrameHtml(V2, { ratio: '3x2', scrim: true, cls: 'dep-pass-photo', over: '<h3 class="x">Kyoto</h3>' }));
    const [frame] = all(root, '.ui-frame');
    expect(classesOf(frame)).toEqual(expect.arrayContaining(['ui-frame--3x2', 'ui-frame--scrim', 'dep-pass-photo']));
    expect(all(all(frame, '.ui-frame-over')[0], 'h3')).toHaveLength(1);
    expect(classesOf(all(tree(coverFrameHtml(V2, { ratio: 'nonsense' })), '.ui-frame')[0])).toContain('ui-frame--16x9');
  });
  it('clamps the focus line and falls back to the middle', () => {
    expect(attr(all(tree(coverFrameHtml({ ...V2, focusY: 140 })), '.ui-frame')[0], 'style')).toBe('--focus-y:100%');
    expect(attr(all(tree(coverFrameHtml({ ...V2, focusY: 'top;color:red' })), '.ui-frame')[0], 'style')).toBe('--focus-y:50%');
  });
  it('escapes hostile text and drops unsafe addresses', () => {
    const hostile = { kind: 'v2', src: 'javascript:alert(1)', srcset: 'javascript:alert(1) 1x', fallbackSrc: 'data:x', focusY: 50, credit: { chip: HOSTILE, full: HOSTILE, link: 'javascript:alert(1)' } };
    const root = tree(coverFrameHtml(hostile, { name: HOSTILE, alt: HOSTILE }));
    expect(all(root, 'img.ui-frame-img')).toHaveLength(0);
    expect(attr(all(root, '.ui-frame')[0], 'data-frame')).toBe('none');
    expect(all(root, 'a')).toHaveLength(0);
    expect(textOf(all(root, '.ui-frame-name')[0])).toBe(HOSTILE);
    const safe = tree(coverFrameHtml({ ...V2, srcset: `${V2.src} 1280w, javascript:alert(1) 2400w`, credit: { chip: HOSTILE, full: HOSTILE, link: 'javascript:alert(1)' } }, { alt: HOSTILE }));
    const [img] = all(safe, 'img.ui-frame-img');
    expect(attr(img, 'srcset')).toBeNull();
    expect(attr(img, 'alt')).toBe(HOSTILE);
    expect(attr(img, 'title')).toBe(HOSTILE);
    expect(all(safe, '.ui-credit')[0].tag).toBe('span');
  });
  it('takes its width and height from the ratio alone, whatever a caller passes as a size', () => {
    for (const size of [HOSTILE, '56', 56, -1, 1e9, NaN, { toString: () => HOSTILE }, [HOSTILE]]) {
      const html = coverFrameHtml(V2, { size });
      expect(html).not.toContain('onerror');
      const images = all(tree(html), 'img');
      expect(images).toHaveLength(1);
      expect([attr(images[0], 'width'), attr(images[0], 'height')]).toEqual(['1280', '720']);
    }
    const [square] = all(tree(coverFrameHtml(V2, { ratio: '1x1', size: HOSTILE })), 'img');
    expect([attr(square, 'width'), attr(square, 'height')]).toEqual(['250', '250']);
  });
  it('does not change the cover it was given', () => {
    const frozen = Object.freeze({ ...V2, credit: Object.freeze({ ...V2.credit }) });
    expect(() => coverFrameHtml(frozen, Object.freeze({ animate: true }))).not.toThrow();
  });
  it('draws the placeholder for a missing cover object', () => {
    expect(attr(all(tree(coverFrameHtml(null)), '.ui-frame')[0], 'data-frame')).toBe('none');
  });
});

describe('tileFrameHtml', () => {
  it('is the same frame at 4:5', () => {
    const hop = DASHBOARD_FIXTURES.ready.hops[0];
    const root = tree(tileFrameHtml(hop.cover, { name: hop.name }));
    const [frame] = all(root, '.ui-frame');
    expect(classesOf(frame)).toContain('ui-frame--4x5');
    const [img] = all(frame, 'img.ui-frame-img');
    expect(Number(attr(img, 'width')) / Number(attr(img, 'height'))).toBeCloseTo(4 / 5, 2);
    expect(attr(img, 'data-fallback')).toBe(hop.cover.fallbackSrc);
    expect(textOf(all(frame, '.ui-credit')[0])).toBe('Wikimedia Commons');
  });
  it('takes its width and height from the ratio alone, whatever a caller passes as a size', () => {
    const hop = DASHBOARD_FIXTURES.ready.hops[0];
    for (const size of [HOSTILE, 56, '56', Infinity]) {
      const html = tileFrameHtml(hop.cover, { size });
      expect(html).not.toContain('onerror');
      const images = all(tree(html), 'img');
      expect(images).toHaveLength(1);
      expect([attr(images[0], 'width'), attr(images[0], 'height')]).toEqual(['640', '800']);
    }
  });
  it('takes a bare photo address, as the area tiles carry', () => {
    const [area, , empty] = TRIP_FIXTURES.upcoming.areas;
    const root = tree(tileFrameHtml(area.photo, { name: area.name }));
    expect(attr(all(root, 'img.ui-frame-img')[0], 'src')).toBe(area.photo);
    expect(attr(all(root, 'img.ui-frame-img')[0], 'referrerpolicy')).toBe('no-referrer');
    expect(attr(all(tree(tileFrameHtml(empty.photo, { name: empty.name })), '.ui-frame')[0], 'data-frame')).toBe('none');
  });
});

describe('thumbHtml', () => {
  const row = TRIP_FIXTURES.upcoming.days[0];
  it('draws a square, lazy thumbnail that sends no referrer', () => {
    const root = tree(thumbHtml(row.thumb));
    const [frame] = all(root, '.ui-frame');
    expect(classesOf(frame)).toEqual(expect.arrayContaining(['ui-thumb', 'ui-frame--1x1']));
    const [img] = all(frame, 'img.ui-frame-img');
    expect(attr(img, 'src')).toBe(row.thumb.src);
    expect(attr(img, 'alt')).toBe(row.thumb.alt);
    expect(attr(img, 'referrerpolicy')).toBe('no-referrer');
    expect(attr(img, 'loading')).toBe('lazy');
    expect(attr(img, 'width')).toBe(attr(img, 'height'));
    expect(all(frame, '.ui-frame-none')).toHaveLength(1);
  });
  it('draws the placeholder at the same size when there is no photo', () => {
    const [frame] = all(tree(thumbHtml(null)), '.ui-frame');
    expect(attr(frame, 'data-frame')).toBe('none');
    expect(classesOf(frame)).toContain('ui-frame--1x1');
    expect(all(frame, 'img')).toHaveLength(0);
  });
  it('keeps a size inside 16 to 512 px, as a whole number, and falls back to 96', () => {
    const sizeOf = (size) => {
      const [img] = all(tree(thumbHtml(row.thumb, { size })), 'img.ui-frame-img');
      return [attr(img, 'width'), attr(img, 'height')];
    };
    expect(sizeOf(56)).toEqual(['56', '56']);
    expect(sizeOf(71.6)).toEqual(['72', '72']);
    expect(sizeOf(undefined)).toEqual(['96', '96']);
    for (const size of [HOSTILE, '56', 8, 4000, NaN, null]) expect(sizeOf(size)).toEqual(['96', '96']);
  });
  it('takes animate, a size and hostile text', () => {
    const [img] = all(tree(thumbHtml({ src: row.thumb.src, alt: HOSTILE }, { animate: true, size: 56 })), 'img.ui-frame-img');
    expect(attr(img, 'data-fade')).toBe('');
    expect(attr(img, 'width')).toBe('56');
    expect(attr(img, 'alt')).toBe(HOSTILE);
    expect(attr(all(tree(thumbHtml(row.thumb, { animate: false })), 'img')[0], 'data-fade')).toBeNull();
    expect(all(tree(thumbHtml({ src: 'javascript:alert(1)', alt: 'x' })), 'img')).toHaveLength(0);
  });
});

describe('creditChipHtml', () => {
  it('shows the short source only', () => {
    const root = tree(creditChipHtml({ chip: 'Wikimedia Commons', full: 'Photo: Ana Reis, CC BY-SA 4.0, Wikimedia Commons', link: 'https://commons.wikimedia.org/wiki/File:X.jpg' }));
    const [chip] = all(root, 'a.ui-credit');
    expect(textOf(chip)).toBe('Wikimedia Commons');
    expect(attr(chip, 'aria-label')).toBe('Photo source: Wikimedia Commons');
    expect(attr(chip, 'data-focus-key')).toBe('credit-https://commons.wikimedia.org/wiki/File:X.jpg');
  });
  it('carries the full credit for a frame with room, when it is short enough for one line', () => {
    const credit = { chip: 'Pexels', full: 'Photo: Nextvoyage, Pexels', link: 'https://www.pexels.com/photo/1' };
    const [chip] = all(tree(creditChipHtml(credit)), 'a.ui-credit');
    expect(attr(chip, 'data-full')).toBe('Photo: Nextvoyage, Pexels');
    expect(textOf(chip)).toBe('Pexels');
    expect(textOf(all(chip, '.ui-credit-short')[0])).toBe('Pexels');
    expect(attr(all(tree(creditChipHtml({ ...credit, full: 'Photo: Barnabas Davoti, Pexels' })), 'a.ui-credit')[0], 'data-full')).toBe('Photo: Barnabas Davoti, Pexels');
    // A full credit of at most 26 letters is marked as short enough for a phone hero; a longer one is not.
    expect(attr(chip, 'data-full-size')).toBe('s');
    expect(attr(all(tree(creditChipHtml({ ...credit, full: 'Photo: Barnabas Davoti, Pexels' })), 'a.ui-credit')[0], 'data-full-size')).toBeNull();
    expect(attr(all(tree(creditChipHtml({ ...credit, full: 'Photo: A Name Of Some Length, Pexels' })), 'a.ui-credit')[0], 'data-full')).toBeNull();
    // A long licence line stays in the credits list: the chip keeps the short source at every width.
    const long = { chip: 'Wikimedia Commons', full: 'Photo: Ana Reis, CC BY-SA 4.0, Wikimedia Commons', link: 'https://commons.wikimedia.org/wiki/File:X.jpg' };
    expect(attr(all(tree(creditChipHtml(long)), 'a.ui-credit')[0], 'data-full')).toBeNull();
    // Nothing to add when the full line is the source, and hostile text stays text.
    expect(attr(all(tree(creditChipHtml({ ...credit, full: 'Pexels' })), 'a.ui-credit')[0], 'data-full')).toBeNull();
    const short = `"><img src=x>&'`;
    const hostile = tree(creditChipHtml({ chip: 'Pexels', full: `Photo: ${short}`, link: '' }));
    expect(all(hostile, 'img')).toHaveLength(0);
    expect(attr(all(hostile, 'span.ui-credit')[0], 'data-full')).toBe(`Photo: ${short}`);
  });
  it('gives nothing without a credit or without a source name', () => {
    expect(creditChipHtml(null)).toBe('');
    expect(creditChipHtml({ chip: '', full: 'x', link: 'https://example.test' })).toBe('');
  });
});

describe('the carry key', () => {
  it('names every frame image by its first address, so a patch can keep it after a fallback', () => {
    expect(attr(all(tree(coverFrameHtml(LEGACY)), 'img.ui-frame-img')[0], 'data-carry-key')).toBe(LEGACY.src);
    expect(attr(all(tree(thumbHtml({ src: '/img/a.jpg', alt: '' })), 'img.ui-frame-img')[0], 'data-carry-key')).toBe('/img/a.jpg');
  });
});

describe('room for the chip', () => {
  it('marks a frame that draws a credit chip, so text laid over the photo stays clear of it', () => {
    expect(classesOf(all(tree(coverFrameHtml(V2, { over: '<b>Kyoto</b>' })), '.ui-frame')[0])).toContain('ui-frame--credited');
    expect(classesOf(all(tree(coverFrameHtml(V2, { credit: false })), '.ui-frame')[0])).not.toContain('ui-frame--credited');
    expect(classesOf(all(tree(coverFrameHtml(NONE)), '.ui-frame')[0])).not.toContain('ui-frame--credited');
  });
});

describe('the credit chip as a target (css/views/shared/common.css)', () => {
  const { rules } = parseCss(readFileSync(new URL('../../../css/views/shared/common.css', import.meta.url), 'utf8'));
  /** What the sheet declares for exactly this selector, outside any at-rule. The last declaration of a property wins. */
  const declared = (selector) => Object.fromEntries(rules
    .filter((rule) => rule.at.length === 0 && rule.selectors.some((one) => one.trim() === selector))
    .flatMap((rule) => rule.declarations.map((declaration) => [declaration.prop, declaration.value])));
  const plain = declared('[data-view] :where(.ui-credit)');
  const linked = declared('[data-view] :where(a.ui-credit)');
  const pill = declared('[data-view] :where(a.ui-credit)::before');

  it('makes the link itself the 44 px target, and ends it at the corner of the frame so nothing of it is clipped', () => {
    expect(linked['min-width']).toBe('var(--ui-target)');
    expect(linked['min-height']).toBe('var(--ui-target)');
    expect([linked.right, linked.bottom]).toEqual(['0', '0']);
    expect(linked['box-sizing']).toBe('border-box');
  });
  it('draws the pill of a linked chip where the plain chip sits, with the same face', () => {
    expect([plain.right, plain.bottom]).toEqual(['6px', '6px']);
    expect([pill.right, pill.bottom]).toEqual([plain.right, plain.bottom]);
    expect(pill.background).toBe(plain.background);
    expect(pill['border-radius']).toBe(plain['border-radius']);
    expect(pill['z-index']).toBe('-1');
    expect(linked.background).toBe('none');
  });
  it('takes the face and the corner of both chips from two custom properties, so a skin restyles them in one place', () => {
    expect(plain.background).toBe('var(--ui-credit-face, rgba(0, 0, 0, 0.45))');
    expect(plain['border-radius']).toBe('var(--ui-credit-radius, var(--r-sm))');
    expect(pill.background).toBe(plain.background);
    expect(pill['border-radius']).toBe(plain['border-radius']);
  });
  it('keeps the text of a linked chip where the plain chip has it: 2 px and 6 px inside the pill', () => {
    expect(plain.padding).toBe('2px 6px');
    // bottom: 6 px to the pill + 2 px inside it; right: 6 + 6; left: the pill starts 18 px in, the text 6 px after
    expect(linked.padding).toBe('0 12px 8px 24px');
    expect(pill.left).toBe('18px');
    expect(pill.height).toBe('calc(1lh + 4px)');
  });
  it('shows keyboard focus on the pill, not around the larger target', () => {
    expect(declared('[data-view] :where(a.ui-credit:focus-visible)').outline).toBe('none');
    expect(declared('[data-view] :where(a.ui-credit:focus-visible)::before').outline).toMatch(/^2px solid /);
  });
});

describe('creditAt: the chip in the top right corner', () => {
  const css = parseCss(readFileSync(new URL('../../../css/views/shared/common.css', import.meta.url), 'utf8'));
  const credited = [V2, LEGACY].find((cover) => cover?.credit?.chip);

  it('marks the frame, and only a frame that shows a chip', () => {
    expect(credited).toBeTruthy();
    const frame = all(tree(coverFrameHtml(credited, { creditAt: 'top' })), '.ui-frame')[0];
    expect(classesOf(frame)).toEqual(expect.arrayContaining(['ui-frame--credited', 'ui-frame--credit-top']));
    expect(all(frame, '.ui-credit')).toHaveLength(1);
    expect(coverFrameHtml(credited, { creditAt: 'bottom' })).toBe(coverFrameHtml(credited));
    expect(coverFrameHtml(credited, { creditAt: 'top', credit: false })).not.toContain('ui-frame--credit-top');
    expect(coverFrameHtml(NONE, { creditAt: 'top' })).not.toContain('ui-frame--credit-top');
    expect(tileFrameHtml(credited, { creditAt: 'top' })).toContain('ui-frame--credit-top');
  });

  it('is placed by the shared sheet, linked chip and pill alike, and is let go with the chip when the image fails', () => {
    const rule = (selector) => css.rules.find((one) => one.selectors.includes(selector));
    const decl = (selector, prop) => rule(selector)?.declarations.find((one) => one.prop === prop)?.value;
    expect(decl('[data-view] :where(.ui-frame--credit-top > .ui-credit)', 'bottom')).toBe('auto');
    expect(decl('[data-view] :where(.ui-frame--credit-top > a.ui-credit)', 'top')).toBe('0');
    expect(decl('[data-view] :where(.ui-frame--credit-top > a.ui-credit)::before', 'top')).toBe('6px');
    expect(readFileSync(new URL('./photo-frame.js', import.meta.url), 'utf8')).toContain("frame.classList.remove('ui-frame--credited', 'ui-frame--credit-top');");
  });
});

describe('settleFade', () => {
  const image = ({ complete, loading = false }) => {
    const classes = new Set(loading ? ['ui-frame-img', 'is-loading'] : ['ui-frame-img']);
    const heard = {};
    return {
      complete, heard,
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
      addEventListener: (type, fn) => { heard[type] = fn; },
      removeEventListener: (type) => { delete heard[type]; },
    };
  };
  it('shows at once an image that has already loaded, also one a re-created page left marked as loading', () => {
    const img = image({ complete: true, loading: true });
    settleFade(img);
    expect(img.classList.contains('is-loading')).toBe(false);
    expect(img.heard).toEqual({});
  });
  it('hides an image that is still loading and shows it when it arrives, without help from the page root', () => {
    const img = image({ complete: false });
    settleFade(img);
    expect(img.classList.contains('is-loading')).toBe(true);
    img.complete = true;
    img.heard.load();
    expect(img.classList.contains('is-loading')).toBe(false);
  });
  it('keeps waiting while a fallback address loads, and shows an image that failed for good', () => {
    const img = image({ complete: false });
    settleFade(img);
    img.complete = false; // the root listener has already started the fallback load
    img.heard.error();
    expect(img.classList.contains('is-loading')).toBe(true);
    img.complete = true;
    img.heard.error();
    expect(img.classList.contains('is-loading')).toBe(false);
  });
});
