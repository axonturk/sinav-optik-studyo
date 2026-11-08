/* ==========================================================================
   GERÇEK BASILI FORM OKUMA TESTİ (Chrome + puppeteer-core)
   1) Uygulamanın BASTIĞI optik form (SVG) tarayıcıda çizilir, öğrenci kalemle doldurmuş gibi işaretlenir,
      sayfa perspektifli/eğik/ters, gölgeli ve bulanık "fotoğraf" haline getirilir, ekran görüntüsü okuma motoruna verilir.
      Beklenen: kitapçık, öğrenci no, D/Y, test, klasik puanı birebir okunur; form yoksa "Form bulunamadı".
   2) Standart (hazır baskı) cevap kağıdı simülasyonu: ızgara + oval balonlar + kimlik ızgarası (dikkat dağıtıcı),
      eğik fotoğraf -> okuma doğru mu.
   Çalıştırma: node omr-gercek-form-test.js   (Sıfır hata beklenir)
   ========================================================================== */
'use strict';
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { baslatSunucu } = require('./server.js');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  .find((p) => fs.existsSync(p));
let gecen = 0;
let hata = 0;
function kontrol(ad, kosul, detay = '') {
  if (kosul) gecen++; else hata++;
  if (!kosul || process.env.AYRINTI) console.log(`  ${kosul ? '✓' : '✗ HATA'} ${ad}${detay ? ` — ${detay}` : ''}`);
}

const SENARYOLAR = [
  { ad: 'düz (kameraya paralel)', css: 'none', golge: false, bulanik: 0 },
  { ad: 'eğik -4° + perspektif', css: 'perspective(1100px) rotateX(16deg) rotateY(-9deg) rotateZ(-4deg)', golge: true, bulanik: 0.5 },
  { ad: 'ters çevrilmiş (180°) + perspektif', css: 'perspective(1100px) rotateX(10deg) rotateZ(180deg)', golge: true, bulanik: 0.4 },
  { ad: 'yan çevrilmiş (90°)', css: 'rotateZ(90deg)', golge: false, bulanik: 0.3 }
];

const YAPILAR = [
  {
    ad: 'varsayılan (10 D/Y + 10 Test + 2 Klasik, son 2 hane)',
    yapi: { dySayisi: 10, dySoruPuan: 2, testSayisi: 10, testSoruPuan: 6, sikSayisi: 5, klasikSayisi: 2, klasikSoruPuan: 10, kimlikModu: 'son2', haneSayisi: 2 },
    grup: 'C', ogrNo: '2024101042'
  },
  {
    ad: 'yoğun (25 D/Y + 35 Test, 4 şık, 5 klasik 1-puan hassasiyet, tam no 8 hane)',
    yapi: { dySayisi: 25, dySoruPuan: 1, testSayisi: 35, testSoruPuan: 1.5, sikSayisi: 4, klasikSayisi: 5, klasikSoruPuan: 15, klasikOptikModu: 'onlar_birler', kimlikModu: 'tam', haneSayisi: 8 },
    grup: 'B', ogrNo: '20241019'
  },
  {
    ad: 'küçük (5 D/Y + 8 Test, son 3 hane, klasik yok)',
    yapi: { dySayisi: 5, dySoruPuan: 4, testSayisi: 8, testSoruPuan: 10, sikSayisi: 5, klasikSayisi: 0, kimlikModu: 'son3', haneSayisi: 3 },
    grup: 'D', ogrNo: '2024101987'
  }
];

function planUret(yapi) {
  const dy = Array.from({ length: yapi.dySayisi }, (_, i) => ((i * 7 + 3) % 5 < 2 ? 'Y' : 'D'));
  const harfler = ['A', 'B', 'C', 'D', 'E'].slice(0, yapi.sikSayisi);
  const test = Array.from({ length: yapi.testSayisi }, (_, i) => harfler[(i * 3 + (i >> 1)) % harfler.length]);
  const klasik = Array.from({ length: yapi.klasikSayisi }, (_, i) => (yapi.klasikOptikModu === 'onlar_birler' ? [7, 13, 9, 10, 4][i % 5] : [10, 8, 6, 4, 2][i % 5]));
  return { dy, test, klasik };
}


