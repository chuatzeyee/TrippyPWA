// Finding and parsing the trip data in pasted text, for trip-import.js.
// Pure: no DOM, no network.
//
// extractJson finds the data inside whatever was pasted: a plain file, an AI
// chat reply with prose and ```json fences around it, or two replies pasted
// together after the assistant was told to "continue". lenientParse accepts
// // and /* */ comments, trailing commas and curly quotes, and turns syntax
// errors into a line and column.

export const PARSE_MESSAGES = {
  noData: "We couldn't find any trip data. Paste the assistant's reply that starts with { and ends with }.",
  cutOff: 'Your trip data is cut off at the end. Ask the assistant to continue, then paste both parts here together.',
  syntax: 'There is a formatting problem in the trip data. A comma, quote or bracket is missing.',
};

const syntaxAt = (line, col, near) =>
  `There is a formatting problem on line ${line}, column ${col}. A comma, quote or bracket is missing near: ${near}`;

// Lines after the data in a fence that was never closed ("Here is the rest:").
const PROSE_LINE = /^[A-Za-z][^"{}[\]]*$/;

function dropTrailingProse(lines) {
  const out = [...lines];
  while (out.length) {
    const t = out[out.length - 1].text.trim();
    if (t && !(PROSE_LINE.test(t) && !/^(true|false|null)\b/.test(t))) break;
    out.pop();
  }
  return out;
}

// ``` fenced blocks, scanned line by line. A block that is never closed (a
// reply that was cut off) ends at the next opening fence or the end of the
// text. Each block keeps the offset of its first character in `text`, and
// whether a closing fence ended it (then the reply itself was complete).
function fencedBlocks(text) {
  const blocks = [];
  let open = null;
  let offset = 0;
  const finish = (closedByFence) => {
    const lines = closedByFence ? open : dropTrailingProse(open);
    if (lines.length) blocks.push({ text: lines.map(l => l.text).join('\n'), offset: lines[0].offset, closed: closedByFence });
    open = null;
  };
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('```')) {
      const opener = t.length > 3; // ```json opens; a bare ``` closes an open block
      if (open && !opener) finish(true);
      else {
        if (open) finish(false);
        open = [];
      }
    } else if (open) {
      open.push({ text: line, offset });
    }
    offset += line.length + 1;
  }
  if (open) finish(false);
  return blocks;
}

// Joins blocks with '' (a continued reply carries on from the exact character)
// and maps a position in the joined text back to the original text.
function joinBlocks(blocks) {
  let pos = 0;
  const segments = blocks.map(b => {
    const seg = { start: pos, offset: b.offset };
    pos += b.text.length;
    return seg;
  });
  const toOriginal = (p) => {
    const seg = segments.filter(s => s.start <= p).pop() || segments[0];
    return seg.offset + (p - seg.start);
  };
  return { text: blocks.map(b => b.text).join(''), toOriginal };
}

// Curly double quotes: “ ” „ ‟
const CURLY_QUOTES = new Set(['\u201C', '\u201D', '\u201E', '\u201F']);

// A string opened with a curly quote ends at a quote followed by : , } ] or the end.
function closesString(src, from) {
  for (let j = from; j < src.length; j++) {
    if (!/\s/.test(src[j])) return ':,}]'.includes(src[j]);
  }
  return true;
}

function blank(out, from, to) {
  for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
}

// One string-aware pass over text starting at '{'. Blanks comments, drops
// trailing commas and straightens structural curly quotes, keeping every
// character's position so error locations still match. Stops at the brace
// that closes the top-level object, so prose after it is ignored.
function cleanJson(src) {
  const out = src.split('');
  const stack = [];
  let inString = false;
  let curly = false;
  let mismatch = false;
  let end = -1;
  let comma = -1;
  for (let i = 0; i < src.length && end < 0; i++) {
    const c = src[i];
    if (inString) {
      if (c === '\\') { i++; continue; }
      if ((c === '"' && !curly) || ((c === '"' || CURLY_QUOTES.has(c)) && curly && closesString(src, i + 1))) {
        out[i] = '"';
        inString = false;
      }
      continue;
    }
    if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) {
      const close = src[i + 1] === '/' ? src.indexOf('\n', i) : src.indexOf('*/', i + 2);
      const stop = close < 0 ? src.length : close + (src[i + 1] === '/' ? 0 : 2);
      blank(out, i, stop);
      i = stop - 1;
      continue;
    }
    if (c === '"' || CURLY_QUOTES.has(c)) {
      out[i] = '"';
      inString = true;
      curly = c !== '"';
      comma = -1;
    } else if (c === ',') {
      comma = i;
    } else if (c === '{' || c === '[') {
      stack.push(c);
      comma = -1;
    } else if (c === '}' || c === ']') {
      if (comma >= 0) out[comma] = ' ';
      comma = -1;
      if (stack.pop() !== (c === '}' ? '{' : '[')) mismatch = true;
      if (stack.length === 0) end = i;
    } else if (!/\s/.test(c)) {
      comma = -1;
    }
  }
  return { text: out.join(''), end: end < 0 ? src.length - 1 : end, inString, cutOff: !mismatch && (inString || end < 0) };
}

