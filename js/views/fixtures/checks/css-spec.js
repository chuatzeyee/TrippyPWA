// Reads CSS as text for the selector rules of blueprint 8.1: the rules of a file, each selector as
// compounds and parts, and its specificity with :where() weighing nothing. Not a full CSS parser:
// it covers what the view stylesheets may hold and reports what it cannot read. Steward: F0.

const blank = (text) => text.replace(/[^\n]/g, ' ');
/** Comments turned into spaces, so positions and line numbers still match the file. */
export const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, blank);
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** The index just after the bracket that closes the one at `from`. Strings are skipped. */
function closeOf(text, from, open, close) {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (c === '\\') i += 1;
    else if (c === '"' || c === "'") { const end = text.indexOf(c, i + 1); i = end < 0 ? text.length : end; }
    else if (c === open) depth += 1;
    else if (c === close) { depth -= 1; if (depth === 0) return i + 1; }
  }
  return text.length + 1;
}

/** Splits at top-level separators only: not inside brackets, parentheses or strings. */
export function splitTopLevel(text, separator) {
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '\\') i += 1;
    else if (c === '"' || c === "'") { const end = text.indexOf(c, i + 1); i = end < 0 ? text.length : end; }
    else if (c === '(') i = closeOf(text, i, '(', ')') - 1;
    else if (c === '[') i = closeOf(text, i, '[', ']') - 1;
    else if (c === separator) { out.push(text.slice(start, i)); start = i + 1; }
  }
  out.push(text.slice(start));
  return out.map((part) => part.trim()).filter((part) => part !== '');
}

const GROUPING = new Set(['media', 'supports', 'container', 'layer', 'scope', 'starting-style', 'document']);

/**
 * @returns {{ rules: Array<{ selectors: string[], declarations: Array<{ prop: string, value: string, important: boolean }>, at: string[], line: number }>,
 *   atRules: Array<{ name: string, prelude: string, line: number }>, errors: string[] }}
 *   Style rules in file order (those inside @media and the like carry the at-rule in `at`), every
 *   at-rule seen, and what could not be read.
 */
export function parseCss(css) {
  const text = stripCssComments(css);
  const rules = [];
  const atRules = [];
  const errors = [];
  const readBlock = (from, to, at) => {
    let i = from;
    while (i < to) {
      const rest = text.slice(i, to);
      const lead = /^\s*/.exec(rest)[0].length;
      i += lead;
      if (i >= to) break;
      const stop = /[{;]/.exec(text.slice(i, to));
      if (!stop) { if (text.slice(i, to).trim()) errors.push(`line ${lineOf(text, i)}: text outside a rule`); break; }
      const head = text.slice(i, i + stop.index).trim();
      const line = lineOf(text, i);
      if (stop[0] === ';') {
        if (head.startsWith('@')) atRules.push({ name: /^@([\w-]+)/.exec(head)?.[1] ?? '', prelude: head, line });
        else if (head) errors.push(`line ${line}: a declaration outside a rule`);
        i += stop.index + 1;
        continue;
      }
      const open = i + stop.index;
      const end = closeOf(text, open, '{', '}');
      if (end > to) { errors.push(`line ${line}: a block is never closed`); break; }
      if (head.startsWith('@')) {
        const name = /^@([\w-]+)/.exec(head)?.[1] ?? '';
        atRules.push({ name, prelude: head, line });
        if (GROUPING.has(name)) readBlock(open + 1, end - 1, [...at, head]);
      } else {
        const body = text.slice(open + 1, end - 1);
        const nested = splitTopLevel(body, '{').length > 1;
        if (nested) errors.push(`line ${line}: a rule nested inside "${head}" (nesting is not read: write the full selector)`);
        const declarations = (nested ? [] : splitTopLevel(body, ';')).map((entry) => {
          const colon = entry.indexOf(':');
          const value = entry.slice(colon + 1).trim();
          return { prop: entry.slice(0, colon).trim().toLowerCase(), value: value.replace(/\s*!important\s*$/i, ''), important: /!important\s*$/i.test(value) };
        }).filter((declaration) => declaration.prop);
        rules.push({ selectors: splitTopLevel(head, ','), declarations, at, line });
      }
      i = end;
    }
  };
  readBlock(0, text.length, []);
  return { rules, atRules, errors };
}

// --- Selectors --------------------------------------------------------------------------------------

const TAKES_SELECTORS = new Set(['where', 'is', 'not', 'has', 'matches', '-webkit-any', '-moz-any']);
const OLD_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
const IDENT = /^-{0,2}[_a-zA-Z\u00a0-\uffff][-\w\u00a0-\uffff]*/;
const ATTR = /^\s*([-\w]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))\s*[is]?)?\s*$/;

