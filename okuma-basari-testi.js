/* ==========================================================================
   SINIF ÖLÇEĞİNDE OKUMA BAŞARI TESTİ (PWA uçtan uca, Chrome + puppeteer-core)
   - Gerçek sınav kurgusu: kurulum QR'ı (anahtar + sınıf listesi) mobil okuyucuya okutulur.
   - Her öğrenci için uygulamanın BASTIĞI optik form çizilir; kitapçık, numara, cevaplar ve klasik puan
     ELLE kodlanmış gibi işaretlenir (düzensiz elips, kurşun kalem tonu, açık bastırma, silinti izi, çift işaret).
   - Kağıt telefon fotoğrafına çevrilir (eğim, perspektif, 90°/180° dönük, gölge, bulanıklık, düşük çözünürlük, JPEG).
   - Fotoğraf mobil uygulamaya "Fotoğraf Seç" (#input-mobil-foto) ile verilir; kaydedilen sonuç beklenenle karşılaştırılır.
   Başarı ölçütü: SESSİZ HATA = 0 (yanlış okunup inceleme kuyruğuna da düşmeyen hiçbir balon satırı olmamalı)
   ve doğru okuma oranı %100.
   Çalıştırma: node okuma-basari-testi.js      (ayrıntı: AYRINTI=1, görüntü dökümü: DUMP=1)
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { baslatSunucu } = require('./server.js');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  .find((p) => fs.existsSync(p));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let gecen = 0;
let hata = 0;
function kontrol(ad, kosul, detay = '') {
  if (kosul) gecen++; else hata++;
  if (!kosul || process.env.AYRINTI) console.log(`  ${kosul ? '✓' : '✗ HATA'} ${ad}${detay ? ` — ${detay}` : ''}`);
}

// Tohumlu rastgele (tekrarlanabilir sonuç)
function rng(tohum) {
  let s = 0;
  for (const ch of String(tohum)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const ADLAR = ['Ali Yılmaz', 'Ayşe Kaya', 'Mehmet Demir', 'Zeynep Ak', 'Can Er', 'Elif Su', 'Burak Şen', 'Cemre Öz', 'Deniz Ay', 'Ece Gül',
  'Furkan Tan', 'Gizem Çelik', 'Hakan Uç', 'İrem Koç', 'Kemal Arı', 'Leyla Taş', 'Murat Bal', 'Nazlı Kır', 'Onur Yıldız', 'Pınar Ateş',
  'Rıza Öztürk', 'Seda Güneş', 'Tolga Işık', 'Ümran Doğan', 'Volkan Erdem', 'Yasemin Polat', 'Zafer Kurt', 'Aslı Bulut', 'Barış Aydın', 'Çağla Yurt'];

const SENARYOLAR = [
  { ad: 'düz, iyi ışık', css: 'none', golge: false, bulanik: 0, genislik: 1000 },
  { ad: 'eğik -4° + perspektif', css: 'perspective(1100px) rotateX(16deg) rotateY(-9deg) rotateZ(-4deg)', golge: true, bulanik: 0.5, genislik: 1000 },
  { ad: 'ters (180°) + perspektif', css: 'perspective(1100px) rotateX(10deg) rotateZ(180deg)', golge: true, bulanik: 0.4, genislik: 1000 },
  { ad: 'yan (90°)', css: 'rotateZ(90deg)', golge: false, bulanik: 0.3, genislik: 760 },
  { ad: 'koyu gölge + bulanık', css: 'rotateZ(2.5deg)', golge: 'koyu', bulanik: 0.9, genislik: 1000 },
  { ad: 'uzaktan çekim (düşük çözünürlük)', css: 'rotateZ(-1.5deg)', golge: true, bulanik: 0.4, genislik: 700 }
];

const SINAVLAR = [
  {
    ad: 'BIL101 Vize (15 D/Y + 20 Test 5 şık + 3 Klasik, son 2 hane, 4 kitapçık)',
    kod: 'BIL101', ogrSayi: 24, noOnek: '2023104',
    yapi: { dySayisi: 15, testSayisi: 20, sikSayisi: 5, klasikSayisi: 3, klasikSoruPuan: 10, kimlikModu: 'son2', haneSayisi: 2, dyToplamPuan: 30, testToplamPuan: 40, klasikToplamPuan: 30 },
    gruplar: ['A', 'B', 'C', 'D']
  },
  {
    ad: 'BIL202 Final (40 Test 4 şık, son 3 hane, 2 kitapçık)',
    kod: 'BIL202', ogrSayi: 12, noOnek: '2022100',
    yapi: { dySayisi: 0, testSayisi: 40, sikSayisi: 4, klasikSayisi: 0, kimlikModu: 'son3', haneSayisi: 3, dyToplamPuan: 0, testToplamPuan: 100, klasikToplamPuan: 0 },
    gruplar: ['A', 'B']
  }
];

function sinifUret(s) {
  const r = rng(s.kod);
  const liste = [];
  const kullanilan = new Set();
  for (let i = 0; i < s.ogrSayi; i++) {
    let no;
    do { no = s.noOnek + String(Math.floor(r() * 900) + 100); } while (kullanilan.has(no));
    kullanilan.add(no);
    liste.push({ ogrNo: no, adSoyad: ADLAR[i % ADLAR.length] });
  }
  // Bilerek çakışma: son 2 hane modunda iki öğrencinin son iki hanesi aynı olsun (alttan ders alan öğrenci)
  if (s.yapi.kimlikModu === 'son2') liste[1].ogrNo = '2021109' + liste[0].ogrNo.slice(-3);
  return liste;
}

function anahtarUret(s) {
  const harfler = ['A', 'B', 'C', 'D', 'E'].slice(0, s.yapi.sikSayisi);
  const a = {};
  s.gruplar.forEach((g) => {
    const r = rng(s.kod + g);
    a[g] = {
      dy: Array.from({ length: s.yapi.dySayisi }, () => (r() < 0.5 ? 'D' : 'Y')),
      test: Array.from({ length: s.yapi.testSayisi }, () => harfler[Math.floor(r() * harfler.length)]),
      klasik: []
    };
  });
  return a;
}

/* Öğrencinin kağıdı: cevaplar (yaklaşık %8 boş), bazı kağıtlarda çift işaret, silinti izi, açık kalem */
function kagitPlani(s, ogr, idx) {
  const r = rng(s.kod + ogr.ogrNo);
  const harfler = ['A', 'B', 'C', 'D', 'E'].slice(0, s.yapi.sikSayisi);
  const grup = s.gruplar[idx % s.gruplar.length];
  const dy = Array.from({ length: s.yapi.dySayisi }, () => (r() < 0.08 ? null : (r() < 0.5 ? 'D' : 'Y')));
  const test = Array.from({ length: s.yapi.testSayisi }, () => (r() < 0.08 ? null : harfler[Math.floor(r() * harfler.length)]));
  const kademeler = [0, 2, 4, 6, 8, 10];
  const klasik = Array.from({ length: s.yapi.klasikSayisi }, () => kademeler[Math.floor(r() * kademeler.length)]);
  // Her 5. kağıtta bir test sorusu çift işaretli
  const ciftTest = idx % 5 === 3 && s.yapi.testSayisi > 3 ? 2 : -1;
  // Her 3. kağıtta bir soruda silinti izi (başka şıkta soluk leke)
  const silintiTest = idx % 3 === 1 ? 5 : -1;
  // Her 4. kağıt açık bastırılmış kurşun kalemle
  const acikKalem = idx % 4 === 2;
  return { grup, dy, test, klasik, ciftTest, silintiTest, acikKalem };
}

