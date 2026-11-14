/* ==========================================================================
   TELEFON ↔ BİLGİSAYAR EŞLEŞTİRME TESTİ (Chrome + puppeteer-core)
   Gerçek akış: hoca bilgisayarda giriş yapar → "Telefonu Bağla" karekodu →
   telefon karekod adresini açar → bağlanır → dersler + A/B cevap anahtarları + sınıf listesi iner →
   bilgisayar penceresi "Telefon bağlandı" der. Ayrıca: kod tek kullanımlık, yanlış kod reddedilir,
   "Senkronize Et" bilgisayarda değişen anahtarı getirir ve okunmuş kağıtları yeniden puanlar.
   Çalıştırma: node telefon-eslestir-test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
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
async function bekleKosul(fn, ms = 8000) {
  const son = Date.now() + ms;
  while (Date.now() < son) {
    try { if (await fn()) return true; } catch (_) {}
    await bekle(150);
  }
  return false;
}

const ANAHTAR_A = { dy: ['D', 'Y', 'D', 'Y', 'D'], test: ['A', 'B', 'C', 'D', 'E'], klasik: [] };
const ANAHTAR_B = { dy: ['Y', 'D', 'Y', 'D', 'Y'], test: ['E', 'D', 'C', 'B', 'A'], klasik: [] };
const kasaVerisi = (testA) => ({
  dersler: [{ id: 'DERS-AG', kod: 'BIL101', ad: 'Ağ Temelleri' }, { id: 'DERS-GUV', kod: 'GUV305', ad: 'Güvenlik Duvarı' }],
  ogrenciler: [
    { ogrNo: '247419053', adSoyad: 'Deneme Bir', dersIdler: ['DERS-AG'] },
    { ogrNo: '257419205', adSoyad: 'Deneme İki', dersIdler: ['DERS-AG'] },
    { ogrNo: '257419005', adSoyad: 'Deneme Üç', dersIdler: ['DERS-GUV'] }
  ],
  kayitliSinavlar: [{
    id: 'S1', dersId: 'DERS-AG', sinavKodu: 'BIL101-5-5-0', sinavAdi: 'BIL101 Vize',
    sinavYapisi: {
      dySayisi: 5, testSayisi: 5, klasikSayisi: 0, sikSayisi: 5, kimlikModu: 'son3', haneSayisi: 3,
      dyToplamPuan: 40, testToplamPuan: 60, klasikToplamPuan: 0,
      sinavGizliAnahtar: 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
      cevapAnahtarlari: { A: Object.assign({}, ANAHTAR_A, { test: testA }), B: ANAHTAR_B }
    }
  }]
});

(async () => {
  console.log('=== TELEFON ↔ BİLGİSAYAR EŞLEŞTİRME TESTİ ===');
  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const hatalar = [];
  // Bilgisayar ve telefon AYRI tarayıcı profilleri (ayrı localStorage) — gerçekteki iki cihaz gibi
  const masaustuBaglam = await tarayici.createBrowserContext();
  const telefonBaglam = await tarayici.createBrowserContext();
  const pc = await masaustuBaglam.newPage();
  await pc.setViewport({ width: 1366, height: 860 });
  const tel = await telefonBaglam.newPage();
  await tel.setViewport({ width: 390, height: 844 });
  for (const [ad, s] of [['pc', pc], ['tel', tel]]) {
    s.on('pageerror', (e) => hatalar.push(`${ad}: ${e.message}`));
    s.on('dialog', async (d) => { await d.accept(); });
  }

  try {
    // 1) Bilgisayar: giriş + buluta ders/sınav yaz
    await pc.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await pc.evaluate(() => {
      document.getElementById('hoca-giris-kullanici').value = 'hoca';
      document.getElementById('hoca-giris-sifre').value = 'Demo!Hoca2026';
      document.getElementById('btn-hoca-giris-yap').click();
    });
    await bekleKosul(() => pc.evaluate(() => Boolean(sessionStorage.getItem('hoca_token'))));
    await bekle(800);
    const kasaYaz = (veri) => pc.evaluate(async (v) => {
      const token = sessionStorage.getItem('hoca_token');
      const mevcut = await fetch('/api/bulut-kasa', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null);
      const r = await fetch('/api/bulut-kasa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ veri: v, bazRevizyonNo: (mevcut && Number(mevcut.revizyonNo)) || undefined, silmeOnayi: true, zorlaEz: true })
      });
      return r.status;
    }, veri);
    const kasaDurum = await kasaYaz(kasaVerisi(ANAHTAR_A.test));
    kontrol('Bilgisayar dersleri ve sınavı buluta yazdı', kasaDurum === 200, String(kasaDurum));

    // 2) Kenar çubuğundaki "Telefonu Bağla" → karekod + 8 haneli kod
    const dugmeVar = await pc.$eval('#btn-telefon-bagla', (b) => b.textContent.includes('Telefonu Bağla'));
    kontrol('Kenar çubuğunda "Telefonu Bağla" düğmesi var', dugmeVar);
    await pc.evaluate(() => { const k = document.getElementById('btn-modal-hoca-kapat'); if (k && document.getElementById('modal-hoca-giris').style.display === 'flex') k.click(); });
    await pc.click('#btn-telefon-bagla');
    const kodGeldi = await bekleKosul(() => pc.$eval('#telefon-bagla-kod', (e) => /^[A-Z2-9]{4} [A-Z2-9]{4}$/.test(e.textContent.trim())));
    const kod = (await pc.$eval('#telefon-bagla-kod', (e) => e.textContent)).replace(/\s/g, '');
    const qrVar = await pc.$eval('#telefon-bagla-qr', (e) => Boolean(e.querySelector('svg')));
    kontrol('Pencere açıldı: karekod çizildi ve 8 haneli kod gösterildi', kodGeldi && qrVar && kod.length === 8, kod);

    // 3) Yanlış kod reddedilir
    await tel.goto(`${taban}/optik-mobil.html`, { waitUntil: 'networkidle0' });
    const bagliDegilGorunur = await tel.$eval('#mobil-hesap-bagli-degil', (e) => !e.hidden);
    kontrol('Telefon ilk açılışta "Önce telefonu bilgisayara bağlayın" kartını gösterir', bagliDegilGorunur);
    await tel.type('#girdi-mobil-eslesme-kod', 'ABCD2345');
    await tel.click('#btn-mobil-eslesme-bagla');
    await bekleKosul(() => tel.$eval('#mobil-hesap-durum', (e) => /süresi|yanlış/i.test(e.textContent)));
    const yanlisMesaj = await tel.$eval('#mobil-hesap-durum', (e) => e.textContent);
    const halaBagliDegil = await tel.$eval('#mobil-hesap-bagli', (e) => e.hidden);
    kontrol('Yanlış kod reddedilir, telefon bağlanmaz', halaBagliDegil && /yanlış|süresi/i.test(yanlisMesaj), yanlisMesaj);
    await tel.evaluate(() => { document.getElementById('girdi-mobil-eslesme-kod').value = ''; });

    // 4) Telefon karekoddaki adresi açar (kameranın açtığı adresin aynısı)
    await tel.goto(`${taban}/optik-mobil#eslestir=${kod}`, { waitUntil: 'networkidle0' });
    const baglandi = await bekleKosul(() => tel.$eval('#mobil-hesap-bagli', (e) => !e.hidden), 10000);
    const ad = await tel.$eval('#mobil-hesap-ad', (e) => e.textContent);
    kontrol('Telefon karekodla bağlandı ve hocanın adını gösterir', baglandi && ad.length > 1, ad);
    const adresTemiz = await tel.evaluate(() => !location.hash.includes('eslestir'));
    kontrol('Tek kullanımlık kod adres çubuğundan silindi', adresTemiz);

    const inenler = await bekleKosul(() => tel.evaluate(() => Object.keys(window.__mobilDurumOku().dersPaketleriHaritasi).some((k) => /DERS-AG/i.test(k))), 8000);
    const d = await tel.evaluate(() => {
      const m = window.__mobilDurumOku();
      const agId = Object.keys(m.dersPaketleriHaritasi).find((k) => /DERS-AG/i.test(k));
      const ag = m.dersPaketleriHaritasi[agId] || {};
      const guvId = Object.keys(m.dersPaketleriHaritasi).find((k) => /DERS-GUV/i.test(k));
      return {
        dersSayisi: Object.keys(m.dersPaketleriHaritasi).filter((k) => k !== 'varsayilan').length,
        agOgr: (ag.ogrenciler || []).map((o) => o.ogrNo),
        guvOgr: ((m.dersPaketleriHaritasi[guvId] || {}).ogrenciler || []).map((o) => o.ogrNo),
        agA: ag.sinavYapisi && ag.sinavYapisi.cevapAnahtarlari && ag.sinavYapisi.cevapAnahtarlari.A,
        agB: ag.sinavYapisi && ag.sinavYapisi.cevapAnahtarlari && ag.sinavYapisi.cevapAnahtarlari.B,
        kimlik: ag.sinavYapisi && ag.sinavYapisi.kimlikModu,
        kilitli: Boolean(ag.sinavYapisi && ag.sinavYapisi.kurulumBekliyor)
      };
    });
    kontrol('Bağlanınca iki ders telefona indi', inenler && d.dersSayisi >= 2, JSON.stringify(d.dersSayisi));
    kontrol('Her dersin KENDİ sınıf listesi indi (listeler karışmadı)', d.agOgr.join() === '247419053,257419205' && d.guvOgr.join() === '257419005', JSON.stringify([d.agOgr, d.guvOgr]));
    kontrol('A ve B kitapçık cevap anahtarları indi', d.agA && d.agA.test.join('') === 'ABCDE' && d.agB && d.agB.test.join('') === 'EDCBA', JSON.stringify([d.agA, d.agB]));
    kontrol('Kimlik modu (son 3 hane) bilgisayardaki gibi', d.kimlik === 'son3', d.kimlik);
    kontrol('Anahtarı gelen derste okuma kilidi yok', !d.kilitli);

    // 5) Bilgisayar penceresi telefonun bağlandığını görür
    const pcGordu = await bekleKosul(() => pc.$eval('#telefon-bagla-govde', (e) => /Telefon bağlandı/.test(e.textContent)), 8000);
    kontrol('Bilgisayar penceresi "Telefon bağlandı" der', pcGordu);
    const pcKapandi = await bekleKosul(() => pc.$eval('#modal-telefon-bagla', (e) => e.style.display === 'none'), 6000);
    const dugmeMetni = await pc.$eval('#btn-telefon-bagla', (b) => b.textContent);
    kontrol('Pencere kendiliğinden kapanır, düğme "Telefon Bağlı ✓" olur', pcKapandi && /Bağlı/.test(dugmeMetni), dugmeMetni);

    // 6) Aynı kod ikinci kez kullanılamaz (başka telefon/kişi)
    const tekrar = await tel.evaluate(async (k) => {
      const r = await fetch('/api/telefon-eslestir/tamamla', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kod: k }) });
      return { s: r.status, v: await r.json() };
    }, kod);
    kontrol('Kullanılmış karekod ikinci kez bağlanamaz', tekrar.s === 410 && /zaten kullanıldı/.test(tekrar.v.hata), JSON.stringify(tekrar));

    // 7) Telefon yeniden açılınca bağlı kalır
    await tel.goto(`${taban}/optik-mobil.html`, { waitUntil: 'networkidle0' });
    const halaBagli = await tel.$eval('#mobil-hesap-bagli', (e) => !e.hidden);
    kontrol('Telefon kapatılıp açılınca bağlı kalır', halaBagli);

    // 8) Kağıt oku → bilgisayarda anahtar değişir → "Senkronize Et" → yeni anahtar + yeniden puanlama
    await tel.evaluate(() => {
      const m = window.__mobilDurumOku();
      const agId = Object.keys(m.dersPaketleriHaritasi).find((k) => /DERS-AG/i.test(k));
      const sel = document.getElementById('mobil-aktif-ders-sec');
      sel.value = agId;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await bekle(400);
    const aktifDersMetni = await tel.$eval('#mobil-hesap-aktif-ders', (e) => e.textContent);
    kontrol('Kartta okunacak ders ve öğrenci sayısı görünür', /Ağ Temelleri/.test(aktifDersMetni) && /2 öğrenci/.test(aktifDersMetni), aktifDersMetni);
    const girdiYolu = path.resolve('test-artifacts', 'telefon-eslestir.png');
    fs.mkdirSync(path.dirname(girdiYolu), { recursive: true });
    const url = await tel.evaluate(() => {
      const C = window.SinavOptikCekirdek;
      const m = window.__mobilDurumOku();
      const cv = document.createElement('canvas');
      C.cizSentetikOptikFormCanvas(cv, m.sinavYapisi, { grup: 'B', ogrNoKod: '205', dyCevaplar: ['Y', 'D', 'Y', 'D', 'Y'], testCevaplar: ['E', 'D', 'C', 'B', 'A'], klasikPuanlar: [] });
      return cv.toDataURL('image/png');
    });
    fs.writeFileSync(girdiYolu, Buffer.from(url.split(',')[1], 'base64'));
    await (await tel.$('#input-mobil-foto')).uploadFile(girdiYolu);
    await bekleKosul(() => tel.evaluate(() => window.__mobilDurumOku().okumaSonuclari.length === 1), 6000);
    const ilk = await tel.evaluate(() => { const s = window.__mobilDurumOku().okumaSonuclari[0] || {}; return { no: s.ogrNo, ad: s.adSoyad, grup: s.grup, puan: s.toplamPuan }; });
    kontrol('B kitapçıklı kağıt doğru öğrenciye, B anahtarıyla tam puan', ilk.no === '257419205' && ilk.grup === 'B' && Number(ilk.puan) === 100, JSON.stringify(ilk));
    const fis = await tel.$eval('#mobil-sonuc-icerik', (e) => e.textContent);
    kontrol('Fişte kağıtta kodlanan numara da yazar', /kağıtta kodlanan:\s*205/.test(fis), fis.slice(0, 160));

    // Bilgisayarda B anahtarı değişsin (öğretmen bir soruyu düzeltti)
    const yeni = kasaVerisi(ANAHTAR_A.test);
    yeni.kayitliSinavlar[0].sinavYapisi.cevapAnahtarlari.B = { dy: ['Y', 'D', 'Y', 'D', 'Y'], test: ['A', 'D', 'C', 'B', 'A'], klasik: [] };
    await kasaYaz(yeni);
    await tel.click('#btn-mobil-senkronize');
    await bekleKosul(() => tel.$eval('#mobil-hesap-durum', (e) => /güncel/.test(e.textContent)), 8000);
    const sonra = await tel.evaluate(() => {
      const m = window.__mobilDurumOku();
      return { b: m.sinavYapisi.cevapAnahtarlari.B.test.join(''), puan: (m.okumaSonuclari[0] || {}).toplamPuan, adet: m.okumaSonuclari.length };
    });
    kontrol('"Senkronize Et" bilgisayardaki yeni anahtarı getirdi', sonra.b === 'ADCBA', sonra.b);
    kontrol('Okunmuş kağıt yeni anahtarla yeniden puanlandı, kayıt kaybolmadı', sonra.adet === 1 && Number(sonra.puan) < 100, JSON.stringify(sonra));

    // 9) Bağlantıyı kaldır
    await tel.click('#btn-mobil-baglanti-kaldir');
    await bekle(300);
    const kaldirildi = await tel.evaluate(() => !localStorage.getItem('MOBIL_OMR_HOCA_TOKEN_V1') && !document.getElementById('mobil-hesap-bagli-degil').hidden);
    const okumalarDuruyor = await tel.evaluate(() => window.__mobilDurumOku().okumaSonuclari.length === 1);
    kontrol('"Bağlantıyı kaldır" oturumu siler, okunmuş kağıtlar telefonda kalır', kaldirildi && okumalarDuruyor);

    // 10) Giriş yapmamış biri kod üretemez
    const izinsiz = await tel.evaluate(async () => (await fetch('/api/telefon-eslestir/olustur', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
    kontrol('Öğretmen girişi olmadan karekod üretilemez (401)', izinsiz === 401, String(izinsiz));

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
