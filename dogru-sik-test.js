/* ==========================================================================
   DOĞRU ŞIK / ŞIK KARIŞTIRMA UÇTAN UCA TESTİ
   1) Örnek dosyalar (CSV/XLSX/Word metni) -> ayrıştırıcı: harf <-> şık metni doğruluğu (elle yazılmış beklenenlerle)
   2) A/B/C/D kitapçık + 4/5 şık + (E doğru) kombinasyonlarında doğru şık metni kayıpsız taşınıyor mu
   3) Tarayıcıda üretilen gerçek sınav kağıdı (Word çıktısı) ile cevap anahtarı birebir uyumlu mu
   Çalıştırma: node dogru-sik-test.js   (Sıfır hata beklenir)
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const puppeteer = require('puppeteer-core');
const XLSX = require('xlsx');
const { baslatSunucu } = require('./server.js');
const C = require('./guvenlik-ve-veri.js');

const URETILEN = path.join(__dirname, 'ornek-dosyalar', 'uretilen');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  .find((p) => fs.existsSync(p));
const HARFLER = ['A', 'B', 'C', 'D', 'E'];
let hata = 0;
let gecen = 0;
function kontrol(ad, kosul, detay = '') {
  if (kosul) gecen++; else hata++;
  if (!kosul || process.env.AYRINTI) console.log(`  ${kosul ? '✓' : '✗ HATA'} ${ad}${detay ? ` — ${detay}` : ''}`);
}

/* ---- Elle yazılmış, bağımsız beklenen cevaplar: [metin ön eki, doğru şık METNİ] ---- */
const DENEME_CSV_SATIRLARI = [
  // soru; A..E; doğru girdi; beklenen doğru şık metni
  ['DST-1 Hangi port SSH içindir?', '21', '22', '23', '80', '443', 'B', '22'],
  ['DST-2 Hangisi bellek-zorlu özet algoritmasıdır?', 'MD5', 'SHA-1', 'CRC32', 'Argon2id', 'DES', 'D', 'Argon2id'],
  ['DST-3 Doğru şık E olan soru', 'Alfa', 'Beta', 'Gama', 'Delta', 'Epsilon', 'E', 'Epsilon'],
  ['DST-4 Doğru şık A olan soru', 'Birinci', 'İkinci', 'Üçüncü', 'Dördüncü', 'Beşinci', 'A', 'Birinci'],
  ['DST-5 Doğru cevap küçük harfle girildi', 'Kedi', 'Köpek', 'Kuş', 'Balık', 'At', 'c', 'Kuş'],
  ['DST-6 Doğru cevap şık METNİ olarak girildi', 'Mars', 'Venüs', 'Dünya', 'Jüpiter', 'Satürn', 'Dünya', 'Dünya'],
  ['DST-7 Doğru cevap B) biçiminde girildi', 'Kırmızı', 'Yeşil', 'Mavi', 'Sarı', 'Mor', 'B)', 'Yeşil'],
  ['DST-8 Doğru şık E ve diğerleri uzun', 'Bu çok uzun bir yanlış şık metnidir bir', 'Bu çok uzun bir yanlış şık metnidir iki', 'Bu çok uzun bir yanlış şık metnidir üç', 'Bu çok uzun bir yanlış şık metnidir dört', 'Tek doğru uzun şık metni budur', 'E', 'Tek doğru uzun şık metni budur'],
  ['DST-9 Sayısal şıklar', '1024', '2048', '4096', '8192', '16384', 'C', '4096'],
  ['DST-10 Doğru şık D', 'TCP', 'UDP', 'ICMP', 'ARP', 'RIP', 'D', 'ARP'],
  ['DST-11 Doğru şık B', 'HTTP', 'HTTPS', 'FTP', 'SMTP', 'DNS', 'B', 'HTTPS'],
  ['DST-12 Doğru şık C', 'XSS', 'CSRF', 'SQLi', 'SSRF', 'IDOR', 'C', 'SQLi']
];

