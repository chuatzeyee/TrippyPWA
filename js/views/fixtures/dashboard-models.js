// DashboardModel fixtures, one per state (blueprint 9.2 and 9.4 item 3). Invented data only: the `ready`
// fixture is also the world the published picker images are rendered from. Steward: F0.
import {
  NOW_ISO, TODAY, PLACES, CUSTOM_PLACE, NO_COVER, COMPARE, addDays, card, cost, dayText, dayYearText, grouped,
  legacyCover, money, monthLabel, readinessOf, ready, route, stop, uniqueCredits, v2Cover, weather,
} from './parts.js';

const P = PLACES;
const USER = { firstName: 'Sam', homeCity: 'Lisbon', homeFlag: 'pt', homeTimezone: 'Europe/Lisbon', homeCurrency: { code: 'EUR', symbol: '€' } };
const CODE3 = { pt: 'PRT', jp: 'JPN', es: 'ESP', ma: 'MAR', ca: 'CAN', ar: 'ARG', it: 'ITA', dk: 'DNK', za: 'ZAF', pe: 'PER', gr: 'GRC', gb: 'GBR', at: 'AUT', hu: 'HUN', ie: 'IRL', tr: 'TUR' };
const eur = (local, home, budget, budgetHome) => cost({ local, home, budget, budgetHome });

// --- The sample plans -----------------------------------------------------------------------------

const seville = card('s-seville', 'Seville and the south', [P.seville], '2027-03-04', '2027-03-13', {
  cost: cost({ local: money(640, 'EUR'), budget: money(1500, 'EUR') }), savedOffline: true,
  weather: weather(11, 22, 'Sunny', 'typical for early March'),
  readiness: readinessOf([
    ready('transport', 'done', 'Marked as booked on this device', 'Coach from Lisbon, about 6h 30m.', { source: 'device' }),
    ready('stay', 'done', 'Booked', 'Casa del Rey Moro, 9 nights.'),
    ready('reservations', 'todo', '2 to book', 'Flamenco night in Triana and the cathedral rooftop tour.', { source: 'device' }),
  ], { collapsed: true }),
});
const kyoto = card('s-kyoto', 'Kyoto with the family', [P.kyoto], '2027-03-08', '2027-03-16', {
  cover: v2Cover('kyoto-lanterns', 'Mika Tanabe'), shared: true, role: 'viewer', travellers: 4,
  cost: eur(money(96400, 'JPY'), money(590, 'EUR'), money(180000, 'JPY'), money(1100, 'EUR')),
  weather: weather(5, 14, 'Pt. Cloudy', 'typical for mid March'),
});
const marrakech = card('s-marrakech', 'Marrakech and the Atlas foothills', [P.marrakech], '2027-03-19', '2027-03-25', {
  cost: eur(money(4200, 'MAD'), money(390, 'EUR'), money(7000, 'MAD'), money(650, 'EUR')),
  weather: weather(10, 24, 'Clear', 'typical for late March'),
  readiness: readinessOf([
    ready('flights', 'todo', 'Not booked yet', 'Suggested direct flights, about 1h 35m each way.'),
    ready('stay', 'todo', 'None booked', '3 options to compare. Riad Dar Zitoun in the medina is the recommended pick.', COMPARE),
    ready('entry', 'done', 'Nothing to file', 'Portuguese passport: visa-free, up to 90 days.'),
    ready('reservations', 'todo', '2 to book', 'Hammam session and the Atlas day trip.', { source: 'device' }),
  ]),
});
const vancouver = card('s-vancouver', 'Vancouver and the coast', [P.vancouver], '2027-05-06', '2027-05-17', {
  cost: eur(money(1320, 'CAD'), money(890, 'EUR'), money(2400, 'CAD'), money(1620, 'EUR')),
  weather: weather(9, 17, 'Rain', 'typical for mid May'),
  readiness: readinessOf([
    ready('flights', 'done', 'Booked', 'Lisbon to Vancouver with one stop, booked both ways.'),
    ready('stay', 'todo', 'None booked', 'Options to compare in Vancouver and Tofino.', COMPARE),
    ready('entry', 'todo', 'Electronic travel authorisation for Canada', 'Portuguese passport: an eTA is needed before boarding.', {
      source: 'device', due: { by: '2027-04-29', text: `by ${dayText('2027-04-29')}`, state: 'later' },
    }),
  ]),
});
const buenosAires = card('s-buenos-aires', 'Buenos Aires', [P.buenosAires], '2027-09-02', '2027-09-15', {
  cost: cost({ local: money(412000, 'ARS'), budget: money(700000, 'ARS') }), travellers: 1,
  weather: weather(9, 19, 'Sunny', 'typical for early September'),
  readiness: readinessOf([
    ready('flights', 'todo', 'Not booked yet', 'Suggested flights with one stop, about 15h each way.'),
    ready('stay', 'todo', 'None booked', '3 options to compare. Casa Palermo is the recommended pick.', COMPARE),
    ready('entry', 'checking', 'Checking', ''),
  ]),
});
const rome = card('s-rome', 'Rome in November', [P.rome], '2026-11-12', '2026-11-16', { cost: cost({ local: money(410, 'EUR') }) });
const copenhagen = card('s-copenhagen', 'Copenhagen', [P.copenhagen], '2026-09-03', '2026-09-07', { cost: eur(money(3900, 'DKK'), money(520, 'EUR')) });
const capeTown = card('s-cape-town', 'Cape Town and the winelands', [P.capeTown], '2026-06-18', '2026-06-29', {
  cost: eur(money(14800, 'ZAR'), money(760, 'EUR')), itineraryDays: 11,
});
const lima = card('s-lima', 'Lima', [P.lima], '2026-02-05', '2026-02-16', { cost: eur(money(2100, 'PEN'), money(530, 'EUR')), imported: true });
const athens = card('s-athens', 'Athens long weekend', [P.athens], '2025-10-09', '2025-10-13', { cost: cost({ local: money(360, 'EUR') }) });
const edinburgh = card('s-edinburgh', 'Edinburgh in August', [P.edinburgh], '2025-08-14', '2025-08-18', { cost: eur(money(420, 'GBP'), money(490, 'EUR')) });
const vienna = card('s-vienna-budapest', 'Vienna & Budapest', [P.vienna, P.budapest], '2025-05-01', '2025-05-08', { cost: cost({ local: money(780, 'EUR') }) });

