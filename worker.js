/* ==========================================================================
   EVRENSEL SINAV KAĞIDI STÜDYOSU & MOBİL OMR — CLOUDFLARE WORKER (worker.js)
   İstemciye Sıfır Güven (Zero-Trust Client), Sunucu Otoriteli Sınav & OMR API
   ========================================================================== */

import Cekirdek from './guvenlik-ve-veri.js';

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
  aktifHocaTokenlar: new Set(),
  aktifHocaOturumlari: new Map(),
  aktifTokenlar: new Map(),
  ogrenciQrKuyrugu: new Map(),
  omrSonucKuyrugu: new Map(),
  kioskDelilLoglari: [],
  omrSonuclari: [],
  bulutKasalarBellek: new Map(),
  bulutGecmisBellek: new Map()
};

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

async function yukleSistemDurumuD1(env) {
  if (!env || !env.SINAV_DB) return;
  try {
    const satirlar = await env.SINAV_DB.prepare('SELECT anahtar, deger_json FROM sistem_durumu').all();
    const liste = (satirlar && Array.isArray(satirlar.results)) ? satirlar.results : [];
    for (const s of liste) {
      if (!s || !s.anahtar || !s.deger_json) continue;
      const v = JSON.parse(s.deger_json);
      if (s.anahtar === 'hoca_yonetim' && v) {
        if (Array.isArray(v.hocaListesi) && v.hocaListesi.length > 0) sunucuDurumu.hocaListesi = v.hocaListesi;
        if (v.hocaHesap) sunucuDurumu.hocaHesap = v.hocaHesap;
        if (v.davetKodu) sunucuDurumu.davetKodu = v.davetKodu;
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
      }
    }
  } catch (_) {}
}

