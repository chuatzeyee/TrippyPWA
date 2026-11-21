// The shared models and the view contract (blueprint sections 2 and 3). Types only: this file has no
// runtime code. Steward: F0. A field is added or renamed here first, at a gate, and nowhere else.
//
// Units: dates are 'YYYY-MM-DD' strings, temperatures are stored in Celsius, money amounts are whole units
// of the stated ISO code, distances are kilometres, times are display strings already run through the
// clock formatter. Every string a model carries is raw text: renderers escape at the point of use.

// ---------------------------------------------------------------------------------------------------
// 2.1 Building blocks
// ---------------------------------------------------------------------------------------------------

/** @typedef {'departures'|'concierge'|'atlas'} ViewId */

/**
 * @typedef {Object} Money
 * @property {number} amount  whole units of `code`
 * @property {string} code    ISO 4217, upper case
 * @property {string} text    "S$1,090" or "HKD 6,347" (the ISO code replaces a symbol that is ambiguous)
 */

/**
 * @typedef {Object} CostEstimate   Activities only. Never flights or stays (those are free-text price ranges).
 * @property {'perPerson'} basis    the one basis every figure is on; views print "per person"
 * @property {Money|null} local     sum of activities.cost_amount in the trip currency; null when the sum is 0
 * @property {Money|null} home      `local` in the home currency; null when the two match, when either has no rate,
 *                                  or when no home currency is set
 * @property {boolean} homeFirst    prefs.homeCurrencyFirst and `home` is not null
 * @property {number} excluded      activities left out because their own currency has no rate
 * @property {Money|null} budget    budget_daily x day count, per person; a separate labelled number
 * @property {Money|null} budgetHome  `budget` in the home currency, same rules as `home`
 */

/**
 * @typedef {Object} CoverModel
 * @property {'v2'|'legacy'|'none'} kind
 * @property {string} src            '' when kind is 'none'
 * @property {string} srcset         '' when there is only one width
 * @property {string} fallbackSrc    original URL to fall back to when a wider render is refused, else ''
 * @property {number} focusY         0 to 100, vertical crop position; 38 or 50 by default
 * @property {{ chip: string, full: string, link: string }|null} credit
 *           chip is the short source only ("Pexels", "Wikimedia Commons"); full is the whole credit line
 */

/**
 * @typedef {Object} TypicalWeather   From the seasonal guess stored at planning time. This is not a forecast.
 * @property {number} lowC
 * @property {number} highC
 * @property {string} range          "16 to 23°C" or "61 to 73°F" per prefs.temperatureUnit
 * @property {string} condition      "Clear" or "Pt. Cloudy": a label weatherLabel() returns; '' when unknown
 * @property {string} season         "typical for late February"
 */

/**
 * @typedef {Object} StopLine
 * @property {string|null} time      "2:30 PM" or "14:30"; null when the activity has no start time
 * @property {string} title
 * @property {string|null} venue
 */

/**
 * @typedef {Object} RouteLine
 * @property {'flight'|'ground'|'multi'|'home'|'none'} kind
 * @property {'plane'|'train'|'bus'|'ferry'|'car'|'taxi'} mode   every stored transport mode
 * @property {{ code: string|null, label: string, note: string }} from   code is an IATA code only when the stored
 * @property {{ code: string|null, label: string, note: string }} to     route has one; else the city name stands in
 * @property {string} detail         "4h 00m, suggested", "Coach, about 4h", "3 cities, via Bergen"
 * @property {boolean} booked
 * @property {{ depart: string, arrive: string }|null} times   only from leg.depart and leg.arrive. Never parsed from tips.
 */

// ---------------------------------------------------------------------------------------------------
// 2.2 Readiness
// ---------------------------------------------------------------------------------------------------

