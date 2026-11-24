-- Additive migration: preserve existing trades, notification foreign keys, and queued orders.
ALTER TABLE players ADD COLUMN margin_debt_cents INTEGER NOT NULL DEFAULT 0 CHECK(margin_debt_cents>=0);
ALTER TABLE trades ADD COLUMN position_effect TEXT NOT NULL DEFAULT 'LONG' CHECK(position_effect IN ('LONG','SHORT') OR (position_effect='LIQUIDATION' AND side='BUY'));
ALTER TABLE queued_orders ADD COLUMN position_effect TEXT NOT NULL DEFAULT 'LONG' CHECK(position_effect IN ('LONG','SHORT'));
CREATE TABLE short_positions (
 user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
 symbol TEXT NOT NULL,
 shares INTEGER NOT NULL CHECK(shares BETWEEN 1 AND 100000),
 cost_basis_cents INTEGER NOT NULL CHECK(cost_basis_cents>=0),
 PRIMARY KEY(user_id,symbol)
);
CREATE INDEX idx_short_positions_symbol ON short_positions(symbol);
DROP TRIGGER trade_buy_guard;
DROP TRIGGER trade_sell_guard;
DROP TRIGGER trade_buy_fill;
DROP TRIGGER trade_sell_fill;
CREATE TRIGGER IF NOT EXISTS trade_buy_guard BEFORE INSERT ON trades WHEN NEW.side='BUY' AND NEW.position_effect='LONG' BEGIN
  SELECT RAISE(ABORT, 'Insufficient cash')
    WHERE (SELECT cash_cents FROM players WHERE user_id=NEW.user_id) < NEW.shares * NEW.price_cents;
END;
CREATE TRIGGER IF NOT EXISTS trade_sell_guard BEFORE INSERT ON trades WHEN NEW.side='SELL' AND NEW.position_effect='LONG' BEGIN
  SELECT RAISE(ABORT, 'Insufficient shares')
    WHERE COALESCE((SELECT shares FROM holdings WHERE user_id=NEW.user_id AND symbol=NEW.symbol),0) < NEW.shares;
END;
CREATE TRIGGER IF NOT EXISTS trade_buy_fill AFTER INSERT ON trades WHEN NEW.side='BUY' AND NEW.position_effect='LONG' BEGIN
  UPDATE players SET cash_cents=cash_cents-NEW.shares*NEW.price_cents WHERE user_id=NEW.user_id;
  INSERT INTO holdings(user_id,symbol,shares,cost_basis_cents)
    VALUES(NEW.user_id,NEW.symbol,NEW.shares,NEW.shares*NEW.price_cents)
    ON CONFLICT(user_id,symbol) DO UPDATE SET shares=shares+excluded.shares,cost_basis_cents=cost_basis_cents+excluded.cost_basis_cents;
END;
CREATE TRIGGER IF NOT EXISTS trade_sell_fill AFTER INSERT ON trades WHEN NEW.side='SELL' AND NEW.position_effect='LONG' BEGIN
  UPDATE players SET cash_cents=cash_cents+NEW.shares*NEW.price_cents WHERE user_id=NEW.user_id;
  UPDATE holdings SET cost_basis_cents=CAST(ROUND(cost_basis_cents*(shares-NEW.shares)*1.0/shares) AS INTEGER),
    shares=shares-NEW.shares WHERE user_id=NEW.user_id AND symbol=NEW.symbol;
  DELETE FROM holdings WHERE user_id=NEW.user_id AND symbol=NEW.symbol AND shares=0;
END;

-- Cash-only collateral: each short locks its proceeds plus equal cash collateral.
-- Existing cash balance remains spendable cash only. Opposite positions cannot coexist.
CREATE TRIGGER long_position_guard BEFORE INSERT ON trades WHEN NEW.position_effect='LONG' AND NEW.side='BUY' BEGIN
 SELECT RAISE(ABORT,'Close short position first') WHERE EXISTS(SELECT 1 FROM short_positions WHERE user_id=NEW.user_id AND symbol=NEW.symbol);
