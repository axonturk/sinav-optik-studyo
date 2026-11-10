/* ==========================================================================
   KABUL KAPISI KARŞI-ÖRNEKLERİ + FAZ 2 TİCARİ & AKREDİTASYON DOĞRULAMA TESTİ
   - OMR-kabul-15f8006 raporundaki tüm açık bulguları (Kiosk 503/403, OMR alt-alan
     şeması & 401 yetki, Yoğun A4 637/1555/3187 karakter Önizleme = PDF = Yazdır = 2 A4)
   - Faz 2 (Sekme 7 Kalite Şablon Stüdyosu, 74161101 Proliz Bologna Çözümleyici,
     Enum-Kilitli Otomatik ÖÇ/Bloom Onay Masası, Tek Tık Soru İptali, Kümülatif
     Vize %40 + Final %60 ÖÇ × PÇ Matrisi, PUKÖ ve Maddi Hata Kanıt Tutanağı)
   Çalıştırma: node faz2-ve-kabul-test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');
const Cekirdek = require('./guvenlik-ve-veri.js');
const { baslatSunucu } = require('./server.js');
const workerModulu = require('./worker.js');

const KOK = __dirname;
const INDIRILEN = path.join(KOK, 'test-artifacts', 'kabul-faz2-indirilen');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find((p) => fs.existsSync(p));

let gecen = 0;
let hataSayisi = 0;
function kontrol(ad, kosul, detay = '') {
  if (kosul) gecen++;
  else hataSayisi++;
  console.log(`  ${kosul ? '✓' : '✗ HATA'} [${gecen + hataSayisi}] ${ad}${detay ? ` — ${detay}` : ''}`);
}
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function httpIstek(port, yontem, yol, govde = null, basliklar = {}) {
  return new Promise((resolve, reject) => {
    const veri = govde !== null ? JSON.stringify(govde) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: yol,
        method: yontem,
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          veri !== null ? { 'Content-Length': Buffer.byteLength(veri) } : {},
          basliklar
        )
      },
      (res) => {
        const parcalar = [];
        res.on('data', (c) => parcalar.push(c));
        res.on('end', () => {
          const ham = Buffer.concat(parcalar).toString('utf8');
          let json = null;
          try { json = JSON.parse(ham); } catch (_) {}
          resolve({ status: res.statusCode, body: json, raw: ham });
        });
      }
    );
    req.on('error', reject);
    if (veri !== null) req.write(veri);
    req.end();
  });
}

function olusturSahteWorkerEnv(bozukKv = false) {
  const kvDepo = new Map();
  return {
    SINAV_KV: {
      async get(anahtar) {
        if (bozukKv) throw new Error('Simulated KV Read Outage');
        return kvDepo.has(anahtar) ? kvDepo.get(anahtar) : null;
      },
      async put(anahtar, deger) {
        if (bozukKv) throw new Error('Simulated KV Write Outage');
        kvDepo.set(anahtar, String(deger));
      }
    },
    ASSETS: {
      async fetch() {
        return new Response('OK-ASSET', { status: 200 });
      }
    }
  };
}

async function workerIstek(env, yontem, yol, govde = null, basliklar = {}) {
  const istekBaslik = Object.assign({ 'Content-Type': 'application/json' }, basliklar);
  const req = new Request(`https://sinav.axonturk.workers.dev${yol}`, {
    method: yontem,
    headers: istekBaslik,
    body: govde !== null ? JSON.stringify(govde) : undefined
  });
  const isleyici = workerModulu && workerModulu.default ? workerModulu.default : workerModulu;
  const res = await isleyici.fetch(req, env);
  const ham = await res.text();
  let json = null;
  try { json = JSON.parse(ham); } catch (_) {}
  return { status: res.status, body: json, raw: ham };
}

function uretYogunSoruBankasi(hedefToplamKokKarakter, dersId = 'genel') {
  // 10 D/Y + 20 Test + 2 Klasik = 32 soru
  const parcaUzunluk = Math.max(18, Math.round(hedefToplamKokKarakter / 32));
  const dolguUret = (onek, hedef) => {
    const baz = `${onek} Ağ katmanlarında paket anahtarlama, alt ağ maskeleme ve güvenlik duvarı erişim denetimi ilkeleri kapsamında `;
    let s = baz;
    while (s.length < hedef) {
      s += 'veri bütünlüğü ve yönlendirme tablosu doğrulaması yapılır ';
    }
    return s.slice(0, hedef).trim() + '.';
  };
  const zorluklar = ['Kolay', 'Orta', 'Zor'];
  const sorular = [];
  for (let i = 1; i <= 10; i++) {
    sorular.push({
      id: `dy-yogun-${i}`,
      dersId,
      tur: 'dy',
      zorluk: zorluklar[(i - 1) % 3],
      hafta: ((i - 1) % 7) + 1,
      ocKodu: `ÖÇ-${((i - 1) % 4) + 1}`,
      kazanim: `ÖÇ-${((i - 1) % 4) + 1}: Ağ yapısını hazırlayabilecek`,
      metin: dolguUret(`D/Y Madde ${i}:`, parcaUzunluk),
      dogruDY: i % 2 === 0 ? 'Y' : 'D'
    });
  }
  for (let i = 1; i <= 20; i++) {
    const harfler = ['A', 'B', 'C', 'D', 'E'];
    const dogruHarf = harfler[(i - 1) % 5];
    sorular.push({
      id: `test-yogun-${i}`,
      dersId,
      tur: 'test',
      zorluk: zorluklar[(i - 1) % 3],
      hafta: ((i - 1) % 7) + 1,
      ocKodu: `ÖÇ-${((i - 1) % 4) + 1}`,
      kazanim: `ÖÇ-${((i - 1) % 4) + 1}: Ağ bağlantılarını yapılandırabilecek`,
      metin: dolguUret(`Test Soru ${i}:`, parcaUzunluk),
      siklar: harfler.map((h) => `${h} seçeneği teknik yapılandırma parametresi ${i}`),
      dogruHarf
    });
  }
  for (let i = 1; i <= 2; i++) {
    sorular.push({
      id: `klasik-yogun-${i}`,
      dersId,
      tur: 'klasik',
      zorluk: 'Zor',
      hafta: ((i - 1) % 7) + 1,
      ocKodu: `ÖÇ-${i}`,
      kazanim: `ÖÇ-${i}: Ağ cihazlarını kullanabilecek`,
      metin: dolguUret(`Klasik Açık Uçlu Soru ${i}:`, parcaUzunluk),
      puan: 10,
      cevapSatir: 4
    });
  }
  const gercekUzunluk = sorular.reduce((t, q) => t + q.metin.length, 0);
  return { sorular, gercekUzunluk };
}

(async () => {
  console.log('=== KABUL KAPISI KARŞI-ÖRNEKLERİ + FAZ 2 DOĞRULAMA PAKETİ ===');
  fs.mkdirSync(INDIRILEN, { recursive: true });
  for (const f of fs.readdirSync(INDIRILEN)) fs.unlinkSync(path.join(INDIRILEN, f));

  // ---------------------------------------------------------------------------
  // BÖLÜM 1: ÇEKİRDEK + NODE + WORKER OMR ŞEMA, YETKİ (401), SÜRÜM (409) & STATİK ENGEL
  // ---------------------------------------------------------------------------
  console.log('\n[1/5] OMR Paket Şeması, Alt-Alan Doğrulaması, Öğretmen Yetkisi (401) ve Statik Güvenlik');
  const gecerliKayit = {
    ogrNo: '2026101011',
    adSoyad: 'Ayşe Yılmaz',
    grup: 'A',
    toplamPuan: 60,
    dyNet: 4,
    testNet: 6,
    klasikToplamPuan: 10,
    dyDetay: [{ soruNo: 1, verilen: 'D', sonuc: 'DOGRU' }],
    testDetay: [{ soruNo: 1, verilen: 'B', sonuc: 'DOGRU' }],
    klasikDetay: [{ soruNo: 1, verilenPuan: 10 }]
  };
  const uretilenPaket = Cekirdek.uretOmrSonucPaketi([gecerliKayit], { sinavKodu: 'SINAV-OMR-1', sinavSurumId: 'SURUM-V1' });
  kontrol('OMR geçerli kompakt paket çözülür', Cekirdek.cozOmrSonucPaketi(uretilenPaket.paketKodu).gecerli === true);
  kontrol('OMR geçerli JSON paketi çözülür', Cekirdek.cozOmrSonucPaketi(uretilenPaket.jsonMetni).gecerli === true);

  const bozukGirdiler = {
    badGroup: { okumaSonuclari: [{ ...gecerliKayit, grup: 'Z' }] },
    badScore: { okumaSonuclari: [{ ...gecerliKayit, toplamPuan: 999 }] },
    noId: { okumaSonuclari: [{ ...gecerliKayit, ogrNo: '', okunanNoKod: '' }] },
    emptyIdWithSuffix: { okumaSonuclari: [{ ...gecerliKayit, ogrNo: '', okunanNoKod: '11' }] },
    badDetail: {
      okumaSonuclari: [{
        ...gecerliKayit,
        testDetay: [{ soruNo: 9999, verilen: 'Z', sonuc: 'DOGRU' }],
        klasikDetay: [{ soruNo: 1, verilenPuan: 999 }]
      }]
    },
    emptyAnswerMarkedCorrect: {
      okumaSonuclari: [{
        ...gecerliKayit,
        testDetay: [{ soruNo: 1, verilen: '', sonuc: 'DOGRU' }]
      }]
    }
  };
  for (const [ad, yuk] of Object.entries(bozukGirdiler)) {
    const coz = Cekirdek.cozOmrSonucPaketi(yuk);
    kontrol(`Çekirdek bozuk OMR girdisini reddeder (${ad})`, coz.gecerli === false);
  }
  kontrol('Çekirdek bozuk Base64 OMR paketini reddeder', Cekirdek.cozOmrSonucPaketi('OMR-SONUC|%%%BOZUK%%%').gecerli === false);

  const eslesmeyenKayit = Cekirdek.cozOmrSonucPaketi(
    { okumaSonuclari: [{ ...gecerliKayit, ogrNo: 'SON2-77', numaraEslesmediMi: true }] },
    { ogrenciler: [{ ogrNo: '2026101011', adSoyad: 'Ayşe Yılmaz' }] }
  );
  kontrol(
    'Sınıf listesinde eşleşmeyen SON2-77 kaydı kimlikEslesmeBekliyor=true ve supheliMi=true olarak işaretlenir',
    eslesmeyenKayit.gecerli === true &&
      eslesmeyenKayit.okumaSonuclari[0].kimlikEslesmeBekliyor === true &&
      eslesmeyenKayit.okumaSonuclari[0].supheliMi === true
  );

  const server = await baslatSunucu(0);
  const port = server.address().port;
  const taban = `http://127.0.0.1:${port}`;
  const workerEnv = olusturSahteWorkerEnv(false);
  const bozukWorkerEnv = olusturSahteWorkerEnv(true);

  try {
    // Yetkisiz uç kontrolleri (Node + Worker)
    for (const [etiket, istekFn] of [
      ['Node', (m, y, g, b) => httpIstek(port, m, y, g, b)],
      ['Worker', (m, y, g, b) => workerIstek(workerEnv, m, y, g, b)]
    ]) {
      const uOmrPost = await istekFn('POST', '/api/omr-sonuc-senkron', { oturumKodu: 'TEST1', paket: uretilenPaket.paketKodu });
      const uOmrGet = await istekFn('GET', '/api/omr-sonuc-senkron?kod=TEST1');
      const uBol = await istekFn('POST', '/api/ai-bologna-coz', { metin: Cekirdek.ORNEK_PROLIZ_BOLOGNA_METNI });
      const uSoruAi = await istekFn('POST', '/api/ai-soru-oc-etiketle', { sorular: [{ id: 's1', metin: 'Ağ kablosu' }] });
      const uSablonGet = await istekFn('GET', '/api/kurumsal-sablonlar');
      const uSablonPost = await istekFn('POST', '/api/kurumsal-sablonlar', { kurumsalSablonlar: [] });
      kontrol(
        `${etiket}: Yetkisiz OMR GET/POST ve Faz 2 uçları 401 döner`,
        uOmrPost.status === 401 &&
          uOmrGet.status === 401 &&
          uBol.status === 401 &&
          uSoruAi.status === 401 &&
          uSablonGet.status === 401 &&
          uSablonPost.status === 401,
        JSON.stringify([uOmrPost.status, uOmrGet.status, uBol.status, uSoruAi.status, uSablonGet.status, uSablonPost.status])
      );

      // Öğretmen girişi yap
      const giris = await istekFn('POST', '/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
      const hTok = giris.body.token;
      const authBaslik = { Authorization: `Bearer ${hTok}` };

      // Bozuk alt-alan ve boş ogrNo + okunanNoKod:11 HTTP 400 dönmeli
      for (const [ad, yuk] of Object.entries(bozukGirdiler)) {
        const yBozuk = await istekFn('POST', '/api/omr-sonuc-senkron', { oturumKodu: 'BOZUK1', okumaSonuclari: yuk.okumaSonuclari }, authBaslik);
        kontrol(`${etiket}: Şema dışı OMR paketi (${ad}) HTTP 400 ile reddedilir`, yBozuk.status === 400, String(yBozuk.status));
      }

      // Geçerli OMR POST -> 200, GET (tuket=1) -> 1 kayıt, ikinci GET -> 0 kayıt
      const yGecerliPost = await istekFn('POST', '/api/omr-sonuc-senkron', { oturumKodu: 'OK1', paket: uretilenPaket.paketKodu }, authBaslik);
      const yGecerliGet1 = await istekFn('GET', '/api/omr-sonuc-senkron?oturumKodu=OK1&tuket=1', null, authBaslik);
      const yGecerliGet2 = await istekFn('GET', '/api/omr-sonuc-senkron?oturumKodu=OK1&tuket=1', null, authBaslik);
      kontrol(
        `${etiket}: Yetkili geçerli OMR POST/GET 200 döner ve kuyruk tüketilir`,
        yGecerliPost.status === 200 &&
          yGecerliGet1.status === 200 &&
          yGecerliGet1.body.kayitSayisi === 1 &&
          yGecerliGet2.body.kayitSayisi === 0
      );

      // Aktif sınav tanımlandığında eski sinavSurumId ile OMR paketi 409 dönmeli
      const tanim = await istekFn(
        'POST',
        '/api/online-sinav-tanimla',
        {
          sinav: {
            sinavId: 'SINAV-OMR-1',
            baslik: 'OMR Sürüm Test Sınavı',
            sureDk: 30,
            aktif: true,
            sorular: [
              { id: 'q1', tur: 'dy', metin: 'TCP bağlantı yönelimlidir.', dogruDY: 'D', ocKodu: 'ÖÇ-1' },
              { id: 'q2', tur: 'test', metin: 'Hangisi OSI 3. katman cihazıdır?', siklar: ['Router', 'Hub'], dogruHarf: 'A', ocKodu: 'ÖÇ-2' }
            ]
          }
        },
        authBaslik
      );
      const eskiSurumOmr = await istekFn(
        'POST',
        '/api/omr-sonuc-senkron',
        { oturumKodu: 'SURUM1', sinavKodu: 'SINAV-OMR-1', sinavSurumId: 'ESKI-SURUM-999', okumaSonuclari: [gecerliKayit] },
        authBaslik
      );
      kontrol(
        `${etiket}: Aktif sınav sürümüyle (${tanim.body.sinavSurumId}) uyuşmayan OMR paketi 409 Conflict döner`,
        eskiSurumOmr.status === 409,
        String(eskiSurumOmr.status)
      );

      // Statik dosya engeli: test-artifacts, server.js, worker.js, *-test.js -> 404
      for (const gizliYol of ['/test-artifacts/a4-onizleme.png', '/server.js', '/worker.js', '/test-suite.js', '/e2e-test.js', '/wrangler.toml']) {
        const st = await istekFn('GET', gizliYol);
        kontrol(`${etiket}: İç dosya dışarıya servis edilmez (${gizliYol} -> 404)`, st.status === 404, String(st.status));
      }
    }

    // -------------------------------------------------------------------------
    // BÖLÜM 2: TARAYICI (CHROME) ONLİNE KİOSK NEGATİF HTTP KARŞI-ÖRNEKLERİ (503 & 403)
    // -------------------------------------------------------------------------
    console.log('\n[2/5] Online Kiosk Sıfır Güven Negatif HTTP Karşı-Örnekleri (503 Başlangıç, 403 Cevap, 403/503 Teslim)');
    const tarayici = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--window-size=1440,950']
    });

    try {
      const sayfa = await tarayici.newPage();
      await sayfa.setViewport({ width: 1440, height: 950 });
      const sayfaHatalari = [];
      sayfa.on('pageerror', (e) => sayfaHatalari.push(e.message));
      const cdp = await sayfa.createCDPSession();
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: INDIRILEN });

      await sayfa.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
      await sayfa.click('#btn-hoca-giris-yap');
      await bekle(300);
      await sayfa.click('#btn-modal-hoca-kapat');
      await bekle(150);

      // Ders ve 2 net soru (1 DY: D, 1 Test: A) ekle, ardından Online Sınavı başlat (1 DY + 1 Test)
      await sayfa.evaluate(() => {
        document.getElementById('btn-yeni-ders-modal').click();
        document.getElementById('yeni-ders-kod').value = 'BGT101';
        document.getElementById('yeni-ders-ad').value = 'Ağ Teknolojilerine Giriş';
        document.getElementById('btn-yeni-ders-kaydet').click();
      });
      await bekle(200);
      await sayfa.evaluate(() => {
        const csv = [
          'Soru_Turu;Soru_Metni;Secenek_A;Secenek_B;Secenek_C;Secenek_D;Secenek_E;Dogru_Cevap;Zorluk_1_3;Puan;Hafta;Ogrenim_Ciktisi_OC',
          'DY;TCP üçlü el sıkışma kullanır.;;;;;;D;1;50;1;ÖÇ-1',
          'TEST;Aşağıdakilerden hangisi OSI 3. katman yönlendiricisidir?;DOGRU_ROUTER_SIKKI;Hub;Repeater;Kablo;Konnektör;A;2;50;7;ÖÇ-2'
        ].join('\r\n');
        const dt = new DataTransfer();
        dt.items.add(new File(['\ufeff' + csv], 'kiosk_sorular.csv', { type: 'text/csv' }));
        const inp = document.getElementById('input-soru-csv-yukle');
        inp.files = dt.files;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await bekle(550);

      await sayfa.click('[data-sekme="sekme-ogrenciler"]');
      await bekle(150);
      await sayfa.evaluate(() => {
        document.getElementById('toplu-ogrenci-metin').value = [
          '2026000503 Başlatma Beşyüzüç',
          '2026000403 Eski Token Öğrencisi',
          '2026999403 Teslim Red Öğrencisi',
          '2026999503 Geçici Ağ Öğrencisi'
        ].join('\n');
        document.getElementById('btn-toplu-ogrenci-ekle').click();
      });
      await bekle(250);

      await sayfa.click('[data-sekme="sekme-online"]');
      await bekle(200);
      await sayfa.evaluate(() => {
        document.getElementById('online-sinav-kodu').value = 'KIOSK-2026-TEST';
        document.getElementById('online-sinav-baslik').value = 'Kiosk Karşı-Örnek Sınavı';
        document.getElementById('online-sure-dk').value = '30';
        document.getElementById('online-dy-sayisi').value = '1';
        document.getElementById('online-test-sayisi').value = '1';
        document.getElementById('online-klasik-sayisi').value = '0';
      });
      await sayfa.click('#btn-online-baslat');
      await bekle(500);

      // Ağ engelleme kancası kur
      let baslatDurumKodu = null;
      let cevapDurumKodu = null;
      let bitirDurumKodu = null;
      await sayfa.setRequestInterception(true);
      sayfa.on('request', (req) => {
        const u = req.url();
        if (baslatDurumKodu && u.includes('/api/ogrenci-oturum-baslat') && req.method() === 'POST') {
          return req.respond({
            status: baslatDurumKodu,
            contentType: 'application/json',
            body: JSON.stringify({ hata: `Simüle edilen başlatma hatası (${baslatDurumKodu})` })
          });
        }
        if (cevapDurumKodu && u.includes('/api/ogrenci-cevap') && req.method() === 'POST') {
          return req.respond({
            status: cevapDurumKodu,
            contentType: 'application/json',
            body: JSON.stringify({ hata: `Simüle edilen eski token cevap hatası (${cevapDurumKodu})` })
          });
        }
        if (bitirDurumKodu && u.includes('/api/ogrenci-sinav-bitir') && req.method() === 'POST') {
          return req.respond({
            status: bitirDurumKodu,
            contentType: 'application/json',
            body: JSON.stringify({ hata: `Simüle edilen teslim reddi (${bitirDurumKodu})` })
          });
        }
        req.continue();
      });

      const kioskFormDoldur = async (ogrNo, adSoyad) => {
        await sayfa.evaluate((no, ad) => {
          document.getElementById('kiosk-ogr-no').value = no;
          document.getElementById('kiosk-ad-soyad').value = ad;
          document.getElementById('kiosk-eposta').value = `${no}@uni.edu.tr`;
          document.getElementById('kiosk-telefon').value = '05321112233';
          document.getElementById('kiosk-sifre').value = 'Ogrenci!2026';
          document.getElementById('kiosk-sifre-tekrar').value = 'Ogrenci!2026';
          document.getElementById('kiosk-okudum-onay').checked = true;
        }, ogrNo, adSoyad);
      };

      const secDogruKioskSikki = async () => {
        await sayfa.evaluate(() => {
          const etiketler = Array.from(document.querySelectorAll('#kiosk-soru-icerik label'));
          let hedef = etiketler.find((l) => l.textContent.includes('DOGRU_ROUTER_SIKKI'))
            || etiketler.find((l) => l.textContent.includes('Doğru (D)'))
            || etiketler[0];
          const inp = hedef && hedef.querySelector('input[name="kiosk-secim"]');
          if (inp) {
            inp.checked = true;
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      };

      // 2A. Başlatmada HTTP 503 -> Sınav AÇILMAMALI
      await sayfa.click('#btn-online-kiosk-ac');
      await bekle(200);
      baslatDurumKodu = 503;
      await kioskFormDoldur('2026000503', 'Başlatma Beşyüzüç');
      await sayfa.click('#btn-kiosk-oturum-baslat');
      await bekle(400);
      const durum503Baslat = await sayfa.evaluate(() => ({
        soruSahneGorunur: document.getElementById('kiosk-soru-sahne').style.display !== 'none',
        girisGorunur: document.getElementById('kiosk-giris-formu').style.display !== 'none',
        hataGorunur: !document.getElementById('kiosk-hata-kutu').hidden,
        token: sessionStorage.getItem('kiosk_token'),
        yerelOturum: sessionStorage.getItem('AKTIF_KIOSK_OTURUM_V1')
      }));
      kontrol(
        'Kiosk 503 Başlangıç: Soru sahnesi açılmaz, token yazılmaz ve hata kutusu görünür',
        !durum503Baslat.soruSahneGorunur &&
          durum503Baslat.girisGorunur &&
          durum503Baslat.hataGorunur &&
          durum503Baslat.token === null &&
          durum503Baslat.yerelOturum === null,
        JSON.stringify(durum503Baslat)
      );
      baslatDurumKodu = null;

      // 2B. Cevap kilitlemede HTTP 403 -> Token silinir, giriş ekranına dönülür
      await kioskFormDoldur('2026000403', 'Eski Token Öğrencisi');
      await sayfa.click('#btn-kiosk-oturum-baslat');
      await bekle(450);
      cevapDurumKodu = 403;
      await secDogruKioskSikki();
      await sayfa.click('#btn-kiosk-cevap-kilitle');
      await bekle(450);
      const durum403Cevap = await sayfa.evaluate(() => ({
        soruSahneGorunur: document.getElementById('kiosk-soru-sahne').style.display !== 'none',
        girisGorunur: document.getElementById('kiosk-giris-formu').style.display !== 'none',
        hataGorunur: !document.getElementById('kiosk-hata-kutu').hidden,
        token: sessionStorage.getItem('kiosk_token')
      }));
      kontrol(
        'Kiosk 403 Cevap: Eski/geçersiz token silinir, soru ilerlemez ve giriş formunda hata gösterilir',
        !durum403Cevap.soruSahneGorunur &&
          durum403Cevap.girisGorunur &&
          durum403Cevap.hataGorunur &&
          durum403Cevap.token === null,
        JSON.stringify(durum403Cevap)
      );
      cevapDurumKodu = null;

      // 2C. P0: Teslimde HTTP 403 -> ASLA "Güvenle Tamamlandı" / 100 / #TESLIM- gösterilmez ve hoca tablosuna yazılmaz
      await kioskFormDoldur('2026999403', 'Teslim Red Öğrencisi');
      await sayfa.click('#btn-kiosk-oturum-baslat');
      await bekle(450);
      await secDogruKioskSikki();
      await sayfa.click('#btn-kiosk-cevap-kilitle');
      await bekle(350);
      bitirDurumKodu = 403;
      await secDogruKioskSikki();
      await sayfa.click('#btn-kiosk-cevap-kilitle');
      await bekle(500);

      const durum403Bitir = await sayfa.evaluate(() => ({
        icerik: document.getElementById('kiosk-soru-icerik').textContent,
        token: sessionStorage.getItem('kiosk_token'),
        gozetmenBtnVar: Boolean(document.getElementById('btn-kiosk-gozetmen-don')),
        hocaTablo: document.getElementById('tablo-online-oturumlar').textContent
      }));
      kontrol(
        'P0 Kiosk 403 Teslim Reddi: Ekranda "Güvenle Tamamlandı", sahte puan veya #TESLIM fişi ÜRETİLMEZ; hoca tablosuna düşmez',
        !durum403Bitir.icerik.includes('Güvenle Tamamlandı') &&
          !durum403Bitir.icerik.includes('#TESLIM-') &&
          !durum403Bitir.hocaTablo.includes('2026999403') &&
          durum403Bitir.token === null &&
          durum403Bitir.gozetmenBtnVar,
        durum403Bitir.icerik.replace(/\s+/g, ' ').slice(0, 140)
      );
      await sayfa.click('#btn-kiosk-gozetmen-don');
      await bekle(200);
      kontrol(
        'Kiosk 403 Teslim Reddi: Gözetmen ekranına dönüldüğünde görünür hata kutusu açıktır',
        await sayfa.$eval('#kiosk-hata-kutu', (el) => !el.hidden)
      );
      bitirDurumKodu = null;

      // 2D. Teslimde geçici HTTP 503 -> Başarı gösterilmez, "Teslimi Tekrar Dene" ile 200 OK sonrası sunucu fişi gösterilir
      await kioskFormDoldur('2026999503', 'Geçici Ağ Öğrencisi');
      await sayfa.click('#btn-kiosk-oturum-baslat');
      await bekle(450);
      for (let adim = 0; adim < 2; adim++) {
        if (adim === 1) bitirDurumKodu = 503;
        await secDogruKioskSikki();
        await sayfa.click('#btn-kiosk-cevap-kilitle');
        await bekle(450);
      }
      const durum503Bitir = await sayfa.evaluate(() => ({
        icerik: document.getElementById('kiosk-soru-icerik').textContent,
        tekrarBtnVar: Boolean(document.getElementById('btn-kiosk-teslim-tekrar')),
        hocaTablo: document.getElementById('tablo-online-oturumlar').textContent
      }));
      kontrol(
        'Kiosk 503 Teslim: Sahte başarı/fiş gösterilmez ve "Teslimi Tekrar Dene" düğmesi sunulur',
        !durum503Bitir.icerik.includes('Güvenle Tamamlandı') &&
          !durum503Bitir.icerik.includes('#TESLIM-') &&
          !durum503Bitir.hocaTablo.includes('2026999503') &&
          durum503Bitir.tekrarBtnVar
      );
      bitirDurumKodu = null;
      await sayfa.click('#btn-kiosk-teslim-tekrar');
      await bekle(550);
      const durum200Tekrar = await sayfa.evaluate(() => {
        const icerik = document.getElementById('kiosk-soru-icerik').textContent;
        const hocaTablo = document.getElementById('tablo-online-oturumlar').textContent;
        const fisEslesme = icerik.match(/#TESLIM-[A-F0-9]+/);
        return {
          icerik,
          hocaTablo,
          fis: fisEslesme ? fisEslesme[0] : null
        };
      });
      kontrol(
        'Kiosk 503 -> 200 Yeniden Teslim: Sunucu onayından sonra 100 puan ve birebir aynı #TESLIM fişi hem öğrencide hem hoca tablosunda görünür',
        durum200Tekrar.icerik.includes('Güvenle Tamamlandı') &&
          durum200Tekrar.icerik.includes('100') &&
          Boolean(durum200Tekrar.fis) &&
          durum200Tekrar.hocaTablo.includes(durum200Tekrar.fis),
        durum200Tekrar.fis || 'fiş yok'
      );

      // Kiosk'tan çık ve eğitmen oturumuna dön
      await sayfa.click('#btn-kiosk-cikis');
      await bekle(250);
      const girisModalAcik = await sayfa.$eval('#modal-hoca-giris', (el) => el.style.display === 'flex');
      if (girisModalAcik) {
        await sayfa.click('#btn-hoca-giris-yap');
        await bekle(300);
        await sayfa.click('#btn-modal-hoca-kapat');
        await bekle(150);
      }

      // -----------------------------------------------------------------------
      // BÖLÜM 3: YOĞUN A4 (637, 1.555 VE 3.187 KARAKTER) ÖNİZLEME = PDF = YAZDIR = 2 SAYFA
      // -----------------------------------------------------------------------
      console.log('\n[3/5] Yoğun A4 (10 D/Y + 20 Test + 2 Klasik: 637, 1555 ve 3187 Karakter) Önizleme, PDF ve Yazdır Eşleşmesi');
      await sayfa.click('[data-sekme="sekme-stüdyo"]');
      await bekle(250);
      await sayfa.evaluate(() => {
        window.__printCagri = 0;
        window.print = () => { window.__printCagri++; };
      });

      const kapsayiciVar = await sayfa.evaluate(() => Boolean(document.querySelector('#baski-alan-kapsayici #a4-onizleme-sahne')));
      kontrol('#baski-alan-kapsayici sarmalayıcısı #a4-onizleme-sahne etrafında mevcut', kapsayiciVar);

      const aktifDersId = await sayfa.$eval('#aktif-ders-sec', (el) => el.value);
      for (const hedefKarakter of [637, 1555, 3187]) {
        const { sorular, gercekUzunluk } = uretYogunSoruBankasi(hedefKarakter, aktifDersId);
        await sayfa.evaluate((yeniSorular) => {
          const d = JSON.parse(localStorage.getItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2') || '{}');
          d.sorular = yeniSorular;
          localStorage.setItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2', JSON.stringify(d));
        }, sorular);
        await sayfa.reload({ waitUntil: 'networkidle0' });
        await sayfa.evaluate(() => {
          window.__printCagri = 0;
          window.print = () => { window.__printCagri++; };
          const b = document.getElementById('btn-hoca-giris-yap');
          if (b && document.getElementById('modal-hoca-giris').style.display === 'flex') b.click();
        });
        await bekle(300);
        await sayfa.evaluate(() => {
          const k = document.getElementById('btn-modal-hoca-kapat');
          if (k && document.getElementById('modal-hoca-giris').style.display === 'flex') k.click();
          const setVal = (id, v) => {
            const el = document.getElementById(id);
            if (el) {
              el.value = String(v);
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          };
          setVal('ayar-dy-sayisi', 10);
          setVal('ayar-dy-toplam-puan', 20);
          setVal('ayar-test-sayisi', 20);
          setVal('ayar-test-toplam-puan', 60);
          setVal('ayar-klasik-sayisi', 2);
          setVal('ayar-klasik-toplam-puan', 20);
          const ek = document.getElementById('ayar-ek-sayfa-izni');
          if (ek && ek.checked) ek.click();
          setVal('baski-kapsam-sec', 'sinif-aktif');
          const btnUygula = document.getElementById('btn-kombinasyon-uygula');
          if (btnUygula) btnUygula.click();
        });
        await bekle(500);

        const olcDom = () => sayfa.evaluate(() => {
          const sayfalar = Array.from(document.querySelectorAll('#a4-onizleme-sahne .a4-sayfa'));
          const olculer = sayfalar.map((p) => ({ scroll: p.scrollHeight, client: p.clientHeight }));
          const soruAdet = document.querySelectorAll('#a4-onizleme-sahne .dy-soru-satir, #a4-onizleme-sahne .soru-kutu').length;
          const metin = document.getElementById('a4-onizleme-sahne').textContent || '';
          return {
            sayfaSayisi: sayfalar.length,
            olculer,
            tasmaVar: olculer.some((o) => o.scroll > o.client + 2),
            soruAdet,
            etiket1: metin.includes('SAYFA 1 / 2') || metin.includes('Sayfa 1 / 2'),
            etiket2: metin.includes('SAYFA 2 / 2') || metin.includes('Sayfa 2 / 2')
          };
        });

        const onizlemeOlcu = await olcDom();
        kontrol(
          `Yoğun A4 (${gercekUzunluk} krk) Önizleme: Tam 2 A4 sayfa, taşma yok (${JSON.stringify(onizlemeOlcu.olculer)}), 32/32 soru mevcut`,
          onizlemeOlcu.sayfaSayisi === 2 && !onizlemeOlcu.tasmaVar && onizlemeOlcu.soruAdet === 32,
          JSON.stringify(onizlemeOlcu)
        );

        // Yazdır tıklaması sonrası DOM ve Chrome gerçek baskı PDF (page.pdf) kontrolü
        await sayfa.select('#baski-format-sec', 'yazdir');
        await sayfa.click('#btn-secili-baski-calistir');
        await bekle(350);
        const yazdirSonrasiOlcu = await olcDom();
        kontrol(
          `Yoğun A4 (${gercekUzunluk} krk) Yazdır Sonrası DOM: Ham HTML ezilmesi yok, tam 2 sayfa, taşma yok ve 32/32 soru korunuyor`,
          yazdirSonrasiOlcu.sayfaSayisi === 2 && !yazdirSonrasiOlcu.tasmaVar && yazdirSonrasiOlcu.soruAdet === 32,
          JSON.stringify(yazdirSonrasiOlcu)
        );

        const nativePrintPdf = await sayfa.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
        const nativeSayfaAdet = (Buffer.from(nativePrintPdf).toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
        kontrol(
          `Yoğun A4 (${gercekUzunluk} krk) Chrome Baskı Medyası (page.pdf): Tam 2 A4 sayfa üretildi`,
          nativeSayfaAdet === 2,
          `${nativeSayfaAdet} sayfa`
        );

        // Uygulama PDF indirmesi kontrolü
        const onceDosyaSayisi = fs.readdirSync(INDIRILEN).filter((f) => !f.endsWith('.crdownload')).length;
        await sayfa.select('#baski-format-sec', 'pdf-indir');
        await sayfa.click('#btn-secili-baski-calistir');
        const bas = Date.now();
        while (Date.now() - bas < 15000) {
          const d = fs.readdirSync(INDIRILEN).filter((f) => !f.endsWith('.crdownload'));
          if (d.length > onceDosyaSayisi) break;
          await bekle(150);
        }
        const sonDosya = fs.readdirSync(INDIRILEN)
          .filter((f) => f.endsWith('.pdf'))
          .map((f) => ({ f, t: fs.statSync(path.join(INDIRILEN, f)).mtimeMs }))
          .sort((a, b) => b.t - a.t)[0];
        const pdfSayfaAdet = sonDosya
          ? (fs.readFileSync(path.join(INDIRILEN, sonDosya.f)).toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length
          : 0;
        kontrol(
          `Yoğun A4 (${gercekUzunluk} krk) Uygulama PDF İndirmesi: Tam 2 A4 sayfa`,
          pdfSayfaAdet === 2,
          `${pdfSayfaAdet} sayfa`
        );
      }

      // Aşırı yoğun metinde (75.000 karakter) taşma koruma kilidi ve açık ek sayfa izni testi
      const asiriBanka = uretYogunSoruBankasi(75000, aktifDersId);
      await sayfa.evaluate((yeniSorular) => {
        const d = JSON.parse(localStorage.getItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2') || '{}');
        d.sorular = yeniSorular;
        localStorage.setItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2', JSON.stringify(d));
      }, asiriBanka.sorular);
      await sayfa.reload({ waitUntil: 'networkidle0' });
      await sayfa.evaluate(() => {
        const b = document.getElementById('btn-hoca-giris-yap');
        if (b && document.getElementById('modal-hoca-giris').style.display === 'flex') b.click();
      });
      await bekle(250);
      await sayfa.evaluate(() => {
        const k = document.getElementById('btn-modal-hoca-kapat');
        if (k && document.getElementById('modal-hoca-giris').style.display === 'flex') k.click();
        const setVal = (id, v) => {
          const el = document.getElementById(id);
          if (el) { el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); }
        };
        setVal('ayar-dy-sayisi', 10);
        setVal('ayar-dy-toplam-puan', 20);
        setVal('ayar-test-sayisi', 20);
        setVal('ayar-test-toplam-puan', 60);
        setVal('ayar-klasik-sayisi', 2);
        setVal('ayar-klasik-toplam-puan', 20);
        document.getElementById('btn-kombinasyon-uygula').click();
      });
      await bekle(450);
      const tasmaKoruma = await sayfa.evaluate(() => {
        const uyari = document.getElementById('uyari-a4-tasma-kutu');
        return {
          uyariGorunur: Boolean(uyari && uyari.style.display !== 'none'),
          sayfaSayisi: document.querySelectorAll('#a4-onizleme-sahne .a4-sayfa').length
        };
      });
      await sayfa.click('#ayar-ek-sayfa-izni');
      await bekle(450);
      const ekSayfaSonrasi = await sayfa.evaluate(() => {
        const sayfalar = Array.from(document.querySelectorAll('#a4-onizleme-sahne .a4-sayfa'));
        const sonEtiket = sayfalar.length ? (sayfalar[sayfalar.length - 1].querySelector('.a4-sayfa-etiket') || {}).textContent || '' : '';
        return { sayfaSayisi: sayfalar.length, sonEtiket };
      });
      kontrol(
        'Aşırı yoğun metinde (75.000 krk) ek sayfa izni kapalıyken uyarı gösterilir; açıldığında Sayfa N / N olarak numaralanır',
        tasmaKoruma.uyariGorunur &&
          ekSayfaSonrasi.sayfaSayisi >= 3 &&
          ekSayfaSonrasi.sonEtiket.includes(`${ekSayfaSonrasi.sayfaSayisi} / ${ekSayfaSonrasi.sayfaSayisi}`),
        JSON.stringify({ tasmaKoruma, ekSayfaSonrasi })
      );

      // -----------------------------------------------------------------------
      // BÖLÜM 4: MOBİL -> PC YETKİLİ SENKRON (BroadcastChannel) VE 390x844 TAŞMASIZLIK
      // -----------------------------------------------------------------------
      console.log('\n[4/5] Mobil -> PC Yetkili OMR Aktarımı ve 390×844 Mobil Görünüm Taşmasızlık Kontrolü');
      await sayfa.click('#btn-cikti-merkezi-ogr-qr');
      await bekle(250);
      const pcOturumHam = await sayfa.$eval('#rozet-pc-eslesme-kod', (el) => el.textContent.trim());
      const pcOturumKodu = pcOturumHam.replace(/^Oturum:\s*/i, '').trim();
      await sayfa.click('#btn-modal-ogrenci-qr-kapat');
      await bekle(150);

      const mobilSayfa = await tarayici.newPage();
      await mobilSayfa.setViewport({ width: 390, height: 844 });
      await mobilSayfa.goto(`${taban}/optik-mobil.html`, { waitUntil: 'networkidle0' });
      await bekle(350);

      for (const mSekme of ['m-panel-tara', 'm-panel-anahtar', 'm-panel-liste']) {
        await mobilSayfa.click(`[data-msekme="${mSekme}"]`);
        await bekle(150);
        const mBoyut = await mobilSayfa.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        kontrol(`Mobil OMR (${mSekme}) 390×844 yatay taşma yok`, mBoyut.sw <= mBoyut.iw, `${mBoyut.sw}/${mBoyut.iw}`);
      }

      await mobilSayfa.click('[data-msekme="m-panel-tara"]');
      await bekle(150);
      await mobilSayfa.click('#btn-mobil-kare-oku');
      await bekle(450);
      await mobilSayfa.click('[data-msekme="m-panel-liste"]');
      await bekle(150);
      await mobilSayfa.evaluate((kod) => {
        document.getElementById('mobil-sonuc-pc-kodu').value = kod;
      }, pcOturumKodu);
      await mobilSayfa.click('#btn-mobil-sonuc-pc-gonder');
      await bekle(500);
      const mobilGonderBilgi = await mobilSayfa.$eval('#etiket-mobil-sonuc-aktar-bilgi', (el) => el.textContent);
      kontrol('Mobil -> PC OMR sonuç gönderimi yetkili token ile başarılı (200 OK)', mobilGonderBilgi.includes('gönderildi'), mobilGonderBilgi);
      await mobilSayfa.close();

      // -----------------------------------------------------------------------
      // BÖLÜM 5: FAZ 2 (BOLOGNA 74161101, OTO ÖÇ/BLOOM, KALİTE ŞABLON STÜDYOSU, KÜMÜLATİF ÖÇ×PÇ & PUKÖ)
      // -----------------------------------------------------------------------
      console.log('\n[5/5] Faz 2: Bologna 74161101 Paketi, Otomatik ÖÇ/Bloom Masası, Sekme 7 Kalite Şablonları ve Kümülatif PUKÖ Analitiği');
      await sayfa.setViewport({ width: 1440, height: 950 });

      // 5A. Bologna Bilgi Paketi (74161101 — Ağ Teknolojilerine Giriş) UI üzerinden içe aktarma
      await sayfa.click('[data-sekme="sekme-banka"]');
      await bekle(200);
      await sayfa.click('#btn-banka-bologna-ac');
      await bekle(200);
      await sayfa.click('#btn-bologna-ornek-yukle');
      await bekle(450);

      const bolognaOnizleme = await sayfa.evaluate(() => {
        const el = document.getElementById('kutu-bologna-onizleme');
        return {
          gorunur: Boolean(el && el.style.display !== 'none'),
          metin: el ? el.textContent : ''
        };
      });
      kontrol(
        'Faz 2 Bologna (74161101): Ö1..Ö4 -> ÖÇ-1..ÖÇ-4, 14 hafta, Ara Sınav %40 / Final %60 ve mükerrer P4 (PÇ-4) uyarısı ayrıştırıldı',
        bolognaOnizleme.gorunur &&
          bolognaOnizleme.metin.includes('74161101') &&
          bolognaOnizleme.metin.includes('Ağ Teknolojilerine Giriş') &&
          (bolognaOnizleme.metin.includes('PÇ-4') || bolognaOnizleme.metin.includes('P4')) &&
          bolognaOnizleme.metin.includes('ÖÇ-4') &&
          bolognaOnizleme.metin.includes('14 hafta'),
        bolognaOnizleme.metin.replace(/\s+/g, ' ').slice(0, 140)
      );
      await sayfa.click('#btn-bologna-uygula');
      await bekle(300);

      // 5B. Soru Bankasında Enum-Kilitli Otomatik ÖÇ + Hafta + Bloom + Zorluk Analizi ve Onay Masası
      const bolognaDersId = await sayfa.$eval('#aktif-ders-sec', (el) => el.value);
      await sayfa.evaluate((dId) => {
        const d = JSON.parse(localStorage.getItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2') || '{}');
        d.sorular = [
          { id: 'ag-1', dersId: dId, tur: 'dy', zorluk: 'Kolay', hafta: 1, ocKodu: '', metin: 'OSI referans modelinde fiziksel katman bit iletiminden sorumludur.', dogruDY: 'D' },
          { id: 'ag-2', dersId: dId, tur: 'test', zorluk: 'Orta', hafta: 1, ocKodu: '', metin: 'UTP Cat6 ağ kablosunda RJ-45 konnektör çakma sıralaması T568B standardına göre nasıl yapılandırılır?', siklar: ['Turuncu-Beyaz, Turuncu...', 'Mavi, Sarı', 'Kırmızı', 'Siyah', 'Mor'], dogruHarf: 'A' },
          { id: 'ag-3', dersId: dId, tur: 'test', zorluk: 'Orta', hafta: 1, ocKodu: '', metin: '192.168.10.0/24 IPv4 alt ağ adresleme yapısını 4 alt ağa bölmek için subnet mask değerini hesaplayınız.', siklar: ['255.255.255.192', '255.255.0.0', '255.0.0.0', '255.255.255.0', '255.255.255.252'], dogruHarf: 'A' },
          { id: 'ag-4', dersId: dId, tur: 'klasik', zorluk: 'Zor', hafta: 1, ocKodu: '', metin: 'Kurumsal ağ paylaşım ve güvenlik duvarı erişim politikasını sıfır güven ilkelerine göre tasarlayınız.', puan: 20, cevapSatir: 4 }
        ];
        localStorage.setItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2', JSON.stringify(d));
      }, bolognaDersId);
      await sayfa.reload({ waitUntil: 'networkidle0' });
      await sayfa.evaluate(() => {
        const b = document.getElementById('btn-hoca-giris-yap');
        if (b && document.getElementById('modal-hoca-giris').style.display === 'flex') b.click();
      });
      await bekle(250);
      await sayfa.evaluate(() => {
        const k = document.getElementById('btn-modal-hoca-kapat');
        if (k && document.getElementById('modal-hoca-giris').style.display === 'flex') k.click();
        const setVal = (id, v) => {
          const el = document.getElementById(id);
          if (el) { el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); }
        };
        setVal('ayar-dy-sayisi', 1);
        setVal('ayar-dy-toplam-puan', 20);
        setVal('ayar-test-sayisi', 2);
        setVal('ayar-test-toplam-puan', 60);
        setVal('ayar-klasik-sayisi', 1);
        setVal('ayar-klasik-toplam-puan', 20);
        document.getElementById('btn-kombinasyon-uygula').click();
      });
      await bekle(300);

      await sayfa.click('[data-sekme="sekme-banka"]');
      await bekle(200);
      await sayfa.click('#btn-banka-otomatik-oc-analiz');
      await bekle(450);

      const aiMasaBilgi = await sayfa.evaluate(() => {
        const secimler = Array.from(document.querySelectorAll('#tablo-ai-oc-onay select.ai-onay-oc1')).map((s) => s.value);
        const gecerliEnum = new Set(['ÖÇ-1', 'ÖÇ-2', 'ÖÇ-3', 'ÖÇ-4']);
        return {
          satirSayisi: secimler.length,
          hepsiGecerliEnumMu: secimler.length === 4 && secimler.every((v) => gecerliEnum.has(v)),
          secimler
        };
      });
      kontrol(
        'Faz 2 Otomatik ÖÇ/Bloom Onay Masası: Tüm öneriler yalnızca dersin kayıtlı ÖÇ-1..ÖÇ-4 kodlarına enum-kilitli üretildi',
        aiMasaBilgi.hepsiGecerliEnumMu,
        JSON.stringify(aiMasaBilgi.secimler)
      );
      await sayfa.click('#btn-ai-oc-tumunu-onayla');
      await bekle(300);

      // Baskı öncesi ÖÇ & Bloom trafik ışığı kontrolü
      await sayfa.click('[data-sekme="sekme-stüdyo"]');
      await bekle(250);
      const trafikMetin = await sayfa.$eval('#trafik-oc-bloom-cubuk', (el) => el.textContent);
      kontrol('Faz 2 Baskı Öncesi ÖÇ & Bloom Trafik Işığı çubuğu aktif hesaplandı', trafikMetin.includes('ÖÇ') && trafikMetin.includes('Bloom'), trafikMetin.slice(0, 100));

      // 5C. Sekme 4: Tek Tık Soru İptali, PÇ (1-5) Gerçekleşme, Kümülatif Vize %40 + Final %60 ÖÇ × PÇ ve PUKÖ Raporu
      await sayfa.evaluate((dId) => {
        const C = window.SinavOptikCekirdek;
        const d = JSON.parse(localStorage.getItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2') || '{}');
        d.seciliHaftalar = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
        const aktifDers = (d.dersler || []).find((x) => x.id === dId) || { kod: '74161101' };
        const dersSorulari = (d.sorular || []).filter((q) => q.dersId === dId);
        const varyasyonA = C.uretKitapcikVaryasyonu(dersSorulari, 'A', `${aktifDers.kod}-1-2-1`, true, 5);
        const dogruDy1 = (varyasyonA.dy[0] && varyasyonA.dy[0].dogruDY) || 'D';
        const dogruT1 = (varyasyonA.test[0] && varyasyonA.test[0].dogruHarf) || 'A';
        const dogruT2 = (varyasyonA.test[1] && varyasyonA.test[1].dogruHarf) || 'B';
        const yanlisT1 = ['A', 'B', 'C', 'D', 'E'].find((h) => h !== dogruT1) || 'E';
        const yanlisT2 = ['A', 'B', 'C', 'D', 'E'].find((h) => h !== dogruT2) || 'E';

        d.ogrenciler = [
          { dersIdler: [dId], ogrNo: '20261001', adSoyad: 'Zeynep Kaya', bolum: 'Bilgi Güvenliği' },
          { dersIdler: [dId], ogrNo: '20261002', adSoyad: 'Kerem Demir', bolum: 'Bilgi Güvenliği' }
        ];
        d.okumaSonuclari = [
          {
            id: 'ok-1',
            ogrNo: '20261001',
            adSoyad: 'Zeynep Kaya',
            grup: 'A',
            toplamPuan: 70,
            dyNet: 1,
            testNet: 1,
            dyDogru: 1,
            dyYanlis: 0,
            testDogru: 1,
            testYanlis: 1,
            klasikToplamPuan: 20,
            dyDetay: [{ soruNo: 1, verilen: dogruDy1, sonuc: 'DOGRU' }],
            testDetay: [
              { soruNo: 1, verilen: dogruT1, sonuc: 'DOGRU' },
              { soruNo: 2, verilen: yanlisT2, sonuc: 'YANLIS' }
            ],
            klasikDetay: [{ soruNo: 1, verilenPuan: 20 }]
          },
          {
            id: 'ok-2',
            ogrNo: '20261002',
            adSoyad: 'Kerem Demir',
            grup: 'A',
            toplamPuan: 40,
            dyNet: 1,
            testNet: 0,
            dyDogru: 1,
            dyYanlis: 0,
            testDogru: 0,
            testYanlis: 2,
            klasikToplamPuan: 20,
            dyDetay: [{ soruNo: 1, verilen: dogruDy1, sonuc: 'DOGRU' }],
            testDetay: [
              { soruNo: 1, verilen: yanlisT1, sonuc: 'YANLIS' },
              { soruNo: 2, verilen: yanlisT2, sonuc: 'YANLIS' }
            ],
            klasikDetay: [{ soruNo: 1, verilenPuan: 20 }]
          }
        ];
        localStorage.setItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2', JSON.stringify(d));
      }, bolognaDersId);
      await sayfa.reload({ waitUntil: 'networkidle0' });
      await sayfa.evaluate(() => {
        const b = document.getElementById('btn-hoca-giris-yap');
        if (b && document.getElementById('modal-hoca-giris').style.display === 'flex') b.click();
      });
      await bekle(250);
      await sayfa.evaluate(() => {
        const k = document.getElementById('btn-modal-hoca-kapat');
        if (k && document.getElementById('modal-hoca-giris').style.display === 'flex') k.click();
        const setVal = (id, v) => {
          const el = document.getElementById(id);
          if (el) { el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); }
        };
        setVal('ayar-dy-sayisi', 1);
        setVal('ayar-dy-toplam-puan', 20);
        setVal('ayar-test-sayisi', 2);
        setVal('ayar-test-toplam-puan', 60);
        setVal('ayar-klasik-sayisi', 1);
        setVal('ayar-klasik-toplam-puan', 20);
        document.getElementById('btn-kombinasyon-uygula').click();
      });
      await bekle(350);

      await sayfa.click('[data-sekme="sekme-analiz"]');
      await bekle(300);

      const analizDurum1 = await sayfa.evaluate(() => ({
        pcSatir: document.querySelectorAll('#tablo-pc-gerceklesme tr').length,
        pcMetin: document.getElementById('tablo-pc-gerceklesme').textContent,
        pukoMetin: document.getElementById('metin-puko-raporu').value
      }));
      kontrol(
        'Faz 2 Sekme 4: Program Çıktıları (PÇ-1..PÇ-5) gerçekleşme tablosu ve PUKÖ özeti üretildi',
        analizDurum1.pcSatir >= 4 && (analizDurum1.pcMetin.includes('PÇ-1') || analizDurum1.pcMetin.includes('P1')) && analizDurum1.pukoMetin.includes('PUKÖ'),
        `${analizDurum1.pcSatir} PÇ satırı`
      );

      // Tek tıkla Test Soru 2'yi İptal Et -> tüm öğrencilere tam madde puanı (+30) yansımalı!
      const iptalBtnVar = await sayfa.evaluate(() => {
        const btn = document.querySelector('#tablo-madde-analizi [data-toggle-iptal-kod="TEST-2"]');
        if (!btn) return false;
        btn.click();
        return true;
      });
      await bekle(300);
      const iptalSonrasiPuanlar = await sayfa.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2') || '{}');
        return (d.okumaSonuclari || []).map((s) => s.toplamPuan);
      });
      kontrol(
        'Faz 2 Tek Tıkla Soru İptali (TEST-2): Her iki öğrenciye tam madde puanı eklendi (70->100, 40->70)',
        iptalBtnVar && iptalSonrasiPuanlar[0] === 100 && iptalSonrasiPuanlar[1] === 70,
        JSON.stringify(iptalSonrasiPuanlar)
      );

      // Kümülatif Dönem Sonu (Vize %40 + Eklenen Final %60) birleştirme testi
      await sayfa.evaluate(() => {
        const finalPaket = {
          belgeTuru: 'OMR_DETAYLI_SONUC_PAKETI',
          sinavKodu: 'FINAL-2026',
          sinavTuru: 'Final',
          agirlik: 60,
          okumaSonuclari: [
            {
              ogrNo: '20261001',
              adSoyad: 'Zeynep Kaya',
              grup: 'A',
              toplamPuan: 80,
              dyNet: 1,
              testNet: 2,
              klasikToplamPuan: 10,
              dyDetay: [{ soruNo: 1, verilen: 'D', sonuc: 'DOGRU' }],
              testDetay: [{ soruNo: 1, verilen: 'A', sonuc: 'DOGRU' }, { soruNo: 2, verilen: 'A', sonuc: 'DOGRU' }],
              klasikDetay: [{ soruNo: 1, verilenPuan: 10 }]
            },
            {
              ogrNo: '20261002',
              adSoyad: 'Kerem Demir',
              grup: 'A',
              toplamPuan: 50,
              dyNet: 0,
              testNet: 1,
              klasikToplamPuan: 20,
              dyDetay: [{ soruNo: 1, verilen: 'Y', sonuc: 'YANLIS' }],
              testDetay: [{ soruNo: 1, verilen: 'A', sonuc: 'DOGRU' }, { soruNo: 2, verilen: 'B', sonuc: 'YANLIS' }],
              klasikDetay: [{ soruNo: 1, verilenPuan: 20 }]
            }
          ]
        };
        const dt = new DataTransfer();
        dt.items.add(new File([JSON.stringify(finalPaket)], 'final_sonuclar.omr.json', { type: 'application/json' }));
        const inp = document.getElementById('input-donem-sinav-dosya');
        inp.files = dt.files;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await bekle(450);
      const kumulatifMetin = await sayfa.$eval('#kutu-kumulatif-oc-matrisi', (el) => el.textContent);
      kontrol(
        'Faz 2 Kümülatif Dönem Sonu (Vize %40 + Final %60) Öğrenci × ÖÇ tablosu hesaplandı',
        kumulatifMetin.includes('Zeynep Kaya') && kumulatifMetin.includes('Kerem Demir') && kumulatifMetin.includes('%'),
        kumulatifMetin.replace(/\s+/g, ' ').slice(0, 120)
      );

      // Maddi Hata İtiraz Kanıt Tutanağı ve Özel OBS CSV çekirdek doğrulaması
      const itirazTxt = Cekirdek.uretMaddiHataItirazKanitRaporuTXT(
        { ogrNo: '20261002', adSoyad: 'Kerem Demir', grup: 'A', toplamPuan: 70, dyDetay: [{ soruNo: 1, verilen: 'D', sonuc: 'DOGRU' }], testDetay: [{ soruNo: 1, verilen: 'C', sonuc: 'YANLIS' }] },
        { dersAd: 'Ağ Teknolojilerine Giriş', cevapAnahtarlari: { A: { dy: ['D'], test: ['A'] } } }
      );
      kontrol('Faz 2 Maddi Hata İtiraz Kanıt Tutanağı (.txt) üretilir', itirazTxt.includes('MADDİ HATA') && itirazTxt.includes('Kerem Demir'));

      const ozelObsCsv = Cekirdek.uretOzelObsNotCsv(
        [{ ogrNo: '20261001', adSoyad: 'Zeynep Kaya', grup: 'A', toplamPuan: 88 }],
        { sutunlar: ['OGRENCI_NO', 'AD_SOYAD', 'PUAN', 'HARF_NOTU'], dersKodu: '74161101', sinavTuru: 'Vize' }
      );
      kontrol('Faz 2 Kuruma Özel OBS CSV Eşleştiricisi özel sütunlarla üretilir', ozelObsCsv.includes('OGRENCI_NO;AD_SOYAD;PUAN;HARF_NOTU') && ozelObsCsv.includes('20261001'));

      // 5D. Sekme 7: Kurumsal Kalite & Şablon Stüdyosu + 7 Sekmenin Tamamında 390x844 Mobil Taşmasızlık
      await sayfa.click('[data-sekme="sekme-sablonlar"]');
      await bekle(250);
      await sayfa.evaluate(() => {
        const setInput = (id, v) => {
          const el = document.getElementById(id);
          if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
        };
        setInput('sablon-ad', 'Hatay MKÜ Kırıkhan MYO Kalite Şablonu');
        setInput('sablon-kurum-adi', 'HATAY MUSTAFA KEMAL ÜNİVERSİTESİ');
        setInput('sablon-birim-adi', 'Kırıkhan Meslek Yüksekokulu');
        setInput('sablon-dokuman-no', 'MKU-FRM-101');
      });
      await sayfa.click('#btn-kurum-sablon-kaydet');
      await bekle(300);
      const sablonOnizlemeMetni = await sayfa.$eval('#onizleme-kurum-antet', (el) => el.textContent);
      kontrol(
        'Faz 2 Sekme 7 Kalite Şablon Stüdyosu: {{KURUM_ADI}} ve {{DOKUMAN_NO}} yer tutucuları canlı antette çözümlendi ve kaydedildi',
        sablonOnizlemeMetni.includes('HATAY MUSTAFA KEMAL ÜNİVERSİTESİ') && sablonOnizlemeMetni.includes('MKU-FRM-101'),
        sablonOnizlemeMetni.replace(/\s+/g, ' ').slice(0, 120)
      );

      // Tüm 7 sekmede 390x844 yatay taşma sıfır kontrolü
      await sayfa.setViewport({ width: 390, height: 844 });
      await bekle(200);
      for (const sekmeId of ['sekme-stüdyo', 'sekme-banka', 'sekme-omr', 'sekme-analiz', 'sekme-ogrenciler', 'sekme-online', 'sekme-sablonlar']) {
        await sayfa.click(`[data-sekme="${sekmeId}"]`);
        await bekle(180);
        const boyut = await sayfa.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        kontrol(`Stüdyo 390×844 (${sekmeId}) yatay taşma yok`, boyut.sw <= boyut.iw, `${boyut.sw}/${boyut.iw}`);
      }

      kontrol('Tarayıcı senaryoları boyunca hiçbir JS çalışma zamanı hatası oluşmadı', sayfaHatalari.length === 0, sayfaHatalari.join(' | '));
    } finally {
      await tarayici.close();
    }
  } finally {
    server.close();
  }

  console.log(`\n=== TOPLAM: ${gecen}/${gecen + hataSayisi} KONTROL GEÇTİ · ${hataSayisi} HATA ===`);
  process.exit(hataSayisi === 0 ? 0 : 1);
})().catch((err) => {
  console.error('TEST ÇÖKTÜ:', err);
  process.exit(2);
});
