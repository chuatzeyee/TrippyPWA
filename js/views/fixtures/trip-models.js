// TripOverviewModel fixtures, one per state (blueprint 9.2 and 9.4 item 3). Invented data only.
// Steward: F0.
import {
  TODAY, PLACES, NO_COVER, COMPARE, PART_BOOKED, addDays, cost, creditOf, dayText, daysBetween, legacyCover, money,
  rangeText, readinessOf, ready, route, stop,
} from './parts.js';

const P = PLACES;
const DAY_PLANS = [
  ['Arrive and the medina at dusk', 'A slow first evening inside the old walls.', 3],
  ['Souks, spices and the Bahia Palace', 'The busiest sights, early and on foot.', 6],
  ['Majorelle garden and Gueliz', 'Gardens in the morning, the new town after lunch.', 5],
  ['Day trip to the Ourika valley', 'Out of the city and into the foothills.', 4],
  ['Hammam morning and rooftop lunch', 'A rest day with one long lunch.', 3],
  ['Saadian tombs and the Mellah', 'History in the south of the medina.', 6],
  ['Last mint tea and the flight home', 'Pack, one last walk and the airport.', 4],
];
const VENUE = 'https://photos.example.test/venues';
const VENUE_CREDIT = { label: 'Pexels', full: 'Photo: Jo Marlo, Pexels', link: 'https://photos.example.test/credit/venues' };
const dayCost = (i) => cost({ local: money(400 + i * 100, 'MAD'), home: money(37 + i * 9, 'EUR') });

function dayRows(start, { photos = true, todayIndex = null } = {}) {
  return DAY_PLANS.map(([title, theme, stops], i) => {
    const date = start ? addDays(start, i) : '';
    const shots = photos ? Array.from({ length: Math.min(4, stops) }, (_, n) => ({ src: `${VENUE}/day-${i + 1}-${n + 1}.jpg`, alt: `${title}, photo ${n + 1}` })) : [];
    return {
      index: i, dayNumber: i + 1, date, dateText: date ? dayText(date) : '', title, theme: i === 4 ? '' : theme, stops,
      cost: dayCost(i), weather: i === 6 ? null : { range: `${10 + (i % 3)} to ${23 + (i % 3)}°C`, condition: i % 2 ? 'Sunny' : 'Clear' },
      colorIndex: (i % 7) + 1, thumb: shots[0] ?? null, photos: shots,
      firstTime: i === 3 ? null : '9:00 AM', lastTime: i === 3 ? null : '9:30 PM', isToday: i === todayIndex,
    };
  });
}
const mapPoints = (rows, at) => rows.flatMap((row) => Array.from({ length: Math.min(3, row.stops) }, (_, n) => ({
  lat: at.lat + 0.004 * row.index - 0.002 * n, lng: at.lng + 0.005 * n - 0.003 * row.index,
  dayNumber: row.dayNumber, dayIndex: row.index, order: n + 1, title: `${row.title}, stop ${n + 1}`, colorIndex: row.colorIndex,
})));

const ACTION = {
  share: { label: 'Share', hint: 'Invite someone or copy a link', danger: false },
  pdf: { label: 'Export PDF', hint: 'A printable copy with photos', danger: false },
  edit: { label: 'Edit trip', hint: 'Move, change or remove stops', danger: false },
  tune: { label: 'Fine-tune', hint: 'Swap stops, see paid and free', danger: false },
  'read-view': { label: 'Reader view', hint: 'A plain page that is easy to read', danger: false },
  regenerate: { label: 'Regenerate trip', hint: 'Plan the days again from your answers', danger: false },
  delete: { label: 'Delete trip', hint: 'Remove this plan for good', danger: true },
};
const actions = (id, ...keys) => keys.map((key) => ({ key, ...ACTION[key], href: key === 'read-view' ? `#/trip/${encodeURIComponent(id)}/read` : key === 'tune' ? `#/trip/${encodeURIComponent(id)}/tune` : '' }));
const OWNER = ['share', 'pdf', 'edit', 'tune', 'read-view', 'regenerate', 'delete'];

