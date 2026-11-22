// Perihal Trippy, dalam Bahasa Melayu. A translation of about.en.js: same section ids, same blocks in
// the same order. The sample plan is translated too, through the places and words that the builders
// in js/site/about/blocks.js and mountAbout accept. Names of controls in the app stay in English,
// because the app itself is in English, with a Malay gloss the first time one appears.
import '../../../css/components/site-about.css';
import { demoHtml, limitsHtml, squareHtml, stepsHtml, viewsHtml } from '../about/blocks.js';
import { mountAbout } from '../about/mount.js';
import { SKETCH_PLACES } from '../about/plan-sketch.js';

const BASE_URL = import.meta.env?.BASE_URL || '/';

// The sample plan in Malay. Only the words are here: times and costs stay those of SKETCH_PLACES.
const PLACE_WORDS = {
  kyoto: {
    name: 'Kyoto', month: 'April',
    days: [
      ['Higashiyama dengan berjalan kaki', 'Berawan sebahagian', ['Kiyomizu-dera', 'Lorong Sannenzaka dan Ninenzaka', 'Makan tengah hari berhampiran Kuil Yasaka', 'Kennin-ji', 'Makan malam di Pontocho']],
      ['Fushimi dan pasar', 'Cerah', ['Fushimi Inari Taisha', 'Makan tengah hari di Pasar Nishiki', 'Istana Nijo', 'Makan malam berhampiran Karasuma']],
      ['Arashiyama', 'Hujan sekejap', ['Hutan buluh', 'Taman Tenryu-ji', 'Makan tengah hari tauhu di tepi sungai', 'Vila Okochi Sanso']],
      ['Utara bandar', 'Berawan sebahagian', ['Kinkaku-ji', 'Taman batu Ryoan-ji', 'Makan tengah hari soba berhampiran Kitano', 'Taman kuil Daitoku-ji', 'Makan malam di Gion']],
    ],
  },
  lisbon: {
    name: 'Lisbon', month: 'Mei',
    days: [
      ['Alfama dan kota lama', 'Cerah', ['Castelo de São Jorge', 'Miradouro de Santa Luzia', 'Makan tengah hari di Alfama', 'Katedral Lisbon', 'Makan malam dengan fado']],
      ['Belém', 'Cerah', ['Biara Jerónimos', 'Tart kastard di Pastéis de Belém', 'Makan tengah hari di tepi sungai', 'MAAT']],
      ['Baixa dan Chiado', 'Berawan sebahagian', ['Praça do Comércio', 'Biara Carmo', 'Makan tengah hari di Time Out Market', 'LX Factory', 'Makan malam di Bairro Alto']],
      ['Lawatan sehari ke Sintra', 'Mendung', ['Kereta api dari Rossio', 'Istana Pena', 'Makan tengah hari di bandar lama', 'Quinta da Regaleira']],
    ],
  },
  penang: {
    name: 'Pulau Pinang', month: 'Februari',
    days: [
      ['George Town dengan berjalan kaki', 'Cerah', ['Rumah kongsi Khoo Kongsi', 'Seni jalanan sekitar Lebuh Armenian', 'Char kway teow di Lebuh Kimberley', 'Cheong Fatt Tze, Rumah Agam Biru', 'Makan malam di gerai penjaja Persiaran Gurney']],
      ['Bukit Bendera dan Kek Lok Si', 'Berawan sebahagian', ['Kereta api Bukit Bendera', 'Asam laksa di Air Itam', 'Tokong Kek Lok Si', 'Makan malam di gerai penjaja Lorong Baru']],
      ['Jeti dan rumah lama', 'Hujan sekejap', ['Jeti Chew', 'Pinang Peranakan Mansion', 'Makan tengah hari nasi kandar', 'Kota Cornwallis']],
      ['Pantai utara', 'Cerah', ['Denai Taman Negara Pulau Pinang', 'Makan tengah hari di Teluk Bahang', 'Tropical Spice Garden', 'Pasar malam Batu Ferringhi']],
    ],
  },
};