async function kaydetSistemAnahtariD1(env, anahtar, deger) {
  if (!env || !env.SINAV_DB) return;
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

async function okuJsonGovde(request, maksBayt = 524288) {
  const ham = await request.text();
  if (ham.length > maksBayt) {
    throw new Error('İstek boyutu sınırı aşıldı');
  }
  const nesne = ham ? JSON.parse(ham) : {};
  return Cekirdek.derinTemizleNesne(nesne, 0);
}

function gonderJson(kod, veri) {
  return new Response(JSON.stringify(veri), {
    status: kod,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store'
    }
  });
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
    }

    if (metot === 'GET' && yol === '/api/ag-adresi') {
      return gonderJson(200, { adresler: [urlNesne.origin] });
    }

    if (yol === '/api/ogrenci-qr-senkron') {
      if (metot === 'POST') {
        try {
          const govde = await okuJsonGovde(request, 524288);
          const hocaToken = cozHocaTokenIstekten(request, govde, urlNesne);
          if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
            return gonderJson(401, { hata: 'Öğrenci listesi QR senkronizasyonu için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
          }
          const oturumKodu = String((govde && govde.oturumKodu) || 'GENEL').trim().toUpperCase() || 'GENEL';
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
        const hocaToken = cozHocaTokenIstekten(request, null, urlNesne);
        if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
          return gonderJson(401, { hata: 'Öğrenci listesi QR kuyruğunu okumak için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const oturumKodu = String(urlNesne.searchParams.get('oturumKodu') || urlNesne.searchParams.get('oturum') || 'GENEL').trim().toUpperCase() || 'GENEL';
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
          const hocaToken = cozHocaTokenIstekten(request, govde, urlNesne);
          if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
            return gonderJson(401, { hata: 'OMR okuma sonucu senkronizasyonu için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
          }
          const oturumKodu = String((govde && govde.oturumKodu) || 'GENEL').trim().toUpperCase() || 'GENEL';
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
        const hocaToken = cozHocaTokenIstekten(request, null, urlNesne);
        if (!hocaToken || !sunucuDurumu.aktifHocaTokenlar.has(hocaToken)) {
          return gonderJson(401, { hata: 'OMR sonuç kuyruğunu okumak için doğrulanmış öğretmen oturumu gereklidir (401 Unauthorized).' });
        }
        const oturumKodu = String(urlNesne.searchParams.get('oturumKodu') || urlNesne.searchParams.get('oturum') || urlNesne.searchParams.get('kod') || 'GENEL').trim().toUpperCase() || 'GENEL';
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
        const sonuc = Cekirdek.dogrulaHocaGiris(govde.kullaniciAdi, govde.sifre, havuz);
        if (!sonuc.basarili) {
          return gonderJson(sonuc.kod, { hata: sonuc.hata, durum: sonuc.durum || 'reddedildi' });
        }
        const hocaToken = uretRastgeleToken(24);
        sunucuDurumu.aktifHocaTokenlar.add(hocaToken);
        sunucuDurumu.aktifHocaOturumlari.set(hocaToken, {
          kullaniciAdi: sonuc.kullaniciAdi,
          adSoyad: sonuc.adSoyad,
          rol: sonuc.rol || 'hoca'
        });
        await kaydetSistemAnahtariD1(env, 'hoca_oturumlari', Array.from(sunucuDurumu.aktifHocaOturumlari.entries()));
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
        const yeniKayit = {
          kullaniciAdi: dogrulama.kullaniciAdi,
          adSoyad: dogrulama.adSoyad,
          eposta: dogrulama.eposta,
          telefon: dogrulama.telefon,
          sifre: String(govde.sifre),
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
        const govde = await okuJsonGovde(request);
        const havuz = Array.isArray(sunucuDurumu.hocaListesi) && sunucuDurumu.hocaListesi.length > 0
          ? sunucuDurumu.hocaListesi
          : [sunucuDurumu.hocaHesap];
        const sonuc = Cekirdek.sifirlaHocaSifreEpostaTelefon(govde, havuz);
        if (!sonuc.basarili) {
          return gonderJson(sonuc.kod || 403, { hata: sonuc.hata });
        }
        if (sonuc.rol === 'yonetici') {
          sunucuDurumu.hocaHesap.sifre = String(govde.yeniSifre);
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
          kayit.sifre = String(govde.sifre);
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

    if (metot === 'POST' && yol === '/api/ogrenci-oturum-baslat') {
      try {
        const govde = await okuJsonGovde(request);
        const ihlal = kontrolZeroTrustYuk(govde, true);
        if (ihlal) return gonderJson(400, { hata: ihlal });
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
            const mevcutSorular = hazirlaIstemciSorulari(mevcutOt.sorular || sunucuDurumu.aktifSinav.sorular);
            return gonderJson(200, {
              token: mevcutToken,
              ogrNo: mevcutOt.ogrNo,
              adSoyad: mevcutOt.adSoyad,
              bitisMs: mevcutOt.bitisMs,
              soruSayisi: mevcutSorular.length,
              sorular: mevcutSorular,
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
        const bitisMs = Date.now() + sunucuDurumu.aktifSinav.sureDk * 60 * 1000;
        sunucuDurumu.aktifTokenlar.set(token, {
          ogrNo: ogr.ogrNo,
          adSoyad: ogr.adSoyad,
          sinavId: aktifSinavId,
          sinavSurumId: aktifSinavSurumId,
          sorular: oturumSorulari,
          bitisMs,
          cevaplar: {},
          bitti: false
        });
        await kaydetSistemAnahtariD1(env, 'aktif_tokenlar', Array.from(sunucuDurumu.aktifTokenlar.entries()));
        return gonderJson(200, {
          token,
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
        const siraliCevaplar = [];
        sinavSorulari.forEach((s, idx) => {
          const sId = String(s.id || `S-${idx + 1}`);
          const verilen = oturum.cevaplar[sId];
          siraliCevaplar.push(verilen !== undefined && verilen !== null ? String(verilen) : '');
          if (s.tur === 'dy' && verilen && verilen === s.dogruDY) dogruSayisi++;
          else if (s.tur === 'test' && verilen && verilen === s.dogruHarf) dogruSayisi++;
          else if (s.tur === 'klasik' && String(verilen || '').trim().length >= 5) dogruSayisi++;
        });
        const toplamSoru = Math.max(1, sinavSorulari.length);
        const puan = Math.round((dogruSayisi / toplamSoru) * 100);
        const teslimHash = Cekirdek.uretDelilLogHash(`${oturum.sinavId}|${oturum.ogrNo}|${puan}|${siraliCevaplar.join(',')}`, 'TESLIM-FIS').slice(0, 12);
        const teslimKodu = `#TESLIM-${teslimHash}`;
        oturum.puan = puan;
        oturum.dogruSayisi = dogruSayisi;
        oturum.teslimKodu = teslimKodu;
        const manuelDegerlendirmeBekliyor = sinavSorulari.some((s) => s.tur === 'klasik');
        await kaydetSistemAnahtariD1(env, 'aktif_tokenlar', Array.from(sunucuDurumu.aktifTokenlar.entries()));

        return gonderJson(200, {
          bitti: true,
          kaydedildi: true,
          ogrNo: oturum.ogrNo,
          sinavId: oturum.sinavId,
          dogruSayisi,
          toplamSoru: sinavSorulari.length,
          puan,
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
        return new Response(txt, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
      if (format === 'csv') {
        const csv = Cekirdek.uretDelilLogCSV(loglar, sinavId || 'TUMU');
        return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
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

    // Kalıcı Bulut Kasası (Cloudflare D1 SINAV_DB + Otomatik Yedek Geçmişi) — Doğrulanmış Hoca Oturumu Zorunlu
    if (yol === '/api/bulut-kasa' || yol === '/api/bulut-kasa/gecmis' || yol === '/api/bulut-kasa/geri-yukle') {
      let govde = null;
      if (metot === 'PUT' || metot === 'POST') {
        try {
          govde = await okuJsonGovde(request, 4194304);
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

      const okuMevcutKasa = async () => {
        if (env && env.SINAV_DB) {
          const sat = await env.SINAV_DB.prepare(
            'SELECT kullanici_adi, revizyon_no, veri_json, ozet_bilgi, guncelleme_ms FROM bulut_kasalar WHERE kullanici_adi = ?1'
          ).bind(kullaniciAdi).first();
          if (sat) {
            let veri = null;
            try { veri = JSON.parse(sat.veri_json); } catch (_) { veri = null; }
            return {
              kullaniciAdi,
              revizyonNo: Number(sat.revizyon_no) || 0,
              veri,
              veriJson: sat.veri_json,
              ozetBilgi: sat.ozet_bilgi || '',
              guncellemeMs: Number(sat.guncelleme_ms) || 0
            };
          }
          return null;
        }
        return sunucuDurumu.bulutKasalarBellek.get(kullaniciAdi) || null;
      };

      const ekleYedekGecmisi = async (revNo, veriJson, islemNotu) => {
        const simdi = Date.now();
        if (env && env.SINAV_DB) {
          await env.SINAV_DB.prepare(
            'INSERT INTO bulut_yedek_gecmisi (kullanici_adi, revizyon_no, islem_notu, veri_json, olusturma_ms) VALUES (?1, ?2, ?3, ?4, ?5)'
          ).bind(kullaniciAdi, revNo, String(islemNotu || '').slice(0, 180), veriJson, simdi).run();
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
        const mevcut = await okuMevcutKasa();
        return gonderJson(200, {
          basarili: true,
          bulundu: Boolean(mevcut && mevcut.veri),
          depoTuru: (env && env.SINAV_DB) ? 'd1' : 'worker_bellek',
          kullaniciAdi,
          revizyonNo: mevcut ? mevcut.revizyonNo : 0,
          ozetBilgi: mevcut ? mevcut.ozetBilgi : '',
          guncellemeMs: mevcut ? mevcut.guncellemeMs : 0,
          veri: mevcut ? mevcut.veri : null,
          veriPaketi: mevcut ? mevcut.veri : null
        });
      }

      if (yol === '/api/bulut-kasa' && (metot === 'PUT' || metot === 'POST')) {
        const gelenVeri = govde && (govde.veri || govde.veriPaketi);
        if (!gelenVeri || typeof gelenVeri !== 'object' || Array.isArray(gelenVeri)) {
          return gonderJson(400, { hata: 'Kaydedilecek geçerli bulut kasa verisi (veri nesnesi) bulunamadı.' });
        }
        const mevcut = await okuMevcutKasa();
        const mevcutRev = mevcut ? (Number(mevcut.revizyonNo) || 0) : 0;
        const bazRev = (govde && govde.bazRevizyonNo !== undefined && govde.bazRevizyonNo !== null)
          ? Number(govde.bazRevizyonNo)
          : null;
        const silmeOnayi = Boolean(govde && govde.silmeOnayi === true);
        const zorlaEz = Boolean(govde && govde.zorlaEz === true);

        const yeniOzet = hesaplaKasaOzeti(gelenVeri);
        const eskiOzet = mevcut && mevcut.veri ? hesaplaKasaOzeti(mevcut.veri) : { ders: 0, soru: 0, ogrenci: 0, sinav: 0, okuma: 0 };

        if (mevcut && mevcutRev > 0) {
          // 1) Sıkı iyimser eşzamanlılık kilidi: zorlaEz veya silmeOnayi açık olsa bile bazRevizyonNo === mevcutRev ZORUNLUDUR!
          if (bazRev === null || !Number.isFinite(bazRev) || bazRev !== mevcutRev) {
            return gonderJson(409, {
              hata: 'Bulut kasası revizyon uyuşmazlığı: Güncel revizyon numarası eşleşmiyor.',
              cakisma: true,
              bulutRevizyonNo: mevcutRev,
              revizyonNo: mevcutRev,
              ozetBilgi: mevcut.ozetBilgi,
              bulutVeri: mevcut.veri,
              veriPaketi: mevcut.veri
            });
          }

          // 2) Tam boşaltma yasağı: Dolu bir kasa boş nesne ({}) veya 0/0/0 durumla ASLA ezilemez!
          const eskiDoluMu = eskiOzet.ders > 0 || eskiOzet.soru > 0 || eskiOzet.ogrenci > 0;
          const yeniTamBosMu = yeniOzet.ders === 0 && yeniOzet.soru === 0 && yeniOzet.ogrenci === 0;
          if (eskiDoluMu && yeniTamBosMu) {
            return gonderJson(409, {
              hata: 'Veri kaybı koruması: Dolu kasa boş veri ile sıfırlanamaz.',
              cakisma: true,
              veriKaybiKorumasi: true,
              bulutRevizyonNo: mevcutRev,
              revizyonNo: mevcutRev,
              ozetBilgi: mevcut.ozetBilgi,
              bulutVeri: mevcut.veri,
              veriPaketi: mevcut.veri
            });
          }

          // 3) Kısmi veri silinmesi engeli: Açık silmeOnayi olmadan ders, soru, öğrenci veya kayıtlı sınav sayısı 1 adet bile azaltılamaz!
          const azalmaVarMi =
            yeniOzet.ders < eskiOzet.ders ||
            yeniOzet.soru < eskiOzet.soru ||
            yeniOzet.ogrenci < eskiOzet.ogrenci ||
            yeniOzet.sinav < eskiOzet.sinav;
          if (azalmaVarMi && !silmeOnayi) {
            return gonderJson(409, {
              hata: 'Veri kaybı koruması: Açık silme onayı olmadan mevcut ders, soru, öğrenci veya sınav sayısı azaltılamaz.',
              cakisma: true,
              veriKaybiKorumasi: true,
              bulutRevizyonNo: mevcutRev,
              revizyonNo: mevcutRev,
              ozetBilgi: mevcut.ozetBilgi,
              bulutVeri: mevcut.veri,
              veriPaketi: mevcut.veri
            });
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
          await ekleYedekGecmisi(mevcutRev, mevcut.veriJson, mevcut.ozetBilgi || 'Otomatik yedek');
        }

        const yeniRev = mevcutRev + 1;
        const simdi = Date.now();
        const ozetBilgi = String(govde.islemNotu || yeniOzet.metin).slice(0, 180);
        const veriJson = JSON.stringify(gelenVeri);

        if (env && env.SINAV_DB) {
          if (mevcut && mevcutRev > 0) {
            const guncelleSonuc = await env.SINAV_DB.prepare(
              `UPDATE bulut_kasalar
               SET revizyon_no = ?1, veri_json = ?2, ozet_bilgi = ?3, guncelleme_ms = ?4
               WHERE kullanici_adi = ?5 AND revizyon_no = ?6`
            ).bind(yeniRev, veriJson, ozetBilgi, simdi, kullaniciAdi, mevcutRev).run();
            const degisen = guncelleSonuc && guncelleSonuc.meta ? Number(guncelleSonuc.meta.changes || 0) : 1;
            if (degisen === 0) {
              const guncel = await okuMevcutKasa();
              const gRev = guncel ? (Number(guncel.revizyonNo) || mevcutRev) : mevcutRev;
              return gonderJson(409, {
                hata: 'Eşzamanlı yazma çakışması engellendi.',
                cakisma: true,
                bulutRevizyonNo: gRev,
                revizyonNo: gRev,
                bulutVeri: guncel ? guncel.veri : null,
                veriPaketi: guncel ? guncel.veri : null
              });
            }
          } else {
            try {
              await env.SINAV_DB.prepare(
                `INSERT INTO bulut_kasalar (kullanici_adi, revizyon_no, veri_json, ozet_bilgi, guncelleme_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5)`
              ).bind(kullaniciAdi, yeniRev, veriJson, ozetBilgi, simdi).run();
            } catch (_) {
              const guncel = await okuMevcutKasa();
              const gRev = guncel ? (Number(guncel.revizyonNo) || 1) : 1;
              return gonderJson(409, {
                hata: 'Eşzamanlı ilk kayıt çakışması engellendi.',
                cakisma: true,
                bulutRevizyonNo: gRev,
                revizyonNo: gRev,
                bulutVeri: guncel ? guncel.veri : null,
                veriPaketi: guncel ? guncel.veri : null
              });
            }
          }
        } else {
          sunucuDurumu.bulutKasalarBellek.set(kullaniciAdi, {
            kullaniciAdi,
            revizyonNo: yeniRev,
            veri: gelenVeri,
            veriJson,
            ozetBilgi,
            guncellemeMs: simdi
          });
        }

        return gonderJson(200, {
          basarili: true,
          kaydedildi: true,
          depoTuru: (env && env.SINAV_DB) ? 'd1' : 'worker_bellek',
          kullaniciAdi,
          revizyonNo: yeniRev,
          ozetBilgi,
          guncellemeMs: simdi
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
        const mevcut = await okuMevcutKasa();
        if (mevcut && mevcut.veriJson) {
          await ekleYedekGecmisi(mevcut.revizyonNo, mevcut.veriJson, 'Geri yükleme öncesi otomatik yedek');
        }
        const geriVeri = JSON.parse(hedefVeriJson);
        const yeniRev = (mevcut ? mevcut.revizyonNo : 0) + 1;
        const simdi = Date.now();
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
          ).bind(kullaniciAdi, yeniRev, hedefVeriJson, ozetBilgi, simdi).run();
        } else {
          sunucuDurumu.bulutKasalarBellek.set(kullaniciAdi, {
            kullaniciAdi,
            revizyonNo: yeniRev,
            veri: geriVeri,
            veriJson: hedefVeriJson,
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
      kucukYol.endsWith('.sql') ||
      kucukYol === '/test-suite.js' ||
      kucukYol === '/omr-geometri-denetim.js' ||
      kucukYol.startsWith('/test-artifacts/') ||
      kucukYol.startsWith('/ornek-dosyalar/') ||
      kucukYol.startsWith('/node_modules/') ||
      kucukYol.startsWith('/.') ||
      /\/[a-z0-9_-]*test\.js$/i.test(kucukYol);
    if (engelliDesen) {
      return new Response('Dosya bulunamadi', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }
    return new Response('Dosya bulunamadi', { status: 404 });
  }
};
