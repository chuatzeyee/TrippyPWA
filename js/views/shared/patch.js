// How late data reaches the screen (blueprint 3.5): patchRegions() replaces as little as it can inside
// each [data-region], and carryOver() moves [data-carry] nodes across a full re-render. The matching
// rules are the pure functions at the top; the DOM half is checked in a browser. Owner: F5.

// --- Pure -------------------------------------------------------------------------------------------

const entriesOf = (map) => (map instanceof Map ? [...map.entries()] : Object.entries(map ?? {}));

/**
 * @param {Object<string, string>|Map<string, string>|null} oldMap  region name to markup, as it is
 * @param {Object<string, string>|Map<string, string>|null} newMap  region name to markup, as it should be
 * @returns {string[]} the regions of `newMap` whose markup differs or is new, in its order. A region
 *   that is only in `oldMap` is not named: there is nothing to patch it with.
 */
export function diffRegions(oldMap, newMap) {
  const before = new Map(entriesOf(oldMap));
  return entriesOf(newMap).filter(([name, markup]) => before.get(name) !== markup).map(([name]) => name);
}

/** Indexes of the longest increasing run in `values`, so the nodes on it need not move. */
function longestIncreasing(values) {
  const best = values.map(() => 1);
  const prev = values.map(() => -1);
  let end = -1;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (values[j] < values[i] && best[j] + 1 > best[i]) { best[i] = best[j] + 1; prev[i] = j; }
    }
    if (end < 0 || best[i] > best[end]) end = i;
  }
  const run = new Set();
  for (let i = end; i >= 0; i = prev[i]) run.add(i);
  return run;
}

/**
 * The steps that turn keyed children into the new list while touching as few nodes as possible.
 * @param {string[]} oldKeys
 * @param {string[]} newKeys
 * @returns {Array<{ op: 'remove', key: string }|{ op: 'keep'|'move'|'insert', key: string, before: string|null }>|null}
 *   In the order to apply them: the removals, then the new list from its last key to its first. `before`
 *   is the key the node goes in front of (null for the end); a 'keep' node is not touched. Null when a
 *   key is empty or repeats: the caller then replaces the content instead.
 */
export function planKeyedMorph(oldKeys, newKeys) {
  const valid = (keys) => keys.every((key) => typeof key === 'string' && key !== '') && new Set(keys).size === keys.length;
  if (!valid(oldKeys) || !valid(newKeys)) return null;
  const wanted = new Set(newKeys);
  const oldAt = new Map(oldKeys.map((key, i) => [key, i]));
  const removals = oldKeys.filter((key) => !wanted.has(key)).map((key) => ({ op: 'remove', key }));
  const stays = newKeys.filter((key) => oldAt.has(key));
  const still = longestIncreasing(stays.map((key) => oldAt.get(key)));
  const kept = new Set(stays.filter((_, i) => still.has(i)));
  const placements = newKeys.map((key, i) => ({
    op: kept.has(key) ? 'keep' : oldAt.has(key) ? 'move' : 'insert', key, before: newKeys[i + 1] ?? null,
  })).reverse();
  return [...removals, ...placements];
}

/**
 * Whether a <details data-key> is open after a patch. The user's choice stands while the markup says
 * what it said before; when the markup changes its mind (a filter opens every group) the markup wins.
 * @param {{ live: boolean, was: boolean|null, wants: boolean, fromMarkup?: boolean }} state
 *   live: open now; was: open in the markup last applied (null when not known); wants: open in the new markup;
 *   fromMarkup: the caller says the markup decides this time (patchRegions' openFromMarkup)
 */
export function decideOpen({ live, was, wants, fromMarkup = false }) {
  if (fromMarkup) return wants;
  if (was === null || was === undefined) return live || wants;
  return was === wants ? live : wants;
}

/**
 * What one patch does with each region that is both on the page and in the new markup.
 * @param {Array<{ name: string, applied?: string|null, live: string, fresh: string, busy?: boolean, waiting?: boolean }>} regions
 *   applied  the markup last applied to this very element; null when none was (the element is new
 *            since a full render), and then the page itself is what the new markup is compared with
 *   live     the element as it is on the page
 *   fresh    the new markup
 *   busy     it holds an open dialog
 *   waiting  an earlier patch is waiting for that dialog to close
 * @returns {Array<{ name: string, action: 'skip'|'patch'|'defer', drop: boolean }>}
 *   skip: the new markup is what the element already shows. defer: patched when the dialog has closed.
 *   drop: the waiting patch is out of date and must never run, because a newer one is applied now or
 *   the markup is back to what is applied. A deferred patch takes the place of the waiting one.
 */