function denemeCsvUret() {
  const baslik = 'Soru_Metni;Sik_A;Sik_B;Sik_C;Sik_D;Sik_E;Dogru_Sik_Secenegi;Zorluk_Derecesi;Konu_Kazanim;Hafta';
  const zorluklar = ['Kolay', 'Orta', 'Zor'];
  const satirlar = DENEME_CSV_SATIRLARI.map((s, i) => [...s.slice(0, 7), zorluklar[i % 3], 'ÖÇ-1: Deneme', String((i % 7) + 1)].join(';'));
  const csv = '\ufeff' + [baslik, ...satirlar].join('\r\n');
  fs.mkdirSync(URETILEN, { recursive: true });
  fs.writeFileSync(path.join(URETILEN, 'dogru_sik_deneme.csv'), csv, 'utf8');
  if (!fs.existsSync(path.join(URETILEN, 'ornek_sorular_test.csv'))) {
    fs.writeFileSync(path.join(URETILEN, 'ornek_sorular_test.csv'), '\ufeff' + C.uretBosTestSablonuCSV(), 'utf8');
  }
  if (!fs.existsSync(path.join(URETILEN, 'ornek_sorular_karma.csv'))) {
    fs.writeFileSync(path.join(URETILEN, 'ornek_sorular_karma.csv'), '\ufeff' + C.uretBosSoruSablonuCSV(), 'utf8');
  }
  const aoa = [baslik.split(';'), ...DENEME_CSV_SATIRLARI.map((s, i) => [...s.slice(0, 7), zorluklar[i % 3], 'ÖÇ-1: Deneme', (i % 7) + 1])];
  const kitap = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(kitap, XLSX.utils.aoa_to_sheet(aoa), 'Sayfa1');
  XLSX.writeFile(kitap, path.join(URETILEN, 'dogru_sik_deneme.xlsx'));
  return csv;
}

/* ---------------------------------------------------------------- 1) AYRIŞTIRICI ---------------------------------------------------------------- */
function ayristiriciTestleri(csv) {
  console.log('1) Ayrıştırıcı: dosyadan gelen doğru şık harfi/metni');
  const sorular = C.cozSoruBankasiCSV(csv, 'DENEME');
  kontrol('CSV: 12 soru okundu', sorular.length === 12, String(sorular.length));
  sorular.forEach((s, i) => {
    const beklenen = DENEME_CSV_SATIRLARI[i][7];
    const gercek = s.siklar[HARFLER.indexOf(s.dogruHarf)];
    kontrol(`CSV ${s.metin.slice(0, 5)}: doğru harf ${s.dogruHarf} -> "${gercek}" (beklenen "${beklenen}")`, gercek === beklenen);
    kontrol(`CSV ${s.metin.slice(0, 5)}: dogruSikDegeri tutarlı`, s.dogruSikDegeri === beklenen, String(s.dogruSikDegeri));
  });

  // XLSX yolu (sayısal hücreler dahil)
  const wb = XLSX.readFile(path.join(URETILEN, 'dogru_sik_deneme.xlsx'));
  const satirlar = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
  const csvBicim = '\ufeff' + satirlar.map((r) => r.join(';')).join('\r\n');
  const xs = C.cozSoruBankasiCSV(csvBicim, 'DENEME');
  kontrol('XLSX: 12 soru okundu', xs.length === 12);
  xs.forEach((s, i) => kontrol(`XLSX ${s.metin.slice(0, 5)}: doğru şık metni`, s.siklar[HARFLER.indexOf(s.dogruHarf)] === DENEME_CSV_SATIRLARI[i][7]));

  // Word'den yapıştırılan metin biçimleri
  const metin = [
    '1. Hangisi bir NoSQL veritabanıdır?', 'A) MySQL', 'B) MongoDB *', 'C) Oracle', 'D) PostgreSQL',
    '2. Hangisi şifreleme algoritmasıdır?', 'A) AES', 'B) HTTP', 'C) DNS', 'D) FTP', 'Cevap: A',
    '3. Hangisi yan yana şıklıdır?', 'A) 10 B) 20 C) 30 D) 40', 'Cevap: C',
    '4. Beş şıklı ve E doğru', 'A) bir', 'B) iki', 'C) üç', 'D) dört', 'E) beş (Doğru)',
    '5. Cevap harfi küçük yazılmış', 'A) x', 'B) y', 'C) z', 'D) w', 'Cevap: d'
  ].join('\n');
  const ms = C.metindenSorulariAyikla(metin, 'DENEME');
  const beklenenMetin = [['NoSQL', 'MongoDB'], ['şifreleme', 'AES'], ['yan yana', '30'], ['E doğru', 'beş'], ['küçük', 'w']];
  kontrol('Word metni: 5 soru okundu', ms.length === 5, String(ms.length));
  beklenenMetin.forEach(([anahtar, dogru], i) => {
    const s = ms[i];
    const gercek = s && s.siklar[HARFLER.indexOf(s.dogruHarf)];
    kontrol(`Word metni ${anahtar}: doğru şık "${gercek}" (beklenen "${dogru}")`, gercek === dogru);
  });
  // Yan yana şıklarda "Cevap: C" yalnız o soruya uygulanmalı ve 4 şık gelmeli
  kontrol('Word metni: yan yana şıklar 4 adet', ms[2] && ms[2].siklar.length === 4, ms[2] ? ms[2].siklar.join('|') : '');
  return sorular;
}

