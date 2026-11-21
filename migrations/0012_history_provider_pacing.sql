-- Serialize Alpha Vantage calls across Cloudflare Worker isolates and sessions.
-- Prevent one-per-second burst warnings from being mistaken for daily exhaustion.
CREATE TABLE IF NOT EXISTS historical_provider_pacing(
  id INTEGER PRIMARY KEY CHECK(id=1),
  next_attempt_at INTEGER NOT NULL DEFAULT 0
);
-- Give previously misclassified rate-limit responses one fresh attempt.
-- The shared 3-second gate and 20/day quota still enforce provider safety.
UPDATE historical_backfill_state
SET next_attempt_at=0, last_result='pending'
WHERE last_result='rate_limited' AND last_success_at IS NULL;
