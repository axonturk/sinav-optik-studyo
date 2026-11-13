/* ==========================================================================
   MOBİL PWA VERİ KORUMA TESTİ (Chrome + puppeteer-core)
   Gerçek öğretmen akışı: liste QR -> kurulum QR -> kağıt okuma -> eşleştirme -> kağıt QR.
   Korunan kurallar:
   1) Son 2 hanesi aynı iki öğrencinin kağıdı öğretmen seçene kadar hiçbir öğrenciye yazılmaz, kimsenin notu silinmez.
   2) Aynı öğrenciye farklı ikinci kağıt eski notu silmez; "hangisi geçerli" kararı bekler.
   3) Ayrı okutulan kağıt QR'ı daha önce okunmuş hiçbir kayda uygulanmaz.
   4) Yalnız liste QR'ı ile açılan (kurulum QR'ı okutulmamış) derste kağıt puanlanmaz.
   Çalıştırma: node pwa-veri-koruma-test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { baslatSunucu } = require('./server.js');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  .find((p) => fs.existsSync(p));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let gecen = 0;
let hata = 0;
function kontrol(ad, kosul, detay = '') {
  if (kosul) gecen++; else hata++;
  console.log(`  ${kosul ? '✓' : '✗ HATA'} ${ad}${detay && (!kosul || process.env.AYRINTI) ? ` — ${detay}` : ''}`);
}

const LISTE = [
  { ogrNo: '2023104011', adSoyad: 'Ali Yılmaz' },
  { ogrNo: '2023105011', adSoyad: 'Ayşe Kaya' },
  { ogrNo: '2023104022', adSoyad: 'Mehmet Demir' },
  { ogrNo: '2023104033', adSoyad: 'Zeynep Ak' }
];
const YAPI = {
  dersId: 'BIL101', dersAd: 'BIL101 - Ağ Temelleri', sinavKodu: 'BIL101-VIZE',
  dySayisi: 5, testSayisi: 5, klasikSayisi: 0, sikSayisi: 5, kimlikModu: 'son2', haneSayisi: 2,
  dyToplamPuan: 40, testToplamPuan: 60, klasikToplamPuan: 0,
  sinavGizliAnahtar: 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
  cevapAnahtarlari: { A: { dy: ['D', 'Y', 'D', 'Y', 'D'], test: ['A', 'B', 'C', 'D', 'E'], klasik: [] } }
};

(async () => {
  console.log('=== MOBİL PWA VERİ KORUMA TESTİ ===');
  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const sayfa = await tarayici.newPage();
  await sayfa.setViewport({ width: 390, height: 844 });
  const hatalar = [];
  sayfa.on('pageerror', (e) => hatalar.push(e.message));
  sayfa.on('dialog', async (d) => { hatalar.push('dialog: ' + d.message()); await d.dismiss(); });

  const okumalar = () => sayfa.evaluate(() => window.__mobilDurumOku().okumaSonuclari.map((s) => ({
    id: s.id, ogrNo: s.ogrNo, ad: s.adSoyad, puan: s.toplamPuan, bekliyor: Boolean(s.kimlikEslesmeBekliyor), muk: s.mukerrerEskiId || ''
  })));
  // Uygulamanın kendi optik formunu çizip "Fotoğraf Seç" ile okut
  const girdiYolu = require('path').resolve('test-artifacts', 'pwa-veri-koruma.png');
  fs.mkdirSync(require('path').dirname(girdiYolu), { recursive: true });
  const kagitOkut = async (noKod, testCevap) => {
    const url = await sayfa.evaluate((no, tc) => {
      const C = window.SinavOptikCekirdek;
      const d = window.__mobilDurumOku();
      const cv = document.createElement('canvas');
      C.cizSentetikOptikFormCanvas(cv, d.sinavYapisi, { grup: 'A', ogrNoKod: no, dyCevaplar: ['D', 'Y', 'D', 'Y', 'D'], testCevaplar: tc, klasikPuanlar: [] });
      return cv.toDataURL('image/png');
    }, noKod, testCevap);
    fs.writeFileSync(girdiYolu, Buffer.from(url.split(',')[1], 'base64'));
    await (await sayfa.$('#input-mobil-foto')).uploadFile(girdiYolu);
    await bekle(1500);
  };

  try {
    await sayfa.goto(`${taban}/optik-mobil.html`, { waitUntil: 'networkidle0' });

    // 4) Yalnız liste QR'ı: kurulum yok -> kağıt puanlanmaz
    const ogr = await sayfa.evaluate((l) => window.SinavOptikCekirdek.uretOgrenciQrPaketi(l, { tabanAdres: location.origin, dersId: 'BIL101', dersKod: 'BIL101', dersAd: 'BIL101 — Ağ Temelleri' }), LISTE);
    await sayfa.goto(ogr.tekUrl, { waitUntil: 'networkidle0' });
    await bekle(600);
    await kagitOkut('22', ['A', 'B', 'C', 'D', 'E']);
    const kurulumsuz = await okumalar();
    const uyari = await sayfa.$eval('#m-uyari', (e) => e.textContent);
    kontrol('Kurulum QR\'ı okutulmamış derste kağıt puanlanmaz ve uyarı verilir', kurulumsuz.length === 0 && /cevap anahtarı yok/.test(uyari), `${kurulumsuz.length} kayıt · ${uyari}`);

    // Kurulum QR'ı
    const setupUrl = await sayfa.evaluate((y, l) => window.SinavOptikCekirdek.uretKompaktSetupQrPaketi(y, l, location.origin).url, YAPI, LISTE);
    await sayfa.goto(setupUrl, { waitUntil: 'networkidle0' });
    await bekle(700);

    // 1) Çakışan son 2 hane
    await kagitOkut('11', ['A', 'B', 'C', 'D', 'E']); // Ali'nin kağıdı (100)
    await kagitOkut('11', ['A', 'A', 'A', 'A', 'A']); // Ayşe'nin kağıdı (farklı cevaplar)
    let r = await okumalar();
    kontrol('Son 2 hanesi aynı iki kağıt iki ayrı kayıt olarak durur (biri diğerinin üzerine yazmaz)', r.length === 2, JSON.stringify(r));
    kontrol('Çakışan kağıtlar öğretmen seçene kadar hiçbir öğrenciye yazılmaz', r.every((k) => k.bekliyor && String(k.ogrNo).startsWith('BEKLEYEN')), JSON.stringify(r));
    const ilk = r[r.length - 1];
    const ikinci = r[0];
    // Öğretmen seçimi: eşleştirme penceresi üzerinden
    const ata = async (id, no) => {
      await sayfa.evaluate((i) => document.querySelector(`[data-tablo-eslestir="${i}"]`) ? document.querySelector(`[data-tablo-eslestir="${i}"]`).click() : null, id);
      await bekle(250);
      const varMi = await sayfa.evaluate((n) => Boolean(document.querySelector(`[data-eslestir-sec-no="${n}"]`)), no);
      if (varMi) await sayfa.evaluate((n) => document.querySelector(`[data-eslestir-sec-no="${n}"]`).click(), no);
      await bekle(400);
      return varMi;
    };
    const a1 = await ata(ilk.id, '2023104011');
    const a2 = await ata(ikinci.id, '2023105011');
    r = await okumalar();
    const ali = r.find((k) => k.ogrNo === '2023104011');
    const ayse = r.find((k) => k.ogrNo === '2023105011');
    kontrol('Öğretmen seçince her kağıt doğru öğrenciye yerleşir (Ali 100, Ayşe ayrı not)', a1 && a2 && ali && ayse && ali.puan === 100 && ayse.puan !== 100 && r.length === 2, JSON.stringify(r));

    // 2) Aynı öğrenciye farklı ikinci kağıt
    await kagitOkut('22', ['A', 'B', 'C', 'D', 'E']); // Mehmet 100
    await kagitOkut('22', ['E', 'E', 'E', 'E', 'E']); // Mehmet'e ikinci, farklı kağıt
    r = await okumalar();
    const mehmetYerlesik = r.filter((k) => k.ogrNo === '2023104022');
    const mukerrer = r.find((k) => k.muk);
    kontrol('Aynı öğrenciye farklı ikinci kağıt eski notu silmez (Mehmet 100 korunur)', mehmetYerlesik.length === 1 && mehmetYerlesik[0].puan === 100, JSON.stringify(r));
    kontrol('İkinci kağıt "hangisi geçerli" kararı bekler', Boolean(mukerrer && mukerrer.bekliyor), JSON.stringify(mukerrer));
    const kararVar = await sayfa.evaluate((id) => {
      const b = document.querySelector(`[data-m-mukerrer-karar="eski"][data-m-mukerrer-id="${id}"]`);
      if (!b) return false;
      b.click();
      return true;
    }, mukerrer ? mukerrer.id : '');
    await bekle(300);
    r = await okumalar();
    kontrol('"Eskisi kalsın" kararı ikinci kağıdı kaldırır, eski not kalır', !r.some((k) => k.muk) && r.filter((k) => k.ogrNo === '2023104022').length === 1, `karar düğmesi ${kararVar} · ${JSON.stringify(r)}`);

    await kagitOkut('22', ['A', 'B', 'C', 'D', 'E']); // aynı kağıt tekrar
    const r2 = await okumalar();
    kontrol('Birebir aynı kağıdın tekrar okutulması yeni kayıt açmaz', r2.length === r.length, `${r.length} -> ${r2.length}`);

    // 3) Ayrı okutulan kağıt QR'ı eski kayda uygulanmaz
    const once = JSON.stringify(await okumalar());
    const oqv2 = await sayfa.evaluate((y) => window.SinavOptikCekirdek.uretSifreliOptikKagitQrPaketi({
      sinavKodu: y.sinavKodu, grup: 'A', ogrNo: '2023104033', dyAnahtar: ['Y', 'Y', 'Y', 'Y', 'Y'], testAnahtar: ['A', 'A', 'A', 'A', 'A'], dySayisi: 5, testSayisi: 5, klasikSayisi: 0
    }, y.sinavGizliAnahtar), YAPI);
    await sayfa.evaluate((q) => { document.getElementById('girdi-pwa-qr-metin').value = q; document.getElementById('btn-pwa-qr-metin-yukle').click(); }, oqv2);
    await bekle(500);
    kontrol('Ayrı okutulan kağıt QR\'ı daha önce okunmuş hiçbir kaydı değiştirmez', JSON.stringify(await okumalar()) === once);
    await kagitOkut('33', ['A', 'A', 'A', 'A', 'A']);
    r = await okumalar();
    const zeynep = r.find((k) => k.ogrNo === '2023104033');
    kontrol('Bekleyen kağıt QR\'ı sıradaki kağıda (Zeynep) uygulanır', Boolean(zeynep), JSON.stringify(r));

    kontrol('JS hatası / uyarı penceresi yok', hatalar.length === 0, hatalar.join(' | '));
  } finally {
    try { fs.unlinkSync(girdiYolu); } catch (_) {}
    await tarayici.close();
    server.close();
  }
  console.log(`\n=== ${gecen} KONTROL GEÇTİ · ${hata} HATA ===`);
  process.exit(hata === 0 ? 0 : 1);
})().catch((e) => { console.error('TEST HATASI:', e); process.exit(1); });
