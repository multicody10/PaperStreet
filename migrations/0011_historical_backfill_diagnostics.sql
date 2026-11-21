-- Make historical provider outcomes visible and unlock failures from the old 24h cooldown.
ALTER TABLE historical_backfill_state ADD COLUMN last_result TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE historical_backfill_state ADD COLUMN last_attempt_at INTEGER;
UPDATE historical_backfill_state SET next_attempt_at=0 WHERE last_success_at IS NULL;
