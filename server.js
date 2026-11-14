/* ==========================================================================
   EVRENSEL SINAV KAĞIDI STÜDYOSU & MOBİL OMR — ZERO-TRUST SUNUCU (server.js)
   İstemciye Sıfır Güven (Zero-Trust Client), Sunucu Otoriteli Sınav & OMR API
   ========================================================================== */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const Cekirdek = require('./guvenlik-ve-veri.js');

const PORT = Number(process.env.PORT) || 3000;
const KOK_DIZIN = __dirname;

const GUVENLIK_BASLIKLARI = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob: mediastream:; worker-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
};

function hazirlaHashliHocaKaydi(kayit) {
  const kopya = Object.assign({}, kayit);
  if (!kopya.sifreHash && typeof kopya.sifre === 'string' && kopya.sifre.length > 0) {
    kopya.sifreHash = Cekirdek.uretSifreHashSync(kopya.sifre);
  }
  delete kopya.sifre;
  delete kopya.sifreTekrar;
  return kopya;
}

/* Sunucu Yetkili Durumu (Server Authority State) */
const sunucuDurumu = {
  aktifSinav: {
    sinavId: 'SINAV-2026-GUZ',
    sinavSurumId: 'SURUM-BASLANGIC-1',
    aktif: true,
    sureDk: 40,
    sorular: Cekirdek.VARSAYILAN_SORULAR.slice(0, 10)
  },
  kayitliOgrenciler: new Map(
    Cekirdek.VARSAYILAN_OGRENCILER.map((o) => [o.ogrNo, o])
  ),
  hocaHesap: hazirlaHashliHocaKaydi(Cekirdek.VARSAYILAN_HOCA_HESAP),
  hocaListesi: [
    hazirlaHashliHocaKaydi(Object.assign({}, Cekirdek.VARSAYILAN_HOCA_HESAP, {
      rol: 'yonetici',
      durum: 'aktif',
      kayitTarihi: '2026-09-01'
    }))
  ],
  davetKodu: Cekirdek.VARSAYILAN_DAVET_KODU,
  omrImzaSirri: crypto.randomBytes(32).toString('hex'),
  omrTokenlar: new Map(),
  hizSinirlari: new Map(),
  aktifHocaTokenlar: new Set(),
  aktifHocaOturumlari: new Map(), // hocaToken -> { kullaniciAdi, adSoyad, rol }
  aktifTokenlar: new Map(), // token -> { ogrNo, adSoyad, kurtarmaAnahtariHash, bitisMs, cevaplar, bitti }
  kioskDelilLoglari: [],
  omrSonuclari: [],
  mobilSinavPaketleri: new Map(), // `${kullaniciAdi}::${sinavKodu}` -> paket
  omrSenkronOlaylari: [],
  omrSenkronEventIdSet: new Set(),
  omrSenkronSeqSayac: 0,
  bulutKasalar: new Map(),
  bulutYedekGecmisi: new Map(),
  bulutKasaSoruParcalari: new Map(),
  ogrenciHesaplari: {}, // ogrNo -> { durum, eposta, telefon, sifreHash, kodOzeti, kodAmac, kodBitisMs, kodDeneme }
  ogrenciGirisTokenlari: new Map(), // token -> { ogrNo, bitisMs }
  ogrenciBekleyenKodlar: [] // E-posta servisi yokken (geçiş modu) öğretmenin göreceği kodlar
};

/* Öğrenci hesabı zorunluluğu: canlıda açık. Eski uçtan uca testler SINAV_OGRENCI_HESAP_ZORUNLU=0 ile eski akışı kullanır. */
function ogrenciHesabiZorunluMu() {
  return process.env.SINAV_OGRENCI_HESAP_ZORUNLU !== '0';
}

function epostaServisiHazirMi() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EPOSTA_GONDEREN);
}

/* Doğrulama e-postası: Resend uyumlu API. Servis yapılandırılmamışsa kod öğretmen paneline düşer (geçiş modu). */
async function gonderOgrenciEpostasi(ep) {
  if (!ep) return { gonderildi: false };
  if (!epostaServisiHazirMi()) {
    sunucuDurumu.ogrenciBekleyenKodlar.unshift({
      ogrNo: ep.ogrNo, kod: ep.kod, amac: ep.amac, epostaMaske: Cekirdek.maskeleEposta(ep.kime), zamanMs: Date.now()
    });
    sunucuDurumu.ogrenciBekleyenKodlar = sunucuDurumu.ogrenciBekleyenKodlar.slice(0, 200);
    return { gonderildi: false, gecisModu: true };
  }
  try {
    const yanit = await fetch(process.env.EPOSTA_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EPOSTA_GONDEREN, to: [ep.kime], subject: ep.konu, text: ep.metin })
    });
    return { gonderildi: yanit.ok, hataKodu: yanit.ok ? 0 : yanit.status };
  } catch (_) {
    return { gonderildi: false, hataKodu: 503 };
  }
}

function ogrenciGirisTokenDogrula(token, ogrNo) {
  const kayit = token ? sunucuDurumu.ogrenciGirisTokenlari.get(String(token)) : null;
  if (!kayit) return false;
  if (Date.now() > kayit.bitisMs) {
    sunucuDurumu.ogrenciGirisTokenlari.delete(String(token));
    return false;
  }
  return String(kayit.ogrNo) === String(ogrNo);
}

const YEREL_KASA_DOSYASI = path.join(KOK_DIZIN, '.yerel-bulut-kasa.json');
const DISK_KALICILIK_AKTIF = require.main === module || process.env.SINAV_YEREL_KASA_AKTIF === '1';

function hesaplaKasaOzeti(veri) {
  if (!veri || typeof veri !== 'object') return { ders: 0, soru: 0, ogrenci: 0, sinav: 0, okuma: 0, metin: '0 ders' };
  const ders = Array.isArray(veri.dersler) ? veri.dersler.length : 0;
  const soru = Array.isArray(veri.sorular) ? veri.sorular.length : 0;
  const ogrenci = Array.isArray(veri.ogrenciKayitlari)
    ? veri.ogrenciKayitlari.length
    : (Array.isArray(veri.ogrenciler) ? veri.ogrenciler.length : 0);
  const sinav = Array.isArray(veri.kayitliSinavlar) ? veri.kayitliSinavlar.length : 0;
  let okuma = Array.isArray(veri.okumaSonuclari) ? veri.okumaSonuclari.length : 0;
  if (veri.okumaSonuclariHaritasi && typeof veri.okumaSonuclariHaritasi === 'object') {
    const toplamHarita = Object.values(veri.okumaSonuclariHaritasi)
      .reduce((t, d) => t + (Array.isArray(d) ? d.length : 0), 0);
    if (toplamHarita > okuma) okuma = toplamHarita;
  }
  return {
    ders,
    soru,
    ogrenci,
    sinav,
    okuma,
    metin: `${ders} ders · ${soru} soru · ${ogrenci} öğrenci · ${sinav} sınav`
  };
}

function yukleYerelDiskKasasi() {
  if (!DISK_KALICILIK_AKTIF) return;
  try {
    if (!fs.existsSync(YEREL_KASA_DOSYASI)) return;
    const ham = fs.readFileSync(YEREL_KASA_DOSYASI, 'utf8');
    const parsed = JSON.parse(ham);
    if (parsed && Array.isArray(parsed.kasalar)) {
      sunucuDurumu.bulutKasalar = new Map(parsed.kasalar);
    }
    if (parsed && Array.isArray(parsed.gecmis)) {
      sunucuDurumu.bulutYedekGecmisi = new Map(parsed.gecmis);
    }
    if (parsed && Array.isArray(parsed.soruParcalari)) {
      sunucuDurumu.bulutKasaSoruParcalari = new Map(parsed.soruParcalari);
    }
  } catch (_) {}
}

function kaydetYerelDiskKasasi() {
  if (!DISK_KALICILIK_AKTIF) return;
  try {
    const gecici = `${YEREL_KASA_DOSYASI}.tmp`;
    fs.writeFileSync(
      gecici,
      JSON.stringify({
        kasalar: Array.from(sunucuDurumu.bulutKasalar.entries()),
        gecmis: Array.from(sunucuDurumu.bulutYedekGecmisi.entries()),
        soruParcalari: Array.from(sunucuDurumu.bulutKasaSoruParcalari.entries()),
        kayitMs: Date.now()
      }),
      'utf8'
    );
    fs.renameSync(gecici, YEREL_KASA_DOSYASI);
  } catch (_) {}
}

yukleYerelDiskKasasi();

function cozHocaTokenIstekten(req, govde = null, urlNesne = null) {
  const auth = String(req.headers.authorization || '').trim();
  if (auth.toLowerCase().startsWith('bearer ')) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  if (govde && typeof govde.token === 'string' && govde.token.trim()) {
    return govde.token.trim();
  }
  if (urlNesne && urlNesne.searchParams && urlNesne.searchParams.get('token')) {
    return urlNesne.searchParams.get('token').trim();
  }
  return '';
}

function hocaListesiGuvenliOzet(liste) {
  return (Array.isArray(liste) ? liste : []).map((h) => ({
    kullaniciAdi: h.kullaniciAdi,
    adSoyad: h.adSoyad,
    eposta: h.eposta,
    telefon: h.telefon || '',
    rol: h.rol || (String(h.kullaniciAdi).toLowerCase() === 'hoca' ? 'yonetici' : 'hoca'),
    durum: h.durum || 'aktif',
    kayitTarihi: h.kayitTarihi || ''
  }));
}

/* Öğrenci İstemcisinden Asla Kabul Edilmeyecek Yasaklı Alanlar (Zero-Trust) */
const YASAKLI_ISTEMCI_ALANLARI = [
  'kagit',
  'sorular',
  'puan',
  'dogruHarf',
  'dogruCevap',
  'sinavId',
  'bitisMs'
];

function kontrolZeroTrustYuk(govde, baslangicMi = false) {
  if (!govde || typeof govde !== 'object' || Array.isArray(govde)) {
    return 'Geçersiz JSON gövdesi.';
  }
  for (const alan of YASAKLI_ISTEMCI_ALANLARI) {
    if (Object.prototype.hasOwnProperty.call(govde, alan)) {
      return `Zero-Trust İhlali: İstemci '${alan}' alanını gönderemez; sunucu otoritesi üretir.`;
    }
  }
  if (baslangicMi && govde.bitti === true) {
    return 'Zero-Trust İhlali: Oturum başlangıcında bitti:true gönderilemez.';
  }
  return null;
}

