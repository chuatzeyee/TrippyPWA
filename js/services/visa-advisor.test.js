import { describe, it, expect, beforeAll, vi } from 'vitest';

// visa-advisor fetches static JSON; stub fetch with a minimal dataset that
// exercises every branch: matrix-vs-auth matching, arrival-card masking,
// lead-time date math.
const PASSPORT_SG = {
  US: { c: 'eta' },
  TH: { c: 'vf', d: 60 },
  JP: { c: 'vf', d: 90 },
  IN: { c: 'ev' },
};
const PASSPORT_IN = {
  US: { c: 'vr' },
  SG: { c: 'ev' },
};
const AUTHS = {
  US: { name: 'ESTA', kind: 'eta', fee: 'US$40.27', validity: '2 years', leadDays: 7, url: 'https://esta.cbp.dhs.gov' },
  TH: { name: 'TDAC', kind: 'arrival-card', fee: 'Free', validity: 'per trip', leadDays: 3, window: 3, url: 'https://tdac.immigration.go.th' },
  SG: { name: 'SG Arrival Card', kind: 'arrival-card', fee: 'Free', validity: 'per trip', leadDays: 3, window: 3, url: 'https://ica.gov.sg' },
  IN: { name: 'India e-Visa', kind: 'evisa', fee: 'from US$25', validity: '30 days', leadDays: 14, url: 'https://indianvisaonline.gov.in' },
};

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const body = url.endsWith('authorisations.json') ? AUTHS
      : url.endsWith('SG.json') ? PASSPORT_SG
      : url.endsWith('IN.json') ? PASSPORT_IN
      : null;
    return { ok: !!body, json: async () => body };
  }));
});

async function load() {
  return await import('./visa-advisor.js');
}

describe('checkRequirement', () => {
  it('returns the eTA when the matrix category matches (SG→US ESTA)', async () => {
    const { checkRequirement } = await load();
    const r = await checkRequirement('SG', 'US', '2026-11-10');
    expect(r.level).toBe('action');
    expect(r.auth?.name).toBe('ESTA');
    expect(r.applyBy).toBe('2026-11-03'); // leadDays 7
  });

  it('does NOT offer an eTA to a visa-required nationality (IN→US)', async () => {
    const { checkRequirement } = await load();
    const r = await checkRequirement('IN', 'US', '2026-11-10');
    expect(r.level).toBe('action');
    expect(r.auth).toBeNull();
    expect(r.label).toBe('Visa required');
  });

  it('arrival card shows as info for visa-free travellers (SG→TH)', async () => {
    const { checkRequirement } = await load();
    const r = await checkRequirement('SG', 'TH', '2026-11-10');
    expect(r.level).toBe('info');
    expect(r.auth?.name).toBe('TDAC');
    expect(r.applyFrom).toBe('2026-11-07'); // window 3 days
    expect(r.stayDays).toBe(60);
  });

  it('visa requirement leads, arrival card demoted to a note (IN→SG)', async () => {
    const { checkRequirement } = await load();
    const r = await checkRequirement('IN', 'SG', '2026-11-10');
    expect(r.level).toBe('action');
    expect(r.label).toBe('eVisa required');
    expect(r.auth).toBeNull();
    expect(r.extraNote).toContain('SG Arrival Card');
  });

  it('matching eVisa entry attaches (SG→IN)', async () => {
    const { checkRequirement } = await load();
    const r = await checkRequirement('SG', 'IN', '2026-11-10');
    expect(r.auth?.name).toBe('India e-Visa');
    expect(r.applyBy).toBe('2026-10-27'); // leadDays 14
  });

  it('visa-free with no authorisation returns ok (SG→JP)', async () => {
    const { checkRequirement } = await load();
    const r = await checkRequirement('SG', 'JP', '2026-11-10');
    expect(r.level).toBe('ok');
  });

  it('same country returns null', async () => {
    const { checkRequirement } = await load();
    expect(await checkRequirement('SG', 'SG', '2026-11-10')).toBeNull();
  });
});

describe('checkTrip', () => {
  it('checks distinct destination countries and drops ok results', async () => {
    const { checkTrip } = await load();
    const ws = {
      multiCity: true,
      destinations: [
        { name: 'Bangkok', flag: 'th' },
        { name: 'Phuket', flag: 'th' },
        { name: 'Tokyo', flag: 'jp' },
      ],
      dates: { start: '2026-11-10' },
    };
    const out = await checkTrip(ws, 'sg');
    expect(out).toHaveLength(1); // TH once (deduped), JP ok-filtered
    expect(out[0].country).toBe('TH');
  });

  it('returns empty without a nationality', async () => {
    const { checkTrip } = await load();
    expect(await checkTrip({ destination: { flag: 'us' } }, '')).toEqual([]);
  });
});
