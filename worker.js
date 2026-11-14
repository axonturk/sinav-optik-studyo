/* ==========================================================================
   EVRENSEL SINAV KAĞIDI STÜDYOSU & MOBİL OMR — CLOUDFLARE WORKER (worker.js)
   İstemciye Sıfır Güven (Zero-Trust Client), Sunucu Otoriteli Sınav & OMR API
   ========================================================================== */

import Cekirdek from './guvenlik-ve-veri.js';
// Cloudflare ücretsiz planı istek başına 10ms CPU verir; 100k PBKDF2 ≈16ms tutar ve 1102 hatası verir.
// Sunucuda yeni üretilen tüm şifre özetleri 10k iterasyonla (≈1.6ms) üretilir.
const WORKER_SIFRE_ITERASYON = 10000;

const GUVENLIK_BASLIKLARI = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob: mediastream:; worker-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
};

function ekleGuvenlikBasliklari(yanit) {
  const yeniBaslik = new Headers(yanit.headers);
  for (const [k, v] of Object.entries(GUVENLIK_BASLIKLARI)) {
    yeniBaslik.set(k, v);
  }
  return new Response(yanit.body, {
    status: yanit.status,
    statusText: yanit.statusText,
    headers: yeniBaslik
  });
}

const sunucuDurumu = {
  aktifSinav: {
    sinavId: 'SINAV-2026-GUZ',
    sinavSurumId: 'SURUM-BASLANGIC-1',
    aktif: true,
    sureDk: 40,
    sorular: (Cekirdek.VARSAYILAN_SORULAR || []).slice(0, 10)
  },
  kayitliOgrenciler: new Map(
    (Cekirdek.VARSAYILAN_OGRENCILER || []).map((o) => [o.ogrNo, o])
  ),
  hocaHesap: Object.assign({}, Cekirdek.VARSAYILAN_HOCA_HESAP),
  hocaListesi: [
    Object.assign({}, Cekirdek.VARSAYILAN_HOCA_HESAP, {
      rol: 'yonetici',
      durum: 'aktif',
      kayitTarihi: '2026-09-01'
    })
  ],
  davetKodu: Cekirdek.VARSAYILAN_DAVET_KODU,
  omrImzaSirri: '',
  omrTokenlar: new Map(),
  hizSinirlari: new Map(),
  aktifHocaTokenlar: new Set(),
  aktifHocaOturumlari: new Map(),
  aktifTokenlar: new Map(),
  ogrenciQrKuyrugu: new Map(),
  omrSonucKuyrugu: new Map(),
  kioskDelilLoglari: [],
  omrSonuclari: [],
  mobilSinavPaketleri: new Map(),
  omrSenkronOlaylari: [],
  omrSenkronEventIdSet: new Set(),
  omrSenkronSeqSayac: 0,
  v2TablolarHazir: false,
  bulutKasaSoruParcalari: new Map(),
  bulutKasalarBellek: new Map(),
  bulutGecmisBellek: new Map(),
  ogrenciHesaplari: {}, // ogrNo -> { durum, eposta, telefon, sifreHash, kodOzeti, kodAmac, kodBitisMs, kodDeneme }
  ogrenciGirisTokenlari: new Map(), // token -> { ogrNo, bitisMs }
  ogrenciBekleyenKodlar: [] // E-posta servisi yokken (geçiş modu) öğretmenin göreceği kodlar
};

/* Öğrenci hesabı zorunluluğu: varsayılan AÇIK. Yalnız OGRENCI_HESAP_ZORUNLU="0" ile kapatılabilir. */
function ogrenciHesabiZorunluMu(env) {
  return String((env && env.OGRENCI_HESAP_ZORUNLU) || '1') !== '0';
}

function epostaServisiHazirMi(env) {
  return Boolean(env && env.RESEND_API_KEY && env.EPOSTA_GONDEREN);
}

/* Doğrulama e-postası (Resend uyumlu). Servis yoksa kod öğretmen paneline düşer (geçiş modu). */
async function gonderOgrenciEpostasi(env, ep) {
  if (!ep) return { gonderildi: false };
  if (!epostaServisiHazirMi(env)) {
    sunucuDurumu.ogrenciBekleyenKodlar.unshift({
      ogrNo: ep.ogrNo, kod: ep.kod, amac: ep.amac, epostaMaske: Cekirdek.maskeleEposta(ep.kime), zamanMs: Date.now()
    });
    sunucuDurumu.ogrenciBekleyenKodlar = sunucuDurumu.ogrenciBekleyenKodlar.slice(0, 200);
    await kaydetSistemAnahtariD1(env, `ogrenci_kod:${ep.ogrNo}`, sunucuDurumu.ogrenciBekleyenKodlar[0]);
    return { gonderildi: false, gecisModu: true };
  }
  try {
    const yanit = await fetch(env.EPOSTA_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EPOSTA_GONDEREN, to: [ep.kime], subject: ep.konu, text: ep.metin })
    });
    return { gonderildi: yanit.ok, hataKodu: yanit.ok ? 0 : yanit.status };
  } catch (_) {
    return { gonderildi: false, hataKodu: 503 };
  }
}

function ogrenciGirisTokenDogrula(token, ogrNo) {
  if (!token) return false;
  const kayit = sunucuDurumu.ogrenciGirisTokenlari.get(ogrenciTokenOzeti(token));
  if (!kayit || Date.now() > kayit.bitisMs) return false;
  return String(kayit.ogrNo) === String(ogrNo);
}

async function hazirlaHashliHocaKaydiAsync(kayit) {
  const kopya = Object.assign({}, kayit);
  if (!kopya.sifreHash && typeof kopya.sifre === 'string' && kopya.sifre.length > 0) {
    // Açık kaynakta yazılı VARSAYILAN şifreyi 100.000 turla özetlemek güvenlik katmaz; yalnız her soğuk açılışta
    // ~16 ms işlemci yakar ve ücretsiz plandaki 10 ms sınırını aşıp Worker'ı 1102 döngüsüne sokuyordu.
    // Bu bilinen şifre en düşük turla özetlenir; gerçek (değiştirilmiş) şifreler 100.000 turla özetlenmeye devam eder.
    const varsayilanMi = Cekirdek.VARSAYILAN_HOCA_HESAP && kopya.sifre === Cekirdek.VARSAYILAN_HOCA_HESAP.sifre;
    kopya.sifreHash = await Cekirdek.uretTuzluSifreOzetiWebCrypto(kopya.sifre, '', WORKER_SIFRE_ITERASYON);
  }
  delete kopya.sifre;
  delete kopya.sifreTekrar;
  return kopya;
}

async function baslatGuvenliDurum(env) {
  if (!sunucuDurumu.omrImzaSirri) {
    sunucuDurumu.omrImzaSirri = uretRastgeleToken(32);
    if (env && env.SINAV_DB) {
      await kaydetSistemAnahtariD1(env, 'omr_imza_sirri', sunucuDurumu.omrImzaSirri);
    }
  }
  if (!sunucuDurumu.hocaHesap.sifreHash && sunucuDurumu.hocaHesap.sifre) {
    sunucuDurumu.hocaHesap = await hazirlaHashliHocaKaydiAsync(sunucuDurumu.hocaHesap);
  } else {
    delete sunucuDurumu.hocaHesap.sifre;
  }
  if (Array.isArray(sunucuDurumu.hocaListesi)) {
    for (let i = 0; i < sunucuDurumu.hocaListesi.length; i++) {
      if (!sunucuDurumu.hocaListesi[i].sifreHash && sunucuDurumu.hocaListesi[i].sifre) {
        sunucuDurumu.hocaListesi[i] = await hazirlaHashliHocaKaydiAsync(sunucuDurumu.hocaListesi[i]);
      } else {
        delete sunucuDurumu.hocaListesi[i].sifre;
      }
    }
  }
}

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

const sistemDurumuOnbellek = new WeakMap();

async function yukleSistemDurumuD1(env) {
  if (!env || !env.SINAV_DB) return;
  const sonOkuma = sistemDurumuOnbellek.get(env.SINAV_DB);
  if (sonOkuma && (Date.now() - sonOkuma) < 2500) return;
  try {
    const satirlar = await env.SINAV_DB.prepare('SELECT anahtar, deger_json FROM sistem_durumu').all();
    const liste = (satirlar && Array.isArray(satirlar.results)) ? satirlar.results : [];
    // Öğrenci hesapları, giriş anahtarları ve bekleyen kodlar satır satır tutulur; her yüklemede baştan kurulur
    const yeniHesaplar = {};
    const yeniTokenlar = new Map();
    const yeniKodlar = [];
    for (const s of liste) {
      if (!s || !s.anahtar || !s.deger_json) continue;
      const v = JSON.parse(s.deger_json);
      if (s.anahtar === 'hoca_yonetim' && v) {
        if (Array.isArray(v.hocaListesi) && v.hocaListesi.length > 0) sunucuDurumu.hocaListesi = v.hocaListesi;
        if (v.hocaHesap) sunucuDurumu.hocaHesap = v.hocaHesap;
        if (v.davetKodu) sunucuDurumu.davetKodu = v.davetKodu;
      } else if (s.anahtar === 'omr_imza_sirri' && typeof v === 'string' && v.length >= 32) {
        sunucuDurumu.omrImzaSirri = v;
      } else if (s.anahtar === 'omr_iptal_tidler' && Array.isArray(v)) {
        for (const tid of v) {
          if (tid) sunucuDurumu.omrTokenlar.set(tid, { iptal: true });
        }
      } else if (s.anahtar === 'hoca_oturumlari' && Array.isArray(v)) {
        sunucuDurumu.aktifHocaTokenlar = new Set();
        sunucuDurumu.aktifHocaOturumlari = new Map();
        for (const [tok, ot] of v) {
          if (tok && ot) {
            sunucuDurumu.aktifHocaTokenlar.add(tok);
            sunucuDurumu.aktifHocaOturumlari.set(tok, ot);
          }
        }
      } else if (s.anahtar === 'aktif_sinav' && v) {
        sunucuDurumu.aktifSinav = v;
      } else if (s.anahtar === 'kayitli_ogrenciler' && Array.isArray(v)) {
        sunucuDurumu.kayitliOgrenciler = new Map(v);
      } else if (s.anahtar === 'aktif_tokenlar' && Array.isArray(v)) {
        sunucuDurumu.aktifTokenlar = new Map(v);
      } else if (s.anahtar === 'ogrenci_qr_kuyruk' && Array.isArray(v)) {
        sunucuDurumu.ogrenciQrKuyrugu = new Map(v);
      } else if (s.anahtar === 'omr_sonuc_kuyruk' && Array.isArray(v)) {
        sunucuDurumu.omrSonucKuyrugu = new Map(v);
      } else if (s.anahtar === 'kiosk_loglar' && Array.isArray(v)) {
        sunucuDurumu.kioskDelilLoglari = v;
      } else if (s.anahtar === 'kurumsal_sablonlar' && Array.isArray(v)) {
        sunucuDurumu.kurumsalSablonlar = v;
      } else if (s.anahtar.startsWith('ogrenci_hesap:') && v && typeof v === 'object') {
        yeniHesaplar[s.anahtar.slice('ogrenci_hesap:'.length)] = v;
      } else if (s.anahtar.startsWith('ogrenci_token:') && v && v.bitisMs > Date.now()) {
        yeniTokenlar.set(s.anahtar.slice('ogrenci_token:'.length), v);
      } else if (s.anahtar.startsWith('ogrenci_kod:') && v && v.zamanMs) {
        yeniKodlar.push(v);
      }
    }
    sunucuDurumu.ogrenciHesaplari = yeniHesaplar;
    sunucuDurumu.ogrenciGirisTokenlari = yeniTokenlar;
    sunucuDurumu.ogrenciBekleyenKodlar = yeniKodlar.sort((a, b) => b.zamanMs - a.zamanMs).slice(0, 200);
    sistemDurumuOnbellek.set(env.SINAV_DB, Date.now());
  } catch (_) {}
}

async function silSistemAnahtariD1(env, anahtar) {
  if (!env || !env.SINAV_DB) return;
  sistemDurumuOnbellek.delete(env.SINAV_DB);
  try {
    await env.SINAV_DB.prepare('DELETE FROM sistem_durumu WHERE anahtar = ?1').bind(anahtar).run();
  } catch (_) {}
}

/* Tek öğrencinin hesabını kendi satırına yazar (silinmişse satırı siler) */
async function kaydetOgrenciHesabiD1(env, ogrNo) {
  const no = String(ogrNo || '').trim();
  if (!no) return;
  const h = sunucuDurumu.ogrenciHesaplari[no];
  if (h) await kaydetSistemAnahtariD1(env, `ogrenci_hesap:${no}`, h);
  else await silSistemAnahtariD1(env, `ogrenci_hesap:${no}`);
}

function ogrenciTokenOzeti(token) {
  return Cekirdek.uretDelilLogHash(String(token || ''), 'OGR-GIRIS-TOKEN');
}

async function kaydetSistemAnahtariD1(env, anahtar, deger) {
  if (!env || !env.SINAV_DB) return;
  sistemDurumuOnbellek.delete(env.SINAV_DB);
  try {
    await env.SINAV_DB.prepare(
      `INSERT INTO sistem_durumu (anahtar, deger_json, guncelleme_ms)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(anahtar) DO UPDATE SET deger_json = excluded.deger_json, guncelleme_ms = excluded.guncelleme_ms`
    ).bind(anahtar, JSON.stringify(deger), Date.now()).run();
  } catch (_) {}
}

const YASAKLI_ISTEMCI_ALANLARI = [
  'kagit',
  'sorular',
  'puan',
  'dogruHarf',
  'dogruCevap',
  'sinavId',
  'bitisMs'
];

function uretRastgeleToken(baytAdet = 24) {
  const dizi = new Uint8Array(baytAdet);
  crypto.getRandomValues(dizi);
  return Array.from(dizi, (b) => b.toString(16).padStart(2, '0')).join('');
}

function cozHocaTokenIstekten(request, govde = null, urlNesne = null) {
  const auth = String(request.headers.get('authorization') || '').trim();
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

async function okuHamJsonGovde(request, maksBayt = 524288) {
  const ham = await request.text();
  if (ham.length > maksBayt) {
    throw new Error('İstek boyutu sınırı aşıldı');
  }
  const nesne = ham ? JSON.parse(ham) : {};
  if (nesne && typeof nesne === 'object' && !Array.isArray(nesne)) {
    delete nesne.__proto__;
    delete nesne.constructor;
    delete nesne.prototype;
  }
  return nesne;
}

async function okuJsonGovde(request, maksBayt = 524288) {
  const ham = await request.text();
  if (ham.length > maksBayt) {
    throw new Error('İstek boyutu sınırı aşıldı');
  }
  const nesne = ham ? JSON.parse(ham) : {};
  return Cekirdek.derinTemizleNesne(nesne, 0);
}

function gonderJson(kod, veri, ekBasliklar = null) {
  return new Response(JSON.stringify(veri), {
    status: kod,
    headers: Object.assign({}, GUVENLIK_BASLIKLARI, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }, ekBasliklar || {})
  });
}

function u8ToB64(u8) {
  let ikili = '';
  const parca = 0x8000;
  for (let i = 0; i < u8.length; i += parca) {
    ikili += String.fromCharCode.apply(null, u8.subarray(i, i + parca));
  }
  return btoa(ikili);
}

function b64ToU8(b64) {
  const temiz = String(b64 || '').trim();
  if (typeof Uint8Array.fromBase64 === 'function') {
    try {
      return Uint8Array.fromBase64(temiz);
    } catch (_) {}
  }
  const ikili = atob(temiz);
  const u8 = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) u8[i] = ikili.charCodeAt(i);
  return u8;
}

function u8ToB64Url(u8) {
  return u8ToB64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToU8(str) {
  let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  return b64ToU8(s);
}

async function hmacSha256Imzala(sifre, mesaj) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(sifre),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(mesaj));
  return new Uint8Array(sig);
}

async function uretOmrEslesmeToken(env, oturum, oturumKodu = 'GENEL', sureDk = 15) {
  const tid = uretRastgeleToken(12);
  const iat = Date.now();
  const gecerlilikSn = Math.max(300, Math.min(43200, (parseInt(sureDk, 10) || 15) * 60));
  const bitisMs = iat + gecerlilikSn * 1000;
  const kod = String(oturumKodu || 'GENEL').trim().toUpperCase() || 'GENEL';
  const payload = { tid, k: oturum.kullaniciAdi, o: kod, iat, exp: bitisMs };
  const payloadB64 = u8ToB64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const imzaU8 = await hmacSha256Imzala(sunucuDurumu.omrImzaSirri, payloadB64);
  const token = `OMRT1.${payloadB64}.${u8ToB64Url(imzaU8)}`;
  sunucuDurumu.omrTokenlar.set(tid, { kullaniciAdi: oturum.kullaniciAdi, oturumKodu: kod, bitisMs, iptal: false });
  if (env && env.SINAV_DB) {
    try {
      await env.SINAV_DB.prepare(
        'INSERT OR REPLACE INTO omr_eslesme_tokenlari (token_id, kullanici_adi, oturum_kodu, olusturma_ms, bitis_ms, iptal) VALUES (?1, ?2, ?3, ?4, ?5, 0)'
      ).bind(tid, oturum.kullaniciAdi, kod, iat, bitisMs).run();
    } catch (_) {}
  }
  return { token, tid, oturumKodu: kod, bitisMs, gecerlilikSn };
}

