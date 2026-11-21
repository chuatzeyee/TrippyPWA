// readiness-list.js: "Before you go": the list, the chip, the meter and the Prep card (blueprint 2.2,
// 4.2, 7.3). Owner: F5.
import { describe, it, expect } from 'vitest';
import { readinessListHtml, readinessChipHtml, readinessMeterHtml, prepCardHtml } from './readiness-list.js';
import { DASHBOARD_FIXTURES, TRIP_FIXTURES } from '../fixtures/models.js';
import { ready, readinessOf } from '../fixtures/parts.js';
import { parseHtml, all, attr, textOf, classesOf } from '../fixtures/checks/html-tree.js';
import { markupRules } from '../fixtures/checks/markup-rules.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  return root;
};
const cards = DASHBOARD_FIXTURES.ready.cardsById;
const SOME = cards['s-vancouver'].readiness;      // flights done, stay to do, entry to do with a due date
const NONE_DONE = cards['s-marrakech'].readiness.items.every((item) => item.state !== 'done')
  ? cards['s-marrakech'].readiness
  : readinessOf([ready('flights', 'todo', 'Not booked yet', 'Suggested direct flights.'), ready('stay', 'todo', 'None booked', '3 options to compare.')]);
const ALL_DONE = readinessOf([ready('flights', 'done', 'Booked', 'Booked both ways.'), ready('stay', 'done', 'Booked', 'Casa da Ribeira, 3 nights.')], { perDevice: false });
const PENDING = cards['s-buenos-aires'].readiness; // flights to do, stay to do, entry checking
const COLLAPSED = cards['s-seville'].readiness;    // live plan: one line
const rowsOf = (root) => all(root, '.ui-ready-row');
const counts = (el) => [Number(attr(el, 'data-ready-done')), Number(attr(el, 'data-ready-total'))];

