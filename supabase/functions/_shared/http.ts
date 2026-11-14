// Shared HTTP helpers for the edge functions: a tightened CORS policy, caller
// authentication (user JWT or the service-role key), bounded JSON bodies, a
// per-user daily call counter, and a fetch timeout. Previously each proxy used
// wildcard CORS with no auth, an open, billable passthrough to Google.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Comma-separated allowlist, e.g. "https://trippy.app,https://www.trippy.app".
// Falls back to "*" only when unset (local dev) so we never hard-break on deploy.
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Browsers cache the preflight this long (Chrome caps it at 2h, Firefox 24h),
// so repeated invokes skip the extra OPTIONS round trip.
export const CORS_MAX_AGE = "86400";

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  let allow = "*";
  if (ALLOWED_ORIGINS.length > 0) {
    allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  }
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": CORS_MAX_AGE,
    "Vary": "Origin",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

export function bearerToken(req: Request): string {
  return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

// Constant-time string comparison: both sides are hashed first, so neither the
// position of the first mismatch nor the length leaks through timing.
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// True only when the bearer token IS this project's service-role key. Never
// trust a JWT's role claim without verifying it: functions deployed with
// --no-verify-jwt receive tokens the gateway has not checked.
export async function isServiceRoleRequest(req: Request): Promise<boolean> {
  return timingSafeEqual(bearerToken(req), SERVICE_KEY);
}

// Verifies the caller's Supabase JWT. Returns the user id, or null if the request
// is unauthenticated. Proxies should reject null to avoid being an open relay.
export async function getCallerUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  if (!SUPABASE_URL || !ANON_KEY) return null;
  try {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// Counts this call against the caller's daily budget for `bucket` (RPC
// bump_llm_usage, migration 020) and returns true when they are over `limit`.
// Fails open (false) when the RPC is missing or errors, so features keep
// working until the migration is applied; it is a cost guard, not auth.
export async function overDailyLimit(req: Request, bucket: string, limit: number): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || !SUPABASE_URL || !ANON_KEY) return false;
  try {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data, error } = await client.rpc("bump_llm_usage", { p_bucket: bucket });
    if (error) return false;
    return Number(data) > limit;
  } catch {
    return false;
  }
}

// Parses a JSON request body of at most maxBytes. `status` is 413 when too large
// and 400 when it is not valid JSON.
export async function readJsonBody(
  req: Request, maxBytes: number,
): Promise<{ body: any; status: 0 | 400 | 413 }> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { body: null, status: 413 };
  let text = "";
  try {
    text = await req.text();
  } catch {
    return { body: null, status: 400 };
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) return { body: null, status: 413 };
  try {
    return { body: JSON.parse(text), status: 0 };
  } catch {
    return { body: null, status: 400 };
  }
}

// Untrusted value -> single-line string of at most `max` chars, for prompts.
export function clip(value: unknown, max: number): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

export function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
