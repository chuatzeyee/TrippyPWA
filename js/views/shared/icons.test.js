// icons.js: one line-icon family as SVG strings (blueprint 1.3). Owner: F5.
import { describe, it, expect } from 'vitest';
import { icon, ICON_NAMES } from './icons.js';
import { parseHtml, all, attr } from '../fixtures/checks/html-tree.js';

describe('icon', () => {
  it('knows the icons the shared components and the transport modes need', () => {
    for (const name of ['plane', 'train', 'bus', 'ferry', 'car', 'taxi', 'home', 'search', 'close', 'check', 'chevron-right', 'chevron-down',
      'plus', 'import', 'refresh', 'warning', 'clock', 'calendar', 'people', 'bed', 'passport', 'ticket', 'pin', 'image', 'more', 'share',
      'file', 'edit', 'trash', 'bell', 'offline', 'expand', 'back', 'map', 'sun', 'cloud', 'wallet', 'settings', 'info']) {
      expect(ICON_NAMES).toContain(name);
    }
  });
  it.each(ICON_NAMES)('%s is one well-formed, hidden, stroked SVG', (name) => {
    const { root, errors } = parseHtml(icon(name));
    expect(errors).toEqual([]);
    const svgs = all(root, 'svg');
    expect(svgs).toHaveLength(1);
    const [svg] = svgs;
    expect(attr(svg, 'class')).toBe('ui-icon');
    expect(attr(svg, 'aria-hidden')).toBe('true');
    expect(attr(svg, 'focusable')).toBe('false');
    expect(attr(svg, 'viewbox')).toBe('0 0 24 24');
    expect(attr(svg, 'fill')).toBe('none');
    expect(attr(svg, 'stroke')).toBe('currentColor');
    expect(svg.children.length).toBeGreaterThan(0);
  });
  it('has a ring and a check in a circle, for a list of steps (final wave)', () => {
    expect(ICON_NAMES).toEqual(expect.arrayContaining(['ring', 'check-circle']));
    expect(icon('ring')).toContain('<circle cx="12" cy="12" r="8.5"/>');
  });
  it('is 20 px by default and takes a size', () => {
    expect(icon('plane')).toContain('width="20" height="20"');
    expect(icon('plane', 28)).toContain('width="28" height="28"');
  });
  it('falls back to 20 px for a size that is not a sensible number', () => {
    for (const bad of ['"><script>', -4, 0, NaN, 9999, null]) expect(icon('plane', bad)).toContain('width="20" height="20"');
  });
  it('gives nothing for a name it does not know', () => {
    expect(icon('nope')).toBe('');
    expect(icon('"><script>')).toBe('');
    expect(icon('constructor')).toBe('');
    expect(icon()).toBe('');
  });
});