export function planPatch(regions) {
  return regions.map(({ name, applied = null, live, fresh, busy = false, waiting = false }) => {
    const action = (applied ?? live) === fresh ? 'skip' : busy ? 'defer' : 'patch';
    return { name, action, drop: waiting && action !== 'defer' };
  });
}

// --- DOM --------------------------------------------------------------------------------------------

/**
 * region element -> the markup last applied to it. Keyed by the element itself, never by the root and
 * the region name: a full render into the same root makes new region elements, and what was applied
 * to the old ones says nothing about them.
 */
const applied = new WeakMap();
/** keyed child or <details> -> what the markup last said about it */
const childSource = new WeakMap();
const detailsSource = new WeakMap();
/** region element -> the patch waiting for its dialog to close */
const waiting = new WeakMap();
/** the region elements that listen for that close */
const watched = new WeakSet();

const regionsOf = (scope) => new Map([...scope.querySelectorAll('[data-region]')].map((el) => [el.getAttribute('data-region'), el]));
const elementsOf = (el) => [...el.children];
// A photo frame names its image (data-carry-key), because a fallback may have changed its src since.
const imageKey = (img) => img.dataset.carryKey ?? `${img.getAttribute('src') ?? ''}|${img.getAttribute('srcset') ?? ''}`;
const isLoaded = (img) => img.complete && img.naturalWidth > 0;
const scrollKey = (el, i) => el.getAttribute('data-key') || el.getAttribute('data-keep-scroll') || `#${i}`;

function syncAttributes(target, source, skip = []) {
  for (const { name } of [...target.attributes]) {
    if (!source.hasAttribute(name) && !skip.includes(name)) target.removeAttribute(name);
  }
  for (const { name, value } of [...source.attributes]) {
    if (!skip.includes(name) && target.getAttribute(name) !== value) target.setAttribute(name, value);
  }
}

/** True for the length of one patch whose caller passed openFromMarkup. Patches run to the end in one task. */
let markupDecides = false;

function settleDetails(fresh, live, was) {
  const wants = fresh.hasAttribute('open');
  detailsSource.set(fresh, wants);
  return decideOpen({ live, was, wants, fromMarkup: markupDecides });
}

/** Replaces the content of `el` with the children of `source`, with the three carry-overs. */
function replaceContent(el, source) {
  const images = new Map();
  for (const img of el.querySelectorAll('img')) {
    if (isLoaded(img)) images.set(imageKey(img), [...(images.get(imageKey(img)) ?? []), img]);
  }
  const groups = new Map([...el.querySelectorAll('details[data-key]')].map((d) => [d.getAttribute('data-key'), { live: d.open, was: detailsSource.get(d) ?? null }]));
  const scrolls = new Map([...el.querySelectorAll('[data-keep-scroll]')].map((s, i) => [scrollKey(s, i), s.scrollLeft]));
  const ownScroll = el.hasAttribute('data-keep-scroll') ? el.scrollLeft : null;

  // `source` is still in the template's own document, where nothing loads. A new image that an old,
  // loaded one can stand in for is taken out there, so it never starts a request of its own.
  const stand = [];
  for (const img of source.querySelectorAll('img')) {
    const loaded = images.get(imageKey(img))?.shift();
    if (!loaded) continue;
    syncAttributes(loaded, img, ['src', 'srcset', 'sizes', 'data-fallback', 'data-carry-key', 'data-fade']);
    loaded.removeAttribute('data-fade');
    loaded.classList.remove('is-loading');
    const mark = source.ownerDocument.createComment('img');
    img.replaceWith(mark);
    stand.push([mark, loaded]);
  }
  for (const group of source.querySelectorAll('details[data-key]')) {
    const old = groups.get(group.getAttribute('data-key'));
    if (old) group.open = settleDetails(group, old.live, old.was);
    else detailsSource.set(group, group.hasAttribute('open'));
  }
  const content = document.createDocumentFragment();
  content.append(...source.childNodes);
  for (const [mark, loaded] of stand) mark.replaceWith(loaded);
  el.replaceChildren(content);
  [...el.querySelectorAll('[data-keep-scroll]')].forEach((s, i) => {
    const left = scrolls.get(scrollKey(s, i));
    if (left) s.scrollLeft = left;
  });
  if (ownScroll) el.scrollLeft = ownScroll;
}

