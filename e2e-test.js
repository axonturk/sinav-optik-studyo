/* ==========================================================================
   UÇTAN UCA TARAYICI TESTİ (Chrome + puppeteer-core)
   Dosya yükleme (CSV/Excel/DOCX/DOC/XLS/PDF), çıktı alma (PDF/Word/Yazdır/CSV),
   dosya indirme, QR, mobil okuyucu ve OMR okuma senaryolarını örnek dosyalarla sınar.
   Çalıştırma: node e2e-test.js   (Sıfır hata beklenir)
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const XLSX = require('xlsx');
const { baslatSunucu } = require('./server.js');
const Cekirdek = require('./guvenlik-ve-veri.js');

const KOK = __dirname;
const ORNEK = path.join(KOK, 'ornek-dosyalar');
const URETILEN = path.join(ORNEK, 'uretilen');
const INDIRILEN = path.join(KOK, 'test-artifacts', 'indirilen');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  .find((p) => fs.existsSync(p));

const sonuclar = [];
let hataSayisi = 0;
function kontrol(ad, kosul, detay = '') {
  sonuclar.push({ ad, ok: Boolean(kosul) });
  if (!kosul) hataSayisi++;
  console.log(`  ${kosul ? '✓' : '✗ HATA'} ${ad}${detay ? ` — ${detay}` : ''}`);
}
async function sekmeAc(s, id) { await s.evaluate((i) => document.querySelector('[data-sekme="' + i + '"]').click(), id); await bekle(200); }
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- Örnek dosya üretimi ---- */
function uretOrnekDosyalar() {
  fs.mkdirSync(URETILEN, { recursive: true });
  fs.mkdirSync(INDIRILEN, { recursive: true });

  const sorularCsv = Cekirdek.uretBosSoruSablonuCSV();
  fs.writeFileSync(path.join(URETILEN, 'ornek_sorular_karma.csv'), sorularCsv, 'utf8');
  fs.writeFileSync(path.join(URETILEN, 'ornek_sorular_test.csv'), Cekirdek.uretBosTestSablonuCSV(), 'utf8');
  fs.writeFileSync(path.join(URETILEN, 'ornek_sorular_dy.csv'), Cekirdek.uretBosDySablonuCSV(), 'utf8');
  fs.writeFileSync(path.join(URETILEN, 'ornek_sorular_klasik.csv'), Cekirdek.uretBosKlasikSablonuCSV(), 'utf8');

  const csvdenXlsx = (csv, dosya) => {
    const satirlar = csv.replace(/^\ufeff/, '').split(/\r?\n/).filter(Boolean).map((s) => s.split(';'));
    const kitap = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(kitap, XLSX.utils.aoa_to_sheet(satirlar), 'Sayfa1');
    XLSX.writeFile(kitap, path.join(URETILEN, dosya));
  };
  csvdenXlsx(sorularCsv, 'ornek_sorular_karma.xlsx');
  csvdenXlsx(Cekirdek.uretBosTestSablonuCSV(), 'ornek_sorular_test.xlsx');

  // Kullanıcının Excel ekran görüntüsündeki D/Y şablonu (Puan sütunu fazladan; yok sayılmalı)
  const kullaniciSatirlari = [
    ['Soru_Metni', 'Dogru_Cevap', 'Zorluk_Derecesi', 'Puan', 'Konu_Kazanim'],
    ['TCP protokolü veri aktarımından önce üçlü el sıkışma ile bağlantı kurar.', 'D', 'Kolay', 2, 'ÖÇ-1: Ağ Katmanları'],
    ['Simetrik şifreleme iki farklı anahtar kullanır.', 'Y', 'Orta', 2, 'ÖÇ-2: Kriptografi'],
    ['bcrypt 72 baytlık parola sınırına sahiptir.', 'D', 'Zor', 2, 'ÖÇ-2: Kriptografi']
  ];
  const kk = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(kk, XLSX.utils.aoa_to_sheet(kullaniciSatirlari), 'Sayfa1');
  XLSX.writeFile(kk, path.join(URETILEN, 'kullanici_dy_sorulari.xlsx'));

  const ogrenciler = [
    'Ogrenci_No;Ad_Soyad;Bolum_Sinif',
    '2024101001;Deniz Arslan;Bilgisayar Müh.',
    '2024101002;Elif Çelik;Bilgisayar Müh.',
    '2024101003;Furkan Öztürk;Bilgisayar Müh.',
    '2024101004;Gülşen Yıldırım;Bilgisayar Müh.',
    '2024101005;Hakan Şahin;Bilgisayar Müh.'
  ].join('\r\n');
  fs.writeFileSync(path.join(URETILEN, 'ornek_ogrenciler.csv'), `\ufeff${ogrenciler}`, 'utf8');
  csvdenXlsx(ogrenciler, 'ornek_ogrenciler.xlsx');
}