/**
 * One complex selector as compounds. A compound is `{ combinator, parts }`, where combinator is ' ',
 * '>', '+', '~', or null for the first. A part is one of:
 *   { type: 'tag' | 'universal' | 'class' | 'id', name }
 *   { type: 'attr', name, op, value }                 op and value are null for [name]
 *   { type: 'pseudo-class' | 'pseudo-element', name, raw, args }   args: parsed selectors for :where, :is, :not, :has
 * `error` is set when the text cannot be read.
 */
export function parseSelector(source) {
  const text = source.trim();
  const compounds = [];
  let current = { combinator: null, parts: [] };
  let pending = null;
  let i = 0;
  const fail = (why) => ({ text, compounds: [...compounds, current], error: `${why} in "${text}"` });
  const startPart = () => {
    if (pending !== null && current.parts.length) { compounds.push(current); current = { combinator: pending, parts: [] }; }
    else if (pending !== null && pending !== ' ') current.combinator = pending;
    pending = null;
  };
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { if (pending === null) pending = ' '; i += 1; continue; }
    if (c === '>' || c === '+' || c === '~') { pending = c; i += 1; continue; }
    startPart();
    const rest = text.slice(i);
    if (c === '.' || c === '#') {
      const name = IDENT.exec(rest.slice(1));
      if (!name) return fail(`"${c}" without a name`);
      current.parts.push({ type: c === '.' ? 'class' : 'id', name: name[0] });
      i += 1 + name[0].length;
    } else if (c === '[') {
      const end = closeOf(text, i, '[', ']');
      const inner = ATTR.exec(text.slice(i + 1, end - 1));
      if (end > text.length || !inner) return fail('an attribute selector that cannot be read');
      current.parts.push({ type: 'attr', name: inner[1].toLowerCase(), op: inner[2] ?? null, value: inner[2] ? (inner[3] ?? inner[4] ?? inner[5]) : null });
      i = end;
    } else if (c === ':') {
      const double = rest[1] === ':';
      const name = IDENT.exec(rest.slice(double ? 2 : 1));
      if (!name) return fail('":" without a name');
      i += (double ? 2 : 1) + name[0].length;
      let raw = null;
      if (text[i] === '(') {
        const end = closeOf(text, i, '(', ')');
        if (end > text.length) return fail('an unclosed "("');
        raw = text.slice(i + 1, end - 1);
        i = end;
      }
      const lower = name[0].toLowerCase();
      const element = double || OLD_PSEUDO_ELEMENTS.has(lower);
      const args = !element && raw !== null && TAKES_SELECTORS.has(lower) ? splitTopLevel(raw, ',').map(parseSelector) : null;
      const broken = args?.find((arg) => arg.error);
      if (broken) return fail(broken.error);
      current.parts.push({ type: element ? 'pseudo-element' : 'pseudo-class', name: lower, raw, args });
    } else if (c === '*') {
      current.parts.push({ type: 'universal', name: '*' });
      i += 1;
    } else if (c === '&') {
      return fail('the nesting selector "&"');
    } else {
      const name = IDENT.exec(rest);
      if (!name) return fail(`the character "${c}"`);
      current.parts.push({ type: 'tag', name: name[0].toLowerCase() });
      i += name[0].length;
    }
  }
  if (pending !== null && pending !== ' ') return fail('a combinator with nothing after it');
  if (!current.parts.length && !compounds.length) return fail('an empty selector');
  return { text, compounds: [...compounds, current] };
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** Compares two specificities: negative when a is lighter, 0 when they tie. */
export const compareSpecificity = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const heaviest = (list) => list.reduce((best, one) => (compareSpecificity(one, best) > 0 ? one : best), [0, 0, 0]);

function partWeight(part) {
  if (part.type === 'id') return [1, 0, 0];
  if (part.type === 'class' || part.type === 'attr') return [0, 1, 0];
  if (part.type === 'tag' || part.type === 'pseudo-element') return [0, 0, 1];
  if (part.type === 'universal') return [0, 0, 0];
  if (part.name === 'where') return [0, 0, 0];
  if (part.args) return heaviest(part.args.map(specificity));
  if (/^nth-(last-)?child$/.test(part.name) && / of /.test(part.raw ?? '')) {
    return add([0, 1, 0], heaviest(splitTopLevel(part.raw.split(/ of /)[1], ',').map((one) => specificity(parseSelector(one)))));
  }
  return [0, 1, 0];
}

/** @returns {[number, number, number]} ids, classes and elements. :where() weighs nothing. */
export function specificity(selector) {
  const parsed = typeof selector === 'string' ? parseSelector(selector) : selector;
  return parsed.compounds.flatMap((compound) => compound.parts).map(partWeight).reduce(add, [0, 0, 0]);
}

/** Every part of a selector, at any depth (inside :where, :is, :not and :has too). */
export function allParts(parsed) {
  return parsed.compounds.flatMap((compound) => compound.parts).flatMap((part) => [part, ...(part.args ?? []).flatMap(allParts)]);
}
