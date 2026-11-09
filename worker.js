/* ==========================================================================
   EVRENSEL SINAV KAĞIDI STÜDYOSU & MOBİL OMR — CLOUDFLARE WORKER (worker.js)
   İstemciye Sıfır Güven (Zero-Trust Client), Sunucu Otoriteli Sınav & OMR API
   ========================================================================== */

import Cekirdek from './guvenlik-ve-veri.js';

const sunucuDurumu = {
  aktifSinav: {
    sinavId: 'SINAV-2026-GUZ',
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
  omrSonuclari: []
};

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

    if (metot === 'GET' && yol === '/api/ag-adresi') {
      return gonderJson(200, { adresler: [urlNesne.origin] });
    }

    if (yol === '/api/ogrenci-qr-senkron') {
      if (metot === 'POST') {
        try {
          const govde = await okuJsonGovde(request, 524288);
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
          return gonderJson(200, { basarili: true, oturumKodu, aktarilanSayi: ogrenciler.length, adet: ogrenciler.length });
        } catch (err) {
          return gonderJson(400, { hata: err.message });
        }
      }
      if (metot === 'GET') {
        const oturumKodu = String(urlNesne.searchParams.get('oturumKodu') || urlNesne.searchParams.get('oturum') || 'GENEL').trim().toUpperCase() || 'GENEL';
        const tuket = urlNesne.searchParams.get('tuket') === '1';
        const kayit = sunucuDurumu.ogrenciQrKuyrugu.get(oturumKodu) || null;
        if (kayit && tuket) sunucuDurumu.ogrenciQrKuyrugu.delete(oturumKodu);
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
          const cozum = Cekirdek.cozOmrSonucPaketi(govde && govde.paket ? govde.paket : govde);
          if (!cozum.gecerli || cozum.sonuclar.length === 0) {
            return gonderJson(400, { hata: cozum.hata || 'Aktarılacak geçerli OMR okuma sonucu bulunamadı.' });
          }
          const kayit = { oturumKodu, sonuclar: cozum.sonuclar, adet: cozum.sonuclar.length, zamanMs: Date.now() };
          sunucuDurumu.omrSonucKuyrugu.set(oturumKodu, kayit);
          sunucuDurumu.omrSonuclari = cozum.sonuclar;
          return gonderJson(200, { basarili: true, oturumKodu, aktarilanSayi: cozum.sonuclar.length, adet: cozum.sonuclar.length });
        } catch (err) {
          return gonderJson(400, { hata: err.message });
        }
      }
      if (metot === 'GET') {
        const oturumKodu = String(urlNesne.searchParams.get('oturumKodu') || urlNesne.searchParams.get('oturum') || 'GENEL').trim().toUpperCase() || 'GENEL';
        const tuket = urlNesne.searchParams.get('tuket') === '1';
        const kayit = sunucuDurumu.omrSonucKuyrugu.get(oturumKodu) || null;
        if (kayit && tuket) sunucuDurumu.omrSonucKuyrugu.delete(oturumKodu);
        const varMi = Boolean(kayit && Array.isArray(kayit.sonuclar) && kayit.sonuclar.length > 0);
        return gonderJson(200, {
          varMi,
          bulundu: varMi,
          oturumKodu,
          sonuclar: kayit ? kayit.sonuclar : [],
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
          sorular: Array.isArray(sinav.sorular) && sinav.sorular.length > 0 ? sinav.sorular : sunucuDurumu.aktifSinav.sorular
        };
        if (Array.isArray(govde.ogrenciler)) {
          govde.ogrenciler.forEach((o) => {
            if (o && typeof o.ogrNo === 'string' && o.ogrNo.trim()) {
              sunucuDurumu.kayitliOgrenciler.set(o.ogrNo.trim(), o);
            }
          });
        }
        return gonderJson(200, {
          kaydedildi: true,
          sinavId: sunucuDurumu.aktifSinav.sinavId,
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
        const istemciSorulari = sunucuDurumu.aktifSinav.sorular.map((s, idx) => ({
          no: idx + 1,
          id: s.id || `S-${idx + 1}`,
          tur: s.tur,
          metin: s.metin,
          siklar: s.siklar || []
        }));

        for (const [mevcutToken, mevcutOt] of sunucuDurumu.aktifTokenlar.entries()) {
          if (mevcutOt.ogrNo === ogr.ogrNo && mevcutOt.sinavId === aktifSinavId) {
            if (mevcutOt.bitti) {
              return gonderJson(409, { hata: 'Bu sınav oturumu daha önce tamamlanmış ve teslim edilmiştir; tekrar başlatılamaz.' });
            }
            if (Date.now() < mevcutOt.bitisMs) {
              return gonderJson(200, {
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

        const token = uretRastgeleToken(24);
        const bitisMs = Date.now() + sunucuDurumu.aktifSinav.sureDk * 60 * 1000;
        sunucuDurumu.aktifTokenlar.set(token, {
          ogrNo: ogr.ogrNo,
          adSoyad: ogr.adSoyad,
          sinavId: aktifSinavId,
          bitisMs,
          cevaplar: {},
          bitti: false
        });
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
        if (Date.now() > oturum.bitisMs || oturum.bitti) {
          return gonderJson(403, { hata: 'Sınav süresi dolmuş veya sınav tamamlanmış.' });
        }

        const soruId = String(govde.soruId || '').trim();
        const secim = String(govde.secim !== undefined ? govde.secim : (govde.cevap !== undefined ? govde.cevap : '')).trim();
        const sinavSorulari = Array.isArray(sunucuDurumu.aktifSinav.sorular) ? sunucuDurumu.aktifSinav.sorular : [];
        const eslesenSoru = sinavSorulari.find((s, idx) => String(s.id || `S-${idx + 1}`) === soruId || `S-${idx + 1}` === soruId);
        if (!soruId || !eslesenSoru) {
          return gonderJson(400, { hata: 'Geçersiz veya bu sınava ait olmayan soruId.' });
        }

        if (eslesenSoru.tur === 'test') {
          if (secim !== '' && !['A', 'B', 'C', 'D', 'E'].includes(secim)) {
            return gonderJson(400, { hata: 'Test sorusu için geçersiz şık seçimi (yalnız A-E veya boş kabul edilir).' });
          }
        } else if (eslesenSoru.tur === 'dy') {
          if (secim !== '' && !['D', 'Y'].includes(secim)) {
            return gonderJson(400, { hata: 'D/Y sorusu için geçersiz seçim (yalnız D, Y veya boş kabul edilir).' });
          }
        }

        if (Object.prototype.hasOwnProperty.call(oturum.cevaplar, soruId)) {
          return gonderJson(409, { hata: 'Kilitlenmiş soruya geri dönülemez ve yanıt değiştirilemez.' });
        }

        oturum.cevaplar[soruId] = secim;
        return gonderJson(200, { kaydedildi: true, soruId });
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
        if (oturum.bitti) {
          return gonderJson(409, { hata: 'Bu sınav oturumu zaten teslim edilmiş.' });
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

        return gonderJson(200, {
          bitti: true,
          kaydedildi: true,
          ogrNo: oturum.ogrNo,
          sinavId: oturum.sinavId,
          dogruSayisi,
          toplamSoru: sinavSorulari.length,
          puan,
          teslimKodu
        });
      } catch (err) {
        return gonderJson(400, { hata: err.message });
      }
    }

    if (metot === 'POST' && yol === '/api/kiosk-log-kaydet') {
      try {
        const govde = await okuJsonGovde(request);
        const oncekiHash = sunucuDurumu.kioskDelilLoglari.length > 0
          ? sunucuDurumu.kioskDelilLoglari[sunucuDurumu.kioskDelilLoglari.length - 1].olayHash
          : 'GENESIS-00000000';
        const ip = String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1');
        const sunucuSimdiIso = new Date().toISOString();
        const kayit = Cekirdek.olusturKioskDelilLogKaydi(
          Object.assign({}, govde, {
            zamanDamgasi: sunucuSimdiIso,
            cihazBilgisi: `${govde.cihazBilgisi || ''} [IP: ${ip}]`.trim()
          }),
          oncekiHash
        );
        sunucuDurumu.kioskDelilLoglari.push(kayit);
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
      return new Response('Dosya bulunamadi', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }
    return new Response('Dosya bulunamadi', { status: 404 });
  }
};
