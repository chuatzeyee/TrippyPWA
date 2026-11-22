import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { DOC_LIMITS, DOC_MESSAGES, readDocumentFile, importDocumentText, withDates } from './trip-import-doc.js';
import { validateTripImport } from './trip-import.js';

const BANNED = /[—–·•…]|\.\.\./;

const TRIP = {
  trippy: 1,
  trip: { title: 'Porto weekend', destination: { name: 'Porto', country: 'Portugal' }, startDate: '', endDate: '' },
  days: [
    { title: 'Ribeira', activities: [{ title: 'Walk the riverside', startTime: '09:30', venueName: 'Cais da Ribeira', category: 'sightseeing', description: 'Old town by the river.' }] },
    { title: 'Gaia', activities: [{ title: 'Port cellar tour', startTime: '15:00', venueName: '', category: 'food', description: '', costAmount: 20, costCurrency: 'EUR' }] },
  ],
};

const file = (name, bytes, size = bytes.length) => ({ name, size, arrayBuffer: async () => bytes.buffer });

describe('readDocumentFile', () => {
  it('returns the text of a .docx', async () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>Day 1 Porto</w:t></w:r></w:p></w:body></w:document>';
    const bytes = zipSync({ 'word/document.xml': strToU8(xml) });
    expect(await readDocumentFile(file('Plan.DOCX', bytes))).toEqual({ text: 'Day 1 Porto' });
  });

  it('explains what to do with other files', async () => {
    const bytes = strToU8('x');
    for (const name of ['plan.doc', 'plan.pdf', 'plan.txt']) {
      expect(await readDocumentFile(file(name, bytes))).toEqual({ error: DOC_MESSAGES.wrongType });
    }
    expect(await readDocumentFile(file('big.docx', bytes, DOC_LIMITS.maxFileBytes + 1))).toEqual({ error: DOC_MESSAGES.tooBig });
    expect(await readDocumentFile(file('broken.docx', bytes))).toEqual({ error: DOC_MESSAGES.unreadable });
    const empty = zipSync({ 'word/document.xml': strToU8('<w:document><w:body></w:body></w:document>') });
    expect(await readDocumentFile(file('empty.docx', empty))).toEqual({ error: DOC_MESSAGES.empty });
  });
});

describe('importDocumentText', () => {
  it('returns the trip the server found', async () => {
    const calls = [];
    const invoke = async (...args) => { calls.push(args); return { data: { ok: true, data: { trip: TRIP }, error: null }, error: null }; };
    expect(await importDocumentText('Day 1', { invoke, currency: 'SGD' })).toEqual({ ok: true, trip: TRIP, cut: false });
    expect(calls).toEqual([['import-document', { body: { text: 'Day 1', homeCity: undefined, currency: 'SGD' } }]]);
  });

  it('sends at most 60,000 characters and says when the text was cut', async () => {
    let sent = '';
    const invoke = async (_name, { body }) => { sent = body.text; return { data: { ok: true, data: { trip: TRIP } }, error: null }; };
    const reply = await importDocumentText('a'.repeat(DOC_LIMITS.maxChars + 5), { invoke });
    expect(sent).toHaveLength(60_000);
    expect(reply.cut).toBe(true);
  });

  it.each(['too_long', 'limit', 'not_a_plan', 'failed'])('reports the error code %s in plain words', async (code) => {
    const error = { context: { json: async () => ({ ok: false, data: null, error: code }) } };
    const reply = await importDocumentText('Day 1', { invoke: async () => ({ data: null, error }) });
    expect(reply).toEqual({ ok: false, code, message: DOC_MESSAGES[code] });
  });

  it('treats a network failure, an unreadable answer and an unknown code as failed', async () => {
    const failed = { ok: false, code: 'failed', message: DOC_MESSAGES.failed };
    expect(await importDocumentText('x', { invoke: async () => { throw new Error('fetch'); } })).toEqual(failed);
    expect(await importDocumentText('x', { invoke: async () => ({ data: null, error: new Error('no body') }) })).toEqual(failed);
    expect(await importDocumentText('x', { invoke: async () => ({ data: { ok: true, data: {} }, error: null }) })).toEqual(failed);
    const odd = { context: { json: async () => ({ ok: false, error: 'teapot' }) } };
    expect(await importDocumentText('x', { invoke: async () => ({ data: null, error: odd }) }))
      .toEqual({ ok: false, code: 'teapot', message: DOC_MESSAGES.failed });
  });

  it('keeps every message free of dashes, dots and bullets', () => {
    for (const message of Object.values(DOC_MESSAGES)) expect(message).not.toMatch(BANNED);
  });
});

describe('withDates', () => {
  it('returns null until there is a start date', () => {
    expect(withDates(TRIP)).toBeNull();
    expect(withDates({ ...TRIP, trip: { ...TRIP.trip, startDate: 'next May' } })).toBeNull();
  });

  it('dates every day from the chosen start, and the result validates', () => {
    const dated = withDates(TRIP, '2027-05-30');
    expect(dated.trip).toMatchObject({ startDate: '2027-05-30', endDate: '2027-05-31' });
    expect(dated.days.map(d => [d.dayNumber, d.date])).toEqual([[1, '2027-05-30'], [2, '2027-05-31']]);
    const r = validateTripImport(JSON.stringify(dated));
    expect(r.errors).toEqual([]);
    expect(r.summary).toMatchObject({ days: 2, activities: 2 });
    expect(TRIP.trip.startDate).toBe('');
  });

  it('keeps a stated end date that is after the last planned day', () => {
    const stated = { ...TRIP, trip: { ...TRIP.trip, startDate: '2027-05-30', endDate: '2027-06-02' } };
    expect(withDates(stated).trip.endDate).toBe('2027-06-02');
    expect(withDates({ ...stated, trip: { ...stated.trip, endDate: '2027-05-30' } }).trip.endDate).toBe('2027-05-31');
  });
});
