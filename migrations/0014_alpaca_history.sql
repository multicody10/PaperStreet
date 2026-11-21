-- Alpaca IEX OHLC history is isolated from Finnhub quotes used for paper fills.
CREATE TABLE IF NOT EXISTS historical_ohlc (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK(timeframe IN ('15Min','1Day')),
  at INTEGER NOT NULL,
  open_cents INTEGER NOT NULL CHECK(open_cents > 0),
  high_cents INTEGER NOT NULL CHECK(high_cents > 0),
  low_cents INTEGER NOT NULL CHECK(low_cents > 0),
  close_cents INTEGER NOT NULL CHECK(close_cents > 0),
  PRIMARY KEY(symbol,timeframe,at)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS historical_sync (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK(timeframe IN ('15Min','1Day')),
  refreshed_at INTEGER NOT NULL DEFAULT 0,
  retry_after INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(symbol,timeframe)
) WITHOUT ROWID;