END;
CREATE TRIGGER short_open_guard BEFORE INSERT ON trades WHEN NEW.position_effect='SHORT' AND NEW.side='SELL' BEGIN
 SELECT RAISE(ABORT,'Close long position first') WHERE EXISTS(SELECT 1 FROM holdings WHERE user_id=NEW.user_id AND symbol=NEW.symbol AND shares>0);
 SELECT RAISE(ABORT,'Insufficient cash for short collateral') WHERE (SELECT cash_cents FROM players WHERE user_id=NEW.user_id)<NEW.shares*NEW.price_cents;
 SELECT RAISE(ABORT,'Short position limit exceeded') WHERE COALESCE((SELECT shares FROM short_positions WHERE user_id=NEW.user_id AND symbol=NEW.symbol),0)+NEW.shares>100000;
END;
CREATE TRIGGER short_open_fill AFTER INSERT ON trades WHEN NEW.position_effect='SHORT' AND NEW.side='SELL' BEGIN
 UPDATE players SET cash_cents=cash_cents-NEW.shares*NEW.price_cents WHERE user_id=NEW.user_id;
 INSERT INTO short_positions(user_id,symbol,shares,cost_basis_cents) VALUES(NEW.user_id,NEW.symbol,NEW.shares,NEW.shares*NEW.price_cents)
 ON CONFLICT(user_id,symbol) DO UPDATE SET shares=shares+excluded.shares,cost_basis_cents=cost_basis_cents+excluded.cost_basis_cents;
END;
CREATE TRIGGER short_cover_guard BEFORE INSERT ON trades WHEN NEW.position_effect IN ('SHORT','LIQUIDATION') AND NEW.side='BUY' BEGIN
 SELECT RAISE(ABORT,'Insufficient short shares') WHERE COALESCE((SELECT shares FROM short_positions WHERE user_id=NEW.user_id AND symbol=NEW.symbol),0)<NEW.shares;
END;
CREATE TRIGGER short_cover_fill AFTER INSERT ON trades WHEN NEW.position_effect IN ('SHORT','LIQUIDATION') AND NEW.side='BUY' BEGIN
 UPDATE players SET cash_cents=MAX(0,cash_cents-margin_debt_cents+2*(SELECT cost_basis_cents*NEW.shares/shares FROM short_positions WHERE user_id=NEW.user_id AND symbol=NEW.symbol)-NEW.shares*NEW.price_cents),margin_debt_cents=MAX(0,-(cash_cents-margin_debt_cents+2*(SELECT cost_basis_cents*NEW.shares/shares FROM short_positions WHERE user_id=NEW.user_id AND symbol=NEW.symbol)-NEW.shares*NEW.price_cents)) WHERE user_id=NEW.user_id;
 -- Delete fully covered positions before updating to preserve the positive share constraint.
 DELETE FROM short_positions WHERE user_id=NEW.user_id AND symbol=NEW.symbol AND shares=NEW.shares;
 UPDATE short_positions SET cost_basis_cents=cost_basis_cents-cost_basis_cents*NEW.shares/shares,shares=shares-NEW.shares
 WHERE user_id=NEW.user_id AND symbol=NEW.symbol;
END;
-- Repay gap losses before sale proceeds become spendable. Covers already net debt atomically.
CREATE TRIGGER margin_debt_repayment AFTER UPDATE OF cash_cents ON players WHEN NEW.cash_cents>0 AND NEW.margin_debt_cents>0 BEGIN
 UPDATE players SET cash_cents=MAX(0,NEW.cash_cents-NEW.margin_debt_cents),margin_debt_cents=MAX(0,NEW.margin_debt_cents-NEW.cash_cents) WHERE user_id=NEW.user_id;
END;
