// Tietoja Trippystä, suomeksi. Käännös tiedostosta about.en.js: samat osiot samoilla tunnisteilla,
// lohko lohkolta. Sivun omat lohkot rakentaa js/site/about/blocks.js alla olevista sanoista, ja
// esimerkkisuunnitelman paikat ja sanat annetaan suomeksi sekä demoHtml:lle että mountAboutille.
// Sovelluksen omat painikkeet ja otsikot ovat toistaiseksi englanniksi, joten ne mainitaan tässä
// siinä muodossa kuin ne näkyvät ruudulla.
import '../../../css/components/site-about.css';
import { demoHtml, limitsHtml, squareHtml, stepsHtml, viewsHtml } from '../about/blocks.js';
import { mountAbout } from '../about/mount.js';

const BASE_URL = import.meta.env?.BASE_URL || '/';

const stop = (time, name, cost = 0) => Object.freeze({ time, name, cost });
const day = (title, condition, stops) => Object.freeze({ title, condition, stops: Object.freeze(stops) });

/** Samat paikat, päivät, kellonajat ja hinnat kuin js/site/about/plan-sketch.js:ssä, sanat suomeksi. */
const PLACES = Object.freeze([
  Object.freeze({
    id: 'kyoto', name: 'Kioto', month: 'huhtikuussa', currency: 'JPY', lowC: 9, highC: 19,
    days: Object.freeze([
      day('Higashiyama kävellen', 'Puolipilvistä', [
        stop('09:00', 'Kiyomizu-dera', 500),
        stop('10:45', 'Sannenzakan ja Ninenzakan kujat'),
        stop('12:30', 'Lounas Yasakan pyhäkön lähellä', 1500),
        stop('14:30', 'Kennin-ji', 800),
        stop('18:30', 'Illallinen Pontochossa', 4000),
      ]),
      day('Fushimi ja kauppahalli', 'Aurinkoista', [
        stop('08:00', 'Fushimi Inari Taisha'),
        stop('12:00', 'Lounas Nishikin kauppakujalla', 2000),
        stop('14:30', 'Nijon linna', 1300),
        stop('18:30', 'Illallinen Karasuman lähellä', 3000),
      ]),
      day('Arashiyama', 'Sadekuuroja', [
        stop('08:30', 'Bambumetsä'),
        stop('09:30', 'Tenryu-jin puutarha', 500),
        stop('12:00', 'Tofulounas joen rannalla', 2500),
        stop('14:00', 'Okochi Sanson huvila', 1000),
      ]),
      day('Kaupungin pohjoisosa', 'Puolipilvistä', [
        stop('09:00', 'Kinkaku-ji', 500),
        stop('10:30', 'Ryoan-jin kivipuutarha', 600),
        stop('12:30', 'Sobalounas Kitanon lähellä', 1200),
        stop('14:30', 'Daitoku-jin temppelipuutarhat', 800),
        stop('18:00', 'Illallinen taas Gionissa', 3500),
      ]),
    ]),
  }),
  Object.freeze({
    id: 'lisbon', name: 'Lissabon', month: 'toukokuussa', currency: 'EUR', lowC: 14, highC: 23,
    days: Object.freeze([
      day('Alfama ja linna', 'Aurinkoista', [
        stop('09:30', 'Castelo de São Jorge', 15),
        stop('11:30', 'Miradouro de Santa Luzia'),
        stop('13:00', 'Lounas Alfamassa', 15),
        stop('15:00', 'Lissabonin katedraali', 5),
        stop('20:00', 'Illallinen ja fadoa', 35),
      ]),
      day('Belém', 'Aurinkoista', [
        stop('09:30', 'Jerónimosin luostari', 12),
        stop('11:30', 'Vaniljaleivokset, Pastéis de Belém', 5),
        stop('13:00', 'Lounas joen rannalla', 18),
        stop('15:00', 'MAAT', 11),
      ]),
      day('Baixa ja Chiado', 'Puolipilvistä', [
        stop('10:00', 'Praça do Comércio'),
        stop('11:00', 'Carmon luostari', 7),
        stop('13:00', 'Lounas Time Out Marketissa', 18),
        stop('15:30', 'LX Factory'),
        stop('19:30', 'Illallinen Bairro Altossa', 25),
      ]),
      day('Päiväretki Sintraan', 'Pilvistä', [
        stop('09:00', 'Juna Rossion asemalta', 5),
        stop('10:30', 'Penan palatsi', 20),
        stop('13:00', 'Lounas vanhassakaupungissa', 15),
        stop('14:30', 'Quinta da Regaleira', 15),
      ]),
    ]),
  }),
  Object.freeze({
    id: 'penang', name: 'Penang', month: 'helmikuussa', currency: 'MYR', lowC: 24, highC: 32,
    days: Object.freeze([
      day('George Town kävellen', 'Aurinkoista', [
        stop('09:00', 'Khoo Kongsin klaanitalo', 15),
        stop('10:30', 'Katutaidetta Armenian Streetin ympärillä'),
        stop('12:30', 'Char kway teow Kimberley Streetillä', 12),
        stop('14:30', 'Cheong Fatt Tze eli Sininen kartano', 25),
        stop('19:00', 'Katuruokaillallinen Gurney Drivella', 25),
      ]),
      day('Penang Hill ja Kek Lok Si', 'Puolipilvistä', [
        stop('08:30', 'Penang Hillin köysirata', 30),
        stop('12:00', 'Assam laksa Air Itamissa', 10),
        stop('14:00', 'Kek Lok Sin temppeli', 16),
        stop('19:00', 'Illallinen New Lanen katukeittiöissä', 25),
      ]),
      day('Laiturikylät ja vanhat talot', 'Sadekuuroja', [
        stop('09:00', 'Chew Jetty'),
        stop('10:30', 'Pinang Peranakan Mansion', 25),
        stop('12:30', 'Nasi kandar lounaaksi', 15),
        stop('15:00', 'Fort Cornwallis', 20),
      ]),
      day('Pohjoisrannikko', 'Aurinkoista', [
        stop('09:00', 'Penangin kansallispuiston polku'),
        stop('12:30', 'Lounas Teluk Bahangissa', 20),
        stop('14:30', 'Tropical Spice Garden', 30),
        stop('19:00', 'Batu Ferringhin yötori', 30),
      ]),
    ]),
  }),
]);

