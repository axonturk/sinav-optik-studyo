-- Evrensel Sınav Kağıdı Stüdyosu & Mobil OMR — Cloudflare D1 Kalıcı Bulut Kasası ve Oturum Şeması
CREATE TABLE IF NOT EXISTS bulut_kasalar (
  kullanici_adi TEXT PRIMARY KEY,
  revizyon_no INTEGER NOT NULL DEFAULT 0,
  veri_json TEXT NOT NULL,
  ozet_bilgi TEXT DEFAULT '',
  guncelleme_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bulut_kasalar_guncelleme
  ON bulut_kasalar(guncelleme_ms DESC);

CREATE TABLE IF NOT EXISTS bulut_yedek_gecmisi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_adi TEXT NOT NULL,
  revizyon_no INTEGER NOT NULL,
  islem_notu TEXT DEFAULT '',
  veri_json TEXT NOT NULL,
  olusturma_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bulut_gecmis_kullanici
  ON bulut_yedek_gecmisi(kullanici_adi, id DESC);

CREATE INDEX IF NOT EXISTS idx_bulut_gecmis_olusturma
  ON bulut_yedek_gecmisi(olusturma_ms DESC);

CREATE TABLE IF NOT EXISTS sistem_durumu (
  anahtar TEXT PRIMARY KEY,
  deger_json TEXT NOT NULL,
  guncelleme_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sistem_durumu_guncelleme
  ON sistem_durumu(guncelleme_ms DESC);

-- Öğretmen oturumları ve token iptal (revocation) tablosu
CREATE TABLE IF NOT EXISTS hoca_oturumlari (
  token_hash TEXT PRIMARY KEY,
  kullanici_adi TEXT NOT NULL,
  ad_soyad TEXT NOT NULL DEFAULT '',
  rol TEXT NOT NULL DEFAULT 'hoca',
  olusturma_ms INTEGER NOT NULL,
  son_erisim_ms INTEGER NOT NULL,
  bitis_ms INTEGER NOT NULL,
  iptal INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hoca_oturum_kullanici
  ON hoca_oturumlari(kullanici_adi, iptal);

CREATE INDEX IF NOT EXISTS idx_hoca_oturum_bitis
  ON hoca_oturumlari(bitis_ms);

-- Öğrenci online sınav oturumları (tekil oturum kilidi + kurtarma anahtarı)
CREATE TABLE IF NOT EXISTS ogrenci_oturumlari (
  token_hash TEXT PRIMARY KEY,
  sinav_id TEXT NOT NULL,
  sinav_surum_id TEXT NOT NULL,
  ogr_no TEXT NOT NULL,
  kurtarma_anahtari_hash TEXT NOT NULL DEFAULT '',
  durum_json TEXT NOT NULL,
  bitis_ms INTEGER NOT NULL,
  bitti INTEGER NOT NULL DEFAULT 0,
  guncelleme_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ogrenci_oturum_sinav_ogr
  ON ogrenci_oturumlari(sinav_id, sinav_surum_id, ogr_no);

CREATE INDEX IF NOT EXISTS idx_ogrenci_oturum_bitis
  ON ogrenci_oturumlari(bitis_ms);

-- Hız sınırı (Rate limit) sayaçları
CREATE TABLE IF NOT EXISTS hiz_sinirlari (
  anahtar TEXT PRIMARY KEY,
  sayac INTEGER NOT NULL DEFAULT 0,
  pencere_baslangic_ms INTEGER NOT NULL,
  guncelleme_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hiz_sinirlari_pencere
  ON hiz_sinirlari(pencere_baslangic_ms);

-- Kısa ömürlü mobil OMR eşleştirme token kayıtları
CREATE TABLE IF NOT EXISTS omr_eslesme_tokenlari (
  token_id TEXT PRIMARY KEY,
  kullanici_adi TEXT NOT NULL,
  oturum_kodu TEXT NOT NULL DEFAULT 'GENEL',
  olusturma_ms INTEGER NOT NULL,
  bitis_ms INTEGER NOT NULL,
  iptal INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_omr_eslesme_bitis
  ON omr_eslesme_tokenlari(bitis_ms, iptal);

-- V2 Hafif Mobil Ders / Sınav Paketleri (Tek Bağlantı QR sonrası buluttan çekilir)
CREATE TABLE IF NOT EXISTS mobil_sinav_paketleri (
  paket_anahtari TEXT PRIMARY KEY,
  kullanici_adi TEXT NOT NULL,
  sinav_kodu TEXT NOT NULL,
  ders_id TEXT NOT NULL DEFAULT '',
  ders_adi TEXT NOT NULL DEFAULT '',
  baslik TEXT NOT NULL DEFAULT '',
  paket_json TEXT NOT NULL,
  paket_hash TEXT NOT NULL DEFAULT '',
  guncelleme_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mobil_paket_kullanici
  ON mobil_sinav_paketleri(kullanici_adi, guncelleme_ms DESC);

-- V2 Kayıpsız Delta Senkron Olay Günlüğü (Idempotent & Non-Destructive)
CREATE TABLE IF NOT EXISTS omr_senkron_olaylari (
  seq_no INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_adi TEXT NOT NULL,
  event_id TEXT NOT NULL,
  sinav_kodu TEXT NOT NULL,
  olay_turu TEXT NOT NULL,
  kaynak_cihaz TEXT NOT NULL DEFAULT 'mobil',
  veri_json TEXT NOT NULL,
  zaman_ms INTEGER NOT NULL,
  UNIQUE(kullanici_adi, event_id)
);

CREATE INDEX IF NOT EXISTS idx_omr_senkron_cursor
  ON omr_senkron_olaylari(kullanici_adi, seq_no);

CREATE INDEX IF NOT EXISTS idx_omr_senkron_sinav
  ON omr_senkron_olaylari(kullanici_adi, sinav_kodu, seq_no);
