// Tietosuojakäytäntö, suomeksi. Käännös tiedostosta privacy.en.js: samat osiot samoilla tunnisteilla,
// lohko lohkolta. Englanninkielinen teksti on ensisijainen, jos käännös poikkeaa siitä, ja se sanotaan
// myös itse tekstissä (osio changes). Kun englanninkielinen teksti muuttuu, muuta tämä samalla.
// Ylläpitäjän nimi ja yhteysosoitteet tulevat tiedostosta js/data/site-info.js, eivät täältä.
// Sovelluksen omat painikkeet ja otsikot ovat toistaiseksi englanniksi, joten ne mainitaan tässä
// siinä muodossa kuin ne näkyvät ruudulla (Sign in with Google, Settings, Stop sharing).

const PDPC = 'https://www.pdpc.gov.sg/';

/**
 * Määritelmärivit tiiviistä riveistä: ensimmäinen solu on termi, toinen sen ensimmäinen rivi ja
 * jokainen seuraava solu rivi, joka alkaa otsakkeellaan.
 * @param {string[]} labels kolmannen ja sitä seuraavien solujen otsakkeet
 * @param {string[][]} rows
 * @returns {import('../content.js').SiteBlock}
 */
const facts = (labels, rows) => ({
  type: 'defs',
  rows: rows.map(([term, first, ...more]) => ({ term, text: [sentence(first), ...more.map((cell, index) => `**${labels[index]}** ${sentence(cell)}`)] })),
});
/** Solu kokonaisena virkkeenä: se päättyy pisteeseen. */
const sentence = (text) => (/[.?!]$/.test(text) ? text : `${text}.`);

