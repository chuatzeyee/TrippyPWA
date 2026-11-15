import { logger } from '../lib/logger.js';
import { supabase, getUser } from '../lib/supabase.js';
// Static on purpose: both modules are already in the entry chunk, and the
// production build turned the old dynamic import of destinations.js into
// undefined ("n.find" error), so every flight trip lost the traveller's origin.
import { DESTINATIONS } from '../wizard/destinations.js';
import { fetchProfile } from '../data/profile-repository.js';

// Async generation: we enqueue a job, fire the worker once, then watch the trip
// row via Realtime. The edge worker runs each provider in its own invocation
// (its own wall-clock), so there is no client-side retry storm and no risk of a
// slow provider starving the fallback.
const activeGenerations = new Map();
const listeners = new Set();
const channels = new Map();

// Progress-aware watchdog. A 13-day packed trip normally takes about five
// minutes, and the server now resumes a stalled worker by itself, so the app
// judges by progress (the job row's updated_at), not by a fixed deadline. The
// old fixed 6-minute give-up showed slow but healthy jobs as failed, and its
// Retry started a second job on the same trip.
const POLL_MS = 60_000;          // check the job once a minute
const SLOW_MS = 8 * 60_000;      // no progress this long: "taking longer than usual"
const GIVE_UP_MS = 20 * 60_000;  // no progress this long: stop waiting, offer Retry

// Server errors are technical ("Gemini 503 ..."); only the date problems are
// meant for the traveller. Retry resumes from the last finished chunk.
const RETRY_MESSAGE = "The AI planner couldn't finish this trip right now. Try again and it picks up where it stopped.";
function friendlyError(serverError) {
  const text = String(serverError || '');
  return /up to \d+ days long|dates are not valid/i.test(text) ? text : RETRY_MESSAGE;
}

export async function startGeneration(tripId, wizardState) {
  // Guard against launching a second pipeline for a trip already in flight.
  if (activeGenerations.get(tripId)?.status === 'generating') {
    logger.warn('generation', 'Generation already in progress, ignoring duplicate start', { tripId });
    return;
  }
  activeGenerations.set(tripId, { status: 'generating', busy: false, attempt: 0, startedAt: Date.now() });
  logger.info('generation', 'Trip generation started', { tripId });
  notifyListeners(tripId);

  try {
    await enqueueAndWatch(tripId, wizardState);
  } catch (err) {
    const msg = err?.message || 'Unexpected error';
    logger.error('generation', 'Failed to enqueue generation', { tripId, error: msg });
    activeGenerations.set(tripId, { status: 'failed', error: msg });
    await safeUpdateStatus(tripId, 'failed');
    notifyListeners(tripId);
  }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Nearby = every destination other than home is a short hop from home (ground
// or sea transport, no flights). A multi-city route that starts at home (e.g.
// Singapore, Johor Bahru & Kuala Lumpur from Singapore) is judged by the other
// cities; the old first-destination check saw 0 km and asked for flights.
export function isNearbyTrip(wizardState, homeCity, destinations = DESTINATIONS) {
  const home = destinations.find(d => d.name.toLowerCase() === String(homeCity || '').toLowerCase());
  if (!home) return false;
  const stops = (wizardState?.multiCity ? wizardState.destinations : [wizardState?.destination]) || [];
  const away = stops.filter(d => d && d.lat && d.lng && d.name?.toLowerCase() !== home.name.toLowerCase());
  return away.length > 0 && away.every(d => {
    const km = haversineKm(home.lat, home.lng, d.lat, d.lng);
    return km > 10 && km < 500;
  });
}

// Inject the traveler's origin + a nearby-trip flag into the wizard state before
// queuing. Without this the AI has no idea where the user departs from and will
// invent an origin (e.g. JFK for a Singapore-based user).
async function enrichWizardState(wizardState) {
  try {
    const { data: profile } = await fetchProfile();
    if (!profile?.home_city) return wizardState;

    const enriched = {
      ...wizardState,
      departureCity: wizardState.departureCity || profile.home_city,
      profile: {
        homeCity: profile.home_city || '',
        homeCountry: profile.home_country || '',
        isNomad: profile.is_nomad || false,
      },
    };

    // Nearby = same landmass / short hop (use ground transport, no flights).
    // Its own try: a failure here must not drop the origin set above.
    try {
      if (!enriched.isNearbyTrip && !wizardState.transport?.mode) {
        enriched.isNearbyTrip = isNearbyTrip(wizardState, profile.home_city);
      }
    } catch (e) {
      logger.warn('generation', 'Nearby-trip check failed; keeping origin', { error: e?.message });
    }
    return enriched;
  } catch (e) {
    logger.warn('generation', 'Profile enrichment failed; generating without origin', { error: e?.message });
    return wizardState;
  }
}

async function enqueueAndWatch(tripId, wizardState) {
  const user = getUser();
  if (!user) throw new Error('Not authenticated');

  const enriched = await enrichWizardState(wizardState);

  // Create the job row, then start watching BEFORE invoking the worker so we
  // cannot miss a fast completion event.
  const { data: job, error: jobErr } = await supabase
    .from('generation_jobs')
    .insert({
      trip_id: tripId,
      user_id: user.id,
      wizard_state: enriched,
      status: 'queued',
    })
    .select('id')
    .single();
  if (jobErr || !job) {
    logger.warn('generation', 'Generation job insert refused', { tripId, error: jobErr?.message, code: jobErr?.code });
    // 42501: row-level security refused the job. With migration 020 that is the
    // daily generation quota (or a trip this user can't edit). Never show the
    // raw database message.
    throw new Error(jobErr?.code === '42501'
      ? 'You have started a lot of generations today. Please try again tomorrow.'
      : 'Could not queue generation');
  }

  // Subscribe and WAIT for the channel to be live before invoking the worker, so
  // a fast completion cannot fire its UPDATE before we are listening.
  await watchTrip(tripId);

  const { error: invokeErr } = await supabase.functions.invoke('process-generation', {
    body: { jobId: job.id },
  });
  if (invokeErr) {
    // The worker accepts and returns 202 quickly; a transport error here means it
    // never started, so fail fast rather than waiting on a watchdog.
    logger.warn('generation', 'Generation worker invoke failed', { tripId, error: invokeErr.message });
    throw new Error('Could not start generation');
  }

  // The worker may have already finished between subscribe and invoke; reconcile
  // once (non-failing) to catch a missed event.
  reconcileOnce(tripId);
}

function watchTrip(tripId) {
  if (channels.has(tripId)) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const channel = supabase
      .channel(`trip-gen-${tripId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` },
        (payload) => {
          const status = payload.new?.status;
          if (status === 'generated') finishGeneration(tripId, 'done');
          else if (status === 'failed') failFromServer(tripId);
        })
      .subscribe((status) => {
        if (!settled && (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          settled = true;
          resolve();
        }
      });

    channels.set(tripId, { channel, watchdog: setTimeout(() => checkProgress(tripId), POLL_MS) });
  });
}

