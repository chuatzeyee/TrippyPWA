// Dasar privasi, dalam Bahasa Melayu. A translation of privacy.en.js, which is the reference text and
// the one that governs if this one differs (the last paragraph of the section 'changes' says so).
// Same section ids, same blocks in the same order: when the English text changes, change this file
// with it. Names of controls in the app stay in English, because the app itself is in English, with
// a Malay gloss the first time one appears. The operator's name and the contact addresses come from
// js/data/site-info.js, never from here.

const PDPC = 'https://www.pdpc.gov.sg/';

/**
 * Definition rows from compact rows: the first cell is the term, the second its first line, and each
 * further cell a line that starts with its label.
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
  title: 'Dasar privasi',
  intro: [
    'Dasar ini menerangkan data peribadi yang dikumpul oleh Trippy, sebabnya, tempat data itu disimpan, siapa lagi yang menerimanya, dan apa yang boleh anda lakukan mengenainya. Dasar ini ditulis berpandukan kewajipan di bawah Akta Perlindungan Data Peribadi 2012 (Personal Data Protection Act 2012) Singapura, yang kami sebut PDPA selepas ini.',
    'Trippy ialah perancang perjalanan percuma. Anda log masuk dengan Google, menerangkan perjalanan anda, dan model AI menulis rancangan hari demi hari yang boleh anda sunting dan kongsi. Dalam dasar ini, "kami" bermaksud pengendali Trippy yang dinamakan dalam bahagian seterusnya, dan "anda" bermaksud orang yang menggunakannya.',
  ],
  sections: [
    {
      id: 'at-a-glance',
      heading: 'Sepintas lalu',
      blocks: [
        {
          type: 'cards',
          items: [
            { title: 'Anda log masuk dengan Google', text: 'Google memberi kami alamat e-mel, nama dan gambar profil anda. Trippy tidak mempunyai kata laluan sendiri, jadi ia tidak pernah melihat atau menyimpan kata laluan.' },
            { title: 'Model AI menulis rancangan anda', text: 'Apa yang anda taip dalam permintaan perjalanan, termasuk teks bebas, dihantar kepada Google Gemini, atau kepada Mistral jika Gemini gagal. Nama, alamat e-mel dan kewarganegaraan pasport anda tidak dihantar.' },
            { title: 'Tiada iklan dan tiada penjejakan', text: 'Trippy tidak meletakkan kuki dan tidak mempunyai skrip analitik, iklan atau piksel penjejak. Kami tidak menjual data peribadi.' },
            { title: 'Data anda mungkin keluar dari Singapura', text: 'Pangkalan data, perkhidmatan log masuk dan model AI dikendalikan oleh penyedia yang pelayannya mungkin berada di negara lain. Bahagian tentang pemindahan menerangkan maksudnya.' },
            { title: 'Anda menentukan siapa yang melihat perjalanan', text: 'Tiada pengguna lain yang dapat melihat sesuatu perjalanan sehingga anda menjemput seseorang melalui e-mel atau membuat pautan kongsi. Kedua-duanya boleh dibatalkan pada bila-bila masa. Pentadbir kami boleh membaca perjalanan untuk membaiki kerosakan.' },
            { title: 'Anda boleh berhenti', text: 'Anda boleh memadam mana-mana perjalanan, atau kesemuanya, dalam aplikasi. Jika anda mahu akaun itu sendiri dipadam, atau mahu melihat, membetulkan atau menghentikan penggunaan data anda, tulis kepada wakil perlindungan data kami.' },
          ],
        },
        { type: 'p', text: 'Kad-kad di atas hanyalah ringkasan. Bahagian-bahagian di bawah ialah dasarnya.' },
      ],
    },
    {
      id: 'who-we-are',
      heading: 'Siapa yang bertanggungjawab atas data anda',
      blocks: [
        { type: 'p', text: 'Trippy dikendalikan dari Singapura. Pengendali menentukan sebab dan cara data peribadi anda digunakan, dan bertanggungjawab atasnya di bawah PDPA.' },
        {
          type: 'defs',
          rows: [
            { term: 'Pengendali', text: '{operator}' },
            { term: 'Hubungan am', text: '{contactEmail}' },
            { term: 'Alamat Trippy', text: '{siteUrl}' },
          ],
        },
      ],
    },
    {
      id: 'data-protection-contact',
      heading: 'Wakil perlindungan data kami',
      blocks: [
        { type: 'p', text: 'Seorang individu bertanggungjawab memastikan Trippy mematuhi PDPA. Soalan, permintaan dan aduan tentang data peribadi anda hendaklah dihantar kepada individu itu.' },
        { type: 'defs', rows: [{ term: 'Wakil perlindungan data', text: '{dpoEmail}' }] },
        { type: 'p', text: 'Anda juga boleh bertanya kepada individu itu tentang cara kami mengendalikan data peribadi secara am dan cara sesuatu aduan diuruskan, dan kami akan memberitahu anda.' },
        { type: 'p', text: 'Jika boleh, tulis daripada alamat e-mel yang anda gunakan untuk log masuk. Dengan itu kami dapat mengesahkan bahawa permintaan itu memang daripada anda tanpa perlu meminta maklumat lanjut tentang diri anda.' },
      ],
    },
    {
      id: 'what-we-collect',
      heading: 'Apa yang kami kumpul dan sebabnya',
      blocks: [
        { type: 'p', text: 'Data peribadi sampai kepada Trippy melalui tiga cara: Google menghantarnya apabila anda log masuk, anda menaipnya, atau pelayar anda dan pelayan kami merekodkannya semasa aplikasi berjalan. Setiap jenis disenaraikan di bawah bersama sumbernya, kegunaannya dan tempat data itu disimpan.' },
        facts(['Daripada:', 'Digunakan untuk:', 'Disimpan:'], [
            ['Identiti akaun', 'Alamat e-mel, nama penuh, alamat gambar profil, id akaun dan token log masuk anda', 'Google, apabila anda menekan Sign in with Google (log masuk dengan Google)', 'Membolehkan anda log masuk, memaparkan nama dan gambar anda dalam aplikasi, menunjukkan akaun yang sedang anda gunakan, dan memadankan jemputan perjalanan dengan alamat e-mel anda', 'Dalam perkhidmatan log masuk kami di Supabase. Sesi log masuk turut disimpan dalam pelayar anda supaya anda kekal log masuk.'],
            ['Profil', 'Nama paparan, bandar dan negara tempat tinggal, sama ada anda mengembara sepenuh masa, mata wang anda, kewarganegaraan pasport, dan sama ada akaun itu akaun biasa atau akaun pentadbir', 'Anda, dalam langkah profil dan dalam Settings (Tetapan). Nama paparan anda bermula dengan nama pada akaun Google anda. Jenis akaun ditetapkan oleh kami.', 'Menyapa anda, merancang dari tempat anda bertolak, format nombor dan tarikh, memaparkan harga dalam mata wang anda, dan panduan kemasukan serta visa bagi pasport yang anda pegang', 'Dalam pangkalan data kami di Supabase. Satu ringkasan disimpan dalam pelayar anda supaya aplikasi dibuka dengan cepat.'],
            ['Pilihan paparan', 'Paparan, tema, gerakan, bahasa, unit jam dan suhu, suis pada halaman perjalanan', 'Pilihan anda dalam aplikasi', 'Mengingati rupa dan gelagat aplikasi yang anda suka', 'Dalam pelayar anda. Jika penyegerakan pilihan dihidupkan, juga dalam profil anda di pangkalan data kami supaya peranti anda yang lain sepadan.'],
            ['Permintaan perjalanan', 'Destinasi, tarikh atau musim, hari cuti dan hari bekerja, bilangan pengembara, belanjawan harian, pilihan penginapan dan penerbangan, pengangkutan, minat dan gaya mengembara, bandar berlepas, bandar dan negara tempat tinggal anda yang disalin daripada profil, dan pasport yang digunakan oleh kumpulan anda', 'Anda, dalam perancang perjalanan', 'Menulis rancangan dan kad syarat kemasukan', 'Dalam pelayar anda semasa anda merancang, kemudian dalam pangkalan data kami bersama perjalanan itu dan bersama setiap larian penulis rancangan'],
            ['Tempahan yang anda pilih untuk tambah', 'Alamat hotel dan tarikh daftar masuk, nombor penerbangan, laluan dan masa, dan dalam rancangan yang diimport, apa-apa nombor rujukan tempahan dan pautan urus tempahan yang terkandung di dalamnya', 'Anda, dalam perancang perjalanan atau dengan menampal rancangan untuk diimport', 'Menyusun rancangan mengikut apa yang sudah anda tempah, dan memaparkannya pada halaman perjalanan', 'Dalam pangkalan data kami bersama perjalanan itu'],
            ['Teks bebas', 'Catatan, perkara yang mesti dibuat, perkara yang mahu dielakkan, hasil carian yang ditampal dan keperluan pemakanan', 'Anda, jika anda memilih untuk menulisnya', 'Membentuk rancangan, contohnya memilih restoran yang menepati keperluan pemakanan', 'Dalam pangkalan data kami bersama permintaan perjalanan'],
            ['Rancangan', 'Hari, aktiviti, tempat, alamat, masa, kos, penerbangan, tempat menginap, senarai semak tempahan dan kredit foto', 'Model AI, suntingan anda, suntingan orang yang anda jemput, atau rancangan yang anda import', 'Halaman perjalanan, papan pemuka, kad taklimat dan eksport PDF', 'Dalam pangkalan data kami. Salinan perjalanan terbaru anda disimpan dalam pelayar untuk kegunaan tanpa sambungan.'],
            ['Kolaborator', 'Alamat e-mel setiap orang yang anda jemput, sama ada mereka boleh melihat atau menyunting, dan id akaun mereka sebaik sahaja mereka membuka perjalanan itu', 'Anda, tentang orang lain', 'Memberi orang itu akses kepada satu perjalanan apabila mereka log masuk dengan alamat tersebut', 'Dalam pangkalan data kami bersama perjalanan itu'],
            ['Pautan kongsi', 'Kod rawak bagi setiap perjalanan yang anda kongsi, dengan siapa yang membuatnya dan bila', 'Dibuat apabila anda menekan Share (kongsi)', 'Membolehkan sesiapa yang mempunyai pautan itu membaca salinan ringkas perjalanan tanpa log masuk', 'Dalam pangkalan data kami'],
            ['Suntingan melalui sembang', 'Mesej yang anda taip kepada penyunting jadual perjalanan, sehingga 500 aksara, dan hari-hari perjalanan yang berkenaan', 'Anda, pada halaman perjalanan', 'Mengubah aktiviti melalui sembang', 'Tidak disimpan oleh Trippy. Mesej itu dihantar kepada model AI dan jawapannya dipulangkan ke halaman anda. Penyedia model mengendalikannya mengikut termanya sendiri.'],
            ['Tanda semak', 'Perkara yang anda tandakan dalam persediaan perjalanan, senarai semak tempahan dan syarat kemasukan, serta kumpulan bandar dalam tab Discover', 'Ketikan anda pada halaman perjalanan', 'Mengingati apa yang sudah anda selesaikan', 'Dalam pelayar anda sahaja. Ia tidak pernah dihantar ke pelayan kami.'],
            ['Kiraan penggunaan', 'Bilangan permintaan sembang dan permintaan pilihan lain yang dibuat oleh akaun anda setiap hari, dan rekod setiap larian penulisan rancangan dengan statusnya serta apa-apa ralat', 'Pelayan kami, apabila anda menggunakan ciri tersebut', 'Had harian yang membolehkan perkhidmatan ini kekal percuma, dan menyambung semula rancangan yang terganggu', 'Dalam pangkalan data kami'],
            ['Log diagnostik', 'Mesej ralat dan amaran, fail dan baris tempat kerosakan berlaku, id akaun anda, id perjalanan, jenis pelayar anda dan masanya. Amaran tentang carian yang gagal boleh mengandungi nama tempat atau kata carian. Sesetengah entri merekodkan bahawa pautan tempahan telah dibuka, bersama perjalanan dan laman tempahannya.', 'Pelayar anda dan pelayan kami, secara automatik', 'Mencari dan membaiki kerosakan', 'Dalam pangkalan data kami, dan hanya boleh dibaca oleh akaun yang mempunyai peranan pentadbir'],
            ['Kebenaran pemberitahuan', 'Sama ada anda membenarkan Trippy memberitahu anda apabila rancangan siap', 'Jawapan anda kepada pertanyaan pelayar', 'Memaparkan pemberitahuan pada peranti itu semasa Trippy terbuka dalam tab atau di latar belakang', 'Dalam pelayar anda sahaja. Trippy tidak menghantar mesej tolak dan tidak menyimpan rekod kebenaran itu pada pelayannya.'],
        ]),
        { type: 'subheading', text: 'Apa yang kami tidak kumpul' },
        {
          type: 'list',
          items: [
            'Nombor pasport, nombor kad pengenalan, tarikh lahir atau butiran kad pembayaran. Trippy tidak pernah memintanya. Kewarganegaraan pasport ialah nama negara, bukan nombor dokumen.',
            'Foto daripada anda. Tiada ciri muat naik. Foto perjalanan dicari oleh pelayan kami berdasarkan nama tempat dalam rancangan.',
            'Lokasi tepat anda. Trippy tidak bertanya kepada peranti anda di mana anda berada.',
            'Pembayaran. Trippy percuma dan tiada apa-apa yang dibeli atau ditempah melaluinya.',
          ],
        },
        { type: 'subheading', text: 'Butiran sensitif dalam teks bebas' },
        { type: 'p', text: 'Ruang keperluan pemakanan dan ruang catatan menerima apa sahaja yang anda taip. Keperluan pemakanan boleh mendedahkan sesuatu tentang kesihatan atau agama anda. Apa-apa yang anda tulis di situ disimpan bersama perjalanan dan dihantar kepada model AI tepat seperti yang ditaip, jadi tulis hanya apa yang diperlukan oleh rancangan, dan jangan masukkan nama, nombor dokumen dan butiran perubatan.' },
        { type: 'subheading', text: 'Data teknikal yang dilihat oleh perkhidmatan lain' },
        { type: 'p', text: 'Apabila pelayar anda memuatkan Trippy, ia turut mengambil fon, jubin peta, bendera, logo dan foto daripada hos lain. Setiap hos itu melihat alamat IP dan jenis pelayar anda, sama seperti mana-mana laman web. Semuanya disenaraikan di bawah [Siapa yang menerima data anda](#/privacy/service-providers).' },
      ],
    },
    {
      id: 'other-people',
      heading: 'Data orang lain yang anda berikan kepada kami',
      blocks: [
        { type: 'p', text: 'Dua ciri melibatkan orang selain anda.' },
        {
          type: 'defs',
          rows: [
            { term: 'Teman perjalanan', text: ['Permintaan perjalanan mengandungi bilangan pengembara dan pasport yang digunakan oleh kumpulan itu, dalam bentuk senarai negara. Trippy tidak meminta nama teman perjalanan atau apa-apa lagi tentang mereka.', 'Sebelum anda memasukkan kewarganegaraan teman perjalanan, pastikan mereka bersetuju anda berbuat demikian bagi tujuan menyemak syarat kemasukan.'] },
            { term: 'Kolaborator', text: ['Untuk menjemput seseorang ke sesuatu perjalanan, anda menaip alamat e-melnya. Trippy menyimpannya bersama perjalanan itu dan memaparkannya kepada anda dan kepada orang tersebut. Trippy tidak menghantar e-mel kepadanya. Dia mendapat akses apabila log masuk ke Trippy dengan akaun Google yang menggunakan alamat itu.', 'Jemput hanya orang yang sudah bersetuju untuk dijemput, dan beritahu mereka bahawa Trippy akan menyimpan alamat e-mel mereka bagi tujuan ini. Anda boleh membuang kolaborator pada halaman perjalanan, dan alamat yang disimpan untuk perjalanan itu akan dipadam.'] },
          ],
        },
        { type: 'p', text: 'Jika anda salah seorang daripada mereka dan mahu butiran anda dibuang, tulis kepada wakil perlindungan data kami: {dpoEmail}.' },
      ],
    },
    {
      id: 'consent',
      heading: 'Persetujuan',
      blocks: [
        { type: 'p', text: 'Kami mengumpul, menggunakan dan mendedahkan data peribadi anda hanya dengan persetujuan anda, atau apabila PDPA atau undang-undang lain membenarkan atau menghendakinya tanpa persetujuan.' },
        { type: 'subheading', text: 'Cara anda memberikan persetujuan' },
        {
          type: 'list',
          items: [
            '**Apabila anda membuat akaun.** Dengan menekan Sign in with Google, anda bersetuju dengan pengumpulan identiti akaun anda, serta kiraan penggunaan dan log diagnostik yang direkodkan oleh aplikasi semasa anda menggunakannya, bagi tujuan yang disenaraikan di atas.',
            '**Apabila anda menggunakan sesuatu ciri.** Dasar ini menyenaraikan kegunaan setiap jawapan. Apabila anda mengisi profil, menghantar permintaan perjalanan, menjemput kolaborator atau membuat pautan kongsi, anda bersetuju maklumat itu digunakan untuk ciri tersebut, termasuk dihantar kepada penyedia yang diperlukan oleh ciri itu.',
            '**Apabila pelayar anda bertanya.** Pemberitahuan dimatikan sehingga anda membenarkannya apabila ditanya oleh pelayar.',
          ],
        },
        { type: 'subheading', text: 'Persetujuan yang dianggap telah diberikan' },
        { type: 'p', text: 'Dalam beberapa keadaan, PDPA menganggap anda telah memberikan persetujuan tanpa permintaan yang berasingan (deemed consent). Dua daripadanya terpakai kepada Trippy.' },
        {
          type: 'list',
          items: [
            '**Melalui perbuatan.** Apabila anda memberikan maklumat secara sukarela bagi tujuan yang jelas daripada konteksnya, misalnya menaip keperluan pemakanan supaya rancangan sesuai dengan anda, anda dianggap bersetuju maklumat itu digunakan bagi tujuan tersebut.',
            '**Kerana keperluan kontrak.** Apabila anda meminta Trippy melakukan sesuatu yang hanya dapat dilakukan dengan menyerahkan data anda kepada penyedia, misalnya menyimpan perjalanan di Supabase atau menghantar permintaan perjalanan kepada model AI untuk ditulis, anda dianggap bersetuju dengan pendedahan itu dan dengan penggunaan data tersebut oleh penyedia untuk melaksanakan tugas itu.',
          ],
        },
        { type: 'p', text: 'Kami tidak bergantung pada persetujuan yang dianggap diberikan melalui pemberitahuan. Jika kami mahu menggunakan data anda bagi tujuan baharu, kami akan bertanya kepada anda dahulu.' },
        { type: 'subheading', text: 'Apa yang wajib dan apa yang pilihan' },
        {
          type: 'defs',
          rows: [
            { term: 'Wajib', text: 'Akaun Google, yang membekalkan alamat e-mel, nama dan gambar anda. Untuk sesuatu rancangan, permintaan perjalanan sekurang-kurangnya memerlukan destinasi anda, bila atau berapa lama, dan bilangan orang yang pergi.' },
            { term: 'Pilihan', text: 'Kewarganegaraan pasport dan pasport teman perjalanan, keperluan pemakanan, catatan, perkara yang mesti dibuat, perkara yang mahu dielakkan, hasil carian yang ditampal, hotel yang sudah ditempah, penerbangan yang sudah ditempah, pilihan penerbangan dan penginapan, kolaborator, pautan kongsi dan pemberitahuan. Jika anda tidak mengisinya, rancangan kurang disesuaikan dengan anda atau ada ciri yang tidak anda gunakan. Anda masih boleh menggunakan Trippy.' },
          ],
        },
        { type: 'p', text: 'Kami tidak meminta lebih daripada yang diperlukan oleh sesuatu ciri, dan kami tidak menjadikan persetujuan terhadap perkara lain sebagai syarat untuk menggunakan Trippy.' },
        { type: 'subheading', text: 'Mesej pemasaran' },
        { type: 'p', text: 'Trippy tidak menghantar e-mel, mesej teks atau panggilan pemasaran. Aplikasi ini tidak menghantar apa-apa e-mel langsung. Kami menulis kepada anda hanya untuk menjawab permintaan anda atau tentang perkara yang wajib kami maklumkan, seperti pelanggaran data atau penutupan akaun anda.' },
      ],
    },
    {
      id: 'withdrawal',
      heading: 'Menarik balik persetujuan',
      blocks: [
        { type: 'p', text: 'Anda boleh menarik balik persetujuan anda terhadap pengumpulan, penggunaan atau pendedahan data peribadi anda pada bila-bila masa, bagi satu tujuan atau bagi kesemuanya. Menarik balik persetujuan tidak dikenakan bayaran.' },
        { type: 'subheading', text: 'Cara menarik balik' },
        {
          type: 'defs',
          rows: [
            { term: 'Dalam aplikasi', text: ['Buang kolaborator, atau tekan Stop sharing (henti berkongsi), pada halaman perjalanan.', 'Padam perjalanan dari papan pemuka atau halaman perjalanan. Padam semua perjalanan anda dalam Settings, di bawah Data.', 'Tetapkan kewarganegaraan pasport anda kepada Not set (tidak ditetapkan), atau tukar nama dan bandar tempat tinggal anda, dalam Settings, di bawah You.', 'Kosongkan salinan yang disimpan pada peranti anda dalam Settings, di bawah Data, atau log keluar.', 'Matikan pemberitahuan bagi laman ini dalam tetapan pelayar anda.'] },
            { term: 'Dengan menulis kepada kami', text: 'Bagi apa-apa yang tidak dapat dilakukan dalam aplikasi, termasuk memadam akaun anda, tulis kepada wakil perlindungan data kami: {dpoEmail}. Nyatakan penggunaan data yang mana satu yang anda mahu dihentikan.' },
          ],
        },
        { type: 'subheading', text: 'Tempoh yang diperlukan' },
        { type: 'p', text: 'Kawalan dalam aplikasi berkuat kuasa serta-merta. Permintaan bertulis memerlukan notis yang munasabah supaya kami dapat bertindak. Lazimnya kami akan melaksanakannya dalam masa 10 hari bekerja selepas menerimanya, dan jika kami memerlukan masa yang lebih lama, kami akan memberitahu anda sebabnya dan bila ia akan selesai.' },
        { type: 'subheading', text: 'Apa yang berlaku apabila anda menarik balik persetujuan' },
        { type: 'p', text: 'Apabila kami menerima permintaan anda, kami akan memberitahu anda kesan penarikan balik itu supaya anda dapat membuat keputusan dengan maklumat yang lengkap. Ringkasnya, bagi setiap perkara yang persetujuannya boleh ditarik balik:' },
        facts([], [
            ['Penyimpanan identiti akaun anda oleh kami', 'Anda tidak lagi dapat log masuk. Kami memadam akaun, profil dan perjalanan milik anda.'],
            ['Penghantaran permintaan perjalanan kepada model AI', 'Trippy tidak dapat menulis rancangan baharu, mencadangkan pilihan lain atau menyunting melalui sembang untuk anda. Anda masih boleh membaca perjalanan sedia ada dan mengimport rancangan yang ditulis di tempat lain.'],
            ['Penyimpanan kewarganegaraan pasport anda oleh kami', 'Kad syarat kemasukan tidak lagi dapat memberitahu anda apa yang diperlukan oleh pasport anda.'],
            ['Penyimpanan bandar tempat tinggal dan mata wang anda oleh kami', 'Rancangan tidak lagi bermula dari bandar tempat tinggal anda, dan harga tidak dipaparkan dalam mata wang anda.'],
            ['Perkongsian perjalanan', 'Pautan itu tidak lagi berfungsi bagi semua orang yang memilikinya, atau kolaborator itu kehilangan akses.'],
            ['Log diagnostik tentang akaun anda', 'Kami memutuskan kaitan antara entri log sedia ada dengan akaun anda. Aplikasi menulis log selagi anda log masuk, jadi untuk menghentikan log baharu, akaun itu perlu ditutup.'],
        ]),
        { type: 'p', text: 'Sebaik sahaja anda menarik balik persetujuan, kami menghentikan penggunaan yang anda bantah dan memberitahu penyedia yang memproses data itu bagi pihak kami supaya turut berhenti. Kami tidak dapat mengambil semula permintaan perjalanan yang sudah diterima oleh model AI.' },
        { type: 'subheading', text: 'Apa yang tidak berubah selepas penarikan balik' },
        { type: 'p', text: 'Menarik balik persetujuan tidak membatalkan apa yang telah dilakukan dengan data anda sebelum itu. Ia juga tidak menghalang kami daripada menyimpan atau menggunakan data peribadi apabila PDPA atau undang-undang bertulis yang lain menghendaki atau membenarkannya tanpa persetujuan, contohnya untuk menyiasat pelanggaran terma kami, menjawab permintaan yang sah daripada pihak berkuasa, atau menguruskan tuntutan undang-undang.' },
      ],
    },
    {
      id: 'access-and-correction',
      heading: 'Melihat dan membetulkan data anda',
      blocks: [
        { type: 'subheading', text: 'Dalam aplikasi' },
        { type: 'p', text: 'Kebanyakan data tentang anda yang disimpan oleh Trippy boleh dilihat pada skrin. Profil anda ada dalam Settings, di bawah You dan di bawah Money and units, dan anda boleh mengubahnya di situ. Akaun yang sedang anda gunakan ditunjukkan di bawah Account. Setiap perjalanan, bersama rancangan, kolaborator dan pautan kongsinya, ada pada halaman perjalanannya, dan anda boleh menyuntingnya di situ. Perjalanan yang disimpan pada peranti anda disenaraikan dalam Settings, di bawah Data. Aplikasi tidak memaparkan permintaan perjalanan seperti yang disimpan, kiraan penggunaan atau log diagnostik. Minta daripada kami jika anda mahu melihatnya.' },
        { type: 'p', text: 'Nama dan gambar anda datang daripada akaun Google anda. Untuk menukar gambar, tukar di Google. Nama yang dipaparkan oleh Trippy boleh ditukar dalam Settings.' },
        { type: 'subheading', text: 'Melalui permintaan' },
        { type: 'p', text: 'Anda berhak meminta daripada kami data peribadi tentang anda yang kami simpan, dan maklumat tentang cara kami menggunakan atau mendedahkannya dalam tempoh setahun sebelum permintaan anda. Anda juga berhak meminta kami membetulkan kesilapan atau maklumat yang tertinggal. Tulis kepada wakil perlindungan data kami: {dpoEmail}.' },
        {
          type: 'defs',
          rows: [
            { term: 'Berapa cepat kami menjawab', text: 'Secepat yang semunasabahnya boleh. Jika kami tidak dapat memberikan akses, atau membuat pembetulan, dalam masa 30 hari selepas permintaan anda, kami akan memberitahu anda dalam tempoh 30 hari itu bila kami dapat melakukannya.' },
            { term: 'Kosnya', text: 'Tiada. Kami tidak mengenakan bayaran untuk akses atau pembetulan.' },
            { term: 'Mengesahkan identiti anda', text: 'Kami mungkin meminta anda menulis daripada, atau membuat pengesahan melalui, alamat e-mel akaun anda sebelum kami menyerahkan apa-apa.' },
            { term: 'Apabila kami membuat pembetulan', text: 'Kami membuat pembetulan secepat yang boleh dilaksanakan dan menghantar data yang telah dibetulkan kepada setiap organisasi yang menerima data itu daripada kami dalam tempoh setahun sebelumnya, melainkan organisasi itu tidak lagi memerlukannya.' },
            { term: 'Apabila kami mungkin menolak', text: 'Dalam keadaan tertentu, PDPA membenarkan atau menghendaki kami menolak, contohnya apabila pemberian akses akan mendedahkan data peribadi orang lain atau apabila permintaan itu remeh atau bersifat menyusahkan. Jika kami menolak, kami akan memberitahu anda dan menyimpan salinan data yang berkenaan selama sekurang-kurangnya 30 hari supaya anda boleh meminta keputusan itu disemak semula. Jika kami menolak sesuatu pembetulan, kami akan mencatatkan pada rekod itu pembetulan yang anda minta.' },
          ],
        },
        { type: 'p', text: 'PDPA juga memperuntukkan hak untuk meminta data anda dihantar kepada organisasi lain. Pada tarikh dasar ini, bahagian undang-undang itu belum dikuatkuasakan. Buat sementara ini, anda boleh mengeksport mana-mana perjalanan sebagai PDF dari halaman perjalanannya.' },
      ],
    },
    {
      id: 'accuracy',
      heading: 'Memastikan data anda tepat',
      blocks: [
        { type: 'p', text: 'Kami mengambil langkah yang munasabah untuk memastikan data peribadi tepat dan lengkap apabila kami menggunakannya untuk membuat keputusan yang memberi kesan kepada anda atau menyerahkannya kepada pihak lain. Pada praktiknya, hampir kesemuanya datang terus daripada anda atau daripada akaun Google anda, dan Trippy menggunakannya seperti yang diberikan.' },
        { type: 'p', text: 'Sebab itu peranan anda penting. Kad syarat kemasukan hanya betul bagi pasport yang anda masukkan, dan sesuatu rancangan hanya betul bagi tarikh dan tempat yang anda berikan. Pastikan profil anda terkini, dan betulkan permintaan perjalanan jika rancangan anda berubah.' },
      ],
    },
    {
      id: 'protection',
      heading: 'Cara kami melindungi data anda',
      blocks: [
        { type: 'p', text: 'Kami menggunakan langkah keselamatan yang munasabah untuk mencegah akses, pengumpulan, penggunaan, pendedahan, penyalinan, pengubahan dan pelupusan tanpa kebenaran, serta kehilangan data. Inilah langkah yang sedang digunakan.' },
        {
          type: 'list',
          items: [
            '**Sambungan yang disulitkan.** Laman ini dan setiap permintaan kepada pangkalan data, perkhidmatan log masuk dan fungsi pelayan kami dihantar melalui HTTPS.',
            '**Tiada kata laluan disimpan oleh Trippy.** Log masuk hanya melalui Google. Google menyemak kata laluan anda dan memberitahu kami siapa anda.',
            '**Peraturan akses dalam pangkalan data.** Setiap jadual mempunyai peraturan pada peringkat baris: sesuatu akaun hanya boleh membaca dan mengubah profil dan perjalanannya sendiri, serta perjalanan yang ia dijemput untuk sertai, mengikut peranan yang diberikan kepadanya.',
            '**Semakan pada pelayan.** Fungsi yang menulis rancangan, menjawab suntingan melalui sembang dan mencari foto hanya menerima permintaan daripada akaun yang sudah log masuk, dan penulis rancangan serta penyunting sembang mempunyai had harian.',
            '**Pautan kongsi yang diringkaskan.** Pautan kongsi memaparkan salinan perjalanan yang dikurangkan isinya. Lihat [Pautan kongsi dan kolaborator](#/privacy/shared-links).',
            '**Kunci tidak disimpan pada peranti anda.** Kunci bagi perkhidmatan AI dan foto disimpan pada pelayan. Pelayar anda tidak pernah menerimanya.',
            '**Pentadbiran yang terhad.** Selain orang yang anda kongsikan perjalanan dengannya, hanya akaun yang diberi peranan pentadbir oleh pengendali boleh membaca profil, perjalanan dan log diagnostik anda. Pengendali juga boleh mencapai pangkalan data melalui konsol penyedia itu sendiri. Kami menggunakan akses itu hanya untuk membaiki kerosakan, menjawab permintaan anda dan menguatkuasakan terma kami.',
          ],
        },
        { type: 'subheading', text: 'Batasan yang perlu anda tahu' },
        {
          type: 'list',
          items: [
            'Sesi log masuk anda, dan salinan perjalanan yang disimpan untuk kegunaan tanpa sambungan, disimpan dalam pelayar anda tanpa disulitkan, seperti yang lazim bagi aplikasi web. Pada peranti yang dikongsi atau dipinjam, log keluar apabila selesai. Log keluar membuang sesi, ringkasan profil dan perjalanan luar talian daripada peranti itu.',
            'Foto perjalanan yang disalin oleh pelayan kami daripada sumber berlesen disimpan dalam storan fail awam. Ia gambar tempat, bukan gambar anda, dan storan itu tidak boleh disemak imbas, tetapi sesiapa yang mempunyai alamat sesuatu foto boleh membukanya.',
            'Pautan kongsi berfungsi bagi sesiapa sahaja yang memilikinya, jadi hantar hanya kepada orang yang anda percayai dengan rancangan itu.',
            'Tiada kaedah penyimpanan atau penghantaran yang selamat sepenuhnya. Kami tidak dapat berjanji bahawa pelanggaran tidak akan berlaku. Bahagian tentang [pelanggaran data](#/privacy/breach) menerangkan tindakan kami jika ia berlaku.',
          ],
        },
      ],
    },
    {
      id: 'retention',
      heading: 'Berapa lama kami menyimpan data anda',
      blocks: [
        { type: 'p', text: 'Kami menyimpan data peribadi hanya selagi tujuan asal pengumpulannya masih memerlukannya, atau selagi ada sebab undang-undang atau perniagaan yang menghendakinya. Selepas itu kami memadamnya atau membuang apa yang mengaitkannya dengan anda. Setiap jenis data di bawah disimpan sehingga berlakunya perkara yang dinyatakan di sebelahnya.' },
        facts([], [
            ['Identiti akaun dan profil', 'Akaun anda dipadam.'],
            ['Perjalanan, bersama permintaan, rancangan, kolaborator dan pautan kongsinya', 'Anda memadam perjalanan itu, atau akaun anda dipadam. Memadam perjalanan turut memadam larian penulisan rancangannya, kolaboratornya dan pautan kongsinya.'],
            ['Pautan kongsi', 'Anda menekan Stop sharing, atau perjalanan itu dipadam. Pautan tidak mempunyai tarikh luput sendiri.'],
            ['Alamat e-mel kolaborator', 'Anda membuang kolaborator itu, atau perjalanan itu dipadam.'],
            ['Mesej suntingan melalui sembang', 'Tidak disimpan oleh Trippy. Mesej itu hilang daripada aplikasi apabila anda menutup halaman.'],
            ['Kiraan penggunaan harian', 'Kira-kira 7 hari selagi anda terus menggunakan ciri itu: kiraan yang lebih lama daripada itu dibuang apabila akaun anda menggunakannya lagi. Kiraan yang tertinggal selepas anda berhenti dibuang oleh kami apabila kami memadam akaun anda.'],
            ['Log diagnostik', 'Belum ada tarikh luput automatik. Kami memadam entri secara manual apabila ia tidak lagi diperlukan untuk mencari kerosakan. Apabila perjalanan atau akaun dipadam, entrinya kekal dengan medan akaun dan perjalanan dikosongkan. Teks mesej, yang boleh mengandungi id perjalanan, dan jenis pelayar kekal sehingga entri itu dipadam.'],
            ['Foto perjalanan yang disalin oleh pelayan kami', 'Foto itu mungkin kekal selepas perjalanan dipadam, difailkan di bawah id perjalanan. Ia foto tempat yang telah diterbitkan dan tidak menyatakan apa-apa tentang anda.'],
            ['Sesi, ringkasan profil dan perjalanan luar talian dalam pelayar anda', 'Anda log keluar, atau mengosongkannya dalam Settings di bawah Data.'],
            ['Pilihan, tanda semak dan kumpulan bandar dalam pelayar anda', 'Anda mengosongkan data laman dalam pelayar anda. Memadam semua perjalanan anda dalam Settings turut membuang tanda semaknya.'],
            ['Permintaan perjalanan yang sedang diisi', 'Anda menutup tab pelayar.'],
        ]),
        { type: 'subheading', text: 'Memadam perjalanan' },
        { type: 'p', text: 'Padam satu perjalanan dari papan pemuka atau dari halaman perjalanannya. Padam setiap perjalanan milik anda dalam Settings, di bawah Data. Pemadaman berlaku serta-merta dan tidak boleh dibatalkan. Perjalanan yang dikongsi oleh orang lain dengan anda ialah milik mereka dan tidak terjejas.' },
        { type: 'subheading', text: 'Memadam akaun anda' },
        { type: 'p', text: 'Buat masa ini tiada butang untuk ini dalam aplikasi. Tulis kepada wakil perlindungan data kami daripada alamat e-mel akaun anda: {dpoEmail}. Kami akan memadam akaun, profil anda, setiap perjalanan milik anda dan kiraan penggunaan anda, serta membuang id akaun anda daripada log diagnostik. Kami melakukannya secara manual, dan akan mengesahkannya apabila selesai.' },
        { type: 'p', text: 'Jika anda log masuk semula dengan akaun Google yang sama selepas itu, akaun baharu yang kosong akan dibuat. Untuk menghalang Google daripada menawarkan Trippy sebagai aplikasi yang disambungkan, buang Trippy dalam tetapan akaun Google anda.' },
        { type: 'subheading', text: 'Sandaran dan penahanan atas sebab undang-undang' },
        { type: 'p', text: 'Data yang dipadam mungkin kekal dalam sandaran penyedia pangkalan data kami sehingga sandaran itu luput. Kami mungkin menyimpan data tertentu lebih lama apabila undang-undang menghendakinya atau apabila kami memerlukannya untuk sesuatu pertikaian atau siasatan, dan hanya selama perkara itu berlangsung.' },
      ],
    },
    {
      id: 'service-providers',
      heading: 'Siapa yang menerima data anda',
      blocks: [
        { type: 'p', text: 'Kami tidak menjual data peribadi, menyewakannya atau memberikannya kepada pengiklan. Namun Trippy bergantung pada perkhidmatan lain untuk berfungsi, dan setiap satunya menerima hanya apa yang diperlukan oleh tugasnya. Senarai pertama ialah perkhidmatan yang menerima data daripada pelayan kami. Senarai kedua ialah hos yang dihubungi oleh pelayar anda sendiri semasa anda menggunakan Trippy.' },
        facts(['Menerima:'], [
            ['Supabase', 'Mengehos log masuk, pangkalan data, storan fail dan fungsi pelayan', 'Segala-galanya dalam akaun anda: identiti daripada Google, profil, perjalanan, alamat e-mel kolaborator, pautan kongsi, kiraan penggunaan dan log'],
            ['Google, untuk log masuk', 'Mengesahkan siapa anda apabila anda menekan Sign in with Google', 'Anda log masuk pada halaman Google sendiri. Google tahu bahawa anda menggunakan Trippy dan menghantar alamat e-mel, nama dan gambar anda kepada perkhidmatan log masuk kami.'],
            ['Google Gemini', 'Model AI utama. Ia menulis rancangan, menjawab suntingan melalui sembang, mencadangkan pilihan lain dan menyemak calon foto.', 'Permintaan perjalanan: destinasi, tarikh, hari cuti, bilangan pengembara, belanjawan, bandar berlepas dan negara tempat tinggal, pilihan penginapan, alamat hotel yang ditempah dan tarikh daftar masuk, nombor, laluan dan masa penerbangan yang ditempah, minat, dan teks bebas anda termasuk keperluan pemakanan. Bagi suntingan melalui sembang, mesej anda dan aktiviti perjalanan itu. Bagi foto, nama tempat dan calon gambar.'],
            ['Mistral AI', 'Model AI sandaran, digunakan untuk sesuatu rancangan hanya jika Gemini gagal', 'Permintaan perjalanan yang sama seperti Gemini'],
            ['Serper dan Tavily', 'Carian foto, melalui tempat di Google Maps dan carian imej web, digunakan apabila sumber berlesen tidak menemui apa-apa', 'Nama tempat, bandar dan koordinat peta daripada rancangan. Hotel yang anda namakan dalam permintaan boleh menjadi salah satu tempat itu.'],
            ['Wikimedia (Wikipedia, Wikimedia Commons, Wikidata), Openverse, Pexels dan Mapillary', 'Foto berlesen bagi tempat dan lokasi', 'Nama tempat dan lokasi serta koordinat peta'],
            ['Overpass, perkhidmatan carian bagi data OpenStreetMap', 'Mencari lokasi berhampiran sesuatu tempat', 'Nama tempat dan koordinat peta'],
            ['Photon oleh Komoot', 'Carian tempat dan menamakan bandar tempat sesuatu lokasi berada', 'Nama tempat yang anda cari dan koordinat peta lokasi'],
            ['Penghala awam OSRM', 'Arah berjalan kaki apabila anda menyunting aktiviti', 'Dua set koordinat peta'],
            ['GitHub Pages', 'Mengehos fail laman web Trippy', 'Permintaan halaman anda. Tiada data akaun disimpan di sana.'],
        ]),
        { type: 'subheading', text: 'Apa yang tidak diterima oleh model AI' },
        { type: 'p', text: 'Nama, alamat e-mel, id akaun, kewarganegaraan pasport dan nombor rujukan tempahan anda tidak termasuk dalam apa yang dihantar oleh Trippy kepada Gemini atau Mistral. Teks bebas ialah pengecualiannya: ia dihantar tepat seperti yang anda taip, jadi apa-apa perkara peribadi yang anda tulis di situ turut dihantar.' },
        { type: 'p', text: 'Google dan Mistral mengendalikan apa yang mereka terima mengikut terma mereka sendiri untuk pembangun. Terma itulah yang menentukan berapa lama mereka menyimpannya dan sama ada mereka boleh menggunakannya untuk menambah baik perkhidmatan mereka. Kami tidak mempunyai kawalan ke atas terma itu selain memilih penyedianya. Anggaplah permintaan perjalanan sebagai sesuatu yang mungkin disimpan oleh penyedia dan dibaca oleh kakitangannya, dan jangan masukkan butiran sensitif ke dalamnya.' },
        facts(['Melihat:'], [
            ['Google Fonts', 'Muka taip aplikasi', 'Alamat IP dan jenis pelayar anda'],
            ['Pelayan jubin OpenStreetMap', 'Peta pada halaman perjalanan', 'Alamat IP, jenis pelayar dan kawasan peta yang anda lihat'],
            ['Photon oleh Komoot, Open-Meteo dan Wikipedia', 'Carian bandar, zon waktu dan foto pengepala apabila anda menaip nama bandar dalam perancang perjalanan', 'Nama bandar yang anda taip dan alamat IP anda. Komoot juga menerima koordinat tempat dalam perjalanan apabila tab Discover mengumpulkannya mengikut bandar.'],
            ['flagcdn.com', 'Imej bendera', 'Alamat IP anda dan bendera yang dipaparkan'],
            ['Pelayan imej Wikimedia', 'Foto destinasi', 'Alamat IP anda dan foto yang dipaparkan'],
            ['Pelayan imej Aviasales', 'Logo syarikat penerbangan pada kad penerbangan', 'Alamat IP anda dan kod syarikat penerbangan'],
            ['Hos foto tempat yang ditemui melalui Google Maps atau web, dan hos imej Google bagi gambar profil anda', 'Foto-foto itu, dimuatkan dari tempat ia diterbitkan', 'Alamat IP anda dan foto yang dimuatkan'],
        ]),
        { type: 'p', text: 'Hos-hos ini mungkin meletakkan kuki mereka sendiri pada domain mereka sendiri. Trippy tidak dapat membacanya.' },
        { type: 'subheading', text: 'Pautan yang anda pilih untuk ikuti' },
        { type: 'p', text: 'Halaman perjalanan menawarkan pautan ke Booking.com, Trip.com, Skyscanner, Google Search, Google Maps dan Rome2Rio. Tiada apa-apa dihantar sehingga anda menekan salah satu daripadanya. Pautan itu kemudian membawa apa yang diperlukan oleh carian, seperti nama penginapan atau bandar, tarikh anda, bilangan orang dewasa atau koordinat peta. Apa yang anda lakukan di laman tersebut tertakluk kepada dasar privasi mereka, bukan dasar ini.' },
        { type: 'subheading', text: 'Pendedahan lain' },
        { type: 'p', text: 'Kami mungkin mendedahkan data peribadi tanpa persetujuan anda apabila PDPA atau undang-undang lain menghendaki atau membenarkannya, contohnya sebagai jawapan kepada perintah mahkamah atau permintaan yang sah daripada agensi awam di Singapura. Jika Trippy diserahkan kepada pengendali baharu, data anda akan berpindah kepada mereka di bawah dasar ini, dan kami akan memberitahu anda terlebih dahulu supaya anda boleh memadam akaun anda sebelum itu.' },
      ],
    },
    {
      id: 'transfer',
      heading: 'Pemindahan ke luar Singapura',
      blocks: [
        { type: 'p', text: 'Trippy tidak mempunyai pelayan sendiri. Penyedia yang disenaraikan di atas menyimpan dan memproses data anda pada sistem mereka sendiri, dan sebahagian sistem itu berada di luar Singapura. Negara-negara itu boleh termasuk Amerika Syarikat dan negara-negara Kesatuan Eropah.' },
        { type: 'p', text: 'PDPA membenarkan kami menghantar data peribadi ke luar Singapura hanya jika kami mengambil langkah yang sewajarnya untuk memastikan data itu dilindungi di sana pada tahap yang setanding dengan PDPA, melainkan ada pengecualian dalam undang-undang yang terpakai. Bagi penyedia yang menyimpan akaun anda atau menerima permintaan perjalanan anda, iaitu Supabase, Google dan Mistral, kami bergantung pada terma yang mengikat penyedia itu sendiri, termasuk terma pemprosesan data jika ditawarkan, dan pada hakikat bahawa pemindahan itu perlu untuk melaksanakan apa yang anda minta daripada Trippy. Kami tidak dapat berjanji bahawa setiap negara yang digunakan oleh sesuatu penyedia mempunyai undang-undang seperti PDPA.' },
        { type: 'p', text: 'Perkhidmatan foto, tempat dan laluan hanya menerima nama tempat dan koordinat peta, tanpa apa-apa yang mengenal pasti akaun anda.' },
        { type: 'p', text: 'Jika anda bertanya, kami akan memberitahu apa yang kami tahu tentang tempat sesuatu penyedia menyimpan data anda dan terma yang mengikatnya.' },
        { type: 'p', text: 'Fon, jubin peta, bendera dan foto diambil oleh pelayar anda sendiri terus daripada hosnya, yang boleh berada di mana-mana sahaja di dunia. Hos itu melihat alamat IP anda dan mengendalikannya mengikut dasar privasi mereka sendiri.' },
      ],
    },
    {
      id: 'shared-links',
      heading: 'Pautan kongsi dan kolaborator',
      blocks: [
        {
          type: 'defs',
          rows: [
            { term: 'Pautan kongsi', text: ['Sesiapa yang mempunyai pautan itu boleh membaca perjalanan tanpa log masuk. Mereka melihat tajuk, tarikh, bilangan pengembara, mata wang, nama, kawasan dan julat harga setiap penginapan, serta hari-hari bersama aktivitinya.', 'Mereka tidak melihat penerbangan, nombor rujukan tempahan, pautan urus tempahan, alamat penginapan, senarai semak tempahan, permintaan perjalanan anda atau nama anda. Pautan itu berfungsi sehingga anda menekan Stop sharing.'] },
            { term: 'Kolaborator', text: ['Orang yang anda jemput melalui e-mel melihat keseluruhan perjalanan apabila log masuk. Ini termasuk penerbangan, penginapan dan apa-apa nombor rujukan tempahan di dalamnya, serta permintaan perjalanan itu sendiri, dengan catatan anda, keperluan pemakanan dan pasport kumpulan itu. Penyunting juga boleh mengubah rancangan. Orang yang dijemput boleh melihat jemputan itu dan peranannya.', 'Anda boleh membuang kolaborator pada bila-bila masa pada halaman perjalanan.'] },
            { term: 'Perjalanan yang dikongsi dengan anda', text: 'Perjalanan itu milik orang yang berkongsinya. Dialah yang menentukan berapa lama ia wujud dan siapa lagi yang melihatnya.' },
          ],
        },
      ],
    },
    {
      id: 'on-device',
      heading: 'Kuki dan storan pada peranti anda',
      blocks: [
        { type: 'p', text: 'Trippy tidak meletakkan kuki. Sebaliknya ia menggunakan storan pelayar anda sendiri, yang kekal pada peranti anda dan tidak dihantar bersama setiap permintaan seperti kuki. Tiada satu pun yang digunakan untuk pengiklanan atau untuk mengekori anda di laman lain.' },
        facts(['Dibuang apabila:'], [
            ['Sesi log masuk', 'Mengekalkan log masuk anda antara lawatan', 'Anda log keluar'],
            ['Pilihan', 'Mengingati paparan, tema, gerakan, bahasa dan unit', 'Anda mengosongkan data laman dalam pelayar anda'],
            ['Ringkasan profil', 'Membolehkan aplikasi dibuka dengan nama, bandar tempat tinggal, mata wang dan kewarganegaraan pasport anda sebelum pelayan menjawab', 'Anda log keluar'],
            ['Perjalanan luar talian: sehingga 5 perjalanan terbaru, senarai perjalanan dan kad taklimat', 'Membolehkan anda membaca rancangan tanpa sambungan', 'Anda log keluar, atau mengosongkannya dalam Settings di bawah Data'],
            ['Tanda semak dan kumpulan bandar', 'Mengingati apa yang anda tandakan pada setiap perjalanan', 'Anda memadam semua perjalanan anda dalam Settings, atau mengosongkan data laman'],
            ['Draf import', 'Menyimpan rancangan yang anda tampal sehingga anda selesai mengimportnya', 'Ia luput, atau anda log keluar'],
            ['Permintaan perjalanan yang sedang diisi', 'Menyimpan jawapan perancang semasa anda beralih antara langkah', 'Anda menutup tab'],
            ['Fail aplikasi', 'Service worker menyimpan salinan aplikasi supaya ia boleh dibuka tanpa sambungan', 'Anda mengosongkan data laman, atau membuang aplikasi yang dipasang'],
        ]),
        { type: 'p', text: 'Oleh sebab aplikasi memerlukan storan ini untuk berjalan, tiada sepanduk persetujuan untuknya. Anda boleh mengosongkannya pada bila-bila masa dalam tetapan pelayar anda. Trippy kemudian akan meminta anda log masuk semula.' },
      ],
    },
    {
      id: 'affiliate-links',
      heading: 'Pautan tempahan dan komisen',
      blocks: [
        { type: 'p', text: 'Kad penginapan dan kad penerbangan memaparkan sebaris ayat yang menyatakan bahawa Trippy mungkin memperoleh komisen daripada tempahan yang dibuat melalui pautannya. Pada masa ini pautan itu pautan biasa: tiada kod rakan niaga dan Trippy tidak memperoleh apa-apa daripadanya.' },
        { type: 'p', text: 'Jika kami menyertai program rakan niaga, pautan akan membawa kod yang memberitahu laman tempahan bahawa lawatan itu datang daripada Trippy. Kod itu tidak membawa nama, alamat e-mel atau id akaun anda, dan harga yang anda bayar tidak berubah. Kami akan mengemas kini dasar ini sebelum menghidupkannya.' },
        { type: 'p', text: 'Apabila anda membuka pautan tempahan, Trippy merekodkan dalam log diagnostiknya bahawa pautan ke laman tempahan itu telah dibuka dari perjalanan tersebut.' },
      ],
    },
    {
      id: 'children',
      heading: 'Kanak-kanak dan remaja',
      blocks: [
        { type: 'p', text: 'Trippy dibuat untuk orang dewasa yang merancang perjalanan mereka sendiri. Ia tidak ditujukan kepada kanak-kanak, dan memerlukan akaun Google, yang ditawarkan oleh Google hanya bermula pada umur minimum tertentu.' },
        { type: 'p', text: 'Jika anda berumur bawah 18 tahun, gunakan Trippy hanya dengan persetujuan ibu bapa atau penjaga yang sudah membaca dasar ini. Di Singapura, Suruhanjaya Perlindungan Data Peribadi (Personal Data Protection Commission) berpandangan bahawa remaja berumur 13 tahun ke atas lazimnya boleh memberikan persetujuan sendiri jika mereka faham apa yang mereka persetujui, dan bagi kanak-kanak bawah 13 tahun, ibu bapa atau penjagalah yang patut memberikannya. Kami tidak mengumpul data peribadi daripada kanak-kanak bawah 13 tahun dengan sengaja.' },
        { type: 'p', text: 'Jika anda percaya seorang kanak-kanak telah memberi kami data peribadi tanpa persetujuan itu, tulis kepada wakil perlindungan data kami dan kami akan memadamnya: {dpoEmail}.' },
      ],
    },
    {
      id: 'breach',
      heading: 'Jika berlaku pelanggaran data',
      blocks: [
        { type: 'p', text: 'Jika kami mempunyai sebab untuk mempercayai bahawa data peribadi dalam jagaan kami telah diakses, didedahkan, disalin, diubah, hilang atau dipadam tanpa kebenaran, kami akan menilai sama ada pelanggaran itu wajib dilaporkan di bawah PDPA. Kami akan melakukannya dengan segera, dan walau apa pun dalam masa 30 hari selepas mengetahuinya. Jika salah satu penyedia kami memaklumkan pelanggaran di pihaknya, langkah yang sama terpakai dari saat kami mengetahuinya.' },
        { type: 'p', text: 'Sesuatu pelanggaran wajib dimaklumkan apabila ia menyebabkan, atau mungkin menyebabkan, kemudaratan yang ketara kepada orang yang terjejas, atau apabila ia menjejaskan 500 orang atau lebih. Dalam keadaan itu kami akan memaklumkan Suruhanjaya Perlindungan Data Peribadi secepat yang boleh dilaksanakan, dan tidak lewat daripada 3 hari kalendar selepas kami membuat penilaian itu. Jika kemudaratan yang ketara mungkin berlaku, kami juga akan memaklumkan setiap orang yang terjejas secepat yang boleh dilaksanakan, di alamat e-mel akaun mereka, tentang apa yang berlaku, data yang terlibat dan apa yang boleh mereka lakukan. Undang-undang tidak menghendaki kami memaklumkan orang yang terjejas jika tindakan yang diambil selepas pelanggaran itu, atau perlindungan yang sudah ada pada data seperti penyulitan, menjadikan kemudaratan yang ketara tidak mungkin berlaku, atau jika Suruhanjaya atau agensi penguatkuasaan undang-undang mengarahkan kami supaya tidak berbuat demikian.' },
      ],
    },
    {
      id: 'changes',
      heading: 'Perubahan pada dasar ini',
      blocks: [
        { type: 'p', text: 'Kami akan mengemas kini dasar ini apabila Trippy mengubah apa yang dikumpulnya, cara ia menggunakannya atau siapa yang menerimanya, dan apabila undang-undang berubah. Tarikh di bawah tajuk ialah tarikh versi terkini.' },
        { type: 'p', text: 'Bagi perubahan yang penting, seperti tujuan baharu, jenis data baharu atau penyedia baharu yang menerima data peribadi, kami akan memaparkan notis dalam aplikasi atau pada halaman ini sebelum perubahan itu berkuat kuasa. Jika perubahan itu memerlukan persetujuan anda, kami akan memintanya. Kami tidak akan menganggap penggunaan Trippy yang berterusan sebagai persetujuan terhadap tujuan baharu.' },
        { type: 'p', text: 'Dasar ini ditulis dalam bahasa Inggeris dan mungkin disediakan dalam bahasa lain untuk kemudahan anda. Jika terjemahan berbeza daripada teks bahasa Inggeris, teks bahasa Inggeris yang terpakai.' },
      ],
    },
    {
      id: 'complaints',
      heading: 'Soalan dan aduan',
      blocks: [
        { type: 'p', text: 'Jika anda ada soalan tentang dasar ini, atau berpendapat kami telah tersilap mengendalikan data peribadi anda, beritahu kami dahulu supaya kami dapat membetulkannya. Tulis kepada wakil perlindungan data kami: {dpoEmail}.' },
        { type: 'p', text: 'Kami akan mengesahkan penerimaan aduan, menyiasatnya dan memberi anda jawapan, lazimnya dalam masa 30 hari.' },
        { type: 'p', text: `Jika anda tidak berpuas hati dengan jawapan kami, anda boleh membuat aduan kepada Suruhanjaya Perlindungan Data Peribadi Singapura, iaitu pengawal selia yang menguatkuasakan PDPA. Laman webnya ialah [pdpc.gov.sg](${PDPC}).` },
        { type: 'p', text: '[Terma penggunaan](#/terms) kami menyatakan peraturan lain bagi penggunaan Trippy.' },
      ],
    },
  ],
};
