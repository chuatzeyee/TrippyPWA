// The pure helpers of the departures view: text, figures in mono type, the clock, the status pill.
import { afterEach, describe, expect, it } from 'vitest';
import { setDisplayPrefs } from '../../lib/locale.js';
import { DASHBOARD_FIXTURES, TRIP_FIXTURES } from '../fixtures/models.js';
import {
  capital, clockParts, count, dayText, drawCtx, figures, flagsHtml, mono, moneyHtml, numberWord, passPhotoHtml,
  pillFor, readinessNote, savedText, sectionHead, statusHtml, stopLine, summarySentence, titleHtml, toneOf, weatherIcon,
} from './parts.js';

const M = (text) => `<span class="dep-mono">${text}</span>`;

describe('mono type for figures', () => {
  it('wraps a whole value and escapes it', () => {
    expect(mono('Wed 10 Mar 2027')).toBe(M('Wed 10 Mar 2027'));
    expect(mono('<b>')).toBe(M('&lt;b&gt;'));
    expect(mono(0)).toBe(M('0'));
  });
  it('gives nothing for an empty value', () => {
    expect(mono('')).toBe('');
    expect(mono(null)).toBe('');
    expect(mono(undefined)).toBe('');
  });
  it('wraps each figure of a sentence and leaves the words alone', () => {
    expect(figures('12 days, 11 nights')).toBe(`${M('12')} days, ${M('11')} nights`);
    expect(figures('Day 8, Day trip to Córdoba.')).toBe(`Day ${M('8')}, Day trip to Córdoba.`);
    expect(figures('about 1,090 km.')).toBe(`about ${M('1,090')} km.`);
  });
  it('keeps a clock time and a temperature range whole', () => {
    expect(figures('the last at 8:30 PM.')).toBe(`the last at ${M('8:30 PM')}.`);
    expect(figures('the last at 20:30.')).toBe(`the last at ${M('20:30')}.`);
    expect(figures('Typical 10 to 21°C, sunny.')).toBe(`Typical ${M('10 to 21°C')}, sunny.`);
    expect(figures('Typical 50 to 70°F')).toBe(`Typical ${M('50 to 70°F')}`);
    expect(figures('-2 to 3°C')).toBe(M('-2 to 3°C'));
  });
  it('escapes the words between the figures', () => {
    expect(figures('<i>3</i> & "4"')).toBe(`&lt;i&gt;${M('3')}&lt;/i&gt; &amp; &quot;${M('4')}&quot;`);
    expect(figures(null)).toBe('');
  });
  it('sets a money figure in mono and keeps "about" in the body face', () => {
    expect(moneyHtml('~€390')).toBe(`~${M('€390')}`);
    expect(moneyHtml('MAD 4,200')).toBe(M('MAD 4,200'));
    expect(moneyHtml('')).toBe('');
    expect(moneyHtml('~<b>')).toBe(`~${M('&lt;b&gt;')}`);
  });
});

describe('numbers as words', () => {
  it('spells one to ten and leaves the rest as digits', () => {
    expect(numberWord(1)).toBe('one');
    expect(numberWord(2)).toBe('two');
    expect(numberWord(10)).toBe('ten');
    expect(numberWord(11)).toBe('11');
    expect(numberWord(0)).toBe('0');
  });
});

describe('the summary sentence under the greeting', () => {
  it('names the live plans and the next departure', () => {
    expect(summarySentence(DASHBOARD_FIXTURES.ready)).toBe('One trip is happening now, and Marrakech and the Atlas foothills departs in 9 days.');
    expect(summarySentence(DASHBOARD_FIXTURES.twoLive)).toBe('Two trips are happening now, and Marrakech and the Atlas foothills departs in 9 days.');
  });
  it('copes with one half missing', () => {
    expect(summarySentence(DASHBOARD_FIXTURES.noLive)).toBe('Marrakech and the Atlas foothills departs in 9 days.');
    expect(summarySentence(DASHBOARD_FIXTURES.nothingUpcoming)).toBe('One trip is happening now.');
    expect(summarySentence(DASHBOARD_FIXTURES.empty)).toBe('');
  });
  it('says tomorrow for a departure one day away', () => {
    const { noLive } = DASHBOARD_FIXTURES;
    const model = { ...noLive, next: { ...noLive.next, daysToGo: 1 } };
    expect(summarySentence(model)).toBe('Marrakech and the Atlas foothills departs tomorrow.');
  });
});

