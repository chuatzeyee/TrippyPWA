// Runtime mirror of the typedefs in js/views/contract.js, for tests only: a model conforms when it has
// exactly the keys of its typedef, each with the right type. Steward: F0. Keep in step with contract.js.

const S = 'string';
const N = 'number';
const B = 'boolean';
const nul = (type) => ({ nullable: type });
const arr = (type, max = Infinity) => ({ array: type, max });
const one = (...values) => ({ oneOf: values });
const mapOf = (type) => ({ mapOf: type });
const tuple = (...types) => ({ tuple: types });

function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** @returns {string[]} one line per mismatch; empty when `value` conforms to `type`. */
export function conforms(value, type, path = '$') {
  if (typeof type === 'string') {
    if (type === N) return Number.isFinite(value) ? [] : [`${path}: expected a finite number, got ${kindOf(value)}`];
    return typeof value === type ? [] : [`${path}: expected ${type}, got ${kindOf(value)}`];
  }
  if ('nullable' in type) return value === null ? [] : conforms(value, type.nullable, path);
  if ('oneOf' in type) {
    return type.oneOf.includes(value) ? [] : [`${path}: expected one of ${type.oneOf.join(', ')}, got ${JSON.stringify(value)}`];
  }
  if ('array' in type) {
    if (!Array.isArray(value)) return [`${path}: expected an array, got ${kindOf(value)}`];
    const tooLong = value.length > type.max ? [`${path}: at most ${type.max} entries, got ${value.length}`] : [];
    return [...tooLong, ...value.flatMap((entry, i) => conforms(entry, type.array, `${path}[${i}]`))];
  }
  if ('tuple' in type) {
    if (!Array.isArray(value) || value.length !== type.tuple.length) return [`${path}: expected a tuple of ${type.tuple.length}`];
    return type.tuple.flatMap((entryType, i) => conforms(value[i], entryType, `${path}[${i}]`));
  }
  if ('mapOf' in type) {
    if (kindOf(value) !== 'object') return [`${path}: expected an object, got ${kindOf(value)}`];
    return Object.keys(value).flatMap((key) => conforms(value[key], type.mapOf, `${path}.${key}`));
  }
  if (kindOf(value) !== 'object') return [`${path}: expected an object, got ${kindOf(value)}`];
  const wanted = Object.keys(type);
  const missing = wanted.filter((key) => !(key in value)).map((key) => `${path}.${key}: missing`);
  const extra = Object.keys(value).filter((key) => !wanted.includes(key)).map((key) => `${path}.${key}: not in the typedef`);
  const nested = wanted.filter((key) => key in value).flatMap((key) => conforms(value[key], type[key], `${path}.${key}`));
  return [...missing, ...extra, ...nested];
}

