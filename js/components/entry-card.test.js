import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The card reads static JSON through fetch and ticks through localStorage. Both
// are stubbed with a small invented data set (no DOM in this test run: the slot
// is a stand-in that records innerHTML, listeners and dispatched events).
const STEPS = {
  countries: {
    MY: {
      items: [{
        id: 'my-mdac', kind: 'arrival-card', name: 'Malaysia Digital Arrival Card', required: true, fee: 'Free',
        exemptNationalities: ['SG'], onlyNationalities: [], modes: ['air', 'land', 'sea'], windowDays: 3, leadDays: 1,
        url: 'https://example.com/mdac', steps: ['Fill in the form', 'Keep the email'], note: 'Show it at the counter.',
      }],
      landSea: 'Both checkpoints are open all day. Allow an hour at weekends.',
    },
    AU: { items: [{ id: 'au-eta', kind: 'eta', name: 'Australia ETA', required: true, exemptNationalities: [], onlyNationalities: [], modes: ['air', 'sea'], windowDays: null, leadDays: 7 }] },
    JP: { items: [{ id: 'jp-vjw', kind: 'registration', name: 'Visit Japan Web', required: false, exemptNationalities: [], onlyNationalities: [], modes: ['air', 'sea'], windowDays: null, leadDays: 2 }] },
    TW: { items: [], transit: 'Airside transit needs nothing. Stay in the transfer area.' },
    US: { items: [] },
  },
};
const PASSPORTS = {
  SG: { MY: { c: 'vf', d: 30 }, AU: { c: 'eta' }, US: { c: 'eta' }, JP: { c: 'vf', d: 90 }, KP: { c: 'na' } },
  IN: { MY: { c: 'vf', d: 30 }, AU: { c: 'vr' }, US: { c: 'vr' }, JP: { c: 'vr' }, SG: { c: 'ev' } },
  US: { MY: { c: 'vf', d: 30 }, AU: { c: 'eta' }, JP: { c: 'vf', d: 90 }, SG: { c: 'vf', d: 90 } },
};

function stubFetch({ failSteps = false, failPassport = '' } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const name = String(url).split('/data/visa/')[1];
    const body = name === 'entry-steps.json' ? (failSteps ? null : STEPS)
      : name === 'authorisations.json' ? {}
      : name === `${failPassport}.json` ? null
      : PASSPORTS[name.replace('.json', '')] || null;
    return { ok: !!body, status: body ? 200 : 503, json: async () => body };
  }));
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function fakeSlot() {
  const listeners = {};
  return {
    innerHTML: '',
    events: [],
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(event) { this.events.push(event); return true; },
    async fire(type, target) { for (const fn of listeners[type] || []) await fn({ target }); },
  };
}

function tickBox(key, checked) {
  const item = { classes: {}, classList: { toggle(name, on) { item.classes[name] = on; } } };
  const box = { dataset: { entryDone: key }, checked, item, closest: (sel) => (sel === '[data-entry-done]' ? box : sel === '.ec-item' ? item : null) };
  return box;
}

const tickKeys = (html) => [...html.matchAll(/data-entry-done="([^"]*)"/g)].map(m => m[1]);
const countrySections = (html) => html.slice(html.indexOf('<section class="ec-country">'), html.indexOf('<p class="ec-disclaimer">')).replace(/\n\s*\n/g, '\n').trim();

const dest = (name, flag) => ({ name, flag, country: name });
const TRIPS = {
  malaysia: { id: 'trip-1', wizard_state: { destination: dest('Kuala Lumpur', 'my') }, extras: {}, start_date: '2027-01-13', end_date: '2027-01-16' },
  australia: { id: 'trip-2', wizard_state: { destination: dest('Melbourne', 'au') }, extras: {}, start_date: '2027-02-27', end_date: '2027-03-08' },
  home: { id: 'trip-3', wizard_state: { destination: dest('Singapore', 'sg') }, extras: {} },
  broken: { id: 'trip-4', wizard_state: { multiCity: true }, extras: {} },
};

async function mount(trip, passports, options = {}) {
  const { mountEntryCard } = await import('./entry-card.js');
  const slot = fakeSlot();
  const card = await mountEntryCard(slot, { trip, homeFlag: 'sg', getPassports: () => passports, savePassports: async () => {}, ...options });
  return { slot, card };
}

