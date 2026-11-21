-- Only signature-verified Discord Activity launch contexts authorize notification channels.
CREATE TABLE IF NOT EXISTS activity_launch_channels (
  user_id TEXT NOT NULL, channel_id TEXT NOT NULL,
  verified_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(user_id,channel_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_activity_launch_verified ON activity_launch_channels(verified_at);
ALTER TABLE queued_orders ADD COLUMN channel_id TEXT;
ALTER TABLE trades ADD COLUMN channel_id TEXT;
CREATE TABLE IF NOT EXISTS trade_notifications (
  trade_id INTEGER PRIMARY KEY REFERENCES trades(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, channel_id TEXT NOT NULL,
  queued INTEGER NOT NULL CHECK(queued IN (0,1)),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','PROCESSING','SENT','BLOCKED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER, discord_message_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_trade_notifications_due ON trade_notifications(status,retry_at,trade_id);
CREATE TRIGGER IF NOT EXISTS trade_notify_after_insert AFTER INSERT ON trades
BEGIN
  INSERT INTO trade_notifications(trade_id,user_id,channel_id,queued)
  SELECT NEW.id,NEW.user_id,
    COALESCE(NEW.channel_id,(SELECT channel_id FROM queued_orders
      WHERE user_id=NEW.user_id AND client_order_id=NEW.client_order_id)),
    CASE WHEN EXISTS(SELECT 1 FROM queued_orders
      WHERE user_id=NEW.user_id AND client_order_id=NEW.client_order_id) THEN 1 ELSE 0 END
  WHERE COALESCE(NEW.channel_id,(SELECT channel_id FROM queued_orders
      WHERE user_id=NEW.user_id AND client_order_id=NEW.client_order_id)) IS NOT NULL;
END;
