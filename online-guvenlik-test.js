/* ==========================================================================
   ONLINE SINAV GÜVENLİK TESTİ (sunucuda uygulanan kurallar + öğrenci ekranı)
   - Her dakika değişen salon kodu, ağ kısıtı, Safe Exam Browser zorunluluğu
   - İhlal sunucuda sayılır; sınırda oturum kilitlenir, yeni cevap kabul edilmez (öğrenci tarayıcıyı kurcalasa bile)
   - "Buradayım" sinyali; 1 dakikadan uzun kesinti ihlal sayılır
   - Öğrencinin kendi cihazında: kural metni sunucunun sınırını gösterir, onaysız başlanmaz,
     sayaç "İhlal 1 / 2", son hakta uyarı, sınırda sınav biter; kural onayı kayda yazılır; zaman izi tutulur
   Çalıştırma: node online-guvenlik-test.js
   ========================================================================== */
'use strict';
process.env.SINAV_OGRENCI_HESAP_ZORUNLU = '0';
const fs = require('fs');
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
const SORULAR = [
  { id: 'q1', tur: 'dy', metin: 'Güvenlik duvarı varsayılan reddetmelidir.', dogruDY: 'D' },
  { id: 'q2', tur: 'dy', metin: 'NAT bir şifreleme yöntemidir.', dogruDY: 'Y' },
  { id: 'q3', tur: 'test', metin: 'En az yetki ilkesi nedir?', siklar: ['Gereken en dar erişim', 'Tam erişim', 'Erişim yok', 'Misafir', 'Yönetici'], dogruHarf: 'A' },
  { id: 'q4', tur: 'test', metin: 'DMZ nedir?', siklar: ['Bölge', 'Port', 'Kablo', 'VLAN', 'MAC'], dogruHarf: 'A' }
];
const OGRENCILER = [{ ogrNo: '2023104011', adSoyad: 'Ali Yılmaz' }, { ogrNo: '2023104022', adSoyad: 'Mehmet Demir' }, { ogrNo: '2023104033', adSoyad: 'Zeynep Ak' }];

