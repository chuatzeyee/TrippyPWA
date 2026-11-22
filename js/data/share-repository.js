import { supabase, getUser } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { sortDayActivities } from './trip-repository.js';
import { getLocale } from '../lib/locale.js';

/** What the shared-trip page says for a link that has expired and for a token that does not exist: the server answers both the same way. */
export const SHARE_GONE_TEXT = 'This link has expired. Ask the person who shared it for a new one.';
/** A share link works for this many days after it is made (the server sets the date: migration 023). */
export const SHARE_LINK_DAYS = 7;
const NOT_FOUND = SHARE_GONE_TEXT;
const SHARE_COLUMNS_BEFORE_023 = 'id, trip_id, share_token, created_by, visibility, created_at';
const SHARE_COLUMNS = `${SHARE_COLUMNS_BEFORE_023}, expires_at`;
// Postgres undefined_column: migration 023 (expires_at) is not applied yet.
const COLUMN_MISSING = '42703';
const LOAD_FAILED = 'We could not load this shared trip. Please try again.';
// Share tokens are 32 hex chars today; accept a slightly wider safe alphabet.
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
// PostgREST "function not in schema cache" / Postgres undefined_function:
// migration 020 (get_shared_trip) is not applied yet, so use the table reads.
const RPC_MISSING = new Set(['PGRST202', '42883']);

/** The time a link stops working, in ms; null when the row carries no usable date (before migration 023). */
function expiryTime(share) {
  const time = typeof share?.expires_at === 'string' ? Date.parse(share.expires_at) : NaN;
  return Number.isFinite(time) ? time : null;
}

/** True when the link's date has passed. A link without a date (before migration 023) is not expired. */
export function isShareExpired(share, now = Date.now()) {
  const time = expiryTime(share);
  return time !== null && time <= now;
}

/**
 * What the share dialog says about a link: "This link works until 29 Nov 2026", or
 * "This link expired on 29 Nov 2026." with `expired` set, so the dialog offers a new one. The date is
 * the device's. '' when the row carries no date.
 * @returns {{ expired: boolean, text: string }}
 */
export function shareLinkStatus(share, now = Date.now()) {
  const time = expiryTime(share);
  if (time === null) return { expired: false, text: '' };
  const date = new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(time));
  return time <= now
    ? { expired: true, text: `This link expired on ${date}.` }
    : { expired: false, text: `This link works until ${date}` };
}

/**
 * The trip's working share link, or a new one. A link that has expired is deleted first, so the
 * new link has a new address and the old address never works again.
 */
export async function createShareLink(tripId) {
  const user = getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const existing = await getShareForTrip(tripId);
  if (existing.data && !isShareExpired(existing.data)) return existing;
  if (existing.data) {
    const { error: staleError } = await supabase
      .from('trip_shares')
      .delete()
      .eq('trip_id', tripId)
      .eq('created_by', user.id)
      .lt('expires_at', new Date().toISOString());
    if (staleError) {
      logger.error('share', 'Expired share link could not be replaced', { tripId, error: staleError.message });
      return { data: null, error: staleError.message };
    }
  }

  let { data, error } = await supabase
    .from('trip_shares')
    .insert({ trip_id: tripId, created_by: user.id })
    .select(SHARE_COLUMNS)
    .single();
  if (error?.code === COLUMN_MISSING) {
    // The row was not written: the missing column fails the whole request.
    ({ data, error } = await supabase
      .from('trip_shares')
      .insert({ trip_id: tripId, created_by: user.id })
      .select(SHARE_COLUMNS_BEFORE_023)
      .single());
  }

  if (error) logger.error('share', 'Share link creation failed', { tripId, error: error.message });
  return { data, error: error?.message || null };
}

export async function getShareForTrip(tripId) {
  const user = getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  // Older trips can have more than one link: return the newest, so "Stop
  // sharing" can remove them one at a time.
  const newest = (columns) => supabase
    .from('trip_shares')
    .select(columns)
    .eq('trip_id', tripId)
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let { data, error } = await newest(SHARE_COLUMNS);
  if (error?.code === COLUMN_MISSING) ({ data, error } = await newest(SHARE_COLUMNS_BEFORE_023));

  return { data, error: error?.message || null };
}

export async function deleteShareLink(shareId) {
  const { error } = await supabase
    .from('trip_shares')
    .delete()
    .eq('id', shareId);

  if (error) logger.error('share', 'Share link deletion failed', { shareId, error: error.message });
  return { error: error?.message || null };
}

