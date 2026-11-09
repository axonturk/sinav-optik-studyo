/* ==========================================================================
   EVRENSEL SINAV KAĞIDI STÜDYOSU & MOBİL OMR — ZERO-TRUST SUNUCU (server.js)
   İstemciye Sıfır Güven (Zero-Trust Client), Sunucu Otoriteli Sınav & OMR API
   ========================================================================== */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Cekirdek = require('./guvenlik-ve-veri.js');

const PORT = Number(process.env.PORT) || 3000;
const KOK_DIZIN = __dirname;

/* Sunucu Yetkili Durumu (Server Authority State) */
const sunucuDurumu = {
  aktifSinav: {
    sinavId: 'SINAV-2026-GUZ',
    aktif: true,
    sureDk: 40,
    sorular: Cekirdek.VARSAYILAN_SORULAR.slice(0, 10)
  },
  kayitliOgrenciler: new Map(
    Cekirdek.VARSAYILAN_OGRENCILER.map((o) => [o.ogrNo, o])
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
  aktifHocaOturumlari: new Map(), // hocaToken -> { kullaniciAdi, adSoyad, rol }
  aktifTokenlar: new Map(), // token -> { ogrNo, adSoyad, bitisMs, cevaplar, bitti }
  kioskDelilLoglari: [],
  omrSonuclari: []
};

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

function gonderJson(res, kod, veri) {
  const govde = JSON.stringify(veri);
  res.writeHead(kod, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  });
  res.end(govde);
}

