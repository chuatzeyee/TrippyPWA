// Import a trip from a Word document or pasted plan text. The file is read on
// the device (docx-text.js); only its text goes to the import-document edge
// function, which answers with a trip in the import format that
// validateTripImport (trip-import.js) checks before anything is saved.

export const DOC_LIMITS = { maxFileBytes: 20_000_000, maxChars: 60_000 };

export const DOC_MESSAGES = {
  wrongType: 'Trippy reads Word files that end in .docx. Save your file as .docx, or copy its text and paste it below.',
  tooBig: 'This file is larger than 20 MB. Copy its text and paste it below.',
  unreadable: "We couldn't read this file. Open it, copy the text and paste it below.",
  empty: 'This document has no text. If the plan is a picture, type or paste it below.',
  cut: 'The plan was long, so we read the first 60,000 characters. Check that the last days are there.',
  offline: 'You are offline. Connect to the internet and try again.',
  too_long: 'This plan is too long to read in one go. Paste a shorter part of it and try again.',
  limit: "You have reached today's limit for importing documents. Try again tomorrow, or use the Trippy JSON import under Advanced.",
  not_a_plan: "We couldn't find a day by day plan in this text. Check that it lists what to do on each day, then try again.",
  failed: "We couldn't turn this into a trip just now. Wait a minute and try again.",
};

/**
 * The text of a chosen file, read on the device.
 * @param {{ name: string, size: number, arrayBuffer: () => Promise<ArrayBuffer> }} file
 * @returns {Promise<{ text: string } | { error: string }>}
 */
export async function readDocumentFile(file) {
  if (!/\.docx$/i.test(file.name || '')) return { error: DOC_MESSAGES.wrongType };
  if (file.size > DOC_LIMITS.maxFileBytes) return { error: DOC_MESSAGES.tooBig };
  try {
    const { docxToText } = await import('./docx-text.js');
    const text = await docxToText(new Uint8Array(await file.arrayBuffer()));
    return text.trim() ? { text } : { error: DOC_MESSAGES.empty };
  } catch {
    return { error: DOC_MESSAGES.unreadable };
  }
}

/**
 * Ask the server to turn plan text into a trip in the import format.
 * @param {string} text
 * @param {{ invoke?: Function, homeCity?: string, currency?: string }} [opts] invoke: supabase.functions.invoke (injectable for tests)
 * @returns {Promise<{ ok: true, trip: object, cut: boolean } | { ok: false, code: string, message: string }>}
 */
export async function importDocumentText(text, { invoke, homeCity, currency } = {}) {
  const fail = (code) => ({ ok: false, code, message: DOC_MESSAGES[code] || DOC_MESSAGES.failed });
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return fail('offline');
  const cut = text.length > DOC_LIMITS.maxChars;
  const call = invoke || (async (...args) => (await import('../lib/supabase.js')).supabase.functions.invoke(...args));
  try {
    const { data, error } = await call('import-document', {
      body: { text: text.slice(0, DOC_LIMITS.maxChars), homeCity, currency },
    });
    // On a non-2xx answer the envelope is in the Response the error carries.
    const reply = error ? await error.context?.json?.().catch(() => null) : data;
    if (reply?.ok && reply.data?.trip) return { ok: true, trip: reply.data.trip, cut };
    return fail(reply?.error || 'failed');
  } catch {
    return fail('failed');
  }
}

/**
 * The trip with a start date, an end date and a date on every day, counted
 * from `start` (or the start date the document gave). Null when there is no
 * usable start date yet, so the user has to pick one.
 * @param {{ trip: object, days: object[] }} doc
 * @param {string} [start] YYYY-MM-DD
 */
export function withDates(doc, start) {
  const iso = (v) => {
    const t = /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? Date.parse(`${v}T00:00:00Z`) : NaN;
    return Number.isNaN(t) ? null : t;
  };
  const t = iso(start || doc.trip?.startDate);
  if (t === null) return null;
  const at = (n) => new Date(t + (n - 1) * 86400000).toISOString().slice(0, 10);
  const days = doc.days.map((d, i) => ({ ...d, dayNumber: i + 1, date: at(i + 1) }));
  // A stated end date after the last planned day is kept (free days at the end).
  const stated = start ? null : iso(doc.trip.endDate);
  const end = Math.max(stated ?? 0, t + (days.length - 1) * 86400000);
  return { ...doc, trip: { ...doc.trip, startDate: at(1), endDate: new Date(end).toISOString().slice(0, 10) }, days };
}
