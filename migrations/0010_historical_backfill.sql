-- Provider historical candles are for charts only. Live quotes/trades stay Finnhub-only.
CREATE TABLE IF NOT EXISTS historical_ohlc(
  symbol TEXT NOT NULL,
  resolution TEXT NOT NULL CHECK(resolution IN ('daily','weekly')),
  session_date TEXT NOT NULL,
  close_at INTEGER NOT NULL,
  open_cents INTEGER NOT NULL CHECK(open_cents>0),
  high_cents INTEGER NOT NULL CHECK(high_cents>0),
  low_cents INTEGER NOT NULL CHECK(low_cents>0),
  close_cents INTEGER NOT NULL CHECK(close_cents>0),
  PRIMARY KEY(symbol,resolution,session_date),
  CHECK(low_cents<=open_cents AND low_cents<=close_cents AND
    high_cents>=open_cents AND high_cents>=close_cents)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_historical_ohlc_time ON historical_ohlc(symbol,resolution,close_at);
CREATE TABLE IF NOT EXISTS historical_backfill_state(
  symbol TEXT NOT NULL, resolution TEXT NOT NULL,
  next_attempt_at INTEGER NOT NULL, last_success_at INTEGER,
  PRIMARY KEY(symbol,resolution)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS historical_backfill_budget(
  day TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0 CHECK(requests>=0)
) WITHOUT ROWID;