const PLACES = SKETCH_PLACES.map((place) => {
  const words = PLACE_WORDS[place.id];
  if (!words) return place;
  return {
    ...place,
    name: words.name,
    month: words.month,
    days: place.days.map((day, dayIndex) => {
      const [title, condition, stops] = words.days[dayIndex] ?? [day.title, day.condition, []];
      return { ...day, title, condition, stops: day.stops.map((item, stopIndex) => ({ ...item, name: stops[stopIndex] ?? item.name })) };
    }),
  };
});

const SKETCH = {
  title: '{place}, {days} hari pada bulan {month}',
  day: 'Hari {n}',
  stops: 'Hentian',
  cost: 'Anggaran aktiviti',
  costBasis: 'seorang',
  weather: 'Cuaca lazim',
  range: '{low} hingga {high}°C',
  free: 'Percuma',
};

const DEMO = {
  legendPlace: 'Tempat',
  legendDays: 'Tempoh',
  daysOption: '{n} hari',
  note: 'Contoh ini ditulis sendiri untuk halaman ini, dan tiada apa-apa yang dihantar ke mana-mana apabila anda mengubahnya. Tempat-tempatnya memang wujud. Harganya pula angka bulat untuk menunjukkan susun atur sahaja, jadi jangan buat belanjawan berdasarkan angka ini.',
};