const READINESS = (collapsed) => readinessOf([
  ready('flights', 'todo', 'Not booked yet', 'Suggested direct flights, about 1h 35m each way.'),
  ready('stay', 'todo', 'None booked', '3 options to compare. Riad Dar Zitoun in the medina is the recommended pick.', COMPARE),
  ready('entry', 'done', 'Nothing to file', 'Portuguese passport: visa-free, up to 90 days.'),
  ready('reservations', 'todo', '2 to book', 'Hammam session and the Atlas day trip.', { source: 'device' }),
], { collapsed });
const GLANCE = [
  { key: 'ready', label: 'Ready', value: '1 of 4', note: '3 things left', jump: 'readiness' },
  { key: 'stops', label: 'Stops', value: '31', note: 'about 4 a day', jump: '' },
  { key: 'cost', label: 'Estimated cost', value: '~€390', note: 'per person, activities only. MAD 4,200', jump: 'spending' },
  { key: 'weather', label: 'Typical weather', value: '10 to 24°C', note: 'Clear, typical for late March', jump: '' },
  { key: 'pace', label: 'Pace', value: 'Balanced', note: '', jump: '' },
  { key: 'stay', label: 'Stay', value: '4-star riad', note: '', jump: 'accommodation' },
];
const without = (...keys) => GLANCE.filter((fact) => !keys.includes(fact.key));
const AREAS = [
  { name: 'Medina', photo: `${VENUE}/area-medina.jpg`, stops: 17 },
  { name: 'Gueliz', photo: `${VENUE}/area-gueliz.jpg`, stops: 8 },
  { name: 'Ourika valley', photo: '', stops: 6 },
];
const TIPS = {
  shown: [
    { title: 'Buy the monuments pass', text: 'One ticket covers the Bahia Palace, the Saadian tombs and the Badi Palace.', saving: '~MAD 60' },
    { title: 'Share the valley taxi', text: 'A grand taxi to Ourika costs the same for one to six people.', saving: '~MAD 300' },
  ],
  total: 4,
};
const statusFor = (phase, toGo, dayNumber, dayCount) => {
  if (phase === 'undated') return 'No dates yet';
  if (phase === 'past') return 'Past plan';
  if (phase === 'live') return `Day ${dayNumber} of ${dayCount}`;
  return toGo === 1 ? 'Tomorrow' : `In ${toGo} days`;
};

/** A whole TripOverviewModel for the sample Marrakech plan, moved in time by `start`. */
function trip({ start = '2027-03-19', photos = true, ...over } = {}) {
  const id = 's-marrakech';
  const dayCount = DAY_PLANS.length;
  const finish = start ? addDays(start, dayCount - 1) : null;
  const phase = !start ? 'undated' : TODAY < start ? 'upcoming' : TODAY > finish ? 'past' : 'live';
  const dayNumber = phase === 'live' ? daysBetween(start, TODAY) + 1 : null;
  const daysToGo = phase === 'upcoming' ? daysBetween(TODAY, start) : null;
  const rows = dayRows(start, { photos, todayIndex: dayNumber ? dayNumber - 1 : null });
  const cover = legacyCover(P.marrakech);
  const today = dayNumber ? {
    title: rows[dayNumber - 1].title, nextStop: stop('11:30 AM', 'Jardin Majorelle', 'Rue Yves Saint Laurent'),
    laterToday: [stop('1:30 PM', 'Lunch in Gueliz', 'Café du Livre'), stop('4:00 PM', 'Menara gardens at golden hour', null)],
    tonight: null, remainingToday: 3,
  } : null;
  return {
    id, title: 'Marrakech and the Atlas foothills', placeLine: 'Marrakech, Morocco', flags: ['ma'], status: 'ok', phase,
    statusText: statusFor(phase, daysToGo, dayNumber, dayCount), daysToGo,
    live: dayNumber ? { dayNumber, dayCount, dayIndex: dayNumber - 1, today } : null,
    dates: { start, end: finish, text: rangeText(start, finish), dayCount, nights: dayCount - 1, itineraryDays: dayCount },
    travellers: 2, cover,
    route: route('flight', 'plane', ['LIS', 'Lisbon'], ['RAK', 'Marrakech'], '1h 35m, suggested'),
    glance: phase === 'past' || phase === 'live' ? without('ready') : GLANCE,
    readiness: phase === 'past' ? null : READINESS(phase === 'live'),
    days: rows, map: { points: mapPoints(rows, P.marrakech), dayCount },
    brief: { pace: 'Balanced', interests: ['Food', 'History', 'Markets'], areaCount: 3, firstArea: 'Medina', lastArea: 'Ourika valley' },
    cost: cost({ local: money(4200, 'MAD'), home: money(390, 'EUR'), budget: money(7000, 'MAD'), budgetHome: money(650, 'EUR') }),
    areas: photos ? AREAS : AREAS.map((area) => ({ ...area, photo: '' })), tips: TIPS,
    actions: actions(id, ...OWNER), role: 'owner', imported: false, offline: null,
    credits: [creditOf(cover), ...(photos ? [VENUE_CREDIT] : [])],
    ...over,
  };
}