describe('the clock', () => {
  afterEach(() => setDisplayPrefs({ timeFormat: '12h' }));
  it('reads an instant in a time zone, on the 12-hour clock by default', () => {
    expect(clockParts('2027-03-10T09:10:00+00:00', 'Europe/Madrid')).toEqual({ hours: '10', minutes: '10', marker: 'AM', text: '10:10 AM' });
    expect(clockParts('2027-03-10T09:10:00+00:00', 'Asia/Tokyo')).toEqual({ hours: '6', minutes: '10', marker: 'PM', text: '6:10 PM' });
  });
  it('follows the 24-hour pref', () => {
    setDisplayPrefs({ timeFormat: '24h' });
    expect(clockParts('2027-03-10T09:10:00+00:00', 'Asia/Tokyo')).toEqual({ hours: '18', minutes: '10', marker: '', text: '18:10' });
  });
  it('gives null for an instant or a zone it cannot read', () => {
    expect(clockParts('not a time', 'Europe/Madrid')).toBeNull();
    expect(clockParts('2027-03-10T09:10:00+00:00', 'Mars/Olympus')).toBeNull();
    expect(clockParts('2027-03-10T09:10:00+00:00', null)).toBeNull();
  });
});

describe('when a saved list was saved', () => {
  it('says the day and the time', () => {
    expect(savedText('2027-03-09T18:42:00+00:00', 'UTC')).toBe('on Tue 9 Mar at 6:42 PM');
    expect(savedText('2027-03-09T18:42:00+00:00', 'Asia/Tokyo')).toBe('on Wed 10 Mar at 3:42 AM');
    expect(savedText('2027-09-30T23:30:00+00:00', 'UTC')).toBe('on Thu 30 Sep at 11:30 PM');
  });
  it('gives nothing without a time', () => {
    expect(savedText(null, 'UTC')).toBe('');
    expect(savedText('nonsense', 'UTC')).toBe('');
  });
});

describe('a calendar date in words', () => {
  it('reads the date as written, with or without the year', () => {
    expect(dayText('2027-03-19')).toBe('Fri 19 Mar');
    expect(dayText('2027-03-19', { year: true })).toBe('Fri 19 Mar 2027');
    expect(dayText('2026-12-01', { year: true })).toBe('Tue 1 Dec 2026');
    expect(dayText('2027-09-02', { year: true })).toBe('Thu 2 Sep 2027'); // three letters, as the models write it
  });
  it('gives nothing for a missing or broken date', () => {
    expect(dayText(null)).toBe('');
    expect(dayText('')).toBe('');
    expect(dayText('19 March')).toBe('');
  });
});

describe('small rules', () => {
  it('picks a weather icon from the condition label', () => {
    expect(weatherIcon('Sunny')).toBe('sun');
    expect(weatherIcon('Clear')).toBe('sun');
    expect(weatherIcon('Pt. Sunny')).toBe('sun');
    expect(weatherIcon('Pt. Cloudy')).toBe('cloud');
    expect(weatherIcon('Rain')).toBe('cloud');
    expect(weatherIcon('')).toBe('cloud');
  });
  it('gives every plan a day colour from 1 to 7 that does not change', () => {
    for (const id of ['s-seville', 's-kyoto', 'x', '']) {
      expect(toneOf(id)).toBeGreaterThanOrEqual(1);
      expect(toneOf(id)).toBeLessThanOrEqual(7);
      expect(toneOf(id)).toBe(toneOf(id));
    }
  });
});

