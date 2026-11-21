// Reads JavaScript source as text for the boundary rules: which parts are comments, and what a file
// imports. Not a parser: enough of a lexer to keep strings, templates and regular expressions apart
// from comments and from code, so that a type import written in JSDoc, or the word "import" inside a
// string, is not taken for a real import. Steward: F0.

const BEFORE_A_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'throw', 'new', 'else', 'do', 'instanceof', 'yield', 'await']);
const blank = (text) => text.replace(/[^\n]/g, ' ');
const FILL = 'x';

function endOfString(source, from, quote) {
  for (let i = from + 1; i < source.length; i += 1) {
    if (source[i] === '\\') i += 1;
    else if (source[i] === quote || source[i] === '\n') return i + 1;
  }
  return source.length;
}

function endOfRegex(source, from) {
  let inClass = false;
  for (let i = from + 1; i < source.length; i += 1) {
    const c = source[i];
    if (c === '\\') i += 1;
    else if (c === '\n') return i;
    else if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return i + 1;
  }
  return source.length;
}

/** A literal with its delimiters kept and everything between them filled in. */
const filled = (literal) => (literal.length < 2 ? literal : literal[0] + literal.slice(1, -1).replace(/[^\n]/g, FILL) + literal[literal.length - 1]);

/**
 * One pass over the source. Comments always become spaces. With `maskLiterals`, the inside of every
 * string, template text and regular expression becomes a run of "x" as well. The result has the
 * length and the line breaks of the source, so positions and line numbers still match the file.
 */
function lex(source, maskLiterals) {
  let out = '';
  let i = 0;
  let last = '';          // the last character of code that was not white space
  let word = '';          // the identifier that ends at `last`, if any
  const templates = [];   // open template literals; each entry is the brace depth inside its ${ }, or -1 in text
  let inTemplateText = false;
  const literal = (to) => {
    const text = source.slice(i, to);
    out += maskLiterals ? filled(text) : text;
    last = source[to - 1];
    word = '';
    i = to;
  };
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (inTemplateText) {
      if (c === '\\') { out += maskLiterals ? FILL + FILL : source.slice(i, i + 2); i += 2; }
      else if (c === '`') { out += c; i += 1; inTemplateText = false; templates.pop(); last = '`'; word = ''; }
      else if (c === '$' && next === '{') { out += '${'; i += 2; inTemplateText = false; templates[templates.length - 1] = 0; last = '{'; word = ''; }
      else { out += maskLiterals && c !== '\n' ? FILL : c; i += 1; }
    } else if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end < 0 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === '"' || c === "'") {
      literal(endOfString(source, i, c));
    } else if (c === '`') {
      out += c; i += 1; templates.push(-1); inTemplateText = true;
    } else if (c === '/') {
      const afterValue = /[\w$)\]}'"`]/.test(last) && !BEFORE_A_REGEX.has(word);
      if (afterValue) { out += c; i += 1; last = c; word = ''; } else literal(endOfRegex(source, i));
    } else {
      if (templates.length && templates[templates.length - 1] >= 0) {
        if (c === '{') templates[templates.length - 1] += 1;
        if (c === '}') {
          if (templates[templates.length - 1] === 0) { out += c; i += 1; templates[templates.length - 1] = -1; inTemplateText = true; continue; }
          templates[templates.length - 1] -= 1;
        }
      }
      out += c;
      i += 1;
      if (/[\w$]/.test(c)) word = /[\w$]/.test(last) ? word + c : c;
      else if (!/\s/.test(c)) word = '';
      if (!/\s/.test(c)) last = c;
    }
  }
  return out;
}

/** The source with every comment turned into spaces. Strings, templates and regular expressions stay. */
export const stripComments = (source) => lex(source, false);

const lineOf = (source, index) => source.slice(0, index).split('\n').length;
const SIDE_EFFECT = /\bimport\s*(['"])(x*)\1/dg;
const FROM = /\b(?:import|export)\b[^;'"`()=]*?\bfrom\s*(['"])(x*)\1/dg;
const DYNAMIC = /\bimport\s*\(\s*(?:(['"])(x*)\1\s*\)|[^)]*\))/dg;

/**
 * Every import and re-export of a file: static, side-effect only and dynamic.
 * @returns {Array<{ spec: string|null, kind: 'static'|'dynamic', line: number }>} `spec` is null for a
 *   dynamic import whose target is not a plain string, which no boundary rule can follow.
 */
export function listImports(source) {
  // The shape of each statement is found with the literals masked; the target is read from the source.
  const masked = lex(source, true);
  const found = [];
  const collect = (pattern, kind) => {
    for (const match of masked.matchAll(pattern)) {
      const at = match.indices[2];
      found.push({ spec: at ? source.slice(at[0], at[1]) : null, kind, line: lineOf(source, match.index) });
    }
  };
  collect(SIDE_EFFECT, 'static');
  collect(FROM, 'static');
  collect(DYNAMIC, 'dynamic');
  return found.sort((a, b) => a.line - b.line);
}

/**
 * Where an import leads, as a path from the repository root ("js/lib/geo.js"), or "pkg:<name>" for a
 * package. `fromFile` is itself a path from the repository root.
 */
export function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return `pkg:${spec}`;
  const parts = spec.startsWith('/') ? [] : fromFile.split('/').slice(0, -1);
  for (const part of spec.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/').replace(/[?#].*$/, '');
}
