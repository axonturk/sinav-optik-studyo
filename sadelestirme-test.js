/* ==========================================================================
   SADELEŞTİRME TESTİ (Chrome + puppeteer-core)
   Özellik silmeden sadeleştirme adımlarının kalıcı kontrolü:
   1) Sade dil  2) Gelişmiş araçlar katlanır  3) Menü iş akışı sırası  4) Değerlendirme sekmeleri + kopya bandı
   5) Sınav bilgileri tek kaynak (yazılan süre Kaydet/yenilemede geri dönmez)
   6) Basit / Uzman görünümü  7) Belge ayarlarında gerçek canlı önizleme
   Çalıştırma: node sadelestirme-test.js
   ========================================================================== */
'use strict';
process.env.SINAV_OGRENCI_HESAP_ZORUNLU = '0';
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

(async () => {
  console.log('=== SADELEŞTİRME TESTİ ===');
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

    // 1) Sade dil
    const metin = await pc.evaluate(() => document.body.innerText);
    kontrol('1) Başlıklarda teknik ad yok (Zero-Trust, Karantina Kurgu Masası, Bradley-Roth, CQI)', !/Zero-Trust|Kurgu Masası|Bradley-Roth|CQI/.test(metin));
    kontrol('1) Sade başlıklar var (Online sınav oluştur, Kopya şüphesi, Soru analizi)', /Online sınav oluştur/.test(await pc.$eval('#sekme-online', (e) => e.textContent)) && /Kopya şüphesi \(ortak yanlış analizi\)/.test(await pc.$eval('#sekme-analiz', (e) => e.textContent)));

    // 2) Gelişmiş araçlar kapalı başlar
    const katli = await pc.evaluate(() => ({ deneme: document.getElementById('detay-okuma-deneme').open, ekGuv: document.getElementById('detay-online-ek-guvenlik').open, uyariDisarida: !document.getElementById('detay-okuma-goruntu').contains(document.getElementById('omr-uyari-kutu')) }));
    kontrol('2) Okuma deneme aracı ve ek online güvenlik kapalı kutuda; okuma uyarısı kutunun dışında', katli.deneme === false && katli.ekGuv === false && katli.uyariDisarida, JSON.stringify(katli));

    // 3) Menü sırası
    const menu = await pc.$$eval('#ust-sekme-nav .yan-menu-grup-baslik, #ust-sekme-nav .sekme-btn[data-sekme]', (els) => els.map((e) => e.dataset.sekme || e.textContent.trim()));
    // Masam (sınavlar ve notlar) en üstte, iş akışı grupları altında
    const beklenen = ['sekme-masam', '1 · Hazırla', 'sekme-dersler', 'sekme-banka', 'sekme-ogrenciler', 'sekme-stüdyo', '2 · Sınav yap', 'sekme-omr', 'sekme-online', '3 · Sonuçlar', 'sekme-analiz', 'sekme-arsiv', 'sekme-ogrenci-dosyasi', 'sekme-kayitlar', 'sekme-sablonlar', 'sekme-ayarlar'];
    kontrol('3) Yan menü: en üstte Masam, sonra iş akışı sırasında: Hazırla → Sınav yap → Sonuçlar, en altta Şablon/Ayarlar', JSON.stringify(menu) === JSON.stringify(beklenen), JSON.stringify(menu));
    const kilavuz = {};
    for (const id of ['sekme-stüdyo', 'sekme-omr', 'sekme-analiz']) {
      await pc.click(`.sekme-btn[data-sekme="${id}"]`);
      await bekle(200);
      kilavuz[id] = await pc.$eval('#bos-durum-ilk-kurulum', (e) => !e.hidden);
    }
    kontrol('3) İlk kullanım kartı yalnız ana ekranda (Okuma/Değerlendirme\'de yok)', kilavuz['sekme-stüdyo'] && !kilavuz['sekme-omr'] && !kilavuz['sekme-analiz'], JSON.stringify(kilavuz));

    // 4) Değerlendirme sekmeleri + kopya bandı
    const altlar = await pc.$$eval('#analiz-alt-sekmeler [data-alt]', (bs) => bs.map((b) => b.textContent.trim()));
    kontrol('4) Değerlendirme sekmeleri: Tümü · Notlar · Soru analizi · Öğrenim çıktıları · Kopya · Raporlar', altlar.join('|') === 'Tümü|Notlar|Soru analizi|Öğrenim çıktıları|Kopya|Raporlar', altlar.join('|'));
    await pc.click('#analiz-alt-sekmeler [data-alt="ogrenciler"]');
    await bekle(150);
    const notlar = await pc.evaluate(() => Array.from(document.querySelectorAll('#sekme-analiz .analiz-bolum')).filter((e) => e.offsetParent).map((e) => (e.querySelector('.kart-baslik span') || {}).textContent || ''));
    kontrol('4) "Notlar" sekmesinde not çizelgesi (OBS) ve GR kartı görünür', notlar.some((t) => /Notlar ve OBS/.test(t)) && notlar.some((t) => /Sınava girmeyenler/.test(t)), JSON.stringify(notlar));
    // Kopya: telefondan iki aynı cevaplı kağıt gelir (gerçek akış: sunucu olayı → masaüstü eşitleme)
    const giris = await (await fetch(`${taban}/api/hoca-giris`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' }) })).json();
    const A = 'ABCDEABCDEABCDE';
    const det = (c) => c.split('').map((v, i) => ({ verilen: v, sonuc: v === A[i] ? 'DOGRU' : 'YANLIS' }));
    const kagit = (no, ad, c) => ({ id: 'K' + no, ogrNo: no, adSoyad: ad, grup: 'A', toplamPuan: det(c).filter((x) => x.sonuc === 'DOGRU').length * 4, testDogru: det(c).filter((x) => x.sonuc === 'DOGRU').length, testDetay: det(c), dyDetay: [] });
    const olaylar = [kagit('100', 'Bir Öğrenci', 'BBBBBBBBBBBBBBB'), kagit('101', 'İki Öğrenci', 'BBBBBBBBBBBBBBB'), kagit('102', 'Üç Öğrenci', A)]
      .map((v, i) => ({ eventId: `SADE-${i}`, sinavKodu: 'GENEL', tur: 'OKUDU_GUNCELLE', kaynakCihaz: 'mobil', zamanMs: Date.now() - 60000 + i, veri: v }));
    await fetch(`${taban}/api/v2/sinav-senkron`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${giris.token}` }, body: JSON.stringify({ olaylar }) });
    await pc.evaluate(async () => { await window.__masaustuV2SenkronSimdi(); });
    await bekle(400);
    await pc.click('.sekme-btn[data-sekme="sekme-omr"]');
    await bekle(200);
    await pc.click('.sekme-btn[data-sekme="sekme-analiz"]');
    await bekle(400);
    const bant = await pc.evaluate(() => {
      const b = document.getElementById('uyari-kopya-supheli');
      const o = document.getElementById('uyari-kopya-okuma');
      return { gorunur: b && b.style.display === 'flex', okumaBandi: o && o.style.display === 'flex', metin: b ? b.textContent.replace(/\s+/g, ' ') : '' };
    });
    kontrol('4) Kopya şüphesi varsa Okuma ve Değerlendirme üstünde uyarı bandı çıkar', bant.gorunur && bant.okumaBandi && /1 öğrenci çiftinde kopya şüphesi/.test(bant.metin), JSON.stringify(bant));
    await pc.click('#uyari-kopya-supheli [data-kopya-raporu-ac]');
    await bekle(150);
    const altAktif = await pc.$eval('#sekme-analiz', (e) => e.getAttribute('data-alt-sekme'));
    kontrol('4) "Kopya raporunu aç" doğrudan Kopya sekmesine götürür', altAktif === 'benzerlik', altAktif);

    // 5) Tek kaynak
    await pc.click('.sekme-btn[data-sekme="sekme-stüdyo"]');
    await bekle(200);
    const solYonlendirme = await pc.evaluate(() => ({ eskiGizli: document.getElementById('detay-gelismis-baslik-kunye').hidden, yonlendirme: !!document.getElementById('btn-sinav-bilgilerine-git') }));
    kontrol('5) Sol paneldeki yinelenen künye alanları gizli, yerine "Çıktı Merkezi › Sınav bilgileri" yönlendirmesi var', solYonlendirme.eskiGizli && solYonlendirme.yonlendirme, JSON.stringify(solYonlendirme));
    await pc.evaluate(() => {
      const yaz = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
      yaz('kagit-hizli-sure', '75 Dakika');
      yaz('kagit-hizli-kurum', 'DENEME MESLEK YÜKSEKOKULU');
    });
    const esit = await pc.evaluate(() => ({ antetSure: document.getElementById('antet-sure').value, tutFak: document.getElementById('tut-fakulte').value }));
    kontrol('5) Süre ve okul tek yerde yazılınca diğer kutular (sol yedek, tutanak) aynı değeri alır', esit.antetSure === '75 Dakika' && esit.tutFak === 'DENEME MESLEK YÜKSEKOKULU', JSON.stringify(esit));
    await pc.evaluate(() => { const b = document.getElementById('btn-genel-kaydet-uygula'); if (b) b.click(); });
    await bekle(600);
    const kaydetSonra = await pc.evaluate(() => document.getElementById('kagit-hizli-sure').value);
    kontrol('5) Üstteki genel "Kaydet" yazılan süreyi eski değere (60) döndürmez', kaydetSonra === '75 Dakika', kaydetSonra);
    await pc.reload({ waitUntil: 'networkidle0' });
    await girisYap();
    const yenidenSonra = await pc.evaluate(() => ({ sure: document.getElementById('kagit-hizli-sure').value, kurum: document.getElementById('kagit-hizli-kurum').value }));
    kontrol('5) Sayfa yenilense de süre ve okul korunur', yenidenSonra.sure === '75 Dakika' && yenidenSonra.kurum === 'DENEME MESLEK YÜKSEKOKULU', JSON.stringify(yenidenSonra));
    const a4 = await pc.$eval('#a4-onizleme-sahne', (e) => e.textContent);
    kontrol('5) Sınav kağıdında yeni süre ve okul adı görünür', /75 Dakika/.test(a4) && /DENEME MESLEK YÜKSEKOKULU/.test(a4));

    // 6) Basit / Uzman
    const gorunurMu = (id) => pc.evaluate((i) => { const e = document.getElementById(i); return !!e && e.getClientRects().length > 0; }, id);
    await pc.click('.sekme-btn[data-sekme="sekme-stüdyo"]');
    await bekle(200);
    const basit = { mod: await pc.evaluate(() => document.documentElement.getAttribute('data-gorunum')), hafta: await gorunurMu('detay-gelismis-hafta-oc'), yapi: await gorunurMu('rozet-toplam-puan'), dugme: await pc.$eval('#btn-gorunum-modu', (e) => e.textContent) };
    kontrol('6) Varsayılan Basit görünüm: gelişmiş ayarlar gizli, temel "Sınav Yapısı" görünür', basit.mod === 'basit' && !basit.hafta && basit.yapi && /Basit/.test(basit.dugme), JSON.stringify(basit));
    await pc.click('#btn-gorunum-modu');
    await bekle(150);
    const uzman = { mod: await pc.evaluate(() => document.documentElement.getAttribute('data-gorunum')), hafta: await gorunurMu('detay-gelismis-hafta-oc'), dugme: await pc.$eval('#btn-gorunum-modu', (e) => e.textContent) };
    kontrol('6) "Uzman"a geçince gelişmiş ayarlar görünür (hiçbir özellik silinmedi)', uzman.mod === 'uzman' && uzman.hafta && /Uzman/.test(uzman.dugme), JSON.stringify(uzman));
    await pc.reload({ waitUntil: 'networkidle0' });
    await girisYap();
    const kalici = await pc.evaluate(() => document.documentElement.getAttribute('data-gorunum'));
    kontrol('6) Görünüm seçimi sayfa yenilenince hatırlanır', kalici === 'uzman', kalici);
    await pc.click('#btn-gorunum-modu');

    // 7) Belge ayarlarında gerçek canlı önizleme
    await pc.click('.sekme-btn[data-sekme="sekme-stüdyo"]');
    await bekle(600);
    const cikti = await pc.evaluate(() => ({ acik: document.querySelector('.mini-onizleme-cekmecesi').open, sayfa: document.querySelectorAll('#baski-mini-onizleme .mini-sayfa-kutu').length }));
    kontrol('7) Çıktı Merkezi önizlemesi açık başlar ve seçili belgenin sayfalarını gösterir', cikti.acik && cikti.sayfa >= 1, JSON.stringify(cikti));
    await pc.click('.sekme-btn[data-sekme="sekme-sablonlar"]');
    await bekle(700);
    const kurumIlk = await pc.$$eval('#onizleme-kurum-belge .mini-sayfa-kutu', (e) => e.length);
    kontrol('7) Kurum Şablonu: temsili kutu yerine gerçek sınav kağıdı önizlemesi var', kurumIlk >= 1, String(kurumIlk));
    const antetOnce = await pc.$eval('#antet-kurum', (e) => e.value);
    await pc.$eval('#sablon-kurum-adi', (e) => { e.value = 'ÖNİZLEME DENEME ÜNİVERSİTESİ'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await bekle(700);
    const kurumSonra = await pc.evaluate(() => ({ metin: document.getElementById('onizleme-kurum-belge').textContent, antet: document.getElementById('antet-kurum').value }));
    kontrol('7) Şablon alanı yazıldıkça önizlemedeki kağıt değişir; kaydetmeden gerçek ayar değişmez', /ÖNİZLEME DENEME ÜNİVERSİTESİ/.test(kurumSonra.metin) && kurumSonra.antet === antetOnce, `${kurumSonra.antet} / ${antetOnce}`);
    for (const [k, desen] of [['ayri-optik', /OPT|Cevap|cevap/], ['tutanak', /TUTANA/], ['yoklama', /YOKLAMA/i]]) {
      await pc.select('#sec-kurum-onizleme-belge', k);
      await bekle(500);
      const t = await pc.evaluate(() => ({ n: document.querySelectorAll('#onizleme-kurum-belge .mini-sayfa-kutu').length, m: document.getElementById('onizleme-kurum-belge').textContent }));
      kontrol(`7) Kurum Şablonu önizlemesinde "${k}" belgesi seçilip görülebilir`, t.n >= 1 && desen.test(t.m), `${t.n} · ${t.m.slice(0, 80)}`);
    }
    await pc.click('.sekme-btn[data-sekme="sekme-ogrenciler"]');
    await bekle(300);
    await pc.evaluate(() => { const d = document.getElementById('detay-yoklama-onizleme'); d.open = true; d.dispatchEvent(new Event('toggle')); });
    await bekle(500);
    const yok20 = await pc.$$eval('#onizleme-yoklama-evraki .mini-sayfa-kutu', (e) => e.length);
    kontrol('7) Sınıf listesinde yoklama evrakı önizlemesi açılır', yok20 >= 1, String(yok20));

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
