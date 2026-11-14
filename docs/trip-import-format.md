# Trippy trip import format (v1)

Dashboard, **Import trip** opens a guided import (`js/components/trip-import-modal.js`) that saves a
trip researched outside the AI wizard as a normal trip owned by the signed-in user:

1. **Gather your trip details**: what to collect from emails and notes.
2. **Turn it into a Trippy file**: a copyable AI prompt (`AI_PROMPT`) and a downloadable template
   (`TEMPLATE`, `trippy-template.json`), both in `js/services/trip-import-guide.js`.
3. **Add your trip**: paste the assistant's reply (or use Paste from clipboard), choose a `.json` or
   `.txt` file, or drop one. Problems are listed by location, with a "Copy fix request" to send back
   to the assistant.
4. **Check your trip**: a preview (dates, days, activities, flights, stays, deadlines, costs per
   currency) plus any automatic changes, then **Import trip**.

Returning users open straight at step 3. Nothing is saved before step 4.

- Parsing and validation: `js/services/trip-import.js` (`validateTripImport(raw)` returns
  `{ ok, errors, warnings, data, summary }`), with finding the JSON in `js/services/trip-import-json.js`,
  tested in `trip-import.test.js` and `trip-import-guide.test.js`. The example below is part of
  the tests, so keep it importable.
- Saving (`saveTripWithItinerary` in `js/data/trip-repository.js`) takes at most 4 requests for any
  trip length: the trip, all days in one insert, all activities in one insert, then a final update.
  It is all-or-nothing: on any failure the trip is deleted. Until the last step the trip carries
  `extras.importPending`, so an interrupted save never shows up as a trip.
- After saving, the user can **Undo import** (deletes the trip) or **Open trip**. Photos for the
  places are looked up in the background only after Open trip (or closing the success screen),
  never after Undo.
- Imported trips are marked with `wizard_state.imported = true`. **Regenerate** is hidden for them,
  because they have no AI preferences to regenerate from.
- Limits: 1 MB (bytes), 60 days, 40 activities per day, day numbers up to 366. Costs, durations
  and the daily budget must fit the database (up to 2,147,483,647); a larger one is an error.
  URLs must be http(s). Unknown keys are dropped and listed in the preview ("Ignored fields we
  don't use").
- Text pasted in step 3 is kept on the device (`localStorage` key `trippy_import_draft`) for up to
  3 days so it survives the app being reloaded while the user is in the AI app. It is cleared after
  a successful import or with **Clear**. It can contain booking references, so it is stored with
  the signed-in user's id and only offered back to that user.

## What the importer accepts

The importer is lenient, because the file usually comes from an AI chat:

- The whole chat reply: text around the JSON and ```` ```json ```` fences are fine. Two replies
  pasted together (after typing "continue" when a long reply was cut off) are joined, even when the
  first fence was never closed. A reply that is still cut off gets its own message. An odd quote or
  a missing bracket in a reply that visibly ends (a closed fence, or a final `}`) is reported as a
  formatting problem with its line instead.
- `//` and `/* */` comments, trailing commas, and curly quotes used as JSON quotes.
- `"trippy": 1` or `"1"`, or no `trippy` key at all when there is a `trip` object and a `days` list.
  A higher version is refused with "made for a newer version of Trippy".
- Syntax errors are reported with the line and column of the pasted text.

Some values are corrected and listed as warnings in the preview:

| Input | Result |
|---|---|
| `startTime` `7:30 PM`, `7pm`, `19:30:00`, `19.30` | `19:30`. Anything else that isn't a time is left blank. |
| `costAmount` `"¥7,000"`, `"S$1,700 for two"`, `12.5` | The first number, as a whole number (`7000`, `1700`, `13`). |
| A day without `date` | `startDate + (dayNumber - 1)`. A dateless day after the trip ends is an error. |
| Day numbers starting at 0 | Shifted to start at 1. A missing `dayNumber` takes the next free number. |
| No `currencyCode` | Taken from the destination when it is a known city (125 curated plus a 2,000 city catalogue), otherwise USD. `yen` and similar words are read as their code. |
| A flight leg with neither `route` nor `flightNumber` | Left out; `flights` is left out when both legs are. |
| A stay whose check-out is before check-in | Its dates are left out. |
| `bookingRef` over 40 characters | Shortened to 40. |
| `hotels`, `hotel`, `stays` / `itinerary` / `flight` / a day's `schedule`, `items`, `plan` / an activity's `name` | Read as `accommodation` / `days` / `flights` / `activities` / `title`. |
| An activity with no `title` but a `venueName` | The venue name is used as the title. |

When the destination is a known city, missing country, flag, currency, timezone, coordinates and
cover image are filled in from it.

## Example

Every key except those marked required is optional. Dates are `YYYY-MM-DD`, times are 24 hour
`HH:MM`, money is a whole number in the currency named next to it.