const PAST = [rome, copenhagen, capeTown, lima, athens, edinburgh, vienna];
const UPCOMING = [marrakech, vancouver, buenosAires];

const dublin = card('s-dublin', 'Dublin', [P.dublin], '2027-06-10', '2027-06-18', {
  phase: 'generating', itineraryDays: 4, generation: { daysDone: 4, daysTotal: 9, etaMinutes: 3, slow: false, error: '' },
});
const dublinNoDates = card('s-dublin', 'Dublin', [P.dublin], null, null, {
  phase: 'generating', itineraryDays: 4, generation: { daysDone: 4, daysTotal: null, etaMinutes: null, slow: true, error: '' },
});
const istanbul = card('s-istanbul', 'Istanbul', [P.istanbul], '2027-07-01', '2027-07-09', {
  phase: 'failed', itineraryDays: 6,
  generation: { daysDone: 6, daysTotal: 9, etaMinutes: null, slow: false, error: 'Planning stopped after 6 of 9 days.' },
});
const porto = (role) => card('s-porto', 'Porto weekend', [P.porto], '2027-04-02', '2027-04-05', {
  shared: true, role, cover: v2Cover('porto-ribeira', 'Rui Avelar'), cost: cost({ local: money(210, 'EUR') }),
  weather: weather(10, 18, 'Showers', 'typical for early April'),
  readiness: readinessOf([ready('stay', 'done', 'Booked', 'Casa da Ribeira, 3 nights.')], { perDevice: false }),
});
const florence = card('s-florence', 'Florence, some day', [P.florence], null, null, { itineraryDays: 5, cost: cost({ local: money(350, 'EUR') }) });
const lisbonWeek = card('s-lisbon', 'A long weekend at home', [P.lisbon], '2027-03-19', '2027-03-21', {
  cost: cost({ local: money(120, 'EUR') }), weather: weather(11, 18, 'Sunny', 'typical for late March'),
  readiness: readinessOf([ready('reservations', 'todo', '1 to book', 'Dinner at the fado house.', { source: 'device' })]),
});
const sintra = card('s-sintra', 'Sintra hills on foot', [CUSTOM_PLACE], '2026-12-05', '2026-12-06', { cover: NO_COVER });

