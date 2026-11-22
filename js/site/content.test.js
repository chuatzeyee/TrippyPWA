// Content data to markup: every block type, escaping, links, the facts and their placeholder.
import { describe, it, expect } from 'vitest';
import {
  TOC_FROM, blockHtml, drawableSections, factPlaces, formatUpdated, hasToc, inlineHtml, sectionsHtml, tocHtml, validatePage,
} from './content.js';
import { tFor } from '../lib/i18n.js';

const t = tFor('en');
const HOSTILE = '<img src=x onerror=alert(1)>"\'&';
const INFO = { operatorName: 'Example Pte. Ltd.', contactEmail: 'hello@example.test', dataProtectionEmail: 'dpo@example.test', country: 'Singapore', siteUrl: 'https://example.test/app/' };
const section = (id, blocks = [{ type: 'p', text: 'Body' }]) => ({ id, heading: `Heading ${id}`, blocks });

describe('inlineHtml', () => {
  it('escapes everything it is given', () => {
    const html = inlineHtml(HOSTILE);
    expect(html).not.toContain('<img');
    expect(html).toBe('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
  });
  it('makes strong text and links', () => {
    expect(inlineHtml('Read the **privacy policy** now')).toBe('Read the <strong>privacy policy</strong> now');
    expect(inlineHtml('See [the terms](#/terms).')).toBe('See <a href="#/terms">the terms</a>.');
    expect(inlineHtml('[Consent](#/privacy/consent)')).toBe('<a href="#/privacy/consent">Consent</a>');
    expect(inlineHtml('[PDPC](https://www.pdpc.gov.sg/?a=1&b=2)')).toBe('<a href="https://www.pdpc.gov.sg/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">PDPC</a>');
    expect(inlineHtml('[write](mailto:a@example.test)')).toBe('<a href="mailto:a@example.test">write</a>');
  });
  it('leaves a link it will not follow as text', () => {
    for (const target of ['javascript:alert(1)', 'data:text/html,x', '//evil.test', '#section', 'ftp://x']) {
      const html = inlineHtml(`[x](${target})`);
      expect(html).not.toContain('<a');
    }
    expect(inlineHtml('[x](https://a.test/"onmouseover="1)')).not.toContain('<a');
  });
  it('fills the facts and leaves an unknown place as written', () => {
    const places = factPlaces(INFO, t);
    expect(inlineHtml('Run by {operator} in {country}.', { places })).toBe('Run by Example Pte. Ltd. in Singapore.');
    expect(inlineHtml('Write to {dpoEmail}', { places })).toBe('Write to <a href="mailto:dpo@example.test">dpo@example.test</a>');
    expect(inlineHtml('{contactEmail} {siteUrl}', { places })).toContain('<a href="https://example.test/app/">');
    expect(inlineHtml('{nothing}', { places })).toBe('{nothing}');
  });
});

describe('factPlaces', () => {
  it('prints the placeholder sentence for a fact the owner has not supplied, never an invented one', () => {
    const places = factPlaces({ operatorName: '', contactEmail: '  ', dataProtectionEmail: undefined, country: 'Singapore', siteUrl: '' }, t);
    const pending = '<span class="site-pending">Contact details will be published here before launch</span>';
    expect(places.operator).toBe(pending);
    expect(places.contactEmail).toBe(pending);
    expect(places.dpoEmail).toBe(pending);
    expect(places.siteUrl).toBe(pending);
    expect(places.country).toBe('Singapore');
  });
  it('escapes a fact and refuses an address that is not one', () => {
    const places = factPlaces({ operatorName: HOSTILE, contactEmail: 'x"onclick=1@a.b', siteUrl: 'javascript:alert(1)' }, t);
    expect(places.operator).not.toContain('<img');
    expect(places.contactEmail).toContain('site-pending');
    expect(places.siteUrl).toContain('site-pending');
  });
  it('speaks the language it is given', () => {
    expect(factPlaces({}, (key) => `[${key}]`).operator).toContain('[site.contactPending]');
  });
});

describe('blockHtml', () => {
  it('p', () => {
    expect(blockHtml({ type: 'p', text: 'One **two**' })).toBe('<p>One <strong>two</strong></p>');
    expect(blockHtml({ type: 'p', text: '' })).toBe('');
  });
  it('subheading', () => {
    expect(blockHtml({ type: 'subheading', text: 'Smaller' })).toBe('<h3 class="site-subheading">Smaller</h3>');
  });
  it('list, ordered or not, one level of nesting', () => {
    expect(blockHtml({ type: 'list', items: ['a', 'b'] })).toBe('<ul class="site-list"><li>a</li><li>b</li></ul>');
    expect(blockHtml({ type: 'list', ordered: true, items: ['a'] })).toBe('<ol class="site-list"><li>a</li></ol>');
    expect(blockHtml({ type: 'list', items: [{ text: 'a', items: ['a1', 'a2'] }, 'b'] }))
      .toBe('<ul class="site-list"><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b</li></ul>');
    expect(blockHtml({ type: 'list', items: [] })).toBe('');
  });
  it('defs: a term and one or more paragraphs', () => {
    const html = blockHtml({ type: 'defs', rows: [{ term: 'Personal data', text: 'Data about you.' }, { term: 'We', text: ['One.', 'Two.'] }] });
    expect(html).toBe('<dl class="site-defs"><div class="site-def"><dt>Personal data</dt><dd><p>Data about you.</p></dd></div>'
      + '<div class="site-def"><dt>We</dt><dd><p>One.</p><p>Two.</p></dd></div></dl>');
  });
  it('table: column headers, optional row headers and a caption that also names the scroll region', () => {
    const html = blockHtml({ type: 'table', caption: 'What we keep', head: ['Data', 'Why'], rows: [['Email', 'Sign-in'], ['Trips', 'Your plans']], rowHeads: true });
    expect(html).toContain('<div class="site-table-wrap" role="region" tabindex="0" aria-label="What we keep">');
    expect(html).toContain('<caption>What we keep</caption>');
    expect(html).toContain('<thead><tr><th scope="col">Data</th><th scope="col">Why</th></tr></thead>');
    expect(html).toContain('<tr><th scope="row">Email</th><td data-label="Why">Sign-in</td></tr>');
    expect(blockHtml({ type: 'table', head: ['A'], rows: [['x']] })).toContain('<td data-label="A">x</td>');
    expect(blockHtml({ type: 'table', head: [], rows: [['x']] })).toBe('');
    expect(blockHtml({ type: 'table', head: ['A'], rows: [] })).toBe('');
  });
  it('note, with or without a title', () => {
    expect(blockHtml({ type: 'note', title: 'In short', text: 'We do not sell data.' }))
      .toBe('<aside class="site-note"><p class="site-note-title">In short</p><p>We do not sell data.</p></aside>');
    expect(blockHtml({ type: 'note', text: ['a', 'b'] })).toBe('<aside class="site-note"><p>a</p><p>b</p></aside>');
  });
  it('cards', () => {
    expect(blockHtml({ type: 'cards', items: [{ title: 'Plan', text: 'Day by day.' }] }))
      .toBe('<ul class="site-cards"><li class="site-card"><h3 class="site-card-title">Plan</h3><p>Day by day.</p></li></ul>');
  });
  it('faq: questions that open natively', () => {
    expect(blockHtml({ type: 'faq', items: [{ q: 'Is it free', a: ['Yes.', 'Really.'] }] }))
      .toBe('<div class="site-faq"><details class="site-faq-item"><summary>Is it free</summary><div class="site-faq-answer"><p>Yes.</p><p>Really.</p></div></details></div>');
  });
  it('custom markup is printed as written', () => {
    expect(blockHtml({ type: 'custom', html: '<figure class="x"></figure>' })).toBe('<figure class="x"></figure>');
  });
  it('escapes every text of every block', () => {
    const blocks = [
      { type: 'p', text: HOSTILE }, { type: 'subheading', text: HOSTILE }, { type: 'list', items: [HOSTILE, { text: HOSTILE, items: [HOSTILE] }] },
      { type: 'defs', rows: [{ term: HOSTILE, text: HOSTILE }] }, { type: 'table', caption: HOSTILE, head: [HOSTILE], rows: [[HOSTILE]], rowHeads: true },
      { type: 'table', head: [HOSTILE, HOSTILE], rows: [[HOSTILE, HOSTILE]] },
      { type: 'note', title: HOSTILE, text: HOSTILE }, { type: 'cards', items: [{ title: HOSTILE, text: HOSTILE }] }, { type: 'faq', items: [{ q: HOSTILE, a: HOSTILE }] },
    ];
    for (const block of blocks) {
      const html = blockHtml(block);
      expect(html, block.type).not.toContain('<img');
      expect(html, block.type).not.toMatch(/="[^"]*"[^ >\/]/); // no attribute broken open by a quote
    }
  });
  it('a block of an unknown type, or no block, prints nothing', () => {
    expect(blockHtml({ type: 'carousel', text: 'x' })).toBe('');
    expect(blockHtml({ type: 'constructor' })).toBe('');
    expect(blockHtml(null)).toBe('');
  });
});

describe('sections and the list of them', () => {
  const page = { title: 'T', sections: [section('one'), section('two'), section('three')] };
  it('draws each section with an id, a labelled heading that can take focus, and its blocks', () => {
    const html = sectionsHtml(page);
    expect(html).toContain('<section class="site-section" id="site-one" data-site-section="one" aria-labelledby="site-one-title">');
    expect(html).toContain('<h2 class="site-section-title" id="site-one-title" tabindex="-1">Heading one</h2>');
    expect(html.match(/<section /g)).toHaveLength(3);
  });
  it('drops a section with a bad or repeated id, or no heading', () => {
    const bad = { sections: [section('Bad Id'), section('ok'), section('ok'), { id: 'no-heading', blocks: [] }, section('a"b')] };
    expect(drawableSections(bad).map((s) => s.id)).toEqual(['ok']);
  });
  it(`lists the sections from ${TOC_FROM} up, or when the page says so`, () => {
    expect(hasToc(page)).toBe(true);
    expect(hasToc({ sections: [section('a'), section('b')] })).toBe(false);
    expect(hasToc({ toc: true, sections: [section('a')] })).toBe(true);
    expect(hasToc({ ...page, toc: false })).toBe(false);
    expect(tocHtml('about', { sections: [section('a')] }, t)).toBe('');
  });
  it('each entry is a real address of the section', () => {
    const html = tocHtml('privacy', page, t);
    expect(html).toContain('<summary class="site-toc-title" id="site-toc-title">On this page</summary>');
    expect(html).toContain('<a class="site-toc-link" href="#/privacy/two" data-site-jump="two">Heading two</a>');
    expect(html.match(/<li>/g)).toHaveLength(3);
  });
});

describe('validatePage', () => {
  it('passes a page that can be drawn in full', () => {
    expect(validatePage({ title: 'About', intro: 'Hello', sections: [section('what')] })).toEqual([]);
  });
  it('names what is wrong', () => {
    expect(validatePage(null)).toEqual(['The page is not an object']);
    const problems = validatePage({ title: '', intro: [], sections: [section('Bad'), section('a'), section('a'), { id: 'b', heading: 'B', blocks: [{ type: 'p', text: '' }, { type: 'video' }] }] });
    expect(problems).toContain('The page has no title');
    expect(problems).toContain('The intro is empty');
    expect(problems.some((line) => line.includes('lower case'))).toBe(true);
    expect(problems.some((line) => line.includes('used twice'))).toBe(true);
    expect(problems.some((line) => line.includes('draws nothing'))).toBe(true);
    expect(problems.some((line) => line.includes('unknown type "video"'))).toBe(true);
  });
});

describe('formatUpdated', () => {
  it('writes the date in the language of the page', () => {
    expect(formatUpdated('2026-11-22', 'en')).toBe('22 November 2026');
    expect(formatUpdated('2026-11-22', 'fi')).toBe('22. marraskuuta 2026');
    expect(formatUpdated('2026-11-22', 'zh-Hans')).toBe('2026年11月22日');
    expect(formatUpdated('2026-11-22', 'ms')).toBe('22 November 2026');
  });
  it('gives nothing for no date', () => {
    expect(formatUpdated(null)).toBe('');
    expect(formatUpdated('yesterday')).toBe('');
  });
});