const MIME_TIPLERI = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
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

  // 0a-QR. Telefondan -> Bilgisayara Öğrenci Listesi QR / Ağ Senkronizasyon Köprüsü
  if (yol === '/api/ogrenci-qr-senkron') {
    if (!sunucuDurumu.ogrenciQrKuyrugu) {
      sunucuDurumu.ogrenciQrKuyrugu = new Map();
    }
    if (req.method === 'POST') {
      okuJsonGovde(req, 524288)
        .then((govde) => {
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

  // 0a-OMR. Telefondan -> Bilgisayara Optik Okuma Sonuçları (OMR) Canlı Senkronizasyon Köprüsü
  if (yol === '/api/omr-sonuc-senkron') {
    if (!sunucuDurumu.omrSonucKuyrugu) {
      sunucuDurumu.omrSonucKuyrugu = new Map();
    }
    if (req.method === 'POST') {
      okuJsonGovde(req, 524288)
        .then((govde) => {
          const oturumKodu = String((govde && govde.oturumKodu) || 'GENEL').trim().toUpperCase() || 'GENEL';
          const cozum = Cekirdek.cozOmrSonucPaketi(govde && govde.paket ? govde.paket : govde);
          if (!cozum.gecerli || cozum.sonuclar.length === 0) {
            return gonderJson(res, 400, { hata: cozum.hata || 'Aktarılacak geçerli OMR okuma sonucu bulunamadı.' });
          }
          const kayit = {
            oturumKodu,
            sonuclar: cozum.sonuclar,
            adet: cozum.sonuclar.length,
            zamanMs: Date.now()
          };
          sunucuDurumu.omrSonucKuyrugu.set(oturumKodu, kayit);
          sunucuDurumu.omrSonuclari = cozum.sonuclar;
          return gonderJson(res, 200, {
            basarili: true,
            oturumKodu,
            aktarilanSayi: cozum.sonuclar.length,
            adet: cozum.sonuclar.length
          });
        })
        .catch((err) => gonderJson(res, 400, { hata: err.message }));
      return;
    }
    if (req.method === 'GET') {
      const oturumKodu = String(urlNesne.searchParams.get('oturumKodu') || urlNesne.searchParams.get('oturum') || 'GENEL').trim().toUpperCase() || 'GENEL';
      const tuket = urlNesne.searchParams.get('tuket') === '1';
      const kayit = sunucuDurumu.omrSonucKuyrugu.get(oturumKodu) || null;
      if (kayit && tuket) {
        sunucuDurumu.omrSonucKuyrugu.delete(oturumKodu);
      }
      const varMi = Boolean(kayit && Array.isArray(kayit.sonuclar) && kayit.sonuclar.length > 0);
      return gonderJson(res, 200, {
        varMi,
        bulundu: varMi,
        oturumKodu,
        sonuclar: kayit ? kayit.sonuclar : [],
        zamanMs: kayit ? kayit.zamanMs : 0
      });
    }
  }

  // 0. Öğretmen / Öğretim Elemanı (Hoca) Kullanıcı Adı & Şifre Giriş Doğrulaması
  if (req.method === 'POST' && yol === '/api/hoca-giris') {
    okuJsonGovde(req)
      .then((govde) => {
        const havuz = Array.isArray(sunucuDurumu.hocaListesi) && sunucuDurumu.hocaListesi.length > 0
          ? sunucuDurumu.hocaListesi
          : [sunucuDurumu.hocaHesap];
        const sonuc = Cekirdek.dogrulaHocaGiris(govde.kullaniciAdi, govde.sifre, havuz);
        if (!sonuc.basarili) {
          return gonderJson(res, sonuc.kod, { hata: sonuc.hata, durum: sonuc.durum || 'reddedildi' });
        }
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

  // 0a-2. Davet Kodlu Yeni Hoca Başvurusu (Yönetici Onayına Düşer — Asla Otomatik Oturum Açmaz)
  if (req.method === 'POST' && yol === '/api/hoca-basvuru') {
    okuJsonGovde(req)
      .then((govde) => {
        const dogrulama = Cekirdek.dogrulaHocaHesapKayit(govde, {
          davetKoduKontrol: true,
          beklenenDavetKodu: sunucuDurumu.davetKodu,
          mevcutHocalar: sunucuDurumu.hocaListesi
        });
        if (!dogrulama.gecerli) {
          const kod = String(dogrulama.hata || '').includes('davet kodu') ? 403 : 400;
          return gonderJson(res, kod, { hata: dogrulama.hata });
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

  // 0a-2b. E-Posta + Cep Telefonu Doğrulaması ile Yönetici / Hoca Şifre Sıfırlama
  if (req.method === 'POST' && yol === '/api/hoca-sifre-kurtar') {
    okuJsonGovde(req)
      .then((govde) => {
        const havuz = Array.isArray(sunucuDurumu.hocaListesi) && sunucuDurumu.hocaListesi.length > 0
          ? sunucuDurumu.hocaListesi
          : [sunucuDurumu.hocaHesap];
        const sonuc = Cekirdek.sifirlaHocaSifreEpostaTelefon(govde, havuz);
        if (!sonuc.basarili) {
          return gonderJson(res, sonuc.kod || 403, { hata: sonuc.hata });
        }
        if (sonuc.rol === 'yonetici') {
          sunucuDurumu.hocaHesap.sifre = String(govde.yeniSifre);
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
      .then((govde) => {
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
          kayit.sifre = String(govde.sifre);
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
        sunucuDurumu.aktifSinav = {
          sinavId: String(sinav.sinavId || sinav.kod || 'SINAV-2026-GUZ').slice(0, 80),
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
  if (req.method === 'POST' && yol === '/api/ogrenci-oturum-baslat') {
    okuJsonGovde(req)
      .then((govde) => {
        const ihlal = kontrolZeroTrustYuk(govde, true);
        if (ihlal) return gonderJson(res, 400, { hata: ihlal });

        if (!sunucuDurumu.aktifSinav || !sunucuDurumu.aktifSinav.aktif) {
          return gonderJson(res, 403, { hata: 'Aktif bir online sınav bulunmuyor.' });
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

        // Cevap anahtarı (dogruHarf / dogruDY) istemciye ASLA gönderilmez!
        const istemciSorulari = sunucuDurumu.aktifSinav.sorular.map((s, idx) => ({
          no: idx + 1,
          id: s.id || `S-${idx + 1}`,
          tur: s.tur,
          metin: s.metin,
          siklar: s.siklar || []
        }));

        // Aynı öğrenci ve sınav için mevcut oturum kontrolü (Tekrar oturum açma / süre sıfırlama engeli)
        for (const [mevcutToken, mevcutOt] of sunucuDurumu.aktifTokenlar.entries()) {
          if (mevcutOt.ogrNo === ogr.ogrNo && mevcutOt.sinavId === aktifSinavId) {
            if (mevcutOt.bitti) {
              return gonderJson(res, 409, { hata: 'Bu sınav oturumu daha önce tamamlanmış ve teslim edilmiştir; tekrar başlatılamaz.' });
            }
            if (Date.now() < mevcutOt.bitisMs) {
              return gonderJson(res, 200, {
                token: mevcutToken,
                ogrNo: mevcutOt.ogrNo,
                adSoyad: mevcutOt.adSoyad,
                bitisMs: mevcutOt.bitisMs,
                soruSayisi: istemciSorulari.length,
                sorular: istemciSorulari,
                mevcutOturumDevam: true
              });
            }
          }
        }

        const token = crypto.randomBytes(24).toString('hex');
        const bitisMs = Date.now() + sunucuDurumu.aktifSinav.sureDk * 60 * 1000;

        sunucuDurumu.aktifTokenlar.set(token, {
          ogrNo: ogr.ogrNo,
          adSoyad: ogr.adSoyad,
          sinavId: aktifSinavId,
          bitisMs,
          cevaplar: {},
          bitti: false
        });

        return gonderJson(res, 200, {
          token,
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
        if (Date.now() > oturum.bitisMs || oturum.bitti) {
          return gonderJson(res, 403, { hata: 'Sınav süresi dolmuş veya sınav tamamlanmış.' });
        }

        const soruId = String(govde.soruId || '').trim();
        const secim = String(govde.secim !== undefined ? govde.secim : (govde.cevap !== undefined ? govde.cevap : '')).trim();
        const sinavSorulari = Array.isArray(sunucuDurumu.aktifSinav.sorular) ? sunucuDurumu.aktifSinav.sorular : [];
        const eslesenSoru = sinavSorulari.find((s, idx) => String(s.id || `S-${idx + 1}`) === soruId || `S-${idx + 1}` === soruId);
        if (!soruId || !eslesenSoru) {
          return gonderJson(res, 400, { hata: 'Geçersiz veya bu sınava ait olmayan soruId.' });
        }

        if (eslesenSoru.tur === 'test') {
          if (secim !== '' && !['A', 'B', 'C', 'D', 'E'].includes(secim)) {
            return gonderJson(res, 400, { hata: 'Test sorusu için geçersiz şık seçimi (yalnız A-E veya boş kabul edilir).' });
          }
        } else if (eslesenSoru.tur === 'dy') {
          if (secim !== '' && !['D', 'Y'].includes(secim)) {
            return gonderJson(res, 400, { hata: 'D/Y sorusu için geçersiz seçim (yalnız D, Y veya boş kabul edilir).' });
          }
        }

        if (Object.prototype.hasOwnProperty.call(oturum.cevaplar, soruId)) {
          return gonderJson(res, 409, { hata: 'Kilitlenmiş soruya geri dönülemez ve yanıt değiştirilemez.' });
        }

        oturum.cevaplar[soruId] = secim;
        return gonderJson(res, 200, { kaydedildi: true, soruId });
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
        if (oturum.bitti) {
          return gonderJson(res, 409, { hata: 'Bu sınav oturumu zaten teslim edilmiş.' });
        }

        oturum.bitti = true;
        oturum.teslimZamani = new Date().toISOString();

        const sinavSorulari = Array.isArray(sunucuDurumu.aktifSinav.sorular) ? sunucuDurumu.aktifSinav.sorular : [];
        let dogruSayisi = 0;
        sinavSorulari.forEach((s, idx) => {
          const sId = String(s.id || `S-${idx + 1}`);
          const verilen = oturum.cevaplar[sId] !== undefined ? oturum.cevaplar[sId] : oturum.cevaplar[`S-${idx + 1}`];
          if (s.tur === 'dy' && verilen && verilen === s.dogruDY) dogruSayisi++;
          else if (s.tur === 'test' && verilen && verilen === s.dogruHarf) dogruSayisi++;
          else if (s.tur === 'klasik' && String(verilen || '').trim().length >= 10) dogruSayisi++;
        });
        const toplamSoru = Math.max(1, sinavSorulari.length);
        const puan = Math.round((dogruSayisi / toplamSoru) * 100);
        const teslimHash = Cekirdek.uretDelilLogHash(`${oturum.sinavId}|${oturum.ogrNo}|${puan}|${oturum.teslimZamani}`, 'TESLIM-FIS').slice(0, 12);
        const teslimKodu = `#TESLIM-${teslimHash}`;
        oturum.puan = puan;
        oturum.dogruSayisi = dogruSayisi;
        oturum.teslimKodu = teslimKodu;

        return gonderJson(res, 200, {
          bitti: true,
          kaydedildi: true,
          ogrNo: oturum.ogrNo,
          sinavId: oturum.sinavId,
          dogruSayisi,
          toplamSoru: sinavSorulari.length,
          puan,
          teslimKodu
        });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 2b. Delil Niteliğinde Online Sınav Kiosk Log Kaydetme & Sorgulama
  if (req.method === 'POST' && yol === '/api/kiosk-log-kaydet') {
    okuJsonGovde(req)
      .then((govde) => {
        const oncekiHash = sunucuDurumu.kioskDelilLoglari.length > 0
          ? sunucuDurumu.kioskDelilLoglari[sunucuDurumu.kioskDelilLoglari.length - 1].olayHash
          : 'GENESIS-00000000';
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');
        const sunucuSimdiIso = new Date().toISOString();
        const kayit = Cekirdek.olusturKioskDelilLogKaydi(
          Object.assign({}, govde, {
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
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(txt);
      return;
    }
    if (format === 'csv') {
      const csv = Cekirdek.uretDelilLogCSV(loglar, sinavId || 'TUMU');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
      res.end(csv);
      return;
    }
    return gonderJson(res, 200, { loglar });
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
    kucukYol === '/omr-geometri-denetim.js' ||
    kucukYol.startsWith('/ornek-dosyalar/') ||
    kucukYol.startsWith('/node_modules/') ||
    kucukYol.startsWith('/.') ||
    /\/[a-z0-9_-]*test\.js$/i.test(kucukYol);
  if (engelliDesen) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Dosya bulunamadi');
    return;
  }
  const tamDosyaYolu = path.normalize(path.join(KOK_DIZIN, temizYol));
  if (!tamDosyaYolu.startsWith(KOK_DIZIN)) {
    res.writeHead(403);
    res.end('Erisim engellendi');
    return;
  }

  fs.readFile(tamDosyaYolu, (err, icerik) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Dosya bulunamadi');
      return;
    }
    const uzanti = path.extname(tamDosyaYolu).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TIPLERI[uzanti] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
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
  return sonuc;
}

module.exports = { baslatSunucu, sunucuDurumu, kontrolZeroTrustYuk };