(async () => {
  console.log('=== SINIF ÖLÇEĞİNDE PWA OKUMA BAŞARI TESTİ ===');
  if (!CHROME) throw new Error('Chrome/Edge bulunamadı');
  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const cizim = await tarayici.newPage();
  await cizim.setViewport({ width: 1300, height: 1000 });
  await cizim.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
  const geciciKlasor = path.resolve('test-artifacts', 'okuma-basari');
  fs.mkdirSync(geciciKlasor, { recursive: true });

  const toplam = { kagit: 0, satir: 0, dogru: 0, isaretli: 0, sessiz: 0, kimlikDogru: 0, kimlikKagit: 0, grupDogru: 0 };
  const sessizDetay = [];
  const incelemeDetay = [];

  try {
    for (const s of SINAVLAR) {
      console.log(`\n${s.ad}`);
      const ogrenciler = sinifUret(s);
      const anahtar = anahtarUret(s);
      const yapi = Object.assign({}, s.yapi, {
        dersId: s.kod, dersAd: `${s.kod} - Test Dersi`, sinavKodu: `${s.kod}-SINAV`,
        sinavGizliAnahtar: 'B1C2D3E4F5A60718293A4B5C6D7E8F90', cevapAnahtarlari: anahtar
      });

      // Mobil okuyucu: temiz profil + kurulum QR'ı
      const ctx = await tarayici.createBrowserContext();
      const mobil = await ctx.newPage();
      await mobil.setViewport({ width: 390, height: 844 });
      const mobilHata = [];
      mobil.on('pageerror', (e) => mobilHata.push(e.message));
      mobil.on('dialog', async (d) => { mobilHata.push('dialog: ' + d.message()); await d.dismiss(); });
      await mobil.goto(`${taban}/optik-mobil.html`, { waitUntil: 'networkidle0' });
      const setupUrl = await mobil.evaluate((y, l) => window.SinavOptikCekirdek.uretKompaktSetupQrPaketi(y, l, location.origin).url, yapi, ogrenciler);
      await mobil.goto(setupUrl, { waitUntil: 'networkidle0' });
      await bekle(800);
      const kurulum = await mobil.evaluate(() => { const d = window.__mobilDurumOku(); return { ogr: d.ogrenciler.length, dy: d.sinavYapisi.dySayisi, test: d.sinavYapisi.testSayisi, kl: d.sinavYapisi.klasikSayisi }; });
      kontrol(`Kurulum QR'ı: ${ogrenciler.length} öğrenci ve yapı telefona geldi`, kurulum.ogr === ogrenciler.length && kurulum.dy === s.yapi.dySayisi && kurulum.test === s.yapi.testSayisi && kurulum.kl === s.yapi.klasikSayisi, JSON.stringify(kurulum));
      const girdi = await mobil.$('#input-mobil-foto');

      for (let i = 0; i < ogrenciler.length; i++) {
        const ogr = ogrenciler[i];
        const plan = kagitPlani(s, ogr, i);
        const sn = SENARYOLAR[i % SENARYOLAR.length];
        const noKod = s.yapi.kimlikModu === 'son3' ? ogr.ogrNo.slice(-3) : ogr.ogrNo.slice(-2);

        // 1) Kağıdı çiz ve elle işaretle
        await cizim.evaluate((yapi2, plan2, noKod2, sn2, tohum) => {
          const C = window.SinavOptikCekirdek;
          const y = C.uretOptikYerlesim(yapi2);
          const kap = document.createElement('div');
          kap.innerHTML = C.uretOptikFormSVG(yapi2, {});
          const svg = kap.firstChild;
          const ns = 'http://www.w3.org/2000/svg';
          let s = 0;
          for (const ch of tohum) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
          const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
          // Elle kodlama: düzensiz, hafif taşan, dönük elips + karalama izi
          const isaretle = (b, tur = 'normal') => {
            if (!b) return;
            const g = document.createElementNS(ns, 'g');
            const renk = tur === 'acik' ? '#5c5c5c' : '#262626';
            const op = tur === 'acik' ? 0.78 : (0.86 + r() * 0.12);
            const rx = b.r * (0.78 + r() * 0.2);
            const ry = b.r * (0.7 + r() * 0.22);
            const e = document.createElementNS(ns, 'ellipse');
            e.setAttribute('cx', b.x + (r() - 0.5) * b.r * 0.3);
            e.setAttribute('cy', b.y + (r() - 0.5) * b.r * 0.3);
            e.setAttribute('rx', rx); e.setAttribute('ry', ry);
            e.setAttribute('transform', `rotate(${Math.round((r() - 0.5) * 60)} ${b.x} ${b.y})`);
            e.setAttribute('fill', renk); e.setAttribute('fill-opacity', op);
            g.appendChild(e);
            const p = document.createElementNS(ns, 'path');
            p.setAttribute('d', `M${b.x - b.r * 0.7},${b.y + b.r * 0.1} q${b.r * 0.6},${-b.r * 0.9} ${b.r * 1.3},${-b.r * 0.2}`);
            p.setAttribute('stroke', renk); p.setAttribute('stroke-width', 1.1); p.setAttribute('fill', 'none'); p.setAttribute('stroke-opacity', op);
            g.appendChild(p);
            svg.appendChild(g);
          };
          const silinti = (b) => {
            const e = document.createElementNS(ns, 'ellipse');
            e.setAttribute('cx', b.x); e.setAttribute('cy', b.y);
            e.setAttribute('rx', b.r * 0.8); e.setAttribute('ry', b.r * 0.6);
            e.setAttribute('fill', '#9a9a9a'); e.setAttribute('fill-opacity', 0.28);
            svg.appendChild(e);
          };
          const tur = plan2.acikKalem ? 'acik' : 'normal';
          isaretle(y.grupBalonlari.find((b) => b.harf === plan2.grup), tur);
          noKod2.split('').forEach((rakam, h) => isaretle(y.kimlikSatirlari[h].balonlar.find((b) => b.rakam === rakam), tur));
          plan2.dy.forEach((c, k) => { if (c) isaretle(y.dySatirlari[k].balonlar.find((b) => b.secenek === c), tur); });
          plan2.test.forEach((c, k) => {
            const sat = y.testSatirlari[k];
            if (c) isaretle(sat.balonlar.find((b) => b.secenek === c), tur);
            if (k === plan2.ciftTest) {
              const diger = sat.balonlar.find((b) => b.secenek !== c);
              isaretle(diger, tur);
            }
            if (k === plan2.silintiTest) {
              const diger = sat.balonlar.find((b) => b.secenek !== c && b.secenek !== 'A') || sat.balonlar[0];
              silinti(diger);
            }
          });
          plan2.klasik.forEach((puan, k) => {
            const sat = y.klasikSatirlari[k];
            if (sat.optikModu === 'onlar_birler') {
              isaretle(sat.onlarBalonlar.find((x) => x.secenek === String(Math.floor(puan / 10))), tur);
              isaretle(sat.birlerBalonlar.find((x) => x.secenek === String(puan % 10)), tur);
            } else {
              isaretle(sat.balonlar.find((x) => x.secenek === String(puan)), tur);
            }
          });

          // 2) Telefon fotoğrafı sahnesi
          const eski = document.getElementById('test-sahne');
          if (eski) eski.remove();
          const sahne = document.createElement('div');
          sahne.id = 'test-sahne';
          sahne.style.cssText = 'position:fixed;left:0;top:0;width:1300px;height:1000px;z-index:99999;background:#77736b;overflow:hidden;';
          const kagit = document.createElement('div');
          const gen = sn2.genislik;
          kagit.style.cssText = `position:absolute;left:${(1300 - gen) / 2}px;top:${(1000 - gen * y.yukseklik / 800) / 2 - 40}px;width:${gen}px;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.5);transform:${sn2.css};transform-origin:center center;${sn2.bulanik ? `filter:blur(${sn2.bulanik}px);` : ''}`;
          kagit.innerHTML = `<div style="padding:24px 26px 8px;font:700 ${Math.round(gen / 45)}px Arial;color:#000;">Sınav Soru ve Cevap Kağıdı</div><div id="form-yer" style="padding:0 26px;"></div><div style="padding:12px 26px 26px;font:${Math.round(gen / 64)}px Arial;color:#111;">1. Aşağıdakilerden hangisi <u><b>yanlıştır</b></u>? A) … B) … C) … D) … E) …<br/>2. TCP üç yollu el sıkışmayı açıklayınız. (10p)</div>`;
          kagit.querySelector('#form-yer').appendChild(svg);
          svg.setAttribute('width', '100%');
          sahne.appendChild(kagit);
          if (sn2.golge) {
            const g = document.createElement('div');
            const k = sn2.golge === 'koyu' ? [0.28, 0.55] : [0.16, 0.38];
            g.style.cssText = `position:absolute;inset:0;background:linear-gradient(115deg,rgba(0,0,0,0) 22%,rgba(0,0,0,${k[0]}) 60%,rgba(0,0,0,${k[1]}) 100%);pointer-events:none;`;
            sahne.appendChild(g);
          }
          document.body.appendChild(sahne);
        }, s.yapi, plan, noKod, sn, s.kod + ogr.ogrNo);

        const dosya = path.join(geciciKlasor, `${s.kod}-${String(i + 1).padStart(2, '0')}.jpg`);
        const el = await cizim.$('#test-sahne');
        await el.screenshot({ path: dosya, type: 'jpeg', quality: 72 });

        // 3) Mobil uygulamaya fotoğrafı ver
        const onceSayi = await mobil.evaluate(() => window.__mobilDurumOku().okumaSonuclari.length);
        await girdi.uploadFile(dosya);
        let kayit = null;
        for (let t = 0; t < 30 && !kayit; t++) {
          await bekle(200);
          kayit = await mobil.evaluate((n) => {
            const d = window.__mobilDurumOku();
            if (d.okumaSonuclari.length <= n) return null;
            const k = d.okumaSonuclari.slice().sort((a, b) => (b._kayitMs || 0) - (a._kayitMs || 0))[0];
            return {
              grup: k.grup, okunanNoKod: k.okunanNoKod, ogrNo: k.ogrNo, adSoyad: k.adSoyad, bekliyor: Boolean(k.kimlikEslesmeBekliyor),
              aday: (k.cakisanAdaylar || []).map((a) => a.ogrNo),
              dy: (k.dyDetay || []).map((x) => x.verilen || null), test: (k.testDetay || []).map((x) => x.verilen || null),
              klasik: (k.klasikDetay || []).map((x) => x.verilenPuan),
              kuyruk: (k.incelemeKuyrugu || []).map((q) => `${q.alan || ''}|${q.soruNo || ''}|${q.detay || ''}`)
            };
          }, onceSayi);
        }
        const uyari = await mobil.$eval('#m-uyari', (e) => e.textContent);
        toplam.kagit++;
        const etiket = `[${s.kod} #${i + 1} ${ogr.adSoyad} | ${sn.ad}${plan.acikKalem ? ' | açık kalem' : ''}]`;
        if (!kayit) { kontrol(`${etiket} kağıt okundu ve kaydedildi`, false, uyari); continue; }

        // Satır satır karşılaştırma (çift işaret beklenen değeri 'ÇİFT')
        const beklenenTest = plan.test.map((c, k) => (k === plan.ciftTest ? 'ÇİFT' : c));
        const kuyrukMetin = kayit.kuyruk.join(' ');
        const satirKontrol = (alan, beklenen, okunan) => {
          beklenen.forEach((b, k) => {
            toplam.satir++;
            const o = okunan[k] === undefined ? null : okunan[k];
            if (String(o) === String(b)) { toplam.dogru++; return; }
            const isaretli = new RegExp(`(^|\\D)${k + 1}(\\D|$)`).test(kuyrukMetin) || o === 'ÇİFT';
            if (isaretli) { toplam.isaretli++; incelemeDetay.push(`${etiket} ${alan} ${k + 1}: beklenen ${b}, okunan ${o} | ${kuyrukMetin.slice(0, 160)}`); }
            else { toplam.sessiz++; sessizDetay.push(`${etiket} ${alan} ${k + 1}: beklenen ${b}, okunan ${o}`); }
          });
        };
        satirKontrol('D/Y', plan.dy, kayit.dy);
        satirKontrol('Test', beklenenTest, kayit.test);
        satirKontrol('Klasik', plan.klasik, kayit.klasik);

        toplam.kimlikKagit++;
        const grupOk = kayit.grup === plan.grup;
        if (grupOk) toplam.grupDogru++;
        const noOk = kayit.okunanNoKod === noKod;
        const ayniSonluSayi = ogrenciler.filter((o) => o.ogrNo.endsWith(noKod)).length;
        let kimlikOk;
        if (ayniSonluSayi > 1) kimlikOk = noOk && kayit.bekliyor && kayit.aday.includes(ogr.ogrNo); // çakışma: öğretmene sorulmalı, yanlış öğrenciye yazılmamalı
        else kimlikOk = noOk && kayit.ogrNo === ogr.ogrNo;
        if (kimlikOk) toplam.kimlikDogru++;
        kontrol(`${etiket} kitapçık ${plan.grup}`, grupOk, `okunan ${kayit.grup}`);
        kontrol(`${etiket} kimlik ${ayniSonluSayi > 1 ? '(çakışan son hane → seçim bekler)' : ogr.ogrNo}`, kimlikOk, `okunan no ${kayit.okunanNoKod}, kayıt ${kayit.ogrNo} ${kayit.adSoyad}${kayit.bekliyor ? ' (bekliyor)' : ''}`);
        if (process.env.AYRINTI && kayit.kuyruk.length) console.log('     inceleme:', kayit.kuyruk.slice(0, 4).join(' ; '));
        if (!process.env.DUMP) fs.unlinkSync(dosya);
      }
      kontrol(`${s.kod}: mobil uygulamada JS hatası/uyarı penceresi yok`, mobilHata.length === 0, mobilHata.join(' | '));
      await ctx.close();
    }

    const oran = toplam.satir ? (100 * toplam.dogru / toplam.satir) : 0;
    console.log('\n=== OKUMA BAŞARISI ===');
    console.log(`Kağıt: ${toplam.kagit} · Balon satırı: ${toplam.satir}`);
    console.log(`Doğru okunan satır: ${toplam.dogru} (%${oran.toFixed(2)})`);
    console.log(`Yanlış ama inceleme kuyruğuna düşen: ${toplam.isaretli}`);
    console.log(`SESSİZ HATA (yanlış ve işaretsiz): ${toplam.sessiz}`);
    console.log(`Kitapçık doğru: ${toplam.grupDogru}/${toplam.kimlikKagit} · Kimlik doğru/uygun: ${toplam.kimlikDogru}/${toplam.kimlikKagit}`);
    sessizDetay.slice(0, 20).forEach((d) => console.log('   ✗ SESSİZ ' + d));
    incelemeDetay.slice(0, 20).forEach((d) => console.log('   ! İNCELEME ' + d));
    kontrol('Sessiz hata sıfır', toplam.sessiz === 0, `${toplam.sessiz} satır`);
    kontrol('Balon satırı okuma başarısı %100', toplam.dogru === toplam.satir, `%${oran.toFixed(2)}`);
  } finally {
    await tarayici.close();
    server.close();
  }
  console.log(`\n=== ${gecen} KONTROL GEÇTİ · ${hata} HATA ===`);
  process.exit(hata === 0 ? 0 : 1);
})().catch((e) => { console.error('TEST HATASI:', e); process.exit(1); });
