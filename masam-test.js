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
      return { metin: k.textContent.replace(/\s+/g, ' ').trim(), esit: esit ? esit.getAttribute('data-masam-esit') : '', telKaydet: Boolean(k.querySelector('[data-masam-telkaydet]')), esitle: Boolean(k.querySelector('[data-masam-esitle]')) };
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
    await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-omr"]').click());
    await bekle(200);
    const cta = await pc.evaluate(() => { const b = document.getElementById('btn-yasam-dongusu-cta'); return { gizli: b.hidden, metin: b.textContent.trim() }; });
    kontrol('Başka sayfada düğme "Notları gör" olarak görünür', !cta.gizli && cta.metin === 'Notları gör', JSON.stringify(cta));

    await masamAc();
    k1 = await kart(kablolamaId);
    kontrol('Kart: "1 okundu" ve "Telefondan 1 · Derste 1 ✓"', k1 && /1 okundu/.test(k1.metin) && k1.esit === '1' && /Telefondan 1 · Derste 1 ✓/.test(k1.metin), JSON.stringify(k1));

    // Sınav açık DEĞİLKEN telefondan yeni kağıt gelir → kırmızı + Eşitle → yalnız yeni kağıt eklenir
    await pc.evaluate(() => { const s = document.getElementById('sec-kayitli-sinav-ust'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await bekle(300);
    await gonder(KOD, 'OKUDU_GUNCELLE', ok('K2', '247419002', 'MEHMET KAYA', '02'));
    await senkron();
    await masamAc();
    k1 = await kart(kablolamaId);
    kontrol('Telefondan yeni kağıt gelince kart sayı farkını gösterir ve "Eşitle" sunar', k1 && k1.esit === '0' && k1.esitle && /Telefondan 2 · Derste 1/.test(k1.metin), JSON.stringify(k1));
    await pc.evaluate(() => document.querySelector('#masam-kartlar [data-masam-esitle]').click());
    await bekle(300);
    k1 = await kart(kablolamaId);
    const makbuzE = await pc.evaluate(() => document.getElementById('rozet-kayit-durumu').textContent);
    kontrol('Eşitle yeni kağıdı derse ekler: "2 okundu", "Telefondan 2 · Derste 2 ✓"', k1 && k1.esit === '1' && /2 okundu/.test(k1.metin) && /1 yeni kağıt derse eklendi/.test(makbuzE), `${JSON.stringify(k1)} · ${makbuzE}`);

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