/**
 * @typedef {Object} ReadinessItem
 * @property {'travel'|'stay'|'entry'|'reservations'} area
 * @property {'flights'|'transport'|'accommodation'|'entry'|'checklist'} target   the data-section it opens
 * @property {string} label          "Flights", "Transport", "Stay", "Entry requirements", "Reservations"
 * @property {'done'|'todo'|'checking'} state
 * @property {string} status         "Not booked yet", "Not arranged yet", "Booked", "1 of 3 stays booked",
 *                                   "Nothing to file", "Could not check", "2 to book"
 * @property {string} detail         one sentence built from stored fields
 * @property {string} actionLabel    "See flights", "See transport", "See stays", "Compare stays" (open stay options to
 *                                   choose from), "See the details", "Add passport", "Open the checklist"
 * @property {'data'|'device'} source   'device' when a tick on this device decided the state
 * @property {string|null} tickKey   the trip-quick key the Prep card's checkbox writes for this area, or null when
 *                                   the row has no such checkbox: entry, and a part-booked travel or stay row
 *                                   ("1 of 2 legs booked", "1 of 3 stays booked"), which a tick cannot settle
 * @property {{ by: string, text: string, state: 'overdue'|'soon'|'later' }|null} due   real dates only
 */

/**
 * @typedef {Object} Readiness
 * @property {ReadinessItem[]} items   applicable areas only, fixed order travel, stay, entry, reservations
 * @property {number} done
 * @property {number} total            applicable areas, 1 to 4 (a Readiness with total 0 is never built)
 * @property {number} todo             areas in state 'todo' only
 * @property {number} pending          areas in state 'checking'; not counted as to do, not shown in a chip number
 * @property {string} headline         "1 of 4 ready", or "Ready" when done equals total
 * @property {boolean} perDevice       true when any state depends on ticks; views must then show the device note
 * @property {boolean} collapsed       true while the trip is live (shown as one line)
 */

// ---------------------------------------------------------------------------------------------------
// 2.3 Dashboard
// ---------------------------------------------------------------------------------------------------

/**
 * @typedef {Object} TripCardModel
 * @property {string} id
 * @property {string} title            multi-city: "A, B & C" from wizard destinations, else trips.title
 * @property {string} href             "#/trip/<id>": the neutral link (stretched card link, deep links)
 * @property {string} wholeHref        "#/trip/<id>?today=0": every control that says "whole trip"
 * @property {string|null} todayHref   "#/trip/<id>?today=1" when live
 * @property {'generating'|'failed'|'live'|'upcoming'|'past'|'undated'} phase
 * @property {{ start: string|null, end: string|null, text: string, dayCount: number, nights: number,
 *              itineraryDays: number }} dates
 *           dayCount is the inclusive date span when both dates exist, else itineraryDays
 * @property {number|null} daysToGo    upcoming only, whole days from the device's date to the start date
 * @property {number|null} dayNumber   live only, clamped to 1..dates.dayCount
 * @property {number|null} daysLeft    live only
 * @property {Array<{ name: string, country: string, flag: string, lat: number|null, lng: number|null, timezone: string|null }>} places
 * @property {string[]} flags          unique, lower case, two-letter codes only (an empty or invalid flag is dropped)
 * @property {number|null} travellers
 * @property {CoverModel} cover
 * @property {CostEstimate} cost
 * @property {boolean} shared
 * @property {'viewer'|'editor'|null} role
 * @property {boolean} imported
 * @property {boolean} savedOffline    a full copy is on this device
 * @property {Readiness|null} readiness        null without briefing data and when readiness() returns null
 * @property {TypicalWeather|null} weather     null without briefing data
 * @property {boolean} briefingPending  true while this plan is in briefingIds and its briefing has not arrived,
 *           and also while a live plan's saved briefing has no stops row for today (the stops are then not
 *           known, which is not "nothing more is planned"); in that second case readiness and weather are
 *           non-null on the same card. The card then carries data-briefing="pending" and reserves the height
 *           of its next-stop block or readiness chip (blueprint 3.3). Added by F0: the hook cannot be told
 *           apart from "no briefing applies" with the revision 2 fields alone.
 * @property {{ daysDone: number|null, daysTotal: number|null, etaMinutes: number|null, slow: boolean, error: string }|null} generation
 * @property {string} monthKey         "2026-10" from the start date, '' when undated
 */

