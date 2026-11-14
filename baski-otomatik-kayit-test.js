/* ==========================================================================
   ÇIKTI = KAYIT TESTİ (Chrome + puppeteer-core)
   - Taslaktan çıktı alınınca sınav otomatik kaydedilir; ad: ders · tür · tarih saat.
   - Kayıt, basılan taslağın KENDİ sınav kodu ve gizli anahtarıyla dondurulur (kitapçık karıştırma koda bağlı olduğundan
     yeni kod üretmek B/C/D anahtarını basılı kağıttan farklı yapardı).
   - Aynı içerik tekrar basılınca yeni kayıt açılmaz, basım geçmişine satır eklenir.
   - İçerik değişip yeniden basılınca "Sürüm 2" oluşur; 1. sürüm değişmez.
   - Elle "Sınavı Kaydet" de taslağın kimliğini korur.
   Çalıştırma: node baski-otomatik-kayit-test.js
   ========================================================================== */
'use strict';
process.env.SINAV_OGRENCI_HESAP_ZORUNLU = process.env.SINAV_OGRENCI_HESAP_ZORUNLU || '0';
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

(async () => {
  console.log('=== ÇIKTI = KAYIT TESTİ ===');
  const INDIR = path.resolve('test-artifacts', 'otomatik-kayit-indir');
  fs.mkdirSync(INDIR, { recursive: true });
  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--window-size=1400,1000'] });
  const sayfa = await tarayici.newPage();
  await sayfa.setViewport({ width: 1400, height: 1000 });
  const hatalar = [];
  sayfa.on('pageerror', (e) => hatalar.push(`pageerror: ${e.message}`));
  sayfa.on('dialog', async (d) => { hatalar.push(`dialog: ${d.message()}`); await d.dismiss(); });
  const cdp = await sayfa.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: INDIR });
  await sayfa.evaluateOnNewDocument(() => { window.print = () => {}; });
  const depo = () => sayfa.evaluate(() => JSON.parse(localStorage.getItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2') || '{}'));
  const ciktiAl = async (kapsam, format) => {
    await sayfa.evaluate((k, f) => {
      const ks = document.getElementById('baski-kapsam-sec'); ks.value = k; ks.dispatchEvent(new Event('change', { bubbles: true }));
      const fs2 = document.getElementById('baski-format-sec'); fs2.value = f; fs2.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('btn-secili-baski-calistir').click();
    }, kapsam, format);
    await bekle(2500);
  };
  try {
    await sayfa.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await sayfa.evaluate(() => {
      document.getElementById('hoca-giris-kullanici').value = 'hoca';
      document.getElementById('hoca-giris-sifre').value = 'Demo!Hoca2026';
      document.getElementById('btn-hoca-giris-yap').click();
    });
    await bekle(400);
    await sayfa.evaluate(() => { const k = document.getElementById('btn-modal-hoca-kapat'); if (k) k.click(); });
    await sayfa.evaluate(() => {
      document.getElementById('btn-yeni-ders-modal').click();
      const kod = document.getElementById('yeni-ders-kod'); kod.value = 'GUV305'; kod.dispatchEvent(new Event('input', { bubbles: true }));
      const ad = document.getElementById('yeni-ders-ad'); ad.value = 'Güvenlik Duvarı'; ad.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('btn-yeni-ders-kaydet').click();
    });
    await bekle(400);
    await sayfa.evaluate(() => {
      const t = document.getElementById('tut-sinav-turu');
      const vize = [...t.options].find((o) => /Vize/i.test(o.textContent));
      if (vize) t.value = vize.value;
      t.dispatchEvent(new Event('change', { bubbles: true }));
      const tr = document.getElementById('tut-tarih'); tr.value = '2026-11-07'; tr.dispatchEvent(new Event('input', { bubbles: true }));
      const sa = document.getElementById('tut-saat'); sa.value = '10:00'; sa.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await bekle(300);
    const once = await depo();
    const onceSayi = (once.kayitliSinavlar || []).length;

    // 1) Taslaktan sınıf kağıdı (A+B+C+D) PDF
    await ciktiAl('sinif-tum-gruplar', 'pdf-indir');
    let d = await depo();
    const kayitlar = d.kayitliSinavlar || [];
    const k1 = kayitlar[0] || {};
    const ders = (d.dersler || []).find((x) => x.id === d.aktifDersId) || {};
    kontrol('Taslaktan çıktı alınınca sınav otomatik kaydedildi', kayitlar.length === onceSayi + 1 && k1.otomatikKayit === true, `${onceSayi} -> ${kayitlar.length}`);
    kontrol('Kayıt adı ders, tür, tarih ve saat içerir', /GUV305/.test(k1.ad) && /Vize/.test(k1.ad) && /07\.11\.2026 10:00/.test(k1.ad), k1.ad);
    const taslak = (d.dersTaslakSinavlari || {})[ders.id] || {};
    kontrol('Kayıt taslağın KENDİ gizli anahtarını korur (kağıttaki QR kayıtla çözülür)', Boolean(taslak.sinavGizliAnahtar) && k1.sinavGizliAnahtar === taslak.sinavGizliAnahtar);
    kontrol('Kayıt taslağın sınav kodunu korur (kitapçık sırası basılanla aynı)', /^GUV305-\d+-\d+-\d+$/.test(k1.sinavKodu || ''), k1.sinavKodu);
    kontrol('Hoca taslakta çalışmaya devam eder (ekran ve kilit değişmez)', !d.aktifKayitliSinavId);
    kontrol('Basım geçmişine satır eklendi', Array.isArray(k1.basimGecmisi) && k1.basimGecmisi.length === 1 && k1.basimGecmisi[0].kapsam === 'sinif-tum-gruplar');

    // 2) Aynı içerik ikinci kez basılır (örn. fotokopi yetmedi) -> yeni kayıt yok
    await ciktiAl('sinif-tum-gruplar', 'pdf-indir');
    d = await depo();
    const k1b = (d.kayitliSinavlar || []).find((k) => k.id === k1.id) || {};
    kontrol('Aynı içerik tekrar basılınca yeni kayıt açılmaz, basım geçmişi büyür', (d.kayitliSinavlar || []).length === onceSayi + 1 && (k1b.basimGecmisi || []).length === 2, JSON.stringify((d.kayitliSinavlar || []).map((k) => [k.ad, (k.icerikImzasi || '').slice(0, 8), (k.basimGecmisi || []).length, k.sinavKodu, Object.keys(k.kitapciklar || {}).map((g) => (k.kitapciklar[g].test || []).map((s) => s.id).join(',').slice(0, 30))])));

    // 3) Tutanak / yoklama kayıt açmaz
    await ciktiAl('yoklama', 'pdf-indir');
    d = await depo();
    kontrol('Soru içermeyen çıktı (yoklama) kayıt açmaz', (d.kayitliSinavlar || []).length === onceSayi + 1);

    // 4) İçerik değişir -> Sürüm 2
    await sayfa.evaluate(() => {
      const t = document.getElementById('ayar-test-sayisi');
      t.value = String(Math.max(1, (parseInt(t.value, 10) || 10) - 1));
      t.dispatchEvent(new Event('input', { bubbles: true }));
      t.dispatchEvent(new Event('change', { bubbles: true }));
      const tamamla = document.getElementById('btn-puan-100-tamamla') || document.querySelector('[data-ucus-aksiyon="ucus-aksiyon-100"]');
      if (tamamla) tamamla.click();
    });
    await bekle(600);
    const yapiTamam = await sayfa.evaluate(() => {
      const kutu = document.getElementById('uyari-toplam-100-kutu');
      return !kutu || getComputedStyle(kutu).display === 'none';
    });
    if (!yapiTamam) {
      await sayfa.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /100 Puana/i.test(x.textContent)); if (b) b.click(); });
      await bekle(500);
    }
    await ciktiAl('sinif-aktif', 'pdf-indir');
    d = await depo();
    const k2 = (d.kayitliSinavlar || [])[0] || {};
    const k1c = (d.kayitliSinavlar || []).find((k) => k.id === k1.id) || {};
    kontrol('İçerik değişince yeni sürüm kaydedilir ("Sürüm 2")', (d.kayitliSinavlar || []).length === onceSayi + 2 && /Sürüm 2/.test(k2.ad || '') && k2.surum === 2, k2.ad);
    kontrol('1. sürüm değişmeden kalır', k1c.icerikImzasi === k1.icerikImzasi && JSON.stringify(k1c.cevapAnahtarlari) === JSON.stringify(k1.cevapAnahtarlari));

    // 4b) Öğrenciye özel kağıtlar: kişiye özel anahtarlar da dondurulur; aynı liste tekrar basılınca yeni kayıt açılmaz
    const ogrCsv = path.join(INDIR, 'ogrenciler.csv');
    fs.writeFileSync(ogrCsv, '﻿' + ['Ogrenci_No;Ad_Soyad', '2024101001;Ahmet Yılmaz', '2024101002;Ayşe Kaya', '2024101003;Mehmet Demir'].join('\r\n'), 'utf8');
    await sayfa.evaluate(() => document.querySelector('[data-sekme="sekme-ogrenciler"]').click());
    await (await sayfa.$('#input-ogrenci-csv-yukle')).uploadFile(ogrCsv);
    await bekle(700);
    await sayfa.evaluate(() => document.querySelector('[data-sekme="sekme-stüdyo"]').click());
    await bekle(300);
    const ozelOnce = ((await depo()).kayitliSinavlar || []).length;
    await ciktiAl('ogrenci-tum-sinif', 'word-indir');
    d = await depo();
    const ozel1 = (d.kayitliSinavlar || [])[0] || {};
    kontrol('Öğrenciye özel kağıt basılınca kişiye özel anahtarlarla yeni kayıt açılır', (d.kayitliSinavlar || []).length === ozelOnce + 1 && Object.keys(ozel1.ogrenciyeOzelAnahtarlar || {}).length >= 3, `${ozelOnce} -> ${(d.kayitliSinavlar || []).length}, anahtar ${Object.keys(ozel1.ogrenciyeOzelAnahtarlar || {}).length}`);
    await ciktiAl('ogrenci-tum-sinif', 'word-indir');
    d = await depo();
    kontrol('Aynı öğrenciye özel kağıtlar tekrar basılınca yeni kayıt açılmaz', (d.kayitliSinavlar || []).length === ozelOnce + 1, `${(d.kayitliSinavlar || []).length}`);

    // 5) Elle "Sınavı Kaydet" taslak kimliğini korur
    await sayfa.evaluate(() => document.getElementById('btn-sinavi-kaydet-snapshot').click());
    await bekle(500);
    d = await depo();
    const k3 = (d.kayitliSinavlar || [])[0] || {};
    kontrol('Elle kaydet de taslağın gizli anahtarını korur ("önce bastım sonra kaydettim" güvenli)', k3.sinavGizliAnahtar === taslak.sinavGizliAnahtar && k3.sinavKodu === k2.sinavKodu, `${k3.sinavKodu} / ${k2.sinavKodu}`);

    kontrol('Sayfada JS hatası / uyarı penceresi yok', hatalar.length === 0, hatalar.join(' | '));
  } finally {
    await tarayici.close();
    server.close();
    try { fs.rmSync(INDIR, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\n=== ${gecen} KONTROL GEÇTİ · ${hata} HATA ===`);
  process.exit(hata === 0 ? 0 : 1);
})().catch((e) => { console.error('TEST HATASI:', e); process.exit(1); });
