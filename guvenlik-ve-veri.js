/* ==========================================================================
   GÜVENLİK ZIRHI, ŞEMA DOĞRULAMA, AKIŞ/KAYNAK YÖNETİMİ,
   7 ADIMLI MOBİL OMR GÖRÜNTÜ İŞLEME VE AKADEMİK MADDE ANALİZİ MOTORU
   ========================================================================== */

(function (global) {
  'use strict';

  /* ------------------------------------------------------------------------
     1. BEYAZ LİSTE HTML/URL SANİTİZASYONU VE ENTITY ÇÖZÜCÜ
     ------------------------------------------------------------------------ */
  function cozHtmlEntities(str) {
    if (typeof str !== 'string') return '';
    let s = str;
    for (let i = 0; i < 3; i++) {
      const onceki = s;
      s = s
        .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex) => {
          const kod = parseInt(hex, 16);
          return Number.isFinite(kod) ? String.fromCodePoint(kod) : '';
        })
        .replace(/&#0*([0-9]+);?/g, (_, dec) => {
          const kod = parseInt(dec, 10);
          return Number.isFinite(kod) ? String.fromCodePoint(kod) : '';
        })
        .replace(/&colon;/gi, ':')
        .replace(/&tab;/gi, '\t')
        .replace(/&newline;/gi, '\n')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'");
      if (s === onceki) break;
    }
    return s;
  }

  function guvenliURL(url) {
    if (typeof url !== 'string') return '#';
    const cozulmus = cozHtmlEntities(url)
      .replace(/[\u0000-\u0020\u007f-\u009f]+/g, '')
      .trim();
    if (!cozulmus) return '#';
    if (cozulmus.startsWith('#') || cozulmus.startsWith('/') || cozulmus.startsWith('./')) {
      if (/^(javascript|vbscript|data):/i.test(cozulmus)) return '#';
      return cozulmus;
    }
    const dusuk = cozulmus.toLowerCase();
    const izinliProtokoller = ['https://', 'http://', 'blob:', 'data:image/png', 'data:image/jpeg', 'data:image/webp', 'data:image/svg+xml'];
    if (izinliProtokoller.some((p) => dusuk.startsWith(p))) {
      return cozulmus;
    }
    return '#';
  }

  function kacisHTML(metin) {
    if (metin === null || metin === undefined) return '';
    return String(metin)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function temizleHTML(girdi) {
    if (typeof girdi !== 'string') return '';
    const cozulmus = cozHtmlEntities(girdi);
    if (/(javascript|vbscript)\s*:/i.test(cozulmus) || /data\s*:\s*text\/html/i.test(cozulmus)) {
      return kacisHTML(girdi.replace(/(javascript|vbscript|data)\s*:/gi, 'engellendi:'));
    }
    return kacisHTML(girdi);
  }

  /* ------------------------------------------------------------------------
     2. PROTOTYPE-POLLUTION KORUMASI, DERİNLİK SINIRI (>12) & ŞEMA DOĞRULAMA
     ------------------------------------------------------------------------ */
  const YASAKLI_ANAHTARLAR = new Set(['__proto__', 'constructor', 'prototype']);

  function derinTemizleNesne(veri, derinlik = 0) {
    if (derinlik > 12) {
      throw new Error('Derinlik sınırı aşıldı (Maksimum derinlik: 12)');
    }
    if (veri === null || typeof veri !== 'object') {
      return veri;
    }
    if (Array.isArray(veri)) {
      return veri.map((oge) => derinTemizleNesne(oge, derinlik + 1));
    }
    const temiz = Object.create(null);
    for (const anahtar of Object.keys(veri)) {
      if (YASAKLI_ANAHTARLAR.has(anahtar)) {
        throw new Error(`Güvenlik ihlali: Yasaklı anahtar tespit edildi (${anahtar})`);
      }
      temiz[anahtar] = derinTemizleNesne(veri[anahtar], derinlik + 1);
    }
    return Object.assign({}, temiz);
  }

  function semaDogrulaVeTemizle(hamVeri) {
    const veri = derinTemizleNesne(hamVeri, 0);
    if (!veri || typeof veri !== 'object' || Array.isArray(veri)) {
      throw new Error('Geçersiz yedek/veri formatı: Kök nesne olmalıdır.');
    }

    if (veri.ogrenciler !== undefined) {
      if (!Array.isArray(veri.ogrenciler)) {
        throw new Error('Şema hatası: ogrenciler bir dizi olmalıdır.');
      }
      for (let i = 0; i < veri.ogrenciler.length; i++) {
        const ogr = veri.ogrenciler[i];
        if (!ogr || typeof ogr !== 'object' || Array.isArray(ogr)) {
          throw new Error(`Şema hatası: ogrenciler[${i}] null veya geçersiz nesne olamaz.`);
        }
        if (typeof ogr.ogrNo !== 'string' || !ogr.ogrNo.trim() || typeof ogr.adSoyad !== 'string' || !ogr.adSoyad.trim()) {
          throw new Error(`Şema hatası: ogrenciler[${i}] zorunlu ogrNo ve adSoyad alanlarını taşımalıdır.`);
        }
      }
    }

    if (veri.sorular !== undefined) {
      if (!Array.isArray(veri.sorular)) {
        throw new Error('Şema hatası: sorular bir dizi olmalıdır.');
      }
      for (let i = 0; i < veri.sorular.length; i++) {
        const s = veri.sorular[i];
        if (!s || typeof s !== 'object' || Array.isArray(s)) {
          throw new Error(`Şema hatası: sorular[${i}] null veya geçersiz nesne olamaz.`);
        }
        if (typeof s.id !== 'string' || typeof s.metin !== 'string' || !['dy', 'test', 'klasik'].includes(s.tur)) {
          throw new Error(`Şema hatası: sorular[${i}] zorunlu id, metin ve geçerli tur (dy|test|klasik) taşımalıdır.`);
        }
      }
    }

    if (veri.oturumlar !== undefined) {
      if (!Array.isArray(veri.oturumlar)) {
        throw new Error('Şema hatası: oturumlar bir dizi olmalıdır.');
      }
      for (let i = 0; i < veri.oturumlar.length; i++) {
        const ot = veri.oturumlar[i];
        if (!ot || typeof ot !== 'object' || typeof ot.ogrNo !== 'string') {
          throw new Error(`Şema hatası: oturumlar[${i}] geçersiz.`);
        }
      }
    }

    if (veri.kurumsalSablonlar !== undefined) {
      if (!Array.isArray(veri.kurumsalSablonlar)) {
        throw new Error('Şema hatası: kurumsalSablonlar bir dizi olmalıdır.');
      }
      for (let i = 0; i < veri.kurumsalSablonlar.length; i++) {
        const sb = veri.kurumsalSablonlar[i];
        if (!sb || typeof sb !== 'object' || Array.isArray(sb) || typeof sb.id !== 'string' || !sb.id.trim() || typeof sb.ad !== 'string' || !sb.ad.trim()) {
          throw new Error(`Şema hatası: kurumsalSablonlar[${i}] zorunlu id ve ad alanlarını taşımalıdır.`);
        }
      }
    }

    return veri;
  }

  /* ------------------------------------------------------------------------
     3. AKIŞ (STREAM), BLOB URL VE ZAMANLAYICI (INTERVAL) KAYNAK YÖNETİCİSİ
     ------------------------------------------------------------------------ */
  const aktifBlobUrller = [];
  const MAX_BLOB_URL = 20;
  const aktifZamanlayicilar = new Map();

  function olusturGuvenliBlobUrl(blob) {
    while (aktifBlobUrller.length >= MAX_BLOB_URL) {
      const eski = aktifBlobUrller.shift();
      try { URL.revokeObjectURL(eski); } catch (_) {}
    }
    const url = URL.createObjectURL(blob);
    aktifBlobUrller.push(url);
    return url;
  }

  function temizleTumBlobUrller() {
    while (aktifBlobUrller.length > 0) {
      const u = aktifBlobUrller.pop();
      try { URL.revokeObjectURL(u); } catch (_) {}
    }
  }

  function kurGuvenliInterval(anahtar, fn, sureMs) {
    if (aktifZamanlayicilar.has(anahtar)) {
      clearInterval(aktifZamanlayicilar.get(anahtar));
      aktifZamanlayicilar.delete(anahtar);
    }
    const id = setInterval(fn, sureMs);
    aktifZamanlayicilar.set(anahtar, id);
    return id;
  }

  function temizleGuvenliInterval(anahtar) {
    if (aktifZamanlayicilar.has(anahtar)) {
      clearInterval(aktifZamanlayicilar.get(anahtar));
      aktifZamanlayicilar.delete(anahtar);
    }
  }

  async function guvenliDecompress(uint8Girdi, maksBoyutBayt = 262144, zamanAsimiMs = 3000) {
    if (typeof DecompressionStream === 'undefined') {
      return new TextDecoder().decode(uint8Girdi);
    }
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    const parcalar = [];
    let toplamBayt = 0;
    let zamanlayiciId = null;

    const iptalEt = async (sebep) => {
      parcalar.length = 0;
      try { await reader.cancel(sebep); } catch (_) {}
      try { await writer.abort(sebep); } catch (_) {}
    };

    try {
      const zamanAsimiSozu = new Promise((_, reject) => {
        zamanlayiciId = setTimeout(async () => {
          await iptalEt('Zaman aşımı');
          reject(new Error('DecompressionStream zaman aşımı aşıldı'));
        }, zamanAsimiMs);
      });

      const okumaSozu = (async () => {
        writer.write(uint8Girdi).catch(() => {});
        writer.close().catch(() => {});
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          toplamBayt += value.byteLength;
          if (toplamBayt > maksBoyutBayt) {
            await iptalEt('Boyut sınırı aşıldı');
            throw new Error('DecompressionStream maksimum boyut sınırı aşıldı');
          }
          parcalar.push(value);
        }
        const birlesik = new Uint8Array(toplamBayt);
        let ofset = 0;
        for (const p of parcalar) {
          birlesik.set(p, ofset);
          ofset += p.byteLength;
        }
        return new TextDecoder().decode(birlesik);
      })();

      return await Promise.race([okumaSozu, zamanAsimiSozu]);
    } finally {
      if (zamanlayiciId) clearTimeout(zamanlayiciId);
    }
  }

  /* ------------------------------------------------------------------------
     4. DETERMINİSTİK PRNG (A/B/C/D KİTAPÇIK KARIŞTIRICI) & VERİ MATRİSİ KODU
     ------------------------------------------------------------------------ */
  function tohumluRastgele(tohumStr) {
    let h = 2166136261 >>> 0;
    const s = String(tohumStr || 'VARSAYILAN');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h += 0x6D2B79F5;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function diziKaristirDeterministik(dizi, tohumStr) {
    const kopya = dizi.slice();
    const rng = tohumluRastgele(tohumStr);
    for (let i = kopya.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const gecici = kopya[i];
      kopya[i] = kopya[j];
      kopya[j] = gecici;
    }
    return kopya;
  }

  /* Şık Karıştırma ve Doğru Şık Değerini Koruma Motoru:
     Şık A'dan D'ye geçtiğinde doğru şık değerini (metnini) yeni harfine taşır;
     4 şıklı sınavlarda doğru şık E'de olsa bile asla silinmez, korunarak A-D içine taşınır.
     hedefDogruHarf ('A'..'E') verildiğinde doğru şık tam olarak o harf konumuna yerleştirilir. */
  function karistirSoruSiklariVeKoru(soru, tohumAnahtari, sikSayisi = 5, sikKaristir = true, hedefDogruHarf = null) {
    const harfler = ['A', 'B', 'C', 'D', 'E'];
    const hedefSikSayisi = Number(sikSayisi) === 4 ? 4 : 5;
    const mevcutSiklar = (soru.siklar || []).slice();
    if (mevcutSiklar.length === 0) {
      return {
        ...soru,
        siklar: [],
        orijinalDogruHarf: soru.dogruHarf || 'A',
        dogruHarf: soru.dogruHarf || 'A',
        dogruSikDegeri: soru.dogruSikDegeri || '',
        secenekHaritasi: {}
      };
    }

    const orijinalHarf = (soru.dogruHarf || 'A').toUpperCase();
    let dogruIndeks = harfler.indexOf(orijinalHarf);
    if (dogruIndeks < 0 || dogruIndeks >= mevcutSiklar.length) {
      if (soru.dogruSikDegeri) {
        const degerIdx = mevcutSiklar.findIndex(
          (m) => String(m).trim().toLowerCase() === String(soru.dogruSikDegeri).trim().toLowerCase()
        );
        dogruIndeks = degerIdx >= 0 ? degerIdx : 0;
      } else {
        dogruIndeks = 0;
      }
    }

    const etiketliSiklar = mevcutSiklar.map((metin, i) => ({
      metin,
      orijinalHarf: harfler[i] || 'A',
      dogruMu: i === dogruIndeks
    }));

    // 4 şıklı sınav seçildiyse ve soruda 5 şık varsa: Doğru şıkkı kesinlikle koru, yanına 3 çeldirici al
    let aktifSiklar = etiketliSiklar;
    if (hedefSikSayisi === 4 && etiketliSiklar.length > 4) {
      const dogruNesne = etiketliSiklar.find((x) => x.dogruMu) || etiketliSiklar[0];
      const celdiriciler = etiketliSiklar.filter((x) => x !== dogruNesne).slice(0, 3);
      // Doğru şıkkı orijinal sırasına (E ise 4. sıraya) yerleştir
      aktifSiklar = [];
      let cIdx = 0;
      const hedefDogruPoz = Math.min(3, dogruIndeks);
      for (let pos = 0; pos < 4; pos++) {
        if (pos === hedefDogruPoz) aktifSiklar.push(dogruNesne);
        else aktifSiklar.push(celdiriciler[cIdx++]);
      }
    }

    const aktifHarfKumesi = harfler.slice(0, aktifSiklar.length);
    const hedefHarfTemiz = hedefDogruHarf ? String(hedefDogruHarf).toUpperCase().trim() : '';
    const hedefPoz = aktifHarfKumesi.indexOf(hedefHarfTemiz);

    let sonSiklar;
    if (sikKaristir && hedefPoz >= 0) {
      const dogruNesne = aktifSiklar.find((x) => x.dogruMu) || aktifSiklar[0];
      const celdiriciler = diziKaristirDeterministik(
        aktifSiklar.filter((x) => x !== dogruNesne),
        tohumAnahtari
      );
      sonSiklar = [];
      let cPtr = 0;
      for (let pos = 0; pos < aktifSiklar.length; pos++) {
        if (pos === hedefPoz) sonSiklar.push(dogruNesne);
        else sonSiklar.push(celdiriciler[cPtr++]);
      }
    } else if (sikKaristir) {
      sonSiklar = diziKaristirDeterministik(aktifSiklar, tohumAnahtari);
    } else {
      sonSiklar = aktifSiklar;
    }

    const yeniDogruIdx = Math.max(0, sonSiklar.findIndex((x) => x.dogruMu));
    const yeniDogruHarf = harfler[yeniDogruIdx] || 'A';
    const dogruMetin = sonSiklar[yeniDogruIdx] ? sonSiklar[yeniDogruIdx].metin : '';
    const secenekHaritasi = {};
    sonSiklar.forEach((x, idx) => {
      secenekHaritasi[harfler[idx] || 'A'] = x.orijinalHarf || harfler[idx] || 'A';
    });

    return {
      ...soru,
      siklar: sonSiklar.map((x) => x.metin),
      orijinalDogruHarf: harfler[dogruIndeks] || 'A',
      dogruHarf: yeniDogruHarf,
      dogruSikDegeri: dogruMetin,
      secenekHaritasi
    };
  }

  /* Çoktan seçmeli test soruları için eşit kotalı (A..E veya A..D) ve ardışık 3+ tekrar (streak)
     içermeyen deterministik doğru harf dizisi üretir. */
  function uretDengeliHarfDizisi(adet, sikSayisi = 5, tohumDizgesi = 'DENGELI-ANAHTAR') {
    const n = Math.max(0, Number(adet) || 0);
    if (n === 0) return [];
    const k = Number(sikSayisi) === 4 ? 4 : 5;
    const harfler = ['A', 'B', 'C', 'D', 'E'].slice(0, k);
    const tabanKota = Math.floor(n / k);
    const kalan = n % k;

    const havuz = [];
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < tabanKota; j++) havuz.push(harfler[i]);
    }
    const kalanHarfler = diziKaristirDeterministik(harfler, `${tohumDizgesi}-KALAN`);
    for (let i = 0; i < kalan; i++) {
      havuz.push(kalanHarfler[i]);
    }

    const dizi = diziKaristirDeterministik(havuz, `${tohumDizgesi}-SIRA`);

    const ihlalVarMi = (arr, idx) => {
      if (idx < 0 || idx >= arr.length) return false;
      const h = arr[idx];
      if (idx >= 2 && arr[idx - 1] === h && arr[idx - 2] === h) return true;
      if (idx >= 1 && idx + 1 < arr.length && arr[idx - 1] === h && arr[idx + 1] === h) return true;
      if (idx + 2 < arr.length && arr[idx + 1] === h && arr[idx + 2] === h) return true;
      return false;
    };

    for (let tur = 0; tur < 4; tur++) {
      for (let i = 2; i < dizi.length; i++) {
        if (dizi[i] === dizi[i - 1] && dizi[i] === dizi[i - 2]) {
          let takasEdildi = false;
          for (let j = 0; j < dizi.length; j++) {
            const adayIdx = (i + 1 + j) % dizi.length;
            if (adayIdx === i || dizi[adayIdx] === dizi[i]) continue;
            const gecici = dizi[i];
            dizi[i] = dizi[adayIdx];
            dizi[adayIdx] = gecici;
            if (!ihlalVarMi(dizi, i) && !ihlalVarMi(dizi, adayIdx)) {
              takasEdildi = true;
              break;
            }
            dizi[adayIdx] = dizi[i];
            dizi[i] = gecici;
          }
          if (!takasEdildi) {
            for (let j = 0; j < dizi.length; j++) {
              if (dizi[j] !== dizi[i]) {
                const gecici = dizi[i];
                dizi[i] = dizi[j];
                dizi[j] = gecici;
                break;
              }
            }
          }
        }
      }
    }
    return dizi;
  }

  function hesaplaEnUzunDySerisi(dyListesi) {
    const dizi = Array.isArray(dyListesi) ? dyListesi : [];
    let enUzun = 0;
    let aktif = 0;
    let onceki = '';
    for (let i = 0; i < dizi.length; i++) {
      const kalem = dizi[i];
      const harf = typeof kalem === 'string'
        ? (kalem.toUpperCase() === 'Y' ? 'Y' : 'D')
        : (String((kalem && kalem.dogruDY) || 'D').toUpperCase() === 'Y' ? 'Y' : 'D');
      if (harf === onceki) {
        aktif++;
      } else {
        onceki = harf;
        aktif = 1;
      }
      if (aktif > enUzun) enUzun = aktif;
    }
    return enUzun;
  }

  /* Doğru/Yanlış (D/Y) sorularında 4+ ardışık aynı cevap (D,D,D,D veya Y,Y,Y,Y) yığılmasını önler.
     Hiçbir sorunun orijinal dogruDY cevabını değiştirmez; yalnız sıralamayı dengeler.
     Havuzda karşıt cevap yetersizse (örn. 8 D, 0 Y) uyari/dyDengesizUyari bayrağı üretir. */
  function onleDyArdisikYigilma(dyListesi) {
    const dizi = Array.isArray(dyListesi) ? dyListesi.slice() : [];
    const etiketle = (sonucDizi) => {
      const enUzun = hesaplaEnUzunDySerisi(sonucDizi);
      const dengesiz = enUzun > 3;
      Object.defineProperty(sonucDizi, 'enUzunDySerisi', { value: enUzun, enumerable: false, configurable: true, writable: true });
      Object.defineProperty(sonucDizi, 'dyDengesizUyari', { value: dengesiz, enumerable: false, configurable: true, writable: true });
      Object.defineProperty(sonucDizi, 'uyari', {
        value: dengesiz ? 'D/Y havuzunda yeterli D/Y çeşitliliği olmadığından ardışık yığılma yalnız sıralama ile çözülemedi.' : '',
        enumerable: false,
        configurable: true,
        writable: true
      });
      return sonucDizi;
    };
    if (dizi.length < 4) return etiketle(dizi);

    const harfAl = (s) => (String((s && s.dogruDY) || 'D').toUpperCase() === 'Y' ? 'Y' : 'D');

    for (let tur = 0; tur < 4; tur++) {
      for (let i = 3; i < dizi.length; i++) {
        const c = harfAl(dizi[i]);
        if (c === harfAl(dizi[i - 1]) && c === harfAl(dizi[i - 2]) && c === harfAl(dizi[i - 3])) {
          for (let j = 0; j < dizi.length; j++) {
            const adayIdx = (i + 1 + j) % dizi.length;
            if (harfAl(dizi[adayIdx]) !== c) {
              const gecici = dizi[i];
              dizi[i] = dizi[adayIdx];
              dizi[adayIdx] = gecici;
              break;
            }
          }
        }
      }
    }

    if (hesaplaEnUzunDySerisi(dizi) <= 3) {
      return etiketle(dizi);
    }

    // Basit takasla 3 altına inmediyse D ve Y gruplarını matematiksel en küçük bloklarla serpiştir
    const dGrubu = dizi.filter((s) => harfAl(s) === 'D');
    const yGrubu = dizi.filter((s) => harfAl(s) === 'Y');
    if (dGrubu.length === 0 || yGrubu.length === 0) {
      return etiketle(dizi);
    }

    const baskin = dGrubu.length >= yGrubu.length ? dGrubu.slice() : yGrubu.slice();
    const azinlik = dGrubu.length >= yGrubu.length ? yGrubu.slice() : dGrubu.slice();
    const kovaSayisi = azinlik.length + 1;
    const tabanBoyut = Math.floor(baskin.length / kovaSayisi);
    const fazlalik = baskin.length % kovaSayisi;

    const yeniDizi = [];
    let baskinImlec = 0;
    for (let k = 0; k < kovaSayisi; k++) {
      const buKovaAdet = tabanBoyut + (k < fazlalik ? 1 : 0);
      for (let m = 0; m < buKovaAdet && baskinImlec < baskin.length; m++) {
        yeniDizi.push(baskin[baskinImlec++]);
      }
      if (k < azinlik.length) {
        yeniDizi.push(azinlik[k]);
      }
    }
    return etiketle(yeniDizi);
  }

  /* A/B/C/D Kitapçık Üretici ve Simetrik Cevap Anahtarı Hesaplayıcı:
     sikKaristir=true olduğunda A dahil TÜM kitapçıklarda doğru şıklar A..E (veya A..D) arasında
     mümkün olduğunca eşit dağıtılır (yığılma ve 3+ ardışık aynı harf tekrarları engellenir). */
  function uretKitapcikVaryasyonu(seciliSorular, grupHarfi, sinavKodu, sikKaristir = true, sikSayisi = 5) {
    const dySorular = seciliSorular.filter((s) => s.tur === 'dy');
    const testSorular = seciliSorular.filter((s) => s.tur === 'test');
    const klasikSorular = seciliSorular.filter((s) => s.tur === 'klasik');
    const aktifGrup = String(grupHarfi || 'A').toUpperCase();
    const bazDy = sikKaristir ? onleDyArdisikYigilma(dySorular) : dySorular.slice();

    if (aktifGrup === 'A') {
      const dengeliHarfA = sikKaristir
        ? uretDengeliHarfDizisi(testSorular.length, sikSayisi, `${sinavKodu}-DENGELI-A`)
        : [];
      const grupADy = bazDy.map((s, idx) => ({ ...s, kitapcikSoruNo: idx + 1, orijinalNo: idx + 1 }));
      const grupADyAnahtar = grupADy.map((s) => (String(s.dogruDY || 'D').toUpperCase() === 'Y' ? 'Y' : 'D'));
      const enUzunDyA = hesaplaEnUzunDySerisi(grupADyAnahtar);
      const dyUyariA = enUzunDyA > 3;
      const grupATest = testSorular.map((s, idx) => {
        const korunan = karistirSoruSiklariVeKoru(
          s,
          `${sinavKodu}-SIK-A-${s.id}-${idx}`,
          sikSayisi,
          Boolean(sikKaristir),
          sikKaristir ? dengeliHarfA[idx] : null
        );
        return {
          ...korunan,
          kitapcikSoruNo: idx + 1,
          orijinalNo: idx + 1
        };
      });
      const grupAKlasik = klasikSorular.map((s, idx) => ({ ...s, kitapcikSoruNo: idx + 1, orijinalNo: idx + 1 }));
      return {
        grup: 'A',
        dy: grupADy,
        test: grupATest,
        klasik: grupAKlasik,
        enUzunDySerisi: enUzunDyA,
        dyDengesizUyari: dyUyariA,
        uyari: dyUyariA ? 'D/Y havuzunda yeterli D/Y çeşitliliği olmadığından ardışık yığılma yalnız sıralama ile çözülemedi.' : '',
        cevapAnahtari: {
          dy: grupADyAnahtar,
          test: grupATest.map((s) => String(s.dogruHarf || 'A').toUpperCase()),
          klasik: grupAKlasik.map((s, idx) => ({
            soruNo: idx + 1,
            orijinalNo: idx + 1,
            tamPuan: Number(s.puan || 10),
            rubrik: s.rubrik || 'Tam ve doğru açıklamaya tam puan verilir.'
          })),
          enUzunDySerisi: enUzunDyA,
          dyDengesizUyari: dyUyariA
        }
      };
    }

    const karisikDyHam = diziKaristirDeterministik(
      bazDy.map((s, idx) => ({ ...s, orijinalNo: idx + 1 })),
      `${sinavKodu}-DY-${aktifGrup}`
    );
    const karisikDyIslenmis = sikKaristir ? onleDyArdisikYigilma(karisikDyHam) : karisikDyHam;
    const karisikDy = karisikDyIslenmis.map((s, idx) => ({ ...s, kitapcikSoruNo: idx + 1 }));
    const karisikDyAnahtar = karisikDy.map((s) => (String(s.dogruDY || 'D').toUpperCase() === 'Y' ? 'Y' : 'D'));
    const enUzunDyGrup = hesaplaEnUzunDySerisi(karisikDyAnahtar);
    const dyUyariGrup = enUzunDyGrup > 3;

    const dengeliHarfGrup = sikKaristir
      ? uretDengeliHarfDizisi(testSorular.length, sikSayisi, `${sinavKodu}-DENGELI-${aktifGrup}`)
      : [];

    // A grubundaki şık haritasını referans alabilmek için A grubundaki karşılığını da hesapla
    const dengeliHarfA = sikKaristir
      ? uretDengeliHarfDizisi(testSorular.length, sikSayisi, `${sinavKodu}-DENGELI-A`)
      : [];
    const aGrubuReferansTest = testSorular.map((s, idx) =>
      karistirSoruSiklariVeKoru(
        s,
        `${sinavKodu}-SIK-A-${s.id}-${idx}`,
        sikSayisi,
        Boolean(sikKaristir),
        sikKaristir ? dengeliHarfA[idx] : null
      )
    );

    const karisikTest = diziKaristirDeterministik(
      testSorular.map((s, idx) => ({ ...s, orijinalNo: idx + 1, aGrubuDogruHarf: aGrubuReferansTest[idx].dogruHarf })),
      `${sinavKodu}-TEST-${aktifGrup}`
    ).map((s, idx) => {
      const korunan = karistirSoruSiklariVeKoru(
        s,
        `${sinavKodu}-SIK-${aktifGrup}-${s.id}-${idx}`,
        sikSayisi,
        Boolean(sikKaristir),
        sikKaristir ? dengeliHarfGrup[idx] : null
      );
      return {
        ...korunan,
        orijinalDogruHarf: s.aGrubuDogruHarf || korunan.orijinalDogruHarf,
        kitapcikSoruNo: idx + 1
      };
    });

    const karisikKlasik = diziKaristirDeterministik(
      klasikSorular.map((s, idx) => ({ ...s, orijinalNo: idx + 1 })),
      `${sinavKodu}-KLASIK-${aktifGrup}`
    ).map((s, idx) => ({ ...s, kitapcikSoruNo: idx + 1 }));

    return {
      grup: aktifGrup,
      dy: karisikDy,
      test: karisikTest,
      klasik: karisikKlasik,
      enUzunDySerisi: enUzunDyGrup,
      dyDengesizUyari: dyUyariGrup,
      uyari: dyUyariGrup ? 'D/Y havuzunda yeterli D/Y çeşitliliği olmadığından ardışık yığılma yalnız sıralama ile çözülemedi.' : '',
      cevapAnahtari: {
        dy: karisikDyAnahtar,
        test: karisikTest.map((s) => String(s.dogruHarf || 'A').toUpperCase()),
        klasik: karisikKlasik.map((s, idx) => ({
          soruNo: idx + 1,
          orijinalNo: s.orijinalNo || idx + 1,
          tamPuan: Number(s.puan || 10),
          rubrik: s.rubrik || 'Tam ve doğru açıklamaya tam puan verilir.'
        })),
        enUzunDySerisi: enUzunDyGrup,
        dyDengesizUyari: dyUyariGrup
      }
    };
  }

  /* ------------------------------------------------------------------------
     5. MİNİ GEOMETRİ MATRİS KODU (OPTİK KUTU ÜZERİNDEKİ ŞEMA BARKODU)
     Optik formun içindeki dinamik soru sayılarını (DY, Test, Klasik, Kimlik)
     2D yüksek kontrastlı 8x8 bit matrisi olarak basar ve kameradan okur.
     ------------------------------------------------------------------------ */
  function kodlaOptikGeometriMatrisi(ayar) {
    // 6 baytlık (48 bit) geometri özeti + 16 bit CRC = 64 bit (8x8 matris)
    const dy = Math.min(30, Math.max(0, Number(ayar.dySayisi || 0)));
    const test = Math.min(40, Math.max(0, Number(ayar.testSayisi || 0)));
    const sikSayisi = Number(ayar.sikSayisi || 5) === 4 ? 4 : 5;
    const klasik = Math.min(6, Math.max(0, Number(ayar.klasikSayisi || 0)));
    const kimlikKod = ayar.kimlikModu === 'tam' ? 2 : (ayar.kimlikModu === 'qr' ? 3 : (ayar.kimlikModu === 'son3' ? 0 : 1));
    const hane = ayar.kimlikModu === 'son3' ? 3 : Math.min(12, Math.max(2, Number(ayar.haneSayisi || 2)));

    const baytlar = [
      0xA5, // Senkronizasyon başlığı (10100101)
      dy & 0x3F,
      test & 0x3F,
      ((sikSayisi === 5 ? 1 : 0) << 5) | ((klasik & 0x07) << 2) | (kimlikKod & 0x03),
      hane & 0x0F,
      (dy ^ test ^ klasik ^ hane ^ 0x5A) & 0xFF // Sağlama toplamı (Checksum)
    ];

    const bitler = [];
    for (const b of baytlar) {
      for (let i = 7; i >= 0; i--) {
        bitler.push((b >> i) & 1);
      }
    }
    while (bitler.length < 64) {
      bitler.push((bitler.length % 2 === 0) ? 1 : 0);
    }
    return bitler;
  }

  function cozOptikGeometriMatrisi(bitler) {
    if (!Array.isArray(bitler) || bitler.length < 48) return null;
    const baytlar = [];
    for (let b = 0; b < 6; b++) {
      let deger = 0;
      for (let i = 0; i < 8; i++) {
        deger = (deger << 1) | (bitler[b * 8 + i] ? 1 : 0);
      }
      baytlar.push(deger);
    }
    if (baytlar[0] !== 0xA5) return null;
    const dySayisi = baytlar[1] & 0x3F;
    const testSayisi = baytlar[2] & 0x3F;
    const sikSayisi = ((baytlar[3] >> 5) & 1) === 1 ? 5 : 4;
    const klasikSayisi = (baytlar[3] >> 2) & 0x07;
    const kimlikKod = baytlar[3] & 0x03;
    const haneSayisi = baytlar[4] & 0x0F;
    const beklenenCrc = (dySayisi ^ testSayisi ^ klasikSayisi ^ haneSayisi ^ 0x5A) & 0xFF;
    if (baytlar[5] !== beklenenCrc) return null;

    const kimlikModu = kimlikKod === 2 ? 'tam' : (kimlikKod === 3 ? 'qr' : (kimlikKod === 0 ? 'son3' : 'son2'));
    return {
      dySayisi,
      testSayisi,
      sikSayisi,
      klasikSayisi,
      kimlikModu,
      haneSayisi
    };
  }

  function uretMiniGeometriSVG(ayar, boyutPx = 38) {
    const bitler = kodlaOptikGeometriMatrisi(ayar);
    const hucre = boyutPx / 10;
    const kisaEtiket = `DY:${ayar.dySayisi || 0}|T:${ayar.testSayisi || 0}|K:${ayar.klasikSayisi || 0}`;
    let rectler = `<rect x="0" y="0" width="${boyutPx}" height="${boyutPx}" fill="#fff" stroke="#000" stroke-width="1.5"/>`;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const bit = bitler[i * 8 + j];
        if (bit === 1) {
          rectler += `<rect x="${(j + 1) * hucre}" y="${(i + 1) * hucre}" width="${hucre}" height="${hucre}" fill="#000"/>`;
        }
      }
    }
    return `<div class="optik-mini-qr-kutu" title="Mini Geometri Şema QR (${kisaEtiket})"><svg width="${boyutPx}" height="${boyutPx}" viewBox="0 0 ${boyutPx} ${boyutPx}" xmlns="http://www.w3.org/2000/svg" aria-label="Optik Geometri Matrisi">${rectler}</svg><div class="optik-mini-qr-etiket">${kisaEtiket}</div></div>`;
  }

  /* ------------------------------------------------------------------------
     6. 7 ADIMLI MOBİL OMR GÖRÜNTÜ İŞLEME HATTI (COMPUTER VISION PIPELINE)
     1. Gri Tonlama & İntegral Görüntü
     2. Bradley-Roth Yerel Uyarlanabilir Eşikleme (Gölgeye Dayanıklı)
     3. 4 Köşe Fiducial Referans Karesi Tespiti
     4. Perspektif Düzeltme (Homography / Bilinear Warping -> 800x420 Kanonik)
     5. Alt-Izgara (Sub-grid) Balon Koordinat Haritalama
     6. İç/Dış Halka Kontrastı (Annular Contrast) & Z-Skor Karar Motoru
     7. Güvenilirlik Skoru ve Öğretmen İnceleme Kuyruğu Üretimi
     ------------------------------------------------------------------------ */

  const KANONIK_GENISLIK = 800;
  /* Geriye dönük uyumluluk için varsayılan yükseklik. Gerçek yükseklik, seçilen soru sayılarına göre
     yerleşimden gelir: uretOptikYerlesim(sema).yukseklik (basılı form ve okuma haritası AYNI kaynaktan üretilir). */
  const KANONIK_YUKSEKLIK = 420;
  /* Fiducial kare merkezlerinin kanonik formdaki köşeden uzaklığı (px). Köşe merkezleri (26,26)-(W-26,H-26) noktalarına oturtulur. */
  const KANONIK_FIDUCIAL_MERKEZ = 26;
  let aktifKanonikYukseklik = KANONIK_YUKSEKLIK;

  /* ------------------------------------------------------------------------
     TEK KAYNAKLI OPTİK FORM YERLEŞİMİ (Single Source of Truth)
     Hem BASILAN form (uretOptikFormSVG) hem de OKUMA haritası (balon koordinatları)
     bu fonksiyondan üretilir; böylece basılı kağıt ile okuyucu asla birbirinden kaymaz.
     Bloklar (Kimlik, D/Y, Test, Klasik) soldan sağa dizilir; sığmayan blok alt banda iner,
     form yüksekliği içeriğe göre dinamik hesaplanır.
     ------------------------------------------------------------------------ */
  function uretOptikYerlesim(sema) {
    const W = KANONIK_GENISLIK;
    const s = sema || {};
    const dySayisi = Math.max(0, Math.min(40, Number(s.dySayisi || 0)));
    const testSayisi = Math.max(0, Math.min(60, Number(s.testSayisi || 0)));
    const sikSayisi = Number(s.sikSayisi || 5) === 4 ? 4 : 5;
    const klasikSayisi = Math.max(0, Math.min(10, Number(s.klasikSayisi || 0)));
    const kimlikModu = s.kimlikModu || 'son2';
    const haneSayisi = kimlikModu === 'tam'
      ? Math.max(2, Math.min(12, Number(s.haneSayisi || 8)))
      : (kimlikModu === 'son3' ? 3 : (kimlikModu === 'qr' ? 0 : 2));
    const klasikOptikModu = s.klasikOptikModu === 'onlar_birler' ? 'onlar_birler' : 'kademeli6';

    const P = 20;        // satır aralığı
    const ILK = 30;      // blok üstünden ilk satır merkezine uzaklık
    const X0 = 50;
    const X1 = 750;
    const ARALIK = 14;   // bloklar arası boşluk
    const Y0 = 46;       // üst kenar (fiducial + geometri QR bandı)

    const harita = {
      genislik: W,
      yukseklik: 0,
      grupBalonlari: [],
      kimlikSatirlari: [],
      dySatirlari: [],
      testSatirlari: [],
      klasikSatirlari: [],
      etiketler: [],
      bloklar: []
    };

    const bloklar = [];

    // --- Blok 1: Kitapçık grubu + öğrenci kimliği
    {
      const rakamSatir = haneSayisi;
      const w = rakamSatir > 0 ? 218 : 150;
      const h = ILK + (rakamSatir > 0 ? 8 + rakamSatir * P : 0) + 14;
      const baslik = kimlikModu === 'tam'
        ? `KİTAPÇIK & ÖĞRENCİ NO (${haneSayisi} HANE)`
        : (kimlikModu === 'son3' ? 'KİTAPÇIK & ÖĞR. NO SON 3 HANE' : (kimlikModu === 'qr' ? 'KİTAPÇIK & QR KİMLİK' : 'KİTAPÇIK & ÖĞR. NO SON 2 HANE'));
      bloklar.push({
        ad: 'kimlik', w, h,
        ciz(bx, by) {
          harita.etiketler.push({ x: bx, y: by + 10, metin: baslik, boyut: 10, kalin: true });
          harita.etiketler.push({ x: bx, y: by + ILK + 3, metin: 'Grup', boyut: 9 });
          ['A', 'B', 'C', 'D'].forEach((harf, i) => {
            harita.grupBalonlari.push({ harf, x: bx + 50 + i * 22, y: by + ILK, r: 7.5 });
          });
          if (rakamSatir === 0) {
            harita.etiketler.push({ x: bx, y: by + ILK + 22, metin: 'Kimlik: ön baskılı QR / etiket', boyut: 8 });
          }
          const adlar = kimlikModu === 'son3' ? ['Yüzler', 'Onlar', 'Birler'] : (kimlikModu === 'son2' ? ['Onlar', 'Birler'] : null);
          for (let hh = 0; hh < rakamSatir; hh++) {
            const y = by + ILK + 8 + (hh + 1) * P;
            harita.etiketler.push({ x: bx, y: y + 3, metin: adlar ? adlar[hh] : `H${hh + 1}`, boyut: 9 });
            const balonlar = [];
            for (let r = 0; r <= 9; r++) {
              balonlar.push({ rakam: String(r), x: bx + 56 + r * 17.5, y, r: 6.5 });
            }
            harita.kimlikSatirlari.push({ haneIndeks: hh, balonlar });
          }
        }
      });
    }

    // --- Blok 2: Doğru / Yanlış
    if (dySayisi > 0) {
      const sutun = dySayisi > 26 ? 3 : (dySayisi > 5 ? 2 : 1);
      const satir = Math.ceil(dySayisi / sutun);
      const sutunGen = 78;
      bloklar.push({
        ad: 'dy',
        w: sutun * sutunGen - 10,
        h: ILK + (satir - 1) * P + 14,
        ciz(bx, by) {
          harita.etiketler.push({ x: bx, y: by + 10, metin: `DOĞRU / YANLIŞ (${dySayisi})`, boyut: 10, kalin: true });
          for (let i = 0; i < dySayisi; i++) {
            const sut = Math.floor(i / satir);
            const sat = i % satir;
            const x0 = bx + sut * sutunGen;
            const y = by + ILK + sat * P;
            harita.etiketler.push({ x: x0 + 20, y: y + 3, metin: `${i + 1}.`, boyut: 9, hiza: 'end' });
            harita.dySatirlari.push({
              soruNo: i + 1,
              balonlar: [
                { secenek: 'D', x: x0 + 34, y, r: 7.5 },
                { secenek: 'Y', x: x0 + 58, y, r: 7.5 }
              ]
            });
          }
        }
      });
    }

    // --- Blok 3: Çoktan seçmeli test
    if (testSayisi > 0) {
      const sutun = testSayisi > 26 ? 3 : (testSayisi > 8 ? 2 : 1);
      const satir = Math.ceil(testSayisi / sutun);
      const sutunGen = 34 + (sikSayisi - 1) * 20 + 22;
      const harfler = ['A', 'B', 'C', 'D', 'E'].slice(0, sikSayisi);
      bloklar.push({
        ad: 'test',
        w: sutun * sutunGen - 14,
        h: ILK + (satir - 1) * P + 14,
        ciz(bx, by) {
          harita.etiketler.push({ x: bx, y: by + 10, metin: `ÇOKTAN SEÇMELİ TEST (${testSayisi})`, boyut: 10, kalin: true });
          for (let i = 0; i < testSayisi; i++) {
            const sut = Math.floor(i / satir);
            const sat = i % satir;
            const x0 = bx + sut * sutunGen;
            const y = by + ILK + sat * P;
            harita.etiketler.push({ x: x0 + 20, y: y + 3, metin: `${i + 1}.`, boyut: 9, hiza: 'end' });
            harita.testSatirlari.push({
              soruNo: i + 1,
              balonlar: harfler.map((harf, idx) => ({ secenek: harf, x: x0 + 34 + idx * 20, y, r: 7.5 }))
            });
          }
        }
      });
    }

    // --- Blok 4: Klasik soru hoca puan barı
    if (klasikSayisi > 0) {
      const satirBasina = klasikOptikModu === 'onlar_birler' ? 2 : 1;
      const soruAdim = klasikOptikModu === 'onlar_birler' ? 2 * P + 8 : P;
      const w = klasikOptikModu === 'onlar_birler' ? 240 : 182;
      bloklar.push({
        ad: 'klasik',
        w,
        h: ILK + (klasikSayisi - 1) * soruAdim + (satirBasina - 1) * P + 14,
        ciz(bx, by) {
          harita.etiketler.push({
            x: bx, y: by + 10,
            metin: klasikOptikModu === 'onlar_birler' ? 'KLASİK PUAN (1P · YALNIZ GÖREVLİ)' : 'KLASİK PUAN (YALNIZ GÖREVLİ)',
            boyut: 9.5, kalin: true
          });
          for (let k = 0; k < klasikSayisi; k++) {
            const tamPuan = (Array.isArray(s.klasikSoruPuanlari) && s.klasikSoruPuanlari[k] !== undefined)
              ? Number(s.klasikSoruPuanlari[k])
              : Number(s.klasikSoruPuan || 10);
            const y = by + ILK + k * soruAdim;
            if (klasikOptikModu === 'onlar_birler') {
              harita.etiketler.push({ x: bx, y: y + 3, metin: `K${k + 1} (${tamPuan}p) On`, boyut: 8 });
              harita.etiketler.push({ x: bx, y: y + P + 3, metin: `K${k + 1} Birler`, boyut: 8 });
              harita.klasikSatirlari.push({
                soruNo: k + 1,
                tamPuan,
                optikModu: 'onlar_birler',
                onlarBalonlar: [0, 1, 2].map((rak, idx) => ({ secenek: String(rak), rakam: String(rak), x: bx + 76 + idx * 17, y, r: 6.5 })),
                birlerBalonlar: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((rak, idx) => ({ secenek: String(rak), rakam: String(rak), x: bx + 76 + idx * 17, y: y + P, r: 6.5 })),
                balonlar: []
              });
            } else {
              harita.etiketler.push({ x: bx, y: y + 3, metin: `K${k + 1} (${tamPuan}p)`, boyut: 8 });
              harita.klasikSatirlari.push({
                soruNo: k + 1,
                tamPuan,
                optikModu: 'kademeli6',
                balonlar: uretKlasikPuanAdimlari(tamPuan).map((puan, idx) => ({
                  secenek: String(puan), puanDegeri: puan, x: bx + 76 + idx * 20, y, r: 7
                }))
              });
            }
          }
        }
      });
    }

    // --- Yerleştirme (soldan sağa; sığmazsa alt bant)
    let x = X0;
    let bandY = Y0;
    let bandH = 0;
    let altSinir = Y0;
    for (const b of bloklar) {
      if (x > X0 && x + b.w > X1) {
        bandY += bandH + ARALIK;
        x = X0;
        bandH = 0;
      }
      b.ciz(x, bandY);
      harita.bloklar.push({ ad: b.ad, x, y: bandY, w: b.w, h: b.h });
      bandH = Math.max(bandH, b.h);
      altSinir = Math.max(altSinir, bandY + b.h);
      x += b.w + ARALIK;
    }
    harita.yukseklik = Math.max(150, Math.ceil(altSinir + 24));
    return harita;
  }

  /* Eski ad ile uyumluluk: okuyucu ve testler hesaplaKanonikBalonHaritasi adını kullanır */
  function hesaplaKanonikBalonHaritasi(sema) {
    return uretOptikYerlesim(sema);
  }

  /* BASILAN optik form: yerleşimden üretilen vektörel (SVG) çizim.
     sec: { grup:'A', ogrNoKod:'2023104042', baslik:'...' } -> grup balonu ve öğrenci numarası ön-baskılı doldurulur.
     En üst bantta Doğru (● Tam Dolu) ve Yanlış (✗ Çarpı, ✓ Tik, ◐ Yarım, ⊙ Nokta) kodlama örnekleri yer alır. */
  function uretOptikFormSVG(sema, sec = {}) {
    const y = uretOptikYerlesim(sema);
    const W = y.genislik;
    const H = y.yukseklik;
    const kac = (m) => String(m).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const parcalar = [];
    parcalar.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
    parcalar.push(`<rect x="7" y="7" width="${W - 14}" height="${H - 14}" fill="none" stroke="#111" stroke-width="1.6"/>`);

    const fid = (cx, cy, ici, koseAd) => {
      let s2 = `<rect class="fiducial-kare fiducial-${koseAd}" x="${cx - 12}" y="${cy - 12}" width="24" height="24" fill="#000"/><rect x="${cx - 6}" y="${cy - 6}" width="12" height="12" fill="#fff"/>`;
      if (!ici) s2 += `<rect x="${cx - 3}" y="${cy - 3}" width="6" height="6" fill="#000"/>`;
      return s2;
    };
    const M = KANONIK_FIDUCIAL_MERKEZ;
    // Sol-üst fiducial içi BOŞ (yön işareti), diğer üçünün merkezinde siyah nokta var
    parcalar.push(
      fid(M, M, true, 'tl'),
      fid(W - M, M, false, 'tr'),
      fid(M, H - M, false, 'bl'),
      fid(W - M, H - M, false, 'br')
    );

    // Mini geometri matrisi (üst orta)
    try {
      const bitler = kodlaOptikGeometriMatrisi(sema || {});
      let r = '';
      const h = 4;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          if (bitler[i * 8 + j] === 1) r += `<rect x="${W / 2 - 16 + j * h}" y="${8 + i * h}" width="${h}" height="${h}" fill="#000"/>`;
        }
      }
      parcalar.push(`<rect x="${W / 2 - 18}" y="6" width="36" height="36" fill="none" stroke="#000" stroke-width="1"/>${r}`);
    } catch (_) { /* geometri matrisi opsiyonel */ }

    // Üst Bant Sol (x: 62..370): Başlık + Görsel Doğru ve Yanlış Kodlama Örnekleri (Fiducial sessiz bölgesini bozmaz)
    if (sec.baslik) {
      parcalar.push(`<text x="62" y="17" font-size="9" font-weight="700" font-family="Arial,Helvetica,sans-serif" fill="#000">${kac(sec.baslik)}</text>`);
    }
    const oy = sec.baslik ? 30 : 24;
    parcalar.push(
      `<g class="optik-kodlama-rehberi" aria-label="Doğru ve Yanlış Kodlama Örnekleri">` +
      `<text x="62" y="${oy + 2}" font-size="7.4" font-weight="700" font-family="Arial,Helvetica,sans-serif" fill="#111">DOĞRU:</text>` +
      `<circle class="kodlama-ornek-balon" cx="101" cy="${oy - 1}" r="3.4" fill="#111"/>` +
      `<text x="107" y="${oy + 2}" font-size="7" font-family="Arial,Helvetica,sans-serif" fill="#111">Tam Dolu</text>` +
      `<text x="145" y="${oy + 2}" font-size="7.4" font-weight="700" font-family="Arial,Helvetica,sans-serif" fill="#444">| YANLIŞ:</text>` +
      `<text x="186" y="${oy + 2}" font-size="7" font-family="Arial,Helvetica,sans-serif" fill="#333">✗ Çarpı · ✓ Tik · ◐ Yarım · ⊙ Nokta/Silik</text>` +
      `</g>`
    );

    // Üst Bant Sağ (x: 432..736): Öğrenci No Kodlama Örneği & Klasik Barı Uyarısı
    parcalar.push(
      `<g class="optik-kimlik-rehberi" aria-label="Öğrenci Numarası Kodlama Örneği">` +
      `<text x="432" y="${oy + 2}" font-size="7.2" font-weight="700" font-family="Arial,Helvetica,sans-serif" fill="#111">` +
      `Örn. No Sonu ...07 → Onlar:(0)● Birler:(7)● | Klasik: Yalnız Görevli` +
      `</text></g>`
    );

    for (const e of y.etiketler) {
      parcalar.push(`<text x="${e.x}" y="${e.y}" font-size="${e.boyut || 9}" ${e.kalin ? 'font-weight="700"' : ''} ${e.hiza ? `text-anchor="${e.hiza}"` : ''} font-family="Arial,Helvetica,sans-serif" fill="#000">${kac(e.metin)}</text>`);
    }

    const balon = (b, metin, dolu) => {
      if (dolu) {
        return `<circle class="optik-balon" cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#111" stroke="#111" stroke-width="1.2"/>`;
      }
      return `<circle class="optik-balon" cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#fff" stroke="#222" stroke-width="1.2"/>` +
        `<text x="${b.x}" y="${b.y}" dy="0.35em" text-anchor="middle" font-size="${(b.r * 1.05).toFixed(1)}" font-family="Arial,Helvetica,sans-serif" fill="#444">${kac(metin)}</text>`;
    };

    for (const b of y.grupBalonlari) parcalar.push(balon(b, b.harf, sec.grup && b.harf === sec.grup));

    const noHam = String(sec.ogrNoKod || '').replace(/\D/g, '');
    const satirSay = y.kimlikSatirlari.length;
    const hedefNo = noHam && satirSay > 0 ? noHam.slice(-satirSay).padStart(satirSay, '0') : '';
    y.kimlikSatirlari.forEach((sat, i) => {
      for (const b of sat.balonlar) parcalar.push(balon(b, b.rakam, hedefNo && b.rakam === hedefNo[i]));
    });
    for (const sat of y.dySatirlari) for (const b of sat.balonlar) parcalar.push(balon(b, b.secenek, false));
    for (const sat of y.testSatirlari) for (const b of sat.balonlar) parcalar.push(balon(b, b.secenek, false));
    for (const sat of y.klasikSatirlari) {
      for (const b of (sat.balonlar || [])) parcalar.push(balon(b, b.secenek, false));
      for (const b of (sat.onlarBalonlar || [])) parcalar.push(balon(b, b.secenek, false));
      for (const b of (sat.birlerBalonlar || [])) parcalar.push(balon(b, b.secenek, false));
    }

    return `<svg class="optik-form-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto;background:#fff;" role="img" aria-label="Optik cevap formu">${parcalar.join('')}</svg>`;
  }

  /* Sınav Sonrası Çift Şık Doğru Sayma ("TEST-3:B|D, DY-2:D|Y") veya Cevap Anahtarı Düzeltme Çözücü */
  function cozEsnekAnahtarKurallari(kuralMetni = '') {
    const kurallar = {};
    if (typeof kuralMetni !== 'string' || !kuralMetni.trim()) return kurallar;
    const parcalar = kuralMetni.toUpperCase().split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
    for (const p of parcalar) {
      const es = p.match(/^(TEST-\d+|DY-\d+)\s*[:=]\s*([A-EDY\|\/\+]+)$/);
      if (es) {
        const soruKod = es[1];
        const kabulSiklar = es[2].split(/[\|\/\+]+/).map((x) => x.trim()).filter(Boolean);
        if (kabulSiklar.length > 0) {
          kurallar[soruKod] = kabulSiklar;
        }
      }
    }
    return kurallar;
  }

  /* Klasik Sorunun Tam Puanına Göre 6 Kademeli (%0, %20, %40, %60, %80, %100) Optik Balon Dizisi Üretici */
  function uretKlasikPuanAdimlari(tamPuan = 10) {
    const maks = Math.max(1, Number(tamPuan) || 10);
    const oranlar = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
    return oranlar.map((o) => {
      const ham = maks * o;
      return maks >= 5 ? Math.round(ham) : Number(ham.toFixed(1));
    });
  }

  /* Sınav Tanımlarken Toplam 100 Puan Üzerinden Bölüm Toplamı -> Soru Başı Bölme ve Klasik (Eşit / Tek Tek) Hesaplayıcı */
  function hesaplaSinavBolumVeSoruPuanlari(ayar = {}) {
    const dySayisi = Math.max(0, parseInt(ayar.dySayisi, 10) || 0);
    const testSayisi = Math.max(0, parseInt(ayar.testSayisi, 10) || 0);
    const klasikSayisi = Math.max(0, parseInt(ayar.klasikSayisi, 10) || 0);

    const dyToplamPuan = dySayisi > 0 ? Math.max(0, parseFloat(ayar.dyToplamPuan) || 0) : 0;
    const testToplamPuan = testSayisi > 0 ? Math.max(0, parseFloat(ayar.testToplamPuan) || 0) : 0;

    // D/Y ve Test için girilen bölüm toplam puanı soru sayısına bölünür
    const dySoruPuan = dySayisi > 0 ? Number((dyToplamPuan / dySayisi).toFixed(2)) : 0;
    const testSoruPuan = testSayisi > 0 ? Number((testToplamPuan / testSayisi).toFixed(2)) : 0;

    const klasikPuanModu = ayar.klasikPuanModu === 'tek_tek' ? 'tek_tek' : 'esit';
    let klasikToplamPuan = 0;
    let klasikSoruPuanlari = [];

    if (klasikSayisi > 0) {
      if (klasikPuanModu === 'tek_tek' && Array.isArray(ayar.klasikTekTekPuanlar) && ayar.klasikTekTekPuanlar.length > 0) {
        for (let k = 0; k < klasikSayisi; k++) {
          const p = Math.max(1, parseFloat(ayar.klasikTekTekPuanlar[k]) || 10);
          klasikSoruPuanlari.push(Number(p.toFixed(2)));
        }
        klasikToplamPuan = Number(klasikSoruPuanlari.reduce((a, b) => a + b, 0).toFixed(2));
      } else {
        klasikToplamPuan = Math.max(0, parseFloat(ayar.klasikToplamPuan) || 0);
        const esitBirim = Number((klasikToplamPuan / klasikSayisi).toFixed(2));
        for (let k = 0; k < klasikSayisi; k++) {
          klasikSoruPuanlari.push(esitBirim);
        }
      }
    }

    const klasikSoruPuan = klasikSayisi > 0
      ? Number((klasikToplamPuan / klasikSayisi).toFixed(2))
      : 0;

    const toplamPuan = Number((dyToplamPuan + testToplamPuan + klasikToplamPuan).toFixed(2));
    const fark100 = Number((100 - toplamPuan).toFixed(2));
    const tam100Mu = Math.abs(toplamPuan - 100) < 0.05;

    return {
      dySayisi,
      dyToplamPuan,
      dySoruPuan,
      testSayisi,
      testToplamPuan,
      testSoruPuan,
      klasikSayisi,
      klasikPuanModu,
      klasikToplamPuan,
      klasikSoruPuan,
      klasikSoruPuanlari,
      toplamPuan,
      fark100,
      tam100Mu
    };
  }

  /* ------------------------------------------------------------------------
     GÖRÜNTÜ ÖN İŞLEME YARDIMCILARI (gri tonlama, küçültme, yerel eşikleme, bağlantılı bileşenler)
     ------------------------------------------------------------------------ */
  function griyeCevirImageData(imageData) {
    const g = imageData.width;
    const y = imageData.height;
    const veri = imageData.data;
    const gri = new Uint8Array(g * y);
    for (let i = 0, p = 0; i < gri.length; i++, p += 4) {
      gri[i] = (veri[p] * 77 + veri[p + 1] * 150 + veri[p + 2] * 29) >> 8;
    }
    return gri;
  }

  /* Tam sayı katsayısıyla alan ortalamalı küçültme (büyük fotoğrafları hızlı işlemek için) */
  function kucultGri(gri, g, y, f) {
    if (f <= 1) return { gri, g, y };
    const ng = Math.floor(g / f);
    const ny = Math.floor(y / f);
    const hedef = new Uint8Array(ng * ny);
    const kare = f * f;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < ng; i++) {
        let t = 0;
        for (let dj = 0; dj < f; dj++) {
          const satir = (j * f + dj) * g + i * f;
          for (let di = 0; di < f; di++) t += gri[satir + di];
        }
        hedef[j * ng + i] = (t / kare) | 0;
      }
    }
    return { gri: hedef, g: ng, y: ny };
  }

  /* Gölgeye dayanıklı Bradley-Roth yerel uyarlanabilir eşikleme (integral görüntü) — gri dizi girişli */
  function adaptifEsiklemeGri(gri, genislik, yukseklik, pencereBoyutu = 32, duyarlilikT = 0.16) {
    const ikili = new Uint8Array(genislik * yukseklik);
    const integral = new Float64Array(genislik * yukseklik);
    for (let y = 0; y < yukseklik; y++) {
      let satirToplam = 0;
      for (let x = 0; x < genislik; x++) {
        const idx = y * genislik + x;
        satirToplam += gri[idx];
        integral[idx] = satirToplam + (y > 0 ? integral[(y - 1) * genislik + x] : 0);
      }
    }
    const yari = pencereBoyutu >> 1;
    for (let y = 0; y < yukseklik; y++) {
      const y1 = Math.max(0, y - yari);
      const y2 = Math.min(yukseklik - 1, y + yari);
      for (let x = 0; x < genislik; x++) {
        const x1 = Math.max(0, x - yari);
        const x2 = Math.min(genislik - 1, x + yari);
        const alan = (x2 - x1 + 1) * (y2 - y1 + 1);
        const a = integral[y2 * genislik + x2];
        const b = y1 > 0 ? integral[(y1 - 1) * genislik + x2] : 0;
        const c = x1 > 0 ? integral[y2 * genislik + (x1 - 1)] : 0;
        const d = (y1 > 0 && x1 > 0) ? integral[(y1 - 1) * genislik + (x1 - 1)] : 0;
        const toplam = a - b - c + d;
        const idx = y * genislik + x;
        ikili[idx] = (gri[idx] * alan) < (toplam * (1 - duyarlilikT)) ? 1 : 0;
      }
    }
    return { ikili, integral };
  }

  /* Geriye dönük uyumlu: ImageData girişli eşikleme */
  function uygulaAdaptifEsikleme(imageData, pencereBoyutu = 32, duyarlilikT = 0.16) {
    const genislik = imageData.width;
    const yukseklik = imageData.height;
    const gri = griyeCevirImageData(imageData);
    const { ikili, integral } = adaptifEsiklemeGri(gri, genislik, yukseklik, pencereBoyutu, duyarlilikT);
    return { gri, ikili, integral, genislik, yukseklik };
  }

  /* 4 bağlantılı bileşen etiketleme (yığın tabanlı, özyinelemesiz) */
  function bulBagliBilesenler(ikili, g, y) {
    const toplamPiksel = g * y;
    const etiket = new Int32Array(toplamPiksel);
    const yigin = new Int32Array(toplamPiksel);
    const bilesenler = [];
    for (let i0 = 0; i0 < toplamPiksel; i0++) {
      if (ikili[i0] !== 1 || etiket[i0] !== 0) continue;
      const id = bilesenler.length + 1;
      let top = 0;
      yigin[top++] = i0;
      etiket[i0] = id;
      let alan = 0;
      let minx = g;
      let maxx = 0;
      let miny = y;
      let maxy = 0;
      while (top > 0) {
        const p = yigin[--top];
        const px = p % g;
        const py = (p - px) / g;
        alan++;
        if (px < minx) minx = px;
        if (px > maxx) maxx = px;
        if (py < miny) miny = py;
        if (py > maxy) maxy = py;
        if (px > 0) { const q = p - 1; if (ikili[q] === 1 && etiket[q] === 0) { etiket[q] = id; yigin[top++] = q; } }
        if (px < g - 1) { const q = p + 1; if (ikili[q] === 1 && etiket[q] === 0) { etiket[q] = id; yigin[top++] = q; } }
        if (py > 0) { const q = p - g; if (ikili[q] === 1 && etiket[q] === 0) { etiket[q] = id; yigin[top++] = q; } }
        if (py < y - 1) { const q = p + g; if (ikili[q] === 1 && etiket[q] === 0) { etiket[q] = id; yigin[top++] = q; } }
      }
      bilesenler.push({ id, alan, minx, maxx, miny, maxy });
    }
    return { etiket, bilesenler };
  }

  /* ------------------------------------------------------------------------
     FORM BULUCU: Fotoğraf/kamera karesinde (sayfanın herhangi bir yerinde) formun 4 köşe fiducial karesini bulur.
     Fiducial = siyah kare halka (içi beyaz). Sol-üst fiducialin ortası BOŞ, diğer üçünde siyah nokta vardır;
     böylece sayfa 90°/180° döndürülmüş olsa bile yön tespit edilir.
     Sonuç koordinatları ORİJİNAL görüntü piksellerindedir.
     ------------------------------------------------------------------------ */
  function bulOptikFormKoseleri(imageData, ayar = {}) {
    const hedefOran = ayar.hedefOran || ((KANONIK_GENISLIK - 2 * KANONIK_FIDUCIAL_MERKEZ) / ((ayar.yukseklik || KANONIK_YUKSEKLIK) - 2 * KANONIK_FIDUCIAL_MERKEZ));
    const maxKenar = ayar.maxKenar || 1400;
    const f = Math.max(1, Math.ceil(Math.max(imageData.width, imageData.height) / maxKenar));
    let { gri, g, y } = { gri: griyeCevirImageData(imageData), g: imageData.width, y: imageData.height };
    if (f > 1) ({ gri, g, y } = kucultGri(gri, g, y, f));

    const kisaKenar = Math.min(g, y);
    const pencere = Math.max(15, Math.min(61, Math.round(kisaKenar / 18)));
    const { ikili } = adaptifEsiklemeGri(gri, g, y, pencere, 0.14);
    const { bilesenler } = bulBagliBilesenler(ikili, g, y);

    const minBoyut = Math.max(5, kisaKenar * 0.012);
    const maxBoyut = kisaKenar * 0.22;
    const kesinAdaylar = [];
    const esnekAdaylar = [];
    for (const b of bilesenler) {
      const bw = b.maxx - b.minx + 1;
      const bh = b.maxy - b.miny + 1;
      if (bw < minBoyut || bh < minBoyut || bw > maxBoyut || bh > maxBoyut) continue;
      const oran = bw / bh;
      if (oran < 0.68 || oran > 1.46) continue;
      const dolu = b.alan / (bw * bh);
      if (dolu < 0.50 || dolu > 0.95) continue;
      const nokta = (fx, fy) => {
        const px = Math.min(g - 1, Math.max(0, Math.round(b.minx + fx * (bw - 1))));
        const py = Math.min(y - 1, Math.max(0, Math.round(b.miny + fy * (bh - 1))));
        return ikili[py * g + px];
      };
      const kenar = [[0.12, 0.5], [0.88, 0.5], [0.5, 0.12], [0.5, 0.88]].filter(([a, c]) => nokta(a, c) === 1).length;
      if (kenar < 4) continue;
      const beyaz = [[0.34, 0.34], [0.66, 0.34], [0.34, 0.66], [0.66, 0.66]].filter(([a, c]) => nokta(a, c) === 0).length;
      const bant = [[0.31, 0.5], [0.69, 0.5], [0.5, 0.31], [0.5, 0.69]].filter(([a, c]) => nokta(a, c) === 0).length;
      const kesinMi = beyaz >= 3 && bant >= 3 && dolu >= 0.52 && dolu <= 0.94 && oran >= 0.7 && oran <= 1.42;
      const kucukFiducialMi = Math.min(bw, bh) <= 13 && beyaz >= 2 && (bant >= 1 || beyaz >= 3);
      if (!kesinMi && !kucukFiducialMi) continue;

      const cx = b.minx + (bw - 1) / 2;
      const cy = b.miny + (bh - 1) / 2;
      let t = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px = Math.min(g - 1, Math.max(0, Math.round(cx + dx)));
          const py = Math.min(y - 1, Math.max(0, Math.round(cy + dy)));
          t += gri[py * g + px];
          n++;
        }
      }
      const adayObj = { cx, cy, boyut: (bw + bh) / 2, merkezGri: t / n, kalite: (kesinMi ? 0 : 0.22) + Math.abs(dolu - 0.74) };
      if (kesinMi) kesinAdaylar.push(adayObj);
      esnekAdaylar.push(adayObj);
    }

    if (esnekAdaylar.length < 4) {
      return {
        bulundu: false,
        neden: `Optik kutunun 4 köşesindeki siyah kareler (▣) bulunamadı (${esnekAdaylar.length}/4). Kamerayı kağıdın üstündeki optik kutuya yaklaştırın.`,
        aday: esnekAdaylar.length
      };
    }

    const hedefR = Math.max(hedefOran, 1 / hedefOran);
    const dortluAra = (adayListesi, esnekOranMi = false) => {
      if (adayListesi.length < 4) return null;
      const siraliAdaylar = adayListesi.slice().sort((a, b) => a.kalite - b.kalite);
      const havuz = siraliAdaylar.slice(0, 24);
      let enIyi = null;
      for (let a = 0; a < havuz.length; a++) {
        for (let b = a + 1; b < havuz.length; b++) {
          for (let c = b + 1; c < havuz.length; c++) {
            for (let d = c + 1; d < havuz.length; d++) {
              const dortlu = [havuz[a], havuz[b], havuz[c], havuz[d]];
              const bs = dortlu.map((q) => q.boyut);
              const boyutOrani = Math.max(...bs) / Math.min(...bs);
              if (boyutOrani > (esnekOranMi ? 1.85 : 2.3)) continue;
              const mx = dortlu.reduce((t, q) => t + q.cx, 0) / 4;
              const my = dortlu.reduce((t, q) => t + q.cy, 0) / 4;
              const sirali = dortlu.slice().sort((p, q) => Math.atan2(p.cy - my, p.cx - mx) - Math.atan2(q.cy - my, q.cx - mx));
              let isaret = 0;
              let konveks = true;
              for (let i = 0; i < 4; i++) {
                const p0 = sirali[i];
                const p1 = sirali[(i + 1) % 4];
                const p2 = sirali[(i + 2) % 4];
                const cz = (p1.cx - p0.cx) * (p2.cy - p1.cy) - (p1.cy - p0.cy) * (p2.cx - p1.cx);
                if (cz === 0) { konveks = false; break; }
                if (isaret === 0) isaret = Math.sign(cz);
                else if (Math.sign(cz) !== isaret) { konveks = false; break; }
              }
              if (!konveks) continue;
              const mes = (p, q) => Math.hypot(p.cx - q.cx, p.cy - q.cy);
              const d01 = mes(sirali[0], sirali[1]);
              const d12 = mes(sirali[1], sirali[2]);
              const d23 = mes(sirali[2], sirali[3]);
              const d30 = mes(sirali[3], sirali[0]);
              const yatay = (d01 + d23) / 2;
              const dikey = (d12 + d30) / 2;
              const oran = Math.max(yatay, dikey) / Math.max(1, Math.min(yatay, dikey));
              const oranFarki = esnekOranMi
                ? Math.min(Math.abs(Math.log(oran / hedefR)), Math.abs(Math.log(oran / 3.7)))
                : Math.abs(Math.log(oran / hedefR));
              const skor = oranFarki + 0.8 * (Math.abs(Math.log(d01 / d23)) + Math.abs(Math.log(d12 / d30))) + 0.8 * Math.log(boyutOrani);
              const formBoyut = Math.max(yatay, dikey);
              const bekBoy = formBoyut * (24 / (KANONIK_GENISLIK - 2 * KANONIK_FIDUCIAL_MERKEZ));
              const boyutUyum = Math.abs(Math.log((bs.reduce((t, q) => t + q, 0) / 4) / bekBoy));
              let alan = 0;
              for (let i = 0; i < 4; i++) { const p0 = sirali[i]; const p1 = sirali[(i + 1) % 4]; alan += p0.cx * p1.cy - p1.cx * p0.cy; }
              alan = Math.abs(alan) / 2;
              if (alan < g * y * (esnekOranMi ? 0.022 : 0.03)) continue;
              const toplamSkor = skor + 0.9 * boyutUyum;
              if (!enIyi || toplamSkor < enIyi.skor) enIyi = { skor: toplamSkor, dortlu };
            }
          }
        }
      }
      return enIyi;
    };

    let enIyi = dortluAra(kesinAdaylar, false);
    if (!enIyi || enIyi.skor > 1.15) {
      const esnekEnIyi = dortluAra(esnekAdaylar, true);
      if (esnekEnIyi && (!enIyi || esnekEnIyi.skor < enIyi.skor)) {
        enIyi = esnekEnIyi;
      }
    }
    const adaylar = esnekAdaylar;

    if (!enIyi || enIyi.skor > 1.15) {
      return { bulundu: false, neden: 'Form köşeleri bulunamadı veya şekil beklenen form oranına uymuyor. Kağıdı düz ve tamamı görünecek şekilde tutun.', aday: adaylar.length };
    }

    // Yön tayini: ortası boş (en parlak merkez) fiducial = sol-üst
    const d = enIyi.dortlu.slice().sort((p, q) => q.merkezGri - p.merkezGri);
    const yonNet = (d[0].merkezGri - d[1].merkezGri) > 25;
    let tl;
    let tr;
    let bl;
    let br;
    if (yonNet) {
      tl = d[0];
      const digerleri = d.slice(1);
      br = digerleri.slice().sort((p, q) => Math.hypot(q.cx - tl.cx, q.cy - tl.cy) - Math.hypot(p.cx - tl.cx, p.cy - tl.cy))[0];
      const kalan = digerleri.filter((q) => q !== br);
      const cz = (q) => (br.cx - tl.cx) * (q.cy - tl.cy) - (br.cy - tl.cy) * (q.cx - tl.cx);
      kalan.sort((p, q) => cz(p) - cz(q));
      tr = kalan[0];
      bl = kalan[1];
    } else {
      // Yön işareti seçilemedi: dik (0°) duruş varsay
      const sy = enIyi.dortlu.slice().sort((p, q) => (p.cy + (p.cx * 0.0001)) - (q.cy + (q.cx * 0.0001)));
      const ust = sy.slice(0, 2).sort((p, q) => p.cx - q.cx);
      const alt = sy.slice(2, 4).sort((p, q) => p.cx - q.cx);
      tl = ust[0]; tr = ust[1]; bl = alt[0]; br = alt[1];
    }
    const don = (q) => ({ x: q.cx * f + (f - 1) / 2, y: q.cy * f + (f - 1) / 2, bulundu: true });
    return { bulundu: true, yonNet, koseler: { tl: don(tl), tr: don(tr), bl: don(bl), br: don(br) }, skor: enIyi.skor };
  }

  /* 4 nokta eşleşmesinden homografi (kanonik -> kaynak) çözümü */
  function hesaplaHomografi(hedefNoktalar, kaynakNoktalar) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const u = hedefNoktalar[i].x;
      const v = hedefNoktalar[i].y;
      const x = kaynakNoktalar[i].x;
      const y = kaynakNoktalar[i].y;
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
      b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
      b.push(y);
    }
    const n = 8;
    for (let i = 0; i < n; i++) {
      let max = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[max][i])) max = r;
      [A[i], A[max]] = [A[max], A[i]];
      [b[i], b[max]] = [b[max], b[i]];
      const piv = A[i][i] || 1e-12;
      for (let r = i + 1; r < n; r++) {
        const k = A[r][i] / piv;
        for (let c = i; c < n; c++) A[r][c] -= k * A[i][c];
        b[r] -= k * b[i];
      }
    }
    const h = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let t = b[i];
      for (let c = i + 1; c < n; c++) t -= A[i][c] * h[c];
      h[i] = t / (A[i][i] || 1e-12);
    }
    return h;
  }

  /* Gerçek perspektif (homografi) düzeltme + bilineer örnekleme: eğik dörtgeni W×H kanonik formuna oturtur */
  function perspektifDuzeltGri(gri, kaynakGen, kaynakYuk, koseler, W, H) {
    const M = KANONIK_FIDUCIAL_MERKEZ;
    const hedef = [{ x: M, y: M }, { x: W - M, y: M }, { x: M, y: H - M }, { x: W - M, y: H - M }];
    const kaynak = [koseler.tl, koseler.tr, koseler.bl, koseler.br];
    const h = hesaplaHomografi(hedef, kaynak);
    const cikti = new Uint8Array(W * H);
    for (let v = 0; v < H; v++) {
      for (let u = 0; u < W; u++) {
        const z = h[6] * u + h[7] * v + 1;
        const sx = (h[0] * u + h[1] * v + h[2]) / z;
        const sy = (h[3] * u + h[4] * v + h[5]) / z;
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        if (x0 < 0 || y0 < 0 || x0 >= kaynakGen - 1 || y0 >= kaynakYuk - 1) {
          cikti[v * W + u] = 255;
          continue;
        }
        const fx = sx - x0;
        const fy = sy - y0;
        const i00 = y0 * kaynakGen + x0;
        const t = gri[i00] * (1 - fx) * (1 - fy) + gri[i00 + 1] * fx * (1 - fy) + gri[i00 + kaynakGen] * (1 - fx) * fy + gri[i00 + kaynakGen + 1] * fx * fy;
        cikti[v * W + u] = t | 0;
      }
    }
    return cikti;
  }

  /* Eski imza (geriye dönük): bilineer köşe haritalama */
  function bul4KoseFiducial(ikili, genislik, yukseklik) {
    const ceyrekler = [
      { ad: 'tl', xMin: 0, xMax: Math.floor(genislik * 0.35), yMin: 0, yMax: Math.floor(yukseklik * 0.35), hedefX: 0, hedefY: 0 },
      { ad: 'tr', xMin: Math.floor(genislik * 0.65), xMax: genislik - 1, yMin: 0, yMax: Math.floor(yukseklik * 0.35), hedefX: genislik - 1, hedefY: 0 },
      { ad: 'bl', xMin: 0, xMax: Math.floor(genislik * 0.35), yMin: Math.floor(yukseklik * 0.65), yMax: yukseklik - 1, hedefX: 0, hedefY: yukseklik - 1 },
      { ad: 'br', xMin: Math.floor(genislik * 0.65), xMax: genislik - 1, yMin: Math.floor(yukseklik * 0.65), yMax: yukseklik - 1, hedefX: genislik - 1, hedefY: yukseklik - 1 }
    ];
    const pencereR = Math.max(5, Math.round(Math.min(genislik, yukseklik) * 0.018));
    const sonuc = {};
    for (const q of ceyrekler) {
      let enIyiSkor = -1;
      let enIyiX = Math.round((q.xMin + q.xMax) / 2);
      let enIyiY = Math.round((q.yMin + q.yMax) / 2);
      for (let y = q.yMin + pencereR; y <= q.yMax - pencereR; y += 2) {
        for (let x = q.xMin + pencereR; x <= q.xMax - pencereR; x += 2) {
          let siyahSayisi = 0;
          for (let dy = -pencereR; dy <= pencereR; dy += 2) {
            for (let dx = -pencereR; dx <= pencereR; dx += 2) {
              if (ikili[(y + dy) * genislik + (x + dx)] === 1) siyahSayisi++;
            }
          }
          const maksNokta = Math.pow(Math.floor((2 * pencereR) / 2) + 1, 2);
          const doluluk = siyahSayisi / maksNokta;
          if (doluluk >= 0.45 && doluluk <= 0.92) {
            const mesafe = Math.hypot(x - q.hedefX, y - q.hedefY);
            const skor = doluluk * 1000 - mesafe * 0.85;
            if (skor > enIyiSkor) { enIyiSkor = skor; enIyiX = x; enIyiY = y; }
          }
        }
      }
      sonuc[q.ad] = { x: enIyiX, y: enIyiY, bulundu: enIyiSkor > 0 };
    }
    return sonuc;
  }

  /* Eski imza (geriye dönük): ikili+gri giriş, sabit kanonik boyut */
  function perspektifDuzelt(gri, ikili, kaynakGen, kaynakYuk, koseler) {
    const H = aktifKanonikYukseklik;
    const duzGri = perspektifDuzeltGri(gri, kaynakGen, kaynakYuk, koseler, KANONIK_GENISLIK, H);
    const { ikili: duzIkili } = adaptifEsiklemeGri(duzGri, KANONIK_GENISLIK, H, 32, 0.16);
    return { gri: duzGri, ikili: duzIkili, genislik: KANONIK_GENISLIK, yukseklik: H };
  }

  /* İç/Dış Halka Kontrast Ölçümü (Annular Contrast + ±2px Yerel Merkezleme) */
  function olcBalonDoluluk(kanonikGri, kanonikIkili, merkezX, merkezY, yaricap) {
    const YUK = aktifKanonikYukseklik;
    let enYuksekSkor = 0;
    const icR2 = Math.pow(yaricap * 0.72, 2);
    const disMinR2 = Math.pow(yaricap * 1.15, 2);
    const disMaxR2 = Math.pow(yaricap * 1.55, 2);

    for (let oy = -2; oy <= 2; oy += 2) {
      for (let ox = -2; ox <= 2; ox += 2) {
        const cx = Math.round(merkezX + ox);
        const cy = Math.round(merkezY + oy);
        let icSiyah = 0;
        let icToplamGri = 0;
        let icSayac = 0;
        let disToplamGri = 0;
        let disSayac = 0;

        const taramaR = Math.ceil(yaricap * 1.55);
        for (let dy = -taramaR; dy <= taramaR; dy++) {
          const py = cy + dy;
          if (py < 0 || py >= YUK) continue;
          for (let dx = -taramaR; dx <= taramaR; dx++) {
            const px = cx + dx;
            if (px < 0 || px >= KANONIK_GENISLIK) continue;
            const r2 = dx * dx + dy * dy;
            const idx = py * KANONIK_GENISLIK + px;
            if (r2 <= icR2) {
              icSayac++;
              icSiyah += kanonikIkili[idx];
              icToplamGri += kanonikGri[idx];
            } else if (r2 >= disMinR2 && r2 <= disMaxR2) {
              disSayac++;
              disToplamGri += kanonikGri[idx];
            }
          }
        }

        if (icSayac > 0 && disSayac > 0) {
          const ikiliOran = icSiyah / icSayac;
          const icOrtalama = icToplamGri / icSayac;
          const disOrtalama = disToplamGri / disSayac;
          const kontrastFarki = Math.max(0, (disOrtalama - icOrtalama) / Math.max(40, disOrtalama));
          const birlesikSkor = ikiliOran * 0.58 + kontrastFarki * 0.42;
          if (birlesikSkor > enYuksekSkor) {
            enYuksekSkor = birlesikSkor;
          }
        }
      }
    }

    return Number(enYuksekSkor.toFixed(4));
  }

  /* Satır Karar Motoru: Boş / Tek İşaret / Silinti / Çift İşaretleme Ayrımı */
  function degerlendirBalonSatiri(kanonikGri, kanonikIkili, balonListesi, secenekEtiketAlan = 'secenek') {
    const olcumler = balonListesi.map((b) => ({
      ...b,
      etiket: b[secenekEtiketAlan] || b.harf || b.rakam,
      doluluk: olcBalonDoluluk(kanonikGri, kanonikIkili, b.x, b.y, b.r)
    }));

    const sirali = olcumler.slice().sort((a, b) => b.doluluk - a.doluluk);
    const enKoyu = sirali[0];
    const ikinciKoyu = sirali[1] || { doluluk: 0.01 };

    const BOS_ESIK = 0.22;
    const CIFT_ISARET_ALT_ESIK = 0.36;

    if (!enKoyu || enKoyu.doluluk < BOS_ESIK) {
      return {
        durum: 'BOS',
        secilen: null,
        guven: 0.96,
        enKoyuDoluluk: enKoyu ? enKoyu.doluluk : 0,
        ikinciDoluluk: ikinciKoyu.doluluk,
        olcumler
      };
    }

    const kontrastOrani = enKoyu.doluluk / Math.max(0.04, ikinciKoyu.doluluk);

    if (ikinciKoyu.doluluk >= CIFT_ISARET_ALT_ESIK && kontrastOrani < 1.28) {
      return {
        durum: 'CIFT',
        secilen: 'ÇİFT',
        guven: 0.45,
        supheli: true,
        enKoyuDoluluk: enKoyu.doluluk,
        ikinciDoluluk: ikinciKoyu.doluluk,
        olcumler
      };
    }

    if (ikinciKoyu.doluluk >= 0.25 && kontrastOrani < 1.75) {
      return {
        durum: 'SILINTI_SUPHELI',
        secilen: enKoyu.etiket,
        alternatif: ikinciKoyu.etiket,
        guven: Number(Math.min(0.88, 0.55 + (kontrastOrani - 1.28) * 0.6).toFixed(2)),
        supheli: true,
        enKoyuDoluluk: enKoyu.doluluk,
        ikinciDoluluk: ikinciKoyu.doluluk,
        olcumler
      };
    }

    const guven = Number(Math.min(0.99, 0.78 + (enKoyu.doluluk - BOS_ESIK) * 0.45).toFixed(2));
    return {
      durum: 'TEK',
      secilen: enKoyu.etiket,
      guven,
      supheli: guven < 0.85,
      enKoyuDoluluk: enKoyu.doluluk,
      ikinciDoluluk: ikinciKoyu.doluluk,
      olcumler
    };
  }

  /* Ana OMR Okuma Fonksiyonu (ImageData -> Tam Sınav Değerlendirme Sonucu)
     ozelKoseler verilmezse form, görüntünün HERHANGİ bir yerinde 4 köşe fiducialinden aranır.
     Form bulunamazsa { formBulundu:false, hata, mesaj } döner (yanlış puan üretilmez). */
  function okuOptikFormImageData(imageData, sinavYapisi, ogrenciListesi = [], ozelKoseler = null) {
    let etkinYapi = Object.assign({}, sinavYapisi || {});
    let harita = hesaplaKanonikBalonHaritasi(etkinYapi);
    let KG = harita.genislik;
    let KY = harita.yukseklik;
    aktifKanonikYukseklik = KY;

    let koseler = ozelKoseler;
    let formBulucu = null;
    if (!koseler) {
      formBulucu = bulOptikFormKoseleri(imageData, { yukseklik: KY });
      if (!formBulucu.bulundu) {
        return {
          formBulundu: false,
          hata: 'FORM_BULUNAMADI',
          mesaj: formBulucu.neden,
          aday: formBulucu.aday
        };
      }
      koseler = formBulucu.koseler;
    }

    const kaynakGri = griyeCevirImageData(imageData);

    // Fiziksel 4 köşe oranından (homografi öncesi) kağıttaki gerçek satır/bant yapısını otomatik uyarla:
    // Telefondaki sınav yapısı (örn. varsayılan 10 D/Y + 10 Test + 2 Klasik -> KY=330) ile
    // basılı kağıttaki optik kutu (örn. 15 D/Y + 10 Test + 0 Klasik -> KY=254) farklıysa otomatik algılar.
    if (!ozelKoseler && koseler && koseler.tl && koseler.tr && koseler.bl && koseler.br) {
      const ustGen = Math.hypot(koseler.tr.x - koseler.tl.x, koseler.tr.y - koseler.tl.y);
      const altGen = Math.hypot(koseler.br.x - koseler.bl.x, koseler.br.y - koseler.bl.y);
      const solYuk = Math.hypot(koseler.bl.x - koseler.tl.x, koseler.bl.y - koseler.tl.y);
      const sagYuk = Math.hypot(koseler.br.x - koseler.tr.x, koseler.br.y - koseler.tr.y);
      const ortGen = (ustGen + altGen) / 2;
      const ortYuk = (solYuk + sagYuk) / 2;
      if (ortGen > 25 && ortYuk > 15) {
        const fizikiOran = ortGen / ortYuk;
        const tahminiKY = Math.round(2 * KANONIK_FIDUCIAL_MERKEZ + (KANONIK_GENISLIK - 2 * KANONIK_FIDUCIAL_MERKEZ) / fizikiOran);
        if (Math.abs(tahminiKY - KY) > 22 && tahminiKY >= 165 && tahminiKY <= 295) {
          const tahminiSatir = Math.max(3, Math.min(13, Math.round((tahminiKY - 94) / 20)));
          const maksAdaySoru = tahminiSatir * 2;
          const denemeYapi = Object.assign({}, etkinYapi, {
            dySayisi: maksAdaySoru,
            testSayisi: maksAdaySoru,
            klasikSayisi: 0
          });
          const denemeHarita = hesaplaKanonikBalonHaritasi(denemeYapi);
          const dKY = denemeHarita.yukseklik;
          const dGri = perspektifDuzeltGri(kaynakGri, imageData.width, imageData.height, koseler, KG, dKY);
          const dIkili = adaptifEsiklemeGri(dGri, KG, dKY, 32, 0.16).ikili;
          const satirBasiliMi = (balonlar) => {
            let toplamSiyah = 0;
            for (const b of balonlar) {
              const r = Math.ceil(b.r + 1);
              for (let dy = -r; dy <= r; dy++) {
                const py = Math.round(b.y + dy);
                if (py < 0 || py >= dKY) continue;
                for (let dx = -r; dx <= r; dx++) {
                  const px = Math.round(b.x + dx);
                  if (px < 0 || px >= KG) continue;
                  if (dx * dx + dy * dy <= (b.r + 1.2) * (b.r + 1.2)) {
                    toplamSiyah += dIkili[py * KG + px];
                  }
                }
              }
            }
            return (toplamSiyah / Math.max(1, balonlar.length)) >= 11;
          };
          let algilananDy = 0;
          for (let i = 0; i < denemeHarita.dySatirlari.length; i++) {
            if (satirBasiliMi(denemeHarita.dySatirlari[i].balonlar)) algilananDy = i + 1;
          }
          let algilananTest = 0;
          for (let i = 0; i < denemeHarita.testSatirlari.length; i++) {
            if (satirBasiliMi(denemeHarita.testSatirlari[i].balonlar)) algilananTest = i + 1;
          }
          if (algilananDy > 0 || algilananTest > 0) {
            etkinYapi = Object.assign({}, etkinYapi, {
              dySayisi: algilananDy || etkinYapi.dySayisi,
              testSayisi: algilananTest || etkinYapi.testSayisi,
              klasikSayisi: 0,
              otomatikAlgilandiMi: true
            });
            harita = hesaplaKanonikBalonHaritasi(etkinYapi);
            KG = harita.genislik;
            KY = harita.yukseklik;
            aktifKanonikYukseklik = KY;
          }
        }
      }
    }

    const duzGri = perspektifDuzeltGri(kaynakGri, imageData.width, imageData.height, koseler, KG, KY);
    const duz = { gri: duzGri, ikili: adaptifEsiklemeGri(duzGri, KG, KY, 32, 0.16).ikili };

    const incelemeKuyrugu = [];

    // 1. Kitapçık Grubu Okuma
    const grupKarar = degerlendirBalonSatiri(duz.gri, duz.ikili, harita.grupBalonlari, 'harf');
    const okunanGrup = (grupKarar.secilen && ['A', 'B', 'C', 'D'].includes(grupKarar.secilen))
      ? grupKarar.secilen
      : (sinavYapisi.varsayilanGrup || 'A');
    let grupBelirsiz = false;
    if (grupKarar.supheli) {
      grupBelirsiz = true;
      incelemeKuyrugu.push({ alan: 'Kitapçık Grubu', detay: `Okunan: ${okunanGrup} (Güven: %${Math.round(grupKarar.guven * 100)})` });
    } else if (grupKarar.durum === 'BOS') {
      grupBelirsiz = true;
      incelemeKuyrugu.push({ alan: 'Kitapçık Grubu', detay: `Kitapçık grubu işaretlenmemiş — varsayılan ${okunanGrup} kitapçığı anahtarı kullanıldı, puanı kontrol edin` });
    }

    // 2. Öğrenci Numarası Okuma
    let okunanNoStr = '';
    for (let h = 0; h < harita.kimlikSatirlari.length; h++) {
      const hKarar = degerlendirBalonSatiri(duz.gri, duz.ikili, harita.kimlikSatirlari[h].balonlar, 'rakam');
      okunanNoStr += hKarar.secilen !== null && hKarar.secilen !== 'ÇİFT' ? hKarar.secilen : '?';
      if (hKarar.supheli || hKarar.durum === 'BOS') {
        incelemeKuyrugu.push({ alan: `Öğrenci No ${h + 1}. Basamak`, detay: `Durum: ${hKarar.durum}` });
      }
    }
    if (harita.kimlikSatirlari.length === 0) {
      incelemeKuyrugu.push({ alan: 'Öğrenci Kimliği', detay: 'QR/ön baskılı kimlik modunda numara balonlardan okunmaz; öğrenciyi listeden seçin' });
    }

    // Öğrenci Listesiyle Eşleştirme (Son 2 / Son 3 Hane veya Tam Numara)
    let eslesenOgrenciler = [];
    if (okunanNoStr && !okunanNoStr.includes('?')) {
      if (sinavYapisi.kimlikModu === 'tam') {
        eslesenOgrenciler = ogrenciListesi.filter((o) => String(o.ogrNo).endsWith(okunanNoStr));
      } else {
        const hane = sinavYapisi.kimlikModu === 'son3' ? 3 : 2;
        eslesenOgrenciler = ogrenciListesi.filter((o) => String(o.ogrNo).slice(-hane) === okunanNoStr.slice(-hane));
      }
    }
    if (eslesenOgrenciler.length > 1) {
      incelemeKuyrugu.push({
        alan: `Öğrenci No Son ${sinavYapisi.kimlikModu === 'son3' ? 3 : 2} Hane Çakışması`,
        detay: `Sonu "${okunanNoStr}" ile biten ${eslesenOgrenciler.length} öğrenci var: ${eslesenOgrenciler.map((x) => x.adSoyad).join(' / ')}`
      });
    }

    // 3. Cevap anahtarı
    const tekilEslesenOgr = eslesenOgrenciler[0] || null;
    const ogrenciOzelAnahtar = (
      sinavYapisi.ogrenciyeOzelDegerlendirmeAktif !== false &&
      tekilEslesenOgr &&
      sinavYapisi.ogrenciyeOzelAnahtarlar &&
      sinavYapisi.ogrenciyeOzelAnahtarlar[tekilEslesenOgr.ogrNo]
    ) || null;
    const grupAnahtar = ogrenciOzelAnahtar
      || (sinavYapisi.cevapAnahtarlari && sinavYapisi.cevapAnahtarlari[okunanGrup])
      || (sinavYapisi.cevapAnahtarlari && sinavYapisi.cevapAnahtarlari.A)
      || { dy: [], test: [], klasik: [] };
    const esnekKurallar = sinavYapisi.esnekAnahtarKurallari && typeof sinavYapisi.esnekAnahtarKurallari === 'object'
      ? sinavYapisi.esnekAnahtarKurallari
      : cozEsnekAnahtarKurallari(sinavYapisi.ciftSikMetin || '');

    // 4. Doğru / Yanlış
    const dyDetay = [];
    let dyDogru = 0;
    let dyYanlis = 0;
    let dyBos = 0;
    for (let i = 0; i < harita.dySatirlari.length; i++) {
      const sat = harita.dySatirlari[i];
      const karar = degerlendirBalonSatiri(duz.gri, duz.ikili, sat.balonlar, 'secenek');
      const soruKod = `DY-${i + 1}`;
      const beklenen = grupAnahtar.dy[i] || 'D';
      const esnekListe = esnekKurallar[soruKod] || null;
      const iptalMi = sinavYapisi.iptalEdilenSorular && sinavYapisi.iptalEdilenSorular.includes(soruKod);

      let sonucTipi = 'BOS';
      if (iptalMi) {
        sonucTipi = 'DOGRU';
        dyDogru++;
      } else if (karar.durum === 'BOS') {
        sonucTipi = 'BOS';
        dyBos++;
      } else if (karar.durum === 'CIFT') {
        sonucTipi = 'YANLIS';
        dyYanlis++;
      } else if ((esnekListe && esnekListe.includes(karar.secilen)) || karar.secilen === beklenen) {
        sonucTipi = 'DOGRU';
        dyDogru++;
      } else {
        sonucTipi = 'YANLIS';
        dyYanlis++;
      }

      if (karar.supheli) {
        incelemeKuyrugu.push({
          alan: `D/Y Soru ${i + 1}`,
          detay: `${karar.durum === 'CIFT' ? 'Çift şık işaretlenmiş' : `Silinti şüphesi (${karar.secilen} / ${karar.alternatif || ''})`}`
        });
      }

      dyDetay.push({
        soruNo: i + 1,
        verilen: karar.secilen,
        dogruCevap: esnekListe ? esnekListe.join('|') : beklenen,
        sonuc: sonucTipi,
        iptalMi: !!iptalMi,
        guven: karar.guven,
        supheli: !!karar.supheli
      });
    }

    // 5. Çoktan Seçmeli Test
    const testDetay = [];
    let testDogru = 0;
    let testYanlis = 0;
    let testBos = 0;
    for (let i = 0; i < harita.testSatirlari.length; i++) {
      const sat = harita.testSatirlari[i];
      const karar = degerlendirBalonSatiri(duz.gri, duz.ikili, sat.balonlar, 'secenek');
      const soruKod = `TEST-${i + 1}`;
      const beklenen = grupAnahtar.test[i] || 'A';
      const esnekListe = esnekKurallar[soruKod] || null;
      const iptalMi = sinavYapisi.iptalEdilenSorular && sinavYapisi.iptalEdilenSorular.includes(soruKod);

      let sonucTipi = 'BOS';
      if (iptalMi) {
        sonucTipi = 'DOGRU';
        testDogru++;
      } else if (karar.durum === 'BOS') {
        sonucTipi = 'BOS';
        testBos++;
      } else if (karar.durum === 'CIFT') {
        sonucTipi = 'YANLIS';
        testYanlis++;
      } else if ((esnekListe && esnekListe.includes(karar.secilen)) || karar.secilen === beklenen) {
        sonucTipi = 'DOGRU';
        testDogru++;
      } else {
        sonucTipi = 'YANLIS';
        testYanlis++;
      }

      if (karar.supheli) {
        incelemeKuyrugu.push({
          alan: `Test Soru ${i + 1}`,
          detay: `${karar.durum === 'CIFT' ? 'Çift şık işaretlenmiş' : `Silinti şüphesi (${karar.secilen} / ${karar.alternatif || ''})`}`
        });
      }

      testDetay.push({
        soruNo: i + 1,
        verilen: karar.secilen,
        dogruCevap: esnekListe ? esnekListe.join('|') : beklenen,
        sonuc: sonucTipi,
        iptalMi: !!iptalMi,
        guven: karar.guven,
        supheli: !!karar.supheli
      });
    }

    // 6. Klasik Soru Hoca Puan Barı
    const klasikDetay = [];
    let klasikToplamPuan = 0;
    for (let k = 0; k < harita.klasikSatirlari.length; k++) {
      const sat = harita.klasikSatirlari[k];
      let alinanPuan = 0;
      let guven = 0.95;

      if (sat.optikModu === 'onlar_birler' && sat.onlarBalonlar && sat.birlerBalonlar) {
        const kararOnlar = degerlendirBalonSatiri(duz.gri, duz.ikili, sat.onlarBalonlar, 'secenek');
        const kararBirler = degerlendirBalonSatiri(duz.gri, duz.ikili, sat.birlerBalonlar, 'secenek');
        const onlarDeger = (kararOnlar.secilen !== null && kararOnlar.secilen !== 'ÇİFT') ? Number(kararOnlar.secilen) : 0;
        const birlerDeger = (kararBirler.secilen !== null && kararBirler.secilen !== 'ÇİFT') ? Number(kararBirler.secilen) : 0;
        if (kararOnlar.durum === 'BOS' && kararBirler.durum === 'BOS') {
          const kararKademe = degerlendirBalonSatiri(duz.gri, duz.ikili, sat.balonlar, 'secenek');
          alinanPuan = (kararKademe.secilen !== null && kararKademe.secilen !== 'ÇİFT') ? Number(kararKademe.secilen) : 0;
          guven = kararKademe.guven;
        } else {
          alinanPuan = Math.min(sat.tamPuan || 30, onlarDeger * 10 + birlerDeger);
          guven = Number(((kararOnlar.guven + kararBirler.guven) / 2).toFixed(2));
        }
      } else {
        const karar = degerlendirBalonSatiri(duz.gri, duz.ikili, sat.balonlar, 'secenek');
        alinanPuan = (karar.secilen !== null && karar.secilen !== 'ÇİFT') ? Number(karar.secilen) : 0;
        guven = karar.guven;
      }

      klasikToplamPuan += alinanPuan;
      klasikDetay.push({
        soruNo: k + 1,
        verilenPuan: alinanPuan,
        guven
      });
    }

    // 7. Net ve Toplam Puan
    const dyGoturme = Number(sinavYapisi.dyGoturmeOrani || 0);
    const testGoturme = Number(sinavYapisi.testGoturmeOrani || 0);
    const dySoruPuan = Number(sinavYapisi.dySoruPuan || 2);
    const testSoruPuan = Number(sinavYapisi.testSoruPuan || 5);

    const dyNet = Math.max(0, dyDogru - (dyGoturme > 0 ? dyYanlis / dyGoturme : 0));
    const testNet = Math.max(0, testDogru - (testGoturme > 0 ? testYanlis / testGoturme : 0));

    const toplamPuan = Math.min(
      100,
      Math.round((dyNet * dySoruPuan + testNet * testSoruPuan + klasikToplamPuan) * 10) / 10
    );

    const tumGuvenler = [
      grupKarar.guven,
      ...dyDetay.map((d) => d.guven),
      ...testDetay.map((t) => t.guven)
    ];
    const ortalamaGuven = tumGuvenler.length > 0
      ? Number((tumGuvenler.reduce((a, b) => a + b, 0) / tumGuvenler.length).toFixed(2))
      : 0.95;

    const eslesenOgrenci = eslesenOgrenciler[0] || null;

    return {
      formBulundu: true,
      id: 'OMR-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      zamanDamgasi: new Date().toISOString(),
      okunanNoKod: okunanNoStr,
      ogrNo: eslesenOgrenci ? eslesenOgrenci.ogrNo : okunanNoStr,
      adSoyad: eslesenOgrenci ? eslesenOgrenci.adSoyad : `Kodlanan No: ${okunanNoStr}`,
      cakisanAdaylar: eslesenOgrenciler,
      numaraEslesmediMi: eslesenOgrenciler.length === 0,
      grup: okunanGrup,
      dyDogru,
      dyYanlis,
      dyBos,
      dyNet: Number(dyNet.toFixed(2)),
      testDogru,
      testYanlis,
      testBos,
      testNet: Number(testNet.toFixed(2)),
      klasikToplamPuan,
      toplamPuan,
      ortalamaGuven,
      supheliMi: incelemeKuyrugu.length > 0 || ortalamaGuven < 0.88 || grupBelirsiz,
      incelemeKuyrugu,
      dyDetay,
      testDetay,
      klasikDetay,
      koseler,
      algilananYapi: etkinYapi,
      kanonikBoyut: { genislik: KG, yukseklik: KY },
      kanonikHarita: harita,
      kanonikIkili: duz.ikili,
      kanonikGri: duz.gri
    };
  }

  /* ------------------------------------------------------------------------
     STANDART (HAZIR BASKI) OPTİK FORM OKUYUCU — şablonsuz, balon-bulma tabanlı
     Piyasadaki standart cevap kağıtlarını (A-B-C-D-E balonlu satırlar, 1..N soru, tek veya çok sütunlu)
     fiducial gerektirmeden okur: balonları bulur, eğimi düzeltir, satır/sütun ızgarasını çıkarır,
     dolu balonu kontrastla belirler, anahtara göre puanlar.
     ayar: { soruSayisi, sikSayisi(4|5), siralama:'sutun'|'satir', anahtar:'ABCDE...'|[...], yanlisGoturme:0|3|4,
             soruPuan (opsiyonel; yoksa 100/soruSayisi) }
     ------------------------------------------------------------------------ */
  function okuStandartOptikFormImageData(imageData, ayar = {}) {
    const soruSayisi = Math.max(1, Math.min(200, parseInt(ayar.soruSayisi, 10) || 20));
    const sikSayisi = Number(ayar.sikSayisi) === 4 ? 4 : 5;
    const siralama = ayar.siralama === 'satir' ? 'satir' : 'sutun';
    const harfler = ['A', 'B', 'C', 'D', 'E'].slice(0, sikSayisi);
    const anahtar = (Array.isArray(ayar.anahtar) ? ayar.anahtar : String(ayar.anahtar || '').toUpperCase().replace(/[^A-E]/g, '').split(''));

    const f = Math.max(1, Math.ceil(Math.max(imageData.width, imageData.height) / 2600));
    let { gri, g, y } = { gri: griyeCevirImageData(imageData), g: imageData.width, y: imageData.height };
    if (f > 1) ({ gri, g, y } = kucultGri(gri, g, y, f));
    const kisa = Math.min(g, y);
    const pencere = Math.max(15, Math.min(61, Math.round(kisa / 28)));
    const { ikili } = adaptifEsiklemeGri(gri, g, y, pencere, 0.14);
    const { bilesenler } = bulBagliBilesenler(ikili, g, y);

    // Balon adayları: kare/oval, ortak boyut kümesinde
    const ham = [];
    const tumKucuk = [];
    for (const b of bilesenler) {
      const bw = b.maxx - b.minx + 1;
      const bh = b.maxy - b.miny + 1;
      if (bw >= 3 && bh >= 3 && bw <= kisa * 0.12 && bh <= kisa * 0.12) tumKucuk.push({ cx: b.minx + (bw - 1) / 2, cy: b.miny + (bh - 1) / 2, boyut: Math.sqrt(bw * bh) });
      if (bw < 6 || bh < 6 || bw > kisa * 0.12 || bh > kisa * 0.12) continue;
      const oran = bw / bh;
      if (oran < 0.45 || oran > 2.3) continue;
      const doluluk = b.alan / (bw * bh);
      if (doluluk > 0.97) continue;
      ham.push({ cx: b.minx + (bw - 1) / 2, cy: b.miny + (bh - 1) / 2, bw, bh, boyut: Math.sqrt(bw * bh) });
    }
    if (ham.length < sikSayisi) {
      return { formBulundu: false, hata: 'BALON_BULUNAMADI', mesaj: 'Optik formdaki balonlar bulunamadı. Formu düz, aydınlık ve tamamı görünecek şekilde çekin.' };
    }
    // Başka bir bileşenin içinde kalan küçük bileşenleri (balon içindeki harf vb.) önce ele
    const icerdeMi = (b, o) => o.bw > b.bw * 1.35 && o.bh > b.bh * 1.2 && Math.abs(o.cx - b.cx) < o.bw / 2 && Math.abs(o.cy - b.cy) < o.bh / 2;
    {
      const kare = Math.max(8, Math.round(kisa / 40));
      const izgara = new Map();
      ham.forEach((b, i) => { const k = `${Math.floor(b.cx / kare)},${Math.floor(b.cy / kare)}`; if (!izgara.has(k)) izgara.set(k, []); izgara.get(k).push(i); });
      const silinecek = new Set();
      ham.forEach((o, j) => {
        if (o.boyut < 8) return;
        const gx0 = Math.floor((o.cx - o.bw / 2) / kare);
        const gx1 = Math.floor((o.cx + o.bw / 2) / kare);
        const gy0 = Math.floor((o.cy - o.bh / 2) / kare);
        const gy1 = Math.floor((o.cy + o.bh / 2) / kare);
        for (let gx = gx0; gx <= gx1; gx++) {
          for (let gy = gy0; gy <= gy1; gy++) {
            (izgara.get(`${gx},${gy}`) || []).forEach((i) => { if (i !== j && icerdeMi(ham[i], o)) silinecek.add(i); });
          }
        }
      });
      for (let i = ham.length - 1; i >= 0; i--) if (silinecek.has(i)) ham.splice(i, 1);
    }
    // Baskın boyut: histogram (1px kovalar)
    const kovalar = new Map();
    ham.forEach((b) => { const k = Math.round(b.boyut); kovalar.set(k, (kovalar.get(k) || 0) + 1); });
    let enIyiK = 0;
    let enIyiSay = -1;
    for (const [k] of kovalar) {
      let t = 0;
      for (let d = -2; d <= 2; d++) t += kovalar.get(k + d) || 0;
      if (t > enIyiSay) { enIyiSay = t; enIyiK = k; }
    }
    let balonlar = ham.filter((b) => b.boyut >= enIyiK * 0.72 && b.boyut <= enIyiK * 1.45);
    // Başka bir balonun içinde kalan bileşenleri (harf vb.) ele
    if (balonlar.length < sikSayisi) {
      return { formBulundu: false, hata: 'BALON_BULUNAMADI', mesaj: 'Yeterli sayıda balon bulunamadı.' };
    }
    const medBw = balonlar.map((b) => b.bw).sort((a, b) => a - b)[Math.floor(balonlar.length / 2)];
    const medBh = balonlar.map((b) => b.bh).sort((a, b) => a - b)[Math.floor(balonlar.length / 2)];
    const medBoyut = Math.sqrt(medBw * medBh);

    // Eğim (ve 90° dönüklük) tahmini: komşu çiftlerinin açısı (mod 90°)
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < balonlar.length; i++) {
      let enYakin = null;
      let enYakinD = Infinity;
      for (let j = 0; j < balonlar.length; j++) {
        if (i === j) continue;
        const dx = balonlar[j].cx - balonlar[i].cx;
        const dy = balonlar[j].cy - balonlar[i].cy;
        const d = Math.hypot(dx, dy);
        if (d < enYakinD && d > medBoyut * 0.8) { enYakinD = d; enYakin = { dx, dy }; }
      }
      if (enYakin && enYakinD < medBoyut * 4) {
        const a = Math.atan2(enYakin.dy, enYakin.dx);
        sx += Math.cos(4 * a);
        sy += Math.sin(4 * a);
      }
    }
    let egim = Math.atan2(sy, sx) / 4; // [-45°, +45°] kaba tahmin
    const dondur = (a) => balonlar.map((b) => ({
      ...b,
      x: b.cx * Math.cos(-a) - b.cy * Math.sin(-a),
      y: b.cx * Math.sin(-a) + b.cy * Math.cos(-a)
    }));

    // İnce ayar: aynı satırdaki uzak balon çiftlerinin eğimi (uzun taban çizgisi -> hassas açı)
    {
      const p0 = dondur(egim);
      const katkilar = [];
      const adim = Math.max(1, Math.floor(p0.length / 700));
      for (let i = 0; i < p0.length; i += adim) {
        for (let j = 0; j < p0.length; j++) {
          const dx = p0[j].x - p0[i].x;
          const dy = p0[j].y - p0[i].y;
          if (dx > medBw * 2.6 && dx < medBw * 8 && Math.abs(dy) < dx * 0.2) katkilar.push(Math.atan2(dy, dx));
        }
      }
      if (katkilar.length > 8) {
        katkilar.sort((a, b) => a - b);
        egim += katkilar[Math.floor(katkilar.length / 2)];
      }
    }

    const izgaraKur = (pts, bw, bh) => {
      const satirTol = Math.max(3, bh * 0.55);
      const sirali = pts.slice().sort((a, b) => a.y - b.y);
      const satirlar = [];
      for (const p of sirali) {
        const son = satirlar[satirlar.length - 1];
        if (son && Math.abs(son.ortY - p.y) <= satirTol) {
          son.noktalar.push(p);
          son.ortY = son.noktalar.reduce((t, q) => t + q.y, 0) / son.noktalar.length;
        } else {
          satirlar.push({ ortY: p.y, noktalar: [p] });
        }
      }
      satirlar.forEach((s) => s.noktalar.sort((a, b) => a.x - b.x));
      const aralik = [];
      satirlar.forEach((s) => { for (let i = 1; i < s.noktalar.length; i++) aralik.push(s.noktalar[i].x - s.noktalar[i - 1].x); });
      aralik.sort((a, b) => a - b);
      const medAralik = aralik.length ? aralik[Math.floor(aralik.length * 0.4)] : bw * 1.8;
      const gruplar = [];
      satirlar.forEach((s, si) => {
        let aktif = [s.noktalar[0]];
        const bitir = () => { gruplar.push({ satirIdx: si, y: s.ortY, noktalar: aktif }); };
        for (let i = 1; i < s.noktalar.length; i++) {
          if (s.noktalar[i].x - s.noktalar[i - 1].x > medAralik * 1.6) { bitir(); aktif = [s.noktalar[i]]; } else aktif.push(s.noktalar[i]);
        }
        bitir();
      });
      const gecerli = gruplar.filter((gr) => gr.noktalar.length === sikSayisi);
      return { satirlar, gruplar, gecerli };
    };

    // Yön denemesi: açı + {0, 90°, 180°, 270°}. Önce geçerli grup sayısı; eşitlikte soru numaralarının (etiketlerin) satırın SOLUNDA olması
    const etiketAdaylari = tumKucuk.filter((c) => c.boyut >= enIyiK * 0.25 && c.boyut <= enIyiK * 0.9
      && !balonlar.some((b) => Math.abs(b.cx - c.cx) < b.bw / 2 + 1 && Math.abs(b.cy - c.cy) < b.bh / 2 + 1));
    const adayYonler = [];
    for (const ek of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const a = egim + ek;
      const pts = dondur(a);
      const dikMi = ek === Math.PI / 2 || ek === (3 * Math.PI) / 2;
      const ig = izgaraKur(pts, dikMi ? medBh : medBw, dikMi ? medBw : medBh);
      const lbl = etiketAdaylari.map((c) => ({ x: c.cx * Math.cos(-a) - c.cy * Math.sin(-a), y: c.cx * Math.sin(-a) + c.cy * Math.cos(-a) }));
      let etiketSkor = 0;
      ig.gecerli.forEach((gr) => {
        const ilk = gr.noktalar[0];
        const son = gr.noktalar[gr.noktalar.length - 1];
        const solda = lbl.some((p) => p.x < ilk.x - medBoyut * 0.8 && p.x > ilk.x - medBoyut * 4.5 && Math.abs(p.y - gr.y) < medBoyut * 0.6);
        const sagda = lbl.some((p) => p.x > son.x + medBoyut * 0.8 && p.x < son.x + medBoyut * 4.5 && Math.abs(p.y - gr.y) < medBoyut * 0.6);
        if (solda && !sagda) etiketSkor++;
        else if (sagda && !solda) etiketSkor--;
      });
      adayYonler.push({ a, pts, ig, etiketSkor });
    }
    const enCok = Math.max(...adayYonler.map((y) => y.ig.gecerli.length));
    const yakinlar = adayYonler.filter((y) => y.ig.gecerli.length >= enCok * 0.9 && y.ig.gecerli.length > 0);
    let en = yakinlar.sort((p, q) => (q.etiketSkor - p.etiketSkor) || (q.ig.gecerli.length - p.ig.gecerli.length))[0] || adayYonler[0];
    const geciciGruplar = en.ig.gecerli;
    if (geciciGruplar.length === 0) {
      return { formBulundu: false, hata: 'IZGARA_BULUNAMADI', mesaj: `Balon satırları ${sikSayisi} şıklı düzende çözülemedi. Şık sayısını ve formun tamamının göründüğünü kontrol edin.` };
    }

    // Sütun kümeleri (grubun ilk balonunun x'i)
    const sutunTol = Math.max(8, medBw * 1.5);
    const sutunOrt = [];
    geciciGruplar.slice().sort((a, b) => a.noktalar[0].x - b.noktalar[0].x).forEach((gr) => {
      const x0 = gr.noktalar[0].x;
      const k = sutunOrt.find((s) => Math.abs(s.x - x0) <= sutunTol);
      if (k) { k.n++; k.x = (k.x * (k.n - 1) + x0) / k.n; gr.sutun = k; } else { const yeni = { x: x0, n: 1 }; sutunOrt.push(yeni); gr.sutun = yeni; }
    });
    sutunOrt.sort((a, b) => a.x - b.x);
    geciciGruplar.forEach((gr) => { gr.sutunIdx = sutunOrt.indexOf(gr.sutun); });

    let siraliGruplar;
    if (siralama === 'sutun') {
      siraliGruplar = geciciGruplar.slice().sort((a, b) => (a.sutunIdx - b.sutunIdx) || (a.y - b.y));
    } else {
      siraliGruplar = geciciGruplar.slice().sort((a, b) => (a.satirIdx - b.satirIdx) || (a.sutunIdx - b.sutunIdx));
    }

    // Doluluk ölçümü: orijinal (dönmemiş) koordinatlarda iç elips / dış halka kontrastı
    const olcSkor = (b) => {
      const rx = Math.max(2, b.bw / 2);
      const ry = Math.max(2, b.bh / 2);
      let ic = 0;
      let icN = 0;
      let dis = 0;
      let disN = 0;
      const x0 = Math.max(0, Math.floor(b.cx - rx * 1.7));
      const x1 = Math.min(g - 1, Math.ceil(b.cx + rx * 1.7));
      const y0 = Math.max(0, Math.floor(b.cy - ry * 1.7));
      const y1 = Math.min(y - 1, Math.ceil(b.cy + ry * 1.7));
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const nx = (xx - b.cx) / rx;
          const ny = (yy - b.cy) / ry;
          const r2 = nx * nx + ny * ny;
          if (r2 <= 0.5) { ic += gri[yy * g + xx]; icN++; }
          else if (r2 >= 1.45 && r2 <= 2.4) { dis += gri[yy * g + xx]; disN++; }
        }
      }
      if (icN === 0 || disN === 0) return 0;
      const icO = ic / icN;
      const disO = dis / disN;
      return Math.max(0, (disO - icO) / Math.max(40, disO));
    };
    const skorlar = new Map();
    siraliGruplar.forEach((gr) => gr.noktalar.forEach((p) => skorlar.set(p, olcSkor(p))));

    // Dinamik eşik (Otsu benzeri; belirgin iki küme yoksa sabit)
    const tumSkor = Array.from(skorlar.values()).sort((a, b) => a - b);
    let esik = 0.4;
    if (tumSkor.length > 8 && tumSkor[tumSkor.length - 1] > 0.3) {
      let enBuyukVar = -1;
      for (let t = 0.2; t <= 0.6; t += 0.02) {
        const alt = tumSkor.filter((v) => v < t);
        const ust = tumSkor.filter((v) => v >= t);
        if (alt.length === 0 || ust.length === 0) continue;
        const m1 = alt.reduce((p, q) => p + q, 0) / alt.length;
        const m2 = ust.reduce((p, q) => p + q, 0) / ust.length;
        const varyans = alt.length * ust.length * Math.pow(m1 - m2, 2);
        if (varyans > enBuyukVar) { enBuyukVar = varyans; esik = t; }
      }
      esik = Math.min(0.55, Math.max(0.3, esik));
    }

    const sorular = [];
    const incelemeKuyrugu = [];
    let dogru = 0;
    let yanlis = 0;
    let bos = 0;
    for (let q = 0; q < soruSayisi; q++) {
      const gr = siraliGruplar[q];
      if (!gr) {
        sorular.push({ soruNo: q + 1, verilen: null, durum: 'OKUNAMADI', sonuc: 'BOS', guven: 0 });
        bos++;
        incelemeKuyrugu.push({ alan: `Soru ${q + 1}`, detay: 'Forma ait balon satırı bulunamadı' });
        continue;
      }
      const olc = gr.noktalar.map((p, i) => ({ harf: harfler[i], skor: skorlar.get(p) || 0 }));
      const sr = olc.slice().sort((a, b) => b.skor - a.skor);
      const s1 = sr[0];
      const s2 = sr[1] || { skor: 0.01 };
      let durum = 'TEK';
      let verilen = s1.harf;
      let guven = Number(Math.min(0.99, 0.75 + (s1.skor - esik) * 0.5).toFixed(2));
      if (s1.skor < esik) { durum = 'BOS'; verilen = null; guven = 0.95; }
      else if (s2.skor >= esik && s1.skor / Math.max(0.04, s2.skor) < 1.3) { durum = 'CIFT'; verilen = 'ÇİFT'; guven = 0.45; }
      else if (s2.skor >= esik * 0.75 && s1.skor / Math.max(0.04, s2.skor) < 1.8) { durum = 'SILINTI_SUPHELI'; guven = 0.6; }
      const beklenen = anahtar[q] || null;
      let sonuc = 'BOS';
      if (durum === 'BOS') { sonuc = 'BOS'; bos++; }
      else if (durum === 'CIFT') { sonuc = 'YANLIS'; yanlis++; }
      else if (beklenen && verilen === beklenen) { sonuc = 'DOGRU'; dogru++; }
      else { sonuc = beklenen ? 'YANLIS' : 'BOS'; if (beklenen) yanlis++; else bos++; }
      if (durum === 'CIFT' || durum === 'SILINTI_SUPHELI') {
        incelemeKuyrugu.push({ alan: `Soru ${q + 1}`, detay: durum === 'CIFT' ? 'Çift şık işaretlenmiş' : `Silinti şüphesi (${s1.harf} / ${s2.harf || ''})` });
      }
      sorular.push({ soruNo: q + 1, verilen, durum, dogruCevap: beklenen, sonuc, guven, supheli: durum === 'CIFT' || durum === 'SILINTI_SUPHELI' });
    }

    const goturme = Number(ayar.yanlisGoturme || 0);
    const net = Math.max(0, dogru - (goturme > 0 ? yanlis / goturme : 0));
    const soruPuan = Number(ayar.soruPuan) > 0 ? Number(ayar.soruPuan) : 100 / soruSayisi;
    const puan = Math.min(100, Math.round(net * soruPuan * 10) / 10);
    const guvenler = sorular.map((s) => s.guven);
    const ortalamaGuven = guvenler.length ? Number((guvenler.reduce((a, b) => a + b, 0) / guvenler.length).toFixed(2)) : 0;
    const bulunanSoru = Math.min(soruSayisi, siraliGruplar.length);
    if (siraliGruplar.length !== soruSayisi) {
      incelemeKuyrugu.push({ alan: 'Soru sayısı', detay: `Formda ${siraliGruplar.length} soru satırı bulundu, ayarda ${soruSayisi} soru var` });
    }

    return {
      formBulundu: true,
      formTipi: 'standart',
      id: 'OMR-STD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      zamanDamgasi: new Date().toISOString(),
      soruSayisi,
      sikSayisi,
      bulunanSoruSatiri: siraliGruplar.length,
      balonSayisi: balonlar.length,
      balonBoyut: { bw: medBw, bh: medBh },
      bulunanSoru: bulunanSoru,
      sutunSayisi: sutunOrt.length,
      egimDerece: Number(((en.a * 180) / Math.PI).toFixed(2)),
      doluEsigi: Number(esik.toFixed(2)),
      dogru,
      yanlis,
      bos,
      net: Number(net.toFixed(2)),
      toplamPuan: puan,
      ortalamaGuven,
      supheliMi: incelemeKuyrugu.length > 0 || ortalamaGuven < 0.85,
      incelemeKuyrugu,
      sorular,
      testDetay: sorular.map((s) => ({ soruNo: s.soruNo, verilen: s.verilen, dogruCevap: s.dogruCevap, sonuc: s.sonuc, guven: s.guven, supheli: !!s.supheli }))
    };
  }

  /* Sentetik Gerçekçi Sınav Kağıdı Görüntüsü Üretici (Gölge ve Silinti Simülasyonu)
     Basılan formla AYNI yerleşimi (uretOptikYerlesim) kullanır; yükseklik dinamiktir. */
  function cizSentetikOptikFormCanvas(canvas, sinavYapisi, ogrenciSimulasyon) {
    const harita = hesaplaKanonikBalonHaritasi(sinavYapisi);
    const GEN = harita.genislik;
    const YUK = harita.yukseklik;
    canvas.width = GEN;
    canvas.height = YUK;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#fdfcf9';
    ctx.fillRect(0, 0, GEN, YUK);

    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(7, 7, GEN - 14, YUK - 14);

    const M = KANONIK_FIDUCIAL_MERKEZ;
    const fid = (cx, cy, ici) => {
      ctx.fillStyle = '#050505';
      ctx.fillRect(cx - 12, cy - 12, 24, 24);
      ctx.fillStyle = '#fdfcf9';
      ctx.fillRect(cx - 6, cy - 6, 12, 12);
      if (!ici) {
        ctx.fillStyle = '#050505';
        ctx.fillRect(cx - 3, cy - 3, 6, 6);
      }
    };
    fid(M, M, true);
    fid(GEN - M, M, false);
    fid(M, YUK - M, false);
    fid(GEN - M, YUK - M, false);

    ctx.fillStyle = '#111';
    ctx.textBaseline = 'alphabetic';
    for (const e of harita.etiketler) {
      ctx.font = `${e.kalin ? 'bold ' : ''}${e.boyut || 9}px Arial, sans-serif`;
      ctx.textAlign = e.hiza === 'end' ? 'right' : 'left';
      ctx.fillText(e.metin, e.x, e.y);
    }

    const cizBalon = (x, y, r, metin, dolulukSeviyesi = 0) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (dolulukSeviyesi > 0) {
        const griDeger = Math.round(255 * (1 - dolulukSeviyesi));
        ctx.fillStyle = `rgb(${griDeger}, ${griDeger}, ${griDeger})`;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#444';
        ctx.font = `${(r * 1.05).toFixed(1)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(metin, x, y + 0.5);
        ctx.textBaseline = 'alphabetic';
      }
    };

    const seciliGrup = (ogrenciSimulasyon && ogrenciSimulasyon.grup) || 'A';
    for (const b of harita.grupBalonlari) {
      cizBalon(b.x, b.y, b.r, b.harf, b.harf === seciliGrup ? 0.88 : 0);
    }

    const ogrNoStr = String((ogrenciSimulasyon && ogrenciSimulasyon.ogrNoKod) || '42');
    for (let h = 0; h < harita.kimlikSatirlari.length; h++) {
      const hedefRakam = ogrNoStr[h] || '0';
      for (const b of harita.kimlikSatirlari[h].balonlar) {
        cizBalon(b.x, b.y, b.r, b.rakam, b.rakam === hedefRakam ? 0.86 : 0);
      }
    }

    const dyCevaplar = (ogrenciSimulasyon && ogrenciSimulasyon.dyCevaplar) || [];
    for (let i = 0; i < harita.dySatirlari.length; i++) {
      const sat = harita.dySatirlari[i];
      const isaret = dyCevaplar[i] || 'D';
      for (const b of sat.balonlar) {
        cizBalon(b.x, b.y, b.r, b.secenek, b.secenek === isaret ? 0.86 : 0);
      }
    }

    const testCevaplar = (ogrenciSimulasyon && ogrenciSimulasyon.testCevaplar) || [];
    const silintiSoruNo = (ogrenciSimulasyon && ogrenciSimulasyon.silintiSoruNo) || -1;
    for (let i = 0; i < harita.testSatirlari.length; i++) {
      const sat = harita.testSatirlari[i];
      const isaret = testCevaplar[i] || 'A';
      for (const b of sat.balonlar) {
        let doluluk = 0;
        if (b.secenek === isaret) {
          doluluk = 0.87;
        } else if (i + 1 === silintiSoruNo && b.secenek === 'B' && isaret !== 'B') {
          doluluk = 0.42;
        }
        cizBalon(b.x, b.y, b.r, b.secenek, doluluk);
      }
    }

    const klasikPuanlar = (ogrenciSimulasyon && ogrenciSimulasyon.klasikPuanlar) || [8, 10];
    for (let k = 0; k < harita.klasikSatirlari.length; k++) {
      const sat = harita.klasikSatirlari[k];
      const hedefPuanSayi = Math.max(0, Math.round(Number(klasikPuanlar[k] !== undefined ? klasikPuanlar[k] : 8)));
      if (sat.optikModu === 'onlar_birler' && sat.onlarBalonlar && sat.birlerBalonlar) {
        const onlarHedef = String(Math.floor(hedefPuanSayi / 10));
        const birlerHedef = String(hedefPuanSayi % 10);
        for (const b of sat.onlarBalonlar) cizBalon(b.x, b.y, b.r, b.secenek, b.secenek === onlarHedef ? 0.88 : 0);
        for (const b of sat.birlerBalonlar) cizBalon(b.x, b.y, b.r, b.secenek, b.secenek === birlerHedef ? 0.88 : 0);
      } else {
        const puan = String(hedefPuanSayi);
        for (const b of sat.balonlar) cizBalon(b.x, b.y, b.r, b.secenek, b.secenek === puan ? 0.88 : 0);
      }
    }

    if (ogrenciSimulasyon && ogrenciSimulasyon.golgeEkle !== false) {
      const grad = ctx.createLinearGradient(0, 0, GEN, YUK);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.04)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, GEN, YUK);
    }

    return {
      koseler: {
        tl: { x: M, y: M, bulundu: true },
        tr: { x: GEN - M, y: M, bulundu: true },
        bl: { x: M, y: YUK - M, bulundu: true },
        br: { x: GEN - M, y: YUK - M, bulundu: true }
      }
    };
  }

  /* ------------------------------------------------------------------------
     7. AKADEMİK MADDE ANALİZİ (pj Güçlük, rjx Ayırt Edicilik, Çeldirici) MOTORU
     A/B/C/D kitapçıklarında karıştırılmış soruları ve şıkları A grubunun kanonik
     soru numarasına (orijinalNo / id) ve kanonik şık harfine geri eşleyerek analiz eder.
     ------------------------------------------------------------------------ */
  function bulOgrenciKanonikCevap(ogrenciSonuc, tur, aIdx, sinavYapisi) {
    const detayAlan = tur === 'dy' ? 'dyDetay' : (tur === 'test' ? 'testDetay' : 'klasikDetay');
    const detayDizi = (ogrenciSonuc && Array.isArray(ogrenciSonuc[detayAlan])) ? ogrenciSonuc[detayAlan] : [];
    const grup = String((ogrenciSonuc && ogrenciSonuc.grup) || 'A').toUpperCase();
    const kitapciklar = (sinavYapisi && sinavYapisi.kitapciklar) || {};
    const grupA = kitapciklar.A || {};
    const aSorular = Array.isArray(grupA[tur]) ? grupA[tur] : [];
    const aSoru = aSorular[aIdx] || null;
    const gKitapcik = kitapciklar[grup] || null;
    const gSorular = (gKitapcik && Array.isArray(gKitapcik[tur])) ? gKitapcik[tur] : null;

    let gIdx = aIdx;
    let gSoru = aSoru;
    if (grup !== 'A' && gSorular && gSorular.length > 0) {
      const bulunanIdx = gSorular.findIndex((q) => {
        if (!q) return false;
        if (aSoru && aSoru.id && q.id && String(q.id) === String(aSoru.id)) return true;
        if (q.orijinalNo !== undefined && Number(q.orijinalNo) === aIdx + 1) return true;
        return false;
      });
      if (bulunanIdx >= 0) {
        gIdx = bulunanIdx;
        gSoru = gSorular[bulunanIdx];
      }
    }

    const detay = detayDizi[gIdx] || null;
    let kanonikVerilen = detay ? detay.verilen : '';
    if (tur === 'test' && detay && detay.verilen && grup !== 'A' && gSoru) {
      const harfler = ['A', 'B', 'C', 'D', 'E'];
      const vHarf = String(detay.verilen).toUpperCase();
      if (Array.isArray(gSoru.siklar) && aSoru && Array.isArray(aSoru.siklar)) {
        const gSecenekMetin = gSoru.siklar[harfler.indexOf(vHarf)];
        if (gSecenekMetin !== undefined) {
          const aSecenekIdx = aSoru.siklar.findIndex((m) => String(m).trim() === String(gSecenekMetin).trim());
          if (aSecenekIdx >= 0) kanonikVerilen = harfler[aSecenekIdx] || vHarf;
        }
      } else if (gSoru.secenekHaritasi && gSoru.secenekHaritasi[vHarf]) {
        kanonikVerilen = gSoru.secenekHaritasi[vHarf];
      } else if (gSoru.dogruHarf && aSoru && aSoru.dogruHarf && vHarf === String(gSoru.dogruHarf).toUpperCase()) {
        kanonikVerilen = String(aSoru.dogruHarf).toUpperCase();
      }
    }

    const iptalListesi = Array.isArray(sinavYapisi && sinavYapisi.iptalEdilenSorular) ? sinavYapisi.iptalEdilenSorular : [];
    const kanonikSoruKodu = `${tur.toUpperCase()}-${aIdx + 1}`;
    const iptalMi = iptalListesi.includes(kanonikSoruKodu);

    // Eğer detay.sonuc yoksa (ham verilen şık varsa) grup cevap anahtarına göre doğruluğu belirle
    let dogruMu = iptalMi || Boolean(detay && (detay.sonuc === 'DOGRU' || detay.iptalMi));
    if (!iptalMi && detay && !detay.sonuc && detay.verilen) {
      const gAnahtar = sinavYapisi && sinavYapisi.cevapAnahtarlari && sinavYapisi.cevapAnahtarlari[grup];
      const beklenen = (gAnahtar && Array.isArray(gAnahtar[tur]) && gAnahtar[tur][gIdx])
        || (gSoru && (tur === 'dy' ? gSoru.dogruDY : gSoru.dogruHarf));
      if (beklenen) {
        dogruMu = String(detay.verilen).toUpperCase() === String(beklenen).toUpperCase();
      }
    }

    return {
      detay,
      dogruMu,
      iptalMi,
      kanonikVerilen,
      gIdx,
      aSoru,
      gSoru
    };
  }

  function hesaplaSinifVeMaddeAnalizi(okumaSonuclari, sinavYapisi) {
    const n = okumaSonuclari.length;
    if (n === 0) {
      return {
        ogrenciSayisi: 0,
        ortalama: 0,
        standartSapma: 0,
        medyan: 0,
        enYuksek: 0,
        enDusuk: 0,
        kr20: 0,
        cronbachAlpha: 0,
        standartHata: 0,
        guvenirlikYorum: 'Veri Yok',
        maddeler: []
      };
    }

    const siraliSonuclar = okumaSonuclari.slice().sort((a, b) => b.toplamPuan - a.toplamPuan);
    const puanlar = siraliSonuclar.map((s) => s.toplamPuan);
    const toplam = puanlar.reduce((a, b) => a + b, 0);
    const ortalama = Number((toplam / n).toFixed(2));
    const varyans = puanlar.reduce((ak, p) => ak + Math.pow(p - ortalama, 2), 0) / n;
    const standartSapma = Number(Math.sqrt(varyans).toFixed(2));
    const medyan = n % 2 === 1
      ? puanlar[Math.floor(n / 2)]
      : Number(((puanlar[n / 2 - 1] + puanlar[n / 2]) / 2).toFixed(2));

    // Üst %27 ve Alt %27 gruplar
    const grupBoyutu = Math.max(1, Math.round(n * 0.27));
    const ustGrup = siraliSonuclar.slice(0, grupBoyutu);
    const altGrup = siraliSonuclar.slice(Math.max(0, n - grupBoyutu));

    const maddeler = [];
    const anahtarA = (sinavYapisi.cevapAnahtarlari && sinavYapisi.cevapAnahtarlari.A) || { dy: [], test: [] };

    // Doğru/Yanlış Maddeleri Analizi (Kanonik A Grubu Sırasına Göre)
    const dySayisi = Number(sinavYapisi.dySayisi || 0);
    for (let i = 0; i < dySayisi; i++) {
      let dogruSay = 0;
      let ustDogru = 0;
      let altDogru = 0;
      const dagilim = { D: 0, Y: 0, BOS: 0 };

      for (const s of siraliSonuclar) {
        const es = bulOgrenciKanonikCevap(s, 'dy', i, sinavYapisi);
        if (!es.detay) continue;
        if (es.dogruMu) dogruSay++;
        if (es.kanonikVerilen === 'D') dagilim.D++;
        else if (es.kanonikVerilen === 'Y') dagilim.Y++;
        else dagilim.BOS++;
      }
      for (const s of ustGrup) {
        if (bulOgrenciKanonikCevap(s, 'dy', i, sinavYapisi).dogruMu) ustDogru++;
      }
      for (const s of altGrup) {
        if (bulOgrenciKanonikCevap(s, 'dy', i, sinavYapisi).dogruMu) altDogru++;
      }

      const pj = Number((dogruSay / n).toFixed(2));
      const rjx = Number(((ustDogru - altDogru) / grupBoyutu).toFixed(2));
      maddeler.push({
        kod: `DY-${i + 1}`,
        tur: 'Doğru/Yanlış',
        dogruCevap: anahtarA.dy[i] || 'D',
        pj,
        rjx,
        zorlukYorum: pj >= 0.70 ? 'Kolay' : (pj >= 0.30 ? 'İdeal (Orta)' : 'Zor'),
        ayirtYorum: rjx >= 0.40 ? 'Çok İyi Ayırt Edici' : (rjx >= 0.20 ? 'Kabul Edilebilir' : (rjx < 0 ? '⚠️ Negatif (Hatalı/Tuzak Soru!)' : '⚠️ Zayıf Ayırt Edici')),
        sorunluMu: rjx < 0.15,
        dagilim
      });
    }

    // Çoktan Seçmeli Test Maddeleri Analizi (Kanonik A Grubu Sırasına Göre)
    const testSayisi = Number(sinavYapisi.testSayisi || 0);
    for (let i = 0; i < testSayisi; i++) {
      let dogruSay = 0;
      let ustDogru = 0;
      let altDogru = 0;
      const dagilim = { A: 0, B: 0, C: 0, D: 0, E: 0, BOS: 0 };

      for (const s of siraliSonuclar) {
        const es = bulOgrenciKanonikCevap(s, 'test', i, sinavYapisi);
        if (!es.detay) continue;
        if (es.dogruMu) dogruSay++;
        if (es.kanonikVerilen && dagilim[es.kanonikVerilen] !== undefined) dagilim[es.kanonikVerilen]++;
        else dagilim.BOS++;
      }
      for (const s of ustGrup) {
        if (bulOgrenciKanonikCevap(s, 'test', i, sinavYapisi).dogruMu) ustDogru++;
      }
      for (const s of altGrup) {
        if (bulOgrenciKanonikCevap(s, 'test', i, sinavYapisi).dogruMu) altDogru++;
      }

      const pj = Number((dogruSay / n).toFixed(2));
      const rjx = Number(((ustDogru - altDogru) / grupBoyutu).toFixed(2));
      const aSoru = sinavYapisi.kitapciklar && sinavYapisi.kitapciklar.A && sinavYapisi.kitapciklar.A.test && sinavYapisi.kitapciklar.A.test[i];
      maddeler.push({
        kod: `TEST-${i + 1}`,
        tur: 'Çoktan Seçmeli',
        dogruCevap: anahtarA.test[i] || (aSoru && aSoru.dogruHarf) || 'A',
        pj,
        rjx,
        zorlukYorum: pj >= 0.70 ? 'Kolay' : (pj >= 0.30 ? 'İdeal (Orta)' : 'Zor'),
        ayirtYorum: rjx >= 0.40 ? 'Çok İyi Ayırt Edici' : (rjx >= 0.20 ? 'Kabul Edilebilir' : (rjx < 0 ? '⚠️ Negatif (Anahtar/Soru Kontrol Edilmeli!)' : '⚠️ Zayıf Ayırt Edici')),
        sorunluMu: rjx < 0.15,
        dagilim
      });
    }

    // KR-20 ve Cronbach's Alpha (α) İç Tutarlılık Güvenirlik Katsayısı + Standart Hata (SE) Hesabı
    const kMaddeSayisi = maddeler.length;
    let kr20 = 0;
    if (kMaddeSayisi > 1 && n > 1) {
      const dogruSayilari = siraliSonuclar.map((s) => {
        let topDogru = Number(s.dyDogru || 0) + Number(s.testDogru || 0);
        if (topDogru === 0 && ((s.dyDetay && s.dyDetay.length) || (s.testDetay && s.testDetay.length))) {
          for (let i = 0; i < dySayisi; i++) if (bulOgrenciKanonikCevap(s, 'dy', i, sinavYapisi).dogruMu) topDogru++;
          for (let i = 0; i < testSayisi; i++) if (bulOgrenciKanonikCevap(s, 'test', i, sinavYapisi).dogruMu) topDogru++;
        }
        return topDogru;
      });
      const ortDogru = dogruSayilari.reduce((a, b) => a + b, 0) / n;
      const varDogru = dogruSayilari.reduce((ak, d) => ak + Math.pow(d - ortDogru, 2), 0) / n;
      const toplamPq = maddeler.reduce((ak, m) => ak + m.pj * (1 - m.pj), 0);
      if (varDogru > 0.0001) {
        const hamKr20 = (kMaddeSayisi / (kMaddeSayisi - 1)) * (1 - toplamPq / varDogru);
        kr20 = Number(Math.max(0, Math.min(1, hamKr20)).toFixed(2));
      }
    }
    const cronbachAlpha = kr20;
    const standartHata = Number((standartSapma * Math.sqrt(Math.max(0.01, 1 - (kr20 || 0.75)))).toFixed(2));
    const guvenirlikYorum = kr20 >= 0.80
      ? 'Yüksek Güvenirlik (Mükemmel)'
      : (kr20 >= 0.70 ? 'İyi / Güvenilir Sınav' : (kr20 >= 0.50 ? 'Orta Güvenirlik' : 'Düşük / Homojen Grup'));

    return {
      ogrenciSayisi: n,
      ortalama,
      standartSapma,
      medyan,
      enYuksek: puanlar[0],
      enDusuk: puanlar[puanlar.length - 1],
      kr20,
      cronbachAlpha,
      standartHata,
      guvenirlikYorum,
      maddeler
    };
  }

  /* ------------------------------------------------------------------------
     7B. İSTATİSTİKSEL KOPYA / ORTAK YANLIŞ ŞIK BENZERLİK DEDEKTÖRÜ (HARPP-HOGAN)
     Aynı kitapçık grubundaki öğrenci çiftlerinin ortak yanlış cevaplarını (W_AB)
     analiz ederek tesadüf ötesi benzerlikleri raporlar.
     ------------------------------------------------------------------------ */
  function tespitEtKopyaBenzerlikCiftleri(okumaSonuclari = []) {
    const ciftler = [];
    if (!Array.isArray(okumaSonuclari) || okumaSonuclari.length < 2) return ciftler;

    for (let i = 0; i < okumaSonuclari.length; i++) {
      for (let j = i + 1; j < okumaSonuclari.length; j++) {
        const a = okumaSonuclari[i];
        const b = okumaSonuclari[j];
        if (!a || !b || a.grup !== b.grup) continue;

        let ortakYanlisSayisi = 0;
        let ortakDogruSayisi = 0;
        let farkliCevapSayisi = 0;
        const ortakYanlisMaddeler = [];

        const aTest = a.testDetay || [];
        const bTest = b.testDetay || [];
        const uzunluk = Math.min(aTest.length, bTest.length);

        for (let q = 0; q < uzunluk; q++) {
          const qa = aTest[q];
          const qb = bTest[q];
          if (!qa || !qb || !qa.verilen || !qb.verilen) continue;
          if (qa.verilen === qb.verilen) {
            if (qa.sonuc === 'YANLIS') {
              ortakYanlisSayisi++;
              ortakYanlisMaddeler.push(`T${q + 1}(${qa.verilen})`);
            } else if (qa.sonuc === 'DOGRU') {
              ortakDogruSayisi++;
            }
          } else {
            farkliCevapSayisi++;
          }
        }

        const aDy = a.dyDetay || [];
        const bDy = b.dyDetay || [];
        const dyUzunluk = Math.min(aDy.length, bDy.length);
        for (let q = 0; q < dyUzunluk; q++) {
          const qa = aDy[q];
          const qb = bDy[q];
          if (!qa || !qb || !qa.verilen || !qb.verilen) continue;
          if (qa.verilen === qb.verilen) {
            if (qa.sonuc === 'YANLIS') {
              ortakYanlisSayisi++;
              ortakYanlisMaddeler.push(`DY${q + 1}(${qa.verilen})`);
            } else if (qa.sonuc === 'DOGRU') {
              ortakDogruSayisi++;
            }
          } else {
            farkliCevapSayisi++;
          }
        }

        const toplamKarsilastirilan = ortakYanlisSayisi + ortakDogruSayisi + farkliCevapSayisi;
        if (toplamKarsilastirilan === 0) continue;

        const benzerlikYuzde = Math.round(((ortakYanlisSayisi + ortakDogruSayisi) / toplamKarsilastirilan) * 100);
        const harppHoganIndeks = Number((ortakYanlisSayisi / Math.max(1, farkliCevapSayisi)).toFixed(2));

        if (ortakYanlisSayisi >= 2 && (harppHoganIndeks >= 0.60 || benzerlikYuzde >= 75)) {
          ciftler.push({
            ogrenci1No: a.ogrNo,
            ogrenci1Ad: a.adSoyad,
            ogrenci2No: b.ogrNo,
            ogrenci2Ad: b.adSoyad,
            grup: a.grup,
            ortakYanlisSayisi,
            ortakDogruSayisi,
            farkliCevapSayisi,
            benzerlikYuzde,
            harppHoganIndeks,
            ortakYanlisMaddeler,
            riskSeviyesi: (ortakYanlisSayisi >= 4 || harppHoganIndeks >= 1.2) ? 'YUKSEK' : 'ORTA'
          });
        }
      }
    }

    return ciftler.sort((x, y) => y.ortakYanlisSayisi - x.ortakYanlisSayisi || y.benzerlikYuzde - x.benzerlikYuzde);
  }

  /* ------------------------------------------------------------------------
     7C. KONU / KAZANIM (ÖÇ) BAŞARI ANALİZİ VE BİREYSEL ÖĞRENCİ SONUÇ KARNESİ
     A/B/C/D kitapçıklarında kanonik soru eşlemesi (orijinalNo / id), soru puanı
     ağırlıklı (100 * Σ kazanılan puan / Σ azami puan) hesaplama, Klasik soruların
     dahil edilmesi, Ölçülmeyen ÖÇ ayrımı ve Öğrenci × ÖÇ Akreditasyon Matrisi içerir.
     ------------------------------------------------------------------------ */
  function hesaplaKazanimVeKarneAnalizi(okumaSonuclari = [], sinavYapisi = {}) {
    const varsayilanKazanimlar = [
      'ÖÇ-1: Ağ Katmanları ve Protokoller',
      'ÖÇ-2: Kriptografi ve Parola Güvenliği',
      'ÖÇ-3: Web ve Bulut Güvenliği (OWASP)',
      'ÖÇ-4: Sıfır Güven (Zero-Trust) Mimari Tasarımı'
    ];
    const grupA = (sinavYapisi.kitapciklar && sinavYapisi.kitapciklar.A) || { dy: [], test: [], klasik: [] };
    const dyBirimPuan = Math.max(0.5, Number(sinavYapisi.dySoruPuan || 2));
    const testBirimPuan = Math.max(0.5, Number(sinavYapisi.testSoruPuan || 5));
    const klasikVarsayilanPuan = Math.max(1, Number(sinavYapisi.klasikSoruPuan || 10));
    const klasikSoruPuanlari = Array.isArray(sinavYapisi.klasikSoruPuanlari) ? sinavYapisi.klasikSoruPuanlari : [];
    const barajEsigi = Math.max(1, Math.min(100, Number(sinavYapisi.akreditasyonBaraji || 60)));

    const kazanimHaritasi = {};
    const kayitAc = (kod) => {
      let anahtar = kod || varsayilanKazanimlar[0];
      const ocEslesme = String(anahtar).match(/^(ÖÇ-\d+|OC-\d+)/i);
      if (ocEslesme) {
        const ocOnEk = ocEslesme[1].toUpperCase().replace(/^OC-/, 'ÖÇ-');
        const mevcutAnahtar = Object.keys(kazanimHaritasi).find((m) => m === ocOnEk || m.startsWith(ocOnEk + ':'));
        if (mevcutAnahtar) anahtar = mevcutAnahtar;
      }
      if (!kazanimHaritasi[anahtar]) {
        const ocKodu = (String(anahtar).match(/^(ÖÇ-\d+|OC-\d+)/i) || [anahtar])[0].toUpperCase().replace(/^OC-/, 'ÖÇ-');
        kazanimHaritasi[anahtar] = {
          kod: anahtar,
          ocKodu,
          soruSayisi: 0,
          azamiSoruPuan: 0,
          toplamGirisimPuan: 0,
          kazanilanToplamPuan: 0,
          ogrenciYuzdeleri: []
        };
      }
      return kazanimHaritasi[anahtar];
    };

    // Ders için tanımlı tüm ÖÇ'leri (ölçülmeyenler dahil) kaydet
    if (Array.isArray(sinavYapisi.dersOgrenimCiktilari)) {
      sinavYapisi.dersOgrenimCiktilari.forEach((doc) => {
        const etiket = doc && doc.kod
          ? (doc.aciklama ? `${doc.kod}: ${doc.aciklama}` : doc.kod)
          : String(doc || '');
        if (etiket) kayitAc(etiket);
      });
    }

    const dySoruListesi = grupA.dy || [];
    const testSoruListesi = grupA.test || [];
    const klasikSoruListesi = grupA.klasik || [];

    dySoruListesi.forEach((s, idx) => {
      const k = s.kazanim || s.ocKodu || varsayilanKazanimlar[idx % varsayilanKazanimlar.length];
      const kh = kayitAc(k);
      kh.soruSayisi++;
      kh.azamiSoruPuan += dyBirimPuan;
    });
    testSoruListesi.forEach((s, idx) => {
      const k = s.kazanim || s.ocKodu || varsayilanKazanimlar[(idx + 1) % varsayilanKazanimlar.length];
      const kh = kayitAc(k);
      kh.soruSayisi++;
      kh.azamiSoruPuan += testBirimPuan;
    });
    klasikSoruListesi.forEach((s, idx) => {
      const k = s.kazanim || s.ocKodu || varsayilanKazanimlar[3];
      const tamP = klasikSoruPuanlari[idx] !== undefined ? Number(klasikSoruPuanlari[idx]) : Number(s.puan || klasikVarsayilanPuan);
      const kh = kayitAc(k);
      kh.soruSayisi++;
      kh.azamiSoruPuan += tamP;
    });

    const sirali = okumaSonuclari.slice().sort((a, b) => b.toplamPuan - a.toplamPuan);
    const n = sirali.length;
    const sinifOrtalama = n > 0 ? Number((sirali.reduce((a, b) => a + b.toplamPuan, 0) / n).toFixed(1)) : 0;

    const ogrenciKarneleri = sirali.map((ogr, siraIdx) => {
      const ogrKazanim = {};
      const ogrEkle = (kod, kazanilanPuan, azamiPuan) => {
        const kh = kayitAc(kod || varsayilanKazanimlar[0]);
        const k = kh.kod;
        kh.toplamGirisimPuan += azamiPuan;
        kh.kazanilanToplamPuan += kazanilanPuan;
        if (!ogrKazanim[k]) ogrKazanim[k] = { kazanilanPuan: 0, azamiPuan: 0, dogru: 0, toplam: 0 };
        ogrKazanim[k].kazanilanPuan += kazanilanPuan;
        ogrKazanim[k].azamiPuan += azamiPuan;
        ogrKazanim[k].toplam += 1;
        if (kazanilanPuan >= azamiPuan * 0.5) ogrKazanim[k].dogru += 1;
      };

      const dyAdet = Math.max(dySoruListesi.length, (ogr.dyDetay || []).length);
      for (let i = 0; i < dyAdet; i++) {
        const es = bulOgrenciKanonikCevap(ogr, 'dy', i, sinavYapisi);
        if (!es.detay) continue;
        const soru = dySoruListesi[i] || {};
        const k = soru.kazanim || soru.ocKodu || varsayilanKazanimlar[i % varsayilanKazanimlar.length];
        ogrEkle(k, es.dogruMu ? dyBirimPuan : 0, dyBirimPuan);
      }

      const testAdet = Math.max(testSoruListesi.length, (ogr.testDetay || []).length);
      for (let i = 0; i < testAdet; i++) {
        const es = bulOgrenciKanonikCevap(ogr, 'test', i, sinavYapisi);
        if (!es.detay) continue;
        const soru = testSoruListesi[i] || {};
        const k = soru.kazanim || soru.ocKodu || varsayilanKazanimlar[(i + 1) % varsayilanKazanimlar.length];
        ogrEkle(k, es.dogruMu ? testBirimPuan : 0, testBirimPuan);
      }

      const klasikAdet = klasikSoruListesi.length;
      if (klasikAdet > 0) {
        const toplamAzamiKlasik = klasikSoruListesi.reduce(
          (ak, s, idx) => ak + (klasikSoruPuanlari[idx] !== undefined ? Number(klasikSoruPuanlari[idx]) : Number(s.puan || klasikVarsayilanPuan)),
          0
        );
        for (let i = 0; i < klasikAdet; i++) {
          const soru = klasikSoruListesi[i] || {};
          const k = soru.kazanim || soru.ocKodu || varsayilanKazanimlar[3];
          const tamP = klasikSoruPuanlari[i] !== undefined ? Number(klasikSoruPuanlari[i]) : Number(soru.puan || klasikVarsayilanPuan);
          const es = bulOgrenciKanonikCevap(ogr, 'klasik', i, sinavYapisi);
          let alinanP = null;
          if (es.detay && es.detay.verilenPuan !== undefined) {
            alinanP = Math.max(0, Math.min(tamP, Number(es.detay.verilenPuan) || 0));
          } else if (ogr.klasikToplamPuan !== undefined && toplamAzamiKlasik > 0) {
            alinanP = Math.max(0, Math.min(tamP, (Number(ogr.klasikToplamPuan) || 0) * (tamP / toplamAzamiKlasik)));
          }
          if (alinanP !== null) {
            ogrEkle(k, alinanP, tamP);
          }
        }
      }

      const yuzdelikDilim = n > 1 ? Math.max(1, Math.round(((n - siraIdx) / n) * 100)) : 100;
      const kazanimOzet = Object.keys(ogrKazanim).map((k) => {
        const yuzde = Math.round((ogrKazanim[k].kazanilanPuan / Math.max(0.001, ogrKazanim[k].azamiPuan)) * 100);
        if (kazanimHaritasi[k]) kazanimHaritasi[k].ogrenciYuzdeleri.push(yuzde);
        return {
          kod: k,
          yuzde,
          kazanilanPuan: Number(ogrKazanim[k].kazanilanPuan.toFixed(2)),
          azamiPuan: Number(ogrKazanim[k].azamiPuan.toFixed(2))
        };
      });

      return {
        sira: siraIdx + 1,
        toplamOgrenci: n,
        yuzdelikDilim,
        ogrNo: ogr.ogrNo,
        adSoyad: ogr.adSoyad,
        grup: ogr.grup,
        toplamPuan: ogr.toplamPuan,
        harfNotu: hesaplaHarfNotu(ogr.toplamPuan),
        sinifOrtalama,
        dyNet: ogr.dyNet,
        testNet: ogr.testNet,
        klasikToplamPuan: ogr.klasikToplamPuan,
        dyDetay: ogr.dyDetay || [],
        testDetay: ogr.testDetay || [],
        klasikDetay: ogr.klasikDetay || [],
        kazanimOzet
      };
    });

    const kazanimTablosu = Object.values(kazanimHaritasi).map((k) => {
      const olculduMu = k.soruSayisi > 0 && k.toplamGirisimPuan > 0;
      const basariYuzde = olculduMu ? Math.round((k.kazanilanToplamPuan / k.toplamGirisimPuan) * 100) : 0;
      const saglayanOgrenciSayisi = k.ogrenciYuzdeleri.filter((y) => y >= barajEsigi).length;
      const saglamaOraniYuzde = k.ogrenciYuzdeleri.length > 0
        ? Math.round((saglayanOgrenciSayisi / k.ogrenciYuzdeleri.length) * 100)
        : 0;
      return {
        kod: k.kod,
        ocKodu: k.ocKodu || k.kod,
        soruSayisi: k.soruSayisi,
        azamiSoruPuan: Number(k.azamiSoruPuan.toFixed(2)),
        olculduMu,
        basariYuzde,
        barajEsigi,
        saglayanOgrenciSayisi,
        saglamaOraniYuzde,
        durum: !olculduMu
          ? (k.soruSayisi === 0 ? '⚪ Ölçülmedi (Bu Sınavda Soru Yok)' : '⚪ Veri Bekleniyor')
          : (basariYuzde >= 70 ? '🟢 Başarılı (Hedef Sağlandı)' : (basariYuzde >= 50 ? '🟡 Orta (Desteklenmeli)' : '🔴 Kritik (Telafi Önerilir)'))
      };
    });

    const olculenOcKodlari = kazanimTablosu.filter((k) => k.soruSayisi > 0).map((k) => k.kod);
    const ogrenciOcMatrisi = ogrenciKarneleri.map((karne) => {
      const ocYuzdeHarita = {};
      const ocHucreHarita = {};
      (kazanimTablosu || []).forEach((kt) => {
        const baslangicHucre = {
          olculduMu: false,
          yuzde: 0,
          kazanilanPuan: 0,
          azamiPuan: Number(kt.azamiSoruPuan || 0),
          barajiGectiMi: false
        };
        ocHucreHarita[kt.kod] = baslangicHucre;
        if (kt.ocKodu && !ocHucreHarita[kt.ocKodu]) {
          ocHucreHarita[kt.ocKodu] = baslangicHucre;
        }
      });
      (karne.kazanimOzet || []).forEach((ko) => {
        const kisaOc = (String(ko.kod || '').match(/^(ÖÇ-\d+|OC-\d+)/i) || [ko.kod])[0].toUpperCase().replace(/^OC-/, 'ÖÇ-');
        ocYuzdeHarita[ko.kod] = ko.yuzde;
        if (kisaOc && ocYuzdeHarita[kisaOc] === undefined) {
          ocYuzdeHarita[kisaOc] = ko.yuzde;
        }
        const hucre = {
          olculduMu: Number(ko.azamiPuan || 0) > 0,
          yuzde: ko.yuzde,
          kazanilanPuan: Number(ko.kazanilanPuan || 0),
          azamiPuan: Number(ko.azamiPuan || 0),
          barajiGectiMi: ko.yuzde >= barajEsigi
        };
        ocHucreHarita[ko.kod] = hucre;
        if (kisaOc) ocHucreHarita[kisaOc] = hucre;
      });
      return {
        ogrNo: karne.ogrNo,
        adSoyad: karne.adSoyad,
        grup: karne.grup,
        toplamPuan: karne.toplamPuan,
        harfNotu: karne.harfNotu,
        ocYuzdeleri: ocYuzdeHarita,
        ocHucreler: ocHucreHarita
      };
    });

    return {
      sinifOrtalama,
      barajEsigi,
      olculenOcKodlari,
      kazanimTablosu,
      ogrenciKarneleri,
      ogrenciOcMatrisi
    };
  }

  /* ------------------------------------------------------------------------
     7D. KALİTE BELGESİ PDF / GÖRSEL FORMU 3 KATMANLI KESİCİ (HEADER & FOOTER SLICER)
     Yüklenen .pdf veya görselin üst antetini (Sayfa 1 için) ve alt onay şeridini
     (Sayfa 2 için) keser, ortadaki eski soru yazılarını beyazlatır.
     ------------------------------------------------------------------------ */
  function cozPdfIcindenMetinVeGorsel(uint8Dizi) {
    if (!uint8Dizi || !uint8Dizi.length) return { dokumanNo: null, revizyon: null, gomuluJpegBlob: null };
    let latinMetin = '';
    const ornekBoy = Math.min(uint8Dizi.length, 262144);
    for (let i = 0; i < ornekBoy; i++) {
      const b = uint8Dizi[i];
      latinMetin += (b >= 32 && b <= 126) || b >= 160 || b === 10 || b === 13 ? String.fromCharCode(b) : ' ';
    }

    const dokEslesme = latinMetin.match(/(?:Dok(?:[uü]|\s+|Ã¼)?man|Form)\s*(?:No|Kodu)\s*[:\-]?\s*([A-Z0-9\-]{4,18})/i);
    const revEslesme = latinMetin.match(/(Rev\.?\s*\d+(?:\s*\/\s*\d{2}\.\d{2}\.\d{4})?)/i);

    // PDF içinde gömülü JPEG akışı (FF D8 FF ... FF D9) var mı kontrol et
    let gomuluJpegBlob = null;
    for (let i = 0; i < uint8Dizi.length - 4; i++) {
      if (uint8Dizi[i] === 0xFF && uint8Dizi[i + 1] === 0xD8 && uint8Dizi[i + 2] === 0xFF) {
        for (let j = i + 4; j < uint8Dizi.length - 1; j++) {
          if (uint8Dizi[j] === 0xFF && uint8Dizi[j + 1] === 0xD9) {
            const jpegKesit = uint8Dizi.slice(i, j + 2);
            if (jpegKesit.length > 512 && typeof Blob !== 'undefined') {
              gomuluJpegBlob = new Blob([jpegKesit], { type: 'image/jpeg' });
            }
            break;
          }
        }
        if (gomuluJpegBlob) break;
      }
    }

    return {
      dokumanNo: dokEslesme ? dokEslesme[1] : null,
      revizyon: revEslesme ? revEslesme[1] : null,
      gomuluJpegBlob
    };
  }

  /* ------------------------------------------------------------------------
     7E. KALİTE FORMU KÜNYE ÇIKARICI (.docx / .doc / .xls / .xlsx / metin)
     Üniversite kalite formlarındaki (FRM-046 Sınav Durum Tutanağı, FRM-059 Sınav
     Yoklama Evrakı gibi) Doküman No, İlk Yayın Tarihi, Revizyon bilgisini ve
     (.docx ise) üst bilgideki kurum logosunu çıkarır.
     ------------------------------------------------------------------------ */
  function excelSeriNoyuTarihYap(seri) {
    const n = Number(seri);
    if (!isFinite(n) || n < 20000 || n > 80000) return null;
    const d = new Date(Math.round((n - 25569) * 86400000));
    const g = String(d.getUTCDate()).padStart(2, '0');
    const a = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${g}.${a}.${d.getUTCFullYear()}`;
  }

  function cikarKaliteKunyesiMetinden(ham) {
    const metin = String(ham || '').replace(/\s+/g, ' ');
    const dok = metin.match(/Dok[uü]man\s*(?:No|Kodu)\.?\s*[:\-]?\s*([A-ZÇĞİÖŞÜ]{2,8}\s*-\s*\d{2,5}(?:\s*-\s*\d{1,3})?)/i)
      || metin.match(/\b((?:FRM|FR|FORM|BLM|MUH|KYS)\s*-\s*\d{2,5})\b/i);
    let yayin = metin.match(/[İI]lk\s*Yay[ıi]n\s*Tarihi\.?\s*[:\-]?\s*(\d{1,2}[.\/]\d{1,2}[.\/]\d{4}|\d{5})/i);
    let yayinStr = yayin ? yayin[1] : null;
    if (yayinStr && /^\d{5}$/.test(yayinStr)) yayinStr = excelSeriNoyuTarihYap(yayinStr);
    if (yayinStr) yayinStr = yayinStr.replace(/\//g, '.');
    const revT = metin.match(/Revizyon\s*Tarihi\.?\s*[:\-]?\s*(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/i);
    const revN = metin.match(/Revizyon\s*No\.?\s*[:\-]?\s*(\d{1,3})\b/i);
    const revKisa = metin.match(/(Rev\.?\s*\d+(?:\s*\/\s*\d{2}\.\d{2}\.\d{4})?)/i);
    const baslik = metin.match(/\b(S[İI]NAV\s+[A-ZÇĞİÖŞÜ ]{4,40}?(?:TUTANA[ĞG]I|EVRAKI|FORMU|TUTANAĞI|KAĞIDI|KA[ĞG]IDI))\b/);
    let revizyon = null;
    if (revKisa) revizyon = revKisa[1];
    else if (revN || revT) revizyon = `Rev.${revN ? String(revN[1]).padStart(2, '0') : '00'}${revT ? ` / ${revT[1]}` : ''}`;
    if (!revizyon && /Revizyon\s*(?:Tarihi|No)/i.test(metin)) revizyon = '-';
    return {
      dokumanNo: dok ? dok[1].replace(/\s+/g, '').toUpperCase() : null,
      ilkYayinTarihi: yayinStr || null,
      revizyon,
      formBasligi: baslik ? baslik[1] : null
    };
  }

  function baytlariBase64Yap(u8) {
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function zipGirdileriniOku(u8) {
    const gorunum = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (gorunum.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Geçerli bir ZIP/DOCX yapısı bulunamadı.');
    const adet = gorunum.getUint16(eocd + 10, true);
    let p = gorunum.getUint32(eocd + 16, true);
    const girdiler = [];
    for (let k = 0; k < adet && p + 46 <= u8.length; k++) {
      if (gorunum.getUint32(p, true) !== 0x02014b50) break;
      const yontem = gorunum.getUint16(p + 10, true);
      const sikBoy = gorunum.getUint32(p + 20, true);
      const boy = gorunum.getUint32(p + 24, true);
      const adUzun = gorunum.getUint16(p + 28, true);
      const ekUzun = gorunum.getUint16(p + 30, true);
      const yorumUzun = gorunum.getUint16(p + 32, true);
      const yerelOfset = gorunum.getUint32(p + 42, true);
      const ad = new TextDecoder('utf-8').decode(u8.subarray(p + 46, p + 46 + adUzun));
      girdiler.push({ ad, yontem, sikBoy, boy, yerelOfset });
      p += 46 + adUzun + ekUzun + yorumUzun;
    }
    return girdiler;
  }

  async function zipGirdisiniAc(u8, girdi, inflateRaw, azamiBayt = 8 * 1024 * 1024) {
    if (girdi.boy > azamiBayt) throw new Error(`ZIP girdisi çok büyük: ${girdi.ad}`);
    const gorunum = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const o = girdi.yerelOfset;
    if (gorunum.getUint32(o, true) !== 0x04034b50) throw new Error('Bozuk ZIP yerel başlığı.');
    const veriBas = o + 30 + gorunum.getUint16(o + 26, true) + gorunum.getUint16(o + 28, true);
    const sikis = u8.subarray(veriBas, veriBas + girdi.sikBoy);
    if (girdi.yontem === 0) return sikis;
    if (girdi.yontem !== 8) throw new Error('Desteklenmeyen ZIP sıkıştırma yöntemi.');
    return inflateRaw(sikis, azamiBayt);
  }

  function xmldenDuzMetin(xml) {
    return String(xml || '')
      .replace(/<w:tab\/>/g, ' ')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  }

  /* .docx kalite formundan künye + üst bilgi logosu çıkarır (inflateRaw: (u8, azamiBayt) => Promise<Uint8Array>) */
  async function cozDocxKaliteFormu(u8, inflateRaw) {
    const girdiler = zipGirdileriniOku(u8);
    const bul = (ad) => girdiler.find((g) => g.ad === ad);
    const metinOku = async (ad) => {
      const g = bul(ad);
      return g ? new TextDecoder('utf-8').decode(await zipGirdisiniAc(u8, g, inflateRaw)) : '';
    };
    const basliklar = girdiler.filter((g) => /^word\/header\d*\.xml$/.test(g.ad)).map((g) => g.ad);
    let tumMetin = '';
    let logo = null;
    for (const hAd of basliklar) {
      const xml = await metinOku(hAd);
      tumMetin += `${xmldenDuzMetin(xml)}\n`;
      if (!logo) {
        const emb = xml.match(/r:embed="([^"]+)"/);
        if (emb) {
          const rel = await metinOku(`word/_rels/${hAd.split('/').pop()}.rels`);
          const hedef = rel.match(new RegExp(`Id="${emb[1]}"[^>]*Target="([^"]+)"`)) || rel.match(new RegExp(`Target="([^"]+)"[^>]*Id="${emb[1]}"`));
          const resimGirdi = hedef && bul(`word/${hedef[1].replace(/^\.\//, '')}`);
          if (resimGirdi && /\.(png|jpe?g|gif)$/i.test(resimGirdi.ad)) {
            const bayt = await zipGirdisiniAc(u8, resimGirdi, inflateRaw);
            const mime = /png$/i.test(resimGirdi.ad) ? 'image/png' : (/gif$/i.test(resimGirdi.ad) ? 'image/gif' : 'image/jpeg');
            logo = `data:${mime};base64,${baytlariBase64Yap(bayt)}`;
          }
        }
      }
    }
    tumMetin += `${xmldenDuzMetin(await metinOku('word/document.xml'))}\n`;
    for (const g of girdiler.filter((x) => /^word\/footer\d*\.xml$/.test(x.ad))) {
      tumMetin += `${xmldenDuzMetin(await metinOku(g.ad))}\n`;
    }
    return { ...cikarKaliteKunyesiMetinden(tumMetin), logoDataUrl: logo, kaynak: 'docx' };
  }

  /* Eski ikili .doc dosyasından (OLE) metin tabanlı künye çıkarır; logo çıkarılamaz */
  function cozDocKaliteFormu(u8) {
    const u16 = [];
    for (let i = 0; i + 1 < Math.min(u8.length, 1048576); i += 2) {
      const c = u8[i] | (u8[i + 1] << 8);
      u16.push(c >= 32 && c < 65000 ? String.fromCharCode(c) : ' ');
    }
    let latin = '';
    for (let i = 0; i < Math.min(u8.length, 1048576); i++) {
      const b = u8[i];
      latin += (b >= 32 && b <= 126) || b >= 160 ? String.fromCharCode(b) : ' ';
    }
    const birlesik = `${u16.join('')}\n${latin}`;
    return { ...cikarKaliteKunyesiMetinden(birlesik), logoDataUrl: null, kaynak: 'doc' };
  }

  function kesKaliteFormuUstVeAltKatman(kaynakGorselVeyaCanvas, ustMm = 42, altMm = 18) {
    if (typeof document === 'undefined') return { ustAntetDataUrl: null, altBilgiDataUrl: null };
    const kaynakGen = kaynakGorselVeyaCanvas.naturalWidth || kaynakGorselVeyaCanvas.width || 1200;
    const kaynakYuk = kaynakGorselVeyaCanvas.naturalHeight || kaynakGorselVeyaCanvas.height || 1700;

    // A4 sayfası 297mm yüksekliğindedir; eğer yüklenen görsel zaten sadece üst antet şeridiyse (en/boy > 2.2) tamamını üst antet al
    const enBoyOrani = kaynakGen / Math.max(1, kaynakYuk);
    const ustOran = enBoyOrani > 2.2 ? 1.0 : Math.min(0.45, Math.max(0.08, ustMm / 297));
    const altOran = enBoyOrani > 2.2 ? 0 : Math.min(0.25, Math.max(0, altMm / 297));

    const ustPikselYuk = Math.max(20, Math.round(kaynakYuk * ustOran));
    const ustCanvas = document.createElement('canvas');
    ustCanvas.width = kaynakGen;
    ustCanvas.height = ustPikselYuk;
    const ustCtx = ustCanvas.getContext('2d');
    ustCtx.fillStyle = '#ffffff';
    ustCtx.fillRect(0, 0, kaynakGen, ustPikselYuk);
    ustCtx.drawImage(kaynakGorselVeyaCanvas, 0, 0, kaynakGen, ustPikselYuk, 0, 0, kaynakGen, ustPikselYuk);
    const ustAntetDataUrl = ustCanvas.toDataURL('image/png');

    let altBilgiDataUrl = null;
    if (altOran > 0.01) {
      const altPikselYuk = Math.max(16, Math.round(kaynakYuk * altOran));
      const altBaslangicY = Math.max(0, kaynakYuk - altPikselYuk);
      const altCanvas = document.createElement('canvas');
      altCanvas.width = kaynakGen;
      altCanvas.height = altPikselYuk;
      const altCtx = altCanvas.getContext('2d');
      altCtx.fillStyle = '#ffffff';
      altCtx.fillRect(0, 0, kaynakGen, altPikselYuk);
      altCtx.drawImage(kaynakGorselVeyaCanvas, 0, altBaslangicY, kaynakGen, altPikselYuk, 0, 0, kaynakGen, altPikselYuk);
      altBilgiDataUrl = altCanvas.toDataURL('image/png');
    }

    return {
      ustAntetDataUrl,
      altBilgiDataUrl
    };
  }

  /* ------------------------------------------------------------------------
     8. AKILLI WORD / METİN TOPLU SORU AYRIŞTIRICI (PARSER)
     Öğretmenin Word veya PDF'ten yapıştırdığı metni otomatik D/Y, Test ve Klasik
     sorularına dönüştürür.
     ------------------------------------------------------------------------ */
  function metindenSorulariAyikla(hamMetin, dersId = 'genel') {
    if (typeof hamMetin !== 'string' || !hamMetin.trim()) return [];
    const satirlar = hamMetin.replace(/\r\n/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
    const uretilenler = [];
    let aktifSoru = null;

    const kaydetAktif = () => {
      if (!aktifSoru) return;
      if (aktifSoru.siklar.length >= 2) {
        aktifSoru.tur = 'test';
      } else if (!aktifSoru.tur) {
        aktifSoru.tur = 'dy';
      }
      const ocBilesen = ayiklaOcBilesenleri(aktifSoru.ocKodu || aktifSoru.kazanim || 'ÖÇ-1', aktifSoru.kazanim || '');
      uretilenler.push({
        id: 'S-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '-' + uretilenler.length,
        dersId,
        tur: aktifSoru.tur,
        zorluk: aktifSoru.zorluk || 'Orta',
        ocKodu: ocBilesen.ocKodu,
        kazanim: ocBilesen.tamMetin,
        metin: aktifSoru.metin.replace(/^\d+[\.\)\-]\s*/, '').trim(),
        siklar: aktifSoru.siklar,
        dogruHarf: aktifSoru.dogruHarf || 'A',
        dogruDY: aktifSoru.dogruDY || 'D',
        rubrik: aktifSoru.rubrik || 'Kavramsal doğruluk (5p) + Örnek/Gerekçe (5p)'
      });
      aktifSoru = null;
    };

    for (const satir of satirlar) {
      // ÖÇ / Kazanım satırı mı? (Örn: "ÖÇ: ÖÇ-2: Kriptografi" veya "Kazanım: ÖÇ-3")
      const ocSatirEslesme = satir.match(/^(?:öç|oc|öğrenim\s*çıktısı|ogrenim\s*ciktisi|kazanım|kazanim)\s*[:=\-]\s*(.+)$/i);
      if (ocSatirEslesme && aktifSoru) {
        const ocBil = ayiklaOcBilesenleri(ocSatirEslesme[1].trim());
        aktifSoru.ocKodu = ocBil.ocKodu;
        aktifSoru.kazanim = ocBil.tamMetin;
        continue;
      }

      // Cevap satırı mı? (Örn: "Cevap: C" veya "Yanıt: D")
      const cevapEslesme = satir.match(/^(?:cevap|yanıt|doğru\s*cevap)\s*[:=\-]\s*([A-E]|D|Y|Doğru|Yanlış)/i);
      if (cevapEslesme && aktifSoru) {
        const c = cevapEslesme[1].toUpperCase();
        if (c === 'DOĞRU') aktifSoru.dogruDY = 'D';
        else if (c === 'YANLIŞ') aktifSoru.dogruDY = 'Y';
        else if (['D', 'Y'].includes(c) && aktifSoru.tur === 'dy') aktifSoru.dogruDY = c;
        else aktifSoru.dogruHarf = c[0];
        continue;
      }

      // Şık satırı mı? (Örn: "A) ..." veya "A. ...")
      const sikEslesme = satir.match(/^([A-E])[\)\.\-]\s*(.+)$/i);
      if (sikEslesme && aktifSoru && !/^A[\)\.]\s*.+\sB[\)\.]\s*.+\sC[\)\.]/i.test(satir)) {
        let sikMetni = sikEslesme[2].trim();
        if (sikMetni.endsWith('*') || /\(Doğru\)$/i.test(sikMetni)) {
          aktifSoru.dogruHarf = sikEslesme[1].toUpperCase();
          sikMetni = sikMetni.replace(/\*$/, '').replace(/\(Doğru\)$/i, '').trim();
        }
        aktifSoru.siklar.push(sikMetni);
        aktifSoru.tur = 'test';
        continue;
      }

      // Tek satırda yan yana şıklar var mı? (Örn: "A) 10 B) 20 C) 30 D) 40")
      if (aktifSoru && /\bA[\)\.]\s*.+\bB[\)\.]\s*.+\bC[\)\.]\s*/.test(satir)) {
        const parcalar = satir.split(/\s+(?=[A-E][\)\.])/);
        for (const p of parcalar) {
          const m = p.match(/^([A-E])[\)\.]\s*(.+)$/);
          if (m) {
            let yanMetin = m[2].trim();
            if (yanMetin.endsWith('*') || /\(Doğru\)$/i.test(yanMetin)) {
              aktifSoru.dogruHarf = m[1].toUpperCase();
              yanMetin = yanMetin.replace(/\*$/, '').replace(/\(Doğru\)$/i, '').trim();
            }
            aktifSoru.siklar.push(yanMetin);
          }
        }
        aktifSoru.tur = 'test';
        continue;
      }

      // Yeni soru başlangıcı
      kaydetAktif();
      let sMetin = satir.replace(/^\d+[\.\)\-]\s*/, '').trim();
      let tur = null;
      let dogruDY = 'D';
      let ocKodu = '';
      let kazanim = '';

      // Soru başında veya içinde [ÖÇ-2] veya (ÖÇ-3: Konu) etiketi var mı?
      const ocEtiketEslesme = sMetin.match(/[\[\(]\s*((?:ÖÇ|OC|ÖĞRENİM\s*ÇIKTISI)\s*[-_\s]?\d{1,2}(?:\s*[:\-]\s*[^\]\)]+)?)\s*[\]\)]/i);
      if (ocEtiketEslesme) {
        const ocBil = ayiklaOcBilesenleri(ocEtiketEslesme[1]);
        ocKodu = ocBil.ocKodu;
        kazanim = ocBil.tamMetin;
        sMetin = sMetin.replace(ocEtiketEslesme[0], '').trim();
      }

      if (/^\[?(?:D\/Y|DY|DOĞRU-YANLIŞ)\]?/i.test(sMetin)) {
        tur = 'dy';
        sMetin = sMetin.replace(/^\[?(?:D\/Y|DY|DOĞRU-YANLIŞ)\]?\s*/i, '');
      } else if (/^\[?(?:KLASİK|KLASIK|AÇIK\s*UÇLU)\]?/i.test(sMetin)) {
        tur = 'klasik';
        sMetin = sMetin.replace(/^\[?(?:KLASİK|KLASIK|AÇIK\s*UÇLU)\]?\s*/i, '');
      }

      // Tür etiketinden sonra gelen [ÖÇ-x] varsa onu da yakala
      const ocIkinciEslesme = sMetin.match(/^[\[\(]\s*((?:ÖÇ|OC)\s*[-_\s]?\d{1,2}(?:\s*[:\-]\s*[^\]\)]+)?)\s*[\]\)]\s*/i);
      if (ocIkinciEslesme) {
        const ocBil = ayiklaOcBilesenleri(ocIkinciEslesme[1]);
        ocKodu = ocBil.ocKodu;
        kazanim = ocBil.tamMetin;
        sMetin = sMetin.replace(ocIkinciEslesme[0], '').trim();
      }

      const sonParantezDY = sMetin.match(/\(([DY]|Doğru|Yanlış)\)\s*$/i);
      if (sonParantezDY) {
        tur = 'dy';
        const val = sonParantezDY[1].toUpperCase();
        dogruDY = val.startsWith('Y') ? 'Y' : 'D';
        sMetin = sMetin.replace(/\(([DY]|Doğru|Yanlış)\)\s*$/i, '').trim();
      }

      aktifSoru = {
        tur,
        ocKodu: ocKodu || `ÖÇ-${((uretilenler.length % 4) + 1)}`,
        kazanim: kazanim || ocKodu || `ÖÇ-${((uretilenler.length % 4) + 1)}`,
        metin: sMetin,
        siklar: [],
        dogruHarf: 'A',
        dogruDY
      };
    }

    kaydetAktif();
    return uretilenler;
  }

  /* ------------------------------------------------------------------------
     8B. BOŞ CSV ŞABLON ÜRETİCİLERİ VE OTOMATİK AYIRICI (;/,) TANIYAN CSV OKUYUCU
     1. Test + Doğru/Yanlış + Klasik Soru Bankası Boş CSV Şablonu & İthalatı (Ogrenim_Ciktisi_OC Sütunlu)
     2. Öğrenci Listesi Boş CSV Şablonu & İthalatı (Bilgisayar + Cep Telefonu)
     3. Cevap Anahtarı (A/B/C/D) Boş CSV Şablonu & İthalatı
     4. OBS / e-Okul Resmi Not Çizelgesi (GR / Girmedi ve Harf Notu Dahil)
     ------------------------------------------------------------------------ */
  function ayirCsvSatiri(satir, ayirici = ';') {
    const hucreler = [];
    let aktif = '';
    let tirnakIci = false;
    for (let i = 0; i < satir.length; i++) {
      const ch = satir[i];
      if (ch === '"') {
        if (tirnakIci && satir[i + 1] === '"') {
          aktif += '"';
          i++;
        } else {
          tirnakIci = !tirnakIci;
        }
      } else if (ch === ayirici && !tirnakIci) {
        hucreler.push(aktif.trim());
        aktif = '';
      } else {
        aktif += ch;
      }
    }
    hucreler.push(aktif.trim());
    return hucreler;
  }

  function tespitEtCsvAyirici(ilkSatir) {
    const noktaliSay = (ilkSatir.match(/;/g) || []).length;
    const virgulSay = (ilkSatir.match(/,/g) || []).length;
    return noktaliSay >= virgulSay ? ';' : ',';
  }

  function normalizeZorlukDerecesi(deger) {
    const d = String(deger || 'Orta').trim().toUpperCase();
    if (d === '1' || d.startsWith('KOLAY') || d === 'EASY' || d === 'TEMEL') return 'Kolay';
    if (d === '3' || d.startsWith('ZOR') || d === 'HARD' || d === 'İLERİ' || d === 'ILERI') return 'Zor';
    return 'Orta';
  }

  function normalizeHaftaNo(deger, varsayilan = 1) {
    if (deger === undefined || deger === null || String(deger).trim() === '') return varsayilan;
    const m = String(deger).match(/(\d{1,2})/);
    if (!m) return varsayilan;
    const n = parseInt(m[1], 10);
    if (Number.isNaN(n) || n < 1) return 1;
    if (n > 14) return 14;
    return n;
  }

  /* Bologna Öğrenim Çıktısı (ÖÇ) Kodunu Standartlaştırma (Örn: "OC2", "ÖÇ 3", "2", "ÖÇ-1: Ağ" -> "ÖÇ-2", "ÖÇ-3", "ÖÇ-1") */
  function normalizeOcKodu(deger, varsayilan = 'ÖÇ-1') {
    if (deger === undefined || deger === null) return varsayilan;
    const ham = String(deger).trim();
    if (!ham) return varsayilan;
    const acikOcEslesme = ham.match(/(?:ÖÇ|OC|ÖĞRENİM\s*ÇIKTISI|OGRENIM\s*CIKTISI|LO)\s*[-_\.\s]?\s*(\d{1,2})/i);
    if (acikOcEslesme) {
      const no = Math.max(1, Math.min(25, parseInt(acikOcEslesme[1], 10) || 1));
      return `ÖÇ-${no}`;
    }
    const sadeceSayi = ham.match(/^(\d{1,2})$/);
    if (sadeceSayi) {
      const no = Math.max(1, Math.min(25, parseInt(sadeceSayi[1], 10) || 1));
      return `ÖÇ-${no}`;
    }
    return varsayilan;
  }

  /* ÖÇ Kodu ve Konu/Kazanım Açıklamasını Birleştirip Ayrıştıran Yardımcı */
  function ayiklaOcBilesenleri(ocVeyaKazanim, ekKonuAciklama = '', varsayilanOc = 'ÖÇ-1') {
    const ham1 = String(ocVeyaKazanim || '').trim();
    const ham2 = String(ekKonuAciklama || '').trim();
    const ocKodu = normalizeOcKodu(ham1 || ham2, varsayilanOc);

    // ham1 içinden "ÖÇ-1:" önekini temizleyerek alt açıklamayı bul
    const temiz1 = ham1.replace(/^(?:ÖÇ|OC|LO)\s*[-_\.\s]?\s*\d{1,2}\s*[:\-–]?\s*/i, '').trim();
    const temiz2 = ham2.replace(/^(?:ÖÇ|OC|LO)\s*[-_\.\s]?\s*\d{1,2}\s*[:\-–]?\s*/i, '').trim();
    const aciklama = temiz2 || temiz1 || '';
    const tamMetin = aciklama ? `${ocKodu}: ${aciklama}` : ocKodu;

    return {
      ocKodu,
      aciklama,
      konuAciklama: aciklama,
      tamMetin,
      kazanimTam: tamMetin
    };
  }

  function ocKoduSiraNo(ocKodu) {
    const m = String(ocKodu || '').match(/(\d{1,2})/);
    return m ? parseInt(m[1], 10) : 99;
  }

  /* Dersin Bologna Öğrenim Çıktıları (ÖÇ) Maddelerini Ayrıştıran ve Normalize Eden Yardımcı
     - Dizi ([{ kod: 'ÖÇ-1', aciklama: '...' }, ...] veya ['...', '...']) ya da çok satırlı / noktalı virgüllü metin kabul eder.
     - 4 madde, 5 madde veya istenen sayıda maddeyi birbirinden ayırarak otomatik ÖÇ-1, ÖÇ-2... numaralandırır. */
  function ayiklaDersOcMaddeleri(hamGirdi) {
    if (!hamGirdi) return [];
    let hamParcalar = [];
    if (Array.isArray(hamGirdi)) {
      hamParcalar = hamGirdi;
    } else if (typeof hamGirdi === 'string') {
      // Satır sonu (\n) veya noktalı virgül (;) veya dikey çizgi (|) ile ayrılmış maddeleri böl
      hamParcalar = hamGirdi
        .split(/\r?\n|;|\|/g)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (typeof hamGirdi === 'object') {
      hamParcalar = Object.values(hamGirdi);
    }

    const sonuc = [];
    const gorulenKodlar = new Set();

    hamParcalar.forEach((parca, idx) => {
      let kod = '';
      let aciklama = '';
      if (parca && typeof parca === 'object') {
        const hamKod = String(parca.kod || parca.ocKodu || '').trim();
        const hamAciklama = String(parca.aciklama || parca.metin || parca.tanim || '').trim();
        if (!hamKod && !hamAciklama) return;
        kod = normalizeOcKodu(hamKod || hamAciklama, `ÖÇ-${idx + 1}`);
        aciklama = hamAciklama
          .replace(/^(?:ÖÇ|OC|LO|MADDE)\s*[-_\.\s]?\s*\d{1,2}\s*[:\-–\)\.]?\s*/i, '')
          .replace(/^\d{1,2}\s*[\.\)\-:]\s*/, '')
          .trim();
      } else {
        const satir = String(parca || '').trim();
        if (!satir) return;
        // Başında "ÖÇ-1:", "1.", "1)", "Madde 1 -" vb. varsa ayıkla
        const acikOc = satir.match(/^(?:ÖÇ|OC|LO|ÖĞRENİM\s*ÇIKTISI)\s*[-_\.\s]?\s*(\d{1,2})\s*[:\-–\)\.]?\s*(.*)$/i);
        const sayiBaslik = !acikOc ? satir.match(/^(\d{1,2})\s*[\.\)\-:]\s*(.+)$/) : null;
        if (acikOc) {
          const no = Math.max(1, Math.min(25, parseInt(acikOc[1], 10) || (idx + 1)));
          kod = `ÖÇ-${no}`;
          aciklama = String(acikOc[2] || '').trim();
        } else if (sayiBaslik) {
          const no = Math.max(1, Math.min(25, parseInt(sayiBaslik[1], 10) || (idx + 1)));
          kod = `ÖÇ-${no}`;
          aciklama = String(sayiBaslik[2] || '').trim();
        } else {
          kod = `ÖÇ-${sonuc.length + 1}`;
          aciklama = satir;
        }
      }

      if (!aciklama && !kod) return;
      if (gorulenKodlar.has(kod)) {
        kod = `ÖÇ-${sonuc.length + 1}`;
      }
      gorulenKodlar.add(kod);
      sonuc.push({
        kod,
        aciklama: aciklama || `${kod} Öğrenim Çıktısı`,
        tamMetin: aciklama ? `${kod}: ${aciklama}` : kod
      });
    });

    return sonuc.sort((a, b) => ocKoduSiraNo(a.kod) - ocKoduSiraNo(b.kod));
  }

  function formatlaDersOcMaddeleriMetin(ocListesi = []) {
    const temiz = ayiklaDersOcMaddeleri(ocListesi);
    return temiz.map((m) => `${m.kod}: ${m.aciklama}`).join('\n');
  }

  /* 1. Çoktan Seçmeli Test İçin Özel Boş CSV Şablonu (Ogrenim_Ciktisi_OC, Konu_Kazanim, Zorluk_Derecesi ve Hafta Dahil — Puan Sütunu Yoktur) */
  function uretBosTestSablonuCSV() {
    const baslik = 'Soru_Metni;Sik_A;Sik_B;Sik_C;Sik_D;Sik_E;Dogru_Sik_Secenegi;Zorluk_Derecesi;Ogrenim_Ciktisi_OC;Konu_Kazanim;Hafta';
    const o1 = 'Güvenli uzak kabuk (SSH) bağlantısı varsayılan olarak hangi portu kullanır?;21;22;23;80;443;B;Kolay;ÖÇ-1;Ağ Güvenliği;1';
    const o2 = 'Parola özetlemede bellek-zorlu (memory-hard) yapısıyla önerilen algoritma hangisidir?;MD5;SHA-1;CRC32;Argon2id;DES;D;Orta;ÖÇ-2;Kriptografi;3';
    const o3 = 'Bulut ortamlarında SSRF saldırılarında iç metadata servisini korumak için hangi IP filtrelenmelidir?;127.0.0.53;169.254.169.254;255.255.255.0;224.0.0.1;192.0.2.1;B;Zor;ÖÇ-3;Bulut Güvenliği;6';
    const o4 = 'OWASP Top 10:2025 kapsamında başka bir kullanıcının kaydına URL parametresi değiştirilerek erişilmesi hangi zafiyettir?;IDOR (Bozuk Erişim Kontrolü);XSS;CSRF;SQLi;ARP Spoofing;A;Orta;ÖÇ-4;Güvenli Yazılım;4';
    return '\ufeff' + [baslik, o1, o2, o3, o4].join('\r\n');
  }

  /* 2. Doğru / Yanlış (D/Y) İçin Özel Boş CSV Şablonu (Ogrenim_Ciktisi_OC, Konu_Kazanim, Zorluk_Derecesi ve Hafta Dahil — Puan Sütunu Yoktur) */
  function uretBosDySablonuCSV() {
    const baslik = 'Soru_Metni;Dogru_Cevap_DY;Zorluk_Derecesi;Ogrenim_Ciktisi_OC;Konu_Kazanim;Hafta';
    const o1 = 'TCP protokolü veri aktarımından önce üçlü el sıkışma ile bağlantı kurar.;D;Kolay;ÖÇ-1;Ağ Katmanları;1';
    const o2 = 'Simetrik şifrelemede açık ve özel olmak üzere iki farklı anahtar kullanılır.;Y;Orta;ÖÇ-2;Kriptografi;3';
    const o3 = 'VLAN yapısı aynı fiziksel anahtar üzerindeki yayın alanlarını (broadcast domain) mantıksal olarak böler.;D;Orta;ÖÇ-3;Ağ Mimarisi;5';
    const o4 = 'SQL Enjeksiyonu saldırılarını önlemenin en etkili yolu parametreli sorgular (Prepared Statements) kullanmaktır.;D;Zor;ÖÇ-4;Güvenli Yazılım;4';
    return '\ufeff' + [baslik, o1, o2, o3, o4].join('\r\n');
  }

  /* 3. Açık Uçlu / Klasik Sorular İçin Özel Boş CSV Şablonu (Ogrenim_Ciktisi_OC, Konu_Kazanim, Zorluk_Derecesi, Rubrik ve Hafta Dahil — Puan Sütunu Yoktur) */
  function uretBosKlasikSablonuCSV() {
    const baslik = 'Soru_Metni;Cevap_Anahtari_Rubrik;Zorluk_Derecesi;Cevap_Alani_Boyutu;Ogrenim_Ciktisi_OC;Konu_Kazanim;Hafta';
    const o1 = 'Bir kurumsal ağda DMZ (Arındırılmış Bölge) mimarisinin neden kullanıldığını açıklayınız.;DMZ tanımı + Web ve Veritabanı sunucu yerleşimi + Firewall kuralı;Orta;Orta;ÖÇ-3;Ağ Mimarisi;5';
    const o2 = 'İstemciye Sıfır Güven (Zero-Trust Client) ilkesini online sınav güvenliği üzerinden örnekleyiniz.;Zero-Trust tanımı + İstemci manipülasyonu riski + Sunucu otoritesi çözümü;Zor;Genis;ÖÇ-4;Güvenli Yazılım;7';
    return '\ufeff' + [baslik, o1, o2].join('\r\n');
  }

  /* 4. Karma (Test + D/Y + Klasik Bir Arada) Boş CSV Şablonu (Ogrenim_Ciktisi_OC ve Hafta Dahil — Puan Sütunu Yoktur) */
  function uretBosSoruSablonuCSV() {
    const baslik = 'Tur;Soru_Metni;Sik_A;Sik_B;Sik_C;Sik_D;Sik_E;Dogru_Cevap;Zorluk_Derecesi;Ogrenim_Ciktisi_OC;Konu_Kazanim;Klasik_Rubrik;Hafta';
    const ornek1 = 'DY;TCP protokolü veri aktarımından önce üçlü el sıkışma ile bağlantı kurar.;;;;;;D;Kolay;ÖÇ-1;Ağ Katmanları;;1';
    const ornek2 = 'DY;Simetrik şifrelemede açık ve özel olmak üzere iki farklı anahtar kullanılır.;;;;;;Y;Orta;ÖÇ-2;Kriptografi;;3';
    const ornek3 = 'TEST;Güvenli uzak kabuk (SSH) bağlantısı varsayılan olarak hangi portu kullanır?;21;22;23;80;443;B;Kolay;ÖÇ-3;Ağ Güvenliği;;2';
    const ornek4 = 'TEST;Parola özetlemede bellek-zorlu (memory-hard) yapısıyla önerilen algoritma hangisidir?;MD5;SHA-1;CRC32;Argon2id;DES;D;Orta;ÖÇ-4;Kriptografi;;4';
    const ornek5 = 'KLASIK;İstemciye Sıfır Güven (Zero-Trust Client) mimarisini sınav güvenliği üzerinden açıklayınız.;;;;;;;Zor;ÖÇ-5;Güvenli Mimari;Zero-Trust tanımı + Sunucu otoritesi örneği;6';
    return '\ufeff' + [baslik, ornek1, ornek2, ornek3, ornek4, ornek5].join('\r\n');
  }

  /* Aktif Soru Bankasını Bologna Öğrenim Çıktısı (Ogrenim_Ciktisi_OC) Sütunuyla CSV Olarak Dışa Aktarma */
  function uretSoruBankasiCSV(sorular = []) {
    const baslik = 'Tur;Soru_Metni;Sik_A;Sik_B;Sik_C;Sik_D;Sik_E;Dogru_Cevap;Zorluk_Derecesi;Ogrenim_Ciktisi_OC;Konu_Kazanim;Klasik_Rubrik;Hafta';
    const temizHucre = (v) => String(v === undefined || v === null ? '' : v).replace(/;/g, ',').replace(/[\r\n]+/g, ' ').trim();
    const satirlar = (Array.isArray(sorular) ? sorular : []).map((s) => {
      const turStr = s.tur === 'dy' ? 'DY' : (s.tur === 'klasik' ? 'KLASIK' : 'TEST');
      const siklar = Array.isArray(s.siklar) ? s.siklar : [];
      const dogru = s.tur === 'dy' ? (s.dogruDY || 'D') : (s.tur === 'test' ? (s.dogruHarf || 'A') : '');
      const ocBil = ayiklaOcBilesenleri(s.ocKodu || s.kazanim || 'ÖÇ-1', s.kazanim || '');
      return [
        turStr,
        temizHucre(s.metin),
        temizHucre(siklar[0] || ''),
        temizHucre(siklar[1] || ''),
        temizHucre(siklar[2] || ''),
        temizHucre(siklar[3] || ''),
        temizHucre(siklar[4] || ''),
        temizHucre(dogru),
        temizHucre(s.zorluk || 'Orta'),
        temizHucre(ocBil.ocKodu),
        temizHucre(ocBil.aciklama || ocBil.tamMetin),
        temizHucre(s.rubrik || ''),
        normalizeHaftaNo(s.hafta, 1)
      ].join(';');
    });
    return '\ufeff' + [baslik, ...satirlar].join('\r\n');
  }

  /* Tüm CSV Formatlarını (Test CSV, D/Y CSV, Klasik CSV ve Karma CSV + Ogrenim_Ciktisi_OC + Hafta Sütunu) Otomatik Tanıyan Çözücü */
  function cozSoruBankasiCSV(csvMetin, dersId = 'genel') {
    if (typeof csvMetin !== 'string' || !csvMetin.trim()) return [];
    const temizMetin = csvMetin.replace(/^\ufeff/, '').replace(/\r\n/g, '\n');
    const satirlar = temizMetin.split('\n').map((s) => s.trim()).filter(Boolean);
    if (satirlar.length < 2) return [];

    const ayirici = tespitEtCsvAyirici(satirlar[0]);
    const baslikHucreler = ayirCsvSatiri(satirlar[0], ayirici).map((b) => b.toLowerCase());
    const ilkSutunAdi = baslikHucreler[0] || '';
    const puanSutunVarMi = baslikHucreler.some((b) => b === 'puan' || b === 'tam_puan');
    const haftaSutunIdx = baslikHucreler.findIndex((b) => b.includes('hafta'));
    const ocSutunIdx = baslikHucreler.findIndex(
      (b) => b.includes('ogrenim_ciktisi') || b.includes('öğrenim_çıktısı') || b === 'oc' || b === 'öç' || b.includes('oc_kodu') || b.includes('bologna') || b === 'kazanim_oc'
    );
    const konuSutunIdx = baslikHucreler.findIndex(
      (b, idx) => idx !== ocSutunIdx && (b.includes('konu') || b.includes('kazanim') || b.includes('kazanım'))
    );
    const rubrikSutunIdx = baslikHucreler.findIndex((b) => b.includes('rubrik') || b.includes('cevap_anahtari'));

    // Şablon Tipini Başlık Satırından Otomatik Algıla
    let sablonTipi = 'KARMA';
    if (ilkSutunAdi.includes('soru_metni')) {
      if (baslikHucreler.some((b) => b.includes('sik_a'))) {
        sablonTipi = 'SADECE_TEST';
      } else if (baslikHucreler.some((b) => b.includes('rubrik') || b.includes('cevap_anahtari'))) {
        sablonTipi = 'SADECE_KLASIK';
      } else {
        sablonTipi = 'SADECE_DY';
      }
    }

    const uretilen = [];

    for (let i = 1; i < satirlar.length; i++) {
      const h = ayirCsvSatiri(satirlar[i], ayirici);
      if (h.length < 2) continue;
      const varsayilanOc = `ÖÇ-${((i - 1) % 4) + 1}`;

      if (sablonTipi === 'SADECE_TEST') {
        const metin = (h[0] || '').trim();
        if (!metin) continue;
        const siklar = [h[1], h[2], h[3], h[4], h[5]].map((s) => (s || '').trim()).filter(Boolean);
        const kesinSiklar = siklar.length >= 2 ? siklar : ['A şıkkı', 'B şıkkı', 'C şıkkı', 'D şıkkı', 'E şıkkı'];
        const harfler = ['A', 'B', 'C', 'D', 'E'];
        const dogruGirdi = (h[6] || 'A').trim();
        const dogruBuyuk = dogruGirdi.toUpperCase().replace(/[\)\.\s]+$/, '');
        let dogruHarf = 'A';
        if (harfler.includes(dogruBuyuk)) {
          dogruHarf = dogruBuyuk;
        } else {
          const bulunanIdx = kesinSiklar.findIndex((s) => s.toLowerCase() === dogruGirdi.toLowerCase());
          dogruHarf = bulunanIdx >= 0 ? harfler[bulunanIdx] : 'A';
        }
        const dogruSikDegeri = kesinSiklar[harfler.indexOf(dogruHarf)] || kesinSiklar[0];
        const zorluk = normalizeZorlukDerecesi(h[7]);
        const hamOc = ocSutunIdx >= 0 ? h[ocSutunIdx] : h[puanSutunVarMi ? 9 : 8];
        const hamKonu = konuSutunIdx >= 0 ? h[konuSutunIdx] : '';
        const ocBil = ayiklaOcBilesenleri(hamOc, hamKonu, varsayilanOc);
        const haftaHam = haftaSutunIdx >= 0 ? h[haftaSutunIdx] : h[puanSutunVarMi ? 10 : 9];
        const hafta = normalizeHaftaNo(haftaHam, ((i - 1) % 7) + 1);
        uretilen.push({
          id: 'CSV-T-' + Date.now() + '-' + i,
          dersId,
          tur: 'test',
          zorluk,
          hafta,
          ocKodu: ocBil.ocKodu,
          metin,
          siklar: kesinSiklar,
          dogruHarf,
          dogruSikDegeri,
          dogruDY: 'D',
          kazanim: ocBil.tamMetin,
          rubrik: ''
        });
        continue;
      }

      if (sablonTipi === 'SADECE_DY') {
        const metin = (h[0] || '').trim();
        if (!metin) continue;
        const dogruHam = (h[1] || 'D').toUpperCase().trim();
        const zorluk = normalizeZorlukDerecesi(h[2]);
        const hamOc = ocSutunIdx >= 0 ? h[ocSutunIdx] : h[puanSutunVarMi ? 4 : 3];
        const hamKonu = konuSutunIdx >= 0 ? h[konuSutunIdx] : '';
        const ocBil = ayiklaOcBilesenleri(hamOc, hamKonu, varsayilanOc);
        const haftaHam = haftaSutunIdx >= 0 ? h[haftaSutunIdx] : h[puanSutunVarMi ? 5 : 4];
        const hafta = normalizeHaftaNo(haftaHam, ((i - 1) % 7) + 1);
        uretilen.push({
          id: 'CSV-DY-' + Date.now() + '-' + i,
          dersId,
          tur: 'dy',
          zorluk,
          hafta,
          ocKodu: ocBil.ocKodu,
          metin,
          siklar: [],
          dogruHarf: 'A',
          dogruDY: dogruHam.startsWith('Y') ? 'Y' : 'D',
          kazanim: ocBil.tamMetin,
          rubrik: ''
        });
        continue;
      }

      if (sablonTipi === 'SADECE_KLASIK') {
        const metin = (h[0] || '').trim();
        if (!metin) continue;
        const rubrik = (h[1] || 'Kavramsal doğruluk + Uygulama örneği').trim();
        const zorluk = normalizeZorlukDerecesi(h[2]);
        const kutuBoyutu = (h[puanSutunVarMi ? 4 : 3] || 'Orta').trim();
        const hamOc = ocSutunIdx >= 0 ? h[ocSutunIdx] : h[puanSutunVarMi ? 5 : 4];
        const hamKonu = konuSutunIdx >= 0 ? h[konuSutunIdx] : '';
        const ocBil = ayiklaOcBilesenleri(hamOc, hamKonu, varsayilanOc);
        const haftaHam = haftaSutunIdx >= 0 ? h[haftaSutunIdx] : h[puanSutunVarMi ? 6 : 5];
        const hafta = normalizeHaftaNo(haftaHam, ((i - 1) % 7) + 1);
        uretilen.push({
          id: 'CSV-K-' + Date.now() + '-' + i,
          dersId,
          tur: 'klasik',
          zorluk,
          hafta,
          ocKodu: ocBil.ocKodu,
          metin,
          siklar: [],
          dogruHarf: 'A',
          dogruDY: 'D',
          kutuBoyutu,
          kazanim: ocBil.tamMetin,
          rubrik
        });
        continue;
      }

      // KARMA Format (Tur;Soru_Metni;Sik_A..E;Dogru_Cevap;Zorluk_Derecesi;Ogrenim_Ciktisi_OC;Konu_Kazanim;Klasik_Rubrik;Hafta)
      const hamTur = (h[0] || 'TEST').toUpperCase();
      const metin = (h[1] || '').trim();
      if (!metin) continue;

      let tur = 'test';
      if (hamTur.includes('DY') || hamTur.includes('D/Y') || hamTur.includes('DOĞRU')) tur = 'dy';
      else if (hamTur.includes('KLAS')) tur = 'klasik';

      const siklar = [h[2], h[3], h[4], h[5], h[6]].map((s) => (s || '').trim()).filter(Boolean);
      const dogruHam = (h[7] || 'A').toUpperCase().trim();
      const zorluk = normalizeZorlukDerecesi(h[8]);
      const hamOc = ocSutunIdx >= 0 ? h[ocSutunIdx] : h[9];
      const hamKonu = konuSutunIdx >= 0 ? h[konuSutunIdx] : '';
      const ocBil = ayiklaOcBilesenleri(hamOc, hamKonu, varsayilanOc);
      const rubrikHam = rubrikSutunIdx >= 0 ? h[rubrikSutunIdx] : h[10];
      const rubrik = (rubrikHam || 'Kavramsal doğruluk (5p) + Uygulama örneği (5p)').trim();
      const haftaHam = haftaSutunIdx >= 0 ? h[haftaSutunIdx] : h[11];
      const hafta = normalizeHaftaNo(haftaHam, ((i - 1) % 7) + 1);
      const kesinSiklar = tur === 'test' ? (siklar.length >= 2 ? siklar : ['A şıkkı', 'B şıkkı', 'C şıkkı', 'D şıkkı', 'E şıkkı']) : [];
      const dogruHarf = ['A', 'B', 'C', 'D', 'E'].includes(dogruHam) ? dogruHam : 'A';
      const dogruSikDegeri = tur === 'test' ? (kesinSiklar[['A', 'B', 'C', 'D', 'E'].indexOf(dogruHarf)] || kesinSiklar[0]) : '';

      uretilen.push({
        id: 'CSV-S-' + Date.now() + '-' + i,
        dersId,
        tur,
        zorluk,
        hafta,
        ocKodu: ocBil.ocKodu,
        metin,
        siklar: kesinSiklar,
        dogruHarf,
        dogruSikDegeri,
        dogruDY: dogruHam.startsWith('Y') ? 'Y' : 'D',
        kazanim: ocBil.tamMetin,
        rubrik
      });
    }
    return uretilen;
  }

  /* Zorluk Derecesine Göre (Kolay / Orta / Zor) Dengeli Soru Seçici */
  function secZorlukDengeliSorular(soruListesi, istenenAdet, zorlukModu = 'dengeli') {
    if (!Array.isArray(soruListesi) || istenenAdet <= 0) return [];
    if (zorlukModu === 'tumu' || soruListesi.length <= istenenAdet) {
      return soruListesi.slice(0, istenenAdet);
    }

    const kolaylar = soruListesi.filter((s) => s.zorluk === 'Kolay');
    const ortalar = soruListesi.filter((s) => s.zorluk === 'Orta' || !s.zorluk);
    const zorlar = soruListesi.filter((s) => s.zorluk === 'Zor');

    if (zorlukModu === 'kolay') {
      return [...kolaylar, ...ortalar, ...zorlar].slice(0, istenenAdet);
    }
    if (zorlukModu === 'orta') {
      return [...ortalar, ...kolaylar, ...zorlar].slice(0, istenenAdet);
    }
    if (zorlukModu === 'zor') {
      return [...zorlar, ...ortalar, ...kolaylar].slice(0, istenenAdet);
    }

    // Varsayılan 'dengeli': %30 Kolay, %50 Orta, %20 Zor
    const hedefKolay = Math.round(istenenAdet * 0.3);
    const hedefZor = Math.round(istenenAdet * 0.2);
    const hedefOrta = Math.max(0, istenenAdet - hedefKolay - hedefZor);

    const secilen = [
      ...kolaylar.slice(0, hedefKolay),
      ...ortalar.slice(0, hedefOrta),
      ...zorlar.slice(0, hedefZor)
    ];

    // Eksik kalırsa kalan sorulardan tamamla
    if (secilen.length < istenenAdet) {
      const secilenIdSet = new Set(secilen.map((s) => s.id));
      for (const s of soruListesi) {
        if (secilen.length >= istenenAdet) break;
        if (!secilenIdSet.has(s.id)) {
          secilen.push(s);
          secilenIdSet.add(s.id);
        }
      }
    }

    return secilen.slice(0, istenenAdet);
  }

  /* ------------------------------------------------------------------------
     8E. HAFTALIK KONU/KAZANIM VE BOLOGNA ÖĞRENİM ÇIKTISI (ÖÇ) BAZLI SORU SEÇİMİ,
     "HER ÖÇ İÇİN EN AZ 1 SORU GARANTİSİ", KAĞITTAN SORU DEĞİŞTİRME VE BELİRTKE MOTORU
     ------------------------------------------------------------------------ */
  function secHaftalikVeKotaliSinavSorulari(tumDersSorulari, ayarlar = {}) {
    const dySayisi = Math.max(0, Number(ayarlar.dySayisi || 0));
    const testSayisi = Math.max(0, Number(ayarlar.testSayisi || 0));
    const klasikSayisi = Math.max(0, Number(ayarlar.klasikSayisi || 0));
    const zorlukModu = ayarlar.zorlukModu || 'dengeli';
    const herOcEnAzBirSoru = ayarlar.herOcEnAzBirSoru !== false; // Varsayılan: Açık (Her ÖÇ için en az 1 soru garantisi)

    const seciliHaftalar = Array.isArray(ayarlar.seciliHaftalar) && ayarlar.seciliHaftalar.length > 0
      ? ayarlar.seciliHaftalar.map((h) => normalizeHaftaNo(h, 1))
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    const seciliHaftaSet = new Set(seciliHaftalar);

    const haftaDagilimModu = ayarlar.haftaDagilimModu || 'otomatik_dengeli';
    const haftaKotalari = (ayarlar.haftaKotalari && typeof ayarlar.haftaKotalari === 'object') ? ayarlar.haftaKotalari : {};
    const haricTutSorulanlar = Boolean(ayarlar.haricTutSorulanlar);
    const reddedilenSet = new Set(Array.isArray(ayarlar.reddedilenSoruIdleri) ? ayarlar.reddedilenSoruIdleri : []);
    const sabitlenenSet = new Set(Array.isArray(ayarlar.sabitlenenSoruIdleri) ? ayarlar.sabitlenenSoruIdleri : []);
    const ozelSira = (ayarlar.ozelSeciliSoruIdleri && typeof ayarlar.ozelSeciliSoruIdleri === 'object')
      ? ayarlar.ozelSeciliSoruIdleri
      : { dy: [], test: [], klasik: [] };

    const soruOcKoduAl = (s) => normalizeOcKodu((s && (s.ocKodu || s.kazanim)) || 'ÖÇ-1', 'ÖÇ-1');
    const soruHarita = new Map((tumDersSorulari || []).map((s) => [s.id, s]));

    // Aktif türleri ve seçili haftalardaki tüm benzersiz Bologna Öğrenim Çıktılarını (ÖÇ) tespit et
    const aktifTurler = new Set();
    if (dySayisi > 0) aktifTurler.add('dy');
    if (testSayisi > 0) aktifTurler.add('test');
    if (klasikSayisi > 0) aktifTurler.add('klasik');

    const hedefOcHarita = new Map(); // ocKodu -> Set(tur)
    for (const s of (tumDersSorulari || [])) {
      if (!s || s.arsivde) continue;
      const hNo = normalizeHaftaNo(s.hafta, 1);
      if (!seciliHaftaSet.has(hNo)) continue;
      if (aktifTurler.size > 0 && !aktifTurler.has(s.tur)) continue;
      const oc = soruOcKoduAl(s);
      if (!hedefOcHarita.has(oc)) hedefOcHarita.set(oc, new Set());
      hedefOcHarita.get(oc).add(s.tur);
    }
    const hedefOcKodlari = Array.from(hedefOcHarita.keys()).sort((a, b) => ocKoduSiraNo(a) - ocKoduSiraNo(b));

    // Sınav genelinde kapsanan ÖÇ sayaçları
    const genelOcSayac = new Map();
    const artirOcSayac = (s) => {
      const oc = soruOcKoduAl(s);
      genelOcSayac.set(oc, (genelOcSayac.get(oc) || 0) + 1);
    };

    // Haftalık kotaları (manuel_kota modunda) takip etmek için kalan kota haritası
    const kalanHaftaKotasi = {};
    if (haftaDagilimModu === 'manuel_kota') {
      for (let h = 1; h <= 14; h++) {
        kalanHaftaKotasi[h] = seciliHaftaSet.has(h)
          ? Math.max(0, Number(haftaKotalari[h] !== undefined ? haftaKotalari[h] : 2))
          : 0;
      }
    }

    const secTurIcin = (tur, istenenAdet) => {
      if (istenenAdet <= 0) return [];
      const turHavuzu = (tumDersSorulari || []).filter((s) => s.tur === tur && !s.arsivde);
      const secilen = [];
      const secilenIdSet = new Set();

      const ekleSoru = (s) => {
        if (!s || secilenIdSet.has(s.id) || secilen.length >= istenenAdet) return false;
        secilen.push(s);
        secilenIdSet.add(s.id);
        artirOcSayac(s);
        const hNo = normalizeHaftaNo(s.hafta, 1);
        if (haftaDagilimModu === 'manuel_kota' && kalanHaftaKotasi[hNo] > 0) {
          kalanHaftaKotasi[hNo]--;
        }
        return true;
      };

      // 1. Öncelik: Sabitlenen (📌) sorular (reddedilmiş değilse)
      for (const s of turHavuzu) {
        if (sabitlenenSet.has(s.id) && !reddedilenSet.has(s.id)) {
          ekleSoru(s);
        }
      }

      // 2. Öncelik: Eğer hoca kağıt üzerinde tekil soru değişimi / sıra kaydırma yaptıysa (ozelSira[tur])
      const mevcutOzelDizi = Array.isArray(ozelSira[tur]) ? ozelSira[tur] : [];
      for (const id of mevcutOzelDizi) {
        if (secilen.length >= istenenAdet) break;
        const s = soruHarita.get(id);
        if (!s || s.tur !== tur || reddedilenSet.has(s.id)) continue;
        const hNo = normalizeHaftaNo(s.hafta, 1);
        if (!seciliHaftaSet.has(hNo)) continue;
        if (haricTutSorulanlar && s.sorulduMu && !sabitlenenSet.has(s.id)) continue;
        if (haftaDagilimModu === 'manuel_kota' && (kalanHaftaKotasi[hNo] || 0) <= 0 && !sabitlenenSet.has(s.id)) continue;
        ekleSoru(s);
      }

      // Seçili haftalardaki uygun aday havuzu
      const uygunHavuz = turHavuzu.filter((s) => {
        if (secilenIdSet.has(s.id) || reddedilenSet.has(s.id)) return false;
        const hNo = normalizeHaftaNo(s.hafta, 1);
        if (!seciliHaftaSet.has(hNo)) return false;
        if (haricTutSorulanlar && s.sorulduMu) return false;
        return true;
      });

      // 2B. BOLOGNA ÖĞRENİM ÇIKTISI (ÖÇ) KAPSAMA GARANTİSİ ("HER ÖÇ İÇİN EN AZ 1 SORU"):
      // Henüz sınavda hiç temsil edilmemiş (genelOcSayac === 0) ÖÇ'ler için öncelikli 1'er soru seç
      if (herOcEnAzBirSoru && secilen.length < istenenAdet) {
        const buTurdakiOcGruplari = new Map();
        for (const s of uygunHavuz) {
          const oc = soruOcKoduAl(s);
          if (!buTurdakiOcGruplari.has(oc)) buTurdakiOcGruplari.set(oc, []);
          buTurdakiOcGruplari.get(oc).push(s);
        }

        // Henüz kapsanmamış ÖÇ'leri önceliklendir:
        // 1) Sadece bu soru türünde bulunan ÖÇ'ler en önce,
        // 2) Aday soru sayısı en az olan (en dar havuzlu / MRV) ÖÇ'ler önce
        const eksikOcler = Array.from(buTurdakiOcGruplari.keys())
          .filter((oc) => (genelOcSayac.get(oc) || 0) === 0)
          .sort((a, b) => {
            const aSadeceBuTur = (hedefOcHarita.get(a) && hedefOcHarita.get(a).size === 1) ? 0 : 1;
            const bSadeceBuTur = (hedefOcHarita.get(b) && hedefOcHarita.get(b).size === 1) ? 0 : 1;
            if (aSadeceBuTur !== bSadeceBuTur) return aSadeceBuTur - bSadeceBuTur;
            const aSay = (buTurdakiOcGruplari.get(a) || []).length;
            const bSay = (buTurdakiOcGruplari.get(b) || []).length;
            if (aSay !== bSay) return aSay - bSay;
            return ocKoduSiraNo(a) - ocKoduSiraNo(b);
          });

        for (const oc of eksikOcler) {
          if (secilen.length >= istenenAdet) break;
          if ((genelOcSayac.get(oc) || 0) > 0) continue;
          let adaylar = (buTurdakiOcGruplari.get(oc) || []).filter((s) => !secilenIdSet.has(s.id));
          if (haftaDagilimModu === 'manuel_kota') {
            const kotaliAdaylar = adaylar.filter((s) => (kalanHaftaKotasi[normalizeHaftaNo(s.hafta, 1)] || 0) > 0);
            if (kotaliAdaylar.length > 0) adaylar = kotaliAdaylar;
          }
          const dengeliAdaylar = secZorlukDengeliSorular(adaylar, adaylar.length, zorlukModu);
          if (dengeliAdaylar.length > 0) {
            ekleSoru(dengeliAdaylar[0]);
          }
        }
      }

      // 3. Öncelik: Seçili haftalardan (ve manuel_kota ise kotası kalan haftalardan) ÖÇ ve zorluk dengeli dağıtım
      if (haftaDagilimModu === 'manuel_kota') {
        let ilerleme = true;
        while (secilen.length < istenenAdet && ilerleme) {
          ilerleme = false;
          for (const hNo of seciliHaftalar) {
            if (secilen.length >= istenenAdet) break;
            if ((kalanHaftaKotasi[hNo] || 0) <= 0) continue;
            const haftaAdaylari = secZorlukDengeliSorular(
              uygunHavuz.filter((s) => !secilenIdSet.has(s.id) && normalizeHaftaNo(s.hafta, 1) === hNo),
              kalanHaftaKotasi[hNo],
              zorlukModu
            );
            if (haftaAdaylari.length > 0) {
              if (herOcEnAzBirSoru) {
                haftaAdaylari.sort((a, b) => (genelOcSayac.get(soruOcKoduAl(a)) || 0) - (genelOcSayac.get(soruOcKoduAl(b)) || 0));
              }
              ekleSoru(haftaAdaylari[0]);
              ilerleme = true;
            }
          }
        }
      } else {
        // Otomatik Dengeli Hafta Dağıtımı: Seçili haftalar arasında round-robin (dönel) + ÖÇ/zorluk dengeli seçim
        const haftaGruplari = new Map();
        for (const hNo of seciliHaftalar) {
          const buHafta = secZorlukDengeliSorular(
            uygunHavuz.filter((s) => !secilenIdSet.has(s.id) && normalizeHaftaNo(s.hafta, 1) === hNo),
            uygunHavuz.length,
            zorlukModu
          );
          if (buHafta.length > 0) haftaGruplari.set(hNo, buHafta);
        }
        let eklendiMi = true;
        while (secilen.length < istenenAdet && eklendiMi) {
          eklendiMi = false;
          for (const [, grupDizi] of haftaGruplari.entries()) {
            if (secilen.length >= istenenAdet) break;
            const kalanGrup = grupDizi.filter((s) => !secilenIdSet.has(s.id));
            if (kalanGrup.length > 0) {
              if (herOcEnAzBirSoru) {
                kalanGrup.sort((a, b) => (genelOcSayac.get(soruOcKoduAl(a)) || 0) - (genelOcSayac.get(soruOcKoduAl(b)) || 0));
              }
              if (ekleSoru(kalanGrup[0])) {
                eklendiMi = true;
              }
            }
          }
        }
      }

      // 4. Yedek Tamamlama: Seçili haftalardaki diğer uygun sorular (en az temsil edilen ÖÇ öncelikli)
      if (secilen.length < istenenAdet) {
        const kalanUygun = secZorlukDengeliSorular(
          uygunHavuz.filter((s) => !secilenIdSet.has(s.id)),
          uygunHavuz.length,
          zorlukModu
        );
        if (herOcEnAzBirSoru) {
          kalanUygun.sort((a, b) => (genelOcSayac.get(soruOcKoduAl(a)) || 0) - (genelOcSayac.get(soruOcKoduAl(b)) || 0));
        }
        for (const s of kalanUygun) {
          if (secilen.length >= istenenAdet) break;
          ekleSoru(s);
        }
      }

      // 5. Yedek Tamamlama: Reddedilmemiş ama diğer haftalardaki / sorulmuş sorular
      if (secilen.length < istenenAdet) {
        const tumReddedilmemis = secZorlukDengeliSorular(
          turHavuzu.filter((s) => !secilenIdSet.has(s.id) && !reddedilenSet.has(s.id)),
          turHavuzu.length,
          zorlukModu
        );
        if (herOcEnAzBirSoru) {
          tumReddedilmemis.sort((a, b) => (genelOcSayac.get(soruOcKoduAl(a)) || 0) - (genelOcSayac.get(soruOcKoduAl(b)) || 0));
        }
        for (const s of tumReddedilmemis) {
          if (secilen.length >= istenenAdet) break;
          ekleSoru(s);
        }
      }

      // 6. Son Çare: Havuzda başka soru kalmadıysa reddedilenlerden tamamla
      if (secilen.length < istenenAdet) {
        for (const s of turHavuzu) {
          if (secilen.length >= istenenAdet) break;
          ekleSoru(s);
        }
      }

      return secilen;
    };

    const dy = secTurIcin('dy', dySayisi);
    const test = secTurIcin('test', testSayisi);
    const klasik = secTurIcin('klasik', klasikSayisi);

    // SON GARANTİ KONTROLÜ (Post-Pass Set-Cover):
    // Eğer hedefOcKodlari içinde hala 0 soruyla kalan bir ÖÇ varsa (örn. önceki özel sıra veya tür dolumu yüzünden),
    // ve havuzda o ÖÇ'ye ait uygun bir soru varsa, 2+ sorusu olan ve sabitlenmemiş (📌 olmayan) bir soruyla takas et!
    if (herOcEnAzBirSoru && hedefOcKodlari.length > 0) {
      const turDizileri = { dy, test, klasik };
      const tumSeciliIdSet = new Set([...dy, ...test, ...klasik].map((s) => s.id));

      for (const eksikOc of hedefOcKodlari) {
        if ((genelOcSayac.get(eksikOc) || 0) > 0) continue;

        // Bu eksikOc için seçili haftalarda uygun bir aday soru bul
        const aday = (tumDersSorulari || []).find((s) => {
          if (!s || s.arsivde || tumSeciliIdSet.has(s.id) || reddedilenSet.has(s.id)) return false;
          if (!aktifTurler.has(s.tur)) return false;
          if (!seciliHaftaSet.has(normalizeHaftaNo(s.hafta, 1))) return false;
          if (haricTutSorulanlar && s.sorulduMu) return false;
          return soruOcKoduAl(s) === eksikOc;
        });
        if (!aday) continue;

        const hedefDizi = turDizileri[aday.tur];
        if (!Array.isArray(hedefDizi) || hedefDizi.length === 0) continue;

        // Aynı türde, ÖÇ sayısı >= 2 olan ve sabitlenmemiş en son soruyu bulup takas et
        let takasIdx = -1;
        for (let i = hedefDizi.length - 1; i >= 0; i--) {
          const mevcut = hedefDizi[i];
          if (sabitlenenSet.has(mevcut.id)) continue;
          const mevcutOc = soruOcKoduAl(mevcut);
          if ((genelOcSayac.get(mevcutOc) || 0) >= 2) {
            takasIdx = i;
            break;
          }
        }
        if (takasIdx >= 0) {
          const cikarilan = hedefDizi[takasIdx];
          const cikarilanOc = soruOcKoduAl(cikarilan);
          genelOcSayac.set(cikarilanOc, Math.max(0, (genelOcSayac.get(cikarilanOc) || 1) - 1));
          tumSeciliIdSet.delete(cikarilan.id);

          hedefDizi[takasIdx] = aday;
          tumSeciliIdSet.add(aday.id);
          genelOcSayac.set(eksikOc, (genelOcSayac.get(eksikOc) || 0) + 1);
        }
      }
    }

    // D/Y DENGE VE ARDIŞIK YIĞILMA KONTROLÜ:
    // Havuzda karşıt D/Y sorusu varsa seçilen D/Y sorularında aşırı tek yönlü yığılmayı önle ve ardışık 4+ serileri kır
    if (dy.length >= 4) {
      const dyHarfAl = (s) => (String((s && s.dogruDY) || 'D').toUpperCase() === 'Y' ? 'Y' : 'D');
      const tumSeciliDyId = new Set(dy.map((s) => s.id));
      let dSayisi = dy.filter((s) => dyHarfAl(s) === 'D').length;
      let ySayisi = dy.length - dSayisi;
      const hedefMinAzinlik = Math.max(1, Math.floor(dy.length / 4));
      if (dSayisi < hedefMinAzinlik || ySayisi < hedefMinAzinlik) {
        const arananHarf = dSayisi < ySayisi ? 'D' : 'Y';
        const baskinHarf = arananHarf === 'D' ? 'Y' : 'D';
        const yedekHavuz = (tumDersSorulari || []).filter(
          (s) => s && s.tur === 'dy' && !s.arsivde && !tumSeciliDyId.has(s.id) && !reddedilenSet.has(s.id) && dyHarfAl(s) === arananHarf
        );
        for (const yedek of yedekHavuz) {
          if (Math.min(dSayisi, ySayisi) >= hedefMinAzinlik) break;
          let takasIdx = -1;
          for (let i = dy.length - 1; i >= 0; i--) {
            const mevcut = dy[i];
            if (sabitlenenSet.has(mevcut.id) || dyHarfAl(mevcut) !== baskinHarf) continue;
            const mOc = soruOcKoduAl(mevcut);
            const yOc = soruOcKoduAl(yedek);
            if (!herOcEnAzBirSoru || mOc === yOc || (genelOcSayac.get(mOc) || 0) >= 2) {
              takasIdx = i;
              break;
            }
          }
          if (takasIdx >= 0) {
            const cikarilan = dy[takasIdx];
            const mOc = soruOcKoduAl(cikarilan);
            const yOc = soruOcKoduAl(yedek);
            genelOcSayac.set(mOc, Math.max(0, (genelOcSayac.get(mOc) || 1) - 1));
            genelOcSayac.set(yOc, (genelOcSayac.get(yOc) || 0) + 1);
            tumSeciliDyId.delete(cikarilan.id);
            tumSeciliDyId.add(yedek.id);
            dy[takasIdx] = yedek;
            if (arananHarf === 'D') { dSayisi++; ySayisi--; } else { ySayisi++; dSayisi--; }
          }
        }
      }
      const dengelenmisDy = onleDyArdisikYigilma(dy);
      dy.length = 0;
      dy.push(...dengelenmisDy);
      Object.defineProperty(dy, 'enUzunDySerisi', { value: dengelenmisDy.enUzunDySerisi, enumerable: false, configurable: true });
      Object.defineProperty(dy, 'dyDengesizUyari', { value: dengelenmisDy.dyDengesizUyari, enumerable: false, configurable: true });
    }

    const tumSecili = [...dy, ...test, ...klasik];
    const kapsananOcSet = new Set(tumSecili.map((s) => soruOcKoduAl(s)));
    const kapsananOcListesi = Array.from(kapsananOcSet).sort((a, b) => ocKoduSiraNo(a) - ocKoduSiraNo(b));
    const eksikOcListesi = hedefOcKodlari.filter((oc) => !kapsananOcSet.has(oc));
    const enUzunDy = hesaplaEnUzunDySerisi(dy);

    return {
      dy,
      test,
      klasik,
      tumSecili,
      enUzunDySerisi: enUzunDy,
      dyDengesizUyari: enUzunDy > 3,
      ocKapsamaRaporu: {
        herOcEnAzBirSoru,
        hedefOcListesi: hedefOcKodlari,
        kapsananOcListesi,
        eksikOcListesi,
        eksikOcKodlari: eksikOcListesi,
        tamKapsandiMi: eksikOcListesi.length === 0
      }
    };
  }

  /* Kağıt Üzerinden Tek Bir Soruyu Kaldırıp Yerine Havuzdan Aynı ÖÇ/Tür/Hafta/Zorlukta Yeni Soru Atama Motoru */
  function degistirTekSoruHavuzdan(arg1, arg2, arg3, ayarlar = {}) {
    // Hem (mevcutTurListesi, cikarilacakSoruId, tumDersSorulari, ayarlar) hem de (tumDersSorulari, mevcutTurListesi, cikarilacakSoruId, ayarlar) imzasını destekle
    const mevcutTurListesi = Array.isArray(arg2) ? arg2 : arg1;
    const cikarilacakSoruId = typeof arg2 === 'string' ? arg2 : arg3;
    const tumDersSorulari = Array.isArray(arg2) ? arg1 : arg3;

    const liste = Array.isArray(mevcutTurListesi) ? mevcutTurListesi.slice() : [];
    const hedefIdx = liste.findIndex((s) => s.id === cikarilacakSoruId);
    if (hedefIdx < 0) {
      return {
        degisti: false,
        basarili: false,
        yeniListe: liste,
        cikarilanSoru: null,
        atananSoru: null,
        yeniSoru: null,
        yeniReddedilenSoruIdleri: ayarlar.reddedilenSoruIdleri || [],
        reddedilenSoruIdleri: ayarlar.reddedilenSoruIdleri || [],
        aciklama: 'Soru mevcut kağıt listesinde bulunamadı.',
        mesaj: 'Soru mevcut kağıt listesinde bulunamadı.'
      };
    }

    const cikarilan = liste[hedefIdx];
    const mevcutIdSet = new Set(liste.map((s) => s.id));
    const yeniReddedilenler = Array.from(new Set([...(ayarlar.reddedilenSoruIdleri || []), cikarilacakSoruId]));
    const reddedilenSet = new Set(yeniReddedilenler);

    const seciliHaftalar = Array.isArray(ayarlar.seciliHaftalar) && ayarlar.seciliHaftalar.length > 0
      ? new Set(ayarlar.seciliHaftalar.map((h) => normalizeHaftaNo(h, 1)))
      : new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    const haricTutSorulanlar = Boolean(ayarlar.haricTutSorulanlar);

    const turHavuzu = (tumDersSorulari || []).filter(
      (s) => s.tur === cikarilan.tur && !s.arsivde && !mevcutIdSet.has(s.id)
    );

    const hedefHafta = normalizeHaftaNo(cikarilan.hafta, 1);
    const hedefZorluk = cikarilan.zorluk || 'Orta';
    const hedefOc = normalizeOcKodu(cikarilan.ocKodu || cikarilan.kazanim, 'ÖÇ-1');

    // Kademeli En İyi Yedek Soru Arama (Önce Aynı Bologna ÖÇ + Hafta + Zorluk korunur!)
    const kademeOc1 = turHavuzu.filter(
      (s) => !reddedilenSet.has(s.id)
        && normalizeOcKodu(s.ocKodu || s.kazanim, 'ÖÇ-1') === hedefOc
        && normalizeHaftaNo(s.hafta, 1) === hedefHafta
        && (s.zorluk || 'Orta') === hedefZorluk
        && (!haricTutSorulanlar || !s.sorulduMu)
    );
    const kademeOc2 = turHavuzu.filter(
      (s) => !reddedilenSet.has(s.id)
        && normalizeOcKodu(s.ocKodu || s.kazanim, 'ÖÇ-1') === hedefOc
        && seciliHaftalar.has(normalizeHaftaNo(s.hafta, 1))
        && (!haricTutSorulanlar || !s.sorulduMu)
    );
    const kademe1 = turHavuzu.filter(
      (s) => !reddedilenSet.has(s.id)
        && normalizeHaftaNo(s.hafta, 1) === hedefHafta
        && (s.zorluk || 'Orta') === hedefZorluk
        && (!haricTutSorulanlar || !s.sorulduMu)
    );
    const kademe2 = turHavuzu.filter(
      (s) => !reddedilenSet.has(s.id)
        && normalizeHaftaNo(s.hafta, 1) === hedefHafta
        && (!haricTutSorulanlar || !s.sorulduMu)
    );
    const kademe3 = turHavuzu.filter(
      (s) => !reddedilenSet.has(s.id)
        && seciliHaftalar.has(normalizeHaftaNo(s.hafta, 1))
        && (s.zorluk || 'Orta') === hedefZorluk
        && (!haricTutSorulanlar || !s.sorulduMu)
    );
    const kademe4 = turHavuzu.filter(
      (s) => !reddedilenSet.has(s.id)
        && seciliHaftalar.has(normalizeHaftaNo(s.hafta, 1))
    );
    const kademe5 = turHavuzu.filter((s) => !reddedilenSet.has(s.id));

    let atanan = kademeOc1[0] || kademeOc2[0] || kademe1[0] || kademe2[0] || kademe3[0] || kademe4[0] || kademe5[0] || null;
    let eslesmeBilgisi = 'Aynı öğrenim çıktısı (ÖÇ), hafta ve zorluk derecesinden yeni soru atandı.';

    if (kademeOc1.length > 0) {
      eslesmeBilgisi = `${hedefOc} · Hafta ${hedefHafta} (${hedefZorluk}) havuzundan birebir eşleşen yeni soru atandı.`;
    } else if (kademeOc2.length > 0) {
      eslesmeBilgisi = `${hedefOc} kapsamı korunarak Hafta ${normalizeHaftaNo(atanan.hafta, 1)} (${atanan.zorluk || 'Orta'}) havuzundan yeni soru atandı.`;
    } else if (kademe1.length > 0) {
      eslesmeBilgisi = `Hafta ${hedefHafta} (${hedefZorluk}) havuzundan birebir eşleşen yeni soru atandı.`;
    } else if (kademe2.length > 0) {
      eslesmeBilgisi = `Hafta ${hedefHafta} havuzundan (${atanan.zorluk || 'Orta'}) yeni soru atandı.`;
    } else if (kademe3.length > 0 || kademe4.length > 0) {
      eslesmeBilgisi = `Hafta ${hedefHafta}'de başka yedek kalmadığı için seçili sınav haftalarından (Hafta ${normalizeHaftaNo(atanan.hafta, 1)}) yeni soru atandı.`;
    } else if (kademe5.length > 0) {
      eslesmeBilgisi = `Genel soru havuzundan (Hafta ${normalizeHaftaNo(atanan.hafta, 1)}) yedek soru atandı.`;
    } else if (turHavuzu.length > 0) {
      // Tüm yedekler daha önce gezildiyse döngüyü sıfırla ve farklı bir soru ver
      atanan = turHavuzu[0];
      yeniReddedilenler.length = 0;
      yeniReddedilenler.push(cikarilacakSoruId);
      eslesmeBilgisi = 'Havuzdaki tüm yedek sorular turlandığı için liste başa döndü ve yeni soru atandı.';
    }

    if (!atanan) {
      // Eğer bankada hiç yedek soru yoksa otomatik yeni varyant soru üret
      atanan = {
        ...cikarilan,
        id: `${cikarilan.tur}-oto-yedek-${Date.now()}`,
        metin: `[Yedek Soru — Hafta ${hedefHafta} · ${hedefOc}] ${cikarilan.metin}`
      };
      eslesmeBilgisi = 'Soru bankasında bu türde başka soru bulunmadığı için otomatik yedek soru üretildi.';
    }

    liste[hedefIdx] = atanan;
    return {
      degisti: true,
      basarili: true,
      yeniListe: liste,
      cikarilanSoru: cikarilan,
      atananSoru: atanan,
      yeniSoru: atanan,
      yeniReddedilenSoruIdleri: yeniReddedilenler,
      reddedilenSoruIdleri: yeniReddedilenler,
      aciklama: eslesmeBilgisi,
      mesaj: eslesmeBilgisi
    };
  }

  /* Akademik Sınav Belirtke Tablosu (Hafta × Bologna Öğrenim Çıktısı ÖÇ × Soru Türü × Zorluk × Puan) Üretici */
  function uretSinavBelirtkeTablosu(seciliSorular = [], puanYapisi = {}, tumHavuzSorulari = [], dersOgrenimCiktilari = []) {
    const dyPuan = Number(puanYapisi.dySoruPuan || 2);
    const testPuan = Number(puanYapisi.testSoruPuan || 5);
    const klasikPuanlar = Array.isArray(puanYapisi.klasikSoruPuanlari) ? puanYapisi.klasikSoruPuanlari : [];
    const varsayilanKlasikPuan = Number(puanYapisi.klasikSoruPuan || 10);

    const haftaHarita = new Map();
    const ocHarita = new Map();
    const zorlukOzeti = { Kolay: 0, Orta: 0, Zor: 0 };
    let dySayac = 0;
    let testSayac = 0;
    let klasikSayac = 0;
    let genelToplamPuan = 0;

    // Ders için kayıtlı Bologna ÖÇ maddeleri varsa önce onları kaydet
    const kayitliDersOcleri = ayiklaDersOcMaddeleri(dersOgrenimCiktilari);
    for (const doc of kayitliDersOcleri) {
      if (!ocHarita.has(doc.kod)) {
        ocHarita.set(doc.kod, {
          ocKodu: doc.kod,
          aciklamaSet: new Set(doc.aciklama ? [doc.aciklama] : []),
          haftaSet: new Set(),
          soruEtiketleri: [],
          dyAdet: 0,
          testAdet: 0,
          klasikAdet: 0,
          kolayAdet: 0,
          ortaAdet: 0,
          zorAdet: 0,
          toplamAdet: 0,
          toplamPuan: 0
        });
      }
    }

    // Havuzdaki tüm hedef ÖÇ'leri önceden kaydet (Eksik ÖÇ varsa 0 soru olarak da izlenebilsin)
    if (Array.isArray(tumHavuzSorulari)) {
      for (const hs of tumHavuzSorulari) {
        if (!hs || hs.arsivde) continue;
        const ocBil = ayiklaOcBilesenleri(hs.ocKodu || hs.kazanim || 'ÖÇ-1', hs.kazanim || '');
        if (!ocHarita.has(ocBil.ocKodu)) {
          ocHarita.set(ocBil.ocKodu, {
            ocKodu: ocBil.ocKodu,
            aciklamaSet: new Set(ocBil.aciklama ? [ocBil.aciklama] : []),
            haftaSet: new Set(),
            soruEtiketleri: [],
            dyAdet: 0,
            testAdet: 0,
            klasikAdet: 0,
            kolayAdet: 0,
            ortaAdet: 0,
            zorAdet: 0,
            toplamAdet: 0,
            toplamPuan: 0
          });
        } else if (ocBil.aciklama) {
          ocHarita.get(ocBil.ocKodu).aciklamaSet.add(ocBil.aciklama);
        }
      }
    }

    for (const s of seciliSorular) {
      const hNo = normalizeHaftaNo(s.hafta, 1);
      const ocBil = ayiklaOcBilesenleri(s.ocKodu || s.kazanim || 'ÖÇ-1', s.kazanim || '');
      if (!haftaHarita.has(hNo)) {
        haftaHarita.set(hNo, {
          hafta: hNo,
          kazanimSet: new Set(),
          ocSet: new Set(),
          dyAdet: 0,
          testAdet: 0,
          klasikAdet: 0,
          kolayAdet: 0,
          ortaAdet: 0,
          zorAdet: 0,
          toplamAdet: 0,
          toplamPuan: 0
        });
      }
      const kayit = haftaHarita.get(hNo);
      if (s.kazanim) kayit.kazanimSet.add(s.kazanim);
      kayit.ocSet.add(ocBil.ocKodu);

      if (!ocHarita.has(ocBil.ocKodu)) {
        ocHarita.set(ocBil.ocKodu, {
          ocKodu: ocBil.ocKodu,
          aciklamaSet: new Set(),
          haftaSet: new Set(),
          soruEtiketleri: [],
          dyAdet: 0,
          testAdet: 0,
          klasikAdet: 0,
          kolayAdet: 0,
          ortaAdet: 0,
          zorAdet: 0,
          toplamAdet: 0,
          toplamPuan: 0
        });
      }
      const ocKayit = ocHarita.get(ocBil.ocKodu);
      if (ocBil.aciklama) ocKayit.aciklamaSet.add(ocBil.aciklama);
      ocKayit.haftaSet.add(hNo);

      let buPuan = 0;
      let soruEtiketi = '';
      if (s.tur === 'dy') {
        dySayac++;
        kayit.dyAdet++;
        ocKayit.dyAdet++;
        buPuan = dyPuan;
        soruEtiketi = `DY-${dySayac}`;
      } else if (s.tur === 'test') {
        testSayac++;
        kayit.testAdet++;
        ocKayit.testAdet++;
        buPuan = testPuan;
        soruEtiketi = `T-${testSayac}`;
      } else {
        kayit.klasikAdet++;
        ocKayit.klasikAdet++;
        buPuan = klasikPuanlar[klasikSayac] !== undefined ? Number(klasikPuanlar[klasikSayac]) : varsayilanKlasikPuan;
        klasikSayac++;
        soruEtiketi = `K-${klasikSayac}`;
      }
      ocKayit.soruEtiketleri.push(soruEtiketi);

      const z = normalizeZorlukDerecesi(s.zorluk);
      if (z === 'Kolay') { kayit.kolayAdet++; ocKayit.kolayAdet++; zorlukOzeti.Kolay++; }
      else if (z === 'Zor') { kayit.zorAdet++; ocKayit.zorAdet++; zorlukOzeti.Zor++; }
      else { kayit.ortaAdet++; ocKayit.ortaAdet++; zorlukOzeti.Orta++; }

      kayit.toplamAdet++;
      kayit.toplamPuan = Number((kayit.toplamPuan + buPuan).toFixed(2));
      ocKayit.toplamAdet++;
      ocKayit.toplamPuan = Number((ocKayit.toplamPuan + buPuan).toFixed(2));
      genelToplamPuan = Number((genelToplamPuan + buPuan).toFixed(2));
    }

    const satirlar = Array.from(haftaHarita.values())
      .sort((a, b) => a.hafta - b.hafta)
      .map((k) => {
        const kazanimListe = Array.from(k.kazanimSet);
        const ocListe = Array.from(k.ocSet).sort((a, b) => ocKoduSiraNo(a) - ocKoduSiraNo(b));
        const yuzde = genelToplamPuan > 0 ? Math.round((k.toplamPuan / genelToplamPuan) * 100) : 0;
        return {
          hafta: k.hafta,
          ocKodlari: ocListe,
          kazanimlar: kazanimListe.length > 0 ? kazanimListe : [`Hafta ${k.hafta} Konuları`],
          kazanimMetin: kazanimListe.join(', ') || `Hafta ${k.hafta} Konuları`,
          dy: k.dyAdet,
          dyAdet: k.dyAdet,
          test: k.testAdet,
          testAdet: k.testAdet,
          klasik: k.klasikAdet,
          klasikAdet: k.klasikAdet,
          kolay: k.kolayAdet,
          kolayAdet: k.kolayAdet,
          orta: k.ortaAdet,
          ortaAdet: k.ortaAdet,
          zor: k.zorAdet,
          zorAdet: k.zorAdet,
          toplamSoru: k.toplamAdet,
          toplamAdet: k.toplamAdet,
          toplamPuan: k.toplamPuan,
          puanYuzde: yuzde,
          yuzdeAgirlik: yuzde
        };
      });

    const ocSatirlar = Array.from(ocHarita.values())
      .sort((a, b) => ocKoduSiraNo(a.ocKodu) - ocKoduSiraNo(b.ocKodu))
      .map((ok) => {
        const aciklamalar = Array.from(ok.aciklamaSet);
        const yuzde = genelToplamPuan > 0 ? Math.round((ok.toplamPuan / genelToplamPuan) * 100) : 0;
        return {
          ocKodu: ok.ocKodu,
          aciklama: aciklamalar.join(', ') || `${ok.ocKodu} Öğrenim Çıktısı`,
          haftalar: Array.from(ok.haftaSet).sort((a, b) => a - b),
          soruEtiketleri: ok.soruEtiketleri,
          dy: ok.dyAdet,
          test: ok.testAdet,
          klasik: ok.klasikAdet,
          kolay: ok.kolayAdet,
          orta: ok.ortaAdet,
          zor: ok.zorAdet,
          toplamSoru: ok.toplamAdet,
          toplamPuan: ok.toplamPuan,
          puanYuzde: yuzde,
          kapsandiMi: ok.toplamAdet >= 1
        };
      });

    const aktifOcSatirlar = ocSatirlar.filter((o) => o.toplamSoru > 0);
    const eksikOcSatirlar = ocSatirlar.filter((o) => o.toplamSoru === 0);

    return {
      satirlar,
      aktifSatirlar: satirlar,
      ocSatirlar,
      aktifOcSatirlar,
      eksikOcKodlari: eksikOcSatirlar.map((o) => o.ocKodu),
      herOcEnAzBirTamamMi: eksikOcSatirlar.length === 0,
      toplamSoru: seciliSorular.length,
      toplamPuan: genelToplamPuan,
      zorlukOzeti,
      genelOzet: {
        toplamSoru: seciliSorular.length,
        toplamPuan: genelToplamPuan,
        kolay: zorlukOzeti.Kolay,
        orta: zorlukOzeti.Orta,
        zor: zorlukOzeti.Zor,
        kapsananHaftaSayisi: satirlar.length,
        kapsananOcSayisi: aktifOcSatirlar.length,
        hedefOcSayisi: ocSatirlar.length
      }
    };
  }

  /* ------------------------------------------------------------------------
     SALON KONTENJANI DAĞITIMI
     Öğrenciler salonlara kontenjan sınırlarını aşmadan yerleştirilir.
     mod: 'sirali'  → numara sırasıyla salonlar sırayla doldurulur (1. salon dolunca 2. salon...)
          'dengeli' → öğrenciler salonlara kontenjanla orantılı, eşit yoğunlukta dağıtılır
     Toplam kontenjan yetmezse son salonun kapasitesiyle "Ek Salon N" açılır (yetersiz: true).
     ------------------------------------------------------------------------ */
  function salonlaraDagit(ogrenciler = [], salonlar = [], mod = 'sirali') {
    const temizSalonlar = (Array.isArray(salonlar) ? salonlar : [])
      .map((s, i) => ({
        id: String((s && s.id) || `salon-${i + 1}`),
        ad: String((s && s.ad) || `Salon ${i + 1}`).slice(0, 40),
        kontenjan: Math.max(1, Math.min(1000, parseInt(s && s.kontenjan, 10) || 30)),
        gozetmenler: Array.isArray(s && s.gozetmenler) ? s.gozetmenler.map((g) => String(g || '').slice(0, 60)) : []
      }));
    if (temizSalonlar.length === 0) temizSalonlar.push({ id: 'salon-1', ad: 'Salon 1', kontenjan: 40, gozetmenler: [] });

    const sirali = (Array.isArray(ogrenciler) ? ogrenciler : [])
      .slice()
      .sort((a, b) => String(a.ogrNo).localeCompare(String(b.ogrNo), 'tr', { numeric: true }));

    const toplamKontenjan = temizSalonlar.reduce((t, s) => t + s.kontenjan, 0);
    let yetersiz = false;
    const kullanilacak = temizSalonlar.map((s) => ({ ...s, ek: false }));
    if (sirali.length > toplamKontenjan) {
      yetersiz = true;
      const sonKapasite = temizSalonlar[temizSalonlar.length - 1].kontenjan;
      let eksik = sirali.length - toplamKontenjan;
      let n = 1;
      while (eksik > 0) {
        kullanilacak.push({ id: `ek-salon-${n}`, ad: `Ek Salon ${n}`, kontenjan: sonKapasite, gozetmenler: [], ek: true });
        eksik -= sonKapasite;
        n++;
      }
    }

    const sonuc = kullanilacak.map((s) => ({ salon: s, ogrenciler: [] }));
    if (mod === 'dengeli') {
      // Kontenjanla orantılı pay: pay_i = N * kontenjan_i / toplam, kalan en büyük kesirlere verilir; kontenjan aşılmaz.
      const toplam = kullanilacak.reduce((t, s) => t + s.kontenjan, 0);
      const n = sirali.length;
      const paylar = kullanilacak.map((s) => Math.min(s.kontenjan, Math.floor((n * s.kontenjan) / toplam)));
      let kalan = n - paylar.reduce((t, p) => t + p, 0);
      const kesirler = kullanilacak
        .map((s, i) => ({ i, k: (n * s.kontenjan) / toplam - Math.floor((n * s.kontenjan) / toplam) }))
        .sort((a, b) => b.k - a.k);
      for (let tur = 0; kalan > 0 && tur < 1000; tur++) {
        for (const { i } of kesirler) {
          if (kalan <= 0) break;
          if (paylar[i] < kullanilacak[i].kontenjan) { paylar[i]++; kalan--; }
        }
      }
      let konum = 0;
      paylar.forEach((p, i) => {
        sonuc[i].ogrenciler = sirali.slice(konum, konum + p);
        konum += p;
      });
    } else {
      let konum = 0;
      for (const kayit of sonuc) {
        kayit.ogrenciler = sirali.slice(konum, konum + kayit.salon.kontenjan);
        konum += kayit.salon.kontenjan;
      }
    }

    return {
      yerlesim: sonuc.filter((k) => k.ogrenciler.length > 0 || !k.salon.ek),
      toplamOgrenci: sirali.length,
      toplamKontenjan,
      yetersiz,
      ekSalonSayisi: kullanilacak.filter((s) => s.ek).length
    };
  }

  /* ------------------------------------------------------------------------
     DERS SİLME & SORU ARŞİVİ (HAVUZU) KORUMA MOTORU
     Ders silindiğinde sorular ASLA silinmez; silinen dersin kimliği, kodu ve
     adıyla arşivlenir. Yeni ders oluşturulduğunda veya mevcut bir derse
     arşivden seçim yapıldığında sorular eksiksiz geri dahil edilir.
     ------------------------------------------------------------------------ */
  function arsivleDersVeSorulariKorun(dersler = [], sorular = [], arsivDersler = [], silinecekDersId = '') {
    const mevcutDersler = Array.isArray(dersler) ? dersler.slice() : [];
    const mevcutSorular = Array.isArray(sorular) ? sorular.map((s) => ({ ...s })) : [];
    const mevcutArsiv = Array.isArray(arsivDersler) ? arsivDersler.slice() : [];

    const silinen = mevcutDersler.find((d) => d && d.id === silinecekDersId);
    if (!silinen) {
      return {
        dersler: mevcutDersler,
        sorular: mevcutSorular,
        arsivDersler: mevcutArsiv,
        yeniAktifDersId: (mevcutDersler[0] && mevcutDersler[0].id) || '',
        korunanSoruSayisi: 0,
        silinenDers: null
      };
    }

    let korunanSoruSayisi = 0;
    mevcutSorular.forEach((s) => {
      if (s.dersId === silinecekDersId) {
        s.arsivde = true;
        s.arsivDersId = silinen.id;
        s.arsivDersKod = silinen.kod || 'ARŞİV';
        s.arsivDersAd = silinen.ad || 'Arşivlenen Ders';
        korunanSoruSayisi++;
      }
    });

    const kalanArsiv = mevcutArsiv.filter((a) => a && a.id !== silinen.id);
    kalanArsiv.push({
      id: silinen.id,
      kod: silinen.kod || 'ARŞİV',
      ad: silinen.ad || 'Arşivlenen Ders',
      fakulte: silinen.fakulte || silinen.bolum || 'Genel Bölüm',
      bolum: silinen.bolum || 'Genel Bölüm',
      ogretimElemani: silinen.ogretimElemani || 'Öğretim Elemanı',
      silinmeTarihi: new Date().toISOString(),
      soruSayisi: korunanSoruSayisi
    });

    const kalanDersler = mevcutDersler.filter((d) => d && d.id !== silinecekDersId);
    if (kalanDersler.length === 0) {
      kalanDersler.push({
        id: 'ders-genel-' + Date.now(),
        kod: 'GENEL101',
        ad: 'Yeni Ders (Soru Arşivi Hazır)',
        fakulte: 'Genel Bölüm',
        bolum: 'Genel Bölüm',
        ogretimElemani: 'Öğretim Elemanı'
      });
    }

    return {
      dersler: kalanDersler,
      sorular: mevcutSorular,
      arsivDersler: kalanArsiv,
      yeniAktifDersId: kalanDersler[0].id,
      korunanSoruSayisi,
      silinenDers: silinen
    };
  }

  function listeleArsivSoruHavuzlari(dersler = [], sorular = [], arsivDersler = []) {
    const aktifIdSet = new Set((Array.isArray(dersler) ? dersler : []).map((d) => d && d.id).filter(Boolean));
    const arsivHarita = new Map();
    (Array.isArray(arsivDersler) ? arsivDersler : []).forEach((a) => {
      if (a && a.id && !aktifIdSet.has(a.id)) {
        arsivHarita.set(a.id, {
          arsivId: a.id,
          kod: a.kod || 'ARŞİV',
          ad: a.ad || 'Arşivlenen Ders',
          bolum: a.bolum || 'Genel Bölüm',
          silinmeTarihi: a.silinmeTarihi || '',
          toplam: 0,
          dy: 0,
          test: 0,
          klasik: 0,
          soruIdleri: []
        });
      }
    });

    (Array.isArray(sorular) ? sorular : []).forEach((s) => {
      if (!s || s.dersId === 'genel') return;
      const aktifDersteMi = aktifIdSet.has(s.dersId) && !s.arsivde;
      if (aktifDersteMi) return;
      const anahtar = s.arsivDersId || s.dersId || 'arsiv-genel';
      if (!arsivHarita.has(anahtar)) {
        arsivHarita.set(anahtar, {
          arsivId: anahtar,
          kod: s.arsivDersKod || anahtar.toUpperCase(),
          ad: s.arsivDersAd || 'Silinen Ders Arşivi',
          bolum: 'Arşiv',
          silinmeTarihi: '',
          toplam: 0,
          dy: 0,
          test: 0,
          klasik: 0,
          soruIdleri: []
        });
      }
      const kayit = arsivHarita.get(anahtar);
      kayit.toplam++;
      if (s.tur === 'dy') kayit.dy++;
      else if (s.tur === 'test') kayit.test++;
      else if (s.tur === 'klasik') kayit.klasik++;
      kayit.soruIdleri.push(s.id);
    });

    return Array.from(arsivHarita.values()).filter((k) => k.toplam > 0);
  }

  function dahilEtArsivSorulariniDerse(sorular = [], arsivDersler = [], seciliArsivIdleri = [], hedefDersId = '') {
    const seciliSet = new Set((Array.isArray(seciliArsivIdleri) ? seciliArsivIdleri : []).map(String));
    const guncelSorular = (Array.isArray(sorular) ? sorular : []).map((s) => ({ ...s }));
    let aktarilanSoruSayisi = 0;

    if (hedefDersId && seciliSet.size > 0) {
      guncelSorular.forEach((s) => {
        const anahtar = s.arsivDersId || s.dersId;
        if (seciliSet.has(String(anahtar)) || seciliSet.has(String(s.dersId))) {
          s.dersId = hedefDersId;
          s.arsivde = false;
          aktarilanSoruSayisi++;
        }
      });
    }

    const kalanArsiv = (Array.isArray(arsivDersler) ? arsivDersler : []).filter(
      (a) => a && !seciliSet.has(String(a.id))
    );

    return {
      sorular: guncelSorular,
      arsivDersler: kalanArsiv,
      aktarilanSoruSayisi
    };
  }

  function uretBosOgrenciSablonuCSV() {
    const baslik = 'Ogrenci_No;Ad_Soyad;Bolum_Sinif';
    const o1 = '2023104011;Ahmet Yılmaz;Bilgisayar Müh.';
    const o2 = '2023104042;Ayşe Yıldız;Bilgisayar Müh.';
    const o3 = '2022109042;Burak Kaya;Bilgisayar Müh.';
    return '\ufeff' + [baslik, o1, o2, o3].join('\r\n');
  }

  function cozOgrenciListesiCSV(csvMetin) {
    if (typeof csvMetin !== 'string' || !csvMetin.trim()) return [];
    const temiz = csvMetin.replace(/^\ufeff/, '').replace(/\r\n/g, '\n');
    const satirlar = temiz.split('\n').map((s) => s.trim()).filter(Boolean);
    if (satirlar.length === 0) return [];

    const ayirici = tespitEtCsvAyirici(satirlar[0]);
    const baslikMi = /ogrenci|numara|no|ad_soyad/i.test(satirlar[0]);
    const baslangic = baslikMi ? 1 : 0;
    const liste = [];

    for (let i = baslangic; i < satirlar.length; i++) {
      const h = ayirCsvSatiri(satirlar[i], ayirici);
      if (h.length >= 2 && h[0] && h[1]) {
        liste.push({
          ogrNo: h[0].trim(),
          adSoyad: h[1].trim(),
          bolum: (h[2] || 'Genel').trim()
        });
      }
    }
    return liste;
  }

  /* ------------------------------------------------------------------------
     ÖĞRENCİ LİSTESİ ÇİFT YÖNLÜ QR PAKET ÜRETİCİ VE ÇÖZÜCÜ
     (Telefondan -> Bilgisayara ve Bilgisayardan -> Telefona QR Aktarımı)
     ------------------------------------------------------------------------ */
  function utf8ToBase64Guvenli(metin) {
    const dizge = String(metin || '');
    if (typeof btoa === 'function') {
      return btoa(unescape(encodeURIComponent(dizge)));
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(dizge, 'utf8').toString('base64');
    }
    return '';
  }

  function base64ToUtf8Guvenli(b64) {
    const temiz = String(b64 || '').trim().replace(/\s+/g, '');
    if (!temiz) return '';
    if (typeof atob === 'function') {
      return decodeURIComponent(escape(atob(temiz)));
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(temiz, 'base64').toString('utf8');
    }
    return '';
  }

  function uretOgrenciQrPaketi(ogrenciler = [], secenekler = {}) {
    const temizListe = (Array.isArray(ogrenciler) ? ogrenciler : [])
      .filter((o) => o && String(o.ogrNo || '').trim() && String(o.adSoyad || '').trim())
      .map((o) => ({
        ogrNo: String(o.ogrNo).trim().replace(/;/g, ''),
        adSoyad: String(o.adSoyad).trim().replace(/;/g, ' '),
        bolum: String(o.bolum || '').trim().replace(/;/g, ' ')
      }));

    const tabanAdres = String(secenekler.tabanAdres || '').trim().replace(/\/+$/, '');
    const hedefSayfa = String(secenekler.hedefSayfa || 'optik-mobil.html').trim() || 'optik-mobil.html';
    const parcaBoyutu = Math.max(
      10,
      Math.min(60, parseInt(secenekler.parcaBoyutu || secenekler.maksDilimBoyutu, 10) || 25)
    );

    const satirKodla = (liste) =>
      liste
        .map((o) => (o.bolum && o.bolum !== 'Genel' ? `${o.ogrNo};${o.adSoyad};${o.bolum}` : `${o.ogrNo};${o.adSoyad}`))
        .join('\n');

    const tamMetin = satirKodla(temizListe);
    const tamB64 = utf8ToBase64Guvenli(tamMetin);
    const kodlanmisB64 = encodeURIComponent(tamB64);

    const urlBilgisayar = `${tabanAdres ? tabanAdres + '/index.html' : 'index.html'}#ogr=${kodlanmisB64}`;
    const urlTelefon = `${tabanAdres ? tabanAdres + '/optik-mobil.html' : 'optik-mobil.html'}#ogr=${kodlanmisB64}`;
    const tekUrl = `${tabanAdres ? tabanAdres + '/' + hedefSayfa : hedefSayfa}#ogr=${kodlanmisB64}`;
    const tamPaketKodu = `OGR-QR|1/1|${tamB64}`;

    const parcalar = [];
    const toplamParca = Math.max(1, Math.ceil(temizListe.length / parcaBoyutu));
    for (let i = 0; i < toplamParca; i++) {
      const dilim = temizListe.slice(i * parcaBoyutu, (i + 1) * parcaBoyutu);
      const dilimMetin = satirKodla(dilim);
      const dilimB64 = utf8ToBase64Guvenli(dilimMetin);
      const dilimKodlanmis = encodeURIComponent(dilimB64);
      const parcaNo = i + 1;
      const paketKodu = `OGR-QR|${parcaNo}/${toplamParca}|${dilimB64}`;
      const dilimUrlBilgisayar = `${tabanAdres ? tabanAdres + '/index.html' : 'index.html'}#ogr=${dilimKodlanmis}`;
      const dilimUrlTelefon = `${tabanAdres ? tabanAdres + '/optik-mobil.html' : 'optik-mobil.html'}#ogr=${dilimKodlanmis}`;
      const dilimUrl = `${tabanAdres ? tabanAdres + '/' + hedefSayfa : hedefSayfa}#ogr=${dilimKodlanmis}`;
      parcalar.push({
        parcaNo,
        toplamParca,
        ogrenciSayisi: dilim.length,
        adet: dilim.length,
        b64: dilimB64,
        paketKodu,
        kod: paketKodu,
        url: dilimUrl,
        urlBilgisayar: dilimUrlBilgisayar,
        urlTelefon: dilimUrlTelefon
      });
    }

    return {
      ogrenciSayisi: temizListe.length,
      toplamOgrenci: temizListe.length,
      b64: tamB64,
      tekBase64: tamB64,
      kodlanmisB64,
      paketKodu: tamPaketKodu,
      kod: tamPaketKodu,
      hashParam: `#ogr=${kodlanmisB64}`,
      url: tekUrl,
      tekUrl,
      urlBilgisayar,
      urlTelefon,
      toplamParca,
      parcalar
    };
  }

  function cozOgrenciQrPaketi(girdiMetni = '') {
    const ham = String(girdiMetni || '').trim();
    if (!ham) {
      return { gecerli: false, ogrenciler: [], parcaNo: 1, toplamParca: 1, hata: 'Boş QR verisi.' };
    }

    let parcaNo = 1;
    let toplamParca = 1;
    let b64Aday = '';
    let duzMetinAday = '';

    // 1. OGR-QR|p/t|<base64> veya OGR-QR|<base64> formatı
    if (ham.startsWith('OGR-QR|')) {
      const bolumler = ham.split('|');
      if (bolumler.length >= 3 && /^\d+\/\d+$/.test(bolumler[1])) {
        const [p, t] = bolumler[1].split('/').map((n) => parseInt(n, 10) || 1);
        parcaNo = p;
        toplamParca = t;
        b64Aday = bolumler.slice(2).join('|').trim();
      } else {
        b64Aday = bolumler.slice(1).join('|').trim();
      }
    } else if (ham.includes('#ogr=')) {
      // 2. Tam URL veya #ogr=<base64> hash formatı
      const idx = ham.indexOf('#ogr=');
      const parca = ham.slice(idx + 5).split('&')[0].trim();
      try {
        b64Aday = decodeURIComponent(parca);
      } catch (_) {
        b64Aday = parca;
      }
    } else if (ham.startsWith('ogr=')) {
      const parca = ham.slice(4).split('&')[0].trim();
      try {
        b64Aday = decodeURIComponent(parca);
      } catch (_) {
        b64Aday = parca;
      }
    } else if (ham.includes(';') && /\d{3,}/.test(ham)) {
      // 3. Doğrudan noktalı virgüllü öğrenci satırları
      duzMetinAday = ham;
    } else {
      // 4. Doğrudan Base64 dizgesi
      try {
        b64Aday = decodeURIComponent(ham);
      } catch (_) {
        b64Aday = ham;
      }
    }

    if (b64Aday && !duzMetinAday) {
      try {
        duzMetinAday = base64ToUtf8Guvenli(b64Aday);
      } catch (_) {
        duzMetinAday = '';
      }
    }

    if (!duzMetinAday) {
      return { gecerli: false, ogrenciler: [], parcaNo, toplamParca, hata: 'QR öğrenci paketi çözümlenemedi.' };
    }

    const ogrenciler = [];
    const gorulenNo = new Set();
    const satirlar = duzMetinAday.replace(/^\ufeff/, '').replace(/\r\n/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
    for (const s of satirlar) {
      if (/^ogrenci_no|^numara/i.test(s)) continue;
      let ogrNo = '';
      let adSoyad = '';
      let bolum = 'Genel';
      if (s.includes(';')) {
        const p = s.split(';').map((x) => x.trim());
        ogrNo = p[0] || '';
        adSoyad = p[1] || '';
        bolum = p[2] || 'Genel';
      } else if (s.includes(',')) {
        const p = s.split(',').map((x) => x.trim());
        ogrNo = p[0] || '';
        adSoyad = p[1] || '';
        bolum = p[2] || 'Genel';
      } else {
        const p = s.split(/\s+/);
        if (p.length >= 2) {
          ogrNo = p[0];
          adSoyad = p.slice(1).join(' ');
        }
      }
      if (ogrNo && adSoyad && !gorulenNo.has(ogrNo)) {
        gorulenNo.add(ogrNo);
        ogrenciler.push({ ogrNo, adSoyad, bolum: bolum || 'Genel' });
      }
    }

    if (ogrenciler.length === 0) {
      return { gecerli: false, ogrenciler: [], parcaNo, toplamParca, hata: 'QR paketi içinde geçerli öğrenci kaydı bulunamadı.' };
    }

    return {
      gecerli: true,
      ogrenciler,
      ogrenciSayisi: ogrenciler.length,
      parcaNo,
      toplamParca,
      hata: ''
    };
  }

  /* Sınav Cevap Anahtarı ve Yapısını Telefon QR'ına Sığacak Kompakt Formatta Üretme & Çözme */
  function uretKompaktSetupQrPaketi(yapi = {}, ogrenciler = [], tabanAdres = '') {
    const anahtarlar = {};
    for (const g of ['A', 'B', 'C', 'D']) {
      const a = (yapi.cevapAnahtarlari && yapi.cevapAnahtarlari[g]) || { dy: [], test: [] };
      anahtarlar[g] = {
        dy: Array.isArray(a.dy) ? a.dy.join('') : String(a.dy || ''),
        test: Array.isArray(a.test) ? a.test.join('') : String(a.test || '')
      };
    }

    const dersAdStr = yapi.ders
      ? `${yapi.ders.kod || 'DERS'} - ${yapi.ders.ad || 'Sınav'}`
      : String(yapi.dersAd || 'Sınav');

    const temelPaket = {
      sinavKodu: String(yapi.sinavKodu || 'SINAV-2026'),
      dersAd: dersAdStr.slice(0, 60),
      dySayisi: Number(yapi.dySayisi) || 0,
      dySoruPuan: Number(yapi.dySoruPuan) || 2,
      testSayisi: Number(yapi.testSayisi) || 0,
      testSoruPuan: Number(yapi.testSoruPuan) || 4,
      sikSayisi: Number(yapi.sikSayisi) || 5,
      klasikSayisi: Number(yapi.klasikSayisi) || 0,
      klasikSoruPuan: Number(yapi.klasikSoruPuan) || 10,
      kimlikModu: String(yapi.kimlikModu || 'son2'),
      haneSayisi: Number(yapi.haneSayisi) || 2,
      cevapAnahtarlari: anahtarlar
    };

    const temizTaban = String(tabanAdres || '').trim().replace(/\/+$/, '');
    const ogrKisa = (Array.isArray(ogrenciler) ? ogrenciler : [])
      .filter((o) => o && o.ogrNo && o.adSoyad)
      .map((o) => [String(o.ogrNo).trim(), String(o.adSoyad).trim().slice(0, 28)]);

    const kodlaUrl = (nesne) => {
      const b64 = utf8ToBase64Guvenli(JSON.stringify(nesne));
      const kodlu = encodeURIComponent(b64);
      const tamUrl = `${temizTaban ? temizTaban + '/optik-mobil.html' : 'optik-mobil.html'}#setup=${kodlu}`;
      return {
        b64,
        encoded: kodlu,
        hashHref: `optik-mobil.html#setup=${kodlu}`,
        url: tamUrl,
        tamUrl
      };
    };

    // Eğer öğrenci listesi <= 25 ise ve QR boyutu 1100 karakteri aşmıyorsa öğrenci listesini de aynı QR içine göm
    if (ogrKisa.length > 0 && ogrKisa.length <= 25) {
      const birlikte = kodlaUrl({ ...temelPaket, ogrKisa });
      if (birlikte.tamUrl.length <= 1150) {
        return {
          ...birlikte,
          ogrenciDahilMi: true,
          ogrenciSayisi: ogrKisa.length,
          not: `Sınav cevap anahtarı (A/B/C/D) ve ${ogrKisa.length} kişilik öğrenci listesi tek QR içine sığdırıldı.`
        };
      }
    }

    const sadeceSetup = kodlaUrl(temelPaket);
    return {
      ...sadeceSetup,
      ogrenciDahilMi: false,
      ogrenciSayisi: ogrKisa.length,
      not: ogrKisa.length > 0
        ? `Cevap anahtarı QR'a işlendi (${ogrKisa.length} öğrenci için yan sekmedeki Öğrenci QR'ını okutabilirsiniz).`
        : 'Sınav cevap anahtarı (A/B/C/D) ve puan yapısı QR içine işlendi.'
    };
  }

  function cozKompaktSetupQrPaketi(girdi = '') {
    let ham = String(girdi || '').trim();
    if (!ham) return null;
    if (ham.includes('#setup=')) {
      ham = ham.slice(ham.indexOf('#setup=') + 7).split('&')[0];
    } else if (ham.startsWith('setup=')) {
      ham = ham.slice(6).split('&')[0];
    }
    try {
      const jsonStr = base64ToUtf8Guvenli(decodeURIComponent(ham));
      const v = JSON.parse(jsonStr);
      if (!v || typeof v !== 'object' || Array.isArray(v)) return null;

      // Şema ve sınır doğrulaması (0 <= dySayisi <= 50, 0 <= testSayisi <= 100, geçerli harfler)
      if (v.dySayisi !== undefined) {
        const dyN = Number(v.dySayisi);
        if (!Number.isFinite(dyN) || dyN < 0 || dyN > 50) return null;
        v.dySayisi = Math.round(dyN);
      }
      if (v.testSayisi !== undefined) {
        const testN = Number(v.testSayisi);
        if (!Number.isFinite(testN) || testN < 0 || testN > 100) return null;
        v.testSayisi = Math.round(testN);
      }
      if (v.klasikSayisi !== undefined) {
        const klN = Number(v.klasikSayisi);
        if (!Number.isFinite(klN) || klN < 0 || klN > 20) return null;
        v.klasikSayisi = Math.round(klN);
      }
      if ((v.dySayisi || 0) === 0 && (v.testSayisi || 0) === 0 && (v.klasikSayisi || 0) === 0) {
        return null;
      }

      if (v.cevapAnahtarlari && typeof v.cevapAnahtarlari === 'object') {
        for (const g of ['A', 'B', 'C', 'D']) {
          const a = v.cevapAnahtarlari[g];
          if (a) {
            const dyDizi = Array.isArray(a.dy) ? a.dy : String(a.dy || '').split('').filter(Boolean);
            const testDizi = Array.isArray(a.test) ? a.test : String(a.test || '').split('').filter(Boolean);
            if (dyDizi.some((ch) => !['D', 'Y'].includes(String(ch).toUpperCase()))) return null;
            if (testDizi.some((ch) => !['A', 'B', 'C', 'D', 'E'].includes(String(ch).toUpperCase()))) return null;
            a.dy = dyDizi.map((ch) => String(ch).toUpperCase());
            a.test = testDizi.map((ch) => String(ch).toUpperCase());
            if (!Array.isArray(a.klasik)) a.klasik = [];
          }
        }
      }
      if (Array.isArray(v.ogrKisa) && !Array.isArray(v.ogrenciler)) {
        v.ogrenciler = v.ogrKisa
          .filter((x) => Array.isArray(x) && x[0] && x[1])
          .map((x) => ({ ogrNo: String(x[0]), adSoyad: String(x[1]), bolum: 'Genel' }));
      }
      return v;
    } catch (_) {
      return null;
    }
  }

  /* Mobil Optik Okuyucudan (optik-mobil.html) Bilgisayar Stüdyosuna (index.html)
     Madde Analizi (pj/rjx) ve ÖÇ Karnesi İçin Detaylı Okuma Sonuçları Aktarım Paketi */
  function dogrulaVeTemizleOmrSonucKaydi(s, idx = 0, sinirlar = {}) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    const ogrNo = String(s.ogrNo !== undefined ? s.ogrNo : (s.no !== undefined ? s.no : '')).trim();
    if (!ogrNo || ogrNo.length > 40 || ogrNo.includes('?')) return null;
    const okunanNoKod = String(s.okunanNoKod !== undefined ? s.okunanNoKod : ogrNo.slice(-2)).trim();

    const hamGrup = String(s.grup !== undefined ? s.grup : (s.g !== undefined ? s.g : 'A')).trim().toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(hamGrup)) return null;

    const hamPuan = s.toplamPuan !== undefined ? Number(s.toplamPuan) : (s.p !== undefined ? Number(s.p) : NaN);
    if (!Number.isFinite(hamPuan) || hamPuan < 0 || hamPuan > 100) return null;

    const dyNet = Number(s.dyNet !== undefined ? s.dyNet : (s.dn !== undefined ? s.dn : 0));
    const testNet = Number(s.testNet !== undefined ? s.testNet : (s.tn !== undefined ? s.tn : 0));
    const klasikToplamPuan = Number(s.klasikToplamPuan !== undefined ? s.klasikToplamPuan : (s.kp !== undefined ? s.kp : 0));
    if (!Number.isFinite(dyNet) || !Number.isFinite(testNet) || !Number.isFinite(klasikToplamPuan)) return null;
    if (dyNet < -50 || dyNet > 100 || testNet < -100 || testNet > 200) return null;
    if (klasikToplamPuan < 0 || klasikToplamPuan > 100) return null;

    const azamiDy = Number.isInteger(sinirlar.azamiDy) && sinirlar.azamiDy >= 0 ? sinirlar.azamiDy : 50;
    const azamiTest = Number.isInteger(sinirlar.azamiTest) && sinirlar.azamiTest >= 0 ? sinirlar.azamiTest : 200;
    const azamiKlasik = Number.isInteger(sinirlar.azamiKlasik) && sinirlar.azamiKlasik >= 0 ? sinirlar.azamiKlasik : 25;
    const azamiKlasikTekPuan = Number.isFinite(sinirlar.azamiKlasikTekPuan) && sinirlar.azamiKlasikTekPuan > 0
      ? Math.min(100, Number(sinirlar.azamiKlasikTekPuan))
      : 100;

    const gecerliSonuclar = new Set(['DOGRU', 'YANLIS', 'BOS', 'COKLU', 'CIFT']);
    const gecerliDyVerilen = new Set(['', 'D', 'Y', 'COKLU', 'CIFT', 'ÇİFT', '*']);
    const gecerliTestVerilen = new Set(['', 'A', 'B', 'C', 'D', 'E', 'COKLU', 'CIFT', 'ÇİFT', '*']);

    let dyDetay = [];
    if (Array.isArray(s.dyDetay)) {
      if (s.dyDetay.length > azamiDy) return null;
      const gorulenNo = new Set();
      for (let i = 0; i < s.dyDetay.length; i++) {
        const d = s.dyDetay[i];
        if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
        const soruNo = d.soruNo !== undefined ? Number(d.soruNo) : (i + 1);
        if (!Number.isInteger(soruNo) || soruNo < 1 || soruNo > Math.max(1, azamiDy) || gorulenNo.has(soruNo)) return null;
        gorulenNo.add(soruNo);
        const hamVerilen = d.verilen === null || d.verilen === undefined ? '' : String(d.verilen).trim().toUpperCase();
        const verilenNorm = (hamVerilen === '-' || hamVerilen === 'BOS') ? '' : hamVerilen;
        if (!gecerliDyVerilen.has(verilenNorm)) return null;
        const sonucNorm = String(d.sonuc !== undefined ? d.sonuc : (verilenNorm ? 'YANLIS' : 'BOS')).trim().toUpperCase();
        if (!gecerliSonuclar.has(sonucNorm)) return null;
        const iptalMi = Boolean(d.iptalMi || verilenNorm === '*');
        const cokluMu = verilenNorm === 'COKLU' || verilenNorm === 'CIFT' || verilenNorm === 'ÇİFT';
        if ((verilenNorm === '' || cokluMu) && sonucNorm === 'DOGRU' && !iptalMi) return null;
        dyDetay.push({
          soruNo,
          verilen: verilenNorm === '*' ? '' : verilenNorm,
          sonuc: sonucNorm === 'CIFT' ? 'COKLU' : sonucNorm,
          ...(iptalMi ? { iptalMi: true } : {}),
          ...(d.dogruCevap !== undefined ? { dogruCevap: String(d.dogruCevap).slice(0, 12) } : {}),
          ...(Number.isFinite(Number(d.guven)) ? { guven: Number(d.guven) } : {}),
          ...(d.supheli ? { supheli: true } : {})
        });
      }
    } else if (typeof s.dy === 'string' && s.dy.trim()) {
      const parcalar = s.dy.split(',').filter(Boolean);
      if (parcalar.length > azamiDy) return null;
      for (let i = 0; i < parcalar.length; i++) {
        const [verilenHam, dBayrak] = parcalar[i].split(':');
        const vUst = String(verilenHam || '').trim().toUpperCase();
        const iptalMi = vUst === '*';
        const verilen = (vUst === '-' || vUst === 'BOS' || vUst === '*') ? '' : vUst;
        if (!gecerliDyVerilen.has(verilen)) return null;
        if (dBayrak !== '0' && dBayrak !== '1') return null;
        const cokluMu = verilen === 'COKLU' || verilen === 'CIFT' || verilen === 'ÇİFT';
        if ((verilen === '' || cokluMu) && dBayrak === '1' && !iptalMi) return null;
        dyDetay.push({
          soruNo: i + 1,
          verilen,
          sonuc: dBayrak === '1' ? 'DOGRU' : (verilen === '' ? 'BOS' : 'YANLIS'),
          ...(iptalMi ? { iptalMi: true } : {})
        });
      }
    }

    let testDetay = [];
    if (Array.isArray(s.testDetay)) {
      if (s.testDetay.length > azamiTest) return null;
      const gorulenNo = new Set();
      for (let i = 0; i < s.testDetay.length; i++) {
        const d = s.testDetay[i];
        if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
        const soruNo = d.soruNo !== undefined ? Number(d.soruNo) : (i + 1);
        if (!Number.isInteger(soruNo) || soruNo < 1 || soruNo > Math.max(1, azamiTest) || gorulenNo.has(soruNo)) return null;
        gorulenNo.add(soruNo);
        const hamVerilen = d.verilen === null || d.verilen === undefined ? '' : String(d.verilen).trim().toUpperCase();
        const verilenNorm = (hamVerilen === '-' || hamVerilen === 'BOS') ? '' : hamVerilen;
        if (!gecerliTestVerilen.has(verilenNorm)) return null;
        const sonucNorm = String(d.sonuc !== undefined ? d.sonuc : (verilenNorm ? 'YANLIS' : 'BOS')).trim().toUpperCase();
        if (!gecerliSonuclar.has(sonucNorm)) return null;
        const iptalMi = Boolean(d.iptalMi || verilenNorm === '*');
        const cokluMu = verilenNorm === 'COKLU' || verilenNorm === 'CIFT' || verilenNorm === 'ÇİFT';
        if ((verilenNorm === '' || cokluMu) && sonucNorm === 'DOGRU' && !iptalMi) return null;
        testDetay.push({
          soruNo,
          verilen: verilenNorm === '*' ? '' : verilenNorm,
          sonuc: sonucNorm === 'CIFT' ? 'COKLU' : sonucNorm,
          ...(iptalMi ? { iptalMi: true } : {}),
          ...(d.dogruCevap !== undefined ? { dogruCevap: String(d.dogruCevap).slice(0, 12) } : {}),
          ...(Number.isFinite(Number(d.guven)) ? { guven: Number(d.guven) } : {}),
          ...(d.supheli ? { supheli: true } : {})
        });
      }
    } else if (typeof s.t === 'string' && s.t.trim()) {
      const parcalar = s.t.split(',').filter(Boolean);
      if (parcalar.length > azamiTest) return null;
      for (let i = 0; i < parcalar.length; i++) {
        const [verilenHam, dBayrak] = parcalar[i].split(':');
        const vUst = String(verilenHam || '').trim().toUpperCase();
        const iptalMi = vUst === '*';
        const verilen = (vUst === '-' || vUst === 'BOS' || vUst === '*') ? '' : vUst;
        if (!gecerliTestVerilen.has(verilen)) return null;
        if (dBayrak !== '0' && dBayrak !== '1') return null;
        const cokluMu = verilen === 'COKLU' || verilen === 'CIFT' || verilen === 'ÇİFT';
        if ((verilen === '' || cokluMu) && dBayrak === '1' && !iptalMi) return null;
        testDetay.push({
          soruNo: i + 1,
          verilen,
          sonuc: dBayrak === '1' ? 'DOGRU' : (verilen === '' ? 'BOS' : 'YANLIS'),
          ...(iptalMi ? { iptalMi: true } : {})
        });
      }
    }

    let klasikDetay = [];
    let klasikDetayToplam = 0;
    if (Array.isArray(s.klasikDetay)) {
      if (s.klasikDetay.length > azamiKlasik) return null;
      const gorulenNo = new Set();
      for (let i = 0; i < s.klasikDetay.length; i++) {
        const k = s.klasikDetay[i];
        if (!k || typeof k !== 'object' || Array.isArray(k)) return null;
        const soruNo = k.soruNo !== undefined ? Number(k.soruNo) : (i + 1);
        if (!Number.isInteger(soruNo) || soruNo < 1 || soruNo > Math.max(1, azamiKlasik) || gorulenNo.has(soruNo)) return null;
        gorulenNo.add(soruNo);
        const verilenPuan = k.verilenPuan !== undefined ? Number(k.verilenPuan) : NaN;
        if (!Number.isFinite(verilenPuan) || verilenPuan < 0 || verilenPuan > azamiKlasikTekPuan) return null;
        klasikDetayToplam += verilenPuan;
        klasikDetay.push({
          soruNo,
          verilenPuan: Number(verilenPuan.toFixed(2)),
          ...(Number.isFinite(Number(k.guven)) ? { guven: Number(k.guven) } : {})
        });
      }
    } else if (Array.isArray(s.kl)) {
      if (s.kl.length > azamiKlasik) return null;
      for (let i = 0; i < s.kl.length; i++) {
        const verilenPuan = Number(s.kl[i]);
        if (!Number.isFinite(verilenPuan) || verilenPuan < 0 || verilenPuan > azamiKlasikTekPuan) return null;
        klasikDetayToplam += verilenPuan;
        klasikDetay.push({
          soruNo: i + 1,
          verilenPuan: Number(verilenPuan.toFixed(2))
        });
      }
    }
    if (klasikDetayToplam > 100.01) return null;

    const kayitliListe = Array.isArray(sinirlar.ogrenciler) ? sinirlar.ogrenciler : null;
    const listedeVarMi = kayitliListe
      ? kayitliListe.some((o) => o && String(o.ogrNo || '').trim() === ogrNo)
      : !Boolean(s.numaraEslesmediMi);
    const kimlikEslesmeBekliyor = Boolean(s.numaraEslesmediMi || s.kimlikEslesmeBekliyor || (kayitliListe && kayitliListe.length > 0 && !listedeVarMi));

    const incelemeKuyrugu = Array.isArray(s.incelemeKuyrugu)
      ? s.incelemeKuyrugu.filter((u) => u && typeof u === 'object').slice(0, 50)
      : [];
    if (kimlikEslesmeBekliyor && !incelemeKuyrugu.some((u) => String(u.alan || '').includes('Öğrenci No'))) {
      incelemeKuyrugu.unshift({ alan: 'Öğrenci No Eşleşmesi', detay: `"${ogrNo}" numarası aktif sınıf listesinde eşleşmedi (Hoca Onayı Bekliyor).` });
    }

    return {
      id: String(s.id || `mobil-aktarim-${Date.now()}-${idx}`),
      ogrNo,
      okunanNoKod: okunanNoKod || ogrNo.slice(-2),
      adSoyad: String(s.adSoyad !== undefined ? s.adSoyad : (s.ad !== undefined ? s.ad : 'Öğrenci')).slice(0, 80),
      grup: hamGrup,
      toplamPuan: Number(hamPuan.toFixed(2)),
      dyNet: Number(dyNet.toFixed(2)),
      testNet: Number(testNet.toFixed(2)),
      dyDogru: s.dyDogru !== undefined ? Number(s.dyDogru) : dyDetay.filter((x) => x.sonuc === 'DOGRU').length,
      dyYanlis: s.dyYanlis !== undefined ? Number(s.dyYanlis) : dyDetay.filter((x) => x.sonuc === 'YANLIS').length,
      testDogru: s.testDogru !== undefined ? Number(s.testDogru) : testDetay.filter((x) => x.sonuc === 'DOGRU').length,
      testYanlis: s.testYanlis !== undefined ? Number(s.testYanlis) : testDetay.filter((x) => x.sonuc === 'YANLIS').length,
      klasikToplamPuan: Number(klasikToplamPuan.toFixed(2)),
      dyDetay,
      testDetay,
      klasikDetay,
      numaraEslesmediMi: kimlikEslesmeBekliyor,
      kimlikEslesmeBekliyor,
      supheliMi: Boolean(s.supheliMi || kimlikEslesmeBekliyor),
      incelemeKuyrugu
    };
  }

  function uretOmrSonucPaketi(okumaSonuclari = [], sinavKoduVeyaYapi = 'SINAV-2026', tabanAdresVeyaAyar = '') {
    const sinavKodu = (sinavKoduVeyaYapi && typeof sinavKoduVeyaYapi === 'object')
      ? String(sinavKoduVeyaYapi.sinavKodu || sinavKoduVeyaYapi.sinavId || sinavKoduVeyaYapi.kod || 'SINAV-2026')
      : String(sinavKoduVeyaYapi || 'SINAV-2026');
    const sinavSurumId = (sinavKoduVeyaYapi && typeof sinavKoduVeyaYapi === 'object' && sinavKoduVeyaYapi.sinavSurumId)
      ? String(sinavKoduVeyaYapi.sinavSurumId)
      : '';
    const tabanHam = (tabanAdresVeyaAyar && typeof tabanAdresVeyaAyar === 'object')
      ? String(tabanAdresVeyaAyar.tabanAdres || '')
      : String(tabanAdresVeyaAyar || '');

    const temizSonuclar = (Array.isArray(okumaSonuclari) ? okumaSonuclari : [])
      .map((s, idx) => dogrulaVeTemizleOmrSonucKaydi(s, idx))
      .filter(Boolean);

    const hafifListe = temizSonuclar.map((s) => ({
      no: String(s.ogrNo || ''),
      ad: String(s.adSoyad || '').slice(0, 32),
      g: String(s.grup || 'A').toUpperCase(),
      p: Number(s.toplamPuan || 0),
      dn: Number(s.dyNet || 0),
      tn: Number(s.testNet || 0),
      kp: Number(s.klasikToplamPuan || 0),
      ...(s.kimlikEslesmeBekliyor ? { ke: 1 } : {}),
      dy: (Array.isArray(s.dyDetay) ? s.dyDetay : []).map((d) => {
        const sembol = d.iptalMi && !d.verilen ? '*' : (d.verilen || '-');
        return `${sembol}:${d.sonuc === 'DOGRU' ? '1' : '0'}`;
      }).join(','),
      t: (Array.isArray(s.testDetay) ? s.testDetay : []).map((d) => {
        const sembol = d.iptalMi && !d.verilen ? '*' : (d.verilen || '-');
        return `${sembol}:${d.sonuc === 'DOGRU' ? '1' : '0'}`;
      }).join(','),
      kl: (Array.isArray(s.klasikDetay) ? s.klasikDetay : []).map((k) => Number(k.verilenPuan || 0))
    }));

    const nesne = {
      v: 1,
      kod: sinavKodu,
      ...(sinavSurumId ? { surum: sinavSurumId } : {}),
      zaman: new Date().toISOString(),
      kayitlar: hafifListe
    };
    const b64 = utf8ToBase64Guvenli(JSON.stringify(nesne));
    const temizTaban = tabanHam.trim().replace(/\/+$/, '');
    const urlBilgisayar = `${temizTaban ? temizTaban + '/index.html' : 'index.html'}#omr-sonuc=${encodeURIComponent(b64)}`;
    const paketKodu = `OMR-SONUC|${b64}`;
    const jsonMetni = JSON.stringify({
      belgeTuru: 'OMR_DETAYLI_SONUC_PAKETI',
      sinavKodu,
      ...(sinavSurumId ? { sinavSurumId } : {}),
      olusturulmaZamani: nesne.zaman,
      okumaSonuclari: temizSonuclar
    }, null, 2);
    return {
      kayitSayisi: hafifListe.length,
      toplamOkuma: hafifListe.length,
      sinavKodu,
      sinavSurumId,
      paketKodu,
      kod: paketKodu,
      urlBilgisayar,
      okumaSonuclari: temizSonuclar,
      sonuclar: temizSonuclar,
      jsonMetni,
      jsonMetin: jsonMetni
    };
  }

  function cozOmrSonucPaketi(girdi = '', sinirlar = {}) {
    if (girdi === null || girdi === undefined) {
      return { gecerli: false, okumaSonuclari: [], sonuclar: [], hata: 'Boş OMR sonuç verisi.' };
    }
    try {
      let adayListe = null;
      let sinavKodu = 'SINAV-2026';
      let sinavSurumId = '';

      if (typeof girdi === 'object' && !Array.isArray(girdi)) {
        if (Array.isArray(girdi.okumaSonuclari)) {
          adayListe = girdi.okumaSonuclari;
          sinavKodu = String(girdi.sinavKodu || girdi.kod || 'SINAV-2026');
          sinavSurumId = String(girdi.sinavSurumId || girdi.surum || '');
        } else if (Array.isArray(girdi.sonuclar)) {
          adayListe = girdi.sonuclar;
          sinavKodu = String(girdi.sinavKodu || girdi.kod || 'SINAV-2026');
          sinavSurumId = String(girdi.sinavSurumId || girdi.surum || '');
        } else if (Array.isArray(girdi.kayitlar)) {
          adayListe = girdi.kayitlar.map((k) => (k && k.ke ? { ...k, kimlikEslesmeBekliyor: true } : k));
          sinavKodu = String(girdi.kod || girdi.sinavKodu || 'SINAV-2026');
          sinavSurumId = String(girdi.surum || girdi.sinavSurumId || '');
        } else if (typeof girdi.paket === 'string' || typeof girdi.paketKodu === 'string' || typeof girdi.kod === 'string') {
          const icGirdi = girdi.paket || girdi.paketKodu || (String(girdi.kod || '').startsWith('OMR-SONUC') ? girdi.kod : '');
          if (icGirdi) return cozOmrSonucPaketi(icGirdi, sinirlar);
          return { gecerli: false, okumaSonuclari: [], sonuclar: [], hata: 'OMR sonuç nesnesi geçersiz.' };
        } else {
          return { gecerli: false, okumaSonuclari: [], sonuclar: [], hata: 'OMR sonuç nesnesi geçersiz.' };
        }
      } else if (Array.isArray(girdi)) {
        adayListe = girdi;
      } else {
        let ham = String(girdi || '').trim();
        if (!ham) return { gecerli: false, okumaSonuclari: [], sonuclar: [], hata: 'Boş OMR sonuç verisi.' };
        if (ham.startsWith('{') || ham.startsWith('[')) {
          const j = JSON.parse(ham);
          return cozOmrSonucPaketi(j, sinirlar);
        }
        if (ham.includes('#omr-sonuc=')) {
          ham = decodeURIComponent(ham.slice(ham.indexOf('#omr-sonuc=') + 11).split('&')[0]);
        } else if (ham.startsWith('OMR-SONUC-V1|')) {
          ham = ham.slice(13).trim();
        } else if (ham.startsWith('OMR-SONUC|')) {
          ham = ham.slice(10).trim();
        }
        const nesne = JSON.parse(base64ToUtf8Guvenli(ham));
        if (!nesne || typeof nesne !== 'object') {
          return { gecerli: false, okumaSonuclari: [], sonuclar: [], hata: 'OMR sonuç paketi formatı geçersiz.' };
        }
        return cozOmrSonucPaketi(nesne, sinirlar);
      }

      if (sinirlar.beklenenSinavSurumId && sinavSurumId && sinirlar.beklenenSinavSurumId !== sinavSurumId) {
        return {
          gecerli: false,
          surumUyusmazligi: true,
          okumaSonuclari: [],
          sonuclar: [],
          hata: `OMR paketi eski sınav sürümüne (${sinavSurumId}) ait; aktif sürüm (${sinirlar.beklenenSinavSurumId}) ile eşleşmiyor.`
        };
      }

      if (!Array.isArray(adayListe) || adayListe.length === 0) {
        return { gecerli: false, okumaSonuclari: [], sonuclar: [], hata: 'OMR sonuç paketinde geçerli öğrenci kaydı bulunamadı.' };
      }

      const okumaSonuclari = [];
      for (let i = 0; i < adayListe.length; i++) {
        const temizKayit = dogrulaVeTemizleOmrSonucKaydi(adayListe[i], i, sinirlar);
        if (!temizKayit) {
          return {
            gecerli: false,
            okumaSonuclari: [],
            sonuclar: [],
            hata: `OMR sonuç paketindeki ${i + 1}. kayıt şema ve alt-alan doğrulamasından geçemedi (boş öğrenci no, geçersiz grup, soru no/şık veya puan sınırı ihlali).`
          };
        }
        okumaSonuclari.push(temizKayit);
      }

      return {
        gecerli: true,
        okumaSonuclari,
        sonuclar: okumaSonuclari,
        kayitSayisi: okumaSonuclari.length,
        toplamOkuma: okumaSonuclari.length,
        sinavKodu,
        sinavSurumId
      };
    } catch (e) {
      return { gecerli: false, okumaSonuclari: [], sonuclar: [], hata: 'OMR sonuç paketi çözümlenemedi.' };
    }
  }

  function uretBosCevapAnahtariCSV(dySayisi = 10, testSayisi = 10) {
    const satirlar = ['Bolum;Soru_No;A_Grubu;B_Grubu;C_Grubu;D_Grubu'];
    for (let i = 1; i <= dySayisi; i++) {
      const d = i % 2 === 1 ? 'D' : 'Y';
      satirlar.push(`DY;${i};${d};${d === 'D' ? 'Y' : 'D'};${d};${d === 'D' ? 'Y' : 'D'}`);
    }
    const harfler = ['A', 'B', 'C', 'D', 'E'];
    for (let i = 1; i <= testSayisi; i++) {
      satirlar.push(`TEST;${i};${harfler[(i - 1) % 5]};${harfler[i % 5]};${harfler[(i + 1) % 5]};${harfler[(i + 2) % 5]}`);
    }
    return '\ufeff' + satirlar.join('\r\n');
  }

  function cozCevapAnahtariCSV(csvMetin) {
    if (typeof csvMetin !== 'string' || !csvMetin.trim()) return null;
    const temiz = csvMetin.replace(/^\ufeff/, '').replace(/\r\n/g, '\n');
    const satirlar = temiz.split('\n').map((s) => s.trim()).filter(Boolean);
    if (satirlar.length < 2) return null;

    const ayirici = tespitEtCsvAyirici(satirlar[0]);
    const anahtarlar = {
      A: { dy: [], test: [], klasik: [] },
      B: { dy: [], test: [], klasik: [] },
      C: { dy: [], test: [], klasik: [] },
      D: { dy: [], test: [], klasik: [] }
    };

    for (let i = 1; i < satirlar.length; i++) {
      const h = ayirCsvSatiri(satirlar[i], ayirici);
      if (h.length < 3) continue;
      const bolum = (h[0] || '').toUpperCase();
      const a = (h[2] || 'A').toUpperCase().trim();
      const b = (h[3] || a).toUpperCase().trim();
      const c = (h[4] || a).toUpperCase().trim();
      const d = (h[5] || a).toUpperCase().trim();

      if (bolum.includes('DY') || bolum.includes('D/Y')) {
        anahtarlar.A.dy.push(a === 'Y' ? 'Y' : 'D');
        anahtarlar.B.dy.push(b === 'Y' ? 'Y' : 'D');
        anahtarlar.C.dy.push(c === 'Y' ? 'Y' : 'D');
        anahtarlar.D.dy.push(d === 'Y' ? 'Y' : 'D');
      } else if (bolum.includes('TEST')) {
        anahtarlar.A.test.push(['A', 'B', 'C', 'D', 'E'].includes(a) ? a : 'A');
        anahtarlar.B.test.push(['A', 'B', 'C', 'D', 'E'].includes(b) ? b : 'A');
        anahtarlar.C.test.push(['A', 'B', 'C', 'D', 'E'].includes(c) ? c : 'A');
        anahtarlar.D.test.push(['A', 'B', 'C', 'D', 'E'].includes(d) ? d : 'A');
      }
    }
    return anahtarlar;
  }

  function hesaplaHarfNotu(puan) {
    if (puan === null || puan === undefined || Number.isNaN(Number(puan))) return 'GR';
    const p = Number(puan);
    if (p >= 90) return 'AA';
    if (p >= 85) return 'BA';
    if (p >= 75) return 'BB';
    if (p >= 70) return 'CB';
    if (p >= 60) return 'CC';
    if (p >= 55) return 'DC';
    if (p >= 50) return 'DD';
    return 'FF';
  }

  function temizleCsvFormulEnjeksiyon(hucre) {
    const s = String(hucre === undefined || hucre === null ? '' : hucre).replace(/;/g, ',').replace(/[\r\n]+/g, ' ').trim();
    if (/^[=+\-@]/.test(s)) return `'${s}`;
    return s;
  }

  function uretResmiObsNotCizelgesiCSV(ogrenciler, okumaSonuclari) {
    const baslik = 'Sira;Ogrenci_No;Ad_Soyad;Bolum;Kitapcik;DY_Net;Test_Net;Klasik_Puan;Resmi_Not;Harf_Notu;Durum';
    const siraliOgrenciler = ogrenciler.slice().sort((a, b) => String(a.ogrNo).localeCompare(String(b.ogrNo)));
    const satirlar = [baslik];

    siraliOgrenciler.forEach((ogr, idx) => {
      const no = temizleCsvFormulEnjeksiyon(ogr.ogrNo);
      const ad = temizleCsvFormulEnjeksiyon(ogr.adSoyad);
      const bol = temizleCsvFormulEnjeksiyon(ogr.bolum || 'Genel');
      const okunan = okumaSonuclari.find((s) => String(s.ogrNo) === String(ogr.ogrNo));
      if (!okunan) {
        satirlar.push(`${idx + 1};${no};${ad};${bol};-;-;-;-;GR;GR;Sınava Girmedi (GR)`);
      } else {
        const harf = hesaplaHarfNotu(okunan.toplamPuan);
        const gectiDurum = okunan.toplamPuan >= 50 ? 'Geçti' : 'Kaldı';
        satirlar.push(`${idx + 1};${no};${ad};${bol};${temizleCsvFormulEnjeksiyon(okunan.grup)};${okunan.dyNet};${okunan.testNet};${okunan.klasikToplamPuan};${okunan.toplamPuan};${harf};${gectiDurum}`);
      }
    });

    return '\ufeff' + satirlar.join('\r\n');
  }

  /* ------------------------------------------------------------------------
     8C. ONLİNE SINAV ÖĞRENCİ İLK GİRİŞ (E-POSTA, TELEFON, CANLI YEŞİL ŞİFRE)
     VE KİŞİYE ÖZEL SORU HAVUZU / ŞIK KARIŞTIRMA MOTORU
     ------------------------------------------------------------------------ */
  function kontrolCanliSifreKurallari(sifre = '', sifreTekrar = '') {
    const s = String(sifre || '');
    const t = String(sifreTekrar || '');
    const uzunlukOk = s.length >= 8;
    const buyukHarfOk = /[A-ZÇĞİÖŞÜ]/.test(s);
    const kucukHarfOk = /[a-zçğıöşü]/.test(s);
    const rakamOk = /[0-9]/.test(s);
    const simgeOk = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(s);
    const eslesmeOk = s.length > 0 && s === t;

    return {
      uzunlukOk,
      buyukHarfOk,
      kucukHarfOk,
      rakamOk,
      simgeOk,
      eslesmeOk,
      tumuGecerli: uzunlukOk && buyukHarfOk && kucukHarfOk && rakamOk && simgeOk && eslesmeOk
    };
  }

  function dogrulaOgrenciIlkKayit(bilgi = {}) {
    const eposta = String(bilgi.eposta || '').trim();
    const telefonHam = String(bilgi.telefon || '').replace(/\D+/g, '');
    const sifreDurum = kontrolCanliSifreKurallari(bilgi.sifre, bilgi.sifreTekrar !== undefined ? bilgi.sifreTekrar : bilgi.sifre);

    const epostaOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eposta);
    const telefonOk = telefonHam.length >= 10 && telefonHam.length <= 12;

    if (!epostaOk) {
      return { gecerli: false, hata: 'Lütfen geçerli bir e-posta adresi giriniz (Örn: ad.soyad@ogrenci.edu.tr).' };
    }
    if (!telefonOk) {
      return { gecerli: false, hata: 'Lütfen geçerli bir cep telefonu numarası giriniz (10 veya 11 haneli).' };
    }
    if (!sifreDurum.tumuGecerli) {
      return { gecerli: false, hata: 'Şifreniz tüm güvenlik kriterlerini (Büyük harf, küçük harf, sayı, simge ve en az 8 karakter) sağlamalıdır.' };
    }
    return {
      gecerli: true,
      eposta,
      telefon: telefonHam,
      sifreDurum
    };
  }

  /* Öğretmen / Öğretim Elemanı (Hoca) Kullanıcı Adı, Davet Kodu, Yönetici Onayı & Şifre Doğrulama Motoru */
  const VARSAYILAN_DAVET_KODU = 'AKADEMI-2026';

  const VARSAYILAN_HOCA_HESAP = {
    kullaniciAdi: 'hoca',
    adSoyad: 'Dr. Öğr. Üyesi Fatih Çakmak',
    eposta: 'fatihcakmak@gmail.com',
    telefon: '05065168500',
    sifre: 'Demo!Hoca2026',
    rol: 'yonetici',
    durum: 'aktif'
  };

  function uretYeniDavetKodu(onEk = 'AKADEMI') {
    const alfabe = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let rastgele = '';
    for (let i = 0; i < 6; i++) {
      rastgele += alfabe.charAt(Math.floor(Math.random() * alfabe.length));
    }
    return `${String(onEk || 'AKADEMI').toUpperCase()}-${rastgele}`;
  }

  function dogrulaHocaHesapKayit(bilgi = {}, secenekler = {}) {
    const kullaniciAdi = String(bilgi.kullaniciAdi || '').trim();
    const adSoyad = String(bilgi.adSoyad || '').trim();
    const eposta = String(bilgi.eposta || '').trim();
    const telefonHam = String(bilgi.telefon || '').replace(/\D+/g, '');
    const sifreDurum = kontrolCanliSifreKurallari(bilgi.sifre, bilgi.sifreTekrar !== undefined ? bilgi.sifreTekrar : bilgi.sifre);

    if (secenekler && secenekler.davetKoduKontrol === true) {
      const girilenKod = String(bilgi.davetKodu || '').trim().toUpperCase();
      const beklenenKod = String(secenekler.beklenenDavetKodu || VARSAYILAN_DAVET_KODU).trim().toUpperCase();
      if (!girilenKod || girilenKod !== beklenenKod) {
        return {
          gecerli: false,
          hata: 'Kurum davet kodu geçersiz veya hatalı! Lütfen sistem yöneticisinden güncel davet kodunu alınız.'
        };
      }
    }

    if (kullaniciAdi.length < 3) {
      return { gecerli: false, hata: 'Hoca kullanıcı adı en az 3 karakter olmalıdır.' };
    }
    if (!adSoyad) {
      return { gecerli: false, hata: 'Lütfen Unvan ve Ad-Soyad bilgisini giriniz.' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eposta)) {
      return { gecerli: false, hata: 'Lütfen geçerli bir kurumsal e-posta adresi giriniz.' };
    }
    if (telefonHam.length < 10 || telefonHam.length > 12) {
      return { gecerli: false, hata: 'Lütfen geçerli bir telefon numarası giriniz (10-11 hane).' };
    }
    if (!sifreDurum.tumuGecerli) {
      return { gecerli: false, hata: 'Hoca şifresi tüm güvenlik kriterlerini (Büyük harf, küçük harf, sayı, simge ve 8+ karakter) sağlamalıdır.' };
    }

    if (secenekler && Array.isArray(secenekler.mevcutHocalar)) {
      const haricK = String(secenekler.haricKullaniciAdi || '').trim().toLowerCase();
      const kDusuk = kullaniciAdi.toLowerCase();
      const eDusuk = eposta.toLowerCase();
      for (const mevcut of secenekler.mevcutHocalar) {
        if (!mevcut || typeof mevcut !== 'object') continue;
        const mK = String(mevcut.kullaniciAdi || '').trim().toLowerCase();
        const mE = String(mevcut.eposta || '').trim().toLowerCase();
        if (haricK && mK === haricK) continue;
        if (mK === kDusuk || (mE && mE === eDusuk)) {
          return {
            gecerli: false,
            hata: 'Bu kullanıcı adı veya kurumsal e-posta adresi sistemde zaten kayıtlıdır.'
          };
        }
      }
    }

    return {
      gecerli: true,
      kullaniciAdi,
      adSoyad,
      eposta,
      telefon: telefonHam,
      sifreDurum
    };
  }

  function dogrulaHocaGiris(girilenKullanici, girilenSifre, kayitliHocaVeyaListe = VARSAYILAN_HOCA_HESAP) {
    const k = String(girilenKullanici || '').trim().toLowerCase();
    const s = String(girilenSifre || '');

    if (!k || !s) {
      return { basarili: false, kod: 400, hata: 'Kullanıcı adı ve şifre zorunludur.' };
    }

    const liste = Array.isArray(kayitliHocaVeyaListe)
      ? kayitliHocaVeyaListe
      : (kayitliHocaVeyaListe && typeof kayitliHocaVeyaListe === 'object' ? [kayitliHocaVeyaListe] : [VARSAYILAN_HOCA_HESAP]);

    for (const kayit of liste) {
      if (!kayit || typeof kayit !== 'object') continue;
      const hedefK = String(kayit.kullaniciAdi || '').trim().toLowerCase();
      const hedefEposta = String(kayit.eposta || '').trim().toLowerCase();
      if ((k === hedefK || (hedefEposta && k === hedefEposta)) && s === String(kayit.sifre)) {
        const hesapDurum = String(kayit.durum || 'aktif').toLowerCase();
        if (hesapDurum === 'beklemede') {
          return {
            basarili: false,
            kod: 403,
            durum: 'beklemede',
            hata: 'Hesabınız yönetici onayı bekliyor (403 Forbidden). Yönetici onayladıktan sonra giriş yapabilirsiniz.'
          };
        }
        if (hesapDurum === 'askida' || hesapDurum === 'reddedildi') {
          return {
            basarili: false,
            kod: 403,
            durum: hesapDurum,
            hata: 'Hesabınız yönetici tarafından askıya alınmış veya erişimi kapatılmıştır (403 Forbidden).'
          };
        }
        return {
          basarili: true,
          kod: 200,
          kullaniciAdi: kayit.kullaniciAdi,
          adSoyad: kayit.adSoyad,
          eposta: kayit.eposta,
          telefon: kayit.telefon || '',
          rol: kayit.rol || (hedefK === 'hoca' ? 'yonetici' : 'hoca'),
          durum: 'aktif'
        };
      }
    }

    return { basarili: false, kod: 401, hata: 'Hatalı öğretmen kullanıcı adı veya şifre! (401 Unauthorized)' };
  }

  /* E-Posta + Cep Telefonu Doğrulaması ile Yönetici/Hoca Şifre Kurtarma (Veri Kaybı Olmadan) */
  function sifirlaHocaSifreEpostaTelefon(bilgi = {}, kayitliHocaVeyaListe = VARSAYILAN_HOCA_HESAP) {
    const girilenEposta = String(bilgi.eposta || '').trim().toLowerCase();
    const girilenTelRakamlari = String(bilgi.telefon || '').replace(/\D+/g, '');
    const girilenTelSon10 = girilenTelRakamlari.slice(-10);
    const yeniSifre = String(bilgi.yeniSifre || '');
    const yeniSifreTekrar = bilgi.yeniSifreTekrar !== undefined ? String(bilgi.yeniSifreTekrar) : yeniSifre;

    if (!girilenEposta || girilenTelSon10.length < 10) {
      return {
        basarili: false,
        kod: 400,
        hata: 'Şifre sıfırlama için kayıtlı e-posta adresinizi ve 10-11 haneli cep telefonu numaranızı eksiksiz giriniz.'
      };
    }

    const sifreDurum = kontrolCanliSifreKurallari(yeniSifre, yeniSifreTekrar);
    if (!sifreDurum.tumuGecerli) {
      return {
        basarili: false,
        kod: 400,
        hata: 'Yeni şifreniz tüm güvenlik kriterlerini (Büyük/küçük harf, rakam, simge ve en az 8 karakter) sağlamalıdır.'
      };
    }

    const liste = Array.isArray(kayitliHocaVeyaListe)
      ? kayitliHocaVeyaListe
      : (kayitliHocaVeyaListe && typeof kayitliHocaVeyaListe === 'object' ? [kayitliHocaVeyaListe] : [VARSAYILAN_HOCA_HESAP]);

    for (const kayit of liste) {
      if (!kayit || typeof kayit !== 'object') continue;
      const kEposta = String(kayit.eposta || '').trim().toLowerCase();
      const kTelSon10 = String(kayit.telefon || '').replace(/\D+/g, '').slice(-10);
      if (kEposta && kTelSon10.length === 10 && kEposta === girilenEposta && kTelSon10 === girilenTelSon10) {
        kayit.sifre = yeniSifre;
        return {
          basarili: true,
          kod: 200,
          kullaniciAdi: kayit.kullaniciAdi,
          adSoyad: kayit.adSoyad,
          eposta: kayit.eposta,
          telefon: kayit.telefon,
          rol: kayit.rol || (String(kayit.kullaniciAdi).toLowerCase() === 'hoca' ? 'yonetici' : 'hoca'),
          durum: kayit.durum || 'aktif'
        };
      }
    }

    return {
      basarili: false,
      kod: 403,
      hata: 'Girilen e-posta adresi ve cep telefonu numarası kayıtlı yönetici/hoca hesabıyla eşleşmedi! (403 Forbidden)'
    };
  }

  /* ------------------------------------------------------------------------
     DELİL NİTELİĞİNDE SINAV BAZLI DENETİM & İHLAL LOG ZİNCİRİ (ADLİ TUTANAK EKİ)
     Gerçek FIPS 180-4 SHA-256 Kriptografik Özet Motoru (UTF-8 -> 64 Hex)
     ------------------------------------------------------------------------ */
  const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function uretDelilLogHash(metin) {
    const giris = String(metin === undefined || metin === null ? '' : metin);
    let utf8;
    if (typeof TextEncoder !== 'undefined') {
      utf8 = Array.from(new TextEncoder().encode(giris));
    } else {
      utf8 = [];
      for (let i = 0; i < giris.length; i++) {
        let c = giris.charCodeAt(i);
        if (c < 0x80) {
          utf8.push(c);
        } else if (c < 0x800) {
          utf8.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        } else if (c >= 0xd800 && c <= 0xdbff) {
          const next = i + 1 < giris.length ? giris.charCodeAt(i + 1) : 0;
          if (next >= 0xdc00 && next <= 0xdfff) {
            i++;
            c = 0x10000 + (((c & 0x3ff) << 10) | (next & 0x3ff));
            utf8.push(
              0xf0 | (c >> 18),
              0x80 | ((c >> 12) & 0x3f),
              0x80 | ((c >> 6) & 0x3f),
              0x80 | (c & 0x3f)
            );
          } else {
            // Tekil (eşleşmemiş) yüksek vekil karakter -> U+FFFD (EF BF BD)
            utf8.push(0xef, 0xbf, 0xbd);
          }
        } else if (c >= 0xdc00 && c <= 0xdfff) {
          // Tekil (eşleşmemiş) düşük vekil karakter -> U+FFFD (EF BF BD)
          utf8.push(0xef, 0xbf, 0xbd);
        } else {
          utf8.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        }
      }
    }

    const bitUzunluk = utf8.length * 8;
    utf8.push(0x80);
    while ((utf8.length % 64) !== 56) utf8.push(0);
    const yuksekBit = Math.floor(bitUzunluk / 0x100000000);
    const dusukBit = bitUzunluk >>> 0;
    for (let i = 3; i >= 0; i--) utf8.push((yuksekBit >>> (i * 8)) & 0xff);
    for (let i = 3; i >= 0; i--) utf8.push((dusukBit >>> (i * 8)) & 0xff);

    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;

    const w = new Array(64);
    const ror = (x, n) => (x >>> n) | (x << (32 - n));

    for (let i = 0; i < utf8.length; i += 64) {
      for (let j = 0; j < 16; j++) {
        const idx = i + j * 4;
        w[j] = ((utf8[idx] << 24) | (utf8[idx + 1] << 16) | (utf8[idx + 2] << 8) | utf8[idx + 3]) >>> 0;
      }
      for (let j = 16; j < 64; j++) {
        const s0 = (ror(w[j - 15], 7) ^ ror(w[j - 15], 18) ^ (w[j - 15] >>> 3)) >>> 0;
        const s1 = (ror(w[j - 2], 17) ^ ror(w[j - 2], 19) ^ (w[j - 2] >>> 10)) >>> 0;
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
      }

      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;
      let f = h5;
      let g = h6;
      let h = h7;

      for (let j = 0; j < 64; j++) {
        const S1 = (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) >>> 0;
        const ch = ((e & f) ^ (~e & g)) >>> 0;
        const temp1 = (h + S1 + ch + SHA256_K[j] + w[j]) >>> 0;
        const S0 = (ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) >>> 0;
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        const temp2 = (S0 + maj) >>> 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }

      h0 = (h0 + a) >>> 0;
      h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0;
      h5 = (h5 + f) >>> 0;
      h6 = (h6 + g) >>> 0;
      h7 = (h7 + h) >>> 0;
    }

    return [h0, h1, h2, h3, h4, h5, h6, h7]
      .map((v) => v.toString(16).padStart(8, '0'))
      .join('')
      .toUpperCase();
  }

  function olusturKioskDelilLogKaydi(veri = {}, oncekiHash = 'GENESIS-00000000') {
    const simdi = veri.zamanIso ? new Date(veri.zamanIso) : new Date();
    const zamanIso = Number.isNaN(simdi.getTime()) ? new Date().toISOString() : simdi.toISOString();
    const iki = (n) => String(n).padStart(2, '0');
    const uc = (n) => String(n).padStart(3, '0');
    const d = new Date(zamanIso);
    const yerelZaman = `${iki(d.getDate())}.${iki(d.getMonth() + 1)}.${d.getFullYear()} ${iki(d.getHours())}:${iki(d.getMinutes())}:${iki(d.getSeconds())}.${uc(d.getMilliseconds())}`;

    const sinavId = String(veri.sinavId || 'SINAV-2026').slice(0, 80);
    const sinavBaslik = String(veri.sinavBaslik || 'Online Sınav').slice(0, 140);
    const ogrNo = String(veri.ogrNo || '-').slice(0, 40);
    const adSoyad = String(veri.adSoyad || '-').slice(0, 120);
    const olayTuru = String(veri.olayTuru || 'GENEL_OLAY').slice(0, 60);
    const aktifSoruNo = Number(veri.aktifSoruNo) || 0;
    const toplamSoru = Number(veri.toplamSoru) || 0;
    const kalanSureSn = Math.max(0, Number(veri.kalanSureSn) || 0);
    const ihlalSayisi = Math.max(0, Number(veri.ihlalSayisi) || 0);
    const cihazBilgisi = String(veri.cihazBilgisi || '').slice(0, 220);
    const aciklama = String(veri.aciklama || '').slice(0, 300);
    const onceki = String(oncekiHash || 'GENESIS-00000000');

    const hamImzaMetni = `${onceki}|${zamanIso}|${sinavId}|${ogrNo}|${olayTuru}|${aktifSoruNo}|${kalanSureSn}|${ihlalSayisi}|${aciklama}`;
    const olayHash = uretDelilLogHash(hamImzaMetni);

    return {
      id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      zamanIso,
      zamanDamgasi: zamanIso,
      yerelZaman,
      sinavId,
      sinavBaslik,
      ogrNo,
      adSoyad,
      olayTuru,
      aktifSoruNo,
      toplamSoru,
      kalanSureSn,
      ihlalSayisi,
      cihazBilgisi,
      aciklama,
      oncekiHash: onceki,
      olayHash
    };
  }

  function uretResmiDelilLogRaporuTXT(arg1 = {}, arg2 = [], arg3 = [], arg4 = '') {
    let sinavBilgi = arg1 || {};
    let oturumlar = Array.isArray(arg2) ? arg2 : [];
    let loglar = Array.isArray(arg3) ? arg3 : [];
    let filtreOgrNo = arg4 || '';

    if (Array.isArray(arg1)) {
      loglar = arg1;
      const ops = (arg2 && typeof arg2 === 'object' && !Array.isArray(arg2)) ? arg2 : {};
      sinavBilgi = {
        sinavId: ops.sinavId || '',
        baslik: ops.sinavBaslik || ops.baslik || 'Online Sınav',
        dersAd: ops.dersAd || '',
        kurumAd: ops.kurumAd || '',
        hocaAd: ops.hocaAd || ''
      };
      oturumlar = Array.isArray(ops.oturumlar) ? ops.oturumlar : [];
      filtreOgrNo = ops.ogrNo || '';
    }

    const hedefSinavId = sinavBilgi.sinavId || '';
    const seciliLoglar = (Array.isArray(loglar) ? loglar : []).filter((l) => {
      if (hedefSinavId && hedefSinavId !== 'TUMU' && l.sinavId !== hedefSinavId) return false;
      if (filtreOgrNo && String(l.ogrNo) !== String(filtreOgrNo)) return false;
      return true;
    });
    const seciliOturumlar = (Array.isArray(oturumlar) ? oturumlar : []).filter((o) => {
      if (hedefSinavId && hedefSinavId !== 'TUMU' && o.sinavId && o.sinavId !== hedefSinavId) return false;
      if (filtreOgrNo && String(o.ogrNo) !== String(filtreOgrNo)) return false;
      return true;
    });

    const sonHash = seciliLoglar.length > 0 ? seciliLoglar[seciliLoglar.length - 1].olayHash : 'KAYIT-YOK';
    const raporMuhur = uretDelilLogHash(`RAPOR|${hedefSinavId}|${seciliLoglar.length}|${sonHash}`);

    const satirlar = [
      '==========================================================================================',
      '        RESMİ ONLİNE SINAV GÜVENLİK, KİOSK VE İHLAL DELİL LOG RAPORU (FRM-046 EKİ)        ',
      '==========================================================================================',
      `Sınav Kodu / Başlık : ${hedefSinavId || 'TÜM SINAVLAR'} — ${sinavBilgi.baslik || 'Online Sınav'}`,
      `Rapor Üretim Zamanı : ${new Date().toISOString()}`,
      `Filtrelenen Öğrenci : ${filtreOgrNo || 'Tüm Öğrenciler'}`,
      `Toplam Oturum Sayısı: ${seciliOturumlar.length}`,
      `Toplam Delil Logu   : ${seciliLoglar.length} Kayıt`,
      `Son Zincir Özeti    : ${sonHash}`,
      `Bütünlük Mührü      : DELIL-MUHUR-${raporMuhur}`,
      '------------------------------------------------------------------------------------------',
      '1. ÖĞRENCİ OTURUM VE İHLAL ÖZET TABLOSU',
      '------------------------------------------------------------------------------------------'
    ];

    if (seciliOturumlar.length === 0) {
      satirlar.push('  (Bu filtre için tamamlanmış oturum özeti bulunmamaktadır.)');
    } else {
      seciliOturumlar.forEach((o, i) => {
        satirlar.push(
          `  ${i + 1}. [${o.ogrNo}] ${o.adSoyad} | Sınav: ${o.sinavId || '-'} | Durum: ${o.durum} | İhlal: ${o.ihlalSayisi} | Puan: ${o.puan}`
        );
      });
    }

    satirlar.push(
      '------------------------------------------------------------------------------------------',
      '2. ZAMAN DAMGALI KRONOLOJİK DELİL LOG KAYITLARI (MİLİSANİYE HASSASİYETLİ & HASH ZİNCİRLİ)',
      '------------------------------------------------------------------------------------------'
    );

    if (seciliLoglar.length === 0) {
      satirlar.push('  (Henüz kaydedilmiş sınav logu bulunmamaktadır.)');
    } else {
      seciliLoglar.forEach((l, idx) => {
        const dk = String(Math.floor((l.kalanSureSn || 0) / 60)).padStart(2, '0');
        const sn = String((l.kalanSureSn || 0) % 60).padStart(2, '0');
        satirlar.push(
          `[${String(idx + 1).padStart(3, '0')}] ${l.yerelZaman} (${l.zamanIso}) | Sınav: ${l.sinavId} | Öğrenci: ${l.ogrNo} - ${l.adSoyad}`
        );
        satirlar.push(
          `      Olay: ${l.olayTuru} | Soru: ${l.aktifSoruNo}/${l.toplamSoru} | Kalan Süre: ${dk}:${sn} | Toplam İhlal: ${l.ihlalSayisi}`
        );
        satirlar.push(`      Detay: ${l.aciklama}`);
        if (l.cihazBilgisi) {
          satirlar.push(`      Cihaz/Ekran: ${l.cihazBilgisi}`);
        }
        satirlar.push(`      Zincir Hash: ${l.oncekiHash.slice(0, 16)}... -> ${l.olayHash}`);
        satirlar.push('      - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -');
      });
    }

    satirlar.push(
      '==========================================================================================',
      'Bu belge Sınav Optik Stüdyosu Kiosk Güvenlik Motoru tarafından kriptografik özet zinciriyle',
      'üretilmiştir; FRM-046 Sınav Durum Tutanağı disiplin eki olarak kullanılabilir.',
      '=========================================================================================='
    );

    return satirlar.join('\r\n');
  }

  function uretDelilLogCSV(loglar = [], hedefSinavId = '') {
    const baslik = 'Sira;YerelZaman;ISOZaman;SinavKodu;OgrenciNo;AdSoyad;OlayTuru;AktifSoru;KalanSureSn;ToplamIhlal;Aciklama;CihazEkran;OncekiHash;OlayHash';
    const secili = (Array.isArray(loglar) ? loglar : []).filter(
      (l) => !hedefSinavId || hedefSinavId === 'TUMU' || l.sinavId === hedefSinavId
    );
    const temizleHucre = (v) => temizleCsvFormulEnjeksiyon(v);
    const satirlar = secili.map((l, idx) =>
      [
        idx + 1,
        temizleHucre(l.yerelZaman),
        temizleHucre(l.zamanIso),
        temizleHucre(l.sinavId),
        temizleHucre(l.ogrNo),
        temizleHucre(l.adSoyad),
        temizleHucre(l.olayTuru),
        `${l.aktifSoruNo || 0}/${l.toplamSoru || 0}`,
        l.kalanSureSn || 0,
        l.ihlalSayisi || 0,
        temizleHucre(l.aciklama),
        temizleHucre(l.cihazBilgisi),
        temizleHucre(l.oncekiHash),
        temizleHucre(l.olayHash)
      ].join(';')
    );
    return '\ufeff' + [baslik, ...satirlar].join('\r\n');
  }

  /* Öğrenciye Özel Online Sınav Üretici (Her ÖÇ İçin En Az 1 Soru Garantili):
     1. Bankada yeterli soru varsa her öğrenciye FARKLI sorular seçer, ancak her öğrencide tüm ÖÇ'ler en az 1 soru ile kapsanır
     2. Aynı soru denk gelse bile SORU SIRASINI değiştirir
     3. Her test sorusunda ŞIK SIRASINI (A..E) öğrenciye özel karıştırır */
  function uretKisiyeOzelOnlineSinav(tumHavuzSorulari, dySayisi, testSayisi, ogrNo, sinavId = 'SINAV-2026') {
    const dyHavuz = tumHavuzSorulari.filter((s) => s.tur === 'dy' && !s.arsivde);
    const testHavuz = tumHavuzSorulari.filter((s) => s.tur === 'test' && !s.arsivde);

    // Öğrenciye özel deterministik karıştırma ile havuzdan farklı sıralama oluştur
    const karisikDyHavuz = diziKaristirDeterministik(dyHavuz, `HAVUZ-DY-${sinavId}-${ogrNo}`);
    const karisikTestHavuz = diziKaristirDeterministik(testHavuz, `HAVUZ-TEST-${sinavId}-${ogrNo}`);

    // Bu öğrencinin karıştırılmış havuzu üzerinden Bologna "Her ÖÇ İçin En Az 1 Soru" garantili seçim yap
    const ocGarantili = secHaftalikVeKotaliSinavSorulari(
      [...karisikDyHavuz, ...karisikTestHavuz],
      {
        dySayisi,
        testSayisi,
        klasikSayisi: 0,
        herOcEnAzBirSoru: true,
        zorlukModu: 'tumu'
      }
    );

    const secilenDy = ocGarantili.dy;
    const secilenTest = ocGarantili.test;

    // Her test sorusunun şıklarını da bu öğrenciye özel karıştır (Doğru şık A'dan D'ye geçerse doğru değeriyle taşınır)
    const kisiyeOzelTest = secilenTest.map((s) =>
      karistirSoruSiklariVeKoru(s, `SIK-${sinavId}-${ogrNo}-${s.id}`, 5, true)
    );

    // Tüm soruları birleştirip soru sırasını da öğrenciye özel karıştır
    const birlesik = [
      ...secilenDy.map((s) => ({ ...s, tur: 'dy' })),
      ...kisiyeOzelTest.map((s) => ({ ...s, tur: 'test' }))
    ];
    return diziKaristirDeterministik(birlesik, `SIRA-${sinavId}-${ogrNo}`);
  }

  /* ------------------------------------------------------------------------
     8D. ÖĞRENCİYE ÖZEL BASKI SINAV KAĞIDI VARYASYONU VE SAF JS A4 PDF ÜRETİCİ
     1. Her öğrenci için isme/numaraya özel soru seçimi (Her ÖÇ ≥ 1 Soru garantili) + şık karıştırma + özel cevap anahtarı
     2. Harici kütüphanesiz çok sayfalı gerçek A4 %PDF-1.4 ikili (binary) belge üretici
     ------------------------------------------------------------------------ */
  function uretOgrenciyeOzelKagitVaryasyonu(tumHavuzSorulari, sinavYapisi, ogrenci, idx = 0, soruModu = 'kisiye_ozel_havuz') {
    const ogrNo = String((ogrenci && ogrenci.ogrNo) || '2023104011');
    const adSoyad = String((ogrenci && ogrenci.adSoyad) || 'Öğrenci Adı');
    const bolum = String((ogrenci && ogrenci.bolum) || 'Genel');
    const aktifGruplar = sinavYapisi.kitapcikGruplar === 'A'
      ? ['A']
      : (sinavYapisi.kitapcikGruplar === 'AB' ? ['A', 'B'] : ['A', 'B', 'C', 'D']);
    const grupHarfi = aktifGruplar[idx % aktifGruplar.length] || 'A';
    const ozelKod = `ÖZEL-${ogrNo.slice(-2)}`;

    // Mod 1: A/B/C/D Kitapçık Dağıtımlı İsme Özel Kağıt
    if (soruModu === 'abcd_dagitim' && sinavYapisi.kitapciklar && sinavYapisi.kitapciklar[grupHarfi]) {
      const kVar = sinavYapisi.kitapciklar[grupHarfi];
      const kAnahtar = sinavYapisi.cevapAnahtarlari[grupHarfi];
      const sinavKoduAbcd = sinavYapisi.sinavKodu || 'SINAV-2026';
      const soruIzlemAbcd = [
        ...(kVar.dy || []).map((s, i) => ({
          bolum: 'DY',
          soruNo: i + 1,
          soruId: s.id || `DY-${i + 1}`,
          hafta: s.hafta || 1,
          ocKodu: s.ocKodu || 'ÖÇ-1',
          zorluk: s.zorluk || 'Orta',
          metinOzet: String(s.metin || '').slice(0, 90),
          dogruCevap: s.dogruDY || 'D',
          orijinalDogru: s.dogruDY || 'D'
        })),
        ...(kVar.test || []).map((s, i) => ({
          bolum: 'TEST',
          soruNo: i + 1,
          soruId: s.id || `T-${i + 1}`,
          hafta: s.hafta || 1,
          ocKodu: s.ocKodu || 'ÖÇ-1',
          zorluk: s.zorluk || 'Orta',
          metinOzet: String(s.metin || '').slice(0, 90),
          dogruCevap: s.dogruHarf || 'A',
          orijinalDogru: s.orijinalDogruHarf || s.dogruHarf || 'A',
          dogruSikDegeri: s.dogruSikDegeri || (s.siklar && s.siklar[s.dogruHarf || 'A']) || '',
          sikHaritasi: s.siklar || {}
        })),
        ...(kVar.klasik || []).map((s, i) => ({
          bolum: 'KLASIK',
          soruNo: i + 1,
          soruId: s.id || `K-${i + 1}`,
          hafta: s.hafta || 1,
          ocKodu: s.ocKodu || 'ÖÇ-1',
          zorluk: s.zorluk || 'Orta',
          metinOzet: String(s.metin || '').slice(0, 90),
          dogruCevap: s.rubrik || ''
        }))
      ];
      const ispatHamAbcd = `${sinavKoduAbcd}|${ogrNo}|${adSoyad}|ABCD|${grupHarfi}|` +
        soruIzlemAbcd.map((x) => `${x.bolum}${x.soruNo}:${x.soruId}:${x.dogruCevap}`).join(',');
      const ispatHashAbcd = uretDelilLogHash(ispatHamAbcd, 'ABCD-ISPAT-2026');
      return {
        ogrNo,
        adSoyad,
        bolum,
        grupHarfi,
        ozelKod,
        soruModu,
        varyasyon: kVar,
        anahtar: kAnahtar,
        ispatKaydi: {
          sinavKodu: sinavKoduAbcd,
          ogrNo,
          adSoyad,
          bolum,
          soruModu: 'abcd_dagitim',
          grupHarfi,
          ozelKod,
          tohumlar: {
            kitapcikTohumu: `${sinavKoduAbcd}-${grupHarfi}`
          },
          ispatMuhurKodu: `#ISPAT-${ispatHashAbcd.slice(0, 12)}`,
          tamMuhurHash: ispatHashAbcd,
          soruIzlemListesi: soruIzlemAbcd
        }
      };
    }

    // Mod 2: Tam Kişiye Özel Havuz (Bankada yeterli soru varsa farklı soru + Seçmeli ÖÇ garantisi)
    const sinavKodu = sinavYapisi.sinavKodu || 'SINAV-2026';
    const dySayisi = Number(sinavYapisi.dySayisi || 0);
    const testSayisi = Number(sinavYapisi.testSayisi || 0);
    const klasikSayisi = Number(sinavYapisi.klasikSayisi || 0);
    const sikSayisi = Number(sinavYapisi.sikSayisi || 5) === 4 ? 4 : 5;
    const herOcEnAzBirSoru = sinavYapisi.herOcEnAzBirSoru !== undefined ? Boolean(sinavYapisi.herOcEnAzBirSoru) : false;

    const tohumDy = `OGR-DY-HAVUZ-${sinavKodu}-${ogrNo}`;
    const tohumTest = `OGR-TEST-HAVUZ-${sinavKodu}-${ogrNo}`;
    const tohumKlasik = `OGR-KLASIK-HAVUZ-${sinavKodu}-${ogrNo}`;

    const dyHavuz = diziKaristirDeterministik(
      tumHavuzSorulari.filter((s) => s.tur === 'dy'),
      tohumDy
    );
    const testHavuz = diziKaristirDeterministik(
      tumHavuzSorulari.filter((s) => s.tur === 'test'),
      tohumTest
    );
    const klasikHavuz = diziKaristirDeterministik(
      tumHavuzSorulari.filter((s) => s.tur === 'klasik'),
      tohumKlasik
    );

    const ocSecim = secHaftalikVeKotaliSinavSorulari(
      [...dyHavuz, ...testHavuz, ...klasikHavuz],
      {
        dySayisi,
        testSayisi,
        klasikSayisi,
        herOcEnAzBirSoru,
        zorlukModu: 'tumu'
      }
    );

    const seciliDyIslenmis = onleDyArdisikYigilma(ocSecim.dy.slice(0, dySayisi));
    const seciliDy = seciliDyIslenmis.map((s, i) => ({
      ...s,
      kitapcikSoruNo: i + 1,
      orijinalNo: i + 1
    }));
    const enUzunDyOgr = hesaplaEnUzunDySerisi(seciliDy);
    const dyUyariOgr = enUzunDyOgr > 3;

    const dengeliHarfOgr = uretDengeliHarfDizisi(testSayisi, sikSayisi, `OGR-DENGELI-${sinavKodu}-${ogrNo}`);
    const seciliTest = ocSecim.test.slice(0, testSayisi).map((s, i) => {
      const sikTohumu = `OGR-SIK-${sinavKodu}-${ogrNo}-${s.id}-${i}`;
      const korunan = karistirSoruSiklariVeKoru(
        s,
        sikTohumu,
        sikSayisi,
        true,
        dengeliHarfOgr[i]
      );
      return {
        ...korunan,
        sikTohumu,
        kitapcikSoruNo: i + 1,
        orijinalNo: i + 1
      };
    });

    const seciliKlasik = ocSecim.klasik.slice(0, klasikSayisi).map((s, i) => ({
      ...s,
      kitapcikSoruNo: i + 1,
      orijinalNo: i + 1
    }));

    const varyasyon = {
      grup: grupHarfi,
      ozelKod,
      dy: seciliDy,
      test: seciliTest,
      klasik: seciliKlasik,
      enUzunDySerisi: enUzunDyOgr,
      dyDengesizUyari: dyUyariOgr,
      uyari: dyUyariOgr ? 'D/Y havuzunda yeterli D/Y çeşitliliği olmadığından ardışık yığılma yalnız sıralama ile çözülemedi.' : ''
    };

    const anahtar = {
      dy: seciliDy.map((s) => s.dogruDY || 'D'),
      test: seciliTest.map((s) => s.dogruHarf || 'A'),
      enUzunDySerisi: enUzunDyOgr,
      dyDengesizUyari: dyUyariOgr,
      testDetay: seciliTest.map((s) => ({
        soruId: s.id || '',
        dogruHarf: s.dogruHarf || 'A',
        orijinalDogruHarf: s.orijinalDogruHarf || s.dogruHarf || 'A',
        dogruSikDegeri: s.dogruSikDegeri || ''
      })),
      klasik: seciliKlasik.map((s) => s.rubrik || '')
    };

    const soruIzlemListesi = [
      ...seciliDy.map((s, i) => ({
        bolum: 'DY',
        soruNo: i + 1,
        soruId: s.id || `DY-${i + 1}`,
        hafta: s.hafta || 1,
        ocKodu: s.ocKodu || 'ÖÇ-1',
        zorluk: s.zorluk || 'Orta',
        metinOzet: String(s.metin || '').slice(0, 90),
        dogruCevap: s.dogruDY || 'D',
        orijinalDogru: s.dogruDY || 'D'
      })),
      ...seciliTest.map((s, i) => ({
        bolum: 'TEST',
        soruNo: i + 1,
        soruId: s.id || `T-${i + 1}`,
        hafta: s.hafta || 1,
        ocKodu: s.ocKodu || 'ÖÇ-1',
        zorluk: s.zorluk || 'Orta',
        metinOzet: String(s.metin || '').slice(0, 90),
        dogruCevap: s.dogruHarf || 'A',
        orijinalDogru: s.orijinalDogruHarf || s.dogruHarf || 'A',
        dogruSikDegeri: s.dogruSikDegeri || '',
        sikTohumu: s.sikTohumu || '',
        sikHaritasi: s.siklar || {}
      })),
      ...seciliKlasik.map((s, i) => ({
        bolum: 'KLASIK',
        soruNo: i + 1,
        soruId: s.id || `K-${i + 1}`,
        hafta: s.hafta || 1,
        ocKodu: s.ocKodu || 'ÖÇ-1',
        zorluk: s.zorluk || 'Orta',
        metinOzet: String(s.metin || '').slice(0, 90),
        dogruCevap: s.rubrik || ''
      }))
    ];

    const ispatHamVeri = `${sinavKodu}|${ogrNo}|${adSoyad}|KISIYE_OZEL|${ozelKod}|` +
      soruIzlemListesi.map((x) => `${x.bolum}${x.soruNo}:${x.soruId}:${x.orijinalDogru}->${x.dogruCevap}:${x.dogruSikDegeri || ''}`).join('|');
    const tamMuhurHash = uretDelilLogHash(ispatHamVeri, `OGR-OZEL-ISPAT-${sinavKodu}`);

    const ispatKaydi = {
      sinavKodu,
      ogrNo,
      adSoyad,
      bolum,
      soruModu: 'kisiye_ozel_havuz',
      grupHarfi,
      ozelKod,
      tohumlar: {
        dyHavuzTohumu: tohumDy,
        testHavuzTohumu: tohumTest,
        klasikHavuzTohumu: tohumKlasik,
        sikTohumFormulu: `OGR-SIK-${sinavKodu}-${ogrNo}-<SoruID>-<SoruIndeks>`
      },
      ispatMuhurKodu: `#ISPAT-${tamMuhurHash.slice(0, 12)}`,
      tamMuhurHash,
      soruIzlemListesi
    };

    return {
      ogrNo,
      adSoyad,
      bolum,
      grupHarfi,
      ozelKod,
      soruModu,
      varyasyon,
      anahtar,
      ispatKaydi
    };
  }

  /* Öğrenciye Özel Sınav (Baskı ve Online) Resmi İspat & Denetim Raporu (.txt) Üretici
     - Öğrenci itirazında veya maddi hata incelemesinde hangi öğrenciye hangi soru ID'lerinin, hangi şık dizilimiyle ve hangi doğru şıkla atandığını deterministik tohum (seed) ve kriptografik mühürle kanıtlar. */
  function uretOgrenciyeOzelSinavIspatRaporuTXT(sinavYapisi = {}, filtreOgrNo = '') {
    const baslik = (sinavYapisi.baslik && sinavYapisi.baslik.sinavBasligi) || 'AKADEMİK SINAV';
    const dersAdi = (sinavYapisi.baslik && sinavYapisi.baslik.dersAdi) || 'Ders';
    const sinavKodu = sinavYapisi.sinavKodu || 'SINAV-2026';
    const paketler = Array.isArray(sinavYapisi.ogrenciOzelPaketler) ? sinavYapisi.ogrenciOzelPaketler : [];
    const aranan = String(filtreOgrNo || '').trim();
    const seciliPaketler = aranan
      ? paketler.filter((p) => String(p.ogrNo || '').includes(aranan) || String(p.adSoyad || '').toLowerCase().includes(aranan.toLowerCase()))
      : paketler;

    const cizgi = '========================================================================================';
    const altCizgi = '----------------------------------------------------------------------------------------';
    const satirlar = [
      cizgi,
      'T.C. YÜKSEKÖĞRETİM KURUMLARI — ÖĞRENCİYE ÖZEL SINAV RESMİ İSPAT VE DENETİM TUTANAĞI',
      'Deterministik Soru/Şık Atama Matrisi, Orjinal->Karışık Şık İzleme ve Kriptografik Mühür Raporu',
      cizgi,
      `Ders Adı               : ${dersAdi}`,
      `Sınav Başlığı          : ${baslik}`,
      `Sınav Kodu (Seed Kökü) : ${sinavKodu}`,
      `Rapor Üretim Zamanı    : ${new Date().toISOString()}`,
      `Toplam Öğrenci Paketi  : ${seciliPaketler.length} / ${paketler.length}`,
      `İspat Mekanizması      : Mulberry32 Deterministik PRNG + FNV-1a Çift Turlu Bütünlük Mührü`,
      `Yeniden Üretilebilirlik: Aynı Sınav Kodu + Öğrenci No + Soru Bankası ile %100 aynı kağıt tekrar üretilir.`,
      cizgi,
      ''
    ];

    if (seciliPaketler.length === 0) {
      satirlar.push('(!) Henüz öğrenciye özel sınav paketi üretilmemiş veya filtreyle eşleşen öğrenci bulunamadı.');
      return satirlar.join('\r\n');
    }

    seciliPaketler.forEach((p, idx) => {
      const ispat = p.ispatKaydi || {};
      const muhur = ispat.ispatMuhurKodu || `#ISPAT-${uretDelilLogHash(`${sinavKodu}|${p.ogrNo}`, 'ISPAT').slice(0, 12)}`;
      satirlar.push(`[ÖĞRENCİ ${idx + 1}/${seciliPaketler.length}] ${p.ogrNo} — ${p.adSoyad} (${p.bolum || 'Genel'})`);
      satirlar.push(`  • Kağıt Varyasyon Kodu : ${p.ozelKod || '-'} | Kitapçık Grubu: ${p.grupHarfi || 'A'} | Mod: ${p.soruModu || 'kisiye_ozel_havuz'}`);
      satirlar.push(`  • İspat Mühür Kodu     : ${muhur} (Tam Hash: ${ispat.tamMuhurHash || '-'})`);
      if (ispat.tohumlar) {
        satirlar.push(`  • Deterministik Tohum  : Test=${ispat.tohumlar.testHavuzTohumu || ispat.tohumlar.kitapcikTohumu || '-'} | DY=${ispat.tohumlar.dyHavuzTohumu || '-'}`);
      }
      satirlar.push('  • Soru & Şık Eşleştirme İzlem Listesi (Maddi Hata / İtiraz Kanıt Tablosu):');

      const izlem = Array.isArray(ispat.soruIzlemListesi) ? ispat.soruIzlemListesi : [];
      if (izlem.length > 0) {
        izlem.forEach((s) => {
          if (s.bolum === 'TEST') {
            const sikDizilim = s.sikHaritasi
              ? Object.entries(s.sikHaritasi)
                  .filter(([, m]) => m !== undefined && m !== '')
                  .map(([h, m]) => `${h}="${String(m).slice(0, 28)}"`)
                  .join(' | ')
              : '';
            satirlar.push(
              `      [TEST S.${String(s.soruNo).padStart(2, '0')}] HavuzID: ${String(s.soruId).padEnd(8, ' ')} | Hafta: ${s.hafta} | ${s.ocKodu} | Orijinal Şık: ${s.orijinalDogru} -> Öğrenci Kağıdındaki Doğru Şık: ${s.dogruCevap} (Değer: "${s.dogruSikDegeri}")`
            );
            if (sikDizilim) {
              satirlar.push(`                  Kağıttaki Şık Dizilimi: ${sikDizilim}`);
            }
          } else if (s.bolum === 'DY') {
            satirlar.push(
              `      [D/Y  S.${String(s.soruNo).padStart(2, '0')}] HavuzID: ${String(s.soruId).padEnd(8, ' ')} | Hafta: ${s.hafta} | ${s.ocKodu} | Doğru Cevap: ${s.dogruCevap} | Soru: "${s.metinOzet}"`
            );
          } else {
            satirlar.push(
              `      [KLASİK ${String(s.soruNo).padStart(2, '0')}] HavuzID: ${String(s.soruId).padEnd(8, ' ')} | Hafta: ${s.hafta} | ${s.ocKodu} | Rubrik: "${String(s.dogruCevap || '').slice(0, 60)}"`
            );
          }
        });
      }
      satirlar.push(altCizgi);
    });

    const genelMuhur = uretDelilLogHash(satirlar.join('\n'), `GENEL-ISPAT-${sinavKodu}`);
    satirlar.push(`GENEL BELGE BÜTÜNLÜK MÜHRÜ (SHA/FNV-64): #BELGE-${genelMuhur}`);
    satirlar.push(cizgi);
    return satirlar.join('\r\n');
  }

  /* Saf JavaScript Çok Sayfalı A4 %PDF-1.4 Üretici (JPEG DCTDecode Akışı Gömülü) */
  function uretCokSayfaliA4PdfBytes(jpegSayfalari = []) {
    const metinKodla = (str) => {
      const arr = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xFF;
      return arr;
    };

    const parcalar = [];
    let toplamUzunluk = 0;
    const ekleBytes = (u8) => {
      parcalar.push(u8);
      toplamUzunluk += u8.length;
    };
    const ekleStr = (s) => ekleBytes(metinKodla(s));

    ekleStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    const nesneOfsetleri = [0]; // 1-tabanlı PDF nesne ofset tablosu
    const baslatNesne = (id) => {
      nesneOfsetleri[id] = toplamUzunluk;
      ekleStr(`${id} 0 obj\n`);
    };
    const bitirNesne = () => {
      ekleStr('\nendobj\n');
    };

    // Nesne 1: Catalog, Nesne 2: Pages
    const sayfaSayisi = Math.max(1, jpegSayfalari.length);
    const sayfaNesneIdleri = [];
    for (let i = 0; i < sayfaSayisi; i++) {
      sayfaNesneIdleri.push(3 + i * 3); // Her sayfa için: Page (3+3i), Content (4+3i), Image XObject (5+3i)
    }

    baslatNesne(1);
    ekleStr('<< /Type /Catalog /Pages 2 0 R >>');
    bitirNesne();

    baslatNesne(2);
    ekleStr(`<< /Type /Pages /Kids [${sayfaNesneIdleri.map((id) => `${id} 0 R`).join(' ')}] /Count ${sayfaSayisi} >>`);
    bitirNesne();

    for (let i = 0; i < sayfaSayisi; i++) {
      const pageId = 3 + i * 3;
      const contentId = 4 + i * 3;
      const imgId = 5 + i * 3;
      const sayfa = jpegSayfalari[i] || { genislik: 1240, yukseklik: 1754, veri: new Uint8Array(0) };
      const gen = sayfa.genislik || 1240;
      const yuk = sayfa.yukseklik || 1754;
      const jpegBytes = sayfa.jpegBytes instanceof Uint8Array
        ? sayfa.jpegBytes
        : (sayfa.veri instanceof Uint8Array ? sayfa.veri : new Uint8Array(0));

      // Page nesnesi (A4: 595.28 x 841.89 pt)
      baslatNesne(pageId);
      ekleStr(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] ` +
        `/Resources << /XObject << /Im${i} ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`
      );
      bitirNesne();

      // Content stream
      const akisKomut = `q 595.28 0 0 841.89 0 0 cm /Im${i} Do Q\n`;
      baslatNesne(contentId);
      ekleStr(`<< /Length ${akisKomut.length} >>\nstream\n${akisKomut}endstream`);
      bitirNesne();

      // JPEG Image XObject
      baslatNesne(imgId);
      ekleStr(
        `<< /Type /XObject /Subtype /Image /Width ${gen} /Height ${yuk} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
      );
      ekleBytes(jpegBytes);
      ekleStr('\nendstream');
      bitirNesne();
    }

    const xrefOfset = toplamUzunluk;
    const toplamNesne = nesneOfsetleri.length;
    ekleStr(`xref\n0 ${toplamNesne}\n0000000000 65535 f \n`);
    for (let id = 1; id < toplamNesne; id++) {
      const ofsetStr = String(nesneOfsetleri[id] || 0).padStart(10, '0');
      ekleStr(`${ofsetStr} 00000 n \n`);
    }
    ekleStr(`trailer\n<< /Size ${toplamNesne} /Root 1 0 R >>\nstartxref\n${xrefOfset}\n%%EOF\n`);

    const birlesik = new Uint8Array(toplamUzunluk);
    let imlec = 0;
    for (const p of parcalar) {
      birlesik.set(p, imlec);
      imlec += p.length;
    }
    return birlesik;
  }

  /* ------------------------------------------------------------------------
     9. VARSAYILAN ZENGİN DERS, SORU BANKASI (D/Y + TEST + KLASİK) VE SINIF VERİSİ
     ------------------------------------------------------------------------ */
  const VARSAYILAN_DERSLER = [
    {
      id: 'ders-ag-guvenlik',
      kod: 'BİL304',
      ad: 'Bilgisayar Ağları ve Siber Güvenlik',
      fakulte: 'Mühendislik ve Doğa Bilimleri Fakültesi',
      bolum: 'Bilgisayar Mühendisliği Bölümü',
      ogretimElemani: 'Doç. Dr. Öğretim Üyesi'
    },
    {
      id: 'ders-veritabani',
      kod: 'BİL208',
      ad: 'Veritabanı Yönetim Sistemleri',
      fakulte: 'Teknoloji Fakültesi',
      bolum: 'Yazılım Mühendisliği Bölümü',
      ogretimElemani: 'Dr. Öğr. Üyesi'
    },
    {
      id: 'ders-egitim-olcme',
      kod: 'EĞT201',
      ad: 'Eğitimde Ölçme ve Değerlendirme',
      fakulte: 'Eğitim Fakültesi',
      bolum: 'Eğitim Bilimleri Bölümü',
      ogretimElemani: 'Prof. Dr. Öğretim Üyesi'
    }
  ];

  const VARSAYILAN_SORULAR = [
    // --- DOĞRU / YANLIŞ SORULARI (18 Adet · 1–14. Haftalara Dağıtılmış) ---
    { id: 'dy-1', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 1, kazanim: 'ÖÇ-1: Ağ Katmanları', zorluk: 'Kolay', metin: 'TCP protokolü veri aktarımından önce üçlü el sıkışma (three-way handshake) ile bağlantı kurar.', dogruDY: 'D' },
    { id: 'dy-2', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 1, kazanim: 'ÖÇ-1: Ağ Katmanları', zorluk: 'Kolay', metin: 'HTTPS trafiğinde URL içerisindeki alan adı (SNI) ağ dinleyicileri tarafından hiçbir zaman görülemez.', dogruDY: 'Y' },
    { id: 'dy-3', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 2, kazanim: 'ÖÇ-1: Ağ Katmanları', zorluk: 'Orta', metin: 'ARP protokolü IP adreslerini fiziksel MAC adreslerine çözümlemek için yerel ağda yayın (broadcast) yapar.', dogruDY: 'D' },
    { id: 'dy-4', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 3, kazanim: 'ÖÇ-2: Kriptografi', zorluk: 'Orta', metin: 'Simetrik şifrelemede şifreleme ve şifre çözme işlemleri için iki farklı (açık ve özel) anahtar kullanılır.', dogruDY: 'Y' },
    { id: 'dy-5', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 4, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Orta', metin: 'SQL Enjeksiyonu (SQLi) saldırılarını önlemenin en etkili mimari yolu parametreli sorgular (Prepared Statements) kullanmaktır.', dogruDY: 'D' },
    { id: 'dy-6', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 2, kazanim: 'ÖÇ-1: Ağ Katmanları', zorluk: 'Kolay', metin: 'DNS protokolü varsayılan olarak 53 numaralı portu kullanır.', dogruDY: 'D' },
    { id: 'dy-7', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 5, kazanim: 'ÖÇ-2: Kriptografi', zorluk: 'Zor', metin: 'bcrypt özetleme algoritması UTF-8 formatında 72 bayttan uzun parolaların sonraki baytlarını işleme katmaz.', dogruDY: 'D' },
    { id: 'dy-8', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 6, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Orta', metin: 'İstemci tarafında (JavaScript ile) yapılan form doğrulaması sunucu tarafındaki güvenlik kontrolünün yerini tutar.', dogruDY: 'Y' },
    { id: 'dy-9', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 7, kazanim: 'ÖÇ-3: Ağ Mimarisi', zorluk: 'Orta', metin: 'VLAN (Sanal Yerel Alan Ağı) yapısı aynı fiziksel anahtar (switch) üzerindeki yayın alanlarını (broadcast domain) mantıksal olarak böler.', dogruDY: 'D' },
    { id: 'dy-10', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 8, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Zor', metin: 'CORS (Cross-Origin Resource Sharing) başlıkları CSRF saldırılarını tek başına tamamen engeller.', dogruDY: 'Y' },
    { id: 'dy-11', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 3, kazanim: 'ÖÇ-1: Ağ Katmanları', zorluk: 'Kolay', metin: 'OSI referans modelinde Yönlendirici (Router) cihazları 3. katman olan Ağ (Network) katmanında çalışır.', dogruDY: 'D' },
    { id: 'dy-12', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 5, kazanim: 'ÖÇ-2: Kriptografi', zorluk: 'Orta', metin: 'SHA-256 özetleme fonksiyonu çift yönlüdür; özet değerinden özel anahtar ile orijinal metin geri elde edilebilir.', dogruDY: 'Y' },
    { id: 'dy-13', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 4, kazanim: 'ÖÇ-3: Ağ Mimarisi', zorluk: 'Kolay', metin: 'NAT (Ağ Adresi Dönüşümü) iç ağdaki özel IPv4 adreslerinin tek bir genel IP üzerinden internete çıkmasını sağlar.', dogruDY: 'D' },
    { id: 'dy-14', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 6, kazanim: 'ÖÇ-2: Kriptografi', zorluk: 'Orta', metin: 'Dijital imzalarda veri özeti göndericinin açık anahtarı (public key) ile şifrelenir.', dogruDY: 'Y' },
    { id: 'dy-15', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 9, kazanim: 'ÖÇ-3: Ağ Mimarisi', zorluk: 'Orta', metin: 'IDS (Saldırı Tespit Sistemi) ağ trafiğini izler ve uyarı üretir; IPS ise saldırı paketlerini hat üzerinde anında engelleyebilir.', dogruDY: 'D' },
    { id: 'dy-16', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 10, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Zor', metin: 'JWT (JSON Web Token) imzalı olduğunda içerisindeki yük (payload) şifrelenmiş olur ve üçüncü kişilerce okunamaz.', dogruDY: 'Y' },
    { id: 'dy-17', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 12, kazanim: 'ÖÇ-3: Ağ Mimarisi', zorluk: 'Kolay', metin: 'VPN tünelleme protokolleri genel internet üzerinde şifreli bir sanal iletişim kanalı oluşturur.', dogruDY: 'D' },
    { id: 'dy-18', dersId: 'ders-ag-guvenlik', tur: 'dy', hafta: 14, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Orta', metin: 'Sıfır Güven (Zero-Trust) mimarisinde iç ağdaki tüm cihazlara varsayılan olarak tam yetki verilir.', dogruDY: 'Y' },

    // --- ÇOKTAN SEÇMELİ TEST SORULARI (22 Adet · 1–14. Haftalara Dağıtılmış) ---
    {
      id: 'test-1', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 1, kazanim: 'ÖÇ-1: Ağ Katmanları', zorluk: 'Kolay',
      metin: 'OSI 7 katmanlı referans modelinde uçtan uca hata kontrolü ve akış denetiminden sorumlu 4. katman aşağıdakilerden hangisidir?',
      siklar: ['Fiziksel Katman', 'Veri Bağı Katmanı', 'Ağ Katmanı', 'Taşıma (Transport) Katmanı', 'Uygulama Katmanı'],
      dogruHarf: 'D'
    },
    {
      id: 'test-2', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 2, kazanim: 'ÖÇ-1: Ağ Katmanları', zorluk: 'Orta',
      metin: '192.168.10.0/26 alt ağ maskesine sahip bir IPv4 ağında cihazlara atanabilecek maksimum kullanılabilir (host) IP adresi sayısı kaçtır?',
      siklar: ['30', '62', '64', '126', '254'],
      dogruHarf: 'B'
    },
    {
      id: 'test-3', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 4, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Orta',
      metin: 'Bir web uygulamasında kullanıcının başka bir kullanıcının fatura ID numarasını URL üzerinden değiştirerek (`?faturaId=1042`) yetkisiz erişmesi OWASP Top 10:2025 kapsamında hangi zafiyet sınıfına girer?',
      siklar: ['A01: Bozuk Erişim Kontrolü (IDOR)', 'A02: Kriptografik Hatalar', 'A05: Güvenlik Yanlış Yapılandırması', 'A07: Kimlik Doğrulama Hataları', 'A09: Güvenlik Kayıt ve İzleme Hataları'],
      dogruHarf: 'A'
    },
    {
      id: 'test-4', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 1, kazanim: 'ÖÇ-1: Ağ Katmanları', zorluk: 'Kolay',
      metin: 'Aşağıdaki protokollerden hangisi güvenli uzak kabuk (remote shell) bağlantısı sağlamak için varsayılan olarak TCP 22 portunu kullanır?',
      siklar: ['Telnet', 'FTP', 'SSH', 'SNMP', 'RDP'],
      dogruHarf: 'C'
    },
    {
      id: 'test-5', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 3, kazanim: 'ÖÇ-2: Kriptografi', zorluk: 'Orta',
      metin: 'Parola özetlerinin (hash) saklanmasında bellek-zorlu (memory-hard) yapısı sayesinde GPU/ASIC saldırılarına karşı güncel sistemlerde öncelikli önerilen algoritma hangisidir?',
      siklar: ['MD5', 'SHA-1', 'CRC32', 'Argon2id', 'DES'],
      dogruHarf: 'D'
    },
    {
      id: 'test-6', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 5, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Orta',
      metin: 'Tarayıcıdaki oturum çerezinin (Session Cookie) JavaScript üzerinden `document.cookie` ile okunmasını engelleyen güvenlik bayrağı hangisidir?',
      siklar: ['SameSite=None', 'HttpOnly', 'Path=/', 'Max-Age', 'Domain'],
      dogruHarf: 'B'
    },
    {
      id: 'test-7', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 2, kazanim: 'ÖÇ-3: Ağ Mimarisi', zorluk: 'Zor',
      metin: 'Bir yerel ağda saldırganın sahte ARP yanıtları göndererek ağ geçidi (gateway) trafiğini kendi bilgisayarından geçirmesine ne ad verilir?',
      siklar: ['DNS Zone Transfer', 'ARP Zehirlenmesi (ARP Spoofing)', 'BGP Hijacking', 'SYN Flood', 'Ping of Death'],
      dogruHarf: 'B'
    },
    {
      id: 'test-8', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 3, kazanim: 'ÖÇ-1: Ağ Katmanları', zorluk: 'Kolay',
      metin: 'Aşağıdaki IPv4 adreslerinden hangisi RFC 1918 standardına göre özel (private) iç ağ adres bloğunda yer alır?',
      siklar: ['8.8.8.8', '172.20.14.5', '172.35.1.1', '11.0.0.1', '200.10.5.1'],
      dogruHarf: 'B'
    },
    {
      id: 'test-9', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 5, kazanim: 'ÖÇ-2: Kriptografi', zorluk: 'Orta',
      metin: 'TLS 1.3 protokolünde ileri yönlü gizliliği (Forward Secrecy) garanti altına almak için hangi anahtar değişim mekanizması zorunlu kılınmıştır?',
      siklar: ['Statik RSA', 'Geçici Diffie-Hellman (ECDHE / DHE)', '3DES', 'RC4', 'MD5-HMAC'],
      dogruHarf: 'B'
    },
    {
      id: 'test-10', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 6, kazanim: 'ÖÇ-3: Ağ Mimarisi', zorluk: 'Orta',
      metin: 'Bir güvenlik duvarının (Firewall) yalnızca paket başlıklarına değil, aktif bağlantı durum tablosuna (Connection State Table) bakarak karar vermesi hangi mimariyi ifade eder?',
      siklar: ['Stateless Packet Filter', 'Stateful Inspection (Durum Denetimli)', 'MAC Filtreleme', 'Hub Yönlendirme', 'Repeater Modu'],
      dogruHarf: 'B'
    },
    {
      id: 'test-11', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 7, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Zor',
      metin: 'Sunucu tarafı istek sahteciliği (SSRF) saldırılarında bulut ortamlarındaki (AWS/GCP) iç metadata servisine erişimi engellemek için hangi IP adresi filtrelenmelidir?',
      siklar: ['127.0.0.53', '169.254.169.254', '255.255.255.0', '224.0.0.1', '192.0.2.1'],
      dogruHarf: 'B'
    },
    {
      id: 'test-12', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 4, kazanim: 'ÖÇ-1: Ağ Katmanları', zorluk: 'Kolay',
      metin: 'Ağa yeni katılan bir istemciye otomatik olarak IP adresi, alt ağ maskesi ve varsayılan ağ geçidi bilgilerini dağıtan protokol hangisidir?',
      siklar: ['ICMP', 'DHCP', 'SMTP', 'IMAP', 'NTP'],
      dogruHarf: 'B'
    },
    {
      id: 'test-13', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 6, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Orta',
      metin: 'Web sayfalarında kullanıcı girdisinin HTML karakter kodlaması (encoding) yapılmadan doğrudan DOM içine basılması hangi zafiyete yol açar?',
      siklar: ['Cross-Site Scripting (XSS)', 'Buffer Overflow', 'ARP Spoofing', 'VLAN Hopping', 'DNS Cache Poisoning'],
      dogruHarf: 'A'
    },
    {
      id: 'test-14', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 7, kazanim: 'ÖÇ-1: Ağ Katmanları', zorluk: 'Orta',
      metin: 'Bir paketin ağda sonsuz döngüye girmesini önlemek için her yönlendirici (router) geçişinde 1 azaltılan IPv4 başlık alanı hangisidir?',
      siklar: ['Window Size', 'TTL (Time to Live)', 'Sequence Number', 'Urgent Pointer', 'Fragment Offset'],
      dogruHarf: 'B'
    },
    {
      id: 'test-15', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 8, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Zor',
      metin: 'İstemciye Sıfır Güven (Zero-Trust Client) mimarisinde online sınav puanlaması nerede yapılmalıdır?',
      siklar: ['Tarayıcıda localStorage içinde', 'İstemciden gelen puan parametresiyle', 'Yalnızca yetkili sunucu tarafında (Server Authority)', 'URL query parametresinde', 'CSS dosyasında'],
      dogruHarf: 'C'
    },
    {
      id: 'test-16', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 1, kazanim: 'ÖÇ-1: Ağ Katmanları', zorluk: 'Kolay',
      metin: 'Bir IPv4 adresi toplam kaç bitten oluşur?',
      siklar: ['16 bit', '32 bit', '48 bit', '64 bit', '128 bit'],
      dogruHarf: 'B'
    },
    {
      id: 'test-17', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 3, kazanim: 'ÖÇ-2: Kriptografi', zorluk: 'Orta',
      metin: 'Simetrik blok şifreleme standartları arasında günümüzde en yaygın kullanılan ve NIST tarafından onaylanan algoritma hangisidir?',
      siklar: ['DES', 'RC2', 'AES (Rijndael)', 'MD5', 'ROT13'],
      dogruHarf: 'C'
    },
    {
      id: 'test-18', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 5, kazanim: 'ÖÇ-2: Kriptografi', zorluk: 'Zor',
      metin: 'Parola özetleme işlemlerinde aynı parolayı kullanan iki kullanıcının özet (hash) değerlerinin birbirinden farklı çıkmasını sağlayan rastgele veriye ne ad verilir?',
      siklar: ['Salt (Tuz)', 'MAC Adresi', 'Checksum', 'TTL', 'Port No'],
      dogruHarf: 'A'
    },
    {
      id: 'test-19', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 9, kazanim: 'ÖÇ-3: Ağ Mimarisi', zorluk: 'Orta',
      metin: 'Kablosuz yerel ağlarda (Wi-Fi) SAE (Simultaneous Authentication of Equals) el sıkışmasını kullanarak sözlük saldırılarına karşı koruma sağlayan standart hangisidir?',
      siklar: ['WEP', 'WPA', 'WPA2-PSK (TKIP)', 'WPA3', 'MAC Filtresi'],
      dogruHarf: 'D'
    },
    {
      id: 'test-20', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 10, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Orta',
      metin: 'REST API servislerinde aşırı istek gönderilerek sistemin tüketilmesini (Brute-Force / DoS) engellemek için kullanılan temel savunma mekanizması hangisidir?',
      siklar: ['Rate Limiting (İstek Hızı Sınırlandırma)', 'Base64 Kodlama', 'FTP Aktif Mod', 'ARP Tablosu', 'DNS Önbellekleme'],
      dogruHarf: 'A'
    },
    {
      id: 'test-21', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 11, kazanim: 'ÖÇ-3: Ağ Mimarisi', zorluk: 'Kolay',
      metin: 'Bir ağdaki hedef sistemin erişilebilir olup olmadığını test etmek için kullanılan `ping` komutu hangi protokolü kullanır?',
      siklar: ['FTP', 'ICMP', 'SMTP', 'POP3', 'SSH'],
      dogruHarf: 'B'
    },
    {
      id: 'test-22', dersId: 'ders-ag-guvenlik', tur: 'test', hafta: 13, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Zor',
      metin: 'JSON yedek/ithalat işlemlerinde iç içe geçmiş nesnelerle sunucu belleğinin tüketilmesini (Stack Overflow / DoS) önlemek için hangi kontrol uygulanmalıdır?',
      siklar: ['Maksimum derinlik sınırı (Depth Limit > 12 reddi)', 'Sadece CSS gizleme', 'Renk kontrast ayarı', 'Font küçültme', 'Ping testi'],
      dogruHarf: 'A'
    },

    // --- AÇIK UÇLU / KLASİK SORULAR (6 Adet · 1–14. Haftalara Dağıtılmış) ---
    {
      id: 'klasik-1', dersId: 'ders-ag-guvenlik', tur: 'klasik', hafta: 4, kazanim: 'ÖÇ-3: Ağ Mimarisi', zorluk: 'Orta',
      metin: 'Bir kurumsal ağda DMZ (Arındırılmış Bölge) mimarisinin neden kullanıldığını; dış dünyadan erişilen Web Sunucusu ile iç ağdaki Veritabanı Sunucusunun konumlandırılmasını açıklayınız.',
      rubrik: 'DMZ tanımı ve izolasyon amacı (4p) + Web sunucusunun DMZ içinde, Veritabanının iç ağda konumlandırılması (4p) + Firewall kural yönü (2p)'
    },
    {
      id: 'klasik-2', dersId: 'ders-ag-guvenlik', tur: 'klasik', hafta: 6, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Zor',
      metin: 'İstemciye Sıfır Güven (Zero-Trust Client) ilkesini tanımlayınız. Bir online sınav uygulamasında istemciden gelen `puan` ve `dogruCevap` alanlarına neden güvenilmemesi gerektiğini örnekleyiniz.',
      rubrik: 'Zero-Trust tanımı (4p) + İstemci manipülasyonu / DevTools riski (3p) + Sunucu otoritesi çözümü (3p)'
    },
    {
      id: 'klasik-3', dersId: 'ders-ag-guvenlik', tur: 'klasik', hafta: 3, kazanim: 'ÖÇ-2: Kriptografi', zorluk: 'Orta',
      metin: 'Simetrik ve Asimetrik şifreleme arasındaki temel farkları hız, anahtar yönetimi ve kullanım senaryosu açısından karşılaştırınız.',
      rubrik: 'Anahtar yapısı farkı (4p) + Performans/hız karşılaştırması (3p) + TLS hibrit kullanım örneği (3p)'
    },
    {
      id: 'klasik-4', dersId: 'ders-ag-guvenlik', tur: 'klasik', hafta: 7, kazanim: 'ÖÇ-3: Ağ Mimarisi', zorluk: 'Orta',
      metin: 'Bir yerel ağda VLAN ayrımı yapılmadığında oluşabilecek güvenlik ve performans sorunlarını 2 madde halinde yazınız.',
      rubrik: 'Broadcast trafiği / performans etkisi (5p) + Ağ dinleme / yanal hareket (Lateral Movement) riski (5p)'
    },
    {
      id: 'klasik-5', dersId: 'ders-ag-guvenlik', tur: 'klasik', hafta: 2, kazanim: 'ÖÇ-1: Ağ Katmanları', zorluk: 'Kolay',
      metin: 'TCP ile UDP taşıma katmanı protokollerini bağlantı kurulumu, güvenilirlik ve hız açısından karşılaştırarak her birine birer uygulama örneği veriniz.',
      rubrik: 'Bağlantı ve paket doğrulama farkı (5p) + Doğru protokol/uygulama örnekleri (5p)'
    },
    {
      id: 'klasik-6', dersId: 'ders-ag-guvenlik', tur: 'klasik', hafta: 11, kazanim: 'ÖÇ-4: Güvenli Yazılım', zorluk: 'Zor',
      metin: 'SQL Injection ve Cross-Site Scripting (XSS) zafiyetlerinin oluşum nedenini ve her ikisi için uygulanması gereken kesin mimari savunma yöntemlerini açıklayınız.',
      rubrik: 'SQLi için Prepared Statements (5p) + XSS için Context-Aware HTML/URL Sanitizasyon ve CSP (5p)'
    }
  ];

  const VARSAYILAN_OGRENCILER = [
    { ogrNo: '2023104011', adSoyad: 'Ahmet Yılmaz', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104015', adSoyad: 'Zeynep Kaya', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104024', adSoyad: 'Mehmet Demir', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104032', adSoyad: 'Elif Çelik', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104038', adSoyad: 'Mustafa Şahin', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104042', adSoyad: 'Ayşe Yıldız', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2022109042', adSoyad: 'Burak Kaya', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104047', adSoyad: 'Burak Özdemir', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104053', adSoyad: 'Selin Arslan', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104061', adSoyad: 'Emre Doğan', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104068', adSoyad: 'Büşra Aydın', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104074', adSoyad: 'Caner Koç', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104085', adSoyad: 'Deniz Kurt', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104092', adSoyad: 'Ece Özkan', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104096', adSoyad: 'Furkan Polat', bolum: 'Bilgisayar Müh.' },
    { ogrNo: '2023104099', adSoyad: 'Gizem Aksoy', bolum: 'Bilgisayar Müh.' }
  ];

  /* ========================================================================
     11. FAZ 2: KURUMSAL KALİTE ŞABLON STÜDYOSU, BOLOGNA BİLGİ PAKETİ OKUYUCU,
         SORU BAZLI OTOMATİK ÖÇ/BLOOM ANALİZÖRÜ VE KÜMÜLATİF ÖÇ×PÇ/PUKÖ MOTORU
     ======================================================================== */
  const ORNEK_PROLIZ_BOLOGNA_METNI = [
    'Dersin Ayrıntıları',
    'Yarıyıl\tKodu\tAdı\tT+U+L\tKredi\tAKTS\tSon Güncelleme Tarihi',
    '1\t74161101\tAğ Teknolojilerine Giriş\t3+0+0\t3\t4\t11.02.2021',
    'Dersin Detayları',
    'Dersin Dili\tTürkçe',
    'Dersin Düzeyi\tÖn Lisans',
    'Bölümü / Programı\tBilgi Güvenliği Teknolojisi',
    'Öğrenim Türü\tÖrgün Öğretim',
    'Dersin Türü\tZorunlu',
    'Dersin Öğretim Şekli\tYüz Yüze',
    'Dersin Amacı\tBu derste ağ işlemlerinin yapılması ile ilgili yeterliklerin kazandırılması amaçlanmaktadır.',
    'Dersin İçeriği\tBilgisayar Ağları, Ağ Kabloları, Ağ Adresleme, Paylaşım ve güvenlik, Ağ Çevre Birimleri',
    'Dersi Verenler\tÖğr.Gör. Fatih Akman Çakmak',
    'Değerlendirme Ölçütleri',
    'Yarıyıl Çalışmaları\tSayısı\tKatkı',
    'Ara Sınav\t1\t% 40',
    'Final\t1\t% 60',
    'Toplam :\t2\t% 100',
    'Dersin Öğrenme Çıktıları: Bu dersin başarılı bir şekilde tamamlanmasıyla öğrenciler şunları yapabileceklerdir:',
    'Sıra No\tAçıklama',
    '1\tAğ yapısını hazırlayabilecek',
    '2\tAğ bağlantılarını yapılandırabilecek',
    '3\tAğ cihazlarını tanıyabilecek',
    '4\tAğ cihazlarını kullanabilecek',
    'Ders Konuları',
    'Hafta\tKonu',
    '1\tBilgisayar Ağları',
    '2\tBilgisayar Ağları',
    '3\tBilgisayar Ağları',
    '4\tAğ Kabloları',
    '5\tAğ Kabloları',
    '6\tAğ Kabloları',
    '7\tAğ Adresleme',
    '8\tAğ Adresleme',
    '9\tAğ Adresleme',
    '10\tPaylaşım ve Güvenlik',
    '11\tPaylaşım ve Güvenlik',
    '12\tPaylaşım ve Güvenlik',
    '13\tAğ Çevre Birimleri',
    '14\tAğ Çevre Birimleri',
    'Dersin Program Çıktılarına Katkısı',
    'P1\tP2\tP3\tP4\tP4\tP5\tP6\tP7\tP8\tP9\tP10',
    'Tüm\t5\t3\t5\t5\t5',
    'Ö1',
    'Ö2',
    'Ö3',
    'Ö4'
  ].join('\n');

  const VARSAYILAN_KURUMSAL_SABLONLAR = [
    {
      id: 'kurum-standart-myo-2026',
      ad: '🏛️ Üniversite / MYO Standart Kalite Formu (FR-EĞT-01)',
      kurumAdi: 'T.C. ÜNİVERSİTE REKTÖRLÜĞÜ',
      birimAdi: 'Meslek Yüksekokulu Müdürlüğü · Bilgi Güvenliği Teknolojisi Programı',
      dokumanNo: 'FR-EĞT-01',
      yayinTarihi: '15.09.2023',
      revizyonNo: '02',
      revizyonTarihi: '01.09.2025',
      logoDataUrl: '',
      sinavAntet: {
        ustBaslikHtml: '{{KURUM_ADI}} — {{BIRIM_ADI}} | {{DERS_KODU}} {{DERS_ADI}} ({{SINAV_TURU}} - {{KITAPCIK_GRUBU}} Grubu)',
        altOnayHtml: 'Doküman No: {{DOKUMAN_NO}} · Yayın: {{YAYIN_TARIHI}} · Rev: {{REVIZYON_NO}} · Ders Sorumlusu: {{DERS_SORUMLUSU}} · {{SAYFA_NO}}'
      },
      yoklamaSablonu: {
        baslik: 'RESMİ SINAV YOKLAMA VE KİTAPÇIK GRUBU İMZA ÇİZELGESİ',
        gozetmenImzaSayisi: 2,
        aciklamaNotu: 'Öğrenciler kendi kitapçık grubunu kontrol ederek tükenmez kalemle imzalar.'
      },
      tutanakSablonu: {
        baslik: 'SINAV UYGULAMA VE EVRAK TESLİM TUTANAĞI',
        teslimAlanUnvan: 'Bölüm Sınav Arşiv Komisyonu'
      },
      bolognaRaporSablonu: {
        akreditasyonTuru: 'YÖKAK / MEDEK',
        barajYuzde: 60,
        komisyonBaslik: 'Bölüm Kalite ve Akreditasyon Komisyonu Başkanlığına'
      },
      obsCsvSablonu: {
        sistemAdi: 'Proliz OİBS',
        ayirici: ';',
        sutunlar: ['OGRENCI_NO', 'AD_SOYAD', 'KITAPCIK', 'PUAN', 'HARF_NOTU', 'DURUM']
      }
    },
    {
      id: 'kurum-mudek-muhendislik-2026',
      ad: '🎓 MÜDEK / MEDEK Akreditasyon Uyumlu Sınav Şablonu (FR-AKR-04)',
      kurumAdi: 'T.C. MÜHENDİSLİK VE DOĞA BİLİMLERİ FAKÜLTESİ',
      birimAdi: 'Bilgisayar Mühendisliği Bölümü',
      dokumanNo: 'FR-AKR-04',
      yayinTarihi: '01.10.2024',
      revizyonNo: '01',
      revizyonTarihi: '10.02.2026',
      logoDataUrl: '',
      sinavAntet: {
        ustBaslikHtml: '{{KURUM_ADI}} · {{BIRIM_ADI}} | {{DERS_KODU}} {{DERS_ADI}} — {{SINAV_TURU}}',
        altOnayHtml: 'Kalite Kodu: {{DOKUMAN_NO}} (Rev.{{REVIZYON_NO}}) · Sınav Tarihi: {{TARIH}} ({{SURE}} dk) · {{DERS_SORUMLUSU}}'
      },
      yoklamaSablonu: {
        baslik: 'MÜDEK / MEDEK KANIT DOSYASI — SINAV İMZA LİSTESİ',
        gozetmenImzaSayisi: 2,
        aciklamaNotu: 'Bu çizelge akreditasyon kanıt klasöründe 5 yıl süreyle saklanır.'
      },
      tutanakSablonu: {
        baslik: 'AKREDİTASYON SINAV UYGULAMA VE TESLİM TUTANAĞI',
        teslimAlanUnvan: 'Bölüm Akreditasyon Koordinatörlüğü'
      },
      bolognaRaporSablonu: {
        akreditasyonTuru: 'MÜDEK / ABET / MEDEK',
        barajYuzde: 65,
        komisyonBaslik: 'Program Çıktıları İzleme ve PUKÖ Komisyonuna'
      },
      obsCsvSablonu: {
        sistemAdi: 'ÜBYS / Genel OBS',
        ayirici: ';',
        sutunlar: ['OGRENCI_NO', 'AD_SOYAD', 'PUAN', 'HARF_NOTU', 'YUZDELIK_DILIM']
      }
    }
  ];

  function uygulaKurumsalYerTutucular(sablonMetni = '', baglam = {}) {
    const ham = String(sablonMetni || '');
    if (!ham) return '';
    const harita = {
      KURUM_ADI: baglam.KURUM_ADI || baglam.kurumAdi || 'T.C. ÜNİVERSİTE REKTÖRLÜĞÜ',
      BIRIM_ADI: baglam.BIRIM_ADI || baglam.birimAdi || '',
      DOKUMAN_NO: baglam.DOKUMAN_NO || baglam.dokumanNo || 'FR-EĞT-01',
      YAYIN_TARIHI: baglam.YAYIN_TARIHI || baglam.yayinTarihi || '',
      REVIZYON_NO: baglam.REVIZYON_NO || baglam.revizyonNo || '00',
      REVIZYON_TARIHI: baglam.REVIZYON_TARIHI || baglam.revizyonTarihi || '',
      DERS_KODU: baglam.DERS_KODU || baglam.dersKodu || '',
      DERS_ADI: baglam.DERS_ADI || baglam.dersAdi || '',
      SINAV_TURU: baglam.SINAV_TURU || baglam.sinavTuru || 'ARA SINAV',
      KITAPCIK_GRUBU: baglam.KITAPCIK_GRUBU || baglam.kitapcikGrubu || 'A',
      TARIH: baglam.TARIH || baglam.tarih || '',
      SURE: baglam.SURE || baglam.sure || '60',
      DERS_SORUMLUSU: baglam.DERS_SORUMLUSU || baglam.dersSorumlusu || '',
      SAYFA_NO: baglam.SAYFA_NO || baglam.sayfaNo || 'Sayfa 1 / 2'
    };
    return ham.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_, anahtar) => {
      if (anahtar === 'KURUM_LOGO') {
        const logo = String(baglam.KURUM_LOGO || baglam.logoDataUrl || '').trim();
        return logo && guvenliURL(logo) ? '[LOGO]' : '';
      }
      if (Object.prototype.hasOwnProperty.call(harita, anahtar)) {
        return String(harita[anahtar] ?? '');
      }
      return '';
    });
  }

  function cikarHtmlTabloSatirlari(hamHtml = '') {
    const satirlar = [];
    const trEslesmeler = String(hamHtml || '').match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const tr of trEslesmeler) {
      const hucreEslesmeler = tr.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
      if (!hucreEslesmeler.length) continue;
      const hucreler = hucreEslesmeler.map((td) =>
        cozHtmlEntities(td.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim()
      );
      satirlar.push(hucreler);
    }
    return satirlar;
  }

  /* Proliz OİBS / ÜBYS / Genel Bologna Bilgi Paketi Çok Kanallı Ayrıştırıcı */
  function cozBolognaBilgiPaketi(girdiMetinVeyaHtml = '') {
    const ham = String(girdiMetinVeyaHtml || '').trim();
    if (!ham) {
      return { gecerli: false, hata: 'Bologna metni veya HTML içeriği boş.' };
    }
    const htmlMi = /<(table|tr|td|th|div|p)\b/i.test(ham);
    const htmlSatirlari = htmlMi ? cikarHtmlTabloSatirlari(ham) : [];
    const duzMetin = htmlMi
      ? cozHtmlEntities(
          ham
            .replace(/<\/t[dh]>/gi, '\t')
            .replace(/<\/(tr|p|div|li|h[1-6])>/gi, '\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
        )
      : cozHtmlEntities(ham);

    const satirlar = duzMetin
      .split(/\r?\n/)
      .map((s) => s.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, (m) => (m.includes('\t') ? '\t' : ' ')).trim())
      .filter(Boolean);

    const sonuc = {
      gecerli: true,
      kaynakTuru: htmlMi ? 'html_tablo' : 'duz_metin',
      yariyil: '',
      kod: '',
      ad: '',
      tUL: '',
      kredi: 0,
      akts: 0,
      dil: 'Türkçe',
      duzey: '',
      bolum: '',
      ogretimElemani: '',
      amac: '',
      icerik: '',
      degerlendirmeOlcutleri: [],
      ogrenimCiktilari: [],
      haftalikKonular: [],
      programCiktilari: {
        sutunlar: [],
        kanonikSutunlar: [],
        tumSatiri: {},
        ocPcMatrisi: {},
        ocPcSatirlariBosMu: false,
        otomatikOneriUretildiMi: false,
        mukerrerSutunlar: []
      },
      uyarilar: []
    };

    // 1. Dersin Ayrıntıları (Yarıyıl, Kodu, Adı, T+U+L, Kredi, AKTS)
    for (let i = 0; i < satirlar.length; i++) {
      const s = satirlar[i];
      // Sekmeli tek satır: 1 \t 74161101 \t Ağ Teknolojilerine Giriş \t 3+0+0 \t 3 \t 4
      const sekmeParca = s.split('\t').map((p) => p.trim()).filter(Boolean);
      if (sekmeParca.length >= 5 && /^\d{1,2}$/.test(sekmeParca[0]) && /^[A-ZÇĞİÖŞÜ0-9.-]{4,16}$/i.test(sekmeParca[1]) && /\d+\+\d+(\+\d+)?/.test(s)) {
        const tulIdx = sekmeParca.findIndex((p) => /^\d+\+\d+(\+\d+)?$/.test(p));
        if (tulIdx >= 2) {
          sonuc.yariyil = sekmeParca[0];
          sonuc.kod = sekmeParca[1];
          sonuc.ad = sekmeParca.slice(2, tulIdx).join(' ');
          sonuc.tUL = sekmeParca[tulIdx];
          sonuc.kredi = Number(sekmeParca[tulIdx + 1] || 0) || 0;
          sonuc.akts = Number(sekmeParca[tulIdx + 2] || 0) || 0;
          break;
        }
      }
      // Alt alta kopyalanmış Proliz başlık dizisi: Son Güncelleme Tarihi -> ardından 7 satır değer
      if (/^Son Güncelleme Tarihi$/i.test(s) && i + 6 < satirlar.length) {
        const adayYariyil = satirlar[i + 1];
        const adayKod = satirlar[i + 2];
        const adayAd = satirlar[i + 3];
        const adayTul = satirlar[i + 4];
        if (/^\d{1,2}$/.test(adayYariyil) && /^[A-ZÇĞİÖŞÜ0-9.-]{4,16}$/i.test(adayKod) && /^\d+\+\d+(\+\d+)?$/.test(adayTul)) {
          sonuc.yariyil = adayYariyil;
          sonuc.kod = adayKod;
          sonuc.ad = adayAd;
          sonuc.tUL = adayTul;
          sonuc.kredi = Number(satirlar[i + 5] || 0) || 0;
          sonuc.akts = Number(String(satirlar[i + 6] || '').match(/\d+/)?.[0] || 0) || 0;
          break;
        }
      }
    }

    // Anahtar-Değer alanları (sekme ile veya alt satırda)
    const cikarAlan = (etiketRegex) => {
      for (let i = 0; i < satirlar.length; i++) {
        const parcalar = satirlar[i].split('\t').map((p) => p.trim()).filter(Boolean);
        if (parcalar.length >= 2 && etiketRegex.test(parcalar[0])) {
          return parcalar.slice(1).join(' ');
        }
        if (etiketRegex.test(satirlar[i]) && i + 1 < satirlar.length) {
          const kalan = satirlar[i].replace(etiketRegex, '').replace(/^[:\s-]+/, '').trim();
          if (kalan && kalan.length > 1) return kalan;
          const sonraki = satirlar[i + 1].trim();
          if (sonraki && !/^(Dersin |Öğrenim |Değerlendirme |AKTS |Ders )/i.test(sonraki)) {
            return sonraki;
          }
        }
      }
      return '';
    };

    sonuc.duzey = cikarAlan(/^Dersin Düzeyi$/i) || sonuc.duzey;
    sonuc.bolum = cikarAlan(/^Bölümü\s*\/\s*Programı$/i) || sonuc.bolum;
    sonuc.ogretimElemani = cikarAlan(/^Dersi Verenler$/i) || sonuc.ogretimElemani;
    sonuc.amac = cikarAlan(/^Dersin Amacı$/i) || sonuc.amac;
    sonuc.icerik = cikarAlan(/^Dersin İçeriği$/i) || sonuc.icerik;
    if (!sonuc.kod) {
      const kodEsl = duzMetin.match(/\b([A-Z]{2,5}\s?-?\s?\d{3}|\d{7,10})\b/);
      if (kodEsl) sonuc.kod = kodEsl[1].replace(/\s+/g, '');
    }

    // 2. Değerlendirme Ölçütleri (Ara Sınav %40, Final %60, Ödev/Kısa Sınav vb.)
    const degBas = satirlar.findIndex((s) => /Değerlendirme Ölçütleri/i.test(s));
    if (degBas >= 0) {
      for (let i = degBas + 1; i < Math.min(satirlar.length, degBas + 28); i++) {
        const s = satirlar[i];
        if (/^(AKTS Hesaplama|Dersin Öğrenme Çıktıları|Toplam\s*:)/i.test(s)) break;
        if (/^(Yarıyıl Çalışmaları|Sayısı|Katkı)$/i.test(s)) continue;
        // Tek satır: Ara Sınav \t 1 \t % 40
        const tekEsl = s.match(/^(Ara\s*Sınav|Vize|Final|Yarıyıl\s*Sonu|Bütünleme|Kısa\s*Sınav|Quiz|Ödev|Proje|Uygulama|Laboratuvar)[^\d%]*(\d+)?\s*%?\s*(\d{1,3})\s*%?$/i);
        if (tekEsl && s.includes('%')) {
          const ad = tekEsl[1].trim();
          const katki = Number(s.match(/%\s*(\d{1,3})|(\d{1,3})\s*%/)?.[1] || s.match(/%\s*(\d{1,3})|(\d{1,3})\s*%/)?.[2] || tekEsl[3]);
          if (katki > 0 && katki <= 100) {
            sonuc.degerlendirmeOlcutleri.push({
              ad,
              tur: /ara|vize/i.test(ad) ? 'vize' : (/final|yarıyıl\s*sonu/i.test(ad) ? 'final' : 'diger'),
              sayi: Number(tekEsl[2] || 1) || 1,
              katkiYuzde: katki
            });
          }
          continue;
        }
        // 3 satırlı Proliz kopyası: Ara Sınav / 1 / % 40
        if (/^(Ara\s*Sınav|Vize|Final|Yarıyıl\s*Sonu|Kısa\s*Sınav|Ödev|Proje|Uygulama)$/i.test(s) && i + 2 < satirlar.length) {
          const sayiAday = satirlar[i + 1];
          const yuzdeAday = satirlar[i + 2];
          const yEsl = yuzdeAday.match(/%\s*(\d{1,3})|(\d{1,3})\s*%/);
          if (/^\d+$/.test(sayiAday) && yEsl) {
            const katki = Number(yEsl[1] || yEsl[2]);
            sonuc.degerlendirmeOlcutleri.push({
              ad: s,
              tur: /ara|vize/i.test(s) ? 'vize' : (/final|yarıyıl\s*sonu/i.test(s) ? 'final' : 'diger'),
              sayi: Number(sayiAday) || 1,
              katkiYuzde: katki
            });
            i += 2;
          }
        }
      }
    }

    // 3. Dersin Öğrenme Çıktıları (Ö1..Ön / Sıra No 1..n -> ÖÇ-1..ÖÇ-n)
    const ocBas = satirlar.findIndex((s) => /Dersin Öğrenme Çıktıları|Öğrenme Çıktıları/i.test(s));
    if (ocBas >= 0) {
      for (let i = ocBas + 1; i < satirlar.length; i++) {
        const s = satirlar[i];
        if (/^(Ders Konuları|Haftalık Konular|Dersin Program Çıktılarına)/i.test(s)) break;
        if (/^(Sıra\s*No|Açıklama|Sıra\s*No\s+Açıklama)$/i.test(s)) continue;
        // Tek satır: "1 \t Ağ yapısını hazırlayabilecek" veya "ÖÇ-1: ..."
        const tekOc = s.match(/^(?:ÖÇ-?|OC-?|DÖÇ-?|LO-?|Ö)?(\d{1,2})[\s.:\t-]+(.{5,})$/i);
        if (tekOc) {
          const no = Number(tekOc[1]);
          sonuc.ogrenimCiktilari.push({
            siraNo: no,
            kod: `ÖÇ-${no}`,
            hamKod: `Ö${no}`,
            aciklama: tekOc[2].trim()
          });
          continue;
        }
        // Alt alta 2 satır: "1" ardından "Ağ yapısını hazırlayabilecek"
        if (/^(?:ÖÇ-?|OC-?|Ö)?(\d{1,2})$/i.test(s) && i + 1 < satirlar.length) {
          const no = Number(s.replace(/\D+/g, ''));
          const aciklama = satirlar[i + 1].trim();
          if (no >= 1 && no <= 30 && aciklama.length >= 5 && !/^(Ders Konuları|\d{1,2})$/i.test(aciklama)) {
            sonuc.ogrenimCiktilari.push({
              siraNo: no,
              kod: `ÖÇ-${no}`,
              hamKod: `Ö${no}`,
              aciklama
            });
            i += 1;
          }
        }
      }
    }

    // 4. Haftalık Ders Konuları (1..14 Hafta)
    const konuBas = satirlar.findIndex((s) => /^Ders Konuları$|^Haftalık Ders Konuları$/i.test(s));
    if (konuBas >= 0) {
      for (let i = konuBas + 1; i < satirlar.length; i++) {
        const s = satirlar[i];
        if (/^(Dersin Program Çıktılarına|Program Çıktıları|Değerlendirme)/i.test(s)) break;
        if (/^(Hafta|Konu|Ön Hazırlık|Dökümanlar|Hafta\s+Konu)/i.test(s)) continue;
        const tekHafta = s.match(/^(\d{1,2})[\s.\t-]+(.{3,})$/);
        if (tekHafta) {
          const hNo = Number(tekHafta[1]);
          if (hNo >= 1 && hNo <= 16) {
            sonuc.haftalikKonular.push({ hafta: hNo, konu: tekHafta[2].split('\t')[0].trim() });
          }
          continue;
        }
        if (/^\d{1,2}$/.test(s) && i + 1 < satirlar.length) {
          const hNo = Number(s);
          const konuMetni = satirlar[i + 1].trim();
          if (hNo >= 1 && hNo <= 16 && konuMetni && !/^\d{1,2}$/.test(konuMetni) && !/^Dersin Program/i.test(konuMetni)) {
            sonuc.haftalikKonular.push({ hafta: hNo, konu: konuMetni });
            i += 1;
          }
        }
      }
    }

    // 5. Program Çıktılarına Katkı Tablosu (HTML <td> boş hücre korumalı + Düz Metin Proliz Korumalı)
    let pcIslendi = false;
    if (htmlSatirlari.length > 0) {
      const baslikIdx = htmlSatirlari.findIndex((r) => r.filter((c) => /^P\s*-?\s*\d{1,2}$|^PÇ\s*-?\s*\d{1,2}$/i.test(c)).length >= 3);
      if (baslikIdx >= 0) {
        const hamBaslik = htmlSatirlari[baslikIdx];
        const pcSutunIndeksleri = [];
        const gorulen = new Map();
        hamBaslik.forEach((h, cIdx) => {
          const m = h.match(/^(?:PÇ|P)\s*-?\s*(\d{1,2})$/i);
          if (m) {
            const pKod = `PÇ-${Number(m[1])}`;
            gorulen.set(pKod, (gorulen.get(pKod) || 0) + 1);
            const etiket = gorulen.get(pKod) > 1 ? `${pKod}_TEKRAR_${gorulen.get(pKod)}` : pKod;
            if (gorulen.get(pKod) === 2) sonuc.programCiktilari.mukerrerSutunlar.push(pKod);
            pcSutunIndeksleri.push({ cIdx, ham: h, pKod, anahtar: etiket });
          }
        });
        sonuc.programCiktilari.sutunlar = pcSutunIndeksleri.map((x) => x.ham);
        sonuc.programCiktilari.kanonikSutunlar = Array.from(new Set(pcSutunIndeksleri.map((x) => x.pKod)));

        for (let r = baslikIdx + 1; r < htmlSatirlari.length; r++) {
          const row = htmlSatirlari[r];
          if (!row.length) continue;
          const ilk = row[0] || '';
          if (/^Katkı Düzeyi/i.test(ilk)) break;
          if (/^Tüm$/i.test(ilk)) {
            pcSutunIndeksleri.forEach((sut) => {
              const deger = Number(row[sut.cIdx] || 0);
              if (deger >= 1 && deger <= 5) {
                sonuc.programCiktilari.tumSatiri[sut.pKod] = Math.max(sonuc.programCiktilari.tumSatiri[sut.pKod] || 0, deger);
              }
            });
          } else if (/^(?:ÖÇ|OC|Ö)\s*-?\s*(\d{1,2})$/i.test(ilk)) {
            const ocNo = Number(ilk.replace(/\D+/g, ''));
            const ocKod = `ÖÇ-${ocNo}`;
            sonuc.programCiktilari.ocPcMatrisi[ocKod] = sonuc.programCiktilari.ocPcMatrisi[ocKod] || {};
            pcSutunIndeksleri.forEach((sut) => {
              const deger = Number(row[sut.cIdx] || 0);
              if (deger >= 1 && deger <= 5) {
                sonuc.programCiktilari.ocPcMatrisi[ocKod][sut.pKod] = deger;
              }
            });
          }
        }
        pcIslendi = true;
      }
    }

    if (!pcIslendi) {
      const pcBas = satirlar.findIndex((s) => /Dersin Program Çıktılarına Katkısı/i.test(s));
      if (pcBas >= 0) {
        const hamSutunlar = [];
        const tumDegerler = [];
        let tumGoruldu = false;
        for (let i = pcBas + 1; i < satirlar.length; i++) {
          const s = satirlar[i];
          if (/^Katkı Düzeyi/i.test(s)) break;
          const parcalar = s.split(/\s+/);
          if (!tumGoruldu && parcalar.every((p) => /^(?:PÇ|P)-?\d{1,2}$/i.test(p))) {
            hamSutunlar.push(...parcalar);
            continue;
          }
          if (/^Tüm(\b|\s)/i.test(s)) {
            tumGoruldu = true;
            const sayilar = s.replace(/^Tüm/i, '').trim().split(/\s+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 5);
            tumDegerler.push(...sayilar);
            continue;
          }
          if (tumGoruldu && /^[1-5]$/.test(s)) {
            tumDegerler.push(Number(s));
            continue;
          }
          if (/^(?:ÖÇ|Ö)\s*-?\s*\d{1,2}/i.test(s)) {
            const parca = s.split(/\s+/);
            const ocNo = Number(parca[0].replace(/\D+/g, ''));
            const ocKod = `ÖÇ-${ocNo}`;
            sonuc.programCiktilari.ocPcMatrisi[ocKod] = sonuc.programCiktilari.ocPcMatrisi[ocKod] || {};
            const sayilar = parca.slice(1).map(Number).filter((n) => n >= 1 && n <= 5);
            sayilar.forEach((n, idx) => {
              sonuc.programCiktilari.ocPcMatrisi[ocKod][`PÇ-${idx + 1}`] = n;
            });
          }
        }
        const gorulen = new Map();
        const kanonik = [];
        hamSutunlar.forEach((h) => {
          const no = Number(h.replace(/\D+/g, ''));
          const pKod = `PÇ-${no}`;
          gorulen.set(pKod, (gorulen.get(pKod) || 0) + 1);
          if (gorulen.get(pKod) === 2) sonuc.programCiktilari.mukerrerSutunlar.push(pKod);
          if (!kanonik.includes(pKod)) kanonik.push(pKod);
        });
        sonuc.programCiktilari.sutunlar = hamSutunlar;
        sonuc.programCiktilari.kanonikSutunlar = kanonik.length ? kanonik : ['PÇ-1', 'PÇ-2', 'PÇ-3', 'PÇ-4', 'PÇ-5'];
        // Düz metinde boş hücre kaybolduğunda gelen katkı değerlerini sırasıyla PÇ-1..PÇ-k ile eşle ve uyar
        tumDegerler.forEach((val, idx) => {
          const hedefPc = sonuc.programCiktilari.kanonikSutunlar[idx] || `PÇ-${idx + 1}`;
          sonuc.programCiktilari.tumSatiri[hedefPc] = val;
        });
      }
    }

    if (sonuc.programCiktilari.mukerrerSutunlar.length > 0) {
      sonuc.uyarilar.push(
        `Bologna kaynak tablosunda mükerrer Program Çıktısı sütunu tespit edildi (${sonuc.programCiktilari.mukerrerSutunlar.join(', ')}). Kanonik PÇ sütunlarıyla normalize edildi.`
      );
    }

    // Proliz Saha Koruması: Ö1..Ön satırları boş bırakılıp yalnız "Tüm" satırı doldurulmuşsa otomatik ÖÇ × PÇ (1–5) matris önerisi üret
    const ocKodListesi = sonuc.ogrenimCiktilari.map((o) => o.kod);
    const doluOcSatirSayisi = ocKodListesi.filter((kod) => Object.keys(sonuc.programCiktilari.ocPcMatrisi[kod] || {}).length > 0).length;
    if (ocKodListesi.length > 0 && doluOcSatirSayisi === 0) {
      sonuc.programCiktilari.ocPcSatirlariBosMu = true;
      const aktifPcler = Object.keys(sonuc.programCiktilari.tumSatiri);
      const bazPcler = aktifPcler.length > 0 ? aktifPcler : ['PÇ-1', 'PÇ-2', 'PÇ-3'];
      sonuc.ogrenimCiktilari.forEach((oc, ocIdx) => {
        sonuc.programCiktilari.ocPcMatrisi[oc.kod] = {};
        bazPcler.forEach((pcKod, pcIdx) => {
          const tavan = Number(sonuc.programCiktilari.tumSatiri[pcKod] || 4);
          // Birincil eşleşen PÇ'lere tam tavan katkı, yardımcı PÇ'lere 1 kademe dengeli katkı öner
          const birincilMi = (ocIdx % bazPcler.length) === pcIdx || ((ocIdx + 1) % bazPcler.length) === pcIdx;
          sonuc.programCiktilari.ocPcMatrisi[oc.kod][pcKod] = birincilMi ? tavan : Math.max(1, tavan - 1);
        });
      });
      sonuc.programCiktilari.otomatikOneriUretildiMi = true;
      sonuc.uyarilar.push(
        'Kaynak Bologna tablosunda yalnız "Tüm" katkı satırı doldurulmuş, Ö1..Ön × PÇ alt hücreleri boş bırakılmış. Dersin ÖÇ metinleri ve "Tüm" ağırlıklarına göre otomatik ÖÇ × PÇ (1–5) matris önerisi oluşturuldu.'
      );
    }

    sonuc.dersKodu = sonuc.kod;
    sonuc.dersAdi = sonuc.ad;
    sonuc.tul = sonuc.tUL;
    sonuc.bolumProgram = sonuc.bolum;
    sonuc.pcTumKatkilar = sonuc.programCiktilari.tumSatiri;
    sonuc.ocPcMatrisi = sonuc.programCiktilari.ocPcMatrisi;

    return sonuc;
  }

  /* Soru Bazlı Halüsinasyon Kilitli (Enum-Locked) Otomatik ÖÇ + Hafta + Bloom + Zorluk Analizörü */
  function etiketleSorularOtomatikOcBloom(sorular = [], bolognaVerisi = {}) {
    const hamOcListesi = Array.isArray(bolognaVerisi.ogrenimCiktilari) && bolognaVerisi.ogrenimCiktilari.length > 0
      ? bolognaVerisi.ogrenimCiktilari
      : ayiklaDersOcMaddeleri(bolognaVerisi.ogrenimCiktilariMetni || '').map((m, i) => ({
          siraNo: i + 1,
          kod: m.kod || `ÖÇ-${i + 1}`,
          aciklama: m.aciklama || m.tamMetin || `Öğrenme Çıktısı ${i + 1}`
        }));

    const gecerliOcler = hamOcListesi.length > 0
      ? hamOcListesi.map((o, i) => ({
          kod: normalizeOcKodu(o.kod || `ÖÇ-${i + 1}`) || `ÖÇ-${i + 1}`,
          aciklama: String(o.aciklama || o.tamMetin || '').trim()
        }))
      : [{ kod: 'ÖÇ-1', aciklama: 'Temel Ders Kazanımı' }];

    const haftalikKonular = Array.isArray(bolognaVerisi.haftalikKonular) ? bolognaVerisi.haftalikKonular : [];

    // Türkçe kök/kavram genişletme sözlüğü (genel akademik + bilişim/ağ/güvenlik alanı)
    const kavramKume = [
      { anahtarlar: ['kablo', 'utp', 'stp', 'rj45', 'rj-45', 'fiber', 'koaksiyel', 't568', ' konnektör', 'fiziksel katman', 'cat5', 'cat6'], ipucu: ['kablo', 'yapı', 'bağlantı', 'hazırla'] },
      { anahtarlar: ['ip ', 'ipv4', 'ipv6', 'alt ağ', 'subnet', 'cidr', 'maske', 'dhcp', 'dns', 'mac ', 'adres', 'port', 'arp', 'nat'], ipucu: ['adres', 'yapılandır', 'bağlantı'] },
      { anahtarlar: ['switch', 'router', 'hub', 'modem', 'access point', 'köprü', 'bridge', 'yönlendirici', 'anahtar', 'cihaz', 'donanım', 'güvenlik duvarı', 'firewall'], ipucu: ['cihaz', 'tanı', 'kullan'] },
      { anahtarlar: ['yapılandır', 'komut', 'kurulum', 'ayar', 'konfigürasyon', 'vlan', 'ping', 'tracert', 'ipconfig', 'kullan'], ipucu: ['yapılandır', 'kullan', 'uygula'] },
      { anahtarlar: ['topoloji', 'yıldız', 'halka', 'bus', 'mesh', 'osi', 'tcp/ip', 'lan', 'wan', 'man', 'ağ yap'], ipucu: ['ağ yap', 'hazırla', 'bilgisayar ağ'] },
      { anahtarlar: ['güvenlik', 'şifre', 'parola', 'hash', 'aes', 'tls', 'owasp', 'sql', 'xss', 'yetki', 'paylaşım', 'saldırı', 'sıfır güven'], ipucu: ['güvenlik', 'paylaşım', 'koruma', 'mimari'] },
      { anahtarlar: ['yazıcı', 'tarayıcı', 'nas', 'çevre birim', 'sunucu'], ipucu: ['çevre', 'cihaz', 'kullan'] }
    ];

    const temizKelimeler = (metin) =>
      String(metin || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/[^a-zçğıöşü0-9+/ -]/g, ' ')
        .split(/\s+/)
        .filter((k) => k.length >= 3);

    const kokAl = (k) => k.slice(0, Math.min(k.length, 5));

    return (Array.isArray(sorular) ? sorular : []).map((soru, idx) => {
      const birlesikMetin = [
        soru.metin || '',
        Array.isArray(soru.siklar) ? soru.siklar.join(' ') : '',
        soru.rubrik || ''
      ].join(' ');
      const kucuk = birlesikMetin.toLocaleLowerCase('tr-TR');
      const soruKokler = temizKelimeler(birlesikMetin).map(kokAl);

      // Aktif kavram ipuçlarını topla
      const aktifIpuclari = [];
      for (const kume of kavramKume) {
        if (kume.anahtarlar.some((a) => kucuk.includes(a.trim()))) {
          aktifIpuclari.push(...kume.ipucu);
        }
      }

      // 1. ÖÇ Puanlama (Yalnız dersin gecerliOcler listesinden seçilir -> %0 halüsinasyon)
      const ocSkorlar = gecerliOcler.map((oc, ocIdx) => {
        const ocKucuk = oc.aciklama.toLocaleLowerCase('tr-TR');
        const ocKokler = temizKelimeler(oc.aciklama).map(kokAl);
        let skor = 1;
        for (const sk of soruKokler) {
          if (ocKokler.some((ok) => ok === sk || ocKucuk.includes(sk))) skor += 3;
        }
        for (const ip of aktifIpuclari) {
          if (ocKucuk.includes(ip)) skor += 4;
        }
        // Mevcut soruda zaten geçerli bir ÖÇ tanımlıysa hafif öncelik ver
        const mevcutOc = normalizeOcKodu(soru.ocKodu || soru.kazanim || '');
        if (mevcutOc && mevcutOc === oc.kod) skor += 1.5;
        return { kod: oc.kod, aciklama: oc.aciklama, skor, ocIdx };
      });
      ocSkorlar.sort((a, b) => b.skor - a.skor || a.ocIdx - b.ocIdx);

      const birincil = ocSkorlar[0];
      const ikincilOcler = ocSkorlar
        .slice(1)
        .filter((x) => x.skor >= Math.max(5, birincil.skor * 0.72))
        .slice(0, 2)
        .map((x) => x.kod);

      // 2. Hafta (1..14) Tahmini
      let tahminHafta = normalizeHaftaNo(soru.hafta) || 1;
      let enIyiHaftaSkor = 0;
      if (haftalikKonular.length > 0) {
        for (const hk of haftalikKonular) {
          const hkKucuk = String(hk.konu || '').toLocaleLowerCase('tr-TR');
          const hkKokler = temizKelimeler(hk.konu).map(kokAl);
          let hSkor = 0;
          for (const sk of soruKokler) {
            if (hkKokler.some((ok) => ok === sk || hkKucuk.includes(sk))) hSkor += 3;
          }
          for (const ip of aktifIpuclari) {
            if (hkKucuk.includes(ip)) hSkor += 4;
          }
          if (hSkor > enIyiHaftaSkor) {
            enIyiHaftaSkor = hSkor;
            tahminHafta = hk.hafta;
          }
        }
      }
      if (enIyiHaftaSkor === 0 && gecerliOcler.length > 0) {
        const oran = birincil.ocIdx / Math.max(1, gecerliOcler.length);
        tahminHafta = Math.max(1, Math.min(14, Math.round(oran * 12) + 1));
      }

      // 3. Bloom Taksonomisi Basamağı
      let bloomBasamagi = 'Kavrama';
      if (/tasarlay|oluşturun|geliştirin|planlay|mimari kur/i.test(kucuk)) {
        bloomBasamagi = 'Yaratma';
      } else if (/değerlendir|savunun|en uygun|tercih edilme|kritik/i.test(kucuk)) {
        bloomBasamagi = 'Değerlendirme';
      } else if (/analiz|karşılaştır|farkı|neden|sebebi|hangisi yanlıştır|arıza|sorun gider/i.test(kucuk)) {
        bloomBasamagi = 'Analiz';
      } else if (/hesapla|yapılandır|uygula|komut|kaçtır.*maske|kurulum/i.test(kucuk)) {
        bloomBasamagi = 'Uygulama';
      } else if (soru.tur === 'dy' || /nedir|hangisidir|açılımı|tanımı|aşağıdakilerden hangisi/i.test(kucuk)) {
        bloomBasamagi = kucuk.length > 110 ? 'Kavrama' : 'Hatırlama';
      }

      // 4. Zorluk Tahmini
      let tahminiZorluk = 'Orta';
      if (bloomBasamagi === 'Hatırlama' || (soru.tur === 'dy' && kucuk.length < 95)) {
        tahminiZorluk = 'Kolay';
      } else if (['Analiz', 'Değerlendirme', 'Yaratma'].includes(bloomBasamagi) || soru.tur === 'klasik') {
        tahminiZorluk = 'Zor';
      }

      const guvenYuzde = Math.min(97, Math.max(68, Math.round(66 + Math.min(30, birincil.skor * 3.2))));
      const haftaKonuObj = haftalikKonular.find((h) => h.hafta === tahminHafta);

      return {
        soruId: String(soru.id || `soru-${idx + 1}`),
        siraNo: idx + 1,
        tur: soru.tur || 'test',
        soruOzet: String(soru.metin || '').slice(0, 110),
        birincilOc: birincil.kod,
        birincilOcAciklama: birincil.aciklama,
        tamKazanimMetni: birincil.aciklama ? `${birincil.kod}: ${birincil.aciklama}` : birincil.kod,
        ikincilOcler,
        ikincilOc: ikincilOcler[0] || '',
        hafta: tahminHafta,
        onerilenHafta: tahminHafta,
        haftaKonu: haftaKonuObj ? haftaKonuObj.konu : '',
        bloomBasamagi,
        tahminiZorluk,
        onerilenZorluk: tahminiZorluk,
        guvenYuzde,
        guvenSkoru: Number((guvenYuzde / 100).toFixed(2)),
        gerekce: `${birincil.kod} (${birincil.aciklama || 'Ana kazanım'}) · Hafta ${tahminHafta}${haftaKonuObj ? ' - ' + haftaKonuObj.konu : ''} · Bloom: ${bloomBasamagi}`
      };
    });
  }

  /* Baskı Öncesi ÖÇ Kapsam & Bloom Dengesi Trafik Işığı */
  function hesaplaBaskiOncesiOcBloomDengesi(seciliSorular = [], dersOcListesi = []) {
    const toplamSoru = Array.isArray(seciliSorular) ? seciliSorular.length : 0;
    const kanonikOcler = (Array.isArray(dersOcListesi) && dersOcListesi.length > 0)
      ? dersOcListesi.map((o, i) => normalizeOcKodu(typeof o === 'string' ? o : (o.kod || `ÖÇ-${i + 1}`)) || `ÖÇ-${i + 1}`)
      : ['ÖÇ-1', 'ÖÇ-2', 'ÖÇ-3', 'ÖÇ-4'];

    const sayac = {};
    kanonikOcler.forEach((k) => { sayac[k] = 0; });
    const bloomSayac = { Hatırlama: 0, Kavrama: 0, Uygulama: 0, Analiz: 0, Değerlendirme: 0, Yaratma: 0 };

    (seciliSorular || []).forEach((s) => {
      const oc = normalizeOcKodu(s.ocKodu || s.kazanim || '') || kanonikOcler[0] || 'ÖÇ-1';
      sayac[oc] = (sayac[oc] || 0) + 1;
      const hamBloom = s.bloomBasamagi || s.bloomDuzeyi || (s.tur === 'klasik' ? 'Analiz' : (s.tur === 'dy' ? 'Hatırlama' : 'Kavrama'));
      const b = hamBloom === 'Anlama' ? 'Kavrama' : hamBloom;
      bloomSayac[b] = (bloomSayac[b] || 0) + 1;
    });

    const olculmeyenler = kanonikOcler.filter((k) => (sayac[k] || 0) === 0);
    const asiriYigilanlar = kanonikOcler.filter((k) => toplamSoru >= 4 && kanonikOcler.length >= 3 && ((sayac[k] || 0) / toplamSoru) > 0.55);

    let seviye = 'yesil';
    const mesajlar = [];
    if (toplamSoru === 0) {
      seviye = 'kirmizi';
      mesajlar.push('Sınav kağıdında henüz seçili soru bulunmuyor.');
    } else {
      if (olculmeyenler.length > 0) {
        seviye = olculmeyenler.length >= Math.ceil(kanonikOcler.length / 2) ? 'kirmizi' : 'sari';
        mesajlar.push(`Bu sınavda ölçülmeyen (%0) ÖÇ var: ${olculmeyenler.join(', ')}.`);
      }
      if (asiriYigilanlar.length > 0) {
        if (seviye === 'yesil') seviye = 'sari';
        mesajlar.push(`Soru dağılımının %55'ten fazlası tek ÖÇ'de yığılmış: ${asiriYigilanlar.join(', ')}.`);
      }
      if (mesajlar.length === 0) {
        mesajlar.push(`Tüm ders öğrenme çıktıları (${kanonikOcler.join(', ')}) dengeli biçimde ölçülüyor.`);
      }
    }

    const dagilimListesi = Object.keys(sayac).map((kod) => ({
      kod,
      soruSayisi: sayac[kod],
      oranYuzde: toplamSoru > 0 ? Math.round((sayac[kod] / toplamSoru) * 100) : 0
    }));
    const ustDuzeySayi = (bloomSayac.Uygulama || 0) + (bloomSayac.Analiz || 0) + (bloomSayac.Değerlendirme || 0) + (bloomSayac.Yaratma || 0);
    const ustDuzeyBloomOrani = toplamSoru > 0 ? Math.round((ustDuzeySayi / toplamSoru) * 100) : 0;
    const ozetMesaj = mesajlar.join(' ');

    return {
      seviye,
      trafikIsigi: seviye,
      toplamSoru,
      dagilimListesi,
      ocSayilari: sayac,
      olculmeyenler,
      asiriYigilanlar,
      bloomSayac,
      ustDuzeyBloomOrani,
      ozetMesaj,
      mesaj: ozetMesaj
    };
  }

  /* Soru İptali / Esnek Anahtar Değişikliği Sonrası Okunan Tüm Kağıtları Anlık Yeniden Puanlayıcı */
  function yenidenPuanlaOkumaSonuclari(okumaSonuclari = [], sinavYapisi = {}) {
    const iptalSet = new Set(Array.isArray(sinavYapisi.iptalEdilenSorular) ? sinavYapisi.iptalEdilenSorular : []);
    const esnekKurallar = cozEsnekAnahtarKurallari(sinavYapisi.esnekAnahtarMetni || '');
    const dySoruPuan = Math.max(0, Number(sinavYapisi.dySoruPuan || 2));
    const testSoruPuan = Math.max(0, Number(sinavYapisi.testSoruPuan || 5));
    const dyGoturme = Number(sinavYapisi.dyGoturmeOrani || 0);
    const testGoturme = Number(sinavYapisi.testGoturmeOrani || 0);
    const kitapciklar = sinavYapisi.kitapciklar || {};
    const aKitapcik = kitapciklar.A || { dy: [], test: [] };

    const kanonikKodBul = (grup, tur, gIdx) => {
      if (grup === 'A' || !kitapciklar[grup] || !Array.isArray(kitapciklar[grup][tur])) {
        return `${tur.toUpperCase()}-${gIdx + 1}`;
      }
      const gSoru = kitapciklar[grup][tur][gIdx];
      if (gSoru && gSoru.orijinalNo) return `${tur.toUpperCase()}-${Number(gSoru.orijinalNo)}`;
      if (gSoru && gSoru.id && Array.isArray(aKitapcik[tur])) {
        const aIdx = aKitapcik[tur].findIndex((q) => q && String(q.id) === String(gSoru.id));
        if (aIdx >= 0) return `${tur.toUpperCase()}-${aIdx + 1}`;
      }
      return `${tur.toUpperCase()}-${gIdx + 1}`;
    };

    return (Array.isArray(okumaSonuclari) ? okumaSonuclari : []).map((ogr) => {
      if (!ogr || typeof ogr !== 'object') return ogr;
      const grup = String(ogr.grup || 'A').toUpperCase();
      const gAnahtar = (sinavYapisi.cevapAnahtarlari && sinavYapisi.cevapAnahtarlari[grup]) || (sinavYapisi.cevapAnahtarlari && sinavYapisi.cevapAnahtarlari.A) || { dy: [], test: [] };

      let dyDogru = 0;
      let dyYanlis = 0;
      const yeniDyDetay = (Array.isArray(ogr.dyDetay) ? ogr.dyDetay : []).map((d, idx) => {
        const soruKod = kanonikKodBul(grup, 'dy', idx);
        const iptalMi = iptalSet.has(soruKod);
        const beklenen = gAnahtar.dy && gAnahtar.dy[idx] ? gAnahtar.dy[idx] : d.dogruCevap;
        const esnek = esnekKurallar[soruKod] || null;
        const v = String(d.verilen || '').toUpperCase();
        let sonuc = 'BOS';
        if (iptalMi) {
          sonuc = 'DOGRU';
          dyDogru++;
        } else if (!v || v === '-') {
          sonuc = 'BOS';
        } else if (v === 'COKLU' || v === 'CIFT' || v === 'ÇİFT') {
          sonuc = 'YANLIS';
          dyYanlis++;
        } else if ((esnek && esnek.includes(v)) || (beklenen && v === String(beklenen).toUpperCase())) {
          sonuc = 'DOGRU';
          dyDogru++;
        } else {
          sonuc = 'YANLIS';
          dyYanlis++;
        }
        return { ...d, sonuc, iptalMi };
      });

      let testDogru = 0;
      let testYanlis = 0;
      const yeniTestDetay = (Array.isArray(ogr.testDetay) ? ogr.testDetay : []).map((d, idx) => {
        const soruKod = kanonikKodBul(grup, 'test', idx);
        const iptalMi = iptalSet.has(soruKod);
        const beklenen = gAnahtar.test && gAnahtar.test[idx] ? gAnahtar.test[idx] : d.dogruCevap;
        const esnek = esnekKurallar[soruKod] || null;
        const v = String(d.verilen || '').toUpperCase();
        let sonuc = 'BOS';
        if (iptalMi) {
          sonuc = 'DOGRU';
          testDogru++;
        } else if (!v || v === '-') {
          sonuc = 'BOS';
        } else if (v === 'COKLU' || v === 'CIFT' || v === 'ÇİFT') {
          sonuc = 'YANLIS';
          testYanlis++;
        } else if ((esnek && esnek.includes(v)) || (beklenen && v === String(beklenen).toUpperCase())) {
          sonuc = 'DOGRU';
          testDogru++;
        } else {
          sonuc = 'YANLIS';
          testYanlis++;
        }
        return { ...d, sonuc, iptalMi };
      });

      const dyNet = Math.max(0, dyDogru - (dyGoturme > 0 ? dyYanlis / dyGoturme : 0));
      const testNet = Math.max(0, testDogru - (testGoturme > 0 ? testYanlis / testGoturme : 0));
      const klasikToplamPuan = Number(ogr.klasikToplamPuan || 0);
      const toplamPuan = Math.min(100, Number((dyNet * dySoruPuan + testNet * testSoruPuan + klasikToplamPuan).toFixed(2)));

      return {
        ...ogr,
        dyDogru,
        dyYanlis,
        dyNet: Number(dyNet.toFixed(2)),
        testDogru,
        testYanlis,
        testNet: Number(testNet.toFixed(2)),
        toplamPuan,
        dyDetay: yeniDyDetay,
        testDetay: yeniTestDetay
      };
    });
  }

  /* 4 Katmanlı Sınıf ÖÇ + Program Çıktısı (PÇ 1-5) + Kümülatif Dönem Sonu + Bireysel Hafta Önerisi + PUKÖ Raporu */
  function hesaplaKumulatifOcPcVePukoRaporu(ayarlar = {}) {
    const sinavYapisi = ayarlar.sinavYapisi || {};
    const dersNesne = ayarlar.ders || sinavYapisi.ders || {};
    const bolognaVerisi = ayarlar.bolognaVerisi || dersNesne.bolognaBilgisi || {};
    const digerSinavPaketleri = Array.isArray(ayarlar.digerSinavPaketleri) ? ayarlar.digerSinavPaketleri : [];
    const barajYuzde = Math.max(1, Math.min(100, Number(ayarlar.barajEsigi || ayarlar.barajYuzde || sinavYapisi.akreditasyonBaraji || 60)));
    const okumaSonuclari = Array.isArray(ayarlar.okumaSonuclari) ? ayarlar.okumaSonuclari : [];

    const tekilAnaliz = ayarlar.aktifSinavAnaliz || hesaplaKazanimVeKarneAnalizi(okumaSonuclari, { ...sinavYapisi, kazanimBarajYuzde: barajYuzde, akreditasyonBaraji: barajYuzde });
    const maddeAnalizi = ayarlar.maddeAnaliz || ayarlar.maddeAnalizi || hesaplaSinifVeMaddeAnalizi(okumaSonuclari, sinavYapisi);

    // 1. ÖÇ -> Haftalık Konu Eşlemesi (Bireysel Öğrenci Tekrar Önerileri İçin)
    const haftalikKonular = Array.isArray(bolognaVerisi.haftalikKonular) ? bolognaVerisi.haftalikKonular : [];
    const grupA = (sinavYapisi.kitapciklar && sinavYapisi.kitapciklar.A) || { dy: [], test: [], klasik: [] };
    const tumSinavSorulari = [...(grupA.dy || []), ...(grupA.test || []), ...(grupA.klasik || [])];

    const ocHaftaHaritasi = {};
    tumSinavSorulari.forEach((s) => {
      const oc = normalizeOcKodu(s.ocKodu || s.kazanim || '');
      const h = normalizeHaftaNo(s.hafta);
      if (oc && h) {
        if (!ocHaftaHaritasi[oc]) ocHaftaHaritasi[oc] = new Set();
        ocHaftaHaritasi[oc].add(h);
      }
    });

    const bulOcTekrarKonusu = (ocKodu) => {
      const kanonik = normalizeOcKodu(ocKodu) || ocKodu;
      const haftalar = ocHaftaHaritasi[kanonik] ? Array.from(ocHaftaHaritasi[kanonik]).sort((a, b) => a - b) : [];
      if (haftalar.length > 0 && haftalikKonular.length > 0) {
        const konular = Array.from(new Set(
          haftalar
            .map((hNo) => (haftalikKonular.find((hk) => hk.hafta === hNo) || {}).konu)
            .filter(Boolean)
        ));
        if (konular.length > 0) {
          return `${haftalar[0]}${haftalar.length > 1 ? '–' + haftalar[haftalar.length - 1] : ''}. Hafta (${konular.join(', ')})`;
        }
      }
      if (haftalikKonular.length > 0) {
        const ocIdx = Math.max(0, (ocKoduSiraNo(kanonik) || 1) - 1);
        const basH = Math.min(haftalikKonular.length, ocIdx * 3 + 1);
        const bitH = Math.min(haftalikKonular.length, basH + 2);
        const konular = Array.from(new Set(haftalikKonular.filter((hk) => hk.hafta >= basH && hk.hafta <= bitH).map((hk) => hk.konu)));
        if (konular.length > 0) return `${basH}–${bitH}. Hafta (${konular.join(', ')})`;
      }
      return `${kanonik} Ders Notları ve Uygulama Örnekleri`;
    };

    // 2. Program Çıktıları (PÇ 1..10) Gerçekleşme Tablosu (1–5 Akreditasyon Ölçeği)
    const ocPcMatrisi = bolognaVerisi.ocPcMatrisi || (bolognaVerisi.programCiktilari && bolognaVerisi.programCiktilari.ocPcMatrisi) || {};
    const pcTumKatkilar = bolognaVerisi.pcTumKatkilar || (bolognaVerisi.programCiktilari && bolognaVerisi.programCiktilari.tumSatiri) || {};
    const pcSet = new Set();
    Object.keys(pcTumKatkilar || {}).forEach((p) => pcSet.add(p));
    Object.values(ocPcMatrisi).forEach((satir) => {
      if (satir && typeof satir !== 'function' && typeof satir === 'object') {
        Object.keys(satir).forEach((p) => pcSet.add(p));
      }
    });
    if (pcSet.size === 0) {
      ['PÇ-1', 'PÇ-2', 'PÇ-3', 'PÇ-4', 'PÇ-5'].forEach((p) => pcSet.add(p));
    }

    const kazanimListesi = tekilAnaliz.kazanimTablosu || tekilAnaliz.kazanimlar || [];
    const pcTablosu = Array.from(pcSet).map((pcKod) => {
      let agirlikliPay = 0;
      let agirlikToplam = 0;
      let maksKatki = Number(pcTumKatkilar[pcKod] || 0);
      const katkidaBulunanOcler = [];
      kazanimListesi.forEach((k) => {
        if (k.olculduMu === false || !k.soruSayisi) return;
        const ocKodu = normalizeOcKodu(k.ocKodu || k.kod) || k.ocKodu || k.kod;
        const katkiDuzeyi = (ocPcMatrisi[ocKodu] && Number(ocPcMatrisi[ocKodu][pcKod])) || 0;
        if (katkiDuzeyi > 0) {
          agirlikliPay += k.basariYuzde * katkiDuzeyi;
          agirlikToplam += katkiDuzeyi;
          if (katkiDuzeyi > maksKatki) maksKatki = katkiDuzeyi;
          katkidaBulunanOcler.push(`${ocKodu}(${katkiDuzeyi})`);
        }
      });
      if (agirlikToplam === 0) {
        kazanimListesi.filter((k) => k.olculduMu !== false && k.soruSayisi > 0).forEach((k) => {
          const ocKodu = normalizeOcKodu(k.ocKodu || k.kod) || k.ocKodu || k.kod;
          agirlikliPay += k.basariYuzde * 3;
          agirlikToplam += 3;
          katkidaBulunanOcler.push(`${ocKodu}(3*)`);
        });
        if (!maksKatki) maksKatki = 3;
      }
      const basariYuzde = agirlikToplam > 0 ? Math.round(agirlikliPay / agirlikToplam) : 0;
      const beslikSkor = Number(((basariYuzde / 100) * 5).toFixed(2));
      const olculduMu = agirlikToplam > 0;
      const barajiGectiMi = olculduMu && basariYuzde >= barajYuzde;
      return {
        pcKod,
        pcKodu: pcKod,
        hedefKatkiDuzeyi: maksKatki || 3,
        bagliOcler: katkidaBulunanOcler,
        katkidaBulunanOcler,
        olculduMu,
        basariYuzde,
        gerceklesmeYuzde: basariYuzde,
        beslikSkor,
        barajiGectiMi,
        durum: !olculduMu ? 'ÖLÇÜLMEDİ' : (barajiGectiMi ? 'SAĞLANDI' : 'GELİŞTİRİLMELİ')
      };
    });

    // 3. Kümülatif Dönem Sonu (Ara Sınav %40 + Final %60 / Bütünleme İkamesi) Öğrenci × ÖÇ Birleştiricisi
    const aktifAgirlik = Number(ayarlar.aktifSinavAgirlik || ayarlar.aktifSinavAgirlikYuzde || (String(sinavYapisi.sinavTuru || '').toUpperCase().includes('FİNAL') ? 60 : 40));
    const aktifTur = String(ayarlar.aktifSinavTuru || sinavYapisi.sinavTuru || 'ARA SINAV').toUpperCase();
    const cikarSatirOcHarita = (st) => {
      const sonucMap = {};
      if (st && st.ocYuzdeleri && typeof st.ocYuzdeleri === 'object') {
        Object.entries(st.ocYuzdeleri).forEach(([k, v]) => {
          const nk = normalizeOcKodu(k);
          if (nk && v !== null && v !== undefined && Number.isFinite(Number(v))) sonucMap[nk] = Number(v);
        });
      }
      if (st && st.ocHucreler && typeof st.ocHucreler === 'object') {
        Object.entries(st.ocHucreler).forEach(([k, h]) => {
          const nk = normalizeOcKodu(k);
          if (nk && h && h.olculduMu !== false && Number.isFinite(Number(h.yuzde))) {
            sonucMap[nk] = Number(h.yuzde);
          }
        });
      }
      return sonucMap;
    };

    const normMatris = (hamMatris, yedekSutunlar = []) => {
      if (Array.isArray(hamMatris)) {
        const sutSet = new Set(yedekSutunlar.map((s) => normalizeOcKodu(s) || s).filter(Boolean));
        hamMatris.forEach((st) => {
          Object.keys(cikarSatirOcHarita(st)).forEach((nk) => sutSet.add(nk));
        });
        return { sutunlar: Array.from(sutSet), satirlar: hamMatris };
      }
      if (hamMatris && typeof hamMatris === 'object') {
        return {
          sutunlar: Array.isArray(hamMatris.sutunlar) ? hamMatris.sutunlar : [],
          satirlar: Array.isArray(hamMatris.satirlar) ? hamMatris.satirlar : []
        };
      }
      return { sutunlar: [], satirlar: [] };
    };

    const olculenKanonikKodlar = kazanimListesi.filter((k) => k.olculduMu !== false && k.soruSayisi > 0).map((k) => normalizeOcKodu(k.kod || k.ocKodu) || k.kod);
    const tumDonemPaketleri = [
      {
        ad: aktifTur,
        tur: aktifTur.includes('BÜT') ? 'butunleme' : (aktifTur.includes('FİNAL') ? 'final' : 'vize'),
        agirlik: aktifAgirlik,
        matris: normMatris(tekilAnaliz.ogrenciOcMatrisi, olculenKanonikKodlar)
      },
      ...digerSinavPaketleri.map((p) => ({
        ad: String(p.ad || p.sinavTuru || 'Ek Sınav'),
        tur: String(p.tur || (/büt/i.test(p.ad || p.sinavTuru || '') ? 'butunleme' : (/final/i.test(p.ad || p.sinavTuru || '') ? 'final' : 'vize'))),
        agirlik: Math.max(1, Number(p.agirlik || p.katkiYuzde || 60)),
        matris: normMatris(p.ogrenciOcMatrisi || p.matris, p.sutunlar || [])
      }))
    ];

    const kumulatifSutunSet = new Set();
    tumDonemPaketleri.forEach((pk) => (pk.matris.sutunlar || []).forEach((s) => kumulatifSutunSet.add(normalizeOcKodu(s.ocKodu || s) || s.ocKodu || s)));
    const kumulatifSutunlar = Array.from(kumulatifSutunSet).sort((a, b) => ocKoduSiraNo(a) - ocKoduSiraNo(b));
    const ogrenciHarita = new Map();

    tumDonemPaketleri.forEach((pk) => {
      (pk.matris.satirlar || []).forEach((sat) => {
        if (!sat || !sat.ogrNo) return;
        if (!ogrenciHarita.has(sat.ogrNo)) {
          ogrenciHarita.set(sat.ogrNo, { ogrNo: sat.ogrNo, adSoyad: sat.adSoyad, girilenler: [] });
        }
        ogrenciHarita.get(sat.ogrNo).girilenler.push({
          tur: pk.tur,
          agirlik: pk.agirlik,
          toplamPuan: Number(sat.toplamPuan || 0),
          ocYuzdeleri: cikarSatirOcHarita(sat)
        });
      });
    });

    const kumulatifSatirlar = Array.from(ogrenciHarita.values()).map((kayit) => {
      const butVar = kayit.girilenler.some((g) => g.tur === 'butunleme');
      const etkinler = butVar ? kayit.girilenler.filter((g) => g.tur !== 'final') : kayit.girilenler;
      const topAgirlik = etkinler.reduce((t, g) => t + g.agirlik, 0) || 1;
      const agirlikliPuan = Number((etkinler.reduce((t, g) => t + g.toplamPuan * g.agirlik, 0) / topAgirlik).toFixed(2));
      const ocYuzdeleri = {};
      const ocKumulatif = {};
      kumulatifSutunlar.forEach((ocKod) => {
        let pay = 0;
        let payda = 0;
        etkinler.forEach((g) => {
          const val = g.ocYuzdeleri[ocKod];
          if (val !== null && val !== undefined && Number.isFinite(Number(val))) {
            pay += Number(val) * g.agirlik;
            payda += g.agirlik;
          }
        });
        const yuzde = payda > 0 ? Math.round(pay / payda) : null;
        ocYuzdeleri[ocKod] = yuzde;
        ocKumulatif[ocKod] = {
          olculduMu: payda > 0,
          yuzde: yuzde !== null ? yuzde : 0,
          barajiGectiMi: payda > 0 && yuzde >= barajYuzde
        };
      });
      return {
        ogrNo: kayit.ogrNo,
        adSoyad: kayit.adSoyad,
        agirlikliPuan,
        harfNotu: hesaplaHarfNotu(agirlikliPuan),
        ocYuzdeleri,
        ocKumulatif
      };
    });

    // 4. Bireysel Öğrenci Karnelerine Haftalık Tekrar Önerileri Ekle
    const bireyselTekrarOnerileri = {};
    const zenginKarneler = (tekilAnaliz.ogrenciKarneleri || []).map((karne) => {
      const zayifOcler = (karne.kazanimOzet || []).filter((ko) => ko.yuzde < barajYuzde);
      const tekrarOnerileri = zayifOcler.map((ko) => {
        const ocKod = normalizeOcKodu(ko.kod) || ko.kod;
        const oneriMetni = bulOcTekrarKonusu(ko.kod);
        return { ocKodu: ocKod, yuzde: ko.yuzde, oneriMetni };
      });
      bireyselTekrarOnerileri[karne.ogrNo] = tekrarOnerileri.map((t) => `${t.ocKodu} (%${t.yuzde}) → ${t.oneriMetni}`);
      return {
        ...karne,
        tekrarOnerileri
      };
    });

    // 5. Otomatik PUKÖ / CQI Ders Özdeğerlendirme Tutanak Metni
    const olculenOcler = kazanimListesi.filter((k) => k.olculduMu !== false && k.soruSayisi > 0);
    const basariliOcler = olculenOcler.filter((k) => k.basariYuzde >= barajYuzde);
    const gelistirilecekOcler = olculenOcler.filter((k) => k.basariYuzde < barajYuzde);
    const sorunluMaddeler = (maddeAnalizi.maddeler || []).filter((m) => m.rjx < 0.15 || m.pj < 0.30).slice(0, 3);
    const iptalSayisi = Array.isArray(sinavYapisi.iptalEdilenSorular) ? sinavYapisi.iptalEdilenSorular.length : 0;
    const katilimSayisi = okumaSonuclari.length || (tekilAnaliz.ogrenciKarneleri || []).length || Number(maddeAnalizi.ogrenciSayisi || 0);

    const pukoParagraflari = [
      `1. GENEL SINIF PERFORMANSI (PUKÖ ÖZDEĞERLENDİRME): ${dersNesne.kod || bolognaVerisi.kod || ''} ${dersNesne.ad || bolognaVerisi.ad || 'Ders'} (${aktifTur}) değerlendirmesine toplam ${katilimSayisi} öğrenci katılmış olup sınıf genel ortalaması ${maddeAnalizi.ortalama || 0}/100 (Standart Sapma: ${maddeAnalizi.standartSapma || 0}, KR-20 Güvenirlik: ${maddeAnalizi.kr20 || 0}) olarak gerçekleşmiştir.`,
      `2. ÖĞRENME ÇIKTILARI (ÖÇ) GERÇEKLEŞME DÜZEYİ (Baraj: %${barajYuzde}): Ölçülen ${olculenOcler.length} öğrenme çıktısından ${basariliOcler.length} tanesi hedef barajı sağlamıştır (${basariliOcler.map((k) => `${normalizeOcKodu(k.kod || k.ocKodu) || k.kod}: %${k.basariYuzde}`).join(', ') || 'Yok'}). ${gelistirilecekOcler.length > 0 ? `Baraj altında kalan kazanımlar (${gelistirilecekOcler.map((k) => `${normalizeOcKodu(k.kod || k.ocKodu) || k.kod}: %${k.basariYuzde} -> ${bulOcTekrarKonusu(k.kod || k.ocKodu)}`).join('; ')}) için telafi uygulaması ve ek örnek çözümü planlanmıştır.` : 'Tüm ölçülen öğrenme çıktıları hedef akreditasyon eşiğini aşmıştır.'}`,
      `3. PROGRAM ÇIKTILARINA (PÇ 1–5) KATKI: Sınıfın ağırlıklı Program Çıktısı kazanım skorları ${pcTablosu.filter((p) => p.olculduMu).map((p) => `${p.pcKod}: ${p.beslikSkor}/5.00 (%${p.basariYuzde})`).join(', ') || 'hesaplanmadı'} düzeyindedir.`,
      `4. MADDE ANALİZİ VE SÜREKLİ İYİLEŞTİRME (PUKÖ EYLEM PLANI): ${sorunluMaddeler.length > 0 ? `Madde analizinde düşük ayırt edicilik veya yüksek güçlük gösteren maddeler (${sorunluMaddeler.map((m) => `${m.kod || m.soruKod} [pj=${m.pj}, rjx=${m.rjx}]`).join(', ')}) kavram yanılgısı açısından gözden geçirilerek soru bankası revizyon kuyruğuna alınmıştır.` : 'Madde ayırt edicilik indeksleri (rjx) kabul edilebilir aralıktadır.'}${iptalSayisi > 0 ? ` Sınav kurul incelemesiyle ${iptalSayisi} madde (${sinavYapisi.iptalEdilenSorular.join(', ')}) iptal edilerek tüm öğrencilere tam puan yansıtılmıştır.` : ''}`
    ];
    const pukoMetni = pukoParagraflari.join('\n\n');

    return {
      barajYuzde,
      kazanimlar: kazanimListesi,
      olculmeyenOcler: kazanimListesi.filter((k) => k.olculduMu === false || !k.soruSayisi),
      ogrenciOcMatrisi: tekilAnaliz.ogrenciOcMatrisi,
      pcTablosu,
      kumulatifOcKodlari: kumulatifSutunlar,
      kumulatifOgrenciOcMatrisi: kumulatifSatirlar,
      kumulatifMatris: {
        sutunlar: kumulatifSutunlar,
        satirlar: kumulatifSatirlar,
        birlestirilenSinavSayisi: tumDonemPaketleri.length
      },
      bireyselTekrarOnerileri,
      ogrenciKarneleri: zenginKarneler,
      pukoRaporMetni: pukoMetni,
      pukoMetni
    };
  }

  /* Okula Özel OBS Not Yükleme (Proliz / ÜBYS / Özel Sütun Dizilimi) CSV Üretici */
  function uretOzelObsNotCsv(okumaSonuclari = [], ogrencilerVeyaSablon = [], obsSablonu = {}, sinavBilgi = {}) {
    let ogrenciler = ogrencilerVeyaSablon;
    let etkinSablon = obsSablonu || {};
    let etkinBilgi = sinavBilgi || {};
    if (ogrencilerVeyaSablon && !Array.isArray(ogrencilerVeyaSablon) && typeof ogrencilerVeyaSablon === 'object') {
      ogrenciler = Array.isArray(ogrencilerVeyaSablon.ogrenciler) ? ogrencilerVeyaSablon.ogrenciler : [];
      etkinSablon = ogrencilerVeyaSablon;
      etkinBilgi = {
        dersKod: ogrencilerVeyaSablon.dersKodu || ogrencilerVeyaSablon.dersKod || '',
        sinavTuru: ogrencilerVeyaSablon.sinavTuru || 'ARA SINAV'
      };
    }
    const ayirici = etkinSablon.ayirici === ',' ? ',' : ';';
    const sutunlar = Array.isArray(etkinSablon.sutunlar) && etkinSablon.sutunlar.length > 0
      ? etkinSablon.sutunlar
      : ['OGRENCI_NO', 'AD_SOYAD', 'KITAPCIK', 'PUAN', 'HARF_NOTU', 'DURUM'];

    const okunanMap = new Map();
    (Array.isArray(okumaSonuclari) ? okumaSonuclari : []).forEach((s) => {
      if (s && s.ogrNo) okunanMap.set(String(s.ogrNo).trim(), s);
    });

    const tamListe = Array.isArray(ogrenciler) && ogrenciler.length > 0
      ? ogrenciler
      : Array.from(okunanMap.values()).map((s) => ({ ogrNo: s.ogrNo, adSoyad: s.adSoyad, bolum: '' }));

    const satirlar = [sutunlar.join(ayirici)];
    tamListe.forEach((ogr) => {
      const kayit = okunanMap.get(String(ogr.ogrNo).trim()) || null;
      const puan = kayit ? Number(kayit.toplamPuan || 0) : 0;
      const degerAl = (sutun) => {
        switch (String(sutun || '').toUpperCase()) {
          case 'OGRENCI_NO': return ogr.ogrNo || '';
          case 'AD_SOYAD': return ogr.adSoyad || '';
          case 'BOLUM': return ogr.bolum || '';
          case 'DERS_KODU': return etkinBilgi.dersKod || etkinBilgi.dersKodu || '';
          case 'SINAV_TURU': return etkinBilgi.sinavTuru || 'ARA SINAV';
          case 'KITAPCIK': return kayit ? kayit.grup : '-';
          case 'DY_NET': return kayit ? kayit.dyNet : 0;
          case 'TEST_NET': return kayit ? kayit.testNet : 0;
          case 'KLASIK_PUAN': return kayit ? kayit.klasikToplamPuan : 0;
          case 'PUAN':
          case 'SINAV_PUANI': return kayit ? Math.round(puan) : 'GR';
          case 'PUAN_KUSURATLI': return kayit ? puan : 'GR';
          case 'HARF_NOTU': return kayit ? hesaplaHarfNotu(puan) : 'GR';
          case 'DURUM': return kayit ? 'GİRDİ' : 'GİRMEDİ';
          default: return '';
        }
      };
      satirlar.push(sutunlar.map((s) => temizleCsvFormulEnjeksiyon(String(degerAl(s)))).join(ayirici));
    });

    return '\ufeff' + satirlar.join('\r\n');
  }

  /* Resmi Maddi Hata / Sınav Sonucu İtiraz İnceleme Kanıt Tutanağı Üretici */
  function uretMaddiHataItirazKanitRaporuTXT(ogrenciSonuc = {}, sinavYapisi = {}, kurumBilgi = {}) {
    if (!ogrenciSonuc || !ogrenciSonuc.ogrNo) {
      return 'Geçerli öğrenci okuma kaydı bulunamadı.';
    }
    const grup = String(ogrenciSonuc.grup || 'A').toUpperCase();
    const gAnahtar = (sinavYapisi.cevapAnahtarlari && sinavYapisi.cevapAnahtarlari[grup]) || { dy: [], test: [] };
    const iptalSet = new Set(Array.isArray(sinavYapisi.iptalEdilenSorular) ? sinavYapisi.iptalEdilenSorular : []);

    const cizgiler = [
      '========================================================================',
      '        T.C. YÜKSEKÖĞRETİM KURUMU — MADDİ HATA İTİRAZ KANIT TUTANAĞI     ',
      '========================================================================',
      `Kurum / Birim   : ${kurumBilgi.kurumAdi || 'Üniversite Rektörlüğü'} ${kurumBilgi.birimAdi ? '/ ' + kurumBilgi.birimAdi : ''}`,
      `Ders            : ${sinavYapisi.dersKod || ''} ${sinavYapisi.dersAd || ''}`.trim(),
      `Sınav Türü      : ${sinavYapisi.sinavTuru || 'ARA SINAV'} · Kitapçık Grubu: ${grup}`,
      `Öğrenci         : ${ogrenciSonuc.ogrNo} — ${ogrenciSonuc.adSoyad || ''}`,
      `Hesaplanan Puan : ${ogrenciSonuc.toplamPuan} / 100 (Harf: ${hesaplaHarfNotu(ogrenciSonuc.toplamPuan)})`,
      `Net Özeti       : D/Y Net=${ogrenciSonuc.dyNet} · Test Net=${ogrenciSonuc.testNet} · Klasik=${ogrenciSonuc.klasikToplamPuan}p`,
      `Rapor Zamanı    : ${new Date().toISOString()}`,
      '------------------------------------------------------------------------',
      'SORU BAZLI OPTİK OKUMA VE RESMİ ANAHTAR KARŞILAŞTIRMASI:',
      '------------------------------------------------------------------------'
    ];

    (ogrenciSonuc.dyDetay || []).forEach((d, i) => {
      const resmi = gAnahtar.dy && gAnahtar.dy[i] ? gAnahtar.dy[i] : (d.dogruCevap || '-');
      const iptalNotu = (d.iptalMi || iptalSet.has(`DY-${i + 1}`)) ? ' [İPTAL -> TAM PUAN]' : '';
      cizgiler.push(`D/Y  Soru ${String(i + 1).padStart(2, '0')} | Okunan: ${String(d.verilen || 'BOŞ').padEnd(5, ' ')} | Resmi Anahtar: ${String(resmi).padEnd(3, ' ')} | Sonuç: ${d.sonuc}${iptalNotu}`);
    });

    (ogrenciSonuc.testDetay || []).forEach((d, i) => {
      const resmi = gAnahtar.test && gAnahtar.test[i] ? gAnahtar.test[i] : (d.dogruCevap || '-');
      const iptalNotu = (d.iptalMi || iptalSet.has(`TEST-${i + 1}`)) ? ' [İPTAL -> TAM PUAN]' : '';
      cizgiler.push(`TEST Soru ${String(i + 1).padStart(2, '0')} | Okunan: ${String(d.verilen || 'BOŞ').padEnd(5, ' ')} | Resmi Anahtar: ${String(resmi).padEnd(3, ' ')} | Sonuç: ${d.sonuc}${iptalNotu}`);
    });

    (ogrenciSonuc.klasikDetay || []).forEach((k, i) => {
      cizgiler.push(`KLASİK   ${String(i + 1).padStart(2, '0')} | Takdir Edilen Puan: ${k.verilenPuan}p`);
    });

    cizgiler.push(
      '------------------------------------------------------------------------',
      'SONUÇ KANAATİ: Yukarıdaki optik okuma verileri, kitapçık dönüşüm haritası ve',
      'resmi cevap anahtarı karşılaştırılmış olup maddi hata bulunmadığı / düzeltmenin',
      'tabloya işlendiği imza altına alınmıştır.',
      '',
      'Ders Sorumlusu İmza          Komisyon Üyesi İmza          Bölüm Başkanı Onay',
      '___________________          ___________________          __________________'
    );
    return cizgiler.join('\n');
  }

  /* Ticari Çok-Kiracılı (Multi-Tenant) Hazırlık: WebCrypto PBKDF2-SHA256 Tuzlu Parola Özeti */
  async function uretTuzluSifreOzetiWebCrypto(sifre, ozelTuzHex = '') {
    const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
    if (!subtle) throw new Error('WebCrypto PBKDF2 desteklenmiyor.');
    let tuzBytes;
    if (ozelTuzHex && /^[0-9a-f]+$/i.test(ozelTuzHex) && ozelTuzHex.length >= 16) {
      tuzBytes = new Uint8Array(ozelTuzHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
    } else {
      tuzBytes = new Uint8Array(16);
      crypto.getRandomValues(tuzBytes);
    }
    const tuzHex = Array.from(tuzBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    const anahtarMalzeme = await subtle.importKey('raw', new TextEncoder().encode(String(sifre || '')), 'PBKDF2', false, ['deriveBits']);
    const bitler = await subtle.deriveBits(
      { name: 'PBKDF2', salt: tuzBytes, iterations: 100000, hash: 'SHA-256' },
      anahtarMalzeme,
      256
    );
    const ozetHex = Array.from(new Uint8Array(bitler)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `pbkdf2_sha256$100000$${tuzHex}$${ozetHex}`;
  }

  async function dogrulaTuzluSifreWebCrypto(sifre, kayitliDeger = '') {
    const kayit = String(kayitliDeger || '');
    if (!kayit.startsWith('pbkdf2_sha256$')) {
      return String(sifre || '') === kayit;
    }
    const parcalar = kayit.split('$');
    if (parcalar.length !== 4) return false;
    const uretilen = await uretTuzluSifreOzetiWebCrypto(sifre, parcalar[2]);
    return uretilen === kayit;
  }

  /* Dışa Aktarılan Evrensel API */
  const SinavOptikCekirdek = {
    cozHtmlEntities,
    guvenliURL,
    kacisHTML,
    temizleHTML,
    derinTemizleNesne,
    semaDogrulaVeTemizle,
    olusturGuvenliBlobUrl,
    temizleTumBlobUrller,
    kurGuvenliInterval,
    kaydetGuvenliInterval: kurGuvenliInterval,
    temizleGuvenliInterval,
    guvenliDecompress,
    tohumluRastgele,
    diziKaristirDeterministik,
    karistirSoruSiklariVeKoru,
    uretDengeliHarfDizisi,
    onleDyArdisikYigilma,
    uretKitapcikVaryasyonu,
    kodlaOptikGeometriMatrisi,
    cozOptikGeometriMatrisi,
    uretMiniGeometriSVG,
    hesaplaKanonikBalonHaritasi,
    hesaplaEnUzunDySerisi,
    uretOptikYerlesim,
    uretOptikFormSVG,
    bulOptikFormKoseleri,
    hesaplaHomografi,
    perspektifDuzeltGri,
    okuStandartOptikFormImageData,
    bulBagliBilesenler,
    adaptifEsiklemeGri,
    griyeCevirImageData,
    uretKlasikPuanAdimlari,
    hesaplaSinavBolumVeSoruPuanlari,
    uygulaAdaptifEsikleme,
    bul4KoseFiducial,
    perspektifDuzelt,
    olcBalonDoluluk,
    degerlendirBalonSatiri,
    okuOptikFormImageData,
    cizSentetikOptikFormCanvas,
    cozEsnekAnahtarKurallari,
    hesaplaSinifVeMaddeAnalizi,
    tespitEtKopyaBenzerlikCiftleri,
    hesaplaKazanimVeKarneAnalizi,
    cozPdfIcindenMetinVeGorsel,
    cikarKaliteKunyesiMetinden,
    cozDocxKaliteFormu,
    cozDocKaliteFormu,
    excelSeriNoyuTarihYap,
    salonlaraDagit,
    arsivleDersVeSorulariKorun,
    listeleArsivSoruHavuzlari,
    dahilEtArsivSorulariniDerse,
    kesKaliteFormuUstVeAltKatman,
    metindenSorulariAyikla,
    normalizeZorlukDerecesi,
    normalizeHaftaNo,
    normalizeOcKodu,
    ayiklaOcBilesenleri,
    ocKoduSiraNo,
    ayiklaDersOcMaddeleri,
    formatlaDersOcMaddeleriMetin,
    uretBosTestSablonuCSV,
    uretBosDySablonuCSV,
    uretBosKlasikSablonuCSV,
    uretBosSoruSablonuCSV,
    uretSoruBankasiCSV,
    cozSoruBankasiCSV,
    secZorlukDengeliSorular,
    secHaftalikVeKotaliSinavSorulari,
    degistirTekSoruHavuzdan,
    uretSinavBelirtkeTablosu,
    uretBosOgrenciSablonuCSV,
    cozOgrenciListesiCSV,
    uretOgrenciQrPaketi,
    cozOgrenciQrPaketi,
    uretKompaktSetupQrPaketi,
    cozKompaktSetupQrPaketi,
    dogrulaVeTemizleOmrSonucKaydi,
    uretOmrSonucPaketi,
    cozOmrSonucPaketi,
    uretBosCevapAnahtariCSV,
    cozCevapAnahtariCSV,
    hesaplaHarfNotu,
    temizleCsvFormulEnjeksiyon,
    uretResmiObsNotCizelgesiCSV,
    kontrolCanliSifreKurallari,
    dogrulaOgrenciIlkKayit,
    VARSAYILAN_DAVET_KODU,
    VARSAYILAN_HOCA_HESAP,
    uretYeniDavetKodu,
    dogrulaHocaHesapKayit,
    dogrulaHocaGiris,
    sifirlaHocaSifreEpostaTelefon,
    uretDelilLogHash,
    olusturKioskDelilLogKaydi,
    uretResmiDelilLogRaporuTXT,
    uretDelilLogCSV,
    uretKisiyeOzelOnlineSinav,
    uretOgrenciyeOzelKagitVaryasyonu,
    uretOgrenciyeOzelSinavIspatRaporuTXT,
    uretCokSayfaliA4PdfBytes,
    ORNEK_PROLIZ_BOLOGNA_METNI,
    VARSAYILAN_KURUMSAL_SABLONLAR,
    uygulaKurumsalYerTutucular,
    cozBolognaBilgiPaketi,
    etiketleSorularOtomatikOcBloom,
    hesaplaBaskiOncesiOcBloomDengesi,
    yenidenPuanlaOkumaSonuclari,
    hesaplaKumulatifOcPcVePukoRaporu,
    uretOzelObsNotCsv,
    uretMaddiHataItirazKanitRaporuTXT,
    uretTuzluSifreOzetiWebCrypto,
    dogrulaTuzluSifreWebCrypto,
    VARSAYILAN_DERSLER,
    VARSAYILAN_SORULAR,
    VARSAYILAN_OGRENCILER,
    KANONIK_GENISLIK,
    KANONIK_YUKSEKLIK
  };

  global.SinavOptikCekirdek = SinavOptikCekirdek;
  if (typeof window !== 'undefined') {
    window.SinavOptikCekirdek = SinavOptikCekirdek;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SinavOptikCekirdek;
  }
})(typeof window !== 'undefined' ? window : globalThis);
