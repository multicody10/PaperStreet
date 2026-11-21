-- Persistent marker for rate-limited verification of Discord's launch handler.
-- Keeps OAuth and Discord API credentials exclusively in Worker secrets.
CREATE TABLE IF NOT EXISTS service_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  checked_at INTEGER NOT NULL
);