// --- Briefings ------------------------------------------------------------------------------------

const BRIEFINGS = {
  's-seville': {
    timezone: 'Europe/Madrid',
    today: { dateText: dayText(TODAY), title: 'The Alcázar and Triana', weather: weather(12, 23, 'Sunny', 'typical for early March') },
    nextStop: stop('11:30 AM', 'Royal Alcázar gardens', 'Real Alcázar'),
    laterToday: [stop('1:30 PM', 'Lunch in Triana market', 'Mercado de Triana'), stop('4:00 PM', 'Plaza de España by bike', null), stop(null, 'Churros by the river', 'Calle Betis')],
    tonight: stop('8:30 PM', 'Flamenco night', 'Casa de la Guitarra'),
    remainingToday: 5,
    tomorrow: { dayNumber: 8, dateText: dayText(addDays(TODAY, 1)), title: 'Day trip to Córdoba', weather: weather(10, 21, 'Sunny', 'typical for early March') },
  },
  's-kyoto': {
    timezone: 'Asia/Tokyo',
    today: { dateText: dayText(TODAY), title: 'Arashiyama and the river', weather: weather(5, 13, 'Pt. Cloudy', 'typical for mid March') },
    nextStop: stop('6:30 PM', 'Dinner by the Katsura river', 'Kappo Hanare'),
    laterToday: [stop('8:00 PM', 'Evening walk in Gion', null)],
    tonight: stop('8:00 PM', 'Evening walk in Gion', null),
    remainingToday: 2,
    tomorrow: { dayNumber: 4, dateText: dayText(addDays(TODAY, 1)), title: 'Nara and the deer park', weather: null },
  },
};
const PENDING_BRIEFING = { today: null, nextStop: null, laterToday: [], tonight: null, remainingToday: 0, tomorrow: null };
const ROUTES = {
  's-marrakech': route('flight', 'plane', ['LIS', 'Lisbon'], ['RAK', 'Marrakech'], '1h 35m, suggested'),
  's-vancouver': route('flight', 'plane', ['LIS', 'Lisbon'], ['YVR', 'Vancouver'], '14h 20m with one stop', { booked: true, times: { depart: '9:40 AM', arrive: '3:05 PM' } }),
  's-lisbon': route('home', 'car', [null, 'Lisbon'], [null, 'Lisbon'], 'At home'),
  's-porto': route('ground', 'train', [null, 'Lisbon', 'Santa Apolónia'], [null, 'Porto', 'Campanhã'], 'Train, about 3h'),
};
const nameRoute = (trip) => route('none', 'plane', [null, USER.homeCity], [null, trip.places[0]?.name ?? trip.title], '');

function liveBriefing(trip, isLead) {
  const briefing = trip.briefingPending ? { timezone: trip.places[0]?.timezone ?? 'UTC', ...PENDING_BRIEFING } : BRIEFINGS[trip.id];
  return {
    trip, isLead, dayNumber: trip.dayNumber, dayCount: trip.dates.dayCount, daysLeft: trip.daysLeft,
    endText: dayText(trip.dates.end), ...briefing,
  };
}
function nextDeparture(trip) {
  const items = trip.readiness?.items ?? [];
  const { dayCount, nights } = trip.dates;
  return {
    trip, daysToGo: trip.daysToGo, route: trip.briefingPending ? nameRoute(trip) : (ROUTES[trip.id] ?? nameRoute(trip)),
    departText: dayYearText(trip.dates.start), returnText: dayYearText(trip.dates.end),
    lengthText: `${dayCount} days, ${nights} nights`,
    todo: items.filter((item) => item.state === 'todo').slice(0, 3), settled: items.filter((item) => item.state === 'done'),
  };
}

