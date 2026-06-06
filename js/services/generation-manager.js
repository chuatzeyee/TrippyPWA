import { logger } from '../lib/logger.js';
import { supabase, getUser } from '../lib/supabase.js';

// Async generation: we enqueue a job, fire the worker once, then watch the trip
// row via Realtime. The edge worker runs each provider in its own invocation
// (its own wall-clock), so there is no client-side retry storm and no risk of a
// slow provider starving the fallback.
const activeGenerations = new Map();
const listeners = new Set();
const channels = new Map();

const WATCHDOG_MS = 240_000; // first DB reconcile if Realtime misses the event
const WATCHDOG_GRACE_MS = 120_000; // extra grace before giving up locally

export async function startGeneration(tripId, wizardState) {
  // Guard against launching a second pipeline for a trip already in flight.
  if (activeGenerations.get(tripId)?.status === 'generating') {
    logger.warn('generation', 'Generation already in progress, ignoring duplicate start', { tripId });
    return;
  }
  activeGenerations.set(tripId, { status: 'generating', busy: false, attempt: 0, startedAt: Date.now() });
  logger.info('generation', 'Trip generation started', { tripId });
  notifyListeners(tripId);
  requestNotificationPermission();

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

async function enqueueAndWatch(tripId, wizardState) {
  const user = getUser();
  if (!user) throw new Error('Not authenticated');

  // Create the job row, then start watching BEFORE invoking the worker so we
  // cannot miss a fast completion event.
  const { data: job, error: jobErr } = await supabase
    .from('generation_jobs')
    .insert({
      trip_id: tripId,
      user_id: user.id,
      wizard_state: wizardState,
      status: 'queued',
    })
    .select('id')
    .single();
  if (jobErr || !job) throw new Error(jobErr?.message || 'Could not queue generation');

  // Subscribe and WAIT for the channel to be live before invoking the worker, so
  // a fast completion cannot fire its UPDATE before we are listening.
  await watchTrip(tripId);

  const { error: invokeErr } = await supabase.functions.invoke('process-generation', {
    body: { jobId: job.id },
  });
  if (invokeErr) {
    // The worker accepts and returns 202 quickly; a transport error here means it
    // never started, so fail fast rather than waiting on a watchdog.
    throw new Error(invokeErr.message || 'Could not start generation');
  }

  // The worker may have already finished between subscribe and invoke; reconcile
  // once (non-failing) to catch a missed event.
  reconcileOnce(tripId, false);
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
          else if (status === 'failed') finishGeneration(tripId, 'failed');
        })
      .subscribe((status) => {
        if (!settled && (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          settled = true;
          resolve();
        }
      });

    const watchdog = setTimeout(() => reconcileOnce(tripId), WATCHDOG_MS);
    channels.set(tripId, { channel, watchdog });
  });
}

// Realtime can drop on flaky networks; this is the safety net.
// softTimeout=true (the watchdog) surfaces a non-terminal "slow" notice but keeps
// the channel open so a late success still lands — it never writes the DB, which
// the worker alone owns. softTimeout=false (a resume/post-invoke probe) only
// finalizes if the DB is already terminal.
async function reconcileOnce(tripId, softTimeout = true) {
  try {
    const { data } = await supabase.from('trips').select('status').eq('id', tripId).single();
    if (data?.status === 'generated') finishGeneration(tripId, 'done');
    else if (data?.status === 'failed') finishGeneration(tripId, 'failed');
    else if (softTimeout) {
      // Still generating after the watchdog window. Do NOT mark failed yet (the
      // worker may still finish and own trips.status); tell the user it's slow and
      // re-arm one final check. Only after the grace window do we give up locally.
      const existing = activeGenerations.get(tripId);
      if (existing && existing.status === 'generating') {
        if (existing.slow) {
          // Already warned once and still not terminal — give up locally so the
          // user can retry. The worker may have died; the DB row remains
          // 'generating' and will be recovered by recover_stale_jobs on resume.
          finishGeneration(tripId, 'failed', 'This is taking longer than expected. Please try again.');
        } else {
          activeGenerations.set(tripId, { ...existing, slow: true });
          notifyListeners(tripId);
          const entry = channels.get(tripId);
          if (entry) {
            clearTimeout(entry.watchdog);
            entry.watchdog = setTimeout(() => reconcileOnce(tripId, true), WATCHDOG_GRACE_MS);
          }
        }
      }
    }
  } catch (e) {
    logger.warn('generation', 'Watchdog reconcile failed', { tripId, error: e?.message });
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
export async function resumeStaleGenerations(trips) {
  const generating = trips.filter(t => t.status === 'generating' && !activeGenerations.has(t.id));
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
      reconcileOnce(trip.id, false);
    }
  }
}

function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') Notification.requestPermission();
}

async function showCompletionNotification(tripId) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;

  let destName = 'your trip';
  try {
    const { data } = await supabase.from('trips').select('title').eq('id', tripId).single();
    if (data?.title) destName = data.title;
  } catch {}

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification('Trippy', {
          body: `Your ${destName} itinerary is ready!`,
          icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
          tag: 'gen-complete', renotify: true, data: { url: '/' },
        });
      });
    } else {
      new Notification('Trippy', { body: `Your ${destName} itinerary is ready!`, icon: '/icons/icon-192.png', tag: 'gen-complete' });
    }
  } catch (e) { logger.warn('system', 'Notification display failed', { error: e?.message }); }
}
