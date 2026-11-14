import { describe, it, expect } from 'vitest';
import { heroHtml, heroCreditHtml } from './trip-hero.js';

const hero = (credit) => ({
  src: 'https://s/cover-v2-1280w-a1b2c3d4.jpg', srcset: 'https://s/cover-v2-1280w-a1b2c3d4.jpg 1280w, https://s/cover-v2-2400w-a1b2c3d4.jpg 2400w',
  sizes: '(min-width:1024px) 80vw, 100vw', focusY: 38, credit,
});
const commons = { text: 'Photo: Christopher Crouzet, CC BY-SA 4.0, Wikimedia Commons', link: 'https://commons.wikimedia.org/wiki/File:X.jpg' };

describe('heroCreditHtml', () => {
  it('puts the whole credit in a title, so a line cut short on a phone can still be read', () => {
    expect(heroCreditHtml(hero(commons))).toBe(
      `<a class="td-hero-credit" href="${commons.link}" target="_blank" rel="noopener noreferrer" title="${commons.text}">${commons.text}</a>`,
    );
    expect(heroCreditHtml(hero({ text: 'Photo: A "B" <C>', link: '' })))
      .toBe('<span class="td-hero-credit" title="Photo: A &quot;B&quot; &lt;C&gt;">Photo: A &quot;B&quot; &lt;C&gt;</span>');
    expect(heroCreditHtml(hero(null))).toBe('');
  });
});

describe('heroHtml', () => {
  it('marks a hero that carries a credit, so phones give the credit its own line', () => {
    expect(heroHtml(hero(commons), { title: 'Sapporo' })).toMatch(/<div class="td-hero td-hero--credit" id="td-hero" style="--hero-focus-y: 38%">/);
    expect(heroHtml(hero(null), { title: 'Sapporo' })).toMatch(/<div class="td-hero" id="td-hero"/);
  });
});