const bare = { glance: [], readiness: null, days: [], map: { points: [], dayCount: 0 }, areas: [], tips: { shown: [], total: 0 } };
const checking = readinessOf([
  ready('flights', 'todo', 'Not booked yet', 'Suggested direct flights, about 1h 35m each way.'),
  ready('stay', 'todo', 'None booked', '3 options to compare. Riad Dar Zitoun in the medina is the recommended pick.', COMPARE),
  ready('entry', 'checking', 'Checking', ''),
  ready('reservations', 'todo', '2 to book', 'Hammam session and the Atlas day trip.', { source: 'device' }),
]);
const liveBase = trip({ start: addDays(TODAY, -2) });
const multiCover = legacyCover(P.vienna);

export const TRIP_FIXTURES = {
  upcoming: trip(),
  tomorrow: trip({ start: addDays(TODAY, 1) }),
  live: liveBase,
  liveNoNextStop: { ...liveBase, live: { ...liveBase.live, today: { title: liveBase.live.today.title, nextStop: null, laterToday: [], tonight: null, remainingToday: 0 } } },
  past: trip({ start: '2026-10-08' }),
  undated: trip({ start: null }),
  generating: trip({ status: 'generating', readiness: null, glance: without('ready'), actions: actions('s-marrakech', 'share', 'pdf', 'read-view', 'delete') }),
  failed: trip({ ...bare, status: 'failed', statusText: 'Planning stopped', actions: actions('s-marrakech', 'delete') }),
  empty: trip({ ...bare, status: 'empty', actions: actions('s-marrakech', 'regenerate', 'delete') }),
  viewer: trip({ role: 'viewer', actions: actions('s-marrakech', 'pdf', 'read-view') }),
  editor: trip({ role: 'editor', actions: actions('s-marrakech', 'share', 'pdf', 'edit', 'tune', 'read-view') }),
  imported: trip({
    imported: true, glance: without('pace', 'stay'), actions: actions('s-marrakech', 'share', 'pdf', 'edit', 'tune', 'read-view', 'delete'),
    brief: { pace: '', interests: [], areaCount: 3, firstArea: 'Medina', lastArea: 'Ourika valley' },
    readiness: readinessOf([
      ready('flights', 'done', 'Booked', 'Lisbon to Marrakech, booked both ways.'),
      ready('stay', 'todo', '1 of 3 stays booked', 'Still open: Ourika lodge and the last night by the airport.', PART_BOOKED),
      ready('reservations', 'todo', '2 to book', 'Hammam session and the Atlas day trip.', {
        source: 'device', due: { by: '2027-03-12', text: `by ${dayText('2027-03-12')}`, state: 'soon' },
      }),
    ]),
  }),
  ground: trip({
    id: 's-porto', title: 'Porto weekend', placeLine: '', flags: ['pt'], cover: legacyCover(P.porto),
    route: route('ground', 'train', [null, 'Lisbon', 'Santa Apolónia'], [null, 'Porto', 'Campanhã'], 'Train, about 3h'),
    actions: actions('s-porto', ...OWNER), credits: [creditOf(legacyCover(P.porto))],
    readiness: readinessOf([
      ready('transport', 'todo', 'Not arranged yet', 'Alfa Pendular train, about 3h.'),
      ready('stay', 'done', 'Booked', 'Casa da Ribeira, 6 nights.'),
    ]),
  }),
  multiCity: trip({
    id: 's-vienna-bratislava-budapest', title: 'Vienna, Bratislava & Budapest', placeLine: '', flags: ['at', 'sk', 'hu'], cover: multiCover,
    route: route('multi', 'train', [null, 'Vienna'], [null, 'Budapest'], '3 cities, via Bratislava'),
    actions: actions('s-vienna-bratislava-budapest', ...OWNER), credits: [creditOf(multiCover)],
  }),
  noCover: trip({ cover: NO_COVER, credits: [VENUE_CREDIT] }),
  noMap: trip({ map: { points: [], dayCount: DAY_PLANS.length } }),
  offline: trip({ offline: { savedAt: '2027-03-09T18:42:00+00:00' } }),
  entryChecking: trip({ readiness: checking, glance: GLANCE.map((fact) => (fact.key === 'ready' ? { ...fact, value: '0 of 4', note: '3 things left' } : fact)) }),
  photosOff: trip({ photos: false }),
};