describe('readinessListHtml', () => {
  it('draws one keyed row per area, in order, with its label, status and detail', () => {
    const root = tree(readinessListHtml(SOME));
    const rows = rowsOf(root);
    expect(rows.map((row) => attr(row, 'data-key'))).toEqual(['travel', 'stay', 'entry']);
    expect(rows.map((row) => attr(row, 'data-state'))).toEqual(['done', 'todo', 'todo']);
    for (const [i, row] of rows.entries()) {
      const item = SOME.items[i];
      expect(textOf(all(row, '.ui-ready-label')[0])).toBe(item.label);
      expect(textOf(all(row, '.ui-ready-status')[0])).toContain(item.status);
      expect(textOf(all(row, '.ui-ready-detail')[0])).toBe(item.detail);
    }
    expect(textOf(root)).toContain('Before you go');
    expect(textOf(root)).toContain(SOME.headline);
  });
  it('draws none done', () => {
    const root = tree(readinessListHtml(NONE_DONE));
    expect(rowsOf(root).filter((row) => attr(row, 'data-state') === 'done')).toHaveLength(0);
    expect(counts(all(root, '.ui-ready')[0])).toEqual([0, NONE_DONE.total]);
  });
  it('draws all done, and says so', () => {
    const root = tree(readinessListHtml(ALL_DONE));
    const [el] = all(root, '.ui-ready');
    expect(rowsOf(root).every((row) => attr(row, 'data-state') === 'done')).toBe(true);
    expect(counts(el)).toEqual([2, 2]);
    expect(classesOf(el)).toContain('is-ready');
    expect(textOf(all(root, '.ui-ready-count')[0])).toBe('Ready');
  });
  it('draws a pending row as checking, not as to do', () => {
    const root = tree(readinessListHtml(PENDING));
    const pending = rowsOf(root).find((row) => attr(row, 'data-state') === 'checking');
    expect(attr(pending, 'data-key')).toBe('entry');
    expect(textOf(all(pending, '.ui-ready-status')[0])).toContain('Checking');
    expect(all(pending, '.ui-ready-detail')).toHaveLength(0);
    expect(counts(all(root, '.ui-ready')[0])).toEqual([0, 3]);
  });
  it('names the state of each row for assistive technology', () => {
    const rows = rowsOf(tree(readinessListHtml(PENDING)));
    expect(rows.map((row) => textOf(all(row, '.ui-vh')[0]))).toEqual(['To do:', 'To do:', 'Checking:']);
    expect(textOf(all(rowsOf(tree(readinessListHtml(SOME)))[0], '.ui-vh')[0])).toBe('Done:');
  });
  it('prints the device note only when ticks decide a state', () => {
    expect(textOf(tree(readinessListHtml(SOME)))).toContain('Ticks are saved on this device.');
    expect(textOf(tree(readinessListHtml(ALL_DONE)))).not.toContain('Ticks are saved');
    const deviceRow = rowsOf(tree(readinessListHtml(SOME))).find((row) => attr(row, 'data-source') === 'device');
    expect(attr(deviceRow, 'data-key')).toBe('entry');
  });
  it('shows a due date with its urgency', () => {
    const [due] = all(tree(readinessListHtml(SOME)), '.ui-ready-due');
    expect(textOf(due)).toBe(`Due ${SOME.items[2].due.text}`);
    expect(attr(due, 'data-due')).toBe('later');
    expect(all(tree(readinessListHtml(NONE_DONE)), '.ui-ready-due')).toHaveLength(0);
  });
  it('gives every row an action that opens its section, carrying aria-controls', () => {
    const root = tree(readinessListHtml(SOME));
    const actions = all(root, 'button[data-section-jump]');
    expect(actions).toHaveLength(3);
    for (const [i, action] of actions.entries()) {
      const item = SOME.items[i];
      expect(attr(action, 'data-section-jump')).toBe(item.target);
      expect(attr(action, 'aria-controls')).toBe(`td-section-${item.target}`);
      expect(attr(action, 'aria-expanded')).toBe('false');
      expect(attr(action, 'data-focus-key')).toBe(`ready-${item.area}`);
      expect(textOf(action)).toContain(item.actionLabel);
    }
  });
  it('links each row to the plan instead when the dashboard gives it an address', () => {
    const root = tree(readinessListHtml(SOME, { href: '#/trip/s-vancouver', id: 's-vancouver' }));
    expect(all(root, 'button')).toHaveLength(0);
    const links = all(root, 'a.ui-ready-action');
    expect(links).toHaveLength(3);
    expect(links.every((a) => attr(a, 'href') === '#/trip/s-vancouver')).toBe(true);
    expect(attr(links[0], 'data-focus-key')).toBe('ready-s-vancouver-travel');
    expect(all(root, '[aria-controls]')).toHaveLength(0);
  });
  it('says the count in a polite status that a patch keeps (the trip landing region)', () => {
    const root = tree(readinessListHtml(SOME, { region: true }));
    const [el] = all(root, '.ui-ready');
    const said = all(el, '[role="status"]');
    expect(said).toHaveLength(1);
    expect(textOf(said[0])).toBe(`Before you go: ${SOME.headline}`);
    expect(classesOf(said[0])).toContain('ui-vh');
    // Every child of the region is keyed with a key of its own, so patchRegions() updates the status
    // in place (a replaced node is not announced).
    const keys = el.children.filter((child) => typeof child.tag === 'string' && child.tag !== '').map((child) => attr(child, 'data-key'));
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('said');
    // A list that is not the region (a dashboard card) is left as it was.
    expect(all(tree(readinessListHtml(SOME, { href: '#/trip/x' })), '[role="status"]')).toHaveLength(0);
    // The collapsed line of a live plan has it too.
    const live = all(tree(readinessListHtml({ ...SOME, collapsed: true }, { region: true })), '.ui-ready')[0];
    expect(all(live, '[role="status"]')).toHaveLength(1);
  });
  it('reads the count once: with the status line, the visible count and the meter are hidden from the reading order', () => {
    for (const readiness of [SOME, { ...SOME, collapsed: true }]) {
      const el = all(tree(readinessListHtml(readiness, { region: true })), '.ui-ready')[0];
      expect(attr(all(el, '.ui-ready-count')[0], 'aria-hidden')).toBe('true');
      const meter = all(el, '.ui-meter')[0];
      expect(attr(meter, 'aria-hidden')).toBe('true');
      expect(attr(meter, 'role')).toBeFalsy();
      expect(attr(all(el, '[role="status"]')[0], 'aria-hidden')).toBeFalsy();
    }
    // Without the status line the visible count and the meter are what is read.
    const plain = all(tree(readinessListHtml(SOME)), '.ui-ready')[0];
    expect(attr(all(plain, '.ui-ready-count')[0], 'aria-hidden')).toBeFalsy();
    expect(attr(all(plain, '.ui-meter')[0], 'role')).toBe('img');
  });
  it('draws the collapsed form as one line with the count', () => {
    const root = tree(readinessListHtml(COLLAPSED));
    const [el] = all(root, '.ui-ready');
    expect(classesOf(el)).toContain('is-collapsed');
    expect(rowsOf(root)).toHaveLength(0);
    expect(textOf(el)).toContain('Before you go');
    expect(textOf(el)).toContain(COLLAPSED.headline);
    expect(counts(el)).toEqual([COLLAPSED.done, COLLAPSED.total]);
    const [action] = all(el, 'button[data-section-jump]');
    expect(attr(action, 'data-section-jump')).toBe('checklist');
    expect(attr(action, 'aria-controls')).toBe('td-section-checklist');
  });
  it('can be the readiness region, as a labelled section with an h2', () => {
    const root = tree(readinessListHtml(SOME, { region: true }));
    const [section] = all(root, 'section.ui-ready');
    expect(attr(section, 'data-region')).toBe('readiness');
    const [h2] = all(section, 'h2');
    expect(attr(section, 'aria-labelledby')).toBe(attr(h2, 'id'));
    expect(all(tree(readinessListHtml(SOME)), '[data-region]')).toHaveLength(0);
  });
  it('takes a lower heading for use inside a card, and then is not a section', () => {
    const root = tree(readinessListHtml(SOME, { heading: 'h4', id: 'next' }));
    expect(all(root, 'section')).toHaveLength(0);
    expect(all(root, 'h4.ui-ready-title')).toHaveLength(1);
    expect(all(root, 'h2')).toHaveLength(0);
  });
  it('can cap the rows, for a card that shows the first few', () => {
    expect(rowsOf(tree(readinessListHtml(PENDING, { only: 'todo', max: 1 })))).toHaveLength(1);
    expect(rowsOf(tree(readinessListHtml(SOME, { only: 'todo' }))).map((row) => attr(row, 'data-key'))).toEqual(['stay', 'entry']);
    expect(counts(all(tree(readinessListHtml(SOME, { only: 'todo' })), '.ui-ready')[0])).toEqual([1, 3]);
  });
  it('escapes hostile text', () => {
    const hostile = readinessOf([ready('entry', 'todo', HOSTILE, HOSTILE, { label: HOSTILE, actionLabel: HOSTILE, target: HOSTILE, due: { by: '2027-01-01', text: HOSTILE, state: HOSTILE } })]);
    const root = tree(readinessListHtml({ ...hostile, headline: HOSTILE }));
    expect(all(root, 'img')).toHaveLength(0);
    expect(textOf(all(root, '.ui-ready-count')[0])).toBe(HOSTILE);
    expect(attr(all(root, '.ui-ready-due')[0], 'data-due')).toBe('later');
  });
  it('draws nothing without readiness, and does not change what it was given', () => {
    expect(readinessListHtml(null)).toBe('');
    const frozen = Object.freeze({ ...SOME, items: Object.freeze(SOME.items.map((item) => Object.freeze({ ...item }))) });
    expect(() => readinessListHtml(frozen)).not.toThrow();
  });
});