/**
 * @typedef {Object} LiveBriefing
 * @property {TripCardModel} trip
 * @property {boolean} isLead
 * @property {string} timezone         the zone the card's clock and "today" use (tripZone)
 * @property {number} dayNumber
 * @property {number} dayCount
 * @property {number} daysLeft
 * @property {string} endText          "Sat 21 Nov"
 * @property {{ dateText: string, title: string, weather: TypicalWeather|null }|null} today
 * @property {StopLine|null} nextStop
 * @property {StopLine[]} laterToday   at most 3
 * @property {StopLine|null} tonight   the last stop today from 5 PM on, when it is not nextStop
 * @property {number} remainingToday
 * @property {{ dayNumber: number, dateText: string, title: string, weather: TypicalWeather|null }|null} tomorrow
 */

/**
 * @typedef {Object} NextDeparture
 * @property {TripCardModel} trip
 * @property {number} daysToGo
 * @property {RouteLine} route
 * @property {string} departText       "Tue 1 Dec 2026"
 * @property {string} returnText
 * @property {string} lengthText       "12 days, 11 nights"
 * @property {ReadinessItem[]} todo    items in state 'todo', at most 3
 * @property {ReadinessItem[]} settled items in state 'done'
 */

/**
 * @typedef {Object} TravelStats
 * @property {number} trips            plans that are not generating or failed
 * @property {number} countries        named countries only (an unresolved custom place adds none)
 * @property {number} cities
 * @property {number} daysPlanned      sum of dates.itineraryDays ("240 days planned")
 * @property {number} calendarDays     union of date ranges, overlaps counted once
 * @property {Money|null} spendHome    activity estimates in the home currency; null without a home currency
 * @property {number} spendUnconverted plans left out of spendHome for lack of a rate
 * @property {{ country: string, flag: string, trips: number }|null} mostPlanned
 * @property {{ title: string, days: number }|null} longest
 * @property {Array<{ flag: string, code3: string|null, country: string, trips: number,
 *                    phase: 'past'|'live'|'upcoming', firstDate: string, isHome: boolean }>} byCountry
 *           code3 from js/lib/country-codes.js; null prints the country name alone
 * @property {Array<{ key: string, label: string, days: number, phase: 'past'|'now'|'future' }>} byMonth
 * @property {{ north: { name: string, lat: number }|null, south: { name: string, lat: number }|null,
 *              farthest: { name: string, km: number }|null }} extremes
 * @property {string|null} firstDate
 * @property {string|null} lastDate
 */

/**
 * @typedef {Object} MapPin            shaped so the Atlas place card and labels need no lookup
 * @property {[number, number]} at     [lat, lng]
 * @property {'live'|'up'|'past'|'home'} kind   the most current phase among the plans at this place
 * @property {string} place            city name
 * @property {string} country
 * @property {string} label            "Tromsø, 2 plans" or "Singapore, home"
 * @property {string[]} tripIds        every plan that names this place, most current first; [] for the home pin
 * @property {number} count            tripIds.length
 * @property {string} href             the first plan's href, or '' for the home pin
 * @property {string|null} todayHref   when the first plan is live
 */

/**
 * @typedef {Object} DashboardModel
 * @property {'ready'|'empty'|'error'} state
 * @property {{ savedAt: string|null }|null} stale       the list came from this device's cache
 * @property {{ iso: string, dateText: string, partOfDay: 'morning'|'afternoon'|'evening' }} now
 * @property {{ firstName: string, homeCity: string, homeFlag: string, homeTimezone: string|null,
 *              homeCurrency: { code: string, symbol: string }|null }} user
 *           homeTimezone is the catalogue timezone of the home city, else null (then no home clock is drawn)
 * @property {LiveBriefing[]} live                       lead first; can hold two or more
 * @property {NextDeparture|null} next
 * @property {{ inProgress: TripCardModel[], live: TripCardModel[], upcoming: TripCardModel[],
 *              past: TripCardModel[], undated: TripCardModel[] }} sections
 * @property {Array<{ key: string, label: string, trips: TripCardModel[] }>} pastByMonth   newest first
 * @property {Object<string, TripCardModel>} cardsById   every card, for pins and place cards
 * @property {{ all: number, live: number, upcoming: number, past: number, shared: number }} counts
 * @property {{ q: string, active: 'all'|'live'|'upcoming'|'past'|'shared', expanded: boolean,
 *              options: Array<{ key: string, label: string, count: number }> }} filter
 *           expanded is true while a query or a filter other than 'all' is active: views then render every
 *           month group open and every past row, so a match is never hidden in a collapsed group
 * @property {TravelStats} stats
 * @property {Array<{ name: string, country: string, flag: string, km: number, cover: CoverModel, note: string }>} hops
 * @property {MapPin[]} pins
 * @property {Array<{ label: string, full: string, link: string }>} credits   one entry per photo drawn, thumbnails included
 */

