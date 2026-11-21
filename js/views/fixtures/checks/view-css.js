// What a build must emit for the views (TASKS F0, "one CSS file per view"; blueprint 3.1 and 8.2),
// judged from the stylesheets it emitted and, when the bundler's own record is at hand, from the view
// chunks. A skin is recognised by its scope, [data-view="<id>"], which every rule of a skin starts
// with (blueprint 8.1); the shared component styles by the cascade probe, which stays for good.
// Pure: text in, problems out. The build itself is run by view-css-build.mjs. Steward: F0.

/** The views that ship. Kept equal to VIEW_IDS of js/views/registry.js by view-css.test.js. */
export const SKINNED_VIEWS = Object.freeze(['departures', 'concierge', 'atlas']);
/** Views that the dev server offers and a production build must not hold. */
export const DEV_ONLY_VIEWS = Object.freeze(['stub']);

// [data-view="atlas"], [data-view='atlas'] or, minified, [data-view=atlas]. Never the bare [data-view].
const SCOPE = /\[data-view=(["']?)([\w-]+)\1\]/g;
const SHARED_PROBE = /\[data-view\]\s*:where\(\s*\.ui-probe\s*\)/;
const SHARED_PROBE_TEXT = '[data-view] :where(.ui-probe)';

/**
 * @param {string} css the text of one stylesheet, minified or not
 * @returns {string[]} the id of every view whose scope the text holds, each once, in order of first use
 */
export function viewScopesIn(css) {
  return [...new Set([...css.matchAll(SCOPE)].map((match) => match[2]))];
}

/**
 * @typedef {{ file: string, css: string }} Sheet       one emitted stylesheet
 * @typedef {{ view: string, file: string, css: string[] }} ViewChunk
 *   the chunk of js/views/<view>/view.js and every stylesheet that loading it brings
 * @typedef {{ skins: Record<string, string[]>, shared: string[], problems: string[] }} ViewCssReport
 *   skins: for each view, the stylesheets that hold its skin (one, when the build is sound);
 *   shared: the stylesheets that hold the shared component styles; problems: empty when sound
 */

function sheetProblems(read, skins, shared, views, devOnly) {
  const perView = views.flatMap((id) => {
    const files = skins[id];
    if (files.length === 0) return [`no stylesheet holds the ${id} skin: the build does not reach js/views/${id}/view.js, or that file does not import css/views/${id}.css`];
    return files.length > 1 ? [`the ${id} skin is in ${files.length} stylesheets (${files.join(', ')}): expected one`] : [];
  });
  const perSheet = read.flatMap(({ file, scopes }) => {
    const held = views.filter((id) => scopes.includes(id));
    return [
      ...(held.length > 1 ? [`${file} holds ${held.length} skins (${held.join(', ')}): each view gets a stylesheet of its own`] : []),
      ...devOnly.filter((id) => scopes.includes(id)).map((id) => `${file} holds the dev-only ${id} view: it belongs on the dev server, not in a production build`),
    ];
  });
  const noShared = shared.length ? [] : [`no stylesheet holds the shared component styles (the ${SHARED_PROBE_TEXT} rule of css/views/shared/common.css)`];
  return [...perView, ...perSheet, ...noShared];
}

function chunkProblems(chunks, skins, shared, views) {
  return views.flatMap((id) => {
    const chunk = chunks.find((entry) => entry.view === id);
    if (!chunk) return [`no chunk of its own for js/views/${id}/view.js: the registry needs a loader with a literal import() of it, and something must call the loaders`];
    const brings = (files) => files.filter((file) => chunk.css.includes(file));
    const name = `the ${id} chunk (${chunk.file})`;
    return [
      ...(skins[id].length && brings(skins[id]).length === 0 ? [`${name} does not bring the ${id} skin with it`] : []),
      ...views.filter((other) => other !== id).flatMap((other) => brings(skins[other]).map((file) => `${name} brings the ${other} skin (${file})`)),
      ...(shared.length && brings(shared).length === 0 ? [`${name} does not bring the shared component styles with it`] : []),
    ];
  });
}

/**
 * @param {{ sheets: Sheet[], chunks?: ViewChunk[]|null }} build  `chunks` is null or absent when only the
 *   files of a finished build are known; then the stylesheets alone are judged
 * @param {{ views?: readonly string[], devOnly?: readonly string[] }} [expected]
 * @returns {ViewCssReport}
 */
export function viewCssReport({ sheets, chunks = null }, { views = SKINNED_VIEWS, devOnly = DEV_ONLY_VIEWS } = {}) {
  const read = sheets.map((sheet) => ({ file: sheet.file, scopes: viewScopesIn(sheet.css), shared: SHARED_PROBE.test(sheet.css) }));
  const skins = Object.fromEntries(views.map((id) => [id, read.filter((sheet) => sheet.scopes.includes(id)).map((sheet) => sheet.file)]));
  const shared = read.filter((sheet) => sheet.shared).map((sheet) => sheet.file);
  const problems = [
    ...sheetProblems(read, skins, shared, views, devOnly),
    ...(chunks ? chunkProblems(chunks, skins, shared, views) : []),
  ];
  return { skins, shared, problems };
}