// --- Derived parts: statistics, pins, hops ----------------------------------------------------------

const RANK = { live: 0, upcoming: 1, past: 2, undated: 3 };
const byCurrency = (a, b) => RANK[a.phase] - RANK[b.phase] || (a.phase === 'past' ? b.dates.start.localeCompare(a.dates.start) : (a.dates.start ?? '').localeCompare(b.dates.start ?? ''));
const toRad = (deg) => (deg * Math.PI) / 180;
function km(a, b) {
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(h)));
}
const homePlace = (user) => Object.values(P).find((p) => p.name === user.homeCity) ?? null;

function statsFrom(cards, user) {
  const plans = cards.filter((c) => c.generation === null);
  const dated = plans.filter((c) => c.dates.start);
  const places = plans.flatMap((c) => c.places.map((place) => ({ ...place, plan: c })));
  const named = places.filter((p) => p.country && /^[a-z]{2}$/.test(p.flag));
  const days = new Set(dated.flatMap((c) => Array.from({ length: c.dates.dayCount }, (_, i) => addDays(c.dates.start, i))));
  const countries = [...new Set(named.map((p) => p.flag))].map((flag) => {
    const here = [...new Set(named.filter((p) => p.flag === flag).map((p) => p.plan))].sort(byCurrency);
    const phase = here[0].phase === 'live' ? 'live' : here[0].phase === 'past' ? 'past' : 'upcoming';
    const firstDate = here.map((c) => c.dates.start).filter(Boolean).sort()[0] ?? '';
    return { flag, code3: CODE3[flag] ?? null, country: named.find((p) => p.flag === flag).country, trips: here.length, phase, firstDate, isHome: flag === user.homeFlag };
  });
  const months = [...new Set([...days].map((day) => day.slice(0, 7)))].sort().map((key) => ({
    key, label: monthLabel(key), days: [...days].filter((day) => day.startsWith(key)).length,
    phase: key < TODAY.slice(0, 7) ? 'past' : key > TODAY.slice(0, 7) ? 'future' : 'now',
  }));
  const home = homePlace(user);
  const placed = places.filter((p) => Number.isFinite(p.lat));
  const top = (list, score) => list.reduce((best, entry) => (best === null || score(entry) > score(best) ? entry : best), null);
  const north = top(placed, (p) => p.lat);
  const south = top(placed, (p) => -p.lat);
  const far = home ? top(placed, (p) => km(home, p)) : null;
  const most = top(countries, (c) => c.trips);
  const longest = top(dated, (c) => c.dates.dayCount);
  const code = user.homeCurrency?.code ?? null;
  const inHome = (c) => c.cost.home?.amount ?? (c.cost.local?.code === code ? c.cost.local.amount : null);
  const priced = plans.filter((c) => c.cost.local);
  const starts = dated.map((c) => c.dates.start).sort();
  return {
    trips: plans.length, countries: countries.length, cities: new Set(places.map((p) => p.name)).size,
    daysPlanned: plans.reduce((sum, c) => sum + c.dates.itineraryDays, 0), calendarDays: days.size,
    // As the real model (travel-stats.js spendOf): with no plan counted into it the total is unknown (null), not zero.
    spendHome: code && priced.some((c) => inHome(c) !== null) && Math.round(priced.reduce((sum, c) => sum + (inHome(c) ?? 0), 0)) > 0
      ? { amount: priced.reduce((sum, c) => sum + (inHome(c) ?? 0), 0), code, text: `${user.homeCurrency.symbol}${grouped(priced.reduce((sum, c) => sum + (inHome(c) ?? 0), 0))}` } : null,
    spendUnconverted: code ? priced.filter((c) => inHome(c) === null).length : 0,
    mostPlanned: most ? { country: most.country, flag: most.flag, trips: most.trips } : null,
    longest: longest ? { title: longest.title, days: longest.dates.dayCount } : null,
    byCountry: countries, byMonth: months,
    extremes: {
      north: north ? { name: north.name, lat: north.lat } : null, south: south ? { name: south.name, lat: south.lat } : null,
      farthest: far ? { name: far.name, km: km(home, far) } : null,
    },
    firstDate: starts[0] ?? null, lastDate: dated.map((c) => c.dates.end ?? c.dates.start).sort().pop() ?? null,
  };
}

