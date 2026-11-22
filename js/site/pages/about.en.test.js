// The About page in English: its data fits the frame, its own blocks are whole, and nothing a reader
// sees breaks the copy rules (the glyph and phrase rules of js/views/copy-rules.test.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import page, { mount } from './about.en.js';
import { drawableSections, hasToc, validatePage } from '../content.js';
import { sitePageHtml } from '../site-page.js';
import { ABOUT_DEFAULT_VIEW, ABOUT_VIEWS, demoHtml, limitsHtml, publicBase, squareHtml, stepsHtml, viewsHtml } from '../about/blocks.js';
import { MAX_DAYS, MIN_DAYS, SKETCH_PLACES } from '../about/plan-sketch.js';
import { DEFAULT_PREFS, VIEW_IDS } from '../../lib/prefs.js';

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const INFO = { operatorName: '', contactEmail: '', dataProtectionEmail: '', country: 'Singapore', siteUrl: 'https://example.test/' };
const html = sitePageHtml({ pageId: 'about', page, language: 'en', info: INFO });

const BANNED_GLYPHS = new Map([
  [0x2014, 'em dash'], [0x2013, 'en dash'], [0x00b7, 'middle dot'], [0x2022, 'bullet'], [0x2192, 'arrow'],
  [0x2026, 'ellipsis'], [0x2027, 'hyphenation point'], [0x2219, 'bullet operator'], [0x25cf, 'black circle'],
  [0x25e6, 'white bullet'], [0x2023, 'triangular bullet'], [0x2043, 'hyphen bullet'],
]);
const NAMED_ENTITIES = { mdash: 0x2014, ndash: 0x2013, middot: 0x00b7, centerdot: 0x00b7, bull: 0x2022, bullet: 0x2022, rarr: 0x2192, rightarrow: 0x2192, hellip: 0x2026, mldr: 0x2026, hybull: 0x2043 };

function glyphProblems(text) {
  const out = [];
  for (const char of text) {
    const name = BANNED_GLYPHS.get(char.codePointAt(0));
    if (name) out.push(name);
  }
  for (const match of text.matchAll(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi)) {
    const ref = match[1].toLowerCase();
    const code = ref[0] !== '#' ? NAMED_ENTITIES[ref] : ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    if (BANNED_GLYPHS.has(code)) out.push(match[0]);
  }
  for (const match of text.matchAll(/\\([0-9a-f]{2,6})\b/gi)) if (BANNED_GLYPHS.has(parseInt(match[1], 16))) out.push(match[0]);
  return out;
}
function phraseProblems(text) {
  const out = [];
  for (const phrase of [/trips you took/gi, /you went/gi, /\bvisited\b/gi, /\bseamless/gi, /\belevate/gi, /\bunlock/gi, /\bjourney/gi]) {
    for (const match of text.matchAll(phrase)) out.push(match[0]);
  }
  for (const match of text.matchAll(/forecast/gi)) {
    if (!/not a\s+$/i.test(text.slice(Math.max(0, match.index - 8), match.index))) out.push('forecast without "not a"');
  }
  return out;
}

describe('the About page', () => {
  it('fits the frame: every block draws, the ids are usable and used once', () => {
    expect(validatePage(page)).toEqual([]);
    const ids = page.sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(drawableSections(page)).toHaveLength(page.sections.length);
    expect(hasToc(page)).toBe(true);
  });
  it('has the sections the page promises, the data section linking to the privacy policy', () => {
    expect(page.sections.map((section) => section.id)).toEqual([
      'what-it-is', 'how-a-plan-is-made', 'what-it-does-and-does-not-do', 'views', 'your-data', 'who-makes-it', 'built-on', 'questions',
    ]);
    expect(html).toMatch(/id="site-your-data"[\s\S]*href="#\/privacy"/);
  });
  it('holds no banned glyph and no banned phrase, in the page as drawn or in its sources', () => {
    expect(glyphProblems(html)).toEqual([]);
    expect(phraseProblems(html)).toEqual([]);
    for (const file of ['./about.en.js', '../about/blocks.js', '../about/plan-sketch.js', '../about/mount.js', '../../../css/components/site-about.css']) {
      expect(glyphProblems(read(file)), file).toEqual([]);
    }
  });
  it('still reads when the owner has not supplied the contact details', () => {
    expect(html).toContain('site-pending');
    expect(html).not.toMatch(/\{(operator|contactEmail|dpoEmail|country|siteUrl)\}/);
  });
  it('asks real questions with real disclosure widgets', () => {
    expect(html.match(/<details class="site-faq-item"/g).length).toBeGreaterThanOrEqual(8);
  });
  it('exports a mount for the frame', () => {
    expect(typeof mount).toBe('function');
  });
});

