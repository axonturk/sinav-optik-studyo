/* ==========================================================================
   SINAVLARIM + KAĞIT KİMLİĞİ TESTİ (Chrome + puppeteer-core)
   - Telefonda birim "sınav": aynı dersin aynı yapıdaki Vize ve Final'i ayrı sınavlar olarak listelenir.
   - Kağıttaki sınav kimlik kodu (geometri matrisi) doğru sınavı kendisi seçtirir ve o sınavın anahtarıyla puanlar.
   - Telefonda olmayan sınavın kağıdı kaydedilmez; kodsuz (eski) kağıt açık sınavla okunur.
   - Sonuçlar sınav başına ayrı tutulur, telefon kapatılıp açılınca seçili sınav ve sonuçlar korunur.
   Çalıştırma: node sinavlarim-test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { baslatSunucu } = require('./server.js');
const C = require('./guvenlik-ve-veri.js');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  .find((p) => fs.existsSync(p));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let gecen = 0;
let hata = 0;
function kontrol(ad, kosul, detay = '') {
  if (kosul) gecen++; else hata++;
  console.log(`  ${kosul ? '✓' : '✗ HATA'} ${ad}${detay && (!kosul || process.env.AYRINTI) ? ` — ${detay}` : ''}`);
}
async function bekleKosul(fn, ms = 8000) {
  const son = Date.now() + ms;
  while (Date.now() < son) {
    try { if (await fn()) return true; } catch (_) {}
    await bekle(150);
  }
  return false;
}

const GIZLI_VIZE = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';
const GIZLI_FINAL = '0F1E2D3C4B5A69788796A5B4C3D2E1F0';
const GIZLI_YABANCI = '99999999999999999999999999999999';
const yapi = (gizli, testA, ekstra = {}) => Object.assign({
  dySayisi: 5, testSayisi: 5, klasikSayisi: 0, sikSayisi: 5, kimlikModu: 'son3', haneSayisi: 3,
  dyToplamPuan: 40, testToplamPuan: 60, klasikToplamPuan: 0,
  sinavGizliAnahtar: gizli,
  cevapAnahtarlari: { A: { dy: ['D', 'Y', 'D', 'Y', 'D'], test: testA, klasik: [] }, B: { dy: ['Y', 'D', 'Y', 'D', 'Y'], test: ['E', 'D', 'C', 'B', 'A'], klasik: [] } }
}, ekstra);
const KASA = {
  dersler: [{ id: 'DERS-AG', kod: 'BIL101', ad: 'Ağ Temelleri' }],
  ogrenciler: [
    { ogrNo: '247419053', adSoyad: 'Deneme Bir', dersIdler: ['DERS-AG'] },
    { ogrNo: '257419205', adSoyad: 'Deneme İki', dersIdler: ['DERS-AG'] }
  ],
  kayitliSinavlar: [
    { id: 'S-VIZE', dersId: 'DERS-AG', sinavKodu: 'BIL101-5-5-0', ad: 'BIL101 Vize · 10.11.2026', guncellemeMs: 1000, sinavYapisi: yapi(GIZLI_VIZE, ['A', 'B', 'C', 'D', 'E']) },
    { id: 'S-FINAL', dersId: 'DERS-AG', sinavKodu: 'BIL101-5-5-0', ad: 'BIL101 Final · 14.11.2026', guncellemeMs: 2000, sinavYapisi: yapi(GIZLI_FINAL, ['E', 'E', 'E', 'E', 'E']) }
  ]
};

(async () => {
  console.log('=== SINAVLARIM + KAĞIT KİMLİĞİ TESTİ ===');
  // Çekirdek: kod tur dönüşü ve eski kağıt
  const kV = C.uretSinavKimlikKodu(GIZLI_VIZE);
  const kF = C.uretSinavKimlikKodu(GIZLI_FINAL);
  const cozV = C.cozOptikGeometriMatrisi(C.kodlaOptikGeometriMatrisi(yapi(GIZLI_VIZE, [])));
  const cozEski = C.cozOptikGeometriMatrisi(C.kodlaOptikGeometriMatrisi({ dySayisi: 5, testSayisi: 5 }));
  kontrol('Sınav kimlik kodu matrise yazılıp geri okunur; eski (kodsuz) matris 0 verir', cozV.sinavKimlikKodu === kV && cozEski.sinavKimlikKodu === 0 && kV !== kF, `${kV}/${kF}/${cozEski.sinavKimlikKodu}`);

  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const hatalar = [];
  const tel = await (await tarayici.createBrowserContext()).newPage();
  await tel.setViewport({ width: 390, height: 844 });
  tel.on('pageerror', (e) => hatalar.push(e.message));
  tel.on('dialog', async (d) => { await d.accept(); });
  const girdiYolu = path.resolve('test-artifacts', 'sinavlarim.png');
  fs.mkdirSync(path.dirname(girdiYolu), { recursive: true });

  const api = async (yol, govde, token, metot) => {
    const r = await fetch(taban + yol, {
      method: metot || (govde === undefined ? 'GET' : 'POST'),
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
      body: govde === undefined ? undefined : JSON.stringify(govde)
    });
    return { s: r.status, v: await r.json().catch(() => ({})) };
  };
  const durumOku = () => tel.evaluate(() => {
    const m = window.__mobilDurumOku();
    const p = m.dersPaketleriHaritasi[m.dersId] || {};
    return {
      dersId: m.dersId,
      aktifSinavId: m.sinavYapisi.aktifSinavId || '',
      testA: (m.sinavYapisi.cevapAnahtarlari.A.test || []).join(''),
      okumalar: m.okumaSonuclari.map((s) => ({ no: s.ogrNo, puan: s.toplamPuan })),
      sinavSayisi: (p.sinavlar || []).length
    };
  });
  const kagitOkut = async (gizli, testCevap, noKod, kimliksiz = false) => {
    const url = await tel.evaluate((g, tc, no, ks, kimliksizMi) => {
      const Cm = window.SinavOptikCekirdek;
      const cv = document.createElement('canvas');
      const y = { dySayisi: 5, testSayisi: 5, klasikSayisi: 0, sikSayisi: 5, kimlikModu: 'son3', haneSayisi: 3, sinavGizliAnahtar: kimliksizMi ? '' : g };
      Cm.cizSentetikOptikFormCanvas(cv, y, { grup: 'A', ogrNoKod: no, dyCevaplar: ['D', 'Y', 'D', 'Y', 'D'], testCevaplar: tc, klasikPuanlar: [] });
      return cv.toDataURL('image/png');
    }, gizli, testCevap, noKod, null, kimliksiz);
    fs.writeFileSync(girdiYolu, Buffer.from(url.split(',')[1], 'base64'));
    await (await tel.$('#input-mobil-foto')).uploadFile(girdiYolu);
    await bekle(1600);
  };

  try {
    // Hoca girişi + bulut kasası + eşleştirme kodu (API ile)
    const giris = await api('/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
    const token = giris.v.token;
    const mevcut = await api('/api/bulut-kasa', undefined, token);
    const put = await api('/api/bulut-kasa', { veri: KASA, bazRevizyonNo: Number(mevcut.v.revizyonNo) || undefined, silmeOnayi: true, zorlaEz: true }, token, 'PUT');
    kontrol('Bulutta aynı dersin iki sınavı (Vize ve Final, aynı yapı) var', put.s === 200, String(put.s));
    const es = await api('/api/telefon-eslestir/olustur', {}, token);
    await tel.goto(`${taban}/optik-mobil#eslestir=${es.v.kod}`, { waitUntil: 'networkidle0' });
    await bekleKosul(() => tel.$eval('#mobil-hesap-durum', (e) => /güncel/.test(e.textContent)), 10000);

    let d = await durumOku();
    kontrol('Bağlanınca dersin iki sınavı telefona indi', d.sinavSayisi === 2, JSON.stringify(d));
    kontrol('Varsayılan olarak en son sınav (Final) seçili', d.aktifSinavId === 'S-FINAL' && d.testA === 'EEEEE', JSON.stringify(d));

    // Sınavlarım listesi
    await tel.click('#btn-mobil-ders-degistir');
    await bekleKosul(() => tel.$eval('#mobil-sinav-secici', (e) => !e.hidden));
    const satirlar = await tel.$$eval('#mobil-sinav-secici-liste [data-sinav-id]', (bs) => bs.map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
    kontrol('Sınavlarım iki sınavı adı, öğrenci sayısı ve "Hazır" durumuyla listeler', satirlar.length === 2 && satirlar.some((t) => /Vize/.test(t)) && satirlar.some((t) => /Final/.test(t) && /seçili/.test(t)) && satirlar.every((t) => /2 öğrenci/.test(t) && /Hazır/.test(t)), JSON.stringify(satirlar));
    await tel.click('#mobil-sinav-secici-liste [data-sinav-id="S-VIZE"]');
    await bekle(400);
    d = await durumOku();
    const kart = await tel.$eval('#mobil-hesap-aktif-ders', (e) => e.textContent);
    kontrol('Listeden Vize seçilince Vize anahtarı yüklenir, kart sınav adını gösterir', d.aktifSinavId === 'S-VIZE' && d.testA === 'ABCDE' && /Vize/.test(kart), `${JSON.stringify(d)} · ${kart}`);

    // Vize açıkken Vize kağıdı → Vize'ye kayıt
    await kagitOkut(GIZLI_VIZE, ['A', 'B', 'C', 'D', 'E'], '053');
    d = await durumOku();
    kontrol('Vize kağıdı Vize anahtarıyla 100 puan', d.aktifSinavId === 'S-VIZE' && d.okumalar.length === 1 && d.okumalar[0].no === '247419053' && Number(d.okumalar[0].puan) === 100, JSON.stringify(d));

    // Vize açıkken FINAL kağıdı → telefon Final'e kendisi geçer, Final anahtarıyla puanlar, Vize sonuçları korunur
    await kagitOkut(GIZLI_FINAL, ['E', 'E', 'E', 'E', 'E'], '205');
    d = await durumOku();
    const uyari = await tel.$eval('#m-uyari', (e) => e.textContent);
    kontrol('Final kağıdı okununca telefon Final sınavına kendisi geçti', d.aktifSinavId === 'S-FINAL', `${JSON.stringify(d)} · ${uyari}`);
    kontrol('Final kağıdı Final anahtarıyla 100 puan; Final listesinde yalnız bu kağıt var', d.okumalar.length === 1 && d.okumalar[0].no === '257419205' && Number(d.okumalar[0].puan) === 100, JSON.stringify(d.okumalar));
    await tel.click('#btn-mobil-ders-degistir');
    await tel.click('#mobil-sinav-secici-liste [data-sinav-id="S-VIZE"]');
    await bekle(400);
    d = await durumOku();
    kontrol('Vize\'ye dönülünce Vize sonuçları duruyor (sınavlar karışmadı)', d.okumalar.length === 1 && d.okumalar[0].no === '247419053', JSON.stringify(d.okumalar));

    // Telefonda olmayan sınavın kağıdı kaydedilmez
    await kagitOkut(GIZLI_YABANCI, ['A', 'A', 'A', 'A', 'A'], '205');
    d = await durumOku();
    const yabanciUyari = await tel.$eval('#m-uyari', (e) => e.textContent);
    kontrol('Telefonda olmayan sınavın kağıdı kaydedilmez, "Senkronize Et" denir', d.aktifSinavId === 'S-VIZE' && d.okumalar.length === 1 && /telefonda olmayan bir sınava ait/.test(yabanciUyari), `${JSON.stringify(d)} · ${yabanciUyari}`);

    // Eski (kodsuz) kağıt açık sınavla okunur
    await kagitOkut('', ['A', 'B', 'C', 'D', 'E'], '205', true);
    d = await durumOku();
    kontrol('Kodsuz eski kağıt açık sınavla (Vize) okunur', d.aktifSinavId === 'S-VIZE' && d.okumalar.length === 2 && d.okumalar.some((o) => o.no === '257419205' && Number(o.puan) === 100), JSON.stringify(d.okumalar));

    // Kapat-aç: seçili sınav, sınav listesi ve sonuçlar korunur
    await tel.goto(`${taban}/optik-mobil.html`, { waitUntil: 'networkidle0' });
    await bekle(1500);
    d = await durumOku();
    kontrol('Telefon kapatılıp açılınca seçili sınav, sınav listesi ve sonuçlar korunur', d.aktifSinavId === 'S-VIZE' && d.sinavSayisi === 2 && d.okumalar.length === 2, JSON.stringify(d));

    // Senkronize Et öğretmenin seçimini ezmez
    await tel.click('#btn-mobil-senkronize');
    await bekleKosul(() => tel.$eval('#mobil-hesap-durum', (e) => /güncel/.test(e.textContent)), 8000);
    await bekle(300);
    d = await durumOku();
    kontrol('"Senkronize Et" öğretmenin seçtiği sınavı (Vize) değiştirmez', d.aktifSinavId === 'S-VIZE' && d.testA === 'ABCDE' && d.okumalar.length === 2, JSON.stringify(d));

    // Seçili sınav yokken (kilitli) Final kağıdı okutulursa Final'e geçip okur
    await tel.evaluate(() => {
      const kart = document.getElementById('btn-mobil-ders-degistir');
      void kart;
    });
    await kagitOkut(GIZLI_FINAL, ['E', 'E', 'E', 'E', 'E'], '053');
    d = await durumOku();
    kontrol('Final kağıdı tekrar okununca Final\'e geçilir ve ikinci Final kağıdı eklenir', d.aktifSinavId === 'S-FINAL' && d.okumalar.length === 2, JSON.stringify(d));

    kontrol('Sayfada JavaScript hatası yok', hatalar.length === 0, hatalar.join(' | '));
  } catch (err) {
    hata++;
    console.log('  ✗ HATA beklenmeyen:', err.stack || err.message);
  } finally {
    await tarayici.close();
    server.close();
  }
  console.log(`\n=== ${gecen} KONTROL GEÇTİ · ${hata} HATA ===`);
  process.exit(hata ? 1 : 0);
})();
