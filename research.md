# Trippy Expansion — Research & Master Plan

**Date:** 11 June 2026
**Scope:** Five expansion areas researched against the live 2026 landscape, refined for what consumers actually need, and sequenced into a build plan for a solo developer on the existing stack (vanilla JS + Vite PWA, Supabase Postgres/Auth/Storage/Edge Functions, Gemini/Mistral generation, Vercel + GitHub Pages hosting).

---

## Executive Summary

| # | Idea | Verdict | Recommended path | First step cost |
|---|------|---------|------------------|-----------------|
| 1 | In-app flight/hotel booking | ✅ but **staged** — full background booking needs a Singapore Travel Agent Licence (S$100k net worth) | Affiliate deep links now → Duffel Stays in-app → Duffel Flights+Payments | $0 |
| 2 | iCloud/Google Photos import + tagging/collage | ✅ — picker-based import is both the only technically possible AND the most private design | Google Photos Picker API + iOS file input → EXIF/itinerary matching → Gemini batch tagging → client-side collage/slideshow | ~$0 (Gemini tagging ≈ $1/10k photos) |
| 3 | Visa / eVisa / travel-authorisation reminders | ✅ — highest value-to-effort of all five | Open dataset + hand-curated eTA table in Postgres, advisory-only cards, email + push reminders | $0 |
| 4 | Many more wizard cities | ✅ — ~1 week of work | GeoNames + Wikidata pipeline → 2,000 pre-curated cities, static CDN search index, existing resolver as fallback | $0 (LLM budgets <$1) |
| 5 | Native iOS + Android without subscription fees | ⚠️ Apple is impossible for $0/yr; Android is nearly free | Android TWA on Play ($25 once) + optimized iOS PWA; defer Apple $99 to Capacitor phase when revenue exists | $25 |

**Consumer-need refinements applied to your ideas** (details per section): (1) travelers distrust opaque "background booking" by a small app — visible handoff to a trusted brand converts better at small scale, so booking autonomy should *grow with trust*; (2) full photo-library access is dead at the platform level since 2025 — the picker flow you'd want for privacy is now also the only option, and timestamps (not GPS) must drive auto-organisation; (3) visa reminders are a trust feature, not a revenue feature — never affiliate-link free arrival cards; (4) more cities only help if search stays instant — pre-generated static index beats a live database; (5) "native" pain is mostly install friction + push + share-target — a Play-Store TWA solves all three on Android for $25.

---

## 1. Real Flight & Hotel Booking + Billing Structure

### Landscape facts (June 2026)

**Hotels**
- **Booking.com**: May 2025 "Bookinggeddon" — thousands of small direct affiliates terminated (~€1,000+/mo commission retention cutoff); new partners pushed to CJ/Awin networks. Demand API `/orders` (book-in-app) is gated behind managed-partner status with volume expectations. *Not realistic at indie scale.*
- **Expedia Rapid (EPS)**: application + vetting + certification; PCI AoC unless using EPS Checkout; rates negotiated. Small apps are pointed to the affiliate program.
- **Hotelbeds**: net-rate wholesaler — you'd be merchant of record; ~US$5–8k deposit norm, mTLS, look-to-book ratios, 4–6 months build. Too heavy.
- **Amadeus Self-Service Hotels**: genuinely self-serve, pay-per-call, but thin inventory and agency-model settlement. Experiment-grade only.
- **Duffel Stays**: the standout — self-serve, 1M+ properties, supplier-paid commission returned on the Rate object, paid post-checkout, same onboarding as Duffel Flights.
- **Affiliate options**: Stay22 (~30% commission split, aggregates Booking/Expedia/Airbnb, indie-friendly), Booking.com via CJ/Awin (~4–5% of booking value effective), Travelpayouts (per-program approvals).