describe('the next stop sentence', () => {
  const stop = (time, title, venue = null) => ({ time, title, venue });
  it('counts what follows and names the last time', () => {
    expect(stopLine({ nextStop: stop('11:30 AM', 'Gardens', 'Real Alcázar'), after: 4, lastTime: '8:30 PM' })).toBe('Next stop at Real Alcázar. 4 more after it, the last at 8:30 PM.');
    expect(stopLine({ nextStop: stop('11:30 AM', 'Gardens'), after: 1, lastTime: null })).toBe('Next stop. 1 more after it.');
  });
  it('says so when it is the last one, or when nothing is left', () => {
    expect(stopLine({ nextStop: stop('6:30 PM', 'Dinner'), after: 0, lastTime: null })).toBe('Next stop, the last one today.');
    expect(stopLine({ nextStop: null, after: 0, lastTime: null })).toBe('Nothing more is planned today.');
    expect(stopLine({ nextStop: stop('11:30 AM', 'Gardens', 'Real Alcázar'), after: null })).toBe('Next stop at Real Alcázar.');
    expect(stopLine({ nextStop: stop('11:30 AM', 'Gardens'), after: null })).toBe('Next stop.');
  });
});

describe('what is left to do, in a few words', () => {
  it('names the areas still to do', () => {
    expect(readinessNote(DASHBOARD_FIXTURES.ready.cardsById['s-marrakech'].readiness)).toBe('Flights, stay, reservations');
    expect(readinessNote(DASHBOARD_FIXTURES.ready.cardsById['s-vancouver'].readiness)).toBe('Stay, entry requirements');
  });
  it('says when everything is settled, and nothing without readiness', () => {
    expect(readinessNote(DASHBOARD_FIXTURES.sharedViewer.cardsById['s-porto'].readiness)).toBe('Everything is settled');
    expect(readinessNote(null)).toBe('');
  });
});

describe('the status pill of the trip hero', () => {
  const pill = (key) => pillFor(TRIP_FIXTURES[key]);
  it('joins the phase and what is left to do', () => {
    expect(pill('upcoming')).toEqual({ kind: 'todo', text: 'Upcoming, 3 to do' });
    expect(pill('tomorrow')).toEqual({ kind: 'todo', text: 'Tomorrow, 3 to do' });
    expect(pill('undated')).toEqual({ kind: 'todo', text: 'No dates yet, 3 to do' });
    expect(pill('live')).toEqual({ kind: 'live', text: 'Live now, 3 to do' });
  });
  it('says ready when every area is done, and checking while only a check is open', () => {
    const { upcoming } = TRIP_FIXTURES;
    const done = { ...upcoming.readiness, todo: 0, pending: 0, done: 4 };
    expect(pillFor({ ...upcoming, readiness: done })).toEqual({ kind: 'ready', text: 'Upcoming, ready' });
    expect(pillFor({ ...upcoming, readiness: { ...done, done: 3, pending: 1 } })).toEqual({ kind: 'idle', text: 'Upcoming, checking' });
  });
  it('names a past plan, and a plan with no readiness, plainly', () => {
    expect(pill('past')).toEqual({ kind: 'idle', text: 'Past plan' });
    expect(pill('empty')).toEqual({ kind: 'idle', text: 'Upcoming' });
  });
  it('lets the planning state win', () => {
    expect(pill('generating')).toEqual({ kind: 'plan', text: 'Still being planned' });
    expect(pill('failed')).toEqual({ kind: 'stop', text: 'Planning stopped' });
  });
});

describe('the ctx a renderer draws with', () => {
  it('drops entry motion for people who asked for less, without changing what it was given', () => {
    const given = Object.freeze({ animate: true, reducedMotion: true, theme: 'dark' });
    expect(drawCtx(given)).toEqual({ animate: false, reducedMotion: true, theme: 'dark' });
    expect(given.animate).toBe(true);
  });
  it('hands back the same ctx when there is nothing to change', () => {
    const first = Object.freeze({ animate: true, reducedMotion: false });
    const later = Object.freeze({ animate: false, reducedMotion: true });
    expect(drawCtx(first)).toBe(first);
    expect(drawCtx(later)).toBe(later);
  });
});

