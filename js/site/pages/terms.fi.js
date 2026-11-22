// Käyttöehdot, suomeksi. Käännös tiedostosta terms.en.js: samat osiot samoilla tunnisteilla, lohko
// lohkolta. Englanninkielinen teksti on ensisijainen, jos käännös poikkeaa siitä, ja se sanotaan myös
// itse tekstissä (osio general, kohta Kieli). Kun englanninkielinen teksti muuttuu, muuta tämä samalla.
// Ylläpitäjän nimi ja yhteysosoite tulevat tiedostosta js/data/site-info.js, eivät täältä.
// Singaporen lakien nimet on suomennettu kuvailevasti, ja virallinen englanninkielinen nimi on
// suluissa ensimmäisellä kerralla. Sovelluksen omat painikkeet (Settings, Stop sharing) ovat
// toistaiseksi englanniksi ja mainitaan siinä muodossa kuin ne näkyvät ruudulla.

/** @type {import('../content.js').SitePage} */
export default {
  title: 'Käyttöehdot',
  intro: [
    'Nämä ehdot ovat sinun ja Trippyn ylläpitäjän välinen sopimus Trippyn verkkosivuston ja sovelluksen käytöstä. Trippy on maksuton ja kokeellinen palvelu, jota ylläpitää yksityishenkilö. Ylläpidon kotimaa on {country}. Näihin ehtoihin sovelletaan Singaporen lakia.',
    'Lue ehtojen rinnalla [tietosuojakäytäntö](#/privacy), joka kertoo, miten henkilötietojasi käsitellään. Näissä ehdoissa ”me” tarkoittaa viimeisessä osiossa nimettyä ylläpitäjää ja ”sinä” Trippyn käyttäjää.',
  ],
  sections: [
    {
      id: 'summary',
      heading: 'Lyhyesti',
      blocks: [
        {
          type: 'cards',
          items: [
            { title: 'Trippy auttaa suunnittelemaan', text: 'Se kirjoittaa tekoälymallin avulla matkaohjelman luonnoksen, jota voit muokata ja jakaa. Se ei ole matkatoimisto. Se ei myy mitään, ei varaa mitään eikä saa palkkiota.' },
            { title: 'Tarkista ennen kuin luotat', text: 'Tekoälyn kirjoittamat suunnitelmat voivat olla virheellisiä tai vanhentuneita. Varmista hinnat, aukioloajat, reitit ja maahantulosäännöt palvelun tarjoajalta tai viranomaisilta ennen kuin maksat tai matkustat.' },
            { title: 'Matkasi pysyvät sinun', text: 'Emme vaadi omistusoikeutta siihen, mitä syötät. Käytämme sitä vain Trippyn tarjoamiseen sinulle ja niille, joiden kanssa jaat matkasi. Voit poistaa tilisi itse milloin tahansa asetuksissa (Settings).' },
            { title: 'Maksuton ja kokeellinen', text: 'Käytöstä ei peritä maksua. Trippy on kokeilu, joka tarjotaan sellaisenaan: se voi muuttua tai loppua, emmekä lupaa, että se on aina käytettävissä.' },
            { title: 'Käytä reilusti', text: 'Suunnittele oikeita matkoja, pidä tilisi omanasi äläkä yritä rikkoa tai kuormittaa palvelua.' },
            { title: 'Sovellamme Singaporen lakia', text: 'Jos olemme eri mieltä, puhumme ensin. Sen jälkeen asian ratkaisevat Singaporen tuomioistuimet. Oikeuksia, jotka laki antaa sinulle kuluttajana, ei viedä pois.' },
          ],
        },
        { type: 'p', text: 'Tämä tiivistelmä on tässä avuksi. Se ei ole osa ehtoja. Alla olevat osiot ovat se, mihin sitoudut.' },
      ],
    },
    {
      id: 'acceptance',
      heading: 'Ehtojen hyväksyminen',
      blocks: [
        { type: 'p', text: 'Kirjautumalla Trippyyn hyväksyt nämä ehdot. Jos et hyväksy niitä, älä kirjaudu.' },
        { type: 'p', text: 'Jos avaat matkan vain jakolinkillä kirjautumatta, kyseisen sivun käyttöön sovelletaan osioita, jotka koskevat hyväksyttävää käyttöä, immateriaalioikeuksia, vastuuta ja sovellettavaa lakia.' },
        { type: 'subheading', text: 'Kuka saa käyttää Trippyä' },
        {
          type: 'list',
          items: [
            'Sinun on oltava vähintään 18-vuotias, tai sinulla on oltava lupa vanhemmalta tai huoltajalta, joka on lukenut nämä ehdot ja hyväksyy ne puolestasi.',
            'Trippyä ei ole tarkoitettu alle 13-vuotiaille lapsille.',
            'Sinun on voitava tehdä sitova sopimus sinuun sovellettavan lain mukaan, eikä palvelun käyttö saa olla sinulta kiellettyä Singaporen lakien tai oleskelupaikkasi lakien nojalla.',
          ],
        },
      ],
    },
    {
      id: 'account',
      heading: 'Tilisi',
      blocks: [
        { type: 'p', text: 'Kirjaudut Google-tilillä. Trippyllä ei ole omia salasanoja, joten Trippy-tilisi on juuri niin turvassa kuin Google-tilisi.' },
        {
          type: 'list',
          items: [
            'Pidä Google-tilisi suojattuna äläkä anna kenenkään muun käyttää Trippyä sen kautta.',
            'Kirjaudu ulos Trippystä laitteella, jota muutkin käyttävät. Sovellus säilyttää istuntosi ja viimeisimpien matkojen kopiot selaimessa.',
            'Anna oikeat tiedot siinä, mistä suunnitelma riippuu, kuten päivämääräsi ja maat, joiden passeilla seurueesi matkustaa.',
            'Kerro meille viipymättä, jos epäilet, että joku on käyttänyt tiliäsi luvatta.',
          ],
        },
        { type: 'p', text: 'Vastaat siitä, mitä tililläsi tehdään, paitsi jos se johtui siitä, ettemme itse noudattaneet kohtuullista huolellisuutta.' },
      ],
    },
    {
      id: 'the-service',
      heading: 'Mikä Trippy on ja mikä se ei ole',
      blocks: [
        { type: 'p', text: 'Trippy on maksuton ja kokeellinen suunnittelun apuväline. Kuvailet matkan, ja tekoälymalli laatii päivä päivältä etenevän matkaohjelman luonnoksen, jossa on paikkoja, kellonaikoja, arvioituja kuluja ja taustatietoa. Voit muokata suunnitelmaa, tuoda muualla kirjoittamasi suunnitelman, jakaa sen ja tallentaa sen PDF-tiedostoksi.' },
        { type: 'subheading', text: 'Tekoälyn kirjoittama sisältö' },
        { type: 'p', text: 'Suunnitelmat, ehdotukset ja chat-muokkaukset tuottaa tekoälymalli, jota ylläpitää toinen yritys. Tekoälymalli voi väittää vääriä asioita, jättää asioita pois, kuvailla paikkaa, joka on suljettu tai muuttanut, tai toistaa vanhentunutta tietoa. Emme tarkista jokaista suunnitelmaa. Suhtaudu jokaiseen suunnitelmaan tarkistettavana luonnoksena, älä tosiasioiden luettelona.' },
        { type: 'subheading', text: 'Arviot ja ohjeet' },
        {
          type: 'defs',
          rows: [
            { term: 'Hinnat ja budjetit', text: 'Suunnitelman kulut ovat pyöristettyjä arvioita. Valuuttamuunnokset ovat suuntaa antavia. Maksamasi hinnan määrää palvelun tarjoaja ostopäivänä.' },
            { term: 'Aukioloajat ja saatavuus', text: 'Aukiolopäivät ja aukioloajat, lippuja koskevat säännöt ja sesonkisulut muuttuvat. Varmista ne kohteesta.' },
            { term: 'Reitit, matka-ajat ja kartat', text: 'Reittiohjeet, etäisyydet, kävelyajat ja sijainnit kartalla ovat likimääräisiä, eivätkä ne ota huomioon tietöitä, lakkoja, säätä tai omaa tahtiasi. Käytä paikan päällä omaa harkintaasi ja noudata paikallisia opasteita ja ohjeita.' },
            { term: 'Sää ja vuodenajat', text: 'Kaikki, mitä Trippy sanoo säästä, kuvaa vuodenajalle tyypillistä säätä. Se ei ole sääennuste.' },
            { term: 'Maahantulo-, viisumi- ja terveysvaatimukset', text: 'Maahantulovaatimusten kortti on yleistä ohjeistusta, joka perustuu antamiisi passeihin. Säännöt muuttuvat lyhyellä varoitusajalla ja riippuvat seikoista, joita Trippy ei tiedä, kuten matkustushistoriastasi tai käyntisi tarkoituksesta. Tarkista asia aina kunkin maan virallisesta viranomaislähteestä tai suurlähetystöstä ennen kuin varaat ja uudelleen ennen kuin matkustat. Hyväksytty viisumi tai matkustuslupa ei takaa maahanpääsyä.' },
            { term: 'Lennot ja majoitukset', text: 'Suunnitelman lento- ja majoitustiedot ovat joko itse antamiasi tai ehdotuksia. Trippy ei tarkista ajantasaisia aikatauluja, hintoja eikä vapaita huoneita.' },
          ],
        },
        { type: 'subheading', text: 'Trippyn kautta ei myydä eikä varata mitään' },
        { type: 'p', text: 'Trippy ei myy matkoja, ota vastaan maksuja, tee varauksia eikä säilytä lippuja, eikä se saa palkkiota miltään lentoyhtiöltä, hotellilta tai varaussivustolta. Suunnitelmassa oleva ehdotus ei ole varaus eikä lupaus siitä, että paikassa on sinulle tilaa. Kun varaat, varaat lentoyhtiöltä, hotellilta, palvelun järjestäjältä tai varaussivustolta, ja sopimuksesi on niiden kanssa niiden omilla ehdoilla.' },
        { type: 'subheading', text: 'Ei ammattimaista neuvontaa' },
        { type: 'p', text: 'Trippy ei ole matkatoimisto, eikä sillä ole matkatoimistolupaa. Mikään siinä ei ole maahantuloa, oikeudellisia asioita, terveyttä, turvallisuutta, vakuutuksia tai raha-asioita koskevaa neuvontaa. Kysy tärkeissä päätöksissä viranomaiselta tai pätevältä asiantuntijalta, esimerkiksi siitä, saatko tulla johonkin maahan, onko jokin aktiviteetti sinulle turvallinen tai millaisen vakuutuksen tarvitset.' },
        { type: 'note', title: 'Matkasi on sinun päätöksesi', text: 'Sinä päätät, minne menet ja mitä teet. Tarkista kohteesi viralliset matkustustiedotteet, äläkä seuraa suunnitelmaa mihinkään, mikä näyttää vaaralliselta, lainvastaiselta tai suljetulta.' },
      ],
    },
    {
      id: 'your-content',
      heading: 'Sinun sisältösi',
      blocks: [
        { type: 'p', text: 'Sisältösi on sitä, mitä syötät Trippyyn: matkapyynnöt, huomiot, muokkaukset, tuodut suunnitelmat ja lisäämiesi varausten tiedot. Kaikki oikeudet, jotka sinulla on siihen, säilyvät sinulla. Emme vaadi siihen omistusoikeutta.' },
        { type: 'subheading', text: 'Lupa, jonka tarvitsemme' },
        { type: 'p', text: 'Palvelun tarjoamiseksi tarvitsemme luvan käsitellä sisältöäsi. Annat meille käyttöoikeuden tallentaa, kopioida, käsitellä, mukauttaa ja näyttää sitä sekä välittää sitä tietosuojakäytännössä nimetyille palveluntarjoajille, mutta vain näihin tarkoituksiin:' },
        {
          type: 'list',
          items: [
            'matkojesi säilyttäminen ja näyttäminen sinulle omilla laitteillasi;',
            'matkapyynnön lähettäminen tekoälymallille, jotta suunnitelma voidaan kirjoittaa tai sitä voidaan muuttaa;',
            'matkan näyttäminen ihmisille, jotka kutsut, ja kenelle tahansa, jolla on luomasi jakolinkki;',
            'Trippyn pitäminen toimivana, turvallisena ja virheettömänä.',
          ],
        },
        { type: 'p', text: 'Käyttöoikeus on maailmanlaajuinen, ei-yksinomainen ja maksuton. Se päättyy, kun poistat sisällön tai tilisi, lukuun ottamatta varmuuskopioissa olevia kopioita niiden vanhenemiseen asti ja sitä, mitä laki vaatii meitä säilyttämään. Emme käytä sisältöäsi mainontaan emmekä myy sitä.' },
        { type: 'subheading', text: 'Mitä lupaat sisällöstäsi' },
        {
          type: 'list',
          items: [
            'Sinulla on oikeus syöttää sisältö Trippyyn. Tuomasi suunnitelman tai liittämiesi taustatietojen osalta se tarkoittaa, että olet kirjoittanut ne itse tai sinulla on lupa käyttää niitä.',
            'Se ei riko lakia eikä loukkaa kenenkään muun oikeuksia.',
            'Jos siinä on toisen henkilön tietoja, kuten matkakumppanin kansalaisuus tai yhteiskäyttäjän sähköpostiosoite, tämä henkilö on suostunut siihen.',
          ],
        },
        { type: 'subheading', text: 'Suunnitelmat, jotka tekoäly kirjoittaa sinulle' },
        { type: 'p', text: 'Siltä osin kuin meillä on oikeuksia sinulle luotuun suunnitelmaan, saat käyttää, muuttaa, tulostaa ja jakaa sitä omaa matkaasi varten. Tekoälyn kirjoittama teksti voi muistuttaa jollekulle toiselle kirjoitettua tekstiä, ja laki siitä, kuka sen omistaa, on vakiintumaton, joten emme voi luvata, että suunnitelma on yksin sinun.' },
        { type: 'subheading', text: 'Pidä oma kopio' },
        { type: 'p', text: 'Trippy ei ole varmuuskopiopalvelu. Pidä itse tallessa kaikki, minkä menettämiseen sinulla ei ole varaa, ennen kaikkea varausnumerot. Voit tallentaa minkä tahansa matkan PDF-tiedostoksi.' },
      ],
    },
    {
      id: 'sharing',
      heading: 'Jaetut suunnitelmat ja yhteiskäyttäjät',
      blocks: [
        {
          type: 'list',
          items: [
            '**Jakolinkit:** Jakolinkillä kuka tahansa, jolla se on, voi lukea matkasta suppeamman kopion kirjautumatta. Sinä vastaat siitä, kenelle lähetät sen. Linkki lakkaa toimimasta 7 päivän kuluttua sen luomisesta tai aiemmin, jos painat Stop sharing. Voit luoda uuden linkin milloin tahansa.',
            '**Yhteiskäyttäjät:** Sähköpostiosoitteella kutsumasi henkilö näkee koko matkan, myös matkapyyntösi ja huomiosi, ja muokkaaja voi muuttaa matkaa. Muokkaajan tekemät muutokset tallentuvat matkaasi. Kutsu vain ihmisiä, joihin luotat, ja vain heidän suostumuksellaan.',
            '**Sinulle jaetut matkat:** Matka, jonka joku jakaa kanssasi, kuuluu hänelle. Hän voi muuttaa sitä, poistaa pääsysi tai poistaa matkan milloin tahansa. Älä välitä eteenpäin sitä, mitä näet siellä, ilman hänen lupaansa.',
          ],
        },
        { type: 'p', text: 'Tietosuojakäytäntö kertoo tarkasti, mitä jakolinkki näyttää ja mitä se piilottaa: katso [Jakolinkit ja yhteiskäyttäjät](#/privacy/shared-links).' },
      ],
    },
    {
      id: 'acceptable-use',
      heading: 'Hyväksyttävä käyttö',
      blocks: [
        { type: 'p', text: 'Käytä Trippyä omien ja matkaseurasi matkojen suunnitteluun. Et saa:' },
        {
          type: 'list',
          items: [
            'käyttää sitä mihinkään lainvastaiseen tai lainvastaisen toiminnan suunnitteluun;',
            'syöttää sisältöä, joka on kunniaa loukkaavaa, säädytöntä, uhkaavaa tai vihamielistä tai joka loukkaa jonkun oikeuksia tai yksityisyyttä;',
            'syöttää toisen henkilön henkilötietoja ilman hänen suostumustaan;',
            'yrittää päästä tileihin, matkoihin tai tietoihin, jotka eivät ole sinun, tai kiertää pääsysääntöjä, päivärajoja tai muita turvatoimia;',
            'koetella palvelun suojauksia tai hyökätä sitä vastaan tai tuoda siihen haitallista koodia;',
            'käyttää skriptejä, botteja tai muita automaattisia keinoja pyyntöjen lähettämiseen, tilien luomiseen tai sisällön kopioimiseen suurina määrinä;',
            'yrittää saada tekoälymallit tuottamaan haitallista tai lainvastaista aineistoa tai käyttää suunnitelman kirjoittajaa muuhun kuin matkojen suunnitteluun;',
            'myydä palvelua edelleen tai tarjota sitä muille omanasi ilman kirjallista suostumustamme;',
            'poistaa kuvien tekijätietoja, karttojen tekijätietoja tai muita merkintöjä.',
          ],
        },
        { type: 'p', text: 'Trippy on maksuton, koska käyttöä on rajoitettu. Jokaisella tilillä on päivärajat suunnitelmille ja chat-pyynnöille, ja voimme muuttaa näitä rajoja.' },
      ],
    },
    {
      id: 'third-parties',
      heading: 'Muut palvelut ja linkit',
      blocks: [
        { type: 'p', text: 'Trippy on rakennettu muiden ylläpitämien palvelujen varaan. Supabase ylläpitää kirjautumista ja tietokantaa Singaporessa. Google tarjoaa kirjautumisen ja Gemini-tekoälymallit, joita Trippy käyttää Googlen palvelun maksuttomalla tasolla, ja Mistral on varamalli. Kartat tulevat OpenStreetMapista, ja kuvat ja paikkatiedot tulevat esimerkiksi Wikimediasta, Openversestä, Pexelsistä ja Google Mapsista. GitHub ylläpitää verkkosivustoa. Koko luettelo on tietosuojakäytännön kohdassa [Kuka saa tietojasi](#/privacy/service-providers).' },
        { type: 'p', text: 'Valitsemme nämä palvelut huolella, mutta emme hallitse niitä. Ne voivat muuttua, vikaantua tai lakata, ja se voi vaikuttaa Trippyyn.' },
        { type: 'p', text: 'Maksuttomalla tasolla Google voi käyttää sitä, mitä Trippy lähettää sen malleille, tuotteidensa parantamiseen, ja ihmiset voivat lukea sitä tarkistustyössä. Älä kirjoita arkaluonteisia henkilökohtaisia tietoja matkapyyntöön. Tietosuojakäytäntö kertoo kohdassa [Tekoälymallit ja Googlen maksuton taso](#/privacy/ai-models), mitä lähetetään.' },
        { type: 'subheading', text: 'Linkit muille sivustoille' },
        { type: 'p', text: 'Matkasivuilla on linkkejä varaus- ja karttasivustoille, muun muassa palveluihin Booking.com, Trip.com, Skyscanner, Google Maps ja Rome2Rio, sekä viranomaisten virallisille sivuille maahantulovaatimuksista. Nämä sivustot eivät ole meidän. Linkki on tarjolla käytön helpottamiseksi, eikä se ole suositus tai takuu. Se, mitä teet siellä, on sinun ja kyseisen sivuston välinen asia sen omien ehtojen ja tietosuojakäytännön mukaan.' },
        { type: 'subheading', text: 'Ei palkkioita' },
        { type: 'p', text: 'Varauslinkit ovat tavallisia linkkejä muille sivustoille. Niissä ei ole kumppanikoodia. Kukaan ei maksa Trippylle niiden näyttämisestä eikä siitä, että pääsee suunnitelmaan, eikä Trippy saa palkkiota, kun teet varauksen.' },
      ],
    },
    {
      id: 'intellectual-property',
      heading: 'Immateriaalioikeudet ja kuvien tekijätiedot',
      blocks: [
        { type: 'p', text: 'Trippyn nimi ja logo, sovelluksen ulkoasu ja sen ohjelmisto kuuluvat ylläpitäjälle tai sen lisenssinantajille. Saat käyttää sovellusta näiden ehtojen sallimalla tavalla. Et saa ilman kirjallista lupaamme kopioida, muokata tai levittää sovellusta tai sen ulkoasua etkä käyttää nimeä tai logoa tavalla, joka antaa ymmärtää, että tuemme tai suosittelemme sinua. Avoimen lähdekoodin osiin sovelletaan niiden omia lisenssejä.' },
        { type: 'subheading', text: 'Kuvat ja kartat' },
        { type: 'p', text: 'Trippyn kuvat kuuluvat kuvaajilleen tai julkaisijoilleen. Monia käytetään Wikimedia Commonsin, Openversen ja Pexelsin avoimilla lisensseillä, ja niiden tekijät mainitaan. Toiset näytetään sieltä, missä ne on julkaistu verkossa tai Google Mapsissa. Avaa minkä tahansa sivun alareunasta Kuvien tekijätiedot, niin näet kyseisen sivun kuvien tekijät. Karttatiedot ovat OpenStreetMapin tekijöiltä, ja ne ovat saatavilla Open Database License -lisenssillä.' },
        { type: 'p', text: 'Saat katsella kuvia ja karttoja Trippyssä ja PDF-tiedostossa, jonka tallennat omaa matkaasi varten. Kaikkeen muuhun käyttöön tarvitaan oikeudenhaltijan lupa, tai sen on noudatettava kuvan lisenssiä.' },
        { type: 'subheading', text: 'Jos jokin on sinun' },
        { type: 'p', text: 'Jos uskot, että jokin Trippyn kuva tai muu sisältö loukkaa tekijänoikeuttasi, tai haluat, että kuva omasta paikastasi poistetaan tai sen tekijätiedot merkitään toisin, kirjoita meille ja kerro sivun osoite ja se, mitä asia koskee, niin selvitämme asian viipymättä: {contactEmail}.' },
        { type: 'subheading', text: 'Palaute' },
        { type: 'p', text: 'Jos lähetät meille idean tai ehdotuksen, saamme käyttää sitä olematta sinulle mitään velkaa.' },
      ],
    },
    {
      id: 'availability',
      heading: 'Saatavuus ja palvelun muutokset',
      blocks: [
        { type: 'p', text: 'Trippy on maksuton ja kokeellinen. Se tarjotaan sellaisena kuin se on ja silloin kuin se on saatavilla. Pyrimme pitämään sen toiminnassa, mutta emme lupaa, että se on käytettävissä tiettynä aikana, että siinä ei ole vikoja tai että suunnitelman kirjoitus valmistuu.' },
        {
          type: 'list',
          items: [
            'Voimme lisätä, muuttaa tai poistaa toimintoja, rajoja ja palveluntarjoajia.',
            'Voimme keskeyttää palvelun huollon ajaksi tai siksi, että jokin palveluntarjoaja on poissa käytöstä.',
            'Voimme lopettaa Trippyn tarjoamisen kokonaan. Jos teemme niin, pyrimme ilmoittamaan siitä sovelluksessa vähintään 30 päivää etukäteen, jotta ehdit tallentaa matkasi PDF-tiedostoiksi.',
          ],
        },
        { type: 'p', text: 'Verkottomat kopiot ovat sen varassa, että selaimesi säilyttää ne, ja selaimet tyhjentävät tallennettuja tietoja omien sääntöjensä mukaan. Älä pidä verkotonta kopiota ainoana tallenteenasi matkasta.' },
      ],
    },
    {
      id: 'liability',
      heading: 'Vastuuvapaus ja vastuumme rajoitukset',
      blocks: [
        { type: 'note', title: 'Mitä laki suojaa', text: [
          'Mikään näissä ehdoissa ei sulje pois tai rajoita vastuutamme huolimattomuudestamme johtuvasta kuolemasta tai henkilövahingosta, petoksesta tai petollisesta harhaanjohtamisesta tai mistään muusta, mitä ei Singaporen lakien mukaan voi sulkea pois tai rajoittaa.',
          'Mikään näissä ehdoissa ei vie sinulta oikeutta tai oikeussuojakeinoa, joka sinulla on kuluttajana Singaporen kuluttajansuojalain (Consumer Protection (Fair Trading) Act 2003) tai muun lain nojalla ja josta ei voi luopua sopimuksella.',
          'Mikään näissä ehdoissa ei vähennä sitä, mitä Singaporen henkilötietojen suojaa koskeva laki (Personal Data Protection Act 2012) meiltä vaatii, eikä oikeuksia, jotka se sinulle antaa.',
          'Jokaista alla olevaa poissulkemista ja rajoitusta sovelletaan vain siltä osin kuin se on kohtuullinen kohtuuttomia sopimusehtoja koskevan Singaporen lain (Unfair Contract Terms Act 1977) mukaan ja muutoin lain sallima.',
        ] },
        { type: 'subheading', text: 'Ei takuita näiden ehtojen lisäksi' },
        { type: 'p', text: 'Ellei yllä olevasta laatikosta muuta johdu, emme anna Trippystä mitään takuuta, ehtoa tai lupausta, jota ei ole kirjoitettu näihin ehtoihin. Emme etenkään takaa, että suunnitelma tai mikään Trippyn tieto on oikea, täydellinen, ajantasainen tai tarkoitukseesi sopiva, emmekä sitä, että palvelu toimii keskeytyksettä tai on suojattu jokaista hyökkäystä vastaan.' },
        { type: 'subheading', text: 'Mistä emme vastaa' },
        { type: 'p', text: 'Ellei yllä olevasta laatikosta muuta johdu, emme vastaa seuraavista:' },
        {
          type: 'list',
          items: [
            'vahinko, joka johtuu siitä, että luotat suunnitelmaan tai Trippyn tietoihin tarkistamatta niitä näiden ehtojen edellyttämällä tavalla, mukaan lukien jatkoyhteydeltä myöhästyminen, suljettu kohde, arviosta poikkeava hinta tai se, että sinua ei päästetä koneeseen tai maahan;',
            'lentoyhtiöiden, hotellien, palvelun järjestäjien, varaussivustojen tai muiden palveluntarjoajien, joiden kanssa asioit, tai niiden palvelujen, joiden varaan Trippy on rakennettu, teot tai laiminlyönnit;',
            'sisältösi katoaminen, jos olisit voinut pitää siitä oman kopion;',
            'vahinko, jonka aiheuttavat tapahtumat, joihin emme kohtuudella voi vaikuttaa, kuten palveluntarjoajan käyttökatko, verkkovika tai lain muutos;',
            'vahinko, joka ei ollut sopimusrikkomuksemme kohtuudella ennakoitavissa oleva seuraus silloin, kun hyväksyit nämä ehdot;',
            'voiton, tulojen, liiketoiminnan tai maineen menetys. Trippy on tarkoitettu henkilökohtaiseen käyttöön.',
          ],
        },
        { type: 'subheading', text: 'Yläraja sille, mikä jää jäljelle' },
        { type: 'p', text: 'Ellei yllä olevasta laatikosta muuta johdu, kokonaisvastuumme sinulle kaikista Trippystä tai näistä ehdoista johtuvista vaatimuksista on enintään 100 Singaporen dollaria, perustuivatpa ne sopimukseen, sopimuksen ulkopuoliseen vastuuseen, huolimattomuus mukaan lukien, tai muuhun perusteeseen. Pidämme tätä kohtuullisena, koska Trippy on maksuton, et maksa meille mitään ja ehdot pyytävät sinua tarkistamaan suunnitelman ennen kuin luotat siihen.' },
        { type: 'subheading', text: 'Oma vastuusi' },
        { type: 'p', text: 'Vastaat itse matkastasi: varauksistasi, asiakirjoistasi, vakuutuksistasi, terveydestäsi ja turvallisuudestasi sekä siitä, että noudatat niiden paikkojen lakeja, joissa käyt.' },
      ],
    },
    {
      id: 'indemnity',
      heading: 'Vaatimukset meitä vastaan käyttösi takia',
      blocks: [
        { type: 'p', text: 'Jos joku muu esittää meitä vastaan vaatimuksen siksi, että rikoit näitä ehtoja tai lakia, tai siksi, että Trippyyn syöttämäsi sisältö loukkasi hänen oikeuksiaan, sitoudut korvaamaan meille siitä suoraan aiheutuvat kohtuulliset vahingot ja kulut, kohtuulliset oikeudenkäyntikulut mukaan lukien.' },
        {
          type: 'list',
          items: [
            'Tämä koskee vain sitä osaa vahingosta, jonka rikkomuksesi aiheutti. Se ei koske vahinkoa siltä osin kuin me aiheutimme sen tai pahensimme sitä.',
            'Kerromme sinulle vaatimuksesta viipymättä, pyrimme kohtuullisin toimin pitämään vahingon pienenä emmekä sovi asiaa tavalla, joka velvoittaa sinut maksamaan, neuvottelematta ensin kanssasi.',
          ],
        },
      ],
    },
    {
      id: 'suspension',
      heading: 'Käytön keskeyttäminen ja päättyminen',
      blocks: [
        { type: 'subheading', text: 'Voit lopettaa milloin tahansa' },
        { type: 'p', text: 'Voit lopettaa Trippyn käytön milloin haluat. Poista matkasi asetuksissa (Settings) kohdassa Data. Poista tilisi asetuksissa kohdassa Account painikkeella Delete my account. Sinun ei tarvitse pyytää sitä meiltä. Kun tilisi on poistettu, nämä ehdot päättyvät sinun osaltasi lukuun ottamatta osioita, jotka luetellaan kohdassa Mikä jää voimaan.' },
        { type: 'subheading', text: 'Milloin voimme keskeyttää tilin käytön tai sulkea tilin' },
        { type: 'p', text: 'Voimme keskeyttää tilisi käytön tai sulkea tilisi, jos rikot näitä ehtoja vakavasti tai toistuvasti, jos käyttösi vaarantaa palvelun tai muita ihmisiä, jos laki sitä vaatii tai jos lopetamme Trippyn tarjoamisen. Ellei asia ole kiireellinen tai laki estä sitä, kerromme syyn etukäteen tilisi sähköpostiosoitteeseen ja annamme sinulle kohtuullisen tilaisuuden korjata asia tai tallentaa matkasi.' },
        { type: 'subheading', text: 'Mitä tiedoillesi tapahtuu' },
        { type: 'p', text: 'Kun tili poistetaan, sinun tai meidän toimestamme, tili, profiili ja sen omistamat matkat poistetaan niin kuin tietosuojakäytännön kohdassa [Kuinka kauan säilytämme tietojasi](#/privacy/retention) kerrotaan. Näiden matkojen jakolinkit lakkaavat toimimasta, ja yhteiskäyttäjät menettävät pääsynsä. Kopiot, jotka sinä tai muut olette tallentaneet PDF-tiedostoina, eivät ole meidän hallinnassamme.' },
        { type: 'subheading', text: 'Mikä jää voimaan' },
        { type: 'p', text: 'Osiot, jotka koskevat sisältöäsi (niin kauan kuin meillä on sitä laillisesti hallussamme), immateriaalioikeuksia, vastuuta, vahingonkorvausvelvollisuuttasi, sovellettavaa lakia ja yleisiä ehtoja, ovat voimassa myös näiden ehtojen päättymisen jälkeen.' },
      ],
    },
    {
      id: 'changes',
      heading: 'Näiden ehtojen muutokset',
      blocks: [
        { type: 'p', text: 'Voimme muuttaa näitä ehtoja, kun palvelu muuttuu, kun laki muuttuu tai kun haluamme selkeyttää niitä. Otsikon alla oleva päivämäärä on viimeisimmän version päivämäärä.' },
        { type: 'p', text: 'Muutoksesta, joka kaventaa oikeuksiasi tai lisää velvollisuuksiasi, julkaisemme ilmoituksen sovelluksessa tai tällä sivulla vähintään 14 päivää ennen sen voimaantuloa, ellei laki tai tietoturvaongelma vaadi nopeampaa muutosta. Jos et hyväksy uusia ehtoja, lopeta Trippyn käyttö ennen kuin ne tulevat voimaan. Voit poistaa tilisi asetuksissa milloin tahansa. Jos käytät Trippyä tuon päivän jälkeen, hyväksyt uudet ehdot. Muutokset eivät koske riitaa, joka syntyi ennen niiden voimaantuloa.' },
      ],
    },
    {
      id: 'governing-law',
      heading: 'Sovellettava laki ja riidat',
      blocks: [
        { type: 'subheading', text: 'Puhu ensin meille' },
        { type: 'p', text: 'Jos sinulla on valitus tai riita kanssamme, kirjoita ensin meille ja kerro, mikä ongelma on ja mitä toivoisit asialle tehtävän: {contactEmail}. Me teemme samoin, jos meillä on huomautettavaa käytöstäsi. Kumpikin meistä yrittää vilpittömästi sopia asian 30 päivän kuluessa tuosta viestistä ennen kuin nostaa kanteen. Tämä ei estä kumpaakaan meistä hakemasta tuomioistuimelta kiireellistä suojaa jo aiemmin.' },
        { type: 'subheading', text: 'Laki ja tuomioistuimet' },
        { type: 'p', text: 'Näihin ehtoihin ja kaikkiin niistä tai Trippyn käytöstäsi johtuviin riitoihin ja vaatimuksiin, myös sopimukseen perustumattomiin, sovelletaan Singaporen lakia. Ellei seuraavasta kappaleesta muuta johdu, Singaporen tuomioistuimilla on yksinomainen toimivalta ratkaista tällaiset riidat. Se tarkoittaa, että kanne on nostettava siellä eikä toisessa maassa, ja sekä sinä että me hyväksymme tämän toimivallan. Tämä koskee myös Singaporen pienten riita-asioiden lautakuntia (Small Claims Tribunals) niiden toimivallan rajoissa.' },
        { type: 'p', text: 'Jos asut Singaporen ulkopuolella, oman maasi kuluttajansuojalaki voi antaa sinulle oikeuksia, joita ei voi poistaa sopimuksella, myös oikeuden nostaa kanne kotimaasi tuomioistuimessa. Nämä ehdot eivät vie näitä oikeuksia.' },
      ],
    },
    {
      id: 'general',
      heading: 'Yleiset ehdot',
      blocks: [
        {
          type: 'defs',
          rows: [
            { term: 'Ei oikeuksia sivullisille', text: 'Henkilöllä, joka ei ole näiden ehtojen osapuoli, ei ole sivullisten oikeuksia sopimuksissa koskevan Singaporen lain (Contracts (Rights of Third Parties) Act 2001) nojalla oikeutta vedota yhteenkään niistä.' },
            { term: 'Ehtojen erillisyys', text: 'Jos tuomioistuin katsoo jonkin osan näistä ehdoista pätemättömäksi tai täytäntöönpanokelvottomaksi, sitä osaa tulkitaan niin suppeasti kuin on tarpeen tai se poistetaan, jos suppea tulkinta ei ole mahdollinen, ja muut ehdot pysyvät voimassa.' },
            { term: 'Ei oikeuksista luopumista', text: 'Jos emme vetoa johonkin ehtoon heti tai jollakin kerralla lainkaan, emme ole luopuneet oikeudesta vedota siihen myöhemmin. Oikeudesta luopuminen pätee vain kirjallisena.' },
            { term: 'Koko sopimus', text: 'Nämä ehdot ja tietosuojakäytäntö muodostavat sinun ja meidän välisen Trippyä koskevan sopimuksen kokonaisuudessaan ja korvaavat kaiken, mitä asiasta on aiemmin sanottu. Kumpikaan meistä ei nojaa lausumaan, jota niissä ei ole. Tämä ei sulje pois vastuuta petoksesta eikä sellaisesta virheellisestä tiedosta, josta lain mukaan emme voi sulkea vastuuta pois.' },
            { term: 'Siirtäminen', text: 'Nämä ehdot ovat henkilökohtaiset, etkä saa siirtää niitä. Me saamme siirtää oikeutemme ja velvollisuutemme sille, joka ottaa Trippyn ylläpidon hoitaakseen, ja kerromme siitä sinulle etukäteen, jotta voit halutessasi poistaa tilisi ensin.' },
            { term: 'Kieli', text: 'Nämä ehdot on kirjoitettu englanniksi, ja ne voidaan tarjota muilla kielillä lukemisen helpottamiseksi. Jos käännös poikkeaa englanninkielisestä tekstistä, englanninkielinen teksti on ratkaiseva.' },
            { term: 'Ilmoitukset', text: 'Annamme ilmoitukset sovelluksessa, tällä sivulla tai tilisi sähköpostiosoitteeseen. Sinä annat ilmoitukset meille alla olevaan yhteysosoitteeseen.' },
          ],
        },
      ],
    },
    {
      id: 'contact',
      heading: 'Yhteystiedot',
      blocks: [
        {
          type: 'defs',
          rows: [
            { term: 'Ylläpitäjä', text: '{operator}' },
            { term: 'Näitä ehtoja koskevat kysymykset', text: '{contactEmail}' },
            { term: 'Henkilötietojasi koskevat kysymykset', text: '{dpoEmail}' },
            { term: 'Missä Trippy on', text: '{siteUrl}' },
          ],
        },
      ],
    },
  ],
};