export const Money = { amount: N, code: S, text: S };
export const CostEstimate = {
  basis: one('perPerson'), local: nul(Money), home: nul(Money), homeFirst: B, excluded: N,
  budget: nul(Money), budgetHome: nul(Money),
};
export const CoverModel = {
  kind: one('v2', 'legacy', 'none'), src: S, srcset: S, fallbackSrc: S, focusY: N,
  credit: nul({ chip: S, full: S, link: S }),
};
export const TypicalWeather = { lowC: N, highC: N, range: S, condition: S, season: S };
export const StopLine = { time: nul(S), title: S, venue: nul(S) };
const RouteEnd = { code: nul(S), label: S, note: S };
export const RouteLine = {
  kind: one('flight', 'ground', 'multi', 'home', 'none'),
  mode: one('plane', 'train', 'bus', 'ferry', 'car', 'taxi'),
  from: RouteEnd, to: RouteEnd, detail: S, booked: B, times: nul({ depart: S, arrive: S }),
};
export const ReadinessItem = {
  area: one('travel', 'stay', 'entry', 'reservations'),
  target: one('flights', 'transport', 'accommodation', 'entry', 'checklist'),
  label: S, state: one('done', 'todo', 'checking'), status: S, detail: S, actionLabel: S,
  source: one('data', 'device'), tickKey: nul(S),
  due: nul({ by: S, text: S, state: one('overdue', 'soon', 'later') }),
};
export const Readiness = {
  items: arr(ReadinessItem, 4), done: N, total: N, todo: N, pending: N, headline: S, perDevice: B, collapsed: B,
};
const Dates = { start: nul(S), end: nul(S), text: S, dayCount: N, nights: N, itineraryDays: N };
const Place = { name: S, country: S, flag: S, lat: nul(N), lng: nul(N), timezone: nul(S) };
export const TripCardModel = {
  id: S, title: S, href: S, wholeHref: S, todayHref: nul(S),
  phase: one('generating', 'failed', 'live', 'upcoming', 'past', 'undated'),
  dates: Dates, daysToGo: nul(N), dayNumber: nul(N), daysLeft: nul(N), places: arr(Place), flags: arr(S),
  travellers: nul(N), cover: CoverModel, cost: CostEstimate, shared: B, role: nul(one('viewer', 'editor')),
  imported: B, savedOffline: B, readiness: nul(Readiness), weather: nul(TypicalWeather), briefingPending: B,
  generation: nul({ daysDone: nul(N), daysTotal: nul(N), etaMinutes: nul(N), slow: B, error: S }),
  monthKey: S,
};
export const LiveBriefing = {
  trip: TripCardModel, isLead: B, timezone: S, dayNumber: N, dayCount: N, daysLeft: N, endText: S,
  today: nul({ dateText: S, title: S, weather: nul(TypicalWeather) }),
  nextStop: nul(StopLine), laterToday: arr(StopLine, 3), tonight: nul(StopLine), remainingToday: N,
  tomorrow: nul({ dayNumber: N, dateText: S, title: S, weather: nul(TypicalWeather) }),
};
export const NextDeparture = {
  trip: TripCardModel, daysToGo: N, route: RouteLine, departText: S, returnText: S, lengthText: S,
  todo: arr(ReadinessItem, 3), settled: arr(ReadinessItem),
};
export const TravelStats = {
  trips: N, countries: N, cities: N, daysPlanned: N, calendarDays: N, spendHome: nul(Money), spendUnconverted: N,
  mostPlanned: nul({ country: S, flag: S, trips: N }), longest: nul({ title: S, days: N }),
  byCountry: arr({ flag: S, code3: nul(S), country: S, trips: N, phase: one('past', 'live', 'upcoming'), firstDate: S, isHome: B }),
  byMonth: arr({ key: S, label: S, days: N, phase: one('past', 'now', 'future') }),
  extremes: { north: nul({ name: S, lat: N }), south: nul({ name: S, lat: N }), farthest: nul({ name: S, km: N }) },
  firstDate: nul(S), lastDate: nul(S),
};
export const MapPin = {
  at: tuple(N, N), kind: one('live', 'up', 'past', 'home'), place: S, country: S, label: S, tripIds: arr(S),
  count: N, href: S, todayHref: nul(S),
};
const Credit = { label: S, full: S, link: S };
export const DashboardModel = {
  state: one('ready', 'empty', 'error'), stale: nul({ savedAt: nul(S) }),
  now: { iso: S, dateText: S, partOfDay: one('morning', 'afternoon', 'evening') },
  user: { firstName: S, homeCity: S, homeFlag: S, homeTimezone: nul(S), homeCurrency: nul({ code: S, symbol: S }) },
  live: arr(LiveBriefing), next: nul(NextDeparture),
  sections: {
    inProgress: arr(TripCardModel), live: arr(TripCardModel), upcoming: arr(TripCardModel),
    past: arr(TripCardModel), undated: arr(TripCardModel),
  },
  pastByMonth: arr({ key: S, label: S, trips: arr(TripCardModel) }),
  cardsById: mapOf(TripCardModel),
  counts: { all: N, live: N, upcoming: N, past: N, shared: N },
  filter: {
    q: S, active: one('all', 'live', 'upcoming', 'past', 'shared'), expanded: B,
    options: arr({ key: S, label: S, count: N }),
  },
  stats: TravelStats,
  hops: arr({ name: S, country: S, flag: S, km: N, cover: CoverModel, note: S }, 7),
  pins: arr(MapPin), credits: arr(Credit),
};

