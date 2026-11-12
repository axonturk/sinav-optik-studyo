/* ==========================================================================
   ÖLÇEK (5.400 SORU), SIFIR GÜVEN, BUG GİDERİMİ VE SAHA UX KABUL TESTİ (11. Paket)
   Çalıştırma: node olcek-ve-guvenlik-test.js
   ========================================================================== */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const puppeteer = require('puppeteer-core');
const Cekirdek = require('./guvenlik-ve-veri.js');
const { baslatSunucu, sunucuDurumu } = require('./server.js');
const workerModulu = require('./worker.js');

const KOK = __dirname;
const INDIRILEN = path.join(KOK, 'test-artifacts', 'olcek-indirilen');
const YEREL_KASA = path.join(KOK, '.yerel-bulut-kasa.json');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find((p) => fs.existsSync(p));

let gecen = 0;
let hataSayisi = 0;
function kontrol(ad, kosul, detay = '') {
  if (kosul) {
    gecen++;
    console.log(`  ✓ [${gecen + hataSayisi}] ${ad}`);
  } else {
    hataSayisi++;
    console.error(`  ✗ HATA [${gecen + hataSayisi}] ${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function httpHamIstek(port, yontem, yol, govde = null, basliklar = {}) {
  return new Promise((resolve, reject) => {
    const veri = govde !== null ? JSON.stringify(govde) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: yol,
        method: yontem,
        headers: Object.assign(
          veri !== null ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(veri) } : {},
          basliklar
        )
      },
      (res) => {
        const parcalar = [];
        res.on('data', (c) => parcalar.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(parcalar).toString('utf8');
          let body = null;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, body, raw });
        });
      }
    );
    req.on('error', reject);
    if (veri !== null) req.write(veri);
    req.end();
  });
}

function olusturSahteWorkerEnv() {
  const kv = new Map();
  return {
    SINAV_KV: {
      async get(k) { return kv.has(k) ? kv.get(k) : null; },
      async put(k, v) { kv.set(k, String(v)); }
    },
    ASSETS: {
      async fetch() {
        return new Response('<!doctype html><title>Asset</title>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    }
  };
}

async function workerIstek(env, yontem, yol, govde = null, basliklar = {}) {
  const req = new Request(`https://sinav-optik-test.workers.dev${yol}`, {
    method: yontem,
    headers: Object.assign({ 'Content-Type': 'application/json' }, basliklar),
    body: govde !== null ? JSON.stringify(govde) : undefined
  });
  const isleyici = workerModulu && workerModulu.default ? workerModulu.default : workerModulu;
  const res = await isleyici.fetch(req, env);
  const raw = await res.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : {}; } catch (_) {}
  return { status: res.status, headers: res.headers, body, raw };
}

function uret5400SoruPaketi(dersId = 'ders-olcek-5400') {
  const sorular = [];
  const harfler = ['A', 'B', 'C', 'D', 'E'];
  const zorluklar = ['Kolay', 'Orta', 'Zor'];
  for (let i = 1; i <= 5400; i++) {
    const hafta = ((i - 1) % 14) + 1;
    const oc = `ÖÇ-${((i - 1) % 5) + 1}`;
    const zorluk = zorluklar[(i - 1) % 3];
    const etiket = i === 5388 ? ' OZEL-HEDEF-5388' : '';
    const mod = (i - 1) % 3;
    if (mod === 0) {
      sorular.push({
        id: `q-olcek-${i}`,
        dersId,
        tur: 'dy',
        zorluk,
        hafta,
        ocKodu: oc,
        kazanim: `${oc}: Ölçek doğrulaması`,
        metin: `Ölçek D/Y Sorusu #${i}${etiket}: TCP üçlü el sıkışma ve veri bütünlüğü ilkesi geçerlidir.`,
        dogruDY: i % 2 === 0 ? 'Y' : 'D'
      });
    } else if (mod === 1) {
      const dogruHarf = harfler[(i - 1) % 5];
      sorular.push({
        id: `q-olcek-${i}`,
        dersId,
        tur: 'test',
        zorluk,
        hafta,
        ocKodu: oc,
        kazanim: `${oc}: Ölçek doğrulaması`,
        metin: `Ölçek Test Sorusu #${i}${etiket}: Hangi protokol katmanı aşağıdakilerden hangisi değildir?`,
        siklar: ['HTTPS', 'TLS 1.3', 'PBKDF2', 'SHA-256', 'AES-GCM'],
        dogruHarf
      });
    } else {
      sorular.push({
        id: `q-olcek-${i}`,
        dersId,
        tur: 'klasik',
        zorluk,
        hafta,
        ocKodu: oc,
        kazanim: `${oc}: Ölçek doğrulaması`,
        metin: `Ölçek Klasik Sorusu #${i}${etiket}: Sıfır güven mimarisini açıklayınız.`,
        rubrik: 'Yetkili sunucu ve imzalı oturum kavramları açıklanmalıdır.',
        cevapSatir: 3
      });
    }
  }
  return {
    dersler: [
      {
        id: dersId,
        kod: 'OLCEK5400',
        ad: 'Ölçek ve Güvenlik Test Dersi',
        fakulte: 'Mühendislik Fakültesi',
        bolum: 'Bilgisayar Mühendisliği',
        sorumlu: 'Dr. Öğr. Üyesi Test Eğitmen',
        ogrenimCiktilari: [
          { kod: 'ÖÇ-1', metin: 'Ağ güvenliği ilkelerini açıklar' },
          { kod: 'ÖÇ-2', metin: 'Kriptografik özetleme uygular' },
          { kod: 'ÖÇ-3', metin: 'Sıfır güven mimarisini kurar' },
          { kod: 'ÖÇ-4', metin: 'Büyük ölçekli veri yapılarını analiz eder' },
          { kod: 'ÖÇ-5', metin: 'Denetim ve raporlama yapar' }
        ]
      }
    ],
    aktifDersId: dersId,
    sorular,
    ogrenciler: [
      { ogrNo: '2026101001', adSoyad: 'Ayşe Demir', bolum: 'Bilgisayar Müh.' },
      { ogrNo: '2026101002', adSoyad: 'Mehmet Yılmaz', bolum: 'Bilgisayar Müh.' },
      { ogrNo: '2026101003', adSoyad: '=CMD|\' /C calc\'!A0', bolum: 'Bilgisayar Müh.' },
      { ogrNo: '2026101004', adSoyad: '+TEHLIKELI-FORMUL', bolum: 'Bilgisayar Müh.' }
    ],
    kayitliSinavlar: []
  };
}

