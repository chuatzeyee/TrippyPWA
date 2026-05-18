# Trippy Design System

## Direction

**Dark Lounge** - Warm charcoal base with warmth coming from colored surfaces, not the background. Premium travel magazine read at night. Intimate, cozy, not cold or clinical.

Inspired by Tubik Studio editorial dark UI, interpreted softer: muted gradients, gentler transitions, moody lounge not magazine spread.

## Intent

**Who:** Couple from Singapore planning trips on mobile, evenings/weekends. Excited, dreaming.
**Task:** Step through a 7-step wizard to plan a trip - destination, dates, budget, flights, style.
**Feel:** Like planning your trip in a beautiful dark lounge. Warm ambient light, intimate, premium but relaxed.

## Foundation

| Token | Value | Why |
|-------|-------|-----|
| `--parchment` | `#1B1A17` | Warm charcoal, not cold black. The base canvas. |
| `--surface` | `rgba(40, 38, 32, 0.85)` | Glass surfaces, barely visible lift. |
| `--surface-solid` | `#252320` | Cards and elevated panels. Same warm hue, lighter. |
| `--surface-inset` | `#1E1D1A` | Inputs - darker than surroundings, recessed feel. |
| `--ink` | `#E5E1D8` | Primary text. Warm cream, not blue-white. |
| `--ink-secondary` | `#9A9488` | Supporting text. Warm muted. |
| `--ink-ghost` | `#6A6459` | Metadata, placeholders. Very subdued. |
| `--border` | `rgba(229, 225, 216, 0.08)` | Whisper-quiet. Disappear when not looking. |
| `--border-strong` | `rgba(229, 225, 216, 0.15)` | Input borders, stronger separation. |

## Accents

| Token | Value | Role |
|-------|-------|------|
| `--terracotta` | `#D47358` | Primary accent. Selections, CTA buttons, active states. |
| `--terracotta-hover` | `#C0654C` | Hover state for primary. |
| `--terracotta-light` | `rgba(212, 115, 88, 0.16)` | Selected card backgrounds, date range fill. |
| `--teal` | `#4A9684` | Secondary accent. Links, today marker, success. |
| `--teal-light` | `rgba(74, 150, 132, 0.14)` | Date preview background. |
| `--amber` | `#D09A48` | Highlights, data emphasis, warnings. |
| `--sage` | `#5FA072` | Progress done state, success. |

## Depth Strategy

**Subtle shadows on dark.** Borders are the primary structure. Shadows lean on darkness, not color.

- Cards: 1px border at 8% opacity. No shadow by default. Shadow on hover (`--shadow-md`).
- Active/selected cards: Terracotta border (2px solid) + terracotta-light background tint.
- Dropdowns: `--shadow-md` + border. One level above parent.
- Inputs: Darker than surface (inset), `--border-strong` for definition.

## Typography

| Level | Font | Weight | Size | Use |
|-------|------|--------|------|-----|
| Hero | DM Serif Display | 400 | 2rem | Step titles, big numbers |
| H1 | DM Serif Display | 400 | 1.5rem | Page headings |
| H2 | DM Serif Display | 400 | 1.25rem | Section headings |
| H3 | Figtree | 600 | 1.125rem | Subsection headings |
| Body | Figtree | 400 | 1rem | Default text |
| Small | Figtree | 500 | 0.875rem | Labels, card text |
| Caption | Figtree | 400 | 0.75rem | Metadata, hints |
| Mono | JetBrains Mono | 400/600 | - | Costs, times, data |

DM Serif Display for headings anchors the editorial feel. Warm serif on dark = travel journal at night.

## Spacing

4px base unit. Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

## Radius

| Token | Value | Use |
|-------|-------|-----|
| `--r-sm` | 4px | Small elements |
| `--r-md` | 8px | Buttons, calendar cells |
| `--r-lg` | 14px | Cards, dropdowns, inputs (textarea) |
| `--r-xl` | 20px | Hero cards, steppers, date mode cards |
| `--r-pill` | 9999px | Inputs, pill buttons, chips |

Slightly softer than standard - rounder corners match the lounge mood.

## Component Patterns

### Destination Card
- Photo background with `linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.6))` overlay
- White text label at bottom-left, emoji at top-right
- 2px transparent border, terracotta on selected
- `height: 180px`, `border-radius: var(--r-lg)`
- Hover: `scale(1.03)`

### Budget Stepper
- Dark surface card with `--border` border, `--r-xl` radius
- Large hero number in `--ink` (destination currency)
- "per day" label in `--ink-secondary`
- Home currency subtitle in `--ink-ghost` (`.budget-stepper-home`)
- Circular +/- buttons: 48px, border, hover terracotta tint
- Hold-to-repeat on pointer hold

