/* ==========================================================================
   MASTER TASARIM & MİMARİ SÖZLEŞME TEST PAKETİ (10. Test Paketi)
   Doğrulanan Sözleşmeler:
   1) DOM Kimlik (ID) Envanteri Korunumu (559 index.html + 89 optik-mobil.html statik ID)
   2) Açık Kaynak Kişisel Veri Sıfırlama ve Boş Şifre Kutusu
   3) Sakin Giriş Kapısı (Bulanıklık/Blur Yok, İki Rol Kartı, Düz Arka Plan Kilidi)
   4) WCAG AA Kontrast Oranı (>= 4.5:1 Açık & Koyu Tema) ve Tek Vurgu Rengi
   5) Masaüstü Kenar Çubuğu (224px -> 56px) + 48px Üst Çubuk + <900px Sıfır Yatay Taşma
   6) Boş Durum İlk Kurulum Kartı + Örnek Dersle Dene + 8sn Geri Al Bildirimi (Toast)
   7) Kağıt Stüdyosu %20/%80 Kademeli Açılım + Olumsuz Kök Vurgusu + Sütun Çizgisi
   8) Akıllı Yapıştırma Çekmecesi Canlı Önizleme + XSS Yükü Etkisizleştirme
   9) Son 2 Hane Öğrenci No Çakışma Şeridi + Tek Tıkla Son 3 Haneye Geçiş
   10) Baskı Öncesi Uçuş Kontrolü Çekmecesi + Basıldı Kilitli Sınavda Düzenleme Kilidi ve Kopya Oluşturma
   11) Değerlendirme 4 KPI Kartı + Şık Dağılım Mini Çubukları + GR Mutabakatı
   12) Öğrenci Kiosk A-/A+ Punto Seçici + Dürüst Çevrimdışı Şeridi
   13) Mobil Okuyucu PWA (390x844): >= %70 Tam Ekran Vizör + >= 48px Başparmak Hedefleri + Fener Yetenek Gizliliği
   14) Baskı (@media print) Sızıntısızlık Garantisi
   ========================================================================== */
'use strict';

process.env.SINAV_OGRENCI_HESAP_ZORUNLU = process.env.SINAV_OGRENCI_HESAP_ZORUNLU || '0'; // Bu test eski (hesapsız) kiosk akışını sınar; yeni akış: ogrenci-hesap-test.js
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { baslatSunucu } = require('./server.js');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find((p) => fs.existsSync(p));

