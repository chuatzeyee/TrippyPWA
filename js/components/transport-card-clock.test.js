import { describe, it, expect } from 'vitest';
import { groundJourney, transportJourneyHtml } from './transport-card.js';

// Free text on a leg that can hold a clock time is shown the way every other
// time in the app is (through the locale formatter); the stored text stays as it is.
const visible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const card = (outbound) => transportJourneyHtml(groundJourney({ transport: { outbound } }));

const FERRY = {
  mode: 'ferry', operator: 'Majestic Fast Ferry', service: 'MF 10:30', from: 'HarbourFront Centre, Singapore', to: 'Batam Centre, Batam',
  duration: '1:10', priceRange: 'S$50-60',
  frequency: 'Every 30 minutes, 07:30 to 21:45',
  terminal: 'Counters open at 06:00',
  tips: 'Last sailing back is at 21:45. Check in by 20:45.',
  steps: [{ mode: 'mrt', text: 'MRT to HarbourFront, first train 05:31', duration: '0:20' }, { mode: 'ferry', text: 'The 08:00 ferry to Batam Centre', duration: '50 min' }],
};

describe('transport card clock times', () => {
  it('shows how often it runs in 12-hour time', () => {
    expect(visible(card(FERRY))).toContain('Runs Every 30 minutes, 7:30 AM to 9:45 PM');
  });

  it('shows the terminal note in 12-hour time', () => {
    expect(visible(card(FERRY))).toContain('Terminal Counters open at 6:00 AM');
  });

  it('shows tips, the border note and the steps in 12-hour time', () => {
    const text = visible(card({ ...FERRY, border: 'Immigration at HarbourFront opens at 06:30.' }));
    expect(text).toContain('Last sailing back is at 9:45 PM. Check in by 8:45 PM.');
    expect(text).toContain('Immigration at HarbourFront opens at 6:30 AM.');
    expect(text).toContain('MRT to HarbourFront, first train 5:31 AM');
    expect(text).toContain('The 8:00 AM ferry to Batam Centre');
    expect(text).not.toMatch(/\b(0[5-8]|2[01]):\d\d\b/);
  });

  it('leaves durations, the fare and names as they are stored', () => {
    const text = visible(card(FERRY));
    expect(text).toContain('Door to door 1:10');
    expect(text).toContain('0:20');
    expect(text).toContain('Fare S$50-60');
    expect(text).toContain('Majestic Fast Ferry MF 10:30');
    expect(text).not.toContain('1:10 AM');
    expect(text).not.toContain('10:30 AM');
  });

  it('leaves times that already say am or pm alone', () => {
    const text = visible(card({ mode: 'bus', from: 'A', to: 'B', frequency: 'From 6:15 am until 11 pm', tips: 'The 7:30 PM coach is the last.' }));
    expect(text).toContain('Runs From 6:15 am until 11 pm');
    expect(text).toContain('The 7:30 PM coach is the last.');
  });

  it('keeps the stored text in 24-hour time', () => {
    const journey = groundJourney({ transport: { outbound: FERRY } });
    expect(journey.outbound.frequency).toBe('Every 30 minutes, 07:30 to 21:45');
    expect(journey.outbound.terminal).toBe('Counters open at 06:00');
    expect(journey.outbound.tips).toBe('Last sailing back is at 21:45. Check in by 20:45.');
    expect(journey.outbound.steps[1].text).toBe('The 08:00 ferry to Batam Centre');
  });

  it('still escapes the text it converts', () => {
    const html = card({ mode: 'bus', from: 'A', to: 'B', frequency: '<b>09:00</b>', tips: '"><img src=x onerror=alert(1)> at 13:00', terminal: "o'clock 14:00 <i>" });
    expect(html).toContain('&lt;b&gt;9:00 AM&lt;/b&gt;');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt; at 1:00 PM');
    expect(html).toContain('o&#39;clock 2:00 PM &lt;i&gt;');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<img');
  });
});
