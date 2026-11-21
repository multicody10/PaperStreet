-- Persist paper orders separately from fills. Only trades affect the player ledger.
CREATE TABLE IF NOT EXISTS queued_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  client_order_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
  shares INTEGER NOT NULL CHECK(shares BETWEEN 1 AND 100000),
  kind TEXT NOT NULL CHECK(kind IN ('MARKET','LIMIT','STOP')),
  trigger_price_cents INTEGER CHECK(trigger_price_cents > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','FILLED','CANCELED','REJECTED')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  claimed_at INTEGER,
  last_checked_at INTEGER NOT NULL DEFAULT 0,
  resolved_at INTEGER,
  fill_price_cents INTEGER,
  failure_reason TEXT,
  UNIQUE(user_id,client_order_id),
  CHECK((kind='MARKET' AND trigger_price_cents IS NULL) OR
        (kind IN ('LIMIT','STOP') AND trigger_price_cents IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_queued_orders_pending ON queued_orders(status,created_at,id);
CREATE INDEX IF NOT EXISTS idx_queued_orders_user ON queued_orders(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('UP','DOWN')),
  target_date TEXT NOT NULL,
  base_price_cents INTEGER NOT NULL CHECK(base_price_cents > 0),
  close_price_cents INTEGER,
  outcome TEXT NOT NULL DEFAULT 'PENDING' CHECK(outcome IN ('PENDING','CORRECT','INCORRECT','PUSH')),
  points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  resolved_at INTEGER,
  last_checked_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id,symbol,target_date)
);
CREATE INDEX IF NOT EXISTS idx_predictions_pending ON predictions(outcome,target_date,id);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS player_achievements (
  user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(user_id,code)
);
