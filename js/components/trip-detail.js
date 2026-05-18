import { navigate } from '../router.js';
import { fetchTripById, deleteTrip } from '../data/trip-repository.js';
import { formatNumber, formatDateRange, formatWeekdayDate, getLocale } from '../lib/locale.js';
import { convert } from '../data/currencies.js';
import { getHomeCurrency, setHomeCurrency } from '../data/user-prefs.js';
import { fetchPlacePhotoByQuery } from '../services/generate.js';

function mdIcon(d, size = 18) {
  return `<svg class="td-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="${d}"/></svg>`;
}

const MD = {
  hotel: 'M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z',
  restaurant: 'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
  cafe: 'M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.9 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z',
  bar: 'M21 5V3H3v2l8 9v5H6v2h12v-2h-5v-5l8-9zM7.43 7L5.66 5h12.69l-1.78 2H7.43z',
  museum: 'M4 10h3v7H4ZM10.5 10h3v7h-3ZM2 19h20v3H2ZM17 10h3v7h-3ZM12 1L2 6v2h20V6Z',
  palette: 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  park: 'M17 12l2 0-5-10-5.05 10 2 0-3.9 6 7.92 0 0 4 3.96 0 0-4 7.02 0Z',
  spa: 'M15.49 9.63c-.18-2.79-1.31-5.51-3.43-7.63-2.14 2.14-3.32 4.86-3.55 7.63 1.28.68 2.46 1.56 3.49 2.63 1.03-1.06 2.21-1.94 3.49-2.63zM12 15.45C9.85 12.17 6.18 10 2 10c0 5.32 3.36 9.82 8.03 11.49.63.23 1.29.4 1.97.51.68-.12 1.33-.29 1.97-.51C18.64 19.82 22 15.32 22 10c-4.18 0-7.85 2.17-10 5.45z',
  shopping: 'M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-1.99.9-1.99 2L3 20c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zm0 10c-2.76 0-5-2.24-5-5h2c0 1.66 1.34 3 3 3s3-1.34 3-3h2c0 2.76-2.24 5-5 5z',
  camera: 'M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z',
  terrain: 'M14 6l-3.75 5 2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22L14 6z',
  beach: 'M13.13 14.56l1.43-1.43 6.44 6.44L19.57 21zm4.29-5.73l2.86-2.86c-3.95-3.95-10.35-3.96-14.3-.02 3.93-1.3 8.31-.25 11.44 2.88zM5.95 5.98c-3.94 3.95-3.93 10.35.02 14.3l2.86-2.86C5.7 14.29 4.65 9.91 5.95 5.98zm.02-.02l-.01.01c-.38 3.01 1.17 6.88 4.3 10.02l5.73-5.73c-3.13-3.13-7.01-4.68-10.02-4.3z',
  ticket: 'M20 12c0-1.1.9-2 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-1.99.9-1.99 2v4c1.1 0 1.99.9 1.99 2s-.89 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2zm-4.42 4.8L12 14.5l-3.58 2.3 1.08-4.12-3.29-2.69 4.24-.25L12 5.8l1.54 3.95 4.24.25-3.29 2.69 1.09 4.11z',
  place: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
  walk: 'M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7',
  flightTakeoff: 'M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14.92 10l-6.9-6.43-1.93.51 4.14 7.17-4.97 1.33-1.97-1.54-1.45.39 2.59 4.49s7.12-1.9 16.57-4.43c.81-.23 1.28-1.05 1.07-1.85z',
  tram: 'M19 16.94V8.5c0-2.79-2.61-3.4-6.01-3.49l.76-1.51H17V2H7v1.5h4.75l-.76 1.52C7.86 5.11 5 5.73 5 8.5v8.44c0 1.45 1.19 2.66 2.59 2.97L6 21.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 20h-.08c1.69 0 2.58-1.37 2.58-3.06zm-7 1.56c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm5-4.5H7V9h10v5z',
  bus: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z',
  train: 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  taxi: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5H15V3H9v2H6.5c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
  car: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
  ferry: 'M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z',
  subway: 'M17.8 2.8C16 2.09 13.86 2 12 2c-1.86 0-4 .09-5.8.8C3.53 3.84 2 6.05 2 8.86V22h20V8.86c0-2.81-1.53-5.02-4.2-6.06zm.2 13.08c0 1.45-1.18 2.62-2.63 2.62l1.13 1.12V20H15l-1.5-1.5h-2.83L9.17 20H7.5v-.38l1.12-1.12C7.18 18.5 6 17.32 6 15.88V9c0-2.63 3-3 6-3 3.32 0 6 .38 6 3v6.88z',
  bike: 'M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10l2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.2l-2.2-2.3zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z',
  checklist: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',
  tripOrigin: 'M2 12C2 6.48 6.48 2 12 2s10 4.48 10 10-4.48 10-10 10S2 17.52 2 12zm10 6c3.31 0 6-2.69 6-6s-2.69-6-6-6-6 2.69-6 6 2.69 6 6 6z',
  flag: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
  calendarToday: 'M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z',
  checkCircle: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  arrowBack: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  delete: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4z',
  info: 'M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
  openInNew: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
  chevronDown: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z',
};

const ICONS = {
  arrowBack: mdIcon(MD.arrowBack, 18),
  delete: mdIcon(MD.delete, 16),
  info: mdIcon(MD.info, 14),
  openInNew: mdIcon(MD.openInNew, 13),
  chevronDown: mdIcon(MD.chevronDown, 16),
};