(async () => {
  console.log('=== ONLINE SINAV GÜVENLİK TESTİ ===');
  // Çekirdek
  const sir = 'TEST-SIRRI-123';
  const k0 = C.uretDegisenSalonKodu(sir, 1800000000000);
  kontrol('Değişen salon kodu: şimdiki ve önceki dakika geçerli, 2 dakika önceki geçersiz', C.dogrulaDegisenSalonKodu(sir, k0, 1800000000000) && C.dogrulaDegisenSalonKodu(sir, k0, 1800000060000) && !C.dogrulaDegisenSalonKodu(sir, k0, 1800000125000));
  let nb = C.isleSinavNabzi({}, 1000, 2);
  nb = C.isleSinavNabzi(nb.kayit, 20000, 2);
  const kisa = nb.kesinti;
  nb = C.isleSinavNabzi(nb.kayit, 90000, 2);
  kontrol('Nabız: 20 sn normal, 70 sn kesinti 1 ihlal sayılır', !kisa && nb.kesinti && nb.kayit.ihlalSayisi === 1);

  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const api = async (yol, govde, baslik = {}) => {
    const r = await fetch(taban + yol, { method: govde === undefined ? 'GET' : 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, baslik), body: govde === undefined ? undefined : JSON.stringify(govde) });
    return { kod: r.status, v: await r.json().catch(() => ({})) };
  };
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const hatalar = [];
  try {
    const hoca = await api('/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
    const HB = { Authorization: `Bearer ${hoca.v.token}` };
    const tanimla = (ek) => api('/api/online-sinav-tanimla', { sinav: Object.assign({ sinavId: 'GUV-FINAL', baslik: 'GUV305 Final', sureDk: 30, dySayisi: 2, testSayisi: 2, klasikSayisi: 0, aktif: true, maksIhlal: 2, kisiyeOzel: true, sorular: SORULAR, havuzSorulari: SORULAR }, ek), ogrenciler: OGRENCILER }, HB);

    // 1) Değişen salon kodu
    const t1 = await tanimla({ degisenSalonKodu: true });
    kontrol('Öğretmen sınavı "değişen salon kodu" ve 2 ihlal sınırıyla tanımladı', t1.kod === 200, JSON.stringify(t1.v).slice(0, 160));
    const durum = await api('/api/online-sinav-durum');
    kontrol('Öğrencinin gördüğü sınav bilgisi: 2 ihlal sınırı ve kod gerekli; sır gönderilmez', durum.v.maksIhlal === 2 && durum.v.degisenSalonKodu === true && durum.v.erisimKoduGerekli === true && !JSON.stringify(durum.v).includes('salonSirri'), JSON.stringify(durum.v));
    const kodsuz = await api('/api/ogrenci-oturum-baslat', { ogrNo: '2023104022', adSoyad: 'Mehmet Demir' });
    const yanlis = await api('/api/ogrenci-oturum-baslat', { ogrNo: '2023104022', adSoyad: 'Mehmet Demir', erisimKodu: '000000' });
    kontrol('Salon kodu olmadan / yanlış kodla sınava girilemez', kodsuz.kod === 403 && yanlis.kod === 403 && kodsuz.v.degisenKodHatali === true, JSON.stringify([kodsuz.v, yanlis.v]));
    const izinsizKod = await api('/api/online-salon-kodu');
    kontrol('Salon kodunu yalnız öğretmen görebilir', izinsizKod.kod === 401);
    const salon = await api('/api/online-salon-kodu', undefined, HB);
    kontrol('Öğretmen projeksiyon için güncel kodu ve kalan süreyi alır', salon.v.aktif === true && /^\d{6}$/.test(salon.v.kod) && salon.v.kalanSn > 0, JSON.stringify(salon.v));
    const ot = await api('/api/ogrenci-oturum-baslat', { ogrNo: '2023104022', adSoyad: 'Mehmet Demir', erisimKodu: salon.v.kod });
    kontrol('Güncel kodla sınav açılır; yanıt ihlal sınırını (2) bildirir; doğru cevap gönderilmez', ot.kod === 200 && ot.v.maksIhlal === 2 && !JSON.stringify(ot.v.sorular || []).includes('dogru'), JSON.stringify(ot.v).slice(0, 200));
    const TB = { Authorization: `Bearer ${ot.v.token}` };
    // 2) İhlal sunucuda sayılır, sınırda kilit
    const log = (tur) => api('/api/kiosk-log-kaydet', { token: ot.v.token, olayTuru: tur, aciklama: 'test' }, TB);
    const c1 = await api('/api/ogrenci-cevap', { token: ot.v.token, soruId: ot.v.sorular[0].id, secim: 'D' }, TB);
    kontrol('Cevap kaydedilir', c1.kod === 200, JSON.stringify(c1.v));
    const onay = await log('KURAL_ONAYI');
    kontrol('Kural onayı ihlal sayılmaz', onay.kod === 201 && onay.v.ihlalSayisi === undefined);
    const i1 = await log('IHLAL_SEKME_UYGULAMA');
    kontrol('1. ihlal sunucuda sayıldı, kilit yok', i1.v.ihlalSayisi === 1 && i1.v.kilitli === false && i1.v.maksIhlal === 2, JSON.stringify(i1.v));
    const i2 = await log('IHLAL_ODAK_KAYBI');
    kontrol('2. ihlalde oturum sunucuda kilitlendi', i2.v.ihlalSayisi === 2 && i2.v.kilitli === true, JSON.stringify(i2.v));
    const c2 = await api('/api/ogrenci-cevap', { token: ot.v.token, soruId: ot.v.sorular[1].id, secim: 'Y' }, TB);
    kontrol('Kilitli oturum yeni cevap kabul etmez (tarayıcı kurcalansa bile)', c2.kod === 403 && c2.v.ihlalKilidi === true, JSON.stringify(c2.v));
    const nab = await api('/api/ogrenci-nabiz', { token: ot.v.token }, TB);
    kontrol('Nabız yanıtı kilidi bildirir', nab.kod === 200 && nab.v.kilitli === true && nab.v.ihlalSayisi === 2, JSON.stringify(nab.v));
    const nabIzinsiz = await api('/api/ogrenci-nabiz', { token: 'sahte' });
    kontrol('Geçersiz oturumla nabız reddedilir', nabIzinsiz.kod === 401);

    // 3) Ağ kısıtı
    await tanimla({ sinavId: 'GUV-AG', izinliAg: '10.99.', degisenSalonKodu: false });
    const ag = await api('/api/ogrenci-oturum-baslat', { ogrNo: '2023104033', adSoyad: 'Zeynep Ak' });
    kontrol('İzinli ağ dışından (127.0.0.1) sınava girilemez', ag.kod === 403 && ag.v.agKisitli === true, JSON.stringify(ag.v));
    // 4) Safe Exam Browser
    await tanimla({ sinavId: 'GUV-SEB', izinliAg: '', sebZorunlu: true });
    const sebYok = await api('/api/ogrenci-oturum-baslat', { ogrNo: '2023104033', adSoyad: 'Zeynep Ak' }, { 'User-Agent': 'Mozilla/5.0 Chrome/130' });
    const sebVar = await api('/api/ogrenci-oturum-baslat', { ogrNo: '2023104033', adSoyad: 'Zeynep Ak' }, { 'User-Agent': 'Mozilla/5.0 Chrome/130 SEB/3.6.1' });
    kontrol('SEB zorunluyken normal tarayıcı reddedilir, SEB kabul edilir', sebYok.kod === 403 && sebYok.v.sebGerekli === true && sebVar.kod === 200, JSON.stringify([sebYok.v, sebVar.kod]));

    // 5) Öğrencinin kendi cihazı: kurallar, sayaç, uyarı, sınırda bitiş
    await tanimla({ sinavId: 'GUV-UI', sebZorunlu: false, degisenSalonKodu: true, maksIhlal: 2 });
    const ctx = await tarayici.createBrowserContext();
    const s = await ctx.newPage();
    await s.setViewport({ width: 1280, height: 860 });
    s.on('pageerror', (e) => hatalar.push(e.message));
    s.on('dialog', async (d) => { await d.accept(); });
    await s.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await s.evaluate(() => document.getElementById('btn-kiosk-ogrenci-modu').click());
    await bekle(800);
    await s.evaluate(() => {
      const no = document.getElementById('kiosk-ogr-no');
      no.value = '2023104011';
      no.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await bekle(400);
    const kural = await s.evaluate(() => ({
      rozet: document.getElementById('kiosk-dinamik-ihlal-kurali').textContent,
      metin: document.getElementById('kiosk-kural-ihlal-metni').textContent,
      salonGorunur: getComputedStyle(document.getElementById('kiosk-salon-kodu-satir')).display !== 'none'
    }));
    kontrol('Öğrenci cihazında kural metni sunucunun sınırını söyler ("2. ihlalde sınavınız sonlandırılır")', /2 İhlalde/.test(kural.rozet) && /2\. ihlalde sınavınız otomatik sonlandırılır/.test(kural.metin), JSON.stringify(kural));
    kontrol('Öğrenci cihazında salon kodu alanı görünür', kural.salonGorunur);
    const salon2 = await api('/api/online-salon-kodu', undefined, HB);
    await s.evaluate((kod) => {
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
      set('kiosk-ad-soyad', 'Ali Yılmaz'); set('kiosk-eposta', 'ali@uni.edu.tr'); set('kiosk-telefon', '05321112233');
      set('kiosk-sifre', 'Ali!2026xy'); set('kiosk-sifre-tekrar', 'Ali!2026xy'); set('kiosk-salon-kodu', kod);
      document.getElementById('kiosk-okudum-onay').checked = false;
    }, salon2.v.kod);
    await s.click('#btn-kiosk-oturum-baslat');
    await bekle(300);
    const onaysiz = await s.$eval('#kiosk-hata-kutu', (e) => !e.hidden && /Okudum/.test(e.textContent));
    kontrol('Kurallar onaylanmadan sınav başlamaz', onaysiz);
    await s.click('#kiosk-okudum-onay');
    await s.click('#btn-kiosk-oturum-baslat');
    await bekle(1500);
    const basladi = await s.evaluate(() => ({ sahne: getComputedStyle(document.getElementById('kiosk-soru-sahne')).display, sayac: document.getElementById('kiosk-ihlal-sayac').textContent, hataK: document.getElementById('kiosk-hata-kutu').hidden ? '' : document.getElementById('kiosk-hata-kutu').textContent }));
    kontrol('Güncel salon koduyla öğrenci sınava başladı; sayaç "İhlal: 0 / 2"', basladi.sahne !== 'none' && /İhlal: 0 \/ 2/.test(basladi.sayac), JSON.stringify(basladi));
    await s.evaluate(() => window.dispatchEvent(new Event('blur')));
    await bekle(800);
    const ilk = await s.evaluate(() => ({ sayac: document.getElementById('kiosk-ihlal-sayac').textContent, uyari: document.getElementById('kiosk-ihlal-uyari-kutusu').textContent }));
    kontrol('1. ihlal: sayaç "1 / 2" ve "bir ihlal daha olursa sınavınız sonlandırılacak" uyarısı', /1 \/ 2/.test(ilk.sayac) && /Bir ihlal daha olursa sınavınız otomatik olarak sonlandırılacak/.test(ilk.uyari), JSON.stringify(ilk));
    await s.evaluate(() => window.dispatchEvent(new Event('blur')));
    await bekle(2000);
    const bitti = await s.evaluate(() => ({ aktif: document.body.classList.contains('kiosk-aktif'), ot: window.__kioskOturumOku ? window.__kioskOturumOku() : null, sahne: getComputedStyle(document.getElementById('kiosk-soru-sahne')).display }));
    const loglar = await api('/api/kiosk-log-indir?format=json&sinavId=TUMU', undefined, HB);
    const logMetni = JSON.stringify(loglar.v);
    kontrol('2. ihlalde sınav sona erdi (öğrenci ekranı soru göstermiyor)', bitti.sahne === 'none' || !bitti.aktif, JSON.stringify(bitti));
    kontrol('Kural onayı ve ihlaller değiştirilemez kayda yazıldı', /KURAL_ONAYI/.test(logMetni) && /IHLAL_ODAK_KAYBI/.test(logMetni), logMetni.slice(0, 200));
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
