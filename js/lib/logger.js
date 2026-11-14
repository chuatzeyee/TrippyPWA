import { supabase, getUser } from './supabase.js';

const FLUSH_SIZE = 5;
const FLUSH_INTERVAL = 10_000;
const MAX_QUEUE = 50;

let queue = [];
let flushTimer = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL);
}

async function flush() {
  if (!queue.length || !supabase) return;
  // The database only accepts rows for the signed-in user (or none). Entries
  // queued under another account (switched without a reload) would make the
  // whole batch fail, so drop them.
  const userId = getUser()?.id || null;
  queue = queue.filter(e => !e.user_id || e.user_id === userId);
  if (!queue.length) return;
  const batch = queue.splice(0, FLUSH_SIZE * 3);
  try {
    await supabase.from('app_logs').insert(batch);
  } catch {
    queue.unshift(...batch.slice(0, MAX_QUEUE - queue.length));
  }
}

function log(level, category, message, metadata = {}) {
  const user = getUser();
  const entry = {
    level,
    category,
    message: String(message).slice(0, 2000),
    metadata,
    user_id: user?.id || null,
    trip_id: metadata.tripId || null,
    source: 'client',
    user_agent: navigator.userAgent,
  };

  if (level === 'error') console.error(`[${category}]`, message, metadata);
  else if (level === 'warn') console.warn(`[${category}]`, message, metadata);

  if (!supabase) return;

  queue.push(entry);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  if (queue.length >= FLUSH_SIZE) flush();
  else scheduleFlush();
}

export const logger = {
  error: (category, message, metadata) => log('error', category, message, metadata),
  warn: (category, message, metadata) => log('warn', category, message, metadata),
  info: (category, message, metadata) => log('info', category, message, metadata),
  flush,
};

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('beforeunload', () => flush());
}