const SKETCH = Object.freeze({
  title: '{place}, {days} päivää {month}',
  day: 'Päivä {n}',
  stops: 'Kohteita',
  cost: 'Aktiviteettien arvio',
  costBasis: 'henkeä kohti',
  weather: 'Tyypillinen sää',
  range: '{low}-{high} °C',
  free: 'Maksuton',
});

const DEMO = {
  legendPlace: 'Paikka',
  legendDays: 'Pituus',
  daysOption: '{n} päivää',
  note: 'Tämä esimerkki on kirjoitettu käsin tätä sivua varten, eikä mitään lähetetä minnekään, kun muutat sitä. Paikat ovat oikeita. Hinnat ovat pyöreitä lukuja, jotka näyttävät vain asettelun, joten älä laske budjettiasi niiden varaan.',
};

const STEPS = {
  openAll: 'Avaa kaikki vaiheet',
  closeAll: 'Sulje kaikki vaiheet',
  next: 'Seuraavaksi: {title}',
  steps: [
    {
      title: 'Kuvailet matkan',
      summary: 'Seitsemän lyhyttä näkymää',
      body: [
        'Suunnittelutyökalu kysyy, minne olet menossa (yhteen kaupunkiin vai useaan), milloin ja kuinka monta teitä on, kuinka mukavasti haluat matkustaa ja paljonko käyttäisit päivässä, missä haluat yöpyä, miten haluat päästä perille ja miten vietät aikasi mieluiten. Viimeinen näkymä näyttää kaiken kerralla, ja siinä on kenttä omille huomioillesi: paikat, jotka on pakko nähdä, ruoat, joita et voi syödä, asiat, jotka jättäisit mieluummin väliin, tai muualta liittämäsi taustatiedot.',
        'Jos lennot tai hotelli on jo varattu, kirjoitat ne mukaan ja suunnitelma rakennetaan niiden ympärille. Päivä 1 alkaa vasta, kun olet laskeutunut. Ulkomaanmatkalla työkalu kysyy myös, minkä maiden passeilla seurueesi matkustaa, jotta se osaa kertoa viisumeista ja maahantulolomakkeista.',
      ],
    },
    {
      title: 'Pyyntö lähtee tekoälymallille',
      summary: 'Ensin Google Gemini, sen jälkeen kaksi varamallia',
      body: [
        'Vastauksistasi muotoillaan kirjallinen pyyntö, joka lähetetään Googlen Gemini-mallille. Jos Gemini on ruuhkautunut tai ei vastaa, tilalle tulee kevyempi Gemini-malli ja sen jälkeen Mistralin malli. Nimesi ja sähköpostiosoitteesi eivät kuulu pyyntöön. Se, mitä kirjoitit huomiokenttään, kuuluu.',
        'Pitkä matka ei mahdu yhteen vastaukseen, joten suunnitelma kirjoitetaan noin neljä päivää kerrallaan. Siksi kahden viikon matkaan menee viitisen minuuttia ja viikonloppuun paljon vähemmän. Voit sulkea ikkunan sillä aikaa. Suunnitelma valmistuu ilman sinuakin, ja voit pyytää ilmoituksen, kun se on valmis.',
      ],
    },
    {
      title: 'Luonnos palaa suunnitelmana, ei esseenä',
      summary: 'Päivät, kohteet, kellonajat, kulut',
      body: [
        'Malli vastaa kiinteässä rakenteessa: jokaiselle päivälle lista kohteita, ja jokaisella kohteella on kellonaika, paikan nimi, osoite ja koordinaatit, vinkki, hinta henkeä kohti ja rivi siitä, miten edellisestä kohteesta pääsee perille. Ensimmäisten päivien mukana se kirjoittaa myös koko matkaa koskevat osat: lennot kotikaupungistasi tai lähikohteeseen lautan, junan tai bussin, majoitukset joka kaupungissa ja listan siitä, mitä kannattaa varata etukäteen.',
        'Trippy tarkistaa vastauksen ennen kuin ottaa sen talteen. Jos vastaus katkesi kesken, valmiit päivät säilytetään ja loput pyydetään uudelleen. Ravintola, jota suunnitelma käytti jo toisena päivänä, jätetään pois. Vanhaa suunnitelmaa ei korvata, ennen kuin koko uusi on tallennettu, joten epäonnistuneen yrityksen jälkeen sinulla on yhä se, mikä oli ennenkin.',
      ],
    },
    {
      title: 'Kuvat haetaan jälkikäteen',
      summary: 'Oikea kuva paikasta tai ei kuvaa lainkaan',
      body: [
        'Malli ei toimita kuvia. Trippy etsii jokaiselle kohteelle kuvan juuri siitä paikasta: ensin OpenStreetMapista, Wikidatasta, Wikipediasta ja Wikimedia Commonsista, sitten paikan omilta verkkosivuilta ja Openversestä ja viimeiseksi paikan Google Maps -sivulta ja verkkosivuilta, joilla paikka mainitaan nimeltä. Kuvaa käytetään vain, jos se voidaan yhdistää paikkaan tunnisteen, koordinaattien tai nimen perusteella.',
        'Jos mitään ei voida yhdistää paikkaan, kortissa näkyy piirretty paikkamerkki. Väärä kuva, joka näyttää oikealta, on pahempi kuin ei kuvaa ollenkaan. Jokaisen kuvan tekijätiedot säilyvät, ja alatunnisteen **Kuvien tekijätiedot** luettelee sen sivun kuvat, jolla juuri olet.',
      ],
    },
    {
      title: 'Kartta piirretään koordinaateista',
      summary: 'Pohjana OpenStreetMap',
      body: [
        'Jokainen kohde sijoitetaan kartalle niihin koordinaatteihin, jotka malli sille antoi. Katukartta on OpenStreetMap, ja Atlas-näkymän maailmankartan ääriviivat ovat Natural Earthista. Kun lisäät tai muutat kohteen itse, myös paikkahaku käyttää OpenStreetMapin tietoja, ja kävelymatka seuraavaan kohteeseen lasketaan uudelleen.',
        'Mallin antama koordinaatti voi olla korttelin tai kaksi sivussa, ja silloin tällöin se on yksinkertaisesti väärä. Tarkista osoite ennen kuin lähdet paikkaan, jolla on sinulle väliä.',
      ],
    },
    {
      title: 'Kaksi merkintää on muotoiltu tarkasti',
      summary: 'Tyypillinen sää ja aktiviteettien arvio',
      body: [
        '**Tyypillinen sää** (sovelluksessa Typical weather) on se, mitä malli odottaa siltä paikalta siihen aikaan vuodesta. Se kirjoitetaan kerran, kun suunnitelma tehdään. Se ei ole sääennuste, se ei päivity, eikä se tiedä mitään siitä viikosta, jonka olet perillä. Käytä sitä pakkaamisen apuna ja katso oikea ennuste sääpalvelusta muutamaa päivää ennen lähtöä.',
        '**Aktiviteettien arvio** (sovelluksessa Activities estimated) on summa hinnoista, jotka malli antoi suunnitelman kohteille: pääsyliput, ateriat, opastetut kierrokset. Se on henkeä kohti, eikä siinä ole mukana lentoja, majoitusta eikä liikkumista paikan päällä. Hinnat ovat mallin paras muistikuva, eivät tarjouksia, ja ne voivat olla vanhentuneita.',
      ],
    },
    {
      title: 'Sen jälkeen suunnitelma on sinun',
      summary: 'Muokkaa, vaihda, jaa, ota mukaan ilman verkkoa',
      body: [
        'Voit muuttaa, lisätä tai poistaa minkä tahansa kohteen. **Alternatives** ehdottaa yhden kohteen tilalle kolmea lähellä olevaa vaihtoehtoa. Matkan chat-paneeliin voi kirjoittaa pyyntöjä, kuten ”tee päivästä 3 rauhallisempi”, ja se näyttää ehdottamansa muutokset. Mitään ei tallenneta, ennen kuin hyväksyt ne. Voit ajaa koko suunnitelman uudelleen, jakaa linkin, jolla matkaa voi vain lukea, kutsua jonkun sähköpostiosoitteella katsomaan tai muokkaamaan ja viedä suunnitelman PDF-tiedostoksi.',
        'Viimeksi avaamasi matkat säilytetään laitteellasi, joten suunnitelma aukeaa myös lentokoneessa tai kellarikerroksen ravintolassa.',
      ],
    },
  ],
};

