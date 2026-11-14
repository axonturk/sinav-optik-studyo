/* ==========================================================================
   ÖĞRENCİ HESABI TESTİ (sunucu API + öğrenci ekranı, Chrome + puppeteer-core)
   - Yalnız sınıf listesindeki numara hesap açabilir; ilk girişte e-posta + telefon + şifre, e-postaya kod.
   - Sonraki girişler numara + şifre; şifre yenileme kayıtlı e-postaya kodla.
   - Online sınav oturumu yalnız giriş yapmış öğrenciye açılır (numarayı bilen başkası giremez).
   - Telefon yalnız öğretmen panelinde görünür; öğretmen hesabı sıfırlayabilir.
   - Hatalı giriş ve hatalı kod denemeleri sınırlıdır.
   E-posta servisi yapılandırılmadığından "geçiş modu" kullanılır: kod öğretmen paneline düşer.
   Çalıştırma: node ogrenci-hesap-test.js
   ========================================================================== */
'use strict';
process.env.SINAV_OGRENCI_HESAP_ZORUNLU = '1';
delete process.env.RESEND_API_KEY;
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

const OGR = { ogrNo: '2023104015', adSoyad: 'Zeynep Kaya' }; // sunucunun varsayılan sınıf listesinde
const SIFRE = 'Ilk.Sifre2026';
const YENI_SIFRE = 'Yeni.Sifre2026';

