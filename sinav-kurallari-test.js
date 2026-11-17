/* ==========================================================================
   SINAV KURALLARI TESTİ (çekirdek, tarayıcısız)
   Öğretmenin sınav kuralları kalıcı olarak korunur:
   1) Sorular yalnız seçilen haftalardan; her ÖÇ'den en az bir soru.
   2) Doğru şıklar eşit sayıda ve dağınık (A–E dengeli; D/Y'de art arda ≤ 3).
   3) Kitapçıklar (A/B/C/D): aynı sorular, farklı soru sırası ve şık yeri.
   4) Online sınav: her öğrenciye aynı sorular, farklı sıra ve şık yeri.
   Çalıştırma: node sinav-kurallari-test.js
   ========================================================================== */
'use strict';
const assert = require('assert');
const C = require('./guvenlik-ve-veri.js');

let gecen = 0;
let hata = 0;
function kontrol(ad, kosul, detay = '') {
  if (kosul) gecen++; else hata++;
  console.log(`  ${kosul ? '✓' : '✗ HATA'} ${ad}${detay && (!kosul || process.env.AYRINTI) ? ` — ${detay}` : ''}`);
}

// 14 hafta × (2 D/Y + 3 test), 5 ÖÇ; doğru şık havuzda bilerek hep "A" (dengeyi uygulama sağlamalı)
const HAVUZ = [];
for (let h = 1; h <= 14; h++) {
  const oc = `ÖÇ-${((h - 1) % 5) + 1}`;
  for (let i = 0; i < 2; i++) HAVUZ.push({ id: `DY-${h}-${i}`, tur: 'dy', hafta: h, ocKodu: oc, kazanim: `${oc}: kazanım`, metin: `D/Y ${h}.${i}`, dogruDY: 'D', zorluk: 'Orta' });
  for (let i = 0; i < 3; i++) HAVUZ.push({ id: `T-${h}-${i}`, tur: 'test', hafta: h, ocKodu: oc, kazanim: `${oc}: kazanım`, metin: `Test ${h}.${i}`, siklar: [`doğru ${h}.${i}`, 'b', 'c', 'd', 'e'], dogruHarf: 'A', zorluk: 'Orta' });
}
const harfSay = (dizi) => dizi.reduce((m, h) => { m[h] = (m[h] || 0) + 1; return m; }, {});
const dengeliMi = (dizi, k = 5) => { const s = Object.values(harfSay(dizi)); while (s.length < k) s.push(0); return Math.max(...s) - Math.min(...s) <= 1; };
const enUzunSeri = (dizi) => { let m = 0; let c = 0; let o = null; dizi.forEach((x) => { c = x === o ? c + 1 : 1; o = x; m = Math.max(m, c); }); return m; };

