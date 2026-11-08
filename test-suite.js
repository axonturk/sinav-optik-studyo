/* ==========================================================================
   KÜMÜLATİF KARŞI-ÖRNEK KABUL KAPISI & MİMARİ DOĞRULAMA TEST PAKETİ
   1. Zero-Trust Sunucu API Karşı-Örnekleri (forgedPaper, earlyFinish, crossStudent...)
   2. Beyaz Liste Sanitizasyon & Prototype-Pollution Derinlik (>12) Testleri
   3. A/B/C/D Kitapçık Karıştırma ve Simetrik Cevap Anahtarı Doğrulaması
   4. 7 Adımlı Mobil OMR Görüntü İşleme, Silinti Tespiti ve Puanlama Doğrulaması
   5. Akademik Madde Analizi (pj Güçlük, rjx Ayırt Edicilik) ve Word Parser Testi
   ========================================================================== */

'use strict';

const assert = require('assert');
const Cekirdek = require('./guvenlik-ve-veri.js');
const { baslatSunucu } = require('./server.js');

async function calistirTumTestler() {
  let gecen = 0;

  const testEt = async (ad, fn) => {
    await fn();
    gecen++;
    console.log(`  ✓ [GEÇTİ] ${ad}`);
  };

  console.log('=== SINAV KAĞIDI STÜDYOSU & MOBİL OMR — KABUL TESTLERİ BAŞLIYOR ===\n');

  // 1. Entity XSS ve URL Beyaz Liste Testi
  await testEt('1. HTML Entity çözümü ve tehlikeli protokol (javascript:/data:text/html) engelleme', () => {
    assert.strictEqual(Cekirdek.guvenliURL('&#x6a;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert(1)'), '#');
    assert.strictEqual(Cekirdek.guvenliURL('&#106;&#97;vascript:evil()'), '#');
    assert.strictEqual(Cekirdek.guvenliURL('data:text/html;base64,PHNjcmlwdD4='), '#');
    assert.strictEqual(Cekirdek.guvenliURL('https://ornek.edu.tr/sinav.pdf'), 'https://ornek.edu.tr/sinav.pdf');
  });

  // 2. Prototype-Pollution ve Derinlik Sınırı (>12) Testi
  await testEt('2. JSON derinlik sınırı (>12) ve null öğrenci dizisi şema reddi', () => {
    let derin = { deger: 1 };
    for (let i = 0; i < 14; i++) derin = { alt: derin };
    assert.throws(() => Cekirdek.derinTemizleNesne(derin), /Derinlik sınırı aşıldı/);
    assert.throws(() => Cekirdek.semaDogrulaVeTemizle({ ogrenciler: [null] }), /null veya geçersiz/);
  });

  // 3. A/B/C/D Kitapçık Varyasyonu ve Simetrik Cevap Anahtarı Doğrulaması
  await testEt('3. A/B/C/D kitapçık karıştırma ve doğru şık takibi (10 D/Y + 10 Test + 2 Klasik)', () => {
    const secili = [
      ...Cekirdek.VARSAYILAN_SORULAR.filter((s) => s.tur === 'dy').slice(0, 10),
      ...Cekirdek.VARSAYILAN_SORULAR.filter((s) => s.tur === 'test').slice(0, 10),
      ...Cekirdek.VARSAYILAN_SORULAR.filter((s) => s.tur === 'klasik').slice(0, 2)
    ];
    const grupA = Cekirdek.uretKitapcikVaryasyonu(secili, 'A', 'TEST-KOD', true);
    const grupB = Cekirdek.uretKitapcikVaryasyonu(secili, 'B', 'TEST-KOD', true);

    assert.strictEqual(grupA.dy.length, 10);
    assert.strictEqual(grupA.test.length, 10);
    assert.strictEqual(grupA.klasik.length, 2);
    assert.strictEqual(grupB.test.length, 10);

    // B grubundaki her test sorusunun doğru şıkkındaki metin, A grubundaki orijinal doğru şık metniyle birebir aynı olmalı!
    const harfler = ['A', 'B', 'C', 'D', 'E'];
    for (const bSoru of grupB.test) {
      const aSoru = grupA.test.find((x) => x.id === bSoru.id);
      const aDogruMetin = aSoru.siklar[harfler.indexOf(aSoru.dogruHarf)];
      const bDogruMetin = bSoru.siklar[harfler.indexOf(bSoru.dogruHarf)];
      assert.strictEqual(bDogruMetin, aDogruMetin, 'Kitapçık karıştırmada doğru şık metni korunmalıdır');
    }
  });

  // 4. 7 Adımlı Mobil OMR Görüntü İşleme Motoru Doğrulaması
  await testEt('4. Bradley-Roth adaptif eşikleme, 4 köşe fiducial ve balon kontrast okuma (D/Y + Test + Klasik)', () => {
    const gen = Cekirdek.KANONIK_GENISLIK;
    const yuk = Cekirdek.hesaplaKanonikBalonHaritasi({ dySayisi: 10, testSayisi: 10, sikSayisi: 5, klasikSayisi: 2, kimlikModu: 'son2', klasikSoruPuan: 10 }).yukseklik;
    const pikselVeri = new Uint8ClampedArray(gen * yuk * 4);
    // Beyaz kağıt arka planı (sağ alt köşeye hafif telefon gölgesi uygulanmış)
    for (let y = 0; y < yuk; y++) {
      for (let x = 0; x < gen; x++) {
        const golge = Math.round(((x + y) / (gen + yuk)) * 45);
        const v = 250 - golge;
        const p = (y * gen + x) * 4;
        pikselVeri[p] = v;
        pikselVeri[p + 1] = v;
        pikselVeri[p + 2] = v;
        pikselVeri[p + 3] = 255;
      }
    }

    const sinavYapisi = {
      dySayisi: 10,
      dySoruPuan: 2,
      testSayisi: 10,
      testSoruPuan: 6,
      sikSayisi: 5,
      klasikSayisi: 2,
      klasikSoruPuan: 10,
      kimlikModu: 'son2',
      haneSayisi: 2,
      cevapAnahtarlari: {
        A: {
          dy: ['D', 'Y', 'D', 'Y', 'D', 'D', 'Y', 'D', 'Y', 'D'],
          test: ['A', 'B', 'C', 'D', 'E', 'A', 'B', 'C', 'D', 'E'],
          klasik: []
        }
      }
    };

    const harita = Cekirdek.hesaplaKanonikBalonHaritasi(sinavYapisi);
    const doldurBalon = (merkezX, merkezY, r) => {
      const rKare = Math.pow(r * 0.85, 2);
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          if (dx * dx + dy * dy <= rKare) {
            const px = Math.round(merkezX + dx);
            const py = Math.round(merkezY + dy);
            if (px >= 0 && px < gen && py >= 0 && py < yuk) {
              const p = (py * gen + px) * 4;
              pikselVeri[p] = 20;
              pikselVeri[p + 1] = 20;
              pikselVeri[p + 2] = 20;
            }
          }
        }
      }
    };

    // A Kitapçığı, Öğrenci No Son 2 Hane: 42 (Ayşe Yıldız), Tam Doğru Cevaplar + Klasik 10 ve 10
    const bGrupA = harita.grupBalonlari.find((b) => b.harf === 'A');
    doldurBalon(bGrupA.x, bGrupA.y, bGrupA.r);

    const bOnlar4 = harita.kimlikSatirlari[0].balonlar.find((b) => b.rakam === '4');
    const bBirler2 = harita.kimlikSatirlari[1].balonlar.find((b) => b.rakam === '2');
    doldurBalon(bOnlar4.x, bOnlar4.y, bOnlar4.r);
    doldurBalon(bBirler2.x, bBirler2.y, bBirler2.r);

    sinavYapisi.cevapAnahtarlari.A.dy.forEach((cev, idx) => {
      const b = harita.dySatirlari[idx].balonlar.find((x) => x.secenek === cev);
      doldurBalon(b.x, b.y, b.r);
    });
    sinavYapisi.cevapAnahtarlari.A.test.forEach((cev, idx) => {
      const b = harita.testSatirlari[idx].balonlar.find((x) => x.secenek === cev);
      doldurBalon(b.x, b.y, b.r);
    });
    harita.klasikSatirlari.forEach((sat) => {
      const b10 = sat.balonlar.find((x) => x.secenek === '10');
      doldurBalon(b10.x, b10.y, b10.r);
    });

    const koseler = {
      tl: { x: 26, y: 26, bulundu: true },
      tr: { x: gen - 26, y: 26, bulundu: true },
      bl: { x: 26, y: yuk - 26, bulundu: true },
      br: { x: gen - 26, y: yuk - 26, bulundu: true }
    };

    const sonuc = Cekirdek.okuOptikFormImageData(
      { width: gen, height: yuk, data: pikselVeri },
      sinavYapisi,
      Cekirdek.VARSAYILAN_OGRENCILER,
      koseler
    );

    assert.strictEqual(sonuc.grup, 'A');
    assert.strictEqual(sonuc.okunanNoKod, '42');
    assert.strictEqual(sonuc.adSoyad, 'Ayşe Yıldız');
    assert.strictEqual(sonuc.dyDogru, 10);
    assert.strictEqual(sonuc.testDogru, 10);
    assert.strictEqual(sonuc.klasikToplamPuan, 20);
    assert.strictEqual(sonuc.toplamPuan, 100);
  });

  // 5. Word / Metin Toplu Soru Ayrıştırıcı, Mini Geometri QR ve Akademik Madde Analizi Testi
  await testEt('5. Mini Geometri QR (8.1), Word soru ayıklama ve Madde Analizi (pj, rjx)', () => {
    const bitler = Cekirdek.kodlaOptikGeometriMatrisi({
      dySayisi: 10,
      testSayisi: 15,
      sikSayisi: 5,
      klasikSayisi: 2,
      kimlikModu: 'son3',
      haneSayisi: 3
    });
    const cozulmusGeo = Cekirdek.cozOptikGeometriMatrisi(bitler);
    assert.ok(cozulmusGeo, 'Mini Geometri Matris QR sağlama toplamı ile çözülmelidir');
    assert.strictEqual(cozulmusGeo.dySayisi, 10);
    assert.strictEqual(cozulmusGeo.testSayisi, 15);
    assert.strictEqual(cozulmusGeo.klasikSayisi, 2);
    assert.strictEqual(cozulmusGeo.kimlikModu, 'son3');

    const ornekMetin =
      `1. [DY] TCP üçlü el sıkışma kullanır. (D)\n` +
      `2. Hangi port HTTPS için kullanılır?\n` +
      `A) 21  B) 80  C) 443  D) 8080\n` +
      `Cevap: C\n` +
      `3. [KLASİK] Zero-Trust mimarisini açıklayınız.`;
    const ayiklanan = Cekirdek.metindenSorulariAyikla(ornekMetin, 'ders-ag-guvenlik');
    assert.strictEqual(ayiklanan.length, 3);
    assert.strictEqual(ayiklanan[0].tur, 'dy');
    assert.strictEqual(ayiklanan[0].dogruDY, 'D');
    assert.strictEqual(ayiklanan[1].tur, 'test');
    assert.strictEqual(ayiklanan[1].dogruHarf, 'C');
    assert.strictEqual(ayiklanan[2].tur, 'klasik');

    // Boş Soru CSV Şablonları (Puan Sütunu Yoktur, Dogru_Sik_Secenegi ve Zorluk_Derecesi Vardır) & İthalatı Testi
    const bosTestCsv = Cekirdek.uretBosTestSablonuCSV();
    assert.ok(!bosTestCsv.includes(';Puan;'), 'Test CSV şablonunda Puan sütunu bulunmamalıdır');
    assert.ok(bosTestCsv.includes('Dogru_Sik_Secenegi'), 'Test CSV şablonunda Dogru_Sik_Secenegi sütunu bulunmalıdır');
    const testSorular = Cekirdek.cozSoruBankasiCSV(bosTestCsv, 'ders-ag-guvenlik');
    assert.strictEqual(testSorular.length, 4);
    assert.strictEqual(testSorular[0].tur, 'test');
    assert.strictEqual(testSorular[0].ocKodu, 'ÖÇ-1');
    assert.strictEqual(testSorular[0].dogruHarf, 'B');
    assert.strictEqual(testSorular[0].dogruSikDegeri, '22');
    assert.strictEqual(testSorular[0].zorluk, 'Kolay');
    assert.strictEqual(testSorular[1].dogruHarf, 'D');
    assert.strictEqual(testSorular[1].dogruSikDegeri, 'Argon2id');
    assert.strictEqual(testSorular[2].zorluk, 'Zor');
    assert.strictEqual(testSorular[3].ocKodu, 'ÖÇ-4');

    // Şık Karıştırmada Doğru Şıkkın Değeriyle Taşınması (A -> D / B -> E vb. ve 4 Şıklı Sınavda E Şıkkının Korunması)
    const ornekSoruA = {
      id: 'soru-tasima-1',
      tur: 'test',
      metin: 'Örnek soru',
      siklar: ['Doğru Değer (Eski A)', 'Çeldirici 1', 'Çeldirici 2', 'Çeldirici 3', 'Çeldirici 4'],
      dogruHarf: 'A'
    };
    const karisikVaryant = Cekirdek.karistirSoruSiklariVeKoru(ornekSoruA, 'TOHUM-B-GRUBU', 5, true);
    const harfler = ['A', 'B', 'C', 'D', 'E'];
    assert.strictEqual(
      karisikVaryant.siklar[harfler.indexOf(karisikVaryant.dogruHarf)],
      'Doğru Değer (Eski A)',
      'Şıklar karıştırıldığında doğru şık hangi harfe (Örn: A -> D) geçerse geçsin doğru değeriyle taşınmalıdır'
    );
    assert.strictEqual(karisikVaryant.dogruSikDegeri, 'Doğru Değer (Eski A)');

    // 4 şıklı sınavda orijinal doğru cevabı E olan sorunun doğru değerinin korunması testi
    const ornekSoruE = {
      id: 'soru-tasima-e',
      tur: 'test',
      metin: '5 şıklı soru ama 4 şıklı sınavda kullanılacak',
      siklar: ['Yanlış 1', 'Yanlış 2', 'Yanlış 3', 'Yanlış 4', 'Kesin Doğru (Eski E)'],
      dogruHarf: 'E'
    };
    const dortSikliVaryant = Cekirdek.karistirSoruSiklariVeKoru(ornekSoruE, 'TOHUM-4SIK', 4, true);
    assert.strictEqual(dortSikliVaryant.siklar.length, 4);
    assert.strictEqual(
      dortSikliVaryant.siklar[harfler.indexOf(dortSikliVaryant.dogruHarf)],
      'Kesin Doğru (Eski E)',
      '4 şıklı sınavda doğru cevap E şıkkında olsa bile silinmemeli ve yeni harfine doğru değeriyle taşınmalıdır'
    );

    const bosDyCsv = Cekirdek.uretBosDySablonuCSV();
    assert.ok(!bosDyCsv.includes(';Puan;'), 'D/Y CSV şablonunda Puan sütunu bulunmamalıdır');
    const dySorular = Cekirdek.cozSoruBankasiCSV(bosDyCsv, 'ders-ag-guvenlik');
    assert.strictEqual(dySorular.length, 4);
    assert.strictEqual(dySorular[0].tur, 'dy');
    assert.strictEqual(dySorular[0].ocKodu, 'ÖÇ-1');
    assert.strictEqual(dySorular[1].dogruDY, 'Y');
    assert.strictEqual(dySorular[3].ocKodu, 'ÖÇ-4');

    const bosKlasikCsv = Cekirdek.uretBosKlasikSablonuCSV();
    assert.ok(!bosKlasikCsv.includes('Tam_Puan'), 'Klasik CSV şablonunda sabit puan sütunu bulunmamalıdır');
    const klasikSorular = Cekirdek.cozSoruBankasiCSV(bosKlasikCsv, 'ders-ag-guvenlik');
    assert.strictEqual(klasikSorular.length, 2);
    assert.strictEqual(klasikSorular[0].tur, 'klasik');
    assert.strictEqual(klasikSorular[0].ocKodu, 'ÖÇ-3');
    assert.strictEqual(klasikSorular[1].zorluk, 'Zor');
    assert.strictEqual(klasikSorular[1].ocKodu, 'ÖÇ-4');

    const bosCsv = Cekirdek.uretBosSoruSablonuCSV();
    const csvSorular = Cekirdek.cozSoruBankasiCSV(bosCsv, 'ders-ag-guvenlik');
    assert.strictEqual(csvSorular.length, 5);

    // Sınav Tanımlarken Toplam 100 Puan Dağılımı (D/Y ve Test Bölüm Toplamını Soru Sayısına Bölme + Klasik Eşit / Tek Tek) Testi
    const puanEsit = Cekirdek.hesaplaSinavBolumVeSoruPuanlari({
      dySayisi: 10,
      dyToplamPuan: 20,
      testSayisi: 10,
      testToplamPuan: 60,
      klasikSayisi: 2,
      klasikPuanModu: 'esit',
      klasikToplamPuan: 20
    });
    assert.strictEqual(puanEsit.dySoruPuan, 2);
    assert.strictEqual(puanEsit.testSoruPuan, 6);
    assert.deepStrictEqual(puanEsit.klasikSoruPuanlari, [10, 10]);
    assert.strictEqual(puanEsit.toplamPuan, 100);
    assert.strictEqual(puanEsit.tam100Mu, true);

    const puanTekTek = Cekirdek.hesaplaSinavBolumVeSoruPuanlari({
      dySayisi: 10,
      dyToplamPuan: 20,
      testSayisi: 12,
      testToplamPuan: 60,
      klasikSayisi: 2,
      klasikPuanModu: 'tek_tek',
      klasikTekTekPuanlar: [8, 12]
    });
    assert.strictEqual(puanTekTek.dySoruPuan, 2);
    assert.strictEqual(puanTekTek.testSoruPuan, 5);
    assert.deepStrictEqual(puanTekTek.klasikSoruPuanlari, [8, 12]);
    assert.strictEqual(puanTekTek.klasikToplamPuan, 20);
    assert.strictEqual(puanTekTek.toplamPuan, 100);
    assert.strictEqual(puanTekTek.tam100Mu, true);

    // Canlı Şifre Kriterleri (Büyük/Küçük/Sayı/Simge), Hoca Giriş Doğrulaması ve Öğrenciye Özel Online Sınav Havuzu Testi
    const zayifSifre = Cekirdek.kontrolCanliSifreKurallari('abc123', 'abc123');
    assert.strictEqual(zayifSifre.tumuGecerli, false);
    const gucluSifre = Cekirdek.kontrolCanliSifreKurallari('Guvenli!2026', 'Guvenli!2026');
    assert.strictEqual(gucluSifre.tumuGecerli, true);

    const hocaBasarili = Cekirdek.dogrulaHocaGiris('hoca', 'Demo!Hoca2026');
    assert.strictEqual(hocaBasarili.basarili, true);
    const hocaHatali = Cekirdek.dogrulaHocaGiris('hoca', 'YanlisSifre');
    assert.strictEqual(hocaHatali.basarili, false);
    assert.strictEqual(hocaHatali.kod, 401);

    const kagitOgr1 = Cekirdek.uretKisiyeOzelOnlineSinav(Cekirdek.VARSAYILAN_SORULAR, 5, 5, '2023104011', 'SINAV-1');
    const kagitOgr2 = Cekirdek.uretKisiyeOzelOnlineSinav(Cekirdek.VARSAYILAN_SORULAR, 5, 5, '2023104042', 'SINAV-1');
    assert.strictEqual(kagitOgr1.length, 10);
    assert.strictEqual(kagitOgr2.length, 10);
    // İki öğrencinin soru dizilimi birbirinden farklı olmalı
    assert.notDeepStrictEqual(kagitOgr1.map((s) => s.id), kagitOgr2.map((s) => s.id));

    // Öğrenciye Özel Soru Kağıdı Varyasyonu, Kişiye Özel Cevap Anahtarı ve Çok Sayfalı A4 PDF Üretici Testi
    const ozelKagit1 = Cekirdek.uretOgrenciyeOzelKagitVaryasyonu(
      Cekirdek.VARSAYILAN_SORULAR,
      { sinavKodu: 'BMG101-10-10-2', dySayisi: 10, testSayisi: 10, klasikSayisi: 2, sikSayisi: 5, kitapcikGruplar: 'ABCD' },
      { ogrNo: '2023104011', adSoyad: 'Ahmet Yılmaz' },
      0,
      'kisiye_ozel_havuz'
    );
    const ozelKagit2 = Cekirdek.uretOgrenciyeOzelKagitVaryasyonu(
      Cekirdek.VARSAYILAN_SORULAR,
      { sinavKodu: 'BMG101-10-10-2', dySayisi: 10, testSayisi: 10, klasikSayisi: 2, sikSayisi: 5, kitapcikGruplar: 'ABCD' },
      { ogrNo: '2023104042', adSoyad: 'Zeynep Kaya' },
      1,
      'kisiye_ozel_havuz'
    );
    assert.strictEqual(ozelKagit1.ozelKod, 'ÖZEL-11');
    assert.strictEqual(ozelKagit2.ozelKod, 'ÖZEL-42');
    assert.strictEqual(ozelKagit1.anahtar.test.length, 10);
    assert.notDeepStrictEqual(
      ozelKagit1.varyasyon.test.map((s) => `${s.id}:${s.dogruHarf}`),
      ozelKagit2.varyasyon.test.map((s) => `${s.id}:${s.dogruHarf}`),
      'Öğrenciye özel soru kağıtlarında soru ve şık dizilimleri öğrenciye özgü farklılaşmalıdır'
    );
    // Doğru şık değerinin korunduğunu doğrula
    for (const ts of ozelKagit1.varyasyon.test) {
      assert.strictEqual(ts.siklar[harfler.indexOf(ts.dogruHarf)], ts.dogruSikDegeri);
    }

    // Öğrenciye özel sınav İspat Kaydı (#ISPAT-...) ve Resmi İspat Tutanağı (.txt) doğrulaması
    assert.ok(ozelKagit1.ispatKaydi && ozelKagit1.ispatKaydi.ispatMuhurKodu.startsWith('#ISPAT-'), 'Öğrenciye özel kağıtta kriptografik #ISPAT-... mührü bulunmalıdır');
    assert.ok(Array.isArray(ozelKagit1.ispatKaydi.soruIzlemListesi) && ozelKagit1.ispatKaydi.soruIzlemListesi.length === 22, 'İspat kaydında tüm soruların (10 DY + 10 Test + 2 Klasik) izlem kaydı bulunmalıdır');
    const ispatTxt = Cekirdek.uretOgrenciyeOzelSinavIspatRaporuTXT({
      sinavKodu: 'BMG101-10-10-2',
      baslik: { dersAdi: 'BMG101 - Bilgisayar Mühendisliğine Giriş', sinavBasligi: 'Güz Vize Sınavı' },
      ogrenciOzelPaketler: [ozelKagit1, ozelKagit2]
    });
    assert.ok(ispatTxt.includes('ÖĞRENCİYE ÖZEL SINAV RESMİ İSPAT VE DENETİM TUTANAĞI'), 'İspat raporu resmi başlığı içermelidir');
    assert.ok(ispatTxt.includes(ozelKagit1.ispatKaydi.ispatMuhurKodu), 'İspat raporu öğrencinin #ISPAT-... mührünü içermelidir');
    assert.ok(ispatTxt.includes('Orijinal Şık:') && ispatTxt.includes('Öğrenci Kağıdındaki Doğru Şık:'), 'İspat raporu orijinal -> karışık şık eşleşmesini kanıtlamalıdır');

    // Seçmeli Bologna ÖÇ madde ayrıştırıcı (4 madde, 5 madde, satır veya noktalı virgül ayrımı) doğrulaması
    const oc4 = Cekirdek.ayiklaDersOcMaddeleri('1. Ağ katmanlarını açıklar\n2. Kriptografiyi uygular\n3. Güvenlik duvarı kurar\n4. Güvenli kod yazar');
    assert.strictEqual(oc4.length, 4);
    assert.strictEqual(oc4[0].kod, 'ÖÇ-1');
    assert.strictEqual(oc4[3].kod, 'ÖÇ-4');
    const oc5 = Cekirdek.ayiklaDersOcMaddeleri('Veri yapıları; Algoritma analizi; Ağ protokolleri; İşletim sistemleri; Yazılım mühendisliği');
    assert.strictEqual(oc5.length, 5);
    assert.strictEqual(oc5[4].kod, 'ÖÇ-5');

    // Çok sayfalı A4 PDF ikili (binary) üretici testi
    const sahteJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
    const pdfBytes = Cekirdek.uretCokSayfaliA4PdfBytes([
      { jpegBytes: sahteJpeg, genislik: 794, yukseklik: 1123 },
      { jpegBytes: sahteJpeg, genislik: 794, yukseklik: 1123 }
    ]);
    assert.ok(pdfBytes instanceof Uint8Array && pdfBytes.length > 200, 'PDF bayt dizisi üretilmelidir');
    const pdfBaslik = Buffer.from(pdfBytes.slice(0, 8)).toString('ascii');
    const pdfBitis = Buffer.from(pdfBytes.slice(-10)).toString('ascii');
    assert.ok(pdfBaslik.startsWith('%PDF-1.4'), 'Üretilen dosya geçerli %PDF-1.4 başlığı taşımalıdır');
    assert.ok(pdfBitis.includes('%%EOF'), 'Üretilen PDF dosyası %%EOF ile sonlanmalıdır');
    assert.ok(Buffer.from(pdfBytes).includes(Buffer.from(sahteJpeg)), 'Sayfa JPEG baytları (jpegBytes) PDF içine gömülmelidir — boş sayfa üretilmemeli');
  });

  // 6. Zero-Trust Sunucu API Karşı-Örnek Testleri
  await testEt('6. Zero-Trust Sunucu API: Sahte kağıt/puan (forgedPaper) ve erken bitirme (earlyFinish) reddi', async () => {
    const server = await baslatSunucu(0);
    const port = server.address().port;
    const tabanUrl = `http://127.0.0.1:${port}`;

    try {
      // Karşı-örnek 1: İstemci kendi puanını veya sorularını göndermeye çalışırsa 400 dönmeli
      const r1 = await fetch(`${tabanUrl}/api/ogrenci-oturum-baslat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ogrNo: '2023104011', puan: 100, dogruHarf: 'A' })
      });
      assert.strictEqual(r1.status, 400);

      // Karşı-örnek 2: Başlangıçta bitti:true gönderilirse 400 dönmeli
      const r2 = await fetch(`${tabanUrl}/api/ogrenci-oturum-baslat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ogrNo: '2023104011', bitti: true })
      });
      assert.strictEqual(r2.status, 400);

      // Karşı-örnek 3: Kayıtsız öğrenci numarası 401 dönmeli
      const r3 = await fetch(`${tabanUrl}/api/ogrenci-oturum-baslat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ogrNo: '9999999999' })
      });
      assert.strictEqual(r3.status, 401);

      // Geçerli oturum başlatma ve cevap kilitleme
      const r4 = await fetch(`${tabanUrl}/api/ogrenci-oturum-baslat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ogrNo: '2023104011' })
      });
      assert.strictEqual(r4.status, 200);
      const oturumVeri = await r4.json();
      assert.ok(oturumVeri.token);
      // Sunucu istemciye dogruHarf / dogruDY göndermemeli!
      assert.strictEqual(oturumVeri.sorular[0].dogruDY, undefined);
      assert.strictEqual(oturumVeri.sorular[0].dogruHarf, undefined);

      // Öğretmen / Hoca Giriş Endpoint Testi (200 OK ve 401 Unauthorized)
      const rHocaOk = await fetch(`${tabanUrl}/api/hoca-giris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' })
      });
      assert.strictEqual(rHocaOk.status, 200);
      const hocaVeri = await rHocaOk.json();
      assert.ok(hocaVeri.token);

      const rHocaRed = await fetch(`${tabanUrl}/api/hoca-giris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kullaniciAdi: 'hoca', sifre: 'yanlis-sifre' })
      });
      assert.strictEqual(rHocaRed.status, 401);
    } finally {
      server.close();
    }
  });

  // 7. Bölüm 14-16 Yeni Özellikler: PDF Künye/JPEG Çözücü, 1 Puan Hassasiyetli Klasik Bar, KR-20/Cronbach Alpha, Harpp-Hogan Kopya Dedektörü ve ÖÇ Karnesi
  await testEt('7. PDF 3-Katmanlı Çözücü, Onlar+Birler Klasik OMR (7p/13p), KR-20 Güvenirlik, Kopya Benzerlik ve ÖÇ Karnesi', () => {
    // 7.1 PDF İçinden Künye Çıkarma Testi
    const sahtePdfMetni = '%PDF-1.5\nDoküman No: MUH-FRM-108\nRev.04 / 12.10.2026\n';
    const pdfBytes = new Uint8Array(Buffer.from(sahtePdfMetni, 'latin1'));
    const pdfCozum = Cekirdek.cozPdfIcindenMetinVeGorsel(pdfBytes);
    assert.strictEqual(pdfCozum.dokumanNo, 'MUH-FRM-108');
    assert.ok(pdfCozum.revizyon.includes('Rev.04'));

    // 7.2 Esnek Anahtar / Çift Şık Doğru Kabulü (TEST-3:B|D, TEST-5:C)
    const esnek = Cekirdek.cozEsnekAnahtarKurallari('TEST-3:B|D, TEST-5:C, DY-2:D|Y');
    assert.deepStrictEqual(esnek['TEST-3'], ['B', 'D']);
    assert.deepStrictEqual(esnek['TEST-5'], ['C']);
    assert.deepStrictEqual(esnek['DY-2'], ['D', 'Y']);

    // 7.3 1 Puan Hassasiyetli Klasik Puan Barı (onlar_birler: K1=7p, K2=13p -> Toplam 20p) OMR Testi
    const gen = Cekirdek.KANONIK_GENISLIK;
    const yuk = Cekirdek.hesaplaKanonikBalonHaritasi({ dySayisi: 2, testSayisi: 2, sikSayisi: 5, klasikSayisi: 2, kimlikModu: 'son2', klasikOptikModu: 'onlar_birler', klasikSoruPuanlari: [8, 15], klasikSoruPuan: 10 }).yukseklik;
    const pikselVeri = new Uint8ClampedArray(gen * yuk * 4);
    for (let i = 0; i < gen * yuk * 4; i += 4) {
      pikselVeri[i] = 248;
      pikselVeri[i + 1] = 248;
      pikselVeri[i + 2] = 248;
      pikselVeri[i + 3] = 255;
    }

    const yapiOnlarBirler = {
      dySayisi: 2,
      dySoruPuan: 10,
      testSayisi: 2,
      testSoruPuan: 30,
      sikSayisi: 5,
      klasikSayisi: 2,
      klasikSoruPuan: 10,
      klasikSoruPuanlari: [8, 15],
      klasikOptikModu: 'onlar_birler',
      kimlikModu: 'son2',
      haneSayisi: 2,
      cevapAnahtarlari: {
        A: { dy: ['D', 'Y'], test: ['B', 'D'], klasik: [] }
      }
    };

    const haritaOB = Cekirdek.hesaplaKanonikBalonHaritasi(yapiOnlarBirler);
    assert.strictEqual(haritaOB.klasikSatirlari.length, 2, '2 klasik soru için onlarBalonlar + birlerBalonlar içeren 2 klasik satır nesnesi üretilmelidir');

    const doldur = (b) => {
      const rKare = Math.pow(b.r * 0.85, 2);
      for (let dy = -Math.ceil(b.r); dy <= Math.ceil(b.r); dy++) {
        for (let dx = -Math.ceil(b.r); dx <= Math.ceil(b.r); dx++) {
          if (dx * dx + dy * dy <= rKare) {
            const px = Math.round(b.x + dx);
            const py = Math.round(b.y + dy);
            if (px >= 0 && px < gen && py >= 0 && py < yuk) {
              const p = (py * gen + px) * 4;
              pikselVeri[p] = 15;
              pikselVeri[p + 1] = 15;
              pikselVeri[p + 2] = 15;
            }
          }
        }
      }
    };

    doldur(haritaOB.grupBalonlari.find((b) => b.harf === 'A'));
    doldur(haritaOB.kimlikSatirlari[0].balonlar.find((b) => b.rakam === '1'));
    doldur(haritaOB.kimlikSatirlari[1].balonlar.find((b) => b.rakam === '1'));
    doldur(haritaOB.dySatirlari[0].balonlar.find((b) => b.secenek === 'D'));
    doldur(haritaOB.dySatirlari[1].balonlar.find((b) => b.secenek === 'Y'));
    doldur(haritaOB.testSatirlari[0].balonlar.find((b) => b.secenek === 'B'));
    doldur(haritaOB.testSatirlari[1].balonlar.find((b) => b.secenek === 'D'));

    // K1 (max 8p) için 07 puan (Onlar=0, Birler=7) ve K2 (max 15p) için 13 puan (Onlar=1, Birler=3) kodla
    doldur(haritaOB.klasikSatirlari[0].onlarBalonlar.find((b) => b.secenek === '0'));
    doldur(haritaOB.klasikSatirlari[0].birlerBalonlar.find((b) => b.secenek === '7'));
    doldur(haritaOB.klasikSatirlari[1].onlarBalonlar.find((b) => b.secenek === '1'));
    doldur(haritaOB.klasikSatirlari[1].birlerBalonlar.find((b) => b.secenek === '3'));

    const koseler = {
      tl: { x: 26, y: 26, bulundu: true },
      tr: { x: gen - 26, y: 26, bulundu: true },
      bl: { x: 26, y: yuk - 26, bulundu: true },
      br: { x: gen - 26, y: yuk - 26, bulundu: true }
    };

    const sonucOB = Cekirdek.okuOptikFormImageData(
      { width: gen, height: yuk, data: pikselVeri },
      yapiOnlarBirler,
      Cekirdek.VARSAYILAN_OGRENCILER,
      koseler
    );
    assert.deepStrictEqual(
      sonucOB.klasikDetay.map((x) => x.verilenPuan),
      [7, 13],
      '1 puan hassasiyetli Onlar+Birler barı 7 ve 13 ara puanlarını tam okumalıdır'
    );
    assert.strictEqual(sonucOB.klasikToplamPuan, 20);

    // 7.4 KR-20 / Cronbach Alpha, Harpp-Hogan Kopya Dedektörü ve ÖÇ Bireysel Karne Analizi
    const ornekSonuclar = [
      {
        ogrNo: '2023104011',
        adSoyad: 'Ahmet Yılmaz',
        grup: 'A',
        toplamPuan: 65,
        klasikDetay: [{ soruNo: 1, verilenPuan: 8 }, { soruNo: 2, verilenPuan: 7 }],
        dyDetay: [{ verilen: 'D', sonuc: 'DOGRU' }, { verilen: 'Y', sonuc: 'YANLIS' }],
        testDetay: [
          { verilen: 'E', sonuc: 'YANLIS' },
          { verilen: 'C', sonuc: 'YANLIS' },
          { verilen: 'B', sonuc: 'YANLIS' },
          { verilen: 'A', sonuc: 'DOGRU' }
        ]
      },
      {
        ogrNo: '2023104015',
        adSoyad: 'Zeynep Kaya',
        grup: 'A',
        toplamPuan: 65,
        klasikDetay: [{ soruNo: 1, verilenPuan: 8 }, { soruNo: 2, verilenPuan: 7 }],
        dyDetay: [{ verilen: 'D', sonuc: 'DOGRU' }, { verilen: 'Y', sonuc: 'YANLIS' }],
        testDetay: [
          { verilen: 'E', sonuc: 'YANLIS' },
          { verilen: 'C', sonuc: 'YANLIS' },
          { verilen: 'B', sonuc: 'YANLIS' },
          { verilen: 'A', sonuc: 'DOGRU' }
        ]
      },
      {
        ogrNo: '2023104042',
        adSoyad: 'Ayşe Yıldız',
        grup: 'A',
        toplamPuan: 95,
        klasikDetay: [{ soruNo: 1, verilenPuan: 15 }, { soruNo: 2, verilenPuan: 15 }],
        dyDetay: [{ verilen: 'D', sonuc: 'DOGRU' }, { verilen: 'D', sonuc: 'DOGRU' }],
        testDetay: [
          { verilen: 'A', sonuc: 'DOGRU' },
          { verilen: 'B', sonuc: 'DOGRU' },
          { verilen: 'D', sonuc: 'DOGRU' },
          { verilen: 'A', sonuc: 'DOGRU' }
        ]
      }
    ];

    const sinavYapiAnaliz = {
      dySayisi: 2,
      dySoruPuan: 5,
      testSayisi: 4,
      testSoruPuan: 15,
      klasikSayisi: 2,
      klasikSoruPuan: 15,
      klasikSoruPuanlari: [15, 15],
      cevapAnahtarlari: { A: { dy: ['D', 'D'], test: ['A', 'B', 'D', 'A'], klasik: [] } },
      kitapciklar: {
        A: {
          dy: [{ kazanim: 'ÖÇ-1: Ağ Katmanları' }, { kazanim: 'ÖÇ-1: Ağ Katmanları' }],
          test: [
            { kazanim: 'ÖÇ-2: Kriptografi' },
            { kazanim: 'ÖÇ-2: Kriptografi' },
            { kazanim: 'ÖÇ-3: Sıfır Güven' },
            { kazanim: 'ÖÇ-3: Sıfır Güven' }
          ],
          klasik: [{ kazanim: 'ÖÇ-4: Mimari Tasarım' }, { kazanim: 'ÖÇ-4: Mimari Tasarım' }]
        }
      }
    };

    const maddeAnaliz = Cekirdek.hesaplaSinifVeMaddeAnalizi(ornekSonuclar, sinavYapiAnaliz);
    assert.strictEqual(typeof maddeAnaliz.kr20, 'number');
    assert.strictEqual(typeof maddeAnaliz.cronbachAlpha, 'number');
    assert.strictEqual(typeof maddeAnaliz.standartHata, 'number');

    const kopyaCiftler = Cekirdek.tespitEtKopyaBenzerlikCiftleri(ornekSonuclar);
    assert.strictEqual(kopyaCiftler.length, 1, 'Aynı 4 yanlış şıkkı işaretleyen Ahmet ve Zeynep çifti yakalanmalıdır');
    assert.strictEqual(kopyaCiftler[0].ortakYanlisSayisi, 4);

    const kazanimKarne = Cekirdek.hesaplaKazanimVeKarneAnalizi(ornekSonuclar, sinavYapiAnaliz);
    assert.ok(kazanimKarne.kazanimTablosu.length >= 3);
    assert.strictEqual(kazanimKarne.ogrenciKarneleri.length, 3);
  });

  // 8. Haftalık Konu/Kota Bazlı Soru Seçimi, Kağıttan Tek Soru Kaldırma/Değiştirme ve Canlı Sınav Belirtke Tablosu
  await testEt('8. Haftalık Konu Kapsamı (Vize 1-7 / Manuel Kota), Kağıt Üzerinde Tek Soru Değiştirme (🔄) ve Belirtke Tablosu', () => {
    // 8.1 CSV Şablonlarında Hafta (1..14) Sütunu Doğrulaması
    const testCsvSorular = Cekirdek.cozSoruBankasiCSV(Cekirdek.uretBosTestSablonuCSV(), 'ders-ag-guvenlik');
    assert.strictEqual(testCsvSorular[0].hafta, 1);
    assert.strictEqual(testCsvSorular[1].hafta, 3);
    assert.strictEqual(testCsvSorular[2].hafta, 6);

    // 8.2 Vize Kapsamı (Yalnızca 1..7. Haftalar) ve Manuel Haftalık Kota Seçimi
    const vizeSecim = Cekirdek.secHaftalikVeKotaliSinavSorulari(Cekirdek.VARSAYILAN_SORULAR, {
      dySayisi: 5,
      testSayisi: 7,
      klasikSayisi: 2,
      zorlukModu: 'dengeli',
      seciliHaftalar: [1, 2, 3, 4, 5, 6, 7],
      haftaDagilimModu: 'otomatik_dengeli',
      haricTutSorulanlar: false
    });
    assert.strictEqual(vizeSecim.dy.length, 5);
    assert.strictEqual(vizeSecim.test.length, 7);
    assert.strictEqual(vizeSecim.klasik.length, 2);
    for (const s of vizeSecim.tumSecili) {
      assert.ok(s.hafta >= 1 && s.hafta <= 7, `Vize kapsamında seçilen tüm sorular 1-7. hafta aralığında olmalıdır (Bulunan: H${s.hafta})`);
    }

    // 8.3 Sınav Kağıdından Tek Soru Kaldırıp Yerine Havuzdan Aynı Hafta/Zorlukta Yeni Soru Atama (🔄 Değiştir)
    const ilkTestListesi = vizeSecim.test.slice();
    const kaldirilacakSoru = ilkTestListesi[2]; // 3. sıradaki test sorusunu kağıttan kaldır
    const degisimSonucu = Cekirdek.degistirTekSoruHavuzdan(
      Cekirdek.VARSAYILAN_SORULAR,
      ilkTestListesi,
      kaldirilacakSoru.id,
      {
        seciliHaftalar: [1, 2, 3, 4, 5, 6, 7],
        reddedilenSoruIdleri: []
      }
    );
    assert.strictEqual(degisimSonucu.basarili, true, 'Kağıttan kaldırılan sorunun yerine havuzdan yeni soru atanmalıdır');
    assert.notStrictEqual(degisimSonucu.yeniSoru.id, kaldirilacakSoru.id, 'Atanan yeni soru kaldırılan sorudan farklı olmalıdır');
    assert.strictEqual(degisimSonucu.yeniListe[2].id, degisimSonucu.yeniSoru.id, 'Yeni soru kağıtta tam olarak kaldırılan sorunun sırasına (indeks 2) yerleşmelidir');
    assert.strictEqual(degisimSonucu.yeniListe[0].id, ilkTestListesi[0].id, 'Diğer soruların sırası ve yeri korunmalıdır');
    assert.ok(degisimSonucu.reddedilenSoruIdleri.includes(kaldirilacakSoru.id), 'Kaldırılan soru reddedilenler listesine eklenmelidir');

    // 8.4 Canlı Sınav Belirtke Tablosu (Hafta × Kazanım × Soru Türü × Zorluk × Puan)
    const belirtke = Cekirdek.uretSinavBelirtkeTablosu(vizeSecim.tumSecili, {
      dySoruPuan: 2,
      testSoruPuan: 10,
      klasikSoruPuan: 10,
      klasikSoruPuanlari: [10, 10]
    });
    assert.strictEqual(belirtke.genelOzet.toplamSoru, 14);
    assert.strictEqual(belirtke.genelOzet.toplamPuan, 100);
    assert.ok(belirtke.aktifSatirlar.length >= 4, 'Belirtke tablosu aktif haftaları detaylı listelemelidir');
  });

  // 9. Gerçek QR Üretimi (Öğrenci Listesi Telefona Aktarım) ve Ağ Adresi Uç Noktası
  await testEt('9. Gerçek QR (qrcode-generator) öğrenci listesi yükünü kodlar ve /api/ag-adresi çalışır', async () => {
    const qrcode = require('./qrcode-generator.js');
    const metin = Cekirdek.VARSAYILAN_OGRENCILER.map((o) => `${o.ogrNo};${o.adSoyad}`).join('\n');
    const url = `http://192.168.1.20:3000/optik-mobil.html#ogr=${encodeURIComponent(Buffer.from(metin, 'utf8').toString('base64'))}`;
    const qr = qrcode(0, 'M');
    qr.addData(url, 'Byte');
    qr.make();
    assert.ok(qr.getModuleCount() >= 21, 'QR matrisi üretilmelidir');

    const server = await baslatSunucu(0);
    try {
      const r = await fetch(`http://127.0.0.1:${server.address().port}/api/ag-adresi`);
      assert.strictEqual(r.status, 200);
      assert.ok(Array.isArray((await r.json()).adresler));
      const js = await fetch(`http://127.0.0.1:${server.address().port}/qrcode-generator.js`);
      assert.strictEqual(js.status, 200, 'qrcode-generator.js sunucudan servis edilmelidir');
    } finally {
      server.close();
    }
  });

  // 10. Kalite Formu Dosyaları: .docx (logo + künye), .xls (Excel) ve .doc (ikili) örnekleri
  await testEt('10. Kalite formu örnekleri: FRM-046 (.docx + logo), FRM-059 (.xls), .doc künye ve Excel tarih seri no çevirisi', async () => {
    const fs = require('fs');
    const path = require('path');
    const zlib = require('zlib');
    const XLSX = require('xlsx');
    const ornek = (ad) => path.join(__dirname, 'ornek-dosyalar', ad);
    const inflate = async (u8) => new Uint8Array(zlib.inflateRawSync(Buffer.from(u8)));

    const docx = await Cekirdek.cozDocxKaliteFormu(new Uint8Array(fs.readFileSync(ornek('2853_files_1675426892.docx'))), inflate);
    assert.strictEqual(docx.dokumanNo, 'FRM-046');
    assert.strictEqual(docx.ilkYayinTarihi, '30.01.2023');
    assert.strictEqual(docx.revizyon, '-');
    assert.ok(docx.formBasligi && docx.formBasligi.includes('TUTANA'));
    assert.ok(docx.logoDataUrl && docx.logoDataUrl.startsWith('data:image/png;base64,'), 'Üst bilgideki kurum logosu çıkarılmalıdır');

    const kitap = XLSX.readFile(ornek('2853_files_1713424265.xls'));
    const satirlar = XLSX.utils.sheet_to_json(kitap.Sheets[kitap.SheetNames[0]], { header: 1, defval: '' });
    const xls = Cekirdek.cikarKaliteKunyesiMetinden(satirlar.map((s) => s.join(' ')).join(' '));
    assert.strictEqual(xls.dokumanNo, 'FRM-059');
    assert.strictEqual(xls.ilkYayinTarihi, '30.01.2023', 'Excel tarih seri numarası (44956) gg.aa.yyyy olmalıdır');
    assert.strictEqual(Cekirdek.excelSeriNoyuTarihYap(44956), '30.01.2023');

    const doc = Cekirdek.cozDocKaliteFormu(new Uint8Array(fs.readFileSync(ornek('BL304_Tum_Sinif_Ogrenciye_Ozel_Kagitlar_ve_Anahtar.doc'))));
    assert.ok(/^[A-Z]{2,6}-\d{2,5}$/.test(doc.dokumanNo));

    await assert.rejects(() => Cekirdek.cozDocxKaliteFormu(new Uint8Array([1, 2, 3, 4]), inflate), /ZIP/, 'Bozuk ZIP reddedilmelidir');
  });

  // 11. Salon kontenjan dağıtımı: sıralı, dengeli ve kontenjan aşımında otomatik Ek Salon
  await testEt('11. Salon kontenjan dağıtımı: sıralı, dengeli ve yetersiz kontenjanda Ek Salon açma', async () => {
    const ogrler = Array.from({ length: 10 }, (_, i) => ({
      ogrNo: `20241010${String(i + 1).padStart(2, '0')}`,
      adSoyad: `Öğrenci ${i + 1}`
    }));

    const sirali = Cekirdek.salonlaraDagit(
      ogrler,
      [{ id: 's1', ad: 'B-201', kontenjan: 4 }, { id: 's2', ad: 'B-202', kontenjan: 4 }],
      'sirali'
    );
    assert.strictEqual(sirali.yetersiz, true, 'Kontenjan yetmediğinde yetersiz=true olmalıdır');
    assert.strictEqual(sirali.ekSalonSayisi, 1, '1 adet Ek Salon açılmalıdır');
    assert.strictEqual(sirali.yerlesim.length, 3);
    assert.deepStrictEqual(sirali.yerlesim.map((k) => k.ogrenciler.length), [4, 4, 2]);
    assert.strictEqual(sirali.yerlesim[2].salon.ad, 'Ek Salon 1');

    const dengeli = Cekirdek.salonlaraDagit(
      ogrler.slice(0, 8),
      [{ id: 's1', ad: 'Amfi-1', kontenjan: 6 }, { id: 's2', ad: 'Amfi-2', kontenjan: 6 }],
      'dengeli'
    );
    assert.strictEqual(dengeli.yetersiz, false);
    assert.deepStrictEqual(dengeli.yerlesim.map((k) => k.ogrenciler.length), [4, 4]);

    const bos = Cekirdek.salonlaraDagit([], [{ id: 's1', ad: 'B-201', kontenjan: 30 }], 'sirali');
    assert.strictEqual(bos.toplamOgrenci, 0);
    assert.strictEqual(bos.yerlesim[0].ogrenciler.length, 0);
  });

  // 12. Ders silindiğinde soruların Soru Arşivinde korunması, yeni derse dahil edilmesi ve Online Sınav Tanımlama API'si
  await testEt('12. Ders silme & Soru Arşivi koruma/aktarma ve Online Sınav Tanımlama API', async () => {
    const ornekDersler = [
      { id: 'ders-1', kod: 'BİL304', ad: 'Ağ Güvenliği' },
      { id: 'ders-2', kod: 'BİL201', ad: 'Veri Yapıları' }
    ];
    const ornekSorular = [
      { id: 'S-1', dersId: 'ders-1', tur: 'dy', hafta: 1, metin: 'Soru 1', dogruDY: 'D' },
      { id: 'S-2', dersId: 'ders-1', tur: 'test', hafta: 2, metin: 'Soru 2', dogruHarf: 'A', siklar: ['A', 'B', 'C', 'D', 'E'] },
      { id: 'S-3', dersId: 'ders-2', tur: 'klasik', hafta: 3, metin: 'Soru 3', rubrik: 'Rubrik' }
    ];

    // Dersi sil -> soruları asla silinmez, arşivlenir
    const arsivSonuc = Cekirdek.arsivleDersVeSorulariKorun(ornekDersler, ornekSorular, [], 'ders-1');
    assert.strictEqual(arsivSonuc.dersler.length, 1, 'Silinen ders aktif ders listesinden çıkmalıdır');
    assert.strictEqual(arsivSonuc.sorular.length, 3, 'Ders silinse bile hiçbir soru silinmemelidir');
    assert.strictEqual(arsivSonuc.korunanSoruSayisi, 2, 'Silinen dersin 2 sorusu arşivlenmelidir');
    assert.strictEqual(arsivSonuc.arsivDersler.length, 1, 'Silinen ders arşiv ders listesine kaydedilmelidir');

    const havuzlar = Cekirdek.listeleArsivSoruHavuzlari(arsivSonuc.dersler, arsivSonuc.sorular, arsivSonuc.arsivDersler);
    assert.strictEqual(havuzlar.length, 1);
    assert.strictEqual(havuzlar[0].kod, 'BİL304');
    assert.strictEqual(havuzlar[0].toplam, 2);

    // Yeni ders eklendiğinde arşiv havuzunu yeni derse dahil et
    const yeniDersId = 'ders-yeni-ag';
    const aktarim = Cekirdek.dahilEtArsivSorulariniDerse(
      arsivSonuc.sorular,
      arsivSonuc.arsivDersler,
      ['ders-1'],
      yeniDersId
    );
    assert.strictEqual(aktarim.aktarilanSoruSayisi, 2, 'Arşivdeki 2 soru yeni derse aktarılmalıdır');
    assert.strictEqual(aktarim.arsivDersler.length, 0, 'Tüm soruları aktarılan arşiv kaydı temizlenmelidir');
    const yeniDersSorulari = aktarim.sorular.filter((s) => s.dersId === yeniDersId && !s.arsivde);
    assert.strictEqual(yeniDersSorulari.length, 2);

    // Online Sınav Tanımlama ve Durum Sunucu API doğrulaması
    const server = await baslatSunucu(0);
    try {
      const port = server.address().port;
      const tanimYanit = await fetch(`http://127.0.0.1:${port}/api/online-sinav-tanimla`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sinav: {
            sinavId: 'SINAV-2026-FINAL',
            baslik: '2026-2027 Güz Final Sınavı',
            sinavTuru: 'Final',
            dersId: 'ders-1',
            aktif: true,
            sureDk: 50,
            dySayisi: 5,
            testSayisi: 10
          }
        })
      });
      assert.strictEqual(tanimYanit.status, 200);
      const tanimVeri = await tanimYanit.json();
      assert.strictEqual(tanimVeri.kaydedildi, true);
      assert.strictEqual(tanimVeri.sinavId, 'SINAV-2026-FINAL');

      const durumYanit = await fetch(`http://127.0.0.1:${port}/api/online-sinav-durum`);
      assert.strictEqual(durumYanit.status, 200);
      const durumVeri = await durumYanit.json();
      assert.strictEqual(durumVeri.sinavId, 'SINAV-2026-FINAL');
      assert.strictEqual(durumVeri.sureDk, 50);

      // 13. Sınav Bazlı Delil Niteliğinde Kiosk Denetim Logları (Zincirleme Hash, TXT/CSV/JSON Rapor ve API)
      const log1 = Cekirdek.olusturKioskDelilLogKaydi({
        sinavId: 'SINAV-2026-FINAL',
        sinavBaslik: '2026-2027 Güz Final Sınavı',
        ogrNo: '2024101001',
        adSoyad: 'Deniz Arslan',
        olayTuru: 'OTURUM_BASLADI',
        aktifSoruNo: 1,
        toplamSoru: 20,
        kalanSureSn: 3000,
        ihlalSayisi: 0,
        cihazBilgisi: '1920x1080 | Win32',
        aciklama: 'Öğrenci Kiosk oturumunu başlattı.'
      }, 'GENESIS-00000000');

      const log2 = Cekirdek.olusturKioskDelilLogKaydi({
        sinavId: 'SINAV-2026-FINAL',
        sinavBaslik: '2026-2027 Güz Final Sınavı',
        ogrNo: '2024101001',
        adSoyad: 'Deniz Arslan',
        olayTuru: 'IHLAL_SEKME_UYGULAMA',
        aktifSoruNo: 3,
        toplamSoru: 20,
        kalanSureSn: 2840,
        ihlalSayisi: 1,
        cihazBilgisi: '1920x1080 | Win32',
        aciklama: 'Öğrenci başka bir sekmeye geçti (visibilitychange: hidden).'
      }, log1.olayHash);

      assert.strictEqual(log1.oncekiHash, 'GENESIS-00000000');
      assert.strictEqual(log2.oncekiHash, log1.olayHash, 'Her log kaydı bir önceki kaydın kriptografik özetine (oncekiHash) bağlanmalıdır');
      assert.notStrictEqual(log1.olayHash, log2.olayHash);

      const resmiTxt = Cekirdek.uretResmiDelilLogRaporuTXT([log1, log2], {
        sinavId: 'SINAV-2026-FINAL',
        sinavBaslik: '2026-2027 Güz Final Sınavı',
        dersAd: 'BİL304 - Ağ Güvenliği',
        hocaAd: 'Dr. Öğr. Üyesi Fatih Çakmak'
      });
      assert.ok(resmiTxt.includes('RESMİ ONLİNE SINAV GÜVENLİK, KİOSK VE İHLAL DELİL LOG RAPORU'));
      assert.ok(resmiTxt.includes('IHLAL_SEKME_UYGULAMA'));
      assert.ok(resmiTxt.includes(log2.olayHash));

      const delilCsv = Cekirdek.uretDelilLogCSV([log1, log2], 'SINAV-2026-FINAL');
      assert.ok(delilCsv.includes('OncekiHash;OlayHash'));
      assert.ok(delilCsv.includes('2024101001'));

      const logKaydetYanit = await fetch(`http://127.0.0.1:${port}/api/kiosk-log-kaydet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log2)
      });
      assert.strictEqual(logKaydetYanit.status, 201);
      const logIndirTxt = await fetch(`http://127.0.0.1:${port}/api/kiosk-log-indir?sinavId=SINAV-2026-FINAL&format=txt`);
      assert.strictEqual(logIndirTxt.status, 200);
      const indirilenMetin = await logIndirTxt.text();
      assert.ok(indirilenMetin.includes('IHLAL_SEKME_UYGULAMA'));
    } finally {
      server.close();
    }
  });

  // 14. Bologna Öğrenim Çıktısı (ÖÇ) CSV Sütunu (Ogrenim_Ciktisi_OC) ve "Her ÖÇ İçin En Az 1 Soru" Garantisi Testi
  await testEt('14. Bologna ÖÇ CSV sütunu (Ogrenim_Ciktisi_OC) ve Her ÖÇ İçin En Az 1 Soru garantisi', () => {
    const testCsv = Cekirdek.uretBosTestSablonuCSV();
    const dyCsv = Cekirdek.uretBosDySablonuCSV();
    const klasikCsv = Cekirdek.uretBosKlasikSablonuCSV();
    const karmaCsv = Cekirdek.uretBosSoruSablonuCSV();

    assert.ok(testCsv.includes('Ogrenim_Ciktisi_OC'), 'Test CSV şablonunda Ogrenim_Ciktisi_OC sütunu bulunmalıdır');
    assert.ok(dyCsv.includes('Ogrenim_Ciktisi_OC'), 'D/Y CSV şablonunda Ogrenim_Ciktisi_OC sütunu bulunmalıdır');
    assert.ok(klasikCsv.includes('Ogrenim_Ciktisi_OC'), 'Klasik CSV şablonunda Ogrenim_Ciktisi_OC sütunu bulunmalıdır');
    assert.ok(karmaCsv.includes('Ogrenim_Ciktisi_OC'), 'Karma CSV şablonunda Ogrenim_Ciktisi_OC sütunu bulunmalıdır');

    const cozulmusKarma = Cekirdek.cozSoruBankasiCSV(karmaCsv, 'ders-bologna');
    assert.strictEqual(cozulmusKarma.length, 5);
    assert.strictEqual(cozulmusKarma[0].ocKodu, 'ÖÇ-1');
    assert.strictEqual(cozulmusKarma[1].ocKodu, 'ÖÇ-2');
    assert.strictEqual(cozulmusKarma[2].ocKodu, 'ÖÇ-3');
    assert.strictEqual(cozulmusKarma[3].ocKodu, 'ÖÇ-4');
    assert.strictEqual(cozulmusKarma[4].ocKodu, 'ÖÇ-5');

    // CSV Dışa Aktarım (uretSoruBankasiCSV) ve Geri İthalat (Round-trip) Testi
    const disaAktarilanCsv = Cekirdek.uretSoruBankasiCSV(cozulmusKarma);
    assert.ok(disaAktarilanCsv.includes('Zorluk_Derecesi;Ogrenim_Ciktisi_OC;Konu_Kazanim'));
    const geriYuklenen = Cekirdek.cozSoruBankasiCSV(disaAktarilanCsv, 'ders-bologna');
    assert.strictEqual(geriYuklenen.length, 5);
    assert.deepStrictEqual(
      geriYuklenen.map((s) => s.ocKodu),
      ['ÖÇ-1', 'ÖÇ-2', 'ÖÇ-3', 'ÖÇ-4', 'ÖÇ-5']
    );

    // Dengesiz Soru Havuzunda (ÖÇ-1'den 12 soru, ÖÇ-2..ÖÇ-5'ten yalnız 1'er soru)
    // 5 soruluk sınav seçildiğinde "Her ÖÇ İçin En Az 1 Soru" garantisinin çalışması
    const dengesizHavuz = [];
    for (let i = 1; i <= 12; i++) {
      dengesizHavuz.push({
        id: `havuz-oc1-${i}`,
        dersId: 'ders-bologna',
        tur: 'test',
        hafta: (i % 4) + 1,
        ocKodu: 'ÖÇ-1',
        kazanim: 'ÖÇ-1: Temel Kavramlar',
        zorluk: 'Orta',
        metin: `ÖÇ-1 Sorusu ${i}`,
        siklar: ['A', 'B', 'C', 'D', 'E'],
        dogruHarf: 'A'
      });
    }
    ['ÖÇ-2', 'ÖÇ-3', 'ÖÇ-4', 'ÖÇ-5'].forEach((oc, idx) => {
      dengesizHavuz.push({
        id: `havuz-nadir-${idx + 2}`,
        dersId: 'ders-bologna',
        tur: 'test',
        hafta: 1, // Hepsi 1. haftada yığılmış olsa bile Set-Cover ÖÇ garantisi yakalamalıdır!
        ocKodu: oc,
        kazanim: `${oc}: Kritik Bologna Çıktısı`,
        zorluk: 'Zor',
        metin: `${oc} Nadir Sorusu`,
        siklar: ['A', 'B', 'C', 'D', 'E'],
        dogruHarf: 'B'
      });
    });

    const secim = Cekirdek.secHaftalikVeKotaliSinavSorulari(dengesizHavuz, {
      dySayisi: 0,
      testSayisi: 5,
      klasikSayisi: 0,
      seciliHaftalar: [1, 2, 3, 4],
      herOcEnAzBirSoru: true
    });

    assert.strictEqual(secim.test.length, 5);
    const secilenOcKumesi = new Set(secim.test.map((s) => Cekirdek.normalizeOcKodu(s.ocKodu || s.kazanim)));
    ['ÖÇ-1', 'ÖÇ-2', 'ÖÇ-3', 'ÖÇ-4', 'ÖÇ-5'].forEach((beklenenOc) => {
      assert.ok(secilenOcKumesi.has(beklenenOc), `Sınavda ${beklenenOc} için en az 1 soru bulunmalıdır`);
    });
    assert.strictEqual(secim.ocKapsamaRaporu.eksikOcKodlari.length, 0);
    assert.strictEqual(secim.ocKapsamaRaporu.tamKapsandiMi, true);

    const belirtke = Cekirdek.uretSinavBelirtkeTablosu(
      secim.test,
      { dySoruPuan: 0, testSoruPuan: 20, klasikSoruPuan: 0 },
      dengesizHavuz
    );
    assert.strictEqual(belirtke.herOcEnAzBirTamamMi, true);
    assert.strictEqual(belirtke.eksikOcKodlari.length, 0);
    assert.strictEqual(belirtke.ocSatirlar.length, 5);
  });

  console.log(`\n=== TÜM TESTLER BAŞARIYLA TAMAMLANDI (${gecen}/${gecen} GEÇTİ · 0 HATA) ===`);
}

calistirTumTestler().catch((err) => {
  console.error('TEST HATASI:', err);
  process.exit(1);
});