const STEPS = {
  openAll: 'Buka semua langkah',
  closeAll: 'Tutup semua langkah',
  next: 'Seterusnya: {title}',
  steps: [
    {
      title: 'Anda menerangkan perjalanan anda',
      summary: 'Tujuh skrin ringkas',
      body: [
        'Perancang akan bertanya ke mana anda hendak pergi (satu bandar atau beberapa), bila dan berapa orang, tahap keselesaan yang anda mahu dan belanja sehari, di mana anda mahu menginap, cara anda mahu ke sana, dan cara anda suka mengisi masa. Skrin terakhir memaparkan kesemuanya sekali gus dan ada ruang untuk catatan anda sendiri: tempat yang mesti dilawati, makanan yang anda tidak boleh makan, perkara yang anda mahu elakkan, atau hasil carian yang anda tampal dari tempat lain.',
        'Jika penerbangan atau hotel anda sudah ditempah, masukkan butirannya dan rancangan akan disusun mengikutnya. Hari 1 bermula selepas anda mendarat, bukan sebelumnya. Untuk perjalanan ke luar negara, perancang juga bertanya pasport yang digunakan oleh kumpulan anda supaya ia dapat memberitahu anda tentang visa dan kad ketibaan.',
      ],
    },
    {
      title: 'Permintaan dihantar kepada model AI',
      summary: 'Google Gemini dahulu, dengan dua sandaran',
      body: [
        'Jawapan anda disusun menjadi permintaan bertulis dan dihantar kepada model Gemini daripada Google. Jika Gemini sibuk atau gagal, model Gemini yang lebih ringan akan mengambil alih, dan selepas itu model daripada Mistral. Nama dan alamat e-mel anda tidak disertakan dalam permintaan itu. Apa yang anda taip dalam ruang catatan pula disertakan.',
        'Perjalanan yang panjang terlalu banyak untuk satu jawapan, jadi rancangan ditulis kira-kira empat hari setiap kali. Sebab itulah perjalanan dua minggu mengambil masa sekitar lima minit, dan hujung minggu jauh lebih cepat. Anda boleh menutup tetingkap semasa rancangan sedang ditulis. Kerja itu diteruskan tanpa anda, dan anda boleh meminta supaya diberitahu apabila rancangan siap.',
      ],
    },
    {
      title: 'Draf dipulangkan sebagai rancangan, bukan karangan',
      summary: 'Hari, hentian, masa, kos',
      body: [
        'Model menjawab dalam struktur yang tetap: bagi setiap hari ada senarai hentian, dan setiap hentian ada masa, nama tempat, alamat dan koordinat, satu petua, kos seorang, dan sebaris panduan tentang cara ke situ dari hentian sebelumnya. Bersama hari-hari pertama, model turut menulis bahagian untuk keseluruhan perjalanan: penerbangan dari bandar tempat anda tinggal, atau feri, kereta api atau bas bagi tempat yang dekat, tempat menginap di setiap bandar, dan senarai perkara yang perlu ditempah awal.',
        'Trippy menyemak jawapan itu sebelum menyimpannya. Jika jawapan terpotong, hari-hari yang sudah lengkap disimpan dan bakinya diminta semula. Restoran yang sudah digunakan pada hari lain akan digugurkan. Rancangan lama tidak diganti selagi rancangan baharu belum disimpan sepenuhnya, jadi jika satu cubaan gagal, apa yang anda ada sebelum itu masih kekal.',
      ],
    },
    {
      title: 'Foto dicari selepas itu',
      summary: 'Foto sebenar tempat itu, atau tiada langsung',
      body: [
        'Model tidak membekalkan gambar. Bagi setiap hentian, Trippy mencari foto tempat yang tepat itu: mula-mula di OpenStreetMap, Wikidata, Wikipedia dan Wikimedia Commons, kemudian di laman web tempat itu sendiri dan di Openverse, dan akhir sekali pada penyenaraian tempat itu di Google Maps serta halaman web yang menyebut namanya. Sesuatu foto hanya digunakan jika ia dapat dikaitkan dengan tempat itu melalui pengecam, koordinat atau namanya.',
        'Jika tiada foto yang dapat dikaitkan dengan tempat itu, kad akan memaparkan lakaran pengganti. Foto yang salah tetapi nampak betul lebih teruk daripada tiada foto. Setiap foto disimpan bersama kreditnya, dan **Kredit foto** di kaki halaman menyenaraikan kredit bagi foto pada halaman yang sedang anda buka.',
      ],
    },
    {
      title: 'Peta dilukis daripada koordinat',
      summary: 'Berasaskan OpenStreetMap',
      body: [
        'Setiap hentian diletakkan pada peta mengikut koordinat yang diberikan oleh model. Peta jalannya ialah OpenStreetMap, dan garis bentuk dunia dalam paparan Atlas datang daripada Natural Earth. Apabila anda sendiri menambah atau menukar hentian, carian tempat juga menggunakan data OpenStreetMap, dan jarak berjalan kaki ke hentian seterusnya dikira semula.',
        'Koordinat daripada model boleh tersasar satu dua jalan, dan sesekali memang salah terus. Semak alamat sebelum anda bertolak ke mana-mana tempat yang penting.',
      ],
    },
    {
      title: 'Dua label ditulis dengan berhati-hati',
      summary: 'Typical weather, Activities estimated',
      body: [
        '**Typical weather** (cuaca lazim) ialah cuaca yang dijangka oleh model bagi tempat itu pada musim tersebut, dan ditulis sekali sahaja semasa rancangan dibuat. Ini bukan ramalan cuaca, tidak dikemas kini, dan tidak tahu apa-apa tentang minggu anda berada di sana. Gunakannya untuk menentukan apa yang perlu dibawa, kemudian semak perkhidmatan cuaca beberapa hari sebelum bertolak.',
        '**Activities estimated** (anggaran aktiviti) ialah jumlah kos yang diberikan oleh model bagi setiap hentian dalam rancangan: tiket masuk, makanan, lawatan berpandu. Jumlah ini untuk seorang, dan tidak termasuk penerbangan, tempat menginap dan pengangkutan. Harganya sekadar apa yang diingati oleh model, bukan sebut harga, dan mungkin sudah lapuk.',
      ],
    },
    {
      title: 'Selepas itu, rancangan itu milik anda',
      summary: 'Sunting, tukar, kongsi, guna tanpa sambungan',
      body: [
        'Anda boleh menukar, menambah atau memadam mana-mana hentian. **Alternatives** (pilihan lain) menawarkan tiga tempat berdekatan sebagai ganti bagi satu hentian. Panel sembang pada sesuatu perjalanan menerima permintaan seperti "lapangkan sedikit hari 3" dan menunjukkan perubahan yang dicadangkannya. Tiada apa-apa disimpan sehingga anda menerimanya. Anda boleh menjana semula keseluruhan rancangan, berkongsi pautan baca sahaja, menjemput seseorang melalui e-mel untuk melihat atau menyunting, dan mengeksport PDF.',
        'Perjalanan yang paling baru anda buka disimpan pada peranti anda, jadi rancangan masih boleh dibuka di dalam kapal terbang atau di restoran bawah tanah.',
      ],
    },
  ],
};

