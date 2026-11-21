// What css/components/settings.css must keep true and no browser is needed to see: small text that
// stays readable in both themes, and a view picker whose radio is not drawn over the preview. Owner: F12.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCss } from '../views/fixtures/checks/css-spec.js';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const SHEET = parseCss(read('css/components/settings.css'));
const TOKENS = read('css/tokens.css');

/** The declarations of one selector, later rules winning; `at` picks the rules inside one at-rule ('' for none). */
function declared(selector, at = '') {
  const rules = SHEET.rules.filter((rule) => rule.selectors.includes(selector) && (rule.at ?? []).join(' ').includes(at) && (at !== '' || (rule.at ?? []).length === 0));
  return Object.fromEntries(rules.flatMap((rule) => rule.declarations.map(({ prop, value }) => [prop, value])));
}

/** A colour token of one theme, as #RRGGBB. */
function token(name, theme) {
  const light = TOKENS.indexOf('[data-theme="light"] {');
  const block = theme === 'light' ? TOKENS.slice(light, TOKENS.indexOf('}', light)) : TOKENS.slice(0, light);
  return new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(block)?.[1] ?? null;
}
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('the sheet can be read', () => {
  it('parses without errors', () => {
    expect(SHEET.errors).toEqual([]);
    expect(SHEET.rules.length).toBeGreaterThan(100);
  });
});

describe('the placeholder of a text field', () => {
  const placeholder = declared('.st-page .st-input::placeholder');
  const field = declared('.st-page .st-input');
  const name = (value) => /^var\((--[\w-]+)\)$/.exec(value ?? '')?.[1];

  it('is drawn in a token, at full strength, on the field background', () => {
    expect(name(placeholder.color)).toBeTruthy();
    expect(placeholder.opacity).toBe('1');
    expect(name(field.background)).toBe('--surface-inset');
  });
  it.each(['dark', 'light'])('reads at 4.5 to 1 or better in the %s theme', (theme) => {
    const ink = token(name(placeholder.color), theme);
    const paper = token('--surface-inset', theme);
    expect(ink).toBeTruthy();
    expect(paper).toBeTruthy();
    expect(contrast(ink, paper)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the view picker from 640 px, where the preview fills the top of the card', () => {
  const WIDE = '(min-width: 640px)';
  it('lays the radio out beside the name, not over the preview', () => {
    const radio = declared('.st-page .ui-picker-radio', WIDE);
    expect(radio.position).toBe('static');
    const card = declared('.st-page .ui-picker-card', WIDE);
    expect(card.display).toBe('grid');
    const shot = declared('.st-page .ui-picker-shot', WIDE);
    expect(shot['grid-column']).toBe('1 / -1');
    expect(shot['grid-row']).toBe('1');
    expect(radio['grid-row']).toBe(declared('.st-page .ui-picker-text', WIDE)['grid-row']);
  });
});

describe('the radio of a view card', () => {
  it('is drawn by the sheet, so it looks the same in both themes: a ring, filled when it is the choice', () => {
    const radio = declared('.st-page .ui-picker-radio');
    expect(radio.appearance).toBe('none');
    expect(radio['border-radius']).toBe('50%');
    expect(radio.border).toMatch(/^2px solid var\(--[\w-]+\)$/);
    const checked = declared('.st-page .ui-picker-radio:checked');
    expect(checked['border-color']).toBe('var(--terracotta)');
    expect(checked['background-image'] ?? checked.background).toMatch(/var\(--terracotta\)/);
  });
  it('goes back to the native radio when the system forces its own colours', () => {
    expect(declared('.st-page .ui-picker-radio', '(forced-colors: active)').appearance).toBe('auto');
  });
});

describe('the "On this page" list', () => {
  const WIDE = '(min-width: 1024px)';
  it('marks the section the page is on in the rail, with more than colour', () => {
    const mark = declared('.st-page .st-toc-chip[aria-current="true"]', WIDE);
    expect(mark.color).toBe('var(--ink)');
    expect(mark['box-shadow']).toMatch(/inset .*var\(--terracotta\)/);
    expect(mark['font-weight']).toBe('600');
  });
  it.each([['end', /to right, #000 .*transparent\)$/], ['start', /to right, transparent, #000 [^,]*\)$/], ['both', /to right, transparent, #000 .*#000 .*transparent\)$/]])('fades the %s of the chip row where chips are cut', (edge, shape) => {
    const cut = declared(`.st-page .st-toc-list[data-st-cut="${edge}"]`);
    expect(cut['mask-image']).toMatch(shape);
    expect(cut['-webkit-mask-image']).toBe(cut['mask-image']);
  });
  it('leaves a row with nothing cut whole', () => {
    expect(declared('.st-page .st-toc-list[data-st-cut="none"]')['mask-image']).toBeUndefined();
    expect(declared('.st-page .st-toc-list')['mask-image']).toBeUndefined();
  });
  it('does not scroll sideways as a rail, so nothing is cut and nothing fades there', () => {
    expect(declared('.st-page .st-toc-list', WIDE).overflow).toBe('visible');
    expect(declared('.st-page .st-toc-list')['overflow-x']).toBe('auto');
  });
});
