/* PWA testi: manifest + ikonlar geçerli mi, servis işçisi kaydoluyor mu, ağ kesilince uygulama açılıyor mu,
   /api/ uçları önbelleğe alınmıyor mu. Çalıştırma: node pwa-test.js */
'use strict';
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { baslatSunucu } = require('./server.js');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
let gecen = 0;
let hata = 0;
const kontrol = (ad, kosul, detay = '') => { if (kosul) gecen++; else hata++; if (!kosul || process.env.AYRINTI) console.log(`  ${kosul ? '✓' : '✗ HATA'} ${ad}${detay ? ` — ${detay}` : ''}`); };
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('=== PWA TESTİ ===');
  const m = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  kontrol('Manifest: ad, kısa ad, start_url, display=standalone', m.name && m.short_name && m.start_url === './optik-mobil.html' && m.display === 'standalone');
  const boyut = (dosya) => { const b = fs.readFileSync(dosya); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };
  for (const ic of m.icons) {
    kontrol(`Manifest ikonu ${ic.src} var ve ${ic.sizes}`, fs.existsSync(ic.src) && boyut(ic.src) === ic.sizes, fs.existsSync(ic.src) ? boyut(ic.src) : 'yok');
  }
  kontrol('Manifest: 192, 512 ve maskable ikon tanımlı', ['192x192', '512x512'].every((s) => m.icons.some((i) => i.sizes === s)) && m.icons.some((i) => i.purpose === 'maskable'));
  const sw = fs.readFileSync('sw.js', 'utf8');
  kontrol('Servis işçisi /api/ uçlarını önbelleğe almaz', /includes\('\/api\/'\)\) return/.test(sw));
  for (const f of ['optik-mobil.html', 'index.html']) {
    const h = fs.readFileSync(f, 'utf8');
    kontrol(`${f}: manifest bağlantısı, theme-color ve servis işçisi kaydı var`, h.includes('rel="manifest"') && h.includes('theme-color') && h.includes("register('sw.js')"));
  }

  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const sayfa = await tarayici.newPage();
  const hatalar = [];
  sayfa.on('pageerror', (e) => hatalar.push(e.message));
  try {
    const manRes = await sayfa.goto(`${taban}/manifest.webmanifest`);
    kontrol('Sunucu manifesti application/manifest+json olarak sunar', /manifest\+json/.test(manRes.headers()['content-type'] || ''), manRes.headers()['content-type']);
    await sayfa.goto(`${taban}/optik-mobil.html`, { waitUntil: 'networkidle0' });
    const kayit = await sayfa.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      return { kapsam: r.scope, aktif: Boolean(r.active) };
    });
    kontrol('Servis işçisi kayıtlı ve aktif', kayit.aktif, kayit.kapsam);
    await bekle(1200);
    const onbellek = await sayfa.evaluate(async () => {
      const k = await caches.keys();
      const c = await caches.open(k[0]);
      const adresler = (await c.keys()).map((r) => new URL(r.url).pathname);
      return adresler;
    });
    const gerekli = ['/optik-mobil.html', '/ortak.css', '/guvenlik-ve-veri.js', '/manifest.webmanifest', '/icon-192.png'];
    kontrol('Uygulama kabuğu önbelleğe alındı', gerekli.every((g) => onbellek.includes(g)), `${onbellek.length} dosya; eksik: ${gerekli.filter((g) => !onbellek.includes(g)).join(',')}`);
    await sayfa.evaluate(() => fetch('/api/ag-adresi').catch(() => null));
    await bekle(300);
    const apiOnbellekte = await sayfa.evaluate(async () => {
      const k = await caches.keys();
      const c = await caches.open(k[0]);
      return (await c.keys()).some((r) => r.url.includes('/api/'));
    });
    kontrol('/api/ yanıtları önbelleğe alınmadı', apiOnbellekte === false);

    // Ağ kesildi: sayfa yeniden yüklenebilmeli
    await sayfa.setOfflineMode(true);
    await sayfa.reload({ waitUntil: 'domcontentloaded' });
    await bekle(800);
    const cevrimdisi = await sayfa.evaluate(() => ({ baslik: document.title, kutu: Boolean(document.getElementById('mobil-sonuc-kart')), sayac: document.getElementById('mobil-alt-sayac') && document.getElementById('mobil-alt-sayac').textContent }));
    kontrol('Ağ kapalıyken uygulama açılıyor (çevrimdışı)', cevrimdisi.kutu === true, JSON.stringify(cevrimdisi));
    await sayfa.setOfflineMode(false);
    kontrol('Sayfada JS hatası yok', hatalar.length === 0, hatalar.join(' | '));
  } finally {
    await tarayici.close();
    server.close();
  }
  console.log(`\n=== ${gecen} KONTROL GEÇTİ · ${hata} HATA ===`);
  process.exit(hata ? 1 : 0);
})().catch((e) => { console.error('TEST ÇÖKTÜ:', e); process.exit(2); });