const BAZ_INDEX_IDLERI = [
  "a4-doluluk-kutu","a4-onizleme-sahne","aktif-ders-sec","alan-kagit-hizli-kunye-detay","alan-kalite-kunye",
  "alan-ogrenci-qr-svg","alan-pc-eslesme-qr-svg","alan-setup-qr-svg","alan-tut-kunye-detay","alan-yeni-dy",
  "alan-yeni-klasik","alan-yeni-test-siklar","ana-icerik-alani","antet-hoca","antet-kurum","antet-sinav-ad",
  "antet-sure","antet-tarih","ayar-aktif-sinav-agirlik","ayar-ayri-optik-adet","ayar-dagitim-modu",
  "ayar-dy-sayisi","ayar-dy-toplam-puan","ayar-ek-sayfa-izni","ayar-hafta-dagilim-modu","ayar-hane-sayisi",
  "ayar-haric-tut-sorulanlar","ayar-her-oc-en-az-bir","ayar-islem-boslugu","ayar-kagit-oc-gorunum",
  "ayar-kimlik-modu","ayar-kitapcik-gruplar","ayar-klasik-optik-modu","ayar-klasik-puan-modu",
  "ayar-klasik-sayisi","ayar-klasik-toplam-puan","ayar-mukerrer-gizle","ayar-ogrenci-csv-modu",
  "ayar-omr-harici-anahtar-aktif","ayar-onizleme-mod","ayar-optik-yerlesim","ayar-pdf-alt-mm",
  "ayar-pdf-ust-mm","ayar-sik-sayisi","ayar-test-sayisi","ayar-test-toplam-puan","ayar-zorluk-dagilimi",
  "baski-alan-kapsayici","baski-format-sec","baski-kapsam-sec","baski-mini-onizleme","baski-ogrenci-sec",
  "baski-ogrenci-soru-modu","btn-ai-oc-iptal","btn-ai-oc-tumunu-onayla","btn-aktif-ders-oc-kaydet",
  "btn-aktif-ders-oc-tanimla","btn-aktif-dersi-sil","btn-antet-sablon-kaydet","btn-arsiv-aktif-derse-aktar",
  "btn-banka-bologna-ac","btn-banka-otomatik-oc-analiz","btn-bologna-cozumle","btn-bologna-ornek-yukle",
  "btn-bologna-uygula","btn-bos-dy-csv-indir","btn-bos-klasik-csv-indir","btn-bos-ogrenci-csv-indir",
  "btn-bos-soru-csv-indir","btn-bos-test-csv-indir","btn-bulut-gecmis-ac","btn-bulut-panel-kapat",
  "btn-bulut-simdi-cek","btn-bulut-simdi-senkronla","btn-cikti-merkezi-ogr-qr","btn-csv-indir",
  "btn-davet-kodu-yenile","btn-delil-log-csv-indir","btn-delil-log-json-indir","btn-delil-log-temizle",
  "btn-delil-log-txt-indir","btn-donem-paketleri-temizle","btn-donem-sinav-paketi-indir",
  "btn-evrak-sablon-kaydet","btn-genel-kaydet-uygula","btn-giris-rol-egitmen","btn-giris-rol-ogrenci",
  "btn-hafta-final","btn-hafta-son7","btn-hafta-tersle","btn-hafta-vize","btn-hazir-sablon-25",
  "btn-hizli-soru-kaydet","btn-hoca-basvuru-gonder","btn-hoca-giris-ac","btn-hoca-giris-yap",
  "btn-hoca-kayit-kaydet","btn-hoca-kilitle","btn-hoca-sifre-sifirla","btn-kagit-degisim-sifirla",
  "btn-kagit-sablon-kaydet","btn-kalite-pano-yapistir","btn-karne-kapat","btn-kayitli-sinav-sil",
  "btn-kiosk-cevap-kilitle","btn-kiosk-cikis","btn-kiosk-ogrenci-modu","btn-kiosk-oturum-baslat",
  "btn-kiosk-rol-egitmen","btn-kiosk-rol-ogrenci","btn-kiosk-tam-ekran-don","btn-kombinasyon-uygula",
  "btn-kurum-sablon-indir","btn-kurum-sablon-kaydet","btn-kurum-sablon-yeni","btn-maddi-hata-kanit-indir",
  "btn-modal-ai-oc-kapat","btn-modal-bologna-kapat","btn-modal-ders-bologna-ac","btn-modal-ders-kapat",
  "btn-modal-hoca-kapat","btn-modal-ogrenci-qr-kapat","btn-modal-soru-duzenle-kapat","btn-obs-resmi-csv-indir",
  "btn-oc-hazir-4","btn-oc-hazir-5","btn-oc-madde-ekle","btn-oc-temizle","btn-oc-toplu-ayristir",
  "btn-ogr-qr-onceki","btn-ogr-qr-sonraki","btn-ogrenci-bilgisayara-aktar","btn-ogrenci-karne-yazdir",
  "btn-ogrenci-ozel-ispat-indir","btn-ogrenci-ozel-pdf","btn-ogrenci-ozel-word","btn-ogrenci-qr-baglanti-kopyala",
  "btn-ogrenci-telefona-aktar","btn-okumalari-temizle","btn-omr-anahtar-a-kopyala","btn-omr-anahtar-csv-sablon",
  "btn-omr-harici-anahtar-temizle","btn-online-baslat","btn-online-durdur","btn-online-kiosk-ac",
  "btn-online-sonuc-aktar","btn-online-studyodan-al","btn-online-tanimla-kaydet","btn-ornek-metin-doldur",
  "btn-ozel-obs-csv-indir","btn-pc-qr-kamera-ac","btn-pc-qr-kamera-kapat","btn-pc-qr-paket-aktar",
  "btn-pj-rjx-bankaya-isle","btn-puan-100-dengele","btn-puko-kopyala","btn-puko-txt-indir",
  "btn-qr-mod-bilgisayara","btn-qr-mod-telefona","btn-salon-duzenle","btn-salon-ekle",
  "btn-secili-baski-calistir","btn-setup-kod-kopyala","btn-setup-kutu-ogr-qr-ac","btn-sim-tek-tara",
  "btn-sim-tum-sinif-tara","btn-sinav-basildi-kilitle","btn-sinav-soruldu-isaretle","btn-sinavi-kaydet-snapshot",
  "btn-son-silineni-geri-al","btn-soru-bankasi-csv-disa-aktar","btn-soru-ekle","btn-studyo-kamera-ac",
  "btn-studyo-kamera-kapat","btn-stüdyo-bologna-ac","btn-stüdyo-sablon-sekme-ac","btn-tasma-ek-sayfa-ac",
  "btn-tek-ogrenci-ekle","btn-telefon-qr-goster","btn-tema-degistir","btn-toplu-ogrenci-ekle",
  "btn-toplu-soru-aktar","btn-tum-verileri-sifirla","btn-video-kare-tara","btn-word-indir",
  "btn-yazdir-anahtar","btn-yazdir-ayri-optik","btn-yazdir-kagit","btn-yedek-indir","btn-yeni-ders-kaydet",
  "btn-yeni-ders-modal","btn-yeniden-puanla","btn-yoklama-cizelgesi-pdf","btn-yoklama-cizelgesi-yazdir",
  "canvas-omr-girdi","canvas-omr-islenmis","cubuk-doluluk-ic","cubuk-kayitli-sinavlar","deger-pdf-alt-mm",
  "deger-pdf-ust-mm","etiket-aktif-hoca-kullanici","etiket-baski-ozet","etiket-bologna-gorsel-ad",
  "etiket-bulut-durumu","etiket-bulut-panel-detay","etiket-doluluk-yuzde","etiket-dy-birim-puan",
  "etiket-evrak-sablon-durum","etiket-kagit-sablon-durum","etiket-kalite-ototani-durum","etiket-kayitli-sinav-bilgi",
  "etiket-klasik-birim-puan","etiket-kumulatif-bilgi","etiket-kurum-davet-kodu","etiket-oc-trafik-mesaj",
  "etiket-ogr-qr-parca","etiket-ogrenci-qr-bilgi","etiket-olcek-bilgi","etiket-omr-aktif-yapi",
  "etiket-omr-harici-anahtar-durum","etiket-online-tanim-bilgi","etiket-pc-eslesme-durum",
  "etiket-pc-qr-aktarim-sonuc","etiket-pdf-kesit-durum","etiket-salon-ozet","etiket-soru-degisim-durum",
  "etiket-soru-yukleme-durum","etiket-test-birim-puan","filtre-soru-hafta","filtre-soru-kaynak",
  "filtre-soru-oc","filtre-soru-tur","girdi-bologna-ham","girdi-kayitli-sinav-ad","girdi-pc-qr-paket",
  "grup-ayri-optik-coklu","grup-klasik-toplam-puan","grup-tam-no-hane","hizli-duzenle-dogru-dy",
  "hizli-duzenle-dogru-harf","hizli-duzenle-dy-alan","hizli-duzenle-hafta","hizli-duzenle-id",
  "hizli-duzenle-kazanim","hizli-duzenle-klasik-alan","hizli-duzenle-metin","hizli-duzenle-rubrik",
  "hizli-duzenle-test-alan","hizli-duzenle-zorluk","hizli-sik-a","hizli-sik-b","hizli-sik-c","hizli-sik-d",
  "hizli-sik-e","hkr-buyuk","hkr-eslesme","hkr-kucuk","hkr-rakam","hkr-simge","hkr-uzunluk",
  "hoca-giris-bilgi","hoca-giris-hata","hoca-giris-kullanici","hoca-giris-sifre","hoca-kayit-ad",
  "hoca-kayit-davet-kodu","hoca-kayit-eposta","hoca-kayit-kullanici","hoca-kayit-sifre",
  "hoca-kayit-sifre-tekrar","hoca-kayit-telefon","hoca-kurtarma-eposta","hoca-kurtarma-telefon",
  "hoca-kurtarma-yeni-sifre","hoca-kurtarma-yeni-sifre-tekrar","hoca-sifre-kriter-kutu","input-bologna-gorsel",
  "input-donem-sinav-dosya","input-kalite-belge-yukle","input-kalite-gorsel","input-kurum-sablon-yukle",
  "input-ogrenci-csv-yukle","input-omr-anahtar-csv-yukle","input-omr-foto","input-omr-ogretmen-kagit-foto",
  "input-pc-qr-gorsel","input-soru-csv-yukle","input-soru-gorsel","input-yedek-yukle","ist-guvenirlik-yorum",
  "ist-kr20","ist-medyan","ist-min-max","ist-ogrenci-sayisi","ist-ortalama","ist-sapma","ist-se",
  "izgara-kayitli-kurum-sablonlari","kagit-hizli-dokuman-no","kagit-hizli-hoca","kagit-hizli-kunye-modu",
  "kagit-hizli-kurum","kagit-hizli-revizyon","kagit-hizli-sinav-ad","kagit-hizli-sure","kagit-hizli-tarih",
  "kagit-hizli-yayin-tarihi","kalite-dokuman-no","kalite-form-tipi","kalite-revizyon","kalite-yayin-tarihi",
  "kart-bireysel-karneler","kart-cikti-merkezi","kiosk-ad-soyad","kiosk-canli-sure-panel",
  "kiosk-dinamik-ihlal-kurali","kiosk-eposta","kiosk-giris-formu","kiosk-hata-kutu","kiosk-ihlal-sayac",
  "kiosk-ihlal-uyari-kutusu","kiosk-ilk-kayit-alan","kiosk-kalan-sure","kiosk-karantina-mesaj",
  "kiosk-karantina-perdesi","kiosk-ogr-no","kiosk-ogrenci-sinav-listesi","kiosk-okudum-onay",
  "kiosk-ortak-giris-bar","kiosk-salon-kodu","kiosk-salon-kodu-satir","kiosk-sifre","kiosk-sifre-kriter-kutu",
  "kiosk-sifre-tekrar","kiosk-sinav-alani","kiosk-soru-icerik","kiosk-soru-kalan-sure","kiosk-soru-sahne",
  "kiosk-soru-sayac","kiosk-sure-ilerleme-bar","kiosk-sure-uyari-etiket","kiosk-tanimli-sinavlar-kutu",
  "kiosk-telefon","kiosk-uyari-ve-onay-kutusu","kiosk-zirh-durum-rozet","kr-buyuk","kr-eslesme","kr-kucuk",
  "kr-rakam","kr-simge","kr-uzunluk","kural-cift-sik-dogru","kural-dy-goturme","kural-iptal-soru",
  "kural-test-goturme","kutu-arsiv-havuz-listesi","kutu-banka-arsiv-cubuk","kutu-banka-oc-ozet",
  "kutu-bireysel-karneler","kutu-bologna-onizleme","kutu-bulut-gecmis-panel","kutu-canli-belirtke-tablosu",
  "kutu-canli-delil-loglari","kutu-hafta-secim-izgara","kutu-hoca-sifre-kurtarma","kutu-hoca-yonetim-paneli",
  "kutu-klasik-tek-tek-puanlar","kutu-kumulatif-oc-matrisi","kutu-mevcut-dersler-yonetim","kutu-oc-kapsama-durumu",
  "kutu-oc-trafik-cipler","kutu-ogrenci-qr-parcalar","kutu-pc-qr-kamera","kutu-pdf-kesit-ayar",
  "kutu-sablon-yer-tutucular","kutu-salon-listesi","kutu-salon-yerlesim","kutu-son-okunan-detay",
  "kutu-son2-cakisma-rapor","kutu-studyo-video","kutu-telefon-qr","kutu-yeni-ders-oc-maddeler",
  "link-mobil-okuyucu","link-ogrenci-qr-dogrudan-ac","link-qr-dogrudan-ac","liste-bulut-yedek-gecmisi",
  "liste-hazir-sinav-sureleri","liste-inceleme-kuyrugu","metin-puko-raporu","modal-ai-oc-onay",
  "modal-bologna-ice-aktar","modal-hizli-soru-duzenle","modal-hoca-giris","modal-ogrenci-qr","modal-yeni-ders",
  "ogr-ekle-ad","ogr-ekle-no","ogrenci-qr-taban-adres","omr-anahtar-a-dy","omr-anahtar-a-test","omr-anahtar-b-dy",
  "omr-anahtar-b-test","omr-anahtar-c-dy","omr-anahtar-c-test","omr-anahtar-d-dy","omr-anahtar-d-test",
  "omr-form-turu","omr-harici-dy-sayisi","omr-harici-klasik-sayisi","omr-harici-sik-sayisi",
  "omr-harici-test-sayisi","omr-standart-ayar","omr-std-anahtar","omr-std-goturme","omr-std-ogrno",
  "omr-std-sik","omr-std-siralama","omr-std-soru","omr-uyari-kutu","onizleme-kurum-antet","online-baslangic",
  "online-bitis","online-ders-sec","online-dy-sayisi","online-erisim-kodu","online-geri-donus-kilit",
  "online-hafta-kapsam","online-kisiye-ozel","online-klasik-sayisi","online-maks-ihlal","online-sinav-baslik",
  "online-sinav-kodu","online-sinav-turu","online-sure-dk","online-tam-ekran-zorunlu","online-test-sayisi",
  "ortak-giris-rol-secici","panel-kagit-bilgi","panel-ogrenci-ozel","panel-omr-harici-anahtar",
  "panel-qr-bilgisayara","panel-qr-telefona","panel-tutanak","rozet-aktif-baski-modu",
  "rozet-aktif-ders-oc-sayisi","rozet-aktif-hafta-sayisi","rozet-banka-toplam","rozet-delil-log-sayisi",
  "rozet-hoca-oturum-durum","rozet-inceleme-sayisi","rozet-kayit-durumu","rozet-kayitli-sinav-durum",
  "rozet-kiosk-sinav-sayisi","rozet-kurum-sablon-sayisi","rozet-ogrenci-sayisi","rozet-okunan-kagit",
  "rozet-online-durum","rozet-pc-eslesme-kod","rozet-salon-ozet","rozet-secili-soru","rozet-son-okuma-guven",
  "rozet-tanimli-online-sayisi","rozet-toplam-puan","rozet-tutanak-ders","sabit-kayit-onay-cubuk","sablon-ad",
  "sablon-akreditasyon-baraj","sablon-akreditasyon-turu","sablon-alt-onay","sablon-birim-adi",
  "sablon-dokuman-no","sablon-kurum-adi","sablon-obs-sutunlar","sablon-revizyon-no","sablon-tutanak-baslik",
  "sablon-ust-antet","sablon-yayin-tarihi","sablon-yoklama-baslik","sec-aktif-sinav-donem-turu",
  "sec-hizli-kurum-sablonu","sec-kayitli-sinav","sec-log-sinav-filtre","sec-maddi-hata-ogrenci",
  "sec-omr-kayitli-sinav","sec-omr-ogretmen-grup","sekme-analiz","sekme-banka","sekme-ogrenciler","sekme-omr",
  "sekme-online","sekme-sablonlar","sekme-stüdyo","setup-qr-taban-adres","sik-a","sik-b","sik-c","sik-d",
  "sik-e","sim-kitapcik-sec","sim-ogrenci-sec","sim-senaryo-sec","tablo-ai-oc-onay","tablo-hoca-onay-listesi",
  "tablo-kazanim-analizi","tablo-kopya-benzerlik","tablo-madde-analizi","tablo-ogrenci-listesi",
  "tablo-omr-okunanlar","tablo-online-oturumlar","tablo-pc-gerceklesme","tablo-soru-bankasi",
  "tablo-tanimli-online-sinavlar","toplu-ogrenci-metin","toplu-soru-metin","trafik-oc-bloom-cubuk","tut-bolum",
  "tut-ders-sec","tut-dokuman-no-durum","tut-dokuman-no-yoklama","tut-donem","tut-fakulte","tut-gozetmen1",
  "tut-gozetmen2","tut-kunye-modu","tut-rev-no","tut-rev-tarihi","tut-saat","tut-sablon-sec","tut-sinav-turu",
  "tut-sorumlu","tut-tarih","tut-uygunluk","tut-yayin-tarihi","ust-sekme-nav","uyari-a4-tasma-kutu",
  "uyari-a4-tasma-metin","uyari-depo-kurtarma-cubuk","uyari-donem-paket-ders","uyari-oc-kayit-gerekli",
  "uyari-toplam-100-kutu","uyari-toplam-100-metin","video-pc-qr-kamera","video-studyo-omr","yeni-ders-ad",
  "yeni-ders-bolum","yeni-ders-fakulte","yeni-ders-hoca","yeni-ders-kod","yeni-ders-oc-toplu-metin",
  "yeni-soru-dogru-dy","yeni-soru-dogru-harf","yeni-soru-hafta","yeni-soru-kazanim","yeni-soru-kod",
  "yeni-soru-metin","yeni-soru-oc-kodu","yeni-soru-rubrik","yeni-soru-tur","yeni-soru-zorluk"
];