**Flights**
- **Duffel**: the indie-friendly choice. Free starter tier (~50 orders/mo), then ~US$3/order + 1% managed content, 2% FX. No IATA needed (rides Duffel's licences). **Duffel Payments** collects the customer card via their component (your PCI burden = SAQ-A; card data never touches your servers), pays the airline, pays out your markup. Refunds/changes via API.
- **Amadeus Flight Create Orders**: needs a signed airline-consolidator contract; settlement outside the API. Workable but heavier.
- **Kiwi Tequila**: public access discontinued (~mid-2024). **Skyscanner**: affiliate-only for indies (~$0.40–1.00/converting click). Flights pay poorly as affiliate (~1.1–1.5% of fare via Travelpayouts).

### Regulatory gates (this is what actually sequences the plan)

- **Singapore Travel Agents Act 1975 s.4**: completing bookings as agent/merchant requires an STB **Travel Agent Licence (General)** — min. **S$100,000 net worth**, S$200 + S$400 fees, ~10 working days via TRUST. **Pure affiliate referral does NOT require a licence.**
- **US seller-of-travel laws** (CA/FL/HI/WA) apply extraterritorially when selling to residents; FL needs a $25k surety bond. Affiliate-only avoids all of it.
- **EU Package Travel Directive** (incl. 2026/1024 reform): booking flight+hotel for the same trip in-app risks "package organiser" obligations (insolvency protection). Affiliate redirects avoid it; don't bundle flight+hotel in one in-app checkout for EU users.
- **PCI**: use Duffel's card component → SAQ-A. Never collect card numbers directly.

### Billing structure decision

| Model | Trippy's take | Regulatory weight | Recommended phase |
|---|---|---|---|
| Affiliate deep link | ~4–5% of hotel value (≈US$8–15/booking); <$1/flight click | None | **Phase A (now)** |
| Duffel Stays in-app, supplier-paid commission | Deal-specific %, paid post-checkout | STB licence | **Phase B** |
| Duffel Flights + Payments, markup/convenience fee | Need ≥US$10–15 markup per order to clear the ~$3+1% Duffel cost | STB licence (+CA/FL if US volume) | **Phase C** |
| Pro subscription (Wanderlog model: ~55% subscription / 45% affiliate) | $30–50/yr typical | None | **Parallel, any time** |

### Consumer-need refinement

"Books in the background" assumes users trust Trippy with their card and their trip. Comparable indie apps (Wanderlog — the closest comp) deliberately do NOT act as merchant of record; they convert recommendations into affiliate handoffs to brands users already trust, and monetise loyalty via subscription. The refined product idea: **"one-tap continue to book"** — Trippy pre-fills dates/party/hotel from the itinerary and deep-links into Booking/Stay22 (Phase A), then graduates to true in-app booking (Phase B/C) once there's volume, support capacity, and the licence. Background/auto-booking without a confirmation step should never ship — payment regulations (SCA/3DS) effectively require a user-present confirmation anyway.

### Implementation sketch (Phase A, ~1 week)

- `js/services/booking-links.js`: build affiliate URLs (Stay22 widget/link for the accommodation cards; Travelpayouts/Skyscanner for the flight card) with trip dates, party size, destination pre-filled.
- Touchpoints: trip-detail accommodation cards ("Check availability →"), flights section ("Find this flight →"), wizard step 7 summary.
- `bookings` table (trip_id, provider, clicked_at, status) for click-through tracking; conversion postbacks where networks support them.
- Disclosure line: "Trippy may earn a commission" (FTC/ASA compliance).

---

## 2. Photo Import, Tagging, Collage & Slideshow (privacy-first)

### Platform facts (June 2026)

- **Google Photos Library API is dead for library reading** (scopes removed 31 Mar 2025; 403s). The **Picker API** is the sanctioned replacement: OAuth scope `photospicker.mediaitems.readonly` → session → user picks photos in the real Google Photos UI → app downloads picked items (baseUrl valid ~60 min). Free, generous quotas. **The user-curated picker is exactly the "only trip photos, never the whole library" requirement — privacy-by-design is now also the only design.**
- Picker scope is **sensitive, not restricted** → standard OAuth verification (brand check, demo video, a few weeks) but **no paid CASA assessment**.
- **GPS EXIF is stripped** by both Google Picker downloads and iOS Safari file uploads (WebKit bug 207088). **Timestamps survive.** → Auto-organisation must key on **timestamp × itinerary** matching, with GPS as opportunistic bonus (Android/desktop uploads).
- **iCloud**: no public Photos API (CloudKit JS cannot touch the library). PWA path = `<input type="file" multiple>` → native iOS photo picker (user selects only trip photos). Optional power-user path: iCloud **Shared Album** public links are scrapable via undocumented endpoints (proxy via edge function; media ~2048px) — ship behind a flag, expect breakage. Native PHPickerViewController becomes available in the Capacitor phase (§5).
- **Comparables**: Polarsteps et al. all converged on manual picker import after the 2025 lockdown; "auto-detect trips from your library" (old Google Trips) is no longer possible for third parties.

### Pipeline design (validated against costs)

1. **Import**: "Add trip photos" on the trip page → Google Photos Picker (Android/desktop/Google users) or file input (iOS/everyone). Client-side resize to ~1600px before upload (300-photo trip ≈ 150 MB not 1.5 GB). Supabase Storage: 100 GB included on Pro, then $0.0213/GB-mo; thumbnails + long Cache-Control keep egress in the cached tier.
2. **Auto-organise (free signal)**: client-side `exifr` (~2.5 ms/photo, JPEG+HEIC) → DateTimeOriginal (+GPS when present) → match to itinerary day and nearest activity by time window. This alone yields "Day 3 — Tromsø: Northern Lights" grouping with zero API cost.
3. **AI tagging**: Gemini Flash-Lite **Batch API** on ~512px thumbnails with structured output (scene, landmark guess, people-count bucket, quality score, best-of-burst) — ≈ **$0.0001–0.0006/photo (~$1 per 10k)**. **No face recognition/identification** — keeps Trippy out of GDPR Art. 9 biometric territory entirely.
4. **Collage**: client-side canvas → PNG via `toBlob`. **Slideshow**: WebCodecs (Mediabunny/canvas-record) hardware-accelerated MP4 in-browser — zero server cost; feature-detect Safari and fall back to an animated web-page slideshow. Share artifact = public Trippy page (viral loop) + optional MP4 download.
5. **Consent/compliance**: explicit consent screen at first import; disclose Gemini processing; cascade-delete photos/thumbnails/tags on trip or account deletion; 30-day deletion SLA in policy.

### Schema sketch

`trip_photos` (id, trip_id, user_id, storage_path, thumb_path, taken_at, lat, lng, day_number, activity_id, tags jsonb, quality_score, created_at) + RLS by user_id; `photo_artifacts` (collage/slideshow outputs, public share token).

---

## 3. Visa / eVisa / Travel-Authorisation Reminders

### Data source decision

- **IATA Timatic**: airline-grade but priced/contracted for airlines and large OTAs. Not viable solo.
- **Sherpa**: purpose-built API + white-label eVisa commerce, revenue-share, no public pricing — **apply to their partner program in parallel**; their co-branded WebApp link is a zero-code interim.
- **iVisa affiliate** (direct or Awin): up to 20% commission on service fees — only ever for genuinely paid visas.
- **Foundation**: `ilyankou/passport-index-dataset` (MIT, 199×199 matrix, distinguishes visa-free/eVisa/ETA/visa-required) imported into Postgres + a **hand-curated `travel_authorisations` table (~25 rows)** holding what the matrix can't: fees, validity, lead times, official URLs. That small table is where 90% of the reminder value lives.
- **LLM (grounded Gemini)**: quarterly cross-check job that diffs dataset vs. search results and flags rows for human review — never the sole source (legal-domain hallucination rates are too high).

### The 2026 authorisation landscape (drives the curated table)

Key entries: US ESTA $40.27/2yr (apply ≥72h); UK ETA £20/2yr (covers EU nationals; hard-enforced since Feb 2026); **ETIAS NOT live — Q4 2026 launch, mandatory well into 2027**; Canada eTA CAD7; Australia ETA AUD20 (app-only); NZ NZeTA + **NZD100 IVL**; **Thailand TDAC free arrival card (submit within 3 days pre-arrival)**; Singapore SGAC free (3 days); South Korea K-ETA (22 nationalities exempt to end-2026, e-Arrival Card 72h); Japan JESTA ~2028; India e-Visa $25+; Vietnam e-visa $25/90d all nationalities; Indonesia e-VOA ~$33 + Bali levy; Türkiye, Egypt, Kenya eTA, Saudi eVisa, Israel ETA-IL, Sri Lanka (free for 40 nationalities since May 2026), Cambodia/Laos eVisas, US EVUS $30.75.

Lead-time tiers for reminders: T-3 days exactly (TDAC/SGAC — cannot submit earlier); ≥72h (ESTA, K-ETA, ETA-IL); ~1 week (UK/CA/AU eTAs); 2–3 weeks (eVisas: India/Vietnam/Cambodia/Laos/Egypt); 4–8 weeks (consular visas: Schengen, China — appointment scarcity).

### Liability & UX (industry pattern: TripIt, SkyTeam/Sherpa)

Advisory-only card at trip creation + reminder schedule. Always: third-party data attribution, "informational purposes only", "verify with the embassy/official source", **deep links ONLY to official government portals** (scam sites charge $30–50 for free arrival cards — Trippy linking officially is itself a trust feature), "approval ≠ guaranteed entry".

### Implementation (needs one schema addition: `profiles.nationality`)

Profile currently has home_city/home_country but **no nationality/passport country — add it** (visa rules key on passport, not residence; support dual nationality later). Then:
1. Trip creation → lookup (passport, destination country) in `visa_requirements` + `travel_authorisations` → advisory card on trip detail ("You'll likely need ESTA — apply by 12 Nov at esta.cbp.dhs.gov") + checklist auto-item.
2. `pg_cron` daily sweep → due reminders → **email (primary channel — Supabase/Resend)** + web push (works on installed PWA, iOS 16.4+; unreliable otherwise).
3. Quarterly grounded-LLM diff job; Sherpa partnership + iVisa affiliate as Phase 2.

Effort: ~1–2 weeks including the nationality profile field, tables, advisory UI, and the cron mailer.

---

## 4. Scaling the Wizard City Database (~125 → 2,000+)

### Pipeline (offline Node script, re-run quarterly, ~$1 total cost)

1. **GeoNames** `cities15000.zip` (CC-BY 4.0) + `countryInfo.txt` → filter feature class `P`, dedupe, top ~2,000 by population → name, country, ISO code, lat/lng, **IANA timezone**, **currency** (via countryInfo join).
2. **Images**: Wikidata SPARQL joined on **P1566 (GeoNames ID)** → P18 image; fall back to Wikipedia **PageImages batch API** (`prop=pageimages&pilimit=50`); store per-image **author + licence via `extmetadata`** (Commons attribution is per-image — show a small credit affordance in the UI). Expect ~90–95% coverage for the top 2,000; fill gaps via Pexels (20k/mo free) or manual. Skip Unsplash (mandatory-hotlink ToS conflicts with static pre-generation).
3. **Budgets**: Gemini Flash **Batch** structured-output pass (3-tier daily budgets, anchored on country cost index) — **<$1 for 2,000 cities**; validate against the existing 125 hand-curated cities as the benchmark; label as estimates. (Also email BudgetYourTrip — they have an official API with exactly the 3-tier model; pricing on request. Numbeo at $260–560/mo is out.)
4. **Emit**: `cities-index.json` slim search index (id, name, country ≈ 60 KB gzipped for 5,000) → served static from CDN; full records → Supabase `cities` table (authoring source of truth) + per-city static chunks.

### Runtime (wizard runs pre-auth — static CDN beats DB)

- Keep curated top-100 inline exactly as today (instant hero coverflow).
- Typeahead: lazy-load the index on first keystroke → Fuse.js client-side fuzzy search → hydrate the full record on selection.
- The recently-built live resolver (Photon + Wikipedia + Open-Meteo) remains the final fallback for anything outside the 2,000 — so "as many cities as possible" is literally *every city on Earth*, with three quality tiers: curated-100 → pre-generated-2,000 → live-resolved-anything.
- Attribution: GeoNames CC-BY line in About; per-image credits.

Effort: pipeline 2–3 days, wizard runtime 1–2 days → **~1 week**.

---

## 5. Native iOS & Android Without a Developer Subscription

### The hard facts

- **Apple $99/yr is unavoidable** for ANY distribution (App Store, TestFlight, enterprise, EU alt-stores, AltStore PAL notarisation, EU Web Distribution — which also demands an EU entity + 1M EU installs). Fee waivers are nonprofits/edu only. **"No subscription fee" = no iOS App Store. Full stop.**
- **Google Play is $25 one-time** (note: personal accounts need a 12-tester/14-day closed test before production).
- **Wrapped PWAs get rejected on iOS** (guideline 4.2 minimum functionality) but **TWAs are officially supported on Google Play**.
- **Play Billing is NOT required for Trippy** — travel/physical services are explicitly exempt from the 15/30% cut.
- iOS PWA in 2026: Web Push + Badging work (installed PWAs, 16.4+; Declarative Web Push since 18.4); since iOS 26 home-screen sites open as web apps by default. Still missing: install prompts (share-sheet only), background sync, **Web Share Target** (can't "share photos TO Trippy" on iOS web — WebKit bug open since 2019), widgets.

### The middleground (validated)

| Move | Cost | What it buys |
|---|---|---|
| **Android TWA via Bubblewrap/PWABuilder → Play Store** | $25 once, ~days of work | Store discoverability, real install UX, FCM-reliable push, share-target (photos→Trippy), full Chrome engine |
| **iOS PWA optimization** | $0 | Declarative Web Push, badging, persistent storage request, polished in-app "Add to Home Screen" walkthrough |
| **Defer: Capacitor + Apple Developer Program** | $99/yr when revenue justifies | App Store presence, PHPickerViewController (gold-standard photo import), share extension, widgets — clears guideline 4.2 with real native surface |

### Capacitor-readiness (do in code NOW, costs nothing)

1. Gate service-worker registration behind a platform check (SW doesn't register on `capacitor://` iOS scheme).
2. Keep the Supabase OAuth redirect URL in one config spot (native needs custom-scheme deep link + manual `exchangeCodeForSession` — known PKCE pitfall).
3. Keep auth-token hash parsing separate from the hash router (collides with `#access_token=` fragments).

Requirements for the TWA: manifest + HTTPS + SW (✅ all exist), Lighthouse PWA ≥80, `/.well-known/assetlinks.json` on the production domain.

---

## Sequenced Roadmap

**Phase 0 — quick wins (≈2–3 weeks, $25 total)**
1. Visa/eTA advisory + reminders (§3) — highest value/effort; needs `profiles.nationality`.
2. City pipeline → 2,000 cities (§4).
3. Android TWA on Play (§5) + iOS PWA polish.
4. Affiliate booking links (§1 Phase A) + disclosure line.

**Phase 1 — photos (≈4–6 weeks, near-$0 run cost)**
5. Photo import (Picker + file input) → timestamp×itinerary auto-organisation → Gemini batch tagging → collage + slideshow + public share page (§2). Start Google OAuth sensitive-scope verification early (weeks of lead time).

**Phase 2 — real booking (when: revenue > $0, support capacity exists)**
6. STB Travel Agent Licence (S$100k net-worth gate) → Duffel Stays in-app hotel booking (SAQ-A card component) → later Duffel Flights + Payments with ~US$10–15 markup/convenience fee per order. Keep EU users on affiliate flow until package-travel obligations are handled.
7. In parallel: Trippy Pro subscription (Wanderlog comp: ~55% of revenue from subscriptions).

**Phase 3 — native depth (when: $99/yr is justified)**
8. Capacitor wrap → App Store: PHPicker photo import, share extension, push, widgets.

**Dependency notes:** §3 unblocks the most user trust per day of work; §2's share pages become the growth loop; §1 Phase B/C is gated on the licence, not on code; §5's TWA makes §2's "share photos to Trippy" work on Android immediately.

---

## Key Risks & Open Questions

1. **STB licence S$100k net-worth requirement** is the real cost of "completes the booking itself" — decide whether Phase 2 justifies incorporating/capitalising, or whether affiliate + subscription is the durable model (Wanderlog suggests it is).
2. **Booking.com affiliate volatility** ("Bookinggeddon") — don't build revenue projections on one network; Stay22 diversifies.
3. **ETIAS timing** — not live until Q4 2026, mandatory 2027; the curated table must be maintained (quarterly grounded-LLM diff + manual review).
4. **Google OAuth verification lead time** for the Photos Picker scope — start before building UI.
5. **iCloud Shared Album endpoints are unofficial** — flag-gated power-user feature only.
6. **Apple platform risk** for PWAs (the 17.4 EU scare reversed under regulator pressure) — mitigated by Capacitor-readiness.
7. **Duffel commission/markup economics** are deal-specific — validate unit economics in sandbox before licence spend.

---

## Source Appendix (primary citations)

Booking/billing: developers.booking.com · skift.com (affiliate cuts) · partner.expediagroup.com · developer.hotelbeds.com · duffel.com/pricing · developers.amadeus.com · stb.gov.sg (Travel Agent Licence) · sso.agc.gov.sg (Travel Agents Act) · oag.ca.gov/travel · europarl.europa.eu (Package Travel reform) · help.wanderlog.com (revenue model)
Photos: developers.google.com/photos (updates, picker) · support.google.com/cloud (restricted scopes) · developer.apple.com/forums (no CloudKit photo access) · bugs.webkit.org/207088 (GPS strip) · ai.google.dev (Gemini pricing) · supabase.com (storage pricing) · remotion.dev (client-side rendering) · verasafe.com (GDPR photos)
Visas: iata.org (Timatic) · docs.joinsherpa.io · ivisa.com/affiliates · github.com/ilyankou/passport-index-dataset · travel-europe.europa.eu (ETIAS) · homeofficemedia.blog.gov.uk (UK ETA) · cbp.gov (ESTA) · tdac.immigration.go.th · ica.gov.sg (SGAC) · supabase.com (cron)
Cities: geonames.org/export · wikidata.org (SPARQL) · mediawiki.org (PageImages) · commons.wikimedia.org (reuse) · pexels.com/api · budgetyourtrip.com/api · numbeo.com (pricing) · ai.google.dev (batch pricing)
Native: developer.apple.com (fee waivers, web distribution, review guidelines) · support.google.com/googleplay (fees, payments policy) · developers.google.com (PWA in Play) · magicbell.com (iOS PWA limits) · faq.altstore.io · supabase.com (deep linking) · github.com/ionic-team/capacitor (SW issue) · v2.tauri.app