describe('readinessChipHtml', () => {
  it('counts what is left to do', () => {
    const [chip] = all(tree(readinessChipHtml(SOME)), '.ui-ready-chip');
    expect(textOf(chip)).toContain('2 to do');
    expect(attr(chip, 'data-ready')).toBe('todo');
  });
  it('leaves a pending area out of the number', () => {
    expect(textOf(tree(readinessChipHtml(PENDING)))).toContain('2 to do');
  });
  it('reads Ready when everything is done, and Checking when only a check is open', () => {
    const [done] = all(tree(readinessChipHtml(ALL_DONE)), '.ui-ready-chip');
    expect(textOf(done)).toContain('Ready');
    expect(attr(done, 'data-ready')).toBe('ready');
    const checking = readinessOf([ready('stay', 'done', 'Booked', ''), ready('entry', 'checking', 'Checking', '')]);
    expect(textOf(tree(readinessChipHtml(checking)))).toContain('Checking');
    expect(attr(all(tree(readinessChipHtml(checking)), '.ui-ready-chip')[0], 'data-ready')).toBe('checking');
  });
  it('draws nothing without readiness', () => {
    expect(readinessChipHtml(null)).toBe('');
  });
});

describe('readinessMeterHtml', () => {
  it('draws one cell per area and fills the done ones', () => {
    const [meter] = all(tree(readinessMeterHtml(SOME)), '.ui-meter');
    const cells = all(meter, '.ui-meter-cell');
    expect(cells).toHaveLength(3);
    expect(cells.filter((cell) => attr(cell, 'data-on') !== null)).toHaveLength(1);
    expect(attr(meter, 'role')).toBe('img');
    expect(attr(meter, 'aria-label')).toBe('1 of 3 ready');
  });
  it('draws nothing without readiness', () => {
    expect(readinessMeterHtml(null)).toBe('');
  });
});

