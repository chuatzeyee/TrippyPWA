import { describe, it, expect } from 'vitest';
import { tripCountries, applicableItems, itemDates } from './entry-advisor.js';
import { visaLine, timingLine } from '../components/entry-card.js';
import { isTripAbroad, groupPassports } from '../wizard/passport-picker.js';
import { isNearbyTrip } from './generation-manager.js';

const mdac = { id: 'my-mdac', kind: 'arrival-card', name: 'Malaysia Digital Arrival Card (MDAC)', required: true,
  exemptNationalities: ['SG'], onlyNationalities: [], modes: ['air', 'land', 'sea'], windowDays: 3, leadDays: 1, url: 'https://imigresen-online.imi.gov.my/mdac/main' };
const keta = { id: 'kr-k-eta', kind: 'eta', name: 'K-ETA', required: true, exemptNationalities: [], onlyNationalities: [], modes: ['air'], windowDays: null, leadDays: 7, effectiveFrom: null, effectiveUntil: null };
const vjw = { id: 'jp-vjw', kind: 'registration', name: 'Visit Japan Web', required: false, exemptNationalities: [], onlyNationalities: [], modes: ['air', 'sea'], windowDays: null, leadDays: 2 };

describe('tripCountries', () => {
  const ws = { destination: { name: 'Sapporo', flag: 'jp' } };
  it('finds connection countries from the flight route', () => {
    const extras = { flights: { outbound: { route: 'SIN > TPE > CTS' }, inbound: { route: 'CTS > TPE > SIN' } } };
    expect(tripCountries({ wizardState: ws, extras, homeFlag: 'sg' })).toEqual({ visit: ['JP'], transit: ['TW'], home: 'SG', arrival: 'air' });
  });
  it('arrives by land or sea on ground journeys, and leaves out home', () => {
    const multi = { multiCity: true, destinations: [{ flag: 'sg' }, { flag: 'my' }] };
    expect(tripCountries({ wizardState: multi, extras: {}, homeFlag: 'sg', groundMode: 'bus' })).toMatchObject({ visit: ['MY'], arrival: 'land' });
    expect(tripCountries({ wizardState: { destination: { flag: 'id' } }, extras: {}, homeFlag: 'sg', groundMode: 'ferry' }).arrival).toBe('sea');
  });
});

describe('applicableItems', () => {
  it('respects exemptions, entry modes and the visa category', () => {
    expect(applicableItems({ items: [mdac] }, { passport: 'SG', mode: 'land', matrixCode: 'vf' })).toEqual([]);
    expect(applicableItems({ items: [mdac] }, { passport: 'IN', mode: 'land', matrixCode: 'ev' })).toHaveLength(1);
    expect(applicableItems({ items: [keta] }, { passport: 'SG', mode: 'air', matrixCode: 'vf' })).toEqual([]);
    expect(applicableItems({ items: [keta] }, { passport: 'US', mode: 'air', matrixCode: 'eta' })).toHaveLength(1);
    expect(applicableItems({ items: [vjw] }, { passport: 'SG', mode: 'land', matrixCode: 'vf' })).toEqual([]);
  });
  it('honours effective dates against the trip date', () => {
    const until = { ...keta, onlyNationalities: ['SG'], effectiveFrom: '2027-01-01' };
    expect(applicableItems({ items: [until] }, { passport: 'SG', mode: 'air', tripStart: '2026-12-20', matrixCode: 'vf' })).toEqual([]);
    expect(applicableItems({ items: [until] }, { passport: 'SG', mode: 'air', tripStart: '2027-01-13', matrixCode: 'vf' })).toHaveLength(1);
  });
});

describe('dates and copy', () => {
  it('computes the filing window before arrival', () => {
    expect(itemDates(mdac, '2027-01-13')).toEqual({ from: '2027-01-10', by: '2027-01-12' });
    expect(itemDates(keta, '2027-01-13')).toEqual({ from: null, by: '2027-01-06' });
    expect(timingLine({ dates: { from: '2027-01-10', by: '2027-01-12' } })).toBe('Do it between 10 Jan and 12 Jan');
    expect(timingLine({ dates: { from: null, by: '2027-01-06' } })).toBe('Do it by 6 Jan');
  });
  it('says the visa status plainly', () => {
    expect(visaLine({ code: 'vf', stayDays: 90 })).toBe('Visa-free, up to 90 days');
    expect(visaLine({ code: 'ev' })).toBe('eVisa needed before you travel');
  });
});

describe('passports and nearby trips', () => {
  it('asks about passports only for trips abroad', () => {
    expect(isTripAbroad({ destination: { flag: 'sg' } }, 'sg')).toBe(false);
    expect(isTripAbroad({ multiCity: true, destinations: [{ flag: 'sg' }, { flag: 'my' }] }, 'sg')).toBe(true);
    expect(groupPassports(['my', 'SG', 'my'], 'sg')).toEqual(['sg', 'my']);
  });
  it('judges a route that starts at home by the other cities', () => {
    const cities = [{ name: 'Singapore', lat: 1.29, lng: 103.85 }, { name: 'Johor Bahru', lat: 1.46, lng: 103.76 }, { name: 'Kuala Lumpur', lat: 3.14, lng: 101.69 }, { name: 'Sapporo', lat: 43.06, lng: 141.35 }];
    expect(isNearbyTrip({ multiCity: true, destinations: cities.slice(0, 3) }, 'Singapore', cities)).toBe(true);
    expect(isNearbyTrip({ destination: cities[3] }, 'Singapore', cities)).toBe(false);
  });
});

import { mergeRows } from '../components/entry-card.js';
describe('mergeRows', () => {
  it('shows one row for passports with identical requirements', () => {
    const vf = { code: 'vf', stayDays: 30 };
    const rows = [{ passport: 'SG', visa: vf, items: [] }, { passport: 'MY', visa: vf, items: [] }, { passport: 'IN', visa: { code: 'voa' }, items: [{ id: 'id-evoa' }] }];
    expect(mergeRows(rows).map(r => r.passports)).toEqual([['SG', 'MY'], ['IN']]);
  });
});

import { splitLead } from '../components/entry-card.js';
describe('place and vehicle conditions', () => {
  const bali = { id: 'id-bali-levy', kind: 'levy', places: ['bali', 'ubud'], exemptNationalities: [], onlyNationalities: [], modes: [] };
  const vep = { id: 'my-vep', kind: 'registration', vehicles: ['car'], exemptNationalities: [], onlyNationalities: [], modes: ['land'] };
  it('skips the Bali levy on a Batam trip and the car permit on a bus trip', () => {
    expect(applicableItems({ items: [bali] }, { passport: 'SG', mode: 'sea', places: ['Batam'] })).toEqual([]);
    expect(applicableItems({ items: [bali] }, { passport: 'SG', mode: 'air', places: ['Ubud'] })).toHaveLength(1);
    expect(applicableItems({ items: [vep] }, { passport: 'SG', mode: 'land', vehicle: 'train' })).toEqual([]);
    expect(applicableItems({ items: [vep] }, { passport: 'SG', mode: 'land', vehicle: 'car' })).toHaveLength(1);
  });
  it('folds long notes after the first sentence', () => {
    expect(splitLead('Airside transit needs nothing. Liquids over 100 ml are taken.')).toEqual(['Airside transit needs nothing.', 'Liquids over 100 ml are taken.']);
  });
});
