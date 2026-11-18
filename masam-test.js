/* ==========================================================================
   MASAM TESTİ (Chrome + puppeteer-core)
   - Masam: her dersin son sınavı tek kartta; telefondan gelen sınav "Derse kaydet" ile tek dokunuşta Notlar'a açılır.
   - Telefon/ders sayısı karşılaştırması (✓ / Eşitle); Eşitle yalnız yeni kağıtları ekler.
   - Derse eşleşmeyen telefon sınavı uyarısı + menü rozeti.
   - Ders seçilince o dersin son sınavı açılır; "Notları gör" Değerlendirme'de gizlenir.
   - Okuma sayacı yalnız seçili dersi sayar; Kaydet makbuzu; GR sayısı telefondan gelen "girmedi"yi de sayar.
   Çalıştırma: node masam-test.js
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

(async () => {
  console.log('=== MASAM TESTİ ===');
  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const hatalar = [];
  try {
    const pc = await (await tarayici.createBrowserContext()).newPage();
    await pc.setViewport({ width: 1440, height: 900 });
    pc.on('pageerror', (e) => hatalar.push(e.message));
    pc.on('dialog', async (d) => { await d.accept(); });
    await pc.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await pc.evaluate(() => {
      document.getElementById('hoca-giris-kullanici').value = 'hoca';
      document.getElementById('hoca-giris-sifre').value = 'Demo!Hoca2026';
      document.getElementById('btn-hoca-giris-yap').click();
    });
    await bekle(1600);
    await pc.evaluate(() => { const k = document.getElementById('btn-modal-hoca-kapat'); if (k && document.getElementById('modal-hoca-giris').style.display !== 'none') k.click(); });
    const yeniDers = async (kod, ad) => {
      await pc.evaluate((k, a) => {
        document.getElementById('btn-yeni-ders-modal').click();
        const kk = document.getElementById('yeni-ders-kod'); kk.value = k; kk.dispatchEvent(new Event('input', { bubbles: true }));
        const aa = document.getElementById('yeni-ders-ad'); aa.value = a; aa.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('btn-yeni-ders-kaydet').click();
      }, kod, ad);
      await bekle(400);
    };
    await yeniDers('74112317', 'Kablolama');
    const kablolamaId = await pc.evaluate(() => document.getElementById('aktif-ders-sec').value);

    const api = async (yol, govde, baslik = {}) => {
      const r = await fetch(taban + yol, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, baslik), body: JSON.stringify(govde) });
      return { kod: r.status, v: await r.json().catch(() => ({})) };
    };
    const hoca = await api('/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
    const HB = { Authorization: `Bearer ${hoca.v.token}` };
    const det = (c) => c.split('').map((v) => ({ verilen: v, sonuc: 'DOGRU' }));
    const ok = (id, ogrNo, ad, kod) => ({ id, ogrNo, adSoyad: ad, okunanNoKod: kod, grup: 'A', toplamPuan: 80, dyDetay: det('DDDYD'), testDetay: det('ABCDE') });
    let sira = 0;
    const gonder = async (kod, tur, veri) => api('/api/v2/sinav-senkron', { olaylar: [{ eventId: `MS-${sira++}`, sinavKodu: kod, tur, kaynakCihaz: 'mobil', zamanMs: Date.now() + sira, veri }] }, HB);
    const senkron = async () => { await pc.evaluate(async () => { await window.__masaustuV2SenkronSimdi(); }); await bekle(400); };
    const masamAc = async () => { await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-masam"]').click()); await bekle(250); };
    const kart = (dersId) => pc.evaluate((id) => {
      const k = document.querySelector(`#masam-kartlar [data-masam-ders="${id}"]`);
      if (!k) return null;
      const esit = k.querySelector('[data-masam-esit]');
      return { metin: k.textContent.replace(/\s+/g, ' ').trim(), esit: esit ? esit.getAttribute('data-masam-esit') : '', telKaydet: Boolean(k.querySelector('[data-masam-telkaydet]')), esitle: Boolean(k.querySelector('[data-masam-esitle]')), sinavSatir: ((k.querySelector('[data-masam-sinav]') || {}).textContent || '').split(' · ')[0], dugme: k.querySelectorAll('button').length };
    }, dersId);

    const KOD = '74112317-VIZE-2026';
    await gonder(KOD, 'SINAV_TANIMI', { ad: '74112317 — Kablolama', dySayisi: 5, testSayisi: 5 });
    await gonder(KOD, 'OKUDU_GUNCELLE', ok('K1', '247419001', 'AYŞE YILMAZ', '01'));
    await gonder('ZZQUIZ-1', 'SINAV_TANIMI', { ad: 'Bilinmeyen Quiz', dySayisi: 5, testSayisi: 5 });
    await gonder('ZZQUIZ-1', 'OKUDU_GUNCELLE', ok('Z1', '247419050', 'ALİ VELİ', '50'));
    await senkron();

    await masamAc();
    const uyari = await pc.evaluate(() => { const u = document.getElementById('masam-uyari'); return { gorunur: !u.hidden, metin: u.textContent.replace(/\s+/g, ' ') }; });
    const rozet = await pc.evaluate(() => { const r = document.getElementById('rozet-masam-uyari'); return { gorunur: !r.hidden, sayi: r.textContent }; });
    kontrol('Derse eşleşmeyen telefon sınavı Masam\'da uyarı olarak görünür; menüde rozet', uyari.gorunur && /1 telefon sınavı hiçbir derse eşleşmedi/.test(uyari.metin) && /Bilinmeyen Quiz/.test(uyari.metin) && rozet.gorunur && rozet.sayi === '1', `${JSON.stringify(uyari)} · ${JSON.stringify(rozet)}`);
    let k1 = await kart(kablolamaId);
    const yapilacak = await pc.evaluate(() => { const y = document.getElementById('masam-yapilacaklar'); return { metin: y.textContent.replace(/\s+/g, ' '), cip: y.querySelectorAll('[data-masam-git]').length, adimGizli: document.getElementById('adim-cubugu').hidden }; });
    const a2 = await pc.evaluate(() => {
      const oku = () => ({ yol: document.getElementById('sayfa-yolu').textContent.replace(/\s+/g, ' '), baslik: document.getElementById('sayfa-baslik-metin').textContent });
      const masam = oku();
      document.querySelector('.sekme-btn[data-sekme="sekme-banka"]').click();
      const banka = oku();
      document.querySelector('.sekme-btn[data-sekme="sekme-ayarlar"]').click();
      const ayar = oku();
      document.querySelector('.sekme-btn[data-sekme="sekme-masam"]').click();
      return { masam, banka, ayar };
    });
    kontrol('A2: her ekranda yol + başlık (Öğretmen › Günlük › Masam · Hazırla › Soru Bankası · Kurum ve ayarlar › Ayarlar)', /Öğretmen\s*Günlük\s*Masam/.test(a2.masam.yol) && a2.masam.baslik === 'Masam' && /Hazırla\s*Soru Bankası/.test(a2.banka.yol) && a2.banka.baslik === 'Soru Bankası' && /Kurum ve ayarlar\s*Ayarlar/.test(a2.ayar.yol), JSON.stringify(a2));
    await bekle(250);
    const a1 = await pc.evaluate(() => {
      const kart = document.querySelector('#masam-kartlar .masam-kart');
      const ser = kart && kart.querySelector('[data-masam-durum]');
      return { serit: ser ? ser.getAttribute('data-masam-durum') : '', ustte: ser ? getComputedStyle(ser).order === '-1' : false, bagla: document.querySelectorAll('#masam-uyari [data-masam-bagla]').length, secenek: document.querySelectorAll('#masam-uyari [data-masam-bagla-ders] option').length, bant: /iş seni bekliyor/.test(document.getElementById('masam-yapilacaklar').textContent) };
    });
    kontrol('A1: kartta renkli durum başlığı (üstte); eşleşmeyen sınav için ders listesi + "Derse bağla"; bantta "N iş seni bekliyor"', a1.serit === 'Telefondan kağıt geldi' && a1.ustte && a1.bagla === 1 && a1.secenek >= 1 && a1.bant, JSON.stringify(a1));
    kontrol('Masam\'da "Bugün yapılacaklar": derse bağlanacak ve kaydedilecek telefon sınavı; Masam\'da adım çubuğu yok', /Bugün yapılacaklar/.test(yapilacak.metin) && /1 telefon sınavı derse bağlanacak/.test(yapilacak.metin) && /1 telefon sınavı derse kaydedilecek/.test(yapilacak.metin) && yapilacak.cip === 2 && yapilacak.adimGizli, JSON.stringify(yapilacak));
    await pc.evaluate(() => document.querySelector('#masam-yapilacaklar [data-masam-git^="kart:"]').click());
    const vurgu = await pc.evaluate(() => Boolean(document.querySelector('#masam-kartlar .kart.masam-vurgu')));
    kontrol('Yapılacak çipine basınca ilgili ders kartı vurgulanır', vurgu);
    kontrol('Kablolama kartı telefondan gelen sınavı "Derse kaydet" ile gösterir', k1 && k1.telKaydet && /telefondan geldi/.test(k1.metin), JSON.stringify(k1));

    // Tek dokunuş: Derse kaydet → Notlar
    await pc.evaluate((kod) => document.querySelector(`#masam-kartlar [data-masam-telkaydet="${kod}"]`).click(), KOD);
    await bekle(500);
    const acik = await pc.evaluate(() => ({
      panel: (document.querySelector('.sekme-panel.aktif') || {}).id,
      notlar: (document.querySelector('#analiz-alt-sekmeler [data-alt="ogrenciler"]') || {}).className || '',
      sinav: document.getElementById('sec-kayitli-sinav-ust').value,
      ctaGizli: document.getElementById('btn-yasam-dongusu-cta').hidden,
      okunan: document.getElementById('ist-ogrenci-sayisi').textContent
    }));
    kontrol('"Derse kaydet" tek dokunuşla Değerlendirme > Notlar\'ı o sınavla açar', acik.panel === 'sekme-analiz' && /aktif/.test(acik.notlar) && acik.sinav === `TEL-${KOD}` && acik.okunan === '1', JSON.stringify(acik));
    kontrol('Değerlendirme açıkken "Notları gör" düğmesi gizli', acik.ctaGizli === true, JSON.stringify(acik));
    const a3 = await pc.evaluate(() => {
      const satirlar = [...document.querySelectorAll('#tablo-ogrenci-notlari tbody tr[data-not-ogr]')];
      const ayse = satirlar.find((t) => t.getAttribute('data-not-ogr') === '247419001');
      const ara = document.getElementById('ara-ogrenci-not');
      ara.value = 'ayşe'; ara.dispatchEvent(new Event('input', { bubbles: true }));
      const aramaSonra = document.querySelectorAll('#tablo-ogrenci-notlari tbody tr[data-not-ogr]').length;
      ara.value = ''; ara.dispatchEvent(new Event('input', { bubbles: true }));
      return { sayi: satirlar.length, ayse: ayse ? [...ayse.children].map((td) => td.textContent.trim()).join(' ') : '', aramaSonra, gorunur: !document.getElementById('kutu-ogrenci-notlari').hidden && getComputedStyle(document.getElementById('kutu-ogrenci-notlari')).display !== 'none' };
    });
    kontrol('A3: Notlar\'da öğrenci not listesi: okunan öğrenci puan ve harfle (80 · BB); arama süzer', a3.gorunur && a3.sayi >= 1 && /247419001 AYŞE YILMAZ A 10 0 0 80 BB/.test(a3.ayse) && a3.aramaSonra === 1, JSON.stringify(a3));
    await pc.evaluate(() => document.querySelector('#tablo-ogrenci-notlari [data-not-dosya="247419001"]').click());
    await bekle(250);
    const a3dosya = await pc.evaluate(() => ({ panel: (document.querySelector('.sekme-panel.aktif') || {}).id, ara: document.getElementById('ogr-dosya-ara').value }));
    kontrol('A3: isme tıklayınca Öğrenci Dosyası o öğrenciyle açılır', a3dosya.panel === 'sekme-ogrenci-dosyasi' && a3dosya.ara === '247419001', JSON.stringify(a3dosya));
    await pc.evaluate(() => { document.querySelector('.sekme-btn[data-sekme="sekme-analiz"]').click(); document.querySelector('#analiz-alt-sekmeler [data-alt="ogrenciler"]').click(); });
    await bekle(200);
    const adim = await pc.evaluate(() => {
      const n = document.getElementById('adim-cubugu');
      return { gorunur: !n.hidden, sinav: document.getElementById('adim-cubugu-sinav').textContent, tamam: [...n.querySelectorAll('.adim-tamam')].map((b) => b.dataset.adim).join(','), simdi: (n.querySelector('[aria-current="step"]') || {}).dataset ? n.querySelector('[aria-current="step"]').dataset.adim : '' };
    });
    kontrol('Adım çubuğu: Hazırla/Bas/Oku ✓, şimdi "Değerlendir"; açık ders ve sınav türü yazar', adim.gorunur && adim.tamam === 'hazirla,bas,oku' && adim.simdi === 'degerlendir' && /74112317 Kablolama · Vize/.test(adim.sinav), JSON.stringify(adim));
    await pc.evaluate(() => document.querySelector('#adim-cubugu [data-adim="oku"]').click());
    await bekle(150);
    const okuPanel = await pc.evaluate(() => (document.querySelector('.sekme-panel.aktif') || {}).id);
    await pc.evaluate(() => document.querySelector('#adim-cubugu [data-adim="degerlendir"]').click());
    await bekle(150);
    const dgrPanel = await pc.evaluate(() => (document.querySelector('.sekme-panel.aktif') || {}).id);
    kontrol('Adıma basınca ilgili ekran açılır (Oku → Optik Okuma, Değerlendir → Değerlendirme)', okuPanel === 'sekme-omr' && dgrPanel === 'sekme-analiz', `${okuPanel} / ${dgrPanel}`);
    await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-omr"]').click());
    await bekle(200);
    const cta = await pc.evaluate(() => { const b = document.getElementById('btn-yasam-dongusu-cta'); return { gizli: b.hidden, metin: b.textContent.trim() }; });
    kontrol('Başka sayfada düğme "Notları gör" olarak görünür', !cta.gizli && cta.metin === 'Notları gör', JSON.stringify(cta));

    await masamAc();
    k1 = await kart(kablolamaId);
    const serit2 = await pc.evaluate((id) => { const x = document.querySelector(`#masam-kartlar [data-masam-ders="${id}"] [data-masam-durum]`); return x ? x.getAttribute('data-masam-durum') : ''; }, kablolamaId);
    kontrol('A1: okunan kağıdı olan kartın durumu "Notlar hazır"', serit2 === 'Notlar hazır', serit2);
    kontrol('Kart: "1 okundu", kısa "telefonla eşit ✓"; alt satır sınav türünü gösterir, ders adını tekrar etmez; kartta tek düğme', k1 && /1 okundu/.test(k1.metin) && k1.esit === '1' && /telefonla eşit ✓/.test(k1.metin) && k1.sinavSatir === 'Vize' && k1.dugme === 1, JSON.stringify(k1));

    // Sınav açık DEĞİLKEN telefondan yeni kağıt gelir → kırmızı + Eşitle → yalnız yeni kağıt eklenir
    await pc.evaluate(() => { const s = document.getElementById('sec-kayitli-sinav-ust'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await bekle(300);
    await gonder(KOD, 'OKUDU_GUNCELLE', ok('K2', '247419002', 'MEHMET KAYA', '02'));
    await senkron();
    await masamAc();
    k1 = await kart(kablolamaId);
    const yapE = await pc.evaluate(() => document.getElementById('masam-yapilacaklar').textContent.replace(/\s+/g, ' '));
    kontrol('Yapılacaklarda "1 ders telefonla eşitlenecek" görünür', /1 ders telefonla eşitlenecek/.test(yapE), yapE);
    const serit3 = await pc.evaluate((id) => { const x = document.querySelector(`#masam-kartlar [data-masam-ders="${id}"] [data-masam-durum]`); return x ? x.getAttribute('data-masam-durum') : ''; }, kablolamaId);
    kontrol('A1: telefonda yeni kağıt varken kartın durumu "Telefonla eşit değil"', serit3 === 'Telefonla eşit değil', serit3);
    kontrol('Telefondan yeni kağıt gelince kart sayı farkını gösterir ve "Eşitle" sunar', k1 && k1.esit === '0' && k1.esitle && /Telefondan 2 · Derste 1/.test(k1.metin), JSON.stringify(k1));
    await pc.evaluate(() => document.querySelector('#masam-kartlar [data-masam-esitle]').click());
    await bekle(300);
    k1 = await kart(kablolamaId);
    const makbuzE = await pc.evaluate(() => document.getElementById('rozet-kayit-durumu').textContent);
    kontrol('Eşitle yeni kağıdı derse ekler: "2 okundu", yeniden "telefonla eşit ✓"', k1 && k1.esit === '1' && /2 okundu/.test(k1.metin) && /1 yeni kağıt derse eklendi/.test(makbuzE), `${JSON.stringify(k1)} · ${makbuzE}`);

    // GR: telefondan "girmedi" gelen öğrenci sayılır
    await gonder(KOD, 'YOKLAMA', { sayfa: 1, toplamSayfa: 1, kaynak: 'okuma-bitir', satirlar: [{ ogrNo: '247419099', durum: 'gelmedi', gr: true }] });
    await senkron();
    await masamAc();
    k1 = await kart(kablolamaId);
    kontrol('Kart girmeyenleri sayar (telefondan "girmedi" gelen dahil)', k1 && /1 girmedi/.test(k1.metin), JSON.stringify(k1));
    await pc.evaluate(() => document.querySelector('#masam-kartlar [data-masam-notlar]').click());
    await bekle(400);
    const grKpi = await pc.evaluate(() => document.getElementById('ist-girmeyen-gr').textContent);
    kontrol('Değerlendirme "Girmeyen · GR" telefondan gelen "girmedi"yi de sayar', grKpi === '1', grKpi);

    // Okuma sayacı yalnız seçili dersi sayar
    const sayac = await pc.evaluate(() => { const e = document.getElementById('rozet-okunan-kagit'); return { n: e.textContent, t: e.title }; });
    kontrol('Okuma sayacı yalnız seçili dersin kağıtlarını sayar (eşleşmeyen sınav ayrıca belirtilir)', sayac.n === '2' && /hiçbir derse eşleşmedi/.test(sayac.t), JSON.stringify(sayac));

    // Ders seçilince son sınav açılır
    await yeniDers('74999999', 'Deneme Dersi');
    const yeniAcik = await pc.evaluate(() => document.getElementById('sec-kayitli-sinav-ust').value);
    await pc.evaluate((id) => { const s = document.getElementById('aktif-ders-sec'); s.value = id; s.dispatchEvent(new Event('change', { bubbles: true })); }, kablolamaId);
    await bekle(400);
    const geriAcik = await pc.evaluate(() => {
      const s = document.getElementById('sec-kayitli-sinav-ust');
      const sec = s.options[s.selectedIndex];
      return { deger: s.value, ilk: s.options[0].textContent, secili: sec ? sec.textContent : '', okunan: document.getElementById('ist-ogrenci-sayisi').textContent };
    });
    kontrol('Ders seçilince o dersin son sınavı açılır (taslak değil); sınavı olmayan derste yeni sınav açık', yeniAcik === '' && geriAcik.deger === `TEL-${KOD}`, `${yeniAcik} · ${JSON.stringify(geriAcik)}`);
    kontrol('Sınav seçicinin ilk seçeneği "＋ Yeni sınav (taslak)"; telefon sınavında tarih boş kalmaz', geriAcik.ilk === '＋ Yeni sınav (taslak)' && !/· \)$/.test(geriAcik.secili), JSON.stringify(geriAcik));

    // Ö1: değerlendirme kuralları sınavla saklanır; başka sınava taşınmaz; sayfa yenilense de durur; not çizelgesinde yazar
    const kuralYaz = (deger) => pc.evaluate((v) => { const el = document.getElementById('kural-iptal-soru'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, deger);
    const kuralOku = () => pc.evaluate(() => document.getElementById('kural-iptal-soru').value);
    const sinavSec = (id) => pc.evaluate((v) => { const s = document.getElementById('sec-kayitli-sinav-ust'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, id);
    await kuralYaz('TEST-2');
    await sinavSec('');
    await bekle(300);
    const taslakKural = await kuralOku();
    await sinavSec(`TEL-${KOD}`);
    await bekle(300);
    const geriKural = await kuralOku();
    kontrol('Ö1) İptal kuralı sınavla saklanır: yeni sınava taşınmaz, sınava dönünce geri gelir', taslakKural === '' && geriKural === 'TEST-2', `${taslakKural} / ${geriKural}`);
    const notCsv = await pc.evaluate(async () => {
      try { localStorage.setItem('SINAV_INDIR_BICIM_V1', 'csv'); } catch (_) {}
      let blob = null;
      const eskiClick = HTMLAnchorElement.prototype.click; const eskiUrl = URL.createObjectURL;
      URL.createObjectURL = (b) => { blob = b; return 'blob:test'; };
      HTMLAnchorElement.prototype.click = function () {};
      document.getElementById('btn-csv-indir').click();
      document.getElementById('indir-bicim-csv').click();
      HTMLAnchorElement.prototype.click = eskiClick; URL.createObjectURL = eskiUrl;
      return blob ? (await blob.text()).slice(0, 400) : '';
    });
    kontrol('Ö1) Not çizelgesinde uygulanan kurallar yazar', /"Uygulanan kurallar";"İptal: TEST-2"/.test(notCsv), notCsv.slice(0, 200));

    // Kaydet makbuzu
    await pc.evaluate(() => document.getElementById('btn-genel-kaydet-uygula').click());
    let makbuz = '';
    for (let i = 0; i < 40; i++) {
      await bekle(250);
      makbuz = await pc.evaluate(() => document.getElementById('rozet-kayit-durumu').textContent);
      if (/Kaydedildi:/.test(makbuz)) break;
    }
    kontrol('Kaydet makbuzu: ders · sınav · kağıt sayısı · bulut yedeği', /Kaydedildi: 74112317 · 74112317 — Kablolama · 2 kağıt · buluta yedeklendi ✓/.test(makbuz), makbuz);

    // Ö1: sayfa yenilenince kural yerinde
    await pc.reload({ waitUntil: 'networkidle0' });
    await pc.evaluate(() => {
      document.getElementById('hoca-giris-kullanici').value = 'hoca';
      document.getElementById('hoca-giris-sifre').value = 'Demo!Hoca2026';
      document.getElementById('btn-hoca-giris-yap').click();
    });
    await bekle(1600);
    await pc.evaluate(() => { const k = document.getElementById('btn-modal-hoca-kapat'); if (k && document.getElementById('modal-hoca-giris').style.display !== 'none') k.click(); });
    await pc.evaluate((id) => { const s2 = document.getElementById('aktif-ders-sec'); s2.value = id; s2.dispatchEvent(new Event('change', { bubbles: true })); }, kablolamaId);
    await bekle(400);
    const yenidenKural = await pc.evaluate(() => { document.querySelector('.sekme-btn[data-sekme="sekme-analiz"]').click(); return { sinav: document.getElementById('sec-kayitli-sinav-ust').value, kural: document.getElementById('kural-iptal-soru').value }; });
    kontrol('Ö1) Sayfa yenilenince sınavın kuralı yerinde', yenidenKural.sinav === `TEL-${KOD}` && yenidenKural.kural === 'TEST-2', JSON.stringify(yenidenKural));

    // Paket 3: Baskı Öncesi Kontrol yeni kural maddelerini listeler; uzun şık işareti yalnız ekranda
    await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-stüdyo"]').click());
    await bekle(300);
    await pc.evaluate(() => document.getElementById('btn-ucus-kontrolu-ac').click());
    await bekle(400);
    const ucus = await pc.evaluate(() => Array.from(document.querySelectorAll('#liste-ucus-kontrolleri .ucus-kontrol-satir')).map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
    await pc.evaluate(() => document.getElementById('btn-ucus-kontrolu-kapat').click());
    kontrol('Baskı Öncesi Kontrol: ÖÇ kapsamı, seçili haftalarda yeterli soru, tahmin edilebilir şık, uzun şık maddeleri var',
      ['Her öğrenim çıktısının havuzda sorusu var', 'Seçili haftalarda yeterli soru', 'Doğru şık dizisi tahmin edilemez', 'Uzun şıklı sorular'].every((b) => ucus.some((t) => t.includes(b))), JSON.stringify(ucus.map((t) => t.slice(0, 60))));
    const uzun = await pc.evaluate(() => {
      const sahne = document.getElementById('a4-onizleme-sahne');
      const kap = document.createElement('div');
      kap.innerHTML = '<div class="siklar-iki-sutun" style="display:grid; grid-template-columns:1fr 1fr; width:300px; font-size:10px;"><span class="sik-oge">A) ' + 'çok uzun bir şık metni '.repeat(8) + '</span><span class="sik-oge">B) kısa</span></div>';
      sahne.appendChild(kap);
      window.__onarSatirKaydiranSiklar(kap);
      const el = kap.querySelector('.siklar-uzun-isaret');
      const r = { isaretli: Boolean(el), ekran: el ? getComputedStyle(el).outlineStyle : '' };
      window.__uzunTestKap = kap;
      return r;
    });
    await pc.emulateMediaType('print');
    const baskida = await pc.evaluate(() => { const el = window.__uzunTestKap.querySelector('.siklar-uzun-isaret'); return el ? getComputedStyle(el).outlineStyle : ''; });
    await pc.emulateMediaType('screen');
    await pc.evaluate(() => window.__uzunTestKap.remove());
    kontrol('Uzun şıklı soru önizlemede sarı çerçeveyle işaretlenir; baskıda işaret görünmez', uzun.isaretli && uzun.ekran === 'dashed' && baskida === 'none', `${JSON.stringify(uzun)} · baskı:${baskida}`);

    // Paket 6: öğretmen sonuçları öğrencilere açar (onay sorulur); rapor biçimi sorulur (PDF / Word)
    await pc.evaluate((id) => { const s2 = document.getElementById('aktif-ders-sec'); s2.value = id; s2.dispatchEvent(new Event('change', { bubbles: true })); }, kablolamaId);
    await bekle(300);
    await pc.evaluate(() => { document.querySelector('.sekme-btn[data-sekme="sekme-analiz"]').click(); document.querySelector('#analiz-alt-sekmeler [data-alt="ogrenciler"]').click(); });
    await bekle(200);
    await pc.evaluate(() => document.getElementById('btn-sonuc-yayinla').click());
    let yayinMesaj = '';
    for (let i = 0; i < 20; i++) { await bekle(200); yayinMesaj = await pc.evaluate(() => document.getElementById('sonuc-yayin-mesaj').textContent); if (yayinMesaj) break; }
    kontrol('Öğretmen "Sonuçları öğrencilere aç" ile açık sınavın sonuçlarını açar', /2 öğrencinin sonucu açıldı/.test(yayinMesaj), yayinMesaj);
    await pc.evaluate(() => document.getElementById('btn-itirazlar-yenile').click());
    await bekle(600);
    const itirazMetin = await pc.evaluate(() => document.getElementById('liste-itirazlar').textContent);
    kontrol('İtirazlar listesi açılır (henüz itiraz yok)', /İtiraz yok/.test(itirazMetin), itirazMetin);
    const adimY = await pc.evaluate(() => [...document.querySelectorAll('#adim-cubugu .adim-tamam')].map((b) => b.dataset.adim).join(','));
    kontrol('Sonuçlar açılınca adım çubuğunda "Yayınla ✓"', /yayinla/.test(adimY), adimY);
    // Yeni itiraz Masam'da "Bugün yapılacaklar"a düşer; listeye bakınca kalkar
    const sonKodM = async (ogrNo) => { const r = await fetch(`${taban}/api/ogrenci-hesap/hoca-liste`, { headers: HB }).then((x) => x.json()).catch(() => ({})); const kk = (r.bekleyenKodlar || []).find((x) => x.ogrNo === ogrNo); return kk ? kk.kod : ''; };
    await api('/api/sonuc-yayinla', { sinavId: 'KS-MASAM-IT', sinavAdi: 'Deneme', sonuclar: [{ ogrNo: '2023104015', puan: 50, sorular: [{ no: '1', verilen: 'A', dogru: 'B', durum: 'yanlis' }] }] }, HB);
    const SIFRE_M = 'Ilk.Sifre2026';
    await api('/api/ogrenci-hesap/kayit-baslat', { ogrNo: '2023104015', eposta: 'm@ogrenci.edu.tr', telefon: '05321112233', sifre: SIFRE_M, sifreTekrar: SIFRE_M });
    await api('/api/ogrenci-hesap/kayit-onayla', { ogrNo: '2023104015', kod: await sonKodM('2023104015') });
    const girisM = await api('/api/ogrenci-hesap/giris', { ogrNo: '2023104015', sifre: SIFRE_M });
    const sonM = await api('/api/ogrenci/sonuclarim', { ogrNo: '2023104015', girisToken: girisM.v.girisToken });
    const itzM = await api('/api/ogrenci/itiraz', { ogrNo: '2023104015', girisToken: girisM.v.girisToken, yayinId: ((sonM.v.sonuclar || [])[0] || {}).yayinId, soruNo: '1', aciklama: 'kontrol eder misiniz' });
    await masamAc();
    let yeniIt = '';
    for (let i = 0; i < 15; i++) { await bekle(200); yeniIt = await pc.evaluate(() => document.getElementById('masam-yapilacaklar').textContent.replace(/\s+/g, ' ')); if (/yeni itiraz/.test(yeniIt)) break; }
    kontrol('Öğrenci itiraz edince Masam\'da "1 yeni itiraz" görünür', itzM.kod === 200 && /1 yeni itiraz/.test(yeniIt), `${itzM.kod} ${yeniIt}`);
    const menuRozet = await pc.evaluate(() => { const r = document.querySelector('.sekme-btn[data-sekme="sekme-analiz"] .itiraz-rozet'); return r ? { gizli: r.hidden, sayi: r.textContent } : null; });
    kontrol('A3: Değerlendirme menüsünde yeni itiraz rozeti (1)', menuRozet && !menuRozet.gizli && menuRozet.sayi === '1', JSON.stringify(menuRozet));
    await pc.evaluate(() => document.querySelector('#masam-yapilacaklar [data-masam-git="itiraz"]').click());
    let itzListe = '';
    for (let i = 0; i < 15; i++) { await bekle(200); itzListe = await pc.evaluate(() => document.getElementById('liste-itirazlar').textContent); if (/kontrol eder misiniz/.test(itzListe)) break; }
    await masamAc();
    await bekle(400);
    const sonraIt = await pc.evaluate(() => document.getElementById('masam-yapilacaklar').textContent);
    kontrol('"Yeni itiraz"a basınca itiraz listesi açılır; bakıldıktan sonra Masam\'dan kalkar', /kontrol eder misiniz/.test(itzListe) && !/yeni itiraz/.test(sonraIt), `${itzListe.slice(0, 120)} · ${sonraIt}`);
    await pc.evaluate(() => { try { localStorage.removeItem('SINAV_RAPOR_BICIM_V1'); } catch (_) {} document.querySelector('#analiz-alt-sekmeler [data-alt="raporlar"]').click(); });
    const rapor = await pc.evaluate(async () => {
      let ad = ''; let blob = null;
      const eskiClick = HTMLAnchorElement.prototype.click; const eskiUrl = URL.createObjectURL;
      URL.createObjectURL = (b) => { blob = b; return 'blob:test'; };
      HTMLAnchorElement.prototype.click = function () { ad = this.download; };
      document.getElementById('btn-puko-txt-indir').click();
      const pencere = Boolean(document.getElementById('rapor-bicim-pencere'));
      const varsayilanPdf = document.activeElement && document.activeElement.id === 'rapor-bicim-pdf';
      document.getElementById('rapor-bicim-word').click();
      HTMLAnchorElement.prototype.click = eskiClick; URL.createObjectURL = eskiUrl;
      return { pencere, varsayilanPdf, ad, word: blob ? /urn:schemas-microsoft-com:office:word/.test(await blob.text()) : false, makbuz: document.getElementById('rozet-kayit-durumu').textContent };
    });
    kontrol('Rapor indirmede biçim sorulur (PDF varsayılan); Word seçilince .doc iner ve makbuz gösterilir', rapor.pencere && rapor.varsayilanPdf && /_YOKAK_MEDEK_PUKO_Raporu\.doc$/.test(rapor.ad) && rapor.word && /İndirildi: .*\.doc/.test(rapor.makbuz), JSON.stringify(rapor));

    // Kod uyuşmazlığı: sınav adındaki ders kodu dersle tutmazsa kartta uyarı + Düzelt (öğretmen hangi kodun doğru olduğunu seçer)
    const kodDuzeltDene = async (kod, ad, secim) => {
      await gonder(kod, 'SINAV_TANIMI', { ad, dySayisi: 5, testSayisi: 5 });
      await gonder(kod, 'OKUDU_GUNCELLE', ok(`KD-${kod}`, '247419001', 'AYŞE YILMAZ', '01'));
      await senkron();
      await masamAc();
      await pc.evaluate((k) => document.querySelector(`#masam-kartlar [data-masam-telkaydet="${k}"]`).click(), kod);
      await bekle(300);
      await masamAc();
      const once = await kart(kablolamaId);
      await pc.evaluate(() => document.querySelector('#masam-kartlar [data-masam-koddz]').click());
      await bekle(150);
      const pencere = await pc.evaluate(() => ({ var: Boolean(document.getElementById('masam-kod-pencere')), kapali: document.getElementById('masam-kod-uygula').disabled }));
      await pc.evaluate((sc) => { const r = document.getElementById(sc === 'ders' ? 'masam-kod-ders' : 'masam-kod-sinav'); r.click(); document.getElementById('masam-kod-uygula').click(); }, secim);
      await bekle(300);
      const sonra = await kart(kablolamaId);
      const makbuz = await pc.evaluate(() => document.getElementById('rozet-kayit-durumu').textContent);
      return { once, pencere, sonra, makbuz, kapandi: !(await pc.evaluate(() => Boolean(document.getElementById('masam-kod-pencere')))) };
    };
    const kd1 = await kodDuzeltDene('74119999-FINAL-2026', '74119999 — Kablolama', 'ders');
    kontrol('Kod uyuşmazlığı kartta uyarı + Düzelt; seçim yapılmadan Düzelt kapalı', /⚠ sınavda kod 74119999/.test(kd1.once.metin) && kd1.pencere.var && kd1.pencere.kapali, JSON.stringify(kd1).slice(0, 300));
    kontrol('"Dersin kodu doğru" seçilince sınav adı düzelir, uyarı kalkar, makbuz çıkar', kd1.kapandi && !/sınavda kod/.test(kd1.sonra.metin) && /74112317 — Kablolama/.test(kd1.sonra.metin) && /Düzeltildi: Sınavın adı artık 74112317/.test(kd1.makbuz), JSON.stringify(kd1).slice(0, 300));
    const kd2 = await kodDuzeltDene('74118888-BUT-2026', '74118888 — Kablolama', 'sinav');
    kontrol('"Sınavdaki kod doğru" seçilince dersin kodu düzelir, okunan kağıt yerinde', /⚠ sınavda kod 74118888/.test(kd2.once.metin) && !/sınavda kod/.test(kd2.sonra.metin) && /^74118888 — Kablolama/.test(kd2.sonra.metin) && /1 okundu/.test(kd2.sonra.metin) && /Düzeltildi: Dersin kodu artık 74118888/.test(kd2.makbuz), JSON.stringify(kd2).slice(0, 300));
    await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-kayitlar"]').click());
    await bekle(600);
    const kayitMetin = await pc.evaluate(() => document.getElementById('sekme-kayitlar').textContent);
    kontrol('Düzeltmeler Kayıtlar sayfasına yazılır', /Kod uyuşmazlığı düzeltildi: sınav adı 74119999 → 74112317/.test(kayitMetin) && /ders kodu 74112317 → 74118888/.test(kayitMetin), kayitMetin.slice(0, 200));

    // Arşiv: basılmamış, okuması olmayan boş stüdyo kaydı "Sil" ile silinir (onay sorulur)
    await masamAc();
    await pc.evaluate(() => document.getElementById('btn-masam-yeni-sinav').click());
    await bekle(300);
    await pc.evaluate(() => { const a = document.getElementById('antet-sinav-ad'); a.value = 'BOS KAYIT DENEME'; a.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('btn-sinavi-kaydet-snapshot').click(); });
    await bekle(400);
    await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-arsiv"]').click());
    await bekle(400);
    const silOnce = await pc.evaluate(() => { const satir = [...document.querySelectorAll('#arsiv-liste tbody tr')].find((t) => /BOS KAYIT DENEME/.test(t.textContent)); return { var: Boolean(satir), sil: Boolean(satir && satir.querySelector('[data-arsiv-sil]')), telefonSil: [...document.querySelectorAll('#arsiv-liste tbody tr')].filter((t) => !/Stüdyo/.test(t.textContent)).some((t) => t.querySelector('[data-arsiv-sil]')) }; });
    await pc.evaluate(() => { const satir = [...document.querySelectorAll('#arsiv-liste tbody tr')].find((t) => /BOS KAYIT DENEME/.test(t.textContent)); if (satir) satir.querySelector('[data-arsiv-sil]').click(); });
    await bekle(400);
    const silSonra = await pc.evaluate(() => ({ var: [...document.querySelectorAll('#arsiv-liste tbody tr')].some((t) => /BOS KAYIT DENEME/.test(t.textContent)), makbuz: document.getElementById('rozet-kayit-durumu').textContent }));
    kontrol('Arşivde boş stüdyo kaydında "Sil" var (telefon sınavlarında yok); onayla silinir, makbuz çıkar', silOnce.var && silOnce.sil && !silOnce.telefonSil && !silSonra.var && /Silindi: BOS KAYIT DENEME/.test(silSonra.makbuz), `${JSON.stringify(silOnce)} · ${JSON.stringify(silSonra)}`);

    // Anahtarsız kaydedilen telefon sınavı: puanlar sıfırlanmaz; anahtar sonradan gelince tamamlanır (Güvenlik Duvarı hatası)
    const KOD_A = '74118888-ARA-2026'; // Kablolama'nın kodu yukarıdaki "Düzelt" adımında 74118888 oldu
    const okA = (id, ogrNo, ad, kodN, puan) => Object.assign(ok(id, ogrNo, ad, kodN), { toplamPuan: puan });
    await gonder(KOD_A, 'OKUDU_GUNCELLE', okA('A1', '247419001', 'AYŞE YILMAZ', '01', 80));
    await gonder(KOD_A, 'OKUDU_GUNCELLE', okA('A2', '247419002', 'MEHMET KAYA', '02', 60));
    await senkron();
    await masamAc();
    await pc.evaluate((k) => { const b = document.querySelector(`#masam-kartlar [data-masam-telkaydet="${k}"]`); if (b) b.click(); }, KOD_A);
    await bekle(500);
    const anahtarsiz = await pc.evaluate(() => ({ okunan: document.getElementById('ist-ogrenci-sayisi').textContent.trim(), ort: document.getElementById('ist-ortalama').textContent.trim(), makbuz: document.getElementById('bant-telefon-sinavi-metin').textContent, madde: document.querySelectorAll('#tablo-madde-analizi tr').length, bos: /önce Okuma/.test(document.getElementById('tablo-madde-analizi').textContent) }));
    kontrol('Anahtarsız gelen sınav: puanlar sıfırlanmaz (ortalama 70), anahtar kağıtlardan çıkarılır, soru analizi dolar', anahtarsiz.okunan === '2' && anahtarsiz.ort === '70' && !anahtarsiz.bos && /doğru işaretlerden çıkarıldı/.test(anahtarsiz.makbuz), JSON.stringify(anahtarsiz));
    await gonder(KOD_A, 'SINAV_TANIMI', { ad: '74112317 — Kablolama', dySayisi: 5, testSayisi: 5, dyToplamPuan: 50, testToplamPuan: 50, cevapAnahtarlari: { A: { dy: ['D', 'D', 'D', 'Y', 'D'], test: ['A', 'B', 'C', 'D', 'E'] } } });
    await senkron();
    await bekle(300);
    const anahtarli = await pc.evaluate(() => ({ ort: document.getElementById('ist-ortalama').textContent.trim(), makbuz: document.getElementById('bant-telefon-sinavi-metin').textContent }));
    kontrol('Telefondan anahtar gelince derse kayıtlı sınav tamamlanır ve doğru puanlanır (hepsi doğru: 100)', anahtarli.ort === '100' && /cevap anahtarı telefondan geri yüklendi/.test(anahtarli.makbuz), JSON.stringify(anahtarli));

    await masamAc();
    const baglaOnce = await pc.evaluate(() => Boolean(document.querySelector('#masam-uyari [data-masam-bagla="ZZQUIZ-1"]')));
    await pc.evaluate((id) => { const s2 = document.querySelector('#masam-uyari [data-masam-bagla-ders="ZZQUIZ-1"]'); s2.value = id; document.querySelector('#masam-uyari [data-masam-bagla="ZZQUIZ-1"]').click(); }, kablolamaId);
    await bekle(500);
    const baglaSonra = await pc.evaluate(() => ({ panel: (document.querySelector('.sekme-panel.aktif') || {}).id, ders: document.getElementById('aktif-ders-sec').value, sinav: document.getElementById('sec-kayitli-sinav-ust').value }));
    kontrol('A1: eşleşmeyen telefon sınavı seçilen derse "Derse bağla" ile kaydedilir ve notları açılır', baglaOnce && baglaSonra.panel === 'sekme-analiz' && baglaSonra.ders === kablolamaId && /ZZQUIZ-1/.test(baglaSonra.sinav), JSON.stringify(baglaSonra));

    // A4: Soru Bankası İçe aktar / İndir menüleri mevcut düğmeleri çalıştırır; ÖÇ uyarısı sayıyla uyumlu
    await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-banka"]').click());
    await bekle(300);
    const a4 = await pc.evaluate(() => {
      const ice = document.querySelectorAll('#menu-banka-ice-aktar [role="menuitem"]').length;
      const ind = document.querySelectorAll('#menu-banka-indir [role="menuitem"]').length;
      const hedeflerVar = [...document.querySelectorAll('[data-banka-vekil], [data-banka-dosya], [data-banka-odak]')].every((b) => document.getElementById(b.getAttribute('data-banka-vekil') || b.getAttribute('data-banka-dosya') || b.getAttribute('data-banka-odak')));
      const m = document.getElementById('menu-banka-indir');
      m.open = true;
      let ad = '';
      const eskiClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { ad = this.download || ''; };
      m.querySelector('[data-banka-vekil="btn-soru-bankasi-csv-disa-aktar"]').click();
      HTMLAnchorElement.prototype.click = eskiClick;
      const secici = /_Soru_Bankasi_Bologna_OC\.csv$/.test(ad);
      const kapandi = !m.open;
      const u = document.getElementById('banka-oc-uyari');
      return { ice, ind, hedeflerVar, secici, kapandi, ocTutarli: u.hidden ? u.dataset.ocsuz === '0' : new RegExp(`${u.dataset.ocsuz} soruda öğrenim çıktısı`).test(u.textContent) };
    });
    kontrol('A4: Soru Bankası "İçe aktar ▾" (3) / "İndir ▾" (5); her seçenek mevcut düğmeye bağlı; İndir menüsü soru bankası CSV dosyasını indirir, menü kapanır; ÖÇ uyarısı tutarlı', a4.ice === 3 && a4.ind === 5 && a4.hedeflerVar && a4.secici && a4.kapandi && a4.ocTutarli, JSON.stringify(a4));

    // Veri karışması yok: açık sınavdan başka bir sınavın telefon kağıdı açık sınava karışmaz (aynı öğrenci numarası olsa bile)
    const notListesi = () => pc.evaluate(() => {
      document.querySelector('.sekme-btn[data-sekme="sekme-analiz"]').click();
      document.querySelector('#analiz-alt-sekmeler [data-alt="ogrenciler"]').click();
      return { okunan: document.getElementById('ist-ogrenci-sayisi').textContent.trim(), satirlar: [...document.querySelectorAll('#tablo-ogrenci-notlari tbody tr[data-not-ogr]')].map((t) => [...t.children].map((td) => td.textContent.trim()).join(' ')).join(' | '), sinav: document.getElementById('sec-kayitli-sinav-ust').value };
    });
    const telAcikOnce = await notListesi();
    const okY = (id, ogrNo, ad, kodN, puan) => Object.assign(ok(id, ogrNo, ad, kodN), { toplamPuan: puan, testDetay: 'EEEEE'.split('').map((v) => ({ verilen: v, sonuc: 'YANLIS' })) });
    await gonder('YABANCI-SINAV-1', 'SINAV_TANIMI', { ad: '99999999 — Başka Ders', dySayisi: 5, testSayisi: 5 });
    await gonder('YABANCI-SINAV-1', 'OKUDU_GUNCELLE', okY('Y1', '247419050', 'ALİ VELİ', '50', 11));
    await gonder('YABANCI-SINAV-1', 'OKUDU_GUNCELLE', okY('Y2', '247419099', 'YABANCI ÖĞRENCİ', '99', 22));
    await senkron();
    const telAcikSonra = await notListesi();
    await masamAc();
    const yabanciKovada = await pc.evaluate(() => /Başka Ders/.test(document.getElementById('masam-uyari').textContent));
    kontrol('Veri güvenliği: telefon sınavı açıkken başka sınavın kağıtları açık sınava karışmaz (aynı numaralı öğrencinin notu ezilmez), "eşleşmeyen" olarak bekler', telAcikOnce.okunan === telAcikSonra.okunan && telAcikOnce.satirlar === telAcikSonra.satirlar && !/247419099/.test(telAcikSonra.satirlar) && yabanciKovada, `${JSON.stringify(telAcikOnce)} → ${JSON.stringify(telAcikSonra)} · kova:${yabanciKovada}`);
    await pc.evaluate(() => document.getElementById('btn-masam-yeni-sinav').click());
    await bekle(300);
    await pc.evaluate(() => { const a = document.getElementById('antet-sinav-ad'); a.value = 'STUDYO KARISMA DENEME'; a.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('btn-sinavi-kaydet-snapshot').click(); });
    await bekle(400);
    const stOnce = await notListesi();
    await gonder('YABANCI-SINAV-2', 'OKUDU_GUNCELLE', okY('Y3', '247419088', 'BAŞKA ÖĞRENCİ', '88', 33));
    await senkron();
    const stSonra = await notListesi();
    // Telefondaki asıl kayıt silinse de (telefonda sıfırlama) derse kayıtlı sınav arşivde "Derste kayıtlı", kağıt sayısı ve düğmelerle görünür
    await gonder(KOD_A, 'OKUDU_SIL', { id: 'A1' });
    await gonder(KOD_A, 'OKUDU_SIL', { id: 'A2' });
    await senkron();
    await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-arsiv"]').click());
    await bekle(400);
    const arsivSatir = await pc.evaluate((kod) => {
      const satirlar = [...document.querySelectorAll('#arsiv-liste tbody tr')];
      const t = satirlar.find((x) => x.textContent.includes(kod));
      return { var: Boolean(t), metin: t ? [...t.children].map((td) => td.textContent.trim()).join(' | ') : '', ac: Boolean(t && t.querySelector('[data-arsiv-ac]')), dersteAc: Boolean(t && t.querySelector('[data-derse-kaydet]')), aktifSatir: satirlar.some((x) => /açık sınavın okumaları|Açık taslak/.test(x.textContent)) };
    }, KOD_A);
    kontrol('Arşiv: telefon kaydı silinmiş derse kayıtlı sınav "Derste kayıtlı" + 2 kağıt + Aç / Derste aç ile görünür; açık sınav için ayrı yinelenen satır yok', arsivSatir.var && /Derste kayıtlı/.test(arsivSatir.metin) && !/Stüdyo/.test(arsivSatir.metin) && /\| 2 \|/.test(arsivSatir.metin) && arsivSatir.ac && arsivSatir.dersteAc && !arsivSatir.aktifSatir, JSON.stringify(arsivSatir));
    kontrol('Veri güvenliği: stüdyo sınavı açıkken başka sınavın telefon kağıdı açık sınava karışmaz', stOnce.okunan === stSonra.okunan && !/247419088/.test(stSonra.satirlar), `${JSON.stringify(stOnce)} → ${JSON.stringify(stSonra)}`);

    kontrol('Sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
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
