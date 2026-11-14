/* ==========================================================================
   SINAV ARŞİVİ · KOPYA ŞÜPHE RAPORU · KAYITLAR · ÖĞRENCİ DOSYASI TESTİ
   Senaryo (14.11.2026 vizesinin aynısı): telefondan gelen kağıtlarda iki öğrencinin 25 cevabı birebir aynı
   (13 ortak yanlış), bir kağıtta numara elle düzeltilmiş (250 → 247419052). Ayrıca online sınavda iki öğrenci
   aynı soruları saniyeler içinde aynı cevapla işaretliyor (zaman izi).
   Çalıştırma: node arsiv-dosya-test.js
   ========================================================================== */
'use strict';
process.env.SINAV_OGRENCI_HESAP_ZORUNLU = '0';
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
const KEY = { dy: 'YDYDDYYDDDYYDDD', t: 'CDEDACBEBA' };
const detay = (cevap, anahtar) => cevap.split('').map((v, i) => ({ verilen: v, sonuc: v === anahtar[i] ? 'DOGRU' : 'YANLIS' }));
const okuma = (id, ogrNo, ad, kod, dy, t, puan) => ({
  id, ogrNo, adSoyad: ad, okunanNoKod: kod, grup: 'A', toplamPuan: puan,
  dyDogru: detay(dy, KEY.dy).filter((x) => x.sonuc === 'DOGRU').length, dyYanlis: detay(dy, KEY.dy).filter((x) => x.sonuc === 'YANLIS').length,
  testDogru: detay(t, KEY.t).filter((x) => x.sonuc === 'DOGRU').length, testYanlis: detay(t, KEY.t).filter((x) => x.sonuc === 'YANLIS').length,
  dyDetay: detay(dy, KEY.dy), testDetay: detay(t, KEY.t)
});
const KOD = '74162305-VIZE-15-10-0';
const OLAYLAR = [
  { tur: 'SINAV_TANIMI', veri: { ad: '74162305 Güvenlik Duvarı — Vize 07.11.2026', dySayisi: 15, testSayisi: 10, klasikSayisi: 0, dyToplamPuan: 60, testToplamPuan: 40 } },
  { tur: 'OKUDU_GUNCELLE', veri: okuma('K1', '250', 'Öğrenci seçilmedi', '250', 'YDDYDDYDDYDDDYY', 'EACCACBBBA', 48) },
  { tur: 'OKUDU_GUNCELLE', veri: okuma('K1', '247419052', 'ÜLKÜ EKİNCİ', '250', 'YDDYDDYDDYDDDYY', 'EACCACBBBA', 48) },
  { tur: 'OKUDU_GUNCELLE', veri: okuma('K2', '247419036', 'RÜMEYSA DAĞLI', '036', 'YDDYDDYDDYDDDYY', 'EACCACBBBA', 48) },
  { tur: 'OKUDU_GUNCELLE', veri: okuma('K3', '247419032', 'SAMET AZIKÇI', '032', 'YDYDDYYDDDYYDDD', 'CDEDACBEBA', 100) },
  { tur: 'OKUDU_GUNCELLE', veri: okuma('K4', '247419063', 'ERAY LEK', '063', 'DYYDDYDDDDYDDDD', 'CDEEBBBDDD', 60) }
];

