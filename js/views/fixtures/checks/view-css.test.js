// What a build must emit for the views (TASKS F0, "one CSS file per view"; blueprint 3.1 and 8.2): one
// stylesheet per view that holds that view's skin and no other, the shared component styles, and
// nothing of the dev-only stub view. The first part proves the check can fail. The second builds the
// view layer of the tree in memory, the way any code that calls the registry's loaders gets it, and
// checks what comes out. The last part runs the tool as the integrator runs it at a gate.
// Steward: F0.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIEW_IDS } from '../../registry.js';
import { DEV_ONLY_VIEWS, SKINNED_VIEWS, viewCssReport, viewScopesIn } from './view-css.js';
import { probeBuild, readBuildSheets } from './view-css-build.mjs';

const TOOL = fileURLToPath(new URL('./view-css-build.mjs', import.meta.url));
const SLOW = 120_000; // a build or a child process: quick alone, slower when every builder runs tests at once

// --- Sheets and chunks as a build emits them --------------------------------------------------------

const SHARED = { file: 'assets/styles-1.css', css: '[data-view] :where(.ui-probe){outline-width:0;outline-style:dotted}' };
const APP = { file: 'assets/index-1.css', css: '.trip-card{color:red}html[data-view-pref] .app-skel--view{display:block}' };
const skin = (id, file = `assets/view-${id}.css`) => ({ file, css: `[data-view=${id}][data-view] .ui-probe{outline-style:dashed}` });
const chunk = (view, css = [`assets/view-${view}.css`, SHARED.file]) => ({ view, file: `assets/view-${view}.js`, css });
const GOOD = [APP, SHARED, skin('departures'), skin('concierge'), skin('atlas')];
const GOOD_CHUNKS = SKINNED_VIEWS.map((id) => chunk(id));
const problemsOf = (sheets, chunks) => viewCssReport({ sheets, chunks }).problems;
const byFile = (sheets) => [...sheets].sort((a, b) => a.file.localeCompare(b.file));

describe('the views the check expects', () => {
  it('are the registry ids, and the stub view is the only dev-only one', () => {
    expect([...SKINNED_VIEWS]).toEqual(VIEW_IDS);
    expect([...DEV_ONLY_VIEWS]).toEqual(['stub']);
  });
});

describe('reading which skins a stylesheet holds', () => {
  it('finds a scope with double quotes, single quotes and none (minified)', () => {
    expect(viewScopesIn('[data-view="atlas"][data-view] .atl-plate { color: red; }')).toEqual(['atlas']);
    expect(viewScopesIn("[data-view='concierge'][data-view] .con-lede{color:red}")).toEqual(['concierge']);
    expect(viewScopesIn('[data-view=departures][data-view] .dep-row{color:red}')).toEqual(['departures']);
  });
  it('lists each view once, in the order of first use', () => {
    expect(viewScopesIn('[data-view=stub][data-view] .a{}[data-view=atlas][data-view] .b{}.td-wrap[data-view=stub][data-view] .c{}')).toEqual(['stub', 'atlas']);
  });
  it('does not take the bare scope, the boot attribute or the trip flag for a skin', () => {
    expect(viewScopesIn(SHARED.css)).toEqual([]);
    expect(viewScopesIn('html[data-view-pref="atlas"] .app-skel{display:block}html[data-trip-view] .nav{display:none}')).toEqual([]);
    expect(viewScopesIn('.td-wrap[data-view][data-view][data-view][data-view][data-view][data-view] :where(.td-body){display:block}')).toEqual([]);
  });
});

