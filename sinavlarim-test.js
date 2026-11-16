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

  // Paket: kayıtlar en yeni başta tutulur (unshift); 12 sınavlı derste en yenisi pakette ve "aktif" olmalı
  {
    const t0 = 1763000000000;
    const ks = [];
    for (let i = 0; i < 12; i++) {
      ks.unshift({ id: `KS-${(t0 + i * 60000).toString(36).toUpperCase()}AB`, dersId: 'D1', sinavKodu: `K-${i}`, ad: `Sınav ${i}`, sinavYapisi: yapi(`${String(i).padStart(2, '0')}`.repeat(16), ['A', 'A', 'A', 'A', 'A']) });
    }
    const pk = C.uretMobilDersPaketleriOzeti({ dersler: [{ id: 'D1', kod: 'X1', ad: 'Ders' }], kayitliSinavlar: ks })[0];
    const adlar = pk.kayitliSinavlar.map((x) => x.kayitAdi);
    kontrol('Pakete dersin EN YENİ sınavları girer (12 sınavın hepsi; eskiden en eski 10 gidiyordu)', pk.kayitliSinavlar.length === 12 && adlar.includes('Sınav 11') && adlar.includes('Sınav 0'), adlar.join(','));
    kontrol('Paketin aktif sınavı en yeni sınavdır; zaman kimlikten çıkarılır', pk.aktifSinavYapisi.kayitAdi === 'Sınav 11' && pk.kayitliSinavlar[11].guncellemeMs === t0 + 11 * 60000, pk.aktifSinavYapisi.kayitAdi);
    const donemli = C.uretMobilDersPaketleriOzeti({ aktifDonemId: 'D-26', dersler: [{ id: 'A1', kod: 'Y', ad: 'Yeni', donemId: 'D-26' }, { id: 'E1', kod: 'E', ad: 'Eski', donemId: 'D-25' }, { id: 'S1', kod: 'S', ad: 'Dönemsiz' }] });
    kontrol('Telefon paketine yalnız aktif dönemin (ve dönemsiz) dersleri girer', donemli.map((x) => x.id).join(',') === 'A1,S1', donemli.map((x) => x.id).join(','));
  }

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
    await tel.evaluate(() => { const b = document.getElementById('btn-mobil-dogrulama-tamam'); const k = document.getElementById('mobil-dogrulama'); if (k && !k.hidden && b) b.click(); });
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
    // Uyarı geçmişi gözlemcisi (sayfa yeniden yüklenince yeniden kurulur)
    const uyariSifirla = () => tel.evaluate(() => {
      window.__uyariGecmisi = [];
      if (window.__uyariGozlemci) return;
      const el = document.getElementById('m-uyari');
      window.__uyariGozlemci = new MutationObserver(() => window.__uyariGecmisi.push(el.textContent));
      window.__uyariGozlemci.observe(el, { childList: true, characterData: true, subtree: true });
    });
    await uyariSifirla();
    const uyarilar = () => tel.evaluate(() => (window.__uyariGecmisi || []).join(' ¦ '));

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

    // Bilgisayarda SONRADAN kaydedilen sınavın (Bütünleme) kağıdı: telefon kendisi senkronlar ve kağıdı okur
    const GIZLI_BUT = '5A5A5A5A5A5A5A5A5A5A5A5A5A5A5A5A';
    const KASA_BUT = JSON.parse(JSON.stringify(KASA));
    KASA_BUT.kayitliSinavlar.push({ id: 'S-BUT', dersId: 'DERS-AG', sinavKodu: 'BIL101-5-5-0', ad: 'BIL101 Bütünleme · 20.11.2026', guncellemeMs: 3000, sinavYapisi: yapi(GIZLI_BUT, ['C', 'C', 'C', 'C', 'C']) });
    const mv2 = await api('/api/bulut-kasa', undefined, token);
    const putBut = await api('/api/bulut-kasa', { veri: KASA_BUT, bazRevizyonNo: Number(mv2.v.revizyonNo) || undefined, silmeOnayi: true, zorlaEz: true }, token, 'PUT');
    await uyariSifirla();
    await kagitOkut(GIZLI_BUT, ['C', 'C', 'C', 'C', 'C'], '205');
    const butGeldi = await bekleKosul(async () => {
      await tel.evaluate(() => { const b = document.getElementById('btn-mobil-dogrulama-tamam'); const k = document.getElementById('mobil-dogrulama'); if (k && !k.hidden && b) b.click(); });
      const x = await durumOku();
      return x.aktifSinavId === 'S-BUT' && x.okumalar.length === 1;
    }, 10000);
    d = await durumOku();
    const butUyari = await uyarilar();
    kontrol('Telefonda olmayan sınavın kağıdı: telefon kendisi senkronladı ("bilgisayardan alınıyor")', putBut.s === 200 && /telefonda yok; bilgisayardan alınıyor/.test(butUyari) && /bilgisayardan alındı/.test(butUyari), butUyari);
    kontrol('Senkron sonrası kağıt Bütünleme anahtarıyla okundu (100 puan), QR gerekmedi', butGeldi && Number(d.okumalar[0] && d.okumalar[0].puan) === 100 && d.okumalar[0].no === '257419205', JSON.stringify(d));
    await tel.click('#btn-mobil-ders-degistir');
    await tel.click('#mobil-sinav-secici-liste [data-sinav-id="S-VIZE"]');
    await bekle(400);

    // Bilgisayarda da olmayan sınavın kağıdı kaydedilmez
    await uyariSifirla();
    await kagitOkut(GIZLI_YABANCI, ['A', 'A', 'A', 'A', 'A'], '205');
    await bekle(1500);
    d = await durumOku();
    const yabanciUyari = await uyarilar();
    kontrol('Hiçbir yerde olmayan sınavın kağıdı kaydedilmez ve öğretmen uyarılır', d.aktifSinavId === 'S-VIZE' && d.okumalar.length === 1 && /bilgisayarda da yok|telefonda olmayan bir sınava ait/.test(yabanciUyari), `${JSON.stringify(d)} · ${yabanciUyari}`);

    // Eski (kodsuz) kağıt açık sınavla okunur
    await kagitOkut('', ['A', 'B', 'C', 'D', 'E'], '205', true);
    d = await durumOku();
    kontrol('Kodsuz eski kağıt açık sınavla (Vize) okunur', d.aktifSinavId === 'S-VIZE' && d.okumalar.length === 2 && d.okumalar.some((o) => o.no === '257419205' && Number(o.puan) === 100), JSON.stringify(d.okumalar));

    // Kapat-aç: seçili sınav, sınav listesi ve sonuçlar korunur
    await tel.goto(`${taban}/optik-mobil.html`, { waitUntil: 'networkidle0' });
    await bekle(1500);
    d = await durumOku();
    kontrol('Telefon kapatılıp açılınca seçili sınav, sınav listesi ve sonuçlar korunur', d.aktifSinavId === 'S-VIZE' && d.sinavSayisi === 3 && d.okumalar.length === 2, JSON.stringify(d));

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

    // Aynı kağıt kodunu taşıyan iki FARKLI sınav (eski verilerde olabilir): telefon tahmin etmez, öğretmene seçtirir
    const crypto = require('crypto');
    const kodHarita = new Map();
    let cak = null;
    while (!cak) {
      const g = crypto.randomBytes(16).toString('hex').toUpperCase();
      const k = C.uretSinavKimlikKodu(g);
      if (kodHarita.has(k) && kodHarita.get(k) !== g) cak = [kodHarita.get(k), g];
      kodHarita.set(k, g);
    }
    const KASA_CAK = JSON.parse(JSON.stringify(KASA_BUT));
    KASA_CAK.kayitliSinavlar.push(
      { id: 'S-CAK1', dersId: 'DERS-AG', sinavKodu: 'BIL101-5-5-0', ad: 'BIL101 Quiz 1', guncellemeMs: 4000, sinavYapisi: yapi(cak[0], ['B', 'B', 'B', 'B', 'B']) },
      { id: 'S-CAK2', dersId: 'DERS-AG', sinavKodu: 'BIL101-5-5-0', ad: 'BIL101 Quiz 2', guncellemeMs: 5000, sinavYapisi: yapi(cak[1], ['D', 'D', 'D', 'D', 'D']) }
    );
    const mv3 = await api('/api/bulut-kasa', undefined, token);
    await api('/api/bulut-kasa', { veri: KASA_CAK, bazRevizyonNo: Number(mv3.v.revizyonNo) || undefined, silmeOnayi: true, zorlaEz: true }, token, 'PUT');
    await tel.click('#btn-mobil-senkronize');
    await bekleKosul(async () => (await durumOku()).sinavSayisi === 5, 8000);
    const onceCak = await durumOku();
    await uyariSifirla();
    await kagitOkut(cak[0], ['B', 'B', 'B', 'B', 'B'], '053');
    await bekle(800);
    const sonraCak = await durumOku();
    const cakUyari = await uyarilar();
    kontrol('Aynı kodlu iki farklı sınav varken kağıt hiçbirine atanmaz, kaydedilmez, öğretmen uyarılır',
      onceCak.sinavSayisi === 5 && sonraCak.aktifSinavId === onceCak.aktifSinavId && sonraCak.okumalar.length === onceCak.okumalar.length && /farklı sınav var/.test(cakUyari),
      `${JSON.stringify(onceCak)} → ${JSON.stringify(sonraCak)} · ${cakUyari}`);

    // Ö2: aktif dönem dışındaki ders telefonda listelenmez (verisi silinmez)
    const KASA_DONEM = JSON.parse(JSON.stringify(KASA));
    KASA_DONEM.dersler.push({ id: 'DERS-ESKI', kod: 'ESK100', ad: 'Eski Ders', donemId: 'D-2025' });
    KASA_DONEM.dersler[0].donemId = 'D-2026';
    KASA_DONEM.donemler = [{ id: 'D-2026', ad: '2026-2027 Güz' }, { id: 'D-2025', ad: '2025-2026 Bahar', arsivlendi: true }];
    const mv4 = await api('/api/bulut-kasa', undefined, token);
    await api('/api/bulut-kasa', { veri: KASA_DONEM, bazRevizyonNo: Number(mv4.v.revizyonNo) || undefined, silmeOnayi: true, zorlaEz: true }, token, 'PUT');
    await tel.click('#btn-mobil-senkronize');
    await bekleKosul(() => tel.$$eval('#mobil-aktif-ders-sec option', (os) => os.some((o) => o.value === 'DERS-ESKI')), 8000);
    const onceSecenek = await tel.$$eval('#mobil-aktif-ders-sec option', (os) => os.map((o) => o.value));
    KASA_DONEM.aktifDonemId = 'D-2026';
    const mv5 = await api('/api/bulut-kasa', undefined, token);
    await api('/api/bulut-kasa', { veri: KASA_DONEM, bazRevizyonNo: Number(mv5.v.revizyonNo) || undefined, silmeOnayi: true, zorlaEz: true }, token, 'PUT');
    await tel.click('#btn-mobil-senkronize');
    await bekleKosul(() => tel.$$eval('#mobil-aktif-ders-sec option', (os) => !os.some((o) => o.value === 'DERS-ESKI')), 8000);
    const sonraSecenek = await tel.$$eval('#mobil-aktif-ders-sec option', (os) => os.map((o) => o.value));
    const eskiPaketDuruyor = await tel.evaluate(() => Boolean(window.__mobilDurumOku().dersPaketleriHaritasi['DERS-ESKI']));
    kontrol('Arşiv dönemine geçen ders telefonda listelenmez; verisi telefonda silinmeden durur',
      onceSecenek.includes('DERS-ESKI') && !sonraSecenek.includes('DERS-ESKI') && sonraSecenek.includes('DERS-AG') && eskiPaketDuruyor,
      `${onceSecenek.join(',')} → ${sonraSecenek.join(',')} · paket:${eskiPaketDuruyor}`);

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