const CATEGORY_ICONS = {
  accommodation: mdIcon(MD.hotel), hotel: mdIcon(MD.hotel),
  food: mdIcon(MD.restaurant), dining: mdIcon(MD.restaurant),
  restaurant: mdIcon(MD.restaurant), 'food & drink': mdIcon(MD.restaurant),
  breakfast: mdIcon(MD.cafe), lunch: mdIcon(MD.restaurant),
  dinner: mdIcon(MD.bar), coffee: mdIcon(MD.cafe), 'coffee & culture': mdIcon(MD.cafe),
  cafe: mdIcon(MD.cafe), 'coffee break': mdIcon(MD.cafe), snack: mdIcon(MD.cafe),
  culture: mdIcon(MD.museum), museum: mdIcon(MD.museum),
  art: mdIcon(MD.palette), nature: mdIcon(MD.spa), park: mdIcon(MD.park),
  garden: mdIcon(MD.spa), shopping: mdIcon(MD.shopping), market: mdIcon(MD.shopping),
  transport: mdIcon(MD.taxi), flight: mdIcon(MD.flightTakeoff),
  wellness: mdIcon(MD.spa), spa: mdIcon(MD.spa),
  beach: mdIcon(MD.beach), sport: mdIcon(MD.terrain),
  entertainment: mdIcon(MD.ticket), nightlife: mdIcon(MD.bar),
  bar: mdIcon(MD.bar), sightseeing: mdIcon(MD.camera),
  'walking tour': mdIcon(MD.walk), walk: mdIcon(MD.walk),
  adventure: mdIcon(MD.terrain), history: mdIcon(MD.museum),
  'check-in': mdIcon(MD.hotel), 'check-out': mdIcon(MD.hotel),
  arrival: mdIcon(MD.flightTakeoff), departure: mdIcon(MD.flightTakeoff),
  default: mdIcon(MD.place)
};

const TRANSPORT_ICONS = {
  walk: mdIcon(MD.walk), tram: mdIcon(MD.tram), bus: mdIcon(MD.bus),
  train: mdIcon(MD.train), taxi: mdIcon(MD.taxi),
  uber: mdIcon(MD.car), grab: mdIcon(MD.car), didi: mdIcon(MD.car),
  gojek: mdIcon(MD.car), bolt: mdIcon(MD.car), lyft: mdIcon(MD.car),
  ferry: mdIcon(MD.ferry), drive: mdIcon(MD.car),
  metro: mdIcon(MD.subway), subway: mdIcon(MD.subway),
  bicycle: mdIcon(MD.bike), default: mdIcon(MD.place)
};

function addThousandSeps(str) {
  return (str || '').replace(/\d{4,}/g, m => formatNumber(m));
}

function flagImg(code, size = 24) {
  if (!code) return '';
  const w = size <= 20 ? 40 : 80;
  return `<img src="https://flagcdn.com/w${w}/${code}.png" width="${size}" height="${Math.round(size * 0.75)}" alt="" class="td-flag-img">`;
}

const IATA_TO_FLAG = {
  SIN: 'sg', KUL: 'my', PEN: 'my', BKI: 'my', MEL: 'au', SYD: 'au', BNE: 'au',
  PER: 'au', ADL: 'au', AKL: 'nz', CHC: 'nz', NRT: 'jp', HND: 'jp', KIX: 'jp',
  ICN: 'kr', GMP: 'kr', BKK: 'th', CNX: 'th', HKT: 'th', DPS: 'id', CGK: 'id',
  HKG: 'hk', TPE: 'tw', PVG: 'cn', PEK: 'cn', MNL: 'ph', CEB: 'ph',
  LHR: 'gb', LGW: 'gb', STN: 'gb', CDG: 'fr', ORY: 'fr', FCO: 'it', MXP: 'it',
  BCN: 'es', MAD: 'es', AMS: 'nl', FRA: 'de', MUC: 'de', ZRH: 'ch', VIE: 'at',
  IST: 'tr', DXB: 'ae', AUH: 'ae', DOH: 'qa', JFK: 'us', LAX: 'us', SFO: 'us',
  ORD: 'us', MIA: 'us', YVR: 'ca', YYZ: 'ca', DEL: 'in', BOM: 'in', CMB: 'lk',
  HAN: 'vn', SGN: 'vn', RGN: 'mm', PNH: 'kh', REP: 'kh', VTE: 'la',
};

const AIRLINE_LOGOS = {
  'singapore airlines': 'https://upload.wikimedia.org/wikipedia/en/6/6b/Singapore_Airlines_Logo_2.svg',
  'scoot': 'https://upload.wikimedia.org/wikipedia/commons/e/e4/Scoot_logo.svg',
  'jetstar': 'https://upload.wikimedia.org/wikipedia/commons/a/a3/Jetstar_logo.svg',
  'qantas': 'https://upload.wikimedia.org/wikipedia/en/0/02/Qantas_Airways_logo_2016.svg',
  'air asia': 'https://upload.wikimedia.org/wikipedia/commons/f/f5/AirAsia_New_Logo.svg',
  'airasia': 'https://upload.wikimedia.org/wikipedia/commons/f/f5/AirAsia_New_Logo.svg',
  'malaysia airlines': 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Malaysia_Airlines_Logo.svg',
  'cathay pacific': 'https://upload.wikimedia.org/wikipedia/en/1/17/Cathay_Pacific_logo.svg',
  'thai airways': 'https://upload.wikimedia.org/wikipedia/en/6/6b/Thai_Airways_Logo.svg',
  'emirates': 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Emirates_logo.svg',
  'qatar airways': 'https://upload.wikimedia.org/wikipedia/en/9/9b/Qatar_Airways_Logo.svg',
  'british airways': 'https://upload.wikimedia.org/wikipedia/en/4/42/British_Airways_Logo.svg',
  'lufthansa': 'https://upload.wikimedia.org/wikipedia/commons/b/b8/Lufthansa_Logo_2018.svg',
  'air france': 'https://upload.wikimedia.org/wikipedia/commons/4/44/Air_France_Logo.svg',
  'ana': 'https://upload.wikimedia.org/wikipedia/commons/9/98/All_Nippon_Airways_Logo.svg',
  'japan airlines': 'https://upload.wikimedia.org/wikipedia/commons/5/58/JAL_logo_2011.svg',
  'korean air': 'https://upload.wikimedia.org/wikipedia/en/3/3b/Korean_Air_Logo.svg',
  'garuda indonesia': 'https://upload.wikimedia.org/wikipedia/en/9/9a/Garuda_Indonesia_Logo_2009.svg',
  'virgin australia': 'https://upload.wikimedia.org/wikipedia/en/4/4f/Virgin_Australia_logo.svg',
  'air new zealand': 'https://upload.wikimedia.org/wikipedia/en/2/24/Air_New_Zealand_logo.svg',
};