function parcalaRenkRGB(renkStr) {
  const s = String(renkStr || '').trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

function kontrastOrani(r1, r2) {
  const parlaklik = ([r, g, b]) => {
    const f = (k) => { const v = k / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const l1 = parlaklik(parcalaRenkRGB(r1));
  const l2 = parlaklik(parcalaRenkRGB(r2));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

async function indirmeBekle(klasor, oncekiAdet, uzanti, ms = 15000) {
  const bas = Date.now();
  while (Date.now() - bas < ms) {
    const dosyalar = fs.readdirSync(klasor).filter((f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
    if (dosyalar.length > oncekiAdet) {
      const eslesen = dosyalar
        .map((f) => ({ f, t: fs.statSync(path.join(klasor, f)).mtimeMs }))
        .filter((x) => !uzanti || x.f.toLowerCase().endsWith(uzanti))
        .sort((a, b) => b.t - a.t)[0];
      if (eslesen) return path.join(klasor, eslesen.f);
    }
    await bekle(150);
  }
  return null;
}

(async () => {
  console.log('=== ÖLÇEK, SIFIR GÜVEN VE SAHA UX KABUL TESTİ (11. PAKET) ===\n');

  try { if (fs.existsSync(YEREL_KASA)) fs.unlinkSync(YEREL_KASA); } catch (_) {}
  fs.mkdirSync(INDIRILEN, { recursive: true });
  for (const f of fs.readdirSync(INDIRILEN)) fs.unlinkSync(path.join(INDIRILEN, f));

  // ---------------------------------------------------------------------------
  // 1. STATİK PWA, GÜVENLİK BAŞLIKLARI VE PAROLA HASHİNG BİRİM KONTROLLERİ
  // ---------------------------------------------------------------------------
  console.log('1) Statik PWA (sinav-optik-v13), Güvenlik Başlıkları ve PBKDF2 Hashing');
  const swIcerik = fs.readFileSync(path.join(KOK, 'sw.js'), 'utf8');
  kontrol(
    'sw.js sürümü sinav-optik-v13, manifest-studyo.webmanifest önbellekte ve /api/ hariç',
    /SURUM\s*=\s*'sinav-optik-v13'/.test(swIcerik) &&
      swIcerik.includes('./manifest-studyo.webmanifest') &&
      swIcerik.includes('./icons.svg') &&
      /includes\('\/api\/'\)\) return/.test(swIcerik)
  );

  const headersDosya = fs.readFileSync(path.join(KOK, '_headers'), 'utf8');
  kontrol(
    '_headers güvenlik başlıkları eksiksiz (X-Frame-Options: DENY, nosniff, CSP)',
    headersDosya.includes('X-Frame-Options: DENY') &&
      headersDosya.includes('X-Content-Type-Options: nosniff') &&
      headersDosya.includes('Content-Security-Policy:') &&
      headersDosya.includes("frame-ancestors 'none'") &&
      headersDosya.includes("object-src 'none'")
  );

  const assetsIgnore = fs.existsSync(path.join(KOK, '.assetsignore'))
    ? fs.readFileSync(path.join(KOK, '.assetsignore'), 'utf8')
    : '';
  kontrol(
    '.assetsignore test ve yerel kasa dosyalarını Cloudflare Assets dışında tutar',
    assetsIgnore.includes('*-test.js') && assetsIgnore.includes('.yerel-bulut-kasa.json')
  );

  const hashOrnek = Cekirdek.uretSifreHashSync('Deneme!Sifre2026');
  kontrol(
    'PBKDF2-SHA256 parola hash üretimi ve doğrulaması çalışır',
    hashOrnek.startsWith('pbkdf2_sha256$') &&
      Cekirdek.dogrulaSifreHashSync('Deneme!Sifre2026', hashOrnek) === true &&
      Cekirdek.dogrulaSifreHashSync('Yanlis!2026', hashOrnek) === false
  );

  // ---------------------------------------------------------------------------
  // 2. SUNUCU & WORKER SIFIR GÜVEN, GZIP-B64, OMR TOKEN, RATE LIMIT & 409 KONTROLLERİ
  // ---------------------------------------------------------------------------
  console.log('\n2) Sunucu & Worker Sıfır Güven, gzip-b64 (5.400 Soru), Rate Limit ve Klasik=0 Puanlama');
  const server = await baslatSunucu(0);
  const port = server.address().port;
  const taban = `http://127.0.0.1:${port}`;
  let tarayici = null;

  try {
    // Güvenlik başlıkları canlı HTTP kontrolü
    const htmlYanit = await httpHamIstek(port, 'GET', '/index.html');
    const apiYanit = await httpHamIstek(port, 'GET', '/api/ag-adresi');
    const csp = String(htmlYanit.headers['content-security-policy'] || '');
    kontrol(
      'Canlı HTTP güvenlik başlıkları aktif (X-Frame-Options: DENY, nosniff, Referrer-Policy, CSP)',
      htmlYanit.headers['x-frame-options'] === 'DENY' &&
        htmlYanit.headers['x-content-type-options'] === 'nosniff' &&
        htmlYanit.headers['referrer-policy'] === 'no-referrer' &&
        csp.includes("frame-ancestors 'none'") &&
        csp.includes("object-src 'none'") &&
        csp.includes("base-uri 'self'") &&
        apiYanit.headers['x-frame-options'] === 'DENY',
      JSON.stringify({ xfo: htmlYanit.headers['x-frame-options'], xcto: htmlYanit.headers['x-content-type-options'], csp })
    );

    // POST /api/hoca-giris -> token
    const giris1 = await httpHamIstek(port, 'POST', '/api/hoca-giris', {
      kullaniciAdi: 'hoca',
      sifre: 'Demo!Hoca2026'
    });
    const token1 = giris1.body && giris1.body.token;
    kontrol('POST /api/hoca-giris (hoca) 200 OK ve oturum tokenı döndü', giris1.status === 200 && Boolean(token1));

    // /api/hoca-liste plaintext sifre veya sifreHash sızdırmamalı; sunucu belleğinde sifreHash tutulmalı
    const hocaListe = await httpHamIstek(port, 'GET', '/api/hoca-liste', null, { Authorization: `Bearer ${token1}` });
    const listeStr = JSON.stringify(hocaListe.body || {});
    const sunucuHashliMi = Array.isArray(sunucuDurumu.hocaListesi) &&
      sunucuDurumu.hocaListesi.length > 0 &&
      sunucuDurumu.hocaListesi.every((h) => typeof h.sifreHash === 'string' && h.sifreHash.startsWith('pbkdf2_sha256$') && !('sifre' in h));
    kontrol(
      '/api/hoca-liste çıktısında plaintext sifre/sifreHash sızıntısı yok ve sunucuda pbkdf2_sha256 sifreHash tutuluyor',
      hocaListe.status === 200 &&
        !/"sifre"\s*:/.test(listeStr) &&
        !/"sifreHash"\s*:/.test(listeStr) &&
        !listeStr.includes('Demo!Hoca2026') &&
        Array.isArray(hocaListe.body.hocalar) &&
        hocaListe.body.hocalar.length >= 1 &&
        sunucuHashliMi,
      JSON.stringify({ status: hocaListe.status, sunucuHashliMi })
    );

    // /api/omr-eslesme-token (yetkisiz 401 -> yetkili 200, kapsamlı kısa ömürlü token)
    const omrTokenYetkisiz = await httpHamIstek(port, 'POST', '/api/omr-eslesme-token', { oturumKodu: 'TEST1' });
    const omrTokenYetkili = await httpHamIstek(
      port,
      'POST',
      '/api/omr-eslesme-token',
      { oturumKodu: 'TEST-OMR-99', sureDk: 10 },
      { Authorization: `Bearer ${token1}` }
    );
    const omrToken = omrTokenYetkili.body && omrTokenYetkili.body.omrToken;
    const omrKasaRed = await httpHamIstek(port, 'GET', '/api/bulut-kasa', null, { Authorization: `Bearer ${omrToken}` });
    const omrQrIzin = await httpHamIstek(
      port,
      'GET',
      '/api/ogrenci-qr-senkron?oturum=TEST-OMR-99',
      null,
      { Authorization: `Bearer ${omrToken}` }
    );
    kontrol(
      '/api/omr-eslesme-token ana sırrı sızdırmadan kısa ömürlü OMR tokenı üretir ve kapsama kilitlidir',
      omrTokenYetkisiz.status === 401 &&
        omrTokenYetkili.status === 200 &&
        typeof omrToken === 'string' &&
        omrToken.startsWith('OMRT1.') &&
        omrToken !== token1 &&
        omrKasaRed.status === 401 &&
        omrQrIzin.status === 200,
      JSON.stringify({ s1: omrTokenYetkisiz.status, s2: omrTokenYetkili.status, kasa: omrKasaRed.status, qr: omrQrIzin.status })
    );

    // /api/bulut-kasa yedeklerinde plaintext sifre temizliği
    const kasaPlainTest = {
      dersler: [{ id: 'd-tmp', kod: 'TMP101', ad: 'Geçici' }],
      aktifDersId: 'd-tmp',
      sorular: [],
      ogrenciler: [],
      hocaHesap: { kullaniciAdi: 'hoca', sifre: 'ASLA_SAKLAMA_123', adSoyad: 'Test Hoca' },
      hocaListesi: [{ kullaniciAdi: 'hoca', sifre: 'ASLA_SAKLAMA_456', rol: 'yonetici', durum: 'aktif' }]
    };
    const kasaPutPlain = await httpHamIstek(
      port,
      'PUT',
      '/api/bulut-kasa',
      { veri: kasaPlainTest, islemNotu: 'Plaintext temizlik testi' },
      { Authorization: `Bearer ${token1}` }
    );
    const kasaGetPlain = await httpHamIstek(port, 'GET', '/api/bulut-kasa', null, { Authorization: `Bearer ${token1}` });
    const kasaMetin = JSON.stringify(kasaGetPlain.body || {});
    const diskMetin = fs.existsSync(YEREL_KASA) ? fs.readFileSync(YEREL_KASA, 'utf8') : '';
    kontrol(
      '/api/bulut-kasa yedeklerinde ve yerel disk kasasında plaintext sifre bulunmaz',
      kasaPutPlain.status === 200 &&
        kasaGetPlain.status === 200 &&
        !kasaMetin.includes('ASLA_SAKLAMA_123') &&
        !kasaMetin.includes('ASLA_SAKLAMA_456') &&
        !/"sifre"\s*:/.test(kasaMetin) &&
        !diskMetin.includes('ASLA_SAKLAMA_123') &&
        !/"sifre"\s*:/.test(diskMetin)
    );

    // /api/hoca-cikis token iptali
    const cikisYanit = await httpHamIstek(port, 'POST', '/api/hoca-cikis', {}, { Authorization: `Bearer ${token1}` });
    const iptalSonrasiKasa = await httpHamIstek(port, 'GET', '/api/bulut-kasa', null, { Authorization: `Bearer ${token1}` });
    const iptalSonrasiOmr = await httpHamIstek(
      port,
      'GET',
      '/api/ogrenci-qr-senkron?oturum=TEST-OMR-99',
      null,
      { Authorization: `Bearer ${omrToken}` }
    );
    kontrol(
      '/api/hoca-cikis sonrası hoca tokenı ve ilişkili OMR tokenı anında iptal olur (401)',
      cikisYanit.status === 200 && iptalSonrasiKasa.status === 401 && iptalSonrasiOmr.status === 401
    );

    // /api/hoca-sifre-kurtar rate limit (>=8 izinli, sonrasında 429)
    const kurtarDurumlar = [];
    for (let i = 0; i < 10; i++) {
      const r = await httpHamIstek(port, 'POST', '/api/hoca-sifre-kurtar', {
        eposta: 'ornek.hoca@kurum.edu.tr',
        telefon: '05009998877',
        yeniSifre: 'YeniAdmin!2026',
        yeniSifreTekrar: 'YeniAdmin!2026'
      });
      kurtarDurumlar.push({ status: r.status, retryAfter: r.headers['retry-after'] || '' });
    }
    const ilk8Gecis = kurtarDurumlar.slice(0, 8).every((x) => x.status === 403);
    const dokuzuncu429 = kurtarDurumlar[8].status === 429 && Number(kurtarDurumlar[8].retryAfter) > 0;
    kontrol(
      '/api/hoca-sifre-kurtar ilk 8 denemede normal yanıt (403), aşımında 429 + Retry-After döndürür',
      ilk8Gecis && dokuzuncu429,
      JSON.stringify(kurtarDurumlar)
    );

    // Yeniden giriş yap ve Zero-Trust online sınav tanımla (1 DY + 1 Test + 1 Klasik)
    const giris2 = await httpHamIstek(port, 'POST', '/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
    const token2 = giris2.body.token;
    assert.ok(token2, 'İkinci öğretmen girişi token üretmelidir');

    const sinavSorulari = [
      { id: 'zt-dy-1', tur: 'dy', metin: 'TLS bağlantısı şifreli iletişim sağlar.', dogruDY: 'D', ocKodu: 'ÖÇ-1' },
      { id: 'zt-test-1', tur: 'test', metin: 'HTTPS varsayılan portu hangisidir?', siklar: ['80', '443', '22', '21', '53'], dogruHarf: 'B', ocKodu: 'ÖÇ-2' },
      { id: 'zt-kl-1', tur: 'klasik', metin: 'Sıfır güven modelini kısaca açıklayınız.', ocKodu: 'ÖÇ-3' }
    ];
    const sinavTanim = await httpHamIstek(
      port,
      'POST',
      '/api/online-sinav-tanimla',
      {
        sinavId: 'ZT-KLASIK-TEST',
        sinavSurumId: 'SURUM-ZT-1',
        aktif: true,
        sureDk: 30,
        kisiyeOzel: false,
        sorular: sinavSorulari
      },
      { Authorization: `Bearer ${token2}` }
    );
    kontrol('Zero-Trust online sınav (1 D/Y + 1 Test + 1 Klasik) tanımlandı', sinavTanim.status === 200);

    // Öğrenci oturum başlatma + kurtarmaAnahtari ile devam + 409 oturum çalma reddi
    const ot1 = await httpHamIstek(port, 'POST', '/api/ogrenci-oturum-baslat', { ogrNo: '2023104011' });
    const ot1Kurtarma = ot1.body && ot1.body.kurtarmaAnahtari;
    const ot1Devam = await httpHamIstek(port, 'POST', '/api/ogrenci-oturum-baslat', {
      ogrNo: '2023104011',
      kurtarmaAnahtari: ot1Kurtarma
    });
    const ot1CalmaBos = await httpHamIstek(port, 'POST', '/api/ogrenci-oturum-baslat', { ogrNo: '2023104011' });
    const ot1CalmaYanlis = await httpHamIstek(port, 'POST', '/api/ogrenci-oturum-baslat', {
      ogrNo: '2023104011',
      kurtarmaAnahtari: 'SAHTE-KURTARMA-ANAHTARI'
    });
    kontrol(
      '/api/ogrenci-oturum-baslat geçerli kurtarmaAnahtari ile devam eder (200), oturum çalma girişimini 409 ile reddeder',
      ot1.status === 200 &&
        Boolean(ot1Kurtarma) &&
        ot1Devam.status === 200 &&
        ot1Devam.body.mevcutOturumDevam === true &&
        ot1CalmaBos.status === 409 &&
        ot1CalmaYanlis.status === 409 &&
        ot1CalmaYanlis.body.oturumCakismasi === true
    );

    // İstemci puan/kagit enjeksiyon reddi + klasik=0 otomatik puanlama
    const sahteCevapPuan = await httpHamIstek(
      port,
      'POST',
      '/api/ogrenci-cevap',
      { soruId: 'zt-kl-1', secim: 'Deneme cevap', puan: 100 },
      { Authorization: `Bearer ${ot1.body.token}` }
    );
    const sahteBitirKagit = await httpHamIstek(
      port,
      'POST',
      '/api/ogrenci-sinav-bitir',
      { kagit: [], puan: 100 },
      { Authorization: `Bearer ${ot1.body.token}` }
    );
    const klCevap = await httpHamIstek(
      port,
      'POST',
      '/api/ogrenci-cevap',
      { soruId: 'zt-kl-1', secim: 'Sıfır güven modelinde istemciye asla güvenilmez ve her istek doğrulanır.' },
      { Authorization: `Bearer ${ot1.body.token}` }
    );
    const bitir1 = await httpHamIstek(
      port,
      'POST',
      '/api/ogrenci-sinav-bitir',
      {},
      { Authorization: `Bearer ${ot1.body.token}` }
    );
    kontrol(
      'Sunucu istemci puan/kagit alanlarını reddeder (400) ve klasik sorulara 0 otomatik puan verir',
      sahteCevapPuan.status === 400 &&
        sahteBitirKagit.status === 400 &&
        klCevap.status === 200 &&
        bitir1.status === 200 &&
        bitir1.body.klasikOtomatikPuan === 0 &&
        bitir1.body.puan === 0 &&
        bitir1.body.dogruSayisi === 0 &&
        bitir1.body.manuelDegerlendirmeBekliyor === true &&
        Array.isArray(bitir1.body.klasikDetay) &&
        bitir1.body.klasikDetay[0].puan === 0 &&
        bitir1.body.klasikDetay[0].durum === 'MANUEL_BEKLIYOR' &&
        Array.isArray(bitir1.body.dyDetay) &&
        bitir1.body.dyDetay.length === 1 &&
        Array.isArray(bitir1.body.testDetay) &&
        bitir1.body.testDetay.length === 1,
      JSON.stringify(bitir1.body)
    );

    // İkinci öğrenci: DY + Test doğru, Klasik=0 -> puan=67 (2/3)
    const ot2 = await httpHamIstek(port, 'POST', '/api/ogrenci-oturum-baslat', { ogrNo: '2023104042' });
    await httpHamIstek(port, 'POST', '/api/ogrenci-cevap', { soruId: 'zt-dy-1', secim: 'D' }, { Authorization: `Bearer ${ot2.body.token}` });
    await httpHamIstek(port, 'POST', '/api/ogrenci-cevap', { soruId: 'zt-test-1', secim: 'B' }, { Authorization: `Bearer ${ot2.body.token}` });
    await httpHamIstek(port, 'POST', '/api/ogrenci-cevap', { soruId: 'zt-kl-1', secim: 'Detaylı açıklama metni' }, { Authorization: `Bearer ${ot2.body.token}` });
    const bitir2 = await httpHamIstek(port, 'POST', '/api/ogrenci-sinav-bitir', {}, { Authorization: `Bearer ${ot2.body.token}` });
    kontrol(
      'Karma sınavda DY/Test doğru sayılırken klasik yine 0 otomatik puan alır (2/3 -> 67)',
      bitir2.status === 200 &&
        bitir2.body.dyDogru === 1 &&
        bitir2.body.testDogru === 1 &&
        bitir2.body.klasikOtomatikPuan === 0 &&
        bitir2.body.puan === 67
    );

    // Worker.js v2 Parite Kontrolleri (Mock KV + ASSETS)
    const wEnv = olusturSahteWorkerEnv();
    const wAsset = await workerIstek(wEnv, 'GET', '/index.html');
    const wGiris = await workerIstek(wEnv, 'POST', '/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
    const wTok = wGiris.body && wGiris.body.token;
    const wOmr = await workerIstek(wEnv, 'POST', '/api/omr-eslesme-token', { oturumKodu: 'WK1' }, { Authorization: `Bearer ${wTok}` });
    const wCikis = await workerIstek(wEnv, 'POST', '/api/hoca-cikis', {}, { Authorization: `Bearer ${wTok}` });
    const wSonrasi = await workerIstek(wEnv, 'GET', '/api/bulut-kasa', null, { Authorization: `Bearer ${wTok}` });
    kontrol(
      'worker.js güvenlik başlıkları, OMR token ve /api/hoca-cikis token iptal paritesi doğrulandı',
      wAsset.headers.get('x-frame-options') === 'DENY' &&
        wAsset.headers.get('x-content-type-options') === 'nosniff' &&
        wGiris.status === 200 &&
        wOmr.status === 200 &&
        String(wOmr.body.omrToken || '').startsWith('OMRT1.') &&
        wCikis.status === 200 &&
        wSonrasi.status === 401
    );

    // 5.400 Soruyu gzip-b64 ile /api/bulut-kasa'ya kaydet ve geri oku
    const paket5400 = uret5400SoruPaketi('ders-olcek-5400');
    const hamJson = JSON.stringify(paket5400);
    const gzipB64 = zlib.gzipSync(Buffer.from(hamJson, 'utf8')).toString('base64');
    const kasaPutGzip = await httpHamIstek(
      port,
      'PUT',
      '/api/bulut-kasa',
      {
        kodlama: 'gzip-b64',
        veriSikistirilmis: gzipB64,
        bazRevizyonNo: kasaPutPlain.body.revizyonNo,
        zorlaEz: true,
        silmeOnayi: true,
        islemNotu: '5400 Soru Ölçek Yüklemesi'
      },
      { Authorization: `Bearer ${token2}` }
    );
    const kasaGetGzip = await httpHamIstek(
      port,
      'GET',
      '/api/bulut-kasa?kodlama=gzip-b64',
      null,
      { Authorization: `Bearer ${token2}` }
    );
    const cozulenVeri = kasaGetGzip.body && kasaGetGzip.body.veriSikistirilmis
      ? JSON.parse(zlib.gunzipSync(Buffer.from(kasaGetGzip.body.veriSikistirilmis, 'base64')).toString('utf8'))
      : null;
    kontrol(
      `/api/bulut-kasa 5.400 soruyu gzip-b64 ile sıkıştırıp (%${Math.round((gzipB64.length / hamJson.length) * 100)} boyut) kayıpsız geri döndürdü`,
      kasaPutGzip.status === 200 &&
        gzipB64.length < hamJson.length * 0.25 &&
        kasaGetGzip.status === 200 &&
        kasaGetGzip.body.kodlama === 'gzip-b64' &&
        cozulenVeri &&
        Array.isArray(cozulenVeri.sorular) &&
        cozulenVeri.sorular.length === 5400 &&
        cozulenVeri.sorular[5387].metin.includes('OZEL-HEDEF-5388')
    );

    // ---------------------------------------------------------------------------
    // 3. PUPPETEER 5.400 SORU ÖLÇEĞİ, SAYFALAMA (100), 180ms DEBOUNCE & F5 BÜTÜNLÜĞÜ
    // ---------------------------------------------------------------------------
    console.log('\n3) Puppeteer 5.400 Soru Ölçeği, 100lü Sayfalama, 180ms Arama Debounce ve F5/IndexedDB Bütünlüğü');
    tarayici = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900']
    });
    const sayfa = await tarayici.newPage();
    const sayfaHatalari = [];
    sayfa.on('pageerror', (e) => sayfaHatalari.push(e.message));
    sayfa.on('dialog', async (d) => { await d.accept(); });

    const cdp = await sayfa.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: INDIRILEN });

    let tarayiciGzipPutGozlemlendi = false;
    await sayfa.setRequestInterception(false);
    sayfa.on('request', (req) => {
      if (req.url().includes('/api/bulut-kasa') && (req.method() === 'PUT' || req.method() === 'POST')) {
        const post = req.postData() || '';
        if (post.includes('"kodlama":"gzip-b64"') || post.includes('"veriSikistirilmis"')) {
          tarayiciGzipPutGozlemlendi = true;
        }
      }
    });

    await sayfa.setViewport({ width: 1440, height: 900 });
    await sayfa.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });

    // Giriş yap -> Bulut Kasadan 5.400 soru otomatik yüklenecek
    await sayfa.evaluate(() => {
      document.getElementById('hoca-giris-kullanici').value = 'hoca';
      document.getElementById('hoca-giris-sifre').value = 'Demo!Hoca2026';
      document.getElementById('btn-hoca-giris-yap').click();
    });
    await bekle(900);
    await sayfa.evaluate(() => {
      const k = document.getElementById('btn-modal-hoca-kapat');
      if (k && getComputedStyle(document.getElementById('modal-hoca-giris')).display !== 'none') k.click();
    });
    await bekle(300);

    // Soru Bankası sekmesine geç ve 100'lü sayfalama + DOM düğüm sınırını ölç
    const tBas = Date.now();
    await sayfa.click('[data-sekme="sekme-banka"]');
    await bekle(250);
    const bankaIlk = await sayfa.evaluate(() => {
      const tbody = document.getElementById('tablo-soru-bankasi');
      const sayfalama = document.getElementById('kutu-soru-bankasi-sayfalama');
      return {
        toplamRozet: document.getElementById('rozet-banka-toplam').textContent.trim(),
        satirSayisi: tbody ? tbody.querySelectorAll('tr').length : 0,
        domDugumSayisi: tbody ? tbody.querySelectorAll('*').length : 0,
        sayfalamaMetin: sayfalama ? sayfalama.textContent.replace(/\s+/g, ' ').trim() : ''
      };
    });
    const renderSureMs = Date.now() - tBas;
    kontrol(
      `5.400 Soru Banka Render (${renderSureMs}ms): 100 satır sayfalanmış, DOM düğümü sınırlı (${bankaIlk.domDugumSayisi})`,
      bankaIlk.toplamRozet === '5400' &&
        bankaIlk.satirSayisi === 100 &&
        bankaIlk.domDugumSayisi < 3500 &&
        bankaIlk.sayfalamaMetin.includes('1–100') &&
        bankaIlk.sayfalamaMetin.includes('Sayfa 1 / 54') &&
        renderSureMs < 3000,
      JSON.stringify(bankaIlk)
    );

    // Sayfa 2'ye geçiş
    await sayfa.click('#kutu-soru-bankasi-sayfalama [data-banka-sayfa="sonraki"]');
    await bekle(120);
    const bankaSayfa2 = await sayfa.evaluate(() => ({
      satirSayisi: document.querySelectorAll('#tablo-soru-bankasi tr').length,
      ilkHucre: (document.querySelector('#tablo-soru-bankasi tr td') || {}).textContent || '',
      sayfalamaMetin: (document.getElementById('kutu-soru-bankasi-sayfalama') || {}).textContent.replace(/\s+/g, ' ').trim()
    }));
    kontrol(
      'Soru Bankası sayfa 2 geçişi 101–200 aralığını 100 satır olarak gösterir',
      bankaSayfa2.satirSayisi === 100 &&
        bankaSayfa2.ilkHucre.trim() === '101' &&
        bankaSayfa2.sayfalamaMetin.includes('Sayfa 2 / 54'),
      JSON.stringify(bankaSayfa2)
    );

    // 180ms arama debounce testi
    await sayfa.focus('#ara-soru-bankasi');
    await sayfa.evaluate(() => {
      const inp = document.getElementById('ara-soru-bankasi');
      inp.value = 'OZEL-HEDEF-5388';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await bekle(30);
    const debounceOncesiSatir = await sayfa.$eval('#tablo-soru-bankasi', (tb) => tb.querySelectorAll('tr').length);
    await bekle(260);
    const debounceSonrasi = await sayfa.evaluate(() => {
      const tb = document.getElementById('tablo-soru-bankasi');
      return {
        satir: tb.querySelectorAll('tr').length,
        metin: tb.textContent
      };
    });
    kontrol(
      'Soru Bankası araması 180ms debounce kullanır (anında DOM patlaması yapmaz) ve #5388 sorusunu tek satıra filtreler',
      debounceOncesiSatir === 100 &&
        debounceSonrasi.satir === 1 &&
        debounceSonrasi.metin.includes('OZEL-HEDEF-5388'),
      JSON.stringify({ debounceOncesiSatir, satir: debounceSonrasi.satir })
    );

    // Aramayı temizle ve tarayıcıdan gzip-b64 bulut senkron + IndexedDB yazımını tetikle
    await sayfa.evaluate(() => {
      const inp = document.getElementById('ara-soru-bankasi');
      inp.value = '';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await bekle(240);
    await sayfa.click('#btn-genel-kaydet-uygula');
    await bekle(600);

    // IndexedDB kontrolü
    const idbDurum = await sayfa.evaluate(async () => {
      return await new Promise((resolve) => {
        const req = indexedDB.open('SinavOptikKurtarmaV1', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('durum', 'readonly');
          const getReq = tx.objectStore('durum').get('ana_paket');
          getReq.onsuccess = () => {
            const p = getReq.result;
            db.close();
            resolve({
              varMi: Boolean(p && p.ana),
              soruSayisi: p && p.ana && Array.isArray(p.ana.sorular) ? p.ana.sorular.length : 0
            });
          };
          getReq.onerror = () => { db.close(); resolve({ varMi: false, soruSayisi: 0 }); };
        };
        req.onerror = () => resolve({ varMi: false, soruSayisi: 0 });
      });
    });
    kontrol(
      'Tarayıcı IndexedDB (SinavOptikKurtarmaV1) 5.400 soruyu saklar ve gzip-b64 ile /api/bulut-kasa senkronu yapar',
      idbDurum.varMi && idbDurum.soruSayisi === 5400 && tarayiciGzipPutGozlemlendi,
      JSON.stringify({ idbDurum, tarayiciGzipPutGozlemlendi })
    );

    // F5 (Sayfa yenileme) + localStorage silinmiş olsa bile IndexedDB/Bulut Kasa ile 5.400 soru korunumu
    await sayfa.evaluate(() => {
      localStorage.removeItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2');
    });
    await sayfa.reload({ waitUntil: 'networkidle0' });
    await bekle(700);
    await sayfa.click('[data-sekme="sekme-banka"]');
    await bekle(250);
    const f5SonrasiRozet = await sayfa.$eval('#rozet-banka-toplam', (el) => el.textContent.trim());
    kontrol(
      'F5 yenileme + localStorage temizliği sonrasında 5.400 soru IndexedDB/Bulut Kasadan kayıpsız geri yüklenir',
      f5SonrasiRozet === '5400',
      f5SonrasiRozet
    );

    // ---------------------------------------------------------------------------
    // 4. ACİL UI BUG'LARI, KOYU TEMA, MOBİL DRAWER, WORD PNG QR, GR & HOCA KİLİDİ
    // ---------------------------------------------------------------------------
    console.log('\n4) Sol Panel Resize, Geri Al Toast ×, Koyu Tema/Baskı İzolasyonu, Mobil Drawer, Word QR PNG, GR & Kilit');

    // 4a. Geri Al Toast & × Kapatma (Gerçek Tıklama + Hit-Test)
    const silOncesi = Number(await sayfa.$eval('#rozet-banka-toplam', (el) => el.textContent.trim()));
    await sayfa.click('#tablo-soru-bankasi [data-sil-soru]');
    await bekle(220);
    const toastAcikBilgi = await sayfa.evaluate(() => {
      const t = document.getElementById('toast-geri-al');
      const btn = document.getElementById('btn-toast-kapat');
      const r = btn.getBoundingClientRect();
      const ustEleman = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        gorunur: !t.hidden && getComputedStyle(t).display !== 'none',
        tiklanabilir: Boolean(ustEleman && (ustEleman === btn || btn.contains(ustEleman)))
      };
    });
    await sayfa.click('#btn-toast-kapat');
    await bekle(120);
    const toastKapaliBilgi = await sayfa.evaluate(() => {
      const t = document.getElementById('toast-geri-al');
      return {
        gizli: t.hidden === true && getComputedStyle(t).display === 'none',
        pointerEvents: getComputedStyle(t).pointerEvents
      };
    });
    await sayfa.click('#btn-son-silineni-geri-al');
    await bekle(250);
    const geriAlSonrasi = Number(await sayfa.$eval('#rozet-banka-toplam', (el) => el.textContent.trim()));
    kontrol(
      'Geri Al Toast × düğmesi başka bir katmanla engellenmez, gerçek tıklamayla anında kapanır ve soru geri alınır',
      toastAcikBilgi.gorunur &&
        toastAcikBilgi.tiklanabilir &&
        toastKapaliBilgi.gizli &&
        geriAlSonrasi === silOncesi,
      JSON.stringify({ toastAcikBilgi, toastKapaliBilgi, silOncesi, geriAlSonrasi })
    );

    // 4b. Sol Panel Resize Sürüklemesi (#sol-paneli-boyutlandir)
    await sayfa.click('[data-sekme="sekme-stüdyo"]');
    await bekle(250);
    const resizeBilgi = await sayfa.evaluate(() => {
      const tutamac = document.getElementById('sol-paneli-boyutlandir');
      const aside = document.querySelector('#sekme-stüdyo .iki-sutun-duzen > aside');
      const r = tutamac.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + Math.min(120, r.height / 2);
      const hit = document.elementFromPoint(cx, cy);
      return {
        basGenislik: Math.round(aside.getBoundingClientRect().width),
        imlec: getComputedStyle(tutamac).cursor,
        cx,
        cy,
        erisimAcik: Boolean(hit && (hit === tutamac || tutamac.contains(hit)))
      };
    });
    await sayfa.mouse.move(resizeBilgi.cx, resizeBilgi.cy);
    await sayfa.mouse.down();
    await sayfa.mouse.move(resizeBilgi.cx + 120, resizeBilgi.cy, { steps: 8 });
    await sayfa.mouse.up();
    await bekle(120);
    const genisSonrasi = await sayfa.$eval('#sekme-stüdyo .iki-sutun-duzen > aside', (el) => Math.round(el.getBoundingClientRect().width));
    // Fare bırakıldıktan sonra sürükleme takılı kalmamalı
    await sayfa.mouse.move(resizeBilgi.cx + 220, resizeBilgi.cy);
    await bekle(60);
    const takiliKalmaKontrol = await sayfa.$eval('#sekme-stüdyo .iki-sutun-duzen > aside', (el) => Math.round(el.getBoundingClientRect().width));

    const yeniTutamaç = await sayfa.$eval('#sol-paneli-boyutlandir', (t) => {
      const r = t.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + Math.min(120, r.height / 2) };
    });
    await sayfa.mouse.move(yeniTutamaç.cx, yeniTutamaç.cy);
    await sayfa.mouse.down();
    await sayfa.mouse.move(yeniTutamaç.cx - 140, yeniTutamaç.cy, { steps: 8 });
    await sayfa.mouse.up();
    await bekle(120);
    const darSonrasi = await sayfa.$eval('#sekme-stüdyo .iki-sutun-duzen > aside', (el) => Math.round(el.getBoundingClientRect().width));

    kontrol(
      `Sol panel resize rayı (#sol-paneli-boyutlandir) sürüklemeyle genişler (${resizeBilgi.basGenislik}px -> ${genisSonrasi}px) ve daralır (-> ${darSonrasi}px)`,
      resizeBilgi.imlec === 'col-resize' &&
        resizeBilgi.erisimAcik &&
        genisSonrasi >= resizeBilgi.basGenislik + 80 &&
        genisSonrasi <= 560 &&
        takiliKalmaKontrol === genisSonrasi &&
        darSonrasi < genisSonrasi &&
        darSonrasi >= 260,
      JSON.stringify({ resizeBilgi, genisSonrasi, takiliKalmaKontrol, darSonrasi })
    );

    // 4c. Koyu Tema Geçişi, Kontrast ve Baskı (@media print) İzolasyonu
    await sayfa.click('#btn-tema-degistir');
    await bekle(150);
    const koyuTemaDurum = await sayfa.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const girdi = document.getElementById('ayar-test-sayisi');
      const gCs = girdi ? getComputedStyle(girdi) : null;
      return {
        dataTema: document.documentElement.getAttribute('data-tema'),
        kayitli: localStorage.getItem('SINAV_TEMA_V1'),
        sekmeAktifKaldi: document.getElementById('sekme-stüdyo').classList.contains('aktif'),
        metinAna: cs.getPropertyValue('--metin').trim(),
        metinSoluk: cs.getPropertyValue('--metin-soluk').trim(),
        bgKart: cs.getPropertyValue('--bg-kart').trim(),
        girdiBg: gCs ? gCs.backgroundColor : '',
        girdiRenk: gCs ? gCs.color : ''
      };
    });
    const kSoluk = kontrastOrani(koyuTemaDurum.metinSoluk, koyuTemaDurum.bgKart);
    const kAna = kontrastOrani(koyuTemaDurum.metinAna, koyuTemaDurum.bgKart);

    await sayfa.emulateMediaType('print');
    await bekle(120);
    const baskiIzolasyon = await sayfa.evaluate(() => {
      const a4 = document.querySelector('#a4-onizleme-sahne .a4-sayfa');
      const cs = a4 ? getComputedStyle(a4) : null;
      return {
        a4Var: Boolean(a4),
        bg: cs ? cs.backgroundColor : '',
        renk: cs ? cs.color : ''
      };
    });
    await sayfa.emulateMediaType('screen');
    await sayfa.click('#btn-tema-degistir');
    await bekle(100);
    const acikTemaSekmeAktif = await sayfa.evaluate(() => document.getElementById('sekme-stüdyo').classList.contains('aktif'));
    kontrol(
      `Koyu tema WCAG AA kontrast (${kSoluk.toFixed(2)}:1 / ${kAna.toFixed(2)}:1), aktif sekme korunumu ve @media print beyaz kağıt izolasyonu`,
      koyuTemaDurum.dataTema === 'koyu' &&
        koyuTemaDurum.kayitli === 'koyu' &&
        koyuTemaDurum.sekmeAktifKaldi &&
        acikTemaSekmeAktif &&
        kSoluk >= 4.5 &&
        kAna >= 7 &&
        baskiIzolasyon.a4Var &&
        baskiIzolasyon.bg === 'rgb(255, 255, 255)' &&
        baskiIzolasyon.renk === 'rgb(0, 0, 0)',
      JSON.stringify({ koyuTemaDurum, acikTemaSekmeAktif, kSoluk, kAna, baskiIzolasyon })
    );

    // 4d. <900px Mobil Görünümde Çekmece (Drawer) ve Sıfır Yatay Taşma
    await sayfa.setViewport({ width: 390, height: 844 });
    await bekle(150);
    const mobilKapali = await sayfa.evaluate(() => ({
      tasmaYok: document.documentElement.scrollWidth <= window.innerWidth,
      menuBtnGorunur: getComputedStyle(document.getElementById('btn-mobil-yan-menu-ac')).display !== 'none'
    }));
    await sayfa.click('#btn-mobil-yan-menu-ac');
    await bekle(220);
    const mobilAcik = await sayfa.evaluate(() => {
      const nav = document.getElementById('ust-sekme-nav').getBoundingClientRect();
      return {
        sinifAcik: document.body.classList.contains('mobil-menu-acik'),
        navGorunur: nav.left >= -2 && nav.right <= 392 && nav.width >= 180,
        tasmaYok: document.documentElement.scrollWidth <= window.innerWidth
      };
    });
    await sayfa.mouse.click(340, 200);
    await bekle(220);
    const cekmeceKapandi = await sayfa.evaluate(() => !document.body.classList.contains('mobil-menu-acik'));
    await sayfa.setViewport({ width: 1440, height: 900 });
    await bekle(150);
    kontrol(
      '<900px (390x844) mobil görünümde sol çekmece (drawer) açılıp kapanır ve yatay taşma 0 olur',
      mobilKapali.tasmaYok &&
        mobilKapali.menuBtnGorunur &&
        mobilAcik.sinifAcik &&
        mobilAcik.navGorunur &&
        mobilAcik.tasmaYok &&
        cekmeceKapandi,
      JSON.stringify({ mobilKapali, mobilAcik, cekmeceKapandi })
    );

    // 4e. Word (.doc) Dışa Aktarımında QR Kodun data:image/png İçermesi
    const onceIndirilen = fs.readdirSync(INDIRILEN).filter((f) => !f.endsWith('.crdownload')).length;
    await sayfa.$eval('#btn-word-indir', (el) => {
      const det = el.closest('details');
      if (det) det.open = true;
      el.scrollIntoView({ block: 'center' });
    });
    await bekle(100);
    await sayfa.click('#btn-word-indir');
    const wordYolu = await indirmeBekle(INDIRILEN, onceIndirilen, '.doc', 15000);
    const wordIcerik = wordYolu ? fs.readFileSync(wordYolu, 'utf8') : '';
    const pngImgSayisi = (wordIcerik.match(/src="data:image\/png;base64,/g) || []).length;
    kontrol(
      `Word (.doc) dışa aktarımında QR ve optik form SVG'leri data:image/png olarak gömülür (${pngImgSayisi} PNG)`,
      Boolean(wordYolu) && pngImgSayisi >= 2 && !wordIcerik.includes('<svg'),
      wordYolu ? `boyut=${wordIcerik.length}, png=${pngImgSayisi}` : 'Word dosyası inmedi'
    );

    // 4f. GR Mutabakatı & CSV BOM/Formül Enjeksiyon Koruması
    await sayfa.click('[data-sekme="sekme-omr"]');
    await bekle(200);
    await sayfa.click('#btn-sim-tek-tara');
    await bekle(350);
    await sayfa.click('[data-sekme="sekme-analiz"]');
    await bekle(250);
    const grDurum = await sayfa.evaluate(() => ({
      grSayi: Number(document.getElementById('ist-girmeyen-gr').textContent.trim()),
      mutabakatMetin: document.getElementById('icerik-gr-mutabakat').textContent
    }));
    const onceCsv = fs.readdirSync(INDIRILEN).filter((f) => !f.endsWith('.crdownload')).length;
    await sayfa.click('#btn-obs-resmi-csv-indir');
    const csvYolu = await indirmeBekle(INDIRILEN, onceCsv, '.csv', 15000);
    const csvBuf = csvYolu ? fs.readFileSync(csvYolu) : Buffer.alloc(0);
    const csvMetin = csvBuf.toString('utf8');
    const tekBomMu = csvBuf.length >= 3 && csvBuf[0] === 0xef && csvBuf[1] === 0xbb && csvBuf[2] === 0xbf && !csvMetin.startsWith('\ufeff\ufeff');
    kontrol(
      'GR mutabakatı BEKLEYEN → GR olarak listelenir, OBS CSV tek BOM + formül enjeksiyon korumalı ve GR satırlı iner',
      grDurum.grSayi >= 3 &&
        grDurum.mutabakatMetin.includes('GR') &&
        tekBomMu &&
        csvMetin.includes(';GR;') &&
        csvMetin.includes("'=CMD") &&
        csvMetin.includes("'+TEHLIKELI-FORMUL"),
      JSON.stringify({ grDurum, csvVar: Boolean(csvYolu), tekBomMu })
    );

    // 4g. #btn-hoca-kilitle Oturumu Kilitle (Sunucu Token İptali + UI Kilit)
    const kilitleOncesiToken = await sayfa.evaluate(() => sessionStorage.getItem('hoca_token') || '');
    await sayfa.click('#btn-hoca-giris-ac');
    await bekle(150);
    await sayfa.click('#btn-hoca-kilitle');
    await bekle(300);
    const kilitSonrasi = await sayfa.evaluate(() => ({
      anaKilitli: document.getElementById('ana-icerik-alani').style.pointerEvents === 'none',
      modalAcik: document.getElementById('modal-hoca-giris').style.display === 'flex',
      tokenSilindi: !sessionStorage.getItem('hoca_token')
    }));
    const iptalKontrol = kilitleOncesiToken
      ? await httpHamIstek(port, 'GET', '/api/bulut-kasa', null, { Authorization: `Bearer ${kilitleOncesiToken}` })
      : { status: 401 };
    kontrol(
      '#btn-hoca-kilitle stüdyoyu kilitler, oturum tokenını siler ve /api/hoca-cikis ile sunucuda iptal eder',
      kilitSonrasi.anaKilitli && kilitSonrasi.modalAcik && kilitSonrasi.tokenSilindi && iptalKontrol.status === 401
    );

    // 4h. Mobil Okuyucu (optik-mobil.html) Saha UX & Kuyruk Rozeti Kontrolü
    const mobilSayfa = await tarayici.newPage();
    const mobilHatalar = [];
    mobilSayfa.on('pageerror', (e) => mobilHatalar.push(e.message));
    await mobilSayfa.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await mobilSayfa.goto(`${taban}/optik-mobil.html`, { waitUntil: 'networkidle0' });
    const mobilUx = await mobilSayfa.evaluate(() => {
      const dek = document.getElementById('btn-mobil-kare-oku').getBoundingClientRect();
      return {
        tasmaYok: document.documentElement.scrollWidth <= window.innerWidth,
        bekleyenRozetVar: Boolean(document.getElementById('rozet-mobil-bekleyen')),
        fotoFallbackVar: Boolean(document.getElementById('input-mobil-foto')),
        deklansorW: Math.round(dek.width),
        deklansorH: Math.round(dek.height)
      };
    });
    kontrol(
      'optik-mobil.html saha UX hedefleri (>=64px deklanşör, kuyruk rozeti, 0 taşma, 0 JS hatası)',
      mobilUx.tasmaYok &&
        mobilUx.bekleyenRozetVar &&
        mobilUx.fotoFallbackVar &&
        mobilUx.deklansorW >= 64 &&
        mobilUx.deklansorH >= 64 &&
        mobilHatalar.length === 0,
      JSON.stringify({ mobilUx, mobilHatalar })
    );
    await mobilSayfa.close();

    kontrol('Masaüstü oturumu boyunca sıfır sayfa JS hatası', sayfaHatalari.length === 0, sayfaHatalari.join(' | '));
    await sayfa.close();
  } finally {
    if (tarayici) await tarayici.close();
    server.close();
    try { if (fs.existsSync(YEREL_KASA)) fs.unlinkSync(YEREL_KASA); } catch (_) {}
    try {
      for (const f of fs.readdirSync(INDIRILEN)) fs.unlinkSync(path.join(INDIRILEN, f));
    } catch (_) {}
  }

  console.log(`\n=== ${gecen} KONTROL GEÇTİ · ${hataSayisi} HATA ===`);
  process.exit(hataSayisi ? 1 : 0);
})().catch((err) => {
  console.error('ÖLÇEK VE GÜVENLİK TESTİ ÇÖKTÜ:', err);
  process.exit(2);
});
