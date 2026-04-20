CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_slug TEXT NOT NULL,
  card_name TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  url TEXT NOT NULL,
  listings_total INTEGER NOT NULL,
  lowest_price REAL,
  third_lowest_price REAL
);

CREATE INDEX IF NOT EXISTS idx_scans_card_time ON scans(card_slug, scraped_at DESC);

CREATE TABLE IF NOT EXISTS scan_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  price REAL NOT NULL,
  seller TEXT,
  country TEXT,
  language TEXT,
  condition TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_listings_scan ON scan_listings(scan_id);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_slug TEXT NOT NULL,
  card_name TEXT NOT NULL,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  baseline_price REAL NOT NULL,
  current_price REAL NOT NULL,
  drop_percent REAL NOT NULL,
  threshold_percent REAL NOT NULL,
  notified INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alerts_card_time ON alerts(card_slug, created_at DESC);
