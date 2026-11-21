// state-cards.js: empty, load error, stale, generating and failed states, and the past toggle
// (blueprint 3.3). Owner: F5.
import { describe, it, expect } from 'vitest';
import { emptyStateHtml, loadErrorHtml, staleBannerHtml, generatingCardHtml, failedCardHtml, pastToggleHtml } from './state-cards.js';
import { DASHBOARD_FIXTURES } from '../fixtures/models.js';
import { parseHtml, all, attr, textOf, matches } from '../fixtures/checks/html-tree.js';
import { markupRules } from '../fixtures/checks/markup-rules.js';

const HOSTILE = `"><img src=x onerror=alert(1)>&'`;
const tree = (html) => {
  const { root, errors } = parseHtml(html);
  expect(errors).toEqual([]);
  expect(markupRules(root)).toEqual([]);
  return root;
};
const first = (html) => tree(html).children.find((node) => node.tag);
const focusKeys = (root) => all(root, 'button').concat(all(root, 'a')).map((el) => attr(el, 'data-focus-key'));

describe('emptyStateHtml', () => {
  it('offers both ways to start, as real buttons with focus keys', () => {
    const root = tree(emptyStateHtml(DASHBOARD_FIXTURES.empty));
    const [plan] = all(root, 'button[data-action="new-trip"]');
    const [bring] = all(root, 'button[data-action="import-trip"]');
    expect(textOf(plan)).toBe('Plan your first trip');
    expect(textOf(bring)).toBe('Import a trip');
    expect(focusKeys(root).every(Boolean)).toBe(true);
    expect(textOf(root)).toContain('Nothing is planned yet');
  });
  it('takes its own words, escaped', () => {
    const root = tree(emptyStateHtml(DASHBOARD_FIXTURES.empty, { title: HOSTILE, text: HOSTILE }));
    expect(all(root, 'img')).toHaveLength(0);
    expect(textOf(root)).toContain(HOSTILE);
  });
  it('can leave the buttons to the view', () => {
    expect(all(tree(emptyStateHtml(DASHBOARD_FIXTURES.empty, { actions: false })), 'button')).toHaveLength(0);
  });
});

describe('loadErrorHtml', () => {
  it('is an alert that holds the retry button', () => {
    const el = first(loadErrorHtml());
    expect(attr(el, 'role')).toBe('alert');
    const [retry] = all(el, 'button[data-action="retry-trips"]');
    expect(textOf(retry)).toBe('Try again');
    expect(attr(retry, 'data-focus-key')).toBe('retry-trips');
    expect(textOf(el)).toContain('Your trips could not be loaded');
  });
  it('escapes a message of its own', () => {
    const root = tree(loadErrorHtml({ message: HOSTILE }));
    expect(all(root, 'img')).toHaveLength(0);
    expect(textOf(root)).toContain(HOSTILE);
  });
});

describe('staleBannerHtml', () => {
  it('is a status that holds the retry button', () => {
    const el = first(staleBannerHtml(DASHBOARD_FIXTURES.stale.stale));
    expect(attr(el, 'role')).toBe('status');
    expect(all(el, 'button[data-action="retry-trips"]')).toHaveLength(1);
    expect(attr(all(el, 'button')[0], 'data-focus-key')).toBe('retry-trips');
    expect(textOf(el)).toContain('saved on this device');
  });
  it('says when the list was saved, when the caller has the words', () => {
    expect(textOf(tree(staleBannerHtml({ savedAt: '2027-03-09T18:42:00+00:00' }, { savedText: 'yesterday at 6:42 PM <b>' })))).toContain('yesterday at 6:42 PM <b>');
  });
  it('draws nothing when the list is fresh', () => {
    expect(staleBannerHtml(null)).toBe('');
    expect(staleBannerHtml(undefined)).toBe('');
  });
});

