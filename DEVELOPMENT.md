# Trippy — Development & Operations

Operator-facing documentation: project layout, deployment, database schema,
edge functions, logging, and store packaging. For the product overview and
features, see [README.md](README.md).

---

## Project Structure

```
dev/
  index.html                          Entry point, font loading, PWA meta tags
  vite.config.js                      Vite config (GH_PAGES base path support)
  public/
    manifest.json                     PWA manifest
    sw.js                             Service worker
    icons/                            favicon.svg, icon-192.png, icon-512.png
  css/
    tokens.css                        Design tokens (colors, spacing, type, shadows, --nav-h)
    base.css                          Reset, utilities, buttons, inputs, global focus ring
    components/
      admin.css                       Admin portal: stat cards, tables, tabs, log panel
      auth.css                        Auth gate modal
      dashboard.css                   Landing page, trip cards, empty state
      modal.css                       Modal dialog
      nav.css                         Top navigation bar, trip-detail action buttons
      profile-wizard.css              Profile setup flow
      shared.css                      Public shared trip view
      toast.css                       Toast notification system
      trip-detail.css                 Itinerary view (days, activities, transport, edit mode)
      trip-edit.css                   Regenerate modal
      wizard.css                      All wizard step styles
  js/
    main.js                           Bootstrap, routes, auth guard, global error handlers
    router.js                         Hash router, parameterized routes, onRouteLeave cleanup hook
    admin/
      admin-dashboard.js              Stats, user/trip tables, role management, regenerate any trip
      admin-logs.js                   Logs tab: filters, User/Destination columns, detail rows, purge
    auth/
      auth.js                         Supabase Auth wrapper, session management
      auth-ui.js                      Auth gate modal (Google OAuth)
    components/
      dashboard.js                    Landing page, trip cards, home-currency totals, empty state
      nav.js                          Top nav bar, admin shield icon, reduced-motion guard
      shared-trip.js                  Public shared trip view (no auth required)
      toast.js                        Toast notifications with aria-live and per-level icons
      trip-detail.js                  Full itinerary view, edit mode, share modal, PDF export
      trip-edit.js                    Non-destructive regenerate modal
      activity-editor.js              Inline activity editing, Places autocomplete, live directions
    data/
      admin-repository.js             Admin data access, log embeds (user name, trip title)
      currencies.js                   Static USD-based rates, convert(), canConvert(), format()
      day-builder.js                  Day planning utilities, escapeHtml()
      profile-repository.js           Profile fetch/update, setup check
      registry.js                     Trip storage helpers
      share-repository.js             Share link CRUD
      transit-lines.js                Transit line abbreviations for 20+ cities
      trip-repository.js              Trip CRUD, createTrip, updateActivityById, add/deleteActivity
      user-prefs.js                   localStorage: home currency, onboarding flag
    lib/
      locale.js                       Locale detection, formatCityList(), number/date formatting
      logger.js                       Client-side batched logger (queue plus flush to app_logs)
      pdf-export.js                   PDF export (jsPDF) for itineraries
      supabase.js                     Supabase client init, cached user
    services/
      generate.js                     Place-photo proxy helpers (fetchPlacePhoto / ByQuery)
      generation-manager.js           Async job enqueue, Realtime watch, profile enrichment, recovery
    wizard/
      wizard.js                       Wizard shell, step renderers, custom-city search, flag backgrounds
      wizard-state.js                 sessionStorage state, validation, immutable updates
      calendar.js                     Keyboard-accessible date range picker
      destinations.js                 125 curated destinations plus makeCustomDestination()
    profile/
      profile-wizard.js               First-time profile setup (name, home city, currency)
  supabase/
    functions/
      _shared/generation.ts           Shared prompt, schema, providers, validation, db mapping
      _shared/http.ts                 Shared CORS, caller-auth, timeout, json helpers
      process-generation/index.ts     Async, chunked generation worker (day-batches, atomic save)
      generate-itinerary/index.ts     Legacy synchronous generator (superseded, kept for reference)
      places-photo/index.ts           Google Places photo proxy (auth + CORS + timeout)
      places-search/index.ts          Google Places text search (venue autocomplete)
      places-directions/index.ts      Google Directions proxy (transit plus walking)
  .github/workflows/deploy.yml        GitHub Actions: build plus deploy to GitHub Pages
  js/**/*.test.js                     Vitest unit tests (currencies, wizard-state)
```

---

## Logging System

A two-layer logging system captures errors and diagnostics from both client and server, stores them in `app_logs`, and surfaces them in the admin portal.

