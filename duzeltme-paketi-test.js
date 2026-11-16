/* ==========================================================================
   DÜZELTME PAKETİ TESTİ (Chrome + puppeteer-core)
   16.11.2026 gerçek kağıt testlerinden çıkan düzeltmelerin kalıcı kontrolü.
   D3) Üst bağlam çubuğu hiçbir genişlikte üst üste binmez; ders "Sil" onay ister.
   Çalıştırma: node duzeltme-paketi-test.js
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

async function girisYap(pc) {
  await pc.evaluate(() => {
    document.getElementById('hoca-giris-kullanici').value = 'hoca';
    document.getElementById('hoca-giris-sifre').value = 'Demo!Hoca2026';
    document.getElementById('btn-hoca-giris-yap').click();
  });
  await bekle(1600);
  await pc.evaluate(() => { const k = document.getElementById('btn-modal-hoca-kapat'); if (k && document.getElementById('modal-hoca-giris').style.display !== 'none') k.click(); });
}

(async () => {
  console.log('=== DÜZELTME PAKETİ TESTİ ===');
  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const hatalar = [];
  try {
    const pc = await (await tarayici.createBrowserContext()).newPage();
    await pc.setViewport({ width: 1440, height: 900 });
    pc.on('pageerror', (e) => hatalar.push(e.message));
    let sonDialog = '';
    pc.on('dialog', async (d) => { sonDialog = d.message(); await d.dismiss(); });
    await pc.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await girisYap(pc);

    // ---------------- D3: üst çubuk çakışması ----------------
    // Uzun ders/sınav adı en kötü durumu üretir
    await pc.evaluate(() => {
      const s = document.getElementById('aktif-ders-sec');
      if (s && s.options[0]) s.options[s.selectedIndex >= 0 ? s.selectedIndex : 0].textContent = '74162302 — İLERİ AĞ YÖNETİMİ (2026-2027 GÜZ DÖNEMİ ARA SINAVI UZUN AD)';
      const k = document.getElementById('rozet-kayit-durumu');
      if (k) k.textContent = 'Kaydedildi · 00:35:57';
    });
    const cakisma = async () => pc.evaluate(() => {
      const kutu = document.querySelector('#sabit-kayit-onay-cubuk .sabit-kayit-ic');
      const ogeler = Array.from(kutu.querySelectorAll('.baglam-sol > *, .baglam-sag > *'))
        .filter((e) => !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden');
      const r = ogeler.map((e) => ({ id: e.id || e.className, b: e.getBoundingClientRect() }));
      const ust = [];
      for (let i = 0; i < r.length; i++) {
        for (let j = i + 1; j < r.length; j++) {
          const a = r[i].b; const b = r[j].b;
          const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (x > 1 && y > 1) ust.push(`${r[i].id}×${r[j].id}`);
        }
      }
      const tasan = r.filter((o) => o.b.right > window.innerWidth + 1 || o.b.left < -1).map((o) => o.id);
      return { ust, tasan, n: r.length, yuk: Math.round(kutu.getBoundingClientRect().height) };
    });
    for (const g of [1440, 1280, 1180, 1100, 1024, 960, 900, 820, 768, 600, 390]) {
      await pc.setViewport({ width: g, height: 900 });
      await bekle(250);
      const c = await cakisma();
      kontrol(`D3) ${g}px: üst çubukta hiçbir öğe üst üste binmiyor ve ekrandan taşmıyor`, c.ust.length === 0 && c.tasan.length === 0 && c.n >= 5, JSON.stringify(c));
    }
    await pc.setViewport({ width: 1440, height: 900 });
    await bekle(200);

    // Ders "Sil" onay ister; vazgeçince ders silinmez
    const dersOnce = await pc.evaluate(() => document.getElementById('aktif-ders-sec').options.length);
    sonDialog = '';
    await pc.evaluate(() => document.getElementById('btn-aktif-dersi-sil').click());
    await bekle(300);
    const dersSonra = await pc.evaluate(() => document.getElementById('aktif-ders-sec').options.length);
    kontrol('D3) Ders "Sil" önce onay sorar; vazgeçilince ders silinmez', /silinsin mi/.test(sonDialog) && dersSonra === dersOnce, `${sonDialog.slice(0, 60)} · ${dersOnce}->${dersSonra}`);

    // ---------------- A5: aynı kağıt iki kez sayılmaz; telefonda silinen okuma bilgisayardan da düşer ----------------
    {
      const api = async (yol, govde, baslik = {}) => {
        const r = await fetch(taban + yol, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, baslik), body: JSON.stringify(govde) });
        return { kod: r.status, v: await r.json().catch(() => ({})) };
      };
      const hoca = await api('/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
      const HB = { Authorization: `Bearer ${hoca.v.token}` };
      const det = (c) => c.split('').map((v) => ({ verilen: v, sonuc: 'DOGRU' }));
      const ok = (id, ogrNo, ad, kod, ek = {}) => Object.assign({ id, ogrNo, adSoyad: ad, okunanNoKod: kod, grup: 'A', toplamPuan: 44, dyDetay: det('DDDYD'), testDetay: det('ABCDE') }, ek);
      const KOD = 'A5TEST-VIZE';
      const olaylar = [
        { tur: 'SINAV_TANIMI', veri: { ad: 'A5 deneme sınavı', dySayisi: 5, testSayisi: 5 } },
        { tur: 'OKUDU_GUNCELLE', veri: ok('X1', '18', 'Kodlanan No: 18', '18', { numaraEslesmediMi: true }) },
        { tur: 'OKUDU_GUNCELLE', veri: ok('X2', '247419018', 'MEHMET ALİ DİK', '18') },
        { tur: 'OKUDU_GUNCELLE', veri: Object.assign(ok('X3', '247419008', 'GÜLNAZ ÇALIŞIR', '08'), { testDetay: det('EEEEE') }) },
        { tur: 'OKUDU_SIL', veri: { id: 'X3', ogrNo: '247419008' } }
      ];
      const t0 = Date.now() - 60000;
      const g = await api('/api/v2/sinav-senkron', { olaylar: olaylar.map((o, i) => ({ eventId: `A5-${i}`, sinavKodu: KOD, tur: o.tur, kaynakCihaz: 'mobil', zamanMs: t0 + i * 1000, veri: o.veri })) }, HB);
      kontrol('A5) Telefon olayları (silme dahil) sunucuya yazıldı', g.kod === 200 && g.v.yazilanSayisi === olaylar.length, JSON.stringify(g.v).slice(0, 120));
      await pc.evaluate(async () => { await window.__masaustuV2SenkronSimdi(); });
      await bekle(500);
      const kova = await pc.evaluate((kod) => {
        const t = JSON.parse(localStorage.getItem('SINAV_TELEFON_SINAVLARI_V1') || '{}');
        const k = t[kod] || Object.values(t).find((x) => x && x.okumalar && x.okumalar.X2);
        return k ? Object.keys(k.okumalar) : null;
      }, KOD);
      // Excel çıktısı: dosya adı ve ilk satırlar sınav adı + kodu taşır; görünen ad kağıt koduyla başlar
      {
        await api('/api/v2/sinav-senkron', { olaylar: [{ eventId: 'KOD-1', sinavKodu: '74191113-VIZE-2026', tur: 'SINAV_TANIMI', kaynakCihaz: 'mobil', zamanMs: Date.now(), veri: { ad: '74161101 — Ağ Teknolojilerine Giriş', dySayisi: 5, testSayisi: 5 } }, { eventId: 'KOD-2', sinavKodu: '74191113-VIZE-2026', tur: 'OKUDU_GUNCELLE', kaynakCihaz: 'mobil', zamanMs: Date.now(), veri: ok('K1', '247419002', 'KAMİLE BİÇE', '02') }] }, HB);
        await pc.evaluate(async () => { await window.__masaustuV2SenkronSimdi(); });
        await bekle(400);
        const csv = await pc.evaluate(async () => {
          const sec = document.getElementById('sec-telefon-sinavi');
          sec.value = '74191113-VIZE-2026'; sec.dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof window.__cizTelefonSinavlariPaneli === 'function') window.__cizTelefonSinavlariPaneli();
          let ad = ''; let blob = null;
          const eskiClick = HTMLAnchorElement.prototype.click; const eskiUrl = URL.createObjectURL;
          URL.createObjectURL = (b) => { blob = b; return 'blob:test'; };
          HTMLAnchorElement.prototype.click = function () { ad = this.download; };
          document.getElementById('btn-telefon-sinavi-csv').click();
          HTMLAnchorElement.prototype.click = eskiClick; URL.createObjectURL = eskiUrl;
          const secenek = (Array.from(sec.options).find((o) => o.value === '74191113-VIZE-2026') || {}).textContent || '';
          const uyari = document.getElementById('telefon-sinavlari-kutu').textContent;
          return { ad, metin: blob ? (await blob.text()).slice(0, 200) : '', secenek, uyari: /telefondaki ders kodu/.test(uyari) };
        });
        kontrol('Excel: dosya adı sınav adı + kodu; ilk satırlarda "Sınav" ve "Sınav kodu"; seçicide kağıt kodu; kod farkı uyarısı', /^Ağ_Teknolojilerine_Giriş_74191113-VIZE-2026\.csv$/.test(csv.ad) && /"Sınav";"74191113 — Ağ Teknolojilerine Giriş"/.test(csv.metin) && /"Sınav kodu";"74191113-VIZE-2026"/.test(csv.metin) && /^74191113 — Ağ Teknolojilerine Giriş/.test(csv.secenek) && csv.uyari, JSON.stringify(csv));
      }
      // GR: telefonda "Okumayı bitir" → girmeyen öğrenci arşiv detayında GR satırı olur
      await api('/api/v2/sinav-senkron', { olaylar: [{ eventId: 'A5-GR', sinavKodu: KOD, tur: 'YOKLAMA', kaynakCihaz: 'mobil', zamanMs: Date.now(), veri: { sayfa: 1, toplamSayfa: 1, kaynak: 'okuma-bitir', satirlar: [{ ogrNo: '247419053', durum: 'gelmedi', gr: true }] } }] }, HB);
      await pc.evaluate(async () => { await window.__masaustuV2SenkronSimdi(); });
      await bekle(400);
      await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-arsiv"]').click());
      await bekle(300);
      const grDetay = await pc.evaluate((kod) => {
        const tr = Array.from(document.querySelectorAll('#arsiv-liste tbody tr')).find((t) => t.textContent.includes(kod));
        const ac = tr && tr.querySelector('[data-arsiv-ac]'); if (ac) ac.click();
        const d = document.getElementById('arsiv-detay');
        return d ? d.textContent.replace(/\s+/g, ' ') : '';
      }, KOD);
      kontrol('GR) Telefondan "girmedi" gönderilen öğrenci arşiv detayında GR satırı olarak görünür', /1 girmedi \(GR\)/.test(grDetay) && /247419053/.test(grDetay) && /—GR/.test(grDetay), grDetay.slice(0, 300));
      await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-stüdyo"]').click());
      kontrol('A5) Eşleşmeden gelen eski okuma, aynı kağıt öğrenciye yerleşince düşer; telefonda silinen okuma da düşer (kalan: yalnız X2)', Array.isArray(kova) && kova.length === 1 && kova[0] === 'X2', JSON.stringify(kova));
    }

    // ---------------- B: telefon sınavı "Kaydet" → derse aktarılır, Değerlendirme'de analiz; işaretleyen doğru; elle kağıt ----------------
    {
      const api = async (yol, govde, baslik = {}) => {
        const r = await fetch(taban + yol, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, baslik), body: JSON.stringify(govde) });
        return { kod: r.status, v: await r.json().catch(() => ({})) };
      };
      const hoca = await api('/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
      const HB = { Authorization: `Bearer ${hoca.v.token}` };
      // Ders: 74192323 İleri Ağ Yönetimi + iki öğrenci (gerçek senaryodaki gibi)
      await pc.evaluate(() => document.getElementById('btn-yeni-ders-modal').click());
      await bekle(200);
      await pc.$eval('#yeni-ders-kod', (e) => { e.value = '74192323'; e.dispatchEvent(new Event('input', { bubbles: true })); });
      await pc.$eval('#yeni-ders-ad', (e) => { e.value = 'İleri Ağ Yönetimi'; });
      await pc.evaluate(() => document.getElementById('btn-yeni-ders-kaydet').click());
      await bekle(400);
      await pc.evaluate(() => { const k = document.getElementById('btn-yeni-ders-kapat') || document.querySelector('#modal-yeni-ders [data-kapat]'); if (k) k.click(); });
      const ders = await pc.evaluate(() => {
        const s = document.getElementById('aktif-ders-sec');
        return { id: s.value, ad: s.options[s.selectedIndex].textContent };
      });
      const dersKod = (ders.ad.match(/\b(\d{6,9})\b/) || [])[1] || '';
      const dersAdSade = ders.ad.replace(/^\s*\d{6,9}\s*[-—–]?\s*/, '').split(/\s+[-—–(]\s*/)[0].trim();
      const KEY = { dy: 'DYDYD', t: 'ABCDE' };
      const det = (c, k) => c.split('').map((v, i) => ({ verilen: v, sonuc: v === k[i] ? 'DOGRU' : 'YANLIS' }));
      const ok = (id, no, ad, dy, t) => ({ id, ogrNo: no, adSoyad: ad, okunanNoKod: no.slice(-2), grup: 'A', toplamPuan: 0, dyDetay: det(dy, KEY.dy), testDetay: det(t, KEY.t) });
      const KOD = 'BTEST-VIZE-2026';
      const olaylar = [
        { tur: 'SINAV_TANIMI', veri: { ad: 'B deneme vizesi', dersAd: `${dersKod} - ${dersAdSade}`, dySayisi: 5, testSayisi: 5, klasikSayisi: 0, dyToplamPuan: 50, testToplamPuan: 50, cevapAnahtarlari: { A: { dy: KEY.dy.split(''), test: KEY.t.split('') } } } },
        { tur: 'OKUDU_GUNCELLE', veri: ok('B1', 'B0001', 'Bir Öğrenci', 'DYDYD', 'ABCDE') },
        { tur: 'OKUDU_GUNCELLE', veri: ok('B2', 'B0002', 'İki Öğrenci', 'DYDYY', 'EBCDE') },
        { tur: 'OKUDU_GUNCELLE', veri: ok('B3', 'B0003', 'Üç Öğrenci', 'YYYYY', 'EEEEE') }
      ];
      await api('/api/v2/sinav-senkron', { olaylar: olaylar.map((o, i) => ({ eventId: `B-${i}`, sinavKodu: KOD, tur: o.tur, kaynakCihaz: 'mobil', zamanMs: Date.now() - 30000 + i * 1000, veri: o.veri })) }, HB);
      await pc.evaluate(async () => { await window.__masaustuV2SenkronSimdi(); });
      await bekle(400);
      const oncekiOkuma = await pc.$eval('#ist-ogrenci-sayisi', (e) => e.textContent);
      await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-arsiv"]').click());
      await bekle(300);
      const kaydetDugme = await pc.evaluate((kod) => { const b = document.querySelector(`[data-derse-kaydet="${kod}"]`); return b ? b.textContent.trim() : ''; }, KOD);
      kontrol('B1) Sınav Arşivi\'nde telefon sınavı için "Kaydet" düğmesi var', kaydetDugme === 'Kaydet', kaydetDugme);
      await pc.evaluate((kod) => document.querySelector(`[data-derse-kaydet="${kod}"]`).click(), KOD);
      await bekle(700);
      const b1 = await pc.evaluate(() => ({
        sekme: (document.querySelector('.sekme-panel.aktif') || {}).id,
        okunan: document.getElementById('ist-ogrenci-sayisi').textContent,
        bant: !document.getElementById('bant-telefon-sinavi').hidden,
        sec: document.getElementById('sec-kayitli-sinav-ust').value,
        ders: document.getElementById('aktif-ders-sec').value
      }));
      kontrol('B1/B2) "Kaydet": sınav eşleşen derse kaydedilir, Değerlendirme açılır, 3 kağıt analiz edilir, telefon bandı görünür', b1.sekme === 'sekme-analiz' && b1.okunan === '3' && b1.bant && /^TEL-/.test(b1.sec) && b1.ders === ders.id, JSON.stringify(b1));
      const kovaPuan = () => pc.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2') || '{}');
        const h = d.okumaSonuclariHaritasi || {};
        const k = Object.keys(h).find((x) => /::TEL-BTEST/.test(x));
        return k ? { k, p: h[k].map((o) => [o.ogrNo, o.toplamPuan]) } : null;
      });
      const kp = await kovaPuan();
      const tp = kp ? kp.p.map((x) => x[1]).sort((x, y) => y - x) : [];
      kontrol('B2) Kağıtlar telefon sınavının anahtarıyla puanlanır (100 / 80 / 30) ve dersin kendi okumalarından ayrı kovada saklanır', JSON.stringify(tp) === '[100,80,30]', JSON.stringify(kp));

      // B3) İşaretleyen doğru: TEST-1:* (B0003 E işaretledi → doğru sayılır)
      await pc.evaluate(() => { document.getElementById('kural-cift-sik-dogru').value = 'TEST-1:*'; document.getElementById('btn-yeniden-puanla').click(); });
      await bekle(500);
      const b3 = await kovaPuan();
      const b3m = Object.fromEntries((b3 && b3.p) || []);
      kontrol('B3) "TEST-1:*" ile soruyu işaretleyen herkes doğru sayılır (Üç Öğrenci 30 → 40, İki Öğrenci 80 → 90)', b3m.B0003 === 40 && b3m.B0002 === 90 && b3m.B0001 === 100, JSON.stringify(b3));
      await pc.evaluate(() => { document.getElementById('kural-cift-sik-dogru').value = ''; document.getElementById('btn-yeniden-puanla').click(); });
      await bekle(300);

      // B1) Arşiv listesinde derse kaydedilen sınav TEK satırdır: "Derste kayıtlı · ders", kağıt sayısı ve "Derste aç"
      await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-arsiv"]').click());
      await bekle(300);
      const tekSatir = await pc.evaluate((kod) => {
        const satirlar = Array.from(document.querySelectorAll('#arsiv-liste tbody tr')).filter((tr) => tr.textContent.includes(kod));
        return { n: satirlar.length, metin: satirlar.map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()) };
      }, KOD);
      kontrol('B1) Arşivde derse kaydedilen telefon sınavı tek satır: "Derste kayıtlı", 3 kağıt, "Derste aç"', tekSatir.n === 1 && /Derste kayıtlı/.test(tekSatir.metin[0]) && /Derste aç/.test(tekSatir.metin[0]) && / 3 /.test(` ${tekSatir.metin[0]} `), JSON.stringify(tekSatir));
      // Taslağa dönünce dersin kendi okumaları geri gelir; tekrar seçince telefon sınavı
      await pc.evaluate(() => { const s = document.getElementById('sec-kayitli-sinav-ust'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await bekle(500);
      const taslak = await pc.$eval('#ist-ogrenci-sayisi', (e) => e.textContent);
      kontrol('B2) Taslağa dönünce dersin önceki okumaları geri gelir (telefon kağıtları karışmaz)', taslak === oncekiOkuma, `${oncekiOkuma} -> ${taslak}`);
      await pc.evaluate(() => { const s = document.getElementById('sec-kayitli-sinav-ust'); const o = Array.from(s.options).find((x) => /^TEL-/.test(x.value)); if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } });
      await bekle(500);
      const tekrar = await pc.$eval('#ist-ogrenci-sayisi', (e) => e.textContent);
      kontrol('B2) Telefon sınavı yeniden seçilince 3 kağıt geri gelir', tekrar === '3', tekrar);

      // Arşive kaydet (isteğe bağlı)
      await pc.evaluate(() => document.getElementById('btn-telefon-sinavi-arsive-kaydet').click());
      await bekle(300);
      const arsivBtn = await pc.$eval('#btn-telefon-sinavi-arsive-kaydet', (e) => e.textContent);
      kontrol('B1) Değerlendirme\'deki "Arşive kaydet" sınavı isteğe bağlı arşive alır', /Arşivde/.test(arsivBtn), arsivBtn);

      // B5) Elle kağıt girişi (derse bir öğrenci eklenir)
      await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-ogrenciler"]').click());
      await bekle(200);
      await pc.evaluate(() => { document.getElementById('ogr-ekle-no').value = '247419066'; document.getElementById('ogr-ekle-ad').value = 'ELİF GÜLCE ÖZDEMİR'; document.getElementById('btn-tek-ogrenci-ekle').click(); });
      await bekle(300);
      await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-omr"]').click());
      await bekle(300);
      await pc.evaluate(() => { const d = document.getElementById('detay-elle-kagit'); d.open = true; d.dispatchEvent(new Event('toggle')); });
      await bekle(200);
      const secenekSay = await pc.$$eval('#elle-ogrenci option', (o) => o.length);
      if (secenekSay > 0) {
        await pc.evaluate(() => {
          const s = document.getElementById('elle-ogrenci'); s.selectedIndex = 0;
          document.getElementById('elle-dy').value = 'DYDYD'; document.getElementById('elle-test').value = 'ABCDA';
          document.getElementById('btn-elle-kagit-ekle').click();
        });
        await bekle(400);
      }
      const b5 = await pc.$eval('#etiket-elle-kagit', (e) => e.textContent);
      kontrol('B5) "Kağıdı elle gir": öğrenci seçilip cevaplar yazılınca kağıt anahtarla puanlanıp eklenir (90 puan)', secenekSay > 0 && /90 puan eklendi/.test(b5), `${secenekSay} · ${b5}`);
    }

    // GR) Daha önce gönderilmiş sınav: dersin listesinde kağıdı olmayan öğrenci arşiv detayında ve Excel'de GR
    {
      await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-ogrenciler"]').click());
      await bekle(200);
      await pc.evaluate(() => { document.getElementById('ogr-ekle-no').value = '247419010'; document.getElementById('ogr-ekle-ad').value = 'VEDAT ENES SAVAŞ'; document.getElementById('btn-tek-ogrenci-ekle').click(); });
      await bekle(300);
      await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-arsiv"]').click());
      await bekle(300);
      const det = await pc.evaluate(() => {
        const tr = Array.from(document.querySelectorAll('#arsiv-liste tbody tr')).find((t) => t.textContent.includes('BTEST-VIZE-2026'));
        const ac = tr && tr.querySelector('[data-arsiv-ac]'); if (ac) ac.click();
        const d = document.getElementById('arsiv-detay');
        return d ? d.textContent.replace(/\s+/g, ' ') : '';
      });
      kontrol('GR) Önceden gönderilmiş sınavda dersin listesinde kağıdı olmayan öğrenci (VEDAT ENES SAVAŞ) GR görünür', /girmedi \(GR\)/.test(det) && /247419010VEDAT ENES SAVAŞ—+GR/.test(det.replace(/\s/g, '').replace(/247419010VEDATENESSAVAŞ/, '247419010VEDAT ENES SAVAŞ')), det.slice(0, 400));
    }

    // ---------------- B4: kopya eşiği (popüler yanlışlar sayılmaz) ----------------
    {
      const C = require('./guvenlik-ve-veri.js');
      const KD = 'DDYYDDYDYYYYDDY'; const KT = 'DBEBCAECDA';
      const IM = ['DDYDDDYDYDYDDDY|DCEBCADBDA', 'DDDDDYYDYYYDYDD|DAEBEAACDA', 'DDDDDDDDYDDYYYY|DABCAAABDB', 'DDDYDDYDDDDYDDY|DABBCACCCA', 'DDYDDDYDDDDYDDY|DBEBCAEAEA', 'YDDDYDYYYDDYDYY|DABCAAABDA', 'DD_DYYYYYDDYDYY|DCDBBECBDA', 'DYDDYDYYYDDYYDY|DCACAAABDB', 'DYDDDDDDDDDDDDD|DCBCAAABDB', 'DDYDDYDDYDYYDDY|DBBBCAECDC', 'DYDDYDYYYDDYDYY|DABCAAACDA', 'DDYDDYDDYDYYDDY|DAEBEACEAA', 'DDDDDDDDDDDYDYY|DADBABEBCA', 'YDDDYDYDYDDYDYY|DABCAAABDB'];
      const ok = IM.map((x, i) => { const [dd, tt] = x.split('|'); return { ogrNo: `K${i + 1}`, adSoyad: `K${i + 1}`, grup: 'A', dyDetay: [...dd].map((v, k) => ({ verilen: v === '_' ? '' : v, sonuc: v === '_' ? 'BOS' : (v === KD[k] ? 'DOGRU' : 'YANLIS') })), testDetay: [...tt].map((v, k) => ({ verilen: v, sonuc: v === KT[k] ? 'DOGRU' : 'YANLIS' })) }; });
      const c = C.tespitEtKopyaBenzerlikCiftleri(ok);
      const kume = new Set(['K3', 'K6', 'K8', 'K11', 'K14']);
      kontrol('B4) Gerçek vize (14 kağıt): kopya çifti 26 → ≤ 6; kalanların hepsi ortak cevap kümesinden', c.length > 0 && c.length <= 6 && c.every((x) => kume.has(x.ogrenci1No) && kume.has(x.ogrenci2No)), JSON.stringify(c.map((x) => `${x.ogrenci1No}-${x.ogrenci2No}`)));
    }

    // ---------------- D1: uzun şıklar iki sütunda satır kaydırınca tek sütuna geçer (üst üste binmez) ----------------
    {
      const d1 = await pc.evaluate(() => {
        const kap = document.createElement('div');
        kap.className = 'sorular-govde';
        kap.style.cssText = 'position:absolute; left:0; top:0; width:230px; font-size:9pt; line-height:0.93; background:#fff;';
        const siklar = ['TPID alanı (0x8100)', 'Allowed VLAN listesi', '802.1Q etiketi', 'VTP Transparent kip', 'Trunk bağlantısı'];
        const yap = (sinif) => `<div class="${sinif}">${siklar.map((m, i) => `<div class="sik-oge"><span class="sik-harf">${'ABCDE'[i]})</span><span>${m}</span></div>`).join('')}</div>`;
        kap.innerHTML = yap('siklar-iki-sutun') + '<div style="height:8px"></div>' + `<div class="siklar-iki-sutun"><div class="sik-oge"><span class="sik-harf">A)</span><span>TCP</span></div><div class="sik-oge"><span class="sik-harf">B)</span><span>UDP</span></div></div>`;
        document.body.appendChild(kap);
        window.__onarSatirKaydiranSiklar(kap);
        const [uzun, kisa] = kap.querySelectorAll(':scope > div[class^="siklar"]');
        const r = Array.from(uzun.querySelectorAll('.sik-oge')).map((o) => o.getBoundingClientRect());
        let ust = 0;
        for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
          const x = Math.min(r[i].right, r[j].right) - Math.max(r[i].left, r[j].left);
          const y = Math.min(r[i].bottom, r[j].bottom) - Math.max(r[i].top, r[j].top);
          if (x > 1 && y > 1) ust++;
        }
        const sonuc = { uzun: uzun.className, kisa: kisa.className, ust, lh: getComputedStyle(uzun.querySelector('.sik-oge')).lineHeight };
        kap.remove();
        return sonuc;
      });
      kontrol('D1) Satır kaydıran uzun şıklar tek sütuna geçer, şıklar üst üste binmez; kısa şıklar iki sütunda kalır', d1.uzun === 'siklar-alt-alta' && d1.kisa === 'siklar-iki-sutun' && d1.ust === 0, JSON.stringify(d1));
    }

    // ---------------- C: eğitim-öğretim yılı / dönem ----------------
    {
      const dn = () => pc.evaluate(() => {
        const s = document.getElementById('aktif-donem-sec');
        const ders = document.getElementById('aktif-ders-sec');
        const sinav = document.getElementById('sec-kayitli-sinav-ust');
        return {
          donem: s ? s.value : '', acik: s ? Array.from(s.querySelectorAll(':scope > option')).map((o) => o.value) : [],
          arsiv: s ? Array.from(s.querySelectorAll('optgroup option')).map((o) => o.value) : [],
          dersler: ders ? Array.from(ders.options).map((o) => o.textContent) : [],
          telSinav: sinav ? Array.from(sinav.options).some((o) => /^TEL-/.test(o.value)) : false,
          tutDonem: (document.getElementById('tut-donem') || {}).value || '',
          bant: !document.getElementById('bant-arsiv-donem').hidden
        };
      });
      const c0 = await dn();
      kontrol('C1/C2) Üst çubukta dönem seçici var; açılışta bugünün dönemi (2026-2027 Güz) seçili ve dersler görünür', c0.donem === '2026-2027-GUZ' && c0.dersler.some((t) => /74192323/.test(t)), JSON.stringify(c0));
      kontrol('C2) Belgelerdeki dönem yazısı aktif dönemden gelir', c0.tutDonem === '2026-2027 GÜZ', c0.tutDonem);
      await pc.evaluate(() => { window.__eskiConfirmC = window.confirm; window.confirm = () => true; });
      await pc.evaluate(() => document.querySelector('.sekme-btn[data-sekme="sekme-ayarlar"]').click());
      await bekle(200);
      await pc.evaluate(() => {
        document.getElementById('yeni-donem-yil').value = '2026';
        document.getElementById('yeni-donem-yariyil').value = 'BAHAR';
        document.getElementById('yeni-donem-ders-kopyala').checked = true;
        document.getElementById('btn-yeni-donem-baslat').click();
      });
      await bekle(600);
      const c1 = await dn();
      const mesaj1 = await pc.$eval('#etiket-donem-mesaj', (e) => e.textContent);
      kontrol('C3) "Yeni dönemi başlat": 2026-2027 Bahar aktif olur, dersler taşınır, eski dönemin telefon sınavı yeni dönemde görünmez', c1.donem === '2026-2027-BAHAR' && c1.dersler.some((t) => /74192323/.test(t)) && !c1.telSinav && /başladı/.test(mesaj1), `${JSON.stringify(c1)} · ${mesaj1}`);
      kontrol('C2) Yeni dönemde belgelerdeki dönem yazısı kendiliğinden "2026-2027 BAHAR" olur', c1.tutDonem === '2026-2027 BAHAR', c1.tutDonem);
      await pc.evaluate(() => { const s = document.getElementById('aktif-donem-sec'); s.value = '2026-2027-GUZ'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await bekle(600);
      const c2 = await dn();
      kontrol('C1) Eski döneme dönünce o dönemin dersleri ve telefon sınavı yerinde (hiçbir kayıt silinmedi)', c2.donem === '2026-2027-GUZ' && c2.telSinav, JSON.stringify(c2));
      await pc.evaluate(() => document.getElementById('btn-donem-arsivle').click());
      await bekle(600);
      const c3 = await dn();
      kontrol('C4) "Açık dönemi arşivle": Güz arşive geçer, menüden kalkar ("Arşiv" bölümünde), aktif dönem Bahar olur', c3.donem === '2026-2027-BAHAR' && c3.arsiv.includes('2026-2027-GUZ') && !c3.acik.includes('2026-2027-GUZ'), JSON.stringify(c3));
      await pc.evaluate(() => { const s = document.getElementById('aktif-donem-sec'); s.value = '2026-2027-GUZ'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await bekle(500);
      const c4 = await dn();
      kontrol('C4) Arşiv dönemi açılıp görüntülenebilir; üstte "arşiv dönemi" bandı çıkar', c4.donem === '2026-2027-GUZ' && c4.bant && c4.telSinav, JSON.stringify(c4));
      await pc.evaluate(() => { const s = document.getElementById('aktif-donem-sec'); s.value = '2026-2027-BAHAR'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await bekle(400);
      await pc.evaluate(() => { window.confirm = window.__eskiConfirmC; });
      await pc.reload({ waitUntil: 'networkidle0' });
      await girisYap(pc);
      await bekle(300);
      const c5 = await dn();
      kontrol('C5) Sayfa yenilenince dönemler ve aktif dönem kalıcı', c5.donem === '2026-2027-BAHAR' && c5.arsiv.includes('2026-2027-GUZ'), JSON.stringify(c5));
    }

    // ---------------- Giriş: Enter ile giriş, doğrulanınca pencere kendiliğinden kapanır ----------------
    {
      await pc.evaluate(() => document.getElementById('btn-hoca-kilitle').click());
      await bekle(500);
      await pc.evaluate(() => { const m = document.getElementById('modal-hoca-giris'); if (m && m.style.display === 'none') { const b = document.getElementById('btn-hoca-giris-ac'); if (b) b.click(); } });
      await bekle(300);
      await pc.evaluate(() => { document.getElementById('hoca-giris-kullanici').value = 'hoca'; document.getElementById('hoca-giris-sifre').value = ''; });
      await pc.focus('#hoca-giris-sifre');
      await pc.keyboard.type('Demo!Hoca2026');
      await pc.keyboard.press('Enter');
      await bekle(2200);
      const g = await pc.evaluate(() => ({ acik: document.body.classList.contains('hoca-oturum-acik'), modal: (document.getElementById('modal-hoca-giris') || {}).style ? document.getElementById('modal-hoca-giris').style.display : '' }));
      kontrol('Giriş: şifre kutusunda Enter giriş yapar ve doğrulanınca giriş penceresi kendiliğinden kapanır', g.acik && g.modal === 'none', JSON.stringify(g));
    }

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
