# Trippy trip import format (v1)

Dashboard → **Import trip** loads a JSON file and saves it as a normal trip owned by the
signed-in user. Use it for trips researched outside the AI wizard.

- Validation and sanitising: `js/services/trip-import.js`, tested in `trip-import.test.js`.
- Saving is all-or-nothing (`saveTripWithItinerary`): if any day fails, the trip is rolled back.
- Imported trips are marked with `wizard_state.imported = true`. **Regenerate** is hidden for them,
  because they have no AI preferences to regenerate from.
- Limits: 1 MB, 60 days, 40 activities per day. Unknown keys are dropped. URLs must be http(s).

```jsonc
{
  "trippy": 1,                                  // required, format version
  "trip": {
    "title": "Hokkaido in Winter",              // required
    "subtitle": "optional one-liner",
    "emoji": "❄️",
    "destination": {                            // required; may also be a plain string ("Sapporo")
      "name": "Sapporo", "country": "Japan", "flag": "jp",
      "currencyCode": "JPY", "currencySymbol": "¥", "timezone": "Asia/Tokyo",
      "lat": 43.06, "lng": 141.35
    },
    "startDate": "2027-01-13",                  // required, YYYY-MM-DD
    "endDate": "2027-01-26",                    // required, not before startDate
    "travelers": 2,
    "dailyBudget": 21000                        // per person per day, destination currency
  },
  "days": [                                     // required, at least one
    {
      "dayNumber": 1,                           // unique
      "date": "2027-01-13",                     // optional, must fall within the trip
      "title": "Arrive", "theme": "Arrival",
      "weather": { "condition": "snow", "highC": -2, "lowC": -9 },
      "activities": [
        {
          "title": "Jingisukan at Daruma",      // required
          "timeSlot": "evening",                // morning | afternoon | evening (others are mapped)
          "startTime": "19:30",
          "venueName": "Daruma", "venueAddress": "",
          "category": "food",                   // any CATEGORY_ICONS key in trip-detail.js
          "durationMinutes": 75,
          "costAmount": 7000, "costCurrency": "JPY", "costNote": "for two",
          "description": "", "tips": "", "gettingThere": "",
          "bookingUrl": "https://…", "latitude": null, "longitude": null
        }
      ]
    }
  ],

  // Optional extras (same shapes the AI produces, plus the "booked" fields below)
  "flights": {
    "outbound": {
      "route": "SIN → TPE → CTS", "airline": "Scoot", "flightNumber": "TR892",
      "duration": "9h 50m", "priceRange": "S$3,430 return for two", "tips": "",
      "booked": true, "bookingRef": "ABC123", "seats": "1H, 1K", "baggage": "30kg each",
      "depart": "Wed 13 Jan 06:10", "arrive": "17:00", "manageUrl": "https://…"
    },
    "inbound": { "…": "same shape" }
  },
  "accommodation": [
    { "name": "Hotel", "area": "Susukino", "type": "Hotel", "city": "Sapporo",
      "priceRange": "~¥20k / night", "highlights": "Short, comma-separated features",
      "badge": "Recommended", "checkIn": "2027-01-13", "checkOut": "2027-01-17",
      "booked": false, "url": "https://official-site…" }
  ],
  "bookingChecklist": [
    { "group": "Must Book Ahead",
      "items": [ { "label": "Ryokan", "by": "2026-11-21", "day": 5, "note": "", "url": "https://…" } ] }
  ],
  "savingsTips": [ { "icon": "💡", "title": "…", "description": "…", "estimatedSaving": "…" } ]
}
```

## Rendering of the new fields

| Field | Where it shows |
|---|---|
| `flights.*.booked` / `bookingRef` | A **Booked · REF** badge. Seats, baggage and times are listed, and the Skyscanner/Google Flights search links are replaced by **Manage booking**. |
| `accommodation[].checkIn/checkOut` | A "13 Jan → 17 Jan · 4 nights" line. The hotel search links use these dates instead of the whole trip's. |
| `accommodation[].url` | Replaces the "Direct" Google search link. |
| `bookingChecklist[].items[].by` | A **Book by …** label, coloured by urgency (overdue / due within 14 days / later). Items are sorted earliest first. |

Privacy: the public shared-trip view (`shared-trip.js`) does not render flights or the booking checklist, so `bookingRef` and `manageUrl` are not exposed through share links. Keep it that way: if flights are ever added to the shared view, omit those two fields.