### Calendar
- Dark surface with border, `--r-xl` radius
- 7-column grid, aspect-ratio 1:1 cells
- Start/end dates: terracotta background, white text
- Range between: `--terracotta-light` background, no border-radius
- Today: teal text, bold
- Past dates: ghost color, 40% opacity, no pointer

### Traveler Stepper
- Same structure as budget stepper but smaller (80px min-width center)
- Hero-sized count number, caption label below

### Onboarding Overlay
- Full-screen on `--parchment` with centered content
- 3-column currency grid (2 on mobile)
- Currency cards: dark surface, subtle border, hover lifts with terracotta border
- Symbol in `--text-h2`, code in caption weight 600

### Progress Dots
- 10px circles, `border-radius: 50%`
- Done: `--sage` background
- Active: `--terracotta` background, `scale(1.3)`, terracotta glow shadow
- Future: `--border` background

### CTA Button
- `btn--primary`: terracotta background, white text
- `btn--lg btn--pill`: 48px height, full pill radius
- Max-width 320px, centered in scroll area (not fixed footer)

### Accommodation Cards
- Same pattern as fare cards: icon, title, description, vibe text
- 3-column grid (2 on mobile), `--r-xl` radius
- Top 3px accent bar: transparent default, terracotta when active
- Vibe text in `--teal`, hidden by default, slides in on hover/active
- Types: Hostel, Airbnb, Hotel, Resort, Villa, Boutique

### Hotel Star Rating
- 3 buttons (3-star, 4-star, 5-star), flex row with equal widths
- Star icons in `--ink-ghost`, turn `--amber` when active
- Active state: amber border + amber-tinted background
- Only visible when accommodation type is "hotel"

### Accommodation Priorities
- Chip-based multi-select using `.chip` base class
- Options: Central location, Fast WiFi, Kitchen, Pool, Gym, Quiet area, In-unit washer & dryer
- Same chip styling as interest chips (step 6)

### Multi-City Toggle
- Two pill buttons: "One city" / "Multiple cities"
- Uses `.chip` with `--active` variant
- When multi-city: destination cards add to a tag list instead of single selection
- Tags: pill-shaped with flag icon, name, and "x" remove button
- Terracotta-tinted background with terracotta border

### Flag Background
- Full-screen radial gradient overlay on step 1 when a destination is selected
- Colors sourced from `FLAG_COLORS` map (40+ country codes)
- White/near-white colors filtered out to prevent washout
- Positioned at varied radial positions for organic feel
- 0.3 opacity with 0.8s ease-out fade transition
- GPU-composited: `will-change: opacity`, `transform: translateZ(0)`, `backface-visibility: hidden`
- Clears when navigating away from step 1

### Summary Grid (Step 7)
- 3-column CSS grid, 2 columns at 360px breakpoint
- Tiles: glass cards (`rgba(37,35,32,0.6)` + backdrop blur), centered content
- Wide tiles span all 3 columns (Destination, Interests)
- Each tile: emoji icon, uppercase label (`--ink-ghost`), bold value (`--ink`), optional sub-text
- Layout: Destination (wide) | Dates + Travelers + Budget | Stay + Flight + Pace | Interests (wide)
- Dates use short format (d MMM) with year as sub-line
- Pace tile maps slider value to words: Chill/Easy/Balanced/Active/Packed

### Summary Extras
- Collapsible sections below the grid for optional fields
- Toggle button: full-width, emoji + label on left, circular +/- on right
- Field hidden by default, revealed on click with focus
- Three extras: Must-do activities, Dietary needs, Things to avoid
- Pre-filled values auto-expand their section

### Footer Pills
- Sticky bottom bar with summary of all wizard choices
- Glass background with top border
- Pill badges: flag + city, dates (short format), budget/day, accommodation, interests, traveler count
- Divider lines between groups
- Slides up on first appearance (footerSlideUp animation)

### Landing Page
- Empty state: animated background orbs + floating emoji icons
- Split-flap display: "Your [next] adventure" with airport departure board letter-flip animation
- City thumbnails at bottom, hovering flips "next" to city name
- Click thumbnail to jump directly to wizard step 2 with destination pre-filled

### Date Formatting
- `formatDate(dateStr)`: "d MMM yyyy" (e.g. "15 Jun 2026") - used in footer pills
- `formatDateShort(dateStr)`: "d MMM" (e.g. "15 Jun") - used in summary tiles and footer

## Constraints

- No emdashes anywhere
- No pure white (#FFFFFF) for text - use `--ink` (cream)
- #FFFFFF only for text ON terracotta/teal buttons and calendar selections
- All borders rgba, never solid hex
- Dark mode is the only mode (no light/dark toggle)
- No Indian/Pakistani cities in destination list
- Use `outline` instead of `border` on destination cards to prevent background-color bleed
- GPU-promote elements that overlap animated backgrounds to prevent compositing glitches
