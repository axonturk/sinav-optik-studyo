/* Uygulama kabuğunu çevrimdışı çalıştıran servis işçisi (PWA).
   - Statik dosyalar: ağ öncelikli, ağ yoksa önbellek (güncel sürüm her zaman önceliklidir).
   - /api/ uçları ASLA önbelleğe alınmaz (Zero-Trust: sınav/puan verisi sunucudan canlı gelir). */
const SURUM = 'sinav-optik-v13';
const KABUK = [
  './',
  './optik-mobil.html',
  './index.html',
  './ortak.css',
  './icons.svg',
  './guvenlik-ve-veri.js',
  './studyo-uygulama.js',
  './qrcode-generator.js',
  './xlsx.full.min.js',
  './manifest.webmanifest',
  './manifest-studyo.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (olay) => {
  olay.waitUntil(
    caches.open(SURUM)
      .then((onbellek) => Promise.all(KABUK.map((adres) => onbellek.add(adres).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (olay) => {
  olay.waitUntil(
    caches.keys()
      .then((anahtarlar) => Promise.all(anahtarlar.filter((a) => a !== SURUM).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (olay) => {
  const istek = olay.request;
  if (istek.method !== 'GET') return;
  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  olay.respondWith(
    fetch(istek, { cache: 'no-cache' })
      .then((yanit) => {
        if (yanit && yanit.ok) {
          const kopya = yanit.clone();
          caches.open(SURUM).then((onbellek) => onbellek.put(istek, kopya)).catch(() => null);
        }
        return yanit;
      })
      .catch(() => caches.match(istek, { ignoreSearch: true }).then((kayit) => kayit || (istek.mode === 'navigate' ? caches.match('./optik-mobil.html') : undefined)))
  );
});