### Client-Side Logger (`logger.js`)

A batched, fire-and-forget logger:

- Queue size 5 per flush, max 50 queued
- 10-second flush interval
- Auto-flush on page visibility change (hidden) and `beforeunload`
- Usage: `logger.error(category, message, metadata)`, `.warn()`, `.info()`
- Falls back to `console` in development

### Edge Function Logger

The `process-generation` worker logs directly to `app_logs` via a service-role client (non-blocking), capturing provider failures, validation issues, save failures, and successes, with the provider and error detail in `metadata`.

### Database Table (`app_logs`)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `level` | text | `error`, `warn`, or `info` |
| `category` | text | `auth`, `generation`, `data`, `share`, `profile`, `edge`, `system` |
| `message` | text | Human-readable message |
| `metadata` | jsonb | Structured context (provider, error, timing, stack) |
| `user_id` | uuid | FK to profiles (nullable) |
| `trip_id` | uuid | FK to trips (nullable) |
| `source` | text | `client` or `edge` |
| `user_agent` | text | Browser user agent |
| `created_at` | timestamptz | Log timestamp |

Indexes on `created_at DESC`, `level`, `category`, and `user_id`. RLS: admins read and delete, authenticated users insert.

---

## Database Schema

All tables use Row Level Security. Users access only their own data; admins have read access across tables and full access to logs.

| Table | Purpose |
|-------|---------|
| `profiles` | User profile (display name, avatar, home currency, home city and country, role) |
| `trips` | Trip metadata (title, dates, budget, status, wizard state as JSONB, extras) |
| `itinerary_days` | Per-day data (title, theme, weather JSONB) |
| `activities` | Activities (venue, time, cost, currency, coordinates, transport fields) |
| `trip_shares` | Share tokens linking trips to public URLs |
| `generation_jobs` | Async generation queue (provider order, attempt, lease, chunk progress, accumulated days, wizard state, status) |
| `app_logs` | System-wide diagnostics |

Key database functions:

- `replace_itinerary(trip_id, title, extras, days)`: atomic delete-then-insert of an itinerary, sets status to `generated`. Revoked from end users.
- `recover_stale_jobs()`: requeues jobs whose worker lease expired so a crashed worker can be retried.

Trip statuses: `planning`, `generating`, `generated`, `failed`, `active`, `completed`.

User roles: `user` (default) and `admin`.

An auto-profile trigger on `auth.users` insert populates name and avatar from OAuth metadata.

---

## Transit Line Abbreviations

`transit-lines.js` maps long transit line names to short abbreviations for transport pills, covering roughly 100 lines across 20+ cities (Singapore MRT and LRT, Hong Kong MTR, Tokyo, London, Paris RER, NYC subway, Seoul, Taipei, Bangkok, Kuala Lumpur, Jakarta, Berlin, Amsterdam, SF BART, Chicago, Toronto, Dubai, Sydney, and more). Parenthetical abbreviations are extracted automatically, and long names that match the lookup table are shortened.

---

## Edge Functions

### `process-generation`

The async, chunked generation worker. Accepts a `jobId`, then processes the trip in day-batches: one chunk per invocation, with Gemini-then-Mistral fallback per chunk. Generated days accumulate on the job row, and the final chunk saves the whole itinerary atomically through `replace_itinerary`. Self-invokes between chunks so each model call gets a fresh wall-clock budget. Deployed with `verify_jwt = false` because it self-invokes with the service-role key and authorizes by job id internally.

Prompt and schema highlights (in `_shared/generation.ts`):

- Chunk scoping: `buildPromptAndSchema` accepts a day range and an `includeExtras` flag, so non-first chunks emit days only
- Full per-day activity density at any trip length, since each chunk is small
- Same-city detection skips flight and arrival logistics for local trips
- Nearby-trip detection replaces flights with ferry, bus, or train options
- Multi-city routing guidance (enter nearest and cheapest, order by proximity)
- Origin-anchored flight suggestions
- Per-city accommodation for multi-city trips
- Region-appropriate ride-share apps
- Diagnostic errors that surface the model finish reason and catch truncated JSON

### `places-search`, `places-directions`, `places-photo`

Google Places and Directions proxies used by inline editing and the itinerary view. All three require a valid caller JWT, restrict CORS via `ALLOWED_ORIGINS`, apply fetch timeouts, and keep the API key in headers. `places-directions` distinguishes "no route" from "API unavailable".

### `generate-itinerary` (legacy)

