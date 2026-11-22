// About Trippy, in English. The content shape is documented in js/site/content.js. The page's own
// blocks (the plan sketch, the steps, the two lists, the view switch, the square layout) are built by
// js/site/about/blocks.js from the words below, styled by css/components/site-about.css and brought
// to life by js/site/about/mount.js. A translation is a copy of this file with its own words: keep the
// section ids, and pass translated places to demoHtml and mountAbout if the sample plan is translated.
import '../../../css/components/site-about.css';
import { demoHtml, limitsHtml, squareHtml, stepsHtml, viewsHtml } from '../about/blocks.js';
import { mountAbout } from '../about/mount.js';

const BASE_URL = import.meta.env?.BASE_URL || '/';

const DEMO = {
  legendPlace: 'Place',
  legendDays: 'Length',
  daysOption: '{n} days',
  note: 'This sample was written by hand for this page and nothing is sent anywhere when you change it. The places are real; the prices are round figures to show the layout, so do not budget from them.',
};

const STEPS = {
  openAll: 'Open all steps',
  closeAll: 'Close all steps',
  next: 'Next: {title}',
  steps: [
    {
      title: 'You describe the trip',
      summary: 'Seven short screens',
      body: [
        'The planner asks where you are going (one city or several), when and how many of you, how much comfort you want and what you would spend in a day, where you want to stay, how you want to get there, and how you like to spend your time. The last screen shows everything at once and has a box for your own notes: places you must see, food you cannot eat, things you would rather avoid, or research you have pasted in from somewhere else.',
        'If your flights or your hotel are already booked, you type them in and the plan is built around them. Day 1 starts after you land, not before. For a trip abroad it also asks which passports your group travels on, so it can tell you about visas and arrival cards.',
      ],
    },
    {
      title: 'The request goes to an AI model',
      summary: 'Google Gemini first, with two fallbacks',
      body: [
        'Your answers are turned into a written request and sent to Google\'s Gemini model. If Gemini is busy or fails, a lighter Gemini model takes over, and after that a model from Mistral. Your name and email address are not part of the request. What you typed into the notes box is.',
        'A long trip is too much for one reply, so the plan is written about four days at a time. That is why two weeks takes around five minutes and a weekend much less. You can close the window while it works. The plan carries on without you, and you can ask to be told when it is ready.',
      ],
    },
    {
      title: 'The draft comes back as a plan, not an essay',
      summary: 'Days, stops, times, costs',
      body: [
        'The model answers in a fixed structure: for each day a list of stops, each with a time, the name of the place, its address and coordinates, a tip, a cost per person, and a line on how to get there from the stop before. With the first days it also writes the trip level parts: flights from your home city, or a ferry, train or bus for somewhere close, places to stay in each city, and a list of what to book ahead.',
        'Trippy checks the reply before it keeps it. A reply that was cut off keeps its finished days and the rest is asked for again. A restaurant the plan already used on another day is dropped. Nothing replaces an older plan until the whole new one is saved, so a failed attempt leaves you with what you had.',
      ],
    },
    {
      title: 'Photos are found afterwards',
      summary: 'A real photo of the place, or none',
      body: [
        'The model does not supply pictures. For every stop, Trippy goes looking for a photo of that exact place: first in OpenStreetMap, Wikidata, Wikipedia and Wikimedia Commons, then on the venue\'s own website and in Openverse, and last on the venue\'s Google Maps listing and on web pages that name it. A photo is used only when it can be tied to the venue by an identifier, by its coordinates or by its name.',
        'When nothing can be tied to the place, the card shows a drawn placeholder. A wrong photo that looks right is worse than no photo. Every photo keeps its credit, and **Photo credits** in the footer lists the ones on the page you are on.',
      ],
    },
    {
      title: 'The map is drawn from the coordinates',
      summary: 'OpenStreetMap underneath',
      body: [
        'Each stop is placed on the map at the coordinates the model gave for it. The street map is OpenStreetMap, and the world outline in the Atlas view is from Natural Earth. When you add or change a stop yourself, the place search uses OpenStreetMap data too, and the walking distance to the next stop is worked out again.',
        'A coordinate from a model can be a street or two off, and now and then it is plainly wrong. Check the address before you set out for anywhere that matters.',
      ],
    },
    {
      title: 'Two labels are worded carefully',
      summary: 'Typical weather, Activities estimated',
      body: [
        '**Typical weather** is what the model expects for that place at that time of year, written down once when the plan was made. It is not a forecast, it does not update, and it knows nothing about the week you will be there. Use it to decide what to pack, then look at a weather service a few days before you leave.',
        '**Activities estimated** is the sum of the model\'s cost for each stop in the plan: entry tickets, meals, tours. It is per person and it leaves out flights, places to stay and getting around. The prices are the model\'s best recollection, not quotes, and they can be out of date.',
      ],
    },
    {
      title: 'Then it is yours',
      summary: 'Edit, swap, share, take it offline',
      body: [
        'You can change, add or delete any stop. **Alternatives** offers three nearby swaps for one stop. The chat panel on a trip takes requests such as "make day 3 slower" and shows the changes it proposes; nothing is saved until you accept them. You can run the whole plan again, share a read only link, invite someone by email to view or edit, and export a PDF.',
        'The trips you opened most recently are kept on your device, so the plan still opens on a plane or in a basement restaurant.',
      ],
    },
  ],
};