function pinsFrom(cards, user) {
  const plans = cards.filter((c) => c.generation === null);
  const spots = new Map();
  for (const plan of plans) {
    for (const place of plan.places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))) {
      const key = `${place.name}|${place.country}`;
      spots.set(key, { place, plans: [...(spots.get(key)?.plans ?? []), plan] });
    }
  }
  const pins = [...spots.values()].map(({ place, plans: here }) => {
    const sorted = [...here].sort(byCurrency);
    const first = sorted[0];
    return {
      at: [place.lat, place.lng], kind: first.phase === 'live' ? 'live' : first.phase === 'past' ? 'past' : 'up',
      place: place.name, country: place.country, label: sorted.length > 1 ? `${place.name}, ${sorted.length} plans` : place.name,
      tripIds: sorted.map((c) => c.id), count: sorted.length, href: first.href, todayHref: first.todayHref,
    };
  });
  const home = homePlace(user);
  const homePin = home ? [{ at: [home.lat, home.lng], kind: 'home', place: home.name, country: home.country, label: `${home.name}, home`, tripIds: [], count: 0, href: '', todayHref: null }] : [];
  return [...homePin, ...pins];
}

function hopsFrom(cards, user) {
  const home = homePlace(user);
  if (!home) return [];
  return Object.values(P).filter((p) => p !== home).map((p) => ({ p, km: km(home, p) })).filter((hop) => hop.km <= 1000)
    .sort((a, b) => a.km - b.km).slice(0, 7).map(({ p, km: far }) => {
      const plan = cards.find((c) => c.generation === null && c.dates.start && c.places.some((place) => place.name === p.name));
      return { name: p.name, country: p.country, flag: p.flag, km: far, cover: legacyCover(p), note: plan ? `Planned ${monthLabel(plan.monthKey).replace(/^(\w{3})\w*/, '$1')}` : 'New for you' };
    });
}

/** The place put forward for the next plan: one no card names first, then the nearest. */
function suggestionFrom(hops, cards, user) {
  const named = cards.flatMap((c) => c.places.map((place) => place.name));
  const hop = hops.find((one) => !named.includes(one.name)) ?? hops[0];
  if (!hop) return null;
  const isNew = !named.includes(hop.name);
  return { hop, isNew, reason: `About ${hop.km} km from ${user.homeCity}, ${isNew ? 'and new for you' : 'the nearest of your short hops'}` };
}

// --- The factory ----------------------------------------------------------------------------------

const FILTER_LABELS = { all: 'All', live: 'Now', upcoming: 'Upcoming', past: 'Past', shared: 'Shared with me' };