const LIMITS = {
  does: {
    title: 'Apa yang Trippy lakukan',
    items: [
      'Menulis rancangan penuh hari demi hari daripada beberapa jawapan, biasanya dalam beberapa minit.',
      'Merancang mengikut perkara yang sudah tetap: penerbangan yang sudah ditempah, hotel yang sudah ditempah, hari anda perlu bekerja.',
      'Menamakan tempat yang benar-benar wujud, dengan alamat, titik pada peta dan sebaris panduan untuk ke sana.',
      'Menggantikan penerbangan dengan feri, kereta api atau bas apabila tempat itu dekat dengan tempat tinggal anda.',
      'Menyenaraikan visa, kad ketibaan dan kebenaran perjalanan bagi pasport dalam kumpulan anda, dengan pautan ke laman rasmi.',
      'Menerima perjalanan yang anda rancang di tempat lain, bersama tempahannya, melalui **Import trip**.',
      'Memastikan perjalanan terbaru anda boleh dibaca tanpa sambungan.',
    ],
  },
  doesNot: {
    title: 'Apa yang Trippy tidak lakukan',
    items: [
      'Trippy tidak menempah apa-apa. Pautan ke syarikat penerbangan, hotel dan laman tempahan membawa anda ke sana, dan anda membeli di sana.',
      'Trippy tidak tahu harga semasa. Kos ialah anggaran seorang untuk aktiviti, dan harga penerbangan serta hotel hanyalah panduan kasar.',
      'Trippy tidak tahu keadaan cuaca nanti. Cuaca dalam rancangan ialah cuaca lazim bagi musim itu, bukan ramalan.',
      'Trippy tidak menyemak waktu buka, penutupan atau hari yang tiketnya habis dijual. Tempat yang diingati oleh model mungkin sudah tutup.',
      'Trippy tidak memberikan nasihat undang-undang tentang kemasukan. Syarat kemasukan hanyalah panduan dan peraturan sentiasa berubah, jadi sahkan dengan pihak berkuasa setiap negara sebelum anda membayar apa-apa.',
      'Trippy tidak menjejaki lokasi anda. Penanda pada hari yang sedang berlangsung mengikut jam, bukan lokasi telefon anda.',
    ],
  },
};