const LIMITS = {
  does: {
    title: 'What it does',
    items: [
      'Writes a full day by day plan from a few answers, usually in minutes.',
      'Plans around what is already fixed: booked flights, a booked hotel, days you have to work.',
      'Names real places, with an address, a map point and a line on getting there.',
      'Swaps flights for a ferry, a train or a bus when the place is close to home.',
      'Lists the visas, arrival cards and travel authorisations for the passports in your group, with links to the official sites.',
      'Takes in a trip you planned somewhere else, with its bookings, through **Import trip**.',
      'Keeps your recent trips readable with no connection.',
    ],
  },
  doesNot: {
    title: 'What it does not do',
    items: [
      'It does not sell or book anything. Links to airlines, hotels and booking sites are plain links that take you to them, and you buy there. Trippy earns no commission.',
      'It does not know live prices. Costs are estimates per person for activities, and flight and hotel prices are rough guides.',
      'It does not know what the weather will be. The weather on a plan is typical for the season, not a forecast.',
      'It does not check opening hours, closures or sold out days. A place the model remembers may have closed.',
      'It does not give legal advice on entry. The entry requirements are guidance, and the rules change, so confirm them with the authorities of each country before you pay for anything.',
      'It does not track where you are. The marker on a live day follows the clock, not your phone\'s location.',
    ],
  },
};

const VIEWS = {
  legend: 'View shown',
  isDefault: 'Default',
  alt: 'The top of the {view} dashboard on a phone, with a sample account',
  views: {
    atlas: {
      name: 'Atlas',
      text: [
        'A map and a logbook. The dashboard opens with one sentence about where you are in your plans, then the trip that is happening or coming up next.',
        'Atlas also has a page of its own, with every place you have planned drawn on a world map, and a logbook under it that shows which months of each year have a plan in them.',
      ],
    },
    departures: {
      name: 'Departures',
      text: [
        'Your trips as a departures board: one row per trip with when it leaves, how long it is, what the activities are estimated to cost and how ready it is. Figures are set in a monospaced face and the titles turn over like the flaps of an old airport board.',
        'This is the one for people who want the numbers first.',
      ],
    },
    concierge: {
      name: 'Concierge',
      text: [
        'The dashboard as a morning briefing. It tells you in a paragraph what day of the trip it is, what comes next and what is still to be settled, and the words link to the trips they name.',
        'It is the quietest of the three, with the most room for text.',
      ],
    },
  },
};

const SQUARE = {
  alt: 'The dashboard in square layout: one trip card fills the screen, with dots under it for the other cards',
  text: [
    'A few phones have a square screen, such as the Unihertz Titan 2, and a long scrolling page is miserable on them. On a screen that is close to square, Trippy turns each page into a deck of cards that you page through sideways, one card to a screen.',
    'It switches on by itself, and **Square layout** in [Settings](#/settings) forces it on or off. That choice is kept on the device, not in your account.',
  ],
  credit: 'Sample account. Photo of Seville Cathedral from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sevilla_Cathedral_-_Southeast.jpg).',
};

