/* ==========================================================================
   YOKLAMA OKUTMA TESTİ (Chrome + puppeteer-core)
   - Stüdyo "Okunabilir yoklama (telefonla okunur)" çizelgesi basar (20 öğrenci/sayfa, köşe kareleri + kare desen).
   - Telefon imzalı çizelgenin (eğik) fotoğrafını okur: imzası olan = geldi, boş / GELMEDİ balonu = gelmedi.
   - Renkli halkalarla gösterir, satıra dokununca düzeltilir, okunan kağıtlarla çapraz kontrol yapar.
   - Kaydedilen yoklama bilgisayarda Kayıtlar ve Öğrenci Dosyası'nda görünür; imzası yok ama kağıdı okunmuşsa şüphe.
   - Öğrenci listesi değişmişse çizelge kaydedilmez; çizelge olmayan fotoğraf reddedilir.
   Çalıştırma: node yoklama-test.js
   ========================================================================== */
'use strict';
process.env.SINAV_OGRENCI_HESAP_ZORUNLU = '0';
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

const GIZLI = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';
const OGRENCILER = Array.from({ length: 23 }, (_, i) => ({ ogrNo: String(247419000 + i * 3), adSoyad: `Öğrenci ${String(i + 1).padStart(2, '0')}`, dersIdler: ['DERS-AG'] }));
const KASA = {
  dersler: [{ id: 'DERS-AG', kod: 'BIL101', ad: 'Ağ Temelleri' }],
  ogrenciler: OGRENCILER,
  kayitliSinavlar: [{
    id: 'S-VIZE', dersId: 'DERS-AG', sinavKodu: 'BIL101-5-5-0', ad: 'BIL101 Vize · 10.11.2026', guncellemeMs: 1000,
    sinavYapisi: {
      dySayisi: 5, testSayisi: 5, klasikSayisi: 0, sikSayisi: 5, kimlikModu: 'son3', haneSayisi: 3,
      dyToplamPuan: 40, testToplamPuan: 60, klasikToplamPuan: 0, sinavGizliAnahtar: GIZLI,
      cevapAnahtarlari: { A: { dy: ['D', 'Y', 'D', 'Y', 'D'], test: ['A', 'B', 'C', 'D', 'E'], klasik: [] } }
    }
  }]
};

