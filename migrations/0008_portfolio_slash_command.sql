-- Separate registry for application slash commands. Never changes Launch.
CREATE TABLE IF NOT EXISTS discord_command_registry (
  name TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_result TEXT NOT NULL DEFAULT 'not_run'
);
