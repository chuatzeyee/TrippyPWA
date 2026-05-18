# Trippy

AI-powered travel planning PWA. A 7-step wizard that collects your trip preferences and generates a personalized itinerary.

Built with vanilla JS, CSS custom properties, and Vite. No framework dependencies.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Vanilla JS (ES modules) | Zero framework overhead, small bundle |
| Bundler | Vite 8 | Fast HMR, native ESM dev server |
| Styling | CSS custom properties | Design token system, no build step for styles |
| State | sessionStorage / localStorage | Wizard state persists across page refreshes |
| Fonts | DM Serif Display + Figtree + JetBrains Mono | Editorial heading + clean body + monospace data |
| Photos | Wikipedia MediaWiki API | Free city thumbnails, no API key needed |

## Project Structure

```
dev/
  index.html                    Entry point
  vite.config.js                Vite config
  public/
    manifest.json               PWA manifest
    icons/favicon.svg           App icon
  css/
    tokens.css                  Design tokens (colors, spacing, typography, shadows)
    base.css                    Reset, utilities, buttons, inputs, chips
    components/
      dashboard.css             Landing page and trip cards
      wizard.css                All wizard step styles
      modal.css                 Modal dialog styles
      nav.css                   Top navigation bar
  js/
    main.js                     App bootstrap, route definitions
    router.js                   Hash-based SPA router
    data/
      currencies.js             Exchange rates, convert(), formatCurrency()
      user-prefs.js             localStorage: home currency, onboarding check
      day-builder.js            Day planning utilities, escapeHtml()
      registry.js               Trip storage and retrieval
    components/
      dashboard.js              Landing page with trip cards and empty state
      nav.js                    Top navigation bar
    wizard/
      wizard.js                 Wizard shell, all step renderers, flag backgrounds
      wizard-state.js           sessionStorage state, validation, immutable updates
      calendar.js               Date range picker (month grid, click-to-select)
      destinations.js           124 destinations with photos, search, popular list
```

## Wizard Steps

| Step | Title | What it collects |
|------|-------|-----------------|
| 1 | Where to? | Single destination or multi-city route (124 cities) |
| 2 | When's the adventure? | Traveler count + exact dates or flexible duration/season |
| 3 | Comfort level | Budget preset + daily amount in destination currency |
| 4 | Where will you stay? | Accommodation type, hotel star rating, priorities |
| 5 | How do you fly? | Fare class, departure time, connection preference |
| 6 | How do you travel? | Style sliders + interest chips (max 8) |
| 7 | Trip summary | Grid overview of all choices + optional extras |

### Onboarding

First-time users see a full-screen currency picker before the wizard. Selecting a home currency stores it in localStorage and is used throughout for budget conversions.

## Design

Dark lounge theme. Warm charcoal base (`#1B1A17`) with terracotta (`#D47358`) and teal (`#4A9684`) accents. See `.interface-design/system.md` for the full design system.

Key visual features:
- Glassmorphism cards with backdrop blur
- Flag-colored background gradients when selecting a destination
- Split-flap airport display animation on the landing page
- Animated progress dots in the wizard header
- Collapsible extras in the trip summary

## Destinations

124 cities across 45+ countries. Each destination includes coordinates, currency, timezone, budget ranges (USD/day), and a Wikipedia photo. Popular destinations for the grid: Tokyo, Melbourne, Guangzhou, Bali, Helsinki, London, Seoul, Zurich. Includes SE Asia holiday spots popular with Singaporeans (Genting Highlands, Cameron Highlands, Batam, Bintan, Desaru, Krabi, Koh Samui, Da Nang).

## State Management

Wizard state lives in `sessionStorage` under key `trippy_wizard_state`. All updates use immutable spread patterns. User preferences (home currency) persist in `localStorage` under `trippy_user_prefs`.

## Build

```bash
npm run build      # Production build to dist/
npm run preview    # Preview production build
```

## Phases

- **Phase 1** - Trip planning wizard (current)
- **Phase 2** - LLM-powered itinerary generation
- **Phase 3** - Trip view, day-by-day itinerary, budget tracking
