CREATE TABLE IF NOT EXISTS players (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  cash_cents INTEGER NOT NULL DEFAULT 1000000 CHECK (cash_cents >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS holdings (
  user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  shares INTEGER NOT NULL CHECK (shares >= 0),
  cost_basis_cents INTEGER NOT NULL CHECK (cost_basis_cents >= 0),
  PRIMARY KEY (user_id, symbol)
);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  client_order_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  shares INTEGER NOT NULL CHECK (shares BETWEEN 1 AND 100000),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  executed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, client_order_id)
);
CREATE INDEX IF NOT EXISTS idx_trades_user_latest ON trades(user_id, executed_at DESC);
CREATE TABLE IF NOT EXISTS quote_cache (
  symbol TEXT PRIMARY KEY,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  previous_close_cents INTEGER NOT NULL CHECK (previous_close_cents > 0),
  fetched_at INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('simulated','finnhub'))
);
-- A trade and both balance updates execute atomically inside SQLite.
-- No client supplied cash, holdings or prices can alter the authoritative ledger.
CREATE TRIGGER IF NOT EXISTS trade_buy_guard BEFORE INSERT ON trades WHEN NEW.side='BUY' BEGIN
  SELECT RAISE(ABORT, 'Insufficient cash')
    WHERE (SELECT cash_cents FROM players WHERE user_id=NEW.user_id) < NEW.shares * NEW.price_cents;
END;
CREATE TRIGGER IF NOT EXISTS trade_sell_guard BEFORE INSERT ON trades WHEN NEW.side='SELL' BEGIN
  SELECT RAISE(ABORT, 'Insufficient shares')
    WHERE COALESCE((SELECT shares FROM holdings WHERE user_id=NEW.user_id AND symbol=NEW.symbol),0) < NEW.shares;
END;
CREATE TRIGGER IF NOT EXISTS trade_buy_fill AFTER INSERT ON trades WHEN NEW.side='BUY' BEGIN
  UPDATE players SET cash_cents=cash_cents-NEW.shares*NEW.price_cents WHERE user_id=NEW.user_id;
  INSERT INTO holdings(user_id,symbol,shares,cost_basis_cents)
    VALUES(NEW.user_id,NEW.symbol,NEW.shares,NEW.shares*NEW.price_cents)
    ON CONFLICT(user_id,symbol) DO UPDATE SET shares=shares+excluded.shares,cost_basis_cents=cost_basis_cents+excluded.cost_basis_cents;
END;
CREATE TRIGGER IF NOT EXISTS trade_sell_fill AFTER INSERT ON trades WHEN NEW.side='SELL' BEGIN
  UPDATE players SET cash_cents=cash_cents+NEW.shares*NEW.price_cents WHERE user_id=NEW.user_id;
  UPDATE holdings SET cost_basis_cents=CAST(ROUND(cost_basis_cents*(shares-NEW.shares)*1.0/shares) AS INTEGER),
    shares=shares-NEW.shares WHERE user_id=NEW.user_id AND symbol=NEW.symbol;
  DELETE FROM holdings WHERE user_id=NEW.user_id AND symbol=NEW.symbol AND shares=0;
END;