describe('the check passes on a sound build', () => {
  it('one sheet per view, the shared sheet, and every view chunk brings both', () => {
    const report = viewCssReport({ sheets: GOOD, chunks: GOOD_CHUNKS });
    expect(report.problems).toEqual([]);
    expect(report.skins).toEqual({ departures: ['assets/view-departures.css'], concierge: ['assets/view-concierge.css'], atlas: ['assets/view-atlas.css'] });
    expect(report.shared).toEqual(['assets/styles-1.css']);
  });
  it('without chunk information (a build read from a directory) the sheets alone are judged', () => {
    expect(problemsOf(GOOD)).toEqual([]);
    expect(problemsOf(GOOD, null)).toEqual([]);
  });
  it('accepts the layout where the bundler puts the shared rules into each view sheet', () => {
    const merged = SKINNED_VIEWS.map((id) => ({ file: `assets/view-${id}.css`, css: SHARED.css + skin(id).css }));
    const report = viewCssReport({ sheets: [APP, ...merged], chunks: SKINNED_VIEWS.map((id) => chunk(id, [`assets/view-${id}.css`])) });
    expect(report.problems).toEqual([]);
    expect(report.shared).toHaveLength(3);
  });
  it('does not change what it is given', () => {
    const sheets = Object.freeze(GOOD.map((sheet) => Object.freeze({ ...sheet })));
    const chunks = Object.freeze(GOOD_CHUNKS.map((entry) => Object.freeze({ ...entry, css: Object.freeze([...entry.css]) })));
    expect(() => viewCssReport({ sheets, chunks })).not.toThrow();
  });
});

describe('the check fails on each defect', () => {
  it('a build that never reaches the views: no skin and no shared styles', () => {
    expect(problemsOf([APP])).toEqual([
      'no stylesheet holds the departures skin: the build does not reach js/views/departures/view.js, or that file does not import css/views/departures.css',
      'no stylesheet holds the concierge skin: the build does not reach js/views/concierge/view.js, or that file does not import css/views/concierge.css',
      'no stylesheet holds the atlas skin: the build does not reach js/views/atlas/view.js, or that file does not import css/views/atlas.css',
      'no stylesheet holds the shared component styles (the [data-view] :where(.ui-probe) rule of css/views/shared/common.css)',
    ]);
    expect(problemsOf([])).toHaveLength(4);
  });
  it('one view without a stylesheet', () => {
    expect(problemsOf(GOOD.filter((sheet) => sheet.file !== 'assets/view-concierge.css'))).toEqual([expect.stringMatching(/^no stylesheet holds the concierge skin/)]);
  });
  it('two skins in one stylesheet', () => {
    const both = { file: 'assets/view-x.css', css: skin('atlas').css + skin('concierge').css };
    expect(problemsOf([APP, SHARED, skin('departures'), both])).toEqual(['assets/view-x.css holds 2 skins (concierge, atlas): each view gets a stylesheet of its own']);
  });
  it('every skin in the one stylesheet of a build that does not split its CSS', () => {
    const all = { file: 'assets/style.css', css: APP.css + SHARED.css + SKINNED_VIEWS.map((id) => skin(id).css).join('') };
    expect(problemsOf([all])).toEqual(['assets/style.css holds 3 skins (departures, concierge, atlas): each view gets a stylesheet of its own']);
  });
  it('one skin spread over two stylesheets', () => {
    expect(problemsOf([...GOOD, skin('atlas', 'assets/atlas-page-1.css')])).toEqual(['the atlas skin is in 2 stylesheets (assets/view-atlas.css, assets/atlas-page-1.css): expected one']);
  });
  it('the dev-only stub view in the build', () => {
    expect(problemsOf([...GOOD, skin('stub')])).toEqual(['assets/view-stub.css holds the dev-only stub view: it belongs on the dev server, not in a production build']);
  });
  it('no shared component styles', () => {
    expect(problemsOf(GOOD.filter((sheet) => sheet !== SHARED))).toEqual([expect.stringMatching(/^no stylesheet holds the shared component styles/)]);
  });
  it('a view with no chunk of its own', () => {
    expect(problemsOf(GOOD, GOOD_CHUNKS.filter((entry) => entry.view !== 'atlas'))).toEqual([
      'no chunk of its own for js/views/atlas/view.js: the registry needs a loader with a literal import() of it, and something must call the loaders',
    ]);
  });
  it('a view chunk that does not bring its skin', () => {
    expect(problemsOf(GOOD, [chunk('departures'), chunk('concierge'), chunk('atlas', [SHARED.file])])).toEqual([
      'the atlas chunk (assets/view-atlas.js) does not bring the atlas skin with it',
    ]);
  });
  it("a view chunk that brings another view's skin", () => {
    expect(problemsOf(GOOD, [chunk('departures'), chunk('concierge'), chunk('atlas', ['assets/view-atlas.css', 'assets/view-concierge.css', SHARED.file])])).toEqual([
      'the atlas chunk (assets/view-atlas.js) brings the concierge skin (assets/view-concierge.css)',
    ]);
  });
  it('a view chunk that does not bring the shared component styles', () => {
    expect(problemsOf(GOOD, [chunk('departures'), chunk('concierge', ['assets/view-concierge.css']), chunk('atlas')])).toEqual([
      'the concierge chunk (assets/view-concierge.js) does not bring the shared component styles with it',
    ]);
  });
});

