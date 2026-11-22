// Terma penggunaan, dalam Bahasa Melayu. A translation of terms.en.js, which is the reference text
// and the one that governs if this one differs (the row 'Bahasa' of the section 'general' says so).
// Same section ids, same blocks in the same order: when the English text changes, change this file
// with it. Names of controls in the app stay in English, because the app itself is in English, with
// a Malay gloss the first time one appears. Each statute is named in Malay with its official English
// name in brackets on first use. The operator's name and contact address come from
// js/data/site-info.js, never from here.

/** @type {import('../content.js').SitePage} */
export default {
  title: 'Terma penggunaan',
  intro: [
    'Terma ini ialah perjanjian antara anda dengan pengendali Trippy bagi penggunaan laman web dan aplikasi Trippy. Trippy ialah perkhidmatan percuma yang bersifat eksperimen, dikendalikan oleh seorang individu di Singapura, dan terma ini ditadbir oleh undang-undang Singapura.',
    'Sila baca terma ini bersama [Dasar privasi](#/privacy), yang menerangkan cara data peribadi anda dikendalikan. Dalam terma ini, "kami" bermaksud pengendali yang dinamakan dalam bahagian terakhir, dan "anda" bermaksud orang yang menggunakan Trippy.',
  ],
  sections: [
    {
      id: 'summary',
      heading: 'Versi ringkas',
      blocks: [
        {
          type: 'cards',
          items: [
            { title: 'Trippy membantu anda merancang', text: 'Trippy menulis draf jadual perjalanan dengan model AI, dan anda boleh menyunting serta berkongsinya. Trippy bukan ejen pelancongan. Trippy tidak menjual apa-apa, tidak menempah apa-apa dan tidak memperoleh komisen.' },
            { title: 'Semak sebelum bergantung padanya', text: 'Rancangan yang ditulis oleh AI boleh tersilap atau lapuk. Sahkan harga, waktu buka, laluan dan peraturan kemasukan dengan penyedia atau pihak berkuasa sebelum anda membayar atau bertolak.' },
            { title: 'Perjalanan anda kekal milik anda', text: 'Kami tidak menuntut hak milik atas apa yang anda masukkan. Kami menggunakannya hanya untuk menjalankan Trippy bagi anda dan orang yang anda kongsikan. Anda boleh memadam akaun anda sendiri pada bila-bila masa dalam Settings (Tetapan).' },
            { title: 'Percuma dan bersifat eksperimen', text: 'Tiada bayaran dikenakan. Trippy ialah satu eksperimen yang disediakan seadanya: ia boleh berubah atau dihentikan, dan tiada janji bahawa ia akan sentiasa tersedia.' },
            { title: 'Gunakan dengan adil', text: 'Rancang perjalanan yang sebenar, jangan kongsi akaun anda, dan jangan cuba merosakkan atau membebankan perkhidmatan ini.' },
            { title: 'Undang-undang Singapura terpakai', text: 'Jika kita berselisih, kita berbincang dahulu. Selepas itu, mahkamah Singapura yang memutuskan. Hak yang diberikan oleh undang-undang kepada anda sebagai pengguna tidak dilucutkan.' },
          ],
        },
        { type: 'p', text: 'Ringkasan ini disediakan untuk membantu anda. Ia bukan sebahagian daripada terma, dan bahagian-bahagian di bawah itulah yang anda persetujui.' },
      ],
    },
    {
      id: 'acceptance',
      heading: 'Bersetuju dengan terma ini',
      blocks: [
        { type: 'p', text: 'Dengan log masuk ke Trippy, anda bersetuju dengan terma ini. Jika anda tidak bersetuju, jangan log masuk.' },
        { type: 'p', text: 'Jika anda hanya membuka sesuatu perjalanan melalui pautan kongsi, tanpa log masuk, bahagian tentang penggunaan yang dibenarkan, harta intelek, liabiliti dan undang-undang yang mentadbir terpakai kepada penggunaan halaman itu oleh anda.' },
        { type: 'subheading', text: 'Siapa yang boleh menggunakan Trippy' },
        {
          type: 'list',
          items: [
            'Anda mesti berumur 18 tahun ke atas, atau mendapat kebenaran ibu bapa atau penjaga yang sudah membaca terma ini dan bersetuju dengannya bagi pihak anda.',
            'Trippy bukan untuk kanak-kanak bawah 13 tahun.',
            'Anda mesti berupaya membuat perjanjian yang mengikat di bawah undang-undang yang terpakai kepada anda, dan anda tidak dilarang menggunakan perkhidmatan ini di bawah undang-undang Singapura atau undang-undang tempat anda berada.',
          ],
        },
      ],
    },
    {
      id: 'account',
      heading: 'Akaun anda',
      blocks: [
        { type: 'p', text: 'Anda log masuk dengan akaun Google. Trippy tidak mempunyai kata laluan sendiri, jadi keselamatan akaun Trippy anda bergantung pada keselamatan akaun Google anda.' },
        {
          type: 'list',
          items: [
            'Jaga keselamatan akaun Google anda dan jangan benarkan orang lain menggunakan Trippy melaluinya.',
            'Log keluar daripada Trippy pada peranti yang digunakan oleh orang lain. Aplikasi ini menyimpan sesi anda dan salinan perjalanan terbaru dalam pelayar.',
            'Berikan maklumat yang tepat apabila rancangan bergantung padanya, seperti tarikh anda dan pasport yang digunakan oleh kumpulan anda.',
            'Beritahu kami dengan segera jika anda rasa seseorang telah menggunakan akaun anda tanpa kebenaran.',
          ],
        },
        { type: 'p', text: 'Anda bertanggungjawab atas apa yang dilakukan melalui akaun anda, melainkan perkara itu berlaku kerana kami gagal mengambil langkah berjaga-jaga yang munasabah.' },
      ],
    },
    {
      id: 'the-service',
      heading: 'Apa itu Trippy, dan apa yang bukan',
      blocks: [
        { type: 'p', text: 'Trippy ialah alat bantu merancang yang percuma dan bersifat eksperimen. Anda menerangkan perjalanan anda, dan model AI mendraf jadual perjalanan hari demi hari dengan tempat, masa, anggaran kos dan maklumat latar. Anda boleh menyunting rancangan itu, mengimport rancangan yang anda tulis di tempat lain, berkongsinya dan menyimpannya sebagai PDF.' },
        { type: 'subheading', text: 'Kandungan yang ditulis oleh AI' },
        { type: 'p', text: 'Rancangan, cadangan dan suntingan melalui sembang dihasilkan oleh model AI yang dikendalikan oleh syarikat lain. Model AI boleh menyatakan perkara yang salah, meninggalkan sesuatu, menerangkan tempat yang sudah ditutup atau berpindah, atau mengulang maklumat yang sudah lapuk. Kami tidak menyemak setiap rancangan. Anggaplah setiap rancangan sebagai draf yang perlu disemak, bukan sebagai himpunan fakta.' },
        { type: 'subheading', text: 'Anggaran dan panduan' },
        {
          type: 'defs',
          rows: [
            { term: 'Harga dan belanjawan', text: 'Kos dalam rancangan ialah anggaran dalam angka bulat. Pertukaran mata wang hanyalah petunjuk. Harga yang anda bayar ditentukan oleh penyedia pada hari itu.' },
            { term: 'Waktu buka dan ketersediaan', text: 'Hari dan waktu buka, peraturan tiket dan penutupan bermusim sentiasa berubah. Sahkan dengan tempat itu sendiri.' },
            { term: 'Laluan, masa perjalanan dan peta', text: 'Arah, jarak, masa berjalan kaki dan kedudukan pada peta adalah anggaran sahaja dan tidak mengambil kira kerja jalan, mogok, cuaca atau rentak anda sendiri. Gunakan pertimbangan anda sendiri di tempat itu dan ikut papan tanda serta arahan setempat.' },
            { term: 'Cuaca dan musim', text: 'Apa-apa yang dinyatakan oleh Trippy tentang cuaca menerangkan keadaan yang lazim bagi musim itu. Ia bukan ramalan cuaca.' },
            { term: 'Syarat kemasukan, visa dan kesihatan', text: 'Kad syarat kemasukan ialah panduan am berdasarkan pasport yang anda masukkan. Peraturan boleh berubah dalam masa yang singkat dan bergantung pada fakta yang tidak diketahui oleh Trippy, seperti sejarah perjalanan anda atau tujuan lawatan anda. Sentiasa semak dengan sumber rasmi kerajaan atau kedutaan setiap negara sebelum anda menempah, dan sekali lagi sebelum anda bertolak. Visa atau kebenaran perjalanan yang diluluskan tidak menjamin kemasukan.' },
            { term: 'Penerbangan dan penginapan', text: 'Butiran penerbangan dan penginapan dalam rancangan ialah sama ada apa yang anda masukkan atau cadangan. Trippy tidak menyemak jadual, tambang atau bilik secara langsung.' },
          ],
        },
        { type: 'subheading', text: 'Tiada apa-apa dijual atau ditempah melalui Trippy' },
        { type: 'p', text: 'Trippy tidak menjual pakej perjalanan, menerima bayaran, membuat tempahan atau memegang tiket, dan tidak memperoleh komisen daripada mana-mana syarikat penerbangan, hotel atau laman tempahan. Cadangan dalam rancangan bukan tempahan dan bukan janji bahawa tempat itu ada kekosongan untuk anda. Apabila anda menempah, anda menempah dengan syarikat penerbangan, hotel, pengendali atau laman tempahan, dan kontrak anda adalah dengan mereka mengikut terma mereka.' },
        { type: 'subheading', text: 'Bukan nasihat profesional' },
        { type: 'p', text: 'Trippy bukan ejen pelancongan dan tidak memegang lesen ejen pelancongan. Tiada apa-apa di dalamnya merupakan nasihat imigresen, undang-undang, perubatan, keselamatan, insurans atau kewangan. Bagi keputusan yang penting, seperti sama ada anda boleh memasuki sesebuah negara, sama ada sesuatu aktiviti selamat untuk anda, atau insurans yang anda perlukan, tanya pihak berkuasa atau orang yang bertauliah.' },
        { type: 'note', title: 'Perjalanan anda ialah keputusan anda', text: 'Anda yang menentukan ke mana hendak pergi dan apa yang hendak dibuat. Semak nasihat perjalanan rasmi bagi destinasi anda, dan jangan ikut rancangan ke mana-mana tempat atau kegiatan yang nampak tidak selamat, menyalahi undang-undang atau sudah ditutup.' },
      ],
    },
    {
      id: 'your-content',
      heading: 'Kandungan anda',
      blocks: [
        { type: 'p', text: 'Kandungan anda ialah apa yang anda masukkan ke dalam Trippy: permintaan perjalanan, catatan, suntingan, rancangan yang diimport dan butiran tempahan yang anda tambah. Apa-apa hak anda ke atasnya kekal milik anda. Kami tidak menuntut hak milik atasnya.' },
        { type: 'subheading', text: 'Kebenaran yang kami perlukan' },
        { type: 'p', text: 'Untuk menjalankan perkhidmatan ini, kami memerlukan kebenaran anda untuk mengendalikan kandungan anda. Anda memberi kami lesen untuk menyimpan, menyalin, memproses, menyesuaikan dan memaparkannya, dan untuk menyerahkannya kepada penyedia yang dinamakan dalam Dasar privasi, hanya bagi tujuan berikut:' },
        {
          type: 'list',
          items: [
            'menyimpan perjalanan anda dan memaparkannya kepada anda pada peranti anda;',
            'menghantar permintaan perjalanan kepada model AI supaya rancangan dapat ditulis atau diubah;',
            'memaparkan perjalanan kepada orang yang anda jemput dan kepada sesiapa yang mempunyai pautan kongsi yang anda buat;',
            'memastikan Trippy terus berfungsi, selamat dan bebas daripada kerosakan.',
          ],
        },
        { type: 'p', text: 'Lesen ini meliputi seluruh dunia, tidak eksklusif dan percuma. Lesen ini tamat apabila anda memadam kandungan itu atau akaun anda, kecuali salinan dalam sandaran sehingga sandaran itu luput dan apa-apa yang wajib kami simpan di bawah undang-undang. Kami tidak menggunakan kandungan anda untuk pengiklanan dan kami tidak menjualnya.' },
        { type: 'subheading', text: 'Jaminan anda tentang kandungan itu' },
        {
          type: 'list',
          items: [
            'Anda berhak memasukkan kandungan itu ke dalam Trippy. Bagi rancangan yang anda import atau hasil carian yang anda tampal, ini bermakna anda sendiri yang menulisnya atau anda dibenarkan menggunakannya.',
            'Kandungan itu tidak melanggar undang-undang atau hak sesiapa.',
            'Jika kandungan itu mengandungi butiran orang lain, seperti kewarganegaraan teman perjalanan atau alamat e-mel kolaborator, orang itu sudah bersetuju.',
          ],
        },
        { type: 'subheading', text: 'Rancangan yang ditulis oleh AI untuk anda' },
        { type: 'p', text: 'Setakat mana kami mempunyai apa-apa hak ke atas rancangan yang dijana untuk anda, anda boleh menggunakan, mengubah, mencetak dan berkongsinya untuk perjalanan anda sendiri. Teks yang ditulis oleh AI mungkin serupa dengan teks yang ditulis untuk orang lain, dan undang-undang tentang siapa pemiliknya masih belum jelas, jadi kami tidak dapat berjanji bahawa sesuatu rancangan itu milik anda seorang.' },
        { type: 'subheading', text: 'Simpan salinan anda sendiri' },
        { type: 'p', text: 'Trippy bukan perkhidmatan sandaran. Simpan rekod anda sendiri bagi apa-apa yang anda tidak sanggup kehilangan, terutamanya nombor rujukan tempahan. Anda boleh menyimpan mana-mana perjalanan sebagai PDF.' },
      ],
    },
    {
      id: 'sharing',
      heading: 'Rancangan yang dikongsi dan kolaborator',
      blocks: [
        {
          type: 'list',
          items: [
            '**Pautan kongsi.** Pautan kongsi membolehkan sesiapa yang memilikinya membaca salinan ringkas perjalanan tanpa log masuk. Anda bertanggungjawab atas siapa yang menerima pautan itu daripada anda. Pautan itu berhenti berfungsi 7 hari selepas dibuat, atau lebih awal jika anda menekan Stop sharing (henti berkongsi). Anda boleh membuat pautan baharu pada bila-bila masa.',
            '**Kolaborator.** Orang yang anda jemput melalui e-mel boleh melihat keseluruhan perjalanan, termasuk permintaan perjalanan dan catatan anda, dan penyunting boleh mengubahnya. Perubahan yang dibuat oleh penyunting disimpan pada perjalanan anda. Jemput hanya orang yang anda percayai, dan hanya dengan persetujuan mereka.',
            '**Perjalanan yang dikongsi dengan anda.** Perjalanan yang dikongsi oleh seseorang dengan anda ialah milik orang itu. Dia boleh mengubahnya, menarik balik akses anda atau memadamnya pada bila-bila masa. Jangan sebarkan apa yang anda lihat di situ tanpa kebenarannya.',
          ],
        },
        { type: 'p', text: 'Dasar privasi menyatakan dengan tepat apa yang dipaparkan dan disembunyikan oleh pautan kongsi: lihat [Pautan kongsi dan kolaborator](#/privacy/shared-links).' },
      ],
    },
    {
      id: 'acceptable-use',
      heading: 'Penggunaan yang dibenarkan',
      blocks: [
        { type: 'p', text: 'Gunakan Trippy untuk merancang perjalanan bagi diri anda dan orang yang pergi bersama anda. Anda tidak boleh:' },
        {
          type: 'list',
          items: [
            'menggunakannya untuk apa-apa yang menyalahi undang-undang, atau untuk merancang sesuatu yang menyalahi undang-undang;',
            'memasukkan kandungan yang memfitnah, lucah, mengugut atau berunsur kebencian, atau yang melanggar hak atau privasi seseorang;',
            'memasukkan data peribadi orang lain tanpa persetujuan mereka;',
            'cuba memasuki akaun, perjalanan atau data yang bukan milik anda, atau memintas peraturan akses, had harian atau apa-apa langkah keselamatan yang lain;',
            'mencari kelemahan perkhidmatan ini atau menyerangnya, atau memasukkan kod berniat jahat;',
            'menggunakan skrip, bot atau cara automatik yang lain untuk menghantar permintaan, membuat akaun atau menyalin kandungan secara pukal;',
            'cuba membuat model AI menghasilkan bahan yang memudaratkan atau menyalahi undang-undang, atau menggunakan penulis rancangan untuk apa-apa selain merancang perjalanan;',
            'menjual semula perkhidmatan ini, atau menawarkannya kepada orang lain sebagai milik anda sendiri, tanpa persetujuan bertulis kami;',
            'membuang kredit foto, kredit peta atau notis lain.',
          ],
        },
        { type: 'p', text: 'Trippy percuma kerana penggunaannya dihadkan. Setiap akaun mempunyai had harian bagi rancangan dan permintaan sembang, dan kami boleh mengubah had itu.' },
      ],
    },
    {
      id: 'third-parties',
      heading: 'Perkhidmatan lain dan pautan',
      blocks: [
        { type: 'p', text: 'Trippy dibina di atas perkhidmatan yang dikendalikan oleh pihak lain. Supabase mengehos log masuk dan pangkalan data, di Singapura. Google menyediakan log masuk dan model AI Gemini, yang digunakan oleh Trippy pada peringkat percuma perkhidmatan Google, dengan Mistral sebagai model sandaran. Peta datang daripada OpenStreetMap, dan foto serta maklumat tempat datang daripada sumber seperti Wikimedia, Openverse, Pexels dan Google Maps. GitHub mengehos laman web ini. Senarai penuhnya ada dalam Dasar privasi di bawah [Siapa yang menerima data anda](#/privacy/service-providers).' },
        { type: 'p', text: 'Kami memilih perkhidmatan ini dengan teliti, tetapi kami tidak mengawalnya. Perkhidmatan itu boleh berubah, gagal atau dihentikan, dan Trippy boleh terjejas apabila itu berlaku.' },
        { type: 'p', text: 'Pada peringkat percuma, Google boleh menggunakan apa yang dihantar oleh Trippy kepada modelnya untuk menambah baik produknya, dan penyemak manusia boleh membacanya. Jangan masukkan butiran peribadi yang sensitif dalam permintaan perjalanan. Dasar privasi menerangkan apa yang dihantar, di bawah [Model AI dan peringkat percuma Google](#/privacy/ai-models).' },
        { type: 'subheading', text: 'Pautan ke laman lain' },
        { type: 'p', text: 'Halaman perjalanan mempunyai pautan ke laman tempahan dan peta, termasuk Booking.com, Trip.com, Skyscanner, Google Maps dan Rome2Rio, serta ke halaman rasmi kerajaan bagi syarat kemasukan. Laman-laman itu bukan milik kami. Pautan disediakan untuk kemudahan anda, bukan sebagai syor atau jaminan, dan apa yang anda lakukan di sana ialah urusan antara anda dengan laman itu mengikut terma dan dasar privasinya sendiri.' },
        { type: 'subheading', text: 'Tiada komisen' },
        { type: 'p', text: 'Pautan tempahan ialah pautan biasa ke laman lain. Tiada kod rakan niaga padanya. Tiada sesiapa membayar Trippy untuk memaparkannya atau untuk muncul dalam rancangan, dan Trippy tidak memperoleh komisen apabila anda membuat tempahan.' },
      ],
    },
    {
      id: 'intellectual-property',
      heading: 'Harta intelek dan kredit foto',
      blocks: [
        { type: 'p', text: 'Nama dan logo Trippy, reka bentuk aplikasi dan perisiannya ialah milik pengendali atau pemberi lesennya. Anda boleh menggunakan aplikasi ini seperti yang dibenarkan oleh terma ini. Tanpa kebenaran bertulis kami, anda tidak boleh menyalin, mengubah suai atau mengedarkan semula aplikasi atau reka bentuknya, atau menggunakan nama atau logonya dengan cara yang membayangkan bahawa kami menyokong anda. Komponen sumber terbuka kekal di bawah lesennya sendiri.' },
        { type: 'subheading', text: 'Foto dan peta' },
        { type: 'p', text: 'Foto dalam Trippy ialah milik jurugambar atau penerbitnya. Banyak yang digunakan di bawah lesen terbuka daripada Wikimedia Commons, Openverse dan Pexels, dan diberi kredit. Yang lain dipaparkan dari tempat ia diterbitkan di web atau di Google Maps. Buka Kredit foto di kaki mana-mana halaman untuk melihat kredit bagi halaman itu. Data peta datang daripada penyumbang OpenStreetMap dan tersedia di bawah Open Database Licence.' },
        { type: 'p', text: 'Anda boleh melihat foto dan peta di dalam Trippy dan dalam PDF yang anda simpan untuk perjalanan anda sendiri. Apa-apa penggunaan lain memerlukan kebenaran pemegang hak atau mesti mematuhi lesen foto itu.' },
        { type: 'subheading', text: 'Jika sesuatu itu milik anda' },
        { type: 'p', text: 'Jika anda percaya sesuatu foto atau kandungan lain dalam Trippy melanggar hak cipta anda, atau anda mahu foto premis anda dibuang atau diberi kredit dengan cara lain, tulis kepada kami dengan alamat halaman dan perkara yang berkenaan, dan kami akan menyiasatnya dengan segera: {contactEmail}.' },
        { type: 'subheading', text: 'Maklum balas' },
        { type: 'p', text: 'Jika anda menghantar idea atau cadangan kepada kami, kami boleh menggunakannya tanpa berhutang apa-apa kepada anda.' },
      ],
    },
    {
      id: 'availability',
      heading: 'Ketersediaan dan perubahan pada perkhidmatan',
      blocks: [
        { type: 'p', text: 'Trippy percuma dan bersifat eksperimen. Ia ditawarkan seadanya dan setakat yang tersedia. Kami berusaha memastikannya terus berjalan, tetapi kami tidak berjanji bahawa ia akan tersedia pada mana-mana masa tertentu, bebas daripada kerosakan, atau bahawa sesuatu rancangan akan siap ditulis.' },
        {
          type: 'list',
          items: [
            'Kami boleh menambah, mengubah atau membuang ciri, had dan penyedia.',
            'Kami boleh menghentikan perkhidmatan buat sementara untuk penyelenggaraan atau kerana sesuatu penyedia tergendala.',
            'Kami boleh berhenti menawarkan Trippy sama sekali. Jika itu berlaku, kami akan cuba memberikan notis sekurang-kurangnya 30 hari dalam aplikasi supaya anda dapat menyimpan perjalanan anda sebagai PDF.',
          ],
        },
        { type: 'p', text: 'Salinan luar talian bergantung pada pelayar anda untuk menyimpannya, dan pelayar mengosongkan data yang disimpan mengikut peraturannya sendiri. Jangan jadikan salinan luar talian sebagai satu-satunya rekod perjalanan anda.' },
      ],
    },
    {
      id: 'liability',
      heading: 'Penafian dan had liabiliti kami',
      blocks: [
        { type: 'note', title: 'Apa yang dilindungi oleh undang-undang', text: [
          'Tiada apa-apa dalam terma ini yang mengecualikan atau mengehadkan liabiliti kami bagi kematian atau kecederaan diri yang disebabkan oleh kecuaian kami, bagi penipuan atau salah nyataan secara penipuan, atau bagi apa-apa lagi yang tidak boleh dikecualikan atau dihadkan di bawah undang-undang Singapura.',
          'Tiada apa-apa dalam terma ini yang melucutkan hak atau remedi anda sebagai pengguna di bawah Akta Perlindungan Pengguna (Perdagangan Adil) 2003 (Consumer Protection (Fair Trading) Act 2003), atau di bawah mana-mana undang-undang lain, yang tidak boleh dilepaskan melalui perjanjian.',
          'Tiada apa-apa dalam terma ini yang mengurangkan apa yang dikehendaki daripada kami oleh Akta Perlindungan Data Peribadi 2012 (Personal Data Protection Act 2012), atau hak yang diberikannya kepada anda.',
          'Setiap pengecualian dan had di bawah terpakai hanya setakat yang munasabah di bawah Akta Terma Kontrak Tidak Adil 1977 (Unfair Contract Terms Act 1977) dan selainnya dibenarkan oleh undang-undang.',
        ] },
        { type: 'subheading', text: 'Tiada waranti selain yang ada dalam terma ini' },
        { type: 'p', text: 'Tertakluk kepada kotak di atas, kami tidak memberikan apa-apa waranti, syarat atau janji tentang Trippy yang tidak tertulis dalam terma ini. Khususnya, kami tidak menjamin bahawa sesuatu rancangan atau apa-apa maklumat dalam Trippy adalah tepat, lengkap, terkini atau sesuai dengan tujuan anda, atau bahawa perkhidmatan ini tidak akan terganggu atau selamat daripada setiap serangan.' },
        { type: 'subheading', text: 'Apa yang bukan tanggungan kami' },
        { type: 'p', text: 'Tertakluk kepada kotak di atas, kami tidak bertanggungjawab atas:' },
        {
          type: 'list',
          items: [
            'kerugian yang timbul kerana bergantung pada rancangan atau maklumat dalam Trippy tanpa menyemaknya seperti yang diminta oleh terma ini, termasuk terlepas sambungan perjalanan, tempat yang ditutup, harga yang berbeza daripada anggaran, atau tidak dibenarkan menaiki pesawat atau memasuki negara;',
            'perbuatan atau peninggalan syarikat penerbangan, hotel, pengendali, laman tempahan atau mana-mana penyedia lain yang anda berurusan dengannya, atau perkhidmatan yang menjadi asas binaan Trippy;',
            'kehilangan kandungan anda, jika anda boleh menyimpan salinan sendiri;',
            'kerugian yang disebabkan oleh kejadian di luar kawalan munasabah kami, seperti gangguan pada penyedia, kegagalan rangkaian atau perubahan undang-undang;',
            'kerugian yang bukan akibat yang boleh dijangka secara munasabah daripada pelanggaran oleh kami pada masa anda bersetuju dengan terma ini;',
            'kehilangan keuntungan, hasil, perniagaan atau nama baik. Trippy adalah untuk kegunaan peribadi.',
          ],
        },
        { type: 'subheading', text: 'Had bagi liabiliti yang selebihnya' },
        { type: 'p', text: 'Tertakluk kepada kotak di atas, jumlah liabiliti kami kepada anda bagi semua tuntutan yang timbul daripada Trippy atau terma ini, sama ada dalam kontrak, dalam tort termasuk kecuaian, atau selainnya, dihadkan kepada 100 dolar Singapura. Pada pendapat kami had ini munasabah kerana Trippy percuma, anda tidak membayar apa-apa kepada kami, dan terma ini meminta anda menyemak rancangan sebelum bergantung padanya.' },
        { type: 'subheading', text: 'Tanggungjawab anda sendiri' },
        { type: 'p', text: 'Anda bertanggungjawab atas perjalanan anda: tempahan anda, dokumen anda, insurans anda, kesihatan dan keselamatan anda, dan pematuhan undang-undang di tempat yang anda lawati.' },
      ],
    },
    {
      id: 'indemnity',
      heading: 'Jika penggunaan anda menyebabkan tuntutan terhadap kami',
      blocks: [
        { type: 'p', text: 'Jika pihak lain membuat tuntutan terhadap kami kerana anda melanggar terma ini atau undang-undang, atau kerana kandungan yang anda masukkan ke dalam Trippy melanggar hak mereka, anda bersetuju menanggung kerugian dan kos munasabah yang kami alami sebagai akibat langsung, termasuk kos guaman yang munasabah.' },
        {
          type: 'list',
          items: [
            'Ini meliputi hanya bahagian kerugian yang disebabkan oleh pelanggaran anda. Ia tidak meliputi kerugian setakat mana kami sendiri yang menyebabkannya atau menambahnya.',
            'Kami akan memberitahu anda tentang tuntutan itu dengan segera, mengambil langkah yang munasabah untuk mengurangkan kerugian, dan tidak akan menyelesaikannya dengan cara yang mewajibkan anda membayar tanpa berunding dengan anda dahulu.',
          ],
        },
      ],
    },
    {
      id: 'suspension',
      heading: 'Penggantungan dan penamatan',
      blocks: [
        { type: 'subheading', text: 'Anda boleh berhenti pada bila-bila masa' },
        { type: 'p', text: 'Anda boleh berhenti menggunakan Trippy pada bila-bila masa. Padam perjalanan anda dalam Settings (Tetapan), di bawah Data. Padam akaun anda dalam Settings, di bawah Account (akaun), dengan Delete my account (padam akaun saya). Anda tidak perlu meminta kami. Apabila akaun anda dipadam, terma ini tamat bagi anda, kecuali bahagian yang disenaraikan di bawah Apa yang terus terpakai.' },
        { type: 'subheading', text: 'Bila kami boleh menggantung atau menutup akaun' },
        { type: 'p', text: 'Kami boleh menggantung atau menutup akaun anda jika anda melanggar terma ini secara serius atau berulang kali, jika penggunaan anda membahayakan perkhidmatan ini atau orang lain, jika undang-undang menghendakinya, atau jika kami berhenti menawarkan Trippy. Melainkan perkara itu mendesak atau dihalang oleh undang-undang, kami akan memberitahu anda sebabnya terlebih dahulu di alamat e-mel akaun anda dan memberi anda peluang yang adil untuk membetulkan keadaan atau menyimpan perjalanan anda.' },
        { type: 'subheading', text: 'Apa yang berlaku kepada data anda' },
        { type: 'p', text: 'Apabila sesuatu akaun dipadam, oleh anda atau oleh kami, akaun itu, profilnya dan perjalanan miliknya dipadam seperti yang diterangkan dalam Dasar privasi di bawah [Berapa lama kami menyimpan data anda](#/privacy/retention). Pautan kongsi ke perjalanan itu tidak lagi berfungsi dan kolaborator kehilangan akses. Salinan yang anda atau orang lain simpan sebagai PDF berada di luar kawalan kami.' },
        { type: 'subheading', text: 'Apa yang terus terpakai' },
        { type: 'p', text: 'Bahagian tentang kandungan anda (selagi kami menyimpannya secara sah), harta intelek, liabiliti, tanggung rugi, undang-undang yang mentadbir dan terma am terus terpakai selepas terma ini tamat.' },
      ],
    },
    {
      id: 'changes',
      heading: 'Perubahan pada terma ini',
      blocks: [
        { type: 'p', text: 'Kami boleh mengubah terma ini apabila perkhidmatan berubah, apabila undang-undang berubah, atau untuk menjadikannya lebih jelas. Tarikh di bawah tajuk ialah tarikh versi terkini.' },
        { type: 'p', text: 'Bagi perubahan yang mengurangkan hak anda atau menambah kewajipan anda, kami akan memaparkan notis dalam aplikasi atau pada halaman ini sekurang-kurangnya 14 hari sebelum ia berkuat kuasa, melainkan undang-undang atau masalah keselamatan memerlukan perubahan yang lebih cepat. Jika anda tidak menerima terma baharu itu, berhenti menggunakan Trippy sebelum ia berkuat kuasa. Anda boleh memadam akaun anda dalam Settings pada bila-bila masa. Menggunakan Trippy selepas tarikh itu bermakna anda menerimanya. Perubahan tidak terpakai kepada pertikaian yang timbul sebelum ia berkuat kuasa.' },
      ],
    },
    {
      id: 'governing-law',
      heading: 'Undang-undang yang mentadbir dan pertikaian',
      blocks: [
        { type: 'subheading', text: 'Berbincang dengan kami dahulu' },
        { type: 'p', text: 'Jika anda ada aduan atau pertikaian dengan kami, tulis kepada kami dahulu dan terangkan masalahnya serta apa yang anda mahu dilakukan mengenainya: {contactEmail}. Kami akan berbuat perkara yang sama jika kami ada aduan tentang penggunaan anda. Kedua-dua pihak akan cuba dengan suci hati untuk menyelesaikannya dalam masa 30 hari selepas mesej itu sebelum memulakan prosiding mahkamah. Ini tidak menghalang mana-mana pihak daripada pergi ke mahkamah lebih awal untuk mendapatkan relief segera.' },
        { type: 'subheading', text: 'Undang-undang dan mahkamah' },
        { type: 'p', text: 'Terma ini, dan apa-apa pertikaian atau tuntutan yang timbul daripadanya atau daripada penggunaan Trippy oleh anda, termasuk yang bukan berasaskan kontrak, ditadbir oleh undang-undang Singapura. Tertakluk kepada perenggan seterusnya, mahkamah Singapura mempunyai bidang kuasa eksklusif untuk menyelesaikan apa-apa pertikaian sedemikian. Ini bermakna tuntutan mesti dibawa di sana dan bukan di negara lain, dan anda serta kami tunduk kepada bidang kuasa itu. Ini termasuk Tribunal Tuntutan Kecil (Small Claims Tribunals) Singapura bagi tuntutan dalam hadnya.' },
        { type: 'p', text: 'Jika anda tinggal di luar Singapura, undang-undang perlindungan pengguna negara anda sendiri mungkin memberi anda hak yang tidak boleh diketepikan melalui perjanjian, termasuk hak untuk membawa tuntutan di mahkamah tempatan anda. Terma ini tidak melucutkan hak tersebut.' },
      ],
    },
    {
      id: 'general',
      heading: 'Terma am',
      blocks: [
        {
          type: 'defs',
          rows: [
            { term: 'Tiada hak bagi pihak ketiga', text: 'Orang yang bukan pihak kepada terma ini tidak mempunyai hak di bawah Akta Kontrak (Hak Pihak Ketiga) 2001 (Contracts (Rights of Third Parties) Act 2001) untuk menguatkuasakan mana-mana terma ini.' },
            { term: 'Kebolehasingan', text: 'Jika mahkamah mendapati sebahagian daripada terma ini tidak sah atau tidak boleh dikuatkuasakan, bahagian itu hendaklah ditafsirkan secara sempit setakat yang perlu, atau dibuang jika itu tidak dapat dilakukan, dan selebihnya terus berkuat kuasa.' },
            { term: 'Tiada penepian', text: 'Jika kami tidak menguatkuasakan sesuatu terma dengan serta-merta, atau langsung tidak menguatkuasakannya pada satu ketika, kami tidak melepaskan hak untuk menguatkuasakannya kemudian. Penepian hanya sah jika dibuat secara bertulis.' },
            { term: 'Keseluruhan perjanjian', text: 'Terma ini, bersama Dasar privasi, ialah keseluruhan perjanjian antara anda dengan kami tentang Trippy dan menggantikan apa-apa yang dinyatakan sebelum ini mengenai perkara itu. Tiada pihak yang bergantung pada kenyataan yang tiada di dalamnya. Ini tidak mengecualikan liabiliti bagi penipuan, atau bagi apa-apa salah nyataan yang tidak boleh kami kecualikan di bawah undang-undang.' },
            { term: 'Pemindahan', text: 'Terma ini khusus untuk anda dan anda tidak boleh memindahkannya. Kami boleh memindahkan hak dan kewajipan kami kepada pihak yang mengambil alih pengendalian Trippy, dan kami akan memberitahu anda terlebih dahulu supaya anda boleh memadam akaun anda terlebih dahulu jika anda mahu.' },
            { term: 'Bahasa', text: 'Terma ini ditulis dalam bahasa Inggeris dan mungkin disediakan dalam bahasa lain untuk kemudahan anda. Jika terjemahan berbeza daripada teks bahasa Inggeris, teks bahasa Inggeris yang terpakai.' },
            { term: 'Notis', text: 'Kami memberikan notis dalam aplikasi, pada halaman ini atau di alamat e-mel akaun anda. Anda memberikan notis kepada kami di alamat perhubungan di bawah.' },
          ],
        },
      ],
    },
    {
      id: 'contact',
      heading: 'Hubungi kami',
      blocks: [
        {
          type: 'defs',
          rows: [
            { term: 'Pengendali', text: '{operator}' },
            { term: 'Soalan tentang terma ini', text: '{contactEmail}' },
            { term: 'Soalan tentang data peribadi anda', text: '{dpoEmail}' },
            { term: 'Alamat Trippy', text: '{siteUrl}' },
          ],
        },
      ],
    },
  ],
};
