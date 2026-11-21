#!/usr/bin/env node
// Gate tool for "the build emits one CSS file per view" (TASKS F0; blueprint 3.1 and 8.2).
//
//   node js/views/fixtures/checks/view-css-build.mjs                 the view layer on its own
//   node js/views/fixtures/checks/view-css-build.mjs --dir <path>    a finished build, such as a gate build
//
// With no argument it builds one entry that calls every loader of js/views/registry.js, with the
// project's own Vite config, for production and in memory: nothing is written. That shows what the
// view layer emits whether or not the app reaches the registry yet (js/main.js starts to in F9,
// blueprint 4.4). With --dir it reads the stylesheets of a build that already exists, which is the
// check for the app's real build. The rules are in view-css.js. Exit 0 sound, 1 problems, 2 could not
// run. Steward: F0.
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SKINNED_VIEWS, viewCssReport } from './view-css.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const ENTRY = 'virtual:view-css-probe';
const USAGE = 'Usage: node js/views/fixtures/checks/view-css-build.mjs [--dir <build output>]';
const posix = (path) => path.split(sep).join('/');

/** An entry with a side effect: it calls every loader, so the bundler cannot drop them. */
const callEveryLoader = (root) => `import { VIEW_IDS, loadView } from ${JSON.stringify(posix(join(root, 'js/views/registry.js')))};\nVIEW_IDS.map(loadView);\n`;

/** Every stylesheet that loading one chunk brings: its own and those of its static imports. */
function cssBroughtBy(fileName, chunks, seen = new Set()) {
  const chunk = chunks.get(fileName);
  if (!chunk || seen.has(fileName)) return [];
  seen.add(fileName);
  return [...new Set([...(chunk.viteMetadata?.importedCss ?? []), ...chunk.imports.flatMap((dep) => cssBroughtBy(dep, chunks, seen))])];
}

/**
 * Builds the view layer in memory. Production or not follows NODE_ENV, as in every Vite build; the
 * answer is in `production`.
 * @param {{ root?: string, entryCode?: string }} [options] `entryCode` replaces the entry module
 * @returns {Promise<{ production: boolean, sheets: import('./view-css.js').Sheet[], chunks: import('./view-css.js').ViewChunk[] }>}
 */
export async function probeBuild({ root = ROOT, entryCode = callEveryLoader(root) } = {}) {
  const { build } = await import('vite');
  let production = false;
  const result = await build({
    root,
    logLevel: 'silent',
    plugins: [{
      name: 'view-css-probe',
      configResolved(config) { production = config.isProduction; },
      resolveId: (id) => (id === ENTRY ? `\0${ENTRY}` : null),
      load: (id) => (id === `\0${ENTRY}` ? entryCode : null),
    }],
    build: { write: false, rolldownOptions: { input: { probe: ENTRY } } },
  });
  const files = [result].flat().flatMap((one) => one.output);
  const chunks = new Map(files.filter((file) => file.type === 'chunk').map((chunk) => [chunk.fileName, chunk]));
  const chunkOf = (view) => [...chunks.values()].find((chunk) => chunk.facadeModuleId && posix(chunk.facadeModuleId).endsWith(`/js/views/${view}/view.js`));
  return {
    production,
    sheets: files.filter((file) => file.type === 'asset' && file.fileName.endsWith('.css'))
      .map((asset) => ({ file: asset.fileName, css: typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source).toString('utf8') })),
    chunks: SKINNED_VIEWS.flatMap((view) => {
      const chunk = chunkOf(view);
      return chunk ? [{ view, file: chunk.fileName, css: cssBroughtBy(chunk.fileName, chunks) }] : [];
    }),
  };
}

/**
 * @param {string} dir the output directory of a finished build
 * @returns {import('./view-css.js').Sheet[]} every .css file under it, with its path from `dir`
 */
export function readBuildSheets(dir) {
  const base = resolve(dir);
  if (!statSync(base, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${dir} is not a directory`);
  const cssUnder = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return cssUnder(path);
    return entry.isFile() && entry.name.endsWith('.css') ? [path] : [];
  });
  return cssUnder(base).map((path) => ({ file: posix(relative(base, path)), css: readFileSync(path, 'utf8') }));
}

function reportText(title, report) {
  const width = Math.max(...SKINNED_VIEWS.map((id) => id.length), 'shared'.length) + 2;
  const row = (label, files) => `  ${label.padEnd(width)}${files.length ? files.join(', ') : 'none'}`;
  const count = SKINNED_VIEWS.filter((id) => report.skins[id].length === 1).length;
  const verdict = report.problems.length
    ? [`FAIL: ${report.problems.length} ${report.problems.length === 1 ? 'problem' : 'problems'}`, ...report.problems.map((problem) => `  ${problem}`)]
    : [`OK: one stylesheet per view (${count} of ${SKINNED_VIEWS.length}), the shared component styles are there, the stub view is not`];
  return [title, ...SKINNED_VIEWS.map((id) => row(id, report.skins[id])), row('shared', report.shared), ...verdict].join('\n');
}

/** @returns {Promise<number>} the exit code */
async function main(args) {
  const known = args.length === 0 || (args.length === 2 && args[0] === '--dir');
  if (!known) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  try {
    if (args.length === 2) {
      const sheets = readBuildSheets(args[1]);
      const report = viewCssReport({ sheets });
      process.stdout.write(`${reportText(`View stylesheets in ${args[1]} (${sheets.length} stylesheets read)`, report)}\n`);
      return report.problems.length ? 1 : 0;
    }
    // The question is about the production build, whatever the shell or a test runner has set.
    process.env.NODE_ENV = 'production';
    const built = await probeBuild();
    if (!built.production) throw new Error('the probe build did not run for production');
    const report = viewCssReport(built);
    process.stdout.write(`${reportText(`View stylesheets in a probe build of js/views/registry.js (production, in memory, ${built.sheets.length} stylesheets)`, report)}\n`);
    return report.problems.length ? 1 : 0;
  } catch (error) {
    process.stderr.write(`view-css-build: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

/** True when this file is the script Node was started with, and not an import (the test imports it). */
function startedAsScript() {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (startedAsScript()) process.exitCode = await main(process.argv.slice(2));