(async () => {
  console.log('=== ÖĞRENCİ HESABI TESTİ ===');
  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const api = async (yol, govde, ekBaslik = {}) => {
    const y = await fetch(taban + yol, {
      method: govde === undefined ? 'GET' : 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ekBaslik),
      body: govde === undefined ? undefined : JSON.stringify(govde)
    });
    let v = {};
    try { v = await y.json(); } catch (_) {}
    return { kod: y.status, v };
  };
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  try {
    // Öğretmen oturumu (kodları geçiş modunda öğretmen paneli gösterir)
    const hoca = await api('/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
    const hocaBaslik = { Authorization: `Bearer ${hoca.v.token}` };
    const sonKod = async (ogrNo) => {
      const r = await api('/api/ogrenci-hesap/hoca-liste', undefined, hocaBaslik);
      const k = (r.v.bekleyenKodlar || []).find((x) => x.ogrNo === ogrNo);
      return k ? k.kod : '';
    };

    // 1) Sunucu kuralları
    const ayar = await api('/api/ogrenci-hesap/ayar');
    kontrol('Öğrenci hesabı zorunlu, e-posta servisi yokken geçiş modu', ayar.v.hesapZorunlu === true && ayar.v.epostaHazir === false, JSON.stringify(ayar.v));
    const izinsiz = await api('/api/ogrenci-oturum-baslat', { ogrNo: OGR.ogrNo, adSoyad: OGR.adSoyad });
    kontrol('Numarayı bilen ama giriş yapmamış kişi sınav oturumu açamaz (401)', izinsiz.kod === 401 && izinsiz.v.girisGerekli === true, JSON.stringify(izinsiz));
    const tanimsiz = await api('/api/ogrenci-hesap/durum', { ogrNo: '9999999999' });
    kontrol('Sınıf listesinde olmayan numara hesap açamaz (404)', tanimsiz.kod === 404, JSON.stringify(tanimsiz.v));
    const hocasiz = await api('/api/ogrenci-hesap/hoca-liste');
    kontrol('Öğretmen paneli öğretmen oturumu olmadan açılmaz (401)', hocasiz.kod === 401);

    // 2) Öğrenci ekranı: ilk giriş
    const ctx = await tarayici.createBrowserContext();
    const s = await ctx.newPage();
    await s.setViewport({ width: 390, height: 844 });
    const sayfaHata = [];
    s.on('pageerror', (e) => sayfaHata.push(e.message));
    s.on('dialog', async (d) => { sayfaHata.push('dialog: ' + d.message()); await d.dismiss(); });
    await s.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await s.evaluate(() => document.getElementById('btn-kiosk-ogrenci-modu').click());
    await bekle(700);
    const gorunur = (sel) => s.evaluate((x) => { const e = document.querySelector(x); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }, sel);
    kontrol('Öğrenci ekranı numara adımıyla açılır; eski tek form ve "Sınava Başla" gizli', await gorunur('#kiosk-h-ogr-no') && !(await gorunur('#kiosk-ilk-kayit-alan')) && !(await gorunur('#btn-kiosk-oturum-baslat')));
    await s.type('#kiosk-h-ogr-no', OGR.ogrNo);
    await s.click('#btn-kiosk-h-devam');
    await bekle(500);
    kontrol('İlk girişte bilgi tamamlama adımı gelir ve ad maskeli gösterilir', await gorunur('#kiosk-h-eposta') && (await s.$eval('#kiosk-h-ad-maske-2', (e) => e.textContent)) === 'Zeynep K.');
    await s.type('#kiosk-h-eposta', 'zeynep@ogrenci.edu.tr');
    await s.type('#kiosk-h-telefon', '0532 111 22 33');
    await s.type('#kiosk-h-sifre-1', SIFRE);
    await s.type('#kiosk-h-sifre-2', SIFRE);
    await s.click('#btn-kiosk-h-kod-gonder');
    await bekle(800);
    const kodBilgi = await s.$eval('#kiosk-h-kod-bilgi', (e) => e.textContent);
    kontrol('Kod adımı gelir; e-posta servisi yokken "kodu öğretmeninden iste" der', await gorunur('#kiosk-h-kod') && /öğretmeninden/.test(kodBilgi), kodBilgi);
    const ilkKod = await sonKod(OGR.ogrNo);
    kontrol('Doğrulama kodu öğretmen panelinde görünür (6 hane)', /^\d{6}$/.test(ilkKod), ilkKod);
    await s.type('#kiosk-h-kod', ilkKod === '000000' ? '111111' : '000000');
    await s.click('#btn-kiosk-h-onayla');
    await bekle(500);
    kontrol('Yanlış kod reddedilir ve kalan deneme söylenir', /Kalan deneme/.test(await s.$eval('#kiosk-h-mesaj', (e) => e.textContent)));
    await s.$eval('#kiosk-h-kod', (e) => { e.value = ''; });
    await s.type('#kiosk-h-kod', ilkKod);
    await s.click('#btn-kiosk-h-onayla');
    await bekle(900);
    kontrol('Doğru kodla hesap açılır, giriş yapılmış görünür; sınav listesi ve "Sınava Başla" belirir',
      await gorunur('#kiosk-h-girisli') && await gorunur('#btn-kiosk-oturum-baslat') && await gorunur('#kiosk-uyari-ve-onay-kutusu'),
      await s.$eval('#kiosk-h-girisli-ad', (e) => e.textContent));
    await s.click('#kiosk-okudum-onay');
    await s.click('#btn-kiosk-oturum-baslat');
    await bekle(1500);
    const sahne = await s.$eval('#kiosk-soru-sahne', (e) => getComputedStyle(e).display);
    const hataMetni = await s.$eval('#kiosk-hata-kutu', (e) => (e.hidden ? '' : e.textContent));
    kontrol('Giriş yapan öğrenci online sınava başlar (sunucu oturumu açtı)', sahne !== 'none', hataMetni);
    kontrol('Öğrenci ekranında JS hatası / uyarı penceresi yok', sayfaHata.length === 0, sayfaHata.join(' | '));
    await ctx.close();

    // 3) Sonraki giriş: numara + şifre
    const r1 = await api('/api/ogrenci-hesap/durum', { ogrNo: OGR.ogrNo });
    kontrol('Hesap açıldıktan sonra durum "aktif", e-posta maskeli', r1.v.durum === 'aktif' && /^z\*{2,}@ogrenci\.edu\.tr$/.test(r1.v.epostaMaske || ''), JSON.stringify(r1.v));
    const yanlis = await api('/api/ogrenci-hesap/giris', { ogrNo: OGR.ogrNo, sifre: 'Yanlis.Sifre1' });
    kontrol('Yanlış şifre reddedilir', yanlis.kod === 401);
    const dogru = await api('/api/ogrenci-hesap/giris', { ogrNo: OGR.ogrNo, sifre: SIFRE });
    kontrol('Doğru şifreyle giriş anahtarı verilir', dogru.kod === 200 && /^[0-9a-f]{48}$/.test(dogru.v.girisToken || ''));
    const baskasi = await api('/api/ogrenci-oturum-baslat', { ogrNo: '2023104024', adSoyad: 'Mehmet Demir', girisToken: dogru.v.girisToken });
    kontrol('Bir öğrencinin giriş anahtarıyla başka öğrencinin sınavı açılamaz', baskasi.kod === 401, JSON.stringify(baskasi.v));

    // 4) Şifre yenileme
    const sif = await api('/api/ogrenci-hesap/sifre-sifirla-baslat', { ogrNo: OGR.ogrNo });
    const sifKod = await sonKod(OGR.ogrNo);
    kontrol('Şifre yenileme kodu oluşur', sif.kod === 200 && /^\d{6}$/.test(sifKod) && sifKod !== ilkKod);
    const zayif = await api('/api/ogrenci-hesap/sifre-sifirla-onayla', { ogrNo: OGR.ogrNo, kod: sifKod, sifre: 'kisa', sifreTekrar: 'kisa' });
    kontrol('Zayıf yeni şifre kabul edilmez', zayif.kod === 400);
    const yen = await api('/api/ogrenci-hesap/sifre-sifirla-onayla', { ogrNo: OGR.ogrNo, kod: sifKod, sifre: YENI_SIFRE, sifreTekrar: YENI_SIFRE });
    const eskiIle = await api('/api/ogrenci-hesap/giris', { ogrNo: OGR.ogrNo, sifre: SIFRE });
    const yeniIle = await api('/api/ogrenci-hesap/giris', { ogrNo: OGR.ogrNo, sifre: YENI_SIFRE });
    kontrol('Kodla şifre yenilenir: eski şifre geçmez, yeni şifre geçer', yen.kod === 200 && eskiIle.kod === 401 && yeniIle.kod === 200);
    const olmayanSif = await api('/api/ogrenci-hesap/sifre-sifirla-baslat', { ogrNo: '2023104032' });
    kontrol('Hesabı olmayan numaraya şifre yenileme yanıtı aynıdır (hesap varlığı sızmaz)', olmayanSif.kod === 200 && !olmayanSif.v.epostaMaske);

    // 5) Öğretmen paneli: telefon görünür, sıfırlama
    const liste = await api('/api/ogrenci-hesap/hoca-liste', undefined, hocaBaslik);
    const satir = (liste.v.ogrenciler || []).find((o) => o.ogrNo === OGR.ogrNo);
    kontrol('Öğretmen panelinde öğrencinin e-postası ve telefonu görünür', satir && satir.telefon === '05321112233' && satir.eposta === 'zeynep@ogrenci.edu.tr' && satir.durum === 'aktif', JSON.stringify(satir));
    kontrol('Öğrenciye dönen hiçbir yanıtta telefon yok', !JSON.stringify(r1.v).includes('0532') && !JSON.stringify(dogru.v).includes('0532'));
    const sifirla = await api('/api/ogrenci-hesap/hoca-sifirla', { ogrNo: OGR.ogrNo }, hocaBaslik);
    const sonra = await api('/api/ogrenci-hesap/durum', { ogrNo: OGR.ogrNo });
    kontrol('Öğretmen hesabı sıfırlayınca öğrenci yeniden ilk giriş adımına döner', sifirla.kod === 200 && sonra.v.durum === 'yeni');

    // 6) Deneme sınırları
    await api('/api/ogrenci-hesap/kayit-baslat', { ogrNo: '2023104024', eposta: 'm@ogrenci.edu.tr', telefon: '05001112233', sifre: SIFRE, sifreTekrar: SIFRE });
    let sonKodYanit = null;
    for (let i = 0; i < 6; i++) sonKodYanit = await api('/api/ogrenci-hesap/kayit-onayla', { ogrNo: '2023104024', kod: '000001' });
    kontrol('5 hatalı koddan sonra kod kilitlenir (yeni kod istenmeli)', sonKodYanit.kod === 429, JSON.stringify(sonKodYanit));
    let girisYanit = null;
    for (let i = 0; i < 9; i++) girisYanit = await api('/api/ogrenci-hesap/giris', { ogrNo: OGR.ogrNo, sifre: 'Yanlis.Sifre1' });
    kontrol('8 hatalı girişten sonra giriş geçici olarak engellenir (429)', girisYanit.kod === 429, JSON.stringify(girisYanit));
    let hocaYanit = null;
    for (let i = 0; i < 9; i++) hocaYanit = await api('/api/hoca-giris', { kullaniciAdi: 'deneme-kaba-kuvvet', sifre: 'x' });
    kontrol('Öğretmen girişinde de 8 hatalı denemeden sonra engel (429)', hocaYanit.kod === 429, JSON.stringify(hocaYanit));
  } finally {
    await tarayici.close();
    server.close();
  }
  console.log(`\n=== ${gecen} KONTROL GEÇTİ · ${hata} HATA ===`);
  process.exit(hata === 0 ? 0 : 1);
})().catch((e) => { console.error('TEST HATASI:', e); process.exit(1); });
