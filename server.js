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
  aktifHocaTokenlar: new Set(),
  aktifTokenlar: new Map(), // token -> { ogrNo, adSoyad, bitisMs, cevaplar, bitti }
  omrSonuclari: []
};

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
  if (req.method === 'GET' && yol === '/api/ag-adresi') {
    const ipler = yerelAgAdresleri();
    const port = req.socket.localPort;
    return gonderJson(res, 200, { adresler: ipler.map((ip) => `http://${ip}:${port}`) });
  }

  // 0. Öğretmen / Öğretim Elemanı (Hoca) Kullanıcı Adı & Şifre Giriş Doğrulaması
  if (req.method === 'POST' && yol === '/api/hoca-giris') {
    okuJsonGovde(req)
      .then((govde) => {
        const sonuc = Cekirdek.dogrulaHocaGiris(govde.kullaniciAdi, govde.sifre, sunucuDurumu.hocaHesap);
        if (!sonuc.basarili) {
          return gonderJson(res, sonuc.kod, { hata: sonuc.hata });
        }
        const hocaToken = crypto.randomBytes(24).toString('hex');
        sunucuDurumu.aktifHocaTokenlar.add(hocaToken);
        return gonderJson(res, 200, {
          token: hocaToken,
          kullaniciAdi: sonuc.kullaniciAdi,
          adSoyad: sonuc.adSoyad,
          eposta: sonuc.eposta
        });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 0b. Hoca Tarafından Online Sınav Tanımlama / Güncelleme ve Sunucu Durumu Sorgulama
  if (req.method === 'POST' && yol === '/api/online-sinav-tanimla') {
    okuJsonGovde(req, 524288)
      .then((govde) => {
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

  // 1. Öğrenci Online Sınav Oturumu Başlatma (Zero-Trust)
  if (req.method === 'POST' && yol === '/api/ogrenci-oturum-baslat') {
    okuJsonGovde(req)
      .then((govde) => {
        const ihlal = kontrolZeroTrustYuk(govde, true);
        if (ihlal) return gonderJson(res, 400, { hata: ihlal });

        const ogrNo = String(govde.ogrNo || '').trim();
        if (!ogrNo || !sunucuDurumu.kayitliOgrenciler.has(ogrNo)) {
          return gonderJson(res, 401, { hata: 'Kayıtlı öğrenci numarası doğrulanamadı.' });
        }

        const ogr = sunucuDurumu.kayitliOgrenciler.get(ogrNo);
        const token = crypto.randomBytes(24).toString('hex');
        const bitisMs = Date.now() + sunucuDurumu.aktifSinav.sureDk * 60 * 1000;

        // Cevap anahtarı (dogruHarf / dogruDY) istemciye ASLA gönderilmez!
        const istemciSorulari = sunucuDurumu.aktifSinav.sorular.map((s, idx) => ({
          no: idx + 1,
          id: s.id,
          tur: s.tur,
          metin: s.metin,
          siklar: s.siklar || []
        }));

        sunucuDurumu.aktifTokenlar.set(token, {
          ogrNo: ogr.ogrNo,
          adSoyad: ogr.adSoyad,
          sinavId: sunucuDurumu.aktifSinav.sinavId,
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

  // 2. Öğrenci Tek Soru Cevabı Kaydetme (Zero-Trust)
  if (req.method === 'POST' && yol === '/api/ogrenci-cevap') {
    okuJsonGovde(req)
      .then((govde) => {
        const ihlal = kontrolZeroTrustYuk(govde, false);
        if (ihlal) return gonderJson(res, 400, { hata: ihlal });

        const token = String(govde.token || '');
        const oturum = sunucuDurumu.aktifTokenlar.get(token);
        if (!oturum) return gonderJson(res, 401, { hata: 'Geçersiz veya süresi dolmuş oturum tokenı.' });
        if (Date.now() > oturum.bitisMs || oturum.bitti) {
          return gonderJson(res, 403, { hata: 'Sınav süresi dolmuş veya sınav tamamlanmış.' });
        }

        const soruId = String(govde.soruId || '');
        const secim = String(govde.secim || '');
        if (Object.prototype.hasOwnProperty.call(oturum.cevaplar, soruId)) {
          return gonderJson(res, 409, { hata: 'Kilitlenmiş soruya geri dönülemez ve yanıt değiştirilemez.' });
        }

        oturum.cevaplar[soruId] = secim;
        return gonderJson(res, 200, { kaydedildi: true, soruId });
      })
      .catch((err) => gonderJson(res, 400, { hata: err.message }));
    return;
  }

  // 3. Statik Dosya Sunumu
  const temizYol = yol === '/' ? '/index.html' : yol;
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