// ---------------------------------------------------------------------------------------------------
// 2.4 Trip page
// ---------------------------------------------------------------------------------------------------

/**
 * @typedef {Object} GlanceFact
 * @property {'ready'|'stops'|'cost'|'weather'|'pace'|'stay'|'length'|'travellers'} key
 * @property {string} label           "Ready", "Stops", "Estimated cost", "Typical weather", "Pace", "Stay"
 * @property {string} value           "1 of 4", "61", "about S$1,090", "16 to 23°C", "Relaxed", "4-star hotel"
 * @property {string} note            "3 things left", "about 6 a day", "per person, activities only. HKD 6,347"
 * @property {string} jump            '' or a section or tab target the fact links to
 */

/**
 * @typedef {Object} DayIndexRow
 * @property {number} index           0-based; equals the day card's data-day-index
 * @property {number} dayNumber
 * @property {string} date
 * @property {string} dateText        "Sat 27 Feb"
 * @property {string} title
 * @property {string} theme           the stored one-sentence theme, '' when missing
 * @property {number} stops
 * @property {CostEstimate} cost
 * @property {{ range: string, condition: string }|null} weather
 * @property {number} colorIndex      1 to 7, the --day-N token
 * @property {{ src: string, alt: string }|null} thumb   first stored activity photo of the day;
 *                                    null when there is none and whenever prefs.showVenuePhotos is false
 * @property {Array<{ src: string, alt: string }>} photos   up to four for the day-card block; [] when the pref is off
 * @property {string|null} firstTime
 * @property {string|null} lastTime
 * @property {boolean} isToday
 */

/**
 * @typedef {Object} MapPoint
 * @property {number} lat
 * @property {number} lng
 * @property {number} dayNumber
 * @property {number} dayIndex
 * @property {number} order           1-based position within the day
 * @property {string} title
 * @property {number} colorIndex
 */

/**
 * The panel beside the stops of one open day (TripLandingParts.dayAside). About that day only.
 * @typedef {Object} DayAsideModel
 * @property {number} index           the day card's data-day-index
 * @property {number} dayNumber
 * @property {number} colorIndex      1 to 7, the --day-N token
 * @property {{ points: MapPoint[], placed: number, total: number }|null} map   the stops of the day that can be
 *                                    placed (MapPoint.order is the stop's number in the day); null when none can
 * @property {number} stops           at least 1: a day without stops has no panel
 * @property {string|null} firstTime  as on the day's DayIndexRow, like cost and weather
 * @property {string|null} lastTime
 * @property {CostEstimate|null} cost
 * @property {{ range: string, condition: string }|null} weather
 * @property {string[]} areas         the areas of the day in the order its stops reach them, each once
 * @property {Array<{ label: string, booked: boolean }>} book   checklist items for this day, with this device's ticks
 * @property {Array<{ id: string, at: number, number: number, time: string, title: string }>} list   every stop in
 *                                    the order of the day: the activity id ('' when the row has none), its
 *                                    0-based position, its number, its clock time ('' when it has none)
 */

/**
 * @typedef {Object} TripAction
 * @property {'share'|'pdf'|'edit'|'read-view'|'regenerate'|'delete'} key
 * @property {string} label           "Share", "Export PDF", "Edit trip", "Reader view", "Regenerate trip", "Delete trip"
 * @property {string} hint            one line for the More menu
 * @property {string} href            only for read-view: "#/trip/<id>/read"
 * @property {boolean} danger
 */

