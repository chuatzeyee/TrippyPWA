// Privacy policy, in English: the reference text, and the one that governs if a translation differs.
// Written for the Personal Data Protection Act 2012 of Singapore. Every statement of fact follows the
// code as audited on 2026-11-22; when the app changes what it collects, where it keeps it or who
// receives it, change this text and SITE_INFO.updated.privacy (js/data/site-info.js) together.
// The operator's name and the two contact addresses come from js/data/site-info.js, never from here.
// The content shape is documented in js/site/content.js. Section ids are fixed: translations and
// links (#/privacy/<id>) depend on them.

const PDPC = 'https://www.pdpc.gov.sg/';

/**
 * Definition rows from compact rows: the first cell is the term, the second its first line, and each
 * further cell a line that starts with its label. Rows, not a table, so that they read on a phone.
 * @param {string[]} labels the labels of the third cell onwards
 * @param {string[][]} rows
 * @returns {import('../content.js').SiteBlock}
 */
const facts = (labels, rows) => ({
  type: 'defs',
  rows: rows.map(([term, first, ...more]) => ({ term, text: [sentence(first), ...more.map((cell, index) => `**${labels[index]}** ${sentence(cell)}`)] })),
});
/** A cell as a full sentence: it ends with a full stop. */
const sentence = (text) => (/[.?!]$/.test(text) ? text : `${text}.`);

