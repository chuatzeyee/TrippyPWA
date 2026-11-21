// The trip landing components together: a landing assembled from them keeps the view contract
// (blueprint 3.4, checked by js/views/fixtures/checks/trip-contract.js) for every model fixture, with
// each day index variant and several action splits. Owner: F6.
import { describe, it, expect } from 'vitest';
import { topbarHtml, actionButtonsHtml, moreTriggerHtml } from './trip-topbar.js';
import { tabsHtml } from './tabs.js';
import { glanceHtml } from './glance.js';
import { dayIndexHtml } from './day-index.js';
import { dayCardExtrasHtml } from './day-extras.js';
import { readinessListHtml } from './readiness-list.js';
import { coverFrameHtml } from './photo-frame.js';
import { esc } from './html.js';
import { TRIP_FIXTURES, CTX_FIXTURE } from '../fixtures/models.js';
import { checkTripLanding } from '../fixtures/checks/trip-contract.js';
import { parseHtml } from '../fixtures/checks/html-tree.js';
import { markupRules } from '../fixtures/checks/markup-rules.js';

const SPLITS = [{}, { barKeys: [], tabsSlotFrom: 1024 }, { barKeys: ['share', 'pdf', 'edit'], menuKeys: ['read-view', 'regenerate', 'delete'], tabsSlotFrom: 1024 }];

function landing(model, ctx, { variant, split, heroRow }) {
  const mapDays = model.map.points.length > 0;
  const caption = mapDays ? `<p data-region="map-caption">${esc(model.map.points.length)} stops on the map.</p>` : '';
  const row = heroRow ? `<div>${actionButtonsHtml(model.actions, { keys: ['share', 'pdf', 'edit'], where: 'hero' })}${moreTriggerHtml()}</div>` : '';
  return {
    bar: topbarHtml(model, split),
    hero: `<div id="td-hero">${coverFrameHtml(model.cover, { carry: 'cover' })}<h1>${esc(model.title)}</h1><p data-region="hero-status">${esc(model.statusText)}</p></div>
      ${row}${glanceHtml(model.glance, { jumps: ['readiness', 'spending'] })}${ctx.slots.notes}`,
    tabs: tabsHtml('plan', { withBack: heroRow }),
    planIntro: `${readinessListHtml(model.readiness, { region: true })}${dayIndexHtml(model.days, { variant, mapDays })}`,
    between: `<div data-map-slot></div>${caption}`,
    planOutro: '',
    openSections: [],
    openSectionsMinWidth: 0,
  };
}

describe.each(Object.keys(TRIP_FIXTURES))('a landing built from the shared trip components, fixture %s', (name) => {
  const model = TRIP_FIXTURES[name];
  it.each(['list', 'strip', 'chips'])('keeps the view contract with the %s day index', (variant) => {
    for (const [i, split] of SPLITS.entries()) {
      expect(checkTripLanding(landing(model, CTX_FIXTURE, { variant, split, heroRow: i === 2 }), model, CTX_FIXTURE)).toEqual([]);
    }
  });
  it('the day card block of every day is clean markup beside it', () => {
    for (const row of model.days) {
      const { root, errors } = parseHtml(dayCardExtrasHtml(row));
      expect(errors).toEqual([]);
      expect(markupRules(root)).toEqual([]);
    }
  });
});