describe('the About blocks', () => {
  it('the sketch offers every place and length, shows the first plan, and keeps its controls hidden until bound', () => {
    const demo = demoHtml({ legendPlace: 'Place', legendDays: 'Length', daysOption: '{n} days', note: 'Note' });
    for (const place of SKETCH_PLACES) expect(demo).toContain(`value="${place.id}"`);
    for (let n = MIN_DAYS; n <= MAX_DAYS; n += 1) expect(demo).toContain(`name="about-days" value="${n}"`);
    expect(demo.match(/ checked>/g)).toHaveLength(2);
    expect(demo).toMatch(/<form[^>]*data-about-controls hidden>/);
    expect(demo).toContain('class="about-day"');
    expect(demo).toContain('aria-live="polite"');
  });
  it('the steps are native disclosures in an ordered list, the first one open, each but the last with a way on', () => {
    const steps = stepsHtml({ openAll: 'Open', closeAll: 'Close', next: 'Next: {title}', steps: [
      { title: 'One', summary: 'a', body: 'First **text**' }, { title: 'Two', summary: 'b', body: ['x', 'y'] }, { title: '<Three>', summary: 'c', body: 'z' },
    ] });
    expect(steps.match(/<details /g)).toHaveLength(3);
    expect(steps.match(/<details [^>]* open>/g)).toHaveLength(1);
    expect(steps.match(/data-about-next hidden/g)).toHaveLength(2);
    expect(steps).toContain('Next: Two');
    expect(steps).toContain('Next: &lt;Three&gt;');
    expect(steps).toContain('<strong>text</strong>');
    expect(steps).toMatch(/<ol class="about-steps">/);
  });
  it('the page has seven steps and two lists of real list items', () => {
    expect(html.match(/data-about-step[ >]/g)).toHaveLength(7);
    expect(html.match(/<section class="about-panel /g)).toHaveLength(2);
    const panels = limitsHtml({ does: { title: 'A', items: ['one', 'two'] }, doesNot: { title: 'B', items: ['three'] } });
    expect(panels.match(/<li>/g)).toHaveLength(3);
  });
  it('the view switch shows the app\'s three views with the picker images, the default one checked', () => {
    expect([...ABOUT_VIEWS].sort()).toEqual([...VIEW_IDS].sort());
    expect(ABOUT_DEFAULT_VIEW).toBe(DEFAULT_PREFS.view);
    const words = { legend: 'View', isDefault: 'Default', alt: 'The {view} view', views: Object.fromEntries(ABOUT_VIEWS.map((id) => [id, { name: id, text: 'Text' }])) };
    const views = viewsHtml(words, { baseUrl: '/TrippyPWA/' });
    for (const id of ABOUT_VIEWS) {
      expect(views).toContain(`src="/TrippyPWA/img/views/${id}-dark.webp"`);
      expect(views).toContain(`src="/TrippyPWA/img/views/${id}-light.webp"`);
      expect(views).toContain(`data-about-view="${id}"`);
    }
    expect(views).toMatch(new RegExp(`value="${ABOUT_DEFAULT_VIEW}" checked`));
    expect(views.match(/ checked>/g)).toHaveLength(1);
    expect(views).not.toMatch(/alt=""/);
  });
  it('every image the page shows is a file in public/', () => {
    const sources = [...html.matchAll(/<img[^>]* src="\/([^"]+)"/g)].map((match) => match[1]);
    expect(sources.length).toBe(8);
    for (const source of sources) expect(() => read(`../../../public/${source}`), source).not.toThrow();
  });
  it('the square picture carries its words and its credit', () => {
    const square = squareHtml({ alt: 'Alt', text: ['One', 'Two'], credit: 'Photo from [Commons](https://commons.wikimedia.org/)' }, { baseUrl: '/' });
    expect(square).toContain('src="/img/about/square-dark.webp"');
    expect(square).toContain('href="https://commons.wikimedia.org/"');
  });
  it('publicBase accepts a site path only', () => {
    expect(publicBase('/TrippyPWA')).toBe('/TrippyPWA/');
    expect(publicBase('/')).toBe('/');
    expect(publicBase('//evil.example/')).toBe('/');
    expect(publicBase(undefined)).toBe('/');
  });
});