async function dogrulaOmrVeyaHocaToken(env, token, hedefOturumKodu = '') {
  if (!token) return null;
  if (sunucuDurumu.aktifHocaTokenlar.has(token)) {
    return { tur: 'hoca', oturum: sunucuDurumu.aktifHocaOturumlari.get(token) };
  }
  if (!token.startsWith('OMRT1.')) return null;
  const parcalar = token.split('.');
  if (parcalar.length !== 3) return null;
  try {
    const beklenen = await hmacSha256Imzala(sunucuDurumu.omrImzaSirri, parcalar[1]);
    const gelen = b64UrlToU8(parcalar[2]);
    if (beklenen.length !== gelen.length) return null;
    let fark = 0;
    for (let i = 0; i < beklenen.length; i++) fark |= (beklenen[i] ^ gelen[i]);
    if (fark !== 0) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64UrlToU8(parcalar[1])));
    if (!payload || !payload.tid || !payload.exp || Date.now() >= Number(payload.exp)) return null;
    const bellekKayit = sunucuDurumu.omrTokenlar.get(payload.tid);
    if (bellekKayit && bellekKayit.iptal) return null;
    if (env && env.SINAV_DB) {
      try {
        const sat = await env.SINAV_DB.prepare(
          'SELECT iptal FROM omr_eslesme_tokenlari WHERE token_id = ?1'
        ).bind(payload.tid).first();
        if (sat && Number(sat.iptal) === 1) return null;
      } catch (_) {}
    }
    const hedefKod = String(hedefOturumKodu || '').trim().toUpperCase();
    if (payload.o && payload.o !== 'GENEL' && hedefKod && payload.o !== hedefKod) return null;
    return { tur: 'omr_eslesme', kullaniciAdi: payload.k, oturumKodu: payload.o, tid: payload.tid };
  } catch (_) {
    return null;
  }
}

/* Yalnız HATALI denemeleri sayan sınır (giriş / doğrulama kodu): sayaç artırmadan durumu okur */
async function hizSiniriDurumu(env, anahtar, maksDeneme = 8, pencereMs = 15 * 60 * 1000) {
  const simdi = Date.now();
  let sayac = 0;
  let baslangic = 0;
  if (env && env.SINAV_DB) {
    try {
      const sat = await env.SINAV_DB.prepare('SELECT sayac, pencere_baslangic_ms FROM hiz_sinirlari WHERE anahtar = ?1').bind(anahtar).first();
      if (sat) { sayac = Number(sat.sayac) || 0; baslangic = Number(sat.pencere_baslangic_ms) || 0; }
    } catch (_) {}
  } else {
    const m = sunucuDurumu.hizSinirlari.get(anahtar);
    if (m) { sayac = m.sayac; baslangic = m.pencereBaslangicMs; }
  }
  if (!baslangic || (simdi - baslangic) >= pencereMs || sayac < maksDeneme) return { asildi: false, tekrarSn: 0 };
  return { asildi: true, tekrarSn: Math.ceil(Math.max(1000, pencereMs - (simdi - baslangic)) / 1000) };
}

async function hizSiniriSifirla(env, anahtar) {
  sunucuDurumu.hizSinirlari.delete(anahtar);
  if (env && env.SINAV_DB) {
    try { await env.SINAV_DB.prepare('DELETE FROM hiz_sinirlari WHERE anahtar = ?1').bind(anahtar).run(); } catch (_) {}
  }
}

async function kontrolHizSiniri(env, anahtar, maksDeneme = 8, pencereMs = 15 * 60 * 1000) {
  const simdi = Date.now();
  if (env && env.SINAV_DB) {
    try {
      const sat = await env.SINAV_DB.prepare(
        'SELECT sayac, pencere_baslangic_ms FROM hiz_sinirlari WHERE anahtar = ?1'
      ).bind(anahtar).first();
      if (!sat || (simdi - Number(sat.pencere_baslangic_ms)) >= pencereMs) {
        await env.SINAV_DB.prepare(
          `INSERT INTO hiz_sinirlari (anahtar, sayac, pencere_baslangic_ms, guncelleme_ms)
           VALUES (?1, 1, ?2, ?2)
           ON CONFLICT(anahtar) DO UPDATE SET sayac = 1, pencere_baslangic_ms = ?2, guncelleme_ms = ?2`
        ).bind(anahtar, simdi).run();
        return { izinli: true, kalan: maksDeneme - 1, tekrarSn: 0 };
      }
      const mevcutSayac = Number(sat.sayac) || 0;
      if (mevcutSayac >= maksDeneme) {
        const kalanMs = Math.max(1000, pencereMs - (simdi - Number(sat.pencere_baslangic_ms)));
        return { izinli: false, kalan: 0, tekrarSn: Math.ceil(kalanMs / 1000) };
      }
      await env.SINAV_DB.prepare(
        'UPDATE hiz_sinirlari SET sayac = sayac + 1, guncelleme_ms = ?1 WHERE anahtar = ?2'
      ).bind(simdi, anahtar).run();
      return { izinli: true, kalan: maksDeneme - (mevcutSayac + 1), tekrarSn: 0 };
    } catch (_) {}
  }
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

async function akisOkuLimiti(stream, maksBayt = 16777216) {
  const reader = stream.getReader();
  const parcalar = [];
  let toplam = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      toplam += value.byteLength;
      if (toplam > maksBayt) {
        parcalar.length = 0;
        try { await reader.cancel('Boyut sınırı aşıldı'); } catch (_) {}
        throw new Error('Açılan veri boyutu sınırı aşıldı');
      }
      parcalar.push(value);
    }
    const birlesik = new Uint8Array(toplam);
    let ofset = 0;
    for (const p of parcalar) {
      birlesik.set(p, ofset);
      ofset += p.byteLength;
    }
    parcalar.length = 0;
    return birlesik;
  } catch (err) {
    parcalar.length = 0;
    try { await reader.cancel('Akış iptal edildi'); } catch (_) {}
    throw err;
  }
}

async function cozGzipB64HamMetin(b64Metin, maksBayt = 16777216) {
  const u8 = b64ToU8(b64Metin);
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(u8).catch(() => {});
  writer.close().catch(() => {});
  try {
    const acilmis = await akisOkuLimiti(ds.readable, maksBayt);
    return new TextDecoder().decode(acilmis);
  } catch (err) {
    try { await writer.abort(err); } catch (_) {}
    throw err;
  }
}

async function cozGzipB64Json(b64Metin) {
  const metin = await cozGzipB64HamMetin(b64Metin, 16777216);
  const nesne = JSON.parse(metin);
  return Cekirdek.derinTemizleNesne(nesne, 0);
}

async function paketleGzipB64Json(nesne) {
  const u8 = new TextEncoder().encode(JSON.stringify(nesne));
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(u8).catch(() => {});
  writer.close().catch(() => {});
  try {
    const sikis = await akisOkuLimiti(cs.readable, 16777216);
    return u8ToB64(sikis);
  } catch (err) {
    try { await writer.abort(err); } catch (_) {}
    throw err;
  }
}

async function paketleD1VeriJson(nesne) {
  const duzJson = JSON.stringify(nesne);
  if (duzJson.length > 400000) {
    const b64 = await paketleGzipB64Json(nesne);
    return JSON.stringify({ __kodlama: 'gzip-b64', veri: b64 });
  }
  return duzJson;
}

async function acD1VeriJson(veriJsonStr) {
  const parsed = JSON.parse(veriJsonStr);
  if (parsed && typeof parsed === 'object' && parsed.__kodlama === 'gzip-b64' && typeof parsed.veri === 'string') {
    return await cozGzipB64Json(parsed.veri);
  }
  return parsed;
}

async function hazirlaV2D1Tablolar(env) {
  if (sunucuDurumu.v2TablolarHazir || !env || !env.SINAV_DB) return;
  try {
    await env.SINAV_DB.batch([
      env.SINAV_DB.prepare(
        'CREATE TABLE IF NOT EXISTS mobil_sinav_paketleri (paket_anahtari TEXT PRIMARY KEY, kullanici_adi TEXT NOT NULL, sinav_kodu TEXT NOT NULL, ders_id TEXT NOT NULL DEFAULT \'\', ders_adi TEXT NOT NULL DEFAULT \'\', baslik TEXT NOT NULL DEFAULT \'\', paket_json TEXT NOT NULL, paket_hash TEXT NOT NULL DEFAULT \'\', guncelleme_ms INTEGER NOT NULL)'
      ),
      env.SINAV_DB.prepare(
        'CREATE TABLE IF NOT EXISTS omr_senkron_olaylari (seq_no INTEGER PRIMARY KEY AUTOINCREMENT, kullanici_adi TEXT NOT NULL, event_id TEXT NOT NULL, sinav_kodu TEXT NOT NULL, olay_turu TEXT NOT NULL, kaynak_cihaz TEXT NOT NULL DEFAULT \'mobil\', veri_json TEXT NOT NULL, zaman_ms INTEGER NOT NULL, UNIQUE(kullanici_adi, event_id))'
      ),
      env.SINAV_DB.prepare(
        'CREATE TABLE IF NOT EXISTS bulut_kasa_soru_parcalari (kullanici_adi TEXT NOT NULL, parca_hash TEXT NOT NULL, soru_sayisi INTEGER NOT NULL DEFAULT 0, veri_gzip_b64 TEXT NOT NULL, guncelleme_ms INTEGER NOT NULL, PRIMARY KEY (kullanici_adi, parca_hash))'
      ),
      env.SINAV_DB.prepare(
        'CREATE INDEX IF NOT EXISTS idx_bulut_kasa_parca_kullanici ON bulut_kasa_soru_parcalari (kullanici_adi, guncelleme_ms DESC)'
      )
    ]);
    sunucuDurumu.v2TablolarHazir = true;
  } catch (_) {}
}

async function sorgulaSoruParcalariD1VeyaBellek(env, kullaniciAdi, parcaHashleri, veriDahil = false) {
  const benzersiz = [];
  const goruldu = new Set();
  for (const h of (Array.isArray(parcaHashleri) ? parcaHashleri : [])) {
    const s = String(h || '').trim();
    if (!s || s.length > 128 || goruldu.has(s)) continue;
    goruldu.add(s);
    benzersiz.push(s);
  }
  const mevcutHarita = new Map();
  if (benzersiz.length > 0) {
    if (env && env.SINAV_DB) {
      const sutunlar = veriDahil ? 'parca_hash, soru_sayisi, veri_gzip_b64' : 'parca_hash, soru_sayisi';
      const sorguyuCalistir = async () => {
        mevcutHarita.clear();
        for (let i = 0; i < benzersiz.length; i += 50) {
          const grup = benzersiz.slice(i, i + 50);
          const yerTutucular = grup.map((_, idx) => `?${idx + 2}`).join(', ');
          const { results } = await env.SINAV_DB.prepare(
            `SELECT ${sutunlar} FROM bulut_kasa_soru_parcalari WHERE kullanici_adi = ?1 AND parca_hash IN (${yerTutucular})`
          ).bind(kullaniciAdi, ...grup).all();
          for (const r of (results || [])) {
            mevcutHarita.set(String(r.parca_hash), {
              parcaHash: String(r.parca_hash),
              soruSayisi: Number(r.soru_sayisi) || 0,
              veriSikistirilmis: veriDahil ? String(r.veri_gzip_b64 || '') : ''
            });
          }
        }
      };
      try {
        await sorguyuCalistir();
      } catch (err) {
        if (String(err && err.message || '').toLowerCase().includes('no such table')) {
          await hazirlaV2D1Tablolar(env);
          await sorguyuCalistir();
        } else {
          throw err;
        }
      }
    } else {
      for (const h of benzersiz) {
        const kayit = sunucuDurumu.bulutKasaSoruParcalari.get(`${kullaniciAdi}::${h}`);
        if (kayit) {
          mevcutHarita.set(h, {
            parcaHash: h,
            soruSayisi: Number(kayit.soruSayisi) || 0,
            veriSikistirilmis: veriDahil ? String(kayit.veriSikistirilmis || '') : ''
          });
        }
      }
    }
  }
  const eksikHashler = [];
  let toplamSoruSayisi = 0;
  for (const h of (Array.isArray(parcaHashleri) ? parcaHashleri : [])) {
    const s = String(h || '').trim();
    if (!s) continue;
    const k = mevcutHarita.get(s);
    if (!k) eksikHashler.push(s);
    else toplamSoruSayisi += k.soruSayisi;
  }
  return { mevcutHarita, eksikHashler, toplamSoruSayisi };
}