// Public read of a shared trip. Returns the allow-listed shape from
// toSharedView(): never flights, booking refs, manage links, booking URLs,
// the booking checklist or wizard_state. `reason` says why there is no trip:
// 'gone' (the link has expired, was withdrawn or never existed: the server does
// not say which) or 'failed' (the request itself did not work).
export async function fetchSharedTrip(shareToken) {
  if (typeof shareToken !== 'string' || !TOKEN_RE.test(shareToken)) {
    return { data: null, error: NOT_FOUND, reason: 'gone' };
  }

  const { data, error } = await supabase.rpc('get_shared_trip', { p_token: shareToken });
  if (!error) {
    if (!data) {
      logger.warn('share', 'Share link not found or expired');
      return { data: null, error: NOT_FOUND, reason: 'gone' };
    }
    return { data: toSharedView(data), error: null };
  }
  if (!RPC_MISSING.has(error.code)) {
    logger.error('share', 'Shared trip fetch failed', { error: error.message, code: error.code });
    return { data: null, error: LOAD_FAILED, reason: 'failed' };
  }
  return fetchSharedTripLegacy(shareToken);
}

// Pre-migration path: the old public table reads, narrowed to the columns the
// shared view needs. extras->accommodation still carries the stay's booking
// fields over the wire here; toSharedView() drops them before rendering, and
// the RPC above removes them from the response entirely once 020 is applied.
async function fetchSharedTripLegacy(shareToken) {
  const { data: share, error: shareError } = await supabase
    .from('trip_shares')
    .select('trip_id')
    .eq('share_token', shareToken)
    .maybeSingle();

  if (shareError || !share) {
    logger.warn('share', 'Share link not found');
    return { data: null, error: NOT_FOUND, reason: 'gone' };
  }

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select(`
      title, emoji, start_date, end_date, travelers, user_id, budget_currency,
      dest_currency:wizard_state->destination->>currencyCode,
      accommodation:extras->accommodation,
      itinerary_days (
        day_number, date, title, theme, weather,
        activities (
          start_time, sort_order, title, venue_name, description, category,
          duration_minutes, cost_amount, cost_currency, tips, transport_options
        )
      )
    `)
    .eq('id', share.trip_id)
    .single();

  if (tripError || !trip) {
    logger.error('share', 'Shared trip fetch failed', { error: tripError?.message });
    return { data: null, error: LOAD_FAILED, reason: 'failed' };
  }

  const { data: owner } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', trip.user_id)
    .maybeSingle();

  return {
    data: toSharedView({
      ...trip,
      currency: trip.dest_currency || trip.budget_currency,
      extras: { accommodation: trip.accommodation },
      owner,
    }),
    error: null,
  };
}

const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
// Only real numbers and numeric strings count: Number(null), Number('') and
// Number(false) are all 0, which would turn a missing temperature into "0°C".
const num = (v) => {
  if (typeof v !== 'number' && (typeof v !== 'string' || !v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function pickWeather(w) {
  if (!w || typeof w !== 'object') return null;
  return { condition: text(w.condition), highC: num(w.highC), lowC: num(w.lowC) };
}

function pickStay(a) {
  const h = a.highlights;
  return {
    name: text(a.name),
    area: text(a.area),
    priceRange: text(a.priceRange),
    badge: text(a.badge),
    highlights: typeof h === 'string' ? h : Array.isArray(h) ? h.filter(x => typeof x === 'string').join(', ') : '',
  };
}

function pickActivity(a) {
  const first = Array.isArray(a.transport_options) ? a.transport_options[0] : null;
  return {
    start_time: text(a.start_time),
    sort_order: num(a.sort_order) ?? 0,
    title: text(a.title),
    venue_name: text(a.venue_name),
    description: text(a.description),
    category: text(a.category),
    duration_minutes: num(a.duration_minutes),
    cost_amount: num(a.cost_amount),
    cost_currency: text(a.cost_currency),
    tips: text(a.tips),
    transport_label: text(a.transport_label ?? (first?.label || first?.mode)),
  };
}

/**
 * Allow-listed, read-only view of a trip for the shared / reader layout. Works
 * on the get_shared_trip RPC result, the legacy table read and a full trip row
 * (owner reader view), so nothing outside this list can reach the renderer.
 */
export function toSharedView(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ws = raw.wizard_state && typeof raw.wizard_state === 'object' ? raw.wizard_state : {};
  const stays = Array.isArray(raw.extras?.accommodation) ? raw.extras.accommodation : [];
  const days = Array.isArray(raw.itinerary_days) ? raw.itinerary_days : [];
  return {
    title: text(raw.title),
    emoji: text(raw.emoji),
    start_date: raw.start_date || null,
    end_date: raw.end_date || null,
    travelers: num(raw.travelers) || 1,
    currency: text(raw.currency || ws.destination?.currencyCode || raw.budget_currency),
    owner: { display_name: text(raw.owner?.display_name) },
    extras: { accommodation: stays.filter(a => a && typeof a === 'object').map(pickStay) },
    itinerary_days: days
      .filter(d => d && typeof d === 'object')
      .map(d => ({
        day_number: num(d.day_number) ?? 0,
        date: d.date || null,
        title: text(d.title),
        theme: text(d.theme),
        weather: pickWeather(d.weather),
        // Same order as the owner's trip view.
        activities: sortDayActivities((Array.isArray(d.activities) ? d.activities : [])
          .filter(a => a && typeof a === 'object')
          .map(pickActivity)),
      }))
      .sort((a, b) => a.day_number - b.day_number),
  };
}