describe('generatingCardHtml', () => {
  const card = DASHBOARD_FIXTURES.generating.sections.inProgress[0];
  const noDates = DASHBOARD_FIXTURES.generatingNoDates.sections.inProgress[0];
  it('carries the trip hooks, the state and the status role, and no link', () => {
    const el = first(generatingCardHtml(card));
    expect(attr(el, 'data-trip-id')).toBe(card.id);
    expect(attr(el, 'data-key')).toBe(card.id);
    expect(attr(el, 'data-trip-state')).toBe('generating');
    expect(attr(el, 'role')).toBe('status');
    expect(all(el, 'a')).toHaveLength(0);
    expect(textOf(all(el, 'h3')[0])).toBe(card.title);
  });
  it('says how far planning is and about how long is left', () => {
    const text = textOf(first(generatingCardHtml(card)));
    expect(text).toContain('4 of 9 days planned');
    expect(text).toContain('about 3 minutes to go');
    expect(all(first(generatingCardHtml(card)), '.ui-seg')).toHaveLength(9);
  });
  it('reads "so far" when the length is not known, and says when it is slow', () => {
    const el = first(generatingCardHtml(noDates));
    expect(textOf(el)).toContain('4 days planned so far');
    expect(textOf(el)).toContain('taking longer than usual');
    expect(all(el, '.ui-segs')).toHaveLength(0);
  });
  it('uses the singular for one day and one minute', () => {
    const one = { ...card, generation: { ...card.generation, daysDone: 1, daysTotal: null, etaMinutes: 1 } };
    const text = textOf(first(generatingCardHtml(one)));
    expect(text).toContain('1 day planned so far');
    expect(text).toContain('about 1 minute to go');
  });
  it('emits the notify control through the shared component', () => {
    const [notify] = all(first(generatingCardHtml(card)), 'button[data-action="notify-ready"]');
    expect(attr(notify, 'data-focus-key')).toBe(`notify-${card.id}`);
    expect(all(first(generatingCardHtml(card, { notify: false })), 'button')).toHaveLength(0);
  });
  it('takes the tag the view needs', () => {
    expect(first(generatingCardHtml(card)).tag).toBe('article');
    expect(first(generatingCardHtml(card, { tag: 'li' })).tag).toBe('li');
    expect(first(generatingCardHtml(card, { tag: 'script' })).tag).toBe('article');
  });
  it('escapes a hostile title and id', () => {
    const root = tree(generatingCardHtml({ ...card, id: HOSTILE, title: HOSTILE }));
    expect(all(root, 'img')).toHaveLength(0);
    expect(attr(first(generatingCardHtml({ ...card, id: HOSTILE, title: HOSTILE })), 'data-trip-id')).toBe(HOSTILE);
    expect(textOf(all(root, 'h3')[0])).toBe(HOSTILE);
  });
});

describe('failedCardHtml', () => {
  const own = DASHBOARD_FIXTURES.failed.sections.inProgress[0];
  const shared = DASHBOARD_FIXTURES.failedShared.sections.inProgress[0];
  it('carries the trip hooks and the state, with retry and delete and no link', () => {
    const el = first(failedCardHtml(own));
    expect(attr(el, 'data-trip-id')).toBe(own.id);
    expect(attr(el, 'data-key')).toBe(own.id);
    expect(attr(el, 'data-trip-state')).toBe('failed');
    expect(all(el, 'a')).toHaveLength(0);
    expect(textOf(all(el, 'h3')[0])).toBe(own.title);
    expect(textOf(el)).toContain(own.generation.error);
    const [retry] = all(el, `button[data-retry-trip="${own.id}"]`);
    const [remove] = all(el, `button[data-delete-trip="${own.id}"]`);
    expect(attr(retry, 'data-focus-key')).toBe(`retry-${own.id}`);
    expect(attr(remove, 'data-focus-key')).toBe(`delete-${own.id}`);
  });
  it('offers no delete on a plan shared with the user', () => {
    const el = first(failedCardHtml(shared));
    expect(all(el, '[data-delete-trip]')).toHaveLength(0);
    expect(all(el, '[data-retry-trip]')).toHaveLength(1);
  });
  it('has words of its own when no error text is stored', () => {
    expect(textOf(first(failedCardHtml({ ...own, generation: { ...own.generation, error: '' } })))).toContain('Planning stopped');
  });
  it('escapes a hostile error', () => {
    const root = tree(failedCardHtml({ ...own, generation: { ...own.generation, error: HOSTILE } }));
    expect(all(root, 'img')).toHaveLength(0);
    expect(textOf(root)).toContain(HOSTILE);
  });
});