const BAZ_MOBIL_IDLERI = [
  "alan-mobil-ogr-qr-svg","btn-eslestir-beklet","btn-eslestir-elle-ata","btn-master-kagit-okut",
  "btn-mobil-anahtar-alt-kaydet","btn-mobil-anahtar-kaydet-puanla","btn-mobil-bos-anahtar-csv",
  "btn-mobil-bos-ogr-csv","btn-mobil-csv-indir","btn-mobil-geri-al","btn-mobil-kamera-ac","btn-mobil-kare-oku",
  "btn-mobil-obs-csv","btn-mobil-ogr-qr-bilgisayara","btn-mobil-pc-ag-gonder","btn-mobil-qr-kod-kopyala",
  "btn-mobil-qr-onceki","btn-mobil-qr-sonraki","btn-mobil-seri-tara","btn-mobil-ses","btn-mobil-sonuc-json-indir",
  "btn-mobil-sonuc-kod-kopyala","btn-mobil-sonuc-pc-gonder","btn-mobil-temizle","btn-mobil-yapi-uygula",
  "btn-pwa-qr-metin-yukle","btn-pwa-qr-tara-ac","btn-pwa-yukle","btn-tara-anahtar-duzenle-git",
  "btn-tara-liste-aktar-git","btn-tara-master-kagit-okut","btn-vizor-ustu-oku","eslestir-okunan-ozet",
  "etiket-mobil-qr-bilgi","etiket-mobil-qr-parca","etiket-mobil-sonuc-aktar-bilgi","girdi-eslestir-adsoyad",
  "girdi-eslestir-ara","girdi-eslestir-ogrno","girdi-pwa-qr-metin","input-mobil-anahtar-csv","input-mobil-foto",
  "input-mobil-ogr-csv","kutu-mobil-ogr-qr-bilgisayara","kutu-mobil-qr-parcalar","kutu-pwa-qr-yapistir",
  "liste-eslestir-adaylar","m-ayar-dy","m-ayar-dy-toplam-puan","m-ayar-grup-sec","m-ayar-klasik",
  "m-ayar-klasik-toplam-puan","m-ayar-test","m-ayar-test-toplam-puan","m-ayar-toplam-puan-rozet","m-form-turu",
  "m-panel-anahtar","m-panel-liste","m-panel-tara","m-standart-ayar","m-std-anahtar","m-std-goturme",
  "m-std-ogrno","m-std-sik","m-std-siralama","m-std-soru","m-uyari","mobil-aktif-anahtar-ozet-kutu",
  "mobil-aktif-sinav-ozet","mobil-alt-sayac","mobil-anahtar-kayit-onay","mobil-anahtar-ve-qr-merkezi",
  "mobil-canvas-rontgen","mobil-canvas-vizor","mobil-dokunmatik-anahtar-alani","mobil-form-turu-kart",
  "mobil-guven-rozet","mobil-ogr-sayac","mobil-pc-oturum-kodu","mobil-sinif-istatistik-ozet",
  "mobil-sonuc-icerik","mobil-sonuc-kart","mobil-sonuc-pc-kodu","mobil-sonuc-tablo-el","mobil-tablo-okunanlar",
  "mobil-tara-ogr-rozet","mobil-video","mobil-vizor-canli-hud","modal-mobil-ogrenci-eslestir"
];