describe('prepCardHtml', () => {
  it('shows the same done and total as the list, from one Readiness', () => {
    for (const readiness of [SOME, NONE_DONE, ALL_DONE, PENDING, COLLAPSED]) {
      const [list] = all(tree(readinessListHtml(readiness)), '.ui-ready');
      const [prep] = all(tree(prepCardHtml(readiness)), '.ui-prep');
      expect(counts(prep)).toEqual(counts(list));
      expect(counts(prep)).toEqual([readiness.done, readiness.total]);
      expect(textOf(all(prep, '.ui-prep-count')[0])).toBe(textOf(all(list, '.ui-ready-count')[0]));
      expect(all(prep, '.ui-prep-row')).toHaveLength(readiness.items.length);
    }
  });
  it('checks and locks a row that data already settled, and shows its status', () => {
    const rows = all(tree(prepCardHtml(SOME)), '.ui-prep-row');
    const [box] = all(rows[0], 'input');
    expect(attr(box, 'type')).toBe('checkbox');
    expect(attr(box, 'checked')).toBe('');
    expect(attr(box, 'disabled')).toBe('');
    expect(attr(box, 'data-tick-key')).toBe('flights');
    expect(textOf(all(rows[0], '.ui-prep-status')[0])).toBe('Booked');
  });
  it('leaves an open row unticked and writable, with its tick key and focus key', () => {
    const rows = all(tree(prepCardHtml(SOME)), '.ui-prep-row');
    const [box] = all(rows[1], 'input');
    expect(attr(box, 'checked')).toBeNull();
    expect(attr(box, 'disabled')).toBeNull();
    expect(attr(box, 'data-tick-key')).toBe('accommodation');
    expect(attr(box, 'data-focus-key')).toBe('prep-stay');
    expect(textOf(all(rows[1], 'label')[0])).toContain('Stay');
  });
  it('keeps a row ticked on this device checked and writable', () => {
    const [row] = all(tree(prepCardHtml(COLLAPSED)), '.ui-prep-row');
    const [box] = all(row, 'input');
    expect(attr(box, 'checked')).toBe('');
    expect(attr(box, 'disabled')).toBeNull();
  });
  it('gives the entry row no box, and a control that opens the entry card', () => {
    const rows = all(tree(prepCardHtml(SOME)), '.ui-prep-row');
    expect(all(rows[2], 'input')).toHaveLength(0);
    const [jump] = all(rows[2], 'button[data-section-jump="entry"]');
    expect(attr(jump, 'aria-controls')).toBe('td-section-entry');
    expect(attr(jump, 'data-focus-key')).toBe('prep-entry');
  });
  it('gives a part-booked row no box either: a tick could not settle it, so it gets a jump to its card', () => {
    const { readiness } = TRIP_FIXTURES.imported;
    const at = readiness.items.findIndex((item) => item.tickKey === null && item.area !== 'entry');
    expect(at).toBeGreaterThanOrEqual(0);
    const item = readiness.items[at];
    expect(item.state).toBe('todo');
    const [prep] = all(tree(prepCardHtml(readiness)), '.ui-prep');
    const rows = all(prep, '.ui-prep-row');
    expect(rows).toHaveLength(readiness.items.length);
    const row = rows[at];
    expect(attr(row, 'data-key')).toBe(item.area);
    expect(attr(row, 'data-state')).toBe('todo');
    expect(all(row, 'input')).toHaveLength(0);
    expect(all(row, 'label')).toHaveLength(0);
    expect(textOf(all(row, '.ui-prep-label')[0])).toBe(item.label);
    expect(textOf(all(row, '.ui-prep-status')[0])).toBe(item.status);
    const jumps = all(row, 'button');
    expect(jumps).toHaveLength(1);
    expect(attr(jumps[0], 'data-section-jump')).toBe(item.target);
    expect(attr(jumps[0], 'aria-controls')).toBe(`td-section-${item.target}`);
    expect(attr(jumps[0], 'aria-expanded')).toBe('false');
    expect(attr(jumps[0], 'data-focus-key')).toBe(`prep-${item.area}`);
    expect(textOf(jumps[0])).toBe(item.actionLabel);
    // The rows a tick does settle keep their boxes, and the card still counts what the list counts.
    const boxes = all(prep, 'input');
    expect(boxes.map((box) => attr(box, 'data-tick-key'))).toEqual(readiness.items.filter((other) => other.tickKey).map((other) => other.tickKey));
    expect(counts(prep)).toEqual([readiness.done, readiness.total]);
    expect(counts(prep)).toEqual(counts(all(tree(readinessListHtml(readiness)), '.ui-ready')[0]));
  });
  it('prints the device note under the same rule as the list', () => {
    expect(textOf(tree(prepCardHtml(SOME)))).toContain('Ticks are saved on this device.');
    expect(textOf(tree(prepCardHtml(ALL_DONE)))).not.toContain('Ticks are saved');
  });
  it('escapes hostile text and draws nothing without readiness', () => {
    const hostile = readinessOf([ready('stay', 'todo', HOSTILE, HOSTILE, { label: HOSTILE, tickKey: HOSTILE })]);
    const root = tree(prepCardHtml(hostile));
    expect(all(root, 'img')).toHaveLength(0);
    expect(attr(all(root, 'input')[0], 'data-tick-key')).toBe(HOSTILE);
    expect(prepCardHtml(null)).toBe('');
  });
});