/**
 * @typedef {Object} TripOverviewModel
 * @property {string} id
 * @property {string} title
 * @property {string} placeLine       "Sapporo, Japan" when the title is not the place name, else ''
 * @property {string[]} flags
 * @property {'ok'|'generating'|'failed'|'empty'} status
 * @property {'upcoming'|'live'|'past'|'undated'} phase
 * @property {string} statusText      "In 100 days", "Tomorrow", "Day 3 of 10", "Past plan", "No dates yet",
 *                                    "Planning stopped" when status is failed
 * @property {number|null} daysToGo
 * @property {{ dayNumber: number, dayCount: number, dayIndex: number|null,
 *              today: { title: string, nextStop: StopLine|null, laterToday: StopLine[],
 *                       tonight: StopLine|null, remainingToday: number }|null }|null} live
 *           today.laterToday is every stop after the next one (no maximum here); today.tonight and
 *           today.remainingToday are the dashboard card's values for the same moment (TodayBriefing)
 *           dayIndex is the row whose date equals the trip-local today, else the row with day_number equal to
 *           dayNumber, else null (imported days can have no dates)
 * @property {{ start: string|null, end: string|null, text: string, dayCount: number, nights: number,
 *              itineraryDays: number }} dates
 * @property {number|null} travellers
 * @property {CoverModel} cover
 * @property {RouteLine} route
 * @property {GlanceFact[]} glance
 * @property {Readiness|null} readiness          null for a past plan, for a plan that is generating, failed or
 *                                    empty, and when no area applies
 * @property {DayIndexRow[]} days
 * @property {{ points: MapPoint[], dayCount: number }} map   points is empty when nothing can be placed
 * @property {{ pace: string, interests: string[], areaCount: number, firstArea: string, lastArea: string }} brief
 * @property {CostEstimate} cost
 * @property {Array<{ name: string, photo: string, stops: number }>} areas   from extras.towns; photo is '' when
 *                                    prefs.showVenuePhotos is false
 * @property {{ shown: Array<{ title: string, text: string, saving: string }>, total: number }} tips
 * @property {TripAction[]} actions              already filtered by role, trip type and status
 * @property {'owner'|'editor'|'viewer'} role
 * @property {boolean} imported
 * @property {{ savedAt: string|null }|null} offline
 * @property {Array<{ label: string, full: string, link: string }>} credits   the cover and every thumbnail drawn
 */

// ---------------------------------------------------------------------------------------------------
// 2.5 Prefs
// ---------------------------------------------------------------------------------------------------

/**
 * @typedef {Object} Prefs                    the values the app reads
 * @property {ViewId} view                    default 'atlas'
 * @property {boolean} viewChooserSeen        default false
 * @property {'dark'|'light'|'system'} theme  default 'system'
 * @property {'system'|'reduce'} motion       default 'system'
 * @property {'12h'|'24h'} timeFormat         default '12h'
 * @property {'C'|'F'} temperatureUnit        default 'C'
 * @property {boolean} homeCurrencyFirst      default true
 * @property {boolean} openTodayFirst         default true
 * @property {boolean} autoOpenNextDay        default true
 * @property {boolean} showVenuePhotos        default true
 */

/**
 * @typedef {Object} PrefsEnvelope            what is stored, on the device and in profiles.prefs
 * @property {1} v
 * @property {Object<string, *>} values       known keys validated; keys this build does not know are carried
 *                                            through untouched and written back as they came
 * @property {Object<string, string>} at      ISO time of the last explicit choice, per key. A key with no entry
 *                                            was never chosen on purpose (a default, or a migrated legacy theme).
 */

// ---------------------------------------------------------------------------------------------------
// 3.1 The view contract
// ---------------------------------------------------------------------------------------------------

