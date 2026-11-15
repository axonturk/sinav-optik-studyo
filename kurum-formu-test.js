/* ==========================================================================
   KURUM FORMU TESTİ (Chrome + puppeteer-core)
   Kurumun Word kalite formunun üst/alt bilgisi belgelere birebir basılır:
   - Kurum Şablonu'nda belge türü başına .docx yükleme → önizleme (kaydetmeden belgeler değişmez)
   - Kaydet → sınav kağıdı, tutanak, yoklama gerçek çıktısında kurum formu; sayfa no kendiliğinden
   - Taşma yok (sayfa içeriği A4'e sığar), optik form/okunabilir yoklama etkilenmez
   - .doc / PDF için anlaşılır yönlendirme; Kaldır ile eski başlığa dönüş; yenilemede kalıcı
   Çalıştırma: node kurum-formu-test.js
   ========================================================================== */
'use strict';
process.env.SINAV_OGRENCI_HESAP_ZORUNLU = '0';
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { baslatSunucu } = require('./server.js');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  .find((p) => fs.existsSync(p));
const ORNEK = (ad) => path.join(__dirname, /^kurum-formu-ornek-/.test(ad) ? 'test-ornekleri' : 'ornek-dosyalar', ad);
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let gecen = 0;
let hata = 0;
function kontrol(ad, kosul, detay = '') {
  if (kosul) gecen++; else hata++;
  console.log(`  ${kosul ? '✓' : '✗ HATA'} ${ad}${detay && (!kosul || process.env.AYRINTI) ? ` — ${detay}` : ''}`);
}