describe('readinessListHtml: title, intro and head', () => {
  it('changes nothing when no option is given', () => {
    expect(readinessListHtml(SOME, { title: ' ', intro: '', head: true })).toBe(readinessListHtml(SOME));
  });

  it('takes other words for the heading, escaped, also on the one line of a live plan', () => {
    const root = tree(readinessListHtml(SOME, { title: 'Still to arrange' }));
    expect(textOf(all(root, 'h2.ui-ready-title')[0])).toBe('Still to arrange');
    expect(readinessListHtml(SOME, { title: HOSTILE })).not.toContain('<img');
    expect(textOf(all(tree(readinessListHtml(COLLAPSED, { title: 'Still to arrange' })), '.ui-ready-title')[0])).toBe('Still to arrange');
  });

  it('prints one sentence under the head, escaped', () => {
    const root = tree(readinessListHtml(SOME, { intro: 'Three things are open.' }));
    const section = all(root, '.ui-ready')[0];
    const kids = section.children.filter((node) => node.tag);
    expect(classesOf(kids[0])).toContain('ui-ready-head');
    expect(classesOf(kids[1])).toContain('ui-ready-intro');
    expect(textOf(kids[1])).toBe('Three things are open.');
    expect(readinessListHtml(SOME, { intro: HOSTILE })).not.toContain('<img');
  });

  it('leaves the head out for a view that draws its own, and names the section by aria-label', () => {
    const root = tree(readinessListHtml(SOME, { head: false, region: true }));
    const section = all(root, 'section.ui-ready')[0];
    expect(all(root, '.ui-ready-head, .ui-ready-title, h2')).toHaveLength(0);
    expect(attr(section, 'aria-label')).toBe('Before you go');
    expect(attr(section, 'aria-labelledby') ?? null).toBeNull();
    expect(attr(section, 'data-region')).toBe('readiness');
    expect(counts(section)).toEqual(counts(all(tree(readinessListHtml(SOME)), '.ui-ready')[0]));
    expect(rowsOf(root)).toHaveLength(rowsOf(tree(readinessListHtml(SOME))).length);
    const inCard = all(tree(readinessListHtml(SOME, { head: false, heading: 'h3' })), 'div.ui-ready')[0];
    expect(attr(inCard, 'aria-label') ?? null).toBeNull();
  });
});
