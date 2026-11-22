// Plain text of a Word .docx file, in reading order. Runs on the device: the
// file is unzipped with fflate (loaded on demand) and word/document.xml is
// scanned. Headings become "# ", list items "- ", table rows one line with
// " | " between cells. Pictures carry no text and are skipped.

const MAX_XML_BYTES = 50_000_000; // refuse a zip that unpacks to something absurd

const TOKEN = /<w:(p|tr|tc)(?: [^>]*)?>|<\/w:(p|tr)>|<w:pStyle w:val="([^"]*)"|<w:(numPr)\b|<w:(tab|br|cr)\b[^>]*>|<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] !== '#') return ENTITIES[e] ?? all;
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : '';
  });
}

/** @param {string} xml the content of word/document.xml @returns {string} */
export function documentXmlToText(xml) {
  const lines = [];
  const rows = []; // open table rows (nested tables stack); each row is a list of cells
  let para = null;
  const outer = []; // paragraphs that hold a text box whose own paragraphs are open
  // Text boxes are stored twice; the fallback copy is dropped.
  for (const m of xml.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '').matchAll(TOKEN)) {
    const [tag, open, close, style, numbered, space, text] = m;
    if (open === 'p') {
      if (tag.endsWith('/>')) continue;
      if (para) outer.push(para);
      para = { text: '', prefix: '' };
    }
    else if (open === 'tr') rows.push([]);
    else if (open === 'tc') rows[rows.length - 1]?.push([]);
    else if (style !== undefined && para) {
      const heading = /^(?:heading|title)\s*(\d)?/i.exec(style);
      if (heading) para.prefix = `${'#'.repeat(Number(heading[1]) || 1)} `;
      else if (/list/i.test(style)) para.prefix = '- ';
    } else if (numbered && para && !para.prefix) para.prefix = '- ';
    else if (space && para) para.text += space === 'tab' ? ' ' : '\n';
    else if (text !== undefined && para) para.text += decode(text);
    else if (close === 'p' && para) {
      const cell = rows[rows.length - 1]?.at(-1);
      const line = para.text.trim();
      if (line && cell) cell.push(line.replace(/\s+/g, ' '));
      else if (line) lines.push(para.prefix + line);
      para = outer.pop() || null;
    } else if (close === 'tr') {
      const line = (rows.pop() || []).map(c => c.join(' ')).filter(Boolean).join(' | ');
      if (line) lines.push(line);
    }
  }
  return lines.join('\n');
}

/**
 * @param {Uint8Array} bytes the .docx file
 * @returns {Promise<string>} its text; throws when the file is not a Word document
 */
export async function docxToText(bytes) {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(bytes, { filter: f => f.name === 'word/document.xml' && f.originalSize <= MAX_XML_BYTES });
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('Not a Word document');
  return documentXmlToText(strFromU8(xml));
}
