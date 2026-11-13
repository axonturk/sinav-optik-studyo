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
  console.log('1) Statik PWA (sinav-optik-v17), Güvenlik Başlıkları ve PBKDF2 Hashing');
  const swIcerik = fs.readFileSync(path.join(KOK, 'sw.js'), 'utf8');
  kontrol(
    'sw.js sürümü sinav-optik-v17, manifest-studyo.webmanifest önbellekte ve /api/ hariç',
    /SURUM\s*=\s*'sinav-optik-v17'/.test(swIcerik) &&
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

    // -------------------------------------------------------------------------
    // 4i. GERÇEK CİHAZ KİLİDİ (SAHTE SKOR UYDURMAMA), DERS İZOLASYONU & KAĞITTAN ANAHTAR OKU
    // -------------------------------------------------------------------------
    const giris3 = await httpHamIstek(port, 'POST', '/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
    const token3 = giris3.body && giris3.body.token;
    const yetkisizMobilPaket = await httpHamIstek(port, 'GET', '/api/mobil-ders-paketleri');
    kontrol(
      'GET /api/mobil-ders-paketleri yetkisiz erişimi 401 ile reddeder',
      yetkisizMobilPaket.status === 401
    );

    const blgOgrenciler = Array.from({ length: 12 }, (_, idx) => ({
      ogrNo: String(257411001 + idx),
      adSoyad: `BLG Öğrenci ${idx + 1}`
    }));
    const agOgrenciler = [
      { ogrNo: '2004', adSoyad: 'BURAK DEMİRBÜKER' },
      { ogrNo: '2017', adSoyad: 'ENES BATIN KIRILMAZ' },
      { ogrNo: '2021', adSoyad: 'BAHAR ÖNCEL' }
    ];
    const ikiDersKasa = {
      aktifDersId: 'ders-blg-101',
      dersler: [
        {
          id: 'ders-blg-101',
          kod: 'BLG-101',
          ad: 'Bilgisayar Ağları',
          ogrenciler: blgOgrenciler,
          sinavYapisi: { sinavKodu: 'BLG101-VIZE', dersAd: 'Bilgisayar Ağları', dySayisi: 10, testSayisi: 10, klasikSayisi: 0 },
          kayitliSinavlar: [{ id: 'sin-blg-1', ad: 'Vize', yapi: { dySayisi: 10, testSayisi: 10, klasikSayisi: 0 } }]
        },
        {
          id: 'ders-ag-202',
          kod: 'AG-202',
          ad: 'Yönlendirme ve Anahtarlama',
          ogrenciler: agOgrenciler,
          sinavYapisi: { sinavKodu: 'AG202-VIZE', dersAd: 'Yönlendirme ve Anahtarlama', dySayisi: 15, testSayisi: 10, klasikSayisi: 0 },
          kayitliSinavlar: []
        }
      ],
      hocaHesap: { kullaniciAdi: 'hoca', sifre: 'PAROLA_SIZMAZ', adSoyad: 'Demo Hoca' }
    };
    const kasaOnce = await httpHamIstek(port, 'GET', '/api/bulut-kasa', null, { Authorization: `Bearer ${token3}` });
    const putIkiDers = await httpHamIstek(
      port,
      'PUT',
      '/api/bulut-kasa',
      {
        veri: ikiDersKasa,
        bazRevizyonNo: kasaOnce.body && kasaOnce.body.revizyonNo,
        silmeOnayi: true,
        zorlaEz: true,
        islemNotu: 'Mobil ders izolasyon testi'
      },
      { Authorization: `Bearer ${token3}` }
    );
    const mobilDersYanit = await httpHamIstek(port, 'GET', '/api/mobil-ders-paketleri', null, { Authorization: `Bearer ${token3}` });
    const mobilDersMetin = JSON.stringify(mobilDersYanit.body || {});
    kontrol(
      'GET /api/mobil-ders-paketleri 2 dersi tam öğrenci listeleriyle döner ve parola sızdırmaz',
      putIkiDers.status === 200 &&
        mobilDersYanit.status === 200 &&
        mobilDersYanit.body.basarili === true &&
        Array.isArray(mobilDersYanit.body.dersler) &&
        mobilDersYanit.body.dersler.length === 2 &&
        mobilDersYanit.body.dersler[0].ogrenciler.length === 12 &&
        mobilDersYanit.body.dersler[1].ogrenciler.length === 3 &&
        !mobilDersMetin.includes('PAROLA_SIZMAZ'),
      JSON.stringify({ status: mobilDersYanit.status, adet: mobilDersYanit.body && mobilDersYanit.body.dersler && mobilDersYanit.body.dersler.length })
    );

    // Test A + Test B + Test C (Mobil PWA)
    const pwaTestSayfa = await tarayici.newPage();
    const pwaTestHatalar = [];
    pwaTestSayfa.on('pageerror', (e) => pwaTestHatalar.push(e.message));
    await pwaTestSayfa.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await pwaTestSayfa.evaluateOnNewDocument(() => {
      window.__mobilGercekKullaniciZorla = true;
    });
    const omrTokRes = await httpHamIstek(port, 'POST', '/api/omr-eslesme-token', {}, { Authorization: `Bearer ${token3}` });
    const omrTok3 = omrTokRes.body && omrTokRes.body.omrToken;
    const ogrQrBlg = Cekirdek.uretOgrenciQrPaketi(blgOgrenciler, {
      tabanAdres: taban,
      hedefSayfa: 'optik-mobil.html',
      dersId: 'ders-blg-101',
      dersKod: 'BLG-101',
      dersAd: 'Bilgisayar Ağları',
      omrToken: omrTok3
    });
    await pwaTestSayfa.goto(ogrQrBlg.tekUrl, { waitUntil: 'networkidle0' });
    await bekle(450);

    // Test A: Gerçek kullanıcı modunda kamera yokken Oku / Oto basınca ASLA sahte sonuç üretilmez
    await pwaTestSayfa.click('#btn-mobil-kare-oku');
    await bekle(200);
    await pwaTestSayfa.click('#btn-mobil-seri-tara');
    await bekle(200);
    const gercekKullaniciKoruma = await pwaTestSayfa.evaluate(() => {
      const d = window.__mobilDurumOku();
      const bildirim = document.getElementById('mobil-genel-bildirim');
      return {
        okumaSayisi: d.okumaSonuclari.length,
        bildirimGorunur: Boolean(bildirim && !bildirim.hidden),
        bildirimMetin: bildirim ? bildirim.textContent : ''
      };
    });
    kontrol(
      'Mobil PWA gerçek kullanıcı modunda kamera yokken asla sahte öğrenci puanı uydurmaz',
      gercekKullaniciKoruma.okumaSayisi === 0 && gercekKullaniciKoruma.bildirimGorunur,
      JSON.stringify(gercekKullaniciKoruma)
    );

    // Test B: Liste sekmesinde 2 ders + 12 öğrenci + 0 yatay taşma ve ders bazlı izolasyon
    await pwaTestSayfa.click('[data-msekme="m-panel-liste"]');
    await bekle(250);
    const blgListeDurum = await pwaTestSayfa.evaluate(() => {
      const sel = document.getElementById('mobil-aktif-ders-sec');
      const satirlar = document.querySelectorAll('#mobil-tablo-sinif-yoklama tr');
      return {
        dersSecenekSayisi: sel ? sel.options.length : 0,
        seciliDers: sel ? sel.value : '',
        satirSayisi: satirlar.length,
        ilkSatirMetin: satirlar[0] ? satirlar[0].textContent : '',
        yoklamaRozet: document.getElementById('mobil-yoklama-ozet-rozet').textContent,
        tasmaYok: document.documentElement.scrollWidth <= window.innerWidth
      };
    });
    // İkinci derse (ders-ag-202) geç -> 3 öğrenci ve 0 okuma görmeliyiz
    await pwaTestSayfa.select('#mobil-aktif-ders-sec', 'ders-ag-202');
    await bekle(200);
    const agListeDurum = await pwaTestSayfa.evaluate(() => ({
      satirSayisi: document.querySelectorAll('#mobil-tablo-sinif-yoklama tr').length,
      ilkSatir: document.getElementById('mobil-tablo-sinif-yoklama').textContent,
      okumaSayi: window.__mobilDurumOku().okumaSonuclari.length,
      tasmaYok: document.documentElement.scrollWidth <= window.innerWidth
    }));
    // Tekrar BLG-101'e dön
    await pwaTestSayfa.select('#mobil-aktif-ders-sec', 'ders-blg-101');
    await bekle(200);
    kontrol(
      'Mobil PWA Liste sekmesinde dersler ve tüm sınıf öğrencileri ders bazında izole listelenir (0 yatay taşma)',
      blgListeDurum.dersSecenekSayisi === 2 &&
        blgListeDurum.satirSayisi === 12 &&
        blgListeDurum.yoklamaRozet.includes('0 / 12') &&
        blgListeDurum.tasmaYok &&
        agListeDurum.satirSayisi === 3 &&
        agListeDurum.ilkSatir.includes('BURAK DEMİRBÜKER') &&
        agListeDurum.okumaSayi === 0 &&
        agListeDurum.tasmaYok,
      JSON.stringify({ blgListeDurum, agListeDurum })
    );

    // Test C (Mobil): Kağıttan Anahtar Oku -> 10 D/Y=Y + 10 Test=C kağıdını okuyup anahtarı günceller, öğrenci puanı eklemez
    await pwaTestSayfa.click('[data-msekme="m-panel-anahtar"]');
    await bekle(200);
    await pwaTestSayfa.evaluate(() => {
      const C = window.SinavOptikCekirdek;
      const canvas = document.getElementById('mobil-canvas-vizor');
      const d = window.__mobilDurumOku();
      C.cizSentetikOptikFormCanvas(canvas, d.sinavYapisi, {
        grup: 'A',
        ogrNoKod: '01',
        dyCevaplar: Array(d.sinavYapisi.dySayisi).fill('Y'),
        testCevaplar: Array(d.sinavYapisi.testSayisi).fill('C'),
        klasikPuanlar: []
      });
    });
    await pwaTestSayfa.click('#btn-master-kagit-okut');
    await bekle(300);
    const mobilAnahtarOkuDurum = await pwaTestSayfa.evaluate(() => {
      const d = window.__mobilDurumOku();
      const onay = document.getElementById('mobil-anahtar-kayit-onay');
      const dyHepsiY = d.sinavYapisi.cevapAnahtarlari.A.dy.slice(0, d.sinavYapisi.dySayisi).every((v) => v === 'Y');
      const testHepsiC = d.sinavYapisi.cevapAnahtarlari.A.test.slice(0, d.sinavYapisi.testSayisi).every((v) => v === 'C');
      return {
        dyHepsiY,
        testHepsiC,
        okumaSayisi: d.okumaSonuclari.length,
        onayGorunur: Boolean(onay && !onay.hidden),
        onayMetin: onay ? onay.textContent : '',
        tasmaYok: document.documentElement.scrollWidth <= window.innerWidth
      };
    });
    kontrol(
      'Mobil "Kağıttan Anahtar Oku" işaretli öğretmen kağıdından D/Y ve Test cevaplarını çıkarır ve sahte öğrenci kaydı eklemez',
      mobilAnahtarOkuDurum.dyHepsiY &&
        mobilAnahtarOkuDurum.testHepsiC &&
        mobilAnahtarOkuDurum.okumaSayisi === 0 &&
        mobilAnahtarOkuDurum.onayGorunur &&
        mobilAnahtarOkuDurum.tasmaYok &&
        pwaTestHatalar.length === 0,
      JSON.stringify({ mobilAnahtarOkuDurum, pwaTestHatalar })
    );

    // Test C (Masaüstü): index.html dosya yüklemeli "Kağıttan Anahtar Oku" (temiz sekmede)
    const masterPngDataUrl = await pwaTestSayfa.evaluate(() => {
      const C = window.SinavOptikCekirdek;
      const tmp = document.createElement('canvas');
      const d = window.__mobilDurumOku();
      C.cizSentetikOptikFormCanvas(tmp, d.sinavYapisi, {
        grup: 'A',
        ogrNoKod: '01',
        dyCevaplar: Array(d.sinavYapisi.dySayisi).fill('Y'),
        testCevaplar: Array(d.sinavYapisi.testSayisi).fill('C'),
        klasikPuanlar: []
      });
      return tmp.toDataURL('image/png');
    });
    await pwaTestSayfa.close();

    const masaMasterSayfa = await tarayici.newPage();
    const masaMasterHatalar = [];
    masaMasterSayfa.on('pageerror', (e) => masaMasterHatalar.push(e.message));
    await masaMasterSayfa.setViewport({ width: 1280, height: 840 });
    await masaMasterSayfa.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await masaMasterSayfa.evaluate(() => {
      document.getElementById('hoca-giris-kullanici').value = 'hoca';
      document.getElementById('hoca-giris-sifre').value = 'Demo!Hoca2026';
      document.getElementById('btn-hoca-giris-yap').click();
    });
    await bekle(650);
    await masaMasterSayfa.evaluate(() => {
      const kapat = document.getElementById('btn-modal-hoca-kapat');
      const m = document.getElementById('modal-hoca-giris');
      if (kapat && m && getComputedStyle(m).display !== 'none') kapat.click();
    });
    await masaMasterSayfa.click('[data-sekme="sekme-omr"]');
    await bekle(200);
    const geciciMasterPng = path.join(KOK, '.gecici-master-anahtar.png');
    fs.writeFileSync(geciciMasterPng, Buffer.from(masterPngDataUrl.split(',')[1], 'base64'));
    const masaMasterInput = await masaMasterSayfa.$('#input-omr-ogretmen-kagit-foto');
    await masaMasterInput.uploadFile(geciciMasterPng);
    await bekle(550);
    try { fs.unlinkSync(geciciMasterPng); } catch (_) {}
    const masaMasterSonuc = await masaMasterSayfa.evaluate(() => {
      const el = document.getElementById('etiket-omr-anahtar-oku-sonuc');
      const dyInp = document.getElementById('omr-anahtar-a-dy');
      const testInp = document.getElementById('omr-anahtar-a-test');
      const hariciAktif = document.getElementById('ayar-omr-harici-anahtar-aktif');
      return {
        sonucGorunur: Boolean(el && !el.hidden),
        sonucMetin: el ? el.textContent : '',
        dyVal: dyInp ? dyInp.value.trim() : '',
        testVal: testInp ? testInp.value.trim() : '',
        hariciAktif: Boolean(hariciAktif && hariciAktif.checked)
      };
    });
    await masaMasterSayfa.close();
    kontrol(
      'Masaüstü Stüdyo "Kağıttan Anahtar Oku" dosya yüklemesinden anahtarı çıkarır ve geri bildirim gösterir',
      masaMasterSonuc.sonucGorunur &&
        masaMasterSonuc.sonucMetin.includes('anahtarı otomatik çıkarıldı') &&
        masaMasterSonuc.hariciAktif &&
        masaMasterSonuc.dyVal === 'YYYYYYYYYY' &&
        masaMasterSonuc.testVal.startsWith('CCCCCCCCCC') &&
        masaMasterHatalar.length === 0,
      JSON.stringify({ masaMasterSonuc, masaMasterHatalar })
    );

    // -------------------------------------------------------------------------
    // V2 KAYIPSIZ PWA <-> MASAÜSTÜ SENKRON KABUL KONTROLLERİ ([38]–[42])
    // -------------------------------------------------------------------------
    console.log('10) V2 Kayıpsız PWA <-> Masaüstü Delta Senkron & .sinavpaket.json Kontrolleri');

    // [38] Zero-Trust V2 Yetki Kalkanı (server.js + worker.js)
    const v2Giris = await httpHamIstek(port, 'POST', '/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
    const v2Tok = v2Giris.body && v2Giris.body.token;
    const v2OmrRes = await httpHamIstek(port, 'POST', '/api/omr-eslesme-token', { oturumKodu: 'V2KOD', sureDk: 60 }, { Authorization: `Bearer ${v2Tok}` });
    const v2OmrTok = v2OmrRes.body && v2OmrRes.body.omrToken;

    const u401A = await httpHamIstek(port, 'POST', '/api/v2/sinav-paket-yayinla', { sinavKodu: 'TEST' });
    const u401B = await httpHamIstek(port, 'POST', '/api/v2/sinav-senkron', { olaylar: [{ eventId: 'E0', tur: 'OKUDU_GUNCELLE', sinavKodu: 'TEST', veri: {} }] });
    const u401C = await httpHamIstek(port, 'GET', '/api/v2/sinav-senkron?sinceSeq=0');

    const wV2Env = olusturSahteWorkerEnv();
    const wu401A = await workerIstek(wV2Env, 'POST', '/api/v2/sinav-paket-yayinla', { sinavKodu: 'TEST' });
    const wu401B = await workerIstek(wV2Env, 'POST', '/api/v2/sinav-senkron', { olaylar: [{ eventId: 'E0', tur: 'OKUDU_GUNCELLE', sinavKodu: 'TEST', veri: {} }] });
    const wu401C = await workerIstek(wV2Env, 'GET', '/api/v2/sinav-senkron?sinceSeq=0');
    kontrol(
      '[38] Zero-Trust V2 Yetki Kalkanı: Tokensız tüm /api/v2/* çağrıları hem server.js hem worker.js üzerinde 401 reddedilir',
      u401A.status === 401 && u401B.status === 401 && u401C.status === 401 &&
      wu401A.status === 401 && wu401B.status === 401 && wu401C.status === 401,
      JSON.stringify({ u: [u401A.status, u401B.status, u401C.status], w: [wu401A.status, wu401B.status, wu401C.status] })
    );

    // [39] İdempotent Push + Yıkıcı Olmayan (Non-Destructive) Cursor Pull + Worker Paritesi
    const demoOlay = {
      eventId: 'EVT-IDEM-001',
      sinavKodu: 'V2-TEST-101',
      tur: 'OKUDU_GUNCELLE',
      kaynakCihaz: 'mobil',
      zamanMs: Date.now(),
      veri: {
        ogrNo: '2026000001',
        adSoyad: 'Test Öğrencisi',
        grup: 'A',
        hamCevaplar: { dy: ['D', 'Y'], test: ['A', 'B'] }
      }
    };
    const pushIlk = await httpHamIstek(port, 'POST', '/api/v2/sinav-senkron', { olaylar: [demoOlay] }, { Authorization: `Bearer ${v2OmrTok}` });
    const pushIkinci = await httpHamIstek(port, 'POST', '/api/v2/sinav-senkron', { olaylar: [demoOlay] }, { Authorization: `Bearer ${v2OmrTok}` });
    const pullIstemci1 = await httpHamIstek(port, 'GET', '/api/v2/sinav-senkron?sinceSeq=0&sinavKodu=V2-TEST-101', null, { Authorization: `Bearer ${v2Tok}` });
    const pullIstemci2 = await httpHamIstek(port, 'GET', '/api/v2/sinav-senkron?sinceSeq=0&sinavKodu=V2-TEST-101', null, { Authorization: `Bearer ${v2OmrTok}` });

    const wV2Giris = await workerIstek(wV2Env, 'POST', '/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
    const wV2Tok = wV2Giris.body && wV2Giris.body.token;
    const wPush1 = await workerIstek(wV2Env, 'POST', '/api/v2/sinav-senkron', { olaylar: [demoOlay] }, { Authorization: `Bearer ${wV2Tok}` });
    const wPush2 = await workerIstek(wV2Env, 'POST', '/api/v2/sinav-senkron', { olaylar: [demoOlay] }, { Authorization: `Bearer ${wV2Tok}` });
    const wPull1 = await workerIstek(wV2Env, 'GET', '/api/v2/sinav-senkron?sinceSeq=0&sinavKodu=V2-TEST-101', null, { Authorization: `Bearer ${wV2Tok}` });
    const wPull2 = await workerIstek(wV2Env, 'GET', '/api/v2/sinav-senkron?sinceSeq=0&sinavKodu=V2-TEST-101', null, { Authorization: `Bearer ${wV2Tok}` });

    kontrol(
      '[39] V2 Idempotent Push & Non-Destructive Cursor Pull hem server.js hem worker.js üzerinde eşlenik çalışır',
      pushIlk.status === 200 && pushIlk.body.yazilanSayisi === 1 &&
      pushIkinci.status === 200 && pushIkinci.body.yazilanSayisi === 0 && pushIkinci.body.atlananSayisi === 1 &&
      pullIstemci1.body.olaylar.length === 1 && pullIstemci2.body.olaylar.length === 1 &&
      wPush1.status === 200 && wPush1.body.yazilanSayisi === 1 &&
      wPush2.status === 200 && wPush2.body.atlananSayisi === 1 &&
      wPull1.body.olaylar.length === 1 && wPull2.body.olaylar.length === 1
    );

    // [40] .sinavpaket.json SHA-256 Bütünlük Mührü Doğrulaması
    const temizPaket = Cekirdek.uretBirlesikSinavPaketi({
      sinavKodu: 'V2-PAKET-01',
      dersId: 'ders-1',
      dersAdi: 'Algoritmalar',
      sinavYapisi: { dySayisi: 2, testSayisi: 2, cevapAnahtarlari: { A: { dy: ['D', 'D'], test: ['A', 'B'] } } },
      ogrenciler: [{ ogrNo: '2026000010', adSoyad: 'Ayşe Yılmaz' }],
      okumaSonuclari: [{ id: 'R1', ogrNo: '2026000010', toplamPuan: 85, dyDetay: [{ soruNo: 1, verilen: 'D' }], testDetay: [{ soruNo: 1, verilen: 'A' }] }]
    });
    const cozulmusPaket = Cekirdek.cozBirlesikSinavPaketi(JSON.stringify(temizPaket));
    let bozukPaketReddedildi = false;
    try {
      const bozuk = JSON.parse(JSON.stringify(temizPaket));
      bozuk.okumaSonuclari[0].toplamPuan = 100;
      Cekirdek.cozBirlesikSinavPaketi(bozuk);
    } catch (_) {
      bozukPaketReddedildi = true;
    }
    kontrol(
      '[40] .sinavpaket.json SHA-256 bütünlük mührü geçerli paketi çözer ve kurcalanan paketi reddeder',
      cozulmusPaket.sinavKodu === 'V2-PAKET-01' &&
      cozulmusPaket.okumaSonuclari[0].hamCevaplar.dy[0] === 'D' &&
      bozukPaketReddedildi === true
    );

    // [41] Çevrimdışı Mobil Outbox -> #baglan=1 ile Otomatik Gönderim (Puppeteer 390x844)
    const baglanQr = Cekirdek.uretBaglantiQrPaketi(taban, {
      sinavKodu: 'V2-CANLI-2026',
      dersId: 'ders-v2',
      dersAdi: 'Yazılım Mühendisliği',
      omrToken: v2OmrTok
    });
    const v2MobilSayfa = await tarayici.newPage();
    const v2MobilHatalar = [];
    v2MobilSayfa.on('pageerror', (e) => v2MobilHatalar.push(e.message));
    await v2MobilSayfa.setViewport({ width: 390, height: 844 });
    await v2MobilSayfa.goto(`${taban}/optik-mobil.html`, { waitUntil: 'networkidle0' });
    const kagitV2DataUrl = await v2MobilSayfa.evaluate(() => {
      const C = window.SinavOptikCekirdek;
      const d = window.__mobilDurumOku();
      const tmp = document.createElement('canvas');
      C.cizSentetikOptikFormCanvas(tmp, d.sinavYapisi, {
        grup: 'A',
        ogrNoKod: '55',
        dyCevaplar: Array(d.sinavYapisi.dySayisi).fill('D'),
        testCevaplar: Array(d.sinavYapisi.testSayisi).fill('A'),
        klasikPuanlar: []
      });
      return tmp.toDataURL('image/png');
    });
    const geciciV2KagitPng = path.join(KOK, '.gecici-v2-kagit.png');
    fs.writeFileSync(geciciV2KagitPng, Buffer.from(kagitV2DataUrl.split(',')[1], 'base64'));
    const mobilFotoInp = await v2MobilSayfa.$('#input-mobil-foto');
    await mobilFotoInp.uploadFile(geciciV2KagitPng);
    await bekle(450);
    try { fs.unlinkSync(geciciV2KagitPng); } catch (_) {}
    const mobilCevrimdisiDurum = await v2MobilSayfa.evaluate(() => {
      const ob = window.__mobilV2OutboxOku();
      const rozet = document.getElementById('rozet-mobil-bekleyen');
      return {
        bekleyenSayi: ob.bekleyenSayi,
        okumaSayisi: window.__mobilDurumOku().okumaSayisi,
        rozetMetin: rozet ? rozet.textContent : '',
        rozetGorunur: Boolean(rozet && !rozet.hidden),
        tasmaYok: document.documentElement.scrollWidth <= window.innerWidth
      };
    });
    // Şimdi #baglan=1 QR açılınca outbox otomatik gönderilmeli
    await v2MobilSayfa.goto(baglanQr.url, { waitUntil: 'networkidle0' });
    await v2MobilSayfa.evaluate(() => window.__mobilV2SenkronTetikle({ sessiz: true }));
    await bekle(350);
    const baglantiSonrasiOb = await v2MobilSayfa.evaluate(() => ({
      outbox: window.__mobilV2OutboxOku(),
      rozet: (document.getElementById('rozet-mobil-bekleyen') || {}).textContent || ''
    }));
    await v2MobilSayfa.close();
    kontrol(
      '[41] Çevrimdışı mobil okuma Outbox kuyruğuna düşer (0 yatay taşma) ve #baglan=1 ile sunucuya otomatik aktarılır',
      mobilCevrimdisiDurum.bekleyenSayi >= 1 &&
      mobilCevrimdisiDurum.okumaSayisi >= 1 &&
      mobilCevrimdisiDurum.rozetGorunur &&
      mobilCevrimdisiDurum.tasmaYok &&
      baglantiSonrasiOb.outbox.bekleyenSayi === 0 &&
      v2MobilHatalar.length === 0,
      JSON.stringify({ mobilCevrimdisiDurum, baglantiSonrasiOb, v2MobilHatalar })
    );

    // [42] Modal Kapalıyken Canlı Masaüstü Birleşimi + "Kağıttan Anahtar Oku" Çift Yönlü Yeniden Puanlama
    const masaV2Sayfa = await tarayici.newPage();
    const masaV2Hatalar = [];
    masaV2Sayfa.on('pageerror', (e) => masaV2Hatalar.push(e.message));
    await masaV2Sayfa.setViewport({ width: 1280, height: 840 });
    await masaV2Sayfa.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await masaV2Sayfa.evaluate(() => {
      document.getElementById('hoca-giris-kullanici').value = 'hoca';
      document.getElementById('hoca-giris-sifre').value = 'Demo!Hoca2026';
      document.getElementById('btn-hoca-giris-yap').click();
    });
    await bekle(650);
    await masaV2Sayfa.evaluate(() => {
      const kapat = document.getElementById('btn-modal-hoca-kapat');
      const m = document.getElementById('modal-hoca-giris');
      if (kapat && m && getComputedStyle(m).display !== 'none') kapat.click();
    });
    // Telefondan ham balonları tamamı Y / C olan bir okuma olayı gönder (modal KAPALI!)
    await httpHamIstek(port, 'POST', '/api/v2/sinav-senkron', {
      olaylar: [{
        eventId: 'EVT-MASA-LIVE-55',
        sinavKodu: 'GENEL',
        tur: 'OKUDU_GUNCELLE',
        kaynakCihaz: 'mobil',
        zamanMs: Date.now(),
        veri: {
          id: 'MOB-LIVE-55',
          ogrNo: '2026000055',
          adSoyad: 'Canlı Senkron Öğrencisi',
          grup: 'A',
          dySayisi: 10,
          testSayisi: 10,
          hamCevaplar: { dy: Array(10).fill('Y'), test: Array(10).fill('C'), klasikToplamPuan: 0 },
          dyDetay: Array.from({ length: 10 }, (_, i) => ({ soruNo: i + 1, verilen: 'Y', dogruCevap: 'D', sonuc: 'YANLIS' })),
          testDetay: Array.from({ length: 10 }, (_, i) => ({ soruNo: i + 1, verilen: 'C', dogruCevap: 'A', sonuc: 'YANLIS' })),
          toplamPuan: 0
        }
      }]
    }, { Authorization: `Bearer ${v2OmrTok}` });

    await masaV2Sayfa.evaluate(() => window.__masaustuV2SenkronSimdi());
    await bekle(250);
    await masaV2Sayfa.click('[data-sekme="sekme-omr"]');
    await bekle(200);
    const ilkTablo = await masaV2Sayfa.evaluate(() => document.getElementById('tablo-omr-okunanlar').textContent || '');

    // Masaüstünde "Kağıttan Anahtar Oku" ile A Grubu anahtarını tüm Y + C yap -> hamCevaplar üzerinden 100 puana çıkmalı!
    const geciciV2Png = path.join(KOK, '.gecici-v2-anahtar.png');
    fs.writeFileSync(geciciV2Png, Buffer.from(masterPngDataUrl.split(',')[1], 'base64'));
    const inpV2 = await masaV2Sayfa.$('#input-omr-ogretmen-kagit-foto');
    await inpV2.uploadFile(geciciV2Png);
    await bekle(550);
    try { fs.unlinkSync(geciciV2Png); } catch (_) {}

    const ikinciTabloVeV2 = await masaV2Sayfa.evaluate(() => {
      const depo = JSON.parse(localStorage.getItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2') || '{}');
      const kayit55 = (depo.okumaSonuclari || []).find((x) => x.ogrNo === '2026000055');
      return {
        tabloMetin: document.getElementById('tablo-omr-okunanlar').textContent || '',
        kayit55Puan: kayit55 ? Number(kayit55.toplamPuan) : -1
      };
    });
    const sunucuSonOlaylar = await httpHamIstek(port, 'GET', '/api/v2/sinav-senkron?sinceSeq=0', null, { Authorization: `Bearer ${v2Tok}` });
    const anahtarOlayiYayinlandiMi = Array.isArray(sunucuSonOlaylar.body && sunucuSonOlaylar.body.olaylar) &&
      sunucuSonOlaylar.body.olaylar.some((o) => o.tur === 'ANAHTAR_GUNCELLE' && o.kaynakCihaz === 'masaustu');
    await masaV2Sayfa.close();

    kontrol(
      '[42] #modal-ogrenci-qr kapalıyken V2 canlı senkron masaüstüne birleşir ve "Kağıttan Anahtar Oku" sonrası puanlama + V2 yayın çalışır',
      ilkTablo.includes('2026000055') &&
      ikinciTabloVeV2.kayit55Puan >= 99 &&
      anahtarOlayiYayinlandiMi &&
      masaV2Hatalar.length === 0,
      JSON.stringify({ puan: ikinciTabloVeV2.kayit55Puan, anahtarOlayiYayinlandiMi, masaV2Hatalar })
    );

    // [43] Parçalı Bulut Kasa V2 (parcali-v2): 6 Ders · 21.600 Soru Server + Worker Paritesi & HTTP 503 Önleme
    const parcaliYetkisiz1 = await httpHamIstek(port, 'POST', '/api/bulut-kasa/parca-kontrol', { parcaHashleri: ['KP2_1_00000000_00000000'] });
    const parcaliYetkisiz2 = await workerIstek(olusturSahteWorkerEnv(), 'POST', '/api/bulut-kasa/parca-oku', { parcaHashleri: ['KP2_1_00000000_00000000'] });
    const yirmiBirBinSoru = Array.from({ length: 21600 }, (_, i) => ({
      id: `S21K-${i + 1}`,
      dersId: `ders-p-${(i % 6) + 1}`,
      hafta: (i % 14) + 1,
      tur: i % 3 === 0 ? 'dy' : (i % 3 === 1 ? 'test' : 'klasik'),
      zorluk: i % 3 === 0 ? 'Kolay' : (i % 3 === 1 ? 'Orta' : 'Zor'),
      metin: `Güvenlik duvarı trafik denetimi 21K ölçek sorusu #${i + 1}`,
      secenekler: ['Seçenek A', 'Seçenek B', 'Seçenek C', 'Seçenek D', 'Seçenek E'],
      dogruCevap: 'A',
      ogrenimCiktisi: `ÖÇ-${(i % 4) + 1}`
    }));
    const altiDersMeta = {
      aktifDersId: 'ders-p-1',
      dersler: Array.from({ length: 6 }, (_, i) => ({
        id: `ders-p-${i + 1}`,
        kod: `DERS-${i + 1}`,
        ad: `Ölçek Dersi ${i + 1}`,
        ogrenciler: [{ ogrNo: String(25742001 + i), adSoyad: `Öğrenci ${i + 1}` }]
      })),
      ogrenciler: Array.from({ length: 6 }, (_, i) => ({ ogrNo: String(25742001 + i), adSoyad: `Öğrenci ${i + 1}` })),
      sorular: []
    };
    const dilimler21K = Cekirdek.bolSoruBankasiParcalara(yirmiBirBinSoru, 350, 260000);
    const hashler21K = dilimler21K.map((d) => d.parcaHash);
    const parcaYukleVeKaydet = async (istekFn) => {
      const k1 = await istekFn('POST', '/api/bulut-kasa/parca-kontrol', { parcaHashleri: hashler21K });
      if (k1.status !== 200 || !Array.isArray(k1.body.eksikHashler) || k1.body.eksikHashler.length !== hashler21K.length) {
        return { ok: false, asama: 'kontrol1', status: k1.status };
      }
      for (const d of dilimler21K) {
        const gzB64 = zlib.gzipSync(Buffer.from(d.jsonMetin, 'utf8')).toString('base64');
        const pRes = await istekFn('PUT', '/api/bulut-kasa/parca', {
          parcaHash: d.parcaHash,
          kodlama: 'gzip-b64',
          veriSikistirilmis: gzB64
        });
        if (pRes.status !== 200) return { ok: false, asama: 'parca-put', status: pRes.status };
      }
      const k2 = await istekFn('POST', '/api/bulut-kasa/parca-kontrol', { parcaHashleri: hashler21K });
      if (k2.status !== 200 || !Array.isArray(k2.body.eksikHashler) || k2.body.eksikHashler.length !== 0) {
        return { ok: false, asama: 'kontrol2', status: k2.status, eksik: k2.body && k2.body.eksikHashler && k2.body.eksikHashler.length };
      }
      const onceGet = await istekFn('GET', '/api/bulut-kasa?parcaliDestek=1');
      const bazRev = (onceGet.body && Number(onceGet.body.revizyonNo)) || undefined;
      const metaGz = zlib.gzipSync(Buffer.from(JSON.stringify(altiDersMeta), 'utf8')).toString('base64');
      const putAna = await istekFn('PUT', '/api/bulut-kasa', {
        kodlama: 'parcali-v2',
        veriSikistirilmis: metaGz,
        soruParcaHashleri: hashler21K,
        toplamSoruSayisi: 21600,
        bazRevizyonNo: bazRev,
        silmeOnayi: true,
        zorlaEz: true,
        islemNotu: '21.600 soru parcali-v2 testi'
      });
      if (putAna.status !== 200 || putAna.body.toplamSoruSayisi !== 21600) {
        return { ok: false, asama: 'put-ana', status: putAna.status, body: putAna.body };
      }
      const sonGet = await istekFn('GET', '/api/bulut-kasa?parcaliDestek=1');
      if (sonGet.status !== 200 || sonGet.body.kodlama !== 'parcali-v2' || sonGet.body.toplamSoruSayisi !== 21600) {
        return { ok: false, asama: 'get-parcali', status: sonGet.status };
      }
      const mobilPkg = await istekFn('GET', '/api/mobil-ders-paketleri');
      if (mobilPkg.status !== 200 || !Array.isArray(mobilPkg.body.dersler) || mobilPkg.body.dersler.length !== 6) {
        return { ok: false, asama: 'mobil-pkg', status: mobilPkg.status, dersAdet: mobilPkg.body && mobilPkg.body.dersler && mobilPkg.body.dersler.length };
      }
      let okunanToplam = 0;
      for (let i = 0; i < hashler21K.length; i += 16) {
        const grup = hashler21K.slice(i, i + 16);
        const rOku = await istekFn('POST', '/api/bulut-kasa/parca-oku', { parcaHashleri: grup });
        if (rOku.status !== 200 || !Array.isArray(rOku.body.parcalar)) return { ok: false, asama: 'parca-oku', status: rOku.status };
        for (const p of rOku.body.parcalar) {
          const acik = JSON.parse(zlib.gunzipSync(Buffer.from(p.veriSikistirilmis, 'base64')).toString('utf8'));
          okunanToplam += Array.isArray(acik) ? acik.length : 0;
        }
      }
      return { ok: okunanToplam === 21600, okunanToplam, parcaAdet: hashler21K.length };
    };

    const srvParcaSonuc = await parcaYukleVeKaydet((m, u, b) =>
      httpHamIstek(port, m, u, b, { Authorization: `Bearer ${v2Tok}` })
    );
    const wParcaEnv = olusturSahteWorkerEnv();
    const wParcaGiris = await workerIstek(wParcaEnv, 'POST', '/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
    const wParcaTok = wParcaGiris.body && wParcaGiris.body.token;
    const wrkParcaSonuc = await parcaYukleVeKaydet((m, u, b) =>
      workerIstek(wParcaEnv, m, u, b, { Authorization: `Bearer ${wParcaTok}` })
    );
    kontrol(
      '[43] Parçalı Bulut Kasa V2 (parcali-v2): 6 ders · 21.600 soru hem server.js hem worker.js üzerinde 0 adet 503 ile kayıpsız aktarılır ve yetkisiz istekleri 401 reddeder',
      parcaliYetkisiz1.status === 401 &&
        parcaliYetkisiz2.status === 401 &&
        srvParcaSonuc.ok &&
        wrkParcaSonuc.ok,
      JSON.stringify({ s: srvParcaSonuc, w: wrkParcaSonuc })
    );

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