console.log('=== SINAV KURALLARI TESTİ ===');
try {
  // 1) Seçili haftalar + her ÖÇ
  const HAFTALAR = [1, 2, 3, 4, 5, 6, 7];
  const secim = C.secHaftalikVeKotaliSinavSorulari(HAVUZ, { dySayisi: 10, testSayisi: 10, klasikSayisi: 0, seciliHaftalar: HAFTALAR, herOcEnAzBirSoru: true, zorlukModu: 'tumu' });
  const secilen = [...secim.dy, ...secim.test];
  kontrol('1) Kağıt: 10 D/Y + 10 test seçildi', secim.dy.length === 10 && secim.test.length === 10, `${secim.dy.length}/${secim.test.length}`);
  kontrol('1) Kağıt: soruların hepsi seçilen haftalardan (1–7)', secilen.every((s) => HAFTALAR.includes(Number(s.hafta))), secilen.map((s) => s.hafta).join(','));
  const ocler = new Set(secilen.map((s) => s.ocKodu));
  kontrol('1) Kağıt: 5 ÖÇ\'nin her birinden en az bir soru var', ['ÖÇ-1', 'ÖÇ-2', 'ÖÇ-3', 'ÖÇ-4', 'ÖÇ-5'].every((o) => ocler.has(o)) && secim.ocKapsamaRaporu.tamKapsandiMi, [...ocler].join(','));

  // 2-3) Kitapçıklar
  const kitap = {};
  ['A', 'B', 'C', 'D'].forEach((g) => { kitap[g] = C.uretKitapcikVaryasyonu(secilen, g, 'KURAL-TEST-VIZE', true, 5); });
  const kume = (k) => [...k.dy, ...k.test].map((s) => s.id).sort().join('|');
  kontrol('3) Kitapçık: A/B/C/D\'de birebir aynı sorular', ['B', 'C', 'D'].every((g) => kume(kitap[g]) === kume(kitap.A)));
  kontrol('3) Kitapçık: B/C/D\'de test soru sırası A\'dan farklı', ['B', 'C', 'D'].every((g) => kitap[g].test.map((s) => s.id).join() !== kitap.A.test.map((s) => s.id).join()));
  kontrol('3) Kitapçık: aynı sorunun şık yeri kitapçıklar arasında değişiyor', kitap.A.test.some((s) => ['B', 'C', 'D'].some((g) => { const k = kitap[g].test.find((x) => x.id === s.id); return k && k.dogruHarf !== s.dogruHarf; })));
  ['A', 'B', 'C', 'D'].forEach((g) => {
    const anahtar = kitap[g].cevapAnahtari.test;
    kontrol(`2) ${g} kitapçığı: doğru şıklar A–E arasında eşit (her harf 2)`, dengeliMi(anahtar), JSON.stringify(harfSay(anahtar)));
    kontrol(`2) ${g} kitapçığı: aynı doğru harf art arda en çok 2 kez`, enUzunSeri(anahtar) <= 2, anahtar.join(''));
  });
  // D/Y yığılma: havuzda D ve Y karışık olunca art arda ≤ 3
  const dyKarisik = secim.dy.map((s, i) => ({ ...s, dogruDY: i % 3 === 0 ? 'Y' : 'D' }));
  const dyKitap = C.uretKitapcikVaryasyonu([...dyKarisik, ...secim.test], 'B', 'KURAL-TEST-VIZE', true, 5);
  kontrol('2) D/Y: aynı cevap art arda en çok 3 kez', enUzunSeri(dyKitap.cevapAnahtari.dy) <= 3, dyKitap.cevapAnahtari.dy.join(''));
  // Şık metni ile doğru cevap kaymaz
  const kaymaYok = ['A', 'B', 'C', 'D'].every((g) => kitap[g].test.every((s) => String(s.siklar['ABCDE'.indexOf(s.dogruHarf)]).startsWith('doğru')));
  kontrol('2) Şıklar karışsa da doğru cevap metni doğru harfte (kayma yok)', kaymaYok);

  // 4) Online
  const OGR = Array.from({ length: 30 }, (_, i) => `24741${String(9000 + i)}`);
  const online = OGR.map((no) => C.uretKisiyeOzelOnlineSinav(HAVUZ, 10, 10, no, 'ONLINE-VIZE', { seciliHaftalar: HAFTALAR }));
  const okume = (o) => o.map((s) => s.id).sort().join('|');
  kontrol('4) Online: 30 öğrencinin HEPSİNE aynı sorular', online.every((o) => okume(o) === okume(online[0])) && online[0].length === 20, String(online[0].length));
  kontrol('4) Online: soru sırası öğrenciden öğrenciye farklı (≥ 28/30 farklı dizilim)', new Set(online.map((o) => o.map((s) => s.id).join())).size >= 28);
  kontrol('4) Online: sorular seçilen haftalardan', online[0].every((s) => HAFTALAR.includes(Number(s.hafta))));
  kontrol('4) Online: her ÖÇ\'den soru var', new Set(online[0].map((s) => s.ocKodu)).size === 5);
  kontrol('4) Online: her öğrencide doğru şıklar A–E eşit dağılmış', online.every((o) => dengeliMi(o.filter((s) => s.tur === 'test').map((s) => s.dogruHarf))));
  kontrol('4) Online: aynı sorunun şık yeri öğrenciler arasında değişiyor', (() => { const id = online[0].find((s) => s.tur === 'test').id; return new Set(online.map((o) => o.find((s) => s.id === id).dogruHarf)).size >= 3; })());
  kontrol('4) Online: doğru cevap metni doğru harfte (kayma yok)', online.every((o) => o.filter((s) => s.tur === 'test').every((s) => String(s.siklar['ABCDE'.indexOf(s.dogruHarf)]).startsWith('doğru'))));
  // 5) K3 + Ö6: basım öncesi kural uyarıları
  const T = C.bulTahminEdilebilirDizi;
  kontrol('5) Tahmin edilebilir dizi: art arda aynı şık (AAAA) yakalanır', /art arda 4/.test(T('BAAAAC', 'test')), T('BAAAAC', 'test'));
  kontrol('5) Tahmin edilebilir dizi: ABCDE tekrarı yakalanır', /ABCDE kalıbı/.test(T('ABCDEABCDE', 'test')), T('ABCDEABCDE', 'test'));
  kontrol('5) Tahmin edilebilir dizi: AABB tekrarı yakalanır', /AABB kalıbı/.test(T('AABBAABBA', 'test')), T('AABBAABBA', 'test'));
  kontrol('5) Tahmin edilebilir dizi: tek şık baskın (6/10 "C") yakalanır', /6\/10/.test(T('CACCBCDCEC', 'test')), T('CACCBCDCEC', 'test'));
  kontrol('5) Tahmin edilebilir dizi: D/Y dönüşümlü (DYDYDY) yakalanır', /DY kalıbı/.test(T('DYDYDYDY', 'dy')), T('DYDYDYDY', 'dy'));
  kontrol('5) Dengeli üretilmiş diziler neredeyse hiç uyarı vermez (200 denemede ≤ 10)', (() => { let n = 0; for (let i = 0; i < 200; i++) { if (T(C.uretDengeliHarfDizisi(10, 5, `S-${i}`), 'test')) n++; } return n <= 10; })());
  kontrol('5) Karışık gerçekçi dizi uyarı vermez', T('BDAECADBEC', 'test') === '' && T('DYYDYDDYDY', 'dy') === '', `${T('BDAECADBEC', 'test')}|${T('DYYDYDDYDY', 'dy')}`);
  const ku = C.hesaplaBaskiOncesiKuralUyarilari({
    havuz: [{ tur: 'test', hafta: 1, ocKodu: 'ÖÇ-1' }, { tur: 'test', hafta: 2, ocKodu: 'ÖÇ-2' }, { tur: 'dy', hafta: 1, ocKodu: 'ÖÇ-1' }],
    seciliHaftalar: [1, 2, 3], ihtiyac: { dy: 2, test: 2, klasik: 0 },
    ocler: [{ kod: 'ÖÇ-1' }, { kod: 'ÖÇ-2' }, { kod: 'ÖÇ-3' }],
    cevapAnahtarlari: { A: { test: ['A', 'A', 'A', 'A', 'B'], dy: ['D', 'Y', 'D', 'Y', 'Y'] } }
  });
  kontrol('5) K3: havuzda sorusu olmayan ÖÇ bulunur', ku.sorusuzOcler.join() === 'ÖÇ-3', JSON.stringify(ku.sorusuzOcler));
  kontrol('5) K3: sorusu olmayan seçili hafta bulunur', ku.bosHaftalar.join() === '3', JSON.stringify(ku.bosHaftalar));
  kontrol('5) K3: seçili haftalarda yetersiz soru türü bulunur (D/Y 2 gerekli, 1 var)', ku.yetersizTurler.length === 1 && ku.yetersizTurler[0].tur === 'dy' && ku.yetersizTurler[0].var === 1, JSON.stringify(ku.yetersizTurler));
  kontrol('5) Ö6: A kitapçığı test dizisi tahmin edilebilir bulunur', ku.tahminEdilebilir.length === 1 && ku.tahminEdilebilir[0].grup === 'A' && ku.tahminEdilebilir[0].bolum === 'test', JSON.stringify(ku.tahminEdilebilir));
  // 6) Ö8: kopya raporunda herkesin yaptığı yanlışlar ayrı listelenir ve şüpheye sayılmaz
  {
    const det = (s, a) => s.split('').map((v, i) => ({ verilen: v, sonuc: v === a[i] ? 'DOGRU' : 'YANLIS' }));
    const ANA = 'ABCDEABCDE';
    const sinif = [];
    for (let i = 0; i < 6; i++) sinif.push({ ogrNo: `S${i}`, adSoyad: `Öğr ${i}`, grup: 'A', testDetay: det(`${'E'}BCDEABCD${i % 2 ? 'A' : 'E'}`, ANA), dyDetay: [] });
    sinif.push({ ogrNo: 'K1', adSoyad: 'Kopya Bir', grup: 'A', testDetay: det('EDDDDABCDE', ANA), dyDetay: [] });
    sinif.push({ ogrNo: 'K2', adSoyad: 'Kopya İki', grup: 'A', testDetay: det('EDDDDABCDE', ANA), dyDetay: [] });
    const ciftler = C.tespitEtKopyaBenzerlikCiftleri(sinif);
    const k = ciftler.find((c) => [c.ogrenci1No, c.ogrenci2No].sort().join() === 'K1,K2');
    kontrol('6) Ö8: nadir ortak yanlışlar şüpheye sayılır, herkesin yaptığı (T1=E) ayrı listelenir ve sayılmaz',
      k && k.ortakYanlisSayisi === 3 && (k.populerOrtakYanlisMaddeler || []).join() === 'T1(E)' && !k.ortakYanlisMaddeler.includes('T1(E)'), JSON.stringify(k));
  }
} catch (e) {
  hata++;
  console.log('  ✗ HATA beklenmeyen:', e.stack || e.message);
}
console.log(`\n=== ${gecen} KONTROL GEÇTİ · ${hata} HATA ===`);
process.exit(hata ? 1 : 0);