function okuJsonGovde(req, maksBayt = 131072) {
  return new Promise((resolve, reject) => {
    let toplam = 0;
    const parcalar = [];
    req.on('data', (chunk) => {
      toplam += chunk.length;
      if (toplam > maksBayt) {
        req.destroy();
        reject(new Error('İstek boyutu sınırı aşıldı'));
        return;
      }
      parcalar.push(chunk);
    });
    req.on('end', () => {
      try {
        const ham = Buffer.concat(parcalar).toString('utf8');
        const nesne = ham ? JSON.parse(ham) : {};
        const temiz = Cekirdek.derinTemizleNesne(nesne, 0);
        resolve(temiz);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function gonderJson(res, kod, veri, ekBasliklar = null) {
  const govde = JSON.stringify(veri);
  res.writeHead(kod, Object.assign({}, GUVENLIK_BASLIKLARI, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }, ekBasliklar || {}));
  res.end(govde);
}

function istemciIpAl(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String((req.socket && req.socket.remoteAddress) || '127.0.0.1');
}

function kontrolHizSiniri(anahtar, maksDeneme = 8, pencereMs = 15 * 60 * 1000) {
  const simdi = Date.now();
  const mevcut = sunucuDurumu.hizSinirlari.get(anahtar);
  if (!mevcut || (simdi - mevcut.pencereBaslangicMs) >= pencereMs) {
    sunucuDurumu.hizSinirlari.set(anahtar, { sayac: 1, pencereBaslangicMs: simdi });
    return { izinli: true, kalan: maksDeneme - 1, tekrarSn: 0 };
  }
  if (mevcut.sayac >= maksDeneme) {
    const kalanMs = Math.max(1000, pencereMs - (simdi - mevcut.pencereBaslangicMs));
    return { izinli: false, kalan: 0, tekrarSn: Math.ceil(kalanMs / 1000) };
  }
  mevcut.sayac += 1;
  return { izinli: true, kalan: maksDeneme - mevcut.sayac, tekrarSn: 0 };
}

/* Yalnız HATALI denemeleri sayan sınır (giriş / doğrulama kodu): sayaç artırmadan durumu okur */
function hizSiniriDurumu(anahtar, maksDeneme = 8, pencereMs = 15 * 60 * 1000) {
  const simdi = Date.now();
  const mevcut = sunucuDurumu.hizSinirlari.get(anahtar);
  if (!mevcut || (simdi - mevcut.pencereBaslangicMs) >= pencereMs) return { asildi: false, tekrarSn: 0 };
  if (mevcut.sayac >= maksDeneme) {
    return { asildi: true, tekrarSn: Math.ceil(Math.max(1000, pencereMs - (simdi - mevcut.pencereBaslangicMs)) / 1000) };
  }
  return { asildi: false, tekrarSn: 0 };
}

function hizSiniriSifirla(anahtar) {
  sunucuDurumu.hizSinirlari.delete(anahtar);
}

function b64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlDecode(str) {
  let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  return Buffer.from(s, 'base64');
}

function uretOmrEslesmeToken(oturum, oturumKodu = 'GENEL', sureDk = 15) {
  const tid = crypto.randomBytes(12).toString('hex');
  const iat = Date.now();
  const gecerlilikSn = Math.max(300, Math.min(43200, (parseInt(sureDk, 10) || 15) * 60));
  const bitisMs = iat + gecerlilikSn * 1000;
  const kod = String(oturumKodu || 'GENEL').trim().toUpperCase() || 'GENEL';
  const payload = { tid, k: oturum.kullaniciAdi, o: kod, iat, exp: bitisMs };
  const payloadB64 = b64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const imza = crypto.createHmac('sha256', sunucuDurumu.omrImzaSirri).update(payloadB64).digest();
  const token = `OMRT1.${payloadB64}.${b64UrlEncode(imza)}`;
  sunucuDurumu.omrTokenlar.set(tid, { kullaniciAdi: oturum.kullaniciAdi, oturumKodu: kod, bitisMs, iptal: false });
  return { token, tid, oturumKodu: kod, bitisMs, gecerlilikSn };
}

function dogrulaOmrVeyaHocaToken(token, hedefOturumKodu = '') {
  if (!token) return null;
  if (sunucuDurumu.aktifHocaTokenlar.has(token)) {
    return { tur: 'hoca', oturum: sunucuDurumu.aktifHocaOturumlari.get(token) };
  }
  if (!token.startsWith('OMRT1.')) return null;
  const parcalar = token.split('.');
  if (parcalar.length !== 3) return null;
  try {
    const beklenen = crypto.createHmac('sha256', sunucuDurumu.omrImzaSirri).update(parcalar[1]).digest();
    const gelen = b64UrlDecode(parcalar[2]);
    if (beklenen.length !== gelen.length || !crypto.timingSafeEqual(beklenen, gelen)) return null;
    const payload = JSON.parse(b64UrlDecode(parcalar[1]).toString('utf8'));
    if (!payload || !payload.tid || !payload.exp || Date.now() >= Number(payload.exp)) return null;
    const kayit = sunucuDurumu.omrTokenlar.get(payload.tid);
    if (kayit && kayit.iptal) return null;
    const hedefKod = String(hedefOturumKodu || '').trim().toUpperCase();
    if (payload.o && payload.o !== 'GENEL' && hedefKod && payload.o !== hedefKod) return null;
    return { tur: 'omr_eslesme', kullaniciAdi: payload.k, oturumKodu: payload.o, tid: payload.tid };
  } catch (_) {
    return null;
  }
}

function cozGzipB64HamMetin(b64Metin, maksBayt = 16777216) {
  const tampon = Buffer.from(String(b64Metin || '').trim(), 'base64');
  if (tampon.length > maksBayt) {
    throw new Error('Sıkıştırılmış veri boyutu sınırı aşıldı');
  }
  const acilmis = zlib.gunzipSync(tampon, { maxOutputLength: maksBayt });
  return acilmis.toString('utf8');
}

function cozGzipB64Json(b64Metin) {
  const metin = cozGzipB64HamMetin(b64Metin, 16777216);
  const nesne = JSON.parse(metin);
  return Cekirdek.derinTemizleNesne(nesne, 0);
}

function paketleGzipB64Json(nesne) {
  const jsonBuf = Buffer.from(JSON.stringify(nesne), 'utf8');
  const sikis = zlib.gzipSync(jsonBuf);
  return sikis.toString('base64');
}

function sorgulaSoruParcalariBellek(kullaniciAdi, parcaHashleri, veriDahil = false) {
  const mevcutHarita = new Map();
  const eksikHashler = [];
  let toplamSoruSayisi = 0;
  for (const h of (Array.isArray(parcaHashleri) ? parcaHashleri : [])) {
    const s = String(h || '').trim();
    if (!s || s.length > 128) continue;
    const kayit = sunucuDurumu.bulutKasaSoruParcalari.get(`${kullaniciAdi}::${s}`);
    if (!kayit) {
      eksikHashler.push(s);
    } else {
      toplamSoruSayisi += Number(kayit.soruSayisi) || 0;
      if (!mevcutHarita.has(s)) {
        mevcutHarita.set(s, {
          parcaHash: s,
          soruSayisi: Number(kayit.soruSayisi) || 0,
          veriSikistirilmis: veriDahil ? String(kayit.veriSikistirilmis || '') : ''
        });
      }
    }
  }
  return { mevcutHarita, eksikHashler, toplamSoruSayisi };
}

function birlestirParcaliKasaSorulariBellek(kullaniciAdi, metaObj, parcaHashleri) {
  const temizMeta = Cekirdek.temizleYedekHassasAlanlar(JSON.parse(JSON.stringify(metaObj || {})));
  const hashListe = Array.isArray(parcaHashleri) ? parcaHashleri : [];
  if (!hashListe.length) {
    temizMeta.sorular = Array.isArray(temizMeta.sorular) ? temizMeta.sorular : [];
    return temizMeta;
  }
  const { mevcutHarita } = sorgulaSoruParcalariBellek(kullaniciAdi, hashListe, true);
  const cozumlenenler = new Map();
  for (const [h, kayit] of mevcutHarita.entries()) {
    if (!kayit || !kayit.veriSikistirilmis) continue;
    const metin = cozGzipB64HamMetin(kayit.veriSikistirilmis, 16777216);
    const parsed = JSON.parse(metin);
    cozumlenenler.set(h, Array.isArray(parsed) ? parsed : []);
  }
  const sorular = [];
  for (const h of hashListe) {
    const dilim = cozumlenenler.get(String(h || '').trim());
    if (Array.isArray(dilim)) {
      for (let i = 0; i < dilim.length; i++) sorular.push(dilim[i]);
    }
  }
  temizMeta.sorular = sorular;
  return temizMeta;
}

const MIME_TIPLERI = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function istekIsleyici(req, res) {
  const urlNesne = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const yol = urlNesne.pathname;

  // Tarayıcı simge isteği (404 gürültüsünü önler)
  if (req.method === 'GET' && yol === '/favicon.ico') {
    res.writeHead(204, { 'Cache-Control': 'max-age=86400' });
    res.end();
    return;
  }

  // 0a. Telefon QR'ı için yerel ağ adresi (yalnızca IP/port döner; hassas veri yok)
  if (req.method === 'GET' && yol === '/cdn-cgi/trace') {
    const ipler = yerelAgAdresleri();
    const ip = (ipler && ipler[0]) || '127.0.0.1';
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`ip=${ip}\nloc=TR\ncolo=LOCAL\nwarp=off\n`);
    return;
  }

  if (req.method === 'GET' && yol === '/api/ag-adresi') {
    const ipler = yerelAgAdresleri();
    const port = req.socket.localPort;
    return gonderJson(res, 200, { adresler: ipler.map((ip) => `http://${ip}:${port}`) });
  }

  // 0a-QR. Telefondan -> Bilgisayara Öğrenci Listesi QR / Ağ Senkronizasyon Köprüsü (Öğretmen Oturumu Zorunlu)
  if (yol === '/api/ogrenci-qr-senkron') {
    if (!sunucuDurumu.ogrenciQrKuyrugu) {
      sunucuDurumu.ogrenciQrKuyrugu = new Map();
    }
    if (req.method === 'POST') {
      okuJsonGovde(req, 524288)
        .then((govde) => {
          const oturumKodu = String((govde && govde.oturumKodu) || 'GENEL').trim().toUpperCase() || 'GENEL';
          const hocaToken = cozHocaTokenIstekten(req, govde, urlNesne);
          if (!dogrulaOmrVeyaHocaToken(hocaToken, oturumKodu)) {
            return gonderJson(res, 401, { hata: 'Öğrenci listesi QR senkronizasyonu için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
          }
          let ogrenciler = [];
          if (Array.isArray(govde && govde.ogrenciler)) {
            ogrenciler = govde.ogrenciler
              .filter((o) => o && String(o.ogrNo || '').trim() && String(o.adSoyad || '').trim())
              .map((o) => ({
                ogrNo: String(o.ogrNo).trim(),
                adSoyad: String(o.adSoyad).trim(),
                bolum: String(o.bolum || 'Genel').trim()
              }));
          } else if (govde && govde.paket) {
            const cozum = Cekirdek.cozOgrenciQrPaketi(String(govde.paket));
            if (cozum.gecerli) ogrenciler = cozum.ogrenciler;
          }
          if (ogrenciler.length === 0) {
            return gonderJson(res, 400, { hata: 'Aktarılacak geçerli öğrenci listesi bulunamadı.' });
          }
          const kayit = {
            oturumKodu,
            ogrenciler,
            ogrenciSayisi: ogrenciler.length,
            zamanMs: Date.now()
          };
          sunucuDurumu.ogrenciQrKuyrugu.set(oturumKodu, kayit);
          ogrenciler.forEach((o) => {
            sunucuDurumu.kayitliOgrenciler.set(o.ogrNo, o);
          });
          return gonderJson(res, 200, {
            basarili: true,
            oturumKodu,
            aktarilanSayi: ogrenciler.length,
            adet: ogrenciler.length
          });
        })
        .catch((err) => gonderJson(res, 400, { hata: err.message }));
      return;
    }
    if (req.method === 'GET') {
      const oturumKodu = String(urlNesne.searchParams.get('oturumKodu') || urlNesne.searchParams.get('oturum') || 'GENEL').trim().toUpperCase() || 'GENEL';
      const hocaToken = cozHocaTokenIstekten(req, null, urlNesne);
      if (!dogrulaOmrVeyaHocaToken(hocaToken, oturumKodu)) {
        return gonderJson(res, 401, { hata: 'Öğrenci listesi QR kuyruğunu okumak için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
      }
      const tuket = urlNesne.searchParams.get('tuket') === '1';
      const kayit = sunucuDurumu.ogrenciQrKuyrugu.get(oturumKodu) || null;
      if (kayit && tuket) {
        sunucuDurumu.ogrenciQrKuyrugu.delete(oturumKodu);
      }
      const varMi = Boolean(kayit && Array.isArray(kayit.ogrenciler) && kayit.ogrenciler.length > 0);
      return gonderJson(res, 200, {
        varMi,
        bulundu: varMi,
        oturumKodu,
        ogrenciler: kayit ? kayit.ogrenciler : [],
        zamanMs: kayit ? kayit.zamanMs : 0
      });
    }
  }

  // 0a-OMR. Telefondan -> Bilgisayara Optik Okuma Sonuçları (OMR) Canlı Senkronizasyon Köprüsü (Öğretmen Yetkisi Zorunlu)
  if (yol === '/api/omr-sonuc-senkron') {
    if (!sunucuDurumu.omrSonucKuyrugu) {
      sunucuDurumu.omrSonucKuyrugu = new Map();
    }
    if (req.method === 'POST') {
      okuJsonGovde(req, 524288)
        .then((govde) => {
          const oturumKodu = String((govde && govde.oturumKodu) || 'GENEL').trim().toUpperCase() || 'GENEL';
          const hocaToken = cozHocaTokenIstekten(req, govde, urlNesne);
          if (!dogrulaOmrVeyaHocaToken(hocaToken, oturumKodu)) {
            return gonderJson(res, 401, { hata: 'OMR okuma sonucu senkronizasyonu için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
          }
          const omrSinirlar = {};
          if (sunucuDurumu.kayitliOgrenciler && sunucuDurumu.kayitliOgrenciler.size > 0) {
            omrSinirlar.ogrenciler = Array.from(sunucuDurumu.kayitliOgrenciler.values());
          }
          if (sunucuDurumu.aktifSinav && sunucuDurumu.aktifSinav.sinavId) {
            omrSinirlar.aktifSinavId = String(sunucuDurumu.aktifSinav.sinavId);
            if (sunucuDurumu.aktifSinav.sinavSurumId) {
              omrSinirlar.aktifSinavSurumId = String(sunucuDurumu.aktifSinav.sinavSurumId);
            }
            if (Array.isArray(sunucuDurumu.aktifSinav.sorular) && sunucuDurumu.aktifSinav.sorular.length > 0) {
              omrSinirlar.aktifSinavLimitleri = {
                azamiDy: Math.max(1, sunucuDurumu.aktifSinav.sorular.filter((q) => q.tur === 'dy').length || 50),
                azamiTest: Math.max(1, sunucuDurumu.aktifSinav.sorular.filter((q) => q.tur === 'test').length || 200),
                azamiKlasik: Math.max(1, sunucuDurumu.aktifSinav.sorular.filter((q) => q.tur === 'klasik').length || 25)
              };
            }
          }
          const cozum = Cekirdek.cozOmrSonucPaketi(govde, omrSinirlar);
          const okunanListe = cozum.okumaSonuclari || cozum.sonuclar || [];
          if (cozum.surumUyusmazligi) {
            return gonderJson(res, 409, { hata: cozum.hata });
          }
          if (!cozum.gecerli || okunanListe.length === 0) {
            return gonderJson(res, 400, { hata: cozum.hata || 'Aktarılacak geçerli OMR okuma sonucu bulunamadı.' });
          }
          const kayit = {
            oturumKodu,
            sonuclar: okunanListe,
            okumaSonuclari: okunanListe,
            adet: okunanListe.length,
            zamanMs: Date.now()
          };
          sunucuDurumu.omrSonucKuyrugu.set(oturumKodu, kayit);
          sunucuDurumu.omrSonuclari = okunanListe;
          return gonderJson(res, 200, {
            basarili: true,
            oturumKodu,
            aktarilanSayi: okunanListe.length,
            kayitSayisi: okunanListe.length,
            adet: okunanListe.length,
            kimlikBekleyenSayisi: okunanListe.filter((x) => x.kimlikEslesmeBekliyor).length
          });
        })
        .catch((err) => gonderJson(res, 400, { hata: err.message }));
      return;
    }
    if (req.method === 'GET') {
      const oturumKodu = String(urlNesne.searchParams.get('oturumKodu') || urlNesne.searchParams.get('oturum') || urlNesne.searchParams.get('kod') || 'GENEL').trim().toUpperCase() || 'GENEL';
      const hocaToken = cozHocaTokenIstekten(req, null, urlNesne);
      if (!dogrulaOmrVeyaHocaToken(hocaToken, oturumKodu)) {
        return gonderJson(res, 401, { hata: 'OMR sonuç kuyruğunu okumak için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
      }
      const tuket = urlNesne.searchParams.get('tuket') === '1';
      const kayit = sunucuDurumu.omrSonucKuyrugu.get(oturumKodu) || null;
      if (kayit && tuket) {
        sunucuDurumu.omrSonucKuyrugu.delete(oturumKodu);
      }
      const sonuclarList = kayit && Array.isArray(kayit.sonuclar) ? kayit.sonuclar : [];
      const varMi = sonuclarList.length > 0;
      return gonderJson(res, 200, {
        varMi,
        bulundu: varMi,
        oturumKodu,
        kayitSayisi: sonuclarList.length,
        adet: sonuclarList.length,
        sonuclar: sonuclarList,
        okumaSonuclari: sonuclarList,
        zamanMs: kayit ? kayit.zamanMs : 0
      });
    }
  }

  // 0. Öğretmen / Öğretim Elemanı (Hoca) Kullanıcı Adı & Şifre Giriş Doğrulaması
  if (req.method === 'POST' && yol === '/api/hoca-giris') {
    okuJsonGovde(req)
      .then(async (govde) => {
        const havuz = Array.isArray(sunucuDurumu.hocaListesi) && sunucuDurumu.hocaListesi.length > 0
          ? sunucuDurumu.hocaListesi
          : [sunucuDurumu.hocaHesap];
        // Kaba kuvvet koruması: aynı IP + kullanıcı adı için 15 dakikada 8 hatalı denemeden sonra bekletilir
        const sinirAnahtar = `hoca-giris-hata:${istemciIpAl(req)}:${String(govde.kullaniciAdi || '').trim().toLowerCase()}`;
        const sinir = hizSiniriDurumu(sinirAnahtar, 8);
        if (sinir.asildi) {
          return gonderJson(res, 429, { hata: `Çok fazla hatalı giriş denemesi. ${Math.ceil(sinir.tekrarSn / 60)} dakika sonra tekrar deneyin.` }, { 'Retry-After': String(sinir.tekrarSn) });
        }
        const sonuc = await Cekirdek.dogrulaHocaGirisAsync(govde.kullaniciAdi, govde.sifre, havuz);
        if (!sonuc.basarili) {
          if (sonuc.kod === 401) kontrolHizSiniri(sinirAnahtar, 8);
          return gonderJson(res, sonuc.kod, { hata: sonuc.hata, durum: sonuc.durum || 'reddedildi' });
        }
        hizSiniriSifirla(sinirAnahtar);
        const hocaToken = crypto.randomBytes(24).toString('hex');
        sunucuDurumu.aktifHocaTokenlar.add(hocaToken);
        sunucuDurumu.aktifHocaOturumlari.set(hocaToken, {
          kullaniciAdi: sonuc.kullaniciAdi,
          adSoyad: sonuc.adSoyad,
          rol: sonuc.rol || 'hoca'
        });
        return gonderJson(res, 200, {
          token: hocaToken,
          kullaniciAdi: sonuc.kullaniciAdi,
          adSoyad: sonuc.adSoyad,
          eposta: sonuc.eposta,
          rol: sonuc.rol || 'hoca',
          durum: sonuc.durum || 'aktif'
        });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 0a-1b. Öğretmen Oturumu Kapatma / Token İptali
  if (req.method === 'POST' && yol === '/api/hoca-cikis') {
    okuJsonGovde(req)
      .then((govde) => {
        const token = cozHocaTokenIstekten(req, govde, urlNesne);
        if (!token || !sunucuDurumu.aktifHocaTokenlar.has(token)) {
          return gonderJson(res, 401, { hata: 'İptal edilecek geçerli öğretmen oturumu bulunamadı (401 Unauthorized).' });
        }
        const oturum = sunucuDurumu.aktifHocaOturumlari.get(token);
        sunucuDurumu.aktifHocaTokenlar.delete(token);
        sunucuDurumu.aktifHocaOturumlari.delete(token);
        if (oturum && oturum.kullaniciAdi) {
          for (const [, omrKayit] of sunucuDurumu.omrTokenlar.entries()) {
            if (String(omrKayit.kullaniciAdi).toLowerCase() === String(oturum.kullaniciAdi).toLowerCase()) {
              omrKayit.iptal = true;
            }
          }
        }
        return gonderJson(res, 200, { basarili: true, cikisYapildi: true });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 0a-1c. Kısa Ömürlü İmzalı Mobil OMR Eşleştirme Tokenı Üretimi (Ana hoca sırrını/oturumunu sızdırmaz)
  if ((req.method === 'POST' || req.method === 'GET') && yol === '/api/omr-eslesme-token') {
    const yanitla = (govde) => {
      const hocaToken = cozHocaTokenIstekten(req, govde, urlNesne);
      const oturum = hocaToken ? sunucuDurumu.aktifHocaOturumlari.get(hocaToken) : null;
      if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken) || !oturum) {
        return gonderJson(res, 401, { hata: 'OMR eşleştirme tokenı üretmek için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
      }
      const oturumKodu = (govde && govde.oturumKodu) || urlNesne.searchParams.get('oturumKodu') || urlNesne.searchParams.get('oturum') || 'GENEL';
      const sureDk = (govde && govde.sureDk) || urlNesne.searchParams.get('sureDk') || 15;
      const uretilen = uretOmrEslesmeToken(oturum, oturumKodu, sureDk);
      return gonderJson(res, 200, {
        basarili: true,
        token: uretilen.token,
        omrToken: uretilen.token,
        tokenTuru: 'omr_eslesme',
        oturumKodu: uretilen.oturumKodu,
        kullaniciAdi: oturum.kullaniciAdi,
        bitisMs: uretilen.bitisMs,
        gecerlilikSn: uretilen.gecerlilikSn
      });
    };
    if (req.method === 'POST') {
      okuJsonGovde(req).then(yanitla).catch((err) => gonderJson(res, 400, { hata: err.message }));
    } else {
      yanitla(null);
    }
    return;
  }

  // 0a-1d. Mobil OMR için Ders Bazlı Hafif Paketler (Öğretmen veya OMR Eşleşme Tokenı ile)
  if (req.method === 'GET' && yol === '/api/mobil-ders-paketleri') {
    const token = cozHocaTokenIstekten(req, null, urlNesne);
    const yetki = dogrulaOmrVeyaHocaToken(token, '');
    if (!yetki) {
      return gonderJson(res, 401, { hata: 'Ders ve öğrenci listelerini çekmek için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
    }
    const kullaniciAdi = String((yetki.oturum && yetki.oturum.kullaniciAdi) || yetki.kullaniciAdi || 'hoca').trim().toLowerCase() || 'hoca';
    const mevcut = sunucuDurumu.bulutKasalar.get(kullaniciAdi) || null;
    const hamKasaKaynak = mevcut
      ? (mevcut.parcaliV2 ? (mevcut.parcaliV2.meta || {}) : (mevcut.veri || {}))
      : {};
    const temizVeri = mevcut ? Cekirdek.temizleYedekHassasAlanlar(JSON.parse(JSON.stringify(hamKasaKaynak))) : {};
    const dersler = Cekirdek.uretMobilDersPaketleriOzeti(temizVeri);
    const kasaGuncellemeMs = Number(mevcut && mevcut.guncellemeMs) || 0;
    const birlesikHarita = new Map();
    dersler.forEach((d, idx) => {
      const k = String(d.dersId || d.id || d.sinavKodu || `D_${idx}`).trim();
      birlesikHarita.set(k, Object.assign({}, d));
    });
    for (const [anahtar, pkg] of sunucuDurumu.mobilSinavPaketleri.entries()) {
      if (!anahtar.startsWith(`${kullaniciAdi}::`)) continue;
      if (kasaGuncellemeMs > 0 && (Number(pkg && pkg.guncellemeMs) || 0) <= kasaGuncellemeMs) continue;
      const paketId = String(pkg.dersId || pkg.id || '').trim();
      const paketKod = String(pkg.sinavKodu || '').trim();
      let eslesenAnahtar = paketId && birlesikHarita.has(paketId) ? paketId : '';
      if (!eslesenAnahtar && paketKod) {
        for (const [mk, md] of birlesikHarita.entries()) {
          if (String(md.sinavKodu || '').trim() === paketKod) {
            eslesenAnahtar = mk;
            break;
          }
        }
      }
      const k = eslesenAnahtar || paketId || paketKod || anahtar;
      const onceki = birlesikHarita.get(k) || {};
      birlesikHarita.set(k, Object.assign({}, onceki, pkg, {
        ogrenciler: (Array.isArray(pkg.ogrenciler) && pkg.ogrenciler.length) ? pkg.ogrenciler : (onceki.ogrenciler || [])
      }));
    }
    const kullaniciOlaylari = sunucuDurumu.omrSenkronOlaylari.filter((o) => o.kullaniciAdi === kullaniciAdi);
    const sonSeqNo = kullaniciOlaylari.length ? kullaniciOlaylari[kullaniciOlaylari.length - 1].seqNo : 0;
    return gonderJson(res, 200, {
      basarili: true,
      kullaniciAdi,
      revizyonNo: mevcut ? (mevcut.revizyonNo || 0) : 0,
      guncellemeMs: mevcut ? (mevcut.guncellemeMs || 0) : 0,
      sonSeqNo,
      dersler: Array.from(birlesikHarita.values())
    });
  }

  // 0a-1e. V2 Sınav Paketi Yayınlama (Hafif QR sonrası Mobil Cihazın Çekeceği Ders/Öğrenci/Yapı Paketi)
  if (req.method === 'POST' && yol === '/api/v2/sinav-paket-yayinla') {
    okuJsonGovde(req, 2097152)
      .then((govde) => {
        const token = cozHocaTokenIstekten(req, govde, urlNesne);
        const yetki = dogrulaOmrVeyaHocaToken(token, '');
        if (!yetki) {
          return gonderJson(res, 401, { hata: 'Sınav paketi yayınlamak için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const kullaniciAdi = String((yetki.oturum && yetki.oturum.kullaniciAdi) || yetki.kullaniciAdi || 'hoca').trim().toLowerCase() || 'hoca';
        const temiz = Cekirdek.derinTemizleNesne(govde || {}, 0);
        const sinavKodu = String(temiz.sinavKodu || (temiz.sinavYapisi && temiz.sinavYapisi.sinavKodu) || 'GENEL').trim().slice(0, 80) || 'GENEL';
        const dersId = String(temiz.dersId || (temiz.sinavYapisi && temiz.sinavYapisi.dersId) || '').trim().slice(0, 80);
        const dersAdi = String(temiz.dersAdi || (temiz.sinavYapisi && temiz.sinavYapisi.dersAdi) || '').trim().slice(0, 100);
        const baslik = String(temiz.baslik || (temiz.sinavYapisi && temiz.sinavYapisi.baslik) || dersAdi || sinavKodu).trim().slice(0, 140);
        const ogrenciler = (Array.isArray(temiz.ogrenciler) ? temiz.ogrenciler : [])
          .filter((o) => o && typeof o === 'object' && (o.ogrNo || o.no))
          .slice(0, 2000)
          .map((o) => ({
            ogrNo: String(o.ogrNo || o.no || '').trim().slice(0, 40),
            adSoyad: String(o.adSoyad || o.ad || '').trim().slice(0, 100),
            sinifSube: String(o.sinifSube || o.sube || '').trim().slice(0, 40),
            salonAdi: String(o.salonAdi || o.salon || '').trim().slice(0, 40)
          }));
        const guncellemeMs = Date.now();
        const paket = {
          id: dersId || sinavKodu,
          dersId,
          dersAdi,
          sinavKodu,
          baslik,
          sinavYapisi: temiz.sinavYapisi || {},
          cevapAnahtarlari: temiz.cevapAnahtarlari || (temiz.sinavYapisi && temiz.sinavYapisi.cevapAnahtarlari) || {},
          ogrenciler,
          guncellemeMs
        };
        const paketHash = Cekirdek.uretDelilLogHash(JSON.stringify(paket), 'V2_PAKET');
        paket.paketHash = paketHash;
        sunucuDurumu.mobilSinavPaketleri.set(`${kullaniciAdi}::${sinavKodu}`, paket);
        return gonderJson(res, 200, {
          basarili: true,
          kullaniciAdi,
          sinavKodu,
          paketHash,
          guncellemeMs,
          ogrenciSayisi: ogrenciler.length
        });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 0a-1f. V2 Kayıpsız Delta Senkron Push (İdempotent & Non-Destructive)
  if (req.method === 'POST' && yol === '/api/v2/sinav-senkron') {
    okuJsonGovde(req, 2097152)
      .then((govde) => {
        const token = cozHocaTokenIstekten(req, govde, urlNesne);
        const yetki = dogrulaOmrVeyaHocaToken(token, (govde && govde.oturumKodu) || '');
        if (!yetki) {
          return gonderJson(res, 401, { hata: 'Senkron olayı göndermek için doğrulanmış öğretmen veya OMR eşleşme tokenı gereklidir (401 Unauthorized).' });
        }
        const kullaniciAdi = String((yetki.oturum && yetki.oturum.kullaniciAdi) || yetki.kullaniciAdi || 'hoca').trim().toLowerCase() || 'hoca';
        const hamOlaylar = Array.isArray(govde && govde.olaylar)
          ? govde.olaylar
          : (govde && govde.olay ? [govde.olay] : []);
        if (!hamOlaylar.length) {
          return gonderJson(res, 400, { hata: 'En az 1 geçerli senkron olayı (olaylar[]) gönderilmelidir.' });
        }
        if (hamOlaylar.length > 200) {
          return gonderJson(res, 400, { hata: 'Tek istekte en fazla 200 senkron olayı gönderilebilir.' });
        }
        const yazilanlar = [];
        let atlananSayisi = 0;
        for (const hamOlay of hamOlaylar) {
          const temizOlay = Cekirdek.dogrulaVeTemizleSenkronOlayi(hamOlay, kullaniciAdi);
          const idempotencyAnahtar = `${kullaniciAdi}::${temizOlay.eventId}`;
          if (sunucuDurumu.omrSenkronEventIdSet.has(idempotencyAnahtar)) {
            atlananSayisi++;
            continue;
          }
          sunucuDurumu.omrSenkronEventIdSet.add(idempotencyAnahtar);
          const seqNo = ++sunucuDurumu.omrSenkronSeqSayac;
          const kayit = Object.assign({ seqNo, sunucuZamanMs: Date.now() }, temizOlay);
          sunucuDurumu.omrSenkronOlaylari.push(kayit);
          if (sunucuDurumu.omrSenkronOlaylari.length > 10000) {
            const silinen = sunucuDurumu.omrSenkronOlaylari.shift();
            if (silinen) sunucuDurumu.omrSenkronEventIdSet.delete(`${silinen.kullaniciAdi}::${silinen.eventId}`);
          }
          if (kayit.tur === 'ANAHTAR_GUNCELLE') {
            const pkgAnahtar = `${kullaniciAdi}::${kayit.sinavKodu}`;
            const mevcutPkg = sunucuDurumu.mobilSinavPaketleri.get(pkgAnahtar);
            if (mevcutPkg) {
              const g = String((kayit.veri && kayit.veri.grup) || 'A').toUpperCase();
              const yeniCevapAnahtari = Object.assign({}, mevcutPkg.cevapAnahtarlari || {});
              if (kayit.veri && kayit.veri.kitapciklar) {
                Object.assign(yeniCevapAnahtari, kayit.veri.kitapciklar);
              } else if (kayit.veri && kayit.veri.anahtar) {
                yeniCevapAnahtari[g] = kayit.veri.anahtar;
              }
              mevcutPkg.cevapAnahtarlari = yeniCevapAnahtari;
              if (mevcutPkg.sinavYapisi && typeof mevcutPkg.sinavYapisi === 'object') {
                mevcutPkg.sinavYapisi.cevapAnahtarlari = yeniCevapAnahtari;
              }
              mevcutPkg.guncellemeMs = Date.now();
            }
          }
          yazilanlar.push({ eventId: kayit.eventId, seqNo: kayit.seqNo, tur: kayit.tur, sinavKodu: kayit.sinavKodu });
        }
        const kullaniciOlaylari = sunucuDurumu.omrSenkronOlaylari.filter((o) => o.kullaniciAdi === kullaniciAdi);
        const sonSeqNo = kullaniciOlaylari.length ? kullaniciOlaylari[kullaniciOlaylari.length - 1].seqNo : sunucuDurumu.omrSenkronSeqSayac;
        return gonderJson(res, 200, {
          basarili: true,
          kullaniciAdi,
          yazilanSayisi: yazilanlar.length,
          atlananSayisi,
          sonSeqNo,
          yazilanlar
        });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 0a-1g. V2 Kayıpsız Delta Senkron Pull (Non-Destructive Cursor Okuma)
  if (req.method === 'GET' && yol === '/api/v2/sinav-senkron') {
    const token = cozHocaTokenIstekten(req, null, urlNesne);
    const yetki = dogrulaOmrVeyaHocaToken(token, '');
    if (!yetki) {
      return gonderJson(res, 401, { hata: 'Senkron olaylarını okumak için doğrulanmış öğretmen veya OMR eşleşme tokenı gereklidir (401 Unauthorized).' });
    }
    const kullaniciAdi = String((yetki.oturum && yetki.oturum.kullaniciAdi) || yetki.kullaniciAdi || 'hoca').trim().toLowerCase() || 'hoca';
    const sinceSeq = Math.max(0, parseInt(urlNesne.searchParams.get('sinceSeq') || '0', 10) || 0);
    const sinavKoduFiltre = String(urlNesne.searchParams.get('sinavKodu') || '').trim();
    const tumKullaniciOlaylari = sunucuDurumu.omrSenkronOlaylari.filter((o) => o.kullaniciAdi === kullaniciAdi);
    const sonSeqNo = tumKullaniciOlaylari.length ? tumKullaniciOlaylari[tumKullaniciOlaylari.length - 1].seqNo : 0;
    const olaylar = tumKullaniciOlaylari
      .filter((o) => o.seqNo > sinceSeq && (!sinavKoduFiltre || sinavKoduFiltre === 'TUMU' || o.sinavKodu === sinavKoduFiltre))
      .slice(0, 500);
    return gonderJson(res, 200, {
      basarili: true,
      kullaniciAdi,
      sinceSeq,
      sonSeqNo,
      olaylar
    });
  }

  // 0a-2. Davet Kodlu Yeni Hoca Başvurusu (Yönetici Onayına Düşer — Asla Otomatik Oturum Açmaz)
  if (req.method === 'POST' && yol === '/api/hoca-basvuru') {
    okuJsonGovde(req)
      .then(async (govde) => {
        const dogrulama = Cekirdek.dogrulaHocaHesapKayit(govde, {
          davetKoduKontrol: true,
          beklenenDavetKodu: sunucuDurumu.davetKodu,
          mevcutHocalar: sunucuDurumu.hocaListesi
        });
        if (!dogrulama.gecerli) {
          const kod = String(dogrulama.hata || '').includes('davet kodu') ? 403 : 400;
          return gonderJson(res, kod, { hata: dogrulama.hata });
        }
        const sifreHash = await Cekirdek.uretTuzluSifreOzetiWebCrypto(String(govde.sifre));
        const yeniKayit = {
          kullaniciAdi: dogrulama.kullaniciAdi,
          adSoyad: dogrulama.adSoyad,
          eposta: dogrulama.eposta,
          telefon: dogrulama.telefon,
          sifreHash,
          rol: 'hoca',
          durum: 'beklemede',
          kayitTarihi: new Date().toISOString().slice(0, 10)
        };
        sunucuDurumu.hocaListesi.push(yeniKayit);
        return gonderJson(res, 201, {
          basarili: true,
          kullaniciAdi: yeniKayit.kullaniciAdi,
          adSoyad: yeniKayit.adSoyad,
          eposta: yeniKayit.eposta,
          rol: yeniKayit.rol,
          durum: yeniKayit.durum,
          mesaj: 'Öğretmen başvurunuz alındı ve yönetici onayına gönderildi. Yönetici onayladıktan sonra giriş yapabilirsiniz.'
        });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 0a-2b. E-Posta + Cep Telefonu Doğrulaması ile Yönetici / Hoca Şifre Sıfırlama (Rate Limited)
  if (req.method === 'POST' && yol === '/api/hoca-sifre-kurtar') {
    const ip = istemciIpAl(req);
    const limit = kontrolHizSiniri(`hoca-sifre-kurtar:${ip}`, 8, 15 * 60 * 1000);
    if (!limit.izinli) {
      return gonderJson(
        res,
        429,
        { hata: 'Çok fazla şifre sıfırlama denemesi yapıldı. Lütfen daha sonra tekrar deneyiniz (429 Too Many Requests).' },
        { 'Retry-After': String(limit.tekrarSn) }
      );
    }
    okuJsonGovde(req)
      .then(async (govde) => {
        const havuz = Array.isArray(sunucuDurumu.hocaListesi) && sunucuDurumu.hocaListesi.length > 0
          ? sunucuDurumu.hocaListesi
          : [sunucuDurumu.hocaHesap];
        const sonuc = Cekirdek.sifirlaHocaSifreEpostaTelefon(govde, havuz);
        if (!sonuc.basarili) {
          return gonderJson(res, sonuc.kod || 403, { hata: sonuc.hata });
        }
        const yeniHash = await Cekirdek.uretTuzluSifreOzetiWebCrypto(String(govde.yeniSifre));
        const guncelKayit = havuz.find((h) => String(h.kullaniciAdi || '').toLowerCase() === String(sonuc.kullaniciAdi).toLowerCase());
        if (guncelKayit) {
          guncelKayit.sifreHash = yeniHash;
          delete guncelKayit.sifre;
        }
        if (sonuc.rol === 'yonetici') {
          sunucuDurumu.hocaHesap.sifreHash = yeniHash;
          delete sunucuDurumu.hocaHesap.sifre;
        }
        return gonderJson(res, 200, {
          basarili: true,
          kullaniciAdi: sonuc.kullaniciAdi,
          adSoyad: sonuc.adSoyad,
          eposta: sonuc.eposta,
          rol: sonuc.rol,
          mesaj: `Şifreniz başarıyla sıfırlandı (${sonuc.kullaniciAdi}). Yeni şifrenizle giriş yapabilirsiniz.`
        });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 0a-3. Hoca Listesi & Davet Kodu Sorgulama (Şifreler Asla Dönmez)
  if (req.method === 'GET' && yol === '/api/hoca-liste') {
    const token = cozHocaTokenIstekten(req, null, urlNesne);
    const oturum = token ? sunucuDurumu.aktifHocaOturumlari.get(token) : null;
    if (!token || !sunucuDurumu.aktifHocaTokenlar.has(token) || !oturum) {
      return gonderJson(res, 401, { hata: 'Hoca listesini görüntülemek için geçerli öğretmen oturumu gereklidir (401 Unauthorized).' });
    }
    return gonderJson(res, 200, {
      hocalar: hocaListesiGuvenliOzet(sunucuDurumu.hocaListesi),
      davetKodu: oturum.rol === 'yonetici' ? sunucuDurumu.davetKodu : undefined,
      aktifRol: oturum.rol
    });
  }

  // 0a-4. Yönetici Onay / Askıya Alma / Silme / Davet Kodu Yenileme / Şifre Güncelleme
  if (req.method === 'POST' && yol === '/api/hoca-yonetim') {
    okuJsonGovde(req)
      .then(async (govde) => {
        const token = cozHocaTokenIstekten(req, govde, urlNesne);
        const oturum = token ? sunucuDurumu.aktifHocaOturumlari.get(token) : null;
        if (!token || !sunucuDurumu.aktifHocaTokenlar.has(token) || !oturum) {
          return gonderJson(res, 401, { hata: 'Bu işlem için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }

        const islem = String(govde.islem || '').trim();

        // Kendi profilini / şifresini güncelleme (Her aktif hoca kendi hesabını güncelleyebilir)
        if (islem === 'sifre_guncelle') {
          const dogrulama = Cekirdek.dogrulaHocaHesapKayit(govde, {
            davetKoduKontrol: false,
            mevcutHocalar: sunucuDurumu.hocaListesi,
            haricKullaniciAdi: oturum.kullaniciAdi
          });
          if (!dogrulama.gecerli) {
            return gonderJson(res, 400, { hata: dogrulama.hata });
          }
          const kayit = sunucuDurumu.hocaListesi.find(
            (h) => String(h.kullaniciAdi).toLowerCase() === String(oturum.kullaniciAdi).toLowerCase()
          );
          if (!kayit) {
            return gonderJson(res, 404, { hata: 'Güncellenecek hoca kaydı bulunamadı.' });
          }
          kayit.kullaniciAdi = dogrulama.kullaniciAdi;
          kayit.adSoyad = dogrulama.adSoyad;
          kayit.eposta = dogrulama.eposta;
          kayit.telefon = dogrulama.telefon;
          kayit.sifreHash = await Cekirdek.uretTuzluSifreOzetiWebCrypto(String(govde.sifre));
          delete kayit.sifre;
          oturum.kullaniciAdi = dogrulama.kullaniciAdi;
          oturum.adSoyad = dogrulama.adSoyad;
          if (kayit.rol === 'yonetici') {
            sunucuDurumu.hocaHesap = Object.assign({}, kayit);
          }
          return gonderJson(res, 200, {
            basarili: true,
            kullaniciAdi: kayit.kullaniciAdi,
            adSoyad: kayit.adSoyad,
            hocalar: hocaListesiGuvenliOzet(sunucuDurumu.hocaListesi)
          });
        }

        // Bundan sonraki işlemler yalnızca 'yonetici' rolüne açıktır
        if (oturum.rol !== 'yonetici') {
          return gonderJson(res, 403, { hata: 'Bu işlem yalnızca sistem yöneticisi (Bölüm Başkanı / Koordinatör) yetkisiyle yapılabilir (403 Forbidden).' });
        }

        if (islem === 'davet_kodu_yenile') {
          sunucuDurumu.davetKodu = Cekirdek.uretYeniDavetKodu('AKADEMI');
          return gonderJson(res, 200, {
            basarili: true,
            davetKodu: sunucuDurumu.davetKodu,
            hocalar: hocaListesiGuvenliOzet(sunucuDurumu.hocaListesi)
          });
        }

        const hedefKullanici = String(govde.kullaniciAdi || '').trim().toLowerCase();
        const idx = sunucuDurumu.hocaListesi.findIndex(
          (h) => String(h.kullaniciAdi || '').trim().toLowerCase() === hedefKullanici
        );
        if (idx === -1) {
          return gonderJson(res, 404, { hata: 'İşlem yapılacak öğretmen kaydı bulunamadı.' });
        }
        const hedefKayit = sunucuDurumu.hocaListesi[idx];

        if (islem === 'onayla') {
          hedefKayit.durum = 'aktif';
          return gonderJson(res, 200, {
            basarili: true,
            kullaniciAdi: hedefKayit.kullaniciAdi,
            durum: 'aktif',
            hocalar: hocaListesiGuvenliOzet(sunucuDurumu.hocaListesi)
          });
        }

        if (islem === 'askiya_al') {
          if (hedefKayit.rol === 'yonetici') {
            return gonderJson(res, 400, { hata: 'Ana sistem yöneticisi hesabı askıya alınamaz.' });
          }
          hedefKayit.durum = 'askida';
          for (const [tok, ot] of sunucuDurumu.aktifHocaOturumlari.entries()) {
            if (String(ot.kullaniciAdi).toLowerCase() === hedefKullanici) {
              sunucuDurumu.aktifHocaOturumlari.delete(tok);
              sunucuDurumu.aktifHocaTokenlar.delete(tok);
            }
          }
          return gonderJson(res, 200, {
            basarili: true,
            kullaniciAdi: hedefKayit.kullaniciAdi,
            durum: 'askida',
            hocalar: hocaListesiGuvenliOzet(sunucuDurumu.hocaListesi)
          });
        }

        if (islem === 'sil') {
          if (hedefKayit.rol === 'yonetici') {
            return gonderJson(res, 400, { hata: 'Ana sistem yöneticisi hesabı silinemez.' });
          }
          const silinen = sunucuDurumu.hocaListesi.splice(idx, 1)[0];
          for (const [tok, ot] of sunucuDurumu.aktifHocaOturumlari.entries()) {
            if (String(ot.kullaniciAdi).toLowerCase() === hedefKullanici) {
              sunucuDurumu.aktifHocaOturumlari.delete(tok);
              sunucuDurumu.aktifHocaTokenlar.delete(tok);
            }
          }
          return gonderJson(res, 200, {
            basarili: true,
            silinenKullaniciAdi: silinen.kullaniciAdi,
            hocalar: hocaListesiGuvenliOzet(sunucuDurumu.hocaListesi)
          });
        }

        return gonderJson(res, 400, { hata: 'Geçersiz yönetim işlemi.' });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 0b. Hoca Tarafından Online Sınav Tanımlama / Güncelleme ve Sunucu Durumu Sorgulama (Öğretmen Oturumu Zorunlu)
  if (req.method === 'POST' && yol === '/api/online-sinav-tanimla') {
    okuJsonGovde(req, 524288)
      .then((govde) => {
        const hocaToken = cozHocaTokenIstekten(req, govde, urlNesne);
        if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
          return gonderJson(res, 401, { hata: 'Online sınav tanımlamak veya güncellemek için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        if (!govde || typeof govde !== 'object' || Array.isArray(govde)) {
          return gonderJson(res, 400, { hata: 'Geçersiz sınav tanım gövdesi.' });
        }
        const sinav = govde.sinav || govde;
        const yeniSurumId = `SURUM-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        sunucuDurumu.aktifSinav = {
          sinavId: String(sinav.sinavId || sinav.kod || 'SINAV-2026-GUZ').slice(0, 80),
          sinavSurumId: yeniSurumId,
          baslik: String(sinav.baslik || 'Online Sınav').slice(0, 140),
          sinavTuru: String(sinav.sinavTuru || 'Vize (Ara Sınav)').slice(0, 60),
          dersId: String(sinav.dersId || 'ders-ag-guvenlik').slice(0, 80),
          dersAd: String(sinav.dersAd || '').slice(0, 120),
          aktif: sinav.aktif !== undefined ? Boolean(sinav.aktif) : true,
          baslangic: String(sinav.baslangic || ''),
          bitis: String(sinav.bitis || ''),
          sureDk: Math.max(5, Math.min(240, parseInt(sinav.sureDk, 10) || 40)),
          dySayisi: Math.max(0, parseInt(sinav.dySayisi, 10) || 0),
          testSayisi: Math.max(0, parseInt(sinav.testSayisi, 10) || 0),
          klasikSayisi: Math.max(0, parseInt(sinav.klasikSayisi, 10) || 0),
          erisimKodu: String(sinav.erisimKodu || '').trim().slice(0, 32),
          maksIhlal: Math.max(0, parseInt(sinav.maksIhlal, 10) || 0),
          kisiyeOzel: sinav.kisiyeOzel !== false,
          geriDonusKilit: sinav.geriDonusKilit !== false,
          havuzSorulari: Array.isArray(sinav.havuzSorulari) && sinav.havuzSorulari.length > 0
            ? sinav.havuzSorulari
            : null,
          sorular: Array.isArray(sinav.sorular) && sinav.sorular.length > 0
            ? sinav.sorular
            : sunucuDurumu.aktifSinav.sorular
        };
        if (Array.isArray(govde.ogrenciler)) {
          govde.ogrenciler.forEach((o) => {
            if (o && typeof o.ogrNo === 'string' && o.ogrNo.trim()) {
              sunucuDurumu.kayitliOgrenciler.set(o.ogrNo.trim(), o);
            }
          });
        }
        return gonderJson(res, 200, {
          kaydedildi: true,
          sinavId: sunucuDurumu.aktifSinav.sinavId,
          sinavSurumId: sunucuDurumu.aktifSinav.sinavSurumId,
          aktif: sunucuDurumu.aktifSinav.aktif,
          sureDk: sunucuDurumu.aktifSinav.sureDk,
          soruSayisi: sunucuDurumu.aktifSinav.sorular.length
        });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  if (req.method === 'GET' && yol === '/api/online-sinav-durum') {
    const s = sunucuDurumu.aktifSinav;
    return gonderJson(res, 200, {
      sinavId: s.sinavId,
      sinavSurumId: s.sinavSurumId || 'SURUM-BASLANGIC-1',
      baslik: s.baslik || '',
      sinavTuru: s.sinavTuru || '',
      dersId: s.dersId || '',
      dersAd: s.dersAd || '',
      aktif: Boolean(s.aktif),
      baslangic: s.baslangic || '',
      bitis: s.bitis || '',
      sureDk: s.sureDk,
      soruSayisi: Array.isArray(s.sorular) ? s.sorular.length : 0,
      erisimKoduGerekli: Boolean(s.erisimKodu)
    });
  }

  // 1. Öğrenci Online Sınav Oturumu Başlatma (Zero-Trust + Tekil Oturum Kilidi)
  // ---- Öğrenci hesabı: ayar / durum / ilk kayıt + e-posta kodu / giriş / şifre yenileme / öğretmen paneli ----
  if (req.method === 'GET' && yol === '/api/ogrenci-hesap/ayar') {
    return gonderJson(res, 200, { hesapZorunlu: ogrenciHesabiZorunluMu(), epostaHazir: epostaServisiHazirMi() });
  }
  if (yol === '/api/ogrenci-hesap/hoca-liste' || yol === '/api/ogrenci-hesap/hoca-sifirla') {
    okuJsonGovde(req)
      .catch(() => ({}))
      .then(async (govde) => {
        const token = cozHocaTokenIstekten(req, govde, urlNesne);
        if (!token || !sunucuDurumu.aktifHocaTokenlar.has(token)) {
          return gonderJson(res, 401, { hata: 'Öğretmen oturumu gerekli.' });
        }
        const eylem = yol.endsWith('hoca-liste') ? 'hoca-liste' : 'hoca-sifirla';
        const r = await Cekirdek.isleOgrenciHesapIstegi(eylem, govde || {}, { hesaplar: sunucuDurumu.ogrenciHesaplari, kayitliOgrenciler: sunucuDurumu.kayitliOgrenciler });
        if (eylem === 'hoca-liste') {
          r.veri.epostaHazir = epostaServisiHazirMi();
          r.veri.bekleyenKodlar = epostaServisiHazirMi() ? [] : sunucuDurumu.ogrenciBekleyenKodlar.filter((k) => Date.now() - k.zamanMs < 10 * 60 * 1000);
        }
        return gonderJson(res, r.kod, r.veri);
      });
    return;
  }
  if (req.method === 'POST' && /^\/api\/ogrenci-hesap\/(durum|kayit-baslat|kayit-onayla|giris|sifre-sifirla-baslat|sifre-sifirla-onayla)$/.test(yol)) {
    const eylem = yol.split('/').pop();
    const ip = istemciIpAl(req);
    const genelSinir = kontrolHizSiniri(`ogr-hesap:${ip}`, 120, 15 * 60 * 1000);
    if (!genelSinir.izinli) {
      return gonderJson(res, 429, { hata: 'Çok fazla istek. Biraz sonra tekrar deneyin.' }, { 'Retry-After': String(genelSinir.tekrarSn) });
    }
    okuJsonGovde(req)
      .then(async (govde) => {
        const ogrNo = String((govde && govde.ogrNo) || '').trim();
        const girisSinirAnahtar = `ogr-giris-hata:${ip}:${ogrNo}`;
        if (eylem === 'giris') {
          const s = hizSiniriDurumu(girisSinirAnahtar, 8);
          if (s.asildi) return gonderJson(res, 429, { hata: `Çok fazla hatalı giriş. ${Math.ceil(s.tekrarSn / 60)} dakika sonra tekrar deneyin.` }, { 'Retry-After': String(s.tekrarSn) });
        }
        if (eylem === 'kayit-baslat' || eylem === 'sifre-sifirla-baslat') {
          const s = kontrolHizSiniri(`ogr-kod-gonder:${ogrNo}`, 4, 15 * 60 * 1000);
          if (!s.izinli) return gonderJson(res, 429, { hata: `Çok sık kod istendi. ${Math.ceil(s.tekrarSn / 60)} dakika sonra tekrar deneyin.` }, { 'Retry-After': String(s.tekrarSn) });
        }
        const r = await Cekirdek.isleOgrenciHesapIstegi(eylem, govde || {}, { hesaplar: sunucuDurumu.ogrenciHesaplari, kayitliOgrenciler: sunucuDurumu.kayitliOgrenciler });
        if (eylem === 'giris') {
          if (r.kod === 401) kontrolHizSiniri(girisSinirAnahtar, 8);
          if (r.kod === 200) hizSiniriSifirla(girisSinirAnahtar);
        }
        if (r.eposta) {
          const g = await gonderOgrenciEpostasi(r.eposta);
          r.veri.epostaGonderildi = Boolean(g.gonderildi);
          if (g.gecisModu) r.veri.gecisModu = true;
          if (!g.gonderildi && !g.gecisModu) {
            return gonderJson(res, 502, { hata: 'Doğrulama e-postası gönderilemedi. Biraz sonra tekrar deneyin veya öğretmeninize başvurun.' });
          }
        }
        if (r.girisOgrNo) {
          const token = crypto.randomBytes(24).toString('hex');
          sunucuDurumu.ogrenciGirisTokenlari.set(token, { ogrNo: r.girisOgrNo, bitisMs: Date.now() + 4 * 60 * 60 * 1000 });
          r.veri.girisToken = token;
        }
        return gonderJson(res, r.kod, r.veri);
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  if (req.method === 'POST' && yol === '/api/ogrenci-oturum-baslat') {
    okuJsonGovde(req)
      .then((govde) => {
        const ihlal = kontrolZeroTrustYuk(govde, true);
        if (ihlal) return gonderJson(res, 400, { hata: ihlal });
        // Öğrenci hesabı zorunluyken oturum yalnız numara + şifreyle giriş yapmış öğrenciye açılır
        // (eskiden numarayı bilen herkes o öğrencinin yerine sınava girebiliyordu)
        if (ogrenciHesabiZorunluMu() && !ogrenciGirisTokenDogrula(govde.girisToken, String(govde.ogrNo || '').trim())) {
          return gonderJson(res, 401, { hata: 'Sınava başlamak için önce öğrenci numaranız ve şifrenizle giriş yapın.', girisGerekli: true });
        }

        if (!sunucuDurumu.aktifSinav || !sunucuDurumu.aktifSinav.aktif) {
          return gonderJson(res, 403, { hata: 'Aktif bir online sınav bulunmuyor.' });
        }

        const simdiMs = Date.now();
        if (sunucuDurumu.aktifSinav.baslangic) {
          const basMs = Date.parse(sunucuDurumu.aktifSinav.baslangic);
          if (Number.isFinite(basMs) && simdiMs < basMs) {
            return gonderJson(res, 403, { hata: 'Online sınav başlangıç zamanı henüz gelmemiştir.' });
          }
        }
        if (sunucuDurumu.aktifSinav.bitis) {
          const bitMs = Date.parse(sunucuDurumu.aktifSinav.bitis);
          if (Number.isFinite(bitMs) && simdiMs > bitMs) {
            return gonderJson(res, 403, { hata: 'Online sınav bitiş süresi sona ermiştir.' });
          }
        }

        if (sunucuDurumu.aktifSinav.erisimKodu) {
          const girilenKod = String(govde.erisimKodu || govde.salonKodu || '').trim();
          if (girilenKod !== String(sunucuDurumu.aktifSinav.erisimKodu).trim()) {
            return gonderJson(res, 403, { hata: 'Sınav salon/giriş kodu doğrulanamadı.' });
          }
        }

        const ogrNo = String(govde.ogrNo || '').trim();
        if (!ogrNo || !sunucuDurumu.kayitliOgrenciler.has(ogrNo)) {
          return gonderJson(res, 401, { hata: 'Kayıtlı öğrenci numarası doğrulanamadı.' });
        }

        const ogr = sunucuDurumu.kayitliOgrenciler.get(ogrNo);
        const aktifSinavId = sunucuDurumu.aktifSinav.sinavId;
        const aktifSinavSurumId = sunucuDurumu.aktifSinav.sinavSurumId || 'SURUM-BASLANGIC-1';

        const hazirlaIstemciSorulari = (soruListesi) =>
          (Array.isArray(soruListesi) ? soruListesi : []).map((s, idx) => ({
            no: idx + 1,
            id: s.id || `S-${idx + 1}`,
            tur: s.tur,
            metin: s.metin,
            siklar: s.siklar || [],
            ocKodu: s.ocKodu || 'ÖÇ-1'
          }));

        // Aynı öğrenci ve sınav için mevcut oturum kontrolü (Oturum Çalma / Hijack & Süre Sıfırlama Koruması)
        const gelenKurtarma = String(govde.kurtarmaAnahtari || '').trim();
        const gelenToken = cozHocaTokenIstekten(req, govde, urlNesne);
        for (const [mevcutToken, mevcutOt] of sunucuDurumu.aktifTokenlar.entries()) {
          if (
            mevcutOt.ogrNo === ogr.ogrNo &&
            mevcutOt.sinavId === aktifSinavId &&
            (mevcutOt.sinavSurumId || 'SURUM-BASLANGIC-1') === aktifSinavSurumId
          ) {
            if (mevcutOt.bitti) {
              return gonderJson(res, 409, { hata: 'Bu sınav oturumu daha önce tamamlanmış ve teslim edilmiştir; tekrar başlatılamaz.' });
            }
            if (Date.now() >= mevcutOt.bitisMs) {
              return gonderJson(res, 403, { hata: 'Sınav oturum süreniz dolmuştur; süre sıfırlanamaz veya yeniden başlatılamaz.' });
            }
            const gelenKurtarmaHash = gelenKurtarma ? Cekirdek.uretDelilLogHash(gelenKurtarma, 'OGR-KURTARMA') : '';
            const kurtarmaEslesir = Boolean(
              gelenKurtarmaHash &&
              mevcutOt.kurtarmaAnahtariHash &&
              Cekirdek.sabitSureliEsitMi(gelenKurtarmaHash, mevcutOt.kurtarmaAnahtariHash)
            );
            const tokenEslesir = Boolean(gelenToken && Cekirdek.sabitSureliEsitMi(gelenToken, mevcutToken));
            if ((gelenKurtarma && !kurtarmaEslesir) || (gelenToken && !tokenEslesir) || (!kurtarmaEslesir && !tokenEslesir)) {
              return gonderJson(res, 409, {
                hata: 'Bu öğrenci numarası için başka bir cihazda/oturumda aktif bir sınav oturumu devam etmektedir. Oturum devralma reddedildi (409 Conflict).',
                oturumCakismasi: true
              });
            }
            const mevcutSorular = hazirlaIstemciSorulari(mevcutOt.sorular || sunucuDurumu.aktifSinav.sorular);
            return gonderJson(res, 200, {
              token: mevcutToken,
              ogrNo: mevcutOt.ogrNo,
              adSoyad: mevcutOt.adSoyad,
              bitisMs: mevcutOt.bitisMs,
              soruSayisi: mevcutSorular.length,
              sorular: mevcutSorular,
              kilitliSoruIdleri: Object.keys(mevcutOt.cevaplar || {}),
              mevcutOturumDevam: true
            });
          }
        }

        let oturumSorulari = sunucuDurumu.aktifSinav.sorular;
        if (
          Array.isArray(sunucuDurumu.aktifSinav.havuzSorulari) &&
          sunucuDurumu.aktifSinav.havuzSorulari.length > 0
        ) {
          oturumSorulari = Cekirdek.uretKisiyeOzelOnlineSinav(
            sunucuDurumu.aktifSinav.havuzSorulari,
            sunucuDurumu.aktifSinav.dySayisi,
            sunucuDurumu.aktifSinav.testSayisi,
            sunucuDurumu.aktifSinav.kisiyeOzel !== false ? ogr.ogrNo : 'SABIT',
            aktifSinavId
          );
          if (sunucuDurumu.aktifSinav.klasikSayisi > 0) {
            const klasikler = sunucuDurumu.aktifSinav.havuzSorulari
              .filter((s) => s.tur === 'klasik')
              .slice(0, sunucuDurumu.aktifSinav.klasikSayisi);
            oturumSorulari.push(...klasikler);
          }
        }

        // Cevap anahtarı (dogruHarf / dogruDY) istemciye ASLA gönderilmez!
        const istemciSorulari = hazirlaIstemciSorulari(oturumSorulari);

        const token = crypto.randomBytes(24).toString('hex');
        const kurtarmaAnahtari = (typeof govde.kurtarmaAnahtari === 'string' && govde.kurtarmaAnahtari.trim().length >= 8)
          ? govde.kurtarmaAnahtari.trim()
          : crypto.randomBytes(16).toString('hex');
        const kurtarmaAnahtariHash = Cekirdek.uretDelilLogHash(kurtarmaAnahtari, 'OGR-KURTARMA');
        const bitisMs = Date.now() + sunucuDurumu.aktifSinav.sureDk * 60 * 1000;

        sunucuDurumu.aktifTokenlar.set(token, {
          ogrNo: ogr.ogrNo,
          adSoyad: ogr.adSoyad,
          sinavId: aktifSinavId,
          sinavSurumId: aktifSinavSurumId,
          kurtarmaAnahtariHash,
          sorular: oturumSorulari,
          bitisMs,
          cevaplar: {},
          bitti: false
        });

        return gonderJson(res, 200, {
          token,
          kurtarmaAnahtari,
          ogrNo: ogr.ogrNo,
          adSoyad: ogr.adSoyad,
          bitisMs,
          soruSayisi: istemciSorulari.length,
          sorular: istemciSorulari
        });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 2. Öğrenci Tek Soru Cevabı Kaydetme (Zero-Trust + Soru/Şık Şema Doğrulaması)
  if (req.method === 'POST' && yol === '/api/ogrenci-cevap') {
    okuJsonGovde(req)
      .then((govde) => {
        const ihlal = kontrolZeroTrustYuk(govde, false);
        if (ihlal) return gonderJson(res, 400, { hata: ihlal });

        const token = cozHocaTokenIstekten(req, govde, urlNesne);
        const oturum = sunucuDurumu.aktifTokenlar.get(token);
        if (!oturum) return gonderJson(res, 401, { hata: 'Geçersiz veya süresi dolmuş oturum tokenı.' });
        const aktifSurumId = (sunucuDurumu.aktifSinav && sunucuDurumu.aktifSinav.sinavSurumId) || 'SURUM-BASLANGIC-1';
        if (
          !sunucuDurumu.aktifSinav ||
          !sunucuDurumu.aktifSinav.aktif ||
          oturum.sinavId !== sunucuDurumu.aktifSinav.sinavId ||
          (oturum.sinavSurumId || 'SURUM-BASLANGIC-1') !== aktifSurumId
        ) {
          return gonderJson(res, 403, { hata: 'Oturumunuz aktif sınav tanımıyla eşleşmiyor veya sınav kapatılmış.' });
        }
        if (Date.now() > oturum.bitisMs || oturum.bitti) {
          return gonderJson(res, 403, { hata: 'Sınav süresi dolmuş veya sınav tamamlanmış.' });
        }

        const soruId = String(govde.soruId || '').trim();
        const secim = String(govde.secim !== undefined ? govde.secim : (govde.cevap !== undefined ? govde.cevap : '')).trim();
        const sinavSorulari = Array.isArray(oturum.sorular) && oturum.sorular.length > 0
          ? oturum.sorular
          : (Array.isArray(sunucuDurumu.aktifSinav.sorular) ? sunucuDurumu.aktifSinav.sorular : []);
        const eslesenIdx = sinavSorulari.findIndex((s, idx) => String(s.id || `S-${idx + 1}`) === soruId);
        if (!soruId || eslesenIdx < 0) {
          return gonderJson(res, 400, { hata: 'Geçersiz veya bu sınava ait olmayan soruId.' });
        }
        const eslesenSoru = sinavSorulari[eslesenIdx];
        const kanonikSoruId = String(eslesenSoru.id || `S-${eslesenIdx + 1}`);

        if (eslesenSoru.tur === 'test') {
          if (secim !== '' && !['A', 'B', 'C', 'D', 'E'].includes(secim)) {
            return gonderJson(res, 400, { hata: 'Test sorusu için geçersiz şık seçimi (yalnız A-E veya boş kabul edilir).' });
          }
        } else if (eslesenSoru.tur === 'dy') {
          if (secim !== '' && !['D', 'Y'].includes(secim)) {
            return gonderJson(res, 400, { hata: 'D/Y sorusu için geçersiz seçim (yalnız D, Y veya boş kabul edilir).' });
          }
        }

        if (Object.prototype.hasOwnProperty.call(oturum.cevaplar, kanonikSoruId)) {
          return gonderJson(res, 409, { hata: 'Kilitlenmiş soruya geri dönülemez ve yanıt değiştirilemez.' });
        }

        oturum.cevaplar[kanonikSoruId] = secim;
        return gonderJson(res, 200, { kaydedildi: true, soruId: kanonikSoruId });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 2a. Öğrenci Sınavı Bitirme / Teslim Etme (Sunucu Otoriteli Puanlama ve Mühürlü Teslim Fişi)
  if (req.method === 'POST' && yol === '/api/ogrenci-sinav-bitir') {
    okuJsonGovde(req)
      .then((govde) => {
        const ihlal = kontrolZeroTrustYuk(govde, false);
        if (ihlal) return gonderJson(res, 400, { hata: ihlal });

        const token = cozHocaTokenIstekten(req, govde, urlNesne);
        const oturum = sunucuDurumu.aktifTokenlar.get(token);
        if (!oturum) return gonderJson(res, 401, { hata: 'Geçersiz veya süresi dolmuş oturum tokenı.' });
        const aktifSurumId = (sunucuDurumu.aktifSinav && sunucuDurumu.aktifSinav.sinavSurumId) || 'SURUM-BASLANGIC-1';
        if (
          !sunucuDurumu.aktifSinav ||
          oturum.sinavId !== sunucuDurumu.aktifSinav.sinavId ||
          (oturum.sinavSurumId || 'SURUM-BASLANGIC-1') !== aktifSurumId
        ) {
          return gonderJson(res, 403, { hata: 'Oturumunuz aktif sınav tanımıyla eşleşmiyor.' });
        }
        if (oturum.bitti) {
          return gonderJson(res, 409, { hata: 'Bu sınav oturumu zaten teslim edilmiş.' });
        }

        oturum.bitti = true;
        oturum.teslimZamani = new Date().toISOString();

        const sinavSorulari = Array.isArray(oturum.sorular) && oturum.sorular.length > 0
          ? oturum.sorular
          : (Array.isArray(sunucuDurumu.aktifSinav.sorular) ? sunucuDurumu.aktifSinav.sorular : []);
        let dogruSayisi = 0;
        let dyDogru = 0;
        let dyYanlis = 0;
        let dyBos = 0;
        let testDogru = 0;
        let testYanlis = 0;
        let testBos = 0;
        const dyDetay = [];
        const testDetay = [];
        const klasikDetay = [];
        const siraliCevaplar = [];
        sinavSorulari.forEach((s, idx) => {
          const sId = String(s.id || `S-${idx + 1}`);
          const verilen = oturum.cevaplar[sId];
          const verilenStr = verilen !== undefined && verilen !== null ? String(verilen).trim() : '';
          siraliCevaplar.push(verilenStr);
          if (s.tur === 'dy') {
            const beklenen = String(s.dogruDY || 'D').toUpperCase();
            let sonuc = 'BOS';
            if (!verilenStr) {
              dyBos++;
            } else if (verilenStr.toUpperCase() === beklenen) {
              sonuc = 'DOGRU';
              dyDogru++;
              dogruSayisi++;
            } else {
              sonuc = 'YANLIS';
              dyYanlis++;
            }
            dyDetay.push({
              soruNo: dyDetay.length + 1,
              soruId: sId,
              verilen: verilenStr,
              dogruCevap: beklenen,
              sonuc,
              ocKodu: s.ocKodu || 'ÖÇ-1'
            });
          } else if (s.tur === 'test') {
            const beklenen = String(s.dogruHarf || 'A').toUpperCase();
            let sonuc = 'BOS';
            if (!verilenStr) {
              testBos++;
            } else if (verilenStr.toUpperCase() === beklenen) {
              sonuc = 'DOGRU';
              testDogru++;
              dogruSayisi++;
            } else {
              sonuc = 'YANLIS';
              testYanlis++;
            }
            testDetay.push({
              soruNo: testDetay.length + 1,
              soruId: sId,
              verilen: verilenStr,
              dogruCevap: beklenen,
              sonuc,
              ocKodu: s.ocKodu || 'ÖÇ-1'
            });
          } else if (s.tur === 'klasik') {
            // Sıfır Güven: Klasik sorulara sunucuda ASLA otomatik puan verilmez (0 puan, öğretmen değerlendirmesi bekler)
            klasikDetay.push({
              soruNo: klasikDetay.length + 1,
              soruId: sId,
              verilen: verilenStr,
              verilenPuan: 0,
              puan: 0,
              durum: 'MANUEL_BEKLIYOR',
              ocKodu: s.ocKodu || 'ÖÇ-1'
            });
          }
        });
        const toplamSoru = Math.max(1, sinavSorulari.length);
        const puan = Math.round((dogruSayisi / toplamSoru) * 100);
        const teslimHash = Cekirdek.uretDelilLogHash(`${oturum.sinavId}|${oturum.ogrNo}|${puan}|${siraliCevaplar.join(',')}`, 'TESLIM-FIS').slice(0, 12);
        const teslimKodu = `#TESLIM-${teslimHash}`;
        oturum.puan = puan;
        oturum.dogruSayisi = dogruSayisi;
        oturum.teslimKodu = teslimKodu;
        const manuelDegerlendirmeBekliyor = klasikDetay.length > 0;

        return gonderJson(res, 200, {
          bitti: true,
          kaydedildi: true,
          ogrNo: oturum.ogrNo,
          sinavId: oturum.sinavId,
          dogruSayisi,
          toplamSoru: sinavSorulari.length,
          puan,
          dyDogru,
          dyYanlis,
          dyBos,
          testDogru,
          testYanlis,
          testBos,
          klasikOtomatikPuan: 0,
          dyDetay,
          testDetay,
          klasikDetay,
          teslimKodu,
          manuelDegerlendirmeBekliyor
        });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 2b. Delil Niteliğinde Online Sınav Kiosk Log Kaydetme & Sorgulama (Öğrenci veya Hoca Oturumu Zorunlu)
  if (req.method === 'POST' && yol === '/api/kiosk-log-kaydet') {
    okuJsonGovde(req)
      .then((govde) => {
        const token = cozHocaTokenIstekten(req, govde, urlNesne);
        const ogrenciOturum = token ? sunucuDurumu.aktifTokenlar.get(token) : null;
        const hocaYetkiliMi = Boolean(token && sunucuDurumu.aktifHocaTokenlar.has(token));
        if (!ogrenciOturum && !hocaYetkiliMi) {
          return gonderJson(res, 401, { hata: 'Kiosk delil logu kaydetmek için geçerli öğrenci veya öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const oncekiHash = sunucuDurumu.kioskDelilLoglari.length > 0
          ? sunucuDurumu.kioskDelilLoglari[sunucuDurumu.kioskDelilLoglari.length - 1].olayHash
          : 'GENESIS-00000000';
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');
        const sunucuSimdiIso = new Date().toISOString();
        const kayit = Cekirdek.olusturKioskDelilLogKaydi(
          Object.assign({}, govde, {
            ogrNo: ogrenciOturum ? ogrenciOturum.ogrNo : govde.ogrNo,
            adSoyad: ogrenciOturum ? ogrenciOturum.adSoyad : govde.adSoyad,
            sinavId: ogrenciOturum ? ogrenciOturum.sinavId : govde.sinavId,
            zamanIso: sunucuSimdiIso,
            zamanDamgasi: sunucuSimdiIso,
            cihazBilgisi: `${govde.cihazBilgisi || ''} [IP: ${ip}]`.trim()
          }),
          oncekiHash
        );
        sunucuDurumu.kioskDelilLoglari.push(kayit);
        return gonderJson(res, 201, { kaydedildi: true, log: kayit });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  if (req.method === 'GET' && yol === '/api/kiosk-log-indir') {
    const hocaToken = cozHocaTokenIstekten(req, null, urlNesne);
    if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
      return gonderJson(res, 401, { hata: 'Delil loglarını indirmek için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
    }
    const sinavId = urlNesne.searchParams.get('sinavId') || '';
    const format = (urlNesne.searchParams.get('format') || 'json').toLowerCase();
    const loglar = sinavId && sinavId !== 'TUMU'
      ? sunucuDurumu.kioskDelilLoglari.filter((l) => l.sinavId === sinavId)
      : sunucuDurumu.kioskDelilLoglari;
    if (format === 'txt') {
      const txt = Cekirdek.uretResmiDelilLogRaporuTXT(loglar, { sinavId: sinavId || 'TUMU' });
      res.writeHead(200, Object.assign({}, GUVENLIK_BASLIKLARI, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }));
      res.end(txt);
      return;
    }
    if (format === 'csv') {
      const csv = Cekirdek.uretDelilLogCSV(loglar, sinavId || 'TUMU');
      res.writeHead(200, Object.assign({}, GUVENLIK_BASLIKLARI, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' }));
      res.end(csv);
      return;
    }
    return gonderJson(res, 200, { loglar });
  }

  // 2d. Faz 2: Bologna Bilgi Paketi (HTML / Metin / Ekran Görüntüsü) Güvenli Çözümleyici (Öğretmen Yetkisi Zorunlu)
  if (req.method === 'POST' && yol === '/api/ai-bologna-coz') {
    okuJsonGovde(req, 2097152)
      .then(async (govde) => {
        const hocaToken = cozHocaTokenIstekten(req, govde, urlNesne);
        if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
          return gonderJson(res, 401, { hata: 'Bologna bilgi paketi çözümleyici için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const hamMetin = String((govde && (govde.htmlTablo || govde.html || govde.metin)) || '').trim();
        const gorselDataUrl = String((govde && govde.gorselDataUrl) || '').trim();
        const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

        if (apiKey && gorselDataUrl.startsWith('data:image/')) {
          try {
            const esl = gorselDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
            if (esl) {
              const geminiYanit = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{
                      parts: [
                        { text: 'Bu üniversite Bologna ders bilgi paketi ekran görüntüsündeki tüm metni ve tabloları (Dersin Ayrıntıları, Değerlendirme Ölçütleri, Öğrenme Çıktıları, 1-14 Hafta Ders Konuları, Program Çıktılarına Katkı) olduğu gibi düz metin/tablo olarak eksiksiz çıkar.' },
                        { inlineData: { mimeType: esl[1], data: esl[2] } }
                      ]
                    }]
                  })
                }
              );
              if (geminiYanit.ok) {
                const j = await geminiYanit.json();
                const cikanMetin = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n') || '';
                if (cikanMetin.trim()) {
                  const bologna = Cekirdek.cozBolognaBilgiPaketi(cikanMetin);
                  return gonderJson(res, 200, { basarili: true, mod: 'gemini_multimodal', bologna });
                }
              }
            }
          } catch (_) {}
        }

        if (!hamMetin) {
          return gonderJson(res, 400, {
            hata: gorselDataUrl
              ? 'Ekran görüntüsünden OCR/AI okuması için sunucuda GEMINI_API_KEY tanımlı olmalıdır. Alternatif olarak Bologna sayfasında Ctrl+A → Ctrl+C yapıp metin/tablo kutusuna doğrudan yapıştırabilirsiniz.'
              : 'Çözümlenecek Bologna HTML veya metin içeriği boş.'
          });
        }
        const bologna = Cekirdek.cozBolognaBilgiPaketi(hamMetin);
        if (!bologna.gecerli) {
          return gonderJson(res, 400, { hata: bologna.hata || 'Bologna verisi ayrıştırılamadı.' });
        }
        return gonderJson(res, 200, { basarili: true, mod: 'yerel_deterministik', bologna });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 2e. Faz 2: Soru Bazlı Otomatik ÖÇ + Hafta + Bloom + Zorluk Etiketleyici (Öğretmen Yetkisi Zorunlu)
  if (req.method === 'POST' && yol === '/api/ai-soru-oc-etiketle') {
    okuJsonGovde(req, 1048576)
      .then(async (govde) => {
        const hocaToken = cozHocaTokenIstekten(req, govde, urlNesne);
        if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
          return gonderJson(res, 401, { hata: 'Soru bazlı ÖÇ analizi için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const sorular = Array.isArray(govde && govde.sorular) ? govde.sorular : [];
        if (sorular.length === 0) {
          return gonderJson(res, 400, { hata: 'Analiz edilecek soru listesi boş.' });
        }
        const bolognaVerisi = (govde && (govde.bolognaVerisi || govde.bologna)) || {};
        const etiketler = Cekirdek.etiketleSorularOtomatikOcBloom(sorular, bolognaVerisi);
        return gonderJson(res, 200, { basarili: true, mod: 'semantik_enum_kilitli', etiketler });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 2f. Faz 2: Kurumsal Kalite Şablonları Kayıt / Listeleme Ucu (Öğretmen Yetkisi Zorunlu)
  if (yol === '/api/kurumsal-sablonlar') {
    const hocaToken = cozHocaTokenIstekten(req, null, urlNesne);
    if (req.method === 'GET') {
      if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
        return gonderJson(res, 401, { hata: 'Kurumsal şablonları okumak için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
      }
      const liste = Array.isArray(sunucuDurumu.kurumsalSablonlar) && sunucuDurumu.kurumsalSablonlar.length > 0
        ? sunucuDurumu.kurumsalSablonlar
        : Cekirdek.VARSAYILAN_KURUMSAL_SABLONLAR;
      return gonderJson(res, 200, { basarili: true, kurumsalSablonlar: liste });
    }
    if (req.method === 'POST') {
      okuJsonGovde(req, 1048576)
        .then((govde) => {
          const hTok = cozHocaTokenIstekten(req, govde, urlNesne);
          if (!hTok || !sunucuDurumu.aktifHocaTokenlar.has(hTok)) {
            return gonderJson(res, 401, { hata: 'Kurumsal şablon kaydetmek için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
          }
          const temiz = Cekirdek.semaDogrulaVeTemizle({ kurumsalSablonlar: govde.kurumsalSablonlar || [] });
          sunucuDurumu.kurumsalSablonlar = temiz.kurumsalSablonlar;
          return gonderJson(res, 200, { basarili: true, adet: sunucuDurumu.kurumsalSablonlar.length });
        })
        .catch((err) => gonderJson(res, 400, { hata: err.message }));
      return;
    }
  }

  // 2g. Kalıcı Bulut / Sunucu Kasası, Parçalı V2 ve Otomatik Yedek Geçmişi API (Öğretmen Yetkisi Zorunlu)
  if (
    yol === '/api/bulut-kasa' ||
    yol === '/api/bulut-kasa/gecmis' ||
    yol === '/api/bulut-kasa/geri-yukle' ||
    yol === '/api/bulut-kasa/parca-kontrol' ||
    yol === '/api/bulut-kasa/parca' ||
    yol === '/api/bulut-kasa/parca-oku'
  ) {
    const metot = String(req.method || 'GET').toUpperCase();
    const islemYap = (govde) => {
      const hTok = cozHocaTokenIstekten(req, govde, urlNesne);
      const oturum = hTok ? sunucuDurumu.aktifHocaOturumlari.get(hTok) : null;
      if (!hTok || !sunucuDurumu.aktifHocaTokenlar.has(hTok) || !oturum) {
        return gonderJson(res, 401, { hata: 'Bulut kasasına erişmek için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
      }
      const kullaniciAdi = String(oturum.kullaniciAdi || 'hoca').trim().toLowerCase();
      if (!sunucuDurumu.bulutKasalar) sunucuDurumu.bulutKasalar = new Map();
      if (!sunucuDurumu.bulutYedekGecmisi) sunucuDurumu.bulutYedekGecmisi = new Map();
      if (!sunucuDurumu.bulutKasaSoruParcalari) sunucuDurumu.bulutKasaSoruParcalari = new Map();

      if (yol === '/api/bulut-kasa/parca-kontrol' && metot === 'POST') {
        const hamHashler = Array.isArray(govde && govde.parcaHashleri) ? govde.parcaHashleri : [];
        if (hamHashler.length > 1000) {
          return gonderJson(res, 400, { hata: 'Tek istekte en fazla 1000 parça hash kontrol edilebilir.' });
        }
        const temizHashler = hamHashler.map((h) => String(h || '').trim()).filter((h) => h && h.length <= 128);
        const { eksikHashler } = sorgulaSoruParcalariBellek(kullaniciAdi, temizHashler, false);
        return gonderJson(res, 200, { basarili: true, eksikHashler });
      }

      if (yol === '/api/bulut-kasa/parca' && (metot === 'PUT' || metot === 'POST')) {
        const parcaHash = String((govde && govde.parcaHash) || '').trim();
        const kodlama = String((govde && govde.kodlama) || '').trim().toLowerCase();
        const veriSikistirilmis = typeof (govde && govde.veriSikistirilmis) === 'string' ? govde.veriSikistirilmis.trim() : '';
        if (!parcaHash || parcaHash.length > 128 || kodlama !== 'gzip-b64' || !veriSikistirilmis) {
          return gonderJson(res, 400, { hata: 'Geçerli parcaHash, kodlama=gzip-b64 ve veriSikistirilmis zorunludur.' });
        }
        try {
          const acilmisJson = cozGzipB64HamMetin(veriSikistirilmis, 2097152);
          if (Cekirdek.uretKasaParcaHash(acilmisJson) !== parcaHash) {
            return gonderJson(res, 400, { hata: 'Parça bütünlük karması (parcaHash) açılan veriyle uyuşmuyor.' });
          }
          const dizi = JSON.parse(acilmisJson);
          const { soruSayisi, hassasAlanVardi } = Cekirdek.dogrulaVeTemizleSoruParcasi(dizi);
          const saklanacakB64 = hassasAlanVardi ? paketleGzipB64Json(dizi) : veriSikistirilmis;
          sunucuDurumu.bulutKasaSoruParcalari.set(`${kullaniciAdi}::${parcaHash}`, {
            parcaHash,
            soruSayisi,
            veriSikistirilmis: saklanacakB64,
            guncellemeMs: Date.now()
          });
          kaydetYerelDiskKasasi();
          return gonderJson(res, 200, { basarili: true, parcaHash, soruSayisi });
        } catch (err) {
          return gonderJson(res, 400, { hata: `Soru parçası açılamadı veya doğrulanamadı: ${err.message}` });
        }
      }

      if (yol === '/api/bulut-kasa/parca-oku' && metot === 'POST') {
        const hamHashler = Array.isArray(govde && govde.parcaHashleri) ? govde.parcaHashleri : [];
        const benzersiz = [];
        const goruldu = new Set();
        for (const h of hamHashler) {
          const s = String(h || '').trim();
          if (!s || s.length > 128 || goruldu.has(s)) continue;
          goruldu.add(s);
          benzersiz.push(s);
          if (benzersiz.length >= 16) break;
        }
        const { mevcutHarita } = sorgulaSoruParcalariBellek(kullaniciAdi, benzersiz, true);
        const parcalar = [];
        for (const h of benzersiz) {
          const k = mevcutHarita.get(h);
          if (k) {
            parcalar.push({
              parcaHash: k.parcaHash,
              soruSayisi: k.soruSayisi,
              veriSikistirilmis: k.veriSikistirilmis
            });
          }
        }
        return gonderJson(res, 200, { basarili: true, parcalar });
      }

      const ekleGecmis = (revNo, veriJson, islemNotu) => {
        const liste = sunucuDurumu.bulutYedekGecmisi.get(kullaniciAdi) || [];
        const yeniId = (liste[0] ? liste[0].id : 0) + 1;
        liste.unshift({
          id: yeniId,
          kullaniciAdi,
          revizyonNo: revNo,
          islemNotu: String(islemNotu || '').slice(0, 180),
          veriJson,
          olusturmaMs: Date.now()
        });
        sunucuDurumu.bulutYedekGecmisi.set(kullaniciAdi, liste.slice(0, 25));
      };

      const cozumleTamMevcut = (mevcut) => {
        if (!mevcut) return null;
        if (mevcut.parcaliV2) {
          return birlestirParcaliKasaSorulariBellek(kullaniciAdi, mevcut.parcaliV2.meta, mevcut.parcaliV2.soruParcaHashleri);
        }
        return mevcut.veri ? Cekirdek.temizleYedekHassasAlanlar(JSON.parse(JSON.stringify(mevcut.veri))) : null;
      };

      const hazirla409KarsiYuk = (mevcut, parcaliIstemciMi) => {
        if (!mevcut) return {};
        if (parcaliIstemciMi && mevcut.parcaliV2) {
          return {
            kodlama: 'parcali-v2',
            bulutMeta: Cekirdek.temizleYedekHassasAlanlar(JSON.parse(JSON.stringify(mevcut.parcaliV2.meta || {}))),
            soruParcaHashleri: mevcut.parcaliV2.soruParcaHashleri,
            toplamSoruSayisi: mevcut.parcaliV2.toplamSoruSayisi
          };
        }
        const tam = cozumleTamMevcut(mevcut);
        return { bulutVeri: tam, veriPaketi: tam };
      };

      if (yol === '/api/bulut-kasa' && metot === 'GET') {
        const mevcut = sunucuDurumu.bulutKasalar.get(kullaniciAdi) || null;
        const parcaliDestek = urlNesne.searchParams.get('parcaliDestek') === '1';
        const kodlamaIstek = String(
          urlNesne.searchParams.get('kodlama') ||
          req.headers['x-kasa-kodlama'] ||
          req.headers['x-bulut-kodlama'] ||
          ''
        ).trim().toLowerCase();

        if (mevcut && mevcut.parcaliV2 && parcaliDestek) {
          const temizMeta = Cekirdek.temizleYedekHassasAlanlar(JSON.parse(JSON.stringify(mevcut.parcaliV2.meta || {})));
          return gonderJson(res, 200, {
            basarili: true,
            bulundu: true,
            depoTuru: 'yerel_sunucu',
            kullaniciAdi,
            revizyonNo: mevcut.revizyonNo,
            ozetBilgi: mevcut.ozetBilgi,
            guncellemeMs: mevcut.guncellemeMs,
            kodlama: 'parcali-v2',
            meta: temizMeta,
            soruParcaHashleri: mevcut.parcaliV2.soruParcaHashleri || [],
            toplamSoruSayisi: Number(mevcut.parcaliV2.toplamSoruSayisi) || 0
          });
        }

        const temizVeri = cozumleTamMevcut(mevcut);
        if (kodlamaIstek === 'gzip-b64' && temizVeri) {
          const veriSikistirilmis = paketleGzipB64Json(temizVeri);
          return gonderJson(res, 200, {
            basarili: true,
            bulundu: true,
            depoTuru: 'yerel_sunucu',
            kullaniciAdi,
            revizyonNo: mevcut.revizyonNo,
            ozetBilgi: mevcut.ozetBilgi,
            guncellemeMs: mevcut.guncellemeMs,
            kodlama: 'gzip-b64',
            veriSikistirilmis
          });
        }
        return gonderJson(res, 200, {
          basarili: true,
          bulundu: Boolean(temizVeri),
          depoTuru: 'yerel_sunucu',
          kullaniciAdi,
          revizyonNo: mevcut ? mevcut.revizyonNo : 0,
          ozetBilgi: mevcut ? mevcut.ozetBilgi : '',
          guncellemeMs: mevcut ? mevcut.guncellemeMs : 0,
          veri: temizVeri,
          veriPaketi: temizVeri
        });
      }

      if (yol === '/api/bulut-kasa' && (metot === 'PUT' || metot === 'POST')) {
        const istekKodlama = String((govde && govde.kodlama) || '').trim().toLowerCase();
        const parcaliIstemciMi = istekKodlama === 'parcali-v2' || Boolean(govde && govde.parcaliDestek === true);
        let gelenVeri = null;
        let parcaliIstek = null;

        if (istekKodlama === 'parcali-v2') {
          let metaNesne = null;
          if (typeof (govde && govde.veriSikistirilmis) === 'string' && govde.veriSikistirilmis.trim()) {
            try {
              metaNesne = cozGzipB64Json(govde.veriSikistirilmis);
            } catch (err) {
              return gonderJson(res, 400, { hata: `parcali-v2 meta verisi açılamadı: ${err.message}` });
            }
          } else {
            metaNesne = govde && (govde.meta || govde.veri || govde.veriPaketi);
          }
          if (!metaNesne || typeof metaNesne !== 'object' || Array.isArray(metaNesne)) {
            return gonderJson(res, 400, { hata: 'Kaydedilecek geçerli parcali-v2 meta nesnesi bulunamadı.' });
          }
          const hamHashler = Array.isArray(govde && govde.soruParcaHashleri) ? govde.soruParcaHashleri : [];
          if (hamHashler.length > 1000) {
            return gonderJson(res, 400, { hata: 'soruParcaHashleri en fazla 1000 adet olabilir.' });
          }
          const soruParcaHashleri = hamHashler.map((h) => String(h || '').trim()).filter((h) => h && h.length <= 128);
          const temizMeta = Cekirdek.temizleYedekHassasAlanlar(Cekirdek.derinTemizleNesne(metaNesne, 0));
          temizMeta.sorular = [];
          const { eksikHashler, toplamSoruSayisi } = sorgulaSoruParcalariBellek(kullaniciAdi, soruParcaHashleri, false);
          if (eksikHashler.length > 0) {
            return gonderJson(res, 409, {
              hata: 'Eksik soru parçaları mevcut.',
              eksikHashler
            });
          }
          parcaliIstek = {
            meta: temizMeta,
            soruParcaHashleri,
            toplamSoruSayisi
          };
          gelenVeri = temizMeta;
        } else if (istekKodlama === 'gzip-b64') {
          const b64Yuk = govde.veriSikistirilmis || govde.veriB64 || govde.payload ||
            (typeof govde.veri === 'string' ? govde.veri : '') ||
            (typeof govde.veriPaketi === 'string' ? govde.veriPaketi : '');
          if (!b64Yuk) {
            return gonderJson(res, 400, { hata: 'Sıkıştırılmış gzip-b64 yükü boş.' });
          }
          try {
            gelenVeri = cozGzipB64Json(b64Yuk);
          } catch (err) {
            return gonderJson(res, 400, { hata: `gzip-b64 kasa verisi açılamadı: ${err.message}` });
          }
        } else {
          gelenVeri = govde && (govde.veri || govde.veriPaketi);
        }
        if (!gelenVeri || typeof gelenVeri !== 'object' || Array.isArray(gelenVeri)) {
          return gonderJson(res, 400, { hata: 'Kaydedilecek geçerli bulut kasa verisi (veri nesnesi) bulunamadı.' });
        }
        gelenVeri = Cekirdek.temizleYedekHassasAlanlar(gelenVeri);
        const mevcut = sunucuDurumu.bulutKasalar.get(kullaniciAdi) || null;
        const mevcutRev = mevcut ? (Number(mevcut.revizyonNo) || 0) : 0;
        const bazRev = (govde && govde.bazRevizyonNo !== undefined && govde.bazRevizyonNo !== null)
          ? Number(govde.bazRevizyonNo)
          : null;
        const silmeOnayi = Boolean(govde && govde.silmeOnayi === true);
        const zorlaEz = Boolean(govde && govde.zorlaEz === true);

        const yeniOzet = hesaplaKasaOzeti(gelenVeri);
        if (parcaliIstek) {
          yeniOzet.soru = parcaliIstek.toplamSoruSayisi;
          yeniOzet.metin = `${yeniOzet.ders} ders · ${yeniOzet.soru} soru · ${yeniOzet.ogrenci} öğrenci · ${yeniOzet.sinav} sınav`;
        }
        let eskiOzet = { ders: 0, soru: 0, ogrenci: 0, sinav: 0, okuma: 0 };
        if (mevcut) {
          if (mevcut.parcaliV2) {
            eskiOzet = mevcut.parcaliV2.ozet || Object.assign(hesaplaKasaOzeti(mevcut.parcaliV2.meta || {}), { soru: Number(mevcut.parcaliV2.toplamSoruSayisi) || 0 });
          } else if (mevcut.veri) {
            eskiOzet = hesaplaKasaOzeti(mevcut.veri);
          } else {
            eskiOzet = Cekirdek.cozKasaOzetBilgisi(mevcut.ozetBilgi || '') || eskiOzet;
          }
        }

        if (mevcut && mevcutRev > 0) {
          const eskiDoluMu = eskiOzet.ders > 0 || eskiOzet.soru > 0 || eskiOzet.ogrenci > 0;
          const yeniTamBosMu = yeniOzet.ders === 0 && yeniOzet.soru === 0 && yeniOzet.ogrenci === 0;
          const azalmaVarMi =
            yeniOzet.ders < eskiOzet.ders ||
            yeniOzet.soru < eskiOzet.soru ||
            yeniOzet.ogrenci < eskiOzet.ogrenci ||
            yeniOzet.sinav < eskiOzet.sinav;
          const veriKaybiEngellendiMi = Boolean(eskiDoluMu && (yeniTamBosMu || (azalmaVarMi && !silmeOnayi)));

          if (eskiDoluMu && yeniTamBosMu) {
            const karsiYuk = hazirla409KarsiYuk(mevcut, parcaliIstemciMi);
            return gonderJson(res, 409, Object.assign({
              hata: 'Veri kaybı koruması: Dolu kasa boş veri ile sıfırlanamaz.',
              cakisma: true,
              veriKaybiKorumasi: true,
              bulutRevizyonNo: mevcutRev,
              revizyonNo: mevcutRev,
              ozetBilgi: mevcut.ozetBilgi
            }, karsiYuk));
          }

          if (bazRev === null || !Number.isFinite(bazRev) || bazRev !== mevcutRev) {
            const karsiYuk = hazirla409KarsiYuk(mevcut, parcaliIstemciMi);
            return gonderJson(res, 409, Object.assign({
              hata: 'Sunucu kasası revizyon uyuşmazlığı: Güncel revizyon numarası eşleşmiyor.',
              cakisma: true,
              veriKaybiKorumasi: veriKaybiEngellendiMi,
              bulutRevizyonNo: mevcutRev,
              revizyonNo: mevcutRev,
              ozetBilgi: mevcut.ozetBilgi
            }, karsiYuk));
          }

          if (azalmaVarMi && !silmeOnayi) {
            const karsiYuk = hazirla409KarsiYuk(mevcut, parcaliIstemciMi);
            return gonderJson(res, 409, Object.assign({
              hata: 'Veri kaybı koruması: Açık silme onayı olmadan mevcut ders, soru, öğrenci veya sınav sayısı azaltılamaz.',
              cakisma: true,
              veriKaybiKorumasi: true,
              bulutRevizyonNo: mevcutRev,
              revizyonNo: mevcutRev,
              ozetBilgi: mevcut.ozetBilgi
            }, karsiYuk));
          }
        }

        if (
          mevcut &&
          mevcut.veriJson &&
          (govde.anlikYedekAl === true ||
            silmeOnayi ||
            zorlaEz ||
            yeniOzet.soru !== eskiOzet.soru ||
            yeniOzet.ogrenci !== eskiOzet.ogrenci ||
            yeniOzet.ders !== eskiOzet.ders ||
            yeniOzet.sinav !== eskiOzet.sinav ||
            Date.now() - (mevcut.guncellemeMs || 0) > 180000)
        ) {
          ekleGecmis(mevcutRev, mevcut.veriJson, mevcut.ozetBilgi || 'Otomatik yedek');
        }

        const yeniRev = mevcutRev + 1;
        const simdi = Date.now();
        const ozetBilgi = String(govde.islemNotu || yeniOzet.metin).slice(0, 180);
        const veriJson = parcaliIstek
          ? JSON.stringify({
              __kodlama: 'parcali-v2',
              ozet: yeniOzet,
              meta: parcaliIstek.meta,
              soruParcaHashleri: parcaliIstek.soruParcaHashleri,
              toplamSoruSayisi: parcaliIstek.toplamSoruSayisi
            })
          : JSON.stringify(gelenVeri);
        sunucuDurumu.bulutKasalar.set(kullaniciAdi, {
          kullaniciAdi,
          revizyonNo: yeniRev,
          veri: parcaliIstek ? null : gelenVeri,
          veriJson,
          ozetBilgi,
          guncellemeMs: simdi,
          parcaliV2: parcaliIstek
            ? {
                meta: parcaliIstek.meta,
                soruParcaHashleri: parcaliIstek.soruParcaHashleri,
                toplamSoruSayisi: parcaliIstek.toplamSoruSayisi,
                ozet: yeniOzet
              }
            : null
        });
        if (zorlaEz) {
          for (const anahtar of Array.from(sunucuDurumu.mobilSinavPaketleri.keys())) {
            if (anahtar.startsWith(`${kullaniciAdi}::`)) {
              sunucuDurumu.mobilSinavPaketleri.delete(anahtar);
            }
          }
        }
        kaydetYerelDiskKasasi();
        return gonderJson(res, 200, {
          basarili: true,
          kaydedildi: true,
          depoTuru: 'yerel_sunucu',
          kullaniciAdi,
          revizyonNo: yeniRev,
          ozetBilgi,
          guncellemeMs: simdi,
          kodlama: parcaliIstek ? 'parcali-v2' : 'standart',
          toplamSoruSayisi: parcaliIstek ? parcaliIstek.toplamSoruSayisi : yeniOzet.soru
        });
      }

      if (yol === '/api/bulut-kasa/gecmis' && metot === 'GET') {
        const gecmis = (sunucuDurumu.bulutYedekGecmisi.get(kullaniciAdi) || []).map((r) => ({
          id: r.id,
          revizyonNo: r.revizyonNo,
          islemNotu: r.islemNotu,
          olusturmaMs: r.olusturmaMs
        }));
        return gonderJson(res, 200, { basarili: true, gecmis });
      }

      if (yol === '/api/bulut-kasa/geri-yukle' && metot === 'POST') {
        const yedekId = Number(govde && (govde.id !== undefined ? govde.id : govde.yedekId));
        if (!Number.isFinite(yedekId) || yedekId <= 0) {
          return gonderJson(res, 400, { hata: 'Geri yüklenecek geçerli yedek kimliği (id) belirtilmelidir.' });
        }
        const liste = sunucuDurumu.bulutYedekGecmisi.get(kullaniciAdi) || [];
        const bul = liste.find((x) => x.id === yedekId);
        if (!bul || !bul.veriJson) {
          return gonderJson(res, 404, { hata: 'Belirtilen yedek kaydı bulunamadı.' });
        }
        const mevcut = sunucuDurumu.bulutKasalar.get(kullaniciAdi) || null;
        if (mevcut && mevcut.veriJson) {
          ekleGecmis(mevcut.revizyonNo, mevcut.veriJson, 'Geri yükleme öncesi otomatik yedek');
        }
        const parcaliDestek = Boolean(govde && govde.parcaliDestek === true);
        let hedefDis = null;
        try { hedefDis = JSON.parse(bul.veriJson); } catch (_) { hedefDis = null; }
        const yeniRev = (mevcut ? mevcut.revizyonNo : 0) + 1;
        const simdi = Date.now();

        if (hedefDis && hedefDis.__kodlama === 'parcali-v2') {
          const temizMeta = Cekirdek.temizleYedekHassasAlanlar(hedefDis.meta || {});
          const hashler = Array.isArray(hedefDis.soruParcaHashleri) ? hedefDis.soruParcaHashleri : [];
          const toplamSoruSayisi = Number(hedefDis.toplamSoruSayisi) || 0;
          const ozet = hedefDis.ozet || Object.assign(hesaplaKasaOzeti(temizMeta), { soru: toplamSoruSayisi });
          const ozetBilgi = `Geri yüklendi (#${yedekId}) · ${ozet.ders} ders · ${toplamSoruSayisi} soru · ${ozet.ogrenci} öğrenci · ${ozet.sinav} sınav`;
          sunucuDurumu.bulutKasalar.set(kullaniciAdi, {
            kullaniciAdi,
            revizyonNo: yeniRev,
            veri: null,
            veriJson: bul.veriJson,
            ozetBilgi,
            guncellemeMs: simdi,
            parcaliV2: {
              meta: temizMeta,
              soruParcaHashleri: hashler,
              toplamSoruSayisi,
              ozet
            }
          });
          kaydetYerelDiskKasasi();
          if (parcaliDestek) {
            return gonderJson(res, 200, {
              basarili: true,
              geriYuklendi: true,
              revizyonNo: yeniRev,
              ozetBilgi,
              kodlama: 'parcali-v2',
              meta: temizMeta,
              soruParcaHashleri: hashler,
              toplamSoruSayisi
            });
          }
          const tamVeri = birlestirParcaliKasaSorulariBellek(kullaniciAdi, temizMeta, hashler);
          return gonderJson(res, 200, {
            basarili: true,
            geriYuklendi: true,
            revizyonNo: yeniRev,
            ozetBilgi,
            veri: tamVeri,
            veriPaketi: tamVeri
          });
        }

        const geriVeri = Cekirdek.temizleYedekHassasAlanlar(JSON.parse(bul.veriJson));
        const ozetBilgi = `Geri yüklendi (#${yedekId}) · ${hesaplaKasaOzeti(geriVeri).metin}`;
        sunucuDurumu.bulutKasalar.set(kullaniciAdi, {
          kullaniciAdi,
          revizyonNo: yeniRev,
          veri: geriVeri,
          veriJson: bul.veriJson,
          ozetBilgi,
          guncellemeMs: simdi
        });
        kaydetYerelDiskKasasi();
        return gonderJson(res, 200, {
          basarili: true,
          geriYuklendi: true,
          revizyonNo: yeniRev,
          ozetBilgi,
          veri: geriVeri,
          veriPaketi: geriVeri
        });
      }
      return gonderJson(res, 405, { hata: 'Desteklenmeyen HTTP metodu.' });
    };

    if (metot === 'PUT' || metot === 'POST') {
      okuJsonGovde(req, yol === '/api/bulut-kasa/parca' ? 2097152 : 16777216)
        .then((govde) => islemYap(govde))
        .catch((err) => gonderJson(res, 400, { hata: err.message }));
    } else {
      islemYap(null);
    }
    return;
  }

  // 3. Statik Dosya Sunumu (Sunucu Kaynak Kodları, Test Betikleri ve İç Veri Klasörleri Engellenir)
  const temizYol = yol === '/' ? '/index.html' : yol;
  const kucukYol = temizYol.toLowerCase();
  const engelliDesen =
    kucukYol === '/server.js' ||
    kucukYol === '/worker.js' ||
    kucukYol === '/package.json' ||
    kucukYol === '/package-lock.json' ||
    kucukYol === '/wrangler.jsonc' ||
    kucukYol === '/wrangler.toml' ||
    kucukYol === '/d1-sema.sql' ||
    kucukYol === '/_headers' ||
    kucukYol.endsWith('.sql') ||
    kucukYol.endsWith('.md') ||
    kucukYol === '/test-suite.js' ||
    kucukYol === '/omr-geometri-denetim.js' ||
    kucukYol.startsWith('/test-artifacts/') ||
    kucukYol.startsWith('/ornek-dosyalar/') ||
    kucukYol.startsWith('/node_modules/') ||
    kucukYol.startsWith('/backups/') ||
    kucukYol.startsWith('/.') ||
    /\/[a-z0-9_-]*test\.js$/i.test(kucukYol);
  if (engelliDesen) {
    res.writeHead(404, Object.assign({}, GUVENLIK_BASLIKLARI, { 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Dosya bulunamadi');
    return;
  }
  const tamDosyaYolu = path.normalize(path.join(KOK_DIZIN, temizYol));
  if (!tamDosyaYolu.startsWith(KOK_DIZIN)) {
    res.writeHead(403, GUVENLIK_BASLIKLARI);
    res.end('Erisim engellendi');
    return;
  }

  fs.readFile(tamDosyaYolu, (err, icerik) => {
    if (err) {
      res.writeHead(404, Object.assign({}, GUVENLIK_BASLIKLARI, { 'Content-Type': 'text/plain; charset=utf-8' }));
      res.end('Dosya bulunamadi');
      return;
    }
    const uzanti = path.extname(tamDosyaYolu).toLowerCase();
    res.writeHead(200, Object.assign({}, GUVENLIK_BASLIKLARI, {
      'Content-Type': MIME_TIPLERI[uzanti] || 'application/octet-stream'
    }));
    res.end(icerik);
  });
}

function baslatSunucu(port = PORT, denemeSayisi = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(istekIsleyici);
    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE' && port !== 0 && denemeSayisi < 15) {
        const yeniPort = port + 1;
        resolve(baslatSunucu(yeniPort, denemeSayisi + 1));
      } else {
        reject(err);
      }
    });
    server.listen(port, () => resolve(server));
  });
}

if (require.main === module) {
  baslatSunucu().then((srv) => {
    const aktifPort = srv.address().port;
    console.log(`Sınav Kağıdı Stüdyosu & Mobil OMR Sunucusu çalışıyor: http://127.0.0.1:${aktifPort}`);
    for (const ip of yerelAgAdresleri()) console.log(`Telefon için (aynı Wi-Fi): http://${ip}:${aktifPort}`);
  });
}

/* Telefonun erişebileceği yerel ağ (LAN) IPv4 adresleri */
function yerelAgAdresleri() {
  const sonuc = [];
  const arayuzler = require('os').networkInterfaces();
  for (const ad of Object.keys(arayuzler)) {
    for (const a of arayuzler[ad] || []) {
      if (a.family === 'IPv4' && !a.internal) sonuc.push(a.address);
    }
  }
  if (sonuc.length === 0) {
    sonuc.push('127.0.0.1');
  }
  return sonuc;
}

module.exports = { baslatSunucu, sunucuDurumu, kontrolZeroTrustYuk };
