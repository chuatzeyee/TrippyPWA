// Terms of use, in English: the reference text, and the one that governs if a translation differs.
// Governed by the laws of Singapore. Written for what Trippy is today: a free, experimental planner
// run by an individual, with no payments, no bookings, no paid plan and no earnings from links. When that changes, change this text and
// SITE_INFO.updated.terms (js/data/site-info.js) together. The operator's name and contact address
// come from js/data/site-info.js, never from here. The content shape is documented in
// js/site/content.js. Section ids are fixed: translations and links (#/terms/<id>) depend on them.

/** @type {import('../content.js').SitePage} */
export default {
  title: 'Terms of use',
  intro: [
    'These terms are the agreement between you and the operator of Trippy for your use of the Trippy website and app. Trippy is a free, experimental service run by an individual in {country}, and the laws of Singapore govern these terms.',
    'Please read them with the [Privacy policy](#/privacy), which says how your personal data is handled. In these terms "we" and "us" mean the operator named in the last section, and "you" means the person using Trippy.',
  ],
  sections: [
    {
      id: 'summary',
      heading: 'The short version',
      blocks: [
        {
          type: 'cards',
          items: [
            { title: 'Trippy helps you plan', text: 'It writes a draft itinerary with an AI model and lets you edit and share it. It is not a travel agent. It sells nothing, books nothing and earns no commission.' },
            { title: 'Check before you rely on it', text: 'AI-written plans can be wrong or out of date. Confirm prices, opening hours, routes and entry rules with the provider or the authorities before you pay or travel.' },
            { title: 'Your trips stay yours', text: 'We claim no ownership of what you put in. We only use it to run Trippy for you and the people you share with. You can delete your account yourself at any time in Settings.' },
            { title: 'It is free and experimental', text: 'There is no charge. Trippy is an experiment that comes as it is: it may change or stop, and there is no promise that it will always be available.' },
            { title: 'Use it fairly', text: 'Plan real trips, keep your account to yourself, and do not try to break or overload the service.' },
            { title: 'Singapore law applies', text: 'If we disagree, we talk first. After that the courts of Singapore decide. Rights the law gives you as a consumer are not taken away.' },
          ],
        },
        { type: 'p', text: 'This summary is here to help. It is not part of the terms, and the sections below are what you agree to.' },
      ],
    },
    {
      id: 'acceptance',
      heading: 'Agreeing to these terms',
      blocks: [
        { type: 'p', text: 'By signing in to Trippy you agree to these terms. If you do not agree, please do not sign in.' },
        { type: 'p', text: 'If you only open a trip through a share link, without signing in, the sections on acceptable use, intellectual property, liability and governing law apply to your use of that page.' },
        { type: 'subheading', text: 'Who may use Trippy' },
        {
          type: 'list',
          items: [
            'You must be 18 or older, or have the permission of a parent or guardian who has read these terms and agrees to them on your behalf.',
            'Trippy is not meant for children under 13.',
            'You must be able to enter into a binding agreement under the law that applies to you, and you must not be barred from using the service under the laws of Singapore or of the place you are in.',
          ],
        },
      ],
    },
    {
      id: 'account',
      heading: 'Your account',
      blocks: [
        { type: 'p', text: 'You sign in with a Google account. Trippy has no passwords of its own, so the security of your Trippy account is the security of your Google account.' },
        {
          type: 'list',
          items: [
            'Keep your Google account secure and do not let anyone else use Trippy through it.',
            'Sign out of Trippy on a device that other people use. The app keeps your session and copies of recent trips in the browser.',
            'Give accurate information where the plan depends on it, such as your dates and the passports your group travels on.',
            'Tell us promptly if you think someone has used your account without permission.',
          ],
        },
        { type: 'p', text: 'You are responsible for what is done through your account, unless it happened because we failed to take reasonable care.' },
      ],
    },
    {
      id: 'the-service',
      heading: 'What Trippy is, and what it is not',
      blocks: [
        { type: 'p', text: 'Trippy is a free, experimental planning aid. You describe a trip, and an AI model drafts a day by day itinerary with places, times, estimated costs and background information. You can edit the plan, import one you wrote elsewhere, share it and save it as a PDF.' },
        { type: 'subheading', text: 'AI-written content' },
        { type: 'p', text: 'Plans, suggestions and chat edits are produced by AI models run by other companies. An AI model can state things that are wrong, leave things out, describe a place that has closed or moved, or repeat information that is out of date. We do not review each plan. Treat every plan as a draft to check, not as a set of facts.' },
        { type: 'subheading', text: 'Estimates and guidance' },
        {
          type: 'defs',
          rows: [
            { term: 'Prices and budgets', text: 'Costs in a plan are estimates in round figures. Currency conversions are indicative. The price you pay is set by the provider on the day.' },
            { term: 'Opening hours and availability', text: 'Opening days and hours, ticket rules and seasonal closures change. Confirm them with the venue.' },
            { term: 'Routes, travel times and maps', text: 'Directions, distances, walking times and map positions are approximate and take no account of roadworks, strikes, weather or your own pace. Use your judgement on the ground and follow local signs and instructions.' },
            { term: 'Weather and seasons', text: 'Anything Trippy says about weather describes what is typical for the season. It is not a forecast.' },
            { term: 'Entry, visa and health requirements', text: 'The entry requirements card is general guidance based on the passports you entered. Rules change at short notice and depend on facts Trippy does not know, such as your travel history or the purpose of your visit. Always check with the official government source or the embassy of each country before you book and again before you travel. An approved visa or travel authorisation does not guarantee entry.' },
            { term: 'Flights and stays', text: 'Flight and accommodation details in a plan are either what you entered or suggestions. Trippy does not check live schedules, fares or rooms.' },
          ],
        },
        { type: 'subheading', text: 'Nothing is sold or booked through Trippy' },
        { type: 'p', text: 'Trippy does not sell travel, take payment, make reservations or hold tickets, and it earns no commission from any airline, hotel or booking site. A suggestion in a plan is not a booking and not a promise that the place has room for you. When you book, you book with the airline, hotel, operator or booking site, and your contract is with them on their terms.' },
        { type: 'subheading', text: 'Not professional advice' },
        { type: 'p', text: 'Trippy is not a travel agent and holds no travel agent licence. Nothing in it is immigration, legal, medical, safety, insurance or financial advice. For decisions that matter, such as whether you may enter a country, whether an activity is safe for you, or what insurance you need, ask the authority or a qualified person.' },
        { type: 'note', title: 'Your trip is your decision', text: 'You decide where to go and what to do. Check official travel advisories for your destination, and do not follow a plan into anything that looks unsafe, unlawful or closed.' },
      ],
    },
    {
      id: 'your-content',
      heading: 'Your content',
      blocks: [
        { type: 'p', text: 'Your content is what you put into Trippy: trip requests, notes, edits, imported plans and the details of bookings you add. You keep whatever rights you have in it. We claim no ownership of it.' },
        { type: 'subheading', text: 'The permission we need' },
        { type: 'p', text: 'To run the service we need your permission to handle your content. You give us a licence to store, copy, process, adapt and display it, and to pass it to the providers named in the Privacy policy, only for these purposes:' },
        {
          type: 'list',
          items: [
            'keeping your trips and showing them to you on your devices;',
            'sending a trip request to an AI model so that a plan can be written or changed;',
            'showing a trip to the people you invite and to anyone who has a share link you created;',
            'keeping Trippy working, secure and free of faults.',
          ],
        },
        { type: 'p', text: 'The licence is worldwide, non-exclusive and free of charge. It ends when you delete the content or your account, apart from copies in backups until they expire and anything the law requires us to keep. We do not use your content for advertising and we do not sell it.' },
        { type: 'subheading', text: 'Your promises about it' },
        {
          type: 'list',
          items: [
            'You have the right to put the content into Trippy. For a plan you import or research you paste, that means you wrote it or are allowed to use it.',
            'It does not break the law or infringe anyone else\'s rights.',
            'Where it includes another person\'s details, such as a companion\'s nationality or a collaborator\'s email address, that person has agreed.',
          ],
        },
        { type: 'subheading', text: 'Plans the AI writes for you' },
        { type: 'p', text: 'As far as we have any rights in a plan generated for you, you may use, change, print and share it for your own travel. AI-written text may be similar to text written for someone else, and the law on who owns it is unsettled, so we cannot promise that a plan is yours alone.' },
        { type: 'subheading', text: 'Keep your own copy' },
        { type: 'p', text: 'Trippy is not a backup service. Keep your own record of anything you cannot afford to lose, booking references above all. You can save any trip as a PDF.' },
      ],
    },
    {
      id: 'sharing',
      heading: 'Shared plans and collaborators',
      blocks: [
        {
          type: 'list',
          items: [
            '**Share links:** A share link lets anyone who has it read a reduced copy of the trip without signing in. You are responsible for who you send it to. It stops working 7 days after it is made, or sooner if you press Stop sharing. You can make a new link at any time.',
            '**Collaborators:** A person you invite by email can see the whole trip, including your trip request and notes, and an editor can change it. Changes an editor makes are saved to your trip. Invite only people you trust, and only with their agreement.',
            '**Trips shared with you:** A trip someone shares with you belongs to them. They can change it, remove your access or delete it at any time. Do not pass on what you see there without their permission.',
          ],
        },
        { type: 'p', text: 'The Privacy policy says exactly what a share link shows and hides: see [Shared links and collaborators](#/privacy/shared-links).' },
      ],
    },
    {
      id: 'acceptable-use',
      heading: 'Acceptable use',
      blocks: [
        { type: 'p', text: 'Use Trippy to plan travel for yourself and the people you travel with. You must not:' },
        {
          type: 'list',
          items: [
            'use it for anything unlawful, or to plan something unlawful;',
            'enter content that is defamatory, obscene, threatening or hateful, or that infringes someone\'s rights or privacy;',
            'enter another person\'s personal data without their agreement;',
            'try to get into accounts, trips or data that are not yours, or to get round the access rules, the daily limits or any other security measure;',
            'probe or attack the service, or introduce malicious code;',
            'use scripts, bots or other automated means to send requests, create accounts or copy content in bulk;',
            'try to make the AI models produce harmful or unlawful material, or use the plan writer for anything other than travel planning;',
            'resell the service, or offer it to others as your own, without our written agreement;',
            'remove photo credits, map credits or other notices.',
          ],
        },
        { type: 'p', text: 'Trippy is free because use is limited. Each account has daily limits on plans and chat requests, and we may change those limits.' },
      ],
    },
    {
      id: 'third-parties',
      heading: 'Other services and links',
      blocks: [
        { type: 'p', text: 'Trippy is built on services run by others. Supabase hosts sign-in and the database, in Singapore. Google provides sign-in and the Gemini AI models, which Trippy uses on the free tier of Google\'s service, with Mistral as a fallback model. Maps come from OpenStreetMap, and photos and place information come from sources such as Wikimedia, Openverse, Pexels and Google Maps. GitHub hosts the website. The full list is in the Privacy policy under [Who receives your data](#/privacy/service-providers).' },
        { type: 'p', text: 'We choose these services with care, but we do not control them. They can change, fail or stop, and Trippy can be affected when they do.' },
        { type: 'p', text: 'On the free tier, Google may use what Trippy sends to its models to improve its products, and human reviewers may read it. Do not put sensitive personal details in a trip request. The Privacy policy says what is sent, under [AI models and Google\'s free tier](#/privacy/ai-models).' },
        { type: 'subheading', text: 'Links to other sites' },
        { type: 'p', text: 'Trip pages link to booking and map sites, including Booking.com, Trip.com, Skyscanner, Google Maps and Rome2Rio, and to official government pages for entry requirements. Those sites are not ours. A link is a convenience, not a recommendation or a guarantee, and what you do there is between you and that site under its own terms and privacy policy.' },
        { type: 'subheading', text: 'No commission' },
        { type: 'p', text: 'The booking links are plain links to other sites. They carry no partner code. Nobody pays Trippy to show them or to appear in a plan, and Trippy earns no commission when you book.' },
      ],
    },
    {
      id: 'intellectual-property',
      heading: 'Intellectual property and photo credits',
      blocks: [
        { type: 'p', text: 'The Trippy name and logo, the design of the app and its software belong to the operator or its licensors. You may use the app as these terms allow. You may not copy, modify or redistribute the app or its design, or use the name or logo in a way that suggests we endorse you, without our written permission. Open-source components keep their own licences.' },
        { type: 'subheading', text: 'Photos and maps' },
        { type: 'p', text: 'Photos in Trippy belong to their photographers or publishers. Many are used under open licences from Wikimedia Commons, Openverse and Pexels, and are credited. Others are shown from where they are published on the web or on Google Maps. Open Photo credits at the foot of any page to see the credits for that page. Map data is from OpenStreetMap contributors and is available under the Open Database Licence.' },
        { type: 'p', text: 'You may view the photos and maps inside Trippy and in a PDF you save for your own trip. Any other use needs the permission of the rights holder or must follow the licence of the photo.' },
        { type: 'subheading', text: 'If something is yours' },
        { type: 'p', text: 'If you believe a photo or other content in Trippy infringes your copyright, or you want a photo of your venue removed or credited differently, write to us with the address of the page and the item concerned, and we will look into it promptly: {contactEmail}.' },
        { type: 'subheading', text: 'Feedback' },
        { type: 'p', text: 'If you send us an idea or a suggestion, we may use it without owing you anything.' },
      ],
    },
    {
      id: 'availability',
      heading: 'Availability and changes to the service',
      blocks: [
        { type: 'p', text: 'Trippy is free and experimental. It is offered as it is and as available. We try to keep it running, but we do not promise that it will be available at any particular time, that it will be free of faults, or that a plan will finish writing.' },
        {
          type: 'list',
          items: [
            'We may add, change or remove features, limits and providers.',
            'We may pause the service for maintenance or because a provider is down.',
            'We may stop offering Trippy altogether. If we do, we will try to give at least 30 days\' notice in the app so that you can save your trips as PDFs.',
          ],
        },
        { type: 'p', text: 'Offline copies depend on your browser keeping them, and browsers clear stored data on their own rules. Do not count on an offline copy as your only record of a trip.' },
      ],
    },
    {
      id: 'liability',
      heading: 'Disclaimers and limits on our liability',
      blocks: [
        { type: 'note', title: 'What the law protects', text: [
          'Nothing in these terms excludes or limits our liability for death or personal injury caused by our negligence, for fraud or fraudulent misrepresentation, or for anything else that cannot be excluded or limited under the laws of Singapore.',
          'Nothing in these terms takes away a right or remedy you have as a consumer under the Consumer Protection (Fair Trading) Act 2003, or under any other law, that cannot be given up by agreement.',
          'Nothing in these terms reduces what the Personal Data Protection Act 2012 requires of us, or the rights it gives you.',
          'Every exclusion and limit below applies only so far as it is reasonable under the Unfair Contract Terms Act 1977 and is otherwise allowed by law.',
        ] },
        { type: 'subheading', text: 'No warranties beyond these terms' },
        { type: 'p', text: 'Subject to the box above, we give no warranty, condition or promise about Trippy that is not written in these terms. In particular we do not warrant that a plan or any information in Trippy is accurate, complete, current or suitable for your purpose, or that the service will be uninterrupted or secure against every attack.' },
        { type: 'subheading', text: 'What we are not liable for' },
        { type: 'p', text: 'Subject to the box above, we are not liable for:' },
        {
          type: 'list',
          items: [
            'loss that comes from relying on a plan or on information in Trippy without checking it as these terms ask, including a missed connection, a closed venue, a price that differs from an estimate, or being refused boarding or entry;',
            'the acts or omissions of airlines, hotels, operators, booking sites or any other provider you deal with, or of the services Trippy is built on;',
            'loss of your content, where you could have kept your own copy;',
            'loss caused by events outside our reasonable control, such as a provider outage, a network failure or a change in the law;',
            'loss that was not a reasonably foreseeable result of our breach when you agreed to these terms;',
            'loss of profit, revenue, business or goodwill. Trippy is for personal use.',
          ],
        },
        { type: 'subheading', text: 'A cap on what remains' },
        { type: 'p', text: 'Subject to the box above, our total liability to you for all claims arising from Trippy or these terms, whether in contract, in tort including negligence, or otherwise, is limited to 100 Singapore dollars. We think this is reasonable because Trippy is free, you pay us nothing, and the terms ask you to check a plan before relying on it.' },
        { type: 'subheading', text: 'Your own responsibility' },
        { type: 'p', text: 'You are responsible for your travel: for your bookings, your documents, your insurance, your health and safety, and for obeying the laws of the places you visit.' },
      ],
    },
    {
      id: 'indemnity',
      heading: 'If your use causes a claim against us',
      blocks: [
        { type: 'p', text: 'If someone else brings a claim against us because you broke these terms or the law, or because content you put into Trippy infringed their rights, you agree to make good the reasonable losses and costs we incur as a direct result, including reasonable legal costs.' },
        {
          type: 'list',
          items: [
            'This covers only the part of the loss that your breach caused. It does not cover loss to the extent we caused or added to it.',
            'We will tell you about the claim promptly, take reasonable steps to keep the loss down, and not settle it in a way that commits you to pay without first consulting you.',
          ],
        },
      ],
    },
    {
      id: 'suspension',
      heading: 'Suspension and ending',
      blocks: [
        { type: 'subheading', text: 'You may stop at any time' },
        { type: 'p', text: 'You can stop using Trippy whenever you like. Delete your trips in Settings, under Data. Delete your account in Settings, under Account, with Delete my account. You do not have to ask us. When your account is deleted these terms end for you, apart from the sections listed under What continues.' },
        { type: 'subheading', text: 'When we may suspend or close an account' },
        { type: 'p', text: 'We may suspend or close your account if you seriously or repeatedly break these terms, if your use puts the service or other people at risk, if the law requires it, or if we stop offering Trippy. Unless the matter is urgent or the law prevents it, we will tell you why beforehand at the email address of your account and give you a fair chance to put things right or to save your trips.' },
        { type: 'subheading', text: 'What happens to your data' },
        { type: 'p', text: 'When an account is deleted, by you or by us, the account, the profile and the trips it owns are deleted as the Privacy policy describes under [How long we keep your data](#/privacy/retention). Share links to those trips stop working and collaborators lose access. Copies that you or others saved as PDFs are outside our control.' },
        { type: 'subheading', text: 'What continues' },
        { type: 'p', text: 'The sections on your content (for as long as we lawfully hold any), intellectual property, liability, indemnity, governing law and the general terms continue to apply after these terms end.' },
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to these terms',
      blocks: [
        { type: 'p', text: 'We may change these terms when the service changes, when the law changes, or to make them clearer. The date under the title is the date of the latest version.' },
        { type: 'p', text: 'For a change that reduces your rights or adds to your obligations, we will post a notice in the app or on this page at least 14 days before it takes effect, unless the law or a security problem requires a faster change. If you do not accept the new terms, stop using Trippy before they take effect. You can delete your account in Settings at any time. Using Trippy after that date means you accept them. Changes do not apply to a dispute that arose before they took effect.' },
      ],
    },
    {
      id: 'governing-law',
      heading: 'Governing law and disputes',
      blocks: [
        { type: 'subheading', text: 'Talk to us first' },
        { type: 'p', text: 'If you have a complaint or a dispute with us, please write to us first and describe the problem and what you would like done about it: {contactEmail}. We will do the same if we have a complaint about your use. Each of us will try in good faith to settle it within 30 days of that message before starting court proceedings. This does not stop either of us going to court sooner for urgent relief.' },
        { type: 'subheading', text: 'Law and courts' },
        { type: 'p', text: 'These terms, and any dispute or claim arising from them or from your use of Trippy, including a non-contractual one, are governed by the laws of Singapore. Subject to the next paragraph, the courts of Singapore have exclusive jurisdiction to settle any such dispute, which means that a claim must be brought there and not in another country, and you and we submit to that jurisdiction. This includes the Small Claims Tribunals of Singapore for claims within their limits.' },
        { type: 'p', text: 'If you live outside Singapore, the consumer protection law of your own country may give you rights that cannot be removed by agreement, including a right to bring a claim in your local courts. These terms do not take those rights away.' },
      ],
    },
    {
      id: 'general',
      heading: 'General terms',
      blocks: [
        {
          type: 'defs',
          rows: [
            { term: 'No rights for third parties', text: 'A person who is not a party to these terms has no right under the Contracts (Rights of Third Parties) Act 2001 to enforce any of them.' },
            { term: 'Severability', text: 'If a court finds part of these terms invalid or unenforceable, that part is to be read down as far as needed, or removed if it cannot be, and the rest stays in force.' },
            { term: 'No waiver', text: 'If we do not enforce a term at once, or at all on one occasion, we have not given up the right to enforce it later. A waiver counts only if it is in writing.' },
            { term: 'Entire agreement', text: 'These terms, with the Privacy policy, are the whole agreement between you and us about Trippy and replace anything said earlier on the subject. Neither of us relies on a statement that is not in them. This does not exclude liability for fraud, or for any misrepresentation that the law does not allow us to exclude.' },
            { term: 'Transfer', text: 'These terms are personal to you and you may not transfer them. We may transfer our rights and obligations to someone who takes over the running of Trippy, and we will tell you beforehand so that you can delete your account first if you prefer.' },
            { term: 'Language', text: 'These terms are written in English and may be offered in other languages for convenience. If a translation differs from the English text, the English text governs.' },
            { term: 'Notices', text: 'We give notices in the app, on this page or at the email address of your account. You give notices to us at the contact address below.' },
          ],
        },
      ],
    },
    {
      id: 'contact',
      heading: 'Contact',
      blocks: [
        {
          type: 'defs',
          rows: [
            { term: 'Operator', text: '{operator}' },
            { term: 'Questions about these terms', text: '{contactEmail}' },
            { term: 'Questions about your personal data', text: '{dpoEmail}' },
            { term: 'Where Trippy lives', text: '{siteUrl}' },
          ],
        },
      ],
    },
  ],
};