/** Brings one kept keyed child up to date: untouched when its markup is the same. */
function updateKept(node, fresh) {
  const markup = fresh.outerHTML;
  if ((childSource.get(node) ?? node.outerHTML) === markup) { childSource.set(node, markup); return node; }
  if (node.tagName !== fresh.tagName) {
    node.replaceWith(fresh);
    childSource.set(fresh, markup);
    return fresh;
  }
  if (node instanceof HTMLDetailsElement) {
    const wants = fresh.hasAttribute('open');
    const open = decideOpen({ live: node.open, was: detailsSource.get(node) ?? null, wants, fromMarkup: markupDecides });
    detailsSource.set(node, wants);
    syncAttributes(node, fresh, ['open']);
    node.open = open;
  } else {
    syncAttributes(node, fresh);
  }
  replaceContent(node, fresh);
  childSource.set(node, markup);
  return node;
}

const keysOf = (el) => elementsOf(el).map((child) => child.getAttribute('data-key') ?? '');
const onlyElements = (el) => [...el.childNodes].every((node) => node.nodeType === 1 || (node.nodeType === 3 && !node.data.trim()) || node.nodeType === 8);

/** Rule 2: children matched by key. False when the region is not a keyed list. */
function morphKeyed(target, source) {
  if (!source.children.length || !onlyElements(target) || !onlyElements(source)) return false;
  const steps = planKeyedMorph(keysOf(target), keysOf(source));
  if (!steps) return false;
  const live = new Map(elementsOf(target).map((child) => [child.getAttribute('data-key'), child]));
  const fresh = new Map(elementsOf(source).map((child) => [child.getAttribute('data-key'), child]));
  const placed = new Map();
  for (const step of steps) {
    if (step.op === 'remove') { live.get(step.key).remove(); continue; }
    const anchor = step.before === null ? null : placed.get(step.before);
    if (step.op === 'insert') {
      const node = fresh.get(step.key);
      childSource.set(node, node.outerHTML);
      for (const group of [node, ...node.querySelectorAll('details[data-key]')]) {
        if (group instanceof HTMLDetailsElement) detailsSource.set(group, group.hasAttribute('open'));
      }
      target.insertBefore(node, anchor);
      placed.set(step.key, node);
      continue;
    }
    const node = updateKept(live.get(step.key), fresh.get(step.key));
    if (step.op === 'move') target.insertBefore(node, anchor);
    placed.set(step.key, node);
  }
  return true;
}

function applyRegion(target, source, { openFromMarkup = false } = {}) {
  markupDecides = openFromMarkup;
  try {
    applyRegionNow(target, source);
  } finally {
    markupDecides = false;
  }
}

function applyRegionNow(target, source) {
  const active = document.activeElement;
  const hadFocus = active instanceof HTMLElement && active !== target && target.contains(active);
  const focusKey = hadFocus ? active.getAttribute('data-focus-key') : null;
  const focusId = hadFocus ? active.id : '';
  syncAttributes(target, source);
  if (!morphKeyed(target, source)) replaceContent(target, source);
  if (!hadFocus || document.activeElement === active) return;
  // Rule 4: focus returns to the control with the same data-focus-key (or id).
  const again = active.isConnected && target.contains(active) ? active
    : (focusKey && [...target.querySelectorAll('[data-focus-key]')].find((el) => el.getAttribute('data-focus-key') === focusKey))
      || (focusId && document.getElementById(focusId));
  if (again && target.contains(again)) again.focus({ preventScroll: true });
}

/** Rule 6: a region that holds an open dialog is patched when the dialog has closed. */
function patchWhenClosed(target, job) {
  waiting.set(target, job);
  if (watched.has(target)) return;
  watched.add(target);
  const onClose = () => {
    if (target.querySelector('dialog[open]')) return;
    target.removeEventListener('close', onClose, true);
    watched.delete(target);
    // After every close listener has run, so focus is back on the trigger before it is replaced.
    setTimeout(() => {
      const last = waiting.get(target);
      if (!last) return; // dropped: a newer patch was applied, or the markup went back to what is shown
      if (target.querySelector('dialog[open]')) { patchWhenClosed(target, last); return; }
      waiting.delete(target);
      if (target.isConnected) last();
    }, 0);
  };
  target.addEventListener('close', onClose, true);
}