const LIMITS = {
  does: {
    title: 'Mitä Trippy tekee',
    items: [
      'Kirjoittaa muutamasta vastauksesta kokonaisen suunnitelman päivä päivältä, yleensä minuuteissa.',
      'Suunnittelee sen ympärille, mikä on jo lyöty lukkoon: varatut lennot, varattu hotelli, päivät, joina sinun on tehtävä töitä.',
      'Nimeää oikeita paikkoja ja antaa niille osoitteen, pisteen kartalla ja rivin siitä, miten perille pääsee.',
      'Vaihtaa lennot lauttaan, junaan tai bussiin, kun kohde on lähellä kotia.',
      'Luettelee seurueesi passeille tarvittavat viisumit, maahantulolomakkeet ja matkustusluvat ja linkittää virallisille sivuille.',
      'Ottaa vastaan muualla suunnittelemasi matkan varauksineen toiminnolla **Import trip**.',
      'Pitää viimeisimmät matkasi luettavissa ilman verkkoyhteyttä.',
    ],
  },
  doesNot: {
    title: 'Mitä Trippy ei tee',
    items: [
      'Se ei varaa mitään. Linkit lentoyhtiöille, hotelleihin ja varaussivustoille vievät niiden omille sivuille, ja ostat siellä.',
      'Se ei tiedä ajantasaisia hintoja. Kulut ovat arvioita aktiviteeteista henkeä kohti, ja lentojen ja hotellien hinnat ovat karkeasti suuntaa antavia.',
      'Se ei tiedä, millainen sää on tulossa. Suunnitelman sää on vuodenajalle tyypillinen, ei ennuste.',
      'Se ei tarkista aukioloaikoja, sulkemisia eikä loppuunmyytyjä päiviä. Paikka, jonka malli muistaa, on voinut lopettaa.',
      'Se ei anna oikeudellisia neuvoja maahantulosta. Maahantulovaatimukset ovat ohjeellisia ja säännöt muuttuvat, joten varmista ne kunkin maan viranomaisilta ennen kuin maksat mitään.',
      'Se ei seuraa sijaintiasi. Käynnissä olevan päivän merkki kulkee kellon mukaan, ei puhelimesi sijainnin.',
    ],
  },
};

