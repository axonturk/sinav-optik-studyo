/* ==========================================================================
   MOBİL PWA VERİ KORUMA TESTİ (Chrome + puppeteer-core)
   Gerçek öğretmen akışı: liste QR -> kurulum QR -> kağıt okuma -> eşleştirme -> kağıt QR.
   Korunan kurallar:
   1) Son 2 hanesi aynı iki öğrencinin kağıdı öğretmen seçene kadar hiçbir öğrenciye yazılmaz, kimsenin notu silinmez.
   2) Aynı öğrenciye farklı ikinci kağıt eski notu silmez; "hangisi geçerli" kararı bekler.
   3) Ayrı okutulan kağıt QR'ı daha önce okunmuş hiçbir kayda uygulanmaz.
   4) Yalnız liste QR'ı ile açılan (kurulum QR'ı okutulmamış) derste kağıt puanlanmaz.
   5) Numarası boş (??) kağıda öğretmen öğrenci seçince listede "okundu" görünür, "eşleşme bekliyor" kalkar.
   Çalıştırma: node pwa-veri-koruma-test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { baslatSunucu } = require('./server.js');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  .find((p) => fs.existsSync(p));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let gecen = 0;
let hata = 0;
function kontrol(ad, kosul, detay = '') {
  if (kosul) gecen++; else hata++;
  console.log(`  ${kosul ? '✓' : '✗ HATA'} ${ad}${detay && (!kosul || process.env.AYRINTI) ? ` — ${detay}` : ''}`);
}

const LISTE = [
  { ogrNo: '2023104011', adSoyad: 'Ali Yılmaz' },
  { ogrNo: '2023105011', adSoyad: 'Ayşe Kaya' },
  { ogrNo: '2023104022', adSoyad: 'Mehmet Demir' },
  { ogrNo: '2023104033', adSoyad: 'Zeynep Ak' },
  { ogrNo: '2023104044', adSoyad: 'Can Öz' },
  { ogrNo: '2023104077', adSoyad: 'Kerem Ak' },
  { ogrNo: '2023105077', adSoyad: 'Leyla Su' }
];
const YAPI = {
  dersId: 'BIL101', dersAd: 'BIL101 - Ağ Temelleri', sinavKodu: 'BIL101-VIZE',
  dySayisi: 5, testSayisi: 5, klasikSayisi: 0, sikSayisi: 5, kimlikModu: 'son2', haneSayisi: 2,
  dyToplamPuan: 40, testToplamPuan: 60, klasikToplamPuan: 0,
  sinavGizliAnahtar: 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
  cevapAnahtarlari: { A: { dy: ['D', 'Y', 'D', 'Y', 'D'], test: ['A', 'B', 'C', 'D', 'E'], klasik: [] } }
};

(async () => {
  console.log('=== MOBİL PWA VERİ KORUMA TESTİ ===');
  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const sayfa = await tarayici.newPage();
  await sayfa.setViewport({ width: 390, height: 844 });
  const hatalar = [];
  sayfa.on('pageerror', (e) => hatalar.push(e.message));
  sayfa.on('dialog', async (d) => { hatalar.push('dialog: ' + d.message()); await d.dismiss(); });

  const okumalar = () => sayfa.evaluate(() => window.__mobilDurumOku().okumaSonuclari.map((s) => ({
    id: s.id, ogrNo: s.ogrNo, ad: s.adSoyad, puan: s.toplamPuan, bekliyor: Boolean(s.kimlikEslesmeBekliyor), muk: s.mukerrerEskiId || ''
  })));
  // Uygulamanın kendi optik formunu çizip "Fotoğraf Seç" ile okut
  const girdiYolu = require('path').resolve('test-artifacts', 'pwa-veri-koruma.png');
  fs.mkdirSync(require('path').dirname(girdiYolu), { recursive: true });
  const kagitOkut = async (noKod, testCevap) => {
    const url = await sayfa.evaluate((no, tc) => {
      const C = window.SinavOptikCekirdek;
      const d = window.__mobilDurumOku();
      const cv = document.createElement('canvas');
      C.cizSentetikOptikFormCanvas(cv, d.sinavYapisi, { grup: 'A', ogrNoKod: no, dyCevaplar: ['D', 'Y', 'D', 'Y', 'D'], testCevaplar: tc, klasikPuanlar: [] });
      return cv.toDataURL('image/png');
    }, noKod, testCevap);
    fs.writeFileSync(girdiYolu, Buffer.from(url.split(',')[1], 'base64'));
    await (await sayfa.$('#input-mobil-foto')).uploadFile(girdiYolu);
    await bekle(1500);
  };

  try {
    await sayfa.goto(`${taban}/optik-mobil.html`, { waitUntil: 'networkidle0' });

    // 4) Yalnız liste QR'ı: kurulum yok -> kağıt puanlanmaz
    const ogr = await sayfa.evaluate((l) => window.SinavOptikCekirdek.uretOgrenciQrPaketi(l, { tabanAdres: location.origin, dersId: 'BIL101', dersKod: 'BIL101', dersAd: 'BIL101 — Ağ Temelleri' }), LISTE);
    await sayfa.goto(ogr.tekUrl, { waitUntil: 'networkidle0' });
    await bekle(600);
    await kagitOkut('22', ['A', 'B', 'C', 'D', 'E']);
    const kurulumsuz = await okumalar();
    const uyari = await sayfa.$eval('#m-uyari', (e) => e.textContent);
    kontrol('Kurulum QR\'ı okutulmamış derste kağıt puanlanmaz ve uyarı verilir', kurulumsuz.length === 0 && /cevap anahtarı yok/.test(uyari), `${kurulumsuz.length} kayıt · ${uyari}`);

    // Kurulum QR'ı
    const setupUrl = await sayfa.evaluate((y, l) => window.SinavOptikCekirdek.uretKompaktSetupQrPaketi(y, l, location.origin).url, YAPI, LISTE);
    await sayfa.goto(setupUrl, { waitUntil: 'networkidle0' });
    await bekle(700);

    // 1) Çakışan son 2 hane
    await kagitOkut('11', ['A', 'B', 'C', 'D', 'E']); // Ali'nin kağıdı (100)
    await kagitOkut('11', ['A', 'A', 'A', 'A', 'A']); // Ayşe'nin kağıdı (farklı cevaplar)
    let r = await okumalar();
    kontrol('Son 2 hanesi aynı iki kağıt iki ayrı kayıt olarak durur (biri diğerinin üzerine yazmaz)', r.length === 2, JSON.stringify(r));
    kontrol('Çakışan kağıtlar öğretmen seçene kadar hiçbir öğrenciye yazılmaz', r.every((k) => k.bekliyor && String(k.ogrNo).startsWith('BEKLEYEN')), JSON.stringify(r));
    const ilk = r[r.length - 1];
    const ikinci = r[0];
    // Öğretmen seçimi: eşleştirme penceresi üzerinden
    const ata = async (id, no) => {
      await sayfa.evaluate((i) => document.querySelector(`[data-tablo-eslestir="${i}"]`) ? document.querySelector(`[data-tablo-eslestir="${i}"]`).click() : null, id);
      await bekle(250);
      const varMi = await sayfa.evaluate((n) => Boolean(document.querySelector(`[data-eslestir-sec-no="${n}"]`)), no);
      if (varMi) await sayfa.evaluate((n) => document.querySelector(`[data-eslestir-sec-no="${n}"]`).click(), no);
      await bekle(400);
      return varMi;
    };
    const a1 = await ata(ilk.id, '2023104011');
    const a2 = await ata(ikinci.id, '2023105011');
    r = await okumalar();
    const ali = r.find((k) => k.ogrNo === '2023104011');
    const ayse = r.find((k) => k.ogrNo === '2023105011');
    kontrol('Öğretmen seçince her kağıt doğru öğrenciye yerleşir (Ali 100, Ayşe ayrı not)', a1 && a2 && ali && ayse && ali.puan === 100 && ayse.puan !== 100 && r.length === 2, JSON.stringify(r));

    // 2) Aynı öğrenciye farklı ikinci kağıt
    await kagitOkut('22', ['A', 'B', 'C', 'D', 'E']); // Mehmet 100
    await kagitOkut('22', ['E', 'E', 'E', 'E', 'E']); // Mehmet'e ikinci, farklı kağıt
    r = await okumalar();
    const mehmetYerlesik = r.filter((k) => k.ogrNo === '2023104022');
    const mukerrer = r.find((k) => k.muk);
    kontrol('Aynı öğrenciye farklı ikinci kağıt eski notu silmez (Mehmet 100 korunur)', mehmetYerlesik.length === 1 && mehmetYerlesik[0].puan === 100, JSON.stringify(r));
    kontrol('İkinci kağıt "hangisi geçerli" kararı bekler', Boolean(mukerrer && mukerrer.bekliyor), JSON.stringify(mukerrer));
    const kararVar = await sayfa.evaluate((id) => {
      const b = document.querySelector(`[data-m-mukerrer-karar="eski"][data-m-mukerrer-id="${id}"]`);
      if (!b) return false;
      b.click();
      return true;
    }, mukerrer ? mukerrer.id : '');
    await bekle(300);
    r = await okumalar();
    kontrol('"Eskisi kalsın" kararı ikinci kağıdı kaldırır, eski not kalır', !r.some((k) => k.muk) && r.filter((k) => k.ogrNo === '2023104022').length === 1, `karar düğmesi ${kararVar} · ${JSON.stringify(r)}`);

    await kagitOkut('22', ['A', 'B', 'C', 'D', 'E']); // aynı kağıt tekrar
    const r2 = await okumalar();
    kontrol('Birebir aynı kağıdın tekrar okutulması yeni kayıt açmaz', r2.length === r.length, `${r.length} -> ${r2.length}`);

    // 3) Ayrı okutulan kağıt QR'ı eski kayda uygulanmaz
    const once = JSON.stringify(await okumalar());
    const oqv2 = await sayfa.evaluate((y) => window.SinavOptikCekirdek.uretSifreliOptikKagitQrPaketi({
      sinavKodu: y.sinavKodu, grup: 'A', ogrNo: '2023104033', dyAnahtar: ['Y', 'Y', 'Y', 'Y', 'Y'], testAnahtar: ['A', 'A', 'A', 'A', 'A'], dySayisi: 5, testSayisi: 5, klasikSayisi: 0
    }, y.sinavGizliAnahtar), YAPI);
    await sayfa.evaluate((q) => { document.getElementById('girdi-pwa-qr-metin').value = q; document.getElementById('btn-pwa-qr-metin-yukle').click(); }, oqv2);
    await bekle(500);
    kontrol('Ayrı okutulan kağıt QR\'ı daha önce okunmuş hiçbir kaydı değiştirmez', JSON.stringify(await okumalar()) === once);
    await kagitOkut('33', ['A', 'A', 'A', 'A', 'A']);
    r = await okumalar();
    const zeynep = r.find((k) => k.ogrNo === '2023104033');
    kontrol('Bekleyen kağıt QR\'ı sıradaki kağıda (Zeynep) uygulanır', Boolean(zeynep), JSON.stringify(r));

    // 5) Numarası hiç kodlanmamış kağıt: öğretmen seçince "bekliyor"dan çıkar ve sınıf listesinde okundu görünür
    await kagitOkut('XX', ['A', 'B', 'C', 'D', 'E']); // 'XX' = numara balonları boş
    const bosNolu = await sayfa.evaluate(() => {
      const d = window.__mobilDurumOku();
      const k = d.okumaSonuclari.find((s) => String(s.okunanNoKod || '').includes('?'));
      return k ? { id: k.id, kod: k.okunanNoKod } : null;
    });
    const bekleyenOnce = await sayfa.$eval('#mobil-sinif-istatistik-ozet', (e) => e.textContent);
    kontrol('Numarası boş kağıt "eşleşme bekliyor" olarak gelir', Boolean(bosNolu) && /Eşleşme Bekliyor/.test(bekleyenOnce), `${JSON.stringify(bosNolu)} · ${bekleyenOnce.replace(/\s+/g, ' ')}`);
    const canAtandi = await ata(bosNolu ? bosNolu.id : '', '2023104044');
    const sonra = await sayfa.evaluate(() => {
      const satir = Array.from(document.querySelectorAll('#mobil-tablo-okunanlar tr')).find((tr) => /Can Öz/.test(tr.textContent));
      const yoklama = Array.from(document.querySelectorAll('#mobil-tablo-sinif-yoklama tr')).find((tr) => /2023104044/.test(tr.textContent));
      return {
        ozet: document.getElementById('mobil-sinif-istatistik-ozet').textContent.replace(/\s+/g, ' '),
        satir: satir ? satir.textContent.replace(/\s+/g, ' ') : '',
        yoklama: yoklama ? yoklama.textContent.replace(/\s+/g, ' ') : '',
        rozet: (document.getElementById('mobil-bekleyen-rozet') || {}).hidden
      };
    });
    kontrol('Öğretmen seçince kağıt öğrenciye yerleşir: uyarı ve "Seç" düğmesi kalkar, numara görünür', canAtandi && /2023104044/.test(sonra.satir) && !/⚠️/.test(sonra.satir) && !/Seç/.test(sonra.satir), sonra.satir);
    kontrol('"Eşleşme Bekliyor" rozeti kalkar', !/Eşleşme Bekliyor/.test(sonra.ozet) && sonra.rozet === true, sonra.ozet);
    kontrol('Sınıf listesinde öğrenci "Okundu" görünür', /Okundu/.test(sonra.yoklama), sonra.yoklama);

    // 6) Liste ekranındayken "Oku": görünmeyen kameradan kare çekmez, önce kamerayı açar
    const okumaSayisiOnce = (await okumalar()).length;
    await sayfa.evaluate(() => document.querySelector('.mobil-sekme-btn[data-msekme="m-panel-liste"]').click());
    await bekle(200);
    await sayfa.evaluate(() => document.getElementById('btn-mobil-kare-oku').click());
    await bekle(500);
    const okuSonra = await sayfa.evaluate(() => ({ sekme: document.body.getAttribute('data-aktif-msekme'), uyari: document.getElementById('m-uyari').textContent }));
    kontrol('Liste ekranında "Oku" önce kamerayı açar, görmeden okuma yapmaz', okuSonra.sekme === 'm-panel-tara' && /Kamera açıldı/.test(okuSonra.uyari) && (await okumalar()).length === okumaSayisiOnce, JSON.stringify(okuSonra));

    // A2) Son haneleri aynı iki öğrenciden biri seçilince, ikinci kağıtta o öğrenci elenir ve kağıt kalan tek adaya gider
    await kagitOkut('77', ['A', 'B', 'C', 'D', 'E']); // Kerem'in kağıdı
    let r77 = await okumalar();
    const kerem1 = r77.find((k) => k.bekliyor && /BEKLEYEN-77/.test(k.ogrNo));
    kontrol('A2) İlk "77" kağıdı iki aday olduğu için seçim bekler', Boolean(kerem1), JSON.stringify(r77.slice(0, 3)));
    await ata(kerem1 ? kerem1.id : '', '2023104077');
    await kagitOkut('77', ['B', 'B', 'B', 'B', 'B']); // Leyla'nın kağıdı (farklı cevaplar)
    r77 = await okumalar();
    const leyla = r77.find((k) => k.ogrNo === '2023105077');
    kontrol('A2) İkinci "77" kağıdı seçilmiş öğrenci elendiği için kendiliğinden kalan adaya (Leyla) gider', Boolean(leyla) && !leyla.bekliyor && r77.filter((k) => k.ogrNo === '2023104077').length === 1, JSON.stringify(r77.filter((k) => /77/.test(k.ogrNo))));
    const say77 = r77.length;
    await kagitOkut('77', ['A', 'B', 'C', 'D', 'E']); // Kerem'in kağıdı yeniden okutuldu
    r77 = await okumalar();
    kontrol('A2) Aynı kağıt yeniden okutulursa yine kendi öğrencisine gider, yeni kayıt açılmaz', r77.length === say77 && r77.filter((k) => k.ogrNo === '2023104077').length === 1, `${say77} -> ${r77.length}`);

    // A4) Soluk iz: "işaretli say" düğmesi cevabı sayar ve yeniden puanlar
    const solukHazir = await sayfa.evaluate(() => {
      const d = window.__mobilDurumOku();
      const k = d.okumaSonuclari.find((x) => x.ogrNo === '2023105077');
      if (!k) return null;
      k.testDetay[0].verilen = ''; k.testDetay[0].sonuc = 'BOS';
      k.incelemeKuyrugu = [{ alan: 'Test Soru 1', detay: 'Soluk iz (A) — boş sayıldı, kağıdı kontrol edin' }];
      return { id: k.id, puan: k.toplamPuan };
    });
    await sayfa.evaluate(() => { document.querySelector('.mobil-sekme-btn[data-msekme="m-panel-liste"]').click(); window.__mobilListeYenile(); });
    await bekle(300);
    const solukDugme = await sayfa.evaluate((id) => Boolean(document.querySelector(`[data-soluk-say="${id}"]`)), solukHazir ? solukHazir.id : '');
    if (solukDugme) await sayfa.evaluate((id) => document.querySelector(`[data-soluk-say="${id}"]`).click(), solukHazir.id);
    await bekle(400);
    const solukSonra = await sayfa.evaluate((id) => { const k = window.__mobilDurumOku().okumaSonuclari.find((x) => x.id === id); return k ? { v: k.testDetay[0].verilen, puan: k.toplamPuan, ik: (k.incelemeKuyrugu || []).length } : null; }, solukHazir ? solukHazir.id : '');
    kontrol('A4) Listede "soluk" düğmesi çıkar; basınca iz cevap sayılır, kontrol kalkar ve puan yeniden hesaplanır', solukDugme && solukSonra && solukSonra.v === 'A' && solukSonra.ik === 0 && solukSonra.puan > solukHazir.puan, JSON.stringify({ solukDugme, solukHazir, solukSonra }));

    // A5) Telefonda silinen okuma sunucuya "silindi" olayı olarak kuyruğa girer
    const silOlay = await sayfa.evaluate((id) => {
      const once = JSON.parse(localStorage.getItem('MOBIL_V2_OUTBOX_V2') || '[]').length;
      const b = document.querySelector(`[data-tablo-sil="${id}"]`); if (b) b.click();
      const kuyruk = JSON.parse(localStorage.getItem('MOBIL_V2_OUTBOX_V2') || '[]');
      return { once, son: kuyruk.length, tur: (kuyruk[kuyruk.length - 1] || {}).tur, veriId: ((kuyruk[kuyruk.length - 1] || {}).veri || {}).id };
    }, solukHazir ? solukHazir.id : '');
    kontrol('A5) Telefonda silinen okuma bilgisayara gitmek üzere OKUDU_SIL olayı olarak kuyruğa girer', silOlay.tur === 'OKUDU_SIL' && silOlay.veriId === (solukHazir && solukHazir.id), JSON.stringify(silOlay));

    // A1) Öğrenci numaralı kağıt "kağıttan anahtar" ile okunursa onay sorulur; hayır denirse anahtar değişmez
    const anahtarOnce = await sayfa.evaluate(() => JSON.stringify(window.__mobilDurumOku().sinavYapisi.cevapAnahtarlari.A));
    await sayfa.evaluate(() => { window.__sonConfirm = ''; window.__eskiConfirm2 = window.confirm; window.confirm = (m) => { window.__sonConfirm = m; return false; }; });
    {
      const url = await sayfa.evaluate(() => {
        const C = window.SinavOptikCekirdek; const d = window.__mobilDurumOku(); const cv = document.createElement('canvas');
        C.cizSentetikOptikFormCanvas(cv, d.sinavYapisi, { grup: 'A', ogrNoKod: '22', dyCevaplar: ['Y', 'Y', 'Y', 'Y', 'Y'], testCevaplar: ['E', 'E', 'E', 'E', 'E'], klasikPuanlar: [] });
        return cv.toDataURL('image/png');
      });
      fs.writeFileSync(girdiYolu, Buffer.from(url.split(',')[1], 'base64'));
      await (await sayfa.$('#input-mobil-master-foto')).uploadFile(girdiYolu);
      await bekle(1500);
    }
    const anahtarOnay = await sayfa.evaluate(() => ({ m: window.__sonConfirm, a: JSON.stringify(window.__mobilDurumOku().sinavYapisi.cevapAnahtarlari.A) }));
    await sayfa.evaluate(() => { window.confirm = window.__eskiConfirm2; });
    kontrol('A1) Kağıttan anahtar okunurken öğrenci numarası/anahtar değişimi için onay sorulur; "hayır" ile anahtar aynı kalır', /CEVAP ANAHTARI/.test(anahtarOnay.m) && /öğrenci numarası/.test(anahtarOnay.m) && /DEĞİŞECEK/.test(anahtarOnay.m) && anahtarOnay.a === anahtarOnce, `${anahtarOnay.m} · ${anahtarOnay.a === anahtarOnce}`);

    // 7) Ders bağlantısız kurulum QR'ı başka dersin listesini taşımaz; ders kodu eşleşen dersin listesine geçer
    const LISTE3 = [{ ogrNo: '2024300001', adSoyad: 'Deniz Su' }, { ogrNo: '2024300002', adSoyad: 'Ece Gül' }];
    const ogr3 = await sayfa.evaluate((l) => window.SinavOptikCekirdek.uretOgrenciQrPaketi(l, { tabanAdres: location.origin, dersId: 'BIL303', dersKod: 'BIL303', dersAd: 'BIL303 — Veri Yapıları' }), LISTE3);
    await sayfa.goto(ogr3.tekUrl, { waitUntil: 'networkidle0' });
    await bekle(600);
    await sayfa.goto(setupUrl, { waitUntil: 'networkidle0' }); // BIL101'e geri dön (dersId'li QR)
    await bekle(700);
    const bagsizUrl = (dersAd) => sayfa.evaluate((y, ad) => {
      const k = Object.assign({}, y, { dersId: '', dersAd: ad, sinavKodu: ad.split(' ')[0] + '-VIZE' });
      delete k.dersId;
      return window.SinavOptikCekirdek.uretKompaktSetupQrPaketi(k, [], location.origin).url;
    }, YAPI, dersAd);
    await sayfa.goto(await bagsizUrl('BIL303 - Veri Yapıları'), { waitUntil: 'networkidle0' });
    await bekle(700);
    const d303 = await sayfa.evaluate(() => { const d = window.__mobilDurumOku(); return { id: d.dersId, ogr: d.ogrenciler.map((o) => o.ogrNo) }; });
    kontrol('Ders bağlantısız QR: ders kodu eşleşen dersin (BIL303) listesine geçer', d303.ogr.length === 2 && d303.ogr.includes('2024300001'), JSON.stringify(d303));
    await sayfa.goto(await bagsizUrl('BIL999 - Bilinmeyen Ders'), { waitUntil: 'networkidle0' });
    await bekle(700);
    const d999 = await sayfa.evaluate(() => { const d = window.__mobilDurumOku(); return { id: d.dersId, ogr: d.ogrenciler.length, p101: ((d.dersPaketleriHaritasi || {}).BIL101 || {}).ogrenciler }; });
    await sayfa.goto(await bagsizUrl('BIL777 - Veri Yapıları'), { waitUntil: 'networkidle0' });
    await bekle(700);
    const dAd = await sayfa.evaluate(() => { const d = window.__mobilDurumOku(); return { id: d.dersId, ogr: d.ogrenciler.map((o) => o.ogrNo) }; });
    kontrol('A3) Ders kodu farklı ama ders ADI aynıysa doğru dersin listesine geçer', dAd.id === 'BIL303' && dAd.ogr.includes('2024300001'), JSON.stringify(dAd));
    await sayfa.goto(await bagsizUrl('BIL999 - Bilinmeyen Ders'), { waitUntil: 'networkidle0' });
    await bekle(700);
    kontrol('Eşleşen ders yoksa başka dersin listesi taşınmaz; önceki dersin listesi korunur', d999.ogr === 0 && Array.isArray(d999.p101) && d999.p101.length === LISTE.length, JSON.stringify({ ...d999, p101: (d999.p101 || []).length }));

    kontrol('JS hatası / uyarı penceresi yok', hatalar.length === 0, hatalar.join(' | '));
  } finally {
    try { fs.unlinkSync(girdiYolu); } catch (_) {}
    await tarayici.close();
    server.close();
  }
  console.log(`\n=== ${gecen} KONTROL GEÇTİ · ${hata} HATA ===`);
  process.exit(hata === 0 ? 0 : 1);
})().catch((e) => { console.error('TEST HATASI:', e); process.exit(1); });
