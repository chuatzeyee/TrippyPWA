// A small, strict HTML reader for tests. Vitest runs in Node with no DOM, and renderers return strings,
// so the rule tests read those strings with this. Strict on purpose: a tag closed out of order, a raw
// "<" or a bare "&" is reported, because each is what an unescaped value or a broken part looks like.
// Steward: F0.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// Elements whose content is text, not markup. Inside <svg> they are ordinary elements (an SVG <title>).
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const FOREIGN = new Set(['svg', 'math']);
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi;

/** Turns character references back into text. Unknown names are left as written. */
export function decode(raw) {
  return String(raw).replace(ENTITY, (whole, name) => {
    if (name[0] !== '#') return NAMED[name.toLowerCase()] ?? whole;
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  });
}

const bareAmp = (raw) => /&(?!(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);)/i.test(raw);
const excerpt = (html, at) => JSON.stringify(html.slice(Math.max(0, at - 20), at + 40));

function readTag(html, from, errors) {
  const open = /^<([a-zA-Z][^\s/>]*)/.exec(html.slice(from, from + 80));
  const node = { tag: open[1].toLowerCase(), attrs: {}, children: [], parent: null };
  let at = from + open[0].length;
  for (;;) {
    at += /^\s*/.exec(html.slice(at))[0].length;
    if (at >= html.length) { errors.push(`tag <${node.tag}> never ends`); return { node, end: at, selfClosed: false }; }
    if (html.startsWith('/>', at)) return { node, end: at + 2, selfClosed: true };
    if (html[at] === '>') return { node, end: at + 1, selfClosed: false };
    const name = /^[^\s=/>]+|^\//.exec(html.slice(at))[0];
    at += name.length;
    if (name === '/') continue;
    let value = '';
    if (html[at] === '=') {
      const quote = html[at + 1];
      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, at + 2);
        if (close < 0) { errors.push(`attribute ${name} on <${node.tag}> is never closed`); return { node, end: html.length, selfClosed: false }; }
        value = html.slice(at + 2, close);
        at = close + 1;
      } else {
        value = /^[^\s>]*/.exec(html.slice(at + 1))[0];
        at += 1 + value.length;
        errors.push(`attribute ${name} on <${node.tag}> has no quotes`);
      }
    }
    const key = name.toLowerCase();
    if (key in node.attrs) errors.push(`attribute ${key} appears twice on <${node.tag}>`);
    if (bareAmp(value)) errors.push(`bare & in attribute ${key} on <${node.tag}>: ${JSON.stringify(value.slice(0, 60))}`);
    if (value.includes('<')) errors.push(`raw < in attribute ${key} on <${node.tag}>`);
    node.attrs[key] = decode(value);
  }
}

/**
 * @param {string} html
 * @returns {{ root: object, errors: string[] }} `root` is a nameless element holding the top-level nodes.
 *   An element is `{ tag, attrs, children, parent }`; a text node is `{ text, parent }` (decoded).
 */
export function parseHtml(html) {
  const errors = [];
  const root = { tag: '', attrs: {}, children: [], parent: null };
  let current = root;
  let foreign = 0;
  let at = 0;
  const addText = (raw, where) => {
    if (!raw) return;
    if (bareAmp(raw)) errors.push(`bare & in text near ${excerpt(html, where)}`);
    current.children.push({ text: decode(raw), parent: current });
  };
  while (at < html.length) {
    const lt = html.indexOf('<', at);
    if (lt < 0) { addText(html.slice(at), at); break; }
    addText(html.slice(at, lt), at);
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4);
      if (close < 0) { errors.push('comment never ends'); break; }
      at = close + 3;
    } else if (/^<![a-zA-Z]/.test(html.slice(lt, lt + 3))) {
      at = html.indexOf('>', lt) + 1 || html.length;
    } else if (/^<\/[a-zA-Z]/.test(html.slice(lt, lt + 3))) {
      const close = html.indexOf('>', lt);
      const name = html.slice(lt + 2, close < 0 ? html.length : close).trim().toLowerCase();
      if (current.tag === name) {
        if (FOREIGN.has(name)) foreign -= 1;
        current = current.parent;
      } else {
        errors.push(`</${name}> closes nothing: <${current.tag || 'top level'}> is open near ${excerpt(html, lt)}`);
      }
      at = close < 0 ? html.length : close + 1;
    } else if (/^<[a-zA-Z]/.test(html.slice(lt, lt + 2))) {
      const { node, end, selfClosed } = readTag(html, lt, errors);
      node.parent = current;
      current.children.push(node);
      at = end;
      const leaf = VOID.has(node.tag) || (selfClosed && foreign > 0);
      if (selfClosed && !leaf) errors.push(`<${node.tag}/> is not a self-closing element`);
      if (RAW_TEXT.has(node.tag) && !selfClosed && foreign === 0) {
        const close = html.toLowerCase().indexOf(`</${node.tag}`, at);
        const stop = close < 0 ? html.length : close;
        node.children.push({ text: html.slice(at, stop), parent: node });
        if (close < 0) errors.push(`<${node.tag}> is never closed`);
        at = close < 0 ? html.length : html.indexOf('>', close) + 1 || html.length;
      } else if (!leaf && !selfClosed) {
        if (FOREIGN.has(node.tag)) foreign += 1;
        current = node;
      }
    } else {
      errors.push(`raw < in text near ${excerpt(html, lt)}`);
      current.children.push({ text: '<', parent: current });
      at = lt + 1;
    }
  }
  for (let open = current; open !== root; open = open.parent) errors.push(`<${open.tag}> is never closed`);
  return { root, errors };
}

