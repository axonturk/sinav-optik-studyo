# Sınav Optik Stüdyosu & Mobil OMR

Öğretmenler için bağımsız **A4 sınav kağıdı hazırlama stüdyosu**, **telefon kamerasıyla optik form okuyucu (OMR)** ve **akademik madde analizi** platformu. Kurulum gerektirmeyen, tarayıcıda çalışan bir PWA'dır.

## Özellikler
- A/B/C/D kitapçıklı, şık karıştırmalı, 1 A4 önlü-arkalı sınav kağıdı ve cevap anahtarı (Word / PDF / yazdır)
- Tek kaynaklı optik form: basılan form ile okuma haritası aynı yerleşimden üretilir (kaymaz)
- Fotoğraf/kamera ile okuma: formu sayfanın herhangi bir yerinde bulur, perspektif ve 90°/180° dönüklüğü düzeltir; form bulunamazsa yanlış puan üretmez
- **Standart (hazır baskı) optik form** okuma: köşe işareti gerekmez
- Öğrenciye özel kağıt, çoklu salon dağıtımı, tutanak/yoklama evrakları
- Madde analizi (pj, rjx), KR-20, kopya benzerliği
- Zero-Trust online sınav sunucusu (`server.js`): sunucu puanı üretir, istemci puan/kağıt gönderemez
- PWA: ana ekrana eklenir, çevrimdışı açılır (`optik-mobil.html`)

## Çalıştırma
```bash
npm install
npm start          # http://127.0.0.1:3000
```
Windows'ta `baslat.bat` ile de başlatılabilir. Telefon ve bilgisayar aynı Wi‑Fi'de olmalıdır.

> Kamera ve "ana ekrana ekle" yalnızca **HTTPS** veya `localhost` üzerinde çalışır. Yerel ağda (`http://192.168.x.x`) kamera engellenebilir; bu yüzden telefondan HTTPS adresi (örn. GitHub Pages) kullanın.

## GitHub Pages (yalnızca statik kısım)
Pages sunucu çalıştırmaz. Burada **çalışanlar**: mobil optik okuyucu, stüdyonun tarayıcı tarafı, PWA kurulumu.
**Çalışmayanlar** (Node sunucusu gerekir): online sınav, kiosk kilidi ve `/api/...` uçları.

## Testler
```bash
npm test                 # birim + uçtan uca + doğru şık + OMR + PWA
npm run test:omr         # gerçek basılı form -> fotoğraf -> okuma, standart form
npm run test:dogru-sik   # kağıt <-> cevap anahtarı doğru şık denetimi
npm run test:pwa         # manifest, servis işçisi, çevrimdışı açılış
```
Uçtan uca testler Chrome/Edge ister. Kalite formu örnekleri (`ornek-dosyalar/`) kurumsal belge içerdiğinden depoya konmamıştır; ilgili e2e adımları için kendi örnek `.docx/.xls/.doc/.pdf` dosyalarınızı bu klasöre koyun.

## Güvenlik notları
- Varsayılan demo öğretim elemanı hesabı: kullanıcı `hoca`, parola `Demo!Hoca2026`. **Gerçek kullanımda mutlaka değiştirin.**
- Depoda gerçek öğrenci, sınav sorusu veya cevap anahtarı yoktur; örnek veriler uydurmadır.
- Sunucu istemciden `kagit`, `puan`, `dogruCevap`, `bitisMs` gibi alanları kabul etmez.