const VIEWS = {
  legend: 'Paparan yang ditunjukkan',
  isDefault: 'Lalai',
  alt: 'Bahagian atas papan pemuka {view} pada telefon, dengan akaun contoh',
  views: {
    atlas: {
      name: 'Atlas',
      text: [
        'Peta dan buku log. Papan pemuka dibuka dengan satu ayat tentang kedudukan rancangan anda sekarang, diikuti perjalanan yang sedang berlangsung atau yang akan tiba.',
        'Atlas juga ada halamannya sendiri. Setiap tempat yang pernah anda rancang dilukis pada peta dunia, dan di bawahnya ada buku log yang menunjukkan bulan mana dalam setiap tahun yang ada rancangan.',
      ],
    },
    departures: {
      name: 'Departures',
      text: [
        'Perjalanan anda dalam bentuk papan berlepas: satu baris bagi setiap perjalanan, dengan tarikh bertolak, tempohnya, anggaran kos aktiviti dan tahap persediaannya. Angka ditulis dengan huruf monospace dan tajuknya berpusing seperti kepingan papan lapangan terbang lama.',
        'Ini paparan untuk orang yang mahu melihat angka dahulu.',
      ],
    },
    concierge: {
      name: 'Concierge',
      text: [
        'Papan pemuka sebagai taklimat pagi. Dalam satu perenggan, ia memberitahu anda hari keberapa perjalanan itu, apa yang seterusnya dan apa yang belum diselesaikan. Perkataan di dalamnya berpaut ke perjalanan yang disebut.',
        'Inilah yang paling tenang antara ketiga-tiganya, dengan ruang paling luas untuk teks.',
      ],
    },
  },
};

const SQUARE = {
  alt: 'Papan pemuka dalam susun atur segi empat sama: satu kad perjalanan memenuhi skrin, dengan titik di bawahnya untuk kad-kad lain',
  text: [
    'Ada beberapa telefon berskrin segi empat sama, misalnya Unihertz Titan 2, dan halaman panjang yang perlu ditatal memang menyeksakan pada skrin begitu. Pada skrin yang hampir segi empat sama, Trippy menukar setiap halaman menjadi setindan kad yang diselak ke sisi, satu kad satu skrin.',
    'Susun atur ini hidup dengan sendirinya, dan **Square layout** dalam [Settings](#/settings) boleh memaksanya hidup atau mati. Pilihan itu disimpan pada peranti, bukan dalam akaun anda.',
  ],
  credit: 'Akaun contoh. Foto Katedral Seville daripada [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sevilla_Cathedral_-_Southeast.jpg).',
};

