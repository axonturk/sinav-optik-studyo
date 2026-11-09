/* Online sınav listesi testi: ▶️/⏸️ düğmesi duruma göre değişir, form düğmeleri duruma uyar, silme çalışır
   (son sınav dahil, onaylı), yeniden açılışta silinen sınav geri gelmez. Çalıştırma: node online-liste-test.js */
'use strict';
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { baslatSunucu } = require('./server.js');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
let gecen = 0;
let hata = 0;
const kontrol = (ad, kosul, detay = '') => { if (kosul) gecen++; else hata++; if (!kosul || process.env.AYRINTI) console.log(`  ${kosul ? '✓' : '✗ HATA'} ${ad}${detay ? ` — ${detay}` : ''}`); };
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const tikla = async (sayfa, sec) => { await sayfa.$eval(sec, (e) => e.scrollIntoView({ block: 'center' })); await bekle(150); await sayfa.click(sec); };

(async () => {
  console.log('=== ONLİNE SINAV LİSTESİ TESTİ ===');
  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const sayfa = await tarayici.newPage();
  const hatalar = [];
  let onayCevabi = true;
  sayfa.on('pageerror', (e) => hatalar.push(e.message));
  sayfa.on('dialog', async (d) => { if (d.type() === 'confirm') { if (onayCevabi) await d.accept(); else await d.dismiss(); } else { hatalar.push('dialog: ' + d.message()); await d.dismiss(); } });
  const hocaGirisAc = async () => {
    await sayfa.evaluate(() => { const b = document.getElementById('btn-hoca-giris-yap'); if (b) b.click(); });
    await bekle(300);
    await sayfa.evaluate(() => { const k = document.getElementById('btn-modal-hoca-kapat'); if (k) k.click(); });
    await bekle(150);
  };
  try {
    await sayfa.setViewport({ width: 1400, height: 1000 });
    await sayfa.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await hocaGirisAc();
    await sayfa.evaluate(() => document.querySelector('[data-sekme="sekme-online"]').click());
    await bekle(300);
    const baslangicAdet = await sayfa.$eval('#rozet-tanimli-online-sayisi', (e) => e.textContent.trim());
    if (baslangicAdet === '0 Sınav') {
      await tikla(sayfa, '#btn-online-tanimla-kaydet');
      await bekle(400);
    }
    const satir = () => sayfa.evaluate(() => {
      const b = document.querySelector('[data-online-sec-baslat]');
      const r = document.querySelector('#tablo-tanimli-online-sinavlar .rozet');
      return { btn: b ? b.textContent.trim() : null, durum: r ? r.textContent.trim() : null, sayi: document.getElementById('rozet-tanimli-online-sayisi').textContent.trim(), bas: document.getElementById('btn-online-baslat').disabled, dur: document.getElementById('btn-online-durdur').disabled };
    });
    let d = await satir();
    kontrol('Başlangıç: ▶️ Başlat, Planlandı, "Durdur" kapalı', /Başlat/.test(d.btn) && /Planlandı/.test(d.durum) && d.dur === true && d.bas === false, JSON.stringify(d));
    await tikla(sayfa, '[data-online-sec-baslat]');
    await bekle(500);
    d = await satir();
    kontrol('Aktif edilince düğme ⏸️ Durdur olur, durum Aktif, "Başlat" kapanır', /Durdur/.test(d.btn) && /Aktif/.test(d.durum) && d.bas === true && d.dur === false, JSON.stringify(d));
    await tikla(sayfa, '[data-online-sec-baslat]');
    await bekle(500);
    d = await satir();
    kontrol('Durdurulunca düğme tekrar ▶️ Başlat olur', /Başlat/.test(d.btn) && /Planlandı/.test(d.durum) && d.bas === false && d.dur === true, JSON.stringify(d));

    // Aktifken forma "Durdur" düğmesiyle durdur
    await tikla(sayfa, '#btn-online-baslat');
    await bekle(500);
    d = await satir();
    kontrol('Form "Şimdi Başlat" ile aktif: liste düğmesi ⏸️', /Durdur/.test(d.btn), JSON.stringify(d));
    await tikla(sayfa, '#btn-online-durdur');
    await bekle(500);
    d = await satir();
    kontrol('Form "Durdur" ile pasif: liste düğmesi ▶️', /Başlat/.test(d.btn), JSON.stringify(d));

    // Silme: vazgeç
    onayCevabi = false;
    await tikla(sayfa, '[data-online-sec-sil]');
    await bekle(300);
    d = await satir();
    kontrol('Silmeden vazgeçince sınav durur (silinmez)', d.sayi === '1 Sınav', d.sayi);
    // Silme: onay -> son sınav da silinir
    onayCevabi = true;
    await tikla(sayfa, '[data-online-sec-sil]');
    await bekle(500);
    const bos = await sayfa.evaluate(() => ({ sayi: document.getElementById('rozet-tanimli-online-sayisi').textContent.trim(), metin: document.getElementById('tablo-tanimli-online-sinavlar').textContent.trim(), bilgi: document.getElementById('etiket-online-tanim-bilgi').textContent }));
    kontrol('Onaylanınca tek (son) sınav silinir; liste boş mesajı görünür', bos.sayi === '0 Sınav' && /Tanımlı online sınav yok/.test(bos.metin), JSON.stringify(bos));
    // Yeniden yükle: silinen geri gelmemeli
    await sayfa.reload({ waitUntil: 'networkidle0' });
    await hocaGirisAc();
    await sayfa.evaluate(() => document.querySelector('[data-sekme="sekme-online"]').click());
    await bekle(400);
    const sonra = await sayfa.$eval('#rozet-tanimli-online-sayisi', (e) => e.textContent.trim());
    kontrol('Sayfa yenilenince silinen sınav geri gelmez', sonra === '0 Sınav', sonra);
    // Yeni sınav tanımlanabilir
    await tikla(sayfa, '#btn-online-tanimla-kaydet');
    await bekle(600);
    const yeni = await sayfa.$eval('#rozet-tanimli-online-sayisi', (e) => e.textContent.trim());
    kontrol('Silmeden sonra yeni sınav tanımlanabilir', yeni === '1 Sınav', yeni);
    kontrol('JS hatası yok', hatalar.length === 0, hatalar.join(' | '));
  } finally {
    await tarayici.close();
    server.close();
  }
  console.log(`\n=== ${gecen} KONTROL GEÇTİ · ${hata} HATA ===`);
  process.exit(hata ? 1 : 0);
})().catch((e) => { console.error('TEST ÇÖKTÜ:', e); process.exit(2); });
