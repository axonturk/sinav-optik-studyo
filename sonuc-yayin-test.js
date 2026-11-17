/* ==========================================================================
   ÖĞRENCİ SONUCU YAYIN TESTİ (sunucu + öğrenci ekranı)
   - Öğretmen açmadan sonuç görünmez; yalnız öğretmen açar / geri alır (401 korumaları).
   - Öğrenci yalnız KENDİ sonucunu görür (giriş anahtarı numaraya bağlı); kopya şüphesi alanı hiç yoktur.
   - Soru soru kendi işareti / doğru cevap / iptal açıklaması; itiraz öğretmene düşer, sınırlıdır.
   - Öğrenci ekranında "Sonuçlarım": puan, D/Y/B ve işaret balonları; itiraz düğmesi.
   Çalıştırma: node sonuc-yayin-test.js
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
const SIFRE = 'Ilk.Sifre2026';

(async () => {
  console.log('=== ÖĞRENCİ SONUCU YAYIN TESTİ ===');
  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const api = async (yol, govde, ekBaslik = {}) => {
    const y = await fetch(taban + yol, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, ekBaslik), body: JSON.stringify(govde || {}) });
    let v = {};
    try { v = await y.json(); } catch (_) {}
    return { kod: y.status, v };
  };
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  try {
    const hoca = await api('/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
    const HB = { Authorization: `Bearer ${hoca.v.token}` };
    const soru = (no, verilen, dogru, durum) => ({ no, verilen, dogru, durum });
    const sonuclar = [
      { ogrNo: '2023104015', adSoyad: 'Zeynep Kaya', puan: 85, dogru: 3, yanlis: 1, bos: 0, sorular: [soru('1', 'A', 'A', 'dogru'), soru('2', 'C', 'B', 'yanlis'), soru('3', 'D', 'D', 'dogru'), soru('4', 'E', 'C', 'iptal')], kopyaSuphesi: 'YUKSEK' },
      { ogrNo: '2023104024', adSoyad: 'Mehmet Demir', puan: 40, dogru: 1, yanlis: 3, bos: 0, sorular: [soru('1', 'B', 'A', 'yanlis')] },
      { ogrNo: 'BEKLEYEN-01 (??5)', adSoyad: 'Bilinmeyen', puan: 10, sorular: [] }
    ];
    const izinsiz = await api('/api/sonuc-yayinla', { sinavId: 'KS-T1', sonuclar });
    kontrol('Öğretmen oturumu olmadan sonuç açılamaz (401)', izinsiz.kod === 401);
    const yay = await api('/api/sonuc-yayinla', { sinavId: 'KS-T1', sinavAdi: 'Ağ Vize', dersAdi: '74161101 Ağ', kurallarNotu: 'İptal: TEST-4', sonuclar }, HB);
    kontrol('Öğretmen sonucu açar; numarası kesinleşmemiş (BEKLEYEN) kağıt açılmaz', yay.kod === 200 && yay.v.yayinlanan === 2, JSON.stringify(yay.v));

    // Öğrenci hesabı (sunucunun varsayılan sınıf listesindeki numara)
    const sonKod = async (ogrNo) => {
      const r = await fetch(`${taban}/api/ogrenci-hesap/hoca-liste`, { headers: HB }).then((x) => x.json()).catch(() => ({}));
      const k = (r.bekleyenKodlar || []).find((x) => x.ogrNo === ogrNo);
      return k ? k.kod : '';
    };
    await api('/api/ogrenci-hesap/kayit-baslat', { ogrNo: '2023104015', eposta: 'z@ogrenci.edu.tr', telefon: '05321112233', sifre: SIFRE, sifreTekrar: SIFRE });
    const onay = await api('/api/ogrenci-hesap/kayit-onayla', { ogrNo: '2023104015', kod: await sonKod('2023104015') });
    const giris = await api('/api/ogrenci-hesap/giris', { ogrNo: '2023104015', sifre: SIFRE });
    const TOK = giris.v.girisToken;
    kontrol('Öğrenci hesabı açılır ve giriş anahtarı alınır', onay.kod === 200 && Boolean(TOK), `${onay.kod} ${giris.kod}`);

    const yanlisTok = await api('/api/ogrenci/sonuclarim', { ogrNo: '2023104015', girisToken: 'x'.repeat(48) });
    const baskaNo = await api('/api/ogrenci/sonuclarim', { ogrNo: '2023104024', girisToken: TOK });
    kontrol('Giriş anahtarı olmadan ya da başkasının numarasıyla sonuç görülemez (401)', yanlisTok.kod === 401 && baskaNo.kod === 401, `${yanlisTok.kod}/${baskaNo.kod}`);
    const benim = await api('/api/ogrenci/sonuclarim', { ogrNo: '2023104015', girisToken: TOK });
    const s1 = (benim.v.sonuclar || [])[0] || {};
    kontrol('Öğrenci yalnız KENDİ sonucunu görür (1 kayıt, kendi numarası, puan 85, 3D/1Y/0B)', benim.kod === 200 && benim.v.sonuclar.length === 1 && s1.ogrNo === '2023104015' && s1.puan === 85 && s1.dogru === 3 && s1.yanlis === 1, JSON.stringify(benim.v).slice(0, 200));
    kontrol('Soru soru kendi işareti, doğru cevap ve iptal bilgisi gelir; sınav adı ve kural notu var', s1.sorular.length === 4 && s1.sorular[1].verilen === 'C' && s1.sorular[1].dogru === 'B' && s1.sorular[3].durum === 'iptal' && s1.sinavAdi === 'Ağ Vize' && s1.kurallarNotu === 'İptal: TEST-4', JSON.stringify(s1.sorular));
    kontrol('Kopya şüphesi (öğretmenin gönderdiği fazladan alan dahil) öğrenciye hiç gitmez', !/kopya|benzerlik|supheli/i.test(JSON.stringify(benim.v)), JSON.stringify(benim.v).slice(0, 160));

    const itirazYok = await api('/api/ogrenci/itiraz', { ogrNo: '2023104015', girisToken: TOK, yayinId: 'yok', soruNo: '2', aciklama: 'B de doğru' });
    const itiraz = await api('/api/ogrenci/itiraz', { ogrNo: '2023104015', girisToken: TOK, yayinId: s1.yayinId, soruNo: '2', aciklama: 'B şıkkı da doğru bence' });
    const liste = await api('/api/itirazlar', {}, HB);
    const listeIzinsiz = await api('/api/itirazlar', {});
    kontrol('İtiraz yalnız açık sonuca yapılır; öğretmenin itiraz listesine düşer; liste öğretmene özel', itirazYok.kod === 404 && itiraz.kod === 200 && (liste.v.itirazlar || []).some((x) => x.ogrNo === '2023104015' && x.soruNo === '2' && /B şıkkı/.test(x.aciklama)) && listeIzinsiz.kod === 401, `${itirazYok.kod}/${itiraz.kod}/${JSON.stringify(liste.v).slice(0, 120)}/${listeIzinsiz.kod}`);
    let sinir = 0;
    for (let i = 0; i < 12; i++) { const r = await api('/api/ogrenci/itiraz', { ogrNo: '2023104015', girisToken: TOK, yayinId: s1.yayinId, soruNo: '1', aciklama: `deneme ${i}` }); if (r.kod === 429) sinir++; }
    kontrol('Günlük itiraz sınırı vardır (10)', sinir >= 2, String(sinir));

    // Öğrenci ekranı
    const ctx = await tarayici.createBrowserContext();
    const s = await ctx.newPage();
    await s.setViewport({ width: 390, height: 844 });
    const sayfaHata = [];
    s.on('pageerror', (e) => sayfaHata.push(e.message));
    await s.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await s.evaluate((t) => sessionStorage.setItem('KIOSK_OGR_GIRIS_V1', JSON.stringify({ ogrNo: '2023104015', adSoyad: 'Zeynep Kaya', girisToken: t })), TOK);
    await s.evaluate(() => document.getElementById('btn-kiosk-ogrenci-modu').click());
    await bekle(800);
    await s.evaluate(() => document.getElementById('btn-kiosk-sonuclarim').click());
    await bekle(800);
    const ekran = await s.evaluate(() => {
      const k = document.getElementById('kiosk-sonuclarim');
      return { gorunur: k && !k.hidden, metin: k ? k.textContent.replace(/\s+/g, ' ') : '', balon: k ? k.querySelectorAll('tbody tr').length : 0, itiraz: k ? k.querySelectorAll('[data-itiraz-yayin]').length : 0 };
    });
    kontrol('Öğrenci ekranında "Sonuçlarım": puan, D/Y/B, kural notu, soru satırları ve itiraz düğmeleri', ekran.gorunur && /85 puan · 3 doğru · 1 yanlış · 0 boş/.test(ekran.metin) && /İptal: TEST-4/.test(ekran.metin) && ekran.balon === 4 && ekran.itiraz === 4, JSON.stringify(ekran).slice(0, 240));

    // Geri al
    const geri = await api('/api/sonuc-yayinla', { sinavId: 'KS-T1', geriAl: true }, HB);
    const sonra = await api('/api/ogrenci/sonuclarim', { ogrNo: '2023104015', girisToken: TOK });
    kontrol('Öğretmen "Geri al" deyince sonuç öğrenciden kalkar', geri.kod === 200 && sonra.v.sonuclar.length === 0, JSON.stringify(sonra.v));
    kontrol('Öğrenci ekranında JS hatası yok', sayfaHata.length === 0, sayfaHata.join(' | '));
    await ctx.close();
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
