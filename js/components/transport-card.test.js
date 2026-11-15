import { describe, it, expect } from 'vitest';
import { groundJourney, looksLikeGroundLeg, normalizeLeg, transportJourneyHtml, modeFrom } from './transport-card.js';

// From the "Singapore, Johor Bahru & Kuala Lumpur" trip: bus legs stored as flights.
const misfiled = {
  outbound: { airline: 'KTM Shuttle Tebrau (or similar)', flightNumber: 'N/A (Train)', route: 'Singapore (Woodlands) to Johor Bahru (JB Sentral)', duration: '1-2 hours', priceRange: 'S$5-15', tips: 'Book train tickets well in advance.' },
  inbound: { airline: 'Plusliner (or similar bus company)', flightNumber: 'N/A (Bus)', route: 'Kuala Lumpur (TBS) to Singapore (Lavender/Woodlands)', duration: '5-6 hours', priceRange: 'MYR60-100', tips: 'Book online.' },
};

describe('transport card', () => {
  it('spots bus and train legs that older trips stored as flights', () => {
    expect(looksLikeGroundLeg(misfiled.outbound)).toBe(true);
    expect(looksLikeGroundLeg({ airline: 'Scoot', flightNumber: 'TR892', route: 'SIN > TPE > CTS' })).toBe(false);
    const j = groundJourney({ flights: misfiled });
    expect(j.outbound).toMatchObject({ mode: 'train', operator: 'KTM Shuttle Tebrau', from: 'Singapore (Woodlands)', to: 'Johor Bahru (JB Sentral)' });
    expect(j.inbound).toMatchObject({ mode: 'bus', service: '' });
    expect(normalizeLeg({ airline: 'KTM', flightNumber: 'Shuttle Tebrau (or Bus)', route: 'Singapore (Woodlands) to Johor Bahru (JB Sentral)' }))
      .toMatchObject({ mode: 'train', operator: 'KTM', service: 'Shuttle Tebrau' });
    expect(groundJourney({ flights: { outbound: { airline: 'Scoot', flightNumber: 'TR892' } } })).toBeNull();
  });

  it('reads the older transport shape (route + terminal)', () => {
    const leg = normalizeLeg({ mode: 'Bus', operator: 'Causeway Link', route: 'JB Sentral to Singapore (various drop-off points)', terminal: 'Sultan Iskandar CIQ (Malaysia), Woodlands Checkpoint (Singapore)', duration: '60-90 minutes', priceRange: 'MYR 7-17' });
    expect(leg).toMatchObject({ mode: 'bus', from: 'JB Sentral', to: 'Singapore (various drop-off points)', terminal: expect.stringContaining('CIQ') });
  });

  it('labels a ferry by where to embark and disembark, with steps and border', () => {
    const html = transportJourneyHtml(groundJourney({ transport: {
      outbound: { mode: 'ferry', operator: 'Batam Fast', service: 'ferry', from: 'HarbourFront Centre, Singapore', to: 'Batam Centre Ferry Terminal, Batam', duration: '1h 15m', border: 'Clear Singapore immigration at HarbourFront, then Indonesian immigration at Batam Centre.',
        steps: [{ mode: 'mrt', text: 'MRT to HarbourFront', duration: '20 min' }, { mode: 'ferry', text: 'Batam Fast ferry to Batam Centre', duration: '50 min' }] },
    } }));
    expect(html).toContain('Embark at');
    expect(html).toContain('Disembark at');
    expect(html).toContain('One change on the way');
    expect(html).toContain('Clear Singapore immigration');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/Skyscanner|Google Flights|flight/i); // visible text
  });

  it('guesses the vehicle from text', () => {
    expect(modeFrom('Causeway Link CW2')).toBe('bus');
    expect(modeFrom('Majestic Fast Ferry')).toBe('ferry');
    expect(modeFrom('KTMB ETS')).toBe('train');
    expect(modeFrom('Plusliner (or similar bus company)')).toBe('bus');
    expect(modeFrom('', 'Book tickets online in advance. Choose an express bus.')).toBe('bus');
    expect(modeFrom('Coach', 'Faster than the train')).toBe('bus');
  });
});
