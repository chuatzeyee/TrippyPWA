import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { docxToText } from './docx-text.js';

const p = (text, pPr = '') => `<w:p><w:pPr>${pPr}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const docx = (body) => zipSync({
  'word/document.xml': strToU8(`<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`),
  'word/media/image1.png': new Uint8Array([1, 2, 3]),
});

describe('docxToText', () => {
  it('reads paragraphs, headings, list items and table rows in order, without pictures', async () => {
    const text = await docxToText(docx([
      p('Lisbon in spring', '<w:pStyle w:val="Title"/>'),
      p('Day 1', '<w:pStyle w:val="Heading2"/>'),
      p('Tram 28 &amp; the castle'),
      '<w:p><w:r><w:drawing><wp:docPr descr="a photo"/></w:drawing></w:r></w:p>',
      p('Pastel de nata', '<w:numPr><w:ilvl w:val="0"/></w:numPr>'),
      `<w:tbl><w:tr><w:tc>${p('9:00 AM')}</w:tc><w:tc>${p('Bel&#233;m Tower')}</w:tc></w:tr></w:tbl>`,
      '<w:p><w:r><w:t>Split </w:t></w:r><w:r><w:t>runs</w:t><w:br/><w:t>next line</w:t></w:r></w:p>',
    ].join('')));
    expect(text).toBe('# Lisbon in spring\n## Day 1\nTram 28 & the castle\n- Pastel de nata\n9:00 AM | Belém Tower\nSplit runs\nnext line');
  });

  it('rejects a zip that is not a Word document', async () => {
    await expect(docxToText(zipSync({ 'a.txt': strToU8('x') }))).rejects.toThrow();
    await expect(docxToText(strToU8('plain text'))).rejects.toThrow();
  });
});