const VIEWS = {
  legend: 'Näytettävä näkymä',
  isDefault: 'Oletus',
  alt: 'Näkymän {view} etusivun yläosa puhelimessa, esimerkkitilillä',
  views: {
    atlas: {
      name: 'Atlas',
      text: [
        'Kartta ja lokikirja. Etusivu alkaa yhdellä virkkeellä siitä, missä vaiheessa suunnitelmasi ovat, ja sen alla on matka, joka on käynnissä tai seuraavana vuorossa.',
        'Atlaksella on myös oma sivunsa, jolla jokainen suunnittelemasi paikka on piirretty maailmankartalle. Kartan alla on lokikirja, josta näkee, mille kunkin vuoden kuukausille on suunnitelma.',
      ],
    },
    departures: {
      name: 'Departures',
      text: [
        'Matkasi lentokentän lähtötauluna: jokaisella matkalla on oma rivinsä, jolla näkyy lähtöaika, kesto, aktiviteettien arvioitu hinta ja se, kuinka valmis matka on. Luvut on ladottu tasalevyisellä kirjasimella, ja otsikot kääntyvät esiin kuin vanhan lähtötaulun läpät.',
        'Tämä on niille, jotka haluavat nähdä luvut ensin.',
      ],
    },
    concierge: {
      name: 'Concierge',
      text: [
        'Etusivu aamun tilannekatsauksena. Se kertoo yhdessä kappaleessa, monesko matkapäivä on menossa, mitä on seuraavaksi ja mikä on vielä sopimatta, ja sanat ovat linkkejä matkoihin, joista ne puhuvat.',
        'Se on kolmesta rauhallisin, ja siinä on eniten tilaa tekstille.',
      ],
    },
  },
};