/** Every <details data-key> of `target` takes the open state the new markup gives it. */
function openAsMarkupSays(target, source) {
  const wanted = new Map([...source.querySelectorAll('details[data-key]')].map((group) => [group.getAttribute('data-key'), group.hasAttribute('open')]));
  for (const group of target.querySelectorAll('details[data-key]')) {
    if (wanted.has(group.getAttribute('data-key'))) group.open = wanted.get(group.getAttribute('data-key'));
  }
}

/**
 * Records the page as it is, so the first patch can tell what the markup said from what the user did
 * since (a month group they closed stays closed). Optional, after any full render: without it the
 * first patch compares the new markup with the page as it then is, which is right but patches a
 * region the user or a mount function has touched even when its markup is the same.
 * @param {Element} root
 */
export function rememberRegions(root) {
  for (const el of regionsOf(root).values()) applied.set(el, el.outerHTML);
  for (const group of root.querySelectorAll('details[data-key]')) detailsSource.set(group, group.hasAttribute('open'));
}

/**
 * Patches every [data-region] of `root` from the same view's new markup.
 * @param {Element} root  the mounted view root
 * @param {string} html   the new full markup of the root (only its regions are read)
 * @param {{ onPatched?: (region: string, el: Element) => void, openFromMarkup?: boolean }} [opts]
 *   openFromMarkup  true when every <details data-key> must take the open state of the new markup, even
 *     one the user closed: the dashboard passes it while a search or a filter is on (filter.expanded),
 *     so a match is never left inside a closed group
 * @returns {{ patched: string[], skipped: string[], deferred: string[], unmatched: string[] }}
 *   skipped: markup unchanged. deferred: holds an open dialog, patched when it closes. unmatched: a
 *   region that is on the page or in the markup but not in both; the caller decides whether to render again.
 */
export function patchRegions(root, html, { onPatched, openFromMarkup = false } = {}) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const fresh = regionsOf(template.content);
  const live = regionsOf(root);
  const shared = [...fresh.keys()].filter((name) => live.has(name));
  const after = new Map(shared.map((name) => [name, fresh.get(name).outerHTML]));
  const plan = planPatch(shared.map((name) => {
    const target = live.get(name);
    const known = applied.get(target);
    // The page is serialised only for an element nothing was applied to yet.
    return {
      name, applied: known ?? null, live: known ?? target.outerHTML, fresh: after.get(name),
      busy: Boolean(target.querySelector('dialog[open]')), waiting: waiting.has(target),
    };
  }));
  const result = {
    patched: [], deferred: [], skipped: [],
    unmatched: [...[...fresh.keys()].filter((name) => !live.has(name)), ...[...live.keys()].filter((name) => !fresh.has(name))],
  };
  for (const { name, action, drop } of plan) {
    const target = live.get(name);
    const source = fresh.get(name);
    if (drop) waiting.delete(target);
    if (action === 'skip') {
      applied.set(target, after.get(name));
      if (openFromMarkup) openAsMarkupSays(target, source);
      result.skipped.push(name);
      continue;
    }
    if (!target.isConnected || !root.contains(target)) continue;
    const run = () => {
      applyRegion(target, source, { openFromMarkup });
      applied.set(target, after.get(name));
      onPatched?.(name, target);
    };
    if (action === 'defer') {
      patchWhenClosed(target, run);
      result.deferred.push(name);
    } else {
      run();
      result.patched.push(name);
    }
  }
  return result;
}

/**
 * For a full re-render: each [data-carry="<key>"] node of the old tree takes the place of the node
 * with the same key in the new tree, so a loaded hero photo or a built map is not made again. A node
 * that also carries data-carry-id travels only while the id is the same (the photo frame uses its src).
 * @param {Element|DocumentFragment} oldRoot
 * @param {Element|DocumentFragment} newRoot  not yet on the page, or already swapped in
 * @returns {string[]} the keys that were carried
 */
export function carryOver(oldRoot, newRoot) {
  const old = new Map([...oldRoot.querySelectorAll('[data-carry]')].map((el) => [el.getAttribute('data-carry'), el]));
  const carried = [];
  for (const slot of [...newRoot.querySelectorAll('[data-carry]')]) {
    const key = slot.getAttribute('data-carry');
    const node = old.get(key);
    if (!node || node === slot || node.getAttribute('data-carry-id') !== slot.getAttribute('data-carry-id')) continue;
    node.querySelectorAll('img[data-fade]').forEach((img) => { img.removeAttribute('data-fade'); img.classList.remove('is-loading'); });
    slot.replaceWith(node);
    old.delete(key);
    carried.push(key);
  }
  return carried;
}