// --- The tree as it is ------------------------------------------------------------------------------

describe('a build of the view layer in the tree', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('emits one stylesheet per view, the shared sheet, and nothing of the stub view', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const built = await probeBuild();
    expect(built.production).toBe(true);
    const report = viewCssReport(built);
    expect(report.problems).toEqual([]);
    const files = SKINNED_VIEWS.flatMap((id) => report.skins[id]);
    expect(files).toHaveLength(3);
    expect(new Set(files).size).toBe(3);
    expect(built.chunks.map((entry) => entry.view).sort()).toEqual([...SKINNED_VIEWS].sort());
  }, SLOW);

  it('in a development build the stub view is there, and the check says so', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const built = await probeBuild();
    expect(built.production).toBe(false);
    expect(viewCssReport(built).problems).toEqual([expect.stringMatching(/ holds the dev-only stub view: /)]);
  }, SLOW);

  it('an entry that calls no loader gets no view stylesheet, which is the app before main.js imports the registry', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const built = await probeBuild({ entryCode: 'globalThis.viewCssProbe = true;\n' });
    expect(built.sheets).toEqual([]);
    expect(built.chunks).toEqual([]);
    expect(viewCssReport(built).problems).toHaveLength(7);
  }, SLOW);
});

// --- The tool ---------------------------------------------------------------------------------------

describe('the tool', () => {
  const dirs = [];
  const buildDir = (sheets) => {
    const dir = mkdtempSync(join(tmpdir(), 'trippy-view-css-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>');
    for (const sheet of sheets) writeFileSync(join(dir, sheet.file), sheet.css);
    return dir;
  };
  const run = (args, nodeEnv = 'test') => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', timeout: SLOW, env: { ...process.env, NODE_ENV: nodeEnv } });
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

  it('reads every stylesheet of a build directory, with paths from that directory', () => {
    const dir = buildDir(GOOD);
    expect(byFile(readBuildSheets(dir))).toEqual(byFile(GOOD));
  });
  it('fails clearly on a directory that is not there', () => {
    expect(() => readBuildSheets(join(tmpdir(), 'trippy-view-css-not-there'))).toThrow(/is not a directory/);
  });
  it.each(['development', 'test', 'production'])('with no argument builds the view layer for production and exits 0, also when NODE_ENV is %s', (nodeEnv) => {
    const result = run([], nodeEnv);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/^OK: one stylesheet per view \(3 of 3\)/m);
    for (const id of SKINNED_VIEWS) expect(result.stdout).toMatch(new RegExp(`^  ${id} +assets/\\S+\\.css$`, 'm'));
    expect(result.status).toBe(0);
  }, SLOW);
  it('with --dir judges an existing build: exit 0 when each view has its stylesheet', () => {
    const result = run(['--dir', buildDir(GOOD)]);
    expect(result.stdout).toMatch(/^OK: one stylesheet per view \(3 of 3\)/m);
    expect(result.status).toBe(0);
  }, SLOW);
  it('with --dir exits 1 and lists what is missing when the build holds no view stylesheet', () => {
    const result = run(['--dir', buildDir([APP])]);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/^FAIL: 4 problems$/m);
    expect(result.stdout).toMatch(/^  no stylesheet holds the atlas skin: /m);
    for (const id of SKINNED_VIEWS) expect(result.stdout).toMatch(new RegExp(`^  ${id} +none$`, 'm'));
  }, SLOW);
  it('exits 2 on a directory that is not there and on an argument it does not know', () => {
    const missing = run(['--dir', join(tmpdir(), 'trippy-view-css-not-there')]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toMatch(/is not a directory/);
    const unknown = run(['--outDir', 'dist']);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toMatch(/^Usage: /m);
  }, SLOW);
});