async function kaydetSoruParcasiD1VeyaBellek(env, kullaniciAdi, parcaHash, soruSayisi, veriSikistirilmis) {
  const simdi = Date.now();
  if (env && env.SINAV_DB) {
    const yazParca = () => env.SINAV_DB.prepare(
      `INSERT OR REPLACE INTO bulut_kasa_soru_parcalari (kullanici_adi, parca_hash, soru_sayisi, veri_gzip_b64, guncelleme_ms)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    ).bind(kullaniciAdi, parcaHash, soruSayisi, veriSikistirilmis, simdi).run();
    try {
      await yazParca();
    } catch (err) {
      if (String(err && err.message || '').toLowerCase().includes('no such table')) {
        await hazirlaV2D1Tablolar(env);
        await yazParca();
      } else {
        throw err;
      }
    }
  } else {
    sunucuDurumu.bulutKasaSoruParcalari.set(`${kullaniciAdi}::${parcaHash}`, {
      parcaHash,
      soruSayisi,
      veriSikistirilmis,
      guncellemeMs: simdi
    });
  }
}

async function birlestirParcaliKasaSorulariD1VeyaBellek(env, kullaniciAdi, metaObj, parcaHashleri) {
  const temizMeta = Cekirdek.temizleYedekHassasAlanlar(Object.assign({}, metaObj || {}));
  const hashListe = Array.isArray(parcaHashleri) ? parcaHashleri : [];
  if (!hashListe.length) {
    temizMeta.sorular = Array.isArray(temizMeta.sorular) ? temizMeta.sorular : [];
    return temizMeta;
  }
  const { mevcutHarita } = await sorgulaSoruParcalariD1VeyaBellek(env, kullaniciAdi, hashListe, true);
  const cozumlenenler = new Map();
  for (const [h, kayit] of mevcutHarita.entries()) {
    if (!kayit || !kayit.veriSikistirilmis) continue;
    const metin = await cozGzipB64HamMetin(kayit.veriSikistirilmis, 16777216);
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

async function listeleMobilSinavPaketleriD1VeyaBellek(env, kullaniciAdi) {
  let paketler = [];
  let sonSeqNo = 0;
  if (env && env.SINAV_DB) {
    await hazirlaV2D1Tablolar(env);
    try {
      const { results } = await env.SINAV_DB.prepare(
        'SELECT paket_json FROM mobil_sinav_paketleri WHERE kullanici_adi = ?1 ORDER BY guncelleme_ms DESC LIMIT 100'
      ).bind(kullaniciAdi).all();
      paketler = (results || []).map((r) => {
        try { return JSON.parse(r.paket_json); } catch (_) { return null; }
      }).filter(Boolean);
    } catch (_) { paketler = []; }
    try {
      const seqSat = await env.SINAV_DB.prepare(
        'SELECT COALESCE(MAX(seq_no), 0) AS sonSeqNo FROM omr_senkron_olaylari WHERE kullanici_adi = ?1'
      ).bind(kullaniciAdi).first();
      sonSeqNo = Number(seqSat && seqSat.sonSeqNo) || 0;
    } catch (_) { sonSeqNo = 0; }
  } else {
    for (const [anahtar, pkg] of sunucuDurumu.mobilSinavPaketleri.entries()) {
      if (anahtar.startsWith(`${kullaniciAdi}::`)) paketler.push(pkg);
    }
    const kulOlaylar = sunucuDurumu.omrSenkronOlaylari.filter((o) => o.kullaniciAdi === kullaniciAdi);
    sonSeqNo = kulOlaylar.length ? kulOlaylar[kulOlaylar.length - 1].seqNo : 0;
  }
  return { paketler, sonSeqNo };
}

async function yayinlaMobilSinavPaketiD1VeyaBellek(env, kullaniciAdi, govde) {
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
  const paketAnahtari = `${kullaniciAdi}::${sinavKodu}`;
  if (env && env.SINAV_DB) {
    await hazirlaV2D1Tablolar(env);
    await env.SINAV_DB.prepare(
      'INSERT OR REPLACE INTO mobil_sinav_paketleri (paket_anahtari, kullanici_adi, sinav_kodu, ders_id, ders_adi, baslik, paket_json, paket_hash, guncelleme_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)'
    ).bind(paketAnahtari, kullaniciAdi, sinavKodu, dersId, dersAdi, baslik, JSON.stringify(paket), paketHash, guncellemeMs).run();
  } else {
    sunucuDurumu.mobilSinavPaketleri.set(paketAnahtari, paket);
  }
  return { sinavKodu, paketHash, guncellemeMs, ogrenciSayisi: ogrenciler.length };
}

async function yazOmrSenkronOlaylariV2D1VeyaBellek(env, kullaniciAdi, hamOlaylar) {
  const yazilanlar = [];
  let atlananSayisi = 0;
  if (env && env.SINAV_DB) {
    await hazirlaV2D1Tablolar(env);
    for (const hamOlay of hamOlaylar) {
      const temizOlay = Cekirdek.dogrulaVeTemizleSenkronOlayi(hamOlay, kullaniciAdi);
      const resInsert = await env.SINAV_DB.prepare(
        'INSERT OR IGNORE INTO omr_senkron_olaylari (kullanici_adi, event_id, sinav_kodu, olay_turu, kaynak_cihaz, veri_json, zaman_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
      ).bind(
        kullaniciAdi,
        temizOlay.eventId,
        temizOlay.sinavKodu,
        temizOlay.tur,
        temizOlay.kaynakCihaz,
        JSON.stringify(temizOlay.veri),
        temizOlay.zamanMs
      ).run();
      const degisen = Number(resInsert && resInsert.meta && resInsert.meta.changes) || 0;
      if (degisen === 0) {
        atlananSayisi++;
        continue;
      }
      const seqNo = Number(resInsert && resInsert.meta && resInsert.meta.last_row_id) || 0;
      if (temizOlay.tur === 'ANAHTAR_GUNCELLE') {
        const paketAnahtari = `${kullaniciAdi}::${temizOlay.sinavKodu}`;
        const mevcutSat = await env.SINAV_DB.prepare(
          'SELECT paket_json FROM mobil_sinav_paketleri WHERE paket_anahtari = ?1'
        ).bind(paketAnahtari).first();
        if (mevcutSat && mevcutSat.paket_json) {
          try {
            const mevcutPkg = JSON.parse(mevcutSat.paket_json);
            const g = String((temizOlay.veri && temizOlay.veri.grup) || 'A').toUpperCase();
            const yeniAnahtar = Object.assign({}, mevcutPkg.cevapAnahtarlari || {});
            if (temizOlay.veri && temizOlay.veri.kitapciklar) Object.assign(yeniAnahtar, temizOlay.veri.kitapciklar);
            else if (temizOlay.veri && temizOlay.veri.anahtar) yeniAnahtar[g] = temizOlay.veri.anahtar;
            mevcutPkg.cevapAnahtarlari = yeniAnahtar;
            if (mevcutPkg.sinavYapisi && typeof mevcutPkg.sinavYapisi === 'object') {
              mevcutPkg.sinavYapisi.cevapAnahtarlari = yeniAnahtar;
            }
            mevcutPkg.guncellemeMs = Date.now();
            await env.SINAV_DB.prepare(
              'UPDATE mobil_sinav_paketleri SET paket_json = ?1, guncelleme_ms = ?2 WHERE paket_anahtari = ?3'
            ).bind(JSON.stringify(mevcutPkg), mevcutPkg.guncellemeMs, paketAnahtari).run();
          } catch (_) {}
        }
      }
      yazilanlar.push({ eventId: temizOlay.eventId, seqNo, tur: temizOlay.tur, sinavKodu: temizOlay.sinavKodu });
    }
    const seqSat = await env.SINAV_DB.prepare(
      'SELECT COALESCE(MAX(seq_no), 0) AS sonSeqNo FROM omr_senkron_olaylari WHERE kullanici_adi = ?1'
    ).bind(kullaniciAdi).first();
    const sonSeqNo = Number(seqSat && seqSat.sonSeqNo) || 0;
    return { yazilanlar, atlananSayisi, sonSeqNo };
  }

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
      const mevcutPkg = sunucuDurumu.mobilSinavPaketleri.get(`${kullaniciAdi}::${kayit.sinavKodu}`);
      if (mevcutPkg) {
        const g = String((kayit.veri && kayit.veri.grup) || 'A').toUpperCase();
        const yeniAnahtar = Object.assign({}, mevcutPkg.cevapAnahtarlari || {});
        if (kayit.veri && kayit.veri.kitapciklar) Object.assign(yeniAnahtar, kayit.veri.kitapciklar);
        else if (kayit.veri && kayit.veri.anahtar) yeniAnahtar[g] = kayit.veri.anahtar;
        mevcutPkg.cevapAnahtarlari = yeniAnahtar;
        if (mevcutPkg.sinavYapisi && typeof mevcutPkg.sinavYapisi === 'object') {
          mevcutPkg.sinavYapisi.cevapAnahtarlari = yeniAnahtar;
        }
        mevcutPkg.guncellemeMs = Date.now();
      }
    }
    yazilanlar.push({ eventId: kayit.eventId, seqNo: kayit.seqNo, tur: kayit.tur, sinavKodu: kayit.sinavKodu });
  }
  const kulOlaylar = sunucuDurumu.omrSenkronOlaylari.filter((o) => o.kullaniciAdi === kullaniciAdi);
  const sonSeqNo = kulOlaylar.length ? kulOlaylar[kulOlaylar.length - 1].seqNo : sunucuDurumu.omrSenkronSeqSayac;
  return { yazilanlar, atlananSayisi, sonSeqNo };
}

async function okuOmrSenkronOlaylariV2D1VeyaBellek(env, kullaniciAdi, sinavKoduFiltre, sinceSeq) {
  if (env && env.SINAV_DB) {
    await hazirlaV2D1Tablolar(env);
    const seqSat = await env.SINAV_DB.prepare(
      'SELECT COALESCE(MAX(seq_no), 0) AS sonSeqNo FROM omr_senkron_olaylari WHERE kullanici_adi = ?1'
    ).bind(kullaniciAdi).first();
    const sonSeqNo = Number(seqSat && seqSat.sonSeqNo) || 0;
    const stmt = (sinavKoduFiltre && sinavKoduFiltre !== 'TUMU')
      ? env.SINAV_DB.prepare(
          'SELECT seq_no, kullanici_adi, event_id, sinav_kodu, olay_turu, kaynak_cihaz, veri_json, zaman_ms FROM omr_senkron_olaylari WHERE kullanici_adi = ?1 AND seq_no > ?2 AND sinav_kodu = ?3 ORDER BY seq_no ASC LIMIT 500'
        ).bind(kullaniciAdi, sinceSeq, sinavKoduFiltre)
      : env.SINAV_DB.prepare(
          'SELECT seq_no, kullanici_adi, event_id, sinav_kodu, olay_turu, kaynak_cihaz, veri_json, zaman_ms FROM omr_senkron_olaylari WHERE kullanici_adi = ?1 AND seq_no > ?2 ORDER BY seq_no ASC LIMIT 500'
        ).bind(kullaniciAdi, sinceSeq);
    const { results } = await stmt.all();
    const olaylar = (results || []).map((r) => {
      let veri = {};
      try { veri = JSON.parse(r.veri_json || '{}'); } catch (_) { veri = {}; }
      return {
        seqNo: Number(r.seq_no) || 0,
        kullaniciAdi: r.kullanici_adi,
        eventId: r.event_id,
        sinavKodu: r.sinav_kodu,
        tur: r.olay_turu,
        kaynakCihaz: r.kaynak_cihaz,
        zamanMs: Number(r.zaman_ms) || 0,
        veri
      };
    });
    return { sonSeqNo, olaylar };
  }
  const tum = sunucuDurumu.omrSenkronOlaylari.filter((o) => o.kullaniciAdi === kullaniciAdi);
  const sonSeqNo = tum.length ? tum[tum.length - 1].seqNo : 0;
  const olaylar = tum
    .filter((o) => o.seqNo > sinceSeq && (!sinavKoduFiltre || sinavKoduFiltre === 'TUMU' || o.sinavKodu === sinavKoduFiltre))
    .slice(0, 500);
  return { sonSeqNo, olaylar };
}

export default {
  async fetch(request, env) {
    const urlNesne = new URL(request.url);
    const yol = urlNesne.pathname;
    const metot = request.method.toUpperCase();

    if (metot === 'GET' && yol === '/favicon.ico') {
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'max-age=86400' } });
    }

    if (yol.startsWith('/api/')) {
      await yukleSistemDurumuD1(env);
      await baslatGuvenliDurum(env);
    }

    if (metot === 'GET' && yol === '/api/ag-adresi') {
      return gonderJson(200, { adresler: [urlNesne.origin] });
    }

    if (yol === '/api/ogrenci-qr-senkron') {
      if (metot === 'POST') {
        try {
          const govde = await okuJsonGovde(request, 524288);
          const oturumKodu = String((govde && govde.oturumKodu) || 'GENEL').trim().toUpperCase() || 'GENEL';
          const hocaToken = cozHocaTokenIstekten(request, govde, urlNesne);
          if (!(await dogrulaOmrVeyaHocaToken(env, hocaToken, oturumKodu))) {
            return gonderJson(401, { hata: 'Öğrenci listesi QR senkronizasyonu için doğrulanmış öğretmen oturumu veya geçerli OMR eşleştirme tokenı gereklidir (401 Unauthorized).' });
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
            return gonderJson(400, { hata: 'Aktarılacak geçerli öğrenci listesi bulunamadı.' });
          }
          const kayit = { oturumKodu, ogrenciler, ogrenciSayisi: ogrenciler.length, zamanMs: Date.now() };
          sunucuDurumu.ogrenciQrKuyrugu.set(oturumKodu, kayit);
          ogrenciler.forEach((o) => sunucuDurumu.kayitliOgrenciler.set(o.ogrNo, o));
          await kaydetSistemAnahtariD1(env, 'ogrenci_qr_kuyruk', Array.from(sunucuDurumu.ogrenciQrKuyrugu.entries()));
          await kaydetSistemAnahtariD1(env, 'kayitli_ogrenciler', Array.from(sunucuDurumu.kayitliOgrenciler.entries()));
          return gonderJson(200, { basarili: true, oturumKodu, aktarilanSayi: ogrenciler.length, adet: ogrenciler.length });
        } catch (err) {
          return gonderJson(400, { hata: err.message });
        }
      }
      if (metot === 'GET') {
        const oturumKodu = String(urlNesne.searchParams.get('oturumKodu') || urlNesne.searchParams.get('oturum') || 'GENEL').trim().toUpperCase() || 'GENEL';
        const hocaToken = cozHocaTokenIstekten(request, null, urlNesne);
        if (!(await dogrulaOmrVeyaHocaToken(env, hocaToken, oturumKodu))) {
          return gonderJson(401, { hata: 'Öğrenci listesi QR kuyruğunu okumak için doğrulanmış öğretmen oturumu veya geçerli OMR eşleştirme tokenı gereklidir (401 Unauthorized).' });
        }
        const tuket = urlNesne.searchParams.get('tuket') === '1';
        const kayit = sunucuDurumu.ogrenciQrKuyrugu.get(oturumKodu) || null;
        if (kayit && tuket) {
          sunucuDurumu.ogrenciQrKuyrugu.delete(oturumKodu);
          await kaydetSistemAnahtariD1(env, 'ogrenci_qr_kuyruk', Array.from(sunucuDurumu.ogrenciQrKuyrugu.entries()));
        }
        const varMi = Boolean(kayit && Array.isArray(kayit.ogrenciler) && kayit.ogrenciler.length > 0);
        return gonderJson(200, {
          varMi,
          bulundu: varMi,
          oturumKodu,
          ogrenciler: kayit ? kayit.ogrenciler : [],
          zamanMs: kayit ? kayit.zamanMs : 0
        });
      }
    }

    if (yol === '/api/omr-sonuc-senkron') {
      if (metot === 'POST') {
        try {
          const govde = await okuJsonGovde(request, 524288);
          const oturumKodu = String((govde && govde.oturumKodu) || 'GENEL').trim().toUpperCase() || 'GENEL';
          const hocaToken = cozHocaTokenIstekten(request, govde, urlNesne);
          if (!(await dogrulaOmrVeyaHocaToken(env, hocaToken, oturumKodu))) {
            return gonderJson(401, { hata: 'OMR okuma sonucu senkronizasyonu için doğrulanmış öğretmen oturumu veya geçerli OMR eşleştirme tokenı gereklidir (401 Unauthorized).' });
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
            return gonderJson(409, { hata: cozum.hata });
          }
          if (!cozum.gecerli || okunanListe.length === 0) {
            return gonderJson(400, { hata: cozum.hata || 'Aktarılacak geçerli OMR okuma sonucu bulunamadı.' });
          }
          const kayit = { oturumKodu, sonuclar: okunanListe, okumaSonuclari: okunanListe, adet: okunanListe.length, zamanMs: Date.now() };
          sunucuDurumu.omrSonucKuyrugu.set(oturumKodu, kayit);
          sunucuDurumu.omrSonuclari = okunanListe;
          await kaydetSistemAnahtariD1(env, 'omr_sonuc_kuyruk', Array.from(sunucuDurumu.omrSonucKuyrugu.entries()));
          return gonderJson(200, {
            basarili: true,
            oturumKodu,
            aktarilanSayi: okunanListe.length,
            kayitSayisi: okunanListe.length,
            adet: okunanListe.length,
            kimlikBekleyenSayisi: okunanListe.filter((x) => x.kimlikEslesmeBekliyor).length
          });
        } catch (err) {
          return gonderJson(400, { hata: err.message });
        }
      }
      if (metot === 'GET') {
        const oturumKodu = String(urlNesne.searchParams.get('oturumKodu') || urlNesne.searchParams.get('oturum') || urlNesne.searchParams.get('kod') || 'GENEL').trim().toUpperCase() || 'GENEL';
        const hocaToken = cozHocaTokenIstekten(request, null, urlNesne);
        if (!(await dogrulaOmrVeyaHocaToken(env, hocaToken, oturumKodu))) {
          return gonderJson(401, { hata: 'OMR sonuç kuyruğunu okumak için doğrulanmış öğretmen oturumu veya geçerli OMR eşleştirme tokenı gereklidir (401 Unauthorized).' });
        }
        const tuket = urlNesne.searchParams.get('tuket') === '1';
        const kayit = sunucuDurumu.omrSonucKuyrugu.get(oturumKodu) || null;
        if (kayit && tuket) {
          sunucuDurumu.omrSonucKuyrugu.delete(oturumKodu);
          await kaydetSistemAnahtariD1(env, 'omr_sonuc_kuyruk', Array.from(sunucuDurumu.omrSonucKuyrugu.entries()));
        }
        const sonuclarList = kayit && Array.isArray(kayit.sonuclar) ? kayit.sonuclar : [];
        const varMi = sonuclarList.length > 0;
        return gonderJson(200, {
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

    if (metot === 'POST' && yol === '/api/hoca-giris') {
      try {
        const govde = await okuJsonGovde(request);
        const havuz = Array.isArray(sunucuDurumu.hocaListesi) && sunucuDurumu.hocaListesi.length > 0
          ? sunucuDurumu.hocaListesi
          : [sunucuDurumu.hocaHesap];
        // Kaba kuvvet koruması: aynı IP + kullanıcı adı için 15 dakikada 8 hatalı denemeden sonra bekletilir
        const girisIp = String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1').split(',')[0].trim();
        const sinirAnahtar = `hoca-giris-hata:${girisIp}:${String(govde.kullaniciAdi || '').trim().toLowerCase()}`;
        const sinir = await hizSiniriDurumu(env, sinirAnahtar, 8);
        if (sinir.asildi) {
          return gonderJson(429, { hata: `Çok fazla hatalı giriş denemesi. ${Math.ceil(sinir.tekrarSn / 60)} dakika sonra tekrar deneyin.` }, { 'Retry-After': String(sinir.tekrarSn) });
        }
        const sonuc = await Cekirdek.dogrulaHocaGirisAsync(govde.kullaniciAdi, govde.sifre, havuz);
        if (!sonuc.basarili) {
          if (sonuc.kod === 401) await kontrolHizSiniri(env, sinirAnahtar, 8);
          return gonderJson(sonuc.kod, { hata: sonuc.hata, durum: sonuc.durum || 'reddedildi' });
        }
        await hizSiniriSifirla(env, sinirAnahtar);
        const hocaToken = uretRastgeleToken(24);
        const simdi = Date.now();
        sunucuDurumu.aktifHocaTokenlar.add(hocaToken);
        sunucuDurumu.aktifHocaOturumlari.set(hocaToken, {
          kullaniciAdi: sonuc.kullaniciAdi,
          adSoyad: sonuc.adSoyad,
          rol: sonuc.rol || 'hoca'
        });
        await kaydetSistemAnahtariD1(env, 'hoca_oturumlari', Array.from(sunucuDurumu.aktifHocaOturumlari.entries()));
        if (env && env.SINAV_DB) {
          try {
            const tokenHash = Cekirdek.uretDelilLogHash(hocaToken, 'HOCA-OTURUM');
            const bitisMs = simdi + (24 * 60 * 60 * 1000);
            await env.SINAV_DB.prepare(
              'INSERT OR REPLACE INTO hoca_oturumlari (token_hash, kullanici_adi, ad_soyad, rol, olusturma_ms, son_erisim_ms, bitis_ms, iptal) VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, 0)'
            ).bind(tokenHash, sonuc.kullaniciAdi, sonuc.adSoyad, sonuc.rol || 'hoca', simdi, bitisMs).run();
          } catch (_) {}
        }
        return gonderJson(200, {
          token: hocaToken,
          kullaniciAdi: sonuc.kullaniciAdi,
          adSoyad: sonuc.adSoyad,
          eposta: sonuc.eposta,
          rol: sonuc.rol || 'hoca',
          durum: sonuc.durum || 'aktif'
        });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'POST' && yol === '/api/hoca-cikis') {
      try {
        const govde = await okuJsonGovde(request);
        const token = cozHocaTokenIstekten(request, govde, urlNesne);
        if (!token || !sunucuDurumu.aktifHocaTokenlar.has(token)) {
          return gonderJson(401, { hata: 'İptal edilecek geçerli öğretmen oturumu bulunamadı (401 Unauthorized).' });
        }
        const oturum = sunucuDurumu.aktifHocaOturumlari.get(token);
        sunucuDurumu.aktifHocaTokenlar.delete(token);
        sunucuDurumu.aktifHocaOturumlari.delete(token);
        const iptalTidler = [];
        if (oturum && oturum.kullaniciAdi) {
          for (const [tid, omrKayit] of sunucuDurumu.omrTokenlar.entries()) {
            if (omrKayit.iptal || String(omrKayit.kullaniciAdi || '').toLowerCase() === String(oturum.kullaniciAdi).toLowerCase()) {
              omrKayit.iptal = true;
              iptalTidler.push(tid);
            }
          }
        }
        await kaydetSistemAnahtariD1(env, 'hoca_oturumlari', Array.from(sunucuDurumu.aktifHocaOturumlari.entries()));
        if (iptalTidler.length > 0) {
          await kaydetSistemAnahtariD1(env, 'omr_iptal_tidler', iptalTidler.slice(-200));
        }
        if (env && env.SINAV_DB) {
          try {
            const tokenHash = Cekirdek.uretDelilLogHash(token, 'HOCA-OTURUM');
            await env.SINAV_DB.prepare('UPDATE hoca_oturumlari SET iptal = 1, son_erisim_ms = ?1 WHERE token_hash = ?2').bind(Date.now(), tokenHash).run();
            if (oturum && oturum.kullaniciAdi) {
              await env.SINAV_DB.prepare('UPDATE omr_eslesme_tokenlari SET iptal = 1 WHERE kullanici_adi = ?1').bind(oturum.kullaniciAdi).run();
            }
          } catch (_) {}
        }
        return gonderJson(200, { basarili: true, cikisYapildi: true });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if ((metot === 'POST' || metot === 'GET') && yol === '/api/omr-eslesme-token') {
      try {
        const govde = metot === 'POST' ? await okuJsonGovde(request) : null;
        const hocaToken = cozHocaTokenIstekten(request, govde, urlNesne);
        const oturum = hocaToken ? sunucuDurumu.aktifHocaOturumlari.get(hocaToken) : null;
        if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken) || !oturum) {
          return gonderJson(401, { hata: 'OMR eşleştirme tokenı üretmek için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const oturumKodu = (govde && govde.oturumKodu) || urlNesne.searchParams.get('oturumKodu') || urlNesne.searchParams.get('oturum') || 'GENEL';
        const sureDk = (govde && govde.sureDk) || urlNesne.searchParams.get('sureDk') || 15;
        const uretilen = await uretOmrEslesmeToken(env, oturum, oturumKodu, sureDk);
        return gonderJson(200, {
          basarili: true,
          token: uretilen.token,
          omrToken: uretilen.token,
          tokenTuru: 'omr_eslesme',
          oturumKodu: uretilen.oturumKodu,
          kullaniciAdi: oturum.kullaniciAdi,
          bitisMs: uretilen.bitisMs,
          gecerlilikSn: uretilen.gecerlilikSn
        });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'GET' && yol === '/api/mobil-ders-paketleri') {
      try {
        const token = cozHocaTokenIstekten(request, null, urlNesne);
        const yetki = await dogrulaOmrVeyaHocaToken(env, token, '');
        if (!yetki) {
          return gonderJson(401, { hata: 'Ders ve öğrenci listelerini çekmek için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const kullaniciAdi = String((yetki.oturum && yetki.oturum.kullaniciAdi) || yetki.kullaniciAdi || 'hoca').trim().toLowerCase() || 'hoca';
        let mevcut = null;
        if (env && env.SINAV_DB) {
          const sat = await env.SINAV_DB.prepare(
            `SELECT revizyon_no, guncelleme_ms, LENGTH(veri_json) AS veri_boyut,
                    CASE WHEN LENGTH(veri_json) <= 450000 OR SUBSTR(veri_json, 1, 48) LIKE '%"parcali-v2"%' THEN veri_json ELSE '' END AS hafif_veri_json
             FROM bulut_kasalar WHERE kullanici_adi = ?1`
          ).bind(kullaniciAdi).first();
          if (sat) {
            let veri = {};
            const veriBoyut = Number(sat.veri_boyut) || 0;
            if (sat.hafif_veri_json) {
              try {
                const dis = JSON.parse(sat.hafif_veri_json);
                if (dis && dis.__kodlama === 'parcali-v2') {
                  veri = Cekirdek.temizleYedekHassasAlanlar(Object.assign({}, dis.meta || {}));
                } else {
                  const acik = await acD1VeriJson(sat.hafif_veri_json);
                  veri = (acik && typeof acik === 'object') ? Cekirdek.temizleYedekHassasAlanlar(acik) : {};
                }
              } catch (_) { veri = {}; }
            } else if (veriBoyut > 250000 && veriBoyut <= 700000) {
              try {
                const tamSat = await env.SINAV_DB.prepare(
                  'SELECT veri_json FROM bulut_kasalar WHERE kullanici_adi = ?1'
                ).bind(kullaniciAdi).first();
                if (tamSat && tamSat.veri_json) {
                  const acik = await acD1VeriJson(tamSat.veri_json);
                  veri = (acik && typeof acik === 'object') ? Cekirdek.temizleYedekHassasAlanlar(acik) : {};
                }
              } catch (_) { veri = {}; }
            }
            mevcut = {
              revizyonNo: Number(sat.revizyon_no) || 0,
              guncellemeMs: Number(sat.guncelleme_ms) || 0,
              veri
            };
          }
        } else {
          const bellek = sunucuDurumu.bulutKasalarBellek.get(kullaniciAdi) || null;
          if (bellek) {
            const hamKaynak = bellek.parcaliV2 ? (bellek.parcaliV2.meta || {}) : (bellek.veri || {});
            mevcut = {
              revizyonNo: bellek.revizyonNo || 0,
              guncellemeMs: bellek.guncellemeMs || 0,
              veri: Cekirdek.temizleYedekHassasAlanlar(JSON.parse(JSON.stringify(hamKaynak)))
            };
          }
        }
        const dersler = Cekirdek.uretMobilDersPaketleriOzeti((mevcut && mevcut.veri) || {});
        const kasaGuncellemeMs = Number(mevcut && mevcut.guncellemeMs) || 0;
        const v2Bilgi = await listeleMobilSinavPaketleriD1VeyaBellek(env, kullaniciAdi);
        const birlesikHarita = new Map();
        dersler.forEach((d, idx) => {
          const k = String(d.dersId || d.id || d.sinavKodu || `D_${idx}`).trim();
          birlesikHarita.set(k, Object.assign({}, d));
        });
        v2Bilgi.paketler.forEach((pkg) => {
          if (kasaGuncellemeMs > 0 && (Number(pkg && pkg.guncellemeMs) || 0) <= kasaGuncellemeMs) return;
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
          const k = eslesenAnahtar || paketId || paketKod;
          if (!k) return;
          const onceki = birlesikHarita.get(k) || {};
          birlesikHarita.set(k, Object.assign({}, onceki, pkg, {
            ogrenciler: (Array.isArray(pkg.ogrenciler) && pkg.ogrenciler.length) ? pkg.ogrenciler : (onceki.ogrenciler || [])
          }));
        });
        return gonderJson(200, {
          basarili: true,
          kullaniciAdi,
          revizyonNo: mevcut ? mevcut.revizyonNo : 0,
          guncellemeMs: mevcut ? mevcut.guncellemeMs : 0,
          sonSeqNo: v2Bilgi.sonSeqNo,
          dersler: Array.from(birlesikHarita.values())
        });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'POST' && yol === '/api/v2/sinav-paket-yayinla') {
      try {
        const govde = await okuJsonGovde(request, 2097152);
        const token = cozHocaTokenIstekten(request, govde, urlNesne);
        const yetki = await dogrulaOmrVeyaHocaToken(env, token, '');
        if (!yetki) {
          return gonderJson(401, { hata: 'Sınav paketi yayınlamak için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const kullaniciAdi = String((yetki.oturum && yetki.oturum.kullaniciAdi) || yetki.kullaniciAdi || 'hoca').trim().toLowerCase() || 'hoca';
        const sonuc = await yayinlaMobilSinavPaketiD1VeyaBellek(env, kullaniciAdi, govde);
        return gonderJson(200, Object.assign({ basarili: true, kullaniciAdi }, sonuc));
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'POST' && yol === '/api/v2/sinav-senkron') {
      try {
        const govde = await okuJsonGovde(request, 2097152);
        const token = cozHocaTokenIstekten(request, govde, urlNesne);
        const yetki = await dogrulaOmrVeyaHocaToken(env, token, (govde && govde.oturumKodu) || '');
        if (!yetki) {
          return gonderJson(401, { hata: 'Senkron olayı göndermek için doğrulanmış öğretmen veya OMR eşleşme tokenı gereklidir (401 Unauthorized).' });
        }
        const kullaniciAdi = String((yetki.oturum && yetki.oturum.kullaniciAdi) || yetki.kullaniciAdi || 'hoca').trim().toLowerCase() || 'hoca';
        const hamOlaylar = Array.isArray(govde && govde.olaylar)
          ? govde.olaylar
          : (govde && govde.olay ? [govde.olay] : []);
        if (!hamOlaylar.length) {
          return gonderJson(400, { hata: 'En az 1 geçerli senkron olayı (olaylar[]) gönderilmelidir.' });
        }
        if (hamOlaylar.length > 200) {
          return gonderJson(400, { hata: 'Tek istekte en fazla 200 senkron olayı gönderilebilir.' });
        }
        const sonuc = await yazOmrSenkronOlaylariV2D1VeyaBellek(env, kullaniciAdi, hamOlaylar);
        return gonderJson(200, {
          basarili: true,
          kullaniciAdi,
          yazilanSayisi: sonuc.yazilanlar.length,
          atlananSayisi: sonuc.atlananSayisi,
          sonSeqNo: sonuc.sonSeqNo,
          yazilanlar: sonuc.yazilanlar
        });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'GET' && yol === '/api/v2/sinav-senkron') {
      try {
        const token = cozHocaTokenIstekten(request, null, urlNesne);
        const yetki = await dogrulaOmrVeyaHocaToken(env, token, '');
        if (!yetki) {
          return gonderJson(401, { hata: 'Senkron olaylarını okumak için doğrulanmış öğretmen veya OMR eşleşme tokenı gereklidir (401 Unauthorized).' });
        }
        const kullaniciAdi = String((yetki.oturum && yetki.oturum.kullaniciAdi) || yetki.kullaniciAdi || 'hoca').trim().toLowerCase() || 'hoca';
        const sinceSeq = Math.max(0, parseInt(urlNesne.searchParams.get('sinceSeq') || '0', 10) || 0);
        const sinavKoduFiltre = String(urlNesne.searchParams.get('sinavKodu') || '').trim();
        const sonuc = await okuOmrSenkronOlaylariV2D1VeyaBellek(env, kullaniciAdi, sinavKoduFiltre, sinceSeq);
        return gonderJson(200, {
          basarili: true,
          kullaniciAdi,
          sinceSeq,
          sonSeqNo: sonuc.sonSeqNo,
          olaylar: sonuc.olaylar
        });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'POST' && yol === '/api/hoca-basvuru') {
      try {
        const govde = await okuJsonGovde(request);
        const dogrulama = Cekirdek.dogrulaHocaHesapKayit(govde, {
          davetKoduKontrol: true,
          beklenenDavetKodu: sunucuDurumu.davetKodu,
          mevcutHocalar: sunucuDurumu.hocaListesi
        });
        if (!dogrulama.gecerli) {
          const kod = String(dogrulama.hata || '').includes('davet kodu') ? 403 : 400;
          return gonderJson(kod, { hata: dogrulama.hata });
        }
        const sifreHash = await Cekirdek.uretTuzluSifreOzetiWebCrypto(String(govde.sifre), '', WORKER_SIFRE_ITERASYON);
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
        await kaydetSistemAnahtariD1(env, 'hoca_yonetim', {
          hocaListesi: sunucuDurumu.hocaListesi,
          hocaHesap: sunucuDurumu.hocaHesap,
          davetKodu: sunucuDurumu.davetKodu
        });
        return gonderJson(201, {
          basarili: true,
          kullaniciAdi: yeniKayit.kullaniciAdi,
          adSoyad: yeniKayit.adSoyad,
          eposta: yeniKayit.eposta,
          rol: yeniKayit.rol,
          durum: yeniKayit.durum,
          mesaj: 'Öğretmen başvurunuz alındı ve yönetici onayına gönderildi.'
        });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'POST' && yol === '/api/hoca-sifre-kurtar') {
      try {
        const ip = String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1').split(',')[0].trim();
        const limit = await kontrolHizSiniri(env, `hoca-sifre-kurtar:${ip}`, 8, 15 * 60 * 1000);
        if (!limit.izinli) {
          return gonderJson(
            429,
            { hata: 'Çok fazla şifre sıfırlama denemesi yapıldı. Lütfen daha sonra tekrar deneyiniz (429 Too Many Requests).' },
            { 'Retry-After': String(limit.tekrarSn) }
          );
        }
        const govde = await okuJsonGovde(request);
        const havuz = Array.isArray(sunucuDurumu.hocaListesi) && sunucuDurumu.hocaListesi.length > 0
          ? sunucuDurumu.hocaListesi
          : [sunucuDurumu.hocaHesap];
        const sonuc = Cekirdek.sifirlaHocaSifreEpostaTelefon(govde, havuz, { hashAtla: true });
        if (!sonuc.basarili) {
          return gonderJson(sonuc.kod || 403, { hata: sonuc.hata });
        }
        const yeniHash = await Cekirdek.uretTuzluSifreOzetiWebCrypto(String(govde.yeniSifre), '', WORKER_SIFRE_ITERASYON);
        const guncelKayit = havuz.find((h) => String(h.kullaniciAdi || '').toLowerCase() === String(sonuc.kullaniciAdi).toLowerCase());
        if (guncelKayit) {
          guncelKayit.sifreHash = yeniHash;
          delete guncelKayit.sifre;
        }
        if (sonuc.rol === 'yonetici') {
          sunucuDurumu.hocaHesap.sifreHash = yeniHash;
          delete sunucuDurumu.hocaHesap.sifre;
        }
        await kaydetSistemAnahtariD1(env, 'hoca_yonetim', {
          hocaListesi: sunucuDurumu.hocaListesi,
          hocaHesap: sunucuDurumu.hocaHesap,
          davetKodu: sunucuDurumu.davetKodu
        });
        return gonderJson(200, {
          basarili: true,
          kullaniciAdi: sonuc.kullaniciAdi,
          adSoyad: sonuc.adSoyad,
          eposta: sonuc.eposta,
          rol: sonuc.rol,
          mesaj: `Şifreniz başarıyla sıfırlandı (${sonuc.kullaniciAdi}).`
        });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'GET' && yol === '/api/hoca-liste') {
      const token = cozHocaTokenIstekten(request, null, urlNesne);
      const oturum = token ? sunucuDurumu.aktifHocaOturumlari.get(token) : null;
      if (!token || !sunucuDurumu.aktifHocaTokenlar.has(token) || !oturum) {
        return gonderJson(401, { hata: 'Hoca listesini görüntülemek için geçerli öğretmen oturumu gereklidir (401 Unauthorized).' });
      }
      return gonderJson(200, {
        hocalar: hocaListesiGuvenliOzet(sunucuDurumu.hocaListesi),
        davetKodu: oturum.rol === 'yonetici' ? sunucuDurumu.davetKodu : undefined,
        aktifRol: oturum.rol
      });
    }

    if (metot === 'POST' && yol === '/api/hoca-yonetim') {
      try {
        const govde = await okuJsonGovde(request);
        const token = cozHocaTokenIstekten(request, govde, urlNesne);
        const oturum = token ? sunucuDurumu.aktifHocaOturumlari.get(token) : null;
        if (!token || !sunucuDurumu.aktifHocaTokenlar.has(token) || !oturum) {
          return gonderJson(401, { hata: 'Bu işlem için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const islem = String(govde.islem || '').trim();
        if (islem === 'sifre_guncelle') {
          const dogrulama = Cekirdek.dogrulaHocaHesapKayit(govde, {
            davetKoduKontrol: false,
            mevcutHocalar: sunucuDurumu.hocaListesi,
            haricKullaniciAdi: oturum.kullaniciAdi
          });
          if (!dogrulama.gecerli) return gonderJson(400, { hata: dogrulama.hata });
          const kayit = sunucuDurumu.hocaListesi.find(
            (h) => String(h.kullaniciAdi).toLowerCase() === String(oturum.kullaniciAdi).toLowerCase()
          );
          if (!kayit) return gonderJson(404, { hata: 'Güncellenecek hoca kaydı bulunamadı.' });
          kayit.kullaniciAdi = dogrulama.kullaniciAdi;
          kayit.adSoyad = dogrulama.adSoyad;
          kayit.eposta = dogrulama.eposta;
          kayit.telefon = dogrulama.telefon;
          kayit.sifreHash = await Cekirdek.uretTuzluSifreOzetiWebCrypto(String(govde.sifre), '', WORKER_SIFRE_ITERASYON);
          delete kayit.sifre;
          oturum.kullaniciAdi = dogrulama.kullaniciAdi;
          oturum.adSoyad = dogrulama.adSoyad;
          if (kayit.rol === 'yonetici') sunucuDurumu.hocaHesap = Object.assign({}, kayit);
          await kaydetSistemAnahtariD1(env, 'hoca_yonetim', {
            hocaListesi: sunucuDurumu.hocaListesi,
            hocaHesap: sunucuDurumu.hocaHesap,
            davetKodu: sunucuDurumu.davetKodu
          });
          await kaydetSistemAnahtariD1(env, 'hoca_oturumlari', Array.from(sunucuDurumu.aktifHocaOturumlari.entries()));
          return gonderJson(200, {
            basarili: true,
            kullaniciAdi: kayit.kullaniciAdi,
            adSoyad: kayit.adSoyad,
            hocalar: hocaListesiGuvenliOzet(sunucuDurumu.hocaListesi)
          });
        }
        if (oturum.rol !== 'yonetici') {
          return gonderJson(403, { hata: 'Bu işlem yalnızca sistem yöneticisi yetkisiyle yapılabilir (403 Forbidden).' });
        }
        if (islem === 'davet_kodu_yenile') {
          sunucuDurumu.davetKodu = Cekirdek.uretYeniDavetKodu('AKADEMI');
          await kaydetSistemAnahtariD1(env, 'hoca_yonetim', {
            hocaListesi: sunucuDurumu.hocaListesi,
            hocaHesap: sunucuDurumu.hocaHesap,
            davetKodu: sunucuDurumu.davetKodu
          });
          return gonderJson(200, {
            basarili: true,
            davetKodu: sunucuDurumu.davetKodu,
            hocalar: hocaListesiGuvenliOzet(sunucuDurumu.hocaListesi)
          });
        }
        const hedefKullanici = String(govde.kullaniciAdi || '').trim().toLowerCase();
        const idx = sunucuDurumu.hocaListesi.findIndex(
          (h) => String(h.kullaniciAdi || '').trim().toLowerCase() === hedefKullanici
        );
        if (idx === -1) return gonderJson(404, { hata: 'İşlem yapılacak öğretmen kaydı bulunamadı.' });
        const hedefKayit = sunucuDurumu.hocaListesi[idx];
        if (islem === 'onayla') {
          hedefKayit.durum = 'aktif';
          await kaydetSistemAnahtariD1(env, 'hoca_yonetim', {
            hocaListesi: sunucuDurumu.hocaListesi,
            hocaHesap: sunucuDurumu.hocaHesap,
            davetKodu: sunucuDurumu.davetKodu
          });
          return gonderJson(200, { basarili: true, kullaniciAdi: hedefKayit.kullaniciAdi, durum: 'aktif', hocalar: hocaListesiGuvenliOzet(sunucuDurumu.hocaListesi) });
        }
        if (islem === 'askiya_al') {
          if (hedefKayit.rol === 'yonetici') return gonderJson(400, { hata: 'Ana sistem yöneticisi hesabı askıya alınamaz.' });
          hedefKayit.durum = 'askida';
          for (const [tok, ot] of sunucuDurumu.aktifHocaOturumlari.entries()) {
            if (String(ot.kullaniciAdi).toLowerCase() === hedefKullanici) {
              sunucuDurumu.aktifHocaOturumlari.delete(tok);
              sunucuDurumu.aktifHocaTokenlar.delete(tok);
            }
          }
          await kaydetSistemAnahtariD1(env, 'hoca_yonetim', {
            hocaListesi: sunucuDurumu.hocaListesi,
            hocaHesap: sunucuDurumu.hocaHesap,
            davetKodu: sunucuDurumu.davetKodu
          });
          await kaydetSistemAnahtariD1(env, 'hoca_oturumlari', Array.from(sunucuDurumu.aktifHocaOturumlari.entries()));
          return gonderJson(200, { basarili: true, kullaniciAdi: hedefKayit.kullaniciAdi, durum: 'askida', hocalar: hocaListesiGuvenliOzet(sunucuDurumu.hocaListesi) });
        }
        if (islem === 'sil') {
          if (hedefKayit.rol === 'yonetici') return gonderJson(400, { hata: 'Ana sistem yöneticisi hesabı silinemez.' });
          const silinen = sunucuDurumu.hocaListesi.splice(idx, 1)[0];
          for (const [tok, ot] of sunucuDurumu.aktifHocaOturumlari.entries()) {
            if (String(ot.kullaniciAdi).toLowerCase() === hedefKullanici) {
              sunucuDurumu.aktifHocaOturumlari.delete(tok);
              sunucuDurumu.aktifHocaTokenlar.delete(tok);
            }
          }
          await kaydetSistemAnahtariD1(env, 'hoca_yonetim', {
            hocaListesi: sunucuDurumu.hocaListesi,
            hocaHesap: sunucuDurumu.hocaHesap,
            davetKodu: sunucuDurumu.davetKodu
          });
          await kaydetSistemAnahtariD1(env, 'hoca_oturumlari', Array.from(sunucuDurumu.aktifHocaOturumlari.entries()));
          return gonderJson(200, { basarili: true, silinenKullaniciAdi: silinen.kullaniciAdi, hocalar: hocaListesiGuvenliOzet(sunucuDurumu.hocaListesi) });
        }
        return gonderJson(400, { hata: 'Geçersiz yönetim işlemi.' });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'POST' && yol === '/api/online-sinav-tanimla') {
      try {
        const govde = await okuJsonGovde(request, 524288);
        const hocaToken = cozHocaTokenIstekten(request, govde, urlNesne);
        if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
          return gonderJson(401, { hata: 'Online sınav tanımlamak veya güncellemek için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        if (!govde || typeof govde !== 'object' || Array.isArray(govde)) {
          return gonderJson(400, { hata: 'Geçersiz sınav tanım gövdesi.' });
        }
        const sinav = govde.sinav || govde;
        const yeniSurumId = `SURUM-${Date.now()}-${uretRastgeleToken(4)}`;
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
          havuzSorulari: Array.isArray(sinav.havuzSorulari) && sinav.havuzSorulari.length > 0 ? sinav.havuzSorulari : null,
          sorular: Array.isArray(sinav.sorular) && sinav.sorular.length > 0 ? sinav.sorular : sunucuDurumu.aktifSinav.sorular
        };
        if (Array.isArray(govde.ogrenciler)) {
          govde.ogrenciler.forEach((o) => {
            if (o && typeof o.ogrNo === 'string' && o.ogrNo.trim()) {
              sunucuDurumu.kayitliOgrenciler.set(o.ogrNo.trim(), o);
            }
          });
        }
        await kaydetSistemAnahtariD1(env, 'aktif_sinav', sunucuDurumu.aktifSinav);
        await kaydetSistemAnahtariD1(env, 'kayitli_ogrenciler', Array.from(sunucuDurumu.kayitliOgrenciler.entries()));
        return gonderJson(200, {
          kaydedildi: true,
          sinavId: sunucuDurumu.aktifSinav.sinavId,
          sinavSurumId: sunucuDurumu.aktifSinav.sinavSurumId,
          aktif: sunucuDurumu.aktifSinav.aktif,
          sureDk: sunucuDurumu.aktifSinav.sureDk,
          soruSayisi: sunucuDurumu.aktifSinav.sorular.length
        });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'GET' && yol === '/api/online-sinav-durum') {
      const s = sunucuDurumu.aktifSinav;
      return gonderJson(200, {
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

    // ---- Öğrenci hesabı: ayar / durum / ilk kayıt + e-posta kodu / giriş / şifre yenileme / öğretmen paneli ----
    if (metot === 'GET' && yol === '/api/ogrenci-hesap/ayar') {
      return gonderJson(200, { hesapZorunlu: ogrenciHesabiZorunluMu(env), epostaHazir: epostaServisiHazirMi(env) });
    }
    if (yol === '/api/ogrenci-hesap/hoca-liste' || yol === '/api/ogrenci-hesap/hoca-sifirla') {
      try {
        let govde = {};
        if (metot === 'POST') { try { govde = await okuJsonGovde(request); } catch (_) { govde = {}; } }
        const token = cozHocaTokenIstekten(request, govde, urlNesne);
        if (!token || !sunucuDurumu.aktifHocaTokenlar.has(token)) {
          return gonderJson(401, { hata: 'Öğretmen oturumu gerekli.' });
        }
        const eylem = yol.endsWith('hoca-liste') ? 'hoca-liste' : 'hoca-sifirla';
        const r = await Cekirdek.isleOgrenciHesapIstegi(eylem, govde || {}, { hesaplar: sunucuDurumu.ogrenciHesaplari, kayitliOgrenciler: sunucuDurumu.kayitliOgrenciler, sifreIterasyon: WORKER_SIFRE_ITERASYON });
        if (r.degisti) await kaydetOgrenciHesabiD1(env, govde && govde.ogrNo);
        if (eylem === 'hoca-liste') {
          r.veri.epostaHazir = epostaServisiHazirMi(env);
          r.veri.bekleyenKodlar = epostaServisiHazirMi(env) ? [] : sunucuDurumu.ogrenciBekleyenKodlar.filter((k) => Date.now() - k.zamanMs < 10 * 60 * 1000);
        }
        return gonderJson(r.kod, r.veri);
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }
    if (metot === 'POST' && /^\/api\/ogrenci-hesap\/(durum|kayit-baslat|kayit-onayla|giris|sifre-sifirla-baslat|sifre-sifirla-onayla)$/.test(yol)) {
      try {
        const eylem = yol.split('/').pop();
        const ip = String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1').split(',')[0].trim();
        const genelSinir = await kontrolHizSiniri(env, `ogr-hesap:${ip}`, 120, 15 * 60 * 1000);
        if (!genelSinir.izinli) {
          return gonderJson(429, { hata: 'Çok fazla istek. Biraz sonra tekrar deneyin.' }, { 'Retry-After': String(genelSinir.tekrarSn) });
        }
        const govde = await okuJsonGovde(request);
        // Hesap işlemlerinde 2,5 sn'lik önbellek atlanır: başka kopyada (isolate) az önce yazılan kayıt/kod görülsün
        if (env && env.SINAV_DB) { sistemDurumuOnbellek.delete(env.SINAV_DB); await yukleSistemDurumuD1(env); }
        const ogrNo = String((govde && govde.ogrNo) || '').trim();
        const girisSinirAnahtar = `ogr-giris-hata:${ip}:${ogrNo}`;
        if (eylem === 'giris') {
          const s2 = await hizSiniriDurumu(env, girisSinirAnahtar, 8);
          if (s2.asildi) return gonderJson(429, { hata: `Çok fazla hatalı giriş. ${Math.ceil(s2.tekrarSn / 60)} dakika sonra tekrar deneyin.` }, { 'Retry-After': String(s2.tekrarSn) });
        }
        if (eylem === 'kayit-baslat' || eylem === 'sifre-sifirla-baslat') {
          const s2 = await kontrolHizSiniri(env, `ogr-kod-gonder:${ogrNo}`, 4, 15 * 60 * 1000);
          if (!s2.izinli) return gonderJson(429, { hata: `Çok sık kod istendi. ${Math.ceil(s2.tekrarSn / 60)} dakika sonra tekrar deneyin.` }, { 'Retry-After': String(s2.tekrarSn) });
        }
        const r = await Cekirdek.isleOgrenciHesapIstegi(eylem, govde || {}, { hesaplar: sunucuDurumu.ogrenciHesaplari, kayitliOgrenciler: sunucuDurumu.kayitliOgrenciler, sifreIterasyon: WORKER_SIFRE_ITERASYON });
        if (eylem === 'giris') {
          if (r.kod === 401) await kontrolHizSiniri(env, girisSinirAnahtar, 8);
          if (r.kod === 200) await hizSiniriSifirla(env, girisSinirAnahtar);
        }
        if (r.degisti) await kaydetOgrenciHesabiD1(env, ogrNo);
        if (r.eposta) {
          const g = await gonderOgrenciEpostasi(env, r.eposta);
          r.veri.epostaGonderildi = Boolean(g.gonderildi);
          if (g.gecisModu) r.veri.gecisModu = true;
          if (!g.gonderildi && !g.gecisModu) {
            return gonderJson(502, { hata: 'Doğrulama e-postası gönderilemedi. Biraz sonra tekrar deneyin veya öğretmeninize başvurun.' });
          }
        }
        if (r.girisOgrNo) {
          const token = uretRastgeleToken(24);
          const tokenKaydi = { ogrNo: r.girisOgrNo, bitisMs: Date.now() + 4 * 60 * 60 * 1000 };
          sunucuDurumu.ogrenciGirisTokenlari.set(ogrenciTokenOzeti(token), tokenKaydi);
          await kaydetSistemAnahtariD1(env, `ogrenci_token:${ogrenciTokenOzeti(token)}`, tokenKaydi);
          // Süresi dolmuş giriş anahtarı satırlarını temizle (tablo şişmesin)
          if (env && env.SINAV_DB) {
            try {
              await env.SINAV_DB.prepare("DELETE FROM sistem_durumu WHERE anahtar LIKE 'ogrenci_token:%' AND guncelleme_ms < ?1")
                .bind(Date.now() - 4 * 60 * 60 * 1000).run();
            } catch (_) {}
          }
          r.veri.girisToken = token;
        }
        return gonderJson(r.kod, r.veri);
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'POST' && yol === '/api/ogrenci-oturum-baslat') {
      try {
        const govde = await okuJsonGovde(request);
        const ihlal = kontrolZeroTrustYuk(govde, true);
        if (ihlal) return gonderJson(400, { hata: ihlal });
        // Öğrenci hesabı zorunluyken oturum yalnız numara + şifreyle giriş yapmış öğrenciye açılır
        if (ogrenciHesabiZorunluMu(env) && env && env.SINAV_DB && !ogrenciGirisTokenDogrula(govde.girisToken, String(govde.ogrNo || '').trim())) {
          sistemDurumuOnbellek.delete(env.SINAV_DB);
          await yukleSistemDurumuD1(env);
        }
        if (ogrenciHesabiZorunluMu(env) && !ogrenciGirisTokenDogrula(govde.girisToken, String(govde.ogrNo || '').trim())) {
          return gonderJson(401, { hata: 'Sınava başlamak için önce öğrenci numaranız ve şifrenizle giriş yapın.', girisGerekli: true });
        }
        if (!sunucuDurumu.aktifSinav || !sunucuDurumu.aktifSinav.aktif) {
          return gonderJson(403, { hata: 'Aktif bir online sınav bulunmuyor.' });
        }
        const simdiMs = Date.now();
        if (sunucuDurumu.aktifSinav.baslangic) {
          const basMs = Date.parse(sunucuDurumu.aktifSinav.baslangic);
          if (Number.isFinite(basMs) && simdiMs < basMs) {
            return gonderJson(403, { hata: 'Online sınav başlangıç zamanı henüz gelmemiştir.' });
          }
        }
        if (sunucuDurumu.aktifSinav.bitis) {
          const bitMs = Date.parse(sunucuDurumu.aktifSinav.bitis);
          if (Number.isFinite(bitMs) && simdiMs > bitMs) {
            return gonderJson(403, { hata: 'Online sınav bitiş süresi sona ermiştir.' });
          }
        }
        if (sunucuDurumu.aktifSinav.erisimKodu) {
          const girilenKod = String(govde.erisimKodu || govde.salonKodu || '').trim();
          if (girilenKod !== String(sunucuDurumu.aktifSinav.erisimKodu).trim()) {
            return gonderJson(403, { hata: 'Sınav salon/giriş kodu doğrulanamadı.' });
          }
        }
        const ogrNo = String(govde.ogrNo || '').trim();
        if (!ogrNo || !sunucuDurumu.kayitliOgrenciler.has(ogrNo)) {
          return gonderJson(401, { hata: 'Kayıtlı öğrenci numarası doğrulanamadı.' });
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

        const gelenKurtarma = String(govde.kurtarmaAnahtari || '').trim();
        const gelenToken = cozHocaTokenIstekten(request, govde, urlNesne);
        for (const [mevcutToken, mevcutOt] of sunucuDurumu.aktifTokenlar.entries()) {
          if (
            mevcutOt.ogrNo === ogr.ogrNo &&
            mevcutOt.sinavId === aktifSinavId &&
            (mevcutOt.sinavSurumId || 'SURUM-BASLANGIC-1') === aktifSinavSurumId
          ) {
            if (mevcutOt.bitti) {
              return gonderJson(409, { hata: 'Bu sınav oturumu daha önce tamamlanmış ve teslim edilmiştir; tekrar başlatılamaz.' });
            }
            if (Date.now() >= mevcutOt.bitisMs) {
              return gonderJson(403, { hata: 'Sınav oturum süreniz dolmuştur; süre sıfırlanamaz veya yeniden başlatılamaz.' });
            }
            const gelenKurtarmaHash = gelenKurtarma ? Cekirdek.uretDelilLogHash(gelenKurtarma, 'OGR-KURTARMA') : '';
            const kurtarmaEslesir = Boolean(
              gelenKurtarmaHash &&
              mevcutOt.kurtarmaAnahtariHash &&
              Cekirdek.sabitSureliEsitMi(gelenKurtarmaHash, mevcutOt.kurtarmaAnahtariHash)
            );
            const tokenEslesir = Boolean(gelenToken && Cekirdek.sabitSureliEsitMi(gelenToken, mevcutToken));
            if ((gelenKurtarma && !kurtarmaEslesir) || (gelenToken && !tokenEslesir) || (!kurtarmaEslesir && !tokenEslesir)) {
              return gonderJson(409, {
                hata: 'Bu öğrenci numarası için başka bir cihazda/oturumda aktif bir sınav oturumu devam etmektedir. Oturum devralma reddedildi (409 Conflict).',
                oturumCakismasi: true
              });
            }
            const mevcutSorular = hazirlaIstemciSorulari(mevcutOt.sorular || sunucuDurumu.aktifSinav.sorular);
            return gonderJson(200, {
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

        const istemciSorulari = hazirlaIstemciSorulari(oturumSorulari);

        const token = uretRastgeleToken(24);
        const kurtarmaAnahtari = (typeof govde.kurtarmaAnahtari === 'string' && govde.kurtarmaAnahtari.trim().length >= 8)
          ? govde.kurtarmaAnahtari.trim()
          : uretRastgeleToken(16);
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
        await kaydetSistemAnahtariD1(env, 'aktif_tokenlar', Array.from(sunucuDurumu.aktifTokenlar.entries()));
        if (env && env.SINAV_DB) {
          try {
            const tokenHash = Cekirdek.uretDelilLogHash(token, 'OGR-OTURUM');
            const durumJson = JSON.stringify({ adSoyad: ogr.adSoyad, cevaplar: {}, bitti: false });
            await env.SINAV_DB.prepare(
              `INSERT OR REPLACE INTO ogrenci_oturumlari
               (token_hash, sinav_id, sinav_surum_id, ogr_no, kurtarma_anahtari_hash, durum_json, bitis_ms, bitti, guncelleme_ms)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8)`
            ).bind(tokenHash, aktifSinavId, aktifSinavSurumId, ogr.ogrNo, kurtarmaAnahtariHash, durumJson, bitisMs, Date.now()).run();
          } catch (_) {}
        }
        return gonderJson(200, {
          token,
          kurtarmaAnahtari,
          ogrNo: ogr.ogrNo,
          adSoyad: ogr.adSoyad,
          bitisMs,
          soruSayisi: istemciSorulari.length,
          sorular: istemciSorulari
        });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'POST' && yol === '/api/ogrenci-cevap') {
      try {
        const govde = await okuJsonGovde(request);
        const ihlal = kontrolZeroTrustYuk(govde, false);
        if (ihlal) return gonderJson(400, { hata: ihlal });

        const token = cozHocaTokenIstekten(request, govde, urlNesne);
        const oturum = sunucuDurumu.aktifTokenlar.get(token);
        if (!oturum) return gonderJson(401, { hata: 'Geçersiz veya süresi dolmuş oturum tokenı.' });
        const aktifSurumId = (sunucuDurumu.aktifSinav && sunucuDurumu.aktifSinav.sinavSurumId) || 'SURUM-BASLANGIC-1';
        if (
          !sunucuDurumu.aktifSinav ||
          !sunucuDurumu.aktifSinav.aktif ||
          oturum.sinavId !== sunucuDurumu.aktifSinav.sinavId ||
          (oturum.sinavSurumId || 'SURUM-BASLANGIC-1') !== aktifSurumId
        ) {
          return gonderJson(403, { hata: 'Oturumunuz aktif sınav tanımıyla eşleşmiyor veya sınav kapatılmış.' });
        }
        if (Date.now() > oturum.bitisMs || oturum.bitti) {
          return gonderJson(403, { hata: 'Sınav süresi dolmuş veya sınav tamamlanmış.' });
        }

        const soruId = String(govde.soruId || '').trim();
        const secim = String(govde.secim !== undefined ? govde.secim : (govde.cevap !== undefined ? govde.cevap : '')).trim();
        const sinavSorulari = Array.isArray(oturum.sorular) && oturum.sorular.length > 0
          ? oturum.sorular
          : (Array.isArray(sunucuDurumu.aktifSinav.sorular) ? sunucuDurumu.aktifSinav.sorular : []);
        const eslesenIdx = sinavSorulari.findIndex((s, idx) => String(s.id || `S-${idx + 1}`) === soruId);
        if (!soruId || eslesenIdx < 0) {
          return gonderJson(400, { hata: 'Geçersiz veya bu sınava ait olmayan soruId.' });
        }
        const eslesenSoru = sinavSorulari[eslesenIdx];
        const kanonikSoruId = String(eslesenSoru.id || `S-${eslesenIdx + 1}`);

        if (eslesenSoru.tur === 'test') {
          if (secim !== '' && !['A', 'B', 'C', 'D', 'E'].includes(secim)) {
            return gonderJson(400, { hata: 'Test sorusu için geçersiz şık seçimi (yalnız A-E veya boş kabul edilir).' });
          }
        } else if (eslesenSoru.tur === 'dy') {
          if (secim !== '' && !['D', 'Y'].includes(secim)) {
            return gonderJson(400, { hata: 'D/Y sorusu için geçersiz seçim (yalnız D, Y veya boş kabul edilir).' });
          }
        }

        if (Object.prototype.hasOwnProperty.call(oturum.cevaplar, kanonikSoruId)) {
          return gonderJson(409, { hata: 'Kilitlenmiş soruya geri dönülemez ve yanıt değiştirilemez.' });
        }

        oturum.cevaplar[kanonikSoruId] = secim;
        await kaydetSistemAnahtariD1(env, 'aktif_tokenlar', Array.from(sunucuDurumu.aktifTokenlar.entries()));
        return gonderJson(200, { kaydedildi: true, soruId: kanonikSoruId });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'POST' && yol === '/api/ogrenci-sinav-bitir') {
      try {
        const govde = await okuJsonGovde(request);
        const ihlal = kontrolZeroTrustYuk(govde, false);
        if (ihlal) return gonderJson(400, { hata: ihlal });

        const token = cozHocaTokenIstekten(request, govde, urlNesne);
        const oturum = sunucuDurumu.aktifTokenlar.get(token);
        if (!oturum) return gonderJson(401, { hata: 'Geçersiz veya süresi dolmuş oturum tokenı.' });
        const aktifSurumId = (sunucuDurumu.aktifSinav && sunucuDurumu.aktifSinav.sinavSurumId) || 'SURUM-BASLANGIC-1';
        if (
          !sunucuDurumu.aktifSinav ||
          oturum.sinavId !== sunucuDurumu.aktifSinav.sinavId ||
          (oturum.sinavSurumId || 'SURUM-BASLANGIC-1') !== aktifSurumId
        ) {
          return gonderJson(403, { hata: 'Oturumunuz aktif sınav tanımıyla eşleşmiyor.' });
        }
        if (oturum.bitti) {
          return gonderJson(409, { hata: 'Bu sınav oturumu zaten teslim edilmiş.' });
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
        await kaydetSistemAnahtariD1(env, 'aktif_tokenlar', Array.from(sunucuDurumu.aktifTokenlar.entries()));
        if (env && env.SINAV_DB) {
          try {
            const tokenHash = Cekirdek.uretDelilLogHash(token, 'OGR-OTURUM');
            const durumJson = JSON.stringify({
              adSoyad: oturum.adSoyad,
              puan,
              dogruSayisi,
              teslimKodu,
              cevaplar: oturum.cevaplar || {},
              bitti: true
            });
            await env.SINAV_DB.prepare(
              'UPDATE ogrenci_oturumlari SET bitti = 1, durum_json = ?1, guncelleme_ms = ?2 WHERE token_hash = ?3'
            ).bind(durumJson, Date.now(), tokenHash).run();
          } catch (_) {}
        }

        return gonderJson(200, {
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
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'POST' && yol === '/api/kiosk-log-kaydet') {
      try {
        const govde = await okuJsonGovde(request);
        const token = cozHocaTokenIstekten(request, govde, urlNesne);
        const ogrenciOturum = token ? sunucuDurumu.aktifTokenlar.get(token) : null;
        const hocaYetkiliMi = Boolean(token && sunucuDurumu.aktifHocaTokenlar.has(token));
        if (!ogrenciOturum && !hocaYetkiliMi) {
          return gonderJson(401, { hata: 'Kiosk delil logu kaydetmek için geçerli öğrenci veya öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const oncekiHash = sunucuDurumu.kioskDelilLoglari.length > 0
          ? sunucuDurumu.kioskDelilLoglari[sunucuDurumu.kioskDelilLoglari.length - 1].olayHash
          : 'GENESIS-00000000';
        const ip = String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1');
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
        await kaydetSistemAnahtariD1(env, 'kiosk_loglar', sunucuDurumu.kioskDelilLoglari.slice(-5000));
        return gonderJson(201, { kaydedildi: true, log: kayit });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'GET' && yol === '/api/kiosk-log-indir') {
      const hocaToken = cozHocaTokenIstekten(request, null, urlNesne);
      if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
        return gonderJson(401, { hata: 'Delil loglarını indirmek için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
      }
      const sinavId = urlNesne.searchParams.get('sinavId') || '';
      const format = (urlNesne.searchParams.get('format') || 'json').toLowerCase();
      const loglar = sinavId && sinavId !== 'TUMU'
        ? sunucuDurumu.kioskDelilLoglari.filter((l) => l.sinavId === sinavId)
        : sunucuDurumu.kioskDelilLoglari;
      if (format === 'txt') {
        const txt = Cekirdek.uretResmiDelilLogRaporuTXT(loglar, { sinavId: sinavId || 'TUMU' });
        return new Response(txt, {
          status: 200,
          headers: Object.assign({}, GUVENLIK_BASLIKLARI, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store'
          })
        });
      }
      if (format === 'csv') {
        const csv = Cekirdek.uretDelilLogCSV(loglar, sinavId || 'TUMU');
        return new Response(csv, {
          status: 200,
          headers: Object.assign({}, GUVENLIK_BASLIKLARI, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Cache-Control': 'no-store'
          })
        });
      }
      return gonderJson(200, { loglar });
    }

    if (metot === 'POST' && yol === '/api/ai-bologna-coz') {
      try {
        const govde = await okuJsonGovde(request, 2097152);
        const hocaToken = cozHocaTokenIstekten(request, govde, urlNesne);
        if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
          return gonderJson(401, { hata: 'Bologna bilgi paketi çözümleyici için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const hamMetin = String((govde && (govde.htmlTablo || govde.html || govde.metin)) || '').trim();
        const gorselDataUrl = String((govde && govde.gorselDataUrl) || '').trim();
        const apiKey = String((env && env.GEMINI_API_KEY) || '').trim();

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
                  return gonderJson(200, { basarili: true, mod: 'gemini_multimodal', bologna });
                }
              }
            }
          } catch (_) {}
        }

        if (!hamMetin) {
          return gonderJson(400, {
            hata: gorselDataUrl
              ? 'Ekran görüntüsünden OCR/AI okuması için Worker ortamında GEMINI_API_KEY tanımlı olmalıdır. Alternatif olarak Bologna sayfasında Ctrl+A → Ctrl+C yapıp metin/tablo kutusuna doğrudan yapıştırabilirsiniz.'
              : 'Çözümlenecek Bologna HTML veya metin içeriği boş.'
          });
        }
        const bologna = Cekirdek.cozBolognaBilgiPaketi(hamMetin);
        if (!bologna.gecerli) {
          return gonderJson(400, { hata: bologna.hata || 'Bologna verisi ayrıştırılamadı.' });
        }
        return gonderJson(200, { basarili: true, mod: 'yerel_deterministik', bologna });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'POST' && yol === '/api/ai-soru-oc-etiketle') {
      try {
        const govde = await okuJsonGovde(request, 1048576);
        const hocaToken = cozHocaTokenIstekten(request, govde, urlNesne);
        if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
          return gonderJson(401, { hata: 'Soru bazlı ÖÇ analizi için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const sorular = Array.isArray(govde && govde.sorular) ? govde.sorular : [];
        if (sorular.length === 0) {
          return gonderJson(400, { hata: 'Analiz edilecek soru listesi boş.' });
        }
        const bolognaVerisi = (govde && (govde.bolognaVerisi || govde.bologna)) || {};
        const etiketler = Cekirdek.etiketleSorularOtomatikOcBloom(sorular, bolognaVerisi);
        return gonderJson(200, { basarili: true, mod: 'semantik_enum_kilitli', etiketler });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (yol === '/api/kurumsal-sablonlar') {
      if (metot === 'GET') {
        const hocaToken = cozHocaTokenIstekten(request, null, urlNesne);
        if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
          return gonderJson(401, { hata: 'Kurumsal şablonları okumak için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const liste = Array.isArray(sunucuDurumu.kurumsalSablonlar) && sunucuDurumu.kurumsalSablonlar.length > 0
          ? sunucuDurumu.kurumsalSablonlar
          : Cekirdek.VARSAYILAN_KURUMSAL_SABLONLAR;
        return gonderJson(200, { basarili: true, kurumsalSablonlar: liste });
      }
      if (metot === 'POST') {
        try {
          const govde = await okuJsonGovde(request, 1048576);
          const hTok = cozHocaTokenIstekten(request, govde, urlNesne);
          if (!hTok || !sunucuDurumu.aktifHocaTokenlar.has(hTok)) {
            return gonderJson(401, { hata: 'Kurumsal şablon kaydetmek için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
          }
          const temiz = Cekirdek.semaDogrulaVeTemizle({ kurumsalSablonlar: govde.kurumsalSablonlar || [] });
          sunucuDurumu.kurumsalSablonlar = temiz.kurumsalSablonlar;
          await kaydetSistemAnahtariD1(env, 'kurumsal_sablonlar', sunucuDurumu.kurumsalSablonlar);
          return gonderJson(200, { basarili: true, adet: sunucuDurumu.kurumsalSablonlar.length });
        } catch (err) {
          return gonderJson(400, { hata: err.message });
        }
      }
    }

    // Kalıcı Bulut Kasası (Cloudflare D1 SINAV_DB + Parçalı V2 + Otomatik Yedek Geçmişi) — Doğrulanmış Hoca Oturumu Zorunlu
    if (
      yol === '/api/bulut-kasa' ||
      yol === '/api/bulut-kasa/gecmis' ||
      yol === '/api/bulut-kasa/geri-yukle' ||
      yol === '/api/bulut-kasa/parca-kontrol' ||
      yol === '/api/bulut-kasa/parca' ||
      yol === '/api/bulut-kasa/parca-oku'
    ) {
      let govde = null;
      if (metot === 'PUT' || metot === 'POST') {
        try {
          if (
            yol === '/api/bulut-kasa/parca' ||
            yol === '/api/bulut-kasa/parca-kontrol' ||
            yol === '/api/bulut-kasa/parca-oku'
          ) {
            govde = await okuHamJsonGovde(request, yol === '/api/bulut-kasa/parca' ? 2097152 : 16777216);
          } else {
            govde = await okuJsonGovde(request, 16777216);
          }
        } catch (err) {
          return gonderJson(400, { hata: err.message });
        }
      }
      const hTok = cozHocaTokenIstekten(request, govde, urlNesne);
      const oturum = hTok ? sunucuDurumu.aktifHocaOturumlari.get(hTok) : null;
      if (!hTok || !sunucuDurumu.aktifHocaTokenlar.has(hTok) || !oturum) {
        return gonderJson(401, { hata: 'Bulut kasasına erişmek için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
      }
      const kullaniciAdi = String(oturum.kullaniciAdi || 'hoca').trim().toLowerCase();

      if (yol === '/api/bulut-kasa/parca-kontrol' && metot === 'POST') {
        const hamHashler = Array.isArray(govde && govde.parcaHashleri) ? govde.parcaHashleri : [];
        if (hamHashler.length > 1000) {
          return gonderJson(400, { hata: 'Tek istekte en fazla 1000 parça hash kontrol edilebilir.' });
        }
        const temizHashler = hamHashler.map((h) => String(h || '').trim()).filter((h) => h && h.length <= 128);
        const { eksikHashler } = await sorgulaSoruParcalariD1VeyaBellek(env, kullaniciAdi, temizHashler, false);
        return gonderJson(200, { basarili: true, eksikHashler });
      }

      if (yol === '/api/bulut-kasa/parca' && (metot === 'PUT' || metot === 'POST')) {
        const parcaHash = String((govde && govde.parcaHash) || '').trim();
        const kodlama = String((govde && govde.kodlama) || '').trim().toLowerCase();
        const veriSikistirilmis = typeof (govde && govde.veriSikistirilmis) === 'string' ? govde.veriSikistirilmis.trim() : '';
        if (!parcaHash || parcaHash.length > 128 || kodlama !== 'gzip-b64' || !veriSikistirilmis) {
          return gonderJson(400, { hata: 'Geçerli parcaHash, kodlama=gzip-b64 ve veriSikistirilmis zorunludur.' });
        }
        try {
          const acilmisJson = await cozGzipB64HamMetin(veriSikistirilmis, 2097152);
          if (Cekirdek.uretKasaParcaHash(acilmisJson) !== parcaHash) {
            return gonderJson(400, { hata: 'Parça bütünlük karması (parcaHash) açılan veriyle uyuşmuyor.' });
          }
          const dizi = JSON.parse(acilmisJson);
          const { soruSayisi, hassasAlanVardi } = Cekirdek.dogrulaVeTemizleSoruParcasi(dizi);
          const saklanacakB64 = hassasAlanVardi ? await paketleGzipB64Json(dizi) : veriSikistirilmis;
          await kaydetSoruParcasiD1VeyaBellek(env, kullaniciAdi, parcaHash, soruSayisi, saklanacakB64);
          return gonderJson(200, { basarili: true, parcaHash, soruSayisi });
        } catch (err) {
          return gonderJson(400, { hata: `Soru parçası açılamadı veya doğrulanamadı: ${err.message}` });
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
        const { mevcutHarita } = await sorgulaSoruParcalariD1VeyaBellek(env, kullaniciAdi, benzersiz, true);
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
        return gonderJson(200, { basarili: true, parcalar });
      }

      const okuMevcutKasa = async () => {
        if (env && env.SINAV_DB) {
          const sat = await env.SINAV_DB.prepare(
            'SELECT kullanici_adi, revizyon_no, veri_json, ozet_bilgi, guncelleme_ms FROM bulut_kasalar WHERE kullanici_adi = ?1'
          ).bind(kullaniciAdi).first();
          if (sat) {
            let veri = null;
            let parcaliV2 = null;
            try {
              const dis = JSON.parse(sat.veri_json);
              if (dis && dis.__kodlama === 'parcali-v2') {
                parcaliV2 = {
                  meta: Cekirdek.temizleYedekHassasAlanlar(dis.meta || {}),
                  soruParcaHashleri: Array.isArray(dis.soruParcaHashleri) ? dis.soruParcaHashleri : [],
                  toplamSoruSayisi: Number(dis.toplamSoruSayisi) || 0,
                  ozet: dis.ozet || null
                };
                veri = await birlestirParcaliKasaSorulariD1VeyaBellek(env, kullaniciAdi, parcaliV2.meta, parcaliV2.soruParcaHashleri);
              } else {
                veri = await acD1VeriJson(sat.veri_json);
              }
            } catch (_) { veri = null; }
            if (veri && typeof veri === 'object') {
              veri = Cekirdek.temizleYedekHassasAlanlar(veri);
            }
            return {
              kullaniciAdi,
              revizyonNo: Number(sat.revizyon_no) || 0,
              veri,
              veriJson: sat.veri_json,
              ozetBilgi: sat.ozet_bilgi || '',
              guncellemeMs: Number(sat.guncelleme_ms) || 0,
              parcaliV2
            };
          }
          return null;
        }
        const bellek = sunucuDurumu.bulutKasalarBellek.get(kullaniciAdi) || null;
        if (!bellek) return null;
        if (bellek.parcaliV2 && !bellek.veri) {
          const tam = await birlestirParcaliKasaSorulariD1VeyaBellek(env, kullaniciAdi, bellek.parcaliV2.meta, bellek.parcaliV2.soruParcaHashleri);
          return Object.assign({}, bellek, { veri: tam });
        }
        return bellek;
      };

      const okuMevcutKasaHafif = async () => {
        if (env && env.SINAV_DB) {
          const sat = await env.SINAV_DB.prepare(
            `SELECT kullanici_adi, revizyon_no, ozet_bilgi, guncelleme_ms, LENGTH(veri_json) AS veri_boyut,
                    CASE WHEN LENGTH(veri_json) <= 450000 OR SUBSTR(veri_json, 1, 48) LIKE '%"parcali-v2"%' THEN veri_json ELSE '' END AS hafif_veri_json
             FROM bulut_kasalar WHERE kullanici_adi = ?1`
          ).bind(kullaniciAdi).first();
          if (!sat) return null;
          const veriBoyut = Number(sat.veri_boyut) || 0;
          let eskiOzet = null;
          let parcaliV2 = null;
          let veri = null;
          if (sat.hafif_veri_json) {
            try {
              const dis = JSON.parse(sat.hafif_veri_json);
              if (dis && dis.__kodlama === 'parcali-v2') {
                const temizMeta = Cekirdek.temizleYedekHassasAlanlar(dis.meta || {});
                parcaliV2 = {
                  meta: temizMeta,
                  soruParcaHashleri: Array.isArray(dis.soruParcaHashleri) ? dis.soruParcaHashleri : [],
                  toplamSoruSayisi: Number(dis.toplamSoruSayisi) || 0,
                  ozet: dis.ozet || null
                };
                eskiOzet = dis.ozet
                  ? Object.assign({ ders: 0, soru: 0, ogrenci: 0, sinav: 0, okuma: 0 }, dis.ozet)
                  : Object.assign(hesaplaKasaOzeti(temizMeta), { soru: parcaliV2.toplamSoruSayisi });
              } else {
                veri = await acD1VeriJson(sat.hafif_veri_json);
                if (veri && typeof veri === 'object') {
                  veri = Cekirdek.temizleYedekHassasAlanlar(veri);
                  eskiOzet = hesaplaKasaOzeti(veri);
                }
              }
            } catch (_) {}
          } else {
            eskiOzet = Cekirdek.cozKasaOzetBilgisi(sat.ozet_bilgi || '');
            if (!eskiOzet && veriBoyut < 900000) {
              const tam = await okuMevcutKasa();
              if (tam) {
                veri = tam.veri;
                parcaliV2 = tam.parcaliV2 || null;
                eskiOzet = veri ? hesaplaKasaOzeti(veri) : null;
              }
            }
          }
          if (!eskiOzet) {
            eskiOzet = Cekirdek.cozKasaOzetBilgisi(sat.ozet_bilgi || '') || { ders: 0, soru: 0, ogrenci: 0, sinav: 0, okuma: 0 };
          }
          return {
            kullaniciAdi,
            revizyonNo: Number(sat.revizyon_no) || 0,
            ozetBilgi: sat.ozet_bilgi || '',
            guncellemeMs: Number(sat.guncelleme_ms) || 0,
            veriBoyut,
            veriJson: sat.hafif_veri_json || null,
            veri,
            parcaliV2,
            eskiOzet
          };
        }
        const bellek = sunucuDurumu.bulutKasalarBellek.get(kullaniciAdi) || null;
        if (!bellek) return null;
        let eskiOzet = null;
        if (bellek.parcaliV2) {
          eskiOzet = bellek.parcaliV2.ozet || Object.assign(hesaplaKasaOzeti(bellek.parcaliV2.meta || {}), { soru: Number(bellek.parcaliV2.toplamSoruSayisi) || 0 });
        } else if (bellek.veri) {
          eskiOzet = hesaplaKasaOzeti(bellek.veri);
        } else {
          eskiOzet = Cekirdek.cozKasaOzetBilgisi(bellek.ozetBilgi || '') || { ders: 0, soru: 0, ogrenci: 0, sinav: 0, okuma: 0 };
        }
        return {
          kullaniciAdi,
          revizyonNo: Number(bellek.revizyonNo) || 0,
          ozetBilgi: bellek.ozetBilgi || '',
          guncellemeMs: Number(bellek.guncellemeMs) || 0,
          veriBoyut: bellek.veriJson ? bellek.veriJson.length : 0,
          veriJson: bellek.veriJson || null,
          veri: bellek.veri || null,
          parcaliV2: bellek.parcaliV2 || null,
          eskiOzet
        };
      };

      const hazirla409KarsiYuk = async (mevcutHafif, parcaliIstemciMi) => {
        if (!mevcutHafif) return {};
        if (parcaliIstemciMi) {
          if (mevcutHafif.parcaliV2) {
            return {
              kodlama: 'parcali-v2',
              bulutMeta: mevcutHafif.parcaliV2.meta,
              soruParcaHashleri: mevcutHafif.parcaliV2.soruParcaHashleri,
              toplamSoruSayisi: mevcutHafif.parcaliV2.toplamSoruSayisi
            };
          }
          if (env && env.SINAV_DB) {
            const hamSat = await env.SINAV_DB.prepare(
              'SELECT veri_json FROM bulut_kasalar WHERE kullanici_adi = ?1'
            ).bind(kullaniciAdi).first();
            if (hamSat && hamSat.veri_json) {
              try {
                const dis = JSON.parse(hamSat.veri_json);
                if (dis && dis.__kodlama === 'gzip-b64' && typeof dis.veri === 'string') {
                  return { kodlama: 'gzip-b64', veriSikistirilmis: dis.veri };
                }
                if (dis && dis.__kodlama === 'parcali-v2') {
                  return {
                    kodlama: 'parcali-v2',
                    bulutMeta: Cekirdek.temizleYedekHassasAlanlar(dis.meta || {}),
                    soruParcaHashleri: Array.isArray(dis.soruParcaHashleri) ? dis.soruParcaHashleri : [],
                    toplamSoruSayisi: Number(dis.toplamSoruSayisi) || 0
                  };
                }
                const temiz = Cekirdek.temizleYedekHassasAlanlar(dis);
                return { bulutVeri: temiz, veriPaketi: temiz };
              } catch (_) {}
            }
          }
        }
        if (mevcutHafif.veri) {
          return { bulutVeri: mevcutHafif.veri, veriPaketi: mevcutHafif.veri };
        }
        const tam = await okuMevcutKasa();
        return {
          bulutVeri: tam ? tam.veri : null,
          veriPaketi: tam ? tam.veri : null
        };
      };

      const ekleYedekGecmisi = async (revNo, veriJson, islemNotu, veriBoyut = 0) => {
        const simdi = Date.now();
        if (env && env.SINAV_DB) {
          if (veriBoyut > 600000) return;
          if (veriJson) {
            await env.SINAV_DB.prepare(
              'INSERT INTO bulut_yedek_gecmisi (kullanici_adi, revizyon_no, islem_notu, veri_json, olusturma_ms) VALUES (?1, ?2, ?3, ?4, ?5)'
            ).bind(kullaniciAdi, revNo, String(islemNotu || '').slice(0, 180), veriJson, simdi).run();
          } else {
            await env.SINAV_DB.prepare(
              `INSERT INTO bulut_yedek_gecmisi (kullanici_adi, revizyon_no, islem_notu, veri_json, olusturma_ms)
               SELECT kullanici_adi, revizyon_no, ?2, veri_json, ?3 FROM bulut_kasalar WHERE kullanici_adi = ?1`
            ).bind(kullaniciAdi, String(islemNotu || '').slice(0, 180), simdi).run();
          }
          await env.SINAV_DB.prepare(
            `DELETE FROM bulut_yedek_gecmisi WHERE kullanici_adi = ?1 AND id NOT IN (
               SELECT id FROM bulut_yedek_gecmisi WHERE kullanici_adi = ?1 ORDER BY id DESC LIMIT 25
             )`
          ).bind(kullaniciAdi).run();
        } else {
          const liste = sunucuDurumu.bulutGecmisBellek.get(kullaniciAdi) || [];
          const yeniId = (liste[0] ? liste[0].id : 0) + 1;
          liste.unshift({ id: yeniId, kullaniciAdi, revizyonNo: revNo, islemNotu: String(islemNotu || ''), veriJson, olusturmaMs: simdi });
          sunucuDurumu.bulutGecmisBellek.set(kullaniciAdi, liste.slice(0, 25));
        }
      };

      if (yol === '/api/bulut-kasa' && metot === 'GET') {
        const parcaliDestek = urlNesne.searchParams.get('parcaliDestek') === '1';
        const kodlamaIstek = String(
          urlNesne.searchParams.get('kodlama') ||
          request.headers.get('x-kasa-kodlama') ||
          request.headers.get('x-bulut-kodlama') ||
          ''
        ).trim().toLowerCase();

        if (env && env.SINAV_DB) {
          const sat = await env.SINAV_DB.prepare(
            'SELECT kullanici_adi, revizyon_no, veri_json, ozet_bilgi, guncelleme_ms FROM bulut_kasalar WHERE kullanici_adi = ?1'
          ).bind(kullaniciAdi).first();
          if (!sat) {
            return gonderJson(200, {
              basarili: true,
              bulundu: false,
              depoTuru: 'd1',
              kullaniciAdi,
              revizyonNo: 0,
              ozetBilgi: '',
              guncellemeMs: 0,
              veri: null,
              veriPaketi: null
            });
          }
          let dis = null;
          try { dis = JSON.parse(sat.veri_json); } catch (_) { dis = null; }
          if (dis && dis.__kodlama === 'parcali-v2') {
            const temizMeta = Cekirdek.temizleYedekHassasAlanlar(dis.meta || {});
            const hashler = Array.isArray(dis.soruParcaHashleri) ? dis.soruParcaHashleri : [];
            const toplamSoruSayisi = Number(dis.toplamSoruSayisi) || 0;
            if (parcaliDestek) {
              return gonderJson(200, {
                basarili: true,
                bulundu: true,
                depoTuru: 'd1',
                kullaniciAdi,
                revizyonNo: Number(sat.revizyon_no) || 0,
                ozetBilgi: sat.ozet_bilgi || '',
                guncellemeMs: Number(sat.guncelleme_ms) || 0,
                kodlama: 'parcali-v2',
                meta: temizMeta,
                soruParcaHashleri: hashler,
                toplamSoruSayisi
              });
            }
            const tamVeri = await birlestirParcaliKasaSorulariD1VeyaBellek(env, kullaniciAdi, temizMeta, hashler);
            if (kodlamaIstek === 'gzip-b64') {
              const veriSikistirilmis = await paketleGzipB64Json(tamVeri);
              return gonderJson(200, {
                basarili: true,
                bulundu: true,
                depoTuru: 'd1',
                kullaniciAdi,
                revizyonNo: Number(sat.revizyon_no) || 0,
                ozetBilgi: sat.ozet_bilgi || '',
                guncellemeMs: Number(sat.guncelleme_ms) || 0,
                kodlama: 'gzip-b64',
                veriSikistirilmis
              });
            }
            return gonderJson(200, {
              basarili: true,
              bulundu: true,
              depoTuru: 'd1',
              kullaniciAdi,
              revizyonNo: Number(sat.revizyon_no) || 0,
              ozetBilgi: sat.ozet_bilgi || '',
              guncellemeMs: Number(sat.guncelleme_ms) || 0,
              veri: tamVeri,
              veriPaketi: tamVeri
            });
          }
          if (dis && dis.__kodlama === 'gzip-b64' && typeof dis.veri === 'string' && kodlamaIstek === 'gzip-b64') {
            return gonderJson(200, {
              basarili: true,
              bulundu: true,
              depoTuru: 'd1',
              kullaniciAdi,
              revizyonNo: Number(sat.revizyon_no) || 0,
              ozetBilgi: sat.ozet_bilgi || '',
              guncellemeMs: Number(sat.guncelleme_ms) || 0,
              kodlama: 'gzip-b64',
              veriSikistirilmis: dis.veri
            });
          }
        } else {
          const bellek = sunucuDurumu.bulutKasalarBellek.get(kullaniciAdi) || null;
          if (bellek && bellek.parcaliV2 && parcaliDestek) {
            return gonderJson(200, {
              basarili: true,
              bulundu: true,
              depoTuru: 'worker_bellek',
              kullaniciAdi,
              revizyonNo: bellek.revizyonNo,
              ozetBilgi: bellek.ozetBilgi,
              guncellemeMs: bellek.guncellemeMs,
              kodlama: 'parcali-v2',
              meta: Cekirdek.temizleYedekHassasAlanlar(JSON.parse(JSON.stringify(bellek.parcaliV2.meta || {}))),
              soruParcaHashleri: bellek.parcaliV2.soruParcaHashleri || [],
              toplamSoruSayisi: Number(bellek.parcaliV2.toplamSoruSayisi) || 0
            });
          }
        }

        const mevcut = await okuMevcutKasa();
        const temizVeri = mevcut && mevcut.veri ? Cekirdek.temizleYedekHassasAlanlar(JSON.parse(JSON.stringify(mevcut.veri))) : null;
        if (kodlamaIstek === 'gzip-b64' && temizVeri) {
          const veriSikistirilmis = await paketleGzipB64Json(temizVeri);
          return gonderJson(200, {
            basarili: true,
            bulundu: true,
            depoTuru: (env && env.SINAV_DB) ? 'd1' : 'worker_bellek',
            kullaniciAdi,
            revizyonNo: mevcut.revizyonNo,
            ozetBilgi: mevcut.ozetBilgi,
            guncellemeMs: mevcut.guncellemeMs,
            kodlama: 'gzip-b64',
            veriSikistirilmis
          });
        }
        return gonderJson(200, {
          basarili: true,
          bulundu: Boolean(temizVeri),
          depoTuru: (env && env.SINAV_DB) ? 'd1' : 'worker_bellek',
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
          let metaTemizlendiMi = false;
          if (typeof (govde && govde.veriSikistirilmis) === 'string' && govde.veriSikistirilmis.trim()) {
            try {
              metaNesne = await cozGzipB64Json(govde.veriSikistirilmis);
              metaTemizlendiMi = true;
            } catch (err) {
              return gonderJson(400, { hata: `parcali-v2 meta verisi açılamadı: ${err.message}` });
            }
          } else {
            metaNesne = govde && (govde.meta || govde.veri || govde.veriPaketi);
          }
          if (!metaNesne || typeof metaNesne !== 'object' || Array.isArray(metaNesne)) {
            return gonderJson(400, { hata: 'Kaydedilecek geçerli parcali-v2 meta nesnesi bulunamadı.' });
          }
          const hamHashler = Array.isArray(govde && govde.soruParcaHashleri) ? govde.soruParcaHashleri : [];
          if (hamHashler.length > 1000) {
            return gonderJson(400, { hata: 'soruParcaHashleri en fazla 1000 adet olabilir.' });
          }
          const soruParcaHashleri = hamHashler.map((h) => String(h || '').trim()).filter((h) => h && h.length <= 128);
          const temizMeta = Cekirdek.temizleYedekHassasAlanlar(
            metaTemizlendiMi ? metaNesne : Cekirdek.derinTemizleNesne(metaNesne, 0)
          );
          temizMeta.sorular = [];
          const { eksikHashler, toplamSoruSayisi } = await sorgulaSoruParcalariD1VeyaBellek(env, kullaniciAdi, soruParcaHashleri, false);
          if (eksikHashler.length > 0) {
            return gonderJson(409, {
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
            return gonderJson(400, { hata: 'Sıkıştırılmış gzip-b64 yükü boş.' });
          }
          try {
            gelenVeri = await cozGzipB64Json(b64Yuk);
          } catch (err) {
            return gonderJson(400, { hata: `gzip-b64 kasa verisi açılamadı: ${err.message}` });
          }
        } else {
          gelenVeri = govde && (govde.veri || govde.veriPaketi);
        }

        if (!gelenVeri || typeof gelenVeri !== 'object' || Array.isArray(gelenVeri)) {
          return gonderJson(400, { hata: 'Kaydedilecek geçerli bulut kasa verisi (veri nesnesi) bulunamadı.' });
        }
        gelenVeri = Cekirdek.temizleYedekHassasAlanlar(gelenVeri);
        const mevcut = await okuMevcutKasaHafif();
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
        const eskiOzet = (mevcut && mevcut.eskiOzet) ? mevcut.eskiOzet : { ders: 0, soru: 0, ogrenci: 0, sinav: 0, okuma: 0 };

        if (mevcut && mevcutRev > 0) {
          const eskiDoluMu = eskiOzet.ders > 0 || eskiOzet.soru > 0 || eskiOzet.ogrenci > 0;
          const yeniTamBosMu = yeniOzet.ders === 0 && yeniOzet.soru === 0 && yeniOzet.ogrenci === 0;
          const azalmaVarMi =
            yeniOzet.ders < eskiOzet.ders ||
            yeniOzet.soru < eskiOzet.soru ||
            yeniOzet.ogrenci < eskiOzet.ogrenci ||
            yeniOzet.sinav < eskiOzet.sinav;
          const veriKaybiEngellendiMi = Boolean(eskiDoluMu && (yeniTamBosMu || (azalmaVarMi && !silmeOnayi)));

          // 1) Tam boşaltma yasağı: Dolu bir kasa (bazRevizyonNo ne olursa olsun) boş nesne ({}) veya 0/0/0 durumla ASLA ezilemez!
          if (eskiDoluMu && yeniTamBosMu) {
            const karsiYuk = await hazirla409KarsiYuk(mevcut, parcaliIstemciMi);
            return gonderJson(409, Object.assign({
              hata: 'Veri kaybı koruması: Dolu kasa boş veri ile sıfırlanamaz.',
              cakisma: true,
              veriKaybiKorumasi: true,
              bulutRevizyonNo: mevcutRev,
              revizyonNo: mevcutRev,
              ozetBilgi: mevcut.ozetBilgi
            }, karsiYuk));
          }

          // 2) Sıkı iyimser eşzamanlılık kilidi: zorlaEz veya silmeOnayi açık olsa bile bazRevizyonNo === mevcutRev ZORUNLUDUR!
          if (bazRev === null || !Number.isFinite(bazRev) || bazRev !== mevcutRev) {
            const karsiYuk = await hazirla409KarsiYuk(mevcut, parcaliIstemciMi);
            return gonderJson(409, Object.assign({
              hata: 'Bulut kasası revizyon uyuşmazlığı: Güncel revizyon numarası eşleşmiyor.',
              cakisma: true,
              veriKaybiKorumasi: veriKaybiEngellendiMi,
              bulutRevizyonNo: mevcutRev,
              revizyonNo: mevcutRev,
              ozetBilgi: mevcut.ozetBilgi
            }, karsiYuk));
          }

          // 3) Kısmi veri silinmesi engeli: Açık silmeOnayi olmadan ders, soru, öğrenci veya kayıtlı sınav sayısı 1 adet bile azaltılamaz!
          if (azalmaVarMi && !silmeOnayi) {
            const karsiYuk = await hazirla409KarsiYuk(mevcut, parcaliIstemciMi);
            return gonderJson(409, Object.assign({
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
          (mevcut.veriJson || (mevcut.veriBoyut && mevcut.veriBoyut > 0)) &&
          (govde.anlikYedekAl === true ||
            silmeOnayi ||
            zorlaEz ||
            yeniOzet.soru !== eskiOzet.soru ||
            yeniOzet.ogrenci !== eskiOzet.ogrenci ||
            yeniOzet.ders !== eskiOzet.ders ||
            yeniOzet.sinav !== eskiOzet.sinav ||
            Date.now() - (mevcut.guncellemeMs || 0) > 180000)
        ) {
          await ekleYedekGecmisi(mevcutRev, mevcut.veriJson, mevcut.ozetBilgi || 'Otomatik yedek', mevcut.veriBoyut || 0);
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
          : ((env && env.SINAV_DB) ? await paketleD1VeriJson(gelenVeri) : JSON.stringify(gelenVeri));

        if (env && env.SINAV_DB) {
          if (mevcut && mevcutRev > 0) {
            const guncelleSonuc = await env.SINAV_DB.prepare(
              `UPDATE bulut_kasalar
               SET revizyon_no = ?1, veri_json = ?2, ozet_bilgi = ?3, guncelleme_ms = ?4
               WHERE kullanici_adi = ?5 AND revizyon_no = ?6`
            ).bind(yeniRev, veriJson, ozetBilgi, simdi, kullaniciAdi, mevcutRev).run();
            const degisen = guncelleSonuc && guncelleSonuc.meta ? Number(guncelleSonuc.meta.changes || 0) : 1;
            if (degisen === 0) {
              const guncel = await okuMevcutKasaHafif();
              const gRev = guncel ? (Number(guncel.revizyonNo) || mevcutRev) : mevcutRev;
              const karsiYuk = await hazirla409KarsiYuk(guncel, parcaliIstemciMi);
              return gonderJson(409, Object.assign({
                hata: 'Eşzamanlı yazma çakışması engellendi.',
                cakisma: true,
                bulutRevizyonNo: gRev,
                revizyonNo: gRev
              }, karsiYuk));
            }
          } else {
            try {
              await env.SINAV_DB.prepare(
                `INSERT INTO bulut_kasalar (kullanici_adi, revizyon_no, veri_json, ozet_bilgi, guncelleme_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5)`
              ).bind(kullaniciAdi, yeniRev, veriJson, ozetBilgi, simdi).run();
            } catch (_) {
              const guncel = await okuMevcutKasaHafif();
              const gRev = guncel ? (Number(guncel.revizyonNo) || 1) : 1;
              const karsiYuk = await hazirla409KarsiYuk(guncel, parcaliIstemciMi);
              return gonderJson(409, Object.assign({
                hata: 'Eşzamanlı ilk kayıt çakışması engellendi.',
                cakisma: true,
                bulutRevizyonNo: gRev,
                revizyonNo: gRev
              }, karsiYuk));
            }
          }
        } else {
          sunucuDurumu.bulutKasalarBellek.set(kullaniciAdi, {
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
        }

        if (zorlaEz) {
          for (const anahtar of Array.from(sunucuDurumu.mobilSinavPaketleri.keys())) {
            if (anahtar.startsWith(`${kullaniciAdi}::`)) {
              sunucuDurumu.mobilSinavPaketleri.delete(anahtar);
            }
          }
          if (env && env.SINAV_DB) {
            await hazirlaV2D1Tablolar(env);
            await env.SINAV_DB.prepare(
              'DELETE FROM mobil_sinav_paketleri WHERE kullanici_adi = ?1'
            ).bind(kullaniciAdi).run().catch(() => {});
          }
        }

        return gonderJson(200, {
          basarili: true,
          kaydedildi: true,
          depoTuru: (env && env.SINAV_DB) ? 'd1' : 'worker_bellek',
          kullaniciAdi,
          revizyonNo: yeniRev,
          ozetBilgi,
          guncellemeMs: simdi,
          kodlama: parcaliIstek ? 'parcali-v2' : 'standart',
          toplamSoruSayisi: parcaliIstek ? parcaliIstek.toplamSoruSayisi : yeniOzet.soru
        });
      }

      if (yol === '/api/bulut-kasa/gecmis' && metot === 'GET') {
        if (env && env.SINAV_DB) {
          const sat = await env.SINAV_DB.prepare(
            'SELECT id, revizyon_no, islem_notu, olusturma_ms FROM bulut_yedek_gecmisi WHERE kullanici_adi = ?1 ORDER BY id DESC LIMIT 25'
          ).bind(kullaniciAdi).all();
          const gecmis = ((sat && sat.results) || []).map((r) => ({
            id: r.id,
            revizyonNo: r.revizyon_no,
            islemNotu: r.islem_notu,
            olusturmaMs: r.olusturma_ms
          }));
          return gonderJson(200, { basarili: true, gecmis });
        }
        const gecmis = (sunucuDurumu.bulutGecmisBellek.get(kullaniciAdi) || []).map((r) => ({
          id: r.id,
          revizyonNo: r.revizyonNo,
          islemNotu: r.islemNotu,
          olusturmaMs: r.olusturmaMs
        }));
        return gonderJson(200, { basarili: true, gecmis });
      }

      if (yol === '/api/bulut-kasa/geri-yukle' && metot === 'POST') {
        const yedekId = Number(govde && (govde.id !== undefined ? govde.id : govde.yedekId));
        if (!Number.isFinite(yedekId) || yedekId <= 0) {
          return gonderJson(400, { hata: 'Geri yüklenecek geçerli yedek kimliği (id) belirtilmelidir.' });
        }
        let hedefVeriJson = null;
        if (env && env.SINAV_DB) {
          const sat = await env.SINAV_DB.prepare(
            'SELECT veri_json FROM bulut_yedek_gecmisi WHERE id = ?1 AND kullanici_adi = ?2'
          ).bind(yedekId, kullaniciAdi).first();
          if (sat) hedefVeriJson = sat.veri_json;
        } else {
          const liste = sunucuDurumu.bulutGecmisBellek.get(kullaniciAdi) || [];
          const bul = liste.find((x) => x.id === yedekId);
          if (bul) hedefVeriJson = bul.veriJson;
        }
        if (!hedefVeriJson) {
          return gonderJson(404, { hata: 'Belirtilen yedek kaydı bulunamadı.' });
        }
        const mevcut = await okuMevcutKasaHafif();
        if (mevcut && (mevcut.veriJson || (mevcut.veriBoyut && mevcut.veriBoyut > 0))) {
          await ekleYedekGecmisi(mevcut.revizyonNo, mevcut.veriJson, 'Geri yükleme öncesi otomatik yedek', mevcut.veriBoyut || 0);
        }
        const parcaliDestek = Boolean(govde && govde.parcaliDestek === true);
        let hedefDis = null;
        try { hedefDis = JSON.parse(hedefVeriJson); } catch (_) { hedefDis = null; }
        const yeniRev = (mevcut ? mevcut.revizyonNo : 0) + 1;
        const simdi = Date.now();

        if (hedefDis && hedefDis.__kodlama === 'parcali-v2') {
          const temizMeta = Cekirdek.temizleYedekHassasAlanlar(hedefDis.meta || {});
          const hashler = Array.isArray(hedefDis.soruParcaHashleri) ? hedefDis.soruParcaHashleri : [];
          const toplamSoruSayisi = Number(hedefDis.toplamSoruSayisi) || 0;
          const ozet = hedefDis.ozet || Object.assign(hesaplaKasaOzeti(temizMeta), { soru: toplamSoruSayisi });
          const ozetBilgi = `Geri yüklendi (#${yedekId}) · ${ozet.ders} ders · ${toplamSoruSayisi} soru · ${ozet.ogrenci} öğrenci · ${ozet.sinav} sınav`;
          if (env && env.SINAV_DB) {
            await env.SINAV_DB.prepare(
              `INSERT INTO bulut_kasalar (kullanici_adi, revizyon_no, veri_json, ozet_bilgi, guncelleme_ms)
               VALUES (?1, ?2, ?3, ?4, ?5)
               ON CONFLICT(kullanici_adi) DO UPDATE SET
                 revizyon_no = excluded.revizyon_no,
                 veri_json = excluded.veri_json,
                 ozet_bilgi = excluded.ozet_bilgi,
                 guncelleme_ms = excluded.guncelleme_ms`
            ).bind(kullaniciAdi, yeniRev, hedefVeriJson, ozetBilgi, simdi).run();
          } else {
            sunucuDurumu.bulutKasalarBellek.set(kullaniciAdi, {
              kullaniciAdi,
              revizyonNo: yeniRev,
              veri: null,
              veriJson: hedefVeriJson,
              ozetBilgi,
              guncellemeMs: simdi,
              parcaliV2: {
                meta: temizMeta,
                soruParcaHashleri: hashler,
                toplamSoruSayisi,
                ozet
              }
            });
          }
          if (parcaliDestek) {
            return gonderJson(200, {
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
          const tamVeri = await birlestirParcaliKasaSorulariD1VeyaBellek(env, kullaniciAdi, temizMeta, hashler);
          return gonderJson(200, {
            basarili: true,
            geriYuklendi: true,
            revizyonNo: yeniRev,
            ozetBilgi,
            veri: tamVeri,
            veriPaketi: tamVeri
          });
        }

        const geriVeri = Cekirdek.temizleYedekHassasAlanlar(await acD1VeriJson(hedefVeriJson));
        const geriVeriJson = (env && env.SINAV_DB) ? await paketleD1VeriJson(geriVeri) : JSON.stringify(geriVeri);
        const ozetBilgi = `Geri yüklendi (#${yedekId}) · ${hesaplaKasaOzeti(geriVeri).metin}`;
        if (env && env.SINAV_DB) {
          await env.SINAV_DB.prepare(
            `INSERT INTO bulut_kasalar (kullanici_adi, revizyon_no, veri_json, ozet_bilgi, guncelleme_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(kullanici_adi) DO UPDATE SET
               revizyon_no = excluded.revizyon_no,
               veri_json = excluded.veri_json,
               ozet_bilgi = excluded.ozet_bilgi,
               guncelleme_ms = excluded.guncelleme_ms`
          ).bind(kullaniciAdi, yeniRev, geriVeriJson, ozetBilgi, simdi).run();
        } else {
          sunucuDurumu.bulutKasalarBellek.set(kullaniciAdi, {
            kullaniciAdi,
            revizyonNo: yeniRev,
            veri: geriVeri,
            veriJson: geriVeriJson,
            ozetBilgi,
            guncellemeMs: simdi
          });
        }
        return gonderJson(200, {
          basarili: true,
          geriYuklendi: true,
          revizyonNo: yeniRev,
          ozetBilgi,
          veri: geriVeri,
          veriPaketi: geriVeri
        });
      }
    }

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
      kucukYol.startsWith('/backups/') ||
      kucukYol.startsWith('/node_modules/') ||
      kucukYol.startsWith('/.') ||
      /\/[a-z0-9_-]*test\.js$/i.test(kucukYol);
    if (engelliDesen) {
      return ekleGuvenlikBasliklari(new Response('Dosya bulunamadi', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
    }

    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const yanit = await env.ASSETS.fetch(request);
      return ekleGuvenlikBasliklari(yanit);
    }
    return ekleGuvenlikBasliklari(new Response('Dosya bulunamadi', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  }
};