(async () => {
  console.log('=== YOKLAMA OKUTMA TESTİ ===');
  // Çekirdek: sunucu olay doğrulaması ve çapraz kontrol
  const temiz = C.dogrulaVeTemizleSenkronOlayi({ eventId: 'Y1', tur: 'YOKLAMA', sinavKodu: 'K', veri: { sayfa: 1, toplamSayfa: 2, satirlar: [{ ogrNo: '1', durum: 'geldi' }, { ogrNo: '2', durum: '<script>' }, { durum: 'geldi' }, { ogrNo: '3', durum: 'gelmedi', elle: 1 }] } });
  kontrol('Sunucu YOKLAMA olayını kabul eder; geçersiz durum "belirsiz" olur, numarasız satır atılır', temiz.tur === 'YOKLAMA' && temiz.veri.satirlar.length === 3 && temiz.veri.satirlar[1].durum === 'belirsiz' && temiz.veri.satirlar[2].elle === true, JSON.stringify(temiz.veri));
  const ck = C.yoklamaCaprazKontrol([{ ogrNo: '1', durum: 'geldi' }, { ogrNo: '2', durum: 'gelmedi' }, { ogrNo: '3', durum: 'gelmedi' }], ['2']);
  kontrol('Çapraz kontrol: imzası var kağıdı yok (1), imzası yok kağıdı var (2), gelmedi (3)', ck.imzaVarKagitYok.length === 1 && ck.kagitVarImzaYok[0].ogrNo === '2' && ck.gelmedi[0].ogrNo === '3');
  const dosyaC = C.olusturOgrenciDosyasi('2', { sinavlar: [{ ad: 'Vize', sinavKodu: 'K', okumalar: [{ ogrNo: '2', toplamPuan: 50 }] }], yoklamalar: [{ ogrNo: '2', durum: 'gelmedi', sinavKodu: 'K' }] });
  kontrol('Öğrenci dosyası: imzası yok ama kağıdı var → "yoklama uyuşmazlığı" şüphesi', dosyaC.supheler.some((x) => x.tur === 'YOKLAMA_UYUMSUZ'));

  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const hatalar = [];
  const api = async (yol, govde, token, metot) => {
    const r = await fetch(taban + yol, {
      method: metot || (govde === undefined ? 'GET' : 'POST'),
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
      body: govde === undefined ? undefined : JSON.stringify(govde)
    });
    return { s: r.status, v: await r.json().catch(() => ({})) };
  };
  const gorselYolu = path.resolve('test-artifacts', 'yoklama-girdi.png');
  fs.mkdirSync(path.dirname(gorselYolu), { recursive: true });

  try {
    const giris = await api('/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
    const token = giris.v.token;
    const mevcut = await api('/api/bulut-kasa', undefined, token);
    const put = await api('/api/bulut-kasa', { veri: KASA, bazRevizyonNo: Number(mevcut.v.revizyonNo) || undefined, silmeOnayi: true, zorlaEz: true }, token, 'PUT');
    kontrol('Bulutta 23 öğrencili ders ve sınav var', put.s === 200, String(put.s));

    // ── TELEFON
    const tel = await (await tarayici.createBrowserContext()).newPage();
    await tel.setViewport({ width: 390, height: 844 });
    tel.on('pageerror', (e) => hatalar.push(`tel: ${e.message}`));
    tel.on('dialog', async (d) => { await d.accept(); });
    const es = await api('/api/telefon-eslestir/olustur', {}, token);
    await tel.goto(`${taban}/optik-mobil#eslestir=${es.v.kod}`, { waitUntil: 'networkidle0' });
    await bekleKosul(() => tel.$eval('#mobil-hesap-durum', (e) => /güncel/.test(e.textContent)), 10000);
    const ogrSayisi = await tel.evaluate(() => window.__mobilDurumOku().ogrenciler.length);
    kontrol('Telefon bağlanınca öğrenci listesi geldi (23)', ogrSayisi === 23, String(ogrSayisi));
    const butonVar = await tel.$eval('#btn-mobil-yoklama-okut', (e) => e.offsetParent !== null && /Yoklama okut/.test(e.textContent));
    kontrol('Hesap kartında "📝 Yoklama okut" düğmesi görünür', butonVar);

    // 8. öğrencinin (247419021) sınav kağıdı okunur — ama yoklamada imzası olmayacak
    const kagit = await tel.evaluate((g) => {
      const Cm = window.SinavOptikCekirdek;
      const cv = document.createElement('canvas');
      Cm.cizSentetikOptikFormCanvas(cv, { dySayisi: 5, testSayisi: 5, klasikSayisi: 0, sikSayisi: 5, kimlikModu: 'son3', haneSayisi: 3, sinavGizliAnahtar: g }, { grup: 'A', ogrNoKod: '021', dyCevaplar: ['D', 'Y', 'D', 'Y', 'D'], testCevaplar: ['A', 'B', 'C', 'D', 'E'], klasikPuanlar: [] });
      return cv.toDataURL('image/png');
    }, GIZLI);
    fs.writeFileSync(gorselYolu, Buffer.from(kagit.split(',')[1], 'base64'));
    await (await tel.$('#input-mobil-foto')).uploadFile(gorselYolu);
    await bekle(1600);
    await tel.evaluate(() => { const b = document.getElementById('btn-mobil-dogrulama-tamam'); const k = document.getElementById('mobil-dogrulama'); if (k && !k.hidden && b) b.click(); });
    const okunan = await tel.evaluate(() => window.__mobilDurumOku().okumaSonuclari.map((s) => s.ogrNo));
    kontrol('Sınav kağıdı okundu (247419021)', okunan.includes('247419021'), JSON.stringify(okunan));

    // Çizelge fotoğrafı üret: imzalar el yazısı gibi, 4° eğik, gri masa üstünde
    const cizelgeFoto = (ogrList, sayfaNo, imzaYok, gelmediBalon, aci) => tel.evaluate(async (liste, si, yok, balon, a) => {
      const Cm = window.SinavOptikCekirdek;
      const svg = Cm.uretOkunabilirYoklamaSVG(liste, { baslik: 'BIL101 Ağ Temelleri · Vize', tarih: '10.11.2026' })[si];
      const img = new Image();
      await new Promise((ok) => { img.onload = ok; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('width="100%"', 'width="800" height="960"')); });
      const f = document.createElement('canvas'); f.width = 800; f.height = 960;
      const fx = f.getContext('2d');
      fx.drawImage(img, 0, 0);
      const satirSayisi = Math.min(20, liste.length - si * 20);
      for (let i = 0; i < satirSayisi; i++) {
        if (yok.includes(i)) continue;
        const y = 110 + i * 40 + 5;
        fx.strokeStyle = '#1a237e'; fx.lineWidth = 2.2; fx.beginPath(); fx.moveTo(490, y + 20);
        for (let k = 0; k < 9; k++) fx.quadraticCurveTo(500 + k * 18, y + (k % 2 ? 4 : 26), 510 + k * 18, y + 15);
        fx.stroke();
      }
      balon.forEach((i) => { fx.fillStyle = '#111'; fx.beginPath(); fx.arc(742, 110 + i * 40 + 20, 8, 0, Math.PI * 2); fx.fill(); });
      const c = document.createElement('canvas'); c.width = 1200; c.height = 1500;
      const cx = c.getContext('2d');
      cx.fillStyle = '#8a8478'; cx.fillRect(0, 0, c.width, c.height);
      cx.save(); cx.translate(600, 750); cx.rotate(a); cx.scale(1.15, 1.15); cx.drawImage(f, -400, -480); cx.restore();
      return c.toDataURL('image/png');
    }, ogrList, sayfaNo, imzaYok, gelmediBalon, aci);
    const yukle = async (dataUrl) => {
      fs.writeFileSync(gorselYolu, Buffer.from(dataUrl.split(',')[1], 'base64'));
      await (await tel.$('#input-mobil-yoklama')).uploadFile(gorselYolu);
    };
    const telOgr = await tel.evaluate(() => window.__mobilDurumOku().ogrenciler.map((o) => ({ ogrNo: o.ogrNo, adSoyad: o.adSoyad })));

    // Sayfa 1: 4. (247419009) ve 8. (247419021) öğrencinin imzası yok, 8.'nin GELMEDİ balonu dolu
    await yukle(await cizelgeFoto(telOgr, 0, [3, 7], [7], 0.07));
    const acildi = await bekleKosul(() => tel.$eval('#mobil-yoklama', (e) => !e.hidden && e.style.display === 'flex'), 6000);
    kontrol('Çizelge fotoğrafı okununca yoklama ekranı açılır', acildi);
    const ozet = await tel.$eval('#mobil-yoklama-ozet', (e) => e.textContent);
    kontrol('Özet: Sayfa 1/2 · 18 geldi · 2 gelmedi', /Sayfa 1\/2/.test(ozet) && /18 geldi/.test(ozet) && /2 gelmedi/.test(ozet) && !/emin değil/.test(ozet), ozet);
    const cizim = await tel.evaluate(() => window.__sonYoklamaCizimi);
    kontrol('Fotoğraf üzerinde 4 köşe yeşil, 18 yeşil (geldi) ve 2 kırmızı (gelmedi) halka çizildi', cizim && cizim.kose === 4 && cizim.net === 18 && cizim.cift === 2 && cizim.supheli === 0, JSON.stringify(cizim));
    const satirlar = await tel.$$eval('#mobil-yoklama-liste [data-yoklama-satir]', (bs) => bs.map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
    kontrol('Liste 20 satır; 4. ve 8. öğrenci "Gelmedi", diğerleri "Geldi"', satirlar.length === 20 && /247419009.*Gelmedi/.test(satirlar[3]) && /247419021.*Gelmedi/.test(satirlar[7]) && satirlar.filter((t) => /✓ Geldi/.test(t)).length === 18, JSON.stringify(satirlar.slice(0, 9)));
    const capraz = await tel.$eval('#mobil-yoklama-capraz', (e) => e.textContent);
    kontrol('Çapraz kontrol: "Kağıdı okundu ama imzası yok: 247419021" uyarısı', /Kağıdı okundu ama imzası yok: 247419021/.test(capraz) && /İmzası var ama kağıdı okunmadı/.test(capraz), capraz);
    // Elle düzeltme: 4. satıra dokun → Geldi (✎), tekrar dokun → Gelmedi
    await tel.$eval('#mobil-yoklama-liste [data-yoklama-satir="3"]', (b) => b.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await bekle(150);
    await tel.click('#mobil-yoklama-liste [data-yoklama-satir="3"]');
    let s3 = await tel.$eval('#mobil-yoklama-liste [data-yoklama-satir="3"]', (e) => e.textContent);
    const ozet2 = await tel.$eval('#mobil-yoklama-ozet', (e) => e.textContent);
    kontrol('Satıra dokununca Geldi olur, elle düzeltme işareti (✎) çıkar, özet güncellenir', /✓ Geldi/.test(s3) && /✎/.test(s3) && /19 geldi/.test(ozet2), `${s3} · ${ozet2}`);
    await tel.$eval('#mobil-yoklama-liste [data-yoklama-satir="3"]', (b) => b.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await bekle(150);
    await tel.click('#mobil-yoklama-liste [data-yoklama-satir="3"]');
    s3 = await tel.$eval('#mobil-yoklama-liste [data-yoklama-satir="3"]', (e) => e.textContent);
    kontrol('Tekrar dokununca Gelmedi olur', /✕ Gelmedi/.test(s3), s3);
    const ekran = path.resolve('test-artifacts', 'yoklama-telefon.png');
    await tel.screenshot({ path: ekran });
    await tel.click('#btn-mobil-yoklama-kaydet');
    await bekle(300);
    const kapandi = await tel.$eval('#mobil-yoklama', (e) => e.hidden);
    const durumMetni = await tel.$eval('#mobil-hesap-durum', (e) => e.textContent);
    kontrol('Kaydet: ekran kapanır, "18 geldi, 2 gelmedi" mesajı', kapandi && /18 geldi, 2 gelmedi/.test(durumMetni), durumMetni);
    const sunucuda = await bekleKosul(async () => {
      const r = await api('/api/v2/sinav-senkron?sinceSeq=0', undefined, token);
      return (r.v.olaylar || []).some((o) => o.tur === 'YOKLAMA' && o.veri.satirlar.length === 20 && o.veri.satirlar.filter((x) => x.durum === 'gelmedi').length === 2 && o.veri.satirlar[3].elle === true);
    }, 8000);
    kontrol('Yoklama sunucuya gitti (20 satır, 2 gelmedi, elle düzeltme işaretli)', sunucuda);

    // Sayfa 2'yi başka (eski) listeyle basılmış çizelgeden okut → kaydedilmez
    const eskiListe = telOgr.map((o, i) => (i === 21 ? { ogrNo: '247419999', adSoyad: 'Ayrılan Öğrenci' } : o));
    await yukle(await cizelgeFoto(eskiListe, 1, [], [], -0.03));
    await bekleKosul(() => tel.$eval('#mobil-yoklama', (e) => !e.hidden), 6000);
    const uyumsuz = await tel.evaluate(() => ({ ozet: document.getElementById('mobil-yoklama-ozet').textContent, kaydet: document.getElementById('btn-mobil-yoklama-kaydet').disabled, satir: document.querySelectorAll('#mobil-yoklama-liste [data-yoklama-satir]').length }));
    kontrol('Liste değişmişse "uyuşmuyor" uyarısı, Kaydet kapalı, satır gösterilmez', /uyuşmuyor/.test(uyumsuz.ozet) && uyumsuz.kaydet && uyumsuz.satir === 0, JSON.stringify(uyumsuz));
    await tel.click('#btn-mobil-yoklama-kapat');

    // Sayfa 2 doğru listeyle: 3 öğrenci, biri imzasız
    await yukle(await cizelgeFoto(telOgr, 1, [1], [], 0.02));
    await bekleKosul(() => tel.$eval('#mobil-yoklama', (e) => !e.hidden && !document.getElementById('btn-mobil-yoklama-kaydet').disabled), 6000);
    const ozetS2 = await tel.$eval('#mobil-yoklama-ozet', (e) => e.textContent);
    kontrol('Sayfa 2/2: 2 geldi · 1 gelmedi', /Sayfa 2\/2/.test(ozetS2) && /2 geldi/.test(ozetS2) && /1 gelmedi/.test(ozetS2), ozetS2);
    await tel.click('#btn-mobil-yoklama-kaydet');
    await bekle(300);

    // Çizelge olmayan fotoğraf
    const bos = await tel.evaluate(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 1200; const x = c.getContext('2d'); x.fillStyle = '#ddd'; x.fillRect(0, 0, 900, 1200); x.fillStyle = '#333'; x.font = '40px Arial'; x.fillText('Defter sayfası', 200, 400); return c.toDataURL('image/png'); });
    await yukle(bos);
    await bekle(1200);
    const bosSonuc = await tel.evaluate(() => ({ acik: !document.getElementById('mobil-yoklama').hidden, mesaj: document.getElementById('mobil-hesap-durum').textContent }));
    kontrol('Çizelge olmayan fotoğraf: ekran açılmaz, "Yoklama okunamadı" denir', !bosSonuc.acik && /Yoklama okunamadı/.test(bosSonuc.mesaj), JSON.stringify(bosSonuc));
    await bekleKosul(async () => {
      const r = await api('/api/v2/sinav-senkron?sinceSeq=0', undefined, token);
      return (r.v.olaylar || []).filter((o) => o.tur === 'YOKLAMA').length === 2;
    }, 8000);

    // ── STÜDYO (bilgisayar)
    const pc = await (await tarayici.createBrowserContext()).newPage();
    await pc.setViewport({ width: 1366, height: 900 });
    pc.on('pageerror', (e) => hatalar.push(`pc: ${e.message}`));
    pc.on('dialog', async (d) => { await d.accept(); });
    await pc.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await pc.evaluate(() => {
      document.getElementById('hoca-giris-kullanici').value = 'hoca';
      document.getElementById('hoca-giris-sifre').value = 'Demo!Hoca2026';
      document.getElementById('btn-hoca-giris-yap').click();
    });
    await bekle(1800);
    await pc.evaluate(() => { const k = document.getElementById('btn-modal-hoca-kapat'); if (k && document.getElementById('modal-hoca-giris').style.display !== 'none') k.click(); });
    await pc.evaluate(async () => { await window.__masaustuV2SenkronSimdi(); });
    await bekle(500);

    // Kayıtlar → Yoklama
    await pc.click('.sekme-btn[data-sekme="sekme-kayitlar"]');
    await bekle(800);
    await pc.select('#kayitlar-tur', 'Yoklama');
    await bekle(200);
    const kayit = await pc.$$eval('#kayitlar-liste tbody tr', (trs) => trs.map((t) => t.textContent.replace(/\s+/g, ' ')));
    kontrol('Kayıtlar: 23 yoklama satırı, 3 tanesi "İmzası yok (gelmedi)"', kayit.length === 23 && kayit.filter((t) => /İmzası yok \(gelmedi\)/.test(t)).length === 3, `${kayit.length} · ${kayit.slice(0, 2).join(' | ')}`);

    // Öğrenci Dosyası → 247419021: gelmedi + kağıdı var → şüphe
    await pc.click('.sekme-btn[data-sekme="sekme-ogrenci-dosyasi"]');
    await bekle(600);
    await pc.$eval('#ogr-dosya-ara', (e) => { e.value = '247419021'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await bekle(400);
    const dosya = await pc.$eval('#ogr-dosya-sonuc', (e) => e.textContent.replace(/\s+/g, ' '));
    kontrol('Öğrenci Dosyası: yoklamada "gelmedi" ve "Yoklama uyuşmazlığı" (kağıdı okundu) şüphesi', /❌ gelmedi/.test(dosya) && /Yoklama uyuşmazlığı/.test(dosya) && /kağıdı başkası doldurmuş olabilir/.test(dosya), dosya.slice(0, 400));
    await pc.$eval('#ogr-dosya-ara', (e) => { e.value = '247419003'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await bekle(400);
    const dosya2 = await pc.$eval('#ogr-dosya-sonuc', (e) => e.textContent.replace(/\s+/g, ' '));
    kontrol('Gelen öğrencinin dosyasında "✅ geldi", şüphe yok', /✅ geldi/.test(dosya2) && !/Yoklama uyuşmazlığı/.test(dosya2), dosya2.slice(0, 300));

    // Çıktı merkezi: okunabilir yoklama
    const cikti = await pc.evaluate(async () => {
      const sec = document.getElementById('baski-kapsam-sec');
      const secenek = sec && Array.from(sec.options).some((o) => o.value === 'okunur-yoklama');
      return { secenek };
    });
    kontrol('Çıktı merkezinde "Okunabilir yoklama (telefonla okunur)" seçeneği var', cikti.secenek);
    const ogrPc = await pc.evaluate(() => (window.__studyoDurumOku ? window.__studyoDurumOku().ogrenciler.length : -1));
    const onizleme = await pc.evaluate(async () => {
      const sec = document.getElementById('baski-kapsam-sec');
      sec.value = 'okunur-yoklama';
      sec.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 900));
      const k = document.getElementById('baski-mini-onizleme');
      return k ? { metin: k.textContent.replace(/\s+/g, ' '), svg: k.querySelectorAll('svg').length } : null;
    });
    kontrol('Önizleme okunabilir yoklama sayfasını (SVG, Sayfa 1/2, GELMEDİ balonu) gösterir', onizleme && onizleme.svg >= 1 && /Sayfa 1\/2/.test(onizleme.metin) && /GELMEDİ/.test(onizleme.metin), `${JSON.stringify(onizleme).slice(0, 200)} · öğrenci ${ogrPc}`);

    kontrol('Sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
  } catch (err) {
    hata++;
    console.log('  ✗ HATA beklenmeyen:', err.stack || err.message);
  } finally {
    await tarayici.close();
    server.close();
  }
  console.log(`\nSonuç: ${gecen} geçti, ${hata} hata`);
  process.exit(hata ? 1 : 0);
})();