/** @type {import('../content.js').SitePage} */
export default {
  title: 'Privacy policy',
  intro: [
    'This policy says what personal data Trippy collects, why, where it is kept, who else receives it, and what you can do about it. It is written around the obligations of the Personal Data Protection Act 2012 of Singapore, which we call the PDPA below.',
    'Trippy is a free, experimental travel planner run by one person, not a company. It does not sell tickets or bookings and earns no commission from anyone. You sign in with Google, describe a trip, and an AI model writes a day by day plan that you can edit and share. In this policy "we" and "us" mean the operator of Trippy named in the next section, and "you" means the person using it.',
  ],
  sections: [
    {
      id: 'at-a-glance',
      heading: 'At a glance',
      blocks: [
        {
          type: 'cards',
          items: [
            { title: 'You sign in with Google', text: 'Google gives us your email address, your name and your profile picture. Trippy has no passwords of its own, so it never sees or stores one.' },
            { title: 'An AI model writes your plan', text: 'What you type into a trip request, free text included, is sent to Google Gemini on the free tier of Google\'s service, or to Mistral if Gemini fails. On the free tier Google may use it to improve its products and human reviewers may read it, so keep sensitive personal details out of it. Your name, email address and passport nationality are not sent.' },
            { title: 'No advertising and no tracking', text: 'Trippy sets no cookies and has no analytics script, no advertising and no tracking pixel. We do not sell personal data, and Trippy earns no commission from the sites it links to.' },
            { title: 'Your account is kept in Singapore', text: 'The database, the sign-in service and the stored photos are hosted in Singapore. The AI models, the photo search services and the map and font hosts are outside Singapore. The section on transfers says what that means.' },
            { title: 'You decide who sees a trip', text: 'No other user sees a trip until you invite someone by email or create a share link. You can undo either at any time, and a share link stops working 7 days after it is made. Our administrator can read trips in order to fix faults.' },
            { title: 'You can leave', text: 'You can delete any trip, or all of them, in the app. You can delete your account yourself in Settings, under Account, with Delete my account. For anything the app cannot do, write to our data protection contact.' },
          ],
        },
        { type: 'p', text: 'The cards above are a summary. The sections below are the policy.' },
      ],
    },
    {
      id: 'who-we-are',
      heading: 'Who is responsible for your data',
      blocks: [
        { type: 'p', text: 'Trippy is a free, experimental service run by an individual, not by a company, and operated from {country}. It does not sell tickets or bookings, takes no payment and earns no commission of any kind. The operator decides why and how your personal data is used, and answers for it under the PDPA.' },
        {
          type: 'defs',
          rows: [
            { term: 'Operator', text: '{operator}' },
            { term: 'General contact', text: '{contactEmail}' },
            { term: 'Where Trippy lives', text: '{siteUrl}' },
          ],
        },
      ],
    },
    {
      id: 'data-protection-contact',
      heading: 'Our data protection contact',
      blocks: [
        { type: 'p', text: 'One person is responsible for making sure Trippy follows the PDPA. Questions, requests and complaints about your personal data go to that person.' },
        { type: 'defs', rows: [{ term: 'Data protection contact', text: '{dpoEmail}' }] },
        { type: 'p', text: 'You can also ask that person how we handle personal data in general and how a complaint is dealt with, and we will tell you.' },
        { type: 'p', text: 'Write from the email address you sign in with if you can. It lets us confirm the request is yours without asking for more information about you.' },
      ],
    },
    {
      id: 'what-we-collect',
      heading: 'What we collect and why',
      blocks: [
        { type: 'p', text: 'Personal data reaches Trippy in three ways: Google sends it when you sign in, you type it, or your browser and our servers record it while the app runs. Each kind is listed below with where it comes from, what we use it for and where it is kept.' },
        facts(['From:', 'Used for:', 'Kept:'], [
            ['Account identity', 'Your email address, full name, profile picture address, an account id and sign-in tokens', 'Google, when you press Sign in with Google', 'Signing you in, showing your name and picture in the app, showing which account you are signed in with, and matching a trip invitation to your email address', 'In our sign-in service at Supabase. The sign-in session is also kept in your browser so that you stay signed in.'],
            ['Profile', 'Display name, home city and country, whether you travel full time, home currency, passport nationality, and whether the account is an ordinary one or an administrator', 'You, in the profile step and in Settings. Your display name starts as the name on your Google account. The account type is set by us.', 'Greeting you, planning from where you start, number and date formats, showing prices in your currency, and entry and visa guidance for the passport you hold', 'In our database at Supabase. A summary is kept in your browser so the app opens quickly.'],
            ['Display preferences', 'View, theme, motion, language, clock and temperature units, trip page switches', 'Your choices in the app', 'Remembering how you like the app to look and behave', 'In your browser. Where preference sync is switched on, also in your profile in our database so your other devices match.'],
            ['Trip request', 'Destinations, dates or season, free and work days, number of travellers, daily budget, accommodation and flight preferences, transport, interests and travel style, departure city, your home city and country copied from your profile, and the passports your group travels on', 'You, in the trip planner', 'Writing the plan and the entry requirements card', 'In your browser while you are planning, then in our database with the trip and with each run of the plan writer'],
            ['Booked travel you choose to add', 'A hotel address and check-in date, flight numbers, routes and times, and in an imported plan any booking references and manage-booking links it holds', 'You, in the trip planner or by pasting a plan to import', 'Building the plan around what you have already booked, and showing it on the trip page', 'In our database with the trip'],
            ['Free text', 'Notes, must-do items, things to avoid, pasted research and dietary needs', 'You, if you choose to write any', 'Shaping the plan, for example choosing restaurants that fit a dietary need', 'In our database with the trip request'],
            ['The plan', 'Days, activities, venues, addresses, times, costs, flights, places to stay, a booking checklist and photo credits', 'The AI model, your edits, the edits of people you invite, or a plan you import', 'The trip pages, the dashboard, the briefing cards and the PDF export', 'In our database. Copies of your recent trips are kept in your browser for use offline.'],
            ['Collaborators', 'The email address of each person you invite, whether they may view or edit, and their account id once they open the trip', 'You, about another person', 'Giving that person access to one trip when they sign in with that address', 'In our database with the trip'],
            ['Share links', 'A random code for each trip you share, with who created it and when', 'Created when you press Share', 'Letting anyone who has the link read a cut-down copy of the trip without signing in', 'In our database, until the link stops working 7 days after it is made'],
            ['Chat edits', 'The message you type to the itinerary editor, up to 500 characters, and the days of the trip it concerns', 'You, on a trip page', 'Changing activities by chat', 'Not kept by Trippy. The message is passed to the AI model and the answer comes back to your page. The provider of the model handles it under its own terms.'],
            ['Ticks', 'Items you tick off in trip preparation, the booking checklist and the entry requirements, and the town groups of the Discover tab', 'Your taps on a trip page', 'Remembering what you have done', 'In your browser only. They are never sent to our servers.'],
            ['Usage counts', 'How many chat and alternative requests your account made each day, and a record of each plan writing run with its status and any error', 'Our servers, when you use those features', 'Daily limits that keep the service free, and resuming a plan that was interrupted', 'In our database'],
            ['Diagnostic logs', 'Error and warning messages, the file and line where a fault happened, your account id, the trip id, your browser type and the time. A warning about a search that failed can include the place name or search words. Some entries record that a booking link was opened, with the trip and the booking site.', 'Your browser and our servers, automatically', 'Finding and fixing faults', 'In our database for up to one year, readable only by an account with the administrator role'],
            ['Notification permission', 'Whether you allowed Trippy to notify you when a plan is ready', 'Your answer to the browser prompt', 'Showing a notification on that device while Trippy is open in a tab or in the background', 'In your browser only. Trippy sends no push messages and keeps no record of the permission on its servers.'],
        ]),
        { type: 'subheading', text: 'What we do not collect' },
        {
          type: 'list',
          items: [
            'Passport numbers, identity card numbers, dates of birth or payment card details. Trippy never asks for them. A passport nationality is a country, not a document number.',
            'Photos from you. There is no upload feature. Trip photos are found by our servers from the venue names in the plan.',
            'Your precise location. Trippy does not ask your device where you are.',
            'Payments. Trippy is free, nothing is bought or booked through it, and it earns no commission from the sites it links to.',
          ],
        },
        { type: 'subheading', text: 'Sensitive details in free text' },
        { type: 'p', text: 'The dietary needs box and the notes boxes take whatever you type. A dietary need can reveal something about your health or your religion. Anything you write there is stored with the trip and sent to the AI model as you typed it, on the free tier of Google\'s service, where Google may use it to improve its products and human reviewers may read it. Do not put sensitive personal details in a free-text field. Write only what the plan needs, and leave out names, identity and passport numbers, and anything about your health or your religion that the plan does not need. The section [AI models and Google\'s free tier](#/privacy/ai-models) says more.' },
        { type: 'subheading', text: 'Technical data seen by other services' },
        { type: 'p', text: 'When your browser loads Trippy it also fetches fonts, map tiles, flags, logos and photos from other hosts. Each of those hosts sees your IP address and your browser type, as any website does. They are listed under [Who receives your data](#/privacy/service-providers).' },
      ],
    },
    {
      id: 'ai-models',
      heading: 'AI models and Google\'s free tier',
      blocks: [
        { type: 'note', title: 'Keep sensitive personal details out of free-text fields', text: [
          'Trippy sends your trip requests and plans to Google\'s Gemini models on the free tier of Google\'s service. On the free tier, Google may use what is sent to improve its products, and human reviewers may read it.',
          'Do not put sensitive personal details in a free-text field: nothing about your health, your religion or an identity or passport number.',
        ] },
        { type: 'p', text: 'Trippy is free to use because it runs on the free tier of Google\'s Gemini service. Google\'s terms for that tier are different from its paid terms: Google may use the prompts it receives and the answers the model gives to improve its products, and people who review that material for Google may read it. Trippy cannot switch this off. If Gemini fails, the plan is written by a model from Mistral AI instead, under Mistral\'s own terms.' },
        { type: 'subheading', text: 'What is sent' },
        {
          type: 'defs',
          rows: [
            { term: 'When a plan is written', text: 'The trip request: destinations, dates, free days, number of travellers, budget, departure city and home country, accommodation preferences, a booked hotel address and check-in date, booked flight numbers, routes and times, interests, and every free-text field as you typed it. The free-text fields are notes, must-do items, things to avoid, pasted research and dietary needs.' },
            { term: 'When you edit by chat or ask for alternatives', text: 'Your message and the activities of the trip, which are part of the plan the model wrote or you edited.' },
            { term: 'When photos are checked', text: 'Venue names and candidate pictures of those venues.' },
          ],
        },
        { type: 'subheading', text: 'What is not sent' },
        { type: 'p', text: 'Your name, your email address, your account id, your passport nationality and your booking references are not part of what Trippy sends to an AI model. If you type any of them into a free-text field, they are sent with it.' },
        { type: 'subheading', text: 'What this means for you' },
        {
          type: 'list',
          items: [
            'Write only what the plan needs. A dietary need can be stated in a word or two.',
            'Leave out health conditions, religion, identity card and passport numbers, and the names of other people.',
            'Trippy cannot call back or delete what an AI provider has already received, even after you delete a trip or your account.',
            'If you do not want a trip request handled this way, do not send it. You can still read the trips you already have.',
          ],
        },
      ],
    },
    {
      id: 'other-people',
      heading: "Other people's data that you give us",
      blocks: [
        { type: 'p', text: 'Two features involve people other than you.' },
        {
          type: 'defs',
          rows: [
            { term: 'Travel companions', text: ['A trip request holds the number of travellers and the passports the group travels on, as a list of countries. Trippy does not ask for companions\' names or anything else about them.', 'Before you enter a companion\'s nationality, make sure they are happy for you to do so for the purpose of checking entry requirements.'] },
            { term: 'Collaborators', text: ['To invite someone to a trip you type their email address. Trippy stores it with the trip and shows it to you and to that person. Trippy does not send them an email. They get access when they sign in to Trippy with a Google account that has that address.', 'Invite only people who have agreed to be invited, and tell them that Trippy will hold their email address for this purpose. You can remove a collaborator on the trip page, which deletes the stored address for that trip.'] },
          ],
        },
        { type: 'p', text: 'If you are one of these people and want your details removed, write to our data protection contact: {dpoEmail}.' },
      ],
    },
    {
      id: 'consent',
      heading: 'Consent',
      blocks: [
        { type: 'p', text: 'We collect, use and disclose your personal data only with your consent, or where the PDPA or another law allows or requires it without consent.' },
        { type: 'subheading', text: 'How you give consent' },
        {
          type: 'list',
          items: [
            '**When you create an account.** By pressing Sign in with Google you consent to the collection of your account identity, and to the usage counts and diagnostic logs that the app records while you use it, for the purposes listed above.',
            '**When you use a feature.** This policy lists what each answer is used for. When you fill in your profile, send a trip request, invite a collaborator or create a share link, you consent to the use of that information for that feature, including sending it to the providers that the feature relies on. For a trip request, a chat edit or a request for alternatives, that includes Google\'s Gemini models on the free tier, on the terms set out under [AI models and Google\'s free tier](#/privacy/ai-models).',
            '**When your browser asks.** Notifications are off until you allow them at the browser prompt.',
          ],
        },
        { type: 'subheading', text: 'Deemed consent' },
        { type: 'p', text: 'The PDPA treats you as having consented in some situations without a separate request. Two of them apply to Trippy.' },
        {
          type: 'list',
          items: [
            '**By conduct.** When you volunteer information for a purpose that is plain from the context, such as typing a dietary need so that the plan suits you, you are taken to consent to its use for that purpose.',
            '**By contractual necessity.** When you ask Trippy to do something that it can only do by passing your data to a provider, such as storing a trip at Supabase or sending a trip request to an AI model to be written, you are taken to consent to that disclosure and to the provider using the data to carry out the task.',
          ],
        },
        { type: 'p', text: 'We do not rely on deemed consent by notification. If we ever want to use your data for a new purpose, we will ask you first.' },
        { type: 'subheading', text: 'What is required and what is optional' },
        {
          type: 'defs',
          rows: [
            { term: 'Required', text: 'A Google account, which supplies your email address, name and picture. For a plan, the trip request needs at least where you are going, when or for how long, and how many people are travelling.' },
            { term: 'Optional', text: 'Passport nationality and companions\' passports, dietary needs, notes, must-do items, things to avoid, pasted research, a booked hotel, booked flights, flight and accommodation preferences, collaborators, share links and notifications. Leaving these out means a less tailored plan or a feature you do not use. It does not stop you using Trippy.' },
          ],
        },
        { type: 'p', text: 'We do not ask for more than a feature needs, and we do not make consent to anything else a condition of using Trippy.' },
        { type: 'subheading', text: 'Marketing messages' },
        { type: 'p', text: 'Trippy does not send marketing emails, text messages or calls. The app sends no email of any kind. We write to you only to answer a request of yours or about something we must tell you, such as a data breach or the closing of your account.' },
      ],
    },
    {
      id: 'withdrawal',
      heading: 'Withdrawing consent',
      blocks: [
        { type: 'p', text: 'You may withdraw your consent to the collection, use or disclosure of your personal data at any time, for one purpose or for all of them. Withdrawing is free. You withdraw in the app, by deleting the data in question or by deleting your account. Nobody has to do it for you.' },
        { type: 'subheading', text: 'How to withdraw' },
        {
          type: 'defs',
          rows: [
            { term: 'In the app', text: ['Remove a collaborator, or press Stop sharing, on the trip page.', 'Delete a trip from the dashboard or the trip page. Delete all your trips in Settings, under Data.', 'Set your passport nationality to Not set, or change your name and home city, in Settings, under You.', 'Clear the copies kept on your device in Settings, under Data, or sign out.', 'Turn notifications off for this site in your browser settings.', 'Delete your account in Settings, under Account, with Delete my account. That withdraws your consent to everything at once.'] },
            { term: 'By writing to us', text: 'For anything the app cannot do, write to our data protection contact: {dpoEmail}. Say which use of your data you want to stop.' },
          ],
        },
        { type: 'subheading', text: 'How long it takes' },
        { type: 'p', text: 'The controls in the app take effect at once. A written request needs reasonable notice so that we can act on it. We will normally carry it out within 10 business days of receiving it, and if we need longer we will tell you why and by when.' },
        { type: 'subheading', text: 'What happens when you withdraw' },
        { type: 'p', text: 'When we receive a written request we will tell you what withdrawing will mean, so that you can decide with the facts in front of you. In short, for each thing you can withdraw consent to:' },
        facts([], [
            ['Our holding your account identity', 'You withdraw this by deleting your account. The account, your profile and the trips you own are deleted, and you can no longer sign in to them.'],
            ['Sending trip requests to the AI models', 'Trippy cannot write new plans, suggest alternatives or edit by chat for you. You can still read your existing trips and import plans written elsewhere.'],
            ['Our holding your passport nationality', 'The entry requirements card can no longer tell you what your passport needs.'],
            ['Our holding your home city and currency', 'Plans no longer start from your home city and prices are not shown in your currency.'],
            ['Sharing a trip', 'The link stops working for everyone who has it, or the collaborator loses access.'],
            ['Diagnostic logs about your account', 'Deleting your account deletes the log entries of your account. The app writes logs while you are signed in, so stopping new ones means deleting the account.'],
        ]),
        { type: 'p', text: 'Once you withdraw, we stop the use you objected to and tell the providers that process the data for us to stop as well. We cannot call back a trip request that an AI model has already received.' },
        { type: 'subheading', text: 'What withdrawal does not change' },
        { type: 'p', text: 'Withdrawing consent does not undo what was done with your data before you withdrew. It also does not stop us keeping or using personal data where the PDPA or another written law requires or permits it without consent, for example to investigate a breach of our terms, to respond to a lawful request from an authority, or to deal with a legal claim.' },
      ],
    },
    {
      id: 'access-and-correction',
      heading: 'Seeing and correcting your data',
      blocks: [
        { type: 'subheading', text: 'In the app' },
        { type: 'p', text: 'Most of what Trippy holds about you is on screen. Your profile is in Settings, under You and under Money and units, and you can change it there. The account you are signed in with is shown under Account. Every trip, with its plan, its collaborators and its share link, is on its trip page, where you can edit it. Trips saved on your device are listed in Settings, under Data. The app does not show the trip request as it was stored, the usage counts or the diagnostic logs. Ask us for those.' },
        { type: 'p', text: 'Your name and picture come from your Google account. To change the picture, change it at Google. You can change the name Trippy shows in Settings.' },
        { type: 'subheading', text: 'By request' },
        { type: 'p', text: 'You have the right to ask us for the personal data we hold about you, and for information about how we have used or disclosed it in the year before your request. You also have the right to ask us to correct an error or an omission. Write to our data protection contact: {dpoEmail}.' },
        {
          type: 'defs',
          rows: [
            { term: 'How quickly we answer', text: 'As soon as reasonably possible. If we cannot give you access, or make a correction, within 30 days of your request, we will tell you within those 30 days when we will.' },
            { term: 'What it costs', text: 'Nothing. We do not charge a fee for access or for correction.' },
            { term: 'Checking it is you', text: 'We may ask you to write from, or confirm through, the email address of your account before we release anything.' },
            { term: 'When we correct', text: 'We make the correction as soon as practicable and send the corrected data to every organisation we disclosed it to in the year before, unless that organisation no longer needs it.' },
            { term: 'When we may say no', text: 'The PDPA lets or requires us to refuse in some cases, for example where giving access would reveal personal data about another person or where a request is frivolous or vexatious. If we refuse we will tell you so and keep a copy of the data concerned for at least 30 days, so that you can ask for the decision to be reviewed. If we decline a correction, we will note on the record the correction you asked for.' },
          ],
        },
        { type: 'p', text: 'The PDPA also provides for a right to have your data sent to another organisation. At the date of this policy that part of the law had not been brought into force. In the meantime you can export any trip as a PDF from its trip page.' },
      ],
    },
    {
      id: 'accuracy',
      heading: 'Keeping your data accurate',
      blocks: [
        { type: 'p', text: 'We take reasonable steps to keep personal data accurate and complete when we use it to make a decision that affects you or pass it to someone else. In practice almost all of it comes straight from you or from your Google account, and Trippy uses it as given.' },
        { type: 'p', text: 'That makes your part important. The entry requirements card is only right for the passports you entered, and a plan is only right for the dates and places you gave. Please keep your profile current, and correct a trip request if your plans change.' },
      ],
    },
    {
      id: 'protection',
      heading: 'How we protect your data',
      blocks: [
        { type: 'p', text: 'We use reasonable security arrangements to prevent unauthorised access, collection, use, disclosure, copying, modification, disposal and loss. These are the ones in place.' },
        {
          type: 'list',
          items: [
            '**Encrypted connections.** The site and every request to our database, sign-in service and server functions travel over HTTPS.',
            '**No passwords held by Trippy.** Sign-in is by Google only. Google checks your password and tells us who you are.',
            '**Access rules in the database.** Every table has row-level rules: an account can read and change only its own profile and trips, and the trips it has been invited to, within the role it was given.',
            '**Checks on the server.** The functions that write plans, answer chat edits and look up photos accept requests only from a signed-in account, and the plan writer and the chat editor have daily limits.',
            '**Cut-down share links.** A share link shows a reduced copy of a trip. See [Shared links and collaborators](#/privacy/shared-links).',
            '**Keys kept off your device.** The keys for the AI and photo services are held on the server. Your browser never receives them.',
            '**Limited administration.** Apart from the people you share a trip with, only an account that the operator has given the administrator role can read your profile, trips and diagnostic logs. The operator can also reach the database through the provider\'s own console. We use that access only to fix faults, answer your requests and enforce our terms.',
          ],
        },
        { type: 'subheading', text: 'Limits you should know about' },
        {
          type: 'list',
          items: [
            'Your sign-in session, and the copies of trips kept for offline use, are stored in your browser unencrypted, as is usual for web apps. On a shared or borrowed device, sign out when you finish. Signing out removes the session, the profile summary and the offline trips from that device.',
            'Trip photos that our servers copy from licensed sources are kept in a public file store. They are pictures of places, not of you, and the store cannot be browsed, but anyone who has the address of a photo can open it.',
            'A share link works for anyone who has it, so send it only to people you trust with the plan.',
            'No method of storage or transmission is completely secure. We cannot promise that a breach will never happen. The section on [data breaches](#/privacy/breach) says what we do if one does.',
          ],
        },
      ],
    },
    {
      id: 'retention',
      heading: 'How long we keep your data',
      blocks: [
        { type: 'p', text: 'We keep personal data only for as long as the purpose it was collected for still needs it, or a legal or business reason requires it. After that we delete it or remove what links it to you. Each kind of data below is kept until the event named beside it.' },
        facts([], [
            ['Account identity and profile', 'You delete your account.'],
            ['Trips, with their requests, plans, collaborators and share links', 'You delete the trip or your account. Deleting a trip also deletes its plan writing runs, its collaborators and its share link.'],
            ['Share links', 'A share link stops working 7 days after it is made and is then deleted. It ends sooner if you press Stop sharing or delete the trip. You can make a new link at any time.'],
            ['Collaborator email addresses', 'You remove the collaborator, or the trip is deleted.'],
            ['Chat edit messages', 'Not stored by Trippy. They are gone from the app when you close the page.'],
            ['Daily usage counts', 'About 7 days while you keep using the feature: counts older than that are removed the next time your account uses it. Counts left over after you stop are removed when you delete your account.'],
            ['Diagnostic logs', 'Up to one year. Entries older than one year are deleted automatically. The entries of your account are deleted sooner if you delete your account. When you delete a single trip, its entries stay until then with the trip field emptied.'],
            ['Trip photos copied by our servers', 'They may remain after you delete a single trip, filed under the id of the trip. Deleting your account removes the stored photos of every trip you own. They are published photos of venues and places and say nothing about you.'],
            ['Session, profile summary and offline trips in your browser', 'You sign out, clear them in Settings under Data, or delete your account on that device.'],
            ['Preferences, ticks and town groups in your browser', 'You clear the site data in your browser, or delete your account on that device. Deleting all your trips in Settings also removes their ticks.'],
            ['A trip request in progress', 'You close the browser tab.'],
        ]),
        { type: 'subheading', text: 'Deleting trips' },
        { type: 'p', text: 'Delete one trip from the dashboard or from its trip page. Delete every trip you own in Settings, under Data. Deletion is immediate and cannot be undone. Trips that other people shared with you are theirs and stay.' },
        { type: 'subheading', text: 'Deleting your account' },
        { type: 'p', text: 'You delete your account yourself, in the app. Open Settings, go to Account and press Delete my account. You do not have to write to anyone and nobody has to approve it. Deletion starts at once and cannot be undone.' },
        {
          type: 'defs',
          rows: [
            { term: 'What it removes', text: ['Your sign-in at Trippy and your profile.', 'Every trip you own, with its days, stops, share links and collaborators.', 'Your usage counts and the diagnostic log entries of your account.', 'The stored photos of those trips.', 'Everything Trippy keeps on the device you do it on: the sign-in session, the profile summary, offline trips, preferences and ticks.'] },
            { term: 'What it cannot remove', text: ['Copies in our hosting provider\'s backups. They go when those backups expire.', 'What the AI and photo providers had already received when your plans were written. They keep or delete it under their own terms.', 'Copies that you or other people saved, such as a PDF.', 'Trips that belong to other people and were shared with you. They stay with their owners.'] },
          ],
        },
        { type: 'p', text: 'On any other device you used, sign out or clear the site data in the browser to remove what is kept there.' },
        { type: 'p', text: 'Signing in again with the same Google account afterwards creates a new, empty account. To stop Google offering Trippy as a connected app, remove it in your Google account settings.' },
        { type: 'subheading', text: 'Backups and legal holds' },
        { type: 'p', text: 'Deleted data may remain in our database provider\'s backups until those backups expire. We may keep specific data for longer where a law requires it or where we need it for a dispute or an investigation, and only for as long as that lasts.' },
      ],
    },
    {
      id: 'service-providers',
      heading: 'Who receives your data',
      blocks: [
        { type: 'p', text: 'We do not sell personal data, rent it out or give it to advertisers. Trippy does rely on other services to work, and each receives only what its task needs. The first list is of the services our servers send data to. The second is of the hosts your own browser contacts while you use Trippy.' },
        facts(['Receives:'], [
            ['Supabase', 'Hosts sign-in, the database, the file store and the server functions. The database, sign-in and stored photos are kept in Singapore, on Amazon Web Services in its Singapore region.', 'Everything in your account: identity from Google, profile, trips, collaborator email addresses, share links, usage counts and logs'],
            ['Google, for sign-in', 'Confirms who you are when you press Sign in with Google', 'You sign in on Google\'s own page. Google learns that you use Trippy and sends your email address, name and picture to our sign-in service.'],
            ['Google Gemini', 'The main AI model, used on the free tier of Google\'s service. It writes plans, answers chat edits, suggests alternatives and checks candidate photos.', 'The trip request: destinations, dates, free days, number of travellers, budget, departure city and home country, accommodation preferences, a booked hotel address and check-in date, booked flight numbers, routes and times, interests, and your free text including dietary needs. For chat edits, your message and the trip\'s activities. For photos, venue names and candidate pictures. When you import a document, the text of the document is sent to Google Gemini to be turned into a plan, and the file itself is not stored.'],
            ['Mistral AI', 'The fallback AI model, used for a plan only if Gemini fails', 'The same trip request as Gemini'],
            ['Serper and Tavily', 'Photo search, through Google Maps places and web image search, used when licensed sources find nothing', 'Venue names, the city and map coordinates from the plan. A hotel you named in the request can be one of the venues.'],
            ['Wikimedia (Wikipedia, Wikimedia Commons, Wikidata), Openverse, Pexels and Mapillary', 'Licensed photos of venues and places', 'Venue and place names and map coordinates'],
            ['Overpass, a search service for OpenStreetMap data', 'Finding places near a venue', 'Place names and map coordinates'],
            ['Photon by Komoot', 'Place search and naming the town a venue is in', 'Place names you search for and map coordinates of venues'],
            ['OSRM public router', 'Walking directions when you edit an activity', 'Two sets of map coordinates'],
            ['GitHub Pages', 'Hosts the files of the Trippy website', 'Your page requests. No account data is stored there.'],
        ]),
        { type: 'subheading', text: 'What the AI models do not receive' },
        { type: 'p', text: 'Your name, email address, account id, passport nationality and booking references are not part of what Trippy sends to Gemini or Mistral. Free text is the exception: it is sent exactly as you typed it, so anything personal you put there goes too.' },
        { type: 'p', text: 'Trippy uses Gemini on the free tier of Google\'s service. Under Google\'s terms for that tier, Google may use what is sent and what the model answers to improve its products, and human reviewers may read it. Mistral handles what it receives under its own terms. The section [AI models and Google\'s free tier](#/privacy/ai-models) says what is sent and what to keep out of it.' },
        facts(['Sees:'], [
            ['Google Fonts', 'The typefaces of the app', 'Your IP address and browser type'],
            ['OpenStreetMap tile servers', 'The map on a trip page', 'Your IP address, browser type and the map areas you look at'],
            ['Photon by Komoot, Open-Meteo and Wikipedia', 'City search, the time zone and a header photo when you type a city in the trip planner', 'The city name you type and your IP address. Komoot also receives the coordinates of trip venues when the Discover tab groups them by town.'],
            ['flagcdn.com', 'Flag images', 'Your IP address and which flags are shown'],
            ['Wikimedia image servers', 'Destination photos', 'Your IP address and which photos are shown'],
            ['Aviasales image server', 'Airline logos on flight cards', 'Your IP address and the airline code'],
            ['Hosts of venue photos found through Google Maps or the web, and Google\'s image host for your profile picture', 'Those photos, loaded from where they are published', 'Your IP address and which photo is loaded'],
        ]),
        { type: 'p', text: 'These hosts may set cookies of their own on their own domains. Trippy cannot read them.' },
        { type: 'subheading', text: 'Links you choose to follow' },
        { type: 'p', text: 'A trip page offers links to Booking.com, Trip.com, Skyscanner, Google Search, Google Maps and Rome2Rio. They are plain links to other sites: they carry no partner code, and Trippy earns nothing when you follow one or book there. Nothing is sent until you press one. The link then carries what the search needs, such as the name of a stay or a city, your dates, the number of adults or map coordinates. What you do on those sites is covered by their privacy policies, not this one.' },
        { type: 'subheading', text: 'Other disclosures' },
        { type: 'p', text: 'We may disclose personal data without your consent where the PDPA or another law requires or permits it, for example in answer to a court order or a lawful request from a public agency in Singapore. If Trippy were ever handed to a new operator, your data would pass to them under this policy, and we would tell you beforehand so that you could delete your account first.' },
      ],
    },
    {
      id: 'transfer',
      heading: 'Transfers outside Singapore',
      blocks: [
        { type: 'p', text: 'Trippy has no servers of its own. The database, the sign-in service and the stored photos are hosted in Singapore, by Supabase on Amazon Web Services in its Singapore region. Your account, your profile and your trips are kept there, so this section is not about them.' },
        { type: 'p', text: 'This section is about the services outside Singapore: the AI models (Google, with Mistral as the fallback), the photo search services, and the map and font hosts. Their systems can be in other countries, including the United States and countries of the European Union.' },
        { type: 'p', text: 'The PDPA lets us send personal data out of Singapore only if we take appropriate steps to see that it is protected there to a standard comparable to the PDPA, unless an exception in the law applies. For the providers that receive your trip requests, which are Google and Mistral, we rely on the terms those providers bind themselves to, and on the transfer being necessary to do what you asked Trippy to do. On the free tier, Google\'s terms let it use what is sent to improve its products, as the section [AI models and Google\'s free tier](#/privacy/ai-models) says. We cannot promise that every country a provider uses has a law like the PDPA.' },
        { type: 'p', text: 'The photo, place and routing services receive venue names and map coordinates only, with nothing that identifies your account.' },
        { type: 'p', text: 'If you ask, we will tell you what we know about where a provider keeps your data and which terms it is bound by.' },
        { type: 'p', text: 'Fonts, map tiles, flags and photos are fetched by your own browser straight from their hosts, which can be anywhere in the world. Those hosts see your IP address and handle it under their own privacy policies.' },
      ],
    },
    {
      id: 'shared-links',
      heading: 'Shared links and collaborators',
      blocks: [
        {
          type: 'defs',
          rows: [
            { term: 'A share link', text: ['Anyone who has the link can read the trip without signing in. They see the title, the dates, the number of travellers, the currency, the name, area and price range of each stay, and the days with their activities.', 'They do not see flights, booking references, manage-booking links, the addresses of stays, the booking checklist, your trip request or your name. The link stops working 7 days after it is made, or sooner if you press Stop sharing. You can make a new one at any time.'] },
            { term: 'A collaborator', text: ['A person you invite by email sees the whole trip when signed in. That includes flights, stays and any booking references in it, and the trip request itself, with your notes, dietary needs and the passports of the group. An editor can also change the plan. The invited person can see the invitation and their role.', 'You can remove a collaborator at any time on the trip page.'] },
            { term: 'A trip shared with you', text: 'It belongs to the person who shared it. They decide how long it exists and who else sees it.' },
          ],
        },
      ],
    },
    {
      id: 'on-device',
      heading: 'Cookies and storage on your device',
      blocks: [
        { type: 'p', text: 'Trippy sets no cookies. It uses your browser\'s own storage instead, which stays on your device and is not sent with every request the way a cookie is. None of it is used for advertising or to follow you across other sites.' },
        facts(['Removed when:'], [
            ['Sign-in session', 'Keeps you signed in between visits', 'You sign out'],
            ['Preferences', 'Remembers view, theme, motion, language and units', 'You clear the site data in your browser'],
            ['Profile summary', 'Lets the app open with your name, home city, currency and passport nationality before the server answers', 'You sign out'],
            ['Offline trips: up to 5 recent trips, the trip list and briefing cards', 'Lets you read a plan with no connection', 'You sign out, or clear them in Settings under Data'],
            ['Ticks and town groups', 'Remembers what you ticked off on each trip', 'You delete all your trips in Settings, or clear the site data'],
            ['Import draft', 'Keeps a plan you pasted until you finish importing it', 'It expires, or you sign out'],
            ['Trip request in progress', 'Keeps the planner\'s answers while you move between steps', 'You close the tab'],
            ['App files', 'A service worker keeps a copy of the app so it opens offline', 'You clear the site data, or remove the installed app'],
        ]),
        { type: 'p', text: 'Deleting your account in Settings also clears what Trippy keeps on the device you do it on.' },
        { type: 'p', text: 'Because the app needs this storage to run, there is no consent banner for it. You can clear it at any time in your browser settings. Trippy will then ask you to sign in again.' },
      ],
    },
    {
      id: 'booking-links',
      heading: 'Booking links',
      blocks: [
        { type: 'p', text: 'The stay and flight cards link to booking and search sites. They are plain links to other sites. They carry no partner code, nobody pays Trippy for them, and Trippy earns no commission when you book. Trippy sells nothing and books nothing itself.' },
        { type: 'p', text: 'A link carries only what the search needs, such as the name of a stay or a city, your dates and the number of adults. It does not carry your name, your email address or your account id.' },
        { type: 'p', text: 'When you open a booking link, Trippy records in its diagnostic logs that a link to that booking site was opened from that trip.' },
      ],
    },
    {
      id: 'children',
      heading: 'Children and young people',
      blocks: [
        { type: 'p', text: 'Trippy is made for adults planning their own travel. It is not directed at children, and it needs a Google account, which Google offers only from a minimum age.' },
        { type: 'p', text: 'If you are under 18, use Trippy only with the agreement of a parent or guardian who has read this policy. In Singapore the Personal Data Protection Commission takes the view that a young person of 13 or over can usually give consent for themselves if they understand what they are agreeing to, and that for a child under 13 a parent or guardian should give it. We do not knowingly collect personal data from a child under 13.' },
        { type: 'p', text: 'If you believe a child has given us personal data without that consent, write to our data protection contact and we will delete it: {dpoEmail}.' },
      ],
    },
    {
      id: 'breach',
      heading: 'If there is a data breach',
      blocks: [
        { type: 'p', text: 'If we have reason to believe that personal data in our care has been accessed, disclosed, copied, changed, lost or deleted without authority, we will assess whether the breach is one the PDPA requires us to report. We will do that quickly, and in any case within 30 days of learning of it. If one of our providers tells us of a breach on its side, the same steps apply from the moment we learn of it.' },
        { type: 'p', text: 'A breach is notifiable when it causes, or is likely to cause, significant harm to the people affected, or when it affects 500 people or more. In that case we will notify the Personal Data Protection Commission as soon as practicable, and no later than 3 calendar days after we make that assessment. Where significant harm is likely we will also notify each affected person as soon as practicable, at the email address of their account, with what happened, what data was involved and what they can do. The law does not require us to notify affected people where action taken after the breach, or protection already on the data such as encryption, makes significant harm unlikely, or where the Commission or a law enforcement agency instructs us not to.' },
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      blocks: [
        { type: 'p', text: 'We will update this policy when Trippy changes what it collects, how it uses it or who receives it, and when the law changes. The date under the title is the date of the latest version.' },
        { type: 'p', text: 'For a change that matters, such as a new purpose, a new kind of data or a new provider that receives personal data, we will post a notice in the app or on this page before the change takes effect. Where the change needs your consent, we will ask for it. We will not rely on your continuing to use Trippy as consent to a new purpose.' },
        { type: 'p', text: 'This policy is written in English and may be offered in other languages for convenience. If a translation differs from the English text, the English text governs.' },
      ],
    },
    {
      id: 'complaints',
      heading: 'Questions and complaints',
      blocks: [
        { type: 'p', text: 'If you have a question about this policy, or think we have handled your personal data wrongly, please tell us first so that we can put it right. Write to our data protection contact: {dpoEmail}.' },
        { type: 'p', text: 'We will acknowledge a complaint, look into it and give you an answer, normally within 30 days.' },
        { type: 'p', text: `If you are not satisfied with our answer, you may complain to the Personal Data Protection Commission of Singapore, the regulator that enforces the PDPA. Its website is [pdpc.gov.sg](${PDPC}).` },
        { type: 'p', text: 'Our [Terms of use](#/terms) set out the other rules for using Trippy.' },
      ],
    },
  ],
};