/** @type {import('../content.js').SitePage} */
export default {
  title: 'Perihal Trippy',
  intro: [
    'Trippy ialah perancang perjalanan yang berjalan dalam pelayar anda. Anda menjawab beberapa soalan tentang perjalanan anda, dan model AI menulis rancangan bagi setiap hari, dengan tempat sebenar, masa dan anggaran kos. Selepas itu, ubahlah apa sahaja yang anda tidak berkenan.',
    'Trippy percuma, tiada iklan, dan tidak menempah atau menjual apa-apa.',
  ],
  sections: [
    {
      id: 'what-it-is',
      heading: 'Apa itu Trippy',
      blocks: [
        { type: 'p', text: 'Merancang perjalanan sendiri bermakna membuka berbelas-belas tab pelayar dan satu hamparan. Trippy menyiapkan draf pertama kerja itu. Ia bertanya ke mana, bila, siapa dan berapa belanjanya, lalu memulangkan sesuatu yang berbentuk seperti contoh di bawah: hari yang bertema, hentian dalam urutan yang munasabah di atas peta, masa bagi setiap hentian dan anggaran kos aktiviti yang dijumlahkan.' },
        { type: 'p', text: 'Rancangan sebenar lebih panjang daripada ini, dan turut memuatkan alamat, foto, peta, penerbangan atau pengangkutan darat, tempat menginap dan senarai perkara yang perlu ditempah awal. Pilih satu tempat dan tempoh untuk melihat rangkanya.' },
        { type: 'custom', html: demoHtml(DEMO, { places: PLACES, sketchWords: SKETCH }) },
        { type: 'p', text: 'Draf itu hanyalah titik permulaan. Kebanyakan masa dalam Trippy dihabiskan selepas itu: memindahkan muzium ke hari hujan, menukar restoran, menambah nombor rujukan tempahan selepas tiket penerbangan dibayar.' },
      ],
    },
    {
      id: 'how-a-plan-is-made',
      heading: 'Cara rancangan dihasilkan',
      blocks: [
        { type: 'p', text: 'Tiada apa-apa yang disembunyikan di sini, dan apabila anda tahu cara rancangan disusun, anda tahu bahagian mana yang boleh dipercayai. Inilah langkah-langkahnya, dari saat anda menekan butang hingga anda membaca hari 1.' },
        { type: 'custom', html: stepsHtml(STEPS) },
      ],
    },
    {
      id: 'what-it-does-and-does-not-do',
      heading: 'Apa yang Trippy lakukan, dan apa yang tidak',
      blocks: [
        { type: 'p', text: 'Trippy cekap dalam bahagian merancang yang meleret-leret, dan langsung tidak berguna untuk beberapa bahagian lain. Elok baca kedua-dua senarai ini sebelum anda bergantung padanya.' },
        { type: 'custom', html: limitsHtml(LIMITS) },
        { type: 'note', title: 'AI boleh tersilap', text: 'Model bahasa menulis dengan lancar sama ada isinya betul atau tidak. Ia boleh meletakkan kafe di jalan yang salah, memberikan harga tiket tahun lepas, atau mengesyorkan tempat yang sudah ditutup. Anggaplah rancangan itu seperti nasihat seorang kawan yang banyak membaca tetapi sudah lama tidak ke sana, dan semak apa-apa yang akan menyusahkan anda jika tersilap.' },
      ],
    },
    {
      id: 'views',
      heading: 'Tiga paparan untuk perjalanan yang sama',
      blocks: [
        { type: 'p', text: 'Cara orang membaca rancangan tidak sama, jadi halaman selepas log masuk ada tiga paparan. Ketiga-tiganya menunjukkan perjalanan dan fakta yang sama, cuma disusun mengikut cita rasa yang berlainan. Anda diberi pilihan ini kali pertama anda log masuk, dan boleh menukarnya dalam [Settings](#/settings) (Tetapan) pada bila-bila masa. Setiap paparan ada tema gelap dan tema cerah.' },
        { type: 'custom', html: viewsHtml(VIEWS, { baseUrl: BASE_URL }) },
        { type: 'subheading', text: 'Skrin segi empat sama' },
        { type: 'custom', html: squareHtml(SQUARE, { baseUrl: BASE_URL }) },
      ],
    },
    {
      id: 'your-data',
      heading: 'Data anda',
      blocks: [
        { type: 'p', text: 'Anda log masuk dengan akaun Google, dan Trippy menyimpan nama, alamat e-mel dan gambar profil anda daripada akaun itu. Trippy juga menyimpan apa yang anda beritahu: bandar tempat anda tinggal, mata wang anda, pasport yang anda gunakan, dan perjalanan anda dengan segala isinya. Jawapan yang anda berikan untuk sesuatu perjalanan dihantar kepada penyedia AI supaya rancangan dapat ditulis. Perjalanan terbaru anda turut disimpan pada peranti supaya boleh dibuka tanpa sambungan, dan dibuang dari peranti itu apabila anda log keluar. Tiada iklan dan tiada penjejak pengiklanan. [Dasar privasi](#/privacy) menerangkan semua ini dengan lengkap, termasuk cara melihat, membetulkan atau memadam data tentang anda yang disimpan, dan cara menarik balik persetujuan anda.' },
      ],
    },
    {
      id: 'who-makes-it',
      heading: 'Siapa yang membuatnya',
      blocks: [
        { type: 'p', text: 'Trippy ialah projek peribadi yang dibuat dan dikendalikan dari Singapura. Asalnya ia alat untuk merancang perjalanan kami sendiri dari Singapura, dan sebab itulah tetapan lalainya condong ke situ: dolar Singapura, dan lawatan singkat ke tempat seperti Batam dan Desaru antara cadangannya. Namun Trippy boleh merancang perjalanan dari mana-mana ke mana-mana.' },
        { type: 'p', text: 'Penggunaannya percuma dan tiada versi berbayar. Pautan ke laman tempahan ialah pautan biasa, dan Trippy tidak mendapat apa-apa apabila anda mengikutinya. Jika perkara itu berubah, halaman inilah yang akan memaklumkannya dahulu.' },
        { type: 'defs', rows: [
          { term: 'Dikendalikan oleh', text: '{operator}' },
          { term: 'Soalan dan masalah', text: 'Tulis kepada: {contactEmail}' },
          { term: 'Tentang data peribadi anda', text: 'Tulis kepada wakil perlindungan data: {dpoEmail}' },
          { term: 'Alamat laman', text: 'Aplikasi ini boleh dicapai di {siteUrl}' },
        ] },
      ],
    },
    {
      id: 'built-on',
      heading: 'Asas binaan Trippy',
      blocks: [
        { type: 'p', text: 'Trippy kecil kerana orang lain sudah menyiapkan bahagian yang sukar dan berkongsi hasilnya. Inilah data terbuka dan perkhidmatan yang menjadi sandarannya.' },
        { type: 'defs', rows: [
          { term: 'OpenStreetMap', text: 'Peta jalan, carian tempat (melalui Photon) dan laluan berjalan kaki (melalui OSRM). Data peta © penyumbang [OpenStreetMap](https://www.openstreetmap.org/copyright).' },
          { term: 'Natural Earth', text: 'Garis bentuk dunia dalam paparan Atlas. [Natural Earth](https://www.naturalearthdata.com/) berada dalam domain awam.' },
          { term: 'Wikimedia Commons, Wikipedia dan Wikidata', text: 'Kebanyakan foto tempat dan foto muka depan, setiap satunya dipaparkan dengan nama pengarang dan lesennya. Foto asal boleh didapati di [Wikimedia Commons](https://commons.wikimedia.org/).' },
          { term: 'Openverse dan Pexels', text: 'Foto tambahan: foto berlesen terbuka melalui [Openverse](https://openverse.org/), dan beberapa foto muka depan perjalanan daripada [Pexels](https://www.pexels.com/).' },
          { term: 'Laman web tempat dan web', text: 'Apabila sumber terbuka tidak mempunyai apa-apa, foto boleh datang daripada laman web tempat itu sendiri, penyenaraiannya di Google Maps atau halaman yang menyebut namanya. Foto itu kekal di tempat asalnya, menjadi hak pemiliknya, dan dipaparkan dengan pautan ke sumbernya.' },
          { term: 'Google Gemini dan Mistral', text: 'Model AI yang menulis rancangan, mencadangkan pilihan lain, menjawab dalam panel sembang dan menyemak bahawa foto muka depan menunjukkan tempat yang betul.' },
          { term: 'Supabase', text: 'Log masuk, pangkalan data tempat perjalanan anda disimpan, storan fail dan fungsi pelayan yang berhubung dengan penyedia AI.' },
          { term: 'Leaflet', text: 'Pustaka yang melukis peta.' },
          { term: 'GitHub Pages', text: 'Tempat aplikasi ini dihoskan.' },
        ] },
      ],
    },
    {
      id: 'questions',
      heading: 'Soalan yang sering ditanya',
      blocks: [
        { type: 'faq', items: [
          { q: 'Betulkah percuma?', a: 'Ya. Tiada pelan berbayar, tiada tempoh percubaan yang akan tamat dan tiada iklan.' },
          { q: 'Perlukah saya ada akaun?', a: 'Untuk merancang perjalanan, ya, dan satu-satunya cara log masuk ialah dengan akaun Google. Untuk membaca perjalanan yang dikongsi dengan anda melalui pautan, tidak perlu.' },
          { q: 'Adakah Trippy menempah penerbangan atau hotel?', a: 'Tidak. Trippy mencadangkannya dan memberikan pautan ke syarikat penerbangan atau laman tempahan, dan anda menempah sendiri di sana. Selepas menempah, anda boleh memasukkan nombor penerbangan, masa dan nombor rujukan tempahan ke dalam perjalanan itu supaya semuanya ada di satu tempat.' },
          { q: 'Berapa lama untuk menyiapkan rancangan?', a: 'Sekitar lima minit bagi perjalanan sepuluh hari hingga dua minggu, dan lebih cepat bagi perjalanan yang singkat. Anda tidak perlu menunggu di halaman itu. Tutup tetingkap dan kembali kemudian, atau minta supaya dimaklumkan apabila rancangan siap.' },
          { q: 'Sejauh mana saya boleh percaya pada rancangan itu?', a: [
            'Percayalah pada rangkanya: kawasan mana yang sesuai digabungkan, berapa banyak yang muat dalam sehari, apa yang perlu ditempah awal. Semak butiran yang akan merugikan wang atau masa jika salah: hari buka, harga tiket, sama ada restoran itu masih wujud, berapa lama perjalanan dari satu tempat ke tempat lain.',
            'Syarat kemasukan paling perlu diberi perhatian. Trippy menyenaraikan apa yang dipercayainya terpakai bagi pasport anda dan memberikan pautan ke laman rasmi. Keputusannya terletak pada pihak berkuasa imigresen setiap negara, jadi bacalah halaman mereka sendiri.',
          ] },
          { q: 'Mengapa cuaca ditulis "typical"?', a: 'Rancangan mungkin ditulis berbulan-bulan sebelum anda bertolak, terlalu awal untuk sesiapa pun tahu cuacanya. Yang dipaparkan ialah cuaca yang biasa bagi tempat dan bulan itu, ditulis semasa rancangan dibuat. Ini bukan ramalan cuaca, dan tidak berubah walau bagaimana sekalipun cuaca sebenar nanti.' },
          { q: 'Bolehkah digunakan tanpa sambungan?', a: 'Untuk membaca, boleh. Perjalanan yang paling baru anda buka disimpan pada peranti dan boleh dibuka tanpa sambungan, dan anda boleh memasang Trippy pada skrin utama seperti aplikasi biasa. Membuat rancangan baharu, menyunting dan panel sembang memerlukan sambungan.' },
          { q: 'Bolehkah kami berdua merancang bersama?', a: 'Boleh. Jemput seseorang melalui e-mel sebagai pelihat atau penyunting, dan apabila seorang mengubah perjalanan itu, yang seorang lagi akan nampak perubahannya. Anda juga boleh membuat pautan baca sahaja untuk orang yang hanya perlu melihat, dan mematikannya semula kemudian.' },
          { q: 'Saya sudah merancang perjalanan di tempat lain. Bolehkah saya bawa masuk?', a: 'Boleh. **Import trip** memberi anda satu arahan untuk ditampal ke dalam mana-mana pembantu AI bersama catatan anda, dan anda tampal semula hasilnya di sini. Anda akan melihat pratonton sebelum apa-apa disimpan, dan import itu boleh dibatalkan.' },
          { q: 'Trippy ada dalam bahasa apa?', a: 'Kaki halaman dan halaman-halaman ini (Perihal, Dasar privasi, Terma penggunaan) tersedia dalam bahasa Inggeris, Bahasa Melayu, bahasa Cina Ringkas dan bahasa Finland. Bahagian lain aplikasi, dan rancangan itu sendiri, buat masa ini dalam bahasa Inggeris.' },
          { q: 'Bagaimana saya memadam perjalanan atau akaun saya?', a: '**Delete all my trips** dalam [Settings](#/settings) memadam setiap perjalanan milik anda buat selama-lamanya. Jika anda mahu akaun dan profil anda dibuang juga, tulis kepada wakil perlindungan data: {dpoEmail}. [Dasar privasi](#/privacy) menerangkan apa yang berlaku selepas itu.' },
        ] },
      ],
    },
  ],
};

/** Binds the plan sketch and the steps (js/site/about/mount.js), with the Malay sample plan. */
export const mount = (root) => mountAbout(root, { places: PLACES, sketchWords: SKETCH });