/* ---- Yardımcılar ---- */
async function indirmeBekle(klasor, oncekiAdetler, ms = 15000) {
  const bas = Date.now();
  while (Date.now() - bas < ms) {
    const dosyalar = fs.readdirSync(klasor).filter((f) => !f.endsWith('.crdownload'));
    if (dosyalar.length > oncekiAdetler) return dosyalar;
    await bekle(150);
  }
  return fs.readdirSync(klasor);
}

async function indirVeDogrula(sayfa, ad, tetikle, beklenenUzanti, dogrula) {
  const once = fs.readdirSync(INDIRILEN).filter((f) => !f.endsWith('.crdownload')).length;
  await tetikle();
  const dosyalar = await indirmeBekle(INDIRILEN, once);
  const yeni = dosyalar.map((f) => ({ f, t: fs.statSync(path.join(INDIRILEN, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
  if (!yeni || dosyalar.length <= once) {
    kontrol(`${ad}: dosya indirildi`, false, 'indirme gerçekleşmedi');
    return null;
  }
  const tam = path.join(INDIRILEN, yeni.f);
  const boyut = fs.statSync(tam).size;
  kontrol(`${ad}: dosya indirildi (${yeni.f}, ${(boyut / 1024).toFixed(1)} KB)`, yeni.f.toLowerCase().endsWith(beklenenUzanti) && boyut > 200);
  if (dogrula) dogrula(fs.readFileSync(tam), yeni.f);
  return tam;
}

async function main() {
  console.log('=== UÇTAN UCA TARAYICI TESTİ BAŞLIYOR ===');
  if (!CHROME) throw new Error('Chrome/Edge bulunamadı');
  uretOrnekDosyalar();
  for (const f of fs.readdirSync(INDIRILEN)) fs.unlinkSync(path.join(INDIRILEN, f));

  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--window-size=1400,1000'] });
  const sayfa = await tarayici.newPage();
  await sayfa.setViewport({ width: 1400, height: 1000 });
  const hatalar = [];
  sayfa.on('pageerror', (e) => hatalar.push(`pageerror: ${e.message}`));
  sayfa.on('console', (m) => { if (m.type() === 'error') hatalar.push(`console.error: ${m.text()}`); });
  sayfa.on('dialog', async (d) => { hatalar.push(`dialog: ${d.message()}`); await d.dismiss(); });
  const cdp = await sayfa.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: INDIRILEN });
  await sayfa.evaluateOnNewDocument(() => { window.__printSayac = 0; window.print = () => { window.__printSayac++; }; });

  try {
    await sayfa.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await sayfa.evaluate(() => { const b = document.getElementById('btn-hoca-giris-yap'); if (b) b.click(); });
    await bekle(300);
    await sayfa.evaluate(() => { const k = document.getElementById('btn-modal-hoca-kapat'); if (k) k.click(); });
    await bekle(150);
    // Temiz başlangıçta E2E senaryosu için ilk ders (BİL304) ve ilk salon (B-201) hazırlanır
    await sayfa.evaluate(() => {
      const mBtn = document.getElementById('btn-yeni-ders-modal');
      if (mBtn) mBtn.click();
      const kod = document.getElementById('yeni-ders-kod');
      const ad = document.getElementById('yeni-ders-ad');
      if (kod) { kod.value = 'BİL304'; kod.dispatchEvent(new Event('input', { bubbles: true })); }
      if (ad) { ad.value = 'Ağ Güvenliği'; ad.dispatchEvent(new Event('input', { bubbles: true })); }
      const kBtn = document.getElementById('btn-yeni-ders-kaydet');
      if (kBtn) kBtn.click();
      const salonInp = document.querySelector('[data-salon-ad="0"]');
      if (salonInp) {
        salonInp.value = 'B-201';
        salonInp.dispatchEvent(new Event('input', { bubbles: true }));
        salonInp.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const tutSalon = document.getElementById('tut-salon');
      if (tutSalon) {
        tutSalon.value = 'B-201';
        tutSalon.dispatchEvent(new Event('input', { bubbles: true }));
        tutSalon.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await bekle(200);
    kontrol('Ana sayfa hatasız yüklendi', hatalar.length === 0, hatalar.join(' | '));
    kontrol('Canlı A4 önizleme sayfaları üretildi', (await sayfa.$$('#a4-onizleme-sahne .a4-sayfa')).length >= 2);

    // ---- Kalite formu yükleme ----
    const kaliteInput = await sayfa.$('#input-kalite-gorsel');
    const alan = (id) => sayfa.$eval(id, (e) => e.value);

    await kaliteInput.uploadFile(path.join(ORNEK, '2853_files_1675426892.docx'));
    await bekle(800);
    kontrol('Kalite formu .docx: Doküman No = FRM-046', (await alan('#kalite-dokuman-no')) === 'FRM-046', await alan('#kalite-dokuman-no'));
    kontrol('Kalite formu .docx: İlk Yayın = 30.01.2023', (await alan('#kalite-yayin-tarihi')) === '30.01.2023', await alan('#kalite-yayin-tarihi'));
    const logoVar = await sayfa.$eval('#a4-onizleme-sahne', (s) => Boolean(s.querySelector('.kalite-logo-hucre img')));
    kontrol('Kalite formu .docx: kurum logosu antete yerleşti', logoVar);
    kontrol('Kalite formu .docx: hata/uyarı yok', hatalar.length === 0, hatalar.join(' | '));

    await kaliteInput.uploadFile(path.join(ORNEK, '2853_files_1713424265.xls'));
    await bekle(800);
    kontrol('Kalite formu .xls: Doküman No = FRM-059', (await alan('#kalite-dokuman-no')) === 'FRM-059', await alan('#kalite-dokuman-no'));

    await kaliteInput.uploadFile(path.join(ORNEK, 'BL304_Tum_Sinif_Ogrenciye_Ozel_Kagitlar_ve_Anahtar.doc'));
    await bekle(800);
    kontrol('Kalite formu .doc: künye okundu', /^[A-Z]{2,6}-\d{2,5}$/.test(await alan('#kalite-dokuman-no')), await alan('#kalite-dokuman-no'));

    await kaliteInput.uploadFile(path.join(ORNEK, 'BL304_Tum_Sinif_Ogrenciye_Ozel_Kagitlar_ve_Anahtar.pdf'));
    await bekle(800);
    kontrol('Kalite formu .pdf: yükleme hatasız', hatalar.length === 0, hatalar.join(' | '));

    // Kalite formunu docx ile tekrar uygula (sonraki çıktı testleri bu antetle yapılır)
    await kaliteInput.uploadFile(path.join(ORNEK, '2853_files_1675426892.docx'));
    await bekle(800);

    // ---- Soru yükleme (CSV, Excel) ----
    const soruSayisi = async () => sayfa.$eval('#rozet-banka-toplam', (e) => Number(e.textContent));
    const soruInput = await sayfa.$('#input-soru-csv-yukle');
    for (const [dosya, beklenen] of [
      ['ornek_sorular_karma.csv', 5], ['ornek_sorular_karma.xlsx', 5], ['ornek_sorular_test.csv', 4],
      ['ornek_sorular_test.xlsx', 4], ['ornek_sorular_dy.csv', 4], ['ornek_sorular_klasik.csv', 2], ['kullanici_dy_sorulari.xlsx', 3]
    ]) {
      const once = await soruSayisi();
      await soruInput.uploadFile(path.join(URETILEN, dosya));
      await bekle(700);
      const sonra = await soruSayisi();
      kontrol(`Soru yükleme ${dosya}: +${beklenen} soru`, sonra - once === beklenen, `+${sonra - once}`);
    }
    kontrol('Soru yüklemelerinde hata/uyarı yok', hatalar.length === 0, hatalar.join(' | '));

    // ---- Öğrenci yükleme ----
    await sekmeAc(sayfa, 'sekme-ogrenciler');
    const ogrInput = await sayfa.$('#input-ogrenci-csv-yukle');
    for (const dosya of ['ornek_ogrenciler.csv', 'ornek_ogrenciler.xlsx']) {
      await ogrInput.uploadFile(path.join(URETILEN, dosya));
      await bekle(600);
      const adet = await sayfa.$eval('#rozet-ogrenci-sayisi', (e) => Number(e.textContent));
      kontrol(`Öğrenci yükleme ${dosya}: 5 öğrenci`, adet === 5, String(adet));
    }

    // ---- Öğrenci listesi QR ----
    await sayfa.click('#btn-ogrenci-telefona-aktar');
    await bekle(700);
    const qrVar = await sayfa.$eval('#alan-ogrenci-qr-svg', (e) => Boolean(e.querySelector('svg path')));
    kontrol('Öğrenci listesi gerçek QR (SVG) üretildi', qrVar);
    const qrAdres = await alan('#ogrenci-qr-taban-adres');
    kontrol('QR adresi telefonun erişeceği yerel ağ IP adresi', /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/.test(qrAdres), qrAdres);
    await sayfa.click('#btn-modal-ogrenci-qr-kapat');

    // ---- Çıktılar: PDF / Word / Yazdır (tüm kapsamlar) ----
    await sayfa.evaluate(() => document.querySelectorAll('.sekme-btn')[0].click());
    const kapsamlar = ['sinif-aktif', 'sinif-tum-gruplar', 'ogrenci-tek', 'ogrenci-tum-sinif', 'ayri-optik', 'anahtar'];
    for (const kapsam of kapsamlar) {
      for (const [format, uzanti] of [['pdf-indir', '.pdf'], ['word-indir', '.doc']]) {
        await sayfa.select('#baski-kapsam-sec', kapsam).catch(() => {});
        await sayfa.select('#baski-format-sec', format);
        await indirVeDogrula(sayfa, `Çıktı ${kapsam} / ${format}`, () => sayfa.click('#btn-secili-baski-calistir'), uzanti, (icerik) => {
          if (uzanti === '.pdf') {
            const s = icerik.toString('latin1');
            const sayfaAdedi = (s.match(/\/Type\s*\/Page\b/g) || []).length;
            kontrol(`  PDF yapısı geçerli ve sayfa görüntüleri gömülü (${kapsam}: ${sayfaAdedi} sayfa, ${(icerik.length / 1024).toFixed(0)} KB)`, s.startsWith('%PDF-1.4') && s.includes('%%EOF') && sayfaAdedi >= 1 && icerik.length > 25000 * sayfaAdedi && s.includes('DCTDecode'));
          } else {
            const s = icerik.toString('utf8');
            kontrol(`  Word içeriği temiz, ekran araçları sızmadı (${kapsam})`, s.includes('Section1') && !s.includes('Değiştir') && !s.includes('soru-ekran-araclari') && !s.includes('data-kagit-soru'));
          }
        });
      }
      await sayfa.select('#baski-format-sec', 'yazdir');
      const once = await sayfa.evaluate(() => window.__printSayac);
      await sayfa.click('#btn-secili-baski-calistir');
      await bekle(300);
      kontrol(`Yazdır ${kapsam}: yazdırma penceresi tetiklendi`, (await sayfa.evaluate(() => window.__printSayac)) === once + 1);
    }

    // ---- Sınav Durum Tutanağı & Yoklama Evrakı (Birleşik Çıktı Merkezi + Mini Önizleme + Çoklu Salon + Ders Bazlı Öğrenci) ----
    await sayfa.evaluate(() => document.querySelectorAll('.sekme-btn')[0].click());
    await bekle(350);
    const miniKutuAdet = await sayfa.$$eval('#baski-mini-onizleme .mini-sayfa-kutu', (els) => els.length);
    kontrol('Çıktı Merkezi: mini önizleme şeridi sayfa küçük resimlerini gösteriyor', miniKutuAdet >= 1, String(miniKutuAdet));

    const alanYaz = (id, deger) => sayfa.evaluate((i, d) => { const e = document.getElementById(i); if (!e) return; e.value = d; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, id, deger);
    await alanYaz('tut-tarih', '2027-01-15');
    await alanYaz('tut-saat', '14:30');
    await alanYaz('tut-gozetmen1', 'Dr. Ayşe Demir');
    await alanYaz('tut-gozetmen2', 'Arş. Gör. Mehmet Kaya');
    await sayfa.select('#tut-sinav-turu', 'Final');
    const tutDersSecenek = await sayfa.$$eval('#tut-ders-sec option', (o) => o.length);
    kontrol('Tutanak: ders seçici dolu', tutDersSecenek >= 1, String(tutDersSecenek));
    for (const [kapsamDeger, beklenenSayfa, anahtarMetinler] of [
      ['tutanak', 1, ['SINAV DURUM TUTANAĞI', 'FRM-046', 'Dr. Ayşe Demir', 'Arş. Gör. Mehmet Kaya', 'B-201', '15.01.2027 · 14:30', 'Final', 'BİL304']],
      ['yoklama', 1, ['SINAV YOKLAMA EVRAKI', 'FRM-059', 'Deniz Arslan', 'Hakan Şahin', '15.01.2027 · 14:30', 'B-201', 'Final']],
      ['tutanak-yoklama', 2, ['SINAV DURUM TUTANAĞI', 'SINAV YOKLAMA EVRAKI']]
    ]) {
      await sayfa.select('#baski-kapsam-sec', kapsamDeger);
      await bekle(350);
      await sayfa.select('#baski-format-sec', 'pdf-indir');
      await indirVeDogrula(sayfa, `Tutanak ${kapsamDeger} / PDF`, () => sayfa.click('#btn-secili-baski-calistir'), '.pdf', (icerik) => {
        const s = icerik.toString('latin1');
        const adet = (s.match(/\/Type\s*\/Page\b/g) || []).length;
        kontrol(`  Tutanak ${kapsamDeger} PDF: ${beklenenSayfa} sayfa ve gömülü görüntü`, adet === beklenenSayfa && s.includes('DCTDecode') && icerik.length > 20000 * adet, `${adet} sayfa, ${(icerik.length / 1024).toFixed(0)} KB`);
      });
      await sayfa.select('#baski-format-sec', 'word-indir');
      await indirVeDogrula(sayfa, `Tutanak ${kapsamDeger} / Word`, () => sayfa.click('#btn-secili-baski-calistir'), '.doc', (icerik) => {
        const s = icerik.toString('utf8');
        const eksik = anahtarMetinler.filter((m) => !s.includes(m));
        kontrol(`  Tutanak ${kapsamDeger} Word içeriği eksiksiz (ders, tür, tarih/saat, salon, gözetmen)`, eksik.length === 0, eksik.join(', '));
      });
      await sayfa.select('#baski-format-sec', 'yazdir');
      const onceP = await sayfa.evaluate(() => window.__printSayac);
      await sayfa.click('#btn-secili-baski-calistir');
      await bekle(300);
      kontrol(`Tutanak ${kapsamDeger}: yazdırma tetiklendi`, (await sayfa.evaluate(() => window.__printSayac)) === onceP + 1);
    }
    await sayfa.select('#baski-kapsam-sec', 'tutanak');
    await bekle(350);
    const onizTutanak = await sayfa.$eval('#a4-onizleme-sahne', (e) => e.textContent);
    kontrol('Tutanak önizlemesi A4 alanında görünüyor', onizTutanak.includes('SINAV DURUM TUTANAĞI') && onizTutanak.includes('B-201'));

    // ---- Çoklu Salon Kontenjan Dağıtımı ve Ders Bazlı Öğrenci İzolasyonu ----
    await sekmeAc(sayfa, 'sekme-ogrenciler');
    await sayfa.evaluate(() => {
      const k = document.querySelector('[data-salon-kontenjan="0"]');
      if (k) { k.value = '3'; k.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await bekle(300);
    const salonYerlesimMetin = await sayfa.$eval('#kutu-salon-yerlesim', (e) => e.textContent);
    kontrol('Salon kontenjanı (3) aşıldığında 5 öğrenci için otomatik Ek Salon 1 açıldı', salonYerlesimMetin.includes('B-201: 3/3') && salonYerlesimMetin.includes('Ek Salon 1: 2/3'));
    await sayfa.evaluate(() => document.querySelectorAll('.sekme-btn')[0].click());
    await sayfa.select('#baski-kapsam-sec', 'tutanak');
    await bekle(350);
    const ikiSalonSayfa = await sayfa.$$eval('#a4-onizleme-sahne .a4-sayfa', (els) => els.length);
    kontrol('Çoklu salon: her salon için ayrı Sınav Durum Tutanağı sayfası üretildi (2 salon = 2 sayfa)', ikiSalonSayfa === 2, String(ikiSalonSayfa));
    // Kontenjanı 40'a geri al
    await sekmeAc(sayfa, 'sekme-ogrenciler');
    await sayfa.evaluate(() => {
      const k = document.querySelector('[data-salon-kontenjan="0"]');
      if (k) { k.value = '40'; k.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await bekle(200);

    // Yeni ders eklendiğinde öğrenci listesi boş başlamalı, önceki derse dönülünce 5 öğrenci korunmalı
    const ilkDersId = await sayfa.$eval('#aktif-ders-sec', (e) => e.value);
    await sayfa.click('#btn-yeni-ders-modal');
    await bekle(150);
    await alanYaz('yeni-ders-kod', 'YZM999');
    await alanYaz('yeni-ders-ad', 'Boş Test Dersi');
    await sayfa.click('#btn-yeni-ders-kaydet');
    await bekle(250);
    const bosDersOgrSayisi = await sayfa.$eval('#rozet-ogrenci-sayisi', (e) => Number(e.textContent));
    kontrol('Yeni açılan derste öğrenci yoksa liste boş (0 öğrenci) başlar', bosDersOgrSayisi === 0, String(bosDersOgrSayisi));
    await sayfa.select('#aktif-ders-sec', ilkDersId);
    await bekle(250);
    const geriDonenOgrSayisi = await sayfa.$eval('#rozet-ogrenci-sayisi', (e) => Number(e.textContent));
    kontrol('Önceki derse dönüldüğünde o dersin 5 öğrencisi korunur', geriDonenOgrSayisi === 5, String(geriDonenOgrSayisi));
    // ---- CSV şablon ve not çizelgesi indirmeleri ----
    for (const [id, ad] of [['#btn-bos-test-csv-indir', 'Test CSV şablonu'], ['#btn-bos-dy-csv-indir', 'D/Y CSV şablonu'], ['#btn-bos-klasik-csv-indir', 'Klasik CSV şablonu'], ['#btn-bos-soru-csv-indir', 'Karma CSV şablonu']]) {
      await indirVeDogrula(sayfa, ad, () => sayfa.evaluate((i) => document.querySelector(i).click(), id), '.csv', (icerik) => {
        kontrol(`  ${ad} Hafta sütunu içeriyor`, icerik.toString('utf8').includes('Hafta'));
      });
    }
    await indirVeDogrula(sayfa, 'Yedek JSON', () => sayfa.evaluate(() => document.getElementById('btn-yedek-indir').click()), '.json', (icerik) => {
      let gecerli = true;
      try { JSON.parse(icerik.toString('utf8')); } catch (_) { gecerli = false; }
      kontrol('  Yedek JSON geçerli', gecerli);
      kontrol('  Yedek JSON makul boyutta (< 3 MB)', icerik.length < 3 * 1024 * 1024, ` KB`);
    });

    // ---- OMR simülasyonu: öğrenci numarası okuma ----
    await sekmeAc(sayfa, 'sekme-omr');
    await sayfa.click('#btn-sim-tek-tara');
    await bekle(800);
    const detay = await sayfa.$eval('#kutu-son-okunan-detay', (e) => e.textContent);
    kontrol('OMR: öğrenci numarası okundu (? yok)', !/Kodlanan:\s*[\d?]*\?/.test(detay), detay.replace(/\s+/g, ' ').slice(0, 120));
    await sayfa.click('#btn-okumalari-temizle');
    await sayfa.click('#btn-sim-tum-sinif-tara');
    await bekle(1200);
    const tabloSatir = await sayfa.$$eval('#tablo-omr-okunanlar tr', (r) => r.length);
    kontrol('OMR: tüm sınıf (5 öğrenci) okundu', tabloSatir === 5, String(tabloSatir));
    const tabloMetin = await sayfa.$eval('#tablo-omr-okunanlar', (e) => e.textContent);
    for (const ad of ['Deniz Arslan', 'Elif Çelik', 'Furkan Öztürk', 'Gülşen Yıldırım', 'Hakan Şahin']) kontrol(`OMR: ${ad} numarasından doğru eşleşti`, tabloMetin.includes(ad));

    // ---- 1B. Haftalık Kota (manuel_kota) yatay taşma kontrolü ----
    await sayfa.evaluate(() => document.querySelectorAll('.sekme-btn')[0].click());
    await bekle(200);
    await sayfa.evaluate(() => {
      const iz = document.getElementById('kutu-hafta-secim-izgara');
      const kart = iz && iz.closest('.kart');
      if (kart && kart.classList.contains('katlandi')) {
        const btn = kart.querySelector('.kart-katla-btn');
        if (btn) btn.click();
      }
    });
    await sayfa.select('#ayar-hafta-dagilim-modu', 'manuel_kota');
    await bekle(250);
    const kotaTasmaYok = await sayfa.evaluate(() => {
      const iz = document.getElementById('kutu-hafta-secim-izgara');
      const kart = iz && iz.closest('.kart');
      if (!iz || !kart) return false;
      const izRect = iz.getBoundingClientRect();
      const kartRect = kart.getBoundingClientRect();
      return iz.scrollWidth <= iz.clientWidth + 2 && izRect.right <= kartRect.right + 2;
    });
    kontrol('1B Haftalık Kota (manuel_kota) ızgarası kart dışına taşmıyor', kotaTasmaYok);
    await sayfa.select('#ayar-hafta-dagilim-modu', 'otomatik_dengeli');

    // ---- Ders Silme -> Soru Arşivi Koruma -> Yeni Derse Arşiv Dahil Etme ----
    const silinecekDersSoruSayisi = await sayfa.$eval('#rozet-banka-toplam', (e) => Number(e.textContent));
    await sayfa.click('#btn-aktif-dersi-sil');
    await bekle(300);
    await sekmeAc(sayfa, 'sekme-banka');
    const arsivCubukGorunur = await sayfa.$eval('#kutu-banka-arsiv-cubuk', (e) => e.style.display !== 'none' && e.textContent.includes('Soru Arşivi'));
    kontrol('Ders silindiğinde soruları silinmez ve Soru Arşivi çubuğunda görünür', arsivCubukGorunur);

    await sayfa.evaluate(() => document.getElementById('btn-yeni-ders-modal').click());
    await bekle(200);
    await sayfa.$eval('#yeni-ders-kod', (e) => { e.value = 'BİL304'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await sayfa.$eval('#yeni-ders-ad', (e) => { e.value = 'Ağ Güvenliği (Yeni Dönem)'; });
    await sayfa.$$eval('[data-arsiv-sec]', (cbs) => cbs.forEach((cb) => { cb.checked = true; }));
    await sayfa.click('#btn-yeni-ders-kaydet');
    await bekle(300);
    const yeniDersBankaSoruSayisi = await sayfa.$eval('#rozet-banka-toplam', (e) => Number(e.textContent));
    kontrol('Yeni ders eklenirken seçilen arşiv soruları yeni derse eksiksiz dahil edildi', yeniDersBankaSoruSayisi === silinecekDersSoruSayisi, `${yeniDersBankaSoruSayisi} / ${silinecekDersSoruSayisi}`);

    // ---- Online Sınav Tanımlama ve Başlatma ----
    await sekmeAc(sayfa, 'sekme-online');
    await sayfa.$eval('#online-sinav-kodu', (e) => { e.value = 'SINAV-2026-FINAL-E2E'; });
    await sayfa.$eval('#online-sinav-baslik', (e) => { e.value = '2026-2027 Güz Final Online Sınavı'; });
    await sayfa.select('#online-sinav-turu', 'Final');
    await sayfa.$eval('#online-sure-dk', (e) => { e.value = '55'; });
    await sayfa.click('#btn-online-tanimla-kaydet');
    await bekle(300);
    const onlineTabloMetin = await sayfa.$eval('#tablo-tanimli-online-sinavlar', (e) => e.textContent);
    kontrol('Yeni tanımlanan online sınav (SINAV-2026-FINAL-E2E) tabloya eklendi', onlineTabloMetin.includes('SINAV-2026-FINAL-E2E') && onlineTabloMetin.includes('55 dk'));

    // ---- Mobil okuyucu: #ogr= ile öğrenci aktarımı ----
    const metin = ['2024101001;Deniz Arslan', '2024101002;Elif Çelik'].join('\n');
    const b64 = encodeURIComponent(Buffer.from(metin, 'utf8').toString('base64'));
    const mobil = await tarayici.newPage();
    const mobilHatalar = [];
    mobil.on('pageerror', (e) => mobilHatalar.push(e.message));
    await mobil.goto(`${taban}/optik-mobil.html#ogr=${b64}`, { waitUntil: 'networkidle0' });
    const mobilOgr = await mobil.evaluate(() => (window.__mobilOgrenciler ? window.__mobilOgrenciler().length : -1));
    kontrol('Mobil okuyucu #ogr= bağlantısı hatasız açıldı', mobilHatalar.length === 0, mobilHatalar.join(' | '));
    kontrol('Mobil okuyucu öğrenci listesini QR bağlantısından aldı (2 öğrenci)', mobilOgr === 2, String(mobilOgr));
    await mobil.close();

    kontrol('Tüm senaryolarda JS hatası / uyarı penceresi yok', hatalar.length === 0, hatalar.join(' | '));
  } finally {
    await tarayici.close();
    server.close();
  }

  console.log(`\n=== ${sonuclar.length - hataSayisi}/${sonuclar.length} KONTROL GEÇTİ · ${hataSayisi} HATA ===`);
  process.exit(hataSayisi === 0 ? 0 : 1);
}

main().catch((e) => { console.error('E2E HATASI:', e); process.exit(1); });