/* Düzeltme regresyonları (Node, tarayıcısız): boş kitapçık grubu uyarısı + son 3 hane eşleşmesi */
function mantikTestleri() {
  console.log('0) Mantık düzeltmeleri: boş kitapçık grubu uyarısı, son 3 hane eşleşmesi');
  const C = require('./guvenlik-ve-veri.js');
  const yapi = { dySayisi: 2, testSayisi: 2, sikSayisi: 5, klasikSayisi: 0, kimlikModu: 'son3', haneSayisi: 3, cevapAnahtarlari: { A: { dy: ['D', 'Y'], test: ['A', 'B'], klasik: [] } } };
  const harita = C.hesaplaKanonikBalonHaritasi(yapi);
  const W = harita.genislik;
  const H = harita.yukseklik;
  const px = new Uint8ClampedArray(W * H * 4).fill(248);
  const doldur = (b) => {
    for (let dy = -Math.ceil(b.r); dy <= Math.ceil(b.r); dy++) for (let dx = -Math.ceil(b.r); dx <= Math.ceil(b.r); dx++) {
      if (dx * dx + dy * dy <= Math.pow(b.r * 0.85, 2)) { const p = (Math.round(b.y + dy) * W + Math.round(b.x + dx)) * 4; px[p] = px[p + 1] = px[p + 2] = 15; }
    }
  };
  // Grup işaretlenmedi; no = 987 (yüzler 9, onlar 8, birler 7)
  ['9', '8', '7'].forEach((r, i) => doldur(harita.kimlikSatirlari[i].balonlar.find((b) => b.rakam === r)));
  doldur(harita.dySatirlari[0].balonlar.find((b) => b.secenek === 'D'));
  doldur(harita.dySatirlari[1].balonlar.find((b) => b.secenek === 'Y'));
  doldur(harita.testSatirlari[0].balonlar.find((b) => b.secenek === 'A'));
  doldur(harita.testSatirlari[1].balonlar.find((b) => b.secenek === 'B'));
  const M = 26;
  const koseler = { tl: { x: M, y: M }, tr: { x: W - M, y: M }, bl: { x: M, y: H - M }, br: { x: W - M, y: H - M } };
  const ogrenciler = [{ ogrNo: '2024101987', adSoyad: 'Dokuz Seksen Yedi' }, { ogrNo: '2024101087', adSoyad: 'Sifir Seksen Yedi' }];
  const o = C.okuOptikFormImageData({ width: W, height: H, data: px }, yapi, ogrenciler, koseler);
  kontrol('Boş bırakılan kitapçık grubu inceleme kuyruğuna uyarı düşer', o.incelemeKuyrugu.some((q) => q.alan === 'Kitapçık Grubu' && /işaretlenmemiş/.test(q.detay)) && o.supheliMi === true, JSON.stringify(o.incelemeKuyrugu));
  kontrol('Son 3 hane: 987 numarası yalnız 2024101987 ile eşleşir (087 ile karışmaz)', o.okunanNoKod === '987' && o.cakisanAdaylar.length === 1 && o.ogrNo === '2024101987', `${o.okunanNoKod} / ${o.cakisanAdaylar.length} aday / ${o.ogrNo}`);
}

