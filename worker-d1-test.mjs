/* Çalıştırma: node worker-d1-test.mjs  (Node 22.5+ yerleşik node:sqlite ile sahte D1) */
// Worker'ı sahte D1 (node:sqlite) ile İKİ ayrı kopya (isolate) olarak çalıştırır:
// eşzamanlı öğrenci kayıtlarının birbirini ezmediğini ve giriş anahtarının kopyalar arası geçerli olduğunu sınar.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const REPO = process.argv[2] || path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(REPO, 'd1-sema.sql'), 'utf8'));
const D1 = {
  prepare(sql) {
    const yap = (args) => ({
      bind: (...a) => yap(a),
      run: async () => { db.prepare(sql).run(...args); return { success: true }; },
      first: async () => db.prepare(sql).get(...args) || null,
      all: async () => ({ results: db.prepare(sql).all(...args) })
    });
    return yap([]);
  },
  // Gerçek D1 gibi: komutlar sırayla, biri hata verirse hepsi geri alınır
  async batch(komutlar) {
    db.exec('BEGIN');
    try { const sonuc = []; for (const k of komutlar) sonuc.push(await k.run()); db.exec('COMMIT'); return sonuc; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
};
const env = { SINAV_DB: D1, OGRENCI_HESAP_ZORUNLU: '1' };
const url = pathToFileURL(path.join(REPO, 'worker.js')).href;
const A = (await import(url + '?kopya=A')).default;
const B = (await import(url + '?kopya=B')).default;
const istek = async (w, yol, govde, baslik = {}) => {
  const r = await w.fetch(new Request('https://sinav.test' + yol, {
    method: govde === undefined ? 'GET' : 'POST',
    headers: Object.assign({ 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.1' }, baslik),
    body: govde === undefined ? undefined : JSON.stringify(govde)
  }), env);
  let v = {};
  try { v = await r.json(); } catch (_) {}
  return { kod: r.status, v };
};
let hata = 0;
const kontrol = (ad, k, d = '') => { if (!k) hata++; console.log(`  ${k ? '✓' : '✗ HATA'} ${ad}${!k && d ? ' — ' + d : ''}`); };

const hoca = await istek(A, '/api/hoca-giris', { kullaniciAdi: 'hoca', sifre: 'Demo!Hoca2026' });
kontrol('Öğretmen girişi (kopya A)', hoca.kod === 200, JSON.stringify(hoca.v));
const HB = { authorization: `Bearer ${hoca.v.token}` };
const sifre = 'Ilk.Sifre2026';
// İki öğrenci AYNI ANDA iki farklı kopyada kayıt başlatır
const [k1, k2] = await Promise.all([
  istek(A, '/api/ogrenci-hesap/kayit-baslat', { ogrNo: '2023104015', eposta: 'z@ogr.edu.tr', telefon: '05001112233', sifre, sifreTekrar: sifre }),
  istek(B, '/api/ogrenci-hesap/kayit-baslat', { ogrNo: '2023104024', eposta: 'm@ogr.edu.tr', telefon: '05004445566', sifre, sifreTekrar: sifre })
]);
kontrol('Eşzamanlı iki kayıt başlatıldı', k1.kod === 200 && k2.kod === 200, JSON.stringify([k1, k2]));
const satirlar = db.prepare("SELECT anahtar FROM sistem_durumu WHERE anahtar LIKE 'ogrenci_%' ORDER BY anahtar").all().map((x) => x.anahtar);
kontrol('Her öğrenci D1\'de kendi satırında (biri diğerini ezmedi)', satirlar.includes('ogrenci_hesap:2023104015') && satirlar.includes('ogrenci_hesap:2023104024'), satirlar.join(', '));
const hashSatiri = db.prepare("SELECT deger_json AS deger FROM sistem_durumu WHERE anahtar = 'ogrenci_hesap:2023104015'").get();
kontrol('Öğrenci şifresi ücretsiz plana uygun (10k iterasyon, <10ms CPU)', hashSatiri && String(hashSatiri.deger).includes('pbkdf2_sha256$10000$'), hashSatiri && String(hashSatiri.deger).slice(0, 200));
const liste = await istek(B, '/api/ogrenci-hesap/hoca-liste', undefined, HB);
const kodlar = Object.fromEntries((liste.v.bekleyenKodlar || []).map((k) => [k.ogrNo, k.kod]));
kontrol('Öğretmen paneli (kopya B) iki kodu da görür', kodlar['2023104015'] && kodlar['2023104024'], JSON.stringify(liste.v.bekleyenKodlar));
// Kod, kaydın başladığı kopyanın TERSİNDE onaylanır
const o1 = await istek(B, '/api/ogrenci-hesap/kayit-onayla', { ogrNo: '2023104015', kod: kodlar['2023104015'] });
const o2 = await istek(A, '/api/ogrenci-hesap/kayit-onayla', { ogrNo: '2023104024', kod: kodlar['2023104024'] });
kontrol('Kod diğer kopyada onaylanabilir (önbellek bekletmez)', o1.kod === 200 && o2.kod === 200, JSON.stringify([o1, o2]));
const durum = await istek(A, '/api/ogrenci-hesap/hoca-liste', undefined, HB);
const aktif = (durum.v.ogrenciler || []).filter((o) => o.durum === 'aktif').map((o) => o.ogrNo);
kontrol('İki hesap da açık', aktif.includes('2023104015') && aktif.includes('2023104024'), aktif.join(','));
// Giriş A'da, sınav oturumu B'de
const g = await istek(A, '/api/ogrenci-hesap/giris', { ogrNo: '2023104015', sifre });
const tokSatir = db.prepare("SELECT anahtar FROM sistem_durumu WHERE anahtar LIKE 'ogrenci_token:%'").all().map((x) => x.anahtar);
kontrol('D1\'de giriş anahtarının kendisi değil özeti saklanır', g.kod === 200 && tokSatir.length === 3 && tokSatir.every((x) => /^ogrenci_token:[0-9A-F]{64}$/.test(x) && !x.includes(g.v.girisToken)), tokSatir.join(','));
const ot = await istek(B, '/api/ogrenci-oturum-baslat', { ogrNo: '2023104015', adSoyad: 'Zeynep Kaya', girisToken: g.v.girisToken });
kontrol('A\'da alınan giriş anahtarıyla B\'de sınav oturumu açılır', ot.kod === 200, JSON.stringify(ot.v).slice(0, 200));
const izinsiz = await istek(B, '/api/ogrenci-oturum-baslat', { ogrNo: '2023104024', adSoyad: 'Mehmet Demir' });
kontrol('Girişsiz oturum reddedilir', izinsiz.kod === 401);
const sifirla = await istek(B, '/api/ogrenci-hesap/hoca-sifirla', { ogrNo: '2023104024' }, HB);
const kalan = db.prepare("SELECT anahtar FROM sistem_durumu WHERE anahtar = 'ogrenci_hesap:2023104024'").all();
kontrol('Öğretmen sıfırlayınca öğrencinin satırı silinir', sifirla.kod === 200 && kalan.length === 0);
// Telefon eşleştirme: kod A kopyasında üretilir, telefon B kopyasında kullanır, A durumu görür
const es = await istek(A, '/api/telefon-eslestir/olustur', {}, HB);
kontrol('Telefon eşleştirme kodu üretildi (kopya A)', es.kod === 200 && /^[A-Z2-9]{8}$/.test(es.v.kod || ''), JSON.stringify(es.v));
const esTam = await istek(B, '/api/telefon-eslestir/tamamla', { kod: es.v.kod, cihaz: 'Android' });
kontrol('Telefon kodu başka kopyada kullanıp oturum aldı (kopya B)', esTam.kod === 200 && Boolean(esTam.v.token), JSON.stringify(esTam.v).slice(0, 160));
const esDurum = await istek(A, `/api/telefon-eslestir/durum?kod=${es.v.kod}`, undefined, HB);
kontrol('Bilgisayar (kopya A) telefonun bağlandığını görür', esDurum.v.durum === 'tamamlandi', JSON.stringify(esDurum.v));
const telPaket = await istek(A, '/api/mobil-ders-paketleri', undefined, { authorization: `Bearer ${esTam.v.token}` });
kontrol('Telefonun oturumu ders paketlerini çekebilir (kopya A)', telPaket.kod === 200 && telPaket.v.basarili === true, String(telPaket.kod));
const esTekrar = await istek(A, '/api/telefon-eslestir/tamamla', { kod: es.v.kod });
kontrol('Kullanılmış kod ikinci kez kullanılamaz', esTekrar.kod === 410);

// Öğrenci sonucu yayını (D1): A kopyasında açılır, B kopyasında öğrenci görür; itiraz; geri al
const yayin = await istek(A, '/api/sonuc-yayinla', { sinavId: 'KS-D1', sinavAdi: 'D1 Vize', sonuclar: [
  { ogrNo: '2023104015', puan: 70, dogru: 2, yanlis: 1, bos: 0, sorular: [{ no: '1', verilen: 'A', dogru: 'A', durum: 'dogru' }], benzerlik: 99 },
  { ogrNo: '2023104024', puan: 50, sorular: [] }
] }, HB);
kontrol('D1: öğretmen sonucu açar (2 öğrenci)', yayin.kod === 200 && yayin.v.yayinlanan === 2, JSON.stringify(yayin.v));
const ogrGiris = await istek(B, '/api/ogrenci-hesap/giris', { ogrNo: '2023104015', sifre });
const sonucB = await istek(A, '/api/ogrenci/sonuclarim', { ogrNo: '2023104015', girisToken: ogrGiris.v.girisToken });
const sB = (sonucB.v.sonuclar || [])[0] || {};
kontrol('D1: öğrenci yalnız kendi sonucunu görür (başka kopyada da); kopya alanı yok', sonucB.kod === 200 && sonucB.v.sonuclar.length === 1 && sB.ogrNo === '2023104015' && sB.puan === 70 && !/benzerlik|kopya/i.test(JSON.stringify(sonucB.v)), `${ogrGiris.kod} ${JSON.stringify(sonucB.v).slice(0, 160)}`);
const baskasi = await istek(A, '/api/ogrenci/sonuclarim', { ogrNo: '2023104024', girisToken: ogrGiris.v.girisToken });
kontrol('D1: başkasının numarasıyla sonuç görülemez (401)', baskasi.kod === 401);
const itz = await istek(B, '/api/ogrenci/itiraz', { ogrNo: '2023104015', girisToken: ogrGiris.v.girisToken, yayinId: sB.yayinId, soruNo: '1', aciklama: 'kontrol eder misiniz' });
const itzListe = await istek(A, '/api/itirazlar', {}, HB);
kontrol('D1: kalan itiraz hakkı 10 → 9 (başka kopyada da)', sonucB.v.kalanItiraz === 10 && itz.v.kalanItiraz === 9, `${sonucB.v.kalanItiraz} → ${itz.v.kalanItiraz}`);
kontrol('D1: itiraz kaydedilir ve öğretmenin listesinde görünür', itz.kod === 200 && (itzListe.v.itirazlar || []).some((x) => x.ogrNo === '2023104015' && x.sinavAdi === 'D1 Vize'), `${itz.kod} ${JSON.stringify(itzListe.v).slice(0, 160)}`);
const geriD1 = await istek(B, '/api/sonuc-yayinla', { sinavId: 'KS-D1', geriAl: true }, HB);
const sonraD1 = await istek(A, '/api/ogrenci/sonuclarim', { ogrNo: '2023104015', girisToken: ogrGiris.v.girisToken });
kontrol('D1: geri alınınca öğrenci sonucu görmez', geriD1.kod === 200 && (sonraD1.v.sonuclar || []).length === 0, JSON.stringify(sonraD1.v));
console.log(hata === 0 ? '\n=== WORKER + D1: TÜM KONTROLLER GEÇTİ ===' : `\n=== WORKER + D1: ${hata} HATA ===`);
process.exit(hata ? 1 : 0);