// The data visibly reaches a closing bracket, ignoring prose lines after it.
function endsWithBracket(body) {
  const lines = dropTrailingProse(body.split('\n').map(text => ({ text })));
  return lines.length > 0 && /[}\]]$/.test(lines[lines.length - 1].text.trim());
}

// Native JSON.parse errors report "position P" (V8) or "line L column C" (Firefox).
function errorPosition(err, src) {
  const msg = String(err?.message || '');
  const pos = /position (\d+)/i.exec(msg);
  if (pos) return Math.min(Number(pos[1]), src.length);
  const lc = /line (\d+) column (\d+)/i.exec(msg);
  if (!lc) return null;
  const lines = src.split('\n').slice(0, Number(lc[1]) - 1);
  return lines.reduce((n, l) => n + l.length + 1, 0) + Number(lc[2]) - 1;
}

function syntaxMessage(original, pos) {
  const lineStart = original.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd = original.indexOf('\n', pos);
  const line = original.slice(0, lineStart).split('\n').length;
  const lineText = original.slice(lineStart, lineEnd < 0 ? undefined : lineEnd).trim();
  const near = (lineText || original.slice(Math.max(0, pos - 15), pos + 15).trim()).slice(0, 30);
  return syntaxAt(line, pos - lineStart + 1, near);
}

/**
 * Parse one candidate text leniently. `original` and `toOriginal` let syntax
 * errors point at the line the user actually sees. `closed` says a closing
 * fence ended the text, so the reply was not cut off.
 * @returns {{ value: unknown } | { error: string, code: string }}
 */
export function lenientParse(text, { original = text, toOriginal = (p) => p, closed = false } = {}) {
  const start = text.indexOf('{');
  if (start < 0) return { error: PARSE_MESSAGES.noData, code: 'noData' };
  const body = text.slice(start);
  try { return { value: JSON.parse(body) }; } catch { /* try the lenient pass */ }
  const scan = cleanJson(body);
  // An odd quote or a missing bracket in data that visibly ends (in a closed
  // fence, or with a string still open at the final brace) is a typo the
  // assistant can fix, so it gets a location rather than "cut off".
  const typo = () => (closed || scan.inString) && endsWithBracket(body);
  if (scan.cutOff && !typo()) return { error: PARSE_MESSAGES.cutOff, code: 'cutOff' };
  const cleaned = scan.text.slice(0, scan.end + 1);
  try {
    return { value: JSON.parse(cleaned) };
  } catch (err) {
    const pos = errorPosition(err, cleaned);
    if (pos === null) return { error: PARSE_MESSAGES.syntax, code: 'syntax' };
    return { error: syntaxMessage(original, toOriginal(start + pos)), code: 'syntax' };
  }
}

/**
 * Find and parse the trip data in pasted text or a file.
 * @returns {{ value: unknown } | { error: string, code: string }}
 */
export function extractJson(raw) {
  const text = String(raw ?? '').replace(/^\uFEFF/, '');
  const blocks = fencedBlocks(text);
  const first = blocks.findIndex(b => b.text.includes('{'));
  if (first < 0) return lenientParse(text);
  const single = lenientParse(blocks[first].text, {
    original: text, toOriginal: (p) => blocks[first].offset + p, closed: blocks[first].closed,
  });
  if (!single.error || single.code !== 'cutOff' || first === blocks.length - 1) return single;
  const joined = joinBlocks(blocks.slice(first));
  return lenientParse(joined.text, { original: text, toOriginal: joined.toOriginal, closed: blocks[blocks.length - 1].closed });
}
