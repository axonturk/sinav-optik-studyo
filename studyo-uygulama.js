/* ==========================================================================
   EVRENSEL SINAV KAĞIDI STÜDYOSU & MOBİL OMR — ANA UYGULAMA MOTORU
   Dinamik 1 A4 (Önlü-Arkalı 2 Sayfa) Ölçekleme, Parametrik Optik Form,
   A/B/C/D Kitapçık, 7 Adımlı OMR Röntgeni, Madde Analizi ve Kiosk Modu
   ========================================================================== */

(function () {
  'use strict';

  const C = window.SinavOptikCekirdek;
  const DEPO_ANAHTAR = 'SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2';
  const ESKI_DEPO_ANAHTARLARI = ['SINAV_OPTIK_STUDYO_VERI_V1'];

  /* Uygulama Durumu (State) — Örnek/Demo Veri İçermeyen Temiz Başlangıç */
  const durum = {
    dersler: [],
    aktifDersId: 'genel',
    sorular: [],
    ogrenciKayitlari: [],
    salonlar: [{ id: 'salon-1', ad: 'Salon 1', kontenjan: 40, gozetmenler: [] }],
    dagitimModu: 'sirali',
    okumaSonuclari: [],
    arsivDersler: [],
    onlineSinav: {
      aktif: false,
      sinavId: '',
      baslik: '',
      sinavTuru: 'Vize (Ara Sınav)',
      dersId: 'genel',
      baslangic: '2026-11-07T09:00',
      bitis: '2026-11-07T18:00',
      sureDk: 40,
      dySayisi: 10,
      testSayisi: 10,
      klasikSayisi: 0,
      haftaKapsam: 'studyo',
      maksIhlal: 0,
      erisimKodu: '',
      kisiyeOzel: true,
      geriDonusKilit: true,
      oturumlar: []
    },
    onlineSinavListesi: [],
    kaliteGorselDataUrl: null,
    kaliteAltBilgiDataUrl: null,
    kaliteHamTamSayfaDataUrl: null,
    yeniSoruGorselDataUrl: null,
    klasikTekTekPuanlar: [10, 10, 10, 10, 10],
    seciliHaftalar: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    haftaKotalari: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 2, 13: 2, 14: 2 },
    reddedilenSoruIdleri: [],
    sabitlenenSoruIdleri: [],
    ozelSeciliSoruIdleri: { dy: [], test: [], klasik: [] },
    sonSecimYapilandirmaImzasi: '',
    duzenlenenSoruId: null,
    evrakSablonu: {
      kurum: 'KIRIKHAN MESLEK YÜKSEKOKULU',
      fakulte: '',
      bolum: '',
      sorumlu: '',
      sure: '60 Dakika',
      tarih: '07.11.2026',
      sinavAd: '2026-2027 GÜZ DÖNEMİ ARA SINAVI (VİZE)',
      donem: '2026-2027 GÜZ',
      kunyeModu: 'sade',
      dokumanNoDurum: 'FRM-046',
      dokumanNoYoklama: 'FRM-059',
      yayinTarihi: '30.01.2023',
      revTarihi: '-',
      revizyon: '-',
      kaliteFormTipi: 'standart',
      kaliteDokumanNo: '',
      kaliteYayinTarihi: '',
      kaliteRevizyon: '',
      gozetmen1: '',
      gozetmen2: '',
      uygunluk: 'bos'
    },
    pcQrEslesmeKodu: '',
    pcQrKameraStream: null,
    ogrQrParcaIdx: 0,
    hocaHesap: Object.assign({}, C.VARSAYILAN_HOCA_HESAP),
    hocaListesi: [
      Object.assign({}, C.VARSAYILAN_HOCA_HESAP, {
        rol: 'yonetici',
        durum: 'aktif',
        kayitTarihi: '2026-09-01'
      })
    ],
    davetKodu: C.VARSAYILAN_DAVET_KODU || 'AKADEMI-2026',
    hocaOturumAcik: false,
    kioskOturum: null,
    kioskDelilLoglari: [],
    kameraStream: null,
    kurumsalSablonlar: Array.isArray(C.VARSAYILAN_KURUMSAL_SABLONLAR)
      ? C.VARSAYILAN_KURUMSAL_SABLONLAR.map((s) => JSON.parse(JSON.stringify(s)))
      : [],
    aktifKurumSablonId: 'kurum-standart-myo-2026',
    donemDigerSinavlar: [],
    geciciBolognaCozum: null,
    geciciBolognaHtml: '',
    geciciBolognaGorselDataUrl: '',
    geciciAiOcOnerileri: [],
    ekSayfaIzni: false,
    depoKurtarmaMesaji: '',
    hariciOmrAnahtar: {
      aktif: false,
      dySayisi: 10,
      testSayisi: 20,
      sikSayisi: 5,
      klasikSayisi: 0,
      anahtarlar: {
        A: { dy: '', test: '' },
        B: { dy: '', test: '' },
        C: { dy: '', test: '' },
        D: { dy: '', test: '' }
      }
    },
    revizyonNo: 0,
    sonBulutRevizyonNo: 0,
    sekmeId: 'SEKME-' + Math.random().toString(36).slice(2, 9),
    kayitliSinavlar: [],
    aktifKayitliSinavId: '',
    dersTaslakSinavlari: {},
    salonlarHaritasi: {},
    okumaSonuclariHaritasi: {},
    sonGeriAlYedegi: null,
    degisiklikBekliyor: false,
    sonKayitSaatMetni: '',
    bulutSenkronDurumu: 'yerel'
  };

  function varsayilanBosDers() {
    const sb = durum.evrakSablonu || {};
    return {
      id: durum.aktifDersId || 'genel',
      kod: 'DERS',
      ad: 'Yeni Ders',
      fakulte: sb.fakulte || sb.kurum || '',
      bolum: sb.bolum || '',
      ogretimElemani: sb.sorumlu || (durum.hocaHesap && durum.hocaHesap.adSoyad) || 'Öğr. Gör. Örnek Eğitmen'
    };
  }

  /* Her öğrenci kaydı hangi derslere kayıtlı olduğunu (dersIdler) taşır.
     Ders bilgisi olmayan eski kayıtlar tüm mevcut derslere kayıtlı sayılır (geriye uyumluluk). */
  function ogrenciKayitlariniHazirla(liste) {
    const tumDersler = durum.dersler.length > 0 ? durum.dersler.map((d) => d.id) : [durum.aktifDersId || 'genel'];
    return (Array.isArray(liste) ? liste : []).map((o) => ({
      ...o,
      dersIdler: Array.isArray(o.dersIdler) && o.dersIdler.length > 0 ? o.dersIdler.slice() : tumDersler.slice()
    }));
  }

  function aktifDersOgrencileriniGetir() {
    const aktifId = durum.aktifDersId || 'genel';
    return durum.ogrenciKayitlari.filter((o) => !Array.isArray(o.dersIdler) || o.dersIdler.length === 0 || o.dersIdler.includes(aktifId));
  }

  /* durum.ogrenciler = seçili dersin öğrencileri.
     Okuma: yalnızca aktif derse kayıtlı öğrenciler. Atama: aktif dersin listesini değiştirir
     (listede olmayanlar bu dersten çıkarılır, yeniler eklenir; başka derslerdeki kayıtlar korunur). */
  Object.defineProperty(durum, 'ogrenciler', {
    enumerable: false,
    get() {
      return aktifDersOgrencileriniGetir();
    },
    set(yeniListe) {
      const aktif = durum.aktifDersId || 'genel';
      const gelen = Array.isArray(yeniListe) ? yeniListe : [];
      const nolar = new Set(gelen.map((o) => String(o.ogrNo)));
      durum.ogrenciKayitlari.forEach((k) => {
        if (!nolar.has(String(k.ogrNo))) k.dersIdler = (k.dersIdler || []).filter((d) => d !== aktif);
      });
      gelen.forEach((o) => {
        const mevcut = durum.ogrenciKayitlari.find((k) => String(k.ogrNo) === String(o.ogrNo));
        if (mevcut) {
          Object.assign(mevcut, o);
          if (!mevcut.dersIdler.includes(aktif)) mevcut.dersIdler.push(aktif);
        } else {
          durum.ogrenciKayitlari.push({ ...o, dersIdler: [aktif] });
        }
      });
      durum.ogrenciKayitlari = durum.ogrenciKayitlari.filter((k) => k.dersIdler.length > 0);
    }
  });
  function ogrenciEkleAktifDerse(ogrNo, adSoyad) {
    const aktif = durum.aktifDersId || 'genel';
    const mevcut = durum.ogrenciKayitlari.find((k) => String(k.ogrNo) === String(ogrNo));
    if (mevcut) {
      if (!Array.isArray(mevcut.dersIdler)) mevcut.dersIdler = [];
      if (!mevcut.dersIdler.includes(aktif)) mevcut.dersIdler.push(aktif);
    } else {
      durum.ogrenciKayitlari.push({ ogrNo, adSoyad, bolum: "Genel", dersIdler: [aktif] });
    }
  }


  /* Dersin öğrencisi yoksa true (boş ders) */
  function aktifDersiBosMu() {
    return aktifDersOgrencileriniGetir().length === 0;
  }

  /* Seçili dersin öğrencilerini kontenjana göre salonlara dağıtır */
  function aktifDersSalonYerlesimi() {
    return C.salonlaraDagit(aktifDersOgrencileriniGetir(), durum.salonlar, durum.dagitimModu);
  }

  /* Mükerrer (aynı ders kodu + aynı ders adı) dersleri birleştirir ve soruları asıl derse bağlar */
  function birlestirMukerrerDersler() {
    if (!Array.isArray(durum.dersler) || durum.dersler.length < 2) return 0;
    const anahtarHaritasi = new Map();
    const idYonlendirme = new Map();
    const temizDersler = [];

    const soruSay = (dId) => (durum.sorular || []).filter((s) => s && !s.arsivde && s.dersId === dId).length;
    durum.dersler.forEach((d) => {
      if (!d || typeof d !== 'object') return;
      const anahtar = `${String(d.kod || '').trim().toUpperCase()}||${String(d.ad || '').trim().toLocaleLowerCase('tr-TR')}`;
      const mevcut = anahtarHaritasi.get(anahtar);
      if (!mevcut) {
        anahtarHaritasi.set(anahtar, d);
        temizDersler.push(d);
        return;
      }
      // Sorusu veya ÖÇ'si daha fazla olan kaydı ana ders olarak koru
      const mevcutSoru = soruSay(mevcut.id);
      const yeniSoru = soruSay(d.id);
      if (yeniSoru > mevcutSoru) {
        idYonlendirme.set(mevcut.id, d.id);
        if ((!Array.isArray(d.ogrenimCiktilari) || d.ogrenimCiktilari.length === 0) && Array.isArray(mevcut.ogrenimCiktilari)) {
          d.ogrenimCiktilari = mevcut.ogrenimCiktilari;
        }
        if (!d.bolognaBilgisi && mevcut.bolognaBilgisi) d.bolognaBilgisi = mevcut.bolognaBilgisi;
        const idx = temizDersler.indexOf(mevcut);
        if (idx >= 0) temizDersler[idx] = d;
        anahtarHaritasi.set(anahtar, d);
      } else {
        idYonlendirme.set(d.id, mevcut.id);
        if ((!Array.isArray(mevcut.ogrenimCiktilari) || mevcut.ogrenimCiktilari.length === 0) && Array.isArray(d.ogrenimCiktilari)) {
          mevcut.ogrenimCiktilari = d.ogrenimCiktilari;
        }
        if (!mevcut.bolognaBilgisi && d.bolognaBilgisi) mevcut.bolognaBilgisi = d.bolognaBilgisi;
      }
    });

    if (idYonlendirme.size > 0) {
      durum.dersler = temizDersler;
      (durum.sorular || []).forEach((s) => {
        if (s && idYonlendirme.has(s.dersId)) s.dersId = idYonlendirme.get(s.dersId);
      });
      (durum.ogrenciKayitlari || []).forEach((o) => {
        if (o && Array.isArray(o.dersIdler)) {
          const kume = new Set(o.dersIdler.map((x) => idYonlendirme.get(x) || x));
          o.dersIdler = Array.from(kume);
        }
      });
      (durum.onlineSinavListesi || []).forEach((sn) => {
        if (sn && idYonlendirme.has(sn.dersId)) sn.dersId = idYonlendirme.get(sn.dersId);
      });
      if (durum.onlineSinav && idYonlendirme.has(durum.onlineSinav.dersId)) {
        durum.onlineSinav.dersId = idYonlendirme.get(durum.onlineSinav.dersId);
      }
      if (idYonlendirme.has(durum.aktifDersId)) {
        durum.aktifDersId = idYonlendirme.get(durum.aktifDersId);
      }
    }
    return idYonlendirme.size;
  }

  /* Kardeş alanlardan biri bozulduğunda tüm soru bankasının silinmesini önleyen kayıt-bazlı kurtarıcı */
  function kurtarYerelDepoVerisi(hamNesne) {
    if (!hamNesne || typeof hamNesne !== 'object' || Array.isArray(hamNesne)) return null;
    const kurtarilan = {};
    const kurtarDizi = (alanAdi) => {
      const dizi = hamNesne[alanAdi];
      if (!Array.isArray(dizi)) return undefined;
      const gecerliler = [];
      for (let i = 0; i < dizi.length; i++) {
        try {
          const tek = C.semaDogrulaVeTemizle({ [alanAdi]: [dizi[i]] });
          if (tek && Array.isArray(tek[alanAdi]) && tek[alanAdi][0]) {
            gecerliler.push(tek[alanAdi][0]);
          }
        } catch (_) {}
      }
      return gecerliler;
    };

    ['dersler', 'sorular', 'ogrenciler', 'salonlar', 'arsivDersler', 'onlineSinavListesi', 'okumaSonuclari', 'hocaListesi', 'kioskDelilLoglari', 'kurumsalSablonlar'].forEach((alan) => {
      const d = kurtarDizi(alan);
      if (d !== undefined) kurtarilan[alan] = d;
    });
    ['aktifDersId', 'dagitimModu', 'davetKodu', 'onlineSinav', 'hocaHesap', 'evrakSablonu'].forEach((alan) => {
      if (hamNesne[alan] === undefined) return;
      try {
        const tek = C.semaDogrulaVeTemizle({ [alan]: hamNesne[alan] });
        if (tek && tek[alan] !== undefined) kurtarilan[alan] = tek[alan];
      } catch (_) {}
    });
    return kurtarilan;
  }

  function gosterDepoKurtarmaUyarisi(mesaj) {
    durum.depoKurtarmaMesaji = mesaj || '';
    const cubuk = document.getElementById('uyari-depo-kurtarma-cubuk');
    if (cubuk) {
      cubuk.textContent = mesaj || '';
      cubuk.style.display = mesaj ? 'block' : 'none';
    }
  }

  /* IndexedDB İkincil Yedek Aynası (5 MB localStorage kotası dolduğunda soruları korur) */
  function idbAc() {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      try {
        const istek = indexedDB.open('SinavOptikKurtarmaV1', 1);
        istek.onupgradeneeded = () => {
          const db = istek.result;
          if (!db.objectStoreNames.contains('durum')) db.createObjectStore('durum');
        };
        istek.onsuccess = () => resolve(istek.result);
        istek.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  let __idbYazmaKuyrugu = Promise.resolve();

  function idbYedekYaz(veriPaketi) {
    __idbYazmaKuyrugu = __idbYazmaKuyrugu.then(() => idbAc().then((db) => {
      if (!db) return;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction('durum', 'readwrite');
          const store = tx.objectStore('durum');
          const gelenRev = Number(veriPaketi && veriPaketi.ana && veriPaketi.ana.revizyonNo) || 0;
          const zorla = Boolean(veriPaketi && veriPaketi.zorlaEz);
          const getReq = store.get('ana_paket');
          getReq.onsuccess = () => {
            try {
              const mevcut = getReq.result;
              const mevcutRev = Number(mevcut && mevcut.ana && mevcut.ana.revizyonNo) || 0;
              if (!zorla && mevcutRev > gelenRev && gelenRev > 0) {
                resolve();
                return;
              }
              store.put(veriPaketi, 'ana_paket');
            } catch (_) {
              try { store.put(veriPaketi, 'ana_paket'); } catch (__) {}
            }
          };
          getReq.onerror = () => {
            try { store.put(veriPaketi, 'ana_paket'); } catch (_) {}
          };
          tx.oncomplete = () => { try { db.close(); } catch (_) {} resolve(); };
          tx.onerror = () => { try { db.close(); } catch (_) {} resolve(); };
          tx.onabort = () => { try { db.close(); } catch (_) {} resolve(); };
        } catch (_) {
          try { db.close(); } catch (__) {}
          resolve();
        }
      });
    })).catch(() => {});
    return __idbYazmaKuyrugu;
  }

  function idbYedekOku() {
    return idbAc().then((db) => {
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction('durum', 'readonly');
          const req = tx.objectStore('durum').get('ana_paket');
          req.onsuccess = () => {
            const sonuc = req.result || null;
            try { db.close(); } catch (_) {}
            resolve(sonuc);
          };
          req.onerror = () => {
            try { db.close(); } catch (_) {}
            resolve(null);
          };
        } catch (_) {
          try { db.close(); } catch (__) {}
          resolve(null);
        }
      });
    });
  }

  /* Ders listesi mevcutken 'genel' havuzunda kalan yetim soruları ilk derse bağlar (diğer derslere sızmasını önler) */
  function baglaYetimGenelSorulariIlkDerse() {
    if (Array.isArray(durum.dersler) && durum.dersler.length >= 1 && durum.dersler[0] && durum.dersler[0].id) {
      const ilkDersId = durum.dersler[0].id;
      (durum.sorular || []).forEach((s) => {
        if (s && !s.arsivde && (!s.dersId || s.dersId === 'genel')) {
          s.dersId = ilkDersId;
        }
      });
    }
  }

  /* Ders bazlı taslak sınav ayarları, salonlar ve OMR okuma sonuçları izolasyonu */
  function okuStüdyoTaslakFormDurumu(dersId) {
    const al = (id, v) => {
      const el = document.getElementById(id);
      return el && el.value !== undefined ? el.value : v;
    };
    const mevcut = (durum.dersTaslakSinavlari && durum.dersTaslakSinavlari[dersId]) || {};
    return {
      dySayisi: al('ayar-dy-sayisi', '5'),
      dyToplamPuan: al('ayar-dy-toplam-puan', '20'),
      testSayisi: al('ayar-test-sayisi', '15'),
      testToplamPuan: al('ayar-test-toplam-puan', '60'),
      sikSayisi: al('ayar-sik-sayisi', '5'),
      klasikSayisi: al('ayar-klasik-sayisi', '2'),
      klasikPuanModu: al('ayar-klasik-puan-modu', 'esit'),
      klasikOptikModu: al('ayar-klasik-optik-modu', 'kademeli6'),
      klasikToplamPuan: al('ayar-klasik-toplam-puan', '20'),
      klasikTekTekPuanlar: (durum.klasikTekTekPuanlar || [10, 10, 10, 10, 10]).slice(),
      seciliHaftalar: (durum.seciliHaftalar || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]).slice(),
      haftaKotalari: Object.assign({}, durum.haftaKotalari || {}),
      ozelSeciliSoruIdleri: JSON.parse(JSON.stringify(durum.ozelSeciliSoruIdleri || { dy: [], test: [], klasik: [] })),
      sabitlenenSoruIdleri: (durum.sabitlenenSoruIdleri || []).slice(),
      sinavGizliAnahtar: mevcut.sinavGizliAnahtar || (typeof C.uretSinavGizliAnahtari === 'function' ? C.uretSinavGizliAnahtari() : '')
    };
  }

  function kaydetAktifDersIzoleDurumu(dersId = durum.aktifDersId) {
    const anahtar = dersId || 'genel';
    if (!durum.dersTaslakSinavlari || typeof durum.dersTaslakSinavlari !== 'object') durum.dersTaslakSinavlari = {};
    if (!durum.salonlarHaritasi || typeof durum.salonlarHaritasi !== 'object') durum.salonlarHaritasi = {};
    if (!durum.okumaSonuclariHaritasi || typeof durum.okumaSonuclariHaritasi !== 'object') durum.okumaSonuclariHaritasi = {};
    if (!durum.aktifKayitliSinavId) {
      durum.dersTaslakSinavlari[anahtar] = okuStüdyoTaslakFormDurumu(anahtar);
    }
    durum.salonlarHaritasi[anahtar] = JSON.parse(JSON.stringify(durum.salonlar || [{ id: 'salon-1', ad: 'Salon 1', kontenjan: 40, gozetmenler: [] }]));
    durum.okumaSonuclariHaritasi[anahtar] = (durum.okumaSonuclari || []).map(okumaSonucunuHafifletir);
  }

  function yukleAktifDersIzoleDurumu(yeniDersId) {
    const anahtar = yeniDersId || 'genel';
    durum.aktifKayitliSinavId = '';
    if (durum.salonlarHaritasi && Array.isArray(durum.salonlarHaritasi[anahtar]) && durum.salonlarHaritasi[anahtar].length > 0) {
      durum.salonlar = JSON.parse(JSON.stringify(durum.salonlarHaritasi[anahtar]));
    } else {
      durum.salonlar = [{ id: 'salon-1', ad: 'Salon 1', kontenjan: 40, gozetmenler: [] }];
    }
    if (durum.okumaSonuclariHaritasi && Array.isArray(durum.okumaSonuclariHaritasi[anahtar])) {
      durum.okumaSonuclari = durum.okumaSonuclariHaritasi[anahtar].slice();
    } else {
      durum.okumaSonuclari = [];
    }
    const taslak = durum.dersTaslakSinavlari && durum.dersTaslakSinavlari[anahtar];
    if (taslak && typeof taslak === 'object') {
      const yaz = (id, v) => {
        const el = document.getElementById(id);
        if (el && v !== undefined && v !== null) el.value = String(v);
      };
      yaz('ayar-dy-sayisi', taslak.dySayisi);
      yaz('ayar-dy-toplam-puan', taslak.dyToplamPuan);
      yaz('ayar-test-sayisi', taslak.testSayisi);
      yaz('ayar-test-toplam-puan', taslak.testToplamPuan);
      yaz('ayar-sik-sayisi', taslak.sikSayisi);
      yaz('ayar-klasik-sayisi', taslak.klasikSayisi);
      yaz('ayar-klasik-puan-modu', taslak.klasikPuanModu);
      yaz('ayar-klasik-optik-modu', taslak.klasikOptikModu);
      yaz('ayar-klasik-toplam-puan', taslak.klasikToplamPuan);
      if (Array.isArray(taslak.klasikTekTekPuanlar)) durum.klasikTekTekPuanlar = taslak.klasikTekTekPuanlar.slice();
      if (Array.isArray(taslak.seciliHaftalar) && taslak.seciliHaftalar.length > 0) durum.seciliHaftalar = taslak.seciliHaftalar.slice();
      if (taslak.haftaKotalari && typeof taslak.haftaKotalari === 'object') durum.haftaKotalari = Object.assign({}, taslak.haftaKotalari);
      if (taslak.ozelSeciliSoruIdleri && typeof taslak.ozelSeciliSoruIdleri === 'object') {
        durum.ozelSeciliSoruIdleri = JSON.parse(JSON.stringify(taslak.ozelSeciliSoruIdleri));
      }
      if (Array.isArray(taslak.sabitlenenSoruIdleri)) durum.sabitlenenSoruIdleri = taslak.sabitlenenSoruIdleri.slice();
    } else {
      durum.ozelSeciliSoruIdleri = { dy: [], test: [], klasik: [] };
      durum.sabitlenenSoruIdleri = [];
      durum.sonSecimYapilandirmaImzasi = '';
    }
  }

  function degistirAktifDersGuvenli(yeniDersId) {
    if (!yeniDersId || yeniDersId === durum.aktifDersId) return;
    kaydetAktifDersIzoleDurumu(durum.aktifDersId);
    durum.aktifDersId = yeniDersId;
    yukleAktifDersIzoleDurumu(yeniDersId);
  }

  function saatMetniUret(ms = Date.now()) {
    const d = new Date(ms);
    const iki = (n) => String(n).padStart(2, '0');
    return `${iki(d.getHours())}:${iki(d.getMinutes())}:${iki(d.getSeconds())}`;
  }

  let __geriAlToastZamanlayici = null;

  function gizleGeriAlToast() {
    if (__geriAlToastZamanlayici) {
      clearTimeout(__geriAlToastZamanlayici);
      __geriAlToastZamanlayici = null;
    }
    const toastGeriAl = document.getElementById('toast-geri-al');
    if (toastGeriAl) {
      toastGeriAl.hidden = true;
      toastGeriAl.style.display = 'none';
      toastGeriAl.classList.remove('acik', 'goster', 'aktif');
      toastGeriAl.setAttribute('aria-hidden', 'true');
    }
  }

  function guncelleKayitDurumCubuguUI(mod = 'kaydedildi', ozelMesaj = '') {
    const rozet = document.getElementById('rozet-kayit-durumu');
    const bulutEtiket = document.getElementById('etiket-bulut-durumu');
    const btnGeriAl = document.getElementById('btn-son-silineni-geri-al');
    const toastGeriAl = document.getElementById('toast-geri-al');
    if (rozet) {
      if (mod === 'yukleniyor' || durum.bulutSenkronDurumu === 'yukleniyor') {
        rozet.className = 'kayit-durum-etiket kaydediliyor';
        rozet.textContent = ozelMesaj || 'Kaydediliyor…';
      } else if (mod === 'bekliyor' || durum.degisiklikBekliyor) {
        rozet.className = 'kayit-durum-etiket bekliyor';
        rozet.textContent = ozelMesaj || 'Kaydedilmemiş değişiklik';
      } else if (mod === 'hata' || durum.bulutSenkronDurumu === 'hata') {
        rozet.className = 'kayit-durum-etiket cakisma hata';
        rozet.textContent = ozelMesaj || durum.sonBulutHataMesaji || 'Bulut senkronizasyon hatası (Yerel korundu)';
      } else {
        const saat = durum.sonKayitSaatMetni || saatMetniUret();
        rozet.className = durum.bulutSenkronDurumu === 'senkron'
          ? 'kayit-durum-etiket senkron'
          : 'kayit-durum-etiket';
        rozet.textContent = ozelMesaj || `Kaydedildi · ${saat}`;
      }
    }
    if (bulutEtiket) {
      if (durum.bulutSenkronDurumu === 'senkron') {
        const depoEtiketi = durum.bulutDepoTuru === 'd1'
          ? 'Bulut D1 Kasası Senkron'
          : (durum.bulutDepoTuru === 'yerel_sunucu' ? 'Yerel Sunucu Kasası Senkron' : 'Sunucu Kasası Senkron');
        bulutEtiket.className = 'rozet rozet-yesil';
        bulutEtiket.textContent = `${depoEtiketi} (Rev #${durum.revizyonNo || 1})`;
        bulutEtiket.style.color = 'var(--basari)';
      } else if (durum.bulutSenkronDurumu === 'yukleniyor') {
        bulutEtiket.className = 'rozet rozet-mavi';
        bulutEtiket.textContent = 'Sunucu kasasıyla senkronize ediliyor…';
        bulutEtiket.style.color = 'var(--birincil)';
      } else if (durum.bulutSenkronDurumu === 'hata') {
        bulutEtiket.className = 'rozet rozet-kirmizi';
        bulutEtiket.textContent = `⚠️ ${durum.sonBulutHataMesaji || 'Bulut senkron hatası — yerel kasa aktif'} (Rev #${durum.revizyonNo || 1})`;
        bulutEtiket.style.color = 'var(--tehlike)';
      } else {
        bulutEtiket.className = 'rozet rozet-mavi';
        bulutEtiket.textContent = `Yerel + IndexedDB Koruması Aktif (Rev #${durum.revizyonNo || 1})`;
        bulutEtiket.style.color = 'var(--metin-ikincil)';
      }
    }
    if (btnGeriAl) {
      if (durum.sonGeriAlYedegi && durum.sonGeriAlYedegi.etiket) {
        btnGeriAl.hidden = false;
        btnGeriAl.style.display = 'inline-flex';
        btnGeriAl.textContent = `Geri Al (${durum.sonGeriAlYedegi.etiket})`;
      } else {
        btnGeriAl.hidden = true;
        btnGeriAl.style.display = 'none';
        if (toastGeriAl) gizleGeriAlToast();
      }
    }
  }

  function isaretleDegisiklikBekliyor(etiket = '') {
    durum.degisiklikBekliyor = true;
    guncelleKayitDurumCubuguUI('bekliyor', etiket ? `${etiket} değiştirildi` : '');
  }

  function kaydetSonGeriAlYedegi(islemEtiketi = 'Son İşlem', deltaBilgi = null) {
    try {
      const kisaEtiket = String(islemEtiketi).slice(0, 42);
      const yedek = {
        etiket: kisaEtiket,
        zamanMs: Date.now(),
        aktifDersId: durum.aktifDersId,
        aktifKayitliSinavId: durum.aktifKayitliSinavId || ''
      };
      if (deltaBilgi && deltaBilgi.tip === 'sorular-delta') {
        // 5.400+ soru ölçeğinde bellek ve hız için delta (fark) tabanlı geri alma
        yedek.delta = deltaBilgi;
      } else {
        const soruSayisi = Array.isArray(durum.sorular) ? durum.sorular.length : 0;
        yedek.dersler = JSON.parse(JSON.stringify(durum.dersler || []));
        yedek.sorular = soruSayisi > 400
          ? (durum.sorular || []).slice()
          : JSON.parse(JSON.stringify(durum.sorular || []));
        yedek.ogrenciKayitlari = JSON.parse(JSON.stringify(durum.ogrenciKayitlari || []));
        yedek.salonlar = JSON.parse(JSON.stringify(durum.salonlar || []));
        yedek.okumaSonuclari = JSON.parse(JSON.stringify((durum.okumaSonuclari || []).map(okumaSonucunuHafifletir)));
        yedek.arsivDersler = JSON.parse(JSON.stringify(durum.arsivDersler || []));
        yedek.onlineSinavListesi = JSON.parse(JSON.stringify(durum.onlineSinavListesi || []));
        yedek.onlineSinav = JSON.parse(JSON.stringify(durum.onlineSinav || {}));
        yedek.kayitliSinavlar = JSON.parse(JSON.stringify(durum.kayitliSinavlar || []));
      }
      durum.sonGeriAlYedegi = yedek;
      guncelleKayitDurumCubuguUI();
      const toastGeriAl = document.getElementById('toast-geri-al');
      const toastMetin = document.getElementById('toast-geri-al-metin');
      if (toastGeriAl && toastMetin && durum.hocaOturumAcik) {
        toastMetin.textContent = `${kisaEtiket} — geri almak ister misiniz?`;
        toastGeriAl.hidden = false;
        toastGeriAl.style.display = 'inline-flex';
        toastGeriAl.classList.add('acik');
        toastGeriAl.removeAttribute('aria-hidden');
        if (__geriAlToastZamanlayici) clearTimeout(__geriAlToastZamanlayici);
        __geriAlToastZamanlayici = setTimeout(() => {
          gizleGeriAlToast();
        }, 8000);
      }
    } catch (_) {}
  }

  /* İki farklı sekme veya yerel-bulut durumunu veri silmeden birleştirir */
  function birlestirIkiDurumKayipsiz(yerelPaket, disPaket) {
    if (!disPaket || typeof disPaket !== 'object') return yerelPaket;
    if (!yerelPaket || typeof yerelPaket !== 'object') return disPaket;
    const birlesik = Object.assign({}, yerelPaket, disPaket);

    const birlestirIdIle = (diziA, diziB, anahtarFn) => {
      const harita = new Map();
      (Array.isArray(diziA) ? diziA : []).forEach((x) => { if (x && typeof x === 'object') harita.set(anahtarFn(x), x); });
      (Array.isArray(diziB) ? diziB : []).forEach((x) => {
        if (!x || typeof x !== 'object') return;
        const k = anahtarFn(x);
        if (harita.has(k)) {
          const eski = harita.get(k);
          if (Array.isArray(eski.dersIdler) && Array.isArray(x.dersIdler)) {
            const birlesikDersIdler = Array.from(new Set([...eski.dersIdler, ...x.dersIdler]));
            harita.set(k, Object.assign({}, eski, x, { dersIdler: birlesikDersIdler }));
          } else {
            harita.set(k, Object.assign({}, eski, x));
          }
        } else {
          harita.set(k, x);
        }
      });
      return Array.from(harita.values());
    };

    birlesik.dersler = birlestirIdIle(yerelPaket.dersler, disPaket.dersler, (d) => String(d.id || `${d.kod}-${d.ad}`));
    birlesik.sorular = birlestirIdIle(yerelPaket.sorular, disPaket.sorular, (s) => String(s.id || s.metin));
    const yerelOgr = Array.isArray(yerelPaket.ogrenciler) ? yerelPaket.ogrenciler : yerelPaket.ogrenciKayitlari;
    const disOgr = Array.isArray(disPaket.ogrenciler) ? disPaket.ogrenciler : disPaket.ogrenciKayitlari;
    birlesik.ogrenciler = birlestirIdIle(yerelOgr, disOgr, (o) => String(o.ogrNo));
    birlesik.arsivDersler = birlestirIdIle(yerelPaket.arsivDersler, disPaket.arsivDersler, (a) => String(a.arsivId || a.id || a.kod));
    birlesik.onlineSinavListesi = birlestirIdIle(yerelPaket.onlineSinavListesi, disPaket.onlineSinavListesi, (s) => String(s.sinavId));
    birlesik.kayitliSinavlar = birlestirIdIle(yerelPaket.kayitliSinavlar, disPaket.kayitliSinavlar, (k) => String(k.id));
    birlesik.okumaSonuclari = birlestirIdIle(
      yerelPaket.okumaSonuclari,
      disPaket.okumaSonuclari,
      (r) => String(r.id || `${r.ogrNo || ''}-${r.grup || ''}`)
    );
    birlesik.dersTaslakSinavlari = Object.assign({}, yerelPaket.dersTaslakSinavlari || {}, disPaket.dersTaslakSinavlari || {});
    birlesik.salonlarHaritasi = Object.assign({}, yerelPaket.salonlarHaritasi || {}, disPaket.salonlarHaritasi || {});
    const birlesikOkumaHaritasi = {};
    const yerelHarita = (yerelPaket.okumaSonuclariHaritasi && typeof yerelPaket.okumaSonuclariHaritasi === 'object') ? yerelPaket.okumaSonuclariHaritasi : {};
    const disHarita = (disPaket.okumaSonuclariHaritasi && typeof disPaket.okumaSonuclariHaritasi === 'object') ? disPaket.okumaSonuclariHaritasi : {};
    Array.from(new Set([...Object.keys(yerelHarita), ...Object.keys(disHarita)])).forEach((dKey) => {
      birlesikOkumaHaritasi[dKey] = birlestirIdIle(
        yerelHarita[dKey],
        disHarita[dKey],
        (r) => String(r.id || `${r.ogrNo || ''}-${r.grup || ''}`)
      );
    });
    birlesik.okumaSonuclariHaritasi = birlesikOkumaHaritasi;
    return birlesik;
  }

  function uygulaYuklenenDurumNesnesi(cozulmus) {
    if (!cozulmus || typeof cozulmus !== 'object') return;
    const nesneDizisi = (dizi) => dizi.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
    if (Array.isArray(cozulmus.dersler)) durum.dersler = nesneDizisi(cozulmus.dersler);
    if (typeof cozulmus.aktifDersId === 'string' && cozulmus.aktifDersId) durum.aktifDersId = cozulmus.aktifDersId;
    else if (durum.dersler.length > 0) durum.aktifDersId = durum.dersler[0].id;
    if (Array.isArray(cozulmus.sorular)) durum.sorular = nesneDizisi(cozulmus.sorular);
    if (Array.isArray(cozulmus.salonlar) && cozulmus.salonlar.length > 0) durum.salonlar = nesneDizisi(cozulmus.salonlar);
    if (typeof cozulmus.dagitimModu === 'string') durum.dagitimModu = cozulmus.dagitimModu;
    if (Array.isArray(cozulmus.ogrenciler)) durum.ogrenciKayitlari = nesneDizisi(cozulmus.ogrenciler);
    else if (Array.isArray(cozulmus.ogrenciKayitlari)) durum.ogrenciKayitlari = nesneDizisi(cozulmus.ogrenciKayitlari);
    durum.ogrenciKayitlari = ogrenciKayitlariniHazirla(durum.ogrenciKayitlari);
    if (Array.isArray(cozulmus.arsivDersler)) durum.arsivDersler = nesneDizisi(cozulmus.arsivDersler);
    if (cozulmus.onlineSinav && typeof cozulmus.onlineSinav === 'object') Object.assign(durum.onlineSinav, cozulmus.onlineSinav);
    if (Array.isArray(cozulmus.onlineSinavListesi)) durum.onlineSinavListesi = nesneDizisi(cozulmus.onlineSinavListesi);
    if (Array.isArray(cozulmus.okumaSonuclari)) durum.okumaSonuclari = nesneDizisi(cozulmus.okumaSonuclari);
    if (cozulmus.hocaHesap && typeof cozulmus.hocaHesap === 'object') Object.assign(durum.hocaHesap, cozulmus.hocaHesap);
    if (Array.isArray(cozulmus.hocaListesi) && cozulmus.hocaListesi.length > 0) durum.hocaListesi = nesneDizisi(cozulmus.hocaListesi);
    if (typeof cozulmus.davetKodu === 'string' && cozulmus.davetKodu.trim()) durum.davetKodu = cozulmus.davetKodu.trim();
    if (Array.isArray(cozulmus.kioskDelilLoglari)) durum.kioskDelilLoglari = nesneDizisi(cozulmus.kioskDelilLoglari);
    if (Array.isArray(cozulmus.kurumsalSablonlar) && cozulmus.kurumsalSablonlar.length > 0) {
      durum.kurumsalSablonlar = nesneDizisi(cozulmus.kurumsalSablonlar);
    }
    if (cozulmus.evrakSablonu && typeof cozulmus.evrakSablonu === 'object') {
      Object.assign(durum.evrakSablonu, cozulmus.evrakSablonu);
    }
    if (Array.isArray(cozulmus.kayitliSinavlar)) {
      durum.kayitliSinavlar = nesneDizisi(cozulmus.kayitliSinavlar);
    }
    if (typeof cozulmus.aktifKayitliSinavId === 'string') {
      durum.aktifKayitliSinavId = cozulmus.aktifKayitliSinavId;
    }
    if (cozulmus.dersTaslakSinavlari && typeof cozulmus.dersTaslakSinavlari === 'object' && !Array.isArray(cozulmus.dersTaslakSinavlari)) {
      durum.dersTaslakSinavlari = cozulmus.dersTaslakSinavlari;
    }
    if (cozulmus.salonlarHaritasi && typeof cozulmus.salonlarHaritasi === 'object' && !Array.isArray(cozulmus.salonlarHaritasi)) {
      durum.salonlarHaritasi = cozulmus.salonlarHaritasi;
    }
    if (cozulmus.okumaSonuclariHaritasi && typeof cozulmus.okumaSonuclariHaritasi === 'object' && !Array.isArray(cozulmus.okumaSonuclariHaritasi)) {
      durum.okumaSonuclariHaritasi = cozulmus.okumaSonuclariHaritasi;
    }
    if (Array.isArray(durum.okumaSonuclari) && durum.okumaSonuclari.length > 0) {
      const aktifKey = durum.aktifDersId || 'genel';
      if (!durum.okumaSonuclariHaritasi || typeof durum.okumaSonuclariHaritasi !== 'object') durum.okumaSonuclariHaritasi = {};
      durum.okumaSonuclariHaritasi[aktifKey] = durum.okumaSonuclari.map(okumaSonucunuHafifletir);
    }
    if (Number.isFinite(Number(cozulmus.revizyonNo)) && Number(cozulmus.revizyonNo) > durum.revizyonNo) {
      durum.revizyonNo = Number(cozulmus.revizyonNo);
    }
    birlestirMukerrerDersler();
    baglaYetimGenelSorulariIlkDerse();
    if (durum.dersler.length > 0 && !durum.dersler.some((d) => d.id === durum.aktifDersId)) {
      durum.aktifDersId = durum.dersler[0].id;
    }
  }

  /* Yerel Depodan Güvenli Yükleme ve Kaydetme */
  function verileriYukle() {
    try {
      ESKI_DEPO_ANAHTARLARI.forEach((eskiAnahtar) => {
        try { localStorage.removeItem(eskiAnahtar); } catch (_) {}
      });
      const kayitliRev = Number(localStorage.getItem('SINAV_SON_REVIZYON_V1') || 0);
      if (Number.isFinite(kayitliRev) && kayitliRev > 0) durum.revizyonNo = kayitliRev;
      const kayitliBulutRev = Number(localStorage.getItem('SINAV_SON_BULUT_REV_V1') || 0);
      if (Number.isFinite(kayitliBulutRev) && kayitliBulutRev > 0) durum.sonBulutRevizyonNo = kayitliBulutRev;
      const ham = localStorage.getItem(DEPO_ANAHTAR);
      if (ham) {
        const hamNesne = JSON.parse(ham);
        let cozulmus = null;
        try {
          cozulmus = C.semaDogrulaVeTemizle(hamNesne);
        } catch (semaHata) {
          try { localStorage.setItem('SINAV_BOZUK_YEDEK_V1', ham.slice(0, 450000)); } catch (_) {}
          cozulmus = kurtarYerelDepoVerisi(hamNesne);
          durum.depoKurtarmaMesaji = `🛡️ Depo Koruma Kalkanı: Bozuk bir yan kayıt izole edildi; dersleriniz ve ${(cozulmus && Array.isArray(cozulmus.sorular) ? cozulmus.sorular.length : 0)} sorunuz kayıpsız kurtarıldı.`;
          console.warn('Şema kurtarma devrede:', semaHata.message);
        }
        uygulaYuklenenDurumNesnesi(cozulmus);
      }
      try {
        const ekFaz2 = JSON.parse(localStorage.getItem('SINAV_EK_FAZ2_VERI_V1') || '{}');
        if (ekFaz2 && typeof ekFaz2 === 'object') {
          if (typeof ekFaz2.aktifKurumSablonId === 'string' && ekFaz2.aktifKurumSablonId) {
            durum.aktifKurumSablonId = ekFaz2.aktifKurumSablonId;
          }
          if (Array.isArray(ekFaz2.donemDigerSinavlar)) {
            durum.donemDigerSinavlar = ekFaz2.donemDigerSinavlar.slice(0, 12);
          }
          if (ekFaz2.hariciOmrAnahtar && typeof ekFaz2.hariciOmrAnahtar === 'object') {
            Object.assign(durum.hariciOmrAnahtar, ekFaz2.hariciOmrAnahtar);
            if (ekFaz2.hariciOmrAnahtar.anahtarlar && typeof ekFaz2.hariciOmrAnahtar.anahtarlar === 'object') {
              durum.hariciOmrAnahtar.anahtarlar = Object.assign(
                { A: { dy: '', test: '' }, B: { dy: '', test: '' }, C: { dy: '', test: '' }, D: { dy: '', test: '' } },
                ekFaz2.hariciOmrAnahtar.anahtarlar
              );
            }
          }
          if (Array.isArray(ekFaz2.kayitliSinavlar) && durum.kayitliSinavlar.length === 0) {
            durum.kayitliSinavlar = ekFaz2.kayitliSinavlar;
          }
          if (typeof ekFaz2.aktifKayitliSinavId === 'string' && !durum.aktifKayitliSinavId) {
            durum.aktifKayitliSinavId = ekFaz2.aktifKayitliSinavId;
          }
          if (ekFaz2.dersTaslakSinavlari && typeof ekFaz2.dersTaslakSinavlari === 'object') {
            durum.dersTaslakSinavlari = Object.assign({}, ekFaz2.dersTaslakSinavlari, durum.dersTaslakSinavlari || {});
          }
          if (ekFaz2.salonlarHaritasi && typeof ekFaz2.salonlarHaritasi === 'object') {
            durum.salonlarHaritasi = Object.assign({}, ekFaz2.salonlarHaritasi, durum.salonlarHaritasi || {});
          }
          if (ekFaz2.okumaSonuclariHaritasi && typeof ekFaz2.okumaSonuclariHaritasi === 'object') {
            durum.okumaSonuclariHaritasi = Object.assign({}, ekFaz2.okumaSonuclariHaritasi, durum.okumaSonuclariHaritasi || {});
          }
        }
      } catch (_) {}
      // IndexedDB birincil geniş depo kontrolü: localStorage boşsa VEYA IDB'de daha yüksek revizyon/daha fazla soru varsa F5'te kayıpsız geri yükle
      idbYedekOku().then((idbPaket) => {
        if (!idbPaket || !idbPaket.ana || typeof idbPaket.ana !== 'object') return;
        const idbRev = Number(idbPaket.ana.revizyonNo) || 0;
        const yerelRev = Number(durum.revizyonNo) || 0;
        const idbSoruAdet = Array.isArray(idbPaket.ana.sorular) ? idbPaket.ana.sorular.length : 0;
        const yerelSoruAdet = Array.isArray(durum.sorular) ? durum.sorular.length : 0;
        const idbDoluMu = (Array.isArray(idbPaket.ana.dersler) && idbPaket.ana.dersler.length > 0) || idbSoruAdet > 0;
        const kotaYedekAktif = (() => { try { return localStorage.getItem('SINAV_IDB_KOTA_YEDEK_AKTIF') === '1'; } catch (_) { return false; } })();
        if (idbDoluMu && (!ham || (yerelSoruAdet === 0 && durum.dersler.length === 0) || (kotaYedekAktif && idbSoruAdet > yerelSoruAdet))) {
          uygulaYuklenenDurumNesnesi(idbPaket.ana);
          if (idbRev > (durum.revizyonNo || 0)) durum.revizyonNo = idbRev;
          yukleAktifDersIzoleDurumu(durum.aktifDersId);
          yenileTumSekmePanelleriUI();
          if (!ham) {
            gosterDepoKurtarmaUyarisi('🛡️ Dersleriniz ve sorularınız IndexedDB yedek aynasından kayıpsız geri yüklendi.');
          }
        }
      }).catch(() => {});
      // Eksik yönetici iletişim alanı kalmışsa güvenli kurgusal varsayılanlarla tamamla
      const yukseltYoneticiIletisim = (k) => {
        if (!k || typeof k !== 'object') return;
        if (String(k.kullaniciAdi || '').toLowerCase() === 'hoca') {
          if (!k.eposta || k.eposta === 'hoca@universite.edu.tr') k.eposta = C.VARSAYILAN_HOCA_HESAP.eposta;
          if (!k.telefon) k.telefon = C.VARSAYILAN_HOCA_HESAP.telefon;
          if (!k.adSoyad || k.adSoyad === 'Öğretim Elemanı') k.adSoyad = C.VARSAYILAN_HOCA_HESAP.adSoyad;
        }
      };
      yukseltYoneticiIletisim(durum.hocaHesap);
      if (Array.isArray(durum.hocaListesi)) durum.hocaListesi.forEach(yukseltYoneticiIletisim);
      durum.sonKayitSaatMetni = saatMetniUret();
    } catch (err) {
      console.warn('Yerel veri yükleme uyarısı:', err.message);
    }
  }

  /* Piksel dizileri (kanonikIkili/Gri/Harita) yalnızca ekranda röntgen için tutulur; depo ve yedeğe yazılmaz (MB'larca şişmeyi önler) */
  function okumaSonucunuHafifletir(s) {
    const { kanonikIkili, kanonikGri, kanonikHarita, ...hafif } = s || {};
    return hafif;
  }

  let __bulutSenkronZamanlayici = null;
  let __depoBroadcastKanal = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      __depoBroadcastKanal = new BroadcastChannel('sinav_studyo_depo_senkron_v1');
    } catch (_) {}
  }

  function olusturTamVeriPaketi() {
    birlestirMukerrerDersler();
    baglaYetimGenelSorulariIlkDerse();
    kaydetAktifDersIzoleDurumu(durum.aktifDersId);
    return {
      revizyonNo: durum.revizyonNo || 0,
      dersler: durum.dersler,
      aktifDersId: durum.aktifDersId,
      sorular: durum.sorular,
      ogrenciler: durum.ogrenciKayitlari,
      salonlar: durum.salonlar,
      dagitimModu: durum.dagitimModu,
      arsivDersler: durum.arsivDersler,
      onlineSinav: durum.onlineSinav,
      onlineSinavListesi: durum.onlineSinavListesi,
      okumaSonuclari: durum.okumaSonuclari.map(okumaSonucunuHafifletir),
      evrakSablonu: durum.evrakSablonu,
      kurumsalSablonlar: durum.kurumsalSablonlar,
      hocaHesap: durum.hocaHesap,
      hocaListesi: durum.hocaListesi,
      davetKodu: durum.davetKodu,
      kioskDelilLoglari: durum.kioskDelilLoglari,
      kayitliSinavlar: durum.kayitliSinavlar || [],
      aktifKayitliSinavId: durum.aktifKayitliSinavId || '',
      dersTaslakSinavlari: durum.dersTaslakSinavlari || {},
      salonlarHaritasi: durum.salonlarHaritasi || {},
      okumaSonuclariHaritasi: durum.okumaSonuclariHaritasi || {}
    };
  }

  function verileriKaydet(secenek = {}) {
    const kasıtlıSilmeMi = Boolean(secenek && (secenek.zorlaEz || secenek.silmeOnayi));
    // Çoklu Sekme Çakışma Kalkanı: Başka bir sekme bizden daha yeni revizyon yazdıysa ezmeden önce birleştir!
    try {
      const diskRev = Number(localStorage.getItem('SINAV_SON_REVIZYON_V1') || 0);
      if (!kasıtlıSilmeMi && diskRev > (durum.revizyonNo || 0)) {
        const diskHam = localStorage.getItem(DEPO_ANAHTAR);
        if (diskHam) {
          const diskNesne = JSON.parse(diskHam);
          const bizimPaket = olusturTamVeriPaketi();
          const birlesik = birlestirIkiDurumKayipsiz(diskNesne, bizimPaket);
          uygulaYuklenenDurumNesnesi(birlesik);
        }
      }
      durum.revizyonNo = Math.max(durum.revizyonNo || 0, diskRev) + 1;
    } catch (_) {
      durum.revizyonNo = (durum.revizyonNo || 0) + 1;
    }

    const tamPaket = olusturTamVeriPaketi();
    tamPaket.revizyonNo = durum.revizyonNo;

    const ekPaket = {
      aktifKurumSablonId: durum.aktifKurumSablonId,
      donemDigerSinavlar: (durum.donemDigerSinavlar || []).slice(0, 12),
      hariciOmrAnahtar: durum.hariciOmrAnahtar,
      kayitliSinavlar: durum.kayitliSinavlar || [],
      aktifKayitliSinavId: durum.aktifKayitliSinavId || '',
      dersTaslakSinavlari: durum.dersTaslakSinavlari || {},
      salonlarHaritasi: durum.salonlarHaritasi || {},
      okumaSonuclariHaritasi: durum.okumaSonuclariHaritasi || {}
    };
    idbYedekYaz({ ana: tamPaket, ek: ekPaket, zamanMs: Date.now(), zorlaEz: kasıtlıSilmeMi });

    const tamJson = JSON.stringify(tamPaket);
    const localKotaAsimi = tamJson.length > 3200000;
    try {
      if (localKotaAsimi) throw new Error('QUOTA_SOFT_LIMIT');
      localStorage.setItem(DEPO_ANAHTAR, tamJson);
      localStorage.setItem('SINAV_SON_REVIZYON_V1', String(durum.revizyonNo));
      localStorage.removeItem('SINAV_IDB_KOTA_YEDEK_AKTIF');
    } catch (kotaHata) {
      try {
        const hafifSablon = Object.assign({}, durum.evrakSablonu || {});
        if (hafifSablon.logoDataUrl && hafifSablon.logoDataUrl.length > 24000) delete hafifSablon.logoDataUrl;
        const hafifPaket = Object.assign({}, tamPaket, {
          evrakSablonu: hafifSablon,
          sorular: (tamPaket.sorular || []).length > 800 ? [] : tamPaket.sorular,
          okumaSonuclari: (tamPaket.okumaSonuclari || []).slice(0, 250),
          kioskDelilLoglari: (tamPaket.kioskDelilLoglari || []).slice(-100)
        });
        localStorage.setItem(DEPO_ANAHTAR, JSON.stringify(hafifPaket));
        localStorage.setItem('SINAV_SON_REVIZYON_V1', String(durum.revizyonNo));
      } catch (_) {}
      try { localStorage.setItem('SINAV_IDB_KOTA_YEDEK_AKTIF', '1'); } catch (_) {}
      gosterDepoKurtarmaUyarisi(
        `🛡️ ${(durum.sorular || []).length} soruluk veri setiniz birincil IndexedDB deposunda ve Bulut D1 kasasında revizyon kilidiyle korunuyor.`
      );
    }
    try {
      localStorage.setItem('SINAV_EK_FAZ2_VERI_V1', JSON.stringify(ekPaket));
    } catch (_) {}

    if (__depoBroadcastKanal) {
      try {
        __depoBroadcastKanal.postMessage({
          tip: 'DEPO_GUNCELLENDI',
          sekmeId: durum.sekmeId,
          revizyonNo: durum.revizyonNo
        });
      } catch (_) {}
    }

    durum.degisiklikBekliyor = false;
    durum.sonKayitSaatMetni = saatMetniUret();
    guncelleKayitDurumCubuguUI('kaydedildi', secenek && secenek.mesaj ? secenek.mesaj : '');
    if (!kasıtlıSilmeMi && typeof window.__tetikleMobilPaketYayinlaBuluta === 'function') {
      window.__tetikleMobilPaketYayinlaBuluta();
    }

    if (!secenek || !secenek.bulutAtla) {
      planlaBulutSenkron(kasıtlıSilmeMi, kasıtlıSilmeMi);
    }
  }

  function yenileTumSekmePanelleriUI() {
    try {
      doldurDersSecici();
      guncelleKayitliSinavlarCubuguUI();
      guncelleOgrenciListesiSekmesi();
      guncelleA4Onizleme();
      guncelleSoruBankasiTablosu();
      guncelleOmrTabloVeKuyruk();
      guncelleMaddeAnaliziSekmesi();
      guncelleOnlineSinavSekmesiUI();
      guncelleKayitDurumCubuguUI();
    } catch (_) {}
  }

  function uygulaSonGeriAlYedegi() {
    const y = durum.sonGeriAlYedegi;
    if (!y) return false;
    const etiket = y.etiket;
    if (y.delta && y.delta.tip === 'sorular-delta') {
      const d = y.delta;
      if (d.degisim === 'sil' && d.soru) {
        const mevcutIdx = (durum.sorular || []).findIndex((s) => s && s.id === d.soru.id);
        if (mevcutIdx < 0) {
          const hedefIdx = Math.max(0, Math.min((durum.sorular || []).length, Number(d.indeks) || 0));
          durum.sorular.splice(hedefIdx, 0, d.soru);
        }
      } else if (d.degisim === 'ekle' && Array.isArray(d.eklenenIdler)) {
        const silSet = new Set(d.eklenenIdler);
        durum.sorular = (durum.sorular || []).filter((s) => !s || !silSet.has(s.id));
      } else if (d.degisim === 'guncelle' && d.oncekiSoru) {
        const idx = (durum.sorular || []).findIndex((s) => s && s.id === d.soruId);
        if (idx >= 0) durum.sorular[idx] = d.oncekiSoru;
      }
      if (y.aktifDersId) durum.aktifDersId = y.aktifDersId;
    } else {
      durum.dersler = y.dersler || [];
      durum.aktifDersId = y.aktifDersId || (durum.dersler[0] && durum.dersler[0].id) || 'genel';
      durum.sorular = y.sorular || [];
      durum.ogrenciKayitlari = ogrenciKayitlariniHazirla(y.ogrenciKayitlari || []);
      durum.salonlar = y.salonlar || [{ id: 'salon-1', ad: 'Salon 1', kontenjan: 40, gozetmenler: [] }];
      durum.okumaSonuclari = y.okumaSonuclari || [];
      durum.arsivDersler = y.arsivDersler || [];
      durum.onlineSinavListesi = y.onlineSinavListesi || [];
      if (y.onlineSinav) durum.onlineSinav = y.onlineSinav;
      durum.kayitliSinavlar = y.kayitliSinavlar || [];
      durum.aktifKayitliSinavId = y.aktifKayitliSinavId || '';
    }
    durum.sonGeriAlYedegi = null;
    gizleGeriAlToast();
    verileriKaydet({ zorlaEz: true, mesaj: `↩️ "${etiket}" işlemi geri alındı · ${saatMetniUret()}` });
    yenileTumSekmePanelleriUI();
    return true;
  }

  /* ------------------------------------------------------------------------
     CLOUDFLARE D1 / SUNUCU BULUT KASASI OTOMATİK YEDEKLEME & SENKRONİZASYON
     ------------------------------------------------------------------------ */
  async function sikistirGzipBase64(metin) {
    if (typeof CompressionStream !== 'function' || typeof TextEncoder === 'undefined') return null;
    try {
      const baytlar = new TextEncoder().encode(String(metin || ''));
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      const reader = cs.readable.getReader();
      const yazma = writer.write(baytlar).then(() => writer.close());
      const parcalar = [];
      let toplam = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parcalar.push(value);
        toplam += value.length;
      }
      await yazma;
      const birlesik = new Uint8Array(toplam);
      let ofset = 0;
      for (const p of parcalar) {
        birlesik.set(p, ofset);
        ofset += p.length;
      }
      let ikili = '';
      for (let i = 0; i < birlesik.length; i += 8192) {
        ikili += String.fromCharCode.apply(null, birlesik.subarray(i, i + 8192));
      }
      return btoa(ikili);
    } catch (_) {
      return null;
    }
  }

  function planlaBulutSenkron(zorlaEz = false, silmeOnayi = false) {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    const token = sessionStorage.getItem('hoca_token') || '';
    if (!token || !durum.hocaOturumAcik) return;
    clearTimeout(__bulutSenkronZamanlayici);
    __bulutSenkronZamanlayici = setTimeout(() => {
      bulutKasayaSenkronla(zorlaEz, false, silmeOnayi).catch(() => {});
    }, 650);
  }

  async function bulutKasayaSenkronla(zorlaEz = false, anlikYedekAl = false, silmeOnayi = false, yenidenDenemeSayaci = 0) {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return { basarili: false };
    const token = sessionStorage.getItem('hoca_token') || '';
    if (!token) return { basarili: false };
    durum.bulutSenkronDurumu = 'yukleniyor';
    durum.sonBulutHataMesaji = '';
    guncelleKayitDurumCubuguUI();
    try {
      const tamPaket = olusturTamVeriPaketi();
      const bazRev = Number(durum.sonBulutRevizyonNo);
      const ortakMeta = {
        bazRevizyonNo: Number.isFinite(bazRev) && bazRev > 0 ? bazRev : undefined,
        revizyonNo: durum.revizyonNo || 1,
        zorlaEz: Boolean(zorlaEz),
        silmeOnayi: Boolean(silmeOnayi),
        anlikYedekAl: Boolean(anlikYedekAl)
      };

      let govdeStr = '';
      let gzipKullanildi = false;
      const tamPaketJson = JSON.stringify(tamPaket);
      if (tamPaketJson.length > 32768) {
        const gzipB64 = await sikistirGzipBase64(tamPaketJson);
        if (gzipB64) {
          govdeStr = JSON.stringify(Object.assign({ kodlama: 'gzip-b64', veriSikistirilmis: gzipB64 }, ortakMeta));
          gzipKullanildi = true;
        }
      }
      if (!govdeStr) {
        govdeStr = JSON.stringify(Object.assign({ veri: tamPaket }, ortakMeta));
      }

      let yanit = await fetch('/api/bulut-kasa', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: govdeStr
      });
      if (gzipKullanildi && yanit.status === 400) {
        yanit = await fetch('/api/bulut-kasa', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(Object.assign({ veri: tamPaket }, ortakMeta))
        });
      }
      const veri = await yanit.json().catch(() => ({}));
      if (veri && typeof veri.depoTuru === 'string') {
        durum.bulutDepoTuru = veri.depoTuru;
      }
      const karsiPaket = veri && (veri.bulutVeri || veri.veri || veri.veriPaketi);
      if (yanit.status === 409 && karsiPaket && yenidenDenemeSayaci < 2) {
        const karsiRev = Number(veri.bulutRevizyonNo || veri.revizyonNo || 0);
        const yerelDoluMu = (Array.isArray(tamPaket.dersler) && tamPaket.dersler.length > 0) ||
          (Array.isArray(tamPaket.sorular) && tamPaket.sorular.length > 0) ||
          (Array.isArray(tamPaket.ogrenciler) && tamPaket.ogrenciler.length > 0);

        if (silmeOnayi && yerelDoluMu && karsiRev > 0) {
          durum.sonBulutRevizyonNo = karsiRev;
          try { localStorage.setItem('SINAV_SON_BULUT_REV_V1', String(karsiRev)); } catch (_) {}
          durum.revizyonNo = Math.max(karsiRev, durum.revizyonNo || 0) + 1;
          verileriKaydet({ bulutAtla: true, zorlaEz: true, silmeOnayi: true });
          return await bulutKasayaSenkronla(zorlaEz, anlikYedekAl, true, yenidenDenemeSayaci + 1);
        }

        const birlesik = birlestirIkiDurumKayipsiz(karsiPaket, tamPaket);
        uygulaYuklenenDurumNesnesi(birlesik);
        yukleAktifDersIzoleDurumu(durum.aktifDersId);
        durum.sonBulutRevizyonNo = karsiRev;
        try { localStorage.setItem('SINAV_SON_BULUT_REV_V1', String(karsiRev)); } catch (_) {}
        durum.revizyonNo = Math.max(karsiRev, durum.revizyonNo || 0) + 1;
        verileriKaydet({ bulutAtla: true });
        yenileTumSekmePanelleriUI();
        return await bulutKasayaSenkronla(false, false, false, yenidenDenemeSayaci + 1);
      }
      if (yanit.ok && veri && veri.basarili) {
        if (Number(veri.revizyonNo) > 0) {
          durum.revizyonNo = Number(veri.revizyonNo);
          durum.sonBulutRevizyonNo = Number(veri.revizyonNo);
          try {
            localStorage.setItem('SINAV_SON_REVIZYON_V1', String(durum.revizyonNo));
            localStorage.setItem('SINAV_SON_BULUT_REV_V1', String(durum.sonBulutRevizyonNo));
          } catch (_) {}
        }
        durum.bulutSenkronDurumu = 'senkron';
        durum.sonBulutHataMesaji = '';
        guncelleKayitDurumCubuguUI();
        return { basarili: true, revizyonNo: durum.revizyonNo, depoTuru: durum.bulutDepoTuru || '' };
      }
      const hataMesaji = (veri && veri.hata) ? veri.hata : `Bulut senkronizasyonu başarısız (HTTP ${yanit.status})`;
      durum.bulutSenkronDurumu = 'hata';
      durum.sonBulutHataMesaji = hataMesaji;
      guncelleKayitDurumCubuguUI('hata', `⚠️ ${hataMesaji}`);
      return { basarili: false, hata: hataMesaji };
    } catch (err) {
      const hataMesaji = (err && err.message) ? `Bulut senkron hatası: ${err.message}` : 'Bulut sunucusuna ulaşılamadı (yerel kasa aktif)';
      durum.bulutSenkronDurumu = 'hata';
      durum.sonBulutHataMesaji = hataMesaji;
      guncelleKayitDurumCubuguUI('hata', `⚠️ ${hataMesaji}`);
      return { basarili: false, hata: hataMesaji };
    }
  }

  function gercekYerelVeriVarMiKontrol() {
    const ozelDersVar = Array.isArray(durum.dersler) && durum.dersler.some(
      (d) => d && (d.id !== 'genel' || d.kod !== 'DERS' || d.ad !== 'Yeni Ders')
    );
    return ozelDersVar ||
      (Array.isArray(durum.sorular) && durum.sorular.length > 0) ||
      (Array.isArray(durum.ogrenciKayitlari) && durum.ogrenciKayitlari.length > 0) ||
      (Array.isArray(durum.kayitliSinavlar) && durum.kayitliSinavlar.length > 0) ||
      (Array.isArray(durum.okumaSonuclari) && durum.okumaSonuclari.length > 0);
  }

  async function bulutKasadanYukle(zorlaUzerineYaz = false) {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return { basarili: false };
    const token = sessionStorage.getItem('hoca_token') || '';
    if (!token) return { basarili: false };
    try {
      const yanit = await fetch('/api/bulut-kasa', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!yanit.ok) return { basarili: false };
      const veri = await yanit.json().catch(() => null);
      if (!veri || !veri.basarili) return { basarili: false };
      if (typeof veri.depoTuru === 'string') {
        durum.bulutDepoTuru = veri.depoTuru;
      }
      const bulutPaket = veri.veri || veri.veriPaketi;
      const bulutOgrListe = bulutPaket && (Array.isArray(bulutPaket.ogrenciler) ? bulutPaket.ogrenciler : bulutPaket.ogrenciKayitlari);
      const bulutBosMu = !bulutPaket || (
        (!Array.isArray(bulutPaket.dersler) || bulutPaket.dersler.length === 0) &&
        (!Array.isArray(bulutPaket.sorular) || bulutPaket.sorular.length === 0) &&
        (!Array.isArray(bulutOgrListe) || bulutOgrListe.length === 0)
      );
      const yerelGercekDoluMu = gercekYerelVeriVarMiKontrol();

      if (bulutBosMu) {
        if (yerelGercekDoluMu) {
          await bulutKasayaSenkronla(false, true, false);
        }
        return { basarili: true, kaynak: 'yerel_korundu' };
      }

      const bulutRev = Number(veri.revizyonNo) || 0;
      const sonBilinenBulutRev = Number(durum.sonBulutRevizyonNo) || 0;

      if (!zorlaUzerineYaz && yerelGercekDoluMu && sonBilinenBulutRev > 0 && bulutRev <= sonBilinenBulutRev) {
        if (bulutRev > 0) {
          durum.sonBulutRevizyonNo = bulutRev;
          try { localStorage.setItem('SINAV_SON_BULUT_REV_V1', String(bulutRev)); } catch (_) {}
        }
        durum.bulutSenkronDurumu = 'senkron';
        guncelleKayitDurumCubuguUI();
        return { basarili: true, kaynak: 'yerel_guncel', revizyonNo: durum.revizyonNo };
      }

      const uygulanacak = (zorlaUzerineYaz || !yerelGercekDoluMu)
        ? bulutPaket
        : birlestirIkiDurumKayipsiz(olusturTamVeriPaketi(), bulutPaket);

      uygulaYuklenenDurumNesnesi(uygulanacak);
      yukleAktifDersIzoleDurumu(durum.aktifDersId);
      if (bulutRev > 0) {
        durum.sonBulutRevizyonNo = bulutRev;
        try { localStorage.setItem('SINAV_SON_BULUT_REV_V1', String(bulutRev)); } catch (_) {}
      }
      durum.revizyonNo = Math.max(bulutRev || 1, durum.revizyonNo || 1);
      durum.bulutSenkronDurumu = 'senkron';
      verileriKaydet({ bulutAtla: !yerelGercekDoluMu || zorlaUzerineYaz });
      yenileTumSekmePanelleriUI();
      return { basarili: true, kaynak: 'bulut_yuklendi', revizyonNo: durum.revizyonNo };
    } catch (_) {
      return { basarili: false };
    }
  }

  async function acVeDoldurBulutGecmisPaneli() {
    const panel = document.getElementById('kutu-bulut-gecmis-panel');
    const listeEl = document.getElementById('liste-bulut-yedek-gecmisi');
    if (!panel || !listeEl) return;
    panel.hidden = false;
    panel.style.display = 'block';
    const token = sessionStorage.getItem('hoca_token') || '';
    if ((location.protocol !== 'http:' && location.protocol !== 'https:') || !token) {
      listeEl.innerHTML = 'ℹ️ Bulut yedek geçmişi için sunucu üzerinde öğretmen oturumu açık olmalıdır. Yerel ve IndexedDB koruması aktif.';
      return;
    }
    listeEl.innerHTML = '⏳ Bulut yedek geçmişi yükleniyor...';
    try {
      const yanit = await fetch('/api/bulut-kasa/gecmis', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const veri = await yanit.json().catch(() => null);
      const gecmis = (veri && Array.isArray(veri.gecmis)) ? veri.gecmis : [];
      if (gecmis.length === 0) {
        listeEl.innerHTML = 'Henüz bulut yedek noktası oluşmadı. "☁️ Şimdi Buluta Yedekle" düğmesine basarak ilk anlık görüntüyü oluşturabilirsiniz.';
        return;
      }
      listeEl.innerHTML = gecmis
        .map((g) => {
          const rev = Number(g.revizyonNo !== undefined ? g.revizyonNo : g.revizyon_no) || 0;
          const zamanStr = Number(g.olusturmaMs) > 0
            ? new Date(Number(g.olusturmaMs)).toLocaleString('tr-TR')
            : String(g.kayit_zamani || '').replace('T', ' ').slice(0, 19);
          const notStr = String(g.islemNotu || g.islem_turu || 'Otomatik yedek');
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; padding:5px 7px; border-bottom:1px solid var(--kenar); flex-wrap:wrap;">
              <div>
                <strong>Rev #${rev}</strong> · <span class="mono">${C.kacisHTML(zamanStr)}</span>
                <span class="rozet rozet-mavi">${C.kacisHTML(notStr)}</span>
              </div>
              <button type="button" class="btn btn-basari btn-kucuk" data-bulut-yedek-geri-yukle="${Number(g.id) || 0}">⏪ Bu Yedeğe Dön</button>
            </div>
          `;
        })
        .join('');
    } catch (_) {
      listeEl.innerHTML = '⚠️ Bulut yedek geçmişi alınamadı.';
    }
  }

  /* Klasik Sorular İçin "Tek Tek Puan Gir" Kutularını Dinamik Oluşturma */
  function guncelleKlasikTekTekKutularUI(klasikSayisi, klasikPuanModu) {
    const kutu = document.getElementById('kutu-klasik-tek-tek-puanlar');
    const grupToplam = document.getElementById('grup-klasik-toplam-puan');
    if (!kutu) return;

    if (klasikSayisi <= 0 || klasikPuanModu !== 'tek_tek') {
      kutu.style.display = 'none';
      if (grupToplam) grupToplam.style.opacity = '1';
      return;
    }

    kutu.style.display = 'block';
    const mevcutInputlar = kutu.querySelectorAll('[data-klasik-tek-puan-idx]');
    if (mevcutInputlar.length !== klasikSayisi) {
      let html = '<div style="font-size:0.75rem; font-weight:700; margin-bottom:0.3rem; color:var(--mor);">✍️ Her Klasik Sorunun Puanını Tek Tek Giriniz:</div><div class="form-satir" style="margin-bottom:0;">';
      for (let k = 0; k < klasikSayisi; k++) {
        const deger = durum.klasikTekTekPuanlar[k] !== undefined ? durum.klasikTekTekPuanlar[k] : 10;
        html += `
          <div>
            <label class="etiket" style="font-size:0.72rem;">Klasik ${k + 1}. Soru Puanı</label>
            <input type="number" min="1" max="100" step="1" value="${deger}" data-klasik-tek-puan-idx="${k}" />
          </div>
        `;
      }
      html += '</div>';
      kutu.innerHTML = html;
    }
  }

  function aktifSinavBasildiKilitliMi() {
    if (!durum.aktifKayitliSinavId) return false;
    const ks = (durum.kayitliSinavlar || []).find((x) => x && x.id === durum.aktifKayitliSinavId);
    return Boolean(ks && ks.basildiKilidi);
  }

  /* 14 Haftalık Sınav Kapsamı Seçim ve Manuel Kota Izgarasını Güncelleme (O(N) Haftalık Sayaç Önbelleği) */
  let __haftaSayacOnbellek = { anahtar: '', sayaclar: null };

  function getirDersHaftaSayaclari(dersId) {
    const rev = durum.revizyonNo || 0;
    const len = Array.isArray(durum.sorular) ? durum.sorular.length : 0;
    const anahtar = `${dersId}|${rev}|${len}`;
    if (__haftaSayacOnbellek.anahtar === anahtar && __haftaSayacOnbellek.sayaclar) {
      return __haftaSayacOnbellek.sayaclar;
    }
    const sayaclar = new Array(15).fill(0);
    const liste = durum.sorular || [];
    for (let i = 0; i < liste.length; i++) {
      const s = liste[i];
      if (!s || s.arsivde) continue;
      if (s.dersId === dersId || s.dersId === 'genel') {
        const h = C.normalizeHaftaNo(s.hafta, 1);
        if (h >= 1 && h <= 14) sayaclar[h]++;
      }
    }
    __haftaSayacOnbellek = { anahtar, sayaclar };
    return sayaclar;
  }

  function guncelleHaftaSecimIzgarasiUI() {
    const kutu = document.getElementById('kutu-hafta-secim-izgara');
    const rozet = document.getElementById('rozet-aktif-hafta-sayisi');
    const dagilimModu = (document.getElementById('ayar-hafta-dagilim-modu') && document.getElementById('ayar-hafta-dagilim-modu').value) || 'otomatik_dengeli';

    const aktifHaftalar = Array.isArray(durum.seciliHaftalar) && durum.seciliHaftalar.length > 0
      ? durum.seciliHaftalar
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

    if (rozet) {
      rozet.textContent = `${aktifHaftalar.length} / 14 Hafta Seçili`;
    }
    if (!kutu) return;

    const basildiKilit = aktifSinavBasildiKilitliMi();
    const haftaSayaclar = getirDersHaftaSayaclari(durum.aktifDersId);
    let html = '';
    for (let h = 1; h <= 14; h++) {
      const seciliMi = aktifHaftalar.includes(h);
      const bankadaAdet = haftaSayaclar[h] || 0;
      const kotaDeger = durum.haftaKotalari[h] !== undefined ? durum.haftaKotalari[h] : 2;
      const kotaInputHTML = (dagilimModu === 'manuel_kota' && seciliMi)
        ? `<input type="number" min="0" max="35" step="1" value="${kotaDeger}" data-hafta-kota="${h}" ${basildiKilit ? 'disabled' : ''} title="${h}. Haftadan seçilecek soru kotası" style="width:100%; min-width:0; padding:1px 2px; font-size:0.72rem; font-weight:700; text-align:center;" />`
        : '';

      html += `
        <div style="display:flex; flex-direction:column; align-items:stretch; justify-content:center; gap:2px; min-width:0; padding:3px 3px; border-radius:5px; border:1px solid ${seciliMi ? 'var(--birincil)' : 'var(--kenar)'}; background:${seciliMi ? 'var(--birincil-acik)' : 'var(--bg-kart)'}; font-size:0.71rem; overflow:hidden; ${basildiKilit ? 'opacity:0.65;' : ''}">
          <label style="display:flex; align-items:center; justify-content:center; gap:2px; cursor:${basildiKilit ? 'not-allowed' : 'pointer'}; font-weight:${seciliMi ? '700' : '500'}; white-space:nowrap;">
            <input type="checkbox" data-hafta-sec="${h}" ${seciliMi ? 'checked' : ''} ${basildiKilit ? 'disabled' : ''} style="width:auto; margin:0;" />
            <span>H${h}<span style="font-size:0.62rem; color:var(--metin-soluk);">(${bankadaAdet})</span></span>
          </label>
          ${kotaInputHTML}
        </div>
      `;
    }    kutu.innerHTML = html;
  }

  /* Canlı Sınav Belirtke Tablosunu (Hafta × Kazanım/ÖÇ × Soru Türü × Zorluk × Puan) ve Bologna ÖÇ Kapsama Çubuğunu Güncelleme */
  function guncelleCanliBelirtkeTablosuUI(belirtkeTablosu, ocKapsamaRaporu) {
    const ocKutu = document.getElementById('kutu-oc-kapsama-durumu');
    if (ocKutu && belirtkeTablosu) {
      const ocSatirlar = Array.isArray(belirtkeTablosu.ocSatirlar) ? belirtkeTablosu.ocSatirlar : [];
      const eksikOc = Array.isArray(belirtkeTablosu.eksikOcKodlari) ? belirtkeTablosu.eksikOcKodlari : [];
      const toplamHavuzOc = ocSatirlar.length;
      const kapsananOc = ocSatirlar.filter((x) => x.toplamSoru > 0).length;

      if (toplamHavuzOc === 0) {
        ocKutu.innerHTML = '<span style="color:var(--metin-soluk);">ℹ️ Aktif derste henüz tanımlı soru/ÖÇ bulunmuyor.</span>';
      } else {
        const tamMi = eksikOc.length === 0;
        const rozetlerHTML = ocSatirlar
          .map((oc) => {
            const aktifMi = oc.toplamSoru > 0;
            const sinif = aktifMi ? 'rozet rozet-yesil' : 'rozet rozet-kirmizi';
            return `<span class="${sinif}" title="${C.kacisHTML((oc.aciklamalar || []).join(' | ') || oc.ocKodu)}">${C.kacisHTML(oc.ocKodu)}: ${oc.toplamSoru} soru (${oc.toplamPuan}p)</span>`;
          })
          .join(' ');

        ocKutu.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem; margin-bottom:0.25rem;">
            <strong>${tamMi ? '🟢 Bologna ÖÇ Kapsamı Tam:' : '⚠️ Eksik Bologna ÖÇ Var:'} ${kapsananOc} / ${toplamHavuzOc} ÖÇ Kapsandı</strong>
            <span class="rozet ${tamMi ? 'rozet-yesil' : 'rozet-sari'}">${tamMi ? '✓ Her ÖÇ ≥ 1 Soru' : `Eksik: ${eksikOc.join(', ')}`}</span>
          </div>
          <div style="display:flex; gap:0.25rem; flex-wrap:wrap;">${rozetlerHTML}</div>
        `;
      }
    }

    const kutu = document.getElementById('kutu-canli-belirtke-tablosu');
    if (!kutu || !belirtkeTablosu) return;

    const satirlar = belirtkeTablosu.aktifSatirlar || [];
    if (satirlar.length === 0) {
      kutu.innerHTML = '<div style="font-size:0.75rem; color:var(--metin-soluk);">Seçili soru bulunmuyor.</div>';
      return;
    }

    const ocAktifSatirlar = Array.isArray(belirtkeTablosu.ocSatirlar) && belirtkeTablosu.ocSatirlar.length > 0
      ? belirtkeTablosu.ocSatirlar
      : (belirtkeTablosu.aktifOcSatirlar || []);

    const ocSatirHTML = ocAktifSatirlar
      .map((oc) => `
        <tr style="${oc.toplamSoru === 0 ? 'background:rgba(220,38,38,0.08);' : ''}">
          <td><strong>${C.kacisHTML(oc.ocKodu)}</strong></td>
          <td class="mono">${oc.dy > 0 ? `${oc.dy} D/Y ` : ''}${oc.test > 0 ? `${oc.test} Test ` : ''}${oc.klasik > 0 ? `${oc.klasik} Kl.` : ''} (<strong>${oc.toplamSoru}</strong>)</td>
          <td class="mono" style="font-size:0.68rem;">H:${(oc.haftalar || []).join(',') || '-'}</td>
          <td style="font-size:0.68rem;">${C.kacisHTML((oc.aciklamalar || []).join(', ') || oc.ocKodu)}</td>
          <td class="mono"><strong>${oc.toplamPuan}p</strong> (%${oc.puanYuzde})</td>
        </tr>
      `)
      .join('');

    const satirHTML = satirlar
      .map((st) => `
        <tr>
          <td><strong>${st.hafta}. Hafta</strong></td>
          <td class="mono">${st.dy > 0 ? `${st.dy} D/Y ` : ''}${st.test > 0 ? `${st.test} Test ` : ''}${st.klasik > 0 ? `${st.klasik} Kl.` : ''} (<strong>${st.toplamSoru}</strong>)</td>
          <td class="mono" style="font-size:0.68rem;">K:${st.kolay} · O:${st.orta} · Z:${st.zor}</td>
          <td style="font-size:0.68rem;">${C.kacisHTML((st.ocKodlari || st.kazanimlar || []).join(', '))}</td>
          <td class="mono"><strong>${st.toplamPuan}p</strong> (%${st.puanYuzde})</td>
        </tr>
      `)
      .join('');

    const oz = belirtkeTablosu.genelOzet || { kolay: 0, orta: 0, zor: 0, toplamSoru: 0, toplamPuan: 0, kapsananHaftaSayisi: 0, kapsananOcSayisi: 0, toplamHavuzOcSayisi: 0 };
    kutu.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem; font-size:0.74rem; flex-wrap:wrap; gap:0.25rem;">
        <strong>🎯 Bologna ÖÇ &amp; Haftalık Belirtke (${oz.kapsananOcSayisi || 0}/${oz.toplamHavuzOcSayisi || 0} ÖÇ · ${oz.kapsananHaftaSayisi} Hafta · ${oz.toplamSoru} Soru)</strong>
        <span class="rozet rozet-mavi">Kolay:${oz.kolay} · Orta:${oz.orta} · Zor:${oz.zor}</span>
      </div>
      ${ocSatirHTML ? `
      <div class="tablo-sarmal" style="max-height:140px; overflow-y:auto; margin-bottom:0.4rem;">
        <table class="veri-tablosu" style="font-size:0.71rem;">
          <thead>
            <tr>
              <th>Bologna ÖÇ</th>
              <th>Tür &amp; Adet</th>
              <th>Hafta</th>
              <th>Kazanım Açıklaması</th>
              <th>Puan</th>
            </tr>
          </thead>
          <tbody>${ocSatirHTML}</tbody>
        </table>
      </div>` : ''}
      <div class="tablo-sarmal" style="max-height:155px; overflow-y:auto;">
        <table class="veri-tablosu" style="font-size:0.71rem;">
          <thead>
            <tr>
              <th>Hafta</th>
              <th>Tür &amp; Adet</th>
              <th>Zorluk</th>
              <th>Kapsanan ÖÇ</th>
              <th>Puan</th>
            </tr>
          </thead>
          <tbody>${satirHTML}</tbody>
        </table>
      </div>
    `;
  }

  /* ========================================================================
     KAYITLI SINAVLAR (SNAPSHOTS), BASILDI KİLİDİ VE ŞİFRELİ OMR ANAHTARI
     ======================================================================== */
  function aktifDersSinavGizliAnahtarGetir(dersId) {
    const hedefId = dersId || durum.aktifDersId || 'genel';
    if (durum.aktifKayitliSinavId) {
      const ks = (durum.kayitliSinavlar || []).find((x) => x && x.id === durum.aktifKayitliSinavId);
      if (ks && ks.sinavGizliAnahtar) return ks.sinavGizliAnahtar;
    }
    if (!durum.dersTaslakSinavlari || typeof durum.dersTaslakSinavlari !== 'object') {
      durum.dersTaslakSinavlari = {};
    }
    if (!durum.dersTaslakSinavlari[hedefId] || typeof durum.dersTaslakSinavlari[hedefId] !== 'object') {
      durum.dersTaslakSinavlari[hedefId] = {};
    }
    if (!durum.dersTaslakSinavlari[hedefId].sinavGizliAnahtar) {
      durum.dersTaslakSinavlari[hedefId].sinavGizliAnahtar = C.uretSinavGizliAnahtari();
    }
    return durum.dersTaslakSinavlari[hedefId].sinavGizliAnahtar;
  }

  function uygulaBasildiKilidiUI(kilitliMi) {
    const kilit = Boolean(kilitliMi);
    document.body.classList.toggle('sinav-basildi-kilitli', kilit);
    const seritKilitli = document.getElementById('serit-kilitli-sinav');
    if (seritKilitli) seritKilitli.hidden = !kilit;
    const kilitlenenIdler = [
      'ayar-dy-sayisi', 'ayar-dy-toplam-puan',
      'ayar-test-sayisi', 'ayar-test-toplam-puan', 'ayar-sik-sayisi',
      'ayar-klasik-sayisi', 'ayar-klasik-puan-modu', 'ayar-klasik-toplam-puan',
      'ayar-zorluk-dagilimi', 'ayar-hafta-dagilim-modu',
      'ayar-haric-tut-sorulanlar', 'ayar-her-oc-en-az-bir', 'btn-puan-100-dengele',
      'btn-kombinasyon-uygula', 'btn-hazir-sablon-25', 'baski-ogrenci-soru-modu',
      'ayar-kitapcik-gruplar', 'btn-hafta-vize', 'btn-hafta-final',
      'btn-hafta-son7', 'btn-hafta-tersle', 'btn-kagit-degisim-sifirla',
      'btn-sinav-soruldu-isaretle', 'btn-soru-secimlerini-sifirla'
    ];
    kilitlenenIdler.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = kilit;
    });
    document.querySelectorAll('#kutu-hafta-secim-izgara input[type="checkbox"], #kutu-hafta-secim-izgara input, #hafta-secim-izgara input[type="checkbox"], #hafta-kota-izgara input').forEach((el) => {
      el.disabled = kilit;
    });
    document.querySelectorAll('#a4-onizleme-sahne [data-soru-degistir-idx], #a4-onizleme-sahne [data-soru-yukari-idx], #a4-onizleme-sahne [data-soru-asagi-idx], #a4-onizleme-sahne [data-soru-duzenle-id], #a4-onizleme-sahne [data-kagit-soru-degistir], #a4-onizleme-sahne [data-kagit-soru-sabitle], #a4-onizleme-sahne [data-kagit-soru-yon], #a4-onizleme-sahne [data-kagit-soru-duzenle]').forEach((el) => {
      el.disabled = kilit;
    });
  }

  function guncelleKayitliSinavlarCubuguUI() {
    const aktifId = durum.aktifDersId || 'genel';
    const tumKayitlar = Array.isArray(durum.kayitliSinavlar) ? durum.kayitliSinavlar : [];
    const dersKayitlari = tumKayitlar.filter((k) => k && (k.dersId === aktifId || aktifId === 'genel'));

    if (durum.aktifKayitliSinavId && !dersKayitlari.some((k) => k.id === durum.aktifKayitliSinavId)) {
      durum.aktifKayitliSinavId = '';
    }
    const seciliKayit = dersKayitlari.find((k) => k.id === durum.aktifKayitliSinavId) || null;

    const opsiyonHTML = [
      '<option value="">Canlı Çalışma Taslağı (Düzenlenebilir)</option>',
      ...dersKayitlari.map((k) => {
        const kilitSimge = k.basildiKilidi ? '[Kilitli] ' : '';
        const soruTop = (Number(k.ayarlar && k.ayarlar.dySayisi) || 0)
          + (Number(k.ayarlar && k.ayarlar.testSayisi) || 0)
          + (Number(k.ayarlar && k.ayarlar.klasikSayisi) || 0);
        return `<option value="${C.kacisHTML(k.id)}" ${k.id === durum.aktifKayitliSinavId ? 'selected' : ''}>${kilitSimge}${C.kacisHTML(k.ad)} (${soruTop} Soru · ${C.kacisHTML(k.kayitTarihi || '')})</option>`;
      })
    ].join('');

    const secStudyo = document.getElementById('sec-kayitli-sinav');
    const secOmr = document.getElementById('sec-omr-kayitli-sinav');
    const secUst = document.getElementById('sec-kayitli-sinav-ust');
    if (secStudyo) secStudyo.innerHTML = opsiyonHTML;
    if (secOmr) secOmr.innerHTML = opsiyonHTML;
    if (secUst) secUst.innerHTML = opsiyonHTML;

    const rozetKilit = document.getElementById('rozet-kayitli-sinav-durum') || document.getElementById('rozet-kayitli-sinav-kilit');
    const bilgiEl = document.getElementById('etiket-kayitli-sinav-bilgi');
    const btnKilitle = document.getElementById('btn-sinav-basildi-kilitle');
    const btnSil = document.getElementById('btn-kayitli-sinav-sil');

    if (seciliKayit) {
      if (rozetKilit) {
        rozetKilit.className = seciliKayit.basildiKilidi ? 'rozet rozet-kirmizi' : 'rozet rozet-yesil';
        rozetKilit.textContent = seciliKayit.basildiKilidi
          ? 'Basıldı Kilidi Aktif'
          : 'Kayıtlı Sınav Seçili';
      }
      if (bilgiEl) {
        bilgiEl.textContent = seciliKayit.basildiKilidi
          ? `"${seciliKayit.ad}" basıldı olarak kilitlendi; sorular ve cevap anahtarı korunuyor.`
          : `"${seciliKayit.ad}" yüklendi (${seciliKayit.kayitTarihi || ''}). Kağıdı bastırdıktan sonra kilitleyebilirsiniz.`;
      }
      if (btnKilitle) {
        btnKilitle.style.display = 'inline-flex';
        btnKilitle.disabled = false;
        btnKilitle.textContent = seciliKayit.basildiKilidi ? 'Kilidi Aç' : 'Basıldı Kilitle';
      }
      if (btnSil) {
        btnSil.disabled = false;
        btnSil.style.display = 'inline-flex';
      }
      uygulaBasildiKilidiUI(Boolean(seciliKayit.basildiKilidi));
    } else {
      if (rozetKilit) {
        rozetKilit.className = 'rozet rozet-mavi';
        rozetKilit.textContent = 'Canlı Taslak';
      }
      if (bilgiEl) {
        bilgiEl.textContent = `Bu derste ${dersKayitlari.length} kayıtlı sınav var. Sınavı kaydettiğinizde soruları ve A/B/C/D anahtarları sabitlenir.`;
      }
      if (btnKilitle) {
        btnKilitle.disabled = true;
        btnKilitle.textContent = 'Basıldı Kilitle';
      }
      if (btnSil) {
        btnSil.disabled = true;
      }
      uygulaBasildiKilidiUI(false);
    }
    if (typeof window.__guncelleYasamDongusuRozetUI === 'function') {
      window.__guncelleYasamDongusuRozetUI();
    }
  }

  function kaydetSinavSnapshot() {
    kaydetAktifDersIzoleDurumu(durum.aktifDersId);
    const onAktifDers = durum.dersler.find((d) => d.id === durum.aktifDersId) || durum.dersler[0] || varsayilanBosDers();
    const onDy = Math.max(0, Math.min(25, parseInt((document.getElementById('ayar-dy-sayisi') && document.getElementById('ayar-dy-sayisi').value) || '0', 10) || 0));
    const onTest = Math.max(0, Math.min(35, parseInt((document.getElementById('ayar-test-sayisi') && document.getElementById('ayar-test-sayisi').value) || '0', 10) || 0));
    const onKlasik = Math.max(0, Math.min(5, parseInt((document.getElementById('ayar-klasik-sayisi') && document.getElementById('ayar-klasik-sayisi').value) || '0', 10) || 0));
    const yeniId = `KS-${Date.now().toString(36).toUpperCase()}`;
    const yeniSinavKodu = `${onAktifDers.kod}-${yeniId.slice(-4)}-${onDy}-${onTest}-${onKlasik}`;
    const yeniSinavGizliAnahtar = C.uretSinavGizliAnahtari();

    // Nihai sinavKodu ve 128-bit CSPRNG gizli anahtar ile tek seferde üretip dondur
    const yapi = okuAktifSinavYapisi({
      zorlaTaslak: true,
      ozelSinavKodu: yeniSinavKodu,
      ozelSinavGizliAnahtar: yeniSinavGizliAnahtar
    });
    const adInput = document.getElementById('girdi-kayitli-sinav-ad') || document.getElementById('girdi-kayitli-sinav-adi');
    const girilenAd = adInput && adInput.value ? adInput.value.trim() : '';
    const sinavAdi = girilenAd || `${yapi.sinavAd || 'Sınav'} (${yapi.tarih || new Date().toLocaleDateString('tr-TR')})`;

    const kompaktAnahtarlar = {};
    ['A', 'B', 'C', 'D'].forEach((g) => {
      const an = (yapi.cevapAnahtarlari && yapi.cevapAnahtarlari[g]) || { dy: [], test: [], klasik: [] };
      kompaktAnahtarlar[g] = {
        dy: Array.isArray(an.dy) ? an.dy.slice() : [],
        test: Array.isArray(an.test) ? an.test.slice() : [],
        testDetay: Array.isArray(an.testDetay) ? JSON.parse(JSON.stringify(an.testDetay)) : [],
        klasik: Array.isArray(an.klasik) ? an.klasik.slice() : []
      };
    });

    const aktifDersSorulari = durum.sorular.filter((s) => !s.arsivde && (s.dersId === yapi.ders.id || s.dersId === 'genel'));
    const birlesikHavuz = [
      ...yapi.tumSeciliSorular,
      ...aktifDersSorulari.filter((ds) => !(yapi.tumSeciliSorular || []).some((ts) => ts.id === ds.id))
    ].slice(0, 120);

    const snapshot = {
      id: yeniId,
      ad: sinavAdi.slice(0, 80),
      dersId: yapi.ders.id,
      dersKod: yapi.ders.kod,
      dersAd: yapi.ders.ad,
      sinavKodu: yeniSinavKodu,
      sinavGizliAnahtar: yeniSinavGizliAnahtar,
      basildiKilidi: false,
      kayitTarihi: new Date().toLocaleString('tr-TR').slice(0, 16),
      ayarlar: {
        kurum: yapi.kurum,
        sinavAd: sinavAdi.slice(0, 80),
        sure: yapi.sure,
        tarih: yapi.tarih,
        hoca: yapi.hoca,
        dySayisi: yapi.dySayisi,
        dyToplamPuan: yapi.dyToplamPuan,
        testSayisi: yapi.testSayisi,
        testToplamPuan: yapi.testToplamPuan,
        sikSayisi: yapi.sikSayisi,
        klasikSayisi: yapi.klasikSayisi,
        klasikPuanModu: yapi.klasikPuanModu,
        klasikOptikModu: yapi.klasikOptikModu,
        klasikToplamPuan: yapi.klasikToplamPuan,
        klasikSoruPuanlari: (yapi.klasikSoruPuanlari || []).slice(),
        optikYerlesim: yapi.optikYerlesim,
        kimlikModu: yapi.kimlikModu,
        haneSayisi: yapi.haneSayisi,
        kitapcikGruplar: yapi.kitapcikGruplar,
        ogrenciSoruModu: yapi.ogrenciSoruModu
      },
      tumSeciliSorular: JSON.parse(JSON.stringify(yapi.tumSeciliSorular || [])),
      havuzSorulari: JSON.parse(JSON.stringify(birlesikHavuz)),
      kitapciklar: JSON.parse(JSON.stringify(yapi.kitapciklar || {})),
      cevapAnahtarlari: kompaktAnahtarlar,
      ogrenciyeOzelAnahtarlar: JSON.parse(JSON.stringify(yapi.ogrenciyeOzelAnahtarlar || {}))
    };

    if (!Array.isArray(durum.kayitliSinavlar)) durum.kayitliSinavlar = [];
    durum.kayitliSinavlar.unshift(snapshot);
    durum.aktifKayitliSinavId = snapshot.id;
    if (adInput) adInput.value = '';
    verileriKaydet();
    guncelleKayitliSinavlarCubuguUI();
    guncelleA4Onizleme();
    return snapshot;
  }

  function yukleKayitliSinavSnapshot(sinavId) {
    const temizId = String(sinavId || '').trim();
    if (!temizId) {
      durum.aktifKayitliSinavId = '';
      yukleAktifDersIzoleDurumu(durum.aktifDersId);
      verileriKaydet();
      guncelleKayitliSinavlarCubuguUI();
      guncelleA4Onizleme();
      guncelleOmrTabloVeKuyruk();
      guncelleMaddeAnaliziSekmesi();
      return;
    }
    const hedef = (durum.kayitliSinavlar || []).find((k) => k && k.id === temizId);
    if (!hedef) return;
    if (!durum.aktifKayitliSinavId) {
      kaydetAktifDersIzoleDurumu(durum.aktifDersId);
    }
    durum.aktifKayitliSinavId = hedef.id;
    const ay = hedef.ayarlar || {};
    const yazInput = (id, deger) => {
      const el = document.getElementById(id);
      if (el && deger !== undefined && deger !== null) el.value = String(deger);
    };
    yazInput('antet-kurum', ay.kurum);
    yazInput('antet-sinav-ad', ay.sinavAd || hedef.ad);
    yazInput('antet-sure', ay.sure);
    yazInput('antet-tarih', ay.tarih);
    yazInput('antet-hoca', ay.hoca);
    yazInput('ayar-dy-sayisi', ay.dySayisi);
    yazInput('ayar-dy-toplam-puan', ay.dyToplamPuan);
    yazInput('ayar-test-sayisi', ay.testSayisi);
    yazInput('ayar-test-toplam-puan', ay.testToplamPuan);
    yazInput('ayar-sik-sayisi', ay.sikSayisi);
    yazInput('ayar-klasik-sayisi', ay.klasikSayisi);
    yazInput('ayar-klasik-puan-modu', ay.klasikPuanModu);
    yazInput('ayar-klasik-optik-modu', ay.klasikOptikModu);
    yazInput('ayar-klasik-toplam-puan', ay.klasikToplamPuan);
    yazInput('ayar-optik-yerlesim', ay.optikYerlesim);
    yazInput('ayar-kimlik-modu', ay.kimlikModu);
    yazInput('ayar-hane-sayisi', ay.haneSayisi);
    yazInput('ayar-kitapcik-gruplar', ay.kitapcikGruplar);
    yazInput('baski-ogrenci-soru-modu', ay.ogrenciSoruModu);
    if (Array.isArray(ay.klasikSoruPuanlari) && ay.klasikSoruPuanlari.length > 0) {
      durum.klasikTekTekPuanlar = ay.klasikSoruPuanlari.slice();
    }
    verileriKaydet();
    guncelleKayitliSinavlarCubuguUI();
    guncelleA4Onizleme();
    if (durum.okumaSonuclari.length > 0 && typeof C.yenidenPuanlaOkumaSonuclari === 'function') {
      durum.okumaSonuclari = C.yenidenPuanlaOkumaSonuclari(durum.okumaSonuclari, okuEtkinOmrSinavYapisi());
      verileriKaydet();
    }
    guncelleOmrTabloVeKuyruk();
    guncelleMaddeAnaliziSekmesi();
  }

  function kilitleVeyaAcKayitliSinav(zorlaDeger = null) {
    if (!durum.aktifKayitliSinavId) return;
    const hedef = (durum.kayitliSinavlar || []).find((k) => k && k.id === durum.aktifKayitliSinavId);
    if (!hedef) return;
    hedef.basildiKilidi = zorlaDeger !== null ? Boolean(zorlaDeger) : !hedef.basildiKilidi;
    verileriKaydet();
    guncelleKayitliSinavlarCubuguUI();
    guncelleA4Onizleme();
  }

  function silKayitliSinavSnapshot() {
    if (!durum.aktifKayitliSinavId) return;
    const silinecek = (durum.kayitliSinavlar || []).find((k) => k && k.id === durum.aktifKayitliSinavId);
    if (!silinecek) return;
    kaydetSonGeriAlYedegi(`Kayıtlı Sınav Silindi (${silinecek.ad})`);
    durum.kayitliSinavlar = (durum.kayitliSinavlar || []).filter((k) => k && k.id !== durum.aktifKayitliSinavId);
    durum.aktifKayitliSinavId = '';
    yukleAktifDersIzoleDurumu(durum.aktifDersId);
    verileriKaydet({ zorlaEz: true, silmeOnayi: true });
    guncelleKayitliSinavlarCubuguUI();
    guncelleA4Onizleme();
  }

  /* Aktif Sınav Yapılandırmasını Formdan Okuma */
  function okuAktifSinavYapisi(secenekler = {}) {
    const dySayisi = Math.max(0, Math.min(25, parseInt(document.getElementById('ayar-dy-sayisi').value, 10) || 0));
    const dyToplamGirdi = Math.max(0, parseFloat((document.getElementById('ayar-dy-toplam-puan') && document.getElementById('ayar-dy-toplam-puan').value) || '20') || 0);

    const testSayisi = Math.max(0, Math.min(35, parseInt(document.getElementById('ayar-test-sayisi').value, 10) || 0));
    const testToplamGirdi = Math.max(0, parseFloat((document.getElementById('ayar-test-toplam-puan') && document.getElementById('ayar-test-toplam-puan').value) || '60') || 0);
    const sikSayisi = parseInt(document.getElementById('ayar-sik-sayisi').value, 10) === 4 ? 4 : 5;

    const klasikSayisi = Math.max(0, Math.min(5, parseInt(document.getElementById('ayar-klasik-sayisi').value, 10) || 0));
    const klasikPuanModu = (document.getElementById('ayar-klasik-puan-modu') && document.getElementById('ayar-klasik-puan-modu').value) || 'esit';
    const klasikOptikModu = (document.getElementById('ayar-klasik-optik-modu') && document.getElementById('ayar-klasik-optik-modu').value) || 'kademeli6';
    const klasikToplamGirdi = Math.max(0, parseFloat((document.getElementById('ayar-klasik-toplam-puan') && document.getElementById('ayar-klasik-toplam-puan').value) || '20') || 0);

    guncelleKlasikTekTekKutularUI(klasikSayisi, klasikPuanModu);

    // Eğer "tek_tek" modundaysa dinamik kutulardaki puanları oku
    if (klasikPuanModu === 'tek_tek' && klasikSayisi > 0) {
      const kutu = document.getElementById('kutu-klasik-tek-tek-puanlar');
      if (kutu) {
        kutu.querySelectorAll('[data-klasik-tek-puan-idx]').forEach((inp) => {
          const idx = parseInt(inp.getAttribute('data-klasik-tek-puan-idx'), 10);
          durum.klasikTekTekPuanlar[idx] = Math.max(1, parseFloat(inp.value) || 10);
        });
      }
    }

    const puanHesap = C.hesaplaSinavBolumVeSoruPuanlari({
      dySayisi,
      dyToplamPuan: dyToplamGirdi,
      testSayisi,
      testToplamPuan: testToplamGirdi,
      klasikSayisi,
      klasikPuanModu,
      klasikToplamPuan: klasikToplamGirdi,
      klasikTekTekPuanlar: durum.klasikTekTekPuanlar.slice(0, klasikSayisi)
    });

    if (klasikPuanModu === 'tek_tek' && document.getElementById('ayar-klasik-toplam-puan')) {
      document.getElementById('ayar-klasik-toplam-puan').value = String(puanHesap.klasikToplamPuan);
    }

    // Canlı Bölüm Puanı -> Soru Başı Bölme Etiketlerini Güncelle
    const etiketDy = document.getElementById('etiket-dy-birim-puan');
    if (etiketDy) {
      etiketDy.textContent = dySayisi > 0
        ? `➗ Otomatik Dağılım: ${puanHesap.dyToplamPuan} Toplam Puan ÷ ${dySayisi} Soru = Soru Başı ${puanHesap.dySoruPuan} Puan`
        : 'ℹ️ Doğru/Yanlış sorusu seçilmedi (0 Puan)';
    }

    const etiketTest = document.getElementById('etiket-test-birim-puan');
    if (etiketTest) {
      etiketTest.textContent = testSayisi > 0
        ? `➗ Otomatik Dağılım: ${puanHesap.testToplamPuan} Toplam Puan ÷ ${testSayisi} Soru = Soru Başı ${puanHesap.testSoruPuan} Puan`
        : 'ℹ️ Çoktan seçmeli test sorusu seçilmedi (0 Puan)';
    }

    const etiketKlasik = document.getElementById('etiket-klasik-birim-puan');
    if (etiketKlasik) {
      if (klasikSayisi === 0) {
        etiketKlasik.textContent = 'ℹ️ Klasik soru seçilmedi (0 Puan)';
      } else if (klasikPuanModu === 'tek_tek') {
        etiketKlasik.textContent = `✍️ Tek Tek Klasik Puanları: ${puanHesap.klasikSoruPuanlari.map((p, i) => `K${i + 1}=${p}p`).join(' + ')} = Toplam ${puanHesap.klasikToplamPuan} Puan`;
      } else {
        etiketKlasik.textContent = `➗ Eşit Dağılım: ${puanHesap.klasikToplamPuan} Toplam Puan ÷ ${klasikSayisi} Klasik Soru = Soru Başı ${puanHesap.klasikSoruPuan} Puan`;
      }
    }

    const dyToplamPuan = puanHesap.dyToplamPuan;
    const dySoruPuan = puanHesap.dySoruPuan;
    const testToplamPuan = puanHesap.testToplamPuan;
    const testSoruPuan = puanHesap.testSoruPuan;
    const klasikToplamPuan = puanHesap.klasikToplamPuan;
    const klasikSoruPuan = puanHesap.klasikSoruPuan;
    const klasikSoruPuanlari = puanHesap.klasikSoruPuanlari;
    const toplamPuan = puanHesap.toplamPuan;
    const tam100Mu = puanHesap.tam100Mu;

    const optikYerlesim = document.getElementById('ayar-optik-yerlesim').value || 'birlesik';
    const ayriOptikAdet = parseInt(document.getElementById('ayar-ayri-optik-adet').value, 10) || 2;
    const kimlikModu = document.getElementById('ayar-kimlik-modu').value || 'son2';
    const haneSayisi = kimlikModu === 'tam'
      ? (parseInt(document.getElementById('ayar-hane-sayisi').value, 10) || 8)
      : (kimlikModu === 'son3' ? 3 : 2);
    const kitapcikGruplar = document.getElementById('ayar-kitapcik-gruplar').value || 'ABCD';
    const onizlemeMod = document.getElementById('ayar-onizleme-mod').value || 'kagit-A';

    const kaliteFormTipi = (document.getElementById('kalite-form-tipi') && document.getElementById('kalite-form-tipi').value) || 'standart';
    const kaliteDokumanNo = ((document.getElementById('kalite-dokuman-no') && document.getElementById('kalite-dokuman-no').value) || '').trim();
    const kaliteYayinTarihi = ((document.getElementById('kalite-yayin-tarihi') && document.getElementById('kalite-yayin-tarihi').value) || '').trim();
    const kaliteRevizyon = ((document.getElementById('kalite-revizyon') && document.getElementById('kalite-revizyon').value) || '').trim();
    const mukerrerGizleModu = (document.getElementById('ayar-mukerrer-gizle') && document.getElementById('ayar-mukerrer-gizle').value) || 'evet';
    const islemBosluguPx = parseInt((document.getElementById('ayar-islem-boslugu') && document.getElementById('ayar-islem-boslugu').value) || '0', 10) || 0;
    document.documentElement.style.setProperty('--kagit-islem-bosluk', `${islemBosluguPx}px`);

    const testGoturmeOrani = parseFloat(document.getElementById('kural-test-goturme').value) || 0;
    const dyGoturmeOrani = parseFloat(document.getElementById('kural-dy-goturme').value) || 0;
    const iptalMetin = (document.getElementById('kural-iptal-soru').value || '').toUpperCase();
    const iptalEdilenSorular = iptalMetin
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ciftSikDogruMetni = (document.getElementById('kural-cift-sik-dogru') && document.getElementById('kural-cift-sik-dogru').value) || '';

    const aktifDers = durum.dersler.find((d) => d.id === durum.aktifDersId) || durum.dersler[0] || varsayilanBosDers();
    const dersOgrenimCiktilari = C.ayiklaDersOcMaddeleri(aktifDers.ogrenimCiktilari || []);
    const rozetDersOc = document.getElementById('rozet-aktif-ders-oc-sayisi');
    if (rozetDersOc) {
      rozetDersOc.className = dersOgrenimCiktilari.length > 0 ? 'rozet rozet-yesil' : 'rozet rozet-mavi';
      rozetDersOc.textContent = dersOgrenimCiktilari.length > 0
        ? `🎯 ${dersOgrenimCiktilari.length} ÖÇ Kayıtlı`
        : '0 ÖÇ Kayıtlı';
    }
    const kagitOcGorunum = (document.getElementById('ayar-kagit-oc-gorunum') && document.getElementById('ayar-kagit-oc-gorunum').value) || 'kapali';
    const dersSorulari = durum.sorular.filter((s) => !s.arsivde && (s.dersId === aktifDers.id || s.dersId === 'genel'));
    const zorlukDagilimi = (document.getElementById('ayar-zorluk-dagilimi') && document.getElementById('ayar-zorluk-dagilimi').value) || 'dengeli';
    const haftaDagilimModu = (document.getElementById('ayar-hafta-dagilim-modu') && document.getElementById('ayar-hafta-dagilim-modu').value) || 'otomatik_dengeli';
    const haricTutSorulanlar = Boolean(document.getElementById('ayar-haric-tut-sorulanlar') && document.getElementById('ayar-haric-tut-sorulanlar').checked);
    const herOcEnAzBirSoru = document.getElementById('ayar-her-oc-en-az-bir')
      ? Boolean(document.getElementById('ayar-her-oc-en-az-bir').checked)
      : false;

    const secimImzasi = JSON.stringify({
      dersId: aktifDers.id,
      dySayisi,
      testSayisi,
      klasikSayisi,
      zorlukDagilimi,
      seciliHaftalar: durum.seciliHaftalar,
      haftaDagilimModu,
      haftaKotalari: haftaDagilimModu === 'manuel_kota' ? durum.haftaKotalari : null,
      haricTutSorulanlar,
      herOcEnAzBirSoru
    });
    if (durum.sonSecimYapilandirmaImzasi !== secimImzasi) {
      durum.ozelSeciliSoruIdleri = { dy: [], test: [], klasik: [] };
      durum.sonSecimYapilandirmaImzasi = secimImzasi;
    }

    const haftalikSecim = C.secHaftalikVeKotaliSinavSorulari(dersSorulari, {
      dySayisi,
      testSayisi,
      klasikSayisi,
      zorlukModu: zorlukDagilimi,
      seciliHaftalar: durum.seciliHaftalar,
      haftaDagilimModu,
      haftaKotalari: durum.haftaKotalari,
      haricTutSorulanlar,
      herOcEnAzBirSoru,
      reddedilenSoruIdleri: durum.reddedilenSoruIdleri,
      sabitlenenSoruIdleri: durum.sabitlenenSoruIdleri,
      ozelSeciliSoruIdleri: durum.ozelSeciliSoruIdleri
    });

    const seciliDy = haftalikSecim.dy.slice();
    const seciliTest = haftalikSecim.test.slice();
    const seciliKlasik = haftalikSecim.klasik.slice();

    // Eğer bankadaki soru sayısı istenenden azsa otomatik tamamlayıcı soru üret (ÖÇ-1..ÖÇ-5 dengeli)
    while (seciliDy.length < dySayisi) {
      const no = seciliDy.length + 1;
      const hNo = durum.seciliHaftalar[(no - 1) % Math.max(1, durum.seciliHaftalar.length)] || 1;
      const ocKoduOto = `ÖÇ-${((no - 1) % 5) + 1}`;
      seciliDy.push({
        id: `oto-dy-${no}`,
        dersId: aktifDers.id,
        tur: 'dy',
        hafta: hNo,
        ocKodu: ocKoduOto,
        kazanim: `${ocKoduOto}: ${hNo}. Hafta Kazanımı`,
        zorluk: 'Orta',
        metin: `${aktifDers.ad} dersi kapsamında ${no}. temel kavram ve doğrulama önermesi doğrudur.`,
        dogruDY: no % 2 === 1 ? 'D' : 'Y'
      });
    }
    while (seciliTest.length < testSayisi) {
      const no = seciliTest.length + 1;
      const hNo = durum.seciliHaftalar[(no - 1) % Math.max(1, durum.seciliHaftalar.length)] || 1;
      const ocKoduOto = `ÖÇ-${((no - 1) % 5) + 1}`;
      seciliTest.push({
        id: `oto-test-${no}`,
        dersId: aktifDers.id,
        tur: 'test',
        hafta: hNo,
        ocKodu: ocKoduOto,
        kazanim: `${ocKoduOto}: ${hNo}. Hafta Kazanımı`,
        zorluk: 'Orta',
        metin: `${aktifDers.ad} dersinin ${no}. değerlendirme sorusunda aşağıdaki mimari seçeneklerden hangisi doğrudur?`,
        siklar: ['Birinci seçenek', 'İkinci seçenek', 'Üçüncü seçenek', 'Dördüncü seçenek', 'Beşinci seçenek'].slice(0, sikSayisi),
        dogruHarf: ['A', 'B', 'C', 'D', 'E'][(no - 1) % sikSayisi]
      });
    }
    while (seciliKlasik.length < klasikSayisi) {
      const no = seciliKlasik.length + 1;
      const hNo = durum.seciliHaftalar[(no - 1) % Math.max(1, durum.seciliHaftalar.length)] || 1;
      const ocKoduOto = `ÖÇ-${((no - 1) % 5) + 1}`;
      seciliKlasik.push({
        id: `oto-klasik-${no}`,
        dersId: aktifDers.id,
        tur: 'klasik',
        hafta: hNo,
        ocKodu: ocKoduOto,
        kazanim: `${ocKoduOto}: ${hNo}. Hafta Kazanımı`,
        zorluk: 'Orta',
        metin: `${aktifDers.ad} kapsamında ${no}. açık uçlu vaka sorusunu mimari gerekçeleriyle açıklayınız.`,
        rubrik: 'Kavramsal doğruluk (5p) + Uygulama örneği (5p)'
      });
    }

    const aktifKayitliSinav = (!secenekler || !secenekler.zorlaTaslak) && durum.aktifKayitliSinavId
      ? (durum.kayitliSinavlar || []).find((k) => k && k.id === durum.aktifKayitliSinavId && (k.dersId === aktifDers.id || aktifDers.id === 'genel'))
      : null;

    if (aktifKayitliSinav && Array.isArray(aktifKayitliSinav.tumSeciliSorular) && aktifKayitliSinav.tumSeciliSorular.length > 0) {
      const donukSorular = JSON.parse(JSON.stringify(aktifKayitliSinav.tumSeciliSorular));
      seciliDy.length = 0;
      seciliTest.length = 0;
      seciliKlasik.length = 0;
      donukSorular.forEach((ds) => {
        if (ds.tur === 'dy') seciliDy.push(ds);
        else if (ds.tur === 'klasik') seciliKlasik.push(ds);
        else seciliTest.push(ds);
      });
    } else {
      // Aktif kağıt soru dizilimini durum.ozelSeciliSoruIdleri ile senkronize tut (Yerinde 🔄 Değiştir ve ▲/▼ için)
      durum.ozelSeciliSoruIdleri = {
        dy: seciliDy.map((s) => s.id),
        test: seciliTest.map((s) => s.id),
        klasik: seciliKlasik.map((s) => s.id)
      };
    }

    const tumSeciliSorular = [...seciliDy, ...seciliTest, ...seciliKlasik];
    const belirtkeTablosu = C.uretSinavBelirtkeTablosu(
      tumSeciliSorular,
      {
        dySoruPuan,
        testSoruPuan,
        klasikSoruPuan,
        klasikSoruPuanlari
      },
      dersSorulari.filter((s) => durum.seciliHaftalar.includes(C.normalizeHaftaNo(s.hafta, 1))),
      dersOgrenimCiktilari
    );
    const sinavKodu = (secenekler && secenekler.ozelSinavKodu)
      ? secenekler.ozelSinavKodu
      : (aktifKayitliSinav && aktifKayitliSinav.sinavKodu
        ? aktifKayitliSinav.sinavKodu
        : `${aktifDers.kod}-${dySayisi}-${testSayisi}-${klasikSayisi}`);
    const sinavGizliAnahtar = (secenekler && secenekler.ozelSinavGizliAnahtar)
      ? secenekler.ozelSinavGizliAnahtar
      : (aktifKayitliSinav && aktifKayitliSinav.sinavGizliAnahtar
        ? aktifKayitliSinav.sinavGizliAnahtar
        : aktifDersSinavGizliAnahtarGetir(aktifDers.id));

    const kitapciklar = {};
    const cevapAnahtarlari = {};
    if (
      aktifKayitliSinav &&
      aktifKayitliSinav.kitapciklar &&
      aktifKayitliSinav.kitapciklar.A &&
      aktifKayitliSinav.cevapAnahtarlari &&
      aktifKayitliSinav.cevapAnahtarlari.A
    ) {
      // Kayıtlı sınavda dondurulmuş kitapçık ve cevap anahtarlarını yeniden üretmeden birebir koru
      for (const g of ['A', 'B', 'C', 'D']) {
        kitapciklar[g] = JSON.parse(JSON.stringify(aktifKayitliSinav.kitapciklar[g]));
        cevapAnahtarlari[g] = JSON.parse(JSON.stringify(aktifKayitliSinav.cevapAnahtarlari[g]));
      }
    } else {
      for (const g of ['A', 'B', 'C', 'D']) {
        // Şıklar karıştırılırken doğru şık (Örn: A'dan D'ye geçtiyse) doğru değeriyle (dogruSikDegeri) birlikte taşınır!
        const varyasyon = C.uretKitapcikVaryasyonu(tumSeciliSorular, g, sinavKodu, true, sikSayisi);
        kitapciklar[g] = varyasyon;
        cevapAnahtarlari[g] = {
          dy: varyasyon.dy.map((s) => s.dogruDY || 'D'),
          test: varyasyon.test.map((s) => s.dogruHarf || 'A'),
          testDetay: varyasyon.test.map((s) => ({
            dogruHarf: s.dogruHarf || 'A',
            orijinalDogruHarf: s.orijinalDogruHarf || s.dogruHarf || 'A',
            dogruSikDegeri: s.dogruSikDegeri || ''
          })),
          klasik: varyasyon.klasik.map((s) => s.rubrik || '')
        };
      }
    }

    // Öğrenciye Özel Soru Kağıdı Varyasyonları ve Kişiye Özel Cevap Anahtarları
    const ogrenciSoruModu = (document.getElementById('baski-ogrenci-soru-modu') && document.getElementById('baski-ogrenci-soru-modu').value) || 'kisiye_ozel_havuz';
    const seciliBaskiOgrenciNo = (document.getElementById('baski-ogrenci-sec') && document.getElementById('baski-ogrenci-sec').value)
      || (durum.ogrenciler[0] && durum.ogrenciler[0].ogrNo)
      || '';

    // Tembel (Lazy) Öğrenci Varyasyonu Üretimi: Normal A4 önizlemede tüm sınıfı yeniden üretmez!
    let _havuzCache = null;
    const getirHavuzSorulari = () => {
      if (_havuzCache) return _havuzCache;
      if (aktifKayitliSinav && Array.isArray(aktifKayitliSinav.havuzSorulari) && aktifKayitliSinav.havuzSorulari.length > 0) {
        _havuzCache = aktifKayitliSinav.havuzSorulari;
      } else {
        const seciliIdSet = new Set(dersSorulari.map((ds) => ds && ds.id));
        _havuzCache = [
          ...dersSorulari,
          ...tumSeciliSorular.filter((ts) => ts && !seciliIdSet.has(ts.id))
        ];
      }
      return _havuzCache;
    };

    const _ozelKagitCache = {};
    const _ozelAnahtarCache = {};
    let _tumOzelHazirlandi = false;

    const getirOgrenciOzelKagit = (ogrNo) => {
      const hedefNo = String(ogrNo || '').trim();
      const ogrenciListe = durum.ogrenciler || [];
      if (ogrenciListe.length === 0) return null;
      let idx = ogrenciListe.findIndex((o) => o && o.ogrNo === hedefNo);
      if (idx < 0) idx = 0;
      const ogr = ogrenciListe[idx];
      if (!ogr) return null;
      if (!_ozelKagitCache[ogr.ogrNo]) {
        const ozelPaket = C.uretOgrenciyeOzelKagitVaryasyonu(
          getirHavuzSorulari(),
          {
            sinavKodu,
            dySayisi,
            testSayisi,
            klasikSayisi,
            sikSayisi,
            kitapcikGruplar,
            kitapciklar,
            cevapAnahtarlari
          },
          ogr,
          idx,
          ogrenciSoruModu
        );
        _ozelKagitCache[ogr.ogrNo] = ozelPaket;
        _ozelAnahtarCache[ogr.ogrNo] = ozelPaket.anahtar;
      }
      return _ozelKagitCache[ogr.ogrNo];
    };

    const tumOgrenciVaryasyonlariniHazirla = () => {
      if (_tumOzelHazirlandi) return _ozelKagitCache;
      const ogrenciListe = durum.ogrenciler || [];
      const havuz = getirHavuzSorulari();
      for (let idx = 0; idx < ogrenciListe.length; idx++) {
        const ogr = ogrenciListe[idx];
        if (!ogr || _ozelKagitCache[ogr.ogrNo]) continue;
        const ozelPaket = C.uretOgrenciyeOzelKagitVaryasyonu(
          havuz,
          {
            sinavKodu,
            dySayisi,
            testSayisi,
            klasikSayisi,
            sikSayisi,
            kitapcikGruplar,
            kitapciklar,
            cevapAnahtarlari
          },
          ogr,
          idx,
          ogrenciSoruModu
        );
        _ozelKagitCache[ogr.ogrNo] = ozelPaket;
        _ozelAnahtarCache[ogr.ogrNo] = ozelPaket.anahtar;
      }
      _tumOzelHazirlandi = true;
      return _ozelKagitCache;
    };

    const baskiKapsamVal = (document.getElementById('baski-kapsam-sec') && document.getElementById('baski-kapsam-sec').value) || 'sinif-aktif';
    const ogrenciyeOzelDegerlendirmeAktif = onizlemeMod.startsWith('ogrenci-') || baskiKapsamVal.startsWith('ogrenci-');

    const yapiNesnesi = {
      sinavKodu,
      sinavGizliAnahtar,
      aktifKayitliSinavId: aktifKayitliSinav ? aktifKayitliSinav.id : '',
      basildiKilidi: Boolean(aktifKayitliSinav && aktifKayitliSinav.basildiKilidi),
      ders: aktifDers,
      kurum: document.getElementById('antet-kurum').value || 'T.C. ÜNİVERSİTE / OKUL MÜDÜRLÜĞÜ',
      sinavAd: document.getElementById('antet-sinav-ad').value || 'ARA SINAVI (VİZE)',
      sure: document.getElementById('antet-sure').value || '60 Dakika',
      tarih: document.getElementById('antet-tarih').value || '07.11.2026',
      hoca: document.getElementById('antet-hoca').value || aktifDers.ogretimElemani,
      dySayisi,
      dyToplamPuan,
      dySoruPuan,
      testSayisi,
      testToplamPuan,
      testSoruPuan,
      sikSayisi,
      klasikSayisi,
      klasikPuanModu,
      klasikOptikModu,
      klasikToplamPuan,
      klasikSoruPuan,
      klasikSoruPuanlari,
      toplamSoruSayisi: dySayisi + testSayisi + klasikSayisi,
      toplamPuan,
      tam100Mu,
      optikYerlesim,
      ayriOptikAdet,
      kimlikModu,
      haneSayisi,
      kitapcikGruplar,
      onizlemeMod,
      kaliteFormTipi,
      kaliteDokumanNo,
      kaliteYayinTarihi,
      kaliteRevizyon,
      mukerrerGizleModu,
      islemBosluguPx,
      testGoturmeOrani,
      dyGoturmeOrani,
      iptalEdilenSorular,
      ciftSikDogruMetni,
      tumSeciliSorular,
      belirtkeTablosu,
      ocKapsamaRaporu: haftalikSecim.ocKapsamaRaporu,
      herOcEnAzBirSoru,
      kagitOcGorunum,
      dersOgrenimCiktilari,
      haftaDagilimModu,
      haricTutSorulanlar,
      kitapciklar,
      cevapAnahtarlari,
      ogrenciSoruModu,
      seciliBaskiOgrenciNo,
      ogrenciyeOzelDegerlendirmeAktif,
      getirOgrenciOzelKagit,
      tumOgrenciVaryasyonlariniHazirla
    };
    Object.defineProperties(yapiNesnesi, {
      ogrenciyeOzelKagitlar: {
        enumerable: true,
        get() { return tumOgrenciVaryasyonlariniHazirla(); }
      },
      ogrenciOzelPaketler: {
        enumerable: true,
        get() { return Object.values(tumOgrenciVaryasyonlariniHazirla()); }
      },
      ogrenciyeOzelAnahtarlar: {
        enumerable: true,
        get() { tumOgrenciVaryasyonlariniHazirla(); return _ozelAnahtarCache; }
      }
    });
    return yapiNesnesi;
  }

  function temizleDyAnahtarDizi(ham, uzunluk) {
    const harfler = String(ham || '').toUpperCase().replace(/[^DY]/g, '').split('');
    const d = [];
    for (let i = 0; i < uzunluk; i++) d.push(harfler[i] || 'D');
    return d;
  }

  function temizleTestAnahtarDizi(ham, uzunluk, sikSayisi = 5) {
    const izin = sikSayisi === 4 ? /[^A-D]/g : /[^A-E]/g;
    const harfler = String(ham || '').toUpperCase().replace(izin, '').split('');
    const d = [];
    for (let i = 0; i < uzunluk; i++) d.push(harfler[i] || 'A');
    return d;
  }

  /* Sekme 3 & 4 için: Harici A/B/C/D Cevap Anahtarı modu açıksa soru bankasından bağımsız OMR yapısı üretir */
  function okuEtkinOmrSinavYapisi() {
    const taban = okuAktifSinavYapisi();
    const h = durum.hariciOmrAnahtar;
    if (!h || !h.aktif) return taban;

    const dySayisi = Math.max(0, Math.min(40, parseInt(h.dySayisi, 10) || 0));
    const testSayisi = Math.max(0, Math.min(80, parseInt(h.testSayisi, 10) || 0));
    const sikSayisi = Number(h.sikSayisi) === 4 ? 4 : 5;
    const klasikSayisi = Math.max(0, Math.min(10, parseInt(h.klasikSayisi, 10) || 0));
    const an = (h.anahtarlar && typeof h.anahtarlar === 'object') ? h.anahtarlar : {};
    const aDy = temizleDyAnahtarDizi(an.A && an.A.dy, dySayisi);
    const aTest = temizleTestAnahtarDizi(an.A && an.A.test, testSayisi, sikSayisi);

    const cevapAnahtarlari = {};
    const kitapciklar = {};
    ['A', 'B', 'C', 'D'].forEach((g) => {
      const hamDy = String((an[g] && an[g].dy) || '').toUpperCase().replace(/[^DY]/g, '');
      const hamTest = String((an[g] && an[g].test) || '').toUpperCase().replace(sikSayisi === 4 ? /[^A-D]/g : /[^A-E]/g, '');
      const dyDizi = hamDy.length > 0 ? temizleDyAnahtarDizi(hamDy, dySayisi) : aDy.slice();
      const testDizi = hamTest.length > 0 ? temizleTestAnahtarDizi(hamTest, testSayisi, sikSayisi) : aTest.slice();
      cevapAnahtarlari[g] = { dy: dyDizi, test: testDizi, klasik: [] };
      kitapciklar[g] = {
        dy: dyDizi.map((cvp, idx) => ({
          id: `HARICI-DY-${idx + 1}`,
          orijinalId: `HARICI-DY-${idx + 1}`,
          orijinalNo: idx + 1,
          tur: 'dy',
          soruNo: idx + 1,
          metin: `Harici Anahtar D/Y Soru ${idx + 1}`,
          dogruDY: cvp,
          ocKodu: 'ÖÇ-1',
          kazanim: 'ÖÇ-1: Harici Cevap Anahtarı'
        })),
        test: testDizi.map((cvp, idx) => ({
          id: `HARICI-TEST-${idx + 1}`,
          orijinalId: `HARICI-TEST-${idx + 1}`,
          orijinalNo: idx + 1,
          tur: 'test',
          soruNo: idx + 1,
          metin: `Harici Anahtar Test Soru ${idx + 1}`,
          dogruHarf: cvp,
          ocKodu: 'ÖÇ-1',
          kazanim: 'ÖÇ-1: Harici Cevap Anahtarı'
        })),
        klasik: Array.from({ length: klasikSayisi }, (_, idx) => ({
          id: `HARICI-KLASIK-${idx + 1}`,
          orijinalId: `HARICI-KLASIK-${idx + 1}`,
          orijinalNo: idx + 1,
          tur: 'klasik',
          soruNo: idx + 1,
          metin: `Harici Klasik Soru ${idx + 1}`,
          ocKodu: 'ÖÇ-1',
          kazanim: 'ÖÇ-1: Harici Cevap Anahtarı'
        }))
      };
    });

    let dySoruPuan = taban.dySoruPuan;
    let testSoruPuan = taban.testSoruPuan;
    let klasikSoruPuan = taban.klasikSoruPuan;
    let klasikToplamPuan = taban.klasikToplamPuan;
    let dyToplamPuan = taban.dyToplamPuan;
    let testToplamPuan = taban.testToplamPuan;
    if (
      taban.dySayisi !== dySayisi ||
      taban.testSayisi !== testSayisi ||
      taban.klasikSayisi !== klasikSayisi ||
      !taban.tam100Mu
    ) {
      klasikToplamPuan = klasikSayisi > 0 ? Math.min(60, klasikSayisi * 10) : 0;
      klasikSoruPuan = klasikSayisi > 0 ? Number((klasikToplamPuan / klasikSayisi).toFixed(4)) : 0;
      const kalanPuan = Math.max(0, 100 - klasikToplamPuan);
      const topObjektif = Math.max(1, dySayisi + testSayisi);
      const birimPuan = kalanPuan / topObjektif;
      dySoruPuan = dySayisi > 0 ? Number(birimPuan.toFixed(4)) : 0;
      testSoruPuan = testSayisi > 0 ? Number(birimPuan.toFixed(4)) : 0;
      dyToplamPuan = Number((dySoruPuan * dySayisi).toFixed(2));
      testToplamPuan = Number((testSoruPuan * testSayisi).toFixed(2));
    }

    return Object.assign({}, taban, {
      dySayisi,
      testSayisi,
      sikSayisi,
      klasikSayisi,
      toplamSoruSayisi: dySayisi + testSayisi + klasikSayisi,
      dyToplamPuan,
      testToplamPuan,
      klasikToplamPuan,
      dySoruPuan,
      testSoruPuan,
      klasikSoruPuan,
      klasikSoruPuanlari: Array.from({ length: klasikSayisi }, () => klasikSoruPuan),
      toplamPuan: 100,
      tam100Mu: true,
      cevapAnahtarlari,
      kitapciklar,
      ogrenciyeOzelDegerlendirmeAktif: false,
      ogrenciyeOzelAnahtarlar: {},
      hariciAnahtarModu: true
    });
  }

  /* ------------------------------------------------------------------------
     KANONİK PARAMETRİK OPTİK FORM HTML ÜRETİCİ
     Seçilen D/Y, Test ve Klasik sayılarına göre dinamik küçülüp büyür;
     köşesinde 4 Fiducial Kare ve Mini Geometri Matris QR barındırır.
     Öğrenciye özel modda (ozelOgrenci) öğrenci numarası balonlarını otomatik doldurur.
     ------------------------------------------------------------------------ */
  function uretKanonikOptikFormHTML(yapi, aktifGrupHarfi = 'A', baslikGoster = false, ayriOptikModuMu = false, ozelOgrenci = null) {
    /* Basılan form, okuma haritasıyla AYNI yerleşimden (C.uretOptikYerlesim) üretilen vektörel SVG'dir:
       balonlar, fiducial kareler ve geometri matrisi okuyucuyla birebir örtüşür (Tek Kaynak). */
    const ozelNoStr = ozelOgrenci && ozelOgrenci.ogrNo ? String(ozelOgrenci.ogrNo).replace(/\D/g, '') : '';
    let baslik = '';
    if (baslikGoster) {
      baslik = `${yapi.ders.kod} - ${yapi.ders.ad} | ${yapi.sinavAd} — OPTİK CEVAP FORMU (${aktifGrupHarfi} GRUBU)`;
    }
    if (ozelOgrenci) {
      baslik = (baslik ? baslik + '  ' : '') + `${ozelOgrenci.adSoyad || ''} (${ozelOgrenci.ogrNo || ''})`;
    }
    const svg = C.uretOptikFormSVG(yapi, { grup: aktifGrupHarfi, ogrNoKod: ozelNoStr, baslik });
    return `<div class="optik-cerceve optik-kanonik">${svg}</div>`;
  }

  /* ------------------------------------------------------------------------
     DİNAMİK 1 A4 (SAYFA 1/2 ÖN YÜZ + SAYFA 2/2 ARKA YÜZ) ÖLÇEKLEME MOTORU
     (otomatikOlcekVeSayfaPlanla)
     20-25 Test/D-Y + 2 Klasik soruyu tam 2 sayfaya taşmadan sığdırır.
     ------------------------------------------------------------------------ */
  function otomatikOlcekVeSayfaPlanla(yapi) {
    // Birim yükseklik tahmini (mm cinsinden) + gerçek soru/şık karakter uzunluğu ağırlığı
    const antetYuk = 22;
    const optikYuk = yapi.optikYerlesim === 'birlesik'
      ? Math.ceil((192 * C.uretOptikYerlesim(yapi).yukseklik) / 800) + 4
      : 0;

    const varyasyonA = (yapi.kitapciklar && yapi.kitapciklar.A) || { dy: [], test: [], klasik: [] };
    const dyKarakterToplam = (varyasyonA.dy || []).reduce((t, s) => t + String(s.metin || '').length, 0);
    const testKarakterToplam = (varyasyonA.test || []).reduce(
      (t, s) => t + String(s.metin || '').length + (s.siklar || []).reduce((st, sk) => st + String(sk || '').length, 0),
      0
    );

    // Çift sütun olduğu için soruların dikey yüksekliği yarıya bölünür; uzun metinler ek satır yüksekliği ekler
    const dyToplamYuk = ((yapi.dySayisi * 5.2) + (dyKarakterToplam / 55) * 2.8) / 2;
    const testToplamYuk = ((yapi.testSayisi * 15.5) + (testKarakterToplam / 62) * 3.1) / 2;
    const klasikToplamYuk = (yapi.klasikSayisi * 28) / 2;

    const toplamIcerikYuk = antetYuk + optikYuk + dyToplamYuk + testToplamYuk + klasikToplamYuk;
    const ikiSayfaKapasiteMm = 520; // 2x A4 net kullanılabilir yükseklik

    const hamDolulukYuzde = Math.min(100, Math.round((toplamIcerikYuk / ikiSayfaKapasiteMm) * 100));

    let fontPt = 9.5;
    let satirAralik = 1.26;
    let soruBoslukPx = 5.5;
    let klasikYukPx = 64;

    if (hamDolulukYuzde > 95) {
      fontPt = 7.7;
      satirAralik = 1.1;
      soruBoslukPx = 2;
      klasikYukPx = 46;
    } else if (hamDolulukYuzde > 88) {
      fontPt = 8.2;
      satirAralik = 1.14;
      soruBoslukPx = 2.8;
      klasikYukPx = 48;
    } else if (hamDolulukYuzde > 76) {
      fontPt = 8.8;
      satirAralik = 1.19;
      soruBoslukPx = 3.8;
      klasikYukPx = 54;
    }
    fontPt = Math.max(7.5, fontPt);
    klasikYukPx = Math.max(46, klasikYukPx);

    document.documentElement.style.setProperty('--kagit-font', `${fontPt}pt`);
    document.documentElement.style.setProperty('--kagit-satir', String(satirAralik));
    document.documentElement.style.setProperty('--kagit-soru-bosluk', `${soruBoslukPx}px`);
    document.documentElement.style.setProperty('--kagit-klasik-yukseklik', `${klasikYukPx}px`);

    // Arayüzdeki Doluluk Çubuğunu Güncelle
    const etiketYuzde = document.getElementById('etiket-doluluk-yuzde');
    const cubukIc = document.getElementById('cubuk-doluluk-ic');
    const etiketBilgi = document.getElementById('etiket-olcek-bilgi');

    if (etiketYuzde && cubukIc && etiketBilgi) {
      cubukIc.style.width = `${hamDolulukYuzde}%`;
      if (hamDolulukYuzde <= 85) {
        etiketYuzde.className = 'rozet rozet-yesil';
        etiketYuzde.textContent = `%${hamDolulukYuzde} (1 A4 Önlü-Arkalı Tam Sığıyor)`;
        cubukIc.style.backgroundColor = 'var(--basari)';
      } else if (hamDolulukYuzde <= 96) {
        etiketYuzde.className = 'rozet rozet-sari';
        etiketYuzde.textContent = `%${hamDolulukYuzde} (Sıkıştırılmış Ölçek Aktif)`;
        cubukIc.style.backgroundColor = 'var(--uyari)';
      } else {
        etiketYuzde.className = 'rozet rozet-kirmizi';
        etiketYuzde.textContent = `%${hamDolulukYuzde} (Maksimum Yoğunluk — Ayrı Optik Önerilir)`;
        cubukIc.style.backgroundColor = 'var(--tehlike)';
      }
      etiketBilgi.textContent = `Otomatik Ölçek: ${fontPt}pt · 2 Sütun · ${yapi.dySayisi} D/Y + ${yapi.testSayisi} Test + ${yapi.klasikSayisi} Klasik = ${yapi.toplamSoruSayisi} Soru`;
    }

    return { fontPt, satirAralik, soruBoslukPx, klasikYukPx, hamDolulukYuzde };
  }

  /* Kaçırılmış HTML metin içindeki olumsuz soru köklerini ÖSYM standardında vurgular */
  function vurgulaOlumsuzSoruKokuHTML(guvenliHtmlMetin) {
    if (!guvenliHtmlMetin) return '';
    return String(guvenliHtmlMetin).replace(
      /(?<![A-Za-zÇĞİÖŞÜçğıöşü0-9_])(değildir|degildir|olamaz|yanlıştır|yanlistir|yoktur|hariçtir|harictir|bulunmaz|söylenemez|soylenemez|ulaşılamaz|ulasilamaz|beklenmez|yapılamaz|yapilamaz|kullanılmaz|kullanilmaz)(?![A-Za-zÇĞİÖŞÜçğıöşü0-9_])/giu,
      '<span class="olumsuz-vurgu">$1</span>'
    );
  }

  /* Tek Bir Sorunun HTML Dizgisini Üretir (Kısa şıkları otomatik yan yana dizer + Kod/Formül ve Görsel/Diyagram destekler + Seçmeli Soru Sonu [ÖÇ-X] etiketi + Olumsuz Kök Vurgusu + Ekran İçi Araçlar & Doğrudan Tıklayıp Düzenleme) */
  function uretSoruBlokHTML(soru, tur, birimPuan, kagitOcGorunum = 'kapali') {
    const haftaNo = C.normalizeHaftaNo(soru.hafta, 1);
    const ocKodu = C.kacisHTML(C.normalizeOcKodu(soru.ocKodu || soru.kazanim, 'ÖÇ-1'));
    const zorlukStr = C.kacisHTML(soru.zorluk || 'Orta');
    const sabitMi = Array.isArray(durum.sabitlenenSoruIdleri) && durum.sabitlenenSoruIdleri.includes(soru.id);
    const soruIdGuvenli = C.kacisHTML(soru.id);
    const soruSonuOcGoster = kagitOcGorunum === 'soru_sonu' || kagitOcGorunum === 'ikisi_birden';
    const soruSonuOcHTML = soruSonuOcGoster
      ? ` <span class="soru-oc-etiket" style="font-size:7pt; font-weight:800; border:0.8px solid #111; border-radius:2px; padding:0 3px; background:#f8fafc; color:#000;">[${ocKodu}]</span>`
      : '';

    const kilitliMi = Boolean(
      durum.aktifKayitliSinavId &&
      (durum.kayitliSinavlar || []).some((k) => k && k.id === durum.aktifKayitliSinavId && k.basildiKilidi)
    );

    const ekranAraclariHTML = kilitliMi
      ? `
        <span class="soru-ekran-araclari">
          <span class="soru-ekran-etiket" title="Basıldı Kilidi Aktif">Kilitli · H${haftaNo}·${ocKodu}·${zorlukStr}</span>
        </span>
      `
      : `
        <span class="soru-ekran-araclari">
          <span class="soru-ekran-etiket" title="Hafta · Bologna ÖÇ · Zorluk">H${haftaNo}·${ocKodu}·${zorlukStr}</span>
          <button type="button" class="soru-ekran-btn" data-kagit-soru-degistir="${soruIdGuvenli}" data-kagit-soru-tur="${tur}" title="Bu soruyu sınav kağıdından kaldır ve yerine havuzdan yeni soru ata">Değiştir</button>
          <button type="button" class="soru-ekran-btn ${sabitMi ? 'aktif-sabit' : ''}" data-kagit-soru-sabitle="${soruIdGuvenli}" title="Bu soruyu kağıtta sabitle / kilidi aç">${sabitMi ? 'Sabit' : 'Sabitle'}</button>
          <button type="button" class="soru-ekran-btn" data-kagit-soru-yon="-1" data-kagit-soru-id="${soruIdGuvenli}" data-kagit-soru-tur="${tur}" title="Soruyu yukarı taşı">▲</button>
          <button type="button" class="soru-ekran-btn" data-kagit-soru-yon="1" data-kagit-soru-id="${soruIdGuvenli}" data-kagit-soru-tur="${tur}" title="Soruyu aşağı taşı">▼</button>
          <button type="button" class="soru-ekran-btn" data-kagit-soru-duzenle="${soruIdGuvenli}" title="Soruyu tam formda düzenle">Düzenle</button>
        </span>
      `;

    const kodBlokHTML = soru.kodBlok
      ? `<div style="font-family:var(--font-mono); font-size:7.6pt; background:#f8fafc; border:0.8px solid #334155; padding:2px 5px; margin:2px 0; border-radius:3px;">${C.kacisHTML(soru.kodBlok)}</div>`
      : '';
    const gorselHTML = soru.gorselDataUrl
      ? `<img src="${C.guvenliURL(soru.gorselDataUrl)}" alt="Soru Şekli" style="max-height:24mm; max-width:100%; object-fit:contain; display:block; margin:2px auto; border:0.5px solid #cbd5e1;" />`
      : '';

    const vurguluSoruMetniHTML = vurgulaOlumsuzSoruKokuHTML(C.kacisHTML(soru.metin));

    if (tur === 'dy') {
      return `
        <div class="dy-soru-satir">
          <span><strong class="soru-no">${soru.kitapcikSoruNo}.</strong> <span class="soru-metin-duzenle" data-duzenle-soru-id="${soruIdGuvenli}" title="Metni yerinde düzenlemek için tıklayın">${vurguluSoruMetniHTML}</span> <span class="soru-puan-etiket">(${birimPuan}p)</span>${soruSonuOcHTML}${ekranAraclariHTML}${kodBlokHTML}${gorselHTML}</span>
        </div>
      `;
    }

    if (tur === 'test') {
      const harfler = ['A', 'B', 'C', 'D', 'E'];
      const siklar = soru.siklar || [];
      const enUzunSik = siklar.reduce((m, s) => Math.max(m, String(s).length), 0);
      const sembolVar = siklar.some((s) => /[=<>+\-*/^_\\{}[\]|]|->|::/.test(String(s)));

      let sikSinif = 'siklar-alt-alta';
      if (enUzunSik <= 10 && !sembolVar) {
        sikSinif = 'siklar-yan-yana';
      } else if (enUzunSik <= 20 && !sembolVar) {
        sikSinif = 'siklar-iki-sutun';
      }

      const sikHTML = siklar
        .map((sMetin, idx) => `
          <div class="sik-oge">
            <span class="sik-harf">${harfler[idx]})</span>
            <span class="sik-metin-duzenle" data-duzenle-soru-id="${soruIdGuvenli}" data-duzenle-sik-idx="${idx}" title="Şıkkı yerinde düzenlemek için tıklayın">${C.kacisHTML(sMetin)}</span>
          </div>
        `)
        .join('');

      return `
        <div class="soru-kutu">
          <div class="soru-kok">
            <span class="soru-no">${soru.kitapcikSoruNo}.</span> <span class="soru-metin-duzenle" data-duzenle-soru-id="${soruIdGuvenli}" title="Metni yerinde düzenlemek için tıklayın">${vurguluSoruMetniHTML}</span>
            <span class="soru-puan-etiket">(${birimPuan}p)</span>
            ${ekranAraclariHTML}
          </div>
          ${soruSonuOcHTML ? `<div style="line-height:1.1; margin-bottom:1px;">${soruSonuOcHTML}</div>` : ''}
          ${kodBlokHTML}
          ${gorselHTML}
          <div class="${sikSinif}">${sikHTML}</div>
          <div class="soru-islem-boslugu"></div>
        </div>
      `;
    }

    // Klasik / Açık Uçlu Soru
    return `
      <div class="soru-kutu">
        <div class="soru-kok">
          <span class="soru-no">Klasik ${soru.kitapcikSoruNo}.</span> <span class="soru-metin-duzenle" data-duzenle-soru-id="${soruIdGuvenli}" title="Metni yerinde düzenlemek için tıklayın">${vurguluSoruMetniHTML}</span>
          <span class="soru-puan-etiket">(${birimPuan} Puan)</span>
          ${ekranAraclariHTML}
        </div>
        ${soruSonuOcHTML ? `<div style="line-height:1.1; margin-bottom:1px;">${soruSonuOcHTML}</div>` : ''}
        ${kodBlokHTML}
        ${gorselHTML}
        <div class="klasik-cevap-alan">
          <span class="klasik-hoca-mini-not">Puan ön yüzdeki optik K${soru.kitapcikSoruNo} satırına kodlanır</span>
        </div>
      </div>
    `;
  }

  /* Her Sınav Kağıdına Basılan Öğrenciye Cevap Sızdırmayan 128-bit Şifreli OQV2 QR Kutusu */
  const __oqv2RenderOnbellek = new Map();
  function uretKagitSifreliQrHTML(yapi, grupHarfi = 'A', ozelOgrenci = null) {
    if (typeof C.uretSifreliOptikKagitQrPaketi !== 'function') return '';
    try {
      const etkinGrup = (ozelOgrenci && ozelOgrenci.grupHarfi) ? ozelOgrenci.grupHarfi : (grupHarfi || 'A');
      const ozelAnahtar = (ozelOgrenci && ozelOgrenci.anahtar)
        ? ozelOgrenci.anahtar
        : ((ozelOgrenci && ozelOgrenci.varyasyon && ozelOgrenci.varyasyon.cevapAnahtari)
          ? ozelOgrenci.varyasyon.cevapAnahtari
          : ((yapi.cevapAnahtarlari && yapi.cevapAnahtarlari[etkinGrup]) || null));
      const dyArr = ozelAnahtar && Array.isArray(ozelAnahtar.dy) ? ozelAnahtar.dy : [];
      const testArr = ozelAnahtar && Array.isArray(ozelAnahtar.test) ? ozelAnahtar.test : [];
      const ogrNoStr = ozelOgrenci && ozelOgrenci.ogrNo ? String(ozelOgrenci.ogrNo) : '';
      const gizliAnahtar = yapi.sinavGizliAnahtar || '';
      if (!gizliAnahtar) return '';
      const onbellekAnahtari = [
        gizliAnahtar,
        yapi.sinavKodu || '',
        ogrNoStr,
        etkinGrup,
        dyArr.join(''),
        testArr.join(''),
        yapi.dySayisi,
        yapi.testSayisi,
        yapi.klasikSayisi,
        yapi.dyToplamPuan,
        yapi.testToplamPuan,
        yapi.klasikToplamPuan,
        Boolean(ozelOgrenci && ozelAnahtar) ? '1' : '0'
      ].join('|');
      let qrMetni = __oqv2RenderOnbellek.get(onbellekAnahtari) || '';
      if (!qrMetni) {
        const hamQr = C.uretSifreliOptikKagitQrPaketi({
          sinavKodu: yapi.sinavKodu,
          ogrNo: ogrNoStr,
          grup: etkinGrup,
          dySayisi: yapi.dySayisi,
          testSayisi: yapi.testSayisi,
          klasikSayisi: yapi.klasikSayisi,
          dyToplamPuan: yapi.dyToplamPuan,
          testToplamPuan: yapi.testToplamPuan,
          klasikToplamPuan: yapi.klasikToplamPuan,
          dyAnahtar: dyArr,
          testAnahtar: testArr,
          ozelCevapAnahtariMi: Boolean(ozelOgrenci && ozelAnahtar)
        }, gizliAnahtar);
        qrMetni = typeof hamQr === 'string' ? hamQr : (hamQr && hamQr.qrMetni ? hamQr.qrMetni : '');
        if (qrMetni) {
          if (__oqv2RenderOnbellek.size > 600) __oqv2RenderOnbellek.clear();
          __oqv2RenderOnbellek.set(onbellekAnahtari, qrMetni);
        }
      }
      if (!qrMetni) return '';
      const svg = uretGercekQrSvg(qrMetni, 50);
      if (!svg) return '';
      return `<div class="kagit-oqv2-kutu" data-oqv2-kod="${C.kacisHTML(qrMetni)}" title="Şifreli Optik Anahtar QR (Öğrenci okutsa bile cevapları göremez)">${svg}<span class="kagit-oqv2-etiket">OMR-QR</span></div>`;
    } catch (_) {
      return '';
    }
  }

  /* Basılı Cevap Anahtarı Üstüne Gömülen Öğretmen Master Kurulum QR Kutusu */
  function uretCevapAnahtariMasterQrHTML(yapi) {
    if (typeof C.uretKompaktSetupQrPaketi !== 'function') return '';
    try {
      const varsayilanTaban = (location.protocol.startsWith('http') && !/^(localhost|127\.0\.0\.1)$/i.test(location.hostname))
        ? location.origin
        : 'https://sinav.axonturk.workers.dev';
      const setupTabanEl = document.getElementById('setup-qr-taban-adres');
      const taban = ((setupTabanEl && setupTabanEl.value) || varsayilanTaban).trim().replace(/\/+$/, '');
      const paket = C.uretKompaktSetupQrPaketi(yapi, durum.ogrenciler, taban);
      if (!paket || !paket.url) return '';
      const svg = uretGercekQrSvg(paket.url, 82);
      if (!svg) return '';
      return `
        <div data-master-setup-qr="1" data-setup-url="${C.kacisHTML(paket.url)}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; border:1px solid #000; padding:3px 5px; border-radius:3px; background:#fff; min-width:24mm;">
          ${svg}
          <span style="font-size:5.6pt; font-weight:800; line-height:1.05; margin-top:1px; text-align:center;">📱 HOCA OMR KURULUM QR</span>
        </div>
      `;
    } catch (_) {
      return '';
    }
  }

  /* Türkiye Standart Kalite Formu Anteti Üretici (ISO 9001 / YÖKAK / MÜDEK / MEB TKY / Özel Banner) */
  function uretStandartKaliteAntetHTML(yapi, grupHarfi = 'A', ozelOgrenci = null) {
    const logoHTML = durum.kaliteGorselDataUrl
      ? `<img src="${C.guvenliURL(durum.kaliteGorselDataUrl)}" alt="Kurum Logosu" />`
      : `<div style="font-size:15pt; line-height:1;">🏛️</div><div style="font-size:5.8pt; margin-top:2px;">KURUM LOGOSU</div>`;

    const adSoyadMetin = ozelOgrenci
      ? `<strong>${C.kacisHTML(ozelOgrenci.adSoyad)}</strong>`
      : '....................................................';
    const ogrNoMetin = ozelOgrenci
      ? `<strong>${C.kacisHTML(ozelOgrenci.ogrNo)}</strong> (${C.kacisHTML(ozelOgrenci.ozelKod || grupHarfi)})`
      : '....................................';
    const grupKutuMetin = ozelOgrenci
      ? `${C.kacisHTML(ozelOgrenci.ozelKod || grupHarfi)} (${grupHarfi})`
      : `GRUP: ${grupHarfi}`;
    const oqv2KutuHTML = uretKagitSifreliQrHTML(yapi, grupHarfi, ozelOgrenci);

    // Özel Banner / Hazır PDF Form Modu (Okulun kendi PDF/Resim anteti tam genişlikte; mükerrer isim/ders satırı basılmaz!)
    if (yapi.kaliteFormTipi === 'ozel-banner' && durum.kaliteGorselDataUrl) {
      const ekKimlikSatir = (yapi.mukerrerGizleModu === 'tam-gizle' && !ozelOgrenci)
        ? (oqv2KutuHTML ? `<div style="display:flex; justify-content:flex-end; margin-top:2px;">${oqv2KutuHTML}</div>` : '')
        : `
          <div class="ogrenci-kimlik-serit" style="border-top:1px solid #000; padding-top:3px; margin-top:2px; display:flex; align-items:center; justify-content:space-between; gap:6px;">
            <div class="ogrenci-kimlik-hucre">Adı Soyadı: ${adSoyadMetin}</div>
            <div class="ogrenci-kimlik-hucre">Öğrenci No: ${ogrNoMetin}</div>
            <div class="ogrenci-kimlik-hucre">İmza: ....................</div>
            ${oqv2KutuHTML}
          </div>
        `;
      return `
        <div style="border:1.5px solid #000; padding:3px; margin-bottom:5px; background:#fff;">
          <img src="${C.guvenliURL(durum.kaliteGorselDataUrl)}" alt="Okul Standart Form Anteti" style="width:100%; max-height:32mm; object-fit:contain; display:block;" />
          ${ekKimlikSatir}
        </div>
      `;
    }

    // ISO 9001 / YÖKAK veya MÜDEK Akreditasyon Kalite Formu
    if (yapi.kaliteFormTipi === 'iso9001' || yapi.kaliteFormTipi === 'mudek') {
      const mudekTabloHTML = yapi.kaliteFormTipi === 'mudek'
        ? `
          <table class="mudek-puan-tablo">
            <thead>
              <tr>
                <th>Değerlendirme Bölümü</th>
                ${yapi.dySayisi > 0 ? `<th>Bölüm 1: D/Y (${yapi.dyToplamPuan}p · ÖÇ-1)</th>` : ''}
                ${yapi.testSayisi > 0 ? `<th>Bölüm 2: Test (${yapi.testToplamPuan}p · ÖÇ-2,3)</th>` : ''}
                ${Array.from({ length: yapi.klasikSayisi }, (_, i) => `<th>Klasik-${i + 1} (${(yapi.klasikSoruPuanlari && yapi.klasikSoruPuanlari[i]) || yapi.klasikSoruPuan}p · ÖÇ-${i + 4})</th>`).join('')}
                <th>TOPLAM (${yapi.toplamPuan}p)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Alınan Puan</strong></td>
                ${yapi.dySayisi > 0 ? '<td></td>' : ''}
                ${yapi.testSayisi > 0 ? '<td></td>' : ''}
                ${Array.from({ length: yapi.klasikSayisi }, () => '<td></td>').join('')}
                <td><strong></strong></td>
              </tr>
            </tbody>
          </table>
        `
        : '';

      return `
        <table class="kalite-iso-tablo">
          <tr>
            <td class="kalite-logo-hucre" rowspan="2">${logoHTML}</td>
            <td class="kalite-baslik-hucre">
              <h2>${C.kacisHTML(yapi.kurum)}</h2>
              <p>${C.kacisHTML(yapi.ders.bolum || '')} — ${ozelOgrenci ? 'ÖĞRENCİYE ÖZEL SINAV DEĞERLENDİRME FORMU' : `RESMİ SINAV DEĞERLENDİRME FORMU (${grupHarfi} GRUBU)`}</p>
            </td>
            <td class="kalite-kunye-hucre" rowspan="2">
              <table class="kalite-kunye-ic-tablo">
                <tr><td><strong>Doküman No:</strong></td><td>${C.kacisHTML(yapi.kaliteDokumanNo)}</td></tr>
                <tr><td><strong>İlk Yayın:</strong></td><td>${C.kacisHTML(yapi.kaliteYayinTarihi)}</td></tr>
                <tr><td><strong>Revizyon:</strong></td><td>${C.kacisHTML(yapi.kaliteRevizyon)}</td></tr>
                <tr><td><strong>Sayfa No:</strong></td><td>Sayfa 1 / 2</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="font-size:7.5pt; padding:2px 6px;">
              <strong>Ders:</strong> ${C.kacisHTML(yapi.ders.kod)} - ${C.kacisHTML(yapi.ders.ad)} ·
              <strong>Sınav:</strong> ${C.kacisHTML(yapi.sinavAd)} ·
              <strong>Tarih/Süre:</strong> ${C.kacisHTML(yapi.tarih)} (${C.kacisHTML(yapi.sure)}) ·
              <strong>Sorumlu:</strong> ${C.kacisHTML(yapi.hoca)}
            </td>
          </tr>
          <tr>
            <td colspan="3" style="padding:3px 6px; font-size:7.8pt;">
              <div style="display:grid; grid-template-columns: 1.3fr 1fr 0.7fr auto auto; gap:6px; align-items:center;">
                <span><strong>Öğrenci Adı Soyadı:</strong> ${adSoyadMetin}</span>
                <span><strong>Öğrenci No:</strong> ${ogrNoMetin}</span>
                <span><strong>İmza:</strong> ..................</span>
                <span style="border:1.5px solid #000; padding:0 5px; font-weight:900;">${grupKutuMetin}</span>
                ${oqv2KutuHTML}
              </div>
            </td>
          </tr>
        </table>
        ${mudekTabloHTML}
      `;
    }

    // MEB TKY / Zümre Standart Yazılı Sınav Kağıdı Formu
    if (yapi.kaliteFormTipi === 'meb') {
      return `
        <table class="kalite-iso-tablo">
          <tr>
            <td class="kalite-logo-hucre">${logoHTML}</td>
            <td class="kalite-baslik-hucre">
              <h2>${C.kacisHTML(yapi.kurum)}</h2>
              <p>${C.kacisHTML(yapi.ders.ad)} DERSİ ${C.kacisHTML(yapi.sinavAd)} SORU VE CEVAP KAĞIDI (${ozelOgrenci ? C.kacisHTML(ozelOgrenci.ozelKod) : `${grupHarfi} GRUBU`})</p>
              <div style="font-size:7.3pt; margin-top:2px;">
                Tarih: ${C.kacisHTML(yapi.tarih)} · Süre: ${C.kacisHTML(yapi.sure)} · Form Kodu: ${C.kacisHTML(yapi.kaliteDokumanNo)}
              </div>
            </td>
            <td style="width:42mm; text-align:center; font-size:7.5pt;">
              <div style="font-weight:900; border-bottom:1px solid #000; padding-bottom:2px; margin-bottom:3px;">ALDIĞI NOT</div>
              <div style="height:18px;">Rakamla: ...............</div>
              <div>Yazıyla: .................</div>
            </td>
          </tr>
          <tr>
            <td colspan="3" style="padding:3px 6px; font-size:7.8pt;">
              <div style="display:grid; grid-template-columns: 1.3fr 0.9fr 0.7fr auto; gap:6px; align-items:center;">
                <span><strong>Adı ve Soyadı:</strong> ${adSoyadMetin}</span>
                <span><strong>Sınıfı / Okul No:</strong> ${ogrNoMetin}</span>
                <span><strong>İmza:</strong> ......................</span>
                ${oqv2KutuHTML}
              </div>
            </td>
          </tr>
        </table>
      `;
    }

    // Standart Kompakt Antet
    return `
      <div class="kagit-antet">
        <div class="kagit-antet-sol">
          <h2>${C.kacisHTML(yapi.kurum)}</h2>
          <p>${C.kacisHTML(yapi.ders.kod)} — ${C.kacisHTML(yapi.ders.ad)} | ${C.kacisHTML(yapi.sinavAd)}</p>
          <p style="font-size:7.6pt; color:#333;">Tarih: ${C.kacisHTML(yapi.tarih)} · Süre: ${C.kacisHTML(yapi.sure)} · ${C.kacisHTML(yapi.hoca)} · Toplam: ${yapi.toplamPuan} Puan</p>
        </div>
        <div class="kagit-antet-sag">
          ${oqv2KutuHTML}
          <div class="kitapcik-rozet-kutu">
            <span class="grup-etiket">${ozelOgrenci ? C.kacisHTML(ozelOgrenci.ozelKod) : 'KİTAPÇIK'}</span>
            <span class="grup-harf">${grupHarfi}</span>
          </div>
        </div>
        <div class="ogrenci-kimlik-serit">
          <div class="ogrenci-kimlik-hucre">Adı Soyadı: ${adSoyadMetin}</div>
          <div class="ogrenci-kimlik-hucre">Öğrenci No: ${ogrNoMetin}</div>
          <div class="ogrenci-kimlik-hucre">İmza: ..........................</div>
        </div>
      </div>
    `;
  }

  /* 1 A4 Yaprak (Sayfa 1/2 Ön Yüz + Sayfa 2/2 Arka Yüz) Sınav Kağıdı Üretici */
  function uretTamSinavKagidiHTML(yapi, grupHarfi = 'A', ozelOgrenci = null) {
    const aktifGrup = (ozelOgrenci && ozelOgrenci.grupHarfi) ? ozelOgrenci.grupHarfi : grupHarfi;
    const varyasyon = (ozelOgrenci && ozelOgrenci.varyasyon)
      ? ozelOgrenci.varyasyon
      : (yapi.kitapciklar[aktifGrup] || yapi.kitapciklar.A);
    const antetHTML = uretStandartKaliteAntetHTML(yapi, aktifGrup, ozelOgrenci);

    const optikHTML = yapi.optikYerlesim === 'birlesik'
      ? uretKanonikOptikFormHTML(yapi, aktifGrup, false, false, ozelOgrenci)
      : `<div class="kagit-kodlama-ornek-serit" style="border:1px dashed #222; padding:3px 8px; margin-bottom:5px; font-size:7.4pt; font-weight:700; text-align:center; background:#f8fafc;">
           ℹ️ Cevaplarınızı size verilen <strong>AYRI OPTİK CEVAP FORMUNA (${aktifGrup} Kitapçığı)</strong> işaretleyiniz.
           <span style="margin-left:6px; color:#15803d;">DOĞRU KODLAMA: ● Tam Dolu</span> |
           <span style="color:#b91c1c;">YANLIŞ: ✗ Çarpı · ✓ Tik · ◐ Yarım · ⊙ Nokta/Silik</span> |
           <span>Örn. No Sonu ...07 → Onlar:(0)● Birler:(7)●</span>
         </div>`;

    const ocGorunumModu = yapi.kagitOcGorunum || 'kapali';
    let sayfaBasiOcHTML = '';
    if (ocGorunumModu === 'sayfa_basi' || ocGorunumModu === 'ikisi_birden') {
      const kayitliOcler = Array.isArray(yapi.dersOgrenimCiktilari) && yapi.dersOgrenimCiktilari.length > 0
        ? yapi.dersOgrenimCiktilari
        : ((yapi.belirtkeTablosu && Array.isArray(yapi.belirtkeTablosu.ocSatirlar) ? yapi.belirtkeTablosu.ocSatirlar : [])
            .map((o) => ({ kod: o.ocKodu, aciklama: (o.aciklamalar || []).join(', ') || `${o.ocKodu} Öğrenim Çıktısı` })));
      if (kayitliOcler.length > 0) {
        const ocMaddelerHTML = kayitliOcler
          .map((m) => `<div style="padding:1px 4px;"><strong>${C.kacisHTML(m.kod)}:</strong> ${C.kacisHTML(m.aciklama)}</div>`)
          .join('');
        sayfaBasiOcHTML = `
          <div class="kagit-sayfa-basi-oc-kutu" style="border:1px solid #000; padding:3px 6px; margin-bottom:4px; background:#f8fafc; font-size:7pt; line-height:1.28;">
            <div style="font-weight:800; border-bottom:0.6px solid #000; padding-bottom:1px; margin-bottom:2px;">
              🎯 DERSİN BOLOGNA ÖĞRENİM ÇIKTILARI (ÖÇ) KAPSAMI
            </div>
            <div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:1px 8px;">
              ${ocMaddelerHTML}
            </div>
          </div>
        `;
      }
    }

    // Tüm soru bloklarını ağırlıklarıyla sırala ve Sayfa 1 ile Sayfa 2'ye dengeli dağıt
    const bloklar = [];

    if (varyasyon.dy.length > 0) {
      bloklar.push({
        agirlik: 1.2,
        html: `<div class="bolum-baslik-serit">BÖLÜM 1: DOĞRU / YANLIŞ SORULARI (Toplam ${yapi.dyToplamPuan} Puan · ${varyasyon.dy.length} Soru × ${yapi.dySoruPuan}p)</div>`
      });
      for (const s of varyasyon.dy) {
        const dyUzunlukEk = Math.max(0, (String(s.metin || '').length - 75) / 65);
        bloklar.push({
          agirlik: Number((1.1 + dyUzunlukEk).toFixed(2)),
          html: uretSoruBlokHTML(s, 'dy', yapi.dySoruPuan, ocGorunumModu)
        });
      }
    }

    if (varyasyon.test.length > 0) {
      bloklar.push({
        agirlik: 1.3,
        html: `<div class="bolum-baslik-serit">BÖLÜM 2: ÇOKTAN SEÇMELİ TEST SORULARI (Toplam ${yapi.testToplamPuan} Puan · ${varyasyon.test.length} Soru × ${yapi.testSoruPuan}p)</div>`
      });
      for (const s of varyasyon.test) {
        const sikToplamKarakter = (s.siklar || []).reduce((t, sk) => t + String(sk || '').length, 0);
        const testUzunlukEk = Math.max(0, (String(s.metin || '').length + sikToplamKarakter - 140) / 85);
        bloklar.push({
          agirlik: Number((2.8 + testUzunlukEk).toFixed(2)),
          html: uretSoruBlokHTML(s, 'test', yapi.testSoruPuan, ocGorunumModu)
        });
      }
    }

    if (varyasyon.klasik.length > 0) {
      const klasikBaslikDetay = yapi.klasikPuanModu === 'tek_tek'
        ? `Toplam ${yapi.klasikToplamPuan} Puan · Soru Puanları: ${yapi.klasikSoruPuanlari.map((p, i) => `K${i + 1}=${p}p`).join(', ')}`
        : `Toplam ${yapi.klasikToplamPuan} Puan · ${varyasyon.klasik.length} Soru × ${yapi.klasikSoruPuan}p`;
      bloklar.push({
        agirlik: 1.3,
        zorunluSayfa2: true,
        html: `<div class="bolum-baslik-serit">BÖLÜM 3: AÇIK UÇLU / KLASİK SORULAR (${klasikBaslikDetay})</div>`
      });
      for (let kIdx = 0; kIdx < varyasyon.klasik.length; kIdx++) {
        const s = varyasyon.klasik[kIdx];
        const buKlasikPuan = (Array.isArray(yapi.klasikSoruPuanlari) && yapi.klasikSoruPuanlari[kIdx] !== undefined)
          ? yapi.klasikSoruPuanlari[kIdx]
          : yapi.klasikSoruPuan;
        bloklar.push({
          agirlik: 4.5,
          zorunluSayfa2: true,
          html: uretSoruBlokHTML(s, 'klasik', buKlasikPuan, ocGorunumModu)
        });
      }
    }

    // Sayfa 1'de antet ve optik form olduğu için Sayfa 1 soru kapasitesi toplam ağırlığın ~%44'ü, Sayfa 2 ~%56'sıdır
    // Klasik sorular (zorunluSayfa2) her zaman 2. sayfanın (arka yüzün) altında yer alır; puan barı ise 1. sayfadaki ana optik kutudadır.
    const toplamAgirlik = bloklar.reduce((t, b) => t + b.agirlik, 0);
    const sayfa1Oran = yapi.optikYerlesim === 'birlesik' ? 0.43 : 0.52;
    const sayfa1HedefAgirlik = toplamAgirlik * sayfa1Oran;

    const sayfa1Bloklar = [];
    const sayfa2Bloklar = [];
    let biriken = 0;

    for (let i = 0; i < bloklar.length; i++) {
      const b = bloklar[i];
      const bolumBasligiMi = b.html.includes('bolum-baslik-serit');
      if (!b.zorunluSayfa2 && biriken < sayfa1HedefAgirlik && !(bolumBasligiMi && biriken + 3.5 > sayfa1HedefAgirlik)) {
        sayfa1Bloklar.push(b.html);
        biriken += b.agirlik;
      } else {
        sayfa2Bloklar.push(b.html);
      }
    }

    const ispatMuhurEtiketi = ozelOgrenci && ozelOgrenci.ispatKaydi && ozelOgrenci.ispatKaydi.ispatMuhurKodu
      ? ` · 🛡️ İspat: ${C.kacisHTML(ozelOgrenci.ispatKaydi.ispatMuhurKodu)}`
      : '';
    const sayfaEtiketEk = ozelOgrenci
      ? `👤 ${C.kacisHTML(ozelOgrenci.adSoyad)} (${C.kacisHTML(ozelOgrenci.ogrNo)} · ${C.kacisHTML(ozelOgrenci.ozelKod || aktifGrup)}${ispatMuhurEtiketi})`
      : `${aktifGrup} GRUBU`;

    const sayfa1HTML = `
      <div class="a4-sayfa">
        <div class="a4-sayfa-etiket">SAYFA 1 / 2 (ÖN YÜZ) — ${sayfaEtiketEk}</div>
        ${antetHTML}
        ${sayfaBasiOcHTML}
        ${optikHTML}
        <div class="sorular-govde">
          ${sayfa1Bloklar.join('')}
        </div>
      </div>
    `;

    const kunyeGosterilsinMi = (yapi.kaliteFormTipi === 'iso9001' || yapi.kaliteFormTipi === 'mudek') && Boolean(yapi.kaliteDokumanNo);
    const altKunyeMetni = kunyeGosterilsinMi
      ? `Doküman No: ${C.kacisHTML(yapi.kaliteDokumanNo)}${yapi.kaliteRevizyon ? ` · ${C.kacisHTML(yapi.kaliteRevizyon)}` : ''}`
      : `${C.kacisHTML(yapi.ders.kod)} · ${C.kacisHTML(aktifGrup)} Kitapçığı · Süre: ${C.kacisHTML(yapi.sure)}`;
    const sayfa2UstSagMetni = ozelOgrenci
      ? `👤 ${C.kacisHTML(ozelOgrenci.adSoyad)} (${C.kacisHTML(ozelOgrenci.ogrNo)} · ${C.kacisHTML(ozelOgrenci.ozelKod)})`
      : (kunyeGosterilsinMi
        ? `Doküman: ${C.kacisHTML(yapi.kaliteDokumanNo)} · ${aktifGrup} KİTAPÇIĞI`
        : `${aktifGrup} KİTAPÇIĞI · Süre: ${C.kacisHTML(yapi.sure)}`);

    const kaliteAltBilgiHTML = (yapi.kaliteFormTipi === 'ozel-banner' && durum.kaliteAltBilgiDataUrl)
      ? `
        <div style="border-top:1px solid #000; padding-top:2px; margin-top:4px; background:#fff;">
          <img src="${C.guvenliURL(durum.kaliteAltBilgiDataUrl)}" alt="Kalite Formu Alt İmza Şeridi" style="width:100%; max-height:20mm; object-fit:contain; display:block;" />
        </div>
      `
      : (yapi.kaliteFormTipi === 'meb'
        ? `
          <div class="kalite-alt-onay-serit">
            <div><strong>Ders Öğretmeni</strong><br/>${C.kacisHTML(yapi.hoca)}<br/>İmza: ................</div>
            <div><strong>Zümre / Bölüm Başkanı</strong><br/>Kontrol Edilmiştir<br/>İmza: ................</div>
            <div><strong>Okul Müdürü / Dekan</strong><br/>Uygundur (${C.kacisHTML(yapi.tarih)})<br/>İmza / Mühür</div>
          </div>
        `
        : `
          <div style="border-top:1px solid #000; padding-top:3px; margin-top:5px; display:flex; justify-content:space-between; font-size:7.2pt; font-weight:700;">
            <span>${altKunyeMetni}</span>
            <span>— SINAV BİTTİ · CEVAPLARINIZI VE OPTİK KODLAMANIZI KONTROL EDİNİZ —</span>
            <span>Sayfa 2 / 2</span>
          </div>
        `);

    const sayfa2HTML = sayfa2Bloklar.length > 0
      ? `
        <div class="a4-sayfa">
          <div class="a4-sayfa-etiket">SAYFA 2 / 2 (ARKA YÜZ) — ${sayfaEtiketEk}</div>
          <div style="border-bottom:1.5px solid #000; padding-bottom:3px; margin-bottom:6px; display:flex; justify-content:space-between; font-size:8pt; font-weight:700;">
            <span>${C.kacisHTML(yapi.ders.kod)} - ${C.kacisHTML(yapi.ders.ad)} (${C.kacisHTML(yapi.sinavAd)})</span>
            <span>${sayfa2UstSagMetni} — ARKA YÜZ (SAYFA 2/2)</span>
          </div>
          <div class="sorular-govde">
            ${sayfa2Bloklar.join('')}
          </div>
          ${kaliteAltBilgiHTML}
        </div>
      `
      : '';

    return sayfa1HTML + sayfa2HTML;
  }

  /* Ayrı Optik Cevap Kağıdı Üretici (1 A4'e 1, 2 veya 4 Adet Kesilebilir Form) */
  function uretAyriOptikSayfaHTML(yapi) {
    const adet = yapi.ayriOptikAdet || 2;
    const gruplar = ['A', 'B', 'C', 'D'];

    const uretTekKart = (gHarf) => {
      const oqv2HTML = uretKagitSifreliQrHTML(yapi, gHarf, null);
      return `
        <div style="border:1px solid #222; padding:6px; border-radius:4px; background:#fff;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; font-size:7.8pt; font-weight:700; margin-bottom:4px; border-bottom:1px dotted #444; padding-bottom:3px;">
            <span>Ad Soyad: ........................................</span>
            <span>Öğr. No: ......................</span>
            <span>İmza: .............</span>
            ${oqv2HTML}
          </div>
          ${uretKanonikOptikFormHTML(yapi, gHarf, true, true)}
        </div>
      `;
    };

    if (adet === 1) {
      return `
        <div class="a4-sayfa">
          <div class="a4-sayfa-etiket">AYRI OPTİK CEVAP FORMU (1 A4 TAM BOY)</div>
          ${uretTekKart('A')}
        </div>
      `;
    }

    if (adet === 4) {
      return `
        <div class="a4-sayfa">
          <div class="a4-sayfa-etiket">AYRI OPTİK CEVAP FORMU (1 A4'E 4 ADET KESİLEBİLİR)</div>
          <div class="ayri-optik-izgara-4">
            ${gruplar.map((g) => uretTekKart(g)).join('')}
          </div>
        </div>
      `;
    }

    // Varsayılan: 1 A4'e 2 Adet (Yarım Sayfa A5 Kesilebilir)
    return `
      <div class="a4-sayfa">
        <div class="a4-sayfa-etiket">AYRI OPTİK CEVAP FORMU (1 A4'E 2 ADET A5 KESİLEBİLİR)</div>
        <div class="ayri-optik-izgara-2">
          ${uretTekKart('A')}
          <div class="kesim-cizgisi">✂️ — — — — — — BURADAN KESİNİZ (A5 OPTİK CEVAP KAĞIDI) — — — — — — ✂️</div>
          ${uretTekKart('B')}
        </div>
      </div>
    `;
  }

  /* A/B/C/D Simetrik 2 Sütunlu Cevap Anahtarı Üretici */
  function uretSimetrikCevapAnahtariHTML(yapi) {
    const aktifGruplar = yapi.kitapcikGruplar === 'A'
      ? ['A']
      : (yapi.kitapcikGruplar === 'AB' ? ['A', 'B'] : ['A', 'B', 'C', 'D']);

    const grupKutulari = aktifGruplar
      .map((g) => {
        const anahtar = yapi.cevapAnahtarlari[g];
        const dySatirlar = anahtar.dy
          .map((cev, idx) => `<div style="padding:2px 4px; border-bottom:0.5px solid #ddd;"><strong>${idx + 1}.</strong> ${cev === 'D' ? 'Doğru (D)' : 'Yanlış (Y)'}</div>`)
          .join('');
        const testSatirlar = anahtar.test
          .map((cev, idx) => {
            const det = (anahtar.testDetay && anahtar.testDetay[idx]) || null;
            const tasimaOk = det && det.orijinalDogruHarf && det.orijinalDogruHarf !== cev
              ? ` <span style="font-size:6.6pt; color:#444;">(${det.orijinalDogruHarf}→${cev}: ${C.kacisHTML(String(det.dogruSikDegeri).slice(0, 18))})</span>`
              : (det && det.dogruSikDegeri ? ` <span style="font-size:6.6pt; color:#444;">(${C.kacisHTML(String(det.dogruSikDegeri).slice(0, 18))})</span>` : '');
            return `<div style="padding:2px 4px; border-bottom:0.5px solid #ddd;"><strong>${idx + 1}.</strong> <strong>${cev}</strong>${tasimaOk}</div>`;
          })
          .join('');
        const klasikSatirlar = anahtar.klasik
          .map((rub, idx) => {
            const p = (yapi.klasikSoruPuanlari && yapi.klasikSoruPuanlari[idx] !== undefined) ? yapi.klasikSoruPuanlari[idx] : yapi.klasikSoruPuan;
            return `<div style="padding:3px 4px; border-bottom:0.5px solid #ddd; font-size:7.2pt;"><strong>K${idx + 1} (${p} Puan):</strong> ${C.kacisHTML(rub)}</div>`;
          })
          .join('');

        return `
          <div style="border:1.5px solid #000; padding:8px; border-radius:4px;">
            <div style="background:#111; color:#fff; font-weight:800; padding:4px 8px; text-align:center; font-size:10pt; margin-bottom:6px; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
              🔑 ${g} KİTAPÇIĞI CEVAP ANAHTARI
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-family:var(--font-mono); font-size:8pt;">
              <div>
                <div style="font-weight:800; border-bottom:1px solid #000; margin-bottom:3px;">BÖLÜM 1: DOĞRU/YANLIŞ</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:2px;">${dySatirlar || 'Yok'}</div>
              </div>
              <div>
                <div style="font-weight:800; border-bottom:1px solid #000; margin-bottom:3px;">BÖLÜM 2: ÇOKTAN SEÇMELİ</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:2px;">${testSatirlar || 'Yok'}</div>
              </div>
            </div>
            ${klasikSatirlar ? `<div style="margin-top:6px; border-top:1px solid #000; padding-top:4px;"><div style="font-weight:800; font-size:7.8pt;">BÖLÜM 3: KLASİK DEĞERLENDİRME RUBRİĞİ</div>${klasikSatirlar}</div>` : ''}
          </div>
        `;
      })
      .join('');

    const belirtke = yapi.belirtkeTablosu;
    const belirtkeSatirlarHTML = (belirtke && Array.isArray(belirtke.aktifSatirlar) ? belirtke.aktifSatirlar : [])
      .map((st) => `
        <tr>
          <td style="border:1px solid #000; padding:2px 4px; font-weight:700;">${st.hafta}. Hafta</td>
          <td style="border:1px solid #000; padding:2px 4px;">${st.dy} D/Y · ${st.test} Test · ${st.klasik} Klasik (Top: ${st.toplamSoru})</td>
          <td style="border:1px solid #000; padding:2px 4px;">Kolay:${st.kolay} · Orta:${st.orta} · Zor:${st.zor}</td>
          <td style="border:1px solid #000; padding:2px 4px;">${C.kacisHTML((st.ocKodlari || st.kazanimlar || []).join(', '))}</td>
          <td style="border:1px solid #000; padding:2px 4px; font-weight:700;">${st.toplamPuan} Puan (%${st.puanYuzde})</td>
        </tr>
      `)
      .join('');

    const ocMatrisSatirlar = (belirtke && Array.isArray(belirtke.ocSatirlar) && belirtke.ocSatirlar.length > 0)
      ? belirtke.ocSatirlar
      : (belirtke && Array.isArray(belirtke.aktifOcSatirlar) ? belirtke.aktifOcSatirlar : []);

    const ocMatrisSatirlarHTML = ocMatrisSatirlar
      .map((oc) => `
        <tr>
          <td style="border:1px solid #000; padding:2px 4px; font-weight:700;">${C.kacisHTML(oc.ocKodu)}</td>
          <td style="border:1px solid #000; padding:2px 4px;">${oc.dy} D/Y · ${oc.test} Test · ${oc.klasik} Klasik (Top: ${oc.toplamSoru})</td>
          <td style="border:1px solid #000; padding:2px 4px;">${(oc.haftalar || []).map((h) => `${h}.H`).join(', ') || '-'}</td>
          <td style="border:1px solid #000; padding:2px 4px;">${C.kacisHTML((oc.aciklamalar || []).join(', ') || oc.ocKodu)}</td>
          <td style="border:1px solid #000; padding:2px 4px; font-weight:700;">${oc.toplamPuan} Puan (%${oc.puanYuzde})</td>
        </tr>
      `)
      .join('');

    const ocMatrisTabloHTML = ocMatrisSatirlarHTML
      ? `
        <div style="margin-top:8px; border:1.5px solid #000; padding:6px;">
          <div style="font-weight:800; font-size:8.3pt; margin-bottom:4px;">
            🎯 BOLOGNA ÖĞRENİM ÇIKTISI (ÖÇ) KAPSAMA VE PUAN MATRİSİ (HER ÖÇ İÇİN EN AZ 1 SORU KANITI)
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:7.1pt;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="border:1px solid #000; padding:2px 4px; text-align:left;">Bologna ÖÇ</th>
                <th style="border:1px solid #000; padding:2px 4px; text-align:left;">Soru Türü &amp; Sayısı</th>
                <th style="border:1px solid #000; padding:2px 4px; text-align:left;">İlgili Haftalar</th>
                <th style="border:1px solid #000; padding:2px 4px; text-align:left;">Kazanım Açıklaması</th>
                <th style="border:1px solid #000; padding:2px 4px; text-align:left;">Puan Payı</th>
              </tr>
            </thead>
            <tbody>${ocMatrisSatirlarHTML}</tbody>
          </table>
        </div>
      `
      : '';

    const belirtkeTabloHTML = belirtkeSatirlarHTML
      ? `
        <div style="margin-top:8px; border:1.5px solid #000; padding:6px;">
          <div style="font-weight:800; font-size:8.3pt; margin-bottom:4px;">
            📊 HAFTALIK SINAV BELİRTKE TABLOSU (HAFTA × KAZANIM/ÖÇ × SORU TÜRÜ × ZORLUK × PUAN DAĞILIMI)
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:7.1pt;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="border:1px solid #000; padding:2px 4px; text-align:left;">Hafta</th>
                <th style="border:1px solid #000; padding:2px 4px; text-align:left;">Soru Türü &amp; Sayısı</th>
                <th style="border:1px solid #000; padding:2px 4px; text-align:left;">Zorluk Dağılımı</th>
                <th style="border:1px solid #000; padding:2px 4px; text-align:left;">Kapsanan ÖÇ</th>
                <th style="border:1px solid #000; padding:2px 4px; text-align:left;">Puan Payı</th>
              </tr>
            </thead>
            <tbody>${belirtkeSatirlarHTML}</tbody>
          </table>
        </div>
      `
      : '';

    const masterQrHTML = uretCevapAnahtariMasterQrHTML(yapi);

    return `
      <div class="a4-sayfa">
        <div class="a4-sayfa-etiket">ÖĞRETMEN CEVAP ANAHTARI &amp; BELİRTKE TABLOSU — SİMETRİK A/B/C/D</div>
        <div style="border:1.5px solid #000; padding:6px 10px; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="flex:1; text-align:center;">
            <h2 style="font-size:11pt; margin:0;">${C.kacisHTML(yapi.kurum)}</h2>
            <p style="font-size:9pt; font-weight:700; margin:2px 0 0;">${C.kacisHTML(yapi.ders.kod)} - ${C.kacisHTML(yapi.ders.ad)} | ${C.kacisHTML(yapi.sinavAd)} — RESMİ CEVAP ANAHTARI</p>
            <div style="font-size:7pt; color:#333; margin-top:2px;">📱 Sağdaki QR kodu Cep OMR kamerasına göstererek sınav yapısını, A/B/C/D anahtarlarını ve şifreli kağıt anahtarını tek saniyede yükleyebilirsiniz.</div>
          </div>
          ${masterQrHTML}
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          ${grupKutulari}
        </div>
        ${ocMatrisTabloHTML}
        ${belirtkeTabloHTML}
      </div>
    `;
  }

  /* Öğrenciye Özel Soru Kağıtları İçin Kişi Bazlı Cevap Anahtarı ve İspat Kaydı Çizelgesi Üretici */
  function uretOgrenciyeOzelCevapAnahtariHTML(yapi) {
    const kagitlar = Object.values(yapi.ogrenciyeOzelKagitlar || {});
    const masterQrHTML = uretCevapAnahtariMasterQrHTML(yapi);
    const satirlarHTML = kagitlar
      .map((oz, idx) => {
        const dyDizisi = (oz.anahtar && oz.anahtar.dy ? oz.anahtar.dy : [])
          .map((c, i) => `${i + 1}:${c}`)
          .join(' ');
        const testDizisi = (oz.anahtar && oz.anahtar.testDetay ? oz.anahtar.testDetay : [])
          .map((d, i) => (d.orijinalDogruHarf && d.orijinalDogruHarf !== d.dogruHarf ? `${i + 1}:${d.dogruHarf}(${d.orijinalDogruHarf}→${d.dogruHarf})` : `${i + 1}:${d.dogruHarf}`))
          .join(' ');
        const ispatKodu = (oz.ispatKaydi && oz.ispatKaydi.ispatMuhurKodu) || '-';
        return `
          <tr>
            <td style="border:1px solid #000; padding:4px; text-align:center;">${idx + 1}</td>
            <td style="border:1px solid #000; padding:4px; font-family:var(--font-mono); font-weight:700;">${C.kacisHTML(oz.ogrNo)}</td>
            <td style="border:1px solid #000; padding:4px; font-weight:700;">${C.kacisHTML(oz.adSoyad)}</td>
            <td style="border:1px solid #000; padding:4px; text-align:center; font-family:var(--font-mono);">${C.kacisHTML(oz.ozelKod)} (${C.kacisHTML(oz.grupHarfi)})<div style="font-size:6.4pt; font-weight:800; color:#1e3a8a;">${C.kacisHTML(ispatKodu)}</div></td>
            <td style="border:1px solid #000; padding:4px; font-family:var(--font-mono); font-size:7.3pt;">${C.kacisHTML(dyDizisi || 'Yok')}</td>
            <td style="border:1px solid #000; padding:4px; font-family:var(--font-mono); font-size:7.3pt;">${C.kacisHTML(testDizisi || 'Yok')}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <div class="a4-sayfa">
        <div class="a4-sayfa-etiket">ÖĞRENCİYE ÖZEL CEVAP ANAHTARI &amp; İSPAT ÇİZELGESİ (${kagitlar.length} ÖĞRENCİ)</div>
        <div style="border:1.5px solid #000; padding:6px 10px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="flex:1; text-align:center;">
            <h2 style="font-size:11pt; margin:0;">${C.kacisHTML(yapi.kurum)}</h2>
            <p style="font-size:8.8pt; font-weight:700; margin:2px 0 0;">
              ${C.kacisHTML(yapi.ders.kod)} - ${C.kacisHTML(yapi.ders.ad)} | ${C.kacisHTML(yapi.sinavAd)} — ÖĞRENCİYE ÖZEL CEVAP ANAHTARI VE İSPAT TABLOSU
            </p>
            <div style="font-size:7.2pt; color:#333; margin-top:2px;">
              Mod: ${yapi.ogrenciSoruModu === 'abcd_dagitim' ? 'A/B/C/D Kitapçık Dağıtımı + İsme Özel Ön-Kodlu Optik' : 'Tam Kişiye Özel Soru/Şık Karıştırma + Deterministik İspat Mührü (#ISPAT-...)'}
            </div>
          </div>
          ${masterQrHTML}
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:7.8pt;">
          <thead>
            <tr style="background:#111; color:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
              <th style="border:1px solid #000; padding:4px;">#</th>
              <th style="border:1px solid #000; padding:4px;">Öğrenci No</th>
              <th style="border:1px solid #000; padding:4px;">Adı Soyadı</th>
              <th style="border:1px solid #000; padding:4px;">Özel Kod &amp; İspat Mührü</th>
              <th style="border:1px solid #000; padding:4px;">D/Y Doğru Anahtarı</th>
              <th style="border:1px solid #000; padding:4px;">Test Doğru Anahtarı (Orijinal→Taşınan)</th>
            </tr>
          </thead>
          <tbody>
            ${satirlarHTML}
          </tbody>
        </table>
      </div>
    `;
  }

  /* Seçilen Kapsama Göre Tam Baskı / PDF / Word HTML İçeriğini Üretir */
  function uretKapsamaGoreBaskiHTML(yapi, kapsam) {
    const dersKodTemiz = String(yapi.ders.kod || 'SINAV').replace(/[^A-Za-z0-9_-]/g, '');
    if (kapsam === 'sinif-tum-gruplar' || kapsam === 'kagit-ABCD') {
      const gruplar = yapi.kitapcikGruplar === 'A'
        ? ['A']
        : (yapi.kitapcikGruplar === 'AB' ? ['A', 'B'] : ['A', 'B', 'C', 'D']);
      return {
        html: gruplar.map((g) => uretTamSinavKagidiHTML(yapi, g)).join(''),
        dosyaAdiTabani: `${dersKodTemiz}_Sinif_Sinav_Kagidi_Tum_Gruplar_${gruplar.join('')}`
      };
    }

    if (kapsam === 'ogrenci-tek') {
      const seciliNo = yapi.seciliBaskiOgrenciNo || (durum.ogrenciler[0] && durum.ogrenciler[0].ogrNo);
      const ozelPaket = (typeof yapi.getirOgrenciOzelKagit === 'function' ? yapi.getirOgrenciOzelKagit(seciliNo) : null)
        || (yapi.ogrenciyeOzelKagitlar && yapi.ogrenciyeOzelKagitlar[seciliNo])
        || null;
      const adTemiz = ozelPaket ? String(ozelPaket.adSoyad).replace(/\s+/g, '_') : 'Ogrenci';
      return {
        html: uretTamSinavKagidiHTML(yapi, (ozelPaket && ozelPaket.grupHarfi) || 'A', ozelPaket),
        dosyaAdiTabani: `${dersKodTemiz}_Ogrenciye_Ozel_${seciliNo}_${adTemiz}`
      };
    }

    if (kapsam === 'ogrenci-tum-sinif') {
      const tumOzelKagitlar = aktifDersSalonYerlesimi().yerlesim.flatMap((k) => k.ogrenciler)
        .map((ogr) => {
          const oz = yapi.ogrenciyeOzelKagitlar && yapi.ogrenciyeOzelKagitlar[ogr.ogrNo];
          return uretTamSinavKagidiHTML(yapi, (oz && oz.grupHarfi) || 'A', oz);
        })
        .join('');
      return {
        html: tumOzelKagitlar + uretOgrenciyeOzelCevapAnahtariHTML(yapi),
        dosyaAdiTabani: `${dersKodTemiz}_Tum_Sinif_Ogrenciye_Ozel_Kagitlar_ve_Anahtar`
      };
    }

    if (kapsam === 'ogrenci-anahtar') {
      return {
        html: uretOgrenciyeOzelCevapAnahtariHTML(yapi),
        dosyaAdiTabani: `${dersKodTemiz}_Ogrenciye_Ozel_Cevap_Anahtari`
      };
    }

    if (kapsam === 'tutanak' || kapsam === 'yoklama' || kapsam === 'tutanak-yoklama') {
      const tb = okuTutanakBilgileri();
      const turEtiket = tb.sinavTuru.split(' ')[0].replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/g, '');
      const ad = { tutanak: 'Sinav_Durum_Tutanagi', yoklama: 'Sinav_Yoklama_Evraki', 'tutanak-yoklama': 'Sinav_Tutanagi_ve_Yoklama' }[kapsam];
      return {
        html: (() => {
          const yer = aktifDersSalonYerlesimi();
          const kayitlar = yer.yerlesim.length > 0 ? yer.yerlesim : [{ salon: { ad: tb.salon, gozetmenler: [] }, ogrenciler: [] }];
          return kayitlar
            .map((k) => (kapsam !== 'yoklama' ? uretSinavDurumTutanagiHTML(tb, { ...k.salon, ogrenciSayisi: k.ogrenciler.length }) : '')
              + (kapsam !== 'tutanak' ? uretSinavYoklamaEvrakiHTML(tb, k) : ''))
            .join('');
        })(),
        dosyaAdiTabani: `${dersKodTemiz}_${ad}_${turEtiket}`
      };
    }

    if (kapsam === 'ayri-optik') {
      return {
        html: uretAyriOptikSayfaHTML(yapi),
        dosyaAdiTabani: `${dersKodTemiz}_Ayri_Optik_Cevap_Formu`
      };
    }

    if (kapsam === 'anahtar') {
      return {
        html: uretSimetrikCevapAnahtariHTML(yapi) + uretOgrenciyeOzelCevapAnahtariHTML(yapi),
        dosyaAdiTabani: `${dersKodTemiz}_Cevap_Anahtari_ABCD_ve_Ogrenci_Ozel`
      };
    }

    // Varsayılan: Sınıf Sınav Kağıdı (Aktif Grup)
    const aktifGrup = yapi.onizlemeMod && yapi.onizlemeMod.startsWith('kagit-') && yapi.onizlemeMod !== 'kagit-ABCD'
      ? (yapi.onizlemeMod.split('-')[1] || 'A').toUpperCase()
      : 'A';
    return {
      html: uretTamSinavKagidiHTML(yapi, aktifGrup),
      dosyaAdiTabani: `${dersKodTemiz}_Sinif_Sinav_Kagidi_${aktifGrup}_Grubu`
    };
  }

  /* Çıktı Merkezi içindeki küçük önizleme: seçili belgenin ilk sayfaları (en çok 4) */
  let miniOnizlemeZamanlayici = null;
  function planlaBaskiMiniOnizleme(yapi) {
    clearTimeout(miniOnizlemeZamanlayici);
    miniOnizlemeZamanlayici = setTimeout(() => guncelleBaskiMiniOnizleme(yapi), 250);
  }

  function guncelleBaskiMiniOnizleme(yapi) {
    const kutu = document.getElementById('baski-mini-onizleme');
    if (!kutu) return;
    const kapsam = (document.getElementById('baski-kapsam-sec') || {}).value || 'sinif-aktif';
    let paket;
    try {
      paket = uretKapsamaGoreBaskiHTML(yapi, kapsam);
    } catch (err) {
      kutu.textContent = `Önizleme üretilemedi: ${err.message}`;
      return;
    }
    const gecici = document.createElement('div');
    gecici.style.cssText = 'position:fixed; left:-12000px; top:0; width:794px; background:#fff; z-index:-1;';
    gecici.innerHTML = paket.html;
    gecici.querySelectorAll('.soru-ekran-araclari').forEach((el) => el.remove());
    document.body.appendChild(gecici);
    try {
      dengeleVeSigdirA4Sayfalari(gecici);
      gecici.querySelectorAll('.a4-sayfa-etiket').forEach((el) => el.remove());
      const sayfalar = Array.from(gecici.querySelectorAll('.a4-sayfa'));
      kutu.innerHTML = sayfalar.length === 0
        ? '<span style="font-size:0.78rem; color:var(--metin-soluk);">Önizlenecek sayfa yok.</span>'
        : sayfalar.slice(0, 4).map((s, i) => `<div class="mini-sayfa-kutu" title="Sayfa ${i + 1}"><div class="mini-sayfa-ic">${s.outerHTML}</div><span class="mini-sayfa-no">${i + 1}</span></div>`).join('');
      const ozet = document.getElementById('etiket-baski-ozet');
      if (ozet) ozet.textContent = `${sayfalar.length} sayfa${sayfalar.length > 4 ? ' (ilk 4 gösteriliyor)' : ''} · ${paket.dosyaAdiTabani}`;
    } finally {
      gecici.remove();
    }
  }

  /* A4 Sayfa Taşma Önleyici ve Otomatik Sıkıştırma/Dengeleme Motoru:
     Uzun soru/şık metinlerinde .a4-sayfa yüksekliği (1123px) aşılırsa Sayfa 1 <-> Sayfa 2
     blok aktarımını ve kademeli tipografik sıkıştırmayı birlikte yürüterek
     scrollHeight <= clientHeight ve 1 A4 (Ön/Arka 2 sayfa) hedefini garanti altına alır. */
  function dengeleVeSigdirA4Sayfalari(kapsayiciEl, ekSecenekler = {}) {
    if (!kapsayiciEl) return;
    const ilkSayfalar = Array.from(kapsayiciEl.querySelectorAll('.a4-sayfa'));
    if (ilkSayfalar.length === 0) return;

    const ekSayfaChk = document.getElementById('ayar-ek-sayfa-izni');
    const ekSayfaIzni = ekSecenekler && ekSecenekler.ekSayfaIzni !== undefined
      ? Boolean(ekSecenekler.ekSayfaIzni)
      : Boolean((ekSayfaChk && ekSayfaChk.checked) || durum.ekSayfaIzni);

    const tasiyorMu = (sayfaEl) => {
      if (!sayfaEl) return false;
      if (sayfaEl.scrollHeight > sayfaEl.clientHeight + 1) return true;
      const g = sayfaEl.querySelector('.sorular-govde');
      if (g && g.scrollWidth > g.clientWidth + 2) return true;
      return false;
    };

    const kademeler = [
      { font: '8.5pt', lh: '1.18', mb: '3px', sikIkiSutun: false, optikMaxMm: '', pad: '' },
      { font: '8.1pt', lh: '1.14', mb: '2.4px', sikIkiSutun: false, optikMaxMm: '', pad: '' },
      { font: '7.6pt', lh: '1.10', mb: '1.8px', sikIkiSutun: true, optikMaxMm: '58mm', pad: '' },
      { font: '7.1pt', lh: '1.06', mb: '1.2px', sikIkiSutun: true, optikMaxMm: '52mm', pad: '5.5mm 6.5mm', klasikMinYuk: '15mm' },
      { font: '6.6pt', lh: '1.03', mb: '0.8px', sikIkiSutun: true, optikMaxMm: '48mm', pad: '4.5mm 6mm', klasikMinYuk: '13mm', antetSikistir: true },
      { font: '6.1pt', lh: '1.00', mb: '0.5px', sikIkiSutun: true, optikMaxMm: '44mm', pad: '4mm 5.5mm', klasikMinYuk: '11.5mm', antetSikistir: true },
      { font: '5.8pt', lh: '0.98', mb: '0.4px', sikIkiSutun: true, optikMaxMm: '40mm', pad: '3.5mm 5mm', klasikMinYuk: '10mm', antetSikistir: true },
      { font: '5.4pt', lh: '0.95', mb: '0.3px', sikIkiSutun: true, sikSatirIci: true, optikMaxMm: '36mm', pad: '3mm 4.2mm', colGap: '2.6mm', klasikMinYuk: '8.5mm', antetSikistir: true, ultraSikistir: true },
      { font: '5.0pt', lh: '0.93', mb: '0.25px', sikIkiSutun: true, sikSatirIci: true, optikMaxMm: '33mm', pad: '2.6mm 3.8mm', colGap: '2.2mm', klasikMinYuk: '7.5mm', antetSikistir: true, ultraSikistir: true },
      { font: '4.7pt', lh: '0.91', mb: '0.2px', sikIkiSutun: true, sikSatirIci: true, optikMaxMm: '31mm', pad: '2.3mm 3.4mm', colGap: '2mm', klasikMinYuk: '6.8mm', antetSikistir: true, ultraSikistir: true }
    ];

    const uygulaSayfaKademesi = (sayfaEl, k) => {
      if (!sayfaEl || !k) return;
      if (k.pad) {
        sayfaEl.style.setProperty('--sayfa-ic-bosluk', k.pad);
        sayfaEl.style.padding = k.pad;
      }
      if (k.antetSikistir) {
        const antet = sayfaEl.querySelector('.kagit-antet');
        if (antet) {
          antet.style.padding = k.ultraSikistir ? '1px 4px' : '2px 6px';
          antet.style.marginBottom = k.ultraSikistir ? '1.5px' : '3px';
          const h2 = antet.querySelector('h2');
          if (h2) h2.style.fontSize = k.ultraSikistir ? '8.2pt' : '9.2pt';
          antet.querySelectorAll('p').forEach((p) => { p.style.fontSize = k.ultraSikistir ? '6.6pt' : '7.3pt'; });
        }
        const kimlik = sayfaEl.querySelector('.ogrenci-kimlik-serit');
        if (kimlik) {
          kimlik.style.fontSize = k.ultraSikistir ? '6.5pt' : '7.2pt';
          kimlik.style.marginTop = k.ultraSikistir ? '1px' : '2px';
          kimlik.style.paddingTop = k.ultraSikistir ? '1px' : '2px';
        }
      }
      if (k.ultraSikistir) {
        const et = sayfaEl.querySelector('.a4-sayfa-etiket');
        if (et) {
          et.style.fontSize = '6.4pt';
          et.style.padding = '0.5px 4px';
          et.style.marginBottom = '1.5px';
        }
        const ocKutu = sayfaEl.querySelector('.kagit-sayfa-basi-oc-kutu');
        if (ocKutu) {
          ocKutu.style.fontSize = '6pt';
          ocKutu.style.padding = '1.5px 4px';
          ocKutu.style.marginBottom = '1.5px';
        }
      }
      const govde = sayfaEl.querySelector('.sorular-govde');
      if (!govde) return;
      govde.style.fontSize = k.font;
      govde.style.lineHeight = k.lh;
      govde.style.columnGap = k.colGap || '3.5mm';
      govde.querySelectorAll('.soru-kutu, .dy-soru-satir').forEach((el) => {
        el.style.marginBottom = k.mb;
        el.style.paddingBottom = k.ultraSikistir ? '0.3px' : '0.8px';
      });
      govde.querySelectorAll('.soru-kok').forEach((el) => {
        el.style.marginBottom = k.ultraSikistir ? '0.4px' : '1px';
      });
      govde.querySelectorAll('.bolum-baslik-serit').forEach((el) => {
        el.style.margin = k.ultraSikistir ? '0.8px 0' : '1.5px 0';
        el.style.padding = k.ultraSikistir ? '0.5px 3px' : '1px 4px';
        el.style.fontSize = k.font;
      });
      if (k.sikSatirIci || k.sikIkiSutun) {
        govde.querySelectorAll('.siklar-alt-alta, .siklar-iki-sutun').forEach((el) => {
          const sikMetinler = Array.from(el.querySelectorAll('.sik-oge')).map((o) => (o.textContent || '').trim());
          const enUzun = sikMetinler.reduce((m, s) => Math.max(m, Math.max(0, s.length - 3)), 0);
          const sembolVar = sikMetinler.some((s) => /[=<>+\-*/^_\\{}[\]|]|->|::/.test(s));
          if (k.sikSatirIci && enUzun <= 12 && !sembolVar) {
            el.style.display = 'flex';
            el.style.flexDirection = 'row';
            el.style.flexWrap = 'wrap';
            el.style.gap = '0px 5px';
          } else if ((k.sikSatirIci || k.sikIkiSutun) && enUzun <= 20 && !sembolVar) {
            el.style.display = 'grid';
            el.style.gridTemplateColumns = '1fr 1fr';
            el.style.gap = '0.5px 4px';
          } else {
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
            el.style.gap = '1px';
          }
        });
      }
      if (k.optikMaxMm) {
        const optikCer = sayfaEl.querySelector('.optik-cerceve');
        if (optikCer) {
          optikCer.style.marginBottom = k.ultraSikistir ? '1.5px' : '3px';
          if (k.ultraSikistir) optikCer.style.padding = '1.5px';
        }
        const optikSvg = sayfaEl.querySelector('.optik-cerceve svg, svg.optik-form-svg');
        if (optikSvg) {
          optikSvg.style.maxHeight = k.optikMaxMm;
          optikSvg.style.width = '100%';
        }
      }
      if (k.klasikMinYuk) {
        govde.querySelectorAll('.klasik-cevap-alan, .klasik-cevap-kutusu, .klasik-alan').forEach((el) => {
          el.style.minHeight = k.klasikMinYuk;
          el.style.height = k.klasikMinYuk;
          el.style.marginTop = k.ultraSikistir ? '0.8px' : '1.5px';
        });
      }
    };

    const dengeleCiftSayfa = (s1, s2) => {
      const govde1 = s1.querySelector('.sorular-govde');
      const govde2 = s2.querySelector('.sorular-govde');
      if (!govde1 || !govde2) return;
      s1.dataset.sayfaCifti = 'on';
      s2.dataset.sayfaCifti = 'arka';

      // s1 taşıyorsa son blokları s2'nin başına aktar
      let emniyet = 0;
      while (tasiyorMu(s1) && govde1.children.length > 1 && emniyet < 80) {
        emniyet++;
        const sonEl = govde1.lastElementChild;
        if (!sonEl) break;
        govde2.insertBefore(sonEl, govde2.firstChild);
        const yeniSon = govde1.lastElementChild;
        if (yeniSon && yeniSon.classList.contains('bolum-baslik-serit')) {
          govde2.insertBefore(yeniSon, govde2.firstChild);
        }
      }

      // s2 taşıyorsa ve s1 taşmıyorsa s2'nin başındaki (klasik olmayan) blokları s1'in sonuna geri al;
      // eğer ekleme sonrası s1 taşarsa son hareketi geri al ve dur (.a4-sayfa sabit 297mm olduğu için scrollHeight === clientHeight durumunu doğru ele alır!)
      let geriEmniyet = 0;
      while (tasiyorMu(s2) && !tasiyorMu(s1) && govde2.children.length > 1 && geriEmniyet < 80) {
        geriEmniyet++;
        const ilkEl = govde2.firstElementChild;
        if (!ilkEl) break;
        if (ilkEl.textContent && ilkEl.textContent.includes('BÖLÜM 3')) break;
        govde1.appendChild(ilkEl);
        if (ilkEl.classList.contains('bolum-baslik-serit') && govde2.firstElementChild) {
          const ikinciEl = govde2.firstElementChild;
          govde1.appendChild(ikinciEl);
          if (tasiyorMu(s1)) {
            govde2.insertBefore(ikinciEl, govde2.firstChild);
            govde2.insertBefore(ilkEl, govde2.firstChild);
            break;
          }
        } else if (tasiyorMu(s1)) {
          govde2.insertBefore(ilkEl, govde2.firstChild);
          break;
        }
      }
    };

    // 1. Adım: Çift sayfalı (Sayfa 1 + Sayfa 2) kitapçıkları birlikte dengele ve sıkıştır
    for (let i = 0; i < ilkSayfalar.length; i++) {
      const s1 = ilkSayfalar[i];
      const s2 = ilkSayfalar[i + 1];
      const etiket1 = (s1.querySelector('.a4-sayfa-etiket') || {}).textContent || '';
      const etiket2 = s2 ? ((s2.querySelector('.a4-sayfa-etiket') || {}).textContent || '') : '';
      if (s2 && etiket1.includes('SAYFA 1') && etiket2.includes('SAYFA 2')) {
        dengeleCiftSayfa(s1, s2);
        for (const k of kademeler) {
          if (!tasiyorMu(s1) && !tasiyorMu(s2)) break;
          uygulaSayfaKademesi(s1, k);
          uygulaSayfaKademesi(s2, k);
          dengeleCiftSayfa(s1, s2);
        }
        i++;
      } else if (tasiyorMu(s1)) {
        for (const k of kademeler) {
          if (!tasiyorMu(s1)) break;
          uygulaSayfaKademesi(s1, k);
        }
      }
    }

    // 2. Adım: Ek sayfa izni AÇIKSA taşan sayfalar için devam sayfası oluştur ve "Sayfa X / N" etiketlerini güncelle
    if (ekSayfaIzni) {
      let sIdx = 0;
      while (sIdx < 24) {
        const canliListe = kapsayiciEl.querySelectorAll('.a4-sayfa');
        if (sIdx >= canliListe.length) break;
        const sayfaEl = canliListe[sIdx++];
        if (!tasiyorMu(sayfaEl)) continue;
        const govde = sayfaEl.querySelector('.sorular-govde');
        if (!govde || govde.children.length <= 1) continue;

        const devamSayfa = document.createElement('div');
        devamSayfa.className = 'a4-sayfa';
        devamSayfa.dataset.sayfaCifti = 'devam';
        if (sayfaEl.style.padding) {
          devamSayfa.style.padding = sayfaEl.style.padding;
          devamSayfa.style.setProperty('--sayfa-ic-bosluk', sayfaEl.style.padding);
        }
        const hamEtiket = (sayfaEl.querySelector('.a4-sayfa-etiket') || {}).textContent || 'SAYFA 2 / 2';
        const mevcutEtiket = hamEtiket
          .replace(/\s*\((?:ARKA\s*YÜZ|ÖN\s*YÜZ|DEVAM\s*SAYFASI)\)/gi, '')
          .trim();
        devamSayfa.innerHTML = `
          <div class="a4-sayfa-etiket">${C.kacisHTML(mevcutEtiket)} (DEVAM SAYFASI)</div>
          <div class="sorular-govde" style="font-size:${govde.style.fontSize || '6.1pt'}; line-height:${govde.style.lineHeight || '1.00'}; column-gap:${govde.style.columnGap || '3.5mm'};"></div>
          <div style="border-top:1px solid #000; padding-top:3px; margin-top:5px; display:flex; justify-content:space-between; font-size:7.2pt; font-weight:700;">
            <span>EK DEVAM SAYFASI</span>
            <span>— SINAV BİTTİ · CEVAPLARINIZI KONTROL EDİNİZ —</span>
            <span>Sayfa 3 / 3</span>
          </div>
        `;
        const devamGovde = devamSayfa.querySelector('.sorular-govde');
        sayfaEl.insertAdjacentElement('afterend', devamSayfa);
        let koruma = 0;
        while (tasiyorMu(sayfaEl) && govde.children.length > 1 && koruma < 80) {
          koruma++;
          devamGovde.insertBefore(govde.lastElementChild, devamGovde.firstChild);
        }
      }

      // Kitapçık gruplarını (SAYFA 1'den bir sonraki SAYFA 1'e kadar) ayrı ayrı numaralandır ("Sayfa k / N")
      const tumSayfalar = Array.from(kapsayiciEl.querySelectorAll('.a4-sayfa'));
      let grupBaslangic = 0;
      while (grupBaslangic < tumSayfalar.length) {
        let grupBitis = grupBaslangic + 1;
        while (grupBitis < tumSayfalar.length) {
          const et = ((tumSayfalar[grupBitis].querySelector('.a4-sayfa-etiket') || {}).textContent || '');
          if (/SAYFA\s+1\s*\//i.test(et) && !et.includes('DEVAM')) break;
          grupBitis++;
        }
        const grupDilim = tumSayfalar.slice(grupBaslangic, grupBitis);
        if (grupDilim.length > 2) {
          const toplamN = grupDilim.length;
          grupDilim.forEach((sf, idx) => {
            const sayfaNo = idx + 1;
            const etEl = sf.querySelector('.a4-sayfa-etiket');
            if (etEl && /SAYFA\s+\d+\s*\/\s*\d+/i.test(etEl.textContent)) {
              etEl.textContent = etEl.textContent.replace(/SAYFA\s+\d+\s*\/\s*\d+/gi, `SAYFA ${sayfaNo} / ${toplamN}`);
            }
            sf.querySelectorAll('span, div').forEach((sp) => {
              if (sp.children.length === 0 && /Sayfa\s*\d+\s*\/\s*\d+/i.test(sp.textContent)) {
                sp.textContent = sp.textContent.replace(/Sayfa\s*\d+\s*\/\s*\d+/gi, `Sayfa ${sayfaNo} / ${toplamN}`);
              }
            });
          });
        }
        grupBaslangic = grupBitis;
      }
    }

    // 3. Adım: Kalan taşma durumunu denetle ve 1 A4 (Önlü-Arkalı) Kalkan Uyarısını senkronize et
    const kalanTasmaVar = Array.from(kapsayiciEl.querySelectorAll('.a4-sayfa')).some((sf) => tasiyorMu(sf));
    kapsayiciEl.dataset.tasmaVar = kalanTasmaVar ? '1' : '0';
    if (kapsayiciEl.id === 'a4-onizleme-sahne') {
      const tasmaKutu = document.getElementById('uyari-a4-tasma-kutu');
      if (tasmaKutu) {
        tasmaKutu.hidden = !kalanTasmaVar;
        tasmaKutu.style.display = kalanTasmaVar ? 'flex' : 'none';
      }
    }
  }

  /* Baskı Öncesi ÖÇ Kapsam & Bloom Bilişsel Denge Trafik Işığını Güncelle */
  function guncelleBaskiOncesiOcTrafikUI(yapi) {
    const cubuk = document.getElementById('trafik-oc-bloom-cubuk');
    const mesajEl = document.getElementById('etiket-oc-trafik-mesaj');
    const cipEl = document.getElementById('kutu-oc-trafik-cipler');
    if (!cubuk || !mesajEl || !cipEl || typeof C.hesaplaBaskiOncesiOcBloomDengesi !== 'function') return;

    const denge = C.hesaplaBaskiOncesiOcBloomDengesi(yapi.tumSeciliSorular || [], yapi.dersOgrenimCiktilari || []);
    cubuk.className = `oc-trafik-cubuk ${denge.trafikIsigi || 'yesil'} yazdir-gizle`;
    const ikon = denge.trafikIsigi === 'kirmizi' ? '🔴' : (denge.trafikIsigi === 'sari' ? '🟡' : '🟢');
    mesajEl.textContent = `${ikon} ${denge.mesaj} (Üst Düzey Bloom: %${denge.ustDuzeyBloomOrani})`;
    const ocCipler = Object.entries(denge.ocSayilari || {})
      .map(([kod, adet]) => `<span class="oc-cip" style="${adet === 0 ? 'color:#b91c1c; border-color:#fca5a5;' : ''}">${C.kacisHTML(kod)}: ${adet}</span>`)
      .join('');
    cipEl.innerHTML = ocCipler;
  }

  /* Ana Önizleme Sahnesini Güncelle */
  function guncelleA4Onizleme() {
    guncelleKayitliSinavlarCubuguUI();
    guncelleHaftaSecimIzgarasiUI();
    const yapi = okuAktifSinavYapisi();
    otomatikOlcekVeSayfaPlanla(yapi);
    guncelleCanliBelirtkeTablosuUI(yapi.belirtkeTablosu, yapi.ocKapsamaRaporu);
    guncelleBaskiOncesiOcTrafikUI(yapi);

    document.getElementById('rozet-secili-soru').textContent = `${yapi.toplamSoruSayisi} Soru`;
    const rozetToplam = document.getElementById('rozet-toplam-puan');
    if (rozetToplam) {
      rozetToplam.className = yapi.tam100Mu ? 'rozet rozet-yesil' : 'rozet rozet-kirmizi';
      rozetToplam.textContent = yapi.tam100Mu
        ? `🟢 Toplam: ${yapi.toplamPuan} / 100 Puan`
        : `⚠️ Toplam: ${yapi.toplamPuan} / 100 Puan`;
    }
    const uyari100Kutu = document.getElementById('uyari-toplam-100-kutu');
    const uyari100Metin = document.getElementById('uyari-toplam-100-metin');
    if (uyari100Kutu && uyari100Metin) {
      if (yapi.tam100Mu) {
        uyari100Kutu.style.display = 'none';
      } else {
        uyari100Kutu.style.display = 'flex';
        const fark = Number((100 - yapi.toplamPuan).toFixed(2));
        uyari100Metin.textContent = fark > 0
          ? `⚠️ Bölüm toplamları şu an ${yapi.toplamPuan} Puan (${fark} puan eksik). Sınav toplamı 100 olmalıdır.`
          : `⚠️ Bölüm toplamları şu an ${yapi.toplamPuan} Puan (${Math.abs(fark)} puan fazla). Sınav toplamı 100 olmalıdır.`;
      }
    }
    document.getElementById('etiket-omr-aktif-yapi').textContent = `${yapi.dySayisi} D/Y + ${yapi.testSayisi} Test + ${yapi.klasikSayisi} Klasik`;

    const sahne = document.getElementById('a4-onizleme-sahne');
    if (!sahne) return;

    const baskiKapsamiSecili = (document.getElementById('baski-kapsam-sec') || {}).value || '';
    if (['tutanak', 'yoklama', 'tutanak-yoklama'].includes(baskiKapsamiSecili)) {
      sahne.innerHTML = uretKapsamaGoreBaskiHTML(yapi, baskiKapsamiSecili).html;
    } else if (yapi.onizlemeMod === 'ayri-optik') {
      sahne.innerHTML = uretAyriOptikSayfaHTML(yapi);
    } else if (yapi.onizlemeMod === 'anahtar') {
      sahne.innerHTML = uretSimetrikCevapAnahtariHTML(yapi);
    } else if (yapi.onizlemeMod === 'ogrenci-anahtar') {
      sahne.innerHTML = uretOgrenciyeOzelCevapAnahtariHTML(yapi);
    } else if (yapi.onizlemeMod === 'kagit-ABCD') {
      sahne.innerHTML = uretKapsamaGoreBaskiHTML(yapi, 'sinif-tum-gruplar').html;
    } else if (yapi.onizlemeMod === 'ogrenci-tek') {
      sahne.innerHTML = uretKapsamaGoreBaskiHTML(yapi, 'ogrenci-tek').html;
    } else if (yapi.onizlemeMod === 'ogrenci-tum-sinif') {
      sahne.innerHTML = uretKapsamaGoreBaskiHTML(yapi, 'ogrenci-tum-sinif').html;
    } else {
      const grup = (yapi.onizlemeMod.split('-')[1] || 'A').toUpperCase();
      sahne.innerHTML = uretTamSinavKagidiHTML(yapi, grup);
    }

    dengeleVeSigdirA4Sayfalari(sahne);
    if (yapi.aktifKayitliSinavId) {
      uygulaBasildiKilidiUI(Boolean(yapi.basildiKilidi));
    }
    planlaBaskiMiniOnizleme(yapi);

    // Mobil Okuyucu #setup= bağlantısını ve Kompakt Telefon QR'ını güncelle (Kısa ömürlü OMR eşleşme token'ı ile)
    const varsayilanTaban = (location.protocol.startsWith('http') && !/^(localhost|127\.0\.0\.1)$/i.test(location.hostname))
      ? location.origin
      : 'https://sinav.axonturk.workers.dev';
    const setupTabanEl = document.getElementById('setup-qr-taban-adres');
    const ogrTabanEl = document.getElementById('ogrenci-qr-taban-adres');
    if (setupTabanEl && !setupTabanEl.value) setupTabanEl.value = varsayilanTaban;
    const taban = ((setupTabanEl && setupTabanEl.value) || (ogrTabanEl && ogrTabanEl.value) || varsayilanTaban).trim().replace(/\/+$/, '');
    const kompaktSetup = C.uretKompaktSetupQrPaketi(yapi, durum.ogrenciler, taban);
    const uygulayiciSetupQr = (kisaToken = '') => {
      const tokenEk = kisaToken ? `&omrToken=${encodeURIComponent(kisaToken)}` : '';
      const mobilHrefAday = `optik-mobil.html#setup=${kompaktSetup.encoded}${tokenEk}`;
      const qrHedefAday = `${kompaktSetup.url}${tokenEk}`;
      const siniriKoruyanHref = qrHedefAday.length < 930 ? mobilHrefAday : `optik-mobil.html#setup=${kompaktSetup.encoded}`;
      const siniriKoruyanUrl = qrHedefAday.length < 930 ? qrHedefAday : kompaktSetup.url;
      const linkMobil = document.getElementById('link-mobil-okuyucu');
      const linkQrAc = document.getElementById('link-qr-dogrudan-ac');
      const linkBaglanAc = document.getElementById('link-baglanti-qr-ac');
      if (linkMobil) linkMobil.href = siniriKoruyanHref;
      if (linkQrAc) linkQrAc.href = siniriKoruyanUrl;
      if (linkBaglanAc && typeof C.uretBaglantiQrPaketi === 'function') {
        const aktifDersNesne = (durum.dersler || []).find((d) => d.id === durum.aktifDersId) || null;
        const baglanti = C.uretBaglantiQrPaketi(taban, {
          sinavKodu: yapi.sinavKodu || 'GENEL',
          dersId: durum.aktifDersId || '',
          dersAdi: (aktifDersNesne && (aktifDersNesne.dersAdi || aktifDersNesne.ad)) || yapi.dersAdi || '',
          baslik: yapi.baslik || '',
          omrToken: kisaToken
        });
        linkBaglanAc.href = baglanti.url;
      }
      const qrSvgAlan = document.getElementById('alan-setup-qr-svg');
      if (qrSvgAlan) {
        const svg = uretGercekQrSvg(siniriKoruyanUrl.length <= 1650 ? siniriKoruyanUrl : kompaktSetup.url, 200);
        qrSvgAlan.innerHTML = svg
          ? `<div style="text-align:center;">${svg}<div style="font-size:0.7rem; margin-top:4px; color:#000; font-weight:600;">${C.kacisHTML(kompaktSetup.not)}</div></div>`
          : '<div style="color:#b91c1c; font-size:0.8rem;">QR üretilemedi. Bağlantıyı kopyalayın.</div>';
      }
    };
    const cachedOmrTok = getCachedOmrEslesmeToken();
    uygulayiciSetupQr(cachedOmrTok);
    if (!cachedOmrTok && durum.hocaOturumAcik && (location.protocol === 'http:' || location.protocol === 'https:')) {
      getirKisaOmurluOmrEslesmeToken(yapi.sinavKodu || '').then((tok) => {
        if (tok) uygulayiciSetupQr(tok);
      }).catch(() => {});
    }
  }

  let __omrEslesmeTokenCache = { token: '', bitisMs: 0, anaToken: '' };

  function getCachedOmrEslesmeToken() {
    const anaToken = sessionStorage.getItem('hoca_token') || '';
    if (!anaToken) {
      __omrEslesmeTokenCache = { token: '', bitisMs: 0, anaToken: '' };
      return '';
    }
    if (__omrEslesmeTokenCache.anaToken === anaToken && __omrEslesmeTokenCache.token && __omrEslesmeTokenCache.bitisMs > Date.now() + 15000) {
      return __omrEslesmeTokenCache.token;
    }
    return '';
  }

  async function getirKisaOmurluOmrEslesmeToken(sinavKodu = '') {
    const mevcut = getCachedOmrEslesmeToken();
    if (mevcut) return mevcut;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return '';
    const anaToken = sessionStorage.getItem('hoca_token') || '';
    if (!anaToken) return '';
    try {
      const yanit = await fetch('/api/omr-eslesme-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anaToken}`
        },
        body: JSON.stringify({ sinavKodu: String(sinavKodu || '') })
      });
      if (!yanit.ok) return '';
      const veri = await yanit.json().catch(() => null);
      const tok = veri && (veri.token || veri.omrToken || veri.eslesmeToken);
      if (tok && typeof tok === 'string') {
        const gecerliMs = Number(veri.gecerlilikMs || veri.sureMs) || 4 * 60 * 1000;
        __omrEslesmeTokenCache = {
          token: tok,
          bitisMs: Date.now() + Math.min(10 * 60 * 1000, Math.max(30000, gecerliMs)),
          anaToken
        };
        return tok;
      }
    } catch (_) {}
    return '';
  }

  /* Gerçek (okunabilir) Vektörel QR SVG üretici — qrcode-generator kütüphanesi (MIT) */
  function uretGercekQrSvg(metin, boyutPx) {
    if (typeof window.qrcode !== 'function' || !metin) return '';
    const piksel = Math.max(44, Number(boyutPx) || 220);
    for (const ec of ['M', 'L']) {
      try {
        const qr = window.qrcode(0, ec);
        qr.addData(String(metin), 'Byte');
        qr.make();
        const n = qr.getModuleCount();
        const tam = n + 8;
        let yollar = '';
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            if (qr.isDark(r, c)) yollar += `M${c + 4},${r + 4}h1v1h-1z`;
          }
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${piksel}" height="${piksel}" viewBox="0 0 ${tam} ${tam}" shape-rendering="crispEdges" style="display:block; margin:auto;"><rect width="100%" height="100%" fill="#fff"/><path d="${yollar}" fill="#000"/></svg>`;
      } catch (_) { /* sonraki hata düzeltme seviyesi */ }
    }
    return '';
  }

  /* ------------------------------------------------------------------------
     SEKME 2: SORU BANKASI VE WORD İTHALAT İŞLEMLERİ
     ------------------------------------------------------------------------ */
  function guncelleSoruBankasiTablosu() {
    const aktifDersId = durum.aktifDersId;
    const aktifDersIdSet = new Set(durum.dersler.map((d) => d.id));
    const kaynakFiltre = (document.getElementById('filtre-soru-kaynak') && document.getElementById('filtre-soru-kaynak').value) || 'aktif';
    const turFiltre = document.getElementById('filtre-soru-tur').value || 'TUMU';
    const haftaFiltre = (document.getElementById('filtre-soru-hafta') && document.getElementById('filtre-soru-hafta').value) || 'TUMU';
    const ocFiltre = (document.getElementById('filtre-soru-oc') && document.getElementById('filtre-soru-oc').value) || 'TUMU';
    const aktifDersSorulari = durum.sorular.filter((s) => !s.arsivde && (s.dersId === aktifDersId || s.dersId === 'genel'));
    document.getElementById('rozet-banka-toplam').textContent = String(aktifDersSorulari.length);

    // Aktif dersteki Bologna Öğrenim Çıktısı (ÖÇ) Dağılım Özeti Çubuğu
    const kutuBankaOcOzet = document.getElementById('kutu-banka-oc-ozet');
    if (kutuBankaOcOzet) {
      if (aktifDersSorulari.length === 0) {
        kutuBankaOcOzet.innerHTML = '<span>ℹ️ Aktif derste henüz soru bulunmuyor. Excel/CSV şablonundaki <code>Ogrenim_Ciktisi_OC</code> sütunuyla veya sol formdaki <strong>🎯 Bologna ÖÇ</strong> seçicisiyle soru ekleyebilirsiniz.</span>';
      } else {
        const ocSayacHaritasi = new Map();
        aktifDersSorulari.forEach((s) => {
          const oc = C.normalizeOcKodu(s.ocKodu || s.kazanim, 'ÖÇ-1');
          ocSayacHaritasi.set(oc, (ocSayacHaritasi.get(oc) || 0) + 1);
        });
        const siraliOcGirdileri = Array.from(ocSayacHaritasi.entries()).sort((a, b) => C.ocKoduSiraNo(a[0]) - C.ocKoduSiraNo(b[0]));
        kutuBankaOcOzet.innerHTML = `
          <strong>🎯 Bankadaki Bologna ÖÇ Dağılımı (${siraliOcGirdileri.length} ÖÇ · ${aktifDersSorulari.length} Soru):</strong>
          ${siraliOcGirdileri.map(([oc, adet]) => `<span class="rozet rozet-mavi">${C.kacisHTML(oc)}: ${adet} soru</span>`).join(' ')}
        `;
      }
    }

    // Arşivdeki soru havuzları bilgi çubuğu
    const arsivHavuzlari = C.listeleArsivSoruHavuzlari(durum.dersler, durum.sorular, durum.arsivDersler);
    const arsivCubuk = document.getElementById('kutu-banka-arsiv-cubuk');
    if (arsivCubuk) {
      if (arsivHavuzlari.length === 0) {
        arsivCubuk.style.display = 'none';
        arsivCubuk.innerHTML = '';
      } else {
        arsivCubuk.style.display = 'block';
        arsivCubuk.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem; margin-bottom:0.35rem;">
            <strong>📦 Soru Arşivi (${arsivHavuzlari.reduce((t, h) => t + h.toplam, 0)} Korunan Soru · ${arsivHavuzlari.length} Silinen Ders):</strong>
            <span style="font-size:0.74rem; color:var(--metin-ikincil);">Silinen derslerin soruları silinmedi; istediğiniz zaman aktif derse veya yeni derse dahil edebilirsiniz.</span>
          </div>
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
            ${arsivHavuzlari.map((h) => `
              <div style="display:inline-flex; align-items:center; gap:0.35rem; padding:3px 7px; background:var(--bg-kart); border:1px solid var(--kenar); border-radius:6px;">
                <span><strong>${C.kacisHTML(h.kod)}</strong> — ${C.kacisHTML(h.ad)} <span class="mono">(${h.toplam} Soru: ${h.dy} D/Y · ${h.test} Test · ${h.klasik} Kl.)</span></span>
                <button type="button" class="btn btn-basari btn-kucuk" data-banka-arsiv-aktar="${C.kacisHTML(h.arsivId)}">📥 Bu Derse Dahil Et</button>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    const kaynakSorular = kaynakFiltre === 'arsiv'
      ? durum.sorular.filter((s) => s.arsivde || (!aktifDersIdSet.has(s.dersId) && s.dersId !== 'genel'))
      : aktifDersSorulari;

    const aramaMetni = ((document.getElementById('ara-soru-bankasi') && document.getElementById('ara-soru-bankasi').value) || '').trim().toLocaleLowerCase('tr-TR');

    const filtrelenmis = kaynakSorular.filter((s) => {
      const turUygun = turFiltre === 'TUMU' || s.tur === turFiltre;
      const haftaUygun = haftaFiltre === 'TUMU' || C.normalizeHaftaNo(s.hafta, 1) === parseInt(haftaFiltre, 10);
      const soruOc = C.normalizeOcKodu(s.ocKodu || s.kazanim, 'ÖÇ-1');
      const ocUygun = ocFiltre === 'TUMU' || soruOc === ocFiltre;
      if (!turUygun || !haftaUygun || !ocUygun) return false;
      if (!aramaMetni) return true;
      const samanlik = [
        s.metin || '',
        Array.isArray(s.siklar) ? s.siklar.join(' ') : '',
        s.ocKodu || '',
        s.kazanim || '',
        s.kodBlok || ''
      ].join(' ').toLocaleLowerCase('tr-TR');
      return samanlik.includes(aramaMetni);
    });

    const tbody = document.getElementById('tablo-soru-bankasi');
    if (!tbody) return;

    const sayfaBoyutu = 100;
    const toplamSayi = filtrelenmis.length;
    const toplamSayfa = Math.max(1, Math.ceil(toplamSayi / sayfaBoyutu));
    durum.soruBankasiSayfa = Math.max(1, Math.min(toplamSayfa, Number(durum.soruBankasiSayfa) || 1));

    const guncelleSayfalamaCubugu = () => {
      const tablo = tbody.closest('table');
      const kapsayici = (tablo && tablo.parentElement) || tbody.parentElement;
      if (!kapsayici) return;
      let sayfalamaEl = document.getElementById('kutu-soru-bankasi-sayfalama');
      if (!sayfalamaEl) {
        sayfalamaEl = document.createElement('div');
        sayfalamaEl.id = 'kutu-soru-bankasi-sayfalama';
        sayfalamaEl.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; padding:0.55rem 0.25rem 0.1rem; font-size:0.78rem;';
        kapsayici.insertAdjacentElement('afterend', sayfalamaEl);
        sayfalamaEl.addEventListener('click', (ev) => {
          const bOnce = ev.target.closest('[data-banka-sayfa="onceki"]');
          const bSonra = ev.target.closest('[data-banka-sayfa="sonraki"]');
          const guncelToplamSayfa = Math.max(1, Number(sayfalamaEl.dataset.toplamSayfa) || 1);
          if (bOnce && durum.soruBankasiSayfa > 1) {
            durum.soruBankasiSayfa--;
            guncelleSoruBankasiTablosu();
          } else if (bSonra && durum.soruBankasiSayfa < guncelToplamSayfa) {
            durum.soruBankasiSayfa++;
            guncelleSoruBankasiTablosu();
          }
        });
      }
      sayfalamaEl.dataset.toplamSayfa = String(toplamSayfa);
      if (toplamSayi === 0) {
        sayfalamaEl.style.display = 'none';
        return;
      }
      sayfalamaEl.style.display = 'flex';
      const baslangic = (durum.soruBankasiSayfa - 1) * sayfaBoyutu + 1;
      const bitis = Math.min(toplamSayi, durum.soruBankasiSayfa * sayfaBoyutu);
      sayfalamaEl.innerHTML = `
        <span style="color:var(--metin-ikincil);">Gösterilen: <strong>${baslangic}–${bitis}</strong> / <strong>${toplamSayi}</strong> soru (Sayfa ${durum.soruBankasiSayfa} / ${toplamSayfa})</span>
        <div style="display:flex; gap:0.35rem;">
          <button type="button" class="btn btn-kucuk" data-banka-sayfa="onceki" ${durum.soruBankasiSayfa <= 1 ? 'disabled' : ''}>« Önceki 100</button>
          <button type="button" class="btn btn-kucuk" data-banka-sayfa="sonraki" ${durum.soruBankasiSayfa >= toplamSayfa ? 'disabled' : ''}>Sonraki 100 »</button>
        </div>
      `;
    };

    if (toplamSayi === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--metin-soluk);">${kaynakFiltre === 'arsiv' ? 'Arşivde bekleyen soru bulunmuyor.' : 'Bu kriterlere uygun soru bulunmuyor.'}</td></tr>`;
      guncelleSayfalamaCubugu();
      return;
    }

    const sayfaBaslangicIdx = (durum.soruBankasiSayfa - 1) * sayfaBoyutu;
    const gorunenSorular = filtrelenmis.slice(sayfaBaslangicIdx, sayfaBaslangicIdx + sayfaBoyutu);
    const ocSecenekListesi = ['ÖÇ-1', 'ÖÇ-2', 'ÖÇ-3', 'ÖÇ-4', 'ÖÇ-5', 'ÖÇ-6', 'ÖÇ-7', 'ÖÇ-8', 'ÖÇ-9', 'ÖÇ-10'];

    tbody.innerHTML = gorunenSorular
      .map((s, idx) => {
        const siraNo = sayfaBaslangicIdx + idx + 1;
        const haftaNo = C.normalizeHaftaNo(s.hafta, 1);
        const soruOcKodu = C.normalizeOcKodu(s.ocKodu || s.kazanim, 'ÖÇ-1');
        const turRozet = s.tur === 'dy'
          ? '<span class="rozet rozet-yesil">✔️ D/Y</span>'
          : (s.tur === 'test' ? '<span class="rozet rozet-mavi">🔘 Test</span>' : '<span class="rozet rozet-mor">✍️ Klasik</span>');

        const arsivEtiket = (s.arsivde || !aktifDersIdSet.has(s.dersId))
          ? `<span class="rozet rozet-sari" style="margin-right:4px;">📦 Arşiv: ${C.kacisHTML(s.arsivDersKod || 'Eski Ders')}</span>`
          : '';

        const kazanimEtiket = s.kazanim
          ? `<span style="font-size:0.72rem; color:var(--birincil); font-weight:700;">[${C.kacisHTML(s.kazanim)}]</span> `
          : '';

        const ocHucreSelectHTML = `
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span class="rozet rozet-yesil" style="font-size:0.68rem;">🎯 ${C.kacisHTML(soruOcKodu)}</span>
            <select data-soru-oc-degistir="${C.kacisHTML(s.id)}" style="font-size:0.72rem; padding:2px 4px; width:74px;" title="Sorunun Bologna Öğrenim Çıktısı (ÖÇ) kodunu değiştir">
              ${ocSecenekListesi.map((kod) => `<option value="${kod}" ${kod === soruOcKodu ? 'selected' : ''}>${kod}</option>`).join('')}
            </select>
          </div>
        `;

        const altDetay = s.tur === 'test' && Array.isArray(s.siklar)
          ? `<div style="font-size:0.78rem; color:var(--metin-ikincil); margin-top:2px;">${arsivEtiket}${kazanimEtiket}${s.siklar.map((sik, i) => `<strong>${['A', 'B', 'C', 'D', 'E'][i]})</strong> ${C.kacisHTML(sik)}`).join(' · ')}</div>`
          : (s.tur === 'klasik'
            ? `<div style="font-size:0.76rem; color:var(--metin-ikincil);">${arsivEtiket}${kazanimEtiket}Rubrik: ${C.kacisHTML(s.rubrik || '')}</div>`
            : ((arsivEtiket || kazanimEtiket) ? `<div style="margin-top:2px;">${arsivEtiket}${kazanimEtiket}</div>` : ''));

        const dogruGosterim = s.tur === 'dy'
          ? `<strong>${s.dogruDY === 'D' ? 'Doğru (D)' : 'Yanlış (Y)'}</strong>`
          : (s.tur === 'test' ? `<strong>${C.kacisHTML(s.dogruHarf || 'A')}</strong>` : '<span class="rozet rozet-sari">0–10 Bar</span>');

        const sorulduRozet = s.sorulduMu
          ? `<div style="margin-top:2px;"><span class="rozet rozet-sari" title="Önceki sınavda soruldu">✓ Soruldu</span></div>`
          : '';

        const islemDugmeleri = (s.arsivde || !aktifDersIdSet.has(s.dersId))
          ? `<div style="display:flex; gap:3px;"><button type="button" class="btn btn-basari btn-kucuk" data-arsiv-tek-aktar="${C.kacisHTML(s.id)}">📥 Derse Al</button><button type="button" class="btn btn-tehlike btn-kucuk" data-sil-soru="${C.kacisHTML(s.id)}">Sil</button></div>`
          : `<button type="button" class="btn btn-tehlike btn-kucuk" data-sil-soru="${C.kacisHTML(s.id)}">Sil</button>`;

        return `
          <tr>
            <td>${siraNo}</td>
            <td>
              <span class="rozet rozet-mavi">📅 ${haftaNo}. Hafta</span>
              ${sorulduRozet}
            </td>
            <td>${ocHucreSelectHTML}</td>
            <td>${turRozet}</td>
            <td>
              <div style="font-weight:600;">${C.kacisHTML(s.metin)}</div>
              ${altDetay}
            </td>
            <td class="mono">${dogruGosterim}</td>
            <td>${C.kacisHTML(s.zorluk || 'Orta')}</td>
            <td>${islemDugmeleri}</td>
          </tr>
        `;
      })
      .join('');
    guncelleSayfalamaCubugu();
  }

  /* ------------------------------------------------------------------------
     SEKME 3: MOBİL OMR SİMÜLASYONU, KAMERA VE GÖRÜNTÜ İŞLEME RÖNTGENİ
     ------------------------------------------------------------------------ */
  function cizOmrIslemRontgeni(sonuc) {
    const canvas = document.getElementById('canvas-omr-islenmis');
    if (!canvas || !sonuc || !sonuc.kanonikIkili) return;
    const ctx = canvas.getContext('2d');
    const gen = sonuc.kanonikBoyut.genislik;
    const yuk = sonuc.kanonikBoyut.yukseklik;
    const imgData = ctx.createImageData(gen, yuk);

    // 1. Bradley-Roth Adaptif İkili Görüntüyü Çiz
    for (let i = 0; i < sonuc.kanonikIkili.length; i++) {
      const siyahMi = sonuc.kanonikIkili[i] === 1;
      const p = i * 4;
      const renk = siyahMi ? 22 : 248;
      imgData.data[p] = renk;
      imgData.data[p + 1] = renk;
      imgData.data[p + 2] = renk;
      imgData.data[p + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    // 2. Okunan Balonların Üzerine Yeşil (Doğru), Kırmızı (Yanlış) ve Sarı (Boş/Şüpheli) Halkalar Çiz
    const harita = sonuc.kanonikHarita;
    const cizHalka = (x, y, r, renk) => {
      ctx.beginPath();
      ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = renk;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    };

    // D/Y Balon İşaretleri
    sonuc.dyDetay.forEach((d, idx) => {
      const sat = harita.dySatirlari[idx];
      if (!sat) return;
      for (const b of sat.balonlar) {
        if (b.secenek === d.verilen) {
          cizHalka(b.x, b.y, b.r, d.sonuc === 'DOGRU' ? '#16a34a' : '#dc2626');
        } else if (b.secenek === d.dogruCevap && d.sonuc !== 'DOGRU') {
          cizHalka(b.x, b.y, b.r, '#2563eb');
        }
      }
    });

    // Test Balon İşaretleri
    sonuc.testDetay.forEach((t, idx) => {
      const sat = harita.testSatirlari[idx];
      if (!sat) return;
      for (const b of sat.balonlar) {
        if (b.secenek === t.verilen) {
          cizHalka(b.x, b.y, b.r, t.sonuc === 'DOGRU' ? '#16a34a' : '#dc2626');
        } else if (b.secenek === t.dogruCevap && t.sonuc !== 'DOGRU') {
          cizHalka(b.x, b.y, b.r, '#2563eb');
        }
      }
    });
  }

  function sesliBipCal(basariliMi = true) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = basariliMi ? 880 : 320;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (_) {}
  }

  function uretSentetikOgrenciCevaplari(yapi, grupHarfi, senaryo, tohumStr, ogrNo = '') {
    const ozelKagit = (yapi.ogrenciyeOzelDegerlendirmeAktif && ogrNo && typeof yapi.getirOgrenciOzelKagit === 'function')
      ? yapi.getirOgrenciOzelKagit(ogrNo)
      : null;
    const ozelAnahtar = (ozelKagit && ozelKagit.anahtar)
      || (yapi.ogrenciyeOzelDegerlendirmeAktif && ogrNo && yapi.ogrenciyeOzelAnahtarlar && yapi.ogrenciyeOzelAnahtarlar[ogrNo])
      || null;
    const anahtar = ozelAnahtar || yapi.cevapAnahtarlari[grupHarfi] || yapi.cevapAnahtarlari.A;
    const rng = C.tohumluRastgele(tohumStr);
    const dogruOlasilik = senaryo === 'tam' ? 1.0 : (senaryo === 'basarili' ? 0.88 : (senaryo === 'orta' ? 0.68 : (senaryo === 'zayif' ? 0.38 : 0.82)));
    const sikHarfler = ['A', 'B', 'C', 'D', 'E'].slice(0, yapi.sikSayisi);

    const dyCevaplar = anahtar.dy.map((dogru) => {
      if (rng() < dogruOlasilik) return dogru;
      return dogru === 'D' ? 'Y' : 'D';
    });

    const testCevaplar = anahtar.test.map((dogru) => {
      if (rng() < dogruOlasilik) return dogru;
      const yanlislar = sikHarfler.filter((h) => h !== dogru);
      return yanlislar[Math.floor(rng() * yanlislar.length)] || 'A';
    });

    const klasikPuanlar = [];
    for (let k = 0; k < yapi.klasikSayisi; k++) {
      const tamPuan = (Array.isArray(yapi.klasikSoruPuanlari) && yapi.klasikSoruPuanlari[k] !== undefined)
        ? yapi.klasikSoruPuanlari[k]
        : yapi.klasikSoruPuan;
      const adimlar = C.uretKlasikPuanAdimlari(tamPuan);
      if (senaryo === 'tam') klasikPuanlar.push(adimlar[5]);
      else if (senaryo === 'basarili') klasikPuanlar.push(rng() > 0.3 ? adimlar[5] : adimlar[4]);
      else if (senaryo === 'orta') klasikPuanlar.push(adimlar[3]);
      else klasikPuanlar.push(adimlar[2]);
    }

    return {
      dyCevaplar,
      testCevaplar,
      klasikPuanlar,
      silintiSoruNo: senaryo === 'silinti' ? 3 : -1,
      golgeEkle: true
    };
  }

  function omrUyariGoster(mesaj) {
    const kutu = document.getElementById('omr-uyari-kutu');
    if (!kutu) return;
    kutu.textContent = mesaj || '';
    kutu.hidden = !mesaj;
  }

  /* Fotoğraf/kamera karesini doğal oranıyla (en çok 1600 px) tuvale çizip OMR ile okur; form bulunamazsa kaydetmez */
  function omrGoruntuyuOku(kaynak, kaynakGen, kaynakYuk, ekKagitQrMetin = '') {
    const yapi = okuEtkinOmrSinavYapisi();
    const girdiCanvas = document.getElementById('canvas-omr-girdi');
    const olcek = Math.min(1, 1600 / Math.max(kaynakGen, kaynakYuk));
    girdiCanvas.width = Math.max(1, Math.round(kaynakGen * olcek));
    girdiCanvas.height = Math.max(1, Math.round(kaynakYuk * olcek));
    const ctx = girdiCanvas.getContext('2d');
    ctx.drawImage(kaynak, 0, 0, girdiCanvas.width, girdiCanvas.height);
    const imgData = ctx.getImageData(0, 0, girdiCanvas.width, girdiCanvas.height);
    const standartMi = Boolean(document.getElementById('omr-form-turu') && document.getElementById('omr-form-turu').value === 'standart');
    const hamQr = String(ekKagitQrMetin || (kaynak && kaynak.dataset && kaynak.dataset.oqv2Kod) || '').trim();
    const kagitQrCozum = (!standartMi && hamQr && typeof C.cozSifreliOptikKagitQrPaketi === 'function')
      ? C.cozSifreliOptikKagitQrPaketi(hamQr, yapi.sinavGizliAnahtar)
      : null;
    let sonuc;
    if (standartMi) {
      const std = C.okuStandartOptikFormImageData(imgData, {
        soruSayisi: parseInt(document.getElementById('omr-std-soru').value, 10) || 20,
        sikSayisi: parseInt(document.getElementById('omr-std-sik').value, 10) === 4 ? 4 : 5,
        siralama: document.getElementById('omr-std-siralama').value,
        anahtar: document.getElementById('omr-std-anahtar').value,
        yanlisGoturme: parseInt(document.getElementById('omr-std-goturme').value, 10) || 0
      });
      if (std.formBulundu) {
        const noHam = String(document.getElementById('omr-std-ogrno').value || '').replace(/\D/g, '');
        const ogr = noHam ? durum.ogrenciler.find((o) => String(o.ogrNo) === noHam || String(o.ogrNo).endsWith(noHam)) : null;
        const sayi = durum.okumaSonuclari.filter((k) => k.formTipi === 'standart').length + 1;
        sonuc = {
          ...std,
          ogrNo: ogr ? ogr.ogrNo : (noHam || `STD-${sayi}`),
          adSoyad: ogr ? ogr.adSoyad : (noHam ? `No: ${noHam}` : `Standart form ${sayi}`),
          okunanNoKod: noHam,
          numaraEslesmediMi: !ogr,
          cakisanAdaylar: ogr ? [ogr] : [],
          grup: '-',
          dyDogru: 0, dyYanlis: 0, dyBos: 0, dyNet: 0,
          testDogru: std.dogru, testYanlis: std.yanlis, testBos: std.bos, testNet: std.net,
          klasikToplamPuan: 0, dyDetay: [], klasikDetay: []
        };
      } else {
        sonuc = std;
      }
    } else {
      sonuc = C.okuOptikFormImageData(imgData, yapi, durum.ogrenciler, null, kagitQrCozum);
    }
    if (!sonuc.formBulundu) {
      sesliBipCal(false);
      omrUyariGoster('⚠️ Form bulunamadı: ' + sonuc.mesaj);
      return null;
    }
    omrUyariGoster('');
    sesliBipCal(!sonuc.supheliMi);
    kaydetVeGosterOmrSonuc(sonuc);

    // Kağıt üzerinde OQV2 şifreli karekod varsa arka planda çözüp sonucu anında zenginleştir
    if (!standartMi && !kagitQrCozum && typeof window.BarcodeDetector === 'function' && typeof C.cozSifreliOptikKagitQrPaketi === 'function') {
      try {
        const dedektor = new window.BarcodeDetector({ formats: ['qr_code'] });
        dedektor.detect(girdiCanvas).then((kodlar) => {
          const oqv2Ham = (kodlar || []).map((k) => String((k && k.rawValue) || '').trim()).find((v) => v.startsWith('OQV2:'));
          if (!oqv2Ham) return;
          const cozulmusQr = C.cozSifreliOptikKagitQrPaketi(oqv2Ham, yapi.sinavGizliAnahtar);
          if (cozulmusQr && cozulmusQr.gecerli) {
            const guncelSonuc = C.okuOptikFormImageData(imgData, yapi, durum.ogrenciler, sonuc.koseler || null, cozulmusQr);
            if (guncelSonuc && guncelSonuc.formBulundu) {
              guncelSonuc.id = sonuc.id;
              kaydetVeGosterOmrSonuc(guncelSonuc);
            }
          }
        }).catch(() => {});
      } catch (_) {}
    }

    return sonuc;
  }

  function kaydetVeGosterOmrSonuc(sonuc) {
    if (!sonuc || sonuc.formBulundu === false) return;
    // Aynı öğrencinin önceki kaydı varsa güncelle
    const mevcutIdx = sonuc.numaraEslesmediMi ? -1 : durum.okumaSonuclari.findIndex((s) => s.ogrNo === sonuc.ogrNo && !s.numaraEslesmediMi);
    if (mevcutIdx >= 0) {
      durum.okumaSonuclari[mevcutIdx] = sonuc;
    } else {
      durum.okumaSonuclari.unshift(sonuc);
    }
    verileriKaydet();

    cizOmrIslemRontgeni(sonuc);

    const guvenYuzde = Math.round(sonuc.ortalamaGuven * 100);
    const rozetGuven = document.getElementById('rozet-son-okuma-guven');
    if (rozetGuven) {
      rozetGuven.className = sonuc.supheliMi ? 'rozet rozet-sari' : 'rozet rozet-yesil';
      rozetGuven.textContent = `Güven: %${guvenYuzde} (${sonuc.supheliMi ? 'İnceleme Önerilir' : 'Onaylandı'})`;
    }

    const kutuDetay = document.getElementById('kutu-son-okunan-detay');
    if (kutuDetay) {
      let cakismaSeciciHTML = '';
      if (Array.isArray(sonuc.cakisanAdaylar) && sonuc.cakisanAdaylar.length > 1) {
        const adayButonlar = sonuc.cakisanAdaylar
          .map((aday) => {
            const dahaOnceOkunduMu = durum.okumaSonuclari.some((k) => k.id !== sonuc.id && k.ogrNo === aday.ogrNo);
            const seciliMi = sonuc.ogrNo === aday.ogrNo;
            return `
              <button type="button" class="btn ${seciliMi ? 'btn-birincil' : ''} btn-kucuk" data-cakisma-sec-id="${C.kacisHTML(sonuc.id)}" data-cakisma-ogrno="${C.kacisHTML(aday.ogrNo)}" data-cakisma-ad="${C.kacisHTML(aday.adSoyad)}">
                👤 ${C.kacisHTML(aday.adSoyad)} (${C.kacisHTML(aday.ogrNo)}) ${dahaOnceOkunduMu ? '· ✓ Okundu' : ''}
              </button>
            `;
          })
          .join(' ');
        cakismaSeciciHTML = `
          <div style="margin-top:0.55rem; padding:0.55rem; background:var(--uyari-acik); color:var(--uyari); border-radius:6px; border:1px solid var(--uyari);">
            <div style="font-weight:800; font-size:0.82rem; margin-bottom:0.35rem;">
              ⚠️ Sonu "${C.kacisHTML(sonuc.okunanNoKod)}" ile biten ${sonuc.cakisanAdaylar.length} öğrenci var — Kağıt kime ait? (Tek tıkla seçin):
            </div>
            <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">${adayButonlar}</div>
          </div>
        `;
      }

      kutuDetay.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <strong style="font-size:1rem;">👤 ${C.kacisHTML(sonuc.adSoyad)}</strong>
            <span class="mono" style="color:var(--metin-ikincil);">(${C.kacisHTML(sonuc.ogrNo)} · Kodlanan: ${C.kacisHTML(sonuc.okunanNoKod)})</span>
            <span class="rozet rozet-mavi">${C.kacisHTML(sonuc.grup)} Grubu</span>
          </div>
          <div style="font-size:1.25rem; font-weight:800; color:var(--basari);">
            🎯 Toplam: ${sonuc.toplamPuan} / 100 Puan (${C.hesaplaHarfNotu(sonuc.toplamPuan)})
          </div>
        </div>
        <div style="margin-top:0.45rem; font-size:0.84rem; display:flex; gap:1rem; flex-wrap:wrap;">
          <span>✔️ <strong>Doğru/Yanlış:</strong> ${sonuc.dyDogru} Doğru, ${sonuc.dyYanlis} Yanlış, ${sonuc.dyBos} Boş</span>
          <span>🔘 <strong>Test:</strong> ${sonuc.testDogru} Doğru, ${sonuc.testYanlis} Yanlış, ${sonuc.testBos} Boş</span>
          <span>✍️ <strong>Klasik Puan Barı:</strong> ${sonuc.klasikToplamPuan} Puan</span>
        </div>
        ${cakismaSeciciHTML}
      `;
    }

    guncelleOmrTabloVeKuyruk();
    guncelleMaddeAnaliziSekmesi();
  }

  function guncelleOmrTabloVeKuyruk() {
    document.getElementById('rozet-okunan-kagit').textContent = String(durum.okumaSonuclari.length);
    const tbody = document.getElementById('tablo-omr-okunanlar');
    if (tbody) {
      tbody.innerHTML = durum.okumaSonuclari
        .map((s) => `
          <tr>
            <td class="mono">${C.kacisHTML(s.ogrNo)}</td>
            <td><strong>${C.kacisHTML(s.adSoyad)}</strong></td>
            <td><span class="rozet rozet-mavi">${C.kacisHTML(s.grup)}</span></td>
            <td class="mono">${s.dyDogru}D / ${s.dyYanlis}Y / ${s.dyBos}B</td>
            <td class="mono">${s.testDogru}D / ${s.testYanlis}Y / ${s.testBos}B</td>
            <td class="mono">${s.klasikToplamPuan}p</td>
            <td><strong style="color:var(--birincil);">${s.toplamPuan}</strong></td>
            <td>
              <span class="rozet ${s.supheliMi ? 'rozet-sari' : 'rozet-yesil'}">
                %${Math.round(s.ortalamaGuven * 100)}
              </span>
            </td>
          </tr>
        `)
        .join('');
    }

    // Öğretmen İnceleme Kuyruğu (Şüpheli Balon Hızlı Düzeltme + Eşleşmeyen Kimlik Atama)
    const supheliler = durum.okumaSonuclari.filter(
      (s) => Boolean(s.kimlikEslesmeBekliyor || s.numaraEslesmediMi) || (s.supheliMi && Array.isArray(s.incelemeKuyrugu) && s.incelemeKuyrugu.length > 0)
    );
    document.getElementById('rozet-inceleme-sayisi').textContent = `${supheliler.length} Bekleyen`;
    const kuyrukAlan = document.getElementById('liste-inceleme-kuyrugu');
    if (kuyrukAlan) {
      if (supheliler.length === 0) {
        kuyrukAlan.innerHTML = '✅ Tüm kağıtlar yüksek güvenilirlikle okundu. İnceleme bekleyen şüpheli balon veya eşleşmeyen öğrenci yok.';
      } else {
        const ogrenciOpsiyonlar = (durum.ogrenciler || [])
          .map((o) => `<option value="${C.kacisHTML(o.ogrNo)}">${C.kacisHTML(o.ogrNo)} — ${C.kacisHTML(o.adSoyad)}</option>`)
          .join('');
        kuyrukAlan.innerHTML = supheliler
          .map((s) => {
            const kimlikAtamaHTML = (s.kimlikEslesmeBekliyor || s.numaraEslesmediMi)
              ? `
                <div style="margin-top:4px; display:flex; gap:0.35rem; align-items:center; flex-wrap:wrap;">
                  <span class="rozet rozet-kirmizi">⚠️ Sınıf Listesinde Eşleşmedi</span>
                  <select data-kimlik-esle-id="${C.kacisHTML(s.id)}" style="width:auto; min-width:190px; font-size:0.75rem; padding:2px 6px;">
                    <option value="">👤 Kayıtlı Öğrenciye Ata...</option>
                    ${ogrenciOpsiyonlar}
                  </select>
                </div>
              `
              : '';

            const hizliBalonHTML = (s.incelemeKuyrugu || [])
              .map((k) => {
                const alanStr = String(k.alan || '');
                const dyEs = alanStr.match(/^(?:DY-|D\/Y\s*Soru\s*)(\d+)/i);
                const testEs = alanStr.match(/^(?:TEST-|Test\s*Soru\s*)(\d+)/i);
                let dugmeler = '';
                if (dyEs) {
                  const sNo = Number(dyEs[1]);
                  dugmeler = ['D', 'Y', 'BOS']
                    .map((sec) => `<button type="button" class="balon-hizli-btn" data-hizli-sik-id="${C.kacisHTML(s.id)}" data-hizli-sik-tur="dy" data-hizli-sik-no="${sNo}" data-hizli-sik-deger="${sec}">${sec === 'BOS' ? 'Boş' : sec}</button>`)
                    .join('');
                } else if (testEs) {
                  const sNo = Number(testEs[1]);
                  dugmeler = ['A', 'B', 'C', 'D', 'E', 'BOS']
                    .map((sec) => `<button type="button" class="balon-hizli-btn" data-hizli-sik-id="${C.kacisHTML(s.id)}" data-hizli-sik-tur="test" data-hizli-sik-no="${sNo}" data-hizli-sik-deger="${sec}">${sec === 'BOS' ? 'Boş' : sec}</button>`)
                    .join('');
                }
                return `
                  <span style="display:inline-flex; align-items:center; gap:0.25rem; margin-right:0.5rem; margin-top:2px; flex-wrap:wrap;">
                    <span>${C.kacisHTML(alanStr)} (${C.kacisHTML(k.detay || '')})</span>
                    ${dugmeler}
                  </span>
                `;
              })
              .join('');

            return `
              <div style="padding:0.55rem; background:var(--uyari-acik); color:var(--uyari); border-radius:6px; margin-bottom:0.45rem; display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <div style="flex:1; min-width:220px;">
                  <strong>${C.kacisHTML(s.adSoyad)} (${C.kacisHTML(s.ogrNo)})</strong>:
                  <div>${hizliBalonHTML || 'Kimlik doğrulaması bekleniyor.'}</div>
                  ${kimlikAtamaHTML}
                </div>
                <button type="button" class="btn btn-kucuk" data-onayla-inceleme="${C.kacisHTML(s.id)}">✓ Onayla</button>
              </div>
            `;
          })
          .join('');
      }
    }
  }

  /* ------------------------------------------------------------------------
     SEKME 4: MADDE ANALİZİ (pj Güçlük, rjx Ayırt Edicilik), PÇ, KÜMÜLATİF ÖÇ & PUKÖ
     ------------------------------------------------------------------------ */
  function guncelleMaddeAnaliziSekmesi() {
    const yapi = okuEtkinOmrSinavYapisi();
    const analiz = C.hesaplaSinifVeMaddeAnalizi(durum.okumaSonuclari, yapi);

    document.getElementById('ist-ogrenci-sayisi').textContent = String(analiz.ogrenciSayisi);
    document.getElementById('ist-ortalama').textContent = String(analiz.ortalama);
    document.getElementById('ist-sapma').textContent = String(analiz.standartSapma);
    document.getElementById('ist-medyan').textContent = String(analiz.medyan);
    document.getElementById('ist-min-max').textContent = `${analiz.enYuksek} / ${analiz.enDusuk}`;

    const elKr20 = document.getElementById('ist-kr20');
    if (elKr20) elKr20.textContent = `${analiz.kr20.toFixed(2)} / ${analiz.cronbachAlpha.toFixed(2)}`;
    const elGuvYorum = document.getElementById('ist-guvenirlik-yorum');
    if (elGuvYorum) elGuvYorum.textContent = analiz.guvenirlikYorum || 'Güvenirlik';
    const elSe = document.getElementById('ist-se');
    if (elSe) elSe.textContent = `±${analiz.standartHata}`;

    // Girmeyen · GR sayısı ve mutabakat özeti
    const okunanNoKumesi = new Set((durum.okumaSonuclari || []).map((r) => String(r.ogrNo || '').trim()));
    const girmeyenOgrenciler = (durum.ogrenciler || []).filter((o) => o && !okunanNoKumesi.has(String(o.ogrNo || '').trim()));
    const elGrSayi = document.getElementById('ist-girmeyen-gr');
    if (elGrSayi) elGrSayi.textContent = String(girmeyenOgrenciler.length);
    const icerikGr = document.getElementById('icerik-gr-mutabakat');
    if (icerikGr) {
      const bekleyenAdet = (durum.okumaSonuclari || []).filter((r) => r && (r.durum === 'BEKLEYEN' || r.supheliMi)).length;
      const bekleyenNot = bekleyenAdet > 0
        ? ` (${bekleyenAdet} BEKLEYEN / şüpheli okuma kaydı incelenmeyi bekliyor; sınava girmeyenler GR olarak netleştirilir.)`
        : '';
      if ((durum.ogrenciler || []).length === 0) {
        icerikGr.innerHTML = 'Sınıf listesi henüz yüklenmedi.';
      } else if ((durum.okumaSonuclari || []).length === 0) {
        icerikGr.innerHTML = `Sınıf listesinde <strong>${durum.ogrenciler.length}</strong> öğrenci kayıtlı (tümü şu an <strong>BEKLEYEN</strong>). Kağıt okuması tamamlandığında okunmayan / sınava girmeyen kayıtlar <strong>GR</strong> olarak netleştirilir.`;
      } else if (girmeyenOgrenciler.length === 0) {
        icerikGr.innerHTML = `Sınıf listesindeki tüm öğrenciler (<strong>${durum.ogrenciler.length}</strong> kişi) sınava katılmıştır (0 GR).${C.kacisHTML(bekleyenNot)}`;
      } else {
        const grCipler = girmeyenOgrenciler
          .slice(0, 40)
          .map((o) => `<span class="rozet rozet-sari" style="margin:2px;">${C.kacisHTML(o.ogrNo)} — ${C.kacisHTML(o.adSoyad)} (BEKLEYEN → GR)</span>`)
          .join(' ');
        icerikGr.innerHTML = `
          <div style="margin-bottom:6px;">
            Kayıtlı <strong>${durum.ogrenciler.length}</strong> öğrenciden <strong>${durum.okumaSonuclari.length}</strong> kağıt okundu;
            henüz kağıdı bulunmayan (<strong>BEKLEYEN</strong>) <strong>${girmeyenOgrenciler.length}</strong> öğrenciyi OBS çizelgesine <strong>GR (Girmedi)</strong> olarak netleştirmek için sağdaki düğmeyi kullanın:${C.kacisHTML(bekleyenNot)}
          </div>
          <div>${grCipler}${girmeyenOgrenciler.length > 40 ? ` <span class="rozet">+${girmeyenOgrenciler.length - 40} kişi</span>` : ''}</div>
        `;
      }
    }

    const tbody = document.getElementById('tablo-madde-analizi');
    if (!tbody) return;

    const iptalKumesi = new Set((yapi.iptalEdilenSorular || []).map((x) => String(x || '').trim().toUpperCase()));

    // Sade Türkçe "Dikkat İsteyen Sorular" kartı ve canlı iptal simülasyonu
    const kutuDikkat = document.getElementById('kutu-dikkat-isteyen-sorular');
    const rozetDikkat = document.getElementById('rozet-dikkat-soru-sayisi');
    const listeDikkat = document.getElementById('liste-dikkat-isteyen-sorular');
    if (kutuDikkat && listeDikkat) {
      const dikkatSorular = (durum.okumaSonuclari || []).length > 0
        ? analiz.maddeler.filter((m) => m.sorunluMu || m.rjx < 0.2 || m.pj < 0.25)
        : [];
      if (dikkatSorular.length === 0) {
        kutuDikkat.hidden = true;
        listeDikkat.innerHTML = '';
      } else {
        kutuDikkat.hidden = false;
        if (rozetDikkat) rozetDikkat.textContent = `${dikkatSorular.length} Soru`;
        listeDikkat.innerHTML = dikkatSorular
          .map((m) => {
            const mKodUst = String(m.kod || '').trim().toUpperCase();
            const iptalMi = iptalKumesi.has(mKodUst);
            let farkMetin = '';
            if (!iptalMi) {
              const simIptalListesi = [...(yapi.iptalEdilenSorular || []), mKodUst];
              const simAnaliz = C.hesaplaSinifVeMaddeAnalizi(durum.okumaSonuclari, Object.assign({}, yapi, { iptalEdilenSorular: simIptalListesi }));
              const fark = Number((Number(simAnaliz.ortalama || 0) - Number(analiz.ortalama || 0)).toFixed(1));
              farkMetin = ` (${fark >= 0 ? '+' : ''}${fark.toFixed(1)} ort.)`;
            }
            const aciklama = m.rjx < 0
              ? 'Üst gruptaki öğrenciler bu soruda alt gruptan daha düşük başarı gösterdi; doğru şık anahtarını kontrol edin.'
              : (m.pj < 0.25
                ? `Sınıfın yalnızca %${Math.round(m.pj * 100)}'i doğru yanıtladı (çok zor madde).`
                : `Ayırt edicilik düşük (${m.rjx.toFixed(2)}); çeldirici dağılımı incelenmeli.`);
            return `
              <div class="ucus-kontrol-satir">
                <div>
                  <strong>${C.kacisHTML(m.kod)}</strong> · Doğru: <code class="mono">${C.kacisHTML(m.dogruCevap)}</code>
                  <div style="font-size:var(--yazi-xs); color:var(--metin-ikincil);">${C.kacisHTML(aciklama)}</div>
                </div>
                <button type="button" class="btn btn-kucuk ${iptalMi ? 'btn-uyari' : ''}" data-toggle-iptal-kod="${C.kacisHTML(mKodUst)}">
                  ${iptalMi ? 'İptali Kaldır' : `İptal et${farkMetin}`}
                </button>
              </div>
            `;
          })
          .join('');
      }
    }

    if (analiz.maddeler.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--metin-soluk);">Madde analizi için önce Okuma sekmesinden en az 1 sınav kağıdı okutunuz.</td></tr>`;
    } else {
      const toplamOkunan = Math.max(1, Number(analiz.ogrenciSayisi) || 1);
      tbody.innerHTML = analiz.maddeler
        .map((m) => {
          const dagilimGirdileri = Object.entries(m.dagilim || {});
          const dagilimMetin = dagilimGirdileri
            .map(([k, v]) => `${k}:${v}`)
            .join(' · ');
          const miniCubukHTML = `
            <div class="sik-mini-cubuk-grup" aria-hidden="true">
              ${dagilimGirdileri.map(([k, v]) => {
                const yuk = Math.max(2, Math.round((Number(v || 0) / toplamOkunan) * 20));
                const dogruMu = String(k).toUpperCase() === String(m.dogruCevap).toUpperCase();
                return `<span class="sik-mini-cubuk"><span class="sik-mini-cubuk-ic ${dogruMu ? 'dogru' : ''}" style="height:${yuk}px;"></span><span>${C.kacisHTML(k)}</span></span>`;
              }).join('')}
            </div>
          `;
          const mKodUst = String(m.kod || '').trim().toUpperCase();
          const iptalMi = iptalKumesi.has(mKodUst);

          return `
            <tr>
              <td class="mono"><strong>${C.kacisHTML(m.kod)}</strong></td>
              <td>${C.kacisHTML(m.tur)}</td>
              <td class="mono"><strong>${C.kacisHTML(m.dogruCevap)}</strong></td>
              <td class="mono">${m.pj.toFixed(2)}</td>
              <td>
                <span class="rozet ${m.pj >= 0.3 && m.pj <= 0.7 ? 'rozet-yesil' : 'rozet-mavi'}">
                  ${C.kacisHTML(m.zorlukYorum)}
                </span>
              </td>
              <td class="mono"><strong>${m.rjx.toFixed(2)}</strong></td>
              <td>
                <span class="rozet ${m.sorunluMu ? 'rozet-kirmizi' : 'rozet-yesil'}">
                  ${C.kacisHTML(m.ayirtYorum)}
                </span>
              </td>
              <td class="mono" style="font-size:0.78rem;">${miniCubukHTML}<div>${C.kacisHTML(dagilimMetin)}</div></td>
              <td>
                <button type="button" class="btn btn-kucuk ${iptalMi ? 'btn-uyari' : ''}" data-toggle-iptal-kod="${C.kacisHTML(mKodUst)}" title="Bu soruyu tek tıkla iptal et (herkese tam puan ver) veya iptali geri al">
                  ${iptalMi ? 'İptali Kaldır' : 'İptal Et'}
                </button>
              </td>
            </tr>
          `;
        })
        .join('');
    }

    // Aktif şablon baraj eşiği
    const aktifSablon = (durum.kurumsalSablonlar || []).find((s) => s.id === durum.aktifKurumSablonId) || null;
    const hedefBaraj = (aktifSablon && Number(aktifSablon.akreditasyonBaraj)) || 60;

    // 1. Öğrenme Çıktısı (ÖÇ) / Kazanım Başarı Analizi ve Bireysel Karneler
    const kazanimSonuc = C.hesaplaKazanimVeKarneAnalizi(durum.okumaSonuclari, Object.assign({}, yapi, { kazanimBarajYuzde: hedefBaraj }));
    const kazanimListesi = kazanimSonuc.kazanimTablosu || [];
    const tbodyKazanim = document.getElementById('tablo-kazanim-analizi');
    if (tbodyKazanim) {
      if (kazanimListesi.length === 0) {
        tbodyKazanim.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--metin-soluk);">Kazanım analizi için sınav kağıdı okutunuz.</td></tr>`;
      } else {
        tbodyKazanim.innerHTML = kazanimListesi
          .map((k) => {
            const olculdu = k.olculduMu !== false && k.soruSayisi > 0;
            const azamiPuan = k.toplamAzamiPuan !== undefined
              ? k.toplamAzamiPuan
              : Math.round((k.soruSayisi / Math.max(1, yapi.toplamSoruSayisi)) * 100);
            const rozetSinif = !olculdu
              ? ''
              : (k.basariYuzde >= 70 ? 'rozet-yesil' : (k.basariYuzde >= 50 ? 'rozet-sari' : 'rozet-kirmizi'));
            const rozetStil = !olculdu ? 'background:#e2e8f0; color:#475569;' : '';
            const saglayanBilgi = olculdu && k.saglayanOgrenciSayisi !== undefined
              ? ` · Barajı Geçen: ${k.saglayanOgrenciSayisi}/${durum.okumaSonuclari.length} (%${k.saglamaOraniYuzde || 0})`
              : '';
            return `
              <tr>
                <td><strong>${C.kacisHTML(k.kod)}</strong></td>
                <td class="mono">${k.soruSayisi} Soru</td>
                <td class="mono">${azamiPuan} Puan</td>
                <td class="mono"><strong>${olculdu ? `%${k.basariYuzde}` : '—'}</strong></td>
                <td>
                  <span class="rozet ${rozetSinif}" style="${rozetStil}">
                    ${C.kacisHTML(k.durum)}${C.kacisHTML(saglayanBilgi)}
                  </span>
                </td>
              </tr>
            `;
          })
          .join('');
      }
    }

    // 1B. Faz 2: Program Çıktısı (PÇ 1–5) Gerçekleşme Tablosu, Dönemlik Kümülatif Öğrenci × ÖÇ, PUKÖ & Maddi Hata Seçici
    const donemTurEl = document.getElementById('sec-aktif-sinav-donem-turu');
    const donemAgirlikEl = document.getElementById('ayar-aktif-sinav-agirlik');
    const aktifSinavTuru = (donemTurEl && donemTurEl.value) || 'Ara Sınav';
    const aktifSinavAgirlik = Math.max(1, Math.min(100, Number(donemAgirlikEl && donemAgirlikEl.value) || 40));

    let kumulatifRapor = {
      pcTablosu: [],
      kumulatifOgrenciOcMatrisi: [],
      kumulatifOcKodlari: [],
      bireyselTekrarOnerileri: {},
      pukoRaporMetni: ''
    };
    if (typeof C.hesaplaKumulatifOcPcVePukoRaporu === 'function') {
      kumulatifRapor = C.hesaplaKumulatifOcPcVePukoRaporu({
        ders: yapi.ders,
        okumaSonuclari: durum.okumaSonuclari,
        aktifSinavAnaliz: kazanimSonuc,
        maddeAnaliz: analiz,
        sinavYapisi: yapi,
        aktifSinavTuru,
        aktifSinavAgirlik,
        digerSinavPaketleri: durum.donemDigerSinavlar || [],
        barajEsigi: hedefBaraj
      });
    }

    const uyariDonemEl = document.getElementById('uyari-donem-paket-ders');
    if (uyariDonemEl && Array.isArray(kumulatifRapor.reddedilenYabanciPaketler) && kumulatifRapor.reddedilenYabanciPaketler.length > 0) {
      const listeStr = kumulatifRapor.reddedilenYabanciPaketler
        .map((r) => `${r.sinavTuru} (${r.paketDersKodu || '?'})`)
        .join(', ');
      uyariDonemEl.textContent = `⚠️ Farklı ders koduna ait dönem paketleri birleştirmeye alınmadı: ${listeStr}. Yalnız aktif ders (${yapi.ders.kod}) paketleri birleştirilir.`;
      uyariDonemEl.hidden = false;
    }

    const tbodyPc = document.getElementById('tablo-pc-gerceklesme');
    if (tbodyPc) {
      const pcSatirlar = kumulatifRapor.pcTablosu || [];
      if (pcSatirlar.length === 0) {
        tbodyPc.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--metin-soluk);">Dersin Bologna PÇ katkı tablosu tanımlandığında ve sınav okutulduğunda PÇ gerçekleşme oranları burada hesaplanır.</td></tr>`;
      } else {
        tbodyPc.innerHTML = pcSatirlar
          .map((p) => {
            const olculdu = p.olculduMu !== false && p.gerceklesmeYuzde !== null && p.gerceklesmeYuzde !== undefined;
            const sinif = !olculdu ? '' : (p.barajiGectiMi ? 'rozet-yesil' : 'rozet-kirmizi');
            const stil = !olculdu ? 'background:#e2e8f0; color:#475569;' : '';
            const bagliStr = (p.bagliOcler && p.bagliOcler.length > 0)
              ? `${p.bagliOcler.join(', ')} (Hedef: ${p.hedefKatkiDuzeyi}/5)`
              : '—';
            const beslikMetin = olculdu && p.beslikSkor ? `${Number(p.beslikSkor).toFixed(2)} / 5.00` : '—';
            return `
              <tr>
                <td class="mono"><strong>${C.kacisHTML(p.pcKodu)}</strong></td>
                <td>${C.kacisHTML(bagliStr)}</td>
                <td class="mono"><strong>${olculdu ? `%${p.gerceklesmeYuzde}` : '—'}</strong></td>
                <td class="mono"><strong>${C.kacisHTML(beslikMetin)}</strong></td>
                <td><span class="rozet ${sinif}" style="${stil}">${olculdu ? (p.barajiGectiMi ? '✅ Sağlandı' : '⚠️ Geliştirilmeli') : 'ÖLÇÜLMEDİ'}</span></td>
              </tr>
            `;
          })
          .join('');
      }
    }

    const pukoEl = document.getElementById('metin-puko-raporu');
    if (pukoEl) {
      pukoEl.value = kumulatifRapor.pukoRaporMetni || '';
    }

    const maddiHataSecEl = document.getElementById('sec-maddi-hata-ogrenci');
    if (maddiHataSecEl) {
      const mevcutOgr = maddiHataSecEl.value || '';
      if (durum.okumaSonuclari.length === 0) {
        maddiHataSecEl.innerHTML = '<option value="">Önce kağıt okutunuz...</option>';
      } else {
        maddiHataSecEl.innerHTML = durum.okumaSonuclari
          .map((s) => `<option value="${C.kacisHTML(s.ogrNo)}" ${String(s.ogrNo) === mevcutOgr ? 'selected' : ''}>${C.kacisHTML(s.ogrNo)} — ${C.kacisHTML(s.adSoyad)} (${s.toplamPuan}p)</option>`)
          .join('');
      }
    }

    const kutuKumulatif = document.getElementById('kutu-kumulatif-oc-matrisi');
    if (kutuKumulatif) {
      const kumListe = kumulatifRapor.kumulatifOgrenciOcMatrisi || [];
      const kumKodlar = kumulatifRapor.kumulatifOcKodlari || [];
      if (kumListe.length === 0 || kumKodlar.length === 0) {
        kutuKumulatif.innerHTML = `<div style="font-size:0.79rem; color:var(--metin-soluk);">Dönemlik kümülatif matris için en az 1 sınav okutunuz${(durum.donemDigerSinavlar || []).length > 0 ? ` (${durum.donemDigerSinavlar.length} ek sınav paketi yüklü)` : ''}.</div>`;
      } else {
        const birlesikEtiket = [
          `${aktifSinavTuru} (%${aktifSinavAgirlik})`,
          ...(durum.donemDigerSinavlar || []).map((p) => `${p.sinavTuru || 'Ek Sınav'} (%${p.agirlik || 60})`)
        ].join(' + ');
        kutuKumulatif.innerHTML = `
          <div style="font-size:0.76rem; font-weight:700; color:var(--birincil); margin-bottom:0.35rem;">
            📐 Birleştirilen Sınavlar: ${C.kacisHTML(birlesikEtiket)} · Baraj: %${hedefBaraj}
          </div>
          <div class="tablo-sarmal">
            <table class="veri-tablo" style="font-size:0.77rem;">
              <thead>
                <tr>
                  <th>Öğrenci No</th>
                  <th>Ad Soyad</th>
                  <th>Dönem Notu</th>
                  ${kumKodlar.map((kod) => `<th>${C.kacisHTML(kod)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${kumListe.map((st) => `
                  <tr>
                    <td class="mono">${C.kacisHTML(st.ogrNo)}</td>
                    <td><strong>${C.kacisHTML(st.adSoyad)}</strong></td>
                    <td class="mono"><strong>${st.agirlikliPuan}</strong></td>
                    ${kumKodlar.map((kod) => {
                      const h = (st.ocKumulatif || {})[kod];
                      if (!h || !h.olculduMu) return '<td class="mono" style="color:var(--metin-soluk);">—</td>';
                      return `<td class="mono" style="font-weight:700; color:${h.barajiGectiMi ? '#15803d' : '#b91c1c'};">%${h.yuzde}</td>`;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    }

    // 2. İstatistiksel Kopya & Ortak Yanlış Şık Benzerlik Dedektörü (Harpp-Hogan)
    const supheliCiftler = C.tespitEtKopyaBenzerlikCiftleri(durum.okumaSonuclari);
    const tbodyKopya = document.getElementById('tablo-kopya-benzerlik');
    if (tbodyKopya) {
      if (supheliCiftler.length === 0) {
        tbodyKopya.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--basari);">✅ Şüpheli ortak yanlış şık kümelenmesi tespit edilmedi.</td></tr>`;
      } else {
        tbodyKopya.innerHTML = supheliCiftler
          .map((c) => {
            const maddeler = c.ortakYanlisMaddeler || [];
            return `
              <tr>
                <td><strong>${C.kacisHTML(c.ogrenci1Ad)}</strong> &amp; <strong>${C.kacisHTML(c.ogrenci2Ad)}</strong></td>
                <td><span class="rozet rozet-mavi">${C.kacisHTML(c.grup)}</span></td>
                <td class="mono" style="color:var(--tehlike); font-weight:700;" title="${C.kacisHTML(maddeler.join(', '))}">
                  ${c.ortakYanlisSayisi} Ortak Yanlış (${C.kacisHTML(maddeler.slice(0, 3).join(', '))})
                </td>
                <td class="mono">${c.ortakDogruSayisi}</td>
                <td class="mono"><strong>%${c.benzerlikYuzde}</strong> (HH:${c.harppHoganIndeks})</td>
                <td><span class="rozet rozet-kirmizi">${C.kacisHTML(c.riskSeviyesi || 'YÜKSEK')}</span></td>
              </tr>
            `;
          })
          .join('');
      }
    }

    // 3. Bologna / MÜDEK Öğrenci × ÖÇ Başarım Matrisi + Bireysel Öğrenci Sonuç Karneleri
    const karneListesi = kazanimSonuc.ogrenciKarneleri || [];
    const ocMatrisListesi = kazanimSonuc.ogrenciOcMatrisi || [];
    const barajEsigi = kazanimSonuc.barajEsigi || hedefBaraj;
    const kutuKarneler = document.getElementById('kutu-bireysel-karneler');
    if (kutuKarneler) {
      if (karneListesi.length === 0) {
        kutuKarneler.innerHTML = `<div style="padding:1rem; color:var(--metin-soluk);">Okunan öğrenci kağıdı bulunmuyor.</div>`;
      } else {
        const olculenOcKodlari = kazanimListesi.filter((k) => k.olculduMu !== false && k.soruSayisi > 0).map((k) => k.kod);
        const matrisTabloHTML = ocMatrisListesi.length > 0 && olculenOcKodlari.length > 0
          ? `
            <div style="margin-bottom:14px; border:1px solid var(--kenar); border-radius:6px; overflow-x:auto; background:#fff; color:#000; padding:8px;">
              <div style="font-weight:800; font-size:0.85rem; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                <span>📊 Bologna / MÜDEK / YÖKAK Öğrenci × ÖÇ Başarım Matrisi (Baraj Eşiği: %${barajEsigi})</span>
                <span style="font-size:0.75rem; color:#475569;">Ağırlıklı Puan Formülü: 100 × Σ(Kazanılan Puan) / Σ(Azami Puan)</span>
              </div>
              <table class="veri-tablo" style="font-size:0.78rem; color:#000;">
                <thead>
                  <tr>
                    <th>Öğrenci No</th>
                    <th>Ad Soyad</th>
                    <th>Grup</th>
                    <th>Toplam</th>
                    ${olculenOcKodlari.map((kod) => `<th>${C.kacisHTML(kod)}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${ocMatrisListesi.map((st) => `
                    <tr>
                      <td class="mono">${C.kacisHTML(st.ogrNo)}</td>
                      <td><strong>${C.kacisHTML(st.adSoyad)}</strong></td>
                      <td>${C.kacisHTML(st.grup)}</td>
                      <td class="mono"><strong>${st.toplamPuan}</strong> (${C.kacisHTML(st.harfNotu)})</td>
                      ${olculenOcKodlari.map((kod) => {
                        const h = (st.ocHucreler || {})[kod];
                        if (!h || !h.olculduMu) return '<td class="mono" style="color:#94a3b8;">—</td>';
                        const renk = h.barajiGectiMi ? '#15803d' : '#b91c1c';
                        return `<td class="mono" style="color:${renk}; font-weight:700;">%${h.yuzde} (${h.kazanilanPuan}/${h.azamiPuan}p)</td>`;
                      }).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `
          : '';

        kutuKarneler.innerHTML = `
          ${matrisTabloHTML}
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            ${karneListesi
              .map((kr) => {
                const yanlislar = [
                  ...(kr.dyDetay || []).filter((d) => d.sonuc !== 'DOGRU').map((d, i) => `DY-${d.soruNo || i + 1}`),
                  ...(kr.testDetay || []).filter((t) => t.sonuc !== 'DOGRU').map((t, i) => `TEST-${t.soruNo || i + 1}`)
                ];
                const haftaTekrarListesi = (kumulatifRapor.bireyselTekrarOnerileri && kumulatifRapor.bireyselTekrarOnerileri[kr.ogrNo]) || [];
                const haftaTekrarHTML = haftaTekrarListesi.length > 0
                  ? `<div style="margin-top:4px; font-size:7.2pt; color:#7c2d12; background:#fff7ed; padding:3px 5px; border-radius:4px;"><strong>📚 Haftalık Konu Tekrar Reçetesi:</strong> ${haftaTekrarListesi.map((t) => C.kacisHTML(t)).join(' · ')}</div>`
                  : '';
                return `
                  <div style="border:1.5px dashed #1e293b; padding:10px; border-radius:6px; background:#fff; color:#000; font-size:8.5pt;">
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #000; padding-bottom:4px; margin-bottom:6px;">
                      <div>
                        <strong>🎓 ${C.kacisHTML(kr.adSoyad)} (${C.kacisHTML(kr.ogrNo)})</strong>
                        <div style="font-size:7.2pt; color:#333;">${C.kacisHTML(yapi.ders.kod)} - ${C.kacisHTML(yapi.ders.ad)} · ${C.kacisHTML(kr.grup)} Grubu</div>
                      </div>
                      <div style="text-align:right;">
                        <strong style="font-size:10pt;">${kr.toplamPuan} / 100 (${C.kacisHTML(kr.harfNotu)})</strong>
                        <div style="font-size:7pt;">Sınıf Sırası: ${kr.sira} / ${kr.toplamOgrenci} · Ort: ${kr.sinifOrtalama}</div>
                      </div>
                    </div>
                    <div style="margin-bottom:5px; font-size:7.6pt;">
                      <strong>Kazanım Başarıları:</strong>
                      ${(kr.kazanimOzet || []).map((kz) => `${C.kacisHTML(kz.kod)}: <strong>%${kz.yuzde}</strong>`).join(' · ')}
                    </div>
                    <div style="font-size:7.4pt; color:#b91c1c;">
                      ${yanlislar.length > 0
                        ? `<strong>Tekrar Edilmesi Önerilen Sorular:</strong> ${C.kacisHTML(yanlislar.join(' | '))}`
                        : '<span style="color:#15803d;">🎉 Tüm sorularda tam başarı!</span>'}
                    </div>
                    ${haftaTekrarHTML}
                  </div>
                `;
              })
              .join('')}
          </div>
        `;
      }
    }
  }

  /* ------------------------------------------------------------------------
     SEKME 5: SINIF & ÖĞRENCİ LİSTESİ + SON 2 HANE ÇAKIŞMA ANALİZÖRÜ
     ------------------------------------------------------------------------ */
  function guncelleSalonUI() {
    const yerlesim = aktifDersSalonYerlesimi();
    const harita = {};
    yerlesim.yerlesim.forEach((k) => k.ogrenciler.forEach((o) => { harita[o.ogrNo] = k.salon.ad; }));

    const kutu = document.getElementById('kutu-salon-listesi');
    if (kutu) {
      kutu.innerHTML = durum.salonlar
        .map((s, i) => `
          <div style="display:grid; grid-template-columns: 1fr 90px 1fr 32px; gap:0.3rem; align-items:center;">
            <input type="text" data-salon-ad="${i}" value="${C.kacisHTML(s.ad)}" placeholder="Salon adı" aria-label="Salon adı" />
            <input type="number" min="1" max="1000" data-salon-kontenjan="${i}" value="${s.kontenjan}" aria-label="Kontenjan" title="Kontenjan" />
            <input type="text" data-salon-gozetmen="${i}" value="${C.kacisHTML((s.gozetmenler || []).filter(Boolean).join(', '))}" placeholder="Gözetmenler (virgülle)" aria-label="Gözetmenler" />
            <button type="button" class="btn btn-tehlike btn-kucuk" data-salon-sil="${i}" title="Salonu sil" ${durum.salonlar.length <= 1 ? 'disabled' : ''}>✕</button>
          </div>
        `)
        .join('');
    }

    const ozet = document.getElementById('rozet-salon-ozet');
    if (ozet) {
      const ek = yerlesim.ekSalonSayisi;
      ozet.className = yerlesim.yetersiz ? 'rozet rozet-sari' : 'rozet rozet-yesil';
      ozet.textContent = `${yerlesim.toplamOgrenci} öğrenci · ${yerlesim.yerlesim.length} salon · kontenjan ${yerlesim.toplamKontenjan}${ek ? ` (+${ek} ek salon)` : ''}`;
    }
    const etiketSalon = document.getElementById('etiket-salon-ozet');
    if (etiketSalon) etiketSalon.textContent = `${yerlesim.yerlesim.length} salon · ${yerlesim.toplamOgrenci} öğrenci${yerlesim.yetersiz ? ' · ek salon açıldı' : ''}`;
    const kutuYerlesim = document.getElementById('kutu-salon-yerlesim');
    if (kutuYerlesim) {
      kutuYerlesim.innerHTML = (yerlesim.toplamOgrenci === 0
        ? '<span style="color:var(--metin-soluk);">Seçili derste öğrenci yok.</span>'
        : yerlesim.yerlesim
          .map((k) => `<span class="rozet ${k.salon.ek ? 'rozet-sari' : 'rozet-mavi'}" style="margin:0 0.3rem 0.3rem 0;">${C.kacisHTML(k.salon.ad)}: ${k.ogrenciler.length}/${k.salon.kontenjan}</span>`)
          .join('')) + (yerlesim.yetersiz ? '<div style="color:var(--uyari); margin-top:0.25rem;">⚠️ Toplam kontenjan yetersiz: eksik öğrenciler için ek salon açıldı. Kontenjan ekleyebilirsiniz.</div>' : '');
    }
    const dagitim = document.getElementById('ayar-dagitim-modu');
    if (dagitim && dagitim.value !== durum.dagitimModu) dagitim.value = durum.dagitimModu;
    return harita;
  }

  function guncelleOgrenciListesiSekmesi() {
    document.getElementById('rozet-ogrenci-sayisi').textContent = String(durum.ogrenciler.length);
    const salonHaritasi = guncelleSalonUI();
    const tbody = document.getElementById('tablo-ogrenci-listesi');
    if (tbody) {
      tbody.innerHTML = durum.ogrenciler.length === 0
        ? '<tr><td colspan="7" style="text-align:center; color:var(--metin-soluk);">Bu derse kayıtlı öğrenci yok. CSV/Excel yükleyin veya öğrenci ekleyin.</td></tr>'
        : durum.ogrenciler
        .map((o, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td class="mono">${C.kacisHTML(o.ogrNo)}</td>
            <td class="mono"><span class="rozet rozet-mavi">${C.kacisHTML(String(o.ogrNo).slice(-2))}</span></td>
            <td><strong>${C.kacisHTML(o.adSoyad)}</strong></td>
            <td>${C.kacisHTML(o.bolum || 'Genel')}</td>
            <td><span class="rozet rozet-mor">${C.kacisHTML(salonHaritasi[o.ogrNo] || '-')}</span></td>
            <td>
              <button type="button" class="btn btn-tehlike btn-kucuk" data-sil-ogrenci="${C.kacisHTML(o.ogrNo)}">Sil</button>
            </td>
          </tr>
        `)
        .join('');
    }

    const simSec = document.getElementById('sim-ogrenci-sec');
    if (simSec) {
      simSec.innerHTML = durum.ogrenciler
        .map((o) => `<option value="${C.kacisHTML(o.ogrNo)}">${C.kacisHTML(o.adSoyad)} (Son 2: ${C.kacisHTML(String(o.ogrNo).slice(-2))})</option>`)
        .join('');
    }

    const baskiOgrSec = document.getElementById('baski-ogrenci-sec');
    if (baskiOgrSec) {
      const mevcutSecili = baskiOgrSec.value;
      baskiOgrSec.innerHTML = durum.ogrenciler
        .map((o, idx) => `<option value="${C.kacisHTML(o.ogrNo)}">${idx + 1}. ${C.kacisHTML(o.adSoyad)} (${C.kacisHTML(o.ogrNo)})</option>`)
        .join('');
      if (mevcutSecili && durum.ogrenciler.some((o) => o.ogrNo === mevcutSecili)) {
        baskiOgrSec.value = mevcutSecili;
      }
    }

    const son2Harita = new Map();
    for (const o of durum.ogrenciler) {
      const s2 = String(o.ogrNo).slice(-2);
      if (!son2Harita.has(s2)) son2Harita.set(s2, []);
      son2Harita.get(s2).push(o.adSoyad);
    }
    const cakismanlar = Array.from(son2Harita.entries()).filter(([, liste]) => liste.length > 1);
    const kutuCakisma = document.getElementById('kutu-son2-cakisma-rapor');
    const seritCakisma = document.getElementById('serit-son2-cakisma');
    const etiketCakismaSerit = document.getElementById('etiket-son2-cakisma-serit');
    const aktifKimlikModu = (document.getElementById('ayar-kimlik-modu') && document.getElementById('ayar-kimlik-modu').value) || 'son2';
    if (seritCakisma) {
      if (cakismanlar.length > 0 && aktifKimlikModu === 'son2') {
        const ornekStr = cakismanlar.slice(0, 3).map(([kod]) => `..${kod}`).join(', ');
        if (etiketCakismaSerit) {
          etiketCakismaSerit.textContent = `${cakismanlar.length} numarada son 2 hane çakışması var (${ornekStr}). Tekil eşleşme için Son 3 Hane moduna geçebilirsiniz.`;
        }
        seritCakisma.hidden = false;
      } else {
        seritCakisma.hidden = true;
      }
    }
    if (kutuCakisma) {
      if (cakismanlar.length === 0) {
        kutuCakisma.innerHTML = `<span class="rozet rozet-yesil">Çakışma Yok</span> Sınıfınızdaki tüm öğrencilerin son 2 hanesi birbirinden farklıdır; Son 2 Hane optik modu %100 tekil eşleşir.`;
      } else {
        kutuCakisma.innerHTML = cakismanlar
          .map(([kod, isimler]) => `<div style="margin-bottom:4px;"><span class="rozet rozet-sari">Sonu ${C.kacisHTML(kod)}</span>: ${C.kacisHTML(isimler.join(' & '))} (Okuma sırasında tek dokunuşla seçilir veya Son 3 Hane yapılır)</div>`)
          .join('');
      }
    }
  }

  /* ------------------------------------------------------------------------
     SEKME 6: ONLINE SINAV VE ZERO-TRUST KİOSK KARANTİNA KILIDI
     ------------------------------------------------------------------------ */
  function guncelleCanliSifreRozetleri() {
    const sifreEl = document.getElementById('kiosk-sifre');
    const tekrarEl = document.getElementById('kiosk-sifre-tekrar');
    if (!sifreEl || !tekrarEl) return;

    const k = C.kontrolCanliSifreKurallari(sifreEl.value, tekrarEl.value);
    const ayarlaRozet = (id, ok, metin) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = ok ? 'rozet rozet-yesil' : 'rozet rozet-kirmizi';
      el.textContent = `${ok ? '🟢 ✓' : '⚪'} ${metin}`;
    };

    ayarlaRozet('kr-uzunluk', k.uzunlukOk, 'En az 8 karakter');
    ayarlaRozet('kr-buyuk', k.buyukHarfOk, 'BÜYÜK harf (A-Z)');
    ayarlaRozet('kr-kucuk', k.kucukHarfOk, 'küçük harf (a-z)');
    ayarlaRozet('kr-rakam', k.rakamOk, 'Sayı / Rakam (0-9)');
    ayarlaRozet('kr-simge', k.simgeOk, 'Simge (!@#$%^&*.)');
    ayarlaRozet('kr-eslesme', k.eslesmeOk, 'Şifre tekrarı eşleşiyor');
  }

  function guncelleKioskOgrenciSinavListesiUI() {
    const ogrNoEl = document.getElementById('kiosk-ogr-no');
    const adSoyadEl = document.getElementById('kiosk-ad-soyad');
    const listeKutu = document.getElementById('kiosk-ogrenci-sinav-listesi');
    const rozetSayi = document.getElementById('rozet-kiosk-sinav-sayisi');
    const salonSatir = document.getElementById('kiosk-salon-kodu-satir');
    const dinamikKuralRozet = document.getElementById('kiosk-dinamik-ihlal-kurali');
    if (!listeKutu) return;

    const ogrNo = ogrNoEl ? String(ogrNoEl.value || '').trim() : '';
    const kayitliOgr = (durum.ogrenciKayitlari || durum.ogrenciler || []).find((o) => String(o.ogrNo) === ogrNo);
    if (kayitliOgr && adSoyadEl && (!adSoyadEl.dataset.elleDegisti || !adSoyadEl.value.trim())) {
      adSoyadEl.value = kayitliOgr.adSoyad;
    }

    const tumSinavlar = Array.isArray(durum.onlineSinavListesi) && durum.onlineSinavListesi.length > 0
      ? durum.onlineSinavListesi
      : (durum.onlineSinav && durum.onlineSinav.sinavId && durum.onlineSinav.aktif ? [durum.onlineSinav] : []);

    // Öğrenci belirli derslere kayıtlıysa önce o derslerin sınavlarını filtrele (hiç eşleşme yoksa tüm tanımlı sınavları göster)
    let ogrenciSinavlari = tumSinavlar;
    if (kayitliOgr && Array.isArray(kayitliOgr.dersIdler) && kayitliOgr.dersIdler.length > 0) {
      const dersEslesen = tumSinavlar.filter((s) => !s.dersId || kayitliOgr.dersIdler.includes(s.dersId));
      if (dersEslesen.length > 0) ogrenciSinavlari = dersEslesen;
    }

    if (rozetSayi) {
      rozetSayi.textContent = `${ogrenciSinavlari.length} Sınav`;
    }

    if (ogrenciSinavlari.length === 0) {
      listeKutu.innerHTML = '<div style="padding:0.55rem; color:var(--metin-soluk); font-size:0.82rem;">Henüz size tanımlanmış bir online sınav bulunmuyor.</div>';
      if (salonSatir) salonSatir.style.display = 'none';
      return;
    }

    const mevcutSeciliInput = listeKutu.querySelector('input[name="kiosk-secili-sinav"]:checked');
    const mevcutSeciliId = mevcutSeciliInput ? mevcutSeciliInput.value : '';
    const varsayilanSecili =
      ogrenciSinavlari.find((s) => s.sinavId === mevcutSeciliId) ||
      ogrenciSinavlari.find((s) => s.aktif && durum.onlineSinav && durum.onlineSinav.sinavId === s.sinavId) ||
      ogrenciSinavlari.find((s) => s.aktif) ||
      ogrenciSinavlari[0];

    listeKutu.innerHTML = ogrenciSinavlari
      .map((s) => {
        const ders = durum.dersler.find((d) => d.id === s.dersId) || { kod: 'GENEL', ad: 'Genel Ders' };
        const aktifMi = Boolean(s.aktif && (!durum.onlineSinav || durum.onlineSinav.sinavId === s.sinavId ? durum.onlineSinav.aktif : s.aktif));
        const topSoru = (Number(s.dySayisi) || 0) + (Number(s.testSayisi) || 0) + (Number(s.klasikSayisi) || 0);
        const tamamlananOturum = Array.isArray(s.oturumlar)
          ? s.oturumlar.find((ot) => String(ot.ogrNo) === ogrNo)
          : null;
        const seciliMi = varsayilanSecili && varsayilanSecili.sinavId === s.sinavId;

        let durumRozetHtml = `<span class="rozet ${aktifMi ? 'rozet-yesil' : 'rozet-sari'}">${aktifMi ? '🟢 Aktif — Sınava Girilebilir' : '⏳ Planlandı'}</span>`;
        if (tamamlananOturum) {
          durumRozetHtml = `<span class="rozet rozet-mavi">✅ Tamamlandı (Puan: ${tamamlananOturum.puan})</span>`;
        }

        return `
          <label style="display:flex; align-items:center; justify-content:space-between; gap:0.6rem; padding:0.6rem 0.75rem; background:#ffffff; border:${seciliMi ? '2px solid var(--birincil)' : '1px solid var(--kenar)'}; border-radius:7px; cursor:pointer;">
            <div style="display:flex; align-items:flex-start; gap:0.55rem;">
              <input type="radio" name="kiosk-secili-sinav" value="${C.kacisHTML(s.sinavId)}" ${seciliMi ? 'checked' : ''} style="width:17px; height:17px; margin-top:3px; accent-color:var(--birincil); flex-shrink:0;" />
              <div>
                <div style="font-weight:800; font-size:0.85rem; color:var(--metin);">
                  ${C.kacisHTML(ders.kod)} — ${C.kacisHTML(ders.ad)} · <span style="color:var(--birincil);">${C.kacisHTML(s.baslik || s.sinavId)}</span>
                </div>
                <div class="mono" style="font-size:0.74rem; color:var(--metin-ikincil); margin-top:2px;">
                  Kod: <strong>${C.kacisHTML(s.sinavId)}</strong> · Tür: ${C.kacisHTML(s.sinavTuru || 'Vize')} · Süre: <strong>${s.sureDk || 40} dk</strong> · Soru: <strong>${topSoru}</strong> (${s.dySayisi || 0} DY, ${s.testSayisi || 0} Test${s.klasikSayisi ? `, ${s.klasikSayisi} Kl.` : ''})
                </div>
              </div>
            </div>
            <div style="flex-shrink:0;">
              ${durumRozetHtml}
            </div>
          </label>
        `;
      })
      .join('');

    if (varsayilanSecili) {
      const kalanSureRozet = document.getElementById('kiosk-kalan-sure');
      if (kalanSureRozet && !durum.kioskOturum) {
        kalanSureRozet.textContent = `${String(varsayilanSecili.sureDk || 40).padStart(2, '0')}:00`;
      }
      if (salonSatir) {
        salonSatir.style.display = varsayilanSecili.erisimKodu ? 'block' : 'none';
      }
      if (dinamikKuralRozet) {
        const maksIhlalSecEl = document.getElementById('online-maks-ihlal');
        const mIhlal = varsayilanSecili.maksIhlal !== undefined && varsayilanSecili.maksIhlal !== null
          ? Number(varsayilanSecili.maksIhlal)
          : (maksIhlalSecEl ? (parseInt(maksIhlalSecEl.value, 10) || 0) : 1);
        dinamikKuralRozet.textContent = mIhlal === 1
          ? '🛑 1 İhlalde Anında Sınav Bitirilir (Sıfır Tolerans)'
          : (mIhlal > 1 ? `🚨 ${mIhlal} İhlalde Sınav Otomatik Bitirilir` : '⚠️ Tüm İhlaller Delil Loguna Raporlanır');
      }
    }
  }

  async function baslatKioskOgrenciOturumu() {
    const ogrNo = (document.getElementById('kiosk-ogr-no').value || '').trim();
    const adSoyad = (document.getElementById('kiosk-ad-soyad').value || '').trim();
    const eposta = (document.getElementById('kiosk-eposta').value || '').trim();
    const telefon = (document.getElementById('kiosk-telefon').value || '').trim();
    const sifre = document.getElementById('kiosk-sifre').value || '';
    const sifreTekrar = document.getElementById('kiosk-sifre-tekrar').value || '';
    const okudumOnayEl = document.getElementById('kiosk-okudum-onay');
    const hataKutu = document.getElementById('kiosk-hata-kutu');
    hataKutu.hidden = true;

    if (!ogrNo || !adSoyad) {
      hataKutu.textContent = 'Lütfen öğrenci numaranızı ve ad-soyadınızı eksiksiz giriniz.';
      hataKutu.hidden = false;
      return;
    }

    if (okudumOnayEl && !okudumOnayEl.checked) {
      hataKutu.textContent = '⚠️ Sınava başlayabilmek için sınav güvenlik kurallarını ve delil log aydınlatma metnini "Okudum, Anladım, Kabul Ediyorum" kutucuğunu işaretleyerek onaylamanız zorunludur.';
      hataKutu.hidden = false;
      return;
    }

    const kayitliOgr = durum.ogrenciler.find((o) => String(o.ogrNo) === ogrNo);
    if (!kayitliOgr || !kayitliOgr.ilkKayitTamam) {
      const dogrulama = C.dogrulaOgrenciIlkKayit({ eposta, telefon, sifre, sifreTekrar });
      if (!dogrulama.gecerli) {
        hataKutu.textContent = dogrulama.hata;
        hataKutu.hidden = false;
        return;
      }
      if (kayitliOgr) {
        kayitliOgr.eposta = dogrulama.eposta;
        kayitliOgr.telefon = dogrulama.telefon;
        kayitliOgr.ilkKayitTamam = true;
      } else {
        durum.ogrenciKayitlari.push({
          dersIdler: [durum.aktifDersId],
          ogrNo,
          adSoyad,
          bolum: 'Genel',
          eposta: dogrulama.eposta,
          telefon: dogrulama.telefon,
          ilkKayitTamam: true
        });
      }
      verileriKaydet();
    }

    const seciliSinavRadio = document.querySelector('input[name="kiosk-secili-sinav"]:checked');
    const seciliSinavId = seciliSinavRadio ? seciliSinavRadio.value : '';
    const seciliListeSinavi = seciliSinavId && Array.isArray(durum.onlineSinavListesi)
      ? durum.onlineSinavListesi.find((x) => x.sinavId === seciliSinavId)
      : null;
    if (seciliListeSinavi) {
      durum.onlineSinav = { ...seciliListeSinavi };
    }

    const yapi = okuAktifSinavYapisi();
    const onl = durum.onlineSinav || {};
    if (onl.erisimKodu) {
      const girilenSalonKodu = ((document.getElementById('kiosk-salon-kodu') && document.getElementById('kiosk-salon-kodu').value) || '').trim();
      if (girilenSalonKodu !== String(onl.erisimKodu).trim()) {
        hataKutu.textContent = '🔑 Girdiğiniz Salon / Sınav Giriş Kodu hatalı. Lütfen gözetmenin paylaştığı kodu kontrol ediniz.';
        hataKutu.hidden = false;
        return;
      }
    }
    const hedefDersId = onl.dersId || yapi.ders.id;
    let dersHavuzSorulari = durum.sorular.filter((s) => !s.arsivde && (s.dersId === hedefDersId || s.dersId === 'genel'));
    if (dersHavuzSorulari.length === 0 && Array.isArray(yapi.tumSeciliSorular) && yapi.tumSeciliSorular.length > 0) {
      dersHavuzSorulari = yapi.tumSeciliSorular;
    }
    if (onl.haftaKapsam === 'vize') {
      const vizeSorular = dersHavuzSorulari.filter((s) => C.normalizeHaftaNo(s.hafta, 1) <= 7);
      if (vizeSorular.length >= 2) dersHavuzSorulari = vizeSorular;
    }

    const dyAdet = onl.dySayisi !== undefined ? Number(onl.dySayisi) : yapi.dySayisi;
    const testAdet = onl.testSayisi !== undefined ? Number(onl.testSayisi) : yapi.testSayisi;
    const klasikAdet = onl.klasikSayisi !== undefined ? Number(onl.klasikSayisi) : 0;

    // Öğrenciye özel sınav üretimi:
    let kisiyeOzelSorular = C.uretKisiyeOzelOnlineSinav(
      dersHavuzSorulari,
      dyAdet,
      testAdet,
      onl.kisiyeOzel !== false ? ogrNo : 'SABIT',
      onl.sinavId || 'SINAV-2026-VIZE'
    );
    if (klasikAdet > 0) {
      const klasikler = dersHavuzSorulari.filter((s) => s.tur === 'klasik').slice(0, klasikAdet);
      kisiyeOzelSorular.push(...klasikler);
    }

    // HTTP modunda sunucu doğrulaması ZORUNLUDUR (Sıfır Güven & İyimser Giriş Yasağı: yalnızca 200 OK ve token ile oturum başlar)
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      try {
        const girilenSalonKodu = ((document.getElementById('kiosk-salon-kodu') && document.getElementById('kiosk-salon-kodu').value) || '').trim();
        const yanit = await fetch('/api/ogrenci-oturum-baslat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ogrNo, adSoyad, ...(girilenSalonKodu ? { erisimKodu: girilenSalonKodu } : {}) })
        });
        let veri = null;
        try {
          veri = await yanit.json();
        } catch (_) {}

        if (!yanit.ok || !veri || !veri.token) {
          sessionStorage.removeItem('kiosk_token');
          sessionStorage.removeItem('AKTIF_KIOSK_OTURUM_V1');
          durum.kioskOturum = null;
          const sunucuHata = (veri && veri.hata)
            ? veri.hata
            : `Sunucu sınav oturumunu başlatamadı (HTTP ${yanit.status}). Lütfen gözetmene başvurunuz.`;
          hataKutu.textContent = sunucuHata;
          hataKutu.hidden = false;
          return;
        }

        sessionStorage.setItem('kiosk_token', veri.token);
        if (Number(veri.bitisMs) > Date.now()) {
          onl.__sunucuBitisMs = Number(veri.bitisMs);
        }
        if (Array.isArray(veri.sorular) && veri.sorular.length > 0) {
          kisiyeOzelSorular = veri.sorular;
        }
      } catch (_) {
        sessionStorage.removeItem('kiosk_token');
        sessionStorage.removeItem('AKTIF_KIOSK_OTURUM_V1');
        durum.kioskOturum = null;
        hataKutu.textContent = 'Sunucuya ulaşılamadığı için sınav oturumu başlatılamadı (503 / Ağ Hatası).';
        hataKutu.hidden = false;
        return;
      }
    }

    const tamEkranZorunluEl = document.getElementById('online-tam-ekran-zorunlu');
    const tamEkranZorunlu = tamEkranZorunluEl ? Boolean(tamEkranZorunluEl.checked) : true;
    const maksIhlalSecEl = document.getElementById('online-maks-ihlal');
    const etkinMaksIhlal = maksIhlalSecEl && maksIhlalSecEl.value !== undefined
      ? (parseInt(maksIhlalSecEl.value, 10) || 0)
      : (Number(onl.maksIhlal) || 0);

    if (window.__kioskBroadcastKanal) {
      try {
        window.__kioskBroadcastKanal.postMessage({ tip: 'KIOSK_YENI_SEKME', ogrNo, adSoyad, zaman: Date.now() });
      } catch (_) {}
    }

    const toplamSn = Math.max(60, (Number(onl.sureDk) || 40) * 60);
    const bitisMs = onl.__sunucuBitisMs && onl.__sunucuBitisMs > Date.now()
      ? onl.__sunucuBitisMs
      : Date.now() + toplamSn * 1000;
    delete onl.__sunucuBitisMs;

    durum.kioskOturum = {
      ogrNo,
      adSoyad,
      sinavId: onl.sinavId || 'SINAV-2026-VIZE',
      sinavBaslik: onl.baslik || 'Online Sınav',
      sorular: kisiyeOzelSorular,
      aktifSoruIdx: 0,
      cevaplar: [],
      ihlalSayisi: 0,
      maksIhlal: etkinMaksIhlal,
      toplamSn,
      kalanSn: Math.max(0, Math.ceil((bitisMs - Date.now()) / 1000)),
      bitisMs,
      tamEkranZorunlu,
      tamEkranAktifOldu: false,
      baslangicGenislik: window.innerWidth || 1024,
      baslangicYukseklik: window.innerHeight || 768,
      sonIhlalMs: 0,
      sonVisibilityIhlalMs: 0
    };

    document.body.classList.add('kiosk-aktif');
    document.getElementById('kiosk-giris-formu').style.display = 'none';
    document.getElementById('kiosk-soru-sahne').style.display = 'block';
    document.getElementById('btn-kiosk-cevap-kilitle').style.display = 'block';
    const uyariKutu = document.getElementById('kiosk-ihlal-uyari-kutusu');
    if (uyariKutu) {
      uyariKutu.hidden = true;
      uyariKutu.style.display = 'none';
    }
    gizleKioskKarantinaPerdesi();

    // Tam Ekran & Klavye Kilidi İsteği (Tarayıcı destekliyorsa)
    if (tamEkranZorunlu && document.documentElement && document.documentElement.requestFullscreen) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          if (durum.kioskOturum) durum.kioskOturum.tamEkranAktifOldu = true;
          if (navigator.keyboard && navigator.keyboard.lock) {
            navigator.keyboard.lock(['Escape']).catch(() => {});
          }
        })
        .catch(() => {});
    }

    // Aynı Tarayıcıda İkinci Sekme Koruması Bildirimi
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('sinav_kiosk_kanal');
        bc.postMessage({ tip: 'KIOSK_OTURUM_BASLADI', ogrNo, sinavId: durum.kioskOturum.sinavId });
        bc.close();
      }
    } catch (_) {}

    const atananSoruIzlem = kisiyeOzelSorular
      .map((ks, idx) => `S${idx + 1}:${ks.id || '-'}(${ks.ocKodu || 'ÖÇ-1'},Orijinal:${ks.orijinalDogruHarf || ks.dogruHarf || ks.dogruDY || '-'}->Kağıt:${ks.dogruHarf || ks.dogruDY || '-'})`)
      .join(', ');
    const onlineIspatHash = C.uretDelilLogHash(`${durum.kioskOturum.sinavId}|${ogrNo}|${atananSoruIzlem}`, 'ONLINE-ISPAT').slice(0, 12);
    durum.kioskOturum.ispatMuhurKodu = `#ISPAT-${onlineIspatHash}`;

    ekleKioskDelilLog(
      'KURALLAR_ONAYLANDI',
      `Öğrenci (${ogrNo} - ${adSoyad}) sınav öncesi güvenlik/karantina kurallarını ve delil log aydınlatma metnini "Okudum, Anladım, Kabul Ediyorum" kutucuğu ile onayladı.`
    );

    ekleKioskDelilLog(
      'OTURUM_BASLADI',
      `Öğrenci (${ogrNo} - ${adSoyad}) ${durum.kioskOturum.sinavId} sınavına başladı. Soru sayısı: ${kisiyeOzelSorular.length}, Süre: ${onl.sureDk || 40} dk, Maks İhlal: ${durum.kioskOturum.maksIhlal || 'Sınırsız (Raporla)'}, İspat Mührü: ${durum.kioskOturum.ispatMuhurKodu}, Atanan Kişiye Özel Soru/Şık Haritası: [${atananSoruIzlem}].`
    );

    gosterKioskAktifSoru();
    guncelleKioskCanliSureUI(durum.kioskOturum);
    kaydetAktifKioskOturumYerel();

    C.kurGuvenliInterval('kiosk-sayac', () => {
      const ot = durum.kioskOturum;
      if (!ot) return;
      if (ot.bitisMs) {
        ot.kalanSn = Math.max(0, Math.ceil((ot.bitisMs - Date.now()) / 1000));
      } else {
        ot.kalanSn = Math.max(0, ot.kalanSn - 1);
      }
      guncelleKioskCanliSureUI(ot);
      kaydetAktifKioskOturumYerel();
      if (ot.kalanSn <= 0) {
        // Süre bittiğinde ekranda açık olan sorunun işaretli yanıtını otomatik kaydet ve sunucuya kilitle
        let sonSoruCevapPaylasimi = null;
        if (ot.aktifSoruIdx < ot.sorular.length) {
          const aktifSoru = ot.sorular[ot.aktifSoruIdx];
          let otomatikDeger = null;
          if (aktifSoru && aktifSoru.tur === 'klasik') {
            const kl = document.getElementById('kiosk-klasik-cevap');
            otomatikDeger = kl ? kl.value.trim() : '';
          } else {
            const secili = document.querySelector('input[name="kiosk-secim"]:checked');
            otomatikDeger = secili ? secili.value : null;
          }
          ot.cevaplar.push(otomatikDeger);
          if ((location.protocol === 'http:' || location.protocol === 'https:') && aktifSoru) {
            const token = sessionStorage.getItem('kiosk_token') || '';
            if (token) {
              sonSoruCevapPaylasimi = fetch('/api/ogrenci-cevap', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  token,
                  ogrNo: ot.ogrNo,
                  soruId: aktifSoru.id || `S-${ot.aktifSoruIdx + 1}`,
                  secim: otomatikDeger || '',
                  sureBittiOtomatik: true
                })
              }).catch(() => null);
              ot.__sonCevapSozu = sonSoruCevapPaylasimi;
            }
          }
        }
        bitirKioskOturumu('Süre Doldu — Otomatik Teslim', { sureBittiOtomatik: true });
      }
    }, 1000);
  }

  function guncelleKioskCanliSureUI(ot) {
    if (!ot) return;
    const kalan = Math.max(0, Number(ot.kalanSn) || 0);
    const toplam = Math.max(1, Number(ot.toplamSn) || 2400);
    const dk = String(Math.floor(kalan / 60)).padStart(2, '0');
    const sn = String(kalan % 60).padStart(2, '0');
    const metin = `${dk}:${sn}`;

    const ustRozet = document.getElementById('kiosk-kalan-sure');
    if (ustRozet) ustRozet.textContent = metin;

    const sakinEtiket = document.getElementById('kiosk-sakin-sure-etiket');
    if (sakinEtiket) {
      sakinEtiket.textContent = kalan > 300 ? `Kalan: ${Math.ceil(kalan / 60)} dk ·` : 'Kalan Süre:';
    }

    const soruSureEl = document.getElementById('kiosk-soru-kalan-sure');
    if (soruSureEl) {
      soruSureEl.textContent = metin;
      soruSureEl.style.color = kalan <= 60 ? 'var(--tehlike)' : (kalan <= 300 ? 'var(--uyari)' : 'var(--metin)');
    }

    const uyariEtiket = document.getElementById('kiosk-sure-uyari-etiket');
    if (uyariEtiket) {
      if (kalan <= 60) {
        uyariEtiket.textContent = 'SON 1 DAKİKA! Süre bitiminde otomatik teslim edilir';
        uyariEtiket.style.color = 'var(--tehlike)';
      } else if (kalan <= 300) {
        uyariEtiket.textContent = 'Son 5 Dakikanın İçindesiniz';
        uyariEtiket.style.color = 'var(--uyari)';
      } else {
        uyariEtiket.textContent = 'Geri Sayım Aktif';
        uyariEtiket.style.color = 'var(--metin-ikincil)';
      }
    }

    const barEl = document.getElementById('kiosk-sure-ilerleme-bar');
    if (barEl) {
      const yuzde = Math.max(0, Math.min(100, (kalan / toplam) * 100));
      barEl.style.width = `${yuzde.toFixed(1)}%`;
      barEl.style.backgroundColor = kalan <= 60 ? 'var(--tehlike)' : (kalan <= 300 ? 'var(--uyari)' : 'var(--birincil)');
    }
  }

  let __onbellekCihazParmakIzi = null;
  let __onbellekIpBilgisi = 'Tespit Ediliyor / Yerel';

  async function sorgulaIstemciIpBilgisi() {
    if (typeof window === 'undefined' || (location.protocol !== 'http:' && location.protocol !== 'https:')) return;
    const yerelSunucuMu = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || '');
    // 1. Cloudflare yerleşik /cdn-cgi/trace uç noktasından gerçek dış IP ve konum bilgisini al
    if (!yerelSunucuMu) {
      try {
        const rTrace = await fetch('/cdn-cgi/trace', { cache: 'no-store' });
        if (rTrace.ok) {
          const metin = await rTrace.text();
          const satirlar = {};
          metin.split('\n').forEach((s) => {
            const i = s.indexOf('=');
            if (i > 0) satirlar[s.slice(0, i).trim()] = s.slice(i + 1).trim();
          });
          if (satirlar.ip) {
            __onbellekIpBilgisi = `${satirlar.ip}${satirlar.loc ? ` (${satirlar.loc}${satirlar.colo ? '/' + satirlar.colo : ''})` : ''}${satirlar.warp && satirlar.warp !== 'off' ? ' [VPN/WARP]' : ''}`;
            return;
          }
        }
      } catch (_) {}
    }

    // 2. Yerel Node.js sunucusu açıksa /api/ag-adresi uç noktasından yerel IP'yi al
    try {
      const rAg = await fetch('/api/ag-adresi', { cache: 'no-store' });
      if (rAg.ok) {
        const v = await rAg.json();
        if (v && Array.isArray(v.adresler) && v.adresler.length > 0) {
          __onbellekIpBilgisi = `${v.adresler[0]} (Yerel Ağ)`;
        }
      }
    } catch (_) {}
  }

  function uretCihazDonanimParmakIzi() {
    if (typeof window === 'undefined') return { cihazId: 'HW-SUNUCU', ozet: 'Sunucu' };
    if (!__onbellekCihazParmakIzi) {
      const nav = window.navigator || {};
      const scr = window.screen || {};
      let gpuModel = 'Standart-GPU';
      try {
        const cnv = document.createElement('canvas');
        const gl = cnv.getContext('webgl') || cnv.getContext('experimental-webgl');
        if (gl) {
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          if (dbg) {
            gpuModel = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || gpuModel).slice(0, 48);
          }
        }
      } catch (_) {}

      const ua = String(nav.userAgent || '');
      let sistemOzet = nav.platform || 'Bilinmeyen-OS';
      if (/Android\s+([\d.]+);\s*([^;)]+)/i.test(ua)) {
        const m = ua.match(/Android\s+([\d.]+);\s*([^;)]+)/i);
        sistemOzet = `Android ${m[1]} (${m[2].trim()})`;
      } else if (/iPhone|iPad/i.test(ua)) {
        sistemOzet = 'iOS (iPhone/iPad)';
      } else if (/Windows NT 10\.0/i.test(ua)) {
        sistemOzet = 'Windows 10/11';
      } else if (/Mac OS X/i.test(ua)) {
        sistemOzet = 'macOS';
      }

      let tarayici = 'Tarayıcı';
      if (/Edg\/([\d.]+)/.test(ua)) tarayici = `Edge/${RegExp.$1.split('.')[0]}`;
      else if (/Chrome\/([\d.]+)/.test(ua)) tarayici = `Chrome/${RegExp.$1.split('.')[0]}`;
      else if (/Firefox\/([\d.]+)/.test(ua)) tarayici = `Firefox/${RegExp.$1.split('.')[0]}`;
      else if (/Version\/([\d.]+).*Safari/.test(ua)) tarayici = `Safari/${RegExp.$1.split('.')[0]}`;

      const cpu = nav.hardwareConcurrency ? `${nav.hardwareConcurrency}Çekirdek` : '';
      const ram = nav.deviceMemory ? `${nav.deviceMemory}GB-RAM` : '';
      const dokunmatik = nav.maxTouchPoints ? `Dokunmatik:${nav.maxTouchPoints}` : 'Masaüstü';
      const saatDilimi = (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || '';
      const hamImza = [
        ua,
        nav.platform || '',
        `${scr.width || 0}x${scr.height || 0}x${scr.colorDepth || 24}`,
        String(window.devicePixelRatio || 1),
        cpu,
        ram,
        dokunmatik,
        gpuModel,
        saatDilimi
      ].join('|');

      const cihazId = `HW-${C.uretDelilLogHash(hamImza).slice(0, 12)}`;
      __onbellekCihazParmakIzi = {
        cihazId,
        sistemOzet: `${sistemOzet} · ${tarayici}`,
        donanimOzet: [cpu, ram, dokunmatik, gpuModel].filter(Boolean).join('/'),
        ekranFiziksel: `${scr.width || 0}x${scr.height || 0}@${window.devicePixelRatio || 1}x`
      };
      sorgulaIstemciIpBilgisi();
    }
    const baglanti = (window.navigator && window.navigator.connection && window.navigator.connection.effectiveType)
      ? `Ağ:${window.navigator.connection.effectiveType.toUpperCase()}`
      : '';
    return {
      cihazId: __onbellekCihazParmakIzi.cihazId,
      metin: [
        `IP:${__onbellekIpBilgisi}`,
        `CihazID(Donanımİmzası):${__onbellekCihazParmakIzi.cihazId}`,
        `Sistem:${__onbellekCihazParmakIzi.sistemOzet}`,
        `Donanım:${__onbellekCihazParmakIzi.donanimOzet}`,
        baglanti,
        `Ekran:${__onbellekCihazParmakIzi.ekranFiziksel}`,
        `Pencere:${window.innerWidth || 0}x${window.innerHeight || 0}`,
        `TamEkran:${Boolean(document.fullscreenElement)}`
      ].filter(Boolean).join(' | ')
    };
  }

  function ekleKioskDelilLog(olayTuru, aciklama, ekVeri = {}) {
    const ot = durum.kioskOturum || ekVeri;
    if (!Array.isArray(durum.kioskDelilLoglari)) durum.kioskDelilLoglari = [];
    const oncekiHash = durum.kioskDelilLoglari.length > 0
      ? durum.kioskDelilLoglari[durum.kioskDelilLoglari.length - 1].olayHash
      : 'GENESIS-00000000';

    const parmakIzi = uretCihazDonanimParmakIzi();
    const ekranStr = parmakIzi.metin;

    const logNesnesi = C.olusturKioskDelilLogKaydi(
      {
        sinavId: (ot && ot.sinavId) || (durum.onlineSinav && durum.onlineSinav.sinavId) || 'SINAV-2026',
        sinavBaslik: (ot && ot.sinavBaslik) || (durum.onlineSinav && durum.onlineSinav.baslik) || 'Online Sınav',
        ogrNo: (ot && ot.ogrNo) || '-',
        adSoyad: (ot && ot.adSoyad) || '-',
        olayTuru,
        aktifSoruNo: ot && ot.sorular ? Math.min(ot.aktifSoruIdx + 1, ot.sorular.length) : 0,
        toplamSoru: ot && ot.sorular ? ot.sorular.length : 0,
        kalanSureSn: ot && ot.kalanSn !== undefined ? ot.kalanSn : 0,
        ihlalSayisi: ot && ot.ihlalSayisi !== undefined ? ot.ihlalSayisi : 0,
        cihazBilgisi: ekranStr,
        aciklama
      },
      oncekiHash
    );

    durum.kioskDelilLoglari.push(logNesnesi);
    verileriKaydet();
    guncelleDelilLogPaneliUI();

    if (location.protocol === 'http:' || location.protocol === 'https:') {
      const aktifToken = sessionStorage.getItem('kiosk_token') || sessionStorage.getItem('hoca_token') || sessionStorage.getItem('omr_hoca_token') || '';
      const basliklar = { 'Content-Type': 'application/json' };
      if (aktifToken) basliklar.Authorization = `Bearer ${aktifToken}`;
      fetch('/api/kiosk-log-kaydet', {
        method: 'POST',
        headers: basliklar,
        body: JSON.stringify(Object.assign({}, logNesnesi, aktifToken ? { token: aktifToken } : {}))
      }).catch(() => {});
    }
    return logNesnesi;
  }

  function gosterKioskKarantinaPerdesi(mesaj) {
    const perde = document.getElementById('kiosk-karantina-perdesi');
    const mesajEl = document.getElementById('kiosk-karantina-mesaj');
    const icerik = document.getElementById('kiosk-soru-icerik');
    const btnKilitle = document.getElementById('btn-kiosk-cevap-kilitle');
    if (mesajEl && mesaj) mesajEl.textContent = mesaj;
    if (perde) perde.style.display = 'block';
    if (icerik) icerik.style.filter = 'blur(12px)';
    if (btnKilitle) btnKilitle.disabled = true;
  }

  function gizleKioskKarantinaPerdesi() {
    const perde = document.getElementById('kiosk-karantina-perdesi');
    const icerik = document.getElementById('kiosk-soru-icerik');
    const btnKilitle = document.getElementById('btn-kiosk-cevap-kilitle');
    if (perde) perde.style.display = 'none';
    if (icerik) icerik.style.filter = 'none';
    if (btnKilitle) btnKilitle.disabled = false;
  }

  function kaydetAktifKioskOturumYerel() {
    try {
      if (durum.kioskOturum) {
        const temizKopya = Object.assign({}, durum.kioskOturum, {
          __sonCevapSozu: undefined,
          sorular: (durum.kioskOturum.sorular || []).map((s) => ({
            no: s.no,
            id: s.id,
            tur: s.tur,
            metin: s.metin,
            siklar: Array.isArray(s.siklar) ? s.siklar.slice() : [],
            ocKodu: s.ocKodu || 'ÖÇ-1',
            hafta: s.hafta
          }))
        });
        sessionStorage.setItem('AKTIF_KIOSK_OTURUM_V1', JSON.stringify(temizKopya));
        localStorage.setItem('SINAV_KIOSK_AKTIF_KARANTINA_V1', JSON.stringify({
          sekmeId: durum.sekmeId,
          ogrNo: durum.kioskOturum.ogrNo,
          sinavId: durum.kioskOturum.sinavId,
          bitisMs: durum.kioskOturum.bitisMs || (Date.now() + 3600000),
          zamanMs: Date.now()
        }));
      } else {
        sessionStorage.removeItem('AKTIF_KIOSK_OTURUM_V1');
        localStorage.removeItem('SINAV_KIOSK_AKTIF_KARANTINA_V1');
      }
    } catch (_) {}
  }

  function gosterKioskAktifSoru() {
    const ot = durum.kioskOturum;
    if (!ot) return;
    if (ot.aktifSoruIdx >= ot.sorular.length) {
      bitirKioskOturumu('Tamamlandı');
      return;
    }
    const s = ot.sorular[ot.aktifSoruIdx];
    document.getElementById('kiosk-soru-sayac').textContent = `Soru ${ot.aktifSoruIdx + 1} / ${ot.sorular.length}`;
    document.getElementById('kiosk-ihlal-sayac').textContent = `Sekme İhlali: ${ot.ihlalSayisi}`;

    ekleKioskDelilLog(
      'SORU_GORUNTULENDI',
      `${ot.aktifSoruIdx + 1}. soru ekrana getirildi (Soru ID: ${s.id || '-'}, Tür: ${s.tur}).`
    );

    const icerik = document.getElementById('kiosk-soru-icerik');
    if (s.tur === 'dy') {
      icerik.innerHTML = `
        <div style="font-weight:700; margin-bottom:0.75rem;">[Doğru / Yanlış] ${C.kacisHTML(s.metin)}</div>
        <label style="display:block; margin-bottom:0.4rem;"><input type="radio" name="kiosk-secim" value="D" /> Doğru (D)</label>
        <label style="display:block;"><input type="radio" name="kiosk-secim" value="Y" /> Yanlış (Y)</label>
      `;
    } else if (s.tur === 'klasik') {
      icerik.innerHTML = `
        <div style="font-weight:700; margin-bottom:0.65rem;">[Açık Uçlu / Klasik] ${C.kacisHTML(s.metin)}</div>
        <textarea id="kiosk-klasik-cevap" rows="4" placeholder="Cevabınızı buraya yazınız..."></textarea>
      `;
    } else {
      const harfler = ['A', 'B', 'C', 'D', 'E'];
      icerik.innerHTML = `
        <div style="font-weight:700; margin-bottom:0.75rem;">${C.kacisHTML(s.metin)}</div>
        ${(s.siklar || [])
          .map((sik, i) => `
            <label style="display:block; margin-bottom:0.4rem;">
              <input type="radio" name="kiosk-secim" value="${harfler[i]}" />
              <strong>${harfler[i]})</strong> ${C.kacisHTML(sik)}
            </label>
          `)
          .join('')}
      `;
    }
  }

  async function bitirKioskOturumu(bitisDurumu = 'Tamamlandı', secenek = {}) {
    C.temizleGuvenliInterval('kiosk-sayac');
    const ot = durum.kioskOturum;
    if (!ot || ot.teslimOnaylandi) return;
    if (ot.bitirmeSuruyor && ot.bitirmeSozu) return ot.bitirmeSozu;

    ot.bitirmeSuruyor = true;
    ot.kioskKasitliCikis = true;
    const sureBittiOtomatik = Boolean(secenek && secenek.sureBittiOtomatik) ||
      String(bitisDurumu || '').toLocaleLowerCase('tr-TR').includes('süre doldu') ||
      (Number(ot.kalanSn) <= 0);

    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    gizleKioskKarantinaPerdesi();

    const icerik = document.getElementById('kiosk-soru-icerik');
    const btnKilitle = document.getElementById('btn-kiosk-cevap-kilitle');
    const hataKutu = document.getElementById('kiosk-hata-kutu');
    if (btnKilitle) btnKilitle.style.display = 'none';
    if (hataKutu) hataKutu.hidden = true;

    const uretOnlineRaporDetaylari = (sunucuVeri = null) => {
      if (sunucuVeri && Array.isArray(sunucuVeri.dyDetay) && Array.isArray(sunucuVeri.testDetay)) {
        const dyDetay = sunucuVeri.dyDetay;
        const testDetay = sunucuVeri.testDetay;
        return {
          dyDetay,
          testDetay,
          dyDogru: dyDetay.filter((d) => d.sonuc === 'DOGRU').length,
          dyYanlis: dyDetay.filter((d) => d.sonuc === 'YANLIS').length,
          dyBos: dyDetay.filter((d) => d.sonuc === 'BOS').length,
          testDogru: testDetay.filter((t) => t.sonuc === 'DOGRU').length,
          testYanlis: testDetay.filter((t) => t.sonuc === 'YANLIS').length,
          testBos: testDetay.filter((t) => t.sonuc === 'BOS').length
        };
      }
      const dyDetay = [];
      const testDetay = [];
      let dyNo = 0;
      let testNo = 0;
      (ot.sorular || []).forEach((s, idx) => {
        if (!s) return;
        const verilenRaw = (ot.cevaplar && ot.cevaplar[idx] !== undefined && ot.cevaplar[idx] !== null) ? String(ot.cevaplar[idx]).trim() : '';
        if (s.tur === 'dy') {
          dyNo++;
          const dogruCevap = String(s.dogruDY || '').trim().toUpperCase();
          const verilen = verilenRaw.toUpperCase();
          const sonuc = !verilen ? 'BOS' : (dogruCevap ? (verilen === dogruCevap ? 'DOGRU' : 'YANLIS') : 'ISARETLI');
          dyDetay.push({ soruNo: dyNo, soruId: s.id || '', verilen: verilen || '-', dogruCevap: dogruCevap || '-', sonuc, ocKodu: s.ocKodu || 'ÖÇ-1' });
        } else if (s.tur === 'test') {
          testNo++;
          const dogruCevap = String(s.dogruHarf || '').trim().toUpperCase();
          const verilen = verilenRaw.toUpperCase();
          const sonuc = !verilen ? 'BOS' : (dogruCevap ? (verilen === dogruCevap ? 'DOGRU' : 'YANLIS') : 'ISARETLI');
          testDetay.push({ soruNo: testNo, soruId: s.id || '', verilen: verilen || '-', dogruCevap: dogruCevap || '-', sonuc, ocKodu: s.ocKodu || 'ÖÇ-1' });
        }
      });
      return {
        dyDetay,
        testDetay,
        dyDogru: dyDetay.filter((d) => d.sonuc === 'DOGRU').length,
        dyYanlis: dyDetay.filter((d) => d.sonuc === 'YANLIS').length,
        dyBos: dyDetay.filter((d) => d.sonuc === 'BOS').length,
        testDogru: testDetay.filter((t) => t.sonuc === 'DOGRU').length,
        testYanlis: testDetay.filter((t) => t.sonuc === 'YANLIS').length,
        testBos: testDetay.filter((t) => t.sonuc === 'BOS').length
      };
    };

    const kaydetVeGosterYetkiliSonuc = (yetkiliDogru, yetkiliPuan, yetkiliFisKodu, sunucuVeri = null) => {
      ot.teslimOnaylandi = true;
      ot.bitirmeSuruyor = false;
      const detaylar = uretOnlineRaporDetaylari(sunucuVeri);
      const bitisLog = ekleKioskDelilLog(
        'OTURUM_BITTI',
        `Sınav oturumu sonlandırıldı. Bitiş durumu: ${bitisDurumu}. Doğru: ${yetkiliDogru}/${ot.sorular.length}, Puan: ${yetkiliPuan}, Toplam İhlal: ${ot.ihlalSayisi}, Teslim Fişi: ${yetkiliFisKodu}.`
      );
      const oturumKaydi = {
        ogrNo: ot.ogrNo,
        adSoyad: ot.adSoyad,
        sinavId: ot.sinavId || durum.onlineSinav.sinavId,
        durum: bitisDurumu,
        sureBittiOtomatik,
        ihlalSayisi: ot.ihlalSayisi,
        puan: yetkiliPuan,
        teslimFisKodu: yetkiliFisKodu,
        dyDogru: detaylar.dyDogru,
        dyYanlis: detaylar.dyYanlis,
        dyBos: detaylar.dyBos,
        testDogru: detaylar.testDogru,
        testYanlis: detaylar.testYanlis,
        testBos: detaylar.testBos,
        dyDetay: detaylar.dyDetay,
        testDetay: detaylar.testDetay
      };
      const mevcutOtIdx = durum.onlineSinav.oturumlar.findIndex(
        (x) => x && x.ogrNo === oturumKaydi.ogrNo && (x.sinavId || '') === (oturumKaydi.sinavId || '')
      );
      if (mevcutOtIdx >= 0) durum.onlineSinav.oturumlar[mevcutOtIdx] = oturumKaydi;
      else durum.onlineSinav.oturumlar.push(oturumKaydi);

      const aktifListeKaydi = durum.onlineSinavListesi.find((x) => x.sinavId === oturumKaydi.sinavId);
      if (aktifListeKaydi) {
        if (!Array.isArray(aktifListeKaydi.oturumlar)) aktifListeKaydi.oturumlar = [];
        const lIdx = aktifListeKaydi.oturumlar.findIndex(
          (x) => x && x.ogrNo === oturumKaydi.ogrNo && (x.sinavId || '') === (oturumKaydi.sinavId || '')
        );
        if (lIdx >= 0) aktifListeKaydi.oturumlar[lIdx] = oturumKaydi;
        else aktifListeKaydi.oturumlar.push(oturumKaydi);
      }
      verileriKaydet();

      if (icerik) {
        const zincirKisa = bitisLog && bitisLog.olayHash ? bitisLog.olayHash.slice(0, 16) : 'MUHUR';
        icerik.innerHTML = `
          <div style="text-align:center; padding:1rem;">
            <h3 style="color:var(--basari); margin-bottom:0.4rem;">✅ Sınavınız Güvenle Tamamlandı (${C.kacisHTML(bitisDurumu)})</h3>
            <p>Öğrenci: <strong>${C.kacisHTML(ot.adSoyad)} (${C.kacisHTML(ot.ogrNo)})</strong></p>
            <p style="margin-top:0.35rem;">Doğru: <strong>${yetkiliDogru} / ${ot.sorular.length}</strong> · Puan: <strong>${yetkiliPuan}</strong> · Sekme İhlali: <strong>${ot.ihlalSayisi}</strong></p>
            <div style="margin-top:0.5rem; font-family:var(--font-mono); font-size:0.78rem; padding:6px 10px; border:1px dashed var(--basari); border-radius:6px; display:inline-block;">
              🛡️ Mühürlü Teslim Fişi: <strong>${C.kacisHTML(yetkiliFisKodu)}</strong> · Zincir SHA-256: <strong>#${C.kacisHTML(zincirKisa)}</strong>
            </div>
          </div>
        `;
      }

      sessionStorage.removeItem('kiosk_token');
      document.getElementById('kiosk-giris-formu').style.display = 'block';
      document.body.classList.remove('kiosk-aktif');
      durum.kioskOturum = null;
      kaydetAktifKioskOturumYerel();
      guncelleOnlineOturumTablosu();
      guncelleDelilLogPaneliUI();
      guncelleKioskOgrenciSinavListesiUI();
    };

    // HTTP / HTTPS modunda SIFIR İYİMSER TESLİM: Sunucu 200 OK ve teslimKodu dönmeden puan, fiş veya oturum satırı ASLA üretilmez!
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      if (icerik) {
        icerik.innerHTML = `
          <div style="text-align:center; padding:1rem; font-weight:700; color:var(--birincil);">
            ⏳ Sınav tesliminiz sunucuda doğrulanıp mühürleniyor, lütfen bekleyiniz...
          </div>
        `;
      }

      const gosterTeslimHatasi = (durumKodu, sunucuMesaji) => {
        if (ot.teslimOnaylandi) return;
        ot.bitirmeSuruyor = false;
        ot.bitirmeSozu = null;
        const yetkiHatasiMi = durumKodu === 401 || durumKodu === 403;
        if (yetkiHatasiMi) {
          sessionStorage.removeItem('kiosk_token');
          sessionStorage.removeItem('AKTIF_KIOSK_OTURUM_V1');
          durum.kioskOturum = null;
        }
        if (hataKutu) {
          hataKutu.textContent = sunucuMesaji;
          hataKutu.hidden = false;
        }
        if (icerik) {
          icerik.innerHTML = `
            <div style="padding:1rem; border:1.5px solid var(--tehlike); background:var(--tehlike-acik); color:var(--tehlike); border-radius:8px; text-align:center;">
              <h3 style="margin:0 0 0.45rem; color:var(--tehlike);">⚠️ Sınav Teslimi Sunucu Tarafından Onaylanamadı (HTTP ${durumKodu || 'Ağ'})</h3>
              <p style="margin:0 0 0.65rem; font-weight:600;">${C.kacisHTML(sunucuMesaji)}</p>
              <div style="display:flex; justify-content:center; gap:0.5rem; flex-wrap:wrap;">
                ${!yetkiHatasiMi ? '<button type="button" class="btn btn-birincil btn-kucuk" id="btn-kiosk-teslim-tekrar">🔄 Teslimi Tekrar Dene</button>' : ''}
                <button type="button" class="btn btn-kucuk" id="btn-kiosk-gozetmen-don">↩️ Giriş Ekranına Dön</button>
              </div>
            </div>
          `;
          const btnTekrar = document.getElementById('btn-kiosk-teslim-tekrar');
          if (btnTekrar) {
            btnTekrar.addEventListener('click', () => {
              bitirKioskOturumu(bitisDurumu);
            });
          }
          const btnDon = document.getElementById('btn-kiosk-gozetmen-don');
          if (btnDon) {
            btnDon.addEventListener('click', () => {
              document.getElementById('kiosk-soru-sahne').style.display = 'none';
              document.getElementById('kiosk-giris-formu').style.display = 'block';
              document.body.classList.remove('kiosk-aktif');
              if (hataKutu) hataKutu.hidden = false;
            });
          }
        }
      };

      ot.bitirmeSozu = (async () => {
        try {
          if (ot.__sonCevapSozu) {
            try { await ot.__sonCevapSozu; } catch (_) {}
          }
          const token = sessionStorage.getItem('kiosk_token') || '';
          const yanit = await fetch('/api/ogrenci-sinav-bitir', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              token,
              ogrNo: ot.ogrNo,
              bitisDurumu,
              ihlalSayisi: ot.ihlalSayisi,
              sureBittiOtomatik
            })
          });
          let veri = null;
          try { veri = await yanit.json(); } catch (_) {}

          if (!yanit.ok || !veri || !veri.teslimKodu) {
            const msj = (veri && veri.hata)
              ? veri.hata
              : `Sunucu sınav teslimini tamamlayamadı (HTTP ${yanit.status}). Teslim fişi üretilmedi; lütfen gözetmene başvurunuz.`;
            gosterTeslimHatasi(yanit.status, msj);
            return;
          }

          const sunucuDogru = typeof veri.dogruSayisi === 'number' ? veri.dogruSayisi : 0;
          const sunucuPuan = typeof veri.puan === 'number' ? veri.puan : 0;
          const sunucuFis = String(veri.teslimKodu).startsWith('#')
            ? String(veri.teslimKodu)
            : `#TESLIM-${veri.teslimKodu}`;
          kaydetVeGosterYetkiliSonuc(sunucuDogru, sunucuPuan, sunucuFis, veri);
        } catch (_) {
          gosterTeslimHatasi(503, 'Sunucu bağlantısı kesildiği için sınav teslimi doğrulanamadı (503 / Ağ Hatası). Tekrar deneyiniz.');
        }
      })();
      return ot.bitirmeSozu;
    }

    // Yalnız çevrimdışı yerel dosya (file:) önizleme modunda yerel hesaplama
    const aktifYapi = okuAktifSinavYapisi();
    const tumKaynakSorular = [
      ...(Array.isArray(durum.sorular) ? durum.sorular : []),
      ...(aktifYapi && Array.isArray(aktifYapi.tumSeciliSorular) ? aktifYapi.tumSeciliSorular : []),
      ...(Array.isArray(C.VARSAYILAN_SORULAR) ? C.VARSAYILAN_SORULAR : [])
    ];
    let dogru = 0;
    const siraliCevaplar = [];
    ot.sorular.forEach((s, idx) => {
      const verilen = ot.cevaplar[idx];
      siraliCevaplar.push(verilen !== undefined && verilen !== null ? String(verilen) : '');
      if (s.tur === 'klasik') {
        if (verilen && String(verilen).trim().length >= 5) dogru++;
      } else if (s.tur === 'dy') {
        const kaynak = tumKaynakSorular.find((ks) => String(ks.id) === String(s.id));
        const beklenen = s.dogruDY || (kaynak && kaynak.dogruDY);
        if (verilen && beklenen && verilen === beklenen) dogru++;
      } else {
        let dogruMu = false;
        if (s.dogruHarf) {
          dogruMu = verilen === s.dogruHarf;
        } else if (verilen) {
          const kaynak = tumKaynakSorular.find((ks) => String(ks.id) === String(s.id));
          if (kaynak && Array.isArray(kaynak.siklar) && kaynak.dogruHarf) {
            const orjIdx = ['A', 'B', 'C', 'D', 'E'].indexOf(String(kaynak.dogruHarf).toUpperCase());
            const secIdx = ['A', 'B', 'C', 'D', 'E'].indexOf(String(verilen).toUpperCase());
            const dogruSikMetni = orjIdx >= 0 ? kaynak.siklar[orjIdx] : null;
            const secilenSikMetni = (Array.isArray(s.siklar) && secIdx >= 0) ? s.siklar[secIdx] : null;
            if (dogruSikMetni && secilenSikMetni && dogruSikMetni === secilenSikMetni) {
              dogruMu = true;
            }
          }
        }
        if (dogruMu) dogru++;
      }
    });
    const puan = Math.round((dogru / Math.max(1, ot.sorular.length)) * 100);
    const teslimKodHash = C.uretDelilLogHash(`${ot.sinavId}|${ot.ogrNo}|${puan}|${siraliCevaplar.join(',')}`, 'TESLIM-FIS').slice(0, 12);
    kaydetVeGosterYetkiliSonuc(dogru, puan, `#TESLIM-${teslimKodHash}`);
  }

  function guncelleDelilLogPaneliUI() {
    const tumLoglar = Array.isArray(durum.kioskDelilLoglari) ? durum.kioskDelilLoglari : [];
    const rozetSayi = document.getElementById('rozet-delil-log-sayisi');
    const secFiltre = document.getElementById('sec-log-sinav-filtre');
    const kutuCanli = document.getElementById('kutu-canli-delil-loglari');

    if (secFiltre) {
      const mevcutSecim = secFiltre.value || 'TUMU';
      const sinavIdKumesi = new Set();
      if (durum.onlineSinav && durum.onlineSinav.sinavId) sinavIdKumesi.add(durum.onlineSinav.sinavId);
      (durum.onlineSinavListesi || []).forEach((s) => { if (s && s.sinavId) sinavIdKumesi.add(s.sinavId); });
      tumLoglar.forEach((l) => { if (l && l.sinavId) sinavIdKumesi.add(l.sinavId); });

      const opsiyonlar = ['<option value="TUMU">📋 Tüm Sınavların Logları</option>'];
      for (const sId of sinavIdKumesi) {
        opsiyonlar.push(`<option value="${C.kacisHTML(sId)}" ${sId === mevcutSecim ? 'selected' : ''}>🎯 ${C.kacisHTML(sId)}</option>`);
      }
      secFiltre.innerHTML = opsiyonlar.join('');
    }

    const seciliSinavId = (secFiltre && secFiltre.value) || 'TUMU';
    const filtreliLoglar = seciliSinavId === 'TUMU'
      ? tumLoglar
      : tumLoglar.filter((l) => l.sinavId === seciliSinavId);

    if (rozetSayi) {
      const ihlalAdet = filtreliLoglar.filter((l) => String(l.olayTuru || '').startsWith('IHLAL_')).length;
      rozetSayi.textContent = `${filtreliLoglar.length} Log (${ihlalAdet} İhlal)`;
    }

    if (!kutuCanli) return;
    if (filtreliLoglar.length === 0) {
      kutuCanli.innerHTML = '<div style="color:var(--metin-soluk); text-align:center;">Henüz sınav log kaydı oluşmadı. Öğrenci sınava başladığında tüm adımlar ve ihlaller burada delil zinciriyle listelenir.</div>';
      return;
    }

    kutuCanli.innerHTML = filtreliLoglar
      .slice()
      .reverse()
      .map((l) => {
        const ihlalMi = String(l.olayTuru || '').startsWith('IHLAL_');
        const renk = ihlalMi ? 'var(--tehlike)' : (l.olayTuru === 'OTURUM_BASLADI' || l.olayTuru === 'OTURUM_BITTI' ? 'var(--basari)' : 'var(--birincil)');
        return `
          <div style="padding:4px 0; border-bottom:1px dashed var(--kenar);">
            <div>
              <span style="color:var(--metin-ikincil);">[${C.kacisHTML(l.yerelZaman)}]</span>
              <strong style="color:${renk};">[${C.kacisHTML(l.olayTuru)}]</strong>
              <strong>${C.kacisHTML(l.ogrNo)} (${C.kacisHTML(l.adSoyad)})</strong> —
              <span>${C.kacisHTML(l.aciklama)}</span>
              <span style="color:var(--metin-soluk); font-size:0.66rem;"> [Mühür: #${C.kacisHTML((l.olayHash || '').slice(0, 12))}]</span>
            </div>
            ${l.cihazBilgisi ? `<div style="font-size:0.66rem; color:var(--metin-ikincil); margin-top:1px;">🌐 ${C.kacisHTML(l.cihazBilgisi)}</div>` : ''}
          </div>
        `;
      })
      .join('');
  }

  function guncelleOnlineOturumTablosu() {
    const tbody = document.getElementById('tablo-online-oturumlar');
    if (!tbody) return;
    const oturumlar = (durum.onlineSinav && Array.isArray(durum.onlineSinav.oturumlar)) ? durum.onlineSinav.oturumlar : [];
    if (oturumlar.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--metin-soluk);">Henüz aktif online sınav oturumu yok.</td></tr>';
      return;
    }
    tbody.innerHTML = oturumlar
      .map((o) => `
        <tr>
          <td class="mono">${C.kacisHTML(o.ogrNo)}</td>
          <td><strong>${C.kacisHTML(o.adSoyad)}</strong></td>
          <td class="mono">${C.kacisHTML(o.sinavId || durum.onlineSinav.sinavId || '-')}</td>
          <td><span class="rozet ${String(o.durum).includes('İhlal') ? 'rozet-kirmizi' : 'rozet-yesil'}">${C.kacisHTML(o.durum)}</span></td>
          <td><span class="rozet ${o.ihlalSayisi > 0 ? 'rozet-kirmizi' : 'rozet-yesil'}">${o.ihlalSayisi} İhlal</span></td>
          <td>
            <div style="display:flex; align-items:center; gap:0.35rem; justify-content:space-between; flex-wrap:wrap;">
              <strong>${o.puan}</strong>
              ${o.teslimFisKodu ? `<span class="mono" style="font-size:0.7rem; color:var(--metin-ikincil);">${C.kacisHTML(o.teslimFisKodu)}</span>` : ''}
              <button type="button" class="btn btn-kucuk" data-indir-ogr-delil="${C.kacisHTML(o.ogrNo)}" data-indir-sinav-id="${C.kacisHTML(o.sinavId || durum.onlineSinav.sinavId || '')}" title="Bu öğrencinin zaman damgalı ve mühürlü delil log raporunu indir (.txt)">📜 Delil İndir</button>
            </div>
          </td>
        </tr>
      `)
      .join('');
  }

  function guncelleOnlineSinavSekmesiUI() {
    const liste = Array.isArray(durum.onlineSinavListesi) ? durum.onlineSinavListesi : [];
    const rozetSayi = document.getElementById('rozet-tanimli-online-sayisi');
    if (rozetSayi) rozetSayi.textContent = `${liste.length} Sınav`;

    const rozetDurum = document.getElementById('rozet-online-durum');
    if (rozetDurum) {
      if (durum.onlineSinav && durum.onlineSinav.aktif) {
        rozetDurum.className = 'rozet rozet-yesil';
        rozetDurum.textContent = `🟢 Aktif: ${durum.onlineSinav.sinavId} (${durum.onlineSinav.sureDk} dk)`;
      } else {
        rozetDurum.className = 'rozet rozet-mavi';
        rozetDurum.textContent = 'Hazır / Planlandı';
      }
    }

    const tbody = document.getElementById('tablo-tanimli-online-sinavlar');
    if (tbody) {
      if (liste.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--metin-soluk);">Tanımlı online sınav yok. Soldaki formdan tanımlayın.</td></tr>';
      } else {
        tbody.innerHTML = liste
          .map((s) => {
            const ders = durum.dersler.find((d) => d.id === s.dersId) || { kod: 'GENEL', ad: 'Ders' };
            const aktifMi = Boolean(s.aktif && durum.onlineSinav.sinavId === s.sinavId && durum.onlineSinav.aktif);
            const topSoru = (Number(s.dySayisi) || 0) + (Number(s.testSayisi) || 0) + (Number(s.klasikSayisi) || 0);
            return `
              <tr>
                <td>
                  <div class="mono" style="font-weight:700;">${C.kacisHTML(s.sinavId)}</div>
                  <div style="font-size:0.74rem; color:var(--metin-ikincil);">${C.kacisHTML(s.baslik || '')}</div>
                </td>
                <td>
                  <strong>${C.kacisHTML(ders.kod)}</strong>
                  <div style="font-size:0.72rem;">${C.kacisHTML(s.sinavTuru || 'Vize')}</div>
                </td>
                <td class="mono" style="font-size:0.72rem;">
                  ${C.kacisHTML((s.baslangic || '').replace('T', ' '))}
                  <div><strong>${s.sureDk || 40} dk</strong></div>
                </td>
                <td class="mono" style="font-size:0.74rem;">
                  <strong>${topSoru} Soru</strong>
                  <div>${s.dySayisi || 0} DY · ${s.testSayisi || 0} Test${s.klasikSayisi ? ` · ${s.klasikSayisi} Kl.` : ''}</div>
                </td>
                <td>
                  <span class="rozet ${aktifMi ? 'rozet-yesil' : 'rozet-sari'}">${aktifMi ? '🟢 Aktif' : '⏳ Planlandı'}</span>
                </td>
                <td>
                  <div style="display:flex; gap:3px; flex-wrap:wrap;">
                    <button type="button" class="btn ${aktifMi ? 'btn-tehlike' : 'btn-basari'} btn-kucuk" data-online-sec-baslat="${C.kacisHTML(s.sinavId)}" title="${aktifMi ? 'Bu sınavı durdur' : 'Bu sınavı aktif et ve başlat'}" aria-pressed="${aktifMi}">${aktifMi ? '⏸️ Durdur' : '▶️ Başlat'}</button>
                    <button type="button" class="btn btn-kucuk" data-online-sec-yukle="${C.kacisHTML(s.sinavId)}" title="Forma yükle / düzenle">✏️</button>
                    <button type="button" class="btn btn-tehlike btn-kucuk" data-online-sec-sil="${C.kacisHTML(s.sinavId)}" title="Sınav tanımını sil">🗑️</button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join('');
      }
    }
    const btnBaslat = document.getElementById('btn-online-baslat');
    const btnDurdur = document.getElementById('btn-online-durdur');
    const aktifSinavVar = Boolean(durum.onlineSinav && durum.onlineSinav.aktif);
    if (btnBaslat) {
      btnBaslat.disabled = aktifSinavVar;
      btnBaslat.style.opacity = aktifSinavVar ? '0.55' : '1';
      btnBaslat.textContent = aktifSinavVar ? '🟢 Sınav Aktif (Başlatıldı)' : '▶️ Online Sınavı Şimdi Başlat';
    }
    if (btnDurdur) {
      btnDurdur.disabled = !aktifSinavVar;
      btnDurdur.style.opacity = aktifSinavVar ? '1' : '0.55';
    }
    guncelleOnlineOturumTablosu();
    guncelleDelilLogPaneliUI();
    guncelleKioskOgrenciSinavListesiUI();
  }

  /* Tüm sınavlar silindiğinde formun dayanacağı boş tanım */
  function bosOnlineSinavTanimi() {
    const tarih = new Date();
    const iki = (n) => String(n).padStart(2, '0');
    const yerelTarih = `${tarih.getFullYear()}-${iki(tarih.getMonth() + 1)}-${iki(tarih.getDate())}`;
    return {
      aktif: false,
      sinavId: `SINAV-${tarih.getFullYear()}-${iki(tarih.getMonth() + 1)}${iki(tarih.getDate())}`,
      baslik: 'Yeni Online Sınav',
      sinavTuru: 'Vize (Ara Sınav)',
      dersId: durum.aktifDersId,
      baslangic: `${yerelTarih}T09:00`,
      bitis: `${yerelTarih}T18:00`,
      sureDk: 40,
      dySayisi: 10,
      testSayisi: 10,
      klasikSayisi: 0,
      haftaKapsam: 'studyo',
      maksIhlal: 0,
      erisimKodu: '',
      kisiyeOzel: true,
      geriDonusKilit: true,
      oturumlar: []
    };
  }

  async function senkronizeEtOnlineSinavSunucu(sinavTanimi) {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    try {
      const yapi = okuAktifSinavYapisi();
      const hedefDersId = sinavTanimi.dersId || (yapi && yapi.ders && yapi.ders.id) || durum.aktifDersId;
      let dersSorulari = durum.sorular.filter((s) => !s.arsivde && (s.dersId === hedefDersId || s.dersId === 'genel'));
      if (dersSorulari.length === 0 && yapi && Array.isArray(yapi.tumSeciliSorular) && yapi.tumSeciliSorular.length > 0) {
        dersSorulari = yapi.tumSeciliSorular;
      }
      if (sinavTanimi.haftaKapsam === 'vize') {
        const vizeSorular = dersSorulari.filter((s) => C.normalizeHaftaNo(s.hafta, 1) <= 7);
        if (vizeSorular.length >= 2) dersSorulari = vizeSorular;
      }
      const dyAdet = sinavTanimi.dySayisi !== undefined ? Number(sinavTanimi.dySayisi) : (yapi ? yapi.dySayisi : 10);
      const testAdet = sinavTanimi.testSayisi !== undefined ? Number(sinavTanimi.testSayisi) : (yapi ? yapi.testSayisi : 10);
      const klasikAdet = sinavTanimi.klasikSayisi !== undefined ? Number(sinavTanimi.klasikSayisi) : 0;
      const havuzSorulari = dersSorulari.length > 0 ? dersSorulari : (C.VARSAYILAN_SORULAR || []);
      const seciliSorular = C.uretKisiyeOzelOnlineSinav(
        havuzSorulari,
        dyAdet,
        testAdet,
        'SABIT',
        sinavTanimi.sinavId || 'SINAV-2026-VIZE'
      );
      if (klasikAdet > 0) {
        const klasikler = havuzSorulari.filter((s) => s.tur === 'klasik').slice(0, klasikAdet);
        seciliSorular.push(...klasikler);
      }
      const hocaToken = sessionStorage.getItem('hoca_token') || sessionStorage.getItem('omr_hoca_token') || '';
      const basliklar = { 'Content-Type': 'application/json' };
      if (hocaToken) basliklar.Authorization = `Bearer ${hocaToken}`;
      await fetch('/api/online-sinav-tanimla', {
        method: 'POST',
        headers: basliklar,
        body: JSON.stringify({
          sinav: {
            ...sinavTanimi,
            havuzSorulari,
            sorular: seciliSorular
          },
          ogrenciler: [
            ...(Array.isArray(durum.ogrenciler) ? durum.ogrenciler : []),
            ...(Array.isArray(durum.ogrenciKayitlari) ? durum.ogrenciKayitlari : [])
          ]
        })
      });
    } catch (_) {}
  }

  /* ------------------------------------------------------------------------
     DERS SEÇİCİ, BOLOGNA ÖÇ MADDE EDİTÖRÜ, DERS SİLME VE SORU ARŞİVİ YÖNETİMİ
     ------------------------------------------------------------------------ */
  function cizYeniDersOcMaddeKutulari(maddelerDizi = []) {
    const kutu = document.getElementById('kutu-yeni-ders-oc-maddeler');
    if (!kutu) return;
    const temizListe = Array.isArray(maddelerDizi) ? maddelerDizi : [];
    if (temizListe.length === 0) {
      kutu.innerHTML = '<div style="font-size:0.75rem; color:var(--metin-soluk); padding:4px 6px; border:1px dashed var(--kenar); border-radius:6px;">ℹ️ Şu an ÖÇ maddesi eklenmedi (Seçmeli). Eklemek için yukarıdan <strong>"⚡ 4 Madde"</strong>, <strong>"⚡ 5 Madde"</strong> veya <strong>"➕ Yeni ÖÇ Maddesi Ekle"</strong> düğmesine basın.</div>';
      return;
    }
    kutu.innerHTML = temizListe
      .map((m, idx) => {
        const kod = `ÖÇ-${idx + 1}`;
        const deger = typeof m === 'string'
          ? m.replace(/^(?:ÖÇ|OC|LO)\s*[-_\.\s]?\s*\d{1,2}\s*[:\-–\)\.]?\s*/i, '').trim()
          : String((m && m.aciklama) || '').trim();
        return `
          <div style="display:flex; align-items:center; gap:0.4rem;" data-oc-madde-satir="${idx}">
            <span class="rozet rozet-mavi mono" style="min-width:52px; text-align:center; font-weight:800;">${kod}</span>
            <input type="text" data-oc-madde-input="${idx}" value="${C.kacisHTML(deger)}" placeholder="${kod} açıklamasını yazınız (Örn: Ağ güvenliği mimarisini analiz eder)" style="flex:1; font-size:0.78rem; padding:4px 8px;" />
            <button type="button" class="btn btn-tehlike btn-kucuk" data-oc-madde-sil="${idx}" style="padding:2px 7px;" title="${kod} maddesini kaldır">✕</button>
          </div>
        `;
      })
      .join('');
  }

  function okuModalOcMaddeleri() {
    const inputlar = Array.from(document.querySelectorAll('#kutu-yeni-ders-oc-maddeler [data-oc-madde-input]'));
    const kutuDegerleri = inputlar
      .map((inp, idx) => {
        const metin = String(inp.value || '').trim();
        return metin ? { kod: `ÖÇ-${idx + 1}`, aciklama: metin } : null;
      })
      .filter(Boolean);
    if (kutuDegerleri.length > 0) {
      return C.ayiklaDersOcMaddeleri(kutuDegerleri);
    }
    const topluEl = document.getElementById('yeni-ders-oc-toplu-metin');
    if (topluEl && String(topluEl.value || '').trim()) {
      return C.ayiklaDersOcMaddeleri(topluEl.value);
    }
    return [];
  }

  function acDersOcKayitModali(zorunluUyariGoster = false, hedefDersId = null) {
    const uyariEl = document.getElementById('uyari-oc-kayit-gerekli');
    if (uyariEl) {
      uyariEl.style.display = zorunluUyariGoster ? 'block' : 'none';
    }
    const hedefId = hedefDersId || durum.aktifDersId;
    const aktifDers = durum.dersler.find((d) => d.id === hedefId) || durum.dersler[0] || null;
    const sb = durum.evrakSablonu || {};
    const fakEl = document.getElementById('yeni-ders-fakulte');
    const bolumEl = document.getElementById('yeni-ders-bolum');
    const hocaEl = document.getElementById('yeni-ders-hoca');
    if (aktifDers) {
      const kodEl = document.getElementById('yeni-ders-kod');
      const adEl = document.getElementById('yeni-ders-ad');
      if (kodEl && !kodEl.value) kodEl.value = aktifDers.kod || '';
      if (adEl && !adEl.value) adEl.value = aktifDers.ad || '';
      if (fakEl && !fakEl.value) fakEl.value = aktifDers.fakulte || sb.fakulte || sb.kurum || '';
      if (bolumEl && !bolumEl.value) {
        const ayniOkulAd = aktifDers.bolum && aktifDers.fakulte && aktifDers.bolum === aktifDers.fakulte && /(meslek yüksekokulu|yüksekokulu|fakültesi|enstitüsü|üniversitesi|okulu|lisesi)/i.test(aktifDers.fakulte);
        bolumEl.value = ayniOkulAd ? (sb.bolum || '') : (aktifDers.bolum || sb.bolum || '');
      }
      if (hocaEl && !hocaEl.value) hocaEl.value = aktifDers.ogretimElemani || sb.sorumlu || '';
    } else {
      if (fakEl && !fakEl.value) fakEl.value = sb.fakulte || sb.kurum || '';
      if (bolumEl && !bolumEl.value) bolumEl.value = sb.bolum || '';
      if (hocaEl && !hocaEl.value) hocaEl.value = sb.sorumlu || (durum.hocaHesap && durum.hocaHesap.adSoyad) || '';
    }
    const mevcutOcler = aktifDers && Array.isArray(aktifDers.ogrenimCiktilari) && aktifDers.ogrenimCiktilari.length > 0
      ? C.ayiklaDersOcMaddeleri(aktifDers.ogrenimCiktilari)
      : (zorunluUyariGoster ? [{ aciklama: '' }, { aciklama: '' }, { aciklama: '' }, { aciklama: '' }] : []);
    cizYeniDersOcMaddeKutulari(mevcutOcler);
    guncelleDersVeArsivModalUI((document.getElementById('yeni-ders-kod') && document.getElementById('yeni-ders-kod').value) || '');
    const modal = document.getElementById('modal-yeni-ders');
    if (modal) modal.style.display = 'flex';
  }

  function guncelleDersVeArsivModalUI(filtreKod = '') {
    const arsivHavuzlari = C.listeleArsivSoruHavuzlari(durum.dersler, durum.sorular, durum.arsivDersler);
    const kutuArsiv = document.getElementById('kutu-arsiv-havuz-listesi');
    if (kutuArsiv) {
      if (arsivHavuzlari.length === 0) {
        kutuArsiv.innerHTML = '<div style="color:var(--metin-soluk);">Şu anda arşivde bekleyen silinmiş ders sorusu bulunmuyor. Bir dersi sildiğinizde soruları burada korunur.</div>';
      } else {
        const arananKod = String(filtreKod || '').trim().toUpperCase();
        kutuArsiv.innerHTML = arsivHavuzlari
          .map((h) => {
            const otomatikSec = arananKod && String(h.kod || '').toUpperCase() === arananKod;
            return `
              <label style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; padding:5px 8px; background:var(--bg-kart); border:1px solid var(--kenar); border-radius:6px; cursor:pointer;">
                <span style="display:flex; align-items:center; gap:0.4rem;">
                  <input type="checkbox" data-arsiv-sec="${C.kacisHTML(h.arsivId)}" data-arsiv-kod="${C.kacisHTML(h.kod)}" ${otomatikSec ? 'checked' : ''} style="width:auto;" />
                  <span>📦 <strong>${C.kacisHTML(h.kod)} — ${C.kacisHTML(h.ad)}</strong></span>
                </span>
                <span class="rozet rozet-mavi mono">${h.toplam} Soru (${h.dy} DY · ${h.test} Test · ${h.klasik} Kl.)</span>
              </label>
            `;
          })
          .join('');
      }
    }

    const kutuDersler = document.getElementById('kutu-mevcut-dersler-yonetim');
    if (kutuDersler) {
      if (durum.dersler.length === 0) {
        kutuDersler.innerHTML = '<div style="color:var(--metin-soluk);">Henüz kayıtlı ders bulunmuyor. Yukarıdaki alanlardan ilk dersinizi oluşturabilirsiniz.</div>';
      } else {
        kutuDersler.innerHTML = durum.dersler
          .map((d) => {
            const soruAdet = durum.sorular.filter((s) => !s.arsivde && s.dersId === d.id).length;
            const ogrAdet = durum.ogrenciKayitlari.filter((o) => Array.isArray(o.dersIdler) && o.dersIdler.includes(d.id)).length;
            const ocAdet = Array.isArray(d.ogrenimCiktilari) ? d.ogrenimCiktilari.length : 0;
            return `
              <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; padding:5px 8px; background:var(--bg-ikincil); border:1px solid var(--kenar); border-radius:6px; flex-wrap:wrap;">
                <div>
                  <strong>${C.kacisHTML(d.kod)} — ${C.kacisHTML(d.ad)}</strong>
                  <span class="mono" style="font-size:0.72rem; color:var(--metin-ikincil);"> (${soruAdet} Soru · ${ogrAdet} Öğrenci · 🎯 ${ocAdet} ÖÇ)</span>
                </div>
                <div style="display:flex; gap:0.3rem;">
                  <button type="button" class="btn btn-kucuk" data-duzenle-ders-oc="${C.kacisHTML(d.id)}" title="Bu dersin Bologna ÖÇ maddelerini düzenle">🎯 ÖÇ Düzenle (${ocAdet})</button>
                  <button type="button" class="btn btn-tehlike btn-kucuk" data-sil-ders-id="${C.kacisHTML(d.id)}" title="Dersi sil ve sorularını Soru Arşivine aktar">🗑️ Sil (Soruları Arşivle)</button>
                </div>
              </div>
            `;
          })
          .join('');
      }
    }
  }

  function silDersiVeArsivle(dersId) {
    kaydetSonGeriAlYedegi('Ders Silme / Arşivleme');
    const sonuc = C.arsivleDersVeSorulariKorun(durum.dersler, durum.sorular, durum.arsivDersler, dersId);
    if (!sonuc.silinenDers) return sonuc;
    durum.dersler = sonuc.dersler;
    durum.sorular = sonuc.sorular;
    durum.arsivDersler = sonuc.arsivDersler;
    if (durum.aktifDersId === dersId || !durum.dersler.some((d) => d.id === durum.aktifDersId)) {
      durum.aktifDersId = sonuc.yeniAktifDersId;
      yukleAktifDersIzoleDurumu(durum.aktifDersId);
    }
    verileriKaydet({ zorlaEz: true });
    yenileTumSekmePanelleriUI();
    return sonuc;
  }

  function dahilEtArsivHavuzlarini(seciliArsivIdleri, hedefDersId = durum.aktifDersId) {
    const sonuc = C.dahilEtArsivSorulariniDerse(durum.sorular, durum.arsivDersler, seciliArsivIdleri, hedefDersId);
    durum.sorular = sonuc.sorular;
    durum.arsivDersler = sonuc.arsivDersler;
    verileriKaydet();
    doldurDersSecici();
    guncelleSoruBankasiTablosu();
    guncelleA4Onizleme();
    return sonuc;
  }

  function doldurDersSecici() {
    const secenekler = durum.dersler.length > 0
      ? durum.dersler
          .map((d) => {
            const soruAdet = (durum.sorular || []).filter((s) => s && !s.arsivde && s.dersId === d.id).length;
            return `<option value="${C.kacisHTML(d.id)}" ${d.id === durum.aktifDersId ? "selected" : ""}>${C.kacisHTML(d.kod)} \u2014 ${C.kacisHTML(d.ad)} (${soruAdet} Soru)</option>`;
          })
          .join("")
      : `<option value="genel">\u2014 Hen\u00fcz Ders Eklenmedi (\u2795 Yeni Ders Ekleyin) \u2014</option>`;
    const sel = document.getElementById("aktif-ders-sec");
    if (sel) sel.innerHTML = secenekler;
    const tutSel = document.getElementById("tut-ders-sec");
    if (tutSel) tutSel.innerHTML = secenekler;
    const onlSel = document.getElementById("online-ders-sec");
    if (onlSel) onlSel.innerHTML = secenekler;
    const rozet = document.getElementById("rozet-tutanak-ders");
    const aktif = durum.dersler.find((d) => d.id === durum.aktifDersId);
    if (rozet) rozet.textContent = aktif ? `${aktif.kod} \u00b7 ${aktif.ad}` : "Ders Seçilmedi";
    if (durum.depoKurtarmaMesaji) gosterDepoKurtarmaUyarisi(durum.depoKurtarmaMesaji);
    senkronizeDersVeEvrakSablonuUI();
    guncelleDersVeArsivModalUI();
    if (typeof window.__guncelleDerslerVeBosDurumUI === 'function') {
      window.__guncelleDerslerVeBosDurumUI();
    }
  }

  function okuOnlineSinavFormunu() {
    const al = (id, varsayilan = '') => {
      const el = document.getElementById(id);
      return el && el.value !== undefined ? String(el.value).trim() : varsayilan;
    };
    const seciliMi = (id, varsayilan = true) => {
      const el = document.getElementById(id);
      return el ? Boolean(el.checked) : varsayilan;
    };
    const simdiYerel = new Date();
    const ikiH = (n) => String(n).padStart(2, '0');
    const bugunStr = `${simdiYerel.getFullYear()}-${ikiH(simdiYerel.getMonth() + 1)}-${ikiH(simdiYerel.getDate())}`;
    const hamBas = al('online-baslangic', '');
    const hamBit = al('online-bitis', '');
    const baslangic = (!hamBas || hamBas === '2026-11-07T09:00') ? `${bugunStr}T00:00` : hamBas;
    const bitis = (!hamBit || hamBit === '2026-11-07T18:00') ? `${bugunStr}T23:59` : hamBit;
    return {
      dersId: al('online-ders-sec', durum.aktifDersId) || durum.aktifDersId || 'genel',
      sinavTuru: al('online-sinav-turu', 'Vize (Ara Sınav)') || 'Vize (Ara Sınav)',
      baslik: al('online-sinav-baslik', 'Online Sınav') || 'Online Sınav',
      sinavId: al('online-sinav-kodu', '') || ('SINAV-' + Date.now()),
      baslangic,
      bitis,
      sureDk: Math.max(5, parseInt(al('online-sure-dk', '40'), 10) || 40),
      dySayisi: Math.max(0, parseInt(al('online-dy-sayisi', '10'), 10) || 0),
      testSayisi: Math.max(0, parseInt(al('online-test-sayisi', '10'), 10) || 0),
      klasikSayisi: Math.max(0, parseInt(al('online-klasik-sayisi', '0'), 10) || 0),
      haftaKapsam: al('online-hafta-kapsam', 'tumu'),
      maksIhlal: Math.max(0, parseInt(al('online-maks-ihlal', '3'), 10) || 0),
      erisimKodu: al('online-erisim-kodu', ''),
      kisiyeOzel: seciliMi('online-kisiye-ozel', true),
      geriDonusKilit: seciliMi('online-geri-donus-kilit', true),
      tamEkranZorunlu: seciliMi('online-tam-ekran-zorunlu', true)
    };
  }
  const senkronizeOnlineSinavSunucu = senkronizeEtOnlineSinavSunucu;


  /* ------------------------------------------------------------------------
     DOSYA YÜKLEME YARDIMCILARI: Excel (.xlsx/.xls) → CSV, ZIP/DOCX açma (akış iptalli),
     kalite belgesi (.docx/.doc/.xls/.xlsx) künye + logo uygulama
     ------------------------------------------------------------------------ */
  const AZAMI_YUKLEME_BAYT = 20 * 1024 * 1024;

  function dosyayiBaytOku(dosya) {
    return new Promise((resolve, reject) => {
      if (dosya.size > AZAMI_YUKLEME_BAYT) { reject(new Error('Dosya 20 MB sınırını aşıyor.')); return; }
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result));
      r.onerror = () => reject(new Error('Dosya okunamadı.'));
      r.readAsArrayBuffer(dosya);
    });
  }

  async function dosyadanCsvMetniOku(dosya) {
    if (/\.(xlsx|xls)$/i.test(dosya.name)) {
      if (!window.XLSX) throw new Error('Excel okuyucu yüklenemedi.');
      const bayt = await dosyayiBaytOku(dosya);
      const kitap = window.XLSX.read(bayt, { type: 'array', cellDates: false });
      const sayfa = kitap.Sheets[kitap.SheetNames[0]];
      return `\ufeff${window.XLSX.utils.sheet_to_csv(sayfa, { FS: ';', RS: '\r\n', blankrows: false })}`;
    }
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('Dosya okunamadı.'));
      r.readAsText(dosya, 'UTF-8');
    });
  }

  async function tarayiciInflateRaw(sikis, azamiBayt) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Tarayıcı DOCX açmayı desteklemiyor.');
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    let zamanAsimi = false;
    const zamanlayici = setTimeout(() => { zamanAsimi = true; }, 8000);
    let parcalar = [];
    let toplam = 0;
    const yaziyor = writer.write(sikis).then(() => writer.close()).catch(() => {});
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        toplam += value.length;
        if (toplam > azamiBayt || zamanAsimi) {
          throw new Error(zamanAsimi ? 'ZIP açma zaman aşımı.' : 'ZIP içeriği boyut sınırını aştı.');
        }
        parcalar.push(value);
      }
    } catch (err) {
      try { await reader.cancel(); } catch (_) {}
      try { await writer.abort(); } catch (_) {}
      parcalar = [];
      throw err;
    } finally {
      clearTimeout(zamanlayici);
    }
    await yaziyor;
    const cikti = new Uint8Array(toplam);
    let konum = 0;
    for (const p of parcalar) { cikti.set(p, konum); konum += p.length; }
    return cikti;
  }

  function kaliteDurumMesaji(metin, hata = false) {
    const el = document.getElementById('etiket-pdf-kesit-durum');
    const kutu = document.getElementById('kutu-pdf-kesit-ayar');
    if (kutu) kutu.style.display = 'block';
    if (el) {
      el.textContent = metin;
      el.style.color = hata ? 'var(--tehlike)' : '';
    }
  }

  async function uygulaKaliteBelgeDosyasi(dosya) {
    try {
      const ad = dosya.name.toLowerCase();
      let kunye;
      if (/\.docx$/.test(ad)) {
        kunye = await C.cozDocxKaliteFormu(await dosyayiBaytOku(dosya), tarayiciInflateRaw);
      } else if (/\.doc$/.test(ad)) {
        kunye = C.cozDocKaliteFormu(await dosyayiBaytOku(dosya));
      } else {
        const bayt = await dosyayiBaytOku(dosya);
        const kitap = window.XLSX.read(bayt, { type: 'array' });
        const satirlar = window.XLSX.utils.sheet_to_json(kitap.Sheets[kitap.SheetNames[0]], { header: 1, defval: '' });
        kunye = { ...C.cikarKaliteKunyesiMetinden(satirlar.map((s) => s.join(' ')).join(' ')), logoDataUrl: null, kaynak: 'excel' };
      }
      if (!kunye.dokumanNo && !kunye.ilkYayinTarihi && !kunye.revizyon) {
        kaliteDurumMesaji('⚠️ Dosyada Doküman No / İlk Yayın / Revizyon bilgisi bulunamadı. Lütfen alanları elle giriniz.', true);
        return;
      }
      if (kunye.dokumanNo) document.getElementById('kalite-dokuman-no').value = kunye.dokumanNo;
      if (kunye.ilkYayinTarihi) document.getElementById('kalite-yayin-tarihi').value = kunye.ilkYayinTarihi;
      if (kunye.revizyon) document.getElementById('kalite-revizyon').value = kunye.revizyon;
      if (kunye.logoDataUrl) durum.kaliteGorselDataUrl = kunye.logoDataUrl;
      durum.kaliteAltBilgiDataUrl = null;
      document.getElementById('kalite-form-tipi').value = 'iso9001';
      document.getElementById('ayar-mukerrer-gizle').value = 'tam-gizle';
      const tutKunyeEl = document.getElementById('tut-kunye-modu');
      if (tutKunyeEl) tutKunyeEl.value = 'kunyeli';
      if (durum.evrakSablonu) durum.evrakSablonu.kunyeModu = 'kunyeli';
      guncelleKaliteKunyeGorunurlugu();
      guncelleA4Onizleme();
      kaliteDurumMesaji(`✅ ${dosya.name}: ${kunye.formBasligi || 'Kalite formu'} — Doküman No: ${kunye.dokumanNo || '-'} · İlk Yayın: ${kunye.ilkYayinTarihi || '-'}${kunye.logoDataUrl ? ' · Kurum logosu aktarıldı' : ''}`);
    } catch (err) {
      kaliteDurumMesaji(`⚠️ Kalite belgesi okunamadı: ${err.message}`, true);
    }
  }

  /* ------------------------------------------------------------------------
     SEÇMELİ EVRAK ŞABLONU, OKUL/FAKÜLTE/BÖLÜM SENKRONU VE TUTANAK/YOKLAMA ÜRETİCİLERİ
     ------------------------------------------------------------------------ */
  function ayiklaDersOkulVeBolum(aktifDers, sb = durum.evrakSablonu || {}) {
    const hamFak = (aktifDers && aktifDers.fakulte ? String(aktifDers.fakulte).trim() : '') || '';
    const hamBol = (aktifDers && aktifDers.bolum ? String(aktifDers.bolum).trim() : '') || '';
    const okulKalip = /(meslek yüksekokulu|yüksekokulu|fakültesi|enstitüsü|üniversitesi|okulu|lisesi|koleji|\bmyo\b)/i;

    let fakulte = hamFak || sb.fakulte || sb.kurum || '';
    let bolum = hamBol;

    // Eski tek kutulu ders kaydında "Kırıkhan Meslek Yüksekokulu" hem fakulte hem bolum alanına yazılmışsa:
    // Üst başlığa okul/MYO adını koy, BÖLÜMÜ hücresine varsa şablondaki bölümü koy (yoksa mükerrer okul adı yazma)
    if (hamFak && hamBol && hamFak === hamBol && okulKalip.test(hamFak)) {
      fakulte = hamFak;
      bolum = (sb.bolum && sb.bolum !== hamFak) ? sb.bolum : '';
    } else if (!hamFak && hamBol && okulKalip.test(hamBol)) {
      fakulte = hamBol;
      bolum = (sb.bolum && sb.bolum !== hamBol) ? sb.bolum : '';
    } else if (!bolum && sb.bolum) {
      bolum = sb.bolum;
    }

    if (/^MÜHENDİSLİK FAKÜLTESİ$/i.test(fakulte) && hamBol && hamBol !== fakulte) {
      if (okulKalip.test(hamBol)) {
        fakulte = hamBol;
        bolum = (sb.bolum && sb.bolum !== hamBol) ? sb.bolum : '';
      }
    }

    const sorumlu = (aktifDers && aktifDers.ogretimElemani ? String(aktifDers.ogretimElemani).trim() : '')
      || sb.sorumlu
      || (durum.hocaHesap && durum.hocaHesap.adSoyad)
      || '';

    return { fakulte, bolum, sorumlu };
  }

  function guncelleKaliteKunyeGorunurlugu() {
    const tutKunyeModuEl = document.getElementById('tut-kunye-modu');
    const alanTutKunye = document.getElementById('alan-tut-kunye-detay');
    if (tutKunyeModuEl && alanTutKunye) {
      alanTutKunye.style.display = tutKunyeModuEl.value === 'kunyeli' ? '' : 'none';
    }
    const kaliteTipiEl = document.getElementById('kalite-form-tipi');
    const alanKaliteKunye = document.getElementById('alan-kalite-kunye');
    const hizliKunyeModuEl = document.getElementById('kagit-hizli-kunye-modu');
    const alanHizliKunye = document.getElementById('alan-kagit-hizli-kunye-detay');
    const aktifTip = (kaliteTipiEl && kaliteTipiEl.value) || (hizliKunyeModuEl && hizliKunyeModuEl.value) || 'standart';
    const kunyeliMi = aktifTip === 'iso9001' || aktifTip === 'mudek';
    if (alanKaliteKunye) {
      alanKaliteKunye.style.display = kunyeliMi ? '' : 'none';
    }
    if (alanHizliKunye) {
      alanHizliKunye.style.display = kunyeliMi ? '' : 'none';
    }
  }

  function senkronizeDersVeEvrakSablonuUI() {
    const sb = durum.evrakSablonu || {};
    const aktifDers = durum.dersler.find((d) => d.id === durum.aktifDersId) || durum.dersler[0] || null;
    const cozulmus = ayiklaDersOkulVeBolum(aktifDers, sb);

    const ayarla = (id, deger) => {
      const el = document.getElementById(id);
      if (el && deger !== undefined && deger !== null) el.value = String(deger);
    };

    ayarla('tut-fakulte', cozulmus.fakulte);
    ayarla('tut-bolum', cozulmus.bolum);
    ayarla('tut-sorumlu', cozulmus.sorumlu);
    if (sb.donem) ayarla('tut-donem', sb.donem);
    if (sb.kunyeModu) ayarla('tut-kunye-modu', sb.kunyeModu);
    if (sb.dokumanNoDurum !== undefined) ayarla('tut-dokuman-no-durum', sb.dokumanNoDurum);
    if (sb.dokumanNoYoklama !== undefined) ayarla('tut-dokuman-no-yoklama', sb.dokumanNoYoklama);
    if (sb.yayinTarihi !== undefined) ayarla('tut-yayin-tarihi', sb.yayinTarihi);
    if (sb.revTarihi !== undefined) ayarla('tut-rev-tarihi', sb.revTarihi);
    if (sb.revizyon !== undefined) ayarla('tut-rev-no', sb.revizyon);
    if (sb.gozetmen1 !== undefined) ayarla('tut-gozetmen1', sb.gozetmen1);
    if (sb.gozetmen2 !== undefined) ayarla('tut-gozetmen2', sb.gozetmen2);
    if (sb.uygunluk) ayarla('tut-uygunluk', sb.uygunluk);

    const kurumDegeri = cozulmus.fakulte || sb.kurum || '';
    if (kurumDegeri) {
      ayarla('antet-kurum', kurumDegeri);
      ayarla('kagit-hizli-kurum', kurumDegeri);
    }
    if (cozulmus.sorumlu) {
      ayarla('antet-hoca', cozulmus.sorumlu);
      ayarla('kagit-hizli-hoca', cozulmus.sorumlu);
    }
    if (sb.sure) {
      ayarla('antet-sure', sb.sure);
      ayarla('kagit-hizli-sure', sb.sure);
    } else if (document.getElementById('antet-sure')) {
      ayarla('kagit-hizli-sure', document.getElementById('antet-sure').value);
    }
    if (sb.tarih) {
      ayarla('antet-tarih', sb.tarih);
      ayarla('kagit-hizli-tarih', sb.tarih);
    } else if (document.getElementById('antet-tarih')) {
      ayarla('kagit-hizli-tarih', document.getElementById('antet-tarih').value);
    }
    if (sb.sinavAd) {
      ayarla('antet-sinav-ad', sb.sinavAd);
      ayarla('kagit-hizli-sinav-ad', sb.sinavAd);
    } else if (document.getElementById('antet-sinav-ad')) {
      ayarla('kagit-hizli-sinav-ad', document.getElementById('antet-sinav-ad').value);
    }
    if (sb.kaliteFormTipi) {
      ayarla('kalite-form-tipi', sb.kaliteFormTipi);
      ayarla('kagit-hizli-kunye-modu', sb.kaliteFormTipi);
    }
    if (sb.kaliteDokumanNo !== undefined) {
      ayarla('kalite-dokuman-no', sb.kaliteDokumanNo);
      ayarla('kagit-hizli-dokuman-no', sb.kaliteDokumanNo);
    }
    if (sb.kaliteYayinTarihi !== undefined) {
      ayarla('kalite-yayin-tarihi', sb.kaliteYayinTarihi);
      ayarla('kagit-hizli-yayin-tarihi', sb.kaliteYayinTarihi);
    }
    if (sb.kaliteRevizyon !== undefined) {
      ayarla('kalite-revizyon', sb.kaliteRevizyon);
      ayarla('kagit-hizli-revizyon', sb.kaliteRevizyon);
    }

    guncelleKaliteKunyeGorunurlugu();
  }

  function kaydetEvrakSablonuVarsayilan(kaynak = 'tutanak') {
    const al = (id, varsayilan = '') => {
      const el = document.getElementById(id);
      return el && el.value !== undefined ? String(el.value).trim() : varsayilan;
    };
    const sb = durum.evrakSablonu || {};
    const kagitKaynakMi = kaynak === 'antet' || kaynak === 'kagit-hizli';
    const girilenFakulte = kagitKaynakMi
      ? (al('kagit-hizli-kurum') || al('antet-kurum') || al('tut-fakulte') || sb.fakulte || '')
      : (al('tut-fakulte') || al('antet-kurum') || sb.fakulte || '');
    const girilenBolum = al('tut-bolum');
    const girilenSorumlu = kagitKaynakMi
      ? (al('kagit-hizli-hoca') || al('antet-hoca') || al('tut-sorumlu') || sb.sorumlu || '')
      : (al('tut-sorumlu') || al('antet-hoca') || sb.sorumlu || '');
    const girilenKaliteTipi = kaynak === 'kagit-hizli'
      ? al('kagit-hizli-kunye-modu', 'standart')
      : al('kalite-form-tipi', 'standart');
    const girilenKunyeModu = kagitKaynakMi
      ? ((girilenKaliteTipi === 'iso9001' || girilenKaliteTipi === 'mudek') ? 'kunyeli' : (al('tut-kunye-modu') || 'sade'))
      : (al('tut-kunye-modu') || 'sade');
    const girilenSure = kaynak === 'kagit-hizli'
      ? (al('kagit-hizli-sure') || al('antet-sure') || '60 Dakika')
      : (al('antet-sure') || al('kagit-hizli-sure') || '60 Dakika');
    const girilenTarih = kaynak === 'kagit-hizli'
      ? (al('kagit-hizli-tarih') || al('antet-tarih') || sb.tarih || '')
      : (al('antet-tarih') || al('kagit-hizli-tarih') || sb.tarih || '');
    const girilenSinavAd = kaynak === 'kagit-hizli'
      ? (al('kagit-hizli-sinav-ad') || al('antet-sinav-ad') || sb.sinavAd || '')
      : (al('antet-sinav-ad') || al('kagit-hizli-sinav-ad') || sb.sinavAd || '');

    durum.evrakSablonu = {
      kurum: girilenFakulte || 'KIRIKHAN MESLEK YÜKSEKOKULU',
      fakulte: girilenFakulte,
      bolum: girilenBolum,
      sorumlu: girilenSorumlu,
      sure: girilenSure,
      tarih: girilenTarih,
      sinavAd: girilenSinavAd,
      donem: al('tut-donem', sb.donem || '2026-2027 GÜZ'),
      kunyeModu: girilenKunyeModu,
      dokumanNoDurum: al('tut-dokuman-no-durum', 'FRM-046'),
      dokumanNoYoklama: al('tut-dokuman-no-yoklama', 'FRM-059'),
      yayinTarihi: al('tut-yayin-tarihi', '30.01.2023'),
      revTarihi: al('tut-rev-tarihi', '-'),
      revizyon: al('tut-rev-no', '-'),
      kaliteFormTipi: girilenKaliteTipi,
      kaliteDokumanNo: kaynak === 'kagit-hizli' ? al('kagit-hizli-dokuman-no', '') : al('kalite-dokuman-no', ''),
      kaliteYayinTarihi: kaynak === 'kagit-hizli' ? al('kagit-hizli-yayin-tarihi', '') : al('kalite-yayin-tarihi', ''),
      kaliteRevizyon: kaynak === 'kagit-hizli' ? al('kagit-hizli-revizyon', '') : al('kalite-revizyon', ''),
      gozetmen1: al('tut-gozetmen1', ''),
      gozetmen2: al('tut-gozetmen2', ''),
      uygunluk: al('tut-uygunluk', 'bos')
    };

    const aktifDers = durum.dersler.find((d) => d.id === durum.aktifDersId) || durum.dersler[0] || null;
    if (aktifDers) {
      if (girilenFakulte) aktifDers.fakulte = girilenFakulte;
      aktifDers.bolum = girilenBolum;
      if (girilenSorumlu) aktifDers.ogretimElemani = girilenSorumlu;
    }

    senkronizeDersVeEvrakSablonuUI();
    const sablonSecEl = document.getElementById('tut-sablon-sec');
    if (sablonSecEl) sablonSecEl.value = 'kayitli';

    guncelleKaliteKunyeGorunurlugu();
    verileriKaydet();
    guncelleA4Onizleme();

    const durumEl = document.getElementById('etiket-evrak-sablon-durum');
    if (durumEl) {
      durumEl.textContent = `✅ Şablon kaydedildi ve seçildi (${durum.evrakSablonu.kunyeModu === 'kunyeli' ? 'Belge No Künyeli' : 'Sade Başlık'})`;
    }
    const kagitDurumEl = document.getElementById('etiket-kagit-sablon-durum');
    if (kagitDurumEl) {
      kagitDurumEl.textContent = `✅ Sınav kağıdı şablonu kaydedildi (Süre: ${durum.evrakSablonu.sure} · ${durum.evrakSablonu.kaliteFormTipi === 'standart' ? 'Sade / Belge No Yok' : 'Kalite Künyeli'})`;
    }
    return durum.evrakSablonu;
  }

  function okuTutanakBilgileri() {
    const al = (id, varsayilan = '') => {
      const el = document.getElementById(id);
      return el && el.value !== undefined ? String(el.value).trim() : varsayilan;
    };
    const sb = durum.evrakSablonu || {};
    const aktifDers = durum.dersler.find((d) => d.id === durum.aktifDersId) || durum.dersler[0] || varsayilanBosDers();
    const cozulmus = ayiklaDersOkulVeBolum(aktifDers, sb);
    const tarihIso = al('tut-tarih');
    const tarih = /^\d{4}-\d{2}-\d{2}$/.test(tarihIso) ? tarihIso.split('-').reverse().join('.') : '';
    const saat = al('tut-saat');
    const fakulteGirdi = al('tut-fakulte');
    const bolumGirdi = al('tut-bolum');
    const sorumluGirdi = al('tut-sorumlu');
    const kunyeModu = al('tut-kunye-modu', sb.kunyeModu || 'sade') || 'sade';

    return {
      ders: aktifDers,
      sinavTuru: al('tut-sinav-turu', 'Vize (Ara Sınav)'),
      donem: al('tut-donem', sb.donem || '2026-2027 GÜZ'),
      tarih,
      saat,
      tarihSaat: [tarih, saat].filter(Boolean).join(' · '),
      salon: al('tut-salon') || (durum.salonlar[0] && durum.salonlar[0].ad) || 'Salon 1',
      fakulte: fakulteGirdi || cozulmus.fakulte || sb.kurum || '',
      bolum: bolumGirdi !== '' ? bolumGirdi : cozulmus.bolum,
      sorumlu: sorumluGirdi || cozulmus.sorumlu || '',
      gozetmenler: [al('tut-gozetmen1', sb.gozetmen1 || ''), al('tut-gozetmen2', sb.gozetmen2 || '')],
      uygunluk: al('tut-uygunluk', sb.uygunluk || 'bos'),
      kunyeModu,
      dokumanNoDurum: al('tut-dokuman-no-durum', sb.dokumanNoDurum || 'FRM-046'),
      dokumanNoYoklama: al('tut-dokuman-no-yoklama', sb.dokumanNoYoklama || 'FRM-059'),
      yayinTarihi: al('tut-yayin-tarihi', sb.yayinTarihi || '30.01.2023'),
      revTarihi: al('tut-rev-tarihi', sb.revTarihi || '-'),
      revizyon: al('tut-rev-no', sb.revizyon || '-')
    };
  }

  function tutanakKunyeTablosuHTML(b, baslik, dokumanNo, sayfaMetni) {
    const logo = durum.kaliteGorselDataUrl
      ? `<img src="${C.guvenliURL(durum.kaliteGorselDataUrl)}" alt="Kurum Logosu" style="max-width:26mm; max-height:20mm; object-fit:contain;" />`
      : '<div style="font-size:20pt;">🏛️</div>';
    const hucre = 'border:1px solid #000; padding:3px 6px; font-size:8.5pt;';
    // Seçmeli Belge No / Kalite Künyesi: Varsayılan ('sade') modda Doküman No / FRM-059 / Yayın Tarihi kutusu basılmaz!
    if (b.kunyeModu !== 'kunyeli') {
      const ustOkul = (b.fakulte || '').trim();
      return `
        <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
          <tr>
            <td style="${hucre} width:26mm; text-align:center;">${logo}</td>
            <td style="${hucre} text-align:center; padding:6px 8px;">
              ${ustOkul ? `<div style="font-size:10.5pt; font-weight:800; margin-bottom:2px;">${C.kacisHTML(ustOkul.toLocaleUpperCase('tr-TR'))}</div>` : ''}
              <div style="font-size:13.5pt; font-weight:800;">${C.kacisHTML(baslik)}</div>
            </td>
            <td style="${hucre} width:28mm; text-align:center; font-size:8pt; font-weight:700;">${C.kacisHTML(sayfaMetni)}</td>
          </tr>
        </table>
      `;
    }
    return `
      <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
        <tr>
          <td rowspan="5" style="${hucre} width:30mm; text-align:center;">${logo}</td>
          <td rowspan="5" style="${hucre} text-align:center; font-size:14pt; font-weight:800;">${C.kacisHTML(baslik)}</td>
          <td style="${hucre} width:34mm;"><strong>Doküman No.</strong></td>
          <td style="${hucre} width:30mm;">${C.kacisHTML(dokumanNo)}</td>
        </tr>
        <tr><td style="${hucre}"><strong>Revizyon Tarihi</strong></td><td style="${hucre}">${C.kacisHTML(b.revTarihi || b.revizyon)}</td></tr>
        <tr><td style="${hucre}"><strong>İlk Yayın Tarihi</strong></td><td style="${hucre}">${C.kacisHTML(b.yayinTarihi)}</td></tr>
        <tr><td style="${hucre}"><strong>Revizyon No.</strong></td><td style="${hucre}">${C.kacisHTML(b.revizyon)}</td></tr>
        <tr><td style="${hucre}"><strong>Sayfa No.</strong></td><td style="${hucre}">${C.kacisHTML(sayfaMetni)}</td></tr>
      </table>
    `;
  }

  function uretSinavDurumTutanagiHTML(b = okuTutanakBilgileri(), salon = null) {
    const salonAd = salon ? salon.ad : b.salon;
    const salonOgrenciSayisi = salon && salon.ogrenciSayisi !== undefined ? salon.ogrenciSayisi : null;
    const gozetmenler = salon && (salon.gozetmenler || []).some(Boolean) ? salon.gozetmenler : b.gozetmenler;
    const hucre = 'border:1px solid #000; padding:4px 7px; font-size:9pt;';
    const kutu = (isaretli) => (isaretli ? '☒' : '☐');
    const uygun = b.uygunluk === 'uygun';
    const uygunDegil = b.uygunluk === 'uygunDegil';
    const bosSatirlar = Array.from({ length: 5 }, () => `<tr><td style="${hucre} height:19px;"></td><td style="${hucre}"></td><td style="${hucre}"></td></tr>`).join('');
    const gozetmenSatirlari = [0, 1]
      .map((i) => `<tr><td style="${hucre} height:26px;">${C.kacisHTML(gozetmenler[i] || '')}</td><td style="${hucre}"></td></tr>`)
      .join('');
    const ustOkulSatiri = b.kunyeModu === 'kunyeli' && b.fakulte
      ? `<div style="text-align:center; font-weight:700; font-size:9.5pt; margin-bottom:4px;">${C.kacisHTML(b.fakulte.toLocaleUpperCase('tr-TR'))}</div>`
      : '';
    return `
      <div class="a4-sayfa">
        <div class="a4-sayfa-etiket">SINAV DURUM TUTANAĞI — ${C.kacisHTML(b.ders.kod)}</div>
        ${tutanakKunyeTablosuHTML(b, 'SINAV DURUM TUTANAĞI', b.dokumanNoDurum, 'Sayfa 1 / 1')}
        ${ustOkulSatiri}
        <table style="width:100%; border-collapse:collapse; margin-bottom:6px;">
          <tr><td style="${hucre} width:48mm;"><strong>Ders Adı</strong></td><td style="${hucre}">${C.kacisHTML(b.ders.kod)} — ${C.kacisHTML(b.ders.ad)} (${C.kacisHTML(b.sinavTuru)}${b.donem ? ` · ${C.kacisHTML(b.donem)}` : ''})</td></tr>
          ${b.bolum ? `<tr><td style="${hucre}"><strong>Bölümü / Programı</strong></td><td style="${hucre}">${C.kacisHTML(b.bolum)}</td></tr>` : ''}
          ${b.sorumlu ? `<tr><td style="${hucre}"><strong>Dersin Sorumlusu</strong></td><td style="${hucre}">${C.kacisHTML(b.sorumlu)}</td></tr>` : ''}
          <tr><td style="${hucre}"><strong>Sınav Tarihi ve Saati</strong></td><td style="${hucre}">${C.kacisHTML(b.tarihSaat)}</td></tr>
          <tr><td style="${hucre}"><strong>Sınav Salonu</strong></td><td style="${hucre}">${C.kacisHTML(salonAd)}${salonOgrenciSayisi !== null ? ` (${salonOgrenciSayisi} öğrenci)` : ""}</td></tr>
        </table>
        <table style="width:100%; border-collapse:collapse; margin-bottom:6px;">
          <tr style="background:#f8fafc; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
            <td style="${hucre}"><strong>Sınava Giren:</strong> .........</td>
            <td style="${hucre}"><strong>Girmeyen (GR):</strong> .........</td>
            <td style="${hucre}"><strong>Teslim Edilen Kağıt:</strong> .........</td>
            <td style="${hucre}"><strong>İptal / Yedek:</strong> .........</td>
          </tr>
        </table>
        <table style="width:100%; border-collapse:collapse; margin-bottom:6px;">
          <tr><td style="${hucre}">${kutu(uygun)} Sınav kurallarına uygun bir sınav gerçekleşmiştir.</td></tr>
          <tr><td style="${hucre}">${kutu(uygunDegil)} Sınav kurallarına uygun bir sınav gerçekleşmemiştir. Aşağıda ismi/isimleri yazılı öğrenci/öğrenciler, sınav kurallarına aykırı davranmışlardır. İlgili belgeler, çizelgenin (açıklama) bölümüne uygun olarak Ek'te sunulmuştur.</td></tr>
        </table>
        <table style="width:100%; border-collapse:collapse; margin-bottom:5px;">
          <thead><tr style="background:#e5e7eb; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
            <th style="${hucre} width:34mm;">Öğrenci No</th><th style="${hucre} width:60mm;">Adı ve Soyadı</th><th style="${hucre}">Açıklama</th>
          </tr></thead>
          <tbody>${bosSatirlar}</tbody>
        </table>
        <p style="font-size:8pt; margin:0 0 8px;">Not: Açıklama bölümünün doldurulması zorunludur. Bu bölümde öğrencilerin hangi (kural dışı) davranışta bulundukları yazılmalıdır.</p>
        <table style="width:100%; border-collapse:collapse;">
          <thead><tr style="background:#e5e7eb; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
            <th style="${hucre} width:62%;">Gözetmen(ler) / Evrak Yetkilisi Adı ve Soyadı</th><th style="${hucre}">İmzası</th>
          </tr></thead>
          <tbody>
            ${gozetmenSatirlari}
            <tr><td style="${hucre} height:26px;"><strong>Evrak Teslim Alan (Bölüm / İdare Yetkilisi):</strong> .................................</td><td style="${hucre}"></td></tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function uretSinavYoklamaEvrakiHTML(b = okuTutanakBilgileri(), kayit = null) {
    const salonAd = kayit ? kayit.salon.ad : b.salon;
    const gozetmenler = kayit && (kayit.salon.gozetmenler || []).some(Boolean) ? kayit.salon.gozetmenler : b.gozetmenler;
    const kaynakOgrenciler = kayit ? kayit.ogrenciler : durum.ogrenciler;
    const hucre = 'border:1px solid #000; padding:2px 5px; font-size:8.2pt; line-height:1.15;';
    const liste = kaynakOgrenciler.slice().sort((x, y) => String(x.ogrNo).localeCompare(String(y.ogrNo), 'tr', { numeric: true }));
    const sayfaBasina = 20;
    const sayfaAdedi = Math.max(1, Math.ceil(liste.length / sayfaBasina));
    const sayfalar = [];
    const ustBaslikMetni = (b.fakulte || '').trim()
      ? b.fakulte.trim().toLocaleUpperCase('tr-TR')
      : 'YÜKSEKOKULU / FAKÜLTESİ';
    const bolumMetni = b.bolum !== undefined ? b.bolum : (b.ders.bolum || '');
    const sorumluMetni = b.sorumlu || b.ders.ogretimElemani || '';

    for (let s = 0; s < sayfaAdedi; s++) {
      const dilim = liste.slice(s * sayfaBasina, (s + 1) * sayfaBasina);
      const satirSayisi = Math.max(10, Math.min(20, dilim.length + 2));
      const satirYukseklikPx = 28;
      let satirlar = '';
      for (let i = 0; i < satirSayisi; i++) {
        const ogr = dilim[i];
        const noStr = `${s * sayfaBasina + i + 1}.`;
        satirlar += `<tr class="yoklama-imza-satir" style="height:${satirYukseklikPx}px; min-height:${satirYukseklikPx}px;">
          <td style="${hucre} height:${satirYukseklikPx}px; width:10mm; text-align:center;">${noStr}</td>
          <td style="${hucre} height:${satirYukseklikPx}px; width:30mm; font-family:Consolas,monospace;">${ogr ? C.kacisHTML(ogr.ogrNo) : ''}</td>
          <td style="${hucre} height:${satirYukseklikPx}px;">${ogr ? C.kacisHTML(ogr.adSoyad) : ''}</td>
          <td style="${hucre} height:${satirYukseklikPx}px; width:22mm; text-align:center;"></td>
          <td style="${hucre} height:${satirYukseklikPx}px; width:46mm;"></td>
        </tr>`;
      }
      const bilgi = (e, d) => `<td style="${hucre} width:34mm;"><strong>${e}</strong></td><td style="${hucre}">${C.kacisHTML(d)}</td>`;
      sayfalar.push(`
        <div class="a4-sayfa" style="padding:7mm 10mm;">
          <div class="a4-sayfa-etiket" style="margin-bottom:2px;">SINAV YOKLAMA EVRAKI — ${C.kacisHTML(b.ders.kod)} (${s + 1}/${sayfaAdedi})</div>
          ${tutanakKunyeTablosuHTML(b, 'SINAV YOKLAMA EVRAKI', b.dokumanNoYoklama, `Sayfa ${s + 1} / ${sayfaAdedi}`)}
          ${b.kunyeModu === 'kunyeli' ? `<div style="text-align:center; font-weight:700; font-size:9pt; margin-bottom:1px;">${C.kacisHTML(ustBaslikMetni)}</div>` : ''}
          <div style="text-align:center; font-weight:700; font-size:9pt; margin-bottom:4px;">${C.kacisHTML(b.donem || '20…… - 20……')} EĞİTİM ÖĞRETİM YILI SINAV YOKLAMA EVRAKI</div>
          <table style="width:100%; border-collapse:collapse; margin-bottom:4px;">
            <tr>${bilgi('DERS ADI', `${b.ders.kod} — ${b.ders.ad}`)}${bilgi('BÖLÜMÜ', bolumMetni)}</tr>
            <tr>${bilgi('DERSİN SORUMLUSU', sorumluMetni)}${bilgi('SALON NO', salonAd)}</tr>
            <tr>${bilgi('SINAV TARİHİ VE SAATİ', b.tarihSaat)}${bilgi('SINAV TÜRÜ', b.sinavTuru)}</tr>
          </table>
          <table class="yoklama-imza-tablo" style="width:100%; border-collapse:collapse; margin-bottom:5px;">
            <thead><tr style="background:#e5e7eb; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
              <th style="${hucre} width:10mm;">NO</th><th style="${hucre} width:30mm;">NUMARA</th><th style="${hucre}">ADI SOYADI</th><th style="${hucre} width:22mm; text-align:center;">KİTAPÇIK</th><th style="${hucre} width:46mm;">İMZA</th>
            </tr></thead>
            <tbody>${satirlar}</tbody>
          </table>
          <table style="width:100%; border-collapse:collapse;">
            <tr><td style="${hucre} height:25px; width:50mm;"><strong>Gözetmen 1:</strong> ${C.kacisHTML(gozetmenler[0] || '')}</td><td style="${hucre} height:25px;">İmza:</td><td style="${hucre} height:25px; width:50mm;"><strong>Gözetmen 2:</strong> ${C.kacisHTML(gozetmenler[1] || '')}</td><td style="${hucre} height:25px;">İmza:</td></tr>
          </table>
        </div>
      `);
    }
    return sayfalar.join('');
  }

  function baslatUygulama() {
    verileriYukle();
    durum.ogrenciKayitlari = ogrenciKayitlariniHazirla(durum.ogrenciKayitlari);
    doldurDersSecici();
    guncelleKayitliSinavlarCubuguUI();
    guncelleOgrenciListesiSekmesi();
    guncelleA4Onizleme();
    guncelleSoruBankasiTablosu();
    guncelleOmrTabloVeKuyruk();
    guncelleMaddeAnaliziSekmesi();
    guncelleOnlineSinavSekmesiUI();
    guncelleKayitDurumCubuguUI();

    const yukleSunucuAktifOnlineSinavDurumu = async () => {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      try {
        const y = await fetch('/api/online-sinav-durum', { cache: 'no-store' });
        if (!y.ok) return;
        const v = await y.json().catch(() => null);
        if (!v || !v.sinavId) return;
        if (v.aktif) {
          durum.onlineSinav = Object.assign({}, durum.onlineSinav, {
            sinavId: v.sinavId,
            baslik: v.baslik || durum.onlineSinav.baslik || 'Online Sınav',
            sinavTuru: v.sinavTuru || durum.onlineSinav.sinavTuru || 'Vize',
            dersId: v.dersId || durum.onlineSinav.dersId || durum.aktifDersId,
            aktif: true,
            baslangic: v.baslangic || durum.onlineSinav.baslangic,
            bitis: v.bitis || durum.onlineSinav.bitis,
            sureDk: Number(v.sureDk) || durum.onlineSinav.sureDk || 40
          });
          if (!durum.onlineSinavListesi.some((s) => s && s.sinavId === v.sinavId)) {
            durum.onlineSinavListesi.unshift(Object.assign({}, durum.onlineSinav));
          } else {
            durum.onlineSinavListesi.forEach((s) => {
              if (s && s.sinavId === v.sinavId) Object.assign(s, { aktif: true, baslik: v.baslik || s.baslik, sureDk: Number(v.sureDk) || s.sureDk });
            });
          }
          guncelleKioskOgrenciSinavListesiUI();
        }
      } catch (_) {}
    };

    // -----------------------------------------------------------------------
    // SABİT GLOBAL KAYIT & BULUT KASA ÇUBUĞU + KAYITLI SINAV SNAPSHOT + ÇOKLU SEKME
    // -----------------------------------------------------------------------
    const btnGenelKaydetUygula = document.getElementById('btn-genel-kaydet-uygula');
    if (btnGenelKaydetUygula) {
      btnGenelKaydetUygula.addEventListener('click', async () => {
        kaydetAktifDersIzoleDurumu(durum.aktifDersId);
        verileriKaydet({ mesaj: `🟢 Tüm değişiklikler uygulandı ve kaydedildi · ${saatMetniUret()}` });
        yenileTumSekmePanelleriUI();
        await bulutKasayaSenkronla(false);
      });
    }

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 's' && !durum.kioskOturum && durum.hocaOturumAcik) {
        e.preventDefault();
        if (btnGenelKaydetUygula) btnGenelKaydetUygula.click();
      }
    });

    const btnSonSilineniGeriAl = document.getElementById('btn-son-silineni-geri-al');
    if (btnSonSilineniGeriAl) {
      btnSonSilineniGeriAl.addEventListener('click', () => {
        uygulaSonGeriAlYedegi();
      });
    }

    const btnBulutGecmisAc = document.getElementById('btn-bulut-gecmis-ac');
    if (btnBulutGecmisAc) {
      btnBulutGecmisAc.addEventListener('click', () => {
        const panel = document.getElementById('kutu-bulut-gecmis-panel');
        if (panel && !panel.hidden && panel.style.display !== 'none') {
          panel.hidden = true;
          panel.style.display = 'none';
        } else {
          acVeDoldurBulutGecmisPaneli();
        }
      });
    }

    const btnBulutPanelKapat = document.getElementById('btn-bulut-panel-kapat');
    if (btnBulutPanelKapat) {
      btnBulutPanelKapat.addEventListener('click', () => {
        const panel = document.getElementById('kutu-bulut-gecmis-panel');
        if (panel) {
          panel.hidden = true;
          panel.style.display = 'none';
        }
      });
    }

    const btnBulutSimdiSenkronla = document.getElementById('btn-bulut-simdi-senkronla');
    if (btnBulutSimdiSenkronla) {
      btnBulutSimdiSenkronla.addEventListener('click', async () => {
        verileriKaydet({ bulutAtla: true });
        await bulutKasayaSenkronla(true, true);
        acVeDoldurBulutGecmisPaneli();
      });
    }

    const btnBulutSimdiCek = document.getElementById('btn-bulut-simdi-cek');
    if (btnBulutSimdiCek) {
      btnBulutSimdiCek.addEventListener('click', async () => {
        await bulutKasadanYukle(false);
        acVeDoldurBulutGecmisPaneli();
      });
    }

    const listeBulutYedekGecmisi = document.getElementById('liste-bulut-yedek-gecmisi');
    if (listeBulutYedekGecmisi) {
      listeBulutYedekGecmisi.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-bulut-yedek-geri-yukle]');
        if (!btn) return;
        const yedekId = Number(btn.getAttribute('data-bulut-yedek-geri-yukle')) || 0;
        const token = sessionStorage.getItem('hoca_token') || '';
        if (!yedekId || !token) return;
        kaydetSonGeriAlYedegi(`Bulut Yedeğine Dönüş (#${yedekId})`);
        try {
          const r = await fetch('/api/bulut-kasa/geri-yukle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ id: yedekId, yedekId })
          });
          const v = await r.json().catch(() => null);
          const geriPaket = v && (v.veri || v.veriPaketi);
          if (r.ok && geriPaket) {
            uygulaYuklenenDurumNesnesi(geriPaket);
            yukleAktifDersIzoleDurumu(durum.aktifDersId);
            durum.revizyonNo = Number(v.revizyonNo) || (durum.revizyonNo + 1);
            durum.sonBulutRevizyonNo = durum.revizyonNo;
            verileriKaydet({ bulutAtla: true, zorlaEz: true, mesaj: `⏪ Bulut yedeği (#${yedekId}) başarıyla geri yüklendi` });
            yenileTumSekmePanelleriUI();
            acVeDoldurBulutGecmisPaneli();
          }
        } catch (_) {}
      });
    }

    // Kayıtlı Sınavlar (Snapshots) Kontrolleri
    ['sec-kayitli-sinav', 'sec-omr-kayitli-sinav'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', (e) => {
          yukleKayitliSinavSnapshot(e.target.value);
        });
      }
    });

    const btnSinavKaydetSnapshot = document.getElementById('btn-sinavi-kaydet-snapshot');
    if (btnSinavKaydetSnapshot) {
      btnSinavKaydetSnapshot.addEventListener('click', () => {
        const snap = kaydetSinavSnapshot();
        if (snap) {
          guncelleKayitDurumCubuguUI('kaydedildi', `📌 "${snap.ad}" sınavı dondurularak kaydedildi · ${saatMetniUret()}`);
        }
      });
    }

    const btnSinavBasildiKilitle = document.getElementById('btn-sinav-basildi-kilitle');
    if (btnSinavBasildiKilitle) {
      btnSinavBasildiKilitle.addEventListener('click', () => {
        kilitleVeyaAcKayitliSinav();
      });
    }

    const btnKayitliSinavSil = document.getElementById('btn-kayitli-sinav-sil');
    if (btnKayitliSinavSil) {
      btnKayitliSinavSil.addEventListener('click', () => {
        silKayitliSinavSnapshot();
      });
    }

    // Çoklu Sekme Senkronizasyonu (Diğer sekmede yeni revizyon kaydedildiğinde eski sekmeyi ezmeden yeniler; IDB destekli)
    const eszamanlaDisSekmeDegisimi = (gelenRevNo) => {
      if (durum.kioskOturum) return;
      const rev = Number(gelenRevNo || localStorage.getItem('SINAV_SON_REVIZYON_V1') || 0);
      if (rev > (durum.revizyonNo || 0)) {
        const idbAktif = (() => { try { return localStorage.getItem('SINAV_IDB_KOTA_YEDEK_AKTIF') === '1'; } catch (_) { return false; } })();
        if (idbAktif) {
          idbYedekOku().then((idbPaket) => {
            if (idbPaket && idbPaket.ana && (Number(idbPaket.ana.revizyonNo) || 0) >= rev) {
              uygulaYuklenenDurumNesnesi(idbPaket.ana);
              durum.revizyonNo = Number(idbPaket.ana.revizyonNo) || rev;
              yukleAktifDersIzoleDurumu(durum.aktifDersId);
              yenileTumSekmePanelleriUI();
            }
          }).catch(() => {});
        } else {
          verileriYukle();
          yukleAktifDersIzoleDurumu(durum.aktifDersId);
          yenileTumSekmePanelleriUI();
        }
      }
    };
    window.addEventListener('storage', (ev) => {
      if (!ev || (ev.key !== DEPO_ANAHTAR && ev.key !== 'SINAV_SON_REVIZYON_V1')) return;
      eszamanlaDisSekmeDegisimi();
    });
    if (__depoBroadcastKanal) {
      __depoBroadcastKanal.addEventListener('message', (ev) => {
        if (!ev || !ev.data || ev.data.sekmeId === durum.sekmeId) return;
        if (ev.data.tip === 'DEPO_GUNCELLENDI') {
          eszamanlaDisSekmeDegisimi(ev.data.revizyonNo);
        }
      });
    }

    // Stüdyo içi form girdilerinde henüz kaydedilmemiş değişiklik varsa sarı rozet göster
    const anaIcerikFormAlani = document.getElementById('ana-icerik-alani');
    if (anaIcerikFormAlani) {
      anaIcerikFormAlani.addEventListener('input', (e) => {
        const t = e.target;
        if (!t || !t.id) return;
        if (/^(filtre-|girdi-kayitli-sinav-ad|ogr-ekle-|yeni-soru-|sik-|toplu-)/.test(t.id)) {
          const baslangicRev = durum.revizyonNo;
          setTimeout(() => {
            if (durum.revizyonNo === baslangicRev && (t.value || '').trim().length > 0 && !t.id.startsWith('filtre-')) {
              isaretleDegisiklikBekliyor();
            }
          }, 30);
        } else {
          const baslangicRev = durum.revizyonNo;
          setTimeout(() => {
            if (durum.revizyonNo === baslangicRev) {
              isaretleDegisiklikBekliyor();
            }
          }, 30);
        }
      });
    }

    // Sekme Geçişleri
    document.querySelectorAll('.sekme-btn[data-sekme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const hedefId = btn.getAttribute('data-sekme');
        if (!hedefId) return;
        document.querySelectorAll('.sekme-btn[data-sekme]').forEach((b) => b.classList.remove('aktif'));
        document.querySelectorAll('.sekme-panel').forEach((p) => p.classList.remove('aktif'));
        btn.classList.add('aktif');
        const hedef = document.getElementById(hedefId);
        if (hedef) hedef.classList.add('aktif');
      });
    });

    // Tema Değiştirici (localStorage kalıcı, A4 önizleme beyaz kağıt korunur)
    const uygulaTemaUI = (tema) => {
      const koyuMu = tema === 'koyu';
      const yeni = koyuMu ? 'koyu' : 'acik';
      document.documentElement.setAttribute('data-tema', yeni);
      document.documentElement.classList.toggle('tema-koyu', koyuMu);
      const temaBtn = document.getElementById('btn-tema-degistir');
      if (temaBtn) {
        temaBtn.setAttribute('aria-pressed', koyuMu ? 'true' : 'false');
        const metinEl = temaBtn.querySelector('.yan-menu-metin');
        if (metinEl) {
          metinEl.textContent = koyuMu ? 'Açık Tema' : 'Koyu Tema';
        } else {
          temaBtn.textContent = koyuMu ? '☀️ Açık Kağıt' : '🌙 Koyu Tema';
        }
      }
    };
    try {
      const kayitliTema = localStorage.getItem('SINAV_TEMA_V1');
      if (kayitliTema === 'koyu' || kayitliTema === 'acik') {
        uygulaTemaUI(kayitliTema);
      }
    } catch (_) {}
    const btnTemaDegistir = document.getElementById('btn-tema-degistir');
    if (btnTemaDegistir) {
      btnTemaDegistir.addEventListener('click', () => {
        const mevcut = document.documentElement.getAttribute('data-tema');
        const yeni = mevcut === 'koyu' ? 'acik' : 'koyu';
        uygulaTemaUI(yeni);
        try { localStorage.setItem('SINAV_TEMA_V1', yeni); } catch (_) {}
      });
    }

    // Aktif Ders Değişimi (Ders Bazlı Taslak Sınav, Salon ve OMR Sonuç İzolasyonu ile)
    document.getElementById('aktif-ders-sec').addEventListener('change', (e) => {
      degistirAktifDersGuvenli(e.target.value);
      verileriKaydet();
      yenileTumSekmePanelleriUI();
    });

    // Optik Yerleşim ve Kimlik Modu Değişimi
    document.getElementById('ayar-optik-yerlesim').addEventListener('change', (e) => {
      document.getElementById('grup-ayri-optik-coklu').style.display = e.target.value === 'ayri' ? 'block' : 'none';
      guncelleA4Onizleme();
    });

    document.getElementById('ayar-kimlik-modu').addEventListener('change', (e) => {
      document.getElementById('grup-tam-no-hane').style.display = e.target.value === 'tam' ? 'grid' : 'none';
      guncelleA4Onizleme();
    });

    // Sınav Stüdyosu Tüm Kontrollerde Anlık Güncelleme
    [
      'ayar-dy-sayisi', 'ayar-dy-toplam-puan', 'ayar-test-sayisi', 'ayar-test-toplam-puan',
      'ayar-sik-sayisi', 'ayar-klasik-sayisi', 'ayar-klasik-puan-modu', 'ayar-klasik-optik-modu', 'ayar-klasik-toplam-puan',
      'ayar-ayri-optik-adet', 'ayar-hane-sayisi', 'ayar-kitapcik-gruplar',
      'ayar-onizleme-mod', 'antet-kurum', 'antet-sinav-ad', 'antet-sure',
      'antet-tarih', 'antet-hoca', 'kalite-form-tipi', 'kalite-dokuman-no',
      'kalite-yayin-tarihi', 'kalite-revizyon', 'ayar-mukerrer-gizle', 'ayar-islem-boslugu',
      'ayar-zorluk-dagilimi'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', guncelleA4Onizleme);
        el.addEventListener('change', guncelleA4Onizleme);
      }
    });

    // Klasik "Tek Tek Puan Gir" Dinamik Kutularında Değişim Dinleyicisi
    const kutuKlasikTekTek = document.getElementById('kutu-klasik-tek-tek-puanlar');
    if (kutuKlasikTekTek) {
      kutuKlasikTekTek.addEventListener('input', (e) => {
        const inp = e.target.closest('[data-klasik-tek-puan-idx]');
        if (!inp) return;
        const idx = parseInt(inp.getAttribute('data-klasik-tek-puan-idx'), 10);
        durum.klasikTekTekPuanlar[idx] = Math.max(1, parseFloat(inp.value) || 10);
        guncelleA4Onizleme();
      });
    }

    // ⚖️ Toplamı 100 Puana Otomatik Tamamlama Düğmesi
    const btnPuan100Dengele = document.getElementById('btn-puan-100-dengele');
    if (btnPuan100Dengele) {
      btnPuan100Dengele.addEventListener('click', () => {
        const dySay = parseInt(document.getElementById('ayar-dy-sayisi').value, 10) || 0;
        const testSay = parseInt(document.getElementById('ayar-test-sayisi').value, 10) || 0;
        const klasikSay = parseInt(document.getElementById('ayar-klasik-sayisi').value, 10) || 0;

        let dyTop = dySay > 0 ? (parseFloat(document.getElementById('ayar-dy-toplam-puan').value) || 0) : 0;
        let klasikTop = klasikSay > 0 ? (parseFloat(document.getElementById('ayar-klasik-toplam-puan').value) || 0) : 0;

        if (testSay > 0) {
          const kalanTest = Math.max(0, 100 - dyTop - klasikTop);
          document.getElementById('ayar-test-toplam-puan').value = String(kalanTest);
        } else if (dySay > 0) {
          const kalanDy = Math.max(0, 100 - klasikTop);
          document.getElementById('ayar-dy-toplam-puan').value = String(kalanDy);
        } else if (klasikSay > 0) {
          document.getElementById('ayar-klasik-puan-modu').value = 'esit';
          document.getElementById('ayar-klasik-toplam-puan').value = '100';
        }
        guncelleA4Onizleme();
      });
    }

    // Okulun Hazır PDF veya Görsel Formunu 3 Katmanlı Akıllı Kesici ile Yükleme + Pano (Ctrl+V) Desteği
    const uygulaTamSayfaKaliteKesiti = (tamSayfaDataUrl) => {
      if (!tamSayfaDataUrl) return;
      durum.kaliteHamTamSayfaDataUrl = tamSayfaDataUrl;
      const ustMm = parseFloat((document.getElementById('ayar-pdf-ust-mm') && document.getElementById('ayar-pdf-ust-mm').value) || '42') || 42;
      const altMm = parseFloat((document.getElementById('ayar-pdf-alt-mm') && document.getElementById('ayar-pdf-alt-mm').value) || '18') || 18;
      if (document.getElementById('deger-pdf-ust-mm')) document.getElementById('deger-pdf-ust-mm').textContent = String(ustMm);
      if (document.getElementById('deger-pdf-alt-mm')) document.getElementById('deger-pdf-alt-mm').textContent = String(altMm);

      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width || 800;
        c.height = img.height || 1131;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);

        // Eğer görsel sadece kısa bir antet şeridiyse (boy/en < 0.45) doğrudan üst antet olarak kullan;
        // Tam A4 sayfa form ise 3 Katmanlı Akıllı Kesici (Üst Antet + Beyaz Orta Alan + Alt İmza) uygula
        if (c.height / Math.max(1, c.width) < 0.45) {
          durum.kaliteGorselDataUrl = tamSayfaDataUrl;
          durum.kaliteAltBilgiDataUrl = null;
        } else {
          const kesit = C.kesKaliteFormuUstVeAltKatman(c, ustMm, altMm);
          durum.kaliteGorselDataUrl = kesit.ustAntetDataUrl || tamSayfaDataUrl;
          durum.kaliteAltBilgiDataUrl = altMm > 0 ? kesit.altBilgiDataUrl : null;
        }
        const kutuKesit = document.getElementById('kutu-pdf-kesit-ayar');
        if (kutuKesit) kutuKesit.style.display = 'block';
        document.getElementById('kalite-form-tipi').value = 'ozel-banner';
        document.getElementById('ayar-mukerrer-gizle').value = 'tam-gizle';
        guncelleA4Onizleme();
      };
      img.src = tamSayfaDataUrl;
    };

    ['ayar-pdf-ust-mm', 'ayar-pdf-alt-mm'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          if (durum.kaliteHamTamSayfaDataUrl) {
            uygulaTamSayfaKaliteKesiti(durum.kaliteHamTamSayfaDataUrl);
          }
        });
      }
    });

    const inputKaliteGorsel = document.getElementById('input-kalite-gorsel');
    if (inputKaliteGorsel) {
      inputKaliteGorsel.addEventListener('change', async (e) => {
        const dosya = e.target.files && e.target.files[0];
        if (!dosya) return;
        const ad = dosya.name.toLowerCase();
        if (/\.(docx|doc|xlsx|xls)$/.test(ad)) {
          await uygulaKaliteBelgeDosyasi(dosya);
          return;
        }
        if (dosya.type === 'application/pdf' || dosya.name.toLowerCase().endsWith('.pdf')) {
          // PDF dosyasından metin künyesini + gömülü JPEG antetini yakala ve 3 katmanlı kesiciyi çalıştır
          const reader = new FileReader();
          reader.onload = () => {
            const uint8 = new Uint8Array(reader.result);
            const cozum = C.cozPdfIcindenMetinVeGorsel(uint8);
            if (cozum.dokumanNo) document.getElementById('kalite-dokuman-no').value = cozum.dokumanNo;
            if (cozum.revizyon) document.getElementById('kalite-revizyon').value = cozum.revizyon;

            if (cozum.gomuluJpegBlob) {
              uygulaTamSayfaKaliteKesiti(C.olusturGuvenliBlobUrl(cozum.gomuluJpegBlob));
            } else {
              document.getElementById('kalite-form-tipi').value = 'iso9001';
              document.getElementById('ayar-mukerrer-gizle').value = 'tam-gizle';
              const kutuKesit = document.getElementById('kutu-pdf-kesit-ayar');
              if (kutuKesit) kutuKesit.style.display = 'block';
              const etiketDurum = document.getElementById('etiket-pdf-kesit-durum');
              if (etiketDurum) {
                etiketDurum.textContent = `✅ PDF Kalite Künyesi (${cozum.dokumanNo || 'ISO-9001'}) otomatik aktarıldı ve mükerrer başlıklar gizlendi.`;
              }
              guncelleA4Onizleme();
            }
          };
          reader.readAsArrayBuffer(dosya);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          uygulaTamSayfaKaliteKesiti(String(reader.result));
        };
        reader.readAsDataURL(dosya);
      });
    }

    // Panodan (Ctrl+V) Kalite Formu Anteti Yapıştırma Desteği
    const btnKalitePano = document.getElementById('btn-kalite-pano-yapistir');
    if (btnKalitePano) {
      btnKalitePano.addEventListener('click', async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.read) {
            const items = await navigator.clipboard.read();
            for (const item of items) {
              const imgType = item.types.find((t) => t.startsWith('image/'));
              if (imgType) {
                const blob = await item.getType(imgType);
                const r = new FileReader();
                r.onload = () => uygulaTamSayfaKaliteKesiti(String(r.result));
                r.readAsDataURL(blob);
                return;
              }
            }
          }
          kaliteDurumMesaji('ℹ️ Panoda resim bulunamadı. Word/PDF ekranından Win+Shift+S ile anteti kopyalayıp sayfada Ctrl+V tuşlarına basabilirsiniz.', true);
        } catch (_) {
          kaliteDurumMesaji('ℹ️ Word/PDF ekranından kopyaladığınız anteti doğrudan sayfada Ctrl+V tuşlarına basarak yapıştırabilirsiniz.', true);
        }
      });
    }

    window.addEventListener('paste', (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.startsWith('image/')) {
          const dosya = items[i].getAsFile();
          if (dosya) {
            const r = new FileReader();
            r.onload = () => uygulaTamSayfaKaliteKesiti(String(r.result));
            r.readAsDataURL(dosya);
            break;
          }
        }
      }
    });

    // Boş Soru CSV Şablonları (Test, D/Y, Klasik ve Karma — Zorluk Derecesi Dahil) İndir ve Yükle
    const indirCsvYardimci = (icerik, dosyaAdi) => {
      const blob = new Blob([icerik], { type: 'text/csv;charset=utf-8' });
      const url = C.olusturGuvenliBlobUrl(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = dosyaAdi;
      a.click();
    };

    const btnBosTestCsv = document.getElementById('btn-bos-test-csv-indir');
    if (btnBosTestCsv) {
      btnBosTestCsv.addEventListener('click', () => {
        indirCsvYardimci(C.uretBosTestSablonuCSV(), 'Bos_Test_Sorulari_Sablonu.csv');
      });
    }

    const btnBosDyCsv = document.getElementById('btn-bos-dy-csv-indir');
    if (btnBosDyCsv) {
      btnBosDyCsv.addEventListener('click', () => {
        indirCsvYardimci(C.uretBosDySablonuCSV(), 'Bos_Dogru_Yanlis_Sablonu.csv');
      });
    }

    const btnBosKlasikCsv = document.getElementById('btn-bos-klasik-csv-indir');
    if (btnBosKlasikCsv) {
      btnBosKlasikCsv.addEventListener('click', () => {
        indirCsvYardimci(C.uretBosKlasikSablonuCSV(), 'Bos_Klasik_Sorular_Sablonu.csv');
      });
    }

    const btnBosSoruCsv = document.getElementById('btn-bos-soru-csv-indir');
    if (btnBosSoruCsv) {
      btnBosSoruCsv.addEventListener('click', () => {
        indirCsvYardimci(C.uretBosSoruSablonuCSV(), 'Bos_Karma_Soru_Sablonu_Test_DY_Klasik.csv');
      });
    }

    const btnSoruBankasiCsvDisaAktar = document.getElementById('btn-soru-bankasi-csv-disa-aktar');
    if (btnSoruBankasiCsvDisaAktar) {
      btnSoruBankasiCsvDisaAktar.addEventListener('click', () => {
        const aktifDers = durum.dersler.find((d) => d.id === durum.aktifDersId) || { kod: 'DERS' };
        const aktifSorular = durum.sorular.filter((s) => !s.arsivde && (s.dersId === durum.aktifDersId || s.dersId === 'genel'));
        const csvIcerik = C.uretSoruBankasiCSV(aktifSorular);
        indirCsvYardimci(csvIcerik, `${aktifDers.kod || 'Ders'}_Soru_Bankasi_Bologna_OC.csv`);
      });
    }

    const inputSoruCsv = document.getElementById('input-soru-csv-yukle');
    if (inputSoruCsv) {
      inputSoruCsv.addEventListener('change', async (e) => {
        const dosya = e.target.files && e.target.files[0];
        if (!dosya) return;
        const bilgi = document.getElementById('etiket-soru-yukleme-durum');
        try {
          const metin = await dosyadanCsvMetniOku(dosya);
          const uretilen = C.cozSoruBankasiCSV(metin, durum.aktifDersId);
          if (uretilen.length > 0) {
            durum.sorular.unshift(...uretilen);
            verileriKaydet({ mesaj: `🟢 ${uretilen.length} yeni soru eklendi ve kaydedildi · ${saatMetniUret()}` });
            guncelleSoruBankasiTablosu();
            guncelleA4Onizleme();
          }
          if (bilgi) {
            bilgi.style.color = uretilen.length > 0 ? 'var(--basari)' : 'var(--uyari)';
            bilgi.textContent = uretilen.length > 0 ? `✅ ${uretilen.length} soru yüklendi (${dosya.name})` : `⚠️ ${dosya.name} içinde okunabilir soru bulunamadı`;
          }
        } catch (err) {
          if (bilgi) {
            bilgi.style.color = 'var(--tehlike)';
            bilgi.textContent = `⚠️ Soru dosyası okunamadı: ${err.message}`;
          }
          guncelleKayitDurumCubuguUI('hata', `⚠️ Soru dosyası okunamadı: ${err.message}`);
        }
        e.target.value = '';
      });
    }

    // Boş Öğrenci Listesi CSV Şablonu İndir ve Yükle (Varsayılan: Kayıpsız Birleştirme Modu)
    const btnBosOgrCsv = document.getElementById('btn-bos-ogrenci-csv-indir');
    if (btnBosOgrCsv) {
      btnBosOgrCsv.addEventListener('click', () => {
        const csv = C.uretBosOgrenciSablonuCSV();
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = C.olusturGuvenliBlobUrl(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Bos_Ogrenci_Listesi_Sablonu.csv';
        a.click();
      });
    }

    const inputOgrCsv = document.getElementById('input-ogrenci-csv-yukle');
    if (inputOgrCsv) {
      inputOgrCsv.addEventListener('change', async (e) => {
        const dosya = e.target.files && e.target.files[0];
        if (!dosya) return;
        try {
          const liste = C.cozOgrenciListesiCSV(await dosyadanCsvMetniOku(dosya));
          if (liste.length > 0) {
            const modSecEl = document.getElementById('ayar-ogrenci-csv-modu');
            const yuklemeModu = (modSecEl && modSecEl.value) || 'birlestir';
            if (yuklemeModu === 'degistir') {
              kaydetSonGeriAlYedegi('Öğrenci Listesi Değişimi');
              durum.ogrenciler = liste;
            } else {
              liste.forEach((o) => ogrenciEkleAktifDerse(o.ogrNo, o.adSoyad));
            }
            verileriKaydet({
              zorlaEz: yuklemeModu === 'degistir',
              mesaj: yuklemeModu === 'degistir'
                ? `🟢 Öğrenci listesi yenilendi (${liste.length} öğrenci) · ${saatMetniUret()}`
                : `🟢 ${liste.length} öğrenci kayıpsız birleştirildi (Toplam: ${durum.ogrenciler.length}) · ${saatMetniUret()}`
            });
            guncelleOgrenciListesiSekmesi();
            guncelleA4Onizleme();
          }
        } catch (err) {
          guncelleKayitDurumCubuguUI('hata', `⚠️ Öğrenci dosyası okunamadı: ${err.message}`);
        }
        e.target.value = '';
      });
    }

    // OBS / e-Okul Resmi Not Çizelgesi (GR + Harf Notu Dahil) İndir
    const btnObsCsv = document.getElementById('btn-obs-resmi-csv-indir');
    if (btnObsCsv) {
      btnObsCsv.addEventListener('click', () => {
        const csv = C.uretResmiObsNotCizelgesiCSV(durum.ogrenciler, durum.okumaSonuclari);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = C.olusturGuvenliBlobUrl(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `OBS_Resmi_Sinav_Not_Cizelgesi_${Date.now()}.csv`;
        a.click();
      });
    }

    // Değerlendirme Anında Sonu Aynı Numara Olan Öğrenciyi Tek Tıkla Seçme
    document.getElementById('kutu-son-okunan-detay').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cakisma-sec-id]');
      if (!btn) return;
      const kayitId = btn.getAttribute('data-cakisma-sec-id');
      const secilenNo = btn.getAttribute('data-cakisma-ogrno');
      const secilenAd = btn.getAttribute('data-cakisma-ad');
      const kayit = durum.okumaSonuclari.find((k) => k.id === kayitId);
      if (kayit) {
        kayit.ogrNo = secilenNo;
        kayit.adSoyad = secilenAd;
        kayit.supheliMi = false;
        kayit.incelemeKuyrugu = (kayit.incelemeKuyrugu || []).filter((x) => !x.alan.includes('Çakışma'));
        verileriKaydet();
        kaydetVeGosterOmrSonuc(kayit);
      }
    });

    // Canlı Şifre Kriterleri (Büyük/Küçük/Sayı/Simge girdikçe yeşil olur) — Öğrenci Kiosk
    ['kiosk-sifre', 'kiosk-sifre-tekrar'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', guncelleCanliSifreRozetleri);
    });

    // 👨‍🏫 Öğretmen / Hoca Kullanıcı Adı, Şifre Doğrulama ve Canlı Şifre Kriterleri
    const guncelleHocaCanliSifreRozetleri = () => {
      const s = (document.getElementById('hoca-kayit-sifre') && document.getElementById('hoca-kayit-sifre').value) || '';
      const t = (document.getElementById('hoca-kayit-sifre-tekrar') && document.getElementById('hoca-kayit-sifre-tekrar').value) || '';
      const durumKr = C.kontrolCanliSifreKurallari(s, t);
      const eslesmeler = [
        ['hkr-uzunluk', durumKr.uzunlukOk, 'En az 8 karakter'],
        ['hkr-buyuk', durumKr.buyukHarfOk, 'BÜYÜK harf (A-Z)'],
        ['hkr-kucuk', durumKr.kucukHarfOk, 'küçük harf (a-z)'],
        ['hkr-rakam', durumKr.rakamOk, 'Sayı / Rakam (0-9)'],
        ['hkr-simge', durumKr.simgeOk, 'Simge (!@#$%^&*.)'],
        ['hkr-eslesme', durumKr.eslesmeOk, 'Şifre tekrarı eşleşiyor']
      ];
      for (const [id, ok, etiket] of eslesmeler) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.className = ok ? 'rozet rozet-yesil' : 'rozet rozet-kirmizi';
        el.textContent = `${ok ? '🟢 ✓' : '⚪'} ${etiket}`;
      }
    };

    ['hoca-kayit-sifre', 'hoca-kayit-sifre-tekrar'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', guncelleHocaCanliSifreRozetleri);
    });

    const aktifHocaYoneticiMi = () => {
      if (!durum.hocaOturumAcik) return false;
      const rol = String((durum.hocaHesap && durum.hocaHesap.rol) || '').toLowerCase();
      const kAdi = String((durum.hocaHesap && durum.hocaHesap.kullaniciAdi) || '').toLowerCase();
      return rol === 'yonetici' || kAdi === 'hoca';
    };

    const guncelleHocaYonetimPaneliUI = () => {
      const etiketKod = document.getElementById('etiket-kurum-davet-kodu');
      const btnKodYenile = document.getElementById('btn-davet-kodu-yenile');
      const tbody = document.getElementById('tablo-hoca-onay-listesi');
      const yoneticiMi = aktifHocaYoneticiMi();

      if (etiketKod) {
        etiketKod.textContent = yoneticiMi ? (durum.davetKodu || 'AKADEMI-2026') : '🔒 Yöneticiye Özel';
      }
      if (btnKodYenile) {
        btnKodYenile.disabled = !yoneticiMi;
      }
      if (!tbody) return;

      const liste = Array.isArray(durum.hocaListesi) && durum.hocaListesi.length > 0
        ? durum.hocaListesi
        : [durum.hocaHesap];

      tbody.innerHTML = liste
        .map((h) => {
          const kAdi = C.temizleHTML(h.kullaniciAdi || '');
          const ad = C.temizleHTML(h.adSoyad || '');
          const eposta = C.temizleHTML(h.eposta || '');
          const tel = C.temizleHTML(h.telefon || '');
          const rol = String(h.rol || (String(h.kullaniciAdi).toLowerCase() === 'hoca' ? 'yonetici' : 'hoca')).toLowerCase();
          const durumStr = String(h.durum || 'aktif').toLowerCase();

          let durumRozet = '';
          if (rol === 'yonetici') {
            durumRozet = '<span class="rozet rozet-yesil">🏛️ Yönetici (Aktif)</span>';
          } else if (durumStr === 'beklemede') {
            durumRozet = '<span class="rozet rozet-sari">⏳ Onay Bekliyor</span>';
          } else if (durumStr === 'askida' || durumStr === 'reddedildi') {
            durumRozet = '<span class="rozet rozet-kirmizi">🚫 Askıda</span>';
          } else {
            durumRozet = '<span class="rozet rozet-yesil">🟢 Hoca (Aktif)</span>';
          }

          let islemHtml = '<span style="font-size:0.72rem; color:var(--metin-ikincil);">Ana Yönetici</span>';
          if (rol !== 'yonetici') {
            if (!yoneticiMi) {
              islemHtml = '<span style="font-size:0.72rem; color:var(--metin-ikincil);">🔒 Yönetici Yetkisi Gerekir</span>';
            } else {
              const butonlar = [];
              if (durumStr !== 'aktif') {
                butonlar.push(
                  `<button type="button" class="btn btn-basari btn-kucuk" data-hoca-islem="onayla" data-hoca-kullanici="${kAdi}" title="Öğretmen hesabını onayla ve aktifleştir">✅ Onayla</button>`
                );
              }
              if (durumStr === 'aktif') {
                butonlar.push(
                  `<button type="button" class="btn btn-kucuk" data-hoca-islem="askiya_al" data-hoca-kullanici="${kAdi}" title="Hesabı geçici olarak askıya al">⏸️ Askıya Al</button>`
                );
              }
              butonlar.push(
                `<button type="button" class="btn btn-tehlike btn-kucuk" data-hoca-islem="sil" data-hoca-kullanici="${kAdi}" title="Öğretmen kaydını sil">🗑️ Sil</button>`
              );
              islemHtml = `<div style="display:inline-flex; gap:0.25rem; flex-wrap:wrap; justify-content:flex-end;">${butonlar.join('')}</div>`;
            }
          }

          return `
            <tr>
              <td><strong>${kAdi}</strong><br/><span style="font-size:0.69rem; color:var(--metin-ikincil);">${eposta}${tel ? ` · ${tel}` : ''}</span></td>
              <td>${ad}</td>
              <td>${durumRozet}</td>
              <td style="text-align:right;">${islemHtml}</td>
            </tr>
          `;
        })
        .join('');
    };

    guncelleHocaYonetimPaneliUI();

    // Tek Ortak Başlangıç Giriş Kapısı Rol Seçici (👨‍🏫 Eğitmen Girişi <-> 🎓 Öğrenci Girişi)
    const gecisYapOgrenciGirisKapisi = () => {
      yukleSunucuAktifOnlineSinavDurumu();
      guncelleKioskOgrenciSinavListesiUI();
      document.getElementById('modal-hoca-giris').style.display = 'none';
      document.getElementById('ana-icerik-alani').style.display = 'none';
      document.getElementById('kiosk-sinav-alani').style.display = 'block';
    };

    const gecisYapEgitmenGirisKapisi = () => {
      if (durum.kioskOturum) return; // Aktif sınav devam ederken çıkılamaz
      C.temizleGuvenliInterval('kiosk-sayac');
      document.body.classList.remove('kiosk-aktif');
      document.getElementById('kiosk-sinav-alani').style.display = 'none';
      const anaAlani = document.getElementById('ana-icerik-alani');
      const ustNav = document.getElementById('ust-sekme-nav');
      anaAlani.style.display = 'block';
      if (!durum.hocaOturumAcik) {
        anaAlani.style.filter = 'none';
        anaAlani.style.pointerEvents = 'none';
        anaAlani.style.userSelect = 'none';
        anaAlani.inert = true;
        anaAlani.setAttribute('inert', '');
        if (ustNav) { ustNav.inert = true; ustNav.setAttribute('inert', ''); }
        guncelleHocaYonetimPaneliUI();
        document.getElementById('modal-hoca-giris').style.display = 'flex';
      }
    };

    const btnGirisRolOgrenci = document.getElementById('btn-giris-rol-ogrenci');
    if (btnGirisRolOgrenci) {
      btnGirisRolOgrenci.addEventListener('click', gecisYapOgrenciGirisKapisi);
    }
    const btnGirisRolEgitmen = document.getElementById('btn-giris-rol-egitmen');
    if (btnGirisRolEgitmen) {
      btnGirisRolEgitmen.addEventListener('click', gecisYapEgitmenGirisKapisi);
    }
    const btnKioskRolEgitmen = document.getElementById('btn-kiosk-rol-egitmen');
    if (btnKioskRolEgitmen) {
      btnKioskRolEgitmen.addEventListener('click', gecisYapEgitmenGirisKapisi);
    }

    const btnHocaModalAc = document.getElementById('btn-hoca-giris-ac');
    if (btnHocaModalAc) {
      btnHocaModalAc.addEventListener('click', () => {
        const anaAlani = document.getElementById('ana-icerik-alani');
        const ustNav = document.getElementById('ust-sekme-nav');
        if (!durum.kioskOturum) {
          document.getElementById('kiosk-sinav-alani').style.display = 'none';
          anaAlani.style.display = 'block';
        }
        if (anaAlani) { anaAlani.inert = true; anaAlani.setAttribute('inert', ''); }
        if (ustNav) { ustNav.inert = true; ustNav.setAttribute('inert', ''); }
        guncelleHocaYonetimPaneliUI();
        const modalHoca = document.getElementById('modal-hoca-giris');
        if (modalHoca) {
          modalHoca.setAttribute('data-giris-modu', 'detay');
          modalHoca.style.display = 'flex';
        }
      });
    }

    const btnHocaModalKapat = document.getElementById('btn-modal-hoca-kapat');
    if (btnHocaModalKapat) {
      btnHocaModalKapat.addEventListener('click', () => {
        if (!durum.hocaOturumAcik) {
          const hataKutu = document.getElementById('hoca-giris-hata');
          hataKutu.textContent = 'Stüdyo kilitli! Devam etmek için lütfen öğretmen kullanıcı adı ve şifrenizle giriş yapınız.';
          hataKutu.hidden = false;
          return;
        }
        const anaAlani = document.getElementById('ana-icerik-alani');
        const ustNav = document.getElementById('ust-sekme-nav');
        if (anaAlani) { anaAlani.inert = false; anaAlani.removeAttribute('inert'); }
        if (ustNav) { ustNav.inert = false; ustNav.removeAttribute('inert'); }
        document.getElementById('modal-hoca-giris').style.display = 'none';
      });
    }

    const btnHocaGirisYap = document.getElementById('btn-hoca-giris-yap');
    if (btnHocaGirisYap) {
      btnHocaGirisYap.addEventListener('click', async () => {
        const kullaniciAdi = (document.getElementById('hoca-giris-kullanici').value || '').trim();
        const sifre = document.getElementById('hoca-giris-sifre').value || '';
        const hataKutu = document.getElementById('hoca-giris-hata');
        const bilgiKutu = document.getElementById('hoca-giris-bilgi');
        hataKutu.hidden = true;
        bilgiKutu.style.display = 'none';

        const havuz = Array.isArray(durum.hocaListesi) && durum.hocaListesi.length > 0
          ? durum.hocaListesi
          : [durum.hocaHesap];

        // Yerel Hoca Hesap & Onay Durumu Doğrulaması
        const yerelDogrulama = C.dogrulaHocaGiris(kullaniciAdi, sifre, havuz);
        if (!yerelDogrulama.basarili) {
          sessionStorage.removeItem('hoca_token');
          hataKutu.textContent = yerelDogrulama.hata;
          hataKutu.hidden = false;
          return;
        }

        // HTTP/HTTPS Modunda Sunucu Doğrulaması (İyimser/Optimistic Giriş Yasağına Uygun)
        if (location.protocol === 'http:' || location.protocol === 'https:') {
          try {
            const yanit = await fetch('/api/hoca-giris', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kullaniciAdi, sifre })
            });
            let veri = null;
            try { veri = await yanit.json(); } catch (_) {}
            if (!yanit.ok || !veri || !veri.token) {
              const sunucuHata = (veri && veri.hata)
                ? veri.hata
                : `Sunucu öğretmen kimlik doğrulaması başarısız (HTTP ${yanit.status}).`;
              sessionStorage.removeItem('hoca_token');
              sessionStorage.removeItem('AKTIF_HOCA_OTURUM_V1');
              document.body.classList.remove('hoca-oturum-acik');
              hataKutu.textContent = sunucuHata;
              hataKutu.hidden = false;
              return;
            }
            sessionStorage.setItem('hoca_token', veri.token);
          } catch (_) {
            sessionStorage.removeItem('hoca_token');
            sessionStorage.removeItem('AKTIF_HOCA_OTURUM_V1');
            document.body.classList.remove('hoca-oturum-acik');
            hataKutu.textContent = 'Sunucu bağlantısı doğrulanamadığı için oturum açılamadı (503 / Ağ Hatası).';
            hataKutu.hidden = false;
            return;
          }
        }

        const girisYapanKayit = havuz.find(
          (h) => String(h.kullaniciAdi).toLowerCase() === String(yerelDogrulama.kullaniciAdi).toLowerCase()
        ) || yerelDogrulama;

        durum.hocaHesap = Object.assign({}, girisYapanKayit, {
          rol: yerelDogrulama.rol || girisYapanKayit.rol || 'hoca',
          durum: 'aktif'
        });
        durum.hocaOturumAcik = true;
        document.body.classList.add('hoca-oturum-acik');
        try {
          sessionStorage.setItem(
            'AKTIF_HOCA_OTURUM_V1',
            JSON.stringify({
              kullaniciAdi: durum.hocaHesap.kullaniciAdi,
              adSoyad: durum.hocaHesap.adSoyad,
              rol: durum.hocaHesap.rol
            })
          );
        } catch (_) {}
        const navEl = document.getElementById('ust-sekme-nav');
        if (navEl) {
          navEl.inert = false;
          navEl.removeAttribute('inert');
          navEl.style.filter = 'none';
          navEl.style.pointerEvents = 'auto';
          navEl.style.userSelect = 'auto';
        }
        const anaEl = document.getElementById('ana-icerik-alani');
        if (anaEl) {
          anaEl.inert = false;
          anaEl.removeAttribute('inert');
          anaEl.style.filter = 'none';
          anaEl.style.pointerEvents = 'auto';
          anaEl.style.userSelect = 'auto';
        }
        document.getElementById('etiket-aktif-hoca-kullanici').textContent = durum.hocaHesap.kullaniciAdi;
        const rozetDurum = document.getElementById('rozet-hoca-oturum-durum');
        rozetDurum.className = 'rozet rozet-yesil';
        rozetDurum.textContent = `🟢 Oturum Açık (${durum.hocaHesap.kullaniciAdi})`;
        guncelleHocaYonetimPaneliUI();
        bilgiKutu.textContent = `✅ Hoş geldiniz ${durum.hocaHesap.adSoyad} (${durum.hocaHesap.kullaniciAdi}). Öğretmen oturumu doğrulandı.`;
        bilgiKutu.style.display = 'block';
        await bulutKasadanYukle(false).catch(() => {});
      });
    }

    const btnHocaKilitle = document.getElementById('btn-hoca-kilitle');
    if (btnHocaKilitle) {
      btnHocaKilitle.addEventListener('click', () => {
        const aktifToken = sessionStorage.getItem('hoca_token') || '';
        __omrEslesmeTokenCache = { token: '', bitisMs: 0, anaToken: '' };
        durum.hocaOturumAcik = false;
        document.body.classList.remove('hoca-oturum-acik');
        sessionStorage.removeItem('hoca_token');
        sessionStorage.removeItem('AKTIF_HOCA_OTURUM_V1');
        const sifreGirdi = document.getElementById('hoca-giris-sifre');
        if (sifreGirdi) sifreGirdi.value = '';
        const navEl = document.getElementById('ust-sekme-nav');
        if (navEl) {
          navEl.inert = true;
          navEl.setAttribute('inert', '');
          navEl.style.filter = 'none';
          navEl.style.pointerEvents = 'none';
          navEl.style.userSelect = 'none';
        }
        const anaEl = document.getElementById('ana-icerik-alani');
        if (anaEl) {
          anaEl.inert = true;
          anaEl.setAttribute('inert', '');
          anaEl.style.filter = 'none';
          anaEl.style.pointerEvents = 'none';
          anaEl.style.userSelect = 'none';
        }
        const rozetDurum = document.getElementById('rozet-hoca-oturum-durum');
        if (rozetDurum) {
          rozetDurum.className = 'rozet rozet-kirmizi';
          rozetDurum.textContent = 'Stüdyo Kilitli (Giriş Bekleniyor)';
        }
        guncelleHocaYonetimPaneliUI();
        const modalHocaGiris = document.getElementById('modal-hoca-giris');
        if (modalHocaGiris) modalHocaGiris.style.display = 'flex';
        if (aktifToken && (location.protocol === 'http:' || location.protocol === 'https:')) {
          fetch('/api/hoca-cikis', {
            method: 'POST',
            keepalive: true,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${aktifToken}`
            }
          }).catch(() => {});
        }
      });
    }

    // Şifremi Unuttum: Kayıtlı E-Posta + Cep Telefonu Doğrulaması ile Şifre Sıfırlama
    const btnHocaSifreSifirla = document.getElementById('btn-hoca-sifre-sifirla');
    if (btnHocaSifreSifirla) {
      btnHocaSifreSifirla.addEventListener('click', async () => {
        const hataKutu = document.getElementById('hoca-giris-hata');
        const bilgiKutu = document.getElementById('hoca-giris-bilgi');
        hataKutu.hidden = true;
        bilgiKutu.style.display = 'none';

        const kurtarmaVeri = {
          eposta: (document.getElementById('hoca-kurtarma-eposta') && document.getElementById('hoca-kurtarma-eposta').value) || '',
          telefon: (document.getElementById('hoca-kurtarma-telefon') && document.getElementById('hoca-kurtarma-telefon').value) || '',
          yeniSifre: (document.getElementById('hoca-kurtarma-yeni-sifre') && document.getElementById('hoca-kurtarma-yeni-sifre').value) || '',
          yeniSifreTekrar: (document.getElementById('hoca-kurtarma-yeni-sifre-tekrar') && document.getElementById('hoca-kurtarma-yeni-sifre-tekrar').value) || ''
        };

        const havuz = Array.isArray(durum.hocaListesi) && durum.hocaListesi.length > 0
          ? durum.hocaListesi
          : [durum.hocaHesap];

        const sonuc = C.sifirlaHocaSifreEpostaTelefon(kurtarmaVeri, havuz);
        if (!sonuc.basarili) {
          hataKutu.textContent = sonuc.hata;
          hataKutu.hidden = false;
          return;
        }

        if (location.protocol === 'http:' || location.protocol === 'https:') {
          try {
            const yanit = await fetch('/api/hoca-sifre-kurtar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(kurtarmaVeri)
            });
            if (!yanit.ok && yanit.status !== 404 && yanit.status !== 405) {
              const hVeri = await yanit.json().catch(() => ({}));
              hataKutu.textContent = hVeri.hata || 'Sunucu şifre sıfırlama doğrulaması başarısız.';
              hataKutu.hidden = false;
              return;
            }
          } catch (_) {}
        }

        if (String(durum.hocaHesap.kullaniciAdi).toLowerCase() === String(sonuc.kullaniciAdi).toLowerCase()) {
          durum.hocaHesap.sifre = kurtarmaVeri.yeniSifre;
        }
        document.getElementById('hoca-giris-kullanici').value = sonuc.kullaniciAdi;
        document.getElementById('hoca-giris-sifre').value = kurtarmaVeri.yeniSifre;
        verileriKaydet();
        guncelleHocaYonetimPaneliUI();

        bilgiKutu.textContent = `✅ E-Posta (${sonuc.eposta}) ve telefon doğrulandı! ${sonuc.adSoyad} (${sonuc.kullaniciAdi}) şifresi sıfırlandı; şimdi 'Giriş Yap' düğmesine basabilirsiniz.`;
        bilgiKutu.style.display = 'block';
      });
    }

    // Yeni Hoca Davet Kodlu Başvuru Gönderme ('beklemede' olarak eklenir, yönetici onayına düşer)
    const btnHocaBasvuruGonder = document.getElementById('btn-hoca-basvuru-gonder');
    if (btnHocaBasvuruGonder) {
      btnHocaBasvuruGonder.addEventListener('click', async () => {
        const hataKutu = document.getElementById('hoca-giris-hata');
        const bilgiKutu = document.getElementById('hoca-giris-bilgi');
        hataKutu.hidden = true;
        bilgiKutu.style.display = 'none';

        const adayBilgi = {
          davetKodu: (document.getElementById('hoca-kayit-davet-kodu') && document.getElementById('hoca-kayit-davet-kodu').value) || '',
          kullaniciAdi: document.getElementById('hoca-kayit-kullanici').value,
          adSoyad: document.getElementById('hoca-kayit-ad').value,
          eposta: document.getElementById('hoca-kayit-eposta').value,
          telefon: document.getElementById('hoca-kayit-telefon').value,
          sifre: document.getElementById('hoca-kayit-sifre').value,
          sifreTekrar: document.getElementById('hoca-kayit-sifre-tekrar').value
        };

        const dogrulama = C.dogrulaHocaHesapKayit(adayBilgi, {
          davetKoduKontrol: true,
          beklenenDavetKodu: durum.davetKodu || 'AKADEMI-2026',
          mevcutHocalar: durum.hocaListesi
        });

        if (!dogrulama.gecerli) {
          hataKutu.textContent = dogrulama.hata;
          hataKutu.hidden = false;
          return;
        }

        if (location.protocol === 'http:' || location.protocol === 'https:') {
          try {
            const yanit = await fetch('/api/hoca-basvuru', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(adayBilgi)
            });
            if (!yanit.ok && yanit.status !== 404 && yanit.status !== 405) {
              const hVeri = await yanit.json().catch(() => ({}));
              hataKutu.textContent = hVeri.hata || 'Öğretmen başvurusu sunucu tarafından reddedildi.';
              hataKutu.hidden = false;
              return;
            }
          } catch (_) {}
        }

        const yeniHoca = {
          kullaniciAdi: dogrulama.kullaniciAdi,
          adSoyad: dogrulama.adSoyad,
          eposta: dogrulama.eposta,
          telefon: dogrulama.telefon,
          sifre: adayBilgi.sifre,
          rol: 'hoca',
          durum: 'beklemede',
          kayitTarihi: new Date().toISOString().slice(0, 10)
        };

        durum.hocaListesi.push(yeniHoca);
        verileriKaydet();
        guncelleHocaYonetimPaneliUI();

        bilgiKutu.textContent = `📨 Öğretmen başvurunuz (${yeniHoca.kullaniciAdi} - ${yeniHoca.adSoyad}) alındı ve '⏳ Onay Bekliyor' durumuyla yönetici onayına gönderildi. Yönetici onayladıktan sonra giriş yapabilirsiniz.`;
        bilgiKutu.style.display = 'block';
      });
    }

    const btnHocaKayitKaydet = document.getElementById('btn-hoca-kayit-kaydet');
    if (btnHocaKayitKaydet) {
      btnHocaKayitKaydet.addEventListener('click', async () => {
        const hataKutu = document.getElementById('hoca-giris-hata');
        const bilgiKutu = document.getElementById('hoca-giris-bilgi');
        hataKutu.hidden = true;
        bilgiKutu.style.display = 'none';

        if (!durum.hocaOturumAcik) {
          hataKutu.textContent = 'Kendi hesap bilgilerinizi veya şifrenizi güncellemek için önce mevcut hesabınızla giriş yapmalısınız.';
          hataKutu.hidden = false;
          return;
        }

        const eskiKullaniciAdi = durum.hocaHesap.kullaniciAdi;
        const guncelBilgi = {
          kullaniciAdi: document.getElementById('hoca-kayit-kullanici').value,
          adSoyad: document.getElementById('hoca-kayit-ad').value,
          eposta: document.getElementById('hoca-kayit-eposta').value,
          telefon: document.getElementById('hoca-kayit-telefon').value,
          sifre: document.getElementById('hoca-kayit-sifre').value,
          sifreTekrar: document.getElementById('hoca-kayit-sifre-tekrar').value
        };

        const dogrulama = C.dogrulaHocaHesapKayit(guncelBilgi, {
          davetKoduKontrol: false,
          mevcutHocalar: durum.hocaListesi,
          haricKullaniciAdi: eskiKullaniciAdi
        });

        if (!dogrulama.gecerli) {
          hataKutu.textContent = dogrulama.hata;
          hataKutu.hidden = false;
          return;
        }

        if (location.protocol === 'http:' || location.protocol === 'https:') {
          try {
            const hocaToken = sessionStorage.getItem('hoca_token') || '';
            if (hocaToken) {
              await fetch('/api/hoca-yonetim', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${hocaToken}`
                },
                body: JSON.stringify(Object.assign({ islem: 'sifre_guncelle' }, guncelBilgi))
              });
            }
          } catch (_) {}
        }

        const mevcutRol = durum.hocaHesap.rol || 'yonetici';
        durum.hocaHesap = {
          kullaniciAdi: dogrulama.kullaniciAdi,
          adSoyad: dogrulama.adSoyad,
          eposta: dogrulama.eposta,
          telefon: dogrulama.telefon,
          sifre: guncelBilgi.sifre,
          rol: mevcutRol,
          durum: 'aktif'
        };

        const listeIdx = durum.hocaListesi.findIndex(
          (h) => String(h.kullaniciAdi).toLowerCase() === String(eskiKullaniciAdi).toLowerCase()
        );
        if (listeIdx !== -1) {
          durum.hocaListesi[listeIdx] = Object.assign({}, durum.hocaListesi[listeIdx], durum.hocaHesap);
        } else {
          durum.hocaListesi.unshift(Object.assign({}, durum.hocaHesap));
        }

        document.getElementById('hoca-giris-kullanici').value = dogrulama.kullaniciAdi;
        document.getElementById('hoca-giris-sifre').value = durum.hocaHesap.sifre;
        document.getElementById('etiket-aktif-hoca-kullanici').textContent = dogrulama.kullaniciAdi;
        document.getElementById('antet-hoca').value = dogrulama.adSoyad;
        verileriKaydet();
        guncelleHocaYonetimPaneliUI();
        guncelleA4Onizleme();

        bilgiKutu.textContent = `✅ Öğretmen hesap bilgileriniz (${dogrulama.kullaniciAdi}) ve yeni güçlü şifreniz kaydedildi.`;
        bilgiKutu.style.display = 'block';
      });
    }

    // Yönetici: Kurum Davet Kodunu Yenileme
    const btnDavetKoduYenile = document.getElementById('btn-davet-kodu-yenile');
    if (btnDavetKoduYenile) {
      btnDavetKoduYenile.addEventListener('click', async () => {
        const hataKutu = document.getElementById('hoca-giris-hata');
        const bilgiKutu = document.getElementById('hoca-giris-bilgi');
        hataKutu.hidden = true;
        bilgiKutu.style.display = 'none';

        if (!aktifHocaYoneticiMi()) {
          hataKutu.textContent = 'Kurum davet kodunu yalnızca sistem yöneticisi yenileyebilir.';
          hataKutu.hidden = false;
          return;
        }

        let yeniKod = C.uretYeniDavetKodu('AKADEMI');
        if (location.protocol === 'http:' || location.protocol === 'https:') {
          try {
            const hocaToken = sessionStorage.getItem('hoca_token') || '';
            if (hocaToken) {
              const yanit = await fetch('/api/hoca-yonetim', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${hocaToken}`
                },
                body: JSON.stringify({ islem: 'davet_kodu_yenile' })
              });
              if (yanit.ok) {
                const v = await yanit.json();
                if (v && v.davetKodu) yeniKod = v.davetKodu;
              }
            }
          } catch (_) {}
        }

        durum.davetKodu = yeniKod;
        verileriKaydet();
        guncelleHocaYonetimPaneliUI();
        bilgiKutu.textContent = `🔄 Yeni kurum davet kodu üretildi: ${yeniKod} (Eski kod geçersiz kılındı).`;
        bilgiKutu.style.display = 'block';
      });
    }

    // Yönetici: Hoca Onaylama / Askıya Alma / Silme Tablo Olayları
    const tabloHocaOnay = document.getElementById('tablo-hoca-onay-listesi');
    if (tabloHocaOnay) {
      tabloHocaOnay.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-hoca-islem]');
        if (!btn) return;
        const islem = btn.getAttribute('data-hoca-islem');
        const hedefKullanici = btn.getAttribute('data-hoca-kullanici') || '';
        const hataKutu = document.getElementById('hoca-giris-hata');
        const bilgiKutu = document.getElementById('hoca-giris-bilgi');
        hataKutu.hidden = true;
        bilgiKutu.style.display = 'none';

        if (!aktifHocaYoneticiMi()) {
          hataKutu.textContent = 'Öğretmen onaylama ve yetkilendirme işlemleri yalnızca sistem yöneticisi tarafından yapılabilir.';
          hataKutu.hidden = false;
          return;
        }

        const idx = durum.hocaListesi.findIndex(
          (h) => String(h.kullaniciAdi).toLowerCase() === String(hedefKullanici).toLowerCase()
        );
        if (idx === -1) return;
        const hedef = durum.hocaListesi[idx];

        if (hedef.rol === 'yonetici') {
          hataKutu.textContent = 'Ana sistem yöneticisi hesabı silinemez veya askıya alınamaz.';
          hataKutu.hidden = false;
          return;
        }

        if (location.protocol === 'http:' || location.protocol === 'https:') {
          try {
            const hocaToken = sessionStorage.getItem('hoca_token') || '';
            if (hocaToken) {
              await fetch('/api/hoca-yonetim', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${hocaToken}`
                },
                body: JSON.stringify({ islem, kullaniciAdi: hedef.kullaniciAdi })
              });
            }
          } catch (_) {}
        }

        if (islem === 'onayla') {
          hedef.durum = 'aktif';
          bilgiKutu.textContent = `✅ ${hedef.adSoyad} (${hedef.kullaniciAdi}) hesabı onaylandı ve aktifleştirildi. Artık giriş yapabilir.`;
        } else if (islem === 'askiya_al') {
          hedef.durum = 'askida';
          bilgiKutu.textContent = `⏸️ ${hedef.adSoyad} (${hedef.kullaniciAdi}) hesabı askıya alındı; giriş yetkisi kapatıldı.`;
        } else if (islem === 'sil') {
          durum.hocaListesi.splice(idx, 1);
          bilgiKutu.textContent = `🗑️ ${hedef.adSoyad} (${hedef.kullaniciAdi}) öğretmen kaydı sistemden silindi.`;
        }

        verileriKaydet();
        guncelleHocaYonetimPaneliUI();
        bilgiKutu.style.display = 'block';
      });
    }

    document.getElementById('btn-kombinasyon-uygula').addEventListener('click', guncelleA4Onizleme);

    const aktifSinavBasildiKilitliMi = () => Boolean(
      durum.aktifKayitliSinavId &&
      (durum.kayitliSinavlar || []).some((k) => k && k.id === durum.aktifKayitliSinavId && k.basildiKilidi)
    );

    // 10 D/Y (25 Puan) + 15 Test (75 Puan) = 100 Puan (25 Soru) Hızlı Şablonu
    document.getElementById('btn-hazir-sablon-25').addEventListener('click', () => {
      if (aktifSinavBasildiKilitliMi()) return;
      document.getElementById('ayar-dy-sayisi').value = '10';
      document.getElementById('ayar-dy-toplam-puan').value = '25';
      document.getElementById('ayar-test-sayisi').value = '15';
      document.getElementById('ayar-test-toplam-puan').value = '75';
      document.getElementById('ayar-klasik-sayisi').value = '0';
      document.getElementById('ayar-klasik-toplam-puan').value = '0';
      guncelleA4Onizleme();
    });

    // -----------------------------------------------------------------------
    // HAFTALIK KONU KAPSAMI (1..14. HAFTA), KOTA VE KAĞIT ÜZERİNDE
    // YERİNDE SORU DEĞİŞTİRME / SABİTLEME / SIRALAMA / HIZLI DÜZENLEME
    // -----------------------------------------------------------------------
    const guncelleSoruDegisimDurumEtiketi = (ekMesaj = '') => {
      const el = document.getElementById('etiket-soru-degisim-durum');
      if (!el) return;
      const redSay = durum.reddedilenSoruIdleri.length;
      const sabitSay = durum.sabitlenenSoruIdleri.length;
      const temel = `ℹ️ Kağıttan Kaldırılan/Değiştirilen: ${redSay} soru · 📌 Sabitlenen: ${sabitSay} soru`;
      el.textContent = ekMesaj ? `${ekMesaj} | ${temel}` : temel;
    };

    const btnHaftaVize = document.getElementById('btn-hafta-vize');
    if (btnHaftaVize) {
      btnHaftaVize.addEventListener('click', () => {
        if (aktifSinavBasildiKilitliMi()) {
          guncelleSoruDegisimDurumEtiketi('🔒 Basıldı kilidi aktif: Kilitli sınavın kapsamı değiştirilemez.');
          return;
        }
        durum.seciliHaftalar = [1, 2, 3, 4, 5, 6, 7];
        guncelleA4Onizleme();
      });
    }

    const btnHaftaFinal = document.getElementById('btn-hafta-final');
    if (btnHaftaFinal) {
      btnHaftaFinal.addEventListener('click', () => {
        if (aktifSinavBasildiKilitliMi()) {
          guncelleSoruDegisimDurumEtiketi('🔒 Basıldı kilidi aktif: Kilitli sınavın kapsamı değiştirilemez.');
          return;
        }
        durum.seciliHaftalar = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
        guncelleA4Onizleme();
      });
    }

    const btnHaftaSon7 = document.getElementById('btn-hafta-son7');
    if (btnHaftaSon7) {
      btnHaftaSon7.addEventListener('click', () => {
        if (aktifSinavBasildiKilitliMi()) {
          guncelleSoruDegisimDurumEtiketi('🔒 Basıldı kilidi aktif: Kilitli sınavın kapsamı değiştirilemez.');
          return;
        }
        durum.seciliHaftalar = [8, 9, 10, 11, 12, 13, 14];
        guncelleA4Onizleme();
      });
    }

    const btnHaftaTersle = document.getElementById('btn-hafta-tersle');
    if (btnHaftaTersle) {
      btnHaftaTersle.addEventListener('click', () => {
        if (aktifSinavBasildiKilitliMi()) {
          guncelleSoruDegisimDurumEtiketi('🔒 Basıldı kilidi aktif: Kilitli sınavın kapsamı değiştirilemez.');
          return;
        }
        const tum = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
        const ters = tum.filter((h) => !durum.seciliHaftalar.includes(h));
        durum.seciliHaftalar = ters.length > 0 ? ters : tum;
        guncelleA4Onizleme();
      });
    }

    const ayarHaftaDagilimModu = document.getElementById('ayar-hafta-dagilim-modu');
    if (ayarHaftaDagilimModu) {
      ayarHaftaDagilimModu.addEventListener('change', guncelleA4Onizleme);
    }

    const ayarHaricTutSorulanlar = document.getElementById('ayar-haric-tut-sorulanlar');
    if (ayarHaricTutSorulanlar) {
      ayarHaricTutSorulanlar.addEventListener('change', guncelleA4Onizleme);
    }

    const kontrolEtAktifDersOcKayitliMi = () => {
      const aktifDers = durum.dersler.find((d) => d.id === durum.aktifDersId) || durum.dersler[0] || null;
      const kayitliOcler = aktifDers && Array.isArray(aktifDers.ogrenimCiktilari)
        ? C.ayiklaDersOcMaddeleri(aktifDers.ogrenimCiktilari)
        : [];
      return kayitliOcler.length > 0;
    };

    const ayarKagitOcGorunum = document.getElementById('ayar-kagit-oc-gorunum');
    if (ayarKagitOcGorunum) {
      ayarKagitOcGorunum.addEventListener('change', () => {
        const secim = ayarKagitOcGorunum.value || 'kapali';
        if (secim !== 'kapali' && !kontrolEtAktifDersOcKayitliMi()) {
          acDersOcKayitModali(true);
        }
        guncelleA4Onizleme();
      });
    }

    const btnAktifDersOcTanimla = document.getElementById('btn-aktif-ders-oc-tanimla');
    if (btnAktifDersOcTanimla) {
      btnAktifDersOcTanimla.addEventListener('click', () => {
        acDersOcKayitModali(false);
      });
    }

    const ayarHerOcEnAzBir = document.getElementById('ayar-her-oc-en-az-bir');
    if (ayarHerOcEnAzBir) {
      ayarHerOcEnAzBir.addEventListener('change', () => {
        if (ayarHerOcEnAzBir.checked && !kontrolEtAktifDersOcKayitliMi()) {
          acDersOcKayitModali(true);
        }
        guncelleA4Onizleme();
      });
    }

    const kutuHaftaIzgara = document.getElementById('kutu-hafta-secim-izgara');
    if (kutuHaftaIzgara) {
      kutuHaftaIzgara.addEventListener('change', (e) => {
        if (aktifSinavBasildiKilitliMi()) {
          guncelleA4Onizleme();
          return;
        }
        const chk = e.target.closest('[data-hafta-sec]');
        if (chk) {
          const hNo = parseInt(chk.getAttribute('data-hafta-sec'), 10);
          if (chk.checked) {
            if (!durum.seciliHaftalar.includes(hNo)) {
              durum.seciliHaftalar.push(hNo);
              durum.seciliHaftalar.sort((a, b) => a - b);
            }
          } else if (durum.seciliHaftalar.length > 1) {
            durum.seciliHaftalar = durum.seciliHaftalar.filter((h) => h !== hNo);
          } else {
            chk.checked = true;
          }
          guncelleA4Onizleme();
          return;
        }
        const kotaInp = e.target.closest('[data-hafta-kota]');
        if (kotaInp) {
          const hNo = parseInt(kotaInp.getAttribute('data-hafta-kota'), 10);
          durum.haftaKotalari[hNo] = Math.max(0, parseInt(kotaInp.value, 10) || 0);
          guncelleA4Onizleme();
        }
      });
    }

    const btnSinavSorulduIsaretle = document.getElementById('btn-sinav-soruldu-isaretle');
    if (btnSinavSorulduIsaretle) {
      btnSinavSorulduIsaretle.addEventListener('click', () => {
        const yapi = okuAktifSinavYapisi();
        const aktifIdSet = new Set((yapi.tumSeciliSorular || []).map((s) => s.id));
        let sayac = 0;
        durum.sorular.forEach((s) => {
          if (aktifIdSet.has(s.id)) {
            s.sorulduMu = true;
            sayac++;
          }
        });
        verileriKaydet();
        guncelleSoruBankasiTablosu();
        guncelleA4Onizleme();
        guncelleSoruDegisimDurumEtiketi(`✅ Aktif kağıttaki ${sayac} soru "Soruldu" olarak işaretlendi`);
      });
    }

    const btnKagitDegisimSifirla = document.getElementById('btn-kagit-degisim-sifirla');
    if (btnKagitDegisimSifirla) {
      btnKagitDegisimSifirla.addEventListener('click', () => {
        if (aktifSinavBasildiKilitliMi()) {
          guncelleSoruDegisimDurumEtiketi('🔒 Basıldı kilidi aktif: Kilitli sınavın soruları değiştirilemez.');
          return;
        }
        durum.reddedilenSoruIdleri = [];
        durum.sabitlenenSoruIdleri = [];
        durum.ozelSeciliSoruIdleri = { dy: [], test: [], klasik: [] };
        durum.sonSecimYapilandirmaImzasi = '';
        guncelleA4Onizleme();
        guncelleSoruDegisimDurumEtiketi('🔄 Kağıt soru değişimleri ve sabitlemeler sıfırlandı');
      });
    }

    // Canlı A4 Önizleme Üzerindeki Soru Aksiyonları (🔄 Değiştir, 📌 Sabitle, ▲/▼ Sırala, ✏️ Hızlı Düzenle)
    const sahneOnizleme = document.getElementById('a4-onizleme-sahne');
    if (sahneOnizleme) {
      sahneOnizleme.addEventListener('click', (e) => {
        if (aktifSinavBasildiKilitliMi()) {
          guncelleSoruDegisimDurumEtiketi('🔒 Basıldı kilidi aktif: Kilitli sınavın soruları ve anahtarı dondurulmuştur.');
          return;
        }
        // 1. 🔄 Soruyu Kağıttan Kaldır ve Havuzdan Yeni Soru Ata
        const btnDegistir = e.target.closest('[data-kagit-soru-degistir]');
        if (btnDegistir) {
          const kaldirilacakId = btnDegistir.getAttribute('data-kagit-soru-degistir');
          const tur = btnDegistir.getAttribute('data-kagit-soru-tur') || 'test';
          const aktifListe = (durum.ozelSeciliSoruIdleri && durum.ozelSeciliSoruIdleri[tur]) || [];
          const aktifDersSorulari = durum.sorular.filter((s) => s.dersId === durum.aktifDersId || s.dersId === 'genel');
          const aktifNesneler = aktifListe
            .map((id) => aktifDersSorulari.find((s) => s.id === id))
            .filter(Boolean);

          const degisim = C.degistirTekSoruHavuzdan(
            aktifDersSorulari,
            aktifNesneler,
            kaldirilacakId,
            {
              seciliHaftalar: durum.seciliHaftalar,
              reddedilenSoruIdleri: durum.reddedilenSoruIdleri,
              haricTutSorulanlar: Boolean(document.getElementById('ayar-haric-tut-sorulanlar') && document.getElementById('ayar-haric-tut-sorulanlar').checked)
            }
          );

          if (degisim.basarili && degisim.yeniSoru) {
            durum.reddedilenSoruIdleri = degisim.reddedilenSoruIdleri;
            durum.ozelSeciliSoruIdleri[tur] = degisim.yeniListe.map((s) => s.id);
            guncelleA4Onizleme();
            guncelleSoruDegisimDurumEtiketi(`✅ Soru kaldırıldı → Yerine H${C.normalizeHaftaNo(degisim.yeniSoru.hafta, 1)} (${degisim.yeniSoru.zorluk || 'Orta'}) yeni soru atandı`);
          } else {
            guncelleSoruDegisimDurumEtiketi(`⚠️ ${degisim.mesaj || 'Yedek soru bulunamadı'}`);
          }
          return;
        }

        // 2. 📌 Soruyu Kağıtta Sabitle / Kilidi Aç
        const btnSabitle = e.target.closest('[data-kagit-soru-sabitle]');
        if (btnSabitle) {
          const soruId = btnSabitle.getAttribute('data-kagit-soru-sabitle');
          if (durum.sabitlenenSoruIdleri.includes(soruId)) {
            durum.sabitlenenSoruIdleri = durum.sabitlenenSoruIdleri.filter((id) => id !== soruId);
            guncelleSoruDegisimDurumEtiketi('🔓 Soru sabitlemesi kaldırıldı');
          } else {
            durum.sabitlenenSoruIdleri.push(soruId);
            guncelleSoruDegisimDurumEtiketi('📌 Soru sınav kağıdında sabitlendi');
          }
          guncelleA4Onizleme();
          return;
        }

        // 3. ▲ / ▼ Soruyu Kağıt Üzerinde Yukarı / Aşağı Taşı
        const btnYon = e.target.closest('[data-kagit-soru-yon]');
        if (btnYon) {
          const soruId = btnYon.getAttribute('data-kagit-soru-id');
          const tur = btnYon.getAttribute('data-kagit-soru-tur') || 'test';
          const yon = parseInt(btnYon.getAttribute('data-kagit-soru-yon'), 10) || 0;
          const dizi = (durum.ozelSeciliSoruIdleri && durum.ozelSeciliSoruIdleri[tur] || []).slice();
          const idx = dizi.indexOf(soruId);
          const hedefIdx = idx + yon;
          if (idx >= 0 && hedefIdx >= 0 && hedefIdx < dizi.length) {
            const gecici = dizi[idx];
            dizi[idx] = dizi[hedefIdx];
            dizi[hedefIdx] = gecici;
            durum.ozelSeciliSoruIdleri[tur] = dizi;
            guncelleA4Onizleme();
            guncelleSoruDegisimDurumEtiketi(`↕️ Soru sırası güncellendi (${idx + 1}. ↔ ${hedefIdx + 1}.)`);
          }
          return;
        }

        // 4. ✏️ Soruyu Kağıt Üzerinde Hızlı Düzenle Modalı
        const btnDuzenle = e.target.closest('[data-kagit-soru-duzenle]');
        if (btnDuzenle) {
          const soruId = btnDuzenle.getAttribute('data-kagit-soru-duzenle');
          const soru = durum.sorular.find((s) => s.id === soruId);
          if (!soru) return;
          durum.duzenlenenSoruId = soru.id;
          document.getElementById('hizli-duzenle-hafta').value = String(C.normalizeHaftaNo(soru.hafta, 1));
          document.getElementById('hizli-duzenle-zorluk').value = soru.zorluk || 'Orta';
          document.getElementById('hizli-duzenle-kazanim').value = soru.kazanim || '';
          document.getElementById('hizli-duzenle-metin').value = soru.metin || '';

          const kutuTest = document.getElementById('hizli-duzenle-test-alan');
          const kutuDy = document.getElementById('hizli-duzenle-dy-alan');
          const kutuKlasik = document.getElementById('hizli-duzenle-klasik-alan');
          if (soru.tur === 'test') {
            kutuTest.style.display = 'block';
            kutuDy.style.display = 'none';
            kutuKlasik.style.display = 'none';
            const siklar = soru.siklar || [];
            document.getElementById('hizli-sik-a').value = siklar[0] || '';
            document.getElementById('hizli-sik-b').value = siklar[1] || '';
            document.getElementById('hizli-sik-c').value = siklar[2] || '';
            document.getElementById('hizli-sik-d').value = siklar[3] || '';
            document.getElementById('hizli-sik-e').value = siklar[4] || '';
            document.getElementById('hizli-duzenle-dogru-harf').value = soru.dogruHarf || 'A';
          } else if (soru.tur === 'dy') {
            kutuTest.style.display = 'none';
            kutuDy.style.display = 'block';
            kutuKlasik.style.display = 'none';
            document.getElementById('hizli-duzenle-dogru-dy').value = soru.dogruDY || 'D';
          } else {
            kutuTest.style.display = 'none';
            kutuDy.style.display = 'none';
            kutuKlasik.style.display = 'block';
            document.getElementById('hizli-duzenle-rubrik').value = soru.rubrik || '';
          }
          document.getElementById('modal-hizli-soru-duzenle').style.display = 'flex';
        }
      });
    }

    const btnModalSoruDuzenleKapat = document.getElementById('btn-modal-soru-duzenle-kapat');
    if (btnModalSoruDuzenleKapat) {
      btnModalSoruDuzenleKapat.addEventListener('click', () => {
        document.getElementById('modal-hizli-soru-duzenle').style.display = 'none';
      });
    }

    const btnHizliSoruKaydet = document.getElementById('btn-hizli-soru-kaydet');
    if (btnHizliSoruKaydet) {
      btnHizliSoruKaydet.addEventListener('click', () => {
        const soru = durum.sorular.find((s) => s.id === durum.duzenlenenSoruId);
        if (!soru) return;
        soru.hafta = C.normalizeHaftaNo(document.getElementById('hizli-duzenle-hafta').value, 1);
        soru.zorluk = document.getElementById('hizli-duzenle-zorluk').value || 'Orta';
        const duzenlenenKazanimHam = (document.getElementById('hizli-duzenle-kazanim').value || '').trim();
        const ocBilgiDuzenle = C.ayiklaOcBilesenleri(duzenlenenKazanimHam, '', soru.ocKodu || 'ÖÇ-1');
        soru.ocKodu = ocBilgiDuzenle.ocKodu;
        soru.kazanim = ocBilgiDuzenle.kazanimTam;
        soru.metin = (document.getElementById('hizli-duzenle-metin').value || '').trim() || soru.metin;
        if (soru.tur === 'test') {
          soru.siklar = [
            document.getElementById('hizli-sik-a').value.trim() || 'A seçeneği',
            document.getElementById('hizli-sik-b').value.trim() || 'B seçeneği',
            document.getElementById('hizli-sik-c').value.trim() || 'C seçeneği',
            document.getElementById('hizli-sik-d').value.trim() || 'D seçeneği',
            document.getElementById('hizli-sik-e').value.trim() || 'E seçeneği'
          ];
          soru.dogruHarf = document.getElementById('hizli-duzenle-dogru-harf').value || 'A';
        } else if (soru.tur === 'dy') {
          soru.dogruDY = document.getElementById('hizli-duzenle-dogru-dy').value || 'D';
        } else {
          soru.rubrik = (document.getElementById('hizli-duzenle-rubrik').value || '').trim() || soru.rubrik;
        }
        document.getElementById('modal-hizli-soru-duzenle').style.display = 'none';
        verileriKaydet();
        guncelleSoruBankasiTablosu();
        guncelleA4Onizleme();
        guncelleSoruDegisimDurumEtiketi('✏️ Soru metni/şıklar kağıt üzerinde güncellendi');
      });
    }

    // -----------------------------------------------------------------------
    // SINIF SINAV KAĞIDI & ÖĞRENCİYE ÖZEL SORU KAĞIDI:
    // YAZDIR + PDF (.pdf) + WORD (.doc) ÇIKTI MOTORU
    // -----------------------------------------------------------------------
    /* Word (.doc) CSS columns / flex / grid desteklemez: çift sütunlu soru gövdesini ve flex/grid satırlarını
       tablo tabanlı düzene çevirir; böylece sorular ve şıklar Word'de üst üste binmez / sayfa altından taşmaz. */
    const wordUyumluDuzenDonustur = (kok) => {
      const hucreOlustur = (cocuklar, colspan) => {
        const td = document.createElement('td');
        td.setAttribute('valign', 'top');
        td.style.border = 'none';
        td.style.padding = '0 3pt';
        if (colspan > 1) td.setAttribute('colspan', String(colspan));
        cocuklar.forEach((c) => td.appendChild(c));
        return td;
      };
      const tabloOlustur = (genislikYuzde) => {
        const tablo = document.createElement('table');
        tablo.setAttribute('width', '100%');
        tablo.setAttribute('cellspacing', '0');
        tablo.setAttribute('cellpadding', '0');
        tablo.style.cssText = 'border-collapse:collapse; width:100%; border:none;';
        if (genislikYuzde) tablo.dataset.sutunGenislik = genislikYuzde;
        return tablo;
      };
      // 1) Çift sütunlu soru gövdesi: blokları uzunluğa göre dengeli iki sütuna böl
      kok.querySelectorAll('.sorular-govde').forEach((govde) => {
        const bloklar = Array.from(govde.children);
        if (bloklar.length === 0) return;
        const agirlik = bloklar.map((b) => Math.max(40, (b.textContent || '').length));
        const toplam = agirlik.reduce((a, b) => a + b, 0);
        let kum = 0;
        let bolum = bloklar.length;
        for (let i = 0; i < bloklar.length; i++) {
          kum += agirlik[i];
          if (kum >= toplam / 2) { bolum = i + 1; break; }
        }
        if (bolum >= bloklar.length && bloklar.length > 1) bolum = bloklar.length - 1;
        const sol = bloklar.slice(0, bolum);
        const sag = bloklar.slice(bolum);
        const tablo = tabloOlustur();
        const tr = document.createElement('tr');
        const tdSol = hucreOlustur(sol, 1);
        tdSol.setAttribute('width', '49%');
        tdSol.style.borderRight = '0.75pt solid #999';
        const tdSag = hucreOlustur(sag, 1);
        tdSag.setAttribute('width', '51%');
        tdSag.style.paddingLeft = '6pt';
        tr.appendChild(tdSol);
        tr.appendChild(tdSag);
        tablo.appendChild(tr);
        govde.replaceWith(tablo);
      });
      // 2) Flex / grid satırlarını tek satırlık tabloya çevir
      const satirSecicileri = ['.kagit-antet', '.kagit-antet-sag', '.dy-soru-satir', '.ogrenci-kimlik-serit',
        '.optik-ic-izgara', '.optik-cok-sutun', '.balon-satir', '.kalite-alt-onay-serit'];
      satirSecicileri.forEach((sec) => {
        kok.querySelectorAll(sec).forEach((el) => {
          const cocuklar = Array.from(el.children);
          if (cocuklar.length < 2) return;
          const tablo = tabloOlustur();
          const tr = document.createElement('tr');
          cocuklar.forEach((c) => {
            const td = hucreOlustur([c], 1);
            if (sec === '.dy-soru-satir' && c === cocuklar[0]) td.setAttribute('width', '1%');
            tr.appendChild(td);
          });
          tablo.appendChild(tr);
          el.innerHTML = '';
          el.appendChild(tablo);
        });
      });
      // 3) CSS değişkenleri / flex kalıntılarını satır içi stillerden temizle
      kok.querySelectorAll('[style]').forEach((el) => {
        const stil = el.getAttribute('style') || '';
        const temiz = stil
          .replace(/display\s*:\s*(flex|grid)\s*;?/gi, '')
          .replace(/justify-content\s*:[^;]+;?/gi, '')
          .replace(/(^|;)\s*gap\s*:[^;]+;?/gi, '$1')
          .replace(/[a-z-]+\s*:\s*var\([^)]*\)\s*;?/gi, '');
        el.setAttribute('style', temiz);
      });
    };

    /* Word SVG göstermez: basılı optik formu (SVG) PNG görüntüye çevirir */
    const svgPngyeCevir = (svgEl) => new Promise((coz) => {
      try {
        const kopya = svgEl.cloneNode(true);
        const vb = (kopya.getAttribute('viewBox') || '0 0 800 300').split(/\s+/).map(Number);
        const olcek = 2;
        kopya.setAttribute('width', String(vb[2] * olcek));
        kopya.setAttribute('height', String(vb[3] * olcek));
        kopya.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const img = new Image();
        const zaman = setTimeout(() => coz(null), 4000);
        img.onload = () => {
          clearTimeout(zaman);
          const cv = document.createElement('canvas');
          cv.width = vb[2] * olcek;
          cv.height = vb[3] * olcek;
          const cx = cv.getContext('2d');
          cx.fillStyle = '#fff';
          cx.fillRect(0, 0, cv.width, cv.height);
          cx.drawImage(img, 0, 0, cv.width, cv.height);
          coz({ url: cv.toDataURL('image/png'), oran: vb[3] / vb[2] });
        };
        img.onerror = () => { clearTimeout(zaman); coz(null); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(kopya));
      } catch (_) { coz(null); }
    });

    const indirWordBelgesiOlarak = async (htmlIcerik, dosyaAdiTabani) => {
      // Her A4 sayfası arasına Word sayfa sonu (page-break-before:always) yerleştir
      const geciciDiv = document.createElement('div');
      geciciDiv.innerHTML = htmlIcerik;
      geciciDiv.querySelectorAll('.soru-ekran-araclari').forEach((el) => el.remove());
      for (const svgEl of Array.from(geciciDiv.querySelectorAll('svg'))) {
        const optikMi = svgEl.classList.contains('optik-form-svg');
        const attrGen = parseInt(svgEl.getAttribute('width') || '', 10);
        const hedefGen = optikMi ? 540 : (Number.isFinite(attrGen) && attrGen > 16 ? Math.min(240, attrGen) : 104);
        const png = await svgPngyeCevir(svgEl);
        if (png && png.url) {
          const im = document.createElement('img');
          im.setAttribute('src', png.url);
          im.setAttribute('width', String(hedefGen));
          im.setAttribute('height', String(Math.max(20, Math.round(hedefGen * (png.oran || 1)))));
          im.setAttribute('alt', optikMi ? 'Optik Form' : 'QR Kod');
          svgEl.replaceWith(im);
        } else {
          svgEl.remove();
        }
      }
      wordUyumluDuzenDonustur(geciciDiv);
      const sayfalar = Array.from(geciciDiv.querySelectorAll('.a4-sayfa'));
      const birlesikSayfaHTML = sayfalar.length > 0
        ? sayfalar
          .map((s, idx) => (idx > 0
            ? `<br clear="all" style="page-break-before:always; mso-break-type:section-break" />${s.outerHTML}`
            : s.outerHTML))
          .join('\n')
        : htmlIcerik;

      const wordStil = `
        @page Section1 { size: 595.3pt 841.9pt; margin: 10mm 11mm 10mm 11mm; }
        div.Section1 { page: Section1; font-family: Arial, sans-serif; font-size: 9.5pt; color: #000; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #000; padding: 3px 5px; font-size: 8.5pt; }
        .a4-sayfa-etiket { display: none; }
        .bolum-baslik-serit { background: #111; color: #fff; font-weight: bold; padding: 3px 6px; margin: 6px 0 4px 0; font-size: 8.5pt; }
        .soru-kutu { margin-bottom: 6px; padding-bottom: 3px; border-bottom: 0.5pt dotted #999; }
        .soru-no { font-weight: bold; } .soru-kok { font-weight: bold; margin: 0 0 2pt 0; } .sik-oge { display: block; margin: 0 0 1pt 0; } .siklar-yan-yana .sik-oge, .siklar-iki-sutun .sik-oge { display: inline; margin-right: 10pt; } .sik-harf { font-weight: bold; } .soru-puan-etiket { font-size: 7.5pt; font-weight: bold; }
        .optik-cerceve { border: 1.5pt solid #000; padding: 6px; margin-bottom: 8px; }
        .optik-balon { display: inline-block; border: 1pt solid #000; padding: 1px 4px; margin: 1px; font-size: 7.5pt; font-weight: bold; }
        .optik-balon.dolu { background: #000; color: #fff; }
      `;

      const tamWord =
        `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
        `<head><meta charset="utf-8"><title>${C.kacisHTML(dosyaAdiTabani)}</title><style>${wordStil}</style></head>` +
        `<body><div class="Section1">${birlesikSayfaHTML}</div></body></html>`;
      const blob = new Blob(['\ufeff', tamWord], { type: 'application/msword;charset=utf-8' });
      const url = C.olusturGuvenliBlobUrl(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dosyaAdiTabani || 'Sinav_Kagidi'}.doc`;
      a.click();
    };

    /* Gerçek sayfa görünümünü (SVG foreignObject ile) A4 canvas'a rasterlaştırıp çok sayfalı PDF üretir.
       Başarısız olursa metin tabanlı yedek PDF devreye girer. */
    const satirIciStilleriKopyala = (kaynak, kopya) => {
      const kaynakDugumler = [kaynak, ...kaynak.querySelectorAll('*')];
      const kopyaDugumler = [kopya, ...kopya.querySelectorAll('*')];
      const dondurulmazOzellikler = new Set([
        'height', 'block-size', 'min-height', 'max-height',
        'width', 'inline-size', 'grid-template-rows', 'grid-template-columns'
      ]);
      for (let i = 0; i < kaynakDugumler.length && i < kopyaDugumler.length; i++) {
        const el = kaynakDugumler[i];
        // SVG ve iç düğümlerinin kendi öznitelik/viewBox yapısını koru; satır içi HTML yüksekliği zorlama
        if (el.tagName && (el.tagName.toLowerCase() === 'svg' || (el.closest && el.closest('svg')))) {
          continue;
        }
        const cs = window.getComputedStyle(el);
        let css = '';
        for (let k = 0; k < cs.length; k++) {
          const prop = cs[k];
          if (i > 0 && dondurulmazOzellikler.has(prop)) continue;
          css += `${prop}:${cs.getPropertyValue(prop)};`;
        }
        kopyaDugumler[i].setAttribute('style', css);
      }
    };

    /* Veri URL'li görselleri (logo, soru şekilleri) SVG içinde güvenilir çözülmediği için ayrıca çözüp canvas'a elle çizer */
    const gorselCoz = (src) => new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    });

    const sayfaElementiniCanvasaCiz = async (sayfaEl) => {
      const G = 794;
      const Y = 1123;
      const olcek = 2;
      const kok = sayfaEl.getBoundingClientRect();
      const ox = G / Math.max(1, kok.width);
      const oy = Y / Math.max(1, kok.height);

      // 1. Orijinal sayfadaki görsellerin konumunu ve çözülmüş hallerini topla
      const gorseller = [];
      for (const orijinal of Array.from(sayfaEl.querySelectorAll('img'))) {
        const r = orijinal.getBoundingClientRect();
        const cozulmus = await gorselCoz(orijinal.getAttribute('src') || '');
        if (cozulmus && r.width > 0 && r.height > 0) {
          gorseller.push({ im: cozulmus, x: (r.left - kok.left) * ox, y: (r.top - kok.top) * oy, w: r.width * ox, h: r.height * oy });
        }
      }

      // 2. Kopyada görselleri gizle (yer kaplasınlar) ve metin/tablo düzenini SVG foreignObject ile al
      const kopya = sayfaEl.cloneNode(true);
      satirIciStilleriKopyala(sayfaEl, kopya);
      kopya.querySelectorAll('img').forEach((im) => { im.removeAttribute('src'); im.style.visibility = 'hidden'; });
      kopya.style.width = `${G}px`;
      kopya.style.height = `${Y}px`;
      kopya.style.margin = '0';
      kopya.style.boxShadow = 'none';
      kopya.style.overflow = 'hidden';
      kopya.style.background = '#ffffff';
      const xhtml = new XMLSerializer().serializeToString(kopya);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${G}" height="${Y}"><foreignObject x="0" y="0" width="${G}" height="${Y}">${xhtml}</foreignObject></svg>`;
      const sayfaGorseli = await gorselCoz(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      if (!sayfaGorseli) throw new Error('Sayfa görüntüsü oluşturulamadı.');

      // 3. Canvas'a önce sayfa düzenini, sonra görselleri (object-fit: contain oranıyla) çiz
      const c = document.createElement('canvas');
      c.width = G * olcek;
      c.height = Y * olcek;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(sayfaGorseli, 0, 0, c.width, c.height);
      for (const g of gorseller) {
        const oran = Math.min(g.w / g.im.naturalWidth, g.h / g.im.naturalHeight);
        const dw = g.im.naturalWidth * oran;
        const dh = g.im.naturalHeight * oran;
        ctx.drawImage(g.im, (g.x + (g.w - dw) / 2) * olcek, (g.y + (g.h - dh) / 2) * olcek, dw * olcek, dh * olcek);
      }
      return c;
    };

    const cizDomSayfalariniPdfOlarakIndir = async (htmlIcerik, dosyaAdiTabani) => {
      const kap = document.createElement('div');
      kap.style.cssText = 'position:fixed; left:-12000px; top:0; width:794px; background:#fff; z-index:-1;';
      kap.innerHTML = htmlIcerik;
      kap.querySelectorAll('.soru-ekran-araclari').forEach((el) => el.remove());
      document.body.appendChild(kap);
      try {
        dengeleVeSigdirA4Sayfalari(kap);
        kap.querySelectorAll('.a4-sayfa-etiket').forEach((el) => el.remove());
        const sayfalar = Array.from(kap.querySelectorAll('.a4-sayfa'));
        if (sayfalar.length === 0) throw new Error('Sayfa bulunamadı');
        const pdfSayfaListesi = [];
        for (const s of sayfalar) {
          const canvas = await sayfaElementiniCanvasaCiz(s);
          const b64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1] || '';
          const bin = atob(b64);
          const jpegBytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) jpegBytes[i] = bin.charCodeAt(i);
          pdfSayfaListesi.push({ jpegBytes, genislik: canvas.width, yukseklik: canvas.height });
        }
        const pdfBytes = C.uretCokSayfaliA4PdfBytes(pdfSayfaListesi);
        if (!pdfBytes) throw new Error('PDF üretilemedi');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = C.olusturGuvenliBlobUrl(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${dosyaAdiTabani || 'Sinav_Kagidi'}.pdf`;
        a.click();
      } catch (err) {
        console.warn('Görsel PDF üretilemedi, metin tabanlı yedek kullanılıyor:', err.message);
        cizMetinTabanliYedekPdf(htmlIcerik, dosyaAdiTabani);
      } finally {
        kap.remove();
      }
    };

    const cizMetinTabanliYedekPdf = (htmlIcerik, dosyaAdiTabani) => {
      const gecici = document.createElement('div');
      gecici.innerHTML = htmlIcerik;
      gecici.querySelectorAll('.soru-ekran-araclari').forEach((el) => el.remove());
      const domSayfalar = Array.from(gecici.querySelectorAll('.a4-sayfa'));
      const kaynakSayfalar = domSayfalar.length > 0 ? domSayfalar : [gecici];

      const pdfSayfaListesi = kaynakSayfalar.map((sayfaEl, sIdx) => {
        const c = document.createElement('canvas');
        c.width = 794;
        c.height = 1123;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);

        // A4 Kenar Çerçevesi ve Başlık
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(24, 24, c.width - 48, c.height - 48);

        const satirlar = (sayfaEl.innerText || sayfaEl.textContent || '')
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean);

        let y = 50;
        ctx.fillStyle = '#000000';
        for (let i = 0; i < satirlar.length && y < c.height - 45; i++) {
          const satir = satirlar[i];
          if (i < 3) {
            ctx.font = 'bold 13px Arial, sans-serif';
          } else if (satir.startsWith('BÖLÜM') || satir.startsWith('🔑') || satir.startsWith('SAYFA')) {
            ctx.fillStyle = '#111111';
            ctx.fillRect(34, y - 12, c.width - 68, 18);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px Arial, sans-serif';
            ctx.fillText(satir.slice(0, 95), 40, y + 1);
            ctx.fillStyle = '#000000';
            y += 20;
            continue;
          } else {
            ctx.font = '11px Arial, sans-serif';
          }

          // Uzun satırları A4 genişliğine (710px) göre sar
          const kelimeler = satir.split(/\s+/);
          let aktifSatir = '';
          for (const k of kelimeler) {
            const aday = aktifSatir ? `${aktifSatir} ${k}` : k;
            if (ctx.measureText(aday).width > c.width - 80) {
              ctx.fillText(aktifSatir, 38, y);
              y += 15;
              aktifSatir = k;
              if (y >= c.height - 45) break;
            } else {
              aktifSatir = aday;
            }
          }
          if (aktifSatir && y < c.height - 45) {
            ctx.fillText(aktifSatir, 38, y);
            y += 16;
          }
        }

        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#333333';
        ctx.fillText(`Sayfa ${sIdx + 1} / ${kaynakSayfalar.length} — ${dosyaAdiTabani}`, 38, c.height - 30);

        const dataUrl = c.toDataURL('image/jpeg', 0.92);
        const b64 = dataUrl.split(',')[1] || '';
        const bin = atob(b64);
        const jpegBytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) jpegBytes[i] = bin.charCodeAt(i);
        return { jpegBytes, genislik: c.width, yukseklik: c.height };
      });

      const pdfBytes = C.uretCokSayfaliA4PdfBytes(pdfSayfaListesi);
      if (pdfBytes) {
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = C.olusturGuvenliBlobUrl(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${dosyaAdiTabani || 'Sinav_Kagidi'}.pdf`;
        a.click();
      }
    };

    const calistirKapsamliCikti = (kapsamSecimi, formatSecimi) => {
      if (!durum.hocaOturumAcik) {
        const modal = document.getElementById('modal-hoca-giris');
        if (modal) modal.style.display = 'flex';
        return;
      }
      const yapi = okuAktifSinavYapisi();
      const sinavKagidiKapsamiMi = ['sinif-aktif', 'sinif-tum-gruplar', 'kagit-ABCD', 'ogrenci-tek', 'ogrenci-tum-sinif'].includes(kapsamSecimi);

      // 100 Puan Baskı Öncesi Kontrol Kapısı (90 puanlık sınav kağıdının yanlışlıkla basılmasını önler)
      if (sinavKagidiKapsamiMi && !yapi.tam100Mu) {
        const puanKutu = document.getElementById('uyari-toplam-100-kutu');
        if (puanKutu) {
          puanKutu.style.display = 'block';
          puanKutu.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        guncelleKayitDurumCubuguUI('hata', `⚠️ Sınav toplam puanı şu an ${yapi.toplamPuan}! Basım öncesi "⚖️ 100 Puana Otomatik Tamamla" düğmesine basın.`);
        return;
      }

      const paket = uretKapsamaGoreBaskiHTML(yapi, kapsamSecimi);
      const sahne = document.getElementById('a4-onizleme-sahne');
      if (sahne) {
        sahne.innerHTML = paket.html;
        dengeleVeSigdirA4Sayfalari(sahne);
      }

      const ekSayfaChk = document.getElementById('ayar-ek-sayfa-izni');
      const ekSayfaAcik = Boolean((ekSayfaChk && ekSayfaChk.checked) || durum.ekSayfaIzni);
      if (sahne && sahne.dataset.tasmaVar === '1' && !ekSayfaAcik && formatSecimi !== 'word-indir') {
        const tasmaKutu = document.getElementById('uyari-a4-tasma-kutu');
        if (tasmaKutu) {
          tasmaKutu.hidden = false;
          tasmaKutu.style.display = 'flex';
          tasmaKutu.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      // Kayıtlı sınav kağıdı indirildiğinde/yazdırıldığında "Basıldı Kilidi"ni otomatik devreye al
      if (sinavKagidiKapsamiMi && durum.aktifKayitliSinavId) {
        kilitleVeyaAcKayitliSinav(true);
      }

      if (formatSecimi === 'word-indir') {
        indirWordBelgesiOlarak(paket.html, paket.dosyaAdiTabani);
      } else if (formatSecimi === 'pdf-indir') {
        cizDomSayfalariniPdfOlarakIndir(paket.html, paket.dosyaAdiTabani);
      } else {
        window.print();
      }
    };

    // Baskı kapsamı, öğrenci seçimi veya soru modu değiştiğinde önizlemeyi senkronize et
    const baskiKapsamSec = document.getElementById('baski-kapsam-sec');
    if (baskiKapsamSec) {
      baskiKapsamSec.addEventListener('change', () => {
        const k = baskiKapsamSec.value;
        guncelleKapsamPanelleri();
        const onizMod = document.getElementById('ayar-onizleme-mod');
        if (onizMod) {
          if (k === 'sinif-tum-gruplar') onizMod.value = 'kagit-ABCD';
          else if (k === 'ogrenci-tek') onizMod.value = 'ogrenci-tek';
          else if (k === 'ogrenci-tum-sinif') onizMod.value = 'ogrenci-tum-sinif';
          else if (k === 'ayri-optik') onizMod.value = 'ayri-optik';
          else if (k === 'anahtar') onizMod.value = 'anahtar';
          else onizMod.value = 'kagit-A';
        }
        guncelleA4Onizleme();
      });
    }

    ['baski-ogrenci-sec', 'baski-ogrenci-soru-modu'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          const onizMod = document.getElementById('ayar-onizleme-mod');
          if (onizMod && !onizMod.value.startsWith('ogrenci-')) {
            onizMod.value = 'ogrenci-tek';
          }
          if (baskiKapsamSec && !baskiKapsamSec.value.startsWith('ogrenci-')) {
            baskiKapsamSec.value = 'ogrenci-tek';
          }
          guncelleA4Onizleme();
        });
      }
    });

    // Öğrenciye Özel Sınav Resmi İspat & Denetim Raporu (.txt) İndirme Düğmesi
    const btnOgrenciOzelIspatIndir = document.getElementById('btn-ogrenci-ozel-ispat-indir');
    if (btnOgrenciOzelIspatIndir) {
      btnOgrenciOzelIspatIndir.addEventListener('click', () => {
        const yapi = okuAktifSinavYapisi();
        const kapsam = (document.getElementById('baski-kapsam-sec') && document.getElementById('baski-kapsam-sec').value) || '';
        const filtreNo = kapsam === 'ogrenci-tek' ? (yapi.seciliBaskiOgrenciNo || '') : '';
        const txt = C.uretOgrenciyeOzelSinavIspatRaporuTXT(
          {
            ...yapi,
            baslik: {
              dersAdi: `${yapi.ders.kod} - ${yapi.ders.ad}`,
              sinavBasligi: yapi.sinavAd
            },
            ogrenciOzelPaketler: Object.values(yapi.ogrenciyeOzelKagitlar || {})
          },
          filtreNo
        );
        const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
        const url = C.olusturGuvenliBlobUrl(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${yapi.sinavKodu}_Ogrenciye_Ozel_Sinav_Ispat_Tutanagi.txt`;
        a.click();
      });
    }

    // Ana "Seçili Kağıdı İndir / Yazdır" Düğmesi
    const btnSeciliBaskiCalistir = document.getElementById('btn-secili-baski-calistir');
    if (btnSeciliBaskiCalistir) {
      btnSeciliBaskiCalistir.addEventListener('click', () => {
        const kapsam = (document.getElementById('baski-kapsam-sec') && document.getElementById('baski-kapsam-sec').value) || 'sinif-aktif';
        const format = (document.getElementById('baski-format-sec') && document.getElementById('baski-format-sec').value) || 'pdf-indir';
        calistirKapsamliCikti(kapsam, format);
      });
    }

    // ---- Çıktı Merkezi: seçime göre görünen paneller, salon düzenleyici, katlanabilir kartlar ----
    const ertele = (fn, ms) => {
      let t = null;
      return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    };
    const kapsamDegeri = () => (document.getElementById('baski-kapsam-sec') || {}).value || 'sinif-aktif';
    const TUTANAK_KAPSAMLARI = ['tutanak', 'yoklama', 'tutanak-yoklama'];
    const guncelleKapsamPanelleri = () => {
      const k = kapsamDegeri();
      const ogrPanel = document.getElementById('panel-ogrenci-ozel');
      const tutPanel = document.getElementById('panel-tutanak');
      const kagitPanel = document.getElementById('panel-kagit-bilgi');
      const tutanakMi = TUTANAK_KAPSAMLARI.includes(k);
      if (ogrPanel) ogrPanel.style.display = k.startsWith('ogrenci-') ? '' : 'none';
      if (tutPanel) tutPanel.style.display = tutanakMi ? 'block' : 'none';
      if (kagitPanel) kagitPanel.style.display = tutanakMi ? 'none' : 'block';
      const sec = document.getElementById('baski-kapsam-sec');
      const rozet = document.getElementById('rozet-aktif-baski-modu');
      if (sec && rozet && sec.selectedOptions[0]) rozet.textContent = sec.selectedOptions[0].textContent.replace(/^\S+\s/, '');
    };
    guncelleKapsamPanelleri();

    // Çıktı Merkezi Sınav Kağıdı Hızlı Bilgi (Sınav Süresi, Tarih, Okul, Belge No) <-> Sol Panel Kart 3 Senkronizasyonu
    const ciftYonluBagla = (hizliId, antetId) => {
      const hEl = document.getElementById(hizliId);
      const aEl = document.getElementById(antetId);
      if (hEl && aEl) {
        if (!hEl.value && aEl.value) hEl.value = aEl.value;
        hEl.addEventListener('input', () => {
          aEl.value = hEl.value;
          guncelleKaliteKunyeGorunurlugu();
          guncelleA4Onizleme();
        });
        hEl.addEventListener('change', () => {
          aEl.value = hEl.value;
          guncelleKaliteKunyeGorunurlugu();
          guncelleA4Onizleme();
        });
        aEl.addEventListener('input', () => {
          hEl.value = aEl.value;
        });
        aEl.addEventListener('change', () => {
          hEl.value = aEl.value;
        });
      }
    };
    ciftYonluBagla('kagit-hizli-sure', 'antet-sure');
    ciftYonluBagla('kagit-hizli-tarih', 'antet-tarih');
    ciftYonluBagla('kagit-hizli-sinav-ad', 'antet-sinav-ad');
    ciftYonluBagla('kagit-hizli-kurum', 'antet-kurum');
    ciftYonluBagla('kagit-hizli-hoca', 'antet-hoca');
    const esitleOgretimElemani = (yeniAd) => {
      const temiz = String(yeniAd || '').trim();
      const aktifDers = durum.dersler.find((d) => d.id === durum.aktifDersId) || durum.dersler[0] || null;
      if (aktifDers) aktifDers.ogretimElemani = temiz;
      if (!durum.evrakSablonu || typeof durum.evrakSablonu !== 'object') durum.evrakSablonu = {};
      durum.evrakSablonu.sorumlu = temiz;
      ['antet-hoca', 'kagit-hizli-hoca', 'tut-sorumlu'].forEach((hid) => {
        const hel = document.getElementById(hid);
        if (hel && hel.value !== temiz) hel.value = temiz;
      });
    };
    ['antet-hoca', 'kagit-hizli-hoca', 'tut-sorumlu'].forEach((hid) => {
      const hel = document.getElementById(hid);
      if (hel) {
        hel.addEventListener('change', () => {
          esitleOgretimElemani(hel.value);
          verileriKaydet();
          guncelleA4Onizleme();
        });
      }
    });
    ciftYonluBagla('kagit-hizli-kunye-modu', 'kalite-form-tipi');
    ciftYonluBagla('kagit-hizli-dokuman-no', 'kalite-dokuman-no');
    ciftYonluBagla('kagit-hizli-yayin-tarihi', 'kalite-yayin-tarihi');
    ciftYonluBagla('kagit-hizli-revizyon', 'kalite-revizyon');

    const btnKagitSablonKaydet = document.getElementById('btn-kagit-sablon-kaydet');
    if (btnKagitSablonKaydet) {
      btnKagitSablonKaydet.addEventListener('click', () => {
        kaydetEvrakSablonuVarsayilan('kagit-hizli');
      });
    }

    const tutDersSec = document.getElementById('tut-ders-sec');
    if (tutDersSec) {
      tutDersSec.addEventListener('change', (e) => {
        degistirAktifDersGuvenli(e.target.value);
        verileriKaydet();
        yenileTumSekmePanelleriUI();
      });
    }

    // Tutanak ve Şablon Yapısı Kontrolleri
    const tutanakYenile = ertele(() => {
      guncelleKaliteKunyeGorunurlugu();
      guncelleA4Onizleme();
    }, 220);
    const tutPanelEl = document.getElementById('panel-tutanak');
    if (tutPanelEl) {
      tutPanelEl.addEventListener('input', tutanakYenile);
      tutPanelEl.addEventListener('change', tutanakYenile);
    }

    const tutKunyeModuEl = document.getElementById('tut-kunye-modu');
    if (tutKunyeModuEl) {
      tutKunyeModuEl.addEventListener('change', () => {
        guncelleKaliteKunyeGorunurlugu();
        guncelleA4Onizleme();
      });
    }

    const kaliteFormTipiEl = document.getElementById('kalite-form-tipi');
    if (kaliteFormTipiEl) {
      kaliteFormTipiEl.addEventListener('change', () => {
        guncelleKaliteKunyeGorunurlugu();
        guncelleA4Onizleme();
      });
    }

    const tutSablonSecEl = document.getElementById('tut-sablon-sec');
    if (tutSablonSecEl) {
      tutSablonSecEl.addEventListener('change', () => {
        const secim = tutSablonSecEl.value;
        if (secim === 'kayitli') {
          senkronizeDersVeEvrakSablonuUI();
        } else if (secim === 'sade') {
          if (document.getElementById('tut-kunye-modu')) document.getElementById('tut-kunye-modu').value = 'sade';
          guncelleKaliteKunyeGorunurlugu();
        } else if (secim === 'kunyeli') {
          if (document.getElementById('tut-kunye-modu')) document.getElementById('tut-kunye-modu').value = 'kunyeli';
          guncelleKaliteKunyeGorunurlugu();
        }
        guncelleA4Onizleme();
      });
    }

    const btnEvrakSablonKaydet = document.getElementById('btn-evrak-sablon-kaydet');
    if (btnEvrakSablonKaydet) {
      btnEvrakSablonKaydet.addEventListener('click', () => {
        kaydetEvrakSablonuVarsayilan('tutanak');
      });
    }

    const btnAntetSablonKaydet = document.getElementById('btn-antet-sablon-kaydet');
    if (btnAntetSablonKaydet) {
      btnAntetSablonKaydet.addEventListener('click', () => {
        kaydetEvrakSablonuVarsayilan('antet');
      });
    }

    // Salon & kontenjan düzenleyici
    const salonlarDegisti = () => {
      verileriKaydet();
      guncelleOgrenciListesiSekmesi();
      guncelleA4Onizleme();
    };
    const kutuSalonListesi = document.getElementById('kutu-salon-listesi');
    if (kutuSalonListesi) {
      kutuSalonListesi.addEventListener('change', (e) => {
        const adEl = e.target.closest('[data-salon-ad]');
        const kontEl = e.target.closest('[data-salon-kontenjan]');
        const gozEl = e.target.closest('[data-salon-gozetmen]');
        if (adEl) durum.salonlar[Number(adEl.getAttribute('data-salon-ad'))].ad = (adEl.value || '').trim().slice(0, 40) || 'Salon';
        else if (kontEl) durum.salonlar[Number(kontEl.getAttribute('data-salon-kontenjan'))].kontenjan = Math.max(1, Math.min(1000, parseInt(kontEl.value, 10) || 1));
        else if (gozEl) durum.salonlar[Number(gozEl.getAttribute('data-salon-gozetmen'))].gozetmenler = (gozEl.value || '').split(',').map((g) => g.trim()).filter(Boolean).slice(0, 4);
        else return;
        salonlarDegisti();
      });
      kutuSalonListesi.addEventListener('click', (e) => {
        const sil = e.target.closest('[data-salon-sil]');
        if (!sil || durum.salonlar.length <= 1) return;
        durum.salonlar.splice(Number(sil.getAttribute('data-salon-sil')), 1);
        salonlarDegisti();
      });
    }
    const btnSalonEkle = document.getElementById('btn-salon-ekle');
    if (btnSalonEkle) {
      btnSalonEkle.addEventListener('click', () => {
        durum.salonlar.push({ id: `salon-${Date.now()}`, ad: `Salon ${durum.salonlar.length + 1}`, kontenjan: 30, gozetmenler: [] });
        salonlarDegisti();
      });
    }
    const ayarDagitimModu = document.getElementById('ayar-dagitim-modu');
    if (ayarDagitimModu) {
      ayarDagitimModu.addEventListener('change', () => {
        durum.dagitimModu = ayarDagitimModu.value === 'dengeli' ? 'dengeli' : 'sirali';
        salonlarDegisti();
      });
    }
    const btnSalonDuzenle = document.getElementById('btn-salon-duzenle');
    if (btnSalonDuzenle) {
      btnSalonDuzenle.addEventListener('click', () => {
        const sekme = document.querySelector('[data-sekme="sekme-ogrenciler"]');
        if (sekme) sekme.click();
        const kutu = document.getElementById('kutu-salon-listesi');
        if (kutu) kutu.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    // Katlanabilir kartlar: sık kullanılmayan bölümler varsayılan kapalı, tercih hatırlanır
    const KATLAMA_ANAHTAR = 'SINAV_OPTIK_KATLANAN_KARTLAR_V1';
    let katlamaDurumu = {};
    try { katlamaDurumu = JSON.parse(localStorage.getItem(KATLAMA_ANAHTAR) || '{}') || {}; } catch (_) { katlamaDurumu = {}; }
    document.querySelectorAll('section.sekme-panel aside > .kart[data-katlanabilir="1"]').forEach((kart) => {
      const baslik = kart.querySelector(':scope > .kart-baslik');
      if (!baslik) return;
      const anahtar = (baslik.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28);
      const varsayilanKapali = /Optik Form Modu/i.test(anahtar);
      const kapali = anahtar in katlamaDurumu ? Boolean(katlamaDurumu[anahtar]) : varsayilanKapali;
      const dugme = document.createElement('button');
      dugme.type = 'button';
      dugme.className = 'btn btn-kucuk kart-katla-btn';
      const ciz = (k) => {
        kart.classList.toggle('katlandi', k);
        dugme.textContent = k ? '▸ Aç' : '▾ Kapat';
        dugme.setAttribute('aria-expanded', String(!k));
      };
      ciz(kapali);
      dugme.addEventListener('click', () => {
        const yeni = !kart.classList.contains('katlandi');
        ciz(yeni);
        katlamaDurumu[anahtar] = yeni;
        try { localStorage.setItem(KATLAMA_ANAHTAR, JSON.stringify(katlamaDurumu)); } catch (_) {}
      });
      baslik.appendChild(dugme);
    });

    // Sınıf Kağıdı Hızlı PDF / Yazdır ve Word (.doc) Düğmeleri
    document.getElementById('btn-yazdir-kagit').addEventListener('click', () => {
      const format = (document.getElementById('baski-format-sec') && document.getElementById('baski-format-sec').value) || 'pdf-indir';
      const mevcutMod = document.getElementById('ayar-onizleme-mod').value;
      const kapsam = mevcutMod === 'kagit-ABCD' ? 'sinif-tum-gruplar' : 'sinif-aktif';
      calistirKapsamliCikti(kapsam, format === 'word-indir' ? 'pdf-indir' : format);
    });

    document.getElementById('btn-word-indir').addEventListener('click', () => {
      const mevcutMod = document.getElementById('ayar-onizleme-mod').value;
      const kapsam = mevcutMod === 'kagit-ABCD' ? 'sinif-tum-gruplar' : 'sinif-aktif';
      calistirKapsamliCikti(kapsam, 'word-indir');
    });

    // Öğrenciye Özel Soru Kağıdı Hızlı PDF / Yazdır ve Word (.doc) Düğmeleri
    const btnOgrenciOzelPdf = document.getElementById('btn-ogrenci-ozel-pdf');
    if (btnOgrenciOzelPdf) {
      btnOgrenciOzelPdf.addEventListener('click', () => {
        const seciliKapsam = (document.getElementById('baski-kapsam-sec') && document.getElementById('baski-kapsam-sec').value) || '';
        const kapsam = seciliKapsam === 'ogrenci-tum-sinif' ? 'ogrenci-tum-sinif' : 'ogrenci-tek';
        const format = (document.getElementById('baski-format-sec') && document.getElementById('baski-format-sec').value) || 'pdf-indir';
        calistirKapsamliCikti(kapsam, format === 'word-indir' ? 'pdf-indir' : format);
      });
    }

    const btnOgrenciOzelWord = document.getElementById('btn-ogrenci-ozel-word');
    if (btnOgrenciOzelWord) {
      btnOgrenciOzelWord.addEventListener('click', () => {
        const seciliKapsam = (document.getElementById('baski-kapsam-sec') && document.getElementById('baski-kapsam-sec').value) || '';
        const kapsam = seciliKapsam === 'ogrenci-tum-sinif' ? 'ogrenci-tum-sinif' : 'ogrenci-tek';
        calistirKapsamliCikti(kapsam, 'word-indir');
      });
    }

    document.getElementById('btn-yazdir-ayri-optik').addEventListener('click', () => {
      document.getElementById('ayar-onizleme-mod').value = 'ayri-optik';
      const format = (document.getElementById('baski-format-sec') && document.getElementById('baski-format-sec').value) || 'yazdir';
      calistirKapsamliCikti('ayri-optik', format);
    });

    document.getElementById('btn-yazdir-anahtar').addEventListener('click', () => {
      document.getElementById('ayar-onizleme-mod').value = 'anahtar';
      const format = (document.getElementById('baski-format-sec') && document.getElementById('baski-format-sec').value) || 'yazdir';
      calistirKapsamliCikti('anahtar', format);
    });

    document.getElementById('btn-telefon-qr-goster').addEventListener('click', () => {
      const kutu = document.getElementById('kutu-telefon-qr');
      kutu.style.display = kutu.style.display === 'none' ? 'block' : 'none';
      if (kutu.style.display === 'block') guncelleA4Onizleme();
    });

    const setupQrTabanInput = document.getElementById('setup-qr-taban-adres');
    if (setupQrTabanInput) {
      setupQrTabanInput.addEventListener('input', () => guncelleA4Onizleme());
    }

    document.getElementById('btn-setup-kod-kopyala').addEventListener('click', () => {
      const href = document.getElementById('link-qr-dogrudan-ac').href;
      if (navigator.clipboard) navigator.clipboard.writeText(href);
    });

    // Sekme 2: Soru Türü Değişimi ve Soru Ekleme
    document.getElementById('yeni-soru-tur').addEventListener('change', (e) => {
      const t = e.target.value;
      document.getElementById('alan-yeni-test-siklar').style.display = t === 'test' ? 'block' : 'none';
      document.getElementById('alan-yeni-dy').style.display = t === 'dy' ? 'block' : 'none';
      document.getElementById('alan-yeni-klasik').style.display = t === 'klasik' ? 'block' : 'none';
    });

    const inputSoruGorsel = document.getElementById('input-soru-gorsel');
    if (inputSoruGorsel) {
      inputSoruGorsel.addEventListener('change', (e) => {
        const dosya = e.target.files && e.target.files[0];
        if (!dosya) {
          durum.yeniSoruGorselDataUrl = null;
          return;
        }
        const r = new FileReader();
        r.onload = () => {
          durum.yeniSoruGorselDataUrl = String(r.result);
        };
        r.readAsDataURL(dosya);
      });
    }

    document.getElementById('btn-soru-ekle').addEventListener('click', () => {
      const tur = document.getElementById('yeni-soru-tur').value;
      const zorluk = document.getElementById('yeni-soru-zorluk').value;
      const hafta = C.normalizeHaftaNo((document.getElementById('yeni-soru-hafta') && document.getElementById('yeni-soru-hafta').value) || 1, 1);
      const metin = (document.getElementById('yeni-soru-metin').value || '').trim();
      if (!metin) return;

      const ocKoduSecili = (document.getElementById('yeni-soru-oc-kodu') && document.getElementById('yeni-soru-oc-kodu').value) || 'ÖÇ-1';
      const kazanimAciklama = (document.getElementById('yeni-soru-kazanim') && document.getElementById('yeni-soru-kazanim').value.trim()) || '';
      const ocBilgi = C.ayiklaOcBilesenleri(ocKoduSecili, kazanimAciklama || `${hafta}. Hafta Kazanımı`, ocKoduSecili);
      const ocKodu = ocBilgi.ocKodu;
      const kazanim = ocBilgi.kazanimTam;
      const kodBlok = (document.getElementById('yeni-soru-kod') && document.getElementById('yeni-soru-kod').value.trim()) || '';

      const yeni = {
        id: 'S-' + Date.now(),
        dersId: durum.aktifDersId,
        tur,
        hafta,
        ocKodu,
        zorluk,
        metin,
        kazanim,
        kodBlok,
        gorselDataUrl: durum.yeniSoruGorselDataUrl || null,
        siklar: [
          document.getElementById('sik-a').value.trim() || 'A seçeneği',
          document.getElementById('sik-b').value.trim() || 'B seçeneği',
          document.getElementById('sik-c').value.trim() || 'C seçeneği',
          document.getElementById('sik-d').value.trim() || 'D seçeneği',
          document.getElementById('sik-e').value.trim() || 'E seçeneği'
        ],
        dogruHarf: document.getElementById('yeni-soru-dogru-harf').value || 'A',
        dogruDY: document.getElementById('yeni-soru-dogru-dy').value || 'D',
        rubrik: document.getElementById('yeni-soru-rubrik').value.trim() || 'Tam doğru açıklama (10p)'
      };
      durum.sorular.unshift(yeni);
      document.getElementById('yeni-soru-metin').value = '';
      if (document.getElementById('yeni-soru-kod')) document.getElementById('yeni-soru-kod').value = '';
      if (document.getElementById('input-soru-gorsel')) document.getElementById('input-soru-gorsel').value = '';
      durum.yeniSoruGorselDataUrl = null;
      verileriKaydet();
      guncelleSoruBankasiTablosu();
      guncelleA4Onizleme();
    });

    document.getElementById('btn-ornek-metin-doldur').addEventListener('click', () => {
      document.getElementById('toplu-soru-metin').value =
        `1. [DY] [ÖÇ-1] HTTPS protokolü uygulama katmanı verilerini TLS ile şifreleyerek iletir. (D)\n` +
        `2. [DY] [ÖÇ-2] Bir IPv4 adresi toplam 64 bitten oluşur. (Y)\n` +
        `3. [ÖÇ-3] Aşağıdaki HTTP durum kodlarından hangisi 'Yetkisiz Erişim (Unauthorized)' anlamına gelir?\n` +
        `A) 200  B) 301  C) 401  D) 404  E) 500\n` +
        `Cevap: C\n` +
        `4. [KLASİK] [ÖÇ-4] İstemci tarafı doğrulama ile sunucu tarafı doğrulama arasındaki güvenlik farkını açıklayınız.`;
    });

    document.getElementById('btn-toplu-soru-aktar').addEventListener('click', () => {
      const ham = document.getElementById('toplu-soru-metin').value;
      const uretilen = C.metindenSorulariAyikla(ham, durum.aktifDersId);
      const seciliHafta = C.normalizeHaftaNo((document.getElementById('yeni-soru-hafta') && document.getElementById('yeni-soru-hafta').value) || 1, 1);
      if (uretilen.length > 0) {
        uretilen.forEach((u) => {
          if (!u.hafta) u.hafta = seciliHafta;
        });
        durum.sorular.unshift(...uretilen);
        document.getElementById('toplu-soru-metin').value = '';
        verileriKaydet();
        guncelleSoruBankasiTablosu();
        guncelleA4Onizleme();
      }
    });

    const yenileBankaFiltreIlkSayfa = () => {
      durum.soruBankasiSayfa = 1;
      guncelleSoruBankasiTablosu();
    };
    document.getElementById('filtre-soru-tur').addEventListener('change', yenileBankaFiltreIlkSayfa);
    const filtreSoruHafta = document.getElementById('filtre-soru-hafta');
    if (filtreSoruHafta) {
      filtreSoruHafta.addEventListener('change', yenileBankaFiltreIlkSayfa);
    }
    const filtreSoruOc = document.getElementById('filtre-soru-oc');
    if (filtreSoruOc) {
      filtreSoruOc.addEventListener('change', yenileBankaFiltreIlkSayfa);
    }
    const filtreSoruKaynak = document.getElementById('filtre-soru-kaynak');
    if (filtreSoruKaynak) {
      filtreSoruKaynak.addEventListener('change', yenileBankaFiltreIlkSayfa);
    }
    const kutuBankaArsivCubuk = document.getElementById('kutu-banka-arsiv-cubuk');
    if (kutuBankaArsivCubuk) {
      kutuBankaArsivCubuk.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-banka-arsiv-aktar]');
        if (!btn) return;
        const arsivId = btn.getAttribute('data-banka-arsiv-aktar');
        dahilEtArsivHavuzlarini([arsivId], durum.aktifDersId);
      });
    }

    document.getElementById('tablo-soru-bankasi').addEventListener('change', (e) => {
      const ocSec = e.target.closest('[data-soru-oc-degistir]');
      if (!ocSec) return;
      const soruId = ocSec.getAttribute('data-soru-oc-degistir');
      const yeniOc = C.normalizeOcKodu(ocSec.value, 'ÖÇ-1');
      const soru = durum.sorular.find((s) => s.id === soruId);
      if (soru) {
        const mevcutBilgi = C.ayiklaOcBilesenleri(soru.kazanim || '', '', yeniOc);
        soru.ocKodu = yeniOc;
        soru.kazanim = mevcutBilgi.konuAciklama ? `${yeniOc}: ${mevcutBilgi.konuAciklama}` : yeniOc;
        verileriKaydet();
        guncelleSoruBankasiTablosu();
        guncelleA4Onizleme();
      }
    });

    document.getElementById('tablo-soru-bankasi').addEventListener('click', (e) => {
      const aktarBtn = e.target.closest('[data-arsiv-tek-aktar]');
      if (aktarBtn) {
        const id = aktarBtn.getAttribute('data-arsiv-tek-aktar');
        const soru = durum.sorular.find((s) => s.id === id);
        if (soru) {
          soru.dersId = durum.aktifDersId;
          delete soru.arsivde;
          delete soru.arsivDersId;
          delete soru.arsivDersKod;
          delete soru.arsivDersAd;
          verileriKaydet();
          doldurDersSecici();
          guncelleSoruBankasiTablosu();
          guncelleA4Onizleme();
        }
        return;
      }
      const silBtn = e.target.closest('[data-sil-soru]');
      if (!silBtn) return;
      const id = silBtn.getAttribute('data-sil-soru');
      const silinenIdx = durum.sorular.findIndex((s) => s && s.id === id);
      const silinenSoru = silinenIdx >= 0 ? durum.sorular[silinenIdx] : null;
      kaydetSonGeriAlYedegi('Soru Silme', silinenSoru ? { tip: 'sorular-delta', degisim: 'sil', soru: silinenSoru, indeks: silinenIdx } : null);
      if (silinenIdx >= 0) durum.sorular.splice(silinenIdx, 1);
      else durum.sorular = durum.sorular.filter((s) => s.id !== id);
      verileriKaydet({ zorlaEz: true });
      guncelleSoruBankasiTablosu();
      guncelleA4Onizleme();
    });

    // Sekme 3: Sentetik OMR Tek Kağıt ve Tüm Sınıf Tarama
    document.getElementById('btn-sim-tek-tara').addEventListener('click', () => {
      const yapi = okuEtkinOmrSinavYapisi();
      const ogrNo = document.getElementById('sim-ogrenci-sec').value || (durum.ogrenciler[0] && durum.ogrenciler[0].ogrNo) || '2026000011';
      const grup = document.getElementById('sim-kitapcik-sec').value || 'A';
      const senaryo = document.getElementById('sim-senaryo-sec').value || 'basarili';

      const ogrNoKod = yapi.kimlikModu === 'tam'
        ? String(ogrNo).slice(-yapi.haneSayisi).padStart(yapi.haneSayisi, '0')
        : String(ogrNo).slice(-2);

      const simCevap = uretSentetikOgrenciCevaplari(yapi, grup, senaryo, `${ogrNo}-${Date.now()}`, ogrNo);
      const girdiCanvas = document.getElementById('canvas-omr-girdi');
      const { koseler } = C.cizSentetikOptikFormCanvas(girdiCanvas, yapi, {
        grup,
        ogrNoKod,
        ...simCevap
      });

      const ctx = girdiCanvas.getContext('2d');
      const imgData = ctx.getImageData(0, 0, girdiCanvas.width, girdiCanvas.height);
      const sonuc = C.okuOptikFormImageData(imgData, yapi, durum.ogrenciler, koseler);
      sesliBipCal(!sonuc.supheliMi);
      kaydetVeGosterOmrSonuc(sonuc);
    });

    document.getElementById('btn-sim-tum-sinif-tara').addEventListener('click', () => {
      const yapi = okuEtkinOmrSinavYapisi();
      const girdiCanvas = document.getElementById('canvas-omr-girdi');
      const ctx = girdiCanvas.getContext('2d');
      const gruplar = ['A', 'B', 'C', 'D'];
      const senaryolar = ['basarili', 'orta', 'basarili', 'zayif', 'orta'];
      const simOgrenciListesi = durum.ogrenciler.length > 0
        ? durum.ogrenciler
        : [{ ogrNo: '2026000011', adSoyad: 'Test Öğrencisi' }];

      simOgrenciListesi.forEach((ogr, idx) => {
        const grup = gruplar[idx % gruplar.length];
        const senaryo = idx === 2 ? 'silinti' : senaryolar[idx % senaryolar.length];
        const ogrNoKod = yapi.kimlikModu === 'tam'
          ? String(ogr.ogrNo).slice(-yapi.haneSayisi).padStart(yapi.haneSayisi, '0')
          : String(ogr.ogrNo).slice(-2);

        const simCevap = uretSentetikOgrenciCevaplari(yapi, grup, senaryo, `SINIF-${ogr.ogrNo}-${idx}`, ogr.ogrNo);
        const { koseler } = C.cizSentetikOptikFormCanvas(girdiCanvas, yapi, {
          grup,
          ogrNoKod,
          ...simCevap
        });
        const imgData = ctx.getImageData(0, 0, girdiCanvas.width, girdiCanvas.height);
        const sonuc = C.okuOptikFormImageData(imgData, yapi, simOgrenciListesi, koseler);
        kaydetVeGosterOmrSonuc(sonuc);
      });
      sesliBipCal(true);
    });

    const omrFormTuruSec = document.getElementById('omr-form-turu');
    if (omrFormTuruSec) {
      omrFormTuruSec.addEventListener('change', () => {
        document.getElementById('omr-standart-ayar').hidden = omrFormTuruSec.value !== 'standart';
        omrUyariGoster(omrFormTuruSec.value === 'standart' ? 'ℹ️ Standart form modu: fotoğraf yükleyin veya kamerayı kullanın.' : '');
      });
    }

    // Sekme 3: Harici A/B/C/D Cevap Anahtarı İçe Aktarma (Soru Bankasız Geçmiş Sınav Puanlama)
    const guncelleHariciOmrAnahtarUI = () => {
      const h = durum.hariciOmrAnahtar || {};
      const chk = document.getElementById('ayar-omr-harici-anahtar-aktif');
      if (chk) chk.checked = Boolean(h.aktif);
      const setSayi = (id, v) => {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) el.value = String(v);
      };
      setSayi('omr-harici-dy-sayisi', h.dySayisi !== undefined ? h.dySayisi : 10);
      setSayi('omr-harici-test-sayisi', h.testSayisi !== undefined ? h.testSayisi : 20);
      setSayi('omr-harici-sik-sayisi', Number(h.sikSayisi) === 4 ? 4 : 5);
      setSayi('omr-harici-klasik-sayisi', h.klasikSayisi !== undefined ? h.klasikSayisi : 0);
      const an = h.anahtarlar || {};
      ['A', 'B', 'C', 'D'].forEach((g) => {
        const dyEl = document.getElementById(`omr-anahtar-${g.toLowerCase()}-dy`);
        const testEl = document.getElementById(`omr-anahtar-${g.toLowerCase()}-test`);
        if (dyEl && document.activeElement !== dyEl) dyEl.value = (an[g] && an[g].dy) || '';
        if (testEl && document.activeElement !== testEl) testEl.value = (an[g] && an[g].test) || '';
      });
      const durumEl = document.getElementById('etiket-omr-harici-anahtar-durum');
      if (durumEl) {
        if (h.aktif) {
          const doluGruplar = ['A', 'B', 'C', 'D'].filter((g) => an[g] && ((an[g].dy || '').trim() || (an[g].test || '').trim()));
          durumEl.style.color = 'var(--basari)';
          durumEl.textContent = `🟢 Harici Anahtar Aktif (${h.dySayisi || 0} D/Y + ${h.testSayisi || 0} Test · Gruplar: ${doluGruplar.join(',') || 'A'})`;
        } else {
          durumEl.style.color = 'var(--metin-soluk)';
          durumEl.textContent = 'Pasif (Stüdyo soru bankası kullanılıyor)';
        }
      }
      if (h.aktif) {
        const panel = document.getElementById('panel-omr-harici-anahtar');
        if (panel) panel.open = true;
      }
    };

    const okuHariciOmrAnahtarFormdan = (yenidenPuanla = true) => {
      const h = durum.hariciOmrAnahtar;
      const chk = document.getElementById('ayar-omr-harici-anahtar-aktif');
      h.aktif = Boolean(chk && chk.checked);
      h.dySayisi = Math.max(0, Math.min(40, parseInt((document.getElementById('omr-harici-dy-sayisi') || {}).value, 10) || 0));
      h.testSayisi = Math.max(0, Math.min(80, parseInt((document.getElementById('omr-harici-test-sayisi') || {}).value, 10) || 0));
      h.sikSayisi = Number((document.getElementById('omr-harici-sik-sayisi') || {}).value) === 4 ? 4 : 5;
      h.klasikSayisi = Math.max(0, Math.min(10, parseInt((document.getElementById('omr-harici-klasik-sayisi') || {}).value, 10) || 0));
      const izinTest = h.sikSayisi === 4 ? /[^A-D]/g : /[^A-E]/g;
      ['A', 'B', 'C', 'D'].forEach((g) => {
        const dyEl = document.getElementById(`omr-anahtar-${g.toLowerCase()}-dy`);
        const testEl = document.getElementById(`omr-anahtar-${g.toLowerCase()}-test`);
        const temizDy = String((dyEl && dyEl.value) || '').toUpperCase().replace(/[^DY]/g, '');
        const temizTest = String((testEl && testEl.value) || '').toUpperCase().replace(izinTest, '');
        if (!h.anahtarlar[g]) h.anahtarlar[g] = { dy: '', test: '' };
        h.anahtarlar[g].dy = temizDy;
        h.anahtarlar[g].test = temizTest;
      });
      verileriKaydet();
      guncelleHariciOmrAnahtarUI();
      if (yenidenPuanla && durum.okumaSonuclari.length > 0) {
        const etkinYapi = okuEtkinOmrSinavYapisi();
        if (typeof C.yenidenPuanlaOkumaSonuclari === 'function') {
          durum.okumaSonuclari = C.yenidenPuanlaOkumaSonuclari(durum.okumaSonuclari, etkinYapi);
        }
        verileriKaydet();
        guncelleOmrTabloVeKuyruk();
        guncelleMaddeAnaliziSekmesi();
      }
    };

    [
      'ayar-omr-harici-anahtar-aktif',
      'omr-harici-dy-sayisi',
      'omr-harici-test-sayisi',
      'omr-harici-sik-sayisi',
      'omr-harici-klasik-sayisi',
      'omr-anahtar-a-dy', 'omr-anahtar-a-test',
      'omr-anahtar-b-dy', 'omr-anahtar-b-test',
      'omr-anahtar-c-dy', 'omr-anahtar-c-test',
      'omr-anahtar-d-dy', 'omr-anahtar-d-test'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => okuHariciOmrAnahtarFormdan(true));
      if (el.tagName === 'INPUT' && el.type === 'text') {
        el.addEventListener('input', () => okuHariciOmrAnahtarFormdan(true));
      }
      el.addEventListener('change', () => {
        if (typeof window.__gonderMasaustuAnahtarV2Olayi === 'function') {
          window.__gonderMasaustuAnahtarV2Olayi('A');
        }
      });
    });

    const btnAnahtarAKopyala = document.getElementById('btn-omr-anahtar-a-kopyala');
    if (btnAnahtarAKopyala) {
      btnAnahtarAKopyala.addEventListener('click', () => {
        okuHariciOmrAnahtarFormdan(false);
        const aDy = (durum.hariciOmrAnahtar.anahtarlar.A && durum.hariciOmrAnahtar.anahtarlar.A.dy) || '';
        const aTest = (durum.hariciOmrAnahtar.anahtarlar.A && durum.hariciOmrAnahtar.anahtarlar.A.test) || '';
        ['B', 'C', 'D'].forEach((g) => {
          durum.hariciOmrAnahtar.anahtarlar[g] = { dy: aDy, test: aTest };
        });
        guncelleHariciOmrAnahtarUI();
        okuHariciOmrAnahtarFormdan(true);
      });
    }

    const btnHariciAnahtarTemizle = document.getElementById('btn-omr-harici-anahtar-temizle');
    if (btnHariciAnahtarTemizle) {
      btnHariciAnahtarTemizle.addEventListener('click', () => {
        durum.hariciOmrAnahtar = {
          aktif: false,
          dySayisi: 10,
          testSayisi: 20,
          sikSayisi: 5,
          klasikSayisi: 0,
          anahtarlar: { A: { dy: '', test: '' }, B: { dy: '', test: '' }, C: { dy: '', test: '' }, D: { dy: '', test: '' } }
        };
        guncelleHariciOmrAnahtarUI();
        verileriKaydet();
        if (durum.okumaSonuclari.length > 0 && typeof C.yenidenPuanlaOkumaSonuclari === 'function') {
          durum.okumaSonuclari = C.yenidenPuanlaOkumaSonuclari(durum.okumaSonuclari, okuEtkinOmrSinavYapisi());
          verileriKaydet();
          guncelleOmrTabloVeKuyruk();
          guncelleMaddeAnaliziSekmesi();
        }
      });
    }

    const btnOmrAnahtarCsvSablon = document.getElementById('btn-omr-anahtar-csv-sablon');
    if (btnOmrAnahtarCsvSablon) {
      btnOmrAnahtarCsvSablon.addEventListener('click', () => {
        const sablon = [
          'Grup;DY_Anahtar;Test_Anahtar',
          'A;DYDYDDYDYD;ABCDEABCDEABCDEABCDE',
          'B;YDYDYDYDYD;BCDEABCDEABCDEABCDEA',
          'C;DDYYDDYYDD;CDEABCDEABCDEABCDEAB',
          'D;YYDDYYDDYY;DEABCDEABCDEABCDEABC'
        ].join('\r\n');
        indirDelilDosyasi('Harici_ABCD_Cevap_Anahtari_Sablonu.csv', '\ufeff' + sablon, 'text/csv;charset=utf-8');
      });
    }

    const inputOmrAnahtarCsv = document.getElementById('input-omr-anahtar-csv-yukle');
    if (inputOmrAnahtarCsv) {
      inputOmrAnahtarCsv.addEventListener('change', async (e) => {
        const dosya = e.target.files && e.target.files[0];
        if (!dosya) return;
        try {
          const hamMetin = await dosyadanCsvMetniOku(dosya);
          const satirlar = String(hamMetin || '')
            .replace(/^\ufeff/, '')
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (satirlar.length === 0) return;

          const ayrac = satirlar[0].includes(';') ? ';' : (satirlar[0].includes('\t') ? '\t' : ',');
          const parcala = (sat) => sat.split(ayrac).map((h) => h.replace(/^"|"$/g, '').trim());
          const baslik = parcala(satirlar[0]).map((x) => x.toUpperCase());
          const yeniAnahtar = { A: { dy: [], test: [] }, B: { dy: [], test: [] }, C: { dy: [], test: [] }, D: { dy: [], test: [] } };

          const grupSutunHarita = {};
          ['A', 'B', 'C', 'D'].forEach((g) => {
            const idx = baslik.findIndex((b) => b === g || b === `GRUP ${g}` || b === `${g} GRUBU` || b === `KITAPCIK ${g}`);
            if (idx >= 0) grupSutunHarita[g] = idx;
          });

          if (baslik.some((b) => b.includes('DY_ANAHTAR') || b.includes('TEST_ANAHTAR'))) {
            // Format 1: Grup;DY_Anahtar;Test_Anahtar
            const gIdx = Math.max(0, baslik.findIndex((b) => b.includes('GRUP') || b.includes('KITAPCIK')));
            const dyIdx = baslik.findIndex((b) => b.includes('DY'));
            const testIdx = baslik.findIndex((b) => b.includes('TEST') || b.includes('COKTAN'));
            for (let i = 1; i < satirlar.length; i++) {
              const hucre = parcala(satirlar[i]);
              const g = String(hucre[gIdx] || '').toUpperCase().replace(/[^A-D]/g, '').slice(0, 1);
              if (!yeniAnahtar[g]) continue;
              if (dyIdx >= 0) yeniAnahtar[g].dy = String(hucre[dyIdx] || '').toUpperCase().replace(/[^DY]/g, '').split('');
              if (testIdx >= 0) yeniAnahtar[g].test = String(hucre[testIdx] || '').toUpperCase().replace(/[^A-E]/g, '').split('');
            }
          } else if (Object.keys(grupSutunHarita).length >= 1) {
            // Format 2: SoruNo;[Tur];A;B;C;D
            const turIdx = baslik.findIndex((b) => b.includes('TUR') || b.includes('TÜR') || b.includes('BOLUM') || b.includes('BÖLÜM'));
            for (let i = 1; i < satirlar.length; i++) {
              const hucre = parcala(satirlar[i]);
              const turMetin = turIdx >= 0 ? String(hucre[turIdx] || '').toUpperCase() : '';
              ['A', 'B', 'C', 'D'].forEach((g) => {
                const cIdx = grupSutunHarita[g];
                if (cIdx === undefined) return;
                const deger = String(hucre[cIdx] || '').trim().toUpperCase();
                if (!deger) return;
                const dyMi = turMetin ? /DY|D\/Y|DOGRU|DOĞRU/.test(turMetin) : (deger === 'D' || deger === 'Y') && !['A', 'B', 'C', 'E'].includes(deger);
                // Not: 'D' şıkkı testte de olabileceği için Tur sütunu yoksa tüm grup değerlerinin yalnızca D/Y olmasına bakılır
                const tumDegerlerDyMi = !turMetin && Object.values(grupSutunHarita).every((kIdx) => {
                  const v = String(hucre[kIdx] || '').trim().toUpperCase();
                  return !v || v === 'D' || v === 'Y';
                }) && Object.values(grupSutunHarita).some((kIdx) => String(hucre[kIdx] || '').trim().toUpperCase() === 'Y');
                if (turMetin ? dyMi : tumDegerlerDyMi) {
                  if (deger === 'D' || deger === 'Y') yeniAnahtar[g].dy.push(deger);
                } else if (/^[A-E]$/.test(deger)) {
                  yeniAnahtar[g].test.push(deger);
                }
              });
            }
          } else {
            // Format 3: Grup;Tur;SoruNo;DogruCevap (veya tek satır doğrudan dizgi)
            const gIdx = baslik.findIndex((b) => b.includes('GRUP') || b.includes('KITAPCIK'));
            const turIdx = baslik.findIndex((b) => b.includes('TUR') || b.includes('TÜR'));
            const cvpIdx = baslik.findIndex((b) => b.includes('CEVAP') || b.includes('ANAHTAR') || b.includes('DOGRU') || b.includes('DOĞRU'));
            if (gIdx >= 0 && cvpIdx >= 0) {
              for (let i = 1; i < satirlar.length; i++) {
                const hucre = parcala(satirlar[i]);
                const g = String(hucre[gIdx] || 'A').toUpperCase().replace(/[^A-D]/g, '').slice(0, 1) || 'A';
                const tur = turIdx >= 0 ? String(hucre[turIdx] || '').toUpperCase() : 'TEST';
                const cvp = String(hucre[cvpIdx] || '').trim().toUpperCase();
                if (/DY|D\/Y/.test(tur) && (cvp === 'D' || cvp === 'Y')) yeniAnahtar[g].dy.push(cvp);
                else if (/^[A-E]$/.test(cvp)) yeniAnahtar[g].test.push(cvp);
              }
            }
          }

          let maksDy = 0;
          let maksTest = 0;
          ['A', 'B', 'C', 'D'].forEach((g) => {
            maksDy = Math.max(maksDy, yeniAnahtar[g].dy.length);
            maksTest = Math.max(maksTest, yeniAnahtar[g].test.length);
          });
          if (maksDy > 0 || maksTest > 0) {
            durum.hariciOmrAnahtar.aktif = true;
            durum.hariciOmrAnahtar.dySayisi = maksDy;
            durum.hariciOmrAnahtar.testSayisi = maksTest;
            ['A', 'B', 'C', 'D'].forEach((g) => {
              durum.hariciOmrAnahtar.anahtarlar[g] = {
                dy: yeniAnahtar[g].dy.join(''),
                test: yeniAnahtar[g].test.join('')
              };
            });
            guncelleHariciOmrAnahtarUI();
            okuHariciOmrAnahtarFormdan(true);
            omrUyariGoster(`✅ Harici cevap anahtarı yüklendi (${maksDy} D/Y + ${maksTest} Test). Artık soru bankası olmadan kağıtları okutabilirsiniz.`);
          } else {
            omrUyariGoster('⚠️ Yüklenen dosyada geçerli A/B/C/D cevap anahtarı bulunamadı. Lütfen Örnek Şablon indirip formatı kontrol edin.');
          }
        } catch (err) {
          omrUyariGoster('⚠️ Cevap anahtarı dosyası okunamadı: ' + err.message);
        } finally {
          inputOmrAnahtarCsv.value = '';
        }
      });
    }

    const gosterOgretmenAnahtarOkumaDurumu = (mesaj, basariliMi = true) => {
      omrUyariGoster(mesaj);
      const kutu = document.getElementById('etiket-omr-anahtar-oku-sonuc');
      if (!kutu) return;
      kutu.textContent = mesaj || '';
      kutu.hidden = !mesaj;
      kutu.style.background = basariliMi ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.18)';
      kutu.style.color = basariliMi ? 'var(--basari)' : '#b45309';
      kutu.style.border = `1px solid ${basariliMi ? 'var(--basari)' : '#f59e0b'}`;
    };

    const cozVeUygulaHariciOgretmenAnahtari = (kaynak, kaynakGen, kaynakYuk) => {
      const hariciOncedenAktif = Boolean(durum.hariciOmrAnahtar && durum.hariciOmrAnahtar.aktif);
      okuHariciOmrAnahtarFormdan(false);
      const aktifYapi = okuAktifSinavYapisi();
      const geciciYapi = hariciOncedenAktif
        ? Object.assign({}, aktifYapi, {
          dySayisi: durum.hariciOmrAnahtar.dySayisi,
          testSayisi: durum.hariciOmrAnahtar.testSayisi,
          sikSayisi: durum.hariciOmrAnahtar.sikSayisi,
          klasikSayisi: durum.hariciOmrAnahtar.klasikSayisi
        })
        : Object.assign({}, aktifYapi);
      const cnv = document.getElementById('canvas-omr-girdi');
      const olcek = Math.min(1, 1600 / Math.max(kaynakGen, kaynakYuk));
      cnv.width = Math.max(1, Math.round(kaynakGen * olcek));
      cnv.height = Math.max(1, Math.round(kaynakYuk * olcek));
      const ctx = cnv.getContext('2d');
      ctx.drawImage(kaynak, 0, 0, cnv.width, cnv.height);
      const imgData = ctx.getImageData(0, 0, cnv.width, cnv.height);

      if (typeof window.jsQR === 'function' && typeof C.cozSifreliOptikKagitQrPaketi === 'function') {
        try {
          const qrBul = window.jsQR(imgData.data, imgData.width, imgData.height);
          if (qrBul && qrBul.data && String(qrBul.data).startsWith('OQV2:')) {
            const cozulmusQr = C.cozSifreliOptikKagitQrPaketi(qrBul.data, geciciYapi.sinavGizliAnahtar);
            if (cozulmusQr && cozulmusQr.gecerli) geciciYapi.kagitQrCozum = cozulmusQr;
          }
        } catch (_) {}
      }

      const formTuru = (document.getElementById('omr-form-turu') || {}).value || 'uygulama';
      let okunan = formTuru !== 'standart' ? C.okuOptikFormImageData(imgData, geciciYapi, []) : null;
      if ((!okunan || !okunan.formBulundu) && typeof C.okuStandartOptikFormImageData === 'function') {
        const stdAyar = {
          soruSayisi: Math.max(1, Number((document.getElementById('omr-std-soru') || {}).value) || Number(durum.hariciOmrAnahtar.testSayisi) || 40),
          sikSayisi: Number((document.getElementById('omr-std-sik') || {}).value) === 4 ? 4 : (durum.hariciOmrAnahtar.sikSayisi === 4 ? 4 : 5),
          siralama: (document.getElementById('omr-std-siralama') || {}).value || 'sutun'
        };
        const stdOkuma = C.okuStandartOptikFormImageData(imgData, stdAyar);
        if (stdOkuma && stdOkuma.formBulundu) {
          const seciliGrup = ((document.getElementById('sec-omr-ogretmen-grup') || {}).value) || 'A';
          const okunanTest = (stdOkuma.testDetay || []).map((t) => (/^[A-E]$/.test(t.verilen || '') ? t.verilen : 'A')).join('');
          const stdInput = document.getElementById('omr-std-anahtar');
          if (stdInput) stdInput.value = okunanTest;
          durum.hariciOmrAnahtar.aktif = true;
          durum.hariciOmrAnahtar.dySayisi = 0;
          durum.hariciOmrAnahtar.testSayisi = okunanTest.length;
          durum.hariciOmrAnahtar.anahtarlar[seciliGrup] = { dy: '', test: okunanTest };
          guncelleHariciOmrAnahtarUI();
          okuHariciOmrAnahtarFormdan(true);
          if (typeof window.__gonderMasaustuAnahtarV2Olayi === 'function') {
            window.__gonderMasaustuAnahtarV2Olayi(seciliGrup);
          }
          sesliBipCal(true);
          gosterOgretmenAnahtarOkumaDurumu(`✅ Standart öğretmen formundan ${seciliGrup} Grubu anahtarı çıkarıldı (${okunanTest.length} Test sorusu).`, true);
          return true;
        }
      }

      if (!okunan || !okunan.formBulundu) {
        gosterOgretmenAnahtarOkumaDurumu('⚠️ İşaretli öğretmen optik formu algılanamadı: ' + ((okunan && okunan.mesaj) || '4 köşe karesi veya form balonları net görünmelidir.'), false);
        sesliBipCal(false);
        return false;
      }
      const seciliGrup = ((document.getElementById('sec-omr-ogretmen-grup') || {}).value) || okunan.grup || 'A';
      const hedefGrup = ['A', 'B', 'C', 'D'].includes(okunan.grup) ? okunan.grup : seciliGrup;
      const okunanDy = (okunan.dyDetay || []).map((d) => (d.verilen === 'D' || d.verilen === 'Y' ? d.verilen : 'D')).join('');
      const okunanTest = (okunan.testDetay || []).map((t) => (/^[A-E]$/.test(t.verilen || '') ? t.verilen : 'A')).join('');
      durum.hariciOmrAnahtar.aktif = true;
      durum.hariciOmrAnahtar.dySayisi = (okunan.dyDetay || []).length;
      durum.hariciOmrAnahtar.testSayisi = (okunan.testDetay || []).length;
      durum.hariciOmrAnahtar.anahtarlar[hedefGrup] = { dy: okunanDy, test: okunanTest };
      guncelleHariciOmrAnahtarUI();
      okuHariciOmrAnahtarFormdan(true);
      if (typeof window.__gonderMasaustuAnahtarV2Olayi === 'function') {
        window.__gonderMasaustuAnahtarV2Olayi(hedefGrup);
      }
      sesliBipCal(true);
      gosterOgretmenAnahtarOkumaDurumu(`✅ İşaretli öğretmen kağıdından ${hedefGrup} Grubu anahtarı otomatik çıkarıldı (${okunanDy.length} D/Y + ${okunanTest.length} Test).`, true);
      return true;
    };

    const inputOmrOgretmenFoto = document.getElementById('input-omr-ogretmen-kagit-foto');
    if (inputOmrOgretmenFoto) {
      inputOmrOgretmenFoto.addEventListener('change', (e) => {
        const dosya = e.target.files && e.target.files[0];
        if (!dosya) return;
        const url = C.olusturGuvenliBlobUrl(dosya);
        const img = new Image();
        img.onload = () => {
          try {
            cozVeUygulaHariciOgretmenAnahtari(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
          } finally {
            try { URL.revokeObjectURL(url); } catch (_) {}
            inputOmrOgretmenFoto.value = '';
          }
        };
        img.onerror = () => {
          try { URL.revokeObjectURL(url); } catch (_) {}
          inputOmrOgretmenFoto.value = '';
          gosterOgretmenAnahtarOkumaDurumu('⚠️ Seçilen öğretmen anahtarı görseli yüklenemedi. Lütfen PNG/JPG dosyası seçin.', false);
        };
        img.src = url;
      });
    }

    const btnOmrKameradanAnahtarOku = document.getElementById('btn-omr-kameradan-anahtar-oku');
    if (btnOmrKameradanAnahtarOku) {
      btnOmrKameradanAnahtarOku.addEventListener('click', () => {
        const video = document.getElementById('video-studyo-omr');
        if (durum.kameraStream && video && video.videoWidth > 0) {
          cozVeUygulaHariciOgretmenAnahtari(video, video.videoWidth, video.videoHeight);
          return;
        }
        const kamBtn = document.getElementById('btn-studyo-kamera-ac');
        if (kamBtn) kamBtn.click();
        gosterOgretmenAnahtarOkumaDurumu('ℹ️ Önce kamerayı başlatıp işaretli öğretmen kağıdını gösterin, ardından "Kameradan Anahtar Oku" düğmesine basın.', false);
      });
    }

    guncelleHariciOmrAnahtarUI();

    // Fotoğraf Dosyasından OMR Okuma
    document.getElementById('input-omr-foto').addEventListener('change', (e) => {
      const dosya = e.target.files && e.target.files[0];
      if (!dosya) return;
      const url = C.olusturGuvenliBlobUrl(dosya);
      const img = new Image();
      img.onload = () => {
        omrGoruntuyuOku(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
      };
      img.src = url;
    });

    // Canlı Kamera Aç/Kapat (Stüdyo İçi)
    document.getElementById('btn-studyo-kamera-ac').addEventListener('click', async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        durum.kameraStream = stream;
        const video = document.getElementById('video-studyo-omr');
        video.srcObject = stream;
        document.getElementById('kutu-studyo-video').style.display = 'block';
        document.getElementById('btn-studyo-kamera-ac').style.display = 'none';
        document.getElementById('btn-studyo-kamera-kapat').style.display = 'inline-flex';
      } catch (err) {
        omrUyariGoster('⚠️ Kamera erişimi sağlanamadı veya cihazda kamera bulunamadı: ' + err.message);
      }
    });

    document.getElementById('btn-studyo-kamera-kapat').addEventListener('click', () => {
      if (durum.kameraStream) {
        durum.kameraStream.getTracks().forEach((t) => t.stop());
        durum.kameraStream = null;
      }
      document.getElementById('kutu-studyo-video').style.display = 'none';
      document.getElementById('btn-studyo-kamera-ac').style.display = 'inline-flex';
      document.getElementById('btn-studyo-kamera-kapat').style.display = 'none';
    });

    document.getElementById('btn-video-kare-tara').addEventListener('click', () => {
      const video = document.getElementById('video-studyo-omr');
      omrGoruntuyuOku(video, video.videoWidth || 1280, video.videoHeight || 720);
    });

    // İnceleme Kuyruğu: Hızlı Balon Düzeltme, Eşleşmeyen Öğrenci Atama ve Onaylama
    const incelemeKuyruguEl = document.getElementById('liste-inceleme-kuyrugu');
    if (incelemeKuyruguEl) {
      incelemeKuyruguEl.addEventListener('click', (e) => {
        const hizliBtn = e.target.closest('[data-hizli-sik-id]');
        if (hizliBtn) {
          const id = hizliBtn.getAttribute('data-hizli-sik-id');
          const tur = hizliBtn.getAttribute('data-hizli-sik-tur');
          const no = Number(hizliBtn.getAttribute('data-hizli-sik-no'));
          const yeniDeger = hizliBtn.getAttribute('data-hizli-sik-deger') || 'BOS';
          const kayit = durum.okumaSonuclari.find((s) => String(s.id) === String(id));
          if (kayit && no > 0) {
            const yapi = okuEtkinOmrSinavYapisi();
            const detayDizi = tur === 'dy' ? kayit.dyDetay : kayit.testDetay;
            if (Array.isArray(detayDizi)) {
              const hedef = detayDizi.find((d, idx) => Number(d.soruNo || idx + 1) === no) || detayDizi[no - 1];
              if (hedef) {
                hedef.verilen = yeniDeger;
              }
            }
            const alanEtiket = `${tur === 'dy' ? 'DY' : 'TEST'}-${no}`;
            kayit.incelemeKuyrugu = (kayit.incelemeKuyrugu || []).filter((k) => String(k.alan || '').toUpperCase() !== alanEtiket);
            if (kayit.incelemeKuyrugu.length === 0 && !kayit.kimlikEslesmeBekliyor) {
              kayit.supheliMi = false;
              kayit.ortalamaGuven = 0.99;
            }
            if (typeof C.yenidenPuanlaOkumaSonuclari === 'function') {
              durum.okumaSonuclari = C.yenidenPuanlaOkumaSonuclari(durum.okumaSonuclari, yapi);
            }
            verileriKaydet();
            guncelleOmrTabloVeKuyruk();
            guncelleMaddeAnaliziSekmesi();
          }
          return;
        }

        const btn = e.target.closest('[data-onayla-inceleme]');
        if (!btn) return;
        const id = btn.getAttribute('data-onayla-inceleme');
        const kayit = durum.okumaSonuclari.find((s) => s.id === id);
        if (kayit) {
          kayit.supheliMi = false;
          kayit.kimlikEslesmeBekliyor = false;
          kayit.numaraEslesmediMi = false;
          kayit.incelemeKuyrugu = [];
          kayit.ortalamaGuven = 0.99;
          verileriKaydet();
          guncelleOmrTabloVeKuyruk();
          guncelleMaddeAnaliziSekmesi();
        }
      });

      incelemeKuyruguEl.addEventListener('change', (e) => {
        const secEl = e.target.closest('[data-kimlik-esle-id]');
        if (!secEl || !secEl.value) return;
        const id = secEl.getAttribute('data-kimlik-esle-id');
        const secilenNo = secEl.value;
        const kayit = durum.okumaSonuclari.find((s) => String(s.id) === String(id));
        const eslesenOgr = (durum.ogrenciler || []).find((o) => String(o.ogrNo) === String(secilenNo));
        if (kayit && eslesenOgr) {
          kayit.ogrNo = eslesenOgr.ogrNo;
          kayit.adSoyad = eslesenOgr.adSoyad;
          kayit.kimlikEslesmeBekliyor = false;
          kayit.numaraEslesmediMi = false;
          if (!kayit.incelemeKuyrugu || kayit.incelemeKuyrugu.length === 0) {
            kayit.supheliMi = false;
            kayit.ortalamaGuven = 0.99;
          }
          const yapi = okuEtkinOmrSinavYapisi();
          if (typeof C.yenidenPuanlaOkumaSonuclari === 'function') {
            durum.okumaSonuclari = C.yenidenPuanlaOkumaSonuclari(durum.okumaSonuclari, yapi);
          }
          verileriKaydet();
          guncelleOmrTabloVeKuyruk();
          guncelleMaddeAnaliziSekmesi();
        }
      });
    }

    document.getElementById('btn-okumalari-temizle').addEventListener('click', () => {
      kaydetSonGeriAlYedegi('OMR Sonuçlarını Temizleme');
      durum.okumaSonuclari = [];
      verileriKaydet({ zorlaEz: true });
      guncelleOmrTabloVeKuyruk();
      guncelleMaddeAnaliziSekmesi();
    });

    // Sekme 4: Yeniden Puanla (A/B/C/D Kanonik Eşlemeli Soru İptali + Çift Şık Doğru Kabulü + Yanlış Götürme)
    const calistirYenidenPuanlamaMotoru = () => {
      const yapi = okuEtkinOmrSinavYapisi();
      if (typeof C.yenidenPuanlaOkumaSonuclari === 'function') {
        durum.okumaSonuclari = C.yenidenPuanlaOkumaSonuclari(durum.okumaSonuclari, yapi);
      }
      verileriKaydet();
      guncelleOmrTabloVeKuyruk();
      guncelleMaddeAnaliziSekmesi();
    };

    document.getElementById('btn-yeniden-puanla').addEventListener('click', calistirYenidenPuanlamaMotoru);

    const btnKarneYazdir = document.getElementById('btn-ogrenci-karne-yazdir');
    if (btnKarneYazdir) {
      btnKarneYazdir.addEventListener('click', () => {
        guncelleMaddeAnaliziSekmesi();
        const kartKarne = document.getElementById('kart-bireysel-karneler');
        if (kartKarne) {
          kartKarne.style.display = 'block';
          kartKarne.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    const btnKarneKapat = document.getElementById('btn-karne-kapat');
    if (btnKarneKapat) {
      btnKarneKapat.addEventListener('click', () => {
        const kartKarne = document.getElementById('kart-bireysel-karneler');
        if (kartKarne) kartKarne.style.display = 'none';
      });
    }

    document.getElementById('btn-csv-indir').addEventListener('click', () => {
      const temizHucre = (v) => (typeof C.temizleCsvFormulEnjeksiyon === 'function' ? C.temizleCsvFormulEnjeksiyon(String(v ?? '')) : String(v ?? ''));
      const baslik = 'OgrenciNo;AdSoyad;Kitapcik;DY_Dogru;DY_Yanlis;Test_Dogru;Test_Yanlis;Klasik_Puan;Toplam_Puan\r\n';
      const satirlar = durum.okumaSonuclari
        .map((s) => [s.ogrNo, s.adSoyad, s.grup, s.dyDogru, s.dyYanlis, s.testDogru, s.testYanlis, s.klasikToplamPuan, s.toplamPuan].map(temizHucre).join(';'))
        .join('\r\n');
      const blob = new Blob(['\ufeff' + baslik + satirlar], { type: 'text/csv;charset=utf-8' });
      const url = C.olusturGuvenliBlobUrl(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sinif_Not_Cizelgesi_${Date.now()}.csv`;
      a.click();
    });

    // Sekme 5: Öğrenci Ekleme / Silme
    document.getElementById('btn-tek-ogrenci-ekle').addEventListener('click', () => {
      const ogrNo = (document.getElementById('ogr-ekle-no').value || '').trim();
      const adSoyad = (document.getElementById('ogr-ekle-ad').value || '').trim();
      if (!ogrNo || !adSoyad) return;
      ogrenciEkleAktifDerse(ogrNo, adSoyad);
      document.getElementById('ogr-ekle-no').value = '';
      document.getElementById('ogr-ekle-ad').value = '';
      verileriKaydet();
      guncelleOgrenciListesiSekmesi();
    });

    document.getElementById('btn-toplu-ogrenci-ekle').addEventListener('click', () => {
      const ham = document.getElementById('toplu-ogrenci-metin').value || '';
      const satirlar = ham.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      for (const s of satirlar) {
        const parca = /[;\t,]/.test(s)
          ? s.split(/[;\t,]+/).map((p) => p.trim()).filter(Boolean)
          : s.split(/\s+/);
        if (parca.length >= 2) {
          const ogrNo = parca[0].replace(/^["']|["']$/g, '').trim();
          const adSoyad = parca.slice(1).join(' ').replace(/^["']|["']$/g, '').trim();
          if (ogrNo && adSoyad) ogrenciEkleAktifDerse(ogrNo, adSoyad);
        }
      }
      document.getElementById('toplu-ogrenci-metin').value = '';
      verileriKaydet();
      guncelleOgrenciListesiSekmesi();
    });

    document.getElementById('tablo-ogrenci-listesi').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sil-ogrenci]');
      if (!btn) return;
      const no = btn.getAttribute('data-sil-ogrenci');
      kaydetSonGeriAlYedegi('Öğrenci Silme');
      durum.ogrenciler = durum.ogrenciler.filter((o) => o.ogrNo !== no);
      verileriKaydet({ zorlaEz: true });
      guncelleOgrenciListesiSekmesi();
    });

    const yazdirYoklamaImzaCizelgesi = (ciktiTuru = 'yazdir') => {
      const kapsamEl = document.getElementById('baski-kapsam-sec');
      if (kapsamEl) kapsamEl.value = 'yoklama';
      guncelleKapsamPanelleri();
      guncelleA4Onizleme();
      const stüdyoSekmeBtn = document.querySelector('[data-sekme="sekme-stüdyo"]');
      if (stüdyoSekmeBtn) stüdyoSekmeBtn.click();
      setTimeout(() => {
        calistirKapsamliCikti('yoklama', ciktiTuru);
      }, 60);
    };

    document.getElementById('btn-yoklama-cizelgesi-yazdir').addEventListener('click', () => {
      yazdirYoklamaImzaCizelgesi('yazdir');
    });

    const btnYoklamaPdf = document.getElementById('btn-yoklama-cizelgesi-pdf');
    if (btnYoklamaPdf) {
      btnYoklamaPdf.addEventListener('click', () => {
        yazdirYoklamaImzaCizelgesi('pdf-indir');
      });
    }

    // 🔄 Çift Yönlü Öğrenci Listesi QR Aktarımı (Telefondan Bilgisayara & Bilgisayardan Telefona)
    const varsayilanQrTabanAdresGetir = async (mevcutInputEl) => {
      const yerelGelistirmeMi = location.protocol.startsWith('http') && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
      const mevcutDeger = mevcutInputEl && mevcutInputEl.value ? mevcutInputEl.value.trim() : '';
      if (mevcutDeger && !(yerelGelistirmeMi && mevcutDeger === 'https://sinav.axonturk.workers.dev')) {
        return mevcutDeger.replace(/\/+$/, '');
      }
      let adres = (location.protocol.startsWith('http') && !yerelGelistirmeMi)
        ? location.origin
        : (yerelGelistirmeMi ? `http://127.0.0.1:${location.port || 80}` : 'https://sinav.axonturk.workers.dev');
      if (yerelGelistirmeMi) {
        try {
          const y = await fetch('/api/ag-adresi');
          const v = await y.json();
          if (v && Array.isArray(v.adresler) && v.adresler[0]) adres = v.adresler[0];
        } catch (_) {}
      }
      if (mevcutInputEl) mevcutInputEl.value = adres;
      return adres;
    };
    varsayilanQrTabanAdresGetir(document.getElementById('ogrenci-qr-taban-adres')).then((bulunanTaban) => {
      const setupEl = document.getElementById('setup-qr-taban-adres');
      if (setupEl && (!setupEl.value || setupEl.value === 'https://sinav.axonturk.workers.dev')) {
        setupEl.value = bulunanTaban;
        guncelleA4Onizleme();
      }
    });

    const aktarOmrSonucPaketiBilgisayara = (girdiMetni, kaynakEtiket = 'Mobil OMR Paketi') => {
      if (typeof C.cozOmrSonucPaketi !== 'function') return { basarili: false, eklenenSayi: 0 };
      const yapi = okuAktifSinavYapisi();
      const cozulmus = C.cozOmrSonucPaketi(girdiMetni, {
        kayitliOgrenciler: durum.ogrenciler,
        izinliGruplar: ['A', 'B', 'C', 'D'],
        maksDy: Math.max(50, yapi.dySayisi || 0),
        maksTest: Math.max(60, yapi.testSayisi || 0)
      });
      if (!cozulmus.gecerli || !Array.isArray(cozulmus.sonuclar) || cozulmus.sonuclar.length === 0) {
        return { basarili: false, eklenenSayi: 0, hata: cozulmus.hata || 'Geçersiz OMR paketi' };
      }
      let eklenen = 0;
      cozulmus.sonuclar.forEach((s) => {
        const mevcutIdx = durum.okumaSonuclari.findIndex(
          (x) => (s.ogrNo && !s.kimlikEslesmeBekliyor && String(x.ogrNo) === String(s.ogrNo)) || String(x.id) === String(s.id)
        );
        if (mevcutIdx >= 0) {
          durum.okumaSonuclari[mevcutIdx] = Object.assign({}, durum.okumaSonuclari[mevcutIdx], s);
        } else {
          durum.okumaSonuclari.push(s);
        }
        eklenen++;
      });
      verileriKaydet();
      guncelleOmrTabloVeKuyruk();
      guncelleMaddeAnaliziSekmesi();
      sesliBipCal(true);
      return { basarili: true, eklenenSayi: eklenen, kaynak: kaynakEtiket };
    };

    const aktarOgrenciQrPaketiBilgisayara = (girdiMetni, kaynakEtiket = 'QR Paketi') => {
      const sonucEl = document.getElementById('etiket-pc-qr-aktarim-sonuc');
      const cozulmus = C.cozOgrenciQrPaketi(girdiMetni);
      if (!cozulmus.gecerli || !Array.isArray(cozulmus.ogrenciler) || cozulmus.ogrenciler.length === 0) {
        if (sonucEl) {
          sonucEl.style.color = 'var(--tehlike)';
          sonucEl.textContent = '⚠️ Geçerli bir öğrenci listesi QR paketi veya bağlantısı bulunamadı.';
        }
        return { basarili: false, eklenenSayi: 0 };
      }
      cozulmus.ogrenciler.forEach((o) => {
        ogrenciEkleAktifDerse(o.ogrNo, o.adSoyad);
      });
      verileriKaydet();
      guncelleOgrenciListesiSekmesi();
      guncelleA4Onizleme();
      const parcaBilgi = cozulmus.toplamParca > 1 ? ` (Parça ${cozulmus.parcaNo}/${cozulmus.toplamParca})` : '';
      if (sonucEl) {
        sonucEl.style.color = 'var(--basari)';
        sonucEl.textContent = `✅ ${kaynakEtiket} üzerinden ${cozulmus.ogrenciler.length} öğrenci bilgisayara (aktif derse) aktarıldı!${parcaBilgi}`;
      }
      sesliBipCal(true);
      return { basarili: true, eklenenSayi: cozulmus.ogrenciler.length, parcaNo: cozulmus.parcaNo, toplamParca: cozulmus.toplamParca };
    };

    const durdurPcQrKameraVeSenkron = () => {
      C.temizleGuvenliInterval('pc-qr-senkron');
      C.temizleGuvenliInterval('pc-qr-webcam-tara');
      if (durum.pcQrKameraStream) {
        try { durum.pcQrKameraStream.getTracks().forEach((t) => t.stop()); } catch (_) {}
        durum.pcQrKameraStream = null;
      }
      const kutuKam = document.getElementById('kutu-pc-qr-kamera');
      const btnAc = document.getElementById('btn-pc-qr-kamera-ac');
      const btnKapat = document.getElementById('btn-pc-qr-kamera-kapat');
      if (kutuKam) kutuKam.style.display = 'none';
      if (btnAc) btnAc.style.display = '';
      if (btnKapat) btnKapat.style.display = 'none';
    };

    const baslatPcEslesmeQrVeDinleme = async () => {
      if (!durum.pcQrEslesmeKodu) {
        durum.pcQrEslesmeKodu = 'PC-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      }
      const rozetKod = document.getElementById('rozet-pc-eslesme-kod');
      if (rozetKod) rozetKod.textContent = `Oturum: ${durum.pcQrEslesmeKodu}`;
      const tabanEl = document.getElementById('ogrenci-qr-taban-adres');
      const taban = await varsayilanQrTabanAdresGetir(tabanEl);
      const kisaOmrToken = await getirKisaOmurluOmrEslesmeToken(durum.pcQrEslesmeKodu || '');
      const eslesmeTokenEk = kisaOmrToken ? `&omrToken=${encodeURIComponent(kisaOmrToken)}` : '';
      const eslesmeUrl = `${taban}/optik-mobil.html#pc-aktar=${encodeURIComponent(durum.pcQrEslesmeKodu)}${eslesmeTokenEk}`;
      const eslesmeAlan = document.getElementById('alan-pc-eslesme-qr-svg');
      if (eslesmeAlan) {
        const svg = uretGercekQrSvg(eslesmeUrl, 160);
        eslesmeAlan.innerHTML = svg || '<div style="font-size:0.75rem; color:#b91c1c;">QR üretilemedi</div>';
      }

      if (location.protocol.startsWith('http')) {
        C.kaydetGuvenliInterval('pc-qr-senkron', async () => {
          const modal = document.getElementById('modal-ogrenci-qr');
          if (!modal || modal.style.display === 'none') {
            C.temizleGuvenliInterval('pc-qr-senkron');
            return;
          }
          try {
            const hocaToken = sessionStorage.getItem('hoca_token') || '';
            const yetkiBaslik = hocaToken ? { Authorization: `Bearer ${hocaToken}` } : {};
            const y = await fetch(`/api/ogrenci-qr-senkron?oturumKodu=${encodeURIComponent(durum.pcQrEslesmeKodu)}&tuket=1`, {
              headers: yetkiBaslik
            });
            if (y.ok) {
              const v = await y.json();
              if (v && v.bulundu && Array.isArray(v.ogrenciler) && v.ogrenciler.length > 0) {
                v.ogrenciler.forEach((o) => ogrenciEkleAktifDerse(o.ogrNo, o.adSoyad));
                verileriKaydet();
                guncelleOgrenciListesiSekmesi();
                guncelleA4Onizleme();
                const durumEl = document.getElementById('etiket-pc-eslesme-durum');
                if (durumEl) durumEl.textContent = `✅ Telefondan ${v.ogrenciler.length} öğrenci alındı ve kaydedildi!`;
                const sonucEl = document.getElementById('etiket-pc-qr-aktarim-sonuc');
                if (sonucEl) {
                  sonucEl.style.color = 'var(--basari)';
                  sonucEl.textContent = `✅ Telefondan ${v.ogrenciler.length} öğrenci başarıyla bilgisayara aktarıldı!`;
                }
                sesliBipCal(true);
              }
            }
            if (hocaToken) {
              const yOmr = await fetch(`/api/omr-sonuc-senkron?oturumKodu=${encodeURIComponent(durum.pcQrEslesmeKodu)}&tuket=1`, {
                headers: yetkiBaslik
              });
              if (yOmr.ok) {
                const vOmr = await yOmr.json();
                if (vOmr && vOmr.bulundu && Array.isArray(vOmr.sonuclar) && vOmr.sonuclar.length > 0) {
                  const akt = aktarOmrSonucPaketiBilgisayara({ sonuclar: vOmr.sonuclar }, 'Canlı Mobil OMR Senkronu');
                  if (akt.basarili && akt.eklenenSayi > 0) {
                    const durumEl = document.getElementById('etiket-pc-eslesme-durum');
                    if (durumEl) durumEl.textContent = `✅ Telefondan ${akt.eklenenSayi} optik okuma sonucu alındı ve kaydedildi!`;
                  }
                }
              }
            }
          } catch (_) {}
        }, 1600);
      }
    };

    const ciziOgrenciQr = () => {
      const tabanEl = document.getElementById('ogrenci-qr-taban-adres');
      const taban = (tabanEl && tabanEl.value ? tabanEl.value : 'https://sinav.axonturk.workers.dev').trim().replace(/\/+$/, '');
      const bilgi = document.getElementById('etiket-ogrenci-qr-bilgi');
      const alan = document.getElementById('alan-ogrenci-qr-svg');
      const parcaKutu = document.getElementById('kutu-ogrenci-qr-parcalar');
      const parcaEtiket = document.getElementById('etiket-ogr-qr-parca');
      const linkAc = document.getElementById('link-ogrenci-qr-dogrudan-ac');
      if (!alan || !bilgi) return;

      if (durum.ogrenciler.length === 0) {
        alan.innerHTML = '<div style="padding:1.5rem; font-size:0.8rem; color:#475569;">Aktif derste henüz öğrenci yok. Önce öğrenci ekleyin veya "💻 Telefondan Bilgisayara Aktar" sekmesini kullanın.</div>';
        bilgi.textContent = '0 öğrenci kayıtlı.';
        if (parcaKutu) parcaKutu.style.display = 'none';
        return;
      }

      const aktifDers = (typeof aktifDersiGetir === 'function' ? aktifDersiGetir() : null) || { id: durum.aktifDersId || 'genel', kod: 'DERS', ad: 'Ders' };
      const dersEtiket = aktifDers.kod ? `${aktifDers.kod} — ${aktifDers.ad || 'Ders'}` : (aktifDers.ad || 'Ders');

      const uygulaOgrQrCizim = (omrToken = '') => {
        const paket = C.uretOgrenciQrPaketi(durum.ogrenciler, {
          tabanAdres: taban,
          hedefSayfa: 'optik-mobil.html',
          maksDilimBoyutu: 25,
          dersId: aktifDers.id,
          dersKod: aktifDers.kod,
          dersAd: dersEtiket,
          omrToken
        });
        if (durum.ogrQrParcaIdx >= paket.toplamParca) durum.ogrQrParcaIdx = 0;
        const aktifParca = paket.parcalar[durum.ogrQrParcaIdx] || paket.parcalar[0];
        const qrMetni = aktifParca ? (aktifParca.url.length <= 1600 ? aktifParca.url : aktifParca.kod) : paket.tekUrl;
        const svg = uretGercekQrSvg(qrMetni, 250);

        if (linkAc && (paket.hashParam || paket.tekBase64)) {
          linkAc.href = paket.hashParam ? `optik-mobil.html${paket.hashParam}` : `optik-mobil.html#ogr=${paket.tekBase64}`;
        }
        if (parcaKutu && parcaEtiket) {
          if (paket.toplamParca > 1) {
            parcaKutu.style.display = 'flex';
            parcaEtiket.textContent = `Parça ${aktifParca.parcaNo} / ${paket.toplamParca} (${aktifParca.adet} Öğrenci)`;
          } else {
            parcaKutu.style.display = 'none';
          }
        }

        if (svg) {
          alan.innerHTML = svg;
          bilgi.textContent = paket.toplamParca > 1
            ? `${dersEtiket} · Toplam ${paket.toplamOgrenci} öğrenci ${paket.toplamParca} QR parçasına bölündü (Şu an: Parça ${aktifParca.parcaNo}/${paket.toplamParca}). Telefon kamerasıyla sırayla okutun.`
            : `✅ ${dersEtiket} dersinden ${paket.toplamOgrenci} öğrenci QR koduna işlendi. Telefon kamerasıyla okutun veya bağlantıyı kopyalayın.`;
        } else {
          alan.innerHTML = '<div style="color:#b91c1c; font-size:0.8rem; padding:1rem;">QR üretilemedi. Aşağıdaki düğmeyle bağlantıyı kopyalayın.</div>';
          bilgi.textContent = `${dersEtiket} · ${paket.toplamOgrenci} öğrenci hazır.`;
        }
      };

      const cachedOmrTok = getCachedOmrEslesmeToken();
      uygulaOgrQrCizim(cachedOmrTok);
      if (!cachedOmrTok && durum.hocaOturumAcik && (location.protocol === 'http:' || location.protocol === 'https:')) {
        getirKisaOmurluOmrEslesmeToken(aktifDers.kod || 'GENEL').then((tok) => {
          if (tok) uygulaOgrQrCizim(tok);
        }).catch(() => {});
      }
    };

    const gosterOgrenciQrModu = (mod = 'bilgisayara') => {
      const btnPc = document.getElementById('btn-qr-mod-bilgisayara');
      const btnTel = document.getElementById('btn-qr-mod-telefona');
      const panelPc = document.getElementById('panel-qr-bilgisayara');
      const panelTel = document.getElementById('panel-qr-telefona');
      const pcAktif = mod === 'bilgisayara';
      if (btnPc) btnPc.className = pcAktif ? 'btn btn-birincil btn-kucuk' : 'btn btn-kucuk';
      if (btnTel) btnTel.className = !pcAktif ? 'btn btn-birincil btn-kucuk' : 'btn btn-kucuk';
      if (panelPc) panelPc.style.display = pcAktif ? 'block' : 'none';
      if (panelTel) panelTel.style.display = !pcAktif ? 'block' : 'none';
      if (pcAktif) {
        baslatPcEslesmeQrVeDinleme();
      } else {
        ciziOgrenciQr();
      }
    };

    const acOgrenciQrModali = async (varsayilanMod = 'bilgisayara') => {
      const modal = document.getElementById('modal-ogrenci-qr');
      if (!modal) return;
      modal.style.display = 'flex';
      const tabanEl = document.getElementById('ogrenci-qr-taban-adres');
      await varsayilanQrTabanAdresGetir(tabanEl);
      gosterOgrenciQrModu(varsayilanMod);
      guncelleA4Onizleme();
    };

    const btnOgrenciBilgisayaraAktar = document.getElementById('btn-ogrenci-bilgisayara-aktar');
    if (btnOgrenciBilgisayaraAktar) {
      btnOgrenciBilgisayaraAktar.addEventListener('click', () => acOgrenciQrModali('bilgisayara'));
    }
    const btnOgrenciTelefonaAktar = document.getElementById('btn-ogrenci-telefona-aktar');
    if (btnOgrenciTelefonaAktar) {
      btnOgrenciTelefonaAktar.addEventListener('click', () => acOgrenciQrModali('telefona'));
    }
    const btnCiktiMerkeziOgrQr = document.getElementById('btn-cikti-merkezi-ogr-qr');
    if (btnCiktiMerkeziOgrQr) {
      btnCiktiMerkeziOgrQr.addEventListener('click', () => acOgrenciQrModali('bilgisayara'));
    }
    const btnSetupKutuOgrQrAc = document.getElementById('btn-setup-kutu-ogr-qr-ac');
    if (btnSetupKutuOgrQrAc) {
      btnSetupKutuOgrQrAc.addEventListener('click', () => acOgrenciQrModali('bilgisayara'));
    }

    const btnQrModBilgisayara = document.getElementById('btn-qr-mod-bilgisayara');
    if (btnQrModBilgisayara) {
      btnQrModBilgisayara.addEventListener('click', () => gosterOgrenciQrModu('bilgisayara'));
    }
    const btnQrModTelefona = document.getElementById('btn-qr-mod-telefona');
    if (btnQrModTelefona) {
      btnQrModTelefona.addEventListener('click', () => gosterOgrenciQrModu('telefona'));
    }

    const btnOgrQrOnceki = document.getElementById('btn-ogr-qr-onceki');
    if (btnOgrQrOnceki) {
      btnOgrQrOnceki.addEventListener('click', () => {
        durum.ogrQrParcaIdx = Math.max(0, (durum.ogrQrParcaIdx || 0) - 1);
        ciziOgrenciQr();
      });
    }
    const btnOgrQrSonraki = document.getElementById('btn-ogr-qr-sonraki');
    if (btnOgrQrSonraki) {
      btnOgrQrSonraki.addEventListener('click', () => {
        durum.ogrQrParcaIdx = (durum.ogrQrParcaIdx || 0) + 1;
        ciziOgrenciQr();
      });
    }

    const btnOgrQrBaglantiKopyala = document.getElementById('btn-ogrenci-qr-baglanti-kopyala');
    if (btnOgrQrBaglantiKopyala) {
      btnOgrQrBaglantiKopyala.addEventListener('click', () => {
        const tabanEl = document.getElementById('ogrenci-qr-taban-adres');
        const taban = (tabanEl && tabanEl.value ? tabanEl.value : location.origin).trim().replace(/\/+$/, '');
        const paket = C.uretOgrenciQrPaketi(durum.ogrenciler, { tabanAdres: taban, hedefSayfa: 'optik-mobil.html' });
        if (navigator.clipboard && paket.tekUrl) {
          navigator.clipboard.writeText(paket.tekUrl);
        }
        const bilgi = document.getElementById('etiket-ogrenci-qr-bilgi');
        if (bilgi) bilgi.textContent = '📋 Öğrenci listesi QR bağlantısı panoya kopyalandı.';
      });
    }

    const btnPcQrPaketAktar = document.getElementById('btn-pc-qr-paket-aktar');
    if (btnPcQrPaketAktar) {
      btnPcQrPaketAktar.addEventListener('click', () => {
        const girdiEl = document.getElementById('girdi-pc-qr-paket');
        const metin = (girdiEl && girdiEl.value ? girdiEl.value : '').trim();
        const omrPaketAdayiMi =
          metin.includes('OMR-SONUC|') ||
          metin.includes('OMR-SONUC-V1|') ||
          metin.includes('#omr-sonuc=') ||
          metin.includes('OMR_DETAYLI_SONUC_PAKETI') ||
          metin.includes('MOBIL_OMR_SONUC_PAKETI_V1') ||
          metin.includes('"okumaSonuclari"');
        if (omrPaketAdayiMi) {
          const omrSonuc = aktarOmrSonucPaketiBilgisayara(metin, 'Yapıştırılan Mobil OMR Paketi');
          const sonucEl = document.getElementById('etiket-pc-qr-aktarim-sonuc');
          if (omrSonuc.basarili) {
            if (girdiEl) girdiEl.value = '';
            if (sonucEl) {
              sonucEl.style.color = 'var(--basari)';
              sonucEl.textContent = `✅ Mobil OMR paketinden ${omrSonuc.eklenenSayi} okuma sonucu stüdyoya aktarıldı!`;
            }
            return;
          }
          if (sonucEl) {
            sonucEl.style.color = 'var(--tehlike)';
            sonucEl.textContent = '⚠️ Geçersiz veya şema dışı Mobil OMR sonuç paketi reddedildi.';
          }
          return;
        }
        const sonuc = aktarOgrenciQrPaketiBilgisayara(metin, 'Yapıştırılan QR Paketi');
        if (sonuc.basarili && girdiEl) girdiEl.value = '';
      });
    }

    // Bilgisayar Kamerası (Webcam) ile Telefondaki Öğrenci QR Kodunu Okutma
    const btnPcQrKameraAc = document.getElementById('btn-pc-qr-kamera-ac');
    const btnPcQrKameraKapat = document.getElementById('btn-pc-qr-kamera-kapat');
    if (btnPcQrKameraAc) {
      btnPcQrKameraAc.addEventListener('click', async () => {
        const sonucEl = document.getElementById('etiket-pc-qr-aktarim-sonuc');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          durum.pcQrKameraStream = stream;
          const video = document.getElementById('video-pc-qr-kamera');
          const kutu = document.getElementById('kutu-pc-qr-kamera');
          if (video) video.srcObject = stream;
          if (kutu) kutu.style.display = 'block';
          btnPcQrKameraAc.style.display = 'none';
          if (btnPcQrKameraKapat) btnPcQrKameraKapat.style.display = 'inline-flex';
          if (typeof window.BarcodeDetector === 'function') {
            const dedektor = new window.BarcodeDetector({ formats: ['qr_code'] });
            C.kaydetGuvenliInterval('pc-qr-webcam-tara', async () => {
              if (!video || video.readyState < 2) return;
              try {
                const kodlar = await dedektor.detect(video);
                if (kodlar && kodlar.length > 0 && kodlar[0].rawValue) {
                  const s = aktarOgrenciQrPaketiBilgisayara(kodlar[0].rawValue, 'Kamera QR');
                  if (s.basarili && (!s.toplamParca || s.toplamParca <= 1)) {
                    durdurPcQrKameraVeSenkron();
                  }
                }
              } catch (_) {}
            }, 450);
          } else if (sonucEl) {
            sonucEl.style.color = 'var(--uyari)';
            sonucEl.textContent = 'ℹ️ Tarayıcınızda canlı BarcodeDetector desteği kapalı; lütfen Yöntem 1 (Eşleşme QR) veya Yöntem 3 (Kodu Yapıştır) kullanın.';
          }
        } catch (err) {
          if (sonucEl) {
            sonucEl.style.color = 'var(--tehlike)';
            sonucEl.textContent = '⚠️ Bilgisayar kamerası açılamadı: ' + err.message;
          }
        }
      });
    }
    if (btnPcQrKameraKapat) {
      btnPcQrKameraKapat.addEventListener('click', () => durdurPcQrKameraVeSenkron());
    }

    const inputPcQrGorsel = document.getElementById('input-pc-qr-gorsel');
    if (inputPcQrGorsel) {
      inputPcQrGorsel.addEventListener('change', async (e) => {
        const dosya = e.target.files && e.target.files[0];
        if (!dosya) return;
        const sonucEl = document.getElementById('etiket-pc-qr-aktarim-sonuc');
        try {
          if (typeof window.BarcodeDetector === 'function') {
            const bmp = await createImageBitmap(dosya);
            const dedektor = new window.BarcodeDetector({ formats: ['qr_code'] });
            const kodlar = await dedektor.detect(bmp);
            if (kodlar && kodlar.length > 0 && kodlar[0].rawValue) {
              aktarOgrenciQrPaketiBilgisayara(kodlar[0].rawValue, 'QR Görseli');
              return;
            }
          }
          if (sonucEl) {
            sonucEl.style.color = 'var(--tehlike)';
            sonucEl.textContent = '⚠️ Görselde QR kod okunamadı. Lütfen Yöntem 1 (Eşleşme QR) veya Yöntem 3 (QR Paket Kodu Yapıştır) kullanın.';
          }
        } catch (err) {
          if (sonucEl) {
            sonucEl.style.color = 'var(--tehlike)';
            sonucEl.textContent = '⚠️ Görsel okunamadı: ' + err.message;
          }
        }
      });
    }

    document.getElementById('ogrenci-qr-taban-adres').addEventListener('input', () => {
      ciziOgrenciQr();
      baslatPcEslesmeQrVeDinleme();
      guncelleA4Onizleme();
    });
    document.getElementById('btn-modal-ogrenci-qr-kapat').addEventListener('click', () => {
      durdurPcQrKameraVeSenkron();
      document.getElementById('modal-ogrenci-qr').style.display = 'none';
    });

    // Bilgisayarda doğrudan index.html#ogr=... veya #omr-sonuc=... bağlantısı açıldıysa otomatik içeri aktar
    if (location.hash && location.hash.includes('ogr=')) {
      aktarOgrenciQrPaketiBilgisayara(location.hash, 'Doğrudan QR Bağlantısı');
    }
    if (location.hash && location.hash.includes('omr-sonuc=')) {
      aktarOmrSonucPaketiBilgisayara(location.hash, 'Mobil OMR Bağlantısı');
    }
    window.addEventListener('hashchange', () => {
      if (location.hash && location.hash.includes('ogr=')) {
        aktarOgrenciQrPaketiBilgisayara(location.hash, 'Doğrudan QR Bağlantısı');
      }
      if (location.hash && location.hash.includes('omr-sonuc=')) {
        aktarOmrSonucPaketiBilgisayara(location.hash, 'Mobil OMR Bağlantısı');
      }
    });

    // Yeni Ders Ekleme, Bologna ÖÇ Madde Girişi, Ders Silme ve Arşiv Havuzu Modali
    document.getElementById('btn-yeni-ders-modal').addEventListener('click', () => {
      const uyariEl = document.getElementById('uyari-oc-kayit-gerekli');
      if (uyariEl) uyariEl.style.display = 'none';
      const aktifDers = durum.dersler.find((d) => d.id === durum.aktifDersId) || null;
      const sb = durum.evrakSablonu || {};
      const fakEl = document.getElementById('yeni-ders-fakulte');
      const bolEl = document.getElementById('yeni-ders-bolum');
      const hocEl = document.getElementById('yeni-ders-hoca');
      if (fakEl && !fakEl.value) fakEl.value = (aktifDers && aktifDers.fakulte) || sb.fakulte || sb.kurum || '';
      if (bolEl && !bolEl.value) bolEl.value = sb.bolum || (aktifDers && aktifDers.bolum !== aktifDers.fakulte ? aktifDers.bolum : '') || '';
      if (hocEl && !hocEl.value) hocEl.value = (aktifDers && aktifDers.ogretimElemani) || sb.sorumlu || (durum.hocaHesap && durum.hocaHesap.adSoyad) || '';
      cizYeniDersOcMaddeKutulari(aktifDers && Array.isArray(aktifDers.ogrenimCiktilari) ? aktifDers.ogrenimCiktilari : []);
      const yeniKod = (document.getElementById('yeni-ders-kod') && document.getElementById('yeni-ders-kod').value) || '';
      guncelleDersVeArsivModalUI(yeniKod);
      document.getElementById('modal-yeni-ders').style.display = 'flex';
    });

    const btnOcHazir4 = document.getElementById('btn-oc-hazir-4');
    if (btnOcHazir4) {
      btnOcHazir4.addEventListener('click', () => {
        const mevcut = okuModalOcMaddeleri();
        const liste = Array.from({ length: 4 }, (_, i) => mevcut[i] || { aciklama: '' });
        cizYeniDersOcMaddeKutulari(liste);
      });
    }
    const btnOcHazir5 = document.getElementById('btn-oc-hazir-5');
    if (btnOcHazir5) {
      btnOcHazir5.addEventListener('click', () => {
        const mevcut = okuModalOcMaddeleri();
        const liste = Array.from({ length: 5 }, (_, i) => mevcut[i] || { aciklama: '' });
        cizYeniDersOcMaddeKutulari(liste);
      });
    }
    const btnOcMaddeEkle = document.getElementById('btn-oc-madde-ekle');
    if (btnOcMaddeEkle) {
      btnOcMaddeEkle.addEventListener('click', () => {
        const inputlar = Array.from(document.querySelectorAll('#kutu-yeni-ders-oc-maddeler [data-oc-madde-input]'));
        const mevcut = inputlar.map((inp) => ({ aciklama: inp.value || '' }));
        mevcut.push({ aciklama: '' });
        cizYeniDersOcMaddeKutulari(mevcut);
      });
    }
    const btnOcTemizle = document.getElementById('btn-oc-temizle');
    if (btnOcTemizle) {
      btnOcTemizle.addEventListener('click', () => {
        const topluEl = document.getElementById('yeni-ders-oc-toplu-metin');
        if (topluEl) topluEl.value = '';
        cizYeniDersOcMaddeKutulari([]);
      });
    }
    const btnOcTopluAyristir = document.getElementById('btn-oc-toplu-ayristir');
    if (btnOcTopluAyristir) {
      btnOcTopluAyristir.addEventListener('click', () => {
        const topluEl = document.getElementById('yeni-ders-oc-toplu-metin');
        const ayrilan = C.ayiklaDersOcMaddeleri((topluEl && topluEl.value) || '');
        cizYeniDersOcMaddeKutulari(ayrilan);
      });
    }
    const kutuYeniDersOcMaddeler = document.getElementById('kutu-yeni-ders-oc-maddeler');
    if (kutuYeniDersOcMaddeler) {
      kutuYeniDersOcMaddeler.addEventListener('click', (e) => {
        const silBtn = e.target.closest('[data-oc-madde-sil]');
        if (!silBtn) return;
        const silIdx = parseInt(silBtn.getAttribute('data-oc-madde-sil'), 10);
        const inputlar = Array.from(document.querySelectorAll('#kutu-yeni-ders-oc-maddeler [data-oc-madde-input]'));
        const kalan = inputlar
          .map((inp) => ({ aciklama: inp.value || '' }))
          .filter((_, idx) => idx !== silIdx);
        cizYeniDersOcMaddeKutulari(kalan);
      });
    }

    const btnAktifDersOcKaydet = document.getElementById('btn-aktif-ders-oc-kaydet');
    if (btnAktifDersOcKaydet) {
      btnAktifDersOcKaydet.addEventListener('click', () => {
        const ocMaddeleri = okuModalOcMaddeleri();
        let aktifDers = durum.dersler.find((d) => d.id === durum.aktifDersId) || durum.dersler[0] || null;
        const sb = durum.evrakSablonu || {};
        const girilenFak = (document.getElementById('yeni-ders-fakulte') && document.getElementById('yeni-ders-fakulte').value.trim()) || '';
        const girilenBol = (document.getElementById('yeni-ders-bolum') && document.getElementById('yeni-ders-bolum').value.trim()) || '';
        const girilenHoca = (document.getElementById('yeni-ders-hoca') && document.getElementById('yeni-ders-hoca').value.trim()) || '';
        if (!aktifDers) {
          const kod = (document.getElementById('yeni-ders-kod').value || 'DERS101').trim();
          const ad = (document.getElementById('yeni-ders-ad').value || 'Yeni Ders').trim();
          const fakulte = girilenFak || girilenBol || sb.fakulte || sb.kurum || '';
          const bolum = girilenFak ? girilenBol : ( /(meslek yüksekokulu|yüksekokulu|fakültesi|enstitüsü|üniversitesi|okulu|lisesi)/i.test(girilenBol) ? (sb.bolum || '') : girilenBol );
          const hoca = girilenHoca || sb.sorumlu || 'Öğretim Elemanı';
          const id = 'ders-' + Date.now();
          aktifDers = { id, kod, ad, fakulte, bolum, ogretimElemani: hoca, ogrenimCiktilari: ocMaddeleri };
          durum.dersler.push(aktifDers);
          durum.aktifDersId = id;
        } else {
          aktifDers.ogrenimCiktilari = ocMaddeleri;
          if (girilenFak) aktifDers.fakulte = girilenFak;
          if (girilenBol) aktifDers.bolum = girilenBol;
          if (girilenHoca) aktifDers.ogretimElemani = girilenHoca;
        }
        const uyariEl = document.getElementById('uyari-oc-kayit-gerekli');
        if (uyariEl) uyariEl.style.display = 'none';
        document.getElementById('modal-yeni-ders').style.display = 'none';
        verileriKaydet();
        doldurDersSecici();
        guncelleA4Onizleme();
        guncelleSoruBankasiTablosu();
      });
    }

    const btnAktifDersiSil = document.getElementById('btn-aktif-dersi-sil');
    if (btnAktifDersiSil) {
      btnAktifDersiSil.addEventListener('click', () => {
        silDersiVeArsivle(durum.aktifDersId);
      });
    }
    const yeniDersKodInput = document.getElementById('yeni-ders-kod');
    if (yeniDersKodInput) {
      yeniDersKodInput.addEventListener('input', (e) => {
        guncelleDersVeArsivModalUI(e.target.value);
      });
    }
    const kutuMevcutDersler = document.getElementById('kutu-mevcut-dersler-yonetim');
    if (kutuMevcutDersler) {
      kutuMevcutDersler.addEventListener('click', (e) => {
        const ocDuzenleBtn = e.target.closest('[data-duzenle-ders-oc]');
        if (ocDuzenleBtn) {
          const dId = ocDuzenleBtn.getAttribute('data-duzenle-ders-oc');
          durum.aktifDersId = dId;
          doldurDersSecici();
          acDersOcKayitModali(false, dId);
          return;
        }
        const silBtn = e.target.closest('[data-sil-ders-id]');
        if (!silBtn) return;
        silDersiVeArsivle(silBtn.getAttribute('data-sil-ders-id'));
      });
    }
    const btnArsivAktifDerseAktar = document.getElementById('btn-arsiv-aktif-derse-aktar');
    if (btnArsivAktifDerseAktar) {
      btnArsivAktifDerseAktar.addEventListener('click', () => {
        const seciliIdler = Array.from(document.querySelectorAll('[data-arsiv-sec]:checked'))
          .map((cb) => cb.getAttribute('data-arsiv-sec'))
          .filter(Boolean);
        if (seciliIdler.length === 0) return;
        dahilEtArsivHavuzlarini(seciliIdler, durum.aktifDersId);
      });
    }
    document.getElementById('btn-modal-ders-kapat').addEventListener('click', () => {
      document.getElementById('modal-yeni-ders').style.display = 'none';
    });
    document.getElementById('btn-yeni-ders-kaydet').addEventListener('click', () => {
      const sb = durum.evrakSablonu || {};
      const kod = (document.getElementById('yeni-ders-kod').value || 'DERS101').trim();
      const ad = (document.getElementById('yeni-ders-ad').value || 'Yeni Ders').trim();
      const girilenFak = (document.getElementById('yeni-ders-fakulte') && document.getElementById('yeni-ders-fakulte').value.trim()) || '';
      const girilenBol = (document.getElementById('yeni-ders-bolum') && document.getElementById('yeni-ders-bolum').value.trim()) || '';
      const hoca = (document.getElementById('yeni-ders-hoca') && document.getElementById('yeni-ders-hoca').value.trim()) || sb.sorumlu || 'Öğretim Elemanı';

      // Eğer kullanıcı yalnız tek kutuya ("yeni-ders-bolum") okul/MYO adını yazdıysa onu üst başlık (fakulte) yap
      const tekAlanOkulMu = !girilenFak && girilenBol && /(meslek yüksekokulu|yüksekokulu|fakültesi|enstitüsü|üniversitesi|okulu|lisesi|\bmyo\b)/i.test(girilenBol);
      const fakulte = girilenFak || (tekAlanOkulMu ? girilenBol : (sb.fakulte || sb.kurum || girilenBol || ''));
      const bolum = girilenFak ? girilenBol : (tekAlanOkulMu ? (sb.bolum || '') : girilenBol);

      if (fakulte) durum.evrakSablonu.fakulte = fakulte;
      if (fakulte) durum.evrakSablonu.kurum = fakulte;
      if (bolum) durum.evrakSablonu.bolum = bolum;
      if (hoca) durum.evrakSablonu.sorumlu = hoca;

      const ogrenimCiktilari = okuModalOcMaddeleri();
      const mevcutEslesenDers = durum.dersler.find(
        (d) =>
          d &&
          String(d.kod || '').trim().toUpperCase() === kod.toUpperCase() &&
          String(d.ad || '').trim().toLocaleLowerCase('tr-TR') === ad.toLocaleLowerCase('tr-TR')
      );
      let hedefId = '';
      if (mevcutEslesenDers) {
        mevcutEslesenDers.fakulte = fakulte;
        mevcutEslesenDers.bolum = bolum;
        mevcutEslesenDers.ogretimElemani = hoca;
        if (ogrenimCiktilari.length > 0) {
          mevcutEslesenDers.ogrenimCiktilari = ogrenimCiktilari;
        }
        hedefId = mevcutEslesenDers.id;
      } else {
        hedefId = 'ders-' + Date.now();
        durum.dersler.push({ id: hedefId, kod, ad, fakulte, bolum, ogretimElemani: hoca, ogrenimCiktilari });
      }
      durum.aktifDersId = hedefId;

      // Seçili arşiv soru havuzları varsa hedef derse dahil et
      const seciliArsivIdler = Array.from(document.querySelectorAll('[data-arsiv-sec]:checked'))
        .map((cb) => cb.getAttribute('data-arsiv-sec'))
        .filter(Boolean);
      if (seciliArsivIdler.length > 0) {
        const aktarim = C.dahilEtArsivSorulariniDerse(durum.sorular, durum.arsivDersler, seciliArsivIdler, hedefId);
        durum.sorular = aktarim.sorular;
        durum.arsivDersler = aktarim.arsivDersler;
      }

      const uyariEl = document.getElementById('uyari-oc-kayit-gerekli');
      if (uyariEl) uyariEl.style.display = 'none';
      guncelleOgrenciListesiSekmesi();
      document.getElementById('modal-yeni-ders').style.display = 'none';
      verileriKaydet();
      doldurDersSecici();
      guncelleA4Onizleme();
      guncelleSoruBankasiTablosu();
    });

    // Yedek İndir / Yükle (Şema Doğrulamalı + Arşiv, Şablon, Kayıtlı Sınavlar ve Online Sınav Listesi Dahil)
    document.getElementById('btn-yedek-indir').addEventListener('click', () => {
      kaydetAktifDersIzoleDurumu(durum.aktifDersId);
      const blob = new Blob([JSON.stringify({
        dersler: durum.dersler,
        arsivDersler: durum.arsivDersler,
        aktifDersId: durum.aktifDersId,
        sorular: durum.sorular,
        ogrenciler: durum.ogrenciKayitlari,
        salonlar: durum.salonlar,
        dagitimModu: durum.dagitimModu,
        evrakSablonu: durum.evrakSablonu,
        kurumsalSablonlar: durum.kurumsalSablonlar,
        onlineSinavListesi: durum.onlineSinavListesi,
        kayitliSinavlar: durum.kayitliSinavlar || [],
        aktifKayitliSinavId: durum.aktifKayitliSinavId || '',
        dersTaslakSinavlari: durum.dersTaslakSinavlari || {},
        salonlarHaritasi: durum.salonlarHaritasi || {},
        okumaSonuclariHaritasi: durum.okumaSonuclariHaritasi || {},
        okumaSonuclari: durum.okumaSonuclari.map(okumaSonucunuHafifletir)
      }, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = C.olusturGuvenliBlobUrl(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sinav_Optik_Yedek_${Date.now()}.json`;
      a.click();
    });

    document.getElementById('input-yedek-yukle').addEventListener('change', (e) => {
      const dosya = e.target.files && e.target.files[0];
      if (!dosya) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const ham = JSON.parse(String(reader.result));
          const temiz = C.semaDogrulaVeTemizle(ham);
          kaydetSonGeriAlYedegi('JSON Yedek Geri Yükleme');
          uygulaYuklenenDurumNesnesi(temiz);
          yukleAktifDersIzoleDurumu(durum.aktifDersId);
          verileriKaydet({ zorlaEz: true, mesaj: `🟢 JSON yedek dosyası başarıyla geri yüklendi · ${saatMetniUret()}` });
          yenileTumSekmePanelleriUI();
        } catch (err) {
          guncelleKayitDurumCubuguUI('hata', '⚠️ Yedek dosyası güvenlik/şema doğrulamasından geçemedi: ' + err.message);
        }
      };
      reader.readAsText(dosya);
    });

    // Kiosk / Online Sınav Tanımlama ve Yönetim Kontrolleri
    const btnOnlineStudyodanAl = document.getElementById('btn-online-studyodan-al');
    if (btnOnlineStudyodanAl) {
      btnOnlineStudyodanAl.addEventListener('click', () => {
        const yapi = okuAktifSinavYapisi();
        if (document.getElementById('online-dy-sayisi')) document.getElementById('online-dy-sayisi').value = String(yapi.dySayisi);
        if (document.getElementById('online-test-sayisi')) document.getElementById('online-test-sayisi').value = String(yapi.testSayisi);
        if (document.getElementById('online-klasik-sayisi')) document.getElementById('online-klasik-sayisi').value = String(yapi.klasikSayisi);
      });
    }

    const btnOnlineTanimlaKaydet = document.getElementById('btn-online-tanimla-kaydet');
    if (btnOnlineTanimlaKaydet) {
      btnOnlineTanimlaKaydet.addEventListener('click', async () => {
        const form = okuOnlineSinavFormunu();
        const mevcutIdx = durum.onlineSinavListesi.findIndex((x) => x.sinavId === form.sinavId);
        const mevcutOturumlar = mevcutIdx >= 0 ? (durum.onlineSinavListesi[mevcutIdx].oturumlar || []) : (durum.onlineSinav.oturumlar || []);
        const kayit = {
          ...form,
          aktif: mevcutIdx >= 0 ? Boolean(durum.onlineSinavListesi[mevcutIdx].aktif) : Boolean(durum.onlineSinav.aktif),
          oturumlar: mevcutOturumlar
        };
        if (mevcutIdx >= 0) durum.onlineSinavListesi[mevcutIdx] = kayit;
        else durum.onlineSinavListesi.unshift(kayit);
        durum.onlineSinav = { ...kayit };
        const kodInp = document.getElementById('online-sinav-kodu');
        if (kodInp && !kodInp.value.trim()) kodInp.value = kayit.sinavId;
        verileriKaydet();
        await senkronizeOnlineSinavSunucu(durum.onlineSinav);
        guncelleOnlineSinavSekmesiUI();
      });
    }

    const guncelSimdiTarihSaatFormatla = (ms) => {
      const d = new Date(ms);
      const iki = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}T${iki(d.getHours())}:${iki(d.getMinutes())}`;
    };

    document.getElementById('btn-online-baslat').addEventListener('click', async () => {
      const form = okuOnlineSinavFormunu();
      const simdiMs = Date.now();
      if (!form.baslangic || Date.parse(form.baslangic) > simdiMs) {
        form.baslangic = guncelSimdiTarihSaatFormatla(simdiMs - 60000);
        const basInp = document.getElementById('online-baslangic');
        if (basInp) basInp.value = form.baslangic;
      }
      if (!form.bitis || Date.parse(form.bitis) <= simdiMs + 60000) {
        form.bitis = guncelSimdiTarihSaatFormatla(simdiMs + Math.max(60, Number(form.sureDk) || 40) * 60000);
        const bitInp = document.getElementById('online-bitis');
        if (bitInp) bitInp.value = form.bitis;
      }
      const mevcutIdx = durum.onlineSinavListesi.findIndex((x) => x.sinavId === form.sinavId);
      const mevcutOturumlar = mevcutIdx >= 0 ? (durum.onlineSinavListesi[mevcutIdx].oturumlar || []) : (durum.onlineSinav.oturumlar || []);
      durum.onlineSinavListesi.forEach((x) => { x.aktif = false; });
      const kayit = { ...form, aktif: true, oturumlar: mevcutOturumlar };
      if (mevcutIdx >= 0) durum.onlineSinavListesi[mevcutIdx] = kayit;
      else durum.onlineSinavListesi.unshift(kayit);
      durum.onlineSinav = { ...kayit };
      const kodInp = document.getElementById('online-sinav-kodu');
      if (kodInp && !kodInp.value.trim()) kodInp.value = kayit.sinavId;
      verileriKaydet();
      await senkronizeOnlineSinavSunucu(durum.onlineSinav);
      guncelleOnlineSinavSekmesiUI();
    });

    document.getElementById('btn-online-durdur').addEventListener('click', async () => {
      durum.onlineSinav.aktif = false;
      const idx = durum.onlineSinavListesi.findIndex((x) => x.sinavId === durum.onlineSinav.sinavId);
      if (idx >= 0) durum.onlineSinavListesi[idx].aktif = false;
      verileriKaydet();
      await senkronizeOnlineSinavSunucu(durum.onlineSinav);
      guncelleOnlineSinavSekmesiUI();
    });

    const btnOnlineKioskAc = document.getElementById('btn-online-kiosk-ac');
    if (btnOnlineKioskAc) {
      btnOnlineKioskAc.addEventListener('click', () => {
        yukleSunucuAktifOnlineSinavDurumu();
        guncelleKioskOgrenciSinavListesiUI();
        document.getElementById('ana-icerik-alani').style.display = 'none';
        document.getElementById('kiosk-sinav-alani').style.display = 'block';
      });
    }

    const tabloTanimliOnline = document.getElementById('tablo-tanimli-online-sinavlar');
    if (tabloTanimliOnline) {
      tabloTanimliOnline.addEventListener('click', async (e) => {
        const baslatBtn = e.target.closest('[data-online-sec-baslat]');
        if (baslatBtn) {
          const id = baslatBtn.getAttribute('data-online-sec-baslat');
          const secili = durum.onlineSinavListesi.find((x) => x.sinavId === id);
          if (secili) {
            const yeniAktif = !secili.aktif;
            durum.onlineSinavListesi.forEach((x) => { x.aktif = false; });
            secili.aktif = yeniAktif;
            durum.onlineSinav = { ...secili };
            verileriKaydet();
            await senkronizeOnlineSinavSunucu(durum.onlineSinav);
            guncelleOnlineSinavSekmesiUI();
          }
          return;
        }
        const yukleBtn = e.target.closest('[data-online-sec-yukle]');
        if (yukleBtn) {
          const id = yukleBtn.getAttribute('data-online-sec-yukle');
          const secili = durum.onlineSinavListesi.find((x) => x.sinavId === id);
          if (secili) {
            durum.onlineSinav = { ...secili };
            verileriKaydet();
            guncelleOnlineSinavSekmesiUI();
          }
          return;
        }
        const silBtn = e.target.closest('[data-online-sec-sil]');
        if (silBtn) {
          const id = silBtn.getAttribute('data-online-sec-sil');
          const silinecek = durum.onlineSinavListesi.find((x) => x.sinavId === id);
          if (!silinecek) return;
          const aktifMiSilinen = Boolean(silinecek.aktif);
          const onay = window.confirm(`"${id}" sınav tanımı silinsin mi?${aktifMiSilinen ? '\n\nBu sınav şu anda AKTİF: silinirse sınav durdurulur.' : ''}`);
          if (!onay) return;
          kaydetSonGeriAlYedegi('Online Sınav Silme');
          durum.onlineSinavListesi = durum.onlineSinavListesi.filter((x) => x.sinavId !== id);
          if (aktifMiSilinen) {
            await senkronizeOnlineSinavSunucu({ ...silinecek, aktif: false });
          }
          if (durum.onlineSinav.sinavId === id) {
            durum.onlineSinav = durum.onlineSinavListesi.length > 0 ? { ...durum.onlineSinavListesi[0] } : bosOnlineSinavTanimi();
          }
          const kodInp = document.getElementById('online-sinav-kodu');
          if (kodInp && kodInp.value.trim() === id) {
            kodInp.value = durum.onlineSinavListesi.length > 0 ? durum.onlineSinav.sinavId : '';
          }
          verileriKaydet({ zorlaEz: true, silmeOnayi: true });
          guncelleOnlineSinavSekmesiUI();
          const bilgi = document.getElementById('etiket-online-tanim-bilgi');
          if (bilgi) bilgi.textContent = `🗑️ "${id}" silindi.`;
        }
      });
    }

    const btnOnlineSonucAktar = document.getElementById('btn-online-sonuc-aktar');
    if (btnOnlineSonucAktar) {
      btnOnlineSonucAktar.addEventListener('click', () => {
        const oturumlar = durum.onlineSinav.oturumlar || [];
        if (oturumlar.length === 0) return;
        oturumlar.forEach((ot) => {
          const mIdx = durum.okumaSonuclari.findIndex((s) => s.ogrNo === ot.ogrNo);
          const mevcut = mIdx >= 0 ? durum.okumaSonuclari[mIdx] : null;
          const kayit = {
            id: (mevcut && mevcut.id) ? mevcut.id : ('ONL-' + ot.ogrNo + '-' + Date.now()),
            ogrNo: ot.ogrNo,
            okunanNoKod: String(ot.ogrNo).slice(-2),
            adSoyad: ot.adSoyad,
            grup: (mevcut && mevcut.grup) ? mevcut.grup : 'ONL',
            dyDogru: (mevcut && Number.isFinite(mevcut.dyDogru)) ? mevcut.dyDogru : (ot.dyDogru || 0),
            dyYanlis: (mevcut && Number.isFinite(mevcut.dyYanlis)) ? mevcut.dyYanlis : (ot.dyYanlis || 0),
            dyBos: (mevcut && Number.isFinite(mevcut.dyBos)) ? mevcut.dyBos : (ot.dyBos || 0),
            dyNet: (mevcut && Number.isFinite(mevcut.dyNet)) ? mevcut.dyNet : (ot.dyDogru || 0),
            testDogru: (mevcut && Number.isFinite(mevcut.testDogru)) ? mevcut.testDogru : (ot.testDogru || 0),
            testYanlis: (mevcut && Number.isFinite(mevcut.testYanlis)) ? mevcut.testYanlis : (ot.testYanlis || 0),
            testBos: (mevcut && Number.isFinite(mevcut.testBos)) ? mevcut.testBos : (ot.testBos || 0),
            testNet: (mevcut && Number.isFinite(mevcut.testNet)) ? mevcut.testNet : (ot.testDogru || 0),
            klasikToplamPuan: (mevcut && Number.isFinite(mevcut.klasikToplamPuan)) ? mevcut.klasikToplamPuan : 0,
            toplamPuan: ot.puan || (mevcut ? mevcut.toplamPuan : 0) || 0,
            ortalamaGuven: 1,
            supheliMi: false,
            incelemeKuyrugu: [],
            dyDetay: (mevcut && Array.isArray(mevcut.dyDetay) && mevcut.dyDetay.length > 0)
              ? mevcut.dyDetay
              : (Array.isArray(ot.dyDetay) ? ot.dyDetay : []),
            testDetay: (mevcut && Array.isArray(mevcut.testDetay) && mevcut.testDetay.length > 0)
              ? mevcut.testDetay
              : (Array.isArray(ot.testDetay) ? ot.testDetay : []),
            klasikDetay: (mevcut && Array.isArray(mevcut.klasikDetay) && mevcut.klasikDetay.length > 0) ? mevcut.klasikDetay : []
          };
          if (mIdx >= 0) durum.okumaSonuclari[mIdx] = kayit;
          else durum.okumaSonuclari.unshift(kayit);
        });
        verileriKaydet();
        guncelleOmrTabloVeKuyruk();
        guncelleMaddeAnaliziSekmesi();
      });
    }

    sorgulaIstemciIpBilgisi();
    uretCihazDonanimParmakIzi();

    document.getElementById('btn-kiosk-ogrenci-modu').addEventListener('click', () => {
      yukleSunucuAktifOnlineSinavDurumu();
      guncelleKioskOgrenciSinavListesiUI();
      document.getElementById('modal-hoca-giris').style.display = 'none';
      document.getElementById('ana-icerik-alani').style.display = 'none';
      document.getElementById('kiosk-sinav-alani').style.display = 'block';
    });

    const kioskOgrNoInput = document.getElementById('kiosk-ogr-no');
    if (kioskOgrNoInput) {
      kioskOgrNoInput.addEventListener('input', () => {
        guncelleKioskOgrenciSinavListesiUI();
      });
    }
    const kioskSinavListesiEl = document.getElementById('kiosk-ogrenci-sinav-listesi');
    if (kioskSinavListesiEl) {
      kioskSinavListesiEl.addEventListener('change', () => {
        guncelleKioskOgrenciSinavListesiUI();
      });
    }

    document.getElementById('btn-kiosk-cikis').addEventListener('click', () => {
      if (durum.kioskOturum) return;
      C.temizleGuvenliInterval('kiosk-sayac');
      document.body.classList.remove('kiosk-aktif');
      document.getElementById('kiosk-sinav-alani').style.display = 'none';
      const anaAlani = document.getElementById('ana-icerik-alani');
      const ustNav = document.getElementById('ust-sekme-nav');
      anaAlani.style.display = 'block';
      if (!durum.hocaOturumAcik) {
        anaAlani.style.filter = 'blur(8px)';
        anaAlani.style.pointerEvents = 'none';
        anaAlani.style.userSelect = 'none';
        anaAlani.inert = true;
        anaAlani.setAttribute('inert', '');
        if (ustNav) { ustNav.inert = true; ustNav.setAttribute('inert', ''); }
        document.getElementById('modal-hoca-giris').style.display = 'flex';
      }
    });

    document.getElementById('btn-kiosk-oturum-baslat').addEventListener('click', baslatKioskOgrenciOturumu);

    document.getElementById('btn-kiosk-cevap-kilitle').addEventListener('click', async () => {
      const ot = durum.kioskOturum;
      if (!ot) return;
      const btnKilitle = document.getElementById('btn-kiosk-cevap-kilitle');
      const s = ot.sorular[ot.aktifSoruIdx];
      let verilenDeger = null;
      if (s && s.tur === 'klasik') {
        const kl = document.getElementById('kiosk-klasik-cevap');
        verilenDeger = kl ? kl.value.trim() : '';
      } else {
        const secili = document.querySelector('input[name="kiosk-secim"]:checked');
        verilenDeger = secili ? secili.value : null;
      }

      // HTTP / HTTPS modunda SIFIR İYİMSER İLERLEME: Yanıt önce sunucuya doğrulatılır; 401/403'te token silinir ve girişe dönülür!
      if ((location.protocol === 'http:' || location.protocol === 'https:') && s) {
        const token = sessionStorage.getItem('kiosk_token') || '';
        if (btnKilitle) btnKilitle.disabled = true;
        try {
          const yanitSozu = fetch('/api/ogrenci-cevap', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              token,
              ogrNo: ot.ogrNo,
              soruId: s.id || `S-${ot.aktifSoruIdx + 1}`,
              secim: verilenDeger || ''
            })
          });
          ot.__sonCevapSozu = yanitSozu;
          const yanit = await yanitSozu;
          let veri = null;
          try { veri = await yanit.json(); } catch (_) {}

          if (yanit.status === 401 || yanit.status === 403) {
            if (btnKilitle) btnKilitle.disabled = false;
            C.temizleGuvenliInterval('kiosk-sayac');
            sessionStorage.removeItem('kiosk_token');
            sessionStorage.removeItem('AKTIF_KIOSK_OTURUM_V1');
            durum.kioskOturum = null;
            document.getElementById('kiosk-soru-sahne').style.display = 'none';
            document.getElementById('kiosk-giris-formu').style.display = 'block';
            document.body.classList.remove('kiosk-aktif');
            const hataKutu = document.getElementById('kiosk-hata-kutu');
            if (hataKutu) {
              hataKutu.textContent = (veri && veri.hata)
                || 'Sınav oturum yetkiniz geçersiz veya yeni sınav tanımlandığı için sonlandırıldı (401/403).';
              hataKutu.hidden = false;
            }
            return;
          }

          if (!yanit.ok) {
            if (btnKilitle) btnKilitle.disabled = false;
            const uyariKutu = document.getElementById('kiosk-ihlal-uyari-kutusu');
            if (uyariKutu) {
              uyariKutu.textContent = (veri && veri.hata)
                || `⚠️ Sunucu yanıtı kaydedemedi (HTTP ${yanit.status}). Cevabınız kaybolmadı; lütfen tekrar kilitlemeyi deneyiniz.`;
              uyariKutu.hidden = false;
              uyariKutu.style.display = 'block';
            }
            return;
          }
        } catch (_) {
          if (btnKilitle) btnKilitle.disabled = false;
          const uyariKutu = document.getElementById('kiosk-ihlal-uyari-kutusu');
          if (uyariKutu) {
            uyariKutu.textContent = '⚠️ Sunucuya ulaşılamadığı için cevap kaydedilemedi (503 / Ağ Hatası). Lütfen tekrar deneyiniz.';
            uyariKutu.hidden = false;
            uyariKutu.style.display = 'block';
          }
          return;
        }
        if (btnKilitle) btnKilitle.disabled = false;
      }

      ot.cevaplar.push(verilenDeger);
      const ispatDetay = s
        ? `ÖÇ: ${s.ocKodu || 'ÖÇ-1'}, Orijinal Doğru: ${s.orijinalDogruHarf || s.dogruHarf || s.dogruDY || '-'} -> Öğrenci Ekranındaki Doğru: ${s.dogruHarf || s.dogruDY || '-'}${s.dogruSikDegeri ? ` ("${s.dogruSikDegeri}")` : ''}`
        : '';
      ekleKioskDelilLog(
        'CEVAP_KILITLENDI',
        `${ot.aktifSoruIdx + 1}. soru yanıtlandı ve geri dönüşsüz kilitlendi (Soru ID: ${(s && s.id) || '-'}, Tür: ${(s && s.tur) || '-'}, Verilen Yanıt: ${verilenDeger || 'BOŞ'}${ispatDetay ? `, ${ispatDetay}` : ''}).`
      );
      ot.aktifSoruIdx++;
      kaydetAktifKioskOturumYerel();
      gosterKioskAktifSoru();
    });

    // 5 Katmanlı Tam Karantina (Sert Kiosk) ve Delil Niteliğinde İhlal Yakalayıcı
    const kaydetKioskIhlal = (
      olayTuru = 'IHLAL_SEKME_UYGULAMA',
      aciklama = 'Öğrenci sınav ekranından ayrıldı (sekme/uygulama değişimi).',
      perdeAcilsinMi = false,
      perdeMesaji = ''
    ) => {
      const ot = durum.kioskOturum;
      if (!ot || ot.bitirmeSuruyor || ot.teslimOnaylandi || ot.kioskKasitliCikis) return;
      ot.ihlalSayisi++;
      const sayacEl = document.getElementById('kiosk-ihlal-sayac');
      if (sayacEl) sayacEl.textContent = `Sekme İhlali: ${ot.ihlalSayisi}`;

      const logKaydi = ekleKioskDelilLog(olayTuru, aciklama);

      const uyariKutu = document.getElementById('kiosk-ihlal-uyari-kutusu');
      if (uyariKutu) {
        const sinirBilgi = ot.maksIhlal > 0 ? `${ot.ihlalSayisi} / ${ot.maksIhlal}` : `${ot.ihlalSayisi}`;
        uyariKutu.textContent = `🚨 KİOSK GÜVENLİK İHLALİ KAYDEDİLDİ (${sinirBilgi}): ${aciklama} [Delil Mühür: #${(logKaydi && logKaydi.olayHash ? logKaydi.olayHash.slice(0, 10) : 'KAYIT')}]`;
        uyariKutu.hidden = false;
        uyariKutu.style.display = 'block';
      }

      if (perdeAcilsinMi && perdeMesaji) {
        gosterKioskKarantinaPerdesi(perdeMesaji);
      }

      if (ot.maksIhlal > 0 && ot.ihlalSayisi >= ot.maksIhlal) {
        bitirKioskOturumu(`Sekme İhlali Sınırı Aşıldı (${olayTuru})`);
      }
    };

    // Katman 1: Sekme / Mobil Uygulama Değiştirme (visibilitychange) ve Odak Kaybı (blur)
    document.addEventListener('visibilitychange', () => {
      const ot = durum.kioskOturum;
      if (document.hidden && ot && !ot.bitirmeSuruyor && !ot.teslimOnaylandi && !ot.kioskKasitliCikis) {
        ot.sonVisibilityIhlalMs = Date.now();
        kaydetKioskIhlal(
          'IHLAL_SEKME_UYGULAMA',
          'Öğrenci başka bir tarayıcı sekmesine veya mobil uygulamaya geçti (visibilitychange: hidden).'
        );
      }
    });

    window.addEventListener('blur', () => {
      const ot = durum.kioskOturum;
      if (ot && !ot.bitirmeSuruyor && !ot.teslimOnaylandi && !ot.kioskKasitliCikis) {
        if (ot.sonVisibilityIhlalMs && Date.now() - ot.sonVisibilityIhlalMs < 80) {
          return;
        }
        // Yalnızca dokunmatik (coarse pointer) cihazlarda sanal klavye açılış/kapanışını yumuşat; masaüstünde anında ihlal işle
        const dokunmatikMi = Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        const aktifEl = document.activeElement;
        if (dokunmatikMi && aktifEl && (aktifEl.tagName === 'INPUT' || aktifEl.tagName === 'TEXTAREA')) {
          return;
        }
        kaydetKioskIhlal(
          'IHLAL_ODAK_KAYBI',
          'Sınav penceresi odağını kaybetti / arka plana düştü veya başka pencere seçildi (window.blur).'
        );
      }
    });

    window.addEventListener('storage', (ev) => {
      if (!ev || ev.key !== 'SINAV_KIOSK_AKTIF_KARANTINA_V1' || !ev.newValue) return;
      const ot = durum.kioskOturum;
      if (!ot || ot.bitirmeSuruyor || ot.teslimOnaylandi || ot.kioskKasitliCikis) return;
      try {
        const karantina = JSON.parse(ev.newValue);
        if (karantina && karantina.sekmeId && karantina.sekmeId !== durum.sekmeId) {
          kaydetKioskIhlal(
            'IHLAL_COKLU_SEKME',
            'Sınav sırasında başka bir tarayıcı sekmesi / penceresi açıldığı tespit edildi (localStorage karantina).'
          );
        }
      } catch (_) {}
    });

    // Katman 2: Zorunlu Tam Ekran (Fullscreen) Çıkış Kilidi ve Karantina Perdesi
    document.addEventListener('fullscreenchange', () => {
      const ot = durum.kioskOturum;
      if (!ot || ot.bitirmeSuruyor || ot.teslimOnaylandi || ot.kioskKasitliCikis) return;
      if (document.fullscreenElement) {
        ot.tamEkranAktifOldu = true;
        gizleKioskKarantinaPerdesi();
      } else if (ot.tamEkranAktifOldu && ot.tamEkranZorunlu) {
        kaydetKioskIhlal(
          'IHLAL_TAM_EKRAN_CIKIS',
          'Öğrenci zorunlu Tam Ekran (Fullscreen) Kiosk kilidinden çıktı (ESC / sistem hareketi).',
          true,
          'Tam ekran Kiosk kilidinden çıktığınız tespit edildi ve delil loguna işlendi. Soruyu görmek için tam ekrana dönün.'
        );
      }
    });

    const btnTamEkranDon = document.getElementById('btn-kiosk-tam-ekran-don');
    if (btnTamEkranDon) {
      btnTamEkranDon.addEventListener('click', () => {
        if (document.documentElement && document.documentElement.requestFullscreen) {
          document.documentElement
            .requestFullscreen()
            .then(() => {
              if (durum.kioskOturum) durum.kioskOturum.tamEkranAktifOldu = true;
              gizleKioskKarantinaPerdesi();
            })
            .catch(() => {
              gizleKioskKarantinaPerdesi();
            });
        } else {
          gizleKioskKarantinaPerdesi();
        }
      });
    }

    // Katman 3: Mobil / Masaüstü Ekran Bölme (Split-Screen / Yüzen Pencere) Algılama
    window.addEventListener('resize', () => {
      const ot = durum.kioskOturum;
      if (!ot) return;
      const aktifAlanEl = document.activeElement;
      const metinGirisiMi = aktifAlanEl && (aktifAlanEl.tagName === 'TEXTAREA' || aktifAlanEl.tagName === 'INPUT');
      const genOran = (window.innerWidth || 1024) / Math.max(1, ot.baslangicGenislik || 1024);
      const yukOran = (window.innerHeight || 768) / Math.max(1, ot.baslangicYukseklik || 768);
      if (genOran < 0.68 || (!metinGirisiMi && yukOran < 0.62)) {
        const perdeMesaji = 'Ekran bölme (Split-Screen / Yüzen Pencere) tespit edildi! Devam etmek için sınav penceresini tam boyuta getirin.';
        if (!ot.ekranBolmeDurumunda) {
          ot.ekranBolmeDurumunda = true;
          kaydetKioskIhlal(
            'IHLAL_EKRAN_BOLME',
            `Ekran bölme (Split-Screen) veya yüzen pencere tespit edildi (Güncel: ${window.innerWidth}x${window.innerHeight}, Başlangıç: ${ot.baslangicGenislik}x${ot.baslangicYukseklik}).`,
            true,
            perdeMesaji
          );
        } else {
          gosterKioskKarantinaPerdesi(perdeMesaji);
        }
      } else {
        ot.ekranBolmeDurumunda = false;
        if (!ot.tamEkranZorunlu || !ot.tamEkranAktifOldu || document.fullscreenElement) {
          gizleKioskKarantinaPerdesi();
        }
      }
    });

    // Katman 4: Kopyala / Kes / Yapıştır / Sağ Tık ve Geliştirici Kısayolları Kilidi
    const kioskSinavAlaniEl = document.getElementById('kiosk-sinav-alani');
    if (kioskSinavAlaniEl) {
      ['copy', 'cut', 'paste', 'contextmenu'].forEach((olayAdi) => {
        kioskSinavAlaniEl.addEventListener(olayAdi, (e) => {
          if (!durum.kioskOturum) return;
          const klavyeAlanindaMi = Boolean(e.target && e.target.closest && e.target.closest('textarea'));
          // Açık uçlu <textarea> içinde öğrencinin kendi yazdığı cümleyi düzenlerken copy/cut yapması ihlal sayılmaz; paste ve contextmenu engellenir
          if (klavyeAlanindaMi && (olayAdi === 'copy' || olayAdi === 'cut')) return;
          e.preventDefault();
          kaydetKioskIhlal(
            'IHLAL_KOPYALA_SAG_TIK',
            `Sınav esnasında yasaklı işlem engellendi (${olayAdi.toUpperCase()}).`
          );
        });
      });
    }

    document.addEventListener('keydown', (e) => {
      if (!durum.kioskOturum) return;
      const tus = String(e.key || '').toUpperCase();
      const ctrlVeyaMeta = e.ctrlKey || e.metaKey;
      const klavyeAlanindaMi = Boolean(e.target && e.target.closest && e.target.closest('textarea'));
      if (klavyeAlanindaMi && ctrlVeyaMeta && !e.shiftKey && ['C', 'X', 'A'].includes(tus)) {
        return;
      }
      const yasakKisayol =
        tus === 'F12' ||
        tus === 'PRINTSCREEN' ||
        (ctrlVeyaMeta && ['C', 'V', 'X', 'U', 'S', 'P'].includes(tus)) ||
        (ctrlVeyaMeta && e.shiftKey && ['I', 'J', 'C'].includes(tus));
      if (yasakKisayol) {
        e.preventDefault();
        kaydetKioskIhlal(
          'IHLAL_KOPYALA_SAG_TIK',
          `Yasaklı klavye kısayolu engellendi (${ctrlVeyaMeta ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${tus}).`
        );
      }
    });

    // Katman 5: Çoklu Sekme (BroadcastChannel) Kilidi
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const kioskKanal = new BroadcastChannel('sinav_kiosk_kanal');
        window.__kioskBroadcastKanal = kioskKanal;
        kioskKanal.addEventListener('message', (ev) => {
          if (durum.kioskOturum && ev && ev.data && ev.data.tip === 'KIOSK_YENI_SEKME') {
            kaydetKioskIhlal(
              'IHLAL_COKLU_SEKME',
              `Aynı tarayıcıda ikinci bir sınav sekmesi açıldığı tespit edildi (Öğrenci: ${ev.data.ogrNo || 'Bilinmiyor'}).`,
              true,
              'Aynı tarayıcıda birden fazla sınav sekmesi açıldığı tespit edildi! Diğer sekmeyi kapatıp bu ekrana dönün.'
            );
          }
        });
      } catch (_) {}
    }

    // Delil Niteliğinde Sınav Bazlı Log İndirme ve Filtreleme Kontrolleri
    const indirDelilDosyasi = (dosyaAdi, icerikMetni, mimeTipi) => {
      const blob = new Blob([icerikMetni], { type: mimeTipi });
      const url = C.olusturGuvenliBlobUrl(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = dosyaAdi;
      a.click();
    };

    const secLogSinavFiltreEl = document.getElementById('sec-log-sinav-filtre');
    if (secLogSinavFiltreEl) {
      secLogSinavFiltreEl.addEventListener('change', () => {
        guncelleDelilLogPaneliUI();
      });
    }

    const btnDelilTxt = document.getElementById('btn-delil-log-txt-indir');
    if (btnDelilTxt) {
      btnDelilTxt.addEventListener('click', () => {
        const seciliSinavId = (secLogSinavFiltreEl && secLogSinavFiltreEl.value) || 'TUMU';
        const hedefSinav = seciliSinavId === 'TUMU'
          ? durum.onlineSinav
          : (durum.onlineSinavListesi.find((s) => s.sinavId === seciliSinavId) || { sinavId: seciliSinavId, baslik: seciliSinavId });
        const yapi = okuAktifSinavYapisi();
        const raporTxt = C.uretResmiDelilLogRaporuTXT(durum.kioskDelilLoglari, {
          sinavId: seciliSinavId,
          sinavBaslik: hedefSinav ? hedefSinav.baslik : 'Online Sınav',
          dersAd: yapi && yapi.ders ? `${yapi.ders.kod} - ${yapi.ders.ad}` : '',
          kurumAd: yapi ? `${yapi.kurum} / ${yapi.fakulte}` : '',
          hocaAd: (durum.aktifHocaOturum && durum.aktifHocaOturum.adSoyad) || (yapi && yapi.imzaHoca) || ''
        });
        const dosyaKod = seciliSinavId === 'TUMU' ? (durum.onlineSinav.sinavId || 'TUM-SINAVLAR') : seciliSinavId;
        indirDelilDosyasi(`${dosyaKod}_Resmi_Delil_Log_Raporu.txt`, raporTxt, 'text/plain;charset=utf-8');
      });
    }

    const btnDelilCsv = document.getElementById('btn-delil-log-csv-indir');
    if (btnDelilCsv) {
      btnDelilCsv.addEventListener('click', () => {
        const seciliSinavId = (secLogSinavFiltreEl && secLogSinavFiltreEl.value) || 'TUMU';
        const csvIcerik = C.uretDelilLogCSV(durum.kioskDelilLoglari, seciliSinavId);
        const dosyaKod = seciliSinavId === 'TUMU' ? (durum.onlineSinav.sinavId || 'TUM-SINAVLAR') : seciliSinavId;
        indirDelilDosyasi(`${dosyaKod}_Delil_Log_Tablosu.csv`, csvIcerik, 'text/csv;charset=utf-8');
      });
    }

    const btnDelilJson = document.getElementById('btn-delil-log-json-indir');
    if (btnDelilJson) {
      btnDelilJson.addEventListener('click', () => {
        const seciliSinavId = (secLogSinavFiltreEl && secLogSinavFiltreEl.value) || 'TUMU';
        const kayitlar = (durum.kioskDelilLoglari || []).filter((l) => seciliSinavId === 'TUMU' || l.sinavId === seciliSinavId);
        const paket = {
          belgeTuru: 'RESMI_ONLINE_SINAV_DELIL_LOG_PAKETI',
          olusturulmaZamani: new Date().toISOString(),
          sinavId: seciliSinavId,
          toplamKayit: kayitlar.length,
          sonZincirHash: kayitlar.length > 0 ? kayitlar[kayitlar.length - 1].olayHash : 'GENESIS-00000000',
          kayitlar
        };
        const dosyaKod = seciliSinavId === 'TUMU' ? (durum.onlineSinav.sinavId || 'TUM-SINAVLAR') : seciliSinavId;
        indirDelilDosyasi(`${dosyaKod}_Muhurlu_Delil_Paketi.json`, JSON.stringify(paket, null, 2), 'application/json;charset=utf-8');
      });
    }

    const btnDelilTemizle = document.getElementById('btn-delil-log-temizle');
    if (btnDelilTemizle) {
      btnDelilTemizle.addEventListener('click', () => {
        const seciliSinavId = (secLogSinavFiltreEl && secLogSinavFiltreEl.value) || 'TUMU';
        if (seciliSinavId === 'TUMU') {
          durum.kioskDelilLoglari = [];
        } else {
          durum.kioskDelilLoglari = (durum.kioskDelilLoglari || []).filter((l) => l.sinavId !== seciliSinavId);
        }
        verileriKaydet();
        guncelleDelilLogPaneliUI();
      });
    }

    const tabloOnlineOturumlarEl = document.getElementById('tablo-online-oturumlar');
    if (tabloOnlineOturumlarEl) {
      tabloOnlineOturumlarEl.addEventListener('click', (e) => {
        const btnOgrDelil = e.target.closest('[data-indir-ogr-delil]');
        if (!btnOgrDelil) return;
        const ogrNo = btnOgrDelil.getAttribute('data-indir-ogr-delil');
        const sinavId = btnOgrDelil.getAttribute('data-indir-sinav-id') || 'TUMU';
        const yapi = okuAktifSinavYapisi();
        const raporTxt = C.uretResmiDelilLogRaporuTXT(durum.kioskDelilLoglari, {
          sinavId,
          ogrNo,
          sinavBaslik: durum.onlineSinav.baslik || 'Online Sınav',
          dersAd: yapi && yapi.ders ? `${yapi.ders.kod} - ${yapi.ders.ad}` : '',
          kurumAd: yapi ? `${yapi.kurum} / ${yapi.fakulte}` : '',
          hocaAd: (durum.aktifHocaOturum && durum.aktifHocaOturum.adSoyad) || (yapi && yapi.imzaHoca) || ''
        });
        indirDelilDosyasi(`${sinavId}_Ogrenci_${ogrNo}_Delil_Log_Raporu.txt`, raporTxt, 'text/plain;charset=utf-8');
      });
    }

    const btnTumVerileriSifirla = document.getElementById('btn-tum-verileri-sifirla');
    if (btnTumVerileriSifirla) {
      btnTumVerileriSifirla.addEventListener('click', () => {
        const onay = window.confirm('Tarayıcıda kayıtlı tüm dersler, sorular, öğrenci listesi, online sınavlar ve okuma sonuçları sıfırlanacak (Yönetici hesabınız korunur). Onaylıyor musunuz?');
        if (!onay) return;
        kaydetSonGeriAlYedegi('Tüm Verileri Sıfırlama');
        durum.dersler = [];
        durum.aktifDersId = 'genel';
        durum.sorular = [];
        durum.ogrenciKayitlari = [];
        durum.salonlar = [{ id: 'salon-1', ad: 'Salon 1', kontenjan: 40, gozetmenler: [] }];
        durum.salonlarHaritasi = {};
        durum.okumaSonuclari = [];
        durum.okumaSonuclariHaritasi = {};
        durum.dersTaslakSinavlari = {};
        durum.kayitliSinavlar = [];
        durum.aktifKayitliSinavId = '';
        durum.arsivDersler = [];
        durum.onlineSinavListesi = [];
        durum.onlineSinav = bosOnlineSinavTanimi();
        durum.kioskDelilLoglari = [];
        try {
          localStorage.removeItem(DEPO_ANAHTAR);
          ESKI_DEPO_ANAHTARLARI.forEach((k) => localStorage.removeItem(k));
        } catch (_) {}
        verileriKaydet({ zorlaEz: true });
        doldurDersSecici();
        guncelleKayitliSinavlarCubuguUI();
        guncelleOgrenciListesiSekmesi();
        guncelleA4Onizleme();
        guncelleSoruBankasiTablosu();
        guncelleOmrTabloVeKuyruk();
        guncelleMaddeAnaliziSekmesi();
        guncelleOnlineSinavSekmesiUI();
      });
    }

    /* ========================================================================
       FAZ 2: KURUMSAL KALİTE ŞABLON STÜDYOSU, ÇOK KANALLI BOLOGNA ÇÖZÜMLEYİCİ,
       OTOMATİK ÖÇ/BLOOM ONAY MASASI, OBS CSV, PUKÖ, MADDİ HATA & KÜMÜLATİF ÖÇ
       ======================================================================== */

    // 0) Mobil OMR Yetki Köprüsü (BroadcastChannel + Hoca Girişinde QR Yenileme)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const omrYetkiKanal = new BroadcastChannel('sinav_omr_yetki');
        omrYetkiKanal.addEventListener('message', (ev) => {
          if (ev && ev.data && ev.data.tip === 'OMR_TOKEN_ISTE') {
            const tk = sessionStorage.getItem('hoca_token') || '';
            if (tk) omrYetkiKanal.postMessage({ tip: 'OMR_TOKEN_YANIT', token: tk });
          }
        });
      } catch (_) {}
    }
    const btnHocaGirisRef = document.getElementById('btn-hoca-giris-yap');
    if (btnHocaGirisRef) {
      btnHocaGirisRef.addEventListener('click', () => {
        setTimeout(() => {
          const tk = sessionStorage.getItem('hoca_token') || '';
          if (tk && typeof BroadcastChannel !== 'undefined') {
            try {
              const ch = new BroadcastChannel('sinav_omr_yetki');
              ch.postMessage({ tip: 'OMR_TOKEN_YANIT', token: tk });
              ch.close();
            } catch (_) {}
          }
          guncelleA4Onizleme();
        }, 250);
      });
    }

    // 1) A4 Ek Sayfa (3+ Sayfa) İzni ve Taşma Uyarısı Düğmesi
    const ekSayfaChkEl = document.getElementById('ayar-ek-sayfa-izni');
    if (ekSayfaChkEl) {
      ekSayfaChkEl.addEventListener('change', () => {
        durum.ekSayfaIzni = Boolean(ekSayfaChkEl.checked);
        guncelleA4Onizleme();
      });
    }
    const btnTasmaEkSayfaAc = document.getElementById('btn-tasma-ek-sayfa-ac');
    if (btnTasmaEkSayfaAc) {
      btnTasmaEkSayfaAc.addEventListener('click', () => {
        durum.ekSayfaIzni = true;
        if (ekSayfaChkEl) ekSayfaChkEl.checked = true;
        guncelleA4Onizleme();
      });
    }

    // 2) Sekme 7: Kurumsal Kalite & Şablon Stüdyosu
    let sonOdakliSablonInput = document.getElementById('sablon-ust-antet');
    ['sablon-ust-antet', 'sablon-alt-onay', 'sablon-yoklama-baslik', 'sablon-tutanak-baslik'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('focus', () => { sonOdakliSablonInput = el; });
      }
    });

    const okuSablonFormAlanlari = () => ({
      id: durum.aktifKurumSablonId || ('kurum-' + Date.now().toString(36)),
      ad: ((document.getElementById('sablon-ad') || {}).value || '').trim() || 'Özel Kurumsal Kalite Şablonu',
      kurumAdi: ((document.getElementById('sablon-kurum-adi') || {}).value || '').trim() || 'T.C. ÜNİVERSİTE REKTÖRLÜĞÜ',
      birimAdi: ((document.getElementById('sablon-birim-adi') || {}).value || '').trim() || 'Meslek Yüksekokulu / Fakülte',
      dokumanNo: ((document.getElementById('sablon-dokuman-no') || {}).value || '').trim() || 'FR-EĞT-01',
      yayinTarihi: ((document.getElementById('sablon-yayin-tarihi') || {}).value || '').trim() || '01.09.2025',
      revizyonNo: ((document.getElementById('sablon-revizyon-no') || {}).value || '').trim() || '00',
      logoDataUrl: durum.kaliteGorselDataUrl || '',
      ustAntetSablonu: ((document.getElementById('sablon-ust-antet') || {}).value || '').trim(),
      altOnaySablonu: ((document.getElementById('sablon-alt-onay') || {}).value || '').trim(),
      yoklamaBasligi: ((document.getElementById('sablon-yoklama-baslik') || {}).value || '').trim() || 'RESMİ SINAV YOKLAMA ÇİZELGESİ',
      tutanakBasligi: ((document.getElementById('sablon-tutanak-baslik') || {}).value || '').trim() || 'SINAV DURUM TUTANAĞI',
      akreditasyonTuru: ((document.getElementById('sablon-akreditasyon-turu') || {}).value || '').trim() || 'YÖKAK / MEDEK / MÜDEK',
      akreditasyonBaraj: Math.max(30, Math.min(90, Number((document.getElementById('sablon-akreditasyon-baraj') || {}).value) || 60)),
      obsNotSutunlari: ((document.getElementById('sablon-obs-sutunlar') || {}).value || 'OGRENCI_NO;AD_SOYAD;KITAPCIK;PUAN;HARF_NOTU;DURUM')
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean)
    });

    const doldurSablonFormAlanlari = (sb) => {
      if (!sb) return;
      const yaz = (id, v) => { const el = document.getElementById(id); if (el) el.value = v !== undefined && v !== null ? String(v) : ''; };
      yaz('sablon-ad', sb.ad || '');
      yaz('sablon-kurum-adi', sb.kurumAdi || '');
      yaz('sablon-birim-adi', sb.birimAdi || '');
      yaz('sablon-dokuman-no', sb.dokumanNo || '');
      yaz('sablon-yayin-tarihi', sb.yayinTarihi || '');
      yaz('sablon-revizyon-no', sb.revizyonNo || '');
      yaz('sablon-ust-antet', sb.ustAntetSablonu || '{{KURUM_ADI}} — {{BIRIM_ADI}} | {{DERS_KODU}} {{DERS_ADI}} ({{SINAV_TURU}})');
      yaz('sablon-alt-onay', sb.altOnaySablonu || 'Doküman No: {{DOKUMAN_NO}} · Yayın: {{YAYIN_TARIHI}} · Rev: {{REVIZYON_NO}} · {{DERS_SORUMLUSU}} · {{SAYFA_NO}}');
      yaz('sablon-yoklama-baslik', sb.yoklamaBasligi || 'RESMİ SINAV YOKLAMA VE KİTAPÇIK İMZA ÇİZELGESİ');
      yaz('sablon-tutanak-baslik', sb.tutanakBasligi || 'SINAV UYGULAMA VE EVRAK TESLİM TUTANAĞI');
      yaz('sablon-akreditasyon-turu', sb.akreditasyonTuru || 'YÖKAK / MEDEK / MÜDEK');
      yaz('sablon-akreditasyon-baraj', sb.akreditasyonBaraj || 60);
      yaz('sablon-obs-sutunlar', Array.isArray(sb.obsNotSutunlari) ? sb.obsNotSutunlari.join(';') : (sb.obsNotSutunlari || 'OGRENCI_NO;AD_SOYAD;KITAPCIK;PUAN;HARF_NOTU;DURUM'));
    };

    const guncelleCanliKurumAntetOnizleme = () => {
      const kutu = document.getElementById('onizleme-kurum-antet');
      if (!kutu || typeof C.uygulaKurumsalYerTutucular !== 'function') return;
      const sb = okuSablonFormAlanlari();
      const yapi = okuAktifSinavYapisi();
      const baglam = {
        KURUM_ADI: sb.kurumAdi,
        BIRIM_ADI: sb.birimAdi,
        DOKUMAN_NO: sb.dokumanNo,
        YAYIN_TARIHI: sb.yayinTarihi,
        REVIZYON_NO: sb.revizyonNo,
        DERS_KODU: yapi.ders.kod,
        DERS_ADI: yapi.ders.ad,
        SINAV_TURU: yapi.sinavAd,
        KITAPCIK_GRUBU: 'A',
        TARIH: yapi.tarih,
        SURE: yapi.sure,
        DERS_SORUMLUSU: yapi.hoca,
        SAYFA_NO: 'Sayfa 1 / 2'
      };
      const ust = C.uygulaKurumsalYerTutucular(sb.ustAntetSablonu, baglam);
      const alt = C.uygulaKurumsalYerTutucular(sb.altOnaySablonu, baglam);
      const logoImg = durum.kaliteGorselDataUrl
        ? `<img src="${C.guvenliURL(durum.kaliteGorselDataUrl)}" alt="Logo" style="max-height:36px; max-width:56px; object-fit:contain;" />`
        : '<span style="font-size:1.3rem;">🏛️</span>';
      kutu.innerHTML = `
        <div style="border:1.5px solid #000; padding:6px 8px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:8px; color:#000;">
          <div style="display:flex; align-items:center; gap:8px;">
            ${logoImg}
            <div>
              <div style="font-weight:800; font-size:0.82rem;">${C.kacisHTML(ust)}</div>
              <div style="font-size:0.72rem; color:#334155;">Yoklama: ${C.kacisHTML(sb.yoklamaBasligi)} · Tutanak: ${C.kacisHTML(sb.tutanakBasligi)}</div>
            </div>
          </div>
          <div class="mono" style="font-size:0.7rem; border:1px solid #000; padding:3px 6px; text-align:right;">
            <div><strong>No:</strong> ${C.kacisHTML(sb.dokumanNo)}</div>
            <div><strong>Rev:</strong> ${C.kacisHTML(sb.revizyonNo)}</div>
          </div>
        </div>
        <div style="border-top:1px solid #000; padding-top:4px; font-size:0.72rem; font-weight:700; color:#0f172a; display:flex; justify-content:space-between;">
          <span>${C.kacisHTML(alt)}</span>
          <span>Akreditasyon: ${C.kacisHTML(sb.akreditasyonTuru)} (%${sb.akreditasyonBaraj})</span>
        </div>
      `;
    };

    const uygulaAktifKurumsalSablonStüdyoya = (sb) => {
      if (!sb) return;
      durum.aktifKurumSablonId = sb.id;
      if (sb.logoDataUrl) durum.kaliteGorselDataUrl = sb.logoDataUrl;
      const tamKurum = sb.birimAdi && !String(sb.kurumAdi || '').includes(sb.birimAdi)
        ? `${sb.kurumAdi} — ${sb.birimAdi}`
        : (sb.kurumAdi || sb.ad);
      const setEl = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
      setEl('antet-kurum', tamKurum);
      setEl('kalite-dokuman-no', sb.dokumanNo || '');
      setEl('kalite-yayin-tarihi', sb.yayinTarihi || '');
      setEl('kalite-revizyon', sb.revizyonNo || '');
      if (sb.dokumanNo) {
        const fTipEl = document.getElementById('kalite-form-tipi');
        if (fTipEl && fTipEl.value === 'standart') fTipEl.value = 'iso9001';
      }
      Object.assign(durum.evrakSablonu, {
        kurum: tamKurum,
        fakulte: sb.birimAdi || '',
        kaliteDokumanNo: sb.dokumanNo || '',
        kaliteYayinTarihi: sb.yayinTarihi || '',
        kaliteRevizyon: sb.revizyonNo || ''
      });
      verileriKaydet();
      guncelleA4Onizleme();
      guncelleMaddeAnaliziSekmesi();
    };

    const guncelleKurumsalSablonStudyoUI = () => {
      const liste = Array.isArray(durum.kurumsalSablonlar) ? durum.kurumsalSablonlar : [];
      const hizliSec = document.getElementById('sec-hizli-kurum-sablonu');
      if (hizliSec) {
        hizliSec.innerHTML = liste
          .map((s) => `<option value="${C.kacisHTML(s.id)}" ${s.id === durum.aktifKurumSablonId ? 'selected' : ''}>🏛️ ${C.kacisHTML(s.ad)}</option>`)
          .join('');
      }
      const rozetSayi = document.getElementById('rozet-kurum-sablon-sayisi');
      if (rozetSayi) rozetSayi.textContent = `${liste.length} Şablon`;

      const izgara = document.getElementById('izgara-kayitli-kurum-sablonlari');
      if (izgara) {
        izgara.innerHTML = liste
          .map((s) => `
            <div class="sablon-kart ${s.id === durum.aktifKurumSablonId ? 'secili' : ''}">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.35rem;">
                <strong style="font-size:0.84rem; color:#0f172a;">🏛️ ${C.kacisHTML(s.ad)}</strong>
                <span class="rozet ${s.id === durum.aktifKurumSablonId ? 'rozet-yesil' : 'rozet-mavi'}">${s.id === durum.aktifKurumSablonId ? 'Aktif' : C.kacisHTML(s.dokumanNo || 'Form')}</span>
              </div>
              <div style="font-size:0.74rem; color:#475569;">${C.kacisHTML(s.kurumAdi || '')} · ${C.kacisHTML(s.birimAdi || '')}</div>
              <div style="font-size:0.71rem; color:#64748b;">Akreditasyon: ${C.kacisHTML(s.akreditasyonTuru || 'YÖKAK')} (Baraj %${s.akreditasyonBaraj || 60})</div>
              <div style="display:flex; gap:0.35rem; margin-top:auto; pt:0.3rem;">
                <button type="button" class="btn btn-birincil btn-kucuk" data-sablon-sec="${C.kacisHTML(s.id)}" style="flex:1;">✓ Seç &amp; Uygula</button>
                ${liste.length > 1 ? `<button type="button" class="btn btn-tehlike btn-kucuk" data-sablon-sil="${C.kacisHTML(s.id)}">🗑️</button>` : ''}
              </div>
            </div>
          `)
          .join('');
      }

      const aktif = liste.find((s) => s.id === durum.aktifKurumSablonId) || liste[0];
      if (aktif) doldurSablonFormAlanlari(aktif);
      guncelleCanliKurumAntetOnizleme();
    };

    [
      'sablon-ad', 'sablon-kurum-adi', 'sablon-birim-adi', 'sablon-dokuman-no',
      'sablon-yayin-tarihi', 'sablon-revizyon-no', 'sablon-ust-antet', 'sablon-alt-onay',
      'sablon-yoklama-baslik', 'sablon-tutanak-baslik', 'sablon-akreditasyon-turu',
      'sablon-akreditasyon-baraj', 'sablon-obs-sutunlar'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', guncelleCanliKurumAntetOnizleme);
    });

    const kutuYerTutucular = document.getElementById('kutu-sablon-yer-tutucular');
    if (kutuYerTutucular) {
      kutuYerTutucular.addEventListener('click', (e) => {
        const et = e.target.closest('[data-yt]');
        if (!et) return;
        const yt = et.getAttribute('data-yt') || '';
        const hedef = sonOdakliSablonInput || document.getElementById('sablon-ust-antet');
        if (hedef) {
          hedef.value = `${hedef.value} ${yt}`.trim();
          guncelleCanliKurumAntetOnizleme();
        }
      });
    }

    const hizliSablonSecEl = document.getElementById('sec-hizli-kurum-sablonu');
    if (hizliSablonSecEl) {
      hizliSablonSecEl.addEventListener('change', () => {
        const secilen = (durum.kurumsalSablonlar || []).find((s) => s.id === hizliSablonSecEl.value);
        if (secilen) {
          doldurSablonFormAlanlari(secilen);
          uygulaAktifKurumsalSablonStüdyoya(secilen);
          guncelleKurumsalSablonStudyoUI();
        }
      });
    }

    const btnStudyoSablonAc = document.getElementById('btn-stüdyo-sablon-sekme-ac');
    if (btnStudyoSablonAc) {
      btnStudyoSablonAc.addEventListener('click', () => {
        const sekmeBtn = document.querySelector('[data-sekme="sekme-sablonlar"]');
        if (sekmeBtn) sekmeBtn.click();
      });
    }

    const izgaraSablonlarEl = document.getElementById('izgara-kayitli-kurum-sablonlari');
    if (izgaraSablonlarEl) {
      izgaraSablonlarEl.addEventListener('click', (e) => {
        const btnSec = e.target.closest('[data-sablon-sec]');
        if (btnSec) {
          const id = btnSec.getAttribute('data-sablon-sec');
          const sb = (durum.kurumsalSablonlar || []).find((x) => x.id === id);
          if (sb) {
            doldurSablonFormAlanlari(sb);
            uygulaAktifKurumsalSablonStüdyoya(sb);
            guncelleKurumsalSablonStudyoUI();
          }
          return;
        }
        const btnSil = e.target.closest('[data-sablon-sil]');
        if (btnSil && durum.kurumsalSablonlar.length > 1) {
          const id = btnSil.getAttribute('data-sablon-sil');
          durum.kurumsalSablonlar = durum.kurumsalSablonlar.filter((x) => x.id !== id);
          if (durum.aktifKurumSablonId === id) durum.aktifKurumSablonId = durum.kurumsalSablonlar[0].id;
          verileriKaydet();
          guncelleKurumsalSablonStudyoUI();
        }
      });
    }

    const btnSablonYeni = document.getElementById('btn-kurum-sablon-yeni');
    if (btnSablonYeni) {
      btnSablonYeni.addEventListener('click', () => {
        const yeniId = `kurum-${Date.now().toString(36)}`;
        durum.aktifKurumSablonId = yeniId;
        doldurSablonFormAlanlari({
          id: yeniId,
          ad: 'Yeni Okul / Fakülte Kalite Şablonu',
          kurumAdi: '',
          birimAdi: '',
          dokumanNo: 'FR-001',
          yayinTarihi: '01.09.2026',
          revizyonNo: '00',
          akreditasyonTuru: 'YÖKAK / MEDEK',
          akreditasyonBaraj: 60
        });
        guncelleCanliKurumAntetOnizleme();
      });
    }

    const btnSablonKaydet = document.getElementById('btn-kurum-sablon-kaydet');
    if (btnSablonKaydet) {
      btnSablonKaydet.addEventListener('click', async () => {
        const yeniSb = okuSablonFormAlanlari();
        const idx = durum.kurumsalSablonlar.findIndex((s) => s.id === yeniSb.id || s.ad === yeniSb.ad);
        if (idx >= 0) {
          yeniSb.id = durum.kurumsalSablonlar[idx].id;
          durum.kurumsalSablonlar[idx] = yeniSb;
        } else {
          yeniSb.id = `kurum-${Date.now().toString(36)}`;
          durum.kurumsalSablonlar.push(yeniSb);
        }
        uygulaAktifKurumsalSablonStüdyoya(yeniSb);
        guncelleKurumsalSablonStudyoUI();

        const tk = sessionStorage.getItem('hoca_token') || '';
        if ((location.protocol === 'http:' || location.protocol === 'https:') && tk) {
          fetch('/api/kurumsal-sablonlar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
            body: JSON.stringify({ kurumsalSablonlar: durum.kurumsalSablonlar })
          }).catch(() => {});
        }
      });
    }

    const btnSablonIndir = document.getElementById('btn-kurum-sablon-indir');
    if (btnSablonIndir) {
      btnSablonIndir.addEventListener('click', () => {
        const sb = okuSablonFormAlanlari();
        const paket = {
          belgeTuru: 'KURUMSAL_KALITE_SABLON_PAKETI_V1',
          olusturulmaZamani: new Date().toISOString(),
          sablon: sb,
          tumSablonlar: durum.kurumsalSablonlar
        };
        const dosyaKod = String(sb.ad || 'Kurumsal_Sablon').replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü_-]+/g, '_');
        indirDelilDosyasi(`${dosyaKod}.kurumsablon.json`, JSON.stringify(paket, null, 2), 'application/json;charset=utf-8');
      });
    }

    const inputKurumSablonYukle = document.getElementById('input-kurum-sablon-yukle');
    if (inputKurumSablonYukle) {
      inputKurumSablonYukle.addEventListener('change', async (e) => {
        const dosya = e.target.files && e.target.files[0];
        if (!dosya) return;
        try {
          const metin = await dosya.text();
          const veri = JSON.parse(metin);
          const gelenListe = Array.isArray(veri.tumSablonlar)
            ? veri.tumSablonlar
            : (veri.sablon ? [veri.sablon] : (Array.isArray(veri) ? veri : []));
          const temiz = C.semaDogrulaVeTemizle({ kurumsalSablonlar: gelenListe }).kurumsalSablonlar || [];
          if (temiz.length > 0) {
            temiz.forEach((gs) => {
              const i = durum.kurumsalSablonlar.findIndex((x) => x.id === gs.id);
              if (i >= 0) durum.kurumsalSablonlar[i] = gs;
              else durum.kurumsalSablonlar.push(gs);
            });
            uygulaAktifKurumsalSablonStüdyoya(temiz[0]);
            guncelleKurumsalSablonStudyoUI();
          }
        } catch (_) {}
        inputKurumSablonYukle.value = '';
      });
    }

    const inputKaliteBelgeYukle = document.getElementById('input-kalite-belge-yukle');
    if (inputKaliteBelgeYukle) {
      inputKaliteBelgeYukle.addEventListener('change', async (e) => {
        const dosya = e.target.files && e.target.files[0];
        if (!dosya) return;
        const durumKutu = document.getElementById('etiket-kalite-ototani-durum');
        const adAlt = String(dosya.name || '').toLowerCase();
        try {
          let cikarilan = null;
          if (adAlt.endsWith('.docx') && typeof C.cozDocxKaliteFormu === 'function') {
            const buf = await dosya.arrayBuffer();
            cikarilan = await C.cozDocxKaliteFormu(buf);
          } else if (adAlt.endsWith('.doc') && typeof C.cozDocKaliteFormu === 'function') {
            const buf = await dosya.arrayBuffer();
            cikarilan = C.cozDocKaliteFormu(buf);
          } else if (adAlt.endsWith('.html') || adAlt.endsWith('.htm')) {
            const htmlMetin = await dosya.text();
            const doc = new DOMParser().parseFromString(htmlMetin, 'text/html');
            const duz = (doc.body && (doc.body.innerText || doc.body.textContent)) || htmlMetin;
            cikarilan = typeof C.cikarKaliteKunyesiMetinden === 'function' ? C.cikarKaliteKunyesiMetinden(duz) : {};
            const ilkImg = doc.querySelector('img[src^="data:image/"]');
            if (ilkImg) cikarilan.logoDataUrl = ilkImg.getAttribute('src');
          } else if (dosya.type.startsWith('image/')) {
            const dataUrl = await new Promise((res) => {
              const r = new FileReader();
              r.onload = () => res(String(r.result || ''));
              r.readAsDataURL(dosya);
            });
            durum.kaliteGorselDataUrl = dataUrl;
            cikarilan = { ad: dosya.name.replace(/\.[^.]+$/, '') };
          } else {
            const hamMetin = await dosya.text();
            cikarilan = typeof C.cikarKaliteKunyesiMetinden === 'function' ? C.cikarKaliteKunyesiMetinden(hamMetin) : {};
          }

          if (cikarilan) {
            if (cikarilan.logoDataUrl) durum.kaliteGorselDataUrl = cikarilan.logoDataUrl;
            const mevcut = okuSablonFormAlanlari();
            doldurSablonFormAlanlari(Object.assign({}, mevcut, {
              ad: `${cikarilan.kurum || cikarilan.fakulte || dosya.name.replace(/\.[^.]+$/, '')} Kalite Şablonu`,
              kurumAdi: cikarilan.kurum || mevcut.kurumAdi,
              birimAdi: cikarilan.fakulte || cikarilan.bolum || mevcut.birimAdi,
              dokumanNo: cikarilan.dokumanNo || cikarilan.dokumanNoDurum || mevcut.dokumanNo,
              yayinTarihi: cikarilan.yayinTarihi || mevcut.yayinTarihi,
              revizyonNo: cikarilan.revizyon || cikarilan.revTarihi || mevcut.revizyonNo
            }));
            guncelleCanliKurumAntetOnizleme();
            if (durumKutu) {
              durumKutu.style.display = 'block';
              durumKutu.textContent = `✅ "${dosya.name}" belgesinden kurumsal antet ve kalite künyesi otomatik tanındı! Alanları kontrol edip "5'li Kurumsal Şablon Olarak Kaydet" düğmesine basabilirsiniz.`;
            }
          }
        } catch (err) {
          if (durumKutu) {
            durumKutu.style.display = 'block';
            durumKutu.textContent = `⚠️ Belge okunurken uyarı: ${err.message}`;
          }
        }
        inputKaliteBelgeYukle.value = '';
      });
    }

    // 3) Çok Kanallı Bologna Ders Bilgi Paketi Çözümleyici Modalı
    const modalBologna = document.getElementById('modal-bologna-ice-aktar');
    const girdiBolognaHam = document.getElementById('girdi-bologna-ham');
    const kutuBolognaOnizleme = document.getElementById('kutu-bologna-onizleme');
    const btnBolognaUygula = document.getElementById('btn-bologna-uygula');

    const acModalBologna = () => {
      if (modalBologna) modalBologna.style.display = 'flex';
    };
    ['btn-stüdyo-bologna-ac', 'btn-banka-bologna-ac', 'btn-modal-ders-bologna-ac'].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', acModalBologna);
    });
    const btnModalBolognaKapat = document.getElementById('btn-modal-bologna-kapat');
    if (btnModalBolognaKapat) {
      btnModalBolognaKapat.addEventListener('click', () => {
        if (modalBologna) modalBologna.style.display = 'none';
      });
    }

    if (girdiBolognaHam) {
      girdiBolognaHam.addEventListener('paste', (e) => {
        if (e.clipboardData) {
          const zenginHtml = e.clipboardData.getData('text/html') || '';
          if (zenginHtml && /<table/i.test(zenginHtml)) {
            durum.geciciBolognaHtml = zenginHtml;
          } else {
            durum.geciciBolognaHtml = '';
          }
        }
      });
      girdiBolognaHam.addEventListener('input', () => {
        if (!girdiBolognaHam.value.trim()) durum.geciciBolognaHtml = '';
      });
    }

    const inputBolognaGorsel = document.getElementById('input-bologna-gorsel');
    if (inputBolognaGorsel) {
      inputBolognaGorsel.addEventListener('change', (e) => {
        const dosya = e.target.files && e.target.files[0];
        if (!dosya) return;
        const etAd = document.getElementById('etiket-bologna-gorsel-ad');
        if (etAd) etAd.textContent = `📎 ${dosya.name}`;
        const r = new FileReader();
        r.onload = () => { durum.geciciBolognaGorselDataUrl = String(r.result || ''); };
        r.readAsDataURL(dosya);
      });
    }

    const cizBolognaCozumOnizleme = (cozum) => {
      if (!kutuBolognaOnizleme || !cozum) return;
      kutuBolognaOnizleme.style.display = 'block';
      const uyariHTML = (cozum.uyarilar || []).length > 0
        ? `<div style="padding:0.45rem 0.6rem; background:#fffbeb; border:1px solid #fcd34d; border-radius:6px; color:#92400e; margin-bottom:0.5rem;">${cozum.uyarilar.map((u) => `⚠️ ${C.kacisHTML(u)}`).join('<br/>')}</div>`
        : '';
      const ocSatirlar = (cozum.ogrenimCiktilari || [])
        .map((o) => `<li><strong>${C.kacisHTML(o.kod)}:</strong> ${C.kacisHTML(o.aciklama)}</li>`)
        .join('');
      const degerlendirmeStr = (cozum.degerlendirmeOlcutleri || [])
        .map((d) => `${d.ad}: %${d.katkiYuzde}`)
        .join(' · ');
      const pcStr = Object.entries(cozum.pcTumKatkilar || {})
        .filter(([, val]) => Number(val) > 0)
        .map(([k, val]) => `${k}:${val}/5`)
        .join(' · ');
      kutuBolognaOnizleme.innerHTML = `
        ${uyariHTML}
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:0.5rem; margin-bottom:0.5rem;">
          <div><strong>Ders:</strong> ${C.kacisHTML(cozum.dersKodu || '-')} — ${C.kacisHTML(cozum.dersAdi || '-')}</div>
          <div><strong>Bölüm / Düzey:</strong> ${C.kacisHTML(cozum.bolumProgram || '-')} (${C.kacisHTML(cozum.duzey || '-')})</div>
          <div><strong>AKTS / Kredi / T+U+L:</strong> ${cozum.akts || '-'} AKTS · ${cozum.kredi || '-'} Kredi · ${C.kacisHTML(cozum.tul || '-')}</div>
          <div><strong>Dersi Veren:</strong> ${C.kacisHTML(cozum.ogretimElemani || '-')}</div>
          <div><strong>Değerlendirme:</strong> ${C.kacisHTML(degerlendirmeStr || 'Ara Sınav %40 · Final %60')}</div>
          <div><strong>Program Çıktıları (PÇ):</strong> ${C.kacisHTML(pcStr || 'Yok')}</div>
        </div>
        <div style="margin-bottom:0.45rem;">
          <strong>🎯 Çözümlenen Bologna Öğrenme Çıktıları (${(cozum.ogrenimCiktilari || []).length} Madde):</strong>
          <ul style="margin:0.25rem 0 0 1.2rem; padding:0;">${ocSatirlar || '<li>ÖÇ bulunamadı</li>'}</ul>
        </div>
        <div>
          <strong>📅 14 Haftalık Konu Akışı:</strong> ${(cozum.haftalikKonular || []).length} hafta eşleştirildi
          (${C.kacisHTML((cozum.haftalikKonular || []).slice(0, 4).map((h) => `H${h.hafta}:${h.konu}`).join(', '))}...)
        </div>
      `;
    };

    const calistirBolognaCozumleme = async () => {
      const hamMetin = (girdiBolognaHam && girdiBolognaHam.value) || '';
      const hamGirdi = durum.geciciBolognaHtml || hamMetin;
      if (!hamGirdi.trim() && !durum.geciciBolognaGorselDataUrl) return;

      let cozum = null;
      const tk = sessionStorage.getItem('hoca_token') || '';
      if ((location.protocol === 'http:' || location.protocol === 'https:') && tk) {
        try {
          const r = await fetch('/api/ai-bologna-coz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
            body: JSON.stringify({
              metin: hamMetin,
              htmlTablo: durum.geciciBolognaHtml || '',
              gorselDataUrl: durum.geciciBolognaGorselDataUrl || ''
            })
          });
          if (r.ok) {
            const v = await r.json();
            if (v && (v.bologna || v.veri)) cozum = v.bologna || v.veri;
          }
        } catch (_) {}
      }
      if (!cozum && typeof C.cozBolognaBilgiPaketi === 'function') {
        cozum = C.cozBolognaBilgiPaketi(hamGirdi);
      }
      if (cozum) {
        durum.geciciBolognaCozum = cozum;
        cizBolognaCozumOnizleme(cozum);
        if (btnBolognaUygula) btnBolognaUygula.disabled = false;
      }
    };

    const btnBolognaOrnek = document.getElementById('btn-bologna-ornek-yukle');
    if (btnBolognaOrnek) {
      btnBolognaOrnek.addEventListener('click', () => {
        durum.geciciBolognaHtml = '';
        if (girdiBolognaHam && C.ORNEK_PROLIZ_BOLOGNA_METNI) {
          girdiBolognaHam.value = C.ORNEK_PROLIZ_BOLOGNA_METNI;
        }
        calistirBolognaCozumleme();
      });
    }

    const btnBolognaCozumle = document.getElementById('btn-bologna-cozumle');
    if (btnBolognaCozumle) {
      btnBolognaCozumle.addEventListener('click', calistirBolognaCozumleme);
    }

    if (btnBolognaUygula) {
      btnBolognaUygula.addEventListener('click', () => {
        const cz = durum.geciciBolognaCozum;
        if (!cz) return;
        const dersKod = (cz.dersKodu || 'DERS101').trim();
        const dersAd = (cz.dersAdi || 'Yeni Bologna Dersi').trim();
        let hedefDers = durum.dersler.find(
          (d) =>
            String(d.kod || '').trim().toUpperCase() === dersKod.toUpperCase() ||
            String(d.ad || '').trim().toLocaleLowerCase('tr-TR') === dersAd.toLocaleLowerCase('tr-TR')
        );
        if (!hedefDers) {
          const aktifBosTaslak = durum.dersler.find((d) => {
            if (!d || d.id !== durum.aktifDersId) return false;
            const soruAdet = (durum.sorular || []).filter((s) => s && !s.arsivde && s.dersId === d.id).length;
            return soruAdet === 0 && d.kod === 'DERS' && d.ad === 'Yeni Ders';
          });
          if (aktifBosTaslak) hedefDers = aktifBosTaslak;
        }

        if (!hedefDers) {
          hedefDers = {
            id: `ders-${Date.now().toString(36)}`,
            kod: dersKod,
            ad: dersAd,
            fakulte: durum.evrakSablonu.fakulte || durum.evrakSablonu.kurum || '',
            bolum: cz.bolumProgram || '',
            ogretimElemani: cz.ogretimElemani || durum.evrakSablonu.sorumlu || ''
          };
          durum.dersler.push(hedefDers);
        } else {
          if (cz.dersKodu) hedefDers.kod = cz.dersKodu;
          if (cz.dersAdi) hedefDers.ad = cz.dersAdi;
          if (cz.bolumProgram) hedefDers.bolum = cz.bolumProgram;
          if (cz.ogretimElemani) hedefDers.ogretimElemani = cz.ogretimElemani;
        }
        hedefDers.ogrenimCiktilari = (cz.ogrenimCiktilari || []).map((o) => ({ kod: o.kod, aciklama: o.aciklama }));
        hedefDers.bolognaBilgisi = {
          yariyil: cz.yariyil,
          tul: cz.tul,
          kredi: cz.kredi,
          akts: cz.akts,
          duzey: cz.duzey,
          degerlendirmeOlcutleri: cz.degerlendirmeOlcutleri || [],
          haftalikKonular: cz.haftalikKonular || [],
          kanonikPcSutunlar: cz.kanonikPcSutunlar || (cz.programCiktilari && cz.programCiktilari.kanonikSutunlar) || [],
          pcTumKatkilar: cz.pcTumKatkilar || {},
          ocPcMatrisi: cz.ocPcMatrisi || {}
        };
        durum.aktifDersId = hedefDers.id;

        // Yeni ders modalı açıksa kutuları da doldur
        const ydKod = document.getElementById('yeni-ders-kod');
        const ydAd = document.getElementById('yeni-ders-ad');
        const ydBolum = document.getElementById('yeni-ders-bolum');
        const ydHoca = document.getElementById('yeni-ders-hoca');
        if (ydKod) ydKod.value = hedefDers.kod;
        if (ydAd) ydAd.value = hedefDers.ad;
        if (ydBolum) ydBolum.value = hedefDers.bolum || '';
        if (ydHoca) ydHoca.value = hedefDers.ogretimElemani || '';

        const vizeOlcut = (cz.degerlendirmeOlcutleri || []).find((x) => /ara|vize/i.test(x.ad || ''));
        if (vizeOlcut && Number(vizeOlcut.katkiYuzde) > 0) {
          const agEl = document.getElementById('ayar-aktif-sinav-agirlik');
          if (agEl) agEl.value = String(vizeOlcut.katkiYuzde);
        }

        verileriKaydet();
        doldurDersSecici();
        guncelleA4Onizleme();
        guncelleSoruBankasiTablosu();
        guncelleMaddeAnaliziSekmesi();
        if (modalBologna) modalBologna.style.display = 'none';
      });
    }

    // 4) Soru Bazlı Otomatik ÖÇ + Hafta + Bloom + Zorluk Hoca Onay Masası
    const modalAiOc = document.getElementById('modal-ai-oc-onay');
    const kapatAiOcModal = () => { if (modalAiOc) modalAiOc.style.display = 'none'; };
    const btnModalAiOcKapat = document.getElementById('btn-modal-ai-oc-kapat');
    const btnAiOcIptal = document.getElementById('btn-ai-oc-iptal');
    if (btnModalAiOcKapat) btnModalAiOcKapat.addEventListener('click', kapatAiOcModal);
    if (btnAiOcIptal) btnAiOcIptal.addEventListener('click', kapatAiOcModal);

    const btnBankaOtoOcAnaliz = document.getElementById('btn-banka-otomatik-oc-analiz');
    if (btnBankaOtoOcAnaliz) {
      btnBankaOtoOcAnaliz.addEventListener('click', async () => {
        const yapi = okuAktifSinavYapisi();
        const dersSorulari = durum.sorular.filter((s) => !s.arsivde && (s.dersId === yapi.ders.id || s.dersId === 'genel'));
        const hedefSorular = dersSorulari.length > 0 ? dersSorulari : yapi.tumSeciliSorular;
        if (!hedefSorular || hedefSorular.length === 0) return;

        const bolognaBilgi = Object.assign(
          { ogrenimCiktilari: yapi.dersOgrenimCiktilari },
          yapi.ders.bolognaBilgisi || {}
        );
        let oneriler = null;
        const tk = sessionStorage.getItem('hoca_token') || '';
        if ((location.protocol === 'http:' || location.protocol === 'https:') && tk) {
          try {
            const r = await fetch('/api/ai-soru-oc-etiketle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
              body: JSON.stringify({ sorular: hedefSorular, bologna: bolognaBilgi })
            });
            if (r.ok) {
              const v = await r.json();
              if (v && Array.isArray(v.etiketler)) oneriler = v.etiketler;
            }
          } catch (_) {}
        }
        if (!oneriler && typeof C.etiketleSorularOtomatikOcBloom === 'function') {
          oneriler = C.etiketleSorularOtomatikOcBloom(hedefSorular, bolognaBilgi);
        }
        durum.geciciAiOcOnerileri = oneriler || [];

        const gecerliOcKodlari = (yapi.dersOgrenimCiktilari && yapi.dersOgrenimCiktilari.length > 0)
          ? yapi.dersOgrenimCiktilari.map((o) => o.kod)
          : ['ÖÇ-1', 'ÖÇ-2', 'ÖÇ-3', 'ÖÇ-4'];
        const bloomSecenekler = ['Hatırlama', 'Anlama', 'Uygulama', 'Analiz', 'Değerlendirme', 'Yaratma'];
        const zorlukSecenekler = ['Kolay', 'Orta', 'Zor'];

        const tbodyOnay = document.getElementById('tablo-ai-oc-onay');
        if (tbodyOnay) {
          tbodyOnay.innerHTML = durum.geciciAiOcOnerileri
            .map((oneri, idx) => {
              const soruRef = hedefSorular.find((q) => String(q.id) === String(oneri.soruId)) || hedefSorular[idx] || {};
              const birincilOc = gecerliOcKodlari.includes(oneri.birincilOc) ? oneri.birincilOc : gecerliOcKodlari[0];
              return `
                <tr data-onay-soru-id="${C.kacisHTML(soruRef.id || oneri.soruId || '')}">
                  <td class="mono">${idx + 1}</td>
                  <td style="max-width:280px; font-size:0.78rem;">${C.kacisHTML(String(soruRef.metin || '').slice(0, 95))}</td>
                  <td>
                    <select class="ai-onay-oc1" style="font-size:0.76rem; padding:2px 4px;">
                      ${gecerliOcKodlari.map((k) => `<option value="${C.kacisHTML(k)}" ${k === birincilOc ? 'selected' : ''}>${C.kacisHTML(k)}</option>`).join('')}
                    </select>
                  </td>
                  <td>
                    <select class="ai-onay-oc2" style="font-size:0.76rem; padding:2px 4px;">
                      <option value="">Yok</option>
                      ${gecerliOcKodlari.map((k) => `<option value="${C.kacisHTML(k)}" ${k === oneri.ikincilOc ? 'selected' : ''}>${C.kacisHTML(k)}</option>`).join('')}
                    </select>
                  </td>
                  <td>
                    <input type="number" class="ai-onay-hafta" min="1" max="14" value="${Number(oneri.onerilenHafta) || Number(soruRef.hafta) || 1}" style="width:58px; font-size:0.76rem; padding:2px 4px;" />
                  </td>
                  <td>
                    <select class="ai-onay-bloom" style="font-size:0.76rem; padding:2px 4px;">
                      ${bloomSecenekler.map((b) => `<option value="${b}" ${b === oneri.bloomBasamagi ? 'selected' : ''}>${b}</option>`).join('')}
                    </select>
                  </td>
                  <td>
                    <select class="ai-onay-zorluk" style="font-size:0.76rem; padding:2px 4px;">
                      ${zorlukSecenekler.map((z) => `<option value="${z}" ${z === oneri.onerilenZorluk ? 'selected' : ''}>${z}</option>`).join('')}
                    </select>
                  </td>
                  <td class="mono"><span class="rozet rozet-yesil">%${Math.round((Number(oneri.guvenSkoru) || 0.85) * 100)}</span></td>
                </tr>
              `;
            })
            .join('');
        }
        if (modalAiOc) modalAiOc.style.display = 'flex';
      });
    }

    const btnAiOcTumunuOnayla = document.getElementById('btn-ai-oc-tumunu-onayla');
    if (btnAiOcTumunuOnayla) {
      btnAiOcTumunuOnayla.addEventListener('click', () => {
        const yapi = okuAktifSinavYapisi();
        const ocAciklamaHaritasi = {};
        (yapi.dersOgrenimCiktilari || []).forEach((o) => { ocAciklamaHaritasi[o.kod] = o.aciklama; });
        const satirlar = Array.from(document.querySelectorAll('#tablo-ai-oc-onay tr[data-onay-soru-id]'));
        satirlar.forEach((tr) => {
          const sId = tr.getAttribute('data-onay-soru-id');
          const oc1 = (tr.querySelector('.ai-onay-oc1') || {}).value || 'ÖÇ-1';
          const oc2 = (tr.querySelector('.ai-onay-oc2') || {}).value || '';
          const hafta = Math.max(1, Math.min(14, Number((tr.querySelector('.ai-onay-hafta') || {}).value) || 1));
          const bloom = (tr.querySelector('.ai-onay-bloom') || {}).value || 'Anlama';
          const zorluk = (tr.querySelector('.ai-onay-zorluk') || {}).value || 'Orta';
          const soru = durum.sorular.find((q) => String(q.id) === String(sId));
          if (soru) {
            soru.ocKodu = oc1;
            soru.ikincilOcKodu = oc2;
            soru.hafta = hafta;
            soru.bloomBasamagi = bloom;
            soru.bloomDuzeyi = bloom;
            soru.zorluk = zorluk;
            if (ocAciklamaHaritasi[oc1]) {
              soru.kazanim = `${oc1}: ${ocAciklamaHaritasi[oc1]}`;
            }
          }
        });
        verileriKaydet();
        kapatAiOcModal();
        guncelleSoruBankasiTablosu();
        guncelleA4Onizleme();
        guncelleMaddeAnaliziSekmesi();
      });
    }

    // 5) Sekme 4: Tek Tıkla Soru İptali, pj/rjx Bankaya İşleme, Özel OBS CSV, PUKÖ, Maddi Hata & Dönemlik Kümülatif Birleştirici
    const tabloMaddeAnaliziEl = document.getElementById('tablo-madde-analizi');
    if (tabloMaddeAnaliziEl) {
      tabloMaddeAnaliziEl.addEventListener('click', (e) => {
        const btnToggle = e.target.closest('[data-toggle-iptal-kod]');
        if (!btnToggle) return;
        const kod = String(btnToggle.getAttribute('data-toggle-iptal-kod') || '').trim().toUpperCase();
        const iptalInput = document.getElementById('kural-iptal-soru');
        if (!kod || !iptalInput) return;
        const mevcut = (iptalInput.value || '')
          .toUpperCase()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const idx = mevcut.indexOf(kod);
        if (idx >= 0) mevcut.splice(idx, 1);
        else mevcut.push(kod);
        iptalInput.value = mevcut.join(', ');
        calistirYenidenPuanlamaMotoru();
      });
    }

    const btnPjRjxBanka = document.getElementById('btn-pj-rjx-bankaya-isle');
    if (btnPjRjxBanka) {
      btnPjRjxBanka.addEventListener('click', () => {
        const yapi = okuAktifSinavYapisi();
        const analiz = C.hesaplaSinifVeMaddeAnalizi(durum.okumaSonuclari, yapi);
        const varyasyonA = (yapi.kitapciklar && yapi.kitapciklar.A) || { dy: [], test: [] };
        let guncellenen = 0;
        (analiz.maddeler || []).forEach((m) => {
          const parca = String(m.kod || '').split('-');
          const no = Number(parca[1]) || 0;
          const refSoru = parca[0] === 'DY' ? varyasyonA.dy[no - 1] : varyasyonA.test[no - 1];
          if (!refSoru) return;
          const bankaSoru = durum.sorular.find((q) => String(q.id) === String(refSoru.id));
          if (bankaSoru) {
            bankaSoru.gercekPj = m.pj;
            bankaSoru.gercekRjx = m.rjx;
            bankaSoru.zorluk = m.pj < 0.35 ? 'Zor' : (m.pj > 0.75 ? 'Kolay' : 'Orta');
            guncellenen++;
          }
        });
        verileriKaydet();
        guncelleSoruBankasiTablosu();
        btnPjRjxBanka.textContent = `✅ ${guncellenen} Sorunun pj/rjx Verisi İşlendi`;
        setTimeout(() => { btnPjRjxBanka.textContent = '📥 pj/rjx Verisini Soru Bankasına İşle'; }, 2200);
      });
    }

    const btnOzelObsCsv = document.getElementById('btn-ozel-obs-csv-indir');
    if (btnOzelObsCsv) {
      btnOzelObsCsv.addEventListener('click', () => {
        const aktifSb = (durum.kurumsalSablonlar || []).find((s) => s.id === durum.aktifKurumSablonId) || {};
        const yapi = okuAktifSinavYapisi();
        const csv = C.uretOzelObsNotCsv(durum.okumaSonuclari, {
          ogrenciler: durum.ogrenciler,
          sutunlar: aktifSb.obsNotSutunlari || ['OGRENCI_NO', 'AD_SOYAD', 'KITAPCIK', 'PUAN', 'HARF_NOTU', 'DURUM'],
          dersKodu: yapi.ders.kod,
          sinavTuru: yapi.sinavAd
        });
        const guvenliCsv = csv.startsWith('\ufeff') ? csv : ('\ufeff' + csv);
        indirDelilDosyasi(`${yapi.ders.kod}_OBS_Not_Yukleme_${Date.now()}.csv`, guvenliCsv, 'text/csv;charset=utf-8');
      });
    }

    const btnPukoKopyala = document.getElementById('btn-puko-kopyala');
    if (btnPukoKopyala) {
      btnPukoKopyala.addEventListener('click', () => {
        const pukoEl = document.getElementById('metin-puko-raporu');
        if (pukoEl && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(pukoEl.value || '').catch(() => {});
        }
      });
    }

    const btnPukoTxtIndir = document.getElementById('btn-puko-txt-indir');
    if (btnPukoTxtIndir) {
      btnPukoTxtIndir.addEventListener('click', () => {
        const yapi = okuAktifSinavYapisi();
        const pukoEl = document.getElementById('metin-puko-raporu');
        indirDelilDosyasi(`${yapi.ders.kod}_YOKAK_MEDEK_PUKO_Raporu.txt`, (pukoEl && pukoEl.value) || '', 'text/plain;charset=utf-8');
      });
    }

    const btnMaddiHataIndir = document.getElementById('btn-maddi-hata-kanit-indir');
    if (btnMaddiHataIndir) {
      btnMaddiHataIndir.addEventListener('click', () => {
        const secEl = document.getElementById('sec-maddi-hata-ogrenci');
        const ogrNo = (secEl && secEl.value) || (durum.okumaSonuclari[0] && durum.okumaSonuclari[0].ogrNo) || '';
        const kayit = durum.okumaSonuclari.find((s) => String(s.ogrNo) === String(ogrNo));
        if (!kayit || typeof C.uretMaddiHataItirazKanitRaporuTXT !== 'function') return;
        const yapi = okuAktifSinavYapisi();
        const raporTxt = C.uretMaddiHataItirazKanitRaporuTXT(kayit, yapi);
        indirDelilDosyasi(`${yapi.ders.kod}_Maddi_Hata_Kanit_Tutanagi_${ogrNo}.txt`, raporTxt, 'text/plain;charset=utf-8');
      });
    }

    ['sec-aktif-sinav-donem-turu', 'ayar-aktif-sinav-agirlik'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', guncelleMaddeAnaliziSekmesi);
    });

    const btnDonemPaketiIndir = document.getElementById('btn-donem-sinav-paketi-indir');
    if (btnDonemPaketiIndir) {
      btnDonemPaketiIndir.addEventListener('click', () => {
        const yapi = okuAktifSinavYapisi();
        const aktifSb = (durum.kurumsalSablonlar || []).find((s) => s.id === durum.aktifKurumSablonId) || {};
        const baraj = Number(aktifSb.akreditasyonBaraj) || 60;
        const kazanimSonuc = C.hesaplaKazanimVeKarneAnalizi(durum.okumaSonuclari, Object.assign({}, yapi, { kazanimBarajYuzde: baraj }));
        const sinavTuru = ((document.getElementById('sec-aktif-sinav-donem-turu') || {}).value) || 'Ara Sınav';
        const agirlik = Number((document.getElementById('ayar-aktif-sinav-agirlik') || {}).value) || 40;
        const paket = {
          belgeTuru: 'DONEM_SINAV_OC_PAKETI_V1',
          dersKodu: yapi.ders.kod,
          dersAdi: yapi.ders.ad,
          sinavTuru,
          agirlik,
          olusturulmaZamani: new Date().toISOString(),
          ogrenciOcMatrisi: kazanimSonuc.ogrenciOcMatrisi || [],
          kazanimTablosu: kazanimSonuc.kazanimTablosu || []
        };
        const temizTur = sinavTuru.replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü_-]+/g, '_');
        indirDelilDosyasi(`${yapi.ders.kod}_${temizTur}_Donem_OC_Paketi.sinavoc.json`, JSON.stringify(paket, null, 2), 'application/json;charset=utf-8');
      });
    }

    const inputDonemDosya = document.getElementById('input-donem-sinav-dosya');
    if (inputDonemDosya) {
      inputDonemDosya.addEventListener('change', async (e) => {
        const uyariDonemEl = document.getElementById('uyari-donem-paket-ders');
        if (uyariDonemEl) {
          uyariDonemEl.hidden = true;
          uyariDonemEl.textContent = '';
        }
        const yapi = okuEtkinOmrSinavYapisi();
        const aktifDersKod = String((yapi.ders && yapi.ders.kod) || '').trim().toUpperCase();
        const reddedilenAdlar = [];
        const dosyalar = Array.from(e.target.files || []);
        for (const d of dosyalar) {
          try {
            const veri = JSON.parse(await d.text());
            const paketDersKod = String((veri && (veri.dersKodu || (veri.ders && veri.ders.kod))) || '').trim().toUpperCase();
            if (paketDersKod && aktifDersKod && aktifDersKod !== 'DERS' && paketDersKod !== aktifDersKod) {
              reddedilenAdlar.push(`${d.name} (${paketDersKod})`);
              continue;
            }
            if (veri && Array.isArray(veri.ogrenciOcMatrisi)) {
              durum.donemDigerSinavlar.push({
                dersKodu: paketDersKod || aktifDersKod,
                dersAdi: String((veri && veri.dersAdi) || (yapi.ders && yapi.ders.ad) || '').slice(0, 80),
                sinavTuru: String(veri.sinavTuru || d.name).slice(0, 40),
                agirlik: Math.max(1, Math.min(100, Number(veri.agirlik) || 60)),
                ogrenciOcMatrisi: veri.ogrenciOcMatrisi,
                kazanimTablosu: Array.isArray(veri.kazanimTablosu) ? veri.kazanimTablosu : []
              });
            } else if (veri && Array.isArray(veri.okumaSonuclari)) {
              const aktifSb = (durum.kurumsalSablonlar || []).find((s) => s.id === durum.aktifKurumSablonId) || {};
              const baraj = Number(aktifSb.akreditasyonBaraj) || 60;
              const kz = C.hesaplaKazanimVeKarneAnalizi(veri.okumaSonuclari, Object.assign({}, yapi, { kazanimBarajYuzde: baraj }));
              durum.donemDigerSinavlar.push({
                dersKodu: paketDersKod || aktifDersKod,
                dersAdi: String((veri && veri.dersAdi) || (yapi.ders && yapi.ders.ad) || '').slice(0, 80),
                sinavTuru: String(veri.sinavTuru || veri.sinavKodu || d.name).slice(0, 40),
                agirlik: Math.max(1, Math.min(100, Number(veri.agirlik) || 60)),
                ogrenciOcMatrisi: kz.ogrenciOcMatrisi || [],
                kazanimTablosu: kz.kazanimTablosu || []
              });
            }
          } catch (_) {}
        }
        verileriKaydet();
        guncelleMaddeAnaliziSekmesi();
        if (reddedilenAdlar.length > 0 && uyariDonemEl) {
          uyariDonemEl.textContent = `⚠️ Ders Kodu Uyuşmazlığı: Yüklenen paket farklı bir derse ait olduğu için reddedildi (${reddedilenAdlar.join(', ')}). Aktif ders kodu: ${aktifDersKod}.`;
          uyariDonemEl.hidden = false;
        }
        inputDonemDosya.value = '';
      });
    }

    const btnDonemTemizle = document.getElementById('btn-donem-paketleri-temizle');
    if (btnDonemTemizle) {
      btnDonemTemizle.addEventListener('click', () => {
        durum.donemDigerSinavlar = [];
        const uyariDonemEl = document.getElementById('uyari-donem-paket-ders');
        if (uyariDonemEl) {
          uyariDonemEl.hidden = true;
          uyariDonemEl.textContent = '';
        }
        verileriKaydet();
        guncelleMaddeAnaliziSekmesi();
      });
    }

    guncelleKurumsalSablonStudyoUI();

    // Öğrenciye doğrudan paylaşılan link (?mod=ogrenci, ?kiosk=1 veya #sinav) ile açıldıysa doğrudan Öğrenci Kiosk ekranını aç
    const urlParam = new URLSearchParams(window.location.search || '');
    const dogrudanOgrenciModu =
      urlParam.get('mod') === 'ogrenci' ||
      urlParam.get('kiosk') === '1' ||
      window.location.hash === '#sinav' ||
      window.location.hash === '#kiosk';

    // F5 / Sayfa Yenileme Koruması: Devam eden aktif Kiosk oturumu varsa kaldığı sorudan ve kalan süreden devam ettir
    let kurtarilanKioskOturum = null;
    try {
      const hamOturum = sessionStorage.getItem('AKTIF_KIOSK_OTURUM_V1');
      if (hamOturum) {
        const cozulen = JSON.parse(hamOturum);
        if (
          cozulen &&
          Array.isArray(cozulen.sorular) &&
          cozulen.aktifSoruIdx < cozulen.sorular.length &&
          (!cozulen.bitisMs || cozulen.bitisMs > Date.now())
        ) {
          kurtarilanKioskOturum = cozulen;
        } else {
          sessionStorage.removeItem('AKTIF_KIOSK_OTURUM_V1');
        }
      }
    } catch (_) {}

    // Açık öğretmen oturumunda sayfa yenilendiyse (F5) sessionStorage'daki doğrulanmış oturumu geri yükle (yazdırmaya blur taşınmaz)
    let kurtarilanHocaOturum = null;
    try {
      const hamHocaOt = sessionStorage.getItem('AKTIF_HOCA_OTURUM_V1');
      const tokenVarMi = location.protocol === 'file:' || Boolean(sessionStorage.getItem('hoca_token'));
      if (hamHocaOt && tokenVarMi) {
        const cozulenHoca = JSON.parse(hamHocaOt);
        if (cozulenHoca && cozulenHoca.kullaniciAdi) {
          kurtarilanHocaOturum = cozulenHoca;
        }
      }
    } catch (_) {}

    const kilitleHocaArayuzu = () => {
      durum.hocaOturumAcik = false;
      document.body.classList.remove('hoca-oturum-acik');
      const navEl = document.getElementById('ust-sekme-nav');
      if (navEl) {
        navEl.inert = true;
        navEl.setAttribute('inert', '');
        navEl.style.filter = 'none';
        navEl.style.pointerEvents = 'none';
        navEl.style.userSelect = 'none';
      }
      const anaEl = document.getElementById('ana-icerik-alani');
      if (anaEl) {
        anaEl.inert = true;
        anaEl.setAttribute('inert', '');
        anaEl.style.filter = 'none';
        anaEl.style.pointerEvents = 'none';
        anaEl.style.userSelect = 'none';
      }
      document.getElementById('modal-hoca-giris').style.display = 'flex';
    };

    if (!kurtarilanKioskOturum && !dogrudanOgrenciModu && kurtarilanHocaOturum) {
      durum.hocaOturumAcik = true;
      document.body.classList.add('hoca-oturum-acik');
      const navEl = document.getElementById('ust-sekme-nav');
      if (navEl) {
        navEl.inert = false;
        navEl.removeAttribute('inert');
        navEl.style.filter = 'none';
        navEl.style.pointerEvents = 'auto';
        navEl.style.userSelect = 'auto';
      }
      const anaEl = document.getElementById('ana-icerik-alani');
      if (anaEl) {
        anaEl.inert = false;
        anaEl.removeAttribute('inert');
        anaEl.style.filter = 'none';
        anaEl.style.pointerEvents = 'auto';
        anaEl.style.userSelect = 'auto';
      }
      document.getElementById('modal-hoca-giris').style.display = 'none';
      const etkKul = document.getElementById('etiket-aktif-hoca-kullanici');
      if (etkKul) etkKul.textContent = kurtarilanHocaOturum.kullaniciAdi;
      const rozetDurum = document.getElementById('rozet-hoca-oturum-durum');
      if (rozetDurum) {
        rozetDurum.className = 'rozet rozet-yesil';
        rozetDurum.textContent = `🟢 Oturum Açık (${kurtarilanHocaOturum.kullaniciAdi})`;
      }
      bulutKasadanYukle(false).catch(() => {});
    }

    if (kurtarilanKioskOturum) {
      durum.kioskOturum = kurtarilanKioskOturum;
      durum.kioskOturum.kalanSn = Math.max(0, Math.ceil((durum.kioskOturum.bitisMs - Date.now()) / 1000));
      document.body.classList.add('kiosk-aktif');
      document.getElementById('modal-hoca-giris').style.display = 'none';
      document.getElementById('ana-icerik-alani').style.display = 'none';
      document.getElementById('kiosk-sinav-alani').style.display = 'block';
      document.getElementById('kiosk-giris-formu').style.display = 'none';
      document.getElementById('kiosk-soru-sahne').style.display = 'block';
      document.getElementById('btn-kiosk-cevap-kilitle').style.display = 'block';
      ekleKioskDelilLog(
        'OTURUM_DEVAM_ETTI',
        `Sayfa yenilendi (F5); öğrenci (${durum.kioskOturum.ogrNo}) ${durum.kioskOturum.aktifSoruIdx + 1}. sorudan ve kalan ${durum.kioskOturum.kalanSn} sn süreden sınava devam etti.`
      );
      gosterKioskAktifSoru();
      guncelleKioskCanliSureUI(durum.kioskOturum);
      C.kurGuvenliInterval('kiosk-sayac', () => {
        const ot = durum.kioskOturum;
        if (!ot) return;
        ot.kalanSn = ot.bitisMs ? Math.max(0, Math.ceil((ot.bitisMs - Date.now()) / 1000)) : Math.max(0, Math.min(99999, ot.kalanSn - 1));
        guncelleKioskCanliSureUI(ot);
        kaydetAktifKioskOturumYerel();
        if (ot.kalanSn <= 0) {
          if (ot.aktifSoruIdx < ot.sorular.length) {
            const aktifSoru = ot.sorular[ot.aktifSoruIdx];
            let otomatikDeger = null;
            if (aktifSoru && aktifSoru.tur === 'klasik') {
              const kl = document.getElementById('kiosk-klasik-cevap');
              otomatikDeger = kl ? kl.value.trim() : '';
            } else {
              const secili = document.querySelector('input[name="kiosk-secim"]:checked');
              otomatikDeger = secili ? secili.value : null;
            }
            ot.cevaplar.push(otomatikDeger);
            if ((location.protocol === 'http:' || location.protocol === 'https:') && aktifSoru) {
              const token = sessionStorage.getItem('kiosk_token') || '';
              if (token) {
                ot.__sonCevapSozu = fetch('/api/ogrenci-cevap', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({
                    token,
                    ogrNo: ot.ogrNo,
                    soruId: aktifSoru.id || `S-${ot.aktifSoruIdx + 1}`,
                    secim: otomatikDeger || '',
                    sureBittiOtomatik: true
                  })
                }).catch(() => null);
              }
            }
          }
          bitirKioskOturumu('Süre Doldu — Otomatik Teslim', { sureBittiOtomatik: true });
        }
      }, 1000);
    } else if (dogrudanOgrenciModu) {
      yukleSunucuAktifOnlineSinavDurumu();
      guncelleKioskOgrenciSinavListesiUI();
      document.body.classList.add('kiosk-aktif');
      document.getElementById('modal-hoca-giris').style.display = 'none';
      document.getElementById('ana-icerik-alani').style.display = 'none';
      document.getElementById('kiosk-sinav-alani').style.display = 'block';
      const btnCikis = document.getElementById('btn-kiosk-cikis');
      if (btnCikis) btnCikis.style.display = 'none';
    } else if (!durum.hocaOturumAcik) {
      kilitleHocaArayuzu();
    }

    // 5 MB kota aşımı bayrağı aktifse ve IndexedDB'de daha fazla soru/veri varsa otomatik geri yükle
    try {
      if (localStorage.getItem('SINAV_IDB_KOTA_YEDEK_AKTIF') === '1') {
        idbYedekOku().then((idbVeri) => {
          if (
            idbVeri &&
            idbVeri.ana &&
            typeof idbVeri.ana === 'object' &&
            Array.isArray(idbVeri.ana.sorular) &&
            idbVeri.ana.sorular.length > (durum.sorular || []).length
          ) {
            uygulaYuklenenDurumNesnesi(idbVeri.ana);
            doldurDersSecici();
            guncelleOgrenciListesiSekmesi();
            guncelleSoruBankasiTablosu();
            guncelleA4Onizleme();
            guncelleOmrTabloVeKuyruk();
            guncelleMaddeAnaliziSekmesi();
          }
        });
      }
    } catch (_) {}

    // =======================================================================
    // MASTER TASARIM KABUĞU, YAŞAM DÖNGÜSÜ ÇUBUĞU, AKILLI YAPIŞTIRMA & UÇUŞ KONTROLÜ
    // =======================================================================
    const gecisSekmeYardimci = (hedefSekmeId) => {
      const btn = document.querySelector(`[data-sekme="${hedefSekmeId}"]`);
      if (btn) btn.click();
    };

    // 1. Sol Yan Menü Daraltma (224px <-> 56px Ray) ve Mobil Çekmece (<900px)
    try {
      if (localStorage.getItem('SINAV_YAN_MENU_DAR_V1') === '1') {
        document.body.classList.add('yan-menu-dar');
      }
    } catch (_) {}

    const degistirYanMenuDarMod = (zorlaAc) => {
      const darMi = zorlaAc === true
        ? (document.body.classList.remove('yan-menu-dar'), false)
        : document.body.classList.toggle('yan-menu-dar');
      const btnD = document.getElementById('btn-yan-menu-daralt');
      if (btnD) {
        btnD.setAttribute('aria-label', darMi ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt');
        btnD.setAttribute('title', darMi ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt');
      }
      try { localStorage.setItem('SINAV_YAN_MENU_DAR_V1', darMi ? '1' : '0'); } catch (_) {}
    };

    const btnYanMenuDaralt = document.getElementById('btn-yan-menu-daralt');
    if (btnYanMenuDaralt) {
      btnYanMenuDaralt.addEventListener('click', () => degistirYanMenuDarMod(false));
    }

    const markaBlokEl = document.querySelector('#ust-sekme-nav .marka-blok');
    if (markaBlokEl) {
      markaBlokEl.addEventListener('click', () => {
        if (document.body.classList.contains('yan-menu-dar')) {
          degistirYanMenuDarMod(true);
        }
      });
    }

    const btnMobilYanMenuAc = document.getElementById('btn-mobil-yan-menu-ac');
    if (btnMobilYanMenuAc) {
      btnMobilYanMenuAc.addEventListener('click', () => {
        document.body.classList.toggle('mobil-menu-acik');
      });
    }

    document.querySelectorAll('#ust-sekme-nav [data-sekme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.body.classList.remove('mobil-menu-acik');
        if (typeof window.__guncelleDerslerVeBosDurumUI === 'function') window.__guncelleDerslerVeBosDurumUI();
        if (typeof window.__guncelleYasamDongusuRozetUI === 'function') window.__guncelleYasamDongusuRozetUI();
      });
    });

    // 2. Giriş Kapısı Sade / Detay Geçişleri ve Ayarlar Kısayolları
    const modalHocaGirisEl = document.getElementById('modal-hoca-giris');
    const btnGirisAcKurtarma = document.getElementById('btn-giris-ac-kurtarma');
    if (btnGirisAcKurtarma && modalHocaGirisEl) {
      btnGirisAcKurtarma.addEventListener('click', () => {
        modalHocaGirisEl.setAttribute('data-giris-modu', 'detay');
        const ep = document.getElementById('hoca-kurtarma-eposta');
        if (ep) ep.focus();
      });
    }
    const btnGirisAcDavet = document.getElementById('btn-giris-ac-davet');
    if (btnGirisAcDavet && modalHocaGirisEl) {
      btnGirisAcDavet.addEventListener('click', () => {
        modalHocaGirisEl.setAttribute('data-giris-modu', 'detay');
        const dk = document.getElementById('hoca-kayit-davet-kodu');
        if (dk) dk.focus();
      });
    }
    const btnGirisSadeDon = document.getElementById('btn-giris-sade-don');
    if (btnGirisSadeDon && modalHocaGirisEl) {
      btnGirisSadeDon.addEventListener('click', () => {
        modalHocaGirisEl.setAttribute('data-giris-modu', 'sade');
      });
    }
    if (modalHocaGirisEl) {
      modalHocaGirisEl.addEventListener('click', (e) => {
        if (e.target !== modalHocaGirisEl) return;
        const btnAc = document.getElementById('btn-hoca-giris-ac');
        if (!btnAc) return;
        const r = btnAc.getBoundingClientRect();
        if (r.width > 0 && e.clientX >= r.left - 4 && e.clientX <= r.right + 4 && e.clientY >= r.top - 4 && e.clientY <= r.bottom + 4) {
          modalHocaGirisEl.setAttribute('data-giris-modu', 'detay');
          guncelleHocaYonetimPaneliUI();
        }
      });
    }

    const btnAyarlarHocaYonetimAc = document.getElementById('btn-ayarlar-hoca-yonetim-ac');
    if (btnAyarlarHocaYonetimAc) {
      btnAyarlarHocaYonetimAc.addEventListener('click', () => {
        const b = document.getElementById('btn-hoca-giris-ac');
        if (b) b.click();
      });
    }
    const btnAyarlarOmrTanilamaAc = document.getElementById('btn-ayarlar-omr-tanilama-ac');
    if (btnAyarlarOmrTanilamaAc) {
      btnAyarlarOmrTanilamaAc.addEventListener('click', () => {
        gecisSekmeYardimci('sekme-omr');
        const btnSentetik = document.getElementById('btn-sentetik-test');
        if (btnSentetik) btnSentetik.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    // 3. Üst Bağlam Çubuğu (48px), Geri Al Bildirimi (Toast) ve 5 Aşamalı Sınav Yaşam Döngüsü
    const secKayitliSinavUst = document.getElementById('sec-kayitli-sinav-ust');
    if (secKayitliSinavUst) {
      secKayitliSinavUst.addEventListener('change', (e) => {
        yukleKayitliSinavSnapshot(e.target.value);
      });
    }

    const rozetKayitDurumuTikla = document.getElementById('rozet-kayit-durumu');
    if (rozetKayitDurumuTikla) {
      rozetKayitDurumuTikla.addEventListener('click', () => {
        const panel = document.getElementById('kutu-bulut-gecmis-panel');
        if (panel && !panel.hidden && panel.style.display !== 'none') {
          panel.hidden = true;
          panel.style.display = 'none';
        } else {
          acVeDoldurBulutGecmisPaneli();
        }
      });
    }

    const btnToastGeriAl = document.getElementById('btn-toast-geri-al');
    if (btnToastGeriAl) {
      btnToastGeriAl.addEventListener('click', () => {
        gizleGeriAlToast();
        uygulaSonGeriAlYedegi();
      });
    }
    const btnToastKapat = document.getElementById('btn-toast-kapat') || document.getElementById('btn-geri-al-kapat');
    if (btnToastKapat) {
      btnToastKapat.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        gizleGeriAlToast();
      });
    }
    const toastGeriAlKapsayici = document.getElementById('toast-geri-al');
    if (toastGeriAlKapsayici) {
      toastGeriAlKapsayici.addEventListener('click', (e) => {
        if (e.target.closest('#btn-toast-kapat, #btn-geri-al-kapat, .toast-kapat-btn, [data-toast-kapat]')) {
          e.preventDefault();
          gizleGeriAlToast();
        }
      });
    }

    // Sol Panel Genişletme Sürüklemesi (#sol-paneli-boyutlandir: 260px - 560px, pointer + mouse fallback, localStorage kalıcı)
    const solPanelTutamac = document.getElementById('sol-paneli-boyutlandir');
    const studyoDuzenEl = document.querySelector('#sekme-stüdyo .iki-sutun-duzen, .studyo-iki-sutun');
    if (solPanelTutamac && studyoDuzenEl) {
      const uygulaSolPanelGenislik = (hedefPx, kaydet = false) => {
        const ekranTavan = Math.min(560, Math.max(260, Math.floor((window.innerWidth || 1280) * 0.52)));
        const sikistirilmis = Math.max(260, Math.min(ekranTavan, Math.round(Number(hedefPx) || 320)));
        studyoDuzenEl.style.setProperty('--studyo-sol-genislik', `${sikistirilmis}px`);
        document.documentElement.style.setProperty('--studyo-sol-genislik', `${sikistirilmis}px`);
        const solAside = studyoDuzenEl.querySelector('aside');
        if (solAside && (window.innerWidth || 1280) > 900) {
          solAside.style.width = `${sikistirilmis}px`;
        }
        solPanelTutamac.setAttribute('aria-valuenow', String(sikistirilmis));
        if (kaydet) {
          try { localStorage.setItem('SINAV_SOL_PANEL_GENISLIK_V1', String(sikistirilmis)); } catch (_) {}
        }
        return sikistirilmis;
      };

      try {
        const kayitliGenislik = Number(localStorage.getItem('SINAV_SOL_PANEL_GENISLIK_V1') || 0);
        if (kayitliGenislik >= 260 && kayitliGenislik <= 560) {
          uygulaSolPanelGenislik(kayitliGenislik, false);
        }
      } catch (_) {}

      let aktifSurukleme = null;
      const bitirPanelSurukleme = () => {
        if (!aktifSurukleme) return;
        const sonGenislik = aktifSurukleme.sonGenislik;
        const pointerId = aktifSurukleme.pointerId;
        aktifSurukleme = null;
        document.body.classList.remove('panel-surukleniyor');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('pointermove', onPointerHareket);
        window.removeEventListener('pointerup', bitirPanelSurukleme);
        window.removeEventListener('pointercancel', bitirPanelSurukleme);
        window.removeEventListener('mousemove', onMouseHareket);
        window.removeEventListener('mouseup', bitirPanelSurukleme);
        window.removeEventListener('blur', bitirPanelSurukleme);
        if (pointerId !== null && typeof solPanelTutamac.releasePointerCapture === 'function') {
          try { solPanelTutamac.releasePointerCapture(pointerId); } catch (_) {}
        }
        uygulaSolPanelGenislik(sonGenislik, true);
      };
      const guncelleSurukleKonum = (clientX) => {
        if (!aktifSurukleme || !Number.isFinite(clientX)) return;
        const fark = clientX - aktifSurukleme.baslangicX;
        aktifSurukleme.sonGenislik = uygulaSolPanelGenislik(aktifSurukleme.baslangicGenislik + fark, false);
      };
      const onPointerHareket = (e) => {
        if (!aktifSurukleme) return;
        guncelleSurukleKonum(e.clientX);
      };
      const onMouseHareket = (e) => {
        if (!aktifSurukleme) return;
        guncelleSurukleKonum(e.clientX);
      };
      const baslatPanelSurukleme = (clientX, pointerId = null) => {
        if (aktifSurukleme) bitirPanelSurukleme();
        const solAside = studyoDuzenEl.querySelector('aside');
        const mevcutGen = solAside
          ? Math.round(solAside.getBoundingClientRect().width || 320)
          : (parseInt(getComputedStyle(studyoDuzenEl).getPropertyValue('--studyo-sol-genislik'), 10) || 320);
        aktifSurukleme = {
          baslangicX: clientX,
          baslangicGenislik: Math.max(260, Math.min(560, mevcutGen)),
          sonGenislik: Math.max(260, Math.min(560, mevcutGen)),
          pointerId
        };
        document.body.classList.add('panel-surukleniyor');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        if (pointerId !== null && typeof solPanelTutamac.setPointerCapture === 'function') {
          try { solPanelTutamac.setPointerCapture(pointerId); } catch (_) {}
        }
        window.addEventListener('pointermove', onPointerHareket);
        window.addEventListener('pointerup', bitirPanelSurukleme);
        window.addEventListener('pointercancel', bitirPanelSurukleme);
        window.addEventListener('mousemove', onMouseHareket);
        window.addEventListener('mouseup', bitirPanelSurukleme);
        window.addEventListener('blur', bitirPanelSurukleme);
      };

      solPanelTutamac.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        baslatPanelSurukleme(e.clientX, e.pointerId !== undefined ? e.pointerId : null);
      });
      solPanelTutamac.addEventListener('mousedown', (e) => {
        if (aktifSurukleme || (e.button !== undefined && e.button !== 0)) return;
        e.preventDefault();
        baslatPanelSurukleme(e.clientX, null);
      });
      solPanelTutamac.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const mevcut = parseInt(solPanelTutamac.getAttribute('aria-valuenow') || '320', 10) || 320;
        const adim = e.key === 'ArrowRight' ? 16 : -16;
        uygulaSolPanelGenislik(mevcut + adim, true);
      });
    }

    if (!durum.kesinlesmisSinavHaritasi || typeof durum.kesinlesmisSinavHaritasi !== 'object') {
      durum.kesinlesmisSinavHaritasi = {};
    }

    const hesaplaAktifYasamDongusuAsamasi = () => {
      const anahtar = `${durum.aktifDersId || 'genel'}::${durum.aktifKayitliSinavId || 'taslak'}`;
      const seciliKayit = durum.aktifKayitliSinavId
        ? (durum.kayitliSinavlar || []).find((k) => k && k.id === durum.aktifKayitliSinavId)
        : null;
      if (durum.kesinlesmisSinavHaritasi[anahtar]) {
        return { kod: 'kesinlesti', etiket: 'Kesinleşti', sinif: 'rozet rozet-yesil', cta: 'OBS Çizelgesi İndir' };
      }
      if ((durum.okumaSonuclari || []).length > 0) {
        return { kod: 'okunuyor', etiket: 'Okunuyor', sinif: 'rozet rozet-mavi', cta: 'Sonuçları Gör' };
      }
      if (seciliKayit && seciliKayit.basildiKilidi) {
        return { kod: 'basildi', etiket: 'Basıldı', sinif: 'rozet rozet-sari', cta: 'Okumayı Başlat' };
      }
      const dy = parseInt((document.getElementById('ayar-dy-sayisi') || {}).value || '0', 10) || 0;
      const ts = parseInt((document.getElementById('ayar-test-sayisi') || {}).value || '0', 10) || 0;
      const kl = parseInt((document.getElementById('ayar-klasik-sayisi') || {}).value || '0', 10) || 0;
      const pTop = (dy > 0 ? Number((document.getElementById('ayar-dy-toplam-puan') || {}).value || 0) : 0)
        + (ts > 0 ? Number((document.getElementById('ayar-test-toplam-puan') || {}).value || 0) : 0)
        + (kl > 0 ? Number((document.getElementById('ayar-klasik-toplam-puan') || {}).value || 0) : 0);
      if (dy + ts + kl > 0 && Math.abs(pTop - 100) < 0.01) {
        return { kod: 'hazir', etiket: 'Baskıya Hazır', sinif: 'rozet rozet-yesil', cta: 'Baskı Öncesi Kontrol' };
      }
      return { kod: 'taslak', etiket: 'Taslak', sinif: 'rozet rozet-mavi', cta: 'Baskı Öncesi Kontrol' };
    };

    window.__guncelleYasamDongusuRozetUI = () => {
      const rozet = document.getElementById('rozet-yasam-dongusu');
      const btnCta = document.getElementById('btn-yasam-dongusu-cta');
      const asama = hesaplaAktifYasamDongusuAsamasi();
      if (rozet) {
        rozet.className = asama.sinif;
        rozet.textContent = asama.etiket;
      }
      if (btnCta) {
        btnCta.textContent = asama.cta;
        btnCta.dataset.asama = asama.kod;
      }
    };

    // 4. İlk Kurulum Boş Durumu ve Dersler Sekmesi (#sekme-dersler)
    window.__guncelleDerslerVeBosDurumUI = () => {
      const dersler = Array.isArray(durum.dersler) ? durum.dersler : [];
      const rozetDersSayisi = document.getElementById('rozet-ders-sayisi');
      if (rozetDersSayisi) rozetDersSayisi.textContent = String(dersler.length);

      const bosKart = document.getElementById('bos-durum-ilk-kurulum');
      if (bosKart) bosKart.hidden = dersler.length > 0;

      const listeEl = document.getElementById('liste-sekme-dersler');
      const baslikDetay = document.getElementById('baslik-aktif-ders-detay');
      const ozetDetay = document.getElementById('ozet-sekme-ders-detay');
      if (listeEl) {
        if (dersler.length === 0) {
          listeEl.innerHTML = '<div style="color:var(--metin-soluk); font-size:var(--yazi-sm);">Henüz kayıtlı ders yok. Yeni Ders düğmesiyle ilk dersinizi oluşturun.</div>';
        } else {
          listeEl.innerHTML = dersler
            .map((d) => {
              const aktifMi = d.id === durum.aktifDersId;
              const soruAdet = (durum.sorular || []).filter((s) => s && !s.arsivde && s.dersId === d.id).length;
              const ocAdet = Array.isArray(d.ogrenimCiktilari) ? d.ogrenimCiktilari.length : 0;
              return `
                <div class="ucus-kontrol-satir" style="padding:10px 12px; border:1px solid ${aktifMi ? 'var(--birincil)' : 'var(--kenar)'}; border-radius:8px; background:${aktifMi ? 'var(--birincil-acik)' : 'var(--bg-kart)'}; cursor:pointer;" data-sec-ders-kart="${C.kacisHTML(d.id)}">
                  <div>
                    <strong>${C.kacisHTML(d.kod)} — ${C.kacisHTML(d.ad)}</strong>
                    <div style="font-size:var(--yazi-xs); color:var(--metin-ikincil);">${soruAdet} Soru · ${ocAdet} Bologna ÖÇ · ${C.kacisHTML(d.hoca || '')}</div>
                  </div>
                  <span class="rozet ${aktifMi ? 'rozet-mavi' : ''}">${aktifMi ? 'Aktif' : 'Seç'}</span>
                </div>
              `;
            })
            .join('');
        }
      }
      if (ozetDetay) {
        const aktifDers = dersler.find((d) => d.id === durum.aktifDersId) || dersler[0] || null;
        if (!aktifDers) {
          if (baslikDetay) baslikDetay.textContent = 'Aktif Ders Özeti';
          ozetDetay.innerHTML = 'Ders seçildiğinde Bologna öğrenim çıktıları (ÖÇ), soru dağılımı ve şablon bilgileri burada görüntülenir.';
        } else {
          if (baslikDetay) baslikDetay.textContent = `${aktifDers.kod} — ${aktifDers.ad}`;
          const ocler = Array.isArray(aktifDers.ogrenimCiktilari) ? aktifDers.ogrenimCiktilari : [];
          const soruAdet = (durum.sorular || []).filter((s) => s && !s.arsivde && s.dersId === aktifDers.id).length;
          ozetDetay.innerHTML = `
            <div style="display:grid; gap:6px; margin-bottom:10px;">
              <div><strong>Birim / Bölüm:</strong> ${C.kacisHTML(aktifDers.fakulte || '—')} / ${C.kacisHTML(aktifDers.bolum || '—')}</div>
              <div><strong>Sorumlu Eğitmen:</strong> ${C.kacisHTML(aktifDers.hoca || '—')}</div>
              <div><strong>Havuzdaki Soru:</strong> ${soruAdet} Soru · <strong>Kayıtlı Öğrenci:</strong> ${(durum.ogrenciler || []).length} Kişi</div>
            </div>
            <div style="font-weight:600; color:var(--metin); margin-bottom:4px;">Bologna Öğrenim Çıktıları (${ocler.length}):</div>
            ${ocler.length === 0
              ? '<div style="font-size:var(--yazi-xs); color:var(--metin-soluk);">Henüz ÖÇ tanımlanmadı. Bologna İçe Aktar veya Ders ve ÖÇ Düzenle ile ekleyebilirsiniz.</div>'
              : `<div style="display:grid; gap:4px;">${ocler.map((o) => `<div style="padding:4px 8px; background:var(--bg-ikincil); border-radius:6px; font-size:var(--yazi-xs);"><strong>${C.kacisHTML(o.kod)}:</strong> ${C.kacisHTML(o.aciklama)}</div>`).join('')}</div>`}
          `;
        }
      }
    };

    const listeSekmeDerslerEl = document.getElementById('liste-sekme-dersler');
    if (listeSekmeDerslerEl) {
      listeSekmeDerslerEl.addEventListener('click', (e) => {
        const kart = e.target.closest('[data-sec-ders-kart]');
        if (!kart) return;
        const yeniId = kart.getAttribute('data-sec-ders-kart');
        if (!yeniId) return;
        degistirAktifDersGuvenli(yeniId);
        verileriKaydet();
        yenileTumSekmePanelleriUI();
      });
    }

    ['btn-bos-adim-ders', 'btn-dersler-yeni-ac', 'btn-dersler-oc-duzenle'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', () => {
          const btnModal = document.getElementById('btn-yeni-ders-modal');
          if (btnModal) btnModal.click();
        });
      }
    });

    const btnDerslerBologna = document.getElementById('btn-dersler-bologna-ice-aktar');
    if (btnDerslerBologna) {
      btnDerslerBologna.addEventListener('click', () => {
        const modalBol = document.getElementById('modal-bologna-ice-aktar');
        if (modalBol) modalBol.style.display = 'flex';
      });
    }

    const btnBosAdimOgrenci = document.getElementById('btn-bos-adim-ogrenci');
    if (btnBosAdimOgrenci) btnBosAdimOgrenci.addEventListener('click', () => gecisSekmeYardimci('sekme-ogrenciler'));
    const btnBosAdimKagit = document.getElementById('btn-bos-adim-kagit');
    if (btnBosAdimKagit) btnBosAdimKagit.addEventListener('click', () => gecisSekmeYardimci('sekme-stüdyo'));

    const btnOrnekDersleDene = document.getElementById('btn-ornek-dersle-dene');
    if (btnOrnekDersleDene) {
      btnOrnekDersleDene.addEventListener('click', () => {
        kaydetSonGeriAlYedegi('Örnek Ders Kurulumu');
        const ornekId = 'ders-ornek-' + Date.now().toString(36);
        const yeniDers = {
          id: ornekId,
          kod: 'BİL101',
          ad: 'Bilgisayar Ağları ve Güvenliği',
          bolum: 'Bilgisayar Teknolojileri Bölümü',
          fakulte: 'Meslek Yüksekokulu',
          hoca: 'Öğr. Gör. Örnek Eğitmen',
          ogrenimCiktilari: [
            { kod: 'ÖÇ-1', aciklama: 'Ağ katmanlarını ve temel protokolleri açıklar.' },
            { kod: 'ÖÇ-2', aciklama: 'Güvenli iletişim ve şifreleme ilkelerini uygular.' },
            { kod: 'ÖÇ-3', aciklama: 'Ağ trafiğini ve güvenlik politikalarını analiz eder.' }
          ]
        };
        durum.dersler.push(yeniDers);
        const ornekMetin = [
          '1. [DY] [ÖÇ-1] TCP bağlantı yönelimli bir taşıma katmanı protokolüdür. (D)',
          '2. [DY] [ÖÇ-2] HTTP trafiği varsayılan olarak uçtan uca şifrelenir. (Y)',
          '3. [DY] [ÖÇ-1] IPv6 adresleri 128 bit uzunluğundadır. (D)',
          '4. [DY] [ÖÇ-3] Güvenlik duvarı iç ağdan gelen hiçbir paketi denetlemez. (Y)',
          '5. [ÖÇ-1] Aşağıdakilerden hangisi taşıma katmanı protokolü değildir?\nA) TCP\nB) UDP\nC) ARP\nD) SCTP\nE) QUIC\nCevap: C',
          '6. [ÖÇ-2] HTTPS varsayılan olarak hangi TCP portunu kullanır?\nA) 21\nB) 22\nC) 80\nD) 443\nE) 8080\nCevap: D',
          '7. [ÖÇ-2] Aşağıdakilerden hangisi simetrik şifreleme algoritması değildir?\nA) AES\nB) ChaCha20\nC) RSA\nD) 3DES\nE) Twofish\nCevap: C',
          '8. [ÖÇ-1] Yerel ağda IP adresini MAC adresine çözümleyen protokol hangisidir?\nA) DNS\nB) ARP\nC) ICMP\nD) DHCP\nE) BGP\nCevap: B',
          '9. [ÖÇ-3] Aşağıdakilerden hangisi Sıfır Güven (Zero-Trust) ilkelerinden biri olamaz?\nA) En az yetki ilkesi\nB) Sürekli kimlik doğrulama\nC) İç ağa koşulsuz güven\nD) Mikro segmentasyon\nE) Oturum bazlı yetkilendirme\nCevap: C',
          '10. [ÖÇ-3] Paket anahtarlamalı ağlarda gecikme dalgalanmasına ne ad verilir?\nA) Jitter\nB) Bant genişliği\nC) Zayıflama\nD) Çerçeveleme\nE) Çoklama\nCevap: A',
          '11. [KLASİK] [ÖÇ-3] Güvenlik duvarı (Firewall) ile saldırı tespit sistemi (IDS) arasındaki farkı açıklayınız.',
          '12. [KLASİK] [ÖÇ-2] TLS el sıkışmasının (Handshake) temel adımlarını kısaca yazınız.'
        ].join('\n\n');
        const ornekSorular = C.metindenSorulariAyikla(ornekMetin, ornekId).map((s, i) => Object.assign({}, s, { hafta: (i % 6) + 1 }));
        durum.sorular.push(...ornekSorular);
        if ((durum.ogrenciKayitlari || []).length === 0) {
          durum.ogrenciKayitlari = ogrenciKayitlariniHazirla([
            { ogrNo: '2026101011', adSoyad: 'Ayşe Yılmaz', bolum: 'Bilgisayar Programcılığı', dersIdler: [ornekId] },
            { ogrNo: '2026101024', adSoyad: 'Mehmet Demir', bolum: 'Bilgisayar Programcılığı', dersIdler: [ornekId] },
            { ogrNo: '2026101037', adSoyad: 'Zeynep Kaya', bolum: 'Bilgisayar Programcılığı', dersIdler: [ornekId] }
          ]);
        }
        degistirAktifDersGuvenli(ornekId);
        verileriKaydet({ mesaj: `Örnek ders (${yeniDers.kod}) oluşturuldu` });
        yenileTumSekmePanelleriUI();
        gecisSekmeYardimci('sekme-stüdyo');
      });
    }

    // 5. Soru Bankası Arama (180ms debounce) ve %90 Genişlikli Akıllı Yapıştırma Çekmecesi
    const araSoruBankasiEl = document.getElementById('ara-soru-bankasi');
    if (araSoruBankasiEl) {
      let araBankaDebounce = null;
      araSoruBankasiEl.addEventListener('input', () => {
        clearTimeout(araBankaDebounce);
        araBankaDebounce = setTimeout(() => {
          durum.soruBankasiSayfa = 1;
          guncelleSoruBankasiTablosu();
        }, 180);
      });
    }

    const perdeAkilli = document.getElementById('perde-akilli-yapistir');
    const girdiAkilliMetin = document.getElementById('akilli-yapistir-metin');
    const kutuAkilliOnizleme = document.getElementById('akilli-yapistir-onizleme');
    const btnAkilliEkle = document.getElementById('btn-akilli-yapistir-ekle');
    const etiketAkilliSayac = document.getElementById('etiket-akilli-yapistir-sayac');
    let akilliOnizlemeSorulari = [];
    let akilliZamanlayici = null;

    const cizAkilliOnizlemeKartlari = () => {
      if (!kutuAkilliOnizleme || !btnAkilliEkle || !etiketAkilliSayac) return;
      const adet = akilliOnizlemeSorulari.length;
      etiketAkilliSayac.textContent = `${adet} soru ayrıştırıldı`;
      btnAkilliEkle.textContent = `${adet} soruyu ekle`;
      btnAkilliEkle.disabled = adet === 0;
      if (adet === 0) {
        kutuAkilliOnizleme.innerHTML = '<div style="color:var(--metin-soluk); font-size:var(--yazi-sm);">Sol tarafa metin yapıştırdığınızda ayrıştırılan sorular anında burada listelenir.</div>';
        return;
      }
      const harfler = ['A', 'B', 'C', 'D', 'E'];
      kutuAkilliOnizleme.innerHTML = akilliOnizlemeSorulari
        .map((s, idx) => {
          const turEtiket = s.tur === 'test' ? 'Çoktan Seçmeli' : (s.tur === 'dy' ? 'Doğru / Yanlış' : 'Açık Uçlu');
          let cevapSeciciHTML = '';
          if (s.tur === 'test') {
            const secenekAdet = Math.max(4, Math.min(5, (s.siklar || []).length || 5));
            cevapSeciciHTML = `
              <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap; margin-top:6px;">
                <span style="font-size:var(--yazi-xs); color:var(--metin-ikincil);">Doğru şık:</span>
                ${harfler.slice(0, secenekAdet).map((h) => `
                  <button type="button" class="btn btn-kucuk ${s.dogruHarf === h ? 'btn-birincil' : ''}" style="min-height:24px; padding:2px 8px;" data-akilli-idx="${idx}" data-akilli-harf="${h}">${h}</button>
                `).join('')}
              </div>
            `;
          } else if (s.tur === 'dy') {
            cevapSeciciHTML = `
              <div style="display:flex; align-items:center; gap:4px; margin-top:6px;">
                <span style="font-size:var(--yazi-xs); color:var(--metin-ikincil);">Doğru yanıt:</span>
                <button type="button" class="btn btn-kucuk ${s.dogruDY === 'D' ? 'btn-birincil' : ''}" style="min-height:24px; padding:2px 8px;" data-akilli-idx="${idx}" data-akilli-dy="D">Doğru (D)</button>
                <button type="button" class="btn btn-kucuk ${s.dogruDY === 'Y' ? 'btn-birincil' : ''}" style="min-height:24px; padding:2px 8px;" data-akilli-idx="${idx}" data-akilli-dy="Y">Yanlış (Y)</button>
              </div>
            `;
          }
          const siklarListesiHTML = s.tur === 'test' && Array.isArray(s.siklar) && s.siklar.length > 0
            ? `<div style="margin-top:4px; font-size:var(--yazi-xs); color:var(--metin-ikincil); display:grid; gap:2px;">${s.siklar.map((sk, si) => `<div><strong>${harfler[si] || '?'})</strong> ${C.kacisHTML(sk)}</div>`).join('')}</div>`
            : '';
          return `
            <div data-akilli-kart="${idx}" style="padding:10px 12px; background:var(--bg-kart); border:1px solid var(--kenar); border-radius:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:4px;">
                <span class="rozet rozet-mavi">${idx + 1} · ${turEtiket}</span>
                <span class="mono" style="font-size:11px; color:var(--metin-soluk);">H${C.normalizeHaftaNo(s.hafta, 1)} · ${C.kacisHTML(s.ocKodu || 'ÖÇ-1')}</span>
              </div>
              <div style="font-size:var(--yazi-sm); color:var(--metin); font-weight:500;">${vurgulaOlumsuzSoruKokuHTML(C.kacisHTML(s.metin))}</div>
              ${siklarListesiHTML}
              ${cevapSeciciHTML}
            </div>
          `;
        })
        .join('');
    };

    const ayristirAkilliYapistirSimdi = () => {
      const ham = (girdiAkilliMetin && girdiAkilliMetin.value) || '';
      const vHafta = C.normalizeHaftaNo((document.getElementById('akilli-yapistir-hafta') || {}).value || 1, 1);
      const vOc = C.normalizeOcKodu((document.getElementById('akilli-yapistir-oc') || {}).value || 'ÖÇ-1', 'ÖÇ-1');
      const hamMetinKaynagi = ham.trim();
      if (!hamMetinKaynagi) {
        akilliOnizlemeSorulari = [];
        cizAkilliOnizlemeKartlari();
        return;
      }
      const ayiklanan = C.metindenSorulariAyikla(hamMetinKaynagi, durum.aktifDersId || 'genel');
      akilliOnizlemeSorulari = ayiklanan.map((s) => Object.assign({}, s, {
        hafta: s.hafta ? C.normalizeHaftaNo(s.hafta, vHafta) : vHafta,
        ocKodu: s.ocKodu || vOc
      }));
      cizAkilliOnizlemeKartlari();
    };

    const acAkilliYapistirCekmecesi = () => {
      if (!perdeAkilli) return;
      perdeAkilli.classList.add('acik');
      ayristirAkilliYapistirSimdi();
      if (girdiAkilliMetin) setTimeout(() => girdiAkilliMetin.focus(), 40);
    };
    const kapatAkilliYapistirCekmecesi = () => {
      if (perdeAkilli) perdeAkilli.classList.remove('acik');
    };

    ['btn-akilli-yapistir-ac', 'btn-bos-adim-soru'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', () => {
          gecisSekmeYardimci('sekme-banka');
          acAkilliYapistirCekmecesi();
        });
      }
    });
    ['btn-akilli-yapistir-kapat', 'btn-akilli-yapistir-vazgec'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', kapatAkilliYapistirCekmecesi);
    });
    if (perdeAkilli) {
      perdeAkilli.addEventListener('click', (e) => {
        if (e.target === perdeAkilli) kapatAkilliYapistirCekmecesi();
      });
    }
    if (girdiAkilliMetin) {
      girdiAkilliMetin.addEventListener('input', () => {
        clearTimeout(akilliZamanlayici);
        akilliZamanlayici = setTimeout(ayristirAkilliYapistirSimdi, 220);
      });
    }
    ['akilli-yapistir-hafta', 'akilli-yapistir-oc'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', ayristirAkilliYapistirSimdi);
    });
    const btnAkilliOrnekDoldur = document.getElementById('btn-akilli-ornek-doldur');
    if (btnAkilliOrnekDoldur && girdiAkilliMetin) {
      btnAkilliOrnekDoldur.addEventListener('click', () => {
        girdiAkilliMetin.value = [
          '1. [DY] [ÖÇ-1] OSI referans modeli 7 katmandan oluşur. (D)',
          '2. [ÖÇ-2] Aşağıdakilerden hangisi simetrik şifreleme algoritması değildir?',
          'A) AES',
          'B) ChaCha20',
          'C) RSA',
          'D) 3DES',
          'E) Twofish',
          'Cevap: C',
          '3. [KLASİK] [ÖÇ-3] Sıfır Güven (Zero-Trust) ağ mimarisinin temel ilkesini açıklayınız.'
        ].join('\n');
        ayristirAkilliYapistirSimdi();
      });
    }
    if (kutuAkilliOnizleme) {
      kutuAkilliOnizleme.addEventListener('click', (e) => {
        const btnHarf = e.target.closest('[data-akilli-harf]');
        if (btnHarf) {
          const i = Number(btnHarf.getAttribute('data-akilli-idx'));
          if (akilliOnizlemeSorulari[i]) {
            akilliOnizlemeSorulari[i].dogruHarf = btnHarf.getAttribute('data-akilli-harf');
            cizAkilliOnizlemeKartlari();
          }
          return;
        }
        const btnDy = e.target.closest('[data-akilli-dy]');
        if (btnDy) {
          const i = Number(btnDy.getAttribute('data-akilli-idx'));
          if (akilliOnizlemeSorulari[i]) {
            akilliOnizlemeSorulari[i].dogruDY = btnDy.getAttribute('data-akilli-dy');
            cizAkilliOnizlemeKartlari();
          }
        }
      });
    }
    if (btnAkilliEkle) {
      btnAkilliEkle.addEventListener('click', () => {
        if (akilliOnizlemeSorulari.length === 0) return;
        const eklenenSayi = akilliOnizlemeSorulari.length;
        const yeniSorular = akilliOnizlemeSorulari.map((s) => Object.assign({}, s));
        kaydetSonGeriAlYedegi(`${eklenenSayi} Soru Eklendi`, {
          tip: 'sorular-delta',
          degisim: 'ekle',
          eklenenIdler: yeniSorular.map((s) => s.id)
        });
        durum.sorular.unshift(...yeniSorular);
        akilliOnizlemeSorulari = [];
        if (girdiAkilliMetin) girdiAkilliMetin.value = '';
        verileriKaydet({ mesaj: `${eklenenSayi} soru bankaya eklendi · ${saatMetniUret()}` });
        guncelleSoruBankasiTablosu();
        guncelleA4Onizleme();
        if (typeof window.__guncelleDerslerVeBosDurumUI === 'function') window.__guncelleDerslerVeBosDurumUI();
        kapatAkilliYapistirCekmecesi();
      });
    }

    // 6. Stüdyo Tuval Üst Çubuğu, Doğrudan Tuval Üstü Düzenleme ve Baskı Öncesi Uçuş Kontrol Çekmecesi
    const btnHaftaOzel = document.getElementById('btn-hafta-ozel');
    if (btnHaftaOzel) {
      btnHaftaOzel.addEventListener('click', () => {
        const det = document.getElementById('detay-gelismis-hafta-oc');
        if (det) {
          det.open = true;
          det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }

    const tuvalKitapcikSecici = document.getElementById('tuval-kitapcik-secici');
    const ayarOnizlemeModEl = document.getElementById('ayar-onizleme-mod');
    if (tuvalKitapcikSecici && ayarOnizlemeModEl) {
      tuvalKitapcikSecici.addEventListener('click', (e) => {
        const b = e.target.closest('[data-kitapcik-mod], [data-onizleme]');
        if (!b) return;
        const mod = b.getAttribute('data-kitapcik-mod') || b.getAttribute('data-onizleme');
        ayarOnizlemeModEl.value = mod;
        tuvalKitapcikSecici.querySelectorAll('[data-kitapcik-mod], [data-onizleme]').forEach((el) => el.classList.toggle('aktif', el === b));
        ayarOnizlemeModEl.dispatchEvent(new Event('change', { bubbles: true }));
      });
      ayarOnizlemeModEl.addEventListener('change', () => {
        const m = ayarOnizlemeModEl.value;
        tuvalKitapcikSecici.querySelectorAll('[data-kitapcik-mod], [data-onizleme]').forEach((el) => {
          const km = el.getAttribute('data-kitapcik-mod') || el.getAttribute('data-onizleme');
          el.classList.toggle('aktif', km === m);
        });
      });
    }

    const sahneA4El = document.getElementById('a4-onizleme-sahne');
    const tuvalYuzSecici = document.getElementById('tuval-yuz-secici');
    if (tuvalYuzSecici && sahneA4El) {
      tuvalYuzSecici.addEventListener('click', (e) => {
        const b = e.target.closest('[data-yuz]');
        if (!b) return;
        const yuz = b.getAttribute('data-yuz');
        tuvalYuzSecici.querySelectorAll('[data-yuz]').forEach((el) => el.classList.toggle('aktif', el === b));
        sahneA4El.classList.toggle('on-yuz-modu', yuz === 'on');
        sahneA4El.classList.toggle('arka-yuz-modu', yuz === 'arka');
      });
    }

    const tuvalYaklasSecici = document.getElementById('tuval-yaklas-secici');
    if (tuvalYaklasSecici && sahneA4El) {
      tuvalYaklasSecici.addEventListener('click', (e) => {
        const b = e.target.closest('[data-yaklas]');
        if (!b) return;
        const yk = b.getAttribute('data-yaklas');
        tuvalYaklasSecici.querySelectorAll('[data-yaklas]').forEach((el) => el.classList.toggle('aktif', el === b));
        sahneA4El.classList.toggle('yaklas-sigdir', yk === 'sigdir');
        sahneA4El.classList.toggle('yaklas-75', yk === '75');
      });
    }

    const btnTuvalBelirtkeAc = document.getElementById('btn-tuval-belirtke-ac');
    if (btnTuvalBelirtkeAc) {
      btnTuvalBelirtkeAc.addEventListener('click', () => {
        const detBelirtke = document.getElementById('detay-canli-belirtke');
        const kartCikti = document.getElementById('kart-cikti-merkezi');
        if (detBelirtke) {
          const simdiGizli = !detBelirtke.hidden;
          detBelirtke.hidden = simdiGizli;
          if (!simdiGizli) {
            detBelirtke.open = true;
            if (kartCikti) kartCikti.hidden = false;
            detBelirtke.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else if (kartCikti) {
            kartCikti.hidden = true;
          }
        }
      });
    }

    const btnKilitliKopyaOlustur = document.getElementById('btn-kilitli-kopya-olustur');
    if (btnKilitliKopyaOlustur) {
      btnKilitliKopyaOlustur.addEventListener('click', () => {
        durum.aktifKayitliSinavId = '';
        uygulaBasildiKilidiUI(false);
        guncelleKayitliSinavlarCubuguUI();
        guncelleA4Onizleme();
        verileriKaydet({ mesaj: `Düzenlenebilir kopya taslak açıldı · ${saatMetniUret()}` });
      });
    }

    // Doğrudan A4 Tuvali Üzerinde Tıklayıp Metin/Şık Düzenleme (Basıldı Kilitliyse Engellenir)
    if (sahneA4El) {
      sahneA4El.addEventListener('click', (e) => {
        if (document.body.classList.contains('sinav-basildi-kilitli')) return;
        if (e.target.closest('.soru-ekran-araclari')) return;
        const hedef = e.target.closest('.soru-metin-duzenle[data-duzenle-soru-id], .sik-metin-duzenle[data-duzenle-soru-id]');
        if (!hedef || hedef.isContentEditable) return;
        const soruId = hedef.getAttribute('data-duzenle-soru-id');
        const sikIdxStr = hedef.getAttribute('data-duzenle-sik-idx');
        const soruNesne = (durum.sorular || []).find((s) => s && String(s.id) === String(soruId));
        if (!soruNesne) return;

        const ilkMetin = sikIdxStr !== null
          ? String((soruNesne.siklar && soruNesne.siklar[Number(sikIdxStr)]) || '')
          : String(soruNesne.metin || '');
        hedef.textContent = ilkMetin;
        hedef.contentEditable = 'true';
        hedef.style.outline = '2px solid var(--birincil)';
        hedef.style.borderRadius = '3px';
        hedef.style.background = '#eff6ff';
        hedef.focus();

        let tamamlandi = false;
        const bitirDuzenleme = (iptalMi) => {
          if (tamamlandi) return;
          tamamlandi = true;
          hedef.contentEditable = 'false';
          hedef.style.outline = '';
          hedef.style.background = '';
          const yeniMetin = String(hedef.textContent || '').replace(/\s+/g, ' ').trim();
          if (!iptalMi && yeniMetin && yeniMetin !== ilkMetin) {
            kaydetSonGeriAlYedegi('Kağıt Üstü Soru Düzenleme', {
              tip: 'sorular-delta',
              degisim: 'guncelle',
              soruId: soruNesne.id,
              oncekiSoru: JSON.parse(JSON.stringify(soruNesne))
            });
            if (sikIdxStr !== null && Array.isArray(soruNesne.siklar)) {
              soruNesne.siklar[Number(sikIdxStr)] = yeniMetin;
            } else {
              soruNesne.metin = yeniMetin;
            }
            verileriKaydet({ mesaj: `Soru kağıt üzerinde güncellendi · ${saatMetniUret()}` });
            guncelleSoruBankasiTablosu();
          }
          guncelleA4Onizleme();
        };

        hedef.addEventListener('blur', () => bitirDuzenleme(false), { once: true });
        hedef.addEventListener('keydown', (ke) => {
          if (ke.key === 'Escape') {
            ke.preventDefault();
            bitirDuzenleme(true);
          } else if (ke.key === 'Enter' && !ke.shiftKey) {
            ke.preventDefault();
            hedef.blur();
          }
        });
      });
    }

    // Salon Kapı İlan Listesi ve Sınav Zarfı Üst Etiketi Üreticileri
    const uretSalonKapiListesiHTML = (tb, yer) => {
      const salonBloklari = (yer && Array.isArray(yer.yerlesim) && yer.yerlesim.length > 0)
        ? yer.yerlesim
        : [{ salon: { ad: tb.salon || 'Salon 1', gozetmenler: [] }, ogrenciler: durum.ogrenciler || [] }];
      return salonBloklari.map((k) => {
        const satirlar = (k.ogrenciler || [])
          .map((o, i) => `
            <tr>
              <td style="border:1px solid #000; padding:3px 6px; text-align:center;">${i + 1}</td>
              <td style="border:1px solid #000; padding:3px 6px; font-family:var(--font-mono);">${C.kacisHTML(o.ogrNo)}</td>
              <td style="border:1px solid #000; padding:3px 6px;"><strong>${C.kacisHTML(o.adSoyad)}</strong></td>
              <td style="border:1px solid #000; padding:3px 6px;">${C.kacisHTML(k.salon.ad || tb.salon || 'Salon 1')}</td>
            </tr>
          `).join('');
        return `
          <div class="a4-sayfa" style="font-size:9pt; color:#000;">
            <div style="text-align:center; border-bottom:1.5px solid #000; padding-bottom:6px; margin-bottom:8px;">
              <div style="font-size:11pt; font-weight:800;">${C.kacisHTML(tb.kurum || '')}</div>
              <div style="font-size:10pt; font-weight:700;">SINAV SALONU KAPI İLAN LİSTESİ — ${C.kacisHTML(k.salon.ad || tb.salon || 'Salon 1')}</div>
              <div style="font-size:8.5pt;">${C.kacisHTML(tb.dersKodu || '')} ${C.kacisHTML(tb.dersAdi || '')} · Tarih: ${C.kacisHTML(tb.tarih || '')} · Saat: ${C.kacisHTML(tb.saat || '')}</div>
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:8.2pt;">
              <thead>
                <tr style="background:#f1f5f9;">
                  <th style="border:1px solid #000; padding:4px; width:36px;">Sıra</th>
                  <th style="border:1px solid #000; padding:4px; width:120px;">Öğrenci No</th>
                  <th style="border:1px solid #000; padding:4px;">Adı Soyadı</th>
                  <th style="border:1px solid #000; padding:4px; width:110px;">Salon</th>
                </tr>
              </thead>
              <tbody>${satirlar || '<tr><td colspan="4" style="border:1px solid #000; padding:8px; text-align:center;">Kayıtlı öğrenci bulunmuyor.</td></tr>'}</tbody>
            </table>
          </div>
        `;
      }).join('');
    };

    const uretSinavZarfEtiketiHTML = (tb, yapi, yer) => {
      const toplamOgr = (durum.ogrenciler || []).length;
      const salonAdlari = (yer && Array.isArray(yer.yerlesim) && yer.yerlesim.length > 0)
        ? yer.yerlesim.map((k) => k.salon.ad).join(', ')
        : (tb.salon || 'Salon 1');
      const gruplarStr = yapi.kitapcikGruplar === 'A' ? 'A' : (yapi.kitapcikGruplar === 'AB' ? 'A, B' : 'A, B, C, D');
      return `
        <div class="a4-sayfa" style="display:flex; flex-direction:column; justify-content:center; padding:18mm; color:#000;">
          <div style="border:2px solid #000; padding:12mm; border-radius:4px;">
            <div style="text-align:center; border-bottom:1.5px solid #000; padding-bottom:8px; margin-bottom:12px;">
              <div style="font-size:13pt; font-weight:800;">${C.kacisHTML(yapi.kurum || tb.kurum || '')}</div>
              <div style="font-size:11pt; font-weight:700; margin-top:4px;">RESMİ SINAV EVRAK ZARFI ÜST ETİKETİ</div>
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:10pt;">
              <tr><td style="border:1px solid #000; padding:6px 8px; width:38%;"><strong>Ders Kodu ve Adı</strong></td><td style="border:1px solid #000; padding:6px 8px;">${C.kacisHTML(yapi.ders.kod)} — ${C.kacisHTML(yapi.ders.ad)}</td></tr>
              <tr><td style="border:1px solid #000; padding:6px 8px;"><strong>Sınav Türü / Dönemi</strong></td><td style="border:1px solid #000; padding:6px 8px;">${C.kacisHTML(yapi.sinavAd)}</td></tr>
              <tr><td style="border:1px solid #000; padding:6px 8px;"><strong>Sınav Tarihi ve Süresi</strong></td><td style="border:1px solid #000; padding:6px 8px;">${C.kacisHTML(yapi.tarih)} · ${C.kacisHTML(yapi.sure)}</td></tr>
              <tr><td style="border:1px solid #000; padding:6px 8px;"><strong>Sorumlu Öğretim Elemanı</strong></td><td style="border:1px solid #000; padding:6px 8px;">${C.kacisHTML(yapi.hoca)}</td></tr>
              <tr><td style="border:1px solid #000; padding:6px 8px;"><strong>Salonlar ve Kitapçık Grupları</strong></td><td style="border:1px solid #000; padding:6px 8px;">${C.kacisHTML(salonAdlari)} · Gruplar: ${gruplarStr}</td></tr>
              <tr><td style="border:1px solid #000; padding:6px 8px;"><strong>Sınava Kayıtlı / Katılan / Girmedi (GR)</strong></td><td style="border:1px solid #000; padding:6px 8px;">Kayıtlı: ${toplamOgr} &nbsp;|&nbsp; Katılan: ........ &nbsp;|&nbsp; Girmedi (GR): ........</td></tr>
              <tr><td style="border:1px solid #000; padding:6px 8px;"><strong>Zarf İçeriği Kontrolü</strong></td><td style="border:1px solid #000; padding:6px 8px;">☐ Soru/Optik Kağıtları &nbsp; ☐ İmzalı Yoklama &nbsp; ☐ Sınav Tutanağı &nbsp; ☐ Cevap Anahtarı</td></tr>
              <tr><td style="border:1px solid #000; padding:12px 8px;"><strong>Teslim Eden Gözetmen / Hoca İmzası</strong></td><td style="border:1px solid #000; padding:12px 8px;">........................................................</td></tr>
            </table>
          </div>
        </div>
      `;
    };

    const perdeUcus = document.getElementById('perde-ucus-kontrolu');
    const listeUcusEl = document.getElementById('liste-ucus-kontrolleri');
    const etiketUcusDurum = document.getElementById('etiket-ucus-durum');

    const guncelleUcusKontrolListesiUI = () => {
      if (!listeUcusEl) return;
      const yapi = okuAktifSinavYapisi();
      const sahne = document.getElementById('a4-onizleme-sahne');
      const tasmaYok = !sahne || sahne.dataset.tasmaVar !== '1';
      const seciliSorular = yapi.tumSeciliSorular || [];
      const eksikCevapSayisi = seciliSorular.filter((s) => {
        if (s.tur === 'test') return !['A', 'B', 'C', 'D', 'E'].includes(String(s.dogruHarf || '').toUpperCase());
        if (s.tur === 'dy') return !['D', 'Y'].includes(String(s.dogruDY || '').toUpperCase());
        return false;
      }).length;
      const son2Harita = new Map();
      (durum.ogrenciler || []).forEach((o) => {
        const k2 = String(o.ogrNo || '').slice(-2);
        son2Harita.set(k2, (son2Harita.get(k2) || 0) + 1);
      });
      const cakismaAdet = Array.from(son2Harita.values()).filter((n) => n > 1).length;
      const kimlikMod = (document.getElementById('ayar-kimlik-modu') || {}).value || 'son2';
      const cakismaSorunVar = cakismaAdet > 0 && kimlikMod === 'son2';
      const ocDenge = typeof C.hesaplaBaskiOncesiOcBloomDengesi === 'function'
        ? C.hesaplaBaskiOncesiOcBloomDengesi(seciliSorular, yapi.dersOgrenimCiktilari || [])
        : { trafikIsigi: 'yesil', mesaj: 'ÖÇ dağılımı dengeli' };

      const maddeler = [
        {
          ok: Boolean(yapi.tam100Mu),
          baslik: `Toplam puan kontrolü (${yapi.toplamPuan} / 100)`,
          aciklama: yapi.tam100Mu ? 'Sınav toplamı tam 100 puandır.' : 'Bölüm puanları toplamı 100 olmalıdır.',
          aksiyonId: yapi.tam100Mu ? '' : 'ucus-aksiyon-100',
          aksiyonEtiket: "100'e Tamamla"
        },
        {
          ok: tasmaYok,
          baslik: '1 A4 önlü-arkalı sayfa sığma kontrolü',
          aciklama: tasmaYok ? 'Tüm sorular ve optik kodlama alanı 2 yüze sığıyor.' : 'Sayfa taşması tespit edildi; soru sayısını azaltın veya ayrı optik seçin.',
          aksiyonId: '',
          aksiyonEtiket: ''
        },
        {
          ok: seciliSorular.length > 0 && eksikCevapSayisi === 0,
          baslik: `Cevap anahtarı bütünlüğü (${seciliSorular.length} soru)`,
          aciklama: seciliSorular.length === 0 ? 'Kağıtta henüz soru yok.' : (eksikCevapSayisi === 0 ? 'Tüm soruların doğru cevabı tanımlı ve şifreli QR mührü hazır.' : `${eksikCevapSayisi} soruda doğru şık eksik.`),
          aksiyonId: '',
          aksiyonEtiket: ''
        },
        {
          ok: !cakismaSorunVar,
          baslik: `Sınıf listesi ve optik numara (${(durum.ogrenciler || []).length} öğrenci)`,
          aciklama: cakismaSorunVar ? `${cakismaAdet} son 2 hane çakışması var.` : `Optik kimlik modu (${kimlikMod === 'son3' ? 'Son 3 Hane' : 'Son 2 Hane'}) çakışmasız.`,
          aksiyonId: cakismaSorunVar ? 'ucus-aksiyon-son3' : '',
          aksiyonEtiket: 'Son 3 hane yap'
        },
        {
          ok: ocDenge.trafikIsigi !== 'kirmizi',
          baslik: 'Bologna ÖÇ ve bilişsel denge',
          aciklama: ocDenge.mesaj || 'ÖÇ kapsam kontrolü tamamlandı.',
          aksiyonId: '',
          aksiyonEtiket: ''
        },
        {
          ok: !aktifDersSalonYerlesimi().yetersiz,
          baslik: `Salon kapasitesi ve oturma planı (${(durum.salonlar || []).length} salon)`,
          aciklama: aktifDersSalonYerlesimi().yetersiz ? 'Salon kontenjanı öğrenci sayısının altında; otomatik ek salon açıldı.' : 'Salon kontenjanı tüm kayıtlı öğrenciler için yeterli.',
          aksiyonId: '',
          aksiyonEtiket: ''
        }
      ];

      const hataSayi = maddeler.filter((m) => !m.ok).length;
      if (etiketUcusDurum) {
        etiketUcusDurum.textContent = hataSayi === 0 ? `${maddeler.length}/${maddeler.length} kontrol geçti · Baskıya hazır` : `${hataSayi} kontrol dikkat istiyor`;
      }

      listeUcusEl.innerHTML = maddeler
        .map((m) => `
          <div class="ucus-kontrol-satir" style="padding:10px 12px;">
            <div>
              <div style="display:flex; align-items:center; gap:6px;">
                <span class="rozet ${m.ok ? 'rozet-yesil' : 'rozet-sari'}">${m.ok ? 'Tamam' : 'Kontrol'}</span>
                <strong style="font-size:var(--yazi-sm);">${C.kacisHTML(m.baslik)}</strong>
              </div>
              <div style="font-size:var(--yazi-xs); color:var(--metin-ikincil); margin-top:2px;">${C.kacisHTML(m.aciklama)}</div>
            </div>
            ${m.aksiyonId ? `<button type="button" class="btn btn-birincil btn-kucuk" data-ucus-aksiyon="${m.aksiyonId}">${C.kacisHTML(m.aksiyonEtiket)}</button>` : ''}
          </div>
        `)
        .join('');
    };

    const acUcusKontrolCekmecesi = () => {
      if (!perdeUcus) return;
      guncelleUcusKontrolListesiUI();
      perdeUcus.classList.add('acik');
    };
    const kapatUcusKontrolCekmecesi = () => {
      if (perdeUcus) perdeUcus.classList.remove('acik');
    };

    const btnUcusKontroluAc = document.getElementById('btn-ucus-kontrolu-ac');
    if (btnUcusKontroluAc) btnUcusKontroluAc.addEventListener('click', acUcusKontrolCekmecesi);
    const btnUcusKontroluKapat = document.getElementById('btn-ucus-kontrolu-kapat');
    if (btnUcusKontroluKapat) btnUcusKontroluKapat.addEventListener('click', kapatUcusKontrolCekmecesi);
    if (perdeUcus) {
      perdeUcus.addEventListener('click', (e) => {
        if (e.target === perdeUcus) kapatUcusKontrolCekmecesi();
      });
    }
    if (listeUcusEl) {
      listeUcusEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ucus-aksiyon]');
        if (!b) return;
        const aks = b.getAttribute('data-ucus-aksiyon');
        if (aks === 'ucus-aksiyon-100') {
          const btn100 = document.getElementById('btn-puan-100-dengele');
          if (btn100) btn100.click();
          guncelleUcusKontrolListesiUI();
        } else if (aks === 'ucus-aksiyon-son3') {
          const selKimlik = document.getElementById('ayar-kimlik-modu');
          if (selKimlik) {
            selKimlik.value = 'son3';
            selKimlik.dispatchEvent(new Event('change', { bubbles: true }));
          }
          guncelleOgrenciListesiSekmesi();
          guncelleA4Onizleme();
          guncelleUcusKontrolListesiUI();
        }
      });
    }

    const btnSinavGunuPaketiIndir = document.getElementById('btn-sinav-gunu-paketi-indir');
    if (btnSinavGunuPaketiIndir) {
      btnSinavGunuPaketiIndir.addEventListener('click', () => {
        const yapi = okuAktifSinavYapisi();
        if (!yapi.tam100Mu) {
          guncelleUcusKontrolListesiUI();
          guncelleKayitDurumCubuguUI('hata', `Toplam puan ${yapi.toplamPuan}/100 — önce 100'e tamamlayın`);
          return;
        }
        const tb = okuTutanakBilgileri();
        const yer = aktifDersSalonYerlesimi();
        const salonKayitlari = yer.yerlesim.length > 0 ? yer.yerlesim : [{ salon: { ad: tb.salon, gozetmenler: [] }, ogrenciler: [] }];
        const parcalar = [];
        if ((document.getElementById('chk-paket-kitapcik') || {}).checked) {
          parcalar.push(uretKapsamaGoreBaskiHTML(yapi, 'sinif-tum-gruplar').html);
        }
        if ((document.getElementById('chk-paket-anahtar') || {}).checked) {
          parcalar.push(uretKapsamaGoreBaskiHTML(yapi, 'anahtar').html);
        }
        if ((document.getElementById('chk-paket-kapi-listesi') || {}).checked) {
          parcalar.push(uretSalonKapiListesiHTML(tb, yer));
        }
        if ((document.getElementById('chk-paket-yoklama') || {}).checked) {
          parcalar.push(salonKayitlari.map((k) => uretSinavYoklamaEvrakiHTML(tb, k)).join(''));
        }
        if ((document.getElementById('chk-paket-tutanak') || {}).checked) {
          parcalar.push(salonKayitlari.map((k) => uretSinavDurumTutanagiHTML(tb, Object.assign({}, k.salon, { ogrenciSayisi: k.ogrenciler.length }))).join(''));
        }
        if ((document.getElementById('chk-paket-zarf') || {}).checked) {
          parcalar.push(uretSinavZarfEtiketiHTML(tb, yapi, yer));
        }
        if (parcalar.length === 0) return;

        if ((document.getElementById('chk-paket-sonrasi-kilitle') || {}).checked) {
          if (!durum.aktifKayitliSinavId) {
            kaydetSinavSnapshot();
          }
          if (durum.aktifKayitliSinavId) {
            kilitleVeyaAcKayitliSinav(true);
          }
        }
        const dersKodTemiz = String(yapi.ders.kod || 'SINAV').replace(/[^A-Za-z0-9_-]/g, '');
        kapatUcusKontrolCekmecesi();
        cizDomSayfalariniPdfOlarakIndir(parcalar.join(''), `${dersKodTemiz}_Sinav_Gunu_Evrak_Paketi`);
      });
    }

    // Uçuş Kontrolü: #btn-ucus-kilitle-ve-indir (0 öğrenci / eksik cevap anahtarı sıkı uyarısı ve kilitleme guard'ı; #btn-sinav-basildi-kilitle akışına dokunulmaz)
    const btnUcusKilitleVeIndir = document.getElementById('btn-ucus-kilitle-ve-indir');
    if (btnUcusKilitleVeIndir) {
      btnUcusKilitleVeIndir.addEventListener('click', () => {
        const yapi = okuAktifSinavYapisi();
        const seciliSorular = yapi.tumSeciliSorular || [];
        const eksikAnahtarSayisi = seciliSorular.filter(
          (s) => (s.tur === 'test' && !s.dogruHarf) || (s.tur === 'dy' && !s.dogruDY)
        ).length;
        const ogrenciSayisi = (durum.ogrenciler || []).length;
        const etiketUcusDurum = document.getElementById('etiket-ucus-durum');

        if (!yapi.tam100Mu || seciliSorular.length === 0 || eksikAnahtarSayisi > 0 || ogrenciSayisi === 0) {
          guncelleUcusKontrolListesiUI();
          const sorunlar = [];
          if (!yapi.tam100Mu) sorunlar.push(`Toplam puan ${yapi.toplamPuan}/100`);
          if (seciliSorular.length === 0) sorunlar.push('Seçili soru yok');
          if (eksikAnahtarSayisi > 0) sorunlar.push(`${eksikAnahtarSayisi} soruda cevap anahtarı eksik`);
          if (ogrenciSayisi === 0) sorunlar.push('Kayıtlı öğrenci yok (0 öğrenci)');
          const uyariMetni = `⚠️ Baskı ve kilitleme engellendi: ${sorunlar.join(' · ')}`;
          if (etiketUcusDurum) {
            etiketUcusDurum.textContent = uyariMetni;
            etiketUcusDurum.style.color = 'var(--tehlike)';
          }
          guncelleKayitDurumCubuguUI('hata', uyariMetni);
          return;
        }
        if (btnSinavGunuPaketiIndir) btnSinavGunuPaketiIndir.click();
      });
    }

    const btnYasamDongusuCta = document.getElementById('btn-yasam-dongusu-cta');
    if (btnYasamDongusuCta) {
      btnYasamDongusuCta.addEventListener('click', () => {
        const asama = btnYasamDongusuCta.dataset.asama || 'taslak';
        if (asama === 'kesinlesti') {
          const btnObs = document.getElementById('btn-obs-resmi-csv-indir');
          if (btnObs) btnObs.click();
        } else if (asama === 'okunuyor') {
          gecisSekmeYardimci('sekme-analiz');
        } else if (asama === 'basildi') {
          gecisSekmeYardimci('sekme-omr');
        } else {
          gecisSekmeYardimci('sekme-stüdyo');
          acUcusKontrolCekmecesi();
        }
      });
    }

    // 7. Son 2 Hane Çakışma Şeridi, Değerlendirme Alt Sekmeleri, GR Kesinleştirme ve Kiosk A−/A+ & Çevrimdışı Şeridi
    const btnCakismaSon3Gec = document.getElementById('btn-cakisma-son3-gec');
    if (btnCakismaSon3Gec) {
      btnCakismaSon3Gec.addEventListener('click', () => {
        const selKimlik = document.getElementById('ayar-kimlik-modu');
        if (selKimlik) {
          selKimlik.value = 'son3';
          selKimlik.dispatchEvent(new Event('change', { bubbles: true }));
        }
        guncelleOgrenciListesiSekmesi();
        guncelleA4Onizleme();
        verileriKaydet({ mesaj: `Optik numara modu Son 3 Hane olarak güncellendi · ${saatMetniUret()}` });
      });
    }

    const analizAltSekmeler = document.getElementById('analiz-alt-sekmeler');
    const sekmeAnalizPanel = document.getElementById('sekme-analiz');
    if (analizAltSekmeler && sekmeAnalizPanel) {
      analizAltSekmeler.addEventListener('click', (e) => {
        const b = e.target.closest('[data-alt]');
        if (!b) return;
        const alt = b.getAttribute('data-alt') || 'tumu';
        sekmeAnalizPanel.setAttribute('data-alt-sekme', alt);
        analizAltSekmeler.querySelectorAll('[data-alt]').forEach((el) => el.classList.toggle('aktif', el === b));
      });
    }

    const btnGrKesinlestirIndir = document.getElementById('btn-gr-kesinlestir-indir');
    if (btnGrKesinlestirIndir) {
      btnGrKesinlestirIndir.addEventListener('click', () => {
        const anahtar = `${durum.aktifDersId || 'genel'}::${durum.aktifKayitliSinavId || 'taslak'}`;
        durum.kesinlesmisSinavHaritasi[anahtar] = Date.now();
        window.__guncelleYasamDongusuRozetUI();
        verileriKaydet({ mesaj: `Sınav sonuçları ve GR listesi kesinleştirildi · ${saatMetniUret()}` });
        const btnObs = document.getElementById('btn-obs-resmi-csv-indir');
        if (btnObs) btnObs.click();
      });
    }

    // Kiosk Öğrenci Yazı Boyutu (A− / A+) ve Dürüst Çevrimdışı Bağlantı Şeridi
    const kioskPuntoAlaniEl = document.getElementById('kiosk-sinav-alani');
    const puntoAdimlari = ['16', '18', '21'];
    const degistirKioskPunto = (yon) => {
      if (!kioskPuntoAlaniEl) return;
      const mevcut = kioskPuntoAlaniEl.getAttribute('data-punto') || '16';
      const idx = Math.max(0, puntoAdimlari.indexOf(mevcut));
      const yeniIdx = Math.max(0, Math.min(puntoAdimlari.length - 1, idx + yon));
      kioskPuntoAlaniEl.setAttribute('data-punto', puntoAdimlari[yeniIdx]);
    };
    const btnPuntoKucult = document.getElementById('btn-kiosk-punto-kucult');
    const btnPuntoBuyut = document.getElementById('btn-kiosk-punto-buyut');
    if (btnPuntoKucult) btnPuntoKucult.addEventListener('click', () => degistirKioskPunto(-1));
    if (btnPuntoBuyut) btnPuntoBuyut.addEventListener('click', () => degistirKioskPunto(1));

    const guncelleKioskCevrimdisiSerit = (e) => {
      const serit = document.getElementById('kiosk-cevrimdisi-serit');
      if (!serit) return;
      if (e && e.type === 'offline') {
        serit.hidden = false;
      } else if (e && e.type === 'online') {
        serit.hidden = true;
      } else {
        serit.hidden = navigator.onLine !== false;
      }
    };
    window.addEventListener('offline', guncelleKioskCevrimdisiSerit);
    window.addEventListener('online', guncelleKioskCevrimdisiSerit);
    guncelleKioskCevrimdisiSerit();

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        kapatAkilliYapistirCekmecesi();
        kapatUcusKontrolCekmecesi();
        document.body.classList.remove('mobil-menu-acik');
      }
    });

    window.__guncelleDerslerVeBosDurumUI();
    window.__guncelleYasamDongusuRozetUI();

    /* --- V2 Kayıpsız Masaüstü <-> Mobil Delta Senkron Motoru + .sinavpaket.json --- */
    let __v2PaketYayinZamanlayici = null;
    let __v2MasaustuSenkronSuruyor = false;

    const guncelleMasaustuV2DurumRozeti = (metin, sinifAdi = 'rozet rozet-mavi') => {
      const rozet = document.getElementById('rozet-omr-v2-durum');
      if (!rozet) return;
      rozet.className = sinifAdi;
      rozet.textContent = metin;
    };

    const yayinlaMobilDersPaketleriBuluta = async () => {
      const hocaToken = sessionStorage.getItem('hoca_token') || '';
      if (!hocaToken || !location.protocol.startsWith('http') || navigator.onLine === false) return false;
      try {
        const yapi = okuEtkinOmrSinavYapisi();
        const aktifDers = (durum.dersler || []).find((d) => d.id === durum.aktifDersId) || null;
        const hafifSinavYapisi = {
          sinavKodu: yapi.sinavKodu || 'GENEL',
          dersId: durum.aktifDersId || yapi.dersId || '',
          dersAdi: (aktifDers && (aktifDers.dersAdi || aktifDers.ad)) || yapi.dersAdi || '',
          dersAd: (aktifDers && (aktifDers.dersAdi || aktifDers.ad)) || yapi.dersAdi || '',
          baslik: yapi.baslik || '',
          dySayisi: Number(yapi.dySayisi) || 0,
          testSayisi: Number(yapi.testSayisi) || 0,
          klasikSayisi: Number(yapi.klasikSayisi) || 0,
          sikSayisi: Number(yapi.sikSayisi) === 4 ? 4 : 5,
          dyPuan: yapi.dyPuan,
          testPuan: yapi.testPuan,
          klasikPuan: yapi.klasikPuan,
          dyToplamPuan: yapi.dyToplamPuan,
          testToplamPuan: yapi.testToplamPuan,
          klasikToplamPuan: yapi.klasikToplamPuan,
          dySoruPuan: yapi.dySoruPuan,
          testSoruPuan: yapi.testSoruPuan,
          klasikSoruPuan: yapi.klasikSoruPuan,
          dyGoturme: Number(yapi.dyGoturme) || 0,
          testGoturme: Number(yapi.testGoturme) || 0,
          kitapcikGrupSayisi: Number(yapi.kitapcikGrupSayisi || yapi.kitapcikSayisi) || 4,
          akreditasyonBaraji: Number(yapi.akreditasyonBaraji) || 60,
          esnekKurallar: yapi.esnekKurallar || [],
          iptalSorular: yapi.iptalSorular || [],
          cevapAnahtarlari: yapi.cevapAnahtarlari || {}
        };
        const yanit = await fetch('/api/v2/sinav-paket-yayinla', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hocaToken}` },
          body: JSON.stringify({
            sinavKodu: hafifSinavYapisi.sinavKodu,
            dersId: hafifSinavYapisi.dersId,
            dersAdi: hafifSinavYapisi.dersAdi,
            baslik: hafifSinavYapisi.baslik,
            sinavYapisi: hafifSinavYapisi,
            cevapAnahtarlari: hafifSinavYapisi.cevapAnahtarlari,
            ogrenciler: Array.isArray(durum.ogrenciler) ? durum.ogrenciler : []
          })
        });
        await yanit.text().catch(() => '');
        return Boolean(yanit.ok);
      } catch (_) {
        return false;
      }
    };

    window.__tetikleMobilPaketYayinlaBuluta = () => {
      clearTimeout(__v2PaketYayinZamanlayici);
      __v2PaketYayinZamanlayici = setTimeout(() => {
        yayinlaMobilDersPaketleriBuluta().catch(() => {});
      }, 450);
    };
    window.__masaustuPaketYayinlaSimdi = yayinlaMobilDersPaketleriBuluta;

    const gonderMasaustuAnahtarV2Olayi = async (grup = 'A') => {
      const hocaToken = sessionStorage.getItem('hoca_token') || '';
      if (!hocaToken || !location.protocol.startsWith('http') || navigator.onLine === false) return false;
      try {
        const yapi = okuEtkinOmrSinavYapisi();
        const g = String(grup || 'A').toUpperCase();
        const kitapciklar = (yapi && yapi.cevapAnahtarlari) || {};
        const anahtar = kitapciklar[g] || kitapciklar.A || { dy: [], test: [] };
        const yanit = await fetch('/api/v2/sinav-senkron', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hocaToken}` },
          body: JSON.stringify({
            olaylar: [{
              eventId: `PC-KEY-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              sinavKodu: yapi.sinavKodu || 'GENEL',
              tur: 'ANAHTAR_GUNCELLE',
              kaynakCihaz: 'masaustu',
              zamanMs: Date.now(),
              veri: {
                grup: g,
                anahtar,
                kitapciklar,
                kaynak: 'masaustu'
              }
            }]
          })
        });
        await yanit.text().catch(() => '');
        await yayinlaMobilDersPaketleriBuluta();
        return Boolean(yanit.ok);
      } catch (_) {
        return false;
      }
    };
    window.__gonderMasaustuAnahtarV2Olayi = gonderMasaustuAnahtarV2Olayi;

    const uygulaMasaustuHariciAnahtarVerisi = (veri) => {
      if (!veri || typeof veri !== 'object') return false;
      const g = String(veri.grup || 'A').toUpperCase();
      const kitapciklar = veri.kitapciklar && typeof veri.kitapciklar === 'object' ? veri.kitapciklar : null;
      const guncelMap = kitapciklar || (veri.anahtar ? { [g]: veri.anahtar } : {});
      let maksDy = durum.hariciOmrAnahtar.dySayisi || 0;
      let maksTest = durum.hariciOmrAnahtar.testSayisi || 0;
      Object.keys(guncelMap).forEach((k) => {
        const hedef = guncelMap[k];
        if (!hedef || typeof hedef !== 'object') return;
        const dyStr = Array.isArray(hedef.dy) ? hedef.dy.join('') : String(hedef.dy || '');
        const testStr = Array.isArray(hedef.test) ? hedef.test.join('') : String(hedef.test || '');
        if (!durum.hariciOmrAnahtar.anahtarlar[k]) durum.hariciOmrAnahtar.anahtarlar[k] = { dy: '', test: '' };
        durum.hariciOmrAnahtar.anahtarlar[k].dy = dyStr.toUpperCase().replace(/[^DY]/g, '');
        durum.hariciOmrAnahtar.anahtarlar[k].test = testStr.toUpperCase().replace(/[^A-E]/g, '');
        maksDy = Math.max(maksDy, durum.hariciOmrAnahtar.anahtarlar[k].dy.length);
        maksTest = Math.max(maksTest, durum.hariciOmrAnahtar.anahtarlar[k].test.length);
      });
      durum.hariciOmrAnahtar.aktif = true;
      if (maksDy > 0) durum.hariciOmrAnahtar.dySayisi = maksDy;
      if (maksTest > 0) durum.hariciOmrAnahtar.testSayisi = maksTest;
      const chk = document.getElementById('ayar-omr-harici-anahtar-aktif');
      if (chk) chk.checked = true;
      ['A', 'B', 'C', 'D'].forEach((grp) => {
        const dyEl = document.getElementById(`omr-anahtar-${grp.toLowerCase()}-dy`);
        const testEl = document.getElementById(`omr-anahtar-${grp.toLowerCase()}-test`);
        const a = durum.hariciOmrAnahtar.anahtarlar[grp] || { dy: '', test: '' };
        if (dyEl) dyEl.value = a.dy || '';
        if (testEl) testEl.value = a.test || '';
      });
      return true;
    };

    const cekVeUygulaMasaustuV2Senkron = async () => {
      const hocaToken = sessionStorage.getItem('hoca_token') || '';
      if (!hocaToken || !location.protocol.startsWith('http') || navigator.onLine === false) {
        guncelleMasaustuV2DurumRozeti('Çevrimdışı / Oturum Bekliyor', 'rozet rozet-sari');
        return { ok: false };
      }
      if (__v2MasaustuSenkronSuruyor) return { ok: false };
      __v2MasaustuSenkronSuruyor = true;
      try {
        const sinceSeq = Number(durum.v2SonSeqNo) || 0;
        const yanit = await fetch(`/api/v2/sinav-senkron?sinceSeq=${sinceSeq}&sinavKodu=TUMU`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${hocaToken}` },
          cache: 'no-store'
        });
        if (!yanit.ok) {
          await yanit.text().catch(() => '');
          guncelleMasaustuV2DurumRozeti(yanit.status === 401 ? 'Oturum Gerekli (401)' : `Sunucu ${yanit.status}`, 'rozet rozet-sari');
          return { ok: false };
        }
        const veri = await yanit.json();
        const olaylar = Array.isArray(veri && veri.olaylar) ? veri.olaylar : [];
        const etkinYapi = okuEtkinOmrSinavYapisi();
        const aktifKod = String(etkinYapi.sinavKodu || 'GENEL').trim();
        let birlesenSayi = 0;
        let anahtarDegistiMi = false;
        let maksSeq = sinceSeq;

        olaylar.forEach((olay) => {
          if (!olay) return;
          if (Number(olay.seqNo) > maksSeq) maksSeq = Number(olay.seqNo);
          const kodUygun = !olay.sinavKodu || olay.sinavKodu === 'GENEL' || !aktifKod || aktifKod === 'GENEL' || olay.sinavKodu === aktifKod;
          if (!kodUygun) return;

          if (olay.tur === 'OKUDU_GUNCELLE' && olay.veri && typeof olay.veri === 'object') {
            const kayit = Object.assign({}, olay.veri);
            if (typeof C.ayiklaHamOmrBalonCevaplari === 'function') {
              kayit.hamCevaplar = C.ayiklaHamOmrBalonCevaplari(kayit);
            }
            const mevcutIdx = durum.okumaSonuclari.findIndex(
              (x) => (kayit.ogrNo && !kayit.numaraEslesmediMi && String(x.ogrNo) === String(kayit.ogrNo)) ||
                     (kayit.id && String(x.id) === String(kayit.id)) ||
                     (kayit.okumaId && String(x.id || x.okumaId) === String(kayit.okumaId))
            );
            if (mevcutIdx >= 0) {
              durum.okumaSonuclari[mevcutIdx] = Object.assign({}, durum.okumaSonuclari[mevcutIdx], kayit);
            } else {
              durum.okumaSonuclari.push(kayit);
            }
            birlesenSayi++;
          } else if (olay.tur === 'ANAHTAR_GUNCELLE' && olay.kaynakCihaz !== 'masaustu') {
            if (uygulaMasaustuHariciAnahtarVerisi(olay.veri)) {
              anahtarDegistiMi = true;
            }
          } else if (olay.tur === 'OGRENCI_EKLE' && olay.kaynakCihaz !== 'masaustu' && olay.veri && Array.isArray(olay.veri.ogrenciler)) {
            olay.veri.ogrenciler.forEach((o) => {
              if (o && o.ogrNo) ogrenciEkleAktifDerse(o.ogrNo, o.adSoyad || '');
            });
            birlesenSayi++;
          }
        });

        durum.v2SonSeqNo = Math.max(maksSeq, Number(veri && veri.sonSeqNo) || 0);
        if (birlesenSayi > 0 || anahtarDegistiMi) {
          if (durum.okumaSonuclari.length > 0 && typeof C.yenidenPuanlaOkumaSonuclari === 'function') {
            durum.okumaSonuclari = C.yenidenPuanlaOkumaSonuclari(durum.okumaSonuclari, okuEtkinOmrSinavYapisi());
          }
          verileriKaydet();
          guncelleOmrTabloVeKuyruk();
          guncelleMaddeAnaliziSekmesi();
          guncelleOgrenciListesiSekmesi();
          guncelleMasaustuV2DurumRozeti(`Canlı Eşitlendi · ${birlesenSayi} yeni güncelleme (#${durum.v2SonSeqNo})`, 'rozet rozet-yesil');
        } else {
          guncelleMasaustuV2DurumRozeti(`Canlı · #${durum.v2SonSeqNo} (${durum.okumaSonuclari.length} kağıt)`, 'rozet rozet-yesil');
        }
        return { ok: true, birlesenSayi, sonSeqNo: durum.v2SonSeqNo };
      } catch (_) {
        guncelleMasaustuV2DurumRozeti('Bağlantı Bekleniyor', 'rozet rozet-sari');
        return { ok: false };
      } finally {
        __v2MasaustuSenkronSuruyor = false;
      }
    };
    window.__masaustuV2SenkronSimdi = cekVeUygulaMasaustuV2Senkron;

    const btnOmrV2SimdiEsitle = document.getElementById('btn-omr-v2-simdi-esitle');
    if (btnOmrV2SimdiEsitle) {
      btnOmrV2SimdiEsitle.addEventListener('click', () => {
        yayinlaMobilDersPaketleriBuluta()
          .then(() => cekVeUygulaMasaustuV2Senkron())
          .catch(() => {});
      });
    }

    const btnOmrSinavPaketIndir = document.getElementById('btn-omr-sinavpaket-indir');
    if (btnOmrSinavPaketIndir) {
      btnOmrSinavPaketIndir.addEventListener('click', () => {
        if (typeof C.uretBirlesikSinavPaketi !== 'function') return;
        const yapi = okuEtkinOmrSinavYapisi();
        const aktifDers = (durum.dersler || []).find((d) => d.id === durum.aktifDersId) || null;
        const paket = C.uretBirlesikSinavPaketi({
          sinavKodu: yapi.sinavKodu || 'GENEL',
          dersId: durum.aktifDersId || '',
          dersAdi: (aktifDers && (aktifDers.dersAdi || aktifDers.ad)) || yapi.dersAdi || '',
          sinavYapisi: yapi,
          cevapAnahtarlari: yapi.cevapAnahtarlari || {},
          ogrenciler: durum.ogrenciler || [],
          okumaSonuclari: durum.okumaSonuclari || []
        });
        const blob = new Blob([JSON.stringify(paket, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = C.olusturGuvenliBlobUrl(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(yapi.sinavKodu || 'sinav').replace(/[^a-zA-Z0-9_-]/g, '_')}.sinavpaket.json`;
        a.click();
        if (typeof C.serbestBirakGuvenliBlobUrl === 'function') setTimeout(() => C.serbestBirakGuvenliBlobUrl(url), 1000);
        guncelleMasaustuV2DurumRozeti('💾 .sinavpaket.json indirildi', 'rozet rozet-yesil');
      });
    }

    const inpOmrSinavPaketYukle = document.getElementById('input-omr-sinavpaket-yukle');
    if (inpOmrSinavPaketYukle) {
      inpOmrSinavPaketYukle.addEventListener('change', (ev) => {
        const dosya = ev.target.files && ev.target.files[0];
        if (!dosya) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const paket = C.cozBirlesikSinavPaketi(String(reader.result || ''));
            (Array.isArray(paket.ogrenciler) ? paket.ogrenciler : []).forEach((o) => {
              if (o && o.ogrNo) ogrenciEkleAktifDerse(o.ogrNo, o.adSoyad || '');
            });
            if (paket.cevapAnahtarlari && typeof paket.cevapAnahtarlari === 'object') {
              uygulaMasaustuHariciAnahtarVerisi({ grup: 'A', kitapciklar: paket.cevapAnahtarlari });
            }
            (Array.isArray(paket.okumaSonuclari) ? paket.okumaSonuclari : []).forEach((k) => {
              if (!k || typeof k !== 'object') return;
              const idx = durum.okumaSonuclari.findIndex(
                (x) => (k.ogrNo && String(x.ogrNo) === String(k.ogrNo)) || (k.id && String(x.id) === String(k.id))
              );
              if (idx >= 0) durum.okumaSonuclari[idx] = Object.assign({}, durum.okumaSonuclari[idx], k);
              else durum.okumaSonuclari.push(k);
            });
            if (durum.okumaSonuclari.length > 0 && typeof C.yenidenPuanlaOkumaSonuclari === 'function') {
              durum.okumaSonuclari = C.yenidenPuanlaOkumaSonuclari(durum.okumaSonuclari, okuEtkinOmrSinavYapisi());
            }
            verileriKaydet();
            guncelleOgrenciListesiSekmesi();
            guncelleOmrTabloVeKuyruk();
            guncelleMaddeAnaliziSekmesi();
            sesliBipCal(true);
            guncelleMasaustuV2DurumRozeti(`📥 SHA-256 doğrulandı (${(paket.okumaSonuclari || []).length} kağıt)`, 'rozet rozet-yesil');
          } catch (err) {
            guncelleMasaustuV2DurumRozeti(`⚠️ Paket Hatası: ${(err && err.message) || err}`, 'rozet rozet-kirmizi');
            sesliBipCal(false);
          } finally {
            inpOmrSinavPaketYukle.value = '';
          }
        };
        reader.readAsText(dosya, 'utf-8');
      });
    }

    if (location.protocol.startsWith('http') && typeof C.kaydetGuvenliInterval === 'function') {
      C.kaydetGuvenliInterval('masaustu-v2-senkron', () => {
        if (sessionStorage.getItem('hoca_token') && navigator.onLine !== false) {
          cekVeUygulaMasaustuV2Senkron().catch(() => {});
        }
      }, 3500);
      if (sessionStorage.getItem('hoca_token')) {
        setTimeout(() => {
          yayinlaMobilDersPaketleriBuluta()
            .then(() => cekVeUygulaMasaustuV2Senkron())
            .catch(() => {});
        }, 1200);
      }
    }

    // Hoca Giriş Modalı Açıkken Klavye (Tab) Odak Kapanı (Focus Trap):
    // Arka plandaki bulanık stüdyo elemanlarına Tab ile odaklanılmasını engeller.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const modalEl = document.getElementById('modal-hoca-giris');
      if (!modalEl || window.getComputedStyle(modalEl).display === 'none') return;
      const odaklanabilirler = Array.from(
        modalEl.querySelectorAll('input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      ).filter((el) => el.offsetParent !== null);
      if (odaklanabilirler.length === 0) return;
      const ilk = odaklanabilirler[0];
      const son = odaklanabilirler[odaklanabilirler.length - 1];
      if (!modalEl.contains(document.activeElement)) {
        e.preventDefault();
        ilk.focus();
      } else if (e.shiftKey && document.activeElement === ilk) {
        e.preventDefault();
        son.focus();
      } else if (!e.shiftKey && document.activeElement === son) {
        e.preventDefault();
        ilk.focus();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', baslatUygulama);
  } else {
    baslatUygulama();
  }
})();
