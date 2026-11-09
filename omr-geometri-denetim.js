/* Basılan optik formun gerçek DOM balon konumları ile OMR kanonik haritasını (800x420) karşılaştırır. Salt-okunur denetim. */
'use strict';
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { baslatSunucu } = require('./server.js');
const C = require('./guvenlik-ve-veri.js');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
(async () => {
  const server = await baslatSunucu(0);
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const s = await b.newPage();
  await s.setViewport({ width: 1400, height: 1000 });
  await s.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'networkidle0' });
  const olcum = await s.evaluate(() => {
    const cerceve = document.querySelector('#a4-onizleme-sahne .optik-cerceve');
    if (!cerceve) return { hata: 'optik-cerceve yok' };
    const r = cerceve.getBoundingClientRect();
    const fid = Array.from(cerceve.querySelectorAll('.fiducial-kare')).map((f) => { const q = f.getBoundingClientRect(); return { sinif: f.getAttribute('class') || '', cx: q.x + q.width / 2 - r.x, cy: q.y + q.height / 2 - r.y }; });
    const balonlar = Array.from(cerceve.querySelectorAll('.optik-balon')).map((o) => { const q = o.getBoundingClientRect(); return { t: o.textContent.trim(), cx: q.x + q.width / 2 - r.x, cy: q.y + q.height / 2 - r.y, w: q.width }; });
    return { w: r.width, h: r.height, fid, n: balonlar.length, balonlar: balonlar.slice(0, 60) };
  });
  console.log('Çerçeve boyutu (px):', Math.round(olcum.w), 'x', Math.round(olcum.h), '| oran:', (olcum.w / olcum.h).toFixed(2), '(kanonik 800x420 oran:', (800 / 420).toFixed(2) + ')');
  console.log('Fiducial merkezleri:', JSON.stringify(olcum.fid.map((f) => ({ k: f.sinif.split('fiducial-')[2], x: Math.round(f.cx), y: Math.round(f.cy) }))));
  console.log('Toplam balon:', olcum.n);
  // Haritayla karşılaştır: DOM merkezlerini kanonik koordinata ölçekle (fiducial merkezleri 26,26 - 774,harita.yukseklik-26)
  const harita = C.hesaplaKanonikBalonHaritasi({ dySayisi: 10, testSayisi: 10, sikSayisi: 5, klasikSayisi: 2, kimlikModu: 'son2', klasikSoruPuan: 10 });
  const tl = olcum.fid.find((f) => /tl/.test(f.sinif)); const br = olcum.fid.find((f) => /br/.test(f.sinif));
  const sx = (harita.genislik - 26 - 26) / (br.cx - tl.cx); const sy = (harita.yukseklik - 26 - 26) / (br.cy - tl.cy);
  const hepsi = [];
  harita.grupBalonlari.forEach((x) => hepsi.push({ ad: 'grup ' + x.harf, x: x.x, y: x.y }));
  harita.kimlikSatirlari.forEach((sat) => sat.balonlar.forEach((x) => hepsi.push({ ad: `no${sat.haneIndeks}-${x.rakam}`, x: x.x, y: x.y })));
  harita.dySatirlari.forEach((sat) => sat.balonlar.forEach((x) => hepsi.push({ ad: `dy${sat.soruNo}-${x.secenek}`, x: x.x, y: x.y })));
  harita.testSatirlari.forEach((sat) => sat.balonlar.forEach((x) => hepsi.push({ ad: `t${sat.soruNo}-${x.secenek}`, x: x.x, y: x.y })));
  let sapmalar = [];
  olcum.balonlar.forEach((o) => {
    const kx = 26 + (o.cx - tl.cx) * sx; const ky = 26 + (o.cy - tl.cy) * sy;
    let en = null; hepsi.forEach((h) => { const d = Math.hypot(h.x - kx, h.y - ky); if (!en || d < en.d) en = { h, d }; });
    sapmalar.push({ dom: o.t, kx: Math.round(kx), ky: Math.round(ky), en: en.h.ad, d: Math.round(en.d) });
  });
  const ort = sapmalar.reduce((a, x) => a + x.d, 0) / Math.max(1, sapmalar.length);
  console.log(`DOM balonu → haritadaki en yakın balon ortalama sapma: ${ort.toFixed(1)} px (balon yarıçapı ~7-10 px; >8 ise okuma kayar)`);
  console.log('Örnek (ilk 12):', JSON.stringify(sapmalar.slice(0, 12)));
  await b.close(); server.close();
})();