/**
 * @typedef {Object} ViewCtx
 * @property {Prefs} prefs                    frozen copy
 * @property {'dark'|'light'} theme           the effective theme
 * @property {boolean} reducedMotion
 * @property {boolean} animate                true on a first render only. False on a silent refresh, on a view
 *                                            switch and for every region patch: no entry motion, no flap run,
 *                                            no image fade. photo-frame.js and flap.js take it as an option.
 * @property {string} baseUrl                 import.meta.env.BASE_URL, for public assets
 * @property {{ notes: string }} slots        trusted HTML built by the controller that the view must place
 * @property {(fn: () => void) => void} onCleanup   register teardown for anything mount started
 * @property {(fn: (region: string, el: Element) => void) => void} onPatched
 *           called after a region was patched, so a view can re-mount behaviour it attached inside it
 */

/**
 * What renderTripLanding returns. The controller, not the view, decides the nesting (blueprint 3.1).
 * @typedef {Object} TripLandingParts
 * @property {string} bar         the top bar: one <header class="tv-bar">. It may hold an empty
 *                                <div data-tabs-slot data-slot-from="<px>"> where the tab list docks on wide screens.
 * @property {string} hero        the hero with the only h1, the glance facts, ctx.slots.notes (exactly once), an actions row
 * @property {string} tabs        the one tab list, always emitted here
 * @property {string} planIntro   inside the Plan panel, above the day grid (readiness, day index, in the view's order)
 * @property {string} between     inside the day grid, after the section cards and before the day cards
 * @property {string} planOutro   inside the Plan panel, after the day grid (foot notes; not the credits)
 * @property {Array<'flights'|'transport'|'entry'|'accommodation'>} openSections   section cards to open on first render
 * @property {number} openSectionsMinWidth   viewport width in px from which openSections applies (0 for always)
 * @property {boolean} [dayAside]   optional. true: on a wide day card (about 960 px and up) the body of an open day
 *                                is two columns, the stops (about two thirds) and the day panel beside them
 *                                (js/views/shared/day-extras.js, dayAsideHtml on a DayAsideModel). The controller
 *                                builds, places and refreshes the panel; the view only skins the classes
 *                                tv-day-aside, tv-day-aside-map, tv-day-aside-facts, tv-day-aside-book and
 *                                tv-day-aside-stops. Left out or false: one column, no panel.
 *
 * Regions (blueprint 3.4). `hero-status` and `bar-actions` are in the markup from the first render, and so is
 * a `glance` region that the view draws in the hero or the bar, also while it has nothing to show: the
 * controller patches regions there and never draws the hero or the bar again whole, so a region that is
 * missing at first cannot arrive later. The region name `prep-card` belongs to the page (the Trip prep card
 * of the Prep tab, drawn by the controller): a view never emits it.
 */

/**
 * @callback RenderDashboard
 * @param {DashboardModel} model
 * @param {ViewCtx} ctx
 * @returns {string} inner HTML of the dashboard root
 */

/**
 * Optional. Called once per mounted root. Delegate from `root`; regions are patched later.
 * @callback MountDashboard
 * @param {Element} root
 * @param {DashboardModel} model
 * @param {ViewCtx} ctx
 * @returns {void}
 */

/**
 * @callback RenderTripLanding
 * @param {TripOverviewModel} model
 * @param {ViewCtx} ctx
 * @returns {TripLandingParts}
 */

/**
 * Optional. Called once per trip render with the .td-wrap element.
 * @callback MountTripLanding
 * @param {Element} root
 * @param {TripOverviewModel} model
 * @param {ViewCtx} ctx
 * @returns {void}
 */

/**
 * What js/views/<id>/view.js exports. It is the only file the registry imports: it pulls in the shared
 * styles and the view's skin, then re-exports the renderers.
 * @typedef {Object} ViewModule
 * @property {string} id                              the view id ('stub' for the frozen stub view)
 * @property {RenderDashboard} renderDashboard
 * @property {MountDashboard} [mountDashboard]
 * @property {RenderTripLanding} renderTripLanding
 * @property {MountTripLanding} [mountTripLanding]
 * @property {(model: DashboardModel, ctx: ViewCtx) => string} [renderAtlasPage]     atlas only
 * @property {(root: Element, model: DashboardModel, ctx: ViewCtx) => void} [mountAtlasPage]   atlas only
 */

export {};