describe('pastToggleHtml', () => {
  it('owns data-action="show-all-past"', () => {
    const el = first(pastToggleHtml(7));
    expect(matches(el, 'button[data-action="show-all-past"]')).toBe(true);
    expect(attr(el, 'data-focus-key')).toBe('show-all-past');
    expect(attr(el, 'type')).toBe('button');
    expect(textOf(el)).toBe('Show all 7 past plans');
  });
  it('reads well for one plan', () => {
    expect(textOf(first(pastToggleHtml(1)))).toBe('Show 1 past plan');
  });
  it('draws nothing when there is nothing more to show', () => {
    for (const count of [0, -1, null, undefined, NaN, '7']) expect(pastToggleHtml(count)).toBe('');
  });
});

describe('generatingCardHtml and failedCardHtml: the options a view asks for', () => {
  const cards = Object.values(DASHBOARD_FIXTURES.ready.cardsById);
  const base = cards[0];
  const GEN = { ...base, id: 't-gen', title: 'Porto in spring', generation: { daysDone: 4, daysTotal: 13, etaMinutes: 3, slow: false } };
  const FAILED = { ...base, id: 't-failed', title: 'Porto in spring', shared: false, generation: { daysDone: 4, daysTotal: 13, error: '' } };
  const builders = [[generatingCardHtml, GEN, 'Still being planned'], [failedCardHtml, FAILED, 'Planning stopped']];

  it('changes nothing when no option is given', () => {
    for (const [build, card] of builders) expect(build(card, { subtitle: '', statusLabel: ' ', afterStatus: null })).toBe(build(card));
  });

  it('puts a line of plain text under the title, escaped', () => {
    for (const [build, card] of builders) {
      const root = first(build(card, { subtitle: '3 to 15 May 2027' }));
      const kids = root.children.filter((node) => node.tag);
      expect(matches(kids[0], 'h3.dv-card-title')).toBe(true);
      expect(matches(kids[1], 'p.dv-card-sub')).toBe(true);
      expect(textOf(kids[1])).toBe('3 to 15 May 2027');
      const hostile = build(card, { subtitle: HOSTILE });
      expect(hostile).not.toContain('<img');
      expect(textOf(all(tree(hostile), '.dv-card-sub')[0])).toBe(HOSTILE);
    }
  });

  it('takes other words for the status line, escaped, and keeps the default otherwise', () => {
    for (const [build, card, words] of builders) {
      expect(textOf(all(tree(build(card)), '.dv-card-status')[0])).toBe(words);
      expect(textOf(all(tree(build(card, { statusLabel: 'Planning now' })), '.dv-card-status')[0])).toBe('Planning now');
      expect(build(card, { statusLabel: HOSTILE })).not.toContain('<img');
    }
  });

  it('places trusted markup right after the status line', () => {
    for (const [build, card] of builders) {
      const root = first(build(card, { afterStatus: '<p class="x-dates">3 to 15 May</p>' }));
      const kids = root.children.filter((node) => node.tag);
      const at = kids.findIndex((node) => matches(node, 'p.dv-card-status'));
      expect(matches(kids[at + 1], 'p.x-dates')).toBe(true);
    }
  });

  it('says how far planning got on a failed card when asked, with the segments', () => {
    expect(failedCardHtml(FAILED)).not.toContain('Stopped after');
    const root = tree(failedCardHtml(FAILED, { progress: true }));
    expect(textOf(all(root, '.dv-gen-progress')[0])).toBe('Stopped after day 4 of 13');
    expect(all(root, '.ui-seg, .ui-segments, [role="img"]').length).toBeGreaterThan(0);
    for (const generation of [{}, { daysDone: 0, daysTotal: 13 }, { daysDone: 14, daysTotal: 13 }, { daysDone: 4 }, null]) {
      expect(failedCardHtml({ ...FAILED, generation }, { progress: true })).not.toContain('Stopped after');
    }
  });

  it('takes other words for the delete button and keeps its hook; a shared plan still has none', () => {
    const [remove] = all(tree(failedCardHtml(FAILED, { deleteLabel: 'Delete this trip' })), 'button[data-delete-trip]');
    expect(textOf(remove)).toBe('Delete this trip');
    expect(attr(remove, 'data-delete-trip')).toBe('t-failed');
    expect(all(tree(failedCardHtml({ ...FAILED, shared: true }, { deleteLabel: 'Delete this trip' })), '[data-delete-trip]')).toHaveLength(0);
  });
});