export const GlanceFact = {
  key: one('ready', 'stops', 'cost', 'weather', 'pace', 'stay', 'length', 'travellers'), label: S, value: S, note: S, jump: S,
};
const Photo = { src: S, alt: S };
export const DayIndexRow = {
  index: N, dayNumber: N, date: S, dateText: S, title: S, theme: S, stops: N, cost: CostEstimate,
  weather: nul({ range: S, condition: S }), colorIndex: N, thumb: nul(Photo), photos: arr(Photo, 4),
  firstTime: nul(S), lastTime: nul(S), isToday: B,
};
export const MapPoint = { lat: N, lng: N, dayNumber: N, dayIndex: N, order: N, title: S, colorIndex: N };
export const DayAsideModel = {
  index: N, dayNumber: N, colorIndex: N, map: nul({ points: arr(MapPoint), placed: N, total: N }),
  stops: N, firstTime: nul(S), lastTime: nul(S), cost: nul(CostEstimate), weather: nul({ range: S, condition: S }),
  areas: arr(S), book: arr({ label: S, booked: B }), list: arr({ id: S, at: N, number: N, time: S, title: S }),
};
export const TripAction = {
  key: one('share', 'pdf', 'edit', 'read-view', 'regenerate', 'delete'), label: S, hint: S, href: S, danger: B,
};
export const TripOverviewModel = {
  id: S, title: S, placeLine: S, flags: arr(S), status: one('ok', 'generating', 'failed', 'empty'),
  phase: one('upcoming', 'live', 'past', 'undated'), statusText: S, daysToGo: nul(N),
  live: nul({
    dayNumber: N, dayCount: N, dayIndex: nul(N),
    today: nul({ title: S, nextStop: nul(StopLine), laterToday: arr(StopLine), tonight: nul(StopLine), remainingToday: N }),
  }),
  dates: Dates, travellers: nul(N), cover: CoverModel, route: RouteLine, glance: arr(GlanceFact),
  readiness: nul(Readiness), days: arr(DayIndexRow), map: { points: arr(MapPoint), dayCount: N },
  brief: { pace: S, interests: arr(S), areaCount: N, firstArea: S, lastArea: S }, cost: CostEstimate,
  areas: arr({ name: S, photo: S, stops: N }),
  tips: { shown: arr({ title: S, text: S, saving: S }, 2), total: N },
  actions: arr(TripAction), role: one('owner', 'editor', 'viewer'), imported: B, offline: nul({ savedAt: nul(S) }),
  credits: arr(Credit),
};
export const Prefs = {
  view: one('departures', 'concierge', 'atlas'), viewChooserSeen: B, theme: one('dark', 'light', 'system'),
  motion: one('system', 'reduce'), timeFormat: one('12h', '24h'), temperatureUnit: one('C', 'F'),
  homeCurrencyFirst: B, openTodayFirst: B, autoOpenNextDay: B, showVenuePhotos: B,
};

// Rules the typedef comments state in words. They hold for every model, fixture or built.

