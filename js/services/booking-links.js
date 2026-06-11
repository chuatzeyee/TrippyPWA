// Affiliate booking deep links — Phase A of the booking roadmap (research.md §1).
// Trippy pre-fills dates/party/destination and hands off to trusted booking
// brands; the OTA stays merchant of record (no licence, no PCI, no support
// burden). Affiliate IDs live here in one place: empty string = plain link
// until the partner programme approves, at which point only this config changes.

import { logger } from '../lib/logger.js';

export const AFFILIATE = {
  // Booking.com via CJ/Awin network (research.md: direct programme closed to
  // new small partners). aid is appended when present.
  bookingAid: '',
  // Trip.com affiliate (allianceid/sid pair).
  tripAllianceId: '',
  tripSid: '',
  // Skyscanner via Travelpayouts (associateid).
  skyscannerRef: '',
};

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
  if (AFFILIATE.bookingAid) booking.set('aid', AFFILIATE.bookingAid);
  links.push({ label: 'Booking.com', url: `https://www.booking.com/searchresults.html?${booking}` });

  const trip = new URLSearchParams({ keyword: query });
  if (checkIn) trip.set('checkin', checkIn);
  if (checkOut) trip.set('checkout', checkOut);
  trip.set('adult', String(adults));
  if (AFFILIATE.tripAllianceId) {
    trip.set('allianceid', AFFILIATE.tripAllianceId);
    trip.set('sid', AFFILIATE.tripSid);
  }
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
  if (AFFILIATE.skyscannerRef) params.set('associateid', AFFILIATE.skyscannerRef);
  return {
    label: 'Skyscanner',
    url: `https://www.skyscanner.com/transport/flights/${from}/${to}/${dates ? dates + '/' : ''}?${params}`,
  };
}

export function trackBookingClick(provider, tripId, kind) {
  logger.info('booking', `Booking link clicked: ${provider}`, { tripId, provider, kind });
}

export const BOOKING_DISCLOSURE = 'Trippy may earn a commission from bookings made via these links, at no extra cost to you.';