function airlineLogo(name) {
  if (!name) return '';
  const url = AIRLINE_LOGOS[name.toLowerCase().trim()];
  if (!url) return '';
  return `<img src="${url}" alt="" class="td-airline-logo" loading="lazy">`;
}

function airportFlag(code) {
  if (!code) return '';
  const flag = IATA_TO_FLAG[code.toUpperCase().trim()];
  return flag ? flagImg(flag, 16) : '';
}

const WEATHER_LABELS = {
  sunny: 'Sunny', clear: 'Clear', 'partly cloudy': 'Pt. Cloudy', 'partly sunny': 'Pt. Sunny',
  cloudy: 'Cloudy', overcast: 'Overcast', rainy: 'Rain', rain: 'Rain', showers: 'Showers',
  stormy: 'Storm', thunderstorm: 'Storm', snowy: 'Snow', snow: 'Snow',
  foggy: 'Fog', fog: 'Fog', windy: 'Windy', default: ''
};

function weatherLabel(condition) {
  if (!condition) return WEATHER_LABELS.default;
  return WEATHER_LABELS[condition.toLowerCase().trim()] || WEATHER_LABELS.default;
}

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str || '';
  return el.innerHTML;
}

function formatDate(dateStr) {
  return formatWeekdayDate(dateStr);
}

