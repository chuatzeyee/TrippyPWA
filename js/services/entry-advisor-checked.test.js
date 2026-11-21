import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// entryPlan().checked says whether the check completed. Today a failed fetch
// looks the same as "nothing to file"; the readiness rule needs to tell them
// apart (blueprint 7.3). fetch is stubbed with a small invented data set.
const STEPS = {
  countries: {
    MY: { items: [{ id: 'my-mdac', kind: 'arrival-card', name: 'Arrival card', required: true, exemptNationalities: ['SG'], onlyNationalities: [], modes: ['air', 'land', 'sea'], windowDays: 3, leadDays: 1 }] },
    TW: { items: [], transit: 'Airside transit needs nothing.' },
  },
};
const PASSPORTS = {
  SG: { MY: { c: 'vf', d: 30 }, JP: { c: 'vf', d: 90 } },
  IN: { MY: { c: 'vf', d: 30 }, JP: { c: 'vr' }, SG: { c: 'ev' } },
};

function stubFetch({ steps = true, auths = true, failPassport = '', offline = false } = {}) {
  const fetchMock = vi.fn(async (url) => {
    if (offline) throw new TypeError('Failed to fetch');
    const name = String(url).split('/data/visa/')[1];
    const body = name === 'entry-steps.json' ? (steps ? STEPS : null)
      : name === 'authorisations.json' ? (auths ? {} : null)
      : name === `${failPassport}.json` ? null
      : PASSPORTS[name.replace('.json', '')] || null;
    return { ok: !!body, status: body ? 200 : 503, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const MALAYSIA = { wizardState: { destination: { name: 'Kuala Lumpur', flag: 'my', country: 'Malaysia' } }, extras: {}, homeFlag: 'sg', tripStart: '2027-01-13', tripEnd: '2027-01-16' };
const JAPAN_VIA_TAIPEI = {
  wizardState: { destination: { name: 'Sapporo', flag: 'jp', country: 'Japan' } },
  extras: { flights: { outbound: { route: 'SIN > TPE > CTS' }, inbound: { route: 'CTS > TPE > SIN' } } },
  homeFlag: 'sg', tripStart: '2027-01-13', tripEnd: '2027-01-20',
};

const plan = async (args) => (await import('./entry-advisor.js')).entryPlan(args);

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('entryPlan().checked', () => {
  it('is true when the steps table and every passport file loaded', async () => {
    stubFetch();
    const result = await plan({ ...MALAYSIA, passports: ['sg', 'in'] });
    expect(result.checked).toBe(true);
    expect(result.passports).toEqual(['SG', 'IN']);
    expect(result.countries.map(c => [c.iso2, c.role])).toEqual([['MY', 'visit'], ['SG', 'home']]);
    expect(result.countries[0].rows.map(r => [r.passport, r.visa?.code, r.items.map(i => i.id)])).toEqual([['SG', 'vf', []], ['IN', 'vf', ['my-mdac']]]);
  });

  it('is false when the steps table could not be fetched, and the visa rows are still there', async () => {
    stubFetch({ steps: false });
    const result = await plan({ ...MALAYSIA, passports: ['in'] });
    expect(result.checked).toBe(false);
    expect(result.countries[0].rows).toEqual([{ passport: 'IN', visa: expect.objectContaining({ code: 'vf' }), items: [] }]);
  });

  it('is false when one passport file could not be fetched, and the others are still answered', async () => {
    stubFetch({ failPassport: 'IN' });
    const result = await plan({ ...MALAYSIA, passports: ['sg', 'in'] });
    expect(result.checked).toBe(false);
    expect(result.countries[0].rows.map(r => [r.passport, r.visa?.code ?? null])).toEqual([['SG', 'vf'], ['IN', null]]);
  });

  it('is false when the authorisations table could not be fetched', async () => {
    stubFetch({ auths: false });
    expect((await plan({ ...MALAYSIA, passports: ['in'] })).checked).toBe(false);
  });

  it('is false offline', async () => {
    stubFetch({ offline: true });
    const result = await plan({ ...MALAYSIA, passports: ['sg'] });
    expect(result.checked).toBe(false);
    expect(result.countries[0].rows).toEqual([{ passport: 'SG', visa: null, items: [] }]);
  });

  it('is true when a country is simply not in the passport table', async () => {
    stubFetch();
    const result = await plan({ wizardState: { destination: { name: 'Nowhere', flag: 'zz' } }, extras: {}, homeFlag: 'sg', passports: ['sg'] });
    expect(result.checked).toBe(true);
    expect(result.countries).toEqual([{ iso2: 'ZZ', role: 'visit', transit: '', landSea: '', rows: [{ passport: 'SG', visa: null, items: [] }] }]);
  });

  it('is true when nothing had to be looked up', async () => {
    const fetchMock = stubFetch();
    expect(await plan({ ...MALAYSIA, passports: [] })).toEqual({ passports: [], countries: [], checked: true });
    expect(await plan({ ...MALAYSIA, passports: ['not a passport'] })).toEqual({ passports: [], countries: [], checked: true });
    expect(fetchMock).not.toHaveBeenCalled();
    // A citizen going home: every row is skipped, so no passport file is read.
    const home = await plan({ wizardState: { destination: { name: 'Singapore', flag: 'sg' } }, extras: {}, homeFlag: 'sg', passports: ['sg'] });
    expect(home).toEqual({ passports: ['SG'], countries: [], checked: true });
  });

  it('does not look anything up for a connection country', async () => {
    const fetchMock = stubFetch({ failPassport: 'SG' });
    const result = await plan({ ...JAPAN_VIA_TAIPEI, wizardState: { destination: { name: 'Taipei layover', flag: '' } }, passports: ['sg'] });
    expect(result.countries.map(c => [c.iso2, c.role])).toEqual([['TW', 'transit']]);
    expect(result.checked).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => String(url).split('/data/visa/')[1])).toEqual(['entry-steps.json']);
  });

  it('checks again on the next call after a failure', async () => {
    stubFetch({ offline: true });
    const { entryPlan } = await import('./entry-advisor.js');
    expect((await entryPlan({ ...MALAYSIA, passports: ['in'] })).checked).toBe(false);
    stubFetch();
    const again = await entryPlan({ ...MALAYSIA, passports: ['in'] });
    expect(again.checked).toBe(true);
    expect(again.countries[0].rows[0].items.map(i => i.id)).toEqual(['my-mdac']);
  });
});