// --- Reading the tree -----------------------------------------------------------------------------

const SELECTOR_PART = /^(?:([a-zA-Z][\w-]*)|\.([\w-]+)|\[([\w-]+)(?:([\^$*]?=)"([^"]*)")?\])/;
const parsed = new Map();
function compile(selector) {
  if (parsed.has(selector)) return parsed.get(selector);
  const want = { tag: null, classes: [], attrs: [] };
  let rest = selector.trim();
  while (rest) {
    const part = SELECTOR_PART.exec(rest);
    if (!part) throw new Error(`html-tree: cannot read selector "${selector}" (one compound: tag, .class, [attr], [attr="v"], ^= $= *=)`);
    if (part[1]) want.tag = part[1].toLowerCase();
    else if (part[2]) want.classes.push(part[2]);
    else want.attrs.push({ name: part[3].toLowerCase(), op: part[4] ?? null, value: part[5] ?? '' });
    rest = rest.slice(part[0].length);
  }
  parsed.set(selector, want);
  return want;
}

export const isElement = (node) => typeof node?.tag === 'string' && node.tag !== '';
export const classesOf = (node) => (node.attrs?.class ?? '').split(/\s+/).filter(Boolean);
/** The attribute's decoded value, or null when the element does not carry it. */
export const attr = (node, name) => (isElement(node) && name in node.attrs ? node.attrs[name] : null);

/** True when the element matches one compound selector, or any of a comma-separated list. */
export function matches(node, selector) {
  if (!isElement(node)) return false;
  return selector.split(',').some((one) => {
    const want = compile(one);
    if (want.tag && want.tag !== node.tag) return false;
    const own = classesOf(node);
    if (!want.classes.every((name) => own.includes(name))) return false;
    return want.attrs.every(({ name, op, value }) => {
      const have = attr(node, name);
      if (have === null) return false;
      if (op === '=') return have === value;
      if (op === '^=') return have.startsWith(value);
      if (op === '$=') return have.endsWith(value);
      if (op === '*=') return have.includes(value);
      return true;
    });
  });
}

/** Every element under `node`, in document order. */
export function elements(node) {
  return (node.children ?? []).flatMap((child) => (isElement(child) ? [child, ...elements(child)] : []));
}
/** Every element under `node` that matches. */
export const all = (node, selector) => elements(node).filter((el) => matches(el, selector));
/** The nearest ancestor that matches (not the element itself), or null. */
export function ancestor(node, selector) {
  for (let up = node.parent; up; up = up.parent) if (matches(up, selector)) return up;
  return null;
}
export const isInside = (node, selector) => ancestor(node, selector) !== null;
/** The visible text under a node, decoded, with white space collapsed. */
export function textOf(node) {
  const read = (n) => (typeof n.text === 'string' ? n.text : n.tag === 'script' || n.tag === 'style' ? '' : (n.children ?? []).map(read).join(' '));
  return read(node).replace(/\s+/g, ' ').trim();
}
/** The element just before this one among its parent's elements, or null. */
export function previousElement(node) {
  const siblings = (node.parent?.children ?? []).filter(isElement);
  return siblings[siblings.indexOf(node) - 1] ?? null;
}