The original synchronous generator, superseded by the async queue. Kept for reference; not used by the client.

---

## Deployment

### GitHub Pages (production)

Push to `main` triggers the GitHub Actions workflow:

1. `npm ci` and `npx vite build` with `GH_PAGES=1` (sets the base path to `/TrippyPWA/`)
2. Supabase URL and anon key injected from GitHub Secrets
3. Built artifacts uploaded and deployed to GitHub Pages

### Supabase setup

1. Create a Supabase project.
2. Apply the database schema via the SQL Editor: the core tables (`profiles`, `trips`, `itinerary_days`, `activities`, `trip_shares`, `app_logs`), the role and sharing policies, and the generation queue (`generation_jobs`, the `replace_itinerary` and `recover_stale_jobs` functions, and Realtime on `trips`).
3. Enable Google OAuth under Authentication > Providers.
4. Set edge function secrets:
   ```bash
   supabase secrets set GEMINI_API_KEY=your-key
   supabase secrets set MISTRAL_API_KEY=your-key
   supabase secrets set GOOGLE_PLACES_API_KEY=your-key
   supabase secrets set ALLOWED_ORIGINS=https://your-domain
   ```
5. Deploy edge functions:
   ```bash
   supabase functions deploy process-generation --no-verify-jwt
   supabase functions deploy places-photo
   supabase functions deploy places-search
   supabase functions deploy places-directions
   ```
6. Verify Realtime is enabled for the `trips` table (the schema adds it to the `supabase_realtime` publication).
7. Make at least one admin by setting `role = 'admin'` on a row in `profiles`.

### Local development

```bash
npm install
npm run dev       # Vite dev server on :5173
npm run build     # Production build to dist/
npm run preview   # Preview the production build
npm test          # Run the Vitest unit suite
npm run test:watch
```

---

## State Management

| Store | Key | Purpose |
|-------|-----|---------|
| `sessionStorage` | `trippy_wizard_state` | Wizard state, survives refresh, clears on tab close |
| `localStorage` | `trippy_user_prefs` | Home currency and symbol |
| Supabase | `profiles` | User profile synced on login |
| Supabase | `trips` and related | Trip data, itineraries, activities |
| Supabase | `trip_shares` | Share tokens |
| Supabase | `generation_jobs` | Async generation queue |
| Supabase | `app_logs` | Diagnostics |

All client state updates use immutable spread patterns. Wizard state is validated per step with `canAdvance()` before forward navigation.

---

## Currency System

Static USD-based exchange rates for roughly 40 currencies in `currencies.js`.

- `convert(amount, fromCode, toCode)`: cross-currency conversion via a USD pivot
- `canConvert(code)`: whether a rate exists for a currency
- `formatCurrency(amount, symbol)`: locale-formatted display

Unknown currencies are not silently scaled by USD; `convert` returns the amount unchanged so it is at least shown in its own currency. Dashboard trip cards show the trip total with a converted home-currency equivalent when the home and trip currencies differ.

---

## Testing

Vitest unit tests cover the pure, reliability-critical logic:

- `js/data/currencies.test.js`: conversion, the unknown-currency guard, and formatting
- `js/wizard/wizard-state.test.js`: the per-step `canAdvance()` gating

Run with `npm test`.

---

## Android App (TWA)

Trippy ships to Google Play as a Trusted Web Activity — the Play-installed app IS this
website running in full Chrome, so every web deploy updates the app instantly. One-time
US$25 Play Console fee; no Play billing required (travel services are exempt from the
digital-goods cut).

One-time setup:

1. Create a [Play Console](https://play.google.com/console) developer account ($25).
2. Build the Android package from the live PWA:
   ```bash
   npx @bubblewrap/cli init --manifest https://<production-domain>/manifest.json
   npx @bubblewrap/cli build
   ```
   Use package id `com.trippy.app` to match `public/.well-known/assetlinks.json`.
3. Upload the `.aab` to Play Console. Copy the **App signing key SHA-256 fingerprint**
   (Play Console → Setup → App integrity) into
   `public/.well-known/assetlinks.json`, replacing the placeholder, and deploy the site.
   Without the matching fingerprint the app shows a browser toolbar instead of
   running fullscreen.
4. Personal accounts: run the required closed test (12 testers, 14 days) before
   promoting to production.

Native-wrapper readiness: service-worker registration is skipped when
`window.Capacitor` reports a native platform, so the same codebase can later be
wrapped with Capacitor for the iOS App Store without code changes.
