/* ==========================================================================
   KESİN ÇÖZÜM KABUL TESTİ — "kağıt önce" okuma mimarisi (Chrome + puppeteer-core)
   1) Telefondaki sınav kağıtla uyuşmuyorsa kağıt KAYDEDİLMEZ, nedeni yazılır.
   2) Kare desen okunamazsa kağıt puanlanmaz (tahminle okuma yok).
   3) Numarası okunamayan kağıt bilgisayara gönderilmez, "Aday" tahmini yapılmaz.
   4) Aynı son 3 haneli iki öğrenci: seçim istenir, seçilene kadar gönderilmez; seçince gönderilir.
   5) Kitapçığının anahtarı olmayan kağıt puanlanmaz; anahtarsız kitapçık sessizce "D/A" ile doldurulmaz.
   6) Doğrulama görünümü: 4 köşe, kare desen ve her balon renkli yuvarlakla çizilir; liste kendiliğinden açılmaz.
   7) "Bu kağıttan sınav oluştur": şekil kare desenden, A/B anahtarı anahtar kağıtlarından; kağıtlar doğru puanlanır.
   Çalıştırma: node kesin-cozum-test.js
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

// Kağıtların gerçek şekli (sizin sınavınız gibi): 15 D/Y + 10 Test, son 3 hane
const KAGIT = { dySayisi: 15, testSayisi: 10, klasikSayisi: 0, sikSayisi: 5, kimlikModu: 'son3', haneSayisi: 3 };
const KEY_A = { dy: 'DYDDYDYYDDYDYDD'.split(''), test: 'ABCDEABCDE'.split('') };
const KEY_B = { dy: 'YDYYDYDDYYDYDYY'.split(''), test: 'EDCBAEDCBA'.split('') };
const LISTE = [
  { ogrNo: '247419053', adSoyad: 'Deneme Bir' },
  { ogrNo: '257419053', adSoyad: 'Deneme İki' },
  { ogrNo: '257419205', adSoyad: 'Deneme Üç' }
];
// Telefondaki YANLIŞ sınav (arşivdeki gibi): 10 D/Y + 10 Test + 2 Klasik, son 2 hane
const YANLIS_SINAV = {
  sinavKodu: 'GUV305-10-10-2', dersAd: 'Güvenlik Duvarı', dySayisi: 10, testSayisi: 10, klasikSayisi: 2, sikSayisi: 5,
  kimlikModu: 'son2', haneSayisi: 2, dyToplamPuan: 22, testToplamPuan: 56, klasikToplamPuan: 22,
  cevapAnahtarlari: { A: { dy: Array(10).fill('D'), test: Array(10).fill('A') } }
};
const DOGRU_SINAV_YALNIZ_A = Object.assign({}, KAGIT, {
  sinavKodu: 'GUV305-15-10-0', dersAd: 'Güvenlik Duvarı', dyToplamPuan: 60, testToplamPuan: 40, klasikToplamPuan: 0,
  cevapAnahtarlari: { A: KEY_A }
});

(async () => {
  console.log('=== KESİN ÇÖZÜM KABUL TESTİ (kağıt önce okuma) ===');
  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const hatalar = [];
  const resimYolu = path.resolve('test-artifacts', 'kesin-cozum.png');
  fs.mkdirSync(path.dirname(resimYolu), { recursive: true });

  const telefonAc = async (kurulumYapisi, liste) => {
    const baglam = await tarayici.createBrowserContext();
    const tel = await baglam.newPage();
    await tel.setViewport({ width: 390, height: 844 });
    tel.on('pageerror', (e) => hatalar.push(e.message));
    tel.on('dialog', async (d) => { await d.accept(); });
    const kur = C.uretKompaktSetupQrPaketi(kurulumYapisi, liste, taban);
    await tel.goto(`${taban}/${kur.hashHref}`, { waitUntil: 'networkidle0' });
    await bekle(400);
    return tel;
  };
  const kagitCiz = (tel, yapi, sim, desenBoz = false) => tel.evaluate((y, s, boz) => {
    const Cm = window.SinavOptikCekirdek;
    const cv = document.createElement('canvas');
    Cm.cizSentetikOptikFormCanvas(cv, y, s);
    if (boz) {
      const cx = cv.getContext('2d');
      cx.fillStyle = '#fdfcf9';
      cx.fillRect(cv.width / 2 - 20, 4, 40, 40);
    }
    return cv.toDataURL('image/png');
  }, yapi, sim, desenBoz);
  const yukle = async (tel, dataUrl, girdi = '#input-mobil-foto') => {
    fs.writeFileSync(resimYolu, Buffer.from(dataUrl.split(',')[1], 'base64'));
    await (await tel.$(girdi)).uploadFile(resimYolu);
    await bekle(1700);
  };
  const durum = (tel) => tel.evaluate(() => {
    const m = window.__mobilDurumOku();
    const ob = window.__mobilV2OutboxOku ? window.__mobilV2OutboxOku() : { bekleyenOlaylar: [] };
    const dog = document.getElementById('mobil-dogrulama');
    return {
      okuma: m.okumaSonuclari.map((s) => ({ id: s.id, no: s.ogrNo, puan: s.toplamPuan, kod: s.okunanNoKod, grup: s.grup })),
      okumaOlayi: (ob.bekleyenOlaylar || []).filter((o) => o.tur === 'OKUDU_GUNCELLE').map((o) => o.veri && o.veri.ogrNo),
      dogrulamaAcik: dog && !dog.hidden,
      dogrulamaDurum: (document.getElementById('mobil-dogrulama-durum') || {}).textContent || '',
      ogrenciSecGorunur: !document.getElementById('btn-mobil-dogrulama-ogrenci').hidden,
      eslestirModalAcik: (() => { const e = document.getElementById('modal-mobil-ogrenci-eslestir') || document.querySelector('[id*="eslestir"][role="dialog"]'); return Boolean(e && e.offsetParent !== null && getComputedStyle(e).display !== 'none' && !e.hidden); })(),
      cizim: window.__sonDogrulamaCizimi || null,
      uyari: (document.getElementById('m-uyari') || {}).textContent || ''
    };
  });
  const dogrulamaKapat = (tel) => tel.evaluate(() => { const b = document.getElementById('btn-mobil-dogrulama-tamam'); if (b && !document.getElementById('mobil-dogrulama').hidden) b.click(); });
  const ogrenci = (no, grup, key) => ({ grup, ogrNoKod: no, dyCevaplar: key.dy, testCevaplar: key.test, klasikPuanlar: [] });

  try {
    // 1) Telefonda YANLIŞ sınav (10/10/2 son 2) varken gerçek şekilli (15/10/0 son 3) kağıt
    let tel = await telefonAc(YANLIS_SINAV, LISTE);
    await yukle(tel, await kagitCiz(tel, KAGIT, ogrenci('053', 'A', KEY_A)));
    let d = await durum(tel);
    kontrol('1) Telefondaki sınav kağıtla uyuşmuyorsa kağıt KAYDEDİLMEZ', d.okuma.length === 0, JSON.stringify(d.okuma));
    kontrol('1) Doğrulama görünümü nedeni yazar (kağıt 15 D/Y + 10 Test, seçili sınav 10+10+2)', d.dogrulamaAcik && /Kaydedilmedi/.test(d.dogrulamaDurum) && /15 D\/Y \+ 10 Test/.test(d.dogrulamaDurum) && /seçili sınav 10 D\/Y/.test(d.dogrulamaDurum), d.dogrulamaDurum);
    kontrol('1) Uyuşmayan kağıt bilgisayara gönderilmez', d.okumaOlayi.length === 0);
    await dogrulamaKapat(tel);

    // 2) Kare desen okunamayan kağıt (desen kapatılmış): şekil doğrulanamaz → puanlanmaz
    await yukle(tel, await kagitCiz(tel, Object.assign({}, YANLIS_SINAV), ogrenci('53', 'A', { dy: Array(10).fill('D'), test: Array(10).fill('A') }), true));
    d = await durum(tel);
    kontrol('2) Kare desen okunamazsa kağıt puanlanmaz (tahminle okuma yok)', d.okuma.length === 0 && /kare desen okunamadı/.test(d.dogrulamaDurum), `${d.okuma.length} · ${d.dogrulamaDurum}`);
    kontrol('2) Doğrulama görünümünde köşeler çizilir, kare desen kutusu kırmızı ("yok")', d.cizim && d.cizim.kose === 4 && d.cizim.matris === 'yok', JSON.stringify(d.cizim));
    await dogrulamaKapat(tel);
    await tel.browserContext().close();

    // 3-6) Doğru şekilli sınav (yalnız A anahtarı var)
    tel = await telefonAc(DOGRU_SINAV_YALNIZ_A, LISTE);
    // 6) Tam doğru A kağıdı → doğrulama çizimi
    await yukle(tel, await kagitCiz(tel, KAGIT, ogrenci('205', 'A', KEY_A)));
    d = await durum(tel);
    kontrol('6) Doğru kağıt doğru öğrenciye 100 puan', d.okuma.length === 1 && d.okuma[0].no === '257419205' && Number(d.okuma[0].puan) === 100, JSON.stringify(d.okuma));
    kontrol('6) Doğrulama: 4 köşe yeşil, kare desen okundu, 29 balon (15 D/Y + 10 Test + 3 hane + kitapçık) yeşil yuvarlak', d.cizim && d.cizim.kose === 4 && d.cizim.matris === 'matris' && d.cizim.net === 29 && d.cizim.cift === 0, JSON.stringify(d.cizim));
    kontrol('6) Kesin okuma bilgisayara gönderilir', d.okumaOlayi.includes('257419205'), JSON.stringify(d.okumaOlayi));
    kontrol('6) Eşleştirme listesi kendiliğinden açılmaz', !d.eslestirModalAcik);
    await dogrulamaKapat(tel);

    // 3) Numarası okunamayan kağıt (orta hane boş): gönderilmez, "Aday" tahmini yok
    await yukle(tel, await kagitCiz(tel, KAGIT, ogrenci('0X3', 'A', KEY_A)));
    d = await durum(tel);
    const yarim = d.okuma.find((o) => String(o.kod).includes('?'));
    kontrol('3) Numarası okunamayan kağıt bilgisayara GÖNDERİLMEZ', Boolean(yarim) && d.okumaOlayi.length === 1, JSON.stringify(d));
    kontrol('3) Doğrulama görünümü "Öğrenciyi seç" ister, liste kendiliğinden açılmaz', d.ogrenciSecGorunur && !d.eslestirModalAcik && /Öğrenci kesinleşmedi/.test(d.dogrulamaDurum), d.dogrulamaDurum);
    await tel.click('#btn-mobil-dogrulama-ogrenci');
    await bekle(400);
    const adayVar = await tel.evaluate(() => /Aday/.test((document.getElementById('liste-eslestir-adaylar') || {}).textContent || ''));
    kontrol('3) Yarım okunan numara için "Aday" önerisi yapılmaz', !adayVar);
    await tel.evaluate(() => { const b = document.getElementById('btn-eslestir-beklet'); if (b) b.click(); });
    await bekle(200);

    // 4) Aynı son 3 haneli iki öğrenci (247419053 / 257419053)
    await yukle(tel, await kagitCiz(tel, KAGIT, ogrenci('053', 'A', KEY_A)));
    d = await durum(tel);
    kontrol('4) Aynı son 3 hane: seçim istenir, seçilene kadar gönderilmez', d.ogrenciSecGorunur && d.okumaOlayi.length === 1 && !d.okumaOlayi.some((n) => /053$/.test(String(n))), JSON.stringify(d));
    await tel.click('#btn-mobil-dogrulama-ogrenci');
    await bekle(400);
    const adaylar = await tel.evaluate(() => Array.from(document.querySelectorAll('[data-eslestir-sec-no]')).map((b) => b.getAttribute('data-eslestir-sec-no')));
    kontrol('4) Seçim listesinde iki aday öğrenci var', adaylar.includes('247419053') && adaylar.includes('257419053'), JSON.stringify(adaylar));
    await tel.evaluate(() => document.querySelector('[data-eslestir-sec-no="257419053"]').click());
    await bekle(500);
    d = await durum(tel);
    kontrol('4) Öğretmen seçince kağıt o öğrenciye yazılır ve bilgisayara gönderilir', d.okuma.some((o) => o.no === '257419053') && d.okumaOlayi.includes('257419053'), JSON.stringify(d));
    await dogrulamaKapat(tel);

    // 5) B kitapçığı kağıdı, ama telefonda yalnız A anahtarı var
    const onceB = (await durum(tel)).okuma.length;
    await yukle(tel, await kagitCiz(tel, KAGIT, ogrenci('205', 'B', KEY_B)));
    d = await durum(tel);
    kontrol('5) Kitapçığının (B) anahtarı olmayan kağıt puanlanmaz ve nedeni yazılır', d.okuma.length === onceB && /kitapçığı \(B\) için cevap anahtarı yok/.test(d.dogrulamaDurum), d.dogrulamaDurum);
    await dogrulamaKapat(tel);
    await tel.evaluate(() => { const b = document.querySelector('.mobil-sekme-btn[data-msekme="m-panel-anahtar"]'); if (b) b.click(); const s = document.getElementById('m-ayar-grup-sec'); s.value = 'B'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await bekle(300);
    const bAnahtar = await tel.evaluate(() => ({ metin: document.getElementById('mobil-dokunmatik-anahtar-alani').textContent, b: window.__mobilDurumOku().sinavYapisi.cevapAnahtarlari.B }));
    kontrol('5) Anahtarsız B kitapçığı sessizce "D/A" ile doldurulmaz', /B kitapçığının anahtarı yok/.test(bAnahtar.metin) && (!bAnahtar.b || ((bAnahtar.b.dy || []).length === 0 && (bAnahtar.b.test || []).length === 0)), JSON.stringify(bAnahtar.b));
    await tel.browserContext().close();

    // 7) Bu kağıttan sınav oluştur — telefonda yanlış sınav varken (arşivde basılan sürüm yok)
    tel = await telefonAc(YANLIS_SINAV, LISTE);
    await tel.evaluate(() => { const b = document.querySelector('.mobil-sekme-btn[data-msekme="m-panel-anahtar"]'); if (b) b.click(); });
    await bekle(200);
    await tel.click('#btn-mobil-sinav-olustur-ac');
    await bekle(200);
    // Eksik işaretli anahtar kağıdı reddedilir
    const eksikKey = { dy: KEY_A.dy.slice(0, 14).concat(['X']), test: KEY_A.test };
    await yukle(tel, await kagitCiz(tel, KAGIT, ogrenci('000', 'A', eksikKey)), '#input-mobil-olustur-anahtar');
    let ol = await tel.evaluate(() => document.getElementById('mobil-olustur-durum').textContent);
    kontrol('7) Boş işaretli anahtar kağıdı kabul edilmez', /boş ya da çift işaretli/.test(ol) && /D\/Y 15/.test(ol), ol);
    await yukle(tel, await kagitCiz(tel, KAGIT, ogrenci('000', 'A', KEY_A)), '#input-mobil-olustur-anahtar');
    await yukle(tel, await kagitCiz(tel, KAGIT, ogrenci('000', 'B', KEY_B)), '#input-mobil-olustur-anahtar');
    ol = await tel.evaluate(() => ({
      yapi: document.getElementById('mobil-olustur-yapi').textContent,
      anahtar: document.getElementById('mobil-olustur-anahtarlar').textContent,
      dyP: document.getElementById('mobil-olustur-dy-puan').value,
      tP: document.getElementById('mobil-olustur-test-puan').value,
      toplam: document.getElementById('mobil-olustur-toplam').textContent,
      kaydetAcik: !document.getElementById('btn-mobil-olustur-kaydet').disabled
    }));
    kontrol('7) Şekil kağıttan alındı: 15 D/Y + 10 Test, son 3 hane', /15 D\/Y \+ 10 Test/.test(ol.yapi) && /son 3 hane/.test(ol.yapi), ol.yapi);
    kontrol('7) A ve B anahtarları anahtar kağıtlarından okundu', /A kitapçığı/.test(ol.anahtar) && /B kitapçığı/.test(ol.anahtar) && ol.anahtar.includes(KEY_A.dy.join('')) && ol.anahtar.includes(KEY_B.test.join('')), ol.anahtar);
    kontrol('7) Soru puanları 4 / 4 önerildi, toplam 100', ol.dyP === '4' && ol.tP === '4' && /100 puan/.test(ol.toplam) && ol.kaydetAcik, JSON.stringify(ol));
    await tel.evaluate(() => { const i = document.getElementById('mobil-olustur-ad'); i.value = 'GUV305 Vize 07.11.2026 (kağıttan)'; });
    await tel.click('#btn-mobil-olustur-kaydet');
    await bekle(400);
    const yeniSinav = await tel.evaluate(() => { const y = window.__mobilDurumOku().sinavYapisi; return { dy: y.dySayisi, t: y.testSayisi, k: y.klasikSayisi, kim: y.kimlikModu, dyp: y.dyToplamPuan, tp: y.testToplamPuan, bt: (y.cevapAnahtarlari.B.test || []).join(''), id: y.aktifSinavId || '' }; });
    kontrol('7) Yeni sınav kaydedildi ve seçildi (15/10/0, son 3, 60+40 puan, B anahtarı)', yeniSinav.dy === 15 && yeniSinav.t === 10 && yeniSinav.k === 0 && yeniSinav.kim === 'son3' && Number(yeniSinav.dyp) === 60 && Number(yeniSinav.tp) === 40 && yeniSinav.bt === KEY_B.test.join('') && /^TEL-/.test(yeniSinav.id), JSON.stringify(yeniSinav));
    // B kitapçıklı öğrenci kağıdı: 12 D/Y doğru + 7 Test doğru = 12*4 + 7*4 = 76
    const ogrB = { dy: KEY_B.dy.map((c, i) => (i < 12 ? c : (c === 'D' ? 'Y' : 'D'))), test: KEY_B.test.map((c, i) => (i < 7 ? c : (c === 'A' ? 'B' : 'A'))) };
    await tel.evaluate(() => { const b = document.querySelector('.mobil-sekme-btn[data-msekme="m-panel-tara"]'); if (b) b.click(); });
    await yukle(tel, await kagitCiz(tel, KAGIT, ogrenci('205', 'B', ogrB)));
    d = await durum(tel);
    kontrol('7) Oluşturulan sınavla B kağıdı doğru puanlanır (12×4 + 7×4 = 76)', d.okuma.length === 1 && d.okuma[0].no === '257419205' && Number(d.okuma[0].puan) === 76, JSON.stringify(d.okuma));
    await dogrulamaKapat(tel);
    // Kapat-aç: oluşturulan sınav kalıcı
    await tel.goto(`${taban}/optik-mobil.html`, { waitUntil: 'networkidle0' });
    await bekle(800);
    const kalici = await tel.evaluate(() => { const m = window.__mobilDurumOku(); const p = m.dersPaketleriHaritasi[m.dersId] || {}; return { id: m.sinavYapisi.aktifSinavId, sinavlar: (p.sinavlar || []).filter((x) => x.telefondaOlusturuldu).length, okuma: m.okumaSonuclari.length }; });
    kontrol('7) Telefon kapatılıp açılınca oluşturulan sınav ve sonuç korunur', /^TEL-/.test(kalici.id || '') && kalici.sinavlar === 1 && kalici.okuma === 1, JSON.stringify(kalici));
    await tel.browserContext().close();

    kontrol('Sayfalarda JavaScript hatası yok', hatalar.length === 0, hatalar.join(' | '));
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