const FLAG = /^[a-z]{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function readinessRules(readiness, path) {
  if (!readiness) return [];
  const count = (state) => readiness.items.filter((item) => item.state === state).length;
  const out = [];
  if (readiness.total < 1 || readiness.total > 4) out.push(`${path}.total: must be 1 to 4`);
  if (readiness.items.length !== readiness.total) out.push(`${path}.items: ${readiness.items.length} items for total ${readiness.total}`);
  if (count('done') !== readiness.done) out.push(`${path}.done: does not match the items`);
  if (count('todo') !== readiness.todo) out.push(`${path}.todo: does not match the items`);
  if (count('checking') !== readiness.pending) out.push(`${path}.pending: does not match the items`);
  const order = ['travel', 'stay', 'entry', 'reservations'];
  const areas = readiness.items.map((item) => order.indexOf(item.area));
  if (areas.some((at, i) => i > 0 && at <= areas[i - 1])) out.push(`${path}.items: areas out of order or repeated`);
  const headline = readiness.done === readiness.total ? 'Ready' : `${readiness.done} of ${readiness.total} ready`;
  if (readiness.headline !== headline) out.push(`${path}.headline: expected "${headline}"`);
  return out;
}

function cardRules(card, path) {
  const out = [];
  const base = `#/trip/${encodeURIComponent(card.id)}`;
  if (card.href !== base) out.push(`${path}.href: expected ${base}`);
  if (card.wholeHref !== `${base}?today=0`) out.push(`${path}.wholeHref: expected ${base}?today=0`);
  const live = card.phase === 'live';
  if (live !== (card.todayHref === `${base}?today=1`) || (!live && card.todayHref !== null)) out.push(`${path}.todayHref: set only when live`);
  if (live !== (card.dayNumber !== null) || live !== (card.daysLeft !== null)) out.push(`${path}: dayNumber and daysLeft are live only`);
  if (live && (card.dayNumber < 1 || card.dayNumber > card.dates.dayCount)) out.push(`${path}.dayNumber: outside 1..dayCount`);
  if ((card.phase === 'upcoming') !== (card.daysToGo !== null)) out.push(`${path}.daysToGo: upcoming only`);
  if (card.flags.some((flag) => !FLAG.test(flag)) || new Set(card.flags).size !== card.flags.length) out.push(`${path}.flags: unique two-letter codes only`);
  const inProgress = card.phase === 'generating' || card.phase === 'failed';
  if (inProgress !== (card.generation !== null)) out.push(`${path}.generation: set only while generating or failed`);
  if (card.shared !== (card.role !== null)) out.push(`${path}.role: set only on a shared plan`);
  if (card.monthKey !== (card.dates.start ? card.dates.start.slice(0, 7) : '')) out.push(`${path}.monthKey: must follow the start date`);
  for (const key of ['start', 'end']) if (card.dates[key] !== null && !DATE.test(card.dates[key])) out.push(`${path}.dates.${key}: not YYYY-MM-DD`);
  if ((card.phase === 'undated') !== (card.dates.start === null) && !inProgress) out.push(`${path}.phase: undated means no start date`);
  if (card.readiness && (inProgress || card.phase === 'past')) out.push(`${path}.readiness: null for past, generating and failed plans`);
  if (card.readiness && card.readiness.collapsed !== live) out.push(`${path}.readiness.collapsed: true exactly while live`);
  if (card.cover.kind === 'none' && card.cover.src !== '') out.push(`${path}.cover.src: empty when kind is none`);
  if (card.cover.kind !== 'none' && card.cover.src === '') out.push(`${path}.cover.src: missing`);
  return [...out, ...readinessRules(card.readiness, `${path}.readiness`)];
}

/** @returns {string[]} broken rules of a DashboardModel (types first, then the rules stated in words). */
export function checkDashboardModel(model) {
  const typed = conforms(model, DashboardModel);
  if (typed.length) return typed;
  const out = [];
  const { sections } = model;
  const all = [...sections.inProgress, ...sections.live, ...sections.upcoming, ...sections.past, ...sections.undated];
  all.forEach((card) => out.push(...cardRules(card, `card ${card.id}`)));
  const ids = all.map((card) => card.id);
  if (new Set(ids).size !== ids.length) out.push('sections: a plan sits in two sections');
  if (all.some((card) => model.cardsById[card.id] !== card)) out.push('cardsById: must hold the same objects as the sections');
  const phaseOf = { live: ['live'], upcoming: ['upcoming'], past: ['past'], undated: ['undated'], inProgress: ['generating', 'failed'] };
  for (const [name, phases] of Object.entries(phaseOf)) {
    if (sections[name].some((card) => !phases.includes(card.phase))) out.push(`sections.${name}: holds a plan of another phase`);
  }
  model.live.forEach((b) => { if (b.trip !== model.cardsById[b.trip.id]) out.push(`live ${b.trip.id}: trip must be the card object`); });
  if (model.live.length && (!model.live[0].isLead || model.live.filter((b) => b.isLead).length !== 1)) out.push('live: exactly one lead, first');
  if (model.next && model.next.trip !== model.cardsById[model.next.trip.id]) out.push('next: trip must be the card object');
  const pastIds = model.pastByMonth.flatMap((group) => group.trips.map((card) => card.id));
  if (pastIds.join() !== sections.past.map((card) => card.id).join()) out.push('pastByMonth: must hold sections.past in the same order');
  // A filtered model keeps the featured plans and cardsById whole; its sections hold the matches only.
  if (!model.filter.expanded) {
    if (Object.keys(model.cardsById).sort().join() !== [...ids].sort().join()) out.push('cardsById: must hold exactly the cards of the sections');
    if (model.live.map((b) => b.trip.id).sort().join() !== sections.live.map((c) => c.id).sort().join()) out.push('live: must cover exactly sections.live');
    if (model.next && model.next.trip !== sections.upcoming[0]) out.push('next: must be the soonest upcoming plan');
    if (!model.next && sections.upcoming.length) out.push('next: missing although a plan is upcoming');
    for (const key of ['live', 'upcoming', 'past']) {
      if (model.counts[key] !== sections[key].length) out.push(`counts.${key}: expected ${sections[key].length}, got ${model.counts[key]}`);
    }
  }
  if (model.filter.expanded !== (model.filter.q !== '' || model.filter.active !== 'all')) out.push('filter.expanded: true exactly while a query or a filter is active');
  if (model.state !== 'ready' && all.length) out.push(`state ${model.state}: must carry no plans`);
  model.pins.forEach((pin, i) => {
    if (pin.count !== pin.tripIds.length) out.push(`pins[${i}].count: must equal tripIds.length`);
    if (pin.tripIds.some((id) => !model.cardsById[id])) out.push(`pins[${i}].tripIds: unknown plan`);
    if ((pin.kind === 'home') !== (pin.tripIds.length === 0)) out.push(`pins[${i}]: only the home pin has no plans`);
    if (pin.tripIds.length && pin.href !== model.cardsById[pin.tripIds[0]]?.href) out.push(`pins[${i}].href: must be the first plan's href`);
  });
  if (model.hops.some((hop, i) => i > 0 && hop.km < model.hops[i - 1].km) || model.hops.some((hop) => hop.km > 1000)) out.push('hops: nearest first, within 1,000 km');
  return out;
}

/** @returns {string[]} broken rules of a TripOverviewModel. */
export function checkTripModel(model) {
  const typed = conforms(model, TripOverviewModel);
  if (typed.length) return typed;
  const out = [...readinessRules(model.readiness, 'readiness')];
  if ((model.phase === 'live') !== (model.live !== null)) out.push('live: set exactly while the plan is live');
  if ((model.phase === 'upcoming') !== (model.daysToGo !== null)) out.push('daysToGo: upcoming only');
  if (model.readiness && (model.phase === 'past' || model.status !== 'ok')) out.push('readiness: null for a past plan and for a plan that is generating, failed or empty');
  if (model.readiness && model.readiness.collapsed !== (model.phase === 'live')) out.push('readiness.collapsed: true exactly while live');
  model.days.forEach((row, i) => {
    if (row.index !== i) out.push(`days[${i}].index: must equal its position`);
    if (row.colorIndex < 1 || row.colorIndex > 7) out.push(`days[${i}].colorIndex: 1 to 7`);
  });
  if (model.live && model.live.dayIndex !== null && !model.days[model.live.dayIndex]) out.push('live.dayIndex: no such day row');
  model.map.points.forEach((point, i) => { if (!model.days[point.dayIndex]) out.push(`map.points[${i}].dayIndex: no such day row`); });
  const keys = model.actions.map((action) => action.key);
  if (new Set(keys).size !== keys.length) out.push('actions: a key appears twice');
  if (model.role !== 'owner' && keys.some((key) => key === 'delete' || key === 'regenerate')) out.push('actions: delete and regenerate are owner only');
  if (model.role === 'viewer' && keys.some((key) => key === 'edit' || key === 'share')) out.push('actions: a viewer cannot edit or share');
  if (model.imported && keys.includes('regenerate')) out.push('actions: no regenerate on an imported trip');
  model.actions.forEach((action) => {
    const wanted = action.key === 'read-view' ? `#/trip/${encodeURIComponent(model.id)}/read` : '';
    if (action.href !== wanted) out.push(`actions.${action.key}.href: expected "${wanted}"`);
  });
  if (model.tips.shown.length > model.tips.total) out.push('tips.total: smaller than the tips shown');
  if (model.cover.kind === 'none' && model.cover.src !== '') out.push('cover.src: empty when kind is none');
  return out;
}
