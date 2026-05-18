# Trippy Dev - Architecture

## Overview

Trippy is a PWA travel planning wizard built with vanilla JS + Vite. No framework. Hash-based SPA routing. Warm glassmorphism design language.

## Tech Stack

- **Runtime:** Vanilla JS (ES modules)
- **Bundler:** Vite 8
- **Styling:** CSS custom properties, no preprocessor
- **State:** sessionStorage (wizard), localStorage (user prefs)
- **Fonts:** DM Serif Display (headings) + Figtree (body) + JetBrains Mono (costs/times)
- **Photos:** Wikipedia MediaWiki API thumbnails (no API key needed)

## Design Tokens

All in `css/tokens.css`. Key values:

- **Colors:** Terracotta (#E07A5F) + Teal (#3D8B7A) on Parchment (#FAFAF5)
- **Radius scale:** 4px, 8px, 12px, 16px, 9999px (pill)
- **Spacing base:** 4px
- **Typography:** Hero (2rem heading), H1-H3, body, small, caption
- **Dark mode:** Full token override via `prefers-color-scheme: dark`

## File Structure

```
dev/
  index.html              Entry point, font loading
  css/
    tokens.css            Design tokens (colors, spacing, typography, shadows)
    base.css              Reset, utility classes, buttons, inputs, chips, cards
    components/
      wizard.css          All wizard-specific styles (steps, calendar, stepper, onboarding)
  js/
    main.js               App bootstrap
    router.js             Hash-based SPA router
    data/
      currencies.js       Static USD-based exchange rates, convert(), formatCurrency()
      user-prefs.js       localStorage prefs: home currency, onboarding check
      day-builder.js      Day planning utilities, escapeHtml()
    wizard/
      wizard.js           Wizard shell, all 8 step renderers, flag backgrounds, onboarding overlay
      wizard-state.js     sessionStorage state management, canAdvance() validation
      calendar.js         Date range picker component (month grid, click-to-select)
      destinations.js     124 destinations with Wikipedia photos, search/popular exports
```

## Wizard Flow

8 steps, stored in sessionStorage under `trippy_wizard_state`:

1. **Where to?** - Destination search + popular grid (8 cities) + multi-city toggle
2. **When's the adventure?** - Traveler count + date mode (fixed calendar / flexible duration+season)
3. **Comfort level** - Budget presets + stepper in destination currency, home currency subtitle
4. **Where will you stay?** - Accommodation type, hotel star rating (3/4/5), priority chips
5. **How do you fly?** - Fare class, departure time prefs, connection preference
6. **How do you travel?** - Style sliders (nightlife, pace, food, exploration) + interest chips
7. **Trip summary** - Grid overview of all choices + collapsible extras (must-do, dietary, avoid)
8. **Generation** - Demo animation (LLM integration placeholder)

### Onboarding Gate

Before wizard renders, `needsOnboarding()` checks if home currency is set in localStorage. If not, a full-screen currency picker overlay appears. User taps their home currency, it saves to localStorage, and the wizard proceeds. This only happens once.

## State Shape

```javascript
{
  currentStep: 1,
  furthestStep: 1,
  sessionId: "uuid",
  destination: {
    name, country, emoji, flag, lat, lng,
    currencyCode, currencySymbol, timezone,
    budgetRange: { backpacker, comfortable, luxury }, // USD/day
    image  // Wikipedia thumbnail URL
  },
  destinations: [],  // multi-city mode: array of destination objects
  multiCity: false,  // toggle between single/multi destination
  dates: {
    mode: "fixed" | "flexible" | null,
    start: "YYYY-MM-DD", end: "YYYY-MM-DD",  // fixed mode
    duration: 7, season: "off-peak" | "peak" | "sweet-spot"  // flexible mode
  },
  budget: {
    preset: "backpacker" | "comfortable" | "luxury" | null,
    dailyAmount: 0  // in destination currency
  },
  accommodation: {
    type: "hotel" | "hostel" | "airbnb" | "resort" | "villa" | "boutique" | null,
    stars: 0 | 3 | 4 | 5,  // only for hotel
    priorities: []  // e.g. ["Central location", "Fast WiFi", "In-unit washer & dryer"]
  },
  flights: {
    fareClass: "economy" | "premium" | "business",
    departureAirport: "",
    airlines: [],
    connectionPref: "direct" | "1 stop" | "any",
    departureTimePref: []  // ["morning", "afternoon", "evening", "redeye"]
  },
  style: {
    nightlife: 3, pace: 3, food: 3, exploration: 3,  // 1-5 sliders
    activities: []  // max 8 interests
  },
  summary: { freeText, mustDo, dietary, prebooked, avoid },
  travelers: 2
}
```

## Currency System

### Exchange Rates (`currencies.js`)

Static lookup table `RATES_FROM_USD` with ~35 currencies. All rates are approximate, USD-based.

- `convert(amount, fromCode, toCode)` - Cross-currency conversion via USD pivot
- `formatCurrency(amount, symbol)` - Locale-formatted display string

### Home Currency (`user-prefs.js`)

Stored in localStorage under `trippy_user_prefs`:

```javascript
{ homeCurrency: "SGD", homeSymbol: "S$" }
```

- `getHomeCurrency()` returns `{ code, symbol }` or null
- `needsOnboarding()` returns true if no home currency set
- `getCurrencyList()` returns 18 common currencies
- `setHomeCurrency(code, symbol)` persists to localStorage

### Budget Display Logic (Step 3)

1. Budget presets in `destination.budgetRange` are USD/day
2. Converted to destination currency via `convert(usd, 'USD', destCode)`
3. Stepper shows amount in destination currency as primary
4. Home currency equivalent shown as subtitle (if different from destination)
5. Step size scales with currency magnitude (~$5 USD equivalent)
6. Total estimate: `amount x days x travelers` in both currencies

## Calendar Component (`calendar.js`)

Custom date range picker, no dependencies:

- Month grid with Mo-Su headers
- Click start date, click end date (auto-swaps if reversed)
- Past dates disabled, today highlighted in teal
- Selected range: start/end in terracotta, range fill in terracotta-light
- Prev/next month navigation
- Exports: `renderCalendar(container, { start, end, onSelect })`

## Destinations (`destinations.js`)

124 cities across 45+ countries. Each destination includes:

- Name, country, emoji flag/icon
- Lat/lng coordinates
- Currency code + symbol
- Timezone string
- Budget range (USD/day): backpacker, comfortable, luxury
- Wikipedia thumbnail URL (500px)

Regions: Japan, Australia, Spain, Indonesia, France, USA, Thailand, UK, South Korea, Italy, Turkey, Portugal, Taiwan, Singapore, Netherlands, UAE, Czech Republic, Vietnam, Iceland, Morocco, South Africa, Malaysia, Argentina, Mexico, Greece, Austria, Hungary, Germany, Denmark, Sweden, Switzerland, Ireland, Cuba, Peru, Colombia, Philippines, New Zealand, Qatar, Oman, Jordan, Saudi Arabia, Canada, Croatia, Poland, Belgium

Search: `searchDestinations(query)` filters by name or country, returns max 8
Popular: `getPopularDestinations()` returns named list (Tokyo, Melbourne, Guangzhou, Bali, Helsinki, London, Seoul, Zurich)

## Design Patterns

- **Immutable state updates:** All state changes use spread operator, never mutate
- **Re-render on change:** Each step function re-renders its entire section on state change
- **Event delegation:** Wizard shell uses delegated click handler for nav actions
- **Debounced text inputs:** Step 6 free-text fields debounce at 300ms
- **Hold-to-repeat:** Budget stepper buttons support pointer hold for rapid increment
- **No emdashes:** User preference - use hyphens or "x" instead