/** @type {import('../content.js').SitePage} */
export default {
  title: 'About Trippy',
  intro: [
    'Trippy is a travel planner that runs in your browser. You answer a few questions about a trip and an AI model writes a plan for each day, with real places, times and rough costs. Then you change whatever you do not like.',
    'It is a free, experimental service. It carries no adverts, it does not book or sell anything, and it earns no commission.',
  ],
  sections: [
    {
      id: 'what-it-is',
      heading: 'What Trippy is',
      blocks: [
        { type: 'p', text: 'Planning a trip by hand means a dozen browser tabs and a spreadsheet. Trippy does the first draft of that work. It asks where, when, who and how much, and gives back something shaped like the sample below: days with a theme, stops in an order that makes sense on a map, a time for each one and a running estimate of what the activities cost.' },
        { type: 'p', text: 'A real plan is longer than this and also carries addresses, photos, a map, flights or ground transport, places to stay and a list of things to book early. Pick a place and a length to see the outline of one.' },
        { type: 'custom', html: demoHtml(DEMO) },
        { type: 'p', text: 'The draft is a starting point. Most of the time spent in Trippy is spent after it: moving a museum to the rainy day, swapping a restaurant, adding the booking reference once the flight is paid for.' },
      ],
    },
    {
      id: 'how-a-plan-is-made',
      heading: 'How a plan gets made',
      blocks: [
        { type: 'p', text: 'Nothing here is hidden, and knowing how the plan is put together tells you which parts of it to trust. These are the steps between pressing the button and reading day 1.' },
        { type: 'custom', html: stepsHtml(STEPS) },
      ],
    },
    {
      id: 'what-it-does-and-does-not-do',
      heading: 'What it does, and what it does not do',
      blocks: [
        { type: 'p', text: 'Trippy is good at the tedious part of planning and no use at all for some other parts. Both lists are worth reading before you rely on it.' },
        { type: 'custom', html: limitsHtml(LIMITS) },
        { type: 'note', title: 'The AI can be wrong', text: 'A language model writes fluently whether or not it is right. It can place a cafe on the wrong street, quote last year\'s ticket price, or recommend somewhere that has shut. Treat a plan the way you would treat advice from a well read friend who has not been there lately, and check anything you would be upset to get wrong.' },
      ],
    },
    {
      id: 'views',
      heading: 'Three views of the same trips',
      blocks: [
        { type: 'p', text: 'People read a plan differently, so the signed in pages come in three views. They show the same trips and the same facts, arranged for different tastes. You are offered the choice the first time you sign in and can change it in [Settings](#/settings) whenever you like. Each works in a dark and a light theme.' },
        { type: 'custom', html: viewsHtml(VIEWS, { baseUrl: BASE_URL }) },
        { type: 'subheading', text: 'Square screens' },
        { type: 'custom', html: squareHtml(SQUARE, { baseUrl: BASE_URL }) },
      ],
    },
    {
      id: 'your-data',
      heading: 'Your data',
      blocks: [
        { type: 'p', text: 'You sign in with a Google account, and Trippy keeps your name, email address and profile picture from it. It also keeps what you tell it: your home city, your currency, the passport you travel on, and your trips with everything in them. The answers you give for a trip are sent to the AI provider so that it can write the plan. That provider is Google, on the free tier of its service, where Google may use what is sent to improve its products and human reviewers may read it, so keep sensitive personal details out of the free-text fields. Your recent trips are also stored on your device so that they open offline, and they are removed from it when you sign out. There are no adverts and no advertising trackers. The [privacy policy](#/privacy) sets all of this out in full, including how to see or correct what is held about you, how to delete your account yourself in Settings, and how to withdraw your consent.' },
      ],
    },
    {
      id: 'who-makes-it',
      heading: 'Who makes it',
      blocks: [
        { type: 'p', text: 'Trippy is a personal project and an experiment, made by one person, not by a company, and run from {country}. It began as a tool for planning our own trips out of Singapore, which is why the defaults lean that way: Singapore dollars, and short hops to places like Batam and Desaru among the suggestions. It plans trips from anywhere to anywhere.' },
        { type: 'p', text: 'It costs nothing to use and there is no paid version. Trippy does not sell tickets or bookings. The links to booking sites are plain links, and Trippy earns no commission and nothing else when you follow one or book there.' },
        { type: 'defs', rows: [
          { term: 'Operated by', text: '{operator}' },
          { term: 'Questions and problems', text: 'Write to: {contactEmail}' },
          { term: 'About your personal data', text: 'Write to the data protection contact: {dpoEmail}' },
          { term: 'Where it lives', text: 'The app is served at {siteUrl}' },
        ] },
      ],
    },
    {
      id: 'built-on',
      heading: 'What it is built on',
      blocks: [
        { type: 'p', text: 'Trippy is small because other people did the hard parts and shared them. These are the open data and the services it stands on.' },
        { type: 'defs', rows: [
          { term: 'OpenStreetMap', text: 'The street maps, the place search (through Photon) and the walking routes (through OSRM). Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.' },
          { term: 'Natural Earth', text: 'The outline of the world in the Atlas view. [Natural Earth](https://www.naturalearthdata.com/) is in the public domain.' },
          { term: 'Wikimedia Commons, Wikipedia and Wikidata', text: 'Most venue and cover photos, each shown with its author and licence. [Wikimedia Commons](https://commons.wikimedia.org/) is where to find the originals.' },
          { term: 'Openverse and Pexels', text: 'More photos: openly licensed ones through [Openverse](https://openverse.org/), and some trip covers from [Pexels](https://www.pexels.com/).' },
          { term: 'Venue websites and the web', text: 'When the open sources have nothing, a photo can come from the venue\'s own website, its Google Maps listing or a page that names it. Those photos stay where they are, belong to their owners, and are shown with a link to the source.' },
          { term: 'Google Gemini and Mistral', text: 'The AI models that write the plans, suggest alternatives, answer in the chat panel and check that a cover photo shows the right place.' },
          { term: 'Supabase', text: 'Sign in, the database your trips are kept in, file storage and the server functions that talk to the AI providers. The database, sign in and stored photos are hosted in Singapore.' },
          { term: 'Leaflet', text: 'The library that draws the maps.' },
          { term: 'GitHub Pages', text: 'Where the app itself is served from.' },
        ] },
      ],
    },
    {
      id: 'questions',
      heading: 'Questions people ask',
      blocks: [
        { type: 'faq', items: [
          { q: 'Is it really free?', a: 'Yes. There is no paid tier, no trial that runs out and no adverts, and Trippy earns no commission from the sites it links to. It is an experiment, so it may change or stop.' },
          { q: 'Do I need an account?', a: 'To plan a trip, yes, and the only way to sign in is with a Google account. To read a trip someone shared with you by link, no.' },
          { q: 'Does Trippy book flights or hotels?', a: 'No. It suggests them and links to the airline or the booking site, and you book there yourself. Once you have booked, you can put the flight number, times and booking reference on the trip so that everything is in one place.' },
          { q: 'How long does a plan take?', a: 'Around five minutes for a trip of ten days to two weeks, and less for a short one. You do not have to wait on the page. Close the window and come back, or ask to be notified when it is done.' },
          { q: 'How far can I trust the plan?', a: [
            'Trust the shape of it: which areas go together, how much fits in a day, what to book early. Check the details that cost money or time if they are wrong: opening days, ticket prices, whether a restaurant still exists, how long a transfer takes.',
            'Entry requirements deserve the most care. Trippy lists what it believes applies to your passports and links to the official sites. The decision belongs to the immigration authorities of each country, so read their pages yourself.',
          ] },
          { q: 'Why does the weather say "typical"?', a: 'The plan may be written months before you travel, too early for anyone to know the weather. What is shown is the usual weather for that place and month, written when the plan was made. It is not a forecast, and it stays the same however the real weather turns out.' },
          { q: 'Does it work without a connection?', a: 'Reading does. The trips you opened most recently are kept on your device and open offline, and you can install Trippy to your home screen like an app. Making a new plan, editing and the chat panel need a connection.' },
          { q: 'Can two of us plan together?', a: 'Yes. Invite someone by email as a viewer or an editor, and when one of you changes the trip the other sees it update. You can also make a read only link for people who only need to look. The link stops working after 7 days, and you can switch it off sooner.' },
          { q: 'I already planned my trip somewhere else. Can I bring it in?', a: 'Yes. **Import trip** gives you a prompt to paste into any AI assistant together with your notes, and you paste the result back. You see a preview before anything is saved, and you can undo the import.' },
          { q: 'Which languages is it in?', a: 'The footer and these pages (About, Privacy policy, Terms of use) are in English, Bahasa Melayu, Simplified Chinese and Finnish. The rest of the app, and the plans themselves, are in English for now.' },
          { q: 'How do I delete my trips or my account?', a: '**Delete all my trips** in [Settings](#/settings) removes every trip you own, for good. **Delete my account**, under Account in the same place, removes your account, your profile and everything in it, and you do it yourself. The [privacy policy](#/privacy/retention) says exactly what is removed and what cannot be.' },
        ] },
      ],
    },
  ],
};

/** Binds the plan sketch and the steps (js/site/about/mount.js). */
export const mount = (root) => mountAbout(root);
