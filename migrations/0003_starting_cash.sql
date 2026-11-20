-- Existing traders retain their original $10,000 baseline and balances.
-- The Worker explicitly inserts $1,000 for new players from this migration forward.
ALTER TABLE players ADD COLUMN starting_cash_cents INTEGER NOT NULL DEFAULT 1000000 CHECK (starting_cash_cents > 0);