// The newest job for a trip (the owner or the starting editor can read it).
// Never selects result_days, which can be large.
async function latestJob(tripId) {
  const { data, error } = await supabase.from('generation_jobs')
    .select('status, error, updated_at').eq('trip_id', tripId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

// A failure from the server: show its reason when it is meant for the user.
async function failFromServer(tripId) {
  let job = null;
  try { job = await latestJob(tripId); } catch { /* generic message */ }
  finishGeneration(tripId, 'failed', friendlyError(job?.error));
}

// Realtime can drop on flaky networks; this is the safety net. It finalizes
// only on a terminal DB state, warns when the job has made no progress for a
// while, and stops waiting locally only after a long stall. It never writes the
// DB: the worker (and the recovery cron) alone own trips.status.
async function checkProgress(tripId) {
  const entry = activeGenerations.get(tripId);
  if (!entry || entry.status !== 'generating') return;
  try {
    const [{ data: trip, error: tripErr }, job] = await Promise.all([
      supabase.from('trips').select('status').eq('id', tripId).single(),
      latestJob(tripId),
    ]);
    if (tripErr) throw tripErr;
    if (trip?.status === 'generated') return finishGeneration(tripId, 'done');
    if (trip?.status === 'failed') return finishGeneration(tripId, 'failed', friendlyError(job?.error));

    const lastProgress = Math.max(entry.startedAt || 0, Date.parse(job?.updated_at) || 0);
    const idle = Date.now() - lastProgress;
    if (idle > GIVE_UP_MS) {
      return finishGeneration(tripId, 'failed', 'This is taking much longer than usual. Please try again.');
    }
    const slow = idle > SLOW_MS;
    if (slow !== !!entry.slow) {
      activeGenerations.set(tripId, { ...entry, slow });
      notifyListeners(tripId);
    }
  } catch (e) {
    // Unknown (offline, a read error): not progress and not failure. Ask again.
    logger.warn('generation', 'Progress check failed', { tripId, error: e?.message });
  }
  const watch = channels.get(tripId);
  if (watch && activeGenerations.get(tripId)?.status === 'generating') {
    clearTimeout(watch.watchdog);
    watch.watchdog = setTimeout(() => checkProgress(tripId), POLL_MS);
  }
}

// One-off probe after invoking or resuming: finalize only if already terminal.
async function reconcileOnce(tripId) {
  try {
    const { data } = await supabase.from('trips').select('status').eq('id', tripId).single();
    if (data?.status === 'generated') finishGeneration(tripId, 'done');
    else if (data?.status === 'failed') failFromServer(tripId);
  } catch (e) {
    logger.warn('generation', 'Generation reconcile failed', { tripId, error: e?.message });
  }
}

function finishGeneration(tripId, outcome, errorMsg) {
  const existing = activeGenerations.get(tripId);
  if (existing && (existing.status === 'done' || existing.status === 'failed')) return; // idempotent

  teardownWatch(tripId);

  if (outcome === 'done') {
    activeGenerations.set(tripId, { status: 'done' });
    logger.info('generation', 'Trip generation completed', { tripId });
    showCompletionNotification(tripId);
  } else {
    activeGenerations.set(tripId, { status: 'failed', error: errorMsg || 'Generation failed' });
    logger.warn('generation', 'Trip generation failed', { tripId, error: errorMsg });
  }
  notifyListeners(tripId);
}

function teardownWatch(tripId) {
  const entry = channels.get(tripId);
  if (entry) {
    clearTimeout(entry.watchdog);
    try { supabase.removeChannel(entry.channel); } catch {}
    channels.delete(tripId);
  }
}

async function safeUpdateStatus(tripId, status) {
  try {
    const { updateTripStatus } = await import('../data/trip-repository.js');
    await updateTripStatus(tripId, status);
  } catch {}
}

export function getGenerationStatus(tripId) {
  return activeGenerations.get(tripId) || null;
}

export function onGenerationUpdate(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners(tripId) {
  const status = activeGenerations.get(tripId);
  for (const fn of listeners) fn(tripId, status);
}

export function clearGeneration(tripId) {
  activeGenerations.delete(tripId);
  teardownWatch(tripId);
}

// Trips left 'generating' from a previous session (e.g. tab closed mid-run): the
// worker usually keeps running server-side, so we re-attach a watcher rather than
// re-launching the pipeline (which would race the in-flight job). First we ask the
// DB to requeue any job whose worker died mid-run (expired lease) and re-fire it.
// A local entry that already gave up ('failed') or finished is re-attached when
// the DB still says 'generating': the server recovers stalled jobs by itself,
// so the trip may yet complete.
export async function resumeStaleGenerations(trips) {
  const generating = trips.filter(t => t.status === 'generating' && activeGenerations.get(t.id)?.status !== 'generating');
  if (generating.length === 0) return;

  // Recover jobs whose worker isolate died (lease expired) and re-dispatch them.
  let recovered = [];
  try {
    const { data } = await supabase.rpc('recover_stale_jobs');
    recovered = data || [];
  } catch (e) {
    logger.warn('generation', 'recover_stale_jobs failed', { error: e?.message });
  }

  for (const trip of generating) {
    activeGenerations.set(trip.id, { status: 'generating', busy: false, attempt: 0, startedAt: Date.now() });
    watchTrip(trip.id);
    const job = recovered.find(j => j.trip_id === trip.id);
    if (job) {
      // Its worker had died — kick it off again (each provider gets a fresh budget).
      supabase.functions.invoke('process-generation', { body: { jobId: job.id } })
        .catch(e => logger.warn('generation', 'Resume re-invoke failed', { tripId: trip.id, error: e?.message }));
    } else {
      // Worker likely still running; just probe once for an already-finished result.
      reconcileOnce(trip.id);
    }
  }
}

// Asked from a tap ("Notify me when it's ready"): browsers ignore or quietly
// block permission prompts that no gesture started. Resolves to the permission
// ('granted' | 'denied' | 'default'), or 'unsupported'.
export async function requestCompletionNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

// Days planned so far for a trip's newest job, from the worker's chunk counter
// (never selects result_days, which can be large). null when unknown.
export async function fetchGenerationProgress(tripId) {
  const { data, error } = await supabase.from('generation_jobs')
    .select('chunk_idx, chunk_size').eq('trip_id', tripId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const size = Math.min(6, Math.max(2, Number(data.chunk_size) || 4));
  return (Number(data.chunk_idx) || 0) * size;
}

async function showCompletionNotification(tripId) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;

  let destName = 'your trip';
  try {
    const { data } = await supabase.from('trips').select('title').eq('id', tripId).single();
    if (data?.title) destName = data.title;
  } catch {}

  // Under the app's base path (/TrippyPWA/ on GitHub Pages). The service worker
  // resolves data.url against its scope and opens that trip.
  const icon = `${import.meta.env.BASE_URL}icons/icon-192.png`;
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification('Trippy', {
          body: `Your ${destName} itinerary is ready!`,
          icon, badge: icon,
          tag: 'gen-complete', renotify: true, data: { url: `#/trip/${tripId}` },
        });
      });
    } else {
      new Notification('Trippy', { body: `Your ${destName} itinerary is ready!`, icon, tag: 'gen-complete' });
    }
  } catch (e) { logger.warn('system', 'Notification display failed', { error: e?.message }); }
}
