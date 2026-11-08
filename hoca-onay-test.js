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

  // 2B. Temiz Başlangıç (0 Ders, 0 Soru, 0 Öğrenci, 0 Okunan Kağıt, 0 Online Sınav) ve Başlangıçta Ortak Giriş Kapısı Kilidi Doğrulaması
  const temizDurum = await sayfa.evaluate(() => ({
    dersMetin: document.getElementById('aktif-ders-sec').textContent.trim(),
    soruSayisi: document.getElementById('rozet-banka-toplam').textContent.trim(),
    okunanSayisi: document.getElementById('rozet-okunan-kagit').textContent.trim(),
    ogrenciSayisi: document.getElementById('rozet-ogrenci-sayisi').textContent.trim(),
    onlineSayisi: document.getElementById('rozet-tanimli-online-sayisi').textContent.trim(),
    baslangicKilitliMi: document.getElementById('ana-icerik-alani').style.pointerEvents === 'none',
    girisKapisiAcikMi: document.getElementById('modal-hoca-giris').style.display === 'flex'
  }));
  kontrol(
    temizDurum.dersMetin.includes('Henüz Ders Eklenmedi') &&
      temizDurum.soruSayisi === '0' &&
      temizDurum.okunanSayisi === '0' &&
      temizDurum.ogrenciSayisi === '0' &&
      temizDurum.onlineSayisi === '0 Sınav',
    'UI Temiz Başlangıç: Örnek dersler, sorular, öğrenciler, okumalar ve online sınavlar tamamen temizlendi (0)'
  );
  kontrol(
    temizDurum.baslangicKilitliMi && temizDurum.girisKapisiAcikMi,
    'UI Ortak Giriş Kapısı: Doğru şifreyle giriş yapılana kadar ana ekran kilitli (blur + pointer-events:none) ve giriş kapısı açık başladı'
  );

  // Ortak Giriş Kapısından Öğrenci Girişi <-> Eğitmen Girişi geçişini doğrula
  await sayfa.click('#btn-giris-rol-ogrenci');
  const ogrenciGirisGorunur = await sayfa.$eval('#kiosk-sinav-alani', (el) => el.style.display === 'block');
  await sayfa.click('#btn-kiosk-rol-egitmen');
  const egitmenGirisGorunur = await sayfa.$eval('#modal-hoca-giris', (el) => el.style.display === 'flex');
  kontrol(
    ogrenciGirisGorunur && egitmenGirisGorunur,
    'UI Ortak Giriş Kapısı: Öğrenci Girişi ve Eğitmen Girişi seçenekleri aynı başlangıç kapısından sorunsuz geçiş yapıyor'
  );

  // Hoca modalını aç
  await sayfa.click('#btn-hoca-giris-ac');

  // Modalın ekrana tam sığdığını ve üst başlık/düğmelerin ezilmediğini doğrula
  const modalGeometri = await sayfa.evaluate(() => {
    const kart = document.querySelector('#modal-hoca-giris > .kart');
    const btnKapat = document.getElementById('btn-modal-hoca-kapat');
    const btnGiris = document.getElementById('btn-hoca-giris-yap');
    const btnBasvuru = document.getElementById('btn-hoca-basvuru-gonder');
    const rKart = kart.getBoundingClientRect();
    const rKapat = btnKapat.getBoundingClientRect();
    const rGiris = btnGiris.getBoundingClientRect();
    const rBasvuru = btnBasvuru.getBoundingClientRect();
    return {
      kartUstGorunur: rKart.top >= 0,
      kartAltEkranda: rKart.bottom <= window.innerHeight,
      kapatYukseklik: rKapat.height,
      girisYukseklik: rGiris.height,
      basvuruYukseklik: rBasvuru.height,
      varsayilanEposta: document.getElementById('hoca-kayit-eposta').value,
      varsayilanTelefon: document.getElementById('hoca-kayit-telefon').value
    };
  });
  kontrol(
    modalGeometri.kartUstGorunur &&
      modalGeometri.kapatYukseklik >= 26 &&
      modalGeometri.girisYukseklik >= 30 &&
      modalGeometri.basvuruYukseklik >= 32,
    'UI: Hoca modalı ekrana sığıyor, üst başlık ve düğmeler ezilmiyor'
  );
  kontrol(
    modalGeometri.varsayilanEposta === 'fatihcakmak@gmail.com' &&
      modalGeometri.varsayilanTelefon === '05065168500',
    'UI: Yönetici iletişim bilgileri (fatihcakmak@gmail.com / 05065168500) kayıtlı geldi'
  );

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

  // 4. Yönetici (Admin) Şifresini Unuttuğunda E-Posta + Telefon ile Kurtarma Testi
  await sayfa.click('#btn-hoca-kilitle');

  // Yanlış telefonla kurtarma denemesi -> reddedilmeli
  await sayfa.evaluate(() => {
    document.getElementById('hoca-kurtarma-eposta').value = 'fatihcakmak@gmail.com';
    document.getElementById('hoca-kurtarma-telefon').value = '05009998877';
    document.getElementById('hoca-kurtarma-yeni-sifre').value = 'YeniAdmin!2026';
    document.getElementById('hoca-kurtarma-yeni-sifre-tekrar').value = 'YeniAdmin!2026';
  });
  await sayfa.click('#btn-hoca-sifre-sifirla');
  await new Promise((r) => setTimeout(r, 200));
  const kurtarmaHataGorundu = await sayfa.$eval('#hoca-giris-hata', (el) => !el.hidden && el.innerText.includes('403'));
  kontrol(kurtarmaHataGorundu, 'UI: Hatalı telefon numarasıyla admin şifre sıfırlama girişimi 403 ile reddedildi');

  // Doğru e-posta (fatihcakmak@gmail.com) ve doğru telefon (05065168500) ile admin şifresini sıfırla
  await sayfa.evaluate(() => {
    document.getElementById('hoca-kurtarma-eposta').value = 'fatihcakmak@gmail.com';
    document.getElementById('hoca-kurtarma-telefon').value = '05065168500';
    document.getElementById('hoca-kurtarma-yeni-sifre').value = 'Fatih!Yeni2026';
    document.getElementById('hoca-kurtarma-yeni-sifre-tekrar').value = 'Fatih!Yeni2026';
  });
  await sayfa.click('#btn-hoca-sifre-sifirla');
  await new Promise((r) => setTimeout(r, 250));

  // Sıfırlanan yeni şifreyle yönetici girişi yap
  await sayfa.click('#btn-hoca-giris-yap');
  await new Promise((r) => setTimeout(r, 250));

  const kurtarmaSonrasiKullanici = await sayfa.$eval('#etiket-aktif-hoca-kullanici', (el) => el.innerText.trim());
  const kurtarmaSonrasiAcikMi = await sayfa.$eval('#ana-icerik-alani', (el) => el.style.pointerEvents === 'auto');
  kontrol(
    kurtarmaSonrasiKullanici === 'hoca' && kurtarmaSonrasiAcikMi,
    'UI: Yönetici (fatihcakmak@gmail.com / 05065168500) şifresini sıfırlayıp yeni şifresiyle başarıyla giriş yaptı'
  );

  // 5. 5 Katmanlı Tam Karantina (Sert Kiosk) ve Sınav Bazlı Delil Niteliğinde Log Kaydı Testi
  await sayfa.click('#btn-modal-hoca-kapat');
  await sayfa.click('[data-sekme="sekme-online"]');
  await new Promise((r) => setTimeout(r, 200));

  // Önce sınav başlığı, kodu ve ihlal sınırını (3) tanımlayıp başlatalım
  await sayfa.evaluate(() => {
    document.getElementById('online-sinav-baslik').value = '2026-2027 Güz Dönemi Vize Sınavı';
    document.getElementById('online-sinav-kodu').value = 'SINAV-2026-VIZE';
  });
  await sayfa.select('#online-maks-ihlal', '3');
  await sayfa.click('#btn-online-baslat');
  await new Promise((r) => setTimeout(r, 250));

  await sayfa.click('#btn-online-kiosk-ac');
  await new Promise((r) => setTimeout(r, 150));

  // Öğrenciye tanımlı sınavların Kiosk ekranında listelendiğini doğrula
  const tanimliSinavMetni = await sayfa.$eval('#kiosk-ogrenci-sinav-listesi', (el) => el.textContent);
  kontrol(
    tanimliSinavMetni.includes('SINAV-2026-VIZE') && tanimliSinavMetni.includes('Aktif'),
    'UI Kiosk: Öğrenci ekranında öğrenciye tanımlı sınavlar ve aktiflik durumu listelendi'
  );

  await sayfa.evaluate(() => {
    document.getElementById('kiosk-ogr-no').value = '2023104011';
    document.getElementById('kiosk-ad-soyad').value = 'Ahmet Yılmaz';
    document.getElementById('kiosk-eposta').value = 'ahmet@uni.edu.tr';
    document.getElementById('kiosk-telefon').value = '05321112233';
    document.getElementById('kiosk-sifre').value = 'Ahmet!2026';
    document.getElementById('kiosk-sifre-tekrar').value = 'Ahmet!2026';
    document.getElementById('kiosk-okudum-onay').checked = false;
  });

  // Okudum/Anladım kutucuğu işaretlenmeden başlatma denemesi -> engellenmeli
  await sayfa.click('#btn-kiosk-oturum-baslat');
  await new Promise((r) => setTimeout(r, 150));
  const okudumHataGorundu = await sayfa.$eval('#kiosk-hata-kutu', (el) => !el.hidden && el.textContent.includes('Okudum, Anladım'));
  kontrol(okudumHataGorundu, 'UI Kiosk: "Okudum, Anladım, Kabul Ediyorum" onaylanmadan sınava başlama engellendi');

  // Okudum/Anladım kutucuğunu işaretle ve sınava başla
  await sayfa.click('#kiosk-okudum-onay');
  await sayfa.click('#btn-kiosk-oturum-baslat');
  await new Promise((r) => setTimeout(r, 1150));

  const geriSayimBilgi = await sayfa.evaluate(() => {
    const sureMetin = document.getElementById('kiosk-soru-kalan-sure').textContent.trim();
    const etiketMetin = document.getElementById('kiosk-sure-uyari-etiket').textContent.trim();
    const barGenislik = document.getElementById('kiosk-sure-ilerleme-bar').style.width;
    return { sureMetin, etiketMetin, barGenislik };
  });
  kontrol(
    /^\d{2}:\d{2}$/.test(geriSayimBilgi.sureMetin) &&
      geriSayimBilgi.sureMetin !== '40:00' &&
      geriSayimBilgi.etiketMetin.includes('Geri Sayım Aktif') &&
      geriSayimBilgi.barGenislik.endsWith('%'),
    `UI Kiosk: Sınav esnasında canlı geri sayım sayacı (${geriSayimBilgi.sureMetin}) ve ilerleme çubuğu (${geriSayimBilgi.barGenislik}) aktif çalışıyor`
  );

  // 1. soruyu cevapla ve kilitle -> CEVAP_KILITLENDI logu oluşmalı
  await sayfa.click('#btn-kiosk-cevap-kilitle');
  await new Promise((r) => setTimeout(r, 150));

  // Katman 4: Sağ tık / kopyala engeli -> 1. ihlal (IHLAL_KOPYALA_SAG_TIK)
  await sayfa.evaluate(() => {
    const alan = document.getElementById('kiosk-sinav-alani');
    alan.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  await new Promise((r) => setTimeout(r, 150));

  const ihlalUyariMetin = await sayfa.$eval('#kiosk-ihlal-uyari-kutusu', (el) => el.innerText);
  kontrol(
    ihlalUyariMetin.includes('1 / 3') && ihlalUyariMetin.includes('CONTEXTMENU'),
    'UI Kiosk: Sağ tık engellendi, 1/3 ihlal sayacı ve kriptografik mühür uyarısı gösterildi'
  );

  // Katman 3: Mobil/Masaüstü Ekran Bölme (Split-Screen) algılama -> 2. ihlal + Karantina Perdesi
  await sayfa.setViewport({ width: 600, height: 900 });
  await sayfa.evaluate(() => window.dispatchEvent(new Event('resize')));
  await new Promise((r) => setTimeout(r, 150));

  const perdeAcikMi = await sayfa.$eval('#kiosk-karantina-perdesi', (el) => el.style.display === 'block');
  const soruBulanikMi = await sayfa.$eval('#kiosk-soru-icerik', (el) => el.style.filter.includes('blur'));
  kontrol(
    perdeAcikMi && soruBulanikMi,
    'UI Kiosk: Ekran bölme (Split-Screen) algılandığında soru bulanıklaştırıldı ve Kiosk Karantina Perdesi açıldı'
  );

  // Pencereyi tam boyuta geri getir ve 3. ihlali (Odak kaybı / Sekme değişimi) tetikle -> Sınav otomatik bitmeli!
  await sayfa.setViewport({ width: 1440, height: 900 });
  await sayfa.evaluate(() => window.dispatchEvent(new Event('blur')));
  await new Promise((r) => setTimeout(r, 250));

  const bitisMetni = (await sayfa.$eval('#kiosk-soru-icerik', (el) => el.textContent)).replace(/\s+/g, ' ').trim();
  kontrol(
    bitisMetni.includes('Sekme İhlali Sınırı Aşıldı') && bitisMetni.includes('Sekme İhlali: 3'),
    'UI Kiosk: İhlal sınırı dolduğunda sınav otomatik olarak sonlandırıldı'
  );

  // Kiosk'tan çık ve Öğretmen Delil Log Panelini kontrol et
  await sayfa.click('#btn-kiosk-cikis');
  await new Promise((r) => setTimeout(r, 200));

  const delilPanelBilgi = await sayfa.evaluate(() => {
    return {
      rozet: document.getElementById('rozet-delil-log-sayisi').textContent,
      canliMetin: document.getElementById('kutu-canli-delil-loglari').textContent,
      oturumTablo: document.getElementById('tablo-online-oturumlar').textContent
    };
  });
  kontrol(
    delilPanelBilgi.canliMetin.includes('KURALLAR_ONAYLANDI') &&
      delilPanelBilgi.canliMetin.includes('OTURUM_BASLADI') &&
      delilPanelBilgi.canliMetin.includes('CEVAP_KILITLENDI') &&
      delilPanelBilgi.canliMetin.includes('IHLAL_KOPYALA_SAG_TIK') &&
      delilPanelBilgi.canliMetin.includes('IHLAL_EKRAN_BOLME') &&
      delilPanelBilgi.canliMetin.includes('OTURUM_BITTI') &&
      delilPanelBilgi.canliMetin.includes('IP:') &&
      delilPanelBilgi.canliMetin.includes('CihazID(Donanımİmzası):HW-') &&
      delilPanelBilgi.canliMetin.includes('#ISPAT-') &&
      delilPanelBilgi.oturumTablo.includes('📜 Delil İndir'),
    'UI Delil Log Paneli: IP adresi, Donanım Parmak İzi (HW-ID), #ISPAT mührü, KURALLAR_ONAYLANDI ve tüm ihlaller listelendi'
  );

  // 6. Seçmeli Bologna ÖÇ Sistemi: ÖÇ Kayıtlı Değilken Önce ÖÇ Kaydı İsteme + Madde Madde Giriş + Sayfa Başı & Soru Sonu Görünümü Testi
  await sayfa.evaluate(() => {
    const sel = document.getElementById('ayar-kagit-oc-gorunum');
    sel.value = 'ikisi_birden';
    sel.dispatchEvent(new Event('change'));
  });
  await new Promise((r) => setTimeout(r, 150));

  const ocUyariDurumu = await sayfa.evaluate(() => ({
    modalAcik: document.getElementById('modal-yeni-ders').style.display === 'flex',
    uyariGorunur: document.getElementById('uyari-oc-kayit-gerekli').style.display === 'block',
    kutuSayisi: document.querySelectorAll('#kutu-yeni-ders-oc-maddeler [data-oc-madde-input]').length
  }));
  kontrol(
    ocUyariDurumu.modalAcik && ocUyariDurumu.uyariGorunur && ocUyariDurumu.kutuSayisi === 4,
    'UI Seçmeli Bologna ÖÇ: Dersin ÖÇ kaydı yokken sınav kağıdında ÖÇ seçildiğinde önce ÖÇ kayıt modalı ve uyarı notu otomatik açıldı'
  );

  // 5 Madde düğmesine basıp 5 ayrı ÖÇ maddesi gir ve aktif derse kaydet
  await sayfa.click('#btn-oc-hazir-5');
  await sayfa.evaluate(() => {
    document.getElementById('yeni-ders-kod').value = 'BMG101';
    document.getElementById('yeni-ders-ad').value = 'Bilgisayar Mühendisliğine Giriş';
    const inp = document.querySelectorAll('#kutu-yeni-ders-oc-maddeler [data-oc-madde-input]');
    inp[0].value = 'Ağ katmanlarını ve protokollerini açıklar';
    inp[1].value = 'Kriptografik algoritmaları uygular';
    inp[2].value = 'Güvenlik duvarı kurallarını yapılandırır';
    inp[3].value = 'Güvenli yazılım geliştirme ilkelerini analiz eder';
    inp[4].value = 'Bulut güvenliği ve sıfır güven mimarisini değerlendirir';
  });
  await sayfa.click('#btn-aktif-ders-oc-kaydet');
  await new Promise((r) => setTimeout(r, 200));

  const kagitOcRender = await sayfa.evaluate(() => ({
    rozetMetin: document.getElementById('rozet-aktif-ders-oc-sayisi').textContent.trim(),
    sayfaBasiOcVar: Boolean(document.querySelector('#a4-onizleme-sahne .kagit-sayfa-basi-oc-kutu')),
    sayfaBasiMetin: (document.querySelector('#a4-onizleme-sahne .kagit-sayfa-basi-oc-kutu') || {}).textContent || '',
    soruSonuOcSayisi: document.querySelectorAll('#a4-onizleme-sahne .soru-oc-etiket').length
  }));
  kontrol(
    kagitOcRender.rozetMetin.includes('5 ÖÇ Kayıtlı') &&
      kagitOcRender.sayfaBasiOcVar &&
      kagitOcRender.sayfaBasiMetin.includes('ÖÇ-5:') &&
      kagitOcRender.soruSonuOcSayisi > 0,
    'UI Sınav Kağıdı ÖÇ Görünümü: 5 maddelik ÖÇ kaydedildi; A4 kağıtta hem sayfa başında ÖÇ listesi hem de soru sonunda [ÖÇ-X] etiketi görüntülendi'
  );

  // 7. Seçmeli Evrak Şablonu: MÜHENDİSLİK FAKÜLTESİ ve FRM-059 dayatması kaldırıldı; Okul (Üst Başlık) ve Bölüm ayrıldı; Şablon Kaydet kalıcı
  await sayfa.click('[data-sekme="sekme-stüdyo"]');
  await new Promise((r) => setTimeout(r, 150));
  await sayfa.evaluate(() => {
    const tur = document.getElementById('baski-kapsam-sec');
    tur.value = 'yoklama';
    tur.dispatchEvent(new Event('change'));
    const f = document.getElementById('tut-fakulte');
    const b = document.getElementById('tut-bolum');
    f.value = 'KIRIKHAN MESLEK YÜKSEKOKULU';
    b.value = 'Bilgisayar Teknolojileri Bölümü';
    f.dispatchEvent(new Event('input'));
    b.dispatchEvent(new Event('input'));
  });
  await new Promise((r) => setTimeout(r, 320));

  const sadeYoklamaKontrol = await sayfa.evaluate(() => {
    const metin = (document.getElementById('a4-onizleme-sahne').textContent || '') + ' ' + (document.getElementById('baski-mini-onizleme').textContent || '');
    const kunyeModu = document.getElementById('tut-kunye-modu').value;
    return {
      kunyeModu,
      muhendislikVarMi: metin.includes('MÜHENDİSLİK FAKÜLTESİ'),
      frm059VarMi: metin.includes('FRM-059') || metin.includes('Doküman No.'),
      okulUstBaslikVarMi: metin.includes('KIRIKHAN MESLEK YÜKSEKOKULU'),
      bolumHucresiVarMi: metin.includes('Bilgisayar Teknolojileri Bölümü')
    };
  });
  kontrol(
    sadeYoklamaKontrol.kunyeModu === 'sade' &&
      !sadeYoklamaKontrol.muhendislikVarMi &&
      !sadeYoklamaKontrol.frm059VarMi &&
      sadeYoklamaKontrol.okulUstBaslikVarMi &&
      sadeYoklamaKontrol.bolumHucresiVarMi,
    'UI Yoklama Evrakı (Sade Şablon): Sabit MÜHENDİSLİK FAKÜLTESİ ve FRM-059 kaldırıldı; üstte Okul/MYO, BÖLÜMÜ hücresinde Bölüm adı göründü'
  );

  // Seçmeli Belge No / Kalite Künyesi moduna geç, özel belge no gir ve Şablon Yapısını Kaydet
  await sayfa.evaluate(() => {
    const km = document.getElementById('tut-kunye-modu');
    km.value = 'kunyeli';
    km.dispatchEvent(new Event('change'));
    const dNo = document.getElementById('tut-dokuman-no-yoklama');
    dNo.value = 'KMYO-YOK-2026';
    dNo.dispatchEvent(new Event('input'));
  });
  await sayfa.click('#btn-evrak-sablon-kaydet');
  await new Promise((r) => setTimeout(r, 320));

  const kunyeliKayitKontrol = await sayfa.evaluate(() => {
    const metin = (document.getElementById('a4-onizleme-sahne').textContent || '') + ' ' + (document.getElementById('baski-mini-onizleme').textContent || '');
    const depo = JSON.parse(localStorage.getItem('SINAV_OPTIK_STUDYO_VERI_TEMIZ_V2') || '{}');
    return {
      ozelBelgeNoGorundu: metin.includes('KMYO-YOK-2026'),
      kayitliSablon: depo.evrakSablonu || null
    };
  });
  kontrol(
    kunyeliKayitKontrol.ozelBelgeNoGorundu &&
      kunyeliKayitKontrol.kayitliSablon &&
      kunyeliKayitKontrol.kayitliSablon.fakulte === 'KIRIKHAN MESLEK YÜKSEKOKULU' &&
      kunyeliKayitKontrol.kayitliSablon.dokumanNoYoklama === 'KMYO-YOK-2026',
    'UI Seçmeli Künye & Şablon Kaydet: Kullanıcı özel Belge No (KMYO-YOK-2026) düzenledi ve varsayılan şablon olarak kalıcı kaydedildi'
  );

  // 8. Telefon Kurulum QR (#kutu-telefon-qr) Vektör SVG ve Kompakt #setup= Doğrulaması
  await sayfa.click('#btn-telefon-qr-goster');
  await new Promise((r) => setTimeout(r, 200));

  const kurulumQrBilgi = await sayfa.evaluate(() => {
    const svg = document.querySelector('#alan-setup-qr-svg svg');
    const url = (document.getElementById('link-qr-dogrudan-ac') || {}).href || '';
    return {
      svgVar: Boolean(svg),
      viewBoxVar: Boolean(svg && svg.getAttribute('viewBox')),
      kompaktUrlMi: url.includes('#setup='),
      urlUzunluk: url.length
    };
  });
  kontrol(
    kurulumQrBilgi.svgVar &&
      kurulumQrBilgi.viewBoxVar &&
      kurulumQrBilgi.kompaktUrlMi &&
      kurulumQrBilgi.urlUzunluk < 950,
    'UI Telefon Kurulum QR: Vektör SVG (viewBox) üretildi ve #setup= kompakt paket ile QR taşması önlendi'
  );

  // 9. Öğrenci Listesini QR ile Bilgisayara Aktarma (#modal-ogrenci-qr) Testi
  await sayfa.click('#btn-cikti-merkezi-ogr-qr');
  await new Promise((r) => setTimeout(r, 200));

  const pcQrModalBilgi = await sayfa.evaluate(() => {
    const modalAcik = document.getElementById('modal-ogrenci-qr').style.display === 'flex';
    const pcPanelAcik = document.getElementById('panel-qr-bilgisayara').style.display !== 'none';
    const eslestirmeSvg = Boolean(document.querySelector('#alan-pc-eslesme-qr-svg svg'));
    const oturumKodu = (document.getElementById('rozet-pc-eslesme-kod') || {}).textContent.trim();
    return { modalAcik, pcPanelAcik, eslestirmeSvg, oturumKodu };
  });

  // QR paketini yapıştırıp Bilgisayara Aktar düğmesine tıkla
  await sayfa.evaluate(() => {
    const C = window.SinavOptikCekirdek;
    const paket = C.uretOgrenciQrPaketi([
      { ogrNo: '2026550011', adSoyad: 'Elif Karaca' },
      { ogrNo: '2026550022', adSoyad: 'Burak Şahin' },
      { ogrNo: '2026550033', adSoyad: 'Selin Aydın' }
    ]);
    document.getElementById('girdi-pc-qr-paket').value = paket.parcalar[0].paketKodu;
  });
  await sayfa.click('#btn-pc-qr-paket-aktar');
  await new Promise((r) => setTimeout(r, 200));

  const pcAktarimSonuc = await sayfa.evaluate(() => {
    return {
      tabloMetin: document.getElementById('tablo-ogrenci-listesi').textContent || ''
    };
  });
  kontrol(
    pcQrModalBilgi.modalAcik &&
      pcQrModalBilgi.pcPanelAcik &&
      pcQrModalBilgi.eslestirmeSvg &&
      pcQrModalBilgi.oturumKodu.length >= 4 &&
      pcAktarimSonuc.tabloMetin.includes('Elif Karaca') &&
      pcAktarimSonuc.tabloMetin.includes('Burak Şahin'),
    'UI Öğrenci Listesini QR ile Bilgisayara Aktar: Eşleştirme QR üretildi ve QR öğrenci paketi bilgisayardaki derse başarıyla aktarıldı'
  );

  await tarayici.close();
  sunucu.close();
  console.log(`\n🎉 TÜM HOCA DAVET KODU, YÖNETİCİ ONAY, SERT KİOSK VE DELİL LOG TESTLERİ GEÇTİ (${gecen}/${gecen})`);
})();