let storage;
beforeEach(() => {
  vi.resetModules();
  stubFetch();
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('entry card, as it is today', () => {
  it('writes the stored tick keys into the checkboxes, one per passport group', async () => {
    const one = await mount(TRIPS.malaysia, ['in']);
    expect(tickKeys(one.slot.innerHTML)).toEqual(['trip-1:MY:IN:my-mdac']);
    const group = await mount(TRIPS.malaysia, ['sg', 'in', 'us']);
    expect(tickKeys(group.slot.innerHTML)).toEqual(['trip-1:MY:IN+US:my-mdac']);
  });

  it('draws the countries, rows and items exactly as before', async () => {
    storage.setItem('entry-done-trip-1', JSON.stringify({ 'trip-1:MY:IN+US:my-mdac': true }));
    const { slot } = await mount(TRIPS.malaysia, ['sg', 'in', 'us']);
    expect(countrySections(slot.innerHTML)).toMatchInlineSnapshot(`
      "<section class="ec-country">
            <h4 class="ec-country-name"><img class="ec-flag" src="https://flagcdn.com/w40/my.png" alt="" width="20" height="15" loading="lazy"><span>Malaysia</span></h4>
            <div class="ec-row">
              <p class="ec-passport"><img class="ec-flag" src="https://flagcdn.com/w40/sg.png" alt="" width="20" height="15" loading="lazy">Singapore passport</p>
              <p class="ec-visa ec-visa--ok"><span class="ec-dot" aria-hidden="true"></span>Visa-free, up to 30 days</p>
            </div>
            <div class="ec-row">
              <p class="ec-passport"><img class="ec-flag" src="https://flagcdn.com/w40/in.png" alt="" width="20" height="15" loading="lazy"><img class="ec-flag" src="https://flagcdn.com/w40/us.png" alt="" width="20" height="15" loading="lazy">India and United States passports</p>
              <p class="ec-visa ec-visa--ok"><span class="ec-dot" aria-hidden="true"></span>Visa-free, up to 30 days</p>
              <ul class="ec-items">
          <li class="ec-item is-done">
            <label class="ec-check">
              <input type="checkbox" data-entry-done="trip-1:MY:IN+US:my-mdac" checked>
              <span class="ec-item-name">Malaysia Digital Arrival Card</span>
            </label>
            <p class="ec-item-meta">
              <span class="ec-tag ec-tag--required">Required</span>
              <span>Arrival card</span>
              <span>Free</span>
            </p>
            <p class="ec-item-when">Do it between 10 Jan and 12 Jan</p>
              <details class="ec-more">
                <summary>How to do it</summary>
                <ol class="ec-steps"><li>Fill in the form</li><li>Keep the email</li></ol>
                <p class="ec-note">Show it at the counter.</p>
              </details>
            <a class="ec-link" href="https://example.com/mdac" target="_blank" rel="noopener noreferrer">Official site <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg></a>
          </li></ul>
            </div>
          </section>
          <section class="ec-country">
            <h4 class="ec-country-name"><img class="ec-flag" src="https://flagcdn.com/w40/sg.png" alt="" width="20" height="15" loading="lazy"><span>Singapore</span><span class="ec-role">Coming home</span></h4>
            <div class="ec-row">
              <p class="ec-passport"><img class="ec-flag" src="https://flagcdn.com/w40/in.png" alt="" width="20" height="15" loading="lazy">India passport</p>
              <p class="ec-visa ec-visa--action"><span class="ec-dot" aria-hidden="true"></span>eVisa needed before you travel</p>
            </div>
            <div class="ec-row">
              <p class="ec-passport"><img class="ec-flag" src="https://flagcdn.com/w40/us.png" alt="" width="20" height="15" loading="lazy">United States passport</p>
              <p class="ec-visa ec-visa--ok"><span class="ec-dot" aria-hidden="true"></span>Visa-free, up to 90 days</p>
            </div>
          </section>"
    `);
  });

  it('saves a tick on this device and marks the item', async () => {
    const { slot } = await mount(TRIPS.malaysia, ['in']);
    const box = tickBox('trip-1:MY:IN:my-mdac', true);
    await slot.fire('change', box);
    expect(JSON.parse(storage.getItem('entry-done-trip-1'))).toEqual({ 'trip-1:MY:IN:my-mdac': true });
    expect(box.item.classes).toEqual({ 'is-done': true });
    await slot.fire('change', tickBox('trip-1:MY:IN:my-mdac', false));
    expect(JSON.parse(storage.getItem('entry-done-trip-1'))).toEqual({ 'trip-1:MY:IN:my-mdac': false });
  });

  it('asks for a passport when the group has none', async () => {
    const { slot } = await mount(TRIPS.malaysia, []);
    expect(slot.innerHTML).toContain('Which passport are you travelling on?');
    expect(tickKeys(slot.innerHTML)).toEqual([]);
  });

  it('says so when the plan cannot be worked out', async () => {
    const { slot } = await mount(TRIPS.broken, ['sg']);
    expect(slot.innerHTML).toBe('<p class="ec-loading">Entry requirements could not be loaded. Check the official immigration sites for each country.</p>');
  });

  it('adds and removes passports through savePassports', async () => {
    const savePassports = vi.fn(async () => {});
    const { slot } = await mount(TRIPS.malaysia, ['in', 'us'], { savePassports });
    expect(slot.innerHTML).toContain('data-remove-passport="in"');
    expect(slot.innerHTML).toContain('aria-label="Remove India passport"');
    const remove = { dataset: { removePassport: 'in' } };
    await slot.fire('click', { closest: (sel) => (sel === '[data-remove-passport]' ? remove : null) });
    expect(savePassports).toHaveBeenLastCalledWith(['us']);
    await slot.fire('click', { closest: () => null });
    const select = { value: 'sg', closest: (sel) => (sel === '[data-add-passport]' ? select : null) };
    await slot.fire('change', select);
    expect(savePassports).toHaveBeenLastCalledWith(['in', 'us', 'sg']);
    const unchosen = { value: '', closest: (sel) => (sel === '[data-add-passport]' ? unchosen : null) };
    await slot.fire('change', unchosen);
    expect(savePassports).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a slot', async () => {
    const { mountEntryCard } = await import('./entry-card.js');
    const onPlan = vi.fn();
    expect(await mountEntryCard(null, { trip: TRIPS.malaysia, homeFlag: 'sg', getPassports: () => ['in'], savePassports: async () => {}, onPlan })).toBeUndefined();
    expect(onPlan).not.toHaveBeenCalled();
  });

  it('hides itself through onEmpty when only home passports travel at home', async () => {
    const onEmpty = vi.fn();
    const { slot } = await mount(TRIPS.home, ['sg'], { onEmpty });
    expect(onEmpty).toHaveBeenCalledTimes(1);
    expect(slot.innerHTML).toBe('<p class="ec-loading">Checking entry requirements</p>');
    const shown = await mount(TRIPS.home, ['sg']);
    expect(shown.slot.innerHTML).toContain('Nothing to prepare for entry with these passports.');
  });
});

describe('entry card: onPlan reports from every exit of a render', () => {
  it('reports that a passport is missing', async () => {
    const onPlan = vi.fn();
    const { card } = await mount(TRIPS.malaysia, [], { onPlan });
    expect(onPlan.mock.calls).toEqual([[null, 'no-passport']]);
    await card.refresh();
    expect(onPlan.mock.calls).toEqual([[null, 'no-passport'], [null, 'no-passport']]);
  });

  it('reports that the plan could not be worked out', async () => {
    const onPlan = vi.fn();
    const { slot } = await mount(TRIPS.broken, ['sg'], { onPlan });
    expect(onPlan.mock.calls).toEqual([[null, 'failed']]);
    expect(slot.innerHTML).toContain('could not be loaded');
  });

  it('reports the plan before the card hides itself', async () => {
    const order = [];
    const onPlan = vi.fn(() => order.push('onPlan'));
    const onEmpty = vi.fn(() => order.push('onEmpty'));
    await mount(TRIPS.home, ['sg'], { onPlan, onEmpty });
    expect(order).toEqual(['onPlan', 'onEmpty']);
    // A plan comes with no reason: a reason is only given when there is no plan.
    expect(onPlan.mock.calls).toEqual([[{ passports: ['SG'], countries: [], checked: true }, null]]);
  });

  it('reports the plan it drew, once the card is drawn', async () => {
    let drawnWhenCalled = '';
    let slotRef = null;
    const onPlan = vi.fn(() => { drawnWhenCalled = slotRef.innerHTML; });
    const { mountEntryCard } = await import('./entry-card.js');
    slotRef = fakeSlot();
    await mountEntryCard(slotRef, { trip: TRIPS.malaysia, homeFlag: 'sg', getPassports: () => ['in'], savePassports: async () => {}, onPlan });
    expect(onPlan).toHaveBeenCalledTimes(1);
    const [plan, reason] = onPlan.mock.calls[0];
    expect(reason).toBeNull();
    expect(plan.checked).toBe(true);
    expect(plan.passports).toEqual(['IN']);
    expect(plan.countries.map(c => c.iso2)).toEqual(['MY', 'SG']);
    expect(drawnWhenCalled).toBe(slotRef.innerHTML);
    expect(tickKeys(drawnWhenCalled)).toEqual(['trip-1:MY:IN:my-mdac']);
  });

  it('reports a drawn plan with nothing in it the same way', async () => {
    const onPlan = vi.fn();
    const { slot } = await mount(TRIPS.home, ['sg'], { onPlan });
    expect(slot.innerHTML).toContain('Nothing to prepare for entry with these passports.');
    expect(onPlan.mock.calls).toEqual([[{ passports: ['SG'], countries: [], checked: true }, null]]);
  });

  it('passes on that the check did not complete', async () => {
    stubFetch({ failSteps: true });
    const steps = vi.fn();
    await mount(TRIPS.malaysia, ['in'], { onPlan: steps });
    expect(steps.mock.calls[0][0].checked).toBe(false);
    expect(steps.mock.calls[0][1]).toBeNull();

    vi.resetModules();
    stubFetch({ failPassport: 'IN' });
    const passport = vi.fn();
    await mount(TRIPS.malaysia, ['sg', 'in'], { onPlan: passport });
    expect(passport.mock.calls[0][0].checked).toBe(false);
  });

  it('reports once for each render, also after a refresh', async () => {
    const onPlan = vi.fn();
    let passports = ['in'];
    const { mountEntryCard } = await import('./entry-card.js');
    const card = await mountEntryCard(fakeSlot(), { trip: TRIPS.malaysia, homeFlag: 'sg', getPassports: () => passports, savePassports: async () => {}, onPlan });
    expect(onPlan).toHaveBeenCalledTimes(1);
    passports = [];
    await card.refresh();
    passports = ['sg', 'in'];
    await card.refresh();
    expect(onPlan.mock.calls.map(([plan, reason]) => (plan ? 'plan' : reason))).toEqual(['plan', 'no-passport', 'plan']);
    expect(onPlan.mock.calls.map(([, reason]) => reason)).toEqual([null, 'no-passport', null]);
    expect(onPlan.mock.calls[2][0].passports).toEqual(['SG', 'IN']);
  });

  it('keeps drawing when the listener throws', async () => {
    const onPlan = vi.fn(() => { throw new Error('listener broke'); });
    const { slot } = await mount(TRIPS.malaysia, ['in'], { onPlan });
    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(tickKeys(slot.innerHTML)).toEqual(['trip-1:MY:IN:my-mdac']);
  });
});

describe('entry card: every tick is announced', () => {
  it('dispatches a bubbling trippy:ticks event after the tick is stored', async () => {
    const { slot } = await mount(TRIPS.malaysia, ['in']);
    let storedWhenDispatched = null;
    slot.dispatchEvent = (event) => { slot.events.push(event); storedWhenDispatched = storage.getItem('entry-done-trip-1'); return true; };
    await slot.fire('change', tickBox('trip-1:MY:IN:my-mdac', true));
    expect(slot.events).toHaveLength(1);
    const [event] = slot.events;
    expect(event.type).toBe('trippy:ticks');
    expect(event.bubbles).toBe(true);
    expect(event.detail).toEqual({ tripId: 'trip-1', store: 'entry-done', key: 'trip-1:MY:IN:my-mdac', checked: true });
    expect(JSON.parse(storedWhenDispatched)).toEqual({ 'trip-1:MY:IN:my-mdac': true });
    await slot.fire('change', tickBox('trip-1:MY:IN:my-mdac', false));
    expect(slot.events.map(e => e.detail.checked)).toEqual([true, false]);
  });

  it('does not announce a change that is not a tick', async () => {
    const savePassports = vi.fn(async () => {});
    const { slot } = await mount(TRIPS.malaysia, ['in'], { savePassports });
    const select = { value: 'us', closest: (sel) => (sel === '[data-add-passport]' ? select : null) };
    await slot.fire('change', select);
    expect(savePassports).toHaveBeenCalledWith(['in', 'us']);
    expect(slot.events).toEqual([]);
  });
});

describe('entry card: the "I have this" tick', () => {
  const haveBoxes = (html) => [...html.matchAll(/<label class="ec-check ec-have">[\s\S]*?<\/label>/g)].map(m => m[0]);
  const withoutHave = (html) => html.replace(/\n\s*<label class="ec-check ec-have">[\s\S]*?<\/label>/g, '');

  it('is not drawn unless the caller asks for it', async () => {
    const { slot } = await mount(TRIPS.australia, ['in', 'sg']);
    expect(slot.innerHTML).not.toContain('I have this');
    expect(slot.innerHTML).not.toContain('ec-have');
    expect(tickKeys(slot.innerHTML)).toEqual(['trip-2:AU:SG:au-eta']);
  });

  it('is drawn for a visa that has no required item to tick, and only there', async () => {
    const { slot } = await mount(TRIPS.australia, ['in', 'sg'], { haveTick: true });
    // India needs a visa from an embassy (no item); Singapore has the ETA item to tick.
    // On the way home India needs an eVisa for Singapore, again with no item.
    expect(tickKeys(slot.innerHTML)).toEqual(['trip-2:AU:IN:have', 'trip-2:AU:SG:au-eta', 'trip-2:SG:IN:have']);
    const boxes = haveBoxes(slot.innerHTML);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toContain('<input type="checkbox" data-entry-done="trip-2:AU:IN:have" >');
    expect(boxes[0]).toContain('I have this');
    expect(boxes[0].replace(/<[^>]+>/g, '').trim()).toBe('I have this for Australia, India passport');
  });

  it('names only the country when one row covers the whole group', async () => {
    const { slot } = await mount(TRIPS.australia, ['in'], { haveTick: true });
    expect(haveBoxes(slot.innerHTML)[0].replace(/<[^>]+>/g, '').trim()).toBe('I have this for Australia');
  });

  it('shows a stored tick as checked', async () => {
    storage.setItem('entry-done-trip-2', JSON.stringify({ 'trip-2:AU:IN:have': true }));
    const { slot } = await mount(TRIPS.australia, ['in', 'sg'], { haveTick: true });
    const boxes = haveBoxes(slot.innerHTML);
    expect(boxes[0]).toContain('data-entry-done="trip-2:AU:IN:have" checked>');
    expect(boxes[1]).toContain('data-entry-done="trip-2:SG:IN:have" >');
  });

  it('stores the tick with the item ticks and announces it', async () => {
    const { slot } = await mount(TRIPS.australia, ['in', 'sg'], { haveTick: true });
    await slot.fire('change', tickBox('trip-2:AU:SG:au-eta', true));
    const have = tickBox('trip-2:AU:IN:have', true);
    have.closest = (sel) => (sel === '[data-entry-done]' ? have : null); // not inside an .ec-item
    await slot.fire('change', have);
    expect(JSON.parse(storage.getItem('entry-done-trip-2'))).toEqual({ 'trip-2:AU:SG:au-eta': true, 'trip-2:AU:IN:have': true });
    expect(slot.events.map(e => [e.type, e.detail.key])).toEqual([['trippy:ticks', 'trip-2:AU:SG:au-eta'], ['trippy:ticks', 'trip-2:AU:IN:have']]);
  });

  it('changes nothing else on the card', async () => {
    const plain = await mount(TRIPS.australia, ['in', 'sg', 'us']);
    const asked = await mount(TRIPS.australia, ['in', 'sg', 'us'], { haveTick: true });
    expect(haveBoxes(asked.slot.innerHTML).length).toBeGreaterThan(0);
    expect(withoutHave(asked.slot.innerHTML)).toBe(plain.slot.innerHTML);
    // A card with no row that needs it is the same with and without the option.
    const a = await mount(TRIPS.malaysia, ['sg', 'us']);
    const b = await mount(TRIPS.malaysia, ['sg', 'us'], { haveTick: true });
    expect(b.slot.innerHTML).toBe(a.slot.innerHTML);
  });

  it('is not offered for a connection country', async () => {
    const trip = { id: 'trip-5', wizard_state: { destination: dest('Sapporo', 'jp') }, extras: { flights: { outbound: { route: 'SIN > TPE > CTS' } } }, start_date: '2027-01-13', end_date: '2027-01-20' };
    const { slot } = await mount(trip, ['in'], { haveTick: true });
    expect(slot.innerHTML).toContain('Connection only');
    // Japan (visa needed, plus its optional registration item) and Singapore on
    // the way home get one; Taiwan, only passed through, does not.
    expect(tickKeys(slot.innerHTML)).toEqual(['trip-5:JP:IN:have', 'trip-5:JP:IN:jp-vjw', 'trip-5:SG:IN:have']);
    expect(tickKeys(slot.innerHTML).some(key => key.includes(':TW:'))).toBe(false);
  });

  it('escapes what it prints', async () => {
    const trip = { ...TRIPS.australia, id: 'trip"><b>' };
    const { slot } = await mount(trip, ['in'], { haveTick: true });
    expect(slot.innerHTML).toContain('data-entry-done="trip&quot;&gt;&lt;b&gt;:AU:IN:have"');
    expect(slot.innerHTML).not.toContain('trip"><b>');
  });
});