/* ---------------------------------------------------------------- 2) KİTAPÇIK / KARIŞTIRMA ---------------------------------------------------------------- */
function kitapcikTestleri(sorular) {
  console.log('2) Kitapçık/şık karıştırma: doğru şık metni her kombinasyonda korunuyor mu');
  const havuz = [...sorular, ...C.VARSAYILAN_SORULAR.filter((s) => s.tur === 'test')];
  const orijinalDogru = new Map();
  havuz.forEach((s) => {
    const idx = HARFLER.indexOf(s.dogruHarf || 'A');
    orijinalDogru.set(s.id, s.siklar[idx] !== undefined ? s.siklar[idx] : s.siklar[0]);
  });
  let sayac = 0;
  for (const sikSayisi of [4, 5]) {
    for (const karistir of [true, false]) {
      for (const g of ['A', 'B', 'C', 'D']) {
        const v = C.uretKitapcikVaryasyonu(havuz, g, `KOD-${sikSayisi}`, karistir, sikSayisi);
        kontrol(`g=${g} şık=${sikSayisi} karıştır=${karistir}: tüm testler kitapçıkta`, v.test.length === havuz.length);
        v.test.forEach((s) => {
          sayac++;
          const orj = havuz.find((x) => x.id === s.id);
          const beklenen = orijinalDogru.get(s.id);
          const gercek = s.siklar[HARFLER.indexOf(s.dogruHarf)];
          if (gercek !== beklenen) kontrol(`g=${g} şık=${sikSayisi} k=${karistir} ${String(orj.metin).slice(0, 12)}: doğru şık ${s.dogruHarf} -> "${gercek}" (beklenen "${beklenen}")`, false);
          if (s.siklar.length !== Math.min(sikSayisi, Math.max(orj.siklar.length, 0)) && !(sikSayisi === 5 && orj.siklar.length < 5)) {
            kontrol(`g=${g} şık=${sikSayisi} ${String(orj.metin).slice(0, 12)}: şık adedi ${s.siklar.length}`, false);
          }
          if (new Set(s.siklar).size !== s.siklar.length && new Set(orj.siklar).size === orj.siklar.length) {
            kontrol(`g=${g} ${String(orj.metin).slice(0, 12)}: şıklar tekrarlandı`, false, s.siklar.join('|'));
          }
          if (!s.siklar.every((x) => orj.siklar.includes(x))) kontrol(`g=${g} ${String(orj.metin).slice(0, 12)}: şık metni değişti`, false);
          if (HARFLER.indexOf(s.dogruHarf) >= s.siklar.length) kontrol(`g=${g} ${String(orj.metin).slice(0, 12)}: doğru harf şık aralığı dışında`, false);
        });
      }
    }
  }
  kontrol(`Kitapçık denetimi: ${sayac} soru-örneği doğrulandı`, sayac > 0);
}