/** @type {import('../content.js').SitePage} */
export default {
  title: 'Tietosuojakäytäntö',
  intro: [
    'Tämä käytäntö kertoo, mitä henkilötietoja Trippy kerää, miksi, missä niitä säilytetään, kuka muu niitä saa ja mitä voit itse niille tehdä. Se on kirjoitettu Singaporen henkilötietojen suojaa koskevan lain (Personal Data Protection Act 2012) velvoitteiden mukaan. Kutsumme lakia jäljempänä lyhenteellä PDPA.',
    'Trippy on maksuton matkasuunnittelija. Kirjaudut Google-tilillä ja kuvailet matkan, ja tekoälymalli kirjoittaa päivä päivältä etenevän suunnitelman, jota voit muokata ja jakaa. Tässä käytännössä ”me” tarkoittaa seuraavassa osiossa nimettyä Trippyn ylläpitäjää ja ”sinä” palvelun käyttäjää.',
  ],
  sections: [
    {
      id: 'at-a-glance',
      heading: 'Lyhyesti',
      blocks: [
        {
          type: 'cards',
          items: [
            { title: 'Kirjaudut Google-tilillä', text: 'Google antaa meille sähköpostiosoitteesi, nimesi ja profiilikuvasi. Trippyllä ei ole omia salasanoja, joten se ei koskaan näe eikä tallenna salasanaasi.' },
            { title: 'Tekoälymalli kirjoittaa suunnitelmasi', text: 'Matkapyyntöön kirjoittamasi tiedot, vapaa teksti mukaan lukien, lähetetään Google Geminille tai Mistralille, jos Gemini ei toimi. Nimeäsi, sähköpostiosoitettasi ja passisi maata ei lähetetä.' },
            { title: 'Ei mainontaa eikä seurantaa', text: 'Trippy ei aseta evästeitä, eikä siinä ole analytiikkaa, mainontaa tai seurantapikseleitä. Emme myy henkilötietoja.' },
            { title: 'Tietosi voivat siirtyä Singaporen ulkopuolelle', text: 'Tietokantaa, kirjautumispalvelua ja tekoälymalleja ylläpitävät palveluntarjoajat, joiden palvelimet voivat olla muissa maissa. Siirtoja käsittelevä osio kertoo, mitä se tarkoittaa.' },
            { title: 'Sinä päätät, kuka matkan näkee', text: 'Kukaan toinen käyttäjä ei näe matkaa, ennen kuin kutsut jonkun sähköpostiosoitteella tai luot jakolinkin. Voit perua kummankin milloin tahansa. Pääkäyttäjämme voi lukea matkoja vikojen korjaamiseksi.' },
            { title: 'Voit lähteä', text: 'Voit poistaa sovelluksessa yksittäisen matkan tai kaikki matkasi. Jos haluat, että itse tili poistetaan, tai haluat nähdä tai korjata tietosi tai lopettaa niiden käytön, kirjoita tietosuojavastaavallemme.' },
          ],
        },
        { type: 'p', text: 'Yllä olevat kortit ovat tiivistelmä. Varsinainen käytäntö on alla olevissa osioissa.' },
      ],
    },
    {
      id: 'who-we-are',
      heading: 'Kuka vastaa tiedoistasi',
      blocks: [
        { type: 'p', text: 'Trippyn ylläpidon kotimaa on {country}. Ylläpitäjä päättää, miksi ja miten henkilötietojasi käytetään, ja vastaa siitä PDPA:n nojalla.' },
        {
          type: 'defs',
          rows: [
            { term: 'Ylläpitäjä', text: '{operator}' },
            { term: 'Yleinen yhteysosoite', text: '{contactEmail}' },
            { term: 'Missä Trippy on', text: '{siteUrl}' },
          ],
        },
      ],
    },
    {
      id: 'data-protection-contact',
      heading: 'Tietosuojavastaavamme',
      blocks: [
        { type: 'p', text: 'Yksi henkilö vastaa siitä, että Trippy noudattaa PDPA:ta. Henkilötietojasi koskevat kysymykset, pyynnöt ja valitukset osoitetaan hänelle.' },
        { type: 'defs', rows: [{ term: 'Tietosuojavastaava', text: '{dpoEmail}' }] },
        { type: 'p', text: 'Voit myös kysyä häneltä, miten käsittelemme henkilötietoja yleensä ja miten valitukset käsitellään, ja me kerromme sen sinulle.' },
        { type: 'p', text: 'Kirjoita mieluiten siitä sähköpostiosoitteesta, jolla kirjaudut. Silloin voimme varmistaa, että pyyntö on sinun, kysymättä sinusta lisätietoja.' },
      ],
    },
    {
      id: 'what-we-collect',
      heading: 'Mitä keräämme ja miksi',
      blocks: [
        { type: 'p', text: 'Henkilötiedot päätyvät Trippyyn kolmella tavalla: Google lähettää niitä, kun kirjaudut, sinä kirjoitat niitä itse, tai selaimesi ja palvelimemme kirjaavat niitä sovelluksen toimiessa. Alla on jokainen tietoryhmä ja sen kohdalla, mistä tiedot tulevat, mihin käytämme niitä ja missä niitä säilytetään.' },
        facts(['Lähde:', 'Käyttötarkoitus:', 'Säilytys:'], [
            ['Tilin tunnistetiedot', 'Sähköpostiosoitteesi, koko nimesi, profiilikuvasi osoite, tilin tunniste ja kirjautumistunnisteet', 'Google, kun painat painiketta Sign in with Google', 'Sisäänkirjautuminen, nimesi ja kuvasi näyttäminen sovelluksessa, sen näyttäminen, millä tilillä olet kirjautuneena, ja matkakutsun yhdistäminen sähköpostiosoitteeseesi', 'Kirjautumispalvelussamme Supabasessa. Kirjautumisistunto säilytetään myös selaimessasi, jotta pysyt kirjautuneena.'],
            ['Profiili', 'Näyttönimi, kotikaupunki ja kotimaa, tieto siitä, matkustatko päätoimisesti, kotivaluutta, passin maa ja tieto siitä, onko tili tavallinen vai pääkäyttäjän tili', 'Sinä itse, profiilin täyttövaiheessa ja asetuksissa (Settings). Näyttönimesi on aluksi Google-tilisi nimi. Tilin tyypin asetamme me.', 'Tervehtiminen nimellä, suunnittelu lähtöpaikastasi käsin, lukujen ja päivämäärien esitystapa, hintojen näyttäminen omassa valuutassasi sekä passisi mukaiset maahantulo- ja viisumiohjeet', 'Tietokannassamme Supabasessa. Tiivistelmä säilytetään selaimessasi, jotta sovellus aukeaa nopeasti.'],
            ['Näyttöasetukset', 'Näkymä, teema, liike, kieli, kellon ja lämpötilan yksiköt sekä matkasivun valinnat', 'Sovelluksessa tekemäsi valinnat', 'Sen muistaminen, miltä haluat sovelluksen näyttävän ja miten haluat sen toimivan', 'Selaimessasi. Jos asetusten synkronointi on päällä, myös profiilissasi tietokannassamme, jotta muut laitteesi näyttävät samalta.'],
            ['Matkapyyntö', 'Kohteet, päivämäärät tai vuodenaika, vapaa- ja työpäivät, matkustajien määrä, päiväbudjetti, majoitus- ja lentotoiveet, kulkutavat, kiinnostuksen kohteet ja matkustustyyli, lähtökaupunki, profiilistasi kopioitu kotikaupunki ja kotimaa sekä maat, joiden passeilla seurueesi matkustaa', 'Sinä itse, matkan suunnittelutyökalussa', 'Suunnitelman ja maahantulovaatimusten kortin kirjoittaminen', 'Selaimessasi suunnittelun ajan ja sen jälkeen tietokannassamme matkan ja jokaisen suunnitelman kirjoitusajon yhteydessä'],
            ['Varaukset, jotka päätät lisätä', 'Hotellin osoite ja sisäänkirjautumispäivä, lentojen numerot, reitit ja ajat sekä tuodussa suunnitelmassa sen mahdollisesti sisältämät varausnumerot ja varauksen hallintalinkit', 'Sinä itse, suunnittelutyökalussa tai liittämällä tuotavan suunnitelman', 'Suunnitelman rakentaminen jo tekemiesi varausten ympärille ja niiden näyttäminen matkan sivulla', 'Tietokannassamme matkan yhteydessä'],
            ['Vapaa teksti', 'Huomiot, pakolliset kohteet, vältettävät asiat, liitetyt taustatiedot ja ruokavaliot', 'Sinä itse, jos päätät kirjoittaa jotain', 'Suunnitelman muokkaaminen sopivaksi, esimerkiksi ruokavalioon sopivien ravintoloiden valinta', 'Tietokannassamme matkapyynnön yhteydessä'],
            ['Suunnitelma', 'Päivät, aktiviteetit, paikat, osoitteet, kellonajat, kulut, lennot, majoitukset, varausten muistilista ja kuvien tekijätiedot', 'Tekoälymalli, omat muokkauksesi, kutsumiesi ihmisten muokkaukset tai tuomasi suunnitelma', 'Matkasivut, etusivu, yhteenvetokortit ja PDF-vienti', 'Tietokannassamme. Viimeisimpien matkojesi kopiot säilytetään selaimessasi verkotonta käyttöä varten.'],
            ['Yhteiskäyttäjät', 'Jokaisen kutsumasi henkilön sähköpostiosoite, tieto siitä, saako hän katsoa vai muokata, ja hänen tilinsä tunniste sen jälkeen, kun hän on avannut matkan', 'Sinä itse, toisesta henkilöstä', 'Pääsyn antaminen tälle henkilölle yhteen matkaan, kun hän kirjautuu kyseisellä osoitteella', 'Tietokannassamme matkan yhteydessä'],
            ['Jakolinkit', 'Satunnainen koodi jokaiselle jakamallesi matkalle sekä tieto siitä, kuka linkin loi ja milloin', 'Syntyy, kun painat painiketta Share', 'Kuka tahansa, jolla on linkki, voi lukea matkasta karsitun kopion kirjautumatta', 'Tietokannassamme'],
            ['Chat-muokkaukset', 'Matkaohjelman muokkaajalle kirjoittamasi viesti, enintään 500 merkkiä, ja ne matkan päivät, joita viesti koskee', 'Sinä itse, matkan sivulla', 'Aktiviteettien muuttaminen keskustelemalla', 'Trippy ei säilytä näitä. Viesti välitetään tekoälymallille, ja vastaus palaa sivullesi. Mallin tarjoaja käsittelee viestin omien ehtojensa mukaan.'],
            ['Rastit', 'Kohdat, jotka merkitset tehdyiksi matkan valmisteluissa, varausten muistilistassa ja maahantulovaatimuksissa, sekä Discover-välilehden paikkakuntaryhmät', 'Napautuksesi matkan sivulla', 'Sen muistaminen, mitä olet jo tehnyt', 'Vain selaimessasi. Niitä ei koskaan lähetetä palvelimillemme.'],
            ['Käyttömäärät', 'Kuinka monta chat-pyyntöä ja vaihtoehtopyyntöä tililtäsi on tehty kunakin päivänä, sekä merkintä jokaisesta suunnitelman kirjoitusajosta, sen tilasta ja mahdollisesta virheestä', 'Palvelimemme, kun käytät näitä toimintoja', 'Päivärajat, joiden ansiosta palvelu pysyy maksuttomana, ja keskeytyneen suunnitelman jatkaminen', 'Tietokannassamme'],
            ['Vianmäärityslokit', 'Virhe- ja varoitusviestit, tiedosto ja rivi, jolla vika tapahtui, tilisi tunniste, matkan tunniste, selaimesi tyyppi ja kellonaika. Epäonnistunutta hakua koskevassa varoituksessa voi olla paikan nimi tai hakusanat. Joihinkin merkintöihin kirjataan, että varauslinkki avattiin, sekä matka ja varaussivusto.', 'Selaimesi ja palvelimemme, automaattisesti', 'Vikojen etsiminen ja korjaaminen', 'Tietokannassamme, ja niitä voi lukea vain tili, jolla on pääkäyttäjän rooli'],
            ['Ilmoituslupa', 'Tieto siitä, annoitko Trippylle luvan ilmoittaa, kun suunnitelma on valmis', 'Vastauksesi selaimen kysymykseen', 'Ilmoituksen näyttäminen kyseisellä laitteella, kun Trippy on auki välilehdessä tai taustalla', 'Vain selaimessasi. Trippy ei lähetä push-viestejä eikä tallenna lupaa palvelimilleen.'],
        ]),
        { type: 'subheading', text: 'Mitä emme kerää' },
        {
          type: 'list',
          items: [
            'Passin numeroita, henkilötunnuksia tai henkilökortin numeroita, syntymäaikoja tai maksukorttitietoja. Trippy ei koskaan kysy niitä. Passin maa on valtio, ei asiakirjan numero.',
            'Kuvia sinulta. Kuvia ei voi ladata palveluun. Palvelimemme hakevat matkojen kuvat suunnitelmassa olevien paikkojen nimien perusteella.',
            'Tarkkaa sijaintiasi. Trippy ei kysy laitteeltasi, missä olet.',
            'Maksuja. Trippy on maksuton, eikä sen kautta osteta tai varata mitään.',
          ],
        },
        { type: 'subheading', text: 'Arkaluonteiset tiedot vapaassa tekstissä' },
        { type: 'p', text: 'Ruokavaliokenttään ja huomiokenttiin voi kirjoittaa mitä tahansa. Ruokavalio voi paljastaa jotain terveydestäsi tai uskonnostasi. Kaikki, mitä kirjoitat niihin, tallennetaan matkan yhteyteen ja lähetetään tekoälymallille sellaisenaan. Kirjoita siis vain se, mitä suunnitelma tarvitsee, ja jätä pois nimet, asiakirjojen numerot ja terveystiedot.' },
        { type: 'subheading', text: 'Tekniset tiedot, jotka muut palvelut näkevät' },
        { type: 'p', text: 'Kun selaimesi lataa Trippyn, se hakee myös fontteja, karttalaattoja, lippuja, logoja ja kuvia muilta palvelimilta. Jokainen näistä palvelimista näkee IP-osoitteesi ja selaimesi tyypin, kuten mikä tahansa verkkosivusto. Ne on lueteltu kohdassa [Kuka saa tietojasi](#/privacy/service-providers).' },
      ],
    },
    {
      id: 'other-people',
      heading: 'Muiden ihmisten tiedot, jotka annat meille',
      blocks: [
        { type: 'p', text: 'Kaksi toimintoa koskee muitakin ihmisiä kuin sinua.' },
        {
          type: 'defs',
          rows: [
            { term: 'Matkaseura', text: ['Matkapyynnössä on matkustajien määrä ja seurueen passien maat luettelona. Trippy ei kysy matkaseurasi nimiä eikä mitään muutakaan heistä.', 'Ennen kuin annat matkakumppanisi kansalaisuuden, varmista, että hänelle sopii, että annat sen maahantulovaatimusten tarkistamista varten.'] },
            { term: 'Yhteiskäyttäjät', text: ['Kun kutsut jonkun matkalle, kirjoitat hänen sähköpostiosoitteensa. Trippy tallentaa sen matkan yhteyteen ja näyttää sen sinulle ja kutsutulle. Trippy ei lähetä hänelle sähköpostia. Hän pääsee matkaan, kun hän kirjautuu Trippyyn Google-tilillä, jolla on tuo osoite.', 'Kutsu vain ihmisiä, jotka ovat suostuneet kutsuun, ja kerro heille, että Trippy säilyttää heidän sähköpostiosoitettaan tätä tarkoitusta varten. Voit poistaa yhteiskäyttäjän matkan sivulla, jolloin kyseiselle matkalle tallennettu osoite poistetaan.'] },
          ],
        },
        { type: 'p', text: 'Jos olet itse tällainen henkilö ja haluat tietosi pois, kirjoita tietosuojavastaavallemme: {dpoEmail}.' },
      ],
    },
    {
      id: 'consent',
      heading: 'Suostumus',
      blocks: [
        { type: 'p', text: 'Keräämme, käytämme ja luovutamme henkilötietojasi vain suostumuksellasi tai silloin, kun PDPA tai muu laki sallii sen tai vaatii sitä ilman suostumusta.' },
        { type: 'subheading', text: 'Miten annat suostumuksen' },
        {
          type: 'list',
          items: [
            '**Kun luot tilin.** Painamalla painiketta Sign in with Google annat suostumuksesi siihen, että keräämme tilisi tunnistetiedot sekä käyttömäärät ja vianmäärityslokit, joita sovellus kirjaa käyttösi aikana, edellä lueteltuihin tarkoituksiin.',
            '**Kun käytät jotain toimintoa.** Tässä käytännössä kerrotaan, mihin kutakin vastausta käytetään. Kun täytät profiilisi, lähetät matkapyynnön, kutsut yhteiskäyttäjän tai luot jakolinkin, annat suostumuksesi siihen, että tietoja käytetään kyseistä toimintoa varten ja että ne lähetetään palveluntarjoajille, joita toiminto tarvitsee.',
            '**Kun selaimesi kysyy.** Ilmoitukset ovat pois päältä, kunnes sallit ne selaimen kysyessä.',
          ],
        },
        { type: 'subheading', text: 'Oletettu suostumus' },
        { type: 'p', text: 'PDPA:n mukaan sinun katsotaan joissakin tilanteissa antaneen suostumuksesi ilman erillistä pyyntöä (deemed consent). Trippyä näistä koskee kaksi.' },
        {
          type: 'list',
          items: [
            '**Toimintasi perusteella.** Kun annat tietoja oma-aloitteisesti tarkoitukseen, joka käy asiayhteydestä selvästi ilmi, esimerkiksi kirjoitat ruokavaliosi, jotta suunnitelma sopii sinulle, sinun katsotaan suostuvan tietojen käyttöön tuohon tarkoitukseen.',
            '**Sopimuksen täyttämiseksi.** Kun pyydät Trippyä tekemään jotain, mihin se pystyy vain välittämällä tietosi palveluntarjoajalle, esimerkiksi tallentamaan matkan Supabaseen tai lähettämään matkapyynnön tekoälymallin kirjoitettavaksi, sinun katsotaan suostuvan tähän luovutukseen ja siihen, että palveluntarjoaja käyttää tietoja tehtävän hoitamiseen.',
          ],
        },
        { type: 'p', text: 'Emme nojaa ilmoitukseen perustuvaan oletettuun suostumukseen. Jos joskus haluamme käyttää tietojasi uuteen tarkoitukseen, kysymme sinulta ensin.' },
        { type: 'subheading', text: 'Mikä on pakollista ja mikä vapaaehtoista' },
        {
          type: 'defs',
          rows: [
            { term: 'Pakollista', text: 'Google-tili, josta saamme sähköpostiosoitteesi, nimesi ja kuvasi. Suunnitelmaa varten matkapyynnössä on oltava vähintään se, minne olet menossa, milloin tai kuinka pitkäksi aikaa ja kuinka monta matkustajaa on.' },
            { term: 'Vapaaehtoista', text: 'Passin maa ja matkaseuran passit, ruokavaliot, huomiot, pakolliset kohteet, vältettävät asiat, liitetyt taustatiedot, varattu hotelli, varatut lennot, lento- ja majoitustoiveet, yhteiskäyttäjät, jakolinkit ja ilmoitukset. Jos jätät nämä pois, suunnitelma on vähemmän räätälöity tai jokin toiminto jää käyttämättä. Trippyn käyttöä se ei estä.' },
          ],
        },
        { type: 'p', text: 'Emme pyydä enempää kuin toiminto tarvitsee, emmekä aseta suostumusta mihinkään muuhun Trippyn käytön ehdoksi.' },
        { type: 'subheading', text: 'Markkinointiviestit' },
        { type: 'p', text: 'Trippy ei lähetä markkinointia sähköpostilla tai tekstiviestillä eikä soita markkinointipuheluita. Sovellus ei lähetä minkäänlaista sähköpostia. Kirjoitamme sinulle vain vastataksemme pyyntöösi tai kertoaksemme asiasta, josta meidän on ilmoitettava, kuten tietoturvaloukkauksesta tai tilisi sulkemisesta.' },
      ],
    },
    {
      id: 'withdrawal',
      heading: 'Suostumuksen peruuttaminen',
      blocks: [
        { type: 'p', text: 'Voit peruuttaa suostumuksesi henkilötietojesi keräämiseen, käyttöön tai luovuttamiseen milloin tahansa, yhden tarkoituksen osalta tai kaikkien. Peruuttaminen on maksutonta.' },
        { type: 'subheading', text: 'Miten peruutat' },
        {
          type: 'defs',
          rows: [
            { term: 'Sovelluksessa', text: ['Poista yhteiskäyttäjä tai paina Stop sharing matkan sivulla.', 'Poista matka etusivulta tai matkan sivulta. Poista kaikki matkasi asetuksissa (Settings) kohdassa Data.', 'Aseta passin maaksi Not set tai vaihda nimesi ja kotikaupunkisi asetuksissa kohdassa You.', 'Tyhjennä laitteellasi säilytettävät kopiot asetuksissa kohdassa Data tai kirjaudu ulos.', 'Kytke tämän sivuston ilmoitukset pois selaimesi asetuksista.'] },
            { term: 'Kirjoittamalla meille', text: 'Kaikessa, mihin sovellus ei pysty, myös tilisi poistamisessa, kirjoita tietosuojavastaavallemme: {dpoEmail}. Kerro, minkä tietojesi käytön haluat lopettaa.' },
          ],
        },
        { type: 'subheading', text: 'Kauanko se kestää' },
        { type: 'p', text: 'Sovelluksen omat toiminnot vaikuttavat heti. Kirjallisesta pyynnöstä tarvitsemme ilmoituksen kohtuullisen ajan etukäteen, jotta ehdimme toimia sen mukaan. Toteutamme pyynnön yleensä 10 arkipäivän kuluessa sen saapumisesta, ja jos tarvitsemme enemmän aikaa, kerromme miksi ja mihin mennessä.' },
        { type: 'subheading', text: 'Mitä peruuttamisesta seuraa' },
        { type: 'p', text: 'Kun saamme pyyntösi, kerromme, mitä peruuttaminen käytännössä tarkoittaa, jotta voit päättää asiasta tosiasioiden pohjalta. Lyhyesti jokaisesta asiasta, johon annetun suostumuksen voit peruuttaa:' },
        facts([], [
            ['Tilisi tunnistetietojen säilyttäminen', 'Et voi enää kirjautua. Poistamme tilin, profiilisi ja omistamasi matkat.'],
            ['Matkapyyntöjen lähettäminen tekoälymalleille', 'Trippy ei voi kirjoittaa sinulle uusia suunnitelmia, ehdottaa vaihtoehtoja eikä muokata matkaa chatissa. Voit yhä lukea nykyisiä matkojasi ja tuoda muualla kirjoitettuja suunnitelmia.'],
            ['Passisi maan säilyttäminen', 'Maahantulovaatimusten kortti ei voi enää kertoa, mitä passisi vaatii.'],
            ['Kotikaupunkisi ja valuuttasi säilyttäminen', 'Suunnitelmat eivät enää ala kotikaupungistasi, eikä hintoja näytetä omassa valuutassasi.'],
            ['Matkan jakaminen', 'Linkki lakkaa toimimasta kaikilta, joilla se on, tai yhteiskäyttäjä menettää pääsynsä.'],
            ['Tiliäsi koskevat vianmäärityslokit', 'Poistamme yhteyden olemassa olevien lokimerkintöjen ja tilisi väliltä. Sovellus kirjoittaa lokia aina, kun olet kirjautuneena, joten uusien merkintöjen lopettaminen tarkoittaa tilin sulkemista.'],
        ]),
        { type: 'p', text: 'Kun olet peruuttanut suostumuksesi, lopetamme käytön, jota vastustit, ja pyydämme myös palveluntarjoajia, jotka käsittelevät tietoja puolestamme, lopettamaan sen. Emme voi vetää takaisin matkapyyntöä, jonka tekoälymalli on jo vastaanottanut.' },
        { type: 'subheading', text: 'Mihin peruuttaminen ei vaikuta' },
        { type: 'p', text: 'Suostumuksen peruuttaminen ei kumoa sitä, mitä tiedoillasi tehtiin ennen peruutusta. Se ei myöskään estä meitä säilyttämästä tai käyttämästä henkilötietoja silloin, kun PDPA tai muu kirjoitettu laki vaatii sitä tai sallii sen ilman suostumusta, esimerkiksi ehtojemme rikkomisen tutkimiseksi, viranomaisen lainmukaiseen pyyntöön vastaamiseksi tai oikeusvaateen käsittelemiseksi.' },
      ],
    },
    {
      id: 'access-and-correction',
      heading: 'Tietojesi näkeminen ja korjaaminen',
      blocks: [
        { type: 'subheading', text: 'Sovelluksessa' },
        { type: 'p', text: 'Suurin osa siitä, mitä Trippy sinusta säilyttää, näkyy ruudulla. Profiilisi on asetuksissa (Settings) kohdissa You ja Money and units, ja voit muuttaa sitä siellä. Tili, jolla olet kirjautuneena, näkyy kohdassa Account. Jokainen matka suunnitelmineen, yhteiskäyttäjineen ja jakolinkkeineen on omalla sivullaan, jolla voit muokata sitä. Laitteellesi tallennetut matkat on lueteltu asetuksissa kohdassa Data. Sovellus ei näytä matkapyyntöä siinä muodossa kuin se tallennettiin, käyttömääriä eikä vianmäärityslokeja. Pyydä ne meiltä.' },
        { type: 'p', text: 'Nimesi ja kuvasi tulevat Google-tililtäsi. Jos haluat vaihtaa kuvan, vaihda se Googlessa. Nimen, jonka Trippy näyttää, voit vaihtaa asetuksissa.' },
        { type: 'subheading', text: 'Pyynnöstä' },
        { type: 'p', text: 'Sinulla on oikeus pyytää meiltä henkilötiedot, joita säilytämme sinusta, ja tieto siitä, miten olemme käyttäneet tai luovuttaneet niitä pyyntöäsi edeltäneen vuoden aikana. Sinulla on myös oikeus pyytää meitä korjaamaan virhe tai puute. Kirjoita tietosuojavastaavallemme: {dpoEmail}.' },
        {
          type: 'defs',
          rows: [
            { term: 'Kuinka nopeasti vastaamme', text: 'Niin pian kuin se on kohtuudella mahdollista. Jos emme pysty antamaan tietoja tai tekemään korjausta 30 päivän kuluessa pyynnöstäsi, kerromme näiden 30 päivän aikana, milloin pystymme.' },
            { term: 'Mitä se maksaa', text: 'Ei mitään. Emme peri maksua tietojen antamisesta emmekä korjaamisesta.' },
            { term: 'Henkilöllisyytesi varmistaminen', text: 'Voimme pyytää sinua kirjoittamaan tilisi sähköpostiosoitteesta tai vahvistamaan pyynnön sen kautta, ennen kuin luovutamme mitään.' },
            { term: 'Kun korjaamme', text: 'Teemme korjauksen niin pian kuin se on käytännössä mahdollista ja lähetämme korjatut tiedot jokaiselle organisaatiolle, jolle luovutimme ne edeltäneen vuoden aikana, paitsi jos kyseinen organisaatio ei enää tarvitse niitä.' },
            { term: 'Milloin voimme kieltäytyä', text: 'PDPA sallii tai vaatii kieltäytymisen joissakin tapauksissa, esimerkiksi jos tietojen antaminen paljastaisi toisen henkilön henkilötietoja tai jos pyyntö on perusteeton tai tehty kiusantekotarkoituksessa. Jos kieltäydymme, kerromme sen sinulle ja säilytämme kopion kyseisistä tiedoista vähintään 30 päivää, jotta voit pyytää päätöksen uudelleenarviointia. Jos emme tee korjausta, merkitsemme tietojen yhteyteen, mitä korjausta pyysit.' },
          ],
        },
        { type: 'p', text: 'PDPA:ssa säädetään myös oikeudesta saada tietonsa siirretyksi toiselle organisaatiolle. Tämän käytännön päivämääränä se osa laista ei ollut vielä tullut voimaan. Sillä välin voit viedä minkä tahansa matkan PDF-tiedostoksi matkan sivulta.' },
      ],
    },
    {
      id: 'accuracy',
      heading: 'Tietojesi pitäminen oikeina',
      blocks: [
        { type: 'p', text: 'Huolehdimme kohtuullisin toimin siitä, että henkilötiedot ovat oikeita ja täydellisiä, kun käytämme niitä sinuun vaikuttavan päätöksen tekemiseen tai välitämme niitä jollekulle muulle. Käytännössä lähes kaikki tiedot tulevat suoraan sinulta tai Google-tililtäsi, ja Trippy käyttää niitä sellaisinaan.' },
        { type: 'p', text: 'Siksi sinun osuutesi on tärkeä. Maahantulovaatimusten kortti pitää paikkansa vain niiden passien osalta, jotka annoit, ja suunnitelma vain niiden päivämäärien ja paikkojen osalta, jotka annoit. Pidä profiilisi ajan tasalla ja korjaa matkapyyntö, jos suunnitelmasi muuttuvat.' },
      ],
    },
    {
      id: 'protection',
      heading: 'Miten suojaamme tietojasi',
      blocks: [
        { type: 'p', text: 'Käytämme kohtuullisia turvajärjestelyjä estääksemme tietojen luvattoman saannin, keräämisen, käytön, luovuttamisen, kopioinnin, muuttamisen, hävittämisen ja katoamisen. Käytössä ovat nämä.' },
        {
          type: 'list',
          items: [
            '**Salatut yhteydet.** Sivusto ja kaikki pyynnöt tietokantaamme, kirjautumispalveluumme ja palvelinfunktioihimme kulkevat HTTPS-yhteydellä.',
            '**Trippyllä ei ole salasanoja.** Kirjautua voi vain Googlen kautta. Google tarkistaa salasanasi ja kertoo meille, kuka olet.',
            '**Pääsysäännöt tietokannassa.** Jokaisessa taulussa on rivitason säännöt: tili voi lukea ja muuttaa vain omaa profiiliaan ja omia matkojaan sekä matkoja, joihin se on kutsuttu, saamansa roolin rajoissa.',
            '**Tarkistukset palvelimella.** Funktiot, jotka kirjoittavat suunnitelmia, vastaavat chat-muokkauksiin ja hakevat kuvia, hyväksyvät pyyntöjä vain kirjautuneelta tililtä, ja suunnitelman kirjoittajalla ja chat-muokkaajalla on päivärajat.',
            '**Karsitut jakolinkit.** Jakolinkki näyttää matkasta suppeamman kopion. Katso [Jakolinkit ja yhteiskäyttäjät](#/privacy/shared-links).',
            '**Avaimet pysyvät poissa laitteeltasi.** Tekoäly- ja kuvapalvelujen avaimet säilytetään palvelimella. Selaimesi ei koskaan saa niitä.',
            '**Rajattu ylläpito.** Niiden ihmisten lisäksi, joille jaat matkan, profiiliasi, matkojasi ja vianmäärityslokeja voi lukea vain tili, jolle ylläpitäjä on antanut pääkäyttäjän roolin. Ylläpitäjä pääsee tietokantaan myös palveluntarjoajan oman hallintakonsolin kautta. Käytämme tätä pääsyä vain vikojen korjaamiseen, pyyntöihisi vastaamiseen ja ehtojemme valvomiseen.',
          ],
        },
        { type: 'subheading', text: 'Rajoitukset, jotka sinun on hyvä tietää' },
        {
          type: 'list',
          items: [
            'Kirjautumisistuntosi ja verkotonta käyttöä varten säilytettävät matkojen kopiot tallennetaan selaimeesi salaamattomina, kuten verkkosovelluksissa on tavallista. Kirjaudu yhteisellä tai lainatulla laitteella ulos, kun lopetat. Uloskirjautuminen poistaa laitteelta istunnon, profiilin tiivistelmän ja verkottomat matkat.',
            'Matkojen kuvat, jotka palvelimemme kopioivat lisensoiduista lähteistä, säilytetään julkisessa tiedostovarastossa. Ne ovat kuvia paikoista, eivät sinusta, eikä varastoa voi selata, mutta kuka tahansa, jolla on kuvan osoite, voi avata sen.',
            'Jakolinkki toimii kenellä tahansa, jolla se on, joten lähetä se vain ihmisille, joille uskot suunnitelman.',
            'Mikään tallennus- tai siirtotapa ei ole täysin turvallinen. Emme voi luvata, ettei tietoturvaloukkausta koskaan tapahdu. Osio [tietoturvaloukkauksista](#/privacy/breach) kertoo, mitä teemme, jos niin käy.',
          ],
        },
      ],
    },
    {
      id: 'retention',
      heading: 'Kuinka kauan säilytämme tietojasi',
      blocks: [
        { type: 'p', text: 'Säilytämme henkilötietoja vain niin kauan kuin tarkoitus, jota varten ne kerättiin, niitä yhä tarvitsee tai oikeudellinen tai toiminnallinen syy sitä vaatii. Sen jälkeen poistamme ne tai poistamme sen, mikä yhdistää ne sinuun. Jokaista alla olevaa tietoryhmää säilytetään, kunnes sen kohdalla mainittu asia tapahtuu.' },
        facts([], [
            ['Tilin tunnistetiedot ja profiili', 'Tilisi poistetaan.'],
            ['Matkat pyyntöineen, suunnitelmineen, yhteiskäyttäjineen ja jakolinkkeineen', 'Poistat matkan, tai tilisi poistetaan. Matkan poistaminen poistaa myös sen suunnitelman kirjoitusajot, yhteiskäyttäjät ja jakolinkin.'],
            ['Jakolinkit', 'Painat Stop sharing, tai matka poistetaan. Linkillä ei ole omaa vanhenemispäivää.'],
            ['Yhteiskäyttäjien sähköpostiosoitteet', 'Poistat yhteiskäyttäjän, tai matka poistetaan.'],
            ['Chat-muokkausten viestit', 'Trippy ei tallenna niitä. Ne katoavat sovelluksesta, kun suljet sivun.'],
            ['Päivittäiset käyttömäärät', 'Noin 7 päivää niin kauan kuin käytät toimintoa: sitä vanhemmat määrät poistetaan, kun tililtäsi käytetään toimintoa seuraavan kerran. Määrät, jotka jäävät jäljelle lopetettuasi, poistamme, kun poistamme tilisi.'],
            ['Vianmäärityslokit', 'Automaattista vanhenemista ei vielä ole. Poistamme merkintöjä käsin, kun niitä ei enää tarvita vikojen etsimiseen. Kun matka tai tili poistetaan, sen merkinnät säilyvät, mutta tilin ja matkan kentät tyhjennetään. Viestin teksti, jossa voi olla matkan tunniste, ja selaimen tyyppi säilyvät, kunnes merkintä poistetaan.'],
            ['Palvelimiemme kopioimat matkojen kuvat', 'Ne voivat säilyä matkan poistamisen jälkeen matkan tunnisteen alle tallennettuina. Ne ovat julkaistuja kuvia kohteista ja paikoista eivätkä kerro sinusta mitään.'],
            ['Istunto, profiilin tiivistelmä ja verkottomat matkat selaimessasi', 'Kirjaudut ulos tai tyhjennät ne asetuksissa (Settings) kohdassa Data.'],
            ['Asetukset, rastit ja paikkakuntaryhmät selaimessasi', 'Tyhjennät sivuston tiedot selaimestasi. Kaikkien matkojesi poistaminen asetuksissa poistaa myös niiden rastit.'],
            ['Keskeneräinen matkapyyntö', 'Suljet selaimen välilehden.'],
        ]),
        { type: 'subheading', text: 'Matkojen poistaminen' },
        { type: 'p', text: 'Yhden matkan voit poistaa etusivulta tai matkan sivulta. Kaikki omistamasi matkat voit poistaa asetuksissa kohdassa Data. Poisto tapahtuu heti, eikä sitä voi kumota. Matkat, jotka muut ovat jakaneet sinulle, ovat heidän ja säilyvät.' },
        { type: 'subheading', text: 'Tilin poistaminen' },
        { type: 'p', text: 'Sovelluksessa ei ole tälle vielä painiketta. Kirjoita tietosuojavastaavallemme tilisi sähköpostiosoitteesta: {dpoEmail}. Poistamme tilin, profiilisi, jokaisen omistamasi matkan ja käyttömääräsi sekä poistamme tilisi tunnisteen vianmäärityslokeista. Teemme tämän käsin ja vahvistamme, kun se on tehty.' },
        { type: 'p', text: 'Jos kirjaudut sen jälkeen uudelleen samalla Google-tilillä, syntyy uusi, tyhjä tili. Jos et halua, että Google tarjoaa Trippyä yhdistettynä sovelluksena, poista se Google-tilisi asetuksista.' },
        { type: 'subheading', text: 'Varmuuskopiot ja oikeudelliset säilytysvelvoitteet' },
        { type: 'p', text: 'Poistetut tiedot voivat säilyä tietokantapalvelumme tarjoajan varmuuskopioissa, kunnes ne vanhenevat. Voimme säilyttää tiettyjä tietoja pidempään, jos laki sitä vaatii tai jos tarvitsemme niitä riitaa tai tutkintaa varten, ja vain niin kauan kuin se kestää.' },
      ],
    },
    {
      id: 'service-providers',
      heading: 'Kuka saa tietojasi',
      blocks: [
        { type: 'p', text: 'Emme myy henkilötietoja, vuokraa niitä emmekä anna niitä mainostajille. Trippy tarvitsee kuitenkin toimiakseen muita palveluja, ja jokainen saa vain sen, mitä sen tehtävä vaatii. Ensimmäisessä luettelossa ovat palvelut, joille palvelimemme lähettävät tietoja. Toisessa ovat palvelimet, joihin oma selaimesi ottaa yhteyttä, kun käytät Trippyä.' },
        facts(['Saa:'], [
            ['Supabase', 'Ylläpitää kirjautumista, tietokantaa, tiedostovarastoa ja palvelinfunktioita', 'Kaiken, mitä tililläsi on: Googlelta saadut tunnistetiedot, profiilin, matkat, yhteiskäyttäjien sähköpostiosoitteet, jakolinkit, käyttömäärät ja lokit'],
            ['Google, kirjautumista varten', 'Vahvistaa, kuka olet, kun painat Sign in with Google', 'Kirjaudut Googlen omalla sivulla. Google saa tietää, että käytät Trippyä, ja lähettää sähköpostiosoitteesi, nimesi ja kuvasi kirjautumispalveluumme.'],
            ['Google Gemini', 'Ensisijainen tekoälymalli. Se kirjoittaa suunnitelmat, vastaa chat-muokkauksiin, ehdottaa vaihtoehtoja ja tarkistaa kuvaehdokkaat.', 'Matkapyynnön: kohteet, päivämäärät, vapaapäivät, matkustajien määrän, budjetin, lähtökaupungin ja kotimaan, majoitustoiveet, varatun hotellin osoitteen ja sisäänkirjautumispäivän, varattujen lentojen numerot, reitit ja ajat, kiinnostuksen kohteet sekä vapaan tekstisi ruokavalioineen. Chat-muokkauksissa viestisi ja matkan aktiviteetit. Kuvissa paikkojen nimet ja kuvaehdokkaat.'],
            ['Mistral AI', 'Varalla oleva tekoälymalli, jota käytetään suunnitelmaan vain, jos Gemini ei toimi', 'Saman matkapyynnön kuin Gemini'],
            ['Serper ja Tavily', 'Kuvahaku Google Mapsin paikkojen ja verkon kuvahaun kautta, kun lisensoiduista lähteistä ei löydy mitään', 'Suunnitelman paikkojen nimet, kaupungin ja karttakoordinaatit. Pyynnössä nimeämäsi hotelli voi olla yksi paikoista.'],
            ['Wikimedia (Wikipedia, Wikimedia Commons, Wikidata), Openverse, Pexels ja Mapillary', 'Lisensoidut kuvat kohteista ja paikoista', 'Kohteiden ja paikkojen nimet ja karttakoordinaatit'],
            ['Overpass, OpenStreetMapin tietojen hakupalvelu', 'Kohteen lähellä olevien paikkojen etsiminen', 'Paikannimet ja karttakoordinaatit'],
            ['Photon by Komoot', 'Paikkahaku ja sen paikkakunnan nimeäminen, jossa kohde sijaitsee', 'Hakemasi paikannimet ja kohteiden karttakoordinaatit'],
            ['OSRM:n julkinen reitityspalvelu', 'Kävelyohjeet, kun muokkaat aktiviteettia', 'Kaksi karttakoordinaattiparia'],
            ['GitHub Pages', 'Ylläpitää Trippyn verkkosivuston tiedostoja', 'Sivupyyntösi. Sinne ei tallenneta tilitietoja.'],
        ]),
        { type: 'subheading', text: 'Mitä tekoälymallit eivät saa' },
        { type: 'p', text: 'Nimesi, sähköpostiosoitteesi, tilisi tunniste, passisi maa ja varausnumerot eivät kuulu siihen, mitä Trippy lähettää Geminille tai Mistralille. Vapaa teksti on poikkeus: se lähetetään täsmälleen niin kuin sen kirjoitit, joten kaikki henkilökohtainen, mitä siihen kirjoitat, lähtee mukana.' },
        { type: 'p', text: 'Google ja Mistral käsittelevät saamansa tiedot omien kehittäjäehtojensa mukaan. Niissä määrätään, kuinka kauan ne säilyttävät tietoja ja saavatko ne käyttää niitä palvelujensa parantamiseen. Me emme voi vaikuttaa näihin ehtoihin muuten kuin valitsemalla palveluntarjoajan. Suhtaudu matkapyyntöön niin, että palveluntarjoaja voi säilyttää sen ja sen henkilökunta voi lukea sen, ja jätä arkaluonteiset tiedot pois.' },
        facts(['Näkee:'], [
            ['Google Fonts', 'Sovelluksen kirjasimet', 'IP-osoitteesi ja selaimesi tyypin'],
            ['OpenStreetMapin karttalaattapalvelimet', 'Matkan sivun kartta', 'IP-osoitteesi, selaimesi tyypin ja kartta-alueet, joita katsot'],
            ['Photon by Komoot, Open-Meteo ja Wikipedia', 'Kaupunkihaku, aikavyöhyke ja otsikkokuva, kun kirjoitat kaupungin suunnittelutyökaluun', 'Kirjoittamasi kaupungin nimen ja IP-osoitteesi. Komoot saa myös matkan kohteiden koordinaatit, kun Discover-välilehti ryhmittelee ne paikkakunnittain.'],
            ['flagcdn.com', 'Lippukuvat', 'IP-osoitteesi ja sen, mitä lippuja näytetään'],
            ['Wikimedian kuvapalvelimet', 'Matkakohteiden kuvat', 'IP-osoitteesi ja sen, mitä kuvia näytetään'],
            ['Aviasalesin kuvapalvelin', 'Lentoyhtiöiden logot lentokorteissa', 'IP-osoitteesi ja lentoyhtiön koodin'],
            ['Google Mapsin tai verkon kautta löydettyjen paikkakuvien palvelimet sekä Googlen kuvapalvelin, jolla profiilikuvasi on', 'Nämä kuvat, jotka ladataan sieltä, missä ne on julkaistu', 'IP-osoitteesi ja sen, mikä kuva ladataan'],
        ]),
        { type: 'p', text: 'Nämä palvelimet voivat asettaa omia evästeitään omilla verkkotunnuksillaan. Trippy ei voi lukea niitä.' },
        { type: 'subheading', text: 'Linkit, joita päätät seurata' },
        { type: 'p', text: 'Matkan sivulla on linkkejä palveluihin Booking.com, Trip.com, Skyscanner, Google Search, Google Maps ja Rome2Rio. Mitään ei lähetetä, ennen kuin painat linkkiä. Linkki vie silloin mukanaan sen, mitä haku tarvitsee, esimerkiksi majoituksen tai kaupungin nimen, päivämääräsi, aikuisten määrän tai karttakoordinaatit. Siihen, mitä teet noilla sivustoilla, sovelletaan niiden tietosuojakäytäntöjä, ei tätä.' },
        { type: 'subheading', text: 'Muut luovutukset' },
        { type: 'p', text: 'Voimme luovuttaa henkilötietoja ilman suostumustasi, kun PDPA tai muu laki vaatii sitä tai sallii sen, esimerkiksi tuomioistuimen määräyksen tai Singaporen viranomaisen lainmukaisen pyynnön perusteella. Jos Trippy joskus siirtyisi uudelle ylläpitäjälle, tietosi siirtyisivät hänelle tämän käytännön mukaisesti, ja kertoisimme siitä etukäteen, jotta voisit poistaa tilisi ensin.' },
      ],
    },
    {
      id: 'transfer',
      heading: 'Siirrot Singaporen ulkopuolelle',
      blocks: [
        { type: 'p', text: 'Trippyllä ei ole omia palvelimia. Edellä luetellut palveluntarjoajat säilyttävät ja käsittelevät tietojasi omissa järjestelmissään, ja osa näistä järjestelmistä on Singaporen ulkopuolella. Maita voivat olla esimerkiksi Yhdysvallat ja Euroopan unionin maat.' },
        { type: 'p', text: 'PDPA sallii henkilötietojen lähettämisen Singaporen ulkopuolelle vain, jos huolehdimme asianmukaisin toimin siitä, että tietoja suojataan siellä PDPA:han verrattavalla tasolla, ellei jokin laissa säädetty poikkeus sovellu. Niiden palveluntarjoajien osalta, joilla tilisi on tai jotka saavat matkapyyntösi, eli Supabasen, Googlen ja Mistralin, nojaamme ehtoihin, joihin nämä palveluntarjoajat ovat sitoutuneet, mukaan lukien niiden tietojenkäsittelyehdot, jos ne sellaisia tarjoavat, sekä siihen, että siirto on välttämätön sen tekemiseksi, mitä pyysit Trippyä tekemään. Emme voi luvata, että jokaisessa palveluntarjoajan käyttämässä maassa on PDPA:n kaltainen laki.' },
        { type: 'p', text: 'Kuva-, paikka- ja reitityspalvelut saavat vain paikkojen nimiä ja karttakoordinaatteja, eikä mukana ole mitään, mistä tilisi voisi tunnistaa.' },
        { type: 'p', text: 'Jos pyydät, kerromme, mitä tiedämme siitä, missä palveluntarjoaja säilyttää tietojasi ja mitkä ehdot sitä sitovat.' },
        { type: 'p', text: 'Fontit, karttalaatat, liput ja kuvat oma selaimesi hakee suoraan niiden palvelimilta, jotka voivat olla missä päin maailmaa tahansa. Nämä palvelimet näkevät IP-osoitteesi ja käsittelevät sitä omien tietosuojakäytäntöjensä mukaan.' },
      ],
    },
    {
      id: 'shared-links',
      heading: 'Jakolinkit ja yhteiskäyttäjät',
      blocks: [
        {
          type: 'defs',
          rows: [
            { term: 'Jakolinkki', text: ['Kuka tahansa, jolla on linkki, voi lukea matkan kirjautumatta. Hän näkee otsikon, päivämäärät, matkustajien määrän, valuutan, jokaisen majoituksen nimen, alueen ja hintaluokan sekä päivät aktiviteetteineen.', 'Hän ei näe lentoja, varausnumeroita, varauksen hallintalinkkejä, majoitusten osoitteita, varausten muistilistaa, matkapyyntöäsi eikä nimeäsi. Linkki toimii, kunnes painat Stop sharing.'] },
            { term: 'Yhteiskäyttäjä', text: ['Sähköpostiosoitteella kutsumasi henkilö näkee kirjautuneena koko matkan. Siihen kuuluvat lennot, majoitukset ja matkalla mahdollisesti olevat varausnumerot sekä itse matkapyyntö huomioineen, ruokavalioineen ja seurueen passeineen. Muokkaaja voi myös muuttaa suunnitelmaa. Kutsuttu näkee kutsun ja oman roolinsa.', 'Voit poistaa yhteiskäyttäjän milloin tahansa matkan sivulla.'] },
            { term: 'Sinulle jaettu matka', text: 'Se kuuluu sille, joka sen jakoi. Hän päättää, kuinka kauan se on olemassa ja kuka muu sen näkee.' },
          ],
        },
      ],
    },
    {
      id: 'on-device',
      heading: 'Evästeet ja tallennus laitteellasi',
      blocks: [
        { type: 'p', text: 'Trippy ei aseta evästeitä. Niiden sijaan se käyttää selaimesi omaa tallennustilaa, joka pysyy laitteellasi ja jota ei lähetetä jokaisen pyynnön mukana evästeen tapaan. Mitään siitä ei käytetä mainontaan eikä sinun seuraamiseesi muilla sivustoilla.' },
        facts(['Poistuu, kun:'], [
            ['Kirjautumisistunto', 'Pitää sinut kirjautuneena käyntien välillä', 'Kirjaudut ulos'],
            ['Asetukset', 'Muistaa näkymän, teeman, liikkeen, kielen ja yksiköt', 'Tyhjennät sivuston tiedot selaimestasi'],
            ['Profiilin tiivistelmä', 'Sovellus voi avautua nimelläsi, kotikaupungillasi, valuutallasi ja passisi maalla ennen kuin palvelin vastaa', 'Kirjaudut ulos'],
            ['Verkottomat matkat: enintään 5 viimeisintä matkaa, matkaluettelo ja yhteenvetokortit', 'Voit lukea suunnitelmaa ilman verkkoyhteyttä', 'Kirjaudut ulos tai tyhjennät ne asetuksissa (Settings) kohdassa Data'],
            ['Rastit ja paikkakuntaryhmät', 'Muistaa, mitä olet rastinut kullakin matkalla', 'Poistat kaikki matkasi asetuksissa tai tyhjennät sivuston tiedot'],
            ['Tuonnin luonnos', 'Säilyttää liittämäsi suunnitelman, kunnes tuonti on valmis', 'Se vanhenee, tai kirjaudut ulos'],
            ['Keskeneräinen matkapyyntö', 'Säilyttää suunnittelutyökalun vastaukset, kun siirryt vaiheesta toiseen', 'Suljet välilehden'],
            ['Sovelluksen tiedostot', 'Service worker säilyttää sovelluksesta kopion, jotta se aukeaa ilman verkkoa', 'Tyhjennät sivuston tiedot tai poistat asennetun sovelluksen'],
        ]),
        { type: 'p', text: 'Koska sovellus tarvitsee tätä tallennustilaa toimiakseen, sille ei ole suostumusikkunaa. Voit tyhjentää sen milloin tahansa selaimesi asetuksista. Sen jälkeen Trippy pyytää sinua kirjautumaan uudelleen.' },
      ],
    },
    {
      id: 'affiliate-links',
      heading: 'Varauslinkit ja palkkiot',
      blocks: [
        { type: 'p', text: 'Majoitus- ja lentokorteissa on rivi, jonka mukaan Trippy voi saada palkkion niiden linkkien kautta tehdyistä varauksista. Tällä hetkellä linkit ovat tavallisia: niissä ei ole kumppanikoodia, eikä Trippy ansaitse niistä mitään.' },
        { type: 'p', text: 'Jos liitymme kumppaniohjelmaan, linkissä olisi koodi, joka kertoo varaussivustolle, että kävijä tuli Trippystä. Siinä ei olisi nimeäsi, sähköpostiosoitettasi eikä tilisi tunnistetta, eikä maksamasi hinta muuttuisi. Päivittäisimme tämän käytännön ennen kuin ottaisimme sen käyttöön.' },
        { type: 'p', text: 'Kun avaat varauslinkin, Trippy kirjaa vianmäärityslokeihinsa, että linkki kyseiselle varaussivustolle avattiin kyseiseltä matkalta.' },
      ],
    },
    {
      id: 'children',
      heading: 'Lapset ja nuoret',
      blocks: [
        { type: 'p', text: 'Trippy on tehty aikuisille, jotka suunnittelevat omia matkojaan. Sitä ei ole suunnattu lapsille, ja se vaatii Google-tilin, jonka Google tarjoaa vasta tietystä vähimmäisiästä alkaen.' },
        { type: 'p', text: 'Jos olet alle 18-vuotias, käytä Trippyä vain sellaisen vanhemman tai huoltajan suostumuksella, joka on lukenut tämän käytännön. Singaporen tietosuojaviranomainen (Personal Data Protection Commission) katsoo, että 13 vuotta täyttänyt nuori voi yleensä antaa suostumuksen itse, jos hän ymmärtää, mihin suostuu, ja että alle 13-vuotiaan lapsen puolesta suostumuksen antaa vanhempi tai huoltaja. Emme tietoisesti kerää henkilötietoja alle 13-vuotiailta lapsilta.' },
        { type: 'p', text: 'Jos uskot, että lapsi on antanut meille henkilötietoja ilman tällaista suostumusta, kirjoita tietosuojavastaavallemme, niin poistamme ne: {dpoEmail}.' },
      ],
    },
    {
      id: 'breach',
      heading: 'Jos tapahtuu tietoturvaloukkaus',
      blocks: [
        { type: 'p', text: 'Jos meillä on syytä uskoa, että hallussamme oleviin henkilötietoihin on päästy käsiksi tai niitä on luovutettu, kopioitu, muutettu, kadotettu tai poistettu luvatta, arvioimme, onko loukkaus sellainen, josta PDPA vaatii ilmoittamaan. Teemme arvion nopeasti ja joka tapauksessa 30 päivän kuluessa siitä, kun saimme asiasta tiedon. Jos jokin palveluntarjoajistamme kertoo meille loukkauksesta omalla puolellaan, toimimme samoin siitä hetkestä, kun saamme tiedon.' },
        { type: 'p', text: 'Loukkauksesta on ilmoitettava, kun se aiheuttaa tai todennäköisesti aiheuttaa merkittävää haittaa niille, joita se koskee, tai kun se koskee vähintään 500:aa ihmistä. Silloin ilmoitamme siitä Singaporen tietosuojaviranomaiselle (Personal Data Protection Commission) niin pian kuin se on käytännössä mahdollista ja viimeistään 3 kalenteripäivän kuluttua arvion tekemisestä. Jos merkittävä haitta on todennäköinen, ilmoitamme myös jokaiselle, jota loukkaus koskee, niin pian kuin se on käytännössä mahdollista hänen tilinsä sähköpostiosoitteeseen ja kerromme, mitä tapahtui, mitä tietoja asia koski ja mitä hän voi tehdä. Laki ei vaadi ilmoittamaan asianosaisille, jos loukkauksen jälkeen tehdyt toimet tai tietojen aiempi suojaus, kuten salaus, tekevät merkittävän haitan epätodennäköiseksi tai jos tietosuojaviranomainen tai lainvalvontaviranomainen määrää, ettei ilmoitusta tehdä.' },
      ],
    },
    {
      id: 'changes',
      heading: 'Tämän käytännön muutokset',
      blocks: [
        { type: 'p', text: 'Päivitämme tätä käytäntöä, kun Trippy muuttaa sitä, mitä se kerää, miten se käyttää tietoja tai kuka niitä saa, ja kun laki muuttuu. Otsikon alla oleva päivämäärä on viimeisimmän version päivämäärä.' },
        { type: 'p', text: 'Merkittävästä muutoksesta, kuten uudesta käyttötarkoituksesta, uudesta tietoryhmästä tai uudesta palveluntarjoajasta, joka saa henkilötietoja, julkaisemme ilmoituksen sovelluksessa tai tällä sivulla ennen kuin muutos tulee voimaan. Jos muutos vaatii suostumuksesi, pyydämme sitä. Emme pidä sitä, että jatkat Trippyn käyttöä, suostumuksena uuteen käyttötarkoitukseen.' },
        { type: 'p', text: 'Tämä käytäntö on kirjoitettu englanniksi, ja se voidaan tarjota muilla kielillä lukemisen helpottamiseksi. Jos käännös poikkeaa englanninkielisestä tekstistä, englanninkielinen teksti on ratkaiseva.' },
      ],
    },
    {
      id: 'complaints',
      heading: 'Kysymykset ja valitukset',
      blocks: [
        { type: 'p', text: 'Jos sinulla on kysyttävää tästä käytännöstä tai jos olemme mielestäsi käsitelleet henkilötietojasi väärin, kerro siitä ensin meille, jotta voimme korjata asian. Kirjoita tietosuojavastaavallemme: {dpoEmail}.' },
        { type: 'p', text: 'Ilmoitamme, että olemme saaneet valituksesi, selvitämme asian ja annamme sinulle vastauksen, yleensä 30 päivän kuluessa.' },
        { type: 'p', text: `Jos et ole tyytyväinen vastaukseemme, voit valittaa Singaporen tietosuojaviranomaiselle (Personal Data Protection Commission of Singapore), joka valvoo PDPA:n noudattamista. Sen verkkosivusto on [pdpc.gov.sg](${PDPC}).` },
        { type: 'p', text: 'Muut Trippyn käyttöä koskevat säännöt ovat [käyttöehdoissamme](#/terms).' },
      ],
    },
  ],
};