(async () => {
  console.log('=== KURUM FORMU TESTİ ===');
  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const hatalar = [];
  try {
    const pc = await (await tarayici.createBrowserContext()).newPage();
    await pc.setViewport({ width: 1440, height: 900 });
    pc.on('pageerror', (e) => hatalar.push(e.message));
    pc.on('dialog', async (d) => { await d.accept(); });
    const girisYap = async () => {
      await pc.evaluate(() => {
        document.getElementById('hoca-giris-kullanici').value = 'hoca';
        document.getElementById('hoca-giris-sifre').value = 'Demo!Hoca2026';
        document.getElementById('btn-hoca-giris-yap').click();
      });
      await bekle(1600);
      await pc.evaluate(() => { const k = document.getElementById('btn-modal-hoca-kapat'); if (k && document.getElementById('modal-hoca-giris').style.display !== 'none') k.click(); });
    };
    await pc.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });
    await girisYap();

    const yukle = async (tur, dosya) => {
      const el = await pc.$(`#kutu-kurum-word-formlari [data-kurum-form-tur="${tur}"] [data-kurum-form-dosya]`);
      await el.uploadFile(dosya);
      await bekle(1200);
    };
    const mesaj = () => pc.$eval('#etiket-kurum-word-form-mesaj', (e) => e.textContent);
    const onizleme = () => pc.evaluate(() => {
      const k = document.getElementById('onizleme-kurum-belge');
      return { metin: k.textContent, blok: k.querySelectorAll('.kurum-formu-blok').length, sayfa: k.querySelectorAll('.mini-sayfa-kutu').length };
    });
    // Çıktı Merkezi'nde seçili belgenin gerçek çıktısı (tam boy sayfalar) + taşma ölçümü
    const cikti = async (kapsam) => {
      await pc.click('.sekme-btn[data-sekme="sekme-stüdyo"]');
      await bekle(300);
      await pc.evaluate((k) => {
        const s = document.getElementById('baski-kapsam-sec');
        s.value = k;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        const d = document.querySelector('.mini-onizleme-cekmecesi');
        if (d) d.open = true;
      }, kapsam);
      await bekle(900);
      if (process.env.EKRAN) {
        const el = await pc.$('#baski-mini-onizleme');
        await el.screenshot({ path: `${process.env.EKRAN}/kurum-formu-${kapsam}.png` });
      }
      return pc.evaluate(() => {
        const k = document.getElementById('baski-mini-onizleme');
        const sayfalar = Array.from(k.querySelectorAll('.a4-sayfa'));
        return {
          metin: k.textContent,
          blok: k.querySelectorAll('.kurum-formu-blok').length,
          ustBlok: k.querySelectorAll('.kurum-formu-ust').length,
          altBlok: k.querySelectorAll('.kurum-formu-alt').length,
          sayfa: sayfalar.length,
          tasan: sayfalar.filter((s) => s.scrollHeight > s.clientHeight + 2).length
        };
      });
    };

    // Başlangıç: kurum formu yok → uygulamanın kendi başlığı
    const once = await cikti('tutanak');
    kontrol('Başlangıçta tutanak uygulamanın kendi başlığıyla basılır (kurum formu yok)', once.blok === 0 && /SINAV DURUM TUTANA/.test(once.metin), JSON.stringify(once).slice(0, 160));

    await pc.click('.sekme-btn[data-sekme="sekme-sablonlar"]');
    await bekle(600);
    const kartIlk = await pc.evaluate(() => {
      const kart = document.getElementById('kart-kurum-word-formlari');
      return { var: !!kart, gorunur: !!kart && kart.getClientRects().length > 0, satir: kart ? kart.querySelectorAll('[data-kurum-form-tur]').length : 0 };
    });
    kontrol('Kurum Şablonu\'nda "Kurumun kalite formları (Word\'den birebir)" kartı ve 3 belge satırı var', kartIlk.var && kartIlk.gorunur && kartIlk.satir === 3, JSON.stringify(kartIlk));

    // Yanlış biçimler: anlaşılır yönlendirme
    await yukle('tutanak', ORNEK('BL304_Tum_Sinif_Ogrenciye_Ozel_Kagitlar_ve_Anahtar.doc'));
    kontrol('.doc yüklenince "Farklı Kaydet → .docx" yönlendirmesi çıkar', /Farklı Kaydet/.test(await mesaj()), await mesaj());
    await yukle('tutanak', ORNEK('BL304_Tum_Sinif_Ogrenciye_Ozel_Kagitlar_ve_Anahtar.pdf'));
    kontrol('PDF yüklenince görsel/PDF antet kutusuna yönlendirir', /Word \(\.docx\) dosyası değil/.test(await mesaj()), await mesaj());

    // Tutanak: gerçek form (FRM-046) — önizleme hemen, gerçek belge kaydetmeden değişmez
    await yukle('tutanak', ORNEK('2853_files_1675426892.docx'));
    const tOn = await onizleme();
    const tSatir = await pc.$eval('#kutu-kurum-word-formlari [data-kurum-form-tur="tutanak"] [data-kurum-form-durum]', (e) => e.textContent);
    kontrol('Tutanak formu okunur; satırda dosya adı görünür', /2853_files_1675426892\.docx/.test(tSatir) && /okundu/.test(await mesaj()), tSatir);
    kontrol('Önizleme tutanağa geçer ve kurumun formunu gösterir (FRM-046, Hazırlayan/Yürürlük Onay)', tOn.blok >= 2 && /FRM-046/.test(tOn.metin) && /Yürürlük Onay/.test(tOn.metin) && await pc.$eval('#sec-kurum-onizleme-belge', (e) => e.value) === 'tutanak', JSON.stringify({ ...tOn, metin: tOn.metin.slice(0, 120) }));
    const kayitsiz = await cikti('tutanak');
    kontrol('Kaydetmeden gerçek tutanak değişmez', kayitsiz.blok === 0, String(kayitsiz.blok));

    // Kağıt + yoklama: farklı düzende sentetik formlar
    await pc.click('.sekme-btn[data-sekme="sekme-sablonlar"]');
    await bekle(500);
    await yukle('kagit', ORNEK('kurum-formu-ornek-tablolu.docx'));
    const kOn = await onizleme();
    kontrol('Sınav kağıdı formu önizlemede: kurum üst bilgisi + "Sayfa 1 / 2" alanı dolu', /ÖRN-FR-0071/.test(kOn.metin) && /1 \/ 2/.test(kOn.metin) && await pc.$eval('#sec-kurum-onizleme-belge', (e) => e.value) === 'sinif-aktif', kOn.metin.slice(0, 200));
    await yukle('yoklama', ORNEK('kurum-formu-ornek-paragraf.docx'));
    const yOn = await onizleme();
    kontrol('Yoklama formu (tablosuz başlık, alt bilgi yok) önizlemede', /MYO-F-12/.test(yOn.metin) && /YAZILI SINAV YOKLAMA LİSTESİ/.test(yOn.metin), yOn.metin.slice(0, 160));
    const altKutu = await pc.$eval('#kutu-kurum-word-formlari [data-kurum-form-tur="yoklama"] [data-kurum-form-alt]', (e) => e.disabled);
    kontrol('Alt bilgisi olmayan formda "Alt bilgi" kutusu pasif', altKutu === true);

    // Kaydet
    await pc.click('#btn-kurum-word-form-kaydet');
    await bekle(900);
    kontrol('Kaydet: "3 belge kurumun kendi formuyla basılacak"', /3 belge/.test(await mesaj()), await mesaj());

    const tut = await cikti('tutanak');
    kontrol('Gerçek tutanak: kurum üst + alt bilgisi, sayfa taşmıyor', tut.ustBlok === 1 && tut.altBlok === 1 && /FRM-046/.test(tut.metin) && /1 \/ 1/.test(tut.metin) && tut.tasan === 0, JSON.stringify({ ...tut, metin: '' }));
    const kag = await cikti('sinif-aktif');
    kontrol('Gerçek sınav kağıdı: kurum üst bilgisi (sayfa 1/2) + son sayfada kurum alt bilgisi; ders/tarih/süre satırı ve kimlik şeridi korunur; taşma yok',
      kag.ustBlok >= 1 && kag.altBlok >= 1 && /ÖRN-FR-0071/.test(kag.metin) && /Adı Soyadı/.test(kag.metin) && /Tarih\/Süre/.test(kag.metin) && /Bölüm Kalite Temsilcisi/.test(kag.metin) && kag.tasan === 0,
      JSON.stringify({ ...kag, metin: kag.metin.slice(0, 100) }));
    const tip = await pc.$eval('#kalite-form-tipi', (e) => e.value);
    kontrol('Sınav kağıdı form tipi "Kurumun Word kalite formu" seçildi', tip === 'kurum-formu', tip);
    const yok = await cikti('yoklama');
    kontrol('Gerçek yoklama: her sayfada kurum üst bilgisi, sayfa no doğru, taşma yok', yok.ustBlok === yok.sayfa && yok.sayfa >= 1 && /MYO-F-12/.test(yok.metin) && /Sayfa No: 1/.test(yok.metin) && yok.tasan === 0, JSON.stringify({ ...yok, metin: '' }));
    const opt = await cikti('ayri-optik');
    kontrol('Optik cevap formu kendi düzeninde kalır (kurum formu basılmaz)', opt.blok === 0 && opt.sayfa >= 1, String(opt.blok));

    // Yenileme sonrası kalıcı
    await pc.reload({ waitUntil: 'networkidle0' });
    await girisYap();
    const kalici = await cikti('tutanak');
    kontrol('Sayfa yenilenince kurum formu kalıcı', kalici.ustBlok === 1 && /FRM-046/.test(kalici.metin), String(kalici.ustBlok));
    const bozuk = await pc.evaluate(() => localStorage.getItem('SINAV_BOZUK_YEDEK_V1'));
    kontrol('Kayıtlı veri bozuk sayılmaz (depo kurtarma devreye girmez)', !bozuk, bozuk ? 'BOZUK_YEDEK yazıldı' : '');
    await pc.click('.sekme-btn[data-sekme="sekme-sablonlar"]');
    await bekle(600);
    const satirKalici = await pc.$eval('#kutu-kurum-word-formlari [data-kurum-form-tur="tutanak"] [data-kurum-form-durum]', (e) => e.textContent);
    kontrol('Kurum Şablonu satırı yenilemeden sonra yüklü dosyayı gösterir', /2853_files/.test(satirKalici), satirKalici);

    // Alt bilgiyi kapat → önizlemede alt bilgi kalkar
    await pc.evaluate(() => { const c = document.querySelector('#kutu-kurum-word-formlari [data-kurum-form-tur="tutanak"] [data-kurum-form-alt]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await bekle(700);
    const altsiz = await onizleme();
    kontrol('"Alt bilgi" kapatılınca önizlemede yalnız üst bilgi kalır', altsiz.blok === 1 && !/Yürürlük Onay/.test(altsiz.metin), String(altsiz.blok));

    // Kaldır + kaydet → eski başlığa dönüş
    await pc.click('#kutu-kurum-word-formlari [data-kurum-form-tur="tutanak"] [data-kurum-form-kaldir]');
    await bekle(500);
    await pc.click('#btn-kurum-word-form-kaydet');
    await bekle(900);
    const donus = await cikti('tutanak');
    kontrol('Kaldır + Kaydet: tutanak uygulamanın kendi başlığına döner', donus.blok === 0 && /SINAV DURUM TUTANA/.test(donus.metin), String(donus.blok));

    kontrol('Sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
  } catch (err) {
    hata++;
    console.log('  ✗ HATA beklenmeyen:', err.stack || err.message);
  } finally {
    await tarayici.close();
    server.close();
  }
  console.log(`\nSonuç: ${gecen} geçti, ${hata} hata`);
  process.exit(hata ? 1 : 0);
})();