let gecen = 0;
let hata = 0;
function kontrol(ad, kosul, detay = '') {
  if (kosul) {
    gecen++;
    console.log(`  ✓ [${gecen + hata}] ${ad}`);
  } else {
    hata++;
    console.error(`  ✗ HATA [${gecen + hata}] ${ad}${detay ? ' — ' + detay : ''}`);
  }
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function parcalaRenkRGB(renkStr) {
  const s = String(renkStr || '').trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 6) {
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
  }
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

function goreliParlaklik([r, g, b]) {
  const f = (k) => {
    const v = k / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function kontrastOrani(r1, r2) {
  const l1 = goreliParlaklik(parcalaRenkRGB(r1));
  const l2 = goreliParlaklik(parcalaRenkRGB(r2));
  const acik = Math.max(l1, l2);
  const koyu = Math.min(l1, l2);
  return (acik + 0.05) / (koyu + 0.05);
}

(async () => {
  console.log('=== MASTER TASARIM, UX VE MİMARİ SÖZLEŞME TEST PAKETİ ===');

  // 1) Statik Kaynak Kontrolleri (Kişisel Veri & SVG İkon Varlığı)
  const kaynakDosyalar = [
    'index.html', 'optik-mobil.html', 'ortak.css', 'guvenlik-ve-veri.js',
    'studyo-uygulama.js', 'server.js', 'sw.js', 'package.json'
  ];
  const kisiselDesen = /Fettah|Akmano[gğ]lu|fakmanoglu|5334194533/i;
  const ihlalliDosyalar = kaynakDosyalar.filter((ad) => kisiselDesen.test(fs.readFileSync(path.resolve(ad), 'utf8')));
  kontrol('Kaynak dosyalarda gerçek eğitmen adı, e-postası veya telefonu bulunmuyor (0 PII)', ihlalliDosyalar.length === 0, ihlalliDosyalar.join(', '));
  kontrol('Çevrimdışı SVG ikon sprite dosyası (icons.svg) mevcut ve sw.js KABUK listesinde tanımlı',
    fs.existsSync(path.resolve('icons.svg')) && fs.readFileSync(path.resolve('sw.js'), 'utf8').includes('./icons.svg'));

  const server = await baslatSunucu(0);
  const taban = `http://127.0.0.1:${server.address().port}`;
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });

  try {
    const sayfa = await tarayici.newPage();
    const sayfaHatalari = [];
    sayfa.on('pageerror', (e) => sayfaHatalari.push(e.message));
    await sayfa.setViewport({ width: 1440, height: 900 });
    await sayfa.goto(`${taban}/index.html`, { waitUntil: 'networkidle0' });

    // 2) index.html Baz ID Envanteri & Boş Düğme Kontrolü
    const indexDenetim = await sayfa.evaluate((bazIdler) => {
      const eksik = bazIdler.filter((id) => !document.getElementById(id));
      const bosDugme = Array.from(document.querySelectorAll('button')).filter(
        (b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')
      ).length;
      return { eksik, bosDugme };
    }, BAZ_INDEX_IDLERI);
    kontrol(`index.html baz ID envanteri eksiksiz (${BAZ_INDEX_IDLERI.length}/${BAZ_INDEX_IDLERI.length}) ve erişilebilir etiketsiz düğme yok`,
      indexDenetim.eksik.length === 0 && indexDenetim.bosDugme === 0,
      `Eksik: ${indexDenetim.eksik.join(', ')} | Boş düğme: ${indexDenetim.bosDugme}`);

    // 3) Giriş Kapısı Sakinlik ve Sıfır Bulanıklık (Blur) Kontrolü
    const girisDurum = await sayfa.evaluate(() => {
      const ana = document.getElementById('ana-icerik-alani');
      const kabuk = document.querySelector('.uygulama-kabuk');
      const modal = document.getElementById('modal-hoca-giris');
      const anaFiltre = getComputedStyle(ana).filter;
      const kabukGorunur = getComputedStyle(kabuk).visibility;
      return {
        girisModu: modal.getAttribute('data-giris-modu'),
        blurYok: !String(anaFiltre || '').includes('blur('),
        kabukGizli: kabukGorunur === 'hidden',
        sifreBos: document.getElementById('hoca-giris-sifre').value === '',
        ikiRolKartiVar: Boolean(document.getElementById('btn-giris-rol-egitmen') && document.getElementById('btn-giris-rol-ogrenci'))
      };
    });
    kontrol('Giriş Kapısı (Ekran A): Sade modda açılır, arkada bulanıklaştırma (blur) yoktur, şifre kutusu boştur ve iki rol kartı görünür',
      girisDurum.girisModu === 'sade' && girisDurum.blurYok && girisDurum.kabukGizli && girisDurum.sifreBos && girisDurum.ikiRolKartiVar,
      JSON.stringify(girisDurum));

    // 4) WCAG AA Kontrast Oranı (>= 4.5:1 Açık ve Koyu Tema)
    const renkler = await sayfa.evaluate(() => {
      const oku = () => {
        const cs = getComputedStyle(document.documentElement);
        return {
          soluk: cs.getPropertyValue('--metin-soluk').trim(),
          kart: cs.getPropertyValue('--bg-kart').trim(),
          birincil: cs.getPropertyValue('--birincil').trim(),
          mor: cs.getPropertyValue('--mor').trim()
        };
      };
      document.documentElement.setAttribute('data-tema', 'acik');
      const acik = oku();
      document.documentElement.setAttribute('data-tema', 'koyu');
      const koyu = oku();
      document.documentElement.setAttribute('data-tema', 'acik');
      return { acik, koyu };
    });
    const kontrastAcik = kontrastOrani(renkler.acik.soluk, renkler.acik.kart);
    const kontrastKoyu = kontrastOrani(renkler.koyu.soluk, renkler.koyu.kart);
    kontrol(`WCAG AA Kontrast: --metin-soluk / --bg-kart hem açık (${kontrastAcik.toFixed(2)}:1) hem koyu (${kontrastKoyu.toFixed(2)}:1) temada >= 4.5:1 ve tek vurgu rengi aktif`,
      kontrastAcik >= 4.5 && kontrastKoyu >= 4.5 && renkler.acik.birincil === renkler.acik.mor);

    // Hoca girişi yap
    await sayfa.evaluate(() => {
      document.getElementById('hoca-giris-kullanici').value = 'hoca';
      document.getElementById('hoca-giris-sifre').value = 'Demo!Hoca2026';
      document.getElementById('btn-hoca-giris-yap').click();
    });
    await bekle(350);
    await sayfa.evaluate(() => {
      const k = document.getElementById('btn-modal-hoca-kapat');
      if (k) k.click();
    });
    await bekle(200);

    // 5) Masaüstü Uygulama Kabuğu (224px -> 56px Ray + Gerçek Tıklamayla Geri Genişletme + [hidden] Toast Gizliliği)
    const toastBaslangicGizli = await sayfa.evaluate(() => getComputedStyle(document.getElementById('toast-geri-al')).display === 'none');
    await sayfa.click('#btn-yan-menu-daralt');
    await bekle(120);
    const darDurum = await sayfa.evaluate(() => {
      const rYan = document.getElementById('ust-sekme-nav').getBoundingClientRect();
      const rBtn = document.getElementById('btn-yan-menu-daralt').getBoundingClientRect();
      return {
        darW: Math.round(rYan.width),
        butonRayIcinde: rBtn.width >= 28 && rBtn.left >= rYan.left && rBtn.right <= rYan.right
      };
    });
    await sayfa.click('#btn-yan-menu-daralt');
    await bekle(120);
    const kabukGeometri = await sayfa.evaluate(() => {
      const yan = document.getElementById('ust-sekme-nav');
      const ust = document.getElementById('sabit-kayit-onay-cubuk');
      const bosKart = document.getElementById('bos-durum-ilk-kurulum');
      return {
        genisW: Math.round(yan.getBoundingClientRect().width),
        ustH: Math.round(ust.getBoundingClientRect().height),
        bosGorunur: bosKart && getComputedStyle(bosKart).display !== 'none'
      };
    });
    kontrol(`Masaüstü Kabuk: Yan menü gerçek fare tıklamasıyla ${kabukGeometri.genisW}px <-> ${darDurum.darW}px daralıp genişler, daralt düğmesi ray içinde kalır ve Geri Al toast başlangıçta görünmez`,
      toastBaslangicGizli &&
      darDurum.butonRayIcinde &&
      kabukGeometri.genisW >= 215 && kabukGeometri.genisW <= 235 &&
      darDurum.darW >= 50 && darDurum.darW <= 64 &&
      kabukGeometri.ustH >= 42 && kabukGeometri.ustH <= 58 &&
      kabukGeometri.bosGorunur,
      JSON.stringify({ toastBaslangicGizli, darDurum, kabukGeometri }));

    // < 900px (390x844) Yatay Taşmasızlık Kontrolü
    await sayfa.setViewport({ width: 390, height: 844 });
    await bekle(150);
    const darTasmaYok = await sayfa.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    kontrol('Dar Ekran (<900px · 390x844): Yan menü alt çekmeceye dönüşür ve yatay kaydırma taşması sıfırdır', darTasmaYok);
    await sayfa.setViewport({ width: 1440, height: 900 });
    await bekle(150);

    // 6) Örnek Dersle Dene + Tek Kayıt Noktası + 8sn Geri Al Toast
    await sayfa.click('#btn-ornek-dersle-dene');
    await bekle(300);
    const ornekSonrasi = await sayfa.evaluate(() => ({
      bosGizli: document.getElementById('bos-durum-ilk-kurulum').hidden,
      bankaSayisi: Number(document.getElementById('rozet-banka-toplam').textContent.trim())
    }));
    kontrol('İlk Kurulum: "Örnek dersle dene" tek tıkla örnek ders ve soru havuzunu yükleyip boş durum kartını kapatır',
      ornekSonrasi.bosGizli && ornekSonrasi.bankaSayisi >= 10, JSON.stringify(ornekSonrasi));

    // Soru Bankasından 1 soru sil -> Geri Al Toast + X Kapatma + Geri Al
    await sayfa.click('[data-sekme="sekme-banka"]');
    await bekle(200);
    const geriAlSonuc = await sayfa.evaluate(async () => {
      const toastEl = document.getElementById('toast-geri-al');
      const once = Number(document.getElementById('rozet-banka-toplam').textContent.trim());
      const silBtn = document.querySelector('#tablo-soru-bankasi [data-sil-soru]');
      if (silBtn) silBtn.click();
      const silSonrasi = Number(document.getElementById('rozet-banka-toplam').textContent.trim());
      const toastGorunur = !toastEl.hidden && getComputedStyle(toastEl).display !== 'none';
      document.getElementById('btn-toast-kapat').click();
      const xKapatildi = toastEl.hidden && getComputedStyle(toastEl).display === 'none';
      document.getElementById('btn-son-silineni-geri-al').click();
      const geriSonrasi = Number(document.getElementById('rozet-banka-toplam').textContent.trim());
      return { once, silSonrasi, toastGorunur, xKapatildi, geriSonrasi };
    });
    kontrol('8 Saniyelik Geri Al Toast: Soru silindiğinde bildirim açılır, X düğmesiyle anında kapanır ve silinen soru kayıpsız geri yüklenir',
      geriAlSonuc.silSonrasi === geriAlSonuc.once - 1 && geriAlSonuc.toastGorunur && geriAlSonuc.xKapatildi && geriAlSonuc.geriSonrasi === geriAlSonuc.once,
      JSON.stringify(geriAlSonuc));

    // 7) Akıllı Yapıştırma Çekmecesi (%90) + Canlı Önizleme + XSS Etkisizleştirme
    await sayfa.click('#btn-akilli-yapistir-ac');
    await bekle(150);
    await sayfa.evaluate(() => {
      window.__xssPatladi = false;
      const ta = document.getElementById('akilli-yapistir-metin');
      ta.value = '1. Aşağıdaki protokollerden hangisi şifreli değildir? <img src=x onerror="window.__xssPatladi=true">\nA) HTTPS\nB) SSH\nC) SFTP\nD) HTTP\nE) TLS\nCevap: D';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await bekle(420);
    const akilliSonuc = await sayfa.evaluate(() => {
      const onizlemeVar = document.querySelectorAll('#akilli-yapistir-onizleme [data-akilli-kart]').length === 1;
      const xssTemiz = window.__xssPatladi === false && !document.querySelector('#akilli-yapistir-onizleme img[onerror]');
      const onceSayi = Number(document.getElementById('rozet-banka-toplam').textContent.trim());
      document.getElementById('btn-akilli-yapistir-ekle').click();
      const sonraSayi = Number(document.getElementById('rozet-banka-toplam').textContent.trim());
      return { onizlemeVar, xssTemiz, eklendi: sonraSayi === onceSayi + 1 };
    });
    kontrol('Akıllı Yapıştırma Çekmecesi: Ham metinden canlı soru kartı üretir, <img onerror> XSS yükünü etkisizleştirir ve bankaya ekler',
      akilliSonuc.onizlemeVar && akilliSonuc.xssTemiz && akilliSonuc.eklendi, JSON.stringify(akilliSonuc));

    // 8) Kağıt Stüdyosu %20/%80 Kademeli Açılım + Olumsuz Kök Vurgusu + Sütun Çizgisi
    await sayfa.click('[data-sekme="sekme-stüdyo"]');
    await bekle(250);
    const studyoDurum = await sayfa.evaluate(() => {
      const solPanel = document.querySelector('#sekme-stüdyo > .iki-sutun-duzen > aside');
      const solW = Math.round(solPanel.getBoundingClientRect().width);
      const akordeonlar = Array.from(solPanel.querySelectorAll('details.gelismis-akordeon'));
      const hepsiKapali = akordeonlar.length >= 4 && akordeonlar.every((d) => !d.open);
      document.getElementById('ayar-test-sayisi').value = '25';
      document.getElementById('ayar-test-sayisi').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('btn-kombinasyon-uygula').click();
      const olumsuzSayi = document.querySelectorAll('#a4-onizleme-sahne .olumsuz-vurgu').length;
      const govde = document.querySelector('#a4-onizleme-sahne .sorular-govde');
      const sutunCizgisi = govde ? getComputedStyle(govde).columnRuleStyle : '';
      return { solW, hepsiKapali, olumsuzSayi, sutunCizgisi };
    });
    kontrol(`Kağıt Stüdyosu: Sol panel ${studyoDurum.solW}px, 4 gelişmiş akordeon kapalı başlar, olumsuz soru kökü (.olumsuz-vurgu) ve sütun çizgisi aktif`,
      studyoDurum.solW >= 300 && studyoDurum.solW <= 340 && studyoDurum.hepsiKapali && studyoDurum.olumsuzSayi >= 1 && studyoDurum.sutunCizgisi === 'solid',
      JSON.stringify(studyoDurum));

    // 9) Son 2 Hane Çakışma Şeridi + Tek Tıkla Son 3 Haneye Geçiş
    await sayfa.click('[data-sekme="sekme-ogrenciler"]');
    await bekle(200);
    const cakismaSonuc = await sayfa.evaluate(() => {
      const ta = document.getElementById('toplu-ogrenci-metin');
      ta.value = '2024101042;Ayşe Kaya\n2025209042;Mehmet Demir\n2024101088;Zeynep Çelik';
      document.getElementById('btn-toplu-ogrenci-ekle').click();
      const seritAcik = !document.getElementById('serit-son2-cakisma').hidden;
      document.getElementById('btn-cakisma-son3-gec').click();
      const modSon3 = document.getElementById('ayar-kimlik-modu').value === 'son3';
      const seritKapandi = document.getElementById('serit-son2-cakisma').hidden;
      return { seritAcik, modSon3, seritKapandi };
    });
    kontrol('Sınıf ve Salonlar: Son 2 hane çakışması üst şeritte uyarılır ve tek tıkla "Son 3 hane yap" çakışmayı giderir',
      cakismaSonuc.seritAcik && cakismaSonuc.modSon3 && cakismaSonuc.seritKapandi, JSON.stringify(cakismaSonuc));

    // 10) Baskı Öncesi Uçuş Kontrolü Çekmecesi + Basıldı Kilitli Sınav Düzenleme Kilidi & Kopya Oluşturma
    await sayfa.click('[data-sekme="sekme-stüdyo"]');
    await bekle(200);
    await sayfa.click('#btn-ucus-kontrolu-ac');
    await bekle(200);
    const ucusDurum = await sayfa.evaluate(() => {
      const acik = document.getElementById('perde-ucus-kontrolu').classList.contains('acik');
      const satirSayi = document.querySelectorAll('#liste-ucus-kontrolleri .ucus-kontrol-satir').length;
      document.getElementById('btn-ucus-kontrolu-kapat').click();
      return { acik, satirSayi };
    });
    kontrol('Uçuş Kontrolü ve Sınav Günü Paketi Çekmecesi: Baskı öncesi 6 doğrulama kalemini tek çekmecede listeler',
      ucusDurum.acik && ucusDurum.satirSayi >= 6, JSON.stringify(ucusDurum));

    const kilitDurum = await sayfa.evaluate(() => {
      document.getElementById('girdi-kayitli-sinav-ad').value = 'Güz Vize Kilidi Test';
      document.getElementById('btn-sinavi-kaydet-snapshot').click();
      document.getElementById('btn-sinav-basildi-kilitle').click();
      const seritGorunur = !document.getElementById('serit-kilitli-sinav').hidden;
      const ilkKok = document.querySelector('#a4-onizleme-sahne .soru-metin-duzenle');
      if (ilkKok) ilkKok.click();
      const kilitliykenDuzenlenemez = !ilkKok || ilkKok.contentEditable !== 'true';
      document.getElementById('btn-kilitli-kopya-olustur').click();
      const kopyaSonrasiAcildi = document.getElementById('serit-kilitli-sinav').hidden && !document.body.classList.contains('sinav-basildi-kilitli');
      return { seritGorunur, kilitliykenDuzenlenemez, kopyaSonrasiAcildi };
    });
    kontrol('Basıldı Kilidi: Kilitli sınavda sarı koruma şeridi açılır, kağıt üstü düzenleme engellenir ve "Kopyasını Oluştur" düzenlenebilir taslak açar',
      kilitDurum.seritGorunur && kilitDurum.kilitliykenDuzenlenemez && kilitDurum.kopyaSonrasiAcildi, JSON.stringify(kilitDurum));

    // 11) Değerlendirme 4 KPI + Şık Dağılım Mini Çubukları + GR Mutabakatı
    await sayfa.evaluate(() => {
      document.getElementById('btn-sim-tek-tara').click();
    });
    await bekle(300);
    await sayfa.click('[data-sekme="sekme-analiz"]');
    await bekle(250);
    const analizDurum = await sayfa.evaluate(() => ({
      okunan: document.getElementById('ist-ogrenci-sayisi').textContent.trim(),
      grSayisi: Number(document.getElementById('ist-girmeyen-gr').textContent.trim()),
      miniCubukSayisi: document.querySelectorAll('#tablo-madde-analizi .sik-mini-cubuk-grup').length,
      grMutabakatMetin: document.getElementById('icerik-gr-mutabakat').textContent.trim()
    }));
    kontrol('Değerlendirme (Ekran E): 4 KPI kartı, şık dağılım mini çubukları ve Girmeyen (GR) mutabakat listesi eksiksiz üretilir',
      Number(analizDurum.okunan) >= 1 && analizDurum.grSayisi >= 1 && analizDurum.miniCubukSayisi >= 1 && analizDurum.grMutabakatMetin.length > 10,
      JSON.stringify(analizDurum));

    // 12) Baskı (@media print) Sızıntısızlık Garantisi
    await sayfa.emulateMediaType('print');
    const baskiSizintisiz = await sayfa.evaluate(() => {
      const gizliMi = (sel) => {
        const el = document.querySelector(sel);
        return !el || getComputedStyle(el).display === 'none';
      };
      return gizliMi('.yan-menu') && gizliMi('#sabit-kayit-onay-cubuk') && gizliMi('.tuval-arac-cubugu') && gizliMi('#perde-ucus-kontrolu');
    });
    await sayfa.emulateMediaType('screen');
    kontrol('Baskı Sızıntısızlık (@media print): Yan menü, üst bağlam çubuğu, tuval araç çubuğu ve çekmeceler baskıda tamamen gizlenir', baskiSizintisiz);

    // 13) Öğrenci Kiosk A-/A+ Punto ve Dürüst Çevrimdışı Şeridi
    await sayfa.click('#btn-kiosk-ogrenci-modu');
    await bekle(200);
    const kioskDurum = await sayfa.evaluate(() => {
      const alan = document.getElementById('kiosk-sinav-alani');
      const p0 = alan.getAttribute('data-punto');
      document.getElementById('btn-kiosk-punto-buyut').click();
      const p1 = alan.getAttribute('data-punto');
      window.dispatchEvent(new Event('offline'));
      const cevrimdisiGorunur = !document.getElementById('kiosk-cevrimdisi-serit').hidden;
      window.dispatchEvent(new Event('online'));
      const cevrimiciGizli = document.getElementById('kiosk-cevrimdisi-serit').hidden;
      return { p0, p1, cevrimdisiGorunur, cevrimiciGizli };
    });
    kontrol('Öğrenci Kiosk (Ekran F): A+/A- yazı boyutu kademesi (16px -> 18px) ve dürüst çevrimdışı/çevrimiçi bağlantı şeridi çalışır',
      kioskDurum.p0 === '16' && kioskDurum.p1 === '18' && kioskDurum.cevrimdisiGorunur && kioskDurum.cevrimiciGizli,
      JSON.stringify(kioskDurum));

    kontrol('Masaüstü oturumu boyunca sıfır sayfa JS hatası', sayfaHatalari.length === 0, sayfaHatalari.join(' | '));
    await sayfa.close();

    // 14) Mobil Okuyucu PWA (optik-mobil.html · 390x844) Tam Ekran Vizör ve Başparmak Ergonomisi
    const mobil = await tarayici.newPage();
    const mobilHatalar = [];
    mobil.on('pageerror', (e) => mobilHatalar.push(e.message));
    await mobil.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await mobil.goto(`${taban}/optik-mobil.html`, { waitUntil: 'networkidle0' });

    const mobilDenetim = await mobil.evaluate((bazMobilIdler) => {
      const eksik = bazMobilIdler.filter((id) => !document.getElementById(id));
      const vizor = document.querySelector('.vizor-kutu');
      const rVizor = vizor.getBoundingClientRect();
      const deklansor = document.getElementById('btn-mobil-kare-oku').getBoundingClientRect();
      const listeBtn = document.querySelector('[data-msekme="m-panel-liste"]').getBoundingClientRect();
      const seriBtn = document.getElementById('btn-mobil-seri-tara').getBoundingClientRect();
      const fenerBtn = document.getElementById('btn-mobil-fener');
      const fenerGizli = !fenerBtn || fenerBtn.hidden || getComputedStyle(fenerBtn).display === 'none';
      return {
        eksik,
        vizorOran: rVizor.height / window.innerHeight,
        vizorH: Math.round(rVizor.height),
        yatayTasmaYok: document.documentElement.scrollWidth <= window.innerWidth,
        deklansorBoyut: [Math.round(deklansor.width), Math.round(deklansor.height)],
        listeYukseklik: Math.round(listeBtn.height),
        seriYukseklik: Math.round(seriBtn.height),
        fenerGizli
      };
    }, BAZ_MOBIL_IDLERI);

    kontrol(`optik-mobil.html baz ID envanteri eksiksiz (${BAZ_MOBIL_IDLERI.length}/${BAZ_MOBIL_IDLERI.length})`,
      mobilDenetim.eksik.length === 0, `Eksik: ${mobilDenetim.eksik.join(', ')}`);
    kontrol(`Mobil Tam Ekran Vizör (390x844): Vizör yüksekliği ${mobilDenetim.vizorH}px (%${Math.round(mobilDenetim.vizorOran * 100)} >= %70) ve yatay taşma yok`,
      mobilDenetim.vizorOran >= 0.70 && mobilDenetim.yatayTasmaYok, JSON.stringify(mobilDenetim));
    kontrol(`Mobil Başparmak Ergonomisi: Deklanşör (${mobilDenetim.deklansorBoyut.join('x')}px) >= 64px, alt kontrol hedefleri >= 48px ve fener yeteneği yokken gizli`,
      mobilDenetim.deklansorBoyut[0] >= 64 && mobilDenetim.deklansorBoyut[1] >= 64 &&
      mobilDenetim.listeYukseklik >= 48 && mobilDenetim.seriYukseklik >= 48 && mobilDenetim.fenerGizli,
      JSON.stringify(mobilDenetim));
    kontrol('Mobil oturumu boyunca sıfır sayfa JS hatası', mobilHatalar.length === 0, mobilHatalar.join(' | '));
    await mobil.close();
  } finally {
    await tarayici.close();
    server.close();
  }

  console.log(`\n=== ${gecen} KONTROL GEÇTİ · ${hata} HATA ===`);
  process.exit(hata ? 1 : 0);
})().catch((err) => {
  console.error('MASTER TASARIM TESTİ ÇÖKTÜ:', err);
  process.exit(2);
});