```jsonc
{
  "trippy": 1,                                  // format version (optional, must be 1)
  "trip": {
    "title": "Hokkaido in Winter",              // required
    "subtitle": "Snow, onsen and seafood",
    "emoji": "❄️",
    "destination": {                            // required; may also be a plain string ("Sapporo")
      "name": "Sapporo", "country": "Japan", "flag": "jp",
      "currencyCode": "JPY", "currencySymbol": "¥", "timezone": "Asia/Tokyo",
      "lat": 43.0618, "lng": 141.3545
    },
    "startDate": "2027-01-13",                  // required
    "endDate": "2027-01-15",                    // required, not before startDate
    "travelers": 2,
    "dailyBudget": 21000                        // per person per day, destination currency
  },
  "days": [                                     // required, at least one
    {
      "dayNumber": 1,                           // unique, from 1
      "date": "2027-01-13",                     // must fall within the trip
      "title": "Arrive in Sapporo", "theme": "Arrival",
      "weather": { "condition": "snow", "highC": -2, "lowC": -9 },
      "activities": [
        {
          "title": "Lamb barbecue dinner",      // required
          "timeSlot": "evening",                // morning | afternoon | evening (others are mapped)
          "startTime": "19:30",
          "venueName": "Daruma Honten", "venueAddress": "Minami 5 Nishi 4, Chuo Ward, Sapporo",
          "category": "food",                   // any CATEGORY_ICONS key in trip-detail.js
          "durationMinutes": 75,
          "costAmount": 7000, "costCurrency": "JPY", "costNote": "for two",
          "description": "Grilled lamb on a dome-shaped skillet.",
          "tips": "No reservations, queue from 18:30",
          "gettingThere": "5 minutes on foot from Susukino station",
          "bookingUrl": "https://example.com/daruma",
          "latitude": 43.0548, "longitude": 141.3530
        }
      ]
    },
    { "dayNumber": 2, "date": "2027-01-14", "title": "Jozankei day trip", "activities": [
        { "title": "Onsen afternoon", "timeSlot": "afternoon", "startTime": "13:00",
          "venueName": "Jozankei Onsen", "category": "wellness", "durationMinutes": 180,
          "costAmount": 3000, "costCurrency": "JPY" }
    ] },
    { "dayNumber": 3, "date": "2027-01-15", "title": "Fly home", "activities": [] }
  ],

  // Optional extras (shown on the trip page)
  "flights": {
    "outbound": {
      "route": "SIN > TPE > CTS", "airline": "Scoot", "flightNumber": "TR892",
      "duration": "9h 50m", "priceRange": "S$3,430 return for two", "tips": "",
      "booked": true, "bookingRef": "ABC123", "seats": "1H, 1K", "baggage": "30kg each",
      "depart": "Wed 13 Jan 06:10", "arrive": "Wed 13 Jan 17:00",
      "manageUrl": "https://example.com/manage-booking"
    },
    "inbound": {
      "route": "CTS > TPE > SIN", "airline": "Scoot", "flightNumber": "TR893",
      "booked": true, "bookingRef": "ABC123",
      "depart": "Fri 15 Jan 18:40", "arrive": "Sat 16 Jan 01:20"
    }
  },
  "accommodation": [
    { "name": "Example Hotel Susukino", "area": "Susukino", "type": "Hotel", "city": "Sapporo",
      "address": "Minami 4 Nishi 4, Chuo Ward, Sapporo",     // max 300 characters
      "priceRange": "¥20,000 per night", "highlights": "Next to the station, breakfast included",
      "badge": "Recommended", "checkIn": "2027-01-13", "checkOut": "2027-01-15",
      "booked": true, "bookingRef": "HX55821",                 // max 40 characters
      "url": "https://example.com/hotel" }
  ],
  "bookingChecklist": [
    { "group": "Must Book Ahead",
      "items": [ { "label": "Jozankei onsen day pass", "by": "2026-12-20", "day": 2,
                   "note": "Sells out on weekends", "url": "https://example.com/onsen" } ] }
  ],
  "savingsTips": [
    { "icon": "💡", "title": "Buy a day bus pass", "description": "Covers the Jozankei bus both ways.",
      "estimatedSaving": "¥800 each" }
  ]
}
```

## Rendering of the extra fields

| Field | Where it shows |
|---|---|
| `flights.*.booked` / `bookingRef` | A **Booked** badge with the reference. Seats, baggage and times are listed, and the Skyscanner and Google Flights search links are replaced by **Manage booking**. |
| `accommodation[].checkIn/checkOut` | A "13 Jan to 15 Jan (2 nights)" line. The hotel search links use these dates instead of the whole trip's. |
| `accommodation[].booked` / `bookingRef` / `address` | "Booked, ref HX55821" and the address. A booked stay shows only its own link (`url`) instead of the search links. |
| `accommodation[].url` | Replaces the "Direct" Google search link. |
| `bookingChecklist[].items[].by` | A **Book by** date, coloured by urgency (overdue, due within 14 days, later). Items are sorted earliest first. |

Privacy: the public shared-trip view (`shared-trip.js`) must never render `bookingRef` (flights or
stays) or `manageUrl`. Rendering is not the whole story: until the `get_shared_trip` RPC from
migration 020 is applied, the row-level security policy for shared trips lets a client read the
whole `trips` row through the API, `extras` included. Treat booking references in imported files as
visible to anyone holding a share link until then.
