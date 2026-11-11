-- Evrensel Sınav Kağıdı Stüdyosu & Mobil OMR — Cloudflare D1 Kalıcı Bulut Kasası Şeması
CREATE TABLE IF NOT EXISTS bulut_kasalar (
  kullanici_adi TEXT PRIMARY KEY,
  revizyon_no INTEGER NOT NULL DEFAULT 0,
  veri_json TEXT NOT NULL,
  ozet_bilgi TEXT DEFAULT '',
  guncelleme_ms INTEGER NOT NULL
);

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

CREATE TABLE IF NOT EXISTS sistem_durumu (
  anahtar TEXT PRIMARY KEY,
  deger_json TEXT NOT NULL,
  guncelleme_ms INTEGER NOT NULL
);