/** Builds a whole DashboardModel from a list of cards. Live plans keep their given order: lead first. */
function dashboard(cards, { user = USER, state = 'ready', stale = null } = {}) {
  const of = (...phases) => cards.filter((c) => phases.includes(c.phase));
  const sections = {
    inProgress: of('generating', 'failed'), live: of('live'),
    upcoming: of('upcoming').sort((a, b) => a.dates.start.localeCompare(b.dates.start)),
    past: of('past').sort((a, b) => b.dates.end.localeCompare(a.dates.end)), undated: of('undated'),
  };
  const monthKeys = [...new Set(sections.past.map((c) => c.monthKey))];
  const plans = cards.filter((c) => c.generation === null);
  const counts = { all: plans.length, live: sections.live.length, upcoming: sections.upcoming.length, past: sections.past.length, shared: plans.filter((c) => c.shared).length };
  const hops = state === 'error' ? [] : hopsFrom(cards, user);
  return {
    state, stale,
    now: { iso: NOW_ISO, dateText: dayText(TODAY), partOfDay: 'morning' },
    user,
    live: sections.live.map((trip, i) => liveBriefing(trip, i === 0)),
    next: sections.upcoming.length ? nextDeparture(sections.upcoming[0]) : null,
    sections,
    pastByMonth: monthKeys.map((key) => ({ key, label: monthLabel(key), trips: sections.past.filter((c) => c.monthKey === key) })),
    cardsById: Object.fromEntries(cards.map((c) => [c.id, c])),
    counts,
    filter: { q: '', active: 'all', expanded: false, options: Object.keys(FILTER_LABELS).map((key) => ({ key, label: FILTER_LABELS[key], count: counts[key] })) },
    stats: statsFrom(cards, user), hops, suggestion: suggestionFrom(hops, cards, user), pins: state === 'ready' ? pinsFrom(cards, user) : pinsFrom([], user),
    credits: uniqueCredits([...plans.map((c) => c.cover), ...hops.map((hop) => hop.cover)]),
  };
}

/** What applyDashboardFilter leaves: the sections hold the matches only, the rest of the model stands. */
function filtered(model, { q, active, keep }) {
  const pick = (list) => list.filter(keep);
  const sections = Object.fromEntries(Object.entries(model.sections).map(([name, list]) => [name, pick(list)]));
  return {
    ...model, sections, filter: { ...model.filter, q, active, expanded: true },
    pastByMonth: model.pastByMonth.map((group) => ({ ...group, trips: pick(group.trips) })).filter((group) => group.trips.length),
  };
}

const pending = (trip) => ({ ...trip, readiness: null, weather: null, briefingPending: true });
const localOnly = (trip) => ({ ...trip, cost: { ...trip.cost, home: null, homeFirst: false, budgetHome: null } });
const READY = [seville, ...UPCOMING, ...PAST];

export const DASHBOARD_FIXTURES = {
  ready: dashboard(READY),
  twoLive: dashboard([seville, kyoto, ...UPCOMING, ...PAST]),
  noLive: dashboard([...UPCOMING, ...PAST]),
  nothingUpcoming: dashboard([seville, ...PAST]),
  pastOnly: dashboard(PAST),
  empty: dashboard([], { state: 'empty' }),
  error: dashboard([], { state: 'error' }),
  stale: dashboard(READY, { stale: { savedAt: '2027-03-09T18:42:00+00:00' } }),
  generating: dashboard([dublin, ...READY]),
  generatingNoDates: dashboard([dublinNoDates, ...READY]),
  failed: dashboard([istanbul, ...READY]),
  failedShared: dashboard([{ ...istanbul, shared: true, role: 'editor' }, ...READY]),
  sharedViewer: dashboard([seville, porto('viewer'), ...UPCOMING, ...PAST]),
  sharedEditor: dashboard([seville, porto('editor'), ...UPCOMING, ...PAST]),
  noCover: dashboard([seville, { ...marrakech, cover: NO_COVER }, vancouver, sintra, ...PAST]),
  noDates: dashboard([florence, ...READY]),
  homeCity: dashboard([seville, lisbonWeek, vancouver, ...PAST]),
  noHomeCurrency: dashboard(READY.map(localOnly), { user: { ...USER, homeCurrency: null } }),
  briefingPending: dashboard([pending(seville), ...UPCOMING.map(pending), ...PAST]),
  // Not in the task's list: the same account while a filter is on, so `filter.expanded` has a true case.
  filtered: filtered(dashboard(READY), { q: '', active: 'past', keep: (c) => c.phase === 'past' }),
};