const SQUARE = {
  alt: 'Etusivu neliöasettelussa: yksi matkakortti täyttää näytön, ja sen alla on pisteet muille korteille',
  text: [
    'Joissakin puhelimissa on neliön muotoinen näyttö, esimerkiksi Unihertz Titan 2:ssa, ja pitkä vieritettävä sivu on niillä tuskallinen. Kun näyttö on lähes neliö, Trippy muuttaa jokaisen sivun korttipakaksi, jota selataan sivusuunnassa kortti ja näytöllinen kerrallaan.',
    'Asettelu kytkeytyy päälle itsestään, ja [asetusten](#/settings) valinnalla **Square layout** sen voi pakottaa päälle tai pois. Valinta tallentuu laitteelle, ei tilillesi.',
  ],
  credit: 'Esimerkkitili. Sevillan katedraalin kuva: [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sevilla_Cathedral_-_Southeast.jpg).',
};

/** @type {import('../content.js').SitePage} */
export default {
  title: 'Tietoja Trippystä',
  intro: [
    'Trippy on selaimessa toimiva matkasuunnittelija. Vastaat muutamaan kysymykseen matkastasi, ja tekoälymalli kirjoittaa jokaiselle päivälle suunnitelman, jossa on oikeita paikkoja, kellonaikoja ja karkeat kulut. Sen jälkeen muutat kaiken, mistä et pidä.',
    'Trippy on maksuton, siinä ei ole mainoksia, eikä se varaa tai myy mitään.',
  ],
  sections: [
    {
      id: 'what-it-is',
      heading: 'Mikä Trippy on',
      blocks: [
        { type: 'p', text: 'Matkan suunnittelu käsin tarkoittaa tusinaa selainvälilehteä ja yhtä taulukkoa. Trippy tekee siitä työstä ensimmäisen luonnoksen. Se kysyy minne, milloin, ketkä ja millä rahalla ja antaa takaisin jotain alla olevan esimerkin kaltaista: päivät, joilla on teema, kohteet järjestyksessä, jossa on kartalla järkeä, jokaiselle kellonaika ja kertyvä arvio siitä, mitä aktiviteetit maksavat.' },
        { type: 'p', text: 'Oikea suunnitelma on tätä pidempi, ja siinä on lisäksi osoitteet, kuvat, kartta, lennot tai maakuljetukset, majoitukset ja lista ajoissa varattavista asioista. Valitse paikka ja pituus, niin näet, miltä suunnitelman runko näyttää.' },
        { type: 'custom', html: demoHtml(DEMO, { places: PLACES, sketchWords: SKETCH }) },
        { type: 'p', text: 'Luonnos on lähtökohta. Suurin osa Trippyssä vietetystä ajasta kuluu sen jälkeen: museo siirretään sadepäivälle, ravintola vaihdetaan toiseen, ja varausnumero lisätään, kun lento on maksettu.' },
      ],
    },
    {
      id: 'how-a-plan-is-made',
      heading: 'Miten suunnitelma syntyy',
      blocks: [
        { type: 'p', text: 'Tässä ei ole mitään salattavaa. Kun tiedät, miten suunnitelma kootaan, tiedät myös, mihin sen osiin voi luottaa. Nämä vaiheet ovat painikkeen painamisen ja päivän 1 lukemisen välissä.' },
        { type: 'custom', html: stepsHtml(STEPS) },
      ],
    },
    {
      id: 'what-it-does-and-does-not-do',
      heading: 'Mitä se tekee ja mitä se ei tee',
      blocks: [
        { type: 'p', text: 'Trippy on hyvä suunnittelun puuduttavassa osassa, ja joissakin muissa osissa siitä ei ole mitään apua. Molemmat listat kannattaa lukea ennen kuin luotat siihen.' },
        { type: 'custom', html: limitsHtml(LIMITS) },
        { type: 'note', title: 'Tekoäly voi olla väärässä', text: 'Kielimalli kirjoittaa sujuvasti, oli se oikeassa tai ei. Se voi sijoittaa kahvilan väärälle kadulle, kertoa viimevuotisen lipun hinnan tai suositella paikkaa, joka on jo lopettanut. Suhtaudu suunnitelmaan kuin paljon lukeneen ystävän neuvoihin, kun ystävä ei ole käynyt perillä vähään aikaan, ja tarkista kaikki, minkä pieleen meneminen harmittaisi.' },
      ],
    },
    {
      id: 'views',
      heading: 'Kolme näkymää samoihin matkoihin',
      blocks: [
        { type: 'p', text: 'Ihmiset lukevat suunnitelmaa eri tavoin, joten kirjautuneen käyttäjän sivuista on kolme näkymää. Niissä on samat matkat ja samat tiedot, vain eri makuun aseteltuina. Saat valita näkymän, kun kirjaudut ensimmäisen kerran, ja voit vaihtaa sitä [asetuksissa](#/settings) milloin haluat. Jokaisesta on tumma ja vaalea teema.' },
        { type: 'custom', html: viewsHtml(VIEWS, { baseUrl: BASE_URL }) },
        { type: 'subheading', text: 'Neliön muotoiset näytöt' },
        { type: 'custom', html: squareHtml(SQUARE, { baseUrl: BASE_URL }) },
      ],
    },
    {
      id: 'your-data',
      heading: 'Sinun tietosi',
      blocks: [
        { type: 'p', text: 'Kirjaudut Google-tilillä, ja Trippy tallentaa siitä nimesi, sähköpostiosoitteesi ja profiilikuvasi. Se tallentaa myös sen, mitä kerrot sille: kotikaupunkisi, valuuttasi, passisi maan ja matkasi kaikkine sisältöineen. Matkaa varten antamasi vastaukset lähetetään tekoälypalvelun tarjoajalle, jotta se voi kirjoittaa suunnitelman. Viimeisimmät matkasi tallennetaan myös laitteellesi, jotta ne aukeavat ilman verkkoa, ja ne poistetaan laitteelta, kun kirjaudut ulos. Mainoksia ei ole, eikä mainosseurantaa. [Tietosuojakäytäntö](#/privacy) kertoo tämän kaiken kokonaan, myös sen, miten voit nähdä, korjata tai poistaa sinusta tallennetut tiedot ja miten peruutat suostumuksesi.' },
      ],
    },
    {
      id: 'who-makes-it',
      heading: 'Kuka Trippyä tekee',
      blocks: [
        { type: 'p', text: 'Trippy on henkilökohtainen projekti, ja sen kotimaa on {country}. Siellä sitä tehdään ja ylläpidetään. Se sai alkunsa työkaluna omien Singaporesta lähtevien matkojemme suunnitteluun, ja siksi oletukset kallistuvat siihen suuntaan: Singaporen dollarit ja ehdotusten joukossa lyhyet pyrähdykset Batamin ja Desarun kaltaisiin paikkoihin. Matkan voi silti suunnitella mistä tahansa minne tahansa.' },
        { type: 'p', text: 'Käyttö ei maksa mitään, eikä maksullista versiota ole. Linkit varaussivustoille ovat tavallisia linkkejä, eikä Trippy ansaitse mitään, kun avaat sellaisen. Jos tämä joskus muuttuu, se kerrotaan ensimmäiseksi tällä sivulla.' },
        { type: 'defs', rows: [
          { term: 'Ylläpitäjä', text: '{operator}' },
          { term: 'Kysymykset ja ongelmat', text: 'Kirjoita osoitteeseen: {contactEmail}' },
          { term: 'Henkilötietojasi koskevat asiat', text: 'Kirjoita tietosuojavastaavalle: {dpoEmail}' },
          { term: 'Missä Trippy on', text: 'Sovellus toimii osoitteessa {siteUrl}' },
        ] },
      ],
    },
    {
      id: 'built-on',
      heading: 'Minkä varaan Trippy on rakennettu',
      blocks: [
        { type: 'p', text: 'Trippy on pieni, koska muut ovat tehneet vaikeat osat ja jakaneet ne. Se nojaa näihin avoimiin aineistoihin ja palveluihin.' },
        { type: 'defs', rows: [
          { term: 'OpenStreetMap', text: 'Katukartat, paikkahaku (Photonin kautta) ja kävelyreitit (OSRM:n kautta). Karttatiedot © [OpenStreetMapin](https://www.openstreetmap.org/copyright) tekijät.' },
          { term: 'Natural Earth', text: 'Atlas-näkymän maailmankartan ääriviivat. [Natural Earth](https://www.naturalearthdata.com/) on tekijänoikeudetonta aineistoa (public domain).' },
          { term: 'Wikimedia Commons, Wikipedia ja Wikidata', text: 'Suurin osa paikkojen kuvista ja kansikuvista, jokainen tekijän ja lisenssin kera. Alkuperäiset löytyvät [Wikimedia Commonsista](https://commons.wikimedia.org/).' },
          { term: 'Openverse ja Pexels', text: 'Lisää kuvia: avoimesti lisensoituja [Openversen](https://openverse.org/) kautta ja joitakin matkojen kansikuvia [Pexelsistä](https://www.pexels.com/).' },
          { term: 'Paikkojen verkkosivut ja muu verkko', text: 'Kun avoimista lähteistä ei löydy mitään, kuva voi tulla paikan omilta verkkosivuilta, sen Google Maps -sivulta tai sivulta, jolla paikka mainitaan nimeltä. Nämä kuvat pysyvät siellä, missä ne ovat, kuuluvat omistajilleen ja näytetään lähdelinkin kanssa.' },
          { term: 'Google Gemini ja Mistral', text: 'Tekoälymallit, jotka kirjoittavat suunnitelmat, ehdottavat vaihtoehtoja, vastaavat chat-paneelissa ja tarkistavat, että kansikuvassa on oikea paikka.' },
          { term: 'Supabase', text: 'Kirjautuminen, tietokanta, jossa matkasi säilytetään, tiedostojen tallennus ja palvelinfunktiot, jotka asioivat tekoälypalvelujen kanssa.' },
          { term: 'Leaflet', text: 'Kirjasto, joka piirtää kartat.' },
          { term: 'GitHub Pages', text: 'Paikka, josta itse sovellus tarjoillaan.' },
        ] },
      ],
    },
    {
      id: 'questions',
      heading: 'Usein kysyttyä',
      blocks: [
        { type: 'faq', items: [
          { q: 'Onko se oikeasti ilmainen?', a: 'On. Maksullista tasoa ei ole, ei päättyvää kokeilujaksoa eikä mainoksia.' },
          { q: 'Tarvitsenko tilin?', a: 'Matkan suunnitteluun tarvitset, ja kirjautua voi vain Google-tilillä. Jos joku on jakanut sinulle matkan linkillä, voit lukea sen ilman tiliä.' },
          { q: 'Varaako Trippy lentoja tai hotelleja?', a: 'Ei. Se ehdottaa niitä ja linkittää lentoyhtiön tai varaussivuston sivuille, ja varaat siellä itse. Kun olet varannut, voit lisätä matkalle lennon numeron, kellonajat ja varausnumeron, jolloin kaikki on yhdessä paikassa.' },
          { q: 'Kauanko suunnitelman tekeminen kestää?', a: 'Noin viisi minuuttia, kun matka kestää kymmenestä päivästä kahteen viikkoon, ja lyhyellä matkalla vähemmän. Sinun ei tarvitse odottaa sivulla. Sulje ikkuna ja palaa myöhemmin, tai pyydä ilmoitus, kun suunnitelma on valmis.' },
          { q: 'Kuinka paljon suunnitelmaan voi luottaa?', a: [
            'Luota sen runkoon: mitkä alueet sopivat samalle päivälle, kuinka paljon päivään mahtuu ja mitä kannattaa varata ajoissa. Tarkista yksityiskohdat, joiden virheet maksavat rahaa tai aikaa: aukiolopäivät, lippujen hinnat, onko ravintola yhä olemassa ja kauanko siirtymä kestää.',
            'Maahantulovaatimusten kanssa kannattaa olla kaikkein huolellisin. Trippy luettelee sen, minkä se uskoo koskevan passejanne, ja linkittää virallisille sivuille. Päätöksen tekevät kunkin maan maahantuloviranomaiset, joten lue heidän sivunsa itse.',
          ] },
          { q: 'Miksi säästä sanotaan ”tyypillinen”?', a: 'Suunnitelma saatetaan kirjoittaa kuukausia ennen matkaa, jolloin kukaan ei vielä voi tietää säätä. Näytettävä sää on sille paikalle ja kuukaudelle tavallinen, ja se on kirjoitettu suunnitelmaa tehtäessä. Se ei ole ennuste, ja se pysyy samana, millainen oikea sää sitten onkin.' },
          { q: 'Toimiiko se ilman verkkoyhteyttä?', a: 'Lukeminen toimii. Viimeksi avaamasi matkat säilytetään laitteellasi ja ne aukeavat ilman verkkoa, ja voit asentaa Trippyn aloitusnäytölle sovelluksen tapaan. Uuden suunnitelman tekeminen, muokkaaminen ja chat-paneeli tarvitsevat yhteyden.' },
          { q: 'Voimmeko suunnitella kahdestaan?', a: 'Voitte. Kutsu toinen sähköpostiosoitteella katselijaksi tai muokkaajaksi, niin kun toinen teistä muuttaa matkaa, toinen näkee muutoksen. Voit myös tehdä pelkkään lukemiseen tarkoitetun linkin niille, joiden tarvitsee vain katsoa, ja kytkeä sen myöhemmin pois.' },
          { q: 'Suunnittelin matkani jo muualla. Voinko tuoda sen tänne?', a: 'Voit. **Import trip** antaa kehotteen, jonka liität mihin tahansa tekoälyavustajaan omien muistiinpanojesi kanssa, ja liität tuloksen takaisin Trippyyn. Näet esikatselun ennen kuin mitään tallennetaan, ja tuonnin voi kumota.' },
          { q: 'Millä kielillä Trippy on?', a: 'Alatunniste ja nämä sivut (Tietoja, Tietosuojakäytäntö ja Käyttöehdot) ovat englanniksi, malaijiksi, yksinkertaistetulla kiinalla ja suomeksi. Muu sovellus ja itse suunnitelmat ovat toistaiseksi englanniksi.' },
          { q: 'Miten poistan matkani tai tilini?', a: '[Asetusten](#/settings) **Delete all my trips** poistaa pysyvästi jokaisen matkan, jonka omistat. Jos haluat, että myös tilisi ja profiilisi poistetaan, kirjoita tietosuojavastaavalle: {dpoEmail}. [Tietosuojakäytäntö](#/privacy) kertoo, mitä sen jälkeen tapahtuu.' },
        ] },
      ],
    },
  ],
};

/** Sitoo esimerkkisuunnitelman ja vaiheet (js/site/about/mount.js), samoilla suomenkielisillä sanoilla. */
export const mount = (root) => mountAbout(root, { places: PLACES, sketchWords: SKETCH });
