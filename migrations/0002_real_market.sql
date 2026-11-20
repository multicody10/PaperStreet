-- Keep existing virtual ledgers and old simulated quotes for historical trade audit.
-- Runtime reads only Finnhub quotes; no simulated quote can ever be used for fills.
ALTER TABLE quote_cache ADD COLUMN provider_at INTEGER;
CREATE TABLE IF NOT EXISTS quote_refresh_lock (
  symbol TEXT PRIMARY KEY,
  lease_until INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS quote_history (
  symbol TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  price_cents INTEGER NOT NULL CHECK(price_cents > 0),
  PRIMARY KEY(symbol, observed_at)
) WITHOUT ROWID;