describe('small markup parts', () => {
  it('counts with the right noun, and starts a sentence with a capital', () => {
    expect(count(1, 'day', 'days')).toBe('1 day');
    expect(count(12, 'day', 'days')).toBe('12 days');
    expect(capital('flights, stay')).toBe('Flights, stay');
  });
  it('a status is a lamp and its words, on glass when it lies on a photo', () => {
    expect(statusHtml('live', 'Live now')).toBe('<span class="dep-st dep-st--live"><i class="dep-lamp"></i><span>Live now</span></span>');
    expect(statusHtml('todo', 'x', { glass: true, pulse: true })).toContain('class="dep-st dep-st--todo dep-chip-glass"><i class="dep-lamp dep-lamp--pulse">');
  });
  it('draws at most three flags, and none for a code that is not a flag', () => {
    expect(flagsHtml(['at', 'sk', 'hu', 'cz']).match(/<img/g)).toHaveLength(3);
    expect(flagsHtml(['<x>'])).toBe('');
    expect(flagsHtml(null)).toBe('');
  });
  it('a section heading escapes its title and carries its id', () => {
    expect(sectionHead('dep-x-h', 'Fish & chips', '<i>1</i>')).toBe('<div class="dep-sec-h"><h2 id="dep-x-h">Fish &amp; chips</h2><i>1</i></div>');
  });
  it('the words over a pass photo are siblings of the frame, never inside it', () => {
    const cover = { kind: 'legacy', src: 'https://example.test/a.jpg', srcset: '', fallbackSrc: '', focusY: 50, credit: null };
    const html = passPhotoHtml(cover, { frame: { carry: 'cover' }, top: '<b>top</b>', bottom: '<h1>Title</h1>' });
    const frame = html.slice(html.indexOf('<div class="ui-frame'), html.indexOf('<div class="dep-photo-over">'));
    expect(frame).toContain('data-carry="cover"');
    expect(frame).not.toContain('<h1>');
    expect(html).toContain('<div class="dep-photo-over"><div class="dep-over-top"><b>top</b></div><div class="dep-over-bot"><h1>Title</h1></div></div>');
  });
});

describe('a title with its flags', () => {
  const flagsOf = (html) => (html.match(/<img/g) ?? []).length;
  it('ties the last word to the flags, so a flag is never alone on a line', () => {
    const html = titleHtml('Geneva, Zurich & Basel', ['ch'], 16);
    expect(html.startsWith('Geneva, Zurich &amp; <span class="dep-tie">Basel<span class="dep-flags">')).toBe(true);
    expect(html.endsWith('</span></span>')).toBe(true);
    expect(flagsOf(html)).toBe(1);
  });
  it('ties a title of one word whole', () => {
    expect(titleHtml('Dublin', ['ie']).startsWith('<span class="dep-tie">Dublin<span class="dep-flags">')).toBe(true);
  });
  it('leaves a long last word, or a short one with many flags, free to break', () => {
    expect(titleHtml('A week in Llanfairpwllgwyngyll', ['gb'])).not.toContain('dep-tie');
    expect(titleHtml('Helsinki, Tampere & Rovaniemi', ['fi', 'se', 'no'])).not.toContain('dep-tie');
    expect(flagsOf(titleHtml('Helsinki, Tampere & Rovaniemi', ['fi', 'se', 'no']))).toBe(3);
  });
  it('is only the escaped title without flags', () => {
    expect(titleHtml('Fish & <chips>', [])).toBe('Fish &amp; &lt;chips&gt;');
    expect(titleHtml('Fish & <chips>', null)).toBe('Fish &amp; &lt;chips&gt;');
    expect(titleHtml(null, null)).toBe('');
  });
  it('escapes the tied word', () => {
    expect(titleHtml('Now <b>', ['ie'])).toContain('<span class="dep-tie">&lt;b&gt;<span class="dep-flags">');
  });
});