(async () => {
  console.log('=== SINAV ARŞİVİ · KOPYA RAPORU · KAYITLAR · ÖĞRENCİ DOSYASI ===');
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
    // Telefonun gönderdiği olaylar (sunucuya)
    let t0 = Date.now() - 600000;
    const gonder = await api('/api/v2/sinav-senkron', { olaylar: OLAYLAR.map((o, i) => ({ eventId: `T-${i}`, sinavKodu: KOD, tur: o.tur, kaynakCihaz: 'mobil', zamanMs: t0 + i * 15000, veri: o.veri })) }, HB);
    kontrol('Telefon olayları sunucuya yazıldı (sınav tanımı dahil)', gonder.kod === 200 && gonder.v.yazilanSayisi === OLAYLAR.length, JSON.stringify(gonder.v).slice(0, 160));

    // Online sınav: zaman izi için iki öğrenci aynı cevapları saniyeler içinde veriyor
    const SORU = Array.from({ length: 6 }, (_, i) => ({ id: `q${i + 1}`, tur: 'test', metin: `Soru ${i + 1}`, siklar: ['a', 'b', 'c', 'd', 'e'], dogruHarf: 'A' }));
    await api('/api/online-sinav-tanimla', { sinav: { sinavId: 'ON-ZAMAN', baslik: 'Online deneme', sureDk: 30, dySayisi: 0, testSayisi: 6, aktif: true, maksIhlal: 0, kisiyeOzel: false, sorular: SORU }, ogrenciler: [{ ogrNo: '247419052', adSoyad: 'ÜLKÜ EKİNCİ' }, { ogrNo: '247419036', adSoyad: 'RÜMEYSA DAĞLI' }] }, HB);
    const o1 = await api('/api/ogrenci-oturum-baslat', { ogrNo: '247419052', adSoyad: 'ÜLKÜ EKİNCİ' });
    const o2 = await api('/api/ogrenci-oturum-baslat', { ogrNo: '247419036', adSoyad: 'RÜMEYSA DAĞLI' });
    for (const s of o1.v.sorular) {
      await api('/api/ogrenci-cevap', { token: o1.v.token, soruId: s.id, secim: 'B' }, { Authorization: `Bearer ${o1.v.token}` });
      await api('/api/ogrenci-cevap', { token: o2.v.token, soruId: s.id, secim: 'B' }, { Authorization: `Bearer ${o2.v.token}` });
    }
    const zaman = await api('/api/online-zaman-analizi', undefined, HB);
    kontrol('Online zaman izi: aynı 6 soruyu saniyeler içinde aynı cevapla işaretleyen çift bulundu', zaman.v.ciftler && zaman.v.ciftler.length === 1 && zaman.v.ciftler[0].yakinAyniCevap === 6, JSON.stringify(zaman.v).slice(0, 200));
    const zamanIzinsiz = await api('/api/online-zaman-analizi');
    kontrol('Zaman analizi yalnız öğretmene açık', zamanIzinsiz.kod === 401);

    // Stüdyo
    const pc = await (await tarayici.createBrowserContext()).newPage();
    await pc.setViewport({ width: 1366, height: 900 });
    pc.on('pageerror', (e) => hatalar.push(e.message));
    pc.on('dialog', async (d) => { await d.accept(); });
    await pc.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await pc.evaluate(() => {
      document.getElementById('hoca-giris-kullanici').value = 'hoca';
      document.getElementById('hoca-giris-sifre').value = 'Demo!Hoca2026';
      document.getElementById('btn-hoca-giris-yap').click();
    });
    await bekle(1500);
    await pc.evaluate(() => { const k = document.getElementById('btn-modal-hoca-kapat'); if (k && document.getElementById('modal-hoca-giris').style.display !== 'none') k.click(); });
    await pc.evaluate(async () => { await window.__masaustuV2SenkronSimdi(); });
    await bekle(500);
    const rozet = await pc.$eval('#rozet-okunan-kagit', (e) => e.textContent);
    kontrol('Kenar çubuğundaki Okuma sayacı telefondan gelen kağıtları da sayar (4)', rozet === '4', rozet);

    // Sınav Arşivi
    await pc.click('.sekme-btn[data-sekme="sekme-arsiv"]');
    await bekle(300);
    const arsiv = await pc.$eval('#arsiv-liste', (e) => e.textContent.replace(/\s+/g, ' '));
    kontrol('Sınav Arşivi telefondan gelen sınavı adıyla, 4 kağıt ve "1 çift" şüpheyle listeler', /Güvenlik Duvarı — Vize/.test(arsiv) && /arşive alınmadı/.test(arsiv) && /1 çift/.test(arsiv), arsiv.slice(0, 300));
    await pc.click('#arsiv-liste [data-arsiv-ac]');
    await bekle(300);
    const detayMetni = await pc.$eval('#arsiv-detay', (e) => e.textContent.replace(/\s+/g, ' '));
    kontrol('Kopya Şüphe Raporu: Ülkü Ekinci ↔ Rümeysa Dağlı, 13 ortak yanlış, YÜKSEK risk', /ÜLKÜ EKİNCİ/.test(detayMetni) && /RÜMEYSA DAĞLI/.test(detayMetni) && /13 ortak yanlış/.test(detayMetni) && /YÜKSEK risk/.test(detayMetni), detayMetni.slice(0, 400));
    const kirmizi = await pc.$$eval('#kopya-ciftleri span.mono', (els) => els.filter((e) => /220,\s*38,\s*38/.test(e.getAttribute('style') || '')).length);
    kontrol('Yan yana cevaplarda ortak yanlış 13 soru kırmızı işaretli', kirmizi === 13, String(kirmizi));
    await pc.evaluate(() => { window.open = () => ({ document: { open() {}, write() {}, close() {} }, focus() {}, print() {} }); });
    await pc.click('#arsiv-detay [data-kopya-tutanak]');
    await bekle(300);
    const tutanak = await pc.evaluate(() => window.__sonKopyaTutanakHTML || '');
    kontrol('Kopya şüphe tutanağı (yazdırılabilir): yöntem açıklaması, cevap tablosu ve imza alanları', /Tutanak Eki/.test(tutanak) && /Ortak yanlış: <strong>13/.test(tutanak) && /Gözetmen \(Ad Soyad \/ İmza\)/.test(tutanak) && /tek başına hüküm değildir/.test(tutanak));
    // Arşive kaydet ve yeniden açınca kalıcı
    await pc.click('#arsiv-liste [data-arsive-kaydet]');
    await bekle(300);
    const arsivSonra = await pc.$eval('#arsiv-liste', (e) => e.textContent.replace(/\s+/g, ' '));
    kontrol('Arşive kaydet: sınav "Telefon (arşivde)" olur', /Telefon \(arşivde\)/.test(arsivSonra), arsivSonra.slice(0, 200));
    const paket = await pc.evaluate(() => { const d = JSON.parse(localStorage.getItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2') || '{}'); return (d.sinavArsivi || []).map((a) => ({ id: a.id, n: (a.okumalar || []).length })); });
    kontrol('Arşiv kaydı kalıcı veri paketine (bulut yedeğine giden) yazıldı', paket.length === 1 && paket[0].n === 4, JSON.stringify(paket));
    await pc.reload({ waitUntil: 'networkidle0' });
    await bekle(1200);
    await pc.evaluate(() => { const k = document.getElementById('btn-modal-hoca-kapat'); if (k && document.getElementById('modal-hoca-giris').style.display !== 'none') k.click(); });
    const kalici = await pc.evaluate(() => { const b = document.querySelector('.sekme-btn[data-sekme="sekme-arsiv"]'); b.click(); return document.getElementById('arsiv-liste').textContent; });
    kontrol('Sayfa yenilense de arşivdeki sınav duruyor', /Telefon \(arşivde\)/.test(kalici));

    // Kayıtlar
    await pc.evaluate(async () => { if (window.__masaustuV2SenkronSimdi) await window.__masaustuV2SenkronSimdi(); });
    await pc.click('.sekme-btn[data-sekme="sekme-kayitlar"]');
    await bekle(800);
    await pc.select('#kayitlar-tur', 'Elle atama');
    await bekle(200);
    const atama = await pc.$eval('#kayitlar-liste', (e) => e.textContent.replace(/\s+/g, ' '));
    kontrol('Kayıtlar: elle atama görünür ("250 kodlu kağıt 247419052 numaralı öğrenciye atandı")', /Elle atama/.test(atama) && /250 kodlu kağıt öğretmen tarafından 247419052/.test(atama), atama.slice(0, 300));
    await pc.select('#kayitlar-tur', '');
    await pc.$eval('#kayitlar-ara', (e) => { e.value = 'RÜMEYSA'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await bekle(200);
    const arama = await pc.$$eval('#kayitlar-liste tbody tr', (trs) => trs.map((t) => t.textContent));
    kontrol('Kayıtlar: öğrenci adına göre süzme çalışır', arama.length >= 1 && arama.every((t) => /RÜMEYSA/.test(t)), JSON.stringify(arama).slice(0, 200));

    // Öğrenci Dosyası
    await pc.click('.sekme-btn[data-sekme="sekme-ogrenci-dosyasi"]');
    await bekle(800);
    await pc.$eval('#ogr-dosya-ara', (e) => { e.value = '247419052'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await bekle(300);
    const dosya = await pc.$eval('#ogr-dosya-sonuc', (e) => e.textContent.replace(/\s+/g, ' '));
    kontrol('Öğrenci Dosyası (numarayla): sınavı, puanı ve kodlanan numarası görünür', /247419052/.test(dosya) && /Güvenlik Duvarı — Vize/.test(dosya) && /250/.test(dosya) && /48/.test(dosya), dosya.slice(0, 300));
    kontrol('Öğrenci Dosyası: ortak yanlış şüphesi (Rümeysa Dağlı, 13 ortak yanlış) ve online zaman izi şüphesi', /13 ortak yanlış/.test(dosya) && /RÜMEYSA DAĞLI/.test(dosya) && /Zaman izi/.test(dosya), dosya.slice(0, 600));
    kontrol('Öğrenci Dosyası: elle atama (numara düzeltmesi) görünür', /kağıtta 250 kodlu kağıt 247419052 numarasına atandı/.test(dosya));
    const temiz = await pc.evaluate(() => { const g = document.getElementById('ogr-dosya-ara'); g.value = '247419032'; g.dispatchEvent(new Event('input', { bubbles: true })); return document.getElementById('ogr-dosya-sonuc').textContent; });
    kontrol('Şüphesi olmayan öğrencide "şüphe yok" yazar', /şüphe yok/.test(temiz) && /100/.test(temiz));
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