/* ---------------------------------------------------------------- 3) GERÇEK KAĞIT ↔ ANAHTAR (TARAYICI) ---------------------------------------------------------------- */
async function tarayiciTestleri() {
  console.log('3) Tarayıcı: üretilen gerçek sınav kağıdı ile cevap anahtarı birebir uyumlu mu');
  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const sayfa = await tarayici.newPage();
  const hatalar = [];
  sayfa.on('pageerror', (e) => hatalar.push(e.message));
  sayfa.on('dialog', async (d) => { hatalar.push('dialog: ' + d.message()); await d.dismiss(); });
  await sayfa.evaluateOnNewDocument(() => {
    window.__bloblar = [];
    const Orj = window.Blob;
    window.Blob = function (parcalar, secenek) {
      try { if (secenek && /msword/.test(secenek.type || '')) window.__bloblar.push(parcalar.map(String).join('')); } catch (e) { /* yoksay */ }
      return new Orj(parcalar, secenek);
    };
    window.Blob.prototype = Orj.prototype;
    window.print = () => {};
  });
  const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await sayfa.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await sayfa.evaluate(() => { const b = document.getElementById('btn-hoca-giris-yap'); if (b) b.click(); });
    await bekle(300);
    await sayfa.evaluate(() => { const k = document.getElementById('btn-modal-hoca-kapat'); if (k) k.click(); });
    await bekle(150);
    const soruInput = await sayfa.$('#input-soru-csv-yukle');
    for (const f of ['dogru_sik_deneme.csv', 'dogru_sik_deneme.xlsx', 'ornek_sorular_test.csv', 'ornek_sorular_karma.csv']) {
      await soruInput.uploadFile(path.join(URETILEN, f));
      await bekle(600);
    }
    const varsayilanDogruH = new Map();
    C.VARSAYILAN_SORULAR.filter((s) => s.tur === 'test').forEach((s) => varsayilanDogruH.set(s.metin.trim(), s.siklar[HARFLER.indexOf(s.dogruHarf || 'A')]));
    const csvDogruH = new Map();
    for (const f of ['ornek_sorular_test.csv', 'ornek_sorular_karma.csv']) {
      C.cozSoruBankasiCSV(fs.readFileSync(path.join(URETILEN, f), 'utf8'), 'x').filter((s) => s.tur === 'test')
        .forEach((s) => csvDogruH.set(s.metin.trim(), s.siklar[HARFLER.indexOf(s.dogruHarf)]));
    }
    const oracleOrj = DENEME_CSV_SATIRLARI.map((s) => ({ onEk: s[0].split(' ')[0], dogru: s[7] }));
    const ayarla = (id, deger) => sayfa.evaluate((i, d) => {
      const el = document.getElementById(i); el.value = d;
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    }, id, String(deger));

    for (const sikSayisi of [5, 4]) {
      await ayarla('ayar-test-sayisi', 35);
      await ayarla('ayar-dy-sayisi', 5);
      await ayarla('ayar-sik-sayisi', sikSayisi);
      await bekle(500);
      await sayfa.evaluate(() => { window.__bloblar.length = 0; });
      await sayfa.select('#baski-kapsam-sec', 'sinif-tum-gruplar');
      await sayfa.select('#baski-format-sec', 'word-indir');
      await sayfa.click('#btn-secili-baski-calistir');
      await bekle(1500);
      const kagitHtml = await sayfa.evaluate(() => window.__bloblar[window.__bloblar.length - 1] || '');
      await sayfa.evaluate(() => { window.__bloblar.length = 0; });
      await sayfa.select('#baski-kapsam-sec', 'anahtar');
      await sayfa.click('#btn-secili-baski-calistir');
      await bekle(1500);
      const anahtarHtml = await sayfa.evaluate(() => window.__bloblar[window.__bloblar.length - 1] || '');
      kontrol(`[${sikSayisi} şık] kağıt ve anahtar çıktısı alındı`, kagitHtml.length > 5000 && anahtarHtml.length > 2000, `${kagitHtml.length}/${anahtarHtml.length}`);

      const sonuc = await sayfa.evaluate((kagit, anahtar, sikSayisi) => {
        const cikti = { gruplar: {}, anahtar: {} };
        const kd = new DOMParser().parseFromString(kagit, 'text/html');
        let aktifGrup = null;
        const sayfalar = Array.from(kd.querySelectorAll('.a4-sayfa'));
        sayfalar.forEach((sf) => {
          const etiket = (sf.querySelector('.a4-sayfa-etiket') || {}).textContent || '';
          const gm = etiket.match(/([ABCD]) GRUBU/);
          if (gm) aktifGrup = gm[1];
          if (!/SAYFA \d \/ \d/.test(etiket) || !aktifGrup) return;
          cikti.gruplar[aktifGrup] = cikti.gruplar[aktifGrup] || [];
          sf.querySelectorAll('.soru-kutu').forEach((k) => {
            const kok = k.querySelector('.soru-kok');
            if (!kok || !k.querySelector('.sik-oge')) return;
            const noEl = kok.querySelector('.soru-no');
            const no = parseInt((noEl ? noEl.textContent : '').replace('.', ''), 10);
            const metin = kok.textContent.replace(/^\s*\d+\.\s*/, '').replace(/\(\s*[\d.,]+p\s*\)\s*$/, '').trim();
            const siklar = {};
            k.querySelectorAll('.sik-oge').forEach((o) => {
              const h = (o.querySelector('.sik-harf') || {}).textContent || '';
              const m = h.match(/([A-E])/);
              if (m) siklar[m[1]] = o.textContent.replace(h, '').trim();
            });
            cikti.gruplar[aktifGrup].push({ no, metin, siklar });
          });
        });
        // Anahtar
        const bolumler = anahtar.split('KİTAPÇIĞI CEVAP ANAHTARI').slice(1);
        const grupSirasi = [...anahtar.matchAll(/([ABCD]) KİTAPÇIĞI CEVAP ANAHTARI/g)].map((m) => m[1]);
        bolumler.forEach((b, i) => {
          const test = b.split('ÇOKTAN SEÇMELİ')[1] || '';
          const kes = test.split('KLASİK DEĞERLENDİRME')[0];
          const harita = {};
          for (const m of kes.matchAll(/<strong>(\d+)\.<\/strong>\s*<strong>([A-E])<\/strong>/g)) harita[m[1]] = m[2];
          cikti.anahtar[grupSirasi[i]] = harita;
        });
        return cikti;
      }, kagitHtml, anahtarHtml, sikSayisi);

      const gruplar = Object.keys(sonuc.gruplar);
      kontrol(`[${sikSayisi} şık] 4 kitapçık grubu kağıtta bulundu`, gruplar.length === 4, gruplar.join(','));
      kontrol(`[${sikSayisi} şık] 4 kitapçık anahtarı bulundu`, Object.keys(sonuc.anahtar).length === 4, Object.keys(sonuc.anahtar).join(','));

      // Bağımsız beklenen doğru şık metinleri
      const beklenenMetin = (metin) => {
        const dm = metin.match(/^(DST-\d+)\b/); const d = dm ? oracleOrj.find((o) => o.onEk === dm[1]) : null;
        if (d) return d.dogru;
        let m = metin.match(/(\d+)\. değerlendirme sorusunda/);
        if (m) return ['Birinci seçenek', 'İkinci seçenek', 'Üçüncü seçenek', 'Dördüncü seçenek', 'Beşinci seçenek'][(Number(m[1]) - 1) % sikSayisi];
        return null;
      };
      const varsayilanDogru = new Map();
      C.VARSAYILAN_SORULAR.filter((s) => s.tur === 'test').forEach((s) => varsayilanDogru.set(s.metin.trim(), s.siklar[HARFLER.indexOf(s.dogruHarf || 'A')]));
      const csvDogru = new Map();
      for (const f of ['ornek_sorular_test.csv', 'ornek_sorular_karma.csv']) {
        C.cozSoruBankasiCSV(fs.readFileSync(path.join(URETILEN, f), 'utf8'), 'x').filter((s) => s.tur === 'test')
          .forEach((s) => csvDogru.set(s.metin.trim(), s.siklar[HARFLER.indexOf(s.dogruHarf)]));
      }

      let kontrolEdilen = 0;
      let denemeGoruldu = 0;
      for (const g of gruplar) {
        const sorularG = sonuc.gruplar[g];
        const anahtar = sonuc.anahtar[g] || {};
        kontrol(`[${sikSayisi} şık] ${g}: kağıttaki test sayısı = anahtardaki test sayısı`, sorularG.length === Object.keys(anahtar).length, `${sorularG.length}/${Object.keys(anahtar).length}`);
        sorularG.forEach((s) => {
          const harf = anahtar[String(s.no)];
          const kagittaGorunen = harf ? s.siklar[harf] : undefined;
          const beklenen = beklenenMetin(s.metin) || varsayilanDogru.get(s.metin) || csvDogru.get(s.metin);
          if (beklenen === null || beklenen === undefined) return; // bağımsız beklenen yoksa atla
          kontrolEdilen++;
          if (s.metin.startsWith('DST-')) denemeGoruldu++;
          if (kagittaGorunen !== beklenen) {
            kontrol(`[${sikSayisi} şık] ${g}-${s.no} "${s.metin.slice(0, 28)}": anahtar ${harf} -> kağıtta "${kagittaGorunen}" (beklenen "${beklenen}")`, false, JSON.stringify(s.siklar));
          }
          const sikAdedi = Object.keys(s.siklar).length;
          if (sikAdedi !== sikSayisi && sikAdedi !== 0) {
            const orj = DENEME_CSV_SATIRLARI.find((d) => s.metin.startsWith(d[0].split(' ')[0] + ' '));
            if (orj || sikSayisi === 4) kontrol(`[${sikSayisi} şık] ${g}-${s.no}: kağıtta ${sikAdedi} şık var`, false);
          }
          if (harf && sikSayisi === 4 && harf === 'E') kontrol(`[${sikSayisi} şık] ${g}-${s.no}: 4 şıklı sınavda anahtar E`, false);
        });
      }
      kontrol(`[${sikSayisi} şık] ${kontrolEdilen} soru-örneği kağıt↔anahtar eşleştirildi (deneme sorusu: ${denemeGoruldu})`, kontrolEdilen >= 40, String(kontrolEdilen));
    }
    // ---- Öğrenciye özel kağıtlar: kişi bazlı kağıt ↔ kişi bazlı anahtar ----
    await sayfa.evaluate(() => document.querySelector('[data-sekme="sekme-ogrenciler"]').click());
    const ogrInput = await sayfa.$('#input-ogrenci-csv-yukle');
    await ogrInput.uploadFile(path.join(URETILEN, 'ornek_ogrenciler.csv'));
    await bekle(600);
    await sayfa.evaluate(() => document.querySelectorAll('.sekme-btn')[0].click());
    await bekle(300);
    for (const sikSayisi of [5, 4]) {
      await ayarla('ayar-sik-sayisi', sikSayisi);
      await bekle(400);
      await sayfa.evaluate(() => { window.__bloblar.length = 0; });
      await sayfa.select('#baski-kapsam-sec', 'ogrenci-tum-sinif');
      await sayfa.select('#baski-format-sec', 'word-indir');
      await sayfa.click('#btn-secili-baski-calistir');
      await bekle(2000);
      const html = await sayfa.evaluate(() => window.__bloblar.join('\n<!--BLOB-->\n'));
      const sonuc = await sayfa.evaluate((h) => {
        const doc = new DOMParser().parseFromString(h, 'text/html');
        const kagitlar = {};
        let aktif = null;
        doc.querySelectorAll('.a4-sayfa').forEach((sf) => {
          const et = (sf.querySelector('.a4-sayfa-etiket') || {}).textContent || '';
          const m = et.match(/\((\d{6,})\s*·/);
          if (m) aktif = m[1];
          if (!/SAYFA \d \/ \d/.test(et) || !aktif) return;
          kagitlar[aktif] = kagitlar[aktif] || [];
          sf.querySelectorAll('.soru-kutu').forEach((k) => {
            const kok = k.querySelector('.soru-kok');
            if (!kok || !k.querySelector('.sik-oge')) return;
            const no = parseInt(((kok.querySelector('.soru-no') || {}).textContent || '').replace('.', ''), 10);
            const metin = kok.textContent.replace(/^\s*\d+\.\s*/, '').replace(/\(\s*[\d.,]+p\s*\)\s*$/, '').trim();
            const siklar = {};
            k.querySelectorAll('.sik-oge').forEach((o) => {
              const hh = (o.querySelector('.sik-harf') || {}).textContent || '';
              const mm = hh.match(/([A-E])/);
              if (mm) siklar[mm[1]] = o.textContent.replace(hh, '').trim();
            });
            kagitlar[aktif].push({ no, metin, siklar });
          });
        });
        // Kişi bazlı anahtar tablosu: <td>ogrNo</td> ... <td>1:B(A→B) 2:C ...</td>
        const anahtarlar = {};
        doc.querySelectorAll('tr').forEach((tr) => {
          const td = Array.from(tr.querySelectorAll('td'));
          if (td.length < 6) return;
          const no = td[1].textContent.trim();
          const testHucre = td[td.length - 1].textContent;
          if (!/^\d{6,}$/.test(no)) return;
          const harita = {};
          for (const mm of testHucre.matchAll(/(\d+):([A-E])/g)) harita[mm[1]] = mm[2];
          anahtarlar[no] = harita;
        });
        return { kagitlar, anahtarlar };
      }, html);
      const ogrNolar = Object.keys(sonuc.kagitlar);
      kontrol(`[Öğrenciye özel, ${sikSayisi} şık] kağıt sayısı = 5 öğrenci`, ogrNolar.length === 5, ogrNolar.join(','));
      kontrol(`[Öğrenciye özel, ${sikSayisi} şık] kişi bazlı anahtar tablosu bulundu`, Object.keys(sonuc.anahtarlar).length === 5, Object.keys(sonuc.anahtarlar).join(','));
      let toplam = 0;
      for (const no of ogrNolar) {
        const harita = sonuc.anahtarlar[no] || {};
        for (const s of sonuc.kagitlar[no]) {
          const dm = s.metin.match(/^(DST-\d+)\b/);
          let beklenen = dm ? DENEME_CSV_SATIRLARI.find((d) => d[0].split(' ')[0] === dm[1])[7] : (varsayilanDogruH.get(s.metin) || csvDogruH.get(s.metin));
          const om = s.metin.match(/(\d+)\. değerlendirme sorusunda/);
          if (!beklenen && om) beklenen = ['Birinci seçenek', 'İkinci seçenek', 'Üçüncü seçenek', 'Dördüncü seçenek', 'Beşinci seçenek'][(Number(om[1]) - 1) % sikSayisi];
          if (!beklenen) continue;
          toplam++;
          const harf = harita[String(s.no)];
          if (!harf || s.siklar[harf] !== beklenen) kontrol(`[Öğrenciye özel ${sikSayisi}] ${no}-${s.no} "${s.metin.slice(0, 26)}": anahtar ${harf} -> "${s.siklar[harf]}" (beklenen "${beklenen}")`, false);
        }
      }
      kontrol(`[Öğrenciye özel, ${sikSayisi} şık] ${toplam} soru-örneği kişi bazlı kağıt↔anahtar uyumlu`, toplam >= 50, String(toplam));
    }
    kontrol('Tarayıcıda JS hatası/uyarı penceresi yok', hatalar.length === 0, hatalar.join(' | '));
  } finally {
    await tarayici.close();
    server.close();
  }
}

(async () => {
  console.log('=== DOĞRU ŞIK UÇTAN UCA TESTİ ===');
  const csv = denemeCsvUret();
  const sorular = ayristiriciTestleri(csv);
  kitapcikTestleri(sorular);
  await tarayiciTestleri();
  console.log(`\n=== ${gecen} KONTROL GEÇTİ · ${hata} HATA ===`);
  process.exit(hata ? 1 : 0);
})().catch((e) => { console.error('TEST ÇÖKTÜ:', e); process.exit(2); });
