// Booking deep links. Trippy pre-fills dates, party size and destination and hands off to the
// booking or search site, where the traveller books. They are plain links: they carry no partner
// code, nobody pays Trippy for them and Trippy earns nothing when someone books (the owner's word,
// 2026-11-22; the Privacy policy and the Terms of use say the same, so keep the three in step).

import { logger } from '../lib/logger.js';

function clampAdults(n) {
  return Math.max(1, Math.min(parseInt(n, 10) || 2, 10));
}

// Hotel search, pre-filled with the trip's dates and party size.
export function hotelSearchLinks({ query, checkIn, checkOut, adults = 2 }) {
  adults = clampAdults(adults);
  const links = [];

  const booking = new URLSearchParams({ ss: query });
  if (checkIn) booking.set('checkin', checkIn);
  if (checkOut) booking.set('checkout', checkOut);
  booking.set('group_adults', String(adults));
  links.push({ label: 'Booking.com', url: `https://www.booking.com/searchresults.html?${booking}` });

  const trip = new URLSearchParams({ keyword: query });
  if (checkIn) trip.set('checkin', checkIn);
  if (checkOut) trip.set('checkout', checkOut);
  trip.set('adult', String(adults));
  links.push({ label: 'Trip.com', url: `https://www.trip.com/hotels/list?${trip}` });

  links.push({
    label: 'Direct',
    url: `https://www.google.com/search?q=${encodeURIComponent(`${query} official site booking`)}`,
  });
  return links;
}

// Flight search on Skyscanner: /transport/flights/<from>/<to>/<yymmdd>/<yymmdd>/
function skyDate(iso) {
  return iso ? iso.slice(2).replaceAll('-', '') : '';
}

export function flightSearchLink({ fromCity, toCity, departDate, returnDate, adults = 2 }) {
  adults = clampAdults(adults);
  const slug = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 16);
  const from = slug(fromCity) || 'anywhere';
  const to = slug(toCity) || 'anywhere';
  const dates = [skyDate(departDate), skyDate(returnDate)].filter(Boolean).join('/');
  const params = new URLSearchParams({ adultsv2: String(adults) });
  return {
    label: 'Skyscanner',
    url: `https://www.skyscanner.com/transport/flights/${from}/${to}/${dates ? dates + '/' : ''}?${params}`,
  };
}

export function trackBookingClick(provider, tripId, kind) {
  logger.info('booking', `Booking link clicked: ${provider}`, { tripId, provider, kind });
}