async function gercekFormTestleri(sayfa) {
  console.log('1) Gerçek basılı form -> fotoğraf -> okuma');
  for (const yp of YAPILAR) {
    const plan = planUret(yp.yapi);
    yp.yapi.cevapAnahtarlari = { [yp.grup]: { dy: plan.dy, test: plan.test, klasik: [] }, A: { dy: plan.dy, test: plan.test, klasik: [] } };
    for (const sn of SENARYOLAR) {
      const ham = await sayfa.evaluate(async (yapi, grup, ogrNo, plan2, sn2) => {
        const C = window.SinavOptikCekirdek;
        const y = C.uretOptikYerlesim(yapi);
        // 1) Basılan form (SVG): öğrenci kimliği + grup ön-baskılı doldurulur
        const svgMetin = C.uretOptikFormSVG(yapi, { grup, ogrNoKod: ogrNo });
        const kap = document.createElement('div');
        kap.innerHTML = svgMetin;
        const svg = kap.firstChild;
        const ns = 'http://www.w3.org/2000/svg';
        const isaretle = (b, oran) => {
          const c = document.createElementNS(ns, 'circle');
          c.setAttribute('cx', b.x + (Math.sin(b.x * 3.1) * 0.6));
          c.setAttribute('cy', b.y + (Math.cos(b.y * 2.3) * 0.6));
          c.setAttribute('r', String(b.r * oran));
          c.setAttribute('fill', '#2b2b2b');
          svg.appendChild(c);
        };
        plan2.dy.forEach((cev, i) => { const b = y.dySatirlari[i].balonlar.find((x) => x.secenek === cev); isaretle(b, 0.86); });
        plan2.test.forEach((cev, i) => { const b = y.testSatirlari[i].balonlar.find((x) => x.secenek === cev); isaretle(b, 0.86); });
        plan2.klasik.forEach((puan, k) => {
          const sat = y.klasikSatirlari[k];
          if (sat.optikModu === 'onlar_birler') {
            isaretle(sat.onlarBalonlar.find((x) => x.secenek === String(Math.floor(puan / 10))), 0.86);
            isaretle(sat.birlerBalonlar.find((x) => x.secenek === String(puan % 10)), 0.86);
          } else {
            isaretle(sat.balonlar.find((x) => x.secenek === String(puan)), 0.86);
          }
        });

        // 2) "Fotoğraf" sahnesi
        const sahne = document.createElement('div');
        sahne.id = 'test-sahne';
        sahne.style.cssText = 'position:fixed;left:0;top:0;width:1300px;height:1000px;z-index:99999;background:#7d7a73;overflow:hidden;';
        const kagit = document.createElement('div');
        const genislik = sn2.css.includes('rotateZ(90deg)') && sn2.css.length < 20 ? 780 : 1000;
        kagit.style.cssText = `position:absolute;left:${(1300 - genislik) / 2}px;top:${(1000 - genislik * y.yukseklik / 800) / 2}px;width:${genislik}px;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.5);transform:${sn2.css === 'none' ? 'none' : sn2.css};transform-origin:center center;${sn2.bulanik ? `filter:blur(${sn2.bulanik}px);` : ''}`;
        // Kağıt: formun etrafında 40px beyaz kenar + üstte/altta sınav metni (dikkat dağıtıcı)
        kagit.innerHTML = `<div style="padding:30px 30px 10px;font:700 24px Arial;color:#000;background:#fff;">BİL304 — Vize Sınavı (${grup} Kitapçığı) Soru ve Cevap Kağıdı</div><div id="form-yer" style="padding:0 30px;background:#fff;"></div><div style="padding:14px 30px 30px;font:16px Arial;color:#111;background:#fff;">1. Aşağıdaki ifadelerden hangisi doğrudur? A) Bir B) İki C) Üç D) Dört E) Beş<br/>2. Sıfır güven mimarisinde ... (10p)</div>`;
        kagit.querySelector('#form-yer').appendChild(svg);
        sahne.appendChild(kagit);
        if (sn2.golge) {
          const g = document.createElement('div');
          g.style.cssText = 'position:absolute;inset:0;background:linear-gradient(115deg,rgba(0,0,0,0) 20%,rgba(0,0,0,.18) 60%,rgba(0,0,0,.42) 100%);pointer-events:none;';
          sahne.appendChild(g);
        }
        document.body.appendChild(sahne);
        return { yukseklik: y.yukseklik };
      }, yp.yapi, yp.grup, yp.ogrNo, plan, sn);

      const el = await sayfa.$('#test-sahne');
      const png = await el.screenshot({ encoding: 'base64', type: 'png' });
      if (yp === YAPILAR[0] && sn === SENARYOLAR[1]) { fs.mkdirSync('test-artifacts', { recursive: true }); fs.writeFileSync('test-artifacts/omr-foto-uygulama.png', Buffer.from(png, 'base64')); }
      if (process.env.DUMP) fs.writeFileSync(`dump-${yp.grup}-${SENARYOLAR.indexOf(sn)}.png`, Buffer.from(png, 'base64'));
      const sonuc = await sayfa.evaluate(async (b64, yapi, ogrenciler) => {
        document.getElementById('test-sahne').remove();
        const C = window.SinavOptikCekirdek;
        const img = new Image();
        await new Promise((res) => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const cx = cv.getContext('2d');
        cx.drawImage(img, 0, 0);
        const imgData = cx.getImageData(0, 0, cv.width, cv.height);
        const t0 = performance.now();
        const o = C.okuOptikFormImageData(imgData, yapi, ogrenciler);
        const sure = Math.round(performance.now() - t0);
        if (!o.formBulundu) return { formBulundu: false, mesaj: o.mesaj, sure };
        return {
          formBulundu: true, sure,
          grup: o.grup, okunanNoKod: o.okunanNoKod, ogrNo: o.ogrNo,
          dy: o.dyDetay.map((d) => d.verilen), test: o.testDetay.map((d) => d.verilen),
          klasik: o.klasikDetay.map((k) => k.verilenPuan), supheli: o.supheliMi, kuyruk: o.incelemeKuyrugu.length,
          toplam: o.toplamPuan
        };
      }, png, yp.yapi, [
        { ogrNo: '2024101042', adSoyad: 'Deneme Bir' }, { ogrNo: '2024101987', adSoyad: 'Deneme Iki' }, { ogrNo: '20241019', adSoyad: 'Deneme Uc' }
      ]);

      const etiket = `[${yp.ad.split(' (')[0]} | ${sn.ad}]`;
      if (!sonuc.formBulundu) { kontrol(`${etiket} form bulundu`, false, sonuc.mesaj); continue; }
      const noBeklenen = yp.yapi.kimlikModu === 'tam' ? yp.ogrNo.slice(-yp.yapi.haneSayisi).padStart(yp.yapi.haneSayisi, '0') : (yp.yapi.kimlikModu === 'son3' ? yp.ogrNo.slice(-3) : yp.ogrNo.slice(-2));
      const dyHata = plan.dy.filter((c, i) => sonuc.dy[i] !== c);
      const tHata = plan.test.filter((c, i) => sonuc.test[i] !== c);
      kontrol(`${etiket} kitapçık ${yp.grup}`, sonuc.grup === yp.grup, `okunan ${sonuc.grup}`);
      kontrol(`${etiket} öğrenci no ${noBeklenen}`, sonuc.okunanNoKod === noBeklenen, `okunan ${sonuc.okunanNoKod}`);
      kontrol(`${etiket} D/Y ${plan.dy.length} soru birebir`, dyHata.length === 0, `${dyHata.length} hatalı: ${JSON.stringify(sonuc.dy)}`);
      kontrol(`${etiket} Test ${plan.test.length} soru birebir`, tHata.length === 0, `${tHata.length} hatalı: ${JSON.stringify(sonuc.test)} beklenen ${JSON.stringify(plan.test)}`);
      kontrol(`${etiket} klasik puanlar`, JSON.stringify(sonuc.klasik) === JSON.stringify(plan.klasik), `okunan ${JSON.stringify(sonuc.klasik)} beklenen ${JSON.stringify(plan.klasik)}`);
    }
  }

  // Form yok -> yanlış puan üretme, "Form bulunamadı" ver
  const bos = await sayfa.evaluate(() => {
    const C = window.SinavOptikCekirdek;
    const w = 1000, h = 700;
    const d = new Uint8ClampedArray(w * h * 4).fill(235);
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
    // dikkat dağıtıcı: koyu çizgiler ve kareler
    for (let y = 100; y < 600; y += 40) for (let x = 100; x < 900; x++) { const p = (y * w + x) * 4; d[p] = d[p + 1] = d[p + 2] = 30; }
    const o = C.okuOptikFormImageData({ width: w, height: h, data: d }, { dySayisi: 10, testSayisi: 10, sikSayisi: 5, klasikSayisi: 0, kimlikModu: 'son2' }, []);
    return { formBulundu: o.formBulundu, hata: o.hata, mesaj: o.mesaj };
  });
  kontrol('Form olmayan görüntüde "Form bulunamadı" döner (yanlış puan üretilmez)', bos.formBulundu === false && bos.hata === 'FORM_BULUNAMADI', JSON.stringify(bos));
}

async function standartFormTestleri(sayfa) {
  console.log('2) Standart (hazır baskı) optik form okuma');
  const durumlar = [
    { ad: '50 soru, 5 şık, 2 sütun (sütun sıralı), kimlik ızgarası var, eğim 3°', soru: 50, sik: 5, sutun: 2, siralama: 'sutun', egim: 3, kimlik: true },
    { ad: '40 soru, 4 şık, 2 sütun (satır sıralı), eğim -2.5°', soru: 40, sik: 4, sutun: 2, siralama: 'satir', egim: -2.5, kimlik: false },
    { ad: '25 soru, 5 şık, tek sütun, 90° yan çevrilmiş', soru: 25, sik: 5, sutun: 1, siralama: 'sutun', egim: 0, kimlik: false, don90: true },
    { ad: '100 soru, 5 şık, 4 sütun, eğim 1.5°', soru: 100, sik: 5, sutun: 4, siralama: 'sutun', egim: 1.5, kimlik: false }
  ];
  for (const d of durumlar) {
    const r = await sayfa.evaluate(async (d2) => {
      const C = window.SinavOptikCekirdek;
      const W = 1240;
      const H = 1754;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#e9e6df'; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate((d2.egim * Math.PI) / 180 + (d2.don90 ? Math.PI / 2 : 0));
      if (d2.don90) ctx.scale(0.68, 0.68);
      ctx.translate(-W / 2, -H / 2);
      ctx.fillStyle = '#fff'; ctx.fillRect(60, 60, W - 120, H - 120);
      ctx.fillStyle = '#111'; ctx.font = 'bold 30px Arial'; ctx.fillText('STANDART CEVAP KAĞIDI', 90, 110);
      ctx.font = '16px Arial'; ctx.fillText('Adı Soyadı: ......................   Sınıfı: ........', 90, 150);
      // Kimlik ızgarası (dikkat dağıtıcı: 8 sütun x 10 satır, 8 balon/satır)
      let y0 = 200;
      const harfler = ['A', 'B', 'C', 'D', 'E'].slice(0, d2.sik);
      const rx = 11; const ry = 8;
      const balonCiz = (x, y, harf, dolu) => {
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.stroke();
        if (dolu) { ctx.fillStyle = '#1c1c1c'; ctx.beginPath(); ctx.ellipse(x, y, rx * 0.88, ry * 0.88, 0, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillStyle = '#555'; ctx.font = '11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(harf, x, y + 0.5); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
      };
      if (d2.kimlik) {
        for (let satir = 0; satir < 10; satir++) for (let s = 0; s < 8; s++) balonCiz(120 + s * 34, y0 + satir * 28, String(satir), s === 3 && satir === 4);
        y0 += 310;
      }
      // Cevap ızgarası
      const satirSay = Math.ceil(d2.soru / d2.sutun);
      const sutunGen = (W - 240) / d2.sutun;
      const cevaplar = [];
      for (let q = 0; q < d2.soru; q++) cevaplar.push(harfler[(q * 7 + (q >> 2)) % harfler.length]);
      for (let q = 0; q < d2.soru; q++) {
        let sutun; let satir;
        if (d2.siralama === 'sutun') { sutun = Math.floor(q / satirSay); satir = q % satirSay; } else { satir = Math.floor(q / d2.sutun); sutun = q % d2.sutun; }
        const bx = 130 + sutun * sutunGen;
        const by = y0 + satir * 30;
        ctx.fillStyle = '#111'; ctx.font = '13px Arial'; ctx.textAlign = 'right'; ctx.fillText(String(q + 1), bx - 14, by + 4); ctx.textAlign = 'left';
        harfler.forEach((h, i) => balonCiz(bx + i * 32, by, h, h === cevaplar[q]));
      }
      ctx.restore();
      // Gölge
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const pngUrl = cv.toDataURL('image/png');
      const imgData = ctx.getImageData(0, 0, W, H);
      // Anahtar: çift sorular doğru, tek sorular bilerek bir sonraki harf (yanlış)
      const anahtar = cevaplar.map((c, i) => (i % 2 === 0 ? c : harfler[(harfler.indexOf(c) + 1) % harfler.length]));
      const t0 = performance.now();
      const o = C.okuStandartOptikFormImageData(imgData, { soruSayisi: d2.soru, sikSayisi: d2.sik, siralama: d2.siralama, anahtar });
      const sure = Math.round(performance.now() - t0);
      if (!o.formBulundu) return { formBulundu: false, mesaj: o.mesaj, sure };
      const yanlisSoru = [];
      o.sorular.forEach((s, i) => { if (s.verilen !== cevaplar[i]) yanlisSoru.push(`${i + 1}:${s.verilen}/${cevaplar[i]}`); });
      return { pngUrl, formBulundu: true, sure, yanlisSoru: yanlisSoru.slice(0, 8), yanlisAdet: yanlisSoru.length, dogru: o.dogru, yanlis: o.yanlis, bos: o.bos, puan: o.toplamPuan, bulunanSatir: o.bulunanSoruSatiri, balon: o.balonSayisi, boyut: o.balonBoyut, sutun: o.sutunSayisi, egim: o.egimDerece, beklenenDogru: Math.ceil(d2.soru / 2) };
    }, d);
    if (r.pngUrl && d === durumlar[0]) { fs.mkdirSync('test-artifacts', { recursive: true }); fs.writeFileSync('test-artifacts/omr-foto-standart.png', Buffer.from(r.pngUrl.split(',')[1], 'base64')); }
    if (!r.formBulundu) { kontrol(`[${d.ad}] okundu`, false, r.mesaj); continue; }
    kontrol(`[${d.ad}] ${d.soru} sorunun işaretli şıkkı birebir okundu (${r.sure} ms)`, r.yanlisAdet === 0, `${r.yanlisAdet} hatalı ${r.yanlisSoru.join(', ')} | bulunan satır ${r.bulunanSatir}, sütun ${r.sutun}, balon ${r.balon}, boyut ${JSON.stringify(r.boyut)}, eğim ${r.egim}`);
    kontrol(`[${d.ad}] anahtara göre doğru sayısı`, r.dogru === r.beklenenDogru && r.yanlis === d.soru - r.beklenenDogru && r.bos === 0, `doğru ${r.dogru}/${r.beklenenDogru}, yanlış ${r.yanlis}, boş ${r.bos}, puan ${r.puan}`);
  }
}

async function arayuzTestleri(tarayici, taban) {
  console.log('3) Arayüz: mobil uygulama ve stüdyo — fotoğraf yükleme');
  const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
  const foto = require('path').resolve('test-artifacts/omr-foto-uygulama.png');
  const stdFoto = require('path').resolve('test-artifacts/omr-foto-standart.png');
  // boş (formsuz) fotoğraf
  const bosPng = require('path').resolve('test-artifacts/omr-foto-bos.png');
  const bosSayfa = await tarayici.newPage();
  await bosSayfa.setViewport({ width: 800, height: 600 });
  await bosSayfa.setContent('<body style="margin:0;background:#ddd"><div style="width:800px;height:600px;background:repeating-linear-gradient(0deg,#ddd 0 38px,#222 38px 40px)"></div></body>');
  fs.writeFileSync(bosPng, await bosSayfa.screenshot({ type: 'png' }));
  await bosSayfa.close();

  // ---- Mobil uygulama
  const mobil = await tarayici.newPage();
  const hatalar = [];
  mobil.on('pageerror', (e) => hatalar.push('pageerror: ' + e.message));
  mobil.on('dialog', async (d) => { hatalar.push('dialog: ' + d.message()); await d.dismiss(); });
  await mobil.goto(taban + '/optik-mobil.html', { waitUntil: 'networkidle0' });
  const sayac = () => mobil.$eval('#mobil-alt-sayac', (e) => Number(e.textContent));
  const once = await sayac();
  const girdi = await mobil.$('#input-mobil-foto');
  await girdi.uploadFile(bosPng);
  await bekle(1200);
  const uyari = await mobil.$eval('#m-uyari', (e) => ({ gizli: e.hidden, metin: e.textContent }));
  kontrol('Mobil: formsuz fotoğrafta "Form bulunamadı" uyarısı görünür', !uyari.gizli && /Form bulunamadı/.test(uyari.metin), uyari.metin);
  kontrol('Mobil: formsuz fotoğraf kayıt oluşturmaz', (await sayac()) === once);
  await girdi.uploadFile(foto);
  await bekle(2500);
  const sonra = await sayac();
  const fis = await mobil.$eval('#mobil-sonuc-icerik', (e) => e.textContent.replace(/\s+/g, ' '));
  kontrol('Mobil: gerçek form fotoğrafı (eğik+perspektif) okundu ve kaydedildi', sonra === once + 1, fis.slice(0, 160));
  kontrol('Mobil: fişte kitapçık C ve öğrenci eşleşmesi görünür', /Kitapçık: C/.test(fis), fis.slice(0, 160));
  // Standart form
  await mobil.select('#m-form-turu', 'standart');
  await mobil.$eval('#m-std-soru', (e) => { e.value = '50'; });
  await mobil.$eval('#m-std-anahtar', (e) => { e.value = 'ABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDE'; });
  await mobil.$eval('#m-std-ogrno', (e) => { e.value = '2024101042'; });
  const onceStd = await sayac();
  await girdi.uploadFile(stdFoto);
  await bekle(3000);
  const fisStd = await mobil.$eval('#mobil-sonuc-icerik', (e) => e.textContent.replace(/\s+/g, ' '));
  kontrol('Mobil: standart optik form fotoğrafı okundu ve kaydedildi', (await sayac()) === onceStd + 1 && /Standart form · 50 soru/.test(fisStd), fisStd.slice(0, 200));
  await girdi.uploadFile(bosPng);
  await bekle(1200);
  const uyari2 = await mobil.$eval('#m-uyari', (e) => ({ gizli: e.hidden, metin: e.textContent }));
  kontrol('Mobil: standart modda formsuz fotoğraf uyarı verir', !uyari2.gizli && /bulunamadı|çözülemedi|Yeterli/i.test(uyari2.metin), uyari2.metin);
  kontrol('Mobil: JS hatası/uyarı penceresi yok', hatalar.length === 0, hatalar.join(' | '));
  await mobil.close();

  // ---- Stüdyo
  const st = await tarayici.newPage();
  const stHata = [];
  st.on('pageerror', (e) => stHata.push('pageerror: ' + e.message));
  st.on('dialog', async (d) => { stHata.push('dialog: ' + d.message()); await d.dismiss(); });
  await st.goto(taban + '/index.html', { waitUntil: 'networkidle0' });
  await st.evaluate(() => document.querySelector('[data-sekme="sekme-omr"]').click());
  await bekle(300);
  const stGirdi = await st.$('#input-omr-foto');
  const stOnce = await st.$eval('#rozet-okunan-kagit', (e) => Number(e.textContent));
  await stGirdi.uploadFile(bosPng);
  await bekle(1200);
  const stUyari = await st.$eval('#omr-uyari-kutu', (e) => ({ gizli: e.hidden, metin: e.textContent }));
  kontrol('Stüdyo: formsuz fotoğrafta "Form bulunamadı" uyarısı', !stUyari.gizli && /Form bulunamadı/.test(stUyari.metin), stUyari.metin);
  kontrol('Stüdyo: formsuz fotoğraf kayıt oluşturmaz', (await st.$eval('#rozet-okunan-kagit', (e) => Number(e.textContent))) === stOnce);
  await st.select('#omr-form-turu', 'standart');
  await st.$eval('#omr-std-soru', (e) => { e.value = '50'; });
  await st.$eval('#omr-std-anahtar', (e) => { e.value = 'ABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDE'; });
  await stGirdi.uploadFile(stdFoto);
  await bekle(3000);
  const stSonra = await st.$eval('#rozet-okunan-kagit', (e) => Number(e.textContent));
  const stFis = await st.$eval('#kutu-son-okunan-detay', (e) => e.textContent.replace(/\s+/g, ' '));
  kontrol('Stüdyo: standart optik form fotoğrafı okundu ve listeye eklendi', stSonra === stOnce + 1, stFis.slice(0, 200));
  kontrol('Stüdyo: JS hatası/uyarı penceresi yok', stHata.length === 0, stHata.join(' | '));
  await st.close();
}

(async () => {
  console.log('=== GERÇEK BASILI FORM + STANDART FORM OKUMA TESTİ ===');
  const server = await baslatSunucu(0);
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const sayfa = await tarayici.newPage();
  await sayfa.setViewport({ width: 1300, height: 1000 });
  const hatalar = [];
  sayfa.on('pageerror', (e) => hatalar.push(e.message));
  try {
    await sayfa.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'networkidle0' });
    mantikTestleri();
    await gercekFormTestleri(sayfa);
    await standartFormTestleri(sayfa);
    await arayuzTestleri(tarayici, `http://127.0.0.1:${server.address().port}`);
    kontrol('Sayfada JS hatası yok', hatalar.length === 0, hatalar.join(' | '));
  } finally {
    await tarayici.close();
    server.close();
  }
  console.log(`\n=== ${gecen} KONTROL GEÇTİ · ${hata} HATA ===`);
  process.exit(hata ? 1 : 0);
})().catch((e) => { console.error('TEST ÇÖKTÜ:', e); process.exit(2); });
