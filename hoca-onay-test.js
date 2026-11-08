'use strict';

const assert = require('assert');
const http = require('http');
const puppeteer = require('puppeteer-core');
const Cekirdek = require('./guvenlik-ve-veri.js');
const { baslatSunucu, sunucuDurumu } = require('./server.js');

const CHROME_YOLU = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function httpIstek(port, yontem, yol, govde = null, basliklar = {}) {
  return new Promise((resolve, reject) => {
    const veri = govde ? JSON.stringify(govde) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: yol,
        method: yontem,
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          veri ? { 'Content-Length': Buffer.byteLength(veri) } : {},
          basliklar
        )
      },
      (res) => {
        const parcalar = [];
        res.on('data', (c) => parcalar.push(c));
        res.on('end', () => {
          const metin = Buffer.concat(parcalar).toString('utf8');
          let json = {};
          try {
            json = metin ? JSON.parse(metin) : {};
          } catch (_) {}
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on('error', reject);
    if (veri) req.write(veri);
    req.end();
  });
}

(async () => {
  let gecen = 0;
  function kontrol(kosul, mesaj) {
    assert.ok(kosul, mesaj);
    gecen++;
    console.log(`  ✓ [${gecen}] ${mesaj}`);
  }

  console.log('=== DAVET KODLU & YÖNETİCİ ONAYLI HOCA YETKİLENDİRME TESTLERİ ===');

  // 1. Birim Testleri
  const hataliKodKayit = Cekirdek.dogrulaHocaHesapKayit(
    {
      davetKodu: 'YANLIS-KOD',
      kullaniciAdi: 'dr_ayse',
      adSoyad: 'Dr. Öğr. Üyesi Ayşe Kaya',
      eposta: 'ayse@uni.edu.tr',
      telefon: '05321112233',
      sifre: 'Guclu!Sifre2026',
      sifreTekrar: 'Guclu!Sifre2026'
    },
    { davetKoduKontrol: true, beklenenDavetKodu: 'AKADEMI-2026', mevcutHocalar: [Cekirdek.VARSAYILAN_HOCA_HESAP] }
  );
  kontrol(hataliKodKayit.gecerli === false, 'Hatalı davet kodu ile hoca kayıt başvurusu reddedildi');

  const dogruKodKayit = Cekirdek.dogrulaHocaHesapKayit(
    {
      davetKodu: 'AKADEMI-2026',
      kullaniciAdi: 'dr_ayse',
      adSoyad: 'Dr. Öğr. Üyesi Ayşe Kaya',
      eposta: 'ayse@uni.edu.tr',
      telefon: '05321112233',
      sifre: 'Guclu!Sifre2026',
      sifreTekrar: 'Guclu!Sifre2026'
    },
    { davetKoduKontrol: true, beklenenDavetKodu: 'AKADEMI-2026', mevcutHocalar: [Cekirdek.VARSAYILAN_HOCA_HESAP] }
  );
  kontrol(dogruKodKayit.gecerli === true, 'Doğru kurum davet kodu ile hoca kayıt başvurusu doğrulandı');

  const mukerrerKayit = Cekirdek.dogrulaHocaHesapKayit(
    {
      davetKodu: 'AKADEMI-2026',
      kullaniciAdi: 'hoca',
      adSoyad: 'Başka Hoca',
      eposta: 'baska@uni.edu.tr',
      telefon: '05321112233',
      sifre: 'Guclu!Sifre2026',
      sifreTekrar: 'Guclu!Sifre2026'
    },
    { davetKoduKontrol: true, beklenenDavetKodu: 'AKADEMI-2026', mevcutHocalar: [Cekirdek.VARSAYILAN_HOCA_HESAP] }
  );
  kontrol(mukerrerKayit.gecerli === false, 'Aynı kullanıcı adıyla mükerrer hoca başvurusu engellendi');

  const ornekListe = [
    Cekirdek.VARSAYILAN_HOCA_HESAP,
    {
      kullaniciAdi: 'dr_ayse',
      adSoyad: 'Dr. Öğr. Üyesi Ayşe Kaya',
      eposta: 'ayse@uni.edu.tr',
      sifre: 'Guclu!Sifre2026',
      rol: 'hoca',
      durum: 'beklemede'
    }
  ];
  const beklemedeGiris = Cekirdek.dogrulaHocaGiris('dr_ayse', 'Guclu!Sifre2026', ornekListe);
  kontrol(beklemedeGiris.basarili === false && beklemedeGiris.kod === 403, 'Onay bekleyen (beklemede) hocanın girişi 403 ile reddedildi');

  ornekListe[1].durum = 'aktif';
  const aktifGiris = Cekirdek.dogrulaHocaGiris('dr_ayse', 'Guclu!Sifre2026', ornekListe);
  kontrol(aktifGiris.basarili === true && aktifGiris.kod === 200, 'Yönetici onayından sonra aktifleşen hocanın girişi 200 ile kabul edildi');

  // 2. Sunucu API + Puppeteer UI E2E Testleri
  const sunucu = await baslatSunucu(0);
  const port = sunucu.address().port;

  // API: Hatalı davet koduyla başvuru -> 403
  const apiHataliKod = await httpIstek(port, 'POST', '/api/hoca-basvuru', {
    davetKodu: 'SAHTE-KOD',
    kullaniciAdi: 'dr_mehmet',
    adSoyad: 'Doç. Dr. Mehmet Demir',
    eposta: 'mehmet@uni.edu.tr',
    telefon: '05441112233',
    sifre: 'Mehmet!2026',
    sifreTekrar: 'Mehmet!2026'
  });
  kontrol(apiHataliKod.status === 403, 'Sunucu API hatalı davet kodunu 403 Forbidden ile reddetti');

  // API: Doğru davet koduyla başvuru -> 201 (beklemede, token yok)
  const apiDogruBasvuru = await httpIstek(port, 'POST', '/api/hoca-basvuru', {
    davetKodu: sunucuDurumu.davetKodu,
    kullaniciAdi: 'dr_mehmet',
    adSoyad: 'Doç. Dr. Mehmet Demir',
    eposta: 'mehmet@uni.edu.tr',
    telefon: '05441112233',
    sifre: 'Mehmet!2026',
    sifreTekrar: 'Mehmet!2026'
  });
  kontrol(
    apiDogruBasvuru.status === 201 && apiDogruBasvuru.body.durum === 'beklemede' && !apiDogruBasvuru.body.token,
    'Sunucu API geçerli davet kodlu başvuruyu 201 ve durum=beklemede olarak kaydetti (token vermedi)'
  );

  // API: Onay bekleyen hoca giriş denemesi -> 403
  const apiBeklemedeGiris = await httpIstek(port, 'POST', '/api/hoca-giris', {
    kullaniciAdi: 'dr_mehmet',
    sifre: 'Mehmet!2026'
  });
  kontrol(apiBeklemedeGiris.status === 403, 'Sunucu API onay bekleyen hocanın girişini 403 Forbidden ile engelledi');

  // API: Yönetici girişi ve onaylama
  const apiYoneticiGiris = await httpIstek(port, 'POST', '/api/hoca-giris', {
    kullaniciAdi: 'hoca',
    sifre: 'Demo!Hoca2026'
  });
  kontrol(apiYoneticiGiris.status === 200 && apiYoneticiGiris.body.rol === 'yonetici', 'Ana yönetici hesabı (hoca) başarıyla giriş yaptı');

  const yoneticiToken = apiYoneticiGiris.body.token;
  const apiOnay = await httpIstek(
    port,
    'POST',
    '/api/hoca-yonetim',
    { islem: 'onayla', kullaniciAdi: 'dr_mehmet' },
    { Authorization: `Bearer ${yoneticiToken}` }
  );
  kontrol(apiOnay.status === 200 && apiOnay.body.durum === 'aktif', 'Yönetici bekleyen hoca başvurusunu onayladı (durum=aktif)');

  // API: Onaylanan hocanın girişi -> 200
  const apiOnaySonrasiGiris = await httpIstek(port, 'POST', '/api/hoca-giris', {
    kullaniciAdi: 'dr_mehmet',
    sifre: 'Mehmet!2026'
  });
  kontrol(
    apiOnaySonrasiGiris.status === 200 && Boolean(apiOnaySonrasiGiris.body.token),
    'Onaylanan hoca (dr_mehmet) 200 OK ve oturum tokenı ile giriş yapabildi'
  );

  // API: Normal hocanın başka hocayı onaylama/silme girişimi -> 403
  const apiYetkisizYonetim = await httpIstek(
    port,
    'POST',
    '/api/hoca-yonetim',
    { islem: 'davet_kodu_yenile' },
    { Authorization: `Bearer ${apiOnaySonrasiGiris.body.token}` }
  );
  kontrol(apiYetkisizYonetim.status === 403, 'Normal hocanın yönetici işlemi yapması 403 Forbidden ile engellendi');

  // 3. Puppeteer Arayüz (UI) Testi
  const tarayici = await puppeteer.launch({
    executablePath: CHROME_YOLU,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu']
  });
  const sayfa = await tarayici.newPage();
  await sayfa.setViewport({ width: 1440, height: 900 });
  await sayfa.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle0' });

  // Hoca modalını aç
  await sayfa.click('#btn-hoca-giris-ac');

  // Yeni hoca başvurusu gönder (UI üzerinden: dr_zeynep)
  await sayfa.evaluate(() => {
    document.getElementById('hoca-kayit-davet-kodu').value = 'AKADEMI-2026';
    document.getElementById('hoca-kayit-kullanici').value = 'dr_zeynep';
    document.getElementById('hoca-kayit-ad').value = 'Dr. Zeynep Yılmaz';
    document.getElementById('hoca-kayit-eposta').value = 'zeynep@uni.edu.tr';
    document.getElementById('hoca-kayit-telefon').value = '05552223344';
    document.getElementById('hoca-kayit-sifre').value = 'Zeynep!2026';
    document.getElementById('hoca-kayit-sifre-tekrar').value = 'Zeynep!2026';
  });
  await sayfa.click('#btn-hoca-basvuru-gonder');
  await new Promise((r) => setTimeout(r, 250));

  const tabloMetni1 = await sayfa.$eval('#tablo-hoca-onay-listesi', (el) => el.innerText);
  kontrol(
    tabloMetni1.includes('dr_zeynep') && tabloMetni1.includes('Onay Bekliyor'),
    'UI: Yeni hoca başvurusu tabloya "⏳ Onay Bekliyor" rozetiyle eklendi'
  );

  // Stüdyoyu kilitle ve onaylanmamış dr_zeynep ile giriş dene -> reddedilmeli ve kilitli kalmalı
  await sayfa.click('#btn-hoca-kilitle');
  await sayfa.evaluate(() => {
    document.getElementById('hoca-giris-kullanici').value = 'dr_zeynep';
    document.getElementById('hoca-giris-sifre').value = 'Zeynep!2026';
  });
  await sayfa.click('#btn-hoca-giris-yap');
  await new Promise((r) => setTimeout(r, 250));

  const hataGorunurMu = await sayfa.$eval('#hoca-giris-hata', (el) => !el.hidden && el.innerText.includes('403'));
  const stuyoKilitliMi = await sayfa.$eval('#ana-icerik-alani', (el) => el.style.pointerEvents === 'none');
  kontrol(hataGorunurMu && stuyoKilitliMi, 'UI: Onaylanmamış hoca giriş yapamadı, 403 uyarısı gösterildi ve stüdyo kilitli kaldı');

  // Yönetici (hoca) ile giriş yap ve dr_zeynep'i onayla
  await sayfa.evaluate(() => {
    document.getElementById('hoca-giris-kullanici').value = 'hoca';
    document.getElementById('hoca-giris-sifre').value = 'Demo!Hoca2026';
  });
  await sayfa.click('#btn-hoca-giris-yap');
  await new Promise((r) => setTimeout(r, 250));

  await sayfa.click('#tablo-hoca-onay-listesi button[data-hoca-islem="onayla"][data-hoca-kullanici="dr_zeynep"]');
  await new Promise((r) => setTimeout(r, 250));

  // Tekrar kilitle ve artık onaylanmış olan dr_zeynep ile giriş yap
  await sayfa.click('#btn-hoca-kilitle');
  await sayfa.evaluate(() => {
    document.getElementById('hoca-giris-kullanici').value = 'dr_zeynep';
    document.getElementById('hoca-giris-sifre').value = 'Zeynep!2026';
  });
  await sayfa.click('#btn-hoca-giris-yap');
  await new Promise((r) => setTimeout(r, 250));

  const aktifHocaEtiket = await sayfa.$eval('#etiket-aktif-hoca-kullanici', (el) => el.innerText.trim());
  const stuyoAcikMi = await sayfa.$eval('#ana-icerik-alani', (el) => el.style.pointerEvents === 'auto');
  kontrol(
    aktifHocaEtiket === 'dr_zeynep' && stuyoAcikMi,
    'UI: Yönetici onayından sonra dr_zeynep başarıyla giriş yaptı ve stüdyo kilidi açıldı'
  );

  await tarayici.close();
  sunucu.close();
  console.log(`\n🎉 TÜM HOCA DAVET KODU & YÖNETİCİ ONAY TESTLERİ GEÇTİ (${gecen}/${gecen})`);
})();