function formatDuration(minutes) {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatCost(amount, symbol) {
  if (!amount || amount === 0) return 'Free';
  return `${symbol || '$'}${formatNumber(amount)}`;
}

function catIcon(category) {
  if (!category) return CATEGORY_ICONS.default;
  return CATEGORY_ICONS[category.toLowerCase().trim()] || CATEGORY_ICONS.default;
}

function transportIcon(mode) {
  if (!mode) return TRANSPORT_ICONS.default;
  return TRANSPORT_ICONS[mode.toLowerCase().trim()] || TRANSPORT_ICONS.default;
}

function deriveTags(trip) {
  const tags = [];
  const ws = trip.wizard_state;
  if (!ws) return tags;
  const pace = ws.style?.pace || 3;
  if (pace >= 4) tags.push('fast-paced');
  else if (pace <= 2) tags.push('relaxed');
  else tags.push('balanced');
  const budget = ws.budget?.dailyAmount || 0;
  if (budget >= 300) tags.push('luxury');
  else if (budget >= 100) tags.push('mid-range');
  else if (budget > 0) tags.push('budget');
  const interests = ws.style?.activities || [];
  interests.slice(0, 3).forEach(i => tags.push(i));
  return tags;
}

function classifyTransportType(mode) {
  if (!mode) return 'private';
  const m = mode.toLowerCase().trim();
  if (m === 'walk' || m === 'bicycle') return 'walk';
  if (['tram', 'bus', 'train', 'metro', 'subway', 'ferry'].includes(m)) return 'public';
  return 'private';
}

function parseTransportText(text) {
  if (!text) return null;

  const parts = text.split(/,?\s+then\s+/i);
  const main = parts[0];
  const extra = parts.length > 1 ? parts.slice(1).join(', then ') : null;

  const serviceMatch = main.match(/^(Tram|Bus|Train|Metro|Ferry|Subway|Line|Route)\s*([\d\w]+(?:\s*,\s*[\d\w]+)*)?/i);
  if (!serviceMatch) {
    return { service: null, from: null, to: null, route: main, extra };
  }

  const service = (serviceMatch[1] + (serviceMatch[2] ? ' ' + serviceMatch[2] : '')).trim();
  let route = main.slice(serviceMatch[0].length).trim();
  route = route.replace(/^from\s+/i, '');

  const toMatch = route.match(/^(.+?)\s+to\s+(.+)$/i);
  return {
    service,
    from: toMatch ? toMatch[1].trim() : null,
    to: toMatch ? toMatch[2].trim() : null,
    route: !toMatch ? route : null,
    extra
  };
}

function renderGettingThere(activity) {
  const opts = activity.transport_options;
  const hasOpts = Array.isArray(opts) && opts.length > 0;

  if (!hasOpts && !activity.getting_there) return '';

  if (hasOpts) {
    return `
      <div class="td-getting-there">
        <div class="td-getting-there-gutter"></div>
        <div class="td-getting-there-line"></div>
        <div class="td-getting-there-card">
          <div class="td-getting-there-header">
            <span class="td-getting-there-icon">${ICONS.chevronDown}</span>
            <span class="td-getting-there-label">Getting There</span>
          </div>
          <div class="td-transport-grid">
            ${opts.map(o => {
              const type = classifyTransportType(o.mode);
              const parsed = parseTransportText(o.label);
              const routeHtml = parsed && parsed.service
                ? (parsed.from && parsed.to
                  ? `<div class="td-transport-stops">
                      <div class="td-transport-stop"><span class="td-transport-stop-icon td-transport-stop-icon--board">${mdIcon(MD.tripOrigin, 12)}</span> ${esc(parsed.from)}</div>
                      <div class="td-transport-stop"><span class="td-transport-stop-icon td-transport-stop-icon--alight">${mdIcon(MD.flag, 12)}</span> ${esc(parsed.to)}</div>
                    </div>`
                  : `<span class="td-transport-route-text">${esc(parsed.route || '')}</span>`)
                : '';
              const pillHtml = parsed && parsed.service
                ? `<span class="td-transport-pill${type === 'walk' ? ' td-transport-pill--walk' : ''}">${esc(parsed.service)}</span>`
                : '';
              const modeIcon = TRANSPORT_ICONS[o.mode?.toLowerCase()] || TRANSPORT_ICONS.default;
              return `
                <div class="td-transport-option td-transport-option--${type}">
                  <div class="td-transport-option-top">
                    <span class="td-transport-option-icon">${modeIcon}</span>
                    <div class="td-transport-option-label">
                      ${pillHtml || `<span class="td-transport-route-text">${esc(o.label)}</span>`}
                      ${routeHtml}
                    </div>
                  </div>
                  <div class="td-transport-option-meta">
                    <span>${esc(o.duration)}</span>
                    <span>${esc(o.cost)}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  const icon = transportIcon(activity.transport_mode);
  const hasMeta = activity.transport_duration || activity.transport_cost;
  const parsed = parseTransportText(activity.getting_there);

  const stepsHtml = parsed && (parsed.service || parsed.from)
    ? `<div class="td-getting-there-steps">
        <div class="td-getting-there-step">
          ${parsed.service ? `<span class="td-transport-pill">${esc(parsed.service)}</span>` : ''}
          ${parsed.from && parsed.to
            ? `<div class="td-transport-stops">
                <div class="td-transport-stop"><span class="td-transport-stop-icon td-transport-stop-icon--board">${mdIcon(MD.tripOrigin, 12)}</span> ${esc(parsed.from)}</div>
                <div class="td-transport-stop"><span class="td-transport-stop-icon td-transport-stop-icon--alight">${mdIcon(MD.flag, 12)}</span> ${esc(parsed.to)}</div>
              </div>`
            : `<span class="td-transport-route-text">${esc(parsed.route || '')}</span>`}
        </div>
        ${parsed.extra ? `
          <div class="td-getting-there-step">
            <span class="td-transport-pill td-transport-pill--walk">${esc(parsed.extra[0].toUpperCase() + parsed.extra.slice(1))}</span>
          </div>
        ` : ''}
      </div>`
    : `<div class="td-getting-there-route">${esc(activity.getting_there)}</div>`;

  return `
    <div class="td-getting-there">
      <div class="td-getting-there-gutter"></div>
      <div class="td-getting-there-line"></div>
      <div class="td-getting-there-card">
        <div class="td-getting-there-header">
          <span class="td-getting-there-icon">${icon}</span>
          <span class="td-getting-there-label">Getting There</span>
        </div>
        ${stepsHtml}
        ${hasMeta ? `
          <div class="td-getting-there-meta">
            ${activity.transport_duration ? `<span class="td-getting-there-chip">${esc(activity.transport_duration)}</span>` : ''}
            ${activity.transport_cost ? `<span class="td-getting-there-chip">${esc(activity.transport_cost)}</span>` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderActivity(activity, currencySymbol, isFirst) {
  const icon = catIcon(activity.category);
  const cost = formatCost(activity.cost_amount, currencySymbol);
  const duration = formatDuration(activity.duration_minutes);
  const time = activity.start_time || '';
  const lat = Number(activity.latitude);
  const lng = Number(activity.longitude);
  const mapsUrl = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0
    ? `https://maps.google.com/?q=${lat},${lng}`
    : '';

  return `
    ${!isFirst ? renderGettingThere(activity) : ''}
    <div class="td-activity">
      ${time ? `<div class="td-activity-time">${esc(time)}</div>` : '<div class="td-activity-time"></div>'}
      <div class="td-activity-dot"></div>
      <div class="td-activity-card">
        <div class="td-activity-card-header">
          <span class="td-activity-icon">${icon}</span>
          <div class="td-activity-card-info">
            <div class="td-activity-title">${esc(activity.title)}</div>
            ${activity.venue_name ? `<div class="td-activity-venue">${esc(activity.venue_name)}${mapsUrl ? ` <a href="${mapsUrl}" target="_blank" rel="noopener" class="td-maps-link">Map ${ICONS.openInNew}</a>` : ''}</div>` : ''}
          </div>
          <div class="td-activity-card-cost">
            <span class="td-cost-badge">${cost}</span>
            ${duration ? `<span class="td-duration">${duration}</span>` : ''}
          </div>
        </div>
        ${activity.description ? `<div class="td-activity-desc">${esc(activity.description)}</div>` : ''}
        ${activity.tips ? `<div class="td-activity-tip"><span class="td-tip-icon">${ICONS.info}</span> ${esc(activity.tips)}</div>` : ''}
        ${activity.venue_name ? `<div class="td-activity-photo" data-venue="${esc(activity.venue_name)}" ${lat ? `data-lat="${lat}"` : ''} ${lng ? `data-lng="${lng}"` : ''}></div>` : ''}
      </div>
    </div>
  `;
}

function tripHeader(trip) {
  const days = trip.itinerary_days || [];
  const ws = trip.wizard_state;
  const wsDest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  const sym = wsDest?.currencySymbol || trip.budget_currency_symbol || '$';
  const tags = deriveTags(trip);
  const shortTitle = ws?.multiCity && ws?.destinations?.length > 0
    ? ws.destinations.map(d => d.name).join(' → ')
    : ws?.destination?.name || trip.title || 'My Trip';

  let totalCost = 0;
  let totalActivities = 0;
  for (const d of days) {
    for (const a of d.activities || []) {
      totalCost += a.cost_amount || 0;
      totalActivities++;
    }
  }

  const flag = ws?.multiCity
    ? ws?.destinations?.[0]?.flag
    : ws?.destination?.flag;
  const heroImage = ws?.multiCity
    ? ws?.destinations?.[0]?.image
    : ws?.destination?.image;

  const dateRange = formatDateRange(trip.start_date, trip.end_date);

  const dayCount = days.length || (trip.start_date && trip.end_date
    ? Math.round((new Date(trip.end_date + 'T00:00:00') - new Date(trip.start_date + 'T00:00:00')) / 86400000) + 1
    : 0);

  return { days, dayCount, sym, tags, shortTitle, totalCost, totalActivities, flag, heroImage, dateRange };
}

export async function renderTripDetail(tripId) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="td-wrap"><div class="td-loading">Loading trip...</div></div>`;

  const { data: trip, error } = await fetchTripById(tripId);

  if (error || !trip) {
    app.innerHTML = `
      <div class="td-wrap">
        <button class="td-back" data-action="back">${ICONS.arrowBack} Back</button>
        <div class="td-error">${esc(error || 'Trip not found')}</div>
      </div>
    `;
    app.querySelector('[data-action="back"]')?.addEventListener('click', () => navigate('/'));
    return;
  }

  if (!getHomeCurrency()) {
    try {
      const { fetchProfile } = await import('../data/profile-repository.js');
      const { data: profile } = await fetchProfile();
      if (profile?.home_currency) {
        setHomeCurrency(profile.home_currency, profile.home_currency_symbol || '$');
      }
    } catch {}
  }

  renderDayPicker(app, trip);
}

function renderFlightContent(extras, trip) {
  const flights = extras?.flights;
  if (!flights) return '';

  const renderLeg = (leg, label, trip) => {
    if (!leg) return '';
    const routeParts = (leg.route || '').split(/\s*[→➔>]\s*/);
    const from = routeParts[0] || '???';
    const to = routeParts[1] || '???';
    const logo = airlineLogo(leg.airline);
    const flightNo = leg.flightNumber || '';
    const gfDate = label === 'Outbound' ? trip?.start_date : trip?.end_date;
    const gfParams = new URLSearchParams({ q: `Flights from ${from} to ${to}${gfDate ? ` on ${gfDate}` : ''}` });
    const gfLink = `https://www.google.com/travel/flights?${gfParams.toString()}`;
    return `
      <div class="td-flight-leg">
        <div class="td-flight-leg-header">
          <span class="td-flight-leg-label">${esc(label)}</span>
          <span class="td-flight-leg-airline">${logo || esc(leg.airline)}${flightNo ? `<span class="td-flight-number">${esc(flightNo)}</span>` : ''}</span>
        </div>
        <div class="td-flight-route">
          <div class="td-flight-endpoint">
            <div class="td-flight-code">${esc(from)}</div>
            <div class="td-flight-flag">${airportFlag(from)}</div>
          </div>
          <div class="td-flight-route-line">
            <span class="td-flight-route-dash"></span>
            <span class="td-flight-route-plane">${SECTION_ICONS.flights}</span>
            <span class="td-flight-route-dash"></span>
          </div>
          <div class="td-flight-endpoint">
            <div class="td-flight-code">${esc(to)}</div>
            <div class="td-flight-flag">${airportFlag(to)}</div>
          </div>
        </div>
        <div class="td-flight-duration">${esc(leg.duration)}</div>
        <div class="td-flight-bottom">
          <div class="td-flight-price">${addThousandSeps(esc(leg.priceRange))}</div>
          <a class="td-flight-book" href="${esc(gfLink)}" target="_blank" rel="noopener noreferrer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Google Flights
          </a>
        </div>
        ${leg.tips ? `<div class="td-flight-tip"><span class="td-tip-icon">${ICONS.info}</span> ${esc(leg.tips)}</div>` : ''}
      </div>
    `;
  };

  return `
    <div class="td-flight-legs">
      ${renderLeg(flights.outbound, 'Outbound', trip)}
      ${renderLeg(flights.inbound, 'Return', trip)}
    </div>
  `;
}

const TRANSPORT_MODE_ICONS = { ferry: '⛴️', bus: '🚌', train: '🚂', drive: '🚗' };

function renderTransportContent(extras) {
  const transport = extras?.transport;
  if (!transport) return '';

  const renderLeg = (leg, label) => {
    if (!leg) return '';
    const routeParts = (leg.route || '').split(/\s*[→➔>]\s*/);
    const from = routeParts[0] || '???';
    const to = routeParts[1] || '???';
    const icon = TRANSPORT_MODE_ICONS[leg.mode] || '🚌';
    return `
      <div class="td-flight-leg">
        <div class="td-flight-leg-header">
          <span class="td-flight-leg-label">${esc(label)}</span>
          <span class="td-flight-leg-airline">${icon} ${esc(leg.operator || '')}</span>
        </div>
        <div class="td-flight-route">
          <div class="td-flight-endpoint">
            <div class="td-flight-code">${esc(from)}</div>
            ${leg.terminal ? `<div class="td-flight-flag" style="font-size: 0.65rem;">${esc(leg.terminal)}</div>` : ''}
          </div>
          <div class="td-flight-route-line">
            <span class="td-flight-route-dash"></span>
            <span class="td-flight-route-plane" style="font-size: 1.1rem;">${icon}</span>
            <span class="td-flight-route-dash"></span>
          </div>
          <div class="td-flight-endpoint">
            <div class="td-flight-code">${esc(to)}</div>
          </div>
        </div>
        <div class="td-flight-duration">${esc(leg.duration)}${leg.frequency ? ` · ${esc(leg.frequency)}` : ''}</div>
        <div class="td-flight-bottom">
          <div class="td-flight-price">${addThousandSeps(esc(leg.priceRange))}</div>
        </div>
        ${leg.tips ? `<div class="td-flight-tip"><span class="td-tip-icon">${ICONS.info}</span> ${esc(leg.tips)}</div>` : ''}
      </div>
    `;
  };

  return `
    <div class="td-flight-legs">
      ${renderLeg(transport.outbound, 'Outbound')}
      ${renderLeg(transport.inbound, 'Return')}
    </div>
  `;
}

const ACCOM_ICON_SEARCH = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
const ACCOM_ICON_EXTERNAL = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

function accomBookingLinks(name, area) {
  const q = encodeURIComponent(`${name} ${area || ''}`);
  return [
    { label: 'Booking.com', url: `https://www.booking.com/searchresults.html?ss=${q}`, icon: ACCOM_ICON_SEARCH },
    { label: 'Trip.com', url: `https://www.trip.com/hotels/?keyword=${q}`, icon: ACCOM_ICON_SEARCH },
    { label: 'Direct', url: `https://www.google.com/search?q=${encodeURIComponent(`${name} official site booking`)}`, icon: ACCOM_ICON_EXTERNAL },
  ];
}

function renderAccommodationContent(extras) {
  const accom = extras?.accommodation;
  if (!Array.isArray(accom) || accom.length === 0) return '';
  const BADGE_COLORS = {
    'Recommended': 'var(--terracotta)',
    'Best Value': 'var(--teal)',
    'Best Location': 'var(--teal)',
    'Luxury Pick': '#B68D40'
  };

  function parseFeatures(highlights) {
    if (!highlights) return [];
    return highlights
      .split(/[.,;]\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 2)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1));
  }

  return `
    <div class="td-accom-grid">
      ${accom.map(a => {
        const features = parseFeatures(a.highlights);
        return `
          <div class="td-accom-option">
            <div class="td-accom-head">
              <div class="td-accom-head-text">
                <div class="td-accom-name">${esc(a.name)}</div>
                <div class="td-accom-area">${esc(a.area)} · ${esc(a.type)}</div>
              </div>
              ${a.badge ? `<span class="td-accom-badge" style="background: ${BADGE_COLORS[a.badge] || 'var(--terracotta)'}">${esc(a.badge)}</span>` : ''}
            </div>
            <div class="td-accom-price">${esc(a.priceRange)}</div>
            ${features.length > 0 ? `
              <ul class="td-accom-features">
                ${features.map(f => `<li>${esc(f)}</li>`).join('')}
              </ul>
            ` : ''}
            <div class="td-accom-links">
              ${accomBookingLinks(a.name, a.area).map(l => `
                <a class="td-accom-link" href="${l.url}" target="_blank" rel="noopener noreferrer">${l.icon} ${l.label}</a>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderBookingChecklist(extras, tripId) {
  const groups = extras?.bookingChecklist;
  if (!Array.isArray(groups) || groups.length === 0) return '';
  const stored = JSON.parse(localStorage.getItem(`checklist-${tripId}`) || '{}');
  return `
    <div class="td-section-card" data-section="checklist">
      <div class="td-section-header">
        <span class="td-section-icon">${mdIcon(MD.checklist, 20)}</span>
        <h3 class="td-section-title">Booking Checklist</h3>
      </div>
      ${groups.map(g => `
        <div class="td-checklist-group">
          <div class="td-checklist-group-label">${esc(g.group)}</div>
          <div class="td-checklist-items">
            ${(g.items || []).map(it => {
              const key = (it.label || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
              return `
                <label class="td-check-item ${stored[key] ? 'td-check-item--done' : ''}">
                  <input type="checkbox" data-check-key="${key}" ${stored[key] ? 'checked' : ''}>
                  <span class="td-check-content">
                    <span class="td-check-label">${esc(it.label)}</span>
                    <span class="td-check-meta">Day ${it.day || '?'} · ${esc(it.note || '')}</span>
                  </span>
                  ${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener" class="td-check-link">Book ${ICONS.openInNew}</a>` : ''}
                </label>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function bindChecklist(container, tripId) {
  container.querySelectorAll('.td-check-item input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.checkKey;
      const stored = JSON.parse(localStorage.getItem(`checklist-${tripId}`) || '{}');
      if (cb.checked) stored[key] = true;
      else delete stored[key];
      localStorage.setItem(`checklist-${tripId}`, JSON.stringify(stored));
      cb.closest('.td-check-item').classList.toggle('td-check-item--done', cb.checked);
    });
  });
}

function renderTripQuickChecklist(extras, tripId) {
  const stored = JSON.parse(localStorage.getItem(`trip-quick-${tripId}`) || '{}');
  const items = [];
  if (extras?.flights) {
    items.push({ key: 'flights', label: 'Flights', icon: MD.flightTakeoff, target: 'flights' });
  } else if (extras?.transport) {
    items.push({ key: 'transport', label: 'Transport', icon: MD.tram, target: 'transport' });
  }
  if (Array.isArray(extras?.accommodation) && extras.accommodation.length > 0) {
    items.push({ key: 'accommodation', label: 'Accommodation', icon: MD.hotel, target: 'accommodation' });
  }
  if (Array.isArray(extras?.bookingChecklist) && extras.bookingChecklist.length > 0) {
    items.push({ key: 'reservations', label: 'Reservations', icon: MD.ticket, target: 'checklist' });
  }
  if (items.length === 0) return '';
  const doneCount = items.filter(i => stored[i.key]).length;
  return `
    <div class="td-quick-checklist">
      <div class="td-quick-checklist-header">
        <span class="td-quick-checklist-title">Trip prep</span>
        <span class="td-quick-checklist-progress">${doneCount}/${items.length}</span>
      </div>
      <div class="td-quick-checklist-bar">
        <div class="td-quick-checklist-fill" style="width: ${items.length > 0 ? (doneCount / items.length * 100) : 0}%"></div>
      </div>
      <div class="td-quick-checklist-items">
        ${items.map(item => {
          const done = stored[item.key];
          return `
            <div class="td-quick-check ${done ? 'td-quick-check--done' : ''}" data-scroll-to="${item.target}">
              <div class="td-quick-check-icon ${done ? 'td-quick-check-icon--done' : ''}">${done ? mdIcon(MD.checkCircle, 20) : mdIcon(item.icon, 20)}</div>
              <span class="td-quick-check-label">${item.label}</span>
              <input type="checkbox" data-quick-key="${item.key}" ${done ? 'checked' : ''}>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function bindQuickChecklist(container, tripId) {
  const checklist = container.querySelector('.td-quick-checklist');
  container.querySelectorAll('.td-quick-check').forEach(row => {
    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      const key = checkbox.dataset.quickKey;
      const stored = JSON.parse(localStorage.getItem(`trip-quick-${tripId}`) || '{}');
      if (checkbox.checked) stored[key] = true;
      else delete stored[key];
      localStorage.setItem(`trip-quick-${tripId}`, JSON.stringify(stored));
      row.classList.toggle('td-quick-check--done', checkbox.checked);
      const iconEl = row.querySelector('.td-quick-check-icon');
      iconEl.classList.toggle('td-quick-check-icon--done', checkbox.checked);
      if (checkbox.checked) iconEl.innerHTML = mdIcon(MD.checkCircle, 20);
      else iconEl.innerHTML = mdIcon(MD[{ flights: 'flightTakeoff', transport: 'tram', accommodation: 'hotel', reservations: 'ticket' }[key]] || 'place', 20);
      if (checklist) {
        const total = checklist.querySelectorAll('.td-quick-check').length;
        const done = checklist.querySelectorAll('.td-quick-check--done').length;
        const prog = checklist.querySelector('.td-quick-checklist-progress');
        const fill = checklist.querySelector('.td-quick-checklist-fill');
        if (prog) prog.textContent = `${done}/${total}`;
        if (fill) fill.style.width = `${total > 0 ? (done / total * 100) : 0}%`;
      }
    });
    row.addEventListener('click', (e) => {
      if (e.target === checkbox) return;
      const target = row.dataset.scrollTo;
      const section = container.querySelector(`[data-section="${target}"]`);
      if (!section) return;
      if (section.classList.contains('td-day-card')) {
        const grid = section.closest('.td-day-grid');
        if (grid) {
          grid.querySelectorAll('.td-day-card--open').forEach(c => c.classList.remove('td-day-card--open'));
          grid.classList.add('td-day-grid--has-open');
          section.classList.add('td-day-card--open');
        }
      } else {
        section.classList.remove('td-section-card--collapsed');
      }
      setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    });
  });
}

function bindCollapsibleSections(container) {
  container.querySelectorAll('[data-toggle-section]').forEach(header => {
    header.addEventListener('click', () => {
      const card = header.closest('.td-section-card');
      card.classList.toggle('td-section-card--collapsed');
    });
  });
}

function countSectionCards(extras) {
  let n = 0;
  if (extras?.flights || extras?.transport) n++;
  if (Array.isArray(extras?.accommodation) && extras.accommodation.length > 0) n++;
  return n;
}

function calendarIcon(dayNum) {
  return `<div class="td-day-num"><svg class="td-cal-svg" width="44" height="44" viewBox="0 0 44 44" fill="none"><rect x="4" y="8" width="36" height="32" rx="6" stroke="currentColor" stroke-width="1.5" fill="currentColor" opacity=".08"/><rect x="4" y="8" width="36" height="32" rx="6" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="4" y1="16" x2="40" y2="16" stroke="currentColor" stroke-width="1.5"/><rect x="13" y="3" width="2" height="8" rx="1" fill="currentColor"/><rect x="29" y="3" width="2" height="8" rx="1" fill="currentColor"/></svg><span class="td-cal-num">${dayNum}</span></div>`;
}

const SECTION_ICONS = {
  flights: mdIcon(MD.flightTakeoff, 28),
  transport: mdIcon(MD.tram, 28),
  accommodation: mdIcon(MD.hotel, 28)
};

function buildSectionCards(extras, totalCards, trip) {
  const cards = [];
  let i = 0;
  if (extras?.flights) {
    i++;
    cards.push(`
      <div class="td-day-card td-day-card--section" data-section="flights" style="--i: ${i}; --total: ${totalCards}; animation-delay: ${(i - 1) * 80}ms">
        <div class="td-day-card-header">
          <div class="td-day-num td-day-num--section td-day-num--flights">${SECTION_ICONS.flights}</div>
          <div class="td-day-info">
            <h3 class="td-day-card-title">Flights</h3>
          </div>
          <span class="td-day-chevron">›</span>
        </div>
        <div class="td-day-card-body">
          ${renderFlightContent(extras, trip)}
        </div>
      </div>
    `);
  } else if (extras?.transport) {
    i++;
    cards.push(`
      <div class="td-day-card td-day-card--section" data-section="transport" style="--i: ${i}; --total: ${totalCards}; animation-delay: ${(i - 1) * 80}ms">
        <div class="td-day-card-header">
          <div class="td-day-num td-day-num--section td-day-num--transport">${SECTION_ICONS.transport}</div>
          <div class="td-day-info">
            <h3 class="td-day-card-title">Transport</h3>
          </div>
          <span class="td-day-chevron">›</span>
        </div>
        <div class="td-day-card-body">
          ${renderTransportContent(extras)}
        </div>
      </div>
    `);
  }
  if (Array.isArray(extras?.accommodation) && extras.accommodation.length > 0) {
    i++;
    cards.push(`
      <div class="td-day-card td-day-card--section" data-section="accommodation" style="--i: ${i}; --total: ${totalCards}; animation-delay: ${(i - 1) * 80}ms">
        <div class="td-day-card-header">
          <div class="td-day-num td-day-num--section td-day-num--accommodation">${SECTION_ICONS.accommodation}</div>
          <div class="td-day-info">
            <h3 class="td-day-card-title">Where to Stay</h3>
          </div>
          <span class="td-day-chevron">›</span>
        </div>
        <div class="td-day-card-body">
          ${renderAccommodationContent(extras)}
        </div>
      </div>
    `);
  }
  return cards.join('');
}

function renderDayPicker(app, trip) {
  const { days, dayCount, sym, tags, shortTitle, totalCost, totalActivities, flag, heroImage, dateRange } = tripHeader(trip);
  const heroFlag = flagImg(flag, 32);

  app.innerHTML = `
    <div class="td-wrap td-fade-in">
      <div class="td-topbar">
        <button class="td-back" data-action="back">${ICONS.arrowBack} Trips</button>
        <button class="td-delete" data-action="delete" data-trip-id="${trip.id}">${ICONS.delete} Delete</button>
      </div>

      ${heroImage ? `
        <div class="td-hero">
          <img class="td-hero-img" src="${esc(heroImage)}" alt="${esc(shortTitle)}" loading="eager">
          <div class="td-hero-overlay"></div>
          ${tags.length > 0 ? `<div class="td-hero-tags">${tags.map(t => `<span class="td-tag">${esc(t[0].toUpperCase() + t.slice(1))}</span>`).join('')}</div>` : ''}
          ${dateRange ? `<div class="td-hero-dates">${mdIcon(MD.calendarToday, 13)} ${esc(dateRange)}</div>` : ''}
          <div class="td-hero-caption">
            ${heroFlag ? `<span class="td-hero-flag">${heroFlag}</span>` : ''}
            <h1 class="td-hero-title">${esc(shortTitle)}</h1>
          </div>
        </div>
      ` : ''}

      <header class="td-header ${heroImage ? 'td-header--has-hero' : ''}">
        ${!heroImage ? `<span class="td-emoji">${heroFlag || trip.emoji || mdIcon(MD.place, 28)}</span><h1 class="td-title">${esc(shortTitle)}</h1>` : ''}
        ${!heroImage && tags.length > 0 ? `<div class="td-tags">${tags.map(t => `<span class="td-tag">${esc(t[0].toUpperCase() + t.slice(1))}</span>`).join('')}</div>` : ''}
        <div class="td-meta-row">
          <div class="td-meta">
            ${trip.travelers ? `<span>${trip.travelers} traveler${trip.travelers > 1 ? 's' : ''}</span>` : ''}
            <span>${dayCount} day${dayCount !== 1 ? 's' : ''}</span>
            <span>${totalActivities} activities</span>
          </div>
          ${(() => {
            if (!trip.start_date) return '';
            const now = new Date();
            const start = new Date(trip.start_date + 'T00:00:00');
            const diff = Math.ceil((start - now) / 86400000);
            if (diff < 0) return '';
            const label = diff === 0 ? 'Departing today!' : diff === 1 ? '1 day to departure' : `${diff} days to departure`;
            return `<div class="td-countdown">${mdIcon(MD.flightTakeoff, 14)} ${label}</div>`;
          })()}
        </div>
      </header>

      ${renderTripQuickChecklist(trip.extras, trip.id)}

      <div class="td-day-grid">
        ${(() => { const offset = countSectionCards(trip.extras); const total = days.length + offset; return buildSectionCards(trip.extras, total, trip) + days.map((d, i) => {
          const acts = d.activities || [];
          const dayCost = acts.reduce((sum, a) => sum + (a.cost_amount || 0), 0);
          const dateStr = d.date ? formatDate(d.date) : '';
          return `
            <div class="td-day-card" data-day-index="${i}" style="--i: ${i + offset + 1}; --total: ${total}; animation-delay: ${(i + offset) * 80}ms">
              <div class="td-day-card-header">
                ${calendarIcon(d.day_number)}
                <div class="td-day-info">
                  <h3 class="td-day-card-title">${esc(d.title || `Day ${d.day_number}`)}</h3>
                  ${dateStr ? `<span class="td-day-date">${dateStr}${d.weather?.highC != null ? ` <span class="td-day-weather">${d.weather.lowC}–${d.weather.highC}° ${weatherLabel(d.weather.condition)}</span>` : ''}</span>` : ''}
                </div>
                <div class="td-day-right">
                  <span class="td-day-count">${acts.length} activities</span>
                  <span class="td-day-cost">${formatCost(dayCost, sym)}</span>
                </div>
                <span class="td-day-chevron">›</span>
              </div>
              <div class="td-day-card-body">
                <div class="td-timeline">
                  ${acts.map((a, ai) => renderActivity(a, sym, ai === 0)).join('')}
                </div>
                <div class="td-day-footer">
                  <span>Day ${d.day_number} total</span>
                  <span class="td-day-footer-cost">${formatCost(dayCost, sym)}</span>
                </div>
              </div>
            </div>
          `;
        }).join(''); })()}
      </div>

      ${totalCost > 0 ? (() => {
        const ws = trip.wizard_state;
        const wsDest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
        const destCode = wsDest?.currencyCode || trip.budget_currency || 'USD';
        const home = getHomeCurrency();
        const homeCode = home?.code || '';
        const homeSym = home?.symbol || '';
        const showConversion = homeCode && homeCode !== destCode;
        const homeTotal = showConversion ? convert(totalCost, destCode, homeCode) : 0;
        const rate = showConversion ? (homeTotal / totalCost) : 0;
        const refAmounts = [50, 100, 200, 500];
        return `
        <div class="td-total">
          <div class="td-total-label">Estimated Trip Total</div>
          <div class="td-total-amount">${formatCost(totalCost, sym)}</div>
          <div class="td-total-sub">${dayCount} days · ${totalActivities} activities</div>
          ${showConversion ? `
            <div class="td-total-home">≈ ${homeSym}${formatNumber(homeTotal)} ${homeCode}</div>
            <div class="td-exchange">
              <div class="td-exchange-label">${mdIcon(MD.info, 14)} Exchange Rate</div>
              <div class="td-exchange-hero">
                <span class="td-exchange-from">${destCode} →</span>
                <span class="td-exchange-value">${rate.toFixed(3)}</span>
                <span class="td-exchange-to">→ ${homeCode}</span>
              </div>
              <div class="td-exchange-grid">
                ${refAmounts.map(a => `
                  <div class="td-exchange-tile">
                    <span class="td-exchange-tile-from">${sym}${formatNumber(a)}</span>
                    <span class="td-exchange-tile-to">${homeSym}${formatNumber(convert(a, destCode, homeCode))}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;
      })() : ''}

      ${renderBookingChecklist(trip.extras, trip.id)}
    </div>
  `;

  app.querySelector('[data-action="back"]')?.addEventListener('click', () => navigate('/'));
  bindDelete(app);
  bindDayCards(app);
  bindChecklist(app, trip.id);
  bindQuickChecklist(app, trip.id);
  bindCollapsibleSections(app);
  loadActivityPhotos(app);
}

function loadActivityPhotos(container) {
  const photoEls = container.querySelectorAll('.td-activity-photo[data-venue]');
  if (!photoEls.length) return;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const el = entry.target;
      const venue = el.dataset.venue;
      const lat = parseFloat(el.dataset.lat);
      const lng = parseFloat(el.dataset.lng);
      const location = (!isNaN(lat) && !isNaN(lng) && lat !== 0) ? { lat, lng } : null;

      fetchPlacePhotoByQuery(venue, location, 600).then(url => {
        if (!url) { el.remove(); return; }
        const img = document.createElement('img');
        img.src = url;
        img.alt = venue;
        img.className = 'td-activity-photo-img';
        img.loading = 'lazy';
        el.appendChild(img);
        el.classList.add('td-activity-photo--loaded');
      });
    }
  }, { rootMargin: '200px' });

  photoEls.forEach(el => observer.observe(el));
}

function bindDayCards(container) {
  const grid = container.querySelector('.td-day-grid');
  if (!grid) return;

  grid.querySelectorAll('.td-day-card').forEach(card => {
    card.addEventListener('animationend', () => {
      card.style.animation = 'none';
    }, { once: true });
  });

  grid.querySelectorAll('.td-day-card-header').forEach(header => {
    header.addEventListener('click', () => {
      const card = header.closest('.td-day-card');
      const wasOpen = card.classList.contains('td-day-card--open');

      grid.querySelectorAll('.td-day-card--open').forEach(c =>
        c.classList.remove('td-day-card--open')
      );

      if (wasOpen) {
        grid.classList.remove('td-day-grid--has-open');
      } else {
        grid.classList.add('td-day-grid--has-open');
        card.classList.add('td-day-card--open');
        setTimeout(() => {
          header.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
    });
  });
}

function bindDelete(container) {
  container.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
    const tripId = e.currentTarget.dataset.tripId;
    if (!confirm('Delete this trip? This cannot be undone.')) return;
    const { error } = await deleteTrip(tripId);
    if (error) {
      alert('Failed to delete: ' + error);
      return;
    }
    navigate('/');
  });
}
