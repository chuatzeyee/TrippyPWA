// The shared sheets: rules of the final pass that a later edit could quietly undo. Owner: SH.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (file) => readFileSync(ROOT + file, 'utf8');
const common = read('css/views/shared/common.css');
const maps = read('css/views/shared/maps.css');
/** The declarations of the first rule whose selector is exactly `selector`. */
const block = (css, selector) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? null : css.slice(at + selector.length + 2, css.indexOf('}', at));
};

describe('common.css', () => {
  it('small text on a light surface does not use the ghost ink or a faded count', () => {
    expect(block(common, '[data-view] :where(.dv-search-input)::placeholder')).toMatch(/color: var\(--ink-secondary\)/);
    expect(block(common, '[data-view] :where(.ui-chip-count)')).not.toMatch(/opacity/);
  });
  it('draws the radio of a view card itself, so an unselected one is an empty ring in both themes', () => {
    const radio = block(common, '[data-view] :where(.ui-picker-radio)');
    expect(radio).toMatch(/appearance: none/);
    expect(radio).toMatch(/border: 2px solid var\(--ink-secondary\)/);
    expect(radio).toMatch(/background-color: transparent/);
    expect(block(common, '[data-view] :where(.ui-picker-radio:checked)')).toMatch(/radial-gradient\(circle, var\(--terracotta\)/);
    expect(common).toMatch(/@media \(forced-colors: active\) \{\s*\[data-view\] :where\(\.ui-picker-radio\) \{ appearance: auto;/);
  });
  it('fades a sideways scroller at the edge where it is cut, by its own scroll position', () => {
    const rule = /@supports \(animation-timeline: scroll\(\)\) \{\s*\[data-view\] :where\(([^)]*(?:\([^)]*\))?[^)]*)\) \{\s*animation: ui-scroll-fade linear both;\s*animation-timeline: scroll\(self inline\);/.exec(common);
    expect(rule).not.toBeNull();
    for (const hook of ['.ui-scroll-fade', '.dv-chips', '.tv-days--strip', '.tv-map-days', '.ui-picker--compact .ui-picker-cards']) expect(rule[1]).toContain(hook);
    const frames = common.slice(common.indexOf('@keyframes ui-scroll-fade'));
    expect(frames).toMatch(/0% \{[^}]*mask-image: linear-gradient\(to right, #000 calc\(100% - 32px\), transparent\)/);
    expect(frames).toMatch(/100% \{[^}]*mask-image: linear-gradient\(to right, transparent, #000 32px\)/);
  });
  it('shows the full credit only where a frame has room for it', () => {
    expect(common).toMatch(/\[data-view\] :where\(\.ui-frame:has\(> \.ui-credit\[data-full\]\)\) \{ container: ui-frame \/ inline-size; \}/);
    expect(common).toMatch(/@container ui-frame \(min-width: 320px\) \{\s*\[data-view\] :where\(\.ui-credit\[data-full\] > \.ui-credit-short\) \{ display: none; \}\s*\[data-view\] :where\(\.ui-credit\[data-full\]\)::after \{ content: attr\(data-full\); \}/);
  });
});

describe('maps.css', () => {
  it('keeps the base map calm in both themes: little colour, low contrast, let through to the plate', () => {
    const filters = [...maps.matchAll(/--tv-map-tile-filter: ([^;]+);/g)].map((match) => match[1]);
    expect(filters).toHaveLength(2);
    for (const filter of filters) {
      expect(Number(/saturate\(([\d.]+)\)/.exec(filter)[1])).toBeLessThanOrEqual(0.3);
      expect(Number(/contrast\(([\d.]+)\)/.exec(filter)[1])).toBeLessThanOrEqual(0.8);
      expect(Number(/opacity\(([\d.]+)\)/.exec(filter)[1])).toBeLessThan(0.9);
    }
    expect(filters[0]).toMatch(/^invert\(1\) hue-rotate\(180deg\)/);
  });
  it('shows keyboard focus on a map pin in the ink, which holds on the light plate', () => {
    expect(block(maps, '[data-view] :where(.wm-pin:focus-visible .wm-hit)')).toMatch(/stroke: var\(--ink\)/);
  });
  it('the trip map moves in whole zoom levels, so tiles are never scaled (no lines between them)', () => {
    const source = read('js/views/shared/trip-map.js');
    expect(source).toMatch(/const ZOOM_SNAP = 1;/);
    expect(source).toMatch(/zoomSnap: ZOOM_SNAP,/);
  });
});
